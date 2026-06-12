import React, { useState, useEffect } from 'react';
import '../dstyle.css';
import './Dashboard.css';
import {
  Zap,
  GraduationCap,
  Lightbulb,
  Trophy,
  Swords,
  Sparkles,
  ArrowLeft,
  Target,
  Shield,
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

export const Dashboard: React.FC<DashboardProps> = ({ user, onViewProfile, onViewLeaderboard, onLogout, onOpenOneVOne, onOpenBlueVsRed }) => {
  const { t } = useI18n();
  const LEVELS = useLevels(t);
  const [xp, setXp] = useState(0);
  const [completed, setCompleted] = useState(0);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');

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
      <div className="dash-glow-orb orb-1" />
      <div className="dash-glow-orb orb-2" />
      <div className="dash-glow-orb orb-3" />

      <header className="dash-header z-navbar">
        <div className="dash-header-inner z-nav-inner">
          <a href="/" className="dash-logo z-nav-logo" aria-label="CyberArena">
            <span className="dash-logo-text">CyberArena</span>
            <span className="dash-logo-dot" aria-hidden="true" />
          </a>
          <div className="dash-header-right z-nav-right">
            <div className="dash-nav-status">
              <span className="dash-status-dot" />
              <span>SECURE DASHBOARD</span>
            </div>
            <LanguageSwitcher />
            <button onClick={onViewLeaderboard} className="dash-leaderboard-btn z-nav-login-btn">
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
        <div className="dash-container">

          {/* ───── Top Hero ───── */}
          <section className="dash-hero">
            <div className="dash-hero-content">
              <div className="dash-hero-tag">
                <Sparkles size={12} />
                <span>SYSTEM ONLINE</span>
              </div>
              <h1 className="dash-hero-title">
                {t.dashboard.greeting}، <span>{user.name}</span>
              </h1>
              <p className="dash-hero-sub">{t.dashboard.greetingSub}</p>
            </div>
            <div className="dash-hero-badge">
              <Target size={14} />
              <span>{t.dashboard.chooseTeam}</span>
            </div>
          </section>

          {/* ───── Quick Stats Strip ───── */}
          <section className="dash-stats-strip">
            <div className="strip-card" onClick={onViewProfile}>
              <div className="strip-card-icon" style={{ background: 'rgba(16,185,129,0.12)', color: '#10b981' }}>
                <Zap size={18} />
              </div>
              <div className="strip-card-body">
                <span className="strip-card-value">{xp.toLocaleString()}</span>
                <span className="strip-card-label">{t.dashboard.xpLabel}</span>
              </div>
            </div>
            <div className="strip-card" onClick={onViewProfile}>
              <div className="strip-card-icon" style={{ background: 'rgba(139,92,246,0.12)', color: '#8b5cf6' }}>
                <GraduationCap size={18} />
              </div>
              <div className="strip-card-body">
                <span className="strip-card-value">{completed}</span>
                <span className="strip-card-label">{t.dashboard.completedLabel}</span>
              </div>
            </div>
            <div className="strip-card strip-level" onClick={onViewProfile}>
              <div className="strip-level-bar">
                <div className="strip-level-fill" style={{ width: `${xpProgress}%`, background: `linear-gradient(90deg, ${level.color}, #a7f3d0)` }} />
              </div>
              <div className="strip-level-info">
                <span className="strip-level-name" style={{ color: level.color }}>{level.name}</span>
                <span className="strip-level-xp">{xp.toLocaleString()} / {nextLevelXp.toLocaleString()} XP</span>
              </div>
            </div>
          </section>

          {/* ───── Main Grid ───── */}
          <div className="dash-layout-grid">

            {/* ─── LEFT: Modes ─── */}
            <div className="dash-main-content">

              {fetchError && (
                <div className="dash-error-banner">{fetchError}</div>
              )}

              {loading ? (
                <div className="dash-loading">{t.dashboard.loading}</div>
              ) : (
                <div className="modes-grid">

                  {/* Blue vs Red Card */}
                  <div className="mode-card mode-card-bvr" onClick={onOpenBlueVsRed}>
                    <div className="mode-card-glow" />
                    <div className="mode-card-header">
                      <span className="mode-tag tag-bvr">CAMP PRACTICE</span>
                    </div>
                    <div className="mode-card-body">
                      <div className="bvr-teams">
                        <div className="bvr-team bvr-blue">
                          <BlueTeamIcon size={44} />
                          <h4>{t.dashboard.blueTitle}</h4>
                          <p>{t.dashboard.blueSubtitle}</p>
                        </div>
                        <div className="bvr-vs">
                          <span>VS</span>
                        </div>
                        <div className="bvr-team bvr-red">
                          <RedTeamIcon size={44} />
                          <h4>{t.dashboard.redTitle}</h4>
                          <p>{t.dashboard.redSubtitle}</p>
                        </div>
                      </div>
                    </div>
                    <div className="mode-card-footer">
                      <span>{t.dashboard.blueVsRedCta || 'استعرض التحديات'}</span>
                      <ArrowLeft size={16} />
                    </div>
                  </div>

                  {/* 1v1 PvP Card */}
                  {onOpenOneVOne && (
                    <div className="mode-card mode-card-pvp" onClick={onOpenOneVOne}>
                      <div className="mode-card-glow" />
                      <div className="mode-card-header">
                        <span className="mode-tag tag-pvp">PvP CHALLENGE</span>
                        <div className="pvp-live">
                          <span className="pvp-live-dot" />
                          <span>LIVE</span>
                        </div>
                      </div>
                      <div className="mode-card-body">
                        <div className="pvp-showcase">
                          <div className="pvp-icon-ring">
                            <Swords size={38} />
                          </div>
                          <div className="pvp-text">
                            <h3>{t.dashboard.oneVOneTitle}</h3>
                            <p>{t.dashboard.oneVOneDesc}</p>
                          </div>
                        </div>
                        <div className="pvp-pills">
                          <span>{t.dashboard.oneVOnePill1}</span>
                          <span>{t.dashboard.oneVOnePill2}</span>
                          <span>{t.dashboard.oneVOnePill3}</span>
                        </div>
                      </div>
                      <div className="mode-card-footer">
                        <span>{t.dashboard.oneVOneCta}</span>
                        <ArrowLeft size={16} />
                      </div>
                    </div>
                  )}

                </div>
              )}
            </div>

            {/* ─── RIGHT: Sidebar ─── */}
            <aside className="dash-sidebar">
              <section className="sd-card sd-profile" onClick={onViewProfile}>
                <div className="sd-avatar-ring">
                  <span className="sd-avatar">{initial}</span>
                </div>
                <div className="sd-profile-info">
                  <span className="sd-name">{user.name || user.email}</span>
                  <span className="sd-level" style={{ color: level.color }}>{level.name}</span>
                </div>
                <Shield size={16} className="sd-shield" />
              </section>

              <section className="sd-card sd-progress">
                <div className="sd-progress-header">
                  <span className="sd-label">{t.dashboard.levelLabel}</span>
                  <span className="sd-level-badge" style={{ color: level.color, background: `${level.color}15` }}>
                    {level.name}
                  </span>
                </div>
                <div className="sd-bar-track">
                  <div className="sd-bar-fill" style={{ width: `${xpProgress}%`, background: `linear-gradient(90deg, ${level.color}, #a7f3d0)` }} />
                </div>
                <div className="sd-bar-labels">
                  <span>{xp.toLocaleString()} XP</span>
                  <span>{nextLevelXp.toLocaleString()} XP</span>
                </div>
              </section>

              <section className="sd-card sd-tip">
                <div className="sd-tip-header">
                  <div className="sd-tip-icon">
                    <Lightbulb size={16} />
                  </div>
                  <h3>{t.dashboard.tipTitle}</h3>
                </div>
                <p>{t.dashboard.tipBody}</p>
              </section>
            </aside>

          </div>
        </div>
      </main>
    </div>
  );
};
