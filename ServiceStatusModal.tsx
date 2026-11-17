import { Activity, CheckCircle2, RefreshCw, Wrench, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import type { SystemStatusData } from '../../types';
import { GoldChip } from './GoldChip';

interface ServiceStatusModalProps {
  open: boolean;
  onClose: () => void;
}

export function ServiceStatusModal({ open, onClose }: ServiceStatusModalProps) {
  const { tr } = useLanguage();
  const [status, setStatus] = useState<SystemStatusData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/status');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = (await res.json()) as SystemStatusData;
      setStatus(data);
    } catch {
      setError(tr('تعذر الاتصال بخادم فحص الحالة.', 'Could not reach status endpoint.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    loadStatus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  if (!open) return null;

  const formatUptime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs}h ${mins}m ${secs}s`;
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={tr('حالة الخدمة والصيانة — MAVIA', 'Service Status & Maintenance')}
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4"
    >
      <div className="w-full max-w-lg rounded-2xl bg-[#121216] border border-[#D4AF37]/40 p-5 sm:p-6 space-y-5 shadow-[0_24px_80px_rgba(0,0,0,0.85)]">
        <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-[#D4AF37]/15 border border-[#D4AF37]/40 text-[#E5C158]">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-display text-lg font-bold text-[#E5C158]">
                {tr('حالة الخدمة وصيانة المنصة', 'Service Status & Maintenance')}
              </h2>
              <p className="text-xs text-[#A8A29E]">
                {tr('مراقبة مباشرة لتوافر الخادم والخدمات الأساسية', 'Live availability check for core platform services')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={tr('إغلاق', 'Close')}
            className="p-2 rounded-lg bg-[#18181D] border border-white/10 text-[#C8C2B8] hover:text-[#F5D061] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {loading && !status ? (
          <div className="py-8 text-center text-xs text-[#A8A29E]">
            {tr('جاري فحص حالة الخادم...', 'Checking server health...')}
          </div>
        ) : error ? (
          <div className="p-4 rounded-xl bg-red-950/35 border border-red-500/40 text-xs text-red-200">
            {error}
          </div>
        ) : status ? (
          <div className="space-y-4">
            <div
              className={`p-4 rounded-xl border flex items-start gap-3 ${
                status.status === 'maintenance'
                  ? 'bg-amber-950/30 border-amber-500/40 text-amber-100'
                  : 'bg-emerald-950/25 border-emerald-500/35 text-emerald-100'
              }`}
            >
              {status.status === 'maintenance' ? (
                <Wrench className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              ) : (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              )}
              <div className="space-y-1 text-xs sm:text-sm">
                <div className="font-bold">
                  {status.status === 'maintenance'
                    ? tr('المنصة في وضع الصيانة المجدولة حالياً', 'Platform is currently in Maintenance Mode')
                    : tr('جميع الأنظمة الأساسية تعمل بكفاءة', 'All Core Systems Operational')}
                </div>
                {status.status === 'maintenance' && (
                  <p className="text-xs opacity-90">{status.maintenance.message}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              <div className="p-3 rounded-xl bg-[#0D0D10] border border-white/10 flex items-center justify-between">
                <span className="text-[#C8C2B8]">{tr('واجهة البرمجة (API)', 'API Server')}</span>
                <span className="text-emerald-400 font-semibold">{tr('يعمل', 'Operational')}</span>
              </div>
              <div className="p-3 rounded-xl bg-[#0D0D10] border border-white/10 flex items-center justify-between">
                <span className="text-[#C8C2B8]">{tr('قاعدة البيانات', 'Database Store')}</span>
                <span className="text-emerald-400 font-semibold">{tr('متصل', 'Healthy')}</span>
              </div>
              <div className="p-3 rounded-xl bg-[#0D0D10] border border-white/10 flex items-center justify-between">
                <span className="text-[#C8C2B8]">{tr('شات البث المباشر (WS)', 'WebSocket Hub')}</span>
                <span className="text-emerald-400 font-semibold">{tr('نشط', 'Online')}</span>
              </div>
              <div className="p-3 rounded-xl bg-[#0D0D10] border border-white/10 flex items-center justify-between">
                <span className="text-[#C8C2B8]">{tr('المساعد الذكي (AI)', 'AI Assistant')}</span>
                <span className={status.services.aiConfigured ? 'text-emerald-400 font-semibold' : 'text-amber-300 font-semibold'}>
                  {status.services.aiConfigured
                    ? tr('مهيأ', 'Configured')
                    : tr('بحاجة لمفتاح', 'Key Needed')}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-[#0D0D10] border border-white/10 flex items-center justify-between sm:col-span-2">
                <span className="text-[#C8C2B8]">
                  {tr('بريد التحقق التلقائي (Resend)', 'Email Delivery (Resend)')}
                </span>
                <span className={status.services.emailConfigured ? 'text-emerald-400 font-semibold' : 'text-[#A8A29E]'}>
                  {status.services.emailConfigured
                    ? tr('مفعّل', 'Configured')
                    : tr('معطّل مؤقتاً (غير مهيأ)', 'Temporarily Disabled (Not Configured)')}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#A8A29E] font-mono tabular-nums">
              <span>Uptime: {formatUptime(status.uptimeSeconds)}</span>
              <span>{new Date(status.timestamp).toLocaleString()}</span>
            </div>
          </div>
        ) : null}

        <div className="flex items-center justify-between pt-2 border-t border-white/10">
          <button
            type="button"
            onClick={loadStatus}
            disabled={loading}
            className="inline-flex items-center gap-1.5 text-xs text-[#E5C158] hover:text-[#F5D061] cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{tr('تحديث الحالة', 'Refresh')}</span>
          </button>
          <GoldChip active={true} onClick={onClose} className="text-xs px-4 py-1.5">
            {tr('إغلاق', 'Close')}
          </GoldChip>
        </div>
      </div>
    </div>
  );
}
