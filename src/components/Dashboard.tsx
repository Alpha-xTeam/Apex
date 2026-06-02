import React, { useState, useEffect } from 'react';
import {
  Lock,
  Zap,
  GraduationCap,
  Lightbulb,
  ArrowLeft,
  ChevronLeft,
  Trophy,
} from 'lucide-react';
import { BlueTeamIcon, RedTeamIcon } from './TeamIcons';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';

const LEVELS = [
  { name: 'مبتدئ', minXp: 0, color: '#10b981' },
  { name: 'متقدم', minXp: 200, color: '#f59e0b' },
  { name: 'خبير', minXp: 600, color: '#ef4444' },
  { name: 'سايبر ماستر', minXp: 1500, color: '#8b5cf6' },
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
  onViewLeaderboard: () => void;
  onLogout: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ user, onSelectChallenge, onViewProfile, onViewLeaderboard, onLogout }) => {
  const [xp, setXp] = useState(0);
  const [completed, setCompleted] = useState(0);

  const [blueChallenges, setBlueChallenges] = useState<DBChallenge[]>([]);
  const [redChallenges, setRedChallenges] = useState<DBChallenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [activeSection, setActiveSection] = useState<{ teamId: string; category: string; challenges: DBChallenge[] } | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setFetchError('');
      try {
        const xpRes = await fetch(`${API_URL}/xp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'get', user_id: user.id }),
        });
        const xpData = await xpRes.json();
        if (xpData.xp !== undefined) {
          setXp(xpData.xp);
          setCompleted(xpData.completed_trainings || 0);
        }

        const [blueRes, redRes] = await Promise.all([
          fetch(`${API_URL}/training/list?team_role=blue&limit=1000`),
          fetch(`${API_URL}/training/list?team_role=red&limit=1000`)
        ]);

        if (!blueRes.ok || !redRes.ok) {
          throw new Error(`Backend unavailable (${blueRes.status}/${redRes.status}). تأكد أن السيرفر يعمل على ${API_URL}`);
        }

        const blueData = await blueRes.json();
        const redData = await redRes.json();

        setBlueChallenges(blueData.challenges || []);
        setRedChallenges(redData.challenges || []);
      } catch (err) {
        console.error('Error fetching dashboard data', err);
        setFetchError(err instanceof Error ? err.message : 'تعذّر تحميل التحديات من الخادم');
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

  const teamsData = [
    {
      id: 'blue',
      title: 'الفريق الأزرق',
      subtitle: 'المدافع',
      desc: 'اكتشف الثغرات وقم بتأمين الأنظمة',
      accent: '#3b82f6',
      accentSoft: 'rgba(59, 130, 246, 0.08)',
      icon: <BlueTeamIcon size={56} />,
      groups: blueGroups
    },
    {
      id: 'red',
      title: 'الفريق الأحمر',
      subtitle: 'المهاجم',
      desc: 'اكتشف واستغل الثغرات الأمنية',
      accent: '#ef4444',
      accentSoft: 'rgba(239, 68, 68, 0.08)',
      icon: <RedTeamIcon size={56} />,
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
      <header className="dash-header">
        <div className="dash-header-inner">
          <a href="/" className="dash-logo">CyberArena</a>
          <div className="dash-header-right">
            <button onClick={onViewLeaderboard} className="dash-leaderboard-btn">
              <Trophy size={14} />
              <span>المتصدرين</span>
            </button>
            <div className="dash-user-badge" onClick={onViewProfile} style={{ cursor: 'pointer' }}>
              <div className="dash-avatar">{initial}</div>
              <div className="dash-user-info">
                <span className="dash-name">{user.name || user.email}</span>
                <span className="dash-level" style={{ color: level.color }}>{level.name}</span>
              </div>
            </div>
            <button onClick={onLogout} className="dash-logout">خروج</button>
          </div>
        </div>
      </header>

      <main className="dash-main">
        <div className="dash-container">
          {/* Hero greeting */}
          <section className="dash-greeting">
            <h1>أهلاً، {user.name} 👋</h1>
            <p>اختر مسارك التدريبي وابدأ بتحديات الأمن السيبراني العملية المُولّدة بالذكاء الاصطناعي.</p>
          </section>

          {/* 3 Stat Cards Row */}
          <section className="dash-stats-grid">
            <div className="dash-stat-card">
              <div className="dash-stat-icon" style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}>
                <Zap size={20} />
              </div>
              <div className="dash-stat-body">
                <span className="dash-stat-value">{xp.toLocaleString()}</span>
                <span className="dash-stat-label">نقاط الخبرة</span>
              </div>
            </div>

            <div className="dash-stat-card">
              <div className="dash-stat-icon" style={{ background: `${level.color}1a`, color: level.color }}>
                <Trophy size={20} />
              </div>
              <div className="dash-stat-body">
                <span className="dash-stat-value">{level.name}</span>
                <span className="dash-stat-label">المستوى الحالي</span>
                <div className="dash-stat-progress">
                  <div className="dash-stat-progress-fill" style={{ width: `${xpProgress}%`, background: level.color }} />
                </div>
                <span className="dash-stat-progress-label">{xp} / {nextLevelXp} XP</span>
              </div>
            </div>

            <div className="dash-stat-card">
              <div className="dash-stat-icon" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
                <GraduationCap size={20} />
              </div>
              <div className="dash-stat-body">
                <span className="dash-stat-value">{completed}</span>
                <span className="dash-stat-label">تدريب مكتمل</span>
              </div>
            </div>
          </section>

          {/* Section Title */}
          <section className="dash-section-header">
            <h2>اختر فريقك</h2>
            <p>كل فريق يحتوي على تحديات متخصصة بمجالات مختلفة</p>
          </section>

          {fetchError && (
            <div className="dash-empty-state" style={{ marginBottom: '1rem', color: '#f87171' }}>
              {fetchError}
            </div>
          )}

          {loading ? (
            <div className="dash-loading">جاري تحميل التحديات...</div>
          ) : (
            <div className="dash-teams-grid">
              {teamsData.map((team) => (
                <section
                  key={team.id}
                  className="dash-team-card"
                  style={{ '--team-accent': team.accent, '--team-accent-soft': team.accentSoft } as React.CSSProperties}
                >
                  <div className="dash-team-header">
                    <div className="dash-team-icon">{team.icon}</div>
                    <div>
                      <h3 className="dash-team-title">{team.title}</h3>
                      <span className="dash-team-subtitle">{team.subtitle}</span>
                    </div>
                  </div>
                  <p className="dash-team-desc">{team.desc}</p>

                  {activeSection && activeSection.teamId === team.id ? (
                    <div className="dash-team-content">
                      <button onClick={closeSection} className="dash-back-btn">
                        <ArrowLeft size={14} />
                        <span>العودة للأقسام</span>
                      </button>
                      <h4 className="dash-content-title">{activeSection.category}</h4>
                      <div className="dash-challenges-list">
                        {activeSection.challenges.map((challenge) => (
                          <button
                            key={challenge.id}
                            className="dash-challenge-item"
                            onClick={() => onSelectChallenge(
                              challenge.category, challenge.path, challenge.module,
                              challenge.title, team.id as 'red' | 'blue', challenge.id
                            )}
                          >
                            <div className="dash-challenge-info">
                              <span className="dash-challenge-title">{challenge.title}</span>
                              <span className="dash-challenge-meta">
                                {challenge.module} • <strong>{challenge.difficulty}</strong>
                              </span>
                            </div>
                            <div className="dash-challenge-reward">
                              <span className="dash-challenge-xp">+{challenge.xpReward}</span>
                              <ChevronLeft size={16} />
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="dash-categories-list">
                      {Object.keys(team.groups).map(category => {
                        const challenges = team.groups[category];
                        return (
                          <button
                            key={category}
                            className="dash-category-item"
                            onClick={() => openSection(team.id, category, challenges)}
                          >
                            <div className="dash-category-info">
                              <Lock size={16} className="dash-category-icon-sm" />
                              <span>{category}</span>
                            </div>
                            <span className="dash-category-count">{challenges.length}</span>
                          </button>
                        );
                      })}
                      {Object.keys(team.groups).length === 0 && (
                        <div className="dash-empty-state">لا توجد تحديات متوفرة حالياً</div>
                      )}
                    </div>
                  )}
                </section>
              ))}
            </div>
          )}

          {/* Tip Section */}
          <section className="dash-tips">
            <div className="dash-tips-icon">
              <Lightbulb size={18} />
            </div>
            <div className="dash-tips-body">
              <h3>نصيحة اليوم</h3>
              <p>التدريب العملي المتكرر يصنع الخبير. كل تحدٍ هنا يحاكي ثغرة حقيقية، استغلها للتعلم.</p>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};
