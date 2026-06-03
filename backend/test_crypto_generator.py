"""Quick smoke test for crypto_generator.

Validates:
  - All seeds build without error
  - flag_preview matches CyberArena{...} format
  - flag_hash = sha256(flag_preview)
  - flags are unique (one batch of build_seeds produces unique flags)
  - files/command_outputs are non-empty
  - algorithm names NOT in task_outline
"""
import sys
import hashlib
import json
sys.path.insert(0, r"C:\Users\Admin\Desktop\Apex2\Apex\backend")
from crypto_generator import build_seeds, BLUE_SEEDS, RED_SEEDS

def test_builds_clean():
    blue = build_seeds("blue")
    red = build_seeds("red")
    assert len(blue) == len(BLUE_SEEDS), f"expected {len(BLUE_SEEDS)} blue, got {len(blue)}"
    assert len(red) == len(RED_SEEDS), f"expected {len(RED_SEEDS)} red, got {len(red)}"
    print(f"✓ Built {len(blue)} Blue + {len(red)} Red themes")

def test_flag_format():
    for team, chs in [("blue", build_seeds("blue")), ("red", build_seeds("red"))]:
        for c in chs:
            assert c.flag_preview.startswith("CyberArena{")
            assert c.flag_preview.endswith("}")
            expected_hash = hashlib.sha256(c.flag_preview.encode()).hexdigest()
            assert c.flag_hash == expected_hash, f"flag_hash mismatch for {c.title}"
    print("✓ All flags valid CyberArena{...} format and hashes match")

def test_flags_unique():
    flags = [c.flag_hash for c in build_seeds("blue") + build_seeds("red")]
    assert len(flags) == len(set(flags)), "duplicate flag_hash detected in a single build"
    print(f"✓ All {len(flags)} flag_hash values in one build are unique")

def test_no_algo_in_task():
    forbidden = ["AES", "RSA", "Vigenere", "Caesar", "MD5", "SHA-1", "SHA-256", "HMAC", "XOR"]
    for c in build_seeds("blue") + build_seeds("red"):
        for f in forbidden:
            assert f.lower() not in c.task_outline.lower(), f"'{f}' leaked into task: {c.title}"
    print("✓ No algorithm names leaked into any task_outline")

def test_files_and_outputs_present():
    for c in build_seeds("blue") + build_seeds("red"):
        assert c.files, f"empty files for {c.title}"
        assert c.command_outputs, f"empty command_outputs for {c.title}"
        for fn, content in c.files.items():
            assert content, f"empty file content: {fn} in {c.title}"
    print("✓ All challenges have non-empty files and command_outputs")

def test_xp_by_difficulty():
    for c in build_seeds("blue") + build_seeds("red"):
        expected = {"مبتدئ": 100, "متوسط": 150, "قوي": 200}[c.difficulty]
        assert c.xp_reward == expected, f"xp mismatch for {c.title}"
    print("✓ XP rewards match difficulty")

def test_team_role_consistency():
    for c in build_seeds("blue"):
        assert c.team_role == "blue"
    for c in build_seeds("red"):
        assert c.team_role == "red"
    print("✓ team_role is consistent with seed source")

if __name__ == "__main__":
    test_builds_clean()
    test_flag_format()
    test_flags_unique()
    test_no_algo_in_task()
    test_files_and_outputs_present()
    test_xp_by_difficulty()
    test_team_role_consistency()
    print("\n✅ All tests passed")
