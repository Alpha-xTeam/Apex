"""
crypto_generator.py
===================
Generates fully-realized encryption challenges for the CyberArena pool.

Contract (this is one of N challenge-type generators; see main.py for the
orchestrator that runs all of them):

    main.py watcher  (polls encryption_challenges count)
            │
            ▼
    refill_pool(team_role, count)  ──→  ai_generate_scenario()  ──→  Groq
            │                              │
            │                              ▼
            │                       ScenarioSpec
            │                              │
            │                              ▼
            │                       ChallengeBuilder.build()  ──→  CryptoExecutor (runs Python)
            │                              │
            ▼                              ▼
        insert_to_db()  ◄───── Challenge (DB-ready)
            │
            ▼
    public.encryption_challenges

Public API (used by main.py):
    - POOL_TARGET = 5           per (team, module)
    - POOL_THRESHOLD = 2        trigger refill
    - POOL_BATCH = 3            how many to add per refill
    - get_pool_count(team_role, module) -> int
    - async refill_pool(team_role, module, count) -> int   (returns # inserted)
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


def _algo_matches_module(algorithm: str, module: str) -> bool:
    """True if the algorithm is allowed inside the given module bucket."""
    if algorithm.startswith("RSA"):
        return module == "rsa-aes"
    return algorithm in ALGOS_BY_MODULE.get(module, set())

# Pool tuning — per (team, module) bucket.
POOL_TARGET = 5       # max cached
POOL_THRESHOLD = 2    # when count drops to this, trigger refill
POOL_BATCH = 3        # how many to insert per refill
WATCHER_POLL_SECS = 60    # how often the background task polls the DB
WATCHER_COOLDOWN = 12     # sleep between AI calls (Groq rate-limit guard)
IDLE_POLL_SECS = 60      # how long to wait when the pool is full (1 min)
_AI_BACKOFF_UNTIL: dict[str, float] = {}  # per-team epoch timestamp until which AI is paused after a 429

XP_BY_DIFFICULTY = {"مبتدئ": 100, "متوسط": 150, "قوي": 200}

# Default tool whitelist for the in-browser terminal sandbox.
DEFAULT_TOOLS = ["cat", "ls", "echo", "openssl", "sha256sum", "base64", "file"]

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://yevtnyokixocpihhdwqu.supabase.co")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
GROQ_MODEL = os.environ.get("GROQ_MODEL", "llama-3.1-8b-instant")
# Secondary AI: NVIDIA integrate API (DeepSeek v4-pro). OpenAI-compatible.
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
                cmd=f"openssl enc -aes-256-cbc -salt -pbkdf2 -in {spec.extra.get('filename', 'data.txt')} -out data.enc -pass pass:{spec.key_material}",
                final_hash=hashlib.sha256(blob).hexdigest(),
            )

        if algo == "AES-256-GCM":
            blob, meta = CryptoExecutor.aes_gcm(spec.plaintext, spec.key_material)
            return self._build_symmetric(
                spec, blob, meta,
                filename=spec.extra.get("filename", "data.txt"),
                cmd=f"openssl enc -aes-256-gcm -in {spec.extra.get('filename', 'data.txt')} -out data.enc -pass pass:{spec.key_material}",
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
        flag_value = f"{FLAG_PREFIX}{final_hash}{'}'[:0]}"  # placeholder
        flag_value = f"CyberArena{{{final_hash}}}"
        files = {filename: base64.b64encode(spec.plaintext.encode()).decode()}
        return Challenge(
            team_role=spec.team_role, module=spec.module, title=spec.title,
            story=spec.story, task_outline=spec.task_outline,
            files=files, file_metadata={filename: {"encoding": "utf-8", "size": len(spec.plaintext)}},
            command_outputs={
                f"cat:{filename}": {"stdout": spec.plaintext, "stderr": "", "exit_code": 0},
                "openssl:enc":    {"stdout": blob.hex()[:80] + "..." if len(blob.hex()) > 80 else blob.hex(),
                                   "stderr": "", "exit_code": 0},
                "sha256sum":      {"stdout": f"{final_hash}  data.enc", "stderr": "", "exit_code": 0},
                "ls":             {"stdout": filename, "stderr": "", "exit_code": 0},
            },
            hints=self._pick_hints(spec),
            tools_whitelist=DEFAULT_TOOLS,
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
- لا تذكر اسم الخوارزمية (AES/RSA/Vigenere/Caesar/MD5/SHA/HMAC/XOR) داخل story أو task.
- الـ title: عنوان عربي محدد وجذاب — ليس عاماً. كل تحدي يجب أن يكون قصة مختلفة جذرياً عن أي تحدي آخر.
- الـ story: سيناريو واقعي من 2-3 جمل يربط الـ title بسياق حقيقي.
- الـ task_outline: ماذا يجب على الطالب فعله، بدون ذكر الأوامر بالأحرف.
- للفريق blue: سيناريو تطبيق تشفير/توقيع على ملف موجود.
- للفريق red: سيناريو كسر/فك تشفير/استخراج plaintext من مشفّر.
- الـ plaintext: محتوى ملف input قصير وواقعي (CSV, JSON, config, log, password, payload...).
- الصعوبة: {difficulty}
- الـ key_material: ضع key أو password أو salt هنا. لا تذكره في الـ story.
- اسم الملف الذي يحتوي المحتوى (مثال: intercept.txt، leak.bin، firmware.bin، contract.txt، payload.json): ضعه في `extra.filename` واستعمل نفس الاسم داخل story و task_outline بالضبط.

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
  "algorithm": "AES-256-CBC | AES-256-GCM | RSA-1024 | SHA-256 | HMAC-SHA256 | MD5 | SHA-1+SALT | VIGENERE | CAESAR | XOR",
  "plaintext": "محتوى الملف input",
  "key_material": "password أو key (لا تضعه داخل story)",
  "extra": {{
    "filename": "اسم_الملف.لاحقة"
  }}
}}"""


async def ai_generate_scenario(team_role: str, module: str, difficulty: str,
                                groq_api_key: str, model: str | None = None) -> ScenarioSpec:
    """Call Groq to produce a scenario. Validates and returns a ScenarioSpec."""
    if model is None:
        model = GROQ_MODEL  # env var or default to llama-3.1-8b-instant
    import asyncio as _asyncio
    prompt = CRYPTO_SCENARIO_PROMPT.format(team_role=team_role, module=module, difficulty=difficulty)
    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": "You output valid JSON only. No prose, no markdown fences."},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.7,
        "max_tokens": 1500,
    }
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {groq_api_key}", "Content-Type": "application/json"},
            json=body,
        )
        r.raise_for_status()
        content = r.json()["choices"][0]["message"]["content"].strip()

    # Strip optional code fences
    if content.startswith("```"):
        content = content.split("```", 2)[1]
        if content.startswith("json"):
            content = content[4:]
        content = content.strip().rstrip("`")

    data = json.loads(content)
    extra = data.get("extra", {}) or {}
    if "filename" not in extra or not extra["filename"]:
        m = _FILENAME_RE.findall(data.get("story", "") or "")
        if m:
            extra["filename"] = m[0]
    if extra.get("filename"):
        data["story"] = _align_filename_in_story(data.get("story", ""), extra["filename"])
        data["task_outline"] = _align_filename_in_story(data.get("task_outline", ""), extra["filename"])
    return ScenarioSpec(
        team_role=team_role, module=module, difficulty=difficulty,
        algorithm=data["algorithm"], plaintext=data["plaintext"],
        key_material=data.get("key_material", ""),
        title=data["title"], story=data["story"], task_outline=data["task_outline"],
        extra=extra,
    )


# Transient errors from Groq that should trigger a Gemini fallback
# (NOT 429 — that's a hard rate-limit and we should back off, not retry
# against a second provider that may share the same backend limit).
_GROQ_TRANSIENT_EXCEPTIONS = (httpx.TimeoutException, httpx.ReadTimeout,
                              httpx.ConnectError, httpx.RemoteProtocolError)


async def ai_generate_scenario_via_deepseek(team_role: str, module: str, difficulty: str,
                                            nvidia_api_key: str,
                                            model: str | None = None) -> ScenarioSpec:
    """Fallback AI: call NVIDIA integrate (DeepSeek v4-pro) when Groq is unreachable.

    OpenAI-compatible chat-completions endpoint. Returns a ScenarioSpec the
    same way ai_generate_scenario does. Raises on transport errors so the
    caller can decide what to do next (e.g. fall back to a curated seed).
    """
    if not nvidia_api_key:
        raise RuntimeError("NVIDIA_API_KEY not configured")
    model = model or NVIDIA_MODEL
    prompt = CRYPTO_SCENARIO_PROMPT.format(team_role=team_role, module=module, difficulty=difficulty)
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

    data = json.loads(content)
    extra = data.get("extra", {}) or {}
    if "filename" not in extra or not extra["filename"]:
        m = _FILENAME_RE.findall(data.get("story", "") or "")
        if m:
            extra["filename"] = m[0]
    if extra.get("filename"):
        data["story"] = _align_filename_in_story(data.get("story", ""), extra["filename"])
        data["task_outline"] = _align_filename_in_story(data.get("task_outline", ""), extra["filename"])
    return ScenarioSpec(
        team_role=team_role, module=module, difficulty=difficulty,
        algorithm=data["algorithm"], plaintext=data["plaintext"],
        key_material=data.get("key_material", ""),
        title=data["title"], story=data["story"], task_outline=data["task_outline"],
        extra=extra,
    )


# --------------------------------------------------------------------------- #
# 6. DB insert
# --------------------------------------------------------------------------- #

def insert_to_db(challenge: Challenge, supabase_url: str = SUPABASE_URL,
                  supabase_key: str = SUPABASE_ANON_KEY) -> bool:
    """Insert one Challenge into public.encryption_challenges."""
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
    with httpx.Client(timeout=30) as client:
        r = client.post(url, headers=headers, json=challenge.to_db_row())
    if r.status_code in (200, 201, 204):
        print(f"✓ Inserted: {challenge.title[:50]}")
        return True
    print(f"✗ Insert failed [{r.status_code}]: {r.text[:200]}")
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
    """Generate and insert `count` challenges for a team.

    AI is the PRIMARY source of every scenario. Curated seeds are only a
    last-resort fallback when Groq fails (rate-limit, timeout, parse error,
    or build failure). The fallback path is per-team backoff-aware: after
    a 429 we don't call Groq again for 5 minutes.

    Modules are picked round-robin so the team-wide pool stays balanced
    across the 3 crypto modules (encryption-basics, hash-cracking, rsa-aes).

    Returns the number of challenges actually inserted.
    """
    inserted = 0
    modules = list(ALLOWED_MODULES)
    difficulties = ["مبتدئ", "متوسط", "قوي"]
    seed_templates = BLUE_SEEDS if team_role == "blue" else RED_SEEDS
    seed_cycle = list(seed_templates)
    random.shuffle(seed_cycle)
    seed_idx = 0

    # Per-team AI gate: skip Groq during a backoff window after a 429.
    now = asyncio.get_event_loop().time()
    in_backoff = bool(groq_api_key) and now < _AI_BACKOFF_UNTIL.get(team_role, 0.0)

    for i in range(count):
        module = modules[i % len(modules)]
        difficulty = difficulties[i % len(difficulties)]
        spec = None
        source = "ai"
        _maybe_try_deepseek = False

        # ---- 1) Try AI for EVERY slot (the platform's primary generator) ----
        if groq_api_key and not in_backoff:
            try:
                spec = await ai_generate_scenario(team_role, module, difficulty, groq_api_key)
                # Reject if AI returned an algo that doesn't belong to this
                # module (e.g. RSA inside encryption-basics). Fall through
                # to the deepseek / seed block.
                if not _algo_matches_module(spec.algorithm, module):
                    print(f"[crypto_generator] Groq returned {spec.algorithm} for {module} — rejecting, trying DeepSeek or seed")
                    spec = None
                    _maybe_try_deepseek = True
            except Exception as e:
                err = str(e)
                if "429" in err or "Too Many" in err or "Rate Limit" in err:
                    # Hard rate limit — back off. Don't try DeepSeek (it
                    # may share the same backend infrastructure).
                    _AI_BACKOFF_UNTIL[team_role] = asyncio.get_event_loop().time() + 300
                    in_backoff = True
                    print(f"[crypto_generator] Groq 429 — backoff 5min for {team_role}")
                elif isinstance(e, _GROQ_TRANSIENT_EXCEPTIONS):
                    # Timeout / network blip — try DeepSeek before giving up.
                    print(f"[crypto_generator] Groq transient error ({type(e).__name__}) — trying DeepSeek")
                    _maybe_try_deepseek = True
                else:
                    print(f"[crypto_generator] Groq failed ({team_role}/{module}): {e}")
            # Small delay between AI calls to stay below the per-minute limit.
            await asyncio.sleep(0.3)

        # ---- 1b) DeepSeek fallback (only on Groq transient / bad-module) ----
        if spec is None and _maybe_try_deepseek and NVIDIA_API_KEY:
            try:
                spec = await ai_generate_scenario_via_deepseek(
                    team_role, module, difficulty, NVIDIA_API_KEY)
                if not _algo_matches_module(spec.algorithm, module):
                    print(f"[crypto_generator] DeepSeek returned {spec.algorithm} for {module} — rejecting, using seed")
                    spec = None
                else:
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
            # pool still grows.
            template = seed_templates[i % len(seed_templates)]
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
    """Background task: poll the team-wide pool; refill when low.

    Pool model: each team (blue, red) keeps POOL_TARGET=5 cached challenges
    total, distributed round-robin across modules. When the count drops to
    POOL_THRESHOLD=2 (or below), the watcher inserts POOL_BATCH=3 new ones.
    Above the threshold the watcher does NOTHING — this prevents hammering
    Groq with refill calls every time a single challenge is consumed.

    Polling cadence:
      - When the pool is full (count > threshold): poll every 60 seconds
        (cheap, just a count() call).
      - When the pool is low (count <= threshold): poll every 20 seconds
        so refills happen almost in real-time.
    """
    label = f"[crypto:{team_role}]"
    print(f"{label} watcher started (target={POOL_TARGET}, threshold={POOL_THRESHOLD}, batch={POOL_BATCH}).")
    while True:
        try:
            count = get_pool_count(team_role)
            if count <= POOL_THRESHOLD:
                print(f"{label} pool low ({count} <= {POOL_THRESHOLD}) — refilling…")
                added = await refill_pool(team_role, POOL_BATCH, groq_api_key)
                new_count = count + added
                print(f"{label} refilled: {count} → {new_count} (target {POOL_TARGET}).")
                # Short sleep after a refill so we can top up again if needed.
                await asyncio.sleep(20)
            else:
                # Pool is healthy. Long, but cheap, poll.
                print(f"{label} pool healthy ({count} > {POOL_THRESHOLD}) — sleeping {IDLE_POLL_SECS}s.")
                await asyncio.sleep(IDLE_POLL_SECS)
        except Exception as e:
            import traceback
            print(f"{label} watcher error: {e}")
            traceback.print_exc()
            await asyncio.sleep(60)


# --------------------------------------------------------------------------- #
# 9. CLI
# --------------------------------------------------------------------------- #

def main():
    p = argparse.ArgumentParser(description="CyberArena crypto challenge generator")
    p.add_argument("--team", choices=ALLOWED_TEAMS)
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
        added = asyncio.run(refill_pool(args.refill, args.count))
        print(f"Refilled {args.refill}: +{added}")
        return

    if not args.team:
        p.error("--team is required unless using --count-pool or --refill")

    print(f"Building {args.count} {args.team.upper()} challenges for {args.module}...")
    if args.seed_only or not args.ai:
        challenges = build_seeds(args.team)[:args.count]
    else:
        # AI flow
        async def _ai():
            out = []
            for _ in range(args.count):
                spec = await ai_generate_scenario(args.team, args.module, "متوسط", GROQ_API_KEY)
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
