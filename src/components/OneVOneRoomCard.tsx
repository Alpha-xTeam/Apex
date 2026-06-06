import { useState } from 'react';
import { Copy, Check, Swords, Users, Loader2 } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';

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

interface OneVOneRoomCardProps {
  room: Room;
  players: Player[];
  readyPlayerIds?: Set<string>;
  isOwner: boolean;
  onStart?: () => void;
  startLoading?: boolean;
  startError?: string;
  showStartButton?: boolean;
  waitingForOpponentToLoad?: boolean;
  showReadyIndicators?: boolean;
}

export const OneVOneRoomCard: React.FC<OneVOneRoomCardProps> = ({
  room, players, readyPlayerIds, isOwner, onStart,
  startLoading, startError, showStartButton = true,
  waitingForOpponentToLoad, showReadyIndicators,
}) => {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const teamColor = room.team_role === 'red' ? '#ef4444' : '#3b82f6';
  const opponentJoined = players.length >= 2;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(room.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };

  return (
    <section className="onevone-room-card">
      <div className="onevone-room-head">
        <Swords size={28} style={{ color: teamColor }} />
        <div>
          <h1 style={{ margin: 0, fontSize: 22, color: '#f3f1ec' }}>{t.oneVOne.leaveTitle}</h1>
          <p style={{ margin: 0, fontSize: 13, color: 'rgba(243,241,236,0.55)' }}>
            {isOwner ? t.oneVOne.shareCodeHint : t.oneVOne.joinedHint}
          </p>
        </div>
      </div>

      <div className="onevone-code-block">
        <span className="onevone-code-label">{t.oneVOne.roomCode}</span>
        <div className="onevone-code-row">
          <code className="onevone-code">{room.code}</code>
          <button className="onevone-copy-btn" onClick={handleCopy}>
            {copied ? <><Check size={14} /> {t.oneVOne.copied}</> : <><Copy size={14} /> {t.oneVOne.copy}</>}
          </button>
        </div>
        <span className="onevone-code-hint">
          {room.challenge_source === 'random'
            ? t.oneVOne.randomHint
            : `${t.oneVOne.manualHint} ${room.challenge_source.split(':')[1] || '—'}`}
        </span>
      </div>

      <div className="onevone-players">
        <div className="onevone-players-head">
          <Users size={16} />
          <span>{t.oneVOne.players(players.length)}</span>
        </div>
        <div className="onevone-player-row">
          {[0, 1].map((idx) => {
            const p = players[idx];
            const pReady = !!p && !!readyPlayerIds?.has(p.user_id);
            return (
              <div
                key={idx}
                className={`onevone-player ${p ? 'is-ready' : 'is-empty'}`}
              >
                <div className="onevone-player-dot" />
                <div>
                  <strong>
                    {p?.display_name || (idx === 0 ? t.oneVOne.waitingOwner : t.oneVOne.waitingOpponent)}
                  </strong>
                  <span>
                    {idx === 0 ? t.oneVOne.ownerTag : t.oneVOne.opponentTag} • {room.team_role === 'red' ? t.oneVOne.teamRed : t.oneVOne.teamBlue}
                    {showReadyIndicators && p && pReady && ` • ✓ ${t.oneVOne.ready}`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {isOwner && showStartButton && onStart && (
        <button
          className="onevone-start-btn"
          onClick={onStart}
          disabled={!opponentJoined || startLoading}
          style={{ '--btn-accent': teamColor } as React.CSSProperties}
        >
          {startLoading
            ? <><Loader2 size={16} className="onevone-spin" /> {t.oneVOne.startBtnLoading}</>
            : opponentJoined
              ? <><Swords size={16} /> {t.oneVOne.startBtn}</>
              : <span>{t.oneVOne.waitingForOpponent}</span>}
        </button>
      )}

      {startError && <div className="onevone-error">{startError}</div>}

      {!isOwner && showStartButton && (
        <div className="onevone-waiting-note">
          {t.oneVOne.waitingForOwnerToStart}
        </div>
      )}

      {waitingForOpponentToLoad && (
        <div className="onevone-waiting-note">
          <Loader2
            size={14}
            className="onevone-spin"
            style={{ marginLeft: 6, verticalAlign: 'middle' }}
          />
          {t.oneVOne.waitingForOpponentLoad}
        </div>
      )}
    </section>
  );
};
