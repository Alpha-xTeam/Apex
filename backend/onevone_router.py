"""
1v1 Mode router — competitive head-to-head matches.

This router REUSES the existing per-type challenge tables and evaluators from
main.py. It does NOT introduce a new challenge system.

Endpoints:
    POST /api/onevone/rooms                 create a room (owner)
    POST /api/onevone/rooms/join            join an existing room by code
    GET  /api/onevone/rooms/{code}          public room snapshot
    POST /api/onevone/rooms/{code}/start    owner starts the match
    POST /api/onevone/rooms/{code}/leave    any player leaves / abandons
    GET  /api/onevone/rooms/{code}/stream   SSE — live state, timer, winner
    POST /api/onevone/matches/{id}/submit   submit answer (flag / code / fields)

Auth model:
    All requests carry the existing `cyberarena_session` user (id, name) and
    the backend trusts the user id the client sends. Room ownership is
    re-checked on every mutating call.

Timer:
    A single asyncio.Task per active match advances the state machine
    (playing -> overtime -> finished) based on server time. The SSE stream
    broadcasts the canonical state to both clients every 1 s.

Real-time:
    Implemented as Server-Sent Events (one HTTP connection per client, no
    WebSocket infra required, no new dependencies, plays nicely with proxies).
"""

from __future__ import annotations

import os
import sys
import asyncio
import json
import random
import string
import secrets
import time
from datetime import datetime, timezone
from typing import Any, Optional

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

# Force UTF-8 for Arabic messages on Windows consoles
sys.stdout.reconfigure(encoding="utf-8")

router = APIRouter(prefix="/api/onevone", tags=["onevone"])

# ---- env (mirror main.py) ----
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://yevtnyokixocpihpdwqu.supabase.co")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")
SUPABASE_HEADERS = {
    "apikey": SUPABASE_ANON_KEY,
    "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
}

# ---- shared constants ----
# 6-char base32 (no 0/1/O/I confusion) — easy to read aloud
_ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
DEFAULT_MAIN_DURATION_S = 600      # 10 min
DEFAULT_OVERTIME_DURATION_S = 120  # 2 min
MAIN_DURATION_OPTIONS = [300, 600, 900]  # 5/10/15 — future-proof
READY_TIMEOUT_S = 90               # max wait for both clients to load the challenge

# per-match ready-handshake state. The timer task waits on the Event and polls
# the set; the /ready endpoint mutates the set and sets the Event to wake the
# timer. Both are cleaned up in the timer's `finally` block.
_match_ready: dict[str, set[str]] = {}
_match_ready_signal: dict[str, asyncio.Event] = {}


# --------------------------------------------------------------------------- #
#  small helpers
# --------------------------------------------------------------------------- #

def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.astimezone(timezone.utc).isoformat() if dt else None


def _gen_room_code() -> str:
    return "".join(secrets.choice(_ROOM_CODE_ALPHABET) for _ in range(6))


def _sb_headers(content_type: bool = False, prefer: Optional[str] = None) -> dict:
    h = dict(SUPABASE_HEADERS)
    if content_type:
        h["Content-Type"] = "application/json"
    if prefer:
        h["Prefer"] = prefer
    return h


async def _sb_select(table: str, query: str) -> list[dict]:
    url = f"{SUPABASE_URL}/rest/v1/{table}?{query}"
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.get(url, headers=_sb_headers())
        if r.status_code != 200:
            raise HTTPException(status_code=502, detail=f"Supabase error ({table}): {r.text[:200]}")
        return r.json()


async def _sb_insert(table: str, row: dict) -> dict:
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.post(url, json=row, headers=_sb_headers(content_type=True, prefer="return=representation"))
        if r.status_code not in (200, 201):
            raise HTTPException(status_code=502, detail=f"Supabase insert error ({table}): {r.text[:200]}")
        rows = r.json()
        return rows[0] if rows else {}


async def _sb_update(table: str, query: str, patch: dict) -> list[dict]:
    url = f"{SUPABASE_URL}/rest/v1/{table}?{query}"
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.patch(url, json=patch, headers=_sb_headers(content_type=True, prefer="return=representation"))
        if r.status_code not in (200, 201):
            raise HTTPException(status_code=502, detail=f"Supabase update error ({table}): {r.text[:200]}")
        return r.json()


async def _sb_delete(table: str, query: str) -> None:
    url = f"{SUPABASE_URL}/rest/v1/{table}?{query}"
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.delete(url, headers=_sb_headers())
        if r.status_code not in (200, 204):
            raise HTTPException(status_code=502, detail=f"Supabase delete error ({table}): {r.text[:200]}")


# --------------------------------------------------------------------------- #
#  per-type challenge lookup (reuses existing tables)
# --------------------------------------------------------------------------- #

def _scenario_table_for(team_role: str, challenge_type: str) -> str:
    if challenge_type == "web":
        return "web_exploitation_challenges"
    if challenge_type == "code-fixing":
        return "code_fixing_challenges"
    if challenge_type == "log-analysis":
        return "log_analysis_challenges"
    return "encryption_challenges"


async def _pick_challenge(team_role: str) -> dict:
    """Return {id, challenge_type, table} for a random existing challenge.

    Tries the per-type tables in order; falls back to legacy encryption_challenges.
    """
    # all per-type tables that have content for this team_role, in priority order
    candidates: list[tuple[str, str]] = [
        ("web_exploitation_challenges", "web"),
        ("code_fixing_challenges", "code-fixing"),
        ("log_analysis_challenges", "log-analysis"),
        ("encryption_challenges", "crypto"),
    ]
    for table, ctype in candidates:
        try:
            rows = await _sb_select(
                table,
                f"select=id&team_role=eq.{team_role}&limit=200",
            )
        except Exception:
            continue
        if rows:
            pick = random.choice(rows)
            return {"id": str(pick["id"]), "challenge_type": ctype, "table": table}
    raise HTTPException(
        status_code=404,
        detail="لا توجد تحديات متاحة في الوقت الحالي لإنشاء غرفة 1v1.",
    )


async def _load_challenge_row(challenge_id: str, challenge_type: str) -> dict:
    table = _scenario_table_for("", challenge_type)
    rows = await _sb_select(
        table,
        f"id=eq.{challenge_id}&select=*&limit=1",
    )
    if not rows:
        raise HTTPException(status_code=404, detail="التحدي المختار غير موجود")
    return rows[0]


# --------------------------------------------------------------------------- #
#  per-type answer verification (reuses existing logic)
# --------------------------------------------------------------------------- #

def _normalize_flag_answer(s: str) -> str:
    return (s or "").strip().lower()


def _check_red_answer(challenge_row: dict, payload: str) -> bool:
    """Red Team: compare to flag_preview (CyberArena{...}) or any exploits_accepted."""
    user = _normalize_flag_answer(payload)
    if not user:
        return False
    flag = _normalize_flag_answer(challenge_row.get("flag_preview", ""))
    if flag and (user == flag or user.replace("cyberarena{", "").replace("}", "") == flag.replace("cyberarena{", "").replace("}", "")):
        return True
    # for web_exploitation_challenges: also accept any accepted payload
    for accepted in (challenge_row.get("exploits_accepted") or []):
        if _normalize_flag_answer(accepted) and _normalize_flag_answer(accepted) in user:
            return True
    return False


async def _ai_check_blue_answer(challenge_row: dict, challenge_type: str, payload: dict) -> bool:
    """Blue Team: delegate to the existing AI evaluators (code-fix or log-analysis).

    payload is {fixedCode} for code-fixing, or {attackType, attackerIp, ...} for
    log-analysis. For unknown blue types we conservatively return False.
    """
    from main import (
        evaluate_code_fix,
        evaluate_log_analysis,
        CodeFixEvaluateRequest,
        LogAnalysisEvaluateRequest,
    )

    if challenge_type == "code-fixing":
        fixed = (payload or {}).get("fixedCode", "")
        if not fixed.strip():
            return False
        req = CodeFixEvaluateRequest(
            challengeId=str(challenge_row["id"]),
            fixedCode=fixed,
            teamRole="blue",
        )
        # evaluate_code_fix returns {evaluation: {secured: bool, ...}}
        # but it also schedules a background pool replacement if correct.
        # For 1v1 we don't want to consume the row, so we re-implement the
        # essential AI check inline.
        import os as _os
        GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
        GROQ_API_KEY = _os.environ.get("GROQ_API_KEY", "")
        vulnerable_code = challenge_row.get("vulnerable_code", "")
        vuln_type = challenge_row.get("vulnerability_type", "")
        vuln_desc = challenge_row.get("vulnerability_description", "")
        language = challenge_row.get("language", "")
        if not GROQ_API_KEY:
            return False
        prompt = f"""أنت مهندس أمن سيبراني خبير. قيم الكود المُعدل الذي قدمه المتدرب لتصحيح ثغرة.
اللغة: {language}
نوع الثغرة: {vuln_type}
وصف الثغرة: {vuln_desc}

الكود الأصلي:
```{language}
{vulnerable_code}
```

الكود المُعدل:
```{language}
{fixed}
```

هل الثغرة أُصلحت فعلياً؟ أرجع JSON فقط:
{{"secured": true/false, "feedback": "..."}}"""
        async with httpx.AsyncClient(timeout=45) as client:
            r = await client.post(
                GROQ_API_URL,
                json={
                    "model": "llama-3.1-8b-instant",
                    "messages": [
                        {"role": "system", "content": "أنت مقيّم أكواد أمني. أعد JSON فقط."},
                        {"role": "user", "content": prompt},
                    ],
                    "temperature": 0.1,
                    "max_tokens": 512,
                },
                headers={"Content-Type": "application/json", "Authorization": f"Bearer {GROQ_API_KEY}"},
            )
        if r.status_code != 200:
            return False
        from main import parse_json_safe
        data = parse_json_safe(r.json()["choices"][0]["message"]["content"])
        return bool(data.get("secured"))

    if challenge_type == "log-analysis":
        # inline re-implementation of the 4-field match (same logic as main.py)
        from main import (
            _normalize_str, _ip_matches, _timestamp_close, _ioc_matches
        )
        expected_attack = _normalize_str(challenge_row.get("expected_attack_type", ""))
        expected_ip = challenge_row.get("expected_attacker_ip", "") or ""
        expected_ts = challenge_row.get("expected_timestamp", "") or ""
        expected_ioc = challenge_row.get("expected_ioc", "") or ""
        correct = 0
        if _normalize_str(payload.get("attackType", "")) == expected_attack:
            correct += 1
        if _ip_matches(payload.get("attackerIp", ""), expected_ip):
            correct += 1
        if _timestamp_close(payload.get("timestamp", ""), expected_ts):
            correct += 1
        if _ioc_matches(payload.get("ioc", ""), expected_ioc):
            correct += 1
        return correct >= 3  # 3 of 4 — same threshold as main.py

    # crypto / generic blue — no "expectedAnswer" in the blue sense, so no-op
    return False


# --------------------------------------------------------------------------- #
#  Pydantic models
# --------------------------------------------------------------------------- #

class CreateRoomRequest(BaseModel):
    userId: str
    displayName: str
    teamRole: str                     # 'red' | 'blue'
    challengeSource: str = "random"  # 'random' | 'manual:<id>'
    mainDurationS: int = DEFAULT_MAIN_DURATION_S
    overtimeDurationS: int = DEFAULT_OVERTIME_DURATION_S


class JoinRoomRequest(BaseModel):
    code: str
    userId: str
    displayName: str


class StartMatchRequest(BaseModel):
    userId: str


class LeaveRoomRequest(BaseModel):
    userId: str


class ReadyRequest(BaseModel):
    userId: str


class SubmitRequest(BaseModel):
    userId: str
    # For Red Team: 'flag' payload (single string).
    # For Blue code-fixing: { fixedCode: '...' }
    # For Blue log-analysis: { attackType, attackerIp, timestamp, ioc }
    submission: Any


# --------------------------------------------------------------------------- #
#  Room lifecycle
# --------------------------------------------------------------------------- #

@router.post("/rooms")
async def create_room(req: CreateRoomRequest):
    if req.teamRole not in ("red", "blue"):
        raise HTTPException(status_code=400, detail="teamRole يجب أن يكون red أو blue")
    if req.mainDurationS not in MAIN_DURATION_OPTIONS:
        raise HTTPException(status_code=400, detail="mainDurationS غير صالح")
    if not req.userId or not req.displayName:
        raise HTTPException(status_code=400, detail="بيانات المستخدم ناقصة")

    # generate a unique 6-char code (retry on collision)
    code = _gen_room_code()
    for _ in range(8):
        existing = await _sb_select("onevone_rooms", f"code=eq.{code}&select=id&limit=1")
        if not existing:
            break
        code = _gen_room_code()

    room = await _sb_insert("onevone_rooms", {
        "code": code,
        "owner_user_id": req.userId,
        "team_role": req.teamRole,
        "status": "open",
        "challenge_source": req.challengeSource,
    })
    # add the owner as slot 1
    await _sb_insert("onevone_players", {
        "room_id": room["id"],
        "user_id": req.userId,
        "slot": 1,
        "display_name": req.displayName,
        "is_ready": True,
    })
    return {"room": room, "code": code}


@router.post("/rooms/join")
async def join_room(req: JoinRoomRequest):
    if not req.code or not req.userId:
        raise HTTPException(status_code=400, detail="code و userId مطلوبان")

    rows = await _sb_select("onevone_rooms", f"code=eq.{req.code.strip().upper()}&select=*&limit=1")
    if not rows:
        raise HTTPException(status_code=404, detail="رمز الغرفة غير موجود")
    room = rows[0]
    if room["status"] != "open":
        raise HTTPException(status_code=409, detail="هذه الغرفة لم تعد تقبل لاعبين")
    if str(room["owner_user_id"]) == str(req.userId):
        raise HTTPException(status_code=400, detail="أنت مالك الغرفة بالفعل")

    # already joined?
    existing_players = await _sb_select(
        "onevone_players",
        f"room_id=eq.{room['id']}&select=*",
    )
    if any(str(p["user_id"]) == str(req.userId) for p in existing_players):
        # idempotent re-join — return current state
        return {"room": room, "players": existing_players, "joined": True}
    if len(existing_players) >= 2:
        raise HTTPException(status_code=409, detail="الغرفة ممتلئة (2/2)")

    # slot 2 inherits the same team_role
    new_player = await _sb_insert("onevone_players", {
        "room_id": room["id"],
        "user_id": req.userId,
        "slot": 2,
        "display_name": req.displayName,
        "is_ready": True,
    })
    # a player joined => notify the open SSE streams (if any)
    await _broadcast_room_event(room["id"], {"type": "player_joined", "userId": req.userId})
    existing_players.append(new_player)
    return {"room": room, "players": existing_players, "joined": True}


@router.get("/rooms/{code}")
async def get_room(code: str):
    rows = await _sb_select("onevone_rooms", f"code=eq.{code.strip().upper()}&select=*&limit=1")
    if not rows:
        raise HTTPException(status_code=404, detail="رمز الغرفة غير موجود")
    room = rows[0]
    players = await _sb_select("onevone_players", f"room_id=eq.{room['id']}&select=*&order=slot.asc")
    match = None
    if room.get("challenge_id"):
        ms = await _sb_select("onevone_matches", f"room_id=eq.{room['id']}&select=*&limit=1")
        if ms:
            match = ms[0]
    return {
        "room": room,
        "players": players,
        "match": _serialize_match(match) if match else None,
    }


@router.post("/rooms/{code}/start")
async def start_match(code: str, req: StartMatchRequest):
    rows = await _sb_select("onevone_rooms", f"code=eq.{code.strip().upper()}&select=*&limit=1")
    if not rows:
        raise HTTPException(status_code=404, detail="رمز الغرفة غير موجود")
    room = rows[0]
    if str(room["owner_user_id"]) != str(req.userId):
        raise HTTPException(status_code=403, detail="فقط مالك الغرفة يستطيع بدء المباراة")
    if room["status"] != "open":
        raise HTTPException(status_code=409, detail="المباراة بدأت بالفعل أو الغرفة مغلقة")

    players = await _sb_select("onevone_players", f"room_id=eq.{room['id']}&select=*&order=slot.asc")
    if len(players) < 2:
        raise HTTPException(status_code=400, detail="يجب أن ينضم لاعب ثانٍ قبل البدء")

    # pick the challenge (manual or random)
    if room["challenge_source"].startswith("manual:"):
        challenge_id = room["challenge_source"].split(":", 1)[1]
        # detect type by trying the 4 tables
        challenge_type = "crypto"
        for tname, ctype in (
            ("web_exploitation_challenges", "web"),
            ("code_fixing_challenges", "code-fixing"),
            ("log_analysis_challenges", "log-analysis"),
            ("encryption_challenges", "crypto"),
        ):
            rs = await _sb_select(tname, f"id=eq.{challenge_id}&select=id&limit=1")
            if rs:
                challenge_type = ctype
                break
    else:
        pick = await _pick_challenge(room["team_role"])
        challenge_id = pick["id"]
        challenge_type = pick["challenge_type"]

    # mark room + match
    now = _now()
    main_dur = DEFAULT_MAIN_DURATION_S
    overtime_dur = DEFAULT_OVERTIME_DURATION_S
    await _sb_update(
        "onevone_rooms",
        f"id=eq.{room['id']}",
        {"status": "closed", "challenge_id": challenge_id, "closed_at": _iso(now)},
    )
    match = await _sb_insert("onevone_matches", {
        "room_id": room["id"],
        "challenge_id": challenge_id,
        "challenge_type": challenge_type,
        "state": "countdown",
        "started_at": _iso(now + _relativedelta(seconds=3)),  # 3 s countdown
        "ends_at": _iso(now + _relativedelta(seconds=3 + main_dur)),
        "overtime_ends_at": None,
        "main_duration_s": main_dur,
        "overtime_duration_s": overtime_dur,
        "winner_user_id": None,
        "win_reason": None,
    })

    # start the server-side timer coroutine (pass room_id to avoid extra lookups)
    asyncio.create_task(_run_match_timer(match["id"], room["id"], main_dur, overtime_dur))
    await _broadcast_room_event(room["id"], {"type": "match_started", "matchId": match["id"]})
    return {"match": _serialize_match(match), "room": {**room, "status": "closed", "challenge_id": challenge_id}}


@router.post("/rooms/{code}/leave")
async def leave_room(code: str, req: LeaveRoomRequest):
    rows = await _sb_select("onevone_rooms", f"code=eq.{code.strip().upper()}&select=*&limit=1")
    if not rows:
        raise HTTPException(status_code=404, detail="رمز الغرفة غير موجود")
    room = rows[0]
    # only remove the player row if present
    await _sb_delete("onevone_players", f"room_id=eq.{room['id']}&user_id=eq.{req.userId}")
    # if match is in progress, abandon with the OTHER user as winner
    ms = await _sb_select("onevone_matches", f"room_id=eq.{room['id']}&select=*&limit=1")
    if ms and ms[0]["state"] not in ("finished",):
        m = ms[0]
        winner = None
        players = await _sb_select("onevone_players", f"room_id=eq.{room['id']}&select=user_id")
        for p in players:
            if str(p["user_id"]) != str(req.userId):
                winner = str(p["user_id"])
                break
        patch = {
            "state": "finished",
            "winner_user_id": winner,
            "win_reason": "abandoned",
            "ends_at": _iso(_now()),
        }
        await _sb_update("onevone_matches", f"id=eq.{m['id']}", patch)
        await _broadcast_room_event(room["id"], {"type": "match_finished", "winner": winner, "reason": "abandoned"})
    # if room is empty -> mark abandoned
    remaining = await _sb_select("onevone_players", f"room_id=eq.{room['id']}&select=id&limit=1")
    if not remaining:
        await _sb_update("onevone_rooms", f"id=eq.{room['id']}", {"status": "abandoned"})
    return {"ok": True}


# --------------------------------------------------------------------------- #
#  Ready handshake — both clients must signal they loaded the challenge
#  before the main timer starts. Prevents the race where a fast loader
#  wins before the slow loader has even seen the challenge.
# --------------------------------------------------------------------------- #

@router.post("/matches/{match_id}/ready")
async def post_match_ready(match_id: str, req: ReadyRequest):
    """Mark this client as ready. The match timer starts when BOTH
    clients have called this endpoint (or READY_TIMEOUT_S elapses)."""
    ms = await _sb_select("onevone_matches", f"id=eq.{match_id}&select=*&limit=1")
    if not ms:
        raise HTTPException(status_code=404, detail="المباراة غير موجودة")
    match = ms[0]
    if match["state"] not in ("countdown", "ready"):
        raise HTTPException(status_code=409, detail="المباراة بدأت بالفعل أو انتهت")
    ps = await _sb_select("onevone_players", f"room_id=eq.{match['room_id']}&select=user_id")
    if not any(str(p["user_id"]) == str(req.userId) for p in ps):
        raise HTTPException(status_code=403, detail="لست لاعباً في هذه المباراة")
    s = _match_ready.setdefault(match_id, set())
    s.add(str(req.userId))
    evt = _match_ready_signal.get(match_id)
    if evt:
        evt.set()
    await _broadcast_room_event(match["room_id"], {
        "type": "ready",
        "userId": str(req.userId),
    })
    return {"ok": True, "ready_count": len(s)}


# --------------------------------------------------------------------------- #
#  Submission
# --------------------------------------------------------------------------- #

@router.post("/matches/{match_id}/submit")
async def submit_answer(match_id: str, req: SubmitRequest):
    ms = await _sb_select("onevone_matches", f"id=eq.{match_id}&select=*&limit=1")
    if not ms:
        raise HTTPException(status_code=404, detail="المباراة غير موجودة")
    match = ms[0]
    if match["state"] == "finished":
        raise HTTPException(status_code=409, detail="المباراة انتهت بالفعل")
    if match["state"] not in ("playing", "overtime"):
        raise HTTPException(status_code=409, detail="المباراة لم تبدأ بعد")

    # verify submitter is a player
    ps = await _sb_select("onevone_players", f"room_id=eq.{match['room_id']}&select=*&order=slot.asc")
    if not any(str(p["user_id"]) == str(req.userId) for p in ps):
        raise HTTPException(status_code=403, detail="لست لاعباً في هذه المباراة")

    # load the challenge row
    challenge_row = await _load_challenge_row(match["challenge_id"], match["challenge_type"])

    # route to the right verifier
    if match["challenge_type"] in ("web", "crypto"):
        correct = _check_red_answer(challenge_row, str(req.submission or ""))
    elif match["challenge_type"] in ("code-fixing", "log-analysis"):
        payload = req.submission if isinstance(req.submission, dict) else {}
        correct = await _ai_check_blue_answer(challenge_row, match["challenge_type"], payload)
    else:
        correct = False

    # log the submission
    sub_row = await _sb_insert("onevone_submissions", {
        "match_id": match_id,
        "user_id": req.userId,
        "submission": str(req.submission)[:8000] if not isinstance(req.submission, (dict, list)) else json.dumps(req.submission, ensure_ascii=False)[:8000],
        "is_correct": bool(correct),
        "is_final": False,
    })

    if correct:
        # ATOMIC win-claim via PostgreSQL function.
        # The function does UPDATE ... WHERE state IN ('playing','overtime')
        # RETURNING, which PostgreSQL serializes with a row-level lock.
        # Only one concurrent call can win; the loser reads back the real winner.
        win_reason = "flag" if match["challenge_type"] in ("web", "crypto") else "fix"
        rpc_url = f"{SUPABASE_URL}/rest/v1/rpc/onevone_claim_win"
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.post(
                rpc_url,
                json={
                    "p_match_id": match_id,
                    "p_user_id": req.userId,
                    "p_win_reason": win_reason,
                },
                headers=_sb_headers(content_type=True),
            )
        if r.status_code not in (200, 201):
            raise HTTPException(
                status_code=502,
                detail=f"Supabase claim_win error: {r.text[:200]}",
            )
        claim = r.json()
        if isinstance(claim, list) and claim:
            claim = claim[0]
        won = bool(claim.get("won"))
        real_winner = claim.get("winner_id")
        if won:
            # mark this submission as the final one
            await _sb_update(
                "onevone_submissions",
                f"id=eq.{sub_row['id']}",
                {"is_final": True},
            )
            await _broadcast_room_event(match["room_id"], {
                "type": "match_finished",
                "winner": req.userId,
                "reason": win_reason,
            })
            return {
                "correct": True,
                "won": True,
                "winner_id": req.userId,
                "submission": sub_row,
            }
        # race lost: tell the loser who actually won
        return {
            "correct": True,
            "won": False,
            "winner_id": real_winner,
            "submission": sub_row,
        }

    return {"correct": False, "won": False, "submission": sub_row}


# --------------------------------------------------------------------------- #
#  Match challenge data — both players get the SAME TrainingData shape
# --------------------------------------------------------------------------- #

@router.get("/matches/{match_id}/challenge")
async def get_match_challenge(match_id: str, userId: str):
    """Return the challenge data for the given match in the existing
    TrainingData shape — frontend reuses TrainingSession as-is."""
    ms = await _sb_select("onevone_matches", f"id=eq.{match_id}&select=*&limit=1")
    if not ms:
        raise HTTPException(status_code=404, detail="المباراة غير موجودة")
    match = ms[0]
    ps = await _sb_select("onevone_players", f"room_id=eq.{match['room_id']}&select=user_id")
    if not any(str(p["user_id"]) == str(userId) for p in ps):
        raise HTTPException(status_code=403, detail="لست لاعباً في هذه المباراة")
    # delegate to the existing mapper in main.py
    from main import (
        _map_encryption_row_to_training,
        _map_webex_row_to_training,
        _map_code_fixing_row_to_training,
        _map_log_analysis_row_to_training,
    )
    row = await _load_challenge_row(match["challenge_id"], match["challenge_type"])
    # team_role on the row is the source of truth for evaluator side
    # (matches the room's team_role — both players have the same side)
    rs = await _sb_select("onevone_rooms", f"id=eq.{match['room_id']}&select=team_role&limit=1")
    team_role = (rs[0]["team_role"] if rs else "red")
    if match["challenge_type"] == "web":
        training = _map_webex_row_to_training(row, team_role)
    elif match["challenge_type"] == "code-fixing":
        training = _map_code_fixing_row_to_training(row, team_role)
    elif match["challenge_type"] == "log-analysis":
        training = _map_log_analysis_row_to_training(row, team_role)
    else:
        training = _map_encryption_row_to_training(row, team_role)
    return {"training": training, "match": _serialize_match(match)}


# --------------------------------------------------------------------------- #
#  Real-time state via Server-Sent Events
# --------------------------------------------------------------------------- #

# A small pub-sub keyed by room_id, holding lists of asyncio.Queue
_room_subs: dict[str, list[asyncio.Queue]] = {}


async def _broadcast_room_event(room_id: str, event: dict) -> None:
    queues = _room_subs.get(room_id, [])
    for q in queues:
        try:
            q.put_nowait(event)
        except asyncio.QueueFull:
            pass


def _serialize_match(match: dict) -> dict:
    out = dict(match)
    # leave timestamps as ISO strings (Supabase returns them this way)
    return out


@router.get("/rooms/{code}/stream")
async def room_stream(code: str, request: Request):
    """SSE stream that pushes match state changes (player_joined,
    match_started, timer, match_finished)."""
    rows = await _sb_select("onevone_rooms", f"code=eq.{code.strip().upper()}&select=*&limit=1")
    if not rows:
        raise HTTPException(status_code=404, detail="رمز الغرفة غير موجود")
    room = rows[0]
    room_id = room["id"]

    queue: asyncio.Queue = asyncio.Queue(maxsize=64)
    _room_subs.setdefault(room_id, []).append(queue)

    async def event_gen():
        try:
            # initial snapshot
            ms = await _sb_select("onevone_matches", f"room_id=eq.{room_id}&select=*&limit=1")
            players = await _sb_select("onevone_players", f"room_id=eq.{room_id}&select=*&order=slot.asc")
            snapshot = {
                "type": "snapshot",
                "room": _serialize_match(room) if False else {k: room[k] for k in room if k != "owner_user_id"},
                "players": players,
                "match": _serialize_match(ms[0]) if ms else None,
                "now": _iso(_now()),
            }
            yield f"data: {json.dumps(snapshot, default=str, ensure_ascii=False)}\n\n"
            last_heartbeat = time.time()
            last_match_state = snapshot["match"]["state"] if snapshot["match"] else None
            last_players_count = len(players)
            while True:
                if await request.is_disconnected():
                    break
                # heartbeat every 1s with the current timer state
                if time.time() - last_heartbeat >= 1.0:
                    last_heartbeat = time.time()
                    # refresh the match row to get latest server state
                    ms2 = await _sb_select("onevone_matches", f"room_id=eq.{room_id}&select=*&limit=1")
                    pl2 = await _sb_select("onevone_players", f"room_id=eq.{room_id}&select=*&order=slot.asc")
                    if ms2:
                        m = ms2[0]
                        if m["state"] != last_match_state:
                            last_match_state = m["state"]
                            await _broadcast_room_event(room_id, {"type": "state", "match": _serialize_match(m)})
                    if len(pl2) != last_players_count:
                        last_players_count = len(pl2)
                        await _broadcast_room_event(room_id, {"type": "players", "players": pl2})
                    heartbeat = {
                        "type": "tick",
                        "now": _iso(_now()),
                        "match": _serialize_match(ms2[0]) if ms2 else None,
                    }
                    yield f"data: {json.dumps(heartbeat, default=str, ensure_ascii=False)}\n\n"
                # drain events
                try:
                    evt = await asyncio.wait_for(queue.get(), timeout=0.5)
                    yield f"data: {json.dumps(evt, default=str, ensure_ascii=False)}\n\n"
                except asyncio.TimeoutError:
                    pass
        finally:
            subs = _room_subs.get(room_id, [])
            if queue in subs:
                subs.remove(queue)

    return StreamingResponse(event_gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# --------------------------------------------------------------------------- #
#  Server-side timer task — drives the state machine
# --------------------------------------------------------------------------- #

async def _run_match_timer(match_id: str, room_id: str, main_dur: int, overtime_dur: int) -> None:
    """Advance the match:
        countdown(3s) -> ready (wait for both clients, max READY_TIMEOUT_S)
                       -> playing(main_dur) -> overtime(overtime_dur) -> finished
    The 'ready' phase ensures neither client can submit/win before the
    other has loaded the challenge. If only one client signals ready in
    time, that client wins (reason='opponent_no_show')."""
    from datetime import timedelta
    try:
        # 1) 3 s countdown
        await asyncio.sleep(3)
        # 2) Transition to 'ready' — wait for both clients to load + /ready
        await _sb_update("onevone_matches", f"id=eq.{match_id}", {"state": "ready"})
        await _broadcast_room_event(room_id, {"type": "state"})

        ps = await _sb_select("onevone_players", f"room_id=eq.{room_id}&select=user_id")
        expected_ready = {str(p["user_id"]) for p in ps}
        ready_set = _match_ready.setdefault(match_id, set())
        ready_signal = _match_ready_signal.setdefault(match_id, asyncio.Event())
        deadline = _now() + timedelta(seconds=READY_TIMEOUT_S)
        while True:
            if expected_ready.issubset(ready_set):
                break
            remaining = (deadline - _now()).total_seconds()
            if remaining <= 0:
                break
            try:
                await asyncio.wait_for(ready_signal.wait(), timeout=min(remaining, 2.0))
            except asyncio.TimeoutError:
                pass
            ready_signal.clear()

        if not expected_ready.issubset(ready_set):
            missing = expected_ready - ready_set
            present = expected_ready & ready_set
            winner = next(iter(present)) if len(present) == 1 else None
            reason = "opponent_no_show" if winner else "abandoned"
            await _sb_update("onevone_matches", f"id=eq.{match_id}", {
                "state": "finished",
                "winner_user_id": winner,
                "win_reason": reason,
            })
            await _broadcast_room_event(room_id, {
                "type": "match_finished",
                "winner": winner,
                "reason": reason,
            })
            return

        # 3) Both ready — start the actual match
        playing_started_at = _now()
        await _sb_update("onevone_matches", f"id=eq.{match_id}", {
            "state": "playing",
            "started_at": _iso(playing_started_at),
            "ends_at": _iso(playing_started_at + timedelta(seconds=main_dur)),
        })
        await _broadcast_room_event(room_id, {"type": "state"})
        await asyncio.sleep(main_dur)
        # check if already finished (winner)
        m = await _sb_select("onevone_matches", f"id=eq.{match_id}&select=state,winner_user_id&limit=1")
        if not m or m[0]["state"] == "finished":
            return
        # enter overtime
        await _sb_update("onevone_matches", f"id=eq.{match_id}", {
            "state": "overtime",
            "overtime_ends_at": _iso(_now() + timedelta(seconds=overtime_dur)),
        })
        await _broadcast_room_event(room_id, {"type": "state"})
        await asyncio.sleep(overtime_dur)
        # check again
        m = await _sb_select("onevone_matches", f"id=eq.{match_id}&select=state,winner_user_id&limit=1")
        if not m or m[0]["state"] == "finished":
            return
        # draw
        await _sb_update("onevone_matches", f"id=eq.{match_id}", {
            "state": "finished",
            "winner_user_id": None,
            "win_reason": "overtime_draw",
        })
        await _broadcast_room_event(room_id, {
            "type": "match_finished",
            "winner": None,
            "reason": "overtime_draw",
        })
    except asyncio.CancelledError:
        pass
    except Exception as e:
        print(f"[onevone] timer error for match {match_id}: {e}")
    finally:
        _match_ready.pop(match_id, None)
        _match_ready_signal.pop(match_id, None)


def _relativedelta(seconds: int):
    """Tiny shim so we don't need to import datetime.timedelta everywhere."""
    from datetime import timedelta
    return timedelta(seconds=seconds)
