import sys
sys.path.insert(0, r'C:\Users\Admin\Desktop\Apex2\Apex\backend')
from crypto_generator import randomize_template, RED_SEEDS, BLUE_SEEDS

print("=" * 60)
print("VIGENERE — 3 distinct stories")
print("=" * 60)
v = RED_SEEDS[0]
for i in range(3):
    r = randomize_template(v)
    print(f"\n--- Run {i+1} ---")
    print(f"Title: {r['title']}")
    print(f"Story: {r['story']}")

print("\n" + "=" * 60)
print("AES-256-GCM — 3 distinct stories (with varied names)")
print("=" * 60)
g = BLUE_SEEDS[1]
for i in range(3):
    r = randomize_template(g)
    print(f"\n--- Run {i+1} ---")
    print(f"Title: {r['title']}")
    print(f"Story: {r['story']}")
    print(f"Key:   {r['key_material']}")

print("\n" + "=" * 60)
print("MD5 — 3 distinct stories (with varied leak sources)")
print("=" * 60)
m = RED_SEEDS[3]
for i in range(3):
    r = randomize_template(m)
    print(f"\n--- Run {i+1} ---")
    print(f"Title: {r['title']}")
    print(f"Story: {r['story']}")
    print(f"Hash:  {r['key_material'][:20]}...")

print("\n" + "=" * 60)
print("SHA-256 — 3 distinct stories (with varied firmware sources)")
print("=" * 60)
s = BLUE_SEEDS[3]
for i in range(3):
    r = randomize_template(s)
    print(f"\n--- Run {i+1} ---")
    print(f"Title: {r['title']}")
    print(f"Story: {r['story']}")
