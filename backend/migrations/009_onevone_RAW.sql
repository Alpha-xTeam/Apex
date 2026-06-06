-- ═══════════════════════════════════════════════════════════════════
--  1v1 MODE — MIGRATION 009
--  افتح: https://app.supabase.com/project/yevtnyokixocpihpdwqu/sql/new
--  الصق كل اللي تحت هذا السطر واضغط Run
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.onevone_rooms (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code            text NOT NULL UNIQUE,
  owner_user_id   uuid NOT NULL,
  team_role       text NOT NULL CHECK (team_role IN ('red','blue')),
  status          text NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open','closed','abandoned')),
  challenge_source text NOT NULL DEFAULT 'random'
                  CHECK (challenge_source LIKE 'random%' OR challenge_source LIKE 'manual:%'),
  challenge_id    text,
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

CREATE TABLE IF NOT EXISTS public.onevone_players (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id         uuid NOT NULL REFERENCES public.onevone_rooms(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL,
  slot            smallint NOT NULL CHECK (slot IN (1,2)),
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

CREATE TABLE IF NOT EXISTS public.onevone_matches (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id         uuid NOT NULL UNIQUE REFERENCES public.onevone_rooms(id) ON DELETE CASCADE,
  challenge_id    text NOT NULL,
  challenge_type  text NOT NULL
                  CHECK (challenge_type IN ('crypto','web','code-fixing','log-analysis')),
  state           text NOT NULL DEFAULT 'waiting'
                  CHECK (state IN ('waiting','countdown','playing','overtime','finished')),
  started_at      timestamptz,
  ends_at         timestamptz,
  overtime_ends_at timestamptz,
  main_duration_s integer NOT NULL DEFAULT 600,
  overtime_duration_s integer NOT NULL DEFAULT 120,
  winner_user_id  uuid,
  win_reason      text
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

CREATE TABLE IF NOT EXISTS public.onevone_submissions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id        uuid NOT NULL REFERENCES public.onevone_matches(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL,
  submission      text NOT NULL,
  is_correct      boolean NOT NULL DEFAULT false,
  is_final        boolean NOT NULL DEFAULT false,
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
-- Atomic claim-win RPC (prevents the "second account wins" race).
-- Only ONE concurrent call can update the row; the loser sees ROW_COUNT=0
-- and reads back the real winner.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.onevone_claim_win(
  p_match_id   uuid,
  p_user_id    uuid,
  p_win_reason text
) RETURNS TABLE(won boolean, winner_id uuid, final_state text)
LANGUAGE plpgsql
AS $$
DECLARE
  v_winner uuid;
  v_state  text;
BEGIN
  UPDATE public.onevone_matches m
     SET state          = 'finished',
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

GRANT EXECUTE ON FUNCTION public.onevone_claim_win(uuid, uuid, text) TO anon, authenticated;
