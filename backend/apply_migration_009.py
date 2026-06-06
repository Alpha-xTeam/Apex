"""
Apply migration 009 (1v1 mode tables) to the Supabase project.

================================================================
3 ways to run this. Pick one:
================================================================

A) RECOMMENDED — one-shot via the Supabase SQL editor
   1. Open https://app.supabase.com/project/yevtnyokixocpihpdwqu/sql/new
   2. Paste the contents of backend/migrations/009_onevone_mode.sql
   3. Click "Run"
   (no service key needed, takes 5 seconds)

B) AUTOMATIC — this script, if you set SUPABASE_SERVICE_KEY in backend/.env
   Get the key from: https://app.supabase.com/project/yevtnyokixocpihpdwqu/settings/api
   → service_role / secret (NOT the anon key)

C) PSQL DIRECT — if you have the postgres connection string
   psql "postgresql://postgres:[PASSWORD]@db.yevtnyokixocpihpdwqu.supabase.co:5432/postgres" \
        -f backend/migrations/009_onevone_mode.sql

================================================================
The script tries method B first, then falls back to printing the SQL
for method A. It's idempotent — every CREATE uses IF NOT EXISTS.
================================================================
"""

import os
import sys
import httpx
from dotenv import load_dotenv

backend_dir = os.path.dirname(os.path.abspath(__file__))
load_dotenv(dotenv_path=os.path.join(backend_dir, ".env"))

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://yevtnyokixocpihpdwqu.supabase.co").rstrip("/")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "").strip()
MIGRATION_PATH = os.path.join(backend_dir, "migrations", "009_onevone_mode.sql")


def read_sql() -> str:
    with open(MIGRATION_PATH, "r", encoding="utf-8") as f:
        return f.read()


def split_sql(sql: str) -> list[str]:
    """Split a SQL script into individual statements (semi-colon separated,
    ignoring those inside $$ ... $$ blocks)."""
    statements: list[str] = []
    buf: list[str] = []
    in_dollar = False
    for raw in sql.splitlines():
        line = raw
        if line.strip().startswith("--") and not buf:
            continue
        buf.append(line)
        if "$$" in line:
            in_dollar = not in_dollar
        if line.rstrip().endswith(";") and not in_dollar:
            stmt = "\n".join(buf).strip().rstrip(";").strip()
            if stmt:
                statements.append(stmt)
            buf = []
    if buf:
        tail = "\n".join(buf).strip().rstrip(";").strip()
        if tail:
            statements.append(tail)
    return statements


def try_pg_endpoint(path: str, headers: dict, statements: list[str]) -> bool:
    url = f"{SUPABASE_URL}{path}"
    print(f"  → trying {url}")
    try:
        with httpx.Client(timeout=60) as client:
            for i, stmt in enumerate(statements, 1):
                preview = stmt.splitlines()[0][:70]
                r = client.post(url, headers=headers, json={"query": stmt})
                if r.status_code in (200, 201):
                    print(f"    [{i}/{len(statements)}] OK    {preview}")
                else:
                    body = r.text[:200]
                    if " PGREST205" in body or "schema cache" in body or "must be owner" in body:
                        return False
                    print(f"    [{i}/{len(statements)}] FAIL  HTTP {r.status_code}  {preview}")
                    print(f"             {body}")
                    return False
        return True
    except Exception as e:
        print(f"  → network error: {e}")
        return False


def apply_via_pg_meta() -> bool:
    if not SUPABASE_SERVICE_KEY:
        return False
    sql = read_sql()
    statements = split_sql(sql)
    print(f"Attempting pg-meta apply with {len(statements)} statements ...")
    headers = {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
    }
    # try common paths
    for path in ("/pg/query", "/pg-meta/query", "/rest/v1/rpc/exec_sql"):
        if try_pg_endpoint(path, headers, statements):
            return True
    return False


def apply_via_management_api() -> bool:
    """Try the Supabase management API (requires access token, not service key)."""
    access = os.environ.get("SUPABASE_ACCESS_TOKEN", "").strip()
    if not access:
        return False
    project_ref = SUPABASE_URL.split("//")[-1].split(".")[0]
    url = f"https://api.supabase.com/v1/projects/{project_ref}/database/query"
    sql = read_sql()
    headers = {
        "Authorization": f"Bearer {access}",
        "Content-Type": "application/json",
    }
    print(f"Attempting Management API apply ...")
    try:
        with httpx.Client(timeout=60) as client:
            r = client.post(url, headers=headers, json={"query": sql})
            if r.status_code in (200, 201):
                print(f"  → OK")
                return True
            print(f"  → HTTP {r.status_code}: {r.text[:200]}")
    except Exception as e:
        print(f"  → network error: {e}")
    return False


def show_manual_steps() -> None:
    print()
    print("=" * 70)
    print("MANUAL STEPS (5 seconds, no token needed)")
    print("=" * 70)
    print()
    print("1. Open this URL in your browser:")
    print(f"   https://app.supabase.com/project/{SUPABASE_URL.split('//')[-1].split('.')[0]}/sql/new")
    print()
    print("2. Paste the following SQL:")
    print("-" * 70)
    print(read_sql())
    print("-" * 70)
    print()
    print("3. Click 'Run' (or press Ctrl+Enter)")
    print()
    print("4. Re-run this script to verify:")
    print("   python apply_migration_009.py --verify")
    print()


def verify() -> bool:
    """Hit a known table via PostgREST to confirm it exists."""
    if not SUPABASE_ANON_KEY:
        print("!! SUPABASE_ANON_KEY missing — cannot verify")
        return False
    tables = [
        "onevone_rooms", "onevone_players",
        "onevone_matches", "onevone_submissions",
    ]
    headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
    }
    all_ok = True
    print("Verifying 1v1 tables exist ...")
    with httpx.Client(timeout=20) as client:
        for t in tables:
            r = client.get(f"{SUPABASE_URL}/rest/v1/{t}?select=id&limit=1", headers=headers)
            if r.status_code == 200:
                print(f"  [OK]  {t}")
            else:
                body = r.text[:120].replace("\n", " ")
                print(f"  [!!]  {t}  → HTTP {r.status_code}: {body}")
                all_ok = False
    return all_ok


def main() -> int:
    if "--verify" in sys.argv:
        return 0 if verify() else 2

    if not os.path.exists(MIGRATION_PATH):
        print(f"!! migration file not found: {MIGRATION_PATH}")
        return 1

    if apply_via_pg_meta():
        print("\n[OK] Migration applied via pg-meta.")
        verify()
        return 0
    if apply_via_management_api():
        print("\n[OK] Migration applied via management API.")
        verify()
        return 0

    show_manual_steps()
    return 2


if __name__ == "__main__":
    sys.exit(main())
