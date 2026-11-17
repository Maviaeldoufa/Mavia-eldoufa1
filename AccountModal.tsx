import {
  CheckCircle2,
  Download,
  KeyRound,
  Lock,
  Mail,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserCog,
  X,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import type { AcademicYear, User } from '../../types';
import { apiRequest, getStoredToken } from '../../utils/api';
import { GoldChip } from './GoldChip';
import { PasswordInput } from './PasswordInput';
import { UserAdminNotesCard } from './UserAdminNotesCard';

interface AccountModalProps {
  open: boolean;
  onClose: () => void;
}

export function AccountModal({ open, onClose }: AccountModalProps) {
  const { user, setUserDirect, logout } = useAuth();
  const { tr, formatYear } = useLanguage();

  const [name, setName] = useState('');
  const [year, setYear] = useState<AcademicYear>(1);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [profileErr, setProfileErr] = useState<string | null>(null);

  const [activationPassword, setActivationPassword] = useState('');
  const [activatingAdmin, setActivatingAdmin] = useState(false);
  const [activationMsg, setActivationMsg] = useState<string | null>(null);
  const [activationErr, setActivationErr] = useState<string | null>(null);

  const [sendingEmail, setSendingEmail] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [emailNotice, setEmailNotice] = useState<string | null>(null);
  const [emailRequiresConfig, setEmailRequiresConfig] = useState(false);
  const [emailErr, setEmailErr] = useState<string | null>(null);

  const [exporting, setExporting] = useState(false);

  const [deletePassword, setDeletePassword] = useState('');
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);

  useEffect(() => {
    if (open && user) {
      setName(user.name);
      setYear(user.year);
      setProfileMsg(null);
      setProfileErr(null);
      setActivationPassword('');
      setActivationMsg(null);
      setActivationErr(null);
      setEmailNotice(null);
      setEmailErr(null);
      setEmailRequiresConfig(false);
      setDeletePassword('');
      setDeleteErr(null);
      setConfirmDeleteOpen(false);

      if (!user.emailVerified) {
        fetch('/api/status')
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            if (data?.services && data.services.emailConfigured === false) {
              setEmailRequiresConfig(true);
            }
          })
          .catch(() => {});
      }
    }
  }, [open, user?.id]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open || !user) return null;

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileMsg(null);
    setProfileErr(null);
    try {
      const res = await apiRequest<{ user: User }>('/api/account/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          name: name.trim(),
          year,
        }),
      });
      setUserDirect(res.user);
      setProfileMsg(tr('تم تحديث بيانات حسابك بنجاح.', 'Profile updated successfully.'));
    } catch (err) {
      setProfileErr(
        err instanceof Error
          ? err.message
          : tr('تعذر تحديث البيانات.', 'Failed to update profile.')
      );
    } finally {
      setSavingProfile(false);
    }
  };

  const handleActivateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activationPassword.trim()) return;
    setActivatingAdmin(true);
    setActivationMsg(null);
    setActivationErr(null);
    try {
      const res = await apiRequest<{ user: User; message?: string }>(
        '/api/account/activate-admin',
        {
          method: 'POST',
          body: JSON.stringify({ password: activationPassword.trim() }),
        }
      );
      setUserDirect(res.user);
      setActivationPassword('');
      setActivationMsg(
        res.message ||
          tr('تم تفعيل صلاحية الأدمن لحسابك بنجاح!', 'Admin privilege activated for your account!')
      );
    } catch (err) {
      setActivationErr(
        err instanceof Error
          ? err.message
          : tr('تعذر تفعيل صلاحية الأدمن.', 'Failed to activate admin privilege.')
      );
    } finally {
      setActivatingAdmin(false);
    }
  };

  const handleSendVerification = async () => {
    setSendingEmail(true);
    setEmailNotice(null);
    setEmailErr(null);
    setEmailRequiresConfig(false);
    try {
      const res = await apiRequest<{
        sent: boolean;
        alreadyVerified?: boolean;
        requiresConfig?: boolean;
        message: string;
      }>('/api/auth/send-verification', { method: 'POST' });
      setEmailNotice(res.message);
      setEmailRequiresConfig(Boolean(res.requiresConfig));
    } catch (err) {
      setEmailErr(
        err instanceof Error
          ? err.message
          : tr('تعذر إرسال كود التأكيد.', 'Failed to send verification code.')
      );
    } finally {
      setSendingEmail(false);
    }
  };

  const handleVerifyEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode.trim()) return;
    setVerifyingCode(true);
    setEmailNotice(null);
    setEmailErr(null);
    try {
      const res = await apiRequest<{ user: User }>('/api/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({ code: otpCode.trim() }),
      });
      setUserDirect(res.user);
      setOtpCode('');
      setEmailNotice(tr('تم تأكيد بريدك الإلكتروني بنجاح!', 'Email verified!'));
    } catch (err) {
      setEmailErr(
        err instanceof Error
          ? err.message
          : tr('كود التحقق غير صحيح.', 'Invalid verification code.')
      );
    } finally {
      setVerifyingCode(false);
    }
  };

  const handleExportData = async () => {
    setExporting(true);
    try {
      const token = getStoredToken();
      const res = await fetch('/api/account/export', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `mvia-personal-data-${user.id}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setProfileErr(tr('تعذر تصدير البيانات الشخصية.', 'Failed to export personal data.'));
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeleting(true);
    setDeleteErr(null);
    try {
      await apiRequest('/api/account', {
        method: 'DELETE',
        body: JSON.stringify({ password: deletePassword }),
      });
      onClose();
      await logout();
    } catch (err) {
      setDeleteErr(
        err instanceof Error
          ? err.message
          : tr('تعذر حذف الحساب.', 'Failed to delete account.')
      );
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={tr('حسابي وإدارة البيانات الشخصية', 'My Account & Personal Data Management')}
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4"
    >
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-[#121216] border border-[#D4AF37]/40 p-5 sm:p-6 space-y-6 shadow-[0_24px_80px_rgba(0,0,0,0.85)]">
        <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-[#D4AF37]/15 border border-[#D4AF37]/40 text-[#E5C158]">
              <UserCog className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-display text-lg font-bold text-[#E5C158]">
                {tr('حسابي وإدارة البيانات الشخصية', 'Account & Personal Data')}
              </h2>
              <p className="text-xs text-[#A8A29E] truncate max-w-[320px]">
                {user.email || user.phone} · {formatYear(user.year)}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={tr('إغلاق', 'Close')}
            className="p-2 rounded-lg bg-[#18181D] border border-white/10 text-[#C8C2B8] hover:text-[#F5D061] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 1. Profile Form (Name & Year only; Email & Password Locked after Registration) */}
        <form onSubmit={handleSaveProfile} className="space-y-4">
          <h3 className="font-display text-sm font-bold text-[#F5F0E6] flex items-center gap-2">
            <UserCog className="w-4 h-4 text-[#D4AF37]" />
            <span>{tr('تعديل البيانات الشخصية', 'Edit Personal Details')}</span>
          </h3>

          {profileErr && (
            <div className="p-3 rounded-xl bg-red-950/40 border border-red-500/40 text-xs text-red-200">
              {profileErr}
            </div>
          )}
          {profileMsg && (
            <div className="p-3 rounded-xl bg-emerald-950/35 border border-emerald-500/40 text-xs text-emerald-200">
              {profileMsg}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-xs text-[#C8C2B8]">
                {tr('الاسم بالكامل', 'Full Name')}
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#09090B] border border-white/10 text-sm text-[#F5F0E6] focus:outline-none focus:border-[#D4AF37]"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs text-[#C8C2B8]">
                {tr('الفرقة الدراسية', 'Academic Year')}
              </label>
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value) as AcademicYear)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#09090B] border border-white/10 text-sm text-[#F5F0E6] focus:outline-none focus:border-[#D4AF37]"
              >
                <option value={1}>{formatYear(1)}</option>
                <option value={2}>{formatYear(2)}</option>
                <option value={3}>{formatYear(3)}</option>
                <option value={4}>{formatYear(4)}</option>
              </select>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-[#0D0D10] border border-white/10 space-y-2">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 font-semibold text-[#C8C2B8]">
                <Lock className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>{tr('البريد الإلكتروني وكلمة المرور', 'Email & Password')}</span>
              </span>
              <span className="font-mono text-[11px] text-[#E5C158] truncate max-w-[230px]">
                {user.email || '—'}
              </span>
            </div>
            <p className="text-[11px] text-[#A8A29E] leading-relaxed">
              {user.isSuperAdmin
                ? tr(
                    'بصفتك المدير العام للمنصة، يمكنك تعديل البريد الإلكتروني وكلمة المرور لأي حساب من خلال ملف المستخدم في لوحة إدارة المستخدمين.',
                    'As Platform Super Admin, you can update email & password for any user from their profile inside the Admin User Directory.'
                  )
                : tr(
                    'البريد الإلكتروني وكلمة المرور مقفلان بعد التسجيل ولا يمكن تعديلهما ذاتياً. عند الحاجة يرجى التواصل مع مدير المنصة العام.',
                    'Email and password are locked after registration and cannot be self-edited. Contact the Platform Super Admin if a change is required.'
                  )}
            </p>
          </div>

          <div className="flex justify-end">
            <GoldChip type="submit" active={true} disabled={savingProfile} className="text-xs px-4 py-2">
              {savingProfile ? tr('جاري الحفظ...', 'Saving...') : tr('حفظ الاسم والفرقة', 'Save Name & Year')}
            </GoldChip>
          </div>
        </form>

        {/* 1.5 Activate Admin Privilege via Admin-Defined Custom Password */}
        {!user.isSuperAdmin && (
          <form
            onSubmit={handleActivateAdmin}
            className="p-4 rounded-xl bg-[#0D0D10] border border-[#D4AF37]/30 space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#D4AF37]" />
                <span className="font-display text-sm font-bold text-[#E5C158]">
                  {tr('تفعيل صلاحية الأدمن بكلمة السر', 'Activate Admin Privilege')}
                </span>
              </div>
              {user.role === 'admin' && (
                <span className="text-[11px] font-semibold text-emerald-300">
                  {tr('حسابك يملك صلاحية أدمن حالياً', 'Admin Role Active')}
                </span>
              )}
            </div>
            <p className="text-xs text-[#A8A29E]">
              {tr(
                'إذا حصلت على كلمة سر تفعيل الأدمن من مدير المنصة العام، اكتبها هنا لتفعيل صلاحية الأدمن على حسابك.',
                'If the Super Admin provided you with the admin activation password, enter it here to unlock admin access.'
              )}
            </p>
            {activationErr && (
              <div className="p-2.5 rounded-lg bg-red-950/40 border border-red-500/40 text-xs text-red-200">
                {activationErr}
              </div>
            )}
            {activationMsg && (
              <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-500/40 text-xs text-emerald-200">
                {activationMsg}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <PasswordInput
                value={activationPassword}
                onChange={(e) => setActivationPassword(e.target.value)}
                placeholder={tr('أدخل كلمة سر تفعيل الأدمن', 'Enter admin activation password')}
                startIcon={<KeyRound className="w-4 h-4 text-[#D4AF37]" />}
                wrapperClassName="flex-1 min-w-[210px]"
                className="w-full py-2 rounded-lg bg-[#09090B] border border-[#D4AF37]/35 text-xs text-[#F5F0E6] font-mono focus:outline-none focus:border-[#E5C158]"
              />
              <GoldChip
                type="submit"
                active={true}
                disabled={activatingAdmin || !activationPassword.trim()}
                className="text-xs px-4 py-2 shrink-0"
              >
                {activatingAdmin
                  ? tr('جاري التفعيل...', 'Activating...')
                  : tr('تفعيل الصلاحية', 'Activate Admin')}
              </GoldChip>
            </div>
          </form>
        )}

        {/* 2. Email Verification */}
        <div className="p-4 rounded-xl bg-[#0D0D10] border border-white/10 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-[#D4AF37]" />
              <span className="font-display text-sm font-bold text-[#F5F0E6]">
                {tr('توثيق البريد الإلكتروني', 'Email Verification')}
              </span>
            </div>
            {user.emailVerified ? (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{tr('البريد موثق', 'Verified')}</span>
              </span>
            ) : (
              <span className="text-xs text-amber-300">
                {tr('غير موثق بعد', 'Not Verified Yet')}
              </span>
            )}
          </div>

          {!user.emailVerified && emailRequiresConfig ? (
            <div className="p-3 rounded-lg bg-[#151519] border border-white/10 text-xs text-[#C8C2B8]">
              {emailNotice ||
                tr(
                  'إرسال رسائل التحقق بالبريد الإلكتروني معطّل مؤقتاً لعدم اكتمال إعداد مزود البريد (RESEND_API_KEY / EMAIL_FROM)، وتعمل جميع مزايا المنصة بشكل طبيعي.',
                  'Email verification delivery is temporarily disabled while sender email configuration is incomplete. All other platform features remain active.'
                )}
            </div>
          ) : !user.emailVerified ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <GoldChip
                  onClick={handleSendVerification}
                  disabled={sendingEmail}
                  className="text-xs px-3 py-1.5"
                >
                  {sendingEmail
                    ? tr('جاري الإرسال...', 'Sending...')
                    : tr('إرسال كود التأكيد لبريدي', 'Send Verification Code')}
                </GoldChip>
              </div>

              {emailNotice && (
                <div className="p-3 rounded-lg text-xs border bg-emerald-950/30 border-emerald-500/35 text-emerald-200">
                  {emailNotice}
                </div>
              )}

              {emailErr && (
                <div className="p-3 rounded-lg bg-red-950/40 border border-red-500/40 text-xs text-red-200">
                  {emailErr}
                </div>
              )}

              <form onSubmit={handleVerifyEmail} className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  placeholder={tr('أدخل الكود المكون من 6 أرقام', 'Enter 6-digit code')}
                  className="px-3 py-2 rounded-lg bg-[#09090B] border border-white/10 text-xs text-[#F5F0E6] font-mono focus:outline-none focus:border-[#D4AF37]"
                />
                <GoldChip type="submit" active={true} disabled={verifyingCode} className="text-xs px-3 py-1.5">
                  {verifyingCode ? tr('جاري التحقق...', 'Verifying...') : tr('تأكيد الكود', 'Verify')}
                </GoldChip>
              </form>
            </>
          ) : null}
        </div>

        {/* 2.5 Admin Profile Notes (Reaction-Only) */}
        <UserAdminNotesCard />

        {/* 3. Personal Data Export & Account Deletion */}
        <div className="p-4 rounded-xl bg-[#0D0D10] border border-white/10 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-sm font-bold text-[#F5F0E6]">
                {tr('تصدير نسختك من البيانات الشخصية', 'Export Personal Data')}
              </h3>
              <p className="text-xs text-[#A8A29E]">
                {tr(
                  'تحميل ملف JSON يحتوي على ملفك الشخصي ونتائج اختباراتك وحاسبة الـ GPA وتقدمك.',
                  'Download a JSON file containing your profile, quiz history, GPA table, and progress.'
                )}
              </p>
            </div>
            <GoldChip onClick={handleExportData} disabled={exporting} className="text-xs px-3 py-2 shrink-0">
              <Download className="w-3.5 h-3.5" />
              <span>{exporting ? tr('جاري التجهيز...', 'Exporting...') : tr('تحميل بياناتي (JSON)', 'Download Data')}</span>
            </GoldChip>
          </div>

          <div className="border-t border-white/10 pt-4 space-y-3">
            {user.role === 'admin' || user.isProtected ? (
              <div className="flex items-center gap-2 text-xs text-[#A8A29E]">
                <ShieldAlert className="w-4 h-4 text-[#D4AF37] shrink-0" />
                <span>
                  {tr(
                    'حساب الأدمن المحمي لا يمكن حذفه ذاتياً لضمان استمرار إدارة المنصة.',
                    'Protected admin accounts cannot be self-deleted.'
                  )}
                </span>
              </div>
            ) : !confirmDeleteOpen ? (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <p className="text-xs text-red-200/80">
                  {tr(
                    'حذف حسابك نهائياً سيمسح جميع بياناتك الشخصية وتقدمك الدراسي ولا يمكن التراجع عنه.',
                    'Permanently deleting your account erases all personal data and cannot be undone.'
                  )}
                </p>
                <button
                  type="button"
                  onClick={() => setConfirmDeleteOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-red-950/50 border border-red-500/40 text-red-200 hover:bg-red-600 hover:text-white cursor-pointer shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{tr('حذف حسابي نهائياً', 'Delete My Account')}</span>
                </button>
              </div>
            ) : (
              <form onSubmit={handleDeleteAccount} className="p-3 rounded-xl bg-red-950/25 border border-red-500/40 space-y-3">
                <p className="text-xs font-semibold text-red-200">
                  {tr(
                    'أدخل كلمة المرور لتأكيد حذف الحساب وبياناتك الشخصية نهائياً:',
                    'Enter your password to permanently delete your account:'
                  )}
                </p>
                {deleteErr && (
                  <p className="text-xs text-red-300">{deleteErr}</p>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <PasswordInput
                    required
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    placeholder={tr('كلمة المرور', 'Password')}
                    wrapperClassName="flex-1 min-w-[180px]"
                    className="w-full px-3 py-2 rounded-lg bg-[#09090B] border border-red-500/40 text-xs text-[#F5F0E6] focus:outline-none focus:border-red-400"
                  />
                  <button
                    type="submit"
                    disabled={deleting}
                    className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-red-600 text-white hover:bg-red-500 cursor-pointer disabled:opacity-50"
                  >
                    {deleting ? tr('جاري الحذف...', 'Deleting...') : tr('تأكيد الحذف النهائي', 'Confirm Permanent Delete')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteOpen(false)}
                    className="px-3 py-2 rounded-lg text-xs text-[#C8C2B8] hover:text-white cursor-pointer"
                  >
                    {tr('إلغاء', 'Cancel')}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
