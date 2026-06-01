import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  Lock, 
  Zap, 
  GraduationCap, 
  Lightbulb, 
  ArrowLeft,
  ChevronDown
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';

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

interface DBChallenge {
  id: string;
  title: string;
  module: string;
  category: string;
  path: string;
  difficulty: string;
  xpReward: number;
}

interface DashboardProps {
  user: { id: string; name: string; email: string };
  onSelectChallenge: (categoryId: string, pathId: string, moduleId: string, moduleTitle: string, teamRole: 'red' | 'blue', challengeId?: string) => void;
  onViewProfile: () => void;
  onLogout: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ user, onSelectChallenge, onViewProfile, onLogout }) => {
  const [xp, setXp] = useState(0);
  const [completed, setCompleted] = useState(0);
  const [xpAnim, setXpAnim] = useState(false);
  
  const [blueChallenges, setBlueChallenges] = useState<DBChallenge[]>([]);
  const [redChallenges, setRedChallenges] = useState<DBChallenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<{ teamId: string; category: string; challenges: DBChallenge[] } | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch XP
        const xpRes = await fetch(`${API_URL}/xp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'get', user_id: user.id }),
        });
        const xpData = await xpRes.json();
        if (xpData.xp !== undefined) {
          setXp(xpData.xp);
          setCompleted(xpData.completed_trainings || 0);
          setTimeout(() => setXpAnim(true), 100);
        }

        // Fetch DB Challenges
        const [blueRes, redRes] = await Promise.all([
          fetch(`${API_URL}/training/list?team_role=blue&limit=1000`),
          fetch(`${API_URL}/training/list?team_role=red&limit=1000`)
        ]);
        const blueData = await blueRes.json();
        const redData = await redRes.json();
        
        if (blueData.challenges) setBlueChallenges(blueData.challenges);
        if (redData.challenges) setRedChallenges(redData.challenges);
      } catch (err) {
        console.error('Error fetching dashboard data', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [user.id]);

  const initial = user.name?.charAt(0) || '?';
  const level = getLevel(xp);
  const nextLevelXp = getNextLevelXp(xp);
  const xpProgress = nextLevelXp > 0 ? Math.min((xp / nextLevelXp) * 100, 100) : 100;

  // Group challenges by category
  const groupByCategory = (challenges: DBChallenge[]) => {
    const groups: { [cat: string]: DBChallenge[] } = {};
    challenges.forEach(c => {
      const cat = c.category || 'تحديات عامة';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(c);
    });
    return groups;
  };

  const blueGroups = groupByCategory(blueChallenges);
  const redGroups = groupByCategory(redChallenges);

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

  const teamsData = [
    {
      id: 'blue',
      title: 'الفريق الأزرق (المدافع)',
      desc: 'تحديات دفاعية لاكتشاف الثغرات وتأمين الأنظمة',
      accent: '#4b8bff',
      icon: <Shield size={24} />,
      groups: blueGroups
    },
    {
      id: 'red',
      title: 'الفريق الأحمر (المهاجم)',
      desc: 'تحديات هجومية لاكتشاف واستغلال الثغرات',
      accent: '#ff4b4b',
      icon: <Zap size={24} />,
      groups: redGroups
    }
  ];

  const openSection = (teamId: string, category: string, challenges: DBChallenge[]) => {
    setActiveSection({ teamId, category, challenges });
  };

  const closeSection = () => {
    setActiveSection(null);
  };

  return (
    <div className="dash-page">
      {/* Background neon ambient glowing blobs */}
      <div className="dash-bg-blob-1" />
      <div className="dash-bg-blob-2" />

      <header className="dash-header">
        <a href="/" className="dash-logo">CyberArena</a>
        <div className="dash-header-right">
          <div className="dash-user-badge" onClick={onViewProfile} style={{ cursor: 'pointer' }}>
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
        <div className="dash-category-header" style={{ marginTop: '40px', padding: '0 20px' }}>
          <span className="dash-category-icon"><Shield size={24} /></span>
          <div>
            <h2 className="dash-category-title">تحديات الأمن السيبراني (مباشرة من قاعدة البيانات)</h2>
            <p className="dash-category-desc">اختر التحدي مباشرة للبدء</p>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'rgba(255,255,255,0.6)' }}>جاري تحميل التحديات من قاعدة البيانات...</div>
        ) : (
          <div className="dash-teams-grid">
            {teamsData.map((team) => (
          <section key={team.id} className="dash-category dash-team-card" style={{ marginTop: '20px' }}>
            <div className="dash-category-header" style={{ padding: '0 20px', marginBottom: '20px' }}>
              <span className="dash-category-icon" style={{ color: team.accent }}>{team.icon}</span>
              <div>
                <h3 className="dash-category-title" style={{ color: team.accent, fontSize: '20px' }}>{team.title}</h3>
                <p className="dash-category-desc">{team.desc}</p>
              </div>
            </div>

            {activeSection && activeSection.teamId === team.id ? (
              <div style={{ padding: '0 20px' }}>
                <button
                  onClick={closeSection}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'rgba(255,255,255,0.6)',
                    fontSize: '14px',
                    cursor: 'pointer',
                    marginBottom: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontFamily: 'var(--font-arabic)'
                  }}
                >
                  <ArrowLeft size={16} />
                  العودة للأقسام
                </button>
                <h3 style={{ color: team.accent, fontSize: '24px', marginBottom: '20px' }}>{activeSection.category}</h3>
                <div className="dash-paths-row">
                  {activeSection.challenges.map((challenge) => (
                    <button
                      key={challenge.id}
                      className="dash-path-card"
                      onClick={() => onSelectChallenge(challenge.category, challenge.path, challenge.module, challenge.title, team.id as 'red' | 'blue', challenge.id)}
                      style={{
                        '--accent': team.accent,
                        '--accent-rgb': hexToRgb(team.accent)
                      } as React.CSSProperties}
                    >
                      <div className="dash-path-icon-wrapper" style={{ background: team.accent + '12' }}>
                        <span className="dash-path-icon" style={{ color: team.accent }}><Lock size={22} /></span>
                      </div>
                      <h3 className="dash-path-title" style={{ fontSize: '15px', marginTop: '10px' }}>{challenge.title}</h3>
                      <p className="dash-path-desc">النوع: {challenge.module}<br/>المستوى: <strong style={{ color: team.accent }}>{challenge.difficulty}</strong></p>
                      <div className="dash-path-footer">
                        <span className="dash-path-modules" style={{ color: team.accent }}>
                          جائزة: {challenge.xpReward} XP
                        </span>
                        <span className="dash-path-arrow" style={{ color: team.accent }}>
                          <ArrowLeft size={16} />
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="dash-category-cards-grid">
                {Object.keys(team.groups).map(category => {
                  const challenges = team.groups[category];

                  return (
                    <div key={category} className="dash-category-card-wrap">
                      <button
                        className="dash-path-card"
                        onClick={() => openSection(team.id, category, challenges)}
                        style={{
                          width: '100%',
                          textAlign: 'right',
                          '--accent': team.accent,
                          '--accent-rgb': hexToRgb(team.accent)
                        } as React.CSSProperties}
                      >
                        <div className="dash-path-icon-wrapper" style={{ background: team.accent + '12' }}>
                          <span className="dash-path-icon" style={{ color: team.accent }}><Lock size={22} /></span>
                        </div>
                        <h3 className="dash-path-title" style={{ marginTop: '10px' }}>{category}</h3>
                        <p className="dash-path-desc">اضغط لعرض التحديات الخاصة بهذا القسم</p>
                        <div className="dash-path-footer">
                          <span className="dash-path-modules" style={{ color: team.accent }}>
                            {challenges.length} تحدي
                          </span>
                          <span className="dash-path-arrow" style={{ color: team.accent }}>
                            <ChevronDown size={16} />
                          </span>
                        </div>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            
            {Object.keys(team.groups).length === 0 && (
              <div style={{ padding: '0 20px', color: 'rgba(255,255,255,0.4)', fontSize: '14px', marginBottom: '20px' }}>
                لا توجد تحديات متوفرة لهذا الفريق حالياً.
              </div>
            )}
          </section>
        ))}
          </div>
        )}

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