import {
  ArrowUpLeft,
  BookOpen,
  CalendarClock,
  Check,
  CheckCircle2,
  Clock,
  Layers,
  Plus,
  Trash2,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import type { StudentDashboardData } from '../../types';
import { apiRequest } from '../../utils/api';
import { GoldChip } from '../ui/GoldChip';

interface StudentDashboardPanelProps {
  onOpenCourse: (courseId: string) => void;
}

export function StudentDashboardPanel({
  onOpenCourse,
}: StudentDashboardPanelProps) {
  const { user } = useAuth();
  const { tr, formatYear } = useLanguage();
  const [data, setData] = useState<StudentDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [manageEnrollments, setManageEnrollments] = useState(false);

  const formatStudyDuration = (totalMinutes: number): string => {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours === 0) {
      return `${minutes} ${tr('دقيقة', 'min')}`;
    }
    if (minutes === 0) {
      return `${hours} ${tr('ساعة', 'hr')}`;
    }
    return `${hours} ${tr('س', 'h')} ${minutes} ${tr('د', 'm')}`;
  };

  // Add task form
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDueDate, setTaskDueDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [taskType, setTaskType] = useState<'task' | 'exam'>('task');
  const [savingTask, setSavingTask] = useState(false);
  const [loggingMinutes, setLoggingMinutes] = useState(false);

  const loadDashboard = async () => {
    try {
      const res = await apiRequest<StudentDashboardData>(
        '/api/student/dashboard'
      );
      setData(res);
    } catch {
      // Handled gracefully
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const handleToggleEnroll = async (courseId: string) => {
    try {
      await apiRequest('/api/student/enroll', {
        method: 'POST',
        body: JSON.stringify({ courseId }),
      });
      await loadDashboard();
    } catch {
      // Ignore
    }
  };

  const handleAddStudyTime = async (minutes: number) => {
    setLoggingMinutes(true);
    try {
      await apiRequest('/api/student/study-time', {
        method: 'POST',
        body: JSON.stringify({ minutes }),
      });
      await loadDashboard();
    } catch {
      // Ignore
    } finally {
      setLoggingMinutes(false);
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim()) return;
    setSavingTask(true);
    try {
      await apiRequest('/api/student/tasks', {
        method: 'POST',
        body: JSON.stringify({
          title: taskTitle.trim(),
          dueDate: taskDueDate,
          type: taskType,
        }),
      });
      setTaskTitle('');
      setShowTaskForm(false);
      await loadDashboard();
    } catch {
      // Ignore
    } finally {
      setSavingTask(false);
    }
  };

  const handleToggleTask = async (taskId: string, completed: boolean) => {
    try {
      await apiRequest(`/api/student/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify({ completed: !completed }),
      });
      await loadDashboard();
    } catch {
      // Ignore
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      await apiRequest(`/api/student/tasks/${taskId}`, {
        method: 'DELETE',
      });
      await loadDashboard();
    } catch {
      // Ignore
    }
  };

  if (loading) {
    return (
      <section className="rounded-2xl bg-[#121216] border border-[#D4AF37]/20 p-6 space-y-4">
        <div className="h-6 w-56 rounded bg-white/5 animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="h-28 rounded-xl bg-white/5 animate-pulse" />
          ))}
        </div>
      </section>
    );
  }

  if (!data) return null;

  const {
    completionPercentage,
    enrolledCourses,
    availableCourses,
    lastLesson,
    upcomingQuizzes,
    tasks,
    stats,
  } = data;

  const totalItemsCompleted =
    stats.completedLessonsCount + stats.completedQuizzesCount;
  const totalItemsAvailable = stats.totalLessonsCount + stats.totalQuizzesCount;
  const pendingTasksCount = tasks.filter((t) => !t.completed).length;

  return (
    <section className="rounded-2xl bg-[#121216] border border-[#D4AF37]/25 overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-[#D4AF37]">
            <span>{tr('لوحة التحكم الشخصية', 'Personal Student Dashboard')}</span>
            <span aria-hidden="true">·</span>
            <span>{user?.name}</span>
            {user && (
              <>
                <span aria-hidden="true">·</span>
                <span>{formatYear(user.year)}</span>
              </>
            )}
          </div>
          <h2 className="font-display text-xl sm:text-2xl font-bold text-[#F5F0E6]">
            {tr('متابعة مستواك وتقدمك الدراسي', 'Your Learning Progress & Overview')}
          </h2>
        </div>

        <GoldChip
          active={manageEnrollments}
          onClick={() => setManageEnrollments((p) => !p)}
          className="text-xs px-3.5 py-2 self-start sm:self-auto"
        >
          <Layers className="w-4 h-4" />
          <span>
            {manageEnrollments
              ? tr('إغلاق إدارة التسجيل', 'Close Enrollment Manager')
              : tr('إدارة الكورسات المسجلة', 'Manage Enrolled Courses')}
          </span>
        </GoldChip>
      </div>

      {/* Manage Course Enrollments Drawer */}
      {manageEnrollments && (
        <div className="p-6 bg-[#09090B] border-b border-[#D4AF37]/25 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="font-display text-base font-bold text-[#E5C158]">
                {tr('اختيار الكورسات المسجل فيها', 'Select Enrolled Courses')}
              </h3>
              <p className="text-xs text-[#A8A29E]">
                {tr(
                  'اختر المواد التي تدرسها حالياً ليتم حساب نسبة إنجازك وإظهار اختباراتها في لوحتك',
                  'Pick the courses you are currently studying to track your completion rate'
                )}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {availableCourses.map((course) => (
              <div
                key={course.id}
                className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 transition-colors ${
                  course.enrolled
                    ? 'bg-[#151519] border-[#D4AF37]/50'
                    : 'bg-[#121216] border-white/10'
                }`}
              >
                <div className="min-w-0">
                  <div className="text-[11px] text-[#D4AF37] font-mono">
                    {course.code} · {formatYear(course.year)}
                  </div>
                  <div className="text-sm font-semibold text-[#F5F0E6] truncate">
                    {course.title}
                  </div>
                </div>
                <GoldChip
                  active={course.enrolled}
                  onClick={() => handleToggleEnroll(course.id)}
                  className="text-xs px-3 py-1.5 shrink-0"
                >
                  {course.enrolled ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>{tr('مسجل', 'Enrolled')}</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5" />
                      <span>{tr('تسجيل', 'Enroll')}</span>
                    </>
                  )}
                </GoldChip>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4-Column Personal KPIs + Last Lesson */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x sm:divide-x-reverse divide-white/10 border-b border-white/10 bg-[#0D0D10]">
        {/* 1. Completion Percentage */}
        <div className="p-5 space-y-3">
          <div className="flex items-center justify-between text-xs text-[#A8A29E]">
            <span>{tr('نسبة إنجاز الطالب', 'Student Completion')}</span>
            <span className="font-mono tabular-nums text-[#E5C158] font-bold">
              {completionPercentage}%
            </span>
          </div>
          <div className="font-mono text-3xl font-bold text-[#F5F0E6] tabular-nums">
            {completionPercentage}%
          </div>
          <div className="h-2 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-l from-[#E5C158] to-[#D4AF37] transition-all duration-500"
              style={{ width: `${completionPercentage}%` }}
            />
          </div>
          <div className="text-[11px] text-[#A8A29E] tabular-nums">
            {tr(
              `أتممت ${totalItemsCompleted} من أصل ${totalItemsAvailable} درس واختبار`,
              `Completed ${totalItemsCompleted} of ${totalItemsAvailable} lessons & quizzes`
            )}
          </div>
        </div>

        {/* 2. Enrolled Courses & Quizzes Stats */}
        <div className="p-5 space-y-2.5">
          <div className="text-xs text-[#A8A29E]">
            {tr('الكورسات المسجل فيها', 'Enrolled Courses')}
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-3xl font-bold text-[#E5C158] tabular-nums">
              {stats.enrolledCoursesCount}
            </span>
            <span className="text-xs text-[#C8C2B8]">
              {tr('مواد نشطة', 'active courses')}
            </span>
          </div>
          <div className="pt-1 flex flex-wrap items-center gap-2 text-[11px] text-[#A8A29E] tabular-nums">
            <span>
              {tr('ملخصات', 'Summaries')}: {stats.completedLessonsCount}/{stats.totalLessonsCount}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {tr('اختبارات', 'Quizzes')}: {stats.completedQuizzesCount}/{stats.totalQuizzesCount}
            </span>
          </div>
        </div>

        {/* 3. Learning Hours & Statistics */}
        <div className="p-5 space-y-2.5">
          <div className="flex items-center justify-between text-xs text-[#A8A29E]">
            <span>{tr('ساعات التعلم والإحصائيات', 'Study Hours & Stats')}</span>
            <Clock className="w-3.5 h-3.5 text-[#D4AF37]" />
          </div>
          <div className="font-mono text-2xl font-bold text-[#F5F0E6] tabular-nums">
            {formatStudyDuration(stats.studyMinutes)}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            <button
              type="button"
              disabled={loggingMinutes}
              onClick={() => handleAddStudyTime(15)}
              className="px-2 py-1 rounded-md bg-[#18181D] border border-white/10 hover:border-[#D4AF37]/60 text-[11px] font-mono text-[#E5C158] transition-colors cursor-pointer"
            >
              +15m
            </button>
            <button
              type="button"
              disabled={loggingMinutes}
              onClick={() => handleAddStudyTime(30)}
              className="px-2 py-1 rounded-md bg-[#18181D] border border-white/10 hover:border-[#D4AF37]/60 text-[11px] font-mono text-[#E5C158] transition-colors cursor-pointer"
            >
              +30m
            </button>
            <button
              type="button"
              disabled={loggingMinutes}
              onClick={() => handleAddStudyTime(60)}
              className="px-2 py-1 rounded-md bg-[#18181D] border border-white/10 hover:border-[#D4AF37]/60 text-[11px] font-mono text-[#E5C158] transition-colors cursor-pointer"
            >
              +1h
            </button>
          </div>
          <div className="text-[11px] text-[#A8A29E] tabular-nums">
            {stats.points} {tr('نقطة', 'pts')} · {stats.quizzesCompleted}{' '}
            {tr('اختبارات مكتملة', 'quizzes')}
          </div>
        </div>

        {/* 4. Last Lesson Reached */}
        <div className="p-5 flex flex-col justify-between gap-3">
          <div className="space-y-1">
            <div className="text-xs text-[#A8A29E]">
              {tr('آخر درس وصلت إليه', 'Last Lesson Reached')}
            </div>
            {lastLesson ? (
              <>
                <div className="text-sm font-bold text-[#F5F0E6] line-clamp-1">
                  {lastLesson.lessonTitle}
                </div>
                <div className="text-xs text-[#D4AF37] line-clamp-1">
                  {lastLesson.courseTitle}
                </div>
              </>
            ) : (
              <div className="text-xs text-[#C8C2B8]">
                {tr(
                  'لم تبدأ أي درس بعد — اختر مادة وابدأ المذاكرة',
                  'No lessons started yet — pick a course to begin'
                )}
              </div>
            )}
          </div>

          {lastLesson ? (
            <GoldChip
              active={true}
              onClick={() => onOpenCourse(lastLesson.courseId)}
              className="text-xs px-3 py-1.5 self-start"
            >
              <span>{tr('متابعة الدرس', 'Resume Lesson')}</span>
              <ArrowUpLeft className="w-3.5 h-3.5" />
            </GoldChip>
          ) : (
            enrolledCourses[0] && (
              <GoldChip
                active={true}
                onClick={() => onOpenCourse(enrolledCourses[0].course.id)}
                className="text-xs px-3 py-1.5 self-start"
              >
                <span>{tr('بدء أول مادة', 'Start First Course')}</span>
                <ArrowUpLeft className="w-3.5 h-3.5" />
              </GoldChip>
            )
          )}
        </div>
      </div>

      {/* Main Split Workspace: Enrolled Courses + Upcoming Tasks & Quizzes */}
      <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x lg:divide-x-reverse divide-white/10">
        {/* Enrolled Courses Progress */}
        <div className="lg:col-span-7 p-6 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-display text-base font-bold text-[#F5F0E6] flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-[#D4AF37]" />
              <span>{tr('الكورسات المسجل فيها', 'Enrolled Courses')}</span>
            </h3>
            <span className="text-xs text-[#A8A29E] tabular-nums">
              {enrolledCourses.length} {tr('مواد', 'courses')}
            </span>
          </div>

          {enrolledCourses.length === 0 ? (
            <div className="p-6 rounded-xl bg-[#09090B] border border-white/10 text-center space-y-3">
              <p className="text-xs text-[#A8A29E]">
                {tr('لم تسجل في أي كورس حتى الآن.', 'You have not enrolled in any course yet.')}
              </p>
              <GoldChip
                active={true}
                onClick={() => setManageEnrollments(true)}
                className="text-xs px-3.5 py-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{tr('اختيار الكورسات', 'Select Courses')}</span>
              </GoldChip>
            </div>
          ) : (
            <div className="space-y-3">
              {enrolledCourses.map((item) => (
                <div
                  key={item.course.id}
                  className="p-4 rounded-xl bg-[#0D0D10] border border-white/10 hover:border-[#D4AF37]/40 transition-colors space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#D4AF37]">
                        <span className="font-mono">{item.course.code}</span>
                        <span aria-hidden="true">·</span>
                        <span>{formatYear(item.course.year)}</span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {item.course.track === 'Programming'
                            ? tr('برمجة', 'Programming')
                            : item.course.track}
                        </span>
                      </div>
                      <div className="font-semibold text-sm text-[#F5F0E6] truncate">
                        {item.course.title}
                      </div>
                    </div>

                    <GoldChip
                      onClick={() => onOpenCourse(item.course.id)}
                      className="text-xs px-3 py-1.5 shrink-0 self-start sm:self-auto"
                    >
                      <span>{tr('فتح المادة', 'Open Course')}</span>
                      <ArrowUpLeft className="w-3.5 h-3.5" />
                    </GoldChip>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] text-[#A8A29E] tabular-nums">
                      <span>
                        {tr('ملخصات', 'Summaries')} {item.completedSummaries}/{item.totalSummaries} ·{' '}
                        {tr('اختبارات', 'Quizzes')} {item.completedQuizzes}/{item.totalQuizzes}
                      </span>
                      <span className="font-mono text-[#E5C158] font-bold">
                        {item.progressPercent}%
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-l from-[#E5C158] to-[#D4AF37] transition-all duration-500"
                        style={{ width: `${item.progressPercent}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming Tasks & Quizzes */}
        <div className="lg:col-span-5 p-6 space-y-5">
          {/* Upcoming Platform Quizzes */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-base font-bold text-[#F5F0E6] flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-[#D4AF37]" />
                <span>{tr('المهام والاختبارات القادمة', 'Upcoming Tasks & Quizzes')}</span>
              </h3>
              <GoldChip
                active={showTaskForm}
                onClick={() => setShowTaskForm((p) => !p)}
                className="text-xs px-2.5 py-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{tr('إضافة مهمة', 'Add Task')}</span>
              </GoldChip>
            </div>

            {showTaskForm && (
              <form
                onSubmit={handleCreateTask}
                className="p-3.5 rounded-xl bg-[#09090B] border border-[#D4AF37]/35 space-y-2.5"
              >
                <input
                  type="text"
                  required
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder={tr('عنوان المهمة أو الاختبار القادم...', 'Task or upcoming exam title...')}
                  className="w-full px-3 py-2 rounded-lg bg-[#151519] border border-white/10 text-xs text-[#F5F0E6] focus:outline-none focus:border-[#D4AF37]"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    value={taskDueDate}
                    onChange={(e) => setTaskDueDate(e.target.value)}
                    className="px-3 py-1.5 rounded-lg bg-[#151519] border border-white/10 text-xs text-[#F5F0E6] font-mono focus:outline-none focus:border-[#D4AF37]"
                  />
                  <select
                    value={taskType}
                    onChange={(e) =>
                      setTaskType(e.target.value as 'task' | 'exam')
                    }
                    className="px-3 py-1.5 rounded-lg bg-[#151519] border border-white/10 text-xs text-[#F5F0E6] focus:outline-none focus:border-[#D4AF37]"
                  >
                    <option value="task">{tr('مهمة مذاكرة', 'Study Task')}</option>
                    <option value="exam">{tr('موعد اختبار', 'Exam Date')}</option>
                  </select>
                </div>
                <div className="flex justify-end">
                  <GoldChip
                    type="submit"
                    active={true}
                    disabled={savingTask}
                    className="text-xs px-3 py-1.5"
                  >
                    {savingTask ? tr('جاري الحفظ...', 'Saving...') : tr('حفظ في الجدول', 'Save Task')}
                  </GoldChip>
                </div>
              </form>
            )}

            {/* Uncompleted quizzes from enrolled courses */}
            {upcomingQuizzes.length > 0 && (
              <div className="space-y-2">
                <div className="text-[11px] font-semibold text-[#D4AF37]">
                  {tr('اختبارات شاملة متاحة لموادك', 'Available Quizzes in Your Courses')} ({upcomingQuizzes.length})
                </div>
                {upcomingQuizzes.slice(0, 3).map((quiz) => (
                  <div
                    key={quiz.quizId}
                    className="p-3 rounded-xl bg-[#0D0D10] border border-[#D4AF37]/25 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="text-xs font-semibold text-[#F5F0E6] truncate">
                        {quiz.title}
                      </div>
                      <div className="text-[11px] text-[#A8A29E] truncate tabular-nums">
                        {quiz.courseTitle} · {quiz.questionsCount} {tr('أسئلة', 'Q')} ·{' '}
                        {quiz.durationMinutes} {tr('د', 'min')}
                      </div>
                    </div>
                    <GoldChip
                      active={true}
                      onClick={() => onOpenCourse(quiz.courseId)}
                      className="text-[11px] px-2.5 py-1 shrink-0"
                    >
                      {tr('ابدأ', 'Start')}
                    </GoldChip>
                  </div>
                ))}
              </div>
            )}

            {/* Personal tasks checklist */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] text-[#A8A29E] tabular-nums">
                <span>{tr('قائمة مهامك ومواعيدك', 'Your Tasks & Schedule')}</span>
                <span>
                  {pendingTasksCount} {tr('متبقية', 'pending')}
                </span>
              </div>

              {tasks.length === 0 ? (
                <div className="p-4 rounded-xl bg-[#0D0D10] border border-white/10 text-center text-xs text-[#A8A29E]">
                  {tr(
                    'لا توجد مهام مجدولة حالياً. أضف أول مهمة لتنظيم وقتك.',
                    'No scheduled tasks yet. Add your first task above.'
                  )}
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto pe-1">
                  {tasks.map((task) => (
                    <div
                      key={task.id}
                      className={`p-3 rounded-xl border flex items-center justify-between gap-3 transition-colors ${
                        task.completed
                          ? 'bg-[#09090B] border-white/5 opacity-60'
                          : 'bg-[#0D0D10] border-white/10'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handleToggleTask(task.id, task.completed)}
                        className="flex items-start gap-2.5 text-start flex-1 min-w-0 cursor-pointer"
                      >
                        <span
                          className={`mt-0.5 w-4 h-4 rounded flex items-center justify-center border shrink-0 transition-colors ${
                            task.completed
                              ? 'bg-[#D4AF37] border-[#D4AF37] text-[#09090B]'
                              : 'border-white/25 hover:border-[#D4AF37]'
                          }`}
                        >
                          {task.completed && (
                            <CheckCircle2 className="w-3 h-3" />
                          )}
                        </span>
                        <div className="min-w-0 space-y-0.5">
                          <div
                            className={`text-xs font-medium truncate ${
                              task.completed
                                ? 'line-through text-[#A8A29E]'
                                : 'text-[#F5F0E6]'
                            }`}
                          >
                            {task.title}
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-[#A8A29E] tabular-nums">
                            <span className="font-mono">{task.dueDate}</span>
                            <span aria-hidden="true">·</span>
                            <span className="text-[#D4AF37]">
                              {task.type === 'exam'
                                ? tr('اختبار', 'Exam')
                                : tr('مهمة', 'Task')}
                            </span>
                          </div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteTask(task.id)}
                        aria-label={tr('حذف المهمة', 'Delete task')}
                        className="p-1.5 rounded-lg text-[#A8A29E] hover:text-red-400 hover:bg-red-950/40 transition-colors cursor-pointer shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
