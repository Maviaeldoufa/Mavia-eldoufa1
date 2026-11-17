import { execFile } from 'child_process';
import crypto from 'crypto';
import { Router } from 'express';
import fs from 'fs';
import multer from 'multer';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import { requireAuth, requirePermission } from '../auth.ts';
import type { AuthenticatedRequest } from '../auth.ts';
import { db, getUserRankBadge } from '../db.ts';
import { saveUploadedBuffer, sanitizeUploadExtension } from '../storage.ts';
import type { AcademicYear, ChatMessage, GpaCourseEntry } from '../types.ts';
import { broadcastChatMessage } from '../wsHub.ts';

const execFileAsync = promisify(execFile);

const router = Router();
const ALLOWED_CHAT_ROOMS = new Set(['general', 'year-1', 'year-2', 'year-3', 'year-4']);
const ALLOWED_AUDIO_EXTS = new Set([
  '.mp3',
  '.wav',
  '.m4a',
  '.aac',
  '.ogg',
  '.opus',
  '.webm',
  '.flac',
  '.mp4',
  '.3gp',
  '.amr',
]);

const uploadChatAudio = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
}).single('audio');

function safeUnlink(filePath?: string) {
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // Ignore cleanup errors
  }
}

router.get('/community/groups', requireAuth, (_req, res) => {
  const store = db.get();
  res.json({ groups: store.groupLinks });
});

router.post('/community/groups', requireAuth, requirePermission('manage_community'), (req, res) => {
  const { title, url, platform, year, description } = req.body as {
    title?: string;
    url?: string;
    platform?: 'WhatsApp' | 'Telegram' | 'Discord' | 'Other';
    year?: number;
    description?: string;
  };

  if (!title?.trim() || !url?.trim()) {
    res.status(400).json({ error: 'يرجى إدخال اسم الجروب والرابط المباشر.' });
    return;
  }

  const rawUrl = url.trim();
  if (/^(javascript|data|vbscript):/i.test(rawUrl)) {
    res.status(400).json({ error: 'صيغة الرابط غير مسموحة.' });
    return;
  }
  const normalizedUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
  try {
    const parsed = new URL(normalizedUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      res.status(400).json({ error: 'يجب أن يكون الرابط http أو https.' });
      return;
    }
  } catch {
    res.status(400).json({ error: 'الرابط غير صالح.' });
    return;
  }

  const parsedYear = Number(year || 0);
  const validYear = ([0, 1, 2, 3, 4].includes(parsedYear) ? parsedYear : 0) as AcademicYear | 0;

  const store = db.get();
  const newGroup = {
    id: `grp-${crypto.randomUUID()}`,
    title: title.trim(),
    url: normalizedUrl,
    platform: platform || 'Telegram',
    year: validYear,
    description: description?.trim() || 'جروب تواصل للدفعة على منصة MAVIA.',
    createdAt: new Date().toISOString(),
  };

  store.groupLinks.unshift(newGroup);
  db.save();

  res.status(201).json({ group: newGroup });
});

router.delete('/community/groups/:id', requireAuth, requirePermission('manage_community'), (req, res) => {
  const { id } = req.params;
  const store = db.get();
  store.groupLinks = store.groupLinks.filter((g) => g.id !== id);
  db.save();
  res.json({ ok: true });
});

router.get('/community/chat/:room', requireAuth, (req, res) => {
  const { room } = req.params;
  if (!ALLOWED_CHAT_ROOMS.has(room)) {
    res.status(400).json({ error: 'غرفة الشات غير صالحة.' });
    return;
  }
  const store = db.get();
  const messages = store.chatMessages
    .filter((m) => m.room === room)
    .slice(-100)
    .map((m) => {
      const sender = store.users.find((u) => u.id === m.userId);
      return {
        ...m,
        rankBadge: sender ? getUserRankBadge(sender) : m.rankBadge,
      };
    });
  res.json({ messages });
});

router.post('/community/chat/:room', requireAuth, (req: AuthenticatedRequest, res) => {
  const { room } = req.params;
  if (!ALLOWED_CHAT_ROOMS.has(room)) {
    res.status(400).json({ error: 'غرفة الشات غير صالحة.' });
    return;
  }

  const { text } = req.body as { text?: string };
  const cleanText = typeof text === 'string' ? text.trim().slice(0, 1000) : '';
  if (!cleanText) {
    res.status(400).json({ error: 'يرجى كتابة نص الرسالة.' });
    return;
  }

  const currentUser = req.currentUser!;
  const msg: ChatMessage = {
    id: `msg-${crypto.randomUUID()}`,
    room,
    userId: currentUser.id,
    userName: currentUser.name,
    userRole: currentUser.role,
    userYear: currentUser.year,
    rankBadge: getUserRankBadge(currentUser),
    text: cleanText,
    createdAt: new Date().toISOString(),
  };

  const store = db.get();
  store.chatMessages.push(msg);
  if (store.chatMessages.length > 1000) {
    store.chatMessages = store.chatMessages.slice(-800);
  }
  db.save();

  broadcastChatMessage(msg);
  res.status(201).json({ message: msg });
});

router.post(
  '/community/chat/:room/audio',
  requireAuth,
  (req, res, next) => {
    uploadChatAudio(req, res, (err) => {
      if (err) {
        res.status(400).json({
          error:
            err.message || 'تعذر رفع الملف الصوتي (الحد الأقصى 25 ميجابايت).',
        });
        return;
      }
      next();
    });
  },
  async (req: AuthenticatedRequest, res, next) => {
    let rawTmpPath: string | undefined;
    let outTmpPath: string | undefined;

    try {
      const { room } = req.params;
      const uploaded = req.file;

      if (!ALLOWED_CHAT_ROOMS.has(room)) {
        res.status(400).json({ error: 'غرفة الشات غير صالحة.' });
        return;
      }

      if (!uploaded) {
        res.status(400).json({ error: 'يرجى إرفاق ملف صوتي أو تسجيل ريكورد أولاً.' });
        return;
      }

      const ext = sanitizeUploadExtension(uploaded.originalname, '.webm');
      const mime = (uploaded.mimetype || '').toLowerCase();
      const isAllowedAudio =
        ALLOWED_AUDIO_EXTS.has(ext) ||
        mime.startsWith('audio/') ||
        mime === 'video/webm' ||
        mime === 'video/mp4';

      if (!isAllowedAudio) {
        res.status(400).json({
          error: 'نوع الملف غير مدعوم. يُسمح فقط بالملفات الصوتية أو تسجيلات الريكورد.',
        });
        return;
      }

      const tmpDir = os.tmpdir();
      const stamp = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
      rawTmpPath = path.join(tmpDir, `chat-raw-${stamp}${ext}`);
      outTmpPath = path.join(tmpDir, `chat-audio-${stamp}.mp3`);
      fs.writeFileSync(rawTmpPath, uploaded.buffer);

      let finalBuffer = uploaded.buffer;
      let finalExt = ext;
      let finalMime = mime || 'audio/mpeg';
      let probePath = rawTmpPath;

      try {
        await execFileAsync('ffmpeg', [
          '-y',
          '-i',
          rawTmpPath,
          '-vn',
          '-c:a',
          'libmp3lame',
          '-b:a',
          '128k',
          '-ar',
          '44100',
          outTmpPath,
        ]);
        finalBuffer = fs.readFileSync(outTmpPath);
        finalExt = '.mp3';
        finalMime = 'audio/mpeg';
        probePath = outTmpPath;
      } catch (transcodeErr: unknown) {
        const code = (transcodeErr as NodeJS.ErrnoException)?.code;
        if (code === 'ENOENT') {
          // Serverless environment without ffmpeg binary: keep original playable audio format
          finalBuffer = uploaded.buffer;
          finalExt = ext;
          finalMime =
            ext === '.mp3'
              ? 'audio/mpeg'
              : mime || 'audio/webm';
        } else {
          res.status(400).json({
            error: 'تعذر تحويل التسجيل أو الملف الصوتي إلى صيغة متوافقة. تأكد أن الملف يحتوي على صوت صالح.',
          });
          return;
        }
      }

      let durationSeconds = Math.max(
        0,
        Math.min(3600, Math.round(Number(req.body?.durationSeconds) || 0))
      );
      try {
        const { stdout } = await execFileAsync('ffprobe', [
          '-v',
          'error',
          '-show_entries',
          'format=duration',
          '-of',
          'default=noprint_wrappers=1:nokey=1',
          probePath,
        ]);
        const probed = Math.round(Number(stdout.trim()));
        if (Number.isFinite(probed) && probed > 0) {
          durationSeconds = Math.min(3600, probed);
        }
      } catch {
        // Keep client-supplied duration if ffprobe unavailable
      }

      const storedAudio = await saveUploadedBuffer({
        buffer: finalBuffer,
        originalName: `voice-note${finalExt}`,
        mimeType: finalMime,
        folderPrefix: 'chat-audio',
      });

      const decodedOriginal = uploaded.originalname
        ? Buffer.from(uploaded.originalname, 'latin1').toString('utf8')
        : `voice-note${finalExt}`;
      const baseLabel =
        path.basename(decodedOriginal, path.extname(decodedOriginal)).trim() ||
        'voice-note';
      const friendlyDownloadName = `${baseLabel.replace(/[^\w\u0600-\u06FF\s.-]/g, '_')}${finalExt}`;

      const caption =
        typeof req.body?.text === 'string' ? req.body.text.trim().slice(0, 500) : '';

      const currentUser = req.currentUser!;
      const msg: ChatMessage = {
        id: `msg-${crypto.randomUUID()}`,
        room,
        userId: currentUser.id,
        userName: currentUser.name,
        userRole: currentUser.role,
        userYear: currentUser.year,
        rankBadge: getUserRankBadge(currentUser),
        text: caption,
        audioUrl: storedAudio.fileUrl,
        audioName: friendlyDownloadName,
        audioMimeType: finalMime,
        audioSize: finalBuffer.length,
        audioDurationSeconds: durationSeconds > 0 ? durationSeconds : undefined,
        createdAt: new Date().toISOString(),
      };

      const store = db.get();
      store.chatMessages.push(msg);
      if (store.chatMessages.length > 1000) {
        store.chatMessages = store.chatMessages.slice(-800);
      }
      db.save();

      broadcastChatMessage(msg);
      res.status(201).json({ message: msg });
    } catch (err) {
      next(err);
    } finally {
      safeUnlink(rawTmpPath);
      safeUnlink(outTmpPath);
    }
  }
);

router.get('/gpa', requireAuth, (req: AuthenticatedRequest, res) => {
  const store = db.get();
  const entries = store.gpaTables[req.currentUser!.id] || [];
  res.json({ entries });
});

router.put('/gpa', requireAuth, (req: AuthenticatedRequest, res) => {
  const { entries } = req.body as { entries?: GpaCourseEntry[] };
  if (!Array.isArray(entries) || entries.length > 30) {
    res.status(400).json({ error: 'بيانات الجدول غير صالحة.' });
    return;
  }

  const sanitized: GpaCourseEntry[] = entries.map((entry, idx) => ({
    id:
      typeof entry?.id === 'string' && entry.id.trim()
        ? entry.id.trim().slice(0, 64)
        : `gpa-${idx + 1}`,
    name:
      typeof entry?.name === 'string'
        ? entry.name.trim().slice(0, 120)
        : `مادة ${idx + 1}`,
    credits: Math.max(0, Math.min(12, Number(entry?.credits) || 0)),
    coursework: Math.max(0, Math.min(100, Number(entry?.coursework) || 0)),
    midterm: Math.max(0, Math.min(100, Number(entry?.midterm) || 0)),
    finalExam: Math.max(0, Math.min(100, Number(entry?.finalExam) || 0)),
    includeInGpa: entry?.includeInGpa !== false,
  }));

  const store = db.get();
  store.gpaTables[req.currentUser!.id] = sanitized;
  db.save();
  res.json({ entries: sanitized });
});

export default router;
