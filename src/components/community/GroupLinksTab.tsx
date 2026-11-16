import { ExternalLink, Plus, Trash2, Users } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import type { AcademicYear, GroupLink } from '../../types';
import { apiRequest } from '../../utils/api';
import { GoldChip } from '../ui/GoldChip';

export function GroupLinksTab() {
  const { user } = useAuth();
  const { tr, formatYear } = useLanguage();
  const isAdmin = user?.role === 'admin';

  const [groups, setGroups] = useState<GroupLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [yearFilter, setYearFilter] = useState<number>(-1); // -1 = all

  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [platform, setPlatform] = useState<GroupLink['platform']>('Telegram');
  const [year, setYear] = useState<number>(0);
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiRequest<{ groups: GroupLink[] }>('/api/community/groups')
      .then((res) => setGroups(res.groups))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !url.trim()) return;
    setSaving(true);
    try {
      const res = await apiRequest<{ group: GroupLink }>('/api/community/groups', {
        method: 'POST',
        body: JSON.stringify({
          title,
          url,
          platform,
          year: year as AcademicYear | 0,
          description,
        }),
      });
      setGroups((prev) => [res.group, ...prev]);
      setTitle('');
      setUrl('');
      setDescription('');
      setShowAdd(false);
    } catch {
      // Ignore
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiRequest(`/api/community/groups/${id}`, { method: 'DELETE' });
      setGroups((prev) => prev.filter((g) => g.id !== id));
    } catch {
      // Ignore
    }
  };

  const filtered = groups.filter((g) =>
    yearFilter === -1 ? true : g.year === yearFilter
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {[
            { value: -1, label: tr('الكل', 'All') },
            { value: 0, label: tr('جروبات عامة', 'General Groups') },
            { value: 1, label: formatYear(1) },
            { value: 2, label: formatYear(2) },
            { value: 3, label: formatYear(3) },
            { value: 4, label: formatYear(4) },
          ].map((f) => (
            <GoldChip
              key={f.value}
              active={yearFilter === f.value}
              layoutId="group-year-filter"
              onClick={() => setYearFilter(f.value)}
              className="text-xs px-3 py-1.5"
            >
              {f.label}
            </GoldChip>
          ))}
        </div>

        {isAdmin && (
          <GoldChip
            active={showAdd}
            onClick={() => setShowAdd((p) => !p)}
            className="text-xs px-3 py-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>
              {showAdd ? tr('إغلاق', 'Close') : tr('إضافة رابط جروب', 'Add Group Link')}
            </span>
          </GoldChip>
        )}
      </div>

      {isAdmin && showAdd && (
        <form
          onSubmit={handleAdd}
          className="p-4 rounded-xl bg-[#09090B] border border-[#D4AF37]/30 space-y-3"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={tr('اسم الجروب', 'Group name')}
              className="px-3 py-2 rounded-lg bg-[#151519] border border-white/10 text-sm text-[#F5F0E6] focus:outline-none focus:border-[#D4AF37]"
            />
            <input
              type="url"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={tr('رابط الدعوة (https://t.me/...)', 'Invite URL (https://t.me/...)')}
              dir="ltr"
              className="px-3 py-2 rounded-lg bg-[#151519] border border-white/10 text-sm text-[#F5F0E6] font-mono focus:outline-none focus:border-[#D4AF37]"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <select
              value={platform}
              onChange={(e) =>
                setPlatform(e.target.value as GroupLink['platform'])
              }
              className="px-3 py-2 rounded-lg bg-[#151519] border border-white/10 text-sm text-[#F5F0E6] focus:outline-none focus:border-[#D4AF37]"
            >
              <option value="Telegram">Telegram</option>
              <option value="WhatsApp">WhatsApp</option>
              <option value="Discord">Discord</option>
              <option value="Other">{tr('أخرى', 'Other')}</option>
            </select>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="px-3 py-2 rounded-lg bg-[#151519] border border-white/10 text-sm text-[#F5F0E6] focus:outline-none focus:border-[#D4AF37]"
            >
              <option value={0}>{tr('جروب عام لكل الدفعات', 'General Group (All Years)')}</option>
              <option value={1}>{formatYear(1)}</option>
              <option value={2}>{formatYear(2)}</option>
              <option value={3}>{formatYear(3)}</option>
              <option value={4}>{formatYear(4)}</option>
            </select>
          </div>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={tr('وصف الجروب...', 'Group description...')}
            className="w-full px-3 py-2 rounded-lg bg-[#151519] border border-white/10 text-sm text-[#F5F0E6] focus:outline-none focus:border-[#D4AF37]"
          />
          <div className="flex justify-end">
            <GoldChip type="submit" active={true} disabled={saving}>
              {saving ? tr('جاري الإضافة...', 'Adding...') : tr('حفظ الجروب', 'Save Group')}
            </GoldChip>
          </div>
        </form>
      )}

      {loading ? (
        <div className="py-8 text-center text-sm text-[#A8A29E]">
          {tr('جاري تحميل روابط الجروبات...', 'Loading group links...')}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((grp) => (
            <div
              key={grp.id}
              className="p-5 rounded-xl bg-[#0D0D10] border border-white/10 hover:border-[#D4AF37]/50 flex flex-col justify-between gap-4 transition-colors"
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-[#D4AF37]">
                  <div className="flex items-center gap-2">
                    <Users className="w-3.5 h-3.5" />
                    <span>{grp.platform}</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {grp.year === 0 ? tr('جميع الدفعات', 'All Years') : formatYear(grp.year)}
                    </span>
                  </div>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => handleDelete(grp.id)}
                      className="p-1 text-red-400 hover:text-red-300 cursor-pointer"
                      aria-label={tr('حذف الجروب', 'Delete group')}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <h4 className="font-display text-base font-bold text-[#F5F0E6]">
                  {grp.title}
                </h4>
                <p className="text-xs text-[#C8C2B8]">{grp.description}</p>
              </div>

              <a
                href={grp.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-[#151519] border border-[#D4AF37]/40 text-[#E5C158] hover:bg-[#D4AF37] hover:text-[#09090B] transition-all"
              >
                <span>{tr('انضمام للجروب', 'Join Group')}</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
