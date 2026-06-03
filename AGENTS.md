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
- **Primary AI**: Groq API (default `llama-3.1-8b-instant` via `GROQ_MODEL`)
- **Fallback AI**: NVIDIA integrate API (default `deepseek-ai/deepseek-v4-pro`
  via `NVIDIA_MODEL`) — used only when Groq is unreachable, never on 429
- **Database**: Supabase PostgreSQL
- **Language**: Arabic (RTL)

## Environment Variables (all in `backend/.env`, never hardcoded)
| Var | Purpose |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Anon key (read) — used by backend for DB writes too |
| `GROQ_API_KEY` | Primary AI |
| `GROQ_MODEL` | Optional model override (default `llama-3.1-8b-instant`) |
| `NVIDIA_API_KEY` | Fallback AI |
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

## AI Generation — Two-Tier Fallback (mandatory pattern)

Every generator follows this exact flow per slot:

```
1. Try PRIMARY AI (Groq)         → on success: build + insert
                                 → on 429: per-team backoff 5 min, then seed
                                 → on transient (timeout / network): goto 2
                                 → on bad module/algo combo: goto 2
2. Try FALLBACK AI (NVIDIA/DeepSeek) → on success: build + insert
                                       → on any error: goto 3
3. Use curated seed              → build + insert
```

**Why this exact order:**
- AI is the soul of the platform — every slot should attempt AI first.
- A 429 is a hard per-minute quota. **Never** route a 429 to the fallback
  AI (it likely shares backend infra and will 429 too). Set a per-team
  backoff `_AI_BACKOFF_UNTIL[team_role] = now + 300`.
- Transient errors (timeout, read error, connect error) are network blips —
  the fallback provider can plausibly help.
- Curated seeds are the safety net, not the primary path.

**Per-team backoff:** track `_AI_BACKOFF_UNTIL: dict[str, float]` keyed by
`team_role`. One team's quota exhaustion must not lock the other team out.

**Why Python executes the recipe, not the AI:** the LLM produces the
*recipe* (plaintext, key, algorithm). Python runs the algorithm and computes
the encrypted bytes + flag hash. This makes the output provably correct and
immune to LLM hallucination.

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
