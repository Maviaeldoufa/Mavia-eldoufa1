import {
  Activity,
  Award,
  BookOpen,
  CheckCircle2,
  Clock,
  FileText,
  KeyRound,
  Mail,
  MessageSquarePlus,
  Send,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import type { AdminUserProfileResponse, User, UserProfileNote, UserRole } from '../../types';
import { apiRequest } from '../../utils/api';
import { isSuperAdminUser } from '../../utils/permissions';
import { PasswordInput } from '../ui/PasswordInput';

interface AdminUserProfileModalProps {
  open: boolean;
  targetUserId: string | null;
  onClose: () => void;
  onNotesChanged?: () => void;
  onUserUpdated?: () => void;
}

export function AdminUserProfileModal({
  open,
  targetUserId,
  onClose,
  onNotesChanged,
  onUserUpdated,
}: AdminUserProfileModalProps) {
  const { user: currentUser, refreshUser } = useAuth();
  const { lang, tr, formatYear } = useLanguage();
  const callerIsSuperAdmin = isSuperAdminUser(currentUser);
  const [profileData, setProfileData] = useState<AdminUserProfileResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [noteContent, setNoteContent] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [noteSuccess, setNoteSuccess] = useState<string | null>(null);

  const [editEmail, setEditEmail] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [savingCreds, setSavingCreds] = useState(false);
  const [credError, setCredError] = useState<string | null>(null);
  const [credSuccess, setCredSuccess] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    if (!open || !targetUserId) return;
    setLoading(true);
    setErrorMsg(null);
    setProfileData(null);
    try {
      const data = await apiRequest<AdminUserProfileResponse>(
        `/api/admin/users/${encodeURIComponent(targetUserId)}/profile`
      );
      setProfileData(data);
      setEditEmail(data.user.email || '');
      setEditPassword('');
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : tr('تعذر تحميل ملف المستخدم.', 'Failed to load user profile.')
      );
    } finally {
      setLoading(false);
    }
  }, [open, targetUserId, tr]);

  useEffect(() => {
    if (open && targetUserId) {
      setNoteContent('');
      setNoteError(null);
      setNoteSuccess(null);
      setCredError(null);
      setCredSuccess(null);
      setEditPassword('');
      loadProfile();
    }
  }, [open, targetUserId, loadProfile]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open || !targetUserId) return null;

  const formatDateTime = (iso?: string) => {
    if (!iso) return tr('لم يسجل دخول بعد', 'Never');
    try {
      return new Date(iso).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-US', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso.slice(0, 16);
    }
  };

  const roleLabel = (r: UserRole) => {
    if (r === 'admin') return tr('أدمن', 'Admin');
    if (r === 'teacher') return tr('معلم / مدرس', 'Teacher');
    return tr('طالب', 'Student');
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = noteContent.trim();
    if (clean.length < 2) return;
    setSavingNote(true);
    setNoteError(null);
    setNoteSuccess(null);
    try {
      const res = await apiRequest<{ note: UserProfileNote }>(
        `/api/admin/users/${encodeURIComponent(targetUserId)}/notes`,
        {
          method: 'POST',
          body: JSON.stringify({ content: clean }),
        }
      );
      setProfileData((prev) =>
        prev
          ? {
              ...prev,
              notes: [res.note, ...(prev.notes || [])],
            }
          : prev
      );
      setNoteContent('');
      setNoteSuccess(
        tr(
          'تمت إضافة الملاحظة إلى بروفايل المستخدم بنجاح (سيتمكن من التفاعل بالرياكت فقط).',
          'Note added to user profile (reaction-only).'
        )
      );
      onNotesChanged?.();
    } catch (err) {
      setNoteError(
        err instanceof Error
          ? err.message
          : tr('تعذر حفظ الملاحظة.', 'Failed to add note.')
      );
    } finally {
      setSavingNote(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    setDeletingNoteId(noteId);
    setNoteError(null);
    try {
      await apiRequest(
        `/api/admin/users/${encodeURIComponent(targetUserId)}/notes/${encodeURIComponent(noteId)}`,
        { method: 'DELETE' }
      );
      setProfileData((prev) =>
        prev
          ? {
              ...prev,
              notes: (prev.notes || []).filter((n) => n.id !== noteId),
            }
          : prev
      );
      onNotesChanged?.();
    } catch (err) {
      setNoteError(
        err instanceof Error
          ? err.message
          : tr('تعذر حذف الملاحظة.', 'Failed to delete note.')
      );
    } finally {
      setDeletingNoteId(null);
    }
  };

  const handleSaveCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!callerIsSuperAdmin || !targetUserId) return;
    setSavingCreds(true);
    setCredError(null);
    setCredSuccess(null);
    try {
      const payload: { email?: string; newPassword?: string } = {};
      if (editEmail.trim() && editEmail.trim().toLowerCase() !== (profileData?.user.email || '').toLowerCase()) {
        payload.email = editEmail.trim();
      }
      if (editPassword.length > 0) {
        payload.newPassword = editPassword;
      }
      if (!payload.email && !payload.newPassword) {
        setCredError(
          tr(
            'عدّل البريد الإلكتروني أو أدخل كلمة مرور جديدة قبل الحفظ.',
            'Modify the email or enter a new password before saving.'
          )
        );
        setSavingCreds(false);
        return;
      }

      const res = await apiRequest<{ user: User }>(
        `/api/admin/users/${encodeURIComponent(targetUserId)}/credentials`,
        {
          method: 'PATCH',
          body: JSON.stringify(payload),
        }
      );
      setProfileData((prev) => (prev ? { ...prev, user: res.user } : prev));
      setEditEmail(res.user.email || '');
      setEditPassword('');
      setCredSuccess(
        tr(
          'تم تحديث البريد الإلكتروني / كلمة المرور بنجاح (حصري للمدير العام).',
          'Email / password updated successfully (Super Admin only).'
        )
      );
      if (targetUserId === currentUser?.id) {
        await refreshUser();
      }
      onUserUpdated?.();
    } catch (err) {
      setCredError(
        err instanceof Error
          ? err.message
          : tr('تعذر تحديث بيانات الدخول.', 'Failed to update credentials.')
      );
    } finally {
      setSavingCreds(false);
    }
  };

  const notes = profileData?.notes || [];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-profile-title"
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div className="w-full max-w-3xl max-h-[88vh] overflow-y-auto rounded-2xl bg-[#121216] border border-[#D4AF37]/40 p-5 sm:p-6 space-y-5 shadow-[0_24px_80px_rgba(0,0,0,0.85)]">
        <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-3">
          <div>
            <h3
              id="admin-profile-title"
              className="font-display text-lg font-bold text-[#E5C158]"
            >
              {tr(
                'بروفايل المستخدم وملاحظات الإدارة',
                'User Profile & Admin Notes'
              )}
            </h3>
            {profileData && (
              <p className="text-xs text-[#A8A29E] mt-0.5">
                {profileData.user.name} · {roleLabel(profileData.user.role)} ·{' '}
                {formatYear(profileData.user.year)}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={tr('إغلاق', 'Close')}
            className="p-1.5 rounded-lg bg-[#151519] border border-white/10 text-[#C8C2B8] hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {loading ? (
          <div className="py-12 text-center text-xs text-[#A8A29E]">
            {tr(
              'جاري تحميل البروفايل والإحصائيات الأكاديمية...',
              'Loading profile and academic statistics...'
            )}
          </div>
        ) : errorMsg ? (
          <div className="p-4 rounded-xl bg-red-950/40 border border-red-500/40 text-xs text-red-200">
            {errorMsg}
          </div>
        ) : profileData ? (
          <div className="space-y-5">
            {/* Identity & Account Details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs p-3.5 rounded-xl bg-[#09090B] border border-white/10">
              <div>
                <div className="text-[#A8A29E]">{tr('البريد الإلكتروني', 'Email')}</div>
                <div className="font-mono text-[#F5F0E6] mt-0.5 break-all">
                  {profileData.user.email || '—'}
                </div>
              </div>
              <div>
                <div className="text-[#A8A29E]">{tr('رقم الهاتف', 'Phone')}</div>
                <div className="font-mono tabular-nums text-[#F5F0E6] mt-0.5">
                  {profileData.user.phone || '—'}
                </div>
              </div>
              <div>
                <div className="text-[#A8A29E]">
                  {tr('حالة الحساب', 'Account Status')}
                </div>
                <div className="mt-0.5 font-medium text-[#F5F0E6]">
                  {profileData.user.isSuspended
                    ? tr('معلق', 'Suspended')
                    : tr('نشط', 'Active')}
                </div>
              </div>
              <div>
                <div className="text-[#A8A29E]">{tr('تاريخ التسجيل', 'Registered At')}</div>
                <div className="font-mono tabular-nums text-[#C8C2B8] mt-0.5">
                  {formatDateTime(profileData.user.createdAt)}
                </div>
              </div>
              <div>
                <div className="text-[#A8A29E]">{tr('آخر تسجيل دخول', 'Last Login')}</div>
                <div className="font-mono tabular-nums text-[#C8C2B8] mt-0.5">
                  {formatDateTime(profileData.user.lastLoginAt)}
                </div>
              </div>
              <div>
                <div className="text-[#A8A29E]">{tr('معرّف المستخدم', 'User ID')}</div>
                <div className="font-mono text-[11px] text-[#78716C] mt-0.5 truncate">
                  {profileData.user.id}
                </div>
              </div>
            </div>

            {/* Super Admin ONLY: Edit Email & Password */}
            {callerIsSuperAdmin && (
              <form
                onSubmit={handleSaveCredentials}
                className="p-4 rounded-xl bg-[#0D0D10] border border-[#D4AF37]/40 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-[#D4AF37]" />
                    <h4 className="font-display text-sm font-bold text-[#E5C158]">
                      {tr(
                        'تعديل البريد الإلكتروني وكلمة المرور (حصري لك كمدير عام)',
                        'Edit Email & Password (Super Admin Only)'
                      )}
                    </h4>
                  </div>
                  <span className="text-[11px] text-[#A8A29E]">
                    {tr('غير متاح لباقي الأدمنز أو الطلاب', 'Blocked for sub-admins & students')}
                  </span>
                </div>

                {credError && (
                  <div className="p-2.5 rounded-lg bg-red-950/40 border border-red-500/40 text-xs text-red-200">
                    {credError}
                  </div>
                )}
                {credSuccess && (
                  <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-500/40 text-xs text-emerald-200">
                    {credSuccess}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs text-[#C8C2B8] block">
                      {tr('البريد الإلكتروني الجديد', 'Updated Email Address')}
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-[#A8A29E] absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="email"
                        value={editEmail}
                        onChange={(e) => setEditEmail(e.target.value)}
                        placeholder="user@example.com"
                        className="w-full ps-9 pe-3 py-2 rounded-xl bg-[#151519] border border-white/15 text-xs sm:text-sm text-[#F5F0E6] font-mono focus:outline-none focus:border-[#D4AF37]"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-[#C8C2B8] block">
                      {tr('كلمة المرور الجديدة (اتركها فارغة للإبقاء)', 'New Password (optional)')}
                    </label>
                    <PasswordInput
                      value={editPassword}
                      onChange={(e) => setEditPassword(e.target.value)}
                      placeholder={tr('كلمة المرور الجديدة (4+ أحرف)', 'New password (4+ chars)')}
                      className="w-full px-3 py-2 rounded-xl bg-[#151519] border border-white/15 text-xs sm:text-sm text-[#F5F0E6] focus:outline-none focus:border-[#D4AF37]"
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={savingCreds}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#D4AF37] text-[#09090B] text-xs font-bold hover:bg-[#E5C158] disabled:opacity-50 cursor-pointer"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>
                      {savingCreds
                        ? tr('جاري التحديث...', 'Updating...')
                        : tr('حفظ بيانات الدخول', 'Save Credentials')}
                    </span>
                  </button>
                </div>
              </form>
            )}

            {/* Admin Notes Section (Write + Track User Emoji Reactions) */}
            <div className="p-4 rounded-xl bg-[#0D0D10] border border-[#D4AF37]/35 space-y-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <MessageSquarePlus className="w-4 h-4 text-[#D4AF37]" />
                  <h4 className="font-display text-sm font-bold text-[#E5C158]">
                    {tr(
                      'كتابة ملاحظات على بروفايل المستخدم',
                      'Admin Profile Notes'
                    )}
                  </h4>
                </div>
                <span className="text-[11px] text-[#A8A29E]">
                  {tr(
                    'المستخدم يرى الملاحظة ويتفاعل بالرياكت فقط',
                    'Recipient can react with emojis only'
                  )}
                </span>
              </div>

              <form onSubmit={handleAddNote} className="space-y-2.5">
                {noteError && (
                  <div className="p-2.5 rounded-lg bg-red-950/40 border border-red-500/40 text-xs text-red-200">
                    {noteError}
                  </div>
                )}
                {noteSuccess && (
                  <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-500/40 text-xs text-emerald-200">
                    {noteSuccess}
                  </div>
                )}

                <textarea
                  rows={2}
                  required
                  maxLength={600}
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  placeholder={tr(
                    `اكتب ملاحظة خاصة لـ ${profileData.user.name}...`,
                    `Write a note for ${profileData.user.name}...`
                  )}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#151519] border border-white/15 text-xs sm:text-sm text-[#F5F0E6] focus:outline-none focus:border-[#D4AF37]"
                />
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-mono text-[#A8A29E] tabular-nums">
                    {noteContent.length} / 600
                  </span>
                  <button
                    type="submit"
                    disabled={savingNote || noteContent.trim().length < 2}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#D4AF37] text-[#09090B] text-xs font-bold hover:bg-[#E5C158] disabled:opacity-50 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>
                      {savingNote
                        ? tr('جاري الإرسال...', 'Saving...')
                        : tr('إضافة ملاحظة للبروفايل', 'Post Note to Profile')}
                    </span>
                  </button>
                </div>
              </form>

              {notes.length === 0 ? (
                <p className="text-xs text-[#A8A29E] pt-1">
                  {tr(
                    'لم تُكتب ملاحظات على هذا البروفايل بعد.',
                    'No notes written for this user yet.'
                  )}
                </p>
              ) : (
                <div className="space-y-2.5 pt-2 border-t border-white/10">
                  {notes.map((n) => (
                    <div
                      key={n.id}
                      className="p-3 rounded-xl bg-[#141418] border border-white/10 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="inline-flex items-center gap-1.5 font-semibold text-[#E5C158]">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>{n.authorName}</span>
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono tabular-nums text-[#A8A29E]">
                            {formatDateTime(n.createdAt)}
                          </span>
                          <button
                            type="button"
                            disabled={deletingNoteId === n.id}
                            onClick={() => handleDeleteNote(n.id)}
                            aria-label={tr('حذف الملاحظة', 'Delete note')}
                            className="p-1 rounded-md text-[#A8A29E] hover:text-red-300 hover:bg-red-950/40 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <p className="text-xs sm:text-sm text-[#F5F0E6] leading-relaxed whitespace-pre-wrap">
                        {n.content}
                      </p>
                      <div className="text-[11px] flex items-center gap-2">
                        {n.reactions && n.reactions.length > 0 ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#D4AF37]/15 border border-[#D4AF37]/40 text-[#FFF1B8]">
                            <span>{n.reactions.map((r) => r.emoji).join(' ')}</span>
                            <span>
                              {tr('تفاعل صاحب الحساب', 'User reacted')}
                            </span>
                          </span>
                        ) : (
                          <span className="text-[#78716C]">
                            {tr('بانتظار تفاعل المستخدم بالرياكت', 'Awaiting user reaction')}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Academic Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs">
              <div className="p-3 rounded-xl bg-[#0D0D10] border border-white/10">
                <div className="text-[#A8A29E] flex items-center gap-1">
                  <Award className="w-3.5 h-3.5 text-[#D4AF37]" />
                  <span>{tr('النقاط', 'Points')}</span>
                </div>
                <div className="font-mono text-lg font-bold text-[#E5C158] tabular-nums mt-1">
                  {profileData.academicStats.points}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-[#0D0D10] border border-white/10">
                <div className="text-[#A8A29E] flex items-center gap-1">
                  <Activity className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{tr('متوسط الدرجات', 'Avg Score')}</span>
                </div>
                <div className="font-mono text-lg font-bold text-emerald-400 tabular-nums mt-1">
                  {profileData.academicStats.avgQuizScorePercent}%
                </div>
              </div>

              <div className="p-3 rounded-xl bg-[#0D0D10] border border-white/10">
                <div className="text-[#A8A29E] flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5 text-sky-400" />
                  <span>{tr('الاختبارات', 'Quizzes')}</span>
                </div>
                <div className="font-mono text-lg font-bold text-[#F5F0E6] tabular-nums mt-1">
                  {profileData.academicStats.quizzesCompleted}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-[#0D0D10] border border-white/10">
                <div className="text-[#A8A29E] flex items-center gap-1">
                  <BookOpen className="w-3.5 h-3.5 text-[#D4AF37]" />
                  <span>{tr('مواد / ملخصات', 'Courses / PDFs')}</span>
                </div>
                <div className="font-mono text-lg font-bold text-[#F5F0E6] tabular-nums mt-1">
                  {profileData.academicStats.enrolledCoursesCount} /{' '}
                  {profileData.academicStats.completedSummariesCount}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-[#0D0D10] border border-white/10">
                <div className="text-[#A8A29E] flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-amber-300" />
                  <span>{tr('دقائق المذاكرة', 'Study Mins')}</span>
                </div>
                <div className="font-mono text-lg font-bold text-amber-200 tabular-nums mt-1">
                  {profileData.academicStats.studyMinutes}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-[#0D0D10] border border-white/10">
                <div className="text-[#A8A29E] flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{tr('المهام / GPA', 'Tasks / GPA')}</span>
                </div>
                <div className="font-mono text-lg font-bold text-[#F5F0E6] tabular-nums mt-1">
                  {profileData.academicStats.tasksCompleted}/
                  {profileData.academicStats.tasksTotal} ·{' '}
                  {profileData.academicStats.gpaEntriesCount}
                </div>
              </div>
            </div>

            {/* Enrolled Courses */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-[#E5C158]">
                {tr('المواد المسجل بها', 'Enrolled Courses')} (
                {profileData.academicStats.enrolledCourses.length})
              </div>
              {profileData.academicStats.enrolledCourses.length === 0 ? (
                <p className="text-xs text-[#A8A29E]">
                  {tr('لم يسجل في مواد بعد.', 'No enrolled courses recorded yet.')}
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {profileData.academicStats.enrolledCourses.map((c) => (
                    <div
                      key={c.id}
                      className="px-3 py-2 rounded-lg bg-[#09090B] border border-white/10 flex items-center justify-between gap-2"
                    >
                      <span className="text-[#F5F0E6] truncate">{c.title}</span>
                      <span className="font-mono text-[11px] text-[#D4AF37] shrink-0">
                        {c.code}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent Quiz Submissions */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-[#E5C158]">
                {tr('أحدث نتائج الاختبارات', 'Recent Quiz Submissions')}
              </div>
              {profileData.recentSubmissions.length === 0 ? (
                <p className="text-xs text-[#A8A29E]">
                  {tr('لا توجد محاولات اختبار مسجلة حتى الآن.', 'No quiz attempts recorded yet.')}
                </p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#09090B]">
                  <table className="w-full text-start border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-white/10 text-[#A8A29E]">
                        <th className="py-2 px-3">{tr('الاختبار', 'Quiz')}</th>
                        <th className="py-2 px-3">{tr('المادة', 'Course')}</th>
                        <th className="py-2 px-3 text-center">{tr('الصحيحة', 'Correct')}</th>
                        <th className="py-2 px-3 text-end">{tr('الدرجة', 'Score')}</th>
                        <th className="py-2 px-3 text-end">{tr('التاريخ', 'Date')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {profileData.recentSubmissions.map((sub) => (
                        <tr key={sub.id}>
                          <td className="py-2 px-3 text-[#F5F0E6]">{sub.quizTitle}</td>
                          <td className="py-2 px-3 text-[#A8A29E]">{sub.courseTitle}</td>
                          <td className="py-2 px-3 text-center font-mono tabular-nums text-[#C8C2B8]">
                            {sub.correctCount}/{sub.totalQuestions}
                          </td>
                          <td className="py-2 px-3 text-end font-mono tabular-nums font-semibold text-[#E5C158]">
                            {sub.score}/{sub.maxScore}
                          </td>
                          <td className="py-2 px-3 text-end font-mono tabular-nums text-[#A8A29E] whitespace-nowrap">
                            {formatDateTime(sub.submittedAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
