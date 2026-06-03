"""
APEX Scenario Pool Seeder (v2)
==============================
سكربت يدوي لتعبئة بركة السيناريوهات (Blue + Red) عند الحاجة.

الاستخدام:
    python populate_db.py blue 30
    python populate_db.py red 30
    python populate_db.py both 30

المنطق:
    - target pool size: 30 لكل فريق
    - refill threshold: 20 → يولّد 10
    - module-balanced (round-robin) لمنع تركّز الموديولات
    - ينفّذ auto-dedup ضد التكرار
"""

import os
import sys
import re
import json
import random
import asyncio
import httpx
from dotenv import load_dotenv

sys.stdout.reconfigure(encoding='utf-8')

backend_dir = os.path.dirname(os.path.abspath(__file__))
load_dotenv(dotenv_path=os.path.join(backend_dir, ".env"))

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://yevtnyokixocpihpdwqu.supabase.co")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"

POOL_TARGET = 30

CYBER_SECURITY_TOPICS = {
    "xss": {"name": "ثغرات XSS", "category": "Web Security", "path": "web-security"},
    "sql-injection": {"name": "ثغرات SQL Injection", "category": "Web Security", "path": "web-security"},
    "csrf": {"name": "ثغرات CSRF", "category": "Web Security", "path": "web-security"},
    "ssrf": {"name": "ثغرات SSRF", "category": "Web Security", "path": "web-security"},
    "idor": {"name": "ثغرات IDOR", "category": "Web Security", "path": "web-security"},
    "lfi-rfi": {"name": "ثغرات LFI/RFI", "category": "Web Security", "path": "web-security"},
    "xxe": {"name": "ثغرات XXE", "category": "Web Security", "path": "web-security"},
    "command-injection": {"name": "حقن الأوامر", "category": "Web Security", "path": "web-security"},
    "auth-bypass": {"name": "تجاوز المصادقة", "category": "Web Security", "path": "web-security"},
    "misconfig": {"name": "التكوين الخاطئ", "category": "Web Security", "path": "web-security"},
    "packet-analysis": {"name": "تحليل الحزم", "category": "Network Security", "path": "network-security"},
    "firewall": {"name": "جدران الحماية", "category": "Network Security", "path": "network-security"},
    "scanning": {"name": "مسح الشبكات", "category": "Network Security", "path": "network-security"},
    "mitm": {"name": "هجمات MITM", "category": "Network Security", "path": "network-security"},
    "dns-poisoning": {"name": "تسميم DNS", "category": "Network Security", "path": "network-security"},
    "encryption-basics": {"name": "أساسيات التشفير", "category": "Cryptography", "path": "cryptography"},
    "hash-cracking": {"name": "كسر الهاش", "category": "Cryptography", "path": "cryptography"},
    "rsa-aes": {"name": "RSA/AES", "category": "Cryptography", "path": "cryptography"},
    "steganography": {"name": "إخفاء المعلومات", "category": "Cryptography", "path": "cryptography"},
    "binary-analysis": {"name": "تحليل الثنائيات", "category": "Reverse Engineering", "path": "reverse-engineering"},
    "assembly-cracking": {"name": "كسر الأسمبلي", "category": "Reverse Engineering", "path": "reverse-engineering"},
    "linux-privesc": {"name": "تصعيد Linux", "category": "Systems Security", "path": "systems-security"},
    "windows-privesc": {"name": "تصعيد Windows", "category": "Systems Security", "path": "systems-security"},
    "active-directory": {"name": "Active Directory", "category": "Systems Security", "path": "systems-security"},
    "android-ios": {"name": "أمن الموبايل", "category": "Mobile Security", "path": "mobile-security"},
    "cloud-config": {"name": "أمن السحابة", "category": "Cloud Security", "path": "cloud-security"},
    "log-analysis": {"name": "تحليل السجلات", "category": "Digital Forensics", "path": "forensics"},
    "memory-forensics": {"name": "تحليل الذاكرة", "category": "Digital Forensics", "path": "forensics"},
}


def parse_json_safe(raw: str) -> dict:
    cleaned = raw.strip()
    fence_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", cleaned, re.IGNORECASE)
    if fence_match:
        cleaned = fence_match.group(1).strip()
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("No JSON found in response")
    cleaned = re.sub(r"[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]", "", cleaned[start:end + 1])
    return json.loads(cleaned)


def scenario_table(team_role: str) -> str:
    return "blue_scenarios" if team_role == "blue" else "red_scenarios"


def headers():
    return {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
        "Content-Type": "application/json",
    }


async def get_scenario_count(team_role: str) -> int:
    table = scenario_table(team_role)
    url = f"{SUPABASE_URL}/rest/v1/{table}?select=id"
    async with httpx.AsyncClient() as client:
        resp = await client.get(url, headers=headers())
        if resp.status_code == 200:
            return len(resp.json())
    return 0


async def get_existing_titles(team_role: str) -> set:
    table = scenario_table(team_role)
    url = f"{SUPABASE_URL}/rest/v1/{table}?select=title"
    async with httpx.AsyncClient() as client:
        resp = await client.get(url, headers=headers())
        if resp.status_code == 200:
            return {r.get("title", "").strip().lower() for r in resp.json() if r.get("title")}
    return set()


async def insert_scenario(scenario_data: dict, team_role: str) -> bool:
    table = scenario_table(team_role)
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    async with httpx.AsyncClient() as client:
        resp = await client.post(url, json=scenario_data, headers=headers())
        if resp.status_code in (200, 201):
            return True
        print(f"    [-] Insert failed ({resp.status_code}): {resp.text[:120]}")
        return False


async def generate_scenario_from_groq(team_role: str, module: str, difficulty: str, existing_titles: set) -> dict:
    topic = CYBER_SECURITY_TOPICS[module]["name"]
    team_label = "الفريق الأزرق (مدافع)" if team_role == "blue" else "الفريق الأحمر (مهاجم)"
    xp = 200 if difficulty == "قوي" else 150 if difficulty == "متوسط" else 100

    system_prompt = f"""أنت كبير مصممي سيناريوهات الأمن السيبراني في منصة APEX.
صمم سيناريو تدريبي احترافي مبتكر بمستوى HackTheBox/PortSwigger/SANS.

الدور: {team_label}
الموضوع: {topic}
الصعوبة: {difficulty}

قواعد:
1. واقعي ومستوحى من حوادث أمنية حقيقية (SolarWinds, Log4Shell, Capital One, إلخ)
2. اذكر stack تقني محدد (Nginx 1.18, MySQL 8, AWS, K8s 1.28, AD 2019)
3. لا تكرّر العناوين التالية: {', '.join(list(existing_titles)[:20]) if existing_titles else 'لا يوجد'}
4. اجعل القصة فريدة: شركة وهمية، تأثير رقمي، TTPs من MITRE ATT&CK

أرجع JSON خام فقط:
{{"title":"...","story":"...","task":"...","difficulty":"{difficulty}","xpReward":{xp}}}"""

    user_prompt = f"صمم سيناريو {team_label} حصري عن {topic} (الصعوبة: {difficulty}). اجعله مختلفاً عن كل السيناريوهات السابقة."

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(GROQ_API_URL, json={
            "model": "llama-3.3-70b-versatile",
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": 0.95,
            "max_tokens": 1400,
        }, headers={"Content-Type": "application/json", "Authorization": f"Bearer {GROQ_API_KEY}"})

    if resp.status_code != 200:
        raise Exception(f"Groq API error: {resp.status_code} - {resp.text[:200]}")
    return parse_json_safe(resp.json()["choices"][0]["message"]["content"])


async def populate_role(team_role: str, target: int):
    print(f"\n=== Populating {team_role.upper()} → target {target} ===")
    existing = await get_scenario_count(team_role)
    to_generate = max(0, target - existing)
    print(f"   Current: {existing} | To generate: {to_generate}")
    if to_generate == 0:
        return

    topics = list(CYBER_SECURITY_TOPICS.keys())
    difficulties = ["مبتدئ", "متوسط", "قوي"]
    existing_titles = await get_existing_titles(team_role)
    generated = 0
    attempts = 0
    max_attempts = to_generate * 3

    while generated < to_generate and attempts < max_attempts:
        attempts += 1
        module = topics[attempts % len(topics)]
        difficulty = difficulties[attempts % len(difficulties)]
        try:
            print(f"   [{generated + 1}/{to_generate}] {module} ({difficulty})...", end=" ", flush=True)
            groq = await generate_scenario_from_groq(team_role, module, difficulty, existing_titles)
            title = (groq.get("title") or "").strip()
            if title.lower() in existing_titles:
                print(f"DUPLICATE — retrying")
                continue
            success = await insert_scenario({
                "module": module,
                "title": title,
                "story": groq.get("story", ""),
                "task_outline": groq.get("task", ""),
                "difficulty": groq.get("difficulty", difficulty),
                "xp_reward": groq.get("xpReward", 150),
            }, team_role)
            if success:
                existing_titles.add(title.lower())
                generated += 1
                print("OK")
            await asyncio.sleep(8)
        except Exception as e:
            print(f"ERR: {e}")
            await asyncio.sleep(15)

    print(f"   → Generated {generated}/{to_generate}")


async def main():
    print("APEX Scenario Seeder v2 (target=30, threshold=20, batch=10)")
    if not GROQ_API_KEY or not SUPABASE_ANON_KEY:
        print("Error: Missing API Keys in .env (GROQ_API_KEY, SUPABASE_ANON_KEY)")
        return

    args = sys.argv[1:]
    if not args or args[0] == "both":
        await populate_role("blue", POOL_TARGET)
        await populate_role("red", POOL_TARGET)
    elif args[0] in ("blue", "red"):
        target = int(args[1]) if len(args) > 1 else POOL_TARGET
        await populate_role(args[0], target)
    else:
        print(f"Usage: python populate_db.py [blue|red|both] [count]")

    for role in ("blue", "red"):
        c = await get_scenario_count(role)
        print(f"   {role.upper()} pool: {c}/{POOL_TARGET}")


if __name__ == "__main__":
    asyncio.run(main())
