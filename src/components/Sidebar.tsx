import React from 'react';

interface SidebarProps {
  top?: React.ReactNode;
  children?: React.ReactNode;
  bottom?: React.ReactNode;
  logoHref?: string;
  onLogoClick?: (e: React.MouseEvent) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ top, children, bottom, logoHref = '/', onLogoClick }) => (
  <aside className="dash-header z-navbar">
    <div className="dash-header-inner z-nav-inner">
      <a href={logoHref} className="dash-logo z-nav-logo" aria-label="CyberArena" title="CyberArena" onClick={onLogoClick}>
        <svg viewBox="0 0 200 240" fill="none" className="dash-logo-dot" aria-hidden="true">
          <defs>
            <linearGradient id="sdShield" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1a1a1a" />
              <stop offset="100%" stopColor="#0a0a0a" />
            </linearGradient>
          </defs>
          <path d="M100 8 L182 48 L182 128 Q182 198 100 232 Q18 198 18 128 L18 48 Z" fill="url(#sdShield)" stroke="#10b981" strokeWidth="3" />
          <rect x="72" y="118" width="56" height="48" rx="6" fill="#10b981" />
          <path d="M82 118 V102 a18 18 0 0 1 36 0 V118" stroke="#10b981" strokeWidth="6" fill="none" strokeLinecap="round" />
          <circle cx="100" cy="138" r="5" fill="#0a0a0a" />
          <rect x="97.5" y="138" width="5" height="14" rx="1" fill="#0a0a0a" />
        </svg>
        <span className="dash-logo-text">CyberArena</span>
      </a>

      {top && <div className="dash-nav-top">{top}</div>}

      <div className="dash-nav-center">
        {children ? <nav className="dash-nav">{children}</nav> : null}
      </div>

      {bottom && <div className="dash-nav-bottom">{bottom}</div>}
    </div>
  </aside>
);
