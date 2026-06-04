-- Migration 005: Web Exploitation Challenge Pool
-- Stores fully-realized web exploitation challenges (Red Team offensive)
-- Schema mirrors encryption_challenges for consistency
-- Python is the source of truth for flag_hash; AI only writes the recipe.
-- Table name follows the per-type convention (e.g. encryption_challenges,
-- web_challenges, forensics_challenges) as specified in AGENTS.md.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----------------------------------------------------------------------------
-- Table: web_challenges
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.web_challenges (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_role       text NOT NULL CHECK (team_role IN ('blue', 'red')),
  module          text NOT NULL,           -- xss | sql-injection | csrf | ssrf | idor | lfi-rfi | xxe | command-injection
  vuln_type       text NOT NULL,           -- reflected | stored | dom | blind | time-based | union | oob | etc.
  title           text NOT NULL,
  story           text NOT NULL,
  task_outline    text NOT NULL,
  files           jsonb NOT NULL DEFAULT '{}'::jsonb,
  file_metadata   jsonb NOT NULL DEFAULT '{}'::jsonb,
  command_outputs jsonb NOT NULL DEFAULT '{}'::jsonb,
  hints           jsonb NOT NULL DEFAULT '[]'::jsonb,
  tools_whitelist text[] NOT NULL DEFAULT '{}'::text[],
  flag_hash       text NOT NULL,
  flag_preview    text,
  difficulty      text NOT NULL CHECK (difficulty IN ('مبتدئ', 'متوسط', 'قوي')),
  xp_reward       integer NOT NULL DEFAULT 150,
  html_preview    text,                    -- the vulnerable HTML page
  expected_payload text,                   -- the payload that solves it
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_web_team_module ON public.web_challenges (team_role, module);
CREATE INDEX IF NOT EXISTS idx_web_difficulty  ON public.web_challenges (difficulty);

-- RLS: open read, full control for service role
DROP POLICY IF EXISTS "Allow all access to web_challenges" ON public.web_challenges;
CREATE POLICY "Allow all access to web_challenges"
  ON public.web_challenges
  FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.web_challenges ENABLE ROW LEVEL SECURITY;

COMMIT;

-- Verification:
-- SELECT id, module, vuln_type, title, difficulty, xp_reward FROM public.web_challenges LIMIT 5;
