import React from 'react';
import { navigateTo } from '../App';
import { useI18n } from '../i18n/I18nContext';
import { LanguageSwitcher } from './LanguageSwitcher';

export const Footer: React.FC = () => {
  const { t } = useI18n();
  const year = new Date().getFullYear();
  return (
    <footer id="contact" className="z-footer">
      <div className="z-footer-inner">
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '16px 0' }}>
          <LanguageSwitcher />
        </div>
        <div className="z-footer-cta">
          <span className="z-tag">{t.footer.ctaTag}</span>
          <h2 className="z-footer-cta-title">{t.footer.ctaTitle}</h2>
          <a
            href="/auth"
            onClick={(e) => { e.preventDefault(); navigateTo('auth'); }}
            className="z-footer-mail z-footer-login"
          >
            <span>{t.footer.ctaButton}</span>
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <line x1="7" y1="17" x2="17" y2="7"></line>
              <polyline points="7 7 17 7 17 17"></polyline>
            </svg>
          </a>
        </div>

        <div className="z-footer-grid">
          <div className="z-footer-col">
            <a href="/" className="z-footer-logo">CyberArena<sup>®</sup></a>
            <p className="z-footer-desc">{t.footer.description}</p>
          </div>

          <div className="z-footer-col">
            <h4 className="z-footer-heading">{t.footer.platform}</h4>
            <a href="#about">{t.footer.aboutLink}</a>
            <a href="#services">{t.footer.ideaLink}</a>
            <a href="#features">{t.footer.featuresLink}</a>
            <a href="#work">{t.footer.workLink}</a>
          </div>

          <div className="z-footer-col">
            <h4 className="z-footer-heading">{t.footer.connect}</h4>
            <a href="/auth" onClick={(e) => { e.preventDefault(); navigateTo('auth'); }}>
              {t.footer.loginLink}
            </a>
          </div>

          <div className="z-footer-col">
            <h4 className="z-footer-heading">{t.footer.legal}</h4>
            <a href="/legal" onClick={(e) => { e.preventDefault(); navigateTo('legal'); }}>
              {t.footer.privacy}
            </a>
            <a href="/legal" onClick={(e) => { e.preventDefault(); navigateTo('legal'); }}>
              {t.footer.terms}
            </a>
          </div>
        </div>

        <div className="z-footer-bottom">
          <div className="z-footer-socials">
            <a href="https://instagram.com/talpha.dev" target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="z-footer-social-icon" title="@talpha.dev">
              <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="2" width="20" height="20" rx="5" />
                <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
              </svg>
            </a>
            <a href="https://t.me/xteam_alpha" target="_blank" rel="noopener noreferrer" aria-label="Telegram" className="z-footer-social-icon" title="@xteam_alpha">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z" />
              </svg>
            </a>
            <img src="/ALPHA-LOGO.png" alt="Alpha Team" className="z-footer-team-logo" title="Alpha Team" />
          </div>
          <p>© {year} CyberArena. {t.footer.copyright}</p>
        </div>
      </div>
    </footer>
  );
};
