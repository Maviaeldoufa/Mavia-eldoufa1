import crypto from 'crypto';
import { Router } from 'express';
import { getUserByToken, requireAuth, requirePermission } from '../auth.ts';
import type { AuthenticatedRequest } from '../auth.ts';
import { db, pushNotification } from '../db.ts';
import type { AnnouncementCountdown } from '../types.ts';

const router = Router();

// Public support config (WhatsApp & Telegram)
router.get('/platform/config', (_req, res) => {
  const store = db.get();
  const config = store.platformConfig;
  res.json({
    config: {
      whatsappNumber: config?.whatsappNumber || '01159637247',
      telegramUrl: config?.telegramUrl || 'https://t.me/+201159637247',
    },
  });
});

router.put('/admin/platform/config', requireAuth, requirePermission('manage_community'), (req, res) => {
  const { whatsappNumber, telegramUrl } = req.body as {
    whatsappNumber?: string;
    telegramUrl?: string;
  };
  const cleanTelegram = telegramUrl?.trim() || 'https://t.me/+201159637247';
  if (!/^https?:\/\//i.test(cleanTelegram)) {
    res.status(400).json({ error: 'رابط التليجرام يجب أن يبدأ بـ https:// أو http://.' });
    return;
  }
  const store = db.get();
  store.platformConfig = {
    ...(store.platformConfig || {}),
    whatsappNumber: (whatsappNumber?.trim() || '01159637247').slice(0, 30),
    telegramUrl: cleanTelegram,
  };
  db.save();
  res.json({
    config: {
      whatsappNumber: store.platformConfig.whatsappNumber,
      telegramUrl: store.platformConfig.telegramUrl,
    },
  });
});

// Countdown Announcements (Home exam news + Courses release timers)
router.get('/announcements', requireAuth, (req, res) => {
  const scope = req.query.scope as 'home' | 'courses' | undefined;
  const store = db.get();
  let list = store.announcements || [];
  if (scope === 'home' || scope === 'courses') {
    list = list.filter((a) => a.scope === scope);
  }
  res.json({ announcements: list });
});

router.post('/announcements', requireAuth, requirePermission('manage_community'), (req: AuthenticatedRequest, res) => {
  const { scope, title, description, category, targetAt } = req.body as {
    scope?: 'home' | 'courses';
    title?: string;
    description?: string;
    category?: 'exam' | 'news' | 'release';
    targetAt?: string;
  };

  if (!title?.trim() || !targetAt?.trim()) {
    res.status(400).json({ error: 'يرجى كتابة العنوان وتحديد تاريخ ووقت المؤقت.' });
    return;
  }

  const parsedTime = new Date(targetAt).getTime();
  if (Number.isNaN(parsedTime)) {
    res.status(400).json({ error: 'صيغة التاريخ والوقت غير صالحة.' });
    return;
  }

  const store = db.get();
  if (!store.announcements) {
    store.announcements = [];
  }

  const announcement: AnnouncementCountdown = {
    id: `ann-${crypto.randomUUID()}`,
    scope: scope === 'courses' ? 'courses' : 'home',
    title: title.trim(),
    description: description?.trim() || undefined,
    category:
      category === 'exam' || category === 'release' ? category : 'news',
    targetAt: new Date(parsedTime).toISOString(),
    createdAt: new Date().toISOString(),
  };

  store.announcements.unshift(announcement);
  db.save();

  pushNotification({
    title: announcement.title,
    message:
      announcement.description ||
      (announcement.scope === 'courses'
        ? 'مؤقت تنزيل جديد متاح في قسم الكورسات.'
        : 'خبر ومؤقت امتحان جديد على الصفحة الرئيسية.'),
    type: announcement.category === 'exam' ? 'exam' : 'announcement',
    targetSection: announcement.scope === 'courses' ? 'courses' : 'home',
    year: 0,
    createdBy: req.currentUser!.name,
  });

  res.status(201).json({ announcement });
});

router.delete('/announcements/:id', requireAuth, requirePermission('manage_community'), (req, res) => {
  const { id } = req.params;
  const store = db.get();
  store.announcements = (store.announcements || []).filter((a) => a.id !== id);
  db.save();
  res.json({ ok: true });
});

// Track platform visits (open endpoint with optional auth token; returns no analytics data)
router.post('/analytics/visit', (req, res) => {
  const { visitorKey, countIncrement } = req.body as {
    visitorKey?: string;
    countIncrement?: boolean;
  };
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : undefined;
  const currentUser = getUserByToken(token);

  const store = db.get();
  if (!store.analytics) {
    store.analytics = {
      totalVisits: 0,
      dailyCounts: {},
      visitors: {},
    };
  }

  const key = currentUser?.id || visitorKey?.trim() || `anon-${crypto.randomUUID()}`;
  const nowIso = new Date().toISOString();
  const todayKey = nowIso.slice(0, 10);

  const shouldIncrement = countIncrement !== false;
  if (shouldIncrement) {
    store.analytics.totalVisits += 1;
    store.analytics.dailyCounts[todayKey] =
      (store.analytics.dailyCounts[todayKey] || 0) + 1;
  }

  const existing = store.analytics.visitors[key];
  store.analytics.visitors[key] = {
    visitorKey: key,
    userId: currentUser?.id || existing?.userId,
    userName: currentUser?.name || existing?.userName,
    userYear: currentUser?.year || existing?.userYear,
    lastVisitAt: nowIso,
    visitCount: (existing?.visitCount || 0) + (shouldIncrement ? 1 : 0),
  };

  db.save();
  res.json({ ok: true });
});

// Admin-only analytics endpoint (strictly forbidden for students)
router.get('/admin/analytics', requireAuth, requirePermission('view_sensitive_data'), (_req, res) => {
  const store = db.get();
  const analytics = store.analytics || {
    totalVisits: 0,
    dailyCounts: {},
    visitors: {},
  };
  const todayKey = new Date().toISOString().slice(0, 10);
  const visitorList = Object.values(analytics.visitors).sort(
    (a, b) =>
      new Date(b.lastVisitAt).getTime() - new Date(a.lastVisitAt).getTime()
  );

  const students = store.users.filter((u) => u.role === 'student');
  const teachers = store.users.filter((u) => u.role === 'teacher');
  const admins = store.users.filter((u) => u.role === 'admin');
  const submissions = store.quizSubmissions || [];
  const totalMaxScore = submissions.reduce((sum, s) => sum + (s.maxScore || 0), 0);
  const totalScore = submissions.reduce((sum, s) => sum + (s.score || 0), 0);
  const avgQuizScorePercent =
    totalMaxScore > 0 ? Math.round((totalScore / totalMaxScore) * 100) : 0;

  res.json({
    totalVisits: analytics.totalVisits,
    uniqueVisitorsCount: visitorList.length,
    todayVisits: analytics.dailyCounts[todayKey] || 0,
    registeredVisitorsCount: visitorList.filter((v) => Boolean(v.userId)).length,
    recentVisitors: visitorList.slice(0, 25),
    overview: {
      studentsCount: students.length,
      teachersCount: teachers.length,
      adminsCount: admins.length,
      suspendedCount: store.users.filter((u) => Boolean(u.isSuspended)).length,
      verifiedEmailsCount: store.users.filter((u) => Boolean(u.emailVerified)).length,
      coursesCount: store.courses.length,
      summariesCount: store.summaries.length,
      quizzesCount: store.quizzes.length,
      lecturesCount: (store.lectures || []).length,
      totalSubmissions: submissions.length,
      avgQuizScorePercent,
      openTicketsCount: (store.supportTickets || []).filter(
        (t) => t.status !== 'resolved'
      ).length,
      recentErrorsCount: (store.errorLogs || []).length,
    },
  });
});

export default router;
