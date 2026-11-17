import {
  Activity,
  Award,
  BookOpen,
  CheckCircle2,
  Clock,
  Crown,
  Flag,
  LayoutDashboard,
  Lock,
  Mail,
  Medal,
  Phone,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Trophy,
  User as UserIcon,
  X,
  Zap,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import type { StudentAchievement, StudentDashboardData } from '../../types';
import { apiRequest } from '../../utils/api';
import { RankBadge } from './RankBadge';
import { UserAdminNotesCard } from './UserAdminNotesCard';

interface StudentProfileLevelModalProps {
  open: boolean;
  onClose: () => void;
}

export function StudentProfileLevelModal({
  open,
  onClose,
}: StudentProfileLevelModalProps) {
  const { user } = useAuth();
  const { tr, formatYear } = useLanguage();
  const [data, setData] = useState<StudentDashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<StudentDashboardData>('/api/student/dashboard');
      setData(res);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : tr('تعذر تحميل بيانات الطالب ومستواه.', 'Failed to load student profile and level.')
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    loadData();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open || !user) return null;

  const formatStudyDuration = (totalMinutes: number): string => {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours === 0) return `${minutes} ${tr('دقيقة', 'min')}`;
    if (minutes === 0) return `${hours} ${tr('ساعة', 'hr')}`;
    return `${hours} ${tr('س', 'h')} ${minutes} ${tr('د', 'm')}`;
  };

  const renderAchievementIcon = (
    icon: StudentAchievement['badgeIcon'],
    earned: boolean
  ) => {
    const cls = `w-4 h-4 ${earned ? 'text-[#09090B]' : 'text-[#A8A29E]'}`;
    switch (icon) {
      case 'flag':
        return <Flag className={cls} />;
      case 'zap':
        return <Zap className={cls} />;
      case 'medal':
        return <Medal className={cls} />;
      case 'trophy':
        return <Trophy className={cls} />;
      case 'clock':
        return <Clock className={cls} />;
      case 'book':
        return <BookOpen className={cls} />;
      case 'crown':
        return <Crown className={cls} />;
      default:
        return <Award className={cls} />;
    }
  };

  const displayUser = data?.personalInfo || user;
  const stats = data?.stats;
  const strengthsAndWeaknesses = data?.strengthsAndWeaknesses;
  const achievements = data?.achievements || [];
  const earnedBadgesCount = data?.earnedBadgesCount ?? 0;
  const totalBadgesCount = data?.totalBadgesCount ?? achievements.length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl bg-[#121216] border border-[#D4AF37]/35 shadow-[0_24px_80px_rgba(0,0,0,0.85)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 p-5 sm:p-6 bg-[#121216]/95 backdrop-blur-md border-b border-white/10">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#D4AF37]/15 border border-[#D4AF37]/40 flex items-center justify-center text-[#E5C158] shrink-0">
              <LayoutDashboard className="w-5 h-5" />
            </div>
            <div className="min-w-0 space-y-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-lg sm:text-xl font-bold text-[#F5F0E6] truncate">
                  {tr('لوحة التحكم — بيانات الطالب ومستواه', 'Student Profile & Level')}
                </h2>
                {displayUser?.rankBadge && (
                  <RankBadge rankBadge={displayUser.rankBadge} size="xs" />
                )}
              </div>
              <p className="text-xs text-[#A8A29E] truncate">
                {displayUser?.name} · {displayUser ? formatYear(displayUser.year) : '—'}
                {data?.personalInfo?.leaderboardRank
                  ? ` · ${tr(
                      `الترتيب #${data.personalInfo.leaderboardRank} من ${data.personalInfo.totalRankedUsers}`,
                      `Rank #${data.personalInfo.leaderboardRank} / ${data.personalInfo.totalRankedUsers}`
                    )}`
                  : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={loadData}
              disabled={loading}
              title={tr('تحديث البيانات', 'Refresh')}
              aria-label={tr('تحديث البيانات', 'Refresh')}
              className="p-2 rounded-lg border border-white/10 text-[#C8C2B8] hover:text-[#E5C158] hover:border-[#D4AF37]/50 transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label={tr('إغلاق', 'Close')}
              className="p-2 rounded-lg text-[#A8A29E] hover:text-white hover:bg-white/5 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 sm:p-6 space-y-6">
          {loading && !data ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[1, 2, 3, 4].map((n) => (
                  <div key={n} className="h-20 rounded-xl bg-white/5 animate-pulse" />
                ))}
              </div>
              <div className="h-44 rounded-xl bg-white/5 animate-pulse" />
            </div>
          ) : error && !data ? (
            <div className="p-4 rounded-xl bg-red-950/40 border border-red-500/40 text-xs text-red-200">
              {error}
            </div>
          ) : (
            <>
              {/* Level Snapshot Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3.5 rounded-xl bg-[#0D0D10] border border-[#D4AF37]/25">
                  <div className="text-[#A8A29E]">{tr('النقاط الحالية', 'Current Points')}</div>
                  <div className="font-mono text-2xl font-bold text-[#E5C158] tabular-nums mt-1">
                    {stats?.points ?? user.points}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-[#0D0D10] border border-white/10">
                  <div className="text-[#A8A29E]">{tr('الترتيب على الدفعة', 'Batch Rank')}</div>
                  <div className="font-mono text-2xl font-bold text-[#F5F0E6] tabular-nums mt-1">
                    {data?.personalInfo?.leaderboardRank
                      ? `#${data.personalInfo.leaderboardRank}`
                      : '—'}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-[#0D0D10] border border-white/10">
                  <div className="text-[#A8A29E]">{tr('نسبة الإنجاز', 'Completion')}</div>
                  <div className="font-mono text-2xl font-bold text-emerald-400 tabular-nums mt-1">
                    {data?.completionPercentage ?? 0}%
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-[#0D0D10] border border-white/10">
                  <div className="text-[#A8A29E]">{tr('ساعات التعلم', 'Study Time')}</div>
                  <div className="font-mono text-xl font-bold text-[#F5F0E6] tabular-nums mt-1">
                    {formatStudyDuration(stats?.studyMinutes ?? 0)}
                  </div>
                  <div className="text-[11px] text-[#A8A29E] mt-0.5 tabular-nums">
                    {stats?.quizzesCompleted ?? user.quizzesCompleted}{' '}
                    {tr('اختبارات مكتملة', 'quizzes')}
                  </div>
                </div>
              </div>

              {/* Admin Notes on User Profile (when present) */}
              <UserAdminNotesCard hideWhenEmpty={true} />

              {/* Personal Data + Strength & Weakness Analysis */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                {/* A. Personal Account Data */}
                <div className="lg:col-span-5 p-4 sm:p-5 rounded-xl bg-[#0D0D10] border border-white/10 space-y-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-display text-base font-bold text-[#F5F0E6] flex items-center gap-2">
                      <UserIcon className="w-4 h-4 text-[#D4AF37]" />
                      <span>{tr('بيانات الطالب الشخصية', 'Personal Profile Data')}</span>
                    </h3>
                    {data?.personalInfo?.leaderboardRank ? (
                      <span className="px-2.5 py-0.5 rounded-md bg-[#D4AF37]/15 border border-[#D4AF37]/40 text-[11px] font-mono font-bold text-[#E5C158] tabular-nums">
                        {tr(
                          `#${data.personalInfo.leaderboardRank} من ${data.personalInfo.totalRankedUsers}`,
                          `#${data.personalInfo.leaderboardRank} / ${data.personalInfo.totalRankedUsers}`
                        )}
                      </span>
                    ) : null}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                    <div className="p-2.5 rounded-lg bg-[#09090B] border border-white/5">
                      <div className="text-[#A8A29E]">{tr('الاسم', 'Full Name')}</div>
                      <div className="font-semibold text-[#F5F0E6] mt-0.5 truncate">
                        {displayUser?.name || '—'}
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-[#09090B] border border-white/5">
                      <div className="text-[#A8A29E]">{tr('الفرقة والدور', 'Year & Role')}</div>
                      <div className="font-semibold text-[#E5C158] mt-0.5 truncate">
                        {displayUser ? formatYear(displayUser.year) : '—'} ·{' '}
                        {displayUser?.role === 'admin'
                          ? displayUser.rankBadge?.nameAr || tr('أدمن', 'Admin')
                          : displayUser?.role === 'teacher'
                          ? tr('معلم / مدرس', 'Teacher')
                          : tr('طالب', 'Student')}
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-[#09090B] border border-white/5 sm:col-span-2 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[#A8A29E] flex items-center gap-1">
                          <Mail className="w-3 h-3" />
                          <span>{tr('البريد الإلكتروني (مقفل بعد التسجيل)', 'Email (Locked)')}</span>
                        </div>
                        <div className="font-mono text-[#F5F0E6] mt-0.5 truncate">
                          {displayUser?.email || '—'}
                        </div>
                      </div>
                      <Lock className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
                    </div>

                    <div className="p-2.5 rounded-lg bg-[#09090B] border border-white/5">
                      <div className="text-[#A8A29E] flex items-center gap-1">
                        <Phone className="w-3 h-3" />
                        <span>{tr('رقم التليفون', 'Phone')}</span>
                      </div>
                      <div className="font-mono tabular-nums text-[#F5F0E6] mt-0.5">
                        {displayUser?.phone || '—'}
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-[#09090B] border border-white/5">
                      <div className="text-[#A8A29E]">{tr('تاريخ الانضمام', 'Joined')}</div>
                      <div className="font-mono tabular-nums text-[#C8C2B8] mt-0.5">
                        {displayUser?.createdAt
                          ? new Date(displayUser.createdAt).toLocaleDateString()
                          : '—'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* B. Level: Strength & Weakness Analysis (%) */}
                <div className="lg:col-span-7 p-4 sm:p-5 rounded-xl bg-[#0D0D10] border border-white/10 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-display text-base font-bold text-[#F5F0E6] flex items-center gap-2">
                      <Activity className="w-4 h-4 text-[#D4AF37]" />
                      <span>{tr('مستوى الطالب (القوة والضعف)', 'Student Level (Strength & Weakness)')}</span>
                    </h3>
                    <span className="text-[11px] text-[#A8A29E]">
                      {strengthsAndWeaknesses?.hasQuizData
                        ? tr('محسوبة من درجات الاختبارات الفعلية', 'Based on quiz performance')
                        : tr('محسوبة من التقدم الدراسي الحالي', 'Based on current learning progress')}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-3.5 rounded-xl bg-emerald-950/20 border border-emerald-500/30 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-300">
                          <TrendingUp className="w-3.5 h-3.5" />
                          <span>{tr('نسبة القوة الإجمالية', 'Overall Strength')}</span>
                        </span>
                        <span className="font-mono text-base font-bold text-emerald-300 tabular-nums">
                          {strengthsAndWeaknesses?.overallStrengthPercent ?? 0}%
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-emerald-400 transition-all duration-500"
                          style={{
                            width: `${strengthsAndWeaknesses?.overallStrengthPercent ?? 0}%`,
                          }}
                        />
                      </div>
                    </div>

                    <div className="p-3.5 rounded-xl bg-rose-950/20 border border-rose-500/30 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="inline-flex items-center gap-1.5 font-semibold text-rose-300">
                          <TrendingDown className="w-3.5 h-3.5" />
                          <span>{tr('نسبة الضعف (تحتاج مراجعة)', 'Overall Weakness')}</span>
                        </span>
                        <span className="font-mono text-base font-bold text-rose-300 tabular-nums">
                          {strengthsAndWeaknesses?.overallWeaknessPercent ?? 0}%
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-rose-400 transition-all duration-500"
                          style={{
                            width: `${strengthsAndWeaknesses?.overallWeaknessPercent ?? 0}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    {(strengthsAndWeaknesses?.trackBreakdown || []).map((item) => (
                      <div key={item.track} className="space-y-1 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[#F5F0E6] font-medium">
                            {tr(item.labelAr, item.labelEn)}
                          </span>
                          <span className="font-mono tabular-nums text-[11px]">
                            {item.hasData ? (
                              <>
                                <span className="text-emerald-300">
                                  {tr('قوة', 'Strength')} {item.strengthPercent}%
                                </span>{' '}
                                <span className="text-[#78716C]">·</span>{' '}
                                <span className="text-rose-300">
                                  {tr('ضعف', 'Weakness')} {item.weaknessPercent}%
                                </span>
                              </>
                            ) : (
                              <span className="text-[#A8A29E]">
                                {tr('لم تُجرَ اختبارات بعد', 'No quiz data yet')}
                              </span>
                            )}
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-white/10 overflow-hidden flex">
                          {item.hasData && (
                            <>
                              <div
                                className="h-full bg-emerald-400"
                                style={{ width: `${item.strengthPercent}%` }}
                              />
                              <div
                                className="h-full bg-rose-500/70"
                                style={{ width: `${item.weaknessPercent}%` }}
                              />
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {(strengthsAndWeaknesses?.strongestArea ||
                    strengthsAndWeaknesses?.weakestArea) && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1 text-[11px]">
                      {strengthsAndWeaknesses.strongestArea && (
                        <div className="px-3 py-2 rounded-lg bg-[#09090B] border border-emerald-500/25 text-emerald-200 truncate">
                          {tr('أقوى نقطة:', 'Strongest:')}{' '}
                          <strong className="text-[#F5F0E6]">
                            {strengthsAndWeaknesses.strongestArea.label}
                          </strong>{' '}
                          ({strengthsAndWeaknesses.strongestArea.percent}%)
                        </div>
                      )}
                      {strengthsAndWeaknesses.weakestArea && (
                        <div className="px-3 py-2 rounded-lg bg-[#09090B] border border-rose-500/25 text-rose-200 truncate">
                          {tr('تحتاج تركيز:', 'Focus Needed:')}{' '}
                          <strong className="text-[#F5F0E6]">
                            {strengthsAndWeaknesses.weakestArea.label}
                          </strong>{' '}
                          ({strengthsAndWeaknesses.weakestArea.percent}%)
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* C. Earned Achievements & Medals */}
              {achievements.length > 0 && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-display text-base font-bold text-[#F5F0E6] flex items-center gap-2">
                      <Award className="w-4 h-4 text-[#D4AF37]" />
                      <span>{tr('الإنجازات والأوسمة المحققة', 'Earned Achievements & Medals')}</span>
                    </h3>
                    <span className="text-xs font-mono font-bold text-[#E5C158] tabular-nums">
                      {earnedBadgesCount} / {totalBadgesCount} {tr('وسام محقق', 'Earned')}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {achievements.map((badge) => (
                      <div
                        key={badge.id}
                        className={`p-3.5 rounded-xl border space-y-2.5 transition-colors ${
                          badge.earned
                            ? 'bg-[#171510] border-[#D4AF37]/50'
                            : 'bg-[#0D0D10] border-white/10 opacity-80'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div
                              className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                                badge.earned
                                  ? 'bg-[#D4AF37] text-[#09090B]'
                                  : 'bg-white/10 text-[#A8A29E]'
                              }`}
                            >
                              {renderAchievementIcon(badge.badgeIcon, badge.earned)}
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-[#F5F0E6] truncate">
                                {tr(badge.titleAr, badge.titleEn)}
                              </div>
                              <div className="text-[11px] text-[#A8A29E] line-clamp-2">
                                {tr(badge.descAr, badge.descEn)}
                              </div>
                            </div>
                          </div>
                          {badge.earned && (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                          )}
                        </div>

                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[10px] font-mono tabular-nums">
                            <span
                              className={
                                badge.earned ? 'text-[#E5C158] font-bold' : 'text-[#A8A29E]'
                              }
                            >
                              {badge.earned
                                ? tr('مكتسب', 'Unlocked')
                                : tr('قيد التقدم', 'In Progress')}
                            </span>
                            <span className="text-[#C8C2B8]">{badge.progressPercent}%</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                badge.earned ? 'bg-[#D4AF37]' : 'bg-white/35'
                              }`}
                              style={{ width: `${badge.progressPercent}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
