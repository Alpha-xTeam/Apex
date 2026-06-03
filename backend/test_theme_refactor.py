import sys
sys.path.insert(0, r'C:\Users\Admin\Desktop\Apex2\Apex\backend')
from crypto_generator import build_seeds, randomize_template, RED_SEEDS, BLUE_SEEDS

print('=== Theme inventory ===')
for i, s in enumerate(RED_SEEDS):
    print(f'{i+1:2d}. {s["algorithm"]:12s} | {s["theme"]:30s} | {s["difficulty"]}')

print()
print('=== 3 separate red builds — verify no duplicates ===')
for run in range(3):
    seeds = build_seeds('red')
    titles = [c.title for c in seeds]
    flags  = [c.flag_hash for c in seeds]
    print(f'\nRun {run+1}:')
    for j, c in enumerate(seeds):
        print(f'  [{j+1:2d}] {c.module:18s} | {c.title[:65]}')
        print(f'        flag_hash={c.flag_hash[:16]}...')
    print(f'  → unique flag_hashes: {len(set(flags))}/{len(flags)}')

print()
print('=== Variety check: 20 red builds, collect unique titles ===')
all_titles = set()
for _ in range(20):
    for c in build_seeds('red'):
        all_titles.add(c.title)
print(f'Got {len(all_titles)} unique titles out of 20×11 = 220 challenges')

print()
print('=== Vigenere variations: theme + key + plaintext ===')
for theme_seed in [s for s in RED_SEEDS if s['algorithm'] == 'VIGENERE']:
    print(f'\n-- theme: {theme_seed["theme"]} --')
    for k in range(3):
        r = randomize_template(theme_seed)
        print(f'  [{k+1}] pt={r["plaintext"][:48]}...')
        print(f'      key={r["key_material"]}')
        print(f'      title={r["title"]}')

print()
print('=== Caesar variation: shift values per theme ===')
for theme_seed in [s for s in RED_SEEDS if s['algorithm'] == 'CAESAR']:
    print(f'\n-- theme: {theme_seed["theme"]} --')
    for k in range(3):
        r = randomize_template(theme_seed)
        sh = r.get('extra', {}).get('shift')
        print(f'  shift={sh:2d}  pt={r["plaintext"][:55]}')
