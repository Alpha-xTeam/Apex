"""
code_fixing_generator.py
========================
Generates fully-realized code-fixing challenges for the CyberArena Blue Team pool.

Architecture:
    main.py watcher  (polls code_fixing_challenges count)
            |
            v
    refill_pool(team_role, count)  -->  ai_generate_challenge()
            |                              |
            |                              v
            |                       AI generates vulnerable code
            |                              |
            |                              v
            |                       ChallengeBuilder produces DB row
            v
        insert_to_db()  <-----  Challenge row
            |
            v
    public.code_fixing_challenges

Public API (used by main.py):
    - POOL_TARGET = 5
    - POOL_THRESHOLD = 2
    - POOL_BATCH = 3
    - get_pool_count(team_role) -> int
    - async refill_pool(team_role, count) -> int
    - async start_pool_watcher(team_role)

CLI:
    python code_fixing_generator.py --team blue --seed-only
    python code_fixing_generator.py --team blue --ai --count 1
"""
from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import os
import random
import re
import sys
import time
from dataclasses import dataclass, field
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


# --------------------------------------------------------------------------- #
# 0. Constants
# --------------------------------------------------------------------------- #

ALLOWED_LANGUAGES = ("C++", "JAVA", "PYTHON", "JAVASCRIPT", "PHP", "RUST")
ALLOWED_DIFFICULTIES = ("مبتدئ", "متوسط", "قوي")
ALLOWED_TEAMS = ("blue",)

# Vulnerability types per language
VULN_TYPES_BY_LANGUAGE = {
    "C++": {
        "buffer-overflow": "Hijacking stack-based buffer overflow",
        "use-after-free": "Use-After-Free dangling pointer",
        "format-string": "Format string vulnerability",
        "integer-overflow": "Integer overflow leading to buffer size miscalculation",
    },
    "JAVA": {
        "sql-injection": "SQL Injection via string concatenation",
        "path-traversal": "Path Traversal via unsanitized user input",
        "unsafe-deserialization": "Unsafe Deserialization of untrusted data",
        "xss": "Cross-Site Scripting via unsanitized output",
    },
    "PYTHON": {
        "sql-injection": "SQL Injection via f-string / format",
        "command-injection": "Command Injection via os.system / subprocess",
        "pickle-deserialization": "Pickle Deserialization of untrusted data",
        "path-traversal": "Path Traversal via open() with user input",
    },
    "JAVASCRIPT": {
        "xss": "Cross-Site Scripting via innerHTML / eval",
        "prototype-pollution": "Prototype Pollution via merge/extend",
        "redos": "Regular Expression Denial of Service (ReDoS)",
        "path-traversal": "Path Traversal in file system operations",
    },
    "PHP": {
        "sql-injection": "SQL Injection via mysql_query / string concat",
        "file-inclusion": "Local File Inclusion via include/require",
        "command-injection": "Command Injection via exec / system / shell_exec",
        "type-juggling": "Type Juggling loose comparison bypass",
    },
    "RUST": {
        "unsafe-block": "Unsafe block bypassing borrow checker safety",
        "unwrap-panic": "Unwrap panic on None/Err causing DoS",
        "integer-overflow": "Integer overflow in release mode",
    },
}

# Module names for each vulnerability
MODULE_BY_VULN = {
    "buffer-overflow": "systems-security",
    "use-after-free": "systems-security",
    "format-string": "systems-security",
    "integer-overflow": "systems-security",
    "sql-injection": "web-security",
    "path-traversal": "web-security",
    "unsafe-deserialization": "web-security",
    "xss": "web-security",
    "pickle-deserialization": "web-security",
    "command-injection": "web-security",
    "prototype-pollution": "web-security",
    "redos": "web-security",
    "file-inclusion": "web-security",
    "type-juggling": "web-security",
    "unsafe-block": "systems-security",
    "unwrap-panic": "systems-security",
}

# Rotation: cycles through (language, vuln_type) pairs
VULN_ROTATION = []
for lang, vulns in VULN_TYPES_BY_LANGUAGE.items():
    for vuln_key in vulns:
        VULN_ROTATION.append((lang, vuln_key))

# Pool constants
POOL_TARGET = 5
POOL_THRESHOLD = 2
POOL_BATCH = 3

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")

# Primary AI: Cloudflare Workers AI
CLOUDFLARE_API_TOKEN = os.environ.get("CLOUDFLARE_API_TOKEN", "")
CLOUDFLARE_ACCOUNT_ID = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "")
CLOUDFLARE_MODEL = os.environ.get("CLOUDFLARE_MODEL", "@cf/meta/llama-3.3-70b-instruct-fp8-fast")

# Fallback list — tried in order if the primary model 404s or errors.
# 8B llama is LAST because it's the only one "verified working" but weak (no response_format, sometimes truncates).
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

TABLE_NAME = "code_fixing_challenges"

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
    # Match "key": "value" with proper string boundary detection
    # Value can contain escaped quotes (\"), newlines (\n), tabs, etc.
    pattern = rf'"{re.escape(key)}"\s*:\s*"((?:[^"\\]|\\.)*)"'
    match = re.search(pattern, text, re.DOTALL)
    if match:
        value = match.group(1)
        # Unescape common sequences
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
    """Robustly parse LLM JSON output, tolerating markdown fences, trailing commas, etc.
    Accepts both string and dict — if a dict is passed (some providers auto-parse),
    returns it directly after validation.
    """
    if raw is None or raw == "":
        raise ValueError("Empty response from model")
    if isinstance(raw, dict):
        return raw
    if not isinstance(raw, str):
        raise ValueError(f"Expected str or dict, got {type(raw).__name__}")

    cleaned = raw.strip()

    cleaned = raw.strip()

    # 1) Strip markdown code fences
    fence_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", cleaned, re.IGNORECASE)
    if fence_match:
        cleaned = fence_match.group(1).strip()

    # 2) Locate outermost JSON object
    start = cleaned.find("{")
    if start == -1:
        raise ValueError(f"No JSON object found. Raw: {cleaned[:200]}")
    end = _find_matching_bracket(cleaned, start, "{", "}")
    if end is None:
        # Fallback: take last }
        end = cleaned.rfind("}")
        if end == -1 or end <= start:
            raise ValueError(f"Unbalanced JSON braces. Raw: {cleaned[:200]}")
    cleaned = cleaned[start:end + 1]

    # 3) Remove control characters
    cleaned = re.sub(r"[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]", "", cleaned)

    # 4) Try strict parse first
    try:
        return json.loads(cleaned, strict=False)
    except json.JSONDecodeError:
        pass

    # 5) Fix common LLM JSON bugs and retry
    fixed = cleaned
    # Remove trailing commas
    fixed = re.sub(r',\s*([}\]])', r'\1', fixed)
    # Fix unquoted keys (word followed by :)
    fixed = re.sub(r'(?<!")(\b[A-Za-z_][A-Za-z0-9_]*\b)(\s*:)', r'"\1"\2', fixed)
    # Convert single-quoted strings to double-quoted (carefully)
    fixed = re.sub(r"'([^'\\]*(?:\\.[^'\\]*)*)'", lambda m: '"' + m.group(1).replace('"', '\\"') + '"', fixed)

    try:
        return json.loads(fixed, strict=False)
    except json.JSONDecodeError:
        pass

    # 6) Last resort: extract each field individually with multi-line aware regex
    result: dict = {}
    for key in ("title", "story", "task_outline", "vulnerable_code",
                "vulnerability_description", "difficulty"):
        val = _extract_string_value(cleaned, key)
        if val is not None:
            result[key] = val

    # Extract hints array using balanced bracket matching
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
                    # Fix trailing commas in hints and retry
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
    return VULN_ROTATION[i % len(VULN_ROTATION)]


# --------------------------------------------------------------------------- #
# 2. Curated Seeds
# --------------------------------------------------------------------------- #

def _build_seeds() -> list[dict]:
    """Return a list of curated seed challenges for the pool."""
    seeds = [
        # --- PYTHON ---
        {
            "language": "PYTHON",
            "vulnerability_type": "sql-injection",
            "module": "web-security",
            "title": "إصلاح ثغرة SQL Injection في كود Python",
            "story": "لديك تطبيق ويب يستخدم قاعدة بيانات SQLite لتخزين بيانات المستخدمين. المطور استخدم تنسيق النصوص مباشرة في الاستعلام بدون parameterized queries، مما يسمح بحقن SQL خبيث.",
            "task_outline": "راجع الكود المصدري أدناه وحدد ثغرة SQL Injection. صحّح الكود باستخدام parameterized queries (مثلاً cursor.execute('SELECT * FROM users WHERE username = ?', (username,))) بدلاً من f-string أو format().",
            "vulnerable_code": """import sqlite3

def get_user(username):
    conn = sqlite3.connect('app.db')
    cursor = conn.cursor()
    
    # !! SQL Injection vulnerability: user input is directly interpolated
    query = f"SELECT * FROM users WHERE username = '{username}'"
    cursor.execute(query)
    
    result = cursor.fetchone()
    conn.close()
    return result

# Example usage
user_input = input("Enter username: ")
user = get_user(user_input)
print(user)""",
            "vulnerability_type": "sql-injection",
            "vulnerability_description": "The query is built using f-string interpolation, allowing an attacker to inject SQL like `' OR '1'='1' --` to bypass authentication or dump the database.",
            "difficulty": "مبتدئ",
            "xp_reward": 150,
            "hints": [
                {"level": 1, "text": "استخدم cursor.execute() مع parameterized query بدلاً من f-string", "xp_cost": 20},
                {"level": 2, "text": "النمط الصحيح: cursor.execute('SELECT ... WHERE col = ?', (value,))", "xp_cost": 40},
            ],
        },
        {
            "language": "PYTHON",
            "vulnerability_type": "command-injection",
            "module": "web-security",
            "title": "إصلاح ثغرة Command Injection في Python",
            "story": "أداة إدارية تقوم بعمل ping لعنوان IP يدخله المستخدم لفحص الاتصال. المطور استخدم os.system() مع دمج النص مباشرة.",
            "task_outline": "اكتب كوداً آمناً يستخدم subprocess.run() بدلاً من os.system()، ويتحقق من أن المدخل IP صالح (أرقام ونقاط فقط) قبل التنفيذ.",
            "vulnerable_code": """import os

def ping_host(ip_address):
    # !! Command Injection: unsanitized input passed to shell
    command = f"ping -c 4 {ip_address}"
    os.system(command)

# User input
target = input("Enter IP to ping: ")
ping_host(target)""",
            "vulnerability_type": "command-injection",
            "vulnerability_description": "os.system() executes the command via the shell. An attacker can inject `; rm -rf /` or `$(malicious_command)` to execute arbitrary commands.",
            "difficulty": "متوسط",
            "xp_reward": 200,
            "hints": [
                {"level": 1, "text": "استخدم subprocess.run() مع shell=False", "xp_cost": 20},
                {"level": 2, "text": "تحقق من صحة المدخل: re.match(r'^[0-9.]+$', ip)", "xp_cost": 40},
            ],
        },
        {
            "language": "PYTHON",
            "vulnerability_type": "pickle-deserialization",
            "module": "web-security",
            "title": "إصلاح ثغرة Pickle Deserialization",
            "story": "تطبيق يُخزّن جلسات المستخدمين في ملفات pickle. عند قراءة الجلسة، يتم استخدام pickle.loads() مباشرة على البيانات المحملة من ملف غير موثوق.",
            "task_outline": "استبدل pickle.loads() بآمن JSON أو استخدم hashlib للتحقق من سلامة البيانات قبل التحميل.",
            "vulnerable_code": """import pickle
import os

def load_session(session_file):
    with open(session_file, 'rb') as f:
        # !! Unsafe deserialization: pickle.loads on untrusted data
        data = pickle.loads(f.read())
    return data

def save_session(session_file, data):
    with open(session_file, 'wb') as f:
        pickle.dump(data, f)

# Load session
session = load_session('user_session.pkl')
print(session)""",
            "vulnerability_type": "pickle-deserialization",
            "vulnerability_description": "pickle.loads() can execute arbitrary code during deserialization. An attacker can craft a malicious pickle file that runs OS commands when loaded.",
            "difficulty": "قوي",
            "xp_reward": 250,
            "hints": [
                {"level": 1, "text": "استبدل pickle بـ json.dumps/loads لتخزين آمن", "xp_cost": 20},
                {"level": 2, "text": "إذا كنت تحتاج pickle، تحقق من HMAC قبل التحميل", "xp_cost": 40},
            ],
        },
        # --- JAVA ---
        {
            "language": "JAVA",
            "vulnerability_type": "sql-injection",
            "module": "web-security",
            "title": "إصلاح ثغرة SQL Injection في Java",
            "story": "تطبيق ويب جافا يستخدم JDBC للاتصال بقاعدة البيانات. الاستعلام يُبنى بـ StringBuilder مع محاذاة النص مباشرة.",
            "task_outline": "استبدل String concatenation بـ PreparedStatement مع parameterized query.",
            "vulnerable_code": """import java.sql.*;

public class UserManager {
    public static User findUser(String username, String password) {
        Connection conn = null;
        try {
            conn = DriverManager.getConnection("jdbc:mysql://localhost/app", "root", "pass");
            Statement stmt = conn.createStatement();
            
            // !! SQL Injection: user input directly concatenated into query
            String query = "SELECT * FROM users WHERE username = '" + username 
                          + "' AND password = '" + password + "'";
            
            ResultSet rs = stmt.executeQuery(query);
            if (rs.next()) {
                return new User(rs.getString("username"), rs.getString("email"));
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
        return null;
    }
}""",
            "vulnerability_type": "sql-injection",
            "vulnerability_description": "String concatenation in SQL query allows injection. An attacker can bypass authentication with `' OR '1'='1'` as password.",
            "difficulty": "متوسط",
            "xp_reward": 200,
            "hints": [
                {"level": 1, "text": "استخدم PreparedStatement بدلاً من Statement", "xp_cost": 20},
                {"level": 2, "text": "النمط: PreparedStatement ps = conn.prepareStatement('SELECT ... WHERE username = ? AND password = ?')", "xp_cost": 40},
            ],
        },
        {
            "language": "JAVA",
            "vulnerability_type": "path-traversal",
            "module": "web-security",
            "title": "إصلاح ثغرة Path Traversal في Java",
            "story": "خادم ويب يسمح بتحميل ملفات من مجلد معين باستخدام اسم الملف من الطلب.",
            "task_outline": "أضف تحقق من أن المسار الناتج لا يتجاوز المجلد المحدد باستخدام Path.normalize() و startsWith().",
            "vulnerable_code": """import java.io.*;
import java.nio.file.*;

public class FileServer {
    public static byte[] getFile(String filename) throws IOException {
        // !! Path Traversal: no validation on filename
        String basePath = "/var/www/uploads/";
        String fullPath = basePath + filename;
        
        return Files.readAllBytes(Paths.get(fullPath));
    }
    
    // Example: getFile("../../../etc/passwd") reads system files
}""",
            "vulnerability_type": "path-traversal",
            "vulnerability_description": "No validation on filename allows `../../../etc/passwd` to read system files outside the uploads directory.",
            "difficulty": "مبتدئ",
            "xp_reward": 150,
            "hints": [
                {"level": 1, "text": "استخدم Paths.get(basePath, filename).normalize()", "xp_cost": 20},
                {"level": 2, "text": "تحقق: resolved.startsWith(Paths.get(basePath))", "xp_cost": 40},
            ],
        },
        # --- C++ ---
        {
            "language": "C++",
            "vulnerability_type": "buffer-overflow",
            "module": "systems-security",
            "title": "إصلاح ثغرة Buffer Overflow في C++",
            "story": "دالة تقرأ مدخلات المستخدم إلى مخزن ثابت الحجم بدون التحقق من الطول.",
            "task_outline": "استبدل المخزن الثابت بـ std::string أو أضف تحقق من طول المدخلات قبل النسخ.",
            "vulnerable_code": """#include <iostream>
#include <cstring>

void process_input() {
    char buffer[64];  // Fixed-size buffer
    
    std::cout << "Enter your name: ";
    // !! Buffer Overflow: no bounds checking on input
    std::cin.getline(buffer, 256);  // Can write up to 256 bytes into 64-byte buffer
    
    std::cout << "Hello, " << buffer << std::endl;
}

int main() {
    process_input();
    return 0;
}""",
            "vulnerability_type": "buffer-overflow",
            "vulnerability_description": "std::cin.getline with limit 256 but buffer is only 64 bytes. Input longer than 63 chars overflows the buffer, potentially overwriting return address.",
            "difficulty": "متوسط",
            "xp_reward": 200,
            "hints": [
                {"level": 1, "text": "استخدم std::string بدلاً من char[]", "xp_cost": 20},
                {"level": 2, "text": "أو عدّل الحد الأقصى: std::cin.getline(buffer, sizeof(buffer))", "xp_cost": 40},
            ],
        },
        {
            "language": "C++",
            "vulnerability_type": "format-string",
            "module": "systems-security",
            "title": "إصلاح ثغرة Format String في C++",
            "story": "دالة تسجل رسائل باستخدام printf مع نص من المستخدم مباشرة.",
            "task_outline": "غيّر printf(user_input) إلى printf('%s', user_input) لمنع حقن Formatters.",
            "vulnerable_code": """#include <cstdio>
#include <cstring>

void log_message(char *user_msg) {
    // !! Format String vulnerability: user input used as format string
    printf(user_msg);
}

int main() {
    char input[256];
    std::cout << "Enter log message: ";
    std::cin.getline(input, sizeof(input));
    
    log_message(input);
    return 0;
}""",
            "vulnerability_type": "format-string",
            "vulnerability_description": "printf with user-controlled format string allows `%x`, `%n` to read/write stack memory. Attacker can leak stack data or overwrite memory.",
            "difficulty": "قوي",
            "xp_reward": 250,
            "hints": [
                {"level": 1, "text": "غيّر printf(user_msg) إلى printf('%s', user_msg)", "xp_cost": 20},
                {"level": 2, "text": "أو استخدم std::cout بدلاً من printf", "xp_cost": 40},
            ],
        },
        # --- JAVASCRIPT ---
        {
            "language": "JAVASCRIPT",
            "vulnerability_type": "xss",
            "module": "web-security",
            "title": "إصلاح ثغرة XSS في JavaScript",
            "story": "تطبيق ويب يعرض تعليقات المستخدمين باستخدام innerHTML مباشرة.",
            "task_outline": "استبدل innerHTML بـ textContent لمنع تنفيذ JavaScript في التعليقات.",
            "vulnerable_code": """function displayComment(comment) {
    const container = document.getElementById('comments');
    
    // !! XSS vulnerability: user input rendered as HTML
    const div = document.createElement('div');
    div.innerHTML = comment;  // <script>alert('XSS')</script> executes!
    
    container.appendChild(div);
}

// Example: comment = '<img src=x onerror=alert(document.cookie)>'
displayComment(userComment);""",
            "vulnerability_type": "xss",
            "vulnerability_description": "innerHTML parses HTML tags. An attacker can inject `<script>`, `<img onerror=...>`, or event handlers to steal cookies/session tokens.",
            "difficulty": "مبتدئ",
            "xp_reward": 150,
            "hints": [
                {"level": 1, "text": "استبدل innerHTML بـ textContent", "xp_cost": 20},
                {"level": 2, "text": "textContent يعرض النص كما هو بدون تفسير HTML", "xp_cost": 40},
            ],
        },
        {
            "language": "JAVASCRIPT",
            "vulnerability_type": "prototype-pollution",
            "module": "web-security",
            "title": "إصلاح ثغرة Prototype Pollution",
            "story": "دالة merge تدمج كائنات بشكل عميق لكنها تسمح بتعديل prototype.",
            "task_outline": "أضف تحقق من أن المفاتيح ليست '__proto__', 'constructor', أو 'prototype' قبل الدمج.",
            "vulnerable_code": """function merge(target, source) {
    for (let key in source) {
        // !! Prototype Pollution: no check on __proto__
        if (typeof source[key] === 'object' && source[key] !== null) {
            target[key] = merge(target[key] || {}, source[key]);
        } else {
            target[key] = source[key];
        }
    }
    return target;
}

// Attacker payload:
// merge({}, JSON.parse('{"__proto__":{"admin":true}}'))
// Now ({}).admin === true for ALL objects!""",
            "vulnerability_type": "prototype-pollution",
            "vulnerability_description": "Merging user input into objects without checking __proto__ allows attackers to pollute Object.prototype, affecting all objects in the application.",
            "difficulty": "قوي",
            "xp_reward": 250,
            "hints": [
                {"level": 1, "text": "أضف تحقق: if (key === '__proto__' || key === 'constructor') continue", "xp_cost": 20},
                {"level": 2, "text": "استخدم Object.create(null) للكائنات الآمنة", "xp_cost": 40},
            ],
        },
        # --- PHP ---
        {
            "language": "PHP",
            "vulnerability_type": "sql-injection",
            "module": "web-security",
            "title": "إصلاح ثغرة SQL Injection في PHP",
            "story": "تطبيق PHP يستخدم mysqli_query مع نص الاستعلام المبني من مدخلات المستخدم مباشرة.",
            "task_outline": "استبدل الـ prepared statements بـ mysqli_prepare() مع bind_param().",
            "vulnerable_code": """<?php
function login($username, $password) {
    $conn = new mysqli("localhost", "root", "pass", "app_db");
    
    // !! SQL Injection: user input directly in query string
    $query = "SELECT * FROM users WHERE username='$username' AND password='$password'";
    $result = $conn->query($query);
    
    if ($result->num_rows > 0) {
        return $result->fetch_assoc();
    }
    return null;
}

// Attacker: username = admin' OR '1'='1' --
?>""",
            "vulnerability_type": "sql-injection",
            "vulnerability_description": "Direct string interpolation in SQL query allows authentication bypass and data extraction via UNION attacks.",
            "difficulty": "مبتدئ",
            "xp_reward": 150,
            "hints": [
                {"level": 1, "text": "استخدم mysqli_prepare() مع bind_param()", "xp_cost": 20},
                {"level": 2, "text": "النمط: $stmt = $conn->prepare('SELECT ... WHERE username=? AND password=?')", "xp_cost": 40},
            ],
        },
        {
            "language": "PHP",
            "vulnerability_type": "command-injection",
            "module": "web-security",
            "title": "إصلاح ثغرة Command Injection في PHP",
            "story": "أداة مراقبة تستخدم exec() لتنفيذ أوامر ping بناءً على مدخل المستخدم.",
            "task_outline": "استبدل exec() بـ escapeshellarg() للمدخلات، أو استخدم proc_open() مع مصفوفة أوامر.",
            "vulnerable_code": """<?php
function check_server($host) {
    // !! Command Injection: unsanitized input in exec()
    $output = [];
    exec("ping -c 3 " . $host, $output);
    return implode("\\n", $output);
}

$target = $_GET['host'];
echo check_server($target);
// Attacker: ?host=127.0.0.1;rm%20-rf%20/
?>""",
            "vulnerability_type": "command-injection",
            "vulnerability_description": "exec() with user input allows arbitrary command execution. The `;` or `|` operator can chain multiple commands.",
            "difficulty": "متوسط",
            "xp_reward": 200,
            "hints": [
                {"level": 1, "text": "استخدم escapeshellarg() لكل مدخل", "xp_cost": 20},
                {"level": 2, "text": "أو استخدم proc_open() مع مصفوفة أوامر منفصلة", "xp_cost": 40},
            ],
        },
        # --- RUST ---
        {
            "language": "RUST",
            "vulnerability_type": "unsafe-block",
            "module": "systems-security",
            "title": "إصلاح ثغرة Unsafe Block في Rust",
            "story": "كود يستخدم unsafe لتجاوز فحص المقترض (borrow checker) في مكان لا يحتاجه.",
            "task_outline": "أزل unsafe واستخدم القواعد الآمنة في Rust (String, Vec, references).",
            "vulnerable_code": """use std::slice;

fn get_unsafe_ref(data: *const u8, len: usize) -> &'static [u8] {
    // !! Unsafe block: raw pointer dereference without safety guarantees
    unsafe {
        slice::from_raw_parts(data, len)
    }
}

fn main() {
    let vec = vec![1u8, 2, 3, 4, 5];
    let ptr = vec.as_ptr();
    // If vec is dropped, ptr becomes dangling!
    let slice = get_unsafe_ref(ptr, vec.len());
    println!("{:?}", slice);
}""",
            "vulnerability_type": "unsafe-block",
            "vulnerability_description": "Raw pointer dereference in unsafe block can cause undefined behavior if the original data is dropped or moved. Safe Rust alternatives exist.",
            "difficulty": "قوي",
            "xp_reward": 250,
            "hints": [
                {"level": 1, "text": "أزل unsafe واستخدم &data[..] بدلاً من slice::from_raw_parts", "xp_cost": 20},
                {"level": 2, "text": "المرجع الآمن: let slice = &vec[..];", "xp_cost": 40},
            ],
        },
        {
            "language": "RUST",
            "vulnerability_type": "unwrap-panic",
            "module": "systems-security",
            "title": "إصلاح ثغرة Unwrap Panic في Rust",
            "story": "دالة تقرأ ملف وتمتد unwrap() على Result مما قد يسبب انهيار البرنامج.",
            "task_outline": "استبدل unwrap() بـ match أو ? operator للتعامل مع الأخطاء بشكل آمن.",
            "vulnerable_code": """use std::fs;

fn read_config(path: &str) -> String {
    // !! Unwrap panic: crashes on file read error
    let content = fs::read_to_string(path).unwrap();
    content
}

fn main() {
    let config = read_config("config.toml");
    println!("{}", config);
    
    // If file doesn't exist -> PANIC!
    // thread 'main' panicked at 'called `Result::unwrap()` on an `Err`'
}""",
            "vulnerability_type": "unwrap-panic",
            "vulnerability_description": "unwrap() on Result/Option causes panic if value is Err/None. In production, this crashes the server (DoS). Use match, if let, or ? operator.",
            "difficulty": "متوسط",
            "xp_reward": 200,
            "hints": [
                {"level": 1, "text": "استخدم match أو if let بدلاً من unwrap()", "xp_cost": 20},
                {"level": 2, "text": "أو استخدم .unwrap_or_default() أو ? operator", "xp_cost": 40},
            ],
        },
    ]
    return seeds


# --------------------------------------------------------------------------- #
# 3. AI Generation
# --------------------------------------------------------------------------- #

SYSTEM_PROMPT = """You are a cybersecurity expert who generates realistic vulnerable code for training purposes.

Generate a complete, runnable code sample in {language} that contains a clear {vuln_type} vulnerability.

CRITICAL REQUIREMENTS:
1. Respond with ONLY valid JSON. No markdown, no code fences, no explanation before or after.
2. The "vulnerable_code" field MUST be a complete, syntactically correct, fully-implemented program of 30 to 60 lines. It must include all necessary imports, function definitions, and a main entry point. No truncation, no "..." placeholders, no half-written functions.
3. The vulnerability must be intentional, realistic, and clearly exploitable in the code.
4. The "vulnerability_description" must explain the specific flaw and how an attacker could exploit it.
5. The "task_outline" must describe in Arabic what the trainee needs to do to fix the code (without revealing the fix itself).
6. ALL user-facing text fields (title, story, task_outline, vulnerability_description, hints) MUST be written in Arabic ONLY. No English, no Chinese, no other languages. The "vulnerable_code" field contains code in {language} (which is correct), but all comments inside the code should be in English (//, #, etc.) since this is conventional.
7. difficulty must be EXACTLY one of these three Arabic words: "مبتدئ", "متوسط", or "قوي"
8. hints must be a JSON array of exactly 3 objects: [{{"level": 1, "text": "...", "xp_cost": 20}}, {{"level": 2, "text": "...", "xp_cost": 30}}, {{"level": 3, "text": "...", "xp_cost": 50}}]. The first hint should be vague, the second more specific, the third should hint at the actual fix approach.

Return ONLY this exact JSON structure (no other text):
{{"title": "عنوان التحدي بالعربية", "story": "قصة التحدي بالعربية", "task_outline": "المطلوب من المتدرب بالعربية", "vulnerable_code": "الكود الكامل المصاب بالثغرة", "vulnerability_description": "شرح الثغرة بالعربية", "difficulty": "متوسط", "hints": [{{"level": 1, "text": "تلميح أول", "xp_cost": 20}}, {{"level": 2, "text": "تلميح ثاني", "xp_cost": 30}}, {{"level": 3, "text": "تلميح ثالث", "xp_cost": 50}}]}}
"""


async def _post_with_json_fallback(client, url: str, payload: dict, headers: dict, provider_name: str) -> Optional[httpx.Response]:
    """POST a payload with response_format. If the API rejects it (4xx), retry without."""
    resp = await client.post(url, json=payload, headers=headers)
    if resp.status_code in (400, 404, 422) and "response_format" in payload:
        print(f"  [{provider_name}] response_format not supported ({resp.status_code}), retrying without...")
        payload2 = {k: v for k, v in payload.items() if k != "response_format"}
        resp = await client.post(url, json=payload2, headers=headers)
    return resp


async def _try_cloudflare(prompt: str, system: str) -> Optional[str]:
    """Try Cloudflare Workers AI. Cycles through multiple models until one works.
    Returns raw text on success, None if all models fail.
    """
    if not (CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID):
        return None
    import httpx as _httpx

    # Try primary model first, then fallbacks
    model_candidates = [CLOUDFLARE_MODEL] + [m for m in CLOUDFLARE_MODEL_FALLBACKS if m != CLOUDFLARE_MODEL]

    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    payload_base = {
        "messages": messages,
        "temperature": 0.7,
        "max_tokens": 4096,
    }

    for model_name in model_candidates:
        url = f"https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/ai/run/{model_name}"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {CLOUDFLARE_API_TOKEN}",
        }
        payload = {**payload_base, "response_format": {"type": "json_object"}}
        try:
            async with _httpx.AsyncClient(timeout=120) as client:
                resp = await _post_with_json_fallback(client, url, payload, headers, f"cloudflare/{model_name.split('/')[-1]}")
            if resp.status_code == 200:
                result = resp.json()
                if result.get("success") and result.get("result", {}).get("response"):
                    return result["result"]["response"]
                print(f"  [cloudflare/{model_name.split('/')[-1]}] 200 but no response field")
                continue
            if resp.status_code == 429:
                print(f"  [cloudflare/{model_name.split('/')[-1]}] 429 rate-limited")
                continue
            # Any other error -> try next model
            print(f"  [cloudflare/{model_name.split('/')[-1]}] error {resp.status_code}: {resp.text[:120]}")
        except Exception as e:
            print(f"  [cloudflare/{model_name.split('/')[-1]}] exception: {type(e).__name__}: {e}")
            continue

    return None


async def _try_groq(prompt: str, system: str, model: str) -> Optional[str]:
    """Try Groq API. Returns raw text on success, None on failure."""
    if not GROQ_API_KEY:
        return None
    import httpx as _httpx
    try:
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {GROQ_API_KEY}",
        }
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})
        payload = {
            "model": model or GROQ_MODEL,
            "messages": messages,
            "temperature": 0.7,
            "max_tokens": 4096,
            "response_format": {"type": "json_object"},
        }
        async with _httpx.AsyncClient(timeout=90) as client:
            resp = await _post_with_json_fallback(client, GROQ_API_URL, payload, headers, "groq")
        if resp.status_code == 200:
            data = resp.json()
            content = data.get("choices", [{}])[0].get("message", {}).get("content")
            if content:
                return content
            print(f"  [groq] 200 but empty content: {str(data)[:200]}")
            return None
        if resp.status_code == 429:
            print(f"  [groq] 429 rate-limited")
        else:
            print(f"  [groq] error {resp.status_code}: {resp.text[:200]}")
        return None
    except Exception as e:
        print(f"  [groq] exception: {type(e).__name__}: {e}")
        return None


async def _try_nvidia(prompt: str, system: str, model: str) -> Optional[str]:
    """Try NVIDIA/DeepSeek API. Returns raw text on success, None on failure."""
    if not NVIDIA_API_KEY:
        return None
    import httpx as _httpx
    try:
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {NVIDIA_API_KEY}",
        }
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})
        payload = {
            "model": model or NVIDIA_MODEL,
            "messages": messages,
            "temperature": 0.7,
            "max_tokens": 4096,
            "response_format": {"type": "json_object"},
        }
        async with _httpx.AsyncClient(timeout=90) as client:
            resp = await _post_with_json_fallback(client, NVIDIA_API_URL, payload, headers, "deepseek")
        if resp.status_code == 200:
            data = resp.json()
            content = data.get("choices", [{}])[0].get("message", {}).get("content")
            if content:
                return content
            print(f"  [deepseek] 200 but empty content: {str(data)[:200]}")
            return None
        if resp.status_code == 429:
            print(f"  [deepseek] 429 rate-limited")
        else:
            print(f"  [deepseek] error {resp.status_code}: {resp.text[:200]}")
        return None
    except Exception as e:
        print(f"  [deepseek] exception: {type(e).__name__}: {e}")
        return None


async def _call_ai(prompt: str, system: str = "", model: str = "") -> Optional[str]:
    """Try providers in strict order: Cloudflare -> Groq -> NVIDIA/DeepSeek.
    Returns the first valid response, or None if all fail.
    Each provider must return successfully; the call to parse_json_safe happens later.
    """
    print(f"  [ai] Trying Cloudflare...")
    r = await _try_cloudflare(prompt, system)
    if r:
        return r
    print(f"  [ai] Trying Groq...")
    r = await _try_groq(prompt, system, model)
    if r:
        return r
    print(f"  [ai] Trying NVIDIA/DeepSeek...")
    r = await _try_nvidia(prompt, system, model)
    if r:
        return r
    print(f"  [ai] All 3 providers failed")
    return None


async def ai_generate_challenge(language: str, vuln_type: str) -> Optional[dict]:
    """Use AI to generate a code-fixing challenge.
    Strategy: try each provider until one produces a fully valid challenge.
    If parse fails on all, retry once with a stricter prompt via all providers.
    """
    system = SYSTEM_PROMPT.format(language=language, vuln_type=vuln_type)
    base_prompt = f"ولّد كود {language} يحتوي على ثغرة {vuln_type} وفق الهيكل المطلوب."

    # Round 1: normal prompt
    raw = await _call_ai(base_prompt, system)
    data = _try_parse_ai_output(raw)
    built = _validate_and_build(data, language, vuln_type) if data else None
    if built:
        return built

    # Round 2: stricter retry — go through all providers again with explicit JSON-only demand
    retry_prompt = (
        f"CRITICAL: Return ONLY valid JSON, no markdown, no code fences, no comments. "
        f"Generate a complete 30-60 line {language} program with a {vuln_type} vulnerability. "
        f"Return exactly this structure with Arabic in all string fields:\n"
        f'{{"title":"...","story":"...","task_outline":"...","vulnerable_code":"...","vulnerability_description":"...","difficulty":"متوسط","hints":[{{"level":1,"text":"...","xp_cost":20}},{{"level":2,"text":"...","xp_cost":30}},{{"level":3,"text":"...","xp_cost":50}}]}}'
    )
    print(f"  [ai] Round 2: retrying with stricter prompt")
    raw2 = await _call_ai(retry_prompt, system)
    data2 = _try_parse_ai_output(raw2)
    built2 = _validate_and_build(data2, language, vuln_type) if data2 else None
    if built2:
        return built2

    # Round 3: ultra-minimal English-only retry (some models follow English instructions more reliably)
    minimal_prompt = f"Output JSON only. {{language={language}, vuln={vuln_type}}}. Required keys: title, story, task_outline, vulnerable_code (complete 30-60 line program), vulnerability_description, difficulty (مبتدئ|متوسط|قوي), hints (array of 3 objects with level,text,xp_cost). No markdown. No commentary."
    print(f"  [ai] Round 3: minimal retry")
    raw3 = await _call_ai(minimal_prompt, system)
    data3 = _try_parse_ai_output(raw3)
    built3 = _validate_and_build(data3, language, vuln_type) if data3 else None
    if built3:
        return built3

    print(f"  [ai] All rounds exhausted for {language}/{vuln_type}")
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


def _validate_and_build(data: dict, language: str, vuln_type: str) -> Optional[dict]:
    # Validate required fields
    required = ["title", "story", "task_outline", "vulnerable_code", "vulnerability_description", "difficulty"]
    for field in required:
        if not data.get(field):
            print(f"  [ai] Missing field: {field}")
            return None

    # Reject truncated or suspiciously short code
    vcode = data.get("vulnerable_code", "")
    if len(vcode) < 200:
        print(f"  [ai] Rejected: vulnerable_code too short ({len(vcode)} chars). Falling back to seed.")
        return None
    line_count = vcode.count('\n') + 1
    if line_count < 10:
        print(f"  [ai] Rejected: vulnerable_code has only {line_count} lines. Falling back to seed.")
        return None

    if data["difficulty"] not in ALLOWED_DIFFICULTIES:
        data["difficulty"] = "متوسط"

    # Coerce hints
    hints = data.get("hints") or []
    if isinstance(hints, str):
        try:
            hints = json.loads(hints)
        except Exception:
            hints = []
    if not isinstance(hints, list):
        hints = []

    vuln_desc = VULN_TYPES_BY_LANGUAGE.get(language, {}).get(vuln_type, vuln_type)

    return {
        "team_role": "blue",
        "language": language,
        "module": MODULE_BY_VULN.get(vuln_type, "web-security"),
        "title": data["title"],
        "story": data["story"],
        "task_outline": data["task_outline"],
        "vulnerable_code": data["vulnerable_code"],
        "vulnerability_type": vuln_type,
        "vulnerability_description": data.get("vulnerability_description", vuln_desc),
        "hints": hints,
        "difficulty": data["difficulty"],
        "xp_reward": data.get("xp_reward") or (200 if data["difficulty"] == "قوي" else 150 if data["difficulty"] == "متوسط" else 100),
    }


# --------------------------------------------------------------------------- #
# 4. DB Operations
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
        print(f"[code-fixing] Error checking pool count: {e}")
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
            else:
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
        print(f"  Delete error: {e}")


# --------------------------------------------------------------------------- #
# 5. Pool Refill
# --------------------------------------------------------------------------- #

async def refill_pool(team_role: str, count: int) -> int:
    """Generate and insert `count` challenges IN PARALLEL. Returns number inserted.

    Pool model: POOL_TARGET=5, THRESHOLD=2, BATCH=3. When the watcher detects
    count <= 2, it calls refill_pool(team, 3) which spawns 3 parallel AI
    generations + DB inserts in one batch.
    """
    if team_role not in ALLOWED_TEAMS:
        return 0

    # Check backoff
    until = _AI_BACKOFF_UNTIL.get(team_role, 0)
    if time.time() < until:
        print(f"  [{team_role}] Backoff active until {until:.0f}, using seeds only")
        seeds = _build_seeds()
        random.shuffle(seeds)
        inserted = 0
        for seed in seeds[:count]:
            if await _insert_to_db(seed):
                inserted += 1
        return inserted

    base_count = await get_pool_count(team_role)
    needed = max(0, POOL_TARGET - base_count)
    target = min(count, needed)
    if target <= 0:
        return 0

    async def _gen_one(i: int) -> bool:
        lang, vuln = _pick_rotation_slot(int(time.time()) + i)
        print(f"  [{team_role}] Generating: {lang} / {vuln}")
        challenge = await ai_generate_challenge(lang, vuln)
        if challenge:
            if await _insert_to_db(challenge):
                print(f"    [+] Inserted AI: {challenge['title']}")
                return True
        # Fallback to seed
        seeds = _build_seeds()
        matching = [s for s in seeds if s["language"] == lang]
        if matching:
            seed = random.choice(matching)
            if await _insert_to_db(seed):
                print(f"    [+] Inserted seed fallback ({lang})")
                return True
        return False

    results = await asyncio.gather(*[_gen_one(i) for i in range(target)])
    return sum(1 for r in results if r)


# --------------------------------------------------------------------------- #
# 6. Pool Watcher
# --------------------------------------------------------------------------- #

async def start_pool_watcher(team_role: str):
    """Background watcher — keeps the pool at POOL_TARGET (5) for {team_role}.

    Pool model (per AGENTS.md + user spec):
    - POOL_TARGET = 5 (max)
    - POOL_THRESHOLD = 2 (refill when at or below)
    - POOL_BATCH = 3 (add this many per refill)
    """
    if team_role not in ALLOWED_TEAMS:
        return

    print(f"[code-fixing] Pool watcher started for '{team_role}' (target={POOL_TARGET}, threshold={POOL_THRESHOLD}, batch={POOL_BATCH})")

    # Pre-warm at startup
    try:
        current = await get_pool_count(team_role)
        if current < POOL_TARGET:
            print(f"[code-fixing] Pre-warming pool ({current} → {POOL_TARGET})...")
            added = await _refill_with_seeds_only(team_role, POOL_TARGET - current)
            print(f"[code-fixing] Pre-warm done: +{added} challenges")
    except Exception as e:
        print(f"[code-fixing] Pre-warm failed: {e}")

    while True:
        try:
            count = await get_pool_count(team_role)
            if count <= POOL_THRESHOLD:
                print(f"[code-fixing] Pool at {count}/{POOL_TARGET} (≤ {POOL_THRESHOLD}), refilling {POOL_BATCH} via AI...")
                added = await refill_pool(team_role, POOL_BATCH)
                print(f"[code-fixing] Refill done: +{added} (now {count + added}/{POOL_TARGET})")
                await asyncio.sleep(2)
            else:
                await asyncio.sleep(30)
        except Exception as e:
            print(f"[code-fixing] Watcher error: {e}")
            await asyncio.sleep(10)


# --------------------------------------------------------------------------- #
# 7. CLI
# --------------------------------------------------------------------------- #

def main():
    parser = argparse.ArgumentParser(description="Code Fixing Challenge Generator")
    parser.add_argument("--team", default="blue", choices=["blue"])
    parser.add_argument("--ai", action="store_true", help="Use AI generation")
    parser.add_argument("--count", type=int, default=3, help="Number to generate")
    parser.add_argument("--seed-only", action="store_true", help="Insert seeds only")
    args = parser.parse_args()

    print(f"[code-fixing] Team: {args.team}, Count: {args.count}")

    if args.seed_only:
        seeds = _build_seeds()
        random.shuffle(seeds)
        inserted = 0
        for seed in seeds[:args.count]:
            import asyncio as _aio
            if _aio.run(_insert_to_db(seed)):
                inserted += 1
                print(f"  [+] Inserted seed: {seed['title']}")
        print(f"[code-fixing] Seeded {inserted} challenges")
    elif args.ai:
        inserted = _aio.run(refill_pool(args.team, args.count))
        print(f"[code-fixing] AI generated {inserted} challenges")
    else:
        # Default: run pool watcher
        _aio.run(start_pool_watcher(args.team))


if __name__ == "__main__":
    main()

