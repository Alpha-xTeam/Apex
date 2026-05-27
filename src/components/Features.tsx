import React from 'react';

export const Features: React.FC = () => {
  return (
    <section id="features" className="section-padding features-section">
      <div className="section-header">
        <h2 className="section-title">المميزات الاستثنائية</h2>
        <p className="section-tagline">أدوات مصممة لتمكينك من قيادة المشهد التقني بالكامل</p>
      </div>

      <div className="features-grid">
        <div className="feature-card">
          <div className="feature-icon">
            <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
              <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
              <line x1="12" y1="22.08" x2="12" y2="12"></line>
            </svg>
          </div>
          <h3 className="feature-title">بيئات محاكاة رملية (Sandbox)</h3>
          <p className="feature-desc">تفاعل مع واجهات برمجية حقيقية، خوادم افتراضية، وأكواد برمجية فعلية داخل نظام آمن بالكامل.</p>
        </div>

        <div className="feature-card">
          <div className="feature-icon">
            <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none">
              <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
              <polyline points="2 17 12 22 22 17"></polyline>
              <polyline points="2 12 12 17 22 12"></polyline>
            </svg>
          </div>
          <h3 className="feature-title">توليد ديناميكي مستمر</h3>
          <p className="feature-desc">الذكاء الاصطناعي لا يكرر السيناريو مرتين. يتم ضبط التحديات تلقائياً بناءً على مستوى مهاراتك وسرعة تقدمك.</p>
        </div>

        <div className="feature-card">
          <div className="feature-icon">
            <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none">
              <line x1="18" y1="20" x2="18" y2="10"></line>
              <line x1="12" y1="20" x2="12" y2="4"></line>
              <line x1="6" y1="20" x2="6" y2="14"></line>
            </svg>
          </div>
          <h3 className="feature-title">تحليلات القرارات العميقة</h3>
          <p className="feature-desc">تقارير بيانية تفصيلية تقيس سرعة ردود أفعالك، دقة خياراتك التقنية، وهدوء تفكيرك أثناء إدارة الضغوط.</p>
        </div>

        <div className="feature-card">
          <div className="feature-icon">
            <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
          </div>
          <h3 className="feature-title">تنسيق وتواصل افتراضي</h3>
          <p className="feature-desc">تفاعل مع أعضاء الفريق والمستثمرين والعملاء الافتراضيين الذين يتم تشغيلهم بالذكاء الاصطناعي لمحاكاة اتصالات العمل.</p>
        </div>
      </div>
    </section>
  );
};
