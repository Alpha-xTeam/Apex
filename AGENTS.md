# CyberArena — Project Guide

## Supabase Project
- **Project ID**: `yevtnyokixocpihpdwqu`
- **Organization**: `vilfthlnaltfhseywiqq`
- **Region**: `ap-southeast-1`
- **Database**: Supabase PostgreSQL (users, XP, trainings)

## Backend Architecture
```
Frontend (React) → Python Backend (FastAPI :8080) → Supabase (scenario pool) + Groq AI
```

## Data & Backend Rules
1. **Frontend** calls Python backend at `VITE_API_URL` (default: `http://localhost:8080/api`).
2. **Python backend** proxies auth and XP operations to existing Supabase Edge Functions (`cyberarena-auth`, `cyberarena-xp`).
3. **Supabase** stores lightweight **scenario seeds** in `blue_scenarios` / `red_scenarios` (not full challenges).
4. **Groq** builds the full interactive challenge from a scenario at session start; also evaluates code fixes.
5. **No direct database queries from frontend** — all data goes through the Python backend.

## Scenario Pool Flow
- Dashboard lists **scenarios** from Supabase (`GET /api/training/list`).
- User selects a scenario → `POST /api/training/generate` loads the scenario, then Groq generates HTML/files/hints/answers.
- On solve → scenario is deleted and a new scenario is generated in the background to refill the pool (~100 per team).

## Stack
- **Frontend**: React 19 + TypeScript + Vite
- **Backend**: Python (FastAPI, httpx, uvicorn)
- **AI**: Groq API (Llama 3.3 70B)
- **Database**: Supabase PostgreSQL
- **Language**: Arabic (RTL)

## Backend API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth` | Signup / Login (proxied to `cyberarena-auth`) |
| POST | `/api/xp` | Get / Add XP (proxied to `cyberarena-xp`) |
| POST | `/api/training/generate` | Generate training via Groq AI |
| POST | `/api/training/evaluate` | Evaluate code fix via Groq AI |

## Running the Backend
```bash
cd backend
pip install -r requirements.txt
python main.py
```
Server runs on `http://localhost:8080`.

## Frontend
- Runs on `http://localhost:5173` via `npm run dev`
- Uses `VITE_API_URL` env var to connect to backend
