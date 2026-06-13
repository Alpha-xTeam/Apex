import { useEffect, useRef, useState } from 'react';
import { Copy, Check, Swords, Shield, Crosshair, ChevronLeft, Loader2, Shuffle, ListChecks, X, ArrowRight, Lock, Clock, Plus, LogIn, DoorOpen } from 'lucide-react';
import { BlueTeamIcon, RedTeamIcon } from './TeamIcons';
import { useI18n } from '../i18n/I18nContext';
import { LanguageSwitcher } from './LanguageSwitcher';
import { Sidebar } from './Sidebar';
import './OneVOne.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8090/api';

function getAuthHeaders(): Record<string, string> {
  const raw = localStorage.getItem('cyberarena_session');
  let token = '';
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      token = parsed.access_token || parsed.session?.access_token || parsed.data?.access_token || parsed.token || '';
    } catch { /* ignore */ }
  }
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
  };
}

const DURATION_OPTIONS: { minutes: number; seconds: number }[] = [
  { minutes: 5,  seconds: 300 },
  { minutes: 10, seconds: 600 },
  { minutes: 15, seconds: 900 },
  { minutes: 20, seconds: 1200 },
  { minutes: 25, seconds: 1500 },
  { minutes: 30, seconds: 1800 },
];

const TEAM_META: Record<'red' | 'blue', { color: string; soft: string; icon: React.ComponentType<{ size?: number; className?: string }> }> = {
  red: { color: '#ef4444', soft: 'rgba(239, 68, 68, 0.12)', icon: Crosshair },
  blue: { color: '#3b82f6', soft: 'rgba(59, 130, 246, 0.12)', icon: Shield },
};

function getTeamMeta(teamRole: 'red' | 'blue') { return TEAM_META[teamRole]; }
function getInitial(name: string) { return (name || '?').trim().charAt(0).toUpperCase(); }

interface User { id: string; name: string; email: string; }
interface Room { id: string; code: string; team_role: 'red' | 'blue'; status: 'open' | 'closed' | 'abandoned'; challenge_source: string; owner_user_id: string; main_duration_s?: number; }
interface Player { id: string; user_id: string; slot: 1 | 2; display_name: string; is_ready: boolean; }
interface DBChallenge { id: string; title: string; module: string; category: string; path: string; difficulty: string; xpReward: number; }

interface OneVOneLobbyProps {
  user: User;
  onEnterArena: (code: string, room: Room) => void;
  onBack: () => void;
}

export const OneVOneLobby: React.FC<OneVOneLobbyProps> = ({ user, onEnterArena, onBack }) => {
  const { t, lang } = useI18n();
  const [mode, setMode] = useState<'home' | 'create' | 'join'>('home');

  const [teamRole, setTeamRole] = useState<'red' | 'blue'>('red');
  const [challengeMode, setChallengeMode] = useState<'random' | 'manual'>('random');
  const [pickedChallenge, setPickedChallenge] = useState<DBChallenge | null>(null);
  const [durationMin, setDurationMin] = useState<number>(10);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const [availableChallenges, setAvailableChallenges] = useState<DBChallenge[]>([]);
  const [loadingChallenges, setLoadingChallenges] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');

  const [createdRoom, setCreatedRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState('');
  const eventSourceRef = useRef<EventSource | null>(null);
  const teamMeta = getTeamMeta(teamRole);

  useEffect(() => {
    if (!createdRoom) return;
    const code = createdRoom.code;
    let cancelled = false;
    const refreshPlayers = async () => {
      try {
        const res = await fetch(`${API_URL}/onevone/rooms/${code}`, { headers: getAuthHeaders() });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setPlayers(data.players || []);
      } catch { /* ignore */ }
    };
    refreshPlayers();
    const interval = setInterval(refreshPlayers, 2500);
    try {
      const es = new EventSource(`${API_URL}/onevone/rooms/${code}/stream`);
      eventSourceRef.current = es;
      es.onmessage = (e) => {
        try {
          const evt = JSON.parse(e.data);
          if (evt.type === 'player_joined' || evt.type === 'players') refreshPlayers();
          if (evt.type === 'match_started' && evt.matchId) onEnterArena(code, createdRoom);
        } catch { /* ignore */ }
      };
      es.onerror = () => {};
    } catch { /* ignore */ }
    return () => { cancelled = true; clearInterval(interval); if (eventSourceRef.current) { eventSourceRef.current.close(); eventSourceRef.current = null; } };
  }, [createdRoom, onEnterArena]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoadingChallenges(true);
      setPickedChallenge(null);
      setActiveCategory(null);
      try {
        const res = await fetch(`${API_URL}/training/list?team_role=${teamRole}&limit=1000`, { headers: getAuthHeaders() });
        const data = await res.json();
        if (!cancelled) setAvailableChallenges(Array.isArray(data.items) ? data.items : []);
      } catch { if (!cancelled) setAvailableChallenges([]); }
      finally { if (!cancelled) setLoadingChallenges(false); }
    };
    load();
    return () => { cancelled = true; };
  }, [teamRole]);

  const handleCreate = async () => {
    setCreating(true); setCreateError('');
    try {
      const challengeId = pickedChallenge?.id ? pickedChallenge.id.trim() : '';
      const durationOpt = DURATION_OPTIONS.find((o) => o.minutes === durationMin);
      const mainDurationS = durationOpt ? durationOpt.seconds : 600;
      const res = await fetch(`${API_URL}/onevone/rooms`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ userId: user.id, displayName: user.name || user.email, teamRole, challengeSource: challengeMode === 'random' ? 'random' : `manual:${challengeId}`, mainDurationS }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail || t.oneVOne.createErr); }
      const data = await res.json();
      setCreatedRoom(data.room);
    } catch (e) { const err = e as { message?: string }; setCreateError(err?.message || t.oneVOne.genericErr); }
    finally { setCreating(false); }
  };

  const handleJoin = async () => {
    if (!joinCode.trim()) { setJoinError(t.oneVOne.enterCode); return; }
    setJoining(true); setJoinError('');
    try {
      const res = await fetch(`${API_URL}/onevone/rooms/join`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ code: joinCode.trim().toUpperCase(), userId: user.id, displayName: user.name || user.email }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail || t.oneVOne.joinErr); }
      const data = await res.json();
      onEnterArena(data.room.code, data.room);
    } catch (e) { const err = e as { message?: string }; setJoinError(err?.message || t.oneVOne.genericErr); }
    finally { setJoining(false); }
  };

  const handleStartMatch = async () => {
    if (!createdRoom) return;
    setStarting(true); setStartError('');
    try {
      const res = await fetch(`${API_URL}/onevone/rooms/${createdRoom.code}/start`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ userId: user.id }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail || t.oneVOne.startErr); }
      onEnterArena(createdRoom.code, createdRoom);
    } catch (e) { const err = e as { message?: string }; setStartError(err?.message || t.oneVOne.genericErr); }
    finally { setStarting(false); }
  };

  const handleCopy = async () => {
    if (!createdRoom) return;
    try { await navigator.clipboard.writeText(createdRoom.code); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch { /* ignore */ }
  };

  const handleLeaveCreated = async () => {
    if (!createdRoom) return;
    try { await fetch(`${API_URL}/onevone/rooms/${createdRoom.code}/leave`, { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ userId: user.id }) }); }
    catch { /* ignore */ }
    setCreatedRoom(null); setPlayers([]); setMode('home');
  };

  if (createdRoom) {
    const isOwner = strEq(createdRoom.owner_user_id, user.id);
    const meta = getTeamMeta(createdRoom.team_role);
    const opponentJoined = players.length >= 2;
    const playerOne = players[0];
    const playerTwo = players[1];

    return (
      <div dir={t._rawLang === 'ar' ? 'rtl' : 'ltr'} className="onevone-page">
        <Sidebar
          top={
            <button className="dash-nav-item" onClick={() => { setCreatedRoom(null); setPlayers([]); setMode('home'); }} title={t.oneVOne.back}>
              <ChevronLeft size={18} />
            </button>
          }
          bottom={
            <>
              <span className="header-team-pill" style={{ borderColor: `${meta.color}55`, color: meta.color }}>
                {createdRoom.team_role === 'red' ? <RedTeamIcon size={13} /> : <BlueTeamIcon size={13} />}
              </span>
              <LanguageSwitcher />
              <button onClick={handleLeaveCreated} className="dash-nav-item" title={t.oneVOne.cancel}>
                <X size={18} />
              </button>
              <div className="dash-user-badge">
                <div className="dash-avatar">{getInitial(user.name || user.email)}</div>
              </div>
            </>
          }
        />
        <main className="dash-main">
          <div className="ov1-waiting-room" style={{ '--team-accent': meta.color } as React.CSSProperties}>
            <div className="ov1-wr-header">
              <div className="ov1-wr-glow" />
              <div className="ov1-wr-icon-wrap">
                <div className="ov1-wr-icon" style={{ background: meta.soft, color: meta.color }}>
                  <Swords size={26} />
                </div>
              </div>
              <span className="ov1-wr-tag" style={{ color: meta.color, borderColor: `${meta.color}33` }}>
                {isOwner ? t.oneVOne.ownerTag : t.oneVOne.joinedHint}
              </span>
              <h2 className="ov1-wr-title">{t.oneVOne.leaveTitle}</h2>
            </div>

            <div className="ov1-wr-code-section">
              <span className="ov1-wr-code-label">{t.oneVOne.roomCode}</span>
              <div className="ov1-wr-code-display">
                <code className="ov1-wr-code-value">{createdRoom.code}</code>
                <button className="ov1-wr-copy-btn" onClick={handleCopy}>
                  {copied ? <><Check size={14} /> {t.oneVOne.copied}</> : <><Copy size={14} /> {t.oneVOne.copy}</>}
                </button>
              </div>
              <span className="ov1-wr-code-hint">{t.oneVOne.shareCodeHint}</span>
            </div>

            <div className="ov1-wr-players">
              <div className={`ov1-wr-player ${playerOne ? 'active' : 'empty'}`}>
                <div className="ov1-wr-player-avatar" style={{ background: `linear-gradient(135deg, ${meta.color}, ${meta.color}88)` }}>
                  {getInitial(playerOne?.display_name || '?')}
                </div>
                <div className="ov1-wr-player-info">
                  <span className="ov1-wr-player-name">{playerOne?.display_name || '—'}</span>
                  <span className="ov1-wr-player-role">{t.oneVOne.ownerTag}</span>
                </div>
                <span className={`ov1-wr-player-status ${playerOne ? 'ready' : ''}`}>{playerOne ? t.oneVOne.ready : t.oneVOne.waitingOwner}</span>
              </div>

              <div className="ov1-wr-vs">
                <div className="ov1-wr-vs-line" />
                <span className="ov1-wr-vs-text">{t.oneVOne.vs}</span>
                <div className="ov1-wr-vs-line" />
              </div>

              <div className={`ov1-wr-player ${playerTwo ? 'active' : 'empty'}`}>
                <div className="ov1-wr-player-avatar" style={{ background: playerTwo ? `linear-gradient(135deg, ${meta.color}, ${meta.color}88)` : 'rgba(255,255,255,0.06)' }}>
                  {getInitial(playerTwo?.display_name || '?')}
                </div>
                <div className="ov1-wr-player-info">
                  <span className="ov1-wr-player-name">{playerTwo?.display_name || '—'}</span>
                  <span className="ov1-wr-player-role">{t.oneVOne.opponentTag}</span>
                </div>
                <span className={`ov1-wr-player-status ${playerTwo ? 'ready' : ''}`}>{playerTwo ? t.oneVOne.ready : t.oneVOne.waitingForOpponent}</span>
              </div>
            </div>

            <div className="ov1-wr-meta-row">
              <div className="ov1-wr-meta-chip"><Clock size={12} /> {createdRoom.main_duration_s ? `${Math.floor(createdRoom.main_duration_s / 60)} ${t.oneVOne.minute}` : ''}</div>
              <div className="ov1-wr-meta-chip"><ListChecks size={12} /> {createdRoom.challenge_source === 'random' ? t.oneVOne.sourceRandom : t.oneVOne.sourceManual}</div>
            </div>

            {isOwner ? (
              <button className="ov1-wr-start-btn" onClick={handleStartMatch} disabled={!opponentJoined || starting}>
                {starting ? <><Loader2 size={16} className="onevone-spin" /> {t.oneVOne.startBtnLoading}</>
                  : opponentJoined ? <><Swords size={16} /> {t.oneVOne.startBtn}</>
                  : <span>{t.oneVOne.waitingForOpponent}</span>}
              </button>
            ) : (
              <div className="ov1-wr-wait-msg">{t.oneVOne.waitingForOwnerToStart}</div>
            )}
            {startError && <div className="onevone-error">{startError}</div>}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div dir={t._rawLang === 'ar' ? 'rtl' : 'ltr'} className="onevone-page">
      <Sidebar
        top={
          <button className="dash-nav-item" onClick={onBack} title={t.oneVOne.back}>
            <ChevronLeft size={18} />
          </button>
        }
        bottom={
          <>
            <LanguageSwitcher />
            <div className="dash-user-badge">
              <div className="dash-avatar">{getInitial(user.name || user.email)}</div>
            </div>
          </>
        }
      />

      <main className="dash-main">
          {mode === 'home' && (
            <div className="ov1-lobby">
              <div className="ov1-lobby-bg-orb ov1-lobby-bg-orb--1" />
              <div className="ov1-lobby-bg-orb ov1-lobby-bg-orb--2" />

              <div className="ov1-lobby-header">
                <div className="ov1-lobby-badge"><Swords size={12} /> {t.oneVOne.kicker}</div>
                <h1 className="ov1-lobby-title">{t.oneVOne.heroTitle}</h1>
                <p className="ov1-lobby-subtitle">{t.oneVOne.heroSub}</p>
              </div>

              <div className="ov1-lobby-actions">
                <button className="ov1-action-card ov1-action-card--create" onClick={() => setMode('create')}>
                  <div className="ov1-ac-icon-wrap"><Plus size={24} /></div>
                  <div className="ov1-ac-text">
                    <h3>{t.oneVOne.createRoom}</h3>
                    <p>{t.oneVOne.createRoomSub}</p>
                  </div>
                  <div className="ov1-ac-badge">{t.oneVOne.sourceRandom} / {t.oneVOne.sourceManual}</div>
                  <div className="ov1-ac-arrow"><ArrowRight size={16} /></div>
                </button>

                <button className="ov1-action-card ov1-action-card--join" onClick={() => setMode('join')}>
                  <div className="ov1-ac-icon-wrap"><LogIn size={24} /></div>
                  <div className="ov1-ac-text">
                    <h3>{t.oneVOne.joinWithCode}</h3>
                    <p>{t.oneVOne.joinWithCodeSub}</p>
                  </div>
                  <div className="ov1-ac-badge">{t.oneVOne.roomCode}</div>
                  <div className="ov1-ac-arrow"><ArrowRight size={16} /></div>
                </button>
              </div>
            </div>
          )}

        {mode === 'create' && (
          <div className="ov1-create-panel" style={{ '--accent': teamMeta.color, '--accent-soft': teamMeta.soft } as React.CSSProperties}>
            <button className="ov1-cp-close" onClick={() => { setMode('home'); setCreateError(''); }}><X size={16} /></button>

            <div className="ov1-cp-header">
              <div className="ov1-cp-header-icon"><Swords size={20} /></div>
              <div>
                <h2>{t.oneVOne.roomSettings}</h2>
                <p>{t.oneVOne.sourceHint}</p>
              </div>
            </div>

            <div className="ov1-cp-summary">
              <div className="ov1-cp-sum-item">
                <span className="ov1-cp-sum-label">{t.oneVOne.yourTeam}</span>
                <span className="ov1-cp-sum-value" style={{ color: teamMeta.color }}>
                  {teamRole === 'red' ? <RedTeamIcon size={11} /> : <BlueTeamIcon size={11} />}
                  {teamRole === 'red' ? t.oneVOne.teamRed : t.oneVOne.teamBlue}
                </span>
              </div>
              <div className="ov1-cp-sum-dot" />
              <div className="ov1-cp-sum-item">
                <span className="ov1-cp-sum-label">{t.oneVOne.matchLength}</span>
                <span className="ov1-cp-sum-value">{durationMin} {t.oneVOne.minutes}</span>
              </div>
              <div className="ov1-cp-sum-dot" />
              <div className="ov1-cp-sum-item">
                <span className="ov1-cp-sum-label">{t.oneVOne.sourceMode}</span>
                <span className="ov1-cp-sum-value">{challengeMode === 'random' ? t.oneVOne.sourceRandom : t.oneVOne.sourceManual}</span>
              </div>
            </div>

            <div className="ov1-cp-section">
              <label className="ov1-cp-label">{t.oneVOne.yourTeam}</label>
              <div className="ov1-cp-team-grid">
                <button className={`ov1-cp-team-btn ${teamRole === 'red' ? 'active' : ''}`}
                  onClick={() => setTeamRole('red')}>
                  <RedTeamIcon size={32} />
                  <span className="ov1-cp-team-title">{t.oneVOne.teamRedFull}</span>
                  <span className="ov1-cp-team-desc">{t.oneVOne.redDesc}</span>
                  {teamRole === 'red' && <span className="ov1-cp-team-check" style={{ background: '#ef4444' }}>✓</span>}
                </button>
                <button className={`ov1-cp-team-btn ${teamRole === 'blue' ? 'active' : ''}`}
                  onClick={() => setTeamRole('blue')}>
                  <BlueTeamIcon size={32} />
                  <span className="ov1-cp-team-title">{t.oneVOne.teamBlueFull}</span>
                  <span className="ov1-cp-team-desc">{t.oneVOne.blueDesc}</span>
                  {teamRole === 'blue' && <span className="ov1-cp-team-check" style={{ background: '#3b82f6' }}>✓</span>}
                </button>
              </div>
            </div>

            <div className="ov1-cp-row">
              <div className="ov1-cp-field">
                <label className="ov1-cp-label"><Clock size={12} /> {t.oneVOne.matchLength}</label>
                <div className="ov1-cp-duration-grid">
                  {DURATION_OPTIONS.map((opt) => (
                    <button key={opt.minutes} className={`ov1-cp-dur-btn ${durationMin === opt.minutes ? 'active' : ''}`}
                      onClick={() => setDurationMin(opt.minutes)}>
                      <strong>{opt.minutes}</strong>
                      <span>{t.oneVOne.minutes}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="ov1-cp-field">
                <label className="ov1-cp-label">{t.oneVOne.sourceMode}</label>
                <div className="ov1-cp-source-grid">
                  <button className={`ov1-cp-src-btn ${challengeMode === 'random' ? 'active' : ''}`}
                    onClick={() => { setChallengeMode('random'); setPickedChallenge(null); setActiveCategory(null); }}>
                    <Shuffle size={13} /> {t.oneVOne.sourceRandom}
                  </button>
                  <button className={`ov1-cp-src-btn ${challengeMode === 'manual' ? 'active' : ''}`}
                    onClick={() => setChallengeMode('manual')}>
                    <ListChecks size={13} /> {t.oneVOne.sourceManual}
                  </button>
                </div>
              </div>
            </div>

            {challengeMode === 'manual' && (
              <ChallengeBrowser
                challenges={availableChallenges} loading={loadingChallenges} teamRole={teamRole}
                activeCategory={activeCategory} setActiveCategory={setActiveCategory}
                pickedChallenge={pickedChallenge} setPickedChallenge={setPickedChallenge}
              />
            )}

            {createError && <div className="onevone-error">{createError}</div>}

            <button className="ov1-cp-submit" onClick={handleCreate}
              disabled={creating || (challengeMode === 'manual' && !pickedChallenge?.id)}>
              {creating ? <><Loader2 size={16} className="onevone-spin" /> {t.oneVOne.creatingLoading}</>
                : <><Swords size={16} /> {t.oneVOne.creatingBtn}</>}
            </button>
          </div>
        )}

        {mode === 'join' && (
          <div className="ov1-join-panel">
            <button className="ov1-cp-close" onClick={() => { setMode('home'); setJoinError(''); }}><X size={16} /></button>

            <div className="ov1-cp-header">
              <div className="ov1-cp-header-icon" style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981' }}>
                <DoorOpen size={20} />
              </div>
              <div>
                <h2>{t.oneVOne.joinTitle}</h2>
                <p>{t.oneVOne.joinWithCodeSub}</p>
              </div>
            </div>

            <div className="ov1-join-input-area">
              <label className="ov1-join-label">{t.oneVOne.roomCode}</label>
              <div className="ov1-join-input-wrap">
                <input className="ov1-join-input" type="text" maxLength={6} placeholder={t.oneVOne.codePh}
                  value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} />
              </div>
              <span className="ov1-join-hint">{t.oneVOne.codeHint}</span>
            </div>

            {joinError && <div className="onevone-error">{joinError}</div>}

            <button className="ov1-cp-submit" onClick={handleJoin} disabled={joining || joinCode.length < 4}>
              {joining ? <><Loader2 size={16} className="onevone-spin" /> {t.oneVOne.joiningLoading}</>
                : <><DoorOpen size={16} /> {t.oneVOne.joinBtn}</>}
            </button>
          </div>
        )}

      </main>
    </div>
  );
};

function strEq(a: string, b: string) { return String(a || '') === String(b || ''); }

interface ChallengeBrowserProps {
  challenges: DBChallenge[]; loading: boolean; teamRole: 'red' | 'blue';
  activeCategory: string | null; setActiveCategory: (cat: string | null) => void;
  pickedChallenge: DBChallenge | null; setPickedChallenge: (c: DBChallenge | null) => void;
}

const ChallengeBrowser: React.FC<ChallengeBrowserProps> = ({
  challenges, loading, teamRole, activeCategory, setActiveCategory, pickedChallenge, setPickedChallenge,
}) => {
  const { t } = useI18n();
  const meta = getTeamMeta(teamRole);
  const groups: { [cat: string]: DBChallenge[] } = {};
  challenges.forEach((c) => { const cat = c.category || t.oneVOne.categoryFallback; if (!groups[cat]) groups[cat] = []; groups[cat].push(c); });
  const categoryNames = Object.keys(groups).sort();

  if (loading) return <div className="ov1-cb-empty"><Loader2 size={16} className="onevone-spin" /><span>{t.oneVOne.loadingTeam}</span></div>;
  if (categoryNames.length === 0) return <div className="ov1-cb-empty"><Lock size={16} /><span>{t.oneVOne.noChallenges}</span></div>;

  if (activeCategory) {
    const items = groups[activeCategory] || [];
    return (
      <div className="ov1-cb">
        <div className="ov1-cb-header">
          <button className="ov1-cb-back" onClick={() => { setActiveCategory(null); setPickedChallenge(null); }}>
            <ArrowRight size={12} /> {t.oneVOne.backToCategories}
          </button>
          <span className="ov1-cb-title">{activeCategory}</span>
          <span className="ov1-cb-count">{items.length}</span>
        </div>
        <div className="ov1-cb-list">
          {items.map((c) => {
            const picked = pickedChallenge?.id === c.id;
            return (
              <button key={c.id} className={`ov1-cb-item ${picked ? 'picked' : ''}`} onClick={() => setPickedChallenge(c)}>
                <div className="ov1-cb-item-info">
                  <span className="ov1-cb-item-title">{c.title}</span>
                  <span className="ov1-cb-item-meta">{c.module} · {c.difficulty}</span>
                </div>
                <div className="ov1-cb-item-right">{picked ? <Check size={14} style={{ color: meta.color }} /> : <span className="ov1-cb-item-xp">+{c.xpReward}</span>}</div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="ov1-cb">
      <div className="ov1-cb-header">
        <span className="ov1-cb-title">{t.oneVOne.pickCategory(categoryNames.length)}</span>
        <span className="ov1-cb-count">{categoryNames.length}</span>
      </div>
      <div className="ov1-cb-cats">
        {categoryNames.map((cat) => (
          <button key={cat} className="ov1-cb-cat" onClick={() => setActiveCategory(cat)}>
            <span><Lock size={12} /> {cat}</span>
            <span className="ov1-cb-cat-count">{groups[cat].length}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
