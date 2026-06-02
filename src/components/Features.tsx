import React from 'react';

const FEATURES = [
  {
    title: 'بيئات محاكاة رملية',
    desc: 'تفاعل مع واجهات برمجية حقيقية، خوادم افتراضية، وأدوات اختبار اختراق داخل نظام آمن بالكامل.',
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
        <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
        <line x1="12" y1="22.08" x2="12" y2="12"></line>
      </svg>
    ),
  },
  {
    title: 'توليد ديناميكي مستمر',
    desc: 'الذكاء الاصطناعي لا يكرر السيناريو مرتين. يتم ضبط التحديات تلقائياً بناءً على مستوى مهاراتك وسرعة تقدمك.',
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
        <polyline points="2 17 12 22 22 17"></polyline>
        <polyline points="2 12 12 17 22 12"></polyline>
      </svg>
    ),
  },
  {
    title: 'تحليلات القرارات العميقة',
    desc: 'تقارير بيانية تفصيلية تقيس سرعة ردود أفعالك، دقة خياراتك التقنية، وهدوء تفكيرك أثناء إدارة الضغوط.',
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10"></line>
        <line x1="12" y1="20" x2="12" y2="4"></line>
        <line x1="6" y1="20" x2="6" y2="14"></line>
      </svg>
    ),
  },
  {
    title: 'فرق افتراضية تفاعلية',
    desc: 'تواصل مع زملاء ومستثمرين ومديرين افتراضيين يعملون بالذكاء الاصطناعي لمحاكاة اتصالات العمل الحرجة.',
    icon: (
      <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
        <circle cx="9" cy="7" r="4"></circle>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
        <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
      </svg>
    ),
  },
];

export const Features: React.FC = () => {
  return (
    <section id="features" className="z-section z-features">
      <div className="z-features-inner">
        <div className="z-features-head" data-reveal>
          <span className="z-tag">المميزات</span>
          <h2 className="z-features-title">
            أدوات مصممة لتمكينك من قيادة المشهد الأمني بالكامل.
          </h2>
        </div>

        <div className="z-features-grid">
          {FEATURES.map((f, i) => (
            <article key={i} className="z-feat-card" data-reveal data-reveal-delay={String(100 + i * 100)}>
              <div className="z-feat-icon">{f.icon}</div>
              <h3 className="z-feat-title">{f.title}</h3>
              <p className="z-feat-desc">{f.desc}</p>
              <div className="z-feat-arrow">
                <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="7" y1="17" x2="17" y2="7"></line>
                  <polyline points="7 7 17 7 17 17"></polyline>
                </svg>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};
