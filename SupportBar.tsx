import { AlertTriangle, MessageCircle, Send } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import type { PlatformConfig } from '../../types';
import { resolveApiUrl } from '../../utils/api';

const DEFAULT_CONFIG: PlatformConfig = {
  whatsappNumber: '01159637247',
  telegramUrl: 'https://t.me/+201159637247',
};

function toWhatsappHref(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0')) {
    return `https://wa.me/2${digits}`;
  }
  return `https://wa.me/${digits}`;
}

export function SupportBar({ compact = false }: { compact?: boolean }) {
  const { tr } = useLanguage();
  const [config, setConfig] = useState<PlatformConfig>(DEFAULT_CONFIG);

  useEffect(() => {
    fetch(resolveApiUrl('/api/platform/config'))
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.config) {
          setConfig(data.config);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-1.5">
      <div
        className={`flex flex-wrap items-center gap-2.5 ${
          compact ? 'justify-start' : 'justify-between'
        }`}
      >
        <span className="text-xs text-[#C8C2B8] font-medium">
          {tr('الدعم الفني:', 'Technical Support:')}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={toWhatsappHref(config.whatsappNumber)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={tr('تواصل عبر واتساب', 'Contact via WhatsApp')}
            title={tr('تواصل عبر واتساب للضرورة فقط', 'WhatsApp Support (Urgent Only)')}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-600 hover:text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
          >
            <MessageCircle className="w-4 h-4 shrink-0" />
            <span>{tr('واتساب', 'WhatsApp')}</span>
          </a>
          <a
            href={
              /^https?:\/\//i.test(config.telegramUrl)
                ? config.telegramUrl
                : 'https://t.me/+201159637247'
            }
            target="_blank"
            rel="noopener noreferrer"
            aria-label={tr('تواصل عبر تليجرام', 'Contact via Telegram')}
            title={tr('تواصل عبر تليجرام للضرورة فقط', 'Telegram Support (Urgent Only)')}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-sky-950/60 border border-sky-500/40 text-sky-300 hover:bg-sky-600 hover:text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
          >
            <Send className="w-4 h-4 shrink-0" />
            <span>{tr('تليجرام', 'Telegram')}</span>
          </a>
        </div>
      </div>

      <p className="flex items-center gap-1.5 text-[11px] text-amber-300/90 leading-snug">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
        <span>
          {tr(
            'تنبيه: يُمنع منعاً باتاً التواصل مع الدعم الفني إلا إذا احتاج الأمر لذلك بالفعل.',
            'Notice: Contacting Technical Support is strictly prohibited unless genuinely necessary.'
          )}
        </span>
      </p>
    </div>
  );
}
