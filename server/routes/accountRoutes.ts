import { Router } from 'express';
import { requireAuth } from '../auth.ts';
import type { AuthenticatedRequest } from '../auth.ts';
import { db, hashPassword, toSafeUser, verifyPassword } from '../db.ts';
import type { AcademicYear } from '../types.ts';

const router = Router();

// Update own profile (name, year, or password)
router.patch('/account/profile', requireAuth, (req: AuthenticatedRequest, res) => {
  const { name, year, currentPassword, newPassword } = req.body as {
    name?: string;
    year?: number;
    currentPassword?: string;
    newPassword?: string;
  };

  const user = req.currentUser!;
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

  if (newPassword !== undefined && newPassword.length > 0) {
    if (!currentPassword) {
      res.status(400).json({ error: 'يرجى إدخال كلمة المرور الحالية أولاً.' });
      return;
    }
    if (!verifyPassword(currentPassword, user.passwordHash)) {
      res.status(401).json({ error: 'كلمة المرور الحالية غير صحيحة.' });
      return;
    }
    if (newPassword.length < 6) {
      res.status(400).json({ error: 'كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل.' });
      return;
    }
    user.passwordHash = hashPassword(newPassword);
  }

  db.save();
  res.json({ user: toSafeUser(user) });
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
