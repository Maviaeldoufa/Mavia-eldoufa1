import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

interface MviaBrandMarkProps {
  size?: 'sm' | 'md' | 'lg';
  lit?: boolean;
  interactive?: boolean;
}

export function MviaBrandMark({
  size = 'sm',
  lit = false,
  interactive = true,
}: MviaBrandMarkProps) {
  const [selfLit, setSelfLit] = useState(false);
  const [hovered, setHovered] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  const handleClick = () => {
    if (!interactive) return;
    setSelfLit(true);
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => setSelfLit(false), 900);
  };

  const isLit = lit || selfLit;
  const isGlowing = isLit || hovered;
  const floatAmplitude = size === 'sm' ? -2.5 : size === 'md' ? -4 : -5;
  const textClass =
    size === 'lg'
      ? 'text-4xl sm:text-5xl pt-4 px-5 pb-1.5'
      : size === 'md'
      ? 'text-3xl sm:text-4xl pt-3.5 px-4 pb-1'
      : 'text-2xl sm:text-[26px] pt-2.5 px-3 pb-0.5';

  const hatDims =
    size === 'lg'
      ? 'w-9 h-[25px] -top-[19px] -left-[4px]'
      : size === 'md'
      ? 'w-8 h-[22px] -top-[16px] -left-[4px]'
      : 'w-6 h-4 -top-[12px] -left-[3px]';

  return (
    <motion.span
      dir="ltr"
      onClick={handleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      animate={{ y: [0, floatAmplitude, 0] }}
      transition={{ duration: 4.0, repeat: Infinity, ease: 'easeInOut' }}
      className={`relative inline-flex items-baseline whitespace-nowrap shrink-0 select-none font-display font-bold tracking-wider leading-none transition-all duration-200 ${textClass} ${
        interactive ? 'cursor-pointer' : ''
      } ${
        isLit
          ? 'drop-shadow-[0_0_20px_rgba(255,241,184,0.95)] brightness-125 scale-[1.03]'
          : hovered
          ? 'drop-shadow-[0_0_12px_rgba(229,193,88,0.65)] brightness-110'
          : ''
      }`}
    >
      {isGlowing && (
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute -inset-1 rounded-xl blur-md transition-opacity duration-200 ${
            isLit ? 'bg-[#FFF1B8]/30 opacity-100' : 'bg-[#D4AF37]/20 opacity-80'
          }`}
        />
      )}
      {/* Aimed Surveying Total Station on Tripod behind the MAVIA wordmark */}
      <motion.svg
        viewBox="0 0 180 68"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        animate={{
          opacity: isLit ? 1 : hovered ? 0.8 : [0.45, 0.7, 0.45],
        }}
        transition={{
          duration: isGlowing ? 0.2 : 3.6,
          repeat: isGlowing ? 0 : Infinity,
          ease: 'easeInOut',
        }}
        className="pointer-events-none absolute inset-0 w-full h-full overflow-visible"
        aria-hidden="true"
      >
        <defs>
          <linearGradient
            id="mviaTotalStationGold"
            x1="15"
            y1="8"
            x2="165"
            y2="60"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#FFF0B3" stopOpacity="0.95" />
            <stop offset="50%" stopColor="#D4AF37" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#9A7209" stopOpacity="0.55" />
          </linearGradient>
          <linearGradient
            id="mviaSightLaser"
            x1="82"
            y1="20"
            x2="176"
            y2="14"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#F5D061" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#F5D061" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Precision Surveying Target Reticle on the Aiming Axis (Right) */}
        <circle
          cx="154"
          cy="17"
          r="9"
          stroke="#D4AF37"
          strokeOpacity="0.45"
          strokeWidth="1.2"
          strokeDasharray="2.5 2.5"
        />
        <path
          d="M154 5V29M142 17H166"
          stroke="#D4AF37"
          strokeOpacity="0.45"
          strokeWidth="1.1"
        />

        {/* Aiming Optical / Laser Sight Beam */}
        <path
          d="M90 21L170 15"
          stroke="url(#mviaSightLaser)"
          strokeWidth="1.4"
          strokeDasharray="4 3"
        />

        {/* Total Station Instrument Head & Yoke (Centered slightly left behind MAVIA) */}
        <g transform="translate(36, 4)">
          {/* Carry Handle */}
          <path
            d="M17 7C17 4.5 19 3 22 3H30C33 3 35 4.5 35 7"
            stroke="url(#mviaTotalStationGold)"
            strokeWidth="2.1"
            strokeLinecap="round"
          />
          {/* U-Shaped Standards / Frame */}
          <path
            d="M15 9H37V28H15V9Z"
            fill="#D4AF37"
            fillOpacity="0.22"
            stroke="url(#mviaTotalStationGold)"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          {/* Aimed Telescope Barrel (angled like a precision surveying sight) */}
          <g transform="rotate(-8 28 17)">
            {/* Objective Lens Housing (aiming right/forward) */}
            <path
              d="M12 13H45L51 11.5V22.5L45 21H12V13Z"
              fill="#E5C158"
              fillOpacity="0.34"
              stroke="url(#mviaTotalStationGold)"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
            {/* Eyepiece */}
            <rect
              x="6"
              y="14.5"
              width="6"
              height="5"
              rx="1"
              fill="#D4AF37"
              fillOpacity="0.45"
              stroke="url(#mviaTotalStationGold)"
              strokeWidth="1.3"
            />
            {/* Objective Glass Highlight */}
            <line
              x1="49"
              y1="12.5"
              x2="49"
              y2="21.5"
              stroke="#FFF2BF"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </g>

          {/* Tribrach / Leveling Base Plate */}
          <rect
            x="13"
            y="28.5"
            width="26"
            height="4.5"
            rx="1.5"
            fill="url(#mviaTotalStationGold)"
          />
          {/* Surveying Tripod Legs */}
          <path
            d="M18 33L4 62M26 33V63M34 33L48 62"
            stroke="url(#mviaTotalStationGold)"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          {/* Tripod Mid Braces */}
          <path
            d="M12 48H40"
            stroke="#D4AF37"
            strokeOpacity="0.5"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
        </g>
      </motion.svg>

      {/* Foreground Unified MAVIA Wordmark with Engineer Hard Hat Directly on First Letter M */}
      <span className="relative z-10 inline-flex items-baseline drop-shadow-[0_2px_8px_rgba(9,9,11,0.95)]">
        <span className="relative inline-block">
          <motion.svg
            viewBox="0 0 64 42"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            animate={{ rotate: [-12, -8, -12], y: [0, -1.5, 0] }}
            transition={{ duration: 3.8, repeat: Infinity, ease: 'easeInOut' }}
            className={`pointer-events-none absolute ${hatDims} drop-shadow-[0_2px_6px_rgba(212,175,55,0.55)]`}
            aria-hidden="true"
          >
            <defs>
              <linearGradient
                id="mviaDirectHardHat"
                x1="10"
                y1="4"
                x2="54"
                y2="34"
                gradientUnits="userSpaceOnUse"
              >
                <stop offset="0%" stopColor="#FFF2BF" />
                <stop offset="50%" stopColor="#E5C158" />
                <stop offset="100%" stopColor="#B8860B" />
              </linearGradient>
            </defs>
            {/* Hard Hat Dome */}
            <path
              d="M12 29C12 16 20.5 7 32 7C43.5 7 52 16 52 29H12Z"
              fill="url(#mviaDirectHardHat)"
              stroke="#09090B"
              strokeWidth="2"
            />
            {/* Safety Ridge Crown */}
            <path
              d="M27.5 5.2C27.5 3.9 28.6 3 30 3H34C35.4 3 36.5 3.9 36.5 5.2V25H27.5V5.2Z"
              fill="#FFF5CC"
              stroke="#09090B"
              strokeWidth="1.6"
            />
            {/* Side Ribs */}
            <path
              d="M20 15L22.5 23"
              stroke="#8A6206"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path
              d="M44 15L41.5 23"
              stroke="#8A6206"
              strokeWidth="2"
              strokeLinecap="round"
            />
            {/* Front Brim */}
            <path
              d="M5 30C5 28 6.8 26.8 9 26.8H54.5C57.5 26.8 60 28.4 60 30.5C60 32.6 57.5 33.8 52.5 33.8H10.5C7 33.8 5 32.2 5 30Z"
              fill="#F5D061"
              stroke="#09090B"
              strokeWidth="1.8"
            />
          </motion.svg>
          <span className="bg-gradient-to-b from-[#FFF1B8] via-[#E5C158] to-[#C6931B] bg-clip-text text-transparent">
            M
          </span>
        </span>

        <span className="bg-gradient-to-b from-[#FFF1B8] via-[#E5C158] to-[#C6931B] bg-clip-text text-transparent">
          AVIA
        </span>
      </span>
    </motion.span>
  );
}
