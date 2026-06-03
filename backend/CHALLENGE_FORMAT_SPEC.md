# Challenge Format Specification — Crypto/Forensics Track

**Version:** 0.1 (Draft)
**Last updated:** 2026-06-03
**Applies to:** `public.crypto_challenges` table (new)

---

## 1. Philosophy

التحدي الحقيقي يحاكي CTF/HTB. اللاعب **يكتشف** الخوارزمية ويكسرها بنفسه.
**ممنوع** تسليم الإجابة في story/task. **ممنوع** إنشاء `flag.txt` كاختصار.
العلم الصحيح يُخزَّن كـ `SHA-256 hash` فقط — اللاعب يدخل إجابته والـ backend يقارن الـ hash.

---

## 2. Database Schema

```sql
CREATE TABLE public.crypto_challenges (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_role       text NOT NULL CHECK (team_role IN ('blue', 'red')),
  module          text NOT NULL,  -- encryption-basics, hash-cracking, rsa-aes, ...
  title           text NOT NULL,
  story           text NOT NULL,  -- واقعي، ما يذكر اسم الخوارزمية
  files           jsonb NOT NULL DEFAULT '{}'::jsonb,
                   -- {filename: base64_content}
  file_metadata   jsonb NOT NULL DEFAULT '{}'::jsonb,
                   -- {filename: {size, type, perms, mtime}}
  command_outputs jsonb NOT NULL DEFAULT '{}'::jsonb,
                   -- {pattern: {stdout, stderr, exit_code}}
                   -- pattern: "cmd:args:filename" or "cmd:args"
  hints           jsonb NOT NULL DEFAULT '[]'::jsonb,
                   -- [{level: 1, text: "...", xp_cost: 25}, ...]
  tools_whitelist text[] NOT NULL DEFAULT '{}'::text[],
  flag_hash       text NOT NULL,  -- SHA-256 of correct flag
  flag_preview    text,           -- "Cybe..." for UX only (not the full flag)
  difficulty      text NOT NULL CHECK (difficulty IN ('مبتدئ', 'متوسط', 'قوي')),
  xp_reward       integer NOT NULL DEFAULT 150,
  created_at      timestamptz NOT NULL DEFAULT now()
);
```

### Indexes
- `idx_crypto_team_module` ON `(team_role, module)`
- `idx_crypto_difficulty` ON `(difficulty)`

### RLS
- `Allow all read` (like `blue_scenarios`)
- `Allow insert/update/delete` for service role only

---

## 3. Forbidden Anti-Patterns (in `story` + `task`)

**Validation script** يفحص كل challenge جديد/معدّل قبل الإدراج. أي ظهور لكلمة ممنوعة = reject.

### 3.1 أسماء الخوارزميات المباشرة
| Module | ممنوع |
|--------|-------|
| encryption-basics | `caesar`, `vigenere`, `rot13`, `base64`, `xor`, `aes`, `des` |
| hash-cracking | `md5`, `sha1`, `sha256`, `ntlm`, `bcrypt` |
| rsa-aes | `rsa`, `wiener`, `bleichenbacher`, `padding oracle` |
| steganography | `steganography`, `lsb`, `exiftool` |
| forensics | `volatility`, `memdump`, `pcap` |

### 3.2 أدوات مكشوفة
`john`, `hashcat`, `crackstation`, `cyberchef`, `openssl`, `binwalk`, `zsteg`

### 3.3 تسليم الإجابة
`الإجابة:`, `الحل:`, `العلم في`, `flag.txt`, `افتح flag`, `استخدم أداة X لكسر`, `المفتاح هو`, `الـ key:`, `crack with`

### 3.4 أسماء العلم في المتغير
`flag{...}`, `CTF{...}`, `APEX{...}` في `story` أو `task` (لكن `CyberArena{...}` مسموح في `flag_hash` فقط)

---

## 4. Tools Whitelist (Command Allow-list)

Backend endpoint `POST /api/training/terminal` يقبل أوامر من القائمة فقط:

### Reading
`cat`, `head`, `tail`, `strings`, `file`, `xxd`, `od`, `wc`, `hexdump`, `less`, `more`, `tac`, `rev`, `cut`, `tr`

### Navigation
`ls`, `cd`, `pwd`, `tree`, `find`, `stat`, `du`, `df`

### Encoding/Transform
`base64`, `base32`, `tr`, `sort`, `uniq`, `diff`, `nl`, `fold`, `column`

### Analysis (custom helpers)
`freq` — letter/byte frequency analysis
`ic` — Index of Coincidence
`ent` — Shannon entropy
`kasiski` — Kasiski examination (Vigenere key length)
`chi2` — chi-squared test against English
`identify` — magic-byte file identification

### Crypto (pre-computed)
`openssl` — limited subcommands: `rsa -text`, `rsautl -decrypt`, `enc -d -aes-256-cbc`
`hashcat -m <mode> hashes.txt wordlist.txt` — returns pre-computed results
`john --format=<fmt> hashes.txt` — returns pre-computed results
`rsatool`, `wiener` (custom Python wrappers)

### Shell
`echo`, `printf`, `test`, `expr`, `bc`, `date`
`python3 -c "..."` — sandboxed Python REPL with limited stdlib (no `os`, `subprocess`, `socket`)
`export VAR=value` (limited to challenge scope)

### **Forbidden (always rejected)**
`rm`, `mv`, `cp` outside challenge dir, `curl`, `wget`, `chmod`, `chown`, `sudo`, network commands, `dd` to devices

---

## 5. Terminal Endpoint Contract

### Request
```http
POST /api/training/terminal
Content-Type: application/json
Authorization: Bearer <user_token>

{
  "challenge_id": "uuid",
  "command": "cat intercepted.bin",
  "cwd": "/home/agent/challenge"
}
```

### Response (success)
```json
{
  "stdout": "THE CIPHERTEXT BYTES...",
  "stderr": "",
  "exit_code": 0,
  "files_changed": [],
  "duration_ms": 12
}
```

### Response (rejected)
```json
{
  "error": "command_not_allowed",
  "command": "rm -rf /",
  "reason": "rm is in deny-list"
}
```

### Response (file not found)
```json
{
  "stdout": "",
  "stderr": "cat: missing.bin: No such file or directory",
  "exit_code": 1
}
```

### Backend Logic
1. Validate challenge exists in `crypto_challenges`
2. Parse command → extract `cmd`, `args`, `filename`
3. Check `cmd in tools_whitelist` (challenge-specific) **AND** in global whitelist
4. Look up `command_outputs[pattern]`:
   - Pattern: `cat:args:filename` (specific)
   - Falls back to: `cat:filename`
   - Falls back to: `cat`
5. If not found, simulate generic behavior (e.g., `ls` returns file list from `files` keys)
6. Return result

---

## 6. Flag Validation

### Submission Endpoint
```http
POST /api/training/answer
{
  "challenge_id": "uuid",
  "answer": "CyberArena{kasiski_1863_renewed}"
}
```

### Backend
```python
import hashlib
expected_hash = challenge["flag_hash"]  # from DB
attempt_hash = hashlib.sha256(answer.strip().encode()).hexdigest()
secured = (attempt_hash == expected_hash)
```

### UI Behavior
- Wrong answer: `secured: false`, generic feedback ("حاول مرة أخرى")
- Hint spent: `xp_reward` reduced by `hints[i].xp_cost`
- Right answer: `secured: true`, full XP awarded, scenario deleted, refill triggered

---

## 7. Required Metadata (per challenge)

| Field | Type | Description |
|-------|------|-------------|
| `module` | enum | One of 28 modules in CYBER_SECURITY_TOPICS |
| `tools_whitelist` | string[] | Subset of global whitelist, e.g., `["cat", "freq", "python3", "kasiski"]` |
| `command_outputs` | jsonb | Pre-computed responses for common commands |
| `flag_hash` | sha256 hex | Lowercase, 64 chars |
| `hints` | jsonb array | 2-4 hints, increasing reveal |
| `difficulty` | enum | مبتدئ/متوسط/قوي |

---

## 8. Generator Prompt (Groq)

```
You are a CTF challenge author. Generate a realistic crypto/forensics challenge.

OUTPUT JSON ONLY with this exact structure:
{
  "title": "...",
  "story": "...",
  "files": { "filename": "<base64 of file content>" },
  "hints": [{"level":1,"text":"..."},{"level":2,"text":"..."}],
  "flag": "CyberArena{...}",
  "difficulty": "مبتدئ" | "متوسط" | "قوي"
}

RULES:
- NEVER name the algorithm in story/hints (no "Caesar", "MD5", "Vigenere", "AES")
- NEVER say "use tool X" or "the key is Y"
- NEVER use the word "flag.txt" or imply a pre-made file contains the answer
- Story should make the player curious, not instruct
- Files should be real data the player must analyze
- The flag should be the natural conclusion of solving the challenge
- Difficulty: stronger challenges have more steps, more files, more analysis
```

### Backend Validation
After Groq returns, run `validate_challenge(payload)`:
1. Lowercase + scan for forbidden words
2. SHA-256 hash the flag
3. Compute `command_outputs` for this specific payload
4. Insert into DB

---

## 9. Sample Challenge (full)

See `migrations/004_crypto_challenges.sql` for working SQL.

---

## 10. Migration Plan

| Step | Action | Status |
|------|--------|--------|
| 1 | Create `crypto_challenges` table | TODO |
| 2 | Add 1 sample challenge (Vigenere) | TODO |
| 3 | Build `/api/training/terminal` endpoint | TODO |
| 4 | Build `/api/training/answer` endpoint | TODO |
| 5 | Frontend: `<CyberLab>` component | TODO |
| 6 | Frontend: `<FlagInput>` with hash check | TODO |
| 7 | Add 14 more challenges (all 4 focus areas) | TODO |
| 8 | Wire into `populate_pool_background` | TODO |
| 9 | Anti-pattern validator in `generate_crypto_challenge` | TODO |
