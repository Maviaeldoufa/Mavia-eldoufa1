import {
  ArrowLeft,
  ArrowRight,
  BarChart2,
  Check,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  FileText,
  FileUp,
  Folder,
  FolderOpen,
  FolderPlus,
  GraduationCap,
  ImageOff,
  ImagePlus,
  Play,
  Plus,
  Shuffle,
  Trash2,
  X,
} from 'lucide-react';
import { motion } from 'motion/react';
import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import type {
  Course,
  CourseFolder,
  Quiz,
  QuizSubmission,
  SummaryItem,
} from '../../types';
import { apiRequest } from '../../utils/api';
import { CountdownTimer } from '../ui/CountdownTimer';
import { GoldChip } from '../ui/GoldChip';
import { CourseAiTutorTab } from './CourseAiTutorTab';
import { QuizBuilder, QuizRunner } from './QuizRunner';

interface CourseDetailModalProps {
  courseId: string;
  onClose: () => void;
  onContentChanged: () => void;
}

export function CourseDetailModal({
  courseId,
  onClose,
  onContentChanged,
}: CourseDetailModalProps) {
  const { user } = useAuth();
  const { tr, formatYear, isEn } = useLanguage();
  const isAdmin = user?.role === 'admin';

  const [course, setCourse] = useState<Course | null>(null);
  const [folders, setFolders] = useState<CourseFolder[]>([]);
  const [summaries, setSummaries] = useState<SummaryItem[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [submissions, setSubmissions] = useState<QuizSubmission[]>([]);
  const [enrolled, setEnrolled] = useState(false);
  const [completedSummaryIds, setCompletedSummaryIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<
    'folders' | 'summaries' | 'quizzes' | 'tutor'
  >('folders');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [litFolderId, setLitFolderId] = useState<string | null>(null);
  const litFolderTimerRef = useRef<number | null>(null);
  const [activeQuiz, setActiveQuiz] = useState<Quiz | null>(null);

  useEffect(() => {
    return () => {
      if (litFolderTimerRef.current !== null) {
        window.clearTimeout(litFolderTimerRef.current);
      }
    };
  }, []);

  const handleOpenFolderCard = (folderId: string) => {
    setLitFolderId(folderId);
    if (litFolderTimerRef.current !== null) {
      window.clearTimeout(litFolderTimerRef.current);
    }
    litFolderTimerRef.current = window.setTimeout(() => {
      setLitFolderId(null);
    }, 650);
    setSelectedFolderId(folderId);
    setSumFolderId(folderId);
  };
  const [reviewSubmission, setReviewSubmission] =
    useState<QuizSubmission | null>(null);
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);

  // Admin Folder Creation state
  const [showFolderForm, setShowFolderForm] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [folderDesc, setFolderDesc] = useState('');
  const [folderCover, setFolderCover] = useState<File | null>(null);
  const [folderReleaseAt, setFolderReleaseAt] = useState('');
  const [savingFolder, setSavingFolder] = useState(false);
  const [folderError, setFolderError] = useState<string | null>(null);

  // Admin Summary + PDF upload state
  const [showSummaryForm, setShowSummaryForm] = useState(false);
  const [sumTitle, setSumTitle] = useState('');
  const [sumDesc, setSumDesc] = useState('');
  const [sumFolderId, setSumFolderId] = useState('');
  const [sumReleaseAt, setSumReleaseAt] = useState('');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Admin Quiz builder state
  const [showQuizBuilder, setShowQuizBuilder] = useState(false);

  const loadDetails = async () => {
    setLoading(true);
    try {
      const data = await apiRequest<{
        course: Course;
        folders?: CourseFolder[];
        summaries: SummaryItem[];
        quizzes: Quiz[];
        submissions: QuizSubmission[];
        enrolled?: boolean;
        completedSummaryIds?: string[];
      }>(`/api/courses/${courseId}/details`);
      setCourse(data.course);
      setFolders(data.folders || []);
      setSummaries(data.summaries);
      setQuizzes(data.quizzes);
      setSubmissions(data.submissions);
      setEnrolled(Boolean(data.enrolled));
      setCompletedSummaryIds(data.completedSummaryIds || []);
    } catch {
      // Handled gracefully
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDetails();
  }, [courseId]);

  const handleToggleEnroll = async () => {
    try {
      const res = await apiRequest<{ enrolled: boolean }>('/api/student/enroll', {
        method: 'POST',
        body: JSON.stringify({ courseId }),
      });
      setEnrolled(res.enrolled);
    } catch {
      // Ignore
    }
  };

  const recordSummaryView = async (summaryId: string) => {
    try {
      const res = await apiRequest<{ viewsCount: number }>(
        `/api/summaries/${summaryId}/view`,
        { method: 'POST' }
      );
      setSummaries((prev) =>
        prev.map((s) =>
          s.id === summaryId ? { ...s, viewsCount: res.viewsCount } : s
        )
      );
    } catch {
      // Ignore
    }
  };

  const handleLessonProgress = async (
    summary: SummaryItem,
    completed?: boolean
  ) => {
    try {
      const res = await apiRequest<{
        completedSummaryIds: string[];
        enrolled: boolean;
      }>('/api/student/lesson-progress', {
        method: 'POST',
        body: JSON.stringify({
          courseId,
          summaryId: summary.id,
          lessonTitle: summary.title,
          completed,
        }),
      });
      setCompletedSummaryIds(res.completedSummaryIds);
      setEnrolled(res.enrolled);
    } catch {
      // Ignore
    }
  };

  const handleOpenQuiz = async (quiz: Quiz, reviewSub?: QuizSubmission | null) => {
    setReviewSubmission(reviewSub || null);
    setActiveQuiz(quiz);
    if (!reviewSub) {
      try {
        await apiRequest('/api/student/lesson-progress', {
          method: 'POST',
          body: JSON.stringify({
            courseId,
            lessonTitle: `اختبار: ${quiz.title}`,
          }),
        });
      } catch {
        // Ignore
      }
    }
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    setFolderError(null);
    if (!folderName.trim()) {
      setFolderError(tr('يرجى كتابة اسم المجلد.', 'Please enter folder name.'));
      return;
    }
    setSavingFolder(true);
    try {
      const fd = new FormData();
      fd.append('name', folderName.trim());
      if (folderDesc.trim()) fd.append('description', folderDesc.trim());
      if (folderReleaseAt) {
        fd.append('releaseAt', new Date(folderReleaseAt).toISOString());
      }
      if (folderCover) {
        fd.append('cover', folderCover);
      }

      const res = await apiRequest<{ folder: CourseFolder }>(
        `/api/courses/${courseId}/folders`,
        {
          method: 'POST',
          body: fd,
        }
      );

      setFolders((prev) => [res.folder, ...prev]);
      setFolderName('');
      setFolderDesc('');
      setFolderCover(null);
      setFolderReleaseAt('');
      setShowFolderForm(false);
      onContentChanged();
    } catch (err) {
      setFolderError(
        err instanceof Error
          ? err.message
          : tr('تعذر إنشاء المجلد.', 'Failed to create folder.')
      );
    } finally {
      setSavingFolder(false);
    }
  };

  const handleUploadFolderCover = async (
    folderId: string,
    file: File | null
  ) => {
    if (!file) return;
    try {
      const fd = new FormData();
      fd.append('cover', file);
      const res = await apiRequest<{ coverUrl: string }>(
        `/api/folders/${folderId}/cover`,
        {
          method: 'POST',
          body: fd,
        }
      );
      setFolders((prev) =>
        prev.map((f) =>
          f.id === folderId ? { ...f, coverUrl: res.coverUrl } : f
        )
      );
    } catch {
      // Ignore
    }
  };

  const handleDeleteFolderCover = async (folderId: string) => {
    try {
      await apiRequest(`/api/folders/${folderId}/cover`, { method: 'DELETE' });
      setFolders((prev) =>
        prev.map((f) => (f.id === folderId ? { ...f, coverUrl: undefined } : f))
      );
    } catch {
      // Ignore
    }
  };

  const handleDeleteFolder = async (folderId: string) => {
    try {
      await apiRequest(`/api/folders/${folderId}`, { method: 'DELETE' });
      setFolders((prev) => prev.filter((f) => f.id !== folderId));
      setSummaries((prev) => prev.filter((s) => s.folderId !== folderId));
      setQuizzes((prev) => prev.filter((q) => q.folderId !== folderId));
      if (selectedFolderId === folderId) {
        setSelectedFolderId(null);
      }
      onContentChanged();
    } catch {
      // Ignore
    }
  };

  const handleUploadSummary = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!sumTitle.trim()) {
      setFormError(tr('يرجى إدخال عنوان الملخص.', 'Please enter summary title.'));
      return;
    }

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('title', sumTitle.trim());
      fd.append('description', sumDesc.trim());
      const effectiveFolderId = sumFolderId || selectedFolderId || '';
      if (effectiveFolderId) fd.append('folderId', effectiveFolderId);
      if (sumReleaseAt) {
        fd.append('releaseAt', new Date(sumReleaseAt).toISOString());
      }
      if (pdfFile) {
        fd.append('pdf', pdfFile);
      }

      const data = await apiRequest<{ summary: SummaryItem }>(
        `/api/courses/${courseId}/summaries`,
        {
          method: 'POST',
          body: fd,
        }
      );

      setSummaries((prev) => [data.summary, ...prev]);
      setSumTitle('');
      setSumDesc('');
      setSumFolderId('');
      setSumReleaseAt('');
      setPdfFile(null);
      setShowSummaryForm(false);
      onContentChanged();
    } catch (err) {
      setFormError(
        err instanceof Error
          ? err.message
          : tr('تعذر رفع الملخص.', 'Failed to upload summary.')
      );
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteSummary = async (id: string) => {
    try {
      await apiRequest(`/api/summaries/${id}`, { method: 'DELETE' });
      setSummaries((prev) => prev.filter((s) => s.id !== id));
      onContentChanged();
    } catch {
      // Ignore
    }
  };

  const handleDeleteQuiz = async (id: string) => {
    try {
      await apiRequest(`/api/quizzes/${id}`, { method: 'DELETE' });
      setQuizzes((prev) => prev.filter((q) => q.id !== id));
      onContentChanged();
    } catch {
      // Ignore
    }
  };

  const visibleSummaries = selectedFolderId
    ? summaries.filter((s) => s.folderId === selectedFolderId)
    : summaries;
  const visibleQuizzes = selectedFolderId
    ? quizzes.filter((q) => q.folderId === selectedFolderId)
    : quizzes;
  const activeFolder = folders.find((f) => f.id === selectedFolderId) || null;

  const renderSummaryForm = () => (
    <form
      onSubmit={handleUploadSummary}
      className="p-4 rounded-xl bg-[#09090B] border border-[#D4AF37]/30 space-y-3"
    >
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-display text-sm font-bold text-[#E5C158]">
          {tr(
            'إضافة ملخص أو رفع ملف PDF من جهازك',
            'Add Summary or Upload PDF File'
          )}
        </h4>
        <button
          type="button"
          onClick={() => setShowSummaryForm(false)}
          className="text-xs text-[#A8A29E] hover:text-white cursor-pointer"
        >
          {tr('إغلاق', 'Close')}
        </button>
      </div>
      {formError && (
        <div className="p-2.5 rounded-lg bg-red-950/50 border border-red-500/40 text-red-200 text-xs">
          {formError}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input
          type="text"
          required
          value={sumTitle}
          onChange={(e) => setSumTitle(e.target.value)}
          placeholder={tr('عنوان الملخص أو المحاضرة', 'Summary title')}
          className="px-3 py-2 rounded-lg bg-[#151519] border border-white/10 text-sm text-[#F5F0E6] focus:outline-none focus:border-[#D4AF37]"
        />
        <select
          value={sumFolderId || selectedFolderId || ''}
          onChange={(e) => setSumFolderId(e.target.value)}
          className="px-3 py-2 rounded-lg bg-[#151519] border border-white/10 text-sm text-[#F5F0E6] focus:outline-none focus:border-[#D4AF37]"
        >
          <option value="">
            {tr('بدون مجلد (رئيسي في المادة)', 'No Folder (Course Root)')}
          </option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <textarea
          rows={2}
          value={sumDesc}
          onChange={(e) => setSumDesc(e.target.value)}
          placeholder={tr(
            'وصف مختصر لمحتوى الملخص...',
            'Short summary description...'
          )}
          className="w-full px-3 py-2 rounded-lg bg-[#151519] border border-white/10 text-sm text-[#F5F0E6] focus:outline-none focus:border-[#D4AF37]"
        />
        <div className="space-y-1">
          <label className="block text-[11px] text-[#A8A29E]">
            {tr('مؤقت تنزيل اختياري للملف:', 'Optional release countdown:')}
          </label>
          <input
            type="datetime-local"
            value={sumReleaseAt}
            onChange={(e) => setSumReleaseAt(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-[#151519] border border-white/10 text-sm text-[#F5F0E6] font-mono focus:outline-none focus:border-[#D4AF37]"
          />
        </div>
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <label className="flex items-center gap-2.5 px-3.5 py-2 rounded-lg bg-[#151519] border border-dashed border-[#D4AF37]/50 text-xs text-[#E5C158] cursor-pointer hover:bg-[#1C1C22] transition-colors">
          <FileUp className="w-4 h-4 shrink-0" />
          <span className="truncate max-w-[240px]">
            {pdfFile
              ? `${tr('تم اختيار:', 'Selected:')} ${pdfFile.name}`
              : tr('اختيار ملف PDF من الجهاز', 'Choose PDF from Device')}
          </span>
          <input
            type="file"
            accept="application/pdf,.pdf"
            onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
            className="sr-only"
          />
        </label>

        <GoldChip type="submit" active={true} disabled={uploading}>
          {uploading
            ? tr('جاري الرفع...', 'Uploading...')
            : tr('نشر الملخص', 'Publish Summary')}
        </GoldChip>
      </div>
    </form>
  );

  const renderSummariesList = (items: SummaryItem[]) => {
    if (items.length === 0) {
      return (
        <div className="py-8 text-center text-sm text-[#A8A29E] rounded-xl bg-[#0D0D10] border border-white/10">
          {tr('لا توجد ملخصات مضافة هنا حتى الآن.', 'No summaries added here yet.')}
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {items.map((sum) => (
          <div
            key={sum.id}
            className="p-4 rounded-xl bg-[#0D0D10] border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
          >
            <div className="space-y-1 min-w-0">
              <h4 className="font-semibold text-sm text-[#F5F0E6]">
                {sum.title}
              </h4>
              <p className="text-xs text-[#C8C2B8]">{sum.description}</p>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#A8A29E]">
                <span>
                  {tr('بواسطة', 'By')} {sum.createdBy}
                </span>
                {sum.fileName && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-[#D4AF37] truncate max-w-[180px]">
                      {sum.fileName}
                    </span>
                  </>
                )}
                {sum.fileSize && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      {(sum.fileSize / 1024).toFixed(0)} KB
                    </span>
                  </>
                )}
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1 text-[#E5C158] font-mono tabular-nums">
                  <Eye className="w-3.5 h-3.5" />
                  <span>{sum.viewsCount ?? 0}</span>
                </span>
              </div>
              {sum.releaseAt && (
                <div className="pt-1">
                  <CountdownTimer
                    compact
                    targetAt={sum.releaseAt}
                    label={tr('يتاح خلال', 'Available in')}
                  />
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <GoldChip
                active={completedSummaryIds.includes(sum.id)}
                onClick={() => {
                  handleLessonProgress(
                    sum,
                    !completedSummaryIds.includes(sum.id)
                  );
                  recordSummaryView(sum.id);
                }}
                className="text-xs px-3 py-1.5"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>
                  {completedSummaryIds.includes(sum.id)
                    ? tr('تمت المذاكرة', 'Completed')
                    : tr('تحديد كمكتمل', 'Mark Done')}
                </span>
              </GoldChip>
              {sum.fileUrl && (
                <>
                  <GoldChip
                    active={previewPdfUrl === sum.fileUrl}
                    onClick={() => {
                      setPreviewPdfUrl(sum.fileUrl!);
                      handleLessonProgress(sum);
                      recordSummaryView(sum.id);
                    }}
                    className="text-xs px-3 py-1.5"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>{tr('معاينة', 'Preview')}</span>
                  </GoldChip>
                  <a
                    href={sum.fileUrl}
                    download={sum.fileName || 'summary.pdf'}
                    onClick={() => {
                      handleLessonProgress(sum);
                      recordSummaryView(sum.id);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#151519] border border-white/10 text-[#F5F0E6] hover:border-[#D4AF37]/60 hover:text-[#F5D061] transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{tr('تحميل', 'Download')}</span>
                  </a>
                </>
              )}
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => handleDeleteSummary(sum.id)}
                  className="p-2 rounded-lg bg-red-950/50 border border-red-500/30 text-red-300 hover:bg-red-600 hover:text-white transition-colors cursor-pointer"
                  aria-label={tr('حذف الملخص', 'Delete summary')}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderQuizzesList = (items: Quiz[]) => {
    if (items.length === 0) {
      return (
        <div className="py-8 text-center text-sm text-[#A8A29E] rounded-xl bg-[#0D0D10] border border-white/10">
          {tr('لا توجد اختبارات مضافة هنا حتى الآن.', 'No quizzes added here yet.')}
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {items.map((quiz) => {
          const bestSub = submissions
            .filter((s) => s.quizId === quiz.id)
            .sort((a, b) => b.score - a.score)[0];

          const effectiveCount =
            quiz.questionsPerAttempt &&
            quiz.questionsPerAttempt > 0 &&
            quiz.questionsPerAttempt < quiz.questions.length
              ? quiz.questionsPerAttempt
              : quiz.questions.length;

          return (
            <div
              key={quiz.id}
              className="p-4 rounded-xl bg-[#0D0D10] border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="space-y-1.5 min-w-0">
                <h4 className="font-semibold text-sm text-[#F5F0E6]">
                  {quiz.title}
                </h4>
                <div className="flex flex-wrap items-center gap-2 text-xs text-[#A8A29E] tabular-nums">
                  <span className="inline-flex items-center gap-1 text-[#E5C158]">
                    <Clock className="w-3.5 h-3.5" />
                    <span>
                      {quiz.durationMinutes} {tr('دقيقة', 'min')}
                    </span>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {effectiveCount} / {quiz.questions.length}{' '}
                    {tr('أسئلة', 'Questions')}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {effectiveCount * quiz.pointsPerQuestion} {tr('نقطة', 'pts')}
                  </span>
                  {quiz.randomizeQuestions !== false && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="inline-flex items-center gap-1 text-[#D4AF37]">
                        <Shuffle className="w-3 h-3" />
                        <span>{tr('بنك عشوائي', 'Random Bank')}</span>
                      </span>
                    </>
                  )}
                  {bestSub && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="text-emerald-300 font-semibold">
                        {tr('أعلى درجة:', 'Best:')}{' '}
                        {bestSub.score}/{bestSub.maxScore}
                      </span>
                    </>
                  )}
                </div>
                {quiz.releaseAt && (
                  <div className="pt-1">
                    <CountdownTimer
                      compact
                      targetAt={quiz.releaseAt}
                      label={tr('يفتح خلال', 'Opens in')}
                    />
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {bestSub && bestSub.breakdown && bestSub.breakdown.length > 0 && (
                  <GoldChip
                    onClick={() => handleOpenQuiz(quiz, bestSub)}
                    className="text-xs px-3 py-2"
                  >
                    <BarChart2 className="w-3.5 h-3.5" />
                    <span>{tr('تحليل الأخطاء', 'Review Mistakes')}</span>
                  </GoldChip>
                )}

                <GoldChip
                  active={true}
                  onClick={() => handleOpenQuiz(quiz)}
                  className="text-xs px-4 py-2"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>
                    {bestSub
                      ? tr('إعادة الاختبار', 'Retake Quiz')
                      : tr('بدء الاختبار', 'Start Quiz')}
                  </span>
                </GoldChip>

                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => handleDeleteQuiz(quiz.id)}
                    className="p-2 rounded-lg bg-red-950/50 border border-red-500/30 text-red-300 hover:bg-red-600 hover:text-white transition-colors cursor-pointer"
                    aria-label={tr('حذف الاختبار', 'Delete quiz')}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4"
    >
      <div className="w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-2xl bg-[#121216] border border-[#D4AF37]/30 p-4 sm:p-6 space-y-5">
        {loading || !course ? (
          <div className="py-12 text-center text-sm text-[#A8A29E]">
            {tr('جاري تحميل تفاصيل المادة...', 'Loading course details...')}
          </div>
        ) : (
          <>
            {course.coverUrl && (
              <div className="relative h-36 sm:h-44 w-full rounded-xl overflow-hidden border border-[#D4AF37]/30 bg-[#09090B]">
                <img
                  src={course.coverUrl}
                  alt={course.title}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#121216]/80 via-transparent to-transparent" />
              </div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-white/10 pb-4">
              <div className="space-y-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-xs text-[#D4AF37]">
                  <span className="font-mono">{course.code}</span>
                  <span aria-hidden="true">·</span>
                  <span>{formatYear(course.year)}</span>
                  <span aria-hidden="true">·</span>
                  <span>{course.instructor}</span>
                </div>
                <h2 className="font-display text-xl sm:text-2xl font-bold text-[#F5F0E6]">
                  {course.title}
                </h2>
                <p className="text-xs sm:text-sm text-[#C8C2B8]">
                  {course.description}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0 self-end sm:self-start">
                <GoldChip
                  active={enrolled}
                  onClick={handleToggleEnroll}
                  className="text-xs px-3 py-1.5"
                >
                  {enrolled ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>{tr('مسجل في الكورس', 'Enrolled')}</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5" />
                      <span>{tr('تسجيل في الكورس', 'Enroll')}</span>
                    </>
                  )}
                </GoldChip>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label={tr('إغلاق', 'Close')}
                  className="p-2 rounded-lg bg-[#18181D] border border-white/10 text-[#C8C2B8] hover:text-[#F5D061] hover:border-[#D4AF37]/50 cursor-pointer shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Interactive Tab Switcher */}
            {!activeQuiz && (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <GoldChip
                    active={activeTab === 'folders'}
                    layoutId="course-modal-tab"
                    onClick={() => {
                      setActiveTab('folders');
                      setActiveQuiz(null);
                      setReviewSubmission(null);
                    }}
                  >
                    <Folder className="w-4 h-4" />
                    <span>
                      {tr('المجلدات', 'Folders')} ({folders.length})
                    </span>
                  </GoldChip>
                  <GoldChip
                    active={activeTab === 'summaries'}
                    layoutId="course-modal-tab"
                    onClick={() => {
                      setActiveTab('summaries');
                      setActiveQuiz(null);
                      setReviewSubmission(null);
                    }}
                  >
                    <FileText className="w-4 h-4" />
                    <span>
                      {tr('الملخصات والـ PDF', 'Summaries & PDF')} (
                      {visibleSummaries.length})
                    </span>
                  </GoldChip>
                  <GoldChip
                    active={activeTab === 'quizzes'}
                    layoutId="course-modal-tab"
                    onClick={() => setActiveTab('quizzes')}
                  >
                    <Play className="w-4 h-4" />
                    <span>
                      {tr('الاختبارات الشاملة', 'Quizzes')} (
                      {visibleQuizzes.length})
                    </span>
                  </GoldChip>
                  <GoldChip
                    active={activeTab === 'tutor'}
                    layoutId="course-modal-tab"
                    onClick={() => {
                      setActiveTab('tutor');
                      setActiveQuiz(null);
                      setReviewSubmission(null);
                    }}
                  >
                    <GraduationCap className="w-4 h-4" />
                    <span>{tr('المدرس الذكي', 'AI Tutor')}</span>
                  </GoldChip>
                </div>

                {isAdmin && activeTab === 'folders' && !activeFolder && (
                  <GoldChip
                    active={showFolderForm}
                    onClick={() => setShowFolderForm((p) => !p)}
                    className="text-xs px-3 py-1.5"
                  >
                    <FolderPlus className="w-3.5 h-3.5" />
                    <span>
                      {showFolderForm
                        ? tr('إغلاق', 'Close')
                        : tr('إنشاء مجلد جديد بغلاف', 'Create Folder with Cover')}
                    </span>
                  </GoldChip>
                )}

                {isAdmin && activeTab === 'summaries' && (
                  <GoldChip
                    active={showSummaryForm}
                    onClick={() => setShowSummaryForm((p) => !p)}
                    className="text-xs px-3 py-1.5"
                  >
                    <FileUp className="w-3.5 h-3.5" />
                    <span>
                      {showSummaryForm
                        ? tr('إغلاق', 'Close')
                        : tr('إضافة ملخص / رفع PDF', 'Add Summary / PDF')}
                    </span>
                  </GoldChip>
                )}

                {isAdmin && activeTab === 'quizzes' && (
                  <GoldChip
                    active={showQuizBuilder}
                    onClick={() => setShowQuizBuilder((p) => !p)}
                    className="text-xs px-3 py-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>
                      {showQuizBuilder
                        ? tr('إغلاق', 'Close')
                        : tr('إضافة اختبار جديد', 'Add New Quiz')}
                    </span>
                  </GoldChip>
                )}
              </div>
            )}

            {/* Shared PDF Preview Pane */}
            {previewPdfUrl && !activeQuiz && (
              <div className="rounded-xl overflow-hidden border border-[#D4AF37]/40 bg-[#09090B]">
                <div className="flex items-center justify-between px-4 py-2 border-b border-white/10 text-xs">
                  <span className="text-[#E5C158] font-semibold">
                    {tr('معاينة ملف PDF', 'PDF Preview')}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPreviewPdfUrl(null)}
                    className="text-[#A8A29E] hover:text-white cursor-pointer"
                  >
                    {tr('إغلاق المعاينة', 'Close Preview')}
                  </button>
                </div>
                <iframe
                  src={previewPdfUrl}
                  title="PDF Preview"
                  className="w-full h-[360px] sm:h-[420px] bg-white"
                />
              </div>
            )}

            {/* ACTIVE QUIZ VIEW (Accessible from either Folder or Quizzes tab) */}
            {activeQuiz ? (
              <QuizRunner
                quiz={activeQuiz}
                initialSubmission={reviewSubmission}
                onClose={() => {
                  setActiveQuiz(null);
                  setReviewSubmission(null);
                }}
                onSubmitted={(sub) => setSubmissions((prev) => [sub, ...prev])}
              />
            ) : (
              <>
                {/* FOLDERS TAB */}
                {activeTab === 'folders' && (
                  <div className="space-y-5">
                    {activeFolder ? (
                      /* INSIDE SPECIFIC FOLDER VIEW (Summaries + Advanced Quizzes Together) */
                      <div className="space-y-5">
                        <div className="rounded-2xl overflow-hidden bg-[#0D0D10] border border-[#D4AF37]/35">
                          {activeFolder.coverUrl && (
                            <div className="relative h-36 w-full bg-[#09090B]">
                              <img
                                src={activeFolder.coverUrl}
                                alt={activeFolder.name}
                                className="w-full h-full object-cover"
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-[#0D0D10] via-transparent to-transparent" />
                            </div>
                          )}

                          <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="space-y-1">
                              <div className="inline-flex items-center gap-2 text-xs text-[#D4AF37]">
                                <FolderOpen className="w-4 h-4" />
                                <span>{tr('محتوى المجلد', 'Folder Contents')}</span>
                              </div>
                              <h3 className="font-display text-lg font-bold text-[#F5F0E6]">
                                {activeFolder.name}
                              </h3>
                              {activeFolder.description && (
                                <p className="text-xs text-[#C8C2B8]">
                                  {activeFolder.description}
                                </p>
                              )}
                              {activeFolder.releaseAt && (
                                <div className="pt-1">
                                  <CountdownTimer
                                    compact
                                    targetAt={activeFolder.releaseAt}
                                    label={tr('يفتح خلال', 'Opens in')}
                                  />
                                </div>
                              )}
                            </div>

                            <GoldChip
                              onClick={() => {
                                setSelectedFolderId(null);
                                setShowSummaryForm(false);
                                setShowQuizBuilder(false);
                              }}
                              className="text-xs px-3 py-1.5 self-start sm:self-center"
                            >
                              {isEn ? (
                                <ArrowLeft className="w-3.5 h-3.5" />
                              ) : (
                                <ArrowRight className="w-3.5 h-3.5" />
                              )}
                              <span>{tr('عودة لكل المجلدات', 'All Folders')}</span>
                            </GoldChip>
                          </div>
                        </div>

                        {/* Folder Summaries Section */}
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <h4 className="font-display text-base font-bold text-[#E5C158] flex items-center gap-2">
                              <FileText className="w-4 h-4" />
                              <span>
                                {tr('ملخصات المجلد', 'Folder Summaries')} (
                                {visibleSummaries.length})
                              </span>
                            </h4>
                            {isAdmin && (
                              <GoldChip
                                active={showSummaryForm}
                                onClick={() => {
                                  setSumFolderId(activeFolder.id);
                                  setShowSummaryForm((p) => !p);
                                }}
                                className="text-xs px-3 py-1.5"
                              >
                                <FileUp className="w-3.5 h-3.5" />
                                <span>
                                  {tr('إضافة ملخص للمجلد', 'Add Summary to Folder')}
                                </span>
                              </GoldChip>
                            )}
                          </div>

                          {isAdmin && showSummaryForm && renderSummaryForm()}
                          {renderSummariesList(visibleSummaries)}
                        </div>

                        {/* Folder Advanced Exams Section */}
                        <div className="space-y-3 pt-2 border-t border-white/10">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <h4 className="font-display text-base font-bold text-[#E5C158] flex items-center gap-2">
                              <Play className="w-4 h-4" />
                              <span>
                                {tr('اختبارات المجلد المتطورة', 'Folder Advanced Exams')} (
                                {visibleQuizzes.length})
                              </span>
                            </h4>
                            {isAdmin && (
                              <GoldChip
                                active={showQuizBuilder}
                                onClick={() => setShowQuizBuilder((p) => !p)}
                                className="text-xs px-3 py-1.5"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>
                                  {tr('إنشاء اختبار للمجلد', 'Add Exam to Folder')}
                                </span>
                              </GoldChip>
                            )}
                          </div>

                          {isAdmin && showQuizBuilder && (
                            <QuizBuilder
                              courseId={courseId}
                              folderId={activeFolder.id}
                              onCreated={(q) => {
                                setQuizzes((prev) => [q, ...prev]);
                                setShowQuizBuilder(false);
                                onContentChanged();
                              }}
                              onCancel={() => setShowQuizBuilder(false)}
                            />
                          )}
                          {renderQuizzesList(visibleQuizzes)}
                        </div>
                      </div>
                    ) : (
                      /* FOLDERS GRID VIEW */
                      <>
                        {isAdmin && showFolderForm && (
                          <form
                            onSubmit={handleCreateFolder}
                            className="p-4 rounded-xl bg-[#09090B] border border-[#D4AF37]/30 space-y-3"
                          >
                            <h4 className="font-display text-sm font-bold text-[#E5C158]">
                              {tr(
                                'إنشاء مجلد مخصص بصورة غلاف وإضافة ملخصات واختبارات داخله',
                                'Create Custom Folder with Cover Image'
                              )}
                            </h4>
                            {folderError && (
                              <div className="p-2.5 rounded-lg bg-red-950/50 border border-red-500/40 text-red-200 text-xs">
                                {folderError}
                              </div>
                            )}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <input
                                type="text"
                                required
                                value={folderName}
                                onChange={(e) => setFolderName(e.target.value)}
                                placeholder={tr(
                                  'اسم المجلد (مثال: مراجعات الميدتيرم)',
                                  'Folder name...'
                                )}
                                className="px-3 py-2 rounded-lg bg-[#151519] border border-white/10 text-sm text-[#F5F0E6] focus:outline-none focus:border-[#D4AF37]"
                              />
                              <input
                                type="datetime-local"
                                value={folderReleaseAt}
                                onChange={(e) => setFolderReleaseAt(e.target.value)}
                                title={tr(
                                  'مؤقت تنزيل اختياري',
                                  'Optional countdown timer'
                                )}
                                className="px-3 py-2 rounded-lg bg-[#151519] border border-white/10 text-sm text-[#F5F0E6] font-mono focus:outline-none focus:border-[#D4AF37]"
                              />
                            </div>
                            <input
                              type="text"
                              value={folderDesc}
                              onChange={(e) => setFolderDesc(e.target.value)}
                              placeholder={tr(
                                'وصف محتوى المجلد (اختياري)',
                                'Folder description (optional)'
                              )}
                              className="w-full px-3 py-2 rounded-lg bg-[#151519] border border-white/10 text-sm text-[#F5F0E6] focus:outline-none focus:border-[#D4AF37]"
                            />
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <label className="flex items-center gap-2.5 px-3.5 py-2 rounded-lg bg-[#151519] border border-dashed border-[#D4AF37]/50 text-xs text-[#E5C158] cursor-pointer hover:bg-[#1C1C22] transition-colors">
                                <ImagePlus className="w-4 h-4 shrink-0" />
                                <span className="truncate max-w-[240px]">
                                  {folderCover
                                    ? `${tr('الغلاف:', 'Cover:')}: ${folderCover.name}`
                                    : tr(
                                        'اختيار صورة غلاف للمجلد',
                                        'Upload Folder Cover Image'
                                      )}
                                </span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  onChange={(e) =>
                                    setFolderCover(e.target.files?.[0] || null)
                                  }
                                  className="sr-only"
                                />
                              </label>

                              <GoldChip
                                type="submit"
                                active={true}
                                disabled={savingFolder}
                              >
                                {savingFolder
                                  ? tr('جاري الإنشاء...', 'Creating...')
                                  : tr('حفظ المجلد', 'Create Folder')}
                              </GoldChip>
                            </div>
                          </form>
                        )}

                        {folders.length === 0 ? (
                          <div className="py-10 text-center space-y-2 rounded-xl bg-[#0D0D10] border border-white/10">
                            <Folder className="w-8 h-8 text-[#D4AF37] mx-auto opacity-80" />
                            <p className="text-sm text-[#A8A29E]">
                              {tr(
                                'لا توجد مجلدات مخصصة داخل هذه المادة بعد. يمكنك تصفح الملخصات والاختبارات مباشرة أو إنشاء مجلد بغلاف صورة.',
                                'No custom folders inside this course yet. Browse Summaries & Quizzes directly or create a folder with a cover image.'
                              )}
                            </p>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {folders.map((folder, idx) => {
                              const folderSumCount = summaries.filter(
                                (s) => s.folderId === folder.id
                              ).length;
                              const folderQuizCount = quizzes.filter(
                                (q) => q.folderId === folder.id
                              ).length;
                              const isFolderLit = litFolderId === folder.id;

                              return (
                                <motion.div
                                  key={folder.id}
                                  onClick={() => handleOpenFolderCard(folder.id)}
                                  animate={{ y: [0, -4, 0] }}
                                  transition={{
                                    duration: 3.9 + (idx % 3) * 0.35,
                                    delay: (idx % 4) * 0.35,
                                    repeat: Infinity,
                                    ease: 'easeInOut',
                                  }}
                                  whileHover={{ scale: 1.02 }}
                                  whileTap={{ scale: 0.985 }}
                                  className={`group relative rounded-xl overflow-hidden border bg-[#0D0D10] flex flex-col justify-between transition-all duration-200 cursor-pointer hover:border-[#F5D061] hover:shadow-[0_0_28px_rgba(212,175,55,0.45),inset_0_0_20px_rgba(212,175,55,0.08)] ${
                                    isFolderLit
                                      ? 'border-[#FFF1B8] brightness-110 shadow-[0_0_36px_rgba(255,241,184,0.65),0_0_64px_rgba(212,175,55,0.45)]'
                                      : 'border-white/10'
                                  }`}
                                >
                                  <span
                                    aria-hidden="true"
                                    className={`pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(245,208,97,0.16),transparent_65%)] transition-opacity duration-200 ${
                                      isFolderLit
                                        ? 'opacity-100'
                                        : 'opacity-0 group-hover:opacity-100'
                                    }`}
                                  />
                                  {folder.coverUrl && (
                                    <div className="relative h-36 w-full bg-[#09090B] border-b border-white/10">
                                      <img
                                        src={folder.coverUrl}
                                        alt={folder.name}
                                        loading="lazy"
                                        className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                                      />
                                      {isAdmin && (
                                        <div
                                          onClick={(e) => e.stopPropagation()}
                                          className="absolute top-2.5 end-2.5 flex items-center gap-1.5"
                                        >
                                          <label className="px-2 py-1 rounded-md bg-[#09090B]/85 border border-[#D4AF37]/40 text-[11px] text-[#E5C158] hover:bg-[#D4AF37] hover:text-[#09090B] cursor-pointer transition-colors inline-flex items-center gap-1">
                                            <ImagePlus className="w-3 h-3" />
                                            <span>{tr('تغيير', 'Change')}</span>
                                            <input
                                              type="file"
                                              accept="image/*"
                                              onChange={(e) =>
                                                handleUploadFolderCover(
                                                  folder.id,
                                                  e.target.files?.[0] || null
                                                )
                                              }
                                              className="sr-only"
                                            />
                                          </label>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              handleDeleteFolderCover(folder.id)
                                            }
                                            className="px-2 py-1 rounded-md bg-red-950/90 border border-red-500/40 text-[11px] text-red-200 hover:bg-red-600 hover:text-white cursor-pointer transition-colors inline-flex items-center gap-1"
                                          >
                                            <ImageOff className="w-3 h-3" />
                                            <span>
                                              {tr('حذف الغلاف', 'Remove Cover')}
                                            </span>
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  <div className="p-4 space-y-3">
                                      <div className="flex items-start justify-between gap-2">
                                        <div className="flex items-center gap-2.5 min-w-0">
                                          <div className="w-8 h-8 rounded-lg bg-[#D4AF37]/12 border border-[#D4AF37]/30 flex items-center justify-center text-[#E5C158] shrink-0 transition-all duration-200 group-hover:bg-[#D4AF37]/25 group-hover:border-[#F5D061] group-hover:shadow-[0_0_14px_rgba(245,208,97,0.6)]">
                                            <FolderOpen className="w-4 h-4" />
                                          </div>
                                          <div className="space-y-1 min-w-0">
                                            <h4 className="font-display text-base font-bold text-[#F5F0E6] group-hover:text-[#F5D061] transition-colors truncate">
                                              {folder.name}
                                            </h4>
                                            {folder.description && (
                                              <p className="text-xs text-[#C8C2B8] line-clamp-2">
                                                {folder.description}
                                              </p>
                                            )}
                                          </div>
                                        </div>
                                        {isAdmin && (
                                          <div
                                            onClick={(e) => e.stopPropagation()}
                                            className="flex items-center gap-1 shrink-0"
                                          >
                                          {!folder.coverUrl && (
                                            <label
                                              title={tr(
                                                'رفع صورة غلاف',
                                                'Upload cover'
                                              )}
                                              className="p-1.5 rounded-lg text-[#D4AF37] hover:bg-[#D4AF37]/15 cursor-pointer"
                                            >
                                              <ImagePlus className="w-4 h-4" />
                                              <input
                                                type="file"
                                                accept="image/*"
                                                onChange={(e) =>
                                                  handleUploadFolderCover(
                                                    folder.id,
                                                    e.target.files?.[0] || null
                                                  )
                                                }
                                                className="sr-only"
                                              />
                                            </label>
                                          )}
                                          <button
                                            type="button"
                                            onClick={() =>
                                              handleDeleteFolder(folder.id)
                                            }
                                            aria-label={tr(
                                              'حذف المجلد',
                                              'Delete folder'
                                            )}
                                            className="p-1.5 rounded-lg text-red-400 hover:bg-red-950/50 cursor-pointer"
                                          >
                                            <Trash2 className="w-4 h-4" />
                                          </button>
                                        </div>
                                      )}
                                    </div>

                                    {folder.releaseAt && (
                                      <CountdownTimer
                                        compact
                                        targetAt={folder.releaseAt}
                                        label={tr('يفتح خلال', 'Opens in')}
                                      />
                                    )}

                                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/10">
                                      <span className="text-[11px] text-[#A8A29E] tabular-nums">
                                        {folderSumCount} {tr('ملخصات', 'Summaries')} ·{' '}
                                        {folderQuizCount} {tr('اختبارات', 'Exams')}
                                      </span>
                                      <GoldChip
                                        active={true}
                                        onClick={() => handleOpenFolderCard(folder.id)}
                                        className="text-xs px-3.5 py-1.5"
                                      >
                                        <FolderOpen className="w-3.5 h-3.5" />
                                        <span>
                                          {tr(
                                            'فتح المجلد (الملخصات والاختبارات)',
                                            'Open Folder'
                                          )}
                                        </span>
                                      </GoldChip>
                                    </div>
                                  </div>
                                </motion.div>
                              );
                            })}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* SUMMARIES TAB */}
                {activeTab === 'summaries' && (
                  <div className="space-y-4">
                    {activeFolder && (
                      <div className="p-3 rounded-xl bg-[#0D0D10] border border-[#D4AF37]/35 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs text-[#E5C158]">
                          {tr('تصفية حسب المجلد:', 'Filtered by folder:')}{' '}
                          <strong>{activeFolder.name}</strong>
                        </span>
                        <GoldChip
                          onClick={() => setSelectedFolderId(null)}
                          className="text-xs px-3 py-1"
                        >
                          {tr('عرض كل ملفات المادة', 'Show All')}
                        </GoldChip>
                      </div>
                    )}
                    {isAdmin && showSummaryForm && renderSummaryForm()}
                    {renderSummariesList(visibleSummaries)}
                  </div>
                )}

                {/* QUIZZES TAB */}
                {activeTab === 'quizzes' && (
                  <div className="space-y-4">
                    {activeFolder && (
                      <div className="p-3 rounded-xl bg-[#0D0D10] border border-[#D4AF37]/35 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs text-[#E5C158]">
                          {tr('اختبارات مجلد:', 'Folder exams:')}{' '}
                          <strong>{activeFolder.name}</strong>
                        </span>
                        <GoldChip
                          onClick={() => setSelectedFolderId(null)}
                          className="text-xs px-3 py-1"
                        >
                          {tr('عرض كل الاختبارات', 'Show All')}
                        </GoldChip>
                      </div>
                    )}
                    {isAdmin && showQuizBuilder && (
                      <QuizBuilder
                        courseId={courseId}
                        folderId={selectedFolderId || undefined}
                        onCreated={(q) => {
                          setQuizzes((prev) => [q, ...prev]);
                          setShowQuizBuilder(false);
                          onContentChanged();
                        }}
                        onCancel={() => setShowQuizBuilder(false)}
                      />
                    )}
                    {renderQuizzesList(visibleQuizzes)}
                  </div>
                )}

                {/* EXCLUSIVE COURSES AI TUTOR TAB */}
                {activeTab === 'tutor' && (
                  <CourseAiTutorTab course={course} summaries={summaries} />
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
