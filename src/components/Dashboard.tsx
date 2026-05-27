import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  Globe, 
  Network, 
  Lock, 
  AlertTriangle, 
  Zap, 
  GraduationCap, 
  Lightbulb, 
  ArrowLeft 
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';

const CATEGORIES = [
  {
    id: 'cybersecurity',
    title: 'الأمن السيبراني',
    desc: 'احمِ الأنظمة والشبكات من الهجمات الرقمية',
    gradient: 'linear-gradient(135deg, #0f0c29, #302b63, #24243e)',
    accent: '#00d4aa',
    icon: <Shield size={24} />,
    paths: [
      {
        id: 'web-security',
        title: 'أمن تطبيقات الويب',
        desc: 'اكتشف وأصلح الثغرات في تطبيقات الويب',
        icon: <Globe size={22} />,
        modules: [
          { id: 'xss', title: 'XSS - هجمات الحقن البرمجي', desc: 'تعلم كيف تهاجم وتدافع ضد Cross-Site Scripting' },
          { id: 'sql-injection', title: 'SQL Injection - حقن قواعد البيانات', desc: 'اختراق قواعد البيانات عبر الاستعلامات الخبيثة' },
          { id: 'csrf', title: 'CSRF - تزوير الطلبات', desc: 'احمِ تطبيقاتك من هجمات التزوير عبر المواقع' },
          { id: 'auth-bypass', title: 'ثغرات المصادقة', desc: 'اختبر وتجاوز أنظمة تسجيل الدخول الضعيفة' },
          { id: 'misconfig', title: 'التكوين الأمني الخاطئ', desc: 'اكتشف الثغرات الناتجة عن الإعدادات غير الآمنة' },
        ],
      },
      {
        id: 'network-security',
        title: 'أمن الشبكات',
        desc: 'تحليل وحماية البنية التحتية للشبكات',
        icon: <Network size={22} />,
        modules: [
          { id: 'packet-analysis', title: 'تحليل الحزم', desc: 'اقرأ و حلل حركة المرور على الشبكة' },
          { id: 'firewall', title: 'جدران الحماية', desc: 'ابنِ وأعد تكوين جدران الحماية' },
          { id: 'scanning', title: 'مسح الشبكات', desc: 'استخدم أدوات المسح لاكتشاف الثغرات' },
        ],
      },
      {
        id: 'cryptography',
        title: 'التشفير',
        desc: 'فك شفرات وابنِ أنظمة تشفير قوية',
        icon: <Lock size={22} />,
        modules: [
          { id: 'encryption-basics', title: 'أساسيات التشفير', desc: 'افهم كيف تعمل خوارزميات التشفير' },
          { id: 'hash-cracking', title: 'كسر الهاش', desc: 'تعلم تقنيات كسر كلمات المرور المشفرة' },
        ],
      },
      {
        id: 'incident-response',
        title: 'الاستجابة للحوادث',
        desc: 'تعامل مع الاختراقات والهجمات الإلكترونية',
        icon: <AlertTriangle size={22} />,
        modules: [
          { id: 'log-analysis', title: 'تحليل السجلات', desc: 'اقرأ سجلات الخادم لاكتشاف الاختراق' },
          { id: 'forensics', title: 'الأدلة الرقمية', desc: 'اجمع وحلل الأدلة بعد الاختراق' },
        ],
      },
    ],
  },
];

const LEVELS = [
  { name: 'مبتدئ', minXp: 0, color: '#00d4aa' },
  { name: 'متقدم', minXp: 200, color: '#ffc107' },
  { name: 'خبير', minXp: 600, color: '#ff5555' },
  { name: 'سايبر ماستر', minXp: 1500, color: '#a855f7' },
];

function getLevel(xp: number) {
  let level = LEVELS[0];
  for (const l of LEVELS) {
    if (xp >= l.minXp) level = l;
  }
  return level;
}

function getNextLevelXp(xp: number) {
  for (const l of LEVELS) {
    if (xp < l.minXp) return l.minXp;
  }
  return LEVELS[LEVELS.length - 1].minXp;
}

interface DashboardProps {
  user: { id: string; name: string; email: string };
  onSelectPath: (categoryId: string, pathId: string) => void;
  onLogout: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ user, onSelectPath, onLogout }) => {
  const [xp, setXp] = useState(0);
  const [completed, setCompleted] = useState(0);
  const [xpAnim, setXpAnim] = useState(false);

  useEffect(() => {
    const fetchXp = async () => {
      try {
        const res = await fetch(`${API_URL}/xp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'get', user_id: user.id }),
        });
        const data = await res.json();
        if (data.xp !== undefined) {
          setXp(data.xp);
          setCompleted(data.completed_trainings || 0);
          setTimeout(() => setXpAnim(true), 100);
        }
      } catch {}
    };
    fetchXp();
  }, []);

  const initial = user.name?.charAt(0) || '?';
  const level = getLevel(xp);
  const nextLevelXp = getNextLevelXp(xp);
  const xpProgress = nextLevelXp > 0 ? Math.min((xp / nextLevelXp) * 100, 100) : 100;

  const hexToRgb = (hex: string) => {
    try {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return `${r}, ${g}, ${b}`;
    } catch {
      return '0, 212, 170';
    }
  };

  return (
    <div className="dash-page">
      {/* Background neon ambient glowing blobs */}
      <div className="dash-bg-blob-1" />
      <div className="dash-bg-blob-2" />

      <header className="dash-header">
        <a href="/" className="dash-logo">APEX<sup>®</sup></a>
        <div className="dash-header-right">
          <div className="dash-user-badge">
            <span className="dash-level" style={{ background: level.color + '18', color: level.color, borderColor: level.color + '33' }}>
              {level.name}
            </span>
            <div className="dash-avatar">{initial}</div>
            <span className="dash-name">{user.name || user.email}</span>
          </div>
          <button onClick={onLogout} className="dash-logout">تسجيل خروج</button>
        </div>
      </header>

      <main className="dash-main">
        {/* Hero with XP card */}
        <div className="dash-hero">
          <div className="dash-hero-content">
            <h1>مرحباً، {user.name} 👋</h1>
            <p>اختر مسارك السيبراني وابدأ رحلة التحدي العملي. كل تدريب يُولده الذكاء الاصطناعي خصيصاً لرفع مهاراتك الأمنية.</p>
          </div>
          <div className="dash-hero-stats">
            <div className="dash-xp-card">
              <div className="dash-xp-glow" />
              <div className="dash-xp-icon">
                <Zap size={20} className="text-yellow-400" />
              </div>
              <div className="dash-xp-amount">
                <span className={`dash-xp-value ${xpAnim ? 'animate' : ''}`}>{xp.toLocaleString()}</span>
                <span className="dash-xp-label">XP</span>
              </div>
              <div className="dash-xp-bar-track">
                <div className="dash-xp-bar-fill" style={{ width: `${xpProgress}%` }} />
              </div>
              <div className="dash-xp-level">
                <span>{level.name}</span>
                <span>{xp} / {nextLevelXp} XP</span>
              </div>
            </div>
            <div className="dash-stat-card">
              <div className="dash-stat-icon">
                <GraduationCap size={20} />
              </div>
              <div className="dash-stat-value">{completed}</div>
              <div className="dash-stat-label">تدريب مكتمل</div>
            </div>
          </div>
        </div>

        {/* Category Sections */}
        {CATEGORIES.map((cat) => (
          <section key={cat.id} className="dash-category">
            <div className="dash-category-header">
              <span className="dash-category-icon">{cat.icon}</span>
              <div>
                <h2 className="dash-category-title">{cat.title}</h2>
                <p className="dash-category-desc">{cat.desc}</p>
              </div>
            </div>

            <div className="dash-paths-scroll">
              <div className="dash-paths-row">
                {cat.paths.map((path) => (
                  <button
                    key={path.id}
                    className="dash-path-card"
                    onClick={() => onSelectPath(cat.id, path.id)}
                    style={{ 
                      '--accent': cat.accent,
                      '--accent-rgb': hexToRgb(cat.accent)
                    } as React.CSSProperties}
                  >
                    <div className="dash-path-icon-wrapper" style={{ background: cat.accent + '12' }}>
                      <span className="dash-path-icon">{path.icon}</span>
                    </div>
                    <h3 className="dash-path-title">{path.title}</h3>
                    <p className="dash-path-desc">{path.desc}</p>
                    <div className="dash-path-footer">
                      <span className="dash-path-modules" style={{ color: cat.accent }}>{path.modules.length} وحدات تدريبية</span>
                      <span className="dash-path-arrow" style={{ color: cat.accent }}>
                        <ArrowLeft size={16} />
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </section>
        ))}

        <section className="dash-tips">
          <h3>
            <Lightbulb size={20} style={{ verticalAlign: 'middle', marginLeft: '8px', color: '#ffc107' }} />
            <span>نصيحة اليوم الأمنية</span>
          </h3>
          <p>التدريب العملي والمستمر هو السلاح الأقوى في الأمن السيبراني. كل تحدٍ تخوضه هنا يحاكي ثغرات ومخاطر حقيقية، مما يمنحك الخبرة اللازمة لتأمين الأنظمة والدفاع عنها بكفاءة عالية.</p>
        </section>
      </main>
    </div>
  );
};