import { GoogleGenAI, Type } from '@google/genai';
import type { Part } from '@google/genai';
import crypto from 'crypto';
import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { requireAuth, requirePermission } from '../auth.ts';
import type { AuthenticatedRequest } from '../auth.ts';
import { db, hasUserPermission, pushNotification, recordAppError, toSafeUser, UPLOADS_DIR } from '../db.ts';
import { aiRateLimiter } from '../rateLimit.ts';
import type {
  AcademicYear,
  Course,
  CourseAssignment,
  CourseFolder,
  DatabaseSchema,
  QuizDifficulty,
  QuizQuestion,
  QuizQuestionBreakdown,
  SummaryCategory,
} from '../types.ts';
import { getOrInitStudentProgress } from './dashboardRoutes.ts';

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

const uploadPdf = multer({
  storage: diskStorage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (
      file.mimetype === 'application/pdf' ||
      file.originalname.toLowerCase().endsWith('.pdf')
    ) {
      cb(null, true);
    } else {
      cb(new Error('يُسمح برفع ملفات PDF فقط.'));
    }
  },
});

const ALLOWED_IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

const uploadImage = multer({
  storage: diskStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (file.mimetype.startsWith('image/') || ALLOWED_IMAGE_EXTS.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('يُسمح برفع ملفات الصور فقط (PNG, JPG, WEBP).'));
    }
  },
});

const uploadAssignmentFile = multer({
  storage: diskStorage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const isPdf = file.mimetype === 'application/pdf' || ext === '.pdf';
    const isImg = file.mimetype.startsWith('image/') || ALLOWED_IMAGE_EXTS.includes(ext);
    if (isPdf || isImg) {
      cb(null, true);
    } else {
      cb(new Error('يُسمح برفع صور (PNG, JPG, WEBP) أو ملفات PDF فقط.'));
    }
  },
});

function optionalSingleImage(fieldName: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.is('multipart/form-data')) {
      next();
      return;
    }
    uploadImage.single(fieldName)(req, res, (err) => {
      if (err) {
        res.status(400).json({ error: err.message || 'تعذر رفع صورة الغلاف.' });
        return;
      }
      next();
    });
  };
}

function optionalAssignmentUpload(fieldName: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.is('multipart/form-data')) {
      next();
      return;
    }
    uploadAssignmentFile.single(fieldName)(req, res, (err) => {
      if (err) {
        res.status(400).json({ error: err.message || 'تعذر رفع ملف التكليف.' });
        return;
      }
      next();
    });
  };
}

function removeUploadedFile(fileUrl?: string) {
  if (!fileUrl) return;
  const filePath = path.join(UPLOADS_DIR, path.basename(fileUrl));
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch {
      // Ignore cleanup error
    }
  }
}

function enrichFolder(folder: CourseFolder, store: DatabaseSchema) {
  const { viewedBy, ...rest } = folder;
  const viewsCount = Array.isArray(viewedBy) ? viewedBy.length : 0;
  const parentCourse = store.courses.find((c) => c.id === folder.courseId);
  const folderItems = store.summaries.filter((s) => s.folderId === folder.id);
  const booksCount = folderItems.filter((s) => s.category === 'book').length;
  const summariesCount = folderItems.filter((s) => s.category !== 'book').length;
  const quizzesCount = store.quizzes.filter((q) => q.folderId === folder.id).length;
  const assignmentsCount = (store.assignments || []).filter((a) => a.folderId === folder.id).length;

  return {
    ...rest,
    viewsCount,
    isTrending: viewsCount > 20,
    courseTitle: parentCourse?.title,
    courseCode: parentCourse?.code,
    courseYear: parentCourse?.year,
    courseTrack: parentCourse?.track,
    booksCount,
    summariesCount,
    quizzesCount,
    assignmentsCount,
  };
}

const MAX_AI_INLINE_BYTES = 14 * 1024 * 1024;

function getDifficultyPrompt(difficulty: QuizDifficulty): string {
  switch (difficulty) {
    case 'easy':
      return 'المستوى المطلوب: سهل (Easy) — ركّز على المفاهيم الأساسية، التعريفات المباشرة، والأسئلة الواضحة لاختبار الاستيعاب الأولي للمحتوى.';
    case 'hard':
      return 'المستوى المطلوب: صعب (Hard) — ضع أسئلة متقدمة تتطلب استنتاجاً عميقاً، مقارنات دقيقة، حل مشكلات، وربطاً متقدماً بين التفاصيل الدقيقة في محتوى المجلد.';
    default:
      return 'المستوى المطلوب: متوسط (Medium) — مزيج متوازن من أسئلة الفهم والتطبيق العملي والربط المنطقي بين أجزاء محتوى المجلد.';
  }
}

function getDifficultyLabelAr(difficulty: QuizDifficulty): string {
  if (difficulty === 'easy') return 'سهل';
  if (difficulty === 'hard') return 'صعب';
  return 'متوسط';
}

async function generateAiQuestionsFromFolder(params: {
  folder: CourseFolder;
  course: Course;
  store: DatabaseSchema;
  difficulty: QuizDifficulty;
  questionCount: number;
  customTitle?: string;
  userId?: string;
}): Promise<{ title: string; questions: QuizQuestion[] }> {
  const { folder, course, store, difficulty, questionCount, customTitle, userId } = params;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw Object.assign(new Error('مفتاح Gemini API غير مهيأ على الخادم.'), { statusCode: 500 });
  }

  const folderMaterials = store.summaries.filter((s) => s.folderId === folder.id);
  const folderAssignments = (store.assignments || []).filter((a) => a.folderId === folder.id);

  if (folderMaterials.length === 0 && folderAssignments.length === 0) {
    throw Object.assign(
      new Error('المجلد لا يحتوي على كتاب أو ملخصات أو تكليفات بعد. أضف محتوى للمجلد أولاً ليتم إنشاء الامتحان منه.'),
      { statusCode: 400 }
    );
  }

  const parts: Part[] = [];
  let accumulatedBytes = 0;

  for (const item of folderMaterials) {
    if (!item.fileUrl) continue;
    const filePath = path.join(UPLOADS_DIR, path.basename(item.fileUrl));
    if (!fs.existsSync(filePath)) continue;
    const stat = fs.statSync(filePath);
    if (accumulatedBytes + stat.size <= MAX_AI_INLINE_BYTES) {
      const buf = fs.readFileSync(filePath);
      parts.push({
        inlineData: {
          mimeType: 'application/pdf',
          data: buf.toString('base64'),
        },
      });
      accumulatedBytes += stat.size;
    }
  }

  for (const assign of folderAssignments) {
    if (!assign.fileUrl || (assign.type !== 'pdf' && assign.type !== 'image')) continue;
    const filePath = path.join(UPLOADS_DIR, path.basename(assign.fileUrl));
    if (!fs.existsSync(filePath)) continue;
    const stat = fs.statSync(filePath);
    if (accumulatedBytes + stat.size <= MAX_AI_INLINE_BYTES) {
      const buf = fs.readFileSync(filePath);
      const mimeType =
        assign.mimeType ||
        (assign.type === 'pdf' ? 'application/pdf' : 'image/jpeg');
      parts.push({
        inlineData: {
          mimeType,
          data: buf.toString('base64'),
        },
      });
      accumulatedBytes += stat.size;
    }
  }

  const booksAndSummariesText = folderMaterials
    .map(
      (item, idx) =>
        `${idx + 1}. [${item.category === 'book' ? 'كتاب المادة' : 'ملخص'}] ${item.title}\n   الوصف: ${item.description}${
          item.fileName ? `\n   ملف: ${item.fileName}` : ''
        }`
    )
    .join('\n\n');

  const assignmentsText = folderAssignments
    .map(
      (a, idx) =>
        `${idx + 1}. [تكليف - ${a.type}] ${a.title}${
          a.contentText ? `\n   النص: ${a.contentText}` : ''
        }${a.fileName ? `\n   ملف: ${a.fileName}` : ''}`
    )
    .join('\n\n');

  const safeCount = Math.min(20, Math.max(3, Math.floor(questionCount || 5)));

  const prompt = `أنت خبير تربوي وأكاديمي في منصة MAVIA التعليمية.
أنشئ امتحاناً تفاعلياً مكوناً من ${safeCount} أسئلة اختيار من متعدد (MCQ) معتمداً بشكل مباشر ودقيق على محتوى المجلد التالي فقط (الكتب، الملخصات، الملفات المرفقة، ونصوص التكليفات).

بيانات المادة والمجلد:
- المادة: ${course.title} (${course.code}) — الفرقة ${course.year}
- المجلد: ${folder.name}
${folder.description ? `- وصف المجلد: ${folder.description}` : ''}
- ${getDifficultyPrompt(difficulty)}

${booksAndSummariesText ? `الكتب والملخصات داخل المجلد:\n${booksAndSummariesText}\n` : ''}
${assignmentsText ? `التكليفات داخل المجلد:\n${assignmentsText}\n` : ''}

الشروط الإلزامية:
1. اكتب الأسئلة بنفس لغة المحتوى (العربية بالأساس مع المصطلحات الإنجليزية العلمية عند الحاجة).
2. كل سؤال يجب أن يحتوي على 4 خيارات بالضبط (options) واضحة ومميزة ولا تتكرر.
3. correctIndex يجب أن يكون رقماً صحيحاً بين 0 و 3 يطابق الإجابة الصحيحة بدقة.
4. أضف شرحاً علمياً موجزاً (explanation) لكل سؤال يوضح سبب صحة الإجابة من محتوى المجلد.
5. أرجع JSON صالحاً يطابق المخطط المطلوب فقط.`;

  parts.push({ text: prompt });

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: { parts },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            suggestedTitle: { type: Type.STRING },
            questions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  question: { type: Type.STRING },
                  options: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  correctIndex: { type: Type.INTEGER },
                  explanation: { type: Type.STRING },
                },
                required: ['question', 'options', 'correctIndex', 'explanation'],
              },
            },
          },
          required: ['questions'],
        },
      },
    });

    const rawText = (response.text || '').trim();
    const parsed = JSON.parse(rawText) as {
      suggestedTitle?: string;
      questions?: Array<{
        question?: string;
        options?: string[];
        correctIndex?: number;
        explanation?: string;
      }>;
    };

    const rawQuestions = Array.isArray(parsed.questions) ? parsed.questions : [];
    const formattedQuestions: QuizQuestion[] = rawQuestions
      .map((q) => {
        const opts = Array.isArray(q.options)
          ? q.options.map((o) => String(o || '').trim()).filter(Boolean).slice(0, 4)
          : [];
        if (!q.question?.trim() || opts.length < 2) return null;
        while (opts.length < 4) {
          opts.push(`خيار إضافي ${opts.length + 1}`);
        }
        const idx = Number(q.correctIndex);
        const safeCorrect =
          Number.isInteger(idx) && idx >= 0 && idx < opts.length ? idx : 0;
        return {
          id: `q-${crypto.randomUUID()}`,
          question: q.question.trim(),
          options: opts,
          correctIndex: safeCorrect,
          explanation: q.explanation?.trim() || undefined,
        };
      })
      .filter(Boolean) as QuizQuestion[];

    if (formattedQuestions.length === 0) {
      throw new Error('لم يتمكن الذكاء الاصطناعي من استخراج أسئلة صالحة من محتوى المجلد.');
    }

    const diffAr = getDifficultyLabelAr(difficulty);
    const title =
      customTitle?.trim() ||
      parsed.suggestedTitle?.trim() ||
      `امتحان AI (${diffAr}) — ${folder.name}`;

    return { title, questions: formattedQuestions };
  } catch (err) {
    recordAppError({
      source: 'ai',
      message: err instanceof Error ? err.message : 'Folder AI Quiz generation failed',
      path: `/api/folders/${folder.id}/ai-quiz`,
      userId,
      stack: err instanceof Error ? err.stack : undefined,
      notifyAdmin: true,
    });
    throw err;
  }
}

router.get('/courses', requireAuth, (req, res) => {
  const yearParam = req.query.year ? Number(req.query.year) : 0;
  const store = db.get();
  let courses = store.courses;
  if (yearParam >= 1 && yearParam <= 4) {
    courses = courses.filter((c) => c.year === yearParam);
  }
  const folders = store.folders || [];
  const enriched = courses.map((course) => ({
    ...course,
    summariesCount: store.summaries.filter((s) => s.courseId === course.id).length,
    quizzesCount: store.quizzes.filter((q) => q.courseId === course.id).length,
    foldersCount: folders.filter((f) => f.courseId === course.id).length,
  }));
  const courseIds = new Set(courses.map((c) => c.id));
  const enrichedFolders = folders
    .filter((f) => courseIds.has(f.courseId))
    .map((f) => enrichFolder(f, store));
  res.json({ courses: enriched, folders: enrichedFolders });
});

router.post(
  '/courses',
  requireAuth,
  requirePermission('manage_courses'),
  optionalSingleImage('cover'),
  (req, res) => {
    const {
      title,
      code,
      year,
      track,
      description,
      instructor,
      releaseAt,
      releaseLabel,
    } = req.body as {
      title?: string;
      code?: string;
      year?: number | string;
      track?: 'GIS' | 'Programming' | 'General';
      description?: string;
      instructor?: string;
      releaseAt?: string;
      releaseLabel?: string;
    };

    if (!title?.trim() || !year) {
      res.status(400).json({ error: 'يرجى إدخال اسم المادة والسنة الدراسية.' });
      return;
    }

    const parsedYear = Number(year) as AcademicYear;
    if (![1, 2, 3, 4].includes(parsedYear)) {
      res.status(400).json({ error: 'السنة الدراسية غير صالحة.' });
      return;
    }

    const store = db.get();
    const file = req.file;
    const newCourse = {
      id: `course-${crypto.randomUUID()}`,
      title: title.trim(),
      code: code?.trim() || `MV-${parsedYear}0${store.courses.length + 1}`,
      year: parsedYear,
      track: track || 'GIS',
      description:
        description?.trim() ||
        'مادة دراسية شاملة بالملخصات والاختبارات على منصة MAVIA.',
      instructor: instructor?.trim() || 'هيئة التدريس — MAVIA',
      coverUrl: file ? `/uploads/${file.filename}` : undefined,
      releaseAt: releaseAt?.trim() || undefined,
      releaseLabel: releaseLabel?.trim() || undefined,
      createdAt: new Date().toISOString(),
    };

    store.courses.unshift(newCourse);
    db.save();

    pushNotification({
      title: `مادة جديدة: ${newCourse.title}`,
      message: `تمت إضافة مادة ${newCourse.code} في قسم الكورسات.`,
      type: 'course',
      targetSection: 'courses',
      year: newCourse.year,
      createdBy: newCourse.instructor,
    });

    res.status(201).json({
      course: {
        ...newCourse,
        summariesCount: 0,
        quizzesCount: 0,
        foldersCount: 0,
      },
    });
  }
);

router.post(
  '/courses/:id/cover',
  requireAuth,
  requirePermission('manage_courses'),
  optionalSingleImage('cover'),
  (req, res) => {
    const { id } = req.params;
    const store = db.get();
    const course = store.courses.find((c) => c.id === id);
    if (!course) {
      res.status(404).json({ error: 'المادة غير موجودة.' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: 'يرجى اختيار صورة غلاف صالحة.' });
      return;
    }
    removeUploadedFile(course.coverUrl);
    course.coverUrl = `/uploads/${req.file.filename}`;
    db.save();
    res.json({ coverUrl: course.coverUrl });
  }
);

router.delete('/courses/:id/cover', requireAuth, requirePermission('manage_courses'), (req, res) => {
  const { id } = req.params;
  const store = db.get();
  const course = store.courses.find((c) => c.id === id);
  if (!course) {
    res.status(404).json({ error: 'المادة غير موجودة.' });
    return;
  }
  removeUploadedFile(course.coverUrl);
  course.coverUrl = undefined;
  db.save();
  res.json({ ok: true });
});

router.patch('/courses/:id/timer', requireAuth, requirePermission('manage_courses'), (req, res) => {
  const { id } = req.params;
  const { releaseAt, releaseLabel } = req.body as {
    releaseAt?: string | null;
    releaseLabel?: string | null;
  };
  const store = db.get();
  const course = store.courses.find((c) => c.id === id);
  if (!course) {
    res.status(404).json({ error: 'المادة غير موجودة.' });
    return;
  }
  course.releaseAt = releaseAt?.trim() || undefined;
  course.releaseLabel = releaseLabel?.trim() || undefined;
  db.save();
  res.json({ course });
});

router.delete('/courses/:id', requireAuth, requirePermission('manage_courses'), (req, res) => {
  const { id } = req.params;
  const store = db.get();
  const target = store.courses.find((c) => c.id === id);
  if (!target) {
    res.status(404).json({ error: 'المادة غير موجودة.' });
    return;
  }

  removeUploadedFile(target.coverUrl);
  const courseFolders = (store.folders || []).filter((f) => f.courseId === id);
  courseFolders.forEach((f) => removeUploadedFile(f.coverUrl));
  store.summaries
    .filter((s) => s.courseId === id)
    .forEach((s) => removeUploadedFile(s.fileUrl));
  (store.assignments || [])
    .filter((a) => a.courseId === id)
    .forEach((a) => removeUploadedFile(a.fileUrl));

  store.courses = store.courses.filter((c) => c.id !== id);
  store.folders = (store.folders || []).filter((f) => f.courseId !== id);
  store.summaries = store.summaries.filter((s) => s.courseId !== id);
  store.assignments = (store.assignments || []).filter((a) => a.courseId !== id);
  store.quizzes = store.quizzes.filter((q) => q.courseId !== id);
  store.quizSubmissions = store.quizSubmissions.filter((s) => s.courseId !== id);
  db.save();

  res.json({ ok: true });
});

router.get('/courses/:courseId/details', requireAuth, (req: AuthenticatedRequest, res) => {
  const { courseId } = req.params;
  const store = db.get();
  const course = store.courses.find((c) => c.id === courseId);

  if (!course) {
    res.status(404).json({ error: 'المادة غير موجودة.' });
    return;
  }

  const folders = (store.folders || [])
    .filter((f) => f.courseId === courseId)
    .map((f) => enrichFolder(f, store));
  const summaries = store.summaries
    .filter((s) => s.courseId === courseId)
    .map((s) => ({
      ...s,
      category: (s.category === 'book' ? 'book' : 'summary') as SummaryCategory,
      viewsCount: Array.isArray(s.viewedBy) ? s.viewedBy.length : 0,
    }));
  const canManageCourses = hasUserPermission(req.currentUser, 'manage_courses');
  const assignments = (store.assignments || []).filter(
    (a) =>
      a.courseId === courseId &&
      (canManageCourses || a.roleTag !== 'submission' || a.createdById === req.currentUser!.id)
  );
  const canSeeAnswers = hasUserPermission(req.currentUser, 'manage_quizzes');
  const quizzes = store.quizzes
    .filter((q) => q.courseId === courseId)
    .map((q) =>
      canSeeAnswers
        ? q
        : {
            ...q,
            questions: q.questions.map(({ id, question, options }) => ({
              id,
              question,
              options,
              correctIndex: -1,
            })),
          }
    );
  const submissions = store.quizSubmissions.filter(
    (s) => s.courseId === courseId && s.userId === req.currentUser!.id
  );
  const progress = getOrInitStudentProgress(req.currentUser!);

  res.json({
    course,
    folders,
    summaries,
    assignments,
    quizzes,
    submissions,
    enrolled: progress.enrolledCourseIds.includes(courseId),
    completedSummaryIds: progress.completedSummaryIds,
  });
});

// Folder CRUD inside a Course
router.post(
  '/courses/:courseId/folders',
  requireAuth,
  requirePermission('manage_courses'),
  optionalSingleImage('cover'),
  (req, res) => {
    const { courseId } = req.params;
    const { name, description, releaseAt } = req.body as {
      name?: string;
      description?: string;
      releaseAt?: string;
    };

    const store = db.get();
    if (!store.courses.some((c) => c.id === courseId)) {
      res.status(404).json({ error: 'المادة غير موجودة.' });
      return;
    }

    if (!name?.trim()) {
      res.status(400).json({ error: 'يرجى كتابة اسم المجلد.' });
      return;
    }

    if (!store.folders) {
      store.folders = [];
    }

    const folder: CourseFolder = {
      id: `folder-${crypto.randomUUID()}`,
      courseId,
      name: name.trim(),
      description: description?.trim() || undefined,
      coverUrl: req.file ? `/uploads/${req.file.filename}` : undefined,
      releaseAt: releaseAt?.trim() || undefined,
      viewedBy: [],
      createdAt: new Date().toISOString(),
    };

    store.folders.unshift(folder);
    db.save();

    const parentCourse = store.courses.find((c) => c.id === courseId);
    if (parentCourse) {
      pushNotification({
        title: `مجلد جديد في ${parentCourse.title}`,
        message: `تم إنشاء مجلد "${folder.name}" وتجهيزه بالكتب والملخصات والتكليفات والاختبارات.`,
        type: 'course',
        targetSection: 'courses',
        year: parentCourse.year,
        createdBy: 'إدارة MAVIA',
      });
    }

    res.status(201).json({ folder: enrichFolder(folder, store) });
  }
);

router.post('/folders/:folderId/view', requireAuth, (req: AuthenticatedRequest, res) => {
  const { folderId } = req.params;
  const store = db.get();
  const folder = (store.folders || []).find((f) => f.id === folderId);
  if (!folder) {
    res.status(404).json({ error: 'المجلد غير موجود.' });
    return;
  }

  if (!Array.isArray(folder.viewedBy)) {
    folder.viewedBy = [];
  }
  if (!folder.viewedBy.includes(req.currentUser!.id)) {
    folder.viewedBy.push(req.currentUser!.id);
    db.save();
  }

  const viewsCount = folder.viewedBy.length;
  res.json({
    viewsCount,
    isTrending: viewsCount > 20,
  });
});

router.post(
  '/folders/:folderId/cover',
  requireAuth,
  requirePermission('manage_courses'),
  optionalSingleImage('cover'),
  (req, res) => {
    const { folderId } = req.params;
    const store = db.get();
    const folder = (store.folders || []).find((f) => f.id === folderId);
    if (!folder) {
      res.status(404).json({ error: 'المجلد غير موجود.' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: 'يرجى اختيار صورة غلاف صالحة.' });
      return;
    }
    removeUploadedFile(folder.coverUrl);
    folder.coverUrl = `/uploads/${req.file.filename}`;
    db.save();
    res.json({ coverUrl: folder.coverUrl });
  }
);

router.delete('/folders/:folderId/cover', requireAuth, requirePermission('manage_courses'), (req, res) => {
  const { folderId } = req.params;
  const store = db.get();
  const folder = (store.folders || []).find((f) => f.id === folderId);
  if (!folder) {
    res.status(404).json({ error: 'المجلد غير موجود.' });
    return;
  }
  removeUploadedFile(folder.coverUrl);
  folder.coverUrl = undefined;
  db.save();
  res.json({ ok: true });
});

router.delete('/folders/:folderId', requireAuth, requirePermission('manage_courses'), (req, res) => {
  const { folderId } = req.params;
  const store = db.get();
  const folder = (store.folders || []).find((f) => f.id === folderId);
  if (!folder) {
    res.status(404).json({ error: 'المجلد غير موجود.' });
    return;
  }

  removeUploadedFile(folder.coverUrl);
  store.summaries
    .filter((s) => s.folderId === folderId)
    .forEach((s) => removeUploadedFile(s.fileUrl));
  (store.assignments || [])
    .filter((a) => a.folderId === folderId)
    .forEach((a) => removeUploadedFile(a.fileUrl));

  store.folders = (store.folders || []).filter((f) => f.id !== folderId);
  store.summaries = store.summaries.filter((s) => s.folderId !== folderId);
  store.assignments = (store.assignments || []).filter((a) => a.folderId !== folderId);
  store.quizzes = store.quizzes.filter((q) => q.folderId !== folderId);
  db.save();

  res.json({ ok: true });
});

// Summaries & Course Books + PDF Upload + View Counter
router.post(
  '/courses/:courseId/summaries',
  requireAuth,
  requirePermission('manage_courses'),
  (req, res, next) => {
    uploadPdf.single('pdf')(req, res, (err) => {
      if (err) {
        res.status(400).json({ error: err.message || 'تعذر رفع ملف الـ PDF.' });
        return;
      }
      next();
    });
  },
  (req: AuthenticatedRequest, res) => {
    const { courseId } = req.params;
    const { title, description, folderId, releaseAt, category } = req.body as {
      title?: string;
      description?: string;
      folderId?: string;
      releaseAt?: string;
      category?: string;
    };

    const store = db.get();
    const course = store.courses.find((c) => c.id === courseId);
    if (!course) {
      res.status(404).json({ error: 'المادة غير موجودة.' });
      return;
    }

    if (!title?.trim()) {
      res.status(400).json({ error: 'يرجى إدخال عنوان الملف.' });
      return;
    }

    const resolvedCategory: SummaryCategory = category === 'book' ? 'book' : 'summary';
    const file = req.file;
    const newSummary = {
      id: `sum-${crypto.randomUUID()}`,
      courseId,
      folderId: folderId?.trim() || undefined,
      category: resolvedCategory,
      title: title.trim(),
      description:
        description?.trim() ||
        (resolvedCategory === 'book'
          ? 'كتاب المادة المرفوع عبر منصة MAVIA.'
          : 'ملخص مرفوع عبر منصة MAVIA.'),
      fileUrl: file ? `/uploads/${file.filename}` : undefined,
      fileName: file ? Buffer.from(file.originalname, 'latin1').toString('utf8') : undefined,
      fileSize: file ? file.size : undefined,
      releaseAt: releaseAt?.trim() || undefined,
      viewedBy: [],
      createdBy: req.currentUser!.name,
      createdAt: new Date().toISOString(),
    };

    store.summaries.unshift(newSummary);
    db.save();

    pushNotification({
      title: `${resolvedCategory === 'book' ? 'كتاب مادة جديد' : 'ملخص جديد'} في ${course.title}`,
      message: `تم رفع "${newSummary.title}" — متاح الآن للمعاينة والتحميل.`,
      type: 'course',
      targetSection: 'courses',
      year: course.year,
      createdBy: req.currentUser!.name,
    });

    res.status(201).json({ summary: { ...newSummary, viewsCount: 0 } });
  }
);

// Folder & Course Assignments (Image, PDF, or Text)
router.post(
  '/courses/:courseId/assignments',
  requireAuth,
  optionalAssignmentUpload('file'),
  (req: AuthenticatedRequest, res) => {
    const { courseId } = req.params;
    const { title, folderId, contentText, type } = req.body as {
      title?: string;
      folderId?: string;
      contentText?: string;
      type?: 'image' | 'pdf' | 'text';
    };

    const store = db.get();
    const course = store.courses.find((c) => c.id === courseId);
    if (!course) {
      if (req.file) removeUploadedFile(`/uploads/${req.file.filename}`);
      res.status(404).json({ error: 'المادة غير موجودة.' });
      return;
    }

    const file = req.file;
    const cleanText = contentText?.trim() || '';
    if (!file && !cleanText) {
      res.status(400).json({ error: 'يرجى رفع صورة أو ملف PDF أو كتابة نص التكليف.' });
      return;
    }

    if (!title?.trim()) {
      if (file) removeUploadedFile(`/uploads/${file.filename}`);
      res.status(400).json({ error: 'يرجى إدخال عنوان التكليف.' });
      return;
    }

    let resolvedType: 'pdf' | 'image' | 'text' = 'text';
    if (file) {
      const isPdf =
        file.mimetype === 'application/pdf' ||
        file.originalname.toLowerCase().endsWith('.pdf');
      resolvedType = isPdf ? 'pdf' : 'image';
    } else if (type === 'image' || type === 'pdf') {
      resolvedType = 'text';
    }

    if (!Array.isArray(store.assignments)) {
      store.assignments = [];
    }

    const isStaff = hasUserPermission(req.currentUser, 'manage_courses');
    const assignment: CourseAssignment = {
      id: `assign-${crypto.randomUUID()}`,
      courseId,
      folderId: folderId?.trim() || undefined,
      title: title.trim(),
      type: resolvedType,
      contentText: cleanText || undefined,
      fileUrl: file ? `/uploads/${file.filename}` : undefined,
      fileName: file ? Buffer.from(file.originalname, 'latin1').toString('utf8') : undefined,
      fileSize: file ? file.size : undefined,
      mimeType: file ? file.mimetype : undefined,
      roleTag: isStaff ? 'assignment' : 'submission',
      createdBy: req.currentUser!.name,
      createdById: req.currentUser!.id,
      createdAt: new Date().toISOString(),
    };

    store.assignments.unshift(assignment);
    db.save();

    res.status(201).json({ assignment });
  }
);

router.delete('/assignments/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const store = db.get();
  const target = (store.assignments || []).find((a) => a.id === id);
  if (!target) {
    res.status(404).json({ error: 'التكليف غير موجود.' });
    return;
  }

  const canDelete =
    target.createdById === req.currentUser!.id ||
    hasUserPermission(req.currentUser, 'manage_courses');
  if (!canDelete) {
    res.status(403).json({ error: 'غير مصرح لك بحذف هذا التكليف.' });
    return;
  }

  removeUploadedFile(target.fileUrl);
  store.assignments = (store.assignments || []).filter((a) => a.id !== id);
  db.save();
  res.json({ ok: true });
});

// AI Interactive Exam Generator from Folder Content (Official Save for Admin / Practice for Students)
router.post(
  '/folders/:folderId/ai-quiz',
  requireAuth,
  requirePermission('manage_quizzes'),
  aiRateLimiter,
  async (req: AuthenticatedRequest, res) => {
    const { folderId } = req.params;
    const { difficulty, questionCount, durationMinutes, pointsPerQuestion, title } = req.body as {
      difficulty?: QuizDifficulty;
      questionCount?: number;
      durationMinutes?: number;
      pointsPerQuestion?: number;
      title?: string;
    };

    const store = db.get();
    const folder = (store.folders || []).find((f) => f.id === folderId);
    if (!folder) {
      res.status(404).json({ error: 'المجلد غير موجود.' });
      return;
    }
    const course = store.courses.find((c) => c.id === folder.courseId);
    if (!course) {
      res.status(404).json({ error: 'المادة غير موجودة.' });
      return;
    }

    const safeDifficulty: QuizDifficulty =
      difficulty === 'easy' || difficulty === 'hard' ? difficulty : 'medium';

    try {
      const generated = await generateAiQuestionsFromFolder({
        folder,
        course,
        store,
        difficulty: safeDifficulty,
        questionCount: Number(questionCount) || 5,
        customTitle: title,
        userId: req.currentUser?.id,
      });

      const newQuiz = {
        id: `quiz-${crypto.randomUUID()}`,
        courseId: course.id,
        folderId: folder.id,
        title: generated.title,
        difficulty: safeDifficulty,
        generatedByAi: true,
        durationMinutes: Math.max(1, Number(durationMinutes) || 15),
        pointsPerQuestion: Math.max(1, Number(pointsPerQuestion) || 25),
        randomizeQuestions: true,
        randomizeOptions: true,
        questionsPerAttempt: 0,
        questions: generated.questions,
        createdAt: new Date().toISOString(),
      };

      store.quizzes.unshift(newQuiz);
      db.save();

      pushNotification({
        title: `امتحان ذكي (${getDifficultyLabelAr(safeDifficulty)}) في ${course.title}`,
        message: `تم توليد "${newQuiz.title}" بالذكاء الاصطناعي من محتوى مجلد "${folder.name}".`,
        type: 'exam',
        targetSection: 'courses',
        year: course.year,
        createdBy: req.currentUser!.name,
      });

      res.status(201).json({ quiz: newQuiz });
    } catch (err) {
      const statusCode =
        err && typeof err === 'object' && 'statusCode' in err
          ? Number((err as { statusCode?: number }).statusCode) || 500
          : 500;
      res.status(statusCode).json({
        error:
          err instanceof Error
            ? err.message
            : 'تعذر توليد الامتحان بالذكاء الاصطناعي من محتوى المجلد.',
      });
    }
  }
);

router.post(
  '/folders/:folderId/ai-practice-quiz',
  requireAuth,
  aiRateLimiter,
  async (req: AuthenticatedRequest, res) => {
    const { folderId } = req.params;
    const { difficulty, questionCount, durationMinutes } = req.body as {
      difficulty?: QuizDifficulty;
      questionCount?: number;
      durationMinutes?: number;
    };

    const store = db.get();
    const folder = (store.folders || []).find((f) => f.id === folderId);
    if (!folder) {
      res.status(404).json({ error: 'المجلد غير موجود.' });
      return;
    }
    const course = store.courses.find((c) => c.id === folder.courseId);
    if (!course) {
      res.status(404).json({ error: 'المادة غير موجودة.' });
      return;
    }

    const safeDifficulty: QuizDifficulty =
      difficulty === 'easy' || difficulty === 'hard' ? difficulty : 'medium';

    try {
      const generated = await generateAiQuestionsFromFolder({
        folder,
        course,
        store,
        difficulty: safeDifficulty,
        questionCount: Number(questionCount) || 5,
        userId: req.currentUser?.id,
      });

      res.json({
        quiz: {
          id: `practice-quiz-${crypto.randomUUID()}`,
          courseId: course.id,
          folderId: folder.id,
          title: `${generated.title} (تدريب AI)`,
          difficulty: safeDifficulty,
          generatedByAi: true,
          isPracticeOnly: true,
          durationMinutes: Math.max(1, Number(durationMinutes) || 10),
          pointsPerQuestion: 20,
          randomizeQuestions: true,
          randomizeOptions: true,
          questionsPerAttempt: 0,
          questions: generated.questions,
          createdAt: new Date().toISOString(),
        },
      });
    } catch (err) {
      const statusCode =
        err && typeof err === 'object' && 'statusCode' in err
          ? Number((err as { statusCode?: number }).statusCode) || 500
          : 500;
      res.status(statusCode).json({
        error:
          err instanceof Error
            ? err.message
            : 'تعذر توليد الامتحان التدريبي بالذكاء الاصطناعي.',
      });
    }
  }
);

router.post('/summaries/:id/view', requireAuth, (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const store = db.get();
  const summary = store.summaries.find((s) => s.id === id);
  if (!summary) {
    res.status(404).json({ error: 'الملخص غير موجود.' });
    return;
  }

  if (!Array.isArray(summary.viewedBy)) {
    summary.viewedBy = [];
  }
  if (!summary.viewedBy.includes(req.currentUser!.id)) {
    summary.viewedBy.push(req.currentUser!.id);
    db.save();
  }

  res.json({ viewsCount: summary.viewedBy.length });
});

router.delete('/summaries/:id', requireAuth, requirePermission('manage_courses'), (req, res) => {
  const { id } = req.params;
  const store = db.get();
  const target = store.summaries.find((s) => s.id === id);
  if (!target) {
    res.status(404).json({ error: 'الملخص غير موجود.' });
    return;
  }

  removeUploadedFile(target.fileUrl);
  store.summaries = store.summaries.filter((s) => s.id !== id);
  db.save();
  res.json({ ok: true });
});

router.post('/courses/:courseId/quizzes', requireAuth, requirePermission('manage_quizzes'), (req: AuthenticatedRequest, res) => {
  const { courseId } = req.params;
  const {
    title,
    durationMinutes,
    pointsPerQuestion,
    randomizeQuestions,
    randomizeOptions,
    questionsPerAttempt,
    questions,
    folderId,
    releaseAt,
  } = req.body as {
    title?: string;
    durationMinutes?: number;
    pointsPerQuestion?: number;
    randomizeQuestions?: boolean;
    randomizeOptions?: boolean;
    questionsPerAttempt?: number;
    folderId?: string;
    releaseAt?: string;
    questions?: Array<{
      question: string;
      options: string[];
      correctIndex: number;
      explanation?: string;
    }>;
  };

  const store = db.get();
  const course = store.courses.find((c) => c.id === courseId);
  if (!course) {
    res.status(404).json({ error: 'المادة غير موجودة.' });
    return;
  }

  if (!title?.trim() || !Array.isArray(questions) || questions.length === 0) {
    res.status(400).json({ error: 'يرجى إدخال عنوان الاختبار وسؤال واحد على الأقل.' });
    return;
  }

  const formattedQuestions: QuizQuestion[] = questions.map((q) => ({
    id: `q-${crypto.randomUUID()}`,
    question: q.question.trim(),
    options: q.options.map((o) => o.trim()),
    correctIndex: Number(q.correctIndex) || 0,
    explanation: q.explanation?.trim() || undefined,
  }));

  const parsedCountPerAttempt = Number(questionsPerAttempt) || 0;
  const newQuiz = {
    id: `quiz-${crypto.randomUUID()}`,
    courseId,
    folderId: folderId?.trim() || undefined,
    title: title.trim(),
    durationMinutes: Math.max(1, Number(durationMinutes) || 15),
    pointsPerQuestion: Math.max(1, Number(pointsPerQuestion) || 25),
    randomizeQuestions: randomizeQuestions !== false,
    randomizeOptions: randomizeOptions !== false,
    questionsPerAttempt:
      parsedCountPerAttempt > 0 && parsedCountPerAttempt <= formattedQuestions.length
        ? parsedCountPerAttempt
        : 0,
    releaseAt: releaseAt?.trim() || undefined,
    questions: formattedQuestions,
    createdAt: new Date().toISOString(),
  };

  store.quizzes.unshift(newQuiz);
  db.save();

  pushNotification({
    title: `اختبار جديد في ${course.title}`,
    message: `${newQuiz.title} (${newQuiz.durationMinutes} دقيقة · ${formattedQuestions.length} سؤال في البنك).`,
    type: 'exam',
    targetSection: 'courses',
    year: course.year,
    createdBy: req.currentUser!.name,
  });

  res.status(201).json({ quiz: newQuiz });
});

router.delete('/quizzes/:id', requireAuth, requirePermission('manage_quizzes'), (req, res) => {
  const { id } = req.params;
  const store = db.get();
  store.quizzes = store.quizzes.filter((q) => q.id !== id);
  store.quizSubmissions = store.quizSubmissions.filter((s) => s.quizId !== id);
  db.save();
  res.json({ ok: true });
});

router.post('/quizzes/:id/submit', requireAuth, (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const { answers, responses, timeSpentSeconds } = req.body as {
    answers?: number[];
    responses?: Array<{ questionId: string; selectedIndex: number }>;
    timeSpentSeconds?: number;
  };
  const store = db.get();
  const quiz = store.quizzes.find((q) => q.id === id);

  if (!quiz) {
    res.status(404).json({ error: 'الاختبار غير موجود.' });
    return;
  }

  const breakdown: QuizQuestionBreakdown[] = [];
  let correctCount = 0;

  if (Array.isArray(responses) && responses.length > 0) {
    const seenQuestionIds = new Set<string>();
    for (const item of responses) {
      if (!item || typeof item.questionId !== 'string') continue;
      if (seenQuestionIds.has(item.questionId)) continue;
      const q = quiz.questions.find((question) => question.id === item.questionId);
      if (!q) continue;
      seenQuestionIds.add(item.questionId);
      const selectedIdx = Number(item.selectedIndex);
      const isValidSelection =
        Number.isInteger(selectedIdx) && selectedIdx >= 0 && selectedIdx < q.options.length;
      const isCorrect = isValidSelection && selectedIdx === q.correctIndex;
      if (isCorrect) {
        correctCount += 1;
      }
      breakdown.push({
        questionId: q.id,
        question: q.question,
        options: q.options,
        selectedIndex: isValidSelection ? selectedIdx : -1,
        correctIndex: q.correctIndex,
        isCorrect,
        explanation: q.explanation,
      });
    }
    if (breakdown.length === 0) {
      res.status(400).json({ error: 'لا توجد إجابات مطابقة لأسئلة هذا الاختبار.' });
      return;
    }
  } else if (Array.isArray(answers)) {
    quiz.questions.forEach((q, idx) => {
      const selectedIdx = Number(answers[idx]);
      const isValidSelection =
        Number.isInteger(selectedIdx) && selectedIdx >= 0 && selectedIdx < q.options.length;
      const isCorrect = isValidSelection && selectedIdx === q.correctIndex;
      if (isCorrect) {
        correctCount += 1;
      }
      breakdown.push({
        questionId: q.id,
        question: q.question,
        options: q.options,
        selectedIndex: isValidSelection ? selectedIdx : -1,
        correctIndex: q.correctIndex,
        isCorrect,
        explanation: q.explanation,
      });
    });
  } else {
    res.status(400).json({ error: 'صيغة الإجابات غير صالحة.' });
    return;
  }

  const expectedAttemptSize =
    quiz.questionsPerAttempt && quiz.questionsPerAttempt > 0
      ? Math.min(quiz.questionsPerAttempt, quiz.questions.length)
      : quiz.questions.length;
  const totalQuestions = Math.max(breakdown.length, expectedAttemptSize);
  const score = correctCount * quiz.pointsPerQuestion;
  const maxScore = totalQuestions * quiz.pointsPerQuestion;

  const user = store.users.find((u) => u.id === req.currentUser!.id)!;
  const prevBest = store.quizSubmissions
    .filter((s) => s.quizId === quiz.id && s.userId === user.id)
    .reduce((max, s) => Math.max(max, s.score), -1);

  if (prevBest === -1) {
    user.points += score;
    user.quizzesCompleted += 1;
  } else if (score > prevBest) {
    user.points += score - prevBest;
  }

  const submission = {
    id: `sub-${crypto.randomUUID()}`,
    quizId: quiz.id,
    courseId: quiz.courseId,
    userId: user.id,
    score,
    maxScore,
    correctCount,
    totalQuestions,
    timeSpentSeconds:
      typeof timeSpentSeconds === 'number' ? Math.max(0, Math.floor(timeSpentSeconds)) : undefined,
    breakdown,
    submittedAt: new Date().toISOString(),
  };

  store.quizSubmissions.push(submission);
  const progress = getOrInitStudentProgress(user);
  const course = store.courses.find((c) => c.id === quiz.courseId);
  if (course) {
    progress.lastLesson = {
      courseId: course.id,
      courseTitle: course.title,
      lessonTitle: `اختبار: ${quiz.title}`,
      updatedAt: new Date().toISOString(),
    };
    if (!progress.enrolledCourseIds.includes(course.id)) {
      progress.enrolledCourseIds.unshift(course.id);
    }
  }
  db.save();

  res.json({
    submission,
    user: toSafeUser(user),
  });
});

export default router;
