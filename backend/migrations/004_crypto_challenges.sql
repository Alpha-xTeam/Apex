-- Migration 004: Crypto/Forensics Challenge Pool
-- Storage: database (not JSON files)
-- Sample: 1 Vigenere challenge inserted below
-- All forbidden anti-patterns validated at app layer; see CHALLENGE_FORMAT_SPEC.md

BEGIN;

-- Required extension for SHA-256 hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----------------------------------------------------------------------------
-- Table: crypto_challenges
-- Stores crypto/forensics challenges with pre-computed command outputs
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crypto_challenges (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_role       text NOT NULL CHECK (team_role IN ('blue', 'red')),
  module          text NOT NULL,
  title           text NOT NULL,
  story           text NOT NULL,
  files           jsonb NOT NULL DEFAULT '{}'::jsonb,
  file_metadata   jsonb NOT NULL DEFAULT '{}'::jsonb,
  command_outputs jsonb NOT NULL DEFAULT '{}'::jsonb,
  hints           jsonb NOT NULL DEFAULT '[]'::jsonb,
  tools_whitelist text[] NOT NULL DEFAULT '{}'::text[],
  flag_hash       text NOT NULL,
  flag_preview    text,
  difficulty      text NOT NULL CHECK (difficulty IN ('مبتدئ', 'متوسط', 'قوي')),
  xp_reward       integer NOT NULL DEFAULT 150,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crypto_team_module ON public.crypto_challenges (team_role, module);
CREATE INDEX IF NOT EXISTS idx_crypto_difficulty  ON public.crypto_challenges (difficulty);

-- RLS: open read, full control for service role
DROP POLICY IF EXISTS "Allow all access to crypto_challenges" ON public.crypto_challenges;
CREATE POLICY "Allow all access to crypto_challenges" ON public.crypto_challenges
  FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.crypto_challenges ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- Helper: Vigenere encryption (used for sample challenge generation)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.vigenere_encrypt(plaintext text, key text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  result text := '';
  i int := 1;
  k_offset int;
  p_char text;
  p_num int;
  k_num int;
  c_num int;
BEGIN
  WHILE i <= length(plaintext) LOOP
    p_char := substr(plaintext, i, 1);
    IF p_char ~ '[A-Za-z]' THEN
      k_offset := ((i - 1) % length(key)) + 1;
      p_num := ascii(upper(p_char)) - 65;
      k_num := ascii(upper(substr(key, k_offset, 1))) - 65;
      c_num := (p_num + k_num) % 26;
      IF p_char = lower(p_char) THEN
        result := result || chr(c_num + 65 + 32);
      ELSE
        result := result || chr(c_num + 65);
      END IF;
    ELSE
      result := result || p_char;
    END IF;
    i := i + 1;
  END LOOP;
  RETURN result;
END;
$$;

-- ----------------------------------------------------------------------------
-- Sample Challenge 1: Vigenere Cipher (Red Team, encryption-basics, متوسط)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_plain  text := 'Operation Silent Shadow Report Target Zentech Mainframe Status Encrypted. Project Code Shadow. Content CyberArena{kasiski_1863_renewed}. End Transmission.';
  v_key    text := 'SHADOW';
  v_cipher text;
  v_files  jsonb;
  v_meta   jsonb;
  v_cmds   jsonb;
  v_hints  jsonb;
  v_flag   text := 'CyberArena{kasiski_1863_renewed}';
  v_hash   text;
  v_intercepted_b64 text;
  v_freq_stdout text;
  v_kasiski_stdout text;
  v_metadata text := 'Source: 192.0.2.45:443\nTimestamp: 2026-04-15T03:14:22Z\nProtocol: TLSv1.3\nNote: Encrypted payload, key unknown. Analysts suspect older cipher from cold-war era.';
BEGIN
  v_cipher := public.vigenere_encrypt(v_plain, v_key);
  v_hash   := encode(digest(v_flag, 'sha256'), 'hex');
  v_intercepted_b64 := encode(convert_to(v_cipher, 'UTF8'), 'base64');

  v_files := jsonb_build_object(
    'intercepted.bin', v_intercepted_b64,
    'metadata.txt',    encode(convert_to(v_metadata, 'UTF8'), 'base64')
  );

  v_meta := jsonb_build_object(
    'intercepted.bin', jsonb_build_object(
      'size', length(v_cipher),
      'type', 'text/plain',
      'perms', '0644',
      'mtime', '2026-04-15T03:14:22Z'
    ),
    'metadata.txt', jsonb_build_object(
      'size', length(v_metadata),
      'type', 'text/plain',
      'perms', '0644',
      'mtime', '2026-04-15T03:14:22Z'
    )
  );

  v_freq_stdout := E'Letter frequency analysis of intercepted.bin:\n' ||
                   E'  E: 14.2%   T: 11.8%   A: 9.3%    O: 8.1%    N: 7.6%\n' ||
                   E'  I: 7.2%    R: 6.8%    S: 6.4%    H: 5.9%    D: 5.1%\n' ||
                   E'\nIndex of Coincidence: 0.0664\n' ||
                   E'Detected: polyalphabetic substitution (IC > 0.060, expected ~0.0385 for random)';

  v_kasiski_stdout := E'Kasiski examination results:\n' ||
                      E'Repeating trigrams found:\n' ||
                      E'  QPW at positions [12, 38, 64] -> key length GCD(26, 52) = 26\n' ||
                      E'  WTP at positions [24, 50] -> key length GCD(26) = 26\n' ||
                      E'\nLikely key length: 6\n' ||
                      E'Suggested action: run ic split-test with key length 6 to recover key letters';

  v_cmds := jsonb_build_object(
    'cat:intercepted.bin',      jsonb_build_object('stdout', v_cipher,                          'stderr', '', 'exit_code', 0),
    'cat:metadata.txt',         jsonb_build_object('stdout', v_metadata,                        'stderr', '', 'exit_code', 0),
    'strings:intercepted.bin',  jsonb_build_object('stdout', v_cipher,                          'stderr', '', 'exit_code', 0),
    'file:intercepted.bin',     jsonb_build_object('stdout', 'intercepted.bin: ASCII text',     'stderr', '', 'exit_code', 0),
    'freq:intercepted.bin',     jsonb_build_object('stdout', v_freq_stdout,                     'stderr', '', 'exit_code', 0),
    'kasiski:intercepted.bin',  jsonb_build_object('stdout', v_kasiski_stdout,                  'stderr', '', 'exit_code', 0),
    'ic:intercepted.bin',       jsonb_build_object('stdout', E'Index of Coincidence: 0.0664\nExpected for English plaintext: 0.0667\n-> Strong match for polyalphabetic cipher', 'stderr', '', 'exit_code', 0),
    'ls:/home/agent/challenge', jsonb_build_object('stdout', E'intercepted.bin  metadata.txt',  'stderr', '', 'exit_code', 0),
    'ls',                       jsonb_build_object('stdout', E'intercepted.bin  metadata.txt',  'stderr', '', 'exit_code', 0)
  );

  v_hints := jsonb_build_array(
    jsonb_build_object('level', 1, 'text', 'ابدأ بـ strings أو cat على intercepted.bin. لاحظ أن الملف ASCII text، مو binary.', 'xp_cost', 25),
    jsonb_build_object('level', 2, 'text', 'استخدم freq ثم ic. الـ IC قريب من 0.066 — هذا توقيع polyalphabetic substitution.', 'xp_cost', 50),
    jsonb_build_object('level', 3, 'text', 'Kasiski examination يظهر أن طول المفتاح 6. جرب key cracking بأدوات Python المخصصة.', 'xp_cost', 100)
  );

  INSERT INTO public.crypto_challenges (
    team_role, module, title, story, files, file_metadata,
    command_outputs, hints, tools_whitelist,
    flag_hash, flag_preview, difficulty, xp_reward
  ) VALUES (
    'red', 'encryption-basics',
    'اعتراض في Zentech Mainframe',
    'مختبر Zentech في برلين تسرّبت منه رسالة اعتُرضت عبر تحليل packet في 15 أبريل 2026 الساعة 03:14 UTC. حجم الرسالة 165 بايت. المحللون يشتبهون بأنها مشفّرة بخوارزمية من حقبة الحرب الباردة. استخرج النص الأصلي للحصول على الـ flag.',
    v_files, v_meta, v_cmds, v_hints,
    ARRAY['cat','strings','file','freq','ic','kasiski','ls','python3','crack_vigenere','xxd','wc'],
    v_hash, 'Cybe...',
    'متوسط', 150
  )
  ON CONFLICT DO NOTHING;
END $$;

COMMIT;

-- Verification query (commented, run manually)
-- SELECT id, module, title, difficulty, xp_reward,
--        length(flag_hash) as hash_len,
--        jsonb_array_length(hints) as hint_count,
--        jsonb_object_keys(files) as files
-- FROM public.crypto_challenges;
