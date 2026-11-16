import {
  AlertCircle,
  KeyRound,
  Languages,
  Lock,
  Mail,
  Phone,
  Scale,
  ShieldCheck,
  User as UserIcon,
} from 'lucide-react';
import { motion } from 'motion/react';
import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import type { AcademicYear } from '../../types';
import { FloatingLogo } from '../ui/FloatingLogo';
import { Footer } from '../ui/Footer';
import { GeoEngineeringBackground } from '../ui/GeoEngineeringBackground';
import { GoldChip } from '../ui/GoldChip';
import { MviaBrandMark } from '../ui/MviaBrandMark';
import { SupportBar } from '../ui/SupportBar';
import { TermsModal } from '../ui/TermsModal';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface FieldErrors {
  name?: string;
  email?: string;
  phone?: string;
  password?: string;
  year?: string;
  terms?: string;
  identifier?: string;
  loginPassword?: string;
}

export function AuthScreen() {
  const { login, register, suspensionNotice, clearSuspensionNotice } = useAuth();
  const { lang, toggleLang, tr } = useLanguage();
  const [mode, setMode] = useState<'register' | 'login'>('register');
  const [termsOpen, setTermsOpen] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  // Register fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [year, setYear] = useState<AcademicYear | null>(null);
  const [registerAsAdmin, setRegisterAsAdmin] = useState(false);
  const [adminCode, setAdminCode] = useState('');

  // Login fields
  const [identifier, setIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const years: Array<{ value: AcademicYear; label: string }> = [
    { value: 1, label: tr('الأولى', 'Year 1') },
    { value: 2, label: tr('الثانية', 'Year 2') },
    { value: 3, label: tr('الثالثة', 'Year 3') },
    { value: 4, label: tr('الرابعة', 'Year 4') },
  ];

  const clearFieldError = (field: keyof FieldErrors) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const validateRegister = (): boolean => {
    const nextErrors: FieldErrors = {};
    if (!name.trim()) nextErrors.name = tr('نسيت كتابة الاسم الكامل', 'Full name is required');
    if (!email.trim()) {
      nextErrors.email = tr('نسيت كتابة البريد الإلكتروني', 'Email is required');
    } else if (!EMAIL_REGEX.test(email.trim())) {
      nextErrors.email = tr('صيغة البريد الإلكتروني غير صحيحة', 'Invalid email format');
    }
    if (!phone.trim()) nextErrors.phone = tr('نسيت كتابة رقم التليفون', 'Phone number is required');
    if (!password) {
      nextErrors.password = tr('نسيت كتابة كلمة المرور', 'Password is required');
    } else if (password.length < 4) {
      nextErrors.password = tr(
        'كلمة المرور يجب أن تكون 4 أحرف على الأقل',
        'Password must be at least 4 characters'
      );
    }
    if (!year) nextErrors.year = tr('يرجى اختيار السنة الدراسية', 'Please choose academic year');
    if (!acceptedTerms) {
      nextErrors.terms = tr(
        'يجب الموافقة على الشروط والأحكام',
        'Please accept Terms & Conditions'
      );
    }

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const validateLogin = (): boolean => {
    const nextErrors: FieldErrors = {};
    if (!identifier.trim()) {
      nextErrors.identifier = tr(
        'نسيت كتابة الإيميل أو رقم التليفون',
        'Email or phone is required'
      );
    }
    if (!loginPassword) {
      nextErrors.loginPassword = tr('نسيت كتابة كلمة المرور', 'Password is required');
    }
    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === 'register') {
      if (!validateRegister() || !year) {
        setError(
          tr(
            'يرجى استكمال جميع الخانات المطلوبة المعلّمة بالأسفل قبل التسجيل.',
            'Please fill in all required fields marked below before registering.'
          )
        );
        return;
      }
    } else {
      if (!validateLogin()) {
        setError(
          tr('يرجى إدخال بيانات الدخول المطلوبة.', 'Please enter your login credentials.')
        );
        return;
      }
    }

    setSubmitting(true);
    try {
      if (mode === 'register' && year) {
        await register({
          name,
          email,
          phone,
          password,
          year,
          adminCode: registerAsAdmin ? adminCode : undefined,
          acceptedTerms,
        });
      } else {
        await login(identifier, loginPassword);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : tr('تعذر إتمام العملية.', 'Operation failed.')
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#09090B] text-[#F5F0E6] flex flex-col relative overflow-x-hidden">
      <GeoEngineeringBackground variant="page" />
      <div className="relative z-10 flex-1 grid grid-cols-1 lg:grid-cols-2 items-stretch">
        {/* Form Column */}
        <div className="flex flex-col justify-center px-6 py-8 sm:px-12 lg:px-14">
          <div className="w-full max-w-md mx-auto space-y-6">
            {/* Top Bar with Terms Badge & Language Switcher */}
            <div className="flex items-center justify-between gap-2">
              <GoldChip
                type="button"
                onClick={() => setTermsOpen(true)}
                className="text-xs px-3 py-1.5"
              >
                <Scale className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>{tr('الشروط والأحكام', 'Terms & Conditions')}</span>
              </GoldChip>

              <GoldChip onClick={toggleLang} className="text-xs px-3 py-1.5 font-mono">
                <Languages className="w-3.5 h-3.5" />
                <span>{lang === 'ar' ? 'English (EN)' : 'العربية (AR)'}</span>
              </GoldChip>
            </div>

            {/* Larger Official Floating Logo & MVIA Engineer Hat Title */}
            <div className="flex flex-col items-center text-center space-y-3">
              <FloatingLogo size="lg" />
              <div className="space-y-1 flex flex-col items-center">
                <h1 className="sr-only">MVIA</h1>
                <MviaBrandMark size="lg" />
                <p className="text-xs text-[#D4AF37]">
                  {tr(
                    'منصة MVIA التعليمية · GIS والبرمجة',
                    'MVIA Educational Platform · GIS & Programming'
                  )}
                </p>
              </div>
              <p className="text-xs sm:text-sm text-[#C8C2B8] leading-relaxed">
                {tr(
                  'سجّل دخولك أو أنشئ حسابك بالاسم والبريد الإلكتروني ورقم التليفون والسنة الدراسية للوصول إلى مواد دفعتك، الملخصات، الاختبارات الشاملة، ومجتمع الدفعة.',
                  'Sign in or register with your full name, email, phone, and academic year to access courses, PDF summaries, quizzes, and your batch community.'
                )}
              </p>
            </div>

            {/* Mode Toggle with Interactive Gold Chips */}
            <div className="grid grid-cols-2 gap-2 p-1.5 rounded-xl bg-[#121216] border border-white/10">
              <GoldChip
                active={mode === 'register'}
                layoutId="auth-mode-chip"
                onClick={() => {
                  setMode('register');
                  setError(null);
                  setFieldErrors({});
                }}
                className="w-full"
              >
                {tr('إنشاء حساب جديد', 'Create Account')}
              </GoldChip>
              <GoldChip
                active={mode === 'login'}
                layoutId="auth-mode-chip"
                onClick={() => {
                  setMode('login');
                  setError(null);
                  setFieldErrors({});
                }}
                className="w-full"
              >
                {tr('تسجيل الدخول', 'Sign In')}
              </GoldChip>
            </div>

            {suspensionNotice && (
              <div
                role="alert"
                className="p-3.5 rounded-xl bg-amber-950/60 border border-amber-500/50 text-amber-200 text-xs sm:text-sm flex items-start justify-between gap-2"
              >
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <span>{suspensionNotice}</span>
                </div>
                <button
                  type="button"
                  onClick={clearSuspensionNotice}
                  className="text-[11px] text-amber-300 underline shrink-0 cursor-pointer"
                >
                  {tr('إغلاق', 'Dismiss')}
                </button>
              </div>
            )}

            {error && (
              <div
                role="alert"
                className="p-3.5 rounded-xl bg-red-950/50 border border-red-500/40 text-red-200 text-sm flex items-center gap-2"
              >
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form noValidate onSubmit={handleSubmit} className="space-y-4">
              {mode === 'register' ? (
                <>
                  {/* Name */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-semibold text-[#C8C2B8]">
                        {tr('الاسم الكامل', 'Full Name')}
                      </label>
                      {fieldErrors.name && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-400">
                          <AlertCircle className="w-3.5 h-3.5" />
                          <span>{fieldErrors.name}</span>
                        </span>
                      )}
                    </div>
                    <div className="relative">
                      <UserIcon
                        className={`w-4 h-4 absolute start-3.5 top-1/2 -translate-y-1/2 pointer-events-none ${
                          fieldErrors.name ? 'text-amber-400' : 'text-[#A8A29E]'
                        }`}
                      />
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => {
                          setName(e.target.value);
                          clearFieldError('name');
                        }}
                        placeholder={tr('مثال: محمد أحمد علي', 'e.g. Mohamed Ahmed')}
                        className={`w-full ps-10 pe-4 py-2.5 rounded-xl bg-[#121216] border text-sm text-[#F5F0E6] placeholder-[#6B6661] focus:outline-none transition-colors ${
                          fieldErrors.name
                            ? 'border-amber-400/80 bg-amber-950/15'
                            : 'border-white/10 focus:border-[#D4AF37]'
                        }`}
                      />
                    </div>
                  </div>

                  {/* Email */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-semibold text-[#C8C2B8]">
                        {tr('البريد الإلكتروني (الإيميل)', 'Email Address')}
                      </label>
                      {fieldErrors.email && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-400">
                          <AlertCircle className="w-3.5 h-3.5" />
                          <span>{fieldErrors.email}</span>
                        </span>
                      )}
                    </div>
                    <div className="relative">
                      <Mail
                        className={`w-4 h-4 absolute start-3.5 top-1/2 -translate-y-1/2 pointer-events-none ${
                          fieldErrors.email ? 'text-amber-400' : 'text-[#A8A29E]'
                        }`}
                      />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          clearFieldError('email');
                        }}
                        placeholder="name@example.com"
                        className={`w-full ps-10 pe-4 py-2.5 rounded-xl bg-[#121216] border text-sm text-[#F5F0E6] placeholder-[#6B6661] font-mono focus:outline-none transition-colors ${
                          fieldErrors.email
                            ? 'border-amber-400/80 bg-amber-950/15'
                            : 'border-white/10 focus:border-[#D4AF37]'
                        }`}
                      />
                    </div>
                  </div>

                  {/* Phone */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-semibold text-[#C8C2B8]">
                        {tr('رقم التليفون', 'Phone Number')}
                      </label>
                      {fieldErrors.phone && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-400">
                          <AlertCircle className="w-3.5 h-3.5" />
                          <span>{fieldErrors.phone}</span>
                        </span>
                      )}
                    </div>
                    <div className="relative">
                      <Phone
                        className={`w-4 h-4 absolute start-3.5 top-1/2 -translate-y-1/2 pointer-events-none ${
                          fieldErrors.phone ? 'text-amber-400' : 'text-[#A8A29E]'
                        }`}
                      />
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => {
                          setPhone(e.target.value);
                          clearFieldError('phone');
                        }}
                        placeholder="010xxxxxxxx"
                        className={`w-full ps-10 pe-4 py-2.5 rounded-xl bg-[#121216] border text-sm text-[#F5F0E6] placeholder-[#6B6661] font-mono tabular-nums focus:outline-none transition-colors ${
                          fieldErrors.phone
                            ? 'border-amber-400/80 bg-amber-950/15'
                            : 'border-white/10 focus:border-[#D4AF37]'
                        }`}
                      />
                    </div>
                  </div>

                  {/* Password */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-semibold text-[#C8C2B8]">
                        {tr('كلمة المرور (الباسورد)', 'Password')}
                      </label>
                      {fieldErrors.password && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-400">
                          <AlertCircle className="w-3.5 h-3.5" />
                          <span>{fieldErrors.password}</span>
                        </span>
                      )}
                    </div>
                    <div className="relative">
                      <Lock
                        className={`w-4 h-4 absolute start-3.5 top-1/2 -translate-y-1/2 pointer-events-none ${
                          fieldErrors.password ? 'text-amber-400' : 'text-[#A8A29E]'
                        }`}
                      />
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          clearFieldError('password');
                        }}
                        placeholder="••••••••"
                        className={`w-full ps-10 pe-4 py-2.5 rounded-xl bg-[#121216] border text-sm text-[#F5F0E6] placeholder-[#6B6661] focus:outline-none transition-colors ${
                          fieldErrors.password
                            ? 'border-amber-400/80 bg-amber-950/15'
                            : 'border-white/10 focus:border-[#D4AF37]'
                        }`}
                      />
                    </div>
                  </div>

                  {/* Academic Year */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-semibold text-[#C8C2B8]">
                        {tr('السنة الدراسية', 'Academic Year')}
                      </label>
                      {fieldErrors.year && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-400">
                          <AlertCircle className="w-3.5 h-3.5" />
                          <span>{fieldErrors.year}</span>
                        </span>
                      )}
                    </div>
                    <div
                      className={`grid grid-cols-4 gap-2 p-1 rounded-xl border transition-colors ${
                        fieldErrors.year
                          ? 'border-amber-400/80 bg-amber-950/15'
                          : 'border-transparent'
                      }`}
                    >
                      {years.map((y) => (
                        <GoldChip
                          key={y.value}
                          active={year === y.value}
                          layoutId="reg-year-chip"
                          onClick={() => {
                            setYear(y.value);
                            clearFieldError('year');
                          }}
                          className="w-full px-2 text-xs"
                        >
                          {y.label}
                        </GoldChip>
                      ))}
                    </div>
                  </div>

                  <div className="pt-1 space-y-2.5">
                    <button
                      type="button"
                      onClick={() => setRegisterAsAdmin((prev) => !prev)}
                      className="inline-flex items-center gap-2 text-xs font-medium text-[#D4AF37] hover:text-[#F5D061] cursor-pointer"
                    >
                      <ShieldCheck className="w-4 h-4" />
                      <span>
                        {registerAsAdmin
                          ? tr('إلغاء التسجيل بصلاحية أدمن', 'Cancel Admin Registration')
                          : tr(
                              'هل أنت أدمن المنصة؟ اضغط لتفعيل صلاحية الأدمن',
                              'Platform Admin? Click to enter Admin Code'
                            )}
                      </span>
                    </button>

                    {registerAsAdmin && (
                      <motion.div
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-1.5 p-3.5 rounded-xl bg-[#121216] border border-[#D4AF37]/30"
                      >
                        <label className="block text-xs font-semibold text-[#E5C158]">
                          {tr(
                            'كود تفعيل الأدمن السري',
                            'Admin Secret Activation Code'
                          )}
                        </label>
                        <div className="relative">
                          <KeyRound className="w-4 h-4 text-[#D4AF37] absolute start-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <input
                            type="password"
                            value={adminCode}
                            onChange={(e) => setAdminCode(e.target.value)}
                            placeholder="••••••••"
                            className="w-full ps-10 pe-4 py-2 rounded-lg bg-[#09090B] border border-[#D4AF37]/40 text-sm text-[#F5F0E6] font-mono focus:outline-none focus:border-[#E5C158]"
                          />
                        </div>
                        <p className="text-[11px] text-[#A8A29E]">
                          {tr(
                            'يمنحك حساب الأدمن المحمي صلاحية إضافة/طرد الأعضاء وإضافة المواد والمجلدات والملخصات ولا يمكن لأي شخص طردك.',
                            'Protected Admin accounts manage users, courses, folders, covers, and announcements with kick immunity.'
                          )}
                        </p>
                      </motion.div>
                    )}
                  </div>

                  {/* Mandatory Terms & Conditions Acceptance */}
                  <div
                    className={`p-3 rounded-xl border transition-colors space-y-1.5 ${
                      fieldErrors.terms
                        ? 'bg-amber-950/20 border-amber-400/80'
                        : 'bg-[#121216] border-white/10'
                    }`}
                  >
                    <label className="flex items-start gap-2.5 text-xs text-[#E5E0D8] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={acceptedTerms}
                        onChange={(e) => {
                          setAcceptedTerms(e.target.checked);
                          clearFieldError('terms');
                        }}
                        className="accent-[#D4AF37] w-4 h-4 mt-0.5 shrink-0 cursor-pointer"
                      />
                      <span className="leading-relaxed">
                        {tr(
                          'أوافق على',
                          'I agree to the'
                        )}{' '}
                        <button
                          type="button"
                          onClick={() => setTermsOpen(true)}
                          className="text-[#E5C158] underline font-semibold hover:text-[#F5D061] cursor-pointer"
                        >
                          {tr('الشروط والأحكام', 'Terms & Conditions')}
                        </button>{' '}
                        {tr(
                          '(الالتزام في الشات والمنصة وإلا يتم حظر الحساب مؤقتاً ولا يمكن الدخول إلا بإذن الأدمن، ومنع التواصل مع الدعم الفني إلا للضرورة).',
                          '(Respectful conduct in chat & platform or temporary ban until Admin permission, and strict support contact policy).'
                        )}
                      </span>
                    </label>
                    {fieldErrors.terms && (
                      <div className="flex items-center gap-1 text-[11px] font-semibold text-amber-400">
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>{fieldErrors.terms}</span>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-semibold text-[#C8C2B8]">
                        {tr('البريد الإلكتروني أو رقم التليفون', 'Email or Phone Number')}
                      </label>
                      {fieldErrors.identifier && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-400">
                          <AlertCircle className="w-3.5 h-3.5" />
                          <span>{fieldErrors.identifier}</span>
                        </span>
                      )}
                    </div>
                    <div className="relative">
                      <Phone
                        className={`w-4 h-4 absolute start-3.5 top-1/2 -translate-y-1/2 pointer-events-none ${
                          fieldErrors.identifier ? 'text-amber-400' : 'text-[#A8A29E]'
                        }`}
                      />
                      <input
                        type="text"
                        value={identifier}
                        onChange={(e) => {
                          setIdentifier(e.target.value);
                          clearFieldError('identifier');
                        }}
                        placeholder="name@example.com / 010xxxxxxxx"
                        className={`w-full ps-10 pe-4 py-2.5 rounded-xl bg-[#121216] border text-sm text-[#F5F0E6] placeholder-[#6B6661] focus:outline-none transition-colors ${
                          fieldErrors.identifier
                            ? 'border-amber-400/80 bg-amber-950/15'
                            : 'border-white/10 focus:border-[#D4AF37]'
                        }`}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-semibold text-[#C8C2B8]">
                        {tr('كلمة المرور', 'Password')}
                      </label>
                      {fieldErrors.loginPassword && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-400">
                          <AlertCircle className="w-3.5 h-3.5" />
                          <span>{fieldErrors.loginPassword}</span>
                        </span>
                      )}
                    </div>
                    <div className="relative">
                      <Lock
                        className={`w-4 h-4 absolute start-3.5 top-1/2 -translate-y-1/2 pointer-events-none ${
                          fieldErrors.loginPassword ? 'text-amber-400' : 'text-[#A8A29E]'
                        }`}
                      />
                      <input
                        type="password"
                        value={loginPassword}
                        onChange={(e) => {
                          setLoginPassword(e.target.value);
                          clearFieldError('loginPassword');
                        }}
                        placeholder="••••••••"
                        className={`w-full ps-10 pe-4 py-2.5 rounded-xl bg-[#121216] border text-sm text-[#F5F0E6] placeholder-[#6B6661] focus:outline-none transition-colors ${
                          fieldErrors.loginPassword
                            ? 'border-amber-400/80 bg-amber-950/15'
                            : 'border-white/10 focus:border-[#D4AF37]'
                        }`}
                      />
                    </div>
                  </div>
                </>
              )}

              <GoldChip
                type="submit"
                active={true}
                disabled={submitting}
                className="w-full py-3 text-sm"
              >
                {submitting
                  ? tr('جاري المعالجة...', 'Processing...')
                  : mode === 'register'
                  ? tr('تسجيل والانضمام إلى MVIA', 'Register & Join MVIA')
                  : tr('دخول إلى المنصة', 'Enter MVIA Platform')}
              </GoldChip>
            </form>

            {/* Support Contact Bar right on Auth screen */}
            <div className="p-3.5 rounded-xl bg-[#121216] border border-[#D4AF37]/25">
              <SupportBar />
            </div>
          </div>
        </div>

        {/* Showcase Column with Large Floating MVIA Logo */}
        <div className="relative hidden lg:flex flex-col justify-between p-12 overflow-hidden border-s border-[#D4AF37]/20 bg-[#0D0D10]/90">
          <GeoEngineeringBackground variant="hero" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#09090B] via-[#09090B]/55 to-[#09090B]/30" />

          <div className="relative z-10 flex items-center justify-between text-xs text-[#D4AF37]">
            <span>
              {tr(
                'الفرقة الأولى · الثانية · الثالثة · الرابعة',
                'Year 1 · Year 2 · Year 3 · Year 4'
              )}
            </span>
            <span>GIS &amp; Software Engineering</span>
          </div>

          <div className="relative z-10 flex items-center justify-center py-8">
            <FloatingLogo size="2xl" />
          </div>

          <div className="relative z-10 space-y-6 max-w-lg">
            <h2 className="font-display text-3xl sm:text-4xl font-bold leading-snug text-[#F5F0E6] text-balance">
              {tr(
                'كل ما تحتاجه دفعتك من ملخصات واختبارات ومسارات GIS والبرمجة في مكان واحد.',
                'Everything your batch needs: folders, PDF summaries, quizzes, GIS & programming tracks in one place.'
              )}
            </h2>
            <p className="text-sm text-[#C8C2B8] leading-relaxed">
              {tr(
                'منصة MVIA مصممة خصيصاً لربط طلاب الفرق الأربع بمواد كل دفعة، مجلدات منظمة بأغلفة مخصصة، اختبارات تفاعلية بلوحة تصدر، حاسبة GPA، ومجتمع متكامل.',
                'MVIA connects students across all 4 academic years with organized course folders, PDF libraries, interactive quizzes, a GPA calculator, and a live batch community.'
              )}
            </p>
            <div className="grid grid-cols-3 gap-4 pt-4 border-t border-white/10">
              <div>
                <div className="font-mono text-2xl font-semibold text-[#E5C158] tabular-nums">
                  4
                </div>
                <div className="text-xs text-[#A8A29E] mt-0.5">
                  {tr('دفعات دراسية', 'Academic Years')}
                </div>
              </div>
              <div>
                <div className="font-mono text-2xl font-semibold text-[#E5C158] tabular-nums">
                  PDF
                </div>
                <div className="text-xs text-[#A8A29E] mt-0.5">
                  {tr('ملخصات ومذكرات', 'PDF Summaries')}
                </div>
              </div>
              <div>
                <div className="font-mono text-2xl font-semibold text-[#E5C158] tabular-nums">
                  4.0
                </div>
                <div className="text-xs text-[#A8A29E] mt-0.5">
                  {tr('حاسبة GPA دقيقة', 'GPA Calculator')}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Footer />
      <TermsModal open={termsOpen} onClose={() => setTermsOpen(false)} />
    </div>
  );
}
