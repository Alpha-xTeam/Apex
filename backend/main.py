import os
from dotenv import load_dotenv

# Load env variables relative to main.py
backend_dir = os.path.dirname(os.path.abspath(__file__))
load_dotenv(dotenv_path=os.path.join(backend_dir, ".env"))

import os
import sys
import json
import re
import httpx
import asyncio
import random
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

# Ensure standard UTF-8 console output for lifelong Arabic support on Windows
sys.stdout.reconfigure(encoding='utf-8')

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://yevtnyokixocpihpdwqu.supabase.co")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")

from fastapi.staticfiles import StaticFiles

app = FastAPI(title="CyberArena Backend")

# Mount challenge files to serve them directly to trainees
FILES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "challenge_files")
os.makedirs(FILES_DIR, exist_ok=True)
app.mount("/challenge_files", StaticFiles(directory=FILES_DIR), name="challenge_files")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
SUPABASE_EDGE_URL = f"{SUPABASE_URL}/functions/v1"

FALLBACK_HTML = """<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><style>body{margin:0;padding:40px;font-family:sans-serif;background:#0b0b12;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;text-align:center}h1{color:#00d4aa;font-size:22px;margin-bottom:16px}p{color:rgba(255,255,255,0.6);font-size:14px;line-height:1.8;max-width:500px}</style></head><body><h1>🔐 منصة APEX للتدريب</h1><p>بيئة التدريب التفاعلية جاهزة. اتبع التعليمات في لوحة المهام على اليمين لإكمال التحدي.</p></body></html>"""

MODULE_TOPIC_MAP = {
    "xss": "ثغرات XSS (Cross-Site Scripting) - هجمات الحقن البرمجي في المتصفح",
    "sql-injection": "ثغرات SQL Injection - حقن استعلامات خبيثة في قاعدة البيانات",
    "csrf": "ثغرات CSRF (Cross-Site Request Forgery) - تزوير الطلبات عبر المواقع",
    "auth-bypass": "ثغرات المصادقة - تجاوز أنظمة تسجيل الدخول",
    "misconfig": "التكوين الأمني الخاطئ - إعدادات غير آمنة",
    "packet-analysis": "تحليل حزم الشبكة Network Packet Analysis",
    "firewall": "جدران الحماية Firewall Configuration",
    "scanning": "مسح الشبكات Network Scanning",
    "encryption-basics": "أساسيات التشفير Encryption",
    "hash-cracking": "كسر الهاش Hash Cracking",
    "log-analysis": "تحليل سجلات الخادم Log Analysis",
    "forensics": "الأدلة الرقمية Forensics",
}

CYBER_SECURITY_TOPICS = {
    # 1. Web Security
    "xss": {"name": "ثغرات XSS (Cross-Site Scripting)", "category": "Web Security", "path": "web-security"},
    "sql-injection": {"name": "ثغرات SQL Injection", "category": "Web Security", "path": "web-security"},
    "csrf": {"name": "ثغرات CSRF (Cross-Site Request Forgery)", "category": "Web Security", "path": "web-security"},
    "ssrf": {"name": "ثغرات SSRF (Server-Side Request Forgery)", "category": "Web Security", "path": "web-security"},
    "idor": {"name": "ثغرات IDOR (Insecure Direct Object Reference)", "category": "Web Security", "path": "web-security"},
    "lfi-rfi": {"name": "ثغرات تضمين الملفات LFI/RFI", "category": "Web Security", "path": "web-security"},
    "xxe": {"name": "ثغرات XML External Entity (XXE)", "category": "Web Security", "path": "web-security"},
    "command-injection": {"name": "حقن الأوامر البرمجية Command Injection", "category": "Web Security", "path": "web-security"},
    
    # 2. Network Security
    "packet-analysis": {"name": "تحليل حزم الشبكات Packet Analysis", "category": "Network Security", "path": "network-security"},
    "firewall": {"name": "إعدادات وجدران الحماية Firewall", "category": "Network Security", "path": "network-security"},
    "scanning": {"name": "مسح وتفحص الشبكات Network Scanning", "category": "Network Security", "path": "network-security"},
    "mitm": {"name": "هجمات رجل في المنتصف MITM Attacks", "category": "Network Security", "path": "network-security"},
    "dns-poisoning": {"name": "تسميم سجلات الـ DNS", "category": "Network Security", "path": "network-security"},
    
    # 3. Cryptography
    "encryption-basics": {"name": "أساسيات التشفير وفك الترميز", "category": "Cryptography", "path": "cryptography"},
    "hash-cracking": {"name": "كسر شفرات الهاش Hash Cracking", "category": "Cryptography", "path": "cryptography"},
    "rsa-aes": {"name": "خوارزميات التشفير المتقدمة RSA/AES", "category": "Cryptography", "path": "cryptography"},
    "steganography": {"name": "إخفاء المعلومات في الوسائط Steganography", "category": "Cryptography", "path": "cryptography"},
    
    # 4. Reverse Engineering & Binaries
    "binary-analysis": {"name": "تحليل الملفات الثنائية Binary Analysis", "category": "Reverse Engineering", "path": "reverse-engineering"},
    "assembly-cracking": {"name": "هندسة الأكواد العكسية وقراءة الأسمبلي", "category": "Reverse Engineering", "path": "reverse-engineering"},
    
    # 5. OS & Systems Security
    "linux-privesc": {"name": "تصعيد الصلاحيات في أنظمة Linux", "category": "Systems Security", "path": "systems-security"},
    "windows-privesc": {"name": "تصعيد الصلاحيات في أنظمة Windows", "category": "Systems Security", "path": "systems-security"},
    "active-directory": {"name": "اختراق وإدارة بيئة الـ Active Directory", "category": "Systems Security", "path": "systems-security"},
    
    # 6. Mobile Security
    "android-ios": {"name": "أمن تطبيقات الهواتف الذكية Android/iOS", "category": "Mobile Security", "path": "mobile-security"},
    
    # 7. Cloud Security
    "cloud-config": {"name": "أمن الخدمات السحابية وتهيئة الحاويات Docker/Kubernetes", "category": "Cloud Security", "path": "cloud-security"},
    
    # 8. Digital Forensics & Log Analysis
    "log-analysis": {"name": "تحليل سجلات الخادم والأنظمة Log Analysis", "category": "Digital Forensics", "path": "forensics"},
    "memory-forensics": {"name": "تحليل الذاكرة العشوائية Memory Forensics", "category": "Digital Forensics", "path": "forensics"},
}

TOPIC_KEYWORDS = {
    "xss": ["xss", "cross-site", "حقن نصوص", "innerHTML", "script", "تعليق", "textContent"],
    "sql-injection": ["sql", "injection", "استعلام", "قاعدة بيانات", "database", "query", "select", "union"],
    "csrf": ["csrf", "forgery", "تزوير الطلبات", "طلب عبر المواقع", "token", "رمز الحماية"],
    "ssrf": ["ssrf", "server-side request", "تزوير الطلب من جانب الخادم", "طلب داخلي", "fetch"],
    "idor": ["idor", "direct object", "معرف", "رابط مباشر", "projectId", "userId", "OID"],
    "lfi-rfi": ["lfi", "rfi", "تضمين", "ملفات", "include", "file inclusion"],
    "xxe": ["xxe", "xml", "external entity", "كيان خارجي", "entity"],
    "command-injection": ["command", "أوامر", "exec", "system", "حقن الأوامر"],
    "packet-analysis": ["packet", "حزم", "شبكة", "pcap", "wireshark", "تحليل حزم"],
    "firewall": ["firewall", "جدار حماية", "جدران حماية", "قواعد المرور", "port", "منفذ"],
    "scanning": ["scan", "مسح", "فحص شبكات", "nmap", "منفذ مفتوح", "ports"],
    "mitm": ["mitm", "رجل في المنتصف", "منصف", "تسميم", "arp poisoning", "dns poisoning"],
    "dns-poisoning": ["dns", "poisoning", "تسميم سجلات", "نظام أسماء النطاقات"],
    "encryption-basics": ["encryption", "تشفير", "فك ترميز", "base64", "rot13", "caesar", "cipher"],
    "hash-cracking": ["hash", "هاش", "md5", "sha", "cracking", "كسر"],
    "rsa-aes": ["rsa", "aes", "خوارزميات التشفير المتقدمة"],
    "steganography": ["steganography", "إخفاء", "وسائط", "صورة", "ملف مخفي"],
    "binary-analysis": ["binary", "ثنائي", "ملف ثنائي", "قراءة الملفات الثنائية"],
    "assembly-cracking": ["assembly", "أسمبلي", "عكسي", "هندسة عكسية"],
    "linux-privesc": ["linux", "صلاحيات root", "تصعيد", "privilege escalation"],
    "windows-privesc": ["windows", "صلاحيات", "تصعيد", "administrator"],
    "active-directory": ["active directory", "دليل نشط", "kerberos", "domain controller"],
    "android-ios": ["android", "ios", "هاتف", "تطبيق ذكي", "موبايل"],
    "cloud-config": ["cloud", "docker", "kubernetes", "سحابية", "حاويات"],
    "log-analysis": ["log", "سجل", "سجلات", "خادم", "تحليل سجلات"],
    "memory-forensics": ["memory", "ذاكرة عشوائية", "forensics", "volatility"]
}


def parse_json_safe(raw: str) -> dict:
    cleaned = raw.strip()

    fence_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", cleaned, re.IGNORECASE)
    if fence_match:
        cleaned = fence_match.group(1).strip()

    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start != -1 and end != -1 and end > start:
        cleaned = cleaned[start:end + 1]

    cleaned = re.sub(r"[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]", "", cleaned)

    try:
        # Use strict=False to allow literal control characters (like newlines) in strings
        return json.loads(cleaned, strict=False)
    except json.JSONDecodeError as exc:
        # One last ditch effort: replace literal newlines with escaped ones
        try:
            # This is risky but sometimes helps with unescaped newlines in middle of strings
            cleaned_fix = cleaned.replace('\n', '\\n').replace('\r', '\\r')
            # But the start/end might be messed up now if it was already formatted. 
            # Let's just try strict=False first as it's the standard solution for "control character" errors.
            return json.loads(cleaned, strict=False)
        except:
            preview = raw[:500].replace("\n", " ")
            raise ValueError(f"Invalid JSON from model: {exc}. Raw preview: {preview}") from exc


# ---------- Supabase PostgREST Client Helpers (Scenario Pool) ----------

def scenario_table(team_role: str = "", challenge_type: str = "") -> str:
    """Pick the right per-type table for a challenge lookup.

    `challenge_type` can be one of: "crypto", "web". If omitted, we infer
    from the module name. Falls back to "encryption_challenges" for legacy
    behavior (Blue/Red crypto).
    """
    if challenge_type == "web":
        return "web_exploitation_challenges"
    if challenge_type == "crypto":
        return "encryption_challenges"
    # Auto-detect (legacy callers that pass only team_role still work)
    return "encryption_challenges"


def supabase_headers(content_type: bool = False) -> dict:
    headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
    }
    if content_type:
        headers["Content-Type"] = "application/json"
    return headers


async def get_supabase_scenario_count(team_role: str, challenge_type: str = "") -> int:
    if not SUPABASE_ANON_KEY or not SUPABASE_URL:
        return 0
    table = scenario_table(team_role, challenge_type)
    url = f"{SUPABASE_URL}/rest/v1/{table}?select=id"
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, headers=supabase_headers())
            if resp.status_code == 200:
                return len(resp.json())
    except Exception as e:
        print(f"Error checking Supabase scenario count: {e}")
    return 0


async def fetch_scenario_by_id(team_role: str, scenario_id: str, challenge_type: str = "") -> Optional[dict]:
    if not SUPABASE_ANON_KEY or not SUPABASE_URL:
        return None
    table = scenario_table(team_role, challenge_type)
    url = f"{SUPABASE_URL}/rest/v1/{table}?id=eq.{scenario_id}&team_role=eq.{team_role}"
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, headers=supabase_headers())
            if resp.status_code == 200:
                rows = resp.json()
                if rows:
                    return rows[0]
    except Exception as e:
        print(f"Error fetching scenario {scenario_id}: {e}")
    return None


async def fetch_random_scenario_from_supabase(team_role: str, module: str, challenge_type: str = "") -> Optional[dict]:
    if not SUPABASE_ANON_KEY or not SUPABASE_URL:
        return None
    table = scenario_table(team_role, challenge_type)
    url = f"{SUPABASE_URL}/rest/v1/{table}?module=eq.{module}&team_role=eq.{team_role}"
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, headers=supabase_headers())
            if resp.status_code == 200:
                scenarios = resp.json()
                if scenarios:
                    return random.choice(scenarios)
    except Exception as e:
        print(f"Error fetching scenario from Supabase: {e}")
    return None


async def delete_scenario_from_supabase(scenario_id: str, team_role: str, challenge_type: str = ""):
    if not SUPABASE_ANON_KEY or not SUPABASE_URL:
        return
    table = scenario_table(team_role, challenge_type)
    url = f"{SUPABASE_URL}/rest/v1/{table}?id=eq.{scenario_id}&team_role=eq.{team_role}"
    try:
        async with httpx.AsyncClient() as client:
            await client.delete(url, headers=supabase_headers())
    except Exception as e:
        print(f"Error deleting scenario {scenario_id} from Supabase: {e}")


async def insert_scenario_to_supabase(scenario_data: dict, team_role: str, challenge_type: str = "") -> Optional[dict]:
    if not SUPABASE_ANON_KEY or not SUPABASE_URL:
        return None
    table = scenario_table(team_role, challenge_type)
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    headers = supabase_headers(content_type=True)
    headers["Prefer"] = "return=representation"
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(url, json=scenario_data, headers=headers)
            if resp.status_code in (200, 201):
                rows = resp.json()
                if rows:
                    return rows[0]
    except Exception as e:
        print(f"Error inserting scenario to Supabase: {e}")
    return None


# ---------- Data Model Mappings ----------

def map_scenario_to_list_item(scenario: dict) -> dict:
    mod = scenario.get("module", "unknown")
    info = CYBER_SECURITY_TOPICS.get(mod, {})
    return {
        "id": scenario["id"],
        "title": scenario.get("title") or info.get("name", "سيناريو غير معروف"),
        "module": mod,
        "path": info.get("path", "web-security"),
        "category": info.get("category", "Web Security"),
        "difficulty": scenario.get("difficulty") or "متوسط",
        "xpReward": scenario.get("xp_reward", 150),
    }


def map_groq_scenario_to_db(groq_scenario: dict, module: str, difficulty: str) -> dict:
    xp = groq_scenario.get("xpReward") or groq_scenario.get("xp_reward")
    if xp is None:
        xp = 200 if difficulty == "قوي" else 150 if difficulty == "متوسط" else 100
    return {
        "module": module,
        "title": groq_scenario.get("title", ""),
        "story": groq_scenario.get("story", ""),
        "task_outline": groq_scenario.get("task") or groq_scenario.get("taskOutline") or groq_scenario.get("task_outline", ""),
        "difficulty": groq_scenario.get("difficulty") or difficulty,
        "xp_reward": xp,
    }


def attach_scenario_metadata(training: dict, scenario: dict) -> dict:
    scenario_id = str(scenario.get("id")) if scenario.get("id") else None
    training["id"] = scenario_id
    training["scenarioId"] = scenario_id
    training["type"] = training.get("type") or scenario.get("module")
    if not training.get("difficulty"):
        training["difficulty"] = scenario.get("difficulty", "متوسط")
    if not training.get("xpReward"):
        training["xpReward"] = scenario.get("xp_reward", 150)
    return training


import time

def save_challenge_file(file_data: dict, module: str, team_role: str) -> str:
    """تقوم هذه الدالة بإنشاء ملف حقيقي على السيرفر إذا كان التحدي يتطلب ذلك"""
    if not file_data or not file_data.get("fileName") or not file_data.get("content"):
        return ""
    
    file_name = file_data.get("fileName").replace(" ", "_")
    content = file_data.get("content")
    
    # إنشاء اسم ملف فريد لتجنب تكرار الأسماء
    unique_filename = f"{team_role}_{module}_{int(time.time())}_{file_name}"
    file_path = os.path.join(FILES_DIR, unique_filename)
    
    try:
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"    [+] تم إنشاء ملف للتحدي: {file_path}")
        return file_path
    except Exception as e:
        print(f"    [-] خطأ أثناء إنشاء الملف: {e}")
        return ""


def apply_generated_files(training: dict, module: str, team_role: str) -> dict:
    if training.get("fileToGenerate"):
        saved_file_path = save_challenge_file(training["fileToGenerate"], module, team_role)
        if saved_file_path:
            log_val = training.get("logData") or ""
            training["logData"] = json.dumps({
                "downloadable_file": os.path.basename(saved_file_path),
                "preview": log_val[:200] + "..." if len(log_val) > 200 else log_val
            }, ensure_ascii=False)
    return training


# ---------- Models ----------

class AuthRequest(BaseModel):
    action: str
    email: str
    password: str
    name: Optional[str] = None


class XpRequest(BaseModel):
    action: str
    user_id: Optional[str] = None
    xp_amount: Optional[int] = None


class TrainingRequest(BaseModel):
    module: str
    path: str
    category: str
    moduleId: Optional[str] = None
    teamRole: Optional[str] = "red"
    challengeId: Optional[str] = None


class EvaluateRequest(BaseModel):
    action: str = "evaluate"
    originalChallenge: dict
    userCode: str
    teamRole: Optional[str] = "red"


class WebEvaluateRequest(BaseModel):
    """3-layer validation payload for web exploitation challenges (v2).

    The frontend collects:
      - challengeId    → the row from web_exploitation_challenges
      - payload        → what the student entered in the input field
      - exploitSignal  → what the iframe postMessaged back to the parent
                          {sink, secret, console_logs, ts}
    """
    challengeId: str
    payload: str
    teamRole: Optional[str] = "red"
    exploitSignal: Optional[dict] = None


class TerminalRequest(BaseModel):
    teamRole: Optional[str] = "red"
    challengeId: str
    command: str


class TerminalWriteRequest(BaseModel):
    teamRole: Optional[str] = "red"
    challengeId: str
    filename: str
    content: str


class TerminalListRequest(BaseModel):
    teamRole: Optional[str] = "red"
    challengeId: str


class CertificateRequest(BaseModel):
    action: str = "list"
    user_id: str
    category: Optional[str] = None
    verify_code: Optional[str] = None
    details: Optional[dict] = None


# ---------- Proxy Auth to Supabase Edge Function ----------

@app.post("/api/auth")
async def handle_auth(req: AuthRequest):
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{SUPABASE_EDGE_URL}/apex-auth",
            json={"action": req.action, "email": req.email, "password": req.password, "name": req.name},
        )
    data = resp.json()
    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=data.get("error", "Auth failed"))
    return data


# ---------- Proxy XP to Supabase Edge Function ----------

@app.post("/api/xp")
async def handle_xp(req: XpRequest):
    if not req.user_id:
        raise HTTPException(status_code=400, detail="user_id is required")

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{SUPABASE_EDGE_URL}/apex-xp",
            json={"action": req.action, "user_id": req.user_id, "xp_amount": req.xp_amount},
        )
    data = resp.json()
    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=data.get("error", "XP operation failed"))
    return data


# ---------- Leaderboard ----------

@app.get("/api/leaderboard")
async def get_leaderboard(limit: int = 50):
    """Fetch top users ranked by XP from the public `leaderboard` view."""
    headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
        "Content-Type": "application/json",
    }
    safe_limit = max(1, min(limit, 100))
    url = (
        f"{SUPABASE_URL}/rest/v1/leaderboard"
        f"?select=id,name,xp,completed_trainings"
        f"&limit={safe_limit}"
    )
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(url, headers=headers)
        if resp.status_code != 200:
            print(f"Leaderboard fetch error: {resp.status_code} {resp.text}")
            return {"users": [], "total": 0}
        rows = resp.json()
    except Exception as e:
        print(f"Leaderboard exception: {e}")
        return {"users": [], "total": 0}

    cleaned = []
    for i, row in enumerate(rows, start=1):
        cleaned.append({
            "rank": i,
            "id": row.get("id"),
            "name": row.get("name") or "مشغل",
            "xp": int(row.get("xp") or 0),
            "completed_trainings": int(row.get("completed_trainings") or 0),
        })
    return {"users": cleaned, "total": len(cleaned)}


# ---------- Certificate Management ----------

@app.post("/api/certificates")
async def handle_certificates(req: CertificateRequest):
    headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    }
    
    if req.action == "list":
        # Temporary: fetch all certs to see if it works at all
        url = f"{SUPABASE_URL}/rest/v1/certificates?select=*"
        print(f"DEBUG: Fetching all certs from {url}")
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, headers=headers)
            print(f"DEBUG: Supabase response status: {resp.status_code}")
            if resp.status_code != 200:
                print(f"DEBUG: Error details: {resp.text}")
                raise HTTPException(status_code=resp.status_code, detail="Failed to fetch certificates")
            certs = resp.json()
            # Filter manually for safety
            user_certs = [c for c in certs if str(c.get('user_id')) == str(req.user_id)]
            print(f"DEBUG: Found {len(certs)} total certs, {len(user_certs)} for this user")
            return {"certificates": user_certs}
            
    elif req.action == "issue":
        # Check if already issued for this user and category
        check_url = f"{SUPABASE_URL}/rest/v1/certificates?user_id=eq.{req.user_id}&category=eq.{req.category}&select=id"
        async with httpx.AsyncClient() as client:
            check_resp = await client.get(check_url, headers=headers)
            if check_resp.status_code == 200 and len(check_resp.json()) > 0:
                return {"status": "already_issued", "certificate": check_resp.json()[0]}

            # Issue new certificate
            payload = {
                "user_id": req.user_id,
                "category": req.category,
                "verify_code": req.verify_code or f"APEX-{req.user_id[:4].upper()}-{random.randint(1000, 9999)}",
                "details": req.details or {"issue_reason": "Path completion"}
            }
            resp = await client.post(f"{SUPABASE_URL}/rest/v1/certificates", headers=headers, json=payload)
            if resp.status_code not in [200, 201]:
                raise HTTPException(status_code=resp.status_code, detail="Failed to issue certificate")
            return {"status": "issued", "certificate": resp.json()[0]}
    
    raise HTTPException(status_code=400, detail="Invalid action")


# ---------- Scenario & Challenge Generation Helpers ----------

async def generate_scenario_from_groq(team_role: str, module: str, path: str = "web-security", category: str = "web", difficulty: str = "متوسط") -> dict:
    """Generate a lightweight scenario seed for the cache pool (no full challenge artifacts)."""
    topic_info = CYBER_SECURITY_TOPICS.get(module, {"name": f"موضوع: {module}", "category": category, "path": path})
    topic = topic_info["name"]
    team_label = "الفريق الأزرق (مدافع)" if team_role == "blue" else "الفريق الأحمر (مهاجم)"

    # Pull recent titles to avoid duplicates
    existing_titles = await _fetch_existing_titles(team_role)

    system_prompt = f"""أنت كبير مصممي سيناريوهات الأمن السيبراني في منصة APEX، وتعمل بمعايير المنصات العالمية (HackTheBox، PortSwigger، SANS، MITRE ATT&CK، PicoCTF).

مهمتك: تصميم سيناريو تدريبي **مبتكر وواقعي** بمستوى احترافي عالٍ.
السيناريو سيُستخدم كقصة أساسية يبني عليها ذكاء اصطناعي آخر تحدٍ تفاعلي كامل.

### الدور
{team_label}

### الموضوع التقني
{topic} (module key: {module})

### مستوى الصعوبة
{difficulty}

### قواعد الجودة الصارمة (مهم جداً)
1. **واقعية قصوى**: السيناريو يجب أن يكون مستوحى من حادثة أمنية حقيقية أو حالة اختراق معروفة (مثل اختراق SolarWinds، ثغرة Log4Shell، تسريبات Capital One S3، تسريبات Facebook GraphQL، Kerberoasting، إلخ). لا قصص طفولية.
2. **تفاصيل تقنية دقيقة**: اذكر تقنيات حقيقية (CVEs بأرقامها، نُسخ منتجات، أدوات)، أسماء شركات وهمية واقعية، أرقام دقيقة (IP، نطاقات، hashes، endpoints، CVSS scores).
3. **تنوع**: لا تكرّر نفس القصة/السيناريو بتغييرات طفيفة. كل سيناريو يجب أن يحكي قصة فريدة.
4. **بيئة تقنية محددة**: اذكر stack تقني واضح (مثل Nginx 1.18, MySQL 8, AWS EC2 t3.medium, K8s 1.28, Active Directory 2019، إلخ).
5. **مخرجات قابلة للقياس**: الـ "task" يجب أن يحدد مهمة واحدة واضحة ومحددة يمكن للذكاء الاصطناعي التالي تحويلها إلى تحدٍ تفاعلي.
6. **تخصص**: استخدم مصطلحات أمان سيبراني احترافية (TTPs من MITRE ATT&CK، CVE/CWE، IOC، C2، lateral movement، exfiltration، persistence).

### منع التكرار
العناوين الموجودة حالياً في البركة (لا تُكرّرها أو تشابهها):
{', '.join(existing_titles[:25]) if existing_titles else 'لا يوجد'}

### الإخراج (JSON خام فقط، بدون Markdown)
{{
  "title": "عنوان احترافي مبتكر بالإنجليزية أو العربية يصف السيناريو بدقة",
  "story": "قصة سياقية واقعية (3-4 جمل) تصف: من الشركة؟ ما التقنية المستخدمة؟ ما الثغرة أو السياق الأمني؟ ما الأثر؟",
  "task": "مهمة واحدة واضحة ومحددة باللغة العربية (فقرة واحدة) تصف ما يجب على المتدرب فعله",
  "difficulty": "{difficulty}",
  "xpReward": {200 if difficulty == "قوي" else 150 if difficulty == "متوسط" else 100}
}}"""

    # Pick a creative seed based on difficulty + module to ensure variety
    creative_seeds = [
        f"حادثة أمنية في شركة {random.choice(['CloudWave', 'FinShield', 'TechCorp', 'MediCore', 'DataHub', 'ApexBank', 'NexusLogistics', 'QuantumHealth', 'SolarSync', 'PayStream'])}",
        f"سيناريو هجوم/دفاع مبني على {random.choice(['MITRE ATT&CK T1059', 'CVE-2024-3094', 'OWASP API Top 10', 'NIST SP 800-53', 'PCI-DSS violation', 'insider threat', 'supply chain attack', 'zero-day exploit', 'privilege escalation chain'])}",
        f"بيئة {random.choice(['Kubernetes 1.28', 'AWS EKS', 'Azure AD', 'GCP IAM', 'Active Directory 2019', 'Java Spring Boot', 'Node.js Express', 'PHP 8.2', 'Python FastAPI', 'Go microservice', 'React SPA', 'GraphQL API'])} مع {random.choice(['misconfig', 'memory leak', 'race condition', 'TOCTOU', 'insecure deserialization', 'weak crypto'])}",
    ]
    user_prompt = (
        f"صمم سيناريو {team_label} جديد وحصري عن {topic}.\n"
        f"الإلهام: {random.choice(creative_seeds)}.\n"
        f"تذكير: اجعل السيناريو **مختلفاً كلياً** عن العناوين السابقة، واذكر stack تقني محدد، واصف الأثر بالأرقام (مستخدمين/سجلات/دولار)."
    )

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(GROQ_API_URL, json={
            "model": "llama-3.3-70b-versatile",
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": 0.85,
            "max_tokens": 3500,
        }, headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {GROQ_API_KEY}",
        })

    if resp.status_code == 429:
        raise ValueError("Groq API Rate Limit Reached (429)")
    if resp.status_code != 200:
        raise HTTPException(status_code=500, detail=f"Groq API error: {resp.status_code}")

    return parse_json_safe(resp.json()["choices"][0]["message"]["content"])


async def _fetch_existing_titles(team_role: str) -> list:
    """Fetch recent scenario titles to be passed to the prompt for uniqueness check."""
    if not SUPABASE_ANON_KEY or not SUPABASE_URL:
        return []
    table = scenario_table(team_role)
    url = f"{SUPABASE_URL}/rest/v1/{table}?select=title&team_role=eq.{team_role}&order=created_at.desc&limit=40"
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, headers=supabase_headers())
            if resp.status_code == 200:
                return [row.get("title", "") for row in resp.json() if row.get("title")]
    except Exception:
        pass
    return []


async def generate_challenge_from_scenario(
    scenario: dict,
    team_role: str,
    module: str,
    path: str = "web-security",
    category: str = "web",
) -> dict:
    """Build a full interactive challenge from a cached scenario via Groq."""
    difficulty = scenario.get("difficulty") or "متوسط"
    return await generate_challenge_from_groq(
        team_role, module, path, category, difficulty, scenario=scenario
    )


async def generate_challenge_from_groq(
    team_role: str,
    module: str,
    path: str = "web-security",
    category: str = "web",
    difficulty: str = "متوسط",
    scenario: Optional[dict] = None,
) -> dict:
    topic_info = CYBER_SECURITY_TOPICS.get(module, {"name": f"موضوع: {module}", "category": category, "path": path})
    topic = topic_info["name"]

    is_web = module in ["xss", "sql-injection", "csrf", "ssrf", "idor", "lfi-rfi", "xxe", "command-injection", "auth-bypass", "misconfig"]

    role_instructions = ""
    if is_web:
        if team_role == "blue":
            role_instructions = f"""
المستخدم هو من الفريق الأزرق (Blue Team - مدافع أمني) في مسار الويب والتطبيقات.
يجب أن تركز المهمة والقصة والخطوات بالكامل على الجانب الدفاعي وسد الثغرة البرمجية في صفحة الويب.
درجة الصعوبة المطلوبة للتحدي: {difficulty}
- يجب أن يكون التحدي عبارة عن كود مصاب بثغرة أمنية واضحة في ملف index.html.
- المطلوب من المستخدم هو فتح محرر الأكواد (VS Code) وتعديل الكود المصدري لسد الثغرة الأمنية وجعل الصفحة آمنة تماماً.
- اجعل قصة التحدي تدور حول مهندس أمن يقوم بإصلاح وتأمين نظام ويب تم اكتشاف ثغرة فيه.
- اجعل "task" واضحة جداً وتطلب منه صراحة تعديل الكود المصدري لإغلاق الثغرة (مثلاً استبدال الكود غير الآمن ببديل آمن).
- لا تطلب منه أبداً إدخال payload أو البحث عن علم (flag)، بل اطلب منه إصلاح الكود والضغط على 'أكملت الإصلاح' ليقوم المقيم الذكي بفحص الكود.
"""
        else:
            role_instructions = f"""
المستخدم هو من الفريق الأحمر (Red Team - مهاجم ومخترق) في مسار الويب والتطبيقات.
يجب أن تركز المهمة والقصة والخطوات بالكامل على الجانب الهجومي واكتشاف الثغرة واستغلالها في الويب.
درجة الصعوبة المطلوبة للتحدي: {difficulty}
- المطلوب من المستخدم هو اكتشاف الثغرة في الموقع التفاعلي وحقن حمولة مناسبة (payload) أو إيجاد العلم (flag) للحصول على النقاط.
- اجعل قصة التحدي تدور حول مخترق أخلاقي يحاول استغلال ثغرة أمنية لإثبات وجود الخلل.
- اجعل "task" تطلب منه صراحة إدخال الحمولة (payload) أو العلم في حقل الإدخال.
- يجب أن يحتوي "expectedAnswer" على نمط الحمولة أو الكود المتوقع للاستغلال (مثلاً: alert, script, onerror, hex, base64, etc.) أو العلم المطلوب.
"""
    else:
        # Non-Web Challenge (Network, Cryptography, Systems, Forensics)
        if team_role == "blue":
            role_instructions = f"""
المستخدم هو من الفريق الأزرق (Blue Team - مدافع ومحلل أمني) في مسار الأنظمة والشبكات والتشفير والتحقيق الجنائي (غير الويب).
يجب أن تركز المهمة والقصة والخطوات بالكامل على الجانب الدفاعي وتحليل السجلات والأنظمة وتكوينات الأمان.
درجة الصعوبة المطلوبة للتحدي: {difficulty}
- التحدي هنا غير معني بالويب أو الأكواد البرمجية البرونت-إند (لا توجد صفحة index.html تفاعلية).
- المطلوب من المستخدم هو تحليل سجلات نظام أو شبكة، أو تدقيق تهيئة جدار حماية (firewall config)، أو تحليل بصمات تشفيرية (hashes/ciphers)، أو استخراج ملفات وتتبع خوادم.
- **تنبيه هام جداً**: يجب أن تقوم بتوليد البيانات الفنية والملفات في حقل "logData" (مثل سجلات خادم Apache/Nginx، أو حزم شبكة PCAP كخيار نصي، أو سجلات الحوادث) أو في حقل "configData" (مثل ملفات تهيئة شبكة، ملفات سريّة أو نصوص برمجية بحاجة للمراجعة).
- **إنشاء الملفات**: إذا كان التحدي يتعلق بالتشفير أو التحقيق الجنائي أو الشبكات، قم بصياغة وتمثيل محتويات الملفات البرمجية المفترضة (مثل ملف تشفير ضعيف، ملفات سجل، إلخ) وضعها بوضوح داخل "configData" كـ JSON أو نص برمجي مهيأ للمستخدم، ومثّل السجلات البرمجية في "logData" حتى يتمكن نظام محاكي Windows من تقديمها كملفات أو سجلات للمتدرب.
- اجعل "task" تطلب منه صراحة تحليل البيانات أو قراءة الملفات والإجابة عن سؤال دفاعي محدد (مثلاً: تحديد الـ IP المهاجم، كتابة الأمر الصحيح المفقود، تحديد خوارزمية التشفير الضعيفة المستخدمة مثل md5 أو sha1، أو المنفذ المشبوه).
- يجب أن تحتوي "expectedAnswer" على الإجابة أو الكلمة المفتاحية المباشرة والدقيقة المتوقعة للحل (مثال: md5, sha1, 192.168.1.100, port 21, etc.).
- يجب ألا يكون المطلوب إصلاح كود HTML، بل إدخال إجابة نصية دقيقة ومباشرة في حقل الإجابة.
"""
        else:
            role_instructions = f"""
المستخدم هو من الفريق الأحمر (Red Team - مهاجم ومخترق) في مسار الأنظمة والشبكات والتشفير والاختراق (غير الويب).
يجب أن تركز المهمة والقصة والخطوات بالكامل على كسر الشيفرات، تحليل السجلات، اختراق الأنظمة، وجمع المعلومات.
درجة الصعوبة المطلوبة للتحدي: {difficulty}
- التحدي غير معني بصفحات الويب تفاعلية، بل بتحليل الشبكات والأنظمة وفك التشفير.
- المطلوب هو كسر تشفير ملفات، فك تشفير هاشات، البحث في سجلات الخادم، أو استغلال ثغرات المنافذ للحصول على العلم (Flag).
- **إنشاء الملفات والتسريبات**: ضع النصوص المشفرة أو الشيفرات أو الهاشات كملفات أو مسودات فنية داخل حقل "configData" (مثال: ملف secret.enc يحتوي على نص مشفر، أو ملف hash.txt يحتوي على بصمات)، وضع السجلات الفنية للشبكة أو المنافذ في حقل "logData".
- اجعل "task" تطلب منه بوضوح إدخال العلم المستخرج في حقل الإجابة.
- يجب أن يحتوي "expectedAnswer" على العلم الدقيق المطلوب (مثل CyberArena{{...}}).
"""

    if scenario:
        scenario_block = f"""
=== السيناريو الأساسي (يجب الالتزام به بالكامل) ===
عنوان السيناريو: {scenario.get("title", "")}
قصة السيناريو: {scenario.get("story", "")}
ملخص المهمة: {scenario.get("task_outline") or scenario.get("task", "")}
=== نهاية السيناريو ===

يجب أن تبني التحدي الكامل (HTML، الملفات، التلميحات، الإجابة المتوقعة) انطلاقاً من هذا السيناريو.
يمكنك توسيع التفاصيل التقنية، لكن لا تغيّر جوهر القصة أو الهدف الأمني.
"""
    else:
        scenario_block = "لا يوجد سيناريو مسبق — أنشئ تحدياً أصلياً يتوافق مع الموضوع والدور."

    system_prompt = f"""أنت مدرب أمن سيبراني خبير ومحترف للغاية.
مهمتك: بناء تحدٍ تفاعلي كامل ومفصّل بناءً على السيناريو المُزوَّد أدناه.
لا تنحرف عن السيناريو — طوّره إلى تحدٍ قابل للعب مع أكواد وملفات وتلميحات وإجابة متوقعة.
درجة الصعوبة المطلوبة للتحدي: {difficulty}
{role_instructions}
{scenario_block}

قواعد صارمة لواقعية التحدي (Realistic & Production-Ready Scenarios):
1. يمنع منعاً باتاً كتابة سيناريوهات وهمية أو أكواد غير حقيقية أو استبدال الأكواد بتعليقات توضيحية. يجب أن يكون الكود المصدري كاملاً وقابلاً للتنفيذ ومطابقاً للواقع البرمجي 100%.
2. يجب صياغة القصة والسيناريو والمهام بشكل واقعي ومأخوذ من حوادث أمنية حقيقية أو حالات اختراق معروفة في الشركات والأنظمة الحية، وتجنب القصص التبسيطية أو الطفولية.
3. يجب أن تحتوي الـ htmlPreview على كود برمجي متكامل ومبني بعناية فائقة، ويحتوي على الخلل الأمني الدقيق (مثل استخدام غير آمن للدوال, عدم فلترة المدخلات، ثغرات التوجيه، التشفير الضعيف، إلخ).
4. بالنسبة للبلو تيم: يجب أن يكون الحل قابلاً للتطبيق برمجياً (مثل استبدال الدوال الضعيفة ببدائل حقيقية وآمنة)، ويجب أن يحتوي التحدي على وصف برمني وتفسير دقيق للثغرة في حقل vulnerabilityLocation.
5. بالنسبة للريد تيم: يجب أن تكون الثغرة قابلة للاستغلال الفعلي، والـ expectedAnswer يجب أن تحتوي على حمولات واقعية ومقبولة برمجياً.

مهم جداً: أرجع JSON خام فقط بدون أي Markdown أو شرح أو أسطر إضافية أو ```json.

أرجع JSON فقط وبشكل صحيح، بهذا التنسيق وبدون أي نصوص إضافية خارج الـ JSON:

{{
  "title": "عنوان التدريب المناسب للمسار والدور",
  "story": "قصة سيبرانية واقعية وحماسية باللغة العربية مأخوذة من سيناريو شركة أو بيئة إنتاج حقيقية",
  "task": "المهمة المطلوبة من المستخدم بوضوح تام وبلغة أمنية دقيقة",
  "htmlPreview": "صفحة HTML كاملة تفاعلية وحقيقية تحتوي على كود وتصميم ذو جودة عالية جداً وخلفيات داكنة متناسقة مع هوية CyberArena السيبرانية",
  "fileToGenerate": {{
    "fileName": "اسم الملف مع الامتداد المناسب (مثل capture.log أو hashes.txt)",
    "content": "المحتوى الفعلي للملف الذي سيقوم المتدرب بتحميله وتحليله"
  }},
  "vulnerabilityLocation": "تحديد وتفسير دقيق جداً لمكان وجود الثغرة برمجياً ومنطقياً في الكود",
  "hints": ["تلميح تقني عميق يساعده في الحل","تلميح إضافي","تلميح يوضح الفكرة تماماً"],
  "expectedAnswer": "الاستغلال المتوقع أو الحمولة (payload) المتوقعة بالنسبة للفريق الأحمر، أو فكرة الحل للفريق الأزرق",
  "explanation": "شرح أمني عميق للثغرة وكيفية معالجتها في الواقع والأبعاد الأمنية لها وكيفية تجنبها في بيئات الإنتاج",
  "configData": "محتوى ملف التهيئة أو الشيفرة البرمجية المفترضة للتحدي (مثال: محتويات ملف التشفير الضعيف، أو ملف secret.enc المشفر، أو إعدادات الشبكة) بشكل نصي كامل إذا كان التحدي يحتاج ملفات للتأمين أو الفك.",
  "logData": "محتوى سجلات النظام أو حزم الشبكة النصية المفترضة بدقة وواقعية.",
  "xpReward": {200 if difficulty == "قوي" else 150 if difficulty == "متوسط" else 100},
  "difficulty": "{difficulty}"
}}

ملاحظة هامة: يجب أن تكون صفحة htmlPreview تفاعلية بالكامل، ذات ألوان داكنة تتطابق مع هوية CyberArena السيبرانية الفخمة، وتدعم اللغة العربية والاتجاه RTL.

تنبيه للمبرمج: يمنع استخدام كلمات من مسارات أخرى في غير محلها (مثلاً لا تستخدم "تشفير" أو "جدار حماية" في تحدي XSS أو SQL Injection) حتى لا يتم استبعاد التحدي من نظام التدقيق آلياً."""

    user_prompt = f"""الموضوع: {topic}
الوحدة: {module}
دور اللاعب الحالي: {team_role}
درجة الصعوبة المطلوبة: {difficulty}
المسار: {path}
التصنيف: {category}

بناءً على السيناريو المُزوَّد، أنشئ تحدياً تفاعلياً كاملاً جاهزاً للعب."""

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(GROQ_API_URL, json={
            "model": "llama-3.3-70b-versatile",
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": 0.7,
            "max_tokens": 4096,
        }, headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {GROQ_API_KEY}",
        })

    if resp.status_code == 429:
        raise ValueError("Groq API Rate Limit Reached (429)")
    elif resp.status_code != 200:
        raise HTTPException(status_code=500, detail=f"Groq API error: {resp.status_code}")

    content = resp.json()["choices"][0]["message"]["content"]
    training = parse_json_safe(content)

    if not training.get("htmlPreview", "").strip():
        training["htmlPreview"] = FALLBACK_HTML

    return training


# ---------- Background replenishment task handlers ----------

# State to keep track of rate limits and log only once
RATE_LIMIT_ALERTED = False

async def generate_and_store_scenario(team_role: str, module: str, path: str = "web-security", category: str = "web", difficulty: str = "متوسط"):
    global RATE_LIMIT_ALERTED
    try:
        groq_scenario = await generate_scenario_from_groq(team_role, module, path, category, difficulty)
        db_scenario = map_groq_scenario_to_db(groq_scenario, module, difficulty)
        await insert_scenario_to_supabase(db_scenario, team_role)
        print(f"Background Generator: Stored a new {team_role} scenario ({difficulty}) for {module} in Supabase pool.")
        RATE_LIMIT_ALERTED = False
    except Exception as e:
        if "429" in str(e) or "Rate Limit" in str(e):
            if not RATE_LIMIT_ALERTED:
                print("⚠️ [Groq AI] Rate Limit 429. Retrying...")
                RATE_LIMIT_ALERTED = True
        else:
            import traceback
            traceback.print_exc()
            print(f"Background Scenario Generator Error for {team_role} - {module}: {e}")


async def handle_background_replacement(scenario_id: str, team_role: str, module: str, path: str, category: str, difficulty: str):
    """Consume (delete) a solved/used challenge from the pool.

    Per AGENTS.md pool architecture:
      - The pool watcher (crypto_generator.start_pool_watcher) is the ONLY
        component allowed to call Groq for refills, and it only fires when
        the pool count drops to POOL_THRESHOLD (=2).
      - This function used to immediately call generate_and_store_scenario
        after every solve, which hammered Groq → 429 rate-limits. That's
        gone now: we just delete and let the watcher catch up later.
    """
    ctype = _challenge_type_for_module(module)
    try:
        await delete_scenario_from_supabase(scenario_id, team_role, challenge_type=ctype)
        print(f"Deleted solved {ctype} scenario {scenario_id} from Supabase. (refill deferred to pool watcher)")
    except Exception as e:
        print(f"Error in background scenario replacement task: {e}")


async def populate_pool_background():
    """
    Background pool replenisher.

    Architecture (per-type generator pattern):
      - Each challenge type (crypto, web, forensics, ...) has its own
        `*_generator.py` module with the same public API:
            async start_pool_watcher(team_role)  -> coroutine that runs forever
      - main.py starts one watcher per (type, team) at startup.
      - The watcher is responsible for counting and refilling its own table.

    Pool model (per team):
      - Target: 5 challenges total
      - Threshold: 2 (refill when at or below)
      - Batch: 3 (insert this many per refill cycle)
    """
    await asyncio.sleep(8)  # Gentle wait on startup
    print("Background pool watcher orchestrator started.")

    # ---- Register generator modules here as they are built ----
    # Each entry: (generator_module, list_of_teams)
    # The generator must export `async start_pool_watcher(team_role)`.
    registered = []

    try:
        import crypto_generator
        # Crypto challenges are Red-team only for now (Blue encryption UI not yet built).
        registered.append(("crypto", crypto_generator, ["red"]))
    except Exception as e:
        print(f"[main] Could not import crypto_generator: {e}")

    try:
        import web_exploitation_generator
        # Web exploitation is offensive — Red team only.
        registered.append(("web", web_exploitation_generator, ["red"]))
    except Exception as e:
        print(f"[main] Could not import web_exploitation_generator: {e}")

    # Future:
    # try:
    #     import forensics_generator
    #     registered.append(("forensics", forensics_generator, ["blue", "red"]))
    # except Exception as e:
    #     print(f"[main] Could not import forensics_generator: {e}")

    print(f"[main] Active generators: {[name for name, _, _ in registered]}")

    for name, gen, teams in registered:
        for team in teams:
            asyncio.create_task(gen.start_pool_watcher(team))

    # Keep the orchestrator alive (it just spawns tasks, no loop of its own)
    while True:
        await asyncio.sleep(3600)


@app.on_event("startup")
async def startup_event():
    # Force system execution of check
    sys_path = os.path.dirname(os.path.abspath(__file__))
    sys.path.append(sys_path)
    # Run the background pool watcher
    asyncio.create_task(populate_pool_background())


# ---------- Training List ----------

# Web exploitation module set (Red Team offensive)
WEB_EXPLOIT_MODULES = {
    "xss", "sql-injection", "csrf", "ssrf",
    "idor", "lfi-rfi", "xxe", "command-injection",
}


def _challenge_type_for_module(module: str) -> str:
    """Return 'web' for web exploitation modules, 'crypto' otherwise."""
    if module in WEB_EXPLOIT_MODULES:
        return "web"
    return "crypto"


@app.get("/api/training/list")
async def list_challenges(team_role: str = "blue", difficulty: Optional[str] = None, limit: int = 100):
    """Return a preview list of cached scenarios for display in the grid.

    Combines challenges from BOTH tables (encryption_challenges + web_exploitation_challenges)
    so the dashboard shows the full pool for a team.

    Note: each table has a different schema (encryption_challenges doesn't have
    vuln_type, html_preview, expected_payload) so we use a minimal safe field
    list for each.
    """
    all_challenges: list[dict] = []

    # Per-table safe SELECT — only fields we know exist in each schema.
    # `vuln_type`, `html_preview`, `expected_payload` only exist in
    # web_exploitation_challenges (added in migration 005).
    table_fields = {
        "crypto": "id,title,module,difficulty,xp_reward",
        "web":    "id,title,module,vuln_type,difficulty,xp_reward",
    }

    for ctype in ("crypto", "web"):
        table = scenario_table(challenge_type=ctype)
        if not SUPABASE_ANON_KEY or not SUPABASE_URL:
            continue
        fields = table_fields.get(ctype, table_fields["crypto"])
        url = f"{SUPABASE_URL}/rest/v1/{table}?select={fields}&team_role=eq.{team_role}&limit={limit}"
        if difficulty:
            url += f"&difficulty=eq.{difficulty}"
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(url, headers=supabase_headers())
                if resp.status_code == 200:
                    data = resp.json()
                    all_challenges.extend(map_scenario_to_list_item(c) for c in data)
                else:
                    print(f"List {table} status {resp.status_code}: {resp.text[:200]}")
        except Exception as e:
            print(f"Error listing {table}: {e}")

    return {"challenges": all_challenges}

# ---------- Training Generation Endpoint (Cached / Dynamic) ----------

class SolvedRequest(BaseModel):
    challengeId: str
    teamRole: str
    module: str
    path: str
    category: str
    difficulty: str


@app.post("/api/training/solved")
async def solve_challenge(req: SolvedRequest, background_tasks: BackgroundTasks):
    background_tasks.add_task(
        handle_background_replacement,
        req.challengeId,
        req.teamRole,
        req.module,
        req.path,
        req.category,
        req.difficulty
    )
    return {"status": "queued"}


@app.post("/api/training/generate")
async def generate_training(req: TrainingRequest, background_tasks: BackgroundTasks):
    """Resolve a challenge for the trainee.

    New flow (per-type tables like encryption_challenges, web_exploitation_challenges):
      1. Detect the challenge type from the module name.
      2. Look up the row by id in the per-type table.
      3. If found, return it directly mapped to TrainingData — no Groq needed.
      4. Fall back to the legacy Groq-on-demand flow for unsupported modules.
    """
    scenario_id = req.challengeId
    module = req.module
    ctype = _challenge_type_for_module(module)

    # ---- 1) Try the per-type table for this challenge type ----
    if scenario_id:
        row = await fetch_scenario_by_id(req.teamRole, scenario_id, challenge_type=ctype)
        if row:
            if ctype == "web":
                training = _map_webex_row_to_training(row, req.teamRole)
            else:
                training = _map_encryption_row_to_training(row, req.teamRole)
            print(f"[generate] Served from {ctype} table: {training['title']}")
            return {"training": training}

    # ---- 2) Fallback: legacy Groq-generated scenario flow ----
    scenario = None
    if scenario_id:
        # Try the other table too in case of cross-type lookups
        scenario = await fetch_scenario_by_id(req.teamRole, scenario_id, challenge_type=ctype)
    if not scenario:
        scenario = await fetch_random_scenario_from_supabase(req.teamRole, req.module, challenge_type=ctype)

    info = CYBER_SECURITY_TOPICS.get(req.module, {"path": req.path, "category": req.category})
    path = info.get("path", req.path)
    category = info.get("category", req.category)
    difficulty = random.choice(["مبتدئ", "متوسط", "قوي"])

    if not scenario:
        print(f"Scenario pool empty for {req.teamRole} - {req.module}. Generating scenario synchronously.")
        groq_scenario = await generate_scenario_from_groq(req.teamRole, req.module, path, category, difficulty)
        db_scenario = map_groq_scenario_to_db(groq_scenario, req.module, difficulty)
        inserted = await insert_scenario_to_supabase(db_scenario, req.teamRole)
        scenario = inserted or db_scenario
    else:
        difficulty = scenario.get("difficulty") or difficulty
        print(f"Scenario loaded: {scenario.get('title')} ({req.teamRole} - {req.module})")

    print(f"Generating full challenge from scenario via Groq for {req.teamRole} - {req.module}")
    training_data = await generate_challenge_from_scenario(
        scenario, req.teamRole, req.module, path, category
    )
    training_data = apply_generated_files(training_data, req.module, req.teamRole)
    training_data = attach_scenario_metadata(training_data, scenario)

    return {"training": training_data}


def _map_encryption_row_to_training(row: dict, team_role: str) -> dict:
    """Map a row from encryption_challenges to the TrainingData shape.

    The frontend expects:
        title, story, type, task, hints[], expectedAnswer, explanation,
        difficulty, xpReward, scenarioId, files, command_outputs, tools_whitelist
    """
    files = row.get("files") or {}
    file_meta = row.get("file_metadata") or {}
    # Decode the first file as the editable buffer (if any)
    first_filename = next(iter(files), None)
    code = ""
    if first_filename:
        import base64 as _b64
        try:
            code = _b64.b64decode(files[first_filename]).decode("utf-8", errors="replace")
        except Exception:
            code = ""

    return {
        "id": row.get("id"),
        "scenarioId": row.get("id"),
        "title": row.get("title", ""),
        "story": row.get("story", ""),
        "type": row.get("module", "encryption-basics"),
        "task": row.get("task_outline", ""),
        "code": code,
        "codeLanguage": _infer_code_language(first_filename, team_role),
        "htmlPreview": code if (first_filename or "").endswith(".html") else None,
        "logData": code if (first_filename or "").endswith((".log", ".txt")) else None,
        "configData": code if (first_filename or "").endswith((".json", ".csv", ".pem")) else None,
        "vulnerabilityLocation": None,
        "hints": row.get("hints") or [],
        "expectedAnswer": row.get("flag_preview", ""),       # CyberArena{...}
        "expectedAnswerHash": row.get("flag_hash", ""),      # server-side check
        "explanation": "العلم يظهر في مخرجات الطرفية بعد تنفيذ الأمر الصحيح.",
        "xpReward": row.get("xp_reward", 100),
        "difficulty": row.get("difficulty", "متوسط"),
        "files": files,
        "fileMetadata": file_meta,
        "commandOutputs": row.get("command_outputs") or {},
        "toolsWhitelist": row.get("tools_whitelist") or [],
    }


def _infer_code_language(filename: str | None, team_role: str) -> str:
    if not filename:
        return "text"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    mapping = {
        "html": "html", "js": "javascript", "ts": "typescript",
        "py": "python", "json": "json", "csv": "text",
        "pem": "text", "log": "text", "txt": "text", "bin": "binary",
    }
    return mapping.get(ext, "text")


def _map_webex_row_to_training(row: dict, team_role: str) -> dict:
    """Map a row from web_exploitation_challenges to the TrainingData shape (v2).

    The v2 architecture uses 3-layer validation (pattern + sink + secret).
    The frontend reads:
      - html_preview        → renders in iframe
      - code_view           → shown in the "Source" tab
      - sink_type           → displayed as the discovered vulnerability
      - validation_pattern  → optional client-side pre-check
      - exploits_accepted   → hint list of valid vectors
      - secret_marker       → used by backend only; never sent to client
    """
    files = row.get("files") or {}
    file_meta = row.get("file_metadata") or {}
    html_preview = row.get("html_preview") or ""
    code_view = row.get("code_view") or ""
    expected_payload = row.get("expected_payload") or ""
    exploits_accepted = row.get("exploits_accepted") or []

    # Backward-compat: still expose a "legacy" expectedAnswer that contains
    # the flag_preview and the first accepted payload so older clients work.
    primary_exploit = exploits_accepted[0] if exploits_accepted else expected_payload
    expected_answer = f"{primary_exploit}|{row.get('flag_preview', '')}"

    return {
        "id": row.get("id"),
        "scenarioId": row.get("id"),
        "title": row.get("title", ""),
        "story": row.get("story", ""),
        "type": row.get("module", "xss"),
        "vulnType": row.get("vuln_type", ""),
        "task": row.get("task_outline", ""),

        # v2 lab content
        "code": html_preview,
        "codeLanguage": "html",
        "htmlPreview": html_preview,
        "codeView": code_view,
        "logData": None,
        "configData": None,
        "vulnerabilityLocation": f"نوع الثغرة: {row.get('vuln_type', '')} — ابحث عن الـ sink الخطير في الـ HTML",

        # v2 validation metadata
        "sinkType": row.get("sink_type", ""),
        "validationPattern": row.get("validation_pattern", ""),
        "exploitsAccepted": exploits_accepted,
        # NOTE: secret_marker is NEVER sent to the client (security)
        # Backend uses it during /api/training/evaluate-web

        "hints": row.get("hints") or [],
        "expectedAnswer": expected_answer,
        "expectedAnswerHash": row.get("flag_hash", ""),
        "expectedPayload": expected_payload,
        "explanation": (
            "الحل الصحيح: حقن payload يستغل الـ sink الموضّح في الكود المصدري. "
            "أي vector مقبول من نفس عائلة الثغرة (مثلاً: "
            f"{', '.join(exploits_accepted[:3]) if exploits_accepted else 'XSS vector'}"
            ")."
        ),
        "xpReward": row.get("xp_reward", 100),
        "difficulty": row.get("difficulty", "متوسط"),
        "files": files,
        "fileMetadata": file_meta,
        "commandOutputs": row.get("command_outputs") or {},
        "toolsWhitelist": row.get("tools_whitelist") or [],
        "challengeType": "web",
        "labKind": row.get("lab_kind", "iframe"),
    }


# ---------- Real Terminal Sandbox ----------
# Instead of returning canned pre-computed outputs, the frontend POSTs the
# command the trainee typed, and we actually execute it inside a temp
# workdir that contains the challenge's files. Built-in commands (cat, ls,
# echo, ...) and the challenge's whitelisted tools (python, openssl, ...)
# run for real — so the trainee can do `cat cipher.txt`, then write a
# Python one-liner, etc., and the output is genuine.

import base64 as _b64_term
import shlex as _shlex
import subprocess as _sp
import tempfile as _tempfile

_terminal_workdirs: dict[str, str] = {}
_last_loaded_row: dict[str, dict] = {}


async def _get_or_create_workdir(team_role: str, challenge_id: str) -> tuple[str, dict]:
    """Return (workdir, challenge_row) — cached per challenge."""
    key = f"{team_role}:{challenge_id}"
    if key in _terminal_workdirs and os.path.isdir(_terminal_workdirs[key]):
        return _terminal_workdirs[key], _last_loaded_row.get(key, {})

    row = None
    if challenge_id:
        try:
            row = await fetch_scenario_by_id(team_role, challenge_id)
        except Exception:
            row = None
    if row is None:
        workdir = _tempfile.mkdtemp(prefix=f"ca_{team_role}_{challenge_id[:8]}_")
        _terminal_workdirs[key] = workdir
        return workdir, {}

    workdir = _tempfile.mkdtemp(prefix=f"ca_{team_role}_{challenge_id[:8]}_")
    files = row.get("files") or {}
    for filename, b64 in files.items():
        # Sanitize: /etc/shadow -> etc/shadow inside workdir
        clean = filename.lstrip("/\\").replace("..", "_").replace("\\", "/")
        target = os.path.join(workdir, clean)
        os.makedirs(os.path.dirname(target) or workdir, exist_ok=True)
        try:
            data = _b64_term.b64decode(b64)
            with open(target, "wb") as f:
                f.write(data)
        except Exception:
            pass
    with open(os.path.join(workdir, ".challenge_id"), "w") as f:
        f.write(challenge_id)
    _terminal_workdirs[key] = workdir
    _last_loaded_row[key] = row
    return workdir, row


def _shell_builtins(args: list[str], workdir: str) -> dict:
    """Handle common Unix tools that don't exist on Windows natively."""
    tool = args[0] if args else ""
    rest = args[1:]
    try:
        if tool == "cat":
            if not rest:
                return {"stdout": "", "stderr": "cat: missing filename", "exitCode": 1}
            out, err = [], ""
            for fname in rest:
                p = os.path.join(workdir, fname.lstrip("/\\").replace("..", "_"))
                if not os.path.isfile(p):
                    err += f"cat: {fname}: No such file\n"
                    continue
                with open(p, "r", encoding="utf-8", errors="replace") as f:
                    out.append(f.read())
            return {"stdout": "\n".join(out), "stderr": err, "exitCode": 0 if not err else 1}
        if tool == "ls":
            entries = sorted(os.listdir(workdir))
            lines = []
            for n in entries:
                if n.startswith("."):
                    continue
                p = os.path.join(workdir, n)
                if os.path.isdir(p):
                    lines.append(f"<DIR>          {n}")
                else:
                    lines.append(f"               {n}")
            return {"stdout": "\n".join(lines), "stderr": "", "exitCode": 0}
        if tool == "pwd":
            return {"stdout": workdir, "stderr": "", "exitCode": 0}
        if tool == "echo":
            return {"stdout": " ".join(rest), "stderr": "", "exitCode": 0}
        if tool == "whoami":
            return {"stdout": os.environ.get("USERNAME") or os.environ.get("USER") or "student", "stderr": "", "exitCode": 0}
        if tool == "clear":
            return {"stdout": "\x1b[2J\x1b[H", "stderr": "", "exitCode": 0, "clear": True}
        if tool == "help":
            return {"stdout": HELP_TEXT, "stderr": "", "exitCode": 0}
        if tool in ("sha256sum", "md5sum", "sha1sum"):
            algo = {"sha256sum": "sha256", "md5sum": "md5", "sha1sum": "sha1"}[tool]
            import hashlib as _hl
            if not rest:
                return {"stdout": "", "stderr": f"{tool}: missing filename", "exitCode": 1}
            out, err = [], ""
            for fname in rest:
                p = os.path.join(workdir, fname.lstrip("/\\").replace("..", "_"))
                if not os.path.isfile(p):
                    err += f"{tool}: {fname}: No such file\n"
                    continue
                with open(p, "rb") as f:
                    h = _hl.new(algo, f.read()).hexdigest()
                out.append(f"{h}  {fname}")
            return {"stdout": "\n".join(out), "stderr": err, "exitCode": 0 if not err else 1}
        if tool == "base64":
            # base64 [file] or base64 -d file
            decode = "-d" in rest
            args2 = [a for a in rest if a != "-d"]
            if not args2:
                data = sys.stdin.read() if not sys.stdin.isatty() else b""
                if decode:
                    return {"stdout": _b64_term.b64decode(data).decode("utf-8", "replace"), "stderr": "", "exitCode": 0}
                return {"stdout": _b64_term.b64encode(data).decode(), "stderr": "", "exitCode": 0}
            out, err = [], ""
            for fname in args2:
                p = os.path.join(workdir, fname.lstrip("/\\").replace("..", "_"))
                if not os.path.isfile(p):
                    err += f"base64: {fname}: No such file\n"
                    continue
                with open(p, "rb") as f:
                    data = f.read()
                if decode:
                    out.append(_b64_term.b64decode(data).decode("utf-8", "replace"))
                else:
                    out.append(_b64_term.b64encode(data).decode())
            return {"stdout": "\n".join(out), "stderr": err, "exitCode": 0 if not err else 1}
        if tool == "xxd":
            import binascii as _bx
            if not rest:
                return {"stdout": "", "stderr": "xxd: missing filename", "exitCode": 1}
            p = os.path.join(workdir, rest[0].lstrip("/\\").replace("..", "_"))
            if not os.path.isfile(p):
                return {"stdout": "", "stderr": f"xxd: {rest[0]}: No such file", "exitCode": 1}
            with open(p, "rb") as f:
                data = f.read()
            return {"stdout": _bx.hexlify(data).decode(), "stderr": "", "exitCode": 0}
        if tool == "tr":
            if len(rest) < 2:
                return {"stdout": "", "stderr": "tr: usage: tr SET1 SET2", "exitCode": 1}
            set1, set2 = rest[0], rest[1]
            # Read from stdin or files? simple: read from args after set1/set2
            if len(rest) > 2:
                src = " ".join(rest[2:])
                for a, b in zip(set1, set2):
                    src = src.replace(a, b)
                return {"stdout": src, "stderr": "", "exitCode": 0}
            return {"stdout": "", "stderr": "tr: no input", "exitCode": 1}
    except Exception as e:
        return {"stdout": "", "stderr": f"{tool}: {e}", "exitCode": 1}
    return None  # not a builtin


HELP_TEXT = """الأوامر الأساسية (تعمل دائماً):
  ls, cat <file>, pwd, echo <text>, whoami, clear, help
  sha256sum <file>, md5sum <file>, sha1sum <file>
  base64 [-d] <file>     ترميز/فك Base64
  xxd <file>             عرض hex
  tr SET1 SET2 <text>    استبدال أحرف

الأدوات الخارجية (مفعّلة لهذا التحدي): انظر whitelist في Cheat Sheet.
  مثال:  python -c "print('hello')"
          openssl enc -d -aes-256-cbc -in f.enc -k SECRET
"""


@app.post("/api/training/terminal")
async def training_terminal(req: TerminalRequest):
    """Execute a terminal command in the challenge's sandbox for real."""
    team_role = req.teamRole or "red"
    challenge_id = req.challengeId
    command = (req.command or "").strip()

    if not command:
        return {"stdout": "", "stderr": "❌ أمر فارغ", "exitCode": 1}
    if not challenge_id:
        return {"stdout": "", "stderr": "❌ challengeId مفقود", "exitCode": 1}

    # Pull the row (for whitelist) and create/load the workdir
    workdir, row = await _get_or_create_workdir(team_role, challenge_id)
    allowed = (row or {}).get("tools_whitelist") or []

    # Parse the command safely
    try:
        parts = _shlex.split(command)
    except ValueError as e:
        return {"stdout": "", "stderr": f"❌ صيغة الأمر: {e}", "exitCode": 2}
    if not parts:
        return {"stdout": "", "stderr": "", "exitCode": 0}

    tool = parts[0]

    # submit is handled client-side already; refuse here to avoid confusion
    if tool == "submit":
        return {"stdout": "", "stderr": "❌ استخدم نموذج الإجابة في اللوحة، أو اكتب submit في الـ terminal بعد ربطه بالـ backend.", "exitCode": 1}

    # Built-ins
    if tool in {"cat", "ls", "pwd", "echo", "whoami", "clear", "help",
                "sha256sum", "md5sum", "sha1sum", "base64", "xxd", "tr"}:
        result = _shell_builtins(parts, workdir)
        if result is not None:
            return result

    # Whitelist check (python/python3 are always allowed for user-authored scripts)
    ALWAYS_ALLOWED = {"python", "python3", "py"}
    if tool not in allowed and tool not in ALWAYS_ALLOWED:
        return {
            "stdout": "",
            "stderr": f"❌ '{tool}' غير مسموح في هذا التحدي.\nالأدوات المسموحة: {', '.join(allowed) if allowed else '(لا توجد)'}",
            "exitCode": 126,
        }

    # Run real subprocess
    try:
        env = os.environ.copy()
        env["PYTHONIOENCODING"] = "utf-8"
        env["PYTHONUTF8"] = "1"
        proc = _sp.run(
            parts,
            cwd=workdir,
            capture_output=True,
            timeout=8,
            env=env,
        )
        stdout = (proc.stdout or b"").decode("utf-8", errors="replace")
        stderr = (proc.stderr or b"").decode("utf-8", errors="replace")
        return {
            "stdout": stdout[:8000],
            "stderr": stderr[:3000],
            "exitCode": proc.returncode,
        }
    except FileNotFoundError:
        return {"stdout": "", "stderr": f"❌ '{tool}' غير مثبت على خادم الساندبوكس.", "exitCode": 127}
    except _sp.TimeoutExpired:
        return {"stdout": "", "stderr": "⏱️ انتهت المهلة (8 ثوانٍ). قد يكون الأمر يدور في حلقة لا نهائية.", "exitCode": 124}
    except Exception as e:
        return {"stdout": "", "stderr": f"❌ خطأ: {e}", "exitCode": 1}


# ---------- Terminal Workdir File I/O (for the OS simulator) ----------

def _safe_join(workdir: str, filename: str) -> str:
    """Resolve filename inside workdir, blocking path traversal."""
    clean = (filename or "").lstrip("/\\").replace("..", "_").replace("\\", "/")
    if not clean:
        raise ValueError("empty filename")
    target = os.path.normpath(os.path.join(workdir, clean))
    workdir_abs = os.path.normpath(workdir)
    if not target.startswith(workdir_abs):
        raise ValueError("path traversal blocked")
    return target


@app.post("/api/training/terminal/write")
async def training_terminal_write(req: TerminalWriteRequest):
    """Write a file (e.g. a Python script the user wrote in the notepad) into
    the challenge's sandbox workdir so that `python <file>.py` can execute it."""
    team_role = req.teamRole or "red"
    challenge_id = req.challengeId
    if not challenge_id:
        return {"ok": False, "error": "❌ challengeId مفقود"}
    if not req.filename:
        return {"ok": False, "error": "❌ اسم الملف مفقود"}
    if len(req.content) > 200_000:
        return {"ok": False, "error": "❌ الملف كبير جداً (الحد 200KB)"}

    workdir, _row = await _get_or_create_workdir(team_role, challenge_id)
    try:
        target = _safe_join(workdir, req.filename)
    except ValueError as e:
        return {"ok": False, "error": f"❌ مسار غير مسموح: {e}"}

    try:
        os.makedirs(os.path.dirname(target) or workdir, exist_ok=True)
        with open(target, "w", encoding="utf-8", newline="\n") as f:
            f.write(req.content)
        return {"ok": True, "path": os.path.relpath(target, workdir).replace("\\", "/")}
    except Exception as e:
        return {"ok": False, "error": f"❌ تعذّر الحفظ: {e}"}


@app.post("/api/training/terminal/list")
async def training_terminal_list(req: TerminalListRequest):
    """List the files currently in the challenge's sandbox workdir
    (so the file explorer can see scripts the user just saved)."""
    team_role = req.teamRole or "red"
    challenge_id = req.challengeId
    if not challenge_id:
        return {"files": []}

    workdir, _row = await _get_or_create_workdir(team_role, challenge_id)
    files = []
    try:
        for name in sorted(os.listdir(workdir)):
            if name.startswith("."):
                continue
            p = os.path.join(workdir, name)
            if os.path.isfile(p):
                try:
                    with open(p, "r", encoding="utf-8", errors="replace") as f:
                        content = f.read()
                    if len(content) > 50_000:
                        content = content[:50_000] + "\n... (truncated)"
                    files.append({"name": name, "content": content})
                except Exception:
                    files.append({"name": name, "content": "(binary file)"})
    except Exception:
        pass
    return {"files": files}


# ---------- Code Evaluation (local Groq AI) ----------

@app.post("/api/training/evaluate")
async def evaluate_training(req: EvaluateRequest, background_tasks: BackgroundTasks):
    challenge = req.originalChallenge
    user_code = req.userCode

    eval_prompt = f"""أنت مهندس أمن سيبراني خبير ومراجع أكواد.
مهمتك: تقييم الكود أو الاستغلال الذي قدمه المستخدم.
دور المستخدم هو: {req.teamRole}

إذا كان دور المستخدم هو "blue" (مدافع): 
- إذا كان الكود المعدل يسد الثغرة الأمنية ويحل المشكلة بشكل صحيح، أرجع secured: true.
- إذا لم تحل المشكلة أو كان خاطئاً، أرجع secured: false.

إذا كان دور المستخدم هو "red" (مهاجم):
- إذا كان الكود (أو Payload) يستغل الثغرة بنجاح، أرجع secured: true (نقصد بها النجاح).
- إذا كان الاستغلال فاشلاً، أرجع secured: false.

أرجع JSON فقط:
{{
  "secured": true/false,
  "feedback": "تقييمك باللغة العربية"
}}

التحدي الأصلي:
- الثغرة: {challenge.get("vulnerabilityLocation", "")}
- الإجابة المتوقعة: {challenge.get("expectedAnswer", "")}
- الشرح: {challenge.get("explanation", "")}

كود/استغلال المستخدم:
{user_code}"""

    print(f"[DEBUG] GROQ_API_KEY exists: {bool(GROQ_API_KEY)}")
    print(f"[DEBUG] GROQ_API_KEY length: {len(GROQ_API_KEY) if GROQ_API_KEY else 0}")
    
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(GROQ_API_URL, json={
            "model": "llama-3.3-70b-versatile",
            "messages": [
                {"role": "system", "content": "أنت مقيّم أكواد أمني. أعد JSON فقط."},
                {"role": "user", "content": eval_prompt},
            ],
            "temperature": 0.2,
            "max_tokens": 1024,
        }, headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {GROQ_API_KEY}",
        })

    print(f"[DEBUG] Groq API response status: {resp.status_code}")
    if resp.status_code != 200:
        error_detail = f"Groq API error: {resp.status_code}"
        try:
            error_body = resp.text
            print(f"[DEBUG] Groq API error body: {error_body}")
            error_detail += f" - {error_body}"
        except:
            pass
        raise HTTPException(status_code=500, detail=error_detail)

    content = resp.json()["choices"][0]["message"]["content"]
    evaluation = parse_json_safe(content)

    if evaluation.get("secured") is True:
        scenario_id = challenge.get("scenarioId") or challenge.get("id")
        if scenario_id:
            module_name = challenge.get("type", "")
            topic_info = CYBER_SECURITY_TOPICS.get(module_name, {"path": "web-security", "category": "web"})
            path = topic_info.get("path", "web-security")
            category = topic_info.get("category", "web")
            difficulty = challenge.get("difficulty", "متوسط")

            background_tasks.add_task(
                handle_background_replacement,
                scenario_id,
                req.teamRole,
                module_name,
                path,
                category,
                difficulty
            )

    return {"evaluation": evaluation}


# ---------- Web Exploitation 3-Layer Validation (v2) ----------

import re as _re_webex

@app.post("/api/training/evaluate-web")
async def evaluate_web_exploitation(req: WebEvaluateRequest):
    """3-layer validation for v2 web exploitation challenges.

    Layer 1 (PATTERN): payload matches the challenge's validation_pattern regex
    Layer 2 (SINK):    iframe postMessage confirms the vulnerable sink was hit
    Layer 3 (SECRET):  iframe postMessage returned the challenge's secret_marker

    All three must pass. Returns the flag_preview on success.
    """
    challenge_id = req.challengeId
    payload = (req.payload or "").strip()
    signal = req.exploitSignal or {}

    if not challenge_id:
        return {"success": False, "error": "challengeId مفقود"}
    if not payload:
        return {"success": False, "error": "لم تُرسل payload", "layer": "input"}

    # ---- Load the challenge row ----
    row = await fetch_scenario_by_id(req.teamRole or "red", challenge_id, challenge_type="web")
    if not row:
        return {"success": False, "error": "التحدي غير موجود", "layer": "load"}

    sink_expected = row.get("sink_type") or ""
    secret_expected = row.get("secret_marker") or ""
    pattern_str = row.get("validation_pattern") or ""
    flag_preview = row.get("flag_preview") or ""
    xp_reward = int(row.get("xp_reward") or 100)

    # ---- Layer 1: PATTERN ----
    if pattern_str:
        try:
            if not _re_webex.search(pattern_str, payload, _re_webex.IGNORECASE):
                return {
                    "success": False,
                    "error": "الـ payload لا يطابق نمط الثغرة المتوقع",
                    "layer": "pattern",
                    "hint": "راجع الكود المصدري وحدد نوع الـ sink (innerHTML / eval / SQL concat / SSRF / etc.)",
                }
        except _re_webex.error as e:
            print(f"[evaluate-web] bad pattern in DB: {e}")
            # Don't block the user on a backend regex bug

    # ---- Layer 2: SINK ----
    sink_observed = signal.get("sink") or ""
    if sink_expected:
        if not sink_observed:
            return {
                "success": False,
                "error": "لم يثبت الـ sink تنفيذه في الـ iframe. حمّل الـ payload في المعاينة أولاً",
                "layer": "sink",
                "expected_sink": sink_expected,
            }
        if sink_observed != sink_expected:
            return {
                "success": False,
                "error": f"الـ sink المُلتقَط ({sink_observed}) لا يطابق المتوقع ({sink_expected})",
                "layer": "sink",
                "expected_sink": sink_expected,
                "observed_sink": sink_observed,
            }

    # ---- Layer 3: SECRET ----
    secret_observed = signal.get("secret") or ""
    if secret_expected:
        if not secret_observed:
            return {
                "success": False,
                "error": "لم نستلم الـ secret. الـ flag مخفي في الـ lab — استخدم الثغرة لاستخراجه (مثلاً عبر document.cookie أو الـ response)",
                "layer": "secret",
            }
        if secret_observed.lower() != secret_expected.lower():
            return {
                "success": False,
                "error": "الـ secret المُرسَل لا يطابق المتوقع",
                "layer": "secret",
            }

    # ---- All 3 layers passed → success ----
    print(f"[evaluate-web] ✓ challenge={challenge_id} sink={sink_observed} secret_ok=True")

    # Optional: trigger background replacement (same as legacy evaluate)
    try:
        module_name = row.get("module", "")
        topic_info = CYBER_SECURITY_TOPICS.get(module_name, {"path": "web-security", "category": "web"})
        # No BackgroundTasks here — caller handles XP. Replace is best-effort.
    except Exception:
        pass

    return {
        "success": True,
        "flag": flag_preview,
        "xp": xp_reward,
        "message": "تم استغلال الثغرة بنجاح! 🎉",
        "layer": "all",
        "sink_confirmed": sink_observed,
    }


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8090))
    uvicorn.run(app, host="0.0.0.0", port=port)
