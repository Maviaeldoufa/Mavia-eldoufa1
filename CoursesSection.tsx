import {
  Clock,
  Folder,
  ImageOff,
  ImagePlus,
  Plus,
  Trash2,
} from 'lucide-react';
import { motion } from 'motion/react';
import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import type { AcademicYear, AnnouncementCountdown, Course } from '../../types';
import { apiRequest } from '../../utils/api';
import { CountdownTimer } from '../ui/CountdownTimer';
import { GoldChip } from '../ui/GoldChip';
import { CourseDetailModal } from './CourseDetailModal';

interface CoursesSectionProps {
  initialCourseId?: string | null;
  onInitialCourseHandled?: () => void;
}

function defaultReleaseDatetime(): string {
  const d = new Date(Date.now() + 2 * 86400000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T18:00`;
}

export function CoursesSection({
  initialCourseId,
  onInitialCourseHandled,
}: CoursesSectionProps = {}) {
  const { user } = useAuth();
  const { tr, formatYear } = useLanguage();
  const isAdmin = user?.role === 'admin';

  const [courses, setCourses] = useState<Course[]>([]);
  const [courseTimers, setCourseTimers] = useState<AnnouncementCountdown[]>([]);
  const [loading, setLoading] = useState(true);
  const [yearFilter, setYearFilter] = useState<number>(user?.year || 0);
  const [trackFilter, setTrackFilter] = useState<string>('ALL');
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(
    initialCourseId ?? null
  );
  const [litCourseId, setLitCourseId] = useState<string | null>(null);
  const litCourseTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (litCourseTimerRef.current !== null) {
        window.clearTimeout(litCourseTimerRef.current);
      }
    };
  }, []);

  const handleOpenCourseCard = (courseId: string) => {
    setLitCourseId(courseId);
    if (litCourseTimerRef.current !== null) {
      window.clearTimeout(litCourseTimerRef.current);
    }
    litCourseTimerRef.current = window.setTimeout(() => {
      setLitCourseId(null);
    }, 650);
    setSelectedCourseId(courseId);
  };

  // Admin add course / folder form
  const [showAddForm, setShowAddForm] = useState(false);
  const [title, setTitle] = useState('');
  const [code, setCode] = useState('');
  const [year, setYear] = useState<AcademicYear>(1);
  const [track, setTrack] = useState<'GIS' | 'Programming' | 'General'>('GIS');
  const [instructor, setInstructor] = useState('');
  const [description, setDescription] = useState('');
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [courseReleaseAt, setCourseReleaseAt] = useState('');
  const [saving, setSaving] = useState(false);
  const [courseError, setCourseError] = useState<string | null>(null);

  // Admin add Courses release countdown banner
  const [showTimerForm, setShowTimerForm] = useState(false);
  const [timerTitle, setTimerTitle] = useState('');
  const [timerDesc, setTimerDesc] = useState('');
  const [timerTargetAt, setTimerTargetAt] = useState(defaultReleaseDatetime);
  const [savingTimer, setSavingTimer] = useState(false);

  const yearFilters: Array<{ value: number; label: string }> = [
    { value: 0, label: tr('جميع الدفعات', 'All Years') },
    { value: 1, label: tr('الفرقة الأولى', 'Year 1') },
    { value: 2, label: tr('الفرقة الثانية', 'Year 2') },
    { value: 3, label: tr('الفرقة الثالثة', 'Year 3') },
    { value: 4, label: tr('الفرقة الرابعة', 'Year 4') },
  ];

  const trackFilters: Array<{ value: string; label: string }> = [
    { value: 'ALL', label: tr('كل التخصصات', 'All Tracks') },
    { value: 'GIS', label: 'GIS' },
    { value: 'Programming', label: tr('البرمجة', 'Programming') },
  ];

  const loadCourses = async () => {
    setLoading(true);
    try {
      const [coursesData, timersData] = await Promise.all([
        apiRequest<{ courses: Course[] }>('/api/courses'),
        apiRequest<{ announcements: AnnouncementCountdown[] }>(
          '/api/announcements?scope=courses'
        ),
      ]);
      setCourses(coursesData.courses);
      setCourseTimers(timersData.announcements);
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCourses();
  }, []);

  useEffect(() => {
    if (initialCourseId) {
      setSelectedCourseId(initialCourseId);
      onInitialCourseHandled?.();
    }
  }, [initialCourseId]);

  const handleAddCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    setCourseError(null);
    if (!title.trim()) return;
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('title', title.trim());
      if (code.trim()) fd.append('code', code.trim());
      fd.append('year', String(year));
      fd.append('track', track);
      if (instructor.trim()) fd.append('instructor', instructor.trim());
      if (description.trim()) fd.append('description', description.trim());
      if (courseReleaseAt) {
        fd.append('releaseAt', new Date(courseReleaseAt).toISOString());
      }
      if (coverFile) {
        fd.append('cover', coverFile);
      }

      const data = await apiRequest<{ course: Course }>('/api/courses', {
        method: 'POST',
        body: fd,
      });
      setCourses((prev) => [data.course, ...prev]);
      setTitle('');
      setCode('');
      setInstructor('');
      setDescription('');
      setCoverFile(null);
      setCourseReleaseAt('');
      setShowAddForm(false);
    } catch (err) {
      setCourseError(
        err instanceof Error
          ? err.message
          : tr('تعذر إضافة المادة.', 'Failed to create course.')
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCourse = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await apiRequest(`/api/courses/${id}`, { method: 'DELETE' });
      setCourses((prev) => prev.filter((c) => c.id !== id));
    } catch {
      // Ignore
    }
  };

  const handleUploadCourseCover = async (
    courseId: string,
    file: File | null
  ) => {
    if (!file) return;
    try {
      const fd = new FormData();
      fd.append('cover', file);
      const res = await apiRequest<{ coverUrl: string }>(
        `/api/courses/${courseId}/cover`,
        {
          method: 'POST',
          body: fd,
        }
      );
      setCourses((prev) =>
        prev.map((c) =>
          c.id === courseId ? { ...c, coverUrl: res.coverUrl } : c
        )
      );
    } catch {
      // Ignore
    }
  };

  const handleDeleteCourseCover = async (
    courseId: string,
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    try {
      await apiRequest(`/api/courses/${courseId}/cover`, { method: 'DELETE' });
      setCourses((prev) =>
        prev.map((c) => (c.id === courseId ? { ...c, coverUrl: undefined } : c))
      );
    } catch {
      // Ignore
    }
  };

  const handleCreateTimer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!timerTitle.trim() || !timerTargetAt) return;
    setSavingTimer(true);
    try {
      const res = await apiRequest<{ announcement: AnnouncementCountdown }>(
        '/api/announcements',
        {
          method: 'POST',
          body: JSON.stringify({
            scope: 'courses',
            title: timerTitle.trim(),
            description: timerDesc.trim(),
            category: 'release',
            targetAt: new Date(timerTargetAt).toISOString(),
          }),
        }
      );
      setCourseTimers((prev) => [res.announcement, ...prev]);
      setTimerTitle('');
      setTimerDesc('');
      setShowTimerForm(false);
    } catch {
      // Ignore
    } finally {
      setSavingTimer(false);
    }
  };

  const handleDeleteTimer = async (id: string) => {
    try {
      await apiRequest(`/api/announcements/${id}`, { method: 'DELETE' });
      setCourseTimers((prev) => prev.filter((t) => t.id !== id));
    } catch {
      // Ignore
    }
  };

  const filtered = courses.filter((c) => {
    if (yearFilter !== 0 && c.year !== yearFilter) return false;
    if (trackFilter !== 'ALL' && c.track !== trackFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#F5F0E6]">
            {tr('الكورسات والمجلدات الدراسية', 'Courses & Study Folders')}
          </h1>
          <p className="text-xs sm:text-sm text-[#A8A29E]">
            {tr(
              'مواد ومجلدات كل دفعة بأغلفة صور مخصصة، ملخصات PDF بعداد مشاهدات، واختبارات شاملة',
              'Organized course folders with custom image covers, PDF view counters, and interactive quizzes'
            )}
          </p>
        </div>

        {isAdmin && (
          <div className="flex flex-wrap items-center gap-2">
            <GoldChip
              active={showTimerForm}
              onClick={() => setShowTimerForm((p) => !p)}
              className="text-xs px-3 py-2"
            >
              <Clock className="w-4 h-4" />
              <span>
                {showTimerForm
                  ? tr('إغلاق المؤقت', 'Close Timer')
                  : tr('إضافة مؤقت تنزيل', 'Add Release Timer')}
              </span>
            </GoldChip>
            <GoldChip
              active={showAddForm}
              onClick={() => setShowAddForm((p) => !p)}
            >
              <Plus className="w-4 h-4" />
              <span>
                {showAddForm
                  ? tr('إغلاق النموذج', 'Close Form')
                  : tr('إضافة مادة / مجلد جديد', 'New Course / Folder')}
              </span>
            </GoldChip>
          </div>
        )}
      </div>

      {/* Course Release Countdown Timers Banner */}
      {(courseTimers.length > 0 || (isAdmin && showTimerForm)) && (
        <section className="rounded-2xl bg-[#121216] border border-[#D4AF37]/30 p-5 space-y-4">
          <div className="flex items-center gap-2 text-sm font-bold text-[#E5C158]">
            <Clock className="w-4 h-4 text-[#D4AF37]" />
            <span>
              {tr(
                'مؤقتات التنزيلات القادمة في قسم الكورسات',
                'Upcoming Course Content Release Timers'
              )}
            </span>
          </div>

          {isAdmin && showTimerForm && (
            <form
              onSubmit={handleCreateTimer}
              className="p-4 rounded-xl bg-[#09090B] border border-[#D4AF37]/30 space-y-3"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  required
                  value={timerTitle}
                  onChange={(e) => setTimerTitle(e.target.value)}
                  placeholder={tr(
                    'عنوان المحتوى القادم (مثال: تنزيل ملخص المحاضرة الرابعة)',
                    'Scheduled release title...'
                  )}
                  className="px-3 py-2 rounded-lg bg-[#151519] border border-white/10 text-sm text-[#F5F0E6] focus:outline-none focus:border-[#D4AF37]"
                />
                <input
                  type="datetime-local"
                  required
                  value={timerTargetAt}
                  onChange={(e) => setTimerTargetAt(e.target.value)}
                  className="px-3 py-2 rounded-lg bg-[#151519] border border-white/10 text-sm text-[#F5F0E6] font-mono focus:outline-none focus:border-[#D4AF37]"
                />
              </div>
              <input
                type="text"
                value={timerDesc}
                onChange={(e) => setTimerDesc(e.target.value)}
                placeholder={tr('وصف مختصر لما سيتم تنزيله (اختياري)', 'Short description (optional)')}
                className="w-full px-3 py-2 rounded-lg bg-[#151519] border border-white/10 text-sm text-[#F5F0E6] focus:outline-none focus:border-[#D4AF37]"
              />
              <div className="flex justify-end">
                <GoldChip type="submit" active={true} disabled={savingTimer}>
                  {savingTimer
                    ? tr('جاري الحفظ...', 'Saving...')
                    : tr('تفعيل المؤقت', 'Activate Timer')}
                </GoldChip>
              </div>
            </form>
          )}

          {courseTimers.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {courseTimers.map((t) => (
                <div
                  key={t.id}
                  className="p-4 rounded-xl bg-[#0D0D10] border border-white/10 flex flex-col justify-between gap-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold text-sm text-[#F5F0E6]">
                        {t.title}
                      </h3>
                      {t.description && (
                        <p className="text-xs text-[#A8A29E] mt-0.5">
                          {t.description}
                        </p>
                      )}
                    </div>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => handleDeleteTimer(t.id)}
                        aria-label={tr('حذف المؤقت', 'Delete timer')}
                        className="p-1 text-red-400 hover:text-red-300 cursor-pointer shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <CountdownTimer targetAt={t.targetAt} />
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Filters */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-4 rounded-2xl bg-[#121216] border border-white/10">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 lg:pb-0">
          {yearFilters.map((f) => (
            <GoldChip
              key={f.value}
              active={yearFilter === f.value}
              layoutId="courses-year-filter"
              onClick={() => setYearFilter(f.value)}
              className="text-xs px-3 py-1.5"
            >
              {f.label}
            </GoldChip>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {trackFilters.map((t) => (
            <GoldChip
              key={t.value}
              active={trackFilter === t.value}
              layoutId="courses-track-filter"
              onClick={() => setTrackFilter(t.value)}
              className="text-xs px-3 py-1.5"
            >
              {t.label}
            </GoldChip>
          ))}
        </div>
      </div>

      {/* Admin Add Course Form with Image Cover & Optional Timer */}
      {isAdmin && showAddForm && (
        <form
          onSubmit={handleAddCourse}
          className="p-5 rounded-2xl bg-[#121216] border border-[#D4AF37]/30 space-y-4"
        >
          <h3 className="font-display text-lg font-bold text-[#E5C158]">
            {tr('إضافة مادة أو مجلد رئيسي جديد', 'Create New Course / Folder')}
          </h3>
          {courseError && (
            <div className="p-3 rounded-lg bg-red-950/50 border border-red-500/40 text-red-200 text-xs">
              {courseError}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={tr('اسم المادة أو المجلد', 'Course / Folder Name')}
              className="sm:col-span-2 px-3.5 py-2.5 rounded-xl bg-[#09090B] border border-white/10 text-sm text-[#F5F0E6] focus:outline-none focus:border-[#D4AF37]"
            />
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={tr('كود المادة (مثال: GIS-204)', 'Code (e.g. GIS-204)')}
              className="px-3.5 py-2.5 rounded-xl bg-[#09090B] border border-white/10 text-sm text-[#F5F0E6] font-mono focus:outline-none focus:border-[#D4AF37]"
            />
            <input
              type="text"
              value={instructor}
              onChange={(e) => setInstructor(e.target.value)}
              placeholder={tr('اسم المحاضر', 'Instructor')}
              className="px-3.5 py-2.5 rounded-xl bg-[#09090B] border border-white/10 text-sm text-[#F5F0E6] focus:outline-none focus:border-[#D4AF37]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value) as AcademicYear)}
              className="px-3.5 py-2.5 rounded-xl bg-[#09090B] border border-white/10 text-sm text-[#F5F0E6] focus:outline-none focus:border-[#D4AF37]"
            >
              <option value={1}>{formatYear(1)}</option>
              <option value={2}>{formatYear(2)}</option>
              <option value={3}>{formatYear(3)}</option>
              <option value={4}>{formatYear(4)}</option>
            </select>
            <select
              value={track}
              onChange={(e) =>
                setTrack(e.target.value as 'GIS' | 'Programming' | 'General')
              }
              className="px-3.5 py-2.5 rounded-xl bg-[#09090B] border border-white/10 text-sm text-[#F5F0E6] focus:outline-none focus:border-[#D4AF37]"
            >
              <option value="GIS">{tr('نظم المعلومات الجغرافية (GIS)', 'GIS')}</option>
              <option value="Programming">{tr('البرمجة وهندسة البرمجيات', 'Programming')}</option>
              <option value="General">{tr('مادة عامة', 'General')}</option>
            </select>
            <input
              type="datetime-local"
              value={courseReleaseAt}
              onChange={(e) => setCourseReleaseAt(e.target.value)}
              title={tr('مؤقت تنزيل اختياري', 'Optional release countdown')}
              className="px-3.5 py-2.5 rounded-xl bg-[#09090B] border border-white/10 text-sm text-[#F5F0E6] font-mono focus:outline-none focus:border-[#D4AF37]"
            />
          </div>

          <textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={tr('وصف مختصر للمادة ومحتوياتها...', 'Short course description...')}
            className="w-full px-3.5 py-2.5 rounded-xl bg-[#09090B] border border-white/10 text-sm text-[#F5F0E6] focus:outline-none focus:border-[#D4AF37]"
          />

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <label className="flex items-center gap-2.5 px-3.5 py-2 rounded-lg bg-[#151519] border border-dashed border-[#D4AF37]/50 text-xs text-[#E5C158] cursor-pointer hover:bg-[#1C1C22] transition-colors">
              <ImagePlus className="w-4 h-4 shrink-0" />
              <span className="truncate max-w-[260px]">
                {coverFile
                  ? `${tr('صورة الغلاف:', 'Cover:')}: ${coverFile.name}`
                  : tr('رفع صورة غلاف للمادة/المجلد (PNG / JPG)', 'Upload Cover Image (PNG / JPG)')}
              </span>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setCoverFile(e.target.files?.[0] || null)}
                className="sr-only"
              />
            </label>

            <GoldChip type="submit" active={true} disabled={saving}>
              {saving ? tr('جاري الإضافة...', 'Saving...') : tr('حفظ المادة', 'Save Course')}
            </GoldChip>
          </div>
        </form>
      )}

      {/* Courses Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className="h-52 rounded-2xl bg-white/5 animate-pulse"
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-14 text-center rounded-2xl bg-[#121216] border border-white/10 text-sm text-[#A8A29E]">
          {tr('لا توجد مواد مطابقة للتصفية الحالية.', 'No courses match the current filter.')}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filtered.map((course, idx) => {
            const isLit = litCourseId === course.id;
            return (
            <motion.article
              key={course.id}
              onClick={() => handleOpenCourseCard(course.id)}
              animate={{ y: [0, -4, 0] }}
              transition={{
                duration: 4.2 + (idx % 3) * 0.35,
                delay: (idx % 4) * 0.4,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
              whileHover={{ scale: 1.015 }}
              whileTap={{ scale: 0.99 }}
              className={`group relative rounded-2xl bg-[#121216] border overflow-hidden flex flex-col justify-between transition-all duration-200 cursor-pointer hover:border-[#F5D061] hover:shadow-[0_0_32px_rgba(212,175,55,0.42),inset_0_0_24px_rgba(212,175,55,0.08)] focus-within:border-[#F5D061] ${
                isLit
                  ? 'border-[#FFF1B8] brightness-110 shadow-[0_0_40px_rgba(255,241,184,0.6),0_0_72px_rgba(212,175,55,0.45)]'
                  : 'border-white/10'
              }`}
            >
              {/* Soft radial illumination sheen on hover/click */}
              <span
                aria-hidden="true"
                className={`pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(245,208,97,0.16),transparent_65%)] transition-opacity duration-200 ${
                  isLit ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                }`}
              />
              {/* Cover Image Header if uploaded */}
              {course.coverUrl && (
                <div className="relative h-44 w-full bg-[#09090B] overflow-hidden border-b border-white/10">
                  <img
                    src={course.coverUrl}
                    alt={course.title}
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#121216]/85 via-transparent to-transparent" />
                  {isAdmin && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="absolute top-3 end-3 flex items-center gap-1.5"
                    >
                      <label className="px-2.5 py-1 rounded-lg bg-[#09090B]/85 border border-[#D4AF37]/40 text-[11px] text-[#E5C158] hover:bg-[#D4AF37] hover:text-[#09090B] cursor-pointer transition-colors inline-flex items-center gap-1">
                        <ImagePlus className="w-3 h-3" />
                        <span>{tr('تغيير الغلاف', 'Change Cover')}</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) =>
                            handleUploadCourseCover(
                              course.id,
                              e.target.files?.[0] || null
                            )
                          }
                          className="sr-only"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteCourseCover(course.id, e)}
                        className="px-2.5 py-1 rounded-lg bg-red-950/90 border border-red-500/40 text-[11px] text-red-200 hover:bg-red-600 hover:text-white cursor-pointer transition-colors inline-flex items-center gap-1"
                      >
                        <ImageOff className="w-3 h-3" />
                        <span>{tr('حذف الغلاف', 'Delete Cover')}</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="p-6 flex-1 flex flex-col justify-between gap-5">
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2 text-xs text-[#D4AF37]">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono">{course.code}</span>
                      <span aria-hidden="true">·</span>
                      <span>{formatYear(course.year)}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {course.track === 'Programming'
                          ? tr('برمجة', 'Programming')
                          : course.track}
                      </span>
                    </div>
                    {isAdmin && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1.5"
                      >
                        {!course.coverUrl && (
                          <label
                            title={tr('إضافة غلاف صورة', 'Upload cover image')}
                            className="p-1.5 rounded-lg text-[#D4AF37] hover:bg-[#D4AF37]/15 transition-colors cursor-pointer"
                          >
                            <ImagePlus className="w-4 h-4" />
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) =>
                                handleUploadCourseCover(
                                  course.id,
                                  e.target.files?.[0] || null
                                )
                              }
                              className="sr-only"
                            />
                          </label>
                        )}
                        <button
                          type="button"
                          onClick={(e) => handleDeleteCourse(course.id, e)}
                          className="p-1.5 rounded-lg text-red-400 hover:bg-red-950/60 transition-colors cursor-pointer"
                          aria-label={tr('حذف المادة', 'Delete course')}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>

                  <h3 className="font-display text-lg font-bold text-[#F5F0E6] group-hover:text-[#E5C158] transition-colors">
                    {course.title}
                  </h3>

                  <p className="text-xs sm:text-sm text-[#C8C2B8] leading-relaxed line-clamp-2">
                    {course.description}
                  </p>

                  {course.releaseAt && (
                    <div className="pt-1">
                      <CountdownTimer
                        compact
                        targetAt={course.releaseAt}
                        label={tr('ينزل المحتوى خلال', 'Release in')}
                      />
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between gap-3 pt-4 border-t border-white/10">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[#A8A29E] tabular-nums">
                    {(course.foldersCount ?? 0) > 0 && (
                      <>
                        <span>
                          {course.foldersCount} {tr('مجلدات', 'Folders')}
                        </span>
                        <span aria-hidden="true">·</span>
                      </>
                    )}
                    <span>
                      {course.summariesCount ?? 0} {tr('ملخصات', 'Summaries')}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {course.quizzesCount ?? 0} {tr('اختبارات', 'Quizzes')}
                    </span>
                  </div>

                  <GoldChip
                    onClick={() => handleOpenCourseCard(course.id)}
                    className="text-xs px-3 py-1.5"
                  >
                    <Folder className="w-3.5 h-3.5" />
                    <span>{tr('فتح المادة', 'Open Course')}</span>
                  </GoldChip>
                </div>
              </div>
            </motion.article>
            );
          })}
        </div>
      )}

      {selectedCourseId && (
        <CourseDetailModal
          courseId={selectedCourseId}
          onClose={() => setSelectedCourseId(null)}
          onContentChanged={loadCourses}
        />
      )}
    </div>
  );
}
