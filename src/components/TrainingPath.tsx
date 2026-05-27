import React from 'react';

interface Module {
  id: string;
  title: string;
  desc: string;
}

interface PathData {
  id: string;
  title: string;
  desc: string;
  modules: Module[];
}

const PATHS: Record<string, Record<string, PathData>> = {
  cybersecurity: {
    'web-security': {
      id: 'web-security', title: 'أمن تطبيقات الويب', desc: 'اكتشف وأصلح الثغرات في تطبيقات الويب',
      modules: [
        { id: 'xss', title: 'XSS - هجمات الحقن البرمجي', desc: 'تعلم كيف تهاجم وتدافع ضد Cross-Site Scripting' },
        { id: 'sql-injection', title: 'SQL Injection - حقن قواعد البيانات', desc: 'اختراق قواعد البيانات عبر الاستعلامات الخبيثة' },
        { id: 'csrf', title: 'CSRF - تزوير الطلبات', desc: 'احمِ تطبيقاتك من هجمات التزوير عبر المواقع' },
        { id: 'auth-bypass', title: 'ثغرات المصادقة', desc: 'اختبر وتجاوز أنظمة تسجيل الدخول الضعيفة' },
        { id: 'misconfig', title: 'التكوين الأمني الخاطئ', desc: 'اكتشف الثغرات الناتجة عن الإعدادات غير الآمنة' },
      ],
    },
    'network-security': {
      id: 'network-security', title: 'أمن الشبكات', desc: 'تحليل وحماية البنية التحتية للشبكات',
      modules: [
        { id: 'packet-analysis', title: 'تحليل الحزم', desc: 'اقرأ و حلل حركة المرور على الشبكة' },
        { id: 'firewall', title: 'جدران الحماية', desc: 'ابنِ وأعد تكوين جدران الحماية' },
        { id: 'scanning', title: 'مسح الشبكات', desc: 'استخدم أدوات المسح لاكتشاف الثغرات' },
      ],
    },
    cryptography: {
      id: 'cryptography', title: 'التشفير', desc: 'فك شفرات وابنِ أنظمة تشفير قوية',
      modules: [
        { id: 'encryption-basics', title: 'أساسيات التشفير', desc: 'افهم كيف تعمل خوارزميات التشفير' },
        { id: 'hash-cracking', title: 'كسر الهاش', desc: 'تعلم تقنيات كسر كلمات المرور المشفرة' },
      ],
    },
    'incident-response': {
      id: 'incident-response', title: 'الاستجابة للحوادث', desc: 'تعامل مع الاختراقات والهجمات الإلكترونية',
      modules: [
        { id: 'log-analysis', title: 'تحليل السجلات', desc: 'اقرأ سجلات الخادم لاكتشاف الاختراق' },
        { id: 'forensics', title: 'الأدلة الرقمية', desc: 'اجمع وحلل الأدلة بعد الاختراق' },
      ],
    },
  },
};

interface TrainingPathProps {
  categoryId: string;
  pathId: string;
  onSelectModule: (moduleId: string, moduleTitle: string) => void;
  onBack: () => void;
}

export const TrainingPath: React.FC<TrainingPathProps> = ({ categoryId, pathId, onSelectModule, onBack }) => {
  const path = PATHS[categoryId]?.[pathId];
  if (!path) return null;

  return (
    <div className="dash-page">
      <header className="dash-header">
        <a href="/" className="dash-logo">APEX<sup>®</sup></a>
        <div className="dash-header-right">
          <button onClick={onBack} className="path-back-link">← العودة للرئيسية</button>
        </div>
      </header>

      <main className="dash-main">
        <div className="path-hero">
          <h1>{path.title}</h1>
          <p>{path.desc}</p>
        </div>

        <div className="path-timeline">
          {path.modules.map((mod, index) => (
            <div key={mod.id} className="path-step">
              <div className="path-step-line">
                <div className="path-step-dot">{index + 1}</div>
                {index < path.modules.length - 1 && <div className="path-step-connector" />}
              </div>
              <button className="path-step-card" onClick={() => onSelectModule(mod.id, mod.title)}>
                <div className="path-step-content">
                  <h3>{mod.title}</h3>
                  <p>{mod.desc}</p>
                </div>
                <span className="path-step-start">ابدأ التحدي ←</span>
              </button>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
};
