import {
  ArrowLeft,
  ArrowRight,
  BarChart2,
  BookOpen,
  Check,
  CheckCircle2,
  ClipboardList,
  Clock,
  Download,
  ExternalLink,
  Eye,
  FileText,
  FileUp,
  Flame,
  Folder,
  FolderOpen,
  FolderPlus,
  GraduationCap,
  ImageOff,
  ImagePlus,
  Maximize2,
  Minimize2,
  Play,
  Plus,
  Shuffle,
  Sparkles,
  Trash2,
  Type as TypeIcon,
  X,
} from 'lucide-react';
import { motion } from 'motion/react';
import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import type {
  Course,
  CourseAssignment,
  CourseFolder,
  Quiz,
  QuizDifficulty,
  QuizSubmission,
  SummaryCategory,
  SummaryItem,
} from '../../types';
import { apiRequest, resolveApiUrl } from '../../utils/api';
import { CountdownTimer } from '../ui/CountdownTimer';
import { GoldChip } from '../ui/GoldChip';
import { CourseAiTutorTab } from './CourseAiTutorTab';
import { QuizBuilder, QuizRunner } from './QuizRunner';

interface CourseDetailModalProps {
  courseId: string;
  initialFolderId?: string | null;
  onClose: () => void;
  onContentChanged: () => void;
}

type FolderSubTab = 'all' | 'books' | 'summaries' | 'quizzes' | 'tutor' | 'assignments';

export function CourseDetailModal({
  courseId,
  initialFolderId = null,
  onClose,
  onContentChanged,
}: CourseDetailModalProps) {
  const { user } = useAuth();
  const { tr, formatYear, isEn } = useLanguage();
  const isAdmin = user?.role === 'admin';

  const [course, setCourse] = useState<Course | null>(null);
  const [folders, setFolders] = useState<CourseFolder[]>([]);
  const [summaries, setSummaries] = useState<SummaryItem[]>([]);
  const [assignments, setAssignments] = useState<CourseAssignment[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [submissions, setSubmissions] = useState<QuizSubmission[]>([]);
  const [enrolled, setEnrolled] = useState(false);
  const [completedSummaryIds, setCompletedSummaryIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<
    'folders' | 'summaries' | 'quizzes' | 'tutor'
  >('folders');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(
    initialFolderId
  );
  const [folderSubTab, setFolderSubTab] = useState<FolderSubTab>('all');
  const [litFolderId, setLitFolderId] = useState<string | null>(null);
  const litFolderTimerRef = useRef<number | null>(null);
  const [activeQuiz, setActiveQuiz] = useState<Quiz | null>(null);
  const [reviewSubmission, setReviewSubmission] =
    useState<QuizSubmission | null>(null);

  // PDF preview + fullscreen state
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const [previewPdfTitle, setPreviewPdfTitle] = useState<string>('');
  const [isPdfFullscreen, setIsPdfFullscreen] = useState(false);
  const pdfContainerRef = useRef<HTMLDivElement | null>(null);

  // Admin Folder Creation state
  const [showFolderForm, setShowFolderForm] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [folderDesc, setFolderDesc] = useState('');
  const [folderCover, setFolderCover] = useState<File | null>(null);
  const [folderCoverPreview, setFolderCoverPreview] = useState<string | null>(null);
  const [folderReleaseAt, setFolderReleaseAt] = useState('');
  const [savingFolder, setSavingFolder] = useState(false);
  const [folderError, setFolderError] = useState<string | null>(null);

  // Admin Book / Summary + PDF upload state
  const [showSummaryForm, setShowSummaryForm] = useState(false);
  const [sumCategory, setSumCategory] = useState<SummaryCategory>('summary');
  const [sumTitle, setSumTitle] = useState('');
  const [sumDesc, setSumDesc] = useState('');
  const [sumFolderId, setSumFolderId] = useState('');
  const [sumReleaseAt, setSumReleaseAt] = useState('');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Admin Quiz builder state
  const [showQuizBuilder, setShowQuizBuilder] = useState(false);

  // AI Interactive Quiz Generator state (inside folder)
  const [showAiQuizPanel, setShowAiQuizPanel] = useState(false);
  const [aiDifficulty, setAiDifficulty] = useState<QuizDifficulty>('medium');
  const [aiQuestionCount, setAiQuestionCount] = useState(5);
  const [aiDurationMinutes, setAiDurationMinutes] = useState(15);
  const [aiCustomTitle, setAiCustomTitle] = useState('');
  const [generatingAiQuiz, setGeneratingAiQuiz] = useState(false);
  const [aiQuizError, setAiQuizError] = useState<string | null>(null);

  // Folder Assignments ("خانة التكليفات") state
  const [assignTitle, setAssignTitle] = useState('');
  const [assignMode, setAssignMode] = useState<'image' | 'pdf' | 'text'>('image');
  const [assignFile, setAssignFile] = useState<File | null>(null);
  const [assignFilePreview, setAssignFilePreview] = useState<string | null>(null);
  const [assignText, setAssignText] = useState('');
  const [savingAssign, setSavingAssign] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (litFolderTimerRef.current !== null) {
        window.clearTimeout(litFolderTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!folderCover) {
      setFolderCoverPreview(null);
      return;
    }
    const url = URL.createObjectURL(folderCover);
    setFolderCoverPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [folderCover]);

  useEffect(() => {
    if (!assignFile || assignMode !== 'image') {
      setAssignFilePreview(null);
      return;
    }
    const url = URL.createObjectURL(assignFile);
    setAssignFilePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [assignFile, assignMode]);

  useEffect(() => {
    const onFsChange = () => {
      if (!document.fullscreenElement) {
        // Keep modal-fullscreen controllable manually even if browser ESC exits native FS
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const recordFolderView = async (folderId: string) => {
    try {
      const res = await apiRequest<{ viewsCount: number; isTrending: boolean }>(
        `/api/folders/${folderId}/view`,
        { method: 'POST' }
      );
      setFolders((prev) =>
        prev.map((f) =>
          f.id === folderId
            ? { ...f, viewsCount: res.viewsCount, isTrending: res.isTrending }
            : f
        )
      );
      onContentChanged();
    } catch {
      // Ignore
    }
  };

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
    setFolderSubTab('all');
    void recordFolderView(folderId);
  };

  const loadDetails = async () => {
    setLoading(true);
    try {
      const data = await apiRequest<{
        course: Course;
        folders?: CourseFolder[];
        summaries: SummaryItem[];
        assignments?: CourseAssignment[];
        quizzes: Quiz[];
        submissions: QuizSubmission[];
        enrolled?: boolean;
        completedSummaryIds?: string[];
      }>(`/api/courses/${courseId}/details`);
      setCourse(data.course);
      setFolders(data.folders || []);
      setSummaries(data.summaries);
      setAssignments(data.assignments || []);
      setQuizzes(data.quizzes);
      setSubmissions(data.submissions);
      setEnrolled(Boolean(data.enrolled));
      setCompletedSummaryIds(data.completedSummaryIds || []);

      if (initialFolderId && (data.folders || []).some((f) => f.id === initialFolderId)) {
        setSelectedFolderId(initialFolderId);
        setSumFolderId(initialFolderId);
        setActiveTab('folders');
        void recordFolderView(initialFolderId);
      }
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
    if (!reviewSub && !quiz.isPracticeOnly) {
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

  const openPdfPreview = (url: string, title: string, enterFullscreen = false) => {
    setPreviewPdfUrl(url);
    setPreviewPdfTitle(title);
    setIsPdfFullscreen(enterFullscreen);
  };

  const togglePdfFullscreen = async () => {
    const next = !isPdfFullscreen;
    setIsPdfFullscreen(next);
    if (next && pdfContainerRef.current?.requestFullscreen) {
      try {
        await pdfContainerRef.current.requestFullscreen();
      } catch {
        // Fallback fixed full-viewport CSS handles fullscreen gracefully
      }
    } else if (!next && document.fullscreenElement) {
      try {
        await document.exitFullscreen();
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
      onContentChanged();
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
      onContentChanged();
    } catch {
      // Ignore
    }
  };

  const handleDeleteFolder = async (folderId: string) => {
    try {
      await apiRequest(`/api/folders/${folderId}`, { method: 'DELETE' });
      setFolders((prev) => prev.filter((f) => f.id !== folderId));
      setSummaries((prev) => prev.filter((s) => s.folderId !== folderId));
      setAssignments((prev) => prev.filter((a) => a.folderId !== folderId));
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
      setFormError(
        sumCategory === 'book'
          ? tr('يرجى إدخال اسم كتاب المادة.', 'Please enter textbook title.')
          : tr('يرجى إدخال عنوان الملخص.', 'Please enter summary title.')
      );
      return;
    }

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('title', sumTitle.trim());
      fd.append('description', sumDesc.trim());
      fd.append('category', sumCategory);
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
          : tr('تعذر رفع الملف.', 'Failed to upload file.')
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

  const handleGenerateAiQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFolderId) return;
    setAiQuizError(null);
    setGeneratingAiQuiz(true);
    try {
      if (isAdmin) {
        const res = await apiRequest<{ quiz: Quiz }>(
          `/api/folders/${selectedFolderId}/ai-quiz`,
          {
            method: 'POST',
            body: JSON.stringify({
              difficulty: aiDifficulty,
              questionCount: aiQuestionCount,
              durationMinutes: aiDurationMinutes,
              title: aiCustomTitle.trim() || undefined,
            }),
          }
        );
        setQuizzes((prev) => [res.quiz, ...prev]);
        setAiCustomTitle('');
        setShowAiQuizPanel(false);
        onContentChanged();
      } else {
        const res = await apiRequest<{ quiz: Quiz }>(
          `/api/folders/${selectedFolderId}/ai-practice-quiz`,
          {
            method: 'POST',
            body: JSON.stringify({
              difficulty: aiDifficulty,
              questionCount: aiQuestionCount,
              durationMinutes: aiDurationMinutes,
            }),
          }
        );
        setShowAiQuizPanel(false);
        setReviewSubmission(null);
        setActiveQuiz(res.quiz);
      }
    } catch (err) {
      setAiQuizError(
        err instanceof Error
          ? err.message
          : tr(
              'تعذر توليد الامتحان بالذكاء الاصطناعي من محتوى المجلد.',
              'Failed to generate AI exam from folder content.'
            )
      );
    } finally {
      setGeneratingAiQuiz(false);
    }
  };

  const handleAddAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    setAssignError(null);
    if (!assignTitle.trim()) {
      setAssignError(tr('يرجى كتابة عنوان التكليف.', 'Please enter assignment title.'));
      return;
    }
    if (assignMode === 'text' && !assignText.trim()) {
      setAssignError(tr('يرجى كتابة نص التكليف.', 'Please write assignment text.'));
      return;
    }
    if ((assignMode === 'image' || assignMode === 'pdf') && !assignFile) {
      setAssignError(
        assignMode === 'image'
          ? tr('يرجى اختيار صورة من جهازك.', 'Please select an image from your device.')
          : tr('يرجى اختيار ملف PDF من جهازك.', 'Please select a PDF from your device.')
      );
      return;
    }

    setSavingAssign(true);
    try {
      let created: { assignment: CourseAssignment };
      if (assignMode === 'text') {
        created = await apiRequest<{ assignment: CourseAssignment }>(
          `/api/courses/${courseId}/assignments`,
          {
            method: 'POST',
            body: JSON.stringify({
              title: assignTitle.trim(),
              folderId: selectedFolderId || undefined,
              type: 'text',
              contentText: assignText.trim(),
            }),
          }
        );
      } else {
        const fd = new FormData();
        fd.append('title', assignTitle.trim());
        if (selectedFolderId) fd.append('folderId', selectedFolderId);
        fd.append('type', assignMode);
        if (assignText.trim()) fd.append('contentText', assignText.trim());
        if (assignFile) fd.append('file', assignFile);
        created = await apiRequest<{ assignment: CourseAssignment }>(
          `/api/courses/${courseId}/assignments`,
          {
            method: 'POST',
            body: fd,
          }
        );
      }

      setAssignments((prev) => [created.assignment, ...prev]);
      setAssignTitle('');
      setAssignText('');
      setAssignFile(null);
      onContentChanged();
    } catch (err) {
      setAssignError(
        err instanceof Error
          ? err.message
          : tr('تعذر حفظ التكليف.', 'Failed to save assignment.')
      );
    } finally {
      setSavingAssign(false);
    }
  };

  const handleDeleteAssignment = async (id: string) => {
    try {
      await apiRequest(`/api/assignments/${id}`, { method: 'DELETE' });
      setAssignments((prev) => prev.filter((a) => a.id !== id));
      onContentChanged();
    } catch {
      // Ignore
    }
  };

  const visibleSummaries = selectedFolderId
    ? summaries.filter((s) => s.folderId === selectedFolderId)
    : summaries;
  const visibleBooks = visibleSummaries.filter((s) => s.category === 'book');
  const visibleNotes = visibleSummaries.filter((s) => s.category !== 'book');
  const visibleQuizzes = selectedFolderId
    ? quizzes.filter((q) => q.folderId === selectedFolderId)
    : quizzes;
  const visibleAssignments = selectedFolderId
    ? assignments.filter((a) => a.folderId === selectedFolderId)
    : assignments;
  const activeFolder = folders.find((f) => f.id === selectedFolderId) || null;

  const getDifficultyBadge = (diff?: QuizDifficulty) => {
    if (diff === 'easy') {
      return {
        label: tr('سهل', 'Easy'),
        cls: 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40',
      };
    }
    if (diff === 'hard') {
      return {
        label: tr('صعب', 'Hard'),
        cls: 'bg-rose-950/80 text-rose-300 border-rose-500/40',
      };
    }
    if (diff === 'medium') {
      return {
        label: tr('متوسط', 'Medium'),
        cls: 'bg-amber-950/80 text-amber-300 border-amber-500/40',
      };
    }
    return null;
  };

  const renderSummaryForm = () => (
    <form
      onSubmit={handleUploadSummary}
      className="p-4 rounded-xl bg-[#09090B] border border-[#D4AF37]/30 space-y-3"
    >
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-display text-sm font-bold text-[#E5C158]">
          {sumCategory === 'book'
            ? tr('إضافة كتاب المادة (PDF من الجهاز)', 'Add Course Textbook (PDF from Device)')
            : tr('إضافة ملخص أو رفع ملف PDF من جهازك', 'Add Summary or Upload PDF File')}
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
      <div className="flex flex-wrap items-center gap-2">
        <GoldChip
          type="button"
          active={sumCategory === 'book'}
          onClick={() => setSumCategory('book')}
          className="text-xs px-3 py-1.5"
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>{tr('كتاب المادة', 'Course Book')}</span>
        </GoldChip>
        <GoldChip
          type="button"
          active={sumCategory === 'summary'}
          onClick={() => setSumCategory('summary')}
          className="text-xs px-3 py-1.5"
        >
          <FileText className="w-3.5 h-3.5" />
          <span>{tr('ملخص', 'Summary')}</span>
        </GoldChip>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input
          type="text"
          required
          value={sumTitle}
          onChange={(e) => setSumTitle(e.target.value)}
          placeholder={
            sumCategory === 'book'
              ? tr('اسم كتاب المادة (مثال: الكتاب المرجعي للعملي)', 'Course textbook title...')
              : tr('عنوان الملخص أو المحاضرة', 'Summary title')
          }
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
            'وصف مختصر للمحتوى...',
            'Short description...'
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
            : sumCategory === 'book'
            ? tr('حفظ كتاب المادة', 'Publish Book')
            : tr('نشر الملخص', 'Publish Summary')}
        </GoldChip>
      </div>
    </form>
  );

  const renderSummariesList = (items: SummaryItem[], emptyMessage?: string) => {
    if (items.length === 0) {
      return (
        <div className="py-8 text-center text-sm text-[#A8A29E] rounded-xl bg-[#0D0D10] border border-white/10">
          {emptyMessage ||
            tr('لا توجد ملخصات مضافة هنا حتى الآن.', 'No summaries added here yet.')}
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
              <div className="flex flex-wrap items-center gap-2">
                {sum.category === 'book' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#D4AF37]/20 border border-[#D4AF37]/40 text-[10px] font-bold text-[#F5D061]">
                    <BookOpen className="w-3 h-3" />
                    <span>{tr('كتاب المادة', 'Course Book')}</span>
                  </span>
                )}
                {sum.fileUrl ? (
                  <a
                    href={resolveApiUrl(sum.fileUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => {
                      handleLessonProgress(sum);
                      recordSummaryView(sum.id);
                    }}
                    className="font-semibold text-sm text-[#F5F0E6] hover:text-[#F5D061] underline decoration-[#D4AF37]/40 underline-offset-4 inline-flex items-center gap-1.5"
                    title={tr('اضغط لفتح الـ PDF في تبويب جديدة', 'Click to open PDF in a new tab')}
                  >
                    <span>{sum.title}</span>
                    <ExternalLink className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
                  </a>
                ) : (
                  <h4 className="font-semibold text-sm text-[#F5F0E6]">
                    {sum.title}
                  </h4>
                )}
              </div>
              <p className="text-xs text-[#C8C2B8]">{sum.description}</p>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#A8A29E]">
                <span>
                  {tr('بواسطة', 'By')} {sum.createdBy}
                </span>
                {sum.fileName && sum.fileUrl && (
                  <>
                    <span aria-hidden="true">·</span>
                    <a
                      href={resolveApiUrl(sum.fileUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => {
                        handleLessonProgress(sum);
                        recordSummaryView(sum.id);
                      }}
                      className="text-[#D4AF37] hover:text-[#F5D061] truncate max-w-[200px] underline"
                    >
                      {sum.fileName}
                    </a>
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
                  <a
                    href={resolveApiUrl(sum.fileUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => {
                      handleLessonProgress(sum);
                      recordSummaryView(sum.id);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#D4AF37]/15 border border-[#D4AF37]/40 text-[#F5D061] hover:bg-[#D4AF37] hover:text-[#09090B] transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>{tr('فتح تبويب جديدة', 'New Tab')}</span>
                  </a>
                  <GoldChip
                    active={previewPdfUrl === sum.fileUrl && isPdfFullscreen}
                    onClick={() => {
                      openPdfPreview(sum.fileUrl!, sum.title, true);
                      handleLessonProgress(sum);
                      recordSummaryView(sum.id);
                    }}
                    className="text-xs px-3 py-1.5"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                    <span>{tr('ملئ الشاشة', 'Fullscreen')}</span>
                  </GoldChip>
                  <a
                    href={resolveApiUrl(sum.fileUrl)}
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
                  aria-label={tr('حذف الملف', 'Delete file')}
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

          const diffBadge = getDifficultyBadge(quiz.difficulty);

          return (
            <div
              key={quiz.id}
              className="p-4 rounded-xl bg-[#0D0D10] border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="space-y-1.5 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="font-semibold text-sm text-[#F5F0E6]">
                    {quiz.title}
                  </h4>
                  {quiz.generatedByAi && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-violet-950/80 border border-violet-400/40 text-[10px] font-bold text-violet-200">
                      <Sparkles className="w-3 h-3" />
                      <span>AI</span>
                    </span>
                  )}
                  {diffBadge && (
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] font-bold ${diffBadge.cls}`}
                    >
                      {diffBadge.label}
                    </span>
                  )}
                </div>
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

  const renderAiQuizGeneratorPanel = () => (
    <form
      onSubmit={handleGenerateAiQuiz}
      className="p-4 sm:p-5 rounded-xl bg-gradient-to-br from-[#D4AF37]/10 via-[#09090B] to-[#121216] border border-[#D4AF37]/40 space-y-4"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[#F5D061]">
          <Sparkles className="w-4 h-4" />
          <h4 className="font-display text-sm sm:text-base font-bold">
            {isAdmin
              ? tr(
                  'توليد امتحان تفاعلي بالـ AI من محتوى المجلد',
                  'Generate AI Interactive Exam from Folder Content'
                )
              : tr(
                  'إنشاء امتحان تدريبي بالـ AI من محتوى المجلد',
                  'Generate AI Practice Exam from Folder Content'
                )}
          </h4>
        </div>
        <button
          type="button"
          onClick={() => setShowAiQuizPanel(false)}
          className="text-xs text-[#A8A29E] hover:text-white cursor-pointer"
        >
          {tr('إغلاق', 'Close')}
        </button>
      </div>

      <p className="text-xs text-[#C8C2B8]">
        {tr(
          'يقرأ الذكاء الاصطناعي كتاب المادة والملخصات والتكليفات داخل هذا المجلد وينشئ أسئلة اختيار من متعدد تفاعلية بالمستوى الذي تحدده.',
          'AI reads the textbook, summaries, and assignments inside this folder and generates interactive MCQ questions at your chosen difficulty.'
        )}
      </p>

      {aiQuizError && (
        <div className="p-2.5 rounded-lg bg-red-950/50 border border-red-500/40 text-red-200 text-xs">
          {aiQuizError}
        </div>
      )}

      <div className="space-y-2">
        <label className="block text-xs font-semibold text-[#E5C158]">
          {tr('اختر مستوى الامتحان:', 'Choose Difficulty Level:')}
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <GoldChip
            type="button"
            active={aiDifficulty === 'easy'}
            onClick={() => setAiDifficulty('easy')}
            className="text-xs px-4 py-2"
          >
            {tr('سهل (Easy)', 'Easy')}
          </GoldChip>
          <GoldChip
            type="button"
            active={aiDifficulty === 'medium'}
            onClick={() => setAiDifficulty('medium')}
            className="text-xs px-4 py-2"
          >
            {tr('متوسط (Medium)', 'Medium')}
          </GoldChip>
          <GoldChip
            type="button"
            active={aiDifficulty === 'hard'}
            onClick={() => setAiDifficulty('hard')}
            className="text-xs px-4 py-2"
          >
            {tr('صعب (Hard)', 'Hard')}
          </GoldChip>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {isAdmin && (
          <input
            type="text"
            value={aiCustomTitle}
            onChange={(e) => setAiCustomTitle(e.target.value)}
            placeholder={tr('عنوان الامتحان (اختياري)', 'Custom exam title (optional)')}
            className="px-3 py-2 rounded-lg bg-[#151519] border border-white/10 text-sm text-[#F5F0E6] focus:outline-none focus:border-[#D4AF37]"
          />
        )}
        <div className="space-y-1">
          <label className="block text-[11px] text-[#A8A29E]">
            {tr('عدد الأسئلة', 'Questions Count')}
          </label>
          <input
            type="number"
            min={3}
            max={20}
            value={aiQuestionCount}
            onChange={(e) =>
              setAiQuestionCount(Math.min(20, Math.max(3, Number(e.target.value) || 5)))
            }
            className="w-full px-3 py-2 rounded-lg bg-[#151519] border border-white/10 text-sm text-[#F5F0E6] font-mono focus:outline-none focus:border-[#D4AF37]"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-[11px] text-[#A8A29E]">
            {tr('المدة (بالدقائق)', 'Duration (minutes)')}
          </label>
          <input
            type="number"
            min={1}
            max={120}
            value={aiDurationMinutes}
            onChange={(e) =>
              setAiDurationMinutes(Math.max(1, Number(e.target.value) || 10))
            }
            className="w-full px-3 py-2 rounded-lg bg-[#151519] border border-white/10 text-sm text-[#F5F0E6] font-mono focus:outline-none focus:border-[#D4AF37]"
          />
        </div>
      </div>

      <div className="flex justify-end">
        <GoldChip type="submit" active={true} disabled={generatingAiQuiz}>
          <Sparkles className="w-4 h-4" />
          <span>
            {generatingAiQuiz
              ? tr('جاري قراءة محتوى المجلد وتوليد الأسئلة...', 'Generating AI Exam...')
              : isAdmin
              ? tr('توليد وحفظ الامتحان التفاعلي', 'Generate & Publish AI Exam')
              : tr('توليد وبدء الامتحان التدريبي', 'Generate & Start Practice Exam')}
          </span>
        </GoldChip>
      </div>
    </form>
  );

  const renderAssignmentsSection = () => (
    <div className="space-y-4">
      {/* Add Assignment / Submission Form (Image, PDF, or Text) */}
      <form
        onSubmit={handleAddAssignment}
        className="p-4 sm:p-5 rounded-xl bg-[#09090B] border border-[#D4AF37]/35 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="font-display text-sm sm:text-base font-bold text-[#E5C158] flex items-center gap-2">
            <ClipboardList className="w-4 h-4" />
            <span>
              {isAdmin
                ? tr('إضافة تكليف جديد (صورة أو PDF أو نص)', 'Add Assignment (Image, PDF, or Text)')
                : tr('إضافة أو تسليم تكليف (صورة أو PDF أو نص)', 'Add / Submit Assignment (Image, PDF, or Text)')}
            </span>
          </h4>
        </div>

        {assignError && (
          <div className="p-2.5 rounded-lg bg-red-950/50 border border-red-500/40 text-red-200 text-xs">
            {assignError}
          </div>
        )}

        {/* Mode Selector: Image | PDF | Text */}
        <div className="flex flex-wrap items-center gap-2">
          <GoldChip
            type="button"
            active={assignMode === 'image'}
            onClick={() => {
              setAssignMode('image');
              setAssignFile(null);
            }}
            className="text-xs px-3.5 py-2"
          >
            <ImagePlus className="w-3.5 h-3.5" />
            <span>{tr('رفع صورة', 'Upload Image')}</span>
          </GoldChip>
          <GoldChip
            type="button"
            active={assignMode === 'pdf'}
            onClick={() => {
              setAssignMode('pdf');
              setAssignFile(null);
            }}
            className="text-xs px-3.5 py-2"
          >
            <FileUp className="w-3.5 h-3.5" />
            <span>{tr('رفع ملف PDF', 'Upload PDF')}</span>
          </GoldChip>
          <GoldChip
            type="button"
            active={assignMode === 'text'}
            onClick={() => {
              setAssignMode('text');
              setAssignFile(null);
            }}
            className="text-xs px-3.5 py-2"
          >
            <TypeIcon className="w-3.5 h-3.5" />
            <span>{tr('كتابة نص', 'Write Text')}</span>
          </GoldChip>
        </div>

        <input
          type="text"
          required
          value={assignTitle}
          onChange={(e) => setAssignTitle(e.target.value)}
          placeholder={tr('عنوان التكليف (مثال: شيت المحاضرة الثالثة)', 'Assignment title...')}
          className="w-full px-3.5 py-2.5 rounded-xl bg-[#151519] border border-white/10 text-sm text-[#F5F0E6] focus:outline-none focus:border-[#D4AF37]"
        />

        {assignMode === 'image' && (
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-[#151519] border border-dashed border-[#D4AF37]/60 text-xs font-semibold text-[#F5D061] cursor-pointer hover:bg-[#1C1C22] transition-colors">
              <ImagePlus className="w-4 h-4 shrink-0" />
              <span className="truncate max-w-[240px]">
                {assignFile
                  ? `${tr('تم اختيار الصورة:', 'Selected Image:')} ${assignFile.name}`
                  : tr('اختيار صورة من الجهاز (PNG / JPG)', 'Choose Image from Device')}
              </span>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setAssignFile(e.target.files?.[0] || null)}
                className="sr-only"
              />
            </label>
            {assignFilePreview && (
              <img
                src={assignFilePreview}
                alt="Preview"
                className="h-14 w-20 object-cover rounded-lg border border-[#D4AF37]/50"
              />
            )}
          </div>
        )}

        {assignMode === 'pdf' && (
          <label className="inline-flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-[#151519] border border-dashed border-[#D4AF37]/60 text-xs font-semibold text-[#F5D061] cursor-pointer hover:bg-[#1C1C22] transition-colors">
            <FileUp className="w-4 h-4 shrink-0" />
            <span className="truncate max-w-[260px]">
              {assignFile
                ? `${tr('تم اختيار ملف PDF:', 'Selected PDF:')} ${assignFile.name}`
                : tr('اختيار ملف PDF من الجهاز', 'Choose PDF from Device')}
            </span>
            <input
              type="file"
              accept="application/pdf,.pdf"
              onChange={(e) => setAssignFile(e.target.files?.[0] || null)}
              className="sr-only"
            />
          </label>
        )}

        <textarea
          rows={assignMode === 'text' ? 4 : 2}
          required={assignMode === 'text'}
          value={assignText}
          onChange={(e) => setAssignText(e.target.value)}
          placeholder={
            assignMode === 'text'
              ? tr('اكتب نص التكليف أو الإجابة كاملة هنا...', 'Write the full assignment text here...')
              : tr('ملاحظات أو وصف اختياري للتكليف...', 'Optional notes or instructions...')
          }
          className="w-full px-3.5 py-2.5 rounded-xl bg-[#151519] border border-white/10 text-sm text-[#F5F0E6] focus:outline-none focus:border-[#D4AF37]"
        />

        <div className="flex justify-end">
          <GoldChip type="submit" active={true} disabled={savingAssign}>
            {savingAssign
              ? tr('جاري الحفظ...', 'Saving...')
              : tr('حفظ التكليف', 'Save Assignment')}
          </GoldChip>
        </div>
      </form>

      {/* Assignments List */}
      {visibleAssignments.length === 0 ? (
        <div className="py-8 text-center text-sm text-[#A8A29E] rounded-xl bg-[#0D0D10] border border-white/10">
          {tr('لا توجد تكليفات مضافة هنا حتى الآن.', 'No assignments added here yet.')}
        </div>
      ) : (
        <div className="space-y-3">
          {visibleAssignments.map((assign) => {
            const canDelete = isAdmin || assign.createdById === user?.id;
            return (
              <div
                key={assign.id}
                className="p-4 rounded-xl bg-[#0D0D10] border border-white/10 space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2 py-0.5 rounded-md bg-[#151519] border border-[#D4AF37]/30 text-[10px] font-bold text-[#E5C158]">
                        {assign.type === 'pdf'
                          ? 'PDF'
                          : assign.type === 'image'
                          ? tr('صورة', 'Image')
                          : tr('نص', 'Text')}
                      </span>
                      {assign.type === 'pdf' && assign.fileUrl ? (
                        <a
                          href={resolveApiUrl(assign.fileUrl)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-semibold text-sm text-[#F5F0E6] hover:text-[#F5D061] underline decoration-[#D4AF37]/40 underline-offset-4 inline-flex items-center gap-1.5"
                        >
                          <span>{assign.title}</span>
                          <ExternalLink className="w-3.5 h-3.5 text-[#D4AF37]" />
                        </a>
                      ) : (
                        <h4 className="font-semibold text-sm text-[#F5F0E6]">
                          {assign.title}
                        </h4>
                      )}
                    </div>
                    <div className="text-[11px] text-[#A8A29E]">
                      {tr('بواسطة', 'By')} {assign.createdBy}
                      {assign.fileName ? ` · ${assign.fileName}` : ''}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {assign.type === 'pdf' && assign.fileUrl && (
                      <>
                        <a
                          href={resolveApiUrl(assign.fileUrl)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#D4AF37]/15 border border-[#D4AF37]/40 text-[#F5D061] hover:bg-[#D4AF37] hover:text-[#09090B] transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>{tr('فتح تبويب جديدة', 'New Tab')}</span>
                        </a>
                        <GoldChip
                          active={previewPdfUrl === assign.fileUrl && isPdfFullscreen}
                          onClick={() => openPdfPreview(assign.fileUrl!, assign.title, true)}
                          className="text-xs px-3 py-1.5"
                        >
                          <Maximize2 className="w-3.5 h-3.5" />
                          <span>{tr('ملئ الشاشة', 'Fullscreen')}</span>
                        </GoldChip>
                      </>
                    )}
                    {assign.type === 'image' && assign.fileUrl && (
                      <a
                        href={resolveApiUrl(assign.fileUrl)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#D4AF37]/15 border border-[#D4AF37]/40 text-[#F5D061] hover:bg-[#D4AF37] hover:text-[#09090B] transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>{tr('فتح الصورة', 'Open Image')}</span>
                      </a>
                    )}
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => handleDeleteAssignment(assign.id)}
                        className="p-2 rounded-lg bg-red-950/50 border border-red-500/30 text-red-300 hover:bg-red-600 hover:text-white transition-colors cursor-pointer"
                        aria-label={tr('حذف التكليف', 'Delete assignment')}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {assign.contentText && (
                  <p className="text-xs sm:text-sm text-[#E7E2D8] whitespace-pre-wrap leading-relaxed p-3 rounded-lg bg-[#151519] border border-white/5">
                    {assign.contentText}
                  </p>
                )}

                {assign.type === 'image' && assign.fileUrl && (
                  <a
                    href={resolveApiUrl(assign.fileUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block rounded-lg overflow-hidden border border-white/10 bg-[#09090B] max-h-64"
                  >
                    <img
                      src={resolveApiUrl(assign.fileUrl)}
                      alt={assign.title}
                      className="w-full max-h-64 object-contain"
                    />
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

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
                  src={resolveApiUrl(course.coverUrl)}
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
                      {tr('الكتب والملخصات PDF', 'Books & Summaries PDF')} (
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
                    <span>{tr('مدرسك الذكي', 'Smart Tutor')}</span>
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
                        : tr('إنشاء مجلد جديد بصورة', 'Create Folder with Image')}
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
                        : tr('إضافة كتاب / ملخص PDF', 'Add Book / Summary PDF')}
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

            {/* Shared PDF Preview & Fullscreen Pane */}
            {previewPdfUrl && !activeQuiz && (
              <div
                ref={pdfContainerRef}
                className={
                  isPdfFullscreen
                    ? 'fixed inset-0 z-[80] bg-[#09090B] flex flex-col'
                    : 'rounded-xl overflow-hidden border border-[#D4AF37]/40 bg-[#09090B]'
                }
              >
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-white/10 bg-[#121216] text-xs shrink-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="w-4 h-4 text-[#D4AF37] shrink-0" />
                    <span className="text-[#E5C158] font-semibold truncate">
                      {previewPdfTitle || tr('معاينة ملف PDF', 'PDF Preview')}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={resolveApiUrl(previewPdfUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#D4AF37]/15 border border-[#D4AF37]/40 text-[#F5D061] hover:bg-[#D4AF37] hover:text-[#09090B] transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>{tr('فتح في تبويب جديدة', 'Open in New Tab')}</span>
                    </a>
                    <button
                      type="button"
                      onClick={() => void togglePdfFullscreen()}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#18181D] border border-white/15 text-[#F5F0E6] hover:border-[#D4AF37] hover:text-[#F5D061] cursor-pointer"
                    >
                      {isPdfFullscreen ? (
                        <>
                          <Minimize2 className="w-3.5 h-3.5" />
                          <span>{tr('تصغير', 'Exit Fullscreen')}</span>
                        </>
                      ) : (
                        <>
                          <Maximize2 className="w-3.5 h-3.5" />
                          <span>{tr('ملئ الشاشة', 'Fullscreen')}</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPreviewPdfUrl(null);
                        setIsPdfFullscreen(false);
                        if (document.fullscreenElement) {
                          void document.exitFullscreen().catch(() => {});
                        }
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-red-950/60 border border-red-500/30 text-red-200 hover:bg-red-600 hover:text-white cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>{tr('إغلاق', 'Close')}</span>
                    </button>
                  </div>
                </div>
                <iframe
                  src={resolveApiUrl(previewPdfUrl)}
                  title={previewPdfTitle || 'PDF Preview'}
                  allowFullScreen
                  className={
                    isPdfFullscreen
                      ? 'w-full flex-1 bg-white'
                      : 'w-full h-[380px] sm:h-[440px] bg-white'
                  }
                />
              </div>
            )}

            {/* ACTIVE QUIZ VIEW */}
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
                      /* INSIDE SPECIFIC FOLDER VIEW: Books, Summaries, AI Quiz, Smart Tutor, Assignments */
                      <div className="space-y-5">
                        <div className="rounded-2xl overflow-hidden bg-[#0D0D10] border border-[#D4AF37]/35">
                          {activeFolder.coverUrl && (
                            <div className="relative h-36 w-full bg-[#09090B]">
                              <img
                                src={resolveApiUrl(activeFolder.coverUrl)}
                                alt={activeFolder.name}
                                className="w-full h-full object-cover"
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-[#0D0D10] via-transparent to-transparent" />
                            </div>
                          )}

                          <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="space-y-1.5">
                              <div className="flex flex-wrap items-center gap-2 text-xs text-[#D4AF37]">
                                <FolderOpen className="w-4 h-4" />
                                <span>{tr('محتوى المجلد', 'Folder Contents')}</span>
                                <span
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#151519] border border-white/10 font-mono text-[#E5C158] tabular-nums"
                                  title={tr('عدد الأشخاص الذين دخلوا المجلد', 'Total folder visitors')}
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>{activeFolder.viewsCount ?? 0}</span>
                                </span>
                                {(activeFolder.isTrending || (activeFolder.viewsCount ?? 0) > 20) && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/20 border border-amber-400/50 text-[11px] font-bold text-amber-300">
                                    <Flame className="w-3.5 h-3.5" />
                                    <span>{tr('رائج · الأكثر إقبالاً', 'Trending · Most Popular')}</span>
                                  </span>
                                )}
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
                                setShowAiQuizPanel(false);
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

                        {/* Folder Internal Navigation Bar: All 5 Requested Pillars */}
                        <div className="flex flex-wrap items-center gap-2 p-2.5 rounded-xl bg-[#0D0D10] border border-white/10">
                          <GoldChip
                            active={folderSubTab === 'all'}
                            onClick={() => setFolderSubTab('all')}
                            className="text-xs px-3 py-1.5"
                          >
                            <FolderOpen className="w-3.5 h-3.5" />
                            <span>{tr('كل المحتوى', 'All')}</span>
                          </GoldChip>
                          <GoldChip
                            active={folderSubTab === 'books'}
                            onClick={() => setFolderSubTab('books')}
                            className="text-xs px-3 py-1.5"
                          >
                            <BookOpen className="w-3.5 h-3.5" />
                            <span>
                              {tr('كتاب المادة', 'Course Book')} ({visibleBooks.length})
                            </span>
                          </GoldChip>
                          <GoldChip
                            active={folderSubTab === 'summaries'}
                            onClick={() => setFolderSubTab('summaries')}
                            className="text-xs px-3 py-1.5"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            <span>
                              {tr('الملخصات', 'Summaries')} ({visibleNotes.length})
                            </span>
                          </GoldChip>
                          <GoldChip
                            active={folderSubTab === 'quizzes'}
                            onClick={() => setFolderSubTab('quizzes')}
                            className="text-xs px-3 py-1.5"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>
                              {tr('امتحان تفاعلي AI', 'AI Interactive Exam')} ({visibleQuizzes.length})
                            </span>
                          </GoldChip>
                          <GoldChip
                            active={folderSubTab === 'tutor'}
                            onClick={() => setFolderSubTab('tutor')}
                            className="text-xs px-3 py-1.5"
                          >
                            <GraduationCap className="w-3.5 h-3.5" />
                            <span>{tr('مدرسك الذكي', 'Smart Tutor')}</span>
                          </GoldChip>
                          <GoldChip
                            active={folderSubTab === 'assignments'}
                            onClick={() => setFolderSubTab('assignments')}
                            className="text-xs px-3 py-1.5"
                          >
                            <ClipboardList className="w-3.5 h-3.5" />
                            <span>
                              {tr('التكليفات', 'Assignments')} ({visibleAssignments.length})
                            </span>
                          </GoldChip>
                        </div>

                        {/* 1. Course Textbook Section ("كتاب المادة") */}
                        {(folderSubTab === 'all' || folderSubTab === 'books') && (
                          <div className="space-y-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <h4 className="font-display text-base font-bold text-[#E5C158] flex items-center gap-2">
                                <BookOpen className="w-4 h-4" />
                                <span>
                                  {tr('كتاب المادة', 'Course Book')} ({visibleBooks.length})
                                </span>
                              </h4>
                              {isAdmin && (
                                <GoldChip
                                  active={showSummaryForm && sumCategory === 'book'}
                                  onClick={() => {
                                    setSumFolderId(activeFolder.id);
                                    setSumCategory('book');
                                    setShowSummaryForm((p) =>
                                      sumCategory === 'book' ? !p : true
                                    );
                                  }}
                                  className="text-xs px-3 py-1.5"
                                >
                                  <FileUp className="w-3.5 h-3.5" />
                                  <span>{tr('إضافة كتاب المادة', 'Add Course Book')}</span>
                                </GoldChip>
                              )}
                            </div>
                            {isAdmin && showSummaryForm && sumCategory === 'book' && renderSummaryForm()}
                            {renderSummariesList(
                              visibleBooks,
                              tr('لم يتم إضافة كتاب المادة داخل هذا المجلد بعد.', 'No course book uploaded in this folder yet.')
                            )}
                          </div>
                        )}

                        {/* 2. Summaries Section ("الملخصات") */}
                        {(folderSubTab === 'all' || folderSubTab === 'summaries') && (
                          <div className="space-y-3 pt-2 border-t border-white/10">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <h4 className="font-display text-base font-bold text-[#E5C158] flex items-center gap-2">
                                <FileText className="w-4 h-4" />
                                <span>
                                  {tr('الملخصات', 'Folder Summaries')} ({visibleNotes.length})
                                </span>
                              </h4>
                              {isAdmin && (
                                <GoldChip
                                  active={showSummaryForm && sumCategory === 'summary'}
                                  onClick={() => {
                                    setSumFolderId(activeFolder.id);
                                    setSumCategory('summary');
                                    setShowSummaryForm((p) =>
                                      sumCategory === 'summary' ? !p : true
                                    );
                                  }}
                                  className="text-xs px-3 py-1.5"
                                >
                                  <FileUp className="w-3.5 h-3.5" />
                                  <span>{tr('إضافة ملخصات', 'Add Summaries')}</span>
                                </GoldChip>
                              )}
                            </div>
                            {isAdmin && showSummaryForm && sumCategory === 'summary' && renderSummaryForm()}
                            {renderSummariesList(
                              visibleNotes,
                              tr('لا توجد ملخصات مضافة في هذا المجلد حتى الآن.', 'No summaries added in this folder yet.')
                            )}
                          </div>
                        )}

                        {/* 3. AI Interactive Exam Section ("امتحان تفاعلي AI: سهل / متوسط / صعب") */}
                        {(folderSubTab === 'all' || folderSubTab === 'quizzes') && (
                          <div className="space-y-3 pt-2 border-t border-white/10">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <h4 className="font-display text-base font-bold text-[#E5C158] flex items-center gap-2">
                                <Sparkles className="w-4 h-4" />
                                <span>
                                  {tr('الامتحان التفاعلي بالذكاء الاصطناعي والاختبارات', 'AI Interactive Exams & Quizzes')} ({visibleQuizzes.length})
                                </span>
                              </h4>
                              <div className="flex flex-wrap items-center gap-2">
                                <GoldChip
                                  active={showAiQuizPanel}
                                  onClick={() => setShowAiQuizPanel((p) => !p)}
                                  className="text-xs px-3 py-1.5"
                                >
                                  <Sparkles className="w-3.5 h-3.5" />
                                  <span>
                                    {isAdmin
                                      ? tr('إضافة امتحان تفاعلي AI', 'Add AI Interactive Exam')
                                      : tr('امتحان تدريبي بالـ AI', 'Practice AI Exam')}
                                  </span>
                                </GoldChip>
                                {isAdmin && (
                                  <GoldChip
                                    active={showQuizBuilder}
                                    onClick={() => setShowQuizBuilder((p) => !p)}
                                    className="text-xs px-3 py-1.5"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                    <span>{tr('إنشاء اختبار يدوي', 'Manual Exam')}</span>
                                  </GoldChip>
                                )}
                              </div>
                            </div>

                            {showAiQuizPanel && renderAiQuizGeneratorPanel()}

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
                        )}

                        {/* 4. Smart Tutor Section ("مدرسك الذكي") */}
                        {folderSubTab === 'tutor' && (
                          <div className="pt-2 border-t border-white/10">
                            <CourseAiTutorTab
                              course={course}
                              summaries={visibleSummaries}
                              assignments={visibleAssignments}
                              folderId={activeFolder.id}
                              folderName={activeFolder.name}
                            />
                          </div>
                        )}

                        {/* Quick Tutor Card when in "all" view */}
                        {folderSubTab === 'all' && (
                          <div className="p-4 rounded-xl bg-[#0D0D10] border border-[#D4AF37]/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <div className="p-2.5 rounded-xl bg-[#D4AF37]/15 border border-[#D4AF37]/40 text-[#F5D061]">
                                <GraduationCap className="w-5 h-5" />
                              </div>
                              <div>
                                <h4 className="font-display text-sm font-bold text-[#F5F0E6]">
                                  {tr('مدرسك الذكي لهذا المجلد', 'Smart Tutor for this Folder')}
                                </h4>
                                <p className="text-xs text-[#A8A29E]">
                                  {tr(
                                    'اشرح أي جزئية من كتاب المادة والملخصات داخل هذا المجلد بمستواك الدراسي.',
                                    'Get tailored explanations grounded in this folder’s book and summaries.'
                                  )}
                                </p>
                              </div>
                            </div>
                            <GoldChip
                              active={true}
                              onClick={() => setFolderSubTab('tutor')}
                              className="text-xs px-4 py-2 shrink-0"
                            >
                              <GraduationCap className="w-4 h-4" />
                              <span>{tr('فتح مدرسك الذكي', 'Open Smart Tutor')}</span>
                            </GoldChip>
                          </div>
                        )}

                        {/* 5. Assignments Section ("خانة التكليفات") */}
                        {(folderSubTab === 'all' || folderSubTab === 'assignments') && (
                          <div className="space-y-3 pt-2 border-t border-white/10">
                            <div className="flex items-center justify-between gap-2">
                              <h4 className="font-display text-base font-bold text-[#E5C158] flex items-center gap-2">
                                <ClipboardList className="w-4 h-4" />
                                <span>
                                  {tr('خانة التكليفات (صورة / PDF / نص)', 'Assignments (Image / PDF / Text)')} ({visibleAssignments.length})
                                </span>
                              </h4>
                              {folderSubTab === 'all' && (
                                <GoldChip
                                  onClick={() => setFolderSubTab('assignments')}
                                  className="text-xs px-3 py-1"
                                >
                                  {tr('فتح خانة التكليفات كاملة', 'Focus Assignments')}
                                </GoldChip>
                              )}
                            </div>
                            {renderAssignmentsSection()}
                          </div>
                        )}
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
                                'إنشاء مجلد مخصص مع رفع صورة من الجهاز',
                                'Create Custom Folder with Device Image'
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
                              <div className="flex items-center gap-3 flex-wrap">
                                <label className="flex items-center gap-2.5 px-3.5 py-2 rounded-lg bg-[#151519] border border-dashed border-[#D4AF37]/50 text-xs text-[#E5C158] cursor-pointer hover:bg-[#1C1C22] transition-colors">
                                  <ImagePlus className="w-4 h-4 shrink-0" />
                                  <span className="truncate max-w-[240px]">
                                    {folderCover
                                      ? `${tr('الصورة:', 'Image:')} ${folderCover.name}`
                                      : tr(
                                          'رفع صورة للمجلد من الجهاز',
                                          'Upload Folder Image from Device'
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
                                {folderCoverPreview && (
                                  <img
                                    src={folderCoverPreview}
                                    alt="Preview"
                                    className="h-10 w-16 object-cover rounded-md border border-[#D4AF37]/40"
                                  />
                                )}
                              </div>

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
                                'لا توجد مجلدات مخصصة داخل هذه المادة بعد. يمكنك إنشاء مجلد بصورة من جهازك.',
                                'No custom folders inside this course yet.'
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
                              const folderAssignCount = assignments.filter(
                                (a) => a.folderId === folder.id
                              ).length;
                              const viewsCount = folder.viewsCount ?? 0;
                              const isTrending = Boolean(
                                folder.isTrending || viewsCount > 20
                              );
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
                                        src={resolveApiUrl(folder.coverUrl)}
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

                                    {/* Eye Counter + Trending Badge (>20 views) */}
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span
                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#151519] border border-white/10 text-xs font-mono text-[#E5C158] tabular-nums"
                                        title={tr('عدد الأشخاص الذين دخلوا المجلد', 'Users who entered this folder')}
                                      >
                                        <Eye className="w-3.5 h-3.5" />
                                        <span>{viewsCount}</span>
                                      </span>
                                      {isTrending && (
                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-500/20 border border-amber-400/50 text-xs font-bold text-amber-300">
                                          <Flame className="w-3.5 h-3.5" />
                                          <span>{tr('رائج · الأكثر إقبالاً', 'Trending · Popular')}</span>
                                        </span>
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
                                        {folderSumCount} {tr('ملفات', 'Files')} ·{' '}
                                        {folderQuizCount} {tr('اختبارات', 'Exams')} ·{' '}
                                        {folderAssignCount} {tr('تكليفات', 'Tasks')}
                                      </span>
                                      <GoldChip
                                        active={true}
                                        onClick={() => handleOpenFolderCard(folder.id)}
                                        className="text-xs px-3.5 py-1.5"
                                      >
                                        <FolderOpen className="w-3.5 h-3.5" />
                                        <span>
                                          {tr('فتح المجلد', 'Open Folder')}
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
                  <CourseAiTutorTab
                    course={course}
                    summaries={visibleSummaries}
                    assignments={visibleAssignments}
                    folderId={activeFolder?.id}
                    folderName={activeFolder?.name}
                  />
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
