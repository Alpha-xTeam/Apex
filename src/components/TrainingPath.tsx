import React, { useState, useEffect } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';

interface Module {
  id: string;
  title: string;
  desc: string;
}

interface DBChallenge {
  id: string;
  title: string;
  module: string;
  category: string;
  path: string;
  difficulty: string;
  xpReward: number;
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
  teamRole?: 'red' | 'blue';
  onSelectModule: (moduleId: string, moduleTitle: string, challengeId?: string) => void;
  onBack: () => void;
}

export const TrainingPath: React.FC<TrainingPathProps> = ({ categoryId, pathId, teamRole = 'blue', onSelectModule, onBack }) => {
  const path = PATHS[categoryId]?.[pathId];
  
  const [dbChallenges, setDbChallenges] = useState<DBChallenge[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchChallenges = async () => {
      try {
        const res = await fetch(`${API_URL}/training/list?team_role=${teamRole}&limit=2000`);
        const data = await res.json();
        if (data.challenges) {
          // Filter challenges belonging only to the current path
          const filtered = data.challenges.filter((c: DBChallenge) => c.path === pathId);
          setDbChallenges(filtered);
        }
      } catch (err) {
        console.error('Failed to fetch challenges:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchChallenges();
  }, [teamRole, pathId]);

  if (!path) return null;

  // Use DB challenges if they exist, otherwise fallback to static modules
  const itemsToRender = dbChallenges.length > 0 
    ? dbChallenges.map(c => ({
        id: c.id,
        moduleId: c.module,
        title: c.title,
        desc: `تحدي حول ${c.module} - مستوى: ${c.difficulty} - جائزة: ${c.xpReward} XP`,
      }))
    : path.modules.map(m => ({
        id: m.id,
        moduleId: m.id, // For static modules, id is moduleId
        title: m.title,
        desc: m.desc,
      }));

  return (
    <div className="dash-page">
      <header className="dash-header">
        <a href="/" className="dash-logo">CyberArena</a>
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
          {loading ? (
            <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.6)', padding: '40px' }}>جاري تحميل التحديات...</div>
          ) : (
            itemsToRender.map((item, index) => (
              <div key={item.id} className="path-step">
                <div className="path-step-line">
                  <div className="path-step-dot">{index + 1}</div>
                  {index < itemsToRender.length - 1 && <div className="path-step-connector" />}
                </div>
                <button className="path-step-card" onClick={() => onSelectModule(item.moduleId, item.title, item.id)}>
                  <div className="path-step-content">
                    <h3>{item.title}</h3>
                    <p>{item.desc}</p>
                  </div>
                  <span className="path-step-start">ابدأ التحدي ←</span>
                </button>
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
};
