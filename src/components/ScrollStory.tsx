import React, { useRef, useEffect, useState } from 'react';

const STAGES = [
  {
    number: '٠١',
    title: 'التحدي',
    desc: 'تواجه سيناريو تقني غير متوقع — خادم ينهار، ثغرة أمنية، أو نظام يتعطل في أكثر اللحظات حرجاً.',
    icon: '⬡',
  },
  {
    number: '٠٢',
    title: 'الغمر',
    desc: 'تُغمر في قلب الحدث. اتصالات وهمية، ضغط زمني حقيقي، وقرارات مصيرية تتطلب تدخلك الفوري.',
    icon: '⟡',
  },
  {
    number: '٠٣',
    title: 'التكيف',
    desc: 'تتعلم قراءة الموقف بسرعة، تعيد ترتيب أولوياتك، وتتكيف مع المتغيرات لحظة بلحظة.',
    icon: '⟠',
  },
  {
    number: '٠٤',
    title: 'التمكن',
    desc: 'تخرج من المحاكاة أقوى. قراراتك تحللت، مهاراتك قيست، وأنت الآن جاهز لسوق العمل الحقيقي.',
    icon: '◆',
  },
];

export const ScrollStory: React.FC = () => {
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

  const currentIndex = Math.min(
    STAGES.length - 1,
    Math.floor(progress * STAGES.length)
  );

  const stage = STAGES[currentIndex];

  return (
    <section ref={sectionRef} className="scroll-story-section">
      <div className="scroll-story-sticky">
        <div className="scroll-story-bg" />
        <div className="scroll-story-pattern" />

        <div className="scroll-story-label">
          <span className="scroll-story-label-line" />
          <span>رحلة التطور</span>
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
            <div
              key={i}
              className={`scroll-story-dot ${i === currentIndex ? 'active' : ''} ${i < currentIndex ? 'done' : ''}`}
            />
          ))}
        </div>

        <div className="scroll-story-progress">
          <div
            className="scroll-story-progress-bar"
            ref={progressRef}
          />
        </div>
      </div>
    </section>
  );
};
