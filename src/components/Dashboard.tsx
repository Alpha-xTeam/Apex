import React, { useState, useEffect } from 'react';
import {
  Lock,
  Zap,
  GraduationCap,
  Lightbulb,
  ArrowLeft,
  ChevronLeft,
  Trophy,
  Swords,
} from 'lucide-react';
import { BlueTeamIcon, RedTeamIcon } from './TeamIcons';
import { useI18n } from '../i18n/I18nContext';
import { LanguageSwitcher } from './LanguageSwitcher';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8090/api';

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
  onOpenOneVOne?: () => void;
}

function useLevels(t: ReturnType<typeof useI18n>['t']) {
  return [
    { name: t.levels.beginner, minXp: 0, color: '#10b981' },
    { name: t.levels.advanced, minXp: 200, color: '#f59e0b' },
    { name: t.levels.expert, minXp: 600, color: '#ef4444' },
    { name: t.levels.master, minXp: 1500, color: '#8b5cf6' },
  ];
}

function getLevel(xp: number, levels: { name: string; minXp: number; color: string }[]) {
  let level = levels[0];
  for (const l of levels) if (xp >= l.minXp) level = l;
  return level;
}

function getNextLevelXp(xp: number, levels: { minXp: number }[]) {
  for (const l of levels) if (xp < l.minXp) return l.minXp;
  return levels[levels.length - 1].minXp;
}

export const Dashboard: React.FC<DashboardProps> = ({ user, onSelectChallenge, onViewProfile, onViewLeaderboard, onLogout, onOpenOneVOne }) => {
  const { t, lang } = useI18n();
  const LEVELS = useLevels(t);
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
          throw new Error(`Backend unavailable (${blueRes.status}/${redRes.status}). ${t.dashboard.fetchError}`);
        }

        const blueData = await blueRes.json();
        const redData = await redRes.json();
        setBlueChallenges(blueData.items || []);
        setRedChallenges(redData.items || []);
      } catch (err) {
        console.error('Error fetching dashboard data', err);
        setFetchError(err instanceof Error ? err.message : t.dashboard.fetchError);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [user.id, t.dashboard.fetchError]);

  const initial = user.name?.charAt(0) || '?';
  const level = getLevel(xp, LEVELS);
  const nextLevelXp = getNextLevelXp(xp, LEVELS);
  const xpProgress = nextLevelXp > 0 ? Math.min((xp / nextLevelXp) * 100, 100) : 100;

  const groupByCategory = (challenges: DBChallenge[]) => {
    const groups: { [cat: string]: DBChallenge[] } = {};
    challenges.forEach(c => {
      const cat = c.category || (lang === 'ar' ? 'تحديات عامة' : 'General challenges');
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(c);
    });
    return groups;
  };

  const blueGroups = groupByCategory(blueChallenges);
  const redGroups = groupByCategory(redChallenges);

  const teamsData = [
    { id: 'blue', title: t.dashboard.blueTitle, subtitle: t.dashboard.blueSubtitle, desc: t.dashboard.blueDesc, accent: '#3b82f6', accentSoft: 'rgba(59, 130, 246, 0.08)', icon: <BlueTeamIcon size={56} />, groups: blueGroups },
    { id: 'red', title: t.dashboard.redTitle, subtitle: t.dashboard.redSubtitle, desc: t.dashboard.redDesc, accent: '#ef4444', accentSoft: 'rgba(239, 68, 68, 0.08)', icon: <RedTeamIcon size={56} />, groups: redGroups }
  ];

  return (
    <div className="dash-page">
      <header className="dash-header">
        <div className="dash-header-inner">
          <a href="/" className="dash-logo">CyberArena</a>
          <div className="dash-header-right">
            <LanguageSwitcher />
            <button onClick={onViewLeaderboard} className="dash-leaderboard-btn">
              <Trophy size={14} />
              <span>{t.dashboard.leaderboard}</span>
            </button>
            <div className="dash-user-badge" onClick={onViewProfile} style={{ cursor: 'pointer' }}>
              <div className="dash-avatar">{initial}</div>
              <div className="dash-user-info">
                <span className="dash-name">{user.name || user.email}</span>
                <span className="dash-level" style={{ color: level.color }}>{level.name}</span>
              </div>
            </div>
            <button onClick={onLogout} className="dash-logout">{t.dashboard.logout}</button>
          </div>
        </div>
      </header>

      <main className="dash-main">
        <div className="dash-container">
          <section className="dash-greeting">
            <h1>{t.dashboard.greeting}، {user.name} 👋</h1>
            <p>{t.dashboard.greetingSub}</p>
          </section>

          <section className="dash-stats-grid">
            <div className="dash-stat-card">
              <div className="dash-stat-icon" style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}>
                <Zap size={20} />
              </div>
              <div className="dash-stat-body">
                <span className="dash-stat-value">{xp.toLocaleString()}</span>
                <span className="dash-stat-label">{t.dashboard.xpLabel}</span>
              </div>
            </div>

            <div className="dash-stat-card">
              <div className="dash-stat-icon" style={{ background: `${level.color}1a`, color: level.color }}>
                <Trophy size={20} />
              </div>
              <div className="dash-stat-body">
                <span className="dash-stat-value">{level.name}</span>
                <span className="dash-stat-label">{t.dashboard.levelLabel}</span>
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
                <span className="dash-stat-label">{t.dashboard.completedLabel}</span>
              </div>
            </div>
          </section>

          <section className="dash-section-header">
            <h2>{t.dashboard.chooseTeam}</h2>
            <p>{t.dashboard.chooseTeamSub}</p>
          </section>

          {fetchError && (
            <div className="dash-empty-state" style={{ marginBottom: '1rem', color: '#f87171' }}>
              {fetchError}
            </div>
          )}

          {loading ? (
            <div className="dash-loading">{t.dashboard.loading}</div>
          ) : (
            <>
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
                        <button onClick={() => setActiveSection(null)} className="dash-back-btn">
                          <ArrowLeft size={14} />
                          <span>{t.dashboard.backToCategories}</span>
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
                              onClick={() => setActiveSection({ teamId: team.id, category, challenges })}
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
                          <div className="dash-empty-state">{t.dashboard.noChallenges}</div>
                        )}
                      </div>
                    )}
                  </section>
                ))}
              </div>

              {onOpenOneVOne && (
                <section
                  className="dash-team-card onevone-dash-card"
                  style={{ '--team-accent': '#10b981', '--team-accent-soft': 'rgba(16,185,129,0.08)' } as React.CSSProperties}
                  onClick={onOpenOneVOne}
                >
                  <div className="dash-team-header">
                    <div className="dash-team-icon" style={{ background: 'rgba(16,185,129,0.08)' }}>
                      <Swords size={36} color="#10b981" />
                    </div>
                    <div>
                      <h3 className="dash-team-title">{t.dashboard.oneVOneTitle}</h3>
                      <span className="dash-team-subtitle">{t.dashboard.oneVOneSubtitle}</span>
                    </div>
                  </div>
                  <p className="dash-team-desc">{t.dashboard.oneVOneDesc}</p>
                  <div className="onevone-dash-meta">
                    <span className="onevone-dash-pill">{t.dashboard.oneVOnePill1}</span>
                    <span className="onevone-dash-pill">{t.dashboard.oneVOnePill2}</span>
                    <span className="onevone-dash-pill">{t.dashboard.oneVOnePill3}</span>
                  </div>
                  <div className="onevone-dash-cta">
                    {t.dashboard.oneVOneCta} <ChevronLeft size={14} />
                  </div>
                </section>
              )}
            </>
          )}

          <section className="dash-tips">
            <div className="dash-tips-icon">
              <Lightbulb size={18} />
            </div>
            <div className="dash-tips-body">
              <h3>{t.dashboard.tipTitle}</h3>
              <p>{t.dashboard.tipBody}</p>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};
