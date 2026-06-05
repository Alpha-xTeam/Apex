"""
log_analysis_generator.py
=========================
Generates fully-realized log-analysis challenges for the CyberArena Blue Team pool.

Architecture:
    main.py watcher  (polls log_analysis_challenges count)
            |
            v
    refill_pool(team_role, count)  -->  ai_generate_challenge()
            |                              |
            |                              v
            |                       AI generates log content
            |                              |
            |                              v
            |                       _upload_log_to_storage() -> Supabase Storage bucket
            |                              |
            |                              v
            |                       _validate_and_build() -> DB row
            v
        insert_to_db()  <-----  Challenge row
            |
            v
    public.log_analysis_challenges

Public API (used by main.py):
    - POOL_TARGET = 5
    - POOL_THRESHOLD = 2
    - POOL_BATCH = 3
    - get_pool_count(team_role) -> int
    - async refill_pool(team_role, count) -> int
    - async start_pool_watcher(team_role)

CLI:
    python log_analysis_generator.py --team blue --seed-only
    python log_analysis_generator.py --team blue --ai --count 1
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import random
import re
import sys
import time
import uuid
from typing import Optional

# Load .env early
try:
    from dotenv import load_dotenv
    _env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    if os.path.exists(_env_path):
        load_dotenv(_env_path)
except ImportError:
    pass

import httpx


# --------------------------------------------------------------------------- #
# 0. Constants
# --------------------------------------------------------------------------- #

ALLOWED_LOG_TYPES = ("apache", "nginx", "syslog", "auth", "firewall", "waf", "iis")
ALLOWED_DIFFICULTIES = ("مبتدئ", "متوسط", "قوي")
ALLOWED_TEAMS = ("blue",)

# Attack types per log type
ATTACK_BY_LOG_TYPE = {
    "apache":  ["sqli", "xss", "path-traversal", "webshell", "brute-force"],
    "nginx":   ["sqli", "xss", "path-traversal", "webshell", "dos"],
    "syslog":  ["privilege-escalation", "c2", "lateral-movement", "malware"],
    "auth":    ["brute-force", "credential-stuffing", "lateral-movement"],
    "firewall":["port-scan", "exfiltration", "c2", "dos"],
    "waf":     ["sqli", "xss", "rce", "webshell"],
    "iis":     ["sqli", "xss", "rce"],
}

ATTACK_DESCRIPTIONS_AR = {
    "sqli": "حقن استعلامات SQL خبيثة",
    "xss": "هجوم برمجة عبر المواقع",
    "path-traversal": "تجاوز المسار للوصول لملفات حساسة",
    "webshell": "رفع شل ويب للوصول للخادم",
    "brute-force": "محاولات تخمين كلمات مرور متكررة",
    "credential-stuffing": "استخدام كلمات مرور مسرّبة",
    "dos": "هجوم حجب الخدمة",
    "privilege-escalation": "تصعيد الصلاحيات",
    "c2": "اتصال خادم قيادة وتحكم (C2)",
    "lateral-movement": "حركة جانبية داخل الشبكة",
    "malware": "تنفيذ برمجية خبيثة",
    "port-scan": "مسح منافذ الشبكة",
    "exfiltration": "تسريب بيانات خارج الشبكة",
    "rce": "تنفيذ أوامر عن بُعد",
}

# Module names for each log type
MODULE_BY_LOG_TYPE = {
    "apache":  "log-analysis",
    "nginx":   "log-analysis",
    "syslog":  "log-analysis",
    "auth":    "log-analysis",
    "firewall":"log-analysis",
    "waf":     "log-analysis",
    "iis":     "log-analysis",
}

# Rotation: cycles through (log_type, attack_type) pairs
LOG_ROTATION = []
for log_type, attacks in ATTACK_BY_LOG_TYPE.items():
    for attack in attacks:
        LOG_ROTATION.append((log_type, attack))

# Pool constants
POOL_TARGET = 5
POOL_THRESHOLD = 2
POOL_BATCH = 3

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")
STORAGE_BUCKET = "log-analysis-files"

# Primary AI: Cloudflare Workers AI
CLOUDFLARE_API_TOKEN = os.environ.get("CLOUDFLARE_API_TOKEN", "")
CLOUDFLARE_ACCOUNT_ID = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "")
CLOUDFLARE_MODEL = os.environ.get("CLOUDFLARE_MODEL", "@cf/qwen/qwen2.5-coder-32b-instruct")

CLOUDFLARE_MODEL_FALLBACKS = [
    "@cf/qwen/qwen2.5-coder-32b-instruct",
    "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    "@cf/meta/llama-3.1-70b-instruct",
    "@cf/mistralai/mistral-small-3.1-24b-instruct",
    "@cf/openai/gpt-oss-120b",
    "@cf/openai/gpt-oss-20b",
    "@cf/meta/llama-3.1-8b-instruct",
]

# Secondary AI: Groq
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
GROQ_MODEL = os.environ.get("GROQ_MODEL", "llama-3.1-8b-instant")
GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"

# Tertiary AI: NVIDIA/DeepSeek
NVIDIA_API_KEY = os.environ.get("NVIDIA_API_KEY", "")
NVIDIA_MODEL = os.environ.get("NVIDIA_MODEL", "deepseek-ai/deepseek-v4-pro")
NVIDIA_API_URL = "https://integrate.api.nvidia.com/v1/chat/completions"

TABLE_NAME = "log_analysis_challenges"

# Per-team backoff tracker
_AI_BACKOFF_UNTIL: dict[str, float] = {}


# --------------------------------------------------------------------------- #
# 1. Helpers
# --------------------------------------------------------------------------- #

def supabase_headers(content_type: bool = False) -> dict:
    headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
    }
    if content_type:
        headers["Content-Type"] = "application/json"
    return headers


def _extract_string_value(text: str, key: str) -> Optional[str]:
    """Extract a JSON string value for a given key, handling multi-line content and embedded quotes."""
    pattern = rf'"{re.escape(key)}"\s*:\s*"((?:[^"\\]|\\.)*)"'
    match = re.search(pattern, text, re.DOTALL)
    if match:
        value = match.group(1)
        value = value.replace('\\n', '\n').replace('\\t', '\t').replace('\\"', '"').replace('\\\\', '\\')
        return value
    return None


def _find_matching_bracket(text: str, open_idx: int, open_ch: str, close_ch: str) -> Optional[int]:
    """Find the matching closing bracket, accounting for nested brackets and strings."""
    depth = 0
    i = open_idx
    in_string = False
    escape_next = False
    while i < len(text):
        c = text[i]
        if escape_next:
            escape_next = False
            i += 1
            continue
        if c == '\\' and in_string:
            escape_next = True
            i += 1
            continue
        if c == '"':
            in_string = not in_string
        elif not in_string:
            if c == open_ch:
                depth += 1
            elif c == close_ch:
                depth -= 1
                if depth == 0:
                    return i
        i += 1
    return None


def parse_json_safe(raw) -> dict:
    """Robustly parse LLM JSON output, tolerating markdown fences, trailing commas, etc."""
    if raw is None or raw == "":
        raise ValueError("Empty response from model")
    if isinstance(raw, dict):
        return raw
    if not isinstance(raw, str):
        raise ValueError(f"Expected str or dict, got {type(raw).__name__}")

    cleaned = raw.strip()
    fence_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", cleaned, re.IGNORECASE)
    if fence_match:
        cleaned = fence_match.group(1).strip()

    start = cleaned.find("{")
    if start == -1:
        raise ValueError(f"No JSON object found. Raw: {cleaned[:200]}")
    end = _find_matching_bracket(cleaned, start, "{", "}")
    if end is None:
        end = cleaned.rfind("}")
        if end == -1 or end <= start:
            raise ValueError(f"Unbalanced JSON braces. Raw: {cleaned[:200]}")
    cleaned = cleaned[start:end + 1]

    cleaned = re.sub(r"[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]", "", cleaned)

    try:
        return json.loads(cleaned, strict=False)
    except json.JSONDecodeError:
        pass

    fixed = cleaned
    fixed = re.sub(r',\s*([}\]])', r'\1', fixed)
    fixed = re.sub(r'(?<!")(\b[A-Za-z_][A-Za-z0-9_]*\b)(\s*:)', r'"\1"\2', fixed)
    fixed = re.sub(r"'([^'\\]*(?:\\.[^'\\]*)*)'", lambda m: '"' + m.group(1).replace('"', '\\"') + '"', fixed)

    try:
        return json.loads(fixed, strict=False)
    except json.JSONDecodeError:
        pass

    result: dict = {}
    for key in ("title", "story", "task_outline", "log_content",
                "vulnerability_description", "difficulty",
                "expected_attack_type", "expected_attacker_ip", "expected_timestamp", "expected_ioc"):
        val = _extract_string_value(cleaned, key)
        if val is not None:
            result[key] = val

    hints_key_idx = cleaned.find('"hints"')
    if hints_key_idx != -1:
        bracket_start = cleaned.find("[", hints_key_idx)
        if bracket_start != -1:
            bracket_end = _find_matching_bracket(cleaned, bracket_start, "[", "]")
            if bracket_end is not None:
                hints_str = cleaned[bracket_start:bracket_end + 1]
                try:
                    result["hints"] = json.loads(hints_str, strict=False)
                except json.JSONDecodeError:
                    hints_str = re.sub(r',\s*([}\]])', r'\1', hints_str)
                    try:
                        result["hints"] = json.loads(hints_str, strict=False)
                    except Exception:
                        result["hints"] = []

    if not result:
        preview = raw[:500].replace("\n", " ")
        raise ValueError(f"Could not extract any fields from model output. Raw preview: {preview}")

    return result


def _pick_rotation_slot(i: int) -> tuple[str, str]:
    return LOG_ROTATION[i % len(LOG_ROTATION)]


# --------------------------------------------------------------------------- #
# 1b. Supabase Storage helpers
# --------------------------------------------------------------------------- #

async def _upload_log_to_storage(storage_path: str, content: str) -> bool:
    """Upload log content to Supabase Storage bucket. Returns True on success."""
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        print("  [storage] Missing SUPABASE_URL or SUPABASE_ANON_KEY")
        return False

    url = f"{SUPABASE_URL}/storage/v1/object/{STORAGE_BUCKET}/{storage_path}"
    headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
        "Content-Type": "text/plain",
        "x-upsert": "true",  # overwrite if exists
    }
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(url, content=content.encode("utf-8"), headers=headers)
        if resp.status_code in (200, 201):
            return True
        # Try PUT (some Storage versions use PUT for upload)
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.put(url, content=content.encode("utf-8"), headers=headers)
        if resp.status_code in (200, 201):
            return True
        print(f"  [storage] Upload failed: {resp.status_code} {resp.text[:200]}")
        return False
    except Exception as e:
        print(f"  [storage] Upload exception: {type(e).__name__}: {e}")
        return False


def _public_url_for(storage_path: str) -> str:
    return f"{SUPABASE_URL}/storage/v1/object/public/{STORAGE_BUCKET}/{storage_path}"


# --------------------------------------------------------------------------- #
# 2. Curated Seeds (hand-crafted, upload-ready)
# --------------------------------------------------------------------------- #

def _build_seeds() -> list[dict]:
    """Return a list of curated seed challenges. Each is a complete challenge row
    with pre-built log content (the log text is uploaded to Storage on first use)."""

    seeds = [
        # --- 1. auth / brute-force (مبتدئ) ---
        {
            "log_type": "auth",
            "attack_type": "brute-force",
            "difficulty": "مبتدئ",
            "xp_reward": 100,
            "title": "محاولات دخول مشبوهة على SSH",
            "story": "شركة تقنية اكتشفت ارتفاعاً غير طبيعي في فشل محاولات الدخول على خوادم SSH. راجع السجل وحدد المهاجم.",
            "task_outline": "افتح ملف auth.log وحدد: (1) عنوان IP المهاجم، (2) اسم المستخدم المستهدف، (3) الطابع الزمني لأول محاولة فاشلة.",
            "log_content": _seed_auth_brute_force(),
            "expected_attack_type": "brute-force",
            "expected_attacker_ip": "185.220.101.45",
            "expected_timestamp": "Mar 12 03:14:22",
            "expected_ioc": "root",
            "vulnerability_description": "هجوم brute-force على SSH يستهدف حساب root من IP 185.220.101.45. يجب حظر الـ IP وتطبيق fail2ban.",
            "hints": [
                {"level": 1, "text": "ابحث عن سطور 'Failed password' المتكررة", "xp_cost": 15},
                {"level": 2, "text": "استخدم grep 'Failed password' auth.log | awk '{print $11}' | sort | uniq -c | sort -rn", "xp_cost": 25},
                {"level": 3, "text": "الـ IP المهاجم هو 185.220.101.45 والهدف حساب root", "xp_cost": 40},
            ],
        },
        # --- 2. apache / sqli (متوسط) ---
        {
            "log_type": "apache",
            "attack_type": "sqli",
            "difficulty": "متوسط",
            "xp_reward": 150,
            "title": "حقن SQL على موقع التجارة الإلكترونية",
            "story": "فريق الـ SOC رصد ارتفاعاً في استعلامات بطيئة على خادم MySQL. راجع سجلات Apache واكتشف المهاجم.",
            "task_outline": "افتح access.log وحدد: (1) عنوان IP المهاجم، (2) نوع payload الـ SQLi، (3) الطابع الزمني للهجوم.",
            "log_content": _seed_apache_sqli(),
            "expected_attack_type": "sqli",
            "expected_attacker_ip": "203.0.113.42",
            "expected_timestamp": "15/Dec/2024:03:42:18",
            "expected_ioc": "UNION SELECT",
            "vulnerability_description": "حقن UNION-based SQLi من IP 203.0.113.42 على endpoint /products/search. الثغرة في دالة البحث عن المنتجات.",
            "hints": [
                {"level": 1, "text": "ابحث عن طلبات GET طويلة على /products/search", "xp_cost": 20},
                {"level": 2, "text": "كلمات مفتاحية للبحث: 'UNION', 'SELECT', '%27'", "xp_cost": 30},
                {"level": 3, "text": "IP المهاجم 203.0.113.42 والـ payload يحتوي على UNION SELECT", "xp_cost": 50},
            ],
        },
        # --- 3. nginx / webshell (متوسط) ---
        {
            "log_type": "nginx",
            "attack_type": "webshell",
            "difficulty": "متوسط",
            "xp_reward": 150,
            "title": "رفع WebShell على خادم Nginx",
            "story": "تنبيه من IDS يشير إلى نشاط POST مشبوه على endpoint غير معروف. راجع سجلات Nginx وحقق.",
            "task_outline": "افتح nginx-access.log وحدد: (1) الـ IP المهاجم، (2) اسم ملف الـ shell المرفوع، (3) توقيت الـ POST الأول.",
            "log_content": _seed_nginx_webshell(),
            "expected_attack_type": "webshell",
            "expected_attacker_ip": "198.51.100.77",
            "expected_timestamp": "20/Nov/2024:14:08:33",
            "expected_ioc": "shell.php",
            "vulnerability_description": "رفع webshell (shell.php) عبر ثغرة file upload في endpoint /uploads. المهاجم رفع PHP web shell ثم نفّذ أوامر نظام.",
            "hints": [
                {"level": 1, "text": "ابحث عن طلبات POST ناجحة على /uploads", "xp_cost": 20},
                {"level": 2, "text": "لاحقة الملف: .php على endpoint رفع", "xp_cost": 30},
                {"level": 3, "text": "الـ shell اسمها shell.php من IP 198.51.100.77", "xp_cost": 50},
            ],
        },
        # --- 4. syslog / c2 (قوي) ---
        {
            "log_type": "syslog",
            "attack_type": "c2",
            "difficulty": "قوي",
            "xp_reward": 200,
            "title": "اتصال خادم C2 مشبوه",
            "story": "محلل الشبكة رصد اتصالات DNS غير اعتيادية من خادم داخلي. تحقق من syslog لتأكيد الاختراق.",
            "task_outline": "افتح syslog.log وحدد: (1) اسم النطاق المشبوه، (2) العملية التي تقوم بالاتصال، (3) الـ IP الداخلي المصاب.",
            "log_content": _seed_syslog_c2(),
            "expected_attack_type": "c2",
            "expected_attacker_ip": "10.0.5.42",
            "expected_timestamp": "Jan 15 02:33:17",
            "expected_ioc": "evil-c2-server.xyz",
            "vulnerability_description": "Malware ينشئ قناة C2 عبر DNS tunneling إلى evil-c2-server.xyz من الخادم الداخلي 10.0.5.42.",
            "hints": [
                {"level": 1, "text": "ابحث عن طلبات DNS متكررة لنطاق غير معروف", "xp_cost": 25},
                {"level": 2, "text": "النطاق يبدو مثل DGA: حروف عشوائية + .xyz/.top", "xp_cost": 40},
                {"level": 3, "text": "evil-c2-server.xyz من الخادم 10.0.5.42", "xp_cost": 60},
            ],
        },
        # --- 5. firewall / exfiltration (قوي) ---
        {
            "log_type": "firewall",
            "attack_type": "exfiltration",
            "difficulty": "قوي",
            "xp_reward": 200,
            "title": "تسريب بيانات خارج الشبكة",
            "story": "حجم البيانات الصادرة على منفذ 443 أعلى من المعتاد بـ 10 أضعاف. تحقق من جدار الحماية.",
            "task_outline": "افتح firewall.log وحدد: (1) الـ IP الداخلي المُسرّب، (2) الـ IP الخارجي المستقبل، (3) حجم البيانات التقريبي.",
            "log_content": _seed_firewall_exfil(),
            "expected_attack_type": "exfiltration",
            "expected_attacker_ip": "10.0.3.118",
            "expected_timestamp": "2024-11-08T01:15:00",
            "expected_ioc": "2.3GB",
            "vulnerability_description": "تسريب قاعدة بيانات (2.3GB) مشفرة على منفذ 443 إلى IP خارجي. الـ IP الداخلي 10.0.3.118 مصاب ببرمجية خبيثة.",
            "hints": [
                {"level": 1, "text": "ابحث عن sessions TCP طويلة بحجم بايتات عالي", "xp_cost": 25},
                {"level": 2, "text": "حجم > 1GB على منفذ HTTPS (443) في وقت قصير", "xp_cost": 40},
                {"level": 3, "text": "الـ IP الداخلي 10.0.3.118 سرّب 2.3GB", "xp_cost": 60},
            ],
        },
        # --- 6. waf / xss (مبتدئ) ---
        {
            "log_type": "waf",
            "attack_type": "xss",
            "difficulty": "مبتدئ",
            "xp_reward": 100,
            "title": "هجوم XSS على نموذج التعليقات",
            "story": "WAF سجل محاولات حقن سكريبت في حقل التعليقات. راجع السجل وحدد المهاجم.",
            "task_outline": "افتح waf.log وحدد: (1) الـ IP المهاجم، (2) الـ XSS payload المستخدم، (3) عدد المحاولات.",
            "log_content": _seed_waf_xss(),
            "expected_attack_type": "xss",
            "expected_attacker_ip": "192.0.2.88",
            "expected_timestamp": "2024-10-22T10:14:55",
            "expected_ioc": "<script>alert",
            "vulnerability_description": "محاولات XSS متعددة من 192.0.2.88 على endpoint /comments. الـ payload يحتوي على <script>alert(1)</script>.",
            "hints": [
                {"level": 1, "text": "ابحث عن rule 'XSS Attack' أو 'Cross-Site Scripting'", "xp_cost": 15},
                {"level": 2, "text": "الـ payload يحتوي على <script>", "xp_cost": 25},
                {"level": 3, "text": "IP المهاجم 192.0.2.88 والـ payload <script>alert", "xp_cost": 40},
            ],
        },
    ]
    return seeds


def _seed_auth_brute_force() -> str:
    """SSH auth.log with 50+ failed attempts from a single IP targeting root."""
    lines = [
        "Mar 12 03:10:01 webserver sshd[12847]: Accepted publickey for admin from 10.0.1.5 port 51234 ssh2: ED25519 SHA256:abc123",
        "Mar 12 03:10:15 webserver sshd[12850]: Failed password for invalid user admin from 185.220.101.45 port 33421 ssh2",
        "Mar 12 03:12:33 webserver sshd[12851]: Failed password for invalid user test from 185.220.101.45 port 33422 ssh2",
        "Mar 12 03:12:38 webserver sshd[12852]: Failed password for invalid user guest from 185.220.101.45 port 33423 ssh2",
        "Mar 12 03:13:05 webserver sshd[12853]: Failed password for invalid user oracle from 185.220.101.45 port 33424 ssh2",
        "Mar 12 03:13:09 webserver sshd[12854]: Failed password for invalid user postgres from 185.220.101.45 port 33425 ssh2",
        "Mar 12 03:13:12 webserver sshd[12855]: Failed password for invalid user nagios from 185.220.101.45 port 33426 ssh2",
        "Mar 12 03:13:15 webserver sshd[12856]: Failed password for invalid user www from 185.220.101.45 port 33427 ssh2",
        "Mar 12 03:13:19 webserver sshd[12857]: Failed password for invalid user www-data from 185.220.101.45 port 33428 ssh2",
        "Mar 12 03:13:22 webserver sshd[12858]: Failed password for invalid user apache from 185.220.101.45 port 33429 ssh2",
        "Mar 12 03:13:26 webserver sshd[12859]: Failed password for invalid user git from 185.220.101.45 port 33430 ssh2",
        "Mar 12 03:13:30 webserver sshd[12860]: Failed password for invalid user jenkins from 185.220.101.45 port 33431 ssh2",
        "Mar 12 03:13:35 webserver sshd[12861]: Failed password for invalid user deploy from 185.220.101.45 port 33432 ssh2",
        "Mar 12 03:13:39 webserver sshd[12862]: Failed password for invalid user ubuntu from 185.220.101.45 port 33433 ssh2",
        "Mar 12 03:13:44 webserver sshd[12863]: Failed password for invalid user pi from 185.220.101.45 port 33434 ssh2",
        "Mar 12 03:13:49 webserver sshd[12864]: Failed password for invalid user vagrant from 185.220.101.45 port 33435 ssh2",
        "Mar 12 03:13:55 webserver sshd[12865]: Failed password for invalid user ec2-user from 185.220.101.45 port 33436 ssh2",
        "Mar 12 03:14:01 webserver sshd[12866]: Failed password for invalid user centos from 185.220.101.45 port 33437 ssh2",
        "Mar 12 03:14:08 webserver sshd[12867]: Failed password for invalid user mysql from 185.220.101.45 port 33438 ssh2",
        "Mar 12 03:14:15 webserver sshd[12868]: Failed password for invalid user redis from 185.220.101.45 port 33439 ssh2",
        "Mar 12 03:14:22 webserver sshd[12869]: Failed password for root from 185.220.101.45 port 33440 ssh2",
        "Mar 12 03:14:28 webserver sshd[12870]: Failed password for root from 185.220.101.45 port 33441 ssh2",
        "Mar 12 03:14:35 webserver sshd[12871]: Failed password for root from 185.220.101.45 port 33442 ssh2",
        "Mar 12 03:14:42 webserver sshd[12872]: Failed password for root from 185.220.101.45 port 33443 ssh2",
        "Mar 12 03:14:50 webserver sshd[12873]: Failed password for root from 185.220.101.45 port 33444 ssh2",
        "Mar 12 03:14:58 webserver sshd[12874]: Failed password for root from 185.220.101.45 port 33445 ssh2",
        "Mar 12 03:15:06 webserver sshd[12875]: Failed password for root from 185.220.101.45 port 33446 ssh2",
        "Mar 12 03:15:15 webserver sshd[12876]: Failed password for root from 185.220.101.45 port 33447 ssh2",
        "Mar 12 03:15:25 webserver sshd[12877]: Failed password for root from 185.220.101.45 port 33448 ssh2",
        "Mar 12 03:15:35 webserver sshd[12878]: Failed password for root from 185.220.101.45 port 33449 ssh2",
        "Mar 12 03:15:46 webserver sshd[12879]: Failed password for root from 185.220.101.45 port 33450 ssh2",
        "Mar 12 03:15:57 webserver sshd[12880]: Failed password for root from 185.220.101.45 port 33451 ssh2",
        "Mar 12 03:16:09 webserver sshd[12881]: Failed password for root from 185.220.101.45 port 33452 ssh2",
        "Mar 12 03:16:22 webserver sshd[12882]: Failed password for root from 185.220.101.45 port 33453 ssh2",
        "Mar 12 03:16:35 webserver sshd[12883]: Failed password for root from 185.220.101.45 port 33454 ssh2",
        "Mar 12 03:16:49 webserver sshd[12884]: Failed password for root from 185.220.101.45 port 33455 ssh2",
        "Mar 12 03:17:03 webserver sshd[12885]: Failed password for root from 185.220.101.45 port 33456 ssh2",
        "Mar 12 03:17:18 webserver sshd[12886]: Failed password for root from 185.220.101.45 port 33457 ssh2",
        "Mar 12 03:17:33 webserver sshd[12887]: Failed password for root from 185.220.101.45 port 33458 ssh2",
        "Mar 12 03:17:49 webserver sshd[12888]: Failed password for root from 185.220.101.45 port 33459 ssh2",
        "Mar 12 03:18:05 webserver sshd[12889]: Failed password for root from 185.220.101.45 port 33460 ssh2",
        "Mar 12 03:18:22 webserver sshd[12890]: Failed password for root from 185.220.101.45 port 33461 ssh2",
        "Mar 12 03:18:39 webserver sshd[12891]: Failed password for root from 185.220.101.45 port 33462 ssh2",
        "Mar 12 03:18:57 webserver sshd[12892]: Failed password for root from 185.220.101.45 port 33463 ssh2",
        "Mar 12 03:19:15 webserver sshd[12893]: Failed password for root from 185.220.101.45 port 33464 ssh2",
        "Mar 12 03:19:34 webserver sshd[12894]: Failed password for root from 185.220.101.45 port 33465 ssh2",
        "Mar 12 03:19:53 webserver sshd[12895]: Failed password for root from 185.220.101.45 port 33466 ssh2",
        "Mar 12 03:20:13 webserver sshd[12896]: Failed password for root from 185.220.101.45 port 33467 ssh2",
        "Mar 12 03:20:33 webserver sshd[12897]: Failed password for root from 185.220.101.45 port 33468 ssh2",
        "Mar 12 03:20:54 webserver sshd[12898]: Failed password for root from 185.220.101.45 port 33469 ssh2",
        "Mar 12 03:21:15 webserver sshd[12899]: Failed password for root from 185.220.101.45 port 33470 ssh2",
        "Mar 12 03:21:37 webserver sshd[12900]: Failed password for root from 185.220.101.45 port 33471 ssh2",
        "Mar 12 03:22:00 webserver sshd[12901]: Failed password for root from 185.220.101.45 port 33472 ssh2",
        "Mar 12 03:22:23 webserver sshd[12902]: Connection closed by invalid user [preauth]",
        "Mar 12 03:22:30 webserver sshd[12849]: Accepted publickey for admin from 10.0.1.5 port 51235 ssh2: ED25519 SHA256:abc123",
        "Mar 12 03:23:01 webserver CRON[12903]: pam_unix(cron:session): session opened for user root by (uid=0)",
        "Mar 12 03:23:02 webserver CRON[12904]: (root) CMD (/usr/local/bin/backup.sh)",
    ]
    return "\n".join(lines) + "\n"


def _seed_apache_sqli() -> str:
    """Apache access.log with UNION-based SQLi from one IP."""
    base_lines = [
        '10.0.1.5 - - [15/Dec/2024:03:30:00 +0000] "GET / HTTP/1.1" 200 4521 "-" "Mozilla/5.0"',
        '10.0.1.5 - - [15/Dec/2024:03:30:15 +0000] "GET /products HTTP/1.1" 200 12450 "-" "Mozilla/5.0"',
        '10.0.1.6 - - [15/Dec/2024:03:31:00 +0000] "GET /about HTTP/1.1" 200 3210 "-" "Mozilla/5.0"',
    ]
    # Inject 5 normal search requests from various IPs
    for i in range(5):
        base_lines.append(
            f'10.0.1.{10+i} - - [15/Dec/2024:03:35:0{i} +0000] "GET /products/search?q=shoes HTTP/1.1" 200 3200 "-" "Mozilla/5.0"'
        )

    # Attacker probes
    attacker = "203.0.113.42"
    base_lines.extend([
        f'{attacker} - - [15/Dec/2024:03:40:01 +0000] "GET /products/search?q=\' HTTP/1.1" 500 1024 "-" "sqlmap/1.5"',
        f'{attacker} - - [15/Dec/2024:03:40:15 +0000] "GET /products/search?q=shoes\' HTTP/1.1" 500 1024 "-" "sqlmap/1.5"',
        f'{attacker} - - [15/Dec/2024:03:40:30 +0000] "GET /products/search?q=shoes%27%20OR%201=1-- HTTP/1.1" 500 1024 "-" "sqlmap/1.5"',
        f'{attacker} - - [15/Dec/2024:03:41:00 +0000] "GET /products/search?q=shoes%27%20UNION%20SELECT%20NULL-- HTTP/1.1" 500 1024 "-" "sqlmap/1.5"',
        f'{attacker} - - [15/Dec/2024:03:41:30 +0000] "GET /products/search?q=shoes%27%20UNION%20SELECT%20NULL,NULL-- HTTP/1.1" 500 1024 "-" "sqlmap/1.5"',
        f'{attacker} - - [15/Dec/2024:03:42:18 +0000] "GET /products/search?q=shoes%27%20UNION%20SELECT%20username,password%20FROM%20users-- HTTP/1.1" 200 8500 "-" "sqlmap/1.5"',
        f'{attacker} - - [15/Dec/2024:03:42:55 +0000] "GET /products/search?q=shoes%27%20UNION%20SELECT%20NULL,NULL,NULL,NULL,NULL-- HTTP/1.1" 200 9200 "-" "sqlmap/1.5"',
        f'{attacker} - - [15/Dec/2024:03:43:30 +0000] "GET /products/search?q=admin%27-- HTTP/1.1" 200 1500 "-" "sqlmap/1.5"',
        f'{attacker} - - [15/Dec/2024:03:44:00 +0000] "GET /products HTTP/1.1" 200 12450 "-" "sqlmap/1.5"',
        f'{attacker} - - [15/Dec/2024:03:44:15 +0000] "GET /admin HTTP/1.1" 404 412 "-" "sqlmap/1.5"',
    ])

    # Some normal traffic after
    for i in range(8):
        base_lines.append(
            f'10.0.2.{i+1} - - [15/Dec/2024:03:5{i}:00 +0000] "GET /products HTTP/1.1" 200 12450 "-" "Mozilla/5.0"'
        )
    return "\n".join(base_lines) + "\n"


def _seed_nginx_webshell() -> str:
    """Nginx access.log with webshell upload + command execution."""
    base = [
        '10.0.1.5 - - [20/Nov/2024:14:00:00 +0000] "GET / HTTP/1.1" 200 4521 "-" "Mozilla/5.0"',
        '10.0.1.5 - - [20/Nov/2024:14:00:30 +0000] "GET /upload HTTP/1.1" 200 2100 "-" "Mozilla/5.0"',
        '10.0.1.6 - - [20/Nov/2024:14:01:00 +0000] "GET /products HTTP/1.1" 200 3200 "-" "Mozilla/5.0"',
    ]
    attacker = "198.51.100.77"
    base.extend([
        f'{attacker} - - [20/Nov/2024:14:05:01 +0000] "GET /upload HTTP/1.1" 200 2100 "-" "Mozilla/5.0"',
        f'{attacker} - - [20/Nov/2024:14:05:30 +0000] "GET /upload HTTP/1.1" 200 2100 "-" "Mozilla/5.0"',
        f'{attacker} - - [20/Nov/2024:14:07:00 +0000] "GET /upload?file=test.txt HTTP/1.1" 200 2100 "-" "Mozilla/5.0"',
        f'{attacker} - - [20/Nov/2024:14:08:33 +0000] "POST /upload HTTP/1.1" 201 124 "-" "curl/7.68.0"',
        f'{attacker} - - [20/Nov/2024:14:09:01 +0000] "GET /uploads/shell.php HTTP/1.1" 200 12 "-" "curl/7.68.0"',
        f'{attacker} - - [20/Nov/2024:14:09:15 +0000] "POST /uploads/shell.php HTTP/1.1" 200 45 "-" "curl/7.68.0"',
        f'{attacker} - - [20/Nov/2024:14:09:16 +0000] "POST /uploads/shell.php?cmd=id HTTP/1.1" 200 87 "-" "curl/7.68.0"',
        f'{attacker} - - [20/Nov/2024:14:09:30 +0000] "POST /uploads/shell.php?cmd=cat%20/etc/passwd HTTP/1.1" 200 1820 "-" "curl/7.68.0"',
        f'{attacker} - - [20/Nov/2024:14:10:00 +0000] "POST /uploads/shell.php?cmd=whoami HTTP/1.1" 200 8 "-" "curl/7.68.0"',
        f'{attacker} - - [20/Nov/2024:14:10:30 +0000] "POST /uploads/shell.php?cmd=uname%20-a HTTP/1.1" 200 215 "-" "curl/7.68.0"',
        f'{attacker} - - [20/Nov/2024:14:11:00 +0000] "GET /admin HTTP/1.1" 403 162 "-" "Mozilla/5.0"',
        f'{attacker} - - [20/Nov/2024:14:11:30 +0000] "POST /uploads/shell.php?cmd=chmod%20777%20/etc/shadow HTTP/1.1" 200 0 "-" "curl/7.68.0"',
    ])
    return "\n".join(base) + "\n"


def _seed_syslog_c2() -> str:
    """Syslog showing C2 beaconing over DNS."""
    lines = []
    # Normal syslog noise
    for i in range(20):
        lines.append(f"Jan 15 02:{i:02d}:00 server01 kernel: [12345.{i}] TCP: peer closed connection")
    lines.extend([
        "Jan 15 02:30:00 server01 named[1523]: client @0x7f8b8c001234 10.0.5.42#54321: query: evil-c2-server.xyz IN A +E(0)K (10.0.0.1)",
        "Jan 15 02:30:15 server01 named[1523]: client @0x7f8b8c001234 10.0.5.42#54322: query: evil-c2-server.xyz IN A +E(0)K (10.0.0.1)",
        "Jan 15 02:30:30 server01 named[1523]: client @0x7f8b8c001234 10.0.5.42#54323: query: evil-c2-server.xyz IN A +E(0)K (10.0.0.1)",
        "Jan 15 02:32:17 server01 sshd[3421]: Accepted password for ops from 10.0.5.42 port 51234 ssh2",
        "Jan 15 02:33:17 server01 named[1523]: client @0x7f8b8c001234 10.0.5.42#54324: query: x8f3k2.evil-c2-server.xyz IN A +E(0)K (10.0.0.1)",
        "Jan 15 02:33:30 server01 kernel: [98765.1] audit: type=1400 audit(1705306417.123:42): apparmor=\"DENIED\" operation=\"open\" profile=\"/usr/sbin/named\" name=\"/tmp/.cache.bin\" pid=3421",
        "Jan 15 02:33:45 server01 named[1523]: client @0x7f8b8c001234 10.0.5.42#54325: query: x9a2m7.evil-c2-server.xyz IN A +E(0)K (10.0.0.1)",
        "Jan 15 02:34:00 server01 cron[8990]: (root) CMD (/usr/local/bin/heartbeat.sh)",
        "Jan 15 02:34:15 server01 named[1523]: client @0x7f8b8c001234 10.0.5.42#54326: query: x1b9n3.evil-c2-server.xyz IN A +E(0)K (10.0.0.1)",
        "Jan 15 02:35:00 server01 sshd[3500]: Failed password for root from 10.0.5.42 port 51240 ssh2",
        "Jan 15 02:35:30 server01 named[1523]: client @0x7f8b8c001234 10.0.5.42#54327: query: x5p2q8.evil-c2-server.xyz IN A +E(0)K (10.0.0.1)",
        "Jan 15 02:36:00 server01 named[1523]: client @0x7f8b8c001234 10.0.5.42#54328: query: evil-c2-server.xyz IN TXT +E(0)K (10.0.0.1)",
        "Jan 15 02:36:15 server01 kernel: [98770.5] TCP: request_sock_TCP: Established connection from 10.0.5.42:4444 to 198.51.100.99:443",
        "Jan 15 02:36:45 server01 named[1523]: client @0x7f8b8c001234 10.0.5.42#54329: query: x7k4t6.evil-c2-server.xyz IN A +E(0)K (10.0.0.1)",
    ])
    return "\n".join(lines) + "\n"


def _seed_firewall_exfil() -> str:
    """Firewall log showing large outbound transfer."""
    lines = [
        "# Firewall Log - NetFilter",
        "# Format: timestamp action src_ip:src_port -> dst_ip:dst_port proto bytes",
    ]
    # Normal traffic
    for i in range(15):
        lines.append(f"2024-11-08T00:30:{i:02d}Z ALLOW 10.0.3.{10+i}:443 -> 142.250.190.78:443 TCP 12450")
    # Exfiltration
    lines.extend([
        "2024-11-08T01:14:30Z ALLOW 10.0.3.118:51234 -> 198.51.100.200:443 TCP 14500",
        "2024-11-08T01:14:45Z ALLOW 10.0.3.118:51234 -> 198.51.100.200:443 TCP 245000000",
        "2024-11-08T01:14:55Z ALLOW 10.0.3.118:51234 -> 198.51.100.200:443 TCP 512000000",
        "2024-11-08T01:15:00Z ALLOW 10.0.3.118:51234 -> 198.51.100.200:443 TCP 1024000000",
        "2024-11-08T01:15:15Z ALLOW 10.0.3.118:51234 -> 198.51.100.200:443 TCP 2048000000",
        "2024-11-08T01:15:30Z ALLOW 10.0.3.118:51234 -> 198.51.100.200:443 TCP 512000000",
        "2024-11-08T01:15:45Z CLOSE  10.0.3.118:51234 -> 198.51.100.200:443 TCP 0",
        "2024-11-08T01:16:00Z ALLOW 10.0.3.118:51235 -> 198.51.100.200:8443 TCP 14500",
        "2024-11-08T01:16:15Z ALLOW 10.0.3.118:51235 -> 198.51.100.200:8443 TCP 14500",
    ])
    return "\n".join(lines) + "\n"


def _seed_waf_xss() -> str:
    """WAF log with XSS attempts."""
    lines = [
        "# ModSecurity WAF Audit Log",
        "# Format: timestamp [rule_id] src_ip method path status attack_type",
    ]
    # Normal requests
    for i in range(10):
        lines.append(f"2024-10-22T10:0{i}:00Z [200] 10.0.1.{10+i} GET /comments 200 OK")
    # XSS attempts from one IP
    attacker = "192.0.2.88"
    lines.extend([
        f"2024-10-22T10:14:25Z [941100] {attacker} POST /comments 200 XSS Attack",
        f"2024-10-22T10:14:30Z [941100] {attacker} POST /comments 200 XSS Attack",
        f"2024-10-22T10:14:35Z [941100] {attacker} POST /comments 200 XSS Attack",
        f"2024-10-22T10:14:40Z [941110] {attacker} POST /comments 200 XSS Filter - Category 1: Script Tag",
        f"2024-10-22T10:14:45Z [941100] {attacker} POST /comments 200 XSS Attack",
        f"2024-10-22T10:14:50Z [941110] {attacker} POST /comments 200 XSS Filter - Category 1: Script Tag",
        f"2024-10-22T10:14:55Z [941100] {attacker} POST /comments 200 XSS Attack",
        f"2024-10-22T10:15:00Z [941100] {attacker} POST /comments 200 XSS Attack",
        f"2024-10-22T10:15:05Z [941100] {attacker} POST /comments 200 XSS Attack",
        f"2024-10-22T10:15:10Z [941110] {attacker} POST /comments 200 XSS Filter - Category 1: Script Tag",
        f"2024-10-22T10:15:15Z [941100] {attacker} POST /comments 200 XSS Attack",
        f"2024-10-22T10:15:20Z [941100] {attacker} GET /comments 200 OK",
        f"2024-10-22T10:15:30Z [941100] {attacker} POST /comments 200 XSS Attack",
    ])
    return "\n".join(lines) + "\n"


# --------------------------------------------------------------------------- #
# 3. AI Generation (3-tier: Cloudflare -> Groq -> NVIDIA)
# --------------------------------------------------------------------------- #

SYSTEM_PROMPT = """You are a SOC analyst and log forensics expert. Generate a realistic log-analysis challenge for blue-team training.

Generate a {log_type} server log file that contains a clear {attack_type} attack. The log must include:
- 20-50 normal/benign log lines
- 5-20 attack log lines from a single attacker IP
- Realistic timestamps and formatting matching {log_type} log conventions

CRITICAL REQUIREMENTS:
1. Respond with ONLY valid JSON. No markdown, no code fences, no explanation.
2. "log_content" MUST be a complete log file (50-200 lines), with realistic timestamps, no placeholders.
3. "expected_attack_type" must be one of: sqli, xss, brute-force, webshell, c2, exfiltration, dos, lateral-movement, privilege-escalation, port-scan, rce
4. "expected_attacker_ip" must be the IP that performs the attack.
5. "expected_timestamp" must be the timestamp of the FIRST attack line.
6. "expected_ioc" must be a short indicator of compromise (URL fragment, hash, command, etc).
7. All text fields (title, story, task_outline, vulnerability_description) MUST be in Arabic.
8. difficulty must be EXACTLY "مبتدئ" or "متوسط" or "قوي"
9. hints must be 3 objects: [{{"level":1,"text":"hint 1","xp_cost":20}}, {{"level":2,"text":"hint 2","xp_cost":30}}, {{"level":3,"text":"hint 3","xp_cost":50}}]

Return ONLY this JSON:
{{"title":"...","story":"...","task_outline":"...","log_content":"...","vulnerability_description":"...","expected_attack_type":"...","expected_attacker_ip":"...","expected_timestamp":"...","expected_ioc":"...","difficulty":"متوسط","hints":[{{"level":1,"text":"...","xp_cost":20}},{{"level":2,"text":"...","xp_cost":30}},{{"level":3,"text":"...","xp_cost":50}}]}}
"""


async def _post_with_json_fallback(client, url: str, payload: dict, headers: dict, provider_name: str) -> Optional[httpx.Response]:
    """POST with response_format. If 4xx, retry without."""
    resp = await client.post(url, json=payload, headers=headers)
    if resp.status_code in (400, 404, 422) and "response_format" in payload:
        print(f"  [{provider_name}] response_format not supported ({resp.status_code}), retrying without...")
        payload2 = {k: v for k, v in payload.items() if k != "response_format"}
        resp = await client.post(url, json=payload2, headers=headers)
    return resp


async def _try_cloudflare(prompt: str, system: str) -> Optional[str]:
    """Try Cloudflare Workers AI.

    Speed-first strategy:
    - Race 3 FAST models in parallel (qwen-coder-32b + gpt-oss-20b + llama-3.1-8b)
    - 25s timeout each, max_tokens=2500
    - First valid response wins
    - Skip 70B/120B entirely (too slow for our 15s target)

    If all 3 fail, returns None and caller falls back to Groq/NVIDIA/seed.
    """
    if not (CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID):
        return None

    # Fast models only (skip 70B/120B - too slow for 15s target)
    fast_models = [
        "@cf/qwen/qwen2.5-coder-32b-instruct",   # 32B, smart
        "@cf/openai/gpt-oss-20b",                 # 20B, OpenAI compat
        "@cf/meta/llama-3.1-8b-instruct",         # 8B, fastest
    ]
    if CLOUDFLARE_MODEL and CLOUDFLARE_MODEL not in fast_models:
        fast_models.insert(0, CLOUDFLARE_MODEL)

    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    payload_base = {"messages": messages, "temperature": 0.7, "max_tokens": 2500}

    async def _call_one(model_name: str) -> Optional[str]:
        url = f"https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/ai/run/{model_name}"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {CLOUDFLARE_API_TOKEN}",
        }
        payload = {**payload_base, "response_format": {"type": "json_object"}}
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await _post_with_json_fallback(client, url, payload, headers, f"cf/{model_name.split('/')[-1]}")
            if resp.status_code == 200:
                result = resp.json()
                if result.get("success") and result.get("result", {}).get("response"):
                    return result["result"]["response"]
        except asyncio.CancelledError:
            raise
        except Exception as e:
            print(f"  [cf/{model_name.split('/')[-1]}] {type(e).__name__}: {e}")
        return None

    async def _race_one(model_name: str):
        return model_name, await _call_one(model_name)

    # True race: cancel losers as soon as one returns a valid response
    tasks = [asyncio.create_task(_race_one(m)) for m in fast_models]
    try:
        for fut in asyncio.as_completed(tasks, timeout=8):
            try:
                model_name, response = await fut
                if response:
                    for t in tasks:
                        if not t.done():
                            t.cancel()
                    print(f"  [cf/race] winner: {model_name.split('/')[-1]}")
                    return response
            except asyncio.CancelledError:
                continue
            except Exception:
                continue
    except asyncio.TimeoutError:
        pass
    finally:
        for t in tasks:
            if not t.done():
                t.cancel()
    return None


async def _try_groq(prompt: str, system: str, model: str) -> Optional[str]:
    if not GROQ_API_KEY:
        return None
    try:
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})
        payload = {
            "model": model or GROQ_MODEL,
            "messages": messages,
            "temperature": 0.7,
            "max_tokens": 2500,
            "response_format": {"type": "json_object"},
        }
        async with httpx.AsyncClient(timeout=25) as client:
            resp = await _post_with_json_fallback(client, GROQ_API_URL, payload, {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {GROQ_API_KEY}",
            }, "groq")
        if resp.status_code == 200:
            data = resp.json()
            content = data.get("choices", [{}])[0].get("message", {}).get("content")
            if content:
                return content
        return None
    except Exception as e:
        print(f"  [groq] {type(e).__name__}: {e}")
        return None


async def _try_nvidia(prompt: str, system: str, model: str) -> Optional[str]:
    if not NVIDIA_API_KEY:
        return None
    try:
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})
        payload = {
            "model": model or NVIDIA_MODEL,
            "messages": messages,
            "temperature": 0.7,
            "max_tokens": 2500,
            "response_format": {"type": "json_object"},
        }
        async with httpx.AsyncClient(timeout=25) as client:
            resp = await _post_with_json_fallback(client, NVIDIA_API_URL, payload, {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {NVIDIA_API_KEY}",
            }, "deepseek")
        if resp.status_code == 200:
            data = resp.json()
            content = data.get("choices", [{}])[0].get("message", {}).get("content")
            if content:
                return content
        return None
    except Exception as e:
        print(f"  [deepseek] {type(e).__name__}: {e}")
        return None


async def _call_ai(prompt: str, system: str = "") -> Optional[str]:
    """Try Cloudflare -> Groq -> NVIDIA. Returns first success."""
    print(f"  [ai] Trying Cloudflare...")
    r = await _try_cloudflare(prompt, system)
    if r:
        return r
    print(f"  [ai] Trying Groq...")
    r = await _try_groq(prompt, system, "")
    if r:
        return r
    print(f"  [ai] Trying NVIDIA/DeepSeek...")
    r = await _try_nvidia(prompt, system, "")
    if r:
        return r
    return None


def _try_parse_ai_output(raw) -> Optional[dict]:
    if not raw:
        return None
    if isinstance(raw, dict):
        return raw
    try:
        return parse_json_safe(raw)
    except Exception as e:
        print(f"  [ai] parse_json_safe failed: {e}")
        return None


def _validate_and_build(data: dict, log_type: str, attack_type: str) -> Optional[dict]:
    """Validate AI response and build a row dict."""
    required = ["title", "story", "task_outline", "log_content", "expected_attack_type", "expected_attacker_ip", "vulnerability_description", "difficulty"]
    for field in required:
        if not data.get(field):
            print(f"  [ai] Missing field: {field}")
            return None

    log_content = data.get("log_content", "")
    if len(log_content) < 200:
        print(f"  [ai] Rejected: log_content too short ({len(log_content)} chars)")
        return None
    line_count = log_content.count('\n') + 1
    if line_count < 20:
        print(f"  [ai] Rejected: log_content has only {line_count} lines")
        return None

    if data["difficulty"] not in ALLOWED_DIFFICULTIES:
        data["difficulty"] = "متوسط"

    hints = data.get("hints") or []
    if isinstance(hints, str):
        try:
            hints = json.loads(hints)
        except Exception:
            hints = []
    if not isinstance(hints, list):
        hints = []

    return {
        "team_role": "blue",
        "log_type": log_type,
        "module": MODULE_BY_LOG_TYPE.get(log_type, "forensics"),
        "title": data["title"],
        "story": data["story"],
        "task_outline": data["task_outline"],
        "log_content": log_content,
        "expected_attack_type": data["expected_attack_type"],
        "expected_attacker_ip": data.get("expected_attacker_ip", ""),
        "expected_timestamp": data.get("expected_timestamp", ""),
        "expected_ioc": data.get("expected_ioc", ""),
        "vulnerability_description": data.get("vulnerability_description", ATTACK_DESCRIPTIONS_AR.get(attack_type, attack_type)),
        "hints": hints,
        "difficulty": data["difficulty"],
        "xp_reward": data.get("xp_reward") or (200 if data["difficulty"] == "قوي" else 150 if data["difficulty"] == "متوسط" else 100),
    }


async def ai_generate_challenge(log_type: str, attack_type: str) -> Optional[dict]:
    """Use AI to generate a log-analysis challenge. 3 rounds of fallback."""
    system = SYSTEM_PROMPT.format(log_type=log_type, attack_type=attack_type)
    base_prompt = f"ولّد سجل {log_type} يحتوي على هجوم {attack_type} وفق الهيكل المطلوب."

    # Round 1
    raw = await _call_ai(base_prompt, system)
    data = _try_parse_ai_output(raw)
    built = _validate_and_build(data, log_type, attack_type) if data else None
    if built:
        return built

    # Round 2: stricter
    retry_prompt = (
        f"CRITICAL: Return ONLY valid JSON, no markdown. Generate a {log_type} log with {attack_type} attack. "
        f"Required keys: title, story, task_outline, log_content (50-200 line log file), vulnerability_description, "
        f"expected_attack_type, expected_attacker_ip, expected_timestamp, expected_ioc, difficulty, hints."
    )
    raw2 = await _call_ai(retry_prompt, system)
    data2 = _try_parse_ai_output(raw2)
    built2 = _validate_and_build(data2, log_type, attack_type) if data2 else None
    if built2:
        return built2

    # Round 3: minimal
    minimal = f"Output JSON only. {{log_type={log_type}, attack={attack_type}}}. Required: title, story, task_outline, log_content (50+ line log), vulnerability_description, expected_attack_type, expected_attacker_ip, expected_timestamp, expected_ioc, difficulty (مبتدئ|متوسط|قوي), hints (3 objects with level,text,xp_cost). Arabic in all text fields."
    raw3 = await _call_ai(minimal, system)
    data3 = _try_parse_ai_output(raw3)
    built3 = _validate_and_build(data3, log_type, attack_type) if data3 else None
    if built3:
        return built3

    print(f"  [ai] All rounds exhausted for {log_type}/{attack_type}")
    return None


# --------------------------------------------------------------------------- #
# 4. DB & Storage Operations
# --------------------------------------------------------------------------- #

async def get_pool_count(team_role: str) -> int:
    if not SUPABASE_ANON_KEY or not SUPABASE_URL:
        return 0
    url = f"{SUPABASE_URL}/rest/v1/{TABLE_NAME}?select=id&team_role=eq.{team_role}"
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, headers=supabase_headers())
            if resp.status_code == 200:
                return len(resp.json())
    except Exception as e:
        print(f"[log-analysis] Error checking pool count: {e}")
    return 0


async def _insert_to_db(row: dict) -> bool:
    if not SUPABASE_ANON_KEY or not SUPABASE_URL:
        return False
    url = f"{SUPABASE_URL}/rest/v1/{TABLE_NAME}"
    headers = supabase_headers(content_type=True)
    headers["Prefer"] = "return=representation"
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(url, json=row, headers=headers)
            if resp.status_code in (200, 201):
                return True
            print(f"  DB insert failed: {resp.status_code} {resp.text[:200]}")
    except Exception as e:
        print(f"  DB insert error: {e}")
    return False


async def _delete_challenge(challenge_id: str):
    if not SUPABASE_ANON_KEY or not SUPABASE_URL:
        return
    url = f"{SUPABASE_URL}/rest/v1/{TABLE_NAME}?id=eq.{challenge_id}"
    try:
        async with httpx.AsyncClient() as client:
            await client.delete(url, headers=supabase_headers())
    except Exception as e:
        print(f"  DB delete error: {e}")


async def _delete_storage_file(storage_path: str):
    if not SUPABASE_ANON_KEY or not SUPABASE_URL or not storage_path:
        return
    url = f"{SUPABASE_URL}/storage/v1/object/{STORAGE_BUCKET}/{storage_path}"
    headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
    }
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            await client.delete(url, headers=headers)
    except Exception as e:
        print(f"  Storage delete error: {e}")


# --------------------------------------------------------------------------- #
# 5. Pool refill & watcher
# --------------------------------------------------------------------------- #

def _seed_for(log_type: str, attack_type: str) -> Optional[dict]:
    """Find a matching seed for the given log_type + attack_type."""
    for seed in _build_seeds():
        if seed["log_type"] == log_type and seed["attack_type"] == attack_type:
            return seed
    # Fallback: any seed for the log type
    for seed in _build_seeds():
        if seed["log_type"] == log_type:
            return seed
    return None


async def _seed_to_row(seed: dict) -> dict:
    """Convert a seed dict to a DB row (upload log to Storage, return row)."""
    challenge_id = str(uuid.uuid4())
    storage_path = f"blue/log-analysis/{challenge_id}.log"
    log_content = seed["log_content"]
    file_size = len(log_content.encode("utf-8"))

    uploaded = await _upload_log_to_storage(storage_path, log_content)
    if not uploaded:
        # Fallback: store content inline in storage_path field with a marker prefix
        storage_path = f"inline://{storage_path}"

    return {
        "id": challenge_id,
        "team_role": "blue",
        "log_type": seed["log_type"],
        "module": MODULE_BY_LOG_TYPE.get(seed["log_type"], "forensics"),
        "title": seed["title"],
        "story": seed["story"],
        "task_outline": seed["task_outline"],
        "storage_path": storage_path,
        "file_size_bytes": file_size,
        "log_metadata": {
            "log_type": seed["log_type"],
            "line_count": log_content.count("\n") + 1,
            "source": "seed",
        },
        "expected_attack_type": seed["expected_attack_type"],
        "expected_attacker_ip": seed.get("expected_attacker_ip"),
        "expected_timestamp": seed.get("expected_timestamp"),
        "expected_ioc": seed.get("expected_ioc"),
        "vulnerability_description": seed["vulnerability_description"],
        "hints": seed.get("hints", []),
        "difficulty": seed["difficulty"],
        "xp_reward": seed.get("xp_reward", 150),
    }


async def _ai_to_row(built: dict, team_role: str = "blue", log_type: str = "") -> dict:
    """Convert AI-built dict to DB row (upload log to Storage).

    Note: `built` contains the raw AI JSON, which includes `log_content` (the
    full log file). We must NOT send that to the DB — it's stored in
    Supabase Storage instead. We pop it and upload it, then build a clean row
    that only has columns present in the log_analysis_challenges table.
    """
    log_content = built.pop("log_content", "")
    challenge_id = str(uuid.uuid4())
    storage_path = f"{team_role}/log-analysis/{challenge_id}.log"
    file_size = len(log_content.encode("utf-8")) if log_content else 0

    uploaded = False
    if log_content:
        uploaded = await _upload_log_to_storage(storage_path, log_content)
    if not log_content or not uploaded:
        # Keep row, mark storage_path as inline marker
        storage_path = f"inline://{storage_path}"

    return {
        "id": challenge_id,
        "team_role": team_role,
        "log_type": log_type or built.get("log_type", "auth"),
        "module": MODULE_BY_LOG_TYPE.get(log_type or built.get("log_type", "auth"), "forensics"),
        "title": built.get("title", ""),
        "story": built.get("story", ""),
        "task_outline": built.get("task_outline", ""),
        "storage_path": storage_path,
        "file_size_bytes": file_size,
        "log_metadata": {
            "log_type": log_type or built.get("log_type", "auth"),
            "line_count": log_content.count("\n") + 1 if log_content else 0,
            "source": "ai",
        },
        "expected_attack_type": built.get("expected_attack_type", ""),
        "expected_attacker_ip": built.get("expected_attacker_ip"),
        "expected_timestamp": built.get("expected_timestamp"),
        "expected_ioc": built.get("expected_ioc"),
        "vulnerability_description": built.get("vulnerability_description", ""),
        "hints": built.get("hints", []),
        "difficulty": built.get("difficulty", "متوسط"),
        "xp_reward": built.get("xp_reward", 150),
    }


async def refill_pool(team_role: str, count: int) -> int:
    """Refill the pool to POOL_TARGET. Generates `count` challenges IN PARALLEL.

    Pool model:
    - POOL_TARGET = 5 (max)
    - POOL_THRESHOLD = 2 (refill when at or below)
    - POOL_BATCH = 3 (add this many per refill cycle)

    When the watcher detects count <= 2, it calls refill_pool(team, 3) which
    spawns 3 parallel AI generations + DB inserts in one batch.
    """
    if _AI_BACKOFF_UNTIL.get(team_role, 0) > time.time():
        print(f"[log-analysis] {team_role} in AI backoff, using seeds only")
        return await _refill_with_seeds_only(team_role, count)

    base_count = await get_pool_count(team_role)
    needed = max(0, POOL_TARGET - base_count)
    target = min(count, needed)
    if target <= 0:
        return 0

    async def _gen_one(i: int) -> bool:
        log_type, attack_type = _pick_rotation_slot(base_count + i)
        built = None
        try:
            built = await ai_generate_challenge(log_type, attack_type)
        except Exception as e:
            print(f"  [log-analysis] AI exception: {e}")

        if built:
            row = await _ai_to_row(built, team_role=team_role, log_type=log_type)
            if await _insert_to_db(row):
                print(f"    [+] Inserted AI: {row['title']}")
                return True

        # Fallback to seed
        seed = _seed_for(log_type, attack_type)
        if seed:
            row = await _seed_to_row(seed)
            if await _insert_to_db(row):
                print(f"    [+] Inserted seed: {row['title']}")
                return True
        return False

    # Generate all target challenges in parallel
    results = await asyncio.gather(*[_gen_one(i) for i in range(target)])
    return sum(1 for r in results if r)


async def _refill_with_seeds_only(team_role: str, count: int) -> int:
    inserted = 0
    seeds = _build_seeds()
    for i in range(count):
        seed = seeds[i % len(seeds)]
        row = await _seed_to_row(seed)
        if await _insert_to_db(row):
            print(f"    [+] Inserted seed (backoff): {row['title']}")
            inserted += 1
    return inserted


async def start_pool_watcher(team_role: str):
    """Background watcher — keeps the pool at POOL_TARGET (5) for {team_role}.

    Pool model (per AGENTS.md + user spec):
    - POOL_TARGET = 5 (max)
    - POOL_THRESHOLD = 2 (refill when at or below)
    - POOL_BATCH = 3 (add this many per refill)

    On startup: pre-warm pool to POOL_TARGET with seeds.
    On every check: if count <= 2, spawn 3 parallel AI generations.
    """
    print(f"[log-analysis] Pool watcher started for {team_role} (target={POOL_TARGET}, threshold={POOL_THRESHOLD}, batch={POOL_BATCH})")

    # Pre-warm at startup
    try:
        current = await get_pool_count(team_role)
        if current < POOL_TARGET:
            print(f"[log-analysis] Pre-warming pool ({current} → {POOL_TARGET})...")
            added = await _refill_with_seeds_only(team_role, POOL_TARGET - current)
            print(f"[log-analysis] Pre-warm done: +{added} seed challenges")
    except Exception as e:
        print(f"[log-analysis] Pre-warm failed: {e}")

    while True:
        try:
            count = await get_pool_count(team_role)
            if count <= POOL_THRESHOLD:
                print(f"[log-analysis] Pool at {count}/{POOL_TARGET} (≤ {POOL_THRESHOLD}), refilling {POOL_BATCH} via AI...")
                added = await refill_pool(team_role, POOL_BATCH)
                print(f"[log-analysis] Refill done: +{added} (now {count + added}/{POOL_TARGET})")
                await asyncio.sleep(2)
            else:
                await asyncio.sleep(30)
        except Exception as e:
            print(f"[log-analysis] Watcher error: {e}")
            await asyncio.sleep(10)


# --------------------------------------------------------------------------- #
# 6. CLI
# --------------------------------------------------------------------------- #

def main():
    parser = argparse.ArgumentParser(description="Log Analysis Challenge Generator")
    parser.add_argument("--team", default="blue", choices=["blue"])
    parser.add_argument("--seed-only", action="store_true", help="Only insert seeds, no AI")
    parser.add_argument("--ai", action="store_true", help="Generate via AI")
    parser.add_argument("--count", type=int, default=1)
    args = parser.parse_args()

    async def _run():
        if args.seed_only:
            seeds = _build_seeds()
            for seed in seeds[:args.count]:
                row = await _seed_to_row(seed)
                ok = await _insert_to_db(row)
                print(f"  {'[+]' if ok else '[-]'} Seed: {row['title']}")
        elif args.ai:
            for i in range(args.count):
                log_type, attack_type = _pick_rotation_slot(i)
                print(f"  Generating: {log_type} / {attack_type}")
                built = await ai_generate_challenge(log_type, attack_type)
                if built:
                    row = await _ai_to_row(built)
                    ok = await _insert_to_db(row)
                    print(f"  {'[+]' if ok else '[-]'} AI: {row['title']}")
                else:
                    seed = _seed_for(log_type, attack_type)
                    if seed:
                        row = await _seed_to_row(seed)
                        ok = await _insert_to_db(row)
                        print(f"  {'[+]' if ok else '[-]'} Seed fallback: {row['title']}")

    asyncio.run(_run())


if __name__ == "__main__":
    main()
