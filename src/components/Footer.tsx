import React from 'react';

export const Footer: React.FC = () => {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-grid">
          <div className="footer-brand">
            <a href="/" className="footer-logo">CyberArena</a>
            <p className="footer-desc">
              منصة التدريب التكنولوجي عبر محاكاة الذكاء الاصطناعي. نعدّك لسوق العمل قبل أن تخطو إليه.
            </p>
          </div>

          <div className="footer-links">
            <h4 className="footer-heading">الأقسام</h4>
            <a href="#concept">الفكرة</a>
            <a href="#features">المميزات</a>
            <a href="#goal">الهدف</a>
          </div>

          <div className="footer-links">
            <h4 className="footer-heading">التواصل</h4>
            <a href="mailto:hello@cyberarena.com">hello@cyberarena.com</a>
            <a href="#">دعم فني</a>
            <a href="#">الشراكات</a>
          </div>

          <div className="footer-links">
            <h4 className="footer-heading">قانوني</h4>
            <a href="#">سياسة الخصوصية</a>
            <a href="#">شروط الاستخدام</a>
          </div>
        </div>

        <div className="footer-bottom">
          <p>© {new Date().getFullYear()} CyberArena. جميع الحقوق محفوظة.</p>
        </div>
      </div>
    </footer>
  );
};
