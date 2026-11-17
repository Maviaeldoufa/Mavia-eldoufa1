import crypto from 'crypto';
import { Router } from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { requireAuth, requirePermission } from '../auth.ts';
import type { AuthenticatedRequest } from '../auth.ts';
import { db, pushNotification, UPLOADS_DIR } from '../db.ts';
import type { AcademicYear, LectureNote } from '../types.ts';

const router = Router();

const diskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.bin';
    const safeName = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
    cb(null, safeName);
  },
});

const uploadLectureFiles = multer({
  storage: diskStorage,
  limits: { fileSize: 250 * 1024 * 1024 },
}).fields([
  { name: 'video', maxCount: 1 },
  { name: 'subtitle', maxCount: 1 },
  { name: 'attachment', maxCount: 1 },
]);

function removeUploadedFile(fileUrl?: string) {
  if (!fileUrl || !fileUrl.startsWith('/uploads/')) return;
  const filePath = path.join(UPLOADS_DIR, path.basename(fileUrl));
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch {
      // Ignore cleanup error
    }
  }
}

function convertSrtFileToVtt(filePath: string): string {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const vttBody = raw
    .replace(/\r\n/g, '\n')
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
  const vttContent = vttBody.trimStart().startsWith('WEBVTT')
    ? vttBody
    : `WEBVTT\n\n${vttBody}`;
  const vttPath = filePath.replace(/\.srt$/i, '.vtt');
  fs.writeFileSync(vttPath, vttContent, 'utf-8');
  try {
    fs.unlinkSync(filePath);
  } catch {
    // Ignore
  }
  return path.basename(vttPath);
}

// Learning Links
router.get('/learning', requireAuth, (_req, res) => {
  const store = db.get();
  res.json({ links: store.learningLinks });
});

router.post('/learning', requireAuth, requirePermission('manage_learning'), (req: AuthenticatedRequest, res) => {
  const { title, url, type, category, year, description } = req.body as {
    title?: string;
    url?: string;
    type?: 'youtube' | 'platform';
    category?: 'GIS' | 'Programming' | 'General';
    year?: number;
    description?: string;
  };

  if (!title?.trim() || !url?.trim()) {
    res.status(400).json({ error: 'يرجى إدخال عنوان الرابط وعنوان URL.' });
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
  const newLink = {
    id: `learn-${crypto.randomUUID()}`,
    title: title.trim(),
    url: normalizedUrl,
    type: type === 'platform' ? ('platform' as const) : ('youtube' as const),
    category: category || 'GIS',
    year: validYear,
    description: description?.trim() || 'مصدر تعليمي مضاف بواسطة إدارة MAVIA.',
    createdAt: new Date().toISOString(),
  };

  store.learningLinks.unshift(newLink);
  db.save();

  pushNotification({
    title: `مصدر تعليمي جديد: ${newLink.title}`,
    message: 'تمت إضافة رابط شرح جديد في مكتبة Learning.',
    type: 'lecture',
    targetSection: 'learning',
    year: validYear,
    createdBy: req.currentUser!.name,
  });

  res.status(201).json({ link: newLink });
});

router.delete('/learning/:id', requireAuth, requirePermission('manage_learning'), (req, res) => {
  const { id } = req.params;
  const store = db.get();
  store.learningLinks = store.learningLinks.filter((l) => l.id !== id);
  db.save();
  res.json({ ok: true });
});

// Pro Lecture Videos + Auto Resume + Captions + Notes + Allowed Downloads
router.get('/lectures', requireAuth, (req: AuthenticatedRequest, res) => {
  const store = db.get();
  const userId = req.currentUser!.id;
  const userProgressMap = store.lectureProgress?.[userId] || {};

  const lectures = (store.lectures || []).map((lec) => {
    const prog = userProgressMap[lec.id];
    return {
      ...lec,
      // Hide downloadable attachment info if allowDownload is false and user is not admin
      attachmentUrl:
        lec.allowDownload || req.currentUser!.role === 'admin'
          ? lec.attachmentUrl
          : undefined,
      attachmentName:
        lec.allowDownload || req.currentUser!.role === 'admin'
          ? lec.attachmentName
          : undefined,
      myProgress: prog || {
        lastPositionSeconds: 0,
        playbackRate: 1,
        updatedAt: lec.createdAt,
        notes: [],
      },
    };
  });

  res.json({ lectures });
});

router.post(
  '/lectures',
  requireAuth,
  requirePermission('manage_learning'),
  (req, res, next) => {
    uploadLectureFiles(req, res, (err) => {
      if (err) {
        res.status(400).json({ error: err.message || 'تعذر رفع ملفات المحاضرة.' });
        return;
      }
      next();
    });
  },
  (req: AuthenticatedRequest, res) => {
    const {
      title,
      description,
      category,
      year,
      instructor,
      videoUrl,
      allowDownload,
      subtitlesText,
    } = req.body as {
      title?: string;
      description?: string;
      category?: 'GIS' | 'Programming' | 'General';
      year?: string | number;
      instructor?: string;
      videoUrl?: string;
      allowDownload?: string | boolean;
      subtitlesText?: string;
    };

    if (!title?.trim()) {
      res.status(400).json({ error: 'يرجى كتابة عنوان المحاضرة.' });
      return;
    }

    const files = (req.files || {}) as Record<string, Express.Multer.File[]>;
    const videoFile = files.video?.[0];
    const subtitleFile = files.subtitle?.[0];
    const attachmentFile = files.attachment?.[0];

    const finalVideoUrl = videoFile
      ? `/uploads/${videoFile.filename}`
      : videoUrl?.trim();

    if (!finalVideoUrl) {
      res.status(400).json({ error: 'يرجى رفع ملف فيديو أو إدخال رابط فيديو مباشر.' });
      return;
    }

    if (
      !videoFile &&
      !finalVideoUrl.startsWith('/uploads/') &&
      !finalVideoUrl.startsWith('/assets/') &&
      !/^https?:\/\//i.test(finalVideoUrl)
    ) {
      res.status(400).json({ error: 'رابط الفيديو يجب أن يبدأ بـ http:// أو https://.' });
      return;
    }

    let finalSubtitleUrl: string | undefined;
    if (subtitleFile) {
      if (subtitleFile.filename.toLowerCase().endsWith('.srt')) {
        const convertedName = convertSrtFileToVtt(subtitleFile.path);
        finalSubtitleUrl = `/uploads/${convertedName}`;
      } else {
        finalSubtitleUrl = `/uploads/${subtitleFile.filename}`;
      }
    } else if (subtitlesText?.trim()) {
      const vttName = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.vtt`;
      const content = subtitlesText.trimStart().startsWith('WEBVTT')
        ? subtitlesText.trim()
        : `WEBVTT\n\n00:00.000 --> 00:30.000\n${subtitlesText.trim()}`;
      fs.writeFileSync(path.join(UPLOADS_DIR, vttName), content, 'utf-8');
      finalSubtitleUrl = `/uploads/${vttName}`;
    }

    const parsedYear = Number(year || 0);
    const validYear = ([0, 1, 2, 3, 4].includes(parsedYear) ? parsedYear : 0) as AcademicYear | 0;

    const canDownload =
      allowDownload === true ||
      allowDownload === 'true' ||
      allowDownload === '1';

    const store = db.get();
    if (!store.lectures) {
      store.lectures = [];
    }

    const lecture = {
      id: `lec-${crypto.randomUUID()}`,
      title: title.trim(),
      description: description?.trim() || 'محاضرة فيديو مسجلة على منصة MAVIA.',
      category: category || 'GIS',
      year: validYear,
      instructor: instructor?.trim() || req.currentUser!.name,
      videoUrl: finalVideoUrl,
      subtitleUrl: finalSubtitleUrl,
      attachmentUrl: attachmentFile ? `/uploads/${attachmentFile.filename}` : undefined,
      attachmentName: attachmentFile
        ? Buffer.from(attachmentFile.originalname, 'latin1').toString('utf8')
        : undefined,
      attachmentSize: attachmentFile ? attachmentFile.size : undefined,
      allowDownload: canDownload,
      createdBy: req.currentUser!.name,
      createdAt: new Date().toISOString(),
    };

    store.lectures.unshift(lecture);
    db.save();

    pushNotification({
      title: `محاضرة فيديو جديدة: ${lecture.title}`,
      message: 'يمكنك الآن مشاهدتها في مشغل المحاضرات الاحترافي بقسم Learning.',
      type: 'lecture',
      targetSection: 'learning',
      year: validYear,
      createdBy: req.currentUser!.name,
    });

    res.status(201).json({
      lecture: {
        ...lecture,
        myProgress: {
          lastPositionSeconds: 0,
          playbackRate: 1,
          updatedAt: lecture.createdAt,
          notes: [],
        },
      },
    });
  }
);

router.patch(
  '/lectures/:id/download-permission',
  requireAuth,
  requirePermission('manage_learning'),
  (req, res) => {
    const { id } = req.params;
    const { allowDownload } = req.body as { allowDownload?: boolean };
    const store = db.get();
    const lecture = (store.lectures || []).find((l) => l.id === id);
    if (!lecture) {
      res.status(404).json({ error: 'المحاضرة غير موجودة.' });
      return;
    }
    lecture.allowDownload = Boolean(allowDownload);
    db.save();
    res.json({ lecture });
  }
);

router.delete('/lectures/:id', requireAuth, requirePermission('manage_learning'), (req, res) => {
  const { id } = req.params;
  const store = db.get();
  const target = (store.lectures || []).find((l) => l.id === id);
  if (!target) {
    res.status(404).json({ error: 'المحاضرة غير موجودة.' });
    return;
  }
  removeUploadedFile(target.videoUrl);
  removeUploadedFile(target.subtitleUrl);
  removeUploadedFile(target.attachmentUrl);
  store.lectures = (store.lectures || []).filter((l) => l.id !== id);
  db.save();
  res.json({ ok: true });
});

// Save auto-resume position and playback rate
router.put('/lectures/:id/progress', requireAuth, (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const { lastPositionSeconds, playbackRate } = req.body as {
    lastPositionSeconds?: number;
    playbackRate?: number;
  };
  const store = db.get();
  const exists = (store.lectures || []).some((l) => l.id === id);
  if (!exists) {
    res.status(404).json({ error: 'المحاضرة غير موجودة.' });
    return;
  }

  if (!store.lectureProgress) {
    store.lectureProgress = {};
  }
  if (!store.lectureProgress[req.currentUser!.id]) {
    store.lectureProgress[req.currentUser!.id] = {};
  }

  const current = store.lectureProgress[req.currentUser!.id][id] || {
    lastPositionSeconds: 0,
    playbackRate: 1,
    updatedAt: new Date().toISOString(),
    notes: [],
  };

  if (typeof lastPositionSeconds === 'number' && lastPositionSeconds >= 0) {
    current.lastPositionSeconds = Math.floor(lastPositionSeconds);
  }
  if (typeof playbackRate === 'number' && playbackRate >= 0.25 && playbackRate <= 3) {
    current.playbackRate = playbackRate;
  }
  current.updatedAt = new Date().toISOString();

  store.lectureProgress[req.currentUser!.id][id] = current;
  db.save();

  res.json({ progress: current });
});

// Add personal timestamped lecture note
router.post('/lectures/:id/notes', requireAuth, (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const { timestampSeconds, text } = req.body as {
    timestampSeconds?: number;
    text?: string;
  };

  if (!text?.trim()) {
    res.status(400).json({ error: 'يرجى كتابة نص الملاحظة.' });
    return;
  }

  const store = db.get();
  if (!(store.lectures || []).some((l) => l.id === id)) {
    res.status(404).json({ error: 'المحاضرة غير موجودة.' });
    return;
  }

  if (!store.lectureProgress) {
    store.lectureProgress = {};
  }
  if (!store.lectureProgress[req.currentUser!.id]) {
    store.lectureProgress[req.currentUser!.id] = {};
  }

  const current = store.lectureProgress[req.currentUser!.id][id] || {
    lastPositionSeconds: 0,
    playbackRate: 1,
    updatedAt: new Date().toISOString(),
    notes: [],
  };

  const note: LectureNote = {
    id: `note-${crypto.randomUUID()}`,
    timestampSeconds: Math.max(0, Math.floor(Number(timestampSeconds) || 0)),
    text: text.trim(),
    createdAt: new Date().toISOString(),
  };

  current.notes.unshift(note);
  current.updatedAt = new Date().toISOString();
  store.lectureProgress[req.currentUser!.id][id] = current;
  db.save();

  res.status(201).json({ note, notes: current.notes });
});

router.delete(
  '/lectures/:id/notes/:noteId',
  requireAuth,
  (req: AuthenticatedRequest, res) => {
    const { id, noteId } = req.params;
    const store = db.get();
    const current = store.lectureProgress?.[req.currentUser!.id]?.[id];
    if (!current) {
      res.json({ notes: [] });
      return;
    }
    current.notes = current.notes.filter((n) => n.id !== noteId);
    db.save();
    res.json({ notes: current.notes });
  }
);

export default router;
