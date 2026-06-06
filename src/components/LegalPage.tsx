import React, { useState } from 'react';
import { navigateTo } from '../App';
import { useI18n } from '../i18n/I18nContext';
import { LanguageSwitcher } from './LanguageSwitcher';

type Tab = 'privacy' | 'terms';

export const LegalPage: React.FC = () => {
  const { t, lang } = useI18n();
  const [tab, setTab] = useState<Tab>('privacy');
  const sections = tab === 'privacy' ? t.legal.privacy : t.legal.terms;

  return (
    <div className="legal-page">
      <div className="legal-bg-grid" aria-hidden="true" />

      <nav className="legal-nav">
        <a
          href="/"
          onClick={(e) => { e.preventDefault(); navigateTo('home'); }}
          className="legal-back"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12 19 5 12 12 5"></polyline>
          </svg>
          <span>{t.legal.back}</span>
        </a>
        <a href="/" className="legal-logo" onClick={(e) => { e.preventDefault(); navigateTo('home'); }}>
          CyberArena<sup>®</sup>
        </a>
        <div style={{ marginInlineStart: 'auto' }}>
          <LanguageSwitcher />
        </div>
      </nav>

      <div className="legal-shell">
        <header className="legal-header">
          <span className="z-tag">{t.legal.tag}</span>
          <h1 className="legal-title">{t.legal.title}</h1>
          <p className="legal-subtitle">{t.legal.subtitle}</p>
        </header>

        <div className="legal-tabs">
          <button
            className={`legal-tab ${tab === 'privacy' ? 'active' : ''}`}
            onClick={() => setTab('privacy')}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <span>{t.legal.privacyTab}</span>
          </button>
          <button
            className={`legal-tab ${tab === 'terms' ? 'active' : ''}`}
            onClick={() => setTab('terms')}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="9" y1="13" x2="15" y2="13" />
              <line x1="9" y1="17" x2="15" y2="17" />
            </svg>
            <span>{t.legal.termsTab}</span>
          </button>
        </div>

        <div className="legal-content">
          <div className="legal-meta">
            <span>{t.legal.lastUpdate} 2 {lang === 'ar' ? 'يونيو' : 'June'} 2026</span>
            <span>•</span>
            <span>{t.legal.version} 2.1</span>
          </div>

          {sections.map((s, i) => (
            <section
              key={`${tab}-${i}`}
              className="legal-section"
            >
              <h2 className="legal-section-title">{s.title}</h2>
              <p className="legal-section-content">{s.content}</p>
            </section>
          ))}

          <div className="legal-footer-note">
            <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            <p>
              {t.legal.contactNote}{' '}
              <a href="mailto:hello@cyberarena.com">hello@cyberarena.com</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
