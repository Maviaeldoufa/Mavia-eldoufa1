import crypto from 'crypto';
import { Router } from 'express';
import { requireAuth } from '../auth.ts';
import type { AuthenticatedRequest } from '../auth.ts';
import { db } from '../db.ts';
import type { StudentProgressRecord, StudentTask, User } from '../types.ts';

const router = Router();

export function getOrInitStudentProgress(user: User): StudentProgressRecord {
  const store = db.get();
  if (!store.studentProgress) {
    store.studentProgress = {};
  }

  let record = store.studentProgress[user.id];
  if (!record) {
    const yearCourses = store.courses
      .filter((c) => c.year === user.year)
      .map((c) => c.id);

    const defaultCourseIds =
      yearCourses.length > 0
        ? yearCourses
        : store.courses.slice(0, 2).map((c) => c.id);

    const firstCourse = store.courses.find((c) =>
      defaultCourseIds.includes(c.id)
    );
    const firstSummary = firstCourse
      ? store.summaries.find((s) => s.courseId === firstCourse.id)
      : undefined;

    const now = new Date();
    const inThreeDays = new Date(now.getTime() + 3 * 86400000)
      .toISOString()
      .slice(0, 10);
    const inSixDays = new Date(now.getTime() + 6 * 86400000)
      .toISOString()
      .slice(0, 10);

    const starterTasks: StudentTask[] = [
      {
        id: `task-${crypto.randomUUID()}`,
        title: firstCourse
          ? `مراجعة ملخصات مادة ${firstCourse.title}`
          : 'مراجعة أول درس في مسار GIS والبرمجة',
        dueDate: inThreeDays,
        courseTitle: firstCourse?.title,
        type: 'task',
        completed: false,
        createdAt: now.toISOString(),
      },
      {
        id: `task-${crypto.randomUUID()}`,
        title: 'الاستعداد للاختبار الشامل القادم',
        dueDate: inSixDays,
        courseTitle: firstCourse?.title,
        type: 'exam',
        completed: false,
        createdAt: now.toISOString(),
      },
    ];

    record = {
      enrolledCourseIds: defaultCourseIds,
      completedSummaryIds: [],
      lastLesson:
        firstCourse && firstSummary
          ? {
              courseId: firstCourse.id,
              courseTitle: firstCourse.title,
              lessonTitle: firstSummary.title,
              summaryId: firstSummary.id,
              updatedAt: now.toISOString(),
            }
          : undefined,
      studyMinutes: user.quizzesCompleted > 0 ? user.quizzesCompleted * 45 : 0,
      tasks: starterTasks,
    };

    store.studentProgress[user.id] = record;
    db.save();
  }

  return record;
}

router.get('/student/dashboard', requireAuth, (req: AuthenticatedRequest, res) => {
  const store = db.get();
  const user = store.users.find((u) => u.id === req.currentUser!.id)!;
  const progress = getOrInitStudentProgress(user);

  const validCourseIds = new Set(store.courses.map((c) => c.id));
  progress.enrolledCourseIds = progress.enrolledCourseIds.filter((id) =>
    validCourseIds.has(id)
  );

  const validSummaryIds = new Set(store.summaries.map((s) => s.id));
  progress.completedSummaryIds = progress.completedSummaryIds.filter((id) =>
    validSummaryIds.has(id)
  );

  const enrolledSet = new Set(progress.enrolledCourseIds);
  const completedSummarySet = new Set(progress.completedSummaryIds);

  const completedQuizIds = new Set(
    store.quizSubmissions
      .filter((s) => s.userId === user.id)
      .map((s) => s.quizId)
  );

  let totalLessonsInEnrolled = 0;
  let completedLessonsInEnrolled = 0;
  let totalQuizzesInEnrolled = 0;
  let completedQuizzesInEnrolled = 0;

  const enrolledCourses = store.courses
    .filter((c) => enrolledSet.has(c.id))
    .map((course) => {
      const courseSummaries = store.summaries.filter(
        (s) => s.courseId === course.id
      );
      const courseQuizzes = store.quizzes.filter(
        (q) => q.courseId === course.id
      );

      const completedSummaries = courseSummaries.filter((s) =>
        completedSummarySet.has(s.id)
      ).length;
      const completedQuizzes = courseQuizzes.filter((q) =>
        completedQuizIds.has(q.id)
      ).length;

      totalLessonsInEnrolled += courseSummaries.length;
      completedLessonsInEnrolled += completedSummaries;
      totalQuizzesInEnrolled += courseQuizzes.length;
      completedQuizzesInEnrolled += completedQuizzes;

      const totalItems = courseSummaries.length + courseQuizzes.length;
      const completedItems = completedSummaries + completedQuizzes;
      const progressPercent =
        totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

      return {
        course: {
          ...course,
          summariesCount: courseSummaries.length,
          quizzesCount: courseQuizzes.length,
        },
        totalSummaries: courseSummaries.length,
        completedSummaries,
        totalQuizzes: courseQuizzes.length,
        completedQuizzes,
        progressPercent,
      };
    });

  const totalUnits = totalLessonsInEnrolled + totalQuizzesInEnrolled;
  const completedUnits =
    completedLessonsInEnrolled + completedQuizzesInEnrolled;
  const completionPercentage =
    totalUnits > 0 ? Math.round((completedUnits / totalUnits) * 100) : 0;

  const upcomingQuizzes = store.quizzes
    .filter((q) => enrolledSet.has(q.courseId) && !completedQuizIds.has(q.id))
    .map((q) => {
      const course = store.courses.find((c) => c.id === q.courseId);
      return {
        quizId: q.id,
        title: q.title,
        courseId: q.courseId,
        courseTitle: course?.title || 'مادة دراسية',
        durationMinutes: q.durationMinutes,
        questionsCount: q.questions.length,
      };
    });

  const availableCourses = store.courses.map((c) => ({
    ...c,
    summariesCount: store.summaries.filter((s) => s.courseId === c.id).length,
    quizzesCount: store.quizzes.filter((q) => q.courseId === c.id).length,
    enrolled: enrolledSet.has(c.id),
  }));

  res.json({
    completionPercentage,
    enrolledCourses,
    availableCourses,
    lastLesson: progress.lastLesson || null,
    upcomingQuizzes,
    tasks: progress.tasks,
    stats: {
      studyMinutes: progress.studyMinutes,
      completedLessonsCount: completedLessonsInEnrolled,
      totalLessonsCount: totalLessonsInEnrolled,
      completedQuizzesCount: completedQuizzesInEnrolled,
      totalQuizzesCount: totalQuizzesInEnrolled,
      enrolledCoursesCount: enrolledCourses.length,
      points: user.points,
      quizzesCompleted: user.quizzesCompleted,
    },
  });
});

router.post('/student/enroll', requireAuth, (req: AuthenticatedRequest, res) => {
  const { courseId } = req.body as { courseId?: string };
  const store = db.get();
  if (!courseId || !store.courses.some((c) => c.id === courseId)) {
    res.status(404).json({ error: 'المادة غير موجودة.' });
    return;
  }

  const user = store.users.find((u) => u.id === req.currentUser!.id)!;
  const progress = getOrInitStudentProgress(user);

  const exists = progress.enrolledCourseIds.includes(courseId);
  if (exists) {
    progress.enrolledCourseIds = progress.enrolledCourseIds.filter(
      (id) => id !== courseId
    );
  } else {
    progress.enrolledCourseIds.unshift(courseId);
  }

  db.save();
  res.json({
    enrolled: !exists,
    enrolledCourseIds: progress.enrolledCourseIds,
  });
});

router.post(
  '/student/lesson-progress',
  requireAuth,
  (req: AuthenticatedRequest, res) => {
    const { courseId, summaryId, lessonTitle, completed } = req.body as {
      courseId?: string;
      summaryId?: string;
      lessonTitle?: string;
      completed?: boolean;
    };

    const store = db.get();
    const course = store.courses.find((c) => c.id === courseId);
    if (!course) {
      res.status(404).json({ error: 'المادة غير موجودة.' });
      return;
    }

    const user = store.users.find((u) => u.id === req.currentUser!.id)!;
    const progress = getOrInitStudentProgress(user);

    if (lessonTitle?.trim()) {
      progress.lastLesson = {
        courseId: course.id,
        courseTitle: course.title,
        lessonTitle: lessonTitle.trim(),
        summaryId,
        updatedAt: new Date().toISOString(),
      };
    }

    if (summaryId && store.summaries.some((s) => s.id === summaryId)) {
      if (completed === true) {
        if (!progress.completedSummaryIds.includes(summaryId)) {
          progress.completedSummaryIds.push(summaryId);
        }
        if (!progress.enrolledCourseIds.includes(course.id)) {
          progress.enrolledCourseIds.unshift(course.id);
        }
      } else if (completed === false) {
        progress.completedSummaryIds = progress.completedSummaryIds.filter(
          (id) => id !== summaryId
        );
      }
    }

    db.save();
    res.json({
      lastLesson: progress.lastLesson || null,
      completedSummaryIds: progress.completedSummaryIds,
      enrolled: progress.enrolledCourseIds.includes(course.id),
    });
  }
);

router.post(
  '/student/study-time',
  requireAuth,
  (req: AuthenticatedRequest, res) => {
    const { minutes } = req.body as { minutes?: number };
    const addMinutes = Math.max(1, Math.min(480, Math.round(Number(minutes) || 0)));
    if (!addMinutes) {
      res.status(400).json({ error: 'قيمة الدقائق غير صالحة.' });
      return;
    }

    const store = db.get();
    const user = store.users.find((u) => u.id === req.currentUser!.id)!;
    const progress = getOrInitStudentProgress(user);
    progress.studyMinutes += addMinutes;
    db.save();

    res.json({ studyMinutes: progress.studyMinutes });
  }
);

router.post('/student/tasks', requireAuth, (req: AuthenticatedRequest, res) => {
  const { title, dueDate, courseTitle, type } = req.body as {
    title?: string;
    dueDate?: string;
    courseTitle?: string;
    type?: 'task' | 'exam';
  };

  if (!title?.trim()) {
    res.status(400).json({ error: 'يرجى كتابة عنوان المهمة أو الاختبار.' });
    return;
  }

  const store = db.get();
  const user = store.users.find((u) => u.id === req.currentUser!.id)!;
  const progress = getOrInitStudentProgress(user);

  const newTask: StudentTask = {
    id: `task-${crypto.randomUUID()}`,
    title: title.trim(),
    dueDate: dueDate?.trim() || new Date().toISOString().slice(0, 10),
    courseTitle: courseTitle?.trim() || undefined,
    type: type === 'exam' ? 'exam' : 'task',
    completed: false,
    createdAt: new Date().toISOString(),
  };

  progress.tasks.unshift(newTask);
  db.save();

  res.status(201).json({ task: newTask });
});

router.patch(
  '/student/tasks/:taskId',
  requireAuth,
  (req: AuthenticatedRequest, res) => {
    const { taskId } = req.params;
    const { completed } = req.body as { completed?: boolean };

    const store = db.get();
    const user = store.users.find((u) => u.id === req.currentUser!.id)!;
    const progress = getOrInitStudentProgress(user);

    const task = progress.tasks.find((t) => t.id === taskId);
    if (!task) {
      res.status(404).json({ error: 'المهمة غير موجودة.' });
      return;
    }

    task.completed =
      typeof completed === 'boolean' ? completed : !task.completed;
    db.save();

    res.json({ task });
  }
);

router.delete(
  '/student/tasks/:taskId',
  requireAuth,
  (req: AuthenticatedRequest, res) => {
    const { taskId } = req.params;
    const store = db.get();
    const user = store.users.find((u) => u.id === req.currentUser!.id)!;
    const progress = getOrInitStudentProgress(user);

    progress.tasks = progress.tasks.filter((t) => t.id !== taskId);
    db.save();

    res.json({ ok: true });
  }
);

export default router;
