import React from 'react';
import { navigateTo } from '../App';
import { useI18n } from '../i18n/I18nContext';

export const Goal: React.FC = () => {
  const { t } = useI18n();
  return (
    <section id="work" className="z-section z-goal">
      <div className="z-goal-inner">
        <div className="z-goal-card">
          <div className="z-goal-card-head" data-reveal>
            <div className="z-tag-row">
              <span className="z-tag">{t.goal.tag}</span>
            </div>
            <h2 className="z-goal-title">{t.goal.title}</h2>
            <p className="z-goal-desc">{t.goal.desc}</p>
          </div>

          <div className="z-cases-grid">
            {t.goal.cases.map((c, i) => (
              <article
                key={c.id}
                className={`z-case-card ${c.team === 'RED' ? 'z-case-dark' : 'z-case-light'}`}
                data-reveal
                data-reveal-delay={String(100 + i * 120)}
              >
                <div className="z-case-head">
                  <span className={`z-case-team ${c.team === 'BLUE' ? 'z-case-team-blue' : ''}`}>{c.team}</span>
                  <span className="z-case-id">{c.id}</span>
                </div>
                <h3 className="z-case-title">{c.title}</h3>
                <p className="z-case-desc">{c.desc}</p>
                <div className="z-case-meta">
                  {c.meta.map((m, j) => (
                    <React.Fragment key={j}>
                      <span>{m}</span>
                      {j < c.meta.length - 1 && <span>•</span>}
                    </React.Fragment>
                  ))}
                </div>
                <a href="/auth" onClick={(e) => { e.preventDefault(); navigateTo('auth'); }} className="z-case-cta">
                  <span>{t.goal.startScenario}</span>
                  <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="7" y1="17" x2="17" y2="7"></line>
                    <polyline points="7 7 17 7 17 17"></polyline>
                  </svg>
                </a>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
