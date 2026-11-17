interface GeoEngineeringBackgroundProps {
  variant?: 'page' | 'hero';
  className?: string;
}

export function GeoEngineeringBackground({
  variant = 'page',
  className = '',
}: GeoEngineeringBackgroundProps) {
  const isHero = variant === 'hero';

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none overflow-hidden select-none ${
        isHero ? 'absolute inset-0' : 'fixed inset-0 z-0'
      } ${className}`}
    >
      {/* Subtle radial warm gold ambient glow on obsidian */}
      <div
        className={`absolute inset-0 ${
          isHero
            ? 'bg-[radial-gradient(ellipse_at_center,rgba(212,175,55,0.14)_0%,rgba(9,9,11,0.92)_72%)]'
            : 'bg-[radial-gradient(circle_at_80%_15%,rgba(212,175,55,0.08)_0%,transparent_45%),radial-gradient(circle_at_15%_85%,rgba(212,175,55,0.06)_0%,transparent_45%)]'
        }`}
      />

      {/* Full Topographic Contour Maps + Grid + North Arrow + Total Station + Code Symbols */}
      <svg
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`w-full h-full ${isHero ? 'opacity-75' : 'opacity-40'}`}
      >
        <defs>
          <linearGradient id="mvBgGold" x1="0" y1="0" x2="1440" y2="900" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#F5D061" />
            <stop offset="50%" stopColor="#D4AF37" />
            <stop offset="100%" stopColor="#9A7209" />
          </linearGradient>
          <pattern
            id="mvGridPattern"
            width="90"
            height="90"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 90 0 L 0 0 0 90"
              stroke="#D4AF37"
              strokeOpacity="0.10"
              strokeWidth="0.7"
            />
            <path
              d="M -3 0 H 3 M 0 -3 V 3"
              stroke="#E5C158"
              strokeOpacity="0.22"
              strokeWidth="0.9"
            />
          </pattern>
        </defs>

        {/* Coordinate Surveying Grid */}
        <rect width="1440" height="900" fill="url(#mvGridPattern)" />

        {/* 1. TOPOGRAPHIC CONTOUR MAPS (Left Ridge System) */}
        <g stroke="url(#mvBgGold)" strokeOpacity="0.34" strokeWidth="1.2">
          <path d="M-60 220C90 120 260 110 380 210C490 300 410 470 250 510C90 550 -80 430 -60 220Z" />
          <path d="M-20 245C105 160 245 155 340 230C425 300 365 430 235 465C105 500 -45 395 -20 245Z" />
          <path d="M35 270C130 205 235 200 300 255C360 308 315 395 215 422C115 450 5 375 35 270Z" />
          <path d="M90 295C155 250 225 245 265 280C302 315 275 365 205 385C135 405 60 360 90 295Z" />
          <path
            d="M145 320C178 295 218 295 236 315C255 335 238 358 198 364C158 370 126 348 145 320Z"
            strokeDasharray="4 4"
          />
        </g>

        {/* TOPOGRAPHIC CONTOUR MAPS (Right Valley & Peak System) */}
        <g stroke="url(#mvBgGold)" strokeOpacity="0.32" strokeWidth="1.2">
          <path d="M920 820C980 620 1160 510 1340 530C1510 550 1560 720 1480 880C1360 960 880 940 920 820Z" />
          <path d="M985 805C1030 645 1175 560 1320 578C1450 595 1485 730 1420 855C1320 915 950 900 985 805Z" />
          <path d="M1050 785C1085 670 1195 610 1300 624C1395 636 1415 738 1365 828C1295 872 1025 860 1050 785Z" />
          <path d="M1115 765C1140 695 1215 656 1280 666C1340 676 1352 742 1316 800C1270 830 1098 820 1115 765Z" />
        </g>

        {/* Sweeping Elevation Contour Lines across Center */}
        <g stroke="#D4AF37" strokeOpacity="0.18" strokeWidth="1">
          <path d="M-40 680C220 590 470 760 740 670C1010 580 1220 420 1490 480" />
          <path d="M-40 725C240 635 490 805 760 715C1030 625 1240 465 1490 525" strokeDasharray="6 6" />
          <path d="M-40 120C270 190 540 50 860 135C1140 210 1310 95 1490 150" />
          <path d="M-40 155C270 225 540 85 860 170C1140 245 1310 130 1490 185" />
        </g>

        {/* Elevation labels */}
        <g fill="#E5C158" fillOpacity="0.38" fontFamily="monospace" fontSize="12">
          <text x="275" y="210">EL 142.5m</text>
          <text x="1150" y="618">CONTOUR +85.0m</text>
          <text x="585" y="695">30.0444° N · 31.2357° E</text>
        </g>

        {/* 2. COMPASS NORTH ARROW (Top-Right Quadrant) */}
        <g transform="translate(1220, 145)">
          {/* Outer Compass Ring */}
          <circle cx="0" cy="0" r="68" stroke="#D4AF37" strokeOpacity="0.38" strokeWidth="1.4" />
          <circle
            cx="0"
            cy="0"
            r="56"
            stroke="#E5C158"
            strokeOpacity="0.28"
            strokeWidth="1"
            strokeDasharray="3 5"
          />
          {/* Degree ticks */}
          <path
            d="M0 -74V-62M0 62V74M-74 0H-62M62 0H74"
            stroke="#F5D061"
            strokeOpacity="0.55"
            strokeWidth="1.8"
          />
          {/* Classic Two-Tone Gold Surveying North Arrow */}
          <path d="M0 -48L14 14L0 4V-48Z" fill="#F5D061" fillOpacity="0.58" />
          <path
            d="M0 -48L-14 14L0 4V-48Z"
            fill="#9A7209"
            fillOpacity="0.45"
            stroke="#E5C158"
            strokeOpacity="0.6"
            strokeWidth="1.2"
          />
          <path d="M0 4L8 26L0 18L-8 26L0 4Z" stroke="#D4AF37" strokeOpacity="0.48" strokeWidth="1.2" />
          {/* Letter N */}
          <text
            x="0"
            y="-56"
            textAnchor="middle"
            fill="#F5D061"
            fillOpacity="0.72"
            fontFamily="monospace"
            fontWeight="bold"
            fontSize="18"
          >
            N
          </text>
        </g>

        {/* 3. TOTAL STATION ON TRIPOD + SIGHTING RETICLE (Bottom-Left / Mid-Right Balance) */}
        <g transform="translate(170, 625)">
          {/* Target Crosshair Circle */}
          <circle cx="245" cy="-35" r="24" stroke="#D4AF37" strokeOpacity="0.35" strokeWidth="1.3" strokeDasharray="3 3" />
          <path d="M245 -68V-2M212 -35H278" stroke="#D4AF37" strokeOpacity="0.38" strokeWidth="1.2" />
          {/* Laser Sight Beam */}
          <line
            x1="88"
            y1="26"
            x2="245"
            y2="-35"
            stroke="#F5D061"
            strokeOpacity="0.45"
            strokeWidth="1.6"
            strokeDasharray="5 4"
          />
          {/* Total Station Head */}
          <path
            d="M42 10C42 4 47 0 54 0H66C73 0 78 4 78 10"
            stroke="#E5C158"
            strokeOpacity="0.58"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <rect
            x="38"
            y="12"
            width="44"
            height="36"
            rx="4"
            fill="#D4AF37"
            fillOpacity="0.14"
            stroke="#E5C158"
            strokeOpacity="0.55"
            strokeWidth="2"
          />
          {/* Aiming Telescope */}
          <g transform="rotate(-20 62 28)">
            <path
              d="M32 21H92L104 18V38L92 35H32V21Z"
              fill="#E5C158"
              fillOpacity="0.22"
              stroke="#F5D061"
              strokeOpacity="0.62"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <rect x="22" y="23.5" width="10" height="9" rx="1.5" stroke="#E5C158" strokeOpacity="0.55" strokeWidth="1.6" />
          </g>
          {/* Tribrach & Surveying Tripod */}
          <rect x="34" y="49" width="52" height="8" rx="2" fill="#D4AF37" fillOpacity="0.45" />
          <path
            d="M44 57L14 148M60 57V152M76 57L106 148"
            stroke="#E5C158"
            strokeOpacity="0.5"
            strokeWidth="3.2"
            strokeLinecap="round"
          />
          <path d="M29 102H91" stroke="#D4AF37" strokeOpacity="0.38" strokeWidth="1.8" strokeLinecap="round" />
        </g>

        {/* 4. PROGRAMMING CODE SYMBOLS (</> { } ; GIS.init() 0101) */}
        <g fill="#E5C158" fontFamily="monospace" fontWeight="bold">
          {/* Code Bracket Badge Left Top */}
          <g transform="translate(115, 110)" opacity="0.45">
            <rect
              x="0"
              y="0"
              width="126"
              height="44"
              rx="10"
              stroke="#D4AF37"
              strokeOpacity="0.5"
              strokeWidth="1.4"
              fill="#121216"
              fillOpacity="0.4"
            />
            <text x="63" y="29" textAnchor="middle" fontSize="22" letterSpacing="2">
              &lt;/&gt;
            </text>
          </g>

          {/* Curly Braces Mid-Right */}
          <g transform="translate(1150, 385)" opacity="0.42">
            <rect
              x="0"
              y="0"
              width="175"
              height="52"
              rx="12"
              stroke="#D4AF37"
              strokeOpacity="0.45"
              strokeWidth="1.4"
              fill="#121216"
              fillOpacity="0.35"
            />
            <text x="87" y="34" textAnchor="middle" fontSize="22">
              {'{ GIS }'}
            </text>
          </g>

          {/* Code Snippet Bottom Center-Right */}
          <g transform="translate(650, 775)" opacity="0.38">
            <text x="0" y="0" fontSize="16">
              const survey = await geo.project(CRS);
            </text>
            <text x="20" y="24" fontSize="14" fillOpacity="0.7">
              &lt;MAVIA mode=&quot;engineering&quot; /&gt;
            </text>
          </g>

          {/* Code Symbol Mid-Left */}
          <g transform="translate(470, 290)" opacity="0.32">
            <text x="0" y="0" fontSize="28">
              &#123; &#125;
            </text>
          </g>

          {/* Binary / Coordinate Matrix Accent Top-Center */}
          <g transform="translate(710, 95)" opacity="0.28" fontSize="13">
            <text x="0" y="0">01001101 · 01010110</text>
            <text x="0" y="18">if (azimuth &gt;= 0) locate();</text>
          </g>

          {/* Terminal Tag Bottom-Right */}
          <g transform="translate(1250, 760)" opacity="0.42">
            <text x="0" y="0" fontSize="24">
              &lt;/MAVIA&gt;
            </text>
          </g>
        </g>
      </svg>
    </div>
  );
}
