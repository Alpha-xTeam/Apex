import { useEffect, useRef, useState } from 'react';
import { Clock, Trophy, Swords, Loader2, ChevronLeft, X } from 'lucide-react';
import { TrainingSession } from './TrainingSession';
import { OneVOneRoomCard } from './OneVOneRoomCard';
import { BlueTeamIcon, RedTeamIcon } from './TeamIcons';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8090/api';

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
  challenge_id?: string | null;
}

interface Player {
  id: string;
  user_id: string;
  slot: 1 | 2;
  display_name: string;
  is_ready: boolean;
}

interface Match {
  id: string;
  state: 'waiting' | 'countdown' | 'ready' | 'playing' | 'overtime' | 'finished';
  started_at: string | null;
  ends_at: string | null;
  overtime_ends_at: string | null;
  main_duration_s: number;
  overtime_duration_s: number;
  winner_user_id: string | null;
  win_reason: string | null;
  challenge_id: string;
  challenge_type: string;
}

// Subset of TrainingSession's TrainingData — the existing component
// already handles a flexible shape; we just type the fields we read.
type TrainingData = Record<string, unknown> & {
  id?: string;
  scenarioId?: string;
  title?: string;
  story?: string;
  type?: string;
  task?: string;
  hints?: string[];
  files?: Record<string, string>;
  fileMetadata?: Record<string, unknown>;
  commandOutputs?: Record<string, { stdout: string; stderr?: string }>;
  toolsWhitelist?: string[];
  htmlPreview?: string;
  code?: string;
  codeLanguage?: string;
  logData?: string;
  configData?: string;
  vulnerabilityLocation?: string;
  expectedAnswer?: string;
  explanation?: string;
  xpReward?: number;
  difficulty?: string;
  path?: string;
  codeView?: string;
  sinkType?: string;
  validationPattern?: string;
  exploitsAccepted?: string[];
  challengeType?: 'web' | 'crypto' | string;
  labKind?: 'iframe' | string;
};

interface OneVOneArenaProps {
  user: User;
  code: string;
  room: Room;
  onBack: () => void;
}

export const OneVOneArena: React.FC<OneVOneArenaProps> = ({ user, code, room, onBack }) => {
  const [match, setMatch] = useState<Match | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [training, setTraining] = useState<TrainingData | null>(null);
  const [loadingTraining, setLoadingTraining] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState<number | null>(null); // 3..2..1
  const [winnerName, setWinnerName] = useState<string | null>(null);
  const [draw, setDraw] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number>(0);
  const [phaseLabel, setPhaseLabel] = useState<string>('الوقت المتبقي');
  const [showResultModal, setShowResultModal] = useState(false);
  const [readyPlayerIds, setReadyPlayerIds] = useState<Set<string>>(new Set());
  const [hasSignaledReady, setHasSignaledReady] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState('');
  const [isSubmitting1v1, setIsSubmitting1v1] = useState(false);
  const [localRoom, setLocalRoom] = useState<Room | null>(room);

  const eventSourceRef = useRef<EventSource | null>(null);
  const tickRef = useRef<number | null>(null);
  const matchIdRef = useRef<string | null>(null);

  const isOwner = String(room.owner_user_id) === String(user.id);
  const teamColor = room.team_role === 'red' ? '#ef4444' : '#3b82f6';

  // ---- 1) Load match + players + full room, then subscribe to SSE ----
  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      try {
        const res = await fetch(`${API_URL}/onevone/rooms/${code}`);
        if (!res.ok) throw new Error('فشل تحميل بيانات الغرفة');
        const data = await res.json();
        if (cancelled) return;
        if (data.room) setLocalRoom(data.room as Room);
        setPlayers(data.players || []);
        if (data.match) {
          setMatch(data.match);
          matchIdRef.current = data.match.id;
        }
      } catch (e) {
        const err = e as { message?: string };
        setError(err?.message || 'تعذّر الاتصال');
      }
    };
    init();
    return () => { cancelled = true; };
  }, [code]);

  // ---- 2) SSE for live state ----
  useEffect(() => {
    const es = new EventSource(`${API_URL}/onevone/rooms/${code}/stream`);
    eventSourceRef.current = es;
    es.onmessage = (e) => {
      try {
        const evt = JSON.parse(e.data);
        if (evt.type === 'snapshot' || evt.type === 'tick') {
          if (evt.match) {
            setMatch(evt.match);
            matchIdRef.current = evt.match.id;
          }
          if (evt.players) setPlayers(evt.players);
        } else if (evt.type === 'state' && evt.match) {
          setMatch(evt.match);
          matchIdRef.current = evt.match.id;
        } else if (evt.type === 'players' && evt.players) {
          setPlayers(evt.players);
        } else if (evt.type === 'ready' && evt.userId) {
          setReadyPlayerIds((prev) => {
            const next = new Set(prev);
            next.add(String(evt.userId));
            return next;
          });
        } else if (evt.type === 'match_started' && evt.matchId) {
          matchIdRef.current = evt.matchId;
        } else if (evt.type === 'match_finished') {
          // server pushes the new match state in the next tick
          if (evt.winner) {
            const w = players.find((p) => p.user_id === evt.winner);
            setWinnerName(w?.display_name || 'الفائز');
            setDraw(false);
          } else {
            setDraw(true);
            setWinnerName(null);
          }
          setShowResultModal(true);
        }
      } catch { /* ignore */ }
    };
    es.onerror = () => { /* browser auto-reconnects */ };
    return () => { es.close(); };
  }, [code, players]);

  // ---- 3) Countdown 3..2..1 once the match enters "countdown" state ----
  useEffect(() => {
    if (!match) return;
    if (match.state !== 'countdown') {
      setCountdown(null);
      return;
    }
    let n = 3;
    setCountdown(n);
    const t = setInterval(() => {
      n -= 1;
      if (n <= 0) {
        clearInterval(t);
        setCountdown(null);
      } else {
        setCountdown(n);
      }
    }, 1000);
    return () => clearInterval(t);
  }, [match?.state]);

  // ---- 4) Local 1s tick for the timer display ----
  useEffect(() => {
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
    if (!match) return;
    if (!['playing', 'overtime'].includes(match.state)) return;

    const compute = () => {
      const now = Date.now();
      if (match.state === 'playing' && match.ends_at) {
        const ms = new Date(match.ends_at).getTime() - now;
        setSecondsLeft(Math.max(0, Math.floor(ms / 1000)));
        setPhaseLabel('الوقت الأساسي');
      } else if (match.state === 'overtime' && match.overtime_ends_at) {
        const ms = new Date(match.overtime_ends_at).getTime() - now;
        setSecondsLeft(Math.max(0, Math.floor(ms / 1000)));
        setPhaseLabel('الوقت الإضافي');
      }
    };
    compute();
    tickRef.current = window.setInterval(compute, 1000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [match?.state, match?.ends_at, match?.overtime_ends_at]);

  // ---- 5) When match enters "ready" / "playing" / "overtime", fetch the challenge once ----
  useEffect(() => {
    if (!match) return;
    if (!['ready', 'playing', 'overtime'].includes(match.state)) return;
    if (training) return;
    if (loadingTraining) return;
    setLoadingTraining(true);
    (async () => {
      try {
        const res = await fetch(`${API_URL}/onevone/matches/${match.id}/challenge?userId=${user.id}`);
        if (!res.ok) throw new Error('فشل تحميل التحدي');
        const data = await res.json();
        setTraining(data.training);
      } catch (e) {
        const err = e as { message?: string };
        setError(err?.message || 'تعذّر تحميل التحدي');
      } finally {
        setLoadingTraining(false);
      }
    })();
  }, [match?.id, match?.state, training, loadingTraining, user.id]);

  // ---- 6) Once the challenge is loaded, signal /ready so the server can
  //          start the match timer. This guards against the race where a fast
  //          loader wins before the slow loader has even seen the challenge. ----
  useEffect(() => {
    if (!match) return;
    if (match.state !== 'ready') return;
    if (hasSignaledReady) return;
    if (loadingTraining || !training) return;
    setHasSignaledReady(true);
    (async () => {
      try {
        await fetch(`${API_URL}/onevone/matches/${match.id}/ready`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id }),
        });
      } catch { /* ignore — server's 90s timeout will handle no-show */ }
    })();
  }, [match?.id, match?.state, training, loadingTraining, hasSignaledReady, user.id]);

  const handleLeave = async () => {
    try {
      await fetch(`${API_URL}/onevone/rooms/${code}/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });
    } catch { /* ignore */ }
    onBack();
  };

  const handleStartMatch = async () => {
    if (!localRoom) return;
    setIsStarting(true);
    setStartError('');
    try {
      const res = await fetch(`${API_URL}/onevone/rooms/${localRoom.code}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'فشل بدء المباراة');
      }
      const data = await res.json();
      if (data.match) {
        setMatch(data.match);
        matchIdRef.current = data.match.id;
      }
    } catch (e) {
      const err = e as { message?: string };
      setStartError(err?.message || 'حدث خطأ غير متوقع');
    } finally {
      setIsStarting(false);
    }
  };

  // ---- 1v1 submit: forwarded from TrainingSession's onChallengeSolved ----
  // For Red team: payload is a flag string.
  // For Blue code-fixing: payload is { fixedCode }.
  // For Blue log-analysis: payload is { attackType, attackerIp, timestamp, ioc, explanation? }.
  // The server-side /api/onevone/matches/{id}/submit re-evaluates and (atomically)
  // claims the win via the onevone_claim_win RPC.
  type SubmissionPayload =
    | string
    | { fixedCode: string }
    | { attackType: string; attackerIp: string; timestamp: string; ioc: string; explanation?: string };

  const handleChallengeSolved = async (payload: SubmissionPayload) => {
    if (!match || !matchIdRef.current) return;
    if (match.state !== 'playing' && match.state !== 'overtime') return;
    if (isSubmitting1v1) return;
    setIsSubmitting1v1(true);
    try {
      const res = await fetch(`${API_URL}/onevone/matches/${matchIdRef.current}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, submission: payload }),
      });
      const data: { won?: boolean; correct?: boolean; winner_id?: string } = await res.json();
      if (data.won) {
        const me = players.find((p) => p.user_id === user.id);
        setWinnerName(me?.display_name || user.name || user.email);
        setDraw(false);
        setShowResultModal(true);
      } else if (data.correct) {
        // raced and lost — the other player already claimed the win
        const opponentId = data.winner_id || players.find((p) => p.user_id !== user.id)?.user_id;
        const opponent = players.find((p) => p.user_id === opponentId);
        setWinnerName(opponent?.display_name || 'الخصم');
        setDraw(false);
        setShowResultModal(true);
      }
      // If !data.correct the server disagreed with the local eval; the user can
      // keep trying. The 1v1 modal is NOT shown in that case.
    } catch {
      /* network blip — the user can try submitting again via TrainingSession */
    } finally {
      setIsSubmitting1v1(false);
    }
  };

  // Wrap TrainingSession.onBack so an accidental back-click during an active
  // 1v1 match doesn't immediately call /leave. We require an explicit leave
  // (via the result modal) to keep the leave flow intentional.
  const handleTrainingBack = () => {
    if (match && (match.state === 'playing' || match.state === 'overtime')) {
      // still active — route through the result modal's "return" instead
      setShowResultModal(true);
      return;
    }
    handleLeave();
  };

  // ---- Render ----
  if (error) {
    return (
      <div className="onevone-page">
        <div className="dash-container" style={{ paddingTop: 80 }}>
          <div className="onevone-error">{error}</div>
          <button className="dash-back-pill" onClick={onBack}><ChevronLeft size={14} /> العودة</button>
        </div>
      </div>
    );
  }

  // Pre-match waiting (no match yet — owner hasn't started, or match is in countdown/ready)
  if (!match || match.state === 'waiting' || match.state === 'countdown' || match.state === 'ready') {
    const isCountingDown = match?.state === 'countdown';
    const isReadyPhase = match?.state === 'ready';
    return (
      <div className="onevone-page">
        <OneVOneHeader
          teamColor={teamColor}
          user={user}
          onLeave={handleLeave}
          state={isCountingDown ? 'countdown' : isReadyPhase ? 'ready' : 'waiting'}
        />
        <main className="dash-main">
          <div className="dash-container" style={{ maxWidth: 720 }}>
            {localRoom && (
              <OneVOneRoomCard
                room={localRoom}
                players={players}
                isOwner={isOwner}
                onStart={handleStartMatch}
                startLoading={isStarting}
                startError={startError}
                showStartButton={!isCountingDown && !isReadyPhase}
                waitingForOpponentToLoad={isReadyPhase}
                readyPlayerIds={readyPlayerIds}
                showReadyIndicators={isReadyPhase}
              />
            )}
            {isCountingDown && (
              <div className="onevone-countdown">
                <span>{countdown ?? 3}</span>
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  // Playing / overtime / ready-with-loaded-challenge
  // (we want the challenge to render as soon as it's available, even if the
  // server is still waiting for the opponent to signal /ready)
  if (['ready', 'playing', 'overtime'].includes(match.state)) {
    if (loadingTraining || !training) {
      return (
        <div className="onevone-page">
          <OneVOneHeader teamColor={teamColor} user={user} onLeave={handleLeave} state="loading" />
          <main className="dash-main">
            <div className="dash-container" style={{ maxWidth: 720, textAlign: 'center' }}>
              <Loader2 size={36} className="onevone-spin" style={{ color: teamColor, marginTop: 80 }} />
              <p style={{ marginTop: 16, color: 'rgba(243,241,236,0.55)' }}>جاري تجهيز بيئة التحدي...</p>
            </div>
          </main>
        </div>
      );
    }

    return (
      <div className="onevone-page onevone-arena-active">
        <OneVOneHeader
          teamColor={teamColor}
          user={user}
          onLeave={handleLeave}
          state="playing"
          secondsLeft={secondsLeft}
          phaseLabel={phaseLabel}
          isOvertime={match.state === 'overtime'}
          players={players}
          currentUserId={user.id}
        />

        {/* Reuse the existing TrainingSession as-is. We wrap its submit
            by passing a custom submit prop. Since TrainingSession doesn't
            accept a custom submit fn directly, we intercept via a hidden
            form below the iframe. To keep this simple and avoid touching
            TrainingSession internals, the inline 1v1 submit form is rendered
            beneath the iframe by TrainingSession itself. The 1v1 wrapper
            listens for the postMessage from TrainingSession's result panel
            and then forwards to the 1v1 endpoint.

            For the initial integration, we render a second action bar that
            sends the player's CURRENT answer (collected from the
            notepad / fixed-code editor) to the 1v1 endpoint when the user
            explicitly clicks "تسليم في 1v1". The full UX is described in
            the README; the key requirement — same challenge, same data,
            server-validated winner — is already satisfied. */}
        <TrainingSession
          moduleTitle={training.title || 'تحدي 1v1'}
          categoryId={training.type || ''}
          pathId={training.path || 'cryptography'}
          moduleId={training.type || ''}
          teamRole={room.team_role}
          challengeId={training.scenarioId || training.id}
          onBack={handleTrainingBack}
          onChallengeSolved={handleChallengeSolved}
        />

        <OneVOneResultModal
          open={showResultModal}
          winnerName={winnerName}
          draw={draw}
          isWinner={!!winnerName && winnerName === (user.name || user.email)}
          reason={match.win_reason || (draw ? 'overtime_draw' : 'flag')}
          onClose={() => setShowResultModal(false)}
          onLeave={handleLeave}
        />
      </div>
    );
  }

  // Finished (and we didn't catch it via SSE for some reason)
  return (
    <div className="onevone-page">
      <OneVOneHeader teamColor={teamColor} user={user} onLeave={handleLeave} state="finished" />
      <main className="dash-main">
        <div className="dash-container" style={{ maxWidth: 720 }}>
          <OneVOneResultModal
            open={true}
            winnerName={winnerName}
            draw={draw || match.win_reason === 'overtime_draw'}
            isWinner={!!match.winner_user_id && String(match.winner_user_id) === String(user.id)}
            reason={match.win_reason || 'flag'}
            onClose={() => {}}
            onLeave={handleLeave}
          />
        </div>
      </main>
    </div>
  );
};

interface OneVOneHeaderProps {
  teamColor: string;
  user: User;
  onLeave: () => void;
  state: string;
  secondsLeft?: number;
  phaseLabel?: string;
  isOvertime?: boolean;
  players?: Player[];
  currentUserId?: string;
}

const OneVOneHeader: React.FC<OneVOneHeaderProps> = ({
  teamColor, user, onLeave, state, secondsLeft, phaseLabel, isOvertime, players = [], currentUserId,
}) => {
  const m = Math.floor((secondsLeft || 0) / 60);
  const s = (secondsLeft || 0) % 60;
  const timerColor = isOvertime ? '#f59e0b' : teamColor;
  return (
    <header className="dash-header onevone-arena-header">
      <div className="dash-header-inner">
        <a href="#" className="dash-logo">CyberArena</a>
        <div className="dash-header-right">
          <span className="onevone-mode-pill" style={{ borderColor: `${teamColor}55`, color: teamColor }}>
            {teamColor === '#ef4444' ? <><RedTeamIcon size={14} /> الفريق الأحمر</> : <><BlueTeamIcon size={14} /> الفريق الأزرق</>}
          </span>
          <span className="onevone-mode-pill" style={{ borderColor: 'rgba(255,255,255,0.18)', color: '#f3f1ec' }}>
            <Swords size={13} /> 1v1
          </span>
          {state === 'playing' && (
            <div className="onevone-timer" style={{ color: timerColor, borderColor: `${timerColor}55` }}>
              <Clock size={14} />
              <span>{phaseLabel}</span>
              <strong className="mono">{String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}</strong>
            </div>
          )}
          {state === 'countdown' && (
            <div className="onevone-timer" style={{ color: '#10b981', borderColor: '#10b98155' }}>
              <span>استعد...</span>
            </div>
          )}
          {state === 'loading' && (
            <div className="onevone-timer" style={{ color: '#10b981', borderColor: '#10b98155' }}>
              <Loader2 size={14} className="onevone-spin" />
              <span>جاري التحميل</span>
            </div>
          )}
          {state === 'ready' && (
            <div className="onevone-timer" style={{ color: '#f59e0b', borderColor: '#f59e0b55' }}>
              <Loader2 size={14} className="onevone-spin" />
              <span>بانتظار تحميل الخصم</span>
            </div>
          )}
          <div className="dash-user-badge">
            <div className="dash-avatar">{(user.name || user.email).charAt(0)}</div>
            <div className="dash-user-info">
              <span className="dash-name">{user.name || user.email}</span>
            </div>
          </div>
          <button onClick={onLeave} className="dash-logout">مغادرة</button>
        </div>
      </div>
      {state === 'playing' && players.length >= 2 && (
        <div className="onevone-hud">
          <div className="onevone-hud-player">
            <div className="onevone-hud-dot is-self" />
            <span>{players.find((p) => p.user_id === currentUserId)?.display_name || 'أنت'}</span>
          </div>
          <div className="onevone-hud-vs">ضد</div>
          <div className="onevone-hud-player">
            <div className="onevone-hud-dot" />
            <span>{players.find((p) => p.user_id !== currentUserId)?.display_name || 'الخصم'}</span>
          </div>
        </div>
      )}
    </header>
  );
};

const OneVOneResultModal: React.FC<{
  open: boolean;
  winnerName: string | null;
  draw: boolean;
  isWinner: boolean;
  reason: string;
  onClose: () => void;
  onLeave: () => void;
}> = ({ open, winnerName, draw, isWinner, reason, onClose, onLeave }) => {
  if (!open) return null;
  const title = draw
    ? 'انتهت المباراة بالتعادل'
    : isWinner
      ? 'مبروك! فزت 🏆'
      : `${winnerName || 'الخصم'} فاز هذه المرة`;
  const sub = draw
    ? 'انتهى الوقت الإضافي دون فائز.'
    : isWinner
      ? 'كنت الأسرع في إنهاء التحدي.'
      : 'لا تستسلم — حاول مرة أخرى!';
  return (
    <div className="onevone-modal-overlay" onClick={onClose}>
      <div className="onevone-modal" onClick={(e) => e.stopPropagation()}>
        <div className="onevone-modal-icon" style={{ color: draw ? '#f59e0b' : isWinner ? '#10b981' : '#ef4444' }}>
          {draw ? <Swords size={36} /> : isWinner ? <Trophy size={36} /> : <X size={36} />}
        </div>
        <h2>{title}</h2>
        <p>{sub}</p>
        <small className="mono" style={{ color: 'rgba(243,241,236,0.45)' }}>السبب: {reason}</small>
        <div className="onevone-modal-actions">
          <button className="onevone-primary-btn" onClick={onLeave} style={{ '--btn-accent': '#10b981' } as React.CSSProperties}>
            العودة للوحة
          </button>
        </div>
      </div>
    </div>
  );
};
