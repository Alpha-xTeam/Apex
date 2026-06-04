"""
apply_migration_005.py
======================
Applies migration 005 to create the `web_exploitation_challenges` table.

Tries three strategies in order:
  1. Supabase Management API (requires SUPABASE_ACCESS_TOKEN env var)
  2. Direct PostgreSQL connection (requires DATABASE_URL env var)
  3. Fall back to: print the SQL + clipboard + step-by-step instructions

Usage:
    python apply_migration_005.py            # tries strategies 1+2 then prints
    python apply_migration_005.py --print    # skip strategies, just print SQL
    python apply_migration_005.py --copy     # print + copy to clipboard
"""
import argparse
import os
import sys
import time
from pathlib import Path

# Force UTF-8 output
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# Load .env if available
try:
    from dotenv import load_dotenv
    _env_path = Path(__file__).parent / ".env"
    if _env_path.exists():
        load_dotenv(_env_path)
except ImportError:
    pass

MIGRATION_FILE = Path(__file__).parent / "migrations" / "005_web_exploitation_challenges.sql"
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://yevtnyokixocpihpdwqu.supabase.co")
SUPABASE_PROJECT_ID = SUPABASE_URL.replace("https://", "").replace("http://", "").split(".")[0]
SUPABASE_ACCESS_TOKEN = os.environ.get("SUPABASE_ACCESS_TOKEN", "")
DATABASE_URL = os.environ.get("DATABASE_URL", "")


def banner(msg: str) -> None:
    print()
    print("=" * 70)
    print(f"  {msg}")
    print("=" * 70)


def print_sql() -> None:
    print(MIGRATION_FILE.read_text(encoding="utf-8"))


def try_supabase_management_api() -> bool:
    """Strategy 1: use the Supabase Management API to run SQL.

    Requires a personal access token from https://supabase.com/dashboard/account/tokens
    in SUPABASE_ACCESS_TOKEN env var.
    """
    if not SUPABASE_ACCESS_TOKEN:
        return False

    import httpx

    banner("Strategy 1: Supabase Management API")
    print(f"Project: {SUPABASE_PROJECT_ID}")

    sql = MIGRATION_FILE.read_text(encoding="utf-8")
    url = f"https://api.supabase.com/v1/projects/{SUPABASE_PROJECT_ID}/database/query"
    headers = {
        "Authorization": f"Bearer {SUPABASE_ACCESS_TOKEN}",
        "Content-Type": "application/json",
    }
    try:
        with httpx.Client(timeout=30) as client:
            resp = client.post(url, headers=headers, json={"query": sql})
            if resp.status_code == 200:
                print("✓ Migration applied via Management API")
                return True
            else:
                print(f"✗ Management API returned {resp.status_code}: {resp.text[:200]}")
                return False
    except Exception as e:
        print(f"✗ Management API failed: {e}")
        return False


def try_direct_postgres() -> bool:
    """Strategy 2: connect directly to the Postgres database.

    Requires DATABASE_URL env var (e.g. postgresql://postgres:PASS@db.PROJECT.supabase.co:5432/postgres)
    Find this in Supabase Dashboard > Settings > Database > Connection string.
    """
    if not DATABASE_URL:
        return False

    banner("Strategy 2: Direct Postgres connection")
    try:
        import psycopg2
    except ImportError:
        print("✗ psycopg2 not installed. Run: pip install psycopg2-binary")
        return False

    sql = MIGRATION_FILE.read_text(encoding="utf-8")
    try:
        conn = psycopg2.connect(DATABASE_URL)
        conn.autocommit = True
        with conn.cursor() as cur:
            cur.execute(sql)
        conn.close()
        print("✓ Migration applied via direct Postgres connection")
        return True
    except Exception as e:
        print(f"✗ Direct Postgres failed: {e}")
        return False


def fallback_manual() -> None:
    """Strategy 3: print the SQL and clear instructions."""
    banner("Strategy 3: Manual — paste into Supabase SQL Editor")
    print()
    print("The migration SQL is printed below.")
    print("To apply it manually:")
    print(f"  1. Open: https://supabase.com/dashboard/project/{SUPABASE_PROJECT_ID}/sql/new")
    print("  2. Paste the SQL into the editor")
    print("  3. Click 'Run' (or press Ctrl+Enter)")
    print()
    print("-" * 70)
    print_sql()
    print("-" * 70)

    # Optionally copy to clipboard (Windows)
    if "--copy" in sys.argv:
        try:
            import subprocess
            sql = MIGRATION_FILE.read_text(encoding="utf-8")
            p = subprocess.Popen(["clip"], stdin=subprocess.PIPE, shell=True)
            p.communicate(sql.encode("utf-16le"))
            print("\n✓ SQL copied to clipboard")
        except Exception as e:
            print(f"\n(Clipboard copy failed: {e})")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--print", action="store_true", help="Only print the SQL, skip auto-apply")
    parser.add_argument("--copy", action="store_true", help="Print + copy to clipboard")
    args = parser.parse_args()

    banner("CyberArena — Migration 005 (web_exploitation_challenges)")

    if args.print:
        print_sql()
        return

    # Try automatic strategies first
    if try_supabase_management_api():
        return
    if try_direct_postgres():
        return

    # Fall back to manual
    fallback_manual()

    print()
    print("After applying the migration, restart the backend.")
    print("The [webex:red] pool watcher will populate 5 challenges within ~8 seconds.")


if __name__ == "__main__":
    main()
