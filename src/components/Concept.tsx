import React from 'react';

export const Concept: React.FC = () => {
  return (
    <section id="concept" className="section-padding concept-section">
      <div className="section-header">
        <h2 className="section-title">الفكرة الرائدة</h2>
        <p className="section-tagline">كيف نعيد ابتكار التدريب المهني في قطاع التكنولوجيا؟</p>
      </div>

      <div className="concept-grid">
        <div className="concept-card">
          <div className="concept-step">٠١</div>
          <h3 className="card-title">توليد أزمة فورية</h3>
          <p className="card-desc">
            يقوم الذكاء الاصطناعي بتوليد سيناريو معقد وواقعي يحاكي بيئات العمل التكنولوجية، مثل سقوط خادم مفاجئ أو اكتشاف ثغرة أمنية حرجة.
          </p>
        </div>

        <div className="concept-card highlight-card">
          <div className="concept-step">٠٢</div>
          <h3 className="card-title">الغمر في الحدث</h3>
          <p className="card-desc">
            يتم وضعك كمسؤول مباشر في قلب الأزمة. تتلقى إشعارات مستمرة، تواصل مباشر مع الفرق الافتراضية، ومطالبات لحل المشكلة تحت ضغط زمني حقيقي.
          </p>
        </div>

        <div className="concept-card">
          <div className="concept-step">٠٣</div>
          <h3 className="card-title">التقييم واتخاذ القرار</h3>
          <p className="card-desc">
            تقوم باتخاذ الإجراءات الفنية الفعلية لحل الموقف. يقوم النظام بتحليل خياراتك وتقديم تقييم فوري يكشف مهاراتك القيادية والتقنية.
          </p>
        </div>
      </div>
    </section>
  );
};
