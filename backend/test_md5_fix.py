import sys, base64, hashlib
sys.path.insert(0, r'C:\Users\Admin\Desktop\Apex2\Apex\backend')
from crypto_generator import randomize_template, ChallengeBuilder, ScenarioSpec, _spec_kwargs, RED_SEEDS

# New RED_SEEDS layout: 0-2 Vigenere, 3-4 Caesar, 5-6 XOR, 7-8 MD5, 9-10 SHA-1+SALT
MD5_IDX = 7
SHA1_IDX = 9

print("=" * 60)
print("MD5 — file content & flag (3 randomized runs)")
print("=" * 60)
m = RED_SEEDS[MD5_IDX]
for i in range(3):
    r = randomize_template(m)
    ch = ChallengeBuilder().build(ScenarioSpec(team_role='red', **_spec_kwargs(r)))
    pw = r['plaintext']
    # Decode the file content
    raw = base64.b64decode(ch.files['input.bin'])
    md5_expected = hashlib.md5(pw.encode()).hexdigest()
    print(f"\n--- Run {i+1} ---")
    print(f"  password     : {pw!r}")
    print(f"  file shows   : {raw.decode()!r}")
    print(f"  md5(pw) hex  : {md5_expected}")
    print(f"  flag_preview : {ch.flag_preview}")
    print(f"  sha256(pw)   : {hashlib.sha256(pw.encode()).hexdigest()}")
    print(f"  flag OK?     : {ch.flag_preview == f'CyberArena{{{hashlib.sha256(pw.encode()).hexdigest()}}}'}")

print("\n" + "=" * 60)
print("SHA-1+SALT — file content & flag (3 randomized runs)")
print("=" * 60)
s = RED_SEEDS[SHA1_IDX]
for i in range(3):
    r = randomize_template(s)
    ch = ChallengeBuilder().build(ScenarioSpec(team_role='red', **_spec_kwargs(r)))
    pw = r['plaintext']
    raw = base64.b64decode(ch.files['input.bin'])
    sha256_of_pw = hashlib.sha256(pw.encode()).hexdigest()
    print(f"\n--- Run {i+1} ---")
    print(f"  password     : {pw!r}")
    print(f"  salt         : {r['key_material']!r}")
    print(f"  file shows   : {raw.decode()!r}")
    print(f"  flag_preview : {ch.flag_preview}")
    print(f"  flag OK?     : {ch.flag_preview == f'CyberArena{{{sha256_of_pw}}}'}")
    if '/etc/shadow' in ch.files:
        # /etc/shadow is appended as raw text (not base64)
        print(f"  /etc/shadow  : {ch.files['/etc/shadow']!r}")
