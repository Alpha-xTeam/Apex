import React from 'react';
import { navigateTo } from '../App';

export const Goal: React.FC = () => {
  return (
    <section id="work" className="z-section z-goal">
      <div className="z-goal-inner">
        <div className="z-goal-card">
          <div className="z-goal-card-head" data-reveal>
            <div className="z-tag-row">
              <span className="z-tag">أعمالنا</span>
            </div>
            <h2 className="z-goal-title">
              استكشف أبرز التحديات الواقعية التي صممناها لمتدربينا.
            </h2>
            <p className="z-goal-desc">
              حالات حقيقية من سوق العمل، أُعيد بناؤها داخل المنصة بأدوات واقعية وقياسات احترافية.
            </p>
          </div>

          <div className="z-cases-grid">
            <article className="z-case-card z-case-dark" data-reveal data-reveal-delay="100">
              <div className="z-case-head">
                <span className="z-case-team">RED</span>
                <span className="z-case-id">#001</span>
              </div>
              <h3 className="z-case-title">اختراق خادم شركة اتصالات</h3>
              <p className="z-case-desc">
                سيناريو هجوم متعدد المراحل على بنية تحتية حرجة، مع تمويه وتلميحات لفريق دفاع متاح للاختبار.
              </p>
              <div className="z-case-meta">
                <span>١٢ تحدياً</span>
                <span>•</span>
                <span>متوسط +</span>
              </div>
              <a
                href="/auth"
                onClick={(e) => { e.preventDefault(); navigateTo('auth'); }}
                className="z-case-cta"
              >
                <span>ابدأ السيناريو</span>
                <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="7" y1="17" x2="17" y2="7"></line>
                  <polyline points="7 7 17 7 17 17"></polyline>
                </svg>
              </a>
            </article>

            <article className="z-case-card z-case-light" data-reveal data-reveal-delay="220">
              <div className="z-case-head">
                <span className="z-case-team z-case-team-blue">BLUE</span>
                <span className="z-case-id">#002</span>
              </div>
              <h3 className="z-case-title">احتواء هجوم فدية على مستشفى</h3>
              <p className="z-case-desc">
                دفاع في الوقت الفعلي ضد Ransomware، مع تواصل مع فرق طبية افتراضية وضغوط إنقاذ أرواح حقيقية.
              </p>
              <div className="z-case-meta">
                <span>١٥ تحدياً</span>
                <span>•</span>
                <span>متقدم</span>
              </div>
              <a
                href="/auth"
                onClick={(e) => { e.preventDefault(); navigateTo('auth'); }}
                className="z-case-cta"
              >
                <span>ابدأ السيناريو</span>
                <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="7" y1="17" x2="17" y2="7"></line>
                  <polyline points="7 7 17 7 17 17"></polyline>
                </svg>
              </a>
            </article>

            <article className="z-case-card z-case-light" data-reveal data-reveal-delay="340">
              <div className="z-case-head">
                <span className="z-case-team z-case-team-blue">BLUE</span>
                <span className="z-case-id">#003</span>
              </div>
              <h3 className="z-case-title">تحقيق اختراق منصة بنكية</h3>
              <p className="z-case-desc">
                تحقيق رقمي جنائي (DFIR) على اختراق حقيقي لأنظمة بنكية، مع روابط وبيانات ملوثة للتتبع.
              </p>
              <div className="z-case-meta">
                <span>١٠ تحديات</span>
                <span>•</span>
                <span>متوسط</span>
              </div>
              <a
                href="/auth"
                onClick={(e) => { e.preventDefault(); navigateTo('auth'); }}
                className="z-case-cta"
              >
                <span>ابدأ السيناريو</span>
                <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="7" y1="17" x2="17" y2="7"></line>
                  <polyline points="7 7 17 7 17 17"></polyline>
                </svg>
              </a>
            </article>
          </div>
        </div>
      </div>
    </section>
  );
};
