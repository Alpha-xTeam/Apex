import { useEffect, useRef, useState } from 'react';
import { Copy, Check, Swords, Users, Shield, Crosshair, ChevronLeft, Loader2, Shuffle, ListChecks, X, ArrowRight, Lock, Clock } from 'lucide-react';
import { BlueTeamIcon, RedTeamIcon } from './TeamIcons';
import { useI18n } from '../i18n/I18nContext';
import { LanguageSwitcher } from './LanguageSwitcher';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8090/api';

// Configurable match length — must match backend MAIN_DURATION_OPTIONS
const DURATION_OPTIONS: { minutes: number; seconds: number }[] = [
  { minutes: 5,  seconds: 300 },
  { minutes: 10, seconds: 600 },
  { minutes: 15, seconds: 900 },
  { minutes: 20, seconds: 1200 },
  { minutes: 25, seconds: 1500 },
  { minutes: 30, seconds: 1800 },
];

const TEAM_META: Record<'red' | 'blue', { color: string; soft: string; icon: React.ComponentType<{ size?: number; className?: string }> }> = {
  red: {
    color: '#ef4444',
    soft: 'rgba(239, 68, 68, 0.12)',
    icon: Crosshair,
  },
  blue: {
    color: '#3b82f6',
    soft: 'rgba(59, 130, 246, 0.12)',
    icon: Shield,
  },
};

function getTeamMeta(teamRole: 'red' | 'blue') {
  return TEAM_META[teamRole];
}

function getInitial(name: string) {
  return (name || '?').trim().charAt(0).toUpperCase();
}

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
  const { t } = useI18n();
  const durationRangeLabel = `${DURATION_OPTIONS[0].minutes}–${DURATION_OPTIONS[DURATION_OPTIONS.length - 1].minutes} ${t.oneVOne.minutes}`;
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
  const teamMeta = getTeamMeta(teamRole);
  const selectedDurationLabel = `${durationMin} ${t.oneVOne.minutes}`;
  const selectedChallengeLabel = challengeMode === 'random' ? t.oneVOne.sourceRandom : t.oneVOne.sourceManual;

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
          setAvailableChallenges(Array.isArray(data.items) ? data.items : []);
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
        throw new Error(err.detail || t.oneVOne.createErr);
      }
      const data = await res.json();
      setCreatedRoom(data.room);
    } catch (e) {
      const err = e as { message?: string };
      setCreateError(err?.message || t.oneVOne.genericErr);
    } finally {
      setCreating(false);
    }
  };

  const handleJoin = async () => {
    if (!joinCode.trim()) {
      setJoinError(t.oneVOne.enterCode);
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
        throw new Error(err.detail || t.oneVOne.joinErr);
      }
      const data = await res.json();
      onEnterArena(data.room.code, data.room);
    } catch (e) {
      const err = e as { message?: string };
      setJoinError(err?.message || t.oneVOne.genericErr);
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
        throw new Error(err.detail || t.oneVOne.startErr);
      }
      // SSE will notify; but also navigate proactively
      onEnterArena(createdRoom.code, createdRoom);
    } catch (e) {
      const err = e as { message?: string };
      setStartError(err?.message || t.oneVOne.genericErr);
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
    const meta = getTeamMeta(createdRoom.team_role);
    const TeamIcon = meta.icon;
    const opponentJoined = players.length >= 2;
    const sourceLabel = createdRoom.challenge_source === 'random'
      ? t.oneVOne.randomHint
      : `${t.oneVOne.manualHint} ${createdRoom.challenge_source.split(':')[1] || t.oneVOne.categoryFallback}`;
    const durationLabel = createdRoom.main_duration_s
      ? `${t.oneVOne.matchDuration} ${Math.floor(createdRoom.main_duration_s / 60)} ${t.oneVOne.minute}`
      : '';
    const roomSubtitle = [sourceLabel, durationLabel].filter(Boolean).join(' • ');
    const playerOne = players[0];
    const playerTwo = players[1];

    return (
      <div className="onevone-page">
        <header className="dash-header">
          <div className="dash-header-inner">
            <a href="#" className="dash-logo">CyberArena</a>
            <div className="dash-header-right">
              <LanguageSwitcher />
              <span className="onevone-mode-pill" style={{ borderColor: `${meta.color}55`, color: meta.color }}>
                <TeamIcon size={13} /> {createdRoom.team_role === 'red' ? t.oneVOne.teamRedFull : t.oneVOne.teamBlueFull}
              </span>
              <div className="dash-user-badge">
                <div className="dash-avatar">{getInitial(user.name || user.email)}</div>
                <div className="dash-user-info">
                  <span className="dash-name">{user.name || user.email}</span>
                </div>
              </div>
              <button onClick={handleLeaveCreated} className="dash-logout">{t.oneVOne.cancel}</button>
            </div>
          </div>
        </header>

        <main className="dash-main">
          <div className="dash-container" style={{ maxWidth: 820 }}>
            <section
              className="onevone-room-card"
              style={{ '--team-accent': meta.color, '--team-accent-soft': meta.soft } as React.CSSProperties}
            >
              <div className="onevone-room-hero">
                <div className="onevone-room-icon" style={{ color: meta.color, background: meta.soft }}>
                  <Swords size={30} />
                </div>
                <div className="onevone-room-title-wrap">
                  <span className="onevone-room-kicker">{isOwner ? t.oneVOne.ownerTag : t.oneVOne.joinedHint}</span>
                  <h1>{t.oneVOne.leaveTitle}</h1>
                  <p>{roomSubtitle || t.oneVOne.shareCodeHint}</p>
                </div>
              </div>

              <div className="onevone-room-meta-grid">
                <div className="onevone-meta-tile">
                  <Users size={18} />
                  <span>{t.oneVOne.players(players.length)}</span>
                  <strong>{opponentJoined ? t.oneVOne.ready : t.oneVOne.waitingForOpponent}</strong>
                </div>
                <div className="onevone-meta-tile">
                  <Clock size={18} />
                  <span>{t.oneVOne.matchLength}</span>
                  <strong>{createdRoom.main_duration_s ? `${Math.floor(createdRoom.main_duration_s / 60)} ${t.oneVOne.minute}` : selectedDurationLabel}</strong>
                </div>
                <div className="onevone-meta-tile">
                  <ListChecks size={18} />
                  <span>{t.oneVOne.sourceMode}</span>
                  <strong>{createdRoom.challenge_source === 'random' ? t.oneVOne.sourceRandom : t.oneVOne.sourceManual}</strong>
                </div>
              </div>

              <div className="onevone-code-block">
                <span className="onevone-code-label">{t.oneVOne.roomCode}</span>
                <div className="onevone-code-row">
                  <code className="onevone-code">{createdRoom.code}</code>
                  <button className="onevone-copy-btn" onClick={handleCopy}>
                    {copied ? <><Check size={14} /> {t.oneVOne.copied}</> : <><Copy size={14} /> {t.oneVOne.copy}</>}
                  </button>
                </div>
                <span className="onevone-code-hint">{t.oneVOne.shareCodeHint}</span>
              </div>

              <div className="onevone-players">
                <div className="onevone-players-head">
                  <Users size={16} />
                  <span>{t.oneVOne.players(players.length)}</span>
                </div>
                <div className="onevone-player-row">
                  <div className={`onevone-player ${playerOne ? 'is-ready' : 'is-empty'}`}>
                    <div className="onevone-player-avatar">{getInitial(playerOne?.display_name || t.oneVOne.waitingOwner)}</div>
                    <div className="onevone-player-body">
                      <strong>{playerOne?.display_name || t.oneVOne.waitingOwner}</strong>
                      <span>{t.oneVOne.ownerTag} • {createdRoom.team_role === 'red' ? t.oneVOne.teamRed : t.oneVOne.teamBlue}</span>
                      <small className="onevone-player-state">{playerOne ? t.oneVOne.ready : t.oneVOne.waitingOwner}</small>
                    </div>
                  </div>
                  <div className="onevone-vs">{t.oneVOne.vs}</div>
                  <div className={`onevone-player ${playerTwo ? 'is-ready' : 'is-empty'}`}>
                    <div className="onevone-player-avatar">{getInitial(playerTwo?.display_name || t.oneVOne.waitingOpponent)}</div>
                    <div className="onevone-player-body">
                      <strong>{playerTwo?.display_name || t.oneVOne.waitingOpponent}</strong>
                      <span>{t.oneVOne.opponentTag} • {createdRoom.team_role === 'red' ? t.oneVOne.teamRed : t.oneVOne.teamBlue}</span>
                      <small className="onevone-player-state">{playerTwo ? t.oneVOne.ready : t.oneVOne.waitingForOpponent}</small>
                    </div>
                  </div>
                </div>
              </div>

              {isOwner && (
                <button
                  className="onevone-start-btn"
                  onClick={handleStartMatch}
                  disabled={!opponentJoined || starting}
                  style={{ '--btn-accent': meta.color } as React.CSSProperties}
                >
                  {starting ? <><Loader2 size={16} className="onevone-spin" /> {t.oneVOne.startBtnLoading}</>
                    : opponentJoined ? <><Swords size={16} /> {t.oneVOne.startBtn}</>
                    : <span>{t.oneVOne.waitingForOpponent}</span>}
                </button>
              )}

              {startError && <div className="onevone-error">{startError}</div>}

              {!isOwner && (
                <div className="onevone-waiting-note">
                  {t.oneVOne.waitingForOwnerToStart}
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
            <LanguageSwitcher />
            <button onClick={onBack} className="dash-back-pill">
              <ChevronLeft size={14} /> {t.oneVOne.back}
            </button>
            <div className="dash-user-badge">
              <div className="dash-avatar">{getInitial(user.name || user.email)}</div>
              <div className="dash-user-info">
                <span className="dash-name">{user.name || user.email}</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="dash-main">
        <div className="dash-container" style={{ maxWidth: 920 }}>
          <section className="onevone-hero">
            <div className="onevone-hero-top">
              <div className="onevone-hero-icon"><Swords size={36} /></div>
              <span className="onevone-hero-kicker">CyberArena 1v1</span>
            </div>
            <h1>{t.oneVOne.heroTitle}</h1>
            <p>{t.oneVOne.heroSub}</p>
            <div className="onevone-hero-strip">
              <div className="onevone-hero-chip">
                <Swords size={15} />
                <span>{t.oneVOne.createRoom}</span>
              </div>
              <div className="onevone-hero-chip">
                <Users size={15} />
                <span>{t.oneVOne.joinWithCode}</span>
              </div>
              <div className="onevone-hero-chip">
                <Clock size={15} />
                <span>{durationRangeLabel}</span>
              </div>
            </div>
          </section>

          {mode === 'home' && (
            <section className="onevone-pick-grid">
              <button className="onevone-pick-card" onClick={() => setMode('create')}>
                <div className="onevone-pick-card-top">
                  <div className="onevone-pick-icon"><Swords size={28} /></div>
                  <span className="onevone-card-badge">{t.oneVOne.createRoom}</span>
                </div>
                <h3>{t.oneVOne.createRoom}</h3>
                <p>{t.oneVOne.createRoomSub}</p>
                <small>{t.oneVOne.sourceRandom} / {t.oneVOne.sourceManual}</small>
              </button>
              <button className="onevone-pick-card" onClick={() => setMode('join')}>
                <div className="onevone-pick-card-top">
                  <div className="onevone-pick-icon"><Users size={28} /></div>
                  <span className="onevone-card-badge">{t.oneVOne.joinWithCode}</span>
                </div>
                <h3>{t.oneVOne.joinWithCode}</h3>
                <p>{t.oneVOne.joinWithCodeSub}</p>
                <small>{t.oneVOne.roomCode} • {t.oneVOne.startBtn}</small>
              </button>
            </section>
          )}

          {mode === 'create' && (
            <section
              className="onevone-form-card"
              style={{ '--team-accent': teamMeta.color, '--team-accent-soft': teamMeta.soft } as React.CSSProperties}
            >
              <div className="onevone-form-head">
                <div>
                  <h2>{t.oneVOne.roomSettings}</h2>
                  <p>{t.oneVOne.sourceHint}</p>
                </div>
                <button className="onevone-icon-btn" onClick={() => { setMode('home'); setCreateError(''); }}>
                  <X size={16} />
                </button>
              </div>

              <div className="onevone-setup-summary">
                <div>
                  <span>{t.oneVOne.yourTeam}</span>
                  <strong>{teamRole === 'red' ? t.oneVOne.teamRedFull : t.oneVOne.teamBlueFull}</strong>
                </div>
                <div>
                  <span>{t.oneVOne.matchLength}</span>
                  <strong>{selectedDurationLabel}</strong>
                </div>
                <div>
                  <span>{t.oneVOne.sourceMode}</span>
                  <strong>{selectedChallengeLabel}</strong>
                </div>
              </div>

              <div className="onevone-field">
                <label>{t.oneVOne.yourTeam}</label>
                <div className="onevone-team-pick">
                  <button
                    type="button"
                    className={`onevone-team-card ${teamRole === 'red' ? 'is-active' : ''}`}
                    onClick={() => setTeamRole('red')}
                    style={{ '--team-accent': '#ef4444', '--team-accent-soft': 'rgba(239,68,68,0.12)' } as React.CSSProperties}
                  >
                    <div className="onevone-team-card-top">
                      <RedTeamIcon size={42} />
                      {teamRole === 'red' ? <span>{t.oneVOne.ready}</span> : null}
                    </div>
                    <strong>{t.oneVOne.teamRedFull}</strong>
                    <span>{t.oneVOne.redDesc}</span>
                  </button>
                  <button
                    type="button"
                    className={`onevone-team-card ${teamRole === 'blue' ? 'is-active' : ''}`}
                    onClick={() => setTeamRole('blue')}
                    style={{ '--team-accent': '#3b82f6', '--team-accent-soft': 'rgba(59,130,246,0.12)' } as React.CSSProperties}
                  >
                    <div className="onevone-team-card-top">
                      <BlueTeamIcon size={42} />
                      {teamRole === 'blue' ? <span>{t.oneVOne.ready}</span> : null}
                    </div>
                    <strong>{t.oneVOne.teamBlueFull}</strong>
                    <span>{t.oneVOne.blueDesc}</span>
                  </button>
                </div>
                <small className="onevone-hint">{t.oneVOne.teamLockHint}</small>
              </div>

              <div className="onevone-field">
                <label>{t.oneVOne.matchLength}</label>
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
                          '--btn-accent': teamMeta.color,
                        } as React.CSSProperties}
                      >
                        <Clock size={14} />
                        <span>
                          <strong className="onevone-duration-value">{opt.minutes}</strong>
                          <span className="onevone-duration-unit">{t.oneVOne.minutes}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                <small className="onevone-hint">{t.oneVOne.matchLengthHint}</small>
              </div>

              <div className="onevone-field">
                <label>{t.oneVOne.sourceMode}</label>
                <div className="onevone-source-pick">
                  <button
                    type="button"
                    className={`onevone-source-btn ${challengeMode === 'random' ? 'is-active' : ''}`}
                    onClick={() => { setChallengeMode('random'); setPickedChallenge(null); setActiveCategory(null); }}
                  >
                    <Shuffle size={16} /> {t.oneVOne.sourceRandom}
                  </button>
                  <button
                    type="button"
                    className={`onevone-source-btn ${challengeMode === 'manual' ? 'is-active' : ''}`}
                    onClick={() => setChallengeMode('manual')}
                  >
                    <ListChecks size={16} /> {t.oneVOne.sourceManual}
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
                  {challengeMode === 'manual'
                    ? `${t.oneVOne.manualHint} ${pickedChallenge?.title || t.oneVOne.categoryFallback}`
                    : t.oneVOne.randomHint}
                </small>
              </div>

              {createError && <div className="onevone-error">{createError}</div>}

              <button
                className="onevone-primary-btn"
                onClick={handleCreate}
                disabled={creating || (challengeMode === 'manual' && !pickedChallenge?.id)}
                style={{ '--btn-accent': teamMeta.color } as React.CSSProperties}
              >
                {creating ? <><Loader2 size={16} className="onevone-spin" /> {t.oneVOne.creatingLoading}</> : <><Swords size={16} /> {t.oneVOne.creatingBtn}</>}
              </button>
            </section>
          )}

          {mode === 'join' && (
            <section className="onevone-form-card">
              <div className="onevone-form-head">
                <div>
                  <h2>{t.oneVOne.joinTitle}</h2>
                  <p>{t.oneVOne.joinWithCodeSub}</p>
                </div>
                <button className="onevone-icon-btn" onClick={() => { setMode('home'); setJoinError(''); }}>
                  <X size={16} />
                </button>
              </div>

              <div className="onevone-field">
                <label>{t.oneVOne.roomCode}</label>
                <div className="onevone-code-input-wrap">
                  <input
                    className="onevone-input onevone-input-big"
                    type="text"
                    maxLength={6}
                    placeholder={t.oneVOne.codePh}
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    style={{ letterSpacing: '0.4em', textAlign: 'center', fontFamily: 'monospace' }}
                  />
                </div>
                <small className="onevone-hint">{t.oneVOne.codeHint}</small>
              </div>

              {joinError && <div className="onevone-error">{joinError}</div>}

              <button
                className="onevone-primary-btn"
                onClick={handleJoin}
                disabled={joining || joinCode.length < 4}
                style={{ '--btn-accent': '#10b981' } as React.CSSProperties}
              >
                {joining ? <><Loader2 size={16} className="onevone-spin" /> {t.oneVOne.joiningLoading}</> : <><Users size={16} /> {t.oneVOne.joinBtn}</>}
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
  const { t } = useI18n();
  const meta = getTeamMeta(teamRole);

  const groups: { [cat: string]: DBChallenge[] } = {};
  challenges.forEach((c) => {
    const cat = c.category || t.oneVOne.categoryFallback;
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(c);
  });
  const categoryNames = Object.keys(groups).sort();

  if (loading) {
    return (
      <div className="onevone-browser onevone-browser-state">
        <div className="onevone-browser-empty">
          <Loader2 size={18} className="onevone-spin" />
          <span>{t.oneVOne.loadingTeam}</span>
        </div>
      </div>
    );
  }

  if (categoryNames.length === 0) {
    return (
      <div className="onevone-browser onevone-browser-state">
        <div className="onevone-browser-empty">
          <Lock size={18} />
          <span>{t.oneVOne.noChallenges}</span>
        </div>
      </div>
    );
  }

  if (activeCategory) {
    const items = groups[activeCategory] || [];
    return (
      <div
        className="onevone-browser"
        style={{ '--team-accent': meta.color, '--team-accent-soft': meta.soft } as React.CSSProperties}
      >
        <div className="onevone-browser-header">
          <button className="onevone-browser-back" onClick={() => { setActiveCategory(null); setPickedChallenge(null); }}>
            <ArrowRight size={14} />
            <span>{t.oneVOne.backToCategories}</span>
          </button>
          <h4 className="onevone-browser-title" style={{ color: meta.color }}>{activeCategory}</h4>
          <span className="onevone-browser-count">{items.length}</span>
        </div>
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

  return (
    <div
      className="onevone-browser"
      style={{ '--team-accent': meta.color, '--team-accent-soft': meta.soft } as React.CSSProperties}
    >
      <div className="onevone-browser-header">
        <h4 className="onevone-browser-label">{t.oneVOne.pickCategory(categoryNames.length)}</h4>
        <span className="onevone-browser-count">{categoryNames.length}</span>
      </div>
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
