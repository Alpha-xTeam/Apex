-- 008_log_analysis_challenges.sql
-- Creates the log-analysis challenge table + storage bucket for blue team

-- =========================================================================
-- 1. Challenge table
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.log_analysis_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_role text NOT NULL DEFAULT 'blue' CHECK (team_role IN ('blue')),
  log_type text NOT NULL CHECK (log_type IN ('apache','nginx','syslog','auth','firewall','waf','iis')),
  module text NOT NULL DEFAULT 'forensics',
  title text NOT NULL,
  story text NOT NULL,
  task_outline text NOT NULL,
  -- Storage (Supabase Storage bucket "log-analysis-files")
  storage_path text NOT NULL,
  file_size_bytes integer,
  log_metadata jsonb DEFAULT '{}'::jsonb,
  -- Expected answers (for grading)
  expected_attack_type text NOT NULL,
  expected_attacker_ip text,
  expected_timestamp text,
  expected_ioc text,
  vulnerability_description text NOT NULL,
  hints jsonb DEFAULT '[]'::jsonb,
  difficulty text CHECK (difficulty IN ('مبتدئ','متوسط','قوي')),
  xp_reward integer DEFAULT 150,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_log_analysis_team_type ON public.log_analysis_challenges(team_role, log_type);
CREATE INDEX IF NOT EXISTS idx_log_analysis_difficulty ON public.log_analysis_challenges(difficulty);

ALTER TABLE public.log_analysis_challenges ENABLE ROW LEVEL SECURITY;

-- Public read for anon
DROP POLICY IF EXISTS "Open read for anon" ON public.log_analysis_challenges;
CREATE POLICY "Open read for anon" ON public.log_analysis_challenges
  FOR SELECT USING (true);

-- Backend can write (anon key bypass via service-role OR via API key with elevated perms)
DROP POLICY IF EXISTS "Service role insert" ON public.log_analysis_challenges;
CREATE POLICY "Service role insert" ON public.log_analysis_challenges
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Service role delete" ON public.log_analysis_challenges;
CREATE POLICY "Service role delete" ON public.log_analysis_challenges
  FOR DELETE USING (true);

-- =========================================================================
-- 2. Supabase Storage bucket
-- =========================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'log-analysis-files',
  'log-analysis-files',
  true,
  2097152,  -- 2 MB max
  ARRAY['text/plain', 'text/x-log', 'application/octet-stream']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- =========================================================================
-- 3. Storage RLS — public read for the log-analysis bucket
-- =========================================================================
DROP POLICY IF EXISTS "Public read log-analysis-files" ON storage.objects;
CREATE POLICY "Public read log-analysis-files"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'log-analysis-files');

-- Allow uploads to log-analysis-files (backend uses service-role key, which bypasses RLS anyway)
DROP POLICY IF EXISTS "Service role upload log-analysis-files" ON storage.objects;
CREATE POLICY "Service role upload log-analysis-files"
  ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'log-analysis-files');

DROP POLICY IF EXISTS "Service role delete log-analysis-files" ON storage.objects;
CREATE POLICY "Service role delete log-analysis-files"
  ON storage.objects
  FOR DELETE
  USING (bucket_id = 'log-analysis-files');
