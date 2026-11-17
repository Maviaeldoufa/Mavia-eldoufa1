import { Router } from 'express';
import { requireAuth } from '../auth.ts';
import type { AuthenticatedRequest } from '../auth.ts';
import {
  db,
  hashPassword,
  isUserSuperAdmin,
  recordAdminAudit,
  toSafeUser,
  verifyPassword,
} from '../db.ts';
import { checkLoginLockout, clearLoginFailures, recordFailedLogin } from '../rateLimit.ts';
import type { AcademicYear, NoteReactionEmoji } from '../types.ts';

const router = Router();
const ALLOWED_NOTE_REACTIONS = new Set<NoteReactionEmoji>([
  '👍',
  '❤️',
  '👏',
  '🔥',
  '💡',
  '✅',
]);

function getClientIp(req: AuthenticatedRequest): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim()) {
    return fwd.split(',')[0].trim();
  }
  return req.ip || 'unknown';
}

// Update own profile (name and academic year only for regular users; email & password locked after registration)
router.patch('/account/profile', requireAuth, (req: AuthenticatedRequest, res) => {
  const { name, year, email, currentPassword, newPassword } = req.body as {
    name?: string;
    year?: number;
    email?: string;
    currentPassword?: string;
    newPassword?: string;
  };

  const user = req.currentUser!;
  const callerIsSuperAdmin = isUserSuperAdmin(user);

  if (
    !callerIsSuperAdmin &&
    (email !== undefined || (newPassword !== undefined && newPassword.length > 0))
  ) {
    res.status(403).json({
      error:
        'لا يمكن تعديل البريد الإلكتروني أو كلمة المرور بعد التسجيل — هذه الصلاحية متاحة لمدير المنصة العام فقط.',
    });
    return;
  }

  if (name !== undefined) {
    const cleanName = name.trim();
    if (cleanName.length < 2 || cleanName.length > 80) {
      res.status(400).json({ error: 'الاسم يجب أن يكون بين حرفين و80 حرفاً.' });
      return;
    }
    user.name = cleanName;
  }

  if (year !== undefined) {
    const parsedYear = Number(year) as AcademicYear;
    if (![1, 2, 3, 4].includes(parsedYear)) {
      res.status(400).json({ error: 'السنة الدراسية غير صالحة.' });
      return;
    }
    user.year = parsedYear;
  }

  if (callerIsSuperAdmin && email !== undefined) {
    const cleanEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      res.status(400).json({ error: 'صيغة البريد الإلكتروني غير صحيحة.' });
      return;
    }
    const store = db.get();
    if (store.users.some((u) => u.id !== user.id && (u.email || '').toLowerCase() === cleanEmail)) {
      res.status(409).json({ error: 'البريد الإلكتروني مستخدم بالفعل في حساب آخر.' });
      return;
    }
    user.email = cleanEmail;
  }

  if (callerIsSuperAdmin && newPassword !== undefined && newPassword.length > 0) {
    if (!currentPassword) {
      res.status(400).json({ error: 'يرجى إدخال كلمة المرور الحالية أولاً.' });
      return;
    }
    if (!verifyPassword(currentPassword, user.passwordHash)) {
      res.status(401).json({ error: 'كلمة المرور الحالية غير صحيحة.' });
      return;
    }
    if (newPassword.length < 4) {
      res.status(400).json({ error: 'كلمة المرور الجديدة يجب أن تكون 4 أحرف على الأقل.' });
      return;
    }
    user.passwordHash = hashPassword(newPassword);
  }

  db.save();
  res.json({ user: toSafeUser(user) });
});

// Activate admin privilege on the logged-in account using Super Admin's custom activation password
router.post('/account/activate-admin', requireAuth, (req: AuthenticatedRequest, res) => {
  const { password } = req.body as { password?: string };
  const user = req.currentUser!;
  const cleanPass = password?.trim() || '';

  if (!cleanPass) {
    res.status(400).json({ error: 'يرجى إدخال كلمة سر تفعيل صلاحية الأدمن.' });
    return;
  }

  const attemptKey = `activate-admin:${user.id}`;
  const lockout = checkLoginLockout(attemptKey);
  if (lockout.locked) {
    const minutes = Math.max(1, Math.ceil(lockout.retryAfterSeconds / 60));
    res.setHeader('Retry-After', String(lockout.retryAfterSeconds));
    res.status(429).json({
      error: `تم قفل محاولات التفعيل مؤقتاً بسبب تكرار كلمات سر خاطئة. حاول بعد ${minutes} دقيقة.`,
      retryAfterSeconds: lockout.retryAfterSeconds,
    });
    return;
  }

  const store = db.get();
  const configuredHash = store.platformConfig?.adminActivationPasswordHash;
  if (!configuredHash) {
    res.status(403).json({
      error: 'تفعيل صلاحية الأدمن بكلمة السر غير مفعّل حالياً من قِبل مدير المنصة.',
    });
    return;
  }

  if (!verifyPassword(cleanPass, configuredHash)) {
    const failState = recordFailedLogin(attemptKey);
    res.status(403).json({
      error: `كلمة سر تفعيل صلاحية الأدمن غير صحيحة. المحاولات المتبقية: ${failState.remainingAttempts}.`,
    });
    return;
  }

  clearLoginFailures(attemptKey);

  if (isUserSuperAdmin(user)) {
    res.json({
      user: toSafeUser(user),
      message: 'حسابك يمتلك بالفعل أعلى صلاحية (المدير العام).',
    });
    return;
  }

  const configuredRankId = store.platformConfig?.adminActivationDefaultRankId || 'rank-deputy-director';
  const validRank = (store.adminRanks || []).find(
    (r) => r.id === configuredRankId && !r.isSuperAdminRank && r.id !== 'rank-super-admin'
  );
  const assignedRankId = validRank ? validRank.id : 'rank-deputy-director';

  user.role = 'admin';
  if (!user.adminRankId || user.adminRankId === 'rank-super-admin') {
    user.adminRankId = assignedRankId;
  } else {
    user.adminRankId = assignedRankId;
  }
  db.save();

  recordAdminAudit({
    actorId: user.id,
    actorName: user.name,
    action: 'user.admin_activated',
    targetUserId: user.id,
    targetUserName: user.name,
    details: `Activated admin role via admin activation password (rank: ${assignedRankId})`,
    ip: getClientIp(req),
  });

  res.json({
    user: toSafeUser(user),
    message: 'تم تفعيل صلاحية الأدمن لحسابك بنجاح!',
  });
});

// Read private Admin notes written on the logged-in user's profile
router.get('/account/notes', requireAuth, (req: AuthenticatedRequest, res) => {
  const store = db.get();
  const userId = req.currentUser!.id;
  const notes = [...(store.userProfileNotes || [])]
    .filter((n) => n.targetUserId === userId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  res.json({ notes });
});

// Reaction-only interaction on a note written to the logged-in user's profile (no text replies allowed)
router.post('/account/notes/:noteId/react', requireAuth, (req: AuthenticatedRequest, res) => {
  const { noteId } = req.params;
  const { emoji } = req.body as { emoji?: NoteReactionEmoji };

  if (!emoji || !ALLOWED_NOTE_REACTIONS.has(emoji)) {
    res.status(400).json({
      error: 'يمكن التفاعل بالرياكت المحدد فقط على ملاحظات الإدارة.',
    });
    return;
  }

  const store = db.get();
  const note = (store.userProfileNotes || []).find((n) => n.id === noteId);
  if (!note) {
    res.status(404).json({ error: 'الملاحظة غير موجودة.' });
    return;
  }

  if (note.targetUserId !== req.currentUser!.id) {
    res.status(403).json({
      error: 'هذه الملاحظة خاصة بصاحب البروفايل فقط ولا يمكنك التفاعل معها.',
    });
    return;
  }

  if (!Array.isArray(note.reactions)) {
    note.reactions = [];
  }

  const existingIdx = note.reactions.findIndex(
    (r) => r.userId === req.currentUser!.id
  );
  if (existingIdx >= 0 && note.reactions[existingIdx].emoji === emoji) {
    // Toggle off the same reaction
    note.reactions = note.reactions.filter((r) => r.userId !== req.currentUser!.id);
  } else {
    note.reactions = [
      ...note.reactions.filter((r) => r.userId !== req.currentUser!.id),
      {
        userId: req.currentUser!.id,
        userName: req.currentUser!.name,
        emoji,
        reactedAt: new Date().toISOString(),
      },
    ];
  }

  note.updatedAt = new Date().toISOString();
  db.save();
  res.json({ note });
});

// Export student's own personal data JSON
router.get('/account/export', requireAuth, (req: AuthenticatedRequest, res) => {
  const store = db.get();
  const userId = req.currentUser!.id;

  const exportPayload = {
    exportedAt: new Date().toISOString(),
    profile: toSafeUser(req.currentUser!),
    progress: store.studentProgress?.[userId] || null,
    gpaTable: store.gpaTables?.[userId] || [],
    lectureProgress: store.lectureProgress?.[userId] || {},
    quizSubmissions: store.quizSubmissions.filter((s) => s.userId === userId),
    chatMessages: store.chatMessages.filter((m) => m.userId === userId),
    supportTickets: (store.supportTickets || []).filter((t) => t.userId === userId),
    profileNotes: (store.userProfileNotes || []).filter((n) => n.targetUserId === userId),
  };

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="mvia-personal-data-${userId}.json"`
  );
  res.send(JSON.stringify(exportPayload, null, 2));
});

// Self-service account deletion (blocked for protected/admin accounts)
router.delete('/account', requireAuth, (req: AuthenticatedRequest, res) => {
  const { password } = req.body as { password?: string };
  const user = req.currentUser!;

  if (user.isProtected || user.role === 'admin') {
    res.status(403).json({
      error: 'حسابات الأدمن المحمية لا يمكن حذفها ذاتياً حفاظاً على استقرار المنصة.',
    });
    return;
  }

  if (!password) {
    res.status(400).json({ error: 'يرجى إدخال كلمة المرور لتأكيد حذف الحساب نهائياً.' });
    return;
  }

  if (!verifyPassword(password, user.passwordHash)) {
    res.status(401).json({ error: 'كلمة المرور غير صحيحة.' });
    return;
  }

  const store = db.get();
  const userId = user.id;

  store.users = store.users.filter((u) => u.id !== userId);
  store.sessions = store.sessions.filter((s) => s.userId !== userId);
  store.quizSubmissions = store.quizSubmissions.filter((s) => s.userId !== userId);
  store.chatMessages = store.chatMessages.filter((m) => m.userId !== userId);
  if (store.supportTickets) {
    store.supportTickets = store.supportTickets.filter((t) => t.userId !== userId);
  }
  if (store.supportTeam) {
    store.supportTeam = store.supportTeam.filter((m) => m.userId !== userId);
  }
  if (store.userProfileNotes) {
    store.userProfileNotes = store.userProfileNotes.filter(
      (n) => n.targetUserId !== userId
    );
  }
  if (store.studentProgress) {
    delete store.studentProgress[userId];
  }
  if (store.gpaTables) {
    delete store.gpaTables[userId];
  }
  if (store.lectureProgress) {
    delete store.lectureProgress[userId];
  }
  if (store.analytics?.visitors) {
    delete store.analytics.visitors[userId];
  }

  db.save();
  res.json({ ok: true, deletedUserId: userId });
});

export default router;
