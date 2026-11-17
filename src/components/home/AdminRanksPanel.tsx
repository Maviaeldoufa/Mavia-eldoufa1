import {
  ArrowRightLeft,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  Headset,
  KeyRound,
  Lock,
  MessageCircle,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Shield,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import type {
  AdminOfficial,
  AdminPermissionKey,
  AdminPermissionMeta,
  AdminRank,
  AdminRankCandidateUser,
  AdminRankColor,
  AdminRankIcon,
  AdminRanksDirectoryResponse,
  SupportTeamMember,
} from '../../types';
import { apiRequest } from '../../utils/api';
import {
  hasAdminPermission,
  hasAnyAdminPermission,
  isSuperAdminUser,
} from '../../utils/permissions';
import { GoldChip } from '../ui/GoldChip';
import { PasswordInput } from '../ui/PasswordInput';
import { RankIconGlyph, getRankIconBoxClass } from '../ui/RankBadge';
import { WhatsAppMark } from '../ui/WhatsAppMark';

const BADGE_ICON_OPTIONS: Array<{ value: AdminRankIcon; labelAr: string }> = [
  { value: 'crown', labelAr: 'تاج (المدير العام)' },
  { value: 'medal', labelAr: 'وسام القيادة' },
  { value: 'cpu', labelAr: 'المعالج التقني' },
  { value: 'graduation-cap', labelAr: 'قبعة الشؤون التعليمية' },
  { value: 'users', labelAr: 'درع شؤون الطلاب' },
  { value: 'headset', labelAr: 'سماعة الدعم الفني' },
  { value: 'clipboard-check', labelAr: 'لوحة الاختبارات' },
];

const BADGE_COLOR_OPTIONS: Array<{ value: AdminRankColor; labelAr: string }> = [
  { value: 'gold', labelAr: 'ذهبي ملكي' },
  { value: 'silver', labelAr: 'فضي قيادي' },
  { value: 'sky', labelAr: 'أزرق تقني' },
  { value: 'emerald', labelAr: 'زمردي تعليمي' },
  { value: 'violet', labelAr: 'بنفسجي طلابي' },
  { value: 'amber', labelAr: 'برتقالي داعم' },
  { value: 'rose', labelAr: 'وردي اختبارات' },
];

export function AdminRanksPanel({
  onDirectoryChanged,
}: {
  onDirectoryChanged?: () => void;
}) {
  const { user, refreshUser } = useAuth();
  const { tr } = useLanguage();

  const canAccess =
    isSuperAdminUser(user) ||
    hasAnyAdminPermission(user, ['manage_officials', 'manage_support']);
  const canManageOfficials =
    isSuperAdminUser(user) || hasAdminPermission(user, 'manage_officials');

  const [ranks, setRanks] = useState<AdminRank[]>([]);
  const [officials, setOfficials] = useState<AdminOfficial[]>([]);
  const [supportTeam, setSupportTeam] = useState<SupportTeamMember[]>([]);
  const [maxSupportTeamSize, setMaxSupportTeamSize] = useState(7);
  const [candidates, setCandidates] = useState<AdminRankCandidateUser[]>([]);
  const [permissionsCatalog, setPermissionsCatalog] = useState<AdminPermissionMeta[]>([]);
  const [canEditRanks, setCanEditRanks] = useState(false);

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<
    'supportTeam' | 'officials' | 'ranks' | 'activationPassword'
  >('supportTeam');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Super Admin ONLY: custom Admin Activation Password configuration
  const [activationConfigured, setActivationConfigured] = useState(false);
  const [activationUpdatedAt, setActivationUpdatedAt] = useState<string | null>(null);
  const [activationDefaultRankId, setActivationDefaultRankId] =
    useState('rank-deputy-director');
  const [activationPassInput, setActivationPassInput] = useState('');
  const [savingActivationPass, setSavingActivationPass] = useState(false);

  // Selected rank for editing name / icon / permissions
  const [selectedRankId, setSelectedRankId] = useState<string>('rank-super-admin');
  const [rankNameAr, setRankNameAr] = useState('');
  const [rankNameEn, setRankNameEn] = useState('');
  const [rankDesc, setRankDesc] = useState('');
  const [rankIcon, setRankIcon] = useState<AdminRankIcon>('crown');
  const [rankColor, setRankColor] = useState<AdminRankColor>('gold');
  const [rankVisible, setRankVisible] = useState(true);
  const [rankPerms, setRankPerms] = useState<AdminPermissionKey[]>([]);
  const [savingRank, setSavingRank] = useState(false);

  // Assign official form
  const [showAssignForm, setShowAssignForm] = useState(false);
  const [assignUserId, setAssignUserId] = useState('');
  const [assignRankId, setAssignRankId] = useState('rank-tech-support');
  const [assignDisplayName, setAssignDisplayName] = useState('');
  const [assignWhatsapp, setAssignWhatsapp] = useState('');
  const [assignNote, setAssignNote] = useState('');
  const [assignShowSupport, setAssignShowSupport] = useState(true);
  const [assignActive, setAssignActive] = useState(true);
  const [savingOfficial, setSavingOfficial] = useState(false);

  // Edit official inline modal
  const [editingOfficial, setEditingOfficial] = useState<AdminOfficial | null>(null);
  const [editRankId, setEditRankId] = useState('');
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editWhatsapp, setEditWhatsapp] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editShowSupport, setEditShowSupport] = useState(true);
  const [editActive, setEditActive] = useState(true);
  const [updatingOfficialId, setUpdatingOfficialId] = useState<string | null>(null);

  // Assign / Edit 7-member Technical Support Team state
  const [showSupportForm, setShowSupportForm] = useState(false);
  const [supportSlotNumber, setSupportSlotNumber] = useState<number>(1);
  const [supportUserId, setSupportUserId] = useState('');
  const [supportDisplayName, setSupportDisplayName] = useState('');
  const [supportSpecialty, setSupportSpecialty] = useState('');
  const [supportWhatsapp, setSupportWhatsapp] = useState('');
  const [supportIsActive, setSupportIsActive] = useState(true);
  const [savingSupportMember, setSavingSupportMember] = useState(false);

  const [editingSupportMember, setEditingSupportMember] =
    useState<SupportTeamMember | null>(null);
  const [editSupportSlot, setEditSupportSlot] = useState<number>(1);
  const [editSupportDisplayName, setEditSupportDisplayName] = useState('');
  const [editSupportSpecialty, setEditSupportSpecialty] = useState('');
  const [editSupportWhatsapp, setEditSupportWhatsapp] = useState('');
  const [editSupportActive, setEditSupportActive] = useState(true);
  const [updatingSupportId, setUpdatingSupportId] = useState<string | null>(null);

  const loadDirectory = useCallback(async () => {
    if (!canAccess) return;
    setLoading(true);
    try {
      const data = await apiRequest<AdminRanksDirectoryResponse>('/api/admin/ranks');
      setRanks(data.ranks || []);
      setOfficials(data.officials || []);
      setSupportTeam(data.supportTeam || []);
      setMaxSupportTeamSize(data.maxSupportTeamSize || 7);
      setCandidates(data.candidates || []);
      setPermissionsCatalog(data.permissionsCatalog || []);
      setCanEditRanks(Boolean(data.canEditRanks));
      if (data.canEditRanks) {
        apiRequest<{
          configured: boolean;
          updatedAt: string | null;
          defaultRankId: string;
        }>('/api/admin/activation-password')
          .then((cfg) => {
            setActivationConfigured(cfg.configured);
            setActivationUpdatedAt(cfg.updatedAt);
            if (cfg.defaultRankId) setActivationDefaultRankId(cfg.defaultRankId);
          })
          .catch(() => {});
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : tr('تعذر تحميل هيكل الرتب والدعم الفني.', 'Failed to load admin directory.')
      );
    } finally {
      setLoading(false);
    }
  }, [canAccess, tr]);

  useEffect(() => {
    loadDirectory();
  }, [loadDirectory]);

  // Sync rank editor fields when selectedRankId or ranks list changes
  useEffect(() => {
    const r = ranks.find((item) => item.id === selectedRankId) || ranks[0];
    if (!r) return;
    setRankNameAr(r.nameAr);
    setRankNameEn(r.nameEn);
    setRankDesc(r.description);
    setRankIcon(r.badgeIcon);
    setRankColor(r.badgeColor);
    setRankVisible(r.isVisibleInSupport);
    setRankPerms(r.permissions || []);
  }, [selectedRankId, ranks]);

  if (!canAccess) {
    return null;
  }

  const showToast = (msg: string) => {
    setStatusMsg(msg);
    setErrorMsg(null);
    window.setTimeout(() => setStatusMsg(null), 4000);
  };

  const togglePermission = (perm: AdminPermissionKey) => {
    if (!canEditRanks || selectedRankId === 'rank-super-admin' || perm === 'manage_ranks') {
      return;
    }
    setRankPerms((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]
    );
  };

  const handleSaveRank = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditRanks) return;
    setSavingRank(true);
    setErrorMsg(null);
    try {
      await apiRequest(`/api/admin/ranks/${encodeURIComponent(selectedRankId)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          nameAr: rankNameAr,
          nameEn: rankNameEn,
          description: rankDesc,
          badgeIcon: rankIcon,
          badgeColor: rankColor,
          isVisibleInSupport: rankVisible,
          permissions: rankPerms,
        }),
      });
      await loadDirectory();
      await refreshUser();
      onDirectoryChanged?.();
      showToast(tr('تم حفظ إعدادات وصلاحيات الرتبة بنجاح.', 'Rank settings saved successfully.'));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : tr('تعذر حفظ الرتبة.', 'Failed to save rank.'));
    } finally {
      setSavingRank(false);
    }
  };

  const handleAssignOfficial = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingOfficial(true);
    setErrorMsg(null);
    try {
      await apiRequest('/api/admin/officials', {
        method: 'POST',
        body: JSON.stringify({
          userId: assignUserId,
          rankId: assignRankId,
          displayName: assignDisplayName,
          whatsappNumber: assignWhatsapp,
          titleNote: assignNote,
          showInSupport: assignShowSupport,
          isActive: assignActive,
        }),
      });
      setShowAssignForm(false);
      setAssignUserId('');
      setAssignDisplayName('');
      setAssignWhatsapp('');
      setAssignNote('');
      await loadDirectory();
      onDirectoryChanged?.();
      showToast(tr('تم تعيين المسؤول في الرتبة بنجاح.', 'Official assigned successfully.'));
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : tr('تعذر تعيين المسؤول.', 'Failed to assign official.')
      );
    } finally {
      setSavingOfficial(false);
    }
  };

  const openEditOfficial = (official: AdminOfficial) => {
    setEditingOfficial(official);
    setEditRankId(official.rankId);
    setEditDisplayName(official.displayName);
    setEditWhatsapp(official.whatsappNumber === '********' ? '' : official.whatsappNumber);
    setEditNote(official.titleNote || '');
    setEditShowSupport(official.showInSupport);
    setEditActive(official.isActive);
  };

  const handleSaveOfficialEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOfficial) return;
    setUpdatingOfficialId(editingOfficial.id);
    setErrorMsg(null);
    try {
      await apiRequest(`/api/admin/officials/${encodeURIComponent(editingOfficial.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          rankId: editRankId,
          displayName: editDisplayName,
          ...(editWhatsapp.trim() ? { whatsappNumber: editWhatsapp.trim() } : {}),
          titleNote: editNote,
          showInSupport: editShowSupport,
          isActive: editActive,
        }),
      });
      setEditingOfficial(null);
      await loadDirectory();
      onDirectoryChanged?.();
      showToast(tr('تم تحديث بيانات المسؤول ونقله بنجاح.', 'Official updated successfully.'));
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : tr('تعذر تحديث بيانات المسؤول.', 'Failed to update official.')
      );
    } finally {
      setUpdatingOfficialId(null);
    }
  };

  const handleQuickToggle = async (
    official: AdminOfficial,
    patch: { showInSupport?: boolean; isActive?: boolean; rankId?: string }
  ) => {
    setUpdatingOfficialId(official.id);
    setErrorMsg(null);
    try {
      await apiRequest(`/api/admin/officials/${encodeURIComponent(official.id)}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      await loadDirectory();
      onDirectoryChanged?.();
      showToast(tr('تم تحديث حالة المسؤول بنجاح.', 'Official status updated.'));
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : tr('تعذر تعديل حالة المسؤول.', 'Failed to update status.')
      );
    } finally {
      setUpdatingOfficialId(null);
    }
  };

  const handleRemoveOfficial = async (official: AdminOfficial) => {
    setUpdatingOfficialId(official.id);
    setErrorMsg(null);
    try {
      await apiRequest(`/api/admin/officials/${encodeURIComponent(official.id)}`, {
        method: 'DELETE',
      });
      await loadDirectory();
      onDirectoryChanged?.();
      showToast(
        tr(
          'تمت إزالة المسؤول وسحب صلاحيات الرتبة بنجاح.',
          'Official removed and rank permissions revoked.'
        )
      );
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : tr('تعذر إزالة المسؤول.', 'Failed to remove official.')
      );
    } finally {
      setUpdatingOfficialId(null);
    }
  };

  // --- Support Team (7 slots) Handlers ---
  const openAssignSupportSlot = (slot: number) => {
    setSupportSlotNumber(slot);
    setSupportUserId('');
    setSupportDisplayName('');
    setSupportSpecialty('');
    setSupportWhatsapp('');
    setSupportIsActive(true);
    setShowSupportForm(true);
  };

  const handleAssignSupportMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSupportMember(true);
    setErrorMsg(null);
    try {
      await apiRequest('/api/admin/support-team', {
        method: 'POST',
        body: JSON.stringify({
          userId: supportUserId,
          slotNumber: supportSlotNumber,
          displayName: supportDisplayName,
          specialty: supportSpecialty,
          whatsappNumber: supportWhatsapp,
          isActive: supportIsActive,
        }),
      });
      setShowSupportForm(false);
      setSupportUserId('');
      setSupportDisplayName('');
      setSupportSpecialty('');
      setSupportWhatsapp('');
      await loadDirectory();
      onDirectoryChanged?.();
      showToast(
        tr(
          `تم تعيين عضو الدعم الفني في المقعد #${supportSlotNumber} بنجاح.`,
          `Support team member assigned to Slot #${supportSlotNumber}.`
        )
      );
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : tr('تعذر تعيين عضو الدعم الفني.', 'Failed to assign support team member.')
      );
    } finally {
      setSavingSupportMember(false);
    }
  };

  const openEditSupportMember = (member: SupportTeamMember) => {
    setEditingSupportMember(member);
    setEditSupportSlot(member.slotNumber);
    setEditSupportDisplayName(member.displayName);
    setEditSupportSpecialty(member.specialty || '');
    setEditSupportWhatsapp('');
    setEditSupportActive(member.isActive);
  };

  const handleSaveSupportEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSupportMember) return;
    setUpdatingSupportId(editingSupportMember.id);
    setErrorMsg(null);
    try {
      await apiRequest(
        `/api/admin/support-team/${encodeURIComponent(editingSupportMember.id)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            slotNumber: editSupportSlot,
            displayName: editSupportDisplayName,
            specialty: editSupportSpecialty,
            ...(editSupportWhatsapp.trim()
              ? { whatsappNumber: editSupportWhatsapp.trim() }
              : {}),
            isActive: editSupportActive,
          }),
        }
      );
      setEditingSupportMember(null);
      await loadDirectory();
      onDirectoryChanged?.();
      showToast(
        tr('تم تحديث بيانات عضو الدعم الفني بنجاح.', 'Support team member updated successfully.')
      );
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : tr('تعذر تحديث بيانات عضو الدعم الفني.', 'Failed to update support member.')
      );
    } finally {
      setUpdatingSupportId(null);
    }
  };

  const handleToggleSupportMemberActive = async (member: SupportTeamMember) => {
    setUpdatingSupportId(member.id);
    setErrorMsg(null);
    try {
      await apiRequest(`/api/admin/support-team/${encodeURIComponent(member.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !member.isActive }),
      });
      await loadDirectory();
      onDirectoryChanged?.();
      showToast(tr('تم تحديث حالة عضو الدعم الفني.', 'Support member status updated.'));
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : tr('تعذر تعديل حالة العضو.', 'Failed to toggle support member.')
      );
    } finally {
      setUpdatingSupportId(null);
    }
  };

  const handleRemoveSupportMember = async (member: SupportTeamMember) => {
    setUpdatingSupportId(member.id);
    setErrorMsg(null);
    try {
      await apiRequest(`/api/admin/support-team/${encodeURIComponent(member.id)}`, {
        method: 'DELETE',
      });
      await loadDirectory();
      onDirectoryChanged?.();
      showToast(
        tr('تمت إزالة العضو من فريق الدعم الفني بنجاح.', 'Member removed from Support Team.')
      );
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : tr('تعذر إزالة عضو الدعم الفني.', 'Failed to remove support member.')
      );
    } finally {
      setUpdatingSupportId(null);
    }
  };

  const handleSaveActivationPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditRanks) return;
    setSavingActivationPass(true);
    setErrorMsg(null);
    try {
      const res = await apiRequest<{
        configured: boolean;
        updatedAt: string | null;
        defaultRankId: string;
      }>('/api/admin/activation-password', {
        method: 'PUT',
        body: JSON.stringify({
          ...(activationPassInput.trim() ? { password: activationPassInput.trim() } : {}),
          defaultRankId: activationDefaultRankId,
        }),
      });
      setActivationConfigured(res.configured);
      setActivationUpdatedAt(res.updatedAt);
      setActivationDefaultRankId(res.defaultRankId);
      setActivationPassInput('');
      showToast(
        tr(
          'تم حفظ كلمة سر تفعيل صلاحية الأدمن والرتبة الافتراضية بنجاح.',
          'Custom admin activation password saved successfully.'
        )
      );
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : tr('تعذر حفظ كلمة سر تفعيل الأدمن.', 'Failed to save activation password.')
      );
    } finally {
      setSavingActivationPass(false);
    }
  };

  const handleClearActivationPassword = async () => {
    if (!canEditRanks) return;
    setSavingActivationPass(true);
    setErrorMsg(null);
    try {
      const res = await apiRequest<{
        configured: boolean;
        updatedAt: string | null;
        defaultRankId: string;
      }>('/api/admin/activation-password', {
        method: 'PUT',
        body: JSON.stringify({ clear: true }),
      });
      setActivationConfigured(res.configured);
      setActivationUpdatedAt(res.updatedAt);
      setActivationPassInput('');
      showToast(
        tr(
          'تم إيقاف ومسح كلمة سر تفعيل صلاحية الأدمن.',
          'Custom admin activation password cleared.'
        )
      );
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : tr('تعذر مسح كلمة سر التفعيل.', 'Failed to clear activation password.')
      );
    } finally {
      setSavingActivationPass(false);
    }
  };

  const currentRankObj = ranks.find((r) => r.id === selectedRankId);
  const assignableRanks = canEditRanks
    ? ranks
    : ranks.filter(
        (r) => !r.isSuperAdminRank && r.id !== 'rank-super-admin' && r.id !== 'rank-deputy-director'
      );
  const assignableCandidates = candidates.filter((c) => {
    if (c.id === user?.id && !canEditRanks) return false;
    if (!canEditRanks && (c.isProtected || c.adminRankId === 'rank-super-admin')) return false;
    return true;
  });

  const supportSlots = Array.from({ length: maxSupportTeamSize }, (_, idx) => idx + 1);

  return (
    <section className="rounded-2xl bg-[#121216] border border-[#D4AF37]/30 p-5 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-[#D4AF37]/15 border border-[#D4AF37]/45 flex items-center justify-center shrink-0">
            <RankIconGlyph icon="crown" color="gold" className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-lg sm:text-xl font-bold text-[#F5F0E6]">
                {tr('إدارة فريق الدعم الفني والرتب والمسؤولين', 'Support Team, Ranks & Officials Control')}
              </h2>
              <span className="text-[11px] font-semibold text-[#E5C158]">
                {canEditRanks
                  ? tr('· صلاحية المدير العام الكاملة', '· Full Super Admin Control')
                  : tr('· تفويض إداري مقيّد', '· Delegated Scope')}
              </span>
            </div>
            <p className="text-xs text-[#A8A29E] leading-relaxed">
              {tr(
                'اختيار فريق الدعم الفني المكون من 7 أشخاص من مستخدمي المنصة، بجانب إدارة المناصب الإدارية السبعة والمسؤولين وصلاحياتهم.',
                'Select the 7-person Technical Support Team from registered users, and manage the 7 administrative ranks and permissions.'
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={loadDirectory}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#18181D] border border-white/15 text-xs text-[#C8C2B8] hover:border-[#D4AF37]/50 hover:text-[#E5C158] cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{tr('تحديث', 'Refresh')}</span>
          </button>

          <GoldChip
            active={activeTab === 'supportTeam'}
            onClick={() => setActiveTab('supportTeam')}
          >
            <Headset className="w-4 h-4" />
            <span>
              {tr(
                `فريق الدعم الفني (${supportTeam.length}/${maxSupportTeamSize})`,
                `Support Team (${supportTeam.length}/${maxSupportTeamSize})`
              )}
            </span>
          </GoldChip>

          {canManageOfficials && (
            <GoldChip
              active={activeTab === 'officials'}
              onClick={() => setActiveTab('officials')}
            >
              <UserPlus className="w-4 h-4" />
              <span>{tr('المسؤولون والتواصل', 'Officials & Contacts')}</span>
            </GoldChip>
          )}

          {canManageOfficials && (
            <GoldChip
              active={activeTab === 'ranks'}
              onClick={() => setActiveTab('ranks')}
            >
              <Shield className="w-4 h-4" />
              <span>{tr('الرتب السبعة والصلاحيات', '7 Ranks & Permissions')}</span>
            </GoldChip>
          )}

          {canEditRanks && (
            <GoldChip
              active={activeTab === 'activationPassword'}
              onClick={() => setActiveTab('activationPassword')}
            >
              <KeyRound className="w-4 h-4" />
              <span>{tr('باسورد تفعيل الأدمن', 'Admin Activation Password')}</span>
            </GoldChip>
          )}
        </div>
      </div>

      {/* Feedback banners */}
      {statusMsg && (
        <div className="p-3 rounded-xl bg-emerald-950/35 border border-emerald-500/40 text-xs text-emerald-200 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{statusMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="p-3 rounded-xl bg-red-950/35 border border-red-500/40 text-xs text-red-200">
          {errorMsg}
        </div>
      )}

      {activeTab === 'supportTeam' ? (
        /* Tab 1: 7-Person Admin-Selected Technical Support Team */
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-0.5">
              <div className="text-sm font-bold text-[#E5C158]">
                {tr(
                  `اختيار أعضاء فريق الدعم الفني (${supportTeam.length} من ${maxSupportTeamSize} مقاعد)`,
                  `Admin-Selected Technical Support Team (${supportTeam.length}/${maxSupportTeamSize} seats)`
                )}
              </div>
              <p className="text-xs text-[#A8A29E]">
                {tr(
                  'يمكنك اختيار حتى 7 أشخاص من مستخدمي المنصة ليظهروا للطلاب داخل مركز الدعم الفني.',
                  'Pick up to 7 platform users to serve on the Technical Support Team shown to students.'
                )}
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                if (showSupportForm) {
                  setShowSupportForm(false);
                  return;
                }
                const firstEmpty =
                  supportSlots.find(
                    (s) => !supportTeam.some((m) => m.slotNumber === s)
                  ) || 1;
                openAssignSupportSlot(firstEmpty);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#D4AF37] text-[#09090B] text-xs font-bold hover:bg-[#E5C158] cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{tr('اختيار عضو دعم فني', 'Assign Support Member')}</span>
            </button>
          </div>

          {showSupportForm && (
            <form
              onSubmit={handleAssignSupportMember}
              className="p-4 sm:p-5 rounded-2xl bg-[#0D0D10] border border-[#D4AF37]/35 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-[#E5C158]">
                  {tr(
                    `تعيين عضو في المقعد #${supportSlotNumber} بفريق الدعم الفني`,
                    `Assign User to Support Seat #${supportSlotNumber}`
                  )}
                </h3>
                <button
                  type="button"
                  onClick={() => setShowSupportForm(false)}
                  className="text-xs text-[#A8A29E] hover:text-white cursor-pointer"
                >
                  {tr('إغلاق', 'Close')}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-[#C8C2B8] block">
                    {tr('رقم المقعد (من 1 إلى 7)', 'Support Slot (1..7)')}
                  </label>
                  <select
                    value={supportSlotNumber}
                    onChange={(e) => setSupportSlotNumber(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-[#151519] border border-white/15 text-xs text-[#F5F0E6]"
                  >
                    {supportSlots.map((slot) => {
                      const occupied = supportTeam.find((m) => m.slotNumber === slot);
                      return (
                        <option key={slot} value={slot}>
                          {tr(`المقعد #${slot}`, `Slot #${slot}`)}
                          {occupied ? ` — (${occupied.displayName})` : ` (${tr('شاغر', 'Empty')})`}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-[#C8C2B8] block">
                    {tr('اختر المستخدم من المنصة', 'Select Platform User')}
                  </label>
                  <select
                    required
                    value={supportUserId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setSupportUserId(id);
                      const found = candidates.find((c) => c.id === id);
                      if (found) {
                        setSupportDisplayName(found.name);
                      }
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-[#151519] border border-white/15 text-xs text-[#F5F0E6]"
                  >
                    <option value="">{tr('-- اختر المستخدم --', '-- Select User --')}</option>
                    {candidates.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.role})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-[#C8C2B8] block">
                    {tr('الاسم الظاهر في الدعم الفني', 'Display Name in Support')}
                  </label>
                  <input
                    type="text"
                    required
                    value={supportDisplayName}
                    onChange={(e) => setSupportDisplayName(e.target.value)}
                    placeholder={tr('مثال: م. سارة — دعم فني', 'e.g. Eng. Sara')}
                    className="w-full px-3 py-2 rounded-xl bg-[#151519] border border-white/15 text-xs text-[#F5F0E6]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-[#C8C2B8] block">
                    {tr('رقم WhatsApp الخاص بالتواصل (اختياري الآن)', 'WhatsApp Number (Optional)')}
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={supportWhatsapp}
                    onChange={(e) => setSupportWhatsapp(e.target.value)}
                    placeholder="01012345678"
                    className="w-full px-3 py-2 rounded-xl bg-[#151519] border border-white/15 text-xs text-[#F5F0E6] font-mono"
                  />
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <label className="text-xs text-[#C8C2B8] block">
                    {tr('التخصص أو نطاق المساعدة (اختياري)', 'Specialty / Scope (Optional)')}
                  </label>
                  <input
                    type="text"
                    value={supportSpecialty}
                    onChange={(e) => setSupportSpecialty(e.target.value)}
                    placeholder={tr(
                      'مثال: دعم الفرقة الأولى ومشاكل الاختبارات',
                      'e.g. Year 1 support & quiz troubleshooting'
                    )}
                    className="w-full px-3 py-2 rounded-xl bg-[#151519] border border-white/15 text-xs text-[#F5F0E6]"
                  />
                </div>
              </div>

              <label className="inline-flex items-center gap-2 text-xs text-[#C8C2B8] cursor-pointer">
                <input
                  type="checkbox"
                  checked={supportIsActive}
                  onChange={(e) => setSupportIsActive(e.target.checked)}
                  className="accent-[#D4AF37]"
                />
                <span>{tr('نشط وظاهر للطلاب في نافذة الدعم الفني', 'Active & visible to students')}</span>
              </label>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={savingSupportMember}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#D4AF37] text-[#09090B] text-xs font-bold hover:bg-[#E5C158] disabled:opacity-50 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>
                    {savingSupportMember
                      ? tr('جاري الحفظ...', 'Saving...')
                      : tr('حفظ وتعيين في فريق الدعم', 'Assign to Support Team')}
                  </span>
                </button>
              </div>
            </form>
          )}

          {/* 7 Seats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {supportSlots.map((slot) => {
              const member = supportTeam.find((m) => m.slotNumber === slot);
              if (!member) {
                return (
                  <div
                    key={slot}
                    className="p-4 rounded-xl bg-[#0D0D10]/75 border border-dashed border-white/15 flex flex-col justify-between gap-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[11px] font-mono tabular-nums text-[#A8A29E]">
                        #{slot}
                      </span>
                      <span className="text-[11px] text-[#6B665E]">
                        {tr('مقعد شاغر', 'Vacant Seat')}
                      </span>
                    </div>
                    <p className="text-xs text-[#A8A29E]">
                      {tr(
                        `اختر الشخص رقم ${slot} في فريق الدعم الفني.`,
                        `Select support team member #${slot}.`
                      )}
                    </p>
                    <button
                      type="button"
                      onClick={() => openAssignSupportSlot(slot)}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#18181D] border border-[#D4AF37]/35 text-xs font-semibold text-[#E5C158] hover:bg-[#D4AF37]/15 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{tr(`تعيين للمقعد #${slot}`, `Assign Seat #${slot}`)}</span>
                    </button>
                  </div>
                );
              }

              const baseUser = candidates.find((c) => c.id === member.userId);
              const isBusy = updatingSupportId === member.id;

              return (
                <div
                  key={member.id}
                  className="p-4 rounded-xl bg-[#0D0D10] border border-[#D4AF37]/25 space-y-3 flex flex-col justify-between"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="px-2 py-0.5 rounded-md bg-[#D4AF37]/15 border border-[#D4AF37]/35 text-[11px] font-mono tabular-nums text-[#F5D061] font-bold shrink-0">
                          #{member.slotNumber}
                        </span>
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-[#F5F0E6] truncate">
                            {member.displayName}
                          </div>
                          {baseUser && (
                            <div className="text-[11px] text-[#A8A29E] truncate">
                              {baseUser.name} · {baseUser.role}
                            </div>
                          )}
                        </div>
                      </div>

                      <span
                        className={`text-[11px] font-semibold shrink-0 ${
                          member.isActive ? 'text-emerald-300' : 'text-red-300'
                        }`}
                      >
                        {member.isActive ? tr('نشط', 'Active') : tr('متوقف', 'Inactive')}
                      </span>
                    </div>

                    {member.specialty && (
                      <p className="text-xs text-[#C8C2B8] leading-snug line-clamp-2">
                        {member.specialty}
                      </p>
                    )}

                    <div className="flex items-center justify-between gap-2 text-xs bg-[#151519] px-3 py-1.5 rounded-lg border border-white/5">
                      <span className="text-[#A8A29E] flex items-center gap-1.5">
                        <WhatsAppMark className="w-3.5 h-3.5 shrink-0" />
                        <span>{tr('واتساب:', 'WhatsApp:')}</span>
                      </span>
                      {member.whatsappNumber ? (
                        <span className="font-mono text-[#F5F0E6] tabular-nums" dir="ltr">
                          {member.whatsappNumber}
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => openEditSupportMember(member)}
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-[#F5D061] hover:underline cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                          <span>{tr('إضافة رقم', 'Add Number')}</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => openEditSupportMember(member)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#18181D] border border-white/15 text-[11px] text-[#F5F0E6] hover:border-[#D4AF37]/50 cursor-pointer"
                    >
                      <Pencil className="w-3 h-3 text-[#D4AF37]" />
                      <span>{tr('تعديل', 'Edit')}</span>
                    </button>

                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleToggleSupportMemberActive(member)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#18181D] border border-white/15 text-[11px] text-[#C8C2B8] hover:border-[#D4AF37]/50 cursor-pointer"
                    >
                      {member.isActive ? tr('إيقاف مؤقت', 'Pause') : tr('تنشيط', 'Activate')}
                    </button>

                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleRemoveSupportMember(member)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-950/35 border border-red-500/35 text-[11px] text-red-200 hover:bg-red-700 hover:text-white cursor-pointer ms-auto"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>{tr('إزالة', 'Remove')}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : activeTab === 'officials' && canManageOfficials ? (
        <div className="space-y-5">
          {/* Action bar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-[#A8A29E] tabular-nums">
              {tr(
                `عدد المسؤولين المعينين حالياً: ${officials.length} · النشطون في الدعم: ${
                  officials.filter((o) => o.isActive && o.showInSupport).length
                }`,
                `Assigned officials: ${officials.length} · Active in support: ${
                  officials.filter((o) => o.isActive && o.showInSupport).length
                }`
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowAssignForm((v) => !v)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#D4AF37] text-[#09090B] text-xs font-bold hover:bg-[#E5C158] cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{tr('تعيين مسؤول في رتبة', 'Assign Official to Rank')}</span>
            </button>
          </div>

          {/* Assign form */}
          {showAssignForm && (
            <form
              onSubmit={handleAssignOfficial}
              className="p-4 sm:p-5 rounded-2xl bg-[#0D0D10] border border-[#D4AF37]/35 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-[#E5C158]">
                  {tr(
                    'تعيين حساب حقيقي في إحدى الرتب الإدارية',
                    'Assign Existing User to an Administrative Rank'
                  )}
                </h3>
                <button
                  type="button"
                  onClick={() => setShowAssignForm(false)}
                  className="text-xs text-[#A8A29E] hover:text-white cursor-pointer"
                >
                  {tr('إغلاق', 'Close')}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-[#C8C2B8] block">
                    {tr('اختر الحساب (مستخدم مسجل بالفعل)', 'Select Registered User')}
                  </label>
                  <select
                    required
                    value={assignUserId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setAssignUserId(id);
                      const found = candidates.find((c) => c.id === id);
                      if (found && !assignDisplayName) {
                        setAssignDisplayName(found.name);
                      }
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-[#151519] border border-white/15 text-xs text-[#F5F0E6]"
                  >
                    <option value="">{tr('-- اختر المستخدم --', '-- Select User --')}</option>
                    {assignableCandidates.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.role})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-[#C8C2B8] block">
                    {tr('الرتبة الإدارية', 'Administrative Rank')}
                  </label>
                  <select
                    required
                    value={assignRankId}
                    onChange={(e) => setAssignRankId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#151519] border border-white/15 text-xs text-[#F5F0E6]"
                  >
                    {assignableRanks.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.displayOrder}. {r.nameAr}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-[#C8C2B8] block">
                    {tr('الاسم الظاهر في الدعم والإدارة', 'Display Name')}
                  </label>
                  <input
                    type="text"
                    required
                    value={assignDisplayName}
                    onChange={(e) => setAssignDisplayName(e.target.value)}
                    placeholder={tr('مثال: م. أحمد — الدعم الفني', 'e.g. Eng. Ahmed')}
                    className="w-full px-3 py-2 rounded-xl bg-[#151519] border border-white/15 text-xs text-[#F5F0E6]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-[#C8C2B8] block">
                    {tr('رقم WhatsApp الخاص بالتواصل (اختياري الآن)', 'Private WhatsApp Number (Optional)')}
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={assignWhatsapp}
                    onChange={(e) => setAssignWhatsapp(e.target.value)}
                    placeholder="01012345678"
                    className="w-full px-3 py-2 rounded-xl bg-[#151519] border border-white/15 text-xs text-[#F5F0E6] font-mono"
                  />
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <label className="text-xs text-[#C8C2B8] block">
                    {tr('وصف مختصر لاختصاصه (اختياري)', 'Department Note (Optional)')}
                  </label>
                  <input
                    type="text"
                    value={assignNote}
                    onChange={(e) => setAssignNote(e.target.value)}
                    placeholder={tr(
                      'مثال: استفسارات الفرقة الأولى والثانية وحل مشاكل الدخول',
                      'e.g. Year 1–2 support and login issues'
                    )}
                    className="w-full px-3 py-2 rounded-xl bg-[#151519] border border-white/15 text-xs text-[#F5F0E6]"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-5 pt-1 text-xs text-[#C8C2B8]">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={assignShowSupport}
                    onChange={(e) => setAssignShowSupport(e.target.checked)}
                    className="accent-[#D4AF37]"
                  />
                  <span>{tr('إظهاره للطلاب في مركز الدعم', 'Visible in Student Support Center')}</span>
                </label>

                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={assignActive}
                    onChange={(e) => setAssignActive(e.target.checked)}
                    className="accent-[#D4AF37]"
                  />
                  <span>{tr('الحساب نشط ومتاح حالياً', 'Official currently active')}</span>
                </label>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={savingOfficial}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#D4AF37] text-[#09090B] text-xs font-bold hover:bg-[#E5C158] disabled:opacity-50 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>
                    {savingOfficial
                      ? tr('جاري الحفظ...', 'Saving...')
                      : tr('حفظ وتعيين في الرتبة', 'Assign Official')}
                  </span>
                </button>
              </div>
            </form>
          )}

          {/* Officials List */}
          {officials.length === 0 ? (
            <div className="p-8 rounded-2xl bg-[#0D0D10] border border-white/10 text-center space-y-2">
              <p className="text-sm font-semibold text-[#F5F0E6]">
                {tr('لم يتم تعيين أي مسؤولين في الرتب بعد', 'No officials assigned to ranks yet')}
              </p>
              <p className="text-xs text-[#A8A29E] max-w-lg mx-auto">
                {tr(
                  'حفاظاً على الأمان لم يتم إنشاء أي حسابات وهمية تلقائياً. اضغط "تعيين مسؤول في رتبة" لاختيار مستخدم حقيقي وتحديد رقمه ورتبته.',
                  'For security, no dummy admin accounts were created automatically. Click "Assign Official to Rank" to assign real users.'
                )}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {officials.map((official) => {
                const rank = ranks.find((r) => r.id === official.rankId);
                const isProtectedTarget =
                  official.rankId === 'rank-super-admin' ||
                  official.rankId === 'rank-deputy-director';
                const canModifyThis =
                  canEditRanks || (!isProtectedTarget && official.userId !== user?.id);
                const isBusy = updatingOfficialId === official.id;

                return (
                  <div
                    key={official.id}
                    className="p-4 rounded-xl bg-[#0D0D10] border border-white/10 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <div
                          className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${getRankIconBoxClass(
                            rank?.badgeColor || 'gold'
                          )}`}
                        >
                          <RankIconGlyph
                            icon={rank?.badgeIcon || 'crown'}
                            color={rank?.badgeColor || 'gold'}
                            className="w-5 h-5"
                          />
                        </div>
                        <div className="min-w-0 space-y-0.5">
                          <div className="text-sm font-bold text-[#F5F0E6] truncate">
                            {official.displayName}
                          </div>
                          <div className="text-xs text-[#E5C158] font-medium">
                            {rank?.nameAr || official.rankId}
                          </div>
                          {official.titleNote && (
                            <p className="text-[11px] text-[#A8A29E] truncate">
                              {official.titleNote}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="text-end text-[11px] space-y-1 shrink-0">
                        <div
                          className={
                            official.isActive ? 'text-emerald-300 font-semibold' : 'text-red-300'
                          }
                        >
                          {official.isActive ? tr('نشط', 'Active') : tr('متوقف', 'Inactive')}
                        </div>
                        <div className="text-[#A8A29E]">
                          {official.showInSupport
                            ? tr('ظاهر بالدعم', 'Visible in Support')
                            : tr('مخفي من الدعم', 'Hidden from Support')}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 text-xs bg-[#151519] px-3 py-2 rounded-lg border border-white/5">
                      <span className="text-[#A8A29E] flex items-center gap-1.5">
                        <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
                        <span>{tr('واتساب التواصل:', 'WhatsApp:')}</span>
                      </span>
                      <span className="font-mono text-[#F5F0E6] tabular-nums" dir="ltr">
                        {official.whatsappNumber}
                      </span>
                    </div>

                    {canModifyThis && (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => openEditOfficial(official)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#18181D] border border-white/15 text-[11px] text-[#F5F0E6] hover:border-[#D4AF37]/50 cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5 text-[#D4AF37]" />
                          <span>{tr('تعديل / نقل قسم', 'Edit / Transfer')}</span>
                        </button>

                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() =>
                            handleQuickToggle(official, {
                              showInSupport: !official.showInSupport,
                            })
                          }
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#18181D] border border-white/15 text-[11px] text-[#C8C2B8] hover:border-[#D4AF37]/50 cursor-pointer"
                        >
                          {official.showInSupport ? (
                            <>
                              <EyeOff className="w-3.5 h-3.5 text-amber-300" />
                              <span>{tr('إخفاء من الدعم', 'Hide from Support')}</span>
                            </>
                          ) : (
                            <>
                              <Eye className="w-3.5 h-3.5 text-emerald-300" />
                              <span>{tr('تفعيل بالدعم', 'Show in Support')}</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() =>
                            handleQuickToggle(official, { isActive: !official.isActive })
                          }
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#18181D] border border-white/15 text-[11px] text-[#C8C2B8] hover:border-[#D4AF37]/50 cursor-pointer"
                        >
                          <span>
                            {official.isActive
                              ? tr('تعطيل مؤقت', 'Set Inactive')
                              : tr('تنشيط', 'Set Active')}
                          </span>
                        </button>

                        {official.userId !== user?.id && (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleRemoveOfficial(official)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-950/35 border border-red-500/35 text-[11px] text-red-200 hover:bg-red-700 hover:text-white cursor-pointer ms-auto"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>{tr('إزالة', 'Remove')}</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* Tab 3: 7 Administrative Ranks & Permissions */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* 7 Ranks Selector */}
          <div className="lg:col-span-5 space-y-2">
            <div className="text-xs font-semibold text-[#C8C2B8] mb-1">
              {tr('المناصب الإدارية السبعة', 'The 7 Administrative Ranks')}
            </div>
            {ranks.map((r) => {
              const isSelected = selectedRankId === r.id;
              const assignedCount = officials.filter((o) => o.rankId === r.id).length;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedRankId(r.id)}
                  className={`w-full text-start p-3 rounded-xl border transition-colors flex items-center justify-between gap-3 cursor-pointer ${
                    isSelected
                      ? 'bg-[#1A1812] border-[#D4AF37]/70 text-[#F5F0E6]'
                      : 'bg-[#0D0D10] border-white/10 text-[#C8C2B8] hover:border-[#D4AF37]/35'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 ${getRankIconBoxClass(
                        r.badgeColor
                      )}`}
                    >
                      <RankIconGlyph
                        icon={r.badgeIcon}
                        color={r.badgeColor}
                        className="w-4 h-4"
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs sm:text-sm font-bold truncate flex flex-wrap items-center gap-1.5">
                        <span>{r.displayOrder}. {r.nameAr}</span>
                        {r.isSuperAdminRank && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-400/45 text-[10px] font-bold text-amber-200">
                            {tr('ليدر المنصة · للضرورة', 'Leader · Urgent')}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[#A8A29E] tabular-nums">
                        {tr(
                          `${assignedCount} مسؤول · ${r.permissions.length} صلاحيات`,
                          `${assignedCount} officials · ${r.permissions.length} perms`
                        )}
                      </div>
                    </div>
                  </div>
                  {r.isSuperAdminRank && (
                    <Lock className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Selected Rank Editor & Permissions Matrix */}
          <form
            onSubmit={handleSaveRank}
            className="lg:col-span-7 rounded-2xl bg-[#0D0D10] border border-white/10 p-4 sm:p-5 space-y-4"
          >
            <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-9 h-9 rounded-lg border flex items-center justify-center ${getRankIconBoxClass(
                    rankColor
                  )}`}
                >
                  <RankIconGlyph icon={rankIcon} color={rankColor} className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#F5F0E6]">{rankNameAr}</h3>
                  <p className="text-[11px] text-[#A8A29E]">
                    {canEditRanks
                      ? tr('يمكنك تعديل اسم الرتبة وعلامتها وصلاحياتها.', 'Editable by Super Admin.')
                      : tr(
                          'تعديل الرتب والصلاحيات متاح للمدير العام فقط.',
                          'Read-only: only Super Admin can edit ranks.'
                        )}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-[#C8C2B8] block">
                  {tr('اسم الرتبة (عربي)', 'Rank Title (Arabic)')}
                </label>
                <input
                  type="text"
                  disabled={!canEditRanks}
                  value={rankNameAr}
                  onChange={(e) => setRankNameAr(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#151519] border border-white/15 text-xs text-[#F5F0E6] disabled:opacity-60"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-[#C8C2B8] block">
                  {tr('اسم الرتبة (إنجليزي)', 'Rank Title (English)')}
                </label>
                <input
                  type="text"
                  disabled={!canEditRanks}
                  value={rankNameEn}
                  onChange={(e) => setRankNameEn(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#151519] border border-white/15 text-xs text-[#F5F0E6] disabled:opacity-60"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-[#C8C2B8] block">
                  {tr('العلامة / الأيقونة المميزة', 'Rank Emblem Icon')}
                </label>
                <select
                  disabled={!canEditRanks}
                  value={rankIcon}
                  onChange={(e) => setRankIcon(e.target.value as AdminRankIcon)}
                  className="w-full px-3 py-2 rounded-xl bg-[#151519] border border-white/15 text-xs text-[#F5F0E6] disabled:opacity-60"
                >
                  {BADGE_ICON_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.labelAr}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-[#C8C2B8] block">
                  {tr('لون الشارة المميزة', 'Badge Accent Color')}
                </label>
                <select
                  disabled={!canEditRanks}
                  value={rankColor}
                  onChange={(e) => setRankColor(e.target.value as AdminRankColor)}
                  className="w-full px-3 py-2 rounded-xl bg-[#151519] border border-white/15 text-xs text-[#F5F0E6] disabled:opacity-60"
                >
                  {BADGE_COLOR_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.labelAr}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs text-[#C8C2B8] block">
                  {tr('وصف مهام الرتبة', 'Rank Description')}
                </label>
                <input
                  type="text"
                  disabled={!canEditRanks}
                  value={rankDesc}
                  onChange={(e) => setRankDesc(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#151519] border border-white/15 text-xs text-[#F5F0E6] disabled:opacity-60"
                />
              </div>
            </div>

            <label className="inline-flex items-center gap-2 text-xs text-[#C8C2B8] cursor-pointer">
              <input
                type="checkbox"
                disabled={!canEditRanks}
                checked={rankVisible}
                onChange={(e) => setRankVisible(e.target.checked)}
                className="accent-[#D4AF37]"
              />
              <span>
                {tr(
                  'إظهار هذا القسم في مركز الدعم الفني للطلاب',
                  'Display this rank section in Student Support Center'
                )}
              </span>
            </label>

            <div className="space-y-2 pt-2 border-t border-white/10">
              <div className="text-xs font-bold text-[#E5C158]">
                {tr('صلاحيات هذه الرتبة المستقلة:', 'Independent Rank Permissions:')}
              </div>

              <div className="grid grid-cols-1 gap-2">
                {permissionsCatalog.map((perm) => {
                  const isSuperRank = currentRankObj?.isSuperAdminRank;
                  const checked = isSuperRank ? true : rankPerms.includes(perm.key);
                  const disabled =
                    !canEditRanks || Boolean(isSuperRank) || Boolean(perm.superAdminOnly);

                  return (
                    <button
                      key={perm.key}
                      type="button"
                      disabled={disabled}
                      onClick={() => togglePermission(perm.key)}
                      className={`w-full text-start p-2.5 rounded-xl border transition-colors flex items-start gap-3 ${
                        checked
                          ? 'bg-[#191711] border-[#D4AF37]/50 text-[#F5F0E6]'
                          : 'bg-[#141418] border-white/10 text-[#A8A29E]'
                      } ${disabled ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer hover:border-[#D4AF37]/40'}`}
                    >
                      <span
                        className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                          checked
                            ? 'bg-[#D4AF37] border-[#D4AF37] text-[#09090B]'
                            : 'border-white/25 bg-transparent'
                        }`}
                      >
                        {checked && <Check className="w-3 h-3" />}
                      </span>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold">
                          {perm.labelAr}{' '}
                          {perm.superAdminOnly && (
                            <span className="text-[10px] text-[#D4AF37]">
                              {tr('(حصري للمدير العام)', '(Super Admin Only)')}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-[#A8A29E]">{perm.descriptionAr}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {canEditRanks && (
              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={savingRank}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#D4AF37] text-[#09090B] text-xs font-bold hover:bg-[#E5C158] disabled:opacity-50 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>
                    {savingRank
                      ? tr('جاري الحفظ...', 'Saving...')
                      : tr('حفظ تعديلات الرتبة والصلاحيات', 'Save Rank & Permissions')}
                  </span>
                </button>
              </div>
            )}
          </form>
        </div>
      )}

      {activeTab === 'activationPassword' && canEditRanks && (
        <form
          onSubmit={handleSaveActivationPassword}
          className="p-4 sm:p-5 rounded-2xl bg-[#0D0D10] border border-[#D4AF37]/35 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-[#D4AF37]" />
              <h3 className="text-sm font-bold text-[#E5C158]">
                {tr(
                  'تعيين باسورد تفعيل صلاحية الأدمن (حصري لمدير المنصة العام)',
                  'Custom Admin Activation Password (Super Admin Only)'
                )}
              </h3>
            </div>
            <span
              className={`text-xs font-semibold ${
                activationConfigured ? 'text-emerald-300' : 'text-amber-300'
              }`}
            >
              {activationConfigured
                ? tr('مفعّل حالياً', 'Active & Configured')
                : tr('غير مفعّل بعد', 'Not Configured')}
            </span>
          </div>

          <p className="text-xs text-[#A8A29E] leading-relaxed">
            {tr(
              'اكتب كلمة السر التي تتيح لمن تعطيها له تفعيل صلاحية الأدمن من نافذة حسابي أو أثناء التسجيل. يتم حفظها مشفرة على الخادم ولا يراها أي مستخدم أو أدمن آخر.',
              'Define a custom activation password that allows recipients to unlock delegated Admin privileges from their Account modal or registration. Stored securely hashed on the server.'
            )}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1.5">
              <label className="text-xs text-[#C8C2B8] block">
                {activationConfigured
                  ? tr(
                      'كلمة سر تفعيل جديدة (اتركها فارغة لتعديل الرتبة فقط)',
                      'New Activation Password (leave blank to keep current)'
                    )
                  : tr('كلمة سر تفعيل الأدمن (4+ أحرف)', 'Admin Activation Password (4+ chars)')}
              </label>
              <PasswordInput
                value={activationPassInput}
                onChange={(e) => setActivationPassInput(e.target.value)}
                placeholder={tr('اكتب كلمة سر التفعيل...', 'Enter activation password...')}
                startIcon={<Lock className="w-4 h-4 text-[#D4AF37]" />}
                className="w-full py-2.5 rounded-xl bg-[#151519] border border-white/15 text-xs sm:text-sm text-[#F5F0E6] font-mono focus:outline-none focus:border-[#D4AF37]"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-[#C8C2B8] block">
                {tr(
                  'الرتبة الإدارية الممنوحة عند التفعيل بهذه الكلمة',
                  'Default Rank Assigned Upon Activation'
                )}
              </label>
              <select
                value={activationDefaultRankId}
                onChange={(e) => setActivationDefaultRankId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-[#151519] border border-white/15 text-xs sm:text-sm text-[#F5F0E6] focus:outline-none focus:border-[#D4AF37]"
              >
                {ranks
                  .filter((r) => !r.isSuperAdminRank && r.id !== 'rank-super-admin')
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.displayOrder}. {r.nameAr}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {activationUpdatedAt && (
            <div className="text-[11px] font-mono text-[#A8A29E] tabular-nums">
              {tr('آخر تحديث:', 'Last updated:')}{' '}
              {new Date(activationUpdatedAt).toLocaleString()}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
            {activationConfigured && (
              <button
                type="button"
                disabled={savingActivationPass}
                onClick={handleClearActivationPassword}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-950/40 border border-red-500/40 text-xs font-semibold text-red-200 hover:bg-red-700 hover:text-white cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{tr('مسح وإيقاف التفعيل', 'Clear Password')}</span>
              </button>
            )}
            <button
              type="submit"
              disabled={savingActivationPass}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#D4AF37] text-[#09090B] text-xs font-bold hover:bg-[#E5C158] disabled:opacity-50 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>
                {savingActivationPass
                  ? tr('جاري الحفظ...', 'Saving...')
                  : tr('حفظ باسورد تفعيل الأدمن', 'Save Activation Password')}
              </span>
            </button>
          </div>
        </form>
      )}

      {/* Edit Support Team Member Modal */}
      {editingSupportMember && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
        >
          <form
            onSubmit={handleSaveSupportEdit}
            className="w-full max-w-lg rounded-2xl bg-[#121216] border border-[#D4AF37]/40 p-5 sm:p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <Headset className="w-4 h-4 text-[#D4AF37]" />
                <h3 className="text-base font-bold text-[#F5F0E6]">
                  {tr('تعديل بيانات عضو الدعم الفني', 'Edit Support Team Member')}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingSupportMember(null)}
                className="text-[#A8A29E] hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs text-[#C8C2B8] block">
                  {tr('المقعد في فريق الدعم (1 إلى 7)', 'Support Seat (1..7)')}
                </label>
                <select
                  value={editSupportSlot}
                  onChange={(e) => setEditSupportSlot(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-[#151519] border border-white/15 text-xs text-[#F5F0E6]"
                >
                  {supportSlots.map((slot) => {
                    const occupant = supportTeam.find(
                      (m) => m.slotNumber === slot && m.id !== editingSupportMember.id
                    );
                    return (
                      <option key={slot} value={slot}>
                        {tr(`المقعد #${slot}`, `Slot #${slot}`)}
                        {occupant ? ` — (${tr('تبديل مع', 'Swap with')} ${occupant.displayName})` : ''}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-[#C8C2B8] block">
                  {tr('الاسم الظاهر', 'Display Name')}
                </label>
                <input
                  type="text"
                  required
                  value={editSupportDisplayName}
                  onChange={(e) => setEditSupportDisplayName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#151519] border border-white/15 text-xs text-[#F5F0E6]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-[#C8C2B8] block">
                  {tr('التخصص أو نطاق المساعدة', 'Specialty / Scope')}
                </label>
                <input
                  type="text"
                  value={editSupportSpecialty}
                  onChange={(e) => setEditSupportSpecialty(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#151519] border border-white/15 text-xs text-[#F5F0E6]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-[#C8C2B8] block">
                  {tr(
                    'رقم WhatsApp (اتركه فارغاً للإبقاء على الرقم الحالي)',
                    'WhatsApp Number (leave empty to keep current)'
                  )}
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={editSupportWhatsapp}
                  onChange={(e) => setEditSupportWhatsapp(e.target.value)}
                  placeholder="01012345678"
                  className="w-full px-3 py-2 rounded-xl bg-[#151519] border border-white/15 text-xs text-[#F5F0E6] font-mono"
                />
              </div>

              <label className="inline-flex items-center gap-2 text-xs text-[#C8C2B8] cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={editSupportActive}
                  onChange={(e) => setEditSupportActive(e.target.checked)}
                  className="accent-[#D4AF37]"
                />
                <span>{tr('نشط ومتاح للطلاب', 'Active & visible to students')}</span>
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingSupportMember(null)}
                className="px-4 py-2 rounded-xl bg-[#18181D] border border-white/15 text-xs text-[#C8C2B8] cursor-pointer"
              >
                {tr('إلغاء', 'Cancel')}
              </button>
              <button
                type="submit"
                disabled={updatingSupportId === editingSupportMember.id}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[#D4AF37] text-[#09090B] text-xs font-bold hover:bg-[#E5C158] cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>{tr('حفظ التغييرات', 'Save Changes')}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit / Transfer Official Modal */}
      {editingOfficial && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
        >
          <form
            onSubmit={handleSaveOfficialEdit}
            className="w-full max-w-lg rounded-2xl bg-[#121216] border border-[#D4AF37]/40 p-5 sm:p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <ArrowRightLeft className="w-4 h-4 text-[#D4AF37]" />
                <h3 className="text-base font-bold text-[#F5F0E6]">
                  {tr('تعديل أو نقل المسؤول بين الأقسام', 'Edit or Transfer Official')}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingOfficial(null)}
                className="text-[#A8A29E] hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs text-[#C8C2B8] block">
                  {tr('نقل إلى رتبة / قسم:', 'Transfer to Rank / Department:')}
                </label>
                <select
                  value={editRankId}
                  onChange={(e) => setEditRankId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#151519] border border-white/15 text-xs text-[#F5F0E6]"
                >
                  {assignableRanks.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.displayOrder}. {r.nameAr}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-[#C8C2B8] block">
                  {tr('الاسم الظاهر', 'Display Name')}
                </label>
                <input
                  type="text"
                  required
                  value={editDisplayName}
                  onChange={(e) => setEditDisplayName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#151519] border border-white/15 text-xs text-[#F5F0E6]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-[#C8C2B8] block">
                  {tr(
                    'رقم WhatsApp (اتركه فارغاً للإبقاء على الرقم الحالي)',
                    'WhatsApp Number (leave empty to keep current)'
                  )}
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={editWhatsapp}
                  onChange={(e) => setEditWhatsapp(e.target.value)}
                  placeholder="01012345678"
                  className="w-full px-3 py-2 rounded-xl bg-[#151519] border border-white/15 text-xs text-[#F5F0E6] font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-[#C8C2B8] block">
                  {tr('ملاحظة القسم (اختياري)', 'Department Note')}
                </label>
                <input
                  type="text"
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#151519] border border-white/15 text-xs text-[#F5F0E6]"
                />
              </div>

              <div className="flex flex-wrap items-center gap-5 pt-1 text-xs text-[#C8C2B8]">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editShowSupport}
                    onChange={(e) => setEditShowSupport(e.target.checked)}
                    className="accent-[#D4AF37]"
                  />
                  <span>{tr('ظاهر في مركز الدعم', 'Show in Support Center')}</span>
                </label>

                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editActive}
                    onChange={(e) => setEditActive(e.target.checked)}
                    className="accent-[#D4AF37]"
                  />
                  <span>{tr('نشط ومتاح', 'Active')}</span>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingOfficial(null)}
                className="px-4 py-2 rounded-xl bg-[#18181D] border border-white/15 text-xs text-[#C8C2B8] cursor-pointer"
              >
                {tr('إلغاء', 'Cancel')}
              </button>
              <button
                type="submit"
                disabled={updatingOfficialId === editingOfficial.id}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[#D4AF37] text-[#09090B] text-xs font-bold hover:bg-[#E5C158] cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>{tr('حفظ التغييرات', 'Save Changes')}</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
