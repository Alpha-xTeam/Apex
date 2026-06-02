import React from 'react';

interface IconProps {
  size?: number;
}

export const BlueTeamIcon: React.FC<IconProps> = ({ size = 64 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 80 80"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <defs>
      <linearGradient id="blueShieldGrad" x1="40" y1="6" x2="40" y2="74" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#60a5fa" stopOpacity="0.35" />
        <stop offset="1" stopColor="#1d4ed8" stopOpacity="0.08" />
      </linearGradient>
      <linearGradient id="blueCheckGrad" x1="28" y1="32" x2="52" y2="48" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#93c5fd" />
        <stop offset="1" stopColor="#3b82f6" />
      </linearGradient>
    </defs>

    <path
      d="M40 6 L66 16 L66 42 C66 57 53 68 40 74 C27 68 14 57 14 42 L14 16 Z"
      fill="url(#blueShieldGrad)"
      stroke="#3b82f6"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />

    <g fill="#3b82f6" opacity="0.4">
      <circle cx="22" cy="24" r="1" />
      <circle cx="58" cy="24" r="1" />
      <circle cx="22" cy="56" r="1" />
      <circle cx="58" cy="56" r="1" />
      <circle cx="40" cy="16" r="1" />
    </g>

    <g stroke="#3b82f6" strokeWidth="0.6" strokeOpacity="0.35" strokeDasharray="2 3" strokeLinecap="round">
      <line x1="20" y1="32" x2="60" y2="32" />
      <line x1="20" y1="48" x2="60" y2="48" />
      <line x1="40" y1="20" x2="40" y2="60" />
    </g>

    <circle cx="40" cy="40" r="11" fill="rgba(59, 130, 246, 0.15)" stroke="#3b82f6" strokeWidth="1.2" />
    <path
      d="M33 40 L38 45 L47 35"
      stroke="url(#blueCheckGrad)"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </svg>
);

export const RedTeamIcon: React.FC<IconProps> = ({ size = 64 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 80 80"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <defs>
      <radialGradient id="redTargetGrad" cx="40" cy="40" r="30" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#fca5a5" stopOpacity="0.4" />
        <stop offset="0.6" stopColor="#ef4444" stopOpacity="0.15" />
        <stop offset="1" stopColor="#ef4444" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="redArrowGrad" x1="56" y1="24" x2="40" y2="40" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#fca5a5" />
        <stop offset="1" stopColor="#ef4444" />
      </linearGradient>
    </defs>

    <circle cx="40" cy="40" r="30" fill="url(#redTargetGrad)" stroke="#ef4444" strokeWidth="1.5" />
    <circle cx="40" cy="40" r="22" stroke="#ef4444" strokeWidth="0.8" strokeOpacity="0.5" />
    <circle cx="40" cy="40" r="14" stroke="#ef4444" strokeWidth="1" strokeOpacity="0.7" />

    <g stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round">
      <line x1="40" y1="6" x2="40" y2="14" />
      <line x1="40" y1="66" x2="40" y2="74" />
      <line x1="6" y1="40" x2="14" y2="40" />
      <line x1="66" y1="40" x2="74" y2="40" />
    </g>

    <circle cx="40" cy="40" r="4" fill="#ef4444" />

    <g transform="rotate(45 40 40)">
      <line x1="40" y1="40" x2="68" y2="40" stroke="url(#redArrowGrad)" strokeWidth="2.5" strokeLinecap="round" />
      <path
        d="M68 40 L62 36 M68 40 L62 44"
        stroke="#ef4444"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M40 40 L36 36 M40 40 L36 44"
        stroke="#ef4444"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </g>
  </svg>
);

export const PathIcon: React.FC<IconProps> = ({ size = 56 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 80 80"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <defs>
      <linearGradient id="pathGrad" x1="40" y1="8" x2="40" y2="72" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#a78bfa" stopOpacity="0.35" />
        <stop offset="1" stopColor="#7c3aed" stopOpacity="0.08" />
      </linearGradient>
    </defs>

    {/* Outer rounded square */}
    <rect x="10" y="10" width="60" height="60" rx="16" fill="url(#pathGrad)" stroke="#8b5cf6" strokeWidth="1.5" />

    {/* Winding path */}
    <path
      d="M22 56 C 22 44, 38 44, 38 32 C 38 22, 50 22, 50 16"
      stroke="#a78bfa"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeDasharray="0"
      fill="none"
    />

    {/* Path waypoints */}
    <circle cx="22" cy="56" r="4" fill="#8b5cf6" />
    <circle cx="22" cy="56" r="2" fill="#0b0f1a" />
    <circle cx="38" cy="38" r="3" fill="#a78bfa" />
    <circle cx="50" cy="22" r="5" fill="#8b5cf6" stroke="#a78bfa" strokeWidth="1" />
    <path
      d="M48 22 L49.5 23.5 L52 21"
      stroke="#0b0f1a"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />

    {/* Decorative stars/sparkles */}
    <g fill="#a78bfa" opacity="0.5">
      <circle cx="60" cy="44" r="1" />
      <circle cx="18" cy="20" r="1" />
      <circle cx="64" cy="60" r="1" />
    </g>
  </svg>
);

export const StoryIcon: React.FC<IconProps> = ({ size = 36 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 80 80"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <defs>
      <linearGradient id="storyGrad" x1="40" y1="8" x2="40" y2="72" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#a78bfa" stopOpacity="0.3" />
        <stop offset="1" stopColor="#6d28d9" stopOpacity="0.05" />
      </linearGradient>
    </defs>

    <path
      d="M40 8 L66 18 L66 42 C66 57 53 68 40 72 C27 68 14 57 14 42 L14 18 Z"
      fill="url(#storyGrad)"
      stroke="#8b5cf6"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />

    {/* Open book inside */}
    <path
      d="M22 36 L22 56 C 22 56, 30 53, 40 56 C 50 53, 58 56, 58 56 L58 36 C 58 36, 50 33, 40 36 C 30 33, 22 36, 22 36 Z"
      fill="rgba(139, 92, 246, 0.1)"
      stroke="#a78bfa"
      strokeWidth="1.2"
      strokeLinejoin="round"
    />
    <line x1="40" y1="36" x2="40" y2="56" stroke="#8b5cf6" strokeWidth="1" strokeOpacity="0.5" />

    {/* Small star above */}
    <path
      d="M40 18 L41.5 22 L45 22.5 L42.5 25 L43 28.5 L40 27 L37 28.5 L37.5 25 L35 22.5 L38.5 22 Z"
      fill="#a78bfa"
      opacity="0.6"
    />
  </svg>
);

export const TaskIcon: React.FC<IconProps> = ({ size = 36 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 80 80"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <defs>
      <linearGradient id="taskGrad" x1="40" y1="8" x2="40" y2="72" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#fbbf24" stopOpacity="0.3" />
        <stop offset="1" stopColor="#d97706" stopOpacity="0.05" />
      </linearGradient>
    </defs>

    <rect x="10" y="10" width="60" height="60" rx="16" fill="url(#taskGrad)" stroke="#f59e0b" strokeWidth="1.5" />

    <circle cx="40" cy="40" r="22" stroke="#f59e0b" strokeWidth="1.2" strokeOpacity="0.5" />
    <circle cx="40" cy="40" r="14" stroke="#f59e0b" strokeWidth="1.2" strokeOpacity="0.7" />
    <circle cx="40" cy="40" r="6" fill="#f59e0b" />

    <line x1="40" y1="40" x2="64" y2="16" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round" />
    <path d="M64 16 L58 18 L60 24 Z" fill="#fbbf24" />
    <path d="M40 40 L34 38 L36 44 Z" fill="#fbbf24" />

    <g fill="#f59e0b" opacity="0.6">
      <circle cx="18" cy="18" r="1.5" />
      <circle cx="62" cy="62" r="1.5" />
    </g>
  </svg>
);

export const LeaderboardHeroIcon: React.FC<IconProps> = ({ size = 80 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 80 80"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <defs>
      <linearGradient id="lbHeroGrad" x1="40" y1="8" x2="40" y2="72" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#fbbf24" stopOpacity="0.5" />
        <stop offset="1" stopColor="#d97706" stopOpacity="0.1" />
      </linearGradient>
      <linearGradient id="lbCrownGrad" x1="28" y1="32" x2="52" y2="48" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#fde68a" />
        <stop offset="1" stopColor="#f59e0b" />
      </linearGradient>
    </defs>

    {/* Glow circle behind */}
    <circle cx="40" cy="40" r="36" fill="url(#lbHeroGrad)" opacity="0.4" />

    {/* Outer hexagon-like shield */}
    <path
      d="M40 8 L66 18 L66 42 C66 57 53 68 40 72 C27 68 14 57 14 42 L14 18 Z"
      fill="rgba(11, 15, 26, 0.6)"
      stroke="#fbbf24"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />

    {/* Crown */}
    <path
      d="M26 46 L30 36 L36 42 L40 32 L44 42 L50 36 L54 46 L54 50 L26 50 Z"
      fill="url(#lbCrownGrad)"
      stroke="#f59e0b"
      strokeWidth="0.8"
      strokeLinejoin="round"
    />

    {/* Crown gems */}
    <circle cx="30" cy="36" r="1.5" fill="#ef4444" />
    <circle cx="40" cy="32" r="1.5" fill="#3b82f6" />
    <circle cx="50" cy="36" r="1.5" fill="#10b981" />

    {/* Stars around */}
    <g fill="#fbbf24">
      <path d="M16 24 L17 26 L19 26.5 L17 27 L17.5 29 L16 28 L14.5 29 L15 27 L13 26.5 L15 26 Z" opacity="0.7" />
      <path d="M64 24 L65 26 L67 26.5 L65 27 L65.5 29 L64 28 L62.5 29 L63 27 L61 26.5 L63 26 Z" opacity="0.7" />
      <circle cx="20" cy="56" r="1" opacity="0.6" />
      <circle cx="60" cy="56" r="1" opacity="0.6" />
    </g>
  </svg>
);

export const TrophyIcon: React.FC<IconProps> = ({ size = 32 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <defs>
      <linearGradient id="trophyGrad" x1="16" y1="4" x2="16" y2="28" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#fde68a" />
        <stop offset="1" stopColor="#f59e0b" />
      </linearGradient>
    </defs>
    <path
      d="M10 6 L22 6 L22 14 C22 17.3 19.3 20 16 20 C12.7 20 10 17.3 10 14 Z"
      fill="url(#trophyGrad)"
      stroke="#d97706"
      strokeWidth="0.8"
    />
    <path d="M10 9 L6 9 L6 13 C6 15 7.5 16.5 10 16.5" stroke="#f59e0b" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    <path d="M22 9 L26 9 L26 13 C26 15 24.5 16.5 22 16.5" stroke="#f59e0b" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    <rect x="13" y="20" width="6" height="4" fill="#d97706" />
    <rect x="10" y="24" width="12" height="3" rx="1" fill="#f59e0b" />
  </svg>
);

export const SparkleIcon: React.FC<IconProps> = ({ size = 16 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path d="M12 2 L13.5 8.5 L20 10 L13.5 11.5 L12 18 L10.5 11.5 L4 10 L10.5 8.5 Z" />
    <path d="M19 16 L19.7 18.3 L22 19 L19.7 19.7 L19 22 L18.3 19.7 L16 19 L18.3 18.3 Z" opacity="0.7" />
    <path d="M5 17 L5.5 18.5 L7 19 L5.5 19.5 L5 21 L4.5 19.5 L3 19 L4.5 18.5 Z" opacity="0.5" />
  </svg>
);

