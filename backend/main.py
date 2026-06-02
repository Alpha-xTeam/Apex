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


# ---------- Supabase PostgREST Client Helpers ----------

async def get_supabase_challenge_count(team_role: str) -> int:
    table = "blue_challenges" if team_role == "blue" else "red_challenges"
    if not SUPABASE_ANON_KEY or not SUPABASE_URL:
        return 0
    headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {SUPABASE_ANON_KEY}"
    }
    url = f"{SUPABASE_URL}/rest/v1/{table}?select=id"
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, headers=headers)
            if resp.status_code == 200:
                return len(resp.json())
    except Exception as e:
        print(f"Error checking Supabase challenge count: {e}")
    return 0


async def fetch_random_challenge_from_supabase(team_role: str, module: str) -> Optional[dict]:
    table = "blue_challenges" if team_role == "blue" else "red_challenges"
    if not SUPABASE_ANON_KEY or not SUPABASE_URL:
        return None
    headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {SUPABASE_ANON_KEY}"
    }
    url = f"{SUPABASE_URL}/rest/v1/{table}?module=eq.{module}"
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, headers=headers)
            if resp.status_code == 200:
                challenges = resp.json()
                if challenges:
                    return random.choice(challenges)
    except Exception as e:
        print(f"Error fetching challenge from Supabase: {e}")
    return None


async def delete_challenge_from_supabase(challenge_id: str, team_role: str):
    table = "blue_challenges" if team_role == "blue" else "red_challenges"
    if not SUPABASE_ANON_KEY or not SUPABASE_URL:
        return
    headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {SUPABASE_ANON_KEY}"
    }
    url = f"{SUPABASE_URL}/rest/v1/{table}?id=eq.{challenge_id}"
    try:
        async with httpx.AsyncClient() as client:
            await client.delete(url, headers=headers)
    except Exception as e:
        print(f"Error deleting challenge {challenge_id} from Supabase: {e}")


async def insert_challenge_to_supabase(challenge_data: dict, team_role: str):
    table = "blue_challenges" if team_role == "blue" else "red_challenges"
    if not SUPABASE_ANON_KEY or not SUPABASE_URL:
        return
    headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
        "Content-Type": "application/json"
    }
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    try:
        async with httpx.AsyncClient() as client:
            await client.post(url, json=challenge_data, headers=headers)
    except Exception as e:
        print(f"Error inserting challenge to Supabase: {e}")


# ---------- Data Model Mappings ----------

def map_db_to_frontend(db_challenge: dict) -> dict:
    return {
        "id": str(db_challenge.get("id")) if db_challenge.get("id") else None,
        "title": db_challenge.get("title"),
        "story": db_challenge.get("story"),
        "type": db_challenge.get("module"),
        "task": db_challenge.get("task"),
        "code": db_challenge.get("code"),
        "codeLanguage": db_challenge.get("code_language"),
        "htmlPreview": db_challenge.get("html_preview"),
        "logData": db_challenge.get("log_data"),
        "configData": db_challenge.get("config_data"),
        "vulnerabilityLocation": db_challenge.get("vulnerability_location"),
        "hints": db_challenge.get("hints") if isinstance(db_challenge.get("hints"), list) else json.loads(db_challenge.get("hints") or "[]"),
        "expectedAnswer": db_challenge.get("expected_answer"),
        "explanation": db_challenge.get("explanation"),
        "xpReward": db_challenge.get("xp_reward", 150),
        "difficulty": db_challenge.get("difficulty", "متوسط")
    }


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


def map_groq_to_db(groq_challenge: dict, module: str, saved_file_path: str = "") -> dict:
    log_data_value = groq_challenge.get("logData") or groq_challenge.get("log_data") or ""
    if saved_file_path:
        log_data_value = json.dumps({
            "downloadable_file": os.path.basename(saved_file_path),
            "preview": log_data_value[:200] + "..." if len(log_data_value) > 200 else log_data_value
        }, ensure_ascii=False)

    return {
        "module": module,
        "title": groq_challenge.get("title", ""),
        "story": groq_challenge.get("story", ""),
        "task": groq_challenge.get("task", ""),
        "code": groq_challenge.get("code"),
        "code_language": groq_challenge.get("codeLanguage") or groq_challenge.get("code_language"),
        "html_preview": groq_challenge.get("htmlPreview") or groq_challenge.get("html_preview"),
        "log_data": log_data_value,
        "config_data": groq_challenge.get("configData") or groq_challenge.get("config_data"),
        "vulnerability_location": groq_challenge.get("vulnerabilityLocation") or groq_challenge.get("vulnerability_location"),
        "hints": json.dumps(groq_challenge.get("hints", []) if isinstance(groq_challenge.get("hints"), list) else json.loads(groq_challenge.get("hints") or "[]"), ensure_ascii=False),
        "expected_answer": groq_challenge.get("expectedAnswer") or groq_challenge.get("expected_answer", ""),
        "explanation": groq_challenge.get("explanation", ""),
        "xp_reward": groq_challenge.get("xpReward") or groq_challenge.get("xp_reward", 150),
        "difficulty": groq_challenge.get("difficulty", "متوسط")
    }


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


# ---------- Training Generation Helper ----------

async def generate_challenge_from_groq(team_role: str, module: str, path: str = "web-security", category: str = "web", difficulty: str = "متوسط") -> dict:
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

    system_prompt = f"""أنت مدرب أمن سيبراني خبير ومحترف للغاية.
توليد تدريب حول الموضوع المحدد بالضبط وبدرجة الصعوبة المطلوبة. لا تنحرف أبداً عن الموضوع ودور اللاعب.
درجة الصعوبة المطلوبة للتحدي: {difficulty}
{role_instructions}

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

أنشئ تحدياً مخصصاً ومحفزاً يناسب دور اللاعب الحالي ودرجة الصعوبة المطلوبة تماماً."""

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

async def generate_and_store_challenge(team_role: str, module: str, path: str = "web-security", category: str = "web", difficulty: str = "متوسط"):
    global RATE_LIMIT_ALERTED
    try:
        groq_challenge = await generate_challenge_from_groq(team_role, module, path, category, difficulty)
        saved_file_path = ""
        if groq_challenge.get("fileToGenerate"):
            saved_file_path = save_challenge_file(groq_challenge["fileToGenerate"], module, team_role)
        db_challenge = map_groq_to_db(groq_challenge, module, saved_file_path)
        db_challenge["difficulty"] = difficulty
        await insert_challenge_to_supabase(db_challenge, team_role)
        print(f"Background Generator: Stored a new {team_role} challenge ({difficulty}) for {module} in Supabase pool.")
        RATE_LIMIT_ALERTED = False
    except Exception as e:
        if "429" in str(e) or "Rate Limit" in str(e):
            if not RATE_LIMIT_ALERTED:
                print("⚠️ [Groq AI] Rate Limit 429. Retrying...")
                RATE_LIMIT_ALERTED = True
        else:
            import traceback
            traceback.print_exc()
            print(f"Background Generator Error for {team_role} - {module}: {e}")


async def handle_background_replacement(challenge_id: str, team_role: str, module: str, path: str, category: str, difficulty: str):
    try:
        # Delete solved / used challenge immediately
        await delete_challenge_from_supabase(challenge_id, team_role)
        print(f"Deleted retrieved challenge {challenge_id} from Supabase.")
        
        # Populate the pool with a brand new challenge to maintain the cache pool
        await generate_and_store_challenge(team_role, module, path, category, difficulty)
    except Exception as e:
        print(f"Error in background replacement task: {e}")


async def populate_pool_background():
    await asyncio.sleep(8)  # Gentle wait on startup
    print("Background populate worker started successfully.")
    topics = list(CYBER_SECURITY_TOPICS.keys())
    difficulties = ["مبتدئ", "متوسط", "قوي"]
    
    # Hysteresis state flags
    refilling_blue = False
    refilling_red = False
    
    # Track last values to prevent duplicate console spam
    last_blue_count = -1
    last_red_count = -1
    last_refill_blue = None
    last_refill_red = None
    
    while True:
        try:
            # Run a dynamic relevance audit to purge mismatched challenges automatically upon check
            try:
                # We can dynamically invoke our audit process
                # Purge mismatched blue/red challenges
                for table_name in ["blue_challenges", "red_challenges"]:
                    headers = {"apikey": SUPABASE_ANON_KEY, "Authorization": f"Bearer {SUPABASE_ANON_KEY}"}
                    url = f"{SUPABASE_URL}/rest/v1/{table_name}?select=id,title,task,module"
                    resp = await httpx.AsyncClient().get(url, headers=headers)
                    if resp.status_code == 200:
                        challenges = resp.json()
                        for c in challenges:
                            mod = c.get("module", "")
                            title = (c.get("title") or "").lower()
                            task = (c.get("task") or "").lower()
                            # Verify if relevant keywords exist for the module
                            expected_kws = TOPIC_KEYWORDS.get(mod, [])
                            is_relevant = False
                            if not expected_kws:
                                is_relevant = True
                            else:
                                for kw in expected_kws:
                                    if kw in title or kw in task:
                                        is_relevant = True
                                        break
                            # Remove cross-topic leaks or mismatches
                            if mod in ["xss", "sql-injection", "csrf"]:
                                for bad_kw in ["جدار حماية", "firewall", "تشفير", "base64", "pcap", "wireshark", "هاش", "hash"]:
                                    if bad_kw in title or bad_kw in task:
                                        is_relevant = False
                            if not is_relevant:
                                print(f"♻️ [Auto-Purge] Challenge '{c['title']}' doesn't match module '{mod}'. Purging...")
                                del_url = f"{SUPABASE_URL}/rest/v1/{table_name}?id=eq.{c['id']}"
                                await httpx.AsyncClient().delete(del_url, headers=headers)
            except Exception as audit_err:
                print(f"Error during auto-audit in background: {audit_err}")

            blue_count = await get_supabase_challenge_count("blue")
            red_count = await get_supabase_challenge_count("red")
            
            # Update refilling states based on thresholds (Hysteresis)
            if blue_count < 100:
                refilling_blue = True
            elif blue_count >= 110:
                refilling_blue = False
                
            if red_count < 100:
                refilling_red = True
            elif red_count >= 110:
                refilling_red = False
                
            # Only print when counts or refilling statuses change
            if (blue_count != last_blue_count or 
                red_count != last_red_count or 
                refilling_blue != last_refill_blue or 
                refilling_red != last_refill_red):
                
                print(f"Pool status updated: Blue={blue_count} (Refilling: {refilling_blue}), Red={red_count} (Refilling: {refilling_red})")
                last_blue_count = blue_count
                last_red_count = red_count
                last_refill_blue = refilling_blue
                last_refill_red = refilling_red
            
            # Gradually populate until target size is reached
            if refilling_blue and blue_count < 110:
                module = random.choice(topics)
                difficulty = random.choice(difficulties)
                info = CYBER_SECURITY_TOPICS[module]
                await generate_and_store_challenge("blue", module, info["path"], info["category"], difficulty)
                await asyncio.sleep(15) # Shorter sleep to refill faster but safely
                continue
                
            if refilling_red and red_count < 110:
                module = random.choice(topics)
                difficulty = random.choice(difficulties)
                info = CYBER_SECURITY_TOPICS[module]
                await generate_and_store_challenge("red", module, info["path"], info["category"], difficulty)
                await asyncio.sleep(15)
                continue
            
            # Pool is fully seeded/satisfied, wait 5 minutes before checking again
            await asyncio.sleep(300)
        except Exception as e:
            print(f"Error in background populate loop: {e}")
            await asyncio.sleep(60)


@app.on_event("startup")
async def startup_event():
    # Force system execution of check
    sys_path = os.path.dirname(os.path.abspath(__file__))
    sys.path.append(sys_path)
    # Run the background seed task
    asyncio.create_task(populate_pool_background())


# ---------- Training List ----------

@app.get("/api/training/list")
async def list_challenges(team_role: str = "blue", difficulty: Optional[str] = None, limit: int = 100):
    """Return a preview list of cached challenges for display in the grid."""
    table = "blue_challenges" if team_role == "blue" else "red_challenges"
    if not SUPABASE_ANON_KEY or not SUPABASE_URL:
        return {"challenges": []}
    headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {SUPABASE_ANON_KEY}"
    }
    fields = "id,title,module,difficulty,xp_reward"
    url = f"{SUPABASE_URL}/rest/v1/{table}?select={fields}&limit={limit}"
    if difficulty:
        url += f"&difficulty=eq.{difficulty}"
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, headers=headers)
            if resp.status_code == 200:
                data = resp.json()
                enriched = []
                for c in data:
                    mod = c.get("module", "unknown")
                    info = CYBER_SECURITY_TOPICS.get(mod, {})
                    cat_name = info.get("category", "Web Security")
                    topic_path = info.get("path", "web-security")
                    title = c.get("title") or info.get("name", "تحدي غير معروف")
                    diff = c.get("difficulty") or "متوسط"
                    enriched.append({
                        "id": c["id"],
                        "title": title,
                        "module": mod,
                        "path": topic_path,
                        "category": cat_name,
                        "difficulty": diff,
                        "xpReward": c.get("xp_reward", 150),
                    })
                return {"challenges": enriched}
            else:
                raise HTTPException(status_code=resp.status_code, detail="Failed to fetch from Supabase")
    except Exception as e:
        print(f"Error listing challenges: {e}")
        raise HTTPException(status_code=500, detail=str(e))

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
    cached = None
    if req.challengeId:
        # Fetch the specific challenge by ID
        table = "blue_challenges" if req.teamRole == "blue" else "red_challenges"
        headers = {"apikey": SUPABASE_ANON_KEY, "Authorization": f"Bearer {SUPABASE_ANON_KEY}"}
        url = f"{SUPABASE_URL}/rest/v1/{table}?id=eq.{req.challengeId}"
        try:
            async with httpx.AsyncClient() as client:
                res = await client.get(url, headers=headers)
                if res.status_code == 200 and len(res.json()) > 0:
                    cached = res.json()[0]
        except Exception as e:
            print(f"Failed to fetch challenge {req.challengeId}: {e}")
    
    if not cached:
        # Try fetching a random cached challenge from Supabase
        cached = await fetch_random_challenge_from_supabase(req.teamRole, req.module)
    
    if cached:
        print(f"Cache Hit: Loaded cached challenge for {req.teamRole} - {req.module}")
        training_data = map_db_to_frontend(cached)
        return {"training": training_data}
    else:
        print(f"Cache Miss: Generating challenge synchronously for {req.teamRole} - {req.module}")
        difficulty = random.choice(["مبتدئ", "متوسط", "قوي"])
        info = CYBER_SECURITY_TOPICS.get(req.module, {"path": req.path, "category": req.category})
        training_data = await generate_challenge_from_groq(req.teamRole, req.module, info.get("path"), info.get("category"), difficulty)
        
        saved_file_path = ""
        if training_data.get("fileToGenerate"):
            saved_file_path = save_challenge_file(training_data["fileToGenerate"], req.module, req.teamRole)
        if saved_file_path:
            log_val = training_data.get("logData") or ""
            training_data["logData"] = json.dumps({
                "downloadable_file": os.path.basename(saved_file_path),
                "preview": log_val[:200] + "..." if len(log_val) > 200 else log_val
            }, ensure_ascii=False)

        # Add to Supabase cache pool in background for future users
        background_tasks.add_task(
            generate_and_store_challenge, 
            req.teamRole, 
            req.module, 
            info.get("path"), 
            info.get("category"),
            difficulty
        )
        
        return {"training": training_data}


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

    if evaluation.get("secured") is True and challenge.get("id"):
        # Queue background deletion and replacement since they solved it!
        module_name = challenge.get("type", "")
        topic_info = CYBER_SECURITY_TOPICS.get(module_name, {"path": "web-security", "category": "web"})
        path = topic_info.get("path", "web-security")
        category = topic_info.get("category", "web")
        difficulty = challenge.get("difficulty", "متوسط")
        
        background_tasks.add_task(
            handle_background_replacement,
            challenge["id"],
            req.teamRole,
            module_name,
            path,
            category,
            difficulty
        )

    return {"evaluation": evaluation}


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)
