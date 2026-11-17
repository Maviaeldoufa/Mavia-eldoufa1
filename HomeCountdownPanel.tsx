import { BellRing, Plus, Trash2 } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import type { AnnouncementCountdown } from '../../types';
import { apiRequest } from '../../utils/api';
import { CountdownTimer } from '../ui/CountdownTimer';
import { GoldChip } from '../ui/GoldChip';

function defaultTargetDatetime(): string {
  const d = new Date(Date.now() + 3 * 86400000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T10:00`;
}

export function HomeCountdownPanel() {
  const { user } = useAuth();
  const { tr } = useLanguage();
  const isAdmin = user?.role === 'admin';

  const [announcements, setAnnouncements] = useState<AnnouncementCountdown[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<'exam' | 'news'>('exam');
  const [targetAt, setTargetAt] = useState(defaultTargetDatetime);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<{ announcements: AnnouncementCountdown[] }>(
      '/api/announcements?scope=home'
    )
      .then((res) => setAnnouncements(res.announcements))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !targetAt) return;
    setSaving(true);
    setError(null);
    try {
      const res = await apiRequest<{ announcement: AnnouncementCountdown }>(
        '/api/announcements',
        {
          method: 'POST',
          body: JSON.stringify({
            scope: 'home',
            title: title.trim(),
            description: description.trim(),
            category,
            targetAt: new Date(targetAt).toISOString(),
          }),
        }
      );
      setAnnouncements((prev) => [res.announcement, ...prev]);
      setTitle('');
      setDescription('');
      setShowAdd(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : tr('تعذر نشر المؤقت.', 'Could not publish countdown.')
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setError(null);
    try {
      await apiRequest(`/api/announcements/${id}`, { method: 'DELETE' });
      setAnnouncements((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : tr('تعذر حذف المؤقت.', 'Could not delete countdown.')
      );
    }
  };

  if (!loading && announcements.length === 0 && !isAdmin) {
    return null;
  }

  return (
    <section className="rounded-2xl bg-[#121216] border border-[#D4AF37]/30 p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <BellRing className="w-5 h-5 text-[#D4AF37]" />
            <h2 className="font-display text-xl font-bold text-[#F5F0E6]">
              {tr('أخبار الامتحانات والمواعيد القادمة', 'Upcoming Exams & News Countdowns')}
            </h2>
          </div>
          <p className="text-xs text-[#A8A29E]">
            {tr(
              'تابع العد التنازلي للامتحانات والمراجعات القادمة مباشرة',
              'Live countdowns for upcoming exams, deadlines, and announcements'
            )}
          </p>
        </div>

        {isAdmin && (
          <GoldChip
            active={showAdd}
            onClick={() => setShowAdd((p) => !p)}
            className="text-xs px-3.5 py-2 self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>
              {showAdd
                ? tr('إغلاق', 'Close')
                : tr('إضافة مؤقت امتحان / خبر', 'Add Exam Countdown')}
            </span>
          </GoldChip>
        )}
      </div>

      {error && (
        <div role="alert" className="p-3 rounded-xl bg-red-950/50 border border-red-500/40 text-red-200 text-xs">
          {error}
        </div>
      )}

      {isAdmin && showAdd && (
        <form
          onSubmit={handleCreate}
          className="p-4 rounded-xl bg-[#09090B] border border-[#D4AF37]/35 space-y-3"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={tr('عنوان الخبر أو الامتحان (مثال: امتحان GIS العملي)', 'Exam / News title')}
              className="sm:col-span-2 px-3 py-2 rounded-lg bg-[#151519] border border-white/10 text-sm text-[#F5F0E6] focus:outline-none focus:border-[#D4AF37]"
            />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as 'exam' | 'news')}
              className="px-3 py-2 rounded-lg bg-[#151519] border border-white/10 text-sm text-[#F5F0E6] focus:outline-none focus:border-[#D4AF37]"
            >
              <option value="exam">{tr('خبر امتحان قادم', 'Upcoming Exam')}</option>
              <option value="news">{tr('خبر / تنبيه مهم', 'Important News')}</option>
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="datetime-local"
              required
              value={targetAt}
              onChange={(e) => setTargetAt(e.target.value)}
              className="px-3 py-2 rounded-lg bg-[#151519] border border-white/10 text-sm text-[#F5F0E6] font-mono focus:outline-none focus:border-[#D4AF37]"
            />
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={tr('تفاصيل إضافية (اختياري)', 'Details (optional)')}
              className="px-3 py-2 rounded-lg bg-[#151519] border border-white/10 text-sm text-[#F5F0E6] focus:outline-none focus:border-[#D4AF37]"
            />
          </div>
          <div className="flex justify-end">
            <GoldChip type="submit" active={true} disabled={saving}>
              {saving ? tr('جاري النشر...', 'Publishing...') : tr('نشر المؤقت بالرئيسية', 'Publish Countdown')}
            </GoldChip>
          </div>
        </form>
      )}

      {loading ? (
        <div className="h-28 rounded-xl bg-white/5 animate-pulse" />
      ) : announcements.length === 0 ? (
        <div className="p-5 rounded-xl bg-[#0D0D10] border border-white/10 text-center text-xs text-[#A8A29E]">
          {tr('لا توجد مؤقتات امتحانات مضافة حالياً.', 'No active countdowns yet.')}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {announcements.map((item) => (
            <article
              key={item.id}
              className="p-5 rounded-xl bg-[#0D0D10] border border-[#D4AF37]/25 flex flex-col justify-between gap-4"
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-[#D4AF37]">
                    {item.category === 'exam'
                      ? tr('امتحان قادم', 'Upcoming Exam')
                      : tr('خبر هام', 'Important News')}
                    {' · '}
                    <span className="font-mono tabular-nums text-[#A8A29E]">
                      {new Date(item.targetAt).toLocaleDateString()}
                    </span>
                  </span>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => handleDelete(item.id)}
                      aria-label={tr('حذف المؤقت', 'Delete countdown')}
                      className="p-1 text-red-400 hover:text-red-300 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <h3 className="font-display text-base font-bold text-[#F5F0E6]">
                  {item.title}
                </h3>
                {item.description && (
                  <p className="text-xs text-[#C8C2B8]">{item.description}</p>
                )}
              </div>

              <CountdownTimer targetAt={item.targetAt} />
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
