import { Activity, Lock, Scale } from 'lucide-react';
import { useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { ServiceStatusModal } from './ServiceStatusModal';
import { TermsModal } from './TermsModal';

export function Footer() {
  const { tr } = useLanguage();
  const [legalTab, setLegalTab] = useState<'terms' | 'privacy' | null>(null);
  const [statusOpen, setStatusOpen] = useState(false);

  return (
    <>
      <footer className="relative z-10 border-t border-white/10 bg-[#09090B]/95 backdrop-blur-sm py-5 px-4 sm:px-6 text-xs text-[#A8A29E]">
        <div className="max-w-7xl mx-auto space-y-3">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 pb-3 border-b border-white/5">
            <div className="space-y-2">
              <span>
                {tr(
                  'منصة MVIA التعليمية — جميع الدفعات من الفرقة الأولى للرابعة · GIS والبرمجة',
                  'MVIA Educational Platform — Academic Years 1–4 · GIS & Programming'
                )}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setLegalTab('terms')}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#151519] border border-[#D4AF37]/35 text-[#E5C158] hover:bg-[#D4AF37] hover:text-[#09090B] text-[11px] font-semibold transition-colors cursor-pointer"
                >
                  <Scale className="w-3.5 h-3.5" />
                  <span>{tr('الشروط والأحكام', 'Terms & Conditions')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setLegalTab('privacy')}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#151519] border border-white/15 text-[#C8C2B8] hover:border-[#D4AF37]/50 hover:text-[#E5C158] text-[11px] font-semibold transition-colors cursor-pointer"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>{tr('سياسة الخصوصية', 'Privacy Policy')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setStatusOpen(true)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#151519] border border-white/15 text-emerald-300 hover:border-emerald-400/60 text-[11px] font-semibold transition-colors cursor-pointer"
                >
                  <Activity className="w-3.5 h-3.5" />
                  <span>{tr('حالة الخدمة والصيانة', 'Service Status')}</span>
                </button>
              </div>
            </div>
          </div>

          <div className="text-center sm:text-end text-[#C8C2B8]">
            © {new Date().getFullYear()}{' '}
            {tr(
              'جميع حقوق الطبع والنشر محفوظة لـ',
              'All copyrights reserved to'
            )}{' '}
            <strong className="text-[#E5C158] font-semibold">
              Mahmoud Haider Youseif
            </strong>
          </div>
        </div>
      </footer>

      <TermsModal
        open={legalTab !== null}
        initialTab={legalTab || 'terms'}
        onClose={() => setLegalTab(null)}
      />
      <ServiceStatusModal
        open={statusOpen}
        onClose={() => setStatusOpen(false)}
      />
    </>
  );
}
