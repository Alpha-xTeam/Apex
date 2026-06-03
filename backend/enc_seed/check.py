"""Inspect actual DB state."""
import os
from dotenv import load_dotenv
import httpx
from collections import Counter
load_dotenv()

url = f"{os.environ['SUPABASE_URL']}/rest/v1/encryption_challenges?select=team_role,module,title,difficulty"
r = httpx.get(url, headers={"apikey": os.environ["SUPABASE_ANON_KEY"], "Authorization": f"Bearer {os.environ['SUPABASE_ANON_KEY']}"})
data = r.json()
print(f"Total rows: {len(data)}")
print(f"By team: {dict(Counter(d['team_role'] for d in data))}")
print(f"By team+module: {dict(Counter((d['team_role'], d['module']) for d in data))}")
print()
for team in ["blue", "red"]:
    titles = [d["title"] for d in data if d["team_role"] == team]
    print(f"\n{team.upper()} ({len(titles)}):")
    for t in titles:
        print(f"  - {t[:60]}")
