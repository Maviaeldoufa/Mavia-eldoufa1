import { Award, ShieldCheck, Trophy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import type { User } from '../../types';
import { apiRequest } from '../../utils/api';
import { GoldChip } from '../ui/GoldChip';
import { RankBadge } from '../ui/RankBadge';

export function LeaderboardPanel({ refreshTrigger }: { refreshTrigger?: number }) {
  const { user: currentUser } = useAuth();
  const { tr, formatYear } = useLanguage();
  const [selectedYear, setSelectedYear] = useState<number>(currentUser?.year || 0);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const yearFilters: Array<{ value: number; label: string }> = [
    { value: 0, label: tr('جميع الدفعات', 'All Years') },
    { value: 1, label: tr('الفرقة الأولى', 'Year 1') },
    { value: 2, label: tr('الفرقة الثانية', 'Year 2') },
    { value: 3, label: tr('الفرقة الثالثة', 'Year 3') },
    { value: 4, label: tr('الفرقة الرابعة', 'Year 4') },
  ];

  useEffect(() => {
    let active = true;
    setLoading(true);
    apiRequest<{ users: User[] }>(`/api/users?year=${selectedYear}`)
      .then((res) => {
        if (active) setUsers(res.users);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedYear, refreshTrigger]);

  return (
    <section className="rounded-2xl bg-[#121216] border border-white/10 p-6 space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-[#D4AF37]" />
            <h2 className="font-display text-xl font-bold text-[#F5F0E6]">
              {tr('لوحة تصدر الدفعة', 'Batch Leaderboard')}
            </h2>
          </div>
          <p className="text-xs text-[#A8A29E]">
            {tr(
              'تُحتسب النقاط تلقائياً عند اجتياز الاختبارات الشاملة في قسم الكورسات',
              'Points are earned automatically when completing quizzes in Courses'
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {yearFilters.map((f) => (
            <GoldChip
              key={f.value}
              active={selectedYear === f.value}
              layoutId="leaderboard-year-filter"
              onClick={() => setSelectedYear(f.value)}
              className="text-xs px-3 py-1.5"
            >
              {f.label}
            </GoldChip>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-2.5">
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className="h-12 rounded-xl bg-white/5 animate-pulse"
            />
          ))}
        </div>
      ) : users.length === 0 ? (
        <div className="py-10 text-center text-sm text-[#A8A29E]">
          {tr(
            'لا يوجد طلاب مسجلون في هذه الدفعة حتى الآن.',
            'No students registered in this academic year yet.'
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-start border-collapse">
            <thead>
              <tr className="border-b border-white/10 text-xs text-[#A8A29E]">
                <th className="py-3 px-3 font-semibold">{tr('الترتيب', 'Rank')}</th>
                <th className="py-3 px-3 font-semibold">{tr('الطالب', 'Student')}</th>
                <th className="py-3 px-3 font-semibold">{tr('الفرقة الدراسية', 'Year')}</th>
                <th className="py-3 px-3 font-semibold text-center">{tr('الاختبارات', 'Quizzes')}</th>
                <th className="py-3 px-3 font-semibold text-end">{tr('النقاط', 'Points')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-sm">
              {users.map((student, idx) => {
                const rank = idx + 1;
                const isMe = student.id === currentUser?.id;
                return (
                  <tr
                    key={student.id}
                    className={`transition-colors ${
                      isMe
                        ? 'bg-[#D4AF37]/10'
                        : 'hover:bg-white/[0.03]'
                    }`}
                  >
                    <td className="py-3.5 px-3 font-mono tabular-nums font-semibold">
                      {rank <= 3 ? (
                        <span
                          className={`inline-flex items-center gap-1.5 ${
                            rank === 1
                              ? 'text-[#F5D061]'
                              : rank === 2
                              ? 'text-zinc-300'
                              : 'text-amber-600'
                          }`}
                        >
                          <Award className="w-4 h-4" />
                          <span>#{rank}</span>
                        </span>
                      ) : (
                        <span className="text-[#A8A29E]">#{rank}</span>
                      )}
                    </td>
                    <td className="py-3.5 px-3 font-medium text-[#F5F0E6]">
                      <div className="flex items-center gap-2">
                        <span>{student.name}</span>
                        {student.rankBadge ? (
                          <RankBadge rankBadge={student.rankBadge} size="xs" />
                        ) : student.role === 'admin' ? (
                          <ShieldCheck
                            className="w-4 h-4 text-[#D4AF37] shrink-0"
                            aria-label={tr('أدمن', 'Admin')}
                          />
                        ) : null}
                        {student.role === 'teacher' && (
                          <span className="text-[11px] font-medium text-sky-300">
                            {tr('معلم', 'Teacher')}
                          </span>
                        )}
                        {isMe && (
                          <span className="text-xs text-[#D4AF37]">
                            {tr('(أنت)', '(You)')}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-3 text-xs text-[#C8C2B8]">
                      {formatYear(student.year)}
                    </td>
                    <td className="py-3.5 px-3 text-center font-mono tabular-nums text-[#C8C2B8]">
                      {student.quizzesCompleted}
                    </td>
                    <td className="py-3.5 px-3 text-end font-mono tabular-nums font-bold text-[#E5C158]">
                      {student.points}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
