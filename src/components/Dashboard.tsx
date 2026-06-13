import React, { useState, useEffect } from 'react';
import '../dstyle.css';
import './Dashboard.css';
import {
  Zap,
  GraduationCap,
  Trophy,
  Swords,
  ArrowLeft,
  Target,
  Shield,
  TrendingUp,
  Clock,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { BlueTeamIcon, RedTeamIcon } from './TeamIcons';
import { useI18n } from '../i18n/I18nContext';
import { LanguageSwitcher } from './LanguageSwitcher';
import { Sidebar } from './Sidebar';

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
    { name: t.levels.beginner, minXp: 0, color: '#10b981', rank: 'NEW RECRUIT' },
    { name: t.levels.advanced, minXp: 200, color: '#f59e0b', rank: 'CYBER OPERATIVE' },
    { name: t.levels.expert, minXp: 600, color: '#ef4444', rank: 'ELITE HACKER' },
    { name: t.levels.master, minXp: 1500, color: '#8b5cf6', rank: 'LEGEND' },
  ];
}

function getLevel(xp: number, levels: { name: string; minXp: number; color: string; rank: string }[]) {
  let level = levels[0];
  for (const l of levels) if (xp >= l.minXp) level = l;
  return level;
}

function getNextLevelXp(xp: number, levels: { minXp: number }[]) {
  for (const l of levels) if (xp < l.minXp) return l.minXp;
  return levels[levels.length - 1].minXp;
}

export const Dashboard: React.FC<DashboardProps> = ({ user, onViewProfile, onViewLeaderboard, onLogout, onOpenOneVOne, onOpenBlueVsRed }) => {
  const { t, lang } = useI18n();
  const LEVELS = useLevels(t);
  const [xp, setXp] = useState(0);
  const [completed, setCompleted] = useState(0);
  const [avatarUrl, setAvatarUrl] = useState('');
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
          setFetchError(t.dashboard.fetchError || 'يرجى تسجيل الدخول مرة أخرى');
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

        // Fetch avatar
        try {
          const avRes = await fetch(`${API_URL}/profile`, {
            headers: { 'Authorization': `Bearer ${token}` },
          });
          const avData = await avRes.json();
          if (avData.avatar_url) setAvatarUrl(avData.avatar_url);
        } catch {}
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

  const arrowIcon = lang === 'ar' ? <ChevronLeft size={16} /> : <ChevronRight size={16} />;

  return (
    <div className="dash-page">
      <div className="dash-orb orb-1" />
      <div className="dash-orb orb-2" />
      <div className="dash-orb orb-3" />

      <Sidebar
        bottom={
          <>
            <div className="dash-nav-status" title="SYSTEM ONLINE">
              <span className="dash-status-dot" />
            </div>
            <LanguageSwitcher />
            <div className="dash-user-badge" onClick={onViewProfile} title={`${user.name || user.email} — ${level.name}`}>
              {avatarUrl ? (
                <img src={avatarUrl} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
              ) : (
                <div className="dash-avatar">{initial}</div>
              )}
            </div>
            <button onClick={onLogout} className="dash-logout" />
          </>
        }
      >
        <button className="dash-nav-item active" title={t.dashboard.greeting || 'الرئيسية'}>
          <Shield size={18} />
        </button>
        <button className="dash-nav-item" onClick={onOpenBlueVsRed} title={t.dashboard.blueVsRedTitle || 'التدريب'}>
          <Zap size={18} />
        </button>
        {onOpenOneVOne && (
          <button className="dash-nav-item" onClick={onOpenOneVOne} title={t.dashboard.oneVOneTitle || '1v1'}>
            <Swords size={18} />
          </button>
        )}
        <button className="dash-nav-item" onClick={onViewLeaderboard} title={t.dashboard.leaderboard}>
          <Trophy size={18} />
        </button>
      </Sidebar>

      <main className="dash-main">
        <div className="dash-container">

          {fetchError && (
            <div className="dash-alert">{fetchError}</div>
          )}

          {loading ? (
            <div className="dash-loading">
              <div className="dash-loading-spinner" />
              <span>{t.dashboard.loading}</span>
            </div>
          ) : (
            <>
              {/* ───── Welcome Bar ───── */}
              <section className="db-welcome">
                <div className="db-welcome-left">
                  <div className="db-welcome-tag">
                    <span className="db-welcome-pulse" />
                    <span>SYSTEM ONLINE</span>
                  </div>
                  <h1 className="db-welcome-title">
                    {t.dashboard.greeting}، <span>{user.name}</span>
                  </h1>
                  <p className="db-welcome-sub">{t.dashboard.greetingSub}</p>
                </div>
                <div className="db-welcome-right">
                  <div className="db-rank-badge" style={{ borderColor: level.color }}>
                    <span className="db-rank-tag" style={{ background: level.color }}>{level.rank}</span>
                    <span className="db-rank-name" style={{ color: level.color }}>{level.name}</span>
                  </div>
                </div>
              </section>

              {/* ───── Stat Cards ───── */}
              <section className="db-stats">
                <div className="db-stat" onClick={onViewProfile}>
                  <div className="db-stat-icon" style={{ background: 'rgba(16,185,129,0.12)', color: '#10b981' }}>
                    <TrendingUp size={20} />
                  </div>
                  <div className="db-stat-info">
                    <span className="db-stat-value">{xp.toLocaleString()}</span>
                    <span className="db-stat-label">{t.dashboard.xpLabel}</span>
                  </div>
                  <div className="db-stat-glow" style={{ background: 'rgba(16,185,129,0.15)' }} />
                </div>
                <div className="db-stat" onClick={onViewProfile}>
                  <div className="db-stat-icon" style={{ background: 'rgba(139,92,246,0.12)', color: '#8b5cf6' }}>
                    <GraduationCap size={20} />
                  </div>
                  <div className="db-stat-info">
                    <span className="db-stat-value">{completed}</span>
                    <span className="db-stat-label">{t.dashboard.completedLabel}</span>
                  </div>
                  <div className="db-stat-glow" style={{ background: 'rgba(139,92,246,0.15)' }} />
                </div>
                <div className="db-stat db-stat-level" onClick={onViewProfile}>
                  <div className="db-stat-icon" style={{ background: `${level.color}12`, color: level.color }}>
                    <Target size={20} />
                  </div>
                  <div className="db-stat-info">
                    <div className="db-stat-level-header">
                      <span className="db-stat-level-name" style={{ color: level.color }}>{level.name}</span>
                      <span className="db-stat-level-xp">{xp.toLocaleString()} / {nextLevelXp.toLocaleString()}</span>
                    </div>
                    <div className="db-stat-bar">
                      <div className="db-stat-bar-fill" style={{ width: `${xpProgress}%`, background: `linear-gradient(90deg, ${level.color}, #a7f3d0)` }} />
                    </div>
                  </div>
                  <div className="db-stat-glow" style={{ background: `${level.color}15` }} />
                </div>
              </section>

              {/* ───── Main Grid ───── */}
              <div className="db-grid">

                {/* ─── LEFT: Modes ─── */}
                <div className="db-modes">

                  {/* Blue vs Red */}
                  <div className="db-mode db-mode-bvr" onClick={onOpenBlueVsRed}>
                    <div className="db-mode-bg" />
                    <div className="db-mode-top">
                      <span className="db-mode-tag">CAMP PRACTICE</span>
                      <span className="db-mode-featured">Featured</span>
                    </div>
                    <div className="db-mode-body">
                      <div className="db-mode-teams">
                        <div className="db-mode-team">
                          <BlueTeamIcon size={40} />
                          <h4>{t.dashboard.blueTitle}</h4>
                          <p>{t.dashboard.blueSubtitle}</p>
                        </div>
                        <div className="db-mode-vs">VS</div>
                        <div className="db-mode-team">
                          <RedTeamIcon size={40} />
                          <h4>{t.dashboard.redTitle}</h4>
                          <p>{t.dashboard.redSubtitle}</p>
                        </div>
                      </div>
                    </div>
                    <div className="db-mode-bottom">
                      <span>{t.dashboard.blueVsRedCta || 'استعرض التحديات'}</span>
                      {arrowIcon}
                    </div>
                  </div>

                  {/* 1v1 PvP */}
                  {onOpenOneVOne && (
                    <div className="db-mode db-mode-pvp" onClick={onOpenOneVOne}>
                      <div className="db-mode-bg" />
                      <div className="db-mode-top">
                        <span className="db-mode-tag db-mode-tag-pvp">PvP CHALLENGE</span>
                        <span className="db-mode-live">
                          <span className="db-mode-live-dot" />
                          LIVE
                        </span>
                      </div>
                      <div className="db-mode-body">
                        <div className="db-mode-pvp-header">
                          <div className="db-mode-pvp-icon">
                            <Swords size={32} />
                          </div>
                          <div className="db-mode-pvp-text">
                            <h3>{t.dashboard.oneVOneTitle}</h3>
                            <p>{t.dashboard.oneVOneDesc}</p>
                          </div>
                        </div>
                        <div className="db-mode-pills">
                          <span>{t.dashboard.oneVOnePill1}</span>
                          <span>{t.dashboard.oneVOnePill2}</span>
                          <span>{t.dashboard.oneVOnePill3}</span>
                        </div>
                      </div>
                      <div className="db-mode-bottom">
                        <span>{t.dashboard.oneVOneCta}</span>
                        {arrowIcon}
                      </div>
                    </div>
                  )}

                </div>

                {/* ─── RIGHT: Sidebar ─── */}
                <aside className="db-sidebar">

                    <div className="db-side-card db-side-profile" onClick={onViewProfile}>
                      <div className="db-side-profile-left">
                        {avatarUrl ? (
                          <img src={avatarUrl} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                        ) : (
                          <div className="db-side-avatar">{initial}</div>
                        )}
                        <div className="db-side-profile-info">
                          <span className="db-side-name">{user.name || user.email}</span>
                          <span className="db-side-level" style={{ color: level.color }}>{level.name}</span>
                        </div>
                      </div>
                      <Shield size={16} className="db-side-shield" />
                    </div>

                  <div className="db-side-card db-side-progress">
                    <div className="db-side-progress-top">
                      <span className="db-side-label">{t.dashboard.levelLabel}</span>
                      <span className="db-side-badge" style={{ color: level.color, background: `${level.color}18` }}>
                        {level.name}
                      </span>
                    </div>
                    <div className="db-side-bar">
                      <div className="db-side-bar-fill" style={{ width: `${xpProgress}%`, background: `linear-gradient(90deg, ${level.color}, #a7f3d0)` }} />
                    </div>
                    <div className="db-side-bar-labels">
                      <span>{xp.toLocaleString()} XP</span>
                      <span>{nextLevelXp.toLocaleString()} XP</span>
                    </div>
                  </div>

                  <div className="db-side-card db-side-tip">
                    <div className="db-side-tip-header">
                      <Clock size={16} className="db-side-tip-icon" />
                      <h3>{t.dashboard.tipTitle}</h3>
                    </div>
                    <p>{t.dashboard.tipBody}</p>
                  </div>

                </aside>

              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
};