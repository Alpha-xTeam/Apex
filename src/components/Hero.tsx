import React, { useState } from 'react';
import { navigateTo } from '../App';
import { ShieldMark } from './ShieldMark';

export const Hero: React.FC = () => {
  const [now] = useState(() => {
    const d = new Date();
    const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    const day = d.getDate();
    const month = d.toLocaleString('en-US', { month: 'long' });
    return `${time} — ${day} ${month}, ${d.getFullYear()}`;
  });

  return (
    <section className="z-hero">
      {/* Top row: tag (left) + status (right) */}
      <div className="z-hero-top">
        <div className="z-hero-tag">
          <span>◆</span>
          <span>منصة تدريب الأمن السيبراني</span>
        </div>
        <div className="z-hero-status">
          <span className="z-status-dot" />
          <span>متاح الآن</span>
          <span className="z-status-sep">•</span>
          <span>{now}</span>
        </div>
      </div>

      {/* Main stage: text on left + shield visual centered + side card on right */}
      <div className="z-hero-stage">
        {/* Central cybersecurity visual */}
        <div className="z-hero-visual" aria-hidden="true">
          <ShieldMark size="xxl" />
        </div>

        {/* Text content — on the left, extends behind the shield */}
        <div className="z-hero-content">
          <h1 className="z-hero-title">
            <span className="z-title-line">نبدأ من الصفر،</span>
            <span className="z-title-line z-title-stroke">لنصنع خبراء</span>
            <span className="z-title-line z-title-accent">الأمن السيبراني.</span>
          </h1>

          <div className="z-hero-rating">
            <div className="z-stars">
              {[1, 2, 3, 4, 5].map((i) => (
                <svg key={i} viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
              ))}
            </div>
            <span className="z-rating-text">+٣٠٠٠ متدرب يثق بنا</span>
          </div>

          <div className="z-hero-ctas">
            <button onClick={() => navigateTo('auth')} className="z-btn z-btn-dark">
              <span>ابدأ التدريب المجاني</span>
              <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
                <line x1="7" y1="17" x2="17" y2="7"></line>
                <polyline points="7 7 17 7 17 17"></polyline>
              </svg>
            </button>
            <button onClick={() => navigateTo('auth')} className="z-btn z-btn-light">استكشف التحديات</button>
          </div>
        </div>

        {/* Floating side card (top right) */}
        <div className="z-float-card">
          <div className="z-float-card-head">
            <div className="z-float-avatar">
              <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <div>
              <div className="z-float-title">تدرّب لحماية البنية التحتية</div>
              <div className="z-float-sub">سيناريو مباشر • محاكاة كاملة</div>
            </div>
          </div>
          <div className="z-float-wave">
            <span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span />
          </div>
          <div className="z-float-meta">
            <span>00:00</span>
            <span>ساري الآن</span>
          </div>
        </div>
      </div>

      {/* Giant brand text overlay */}
      <div className="z-hero-giant" aria-hidden="true">
        CYBERARENA
      </div>

      {/* Bottom bar */}
      <div className="z-hero-bottom">
        <div className="z-bottom-item">
          <span className="z-bottom-label">+٥</span>
          <span>سنوات خبرة</span>
        </div>
        <div className="z-bottom-item">
          <span className="z-bottom-label">بابل</span>
          <span>العراق</span>
        </div>
        <a href="#about" className="z-bottom-item z-bottom-cta">
          <span>مرر للأسفل</span>
          <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <polyline points="19 12 12 19 5 12"></polyline>
          </svg>
        </a>
      </div>
    </section>
  );
};
