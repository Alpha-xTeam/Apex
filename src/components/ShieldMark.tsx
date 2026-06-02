import React from 'react';

type Size = 'sm' | 'md' | 'lg' | 'xl' | 'xxl';

interface ShieldMarkProps {
  size?: Size;
  className?: string;
}

const SIZE_MAP: Record<Size, number> = {
  sm: 80,
  md: 140,
  lg: 280,
  xl: 420,
  xxl: 520,
};

export const ShieldMark: React.FC<ShieldMarkProps> = ({ size = 'lg', className = '' }) => {
  const px = SIZE_MAP[size];
  return (
    <div
      className={`z-shield-wrap ${className}`}
      style={{ width: px, height: px * 1.2 }}
    >
      <div className="z-shield-grid" />

      <div className="z-shield-orbit-ring" />
      <div className="z-shield-orbit-ring-2" />

      <div className="z-shield-orbit">
        <span className="z-node z-node-1" />
        <span className="z-node z-node-2" />
        <span className="z-node z-node-3" />
        <span className="z-node z-node-4" />
        {size !== 'sm' && (
          <>
            <span className="z-node-label z-node-label-1">01</span>
            <span className="z-node-label z-node-label-2">10</span>
            <span className="z-node-label z-node-label-3">11</span>
            <span className="z-node-label z-node-label-4">01</span>
          </>
        )}
      </div>

      <svg
        className="z-shield-svg"
        viewBox="0 0 200 240"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="shieldFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1a1a1a" />
            <stop offset="100%" stopColor="#0a0a0a" />
          </linearGradient>
          <linearGradient id="lockFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#34d399" />
            <stop offset="100%" stopColor="#059669" />
          </linearGradient>
          <filter id="shieldGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <path
          d="M100 8 L182 48 L182 128 Q182 198 100 232 Q18 198 18 128 L18 48 Z"
          fill="url(#shieldFill)"
          stroke="#10b981"
          strokeWidth="3"
        />

        <path
          d="M100 22 L168 56 L168 128 Q168 188 100 216 Q32 188 32 128 L32 56 Z"
          stroke="rgba(16,185,129,0.25)"
          strokeWidth="1"
          strokeDasharray="3 4"
          fill="none"
        />

        <rect x="72" y="118" width="56" height="48" rx="6" fill="url(#lockFill)" />

        <path
          d="M82 118 V102 a18 18 0 0 1 36 0 V118"
          stroke="#10b981"
          strokeWidth="6"
          fill="none"
          strokeLinecap="round"
        />

        <circle cx="100" cy="138" r="5" fill="#0a0a0a" />
        <rect x="97.5" y="138" width="5" height="14" rx="1" fill="#0a0a0a" />

        <path d="M30 50 L30 40 L40 40" stroke="#10b981" strokeWidth="2" fill="none" />
        <path d="M170 50 L170 40 L160 40" stroke="#10b981" strokeWidth="2" fill="none" />
        <path d="M40 200 L30 200 L30 190" stroke="#10b981" strokeWidth="2" fill="none" />
        <path d="M160 200 L170 200 L170 190" stroke="#10b981" strokeWidth="2" fill="none" />
      </svg>

      <div className="z-shield-scan" />
      <div className="z-shield-glow" />

      {size !== 'sm' && (
        <>
          <div className="z-shield-binary z-binary-1">01001110</div>
          <div className="z-shield-binary z-binary-2">10110011</div>
          <div className="z-shield-binary z-binary-3">SECURE</div>
        </>
      )}
    </div>
  );
};
