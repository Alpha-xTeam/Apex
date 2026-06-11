import React, { useState, useEffect, useRef } from 'react';
import '../dstyle.css';
import './Dashboard.css';
import {
  Zap,
  GraduationCap,
  Lightbulb,
  ChevronLeft,
  Trophy,
  Swords,
  Shield,
  Target,
  Sparkles,
  TrendingUp,
  Lock,
  User,
  ArrowRight,
  ArrowLeft,
} from 'lucide-react';
import { BlueTeamIcon, RedTeamIcon } from './TeamIcons';
import { useI18n } from '../i18n/I18nContext';
import { LanguageSwitcher } from './LanguageSwitcher';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8090/api';

interface DashboardProps {
  user: { id: string; name: string; email: string };
  onSelectChallenge: (categoryId: string, pathId: string, moduleId: string, moduleTitle: string, teamRole: 'red' | 'blue', challengeId?: string) => void;
  onViewProfile: () => void;
  onViewLeaderboard: () => void;
  onLogout: () => void;
  onOpenOneVOne?: () => void;
  onOpenBlueVsRed?: () => void;
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

function getProgressToNext(xp: number, levels: { minXp: number }[]) {
  const currentLevelXp = levels.filter(l => xp >= l.minXp).pop()?.minXp || 0;
  const nextLevelXp = getNextLevelXp(xp, levels);
  if (nextLevelXp === currentLevelXp) return 100;
  return ((xp - currentLevelXp) / (nextLevelXp - currentLevelXp)) * 100;
}

function useStaggeredAnimation(count: number, delay: number = 100) {
  const [visible, setVisible] = useState<boolean[]>(new Array(count).fill(false));
  useEffect(() => {
    const timer = setTimeout(() => {
      for (let i = 0; i < count; i++) {
        setTimeout(() => setVisible(v => { const n = [...v]; n[i] = true; return n; }), i * delay);
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [count, delay]);
  return visible;
}

export const Dashboard: React.FC<DashboardProps> = ({ user, onViewProfile, onViewLeaderboard, onLogout, onOpenOneVOne, onOpenBlueVsRed }) => {
  const { t } = useI18n();
  const LEVELS = useLevels(t);
  const [xp, setXp] = useState(0);
  const [completed, setCompleted] = useState(0);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const greetingRef = useRef<HTMLDivElement>(null);
  const statsRef = useRef<HTMLDivElement>(null);
  const teamsRef = useRef<HTMLDivElement>(null);
  const tipsRef = useRef<HTMLDivElement>(null);

  // Staggered animations
  const statCardsVisible = useStaggeredAnimation(3, 120);
  const teamCardsVisible = useStaggeredAnimation(2, 150);

  useEffect(() => {
    const fetchData = async () => {
      setFetchError('');
      try {
        const rawSession = localStorage.getItem('cyberarena_session');
        let token = '';
        if (rawSession) {
          try {
            const parsed = JSON.parse(rawSession);
            token = parsed.access_token
              || parsed.session?.access_token
              || parsed.data?.access_token
              || parsed.data?.session?.access_token
              || parsed.token
              || '';
          } catch (e) {
            console.error('Error parsing session', e);
          }
        }

        // Fallback: try Supabase's own localStorage key
        if (!token) {
          try {
            const supabaseKey = Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
            if (supabaseKey) {
              const supaSession = JSON.parse(localStorage.getItem(supabaseKey) || '{}');
              token = supaSession?.access_token || supaSession?.currentSession?.access_token || '';
            }
          } catch { /* ignore */ }
        }

        if (!token) {
          console.warn('[Dashboard] No auth token found');
          setFetchError('يرجى تسجيل الدخول مرة أخرى');
          setLoading(false);
          return;
        }

        const xpRes = await fetch(`${API_URL}/xp`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ action: 'get', user_id: user.id }),
        });
        const xpData = await xpRes.json();
        if (xpData.xp !== undefined) {
          setXp(xpData.xp);
          setCompleted(xpData.completed_trainings || 0);
        }
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

  return (
    <div className="dash-page">
      {/* Dynamic Background Glows */}
      <div className="dash-glow-orb orb-1" />
      <div className="dash-glow-orb orb-2" />
      <div className="dash-glow-orb orb-3" />

      <header className="dash-header">
        <div className="dash-header-inner">
          <a href="/" className="dash-logo">
            <span className="dash-logo-accent">Cyber</span>Arena
          </a>
          <div className="dash-header-right">
            <LanguageSwitcher />
            <button onClick={onViewLeaderboard} className="dash-leaderboard-btn">
              <Trophy size={14} />
              <span>{t.dashboard.leaderboard}</span>
            </button>
            <div className="dash-user-badge" onClick={onViewProfile}>
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
        <div className="dash-container dash-layout-grid">
          
          {/* LEFT COLUMN: Main Content */}
          <div className="dash-main-content">
            
            {/* Welcome Banner */}
            <section className="bento-card welcome-card">
              <div className="welcome-info">
                <div className="welcome-tag">
                  <Sparkles size={12} className="text-emerald-400" />
                  <span>AGENT STATUS: ACTIVE</span>
                </div>
                <h1>{t.dashboard.greeting}، <span>{user.name}</span> 👋</h1>
                <p>{t.dashboard.greetingSub}</p>
              </div>
              <div className="welcome-system-status">
                <div className="status-indicator">
                  <span className="status-dot pulsing" />
                  <span className="status-text">SECURE GATEWAY</span>
                </div>
              </div>
            </section>

            {/* Game / Challenge Modes */}
            <section className="modes-section">
              <div className="dash-section-header">
                <h2>{t.dashboard.chooseTeam}</h2>
                <p>{t.dashboard.chooseTeamSub}</p>
              </div>

              {fetchError && (
                <div className="dash-empty-state">
                  {fetchError}
                </div>
              )}

              {loading ? (
                <div className="dash-loading">{t.dashboard.loading}</div>
              ) : (
                <div className="modes-grid">
                  
                  {/* Blue vs Red Arena Mode */}
                  <div className="mode-card bluevsred-bento" onClick={onOpenBlueVsRed}>
                    <div className="card-glare" />
                    <div className="mode-card-header">
                      <span className="mode-tag blue-red-tag">CAMP PRACTICE</span>
                    </div>
                    <div className="mode-card-body">
                      <div className="teams-comparison">
                        <div className="team-side blue-side">
                          <BlueTeamIcon size={48} />
                          <h4>{t.dashboard.blueTitle}</h4>
                          <p>{t.dashboard.blueSubtitle}</p>
                        </div>
                        
                        <div className="vs-midline">
                          <span className="vs-badge">VS</span>
                        </div>
                        
                        <div className="team-side red-side">
                          <RedTeamIcon size={48} />
                          <h4>{t.dashboard.redTitle}</h4>
                          <p>{t.dashboard.redSubtitle}</p>
                        </div>
                      </div>
                    </div>
                    <div className="mode-card-footer">
                      <span>{t.dashboard.blueVsRedCta || 'استعرض التحديات'}</span>
                      <ArrowLeft className="cta-arrow" size={16} />
                    </div>
                  </div>

                  {/* 1v1 PvP Lobby Mode */}
                  {onOpenOneVOne && (
                    <div className="mode-card onevone-bento" onClick={onOpenOneVOne}>
                      <div className="card-glare" />
                      <div className="mode-card-header">
                        <span className="mode-tag onevone-tag">PvP CHALLENGE</span>
                        <div className="live-match-badge">
                          <span className="live-dot" />
                          <span>LIVE</span>
                        </div>
                      </div>
                      <div className="mode-card-body">
                        <div className="onevone-showcase">
                          <div className="swords-icon-glow">
                            <Swords size={40} />
                          </div>
                          <div className="onevone-details">
                            <h3>{t.dashboard.oneVOneTitle}</h3>
                            <p>{t.dashboard.oneVOneDesc}</p>
                          </div>
                        </div>
                        <div className="onevone-pills-row">
                          <span className="onevone-pill">{t.dashboard.oneVOnePill1}</span>
                          <span className="onevone-pill">{t.dashboard.oneVOnePill2}</span>
                          <span className="onevone-pill">{t.dashboard.oneVOnePill3}</span>
                        </div>
                      </div>
                      <div className="mode-card-footer">
                        <span>{t.dashboard.oneVOneCta}</span>
                        <ArrowLeft className="cta-arrow" size={16} />
                      </div>
                    </div>
                  )}

                </div>
              )}
            </section>
          </div>

          {/* RIGHT COLUMN: Sidebar (Stats & Info) */}
          <div className="dash-sidebar">
            
            {/* User Level Card */}
            <section className="bento-card progress-card" onClick={onViewProfile}>
              <div className="card-header-row">
                <h3>{t.dashboard.levelLabel}</h3>
                <span className="level-badge" style={{ color: level.color, backgroundColor: `${level.color}15` }}>
                  {level.name}
                </span>
              </div>
              
              <div className="progress-bar-container">
                <div className="dash-stat-progress">
                  <div className="dash-stat-progress-fill" style={{ width: `${xpProgress}%`, background: `linear-gradient(90deg, ${level.color}, #a7f3d0)` }} />
                </div>
                <div className="progress-labels">
                  <span>{xp.toLocaleString()} XP</span>
                  <span className="faint-label">{nextLevelXp.toLocaleString()} XP</span>
                </div>
              </div>
            </section>

            {/* Stats Overview */}
            <section className="bento-card stats-overview-card">
              <div className="bento-stat-item">
                <div className="bento-stat-icon-wrapper xp-wrapper">
                  <Zap size={18} />
                </div>
                <div className="bento-stat-info">
                  <span className="bento-stat-value">{xp.toLocaleString()}</span>
                  <span className="bento-stat-label">{t.dashboard.xpLabel}</span>
                </div>
              </div>
              <div className="bento-stat-divider" />
              <div className="bento-stat-item">
                <div className="bento-stat-icon-wrapper completed-wrapper">
                  <GraduationCap size={18} />
                </div>
                <div className="bento-stat-info">
                  <span className="bento-stat-value">{completed}</span>
                  <span className="bento-stat-label">{t.dashboard.completedLabel}</span>
                </div>
              </div>
            </section>

            {/* Daily Tip Panel */}
            <section className="bento-card tip-card">
              <div className="tip-header-row">
                <div className="tip-bulb-icon">
                  <Lightbulb size={18} />
                </div>
                <h3>{t.dashboard.tipTitle}</h3>
              </div>
              <p>{t.dashboard.tipBody}</p>
            </section>

          </div>

        </div>
      </main>
    </div>
  );
};
