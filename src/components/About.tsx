import React from 'react';
import { navigateTo } from '../App';
import { useI18n } from '../i18n/I18nContext';

const SOCIALS = [
  { label: 'Instagram', handle: '@talpha.dev', href: 'https://instagram.com/talpha.dev', icon: (
    <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  )},
  { label: 'Telegram', handle: '@xteam_alpha', href: 'https://t.me/xteam_alpha', icon: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
      <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z" />
    </svg>
  )},
];

export const About: React.FC = () => {
  const { t } = useI18n();
  return (
    <section id="about" className="z-section z-about">
      <div className="z-about-inner">
        <div className="z-tag-row" data-reveal>
          <span className="z-tag">{t.about.tag}</span>
        </div>

        <h2 className="z-about-title" data-reveal data-reveal-delay="100">
          {t.about.title}
        </h2>

        <p className="z-about-desc" data-reveal data-reveal-delay="200">
          {t.about.desc}
        </p>

        <div className="z-about-actions" data-reveal data-reveal-delay="300">
          <div className="z-about-social">
            <span className="z-about-social-label">{t.about.followUs}</span>
            {SOCIALS.map((s) => (
              <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer" aria-label={s.label} className="z-social-icon" title={s.handle}>
                {s.icon}
              </a>
            ))}
          </div>

          <a href="/auth" onClick={(e) => { e.preventDefault(); navigateTo('auth'); }} className="z-btn z-btn-light z-btn-pill">
            {t.about.learnMore}
          </a>
        </div>

        <div className="z-team-credit" data-reveal data-reveal-delay="400">
          <span className="z-team-credit-label">{t.about.creditLabel}</span>
          <div className="z-team-credit-card">
            <img src="/ALPHA-LOGO.png" alt="Alpha Team" className="z-team-credit-logo" />
            <div className="z-team-credit-info">
              <span className="z-team-credit-name">{t.about.teamName}</span>
              <span className="z-team-credit-tagline">{t.about.teamTagline}</span>
            </div>
            <div className="z-team-credit-socials">
              <a href="https://instagram.com/talpha.dev" target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="z-team-social-pill">
                <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="2" width="20" height="20" rx="5" />
                  <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                  <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
                </svg>
                <span>@talpha.dev</span>
              </a>
              <a href="https://t.me/xteam_alpha" target="_blank" rel="noopener noreferrer" aria-label="Telegram" className="z-team-social-pill">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                  <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z" />
                </svg>
                <span>@xteam_alpha</span>
              </a>
            </div>
          </div>
        </div>

        <div className="z-globe-card" data-reveal data-reveal-delay="500">
          <div className="z-globe-illu" aria-hidden="true">
            <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <radialGradient id="globeG" cx="50%" cy="40%" r="60%">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.18" />
                  <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
                </radialGradient>
              </defs>
              <circle cx="100" cy="100" r="80" fill="url(#globeG)" />
              <circle cx="100" cy="100" r="70" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.25" />
              <ellipse cx="100" cy="100" rx="70" ry="25" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.3" />
              <ellipse cx="100" cy="100" rx="35" ry="70" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.3" />
              <ellipse cx="100" cy="100" rx="55" ry="70" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.2" />
              <line x1="30" y1="100" x2="170" y2="100" stroke="currentColor" strokeWidth="1" opacity="0.3" />
              <line x1="100" y1="30" x2="100" y2="170" stroke="currentColor" strokeWidth="1" opacity="0.3" />
              <circle cx="60" cy="80" r="3" fill="#10b981" />
              <circle cx="135" cy="70" r="3" fill="#10b981" />
              <circle cx="120" cy="135" r="3" fill="#10b981" />
              <circle cx="70" cy="130" r="3" fill="#10b981" />
              <circle cx="145" cy="110" r="3" fill="#10b981" />
              <circle cx="50" cy="105" r="3" fill="#10b981" />
            </svg>
          </div>
          <div className="z-globe-content">
            <h3 className="z-globe-title">{t.about.globeTitle}</h3>
            <p className="z-globe-desc">{t.about.globeDesc}</p>
          </div>
        </div>
      </div>
    </section>
  );
};
