import React from 'react';
import { ScrollVideo } from './ScrollVideo';

export const Hero: React.FC = () => {
  return (
    <section className="hero-section">
      {/* 
        The background animation is now strictly embedded inside the Hero section 
        and will scroll away naturally when scrolling down to other sections!
      */}
      <ScrollVideo />
      
      {/* Smooth gradient overlay to blend the background and maximize text contrast */}
      <div className="hero-bg-overlay" />

      {/* Pinned text inside a gorgeous premium readability container */}
      <div className="hero-content">
        <h1 className="hero-title">
          سيناريوهات ذكية<br />
          تصنع واقعك المهني.
        </h1>
        <p className="hero-subtitle">
          منصة CyberArena تدربك داخل بيئات محاكاة تكنولوجية متكاملة يولدها الذكاء الاصطناعي لمواجهة تحديات العمل الحقيقية واكتساب الخبرة العملية الفورية.
        </p>
        <div className="hero-cta-wrapper">
          <a href="#try-sim" className="btn btn-primary btn-cta">
            جرب المحاكاة الآن
            <span className="arrow">
              <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
                <line x1="7" y1="17" x2="17" y2="7"></line>
                <polyline points="7 7 17 7 17 17"></polyline>
              </svg>
            </span>
          </a>
        </div>
      </div>
    </section>
  );
};
