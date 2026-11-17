import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';

export const OFFICIAL_MAFIA_LOGO_URL =
  '/assets/aistudio/WhatsApp_Image_2026-11-15_at_7.29.40_AM_319e32e4.jpeg';

interface FloatingLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  onClick?: () => void;
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<FloatingLogoProps['size']>, string> = {
  sm: 'w-14 h-14',
  md: 'w-20 h-20',
  lg: 'w-36 h-36 sm:w-44 sm:h-44',
  xl: 'w-48 h-48 sm:w-56 sm:h-56',
  '2xl': 'w-56 h-56 sm:w-72 sm:h-72',
};

export function FloatingLogo({
  size = 'lg',
  onClick,
  className = '',
}: FloatingLogoProps) {
  const { tr } = useLanguage();
  const [imgError, setImgError] = useState(false);
  const [lit, setLit] = useState(false);
  const [hovered, setHovered] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  const triggerIlluminate = () => {
    setLit(true);
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      setLit(false);
    }, 950);
    onClick?.();
  };

  const isGlowing = lit || hovered;

  return (
    <div
      className={`relative inline-flex flex-col items-center justify-center select-none ${className}`}
    >
      {/* Ambient / Click Golden Halo */}
      <motion.div
        aria-hidden="true"
        animate={
          lit
            ? { scale: [0.92, 1.3, 1.12], opacity: [0.35, 0.95, 0.5] }
            : hovered
            ? { scale: 1.14, opacity: 0.7 }
            : { scale: 0.96, opacity: 0.2 }
        }
        transition={{ duration: lit ? 0.55 : 0.2, ease: [0.16, 1, 0.3, 1] }}
        className="pointer-events-none absolute -inset-4 rounded-full bg-[radial-gradient(circle,rgba(255,241,184,0.65)_0%,rgba(212,175,55,0.35)_45%,transparent_72%)] blur-xl"
      />

      <motion.button
        type="button"
        onClick={triggerIlluminate}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        animate={{ y: [0, -10, 0] }}
        transition={{
          duration: 4.2,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.96 }}
        aria-label={tr(
          'شعار منصة MAVIA الرسمي — اضغط للإضاءة',
          'Official MAVIA Logo — click to illuminate'
        )}
        className={`group relative ${SIZE_CLASSES[size]} rounded-full overflow-hidden border bg-[#09090B] cursor-pointer transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFF1B8] ${
          lit
            ? 'border-[#FFF1B8] shadow-[0_0_48px_rgba(255,241,184,0.92),0_0_92px_rgba(212,175,55,0.68)]'
            : hovered
            ? 'border-[#F5D061] shadow-[0_0_34px_rgba(229,193,88,0.62),0_18px_46px_rgba(212,175,55,0.38)]'
            : 'border-[#D4AF37]/50 shadow-[0_20px_50px_rgba(212,175,55,0.28)]'
        }`}
      >
        {!imgError ? (
          <img
            src={OFFICIAL_MAFIA_LOGO_URL}
            alt="شعار منصة MAVIA الرسمي — MAVIA Surveying Engineers"
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
            className={`w-full h-full object-cover scale-[1.03] transition-[filter,transform] duration-200 ${
              lit
                ? 'brightness-125 contrast-105'
                : hovered
                ? 'brightness-110'
                : ''
            }`}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-[#121216] font-display text-2xl font-bold text-[#E5C158]">
            MAVIA
          </div>
        )}

        {/* Inner light flash & diagonal specular sweep when clicked */}
        <AnimatePresence>
          {lit && (
            <>
              <motion.span
                key="logo-radial-flash"
                aria-hidden="true"
                initial={{ opacity: 0.85, scale: 0.6 }}
                animate={{ opacity: 0, scale: 1.4 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.75, ease: 'easeOut' }}
                className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(255,248,220,0.75)_0%,rgba(212,175,55,0.35)_50%,transparent_75%)]"
              />
              <motion.span
                key="logo-sheen-sweep"
                aria-hidden="true"
                initial={{ x: '-120%', opacity: 0.9 }}
                animate={{ x: '130%', opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
                className="pointer-events-none absolute inset-y-0 w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-[#FFF6D6]/75 to-transparent"
              />
            </>
          )}
        </AnimatePresence>

        {/* Crisp inner rim highlight when lit or hovered */}
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 rounded-full transition-opacity duration-200 ring-2 ring-inset ${
            lit
              ? 'ring-[#FFF1B8]/90 opacity-100'
              : hovered
              ? 'ring-[#F5D061]/60 opacity-100'
              : 'ring-transparent opacity-0'
          }`}
        />
      </motion.button>

      {/* Soft floating shadow reflection beneath the logo */}
      <motion.div
        animate={{
          scaleX: isGlowing ? [0.95, 0.78, 0.95] : [0.85, 0.68, 0.85],
          opacity: isGlowing ? [0.75, 0.45, 0.75] : [0.45, 0.24, 0.45],
        }}
        transition={{
          duration: 4.2,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        aria-hidden="true"
        className={`mt-3 h-2.5 w-3/4 rounded-full blur-md transition-colors duration-200 ${
          lit ? 'bg-[#FFF1B8]/65' : 'bg-[#D4AF37]/30'
        }`}
      />
    </div>
  );
}
