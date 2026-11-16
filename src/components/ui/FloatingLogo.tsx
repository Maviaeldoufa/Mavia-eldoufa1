import { motion } from 'motion/react';
import { useState } from 'react';

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
  const [imgError, setImgError] = useState(false);

  return (
    <div
      className={`relative inline-flex flex-col items-center justify-center select-none ${className}`}
    >
      <motion.div
        animate={{ y: [0, -10, 0] }}
        transition={{
          duration: 4.2,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        whileHover={{ scale: 1.04 }}
        whileTap={onClick ? { scale: 0.96 } : undefined}
        onClick={onClick}
        className={`relative ${SIZE_CLASSES[size]} rounded-full overflow-hidden border border-[#D4AF37]/50 bg-[#09090B] shadow-[0_20px_50px_rgba(212,175,55,0.28)] ${
          onClick ? 'cursor-pointer' : ''
        }`}
      >
        {!imgError ? (
          <img
            src={OFFICIAL_MAFIA_LOGO_URL}
            alt="شعار منصة MVIA الرسمي — MVIA Surveying Engineers"
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
            className="w-full h-full object-cover scale-[1.03]"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-[#121216] font-display text-2xl font-bold text-[#E5C158]">
            MVIA
          </div>
        )}
      </motion.div>

      {/* Soft floating shadow reflection beneath the logo */}
      <motion.div
        animate={{ scaleX: [0.85, 0.68, 0.85], opacity: [0.45, 0.24, 0.45] }}
        transition={{
          duration: 4.2,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        aria-hidden="true"
        className="mt-3 h-2.5 w-3/4 rounded-full bg-[#D4AF37]/30 blur-md"
      />
    </div>
  );
}
