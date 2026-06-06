-- Migration 009: 1v1 Mode
-- Adds 4 minimal tables for the 1-vs-1 competitive mode.
-- All tables reference the existing `users` table (auth.users) and reuse
-- the per-type challenges tables (encryption_challenges,
-- web_exploitation_challenges, code_fixing_challenges, log_analysis_challenges).
--
-- Design notes:
--   * `onevone_rooms.code` is a 6-char base32 join code (unique index).
--   * `onevone_matches.state` is a small enum: waiting | countdown | playing |
--     overtime | finished. Timer ticks are derived from start_time + duration
--     (client + server compute the same value), but server is the authority.
--   * `onevone_submissions` is append-only. The first row with `is_correct=true`
--     is the winner; an index on (match_id, is_correct) makes that O(1).
--   * `winner_user_id` is set the moment a winning submission is accepted,
--     atomically with `state = 'finished'` via a single UPDATE (see backend).
--   * RLS is permissive (read/write for anon role) like the other pool tables;
--     the backend is the gatekeeper via the anon key + room token check.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----------------------------------------------------------------------------
-- 1v1 rooms — owner creates, picks side (red/blue), gets a code
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.onevone_rooms (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code            text NOT NULL UNIQUE,             -- 6-char base32 (e.g. "K7P3QA")
  owner_user_id   uuid NOT NULL,                    -- FK -> auth.users.id
  team_role       text NOT NULL CHECK (team_role IN ('red','blue')),
  status          text NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open','closed','abandoned')),
  challenge_source text NOT NULL DEFAULT 'random'   -- 'random' | 'manual:<id>'
                  CHECK (challenge_source LIKE 'random%' OR challenge_source LIKE 'manual:%'),
  challenge_id    text,                             -- populated once the match starts
  created_at      timestamptz NOT NULL DEFAULT now(),
  closed_at       timestamptz
);

CREATE INDEX IF NOT EXISTS idx_onevone_rooms_code   ON public.onevone_rooms (code);
CREATE INDEX IF NOT EXISTS idx_onevone_rooms_owner  ON public.onevone_rooms (owner_user_id);
CREATE INDEX IF NOT EXISTS idx_onevone_rooms_status ON public.onevone_rooms (status);

DROP POLICY IF EXISTS "Allow all access to onevone_rooms" ON public.onevone_rooms;
CREATE POLICY "Allow all access to onevone_rooms"
  ON public.onevone_rooms FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE public.onevone_rooms ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 1v1 players — exactly 2 rows per match (owner + joiner)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.onevone_players (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id         uuid NOT NULL REFERENCES public.onevone_rooms(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL,                    -- FK -> auth.users.id
  slot            smallint NOT NULL CHECK (slot IN (1,2)),  -- 1 = owner, 2 = joiner
  display_name    text NOT NULL,
  is_ready        boolean NOT NULL DEFAULT false,
  joined_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, slot),
  UNIQUE (room_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_onevone_players_room ON public.onevone_players (room_id);
CREATE INDEX IF NOT EXISTS idx_onevone_players_user ON public.onevone_players (user_id);

DROP POLICY IF EXISTS "Allow all access to onevone_players" ON public.onevone_players;
CREATE POLICY "Allow all access to onevone_players"
  ON public.onevone_players FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE public.onevone_players ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 1v1 matches — exactly 1 per room; state machine
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.onevone_matches (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id         uuid NOT NULL UNIQUE REFERENCES public.onevone_rooms(id) ON DELETE CASCADE,
  challenge_id    text NOT NULL,                    -- reuses existing per-type challenge id
  challenge_type  text NOT NULL                     -- 'crypto' | 'web' | 'code-fixing' | 'log-analysis'
                  CHECK (challenge_type IN ('crypto','web','code-fixing','log-analysis')),
  state           text NOT NULL DEFAULT 'waiting'
                  CHECK (state IN ('waiting','countdown','playing','overtime','finished')),
  -- server-authoritative timer:
  started_at      timestamptz,
  ends_at         timestamptz,                      -- main timer end
  overtime_ends_at timestamptz,                     -- overtime end (NULL until entered)
  main_duration_s integer NOT NULL DEFAULT 600,     -- 10 min main round
  overtime_duration_s integer NOT NULL DEFAULT 120, -- 2 min overtime
  winner_user_id  uuid,                             -- NULL while playing
  win_reason      text                              -- 'flag' | 'fix' | 'timeout' | 'overtime_draw'
                  CHECK (win_reason IS NULL OR win_reason IN ('flag','fix','timeout','overtime_draw','abandoned')),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_onevone_matches_room   ON public.onevone_matches (room_id);
CREATE INDEX IF NOT EXISTS idx_onevone_matches_state  ON public.onevone_matches (state);
CREATE INDEX IF NOT EXISTS idx_onevone_matches_winner ON public.onevone_matches (winner_user_id);

DROP POLICY IF EXISTS "Allow all access to onevone_matches" ON public.onevone_matches;
CREATE POLICY "Allow all access to onevone_matches"
  ON public.onevone_matches FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE public.onevone_matches ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 1v1 submissions — append-only audit log; first correct one wins
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.onevone_submissions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id        uuid NOT NULL REFERENCES public.onevone_matches(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL,                    -- FK -> auth.users.id
  submission      text NOT NULL,                    -- raw user input (flag text OR fixed code / ip / etc.)
  is_correct      boolean NOT NULL DEFAULT false,
  is_final        boolean NOT NULL DEFAULT false,   -- true => accepted, match should end
  received_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_onevone_sub_match   ON public.onevone_submissions (match_id);
CREATE INDEX IF NOT EXISTS idx_onevone_sub_correct ON public.onevone_submissions (match_id, is_correct);

DROP POLICY IF EXISTS "Allow all access to onevone_submissions" ON public.onevone_submissions;
CREATE POLICY "Allow all access to onevone_submissions"
  ON public.onevone_submissions FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE public.onevone_submissions ENABLE ROW LEVEL SECURITY;

COMMIT;

-- ---------------------------------------------------------------------------
-- Atomic "claim win" RPC.
--   Only ONE concurrent call can succeed. The UPDATE in PostgreSQL acquires
--   a row-level lock the instant the WHERE clause matches, so two parallel
--   requests for the same match_id are serialized: the loser sees ROW_COUNT=0
--   and learns who actually won.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.onevone_claim_win(
  p_match_id  uuid,
  p_user_id   uuid,
  p_win_reason text
) RETURNS TABLE(won boolean, winner_id uuid, final_state text)
LANGUAGE plpgsql
AS $$
DECLARE
  v_winner uuid;
  v_state  text;
BEGIN
  UPDATE public.onevone_matches m
     SET state         = 'finished',
         winner_user_id = p_user_id,
         win_reason     = p_win_reason
   WHERE m.id = p_match_id
     AND m.state IN ('playing', 'overtime')
  RETURNING m.winner_user_id, m.state
    INTO v_winner, v_state;

  IF FOUND THEN
    RETURN QUERY SELECT true, v_winner, v_state;
  ELSE
    SELECT m.winner_user_id, m.state
      INTO v_winner, v_state
      FROM public.onevone_matches m
     WHERE m.id = p_match_id;
    RETURN QUERY SELECT false, COALESCE(v_winner, NULL::uuid), COALESCE(v_state, 'unknown');
  END IF;
END;
$$;

-- Grant execute to the anon role (same RLS posture as the rest of the API).
GRANT EXECUTE ON FUNCTION public.onevone_claim_win(uuid, uuid, text) TO anon, authenticated;

-- Verification:
--   SELECT table_name FROM information_schema.tables
--     WHERE table_schema='public' AND table_name LIKE 'onevone_%'
--     ORDER BY table_name;
-- Expected: onevone_matches, onevone_players, onevone_rooms, onevone_submissions
