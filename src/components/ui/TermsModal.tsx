import {
  AlertTriangle,
  Ban,
  Database,
  Lock,
  Scale,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { GoldChip } from './GoldChip';

interface TermsModalProps {
  open: boolean;
  onClose: () => void;
  initialTab?: 'terms' | 'privacy';
}

export function TermsModal({
  open,
  onClose,
  initialTab = 'terms',
}: TermsModalProps) {
  const { tr } = useLanguage();
  const [tab, setTab] = useState<'terms' | 'privacy'>(initialTab);

  useEffect(() => {
    if (open) {
      setTab(initialTab);
    }
  }, [open, initialTab]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={
        tab === 'privacy'
          ? tr('سياسة الخصوصية — منصة MAVIA', 'Privacy Policy — MAVIA Platform')
          : tr('الشروط والأحكام وسياسة منصة MAVIA', 'MAVIA Terms & Conditions')
      }
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4"
    >
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-[#121216] border border-[#D4AF37]/40 p-5 sm:p-6 space-y-5 shadow-[0_24px_80px_rgba(0,0,0,0.85)]">
        <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-[#D4AF37]/15 border border-[#D4AF37]/40 text-[#E5C158]">
              {tab === 'privacy' ? (
                <Lock className="w-5 h-5" />
              ) : (
                <Scale className="w-5 h-5" />
              )}
            </div>
            <div>
              <h2 className="font-display text-lg sm:text-xl font-bold text-[#E5C158]">
                {tab === 'privacy'
                  ? tr('سياسة الخصوصية وحماية البيانات — MAVIA', 'Privacy Policy — MAVIA Platform')
                  : tr('الشروط والأحكام — منصة MAVIA', 'Terms & Conditions — MAVIA Platform')}
              </h2>
              <p className="text-xs text-[#A8A29E]">
                {tab === 'privacy'
                  ? tr(
                      'كيفية جمع وحماية بيانات الطلاب وحقوقك في التصدير والحذف',
                      'How student data is protected and your export/deletion rights'
                    )
                  : tr(
                      'قواعد الانضباط الأكاديمي والسلوك والتواصل الرسمي داخل المنصة',
                      'Academic discipline, conduct, and official communication rules'
                    )}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={tr('إغلاق', 'Close')}
            className="p-2 rounded-lg bg-[#18181D] border border-white/10 text-[#C8C2B8] hover:text-[#F5D061] hover:border-[#D4AF37]/50 cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Legal document switcher */}
        <div className="flex flex-wrap items-center gap-2">
          <GoldChip
            active={tab === 'terms'}
            onClick={() => setTab('terms')}
            className="text-xs px-3 py-1.5"
          >
            <Scale className="w-3.5 h-3.5" />
            <span>{tr('الشروط والأحكام', 'Terms of Service')}</span>
          </GoldChip>
          <GoldChip
            active={tab === 'privacy'}
            onClick={() => setTab('privacy')}
            className="text-xs px-3 py-1.5"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>{tr('سياسة الخصوصية', 'Privacy Policy')}</span>
          </GoldChip>
        </div>

        {tab === 'terms' ? (
          <div className="space-y-3.5 text-xs sm:text-sm leading-relaxed">
            <div className="p-4 rounded-xl bg-red-950/25 border border-red-500/35 space-y-2">
              <div className="flex items-center gap-2 font-display font-bold text-red-200">
                <Ban className="w-4 h-4 text-red-400 shrink-0" />
                <span>
                  {tr(
                    '1. الانضباط في الشات والمنصة والحظر المؤقت',
                    '1. Chat & Platform Conduct and Temporary Suspension'
                  )}
                </span>
              </div>
              <p className="text-[#E5E0D8]">
                {tr(
                  'يلتزم كل طالب بالاحترام المتبادل والأدب العام في شات الدفعة، والتعليقات، وكافة أقسام المنصة. أي طالب يتجاوز حدوده أو يصدر منه إساءة أو مخالفة يتم حظره مؤقتاً وإلغاء جلسته فوراً، ولن يتمكن من الدخول إلى المنصة مرة أخرى إلا بإذن وموافقة مباشرة من أدمن المنصة.',
                  'All students must maintain respectful conduct in batch chat and across all sections. Any student who crosses boundaries or violates platform rules will be temporarily suspended immediately and will NOT be allowed to re-enter without explicit permission from the Platform Admin.'
                )}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-amber-950/25 border border-amber-500/35 space-y-2">
              <div className="flex items-center gap-2 font-display font-bold text-amber-200">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  {tr(
                    '2. قواعد التواصل مع الدعم الفني (تنبيه هام جداً)',
                    '2. Support Contact Policy (Strict Rule)'
                  )}
                </span>
              </div>
              <p className="text-[#E5E0D8]">
                {tr(
                  'يُمنع منعاً باتاً التواصل مع الدعم الفني عبر واتساب أو تليجرام إلا إذا احتاج الأمر لذلك بالفعل وفي حالات الضرورة القصوى فقط (مثل الأعطال التقنية الحقيقية أو طلب إذن فك الحظر). أي إزعاج أو تواصل غير مبرر يعرض الحساب للحظر الفوري.',
                  'Contacting Technical Support via WhatsApp or Telegram is STRICTLY PROHIBITED unless genuinely necessary (such as critical technical issues or requesting re-entry approval). Unnecessary or spam contact results in immediate suspension.'
                )}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#0D0D10] border border-[#D4AF37]/25 space-y-2">
              <div className="flex items-center gap-2 font-display font-bold text-[#E5C158]">
                <ShieldCheck className="w-4 h-4 text-[#D4AF37] shrink-0" />
                <span>
                  {tr(
                    '3. الحفاظ على حسابك ومحتوى المنصة',
                    '3. Account Security & Content Integrity'
                  )}
                </span>
              </div>
              <p className="text-[#C8C2B8]">
                {tr(
                  'حسابك شخصي ولا يجوز مشاركته مع الغير. جميع الملخصات والمحاضرات والاختبارات مخصصة لطلاب الدفعات على منصة MAVIA، وتخضع إدارة الأعضاء لصلاحيات الأدمن الكاملة.',
                  'Your account is personal and may not be shared. All summaries, lectures, and exams belong exclusively to MAVIA students and are governed by Admin moderation.'
                )}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3.5 text-xs sm:text-sm leading-relaxed">
            <div className="p-4 rounded-xl bg-[#0D0D10] border border-[#D4AF37]/25 space-y-2">
              <div className="flex items-center gap-2 font-display font-bold text-[#E5C158]">
                <Database className="w-4 h-4 text-[#D4AF37] shrink-0" />
                <span>
                  {tr('1. البيانات التي نجمعها وهدفها', '1. Data We Collect & Purpose')}
                </span>
              </div>
              <p className="text-[#C8C2B8]">
                {tr(
                  'تجمع منصة MAVIA فقط البيانات الأساسية اللازمة لتشغيل حسابك الأكاديمي: الاسم، البريد الإلكتروني، رقم الهاتف، الفرقة الدراسية، درجات الاختبارات، التقدم في الدروس، وملاحظات المحاضرات. لا يتم بيع أو مشاركة بيانات الطلاب مع أي أطراف خارجية.',
                  'MAVIA collects only essential data required to run your academic account: name, email, phone number, academic year, quiz scores, lesson progress, and lecture notes. Student data is never sold or shared with third-party advertisers.'
                )}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#0D0D10] border border-white/10 space-y-2">
              <div className="flex items-center gap-2 font-display font-bold text-[#F5F0E6]">
                <Lock className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  {tr('2. خصوصية الطلاب والحماية التقنية', '2. Student Privacy & Technical Protection')}
                </span>
              </div>
              <p className="text-[#C8C2B8]">
                {tr(
                  'يتم تشفير كلمات المرور باستخدام خوارزمية scrypt مع Salt عشوائي فريد لكل مستخدم، ولا تظهر بيانات الاتصال الشخصية (البريد أو الهاتف) في لوحة التصدر للطلاب الآخرين. الجلسات محمية برموز توثيق عشوائية ومحددة الصلاحيات.',
                  'Passwords are hashed with scrypt and unique per-user salts. Personal contact details (email and phone) are hidden on public leaderboards. All routes enforce server-side authentication and role-based access control.'
                )}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#0D0D10] border border-white/10 space-y-2">
              <div className="flex items-center gap-2 font-display font-bold text-[#F5F0E6]">
                <UserCheck className="w-4 h-4 text-[#D4AF37] shrink-0" />
                <span>
                  {tr(
                    '3. حقوقك: تعديل البيانات، التصدير، وحذف الحساب',
                    '3. Your Rights: Edit, Export & Delete Your Account'
                  )}
                </span>
              </div>
              <p className="text-[#C8C2B8]">
                {tr(
                  'يمكنك في أي وقت من خلال نافذة "حسابي وبياناتي" في الشريط العلوي تعديل اسمك أو فرقتك، تغيير كلمة المرور، تحميل نسخة JSON كاملة من بياناتك الأكاديمية، أو حذف حسابك وجميع بياناتك الشخصية نهائياً من المنصة.',
                  'At any time from the "My Account & Data" dialog in the top bar, you can update your name/year, change your password, export your complete academic records as JSON, or permanently delete your student account and personal data.'
                )}
              </p>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/10">
          <div className="flex items-center gap-1.5 text-[11px] text-[#A8A29E]">
            <ShieldAlert className="w-3.5 h-3.5 text-[#D4AF37]" />
            <span>
              {tr(
                'الالتزام بهذه السياسات يضمن بيئة تعليمية آمنة ومحترمة للجميع.',
                'Following these policies keeps MAVIA safe, private, and productive for everyone.'
              )}
            </span>
          </div>
          <GoldChip active={true} onClick={onClose} className="px-5 py-2 text-xs">
            {tr('إغلاق', 'Close')}
          </GoldChip>
        </div>
      </div>
    </div>
  );
}
