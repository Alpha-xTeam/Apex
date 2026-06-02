import React, { useState } from 'react';

const PILLS = [
  { id: 'defend',  label: 'نحمي',  desc: 'فرق دفاعية',   sub: 'Blue Team'  },
  { id: 'attack',  label: 'نختبر',  desc: 'فرق هجومية',   sub: 'Red Team'   },
  { id: 'analyze', label: 'نحلل',  desc: 'محققون رقميون', sub: 'DFIR'      },
  { id: 'build',   label: 'نبني',  desc: 'مهندسو أمن',    sub: 'AppSec'    },
  { id: 'train',   label: 'نُمكّن', desc: 'خبراء محترفون', sub: 'Leader'    },
];

export const Pills: React.FC = () => {
  const [active, setActive] = useState('train');
  return (
    <section className="z-section z-pills">
      <div className="z-pills-inner">
        <div className="z-pills-pill-list">
          {PILLS.map((p) => (
            <button
              key={p.id}
              onClick={() => setActive(p.id)}
              className={`z-pill ${active === p.id ? 'active' : ''}`}
            >
              <span className="z-pill-num">{p.sub}</span>
              <span className="z-pill-label">{p.label}</span>
            </button>
          ))}
        </div>
        <div className="z-pills-content">
          {PILLS.filter((p) => p.id === active).map((p) => (
            <div key={p.id} className="z-pill-card">
              <div className="z-pill-card-head">
                <span className="z-pill-card-sub">{p.sub}</span>
                <h3 className="z-pill-card-title">{p.label}</h3>
                <p className="z-pill-card-desc">{p.desc}</p>
              </div>
              <div className="z-pill-card-cta">
                <span>استكشف المسار</span>
                <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="7" y1="17" x2="17" y2="7"></line>
                  <polyline points="7 7 17 7 17 17"></polyline>
                </svg>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
