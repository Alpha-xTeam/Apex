import sys
sys.path.insert(0, r'C:\Users\Admin\Desktop\Apex2\Apex\backend')
from crypto_generator import randomize_template, RED_SEEDS, BLUE_SEEDS

# New RED_SEEDS layout:
#   0-2: Vigenere
#   3-4: Caesar
#   5-6: XOR
#   7-8: MD5
#   9-10: SHA-1+SALT

print("=" * 60)
print("VIGENERE — 3 distinct stories (theme: ww2_spy_radio)")
print("=" * 60)
v = RED_SEEDS[0]
for i in range(3):
    r = randomize_template(v)
    print(f"\n--- Run {i+1} ---")
    print(f"Title: {r['title']}")
    print(f"Story: {r['story']}")

print("\n" + "=" * 60)
print("CAESAR — 3 distinct stories (theme: roman_legion_dispatch)")
print("=" * 60)
c = RED_SEEDS[3]
for i in range(3):
    r = randomize_template(c)
    print(f"\n--- Run {i+1} ---")
    print(f"Title: {r['title']}")
    print(f"Story: {r['story']}")
    print(f"shift: {r.get('extra', {}).get('shift')}")

print("\n" + "=" * 60)
print("XOR — 3 distinct stories (theme: malware_c2_beacon)")
print("=" * 60)
x = RED_SEEDS[5]
for i in range(3):
    r = randomize_template(x)
    print(f"\n--- Run {i+1} ---")
    print(f"Title: {r['title']}")
    print(f"Story: {r['story']}")
    print(f"key_byte: 0x{r.get('extra', {}).get('key_byte'):02X}")

print("\n" + "=" * 60)
print("MD5 — 3 distinct stories (theme: wordpress_leak)")
print("=" * 60)
m = RED_SEEDS[7]
for i in range(3):
    r = randomize_template(m)
    print(f"\n--- Run {i+1} ---")
    print(f"Title: {r['title']}")
    print(f"Story: {r['story']}")
    print(f"password: {r['plaintext']}")

print("\n" + "=" * 60)
print("SHA-1+SALT — 3 distinct stories (theme: linux_root_password)")
print("=" * 60)
s = RED_SEEDS[9]
for i in range(3):
    r = randomize_template(s)
    print(f"\n--- Run {i+1} ---")
    print(f"Title: {r['title']}")
    print(f"Story: {r['story']}")
    print(f"password: {r['plaintext']}")
    print(f"salt:     {r['key_material']}")
