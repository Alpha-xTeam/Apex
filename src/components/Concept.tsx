import React from 'react';
import { navigateTo } from '../App';
import { useI18n } from '../i18n/I18nContext';

export const Concept: React.FC = () => {
  const { t } = useI18n();
  const STEPS = t.concept.steps.map((s, i) => ({ ...s, number: `0${i + 1}` }));
  return (
    <section id="services" className="z-section z-concept">
      <div className="z-concept-inner">
        <div className="z-concept-header" data-reveal>
          <span className="z-tag">{t.concept.tag}</span>
          <h2 className="z-concept-title">{t.concept.title}</h2>
        </div>

        <div className="z-concept-grid">
          {STEPS.map((s, i) => (
            <article key={s.number} className="z-step-card" data-reveal data-reveal-delay={String(100 + i * 120)}>
              <div className="z-step-card-head">
                <span className="z-step-num">{s.number}</span>
                <span className="z-step-tag">{s.tag}</span>
              </div>
              <h3 className="z-step-title">{s.title}</h3>
              <p className="z-step-desc">{s.desc}</p>
              <a href="/auth" onClick={(e) => { e.preventDefault(); navigateTo('auth'); }} className="z-step-cta">
                <span>{t.concept.learnMore}</span>
                <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="7" y1="17" x2="17" y2="7"></line>
                  <polyline points="7 7 17 7 17 17"></polyline>
                </svg>
              </a>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};
