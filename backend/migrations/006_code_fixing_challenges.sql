-- Migration 006: Code Fixing Challenges (Blue Team)
-- Creates the table for code-fixing challenges where trainees fix vulnerable code

CREATE TABLE IF NOT EXISTS public.code_fixing_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_role text NOT NULL DEFAULT 'blue' CHECK (team_role IN ('blue')),
  language text NOT NULL CHECK (language IN ('C++','JAVA','PYTHON','JAVASCRIPT','PHP','RUST')),
  module text NOT NULL,
  title text NOT NULL,
  story text NOT NULL,
  task_outline text NOT NULL,
  vulnerable_code text NOT NULL,
  vulnerability_type text NOT NULL,
  vulnerability_description text NOT NULL,
  hints jsonb DEFAULT '[]'::jsonb,
  difficulty text CHECK (difficulty IN ('مبتدئ','متوسط','قوي')),
  xp_reward integer DEFAULT 150,
  created_at timestamptz DEFAULT now()
);

-- Indexes for fast pool queries
CREATE INDEX IF NOT EXISTS idx_code_fixing_team_lang ON public.code_fixing_challenges(team_role, language);
CREATE INDEX IF NOT EXISTS idx_code_fixing_difficulty ON public.code_fixing_challenges(difficulty);

-- RLS: open read for anon (same pattern as other challenge tables)
ALTER TABLE public.code_fixing_challenges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Open read for anon" ON public.code_fixing_challenges
  FOR SELECT
  USING (true);
