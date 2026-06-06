import React, { useRef, useEffect, useState } from 'react';
import { useI18n } from '../i18n/I18nContext';

const ICONS = ['⬡', '⟡', '⟠', '◆'];

export const ScrollStory: React.FC = () => {
  const { t } = useI18n();
  const STAGES = t.scrollStory.stages.map((s, i) => ({ ...s, number: `0${i + 1}`, icon: ICONS[i] }));
  const sectionRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const progressRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (progressRef.current) {
      progressRef.current.style.width = `${progress * 100}%`;
    }
  }, [progress]);

  useEffect(() => {
    const handleScroll = () => {
      if (!sectionRef.current) return;
      const rect = sectionRef.current.getBoundingClientRect();
      const sectionHeight = sectionRef.current.offsetHeight;
      const windowHeight = window.innerHeight;
      const scrollable = sectionHeight - windowHeight;
      if (scrollable <= 0) return;
      const scrolled = -rect.top;
      const p = Math.min(1, Math.max(0, scrolled / scrollable));
      setProgress(p);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const currentIndex = Math.min(STAGES.length - 1, Math.floor(progress * STAGES.length));
  const stage = STAGES[currentIndex];

  return (
    <section ref={sectionRef} className="scroll-story-section">
      <div className="scroll-story-sticky">
        <div className="scroll-story-bg" />
        <div className="scroll-story-pattern" />

        <div className="scroll-story-label">
          <span className="scroll-story-label-line" />
          <span>{t.scrollStory.label}</span>
          <span className="scroll-story-label-line" />
        </div>

        <div className="scroll-story-stages">
          <div className="scroll-story-stage" key={currentIndex}>
            <span className="stage-icon">{stage.icon}</span>
            <span className="stage-number">{stage.number}</span>
            <h3 className="stage-title">{stage.title}</h3>
            <p className="stage-desc">{stage.desc}</p>
          </div>
        </div>

        <div className="scroll-story-dots">
          {STAGES.map((_, i) => (
            <div key={i} className={`scroll-story-dot ${i === currentIndex ? 'active' : ''} ${i < currentIndex ? 'done' : ''}`} />
          ))}
        </div>

        <div className="scroll-story-progress">
          <div className="scroll-story-progress-bar" ref={progressRef} />
        </div>
      </div>
    </section>
  );
};
