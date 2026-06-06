import { useEffect, useRef, useState } from 'react';
import { Copy, Check, Swords, Users, Shield, Crosshair, ChevronLeft, Loader2, Shuffle, ListChecks, X, ArrowRight, Lock, Clock } from 'lucide-react';
import { BlueTeamIcon, RedTeamIcon } from './TeamIcons';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8090/api';

// Configurable match length — must match backend MAIN_DURATION_OPTIONS
const DURATION_OPTIONS: { minutes: number; label: string; seconds: number }[] = [
  { minutes: 5,  label: '5 دقائق',  seconds: 300 },
  { minutes: 10, label: '10 دقائق', seconds: 600 },
  { minutes: 15, label: '15 دقيقة', seconds: 900 },
  { minutes: 20, label: '20 دقيقة', seconds: 1200 },
  { minutes: 25, label: '25 دقيقة', seconds: 1500 },
  { minutes: 30, label: '30 دقيقة', seconds: 1800 },
];

interface User {
  id: string;
  name: string;
  email: string;
}

interface Room {
  id: string;
  code: string;
  team_role: 'red' | 'blue';
  status: 'open' | 'closed' | 'abandoned';
  challenge_source: string;
  owner_user_id: string;
  main_duration_s?: number;
}

interface Player {
  id: string;
  user_id: string;
  slot: 1 | 2;
  display_name: string;
  is_ready: boolean;
}

// Reuse the existing DBChallenge shape (same as Dashboard.tsx)
interface DBChallenge {
  id: string;
  title: string;
  module: string;
  category: string;
  path: string;
  difficulty: string;
  xpReward: number;
}

interface OneVOneLobbyProps {
  user: User;
  onEnterArena: (code: string, room: Room) => void;
  onBack: () => void;
}

export const OneVOneLobby: React.FC<OneVOneLobbyProps> = ({ user, onEnterArena, onBack }) => {
  // Mode: 'home' = pick create/join; 'create' = picking options; 'join' = entering code
  const [mode, setMode] = useState<'home' | 'create' | 'join'>('home');

  // Create-flow
  const [teamRole, setTeamRole] = useState<'red' | 'blue'>('red');
  const [challengeMode, setChallengeMode] = useState<'random' | 'manual'>('random');
  const [pickedChallenge, setPickedChallenge] = useState<DBChallenge | null>(null);
  // Selected match length (minutes). Mirrors backend MAIN_DURATION_OPTIONS.
  const [durationMin, setDurationMin] = useState<number>(10);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // Manual-challenge browser (filtered by team_role, like the Dashboard)
  const [availableChallenges, setAvailableChallenges] = useState<DBChallenge[]>([]);
  const [loadingChallenges, setLoadingChallenges] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  // Join-flow
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');

  // After creation: show the room card with code + waiting state
  const [createdRoom, setCreatedRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState('');
  const eventSourceRef = useRef<EventSource | null>(null);

  // ---- After creation: poll players + subscribe to SSE for live updates ----
  useEffect(() => {
    if (!createdRoom) return;
    const code = createdRoom.code;
    let cancelled = false;

    const refreshPlayers = async () => {
      try {
        const res = await fetch(`${API_URL}/onevone/rooms/${code}`);
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setPlayers(data.players || []);
      } catch { /* ignore */ }
    };
    refreshPlayers();
    const interval = setInterval(refreshPlayers, 2500);

    // SSE for instant join notification
    try {
      const es = new EventSource(`${API_URL}/onevone/rooms/${code}/stream`);
      eventSourceRef.current = es;
      es.onmessage = (e) => {
        try {
          const evt = JSON.parse(e.data);
          if (evt.type === 'player_joined' || evt.type === 'players') {
            refreshPlayers();
          }
          if (evt.type === 'match_started' && evt.matchId) {
            // owner proceeds to arena
            onEnterArena(code, createdRoom);
          }
        } catch { /* ignore */ }
      };
      es.onerror = () => { /* browser auto-reconnects */ };
    } catch { /* SSE may be blocked — fallback to polling is fine */ }

    return () => {
      cancelled = true;
      clearInterval(interval);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [createdRoom, onEnterArena]);

  // ---- Load challenges for the selected team whenever it changes
  //      (only used by the manual picker; reuses /api/training/list) ----
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoadingChallenges(true);
      setPickedChallenge(null);
      setActiveCategory(null);
      try {
        const res = await fetch(`${API_URL}/training/list?team_role=${teamRole}&limit=1000`);
        const data = await res.json();
        if (!cancelled) {
          setAvailableChallenges(Array.isArray(data.challenges) ? data.challenges : []);
        }
      } catch {
        if (!cancelled) setAvailableChallenges([]);
      } finally {
        if (!cancelled) setLoadingChallenges(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [teamRole]);

  const handleCreate = async () => {
    setCreating(true);
    setCreateError('');
    try {
      const challengeId = pickedChallenge?.id ? pickedChallenge.id.trim() : '';
      // Resolve the selected duration in seconds (server validates against MAIN_DURATION_OPTIONS)
      const durationOpt = DURATION_OPTIONS.find((o) => o.minutes === durationMin);
      const mainDurationS = durationOpt ? durationOpt.seconds : 600;
      const res = await fetch(`${API_URL}/onevone/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          displayName: user.name || user.email,
          teamRole,
          challengeSource: challengeMode === 'random' ? 'random' : `manual:${challengeId}`,
          mainDurationS,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'فشل إنشاء الغرفة');
      }
      const data = await res.json();
      setCreatedRoom(data.room);
    } catch (e) {
      const err = e as { message?: string };
      setCreateError(err?.message || 'حدث خطأ غير متوقع');
    } finally {
      setCreating(false);
    }
  };

  const handleJoin = async () => {
    if (!joinCode.trim()) {
      setJoinError('أدخل رمز الغرفة أولاً');
      return;
    }
    setJoining(true);
    setJoinError('');
    try {
      const res = await fetch(`${API_URL}/onevone/rooms/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: joinCode.trim().toUpperCase(),
          userId: user.id,
          displayName: user.name || user.email,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'فشل الانضمام للغرفة');
      }
      const data = await res.json();
      onEnterArena(data.room.code, data.room);
    } catch (e) {
      const err = e as { message?: string };
      setJoinError(err?.message || 'حدث خطأ غير متوقع');
    } finally {
      setJoining(false);
    }
  };

  const handleStartMatch = async () => {
    if (!createdRoom) return;
    setStarting(true);
    setStartError('');
    try {
      const res = await fetch(`${API_URL}/onevone/rooms/${createdRoom.code}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'فشل بدء المباراة');
      }
      // SSE will notify; but also navigate proactively
      onEnterArena(createdRoom.code, createdRoom);
    } catch (e) {
      const err = e as { message?: string };
      setStartError(err?.message || 'حدث خطأ غير متوقع');
    } finally {
      setStarting(false);
    }
  };

  const handleCopy = async () => {
    if (!createdRoom) return;
    try {
      await navigator.clipboard.writeText(createdRoom.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };

  const handleLeaveCreated = async () => {
    if (!createdRoom) return;
    try {
      await fetch(`${API_URL}/onevone/rooms/${createdRoom.code}/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });
    } catch { /* ignore */ }
    setCreatedRoom(null);
    setPlayers([]);
    setMode('home');
  };

  // ---- The "Room created" view (waiting for player 2) ----
  if (createdRoom) {
    const isOwner = strEq(createdRoom.owner_user_id, user.id);
    const teamColor = createdRoom.team_role === 'red' ? '#ef4444' : '#3b82f6';
    const opponentJoined = players.length >= 2;
    return (
      <div className="onevone-page">
        <header className="dash-header">
          <div className="dash-header-inner">
            <a href="#" className="dash-logo">CyberArena</a>
            <div className="dash-header-right">
              <span className="onevone-mode-pill" style={{ borderColor: `${teamColor}55`, color: teamColor }}>
                {createdRoom.team_role === 'red' ? <><Crosshair size={13} /> الفريق الأحمر</> : <><Shield size={13} /> الفريق الأزرق</>}
              </span>
              <div className="dash-user-badge">
                <div className="dash-avatar">{(user.name || user.email).charAt(0)}</div>
                <div className="dash-user-info">
                  <span className="dash-name">{user.name || user.email}</span>
                </div>
              </div>
              <button onClick={handleLeaveCreated} className="dash-logout">إلغاء</button>
            </div>
          </div>
        </header>

        <main className="dash-main">
          <div className="dash-container" style={{ maxWidth: 720 }}>
            <section className="onevone-room-card">
              <div className="onevone-room-head">
                <Swords size={28} style={{ color: teamColor }} />
                <div>
                  <h1 style={{ margin: 0, fontSize: 22, color: '#f3f1ec' }}>غرفة 1 ضد 1</h1>
                  <p style={{ margin: 0, fontSize: 13, color: 'rgba(243,241,236,0.55)' }}>
                    شارك الرمز مع خصمكِ ليدخل نفس التحدي
                  </p>
                </div>
              </div>

              <div className="onevone-code-block">
                <span className="onevone-code-label">رمز الغرفة</span>
                <div className="onevone-code-row">
                  <code className="onevone-code">{createdRoom.code}</code>
                  <button className="onevone-copy-btn" onClick={handleCopy}>
                    {copied ? <><Check size={14} /> تم النسخ</> : <><Copy size={14} /> نسخ</>}
                  </button>
                </div>
                <span className="onevone-code-hint">
                  {createdRoom.challenge_source === 'random'
                    ? 'سيتم اختيار التحدي بشكل عشوائي عند البدء'
                    : `تحدي يدوي: ${createdRoom.challenge_source.split(':')[1] || '—'}`}
                  {createdRoom.main_duration_s
                    ? ` • مدة التحدي: ${DURATION_OPTIONS.find((o) => o.seconds === createdRoom.main_duration_s)?.label || `${createdRoom.main_duration_s / 60} دقيقة`}`
                    : ''}
                </span>
              </div>

              <div className="onevone-players">
                <div className="onevone-players-head">
                  <Users size={16} />
                  <span>اللاعبون ({players.length}/2)</span>
                </div>
                <div className="onevone-player-row">
                  <div className={`onevone-player ${players[0] ? 'is-ready' : 'is-empty'}`}>
                    <div className="onevone-player-dot" />
                    <div>
                      <strong>{players[0]?.display_name || 'في انتظار المالك...'}</strong>
                      <span>مالك الغرفة • {createdRoom.team_role === 'red' ? 'أحمر' : 'أزرق'}</span>
                    </div>
                  </div>
                  <div className="onevone-vs">ضد</div>
                  <div className={`onevone-player ${players[1] ? 'is-ready' : 'is-empty'}`}>
                    <div className="onevone-player-dot" />
                    <div>
                      <strong>{players[1]?.display_name || 'في انتظار خصم...'}</strong>
                      <span>الخصم • {createdRoom.team_role === 'red' ? 'أحمر' : 'أزرق'}</span>
                    </div>
                  </div>
                </div>
              </div>

              {isOwner && (
                <button
                  className="onevone-start-btn"
                  onClick={handleStartMatch}
                  disabled={!opponentJoined || starting}
                  style={{ '--btn-accent': teamColor } as React.CSSProperties}
                >
                  {starting ? <><Loader2 size={16} className="onevone-spin" /> جاري البدء...</>
                    : opponentJoined ? <><Swords size={16} /> ابدأ المباراة</>
                    : <span>في انتظار انضمام الخصم...</span>}
                </button>
              )}

              {startError && <div className="onevone-error">{startError}</div>}

              {!isOwner && (
                <div className="onevone-waiting-note">
                  في انتظار مالك الغرفة لبدء المباراة...
                </div>
              )}
            </section>
          </div>
        </main>
      </div>
    );
  }

  // ---- The home (create/join picker) ----
  return (
    <div className="onevone-page">
      <header className="dash-header">
        <div className="dash-header-inner">
          <a href="#" className="dash-logo">CyberArena</a>
          <div className="dash-header-right">
            <button onClick={onBack} className="dash-back-pill">
              <ChevronLeft size={14} /> العودة
            </button>
            <div className="dash-user-badge">
              <div className="dash-avatar">{(user.name || user.email).charAt(0)}</div>
              <div className="dash-user-info">
                <span className="dash-name">{user.name || user.email}</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="dash-main">
        <div className="dash-container" style={{ maxWidth: 880 }}>
          <section className="onevone-hero">
            <div className="onevone-hero-icon"><Swords size={36} /></div>
            <h1>وضع 1 ضد 1</h1>
            <p>تحدَّ خصمك على نفس السيناريو في الوقت الفعلي. من ينهي التحدي أولاً يفوز.</p>
          </section>

          {mode === 'home' && (
            <section className="onevone-pick-grid">
              <button className="onevone-pick-card" onClick={() => setMode('create')}>
                <Swords size={28} />
                <h3>إنشاء غرفة</h3>
                <p>اختر فريقك ونمط التحدي وشارك الرمز مع خصمك.</p>
              </button>
              <button className="onevone-pick-card" onClick={() => setMode('join')}>
                <Users size={28} />
                <h3>الانضمام برمز</h3>
                <p>أدخل رمز الغرفة الذي أعطاك إياه خصمك.</p>
              </button>
            </section>
          )}

          {mode === 'create' && (
            <section className="onevone-form-card">
              <div className="onevone-form-head">
                <h2>إعدادات الغرفة</h2>
                <button className="onevone-icon-btn" onClick={() => { setMode('home'); setCreateError(''); }}>
                  <X size={16} />
                </button>
              </div>

              <div className="onevone-field">
                <label>فريقك</label>
                <div className="onevone-team-pick">
                  <button
                    type="button"
                    className={`onevone-team-card ${teamRole === 'red' ? 'is-active' : ''}`}
                    onClick={() => setTeamRole('red')}
                    style={{ '--team-accent': '#ef4444', '--team-accent-soft': 'rgba(239,68,68,0.08)' } as React.CSSProperties}
                  >
                    <RedTeamIcon size={44} />
                    <strong>الفريق الأحمر</strong>
                    <span>مهاجم — استخرج العلم أولاً</span>
                  </button>
                  <button
                    type="button"
                    className={`onevone-team-card ${teamRole === 'blue' ? 'is-active' : ''}`}
                    onClick={() => setTeamRole('blue')}
                    style={{ '--team-accent': '#3b82f6', '--team-accent-soft': 'rgba(59,130,246,0.08)' } as React.CSSProperties}
                  >
                    <BlueTeamIcon size={44} />
                    <strong>الفريق الأزرق</strong>
                    <span>مدافع — أصلح الثغرة أولاً</span>
                  </button>
                </div>
                <small className="onevone-hint">سيُلزم خصمك بنفس الفريق عند الانضمام.</small>
              </div>

              <div className="onevone-field">
                <label>مدة التحدي</label>
                <div className="onevone-duration-pick">
                  {DURATION_OPTIONS.map((opt) => {
                    const isActive = durationMin === opt.minutes;
                    return (
                      <button
                        key={opt.minutes}
                        type="button"
                        className={`onevone-duration-btn ${isActive ? 'is-active' : ''}`}
                        onClick={() => setDurationMin(opt.minutes)}
                        style={{
                          '--btn-accent': teamRole === 'red' ? '#ef4444' : '#3b82f6',
                        } as React.CSSProperties}
                      >
                        <Clock size={14} />
                        <strong className="onevone-duration-value">{opt.minutes}</strong>
                        <span className="onevone-duration-unit">{opt.label.replace(/^\d+\s/, '')}</span>
                      </button>
                    );
                  })}
                </div>
                <small className="onevone-hint">سيبدأ العد التنازلي فور بدء المباراة بناءً على الوقت المحدد، وينتهي التحدي عند انتهاء الوقت.</small>
              </div>

              <div className="onevone-field">
                <label>طريقة اختيار التحدي</label>
                <div className="onevone-source-pick">
                  <button
                    type="button"
                    className={`onevone-source-btn ${challengeMode === 'random' ? 'is-active' : ''}`}
                    onClick={() => { setChallengeMode('random'); setPickedChallenge(null); setActiveCategory(null); }}
                  >
                    <Shuffle size={16} /> تحدي عشوائي
                  </button>
                  <button
                    type="button"
                    className={`onevone-source-btn ${challengeMode === 'manual' ? 'is-active' : ''}`}
                    onClick={() => setChallengeMode('manual')}
                  >
                    <ListChecks size={16} /> تحدي محدد
                  </button>
                </div>

                {challengeMode === 'manual' && (
                  <ChallengeBrowser
                    challenges={availableChallenges}
                    loading={loadingChallenges}
                    teamRole={teamRole}
                    activeCategory={activeCategory}
                    setActiveCategory={setActiveCategory}
                    pickedChallenge={pickedChallenge}
                    setPickedChallenge={setPickedChallenge}
                  />
                )}

                <small className="onevone-hint">
                  سيتم جلب التحدي من قاعدة البيانات الحالية — لا حاجة لإنشاء محتوى جديد.
                </small>
              </div>

              {createError && <div className="onevone-error">{createError}</div>}

              <button
                className="onevone-primary-btn"
                onClick={handleCreate}
                disabled={creating || (challengeMode === 'manual' && !pickedChallenge?.id)}
                style={{ '--btn-accent': teamRole === 'red' ? '#ef4444' : '#3b82f6' } as React.CSSProperties}
              >
                {creating ? <><Loader2 size={16} className="onevone-spin" /> جاري الإنشاء...</> : <><Swords size={16} /> إنشاء الغرفة</>}
              </button>
            </section>
          )}

          {mode === 'join' && (
            <section className="onevone-form-card">
              <div className="onevone-form-head">
                <h2>الانضمام لغرفة</h2>
                <button className="onevone-icon-btn" onClick={() => { setMode('home'); setJoinError(''); }}>
                  <X size={16} />
                </button>
              </div>

              <div className="onevone-field">
                <label>رمز الغرفة</label>
                <input
                  className="onevone-input onevone-input-big"
                  type="text"
                  maxLength={6}
                  placeholder="ABC123"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  style={{ letterSpacing: '0.4em', textAlign: 'center', fontFamily: 'monospace' }}
                />
                <small className="onevone-hint">6 أحرف (بدون 0/1/O/I لتجنب اللبس)</small>
              </div>

              {joinError && <div className="onevone-error">{joinError}</div>}

              <button
                className="onevone-primary-btn"
                onClick={handleJoin}
                disabled={joining || joinCode.length < 4}
                style={{ '--btn-accent': '#10b981' } as React.CSSProperties}
              >
                {joining ? <><Loader2 size={16} className="onevone-spin" /> جاري الانضمام...</> : <><Users size={16} /> انضم للمباراة</>}
              </button>
            </section>
          )}
        </div>
      </main>
    </div>
  );
};

function strEq(a: string, b: string) {
  return String(a || '') === String(b || '');
}

// --------------------------------------------------------------------------- //
// ChallengeBrowser — shows categories for the selected team, then challenges
// inside the picked category. Mirrors the Dashboard's two-level UI.
// --------------------------------------------------------------------------- //
interface ChallengeBrowserProps {
  challenges: DBChallenge[];
  loading: boolean;
  teamRole: 'red' | 'blue';
  activeCategory: string | null;
  setActiveCategory: (cat: string | null) => void;
  pickedChallenge: DBChallenge | null;
  setPickedChallenge: (c: DBChallenge | null) => void;
}

const ChallengeBrowser: React.FC<ChallengeBrowserProps> = ({
  challenges, loading, teamRole, activeCategory, setActiveCategory, pickedChallenge, setPickedChallenge,
}) => {
  const teamColor = teamRole === 'red' ? '#ef4444' : '#3b82f6';

  // group by category (mirrors Dashboard.groupByCategory)
  const groups: { [cat: string]: DBChallenge[] } = {};
  challenges.forEach((c) => {
    const cat = c.category || 'تحديات عامة';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(c);
  });
  const categoryNames = Object.keys(groups).sort();

  if (loading) {
    return (
      <div className="onevone-browser">
        <div className="onevone-browser-loading">
          <Loader2 size={18} className="onevone-spin" /> جاري تحميل تحديات الفريق...
        </div>
      </div>
    );
  }

  if (categoryNames.length === 0) {
    return (
      <div className="onevone-browser">
        <div className="onevone-browser-empty">
          لا توجد تحديات متاحة لهذا الفريق حالياً.
        </div>
      </div>
    );
  }

  // Show challenge list for the selected category
  if (activeCategory) {
    const items = groups[activeCategory] || [];
    return (
      <div
        className="onevone-browser"
        style={{ '--team-accent': teamColor, '--team-accent-soft': `${teamColor}14` } as React.CSSProperties}
      >
        <button className="onevone-browser-back" onClick={() => { setActiveCategory(null); setPickedChallenge(null); }}>
          <ArrowRight size={14} />
          <span>العودة للأقسام</span>
        </button>
        <h4 className="onevone-browser-title" style={{ color: teamColor }}>{activeCategory}</h4>
        <div className="onevone-browser-list">
          {items.map((c) => {
            const isPicked = pickedChallenge?.id === c.id;
            return (
              <button
                key={c.id}
                className={`onevone-browser-item ${isPicked ? 'is-picked' : ''}`}
                onClick={() => setPickedChallenge(c)}
              >
                <div className="onevone-browser-item-info">
                  <span className="onevone-browser-item-title">{c.title}</span>
                  <span className="onevone-browser-item-meta">
                    {c.module} • <strong>{c.difficulty}</strong>
                  </span>
                </div>
                <div className="onevone-browser-item-reward">
                  {isPicked ? <Check size={16} /> : <span className="onevone-browser-xp">+{c.xpReward}</span>}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Show categories grid (first level)
  return (
    <div
      className="onevone-browser"
      style={{ '--team-accent': teamColor, '--team-accent-soft': `${teamColor}14` } as React.CSSProperties}
    >
      <h4 className="onevone-browser-label">اختر قسماً ({categoryNames.length})</h4>
      <div className="onevone-browser-cats">
        {categoryNames.map((cat) => (
          <button
            key={cat}
            className="onevone-browser-cat"
            onClick={() => setActiveCategory(cat)}
          >
            <div className="onevone-browser-cat-info">
              <Lock size={14} className="onevone-browser-cat-icon" />
              <span>{cat}</span>
            </div>
            <span className="onevone-browser-cat-count">{groups[cat].length}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
