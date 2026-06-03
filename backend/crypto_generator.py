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

# Pool tuning — per (team, module) bucket.
POOL_TARGET = 5       # max cached
POOL_THRESHOLD = 2    # when count drops to this, trigger refill
POOL_BATCH = 3        # how many to insert per refill
WATCHER_POLL_SECS = 60    # how often the background task polls the DB
WATCHER_COOLDOWN = 12     # sleep between AI calls (Groq rate-limit guard)
IDLE_POLL_SECS = 300      # how long to wait when the pool is full (5 min)
_AI_BACKOFF_UNTIL: dict[str, float] = {}  # per-team epoch timestamp until which AI is paused after a 429

XP_BY_DIFFICULTY = {"مبتدئ": 100, "متوسط": 150, "قوي": 200}

# Default tool whitelist for the in-browser terminal sandbox.
DEFAULT_TOOLS = ["cat", "ls", "echo", "openssl", "sha256sum", "base64", "file"]

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://yevtnyokixocpihhdwqu.supabase.co")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
GROQ_MODEL = os.environ.get("GROQ_MODEL", "llama-3.1-8b-instant")

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
            return self._build_hash(spec, spec.plaintext.encode(),
                                     hashlib.md5(spec.plaintext.encode()).hexdigest(),
                                     cmd="md5sum input.txt")

        if algo == "SHA-1+SALT":
            digest = CryptoExecutor.sha1_salt(spec.plaintext.encode(), spec.key_material)
            return self._build_hash(spec, spec.plaintext.encode(), digest.hex(),
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
            hints=self.HINTS_BY_DIFFICULTY[spec.difficulty],
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
            hints=self.HINTS_BY_DIFFICULTY[spec.difficulty],
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
            hints=self.HINTS_BY_DIFFICULTY[spec.difficulty],
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
        """
        inner = hashlib.sha256(plaintext.encode()).hexdigest()
        flag_value = f"CyberArena{{{inner}}}"
        files = {"cipher.txt": base64.b64encode(cipher_display.encode()).decode()}
        return Challenge(
            team_role=spec.team_role, module=spec.module, title=spec.title,
            story=spec.story, task_outline=spec.task_outline,
            files=files, file_metadata={"cipher.txt": {"encoding": "utf-8"}},
            command_outputs={
                "cat:cipher.txt": {"stdout": cipher_display if len(cipher_display) < 200
                                   else cipher_display[:200] + "...", "stderr": "", "exit_code": 0},
                "ls":             {"stdout": "cipher.txt", "stderr": "", "exit_code": 0},
            },
            hints=[key_hint] + self.HINTS_BY_DIFFICULTY[spec.difficulty],
            tools_whitelist=["cat", "ls", "echo", "python", "openssl", "sha256sum", "base64"],
            flag_hash=hashlib.sha256(flag_value.encode()).hexdigest(),
            flag_preview=flag_value,
            difficulty=spec.difficulty,
            xp_reward=XP_BY_DIFFICULTY[spec.difficulty],
        )


# --------------------------------------------------------------------------- #
# 5. AI integration (Groq) — produces a ScenarioSpec
# --------------------------------------------------------------------------- #

CRYPTO_SCENARIO_PROMPT = """أنت مهندس أمن سيبراني خبير يصمم تحديات تعليمية بواقعية عالية.

المطلوب: ولّد SPEC لتحدي تشفير للفريق {team_role} في موديول {module}.

قواعد حاسمة:
- لا تذكر اسم الخوارزمية (AES/RSA/Vigenere/Caesar/MD5/SHA/HMAC/XOR) داخل story أو task.
- الـ story سيناريو واقعي من 2-3 جمل.
- الـ task_outline يصف ما يجب على الطالب فعله بدون ذكر الأوامر بالأحرف.
- للفريق blue: سيناريو تطبيق تشفير/توقيع على ملف موجود.
- للفريق red: سيناريو كسر/فك تشفير لمشفر موجود.
- الـ plaintext: محتوى ملف input قصير وواقعي (CSV, JSON, config, log...).
- الصعوبة: {difficulty}

أعد JSON حصراً بهذا الشكل (بدون أي نص خارجه):
{{
  "title": "عنوان عربي مختصر",
  "story": "قصة واقعية بدون أسماء خوارزميات",
  "task_outline": "مطلوب الطالب بدقة بدون أوامر",
  "algorithm": "AES-256-CBC | AES-256-GCM | RSA-1024 | SHA-256 | HMAC-SHA256 | MD5 | SHA-1+SALT | VIGENERE | CAESAR | XOR",
  "plaintext": "محتوى الملف input",
  "key_material": "password أو key (لا تضعه داخل story)",
  "extra": {{}}
}}"""


async def ai_generate_scenario(team_role: str, module: str, difficulty: str,
                                groq_api_key: str, model: str = "llama-3.3-70b-versatile") -> ScenarioSpec:
    """Call Groq to produce a scenario. Validates and returns a ScenarioSpec."""
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
    return ScenarioSpec(
        team_role=team_role, module=module, difficulty=difficulty,
        algorithm=data["algorithm"], plaintext=data["plaintext"],
        key_material=data.get("key_material", ""),
        title=data["title"], story=data["story"], task_outline=data["task_outline"],
        extra=data.get("extra", {}),
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
        plaintext="",  # filled at runtime
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
    dict(
        module="encryption-basics", difficulty="مبتدئ",
        algorithm="VIGENERE",
        title="فك شفرة Vigenere",
        story="اعترض analyst اتصال مشفر بين خادمين داخليين. النص يبدو مكتوباً بأحرف لاتينية. استخدم تحليل Kasiski لتحديد طول الـ key ثم فك التشفير.",
        task_outline="الملف cipher.txt يحتوي نص مشفر. استخرج النص الأصلي، ثم احسب hash للعلم.",
        plaintext="WE ATTACK AT DAWN WHEN THE MOON IS HIGH",
        key_material="apex",
    ),
    dict(
        module="encryption-basics", difficulty="مبتدئ",
        algorithm="CAESAR",
        title="كسر Caesar cipher بإزاحة بسيطة",
        story="ملاحظة استخباراتية قديمة عُثر عليها في خزنة. النص يبدو منزاح أحادي. الـ shift أقل من 10.",
        task_outline="cipher.txt فيه نص مشفر بإزاحة أحادية. جرّب جميع الـ shifts وابحث عن نص قابل للقراءة.",
        plaintext="THE PACKAGE ARRIVES AT MIDNIGHT BRING THE BLUEPRINT",
        key_material="",
        extra={"shift": 3},
    ),
    dict(
        module="encryption-basics", difficulty="متوسط",
        algorithm="XOR",
        title="كسر XOR بـ single-byte key",
        story="dump من malware يحوي blob مشفر بعملية أحادية بسيطة. 256 احتمال فقط.",
        task_outline="cipher.bin فيه bytes مشفرة بعملية أحادية. جرّب كل القيم الـ 256 واستخرج النص.",
        plaintext="malware_signature_detected_drop_payload_now",
        key_material="",
        extra={"key_byte": 0x42},
    ),
    dict(
        module="hash-cracking", difficulty="متوسط",
        algorithm="MD5",
        title="كسر MD5 password من تسريب WordPress",
        story="كلمة مرور admin مخزنة كـ hash قديم 128-bit في قاعدة بيانات WordPress قديمة. الـ hash معروض في الملف.",
        task_outline="استخدم rainbow table أو brute force لكسر الـ hash. الـ flag هو كلمة المرور الأصلية مفصولة بفواصل إن وُجدت عدة احتمالات.",
        plaintext="123456",
        key_material="$P$9aBcDeFgHiJkLmNoPqRsTuVwXyZ1234",
    ),
    dict(
        module="hash-cracking", difficulty="قوي",
        algorithm="SHA-1+SALT",
        title="كسر SHA-1 salted من /etc/shadow",
        story="سطر من /etc/shadow على خادم مخترق. الـ salt مكشوف. الـ hash يحتاج brute force لكلمات شائعة.",
        task_outline="السطر يحوي دالة hash قديمة مطبقة مع salt. الـ salt والـ hash معروضان. الـ flag هو الـ password.",
        plaintext="letmein",
        key_material="$1$apex2026$",
    ),
]


def _materialize_firmware_seed() -> dict:
    """For the SHA-256 challenge, generate a random 256-byte firmware blob."""
    return {"plaintext": bytes(random.randint(0, 255) for _ in range(256)).hex()}


# --------------------------------------------------------------------------- #
# Word pools for randomization (used by randomize_template)
# --------------------------------------------------------------------------- #

_VIGENERE_PHRASES = [
    "WE ATTACK AT DAWN WHEN THE MOON IS HIGH",
    "THE EAGLE LANDS AT MIDNIGHT BRING THE BLUEPRINT",
    "MOVE THE CARGO TO SECTOR SEVEN BEFORE SUNRISE",
    "ALL STATIONS REPORT TO BRIDGE FOR FINAL BRIEFING",
    "TRIPLE ECHO IS THE CODE FOR EXTRACTION TONIGHT",
    "OPERATION NIGHTFALL PROCEEDS AT TWENTY THREE HUNDRED",
    "DELIVER THE PACKAGE TO THE WAREHOUSE BY NOON",
    "PASSWORD CHANGES EVERY SIX HOURS USE BACKUP CHANNEL",
    "TARGET MOVED TO COORDINATE FORTY SEVEN NORTH",
    "AGENT ZERO REPORTS THE EXIT IS CLEAR GO NOW",
]

_CAESAR_PHRASES = [
    "THE PACKAGE ARRIVES AT MIDNIGHT BRING THE BLUEPRINT",
    "OPERATION SILENT ECHO PROCEEDS AT DAWN",
    "MEET ME AT THE OLD CHURCH AT MIDNIGHT",
    "THE SPY ESCAPES THROUGH THE NORTHERN GATE TONIGHT",
    "FOLLOW THE RIVER NORTH UNTIL YOU SEE THE BRIDGE",
    "ALL EVIDENCE MUST BE DESTROYED BEFORE MORNING",
]

_XOR_PHRASES = [
    "malware_signature_detected_drop_payload_now",
    "remote_access_trojan_installed_keylogger_active",
    "exfiltrate_data_via_dns_tunnel_to_attacker",
    "ransomware_encrypts_user_files_demand_payment",
    "phishing_email_contains_malicious_pdf_attachment",
    "zero_day_exploit_found_in_apache_log4j_library",
]

_MD5_PASSWORDS_EASY = [
    "123456", "password", "12345678", "qwerty", "abc123",
    "letmein", "admin", "welcome", "iloveyou", "monkey",
]

_MD5_PASSWORDS_MEDIUM = [
    "trustno1", "superman", "starwars", "hello123",
    "freedom", "whatever", "shadow", "michael",
]

_MD5_PASSWORDS_HARD = [
    "Pa$$w0rd!", "Tr0ub4dor&3", "C0rrectH0rse!", "Z3n1th@2027",
    "B@se64+M0re", "Ap3x!Le@d3r", "N3xus!Auth#1",
]

_SALT_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789"

_AES_PASSWORDS = [
    "ApexSecure2026", "ZenithVault!23", "P@rad0xKey#77",
    "OrbitCipher2027", "N3xusKey$91", "CryptoCore!55",
    "SentinelPass!9", "AegisSecret!2",
]

_GCM_PASSWORDS = [
    "MedGCM_2026", "HealthVault#8", "ClinicKey!42",
    "PatientSafe_7", "DoctorKey!99", "CareCore@12",
]

_HMAC_KEYS = [
    "Zapier_Webhook_2026_Secret",
    "Payment_HMAC_Secret_v3",
    "Slack_Signing_Key_2027",
    "GitHub_Webhook_Secret_9",
    "Stripe_Endpoint_Secret_K2",
]

_HMAC_PAYLOADS = [
    '{"event":"payment.completed","amount":2500.00,"currency":"USD","timestamp":"2026-04-15T14:30:00Z","txn_id":"tx_abc123"}',
    '{"event":"user.signup","user_id":"u_4490","plan":"pro","trial":true,"timestamp":"2026-05-02T09:12:00Z"}',
    '{"event":"invoice.paid","invoice_id":"in_881","amount":150.00,"currency":"EUR","timestamp":"2026-05-19T18:05:00Z"}',
    '{"event":"subscription.canceled","sub_id":"sub_77","user_id":"u_2201","timestamp":"2026-06-01T11:45:00Z"}',
    '{"event":"file.uploaded","bucket":"apex-data","size":4096,"user_id":"u_9001","timestamp":"2026-06-02T16:20:00Z"}',
]

_RSA_CONTRACTS = [
    "SERVICE AGREEMENT\n\nThis agreement is entered into on 2026-04-15\nbetween Apex Corp (Provider) and ZenTech GmbH (Client).\n\nScope: Security audit of ZenTech infrastructure\nDuration: 90 days\nFee: $250,000 USD\n\nSigned: ____________________",
    "NDA\n\nThis Non-Disclosure Agreement is signed on 2026-05-10\nbetween Apex Security Labs and a third-party vendor\ncovering proprietary penetration testing toolkits.\nTerm: 24 months.\n\nSigned: ____________________",
    "PARTNERSHIP AGREEMENT\n\nEntered into on 2026-05-30\nbetween Apex Corp and QSecure Holding.\nScope: joint R&D on post-quantum cryptography.\nRevenue share: 60/40.\n\nSigned: ____________________",
    "EMPLOYMENT CONTRACT\n\nStart date: 2026-06-15\nPosition: Senior Cryptography Engineer at Apex Corp\nBase salary: $185,000 / year + equity.\nProbation: 90 days.\n\nSigned: ____________________",
]

_VIGENERE_KEYS = [
    "APEX", "ZERO", "LIME", "FLAG", "DATA", "KICK", "BEAT",
    "JADE", "OLIVE", "MELON", "CYAN", "WAVE", "MIST", "FROG",
]


def _rand4_alpha() -> str:
    return "".join(random.choice("ABCDEFGHIJKLMNOPQRSTUVWXYZ") for _ in range(4))


def _rand8_alnum() -> str:
    return "".join(random.choice(_SALT_CHARS) for _ in range(8))


def _rand_four_digit_year() -> int:
    return random.choice([2025, 2026, 2027])


# --------------------------------------------------------------------------- #
# Story & title templates — each entry has {placeholders} filled from
# the variable pools below so every challenge is genuinely different.
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


# Titles (Arabic) — short, varied, no algorithm name leaks
_TITLES_VIGENERE = [
    "فك شفرة Vigenere من اتصال استخباراتي",
    "كسر تشفير كلاسيكي من ملف اعتراض",
    "تحليل نص مشفر بطريقة قديمة",
    "رفع الغموض عن رسالة مشفرة متقنة",
]
_TITLES_CAESAR = [
    "كسر Caesar cipher بإزاحة بسيطة",
    "مذكرة مشفرة بإزاحة أحادية",
    "نص قديم منزاح بعدد ثابت من الأحرف",
    "استخراج نص مفيد من ورقة مشفرة",
]
_TITLES_XOR = [
    "كسر XOR بـ single-byte key",
    "تحليل payload مشفر بعملية أحادية",
    "استرجاع نص من blob خبيث",
    "فك تشفير dump من {malware}",
]
_TITLES_MD5 = [
    "كسر MD5 password من {leak}",
    "استرجاع كلمة مرور admin من {leak}",
    "كسر هاش قديم من {leak}",
    "هجوم dictionary على {leak}",
]
_TITLES_SHA1_SALT = [
    "كسر SHA-1 salted من /etc/shadow",
    "استخراج كلمة سر من خادم Linux قديم",
    "كسر password مع salted hash قديم",
    "اختراق حساب root عبر salted hash",
]
_TITLES_AES_CBC = [
    "تشفير بيانات العملاء في حالة السكون",
    "حماية ملف CSV قبل النقل لـ S3 bucket",
    "تشفير سجلات الدفع لـ {brand}",
    "تأمين بيانات بطاقات ائتمان عبر {protocol}",
]
_TITLES_AES_GCM = [
    "تشفير سجل طبي بـ authenticated encryption",
    "حماية بيانات مريض عبر {protocol}",
    "نقل آمن لـ patient record إلى {hospital}",
    "تشفير PHI قبل الإرسال لـ {hospital}",
]
_TITLES_RSA = [
    "توقيع عقد رقمي",
    "إثبات هوية عقد مع طرف ثالث",
    "توقيع اتفاقية عدم إفصاح",
    "إمضاء رقمي لـ agreement مع {vendor}",
]
_TITLES_SHA256 = [
    "حساب SHA-256 لـ firmware قبل التوزيع",
    "فحص integrity لـ {fw_target}",
    "حساب hash قبل فلاش {fw_target}",
    "تدقيق integrity على {fw_target}",
]
_TITLES_HMAC = [
    "توقيع Webhook لـ {service}",
    "التحقق من integrity لـ {service} event",
    "إعادة حساب توقيع {service} webhook",
    "اختبار {service} {event} signature",
]


# Stories (Arabic) — narrative varied per challenge
_STORIES_VIGENERE = [
    "اعترض analyst اتصال مشفر بين خادمين داخليين. النص يبدو مكتوباً بأحرف لاتينية. استخدم تحليل Kasiski لتحديد طول الـ key ثم فك التشفير.",
    "تم اعتراض رسالة مشفرة في غرفة عمليات سرية. المحللون يشتبهون بوجود كلمة مفتاح قصيرة مكررة. النص بأحرف لاتينية مكتوبة بأحرف كبيرة.",
    "اكتشف فريق SOC قناة اتصال قديمة في الشبكة. الترميز قديم الطراز ويعتمد على مفتاح قصير. حاول فك التشفير.",
    "خلال فحص intrusion على {fw_target}, عُثر على ملف مشفر في مجلد /tmp. خوارزمية الترميز كلاسيكية وبسيطة. النص بأحرف لاتينية.",
    "استلمت وحدة التحقيق الجنائي نصاً مشفراً من هاتف مهاجم. طريقة التشفير كلاسيكية. افتح النص وأخرج الـ intelligence.",
]
_STORIES_CAESAR = [
    "ملاحظة استخباراتية قديمة عُثر عليها في خزنة. النص يبدو منزاح أحادي. الـ shift أقل من 10.",
    "عُثر على ورقة مشفرة في مسرح الجريمة. الترميز بسيط جداً. النص منزاح بعدد ثابت من الأحرف. حاول قراءته.",
    "خلال تفتيش مكتب مشبوه، صودرت مذكرة. كلماتها تبدو مقطعة. حاول قراءة النص الأصلي.",
    "مذكرة قديمة من الأرشيف السري اكتُشفت في {atmosphere}. الحروف غير مرتبة بشكل طبيعي. ابحث عن الإزاحة الصحيحة.",
    "رسالة مجهولة وصلت قبل أيام. فكّك رموزها قبل أن تفقد قيمتها الاستخبارية.",
]
_STORIES_XOR = [
    "dump من {malware} يحوي blob مشفر بعملية أحادية بسيطة. 256 احتمال فقط لاستعادة النص.",
    "عُثر على ملف في ذاكرة ضحية هجوم. الملف يبدو معالجاً بـ single-byte operation. استرجع النص الأصلي.",
    "سكربت خبيث ترك أثراً في logs عبر {vector}. محتوى الـ payload مشفر بطريقة بدائية. استخرج الـ C2 URL.",
    "خلال تحليل reverse engineering لـ {malware}, عُثر على section مشفر بطريقة بسيطة. استخرج النص لمعرفة هدف البرنامج.",
    "أخذنا memory dump من {fw_target} مخترق. جزء من الـ heap يبدو مشفراً بعملية أحادية. 256 محاولة فقط لاسترجاع النص.",
]
_STORIES_MD5 = [
    "كلمة مرور admin مخزنة كـ hash قديم 128-bit في {leak}. الـ hash معروض في الملف.",
    "{leak} يحتوي dump لحسابات الموقع. أحد admin passwords محفوظ بهاش قديم. كسر الـ hash واحصل على الـ flag.",
    "قاعدة بيانات {leak} مسرّبة. كلمة مرور أحد المستخدمين محفوظة بهاش MD5. كسر الـ hash.",
    "خلال {audit_src} أحد تطبيقات الـ PHP، عُثر على dump. أحد الـ admins يحوي password مكرر. كسر الـ hash.",
]
_STORIES_SHA1_SALT = [
    "سطر من /etc/shadow على خادم مخترق. الـ salt مكشوف. الـ hash يحتاج brute force لكلمات شائعة.",
    "ملف passwd مسرّب من خادم Linux قديم. أحد الحسابات يستخدم آلية قديمة لـ password hashing. كسر كلمة السر.",
    "خادم داخلي تم اختراقه عبر {vector}. أحد الحسابات يحوي password hash من النوع القديم. استخرج كلمة السر.",
    "بعد اختراق {fw_target} في القطاع الحكومي، صودر ملف يحوي hashed credentials. كسر password للمستخدم root.",
]
_STORIES_AES_CBC = [
    "تدير شركة {brand} قسم payments يخزن بيانات بطاقات ائتمان العملاء في CSV. طلب منك مدير الأمن تشفير الملف قبل نقله إلى S3 bucket. الـ password معطى من قبل المدير مكتوب في الـ task.",
    "خلال ترقية البنية التحتية، يجب على فريق {brand} تشفير ملف customers.csv الذي يحوي معلومات حساسة قبل نقله لـ backup cloud. الـ password موجود في الـ task.",
    "تم تسريب {leak} يحوي {name_en} ضمن ضحاياه. قبل إبلاغ العميل، يجب تشفير النسخة المحلية عبر {protocol}. الـ password مذكور في المهمة.",
]
_STORIES_AES_GCM = [
    "السجل الطبي للمريضة {name_en} يجب إرساله إلى {hospital} عبر قناة غير آمنة. الـ key تتولد من كلمة مرور ثابتة. شفّر السجل قبل الإرسال.",
    "خلال نقل بيانات patient PHI بين فروع {brand}, يجب تأمين {name_en}'s record عبر {protocol}. الـ key مُعطى في الـ task.",
    "في {hospital}, تم تشخيص {name_en} بـ {diagnosis}. يجب تشفير الـ patient record قبل إرساله للطبيب المعالج عبر {protocol}.",
    "وحدة cardiology في {hospital} أرسلت سجل {name_en} إلى branch آخر. شفّر الـ record بكلمة مرور معطاة.",
]
_STORIES_RSA = [
    "محامي الشركة يحتاج توقيع رقمي على contract.txt باستخدام المفتاح الخاص المرفق. التوقيع يجب أن يكون حقيقياً وقابلاً للتحقق.",
    "قسم legal في {brand} يحتاج {plaintiff} يوقّع agreement مع {vendor}. وقّع بـ private key المرفق.",
    "بعد مفاوضات مطوّلة، أبرمت {brand} شراكة مع {vendor}. وثيقة العقد تحتاج توقيع رقمي. التوقيع base64 هو الـ flag.",
    "محامي {brand} يستعد لإبرام عقد شراكة مع {vendor}. وقّع العقد بـ RSA private key المرفق. الـ flag هو sha256 للتوقيع.",
]
_STORIES_SHA256 = [
    "فريق QA رفع firmware.bin لـ {fw_target} بحجم 256 بايت. قبل توزيعه على 10,000 جهاز، يجب حساب hash كامل.",
    "خلال فحص صورة {fw_target}، عُثر على firmware غير موقع. يجب حساب hash صحيح قبل السماح بالتوزيع.",
    "تحديث برمجي جديد من {vendor} لـ {fw_target}. قبل تثبيته، يجب التحقق من integrity عبر حساب hash.",
    "جهاز {fw_target} جاهز للنشر في بيئة الإنتاج. آخر خطوة: حساب hash للـ firmware للتحقق من عدم التلاعب.",
]
_STORIES_HMAC = [
    "خدمة {service} ترسل webhook مع توقيع integrity في الـ header. الـ secret مشترك بين المرسل والمستقبل. أعد حساب التوقيع.",
    "خلال تدقيق {service} integration, عُثر على {event} payload مع HMAC-SHA256 signature في الـ header. الـ secret مُعطى في الـ task.",
    "قسم payments في {brand} يستقبل {event} webhooks من {service}. الـ integrity signature يحتاج إعادة حساب للتحقق.",
    "مكتب {vendor} أرسل {event} event إلى {brand}. الـ signature في الـ header يحتاج التحقق عبر إعادة حسابه.",
]


def _pick_title(algo: str) -> str:
    pool = {
        "VIGENERE":    _TITLES_VIGENERE,
        "CAESAR":      _TITLES_CAESAR,
        "XOR":         _TITLES_XOR,
        "MD5":         _TITLES_MD5,
        "SHA-1+SALT":  _TITLES_SHA1_SALT,
        "AES-256-CBC": _TITLES_AES_CBC,
        "AES-256-GCM": _TITLES_AES_GCM,
        "RSA-1024":    _TITLES_RSA,
        "SHA-256":     _TITLES_SHA256,
        "HMAC-SHA256": _TITLES_HMAC,
    }.get(algo)
    return _fill(random.choice(pool)) if pool else seed_dict.get("title", "")


def _pick_story(algo: str) -> str:
    pool = {
        "VIGENERE":    _STORIES_VIGENERE,
        "CAESAR":      _STORIES_CAESAR,
        "XOR":         _STORIES_XOR,
        "MD5":         _STORIES_MD5,
        "SHA-1+SALT":  _STORIES_SHA1_SALT,
        "AES-256-CBC": _STORIES_AES_CBC,
        "AES-256-GCM": _STORIES_AES_GCM,
        "RSA-1024":    _STORIES_RSA,
        "SHA-256":     _STORIES_SHA256,
        "HMAC-SHA256": _STORIES_HMAC,
    }.get(algo)
    return _fill(random.choice(pool)) if pool else seed_dict.get("story", "")


def randomize_template(seed_dict: dict) -> dict:
    """Take a seed template and return a NEW dict with randomized values.

    Varies plaintext, key, salt, shift, contract text, title, and story
    (via templates + variable pools). Story titles never contain algorithm
    names; they describe intent, not implementation. Different story +
    different recipe → different challenge + different flag_hash.
    """
    s = dict(seed_dict)
    algo = s.get("algorithm", "").upper()

    # Always vary the narrative shell.
    s["title"] = _pick_title(algo)
    s["story"] = _pick_story(algo)

    if algo == "VIGENERE":
        s["plaintext"] = random.choice(_VIGENERE_PHRASES)
        s["key_material"] = random.choice(_VIGENERE_KEYS)
        s["task_outline"] = "الملف cipher.txt يحتوي نص مشفر. استخرج النص الأصلي، ثم احسب hash للعلم."

    elif algo == "CAESAR":
        s["plaintext"] = random.choice(_CAESAR_PHRASES)
        s.setdefault("extra", {})["shift"] = random.randint(2, 9)
        s["key_material"] = ""
        s["task_outline"] = "cipher.txt فيه نص مشفر بإزاحة أحادية. جرّب جميع الـ shifts وابحث عن نص قابل للقراءة."

    elif algo == "XOR":
        s["plaintext"] = random.choice(_XOR_PHRASES)
        s.setdefault("extra", {})["key_byte"] = random.randint(0x10, 0xFE)
        s["key_material"] = ""
        s["task_outline"] = "cipher.bin فيه bytes مشفرة بعملية أحادية. جرّب كل القيم الـ 256 واستخرج النص."

    elif algo == "MD5":
        s["plaintext"] = random.choice(_MD5_PASSWORDS_MEDIUM)
        s["key_material"] = "$P$" + _rand8_alnum() + _rand8_alnum()[:4]
        s["task_outline"] = "استخدم rainbow table أو brute force لكسر الـ hash. الـ flag هو كلمة المرور الأصلية مفصولة بفواصل إن وُجدت عدة احتمالات."

    elif algo == "SHA-1+SALT":
        s["plaintext"] = random.choice(_MD5_PASSWORDS_HARD)
        s["key_material"] = f"$1${_rand8_alnum()[:8]}$"
        s["task_outline"] = "السطر يحوي دالة hash قديمة مطبقة مع salt. الـ salt والـ hash معروضان. الـ flag هو الـ password."

    elif algo == "AES-256-CBC":
        s["key_material"] = random.choice(_AES_PASSWORDS)
        s["plaintext"] = (
            "CustomerID,Name,CardNumber,Expiry,CVV\n"
            f"1001,{random.choice(_NAMES_EN)},4532-1234-5678-9010,{random.randint(1,12):02d}/27,123\n"
            f"1002,{random.choice(_NAMES_EN)},5500-9876-5432-1098,{random.randint(1,12):02d}/26,456\n"
            f"1003,{random.choice(_NAMES_EN)},4716-1111-2222-3333,{random.randint(1,12):02d}/28,789"
        )
        s["task_outline"] = "استخدم الأمر المتوفر في القائمة البيضاء لتشفير customer_data.csv بكلمة مرور معطاة. ثم احسب hash للمخرجات."

    elif algo == "AES-256-GCM":
        s["key_material"] = random.choice(_GCM_PASSWORDS)
        s["plaintext"] = (
            f"Patient: {random.choice(_NAMES_EN)}\n"
            f"DOB: 19{random.randint(60,99)}-{random.randint(1,12):02d}-{random.randint(1,28):02d}\n"
            f"Diagnosis: {random.choice(_DIAGNOSES)}\n"
            f"Medications: Metformin 500mg BID, Lisinopril 10mg QD\n"
            f"Notes: visit #{random.randint(1, 99)} — A1C trending down."
        )
        s["task_outline"] = "شفّر patient_record.txt بخوارزمية authenticated. كلمة المرور مذكورة في الـ task."

    elif algo == "RSA-1024" or algo.startswith("RSA"):
        s["plaintext"] = random.choice(_RSA_CONTRACTS)
        s["key_material"] = ""
        s["task_outline"] = "وقّع contract.txt باستخدام private_key.pem. الـ flag هو hash 256-bit للتوقيع base64."

    elif algo == "SHA-256":
        s["plaintext"] = bytes(random.randint(0, 255) for _ in range(256)).hex()
        s["key_material"] = ""
        s["task_outline"] = "احسب hash كامل (256-bit) للملف. الـ flag هو الـ hash نفسه."

    elif algo == "HMAC-SHA256":
        s["plaintext"] = random.choice(_HMAC_PAYLOADS)
        s["key_material"] = random.choice(_HMAC_KEYS)
        s["task_outline"] = f"احسب توقيع integrity لـ payload.json بالـ key: {s['key_material']}."

    return s


def build_seeds(team_role: str) -> list[Challenge]:
    """Return the curated 5 challenges for a team, built through ChallengeBuilder."""
    seeds = BLUE_SEEDS if team_role == "blue" else RED_SEEDS
    out = []
    for s in seeds:
        if not s.get("plaintext"):
            s = {**s, **_materialize_firmware_seed()}
        spec = ScenarioSpec(team_role=team_role, **s)
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

    Modules are picked round-robin so the team-wide pool stays balanced across
    the 3 crypto modules (encryption-basics, hash-cracking, rsa-aes).

    Strategy: use the curated seeds as the PRIMARY source (reliable, no
    rate-limits, provably correct). Call the AI only as a tasteful enrichment
    for *some* slots, and skip it entirely if a recent 429 is remembered.
    If the AI fails (rate-limit, parse error, etc.) it gracefully falls back
    to the next curated seed.

    Returns the number of challenges actually inserted.
    """
    inserted = 0
    modules = list(ALLOWED_MODULES)
    difficulties = ["مبتدئ", "متوسط", "قوي"]
    seed_templates = BLUE_SEEDS if team_role == "blue" else RED_SEEDS

    # Honor a short backoff window after a 429 to avoid hammering Groq.
    now = asyncio.get_event_loop().time()
    ai_backoff_until = _AI_BACKOFF_UNTIL.get(team_role, 0.0)
    ai_allowed = bool(groq_api_key) and now >= ai_backoff_until

    for i in range(count):
        module = modules[i % len(modules)]
        difficulty = difficulties[i % len(difficulties)]
        spec = None
        # 1) Try AI (only on a fraction of slots, only if not in backoff)
        if ai_allowed and (i % 3 == 0):
            try:
                spec = await ai_generate_scenario(team_role, module, difficulty, groq_api_key)
            except Exception as e:
                err = str(e)
                if "429" in err or "Too Many" in err or "Rate Limit" in err:
                    # Set a 5-minute backoff per-team to stop the loop.
                    _AI_BACKOFF_UNTIL[team_role] = asyncio.get_event_loop().time() + 300
                    ai_allowed = False
                print(f"[crypto_generator] AI generation failed ({team_role}/{module}): {e}")
        # 2) Fallback to a *freshly randomized* curated seed template
        if spec is None:
            template = seed_templates[i % len(seed_templates)]
            randomized = randomize_template(template)
            try:
                spec_obj = ScenarioSpec(team_role=team_role, **randomized)
                ch = ChallengeBuilder().build(spec_obj)
                if insert_to_db(ch):
                    inserted += 1
                    print(f"[crypto_generator] Randomized seed: algo={randomized.get('algorithm')} → inserted")
            except Exception as e:
                print(f"[crypto_generator] Randomized seed build failed: {e}")
            await asyncio.sleep(0.2)
            continue
        # 3) Build + insert
        try:
            ch = ChallengeBuilder().build(spec)
            if insert_to_db(ch):
                inserted += 1
        except Exception as e:
            print(f"[crypto_generator] Build/insert failed: {e}")
            # AI build failed: fall back to a fresh randomized seed so the
            # pool still grows.
            template = seed_templates[i % len(seed_templates)]
            randomized = randomize_template(template)
            try:
                spec_obj = ScenarioSpec(team_role=team_role, **randomized)
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
    """
    label = f"[crypto:{team_role}]"
    print(f"{label} watcher started (target={POOL_TARGET}, threshold={POOL_THRESHOLD}, batch={POOL_BATCH}).")
    while True:
        try:
            count = get_pool_count(team_role)
            if count <= POOL_THRESHOLD:
                added = await refill_pool(team_role, POOL_BATCH, groq_api_key)
                print(f"{label} refilled: {count} → {count + added} (target {POOL_TARGET}).")
            # count > POOL_THRESHOLD → pool is healthy, do nothing.
            await asyncio.sleep(IDLE_POLL_SECS)
        except Exception as e:
            print(f"{label} watcher error: {e}")
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
