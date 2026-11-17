import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Eye,
  GraduationCap,
  History,
  Lock,
  Mail,
  Phone,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import type {
  AcademicYear,
  AdminAuditLog,
  AdminUsersResponse,
  AdminUsersStats,
  User,
  UserRole,
} from '../../types';
import { apiRequest, getStoredToken, resolveApiUrl } from '../../utils/api';
import {
  hasAdminPermission,
  hasAnyAdminPermission,
  isSuperAdminUser,
} from '../../utils/permissions';
import { GoldChip } from '../ui/GoldChip';
import { PasswordInput } from '../ui/PasswordInput';
import { RankBadge } from '../ui/RankBadge';
import { AdminUserProfileModal } from './AdminUserProfileModal';

interface AdminUsersPanelProps {
  onUsersChanged: () => void;
}

type ConfirmAction =
  | { type: 'suspend'; user: User; reason: string }
  | { type: 'activate'; user: User }
  | { type: 'delete'; user: User };

export function AdminUsersPanel({ onUsersChanged }: AdminUsersPanelProps) {
  const { user: currentUser } = useAuth();
  const { tr, lang, formatYear } = useLanguage();

  const [users, setUsers] = useState<User[]>([]);
  const [stats, setStats] = useState<AdminUsersStats>({
    totalUsers: 0,
    activeUsers: 0,
    suspendedUsers: 0,
    studentsCount: 0,
    teachersCount: 0,
    adminsCount: 0,
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    totalFiltered: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);

  // Filters, search, sorting
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | UserRole>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended'>('all');
  const [yearFilter, setYearFilter] = useState<number>(0);
  const [sortBy, setSortBy] = useState<
    'createdAt' | 'lastLoginAt' | 'name' | 'points' | 'role' | 'status'
  >('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  // Add Member form
  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [year, setYear] = useState<AcademicYear>(1);
  const [role, setRole] = useState<UserRole>('student');
  const [addingUser, setAddingUser] = useState(false);

  // Feedback banners
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // CSV Export options
  const [includeContactCsv, setIncludeContactCsv] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);

  // Confirmation modal
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);

  // Student Profile, Academic Stats & Admin Notes modal
  const [profileTargetId, setProfileTargetId] = useState<string | null>(null);

  // Audit Log drawer/panel
  const [showAuditLogs, setShowAuditLogs] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AdminAuditLog[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setPage(1);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const buildFilterQuery = useCallback(
    (extra?: Record<string, string | number | boolean>) => {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (roleFilter !== 'all') params.set('role', roleFilter);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (yearFilter > 0) params.set('year', String(yearFilter));
      params.set('sortBy', sortBy);
      params.set('sortDir', sortDir);
      if (extra) {
        for (const [k, v] of Object.entries(extra)) {
          params.set(k, String(v));
        }
      }
      return params.toString();
    },
    [debouncedSearch, roleFilter, statusFilter, yearFilter, sortBy, sortDir]
  );

  const canManageStudents = hasAdminPermission(currentUser, 'manage_students');
  const canAccessDirectory = hasAnyAdminPermission(currentUser, [
    'manage_students',
    'manage_user_notes',
  ]);
  const canViewSensitive = hasAdminPermission(currentUser, 'view_sensitive_data');
  const canCreateAdmin = isSuperAdminUser(currentUser);

  const loadUsers = useCallback(async () => {
    if (!canAccessDirectory) return;
    setLoading(true);
    try {
      const qs = buildFilterQuery({ page, limit });
      const data = await apiRequest<AdminUsersResponse>(`/api/admin/users?${qs}`);
      setUsers(data.users);
      setStats(data.stats);
      setPagination(data.pagination);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : tr('تعذر تحميل قائمة المستخدمين.', 'Failed to load user directory.')
      );
    } finally {
      setLoading(false);
    }
  }, [canAccessDirectory, buildFilterQuery, page, limit, tr]);

  const loadAuditLogs = useCallback(async () => {
    if (!canViewSensitive) return;
    setAuditLoading(true);
    try {
      const res = await apiRequest<{ logs: AdminAuditLog[] }>('/api/admin/audit-logs');
      setAuditLogs(res.logs);
    } catch {
      // Ignore
    } finally {
      setAuditLoading(false);
    }
  }, [canViewSensitive]);

  useEffect(() => {
    if (canAccessDirectory) {
      loadUsers();
    }
  }, [canAccessDirectory, loadUsers]);

  useEffect(() => {
    if (showAuditLogs && canViewSensitive) {
      loadAuditLogs();
    }
  }, [showAuditLogs, canViewSensitive, loadAuditLogs]);

  // Escape handler for confirmation modal
  useEffect(() => {
    if (!confirmAction) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setConfirmAction(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [confirmAction]);

  if (!canAccessDirectory) {
    return null;
  }

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

  const formatDateOnly = (iso?: string) => {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
      });
    } catch {
      return iso.slice(0, 10);
    }
  };

  const roleLabel = (r: UserRole) => {
    if (r === 'admin') return tr('أدمن', 'Admin');
    if (r === 'teacher') return tr('معلم / مدرس', 'Teacher');
    return tr('طالب', 'Student');
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setStatusMsg(null);
    setAddingUser(true);
    try {
      await apiRequest('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({ name, email, phone, password, year, role }),
      });
      setName('');
      setEmail('');
      setPhone('');
      setPassword('');
      setRole('student');
      setShowAddForm(false);
      setStatusMsg(
        tr('تمت إضافة الحساب الجديد وتسجيل العملية في سجل المراجعة.', 'Account created and logged in audit trail.')
      );
      await loadUsers();
      if (showAuditLogs) loadAuditLogs();
      onUsersChanged();
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : tr('تعذر إضافة العضو.', 'Failed to add member.')
      );
    } finally {
      setAddingUser(false);
    }
  };

  const handleViewProfile = (target: User) => {
    setErrorMsg(null);
    setProfileTargetId(target.id);
  };

  const executeConfirmedAction = async () => {
    if (!confirmAction) return;
    const { type, user: target } = confirmAction;
    setErrorMsg(null);
    setStatusMsg(null);
    setBusyId(target.id);
    try {
      if (type === 'activate') {
        await apiRequest(`/api/admin/users/${target.id}/unsuspend`, {
          method: 'POST',
        });
        setStatusMsg(
          tr(
            `تم تفعيل حساب ${target.name} وإلغاء التعليق بنجاح.`,
            `Account for ${target.name} has been activated.`
          )
        );
      } else if (type === 'suspend') {
        await apiRequest(`/api/admin/users/${target.id}/suspend`, {
          method: 'POST',
          body: JSON.stringify({
            reason:
              confirmAction.reason.trim() || 'تجاوز الحدود ومخالفة الشروط والأحكام',
          }),
        });
        setStatusMsg(
          tr(
            `تم تعليق حساب ${target.name} وإنهاء جلساته النشطة.`,
            `Account for ${target.name} was suspended and active sessions revoked.`
          )
        );
      } else if (type === 'delete') {
        await apiRequest(`/api/admin/users/${target.id}`, {
          method: 'DELETE',
        });
        setStatusMsg(
          tr(
            `تم حذف حساب ${target.name} نهائياً مع كافة بياناته وجلساته.`,
            `Account ${target.name} and associated records were permanently deleted.`
          )
        );
      }

      setConfirmAction(null);
      await loadUsers();
      if (showAuditLogs) loadAuditLogs();
      onUsersChanged();
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : tr('تعذر تنفيذ الإجراء الإداري.', 'Administrative action failed.')
      );
      setConfirmAction(null);
    } finally {
      setBusyId(null);
    }
  };

  const handleExportCsv = async () => {
    setExportingCsv(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const qs = buildFilterQuery({ includeContact: includeContactCsv });
      const token = getStoredToken();
      const res = await fetch(resolveApiUrl(`/api/admin/users/export.csv?${qs}`), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || 'CSV export failed');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mvia-users-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setStatusMsg(
        includeContactCsv
          ? tr(
              'تم تصدير ملف CSV بكامل بيانات التواصل (مع استبعاد كلمات المرور وتوثيق العملية في سجل المراجعة).',
              'CSV exported with full contact columns (credentials excluded and action logged).'
            )
          : tr(
              'تم تصدير ملف CSV بنمط الخصوصية (البريد والهاتف مقنّعان، وكلمات المرور مستبعدة كلياً).',
              'Privacy-masked CSV exported (email/phone masked, credentials completely excluded).'
            )
      );
      if (showAuditLogs) loadAuditLogs();
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : tr('تعذر تصدير ملف CSV.', 'Could not export CSV file.')
      );
    } finally {
      setExportingCsv(false);
    }
  };

  const auditActionLabel = (action: AdminAuditLog['action']) => {
    switch (action) {
      case 'user.create':
        return tr('إنشاء حساب', 'User Created');
      case 'user.credentials_update':
        return tr('تعديل بريد / كلمة مرور', 'Credentials Updated');
      case 'user.admin_activated':
        return tr('تفعيل صلاحية أدمن', 'Admin Role Activated');
      case 'user.suspend':
        return tr('تعليق حساب', 'User Suspended');
      case 'user.activate':
        return tr('تفعيل حساب', 'User Activated');
      case 'user.delete':
        return tr('حذف حساب', 'User Deleted');
      case 'user.profile_view':
        return tr('استعراض ملف', 'Profile Viewed');
      case 'user.note_create':
        return tr('كتابة ملاحظة بالملف', 'Profile Note Added');
      case 'user.note_delete':
        return tr('حذف ملاحظة بالملف', 'Profile Note Deleted');
      case 'users.csv_export':
        return tr('تصدير CSV', 'CSV Export');
      case 'rank.update':
        return tr('تعديل رتبة', 'Rank Updated');
      case 'admin.activation_password_update':
        return tr('تحديث كلمة سر تفعيل الأدمن', 'Activation Password Updated');
      case 'official.assign':
        return tr('تعيين مسؤول', 'Official Assigned');
      case 'official.update':
        return tr('تحديث مسؤول', 'Official Updated');
      case 'official.remove':
        return tr('إزالة مسؤول', 'Official Removed');
      case 'support_team.assign':
        return tr('تعيين عضو دعم فني', 'Support Team Assigned');
      case 'support_team.update':
        return tr('تحديث عضو دعم فني', 'Support Team Updated');
      case 'support_team.remove':
        return tr('إزالة عضو دعم فني', 'Support Team Removed');
      default:
        return action;
    }
  };

  const startIndex =
    pagination.totalFiltered === 0
      ? 0
      : (pagination.page - 1) * pagination.limit + 1;
  const endIndex = Math.min(
    pagination.page * pagination.limit,
    pagination.totalFiltered
  );

  return (
    <section
      aria-label={tr('لوحة إدارة المستخدمين', 'Admin User Management Dashboard')}
      className="rounded-2xl bg-[#121216] border border-[#D4AF37]/30 p-4 sm:p-6 space-y-5"
    >
      {/* Header & Top Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[#D4AF37]" />
            <h2 className="font-display text-xl font-bold text-[#E5C158]">
              {tr(
                'لوحة إدارة المستخدمين والصلاحيات (للأدمن فقط)',
                'Admin User Management Dashboard'
              )}
            </h2>
          </div>
          <p className="text-xs text-[#A8A29E]">
            {tr(
              'عرض وإدارة جميع الطلاب والمعلمين والمديرين، مراجعة الملفات والإحصائيات الأكاديمية، التصدير الآمن، وسجل التدقيق الإداري.',
              'Manage registered students, teachers, and administrators, inspect academic profiles, control account access, export CSV securely, and review audit logs.'
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canViewSensitive && (
            <button
              type="button"
              onClick={() => setShowAuditLogs((p) => !p)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                showAuditLogs
                  ? 'bg-[#D4AF37]/15 border-[#D4AF37] text-[#E5C158]'
                  : 'bg-[#151519] border-white/10 text-[#C8C2B8] hover:border-[#D4AF37]/50 hover:text-[#E5C158]'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>{tr('سجل الإجراءات الحساسة', 'Audit Log')}</span>
            </button>
          )}

          {canManageStudents && (
            <GoldChip
              active={showAddForm}
              onClick={() => setShowAddForm((p) => !p)}
              className="text-xs px-3.5 py-2"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>
                {showAddForm
                  ? tr('إغلاق النموذج', 'Close Form')
                  : tr('إضافة حساب جديد', 'Add User')}
              </span>
            </GoldChip>
          )}
        </div>
      </div>

      {/* 4-column Summary KPI Strip (Single elevation) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 rounded-xl bg-[#0D0D10] border border-white/10 divide-y lg:divide-y-0 divide-x divide-x-reverse divide-white/10">
        <div className="p-4">
          <div className="text-xs text-[#A8A29E] flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-[#D4AF37]" />
            <span>{tr('إجمالي المستخدمين المسجلين', 'Total Registered Users')}</span>
          </div>
          <div className="font-mono text-2xl font-bold text-[#E5C158] tabular-nums mt-1">
            {stats.totalUsers}
          </div>
        </div>

        <div className="p-4">
          <div className="text-xs text-[#A8A29E] flex items-center gap-1.5">
            <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>{tr('المستخدمون النشطون', 'Active Users')}</span>
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="font-mono text-2xl font-bold text-emerald-400 tabular-nums">
              {stats.activeUsers}
            </span>
            <span className="text-[11px] font-mono tabular-nums text-amber-300">
              · {stats.suspendedUsers} {tr('معلق', 'suspended')}
            </span>
          </div>
        </div>

        <div className="p-4">
          <div className="text-xs text-[#A8A29E] flex items-center gap-1.5">
            <GraduationCap className="w-3.5 h-3.5 text-sky-400" />
            <span>{tr('الطلاب / المعلمون', 'Students / Teachers')}</span>
          </div>
          <div className="font-mono text-2xl font-bold text-[#F5F0E6] tabular-nums mt-1">
            {stats.studentsCount}{' '}
            <span className="text-sm text-[#A8A29E] font-normal">/</span>{' '}
            <span className="text-sky-300">{stats.teachersCount}</span>
          </div>
        </div>

        <div className="p-4">
          <div className="text-xs text-[#A8A29E] flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-[#D4AF37]" />
            <span>{tr('المديرون المحميون', 'Administrators')}</span>
          </div>
          <div className="font-mono text-2xl font-bold text-[#D4AF37] tabular-nums mt-1">
            {stats.adminsCount}
          </div>
        </div>
      </div>

      {/* Feedback Messages */}
      {statusMsg && (
        <div
          role="status"
          className="p-3 rounded-xl bg-emerald-950/50 border border-emerald-500/40 text-emerald-200 text-xs flex items-center justify-between gap-2"
        >
          <span>{statusMsg}</span>
          <button
            type="button"
            onClick={() => setStatusMsg(null)}
            className="text-emerald-300 hover:text-white cursor-pointer"
            aria-label={tr('إغلاق', 'Dismiss')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {errorMsg && (
        <div
          role="alert"
          className="p-3 rounded-xl bg-red-950/50 border border-red-500/40 text-red-200 text-xs flex items-center justify-between gap-2"
        >
          <span>{errorMsg}</span>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-red-300 hover:text-white cursor-pointer"
            aria-label={tr('إغلاق', 'Dismiss')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Add User Form */}
      {showAddForm && (
        <form
          onSubmit={handleAddUser}
          className="p-4 rounded-xl bg-[#09090B] border border-[#D4AF37]/30 space-y-3"
        >
          <div className="text-xs font-semibold text-[#E5C158]">
            {tr('إنشاء حساب طالب أو معلم أو أدمن', 'Create Student, Teacher, or Admin Account')}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5">
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={tr('الاسم الكامل', 'Full Name')}
              className="px-3 py-2 rounded-lg bg-[#151519] border border-white/10 text-xs text-[#F5F0E6] focus:outline-none focus:border-[#D4AF37]"
            />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={tr('البريد الإلكتروني', 'Email Address')}
              className="px-3 py-2 rounded-lg bg-[#151519] border border-white/10 text-xs text-[#F5F0E6] font-mono focus:outline-none focus:border-[#D4AF37]"
            />
            <input
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={tr('رقم الهاتف', 'Phone Number')}
              className="px-3 py-2 rounded-lg bg-[#151519] border border-white/10 text-xs text-[#F5F0E6] font-mono tabular-nums focus:outline-none focus:border-[#D4AF37]"
            />
            <PasswordInput
              required
              minLength={4}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={tr('كلمة المرور (4+)', 'Password (4+ chars)')}
              className="w-full px-3 py-2 rounded-lg bg-[#151519] border border-white/10 text-xs text-[#F5F0E6] focus:outline-none focus:border-[#D4AF37]"
            />
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value) as AcademicYear)}
              aria-label={tr('الفرقة الدراسية', 'Academic Year')}
              className="px-3 py-2 rounded-lg bg-[#151519] border border-white/10 text-xs text-[#F5F0E6] focus:outline-none focus:border-[#D4AF37]"
            >
              <option value={1}>{formatYear(1)}</option>
              <option value={2}>{formatYear(2)}</option>
              <option value={3}>{formatYear(3)}</option>
              <option value={4}>{formatYear(4)}</option>
            </select>
            <div className="flex items-center gap-2">
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
                aria-label={tr('الصلاحية', 'Role')}
                className="flex-1 px-2.5 py-2 rounded-lg bg-[#151519] border border-white/10 text-xs text-[#F5F0E6] focus:outline-none focus:border-[#D4AF37]"
              >
                <option value="student">{tr('طالب', 'Student')}</option>
                <option value="teacher">{tr('معلم / مدرس', 'Teacher')}</option>
                {canCreateAdmin && <option value="admin">{tr('أدمن', 'Admin')}</option>}
              </select>
              <GoldChip
                type="submit"
                active={true}
                disabled={addingUser}
                className="px-3.5 py-2 text-xs"
              >
                {addingUser ? tr('حفظ...', 'Saving...') : tr('إنشاء', 'Create')}
              </GoldChip>
            </div>
          </div>
        </form>
      )}

      {/* Search, Filter, Sort & CSV Export Toolbar */}
      <div className="p-3.5 rounded-xl bg-[#0D0D10] border border-white/10 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5">
          {/* Search */}
          <div className="md:col-span-4 relative">
            <Search className="w-3.5 h-3.5 text-[#A8A29E] absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none" />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={tr(
                'بحث بالاسم، البريد، الهاتف، أو المعرّف...',
                'Search name, email, phone, or ID...'
              )}
              aria-label={tr('بحث في المستخدمين', 'Search users')}
              className="w-full ps-8 pe-3 py-2 rounded-lg bg-[#151519] border border-white/10 text-xs text-[#F5F0E6] focus:outline-none focus:border-[#D4AF37]"
            />
          </div>

          {/* Role Filter */}
          <div className="md:col-span-2">
            <select
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value as 'all' | UserRole);
                setPage(1);
              }}
              aria-label={tr('تصفية حسب الدور', 'Filter by role')}
              className="w-full px-2.5 py-2 rounded-lg bg-[#151519] border border-white/10 text-xs text-[#F5F0E6] focus:outline-none focus:border-[#D4AF37]"
            >
              <option value="all">{tr('كل الأدوار', 'All Roles')}</option>
              <option value="student">{tr('الطلاب', 'Students')}</option>
              <option value="teacher">{tr('المعلمون', 'Teachers')}</option>
              <option value="admin">{tr('المديرون', 'Admins')}</option>
            </select>
          </div>

          {/* Status Filter */}
          <div className="md:col-span-2">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as 'all' | 'active' | 'suspended');
                setPage(1);
              }}
              aria-label={tr('تصفية حسب الحالة', 'Filter by status')}
              className="w-full px-2.5 py-2 rounded-lg bg-[#151519] border border-white/10 text-xs text-[#F5F0E6] focus:outline-none focus:border-[#D4AF37]"
            >
              <option value="all">{tr('كل الحالات', 'All Statuses')}</option>
              <option value="active">{tr('نشط فقط', 'Active Only')}</option>
              <option value="suspended">{tr('معلق فقط', 'Suspended Only')}</option>
            </select>
          </div>

          {/* Year Filter */}
          <div className="md:col-span-2">
            <select
              value={yearFilter}
              onChange={(e) => {
                setYearFilter(Number(e.target.value));
                setPage(1);
              }}
              aria-label={tr('تصفية حسب الفرقة', 'Filter by year')}
              className="w-full px-2.5 py-2 rounded-lg bg-[#151519] border border-white/10 text-xs text-[#F5F0E6] focus:outline-none focus:border-[#D4AF37]"
            >
              <option value={0}>{tr('كل الدفعات', 'All Years')}</option>
              <option value={1}>{formatYear(1)}</option>
              <option value={2}>{formatYear(2)}</option>
              <option value={3}>{formatYear(3)}</option>
              <option value={4}>{formatYear(4)}</option>
            </select>
          </div>

          {/* Sort By & Direction */}
          <div className="md:col-span-2 flex items-center gap-1.5">
            <select
              value={sortBy}
              onChange={(e) => {
                setSortBy(
                  e.target.value as
                    | 'createdAt'
                    | 'lastLoginAt'
                    | 'name'
                    | 'points'
                    | 'role'
                    | 'status'
                );
                setPage(1);
              }}
              aria-label={tr('ترتيب حسب', 'Sort by')}
              className="flex-1 min-w-0 px-2.5 py-2 rounded-lg bg-[#151519] border border-white/10 text-xs text-[#F5F0E6] focus:outline-none focus:border-[#D4AF37]"
            >
              <option value="createdAt">{tr('تاريخ التسجيل', 'Registration')}</option>
              <option value="lastLoginAt">{tr('آخر دخول', 'Last Login')}</option>
              <option value="name">{tr('الاسم', 'Name')}</option>
              <option value="points">{tr('النقاط', 'Points')}</option>
              <option value="role">{tr('الدور', 'Role')}</option>
              <option value="status">{tr('الحالة', 'Status')}</option>
            </select>
            <button
              type="button"
              onClick={() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}
              title={
                sortDir === 'desc'
                  ? tr('تنازلي (اضغط للتبديل)', 'Descending (click to toggle)')
                  : tr('تصاعدي (اضغط للتبديل)', 'Ascending (click to toggle)')
              }
              className="px-2.5 py-2 rounded-lg bg-[#151519] border border-white/10 text-xs font-mono text-[#E5C158] hover:border-[#D4AF37]/50 cursor-pointer shrink-0"
            >
              {sortDir === 'desc' ? '↓' : '↑'}
            </button>
          </div>
        </div>

        {/* CSV Export + Privacy Control + Refresh */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/10 text-xs">
          <label className="inline-flex items-center gap-2 text-[#C8C2B8] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeContactCsv}
              onChange={(e) => setIncludeContactCsv(e.target.checked)}
              className="rounded border-white/20 bg-[#151519] text-[#D4AF37] focus:ring-[#D4AF37]"
            />
            <span>
              {tr(
                'تضمين البريد والهاتف كاملين في التصدير (الوضع الافتراضي مقنّع للخصوصية — وكلمات المرور مستبعدة دائماً)',
                'Include unmasked email & phone in CSV (privacy-masked by default; credentials never exported)'
              )}
            </span>
          </label>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadUsers}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#151519] border border-white/10 text-xs text-[#C8C2B8] hover:text-[#E5C158] hover:border-[#D4AF37]/40 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>{tr('تحديث', 'Refresh')}</span>
            </button>

            {canViewSensitive && (
              <GoldChip
                active={true}
                disabled={exportingCsv}
                onClick={handleExportCsv}
                className="text-xs px-3.5 py-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>
                  {exportingCsv
                    ? tr('جاري التصدير...', 'Exporting...')
                    : tr('تصدير CSV', 'Export CSV')}
                </span>
              </GoldChip>
            )}
          </div>
        </div>
      </div>

      {/* Audit Log Panel (Collapsible) */}
      {showAuditLogs && (
        <div className="p-4 rounded-xl bg-[#0D0D10] border border-[#D4AF37]/25 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#E5C158]">
              <History className="w-4 h-4" />
              <span>
                {tr(
                  'سجل تدقيق العمليات الإدارية الحساسة',
                  'Sensitive Administrative Actions Audit Log'
                )}
              </span>
            </div>
            <button
              type="button"
              onClick={loadAuditLogs}
              disabled={auditLoading}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#151519] border border-white/10 text-[11px] text-[#C8C2B8] hover:text-[#E5C158] cursor-pointer"
            >
              <RefreshCw className={`w-3 h-3 ${auditLoading ? 'animate-spin' : ''}`} />
              <span>{tr('تحديث السجل', 'Reload')}</span>
            </button>
          </div>

          {auditLoading && auditLogs.length === 0 ? (
            <div className="text-xs text-[#A8A29E] py-4 text-center">
              {tr('جاري تحميل سجل التدقيق...', 'Loading audit log...')}
            </div>
          ) : auditLogs.length === 0 ? (
            <div className="text-xs text-[#A8A29E] py-4 text-center">
              {tr('لم تُسجل عمليات إدارية حساسة بعد.', 'No sensitive administrative actions logged yet.')}
            </div>
          ) : (
            <div className="overflow-x-auto max-h-60 overflow-y-auto">
              <table className="w-full text-start border-collapse text-xs">
                <thead>
                  <tr className="border-b border-white/10 text-[#A8A29E]">
                    <th className="py-2 px-2.5 font-semibold">{tr('الوقت', 'Timestamp')}</th>
                    <th className="py-2 px-2.5 font-semibold">{tr('المنفذ', 'Actor')}</th>
                    <th className="py-2 px-2.5 font-semibold">{tr('الإجراء', 'Action')}</th>
                    <th className="py-2 px-2.5 font-semibold">{tr('الهدف', 'Target')}</th>
                    <th className="py-2 px-2.5 font-semibold">{tr('التفاصيل', 'Details')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-white/[0.02]">
                      <td className="py-2 px-2.5 font-mono tabular-nums text-[11px] text-[#A8A29E] whitespace-nowrap">
                        {formatDateTime(log.createdAt)}
                      </td>
                      <td className="py-2 px-2.5 text-[#F5F0E6] whitespace-nowrap">
                        {log.actorName}
                      </td>
                      <td className="py-2 px-2.5 font-semibold text-[#E5C158] whitespace-nowrap">
                        {auditActionLabel(log.action)}
                      </td>
                      <td className="py-2 px-2.5 text-[#C8C2B8] whitespace-nowrap">
                        {log.targetUserName || '—'}
                      </td>
                      <td className="py-2 px-2.5 text-[#A8A29E]">
                        {log.details || '—'}
                        {log.ip ? (
                          <span className="font-mono text-[10px] text-[#78716C] ms-2">
                            ({log.ip})
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Users Table */}
      <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#0D0D10]">
        <table className="w-full text-start border-collapse">
          <thead>
            <tr className="border-b border-white/10 text-xs text-[#A8A29E] bg-[#09090B]">
              <th className="py-3 px-3 font-semibold">{tr('المستخدم والدور', 'User & Role')}</th>
              <th className="py-3 px-3 font-semibold">{tr('التواصل', 'Contact')}</th>
              <th className="py-3 px-3 font-semibold">{tr('التسجيل', 'Registered')}</th>
              <th className="py-3 px-3 font-semibold">{tr('آخر دخول', 'Last Login')}</th>
              <th className="py-3 px-3 font-semibold">{tr('الحالة', 'Status')}</th>
              <th className="py-3 px-3 font-semibold text-end">{tr('إجراءات الإدارة', 'Actions')}</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-white/5 text-sm">
            {loading ? (
              Array.from({ length: 4 }).map((_, idx) => (
                <tr key={idx} className="animate-pulse">
                  <td className="py-3.5 px-3">
                    <div className="h-4 w-36 rounded bg-white/10" />
                    <div className="h-3 w-24 rounded bg-white/5 mt-1.5" />
                  </td>
                  <td className="py-3.5 px-3">
                    <div className="h-3 w-40 rounded bg-white/10" />
                    <div className="h-3 w-24 rounded bg-white/5 mt-1.5" />
                  </td>
                  <td className="py-3.5 px-3">
                    <div className="h-3 w-20 rounded bg-white/10" />
                  </td>
                  <td className="py-3.5 px-3">
                    <div className="h-3 w-28 rounded bg-white/10" />
                  </td>
                  <td className="py-3.5 px-3">
                    <div className="h-4 w-16 rounded bg-white/10" />
                  </td>
                  <td className="py-3.5 px-3 text-end">
                    <div className="h-7 w-32 rounded bg-white/10 inline-block" />
                  </td>
                </tr>
              ))
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-10 px-4 text-center space-y-3">
                  <p className="text-sm text-[#C8C2B8]">
                    {tr(
                      'لا يوجد مستخدمون مطابقون لمعايير البحث أو التصفية الحالية.',
                      'No users match the current search or filters.'
                    )}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchInput('');
                      setRoleFilter('all');
                      setStatusFilter('all');
                      setYearFilter(0);
                      setPage(1);
                    }}
                    className="px-3.5 py-1.5 rounded-lg bg-[#151519] border border-[#D4AF37]/40 text-xs text-[#E5C158] hover:bg-[#D4AF37] hover:text-[#09090B] transition-colors cursor-pointer"
                  >
                    {tr('إعادة ضبط الفلاتر', 'Reset Filters')}
                  </button>
                </td>
              </tr>
            ) : (
              users.map((u) => {
                const isImmune = u.isProtected || u.role === 'admin';
                return (
                  <tr key={u.id} className="hover:bg-white/[0.02] transition-colors">
                    {/* Name + Role + Academic Year */}
                    <td className="py-3 px-3 align-top">
                      <button
                        type="button"
                        onClick={() => handleViewProfile(u)}
                        className="font-medium text-[#F5F0E6] hover:text-[#E5C158] flex flex-wrap items-center gap-1.5 text-start cursor-pointer transition-colors"
                      >
                        {u.rankBadge ? (
                          <RankBadge rankBadge={u.rankBadge} size="xs" />
                        ) : u.role === 'admin' ? (
                          <ShieldCheck
                            className="w-3.5 h-3.5 text-[#D4AF37] shrink-0"
                            aria-hidden="true"
                          />
                        ) : null}
                        <span className="underline decoration-[#D4AF37]/30 underline-offset-4">
                          {u.name}
                        </span>
                      </button>
                      <div className="text-[11px] text-[#A8A29E] mt-0.5 flex flex-wrap items-center gap-1.5">
                        <span
                          className={`font-semibold ${
                            u.role === 'admin'
                              ? 'text-[#E5C158]'
                              : u.role === 'teacher'
                              ? 'text-sky-300'
                              : 'text-[#C8C2B8]'
                          }`}
                        >
                          {roleLabel(u.role)}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{formatYear(u.year)}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums text-[#E5C158]">
                          {u.points} {tr('نقطة', 'pts')}
                        </span>
                      </div>
                    </td>

                    {/* Contact (Email & Phone) */}
                    <td className="py-3 px-3 align-top text-xs">
                      <div className="font-mono text-[#F5F0E6] flex items-center gap-1.5">
                        <Mail className="w-3 h-3 text-[#A8A29E] shrink-0" />
                        <span>{u.email || '—'}</span>
                      </div>
                      <div className="font-mono tabular-nums text-[#A8A29E] mt-0.5 flex items-center gap-1.5">
                        <Phone className="w-3 h-3 text-[#78716C] shrink-0" />
                        <span>{u.phone || '—'}</span>
                      </div>
                    </td>

                    {/* Registration Date */}
                    <td className="py-3 px-3 align-top font-mono tabular-nums text-xs text-[#C8C2B8] whitespace-nowrap">
                      {formatDateOnly(u.createdAt)}
                    </td>

                    {/* Last Login */}
                    <td className="py-3 px-3 align-top font-mono tabular-nums text-xs text-[#C8C2B8] whitespace-nowrap">
                      {u.lastLoginAt ? (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3 h-3 text-[#D4AF37] shrink-0" />
                          <span>{formatDateTime(u.lastLoginAt)}</span>
                        </span>
                      ) : (
                        <span className="text-[#78716C]">
                          {tr('لم يسجل دخول بعد', 'Never')}
                        </span>
                      )}
                    </td>

                    {/* Account Status */}
                    <td className="py-3 px-3 align-top text-xs whitespace-nowrap">
                      {u.isSuspended ? (
                        <div className="space-y-0.5">
                          <span className="inline-flex items-center gap-1.5 font-semibold text-amber-300">
                            <Ban className="w-3.5 h-3.5 shrink-0" />
                            <span>{tr('معلق', 'Suspended')}</span>
                          </span>
                          {u.suspendedReason && (
                            <div
                              className="text-[11px] text-[#A8A29E] max-w-[160px] truncate"
                              title={u.suspendedReason}
                            >
                              {u.suspendedReason}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 font-medium text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          <span>{tr('نشط', 'Active')}</span>
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-3 align-top text-end">
                      <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleViewProfile(u)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-[#151519] border border-white/15 text-[#F5F0E6] hover:border-[#D4AF37] hover:text-[#E5C158] transition-colors cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>{tr('الملف والملاحظات', 'Profile & Notes')}</span>
                        </button>

                        {!canManageStudents ? null : isImmune ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1.5 text-xs text-[#D4AF37]">
                            <Lock className="w-3.5 h-3.5" />
                            <span>{tr('محمي', 'Protected')}</span>
                          </span>
                        ) : (
                          <>
                            <button
                              type="button"
                              disabled={busyId === u.id}
                              onClick={() =>
                                setConfirmAction(
                                  u.isSuspended
                                    ? { type: 'activate', user: u }
                                    : {
                                        type: 'suspend',
                                        user: u,
                                        reason:
                                          'تجاوز الحدود ومخالفة الشروط والأحكام',
                                      }
                                )
                              }
                              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer disabled:opacity-50 ${
                                u.isSuspended
                                  ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-200 hover:bg-emerald-600 hover:text-white'
                                  : 'bg-amber-950/60 border-amber-500/40 text-amber-200 hover:bg-amber-600 hover:text-white'
                              }`}
                            >
                              {u.isSuspended ? (
                                <>
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>{tr('تفعيل', 'Activate')}</span>
                                </>
                              ) : (
                                <>
                                  <Ban className="w-3.5 h-3.5" />
                                  <span>{tr('تعليق', 'Suspend')}</span>
                                </>
                              )}
                            </button>

                            <button
                              type="button"
                              disabled={busyId === u.id}
                              onClick={() =>
                                setConfirmAction({ type: 'delete', user: u })
                              }
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-red-950/60 border border-red-500/40 text-red-200 hover:bg-red-600 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>{tr('حذف', 'Delete')}</span>
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[#A8A29E]">
        <div className="font-mono tabular-nums">
          {tr('عرض', 'Showing')} {startIndex}–{endIndex} {tr('من', 'of')}{' '}
          {pagination.totalFiltered} {tr('نتيجة', 'matching users')}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-1.5">
            <span>{tr('لكل صفحة:', 'Per page:')}</span>
            <select
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
              className="px-2 py-1 rounded-md bg-[#151519] border border-white/10 text-[#F5F0E6] font-mono text-xs focus:outline-none focus:border-[#D4AF37]"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </label>

          <div className="inline-flex items-center gap-1">
            <button
              type="button"
              disabled={pagination.page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              aria-label={tr('الصفحة السابقة', 'Previous page')}
              className="p-1.5 rounded-md bg-[#151519] border border-white/10 text-[#F5F0E6] hover:border-[#D4AF37] disabled:opacity-40 cursor-pointer"
            >
              <ChevronRight className="w-4 h-4 rtl:rotate-0 ltr:rotate-180" />
            </button>
            <span className="px-2.5 font-mono tabular-nums text-[#F5F0E6]">
              {pagination.page} / {pagination.totalPages}
            </span>
            <button
              type="button"
              disabled={pagination.page >= pagination.totalPages || loading}
              onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
              aria-label={tr('الصفحة التالية', 'Next page')}
              className="p-1.5 rounded-md bg-[#151519] border border-white/10 text-[#F5F0E6] hover:border-[#D4AF37] disabled:opacity-40 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4 rtl:rotate-0 ltr:rotate-180" />
            </button>
          </div>
        </div>
      </div>

      {/* Confirmation Modal (Suspend / Activate / Delete) */}
      {confirmAction && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-confirm-title"
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="w-full max-w-md rounded-2xl bg-[#121216] border border-[#D4AF37]/40 p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <AlertTriangle
                  className={`w-5 h-5 shrink-0 ${
                    confirmAction.type === 'delete'
                      ? 'text-red-400'
                      : confirmAction.type === 'suspend'
                      ? 'text-amber-400'
                      : 'text-emerald-400'
                  }`}
                />
                <h3
                  id="admin-confirm-title"
                  className="font-display text-base font-bold text-[#F5F0E6]"
                >
                  {confirmAction.type === 'delete'
                    ? tr('تأكيد حذف الحساب نهائياً', 'Confirm Permanent Account Deletion')
                    : confirmAction.type === 'suspend'
                    ? tr('تأكيد تعليق الحساب مؤقتاً', 'Confirm Account Suspension')
                    : tr('تأكيد إعادة تفعيل الحساب', 'Confirm Account Activation')}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                aria-label={tr('إغلاق', 'Close')}
                className="text-[#A8A29E] hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 rounded-xl bg-[#09090B] border border-white/10 text-xs space-y-1">
              <div className="font-semibold text-[#F5F0E6]">
                {confirmAction.user.name} ·{' '}
                <span className="text-[#E5C158]">
                  {roleLabel(confirmAction.user.role)}
                </span>
              </div>
              <div className="font-mono text-[#A8A29E]">
                {confirmAction.user.email || confirmAction.user.phone}
              </div>
            </div>

            <p className="text-xs text-[#C8C2B8] leading-relaxed">
              {confirmAction.type === 'delete'
                ? tr(
                    'سيتم حذف هذا الحساب نهائياً مع كافة جلساته وتقدمه الدراسي ونتائج اختباراته. لا يمكن التراجع عن هذا الإجراء.',
                    'This will permanently remove the account, active sessions, learning progress, and quiz submissions. This action cannot be undone.'
                  )
                : confirmAction.type === 'suspend'
                ? tr(
                    'سيتم تعليق الحساب فوراً وإنهاء جميع جلسات الدخول النشطة ولن يتمكن من الدخول إلا بعد إعادة تفعيله من لوحة الأدمن.',
                    'This immediately revokes all active sessions and prevents login until an administrator reactivates the account.'
                  )
                : tr(
                    'سيتم رفع التعليق عن هذا الحساب والسماح لصاحبه بتسجيل الدخول والوصول للمنصة من جديد.',
                    'This lifts the suspension and restores normal sign-in access for this user.'
                  )}
            </p>

            {confirmAction.type === 'suspend' && (
              <div className="space-y-1">
                <label className="block text-xs text-[#C8C2B8]">
                  {tr('سبب التعليق (اختياري)', 'Suspension Reason (Optional)')}
                </label>
                <input
                  type="text"
                  value={confirmAction.reason}
                  onChange={(e) =>
                    setConfirmAction({
                      ...confirmAction,
                      reason: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg bg-[#09090B] border border-white/15 text-xs text-[#F5F0E6] focus:outline-none focus:border-[#D4AF37]"
                />
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                className="px-3.5 py-2 rounded-lg bg-[#151519] border border-white/10 text-xs text-[#C8C2B8] hover:text-white cursor-pointer"
              >
                {tr('إلغاء', 'Cancel')}
              </button>
              <button
                type="button"
                disabled={busyId === confirmAction.user.id}
                onClick={executeConfirmedAction}
                className={`px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer disabled:opacity-50 ${
                  confirmAction.type === 'delete'
                    ? 'bg-red-600 hover:bg-red-500 text-white'
                    : confirmAction.type === 'suspend'
                    ? 'bg-amber-600 hover:bg-amber-500 text-white'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                }`}
              >
                {busyId === confirmAction.user.id
                  ? tr('جاري التنفيذ...', 'Processing...')
                  : confirmAction.type === 'delete'
                  ? tr('تأكيد الحذف النهائي', 'Delete Permanently')
                  : confirmAction.type === 'suspend'
                  ? tr('تأكيد التعليق', 'Suspend Account')
                  : tr('تأكيد التفعيل', 'Activate Account')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* User Profile, Academic Statistics & Admin Notes Modal */}
      <AdminUserProfileModal
        open={Boolean(profileTargetId)}
        targetUserId={profileTargetId}
        onClose={() => setProfileTargetId(null)}
        onNotesChanged={() => {
          if (showAuditLogs && canViewSensitive) {
            loadAuditLogs();
          }
        }}
        onUserUpdated={() => {
          loadUsers();
          if (showAuditLogs && canViewSensitive) {
            loadAuditLogs();
          }
          onUsersChanged();
        }}
      />
    </section>
  );
}
