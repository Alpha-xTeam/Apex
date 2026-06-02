import React, { useState } from 'react';

interface NavbarProps {
  user: { id: string; name: string; email: string } | null;
  onLogin: () => void;
  onLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ user, onLogin, onLogout }) => {
  const initial = user?.name?.charAt(0) || user?.email?.charAt(0) || '?';
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <nav className="z-navbar">
        <div className="z-nav-inner">
          <a href="/" className="z-nav-logo">
            CyberArena<sup>®</sup>
          </a>

          <div className="z-nav-links">
            <a href="#about">من نحن</a>
            <a href="#services">خدماتنا</a>
            <a href="#work">أعمالنا</a>
            <a href="#contact">تواصل</a>
          </div>

          <div className="z-nav-right">
            <div className="z-nav-status">
              <span className="z-nav-dot" />
              <span>متاح — ٩:٠٠م — ٢٣ يونيو ٢٠٢٦</span>
            </div>

            {/* Desktop login button (hidden on mobile) */}
            {user ? (
              <div className="z-nav-user-desktop">
                <div className="z-nav-avatar">{initial}</div>
                <button onClick={onLogout} className="z-nav-logout-btn">تسجيل خروج</button>
              </div>
            ) : (
              <button onClick={onLogin} className="z-nav-login-btn" aria-label="تسجيل دخول">
                <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                  <polyline points="10 17 15 12 10 7" />
                  <line x1="15" y1="12" x2="3" y2="12" />
                </svg>
                <span>تسجيل دخول</span>
              </button>
            )}

            {/* Mobile menu button (hidden on desktop) */}
            <button
              className="z-nav-menu-btn"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="القائمة"
            >
              <span className="z-nav-menu-text">القائمة</span>
              <span className="z-nav-menu-icon">
                <span /><span />
              </span>
            </button>
          </div>
        </div>
      </nav>

      {menuOpen && (
        <div className="z-nav-drawer">
          <a href="#about" onClick={() => setMenuOpen(false)}>من نحن</a>
          <a href="#services" onClick={() => setMenuOpen(false)}>خدماتنا</a>
          <a href="#work" onClick={() => setMenuOpen(false)}>أعمالنا</a>
          <a href="#contact" onClick={() => setMenuOpen(false)}>تواصل</a>
          <div className="z-nav-drawer-cta">
            {user ? (
              <>
                <div className="z-nav-drawer-user">
                  <div className="z-nav-avatar">{initial}</div>
                  <span>{user.name || user.email}</span>
                </div>
                <button onClick={() => { setMenuOpen(false); onLogout(); }} className="z-btn z-btn-dark">تسجيل خروج</button>
              </>
            ) : (
              <button onClick={() => { setMenuOpen(false); onLogin(); }} className="z-btn z-btn-dark">سجّل الدخول</button>
            )}
          </div>
        </div>
      )}
    </>
  );
};
