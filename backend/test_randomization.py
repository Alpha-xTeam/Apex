import sys
sys.path.insert(0, r'C:\Users\Admin\Desktop\Apex2\Apex\backend')
from crypto_generator import randomize_template, ChallengeBuilder, ScenarioSpec, _spec_kwargs, RED_SEEDS, BLUE_SEEDS

print('--- RED seeds randomized 3x each ---')
for i in range(3):
    seen = set()
    for s in RED_SEEDS:
        r = randomize_template(s)
        ch = ChallengeBuilder().build(ScenarioSpec(team_role='red', **_spec_kwargs(r)))
        seen.add(ch.flag_hash)
    print(f'Round {i+1}: {len(seen)}/{len(RED_SEEDS)} unique flags')

print('--- Same algorithm over 5 runs (Vigenere) ---')
v = RED_SEEDS[0]
for _ in range(5):
    r = randomize_template(v)
    ch = ChallengeBuilder().build(ScenarioSpec(team_role='red', **_spec_kwargs(r)))
    pt = r['plaintext'][:50]
    key = r['key_material']
    print(f'  pt={pt:<50} key={key}  hash={ch.flag_hash[:16]}...')

print('--- Caesar shifts over 5 runs (first Caesar theme = idx 3) ---')
c = RED_SEEDS[3]
for _ in range(5):
    r = randomize_template(c)
    ch = ChallengeBuilder().build(ScenarioSpec(team_role='red', **_spec_kwargs(r)))
    pt = r['plaintext'][:50]
    sh = r.get('extra', {}).get('shift')
    print(f'  shift={sh}  pt={pt}  hash={ch.flag_hash[:16]}...')

print('--- XOR key_byte over 5 runs (first XOR theme = idx 5) ---')
x = RED_SEEDS[5]
for _ in range(5):
    r = randomize_template(x)
    ch = ChallengeBuilder().build(ScenarioSpec(team_role='red', **_spec_kwargs(r)))
    pt = r['plaintext'][:50]
    kb = r.get('extra', {}).get('key_byte')
    print(f'  key_byte=0x{kb:02X}  pt={pt}  hash={ch.flag_hash[:16]}...')
