"""Verify the list endpoint would work with the new table."""
import os
from dotenv import load_dotenv
import httpx
load_dotenv()

AMP = "&"
url = (
    f"{os.environ['SUPABASE_URL']}/rest/v1/encryption_challenges"
    f"?select=id,title,module,difficulty,xp_reward"
    f"{AMP}team_role=eq.blue"
    f"{AMP}limit=10"
)
r = httpx.get(url, headers={"apikey": os.environ["SUPABASE_ANON_KEY"], "Authorization": f"Bearer {os.environ['SUPABASE_ANON_KEY']}"})
print("Status:", r.status_code)
print(f"Got {len(r.json())} rows:")
for row in r.json():
    print(f"  {row['title'][:40]:<40} | {row['difficulty']:<8} | {row['xp_reward']} XP | {row['module']}")
