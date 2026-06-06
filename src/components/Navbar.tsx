import React, { useState } from 'react';
import { useI18n } from '../i18n/I18nContext';
import { LanguageSwitcher } from './LanguageSwitcher';

interface NavbarProps {
  user: { id: string; name: string; email: string } | null;
  onLogin: () => void;
  onLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ user, onLogin, onLogout }) => {
  const initial = user?.name?.charAt(0) || user?.email?.charAt(0) || '?';
  const [menuOpen, setMenuOpen] = useState(false);
  const { t } = useI18n();

  return (
    <>
      <nav className="z-navbar">
        <div className="z-nav-inner">
          <a href="/" className="z-nav-logo">
            CyberArena<sup>®</sup>
          </a>

          <div className="z-nav-links">
            <a href="#about">{t.nav.about}</a>
            <a href="#services">{t.nav.services}</a>
            <a href="#work">{t.nav.work}</a>
            <a href="#contact">{t.nav.contact}</a>
          </div>

          <div className="z-nav-right">
            <div className="z-nav-status">
              <span className="z-nav-dot" />
              <span>متاح — ٩:٠٠م — ٢٣ يونيو ٢٠٢٦</span>
            </div>

            <LanguageSwitcher />

            {/* Desktop login button (hidden on mobile) */}
            {user ? (
              <div className="z-nav-user-desktop">
                <div className="z-nav-avatar">{initial}</div>
                <button onClick={onLogout} className="z-nav-logout-btn">{t.nav.logout}</button>
              </div>
            ) : (
              <button onClick={onLogin} className="z-nav-login-btn" aria-label={t.nav.login}>
                <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                  <polyline points="10 17 15 12 10 7" />
                  <line x1="15" y1="12" x2="3" y2="12" />
                </svg>
                <span>{t.nav.login}</span>
              </button>
            )}

            {/* Mobile menu button (hidden on desktop) */}
            <button
              className="z-nav-menu-btn"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label={t.nav.menu}
            >
              <span className="z-nav-menu-text">{t.nav.menu}</span>
              <span className="z-nav-menu-icon">
                <span /><span />
              </span>
            </button>
          </div>
        </div>
      </nav>

      {menuOpen && (
        <div className="z-nav-drawer">
          <a href="#about" onClick={() => setMenuOpen(false)}>{t.nav.about}</a>
          <a href="#services" onClick={() => setMenuOpen(false)}>{t.nav.services}</a>
          <a href="#work" onClick={() => setMenuOpen(false)}>{t.nav.work}</a>
          <a href="#contact" onClick={() => setMenuOpen(false)}>{t.nav.contact}</a>
          <div style={{ padding: '8px 16px' }}>
            <LanguageSwitcher />
          </div>
          <div className="z-nav-drawer-cta">
            {user ? (
              <>
                <div className="z-nav-drawer-user">
                  <div className="z-nav-avatar">{initial}</div>
                  <span>{user.name || user.email}</span>
                </div>
                <button onClick={() => { setMenuOpen(false); onLogout(); }} className="z-btn z-btn-dark">{t.nav.logout}</button>
              </>
            ) : (
              <button onClick={() => { setMenuOpen(false); onLogin(); }} className="z-btn z-btn-dark">{t.nav.login}</button>
            )}
          </div>
        </div>
      )}
    </>
  );
};
