import React from 'react';

interface SidebarProps {
  children?: React.ReactNode;
  bottom?: React.ReactNode;
  logoHref?: string;
  onLogoClick?: (e: React.MouseEvent) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ children, bottom, logoHref = '/', onLogoClick }) => (
  <aside className="dash-header z-navbar">
    <div className="dash-header-inner z-nav-inner">
      <a href={logoHref} className="dash-logo z-nav-logo" aria-label="CyberArena" title="CyberArena" onClick={onLogoClick}>
        <span className="dash-logo-text">CyberArena</span>
        <span className="dash-logo-dot" aria-hidden="true" />
      </a>

      <div className="dash-nav-center">
        {children ? <nav className="dash-nav">{children}</nav> : null}
      </div>

      {bottom && <div className="dash-nav-bottom">{bottom}</div>}
    </div>
  </aside>
);
