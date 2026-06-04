"""
crypto_generator.py
===================
Generates fully-realized encryption challenges for the CyberArena pool.

Contract (this is one of N challenge-type generators; see main.py for the
orchestrator that runs all of them):

    main.py watcher  (polls encryption_challenges count)
            │
            ▼
    refill_pool(team_role, count)
            │
            ▼
    _refill_pool_unlocked()
            │
            │  1. System pre-selects algorithm (ALGORITHM_ROTATION)
            │  2. AI generates: title + story + task + hints + plaintext
            │  3. Python encrypts the plaintext with the pre-selected algo
            │  4. ChallengeBuilder produces a Challenge, insert to DB
            │
            ▼
    public.encryption_challenges

The algorithm is FIXED per slot — the AI is only asked to write flavor text
(title, story, task, hints) plus the plaintext. Python handles all
encryption deterministically. This guarantees the algorithm always matches
its module, and the crypto logic is provably correct (no LLM hallucination).

Public API (used by main.py):
    - POOL_TARGET = 5           per (team, module)
    - async refill_pool(team_role, count) -> int            (returns # inserted)
    - async start_pool_watcher(team_role, module)           (long-running task)

CLI:
    python crypto_generator.py --team blue  --seed-only
    python crypto_generator.py --team red   --seed-only
    python crypto_generator.py --team blue  --ai --count 1   (requires GROQ_API_KEY)
"""
from __future__ import annotations

import argparse
import asyncio
import base64
import hashlib
import hmac
import json
import os
import random
import re
import sys
import time
import uuid
from dataclasses import dataclass, field, asdict
from typing import Optional, Literal

# Load .env early so the CLI works without manual export
try:
    from dotenv import load_dotenv
    _env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    if os.path.exists(_env_path):
        load_dotenv(_env_path)
except ImportError:
    pass

import httpx
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives import hashes, serialization, padding as sympad
from cryptography.hazmat.primitives.asymmetric import rsa, padding as apad
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.backends import default_backend

# --------------------------------------------------------------------------- #
# 0. Constants
# --------------------------------------------------------------------------- #

ALLOWED_MODULES = ("encryption-basics", "hash-cracking", "rsa-aes")
ALLOWED_DIFFICULTIES = ("مبتدئ", "متوسط", "قوي")
ALLOWED_TEAMS = ("blue", "red")

# Map each module to the algorithms that legally belong to it. Used to
# validate AI responses and reject any that don't match the requested
# module (so a wrong combo falls back to a curated seed).
ALGOS_BY_MODULE = {
    "encryption-basics": {"AES-256-CBC", "AES-256-GCM", "VIGENERE", "CAESAR", "XOR"},
    "hash-cracking":     {"MD5", "SHA-1+SALT", "SHA-256", "HMAC-SHA256"},
    "rsa-aes":           {"RSA-1024"},
}

# Round-robin list of algorithms the system pre-selects for each slot.
# The AI no longer picks the algorithm — it only generates the flavor
# (title, story, task, hints, plaintext). Python then encrypts the
# plaintext using the algorithm the system chose, so the algorithm is
# always guaranteed to match the module and the crypto is deterministic.
ALGORITHM_ROTATION = [
    ("encryption-basics", "AES-256-CBC"),
    ("hash-cracking",     "SHA-256"),
    ("encryption-basics", "CAESAR"),
    ("encryption-basics", "VIGENERE"),
    ("hash-cracking",     "MD5"),
    ("encryption-basics", "AES-256-GCM"),
    ("encryption-basics", "XOR"),
    ("rsa-aes",           "RSA-1024"),
    ("hash-cracking",     "HMAC-SHA256"),
    ("hash-cracking",     "SHA-1+SALT"),
]


def _pick_algorithm_for_slot(i: int) -> tuple[str, str]:
    """Return (module, algorithm) for slot i in the refill cycle.

    The AI is NOT asked to pick an algorithm — the system pre-selects
    one from ALGORITHM_ROTATION, guaranteeing it always belongs to a
    legal module.
    """
    return ALGORITHM_ROTATION[i % len(ALGORITHM_ROTATION)]


def _generate_key_for_algo(algorithm: str, extra: dict) -> tuple[str, dict]:
    """Auto-generate key_material (and any extra params) for the given algorithm.

    Returns (key_material, updated_extra). Called when the AI didn't supply
    a key (or supplied an empty one). The output is what the
    CryptoExecutor expects for that algorithm.
    """
    algo = _normalize_algo(algorithm).upper()
    out_extra = dict(extra) if extra else {}

    if algo == "AES-256-CBC":
        passwords = [
            "P@ssw0rd!2024", "CryptoK3y#Secure", "AES-Strong!Key9",
            "B1ueT34m$Lock", "C0mpl3x!Pass2025", "R3dT3am@K3y256",
            "S3cur3Pass!2024", "QuantumSafe!Key",
        ]
        return random.choice(passwords), out_extra

    if algo == "AES-256-GCM":
        passwords = [
            "GCM@SecureK3y!", "AuthT4g$Pass2024", "AEAD#K3yStr0ng",
            "NetS3cure!2024", "Cloud!Encrypt#9", "P@cketK3y$AEAD",
        ]
        return random.choice(passwords), out_extra

    if algo == "RSA-1024":
        return "", out_extra  # RSA generates its own key

    if algo == "VIGENERE":
        keys = ["RADIO", "ENIGMA", "BLITZ", "LONDON", "AXIS", "OMEGA", "NEXUS", "KILO", "TANGO"]
        return random.choice(keys), out_extra

    if algo == "CAESAR":
        shift = random.choice([3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25])
        out_extra["shift"] = shift
        return f"shift={shift}", out_extra

    if algo == "XOR":
        key_byte = random.choice([0x42, 0x55, 0x77, 0xA3, 0xC9, 0xE5, 0x4F, 0x9B,
                                  0x88, 0xAA, 0xC7, 0xE2, 0xB1, 0x9C, 0xD4, 0xF6])
        out_extra["key_byte"] = key_byte
        return f"key_byte=0x{key_byte:02X}", out_extra

    if algo == "MD5":
        return f"$P${_rand8_alnum()}{_rand8_alnum()[:4]}", out_extra

    if algo == "SHA-1+SALT":
        salt = random.choice(["apex2026", "linux42", "r00tme", "cisco99", "salted", "redhat9"])
        out_extra["salt"] = salt
        return f"$1${salt}$", out_extra

    if algo == "SHA-256":
        return "", out_extra

    if algo == "HMAC-SHA256":
        keys = ["hmac-shared-secret-2024", "RedTeam@K3y!9", "APEX#MAC$K3y", "Auth$Sign@2025"]
        return random.choice(keys), out_extra

    return "", out_extra


def _rand8_alnum() -> str:
    """Return 8 random alphanumeric characters (used for MD5 fake hash prefixes)."""
    return "".join(random.choice("abcdefghijklmnopqrstuvwxyz0123456789") for _ in range(8))


def _normalize_algo(algorithm: str) -> str:
    """If Groq returns a pipe-separated list like 'AES-256-CBC|VIGENERE',
    pick the first token so downstream checks can match it."""
    if "|" in algorithm:
        return algorithm.split("|")[0].strip()
    return algorithm.strip()


def _algo_matches_module(algorithm: str, module: str) -> bool:
    """True if the algorithm is allowed inside the given module bucket."""
    algo = _normalize_algo(algorithm)
    if algo.startswith("RSA"):
        return module == "rsa-aes"
    return algo in ALGOS_BY_MODULE.get(module, set())

# Pool tuning — per (team, module) bucket.
POOL_TARGET = 5       # max cached
POOL_THRESHOLD = 2    # when count drops to this, trigger refill
POOL_BATCH = 3        # how many to insert per refill
WATCHER_POLL_SECS = 60    # how often the background task polls the DB
WATCHER_COOLDOWN = 12     # sleep between AI calls (Groq rate-limit guard)
IDLE_POLL_SECS = 60      # how long to wait when the pool is full (1 min)
_AI_BACKOFF_UNTIL: dict[str, float] = {}  # per-team epoch timestamp until which AI is paused after a 429

# Concurrency control — see refill_pool / start_pool_watcher.
# One asyncio.Lock per team serialises any concurrent refill attempts
# (watcher vs CLI --refill, two watcher tasks, etc.) so the pool never
# overshoots POOL_TARGET due to a stale count.
_POOL_LOCKS: dict[str, asyncio.Lock] = {}
# Dedup set so two `start_pool_watcher` calls in the same process don't
# both spin up a loop.
_WATCHER_STARTED: set[tuple[str, str]] = set()  # (generator_name, team_role)


def _get_pool_lock(team_role: str) -> asyncio.Lock:
    if team_role not in _POOL_LOCKS:
        _POOL_LOCKS[team_role] = asyncio.Lock()
    return _POOL_LOCKS[team_role]


def _repair_json(raw: str) -> dict:
    """Best-effort JSON repair for common LLM malformations.

    Handles: trailing commas, truncated output (missing closing braces),
    truncated mid-string, and stray text around the JSON blob.
    """
    import re
    text = raw.strip()

    if text.startswith("```"):
        parts = text.split("```")
        if len(parts) >= 3:
            text = parts[1]
            if text.startswith("json"):
                text = text[4:]
            text = text.strip().rstrip("`")

    first_brace = text.find("{")
    last_brace = text.rfind("}")
    if first_brace != -1 and last_brace > first_brace:
        text = text[first_brace:last_brace + 1]

    text = re.sub(r",\s*([}\]])", r"\1", text)

    # Quick path: already valid JSON
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Detect mid-string truncation: if the text ends inside an unescaped
    # double-quote, close it. This is the common case when the Groq SDK
    # returns a body that was cut off at max_completion_tokens.
    def _close_truncated_string(s: str) -> str:
        # Walk the string tracking string state (rough but works for
        # our LLM JSON output which is single-line except for \n escapes).
        in_string = False
        escape = False
        last_quote_idx = -1
        for i, ch in enumerate(s):
            if escape:
                escape = False
                continue
            if ch == '\\':
                escape = True
                continue
            if ch == '"':
                in_string = not in_string
                last_quote_idx = i
        if in_string and last_quote_idx >= 0:
            return s + '"'
        return s

    open_braces = text.count("{") - text.count("}")
    open_brackets = text.count("[") - text.count("]")
    candidate = _close_truncated_string(text)
    candidate = candidate + "]" * max(0, open_brackets) + "}" * max(0, open_braces)
    try:
        return json.loads(candidate)
    except json.JSONDecodeError:
        pass

    # Last resort: chop off the partial last key/value pair and try again.
    # Find the last complete top-level key by looking for the last `,"` or
    # `{"` boundary.
    idx = candidate.rfind(",")
    if idx > 0:
        snippet = candidate[:idx] + "]" * max(0, open_brackets) + "}" * max(0, open_braces)
        try:
            return json.loads(snippet)
        except json.JSONDecodeError:
            pass

    raise ValueError(f"Could not repair JSON: {raw[:200]}")


XP_BY_DIFFICULTY = {"مبتدئ": 100, "متوسط": 150, "قوي": 200}

# Default tool whitelist for the in-browser terminal sandbox.
DEFAULT_TOOLS = ["cat", "ls", "echo", "openssl", "sha256sum", "base64", "file"]

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://yevtnyokixocpihhdwqu.supabase.co")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")
# Primary AI: Cloudflare Workers AI (minimax-m3 if available, else llama-3.1-8b)
CLOUDFLARE_API_TOKEN = os.environ.get("CLOUDFLARE_API_TOKEN", "")
CLOUDFLARE_ACCOUNT_ID = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "")
CLOUDFLARE_MODEL = os.environ.get("CLOUDFLARE_MODEL", "@cf/meta/llama-3.1-8b-instruct")
CLOUDFLARE_URL = (
    f"https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/ai/run/{CLOUDFLARE_MODEL}"
    if CLOUDFLARE_ACCOUNT_ID else ""
)
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
GROQ_MODEL = os.environ.get("GROQ_MODEL", "llama-3.1-8b-instant")
# Tertiary AI: NVIDIA integrate API (DeepSeek v4-pro). OpenAI-compatible.
NVIDIA_API_KEY = os.environ.get("NVIDIA_API_KEY", "")
NVIDIA_MODEL = os.environ.get("NVIDIA_MODEL", "deepseek-ai/deepseek-v4-pro")
NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions"

# Flag format: CyberArena{<hex>}
FLAG_PREFIX = "CyberArena{"


# --------------------------------------------------------------------------- #
# 1. ScenarioSpec — what the AI / human provides
# --------------------------------------------------------------------------- #

@dataclass
class ScenarioSpec:
    """Inputs the AI generates (or the human hand-writes).

    The AI never invents the encrypted output, the flag, or the command
    outputs — Python computes those. This dataclass only contains the
    cryptographic *recipe*.
    """
    team_role: Literal["blue", "red"]
    module: Literal["encryption-basics", "hash-cracking", "rsa-aes"]
    algorithm: str                                # AES-256-CBC | AES-256-GCM | RSA-1024 | SHA-256 | HMAC-SHA256 | Vigenere | Caesar | XOR | MD5 | SHA-1+salt
    difficulty: Literal["مبتدئ", "متوسط", "قوي"]

    # Story / task (the natural-language shell — fed to the student)
    title: str
    story: str
    task_outline: str

    # Crypto recipe (Python will execute)
    plaintext: str
    key_material: str = ""                        # password, key bytes (b64), or salt
    extra: dict = field(default_factory=dict)      # algorithm-specific (iv, salt, shift, etc.)

    # Optional manual override
    expected_flag: Optional[str] = None           # if pre-computed externally

    # Theme-specific Socratic hints. If provided, ChallengeBuilder prefers
    # these over the generic HINTS_BY_DIFFICULTY fallbacks.
    hints: list = field(default_factory=list)

    def validate(self):
        assert self.team_role in ALLOWED_TEAMS
        assert self.module in ALLOWED_MODULES
        assert self.difficulty in ALLOWED_DIFFICULTIES
        # Normalize: Groq sometimes returns pipe-separated algos like
        # "AES-256-CBC|VIGENERE" — take the first token.
        self.algorithm = _normalize_algo(self.algorithm)
        assert self.algorithm, "algorithm required"
        assert self.story and self.task_outline
        # Anti-pattern: never reveal the exact algorithm in the task_outline.
        # (The story is allowed to use contextual jargon like "hash", "salt",
        # "signature" — but the task must not say "use AES-256-CBC" etc.)
        for forbidden in ("AES", "RSA", "Vigenere", "Caesar", "MD5", "SHA-1",
                          "SHA-256", "HMAC", "XOR"):
            if forbidden.lower() in self.task_outline.lower():
                raise ValueError(
                    f"Algorithm name '{forbidden}' leaked into task_outline. "
                    "Reframe without naming the algorithm — describe intent, not implementation."
                )


# --------------------------------------------------------------------------- #
# 2. Challenge — DB-ready output
# --------------------------------------------------------------------------- #

_SCENARIO_FIELDS = frozenset({
    "team_role", "module", "algorithm", "difficulty",
    "title", "story", "task_outline", "plaintext",
    "key_material", "extra", "expected_flag", "hints",
})


def _spec_kwargs(d: dict) -> dict:
    """Filter a (possibly theme-enriched) seed dict down to the fields
    ScenarioSpec accepts. Theme-pool keys (title_pool, story_pool,
    plaintext_pool, theme, etc.) are consumed by randomize_template and
    must not leak into the builder."""
    return {k: v for k, v in d.items() if k in _SCENARIO_FIELDS}

@dataclass
class Challenge:
    team_role: str
    module: str
    title: str
    story: str
    task_outline: str
    files: dict                                   # filename -> base64
    file_metadata: dict
    command_outputs: dict                         # command_key -> {"stdout": ..., "stderr": ..., "exit_code": ...}
    hints: list
    tools_whitelist: list
    flag_hash: str                                # sha256 of flag value
    flag_preview: str                             # the actual flag (CyberArena{...})
    difficulty: str
    xp_reward: int
    created_at: str = ""

    def to_db_row(self) -> dict:
        return {
            "team_role": self.team_role,
            "module": self.module,
            "title": self.title,
            "story": self.story,
            "task_outline": self.task_outline,
            "files": self.files,
            "file_metadata": self.file_metadata,
            "command_outputs": self.command_outputs,
            "hints": self.hints,
            "tools_whitelist": self.tools_whitelist,
            "flag_hash": self.flag_hash,
            "flag_preview": self.flag_preview,
            "difficulty": self.difficulty,
            "xp_reward": self.xp_reward,
        }


# --------------------------------------------------------------------------- #
# 3. CryptoExecutor — runs the algorithm
# --------------------------------------------------------------------------- #

class CryptoExecutor:
    """Pure-Python crypto executors. No `openssl` shell-out required.

    Each method returns (output_bytes, metadata). The metadata is what the
    sandbox needs to render the in-browser terminal output.
    """

    # ----------------- Symmetric ----------------- #

    @staticmethod
    def aes_cbc(plaintext: str, password: str, salt: bytes = None) -> tuple[bytes, dict]:
        salt = salt or os.urandom(8)
        iv = os.urandom(16)
        kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt,
                          iterations=100_000, backend=default_backend())
        key = kdf.derive(password.encode())
        padder = sympad.PKCS7(128).padder()
        padded = padder.update(plaintext.encode()) + padder.finalize()
        cipher = Cipher(algorithms.AES(key), modes.CBC(iv), backend=default_backend())
        enc = cipher.encryptor()
        ct = enc.update(padded) + enc.finalize()
        blob = b"Salted__" + salt + ct                # OpenSSL -salt format
        return blob, {"salt_hex": salt.hex(),
                      "iv_hex": iv.hex(),
                      "key_hex": key.hex(),
                      "openssl_format": "Salted__"}

    @staticmethod
    def aes_gcm(plaintext: str, password: str) -> tuple[bytes, dict]:
        iv = os.urandom(12)
        kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=b"apex_gcm_salt",
                          iterations=100_000, backend=default_backend())
        key = kdf.derive(password.encode())
        cipher = Cipher(algorithms.AES(key), modes.GCM(iv), backend=default_backend())
        enc = cipher.encryptor()
        ct = enc.update(plaintext.encode()) + enc.finalize()
        blob = iv + ct + enc.tag                      # iv | ciphertext | tag
        return blob, {"iv_hex": iv.hex(),
                      "tag_hex": enc.tag.hex(),
                      "key_hex": key.hex()}

    # ----------------- Asymmetric ----------------- #

    @staticmethod
    def rsa_sign(plaintext: str, key_size: int = 1024) -> tuple[bytes, dict]:
        priv = rsa.generate_private_key(public_exponent=65537, key_size=key_size,
                                         backend=default_backend())
        pem = priv.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption())
        sig = priv.sign(
            plaintext.encode(),
            apad.PSS(mgf=apad.MGF1(hashes.SHA256()), salt_length=apad.PSS.MAX_LENGTH),
            hashes.SHA256())
        return sig, {"private_key_pem": pem.decode(),
                     "key_size": key_size,
                     "signature_b64": base64.b64encode(sig).decode()}

    # ----------------- Hash / HMAC ----------------- #

    @staticmethod
    def sha256(data: bytes) -> bytes:
        return hashlib.sha256(data).digest()

    @staticmethod
    def md5(data: bytes) -> bytes:
        return hashlib.md5(data).digest()

    @staticmethod
    def sha1_salt(data: bytes, salt: str) -> bytes:
        return hashlib.sha1((salt + data.decode(errors="ignore")).encode()).digest()

    @staticmethod
    def hmac_sha256(key: str, data: str) -> bytes:
        return hmac.new(key.encode(), data.encode(), hashlib.sha256).digest()

    # ----------------- Classical (Red team) ----------------- #

    @staticmethod
    def vigenere_encrypt(plaintext: str, key: str) -> str:
        out = []
        key = key.lower()
        ki = 0
        for ch in plaintext:
            if ch.isalpha():
                base = ord('A') if ch.isupper() else ord('a')
                k = ord(key[ki % len(key)]) - ord('a')
                out.append(chr((ord(ch) - base + k) % 26 + base))
                ki += 1
            else:
                out.append(ch)
        return "".join(out)

    @staticmethod
    def caesar_shift(plaintext: str, shift: int) -> str:
        out = []
        for ch in plaintext:
            if ch.isalpha():
                base = ord('A') if ch.isupper() else ord('a')
                out.append(chr((ord(ch) - base + shift) % 26 + base))
            else:
                out.append(ch)
        return "".join(out)

    @staticmethod
    def xor_bytes(plaintext: bytes, key_byte: int) -> bytes:
        return bytes(b ^ key_byte for b in plaintext)


# --------------------------------------------------------------------------- #
# 4. ChallengeBuilder — wires spec → executed challenge
# --------------------------------------------------------------------------- #

class ChallengeBuilder:
    def _pick_hints(self, spec, key_hint: str | None = None) -> list:
        """Pick the hint set for a challenge.

        - If the spec carries theme-specific Socratic hints, return those
          (purely guiding, no direct answer).
        - Otherwise fall back to [key_hint, *HINTS_BY_DIFFICULTY] (legacy).
        """
        if spec.hints:
            return list(spec.hints)
        if key_hint is not None:
            return [key_hint] + self.HINTS_BY_DIFFICULTY[spec.difficulty]
        return self.HINTS_BY_DIFFICULTY[spec.difficulty]
    """Takes a ScenarioSpec, runs the crypto, returns a Challenge ready for DB."""

    HINTS_BY_DIFFICULTY = {
        "مبتدئ": ["راجع أدوات سطر الأوامر المتوفرة في القائمة البيضاء",
                  "اقرأ التعليمات بعناية — الـ key معطى في القصة",
                  "الناتج النهائي يجب أن يكون بصيغة SHA-256 hex"],
        "متوسط": ["استخدم openssl بالأمر الصحيح من القصة",
                  "الـ IV والـ salt يُولّدان تلقائياً — ركّز على الـ password"],
        "قوي": ["راجع صيغة PSS في التواقيع الرقمية",
                  "تأكد من الـ padding: PKCS7 لـ CBC، tag 16-byte لـ GCM"],
    }

    def build(self, spec: ScenarioSpec) -> Challenge:
        spec.validate()
        algo = spec.algorithm.upper()

        # --- Dispatch by algorithm ---
        if algo == "AES-256-CBC":
            blob, meta = CryptoExecutor.aes_cbc(spec.plaintext, spec.key_material)
            return self._build_symmetric(
                spec, blob, meta,
                filename=spec.extra.get("filename", "data.txt"),
                cmd=f"openssl enc -d -aes-256-cbc -salt -pbkdf2 -in {spec.extra.get('filename', 'data.txt')} -pass pass:{spec.key_material}",
                final_hash=hashlib.sha256(blob).hexdigest(),
            )

        if algo == "AES-256-GCM":
            blob, meta = CryptoExecutor.aes_gcm(spec.plaintext, spec.key_material)
            return self._build_symmetric(
                spec, blob, meta,
                filename=spec.extra.get("filename", "data.txt"),
                cmd=f"openssl enc -d -aes-256-gcm -in {spec.extra.get('filename', 'data.txt')} -pass pass:{spec.key_material}",
                final_hash=hashlib.sha256(blob).hexdigest(),
            )

        if algo == "RSA-1024" or algo.startswith("RSA"):
            sig, meta = CryptoExecutor.rsa_sign(spec.plaintext, key_size=int(algo.split("-")[1]) if "-" in algo else 1024)
            return self._build_rsa(spec, sig, meta)

        if algo == "SHA-256":
            blob = spec.plaintext.encode()
            return self._build_hash(spec, blob, hashlib.sha256(blob).hexdigest(),
                                     cmd="sha256sum input.bin")

        if algo == "HMAC-SHA256":
            mac = CryptoExecutor.hmac_sha256(spec.key_material, spec.plaintext)
            return self._build_hash(spec, spec.plaintext.encode(), mac.hex(),
                                     cmd=f"openssl dgst -sha256 -hmac '{spec.key_material}' input.json")

        if algo == "MD5":
            # Red-team: student sees the MD5 hash in the file, cracks it to
            # recover the plaintext password, then submits CyberArena{sha256(pw)}.
            md5_hex = hashlib.md5(spec.plaintext.encode()).hexdigest()
            sha256_of_pw = hashlib.sha256(spec.plaintext.encode()).hexdigest()
            return self._build_hash(spec, md5_hex.encode(), sha256_of_pw,
                                     cmd="md5sum input.txt")

        if algo == "SHA-1+SALT":
            # Red-team: student sees the salted sha1 hash, cracks it to recover
            # the password, then submits CyberArena{sha256(pw)}.
            digest = CryptoExecutor.sha1_salt(spec.plaintext.encode(), spec.key_material)
            sha256_of_pw = hashlib.sha256(spec.plaintext.encode()).hexdigest()
            return self._build_hash(spec, digest.hex().encode(), sha256_of_pw,
                                     cmd="cat /etc/shadow",  # red-team context
                                     extra_files={"/etc/shadow": f"root:$dynamic_$1${spec.key_material}${digest.hex()}:19000:0:99999:7:::"})

        # --- Red team classical ciphers (student decrypts) ---
        if algo == "VIGENERE":
            cipher = CryptoExecutor.vigenere_encrypt(spec.plaintext, spec.key_material)
            return self._build_classical_red(spec, cipher, spec.plaintext, "VIGENERE",
                                              key=spec.key_material,
                                              key_hint=f"الطول: {len(spec.key_material)} حرف")

        if algo == "CAESAR":
            shift = int(spec.extra.get("shift", 3))
            cipher = CryptoExecutor.caesar_shift(spec.plaintext, shift)
            return self._build_classical_red(spec, cipher, spec.plaintext, "CAESAR",
                                              key=shift,
                                              key_hint="إزاحة أحادية — جرّب 1..25")

        if algo == "XOR":
            key_byte = int(spec.extra.get("key_byte", 0x42))
            pt = spec.plaintext.encode()
            cipher = CryptoExecutor.xor_bytes(pt, key_byte)
            return self._build_classical_red(spec, cipher.hex(), pt.decode(errors="ignore"),
                                              "XOR", key=key_byte,
                                              key_hint="single-byte XOR — 256 احتمال")

        raise ValueError(f"Unsupported algorithm: {algo}")

    # ----------------------- private builders ----------------------- #

    def _build_symmetric(self, spec, blob, meta, filename, cmd, final_hash):
        """Build a symmetric encryption challenge (RED TEAM ONLY).

        The file always holds the ENCRYPTED blob. The student must decrypt
        it (e.g. `openssl enc -d -aes-256-cbc -salt -pbkdf2 -in <file> -pass
        pass:<password>`), recover the plaintext, and submit
        `CyberArena{sha256(plaintext)}`.
        """
        cat_stdout = base64.b64encode(blob).decode()
        if len(cat_stdout) > 240:
            cat_stdout = cat_stdout[:240] + "..."
        flag_inner = hashlib.sha256(spec.plaintext.encode()).hexdigest()
        flag_value = f"CyberArena{{{flag_inner}}}"
        files = {filename: base64.b64encode(blob).decode()}
        return Challenge(
            team_role=spec.team_role, module=spec.module, title=spec.title,
            story=spec.story, task_outline=spec.task_outline,
            files=files, file_metadata={filename: {"encoding": "utf-8", "size": len(blob)}},
            command_outputs={
                f"cat:{filename}": {"stdout": cat_stdout, "stderr": "", "exit_code": 0},
                "openssl:enc":    {"stdout": blob.hex()[:80] + "..." if len(blob.hex()) > 80 else blob.hex(),
                                   "stderr": "", "exit_code": 0},
                "sha256sum":      {"stdout": f"{flag_inner}  recovered_plaintext.txt", "stderr": "", "exit_code": 0},
                "ls":             {"stdout": filename, "stderr": "", "exit_code": 0},
            },
            hints=self._pick_hints(spec),
            tools_whitelist=["cat", "ls", "echo", "python", "openssl", "sha256sum", "base64"],
            flag_hash=hashlib.sha256(flag_value.encode()).hexdigest(),
            flag_preview=flag_value,
            difficulty=spec.difficulty,
            xp_reward=XP_BY_DIFFICULTY[spec.difficulty],
        )

    def _build_rsa(self, spec, sig, meta):
        flag_value = f"CyberArena{{{base64.b64encode(sig).decode().rstrip('=')[:64]}}}"
        files = {
            spec.extra.get("filename", "contract.txt"):
                base64.b64encode(spec.plaintext.encode()).decode(),
            "private_key.pem": base64.b64encode(meta["private_key_pem"].encode()).decode(),
        }
        return Challenge(
            team_role=spec.team_role, module=spec.module, title=spec.title,
            story=spec.story, task_outline=spec.task_outline,
            files=files,
            file_metadata={k: {"encoding": "utf-8"} for k in files},
            command_outputs={
                f"cat:{spec.extra.get('filename', 'contract.txt')}": {"stdout": spec.plaintext, "stderr": "", "exit_code": 0},
                "openssl:sign":  {"stdout": meta["signature_b64"][:80] + "...",
                                  "stderr": "", "exit_code": 0},
                "ls":             {"stdout": "\n".join(files.keys()), "stderr": "", "exit_code": 0},
            },
            hints=self._pick_hints(spec),
            tools_whitelist=DEFAULT_TOOLS,
            flag_hash=hashlib.sha256(flag_value.encode()).hexdigest(),
            flag_preview=flag_value,
            difficulty=spec.difficulty,
            xp_reward=XP_BY_DIFFICULTY[spec.difficulty],
        )

    def _build_hash(self, spec, blob, hex_digest, cmd, extra_files=None):
        flag_value = f"CyberArena{{{hex_digest}}}"
        files = {"input.bin" if "input" not in spec.extra else spec.extra["input"]:
                    base64.b64encode(blob).decode()}
        if extra_files:
            files.update(extra_files)
        return Challenge(
            team_role=spec.team_role, module=spec.module, title=spec.title,
            story=spec.story, task_outline=spec.task_outline,
            files=files, file_metadata={k: {"encoding": "utf-8"} for k in files},
            command_outputs={
                cmd.split()[0]: {"stdout": f"{hex_digest}  input", "stderr": "", "exit_code": 0},
                "ls":             {"stdout": "\n".join(files.keys()), "stderr": "", "exit_code": 0},
            },
            hints=self._pick_hints(spec),
            tools_whitelist=DEFAULT_TOOLS,
            flag_hash=hashlib.sha256(flag_value.encode()).hexdigest(),
            flag_preview=flag_value,
            difficulty=spec.difficulty,
            xp_reward=XP_BY_DIFFICULTY[spec.difficulty],
        )

    def _build_classical_red(self, spec, cipher_display, plaintext, family, key_hint, key=None):
        """Red team: student decrypts → finds plaintext → flag is sha256(plaintext).

        `key` is accepted for caller convenience (used by VIGENERE/CAESAR/XOR
        builders to record the actual key material); it's stored in the
        challenge spec but doesn't need to appear in the public payload.

        The simulator file name comes from `spec.extra["filename"]` (set by
        seeds via `file_convention` or by the AI). When the name in the
        story doesn't match, the story is rewritten so they stay in sync.
        """
        inner = hashlib.sha256(plaintext.encode()).hexdigest()
        flag_value = f"CyberArena{{{inner}}}"
        filename = spec.extra.get("filename") or "cipher.txt"
        spec.story = _align_filename_in_story(spec.story, filename)
        spec.task_outline = _align_filename_in_story(spec.task_outline, filename)
        files = {filename: base64.b64encode(cipher_display.encode()).decode()}
        return Challenge(
            team_role=spec.team_role, module=spec.module, title=spec.title,
            story=spec.story, task_outline=spec.task_outline,
            files=files, file_metadata={filename: {"encoding": "utf-8"}},
            command_outputs={
                f"cat:{filename}": {"stdout": cipher_display if len(cipher_display) < 200
                                    else cipher_display[:200] + "...", "stderr": "", "exit_code": 0},
                "ls":              {"stdout": filename, "stderr": "", "exit_code": 0},
            },
            hints=self._pick_hints(spec, key_hint=key_hint),
            tools_whitelist=["cat", "ls", "echo", "python", "openssl", "sha256sum", "base64"],
            flag_hash=hashlib.sha256(flag_value.encode()).hexdigest(),
            flag_preview=flag_value,
            difficulty=spec.difficulty,
            xp_reward=XP_BY_DIFFICULTY[spec.difficulty],
        )


# --------------------------------------------------------------------------- #
# 5. AI integration (Groq) — produces a ScenarioSpec
# --------------------------------------------------------------------------- #

CRYPTO_SCENARIO_PROMPT = """أنت مصمم تحديات أمن سيبراني محترف. كل تحدي يجب أن يكون سيناريو فريد وواقعي يبدو وكأنه من عملية اختراق حقيقية.

المطلوب: ولّد SPEC لتحدي تشفير للفريق {team_role} في موديول {module}.

قواعد حاسمة:
- الخوارزمية محددة لك مسبقاً ({algorithm}) — لا تخترع خوارزمية أخرى. اكتب سيناريو يناسبها.
- لا تذكر اسم الخوارزمية (AES/RSA/Vigenere/Caesar/MD5/SHA/HMAC/XOR) داخل story أو task.
- الـ title: عنوان عربي محدد وجذاب — ليس عاماً. كل تحدي يجب أن يكون قصة مختلفة جذرياً عن أي تحدي آخر.
- الـ story: سيناريو واقعي من 2-3 جمل يربط الـ title بسياق حقيقي.
- الـ task_outline: ماذا يجب على الطالب فعله، بدون ذكر الأوامر بالأحرف.
- للفريق blue: سيناريو تطبيق تشفير/توقيع على ملف موجود.
- للفريق red: سيناريو كسر/فك تشفير/استخراج plaintext من مشفّر.
- الـ plaintext: محتوى ملف input قصير وواقعي (CSV, JSON, config, log, password, payload...). اكتبه بالعربية أو بالإنجليزية حسب القصة، واجعله قصيراً (سطرين إلى خمسة أسطر).
- الـ key_material (اختياري): إذا خطر ببالك key أو password مناسب للقصة، ضعه هنا. لا تذكره داخل الـ story. إذا لم يخطر لك، اتركه فاضياً وسيتم توليده تلقائياً.
- الصعوبة: {difficulty}
- اسم الملف الذي يحتوي المحتوى (مثال: intercept.txt، leak.bin، firmware.bin، contract.txt، payload.json): ضعه في `extra.filename` واستعمل نفس الاسم داخل story و task_outline بالضبط.
- الـ hints: 3 تلميحات سقراطية غير مباشرة — توجّه الطالب للتفكير بدون إعطاء الجواب.

أمثلة على عناوين مميزة (استلهم منها، لا تنسخها حرفياً):
- "اعتراض بث مشفر من ضابط ألماني في الـ Afrika Korps"
- "تسريب رسالة بين CFO و broker في تحقيق SEC"
- "تحليل memory dump من راوتر Cisco مخترق"
- "كسر enable password من Cisco IOS"
- "اكتشاف payload مشفر في dropper من عيلة Chaos"
- "برقية من SOE agent في فرنسا المحتلة"
- "فك نقش هيروغليفي على جدار مقبرة فرعونية"
- "خريطة كنز من قرصان الكاريبي في القرن الثامن عشر"

أعد JSON حصراً بهذا الشكل (بدون أي نص خارجه):
{{
  "title": "عنوان عربي محدد وجذاب",
  "story": "قصة واقعية 2-3 جمل بدون أسماء خوارزميات",
  "task_outline": "مطلوب الطالب بدقة بدون أوامر",
  "plaintext": "محتوى الملف input (سطرين إلى خمسة أسطر)",
  "key_material": "password أو key أو salt (اختياري — فاضي مقبول)",
  "hints": ["تلميح 1 غير مباشر", "تلميح 2 غير مباشر", "تلميح 3 غير مباشر"],
  "extra": {{
    "filename": "اسم_الملف.لاحقة"
  }}
}}"""


async def ai_generate_scenario_via_cloudflare(
    team_role: str, module: str, difficulty: str,
    api_token: str, account_id: str, model: str = CLOUDFLARE_MODEL,
    algorithm: str | None = None,
) -> ScenarioSpec:
    """Primary AI: Cloudflare Workers AI (minimax-m3).

    Uses the Cloudflare REST API. The model is pre-selected by the system
    (see _pick_algorithm_for_slot) — the AI only writes flavor text.
    """
    if not api_token or not account_id:
        raise ValueError("CLOUDFLARE_API_TOKEN or CLOUDFLARE_ACCOUNT_ID not set")
    url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/{model}"
    prompt = CRYPTO_SCENARIO_PROMPT.format(
        team_role=team_role, module=module, difficulty=difficulty,
        algorithm=algorithm or "any",
    )
    payload = {
        "messages": [
            {"role": "system", "content": "You output valid JSON only. No prose, no markdown fences."},
            {"role": "user", "content": prompt},
        ],
        "max_tokens": 3000,
        "temperature": 0.7,
    }
    headers = {
        "Authorization": f"Bearer {api_token}",
        "Content-Type": "application/json",
    }

    def _call() -> str:
        with httpx.Client(timeout=60) as client:
            r = client.post(url, headers=headers, json=payload)
        if r.status_code == 429:
            raise RuntimeError(f"Cloudflare 429: {r.text[:200]}")
        if r.status_code >= 400:
            raise RuntimeError(f"Cloudflare HTTP {r.status_code}: {r.text[:200]}")
        data = r.json()
        # Cloudflare returns {"success": true, "result": {"response": "..."}}
        if not data.get("success"):
            errors = data.get("errors", [])
            raise RuntimeError(f"Cloudflare error: {errors}")
        result = data.get("result", {}) or {}
        return (result.get("response") or "").strip()

    content = await asyncio.to_thread(_call)

    if content.startswith("```"):
        content = content.split("```", 2)[1]
        if content.startswith("json"):
            content = content[4:]
        content = content.strip().rstrip("`")

    try:
        data = _repair_json(content)
    except (ValueError, json.JSONDecodeError) as e:
        raise _ResponseTruncated(f"Could not repair JSON: {e}") from e

    extra = data.get("extra", {}) or {}
    if "filename" not in extra or not extra["filename"]:
        m = _FILENAME_RE.findall(data.get("story", "") or "")
        if m:
            extra["filename"] = m[0]
    if extra.get("filename"):
        data["story"] = _align_filename_in_story(data.get("story", ""), extra["filename"])
        data["task_outline"] = _align_filename_in_story(data.get("task_outline", ""), extra["filename"])

    final_algo = _normalize_algo(algorithm or data.get("algorithm", ""))
    ai_key = (data.get("key_material") or "").strip()
    if ai_key:
        key_material, extra = ai_key, extra
    else:
        key_material, extra = _generate_key_for_algo(final_algo, extra)

    hints_raw = data.get("hints") or []
    if isinstance(hints_raw, list):
        hints = [str(h).strip() for h in hints_raw if str(h).strip()]
    else:
        hints = []

    return ScenarioSpec(
        team_role=team_role, module=module, difficulty=difficulty,
        algorithm=final_algo, plaintext=data["plaintext"],
        key_material=key_material,
        title=data["title"], story=data["story"], task_outline=data["task_outline"],
        extra=extra, hints=hints,
    )


async def ai_generate_scenario(team_role: str, module: str, difficulty: str,
                                groq_api_key: str, model: str | None = None,
                                algorithm: str | None = None) -> ScenarioSpec:
    """Call Groq to produce a scenario. Validates and returns a ScenarioSpec.

    Uses the official `groq` Python SDK (sync). The SDK call is wrapped in
    `asyncio.to_thread` so the existing async call sites in `refill_pool`
    keep working without blocking the event loop.

    The `algorithm` is now pre-selected by the system (see _pick_algorithm_for_slot).
    The AI is asked to write a story that fits it, but the algorithm itself
    is fixed — the AI only generates flavor (title, story, task, hints, plaintext)
    plus an optional key_material suggestion.
    """
    if model is None:
        model = GROQ_MODEL  # env var or default to llama-3.1-8b-instant
    from groq import Groq
    prompt = CRYPTO_SCENARIO_PROMPT.format(
        team_role=team_role, module=module, difficulty=difficulty,
        algorithm=algorithm or "any",
    )

    def _call_groq() -> str:
        client = Groq(api_key=groq_api_key)
        completion = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": "You output valid JSON only. No prose, no markdown fences."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.7,
            max_completion_tokens=3000,
            top_p=1,
            stream=False,
            stop=None,
        )
        msg = completion.choices[0].message
        content = (msg.content or "").strip()
        finish = completion.choices[0].finish_reason
        # If the model hit the token cap, the JSON is likely truncated
        # mid-string — treat as a transient error so the caller falls
        # through to DeepSeek/seed.
        if finish == "length":
            raise _ResponseTruncated("Groq response hit max_completion_tokens")
        return content

    content = await asyncio.to_thread(_call_groq)

    # Strip optional code fences
    if content.startswith("```"):
        content = content.split("```", 2)[1]
        if content.startswith("json"):
            content = content[4:]
        content = content.strip().rstrip("`")

    try:
        data = _repair_json(content)
    except (ValueError, json.JSONDecodeError) as e:
        # The Groq SDK sometimes returns finish_reason="stop" with a
        # body that is actually truncated (connection was closed
        # mid-stream). Treat any JSON-parse failure as a transient
        # truncation so the caller falls through to DeepSeek/seed.
        raise _ResponseTruncated(f"Could not repair JSON: {e}") from e
    extra = data.get("extra", {}) or {}
    if "filename" not in extra or not extra["filename"]:
        m = _FILENAME_RE.findall(data.get("story", "") or "")
        if m:
            extra["filename"] = m[0]
    if extra.get("filename"):
        data["story"] = _align_filename_in_story(data.get("story", ""), extra["filename"])
        data["task_outline"] = _align_filename_in_story(data.get("task_outline", ""), extra["filename"])

    # The system pre-selects the algorithm — always use it, never the AI's pick.
    final_algo = _normalize_algo(algorithm or data.get("algorithm", ""))
    ai_key = (data.get("key_material") or "").strip()

    # If the AI didn't suggest a key, auto-generate one that fits the algorithm.
    if ai_key:
        key_material, extra = ai_key, extra
    else:
        key_material, extra = _generate_key_for_algo(final_algo, extra)

    hints_raw = data.get("hints") or []
    if isinstance(hints_raw, list):
        hints = [str(h).strip() for h in hints_raw if str(h).strip()]
    else:
        hints = []

    return ScenarioSpec(
        team_role=team_role, module=module, difficulty=difficulty,
        algorithm=final_algo, plaintext=data["plaintext"],
        key_material=key_material,
        title=data["title"], story=data["story"], task_outline=data["task_outline"],
        extra=extra, hints=hints,
    )


# Transient errors from Groq that should trigger a Gemini fallback
# (NOT 429 — that's a hard rate-limit and we should back off, not retry
# against a second provider that may share the same backend limit).
_GROQ_TRANSIENT_EXCEPTIONS = (httpx.TimeoutException, httpx.ReadTimeout,
                              httpx.ConnectError, httpx.RemoteProtocolError)


class _ResponseTruncated(Exception):
    """Raised when the Groq model returns a finish_reason=length response
    (i.e. the JSON was cut off mid-string). Treated as transient."""
    pass


async def ai_generate_scenario_via_deepseek(team_role: str, module: str, difficulty: str,
                                            nvidia_api_key: str,
                                            model: str | None = None,
                                            algorithm: str | None = None) -> ScenarioSpec:
    """Fallback AI: call NVIDIA integrate (DeepSeek v4-pro) when Groq is unreachable.

    OpenAI-compatible chat-completions endpoint. Returns a ScenarioSpec the
    same way ai_generate_scenario does. Raises on transport errors so the
    caller can decide what to do next (e.g. fall back to a curated seed).

    The `algorithm` is pre-selected by the system (see _pick_algorithm_for_slot).
    """
    if not nvidia_api_key:
        raise RuntimeError("NVIDIA_API_KEY not configured")
    model = model or NVIDIA_MODEL
    prompt = CRYPTO_SCENARIO_PROMPT.format(
        team_role=team_role, module=module, difficulty=difficulty,
        algorithm=algorithm or "any",
    )
    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": "You output valid JSON only. No prose, no markdown fences."},
            {"role": "user", "content": prompt},
        ],
        "temperature": 1.0,
        "top_p": 0.95,
        "max_tokens": 16384,
        "extra_body": {"chat_template_kwargs": {"thinking": False}},
        "stream": False,
    }
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(
            NVIDIA_URL,
            headers={"Authorization": f"Bearer {nvidia_api_key}", "Content-Type": "application/json"},
            json=body,
        )
        r.raise_for_status()
        content = r.json()["choices"][0]["message"]["content"].strip()

    if content.startswith("```"):
        content = content.split("```", 2)[1]
        if content.startswith("json"):
            content = content[4:]
        content = content.strip().rstrip("`")

    data = _repair_json(content)
    extra = data.get("extra", {}) or {}
    if "filename" not in extra or not extra["filename"]:
        m = _FILENAME_RE.findall(data.get("story", "") or "")
        if m:
            extra["filename"] = m[0]
    if extra.get("filename"):
        data["story"] = _align_filename_in_story(data.get("story", ""), extra["filename"])
        data["task_outline"] = _align_filename_in_story(data.get("task_outline", ""), extra["filename"])

    # The system pre-selects the algorithm — always use it, never the AI's pick.
    final_algo = _normalize_algo(algorithm or data.get("algorithm", ""))
    ai_key = (data.get("key_material") or "").strip()

    # If the AI didn't suggest a key, auto-generate one that fits the algorithm.
    if ai_key:
        key_material, extra = ai_key, extra
    else:
        key_material, extra = _generate_key_for_algo(final_algo, extra)

    hints_raw = data.get("hints") or []
    if isinstance(hints_raw, list):
        hints = [str(h).strip() for h in hints_raw if str(h).strip()]
    else:
        hints = []

    return ScenarioSpec(
        team_role=team_role, module=module, difficulty=difficulty,
        algorithm=final_algo, plaintext=data["plaintext"],
        key_material=key_material,
        title=data["title"], story=data["story"], task_outline=data["task_outline"],
        extra=extra, hints=hints,
    )


# --------------------------------------------------------------------------- #
# 6. DB insert
# --------------------------------------------------------------------------- #

def insert_to_db(challenge: Challenge, supabase_url: str = SUPABASE_URL,
                  supabase_key: str = SUPABASE_ANON_KEY) -> bool:
    """Insert one Challenge into public.encryption_challenges.

    Retries up to 3 times on transient network errors (WinError 10054,
    timeout, connection reset) with exponential backoff.
    """
    if not supabase_key:
        print("ERROR: SUPABASE_ANON_KEY not set", file=sys.stderr)
        return False
    url = f"{supabase_url}/rest/v1/encryption_challenges"
    headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }
    payload = challenge.to_db_row()
    last_err: str = ""
    for attempt in range(1, 4):
        try:
            with httpx.Client(timeout=30) as client:
                r = client.post(url, headers=headers, json=payload)
            if r.status_code in (200, 201, 204):
                print(f"✓ Inserted: {challenge.title[:50]}")
                return True
            # Non-retryable HTTP error (4xx). Don't waste time retrying.
            print(f"✗ Insert failed [{r.status_code}]: {r.text[:200]}")
            return False
        except (httpx.TimeoutException, httpx.ReadTimeout,
                httpx.ConnectError, httpx.RemoteProtocolError,
                httpx.NetworkError, ConnectionError) as e:
            last_err = f"{type(e).__name__}: {e}"
            if attempt < 3:
                backoff = 0.5 * (2 ** (attempt - 1))
                print(f"[insert_to_db] transient error (attempt {attempt}/3): {last_err} — retry in {backoff:.1f}s")
                time.sleep(backoff)
                continue
    print(f"✗ Insert failed after 3 attempts: {last_err}")
    return False


# --------------------------------------------------------------------------- #
# 7. Pre-baked scenario library (5 Blue + 5 Red, hand-curated, all passing
#    the build+insert path through this same module)
# --------------------------------------------------------------------------- #

BLUE_SEEDS = [
    dict(
        module="encryption-basics", difficulty="مبتدئ",
        algorithm="AES-256-CBC",
        title="تشفير بيانات العملاء في حالة السكون",
        story="تدير شركة Apex قسم payments يخزن بيانات بطاقات ائتمان العملاء في CSV. طلب منك مدير الأمن تشفير الملف قبل نقله إلى S3 bucket. الـ password المعطى من قبل المدير مكتوب في الـ task.",
        task_outline="استخدم الأمر المتوفر في القائمة البيضاء لتشفير customer_data.csv بكلمة مرور معطاة. ثم احسب hash للمخرجات.",
        plaintext="CustomerID,Name,CardNumber,Expiry,CVV\n1001,Ahmed Ali,4532-1234-5678-9010,12/27,123\n1002,Sara Khan,5500-9876-5432-1098,03/26,456\n1003,Omar Yusuf,4716-1111-2222-3333,08/28,789",
        key_material="ApexSecure2026",
        extra={"filename": "customer_data.csv"},
    ),
    dict(
        module="encryption-basics", difficulty="متوسط",
        algorithm="AES-256-GCM",
        title="تشفير سجل طبي بـ authenticated encryption",
        story="السجل الطبي للمريضة Fatima Hassan يجب إرساله إلى مستشفى آخر عبر قناة غير آمنة. الـ key تتولد من كلمة مرور ثابتة.",
        task_outline="شفّر patient_record.txt بخوارزمية authenticated. كلمة المرور مذكورة في الـ task.",
        plaintext="Patient: Fatima Hassan\nDOB: 1985-03-12\nDiagnosis: T2DM, Hypertension\nMedications: Metformin 500mg BID, Lisinopril 10mg QD\nNotes: A1C trending down, follow-up in 3 months",
        key_material="MedGCM_2026",
        extra={"filename": "patient_record.txt"},
    ),
    dict(
        module="rsa-aes", difficulty="قوي",
        algorithm="RSA-1024",
        title="توقيع عقد رقمي",
        story="محامي الشركة يحتاج توقيع رقمي على contract.txt باستخدام المفتاح الخاص المرفق. التوقيع يجب أن يكون حقيقياً وقابلاً للتحقق.",
        task_outline="وقّع contract.txt باستخدام private_key.pem. الـ flag هو hash 256-bit للتوقيع base64.",
        plaintext="SERVICE AGREEMENT\n\nThis agreement is entered into on 2026-04-15\nbetween Apex Corp (Provider) and ZenTech GmbH (Client).\n\nScope: Security audit of ZenTech infrastructure\nDuration: 90 days\nFee: $250,000 USD\n\nSigned: ____________________",
        key_material="",
        extra={"filename": "contract.txt"},
    ),
    dict(
        module="hash-cracking", difficulty="مبتدئ",
        algorithm="SHA-256",
        title="حساب SHA-256 لـ firmware قبل التوزيع",
        story="فريق QA رفع firmware.bin للحجم 256 بايت. قبل توزيعه، يجب حساب hash كامل.",
        task_outline="احسب hash كامل (256-bit) للملف. الـ flag هو الـ hash نفسه.",
        plaintext="",
        key_material="",
        extra={"input": "firmware.bin"},
    ),
    dict(
        module="hash-cracking", difficulty="متوسط",
        algorithm="HMAC-SHA256",
        title="توقيع Webhook",
        story="خدمة الدفعات ترسل webhook مع توقيع integrity في الـ header. الـ secret مشترك.",
        task_outline="احسب توقيع integrity لـ payload.json بالـ key: Zapier_Webhook_2026_Secret.",
        plaintext='{"event":"payment.completed","amount":2500.00,"currency":"USD","timestamp":"2026-04-15T14:30:00Z","txn_id":"tx_abc123"}',
        key_material="Zapier_Webhook_2026_Secret",
        extra={"input": "payload.json"},
    ),
]


RED_SEEDS = [
    # ===== VIGENERE — 3 radically different archetypes =====
    dict(
        module="encryption-basics", difficulty="مبتدئ",
        algorithm="VIGENERE",
        theme="ww2_spy_radio",
        title_pool=[
            "فك رسالة لاسلكية من عميل مزدوج في الـ Abwehr",
            "اعتراض بث مشفر من ضابط ألماني في الـ Afrika Korps",
            "برقية من SOE agent في فرنسا المحتلة",
        ],
        story_pool=[
            "في 1943 اعترضت غرفة عمليات الحلفاء رسالة لاسلكية من عميل مزدوج في الـ Abwehr. البث استعمل مفتاح قصير مكرر (4 أحرف). الملف intercept.txt يحوي النص الخام بأحرف لاتينية كبيرة.",
            "خلال عملية استخباراتية في الـ SOE (Special Operations Executive)، عثر فريقنا على مفكرة لضابط اتصال ألماني. كانت الرسائل تُرسل بمفتاح قصير قابل للتكرار. الملف radio_msg.txt يحوي أحد البثوث.",
            "في أرشيفات الحكومة البريطانية، عُثر على تسجيلات Morse من WWII. تفريغ أحد البثوث يظهر كنص بأحرف لاتينية كبيرة. الملف intercepted_msg.txt يحوي الرسالة.",
        ],
        task_outline_pool=[
            "الملف يحوي رسالة مشفرة بـ cipher كلاسيكي. حدد طول الـ key بالأسلوب التراثي، ثم فك التشفير. الـ flag هو sha256 للنص الأصلي.",
        ],
        plaintext_pool=[
            "MEET ME AT THE BRIDGE AT MIDNIGHT BRING THE DOCUMENTS",
            "THE PACKAGE WILL ARRIVE BY FERRY ON TUESDAY AT DAWN",
            "OPERATION NIGHTFALL IS A GO PROCEED TO SAFEHOUSE B",
            "TARGET COORDINATES ARE FORTY SEVEN NORTH TWELVE EAST",
            "ABORT THE MISSION THE ENEMY KNOWS ABOUT OUR PLAN",
        ],
        key_pool=["RADIO", "ENIGMA", "BLITZ", "LONDON", "AXIS", "LORE", "KILO"],
        file_convention="intercept.txt",
        hints=[
            "كل رسائل اللاسلكي بالحرب العالمية كانت بأحرف لاتينية كبيرة بدون علامات ترقيم. المسافات هنا تسهيل قراءة فقط.",
            "ابحث عن ثلاثيات أحرف متكررة (مثل THE أو ING). المسافة بين تكرار كل ثلاثية تعطيك مضاعفات طول الـ key.",
            "عندما تعرف طول الـ key، حلل كل عمود (col[0], col[k], col[2k]...) باستقلال. كل عمود Caesar cipher — الـshift يكشف الكلمة.",
        ],
    ),
    dict(
        module="encryption-basics", difficulty="متوسط",
        algorithm="VIGENERE",
        theme="corporate_insider_trade",
        title_pool=[
            "اعتراض رسالة مشفرة من insider trader في وول ستريت",
            "تسريب رسالة بين CFO و broker في تحقيق SEC",
            "كسر cipher من رسالة tips في hedge fund",
        ],
        story_pool=[
            "في تحقيق SEC، صودر laptop من CFO في شركة Fortune 500. عثر المحققون على ملف leak.bin يحوي رسالة مشفرة بخوارزمية قديمة. المحتوى يبدو يحوي توصيات stock. الـ key (5 أحرف) هو اسم الـ project السري المذكور في الـ task.",
            "كجزء من تحقيق in insider trading، اعترضت NSA رسالة بين trader في نيويورك و broker في سويسرا. الـ key قصير. الملف insider_msg.txt يحوي النص.",
        ],
        task_outline_pool=[
            "الملف يحوي رسالة مشفرة. فك الـ cipher بالأداة الصحيحة. الـ flag هو sha256 للنص الأصلي.",
        ],
        plaintext_pool=[
            "BUY TEN THOUSAND SHARES OF APEX BEFORE THE EARNINGS CALL",
            "SELL ALL POSITIONS IN CRYPTO BY END OF WEEK REGULATORS ARE WATCHING",
            "TRANSFER FUNDS TO SWISS ACCOUNT FOUR SEVEN EIGHT NINE BY FRIDAY",
            "PROJECT OMEGA IS CANCELLED INFORM THE BOARD IMMEDIATELY",
            "MERGER ANNOUNCEMENT POSTPONED UNTIL NEXT QUARTER",
        ],
        key_pool=["APEXS", "FORTE", "TRUST", "OMEGA", "NEXUS", "MONEY", "STOCK"],
        file_convention="leak.bin",
        hints=[
            "نص مالي فيه كلمات مثل BUY، SELL، TRANSFER، SHARES. هذه كلمات انجليزية مألوفة للـ frequency analysis.",
            "الـ key طوله 5. ابدأ بهذا الافتراض قبل تجربة أطوال أخرى.",
            "كاختصار: حساب IC (Index of Coincidence) للنص. إذا ≈ 0.065 فالـkey طوله 1 (Caesar). أقل من ذلك يعني Vigenere.",
        ],
    ),
    dict(
        module="encryption-basics", difficulty="قوي",
        algorithm="VIGENERE",
        theme="ancient_pharaonic_scroll",
        title_pool=[
            "فك نقش هيروغليفي على جدار مقبرة فرعونية",
            "ترجمة رسالة من مقبرة توت عنخ آمون",
            "كسر cipher من بردية فرعونية قديمة",
        ],
        story_pool=[
            "في اكتشاف أثري جديد في الأقصر، عثر علماء المصريات على جدار مقبرة فرعونية يحوي نقشاً بأبجدية لاتينية. اللغويون يشتبهون بوجود رسالة مخفية بـ cipher قديم. الملف hieroglyph.txt يحوي الـ transcription.",
            "كجزء من تعاون مع متحف تورينو، عُثر على بردية من عصر الرعامسة. الرسالة تبدو مع نص واضح لكن مع إزاحة منتظمة. الـ key قصير (3-4 أحرف).",
        ],
        task_outline_pool=[
            "الملف يحوي نقشاً من مقبرة فرعونية بأحرف لاتينية. فك الـ cipher بأسلوب تراثي. الـ flag هو sha256 للنص الأصلي.",
        ],
        plaintext_pool=[
            "OPEN THE BURIAL CHAMBER BEFORE THE NEXT MOON CYCLE",
            "THE CURSE WILL FALL UPON ANY WHO DISTURB THIS RESTING PLACE",
            "BEYOND THIS DOOR LIES THE TREASURE OF THE PHARAOH",
            "GUARD THIS SEAL UNTIL THE GODS RETURN",
        ],
        key_pool=["ANUB", "RAXX", "ISIS", "HORUS", "OSIRIS", "AMUN"],
        file_convention="hieroglyph.txt",
        hints=[
            "نصوص قديمة فيها كلمات مألوفة (مثل THE، OF، THE، WILL). هذا يسهّل التحليل الإحصائي.",
            "الـ key هنا مرتبط بالإله المصري. ابدأ بأسماء آلهة معروفة.",
            "Kasiski works: ابحث عن ثلاثيات متكررة. النقوش الطويلة فيها تكرار أكثر من النصوص القصيرة.",
        ],
    ),
    # ===== CAESAR — 2 archetypes =====
    dict(
        module="encryption-basics", difficulty="مبتدئ",
        algorithm="CAESAR",
        theme="roman_legion_dispatch",
        title_pool=[
            "برقية جحش روماني من حدود الأمبراطورية",
            "فك رسالة من Legio X Fretensis",
            "اعتراض أمر تكتيكي من قنصل روماني",
        ],
        story_pool=[
            "في 117 م، اعترضت دورية رومانية رسالة من جنرال متمرد في الأمبراطورية. الحروف تبدو منزاحة بشكل منهجي. الملف scroll.txt يحوي الرسالة الأصلية. الـ shift واحد من 2-25.",
            "اكتشف علماء الآثار لفافة بردي من بومبي (79 م). النص يبدو صحيح نحوياً لكن الحروف غير مرتبة. الإزاحة بسيطة.",
        ],
        task_outline_pool=[
            "الملف يحوي نص روماني قديم منزاح بعدد ثابت من الأحرف. جرب كل الـ shifts من 1 إلى 25. الـ flag هو sha256 للنص الأصلي.",
        ],
        plaintext_pool=[
            "ATTACK AT DAWN BRING THE SHIELDS AND SWORDS",
            "RETURN TO CAMP BEFORE SUNSET OR FACE PUNISHMENT",
            "THE ENEMY APPROACHES FROM THE EAST PREPARE FOR BATTLE",
            "SUPPLIES WILL ARRIVE BY SHIP ON THE THIRD DAY",
            "RAISE THE BANNERS THE EMPEROR HAS ARRIVED",
        ],
        shift_pool=[3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25],
        file_convention="scroll.txt",
        hints=[
            "كل حرف أزيح بمقدار ثابت. لو جربت shift=1, 2, 3, ... ستصل للنص القابل للقراءة في 25 محاولة أو أقل.",
            "في الإنجليزية، الحرف الأكثر تكراراً عادةً E. الحرف الأكثر تكراراً في الـcipher إذا كان H، فالـshift=3. إذا كان J، فالـshift=5.",
            "هناك 25 إزاحة فقط ممكنة. لا تضيّع وقتك — جربها كلها بالأداة الصحيحة (مثلاً Python loop).",
        ],
    ),
    dict(
        module="encryption-basics", difficulty="متوسط",
        algorithm="CAESAR",
        theme="pirate_caribbean_treasure",
        title_pool=[
            "خريطة كنز من قرصان الكاريبي في القرن الثامن عشر",
            "فك رسالة من Edward Teach (Blackbeard)",
            "إشارة من سفينة قراصنة في تريسور كوست",
        ],
        story_pool=[
            "عُثر على صندوق خشبي في حطام سفينة Queen Anne's Revenge. بداخله رسالة مشفرة من Blackbeard. الإزاحة هنا مرتبطة برقم السفن المحظوظ عند البحارة.",
            "في متحف Maritime في نيو أورليانز، عُرضت دفتر ملاحظات من قرصان القرن الثامن عشر. آخر صفحة فيها ما يبدو خريطة كنز مع إزاحة أحادية. الملف treasure.txt يحوي الرسالة.",
        ],
        task_outline_pool=[
            "خريطة الكنز في الملف. النص منزاح بعدد ثابت من الأحرف. الـ flag هو sha256 للنص الأصلي.",
        ],
        plaintext_pool=[
            "DIG THREE PACES EAST OF THE PALM TREE BENEATH THE STONE",
            "FOLLOW THE RIVER NORTH UNTIL YOU SEE THE BRIDGE",
            "BURIED ON THE EAST SIDE OF THE HILL UNDER THE OAK TREE",
            "TREASURE LIES BENEATH THE FORT AT MIDNIGHT",
            "SAIL TO COORDINATES TWELVE NORTH SIXTY SIX WEST",
        ],
        shift_pool=[3, 5, 7, 9, 11, 13],
        file_convention="treasure_map.txt",
        hints=[
            "القراصنة استخدموا cipher اسمه ROT13. لو الـshift=13، الحروف الـ13 الأولى تستبدل بالثانية. جرّب.",
            "إزاحات مثل 7 أو 9 شائعة لكن 13 (ROT13) مفضّلة في الـ pirate lore.",
        ],
    ),
    # ===== XOR — 2 archetypes =====
    dict(
        module="encryption-basics", difficulty="متوسط",
        algorithm="XOR",
        theme="malware_c2_beacon",
        title_pool=[
            "تحليل payload من {malware} RAT",
            "فك تشفير C2 beacon من stealer",
            "استخراج URL command-and-control من عينة خبيثة",
        ],
        story_pool=[
            "عُثر على memory dump من خادم مخترق. في أحد الـ buffers، يبدو هناك payload مشفر بطريقة بدائية. الـ 256 احتمال كلها قابلة للاختبار. الملف payload.bin يحوي الـ blob.",
            "في تقرير threat intel، عثر فريقنا على dropper من عيلة Chaos. الـ config مخزنة كـ XOR single-byte في نهاية الـ binary. الملف sample.bin يحوي الـ config.",
        ],
        task_outline_pool=[
            "الملف يحوي blob مشفر بعملية أحادية على byte واحد. جرّب كل القيم الـ 256 (0-255). الـ flag هو sha256 للنص الأصلي.",
        ],
        plaintext_pool=[
            "reverse_shell_established_attacker_ip_192_168_99_42",
            "c2_domain=malicious-cdn.example.com_path=/api/beacon",
            "keylogger_active_credentials_harvested_telegram_dump",
            "ransomware_note_payment_address_1A2B3C4D5E6F",
            "exfiltrate_documents_to_dropbox_upload_id_xyz_889",
        ],
        key_pool=[0x42, 0x55, 0x77, 0xA3, 0xC9, 0xE5, 0x4F, 0x9B],
        file_convention="payload.bin",
        hints=[
            "XOR single-byte = plaintext = ciphertext XOR key. جرّب كل قيمة من 0-255 على byte واحد. ستعرف الإجابة عندما تشوف نصاً مقروءاً.",
            "XOR يحتفظ بـ bit-pattern. لو الـplaintext فيه ASCII قابل للقراءة، الـkey المعكوس سيجعل الناتج ASCII مقروء. ابحث عن النتيجة التي فيها مسافات وحروف ASCII.",
        ],
    ),
    dict(
        module="encryption-basics", difficulty="قوي",
        algorithm="XOR",
        theme="stolen_iot_firmware",
        title_pool=[
            "استعادة firmware مسروق من {fw_target}",
            "فك dump من كاميرا مراقبة مسروقة",
            "تحليل binary مسروب من راوتر Cisco",
        ],
        story_pool=[
            "في اختراق لـ supply chain، سُرق firmware.bin من مصنع {vendor}. الـ dump مشفر بـ XOR single-byte. المفتاح غير معروف لكن الـ plaintext المتوقع من version string.",
            "كجزء من تحقيق في counterfeit electronics، صودر شحنة من {fw_target}. الـ firmware مشفر بطريقة قابلة للعكس. استخرج الـ version info.",
        ],
        task_outline_pool=[
            "الملف يحوي firmware مشفر بـ single-byte operation. استخرج النص الأصلي. الـ flag هو sha256 للنص الأصلي.",
        ],
        plaintext_pool=[
            "production_unit_9842_compiled_2026_06_01_v3_2_1",
            "secure_boot_v2_image_hash_abc123def456",
            "firmware_signature_oem_authorized_release_2026_q2",
            "device_serial_range_1000000_to_1999999_factory_3",
        ],
        key_pool=[0x88, 0xAA, 0xC7, 0xE2, 0xB1, 0x9C, 0xD4, 0xF6],
        file_convention="firmware_dump.bin",
        hints=[
            "firmware يبدأ بـ magic bytes معروفة. لو عرفت magic الـ vendor، تقدر تستخرج الـkey: key = ciphertext[0] XOR known_magic[0].",
            "تطبيق منهجي: خذ byte من ciphertext وعكسه بكل 256 قيمة. عندما تشوف ASCII string معروف (مثل 'production_unit' أو 'compiled_2026')، هذا الـkey.",
        ],
    ),
    # ===== MD5 — 2 archetypes =====
    dict(
        module="hash-cracking", difficulty="مبتدئ",
        algorithm="MD5",
        theme="wordpress_leak",
        title_pool=[
            "كسر MD5 password من {leak}",
            "اختراق admin من WordPress 4.2",
            "تسريب كلمات سر من مدونة WordPress",
        ],
        story_pool=[
            "في 2015، تسربت قاعدة بيانات WordPress من موقع إخباري كبير. الـ admin password محفوظ بـ MD5 خام بدون salt. الـ hash معروض في الملف.",
            "كجزء من اختبار اختراق، حصلنا على dump من wp_users لـ target. أحد admins يحوي password مكرر. الـ MD5 hash مكشوف في الملف.",
        ],
        task_outline_pool=[
            "الملف يحوي hash قديم 128-bit. كسر الـ hash بكلمة السر الأصلية. الـ flag هو CyberArena{sha256(original_password)}.",
        ],
        password_pool=[
            "admin123", "qwerty456", "letmein2024", "P@ssw0rd1",
            "welcome123", "abc123def", "trustno1x", "iloveyou99",
        ],
        file_convention="wp_users.txt",
        hints=[
            "MD5 ينتج 32 حرف hex. ابدأ بـ rainbow table — جداول 10GB تحوي معظم كلمات السر تحت طول 8.",
            "الـ target هنا blog. كلمات السر الأكثر شيوعاً في WordPress: قوائم 1-2-3، أسماء فرق رياضية، أشهر الأسماء. جرّبها أولاً.",
            "الأدوات: hashcat -m 0 (raw MD5) أو John the Ripper --format=raw-md5.",
        ],
    ),
    dict(
        module="hash-cracking", difficulty="متوسط",
        algorithm="MD5",
        theme="healthcare_breach",
        title_pool=[
            "كسر admin password من نظام مستشفى",
            "اختراق نظام EMR عبر crack MD5",
            "استخراج EHR credentials من تسريب صحي",
        ],
        story_pool=[
            "في اختراق 2019 لـ hospital network، سُربت قاعدة بيانات نظام إدارة المرضى. كلمات السر محفوظة بـ MD5 خام. النظام يحوي سجلات طبية لـ 100,000 مريض.",
            "كجزء من تحقيق في ransomware attack على عيادة، عُثر على ملف يحوي hashed credentials. الـ hashes MD5 خام بدون salt.",
        ],
        task_outline_pool=[
            "الملف يحوي hash قديم 128-bit من نظام طبي. كسر الـ hash. الـ flag هو CyberArena{sha256(original_password)}.",
        ],
        password_pool=[
            "Doctor!2024", "MedCenter#9", "Nurse!Pass1", "EMR@dm1n",
            "HealthSecure8", "Pharma!X42", "Clinic!Pass99",
        ],
        file_convention="emr_users.txt",
        hints=[
            "في healthcare، كلمات السر تميل لاحتواء كلمات طبية: doctor, nurse, med, clinic. أضف هذه لقائمتك.",
            "الـ target متوسط التعقيد — كلمات سر 8-10 chars مع capitalized letter و رقم. wordlist مخصص أفضل من rainbow table.",
        ],
    ),
    # ===== SHA-1+SALT — 2 archetypes =====
    dict(
        module="hash-cracking", difficulty="قوي",
        algorithm="SHA-1+SALT",
        theme="linux_root_password",
        title_pool=[
            "كسر حساب root من خادم Linux قديم",
            "اختراق /etc/shadow من Ubuntu 12.04",
            "استخراج root password من server مخترق",
        ],
        story_pool=[
            "في اختبار اختراق على خادم Linux، حصلنا على /etc/shadow. أحد الحسابات (root) يحوي hash قابل للكسر. الـ salt مكشوف، الـ hash قديم ($1$).",
            "من حادثة ransomware، صودر ملف passwd/shadow. الـ hashes تستخدم آلية قديمة. أحد الحسابات الـ admin موجود. كسر الـ password.",
        ],
        task_outline_pool=[
            "الملف يحوي سطر من /etc/shadow. الـ salt مكشوف. كسر الـ password. الـ flag هو CyberArena{sha256(original_password)}.",
        ],
        password_pool=[
            "S3cur3!Root", "Linux@2025", "R00t!Pass1", "OldSys_Adm1n",
            "P@ssw0rd!RHEL", "ServerH@rd", "DataCent3r!",
        ],
        salt_pool=["apex2026", "linux42", "r00tme", "cisco99", "salted", "redhat9"],
        file_convention="etc_shadow.txt",
        hints=[
            "الـ $1$ prefix يعني MD5-crypt (وليس raw MD5). hashcat -m 500 يتعامل معه. الـsalt جزء من الـhash.",
            "Salt يمنع rainbow tables لكن brute-force بكلمة شائعة + الـsalt ما يزال سريعاً لو الـpassword ضعيف.",
            "الأداة: hashcat -m 500 -a 0 hash.txt wordlist.txt (أو John --format=md5crypt).",
        ],
    ),
    dict(
        module="hash-cracking", difficulty="قوي",
        algorithm="SHA-1+SALT",
        theme="cisco_router_enable",
        title_pool=[
            "اختراق راوتر Cisco عبر كلمة سر enable",
            "كسر enable password من Cisco IOS",
            "استخراج admin من router مخترق",
        ],
        story_pool=[
            "في red team engagement، اخترقنا router Cisco من internal network. الـ enable password محفوظ بـ type 5 (MD5 crypt) في الـ config. الـ salt مكشوف. استخرج الـ enable password.",
            "كجزء من pentest، فحصنا router قديم. الـ config يحوي username + secret من نوع type 5. الـ secret مكشوف. الـ password قابل للكسر.",
        ],
        task_outline_pool=[
            "الملف يحوي سطر من Cisco config. الـ secret مكشوف. كسر الـ password. الـ flag هو CyberArena{sha256(original_password)}.",
        ],
        password_pool=[
            "C1sc0!R0uter", "Enable@2025", "NetAdmin!9", "Cisco42@Pass",
            "RouterH@rd1", "IOS!Secret9", "Network!42",
        ],
        salt_pool=["cisco12", "enable1", "ios2024", "router", "switch1"],
        file_convention="cisco_config.txt",
        hints=[
            "Cisco type 5 = MD5 crypt ($1$). نفس أداة hashcat -m 500.",
            "Enable passwords في Cisco عادةً تحتوي كلمات: cisco, enable, secret, router. أضفها لـwordlist.",
        ],
    ),
]


def _materialize_firmware_seed() -> dict:
    """For the SHA-256 challenge, generate a random 256-byte firmware blob."""
    return {"plaintext": bytes(random.randint(0, 255) for _ in range(256)).hex()}


# --------------------------------------------------------------------------- #
# Word pools for randomization (used by randomize_template)
# --------------------------------------------------------------------------- #

_SALT_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789"


def _rand4_alpha() -> str:
    return "".join(random.choice("ABCDEFGHIJKLMNOPQRSTUVWXYZ") for _ in range(4))


def _rand8_alnum() -> str:
    return "".join(random.choice(_SALT_CHARS) for _ in range(8))


def _rand_four_digit_year() -> int:
    return random.choice([2025, 2026, 2027])


# --------------------------------------------------------------------------- #
# Variable pools for placeholder substitution in {name_en} / {brand} / etc.
# These are filled into theme story/title templates so every challenge reads
# differently. Each algorithm has 2-3 themes (see RED_SEEDS above); within
# each theme, the per-algorithm plaintext/key/shift pools control the
# crypto recipe. The pools below control the *narrative variation* inside
# stories.
# --------------------------------------------------------------------------- #

_NAMES_AR = ["أحمد علي", "سارة خان", "عمر يوسف", "ليلى حسن", "خالد العتيبي",
             "مريم الزهراني", "يوسف النجار", "فاطمة الشيخ", "حسن المالكي", "نور الشمري"]
_NAMES_EN = ["Ahmed Ali", "Sara Khan", "Omar Yusuf", "Laila Hassan", "Khaled Al-Otaibi",
             "Mariam Al-Zahrani", "Yousef Al-Najjar", "Fatima Al-Sheikh", "Hassan Al-Maliki", "Noor Al-Shammari"]
_DIAGNOSES = ["T2DM, Hypertension", "Asthma, mild anemia", "Hypothyroidism, GERD",
              "Migraine, insomnia", "Hyperlipidemia, vitamin D deficiency",
              "PCOS, insulin resistance", "Rheumatoid arthritis"]
_HOSPITALS = ["مستشفى الملك فهد", "مستشفى المواساة", "King's College Hospital",
              "Mayo Clinic", "Cleveland Clinic", "مستشفى الحبيب"]
_VENDORS = ["ZenTech GmbH", "QSecure Holding", "NetGuard Inc.", "BlueChip Labs",
            "CipherWave BV", "QuantumSec SA", "IronVault LLC"]
_MALWARE_TYPES = ["RAT", "keylogger", "stealer", "dropper", "ransomware",
                  "cryptominer", "rootkit", "backdoor"]
_INFECTION_VECTORS = ["phishing email", "watering hole", "supply-chain attack",
                      "USB drop", "drive-by download", "smoke-screened ads"]
_WEBHOOK_SERVICES = ["Slack", "GitHub", "Stripe", "PayPal", "Zapier",
                     "Twilio", "Discord", "Shopify"]
_WEBHOOK_EVENTS = ["payment.completed", "user.signup", "invoice.paid",
                   "subscription.canceled", "file.uploaded", "order.shipped",
                   "ticket.opened", "deploy.finished"]
_LEAK_SOURCES = ["تسريب WordPress قديم", "dump من منتدى phpBB", "تسريب Magento 2017",
                 "قاعدة بيانات Joomla مكشوفة", "تفريغ Sentry مكشوف",
                 "leak من Drupal 8 قديم", "تسريب vBulletin"]
_PCAP_SOURCES = ["honeypot في DMZ", "SIEM log", "tcpdump على البوابة",
                 "Wireshark capture من الـSOC", "تسجيل من IDS sensor",
                 "traffic capture من جدار الحماية"]
_FIRMWARE_SOURCES = ["جهاز IoT", "router منزلي", "كاميرا مراقبة", "طابعة مكتبية",
                     "medical device", "industrial PLC", "GPS tracker", "smart hub"]
_HASH_AUDIT_SOURCES = ["تدقيق أمني لـ", "مراجعة دورية لـ", "فحص منتظم لـ",
                       "penetration test على", "audit لاختراق"]
_BRANDS = ["Apex Corp", "ZenithLabs", "QuantumSec", "IronVault", "Aegis Holding", "N3xus Industries"]
_PLAINTIFFS = ["موظف سابق", "عميل قديم", "طرف ثالث", "شريك تجاري", "متعاقد مستقل"]
_PROTOCOLS = ["HTTPS", "SFTP", "TLS tunnel", "SSH tunnel", "VPN", "WSS"]
_ATMOSPHERE = ["ليلة عاصفة", "صمت الفجر", "غيوم الفجر", "هطول أمطار غزيرة", "ضباب كثيف", "عاصفة رملية"]


def _fill(template: str) -> str:
    """Replace {placeholder} tokens in `template` with random picks from
    the variable pools above. Unknown placeholders are left as-is."""
    table = {
        "name_ar":     random.choice(_NAMES_AR),
        "name_en":     random.choice(_NAMES_EN),
        "diagnosis":   random.choice(_DIAGNOSES),
        "hospital":    random.choice(_HOSPITALS),
        "vendor":      random.choice(_VENDORS),
        "malware":     random.choice(_MALWARE_TYPES),
        "vector":      random.choice(_INFECTION_VECTORS),
        "service":     random.choice(_WEBHOOK_SERVICES),
        "event":       random.choice(_WEBHOOK_EVENTS),
        "leak":        random.choice(_LEAK_SOURCES),
        "pcap_src":    random.choice(_PCAP_SOURCES),
        "fw_target":   random.choice(_FIRMWARE_SOURCES),
        "audit_src":   random.choice(_HASH_AUDIT_SOURCES),
        "brand":       random.choice(_BRANDS),
        "plaintiff":   random.choice(_PLAINTIFFS),
        "protocol":    random.choice(_PROTOCOLS),
        "atmosphere":  random.choice(_ATMOSPHERE),
        "year":        str(_rand_four_digit_year()),
    }
    out = template
    for k, v in table.items():
        out = out.replace("{" + k + "}", v)
    return out


# Filename extension → extension used in the simulator. When the AI/seed
# picked a specific name, we rewrite any *other* common filename in the
# story/task to match, so the simulator file matches the narrative.
_FILENAME_RE = re.compile(r"\b[\w\-./]+\.(?:txt|bin|dat|json|csv|log|enc|sha1|md5|pcap|eml|msg|xml|yaml|yml|sql|conf|cfg|ini)\b", re.IGNORECASE)


def _align_filename_in_story(text: str, canonical: str) -> str:
    """Rewrite any *.ext filename in `text` so it matches `canonical`.

    Without this, a seed/AI might say "الملف intercept.txt" in the story
    while the simulator drops `leak.bin` in the workdir — confusing the
    student. The first filename seen in the text is replaced everywhere
    with `canonical`; if none, the text is returned unchanged.
    """
    if not text or not canonical:
        return text
    matches = _FILENAME_RE.findall(text)
    if not matches:
        return text
    seen = []
    for m in matches:
        if m not in seen and m != canonical:
            seen.append(m)
    for old in seen:
        text = text.replace(old, canonical)
    return text


# --------------------------------------------------------------------------- #
# randomize_template — pick a concrete recipe from a theme-based seed.
#
# Two modes:
#   1) Theme-based (RED_SEEDS): seed has `theme`, `title_pool`, `story_pool`,
#      `task_outline_pool`, `plaintext_pool` / `password_pool`, `key_pool` /
#      `shift_pool` / `salt_pool`, `file_convention`. Each call samples a
#      different combination → a different challenge with a different flag.
#   2) Legacy simple (BLUE_SEEDS): seed has plain `title`, `story`,
#      `plaintext`, `key_material`. We just fill any placeholders.
#
# Story titles never contain algorithm names; they describe intent, not
# implementation. Different story + different recipe → different challenge
# + different flag_hash.
# --------------------------------------------------------------------------- #

def randomize_template(seed_dict: dict) -> dict:
    s = dict(seed_dict)
    algo = (s.get("algorithm") or "").upper()

    if "theme" in s and s.get("title_pool"):
        # ----- Theme-based seed (red team) -----
        s["title"]        = _fill(random.choice(s["title_pool"]))
        s["story"]        = _fill(random.choice(s["story_pool"]))
        s["task_outline"] = _fill(random.choice(s["task_outline_pool"]))

        if algo == "VIGENERE":
            s["plaintext"]    = random.choice(s["plaintext_pool"])
            s["key_material"] = random.choice(s["key_pool"])

        elif algo == "CAESAR":
            s["plaintext"]    = random.choice(s["plaintext_pool"])
            shift            = random.choice(s["shift_pool"])
            s["key_material"] = f"shift={shift}"
            s.setdefault("extra", {})["shift"] = shift

        elif algo == "XOR":
            s["plaintext"]    = random.choice(s["plaintext_pool"])
            key_byte         = random.choice(s["key_pool"])
            s["key_material"] = f"key_byte=0x{key_byte:02X}"
            s.setdefault("extra", {})["key_byte"] = key_byte

        elif algo == "MD5":
            s["plaintext"]    = random.choice(s["password_pool"])
            s["key_material"] = "$P$" + _rand8_alnum() + _rand8_alnum()[:4]

        elif algo == "SHA-1+SALT":
            s["plaintext"]    = random.choice(s["password_pool"])
            salt             = random.choice(s["salt_pool"])
            s["key_material"] = f"$1${salt}$"

        # Pass the file name to the builder via extra.
        if s.get("file_convention"):
            extra = s.setdefault("extra", {})
            if algo in ("AES-256-CBC", "AES-256-GCM", "RSA-1024"):
                extra.setdefault("filename", s["file_convention"])
            elif algo in ("SHA-256", "HMAC-SHA256"):
                extra.setdefault("input", s["file_convention"])
            else:
                extra.setdefault("filename", s["file_convention"])
    else:
        # ----- Legacy simple seed (blue team, no theme) -----
        for k in ("title", "story", "task_outline"):
            if s.get(k):
                s[k] = _fill(s[k])

    return s


def build_seeds(team_role: str) -> list[Challenge]:
    """Return the curated 5 challenges for a team, built through ChallengeBuilder.

    Each call randomizes title/story/plaintext/key from the theme's pools,
    so the same seed set produces a *different* batch of challenges every
    run. The test suite asserts that all 5 are different (no duplicate
    flag_hashes).
    """
    seeds = BLUE_SEEDS if team_role == "blue" else RED_SEEDS
    out = []
    for s in seeds:
        s = randomize_template(s)
        if not s.get("plaintext"):
            s = {**s, **_materialize_firmware_seed()}
        spec = ScenarioSpec(team_role=team_role, **_spec_kwargs(s))
        out.append(ChallengeBuilder().build(spec))
    return out


# --------------------------------------------------------------------------- #
# 8. Pool management — get count, refill, watcher (used by main.py)
# --------------------------------------------------------------------------- #

def get_pool_count(team_role: str, module: Optional[str] = None) -> int:
    """Return the number of cached challenges for a team (or a specific module).

    When `module` is None, returns the team-wide total (the pool the watcher
    tracks). When `module` is given, returns the per-module subset.
    """
    if not SUPABASE_ANON_KEY or not SUPABASE_URL:
        return 0
    base = f"{SUPABASE_URL}/rest/v1/encryption_challenges"
    headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
    }
    url = f"{base}?select=id&team_role=eq.{team_role}"
    if module:
        url += f"&module=eq.{module}"
    try:
        r = httpx.get(url, headers=headers, timeout=10)
        if r.status_code == 200:
            return len(r.json())
    except Exception as e:
        print(f"[crypto_generator] get_pool_count error: {e}")
    return 0


async def refill_pool(team_role: str, count: int = POOL_BATCH,
                       groq_api_key: str = GROQ_API_KEY) -> int:
    """Generate and insert up to `count` challenges for a team.

    AI is the PRIMARY source of every scenario. Curated seeds are only a
    last-resort fallback when Groq fails (rate-limit, timeout, parse error,
    or build failure). The fallback path is per-team backoff-aware: after
    a 429 we don't call Groq again for 5 minutes.

    Modules are picked round-robin so the team-wide pool stays balanced
    across the 3 crypto modules (encryption-basics, hash-cracking, rsa-aes).

    Concurrency: this function takes the per-team lock and **re-reads the
    count under the lock** before inserting. If the pool is already at
    POOL_TARGET (e.g. another watcher / CLI call filled it first), this
    call is a no-op. This is the fix for the "pool goes over 5" bug — two
    callers used to see the same stale count and both insert.

    Returns the number of challenges actually inserted (≤ `count`).
    """
    lock = _get_pool_lock(team_role)
    async with lock:
        # Re-check under the lock: if another caller already filled the
        # pool, don't add any more.
        current = get_pool_count(team_role)
        gap = max(0, POOL_TARGET - current)
        if gap == 0:
            return 0
        if count > gap:
            count = gap
        return await _refill_pool_unlocked(team_role, count, groq_api_key)


async def _refill_pool_unlocked(team_role: str, count: int,
                                groq_api_key: str) -> int:
    """Inner refill body — assumes the per-team lock is already held."""
    inserted = 0
    difficulties = ["مبتدئ", "متوسط", "قوي"]
    # Both teams' seeds are used as fallback so we have full algo coverage.
    # BLUE_SEEDS covers AES-CBC, AES-GCM, RSA, SHA-256, HMAC.
    # RED_SEEDS covers VIGENERE, CAESAR, XOR, MD5, SHA-1+SALT.
    team_seeds = BLUE_SEEDS if team_role == "blue" else RED_SEEDS
    seed_templates = list(BLUE_SEEDS) + list(RED_SEEDS)
    seed_cycle = list(seed_templates)
    random.shuffle(seed_cycle)
    seed_idx = 0

    # Per-team AI gate: skip Groq during a backoff window after a 429.
    now = asyncio.get_event_loop().time()
    in_backoff = bool(groq_api_key) and now < _AI_BACKOFF_UNTIL.get(team_role, 0.0)

    for i in range(count):
        # The system pre-selects the algorithm — the AI only writes flavor.
        module, algorithm = _pick_algorithm_for_slot(i)
        difficulty = difficulties[i % len(difficulties)]
        spec = None
        source = "ai"
        _maybe_try_groq = False
        _maybe_try_deepseek = False

        # ---- 1) Cloudflare (PRIMARY AI) ----
        if CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID:
            try:
                spec = await ai_generate_scenario_via_cloudflare(
                    team_role, module, difficulty,
                    CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID,
                    algorithm=algorithm,
                )
                print(f"[crypto_generator] CF OK: algo={spec.algorithm} title={spec.title[:50]}")
            except Exception as e:
                err = str(e)
                if "429" in err or "Too Many" in err or "Rate Limit" in err:
                    # Hard rate limit — try Groq as a different infra.
                    print(f"[crypto_generator] CF 429 — falling through to Groq")
                    _maybe_try_groq = True
                elif "Could not repair JSON" in err or isinstance(e, _ResponseTruncated):
                    # Truncated/bad response — try Groq.
                    print(f"[crypto_generator] CF bad response ({type(e).__name__}) — trying Groq")
                    _maybe_try_groq = True
                else:
                    # Any other CF error (network, server, auth) — try Groq.
                    print(f"[crypto_generator] CF failed ({type(e).__name__}): {e} — trying Groq")
                    _maybe_try_groq = True
            # Small delay between AI calls to stay below the per-minute limit.
            await asyncio.sleep(0.3)
        else:
            _maybe_try_groq = bool(groq_api_key)

        # ---- 2) Groq (SECONDARY AI) ----
        if spec is None and _maybe_try_groq and groq_api_key and not in_backoff:
            try:
                spec = await ai_generate_scenario(
                    team_role, module, difficulty, groq_api_key,
                    algorithm=algorithm,
                )
                print(f"[crypto_generator] Groq OK: algo={spec.algorithm} title={spec.title[:50]}")
            except Exception as e:
                err = str(e)
                if "429" in err or "Too Many" in err or "Rate Limit" in err:
                    # Hard rate limit — back off. Don't try DeepSeek (it
                    # may share the same backend infrastructure).
                    _AI_BACKOFF_UNTIL[team_role] = asyncio.get_event_loop().time() + 300
                    in_backoff = True
                    print(f"[crypto_generator] Groq 429 — backoff 5min for {team_role}")
                elif isinstance(e, _GROQ_TRANSIENT_EXCEPTIONS) or isinstance(e, _ResponseTruncated):
                    # Timeout / network blip / truncated response — try
                    # DeepSeek before giving up.
                    print(f"[crypto_generator] Groq transient error ({type(e).__name__}) — trying DeepSeek")
                    _maybe_try_deepseek = True
                else:
                    print(f"[crypto_generator] Groq failed ({team_role}/{module}/{algorithm}): {e}")
                    # Unparseable JSON or schema mismatch — also try
                    # DeepSeek as a sanity check before falling back to seed.
                    if "Could not repair JSON" in err or "JSON" in err or "KeyError" in err:
                        _maybe_try_deepseek = True
            await asyncio.sleep(0.3)

        # ---- 3) DeepSeek (TERTIARY AI — only on Cloudflare/Groq transient) ----
        if spec is None and _maybe_try_deepseek and NVIDIA_API_KEY:
            try:
                spec = await ai_generate_scenario_via_deepseek(
                    team_role, module, difficulty, NVIDIA_API_KEY,
                    algorithm=algorithm,
                )
                print(f"[crypto_generator] DeepSeek OK: algo={spec.algorithm} title={spec.title[:50]}")
            except Exception as e:
                err = str(e)
                if "429" in err or "Too Many" in err or "Rate Limit" in err:
                    print(f"[crypto_generator] DeepSeek 429 — falling through to seed")
                else:
                    print(f"[crypto_generator] DeepSeek failed: {e}")
            await asyncio.sleep(0.3)

        # ---- 2) Last-resort fallback to a curated theme seed ----
        if spec is None:
            source = "seed"
            # Try to find a seed that matches the pre-selected algorithm.
            # Fall back to a random seed if no match exists.
            matching_seeds = [s for s in seed_cycle
                              if (s.get("algorithm") or "").upper() == algorithm.upper()]
            if matching_seeds:
                template = matching_seeds[seed_idx % len(matching_seeds)]
            else:
                template = seed_cycle[seed_idx % len(seed_cycle)]
            seed_idx += 1
            randomized = randomize_template(template)
            try:
                spec = ScenarioSpec(team_role=team_role, **_spec_kwargs(randomized))
            except Exception as e:
                print(f"[crypto_generator] Seed fallback spec failed: {e}")
                continue

        # ---- 3) Build the Challenge (algorithm runs in-process) ----
        try:
            ch = ChallengeBuilder().build(spec)
            if insert_to_db(ch):
                inserted += 1
                algo = getattr(spec, "algorithm", "?")
                tag = f"theme={randomized.get('theme')}" if source == "seed" else f"title={spec.title[:40]}"
                print(f"[crypto_generator] {source.upper():4s} → algo={algo:11s} {tag}")
        except Exception as e:
            print(f"[crypto_generator] Build/insert failed: {e}")
            # AI build failed: fall back to a fresh randomized seed so the
            # pool still grows. Try to find a seed matching the pre-selected algo.
            matching_seeds = [s for s in seed_templates
                              if (s.get("algorithm") or "").upper() == algorithm.upper()]
            pool_to_use = matching_seeds if matching_seeds else seed_templates
            template = pool_to_use[i % len(pool_to_use)]
            randomized = randomize_template(template)
            try:
                spec_obj = ScenarioSpec(team_role=team_role, **_spec_kwargs(randomized))
                ch = ChallengeBuilder().build(spec_obj)
                if insert_to_db(ch):
                    inserted += 1
            except Exception as e2:
                print(f"[crypto_generator] Randomized fallback build failed: {e2}")
        await asyncio.sleep(0.2)
    return inserted


async def start_pool_watcher(team_role: str, groq_api_key: str = GROQ_API_KEY) -> None:
    """Background task: keep the team-wide pool at POOL_TARGET=5.

    Pool model: each team (red) keeps POOL_TARGET=5 cached challenges total,
    distributed round-robin across modules. Whenever the count is below
    POOL_TARGET, the watcher refills exactly the missing slots (no waiting
    for the count to drop to a threshold). Above POOL_TARGET it does nothing.

    Concurrency:
      - One watcher task per (generator, team) is enforced via
        `_WATCHER_STARTED` — second call is a no-op.
      - The refill itself runs under the per-team lock, so even a manual
        CLI `--refill` can't overshoot POOL_TARGET.

    Polling cadence:
      - When the pool is full (count >= target): poll every IDLE_POLL_SECS
        seconds (cheap, just a count() call).
      - When the pool is below target: poll every 5 seconds so a consumed
        challenge is replaced almost in real-time.
    """
    key = ("crypto", team_role)
    if key in _WATCHER_STARTED:
        print(f"[crypto:{team_role}] watcher already running — skipping duplicate start.")
        return
    _WATCHER_STARTED.add(key)
    try:
        label = f"[crypto:{team_role}]"
        print(f"{label} watcher started (target={POOL_TARGET}).")
        while True:
            try:
                # Hold the lock across the count-check + refill so a racing
                # CLI --refill or second watcher can't double-insert.
                # The lock is released BEFORE the sleep so we don't block
                # other callers for IDLE_POLL_SECS seconds.
                sleep_secs = IDLE_POLL_SECS
                async with _get_pool_lock(team_role):
                    count = get_pool_count(team_role)
                    if count < POOL_TARGET:
                        needed = POOL_TARGET - count
                        print(f"{label} pool below target ({count}/{POOL_TARGET}) — refilling {needed}…")
                        added = await _refill_pool_unlocked(team_role, needed, groq_api_key)
                        new_count = count + added
                        print(f"{label} refilled: {count} → {new_count} (target {POOL_TARGET}).")
                        sleep_secs = 5
                    else:
                        print(f"{label} pool healthy ({count}/{POOL_TARGET}) — sleeping {IDLE_POLL_SECS}s.")
                await asyncio.sleep(sleep_secs)
            except Exception as e:
                import traceback
                print(f"{label} watcher error: {e}")
                traceback.print_exc()
                await asyncio.sleep(10)
    finally:
        _WATCHER_STARTED.discard(key)


# --------------------------------------------------------------------------- #
# 9. CLI
# --------------------------------------------------------------------------- #

def main():
    p = argparse.ArgumentParser(description="CyberArena crypto challenge generator (RED TEAM ONLY)")
    p.add_argument("--team", choices=("red",), help="Crypto is red-team only")
    p.add_argument("--count", type=int, default=5)
    p.add_argument("--module", choices=ALLOWED_MODULES, default="encryption-basics")
    p.add_argument("--seed-only", action="store_true", help="Use curated seeds, no AI")
    p.add_argument("--ai", action="store_true", help="Use AI to generate (needs GROQ_API_KEY)")
    p.add_argument("--dry-run", action="store_true", help="Build but don't insert")
    p.add_argument("--out", help="Write built challenges to JSON file")
    p.add_argument("--count-pool", metavar="TEAM",
                   help="Print current team-wide pool count, then exit")
    p.add_argument("--refill", metavar="TEAM",
                   help="Refill the team-wide pool (count=POOL_BATCH)")
    args = p.parse_args()

    # Pool inspection
    if args.count_pool:
        print(get_pool_count(args.count_pool))
        return

    # Pool refill (sync wrapper for refill_pool)
    if args.refill:
        if args.refill != "red":
            p.error("crypto challenges are red-team only")
        added = asyncio.run(refill_pool(args.refill, args.count))
        print(f"Refilled {args.refill}: +{added}")
        return

    if not args.team:
        p.error("--team is required unless using --count-pool or --refill")

    # Crypto challenges are RED-TEAM ONLY. Blue team gets evaluated fixes
    # via /api/training/evaluate, not generated challenges.
    if args.team != "red":
        p.error("crypto challenges are red-team only")

    print(f"Building {args.count} {args.team.upper()} challenges for {args.module}...")
    if args.seed_only or not args.ai:
        challenges = build_seeds(args.team)[:args.count]
    else:
        # AI flow
        async def _ai():
            out = []
            for i in range(args.count):
                # Pre-select an algorithm that matches the requested module
                chosen_module, chosen_algo = _pick_algorithm_for_slot(i)
                spec = await ai_generate_scenario(
                    args.team, chosen_module, "متوسط", GROQ_API_KEY,
                    algorithm=chosen_algo,
                )
                out.append(ChallengeBuilder().build(spec))
            return out
        challenges = asyncio.run(_ai())

    for c in challenges:
        print(f"  • {c.title} | {c.difficulty} | flag={c.flag_preview[:40]}...")
        if not args.dry_run:
            insert_to_db(c)

    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            json.dump([c.to_db_row() for c in challenges], f, ensure_ascii=False, indent=2)
        print(f"Wrote {len(challenges)} challenges to {args.out}")


if __name__ == "__main__":
    main()
