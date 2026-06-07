# CyberArena — Project Guide

> This document is the **contract every AI / agent must follow** when working
> on the CyberArena codebase. It captures only the general, cross-cutting
> rules. Challenge-type-specific details (algorithms, flag patterns, seed
> structures, hints, etc.) live in their own per-type modules and are **not**
> duplicated here.

## Supabase Project
- **Project ID**: `yevtnyokixocpihpdwqu`
- **Organization**: `vilfthlnaltfhseywiqq`
- **Region**: `ap-southeast-1`
- **Database**: Supabase PostgreSQL (`users`, `leaderboard`, `certificates`,
  one challenges table per type — e.g. `encryption_challenges`, future
  `web_challenges`, `forensics_challenges`, ...)

## Stack
- **Frontend**: React 19 + TypeScript + Vite
- **Backend**: Python 3.11+ (FastAPI, httpx, uvicorn, cryptography) — Dockerfile pins `python:3.11-slim`
- **Primary AI**: Cloudflare Workers AI (default `@cf/qwen/qwen2.5-coder-32b-instruct`)
- **Secondary AI**: Groq API (default `llama-3.1-8b-instant` via `GROQ_MODEL`)
- **Tertiary AI**: NVIDIA integrate API (default `deepseek-ai/deepseek-v4-pro`
  via `NVIDIA_MODEL`) — used only when Cloudflare and Groq are unreachable
- **Quaternary AI** (log-analysis feedback only): Mistral API
  (`mistral-large-latest` via `MISTRAL_MODEL`) — used by
  `evaluate_log_analysis` to grade free-text explanations in Arabic
- **Database**: Supabase PostgreSQL
- **Language**: Arabic (RTL) with English (LTR) toggle; site is Arabic-first,
  every UI string lives in `src/i18n/translations.ts`

## Environment Variables (all in `CyberArena/.env`, never hardcoded)
| Var | Purpose |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Anon key (read) — used by backend for DB writes too |
| `CLOUDFLARE_API_TOKEN` | Primary AI |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account id for Workers AI |
| `CLOUDFLARE_MODEL` | Primary model (default `@cf/qwen/qwen2.5-coder-32b-instruct`) |
| `GROQ_API_KEY` | Secondary AI |
| `GROQ_MODEL` | Optional model override (default `llama-3.1-8b-instant`) |
| `NVIDIA_API_KEY` | Tertiary AI |
| `NVIDIA_MODEL` | Optional model override (default `deepseek-ai/deepseek-v4-pro`) |
| `MISTRAL_API_KEY` | Quaternary AI (log-analysis feedback only) |
| `MISTRAL_MODEL` | Optional model override (default `mistral-large-latest`) |
| `MISTRAL_API_URL` | Mistral endpoint (default `https://api.mistral.ai/v1/chat/completions`) |
| `VITE_API_URL` | Frontend → backend base URL (default `http://localhost:8090/api`) |

**Rule:** every secret MUST live in `.env`. Never hardcode keys, tokens, or
project IDs in source.

## Backend Architecture
```
Frontend (React :5173) → Python Backend (FastAPI :8090) → Supabase (challenge pool) + AI providers
```

## Pool Architecture — Per-Type Generators

Each challenge **type** (crypto, web, forensics, ...) has its own table and
its own generator module:

```
backend/
  main.py                 ← orchestrator: starts one watcher per (type, team)
  crypto_generator.py     ← owns encryption_challenges
  web_generator.py        ← (future) owns web_challenges
  forensics_generator.py  ← (future) owns forensics_challenges
  ...
```

**Contract every generator must implement** (used by
`main.py::populate_pool_background`):

| Export | Purpose |
|---|---|
| `get_pool_count(team_role) -> int` | Query the table for a team |
| `async refill_pool(team_role, count) -> int` | Generate + insert; returns # inserted |
| `async start_pool_watcher(team_role)` | Long-running background coroutine |
| `POOL_TARGET`, `POOL_THRESHOLD`, `POOL_BATCH` | Pool tuning constants |

**Pool model (per team, per type):**
- `POOL_TARGET = 5` challenges cached
- `POOL_THRESHOLD = 2` — the watcher refills when the count drops to
  this number (NOT on every consumption)
- `POOL_BATCH = 3` — when a refill triggers, the generator creates
  exactly this many in parallel via `asyncio.gather`
- Per-team registration in `populate_pool_background` — a generator
  registers itself for the teams it actually serves (e.g. crypto
  currently serves red only). Don't blindly add both teams.

## AI Generation — Three-Tier Fallback (mandatory pattern)

Every generator follows this exact flow per slot:

```
1. Try PRIMARY AI (Cloudflare Workers AI) → on success: parse + validate + insert
                                           → on 429/timeout/4xx/exception: try next CF model
                                           → all CF models exhausted: goto 2
2. Try SECONDARY AI (Groq)                 → on success: parse + validate + insert
                                           → on any error: goto 3
3. Try TERTIARY AI (NVIDIA/DeepSeek)       → on success: parse + validate + insert
                                           → on any error: goto 4
4. Use curated seed                        → build + insert (safety net)
```

### Tier 1: Cloudflare Workers AI (PRIMARY) — Multi-Model Cycling

Cloudflare is the primary AI. The code cycles through **7 model candidates**
in order until one returns a successful response:

```python
CLOUDFLARE_MODEL_FALLBACKS = [
    "@cf/qwen/qwen2.5-coder-32b-instruct",   # 32B, code-specialized, fast
    "@cf/meta/llama-3.3-70b-instruct-fp8-fast",  # 70B, strong
    "@cf/meta/llama-3.1-70b-instruct",       # 70B fallback
    "@cf/mistralai/mistral-small-3.1-24b-instruct",  # 24B
    "@cf/openai/gpt-oss-120b",               # 120B OpenAI-compatible
    "@cf/openai/gpt-oss-20b",                # 20B OpenAI-compatible
    "@cf/meta/llama-3.1-8b-instruct",        # 8B last resort (verified working but weak)
]
```

For each model, the call uses `response_format: {"type": "json_object"}`
when supported. If a model returns 400/404/422 (rejects the param), the
helper `_post_with_json_fallback` retries the same model **without**
`response_format` automatically.

**Per-model timeout: 45 seconds.** A slow model will not block the pool
refill for the full default 90s.

**Cycle-on-failure rule:** on HTTP error (other than 429), timeout, or
exception → try the next model in the list. Do **not** retry the same
model.

### Tier 2: Groq (SECONDARY)

Used only when **all** Cloudflare models fail. Single model: default
`llama-3.1-8b-instant`. Also uses `response_format: {"type": "json_object"}`
with auto-fallback if rejected. 90s timeout.

### Tier 3: NVIDIA integrate API / DeepSeek (TERTIARY)

Used only when both Cloudflare and Groq fail. Single model: default
`deepseek-ai/deepseek-v4-pro`. Same `response_format` strategy. 90s timeout.

### Tier 4: Curated Seeds (Safety Net)

When all three AI tiers fail, the generator falls back to hand-crafted
seed challenges stored in code. Seeds must be:
- Complete, runnable, 30-60 line programs
- Have a clear, exploitable vulnerability
- Have valid Arabic `title`, `story`, `task_outline`, `vulnerability_description`
- Have exactly 3 hints

### Per-Round Retry Inside One Provider Call

For challenges that need multi-round parsing (e.g. `code_fixing_generator`),
the orchestrator runs up to **3 rounds** per slot, each going through the
full CF → Groq → NVIDIA chain:

- **Round 1:** normal Arabic prompt
- **Round 2:** stricter "raw JSON only" English prompt
- **Round 3:** ultra-minimal English instruction

If any round produces a parseable + valid challenge, return immediately.
If all 3 rounds × all 3 providers fail, fall back to seed.

### Why this exact order:

- AI is the soul of the platform — every slot should attempt AI first.
- Cloudflare is primary because: (a) generous free tier, (b) lowest
  per-token cost, (c) supports `response_format` on 70B+ models.
- A 429 is a hard per-minute quota. **Never** route a 429 to the next
  provider in the same tier (it likely shares backend infra and will 429
  too). Set a per-team backoff `_AI_BACKOFF_UNTIL[team_role] = now + 300`.
- Transient errors (timeout, read error, connect error) are network blips —
  the next provider can plausibly help.
- Curated seeds are the safety net, not the primary path.

### Per-team backoff

Track `_AI_BACKOFF_UNTIL: dict[str, float]` keyed by `team_role`. One
team's quota exhaustion must not lock the other team out.

### Why Python executes the recipe, not the AI

The LLM produces the *recipe* (plaintext, key, algorithm). Python runs
the algorithm and computes the encrypted bytes + flag hash. This makes
the output provably correct and immune to LLM hallucination.

## Data & Backend Rules
1. **Frontend** calls Python backend at `VITE_API_URL` (default:
   `http://localhost:8090/api`).
2. **Python backend** proxies auth and XP to existing Supabase Edge Functions
   (`cyberarena-auth`, `cyberarena-xp`).
3. **Supabase** stores **fully-realized challenges** (one table per type).
   The `flag_hash` column is the source of truth for the answer; the
   `flag_preview` shows `CyberArena{<hex>}` to the student.
4. **No direct database queries from frontend** — all data goes through the
   Python backend.
5. **Auto-purge disabled**: curated challenges are trusted. The watcher only
   refills when count drops to `POOL_THRESHOLD`.
6. **UTF-8 in subprocesses**: any backend code that runs a subprocess for
   the student (terminal, python exec) must set
   `PYTHONIOENCODING=utf-8` + `PYTHONUTF8=1` and `errors="replace"` — Windows
   defaults to cp1252 which breaks Arabic output.

## Challenge Type vs Module — the single source of truth

### The two columns

Each per-type challenges table carries TWO distinct fields:

| Column      | Meaning                                                                 | Allowed values                                                                                              |
|-------------|-------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------|
| `module`    | **Challenge type** — which editor the front-end must render.            | Exactly **one** of: `crypto`, `web`, `code-fixing`, `log-analysis`, `vulnerability-hunter`                  |
| `topic`     | **Specific subject** of the row (xss, sqli, hash-cracking, …). Free-form. | Any short kebab-case string the pool watcher / dashboard wants to filter on. |

The two are **never** the same string (with the trivial exception of
`log-analysis`, where the legacy data had no finer distinction).

### Canonical mapping (enforced by CHECK constraints)

| Table                             | `module` (forced)    | Sample `topic` values                                                |
|-----------------------------------|----------------------|----------------------------------------------------------------------|
| `encryption_challenges`           | `crypto`             | `encryption-basics`, `hash-cracking`, `rsa-aes`                      |
| `web_exploitation_challenges`     | `web`                | `xss`, `sqli`, `csrf`, `idor`, `lfi-rfi`, `xxe`, `ssrf`, `cmdi`, `auth`, `upload` |
| `code_fixing_challenges`          | `code-fixing`        | `web-security`, `systems-security`                                   |
| `log_analysis_challenges`         | `log-analysis`       | `log-analysis`                                                       |
| `vulnerability_hunter_challenges` | `vulnerability-hunter` | `secure-coding`, `web-security`, `cryptography`                    |

The constraints live in
`CyberArena/db/schema/011_challenge_type_normalization.sql` and are
named `<table>_module_canonical_chk`. A diagnostic view
`v_challenge_type_consistency` returns `bad_rows = 0` for every
table once the data is healthy — `scripts/check_state.py` queries
this view at startup.

### Front-end ↔ back-end contract

The HTTP request that lands on `POST /api/training/generate` carries
`module` in the JSON body, and **the value is always the canonical
challenge type**, not the topic:

```json
{ "module": "code-fixing", "path": "web-security",
  "category": "Code Fixing", "teamRole": "blue", "challengeId": "…" }
```

The back-end normalises this with
`app.api.training._normalize_challenge_type` and uses it for two
things:

1. **Row lookup.** `_fetch_scenario_by_id_typed` tries the matching
   per-type table first, then falls back to every other table the
   team owns. The old `fetch_scenario_by_id` always looked in
   `encryption_challenges` regardless of the actual type — that
   silent miss is what was sending code-fixing rows to the web
   editor.
2. **Type pinning.** `attach_scenario_metadata(training, scenario,
   challenge_type=…)` writes the canonical type into
   `training["type"]` and `training["challengeType"]`. The previous
   code used `scenario.get("module")` as a fallback, which
   silently routed a code-fixing row whose DB `module` was
   `web-security` to the web view.

The front-end then picks the editor by:

```ts
const isCodeFix        = teamRole === 'blue' && type === 'code-fixing';
const isLogAnalysis    = teamRole === 'blue' && type === 'log-analysis';
const isVulnHunter     = teamRole === 'blue' && type === 'vulnerability-hunter';
const isWebExploit     = challengeType === 'web' || ['sqli','xss',…].includes(type);
const isCrypto         = challengeType === 'crypto' || type === 'crypto';
```

The dashboard list endpoint (`GET /api/training/list`) projects the
DB row to the same shape via `app.services.challenge_loader`'s
`map_*_row_to_training` functions. **All five mappers now hard-code
`type` to the canonical value** (e.g. `map_code_fixing_row_to_training`
always returns `"type": "code-fixing"`); the old behaviour of
reading `row.get("module")` is gone.

### Rules for AI generators (mandatory)

Every generator in `app/generators/` MUST, when inserting a row into
its per-type table:

1. Set `module` to the **canonical challenge type** for that
   generator. No exceptions. Even if the topic is `xss`, a row going
   into `web_exploitation_challenges` MUST have `module = 'web'`.
2. Set `topic` to the **specific subject** of the row (e.g. `xss`,
   `sqli`, `hash-cracking`, `secure-coding`).
3. **Never** put a topic string in the `module` column. The DB
   CHECK constraint will reject it anyway, but the generator should
   not try.

The existing `app/services/challenge_loader.py::map_*_row_to_training`
functions are the canonical examples; copy their style.

### Rules for new challenge types

When adding a sixth challenge type:

1. Create the table with a `module` column constrained to the new
   canonical value, a `topic` column, and the standard per-type
   columns (see `db/schema/002..006_*.sql` for the schema template).
2. Add a `map_<type>_row_to_training` function in
   `app/services/challenge_loader.py` that hard-codes
   `"type": "<the new canonical value>"`.
3. Extend `app.services.supabase_service.scenario_table` with the
   new mapping.
4. Extend `app.api.training._CANONICAL_CHALLENGE_TYPES` with the
   new aliases.
5. Extend `app.generators.REGISTRY` with the new generator.
6. Extend the dashboard list loop in
   `app.api.training.list_challenges` with the new type.
7. Extend the front-end `TrainingSession` routing with the new
   `is<NewType>Challenge` boolean (and follow the in-editor vs
   in-1v1 rules in the "1v1 Mode" section below).

Do not skip any of these — the new type will silently misroute.

### Per-type table schema (current)

Each per-type table follows the same shape — only the additional
per-type columns differ. The canonical columns are:

| Column           | Type        | Notes |
|------------------|-------------|-------|
| `id`             | `uuid`      | PK |
| `team_role`      | `text`      | `'red'` or `'blue'` (CHECK enforced) |
| `module`         | `text`      | Canonical challenge type (CHECK enforced — see table above) |
| `topic`          | `text`      | Specific subject (free-form) — added by migration 011 |
| `title`          | `text`      | Arabic display title |
| `story`          | `text`      | Arabic context paragraph |
| `task_outline`   | `text`      | Arabic student instructions |
| `difficulty`     | `text`      | `'مبتدئ'` / `'سهل'` / `'متوسط'` / `'قوي'` / `'خبير'` (CHECK enforced) |
| `xp_reward`      | `int`       | 100/150/200 |
| `hints`          | `jsonb`     | `[{"level":1,"text":…,"xp_cost":20}, …]` |
| `created_at`     | `timestamptz` | Default `now()` |

The legacy red-team crypto/web tables additionally carry `files`,
`file_metadata`, `command_outputs`, `tools_whitelist`, `flag_hash`,
and `flag_preview`. The blue-team tables (code-fixing / log-analysis
/ vulnerability-hunter) carry the per-type challenge payload columns
(`vulnerable_code`, `vulnerability_type`, `vulnerability_class`,
`vulnerability_description`, `language`, …) instead of the flag
columns because the validation is structured, not a single hash.

- **Flag format**: `CyberArena{<64-hex>}` — `flag_hash = sha256(flag_preview)`
- **Anti-patterns enforced** in `ScenarioSpec.validate()`:
  - No algorithm names in `task_outline` (no AES/RSA/MD5/SHA/HMAC/XOR/...)
  - Story is allowed to use contextual jargon (hash, salt, signature)

## Backend API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth` | Signup / Login (proxied to `cyberarena-auth`) |
| POST | `/api/xp` | Get / Add XP (proxied to `cyberarena-xp`) |
| POST | `/api/training/generate` | Load a cached challenge by id |
| POST | `/api/training/evaluate` | Evaluate a code fix (blue team) |
| GET  | `/api/training/list` | List cached challenges for a team |
| POST | `/api/training/terminal` | Run a command in the simulated terminal |
| POST | `/api/training/terminal/write` | Write/edit a file in the student's workdir |
| GET  | `/api/training/terminal/list` | List the student's workdir files |

## 1v1 Mode (head-to-head match) — applies to **every** challenge type

> **Read this section before adding ANY new challenge type.** Every
> challenge type — current (`web`, `crypto`, `code-fixing`,
> `log-analysis`) and future (`forensics`, `network`, `reverse`, …) —
> MUST satisfy this contract or it cannot be played 1v1.

### What 1v1 means in this app

Two players enter the same room, race against the clock on the
**same** challenge instance, and the first to submit a server-validated
correct answer wins. The match is owned by a single PostgreSQL row in
`onevone_matches`; the **win is claimed atomically** by a stored
procedure (`onevone_claim_win`) and broadcast to both clients over
Server-Sent Events.

### The 1v1 contract (mandatory for every challenge type)

#### Backend — every new challenge type must wire 3 things

1. **Loader** in `CyberArena/onevone_router.py::get_match_challenge`
   and `_load_challenge_row`. Map the new type to its table and to the
   row-to-`TrainingData` mapper in `main.py`. Without this the 1v1
   room can't hand the same challenge to both players.
2. **Verifier branch** in
   `CyberArena/onevone_router.py::_ai_check_blue_answer` (blue team)
   **and** `_check_red_answer` (red team). The verifier returns
   `bool`. The current dispatch is:
   ```python
   if challenge_type in ("web", "crypto"):
       correct = _check_red_answer(...)        # string flag
   elif challenge_type in ("code-fixing", "log-analysis"):
       correct = await _ai_check_blue_answer(...)  # structured payload
   ```
   New blue types go into the second branch with their own payload
   shape; new red types go into the first with a flag string. **Do
   not** add a third top-level `if` — extend the existing dispatch.
3. **Win claim** is automatic. `submit_answer` already calls
   `onevone_claim_win` whenever the verifier returns `True`, so any
   type wired above gets the atomic win / race-lost behaviour for
   free. The DB function does the UPDATE … WHERE state IN
   ('playing','overtime') RETURNING trick that serialises concurrent
   calls.

#### Frontend — every challenge-type editor must wire 3 things

The single entry point that 1v1 uses is the `onChallengeSolved`
callback passed from `<OneVOneArena>` to `<TrainingSession>`. Any
challenge type that ships its own editor component must follow the
same three rules the existing `CodeFixEditor` and `LogAnalysisEditor`
follow:

1. **Call `onChallengeSolved?.(payload)` exactly once per successful
   solve.** `payload` is whatever the verifier expects:
   - `crypto` / `web` (red team): the flag **string**
   - `code-fixing` (blue team): `{ fixedCode: string }`
   - `log-analysis` (blue team):
     `{ attackType, attackerIp, timestamp, ioc, explanation? }`
   - **future types**: add the new shape to the
     `SubmissionPayload` union in `OneVOneArena.tsx` and to the
     verifier dispatch above.
2. **Accept and honour an `inOneVOne?: boolean` prop.** When `true`,
   the editor MUST **suppress its own in-editor success celebration**
   (the confetti + "Continue" button). The
   `<OneVOneResultModal>` is the single source of truth for the
   match outcome. The render guard is exactly:
   ```tsx
   {result && result.success && !inOneVOne && (
     <SuccessCelebration ... />
   )}
   ```
   `TrainingSession` already passes `inOneVOne={!!onChallengeSolved}`
   to both existing editors. New editors must do the same.
3. **Never call `onBack` as the success path in 1v1.** `onBack` is
   wired to `handleTrainingBack`, which only navigates away when the
   match has actually reached `state === 'finished'` in the SSE
   stream. Calling it earlier just re-opens the result modal
   (`setShowResultModal(true)`) and looks like a no-op to the user.
   Success / failure UI in 1v1 mode is owned by the result modal,
   not by the editor.

#### Modal stacking — non-negotiable z-index rule

The `<OneVOneResultModal>` overlay is `z-index: 10000`. **Every**
in-editor success / failure / celebration overlay MUST stay at
`z-index < 10000` so the 1v1 result is always the topmost layer.
Current values: `.celebration-overlay` (CodeFixEditor /
LogAnalysisEditor) is `z-index: 9999`. New editor overlays must use
`≤ 9999` or be hidden via the `inOneVOne` prop.

#### Win / loss data flow (no editor is allowed to skip any of these)

```
Student submits in editor
        │
        ▼
Editor → /api/training/evaluate-{type}        (regular training eval)
        │  secured/passed = true
        ▼
Editor → onChallengeSolved?.(payload)         (TrainingSession → OneVOneArena)
        │
        ▼
OneVOneArena → POST /api/onevone/matches/{id}/submit
        │
        ▼
Backend:  _ai_check_blue_answer / _check_red_answer
        │  correct = True
        ▼
Backend:  onevone_claim_win (atomic DB function)
        │  won = True
        ▼
Backend:  broadcast {type:"match_finished", winner, reason} via SSE
        │  broadcast {type:"state", match:{state:"finished", ...}} via SSE
        │
        ├──► Winner client: OneVOneResultModal opens (isWinner=true)
        │                  user clicks "Back to dashboard"
        │                  → handleLeave → POST /leave → onBack()
        │
        └──► Loser  client: OneVOneResultModal opens (isWinner=false)
                           user clicks "Back to dashboard"
                           → handleLeave → POST /leave → onBack()
```

The win is **persisted at the `onevone_claim_win` step** — the modal
button does not (and must not) re-trigger any write. The button is
purely navigation.

#### Add-a-new-type checklist (copy this when shipping a new type)

- [ ] Table created in Supabase + mapped in `_load_challenge_row`
- [ ] `get_match_challenge` returns the right `TrainingData` shape
- [ ] `_ai_check_blue_answer` (blue) **or** `_check_red_answer` (red)
      handles the new type's payload
- [ ] `onevone_claim_win` doesn't need changes (already type-agnostic)
- [ ] Editor component accepts `inOneVOne?: boolean` and hides its
      celebration when `true`
- [ ] Editor calls `onChallengeSolved?.(payload)` on success
- [ ] Editor does **not** call `onBack` as the success path
- [ ] Editor's overlay z-index ≤ 9999
- [ ] `SubmissionPayload` union in `OneVOneArena.tsx` extended
- [ ] Manual test: 2 browsers, solve the challenge, confirm
      `onev1_matches.winner_user_id` is set and both clients see
      the result modal.

## Challenge Loading — DB row is the source of truth

> **This is the rule the original refactor almost got right.** A
> previous version of `app/api/training.py::generate_training` would
> call Groq every time a student opened a challenge, asking the
> model to rebuild the full training dict from a one-line scenario.
> That broke three things at once: the routing (the model's
> `type` field didn't match the canonical challenge type), the
> payload (the model sometimes returned an empty `vulnerable_code`
> or `htmlPreview`), and the rate limit (one open = one Groq call,
> so a dashboard refresh would burn 429s).

### The correct flow (post-fix)

```
┌──────────────────────────────────────────────────────────────────────┐
│  POOL WATCHER (background, every 30s)                                │
│  ──────────────────────────────────────                              │
│  1. AI generates the FULL challenge (text + file content).           │
│  2. Generator uploads the file to the right Storage bucket:          │
│       - log-analysis    → "log-analysis-files"  bucket              │
│       - crypto / web / code-fixing / vulnerability-hunter →          │
│         "challenge-files" bucket (or inlined in the row jsonb)       │
│  3. Generator inserts a single row into the per-type table:          │
│       module = canonical challenge type                              │
│       topic  = specific subject (xss, sqli, hash-cracking, …)        │
│       <type-specific payload columns> (vulnerable_code, html, …)     │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│  STUDENT OPENS A CHALLENGE  (POST /api/training/generate)            │
│  ──────────────────────────────────────────────────────              │
│  1. Backend looks up the row in the right per-type table             │
│     (challenge_id → _fetch_scenario_by_id_typed).                    │
│  2. Backend runs the per-type row mapper                             │
│     (map_<type>_row_to_training) — the mapper reads the row          │
│     and produces the complete TrainingData payload:                  │
│       - vulnerable_code, language, vulnerability_type, …             │
│       - log_url (built from storage_path + SUPABASE_URL)             │
│       - files (decoded base64), htmlPreview                          │
│       - hard-coded "type": "code-fixing" / "log-analysis" / …        │
│  3. attach_scenario_metadata pins type / id / topic / difficulty /   │
│     xpReward. No Groq call.                                          │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                          Front-end renders
```

### What this means for each piece of code

- `app/api/training.py::generate_training` MUST NOT call Groq. The
  row mapper is the single source of truth.
- `app/services/scenario_service.py::generate_challenge_from_scenario`
  is **kept as a utility** for ad-hoc testing / the dashboard
  "preview" button, but `generate_training` does not import it.
- `app/services/file_storage.py::upload_challenge_file` is a
  **utility for the pool watcher**, not for the open flow. The open
  flow reads files from the row (`files` jsonb for the legacy
  crypto/web path, `log_url` for log-analysis).
- A new pool-watcher row in `code_fixing_challenges`,
  `vulnerability_hunter_challenges`, `encryption_challenges`, or
  `web_exploitation_challenges` MUST carry the full payload in the
  per-type columns (`vulnerable_code`, `html_preview`, `files`,
  etc.) — never rely on a follow-up AI call to fill them in.

### Detecting regressions

The `scripts/check_state.py` health report includes a
"challenge type consistency" section that reads
`v_challenge_type_consistency` from the DB. Any non-zero
`bad_rows` value means somebody inserted a row whose `module`
column doesn't match its table's canonical value — that row will
route to the wrong editor and must be fixed.

## Running the Backend
```bash
cd CyberArena
pip install -r requirements.txt
python main.py
```
Server runs on `http://localhost:8090`.

> **Single-source-of-truth:** `Apex/CyberArena/` IS the backend. The old
> `Apex/backend/` folder has been removed. All edits and HF pushes happen
> from `Apex/CyberArena/`.

## Frontend
- Runs on `http://localhost:5173` via `npm run dev`
- Uses `VITE_API_URL` env var to connect to backend
