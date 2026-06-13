import { useEffect, useRef, useState } from 'react';
import { Clock, Trophy, Swords, ChevronLeft, X } from 'lucide-react';
import { TrainingSession } from './TrainingSession';
import { OneVOneRoomCard } from './OneVOneRoomCard';
import { BlueTeamIcon, RedTeamIcon } from './TeamIcons';
import { Sidebar } from './Sidebar';
import './OneVOne.css';
import { useI18n } from '../i18n/I18nContext';

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
  challengeType?: 'crypto' | string;
  labKind?: 'iframe' | string;
};

interface OneVOneArenaProps {
  user: User;
  code: string;
  room: Room;
  onBack: () => void;
}

export const OneVOneArena: React.FC<OneVOneArenaProps> = ({ user, code, room, onBack }) => {
  const { t } = useI18n();
  const [match, setMatch] = useState<Match | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [training, setTraining] = useState<TrainingData | null>(null);
  const [loadingTraining, setLoadingTraining] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [winnerName, setWinnerName] = useState<string | null>(null);
  const [draw, setDraw] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number>(0);
  const [phaseLabel, setPhaseLabel] = useState<string>('');
  const [showResultModal, setShowResultModal] = useState(false);
  const [readyPlayerIds, setReadyPlayerIds] = useState<Set<string>>(new Set());
  const [hasSignaledReady, setHasSignaledReady] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState('');
  const [isSubmitting1v1, setIsSubmitting1v1] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [localRoom, setLocalRoom] = useState<Room | null>(room);

  const eventSourceRef = useRef<EventSource | null>(null);
  const tickRef = useRef<number | null>(null);
  const matchIdRef = useRef<string | null>(null);
  const playersRef = useRef<Player[]>(players);

  const isOwner = String(room.owner_user_id) === String(user.id);
  const teamColor = room.team_role === 'red' ? '#ef4444' : '#3b82f6';
  const isOvertime = match?.state === 'overtime';

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      try {
        const res = await fetch(`${API_URL}/onevone/rooms/${code}`);
        if (!res.ok) throw new Error(t.oneVOne.loadRoomErr);
        const data = await res.json();
        if (cancelled) return;
        if (data.room) setLocalRoom(data.room as Room);
        setPlayers(data.players || []);
        playersRef.current = data.players || [];
        if (data.match) {
          setMatch(data.match);
          matchIdRef.current = data.match.id;
        }
      } catch (e) {
        const err = e as { message?: string };
        setError(err?.message || t.oneVOne.connErr);
      }
    };
    init();
    return () => { cancelled = true; matchIdRef.current = null; };
  }, [code]);

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
          if (evt.players) {
            setPlayers(evt.players);
            playersRef.current = evt.players;
          }
        } else if (evt.type === 'state' && evt.match) {
          setMatch(evt.match);
          matchIdRef.current = evt.match.id;
        } else if (evt.type === 'players' && evt.players) {
          setPlayers(evt.players);
          playersRef.current = evt.players;
        } else if (evt.type === 'ready' && evt.userId) {
          setReadyPlayerIds((prev) => {
            const next = new Set(prev);
            next.add(String(evt.userId));
            return next;
          });
        } else if (evt.type === 'match_started' && evt.matchId) {
          matchIdRef.current = evt.matchId;
        } else if (evt.type === 'match_finished') {
          let resolvedWinnerName: string | null = null;
          if (evt.winner) {
            const w = playersRef.current.find((p) => p.user_id === evt.winner);
            resolvedWinnerName = w?.display_name || t.oneVOne.genericWinner;
          }
          setWinnerName(resolvedWinnerName);
          setDraw(!evt.winner);
          setShowResultModal(true);
          setMatch((prev) => {
            if (!prev) return prev;
            const next: Match = {
              ...prev,
              state: 'finished',
              winner_user_id: evt.winner || prev.winner_user_id || null,
              win_reason: evt.reason || prev.win_reason || 'flag',
            };
            return next;
          });
        }
      } catch { /* ignore */ }
    };
    es.onerror = () => { /* browser auto-reconnects */ };
    return () => { es.close(); };
  }, [code]);

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

  useEffect(() => {
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
    if (!match) return;
    if (!['playing', 'overtime'].includes(match.state)) return;

    const compute = () => {
      const now = Date.now();
      if (match.state === 'playing' && match.ends_at) {
        const ms = new Date(match.ends_at).getTime() - now;
        setSecondsLeft(Math.max(0, Math.floor(ms / 1000)));
        const mins = match.main_duration_s ? Math.round(match.main_duration_s / 60) : 10;
        setPhaseLabel(t.oneVOne.phaseMain(mins));
      } else if (match.state === 'overtime' && match.overtime_ends_at) {
        const ms = new Date(match.overtime_ends_at).getTime() - now;
        setSecondsLeft(Math.max(0, Math.floor(ms / 1000)));
        setPhaseLabel(t.oneVOne.phaseOvertime);
      }
    };
    compute();
    tickRef.current = window.setInterval(compute, 1000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [match?.state, match?.ends_at, match?.overtime_ends_at, match?.main_duration_s]);

  useEffect(() => {
    if (!match) return;
    if (!['ready', 'playing', 'overtime'].includes(match.state)) return;
    if (training) return;
    if (loadingTraining) return;
    let cancelled = false;
    setLoadingTraining(true);
    setError('');

    const attempt = async (n: number): Promise<void> => {
      if (cancelled) return;
      try {
        const res = await fetch(
          `${API_URL}/onevone/matches/${match.id}/challenge?userId=${user.id}`,
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        setTraining(data.training);
        setLoadingTraining(false);
      } catch (e) {
        if (cancelled) return;
        if (n < 4) {
          const delay = 1000 * Math.pow(2, n);
          await new Promise((r) => setTimeout(r, delay));
          return attempt(n + 1);
        }
        const err = e as { message?: string };
        setError(err?.message || t.oneVOne.loadChallengeErr);
        setLoadingTraining(false);
      }
    };

    attempt(0);
    return () => { cancelled = true; };
  }, [match?.id, match?.state, training, loadingTraining, user.id]);

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
      } catch { /* ignore */ }
    })();
  }, [match?.id, match?.state, training, loadingTraining, hasSignaledReady, user.id]);

  const handleLeave = async () => {
    matchIdRef.current = null;
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
        throw new Error(err.detail || t.oneVOne.startErr);
      }
      const data = await res.json();
      if (data.match) {
        setMatch(data.match);
        matchIdRef.current = data.match.id;
      }
    } catch (e) {
      const err = e as { message?: string };
      setStartError(err?.message || t.oneVOne.genericErr);
    } finally {
      setIsStarting(false);
    }
  };

  type SubmissionPayload =
    | string
    | { fixedCode: string }
    | { attackType: string; attackerIp: string; timestamp: string; ioc: string; explanation?: string }
    | { vulnerabilityType: string };

  const handleChallengeSolved = async (payload: SubmissionPayload) => {
    if (!match || !matchIdRef.current) return;
    if (match.state !== 'playing' && match.state !== 'overtime') return;
    if (isSubmitting1v1) return;
    setIsSubmitting1v1(true);
    setSubmitError('');
    try {
      const isBlueTeam = room?.team_role === 'blue';
      const url = `${API_URL}/onevone/matches/${matchIdRef.current}/submit`;
      const body = JSON.stringify({
        userId: user.id,
        submission: payload,
        clientVerdict: isBlueTeam ? true : undefined,
      });
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      const raw = await res.text();
      let data: { won?: boolean; correct?: boolean; winner_id?: string } = {};
      try { data = raw ? JSON.parse(raw) : {}; } catch { data = {}; }
      if (data.won) {
        const me = players.find((p) => p.user_id === user.id);
        setWinnerName(me?.display_name || user.name || user.email);
        setDraw(false);
        setShowResultModal(true);
        matchIdRef.current = null;
      } else if (data.correct) {
        const opponentId = data.winner_id || players.find((p) => p.user_id !== user.id)?.user_id;
        const opponent = players.find((p) => p.user_id === opponentId);
        setWinnerName(opponent?.display_name || t.oneVOne.genericOpponent);
        setDraw(false);
        setShowResultModal(true);
        matchIdRef.current = null;
      } else {
        setSubmitError(`خادم الـ 1v1 رفض التسليم (HTTP ${res.status}). حاول مرة أخرى.`);
      }
    } catch {
      setSubmitError('تعذّر الاتصال بخادم الـ 1v1. أعد المحاولة.');
    } finally {
      setIsSubmitting1v1(false);
    }
  };

  const handleTrainingBack = () => {
    if (match && (match.state === 'playing' || match.state === 'overtime')) {
      setShowResultModal(true);
      return;
    }
    handleLeave();
  };

  if (error) {
    return (
      <div className="onevone-page">
        <Sidebar
          top={
            <button className="dash-nav-item" onClick={onBack} title={t.oneVOne.back}>
              <ChevronLeft size={18} />
            </button>
          }
        />
        <main className="dash-main">
          <div className="ov1-arena-error-wrap">
            <div className="onevone-error">{error}</div>
            <button className="ov1-back-btn" onClick={onBack}><ChevronLeft size={14} /> {t.oneVOne.back}</button>
          </div>
        </main>
      </div>
    );
  }

  if (!match || match.state === 'waiting' || match.state === 'countdown' || match.state === 'ready') {
    const isCountingDown = match?.state === 'countdown';
    const isReadyPhase = match?.state === 'ready';
    return (
      <div className="onevone-page">
        <Sidebar
          top={
            <button className="dash-nav-item" onClick={handleLeave} title={t.oneVOne.back}>
              <ChevronLeft size={18} />
            </button>
          }
          bottom={
            <>
              <div className="dash-user-badge">
                <div className="dash-avatar">{(user.name || user.email).charAt(0)}</div>
              </div>
              <button onClick={handleLeave} className="dash-nav-item" title={t.oneVOne.leave}>
                <X size={18} />
              </button>
            </>
          }
        />
        <main className="dash-main">
          <div className="ov1-arena-waiting">
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
              <div className="ov1-countdown-overlay">
                <div className="ov1-countdown-inner">
                  <span className="ov1-countdown-number">{countdown ?? 3}</span>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  if (['ready', 'playing', 'overtime'].includes(match.state)) {
    if (!training) {
      return (
        <div className="onevone-page onevone-arena-active">
          <Sidebar
            top={
              <button className="dash-nav-item" onClick={handleTrainingBack} title={t.oneVOne.back}>
                <ChevronLeft size={18} />
              </button>
            }
            bottom={
              <>
                <div className="dash-user-badge">
                  <div className="dash-avatar">{(user.name || user.email).charAt(0)}</div>
                </div>
                <button onClick={handleLeave} className="dash-nav-item" title={t.oneVOne.leave}>
                  <X size={18} />
                </button>
              </>
            }
          />
          <TrainingSession
            moduleTitle={t.oneVOne.moduleTitle}
            categoryId=""
            pathId="cryptography"
            moduleId=""
            teamRole={room.team_role}
            initialTraining={null}
            oneVOneContext={{ matchId: match.id, userId: user.id }}
            onBack={handleTrainingBack}
            onChallengeSolved={handleChallengeSolved}
          />
        </div>
      );
    }

    const selfPlayer = players.find((p) => p.user_id === user.id);
    const oppPlayer = players.find((p) => p.user_id !== user.id);

    return (
      <div className="onevone-page onevone-arena-active">
        <Sidebar
          top={
            <button className="dash-nav-item" onClick={handleTrainingBack} title={t.oneVOne.back}>
              <ChevronLeft size={18} />
            </button>
          }
          bottom={
            <>
              <div className="dash-user-badge">
                <div className="dash-avatar">{(user.name || user.email).charAt(0)}</div>
              </div>
              <button onClick={handleLeave} className="dash-nav-item" title={t.oneVOne.leave}>
                <X size={18} />
              </button>
            </>
          }
        />

        <div className="ov1-game-strip" style={{ '--team-accent': teamColor } as React.CSSProperties}>
          <div className="ov1-gs-left">
            <span className="ov1-gs-pill" style={{ borderColor: `${teamColor}55`, color: teamColor }}>
              {room.team_role === 'red' ? <RedTeamIcon size={12} /> : <BlueTeamIcon size={12} />}
              {room.team_role === 'red' ? t.oneVOne.teamRedFull : t.oneVOne.teamBlueFull}
            </span>
          </div>
          <div className="ov1-gs-center">
            {players.length >= 2 && (
              <div className="ov1-gs-hud">
                <span className="ov1-gs-player ov1-gs-self">
                  <span className="ov1-gs-dot" />
                  {selfPlayer?.display_name || t.oneVOne.you}
                </span>
                <span className="ov1-gs-vs">{t.oneVOne.vs}</span>
                <span className="ov1-gs-player">
                  <span className="ov1-gs-dot" />
                  {oppPlayer?.display_name || t.oneVOne.genericOpponent}
                </span>
              </div>
            )}
          </div>
          <div className="ov1-gs-right">
            <div className="ov1-gs-timer" style={{ color: isOvertime ? '#f59e0b' : teamColor, borderColor: `${isOvertime ? '#f59e0b' : teamColor}55` }}>
              <Clock size={13} />
              <span>{phaseLabel}</span>
              <strong className="mono">{String(Math.floor(secondsLeft / 60)).padStart(2, '0')}:{String(secondsLeft % 60).padStart(2, '0')}</strong>
            </div>
          </div>
        </div>

        {submitError && (
          <div className="ov1-submit-error">
            <span>{submitError}</span>
            <button type="button" onClick={() => setSubmitError('')}>{t.oneVOne.cancel}</button>
          </div>
        )}

        <TrainingSession
          moduleTitle={training.title || t.oneVOne.moduleTitle}
          categoryId={training.type || ''}
          pathId={training.path || 'cryptography'}
          moduleId={training.type || ''}
          teamRole={room.team_role}
          challengeId={training.scenarioId || training.id}
          initialTraining={training as any}
          oneVOneContext={{ matchId: match.id, userId: user.id }}
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

  let resolvedWinnerName = winnerName;
  if (!resolvedWinnerName && match.winner_user_id) {
    const w = playersRef.current.find((p) => p.user_id === match.winner_user_id);
    resolvedWinnerName = w?.display_name || t.oneVOne.genericOpponent;
  } else if (!resolvedWinnerName && match.win_reason === 'overtime_draw') {
    resolvedWinnerName = null;
  }
  return (
    <div className="onevone-page">
      <Sidebar
        top={
          <button className="dash-nav-item" onClick={handleLeave} title={t.oneVOne.back}>
            <ChevronLeft size={18} />
          </button>
        }
        bottom={
          <>
            <div className="dash-user-badge">
              <div className="dash-avatar">{(user.name || user.email).charAt(0)}</div>
            </div>
            <button onClick={handleLeave} className="dash-nav-item" title={t.oneVOne.leave}>
              <X size={18} />
            </button>
          </>
        }
      />
      <main className="dash-main">
        <div className="ov1-arena-final">
          <OneVOneResultModal
            open={true}
            winnerName={resolvedWinnerName}
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

const OneVOneResultModal: React.FC<{
  open: boolean;
  winnerName: string | null;
  draw: boolean;
  isWinner: boolean;
  reason: string;
  onClose: () => void;
  onLeave: () => void;
}> = ({ open, winnerName, draw, isWinner, reason, onClose, onLeave }) => {
  const { t } = useI18n();
  if (!open) return null;
  const title = draw
    ? t.oneVOne.drawTitle
    : isWinner
      ? t.oneVOne.winTitle
      : t.oneVOne.loseTitle(winnerName || '');
  const sub = draw
    ? t.oneVOne.drawSub
    : isWinner
      ? t.oneVOne.winSub
      : t.oneVOne.loseSub;
  return (
    <div className="ov1-modal-overlay" onClick={onClose}>
      <div className="ov1-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ov1-modal-glow" style={{ background: draw ? 'rgba(245,158,11,0.15)' : isWinner ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)' }} />
        <div className="ov1-modal-icon" style={{ color: draw ? '#f59e0b' : isWinner ? '#10b981' : '#ef4444' }}>
          {draw ? <Swords size={32} /> : isWinner ? <Trophy size={32} /> : <X size={32} />}
        </div>
        <h2 className="ov1-modal-title">{title}</h2>
        <p className="ov1-modal-sub">{sub}</p>
        <small className="mono ov1-modal-reason">{t.oneVOne.reason} {reason}</small>
        <div className="ov1-modal-actions">
          <button className="ov1-modal-btn" onClick={onLeave}>
            {t.oneVOne.backToDashboard}
          </button>
        </div>
      </div>
    </div>
  );
};
