import sys
sys.path.insert(0, r'C:\Users\Admin\Desktop\Apex2\Apex\backend')
from supabase import create_client
from dotenv import load_dotenv
import os
load_dotenv(r'C:\Users\Admin\Desktop\Apex2\Apex\backend\.env')
sb = create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_ANON_KEY'])
res = sb.table('encryption_challenges').select('id, title, story, created_at').eq('team_role', 'red').order('created_at').execute()
print('Red team rows in DB (newest first):')
print('=' * 80)
for r in reversed(res.data):
    print(f"id: {r['id'][:8]}")
    print(f"  title:   {r['title'][:70]}")
    print(f"  story:   {r['story'][:80]}")
    print(f"  created: {r['created_at']}")
    print()
