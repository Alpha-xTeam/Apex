import React, { useState, useEffect } from 'react';
import { Lock, ChevronLeft, Loader2, ArrowRight } from 'lucide-react';
import { PathIcon } from './TeamIcons';

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

  const itemsToRender = dbChallenges.length > 0
    ? dbChallenges.map(c => ({
        id: c.id,
        moduleId: c.module,
        title: c.title,
        desc: `تحدي ${c.module} • مستوى ${c.difficulty} • جائزة ${c.xpReward} XP`,
        difficulty: c.difficulty,
        xp: c.xpReward,
      }))
    : path.modules.map(m => ({
        id: m.id,
        moduleId: m.id,
        title: m.title,
        desc: m.desc,
        difficulty: 'متوسط',
        xp: 100,
      }));

  const totalXp = itemsToRender.reduce((sum, it) => sum + (it.xp || 0), 0);
  const accent = teamRole === 'blue' ? '#3b82f6' : '#ef4444';
  const accentSoft = teamRole === 'blue' ? 'rgba(59, 130, 246, 0.08)' : 'rgba(239, 68, 68, 0.08)';
  const teamLabel = teamRole === 'blue' ? 'الفريق الأزرق' : 'الفريق الأحمر';
  const teamSubtitle = teamRole === 'blue' ? 'مسار المدافع' : 'مسار المهاجم';

  return (
    <div className="dash-page" style={{ '--accent': accent, '--accent-soft': accentSoft } as React.CSSProperties}>
      <header className="dash-header">
        <div className="dash-header-inner">
          <a href="/" className="dash-logo">CyberArena</a>
          <button onClick={onBack} className="path-back-link">
            <ArrowRight size={14} />
            <span>العودة للرئيسية</span>
          </button>
        </div>
      </header>

      <main className="dash-main">
        <div className="dash-container">
          <section className="path-hero">
            <div className="path-hero-icon">
              <PathIcon size={64} />
            </div>
            <div className="path-hero-content">
              <span className="path-hero-team-badge" style={{ color: accent, background: accentSoft, borderColor: accentSoft }}>
                {teamLabel} • {teamSubtitle}
              </span>
              <h1>{path.title}</h1>
              <p>{path.desc}</p>
              <div className="path-hero-stats">
                <div className="path-hero-stat">
                  <span className="path-hero-stat-value">{itemsToRender.length}</span>
                  <span className="path-hero-stat-label">تحدي متاح</span>
                </div>
                <div className="path-hero-stat">
                  <span className="path-hero-stat-value">{totalXp.toLocaleString()}</span>
                  <span className="path-hero-stat-label">XP إجمالية</span>
                </div>
              </div>
            </div>
          </section>

          <section className="path-timeline">
            {loading ? (
              <div className="path-loading">
                <Loader2 size={20} className="animate-spin" />
                <span>جاري تحميل التحديات...</span>
              </div>
            ) : (
              itemsToRender.map((item, index) => (
                <div
                  key={item.id}
                  className="path-step"
                  style={{ '--accent': accent, '--accent-soft': accentSoft } as React.CSSProperties}
                >
                  <div className="path-step-line">
                    <div className="path-step-dot">{index + 1}</div>
                    {index < itemsToRender.length - 1 && <div className="path-step-connector" />}
                  </div>
                  <button
                    className="path-step-card"
                    onClick={() => onSelectModule(item.moduleId, item.title, item.id)}
                  >
                    <div className="path-step-icon">
                      <Lock size={18} />
                    </div>
                    <div className="path-step-body">
                      <h3>{item.title}</h3>
                      <p>{item.desc}</p>
                    </div>
                    <div className="path-step-action">
                      <span className="path-step-cta">ابدأ التحدي</span>
                      <ChevronLeft size={16} />
                    </div>
                  </button>
                </div>
              ))
            )}
          </section>
        </div>
      </main>
    </div>
  );
};
