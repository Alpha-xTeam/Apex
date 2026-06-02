import React from 'react';
import { navigateTo } from '../App';

const STEPS = [
  {
    number: '01',
    title: 'تولّد الذكاء الاصطناعي سيناريو',
    desc: 'ينشئ محرك المحاكاة تحدياً أمنياً واقعياً — اختراق خادم، ثغرة صفر-يوم، أو هجوم تصيّد على نطاق واسع — مُفصّلاً بأدوات حقيقية.',
    tag: 'التحليل',
  },
  {
    number: '02',
    title: 'تُغمر في قلب الأزمة',
    desc: 'تصبح المسؤول الأول. تتراكم الإشعارات، تتصل فرق افتراضية، ويُفرض عليك ضغط زمني حقيقي لاتخاذ القرار.',
    tag: 'الغمر',
  },
  {
    number: '03',
    title: 'تُقيَّم قراراتك بشكل فوري',
    desc: 'يحلل نظامنا خياراتك، يقيس سرعتك ودقتك، ويقدم تقريراً معمّقاً يكشف نقاط القوة والضعف في تفكيرك الأمني.',
    tag: 'التقييم',
  },
];

export const Concept: React.FC = () => {
  return (
    <section id="services" className="z-section z-concept">
      <div className="z-concept-inner">
        <div className="z-concept-header" data-reveal>
          <span className="z-tag">الفكرة الرائدة</span>
          <h2 className="z-concept-title">
            كيف نُعيد ابتكار التدريب المهني في الأمن السيبراني.
          </h2>
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
              <a
                href="/auth"
                onClick={(e) => { e.preventDefault(); navigateTo('auth'); }}
                className="z-step-cta"
              >
                <span>اعرف المزيد</span>
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
