import React, { useState, useEffect, useMemo } from 'react';
import { ArrowRight, Target, Flame, Users, TrendingUp, Crown, Medal } from 'lucide-react';
import { LeaderboardHeroIcon, SparkleIcon } from './TeamIcons';
import { useI18n } from '../i18n/I18nContext';
import { LanguageSwitcher } from './LanguageSwitcher';
import { Sidebar } from './Sidebar';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8090/api';

interface LeaderboardUser {
  rank: number;
  id: string;
  name: string;
  xp: number;
  completed_trainings: number;
  avatar_url?: string;
}

interface LeaderboardProps {
  currentUser?: { id: string; name: string; email: string } | null;
  onBack: () => void;
}

interface Level {
  name: string;
  minXp: number;
  color: string;
  gradient: string;
  bg: string;
  icon: string;
}

function getLevel(xp: number, levels: Level[]): Level {
  let level = levels[0];
  for (const l of levels) {
    if (xp >= l.minXp) level = l;
  }
  return level;
}

function getNextLevelMin(xp: number, thresholds: number[]): number {
  for (const t of thresholds) {
    if (xp < t) return t;
  }
  return thresholds[thresholds.length - 1];
}

function getInitial(name: string) {
  return (name || '?').charAt(0).toUpperCase();
}

// Generate a consistent gradient based on the user id
function getAvatarGradient(id: string): string {
  const gradients = [
    'linear-gradient(135deg, #6366f1, #8b5cf6)',
    'linear-gradient(135deg, #ec4899, #f43f5e)',
    'linear-gradient(135deg, #06b6d4, #3b82f6)',
    'linear-gradient(135deg, #10b981, #059669)',
    'linear-gradient(135deg, #f59e0b, #ef4444)',
    'linear-gradient(135deg, #8b5cf6, #ec4899)',
    'linear-gradient(135deg, #14b8a6, #06b6d4)',
  ];
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return gradients[Math.abs(hash) % gradients.length];
}

type FilterTab = 'all' | 'beginner' | 'advanced' | 'expert' | 'master';

export const Leaderboard: React.FC<LeaderboardProps> = ({ currentUser, onBack }) => {
  const { t } = useI18n();
  const LEVELS: Level[] = [
    { name: t.levels.beginner, minXp: 0, color: '#10b981', gradient: 'linear-gradient(135deg, #10b981, #059669)', bg: 'rgba(16, 185, 129, 0.12)', icon: '🟢' },
    { name: t.levels.advanced, minXp: 200, color: '#f59e0b', gradient: 'linear-gradient(135deg, #f59e0b, #d97706)', bg: 'rgba(245, 158, 11, 0.12)', icon: '🟡' },
    { name: t.levels.expert, minXp: 600, color: '#ef4444', gradient: 'linear-gradient(135deg, #ef4444, #dc2626)', bg: 'rgba(239, 68, 68, 0.12)', icon: '🔴' },
    { name: t.levels.master, minXp: 1500, color: '#8b5cf6', gradient: 'linear-gradient(135deg, #8b5cf6, #6d28d9)', bg: 'rgba(139, 92, 246, 0.12)', icon: '👑' },
  ];
  const LEVEL_THRESHOLDS = [0, 200, 600, 1500];
  const FILTERS: { key: FilterTab; label: string; minXp: number; maxXp?: number }[] = [
    { key: 'all', label: t.leaderboard.filters.all, minXp: 0 },
    { key: 'beginner', label: t.leaderboard.filters.beginner, minXp: 0, maxXp: 199 },
    { key: 'advanced', label: t.leaderboard.filters.advanced, minXp: 200, maxXp: 599 },
    { key: 'expert', label: t.leaderboard.filters.expert, minXp: 600, maxXp: 1499 },
    { key: 'master', label: t.leaderboard.filters.master, minXp: 1500 },
  ];
  const [users, setUsers] = useState<LeaderboardUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        const res = await fetch(`${API_URL}/leaderboard?limit=100`);
        const data = await res.json();
        if (res.ok && data.users) {
          setUsers(data.users);
        } else {
          setError(t.leaderboard.loadError);
        }
      } catch {
        setError(t.leaderboard.networkError);
      } finally {
        setLoading(false);
      }
    };
    fetchLeaderboard();
  }, [t.leaderboard.loadError, t.leaderboard.networkError]);

  const stats = useMemo(() => {
    if (users.length === 0) return { total: 0, topXp: 0, totalXp: 0, avgXp: 0 };
    const totalXp = users.reduce((sum, u) => sum + u.xp, 0);
    return {
      total: users.length,
      topXp: users[0]?.xp || 0,
      totalXp,
      avgXp: Math.round(totalXp / users.length),
    };
  }, [users]);

  const filteredUsers = useMemo(() => {
    const filter = FILTERS.find(f => f.key === activeFilter)!;
    return users.filter(u => {
      if (filter.maxXp !== undefined) {
        return u.xp >= filter.minXp && u.xp <= filter.maxXp;
      }
      return u.xp >= filter.minXp;
    });
  }, [users, activeFilter]);

  const top3 = filteredUsers.slice(0, 3);
  const rest = filteredUsers.slice(3);
  const showPodium = filteredUsers.length >= 3;
  const showAsListOnly = filteredUsers.length > 0 && filteredUsers.length < 3;
  const currentUserInList = currentUser ? filteredUsers.find(u => u.id === currentUser.id) : null;

  return (
    <div className="dash-page lb-page">
      {/* Animated background orbs */}
      <div className="lb-bg-orb lb-bg-orb-1" />
      <div className="lb-bg-orb lb-bg-orb-2" />
      <div className="lb-bg-orb lb-bg-orb-3" />

      <Sidebar
        onLogoClick={(e) => { e.preventDefault(); onBack(); }}
        bottom={
          <>
            <LanguageSwitcher />
            <button onClick={onBack} className="path-back-link">
              <ArrowRight size={18} />
            </button>
          </>
        }
      />

      <main className="dash-main">
        <div className="dash-container">
          <section className="lb-hero-v2">
            <div className="lb-hero-icon-v2">
              <LeaderboardHeroIcon size={88} />
            </div>
            <div className="lb-hero-content-v2">
              <span className="lb-hero-tag">
                <SparkleIcon size={12} />
                <span>{t.leaderboard.heroTag}</span>
              </span>
              <h1>{t.leaderboard.heroTitle}</h1>
              <p>{t.leaderboard.heroSub}</p>
            </div>
            {!loading && users.length > 0 && (
              <div className="lb-stats-cards">
                <div className="lb-stat-card-v2">
                  <div className="lb-stat-icon-v2" style={{ background: 'rgba(99, 102, 241, 0.12)', color: '#a5b4fc' }}>
                    <Users size={16} />
                  </div>
                  <div className="lb-stat-info">
                    <span className="lb-stat-value-v2">{stats.total}</span>
                    <span className="lb-stat-label-v2">{t.leaderboard.statTotal}</span>
                  </div>
                </div>
                <div className="lb-stat-card-v2">
                  <div className="lb-stat-icon-v2" style={{ background: 'rgba(251, 191, 36, 0.12)', color: '#fbbf24' }}>
                    <TrendingUp size={16} />
                  </div>
                  <div className="lb-stat-info">
                    <span className="lb-stat-value-v2">{stats.topXp.toLocaleString()}</span>
                    <span className="lb-stat-label-v2">{t.leaderboard.statTopXp}</span>
                  </div>
                </div>
                <div className="lb-stat-card-v2">
                  <div className="lb-stat-icon-v2" style={{ background: 'rgba(236, 72, 153, 0.12)', color: '#f472b6' }}>
                    <Flame size={16} />
                  </div>
                  <div className="lb-stat-info">
                    <span className="lb-stat-value-v2">{stats.totalXp.toLocaleString()}</span>
                    <span className="lb-stat-label-v2">{t.leaderboard.statTotalXp}</span>
                  </div>
                </div>
              </div>
            )}
          </section>

          {currentUser && !loading && currentUserInList && (
            <section className="lb-my-rank-v2">
              <div className="lb-my-rank-tag">
                <Target size={14} />
                <span>{t.leaderboard.youAreHere}</span>
              </div>
              <div className="lb-my-rank-info-v2">
                <span className="lb-my-rank-label-v2">{t.leaderboard.rankLabel}</span>
                <span className="lb-my-rank-value-v2">#{currentUserInList.rank}</span>
              </div>
              <div className="lb-my-rank-divider-v2" />
              <div className="lb-my-rank-info-v2">
                <span className="lb-my-rank-label-v2">XP</span>
                <span className="lb-my-rank-value-v2">{currentUserInList.xp.toLocaleString()}</span>
              </div>
              <div className="lb-my-rank-divider-v2" />
              <div className="lb-my-rank-info-v2">
                <span className="lb-my-rank-label-v2">{t.leaderboard.training}</span>
                <span className="lb-my-rank-value-v2">{currentUserInList.completed_trainings}</span>
              </div>
            </section>
          )}

          {/* Filter tabs */}
          {!loading && users.length > 0 && (
            <div className="lb-filters">
              {FILTERS.map(f => {
                const maxXp = f.maxXp;
                const count = maxXp !== undefined
                  ? users.filter(u => u.xp >= f.minXp && u.xp <= maxXp).length
                  : users.filter(u => u.xp >= f.minXp).length;
                if (count === 0 && f.key !== 'all') return null;
                return (
                  <button
                    key={f.key}
                    className={`lb-filter-tab ${activeFilter === f.key ? 'active' : ''}`}
                    onClick={() => setActiveFilter(f.key)}
                  >
                    {f.label}
                    <span className="lb-filter-count">{count}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Loading / Error / Empty */}
          {loading ? (
            <div className="lb-skeleton-grid">
              <div className="lb-skeleton-card lb-skeleton-hero" />
              <div className="lb-skeleton-list">
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="lb-skeleton-item" />
                ))}
              </div>
            </div>
          ) : error ? (
            <div className="lb-empty-v2">
              <div className="lb-empty-icon">⚠️</div>
              <h3>{error}</h3>
              <p>{t.leaderboard.retryLoad}</p>
            </div>
          ) : users.length === 0 ? (
            <div className="lb-empty-v2">
              <div className="lb-empty-illust">
                <SparkleIcon size={64} />
              </div>
              <h3>{t.leaderboard.emptyTitle}</h3>
              <p>{t.leaderboard.emptySub}</p>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="lb-empty-v2">
              <div className="lb-empty-illust">
                <SparkleIcon size={64} />
              </div>
              <h3>{t.leaderboard.filterEmptyTitle}</h3>
              <p>{t.leaderboard.filterEmptySub}</p>
            </div>
          ) : (
            <>
              {/* Podium only when 3+ users in current filter */}
              {showPodium && (
                <section className="lb-podium-v2">
                  {/* 2nd place */}
                  <div className="lb-podium-card lb-podium-card-2">
                    <div className="lb-podium-medal">
                      <Medal size={14} />
                      <span>2</span>
                    </div>
                    <div className="lb-podium-avatar-v2" style={{ width: 68, height: 68, borderRadius: '50%', background: top3[1].avatar_url ? 'transparent' : getAvatarGradient(top3[1].id), display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                      {top3[1].avatar_url ? <img src={top3[1].avatar_url} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : getInitial(top3[1].name)}
                    </div>
                    <h3 className="lb-podium-name-v2">{top3[1].name}</h3>
                    <div className="lb-podium-xp-v2">
                      <span className="lb-podium-xp-value">{top3[1].xp.toLocaleString()}</span>
                      <span className="lb-podium-xp-label">XP</span>
                    </div>
                    <div className="lb-podium-stats">
                      <div className="lb-podium-stat">
                        <span className="lb-podium-stat-value">{top3[1].completed_trainings}</span>
                        <span className="lb-podium-stat-label">{t.leaderboard.training}</span>
                      </div>
                    </div>
                    <div className="lb-podium-bar-v2 lb-podium-bar-2-v2" />
                  </div>

                  <div className="lb-podium-card lb-podium-card-1">
                    <div className="lb-podium-crown-v2">
                      <Crown size={18} />
                    </div>
                    <div className="lb-podium-medal lb-podium-medal-1">
                      <Crown size={14} />
                      <span>1</span>
                    </div>
                    <div className="lb-podium-avatar-v2 lb-podium-avatar-1" style={{ width: 84, height: 84, borderRadius: '50%', background: top3[0].avatar_url ? 'transparent' : getAvatarGradient(top3[0].id), boxShadow: top3[0].avatar_url ? '0 0 32px rgba(251, 191, 36, 0.5)' : '0 0 32px rgba(251, 191, 36, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                      {top3[0].avatar_url ? <img src={top3[0].avatar_url} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : getInitial(top3[0].name)}
                    </div>
                    <h3 className="lb-podium-name-v2">{top3[0].name}</h3>
                    <div className="lb-podium-xp-v2">
                      <span className="lb-podium-xp-value lb-podium-xp-gold">{top3[0].xp.toLocaleString()}</span>
                      <span className="lb-podium-xp-label">XP</span>
                    </div>
                    <div className="lb-podium-stats">
                      <div className="lb-podium-stat">
                        <span className="lb-podium-stat-value">{top3[0].completed_trainings}</span>
                        <span className="lb-podium-stat-label">{t.leaderboard.training}</span>
                      </div>
                    </div>
                    <div className="lb-podium-bar-v2 lb-podium-bar-1-v2" />
                  </div>

                  <div className="lb-podium-card lb-podium-card-3">
                    <div className="lb-podium-medal lb-podium-medal-3">
                      <Medal size={14} />
                      <span>3</span>
                    </div>
                    <div className="lb-podium-avatar-v2" style={{ width: 68, height: 68, borderRadius: '50%', background: top3[2].avatar_url ? 'transparent' : getAvatarGradient(top3[2].id), display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                      {top3[2].avatar_url ? <img src={top3[2].avatar_url} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : getInitial(top3[2].name)}
                    </div>
                    <h3 className="lb-podium-name-v2">{top3[2].name}</h3>
                    <div className="lb-podium-xp-v2">
                      <span className="lb-podium-xp-value">{top3[2].xp.toLocaleString()}</span>
                      <span className="lb-podium-xp-label">XP</span>
                    </div>
                    <div className="lb-podium-stats">
                      <div className="lb-podium-stat">
                        <span className="lb-podium-stat-value">{top3[2].completed_trainings}</span>
                        <span className="lb-podium-stat-label">{t.leaderboard.training}</span>
                      </div>
                    </div>
                    <div className="lb-podium-bar-v2 lb-podium-bar-3-v2" />
                  </div>
                </section>
              )}

              {/* List (rest after podium, or all users if less than 3) */}
              {(rest.length > 0 || showAsListOnly) && (
                <section className="lb-list-section-v2">
                  <div className="lb-list-header">
                    <h2>{showAsListOnly ? t.leaderboard.listHeaderSmall : t.leaderboard.listHeader}</h2>
                    <span className="lb-list-count">
                      {showAsListOnly ? filteredUsers.length : rest.length} {t.leaderboard.playerCount}
                    </span>
                  </div>
                  <div className="lb-list-v2">
                    {(showAsListOnly ? filteredUsers : rest).map((user, idx) => {
                      const level = getLevel(user.xp, LEVELS);
                      const nextMin = getNextLevelMin(user.xp, LEVEL_THRESHOLDS);
                      const progress = nextMin > 0 ? Math.min((user.xp / nextMin) * 100, 100) : 100;
                      const isMe = currentUser?.id === user.id;
                      return (
                        <div
                          key={user.id}
                          className={`lb-list-item-v2 ${isMe ? 'lb-list-item-me' : ''}`}
                          style={{ animationDelay: `${idx * 40}ms` }}
                        >
                          <div className="lb-list-rank-v2">#{user.rank}</div>
                          <div className="lb-list-avatar-v2" style={{ width: 44, height: 44, borderRadius: '50%', background: user.avatar_url ? 'transparent' : getAvatarGradient(user.id), display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                            {user.avatar_url ? <img src={user.avatar_url} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : getInitial(user.name)}
                            {isMe && <span className="lb-list-online-dot" />}
                          </div>
                          <div className="lb-list-info-v2">
                            <div className="lb-list-name-row">
                              <span className="lb-list-name-v2">{user.name}</span>
                              {isMe && <span className="lb-list-me-pill">{t.leaderboard.me}</span>}
                              <span className="lb-list-level-pill" style={{ background: level.bg, color: level.color, borderColor: level.color + '40' }}>
                                {level.name}
                              </span>
                            </div>
                            <div className="lb-list-progress-row">
                              <div className="lb-list-progress-track">
                                <div className="lb-list-progress-fill" style={{ width: `${progress}%`, background: level.gradient }} />
                              </div>
                              <span className="lb-list-progress-label">
                                {user.xp.toLocaleString()} / {nextMin.toLocaleString()} XP
                              </span>
                            </div>
                          </div>
                          <div className="lb-list-xp-block">
                            <span className="lb-list-trainings">{user.completed_trainings} {t.leaderboard.trainings}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
};
