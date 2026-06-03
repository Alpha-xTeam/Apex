"""Deduplicate by title within each team (keep newest)."""
import os
from dotenv import load_dotenv
import httpx
load_dotenv()

H = {"apikey": os.environ["SUPABASE_ANON_KEY"],
     "Authorization": f"Bearer {os.environ['SUPABASE_ANON_KEY']}"}
BASE = f"{os.environ['SUPABASE_URL']}/rest/v1/encryption_challenges"

for team in ["blue", "red"]:
    url = f"{BASE}?select=id,title,created_at&team_role=eq.{team}&order=created_at.desc"
    r = httpx.get(url, headers=H)
    rows = r.json()
    seen_titles = set()
    to_delete = []
    for row in rows:
        if row["title"] in seen_titles:
            to_delete.append(row["id"])
        else:
            seen_titles.add(row["title"])
    for sid in to_delete:
        httpx.delete(f"{BASE}?id=eq.{sid}", headers=H)
    print(f"{team}: deleted {len(to_delete)} duplicates (kept unique titles)")

# Final state
for team in ["blue", "red"]:
    url = f"{BASE}?select=id,title,module,difficulty&team_role=eq.{team}&order=created_at.desc"
    r = httpx.get(url, headers=H)
    rows = r.json()
    print(f"\n{team.upper()} ({len(rows)}):")
    for row in rows:
        print(f"  {row['title'][:40]:<40} | {row['difficulty']:<8} | {row['module']}")
