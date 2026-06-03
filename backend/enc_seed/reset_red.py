"""Replace all crypto challenges with 5 new Red team challenges from crypto_generator.

Steps:
  1. Delete every existing row in encryption_challenges.
  2. Build + insert 5 fresh Red challenges via crypto_generator.
"""
import os, json
from dotenv import load_dotenv
import httpx
load_dotenv()

H = {"apikey": os.environ["SUPABASE_ANON_KEY"],
     "Authorization": f"Bearer {os.environ['SUPABASE_ANON_KEY']}"}
BASE = f"{os.environ['SUPABASE_URL']}/rest/v1/encryption_challenges"

# 1) Wipe
print("Wiping existing rows…")
r = httpx.delete(f"{BASE}?team_role=neq.__never__", headers={**H, "Prefer": "count=exact"})
print(f"  status={r.status_code}")

# 2) Build 5 Red
import sys
sys.path.insert(0, r"C:\Users\Admin\Desktop\Apex2\Apex\backend")
from crypto_generator import build_seeds, insert_to_db

red = build_seeds("red")
print(f"Built {len(red)} Red challenges:")
for c in red:
    print(f"  - {c.title} | {c.difficulty} | {c.flag_preview[:50]}…")
    insert_to_db(c)

# 3) Final state
r = httpx.get(f"{BASE}?select=id,title,team_role,difficulty&order=created_at.desc", headers=H)
print(f"\nFinal pool: {len(r.json())} rows")
for row in r.json():
    print(f"  [{row['team_role']}] {row['title']} | {row['difficulty']}")
