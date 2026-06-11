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

  const navShellStyle: React.CSSProperties = {
    position: 'fixed',
    top: 18,
    left: '50%',
    right: 'auto',
    zIndex: 100,
    width: 'min(calc(100% - 32px), 1320px)',
    transform: 'translateX(-50%)',
    background: 'var(--z-cream)',
    border: '1px solid rgba(10, 10, 10, 0.1)',
    borderRadius: 30,
    boxShadow: '0 18px 55px rgba(10, 10, 10, 0.1)',
  };

  const navInnerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 12px 10px 16px',
    gap: 16,
  };

  const logoStyle: React.CSSProperties = {
    fontFamily: 'var(--font-arabic)',
    fontWeight: 900,
    fontSize: 18,
    letterSpacing: '-0.03em',
    color: 'var(--z-cream)',
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'baseline',
    gap: 2,
    padding: '8px 14px',
    borderRadius: 999,
    background: 'var(--z-ink)',
    whiteSpace: 'nowrap',
  };

  const linksStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    flex: 1,
  };

  const linkStyle: React.CSSProperties = {
    fontFamily: 'var(--font-arabic)',
    fontSize: 14,
    fontWeight: 700,
    color: 'var(--z-ink)',
    textDecoration: 'none',
    padding: '9px 14px',
    borderRadius: 999,
    whiteSpace: 'nowrap',
  };

  const rightStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  };

  const statusStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 12,
    color: 'var(--z-ink)',
    fontWeight: 700,
    border: '1px solid rgba(16, 185, 129, 0.28)',
    padding: '8px 14px',
    borderRadius: 999,
    background: 'var(--z-orange-soft)',
    whiteSpace: 'nowrap',
  };

  const actionButtonStyle: React.CSSProperties = {
    fontFamily: 'var(--font-arabic)',
    fontSize: 13,
    fontWeight: 800,
    cursor: 'pointer',
    border: 'none',
    borderRadius: 999,
    padding: '10px 18px',
    background: 'var(--z-ink)',
    color: 'var(--z-cream)',
    boxShadow: '0 10px 24px rgba(10, 10, 10, 0.14)',
    whiteSpace: 'nowrap',
  };

  const logoutButtonStyle: React.CSSProperties = {
    fontFamily: 'var(--font-arabic)',
    fontSize: 13,
    fontWeight: 800,
    cursor: 'pointer',
    border: '1px solid rgba(10, 10, 10, 0.12)',
    borderRadius: 999,
    padding: '8px 16px',
    background: 'var(--z-cream)',
    color: 'var(--z-ink)',
    whiteSpace: 'nowrap',
  };

  const drawerStyle: React.CSSProperties = {
    position: 'fixed',
    top: 90,
    right: 32,
    width: 'min(360px, calc(100% - 64px))',
    background: 'var(--z-cream)',
    borderRadius: 28,
    padding: 18,
    boxShadow: '0 28px 70px rgba(0, 0, 0, 0.14)',
    border: '1px solid rgba(10, 10, 10, 0.12)',
    zIndex: 99,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    animation: 'z-slide-down 0.25s ease',
  };

  const drawerLinkStyle: React.CSSProperties = {
    fontFamily: 'var(--font-arabic)',
    fontSize: 16,
    fontWeight: 600,
    color: 'var(--z-ink)',
    textDecoration: 'none',
    padding: '12px 14px',
    borderRadius: 18,
    borderBottom: '1px solid var(--z-line)',
  };

  return (
    <>
      <nav className="z-navbar" style={navShellStyle}>
        <div className="z-nav-inner" style={navInnerStyle}>
          <a href="/" className="z-nav-logo" style={logoStyle}>
            CyberArena<sup>®</sup>
          </a>

          <div className="z-nav-links" style={linksStyle}>
            <a href="#about" style={linkStyle}>{t.nav.about}</a>
            <a href="#services" style={linkStyle}>{t.nav.services}</a>
            <a href="#work" style={linkStyle}>{t.nav.work}</a>
            <a href="#contact" style={linkStyle}>{t.nav.contact}</a>
          </div>

          <div className="z-nav-right" style={rightStyle}>
            <div className="z-nav-status" style={statusStyle}>
              <span className="z-nav-dot" />
              <span>متاح — ٩:٠٠م — ٢٣ يونيو ٢٠٢٦</span>
            </div>

            <LanguageSwitcher />

            {/* Desktop login button (hidden on mobile) */}
            {user ? (
              <div className="z-nav-user-desktop">
                <div className="z-nav-avatar">{initial}</div>
                <button onClick={onLogout} className="z-nav-logout-btn" style={logoutButtonStyle}>{t.nav.logout}</button>
              </div>
            ) : (
              <button onClick={onLogin} className="z-nav-login-btn" aria-label={t.nav.login} style={actionButtonStyle}>
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
              style={actionButtonStyle}
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
        <div className="z-nav-drawer" style={drawerStyle}>
          <a href="#about" onClick={() => setMenuOpen(false)} style={drawerLinkStyle}>{t.nav.about}</a>
          <a href="#services" onClick={() => setMenuOpen(false)} style={drawerLinkStyle}>{t.nav.services}</a>
          <a href="#work" onClick={() => setMenuOpen(false)} style={drawerLinkStyle}>{t.nav.work}</a>
          <a href="#contact" onClick={() => setMenuOpen(false)} style={drawerLinkStyle}>{t.nav.contact}</a>
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
                <button onClick={() => { setMenuOpen(false); onLogout(); }} className="z-btn z-btn-dark" style={actionButtonStyle}>{t.nav.logout}</button>
              </>
            ) : (
              <button onClick={() => { setMenuOpen(false); onLogin(); }} className="z-btn z-btn-dark" style={actionButtonStyle}>{t.nav.login}</button>
            )}
          </div>
        </div>
      )}
    </>
  );
};
