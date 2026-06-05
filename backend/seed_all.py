import asyncio
import sys
import os

sys.stdout.reconfigure(encoding='utf-8')
os.environ['PYTHONIOENCODING'] = 'utf-8'

import code_fixing_generator as cg

async def seed_all():
    seeds = cg._build_seeds()
    print(f"Total seeds: {len(seeds)}", flush=True)

    inserted = 0
    for seed in seeds:
        result = await cg._insert_to_db(seed)
        if result:
            inserted += 1
            print(f"  [+] Inserted: {seed['language']} / {seed['vulnerability_type']}", flush=True)
        else:
            print(f"  [-] Failed: {seed['language']} / {seed['vulnerability_type']}", flush=True)

    print(f"\nTotal inserted: {inserted}/{len(seeds)}", flush=True)

asyncio.run(seed_all())
