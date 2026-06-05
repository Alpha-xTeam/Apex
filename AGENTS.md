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
- **Backend**: Python 3.14 (FastAPI, httpx, uvicorn, cryptography)
- **Primary AI**: Cloudflare Workers AI (default `@cf/qwen/qwen2.5-coder-32b-instruct`)
- **Secondary AI**: Groq API (default `llama-3.1-8b-instant` via `GROQ_MODEL`)
- **Tertiary AI**: NVIDIA integrate API (default `deepseek-ai/deepseek-v4-pro`
  via `NVIDIA_MODEL`) — used only when Cloudflare and Groq are unreachable
- **Database**: Supabase PostgreSQL
- **Language**: Arabic (RTL)

## Environment Variables (all in `backend/.env`, never hardcoded)
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
- The watcher refills **exactly** the missing slots whenever the count
  drops below `POOL_TARGET` (no threshold-based wait). One consumption
  triggers a one-slot top-up.
- Per-team registration in `populate_pool_background` — a generator registers
  itself for the teams it actually serves (e.g. crypto currently serves red
  only). Don't blindly add both teams.

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

## Challenge Format (current)
- Per-type table (e.g. `encryption_challenges`):
  - `id`, `team_role`, `module`, `title`, `story`, `task_outline`
  - `files` (jsonb), `file_metadata` (jsonb), `command_outputs` (jsonb)
  - `hints` (jsonb), `tools_whitelist` (text[])
  - `flag_hash`, `flag_preview`, `difficulty`, `xp_reward`, `created_at`
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

## Running the Backend
```bash
cd backend
pip install -r requirements.txt
python main.py
```
Server runs on `http://localhost:8090`.

## Frontend
- Runs on `http://localhost:5173` via `npm run dev`
- Uses `VITE_API_URL` env var to connect to backend
