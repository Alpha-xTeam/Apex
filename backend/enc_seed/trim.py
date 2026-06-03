"""Trim encryption_challenges to exactly 5 per team.

Strategy: keep the most recent 5 by created_at for each team.
"""
import os
from dotenv import load_dotenv
import httpx
load_dotenv()

H = {"apikey": os.environ["SUPABASE_ANON_KEY"],
     "Authorization": f"Bearer {os.environ['SUPABASE_ANON_KEY']}"}
BASE = f"{os.environ['SUPABASE_URL']}/rest/v1/encryption_challenges"

for team in ["blue", "red"]:
    # Get all IDs for the team, ordered by created_at desc
    url = f"{BASE}?select=id,created_at&team_role=eq.{team}&order=created_at.desc"
    r = httpx.get(url, headers=H)
    rows = r.json()
    print(f"{team}: {len(rows)} rows")
    if len(rows) > 5:
        to_delete = [row["id"] for row in rows[5:]]
        for sid in to_delete:
            httpx.delete(f"{BASE}?id=eq.{sid}", headers=H)
        print(f"  Deleted {len(to_delete)} duplicates (kept newest 5)")

# Final state
for team in ["blue", "red"]:
    url = f"{BASE}?select=id&team_role=eq.{team}"
    r = httpx.get(url, headers=H)
    print(f"{team} final: {len(r.json())}")
