import { Headset, Languages, LogOut, Scale, ShieldCheck, UserCog } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import type { NavSection } from '../../types';
import { AccountModal } from './AccountModal';
import { MviaBrandMark } from './MviaBrandMark';
import { NotificationsBell } from './NotificationsBell';
import { RankIconGlyph } from './RankBadge';
import { SupportCenterModal } from './SupportCenterModal';
import { TermsModal } from './TermsModal';

interface NavbarProps {
  activeSection: NavSection;
  onChangeSection: (section: NavSection) => void;
}

export function Navbar({ activeSection, onChangeSection }: NavbarProps) {
  const { user, logout } = useAuth();
  const { lang, toggleLang, tr } = useLanguage();
  const [termsOpen, setTermsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);

  const navItems: Array<{ id: NavSection; label: string }> = [
    { id: 'home', label: 'Home' },
    { id: 'courses', label: tr('الكورسات', 'Courses') },
    { id: 'learning', label: 'Learning' },
    { id: 'gpa', label: tr('حاسبة GPA', 'GPA Calc') },
    { id: 'community', label: 'Community' },
  ];

  return (
    <>
    <header className="sticky top-0 z-40 border-b border-[#D4AF37]/20 bg-[#09090B]/95 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 h-16 flex items-center justify-between gap-2 sm:gap-4">
        {/* Zone 1: Custom M with Engineer Hard Hat + MVIA Wordmark */}
        <button
          type="button"
          onClick={() => onChangeSection('home')}
          className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] rounded-lg px-1 py-0.5 shrink-0"
        >
          <MviaBrandMark size="sm" />
        </button>

        {/* Zone 2: 5 concise single-line nav links with smooth Gold active chip */}
        <nav
          aria-label={tr('التنقل الرئيسي', 'Main Navigation')}
          className="hidden lg:flex items-center gap-1.5"
        >
          {navItems.map((item) => {
            const isActive = activeSection === item.id;
            return (
              <motion.button
                key={item.id}
                type="button"
                onClick={() => onChangeSection(item.id)}
                whileTap={{ scale: 0.95 }}
                transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                className={`relative px-3.5 py-2 rounded-lg text-sm font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] ${
                  isActive
                    ? 'text-[#09090B]'
                    : 'text-[#C8C2B8] hover:text-[#F5D061]'
                }`}
              >
                {isActive && (
                  <motion.span
                    layoutId="mvia-main-nav-pill"
                    transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                    className="absolute inset-0 bg-gradient-to-l from-[#D4AF37] to-[#E5C158] rounded-lg"
                  />
                )}
                <span className="relative z-10">{item.label}</span>
              </motion.button>
            );
          })}
        </nav>

        {/* Zone 3: Language Switcher + Terms Badge + Notifications Bell + User + Logout Button */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setSupportOpen(true)}
            title={tr('الدعم الفني والتواصل مع الإدارة', 'Technical Support & Contact')}
            aria-label={tr('الدعم الفني', 'Technical Support')}
            className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-semibold border border-emerald-500/40 bg-emerald-950/40 text-emerald-200 hover:bg-emerald-600 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Headset className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">{tr('الدعم الفني', 'Support')}</span>
          </button>

          <button
            type="button"
            onClick={() => setTermsOpen(true)}
            title={tr('الشروط والأحكام', 'Terms & Conditions')}
            aria-label={tr('الشروط والأحكام', 'Terms & Conditions')}
            className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg text-xs font-semibold border border-[#D4AF37]/35 bg-[#151519] text-[#E5C158] hover:bg-[#D4AF37] hover:text-[#09090B] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Scale className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden md:inline">{tr('الشروط والأحكام', 'Terms')}</span>
          </button>

          <motion.button
            type="button"
            onClick={toggleLang}
            whileTap={{ scale: 0.95 }}
            aria-label={tr('تبديل إلى الإنجليزية', 'Switch to Arabic')}
            className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg text-xs font-mono font-semibold border border-[#D4AF37]/40 bg-[#151519] text-[#E5C158] hover:bg-[#D4AF37] hover:text-[#09090B] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Languages className="w-3.5 h-3.5" />
            <span>{lang === 'ar' ? 'EN' : 'عربي'}</span>
          </motion.button>

          <NotificationsBell onNavigate={onChangeSection} />

          {user && (
            <button
              type="button"
              onClick={() => setAccountOpen(true)}
              title={
                user.rankBadge
                  ? `${user.name} — ${lang === 'ar' ? user.rankBadge.nameAr : user.rankBadge.nameEn}`
                  : tr('حسابي وإدارة البيانات', 'My Account & Data')
              }
              aria-label={tr('حسابي وإدارة البيانات', 'My Account & Data')}
              className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium border border-white/10 bg-[#151519] text-[#F5F0E6] hover:border-[#D4AF37]/50 hover:text-[#E5C158] transition-colors cursor-pointer shrink-0"
            >
              {user.rankBadge ? (
                <RankIconGlyph
                  icon={user.rankBadge.badgeIcon}
                  color={user.rankBadge.badgeColor}
                  className="w-4 h-4"
                />
              ) : user.role === 'admin' ? (
                <ShieldCheck
                  className="w-4 h-4 text-[#D4AF37] shrink-0"
                  aria-label={tr('أدمن', 'Admin')}
                />
              ) : (
                <UserCog className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
              )}
              <span className="hidden xl:inline max-w-[110px] truncate">
                {user.name}
              </span>
            </button>
          )}

          <motion.button
            type="button"
            onClick={logout}
            whileTap={{ scale: 0.95 }}
            title={tr('تسجيل الخروج', 'Sign Out')}
            aria-label={tr('تسجيل الخروج', 'Sign Out')}
            className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-lg text-xs font-semibold border border-red-500/30 bg-red-950/35 text-red-200 hover:bg-red-600 hover:text-white hover:border-red-500 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">{tr('تسجيل الخروج', 'Logout')}</span>
          </motion.button>
        </div>
      </div>

      {/* Mobile & Tablet compact horizontal nav strip */}
      <nav
        aria-label={tr('تنقل الجوال والتابلت', 'Mobile & Tablet Navigation')}
        className="lg:hidden flex items-center gap-1.5 px-3 pb-2.5 overflow-x-auto"
      >
        {navItems.map((item) => {
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChangeSection(item.id)}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                isActive
                  ? 'bg-[#D4AF37] text-[#09090B]'
                  : 'bg-[#151519] text-[#C8C2B8] border border-white/10'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>
    </header>
    <TermsModal open={termsOpen} onClose={() => setTermsOpen(false)} />
    <AccountModal open={accountOpen} onClose={() => setAccountOpen(false)} />
    <SupportCenterModal open={supportOpen} onClose={() => setSupportOpen(false)} />
    </>
  );
}
