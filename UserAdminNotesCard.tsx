import { Loader2, MessageSquareHeart, ShieldCheck, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import type { NoteReactionEmoji, UserProfileNote } from '../../types';
import { apiRequest } from '../../utils/api';

const REACTION_OPTIONS: Array<{ emoji: NoteReactionEmoji; labelAr: string; labelEn: string }> = [
  { emoji: '👍', labelAr: 'ممتاز', labelEn: 'Like' },
  { emoji: '❤️', labelAr: 'شكراً', labelEn: 'Love' },
  { emoji: '👏', labelAr: 'تقدير', labelEn: 'Clap' },
  { emoji: '🔥', labelAr: 'حماس', labelEn: 'Fire' },
  { emoji: '💡', labelAr: 'فهمت', labelEn: 'Got it' },
  { emoji: '✅', labelAr: 'تم الاطلاع', labelEn: 'Acknowledged' },
];

interface UserAdminNotesCardProps {
  hideWhenEmpty?: boolean;
  outerClassName?: string;
}

export function UserAdminNotesCard({
  hideWhenEmpty = false,
  outerClassName,
}: UserAdminNotesCardProps) {
  const { user } = useAuth();
  const { lang, tr } = useLanguage();
  const [notes, setNotes] = useState<UserProfileNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [reactingId, setReactingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadNotes = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await apiRequest<{ notes: UserProfileNote[] }>('/api/account/notes');
      setNotes(res.notes || []);
    } catch {
      // Ignore silent load failures
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  const handleReact = async (noteId: string, emoji: NoteReactionEmoji) => {
    setReactingId(noteId);
    setErrorMsg(null);
    try {
      const res = await apiRequest<{ note: UserProfileNote }>(
        `/api/account/notes/${encodeURIComponent(noteId)}/react`,
        {
          method: 'POST',
          body: JSON.stringify({ emoji }),
        }
      );
      setNotes((prev) => prev.map((n) => (n.id === noteId ? res.note : n)));
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : tr('تعذر تسجيل التفاعل الآن.', 'Could not save reaction.')
      );
    } finally {
      setReactingId(null);
    }
  };

  if (!user) return null;
  if (loading && hideWhenEmpty) return null;
  if (!loading && notes.length === 0 && hideWhenEmpty) return null;

  const formatDateTime = (iso: string) => {
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

  const cardContent = (
    <div className="p-4 sm:p-5 rounded-xl bg-[#0D0D10] border border-[#D4AF37]/30 space-y-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <MessageSquareHeart className="w-4 h-4 text-[#D4AF37]" />
          <h3 className="font-display text-sm font-bold text-[#E5C158]">
            {tr('ملاحظات الإدارة على ملفك الشخصي', 'Admin Notes on Your Profile')}
          </h3>
          {notes.length > 0 && (
            <span className="text-[11px] font-mono tabular-nums px-2 py-0.5 rounded-md bg-[#D4AF37]/15 text-[#F5D061]">
              {notes.length}
            </span>
          )}
        </div>
        <span className="text-[11px] text-[#A8A29E] flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-[#D4AF37]" />
          <span>{tr('تفاعل بالرياكت فقط', 'Reactions Only')}</span>
        </span>
      </div>

      {errorMsg && (
        <div className="p-2.5 rounded-lg bg-red-950/40 border border-red-500/40 text-xs text-red-200">
          {errorMsg}
        </div>
      )}

      {loading ? (
        <div className="py-4 flex items-center justify-center gap-2 text-xs text-[#A8A29E]">
          <Loader2 className="w-4 h-4 animate-spin text-[#D4AF37]" />
          <span>{tr('جاري تحميل ملاحظات الإدارة...', 'Loading admin notes...')}</span>
        </div>
      ) : notes.length === 0 ? (
        <p className="text-xs text-[#A8A29E]">
          {tr(
            'لا توجد ملاحظات إدارية مضافة على ملفك الشخصي حالياً.',
            'No admin notes have been added to your profile yet.'
          )}
        </p>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => {
            const myReaction = (note.reactions || []).find((r) => r.userId === user.id);
            const isBusy = reactingId === note.id;

            return (
              <div
                key={note.id}
                className="p-3.5 rounded-xl bg-[#121216] border border-white/10 space-y-2.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                  <span className="inline-flex items-center gap-1.5 font-semibold text-[#E5C158]">
                    <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                    <span>{note.authorName}</span>
                  </span>
                  <span className="font-mono tabular-nums text-[#A8A29E]">
                    {formatDateTime(note.createdAt)}
                  </span>
                </div>

                <p className="text-xs sm:text-sm text-[#F5F0E6] leading-relaxed whitespace-pre-wrap">
                  {note.content}
                </p>

                {/* Reaction-only emoji bar (no text replies allowed) */}
                <div className="pt-2 border-t border-white/10 flex flex-wrap items-center justify-between gap-2">
                  <div
                    className="flex flex-wrap items-center gap-1.5"
                    role="group"
                    aria-label={tr('تفاعل بالرياكت على الملاحظة', 'React to admin note')}
                  >
                    {REACTION_OPTIONS.map((opt) => {
                      const active = myReaction?.emoji === opt.emoji;
                      return (
                        <button
                          key={opt.emoji}
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleReact(note.id, opt.emoji)}
                          title={lang === 'ar' ? opt.labelAr : opt.labelEn}
                          aria-pressed={active}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border transition-all cursor-pointer disabled:opacity-50 ${
                            active
                              ? 'bg-[#D4AF37]/25 border-[#D4AF37] text-[#FFF1B8] scale-105 shadow-[0_0_12px_rgba(212,175,55,0.3)]'
                              : 'bg-[#18181D] border-white/10 text-[#C8C2B8] hover:border-[#D4AF37]/50 hover:bg-[#1E1B14]'
                          }`}
                        >
                          <span className="text-sm leading-none">{opt.emoji}</span>
                          {active && (
                            <span className="text-[10px] font-semibold">
                              {lang === 'ar' ? opt.labelAr : opt.labelEn}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {myReaction && (
                    <span className="text-[11px] text-emerald-300 font-medium">
                      {tr('تم التفاعل بـ', 'Reacted with')} {myReaction.emoji}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  return outerClassName ? <div className={outerClassName}>{cardContent}</div> : cardContent;
}
