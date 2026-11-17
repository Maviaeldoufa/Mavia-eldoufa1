import crypto from 'crypto';
import { Router } from 'express';
import { requireAuth } from '../auth.ts';
import type { AuthenticatedRequest } from '../auth.ts';
import { db, toSafeUser } from '../db.ts';
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

  const userSubmissions = (store.quizSubmissions || []).filter(
    (s) => s.userId === user.id
  );
  const totalQuizMaxScore = userSubmissions.reduce((sum, s) => sum + (s.maxScore || 0), 0);
  const totalQuizScore = userSubmissions.reduce((sum, s) => sum + (s.score || 0), 0);
  const hasQuizData = userSubmissions.length > 0 && totalQuizMaxScore > 0;
  const avgQuizScorePercent = hasQuizData
    ? Math.round((totalQuizScore / totalQuizMaxScore) * 100)
    : 0;

  // Compute leaderboard position cleanly
  const rankedUsers = [...store.users].sort((a, b) => b.points - a.points);
  const leaderboardRank = rankedUsers.findIndex((u) => u.id === user.id) + 1;

  // Dynamic achievements & medals earned from real DB records
  const totalSummariesCompleted = progress.completedSummaryIds.length;
  const achievements = [
    {
      id: 'first-step',
      titleAr: 'أول خطوة في المنصة',
      titleEn: 'First Step',
      descAr: 'إتمام أول ملخص دراسي أو اختبار شامل',
      descEn: 'Complete your first summary or quiz',
      badgeIcon: 'flag',
      color: 'sky',
      earned: user.quizzesCompleted >= 1 || totalSummariesCompleted >= 1,
      progressPercent:
        user.quizzesCompleted >= 1 || totalSummariesCompleted >= 1 ? 100 : 0,
    },
    {
      id: 'quiz-challenger',
      titleAr: 'متحدي الاختبارات',
      titleEn: 'Quiz Challenger',
      descAr: 'اجتياز 3 اختبارات شاملة على الأقل',
      descEn: 'Complete 3 or more platform quizzes',
      badgeIcon: 'zap',
      color: 'violet',
      earned: user.quizzesCompleted >= 3,
      progressPercent: Math.min(100, Math.round((user.quizzesCompleted / 3) * 100)),
    },
    {
      id: 'excellence-medal',
      titleAr: 'وسام التفوق الأكاديمي',
      titleEn: 'Excellence Medal',
      descAr: 'تحقيق متوسط درجات 80% فأعلى في الاختبارات',
      descEn: 'Achieve an 80%+ average score across quizzes',
      badgeIcon: 'medal',
      color: 'gold',
      earned: hasQuizData && avgQuizScorePercent >= 80,
      progressPercent: hasQuizData
        ? Math.min(100, Math.round((avgQuizScorePercent / 80) * 100))
        : 0,
    },
    {
      id: 'points-champion',
      titleAr: 'وسام حاصد النقاط',
      titleEn: 'Points Champion',
      descAr: 'تجميع 500 نقطة أو أكثر في لوحة التصدر',
      descEn: 'Reach 500+ points on the leaderboard',
      badgeIcon: 'trophy',
      color: 'amber',
      earned: user.points >= 500,
      progressPercent: Math.min(100, Math.round((user.points / 500) * 100)),
    },
    {
      id: 'study-dedication',
      titleAr: 'وسام المثابرة والالتزام',
      titleEn: 'Study Dedication',
      descAr: 'تسجيل 60 دقيقة مذاكرة أو أكثر',
      descEn: 'Log at least 60 minutes of active study time',
      badgeIcon: 'clock',
      color: 'emerald',
      earned: progress.studyMinutes >= 60,
      progressPercent: Math.min(100, Math.round((progress.studyMinutes / 60) * 100)),
    },
    {
      id: 'course-explorer',
      titleAr: 'مستكشف المواد والمسارات',
      titleEn: 'Track Explorer',
      descAr: 'التسجيل في مادتين فأكثر وإنجاز ملخص',
      descEn: 'Enroll in 2+ courses and finish a summary',
      badgeIcon: 'book',
      color: 'sky',
      earned: enrolledCourses.length >= 2 && totalSummariesCompleted >= 1,
      progressPercent: Math.min(
        100,
        Math.round(
          ((Math.min(2, enrolledCourses.length) +
            (totalSummariesCompleted >= 1 ? 1 : 0)) /
            3) *
            100
        )
      ),
    },
    {
      id: 'top-three',
      titleAr: 'تاج نخبة الدفعة (أفضل 3)',
      titleEn: 'Top 3 Elite Crown',
      descAr: 'التواجد ضمن المراكز الثلاثة الأولى بالمنصة',
      descEn: 'Rank among the Top 3 students on the leaderboard',
      badgeIcon: 'crown',
      color: 'gold',
      earned: leaderboardRank > 0 && leaderboardRank <= 3,
      progressPercent:
        leaderboardRank > 0 && leaderboardRank <= 3
          ? 100
          : Math.max(10, Math.min(85, Math.round((3 / Math.max(3, leaderboardRank)) * 100))),
    },
  ];

  // Strength & Weakness percentages per Track & per Course
  const trackLabels: Record<'GIS' | 'Programming' | 'General', { ar: string; en: string }> = {
    GIS: { ar: 'نظم المعلومات الجغرافية (GIS)', en: 'GIS' },
    Programming: { ar: 'البرمجة وتطوير الأنظمة', en: 'Programming' },
    General: { ar: 'المواد العامة', en: 'General' },
  };

  const trackBreakdown = (['GIS', 'Programming', 'General'] as const)
    .map((track) => {
      const trackCourses = store.courses.filter((c) => c.track === track);
      const trackCourseIds = new Set(trackCourses.map((c) => c.id));
      const trackSubs = userSubmissions.filter((s) => trackCourseIds.has(s.courseId));
      const tMax = trackSubs.reduce((sum, s) => sum + (s.maxScore || 0), 0);
      const tScore = trackSubs.reduce((sum, s) => sum + (s.score || 0), 0);

      let strengthPercent = 0;
      let hasData = false;
      if (trackSubs.length > 0 && tMax > 0) {
        strengthPercent = Math.round((tScore / tMax) * 100);
        hasData = true;
      } else {
        const trackEnrolled = enrolledCourses.filter((e) => e.course.track === track);
        if (trackEnrolled.length > 0) {
          const avgTrackCompletion = Math.round(
            trackEnrolled.reduce((sum, e) => sum + e.progressPercent, 0) /
              trackEnrolled.length
          );
          if (avgTrackCompletion > 0) {
            strengthPercent = avgTrackCompletion;
            hasData = true;
          }
        }
      }

      return {
        track,
        labelAr: trackLabels[track].ar,
        labelEn: trackLabels[track].en,
        attempts: trackSubs.length,
        hasData,
        strengthPercent,
        weaknessPercent: hasData ? 100 - strengthPercent : 0,
      };
    })
    .filter((item) => item.track !== 'General' || item.hasData || item.attempts > 0);

  const courseBreakdown = store.courses
    .map((course) => {
      const subs = userSubmissions.filter((s) => s.courseId === course.id);
      if (subs.length === 0) return null;
      const cMax = subs.reduce((sum, s) => sum + (s.maxScore || 0), 0);
      const cScore = subs.reduce((sum, s) => sum + (s.score || 0), 0);
      const strengthPercent = cMax > 0 ? Math.round((cScore / cMax) * 100) : 0;
      return {
        courseId: course.id,
        courseTitle: course.title,
        courseCode: course.code,
        track: course.track,
        attempts: subs.length,
        strengthPercent,
        weaknessPercent: 100 - strengthPercent,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const overallStrengthPercent = hasQuizData
    ? avgQuizScorePercent
    : completionPercentage;
  const overallHasSignal = hasQuizData || completionPercentage > 0;
  const overallWeaknessPercent = overallHasSignal
    ? Math.max(0, 100 - overallStrengthPercent)
    : 0;

  const areasWithData =
    courseBreakdown.length > 0
      ? courseBreakdown.map((c) => ({
          label: `${c.courseTitle} (${c.courseCode})`,
          percent: c.strengthPercent,
        }))
      : trackBreakdown
          .filter((t) => t.hasData)
          .map((t) => ({ label: t.labelAr, percent: t.strengthPercent }));

  const sortedAreasDesc = [...areasWithData].sort((a, b) => b.percent - a.percent);
  const strongestArea = sortedAreasDesc[0] || null;
  const weakestArea =
    sortedAreasDesc.length > 1
      ? sortedAreasDesc[sortedAreasDesc.length - 1]
      : sortedAreasDesc.length === 1 && sortedAreasDesc[0].percent < 100
      ? sortedAreasDesc[0]
      : null;

  res.json({
    completionPercentage,
    enrolledCourses,
    availableCourses,
    lastLesson: progress.lastLesson || null,
    upcomingQuizzes,
    tasks: progress.tasks,
    personalInfo: {
      ...toSafeUser(user),
      leaderboardRank,
      totalRankedUsers: rankedUsers.length,
    },
    achievements,
    earnedBadgesCount: achievements.filter((a) => a.earned).length,
    totalBadgesCount: achievements.length,
    strengthsAndWeaknesses: {
      overallStrengthPercent,
      overallWeaknessPercent,
      hasQuizData,
      hasSignal: overallHasSignal,
      avgQuizScorePercent,
      strongestArea,
      weakestArea,
      trackBreakdown,
      courseBreakdown,
    },
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
