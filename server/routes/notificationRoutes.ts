import crypto from 'crypto';
import { Router } from 'express';
import { requireAuth, requirePermission } from '../auth.ts';
import type { AuthenticatedRequest } from '../auth.ts';
import { db, pushNotification } from '../db.ts';
import type { AcademicYear, NotificationItem } from '../types.ts';

const router = Router();

router.get('/notifications', requireAuth, (req: AuthenticatedRequest, res) => {
  const store = db.get();
  const userId = req.currentUser!.id;
  const userYear = req.currentUser!.year;
  const isAdmin = req.currentUser!.role === 'admin';

  const relevant = (store.notifications || []).filter(
    (n) => isAdmin || n.year === 0 || n.year === userYear
  );

  const items = relevant.map((n) => ({
    ...n,
    read: Array.isArray(n.readBy) ? n.readBy.includes(userId) : false,
  }));

  const unreadCount = items.filter((n) => !n.read).length;

  res.json({ notifications: items, unreadCount });
});

router.post('/notifications', requireAuth, requirePermission('manage_community'), (req: AuthenticatedRequest, res) => {
  const { title, message, type, targetSection, year } = req.body as {
    title?: string;
    message?: string;
    type?: NotificationItem['type'];
    targetSection?: NotificationItem['targetSection'];
    year?: number;
  };

  if (!title?.trim() || !message?.trim()) {
    res.status(400).json({ error: 'يرجى كتابة عنوان ونص الإشعار.' });
    return;
  }

  const parsedYear = Number(year || 0);
  const validYear = ([0, 1, 2, 3, 4].includes(parsedYear) ? parsedYear : 0) as AcademicYear | 0;

  const item = pushNotification({
    title: title.trim(),
    message: message.trim(),
    type: type || 'general',
    targetSection: targetSection || 'home',
    year: validYear,
    createdBy: req.currentUser!.name,
  });

  res.status(201).json({ notification: { ...item, read: false } });
});

router.post('/notifications/read-all', requireAuth, (req: AuthenticatedRequest, res) => {
  const store = db.get();
  const userId = req.currentUser!.id;
  let changed = false;

  (store.notifications || []).forEach((n) => {
    if (!Array.isArray(n.readBy)) {
      n.readBy = [];
    }
    if (!n.readBy.includes(userId)) {
      n.readBy.push(userId);
      changed = true;
    }
  });

  if (changed) {
    db.save();
  }

  res.json({ ok: true });
});

router.post('/notifications/:id/read', requireAuth, (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const store = db.get();
  const userId = req.currentUser!.id;
  const target = (store.notifications || []).find((n) => n.id === id);

  if (!target) {
    res.status(404).json({ error: 'الإشعار غير موجود.' });
    return;
  }

  if (!Array.isArray(target.readBy)) {
    target.readBy = [];
  }
  if (!target.readBy.includes(userId)) {
    target.readBy.push(userId);
    db.save();
  }

  res.json({ ok: true });
});

router.delete('/notifications/:id', requireAuth, requirePermission('manage_community'), (req, res) => {
  const { id } = req.params;
  const store = db.get();
  store.notifications = (store.notifications || []).filter((n) => n.id !== id);
  db.save();
  res.json({ ok: true });
});

export default router;
