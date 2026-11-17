import {
  AlertTriangle,
  Check,
  ChevronLeft,
  Crown,
  Headset,
  Loader2,
  Pencil,
  Plus,
  ShieldCheck,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import type {
  PublicSupportLeader,
  PublicSupportRank,
  PublicSupportTeamMember,
} from '../../types';
import { apiRequest } from '../../utils/api';
import { hasAnyAdminPermission, isSuperAdminUser } from '../../utils/permissions';
import { RankIconGlyph, getRankIconBoxClass } from './RankBadge';
import { WhatsAppMark } from './WhatsAppMark';

interface SupportCenterModalProps {
  open: boolean;
  onClose: () => void;
}

type EditTarget =
  | { kind: 'leader'; name: string }
  | { kind: 'team'; id: string; name: string }
  | { kind: 'official'; id: string; name: string };

export function SupportCenterModal({ open, onClose }: SupportCenterModalProps) {
  const { user } = useAuth();
  const { lang, tr } = useLanguage();

  const canManageNumbers = Boolean(
    user &&
      (isSuperAdminUser(user) ||
        hasAnyAdminPermission(user, ['manage_officials', 'manage_support']))
  );

  const [leader, setLeader] = useState<PublicSupportLeader | null>(null);
  const [supportTeam, setSupportTeam] = useState<PublicSupportTeamMember[]>([]);
  const [ranks, setRanks] = useState<PublicSupportRank[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'supportTeam' | 'ranks'>('supportTeam');
  const [selectedRankId, setSelectedRankId] = useState<string | null>(null);

  // Admin inline "Add / Edit WhatsApp Number" state
  const [editingTarget, setEditingTarget] = useState<EditTarget | null>(null);
  const [phoneInput, setPhoneInput] = useState('');
  const [savingPhone, setSavingPhone] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  const loadDirectory = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await apiRequest<{
        leader?: PublicSupportLeader;
        supportTeam?: PublicSupportTeamMember[];
        ranks: PublicSupportRank[];
      }>('/api/support/directory');
      setLeader(data.leader || null);
      setSupportTeam(data.supportTeam || []);
      const rankList = data.ranks || [];
      setRanks(rankList);
      if (rankList.length > 0) {
        setSelectedRankId((prev) =>
          prev && rankList.some((r) => r.id === prev) ? prev : rankList[0].id
        );
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : tr('تعذر تحميل أقسام الدعم الفني.', 'Failed to load support directory.')
      );
    } finally {
      setLoading(false);
    }
  }, [tr]);

  useEffect(() => {
    if (open) {
      setEditingTarget(null);
      setPhoneInput('');
      setPhoneError(null);
      setStatusMsg(null);
      setActiveTab('supportTeam');
      loadDirectory();
    }
  }, [open, loadDirectory]);

  const startEditingNumber = (target: EditTarget) => {
    setEditingTarget(target);
    setPhoneInput('');
    setPhoneError(null);
    setStatusMsg(null);
  };

  const handleSavePhoneNumber = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTarget) return;
    if (!phoneInput.trim()) {
      setPhoneError(tr('يرجى إدخال رقم الواتساب أولاً.', 'Please enter a WhatsApp number.'));
      return;
    }

    setSavingPhone(true);
    setPhoneError(null);
    try {
      if (editingTarget.kind === 'leader') {
        await apiRequest('/api/admin/support/leader-whatsapp', {
          method: 'PATCH',
          body: JSON.stringify({ whatsappNumber: phoneInput.trim() }),
        });
      } else if (editingTarget.kind === 'team') {
        await apiRequest(
          `/api/admin/support-team/${encodeURIComponent(editingTarget.id)}`,
          {
            method: 'PATCH',
            body: JSON.stringify({ whatsappNumber: phoneInput.trim() }),
          }
        );
      } else {
        await apiRequest(
          `/api/admin/officials/${encodeURIComponent(editingTarget.id)}`,
          {
            method: 'PATCH',
            body: JSON.stringify({ whatsappNumber: phoneInput.trim() }),
          }
        );
      }

      const targetName = editingTarget.name;
      setEditingTarget(null);
      setPhoneInput('');
      await loadDirectory();
      setStatusMsg(
        tr(
          `تم حفظ رقم واتساب (${targetName}) بنجاح.`,
          `WhatsApp number saved for ${targetName}.`
        )
      );
      window.setTimeout(() => setStatusMsg(null), 3500);
    } catch (err) {
      setPhoneError(
        err instanceof Error
          ? err.message
          : tr('تعذر حفظ رقم الواتساب.', 'Could not save WhatsApp number.')
      );
    } finally {
      setSavingPhone(false);
    }
  };

  if (!open) return null;

  const activeRank = ranks.find((r) => r.id === selectedRankId) || ranks[0] || null;

  const isEditing = (kind: EditTarget['kind'], id?: string) => {
    if (!editingTarget || editingTarget.kind !== kind) return false;
    if (kind === 'leader') return true;
    return 'id' in editingTarget && editingTarget.id === id;
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="support-center-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 sm:p-5"
    >
      <div className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl bg-[#121216] border border-[#D4AF37]/35 shadow-[0_24px_80px_rgba(0,0,0,0.85)] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-white/10 bg-[#0D0D10]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#D4AF37]/15 border border-[#D4AF37]/40 flex items-center justify-center text-[#E5C158]">
              <Headset className="w-5 h-5" />
            </div>
            <div>
              <h2
                id="support-center-title"
                className="font-display text-lg sm:text-xl font-bold text-[#F5F0E6]"
              >
                {tr('مركز الدعم الفني والتواصل الإداري', 'Technical Support & Administration')}
              </h2>
              <p className="text-xs text-[#A8A29E]">
                {canManageNumbers
                  ? tr(
                      'بصفتك أدمن يمكنك إضافة أو تعديل رقم الواتساب بجانب كل اسم مباشرة.',
                      'As Admin, you can add or update the WhatsApp number beside each name.'
                    )
                  : tr(
                      'اضغط على علامة الواتساب بجانب أي اسم للتحويل مباشرة إلى محادثة WhatsApp.',
                      'Click the WhatsApp icon beside any name to open WhatsApp chat directly.'
                    )}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={tr('إغلاق نافذة الدعم الفني', 'Close support center')}
            className="w-10 h-10 rounded-xl bg-[#18181D] border border-white/10 text-[#C8C2B8] hover:text-white hover:border-[#D4AF37]/50 flex items-center justify-center cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {statusMsg && (
            <div className="p-3 rounded-xl bg-emerald-950/35 border border-emerald-500/40 text-xs text-emerald-200 flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0" />
              <span>{statusMsg}</span>
            </div>
          )}

          {/* Platform Leader Card (ليدر المنصة — للضرورة) */}
          {leader && !loading && !errorMsg && (
            <div className="p-4 rounded-2xl bg-gradient-to-l from-[#1C1810] via-[#141316] to-[#121216] border border-[#D4AF37]/45 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-[#D4AF37]/20 border border-[#D4AF37]/50 flex items-center justify-center text-[#F5D061] shrink-0">
                    <Crown className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-[#E5C158]">
                        {lang === 'ar' ? leader.titleAr : leader.titleEn}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/20 border border-amber-400/50 text-[11px] font-bold text-amber-200">
                        <AlertTriangle className="w-3 h-3 shrink-0" />
                        <span>
                          {lang === 'ar' ? leader.urgencyNoteAr : leader.urgencyNoteEn}
                        </span>
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm sm:text-base font-bold text-[#F5F0E6] truncate">
                        {leader.displayName}
                      </span>

                      {leader.hasWhatsapp && leader.whatsappUrl ? (
                        <a
                          href={leader.whatsappUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={tr(
                            `تواصل واتساب مع ${leader.displayName} (للضرورة)`,
                            `WhatsApp ${leader.displayName} (Urgent Only)`
                          )}
                          aria-label={tr(
                            `واتساب ${leader.displayName}`,
                            `WhatsApp ${leader.displayName}`
                          )}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#25D366]/15 border border-[#25D366]/55 text-[#4ADE80] hover:bg-[#25D366] hover:text-[#052E16] text-xs font-bold transition-all"
                        >
                          <WhatsAppMark className="w-4 h-4 shrink-0" />
                          <span>{tr('واتساب', 'WhatsApp')}</span>
                        </a>
                      ) : (
                        <span
                          title={tr('لم يُضف رقم واتساب بعد', 'No WhatsApp number yet')}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white/5 border border-white/10 text-[11px] text-[#A8A29E] opacity-70"
                        >
                          <WhatsAppMark className="w-3.5 h-3.5 grayscale" />
                          <span>{tr('غير مضاف', 'Not set')}</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {canManageNumbers && (
                  <button
                    type="button"
                    onClick={() =>
                      startEditingNumber({ kind: 'leader', name: leader.displayName })
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#D4AF37]/15 border border-[#D4AF37]/45 text-xs font-bold text-[#F5D061] hover:bg-[#D4AF37] hover:text-[#09090B] transition-colors cursor-pointer shrink-0"
                  >
                    {leader.hasWhatsapp ? (
                      <>
                        <Pencil className="w-3.5 h-3.5" />
                        <span>{tr('تعديل الرقم', 'Edit Number')}</span>
                      </>
                    ) : (
                      <>
                        <Plus className="w-3.5 h-3.5" />
                        <span>{tr('إضافة رقم', 'Add Number')}</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              {isEditing('leader') && (
                <form
                  onSubmit={handleSavePhoneNumber}
                  className="pt-3 border-t border-white/10 flex flex-col sm:flex-row items-stretch sm:items-center gap-2"
                >
                  <input
                    type="text"
                    dir="ltr"
                    required
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    placeholder="01012345678"
                    aria-label={tr('رقم واتساب ليدر المنصة', 'Platform Leader WhatsApp Number')}
                    className="flex-1 px-3 py-2 rounded-xl bg-[#09090B] border border-[#D4AF37]/40 text-xs text-[#F5F0E6] font-mono"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      disabled={savingPhone}
                      className="px-3.5 py-2 rounded-xl bg-[#D4AF37] text-[#09090B] text-xs font-bold hover:bg-[#E5C158] disabled:opacity-50 cursor-pointer"
                    >
                      {savingPhone ? tr('حفظ...', 'Saving...') : tr('حفظ الرقم', 'Save')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingTarget(null)}
                      className="px-3 py-2 rounded-xl bg-[#18181D] border border-white/15 text-xs text-[#C8C2B8] cursor-pointer"
                    >
                      {tr('إلغاء', 'Cancel')}
                    </button>
                  </div>
                  {phoneError && (
                    <p className="text-[11px] text-red-300 w-full">{phoneError}</p>
                  )}
                </form>
              )}
            </div>
          )}

          {/* Switcher Tabs */}
          <div className="flex flex-wrap items-center gap-2 border-b border-white/10 pb-3">
            <button
              type="button"
              onClick={() => {
                setActiveTab('supportTeam');
                setEditingTarget(null);
              }}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                activeTab === 'supportTeam'
                  ? 'bg-[#D4AF37] text-[#09090B] border-[#D4AF37]'
                  : 'bg-[#0D0D10] text-[#C8C2B8] border-white/10 hover:border-[#D4AF37]/40'
              }`}
            >
              <Headset className="w-4 h-4" />
              <span>{tr('فريق الدعم الفني المعتمد', 'Technical Support Team')}</span>
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono tabular-nums ${
                  activeTab === 'supportTeam'
                    ? 'bg-[#09090B]/20 text-[#09090B]'
                    : 'bg-white/10 text-[#E5C158]'
                }`}
              >
                {supportTeam.length}/7
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('ranks');
                setEditingTarget(null);
              }}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                activeTab === 'ranks'
                  ? 'bg-[#D4AF37] text-[#09090B] border-[#D4AF37]'
                  : 'bg-[#0D0D10] text-[#C8C2B8] border-white/10 hover:border-[#D4AF37]/40'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>{tr('الأقسام والرتب الإدارية', 'Administrative Departments')}</span>
            </button>
          </div>

          {loading ? (
            <div className="py-12 text-center space-y-2 text-xs text-[#A8A29E]">
              <Loader2 className="w-6 h-6 animate-spin text-[#D4AF37] mx-auto" />
              <p>{tr('جاري تحميل أقسام الدعم والمسؤولين...', 'Loading support departments...')}</p>
            </div>
          ) : errorMsg ? (
            <div className="p-4 rounded-xl bg-red-950/30 border border-red-500/40 text-xs text-red-200 flex items-center justify-between gap-3">
              <span>{errorMsg}</span>
              <button
                type="button"
                onClick={loadDirectory}
                className="px-3 py-1.5 rounded-lg bg-red-900/50 hover:bg-red-800 text-white font-semibold cursor-pointer"
              >
                {tr('إعادة المحاولة', 'Retry')}
              </button>
            </div>
          ) : activeTab === 'supportTeam' ? (
            <div className="space-y-4">
              {supportTeam.length === 0 ? (
                <div className="py-10 px-4 rounded-2xl bg-[#0D0D10] border border-white/10 text-center space-y-3">
                  <Headset className="w-8 h-8 text-[#D4AF37]/60 mx-auto" />
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-[#F5F0E6]">
                      {tr(
                        'لم يتم تفعيل أعضاء فريق الدعم الفني بعد',
                        'No Technical Support Team members are active yet'
                      )}
                    </p>
                    <p className="text-xs text-[#A8A29E] max-w-md mx-auto">
                      {tr(
                        'يقوم الأدمن باختيار 7 أعضاء لفريق الدعم الفني من لوحة الإدارة. يمكنك التواصل مع ليدر المنصة أعلاه عند الضرورة أو تصفح الأقسام الإدارية.',
                        'The Admin selects up to 7 support team members from the Admin panel. You can contact the Platform Leader above if urgent or view Administrative Ranks.'
                      )}
                    </p>
                  </div>
                  {ranks.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setActiveTab('ranks')}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#D4AF37]/15 border border-[#D4AF37]/40 text-xs font-semibold text-[#E5C158] hover:bg-[#D4AF37]/25 cursor-pointer"
                    >
                      <Users className="w-3.5 h-3.5" />
                      <span>{tr('عرض الأقسام الإدارية', 'View Administrative Ranks')}</span>
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <div className="text-xs text-[#C8C2B8]">
                    {canManageNumbers
                      ? tr(
                          'أعضاء فريق الدعم الفني (7 مقاعد) — اضغط على "إضافة رقم" أو "تعديل الرقم" بجانب أي اسم:',
                          'Technical Support Team (7 seats) — click Add/Edit Number next to any name:'
                        )
                      : tr(
                          'اضغط على علامة الواتساب بجانب أي اسم لبدء محادثة WhatsApp مباشرة:',
                          'Click the WhatsApp icon beside any name to open WhatsApp directly:'
                        )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {supportTeam.map((member) => {
                      const editingThis = isEditing('team', member.id);

                      return (
                        <div
                          key={member.id}
                          className="p-4 rounded-xl bg-[#0D0D10] border border-white/10 hover:border-[#D4AF37]/45 transition-colors space-y-2.5 flex flex-col justify-between"
                        >
                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#D4AF37]/15 border border-[#D4AF37]/30 text-[10px] font-mono tabular-nums text-[#F5D061] font-bold">
                                #{member.slotNumber}
                              </span>
                              <Headset className="w-4 h-4 text-[#D4AF37] shrink-0" />
                            </div>

                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-bold text-[#F5F0E6] truncate">
                                {member.displayName}
                              </span>

                              {member.hasWhatsapp && member.whatsappUrl ? (
                                <a
                                  href={member.whatsappUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title={tr(
                                    `فتح واتساب مع ${member.displayName}`,
                                    `Chat on WhatsApp with ${member.displayName}`
                                  )}
                                  aria-label={tr(
                                    `واتساب ${member.displayName}`,
                                    `WhatsApp ${member.displayName}`
                                  )}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[#25D366]/15 border border-[#25D366]/55 text-[#4ADE80] hover:bg-[#25D366] hover:text-[#052E16] text-[11px] font-bold transition-all shrink-0"
                                >
                                  <WhatsAppMark className="w-4 h-4 shrink-0" />
                                  <span>{tr('واتس', 'WA')}</span>
                                </a>
                              ) : (
                                <span
                                  title={tr('لم يُضف رقم واتساب بعد', 'No WhatsApp number yet')}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white/5 border border-white/10 text-[10px] text-[#A8A29E] opacity-75 shrink-0"
                                >
                                  <WhatsAppMark className="w-3.5 h-3.5 grayscale" />
                                </span>
                              )}
                            </div>

                            {member.specialty ? (
                              <p className="text-xs text-[#A8A29E] line-clamp-2 leading-snug">
                                {member.specialty}
                              </p>
                            ) : (
                              <p className="text-xs text-[#A8A29E]">
                                {tr('دعم فني ومساعدة الطلاب', 'Technical & Student Support')}
                              </p>
                            )}
                          </div>

                          {canManageNumbers ? (
                            <div className="pt-2 border-t border-white/10 space-y-2">
                              <button
                                type="button"
                                onClick={() =>
                                  startEditingNumber({
                                    kind: 'team',
                                    id: member.id,
                                    name: member.displayName,
                                  })
                                }
                                className={`w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                                  member.hasWhatsapp
                                    ? 'bg-[#18181D] border-white/15 text-[#E5C158] hover:border-[#D4AF37]/50'
                                    : 'bg-[#D4AF37]/15 border-[#D4AF37]/45 text-[#F5D061] hover:bg-[#D4AF37] hover:text-[#09090B]'
                                }`}
                              >
                                {member.hasWhatsapp ? (
                                  <>
                                    <Pencil className="w-3.5 h-3.5" />
                                    <span>{tr('تعديل الرقم', 'Edit Number')}</span>
                                  </>
                                ) : (
                                  <>
                                    <Plus className="w-3.5 h-3.5" />
                                    <span>{tr('إضافة رقم', 'Add Number')}</span>
                                  </>
                                )}
                              </button>

                              {editingThis && (
                                <form onSubmit={handleSavePhoneNumber} className="space-y-1.5">
                                  <input
                                    type="text"
                                    dir="ltr"
                                    required
                                    value={phoneInput}
                                    onChange={(e) => setPhoneInput(e.target.value)}
                                    placeholder="01012345678"
                                    className="w-full px-2.5 py-1.5 rounded-lg bg-[#09090B] border border-[#D4AF37]/40 text-xs text-[#F5F0E6] font-mono"
                                  />
                                  {phoneError && (
                                    <p className="text-[11px] text-red-300">{phoneError}</p>
                                  )}
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      type="submit"
                                      disabled={savingPhone}
                                      className="flex-1 py-1.5 rounded-lg bg-[#D4AF37] text-[#09090B] text-[11px] font-bold cursor-pointer disabled:opacity-50"
                                    >
                                      {savingPhone ? tr('حفظ...', 'Saving...') : tr('حفظ', 'Save')}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEditingTarget(null)}
                                      className="px-2.5 py-1.5 rounded-lg bg-[#18181D] border border-white/15 text-[11px] text-[#C8C2B8] cursor-pointer"
                                    >
                                      {tr('إلغاء', 'Cancel')}
                                    </button>
                                  </div>
                                </form>
                              )}
                            </div>
                          ) : member.hasWhatsapp && member.whatsappUrl ? (
                            <a
                              href={member.whatsappUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center justify-center gap-2 w-full px-3 py-2 rounded-lg bg-emerald-600/20 border border-emerald-500/45 text-emerald-200 hover:bg-emerald-600 hover:text-white text-xs font-bold transition-colors"
                            >
                              <WhatsAppMark className="w-4 h-4 shrink-0" />
                              <span>{tr('تواصل مباشر على واتساب', 'Chat on WhatsApp')}</span>
                            </a>
                          ) : (
                            <div className="text-[11px] text-[#A8A29E] pt-1">
                              {tr('لم يتم إضافة رقم واتساب بعد', 'WhatsApp number not added yet')}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          ) : ranks.length === 0 ? (
            <div className="py-10 text-center space-y-2 text-sm text-[#A8A29E]">
              <Headset className="w-8 h-8 text-[#D4AF37]/60 mx-auto" />
              <p>
                {tr(
                  'لا توجد أقسام دعم مفعلة للعرض حالياً.',
                  'No support departments are currently visible.'
                )}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              {/* Rank Categories List */}
              <div className="lg:col-span-5 space-y-2">
                <div className="text-xs font-semibold text-[#C8C2B8] mb-2">
                  {tr('أقسام الرتب الإدارية', 'Administrative Ranks')}
                </div>
                {ranks.map((rank) => {
                  const isSelected = activeRank?.id === rank.id;
                  const rankName = lang === 'ar' ? rank.nameAr : rank.nameEn;
                  return (
                    <button
                      key={rank.id}
                      type="button"
                      onClick={() => {
                        setSelectedRankId(rank.id);
                        setEditingTarget(null);
                      }}
                      className={`w-full text-start p-3 rounded-xl border transition-colors flex items-center justify-between gap-3 cursor-pointer ${
                        isSelected
                          ? 'bg-[#1A1812] border-[#D4AF37]/65 text-[#F5F0E6]'
                          : 'bg-[#0D0D10] border-white/10 text-[#C8C2B8] hover:border-[#D4AF37]/35'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 ${getRankIconBoxClass(
                            rank.badgeColor
                          )}`}
                        >
                          <RankIconGlyph
                            icon={rank.badgeIcon}
                            color={rank.badgeColor}
                            className="w-4 h-4"
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-sm font-bold truncate">{rankName}</span>
                            {rank.isSuperAdminRank && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-400/45 text-[10px] font-bold text-amber-200">
                                {tr('ليدر المنصة · للضرورة', 'Leader · Urgent')}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-[#A8A29E] tabular-nums">
                            {rank.officials.length > 0
                              ? tr(
                                  `${rank.officials.length} مسؤول متاح`,
                                  `${rank.officials.length} available`
                                )
                              : tr('لا يوجد مسؤول متاح', 'Unavailable')}
                          </div>
                        </div>
                      </div>
                      <ChevronLeft
                        className={`w-4 h-4 shrink-0 transition-transform ${
                          lang === 'en' ? 'rotate-180' : ''
                        } ${isSelected ? 'text-[#D4AF37]' : 'text-[#6B665E]'}`}
                      />
                    </button>
                  );
                })}
              </div>

              {/* Officials in Selected Rank */}
              <div className="lg:col-span-7 rounded-2xl bg-[#0D0D10] border border-white/10 p-4 sm:p-5 space-y-4">
                {activeRank && (
                  <>
                    <div className="flex items-start gap-3 pb-3 border-b border-white/10">
                      <div
                        className={`w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 ${getRankIconBoxClass(
                          activeRank.badgeColor
                        )}`}
                      >
                        <RankIconGlyph
                          icon={activeRank.badgeIcon}
                          color={activeRank.badgeColor}
                          className="w-5 h-5"
                        />
                      </div>
                      <div className="space-y-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-bold text-[#F5F0E6]">
                            {lang === 'ar' ? activeRank.nameAr : activeRank.nameEn}
                          </h3>
                          {activeRank.isSuperAdminRank && (
                            <span className="px-2 py-0.5 rounded-md bg-amber-500/20 border border-amber-400/50 text-[11px] font-bold text-amber-200">
                              {tr('ليدر المنصة · للضرورة', 'Platform Leader · Urgent Only')}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[#A8A29E] leading-relaxed">
                          {activeRank.description}
                        </p>
                      </div>
                    </div>

                    {activeRank.officials.length === 0 ? (
                      <div className="py-10 text-center space-y-2.5">
                        <div className="mx-auto w-11 h-11 rounded-xl bg-[#18181D] border border-white/10 flex items-center justify-center text-[#A8A29E]">
                          <UserCheck className="w-5 h-5" />
                        </div>
                        <p className="text-sm font-semibold text-[#F5F0E6]">
                          {tr(
                            'لا يوجد مسؤول متاح حالياً في هذا القسم',
                            'No official is currently available in this department'
                          )}
                        </p>
                        <p className="text-xs text-[#A8A29E] max-w-md mx-auto leading-relaxed">
                          {tr(
                            'يمكنك التواصل مع فريق الدعم الفني المعتمد أو ليدر المنصة للضرورة أعلاه.',
                            'You can contact the Technical Support Team or Platform Leader above if urgent.'
                          )}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="text-xs font-semibold text-[#C8C2B8]">
                          {canManageNumbers
                            ? tr(
                                'يمكنك إضافة أو تعديل رقم الواتساب بجانب كل مسؤول:',
                                'Add or edit the WhatsApp number beside any official:'
                              )
                            : tr(
                                'اضغط على علامة الواتساب بجانب اسم المسؤول للتحويل مباشرة إلى WhatsApp:',
                                'Click the WhatsApp icon beside an official to open WhatsApp directly:'
                              )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {activeRank.officials.map((official) => {
                            const editingThis = isEditing('official', official.id);
                            return (
                              <div
                                key={official.id}
                                className="p-3.5 rounded-xl bg-[#141418] border border-white/10 hover:border-[#D4AF37]/45 transition-colors space-y-2.5"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-sm font-bold text-[#F5F0E6] truncate">
                                    {official.displayName}
                                  </span>

                                  {official.hasWhatsapp && official.whatsappUrl ? (
                                    <a
                                      href={official.whatsappUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      title={tr(
                                        `فتح واتساب مع ${official.displayName}`,
                                        `Chat on WhatsApp with ${official.displayName}`
                                      )}
                                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[#25D366]/15 border border-[#25D366]/55 text-[#4ADE80] hover:bg-[#25D366] hover:text-[#052E16] text-[11px] font-bold transition-all shrink-0"
                                    >
                                      <WhatsAppMark className="w-4 h-4 shrink-0" />
                                      <span>{tr('واتس', 'WA')}</span>
                                    </a>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white/5 border border-white/10 text-[10px] text-[#A8A29E] opacity-75 shrink-0">
                                      <WhatsAppMark className="w-3.5 h-3.5 grayscale" />
                                    </span>
                                  )}
                                </div>

                                {official.titleNote && (
                                  <p className="text-[11px] text-[#A8A29E] leading-snug">
                                    {official.titleNote}
                                  </p>
                                )}

                                {canManageNumbers ? (
                                  <div className="pt-1.5 border-t border-white/10 space-y-1.5">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        startEditingNumber({
                                          kind: 'official',
                                          id: official.id,
                                          name: official.displayName,
                                        })
                                      }
                                      className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#D4AF37]/15 border border-[#D4AF37]/40 text-[11px] font-bold text-[#F5D061] hover:bg-[#D4AF37] hover:text-[#09090B] transition-colors cursor-pointer"
                                    >
                                      {official.hasWhatsapp ? (
                                        <>
                                          <Pencil className="w-3 h-3" />
                                          <span>{tr('تعديل الرقم', 'Edit Number')}</span>
                                        </>
                                      ) : (
                                        <>
                                          <Plus className="w-3 h-3" />
                                          <span>{tr('إضافة رقم', 'Add Number')}</span>
                                        </>
                                      )}
                                    </button>

                                    {editingThis && (
                                      <form onSubmit={handleSavePhoneNumber} className="space-y-1.5">
                                        <input
                                          type="text"
                                          dir="ltr"
                                          required
                                          value={phoneInput}
                                          onChange={(e) => setPhoneInput(e.target.value)}
                                          placeholder="01012345678"
                                          className="w-full px-2.5 py-1.5 rounded-lg bg-[#09090B] border border-[#D4AF37]/40 text-xs text-[#F5F0E6] font-mono"
                                        />
                                        {phoneError && (
                                          <p className="text-[11px] text-red-300">{phoneError}</p>
                                        )}
                                        <div className="flex items-center gap-1.5">
                                          <button
                                            type="submit"
                                            disabled={savingPhone}
                                            className="flex-1 py-1.5 rounded-lg bg-[#D4AF37] text-[#09090B] text-[11px] font-bold cursor-pointer disabled:opacity-50"
                                          >
                                            {savingPhone ? tr('حفظ...', 'Saving...') : tr('حفظ', 'Save')}
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => setEditingTarget(null)}
                                            className="px-2.5 py-1.5 rounded-lg bg-[#18181D] border border-white/15 text-[11px] text-[#C8C2B8] cursor-pointer"
                                          >
                                            {tr('إلغاء', 'Cancel')}
                                          </button>
                                        </div>
                                      </form>
                                    )}
                                  </div>
                                ) : official.hasWhatsapp && official.whatsappUrl ? (
                                  <a
                                    href={official.whatsappUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center justify-center gap-1.5 w-full px-3 py-1.5 rounded-lg bg-emerald-600/20 border border-emerald-500/45 text-emerald-200 hover:bg-emerald-600 hover:text-white text-[11px] font-bold transition-colors"
                                  >
                                    <WhatsAppMark className="w-3.5 h-3.5 shrink-0" />
                                    <span>{tr('تواصل عبر واتساب', 'Open WhatsApp')}</span>
                                  </a>
                                ) : (
                                  <div className="text-[11px] text-[#A8A29E]">
                                    {tr('لم يتم إضافة رقم بعد', 'No number added yet')}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Policy reminder */}
          <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-950/20 border border-amber-500/25 text-[11px] text-amber-200/90">
            <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              {tr(
                'تنبيه: التواصل مع ليدر المنصة للضرورة القصوى فقط، ويُرجى الالتزام بالتواصل مع القسم المختص عند الحاجة الفعلية.',
                'Notice: Contacting the Platform Leader is strictly for urgent cases only. Please reach out to the relevant support team when genuinely needed.'
              )}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
