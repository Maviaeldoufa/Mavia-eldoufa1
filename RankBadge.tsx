import {
  ClipboardCheck,
  Cpu,
  Crown,
  GraduationCap,
  Headset,
  Medal,
  Users,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import type { AdminRankColor, AdminRankIcon, UserRankBadge } from '../../types';

const COLOR_STYLES: Record<
  AdminRankColor,
  {
    wrapper: string;
    icon: string;
    solidBg: string;
  }
> = {
  gold: {
    wrapper: 'bg-[#D4AF37]/15 border-[#D4AF37]/55 text-[#F5D061]',
    icon: 'text-[#F5D061]',
    solidBg: 'bg-[#D4AF37]/20 border-[#D4AF37]/60 text-[#F5D061]',
  },
  silver: {
    wrapper: 'bg-slate-400/15 border-slate-300/45 text-slate-100',
    icon: 'text-slate-200',
    solidBg: 'bg-slate-400/20 border-slate-300/50 text-slate-100',
  },
  sky: {
    wrapper: 'bg-sky-500/15 border-sky-400/45 text-sky-200',
    icon: 'text-sky-300',
    solidBg: 'bg-sky-500/20 border-sky-400/50 text-sky-200',
  },
  emerald: {
    wrapper: 'bg-emerald-500/15 border-emerald-400/45 text-emerald-200',
    icon: 'text-emerald-300',
    solidBg: 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200',
  },
  violet: {
    wrapper: 'bg-violet-500/15 border-violet-400/45 text-violet-200',
    icon: 'text-violet-300',
    solidBg: 'bg-violet-500/20 border-violet-400/50 text-violet-200',
  },
  amber: {
    wrapper: 'bg-amber-500/15 border-amber-400/45 text-amber-200',
    icon: 'text-amber-300',
    solidBg: 'bg-amber-500/20 border-amber-400/50 text-amber-200',
  },
  rose: {
    wrapper: 'bg-rose-500/15 border-rose-400/45 text-rose-200',
    icon: 'text-rose-300',
    solidBg: 'bg-rose-500/20 border-rose-400/50 text-rose-200',
  },
};

export function RankIconGlyph({
  icon,
  color = 'gold',
  className = 'w-4 h-4',
}: {
  icon: AdminRankIcon;
  color?: AdminRankColor;
  className?: string;
}) {
  const colorClass = COLOR_STYLES[color]?.icon || COLOR_STYLES.gold.icon;
  const combined = `${className} ${colorClass} shrink-0`;

  switch (icon) {
    case 'crown':
      return <Crown className={combined} />;
    case 'medal':
      return <Medal className={combined} />;
    case 'cpu':
      return <Cpu className={combined} />;
    case 'graduation-cap':
      return <GraduationCap className={combined} />;
    case 'users':
      return <Users className={combined} />;
    case 'headset':
      return <Headset className={combined} />;
    case 'clipboard-check':
      return <ClipboardCheck className={combined} />;
    default:
      return <Crown className={combined} />;
  }
}

export function getRankIconBoxClass(color: AdminRankColor = 'gold'): string {
  return COLOR_STYLES[color]?.solidBg || COLOR_STYLES.gold.solidBg;
}

export function RankBadge({
  rankBadge,
  size = 'sm',
  iconOnly = false,
}: {
  rankBadge?: UserRankBadge;
  size?: 'xs' | 'sm' | 'md';
  iconOnly?: boolean;
}) {
  const { lang } = useLanguage();
  if (!rankBadge) return null;

  const palette = COLOR_STYLES[rankBadge.badgeColor] || COLOR_STYLES.gold;
  const label = lang === 'ar' ? rankBadge.nameAr : rankBadge.nameEn;

  const sizeClass =
    size === 'xs'
      ? 'px-1.5 py-0.5 text-[10px] gap-1'
      : size === 'md'
      ? 'px-2.5 py-1 text-xs gap-1.5'
      : 'px-2 py-0.5 text-[11px] gap-1';

  const iconSize = size === 'xs' ? 'w-3 h-3' : size === 'md' ? 'w-4 h-4' : 'w-3.5 h-3.5';

  return (
    <span
      title={label}
      className={`inline-flex items-center rounded-md border font-semibold whitespace-nowrap shrink-0 ${palette.wrapper} ${sizeClass}`}
    >
      <RankIconGlyph
        icon={rankBadge.badgeIcon}
        color={rankBadge.badgeColor}
        className={iconSize}
      />
      {!iconOnly && <span>{label}</span>}
    </span>
  );
}
