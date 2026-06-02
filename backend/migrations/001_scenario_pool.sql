-- Scenario cache pool: lightweight seeds; Groq builds full challenges at runtime.
-- Run in Supabase SQL editor for project yevtnyokixocpihpdwqu

CREATE TABLE IF NOT EXISTS public.blue_scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module text NOT NULL,
  title text NOT NULL,
  story text NOT NULL,
  task_outline text NOT NULL,
  difficulty text NOT NULL DEFAULT 'متوسط'
    CHECK (difficulty = ANY (ARRAY['مبتدئ'::text, 'متوسط'::text, 'قوي'::text])),
  xp_reward integer NOT NULL DEFAULT 150,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.red_scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module text NOT NULL,
  title text NOT NULL,
  story text NOT NULL,
  task_outline text NOT NULL,
  difficulty text NOT NULL DEFAULT 'متوسط'
    CHECK (difficulty = ANY (ARRAY['مبتدئ'::text, 'متوسط'::text, 'قوي'::text])),
  xp_reward integer NOT NULL DEFAULT 150,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.blue_scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.red_scenarios ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'blue_scenarios' AND policyname = 'Allow all access to blue_scenarios'
  ) THEN
    CREATE POLICY "Allow all access to blue_scenarios"
      ON public.blue_scenarios FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'red_scenarios' AND policyname = 'Allow all access to red_scenarios'
  ) THEN
    CREATE POLICY "Allow all access to red_scenarios"
      ON public.red_scenarios FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- One-time seed from legacy challenge tables (story + task only)
INSERT INTO public.blue_scenarios (module, title, story, task_outline, difficulty, xp_reward)
SELECT module, title, story, task, difficulty, COALESCE(xp_reward, 150)
FROM public.blue_challenges
WHERE NOT EXISTS (SELECT 1 FROM public.blue_scenarios LIMIT 1);

INSERT INTO public.red_scenarios (module, title, story, task_outline, difficulty, xp_reward)
SELECT module, title, story, task, difficulty, COALESCE(xp_reward, 150)
FROM public.red_challenges
WHERE NOT EXISTS (SELECT 1 FROM public.red_scenarios LIMIT 1);
