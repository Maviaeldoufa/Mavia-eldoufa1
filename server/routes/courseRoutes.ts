import crypto from 'crypto';
import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { requireAuth, requirePermission } from '../auth.ts';
import type { AuthenticatedRequest } from '../auth.ts';
import { db, hasUserPermission, pushNotification, toSafeUser, UPLOADS_DIR } from '../db.ts';
import type { AcademicYear, QuizQuestion, QuizQuestionBreakdown } from '../types.ts';
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
  res.json({ courses: enriched });
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
        'مادة دراسية شاملة بالملخصات والاختبارات على منصة MVIA.',
      instructor: instructor?.trim() || 'هيئة التدريس — MVIA',
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

  store.courses = store.courses.filter((c) => c.id !== id);
  store.folders = (store.folders || []).filter((f) => f.courseId !== id);
  store.summaries = store.summaries.filter((s) => s.courseId !== id);
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

  const folders = (store.folders || []).filter((f) => f.courseId === courseId);
  const summaries = store.summaries
    .filter((s) => s.courseId === courseId)
    .map((s) => ({
      ...s,
      viewsCount: Array.isArray(s.viewedBy) ? s.viewedBy.length : 0,
    }));
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

    const folder = {
      id: `folder-${crypto.randomUUID()}`,
      courseId,
      name: name.trim(),
      description: description?.trim() || undefined,
      coverUrl: req.file ? `/uploads/${req.file.filename}` : undefined,
      releaseAt: releaseAt?.trim() || undefined,
      createdAt: new Date().toISOString(),
    };

    store.folders.unshift(folder);
    db.save();

    const parentCourse = store.courses.find((c) => c.id === courseId);
    if (parentCourse) {
      pushNotification({
        title: `مجلد جديد في ${parentCourse.title}`,
        message: `تم إنشاء مجلد "${folder.name}" وتجهيزه بالملخصات والاختبارات.`,
        type: 'course',
        targetSection: 'courses',
        year: parentCourse.year,
        createdBy: 'إدارة MVIA',
      });
    }

    res.status(201).json({ folder });
  }
);

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

  store.folders = (store.folders || []).filter((f) => f.id !== folderId);
  store.summaries = store.summaries.filter((s) => s.folderId !== folderId);
  store.quizzes = store.quizzes.filter((q) => q.folderId !== folderId);
  db.save();

  res.json({ ok: true });
});

// Summaries + PDF Upload + View Counter
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
    const { title, description, folderId, releaseAt } = req.body as {
      title?: string;
      description?: string;
      folderId?: string;
      releaseAt?: string;
    };

    const store = db.get();
    const course = store.courses.find((c) => c.id === courseId);
    if (!course) {
      res.status(404).json({ error: 'المادة غير موجودة.' });
      return;
    }

    if (!title?.trim()) {
      res.status(400).json({ error: 'يرجى إدخال عنوان الملخص.' });
      return;
    }

    const file = req.file;
    const newSummary = {
      id: `sum-${crypto.randomUUID()}`,
      courseId,
      folderId: folderId?.trim() || undefined,
      title: title.trim(),
      description: description?.trim() || 'ملخص مرفوع عبر منصة MVIA.',
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
      title: `ملخص جديد في ${course.title}`,
      message: `تم رفع "${newSummary.title}" — متاح الآن للمعاينة والتحميل.`,
      type: 'course',
      targetSection: 'courses',
      year: course.year,
      createdBy: req.currentUser!.name,
    });

    res.status(201).json({ summary: { ...newSummary, viewsCount: 0 } });
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
