import React from 'react';

export const Goal: React.FC = () => {
  return (
    <section id="goal" className="section-padding goal-section">
      <div className="goal-container">
        <div className="goal-tag">رسالتنا وهدفنا</div>
        <h2 className="goal-title">
          سد الفجوة الكبرى بين المعرفة النظرية والخبرة الميدانية الصادمة.
        </h2>
        <p className="goal-desc">
          في CyberArena، نؤمن بأن قراءة الكتب وحفظ الأكواد لا يصنع قادة تكنولوجيا حقيقيين. القادة يصنعون في قلب الموقف وفي بيئات الأزمات الحقيقية.
        </p>
        <p className="goal-subdesc">
          هدفنا هو خلق جيل تكنولوجي صلب وواثق، عبر تمكينهم من ارتكاب الأخطاء الفادحة والتعلم منها داخل نظام محاكاة آمن ومدعوم بالذكاء الاصطناعي، ليدخلوا سوق العمل كخبراء متمرسين واجهوا وحلوا أصعب العقبات مسبقاً.
        </p>
        
        <div className="goal-stats">
          <div className="stat-item">
            <span className="stat-number">٩٥٪</span>
            <span className="stat-label">تحسن في سرعة اتخاذ القرار</span>
          </div>
          <div className="stat-item">
            <span className="stat-number">+٢٠</span>
            <span className="stat-label">بيئة محاكاة تكنولوجية متكاملة</span>
          </div>
          <div className="stat-item">
            <span className="stat-number">٠٪</span>
            <span className="stat-label">مخاطر الخسائر البرمجية الحقيقية</span>
          </div>
        </div>
      </div>
    </section>
  );
};
