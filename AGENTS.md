# CyberArena — Project Guide

## Supabase Project
- **Project ID**: `yevtnyokixocpihpdwqu`
- **Organization**: `vilfthlnaltfhseywiqq`
- **Region**: `ap-southeast-1`
- **Database**: Supabase PostgreSQL (`users`, `leaderboard`, `certificates`, `encryption_challenges`, ...)

## Backend Architecture
```
Frontend (React :5173) → Python Backend (FastAPI :8090) → Supabase (challenge pool) + Groq AI
```

## Pool Architecture — Per-Type Generators

Each challenge type (crypto, web, forensics, ...) has its own table and its own generator module. The pattern is:

```
backend/
  main.py                 ← orchestrator: starts one watcher per (type, team)
  crypto_generator.py     ← owns encryption_challenges
  web_generator.py        ← (future) owns web_challenges
  forensics_generator.py  ← (future) owns forensics_challenges
  ...
```

**Contract every generator must implement** (used by `main.py::populate_pool_background`):

| Export | Purpose |
|---|---|
| `get_pool_count(team_role) -> int` | Query the table for a team |
| `async refill_pool(team_role, count) -> int` | Generate + insert; returns # inserted |
| `async start_pool_watcher(team_role)` | Long-running background coroutine |
| `POOL_TARGET`, `POOL_THRESHOLD`, `POOL_BATCH` | Pool tuning constants |

**Pool model (per team, per type):**
- `POOL_TARGET = 5` challenges cached
- `POOL_THRESHOLD = 2` → trigger refill when at or below
- `POOL_BATCH = 3` → insert this many per refill cycle
- When AI fails (rate-limit, parse error), fall back to curated seeds

**AI flow inside a generator:**
1. `ai_generate_scenario()` calls Groq (Llama 3.3 70B) → returns a `ScenarioSpec` JSON
2. `ChallengeBuilder.build(spec)` runs the algorithm in-process via `cryptography` (Python)
3. `insert_to_db()` POSTs the resulting `Challenge` to the Supabase table

**Why Python executes the crypto, not the AI:**
The LLM produces a *recipe* (plaintext, key, algorithm). Python runs the algorithm and computes the encrypted bytes + flag hash. This makes the output provably correct and immune to LLM hallucination.

## Data & Backend Rules
1. **Frontend** calls Python backend at `VITE_API_URL` (default: `http://localhost:8090/api`).
2. **Python backend** proxies auth and XP to existing Supabase Edge Functions (`cyberarena-auth`, `cyberarena-xp`).
3. **Supabase** stores **fully-realized challenges** (one table per type). The `flag_hash` column is the source of truth for the answer; the `flag_preview` shows `CyberArena{<hex>}` to the student.
4. **No direct database queries from frontend** — all data goes through the Python backend.
5. **Auto-purge disabled**: curated challenges are trusted. The watcher only refills when count drops to `POOL_THRESHOLD`.

## Challenge Format (current)
- Per-type table (e.g. `encryption_challenges`):
  - `id`, `team_role`, `module`, `title`, `story`, `task_outline`
  - `files` (jsonb), `file_metadata` (jsonb), `command_outputs` (jsonb)
  - `hints` (jsonb), `tools_whitelist` (text[])
  - `flag_hash`, `flag_preview`, `difficulty`, `xp_reward`, `created_at`
- Flag format: `CyberArena{<64-hex>}` — the `flag_hash` is `sha256(flag_preview)`
- Anti-patterns enforced in `ChallengeBuilder.validate()`:
  - No algorithm names in `task_outline` (AES/RSA/MD5/SHA/HMAC/XOR/Vigenere/Caesar)
  - Story is allowed to use contextual jargon (hash, salt, signature)

## Stack
- **Frontend**: React 19 + TypeScript + Vite
- **Backend**: Python 3.14 (FastAPI, httpx, uvicorn, cryptography)
- **AI**: Groq API (Llama 3.3 70B)
- **Database**: Supabase PostgreSQL
- **Language**: Arabic (RTL)

## Backend API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth` | Signup / Login (proxied to `cyberarena-auth`) |
| POST | `/api/xp` | Get / Add XP (proxied to `cyberarena-xp`) |
| POST | `/api/training/generate` | Load a cached challenge by id |
| POST | `/api/training/evaluate` | Evaluate a code fix (blue team) |
| GET  | `/api/training/list` | List cached challenges for a team |

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
