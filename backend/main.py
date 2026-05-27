from dotenv import load_dotenv

load_dotenv()

import os
import json
import re
import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://yevtnyokixocpihpdwqu.supabase.co")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")

app = FastAPI(title="APEX Backend")

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


def parse_json_safe(raw: str) -> dict:
    start = raw.find("{")
    end = raw.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("No JSON found")
    json_str = raw[start:end+1]
    json_str = re.sub(r"[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]", "", json_str)
    return json.loads(json_str)


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


class EvaluateRequest(BaseModel):
    action: str = "evaluate"
    originalChallenge: dict
    userCode: str


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


# ---------- Training Generation (local Groq AI) ----------

@app.post("/api/training/generate")
async def generate_training(req: TrainingRequest):
    topic = MODULE_TOPIC_MAP.get(req.module, f"موضوع: {req.module} - {req.path} - {req.category}")

    system_prompt = f"""أنت مدرب أمن سيبراني خبير.
توليد تدريب حول الموضوع المحدد بالضبط. لا تنحرف.
أرجع JSON فقط.

{{
  "title": "عنوان التدريب",
  "story": "قصة قصيرة",
  "task": "المطلوب",
  "htmlPreview": "صفحة HTML كاملة تفاعلية (70 سطراً)",
  "vulnerabilityLocation": "وصف الثغرة",
  "hints": ["تلميح 1","تلميح 2","تلميح 3"],
  "expectedAnswer": "الإجابة",
  "explanation": "شرح كامل",
  "xpReward": 150,
  "difficulty": "مبتدئ"
}}

htmlPreview: تفاعلي، ألوان داكنة مع #00d4aa، عربي، ألوان صلبة غير شفافة."""

    user_prompt = f"""الموضوع: {topic}
الوحدة: {req.module}
المسار: {req.path}
التصنيف: {req.category}

أنشئ تدريباً حول هذا الموضوع فقط."""

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

    if resp.status_code != 200:
        raise HTTPException(status_code=500, detail=f"Groq API error: {resp.status_code}")

    content = resp.json()["choices"][0]["message"]["content"]
    training = parse_json_safe(content)

    if not training.get("htmlPreview", "").strip():
        training["htmlPreview"] = FALLBACK_HTML

    return {"training": training}


# ---------- Code Evaluation (local Groq AI) ----------

@app.post("/api/training/evaluate")
async def evaluate_training(req: EvaluateRequest):
    challenge = req.originalChallenge
    user_code = req.userCode

    eval_prompt = f"""أنت مهندس أمن سيبراني خبير ومراجع أكواد.
مهمتك: تقييم الكود المصلح الذي قدمه المستخدم.

إذا كان الكود المعدل يسد الثغرة الأمنية بشكل صحيح، أرجع secured: true.
إذا كانت الثغرة لا تزال موجودة، أرجع secured: false.

أرجع JSON فقط:
{{
  "secured": true/false,
  "feedback": "تقييمك باللغة العربية"
}}

التحدي الأصلي:
- الثغرة: {challenge.get("vulnerabilityLocation", "")}
- الشرح: {challenge.get("explanation", "")}

كود المستخدم:
{user_code}"""

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

    if resp.status_code != 200:
        raise HTTPException(status_code=500, detail=f"Groq API error: {resp.status_code}")

    content = resp.json()["choices"][0]["message"]["content"]
    evaluation = parse_json_safe(content)

    return {"evaluation": evaluation}


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)
