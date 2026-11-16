import crypto from 'crypto';
import { Router } from 'express';
import {
  createSessionToken,
  getAdminSecretCode,
  requireAuth,
  requirePermission,
} from '../auth.ts';
import type { AuthenticatedRequest } from '../auth.ts';
import {
  db,
  getEmailDeliveryConfig,
  hashPassword,
  hasUserPermission,
  isUserSuperAdmin,
  recordAdminAudit,
  recordAppError,
  toLeaderboardUser,
  toSafeUser,
  verifyPassword,
} from '../db.ts';
import {
  checkLoginLockout,
  clearLoginFailures,
  loginRateLimiter,
  recordFailedLogin,
  registerRateLimiter,
} from '../rateLimit.ts';
import type { AcademicYear, User, UserRole } from '../types.ts';

const router = Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VERIFICATION_TTL_MS = 15 * 60 * 1000;

function hashOtpCode(code: string): string {
  return crypto.createHash('sha256').update(code.trim()).digest('hex');
}

function getClientIp(req: AuthenticatedRequest): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim()) {
    return fwd.split(',')[0].trim();
  }
  return req.ip || 'unknown';
}

function csvEscapeCell(raw: string | number | boolean | undefined | null): string {
  const str = String(raw ?? '');
  const safe = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
  return `"${safe.replace(/"/g, '""')}"`;
}

function maskEmail(email: string): string {
  const clean = (email || '').trim();
  if (!clean || !clean.includes('@')) return clean ? '***' : '';
  const [local, domain] = clean.split('@');
  if (!local) return `***@${domain}`;
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***@${domain}`;
}

function maskPhone(phone: string): string {
  const clean = (phone || '').trim();
  if (!clean) return '';
  if (clean.length <= 4) return '****';
  return `${clean.slice(0, 3)}${'*'.repeat(Math.max(2, clean.length - 5))}${clean.slice(-2)}`;
}

function filterAndSortAdminUsers(
  allUsers: User[],
  query: Record<string, unknown>
): User[] {
  const search = typeof query.search === 'string' ? query.search.trim().toLowerCase() : '';
  const roleFilter = typeof query.role === 'string' ? query.role.trim() : 'all';
  const statusFilter = typeof query.status === 'string' ? query.status.trim() : 'all';
  const yearFilter = Number(query.year || 0);
  const sortBy = typeof query.sortBy === 'string' ? query.sortBy : 'createdAt';
  const sortDir = query.sortDir === 'asc' ? 1 : -1;

  const filtered = allUsers.filter((u) => {
    if (roleFilter === 'student' || roleFilter === 'teacher' || roleFilter === 'admin') {
      if (u.role !== roleFilter) return false;
    }
    if (statusFilter === 'active' && u.isSuspended) return false;
    if (statusFilter === 'suspended' && !u.isSuspended) return false;
    if (yearFilter >= 1 && yearFilter <= 4 && u.year !== yearFilter) return false;
    if (search) {
      const hay = `${u.name} ${u.email || ''} ${u.phone || ''} ${u.id}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  filtered.sort((a, b) => {
    if (sortBy === 'name') {
      return a.name.localeCompare(b.name, 'ar') * sortDir;
    }
    if (sortBy === 'points') {
      return (a.points - b.points) * sortDir;
    }
    if (sortBy === 'role') {
      return a.role.localeCompare(b.role) * sortDir;
    }
    if (sortBy === 'status') {
      const av = a.isSuspended ? 1 : 0;
      const bv = b.isSuspended ? 1 : 0;
      return (av - bv) * sortDir;
    }
    if (sortBy === 'lastLoginAt') {
      const at = a.lastLoginAt ? new Date(a.lastLoginAt).getTime() : 0;
      const bt = b.lastLoginAt ? new Date(b.lastLoginAt).getTime() : 0;
      return (at - bt) * sortDir;
    }
    const at = new Date(a.createdAt).getTime() || 0;
    const bt = new Date(b.createdAt).getTime() || 0;
    return (at - bt) * sortDir;
  });

  return filtered;
}

router.post('/auth/register', registerRateLimiter, (req, res) => {
  const { name, email, phone, password, year, adminCode, acceptedTerms } = req.body as {
    name?: string;
    email?: string;
    phone?: string;
    password?: string;
    year?: number;
    adminCode?: string;
    acceptedTerms?: boolean;
  };

  if (acceptedTerms !== true) {
    res.status(400).json({
      error: 'يجب الموافقة على الشروط والأحكام أولاً قبل إنشاء الحساب.',
    });
    return;
  }

  if (!name?.trim() || !email?.trim() || !phone?.trim() || !password || !year) {
    res.status(400).json({
      error: 'يرجى استكمال الاسم والبريد الإلكتروني ورقم التليفون وكلمة المرور والسنة الدراسية.',
    });
    return;
  }

  const cleanEmail = email.trim().toLowerCase();
  if (!EMAIL_REGEX.test(cleanEmail)) {
    res.status(400).json({ error: 'صيغة البريد الإلكتروني غير صحيحة.' });
    return;
  }

  const parsedYear = Number(year) as AcademicYear;
  if (![1, 2, 3, 4].includes(parsedYear)) {
    res.status(400).json({ error: 'السنة الدراسية يجب أن تكون من الفرقة الأولى إلى الرابعة.' });
    return;
  }

  if (password.length < 4) {
    res.status(400).json({ error: 'كلمة المرور يجب أن تكون 4 أحرف على الأقل.' });
    return;
  }

  const store = db.get();
  const cleanPhone = phone.trim();
  const cleanName = name.trim();

  if (store.users.some((u) => u.phone === cleanPhone)) {
    res.status(409).json({ error: 'رقم التليفون مسجل بالفعل في المنصة.' });
    return;
  }

  if (store.users.some((u) => (u.email || '').toLowerCase() === cleanEmail)) {
    res.status(409).json({ error: 'البريد الإلكتروني مسجل بالفعل في المنصة.' });
    return;
  }

  let role: UserRole = 'student';
  let isProtected = false;
  let adminRankId: string | undefined;
  if (adminCode && adminCode.trim().length > 0) {
    const configuredSecret = getAdminSecretCode();
    if (!configuredSecret) {
      res.status(403).json({ error: 'تسجيل الأدمن بالكود غير مفعّل حالياً على الخادم.' });
      return;
    }
    if (adminCode.trim() !== configuredSecret) {
      res.status(403).json({ error: 'كود صلاحية الأدمن غير صحيح.' });
      return;
    }
    role = 'admin';
    isProtected = true;
    adminRankId = 'rank-super-admin';
  }

  const nowIso = new Date().toISOString();
  const newUser: User = {
    id: `user-${crypto.randomUUID()}`,
    name: cleanName,
    email: cleanEmail,
    phone: cleanPhone,
    passwordHash: hashPassword(password),
    year: parsedYear,
    role,
    adminRankId,
    isProtected,
    points: 0,
    quizzesCompleted: 0,
    emailVerified: false,
    lastLoginAt: nowIso,
    createdAt: nowIso,
  };

  store.users.push(newUser);
  db.save();

  const token = createSessionToken(newUser.id);
  res.status(201).json({
    token,
    user: toSafeUser(newUser),
  });
});

router.post('/auth/login', loginRateLimiter, (req, res) => {
  const { identifier, password } = req.body as {
    identifier?: string;
    password?: string;
  };

  if (!identifier?.trim() || !password) {
    res.status(400).json({ error: 'يرجى إدخال البريد الإلكتروني أو رقم التليفون وكلمة المرور.' });
    return;
  }

  const clean = identifier.trim().toLowerCase();
  const lockout = checkLoginLockout(clean);
  if (lockout.locked) {
    const minutes = Math.max(1, Math.ceil(lockout.retryAfterSeconds / 60));
    res.setHeader('Retry-After', String(lockout.retryAfterSeconds));
    res.status(429).json({
      error: `تم قفل المحاولة مؤقتاً بسبب تكرار كلمات مرور خاطئة. حاول بعد ${minutes} دقيقة.`,
      retryAfterSeconds: lockout.retryAfterSeconds,
    });
    return;
  }

  const store = db.get();
  const user = store.users.find(
    (u) =>
      u.phone === identifier.trim() ||
      (u.email || '').toLowerCase() === clean ||
      u.name.toLowerCase() === clean
  );

  if (!user || !verifyPassword(password, user.passwordHash)) {
    const failState = recordFailedLogin(clean);
    if (failState.locked) {
      res.setHeader('Retry-After', String(failState.retryAfterSeconds));
      res.status(429).json({
        error: 'تم قفل تسجيل الدخول لهذا الحساب لمدة 15 دقيقة بعد 5 محاولات خاطئة متتالية.',
        retryAfterSeconds: failState.retryAfterSeconds,
      });
      return;
    }
    res.status(401).json({
      error: `بيانات الدخول غير صحيحة. المحاولات المتبقية: ${failState.remainingAttempts}.`,
    });
    return;
  }

  if (user.isSuspended && !user.isProtected && user.role !== 'admin') {
    res.status(403).json({
      suspended: true,
      error:
        'تم حظر حسابك مؤقتاً لمخالفة الشروط والأحكام (في الشات أو المنصة)، ولا يمكنك الدخول مجدداً إلا بإذن وموافقة من الأدمن.',
    });
    return;
  }

  clearLoginFailures(clean);
  user.lastLoginAt = new Date().toISOString();
  db.save();
  const token = createSessionToken(user.id);
  res.json({
    token,
    user: toSafeUser(user),
  });
});

router.post('/auth/logout', requireAuth, (req: AuthenticatedRequest, res) => {
  const store = db.get();
  store.sessions = store.sessions.filter((s) => s.token !== req.authToken);
  db.save();
  res.json({ ok: true });
});

router.get('/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
  res.json({ user: toSafeUser(req.currentUser!) });
});

router.post('/auth/send-verification', requireAuth, async (req: AuthenticatedRequest, res) => {
  const user = req.currentUser!;
  if (user.emailVerified) {
    res.json({
      sent: false,
      alreadyVerified: true,
      requiresConfig: false,
      message: 'البريد الإلكتروني مؤكد بالفعل.',
    });
    return;
  }

  if (!user.email || !EMAIL_REGEX.test(user.email)) {
    res.status(400).json({ error: 'لا يوجد بريد إلكتروني صالح مرتبط بهذا الحساب.' });
    return;
  }

  const emailConfig = getEmailDeliveryConfig();
  if (!emailConfig.enabled) {
    res.json({
      sent: false,
      disabled: true,
      requiresConfig: true,
      message:
        'إرسال البريد الإلكتروني معطّل مؤقتاً لأن إعداد Resend أو عنوان المرسل (EMAIL_FROM) غير مكتمل، وتعمل باقي مزايا المنصة والتسجيل بشكل طبيعي.',
    });
    return;
  }

  const otpCode = String(crypto.randomInt(100000, 999999));

  try {
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${emailConfig.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: emailConfig.fromEmail,
        to: [user.email],
        subject: 'كود تأكيد البريد الإلكتروني — منصة MVIA',
        html: `<div dir="rtl" style="font-family:sans-serif;line-height:1.8">
          <h2>مرحباً ${user.name}</h2>
          <p>استخدم الكود التالي لتأكيد بريدك الإلكتروني في منصة MVIA:</p>
          <div style="font-size:28px;font-weight:bold;letter-spacing:6px;padding:12px 18px;background:#f4f4f5;display:inline-block;border-radius:8px">${otpCode}</div>
          <p style="color:#666;font-size:13px">الكود صالح لمدة 15 دقيقة فقط.</p>
        </div>`,
      }),
    });

    if (!emailRes.ok) {
      const errText = await emailRes.text();
      recordAppError({
        source: 'server',
        message: `فشل إرسال بريد التحقق عبر Resend: ${emailRes.status} ${errText.slice(0, 120)}`,
        path: '/api/auth/send-verification',
        userId: user.id,
        notifyAdmin: true,
      });
      res.status(502).json({
        error: 'تعذر إرسال رسالة التحقق عبر مزود البريد الإلكتروني.',
      });
      return;
    }

    user.emailVerificationTokenHash = hashOtpCode(otpCode);
    user.emailVerificationExpiresAt = new Date(Date.now() + VERIFICATION_TTL_MS).toISOString();
    db.save();

    res.json({
      sent: true,
      requiresConfig: false,
      message: 'تم إرسال كود التأكيد إلى بريدك الإلكتروني بنجاح.',
    });
  } catch (err) {
    recordAppError({
      source: 'server',
      message: err instanceof Error ? err.message : 'Email verification transport error',
      path: '/api/auth/send-verification',
      userId: user.id,
      notifyAdmin: true,
    });
    res.status(502).json({ error: 'حدث خطأ أثناء الاتصال بخدمة البريد الإلكتروني.' });
  }
});

router.post('/auth/verify-email', requireAuth, (req: AuthenticatedRequest, res) => {
  const { code } = req.body as { code?: string };
  const user = req.currentUser!;

  if (user.emailVerified) {
    res.json({ user: toSafeUser(user) });
    return;
  }

  if (!code || !/^\d{6}$/.test(code.trim())) {
    res.status(400).json({ error: 'يرجى إدخال كود التحقق المكون من 6 أرقام.' });
    return;
  }

  if (!user.emailVerificationTokenHash || !user.emailVerificationExpiresAt) {
    res.status(400).json({ error: 'لا يوجد كود تحقق نشط حالياً. اطلب إرسال كود جديد.' });
    return;
  }

  if (new Date(user.emailVerificationExpiresAt).getTime() < Date.now()) {
    res.status(400).json({ error: 'انتهت صلاحية كود التحقق. يرجى طلب كود جديد.' });
    return;
  }

  const submittedBuf = Buffer.from(hashOtpCode(code), 'hex');
  const storedBuf = Buffer.from(user.emailVerificationTokenHash, 'hex');
  if (
    submittedBuf.length !== storedBuf.length ||
    !crypto.timingSafeEqual(submittedBuf, storedBuf)
  ) {
    res.status(400).json({ error: 'كود التحقق غير صحيح.' });
    return;
  }

  user.emailVerified = true;
  user.emailVerificationTokenHash = undefined;
  user.emailVerificationExpiresAt = undefined;
  db.save();

  res.json({ user: toSafeUser(user) });
});

router.get('/users', requireAuth, (req: AuthenticatedRequest, res) => {
  const yearParam = req.query.year ? Number(req.query.year) : 0;
  const store = db.get();
  const canViewSensitive = hasUserPermission(req.currentUser, 'view_sensitive_data');
  let users = store.users.map((u) =>
    canViewSensitive ? toSafeUser(u) : toLeaderboardUser(u)
  );
  if (yearParam >= 1 && yearParam <= 4) {
    users = users.filter((u) => u.year === yearParam);
  }
  users.sort((a, b) => b.points - a.points);
  res.json({ users });
});

router.get('/admin/users', requireAuth, requirePermission('manage_students'), (req: AuthenticatedRequest, res) => {
  const store = db.get();
  const allUsers = store.users;
  const canViewSensitive = hasUserPermission(req.currentUser, 'view_sensitive_data');

  const stats = {
    totalUsers: allUsers.length,
    activeUsers: allUsers.filter((u) => !u.isSuspended).length,
    suspendedUsers: allUsers.filter((u) => Boolean(u.isSuspended)).length,
    studentsCount: allUsers.filter((u) => u.role === 'student').length,
    teachersCount: allUsers.filter((u) => u.role === 'teacher').length,
    adminsCount: allUsers.filter((u) => u.role === 'admin').length,
  };

  const filtered = filterAndSortAdminUsers(
    allUsers,
    req.query as Record<string, unknown>
  );

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 10));
  const totalFiltered = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / limit));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * limit;
  const paginated = filtered.slice(offset, offset + limit).map((u) => {
    const safe = toSafeUser(u);
    if (!canViewSensitive) {
      return {
        ...safe,
        email: maskEmail(safe.email),
        phone: maskPhone(safe.phone),
      };
    }
    return safe;
  });

  res.json({
    users: paginated,
    pagination: {
      page: safePage,
      limit,
      totalFiltered,
      totalPages,
    },
    stats,
  });
});

router.get('/admin/users/export.csv', requireAuth, requirePermission('view_sensitive_data'), (req: AuthenticatedRequest, res) => {
  const store = db.get();
  const includeContact = req.query.includeContact === 'true';
  const filtered = filterAndSortAdminUsers(
    store.users,
    req.query as Record<string, unknown>
  );

  const header = [
    'id',
    'name',
    'role',
    'academic_year',
    'account_status',
    'email',
    'phone',
    'email_verified',
    'points',
    'quizzes_completed',
    'created_at',
    'last_login_at',
  ]
    .map(csvEscapeCell)
    .join(',');

  const rows = filtered.map((u) =>
    [
      u.id,
      u.name,
      u.role,
      u.year,
      u.isSuspended ? 'suspended' : 'active',
      includeContact ? u.email || '' : maskEmail(u.email || ''),
      includeContact ? u.phone || '' : maskPhone(u.phone || ''),
      Boolean(u.emailVerified),
      u.points,
      u.quizzesCompleted,
      u.createdAt,
      u.lastLoginAt || '',
    ]
      .map(csvEscapeCell)
      .join(',')
  );

  recordAdminAudit({
    actorId: req.currentUser!.id,
    actorName: req.currentUser!.name,
    action: 'users.csv_export',
    details: `Exported ${filtered.length} user(s) as CSV (${
      includeContact ? 'full contact' : 'privacy-masked contact'
    })`,
    ip: getClientIp(req),
  });

  const csvBody = `\uFEFF${[header, ...rows].join('\r\n')}`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="mvia-users-${new Date().toISOString().slice(0, 10)}.csv"`
  );
  res.send(csvBody);
});

router.get('/admin/audit-logs', requireAuth, requirePermission('view_sensitive_data'), (_req: AuthenticatedRequest, res) => {
  const store = db.get();
  res.json({ logs: (store.adminAuditLogs || []).slice(0, 100) });
});

router.post('/admin/users', requireAuth, requirePermission('manage_students'), (req: AuthenticatedRequest, res) => {
  const { name, email, phone, password, year, role } = req.body as {
    name?: string;
    email?: string;
    phone?: string;
    password?: string;
    year?: number;
    role?: UserRole;
  };

  if (!name?.trim() || !email?.trim() || !phone?.trim() || !password || !year) {
    res.status(400).json({ error: 'يرجى ملء جميع بيانات العضو الجديد بما فيها البريد الإلكتروني.' });
    return;
  }

  const cleanEmail = email.trim().toLowerCase();
  if (!EMAIL_REGEX.test(cleanEmail)) {
    res.status(400).json({ error: 'صيغة البريد الإلكتروني غير صحيحة.' });
    return;
  }

  if (password.length < 4) {
    res.status(400).json({ error: 'كلمة المرور يجب أن تكون 4 أحرف على الأقل.' });
    return;
  }

  const parsedYear = Number(year) as AcademicYear;
  if (![1, 2, 3, 4].includes(parsedYear)) {
    res.status(400).json({ error: 'السنة الدراسية غير صالحة.' });
    return;
  }

  const store = db.get();
  const cleanPhone = phone.trim();
  if (store.users.some((u) => u.phone === cleanPhone)) {
    res.status(409).json({ error: 'رقم التليفون مستخدم بالفعل.' });
    return;
  }
  if (store.users.some((u) => (u.email || '').toLowerCase() === cleanEmail)) {
    res.status(409).json({ error: 'البريد الإلكتروني مستخدم بالفعل.' });
    return;
  }

  const assignedRole: UserRole =
    role === 'admin' ? 'admin' : role === 'teacher' ? 'teacher' : 'student';
  if (assignedRole === 'admin' && !isUserSuperAdmin(req.currentUser)) {
    res.status(403).json({
      error: 'إنشاء حساب مسؤول/أدمن جديد محصور بالمدير العام فقط.',
    });
    return;
  }
  const newUser: User = {
    id: `user-${crypto.randomUUID()}`,
    name: name.trim(),
    email: cleanEmail,
    phone: cleanPhone,
    passwordHash: hashPassword(password),
    year: parsedYear,
    role: assignedRole,
    isProtected: false,
    points: 0,
    quizzesCompleted: 0,
    emailVerified: false,
    createdAt: new Date().toISOString(),
  };

  store.users.push(newUser);
  db.save();

  recordAdminAudit({
    actorId: req.currentUser!.id,
    actorName: req.currentUser!.name,
    action: 'user.create',
    targetUserId: newUser.id,
    targetUserName: newUser.name,
    details: `Created ${assignedRole} account (Year ${parsedYear})`,
    ip: getClientIp(req),
  });

  res.status(201).json({ user: toSafeUser(newUser) });
});

router.get('/admin/users/:id/profile', requireAuth, requirePermission('manage_students'), (req: AuthenticatedRequest, res) => {
  const targetId = req.params.id;
  const store = db.get();
  const target = store.users.find((u) => u.id === targetId);

  if (!target) {
    res.status(404).json({ error: 'المستخدم غير موجود.' });
    return;
  }

  const progress = store.studentProgress?.[target.id];
  const submissions = (store.quizSubmissions || []).filter(
    (s) => s.userId === target.id
  );
  const totalMaxScore = submissions.reduce((sum, s) => sum + (s.maxScore || 0), 0);
  const totalScore = submissions.reduce((sum, s) => sum + (s.score || 0), 0);
  const avgQuizScorePercent =
    totalMaxScore > 0 ? Math.round((totalScore / totalMaxScore) * 100) : 0;

  const enrolledIds = new Set(progress?.enrolledCourseIds || []);
  const enrolledCourses = store.courses
    .filter((c) => enrolledIds.has(c.id))
    .map((c) => ({
      id: c.id,
      title: c.title,
      code: c.code,
      year: c.year,
    }));

  const recentSubmissions = [...submissions]
    .sort(
      (a, b) =>
        new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
    )
    .slice(0, 10)
    .map((s) => {
      const quiz = store.quizzes.find((q) => q.id === s.quizId);
      const course = store.courses.find((c) => c.id === s.courseId);
      return {
        id: s.id,
        quizId: s.quizId,
        quizTitle: quiz?.title || 'اختبار',
        courseId: s.courseId,
        courseTitle: course?.title || 'مادة دراسية',
        score: s.score,
        maxScore: s.maxScore,
        correctCount: s.correctCount,
        totalQuestions: s.totalQuestions,
        timeSpentSeconds: s.timeSpentSeconds,
        submittedAt: s.submittedAt,
      };
    });

  const lecturesWatchedCount = Object.keys(
    store.lectureProgress?.[target.id] || {}
  ).length;
  const supportTicketsCount = (store.supportTickets || []).filter(
    (t) => t.userId === target.id
  ).length;
  const tasks = progress?.tasks || [];

  recordAdminAudit({
    actorId: req.currentUser!.id,
    actorName: req.currentUser!.name,
    action: 'user.profile_view',
    targetUserId: target.id,
    targetUserName: target.name,
    details: 'Viewed user profile and academic statistics',
    ip: getClientIp(req),
  });

  const canViewSensitive = hasUserPermission(req.currentUser, 'view_sensitive_data');
  const safeProfile = toSafeUser(target);
  res.json({
    user: canViewSensitive
      ? safeProfile
      : {
          ...safeProfile,
          email: maskEmail(safeProfile.email),
          phone: maskPhone(safeProfile.phone),
        },
    academicStats: {
      points: target.points,
      quizzesCompleted: target.quizzesCompleted,
      totalSubmissions: submissions.length,
      avgQuizScorePercent,
      enrolledCoursesCount: enrolledCourses.length,
      completedSummariesCount: progress?.completedSummaryIds?.length || 0,
      studyMinutes: progress?.studyMinutes || 0,
      tasksTotal: tasks.length,
      tasksCompleted: tasks.filter((t) => t.completed).length,
      gpaEntriesCount: (store.gpaTables?.[target.id] || []).length,
      lecturesWatchedCount,
      supportTicketsCount,
      enrolledCourses,
    },
    recentSubmissions,
  });
});

router.delete('/admin/users/:id', requireAuth, requirePermission('manage_students'), (req: AuthenticatedRequest, res) => {
  const targetId = req.params.id;
  const store = db.get();
  const target = store.users.find((u) => u.id === targetId);

  if (!target) {
    res.status(404).json({ error: 'المستخدم غير موجود.' });
    return;
  }

  if (target.isProtected || target.role === 'admin' || target.id === req.currentUser!.id) {
    res.status(403).json({ error: 'حساب الأدمن محمي ولا يمكن حذفه من المنصة.' });
    return;
  }

  store.users = store.users.filter((u) => u.id !== targetId);
  store.sessions = store.sessions.filter((s) => s.userId !== targetId);
  store.quizSubmissions = store.quizSubmissions.filter((s) => s.userId !== targetId);
  store.chatMessages = store.chatMessages.filter((m) => m.userId !== targetId);
  if (store.supportTickets) {
    store.supportTickets = store.supportTickets.filter((t) => t.userId !== targetId);
  }
  if (store.studentProgress) {
    delete store.studentProgress[targetId];
  }
  if (store.gpaTables) {
    delete store.gpaTables[targetId];
  }
  if (store.lectureProgress) {
    delete store.lectureProgress[targetId];
  }
  if (store.analytics?.visitors) {
    delete store.analytics.visitors[targetId];
  }
  db.save();

  recordAdminAudit({
    actorId: req.currentUser!.id,
    actorName: req.currentUser!.name,
    action: 'user.delete',
    targetUserId: targetId,
    targetUserName: target.name,
    details: `Deleted ${target.role} account (${target.email || target.phone})`,
    ip: getClientIp(req),
  });

  res.json({ ok: true, kickedUserId: targetId });
});

router.post('/admin/users/:id/suspend', requireAuth, requirePermission('manage_students'), (req: AuthenticatedRequest, res) => {
  const targetId = req.params.id;
  const { reason } = req.body as { reason?: string };
  const store = db.get();
  const target = store.users.find((u) => u.id === targetId);

  if (!target) {
    res.status(404).json({ error: 'المستخدم غير موجود.' });
    return;
  }

  if (target.isProtected || target.role === 'admin' || target.id === req.currentUser!.id) {
    res.status(403).json({ error: 'حساب الأدمن محمي ولا يمكن تعليقه.' });
    return;
  }

  const finalReason = reason?.trim() || 'تجاوز الحدود ومخالفة الشروط والأحكام';
  target.isSuspended = true;
  target.suspendedReason = finalReason;
  target.suspendedAt = new Date().toISOString();
  store.sessions = store.sessions.filter((s) => s.userId !== targetId);
  db.save();

  recordAdminAudit({
    actorId: req.currentUser!.id,
    actorName: req.currentUser!.name,
    action: 'user.suspend',
    targetUserId: target.id,
    targetUserName: target.name,
    details: finalReason,
    ip: getClientIp(req),
  });

  res.json({ user: toSafeUser(target) });
});

router.post('/admin/users/:id/unsuspend', requireAuth, requirePermission('manage_students'), (req: AuthenticatedRequest, res) => {
  const targetId = req.params.id;
  const store = db.get();
  const target = store.users.find((u) => u.id === targetId);

  if (!target) {
    res.status(404).json({ error: 'المستخدم غير موجود.' });
    return;
  }

  target.isSuspended = false;
  target.suspendedReason = undefined;
  target.suspendedAt = undefined;
  db.save();

  recordAdminAudit({
    actorId: req.currentUser!.id,
    actorName: req.currentUser!.name,
    action: 'user.activate',
    targetUserId: target.id,
    targetUserName: target.name,
    details: 'Reactivated user account',
    ip: getClientIp(req),
  });

  res.json({ user: toSafeUser(target) });
});

export default router;
