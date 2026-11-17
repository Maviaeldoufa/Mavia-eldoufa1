import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type {
  AdminAuditAction,
  AdminAuditLog,
  AdminOfficial,
  AdminPermissionKey,
  AdminRank,
  AppErrorLog,
  DatabaseSchema,
  SafeUser,
  User,
  UserRankBadge,
} from './types.ts';

const DB_FILE = process.env.MVIA_DB_FILE
  ? path.resolve(process.env.MVIA_DB_FILE)
  : path.resolve(process.cwd(), 'data', 'mafia-db.json');
const DATA_DIR = path.dirname(DB_FILE);
export const UPLOADS_DIR = process.env.MVIA_UPLOADS_DIR
  ? path.resolve(process.env.MVIA_UPLOADS_DIR)
  : path.resolve(process.cwd(), 'uploads');

const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
const MAX_BACKUP_FILES = 10;
const SENDER_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function getEmailDeliveryConfig(): {
  enabled: boolean;
  apiKey: string;
  fromEmail: string;
} {
  const rawEnabled = (process.env.EMAIL_ENABLED ?? 'false').trim().toLowerCase();
  const isEmailFeatureEnabled =
    rawEnabled === 'true' || rawEnabled === '1' || rawEnabled === 'yes';
  if (!isEmailFeatureEnabled) {
    return { enabled: false, apiKey: '', fromEmail: '' };
  }

  const apiKey = process.env.RESEND_API_KEY?.trim() || '';
  const fromEmail = process.env.EMAIL_FROM?.trim() || '';
  if (!apiKey || !fromEmail) {
    return { enabled: false, apiKey: '', fromEmail: '' };
  }
  const match = fromEmail.match(/<([^>]+)>/);
  const addressPart = (match ? match[1] : fromEmail).trim();
  if (!SENDER_EMAIL_REGEX.test(addressPart)) {
    return { enabled: false, apiKey: '', fromEmail: '' };
  }
  return { enabled: true, apiKey, fromEmail };
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, originalHash] = stored.split(':');
  if (!salt || !originalHash) return false;
  const hashBuf = crypto.scryptSync(password, salt, 64);
  const origBuf = Buffer.from(originalHash, 'hex');
  if (hashBuf.length !== origBuf.length) return false;
  return crypto.timingSafeEqual(hashBuf, origBuf);
}

export const ALL_ADMIN_PERMISSIONS: AdminPermissionKey[] = [
  'manage_ranks',
  'manage_officials',
  'manage_courses',
  'manage_quizzes',
  'manage_learning',
  'manage_community',
  'manage_students',
  'manage_support',
  'view_sensitive_data',
];

export const ADMIN_PERMISSIONS_CATALOG: Array<{
  key: AdminPermissionKey;
  labelAr: string;
  labelEn: string;
  descriptionAr: string;
  superAdminOnly?: boolean;
}> = [
  {
    key: 'manage_ranks',
    labelAr: 'إدارة الرتب والصلاحيات',
    labelEn: 'Manage Ranks & Permissions',
    descriptionAr: 'تعديل أسماء الرتب وتوزيع الصلاحيات (حصري للمدير العام).',
    superAdminOnly: true,
  },
  {
    key: 'manage_officials',
    labelAr: 'إدارة وتعيين المسؤولين',
    labelEn: 'Manage Officials & Contacts',
    descriptionAr: 'تفويض تعديل بيانات تواصل المسؤولين ونقلهم بين الأقسام غير السيادية.',
  },
  {
    key: 'manage_courses',
    labelAr: 'إدارة الكورسات والملخصات',
    labelEn: 'Manage Courses & Summaries',
    descriptionAr: 'إنشاء وتعديل وحذف الكورسات والمجلدات وملفات PDF.',
  },
  {
    key: 'manage_quizzes',
    labelAr: 'إدارة الاختبارات وبنوك الأسئلة',
    labelEn: 'Manage Quizzes & Exams',
    descriptionAr: 'إنشاء وحذف الاختبارات وتعديل مواعيدها ونقاطها.',
  },
  {
    key: 'manage_learning',
    labelAr: 'إدارة مسارات Learning والمحاضرات',
    labelEn: 'Manage Learning & Lectures',
    descriptionAr: 'إضافة وحذف المحاضرات والروابط التعليمية.',
  },
  {
    key: 'manage_community',
    labelAr: 'إدارة المجتمع والإعلانات والإشعارات',
    labelEn: 'Manage Community & Announcements',
    descriptionAr: 'إدارة الجروبات ومؤقتات الأخبار وإرسال الإشعارات.',
  },
  {
    key: 'manage_students',
    labelAr: 'إدارة حسابات الطلاب والحظر',
    labelEn: 'Manage Students & Moderation',
    descriptionAr: 'عرض دليل المستخدمين ومتابعة التقدم الأكاديمي وتفعيل أو حظر الحسابات.',
  },
  {
    key: 'manage_support',
    labelAr: 'إدارة تذاكر الدعم الفني',
    labelEn: 'Manage Support Tickets',
    descriptionAr: 'مراجعة بلاغات الطلاب والرد عليها وتحديث حالتها.',
  },
  {
    key: 'view_sensitive_data',
    labelAr: 'الاطلاع على البيانات الحساسة والتصدير',
    labelEn: 'View Sensitive Data & Exports',
    descriptionAr: 'كشف الإيميلات والهواتف الكاملة، تصدير CSV، سجلات التدقيق، تحليلات الزوار والنسخ الاحتياطي.',
  },
];

export function buildDefaultAdminRanks(): AdminRank[] {
  const now = new Date().toISOString();
  return [
    {
      id: 'rank-super-admin',
      slug: 'super_admin',
      nameAr: 'المدير العام',
      nameEn: 'Super Admin',
      description: 'القيادة العليا للمنصة مع كامل الصلاحيات وإدارة الرتب وتوزيع المسؤولين.',
      badgeIcon: 'crown',
      badgeColor: 'gold',
      displayOrder: 1,
      isSuperAdminRank: true,
      isVisibleInSupport: true,
      permissions: [...ALL_ADMIN_PERMISSIONS],
      updatedAt: now,
    },
    {
      id: 'rank-deputy-director',
      slug: 'deputy_director',
      nameAr: 'نائب المدير العام',
      nameEn: 'Deputy General Manager',
      description: 'ينوب عن المدير العام في الإشراف والتشغيل وفق الصلاحيات المفوضة فقط.',
      badgeIcon: 'medal',
      badgeColor: 'silver',
      displayOrder: 2,
      isSuperAdminRank: false,
      isVisibleInSupport: true,
      permissions: [],
      updatedAt: now,
    },
    {
      id: 'rank-tech-director',
      slug: 'tech_director',
      nameAr: 'مدير النظام والتقنية',
      nameEn: 'Systems & Tech Director',
      description: 'مسؤول البنية التقنية والأنظمة والأعطال الفنية.',
      badgeIcon: 'cpu',
      badgeColor: 'sky',
      displayOrder: 3,
      isSuperAdminRank: false,
      isVisibleInSupport: true,
      permissions: [],
      updatedAt: now,
    },
    {
      id: 'rank-academic-director',
      slug: 'academic_director',
      nameAr: 'مدير الشؤون التعليمية',
      nameEn: 'Academic Affairs Director',
      description: 'الإشراف على المناهج والمسارات التعليمية والمواد الدراسية.',
      badgeIcon: 'graduation-cap',
      badgeColor: 'emerald',
      displayOrder: 4,
      isSuperAdminRank: false,
      isVisibleInSupport: true,
      permissions: [],
      updatedAt: now,
    },
    {
      id: 'rank-student-affairs',
      slug: 'student_affairs',
      nameAr: 'مسؤول شؤون الطلاب',
      nameEn: 'Student Affairs Officer',
      description: 'متابعة حسابات الطلاب واستفسارات الفرق الدراسية.',
      badgeIcon: 'users',
      badgeColor: 'violet',
      displayOrder: 5,
      isSuperAdminRank: false,
      isVisibleInSupport: true,
      permissions: [],
      updatedAt: now,
    },
    {
      id: 'rank-tech-support',
      slug: 'tech_support',
      nameAr: 'مسؤول الدعم الفني',
      nameEn: 'Technical Support Officer',
      description: 'استقبال البلاغات ومساعدة الطلاب في مشاكل الدخول والاستخدام.',
      badgeIcon: 'headset',
      badgeColor: 'amber',
      displayOrder: 6,
      isSuperAdminRank: false,
      isVisibleInSupport: true,
      permissions: [],
      updatedAt: now,
    },
    {
      id: 'rank-exams-content',
      slug: 'exams_content',
      nameAr: 'مسؤول الاختبارات والمحتوى',
      nameEn: 'Exams & Content Officer',
      description: 'متابعة بنوك الأسئلة والاختبارات والملخصات الدراسية.',
      badgeIcon: 'clipboard-check',
      badgeColor: 'rose',
      displayOrder: 7,
      isSuperAdminRank: false,
      isVisibleInSupport: true,
      permissions: [],
      updatedAt: now,
    },
  ];
}

export function isUserSuperAdmin(user: User | undefined): boolean {
  if (!user || user.role !== 'admin') return false;
  if (user.adminRankId === 'rank-super-admin') return true;
  if (user.isProtected && !user.adminRankId) return true;
  return false;
}

export function getUserEffectiveRank(user: User | undefined): AdminRank | undefined {
  if (!user || user.role !== 'admin') return undefined;
  const store = db.get();
  const ranks = store.adminRanks || [];
  if (user.adminRankId) {
    return ranks.find((r) => r.id === user.adminRankId);
  }
  if (user.isProtected) {
    return ranks.find((r) => r.isSuperAdminRank || r.id === 'rank-super-admin');
  }
  return undefined;
}

export function getUserPermissions(user: User | undefined): AdminPermissionKey[] {
  if (!user || user.role !== 'admin') return [];
  if (isUserSuperAdmin(user)) {
    return [...ALL_ADMIN_PERMISSIONS];
  }
  const rank = getUserEffectiveRank(user);
  if (!rank) return [];
  return Array.isArray(rank.permissions)
    ? rank.permissions.filter((p) => p !== 'manage_ranks')
    : [];
}

export function hasUserPermission(
  user: User | undefined,
  permission: AdminPermissionKey
): boolean {
  if (!user || user.role !== 'admin') return false;
  if (isUserSuperAdmin(user)) return true;
  return getUserPermissions(user).includes(permission);
}

export function getUserRankBadge(user: User | undefined): UserRankBadge | undefined {
  const rank = getUserEffectiveRank(user);
  if (!rank) return undefined;
  return {
    rankId: rank.id,
    nameAr: rank.nameAr,
    nameEn: rank.nameEn,
    badgeIcon: rank.badgeIcon,
    badgeColor: rank.badgeColor,
    isSuperAdminRank: rank.isSuperAdminRank,
  };
}

export function toSafeUser(user: User): SafeUser {
  const {
    passwordHash: _ignored,
    emailVerificationTokenHash: _ignoredToken,
    emailVerificationExpiresAt: _ignoredExpiry,
    ...safe
  } = user;
  const superAdmin = isUserSuperAdmin(user);
  const rank = getUserEffectiveRank(user);
  const rankBadge = rank
    ? {
        rankId: rank.id,
        nameAr: rank.nameAr,
        nameEn: rank.nameEn,
        badgeIcon: rank.badgeIcon,
        badgeColor: rank.badgeColor,
        isSuperAdminRank: rank.isSuperAdminRank,
      }
    : undefined;

  return {
    ...safe,
    email: safe.email || '',
    phone: safe.phone || '',
    adminRankId: rank?.id || safe.adminRankId,
    isSuperAdmin: superAdmin,
    permissions: getUserPermissions(user),
    rankBadge,
    emailVerified: Boolean(safe.emailVerified),
    lastLoginAt: safe.lastLoginAt,
  };
}

export function toLeaderboardUser(user: User): SafeUser {
  return {
    id: user.id,
    name: user.name,
    email: '',
    phone: '',
    year: user.year,
    role: user.role,
    adminRankId: user.role === 'admin' ? getUserEffectiveRank(user)?.id : undefined,
    rankBadge: user.role === 'admin' ? getUserRankBadge(user) : undefined,
    isProtected: false,
    points: user.points,
    quizzesCompleted: user.quizzesCompleted,
    emailVerified: Boolean(user.emailVerified),
    createdAt: user.createdAt,
  };
}

function buildSeedData(): DatabaseSchema {
  const now = new Date().toISOString();

  const users: User[] = [
    {
      id: 'user-founder-admin',
      name: 'القائد — أدمن MAVIA',
      email: 'admin@mvia.edu',
      phone: '01000000000',
      passwordHash: hashPassword('admin123'),
      year: 4,
      role: 'admin',
      adminRankId: 'rank-super-admin',
      isProtected: true,
      points: 980,
      quizzesCompleted: 12,
      createdAt: now,
    },
    {
      id: 'user-std-1',
      name: 'أحمد طارق المنسي',
      email: 'ahmed.tarek@mavia.edu',
      phone: '01011112222',
      passwordHash: hashPassword('123456'),
      year: 4,
      role: 'student',
      isProtected: false,
      points: 890,
      quizzesCompleted: 10,
      createdAt: now,
    },
    {
      id: 'user-std-2',
      name: 'مريم حسام الدين',
      email: 'mariam.hossam@mavia.edu',
      phone: '01022223333',
      passwordHash: hashPassword('123456'),
      year: 3,
      role: 'student',
      isProtected: false,
      points: 840,
      quizzesCompleted: 9,
      createdAt: now,
    },
    {
      id: 'user-std-3',
      name: 'يوسف خالد الشناوي',
      email: 'youssef.khaled@mavia.edu',
      phone: '01033334444',
      passwordHash: hashPassword('123456'),
      year: 2,
      role: 'student',
      isProtected: false,
      points: 760,
      quizzesCompleted: 8,
      createdAt: now,
    },
    {
      id: 'user-std-4',
      name: 'نورهان عبد الرحمن',
      email: 'norhan.abdelrahman@mavia.edu',
      phone: '01044445555',
      passwordHash: hashPassword('123456'),
      year: 1,
      role: 'student',
      isProtected: false,
      points: 710,
      quizzesCompleted: 7,
      createdAt: now,
    },
    {
      id: 'user-std-5',
      name: 'عمر محمد فتحي',
      email: 'omar.fathy@mavia.edu',
      phone: '01055556666',
      passwordHash: hashPassword('123456'),
      year: 3,
      role: 'student',
      isProtected: false,
      points: 685,
      quizzesCompleted: 7,
      createdAt: now,
    },
    {
      id: 'user-std-6',
      name: 'سلمى إيهاب نبيل',
      email: 'salma.ehab@mavia.edu',
      phone: '01066667777',
      passwordHash: hashPassword('123456'),
      year: 1,
      role: 'student',
      isProtected: false,
      points: 640,
      quizzesCompleted: 6,
      createdAt: now,
    },
  ];

  const courses = [
    {
      id: 'course-gis-101',
      title: 'مقدمة في نظم المعلومات الجغرافية (GIS)',
      code: 'GIS-101',
      year: 1 as const,
      track: 'GIS' as const,
      description:
        'الأسس النظرية والعملية لنظم المعلومات الجغرافية، أنواع البيانات المكانية (Vector & Raster)، وأنظمة الإحداثيات والمساقط.',
      instructor: 'د. شريف عبد العزيز',
      createdAt: now,
    },
    {
      id: 'course-prog-102',
      title: 'أساسيات البرمجة وحل المشكلات بـ Python',
      code: 'CS-102',
      year: 1 as const,
      track: 'Programming' as const,
      description:
        'مدخل شامل للخوارزميات، هياكل البيانات الأساسية، والبرمجة بلغة بايثون كقاعدة للتطبيقات الهندسية والمكانية.',
      instructor: 'م. كريم النجار',
      createdAt: now,
    },
    {
      id: 'course-gis-201',
      title: 'الاستشعار عن بُعد وتحليل المرئيات الفضائية',
      code: 'RS-201',
      year: 2 as const,
      track: 'GIS' as const,
      description:
        'تحليل صور الأقمار الصناعية، التصنيف الموجه وغير الموجه، ومؤشرات الغطاء النباتي NDVI باستخدام ArcGIS Pro و ENVI.',
      instructor: 'د. هبة مصطفى',
      createdAt: now,
    },
    {
      id: 'course-prog-202',
      title: 'قواعد البيانات العلائقية والمكانية (SQL & PostGIS)',
      code: 'DB-202',
      year: 2 as const,
      track: 'Programming' as const,
      description:
        'تصميم قواعد البيانات، استعلامات SQL المتقدمة، وتخزين وتحليل الهندسات المكانية باستخدام PostgreSQL / PostGIS.',
      instructor: 'م. طارق محمود',
      createdAt: now,
    },
    {
      id: 'course-gis-301',
      title: 'أتمتة التحليلات المكانية بـ ArcPy و PyQGIS',
      code: 'GIS-301',
      year: 3 as const,
      track: 'GIS' as const,
      description:
        'كتابة سكريبتات بايثون لأتمتة عمليات المعالجة الجغرافية Geoprocessing وبناء أدوات مخصصة داخل بيئات GIS.',
      instructor: 'د. وائل علام',
      createdAt: now,
    },
    {
      id: 'course-prog-302',
      title: 'تطوير تطبيقات الويب التفاعلية (React & TypeScript)',
      code: 'WEB-302',
      year: 3 as const,
      track: 'Programming' as const,
      description:
        'بناء واجهات ويب حديثة، إدارة الحالة، والتكامل مع خرائط الويب التفاعلية Leaflet و Mapbox عبر REST APIs.',
      instructor: 'م. زياد حسني',
      createdAt: now,
    },
    {
      id: 'course-gis-401',
      title: 'نظم المعلومات الجغرافية على الويب (Web GIS) والتحليل الشبكي',
      code: 'GIS-401',
      year: 4 as const,
      track: 'GIS' as const,
      description:
        'نشر الخدمات المكانية GeoServer، تحليل الشبكات Network Analysis، وتطبيقات المدن الذكية ومشاريع التخرج.',
      instructor: 'أ.د. مجدي سليمان',
      createdAt: now,
    },
    {
      id: 'course-prog-402',
      title: 'هندسة البرمجيات والذكاء الاصطناعي الجغرافي (GeoAI)',
      code: 'AI-402',
      year: 4 as const,
      track: 'Programming' as const,
      description:
        'توظيف نماذج التعلم العميق في استخراج المعالم من المرئيات الفضائية وبناء أنظمة برمجية قابلة للتوسع.',
      instructor: 'د. أميرة شوقي',
      createdAt: now,
    },
  ];

  const folders = [
    {
      id: 'folder-gis-101-mid',
      courseId: 'course-gis-101',
      name: 'مجلد المراجعة الشاملة وبنك الأسئلة',
      description: 'يحتوي على ملخص الأساسيات مع اختبار تفاعلي من بنك الأسئلة العشوائي بمؤقت.',
      createdAt: now,
    },
  ];

  const summaries = [
    {
      id: 'sum-1',
      courseId: 'course-gis-101',
      folderId: 'folder-gis-101-mid',
      title: 'ملخص الفصل الأول: مقارنة Vector مقابل Raster وأنظمة الإحداثيات',
      description:
        'ملخص مركز يوضح الفروق الجوهرية بين البيانات الخطية والشبكية، أنظمة WGS84 و UTM، وأخطاء الإسقاط الخرائطي الشائعة.',
      viewedBy: [],
      createdBy: 'القائد — أدمن MAVIA',
      createdAt: now,
    },
    {
      id: 'sum-2',
      courseId: 'course-prog-102',
      title: 'ملخص هياكل البيانات في Python (Lists, Dicts, Sets)',
      description:
        'أمثلة عملية مختصرة على الحلقات التكرارية والدوال وهياكل البيانات مع مسائل محلولة للامتحان.',
      viewedBy: [],
      createdBy: 'القائد — أدمن MAVIA',
      createdAt: now,
    },
    {
      id: 'sum-3',
      courseId: 'course-gis-401',
      title: 'دليل مشروع التخرج: إعداد GeoServer وربط الطبقات بـ Web GIS',
      description:
        'خطوات عملية كاملة لرفع طبقات Shapefile و GeoJSON ونشر خدمات WMS / WFS.',
      viewedBy: [],
      createdBy: 'القائد — أدمن MAVIA',
      createdAt: now,
    },
  ];

  const quizzes = [
    {
      id: 'quiz-gis-101-a',
      courseId: 'course-gis-101',
      folderId: 'folder-gis-101-mid',
      title: 'اختبار شامل (بنك أسئلة عشوائي): أساسيات GIS والإسقاط الخرائطي',
      durationMinutes: 10,
      pointsPerQuestion: 25,
      randomizeQuestions: true,
      randomizeOptions: true,
      questionsPerAttempt: 4,
      createdAt: now,
      questions: [
        {
          id: 'q1',
          question: 'أي نوع من البيانات المكانية يمثل الظواهر المستمرة مثل الارتفاعات ودرجات الحرارة بأفضل دقة؟',
          options: ['بيانات Vector (النقاط)', 'بيانات Raster (الشبكية)', 'جداول CSV فقط', 'بيانات CAD الخطية'],
          correctIndex: 1,
          explanation: 'البيانات الشبكية Raster تعتمد على خلايا متجاورة (Pixels) مما يجعلها مثالية لتمثيل الظواهر المتصلة.',
        },
        {
          id: 'q2',
          question: 'ما هو المرجع الجيوديسي العالمي القياسي المستخدم في أجهزة GPS وبيانات WGS84؟',
          options: ['NAD27', 'WGS 1984', 'ED50', 'Helmert 1906'],
          correctIndex: 1,
          explanation: 'نظام WGS84 هو المرجع العالمي المعتمد لنظام تحديد المواقع العالمي GPS.',
        },
        {
          id: 'q3',
          question: 'أي أداة تحليل مكاني تُستخدم لإنشاء نطاق مسافة محدد حول طريق أو نهر؟',
          options: ['Clip', 'Buffer', 'Dissolve', 'Intersect'],
          correctIndex: 1,
          explanation: 'أداة Buffer تنشئ مضلعاً حول المعلم بمسافة محددة لقياس التأثير المكاني.',
        },
        {
          id: 'q4',
          question: 'تُقاس الإحداثيات في نظام UTM (Universal Transverse Mercator) بوحدة:',
          options: ['الدرجات العشرية', 'المتر', 'الراديان', 'الدقائق القوسية'],
          correctIndex: 1,
          explanation: 'نظام UTM هو نظام إسقاط متري مستوٍ يقيس المسافات بالمتر شرقاً وشمالاً.',
        },
        {
          id: 'q5',
          question: 'أي من الأشكال الهندسية التالية لا ينتمي إلى نموذج Vector؟',
          options: ['Point (نقطة)', 'Line (خط)', 'Polygon (مضلع)', 'Pixel Grid (شبكة بكسلات)'],
          correctIndex: 3,
          explanation: 'شبكة البكسلات Pixel Grid هي اساس النموذج الشبكي Raster وليست Vector.',
        },
        {
          id: 'q6',
          question: 'الأداة التي تدمج المضلعات المتجاورة التي تشترك في نفس القيمة الوصفية هي:',
          options: ['Erase', 'Dissolve', 'Buffer', 'Clip'],
          correctIndex: 1,
          explanation: 'أداة Dissolve تقوم بتوحيد المعالم المتجاورة بناءً على حقل وصفي مشترك.',
        },
      ],
    },
    {
      id: 'quiz-prog-102-a',
      courseId: 'course-prog-102',
      title: 'اختبار أساسيات البرمجة وهياكل البيانات في Python',
      durationMinutes: 12,
      pointsPerQuestion: 25,
      randomizeQuestions: true,
      randomizeOptions: true,
      questionsPerAttempt: 0,
      createdAt: now,
      questions: [
        {
          id: 'pq1',
          question: 'ما هي الكلمة المفتاحية لتعريف دالة Function في لغة Python؟',
          options: ['function', 'def', 'func', 'define'],
          correctIndex: 1,
          explanation: 'في Python تُعرّف الدوال باستخدام الكلمة المفتاحية def.',
        },
        {
          id: 'pq2',
          question: 'أي بنية بيانات في Python تُخزّن القيم على هيئة أزواج (Key: Value)؟',
          options: ['Tuple', 'List', 'Dictionary', 'Set'],
          correctIndex: 2,
          explanation: 'القاموس Dictionary يُخزن البيانات بنظام المفتاح والقيمة.',
        },
        {
          id: 'pq3',
          question: 'ما ناتج التعبير التالي في بايثون: len([10, 20, 30, 40])؟',
          options: ['3', '4', '40', 'خطأ برمجي'],
          correctIndex: 1,
          explanation: 'الدالة len تُرجع عدد العناصر في القائمة وهو 4.',
        },
      ],
    },
    {
      id: 'quiz-gis-401-a',
      courseId: 'course-gis-401',
      title: 'اختبار Web GIS والتحليل الشبكي المتقدم',
      durationMinutes: 15,
      pointsPerQuestion: 30,
      randomizeQuestions: true,
      randomizeOptions: true,
      questionsPerAttempt: 0,
      createdAt: now,
      questions: [
        {
          id: 'wq1',
          question: 'ما هي الصيغة القياسية المبنية على JSON لتبادل البيانات المكانية على الويب؟',
          options: ['GeoTIFF', 'GeoJSON', 'KML Binary', 'DBF'],
          correctIndex: 1,
          explanation: 'GeoJSON هي الصيغة المفتوحة المعتمدة في تطبيقات خرائط الويب مثل Leaflet و Mapbox.',
        },
        {
          id: 'wq2',
          question: 'أي خدمة OGC تُرجع البيانات الوصفية والهندسية القابلة للتعديل والاستعلام كمعالم؟',
          options: ['WMS', 'WFS', 'WMTS', 'TMS'],
          correctIndex: 1,
          explanation: 'خدمة WFS (Web Feature Service) تتيح الوصول المباشر للهندسة والبيانات الوصفية وليس مجرد صور.',
        },
        {
          id: 'wq3',
          question: 'يعتمد تحليل إيجاد أقصر مسار Shortest Path في شبكات الطرق غالباً على خوارزمية:',
          options: ['K-Means', 'Dijkstra', 'NDVI', 'Kriging'],
          correctIndex: 1,
          explanation: 'خوارزمية Dijkstra هي الأساس الكلاسيكي لإيجاد أقصر مسار موزون في الشبكات.',
        },
      ],
    },
  ];

  const lectures = [
    {
      id: 'lec-gis-101',
      title: 'المحاضرة التمهيدية: مدخل إلى نظم المعلومات الجغرافية (GIS) وتطبيقاتها الهندسية',
      description:
        'شرح تفاعلي في مشغل MAVIA الاحترافي مع دعم حفظ مكان التوقف تلقائياً، سرعات التشغيل، الترجمة القابلة للإغلاق، والملاحظات المرتبطة بالوقت.',
      category: 'GIS' as const,
      year: 0 as const,
      instructor: 'م. محمود حيدر يوسف — إدارة MAVIA',
      videoUrl: '/assets/mvia-gis-intro.mp4',
      subtitleUrl: '/assets/mvia-gis-intro.vtt',
      attachmentUrl: '/assets/mvia-gis-intro.vtt',
      attachmentName: 'MAVIA-GIS-Transcript.vtt',
      attachmentSize: 980,
      allowDownload: true,
      durationSeconds: 40,
      createdBy: 'القائد — أدمن MAVIA',
      createdAt: now,
    },
  ];

  const notifications = [
    {
      id: 'notif-welcome-mvia',
      title: 'أهلاً بكم في التحديث الجديد لمنصة MAVIA',
      message:
        'تم إضافة مشغل المحاضرات الاحترافي في قسم Learning ونظام الامتحانات المتطور ببنك الأسئلة العشوائي داخل كل مجلد.',
      type: 'general' as const,
      targetSection: 'learning' as const,
      year: 0 as const,
      readBy: [],
      createdBy: 'القائد — أدمن MAVIA',
      createdAt: now,
    },
    {
      id: 'notif-exam-mid',
      title: 'تنبيه امتحان: مراجعة أساسيات GIS متاحة الآن',
      message:
        'يمكنكم الآن دخول مجلد المراجعة الشاملة في مادة GIS-101 وتجربة الاختبار العشوائي بالمؤقت وتحليل الأخطاء.',
      type: 'exam' as const,
      targetSection: 'courses' as const,
      year: 0 as const,
      readBy: [],
      createdBy: 'القائد — أدمن MAVIA',
      createdAt: now,
    },
  ];

  const learningLinks = [
    {
      id: 'learn-1',
      title: 'دورة تعلم QGIS الاحترافية كاملة من الصفر',
      url: 'https://www.youtube.com/results?search_query=QGIS+tutorial+arabic',
      type: 'youtube' as const,
      category: 'GIS' as const,
      year: 0 as const,
      description: 'سلسلة شروحات عملية لتعلم واجهة QGIS وبناء الخرائط وتحليل الطبقات.',
      createdAt: now,
    },
    {
      id: 'learn-2',
      title: 'أكاديمية Esri التدريبية الرسمية (Esri Training)',
      url: 'https://www.esri.com/training/',
      type: 'platform' as const,
      category: 'GIS' as const,
      year: 0 as const,
      description: 'مسارات تعليمية مجانية ومعتمدة في ArcGIS Pro والتحليل المكاني.',
      createdAt: now,
    },
    {
      id: 'learn-3',
      title: 'تعلّم Python للبرمجة والبيانات — شروحات يوتيوب',
      url: 'https://www.youtube.com/results?search_query=python+full+course+arabic',
      type: 'youtube' as const,
      category: 'Programming' as const,
      year: 1 as const,
      description: 'كورس بايثون تأسيسي يغطي المتغيرات والدوال وهياكل البيانات والمشاريع.',
      createdAt: now,
    },
    {
      id: 'learn-4',
      title: 'خرائط التعلم البرمجية (roadmap.sh)',
      url: 'https://roadmap.sh/',
      type: 'platform' as const,
      category: 'Programming' as const,
      year: 0 as const,
      description: 'دليل تفاعلي متكامل لمسارات الويب، الباك إند، قواعد البيانات، والذكاء الاصطناعي.',
      createdAt: now,
    },
    {
      id: 'learn-5',
      title: 'موسوعة مطوري الويب MDN Web Docs',
      url: 'https://developer.mozilla.org/ar/',
      type: 'platform' as const,
      category: 'Programming' as const,
      year: 3 as const,
      description: 'المرجع الأساسي لتقنيات HTML و CSS و JavaScript وواجهات البرمجة.',
      createdAt: now,
    },
    {
      id: 'learn-6',
      title: 'سلسلة الاستشعار عن بُعد وتحليل المرئيات الفضائية',
      url: 'https://www.youtube.com/results?search_query=remote+sensing+gis+arabic',
      type: 'youtube' as const,
      category: 'GIS' as const,
      year: 2 as const,
      description: 'تطبيقات عملية على صور Landsat و Sentinel ومؤشرات الغطاء النباتي.',
      createdAt: now,
    },
  ];

  const groupLinks = [
    {
      id: 'grp-general',
      title: 'جروب MAVIA العام — GIS والبرمجة',
      url: 'https://t.me/+201159637247',
      platform: 'Telegram' as const,
      year: 0 as const,
      description: 'الملتقى الرئيسي لجميع الدفعات لتبادل الفرص والمصادر والمشاريع المشتركة.',
      createdAt: now,
    },
    {
      id: 'grp-y1',
      title: 'جروب دفعة الفرقة الأولى',
      url: 'https://wa.me/201159637247',
      platform: 'WhatsApp' as const,
      year: 1 as const,
      description: 'متابعة محاضرات وسكاشن الفرقة الأولى وتوزيع الملخصات الأسبوعية.',
      createdAt: now,
    },
    {
      id: 'grp-y2',
      title: 'جروب دفعة الفرقة الثانية',
      url: 'https://t.me/+201159637247',
      platform: 'Telegram' as const,
      year: 2 as const,
      description: 'نقاشات مواد الاستشعار عن بُعد وقواعد البيانات المكانية.',
      createdAt: now,
    },
    {
      id: 'grp-y3',
      title: 'جروب دفعة الفرقة الثالثة',
      url: 'https://t.me/+201159637247',
      platform: 'Telegram' as const,
      year: 3 as const,
      description: 'تنسيق مشاريع الويب والأتمتة بـ ArcPy و PyQGIS.',
      createdAt: now,
    },
    {
      id: 'grp-y4',
      title: 'جروب دفعة الفرقة الرابعة — مشاريع التخرج',
      url: 'https://discord.com/',
      platform: 'Discord' as const,
      year: 4 as const,
      description: 'تجمع خريجي MAVIA لمناقشة Web GIS ومشاريع التخرج والتدريب المهني.',
      createdAt: now,
    },
  ];

  const chatMessages = [
    {
      id: 'msg-1',
      room: 'general',
      userId: 'user-founder-admin',
      userName: 'القائد — أدمن MAVIA',
      userRole: 'admin' as const,
      userYear: 4 as const,
      text: 'أهلاً بكم في منصة MAVIA! هذه الساحة مخصصة للتواصل الفوري بين طلاب جميع الدفعات في GIS والبرمجة.',
      createdAt: now,
    },
    {
      id: 'msg-2',
      room: 'year-4',
      userId: 'user-std-1',
      userName: 'أحمد طارق المنسي',
      userRole: 'student' as const,
      userYear: 4 as const,
      text: 'شباب دفعة رابعة، ملخص إعداد GeoServer موجود في قسم الكورسات وممتاز جداً لمشاريع التخرج.',
      createdAt: now,
    },
  ];

  const fiveDaysLater = new Date(Date.now() + 5 * 86400000).toISOString();
  const twoDaysLater = new Date(Date.now() + 2 * 86400000).toISOString();

  const announcements = [
    {
      id: 'ann-exam-1',
      scope: 'home' as const,
      title: 'موعد امتحانات الميدتيرم العملية — GIS والبرمجة',
      description: 'استعدوا بمراجعة الملخصات والاختبارات الشاملة في قسم الكورسات.',
      category: 'exam' as const,
      targetAt: fiveDaysLater,
      createdAt: now,
    },
    {
      id: 'ann-course-1',
      scope: 'courses' as const,
      title: 'تنزيل حزمة المراجعات النهائية والنماذج الاسترشادية',
      description: 'سيتم إتاحة ملفات المراجعة المكثفة لجميع الدفعات فور انتهاء المؤقت.',
      category: 'release' as const,
      targetAt: twoDaysLater,
      createdAt: now,
    },
  ];

  return {
    users,
    sessions: [],
    courses,
    folders,
    summaries,
    assignments: [],
    quizzes,
    quizSubmissions: [],
    announcements,
    notifications,
    lectures,
    lectureProgress: {},
    analytics: {
      totalVisits: 0,
      dailyCounts: {},
      visitors: {},
    },
    platformConfig: {
      whatsappNumber: '01159637247',
      telegramUrl: 'https://t.me/+201159637247',
    },
    learningLinks,
    groupLinks,
    chatMessages,
    gpaTables: {},
    studentProgress: {},
    supportTickets: [],
    errorLogs: [],
    maintenance: {
      enabled: false,
      message: 'نقوم حالياً بأعمال صيانة وتحديثات لتحسين أداء المنصة. سنعود قريباً.',
    },
    adminAuditLogs: [],
    adminRanks: buildDefaultAdminRanks(),
    adminOfficials: [],
  };
}

function normalizeLoadedStore(data: DatabaseSchema): DatabaseSchema {
  if (!data.studentProgress) data.studentProgress = {};
  if (!data.folders) data.folders = [];
  if (!Array.isArray(data.assignments)) data.assignments = [];
  if (!data.announcements) data.announcements = [];
  if (!data.notifications) data.notifications = buildSeedData().notifications;
  if (!data.lectures) data.lectures = buildSeedData().lectures;
  if (!data.lectureProgress) data.lectureProgress = {};
  if (!data.analytics) {
    data.analytics = {
      totalVisits: 0,
      dailyCounts: {},
      visitors: {},
    };
  }
  if (!data.platformConfig) {
    data.platformConfig = {
      whatsappNumber: '01159637247',
      telegramUrl: 'https://t.me/+201159637247',
    };
  }
  if (!Array.isArray(data.supportTickets)) data.supportTickets = [];
  if (!Array.isArray(data.errorLogs)) data.errorLogs = [];
  if (!Array.isArray(data.adminAuditLogs)) data.adminAuditLogs = [];
  if (!Array.isArray(data.adminRanks) || data.adminRanks.length === 0) {
    data.adminRanks = buildDefaultAdminRanks();
  } else {
    const defaults = buildDefaultAdminRanks();
    const existingIds = new Set(data.adminRanks.map((r) => r.id));
    for (const def of defaults) {
      if (!existingIds.has(def.id)) {
        data.adminRanks.push(def);
      }
    }
    const superRank = data.adminRanks.find((r) => r.id === 'rank-super-admin');
    if (superRank) {
      superRank.isSuperAdminRank = true;
      superRank.permissions = [...ALL_ADMIN_PERMISSIONS];
    }
  }
  if (!Array.isArray(data.adminOfficials)) data.adminOfficials = [];
  for (const u of data.users || []) {
    if (u.role === 'admin' && u.isProtected && !u.adminRankId) {
      u.adminRankId = 'rank-super-admin';
    }
  }
  if (!data.maintenance) {
    data.maintenance = {
      enabled: false,
      message: 'نقوم حالياً بأعمال صيانة وتحديثات لتحسين أداء المنصة. سنعود قريباً.',
    };
  }
  return data;
}

class MafiaStore {
  private data: DatabaseSchema;

  constructor() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }
    if (!fs.existsSync(BACKUPS_DIR)) {
      fs.mkdirSync(BACKUPS_DIR, { recursive: true });
    }

    if (fs.existsSync(DB_FILE)) {
      try {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        this.data = normalizeLoadedStore(JSON.parse(raw) as DatabaseSchema);
      } catch {
        this.data = buildSeedData();
        this.save();
      }
    } else {
      this.data = buildSeedData();
      this.save();
    }
  }

  public get(): DatabaseSchema {
    return this.data;
  }

  public replaceAll(nextData: DatabaseSchema): void {
    this.data = normalizeLoadedStore(nextData);
    this.save();
  }

  public save(): void {
    const tmpFile = `${DB_FILE}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(this.data, null, 2), 'utf-8');
    fs.renameSync(tmpFile, DB_FILE);
  }
}

export const db = new MafiaStore();

export interface BackupFileInfo {
  filename: string;
  size: number;
  createdAt: string;
}

function pruneOldBackups(): void {
  if (!fs.existsSync(BACKUPS_DIR)) return;
  const files = fs
    .readdirSync(BACKUPS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const fullPath = path.join(BACKUPS_DIR, f);
      const stat = fs.statSync(fullPath);
      return { filename: f, mtimeMs: stat.mtimeMs, fullPath };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  for (const extra of files.slice(MAX_BACKUP_FILES)) {
    try {
      fs.unlinkSync(extra.fullPath);
    } catch {
      // Ignore cleanup errors for old backup files
    }
  }
}

export function createBackupSnapshot(reason = 'manual'): BackupFileInfo {
  if (!fs.existsSync(BACKUPS_DIR)) {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  }
  const safeReason = reason.replace(/[^a-z0-9_-]/gi, '').slice(0, 20) || 'manual';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `mvia-backup-${stamp}-${safeReason}.json`;
  const targetPath = path.join(BACKUPS_DIR, filename);
  const tmpPath = `${targetPath}.tmp`;
  const payload = JSON.stringify(db.get(), null, 2);
  fs.writeFileSync(tmpPath, payload, 'utf-8');
  fs.renameSync(tmpPath, targetPath);
  const stat = fs.statSync(targetPath);
  pruneOldBackups();
  return {
    filename,
    size: stat.size,
    createdAt: stat.mtime.toISOString(),
  };
}

export function listBackupSnapshots(): BackupFileInfo[] {
  if (!fs.existsSync(BACKUPS_DIR)) return [];
  return fs
    .readdirSync(BACKUPS_DIR)
    .filter((f) => f.endsWith('.json') && /^mvia-backup-[a-z0-9._-]+\.json$/i.test(f))
    .map((f) => {
      const stat = fs.statSync(path.join(BACKUPS_DIR, f));
      return {
        filename: f,
        size: stat.size,
        createdAt: stat.mtime.toISOString(),
      };
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function getBackupFilePath(filename: string): string | null {
  const base = path.basename(filename);
  if (
    base !== filename ||
    !/^mvia-backup-[a-z0-9._-]+\.json$/i.test(base)
  ) {
    return null;
  }
  const fullPath = path.join(BACKUPS_DIR, base);
  if (!fs.existsSync(fullPath)) return null;
  return fullPath;
}

export function validateBackupSchema(candidate: unknown): candidate is DatabaseSchema {
  if (!candidate || typeof candidate !== 'object') return false;
  const obj = candidate as Partial<DatabaseSchema>;
  return (
    Array.isArray(obj.users) &&
    Array.isArray(obj.sessions) &&
    Array.isArray(obj.courses) &&
    Array.isArray(obj.summaries) &&
    Array.isArray(obj.quizzes) &&
    Array.isArray(obj.quizSubmissions) &&
    Array.isArray(obj.learningLinks) &&
    Array.isArray(obj.groupLinks) &&
    Array.isArray(obj.chatMessages) &&
    typeof obj.gpaTables === 'object' &&
    obj.gpaTables !== null
  );
}

export function restoreBackupSnapshot(nextData: DatabaseSchema): {
  preRestoreBackup: BackupFileInfo;
} {
  const preRestoreBackup = createBackupSnapshot('pre-restore');
  db.replaceAll(nextData);
  return { preRestoreBackup };
}

export function pushNotification(params: {
  title: string;
  message: string;
  type: 'course' | 'exam' | 'lecture' | 'announcement' | 'general';
  targetSection: 'home' | 'courses' | 'learning' | 'gpa' | 'community';
  year?: 0 | 1 | 2 | 3 | 4;
  createdBy: string;
}) {
  const store = db.get();
  if (!store.notifications) {
    store.notifications = [];
  }
  const item = {
    id: `notif-${crypto.randomUUID()}`,
    title: params.title,
    message: params.message,
    type: params.type,
    targetSection: params.targetSection,
    year: params.year ?? 0,
    readBy: [],
    createdBy: params.createdBy,
    createdAt: new Date().toISOString(),
  };
  store.notifications.unshift(item);
  if (store.notifications.length > 60) {
    store.notifications = store.notifications.slice(0, 60);
  }
  db.save();
  return item;
}

const errorAlertThrottle = new Map<string, number>();

export function recordAppError(params: {
  source: AppErrorLog['source'];
  message: string;
  path?: string;
  userId?: string;
  stack?: string;
  notifyAdmin?: boolean;
}): AppErrorLog {
  const store = db.get();
  if (!Array.isArray(store.errorLogs)) {
    store.errorLogs = [];
  }

  const entry: AppErrorLog = {
    id: `err-${crypto.randomUUID()}`,
    source: params.source,
    message: String(params.message || 'Unknown error').slice(0, 500),
    path: params.path ? String(params.path).slice(0, 200) : undefined,
    userId: params.userId,
    stack: params.stack ? String(params.stack).slice(0, 1200) : undefined,
    createdAt: new Date().toISOString(),
  };

  store.errorLogs.unshift(entry);
  if (store.errorLogs.length > 200) {
    store.errorLogs = store.errorLogs.slice(0, 200);
  }
  db.save();

  if (params.notifyAdmin && (params.source === 'server' || params.source === 'ai')) {
    const throttleKey = `${params.source}:${entry.message.slice(0, 60)}`;
    const now = Date.now();
    const lastAlert = errorAlertThrottle.get(throttleKey) || 0;
    if (now - lastAlert > 5 * 60 * 1000) {
      errorAlertThrottle.set(throttleKey, now);
      pushNotification({
        title: `تنبيه مراقبة الأخطاء (${params.source.toUpperCase()})`,
        message: `${entry.message}${entry.path ? ` — المسار: ${entry.path}` : ''}`,
        type: 'general',
        targetSection: 'home',
        year: 0,
        createdBy: 'نظام المراقبة التلقائي',
      });
    }
  }

  return entry;
}

export function recordAdminAudit(params: {
  actorId: string;
  actorName: string;
  action: AdminAuditAction;
  targetUserId?: string;
  targetUserName?: string;
  details?: string;
  ip?: string;
}): AdminAuditLog {
  const store = db.get();
  if (!Array.isArray(store.adminAuditLogs)) {
    store.adminAuditLogs = [];
  }

  const entry: AdminAuditLog = {
    id: `audit-${crypto.randomUUID()}`,
    actorId: params.actorId,
    actorName: params.actorName,
    action: params.action,
    targetUserId: params.targetUserId,
    targetUserName: params.targetUserName,
    details: params.details ? String(params.details).slice(0, 300) : undefined,
    ip: params.ip ? String(params.ip).slice(0, 80) : undefined,
    createdAt: new Date().toISOString(),
  };

  store.adminAuditLogs.unshift(entry);
  if (store.adminAuditLogs.length > 500) {
    store.adminAuditLogs = store.adminAuditLogs.slice(0, 500);
  }
  db.save();
  return entry;
}

if (process.env.MVIA_DISABLE_AUTO_BACKUP !== '1') {
  try {
    const existing = listBackupSnapshots();
    const latestMs = existing[0] ? new Date(existing[0].createdAt).getTime() : 0;
    if (!latestMs || Date.now() - latestMs > 60 * 60 * 1000) {
      createBackupSnapshot('startup');
    }
  } catch (err) {
    console.error('Startup backup snapshot failed:', err);
  }

  const autoBackupTimer = setInterval(() => {
    try {
      createBackupSnapshot('auto');
    } catch (err) {
      console.error('Scheduled backup snapshot failed:', err);
    }
  }, 6 * 60 * 60 * 1000);
  autoBackupTimer.unref();
}
