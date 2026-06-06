import React, { useState } from 'react';
import { useI18n } from '../i18n/I18nContext';

const IDS = ['defend', 'attack', 'analyze', 'build', 'train'];

export const Pills: React.FC = () => {
  const { t } = useI18n();
  const [active, setActive] = useState('train');
  return (
    <section className="z-section z-pills">
      <div className="z-pills-inner">
        <div className="z-pills-pill-list">
          {IDS.map((id, i) => {
            const p = t.pills.items[i];
            return (
              <button
                key={id}
                onClick={() => setActive(id)}
                className={`z-pill ${active === id ? 'active' : ''}`}
              >
                <span className="z-pill-num">{p.sub}</span>
                <span className="z-pill-label">{p.label}</span>
              </button>
            );
          })}
        </div>
        <div className="z-pills-content">
          {IDS.filter((id) => id === active).map((id, i) => {
            const idx = IDS.indexOf(id);
            const p = t.pills.items[idx];
            return (
              <div key={id} className="z-pill-card">
                <div className="z-pill-card-head">
                  <span className="z-pill-card-sub">{p.sub}</span>
                  <h3 className="z-pill-card-title">{p.label}</h3>
                  <p className="z-pill-card-desc">{p.desc}</p>
                </div>
                <div className="z-pill-card-cta">
                  <span>{t.pills.cta}</span>
                  <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="7" y1="17" x2="17" y2="7"></line>
                    <polyline points="7 7 17 7 17 17"></polyline>
                  </svg>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
