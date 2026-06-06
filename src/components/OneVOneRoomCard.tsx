import { useState } from 'react';
import { Copy, Check, Swords, Users, Loader2 } from 'lucide-react';

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
          <h1 style={{ margin: 0, fontSize: 22, color: '#f3f1ec' }}>غرفة 1 ضد 1</h1>
          <p style={{ margin: 0, fontSize: 13, color: 'rgba(243,241,236,0.55)' }}>
            {isOwner
              ? 'شارك الرمز مع خصمكِ ليدخل نفس التحدي'
              : 'انضممت للغرفة — في انتظار البدء'}
          </p>
        </div>
      </div>

      <div className="onevone-code-block">
        <span className="onevone-code-label">رمز الغرفة</span>
        <div className="onevone-code-row">
          <code className="onevone-code">{room.code}</code>
          <button className="onevone-copy-btn" onClick={handleCopy}>
            {copied ? <><Check size={14} /> تم النسخ</> : <><Copy size={14} /> نسخ</>}
          </button>
        </div>
        <span className="onevone-code-hint">
          {room.challenge_source === 'random'
            ? 'سيتم اختيار التحدي بشكل عشوائي عند البدء'
            : `تحدي يدوي: ${room.challenge_source.split(':')[1] || '—'}`}
        </span>
      </div>

      <div className="onevone-players">
        <div className="onevone-players-head">
          <Users size={16} />
          <span>اللاعبون ({players.length}/2)</span>
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
                    {p?.display_name || (idx === 0 ? 'في انتظار المالك...' : 'في انتظار خصم...')}
                  </strong>
                  <span>
                    {idx === 0 ? 'مالك الغرفة' : 'الخصم'} • {room.team_role === 'red' ? 'أحمر' : 'أزرق'}
                    {showReadyIndicators && p && pReady && ' • ✓ جاهز'}
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
            ? <><Loader2 size={16} className="onevone-spin" /> جاري البدء...</>
            : opponentJoined
              ? <><Swords size={16} /> ابدأ المباراة</>
              : <span>في انتظار انضمام الخصم...</span>}
        </button>
      )}

      {startError && <div className="onevone-error">{startError}</div>}

      {!isOwner && showStartButton && (
        <div className="onevone-waiting-note">
          في انتظار مالك الغرفة لبدء المباراة...
        </div>
      )}

      {waitingForOpponentToLoad && (
        <div className="onevone-waiting-note">
          <Loader2
            size={14}
            className="onevone-spin"
            style={{ marginLeft: 6, verticalAlign: 'middle' }}
          />
          في انتظار تحميل الخصم للتحدي...
        </div>
      )}
    </section>
  );
};
