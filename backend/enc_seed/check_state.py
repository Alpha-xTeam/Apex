"""Check current state of encryption_challenges table."""
import os, sys
from dotenv import load_dotenv
import httpx
load_dotenv()

url = f"{os.environ['SUPABASE_URL']}/rest/v1/encryption_challenges?select=id,team_role,module,title,flag_hash,difficulty,xp_reward"
r = httpx.get(url, headers={"apikey": os.environ["SUPABASE_ANON_KEY"], "Authorization": f"Bearer {os.environ['SUPABASE_ANON_KEY']}"})
print("Status:", r.status_code)
data = r.json()
print(f"Total rows: {len(data)}")
by_team = {}
for row in data:
    by_team.setdefault(row["team_role"], []).append(row)
for team, rows in sorted(by_team.items()):
    print(f"\n{team.upper()} ({len(rows)}):")
    for r in rows:
        print(f"  {r['id'][:8]}... {r['title'][:40]:<40} | {r['difficulty']:<8} | {r['flag_hash'][:12]}...")
