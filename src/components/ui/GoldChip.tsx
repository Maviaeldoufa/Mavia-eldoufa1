import { motion } from 'motion/react';
import React from 'react';

interface GoldChipProps {
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  layoutId?: string;
  className?: string;
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
}

export function GoldChip({
  active = false,
  onClick,
  children,
  layoutId,
  className = '',
  type = 'button',
  disabled = false,
}: GoldChipProps) {
  return (
    <motion.button
      type={type}
      disabled={disabled}
      onClick={onClick}
      whileHover={disabled ? undefined : { y: -1 }}
      whileTap={disabled ? undefined : { scale: 0.95 }}
      transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
      className={`relative overflow-hidden inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] disabled:opacity-50 disabled:cursor-not-allowed ${
        active
          ? 'text-[#09090B] hover:brightness-110 hover:shadow-[0_0_22px_rgba(245,208,97,0.6)] active:shadow-[0_0_28px_rgba(255,241,184,0.85)]'
          : 'bg-[#151519] text-[#C8C2B8] border border-white/10 hover:border-[#F5D061]/70 hover:text-[#F5D061] hover:shadow-[0_0_18px_rgba(212,175,55,0.35)] active:shadow-[0_0_24px_rgba(245,208,97,0.6)]'
      } ${className}`}
    >
      {active && layoutId && (
        <motion.span
          layoutId={layoutId}
          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
          className="absolute inset-0 bg-gradient-to-l from-[#D4AF37] via-[#E5C158] to-[#C89B2B] rounded-lg"
        />
      )}
      {active && !layoutId && (
        <span className="absolute inset-0 bg-gradient-to-l from-[#D4AF37] via-[#E5C158] to-[#C89B2B] rounded-lg" />
      )}
      <span className="relative z-10 inline-flex items-center gap-2">{children}</span>
    </motion.button>
  );
}
