import sys, base64
sys.path.insert(0, r'C:\Users\Admin\Desktop\Apex2\Apex\backend')
from crypto_generator import build_seeds

print("=" * 70)
print("FULL CHALLENGE OUTPUT — Red Team 11 themes")
print("=" * 70)

for c in build_seeds('red'):
    print(f"\n{'─' * 70}")
    print(f"Title:      {c.title}")
    print(f"Module:     {c.module}  |  Difficulty: {c.difficulty}  |  XP: {c.xp_reward}")
    print(f"Story:      {c.story[:120]}...")
    print(f"Task:       {c.task_outline[:120]}...")
    print(f"Files:      {list(c.files.keys())}")
    print(f"Tools:      {c.tools_whitelist[:5]}...")
    print(f"Hints:      {len(c.hints)} hints provided")
    for j, h in enumerate(c.hints, 1):
        print(f"            {j}. {h[:90]}...")
    print(f"Flag:       {c.flag_preview[:80]}...")
