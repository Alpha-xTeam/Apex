import sys
sys.path.insert(0, r'C:\Users\Admin\Desktop\Apex2\Apex\backend')
from supabase import create_client
from dotenv import load_dotenv
import os
load_dotenv(r'C:\Users\Admin\Desktop\Apex2\Apex\backend\.env')
sb = create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_ANON_KEY'])
res = sb.table('encryption_challenges').delete().eq('team_role', 'red').execute()
print(f"Deleted {len(res.data)} red rows")
res = sb.table('encryption_challenges').delete().eq('team_role', 'blue').execute()
print(f"Deleted {len(res.data)} blue rows")
print("Now empty. Watcher will refill on next poll.")
