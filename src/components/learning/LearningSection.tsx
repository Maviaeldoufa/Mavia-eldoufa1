import {
  Bookmark,
  Captions,
  Clock,
  Download,
  ExternalLink,
  FileUp,
  Film,
  Globe,
  Lock,
  Play,
  PlayCircle,
  Plus,
  Trash2,
  Unlock,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import type { AcademicYear, LearningLink, LectureVideo } from '../../types';
import { apiRequest } from '../../utils/api';
import { GoldChip } from '../ui/GoldChip';
import { LectureTheaterModal } from './LectureTheaterModal';

function formatClock(sec: number): string {
  const safe = Math.max(0, Math.floor(sec));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function LearningSection() {
  const { user } = useAuth();
  const { tr, formatYear } = useLanguage();
  const isAdmin = user?.role === 'admin';

  const [mode, setMode] = useState<'lectures' | 'links'>('lectures');

  // Pro Video Lectures state
  const [lectures, setLectures] = useState<LectureVideo[]>([]);
  const [loadingLectures, setLoadingLectures] = useState(true);
  const [activeLecture, setActiveLecture] = useState<LectureVideo | null>(null);

  // Admin Upload Lecture Form
  const [showAddLecture, setShowAddLecture] = useState(false);
  const [lecTitle, setLecTitle] = useState('');
  const [lecInstructor, setLecInstructor] = useState('');
  const [lecCategory, setLecCategory] = useState<'GIS' | 'Programming' | 'General'>('GIS');
  const [lecYear, setLecYear] = useState<number>(0);
  const [lecDesc, setLecDesc] = useState('');
  const [lecVideoUrl, setLecVideoUrl] = useState('');
  const [lecVideoFile, setLecVideoFile] = useState<File | null>(null);
  const [lecSubtitleFile, setLecSubtitleFile] = useState<File | null>(null);
  const [lecAttachmentFile, setLecAttachmentFile] = useState<File | null>(null);
  const [lecAllowDownload, setLecAllowDownload] = useState(true);
  const [uploadingLecture, setUploadingLecture] = useState(false);
  const [lectureError, setLectureError] = useState<string | null>(null);

  // YouTube & External Links state
  const [links, setLinks] = useState<LearningLink[]>([]);
  const [loadingLinks, setLoadingLinks] = useState(true);
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'youtube' | 'platform'>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | 'GIS' | 'Programming'>('ALL');

  const [showAddLink, setShowAddLink] = useState(false);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [type, setType] = useState<'youtube' | 'platform'>('youtube');
  const [category, setCategory] = useState<'GIS' | 'Programming' | 'General'>('GIS');
  const [year, setYear] = useState<number>(0);
  const [description, setDescription] = useState('');
  const [savingLink, setSavingLink] = useState(false);

  const TYPE_FILTERS: Array<{ value: 'ALL' | 'youtube' | 'platform'; label: string }> = [
    { value: 'ALL', label: tr('جميع المصادر', 'All Sources') },
    { value: 'youtube', label: tr('روابط يوتيوب', 'YouTube Links') },
    { value: 'platform', label: tr('منصات تعليمية', 'Learning Platforms') },
  ];

  useEffect(() => {
    apiRequest<{ lectures: LectureVideo[] }>('/api/lectures')
      .then((res) => setLectures(res.lectures))
      .catch(() => {})
      .finally(() => setLoadingLectures(false));

    apiRequest<{ links: LearningLink[] }>('/api/learning')
      .then((res) => setLinks(res.links))
      .catch(() => {})
      .finally(() => setLoadingLinks(false));
  }, []);

  const handleUploadLecture = async (e: React.FormEvent) => {
    e.preventDefault();
    setLectureError(null);
    if (!lecTitle.trim()) {
      setLectureError(tr('يرجى كتابة عنوان المحاضرة.', 'Please enter lecture title.'));
      return;
    }
    if (!lecVideoFile && !lecVideoUrl.trim()) {
      setLectureError(
        tr(
          'يرجى اختيار ملف فيديو من الجهاز أو كتابة رابط الفيديو المباشر.',
          'Please upload a video file or provide a direct video URL.'
        )
      );
      return;
    }

    setUploadingLecture(true);
    try {
      const fd = new FormData();
      fd.append('title', lecTitle.trim());
      fd.append('description', lecDesc.trim());
      fd.append('category', lecCategory);
      fd.append('year', String(lecYear));
      fd.append('instructor', lecInstructor.trim());
      fd.append('allowDownload', String(lecAllowDownload));
      if (lecVideoUrl.trim()) fd.append('videoUrl', lecVideoUrl.trim());
      if (lecVideoFile) fd.append('video', lecVideoFile);
      if (lecSubtitleFile) fd.append('subtitle', lecSubtitleFile);
      if (lecAttachmentFile) fd.append('attachment', lecAttachmentFile);

      const res = await apiRequest<{ lecture: LectureVideo }>('/api/lectures', {
        method: 'POST',
        body: fd,
      });

      setLectures((prev) => [res.lecture, ...prev]);
      setLecTitle('');
      setLecInstructor('');
      setLecDesc('');
      setLecVideoUrl('');
      setLecVideoFile(null);
      setLecSubtitleFile(null);
      setLecAttachmentFile(null);
      setShowAddLecture(false);
    } catch (err) {
      setLectureError(
        err instanceof Error
          ? err.message
          : tr('تعذر رفع المحاضرة.', 'Failed to upload lecture.')
      );
    } finally {
      setUploadingLecture(false);
    }
  };

  const handleDeleteLecture = async (id: string) => {
    try {
      await apiRequest(`/api/lectures/${id}`, { method: 'DELETE' });
      setLectures((prev) => prev.filter((l) => l.id !== id));
    } catch {
      // Ignore
    }
  };

  const handleToggleLectureDownload = async (lec: LectureVideo) => {
    try {
      const res = await apiRequest<{ lecture: LectureVideo }>(
        `/api/lectures/${lec.id}/download-permission`,
        {
          method: 'PATCH',
          body: JSON.stringify({ allowDownload: !lec.allowDownload }),
        }
      );
      setLectures((prev) =>
        prev.map((item) =>
          item.id === lec.id
            ? { ...res.lecture, myProgress: item.myProgress }
            : item
        )
      );
    } catch {
      // Ignore
    }
  };

  const handleAddLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !url.trim()) return;
    setSavingLink(true);
    try {
      const res = await apiRequest<{ link: LearningLink }>('/api/learning', {
        method: 'POST',
        body: JSON.stringify({
          title,
          url,
          type,
          category,
          year: year as AcademicYear | 0,
          description,
        }),
      });
      setLinks((prev) => [res.link, ...prev]);
      setTitle('');
      setUrl('');
      setDescription('');
      setShowAddLink(false);
    } catch {
      // Ignore
    } finally {
      setSavingLink(false);
    }
  };

  const handleDeleteLink = async (id: string) => {
    try {
      await apiRequest(`/api/learning/${id}`, { method: 'DELETE' });
      setLinks((prev) => prev.filter((l) => l.id !== id));
    } catch {
      // Ignore
    }
  };

  const filteredLectures = lectures.filter((l) => {
    if (categoryFilter !== 'ALL' && l.category !== categoryFilter) return false;
    return true;
  });

  const filteredLinks = links.filter((l) => {
    if (typeFilter !== 'ALL' && l.type !== typeFilter) return false;
    if (categoryFilter !== 'ALL' && l.category !== categoryFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#F5F0E6]">
            {tr(
              'مشغل المحاضرات ومكتبة Learning',
              'Pro Lecture Player & Learning Library'
            )}
          </h1>
          <p className="text-xs sm:text-sm text-[#A8A29E]">
            {tr(
              'شاهد محاضرات الفيديو المسجلة بحفظ مكان التوقف تلقائياً والترجمة والملاحظات، أو تصفح روابط يوتيوب والمنصات المباشرة',
              'Watch recorded video lectures with auto-resume, toggleable captions, and timestamped notes, or browse direct YouTube & platform links'
            )}
          </p>
        </div>

        {isAdmin && mode === 'lectures' && (
          <GoldChip active={showAddLecture} onClick={() => setShowAddLecture((p) => !p)}>
            <Film className="w-4 h-4" />
            <span>
              {showAddLecture
                ? tr('إغلاق النموذج', 'Close Form')
                : tr('رفع محاضرة فيديو جديدة', 'Upload Lecture Video')}
            </span>
          </GoldChip>
        )}

        {isAdmin && mode === 'links' && (
          <GoldChip active={showAddLink} onClick={() => setShowAddLink((p) => !p)}>
            <Plus className="w-4 h-4" />
            <span>
              {showAddLink
                ? tr('إغلاق', 'Close')
                : tr('إضافة رابط تعليمي', 'Add Learning Link')}
            </span>
          </GoldChip>
        )}
      </div>

      {/* Mode Switcher + Track Filters */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-4 rounded-2xl bg-[#121216] border border-white/10">
        <div className="flex flex-wrap items-center gap-2">
          <GoldChip
            active={mode === 'lectures'}
            layoutId="learning-main-mode"
            onClick={() => setMode('lectures')}
            className="text-xs px-3.5 py-2"
          >
            <Film className="w-4 h-4" />
            <span>
              {tr('مشغل المحاضرات المسجلة', 'Pro Video Lectures')} ({lectures.length})
            </span>
          </GoldChip>
          <GoldChip
            active={mode === 'links'}
            layoutId="learning-main-mode"
            onClick={() => setMode('links')}
            className="text-xs px-3.5 py-2"
          >
            <PlayCircle className="w-4 h-4" />
            <span>
              {tr('روابط اليوتيوب والمنصات', 'YouTube & Platforms')} ({links.length})
            </span>
          </GoldChip>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {mode === 'links' &&
            TYPE_FILTERS.map((f) => (
              <GoldChip
                key={f.value}
                active={typeFilter === f.value}
                layoutId="learning-type-filter"
                onClick={() => setTypeFilter(f.value)}
                className="text-xs px-3 py-1.5"
              >
                {f.label}
              </GoldChip>
            ))}

          {(['ALL', 'GIS', 'Programming'] as const).map((cat) => (
            <GoldChip
              key={cat}
              active={categoryFilter === cat}
              layoutId="learning-cat-filter"
              onClick={() => setCategoryFilter(cat)}
              className="text-xs px-3 py-1.5"
            >
              {cat === 'ALL'
                ? tr('كل المسارات', 'All Tracks')
                : cat === 'GIS'
                ? 'GIS'
                : tr('البرمجة', 'Programming')}
            </GoldChip>
          ))}
        </div>
      </div>

      {/* PRO VIDEO LECTURES VIEW */}
      {mode === 'lectures' && (
        <div className="space-y-5">
          {isAdmin && showAddLecture && (
            <form
              onSubmit={handleUploadLecture}
              className="p-5 rounded-2xl bg-[#121216] border border-[#D4AF37]/30 space-y-4"
            >
              <h3 className="font-display text-lg font-bold text-[#E5C158]">
                {tr(
                  'رفع محاضرة فيديو لمشغل MVIA الاحترافي',
                  'Upload Video Lecture to MVIA Pro Player'
                )}
              </h3>
              {lectureError && (
                <div className="p-3 rounded-lg bg-red-950/50 border border-red-500/40 text-red-200 text-xs">
                  {lectureError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <input
                  type="text"
                  required
                  value={lecTitle}
                  onChange={(e) => setLecTitle(e.target.value)}
                  placeholder={tr('عنوان المحاضرة', 'Lecture Title')}
                  className="sm:col-span-2 px-3.5 py-2.5 rounded-xl bg-[#09090B] border border-white/10 text-sm text-[#F5F0E6] focus:outline-none focus:border-[#D4AF37]"
                />
                <input
                  type="text"
                  value={lecInstructor}
                  onChange={(e) => setLecInstructor(e.target.value)}
                  placeholder={tr('اسم المحاضر', 'Instructor Name')}
                  className="px-3.5 py-2.5 rounded-xl bg-[#09090B] border border-white/10 text-sm text-[#F5F0E6] focus:outline-none focus:border-[#D4AF37]"
                />
                <select
                  value={lecYear}
                  onChange={(e) => setLecYear(Number(e.target.value))}
                  className="px-3.5 py-2.5 rounded-xl bg-[#09090B] border border-white/10 text-sm text-[#F5F0E6] focus:outline-none focus:border-[#D4AF37]"
                >
                  <option value={0}>{tr('جميع الدفعات', 'All Years')}</option>
                  <option value={1}>{formatYear(1)}</option>
                  <option value={2}>{formatYear(2)}</option>
                  <option value={3}>{formatYear(3)}</option>
                  <option value={4}>{formatYear(4)}</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <select
                  value={lecCategory}
                  onChange={(e) =>
                    setLecCategory(e.target.value as 'GIS' | 'Programming' | 'General')
                  }
                  className="px-3.5 py-2.5 rounded-xl bg-[#09090B] border border-white/10 text-sm text-[#F5F0E6] focus:outline-none focus:border-[#D4AF37]"
                >
                  <option value="GIS">GIS</option>
                  <option value="Programming">{tr('البرمجة', 'Programming')}</option>
                  <option value="General">{tr('عام', 'General')}</option>
                </select>
                <input
                  type="url"
                  value={lecVideoUrl}
                  onChange={(e) => setLecVideoUrl(e.target.value)}
                  placeholder={tr(
                    'أو رابط MP4 مباشر (في حالة عدم الرفع من الجهاز)',
                    'Or direct MP4 video URL (if not uploading from device)'
                  )}
                  dir="ltr"
                  className="px-3.5 py-2.5 rounded-xl bg-[#09090B] border border-white/10 text-sm text-[#F5F0E6] font-mono focus:outline-none focus:border-[#D4AF37]"
                />
              </div>

              <textarea
                rows={2}
                value={lecDesc}
                onChange={(e) => setLecDesc(e.target.value)}
                placeholder={tr('وصف مختصر لمحاور المحاضرة...', 'Lecture summary & topics...')}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#09090B] border border-white/10 text-sm text-[#F5F0E6] focus:outline-none focus:border-[#D4AF37]"
              />

              {/* File Pickers: Video, Subtitles (.vtt/.srt), Attachment */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-[#151519] border border-dashed border-[#D4AF37]/50 text-xs text-[#E5C158] cursor-pointer hover:bg-[#1C1C22]">
                  <Film className="w-4 h-4 shrink-0" />
                  <span className="truncate">
                    {lecVideoFile
                      ? lecVideoFile.name
                      : tr('رفع ملف فيديو (MP4 / WebM)', 'Upload Video File')}
                  </span>
                  <input
                    type="file"
                    accept="video/*,.mp4,.webm,.mov,.mkv"
                    onChange={(e) => setLecVideoFile(e.target.files?.[0] || null)}
                    className="sr-only"
                  />
                </label>

                <label className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-[#151519] border border-dashed border-white/25 text-xs text-[#C8C2B8] cursor-pointer hover:border-[#D4AF37]/50">
                  <Captions className="w-4 h-4 shrink-0 text-[#D4AF37]" />
                  <span className="truncate">
                    {lecSubtitleFile
                      ? lecSubtitleFile.name
                      : tr('رفع ملف ترجمة (.VTT / .SRT)', 'Upload Subtitles (.vtt/.srt)')}
                  </span>
                  <input
                    type="file"
                    accept=".vtt,.srt,text/vtt"
                    onChange={(e) => setLecSubtitleFile(e.target.files?.[0] || null)}
                    className="sr-only"
                  />
                </label>

                <label className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-[#151519] border border-dashed border-white/25 text-xs text-[#C8C2B8] cursor-pointer hover:border-[#D4AF37]/50">
                  <FileUp className="w-4 h-4 shrink-0 text-[#D4AF37]" />
                  <span className="truncate">
                    {lecAttachmentFile
                      ? lecAttachmentFile.name
                      : tr('ملف مرفق للتحميل (PDF / ZIP)', 'Attachment File (PDF/ZIP)')}
                  </span>
                  <input
                    type="file"
                    accept=".pdf,.zip,.rar,.ppt,.pptx,.doc,.docx,.txt"
                    onChange={(e) => setLecAttachmentFile(e.target.files?.[0] || null)}
                    className="sr-only"
                  />
                </label>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                <label className="inline-flex items-center gap-2 text-xs text-[#F5F0E6] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={lecAllowDownload}
                    onChange={(e) => setLecAllowDownload(e.target.checked)}
                    className="accent-[#D4AF37] w-4 h-4 cursor-pointer"
                  />
                  <span>
                    {tr(
                      'السماح للطلاب بتحميل الفيديو والملفات المرفقة',
                      'Allow students to download lecture files & video'
                    )}
                  </span>
                </label>

                <GoldChip type="submit" active={true} disabled={uploadingLecture}>
                  {uploadingLecture
                    ? tr('جاري الرفع والنشر...', 'Uploading...')
                    : tr('نشر المحاضرة', 'Publish Lecture')}
                </GoldChip>
              </div>
            </form>
          )}

          {loadingLectures ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2].map((n) => (
                <div key={n} className="h-48 rounded-2xl bg-white/5 animate-pulse" />
              ))}
            </div>
          ) : filteredLectures.length === 0 ? (
            <div className="py-12 text-center rounded-2xl bg-[#121216] border border-white/10 text-sm text-[#A8A29E]">
              {tr(
                'لا توجد محاضرات فيديو مضافة في هذا التصنيف بعد.',
                'No video lectures added in this category yet.'
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {filteredLectures.map((lec) => {
                const lastPos = lec.myProgress?.lastPositionSeconds || 0;
                const notesCount = lec.myProgress?.notes?.length || 0;

                return (
                  <article
                    key={lec.id}
                    className="rounded-2xl bg-[#121216] border border-white/10 hover:border-[#D4AF37]/60 p-5 flex flex-col justify-between gap-4 transition-colors"
                  >
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between gap-2 text-xs text-[#D4AF37]">
                        <div className="flex flex-wrap items-center gap-2">
                          <Film className="w-4 h-4" />
                          <span>
                            {lec.category === 'Programming'
                              ? tr('برمجة', 'Programming')
                              : lec.category}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{formatYear(lec.year)}</span>
                          <span aria-hidden="true">·</span>
                          <span>{lec.instructor}</span>
                        </div>

                        {isAdmin && (
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleToggleLectureDownload(lec)}
                              title={
                                lec.allowDownload
                                  ? tr('منع التحميل', 'Disable downloads')
                                  : tr('السماح بالتحميل', 'Enable downloads')
                              }
                              className="p-1.5 rounded-lg text-[#D4AF37] hover:bg-[#D4AF37]/15 cursor-pointer"
                            >
                              {lec.allowDownload ? (
                                <Unlock className="w-3.5 h-3.5" />
                              ) : (
                                <Lock className="w-3.5 h-3.5 text-amber-400" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteLecture(lec.id)}
                              className="p-1.5 rounded-lg text-red-400 hover:bg-red-950/60 cursor-pointer"
                              aria-label={tr('حذف المحاضرة', 'Delete lecture')}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>

                      <h3 className="font-display text-base sm:text-lg font-bold text-[#F5F0E6]">
                        {lec.title}
                      </h3>
                      <p className="text-xs text-[#C8C2B8] leading-relaxed">
                        {lec.description}
                      </p>

                      {/* Capabilities Metadata Strip */}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#A8A29E] pt-1">
                        {lastPos > 0 && (
                          <span className="inline-flex items-center gap-1 text-[#E5C158] font-mono tabular-nums">
                            <Clock className="w-3.5 h-3.5" />
                            <span>
                              {tr('توقف عند', 'Paused at')} {formatClock(lastPos)}
                            </span>
                          </span>
                        )}
                        {lec.subtitleUrl && (
                          <span className="inline-flex items-center gap-1">
                            <Captions className="w-3.5 h-3.5 text-[#D4AF37]" />
                            <span>{tr('ترجمة متاحة', 'Captions')}</span>
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1 tabular-nums">
                          <Bookmark className="w-3.5 h-3.5 text-[#D4AF37]" />
                          <span>
                            {notesCount} {tr('ملاحظات', 'Notes')}
                          </span>
                        </span>
                        <span className="inline-flex items-center gap-1">
                          {lec.allowDownload ? (
                            <>
                              <Download className="w-3.5 h-3.5 text-emerald-400" />
                              <span className="text-emerald-300">
                                {tr('التحميل متاح', 'Downloadable')}
                              </span>
                            </>
                          ) : (
                            <>
                              <Lock className="w-3.5 h-3.5 text-amber-400" />
                              <span>{tr('مشاهدة فقط', 'Stream Only')}</span>
                            </>
                          )}
                        </span>
                      </div>
                    </div>

                    <GoldChip
                      active={true}
                      onClick={() => setActiveLecture(lec)}
                      className="w-full py-2.5 text-xs sm:text-sm"
                    >
                      <Play className="w-4 h-4 fill-current" />
                      <span>
                        {lastPos > 1
                          ? tr(
                              `استئناف المحاضرة (${formatClock(lastPos)})`,
                              `Resume Lecture (${formatClock(lastPos)})`
                            )
                          : tr('تشغيل في المشغل الاحترافي', 'Open Pro Lecture Player')}
                      </span>
                    </GoldChip>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* YOUTUBE & EXTERNAL PLATFORM LINKS VIEW */}
      {mode === 'links' && (
        <div className="space-y-5">
          {isAdmin && showAddLink && (
            <form
              onSubmit={handleAddLink}
              className="p-5 rounded-2xl bg-[#121216] border border-[#D4AF37]/30 space-y-3"
            >
              <h3 className="font-display text-lg font-bold text-[#E5C158]">
                {tr(
                  'إضافة رابط يوتيوب أو منصة تعليمية',
                  'Add YouTube or Educational Platform Link'
                )}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={tr('عنوان الفيديو أو المنصة', 'Video or platform title')}
                  className="px-3.5 py-2.5 rounded-xl bg-[#09090B] border border-white/10 text-sm text-[#F5F0E6] focus:outline-none focus:border-[#D4AF37]"
                />
                <input
                  type="url"
                  required
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://youtube.com/..."
                  dir="ltr"
                  className="px-3.5 py-2.5 rounded-xl bg-[#09090B] border border-white/10 text-sm text-[#F5F0E6] font-mono focus:outline-none focus:border-[#D4AF37]"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as 'youtube' | 'platform')}
                  className="px-3.5 py-2.5 rounded-xl bg-[#09090B] border border-white/10 text-sm text-[#F5F0E6] focus:outline-none focus:border-[#D4AF37]"
                >
                  <option value="youtube">
                    {tr('رابط يوتيوب مباشر', 'Direct YouTube Link')}
                  </option>
                  <option value="platform">
                    {tr('منصة تعليمية / مرجع', 'Educational Platform / Reference')}
                  </option>
                </select>
                <select
                  value={category}
                  onChange={(e) =>
                    setCategory(e.target.value as 'GIS' | 'Programming' | 'General')
                  }
                  className="px-3.5 py-2.5 rounded-xl bg-[#09090B] border border-white/10 text-sm text-[#F5F0E6] focus:outline-none focus:border-[#D4AF37]"
                >
                  <option value="GIS">GIS</option>
                  <option value="Programming">{tr('البرمجة', 'Programming')}</option>
                  <option value="General">{tr('عام', 'General')}</option>
                </select>
                <select
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  className="px-3.5 py-2.5 rounded-xl bg-[#09090B] border border-white/10 text-sm text-[#F5F0E6] focus:outline-none focus:border-[#D4AF37]"
                >
                  <option value={0}>{tr('جميع الدفعات', 'All Years')}</option>
                  <option value={1}>{formatYear(1)}</option>
                  <option value={2}>{formatYear(2)}</option>
                  <option value={3}>{formatYear(3)}</option>
                  <option value={4}>{formatYear(4)}</option>
                </select>
              </div>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={tr('وصف مختصر للمحتوى...', 'Short description of the content...')}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#09090B] border border-white/10 text-sm text-[#F5F0E6] focus:outline-none focus:border-[#D4AF37]"
              />
              <div className="flex justify-end">
                <GoldChip type="submit" active={true} disabled={savingLink}>
                  {savingLink
                    ? tr('جاري الإضافة...', 'Adding...')
                    : tr('نشر الرابط', 'Publish Link')}
                </GoldChip>
              </div>
            </form>
          )}

          {loadingLinks ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((n) => (
                <div key={n} className="h-44 rounded-2xl bg-white/5 animate-pulse" />
              ))}
            </div>
          ) : filteredLinks.length === 0 ? (
            <div className="py-12 text-center rounded-2xl bg-[#121216] border border-white/10 text-sm text-[#A8A29E]">
              {tr('لا توجد روابط مضافة في هذا التصنيف.', 'No links added in this category.')}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredLinks.map((link) => (
                <article
                  key={link.id}
                  className="rounded-2xl bg-[#121216] border border-white/10 hover:border-[#D4AF37]/50 p-5 flex flex-col justify-between gap-4 transition-colors"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2 text-xs text-[#D4AF37]">
                      <div className="flex items-center gap-2">
                        {link.type === 'youtube' ? (
                          <PlayCircle className="w-4 h-4 text-red-400" />
                        ) : (
                          <Globe className="w-4 h-4 text-[#D4AF37]" />
                        )}
                        <span>
                          {link.type === 'youtube'
                            ? tr('يوتيوب', 'YouTube')
                            : tr('منصة تعليمية', 'Platform')}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {link.category === 'Programming'
                            ? tr('برمجة', 'Programming')
                            : link.category}
                        </span>
                        {link.year > 0 && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{formatYear(link.year)}</span>
                          </>
                        )}
                      </div>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => handleDeleteLink(link.id)}
                          className="p-1 text-red-400 hover:text-red-300 cursor-pointer"
                          aria-label={tr('حذف الرابط', 'Delete link')}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <h3 className="font-display text-base font-bold text-[#F5F0E6]">
                      {link.title}
                    </h3>
                    <p className="text-xs text-[#C8C2B8] leading-relaxed">
                      {link.description}
                    </p>
                  </div>

                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-[#18181D] border border-[#D4AF37]/40 text-[#E5C158] hover:bg-[#D4AF37] hover:text-[#09090B] transition-all"
                  >
                    <span>{tr('فتح الرابط مباشرة', 'Open Direct Link')}</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Pro Lecture Theater Modal */}
      {activeLecture && (
        <LectureTheaterModal
          lecture={activeLecture}
          onClose={() => setActiveLecture(null)}
          onLectureUpdated={(updated) => {
            setActiveLecture(updated);
            setLectures((prev) =>
              prev.map((l) => (l.id === updated.id ? updated : l))
            );
          }}
        />
      )}
    </div>
  );
}
