import {
  AlertTriangle,
  ChevronLeft,
  Headset,
  Loader2,
  MessageCircle,
  ShieldCheck,
  UserCheck,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import type { PublicSupportOfficial, PublicSupportRank } from '../../types';
import { apiRequest } from '../../utils/api';
import { RankIconGlyph, getRankIconBoxClass } from './RankBadge';

interface SupportCenterModalProps {
  open: boolean;
  onClose: () => void;
}

export function SupportCenterModal({ open, onClose }: SupportCenterModalProps) {
  const { lang, tr } = useLanguage();
  const [ranks, setRanks] = useState<PublicSupportRank[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedRankId, setSelectedRankId] = useState<string | null>(null);

  const [selectedOfficial, setSelectedOfficial] =
    useState<PublicSupportOfficial | null>(null);
  const [contactLoading, setContactLoading] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);
  const [whatsappUrl, setWhatsappUrl] = useState<string | null>(null);

  const loadDirectory = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await apiRequest<{ ranks: PublicSupportRank[] }>(
        '/api/support/directory'
      );
      setRanks(data.ranks || []);
      if (data.ranks && data.ranks.length > 0) {
        setSelectedRankId((prev) =>
          prev && data.ranks.some((r) => r.id === prev) ? prev : data.ranks[0].id
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
      setSelectedOfficial(null);
      setWhatsappUrl(null);
      setContactError(null);
      loadDirectory();
    }
  }, [open, loadDirectory]);

  const handleSelectRank = (rankId: string) => {
    setSelectedRankId(rankId);
    setSelectedOfficial(null);
    setWhatsappUrl(null);
    setContactError(null);
  };

  const handleSelectOfficial = async (official: PublicSupportOfficial) => {
    setSelectedOfficial(official);
    setWhatsappUrl(null);
    setContactError(null);
    setContactLoading(true);
    try {
      const res = await apiRequest<{ whatsappUrl: string }>(
        `/api/support/officials/${encodeURIComponent(official.id)}/whatsapp-link`,
        { method: 'POST' }
      );
      setWhatsappUrl(res.whatsappUrl);
    } catch (err) {
      setContactError(
        err instanceof Error
          ? err.message
          : tr('تعذر تجهيز رابط التواصل الآن.', 'Could not prepare contact link.')
      );
    } finally {
      setContactLoading(false);
    }
  };

  if (!open) return null;

  const activeRank = ranks.find((r) => r.id === selectedRankId) || ranks[0] || null;

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
                {tr(
                  'اختر القسم الإداري المناسب لطلبك ثم اضغط على اسم المسؤول المتاح للتواصل المباشر.',
                  'Choose the administrative department, then select an available official to contact.'
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
                      onClick={() => handleSelectRank(rank.id)}
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
                          <div className="text-sm font-bold truncate">{rankName}</div>
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
                        <h3 className="text-base font-bold text-[#F5F0E6]">
                          {lang === 'ar' ? activeRank.nameAr : activeRank.nameEn}
                        </h3>
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
                            'يمكنك اختيار قسم آخر من القائمة أو فتح تذكرة دعم من داخل قسم Community وسيتم الرد عليك.',
                            'Please select another rank from the list or submit a support ticket in Community.'
                          )}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="text-xs font-semibold text-[#C8C2B8]">
                          {tr(
                            'اضغط على اسم المسؤول لبدء التواصل:',
                            'Click an official name to start contact:'
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {activeRank.officials.map((official) => {
                            const isOfficialSelected =
                              selectedOfficial?.id === official.id;
                            return (
                              <button
                                key={official.id}
                                type="button"
                                onClick={() => handleSelectOfficial(official)}
                                className={`text-start p-3.5 rounded-xl border transition-colors cursor-pointer space-y-1.5 ${
                                  isOfficialSelected
                                    ? 'bg-[#181611] border-[#D4AF37]/70'
                                    : 'bg-[#141418] border-white/10 hover:border-[#D4AF37]/45'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-sm font-bold text-[#F5F0E6] truncate">
                                    {official.displayName}
                                  </span>
                                  <RankIconGlyph
                                    icon={activeRank.badgeIcon}
                                    color={activeRank.badgeColor}
                                    className="w-4 h-4"
                                  />
                                </div>
                                {official.titleNote && (
                                  <p className="text-[11px] text-[#A8A29E] leading-snug">
                                    {official.titleNote}
                                  </p>
                                )}
                                <div className="text-[11px] text-emerald-300 flex items-center gap-1 pt-0.5">
                                  <MessageCircle className="w-3.5 h-3.5" />
                                  <span>
                                    {tr('متاح للتواصل المباشر', 'Available to contact')}
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>

                        {selectedOfficial && (
                          <div className="mt-4 p-4 rounded-xl bg-[#141418] border border-emerald-500/35 space-y-3">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 text-xs text-[#F5F0E6]">
                                <ShieldCheck className="w-4 h-4 text-[#D4AF37] shrink-0" />
                                <span>
                                  {tr('التواصل مع:', 'Contacting:')}{' '}
                                  <strong>{selectedOfficial.displayName}</strong>
                                </span>
                              </div>
                            </div>

                            {contactLoading ? (
                              <div className="flex items-center gap-2 text-xs text-[#A8A29E]">
                                <Loader2 className="w-4 h-4 animate-spin text-[#D4AF37]" />
                                <span>
                                  {tr(
                                    'جاري تجهيز قناة التواصل الآمنة...',
                                    'Preparing secure contact channel...'
                                  )}
                                </span>
                              </div>
                            ) : contactError ? (
                              <p className="text-xs text-red-300">{contactError}</p>
                            ) : whatsappUrl ? (
                              <div className="space-y-2.5">
                                <a
                                  href={whatsappUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-bold transition-colors"
                                >
                                  <MessageCircle className="w-4 h-4 shrink-0" />
                                  <span>
                                    {tr(
                                      `فتح محادثة WhatsApp مع ${selectedOfficial.displayName}`,
                                      `Chat on WhatsApp with ${selectedOfficial.displayName}`
                                    )}
                                  </span>
                                </a>
                                <p className="text-[11px] text-[#A8A29E]">
                                  {tr(
                                    'سيتم تحويلك مباشرة إلى WhatsApp دون عرض أرقام الهواتف داخل المنصة.',
                                    'Redirects directly to WhatsApp without displaying phone numbers inside the platform.'
                                  )}
                                </p>
                              </div>
                            ) : null}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Policy reminder */}
          <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-950/20 border border-amber-500/25 text-[11px] text-amber-200/90">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              {tr(
                'تنبيه: يُرجى الالتزام بالتواصل مع القسم المختص وفي حالات الحاجة الفعلية فقط.',
                'Notice: Please contact only the relevant department and strictly when genuinely needed.'
              )}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
