import { Clock } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';

interface CountdownTimerProps {
  targetAt: string;
  label?: string;
  compact?: boolean;
}

interface TimeParts {
  expired: boolean;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

function computeRemaining(targetAt: string): TimeParts {
  const diff = new Date(targetAt).getTime() - Date.now();
  if (Number.isNaN(diff) || diff <= 0) {
    return { expired: true, days: 0, hours: 0, minutes: 0, seconds: 0 };
  }
  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return { expired: false, days, hours, minutes, seconds };
}

export function CountdownTimer({
  targetAt,
  label,
  compact = false,
}: CountdownTimerProps) {
  const { tr } = useLanguage();
  const [parts, setParts] = useState<TimeParts>(() =>
    computeRemaining(targetAt)
  );

  useEffect(() => {
    setParts(computeRemaining(targetAt));
    const timer = window.setInterval(() => {
      setParts(computeRemaining(targetAt));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [targetAt]);

  if (parts.expired) {
    return (
      <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
        <Clock className="w-3.5 h-3.5 shrink-0" />
        <span>{tr('متاح الآن / حان الموعد', 'Available Now')}</span>
      </div>
    );
  }

  const pad = (n: number) => String(n).padStart(2, '0');

  if (compact) {
    return (
      <div className="inline-flex items-center gap-2 text-xs font-mono tabular-nums text-[#E5C158]">
        <Clock className="w-3.5 h-3.5 shrink-0 text-[#D4AF37]" />
        {label && <span className="font-sans text-[#C8C2B8]">{label}:</span>}
        <span>
          {parts.days > 0 ? `${parts.days}${tr('ي', 'd')} ` : ''}
          {pad(parts.hours)}:{pad(parts.minutes)}:{pad(parts.seconds)}
        </span>
      </div>
    );
  }

  const cells = [
    { value: parts.days, unit: tr('يوم', 'Days') },
    { value: pad(parts.hours), unit: tr('ساعة', 'Hrs') },
    { value: pad(parts.minutes), unit: tr('دقيقة', 'Min') },
    { value: pad(parts.seconds), unit: tr('ثانية', 'Sec') },
  ];

  return (
    <div className="space-y-1.5">
      {label && (
        <div className="flex items-center gap-1.5 text-[11px] text-[#D4AF37] font-semibold">
          <Clock className="w-3.5 h-3.5 shrink-0" />
          <span>{label}</span>
        </div>
      )}
      <div className="grid grid-cols-4 gap-2">
        {cells.map((cell) => (
          <div
            key={cell.unit}
            className="px-2 py-2 rounded-lg bg-[#09090B] border border-[#D4AF37]/30 text-center"
          >
            <div className="font-mono text-lg font-bold text-[#E5C158] tabular-nums leading-none">
              {cell.value}
            </div>
            <div className="text-[10px] text-[#A8A29E] mt-1">{cell.unit}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
