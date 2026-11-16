import { ArrowLeft, ArrowRight, CheckCircle2, Languages, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { FloatingLogo } from '../ui/FloatingLogo';
import { Footer } from '../ui/Footer';
import { GeoEngineeringBackground } from '../ui/GeoEngineeringBackground';
import { GoldChip } from '../ui/GoldChip';
import { MviaBrandMark } from '../ui/MviaBrandMark';

export function WelcomeCelebrationScreen() {
  const { user, clearJustRegistered } = useAuth();
  const { lang, isEn, toggleLang, tr, formatYear } = useLanguage();

  if (!user) return null;

  return (
    <div className="min-h-screen bg-[#09090B] text-[#F5F0E6] flex flex-col relative overflow-x-hidden">
      <GeoEngineeringBackground variant="page" />
      <main className="relative z-10 flex-1 flex items-center justify-center px-6 py-12 overflow-hidden">
        <div className="absolute top-6 end-6 z-20">
          <GoldChip onClick={toggleLang} className="text-xs px-3 py-1.5 font-mono">
            <Languages className="w-3.5 h-3.5" />
            <span>{lang === 'ar' ? 'EN' : 'عربي'}</span>
          </GoldChip>
        </div>

        {/* Subtle radial gold aura */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] h-[520px] rounded-full bg-[#D4AF37]/10 blur-3xl"
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="relative z-10 w-full max-w-xl rounded-3xl bg-[#121216] border border-[#D4AF37]/40 p-8 sm:p-12 text-center space-y-7 shadow-[0_24px_80px_rgba(0,0,0,0.65)]"
        >
          <div className="flex flex-col items-center gap-3">
            <FloatingLogo size="lg" />
            <MviaBrandMark size="md" />
          </div>

          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#D4AF37]">
              <Sparkles className="w-4 h-4" />
              <span>
                {tr(
                  'تم تفعيل حسابك بنجاح في عائلة MVIA',
                  'Your account is now active in the MVIA family'
                )}
              </span>
            </div>

            <h1 className="font-display text-3xl sm:text-4xl font-bold text-[#E5C158] text-balance">
              {tr('مبروك بقيت واحد مننا!', 'Welcome! You Are One of Us!')}
            </h1>

            <p className="text-sm sm:text-base text-[#C8C2B8] leading-relaxed">
              {tr('أهلاً بك يا', 'Welcome')}{' '}
              <strong className="text-[#F5F0E6]">{user.name}</strong>{' '}
              {tr('في منصة MVIA التعليمية. أصبح بإمكانك الآن الوصول لجميع مواد', 'to MVIA Educational Platform. You now have access to')}{' '}
              <strong className="text-[#E5C158]">{formatYear(user.year)}</strong>
              {tr(
                '، الملخصات، الاختبارات الشاملة، والتواصل المباشر مع دفعتك.',
                ', summaries, quizzes, and direct batch chat.'
              )}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-2xl bg-[#09090B] border border-white/10 text-xs text-start">
            <div className="space-y-1">
              <div className="text-[#A8A29E]">{tr('الاسم المسجل', 'Full Name')}</div>
              <div className="font-semibold text-[#F5F0E6] truncate">{user.name}</div>
            </div>
            <div className="space-y-1">
              <div className="text-[#A8A29E]">{tr('البريد الإلكتروني', 'Email')}</div>
              <div className="font-mono text-[#E5C158] truncate">{user.email}</div>
            </div>
            <div className="space-y-1">
              <div className="text-[#A8A29E]">{tr('السنة الدراسية', 'Academic Year')}</div>
              <div className="font-semibold text-[#F5F0E6] flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>{formatYear(user.year)}</span>
              </div>
            </div>
          </div>

          <GoldChip
            active={true}
            onClick={clearJustRegistered}
            className="w-full sm:w-auto px-8 py-3.5 text-base"
          >
            <span>{tr('ابدأ رحلتك في منصة MVIA', 'Start Your Journey on MVIA')}</span>
            {isEn ? <ArrowRight className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
          </GoldChip>
        </motion.div>
      </main>

      <Footer />
    </div>
  );
}
