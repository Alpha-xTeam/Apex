"""Simulate the /api/training/list endpoint for both teams after the fix."""
import os
from dotenv import load_dotenv
import httpx
load_dotenv()

H = {"apikey": os.environ["SUPABASE_ANON_KEY"],
     "Authorization": f"Bearer {os.environ['SUPABASE_ANON_KEY']}"}
BASE = f"{os.environ['SUPABASE_URL']}/rest/v1/encryption_challenges"

for team in ["blue", "red"]:
    url = f"{BASE}?select=id,title,module,difficulty,xp_reward&team_role=eq.{team}&limit=100"
    r = httpx.get(url, headers=H)
    rows = r.json()
    print(f"\n{team.upper()} ({len(rows)} challenges):")
    for row in rows:
        print(f"  {row['title'][:40]:<40} | {row['difficulty']:<8} | {row['xp_reward']} XP | {row['module']}")
