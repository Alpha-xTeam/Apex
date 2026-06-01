import os
import json
import re
import httpx
import asyncio
import sys
import time
from dotenv import load_dotenv

# Reconfigure stdout to support UTF-8 encoding in Windows console
sys.stdout.reconfigure(encoding='utf-8')

# Load environment variables relative to this script
backend_dir = os.path.dirname(os.path.abspath(__file__))
load_dotenv(dotenv_path=os.path.join(backend_dir, ".env"))

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://yevtnyokixocpihpdwqu.supabase.co")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"

# مجلد لحفظ الملفات التي سينشئها السكريبت للتحديات
FILES_DIR = "challenge_files"
os.makedirs(FILES_DIR, exist_ok=True)

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
    "auth-bypass": {"name": "ثغرات تجاوز نظام المصادقة Authentication Bypass", "category": "Web Security", "path": "web-security"},
    "misconfig": {"name": "التكوين الأمني الخاطئ Security Misconfiguration", "category": "Web Security", "path": "web-security"},
    
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
    "forensics": {"name": "التحقيق الجنائي الرقمي Digital Forensics", "category": "Digital Forensics", "path": "forensics"},
}

FALLBACK_HTML = """<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><style>body{margin:0;padding:40px;font-family:sans-serif;background:#0b0b12;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;text-align:center}h1{color:#00d4aa;font-size:22px;margin-bottom:16px}p{color:rgba(255,255,255,0.6);font-size:14px;line-height:1.8;max-width:500px}</style></head><body><h1>🔐 منصة APEX للتدريب</h1><p>بيئة التدريب جاهزة، اتبع التعليمات في لوحة المهام لإكمال التحدي.</p></body></html>"""

def parse_json_safe(raw: str) -> dict:
    start = raw.find("{")
    end = raw.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("No JSON found in response")
    json_str = raw[start:end+1]
    json_str = re.sub(r"[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]", "", json_str)
    return json.loads(json_str)

async def get_supabase_challenge_count(team_role: str) -> int:
    table = "blue_challenges" if team_role == "blue" else "red_challenges"
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

async def insert_challenge_to_supabase(challenge_data: dict, team_role: str):
    table = "blue_challenges" if team_role == "blue" else "red_challenges"
    headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
        "Content-Type": "application/json"
    }
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    async with httpx.AsyncClient() as client:
        resp = await client.post(url, json=challenge_data, headers=headers)
        if resp.status_code not in (200, 201):
            print(f"Failed to insert challenge to Supabase: {resp.status_code} - {resp.text}")

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

def map_groq_to_db(groq_challenge: dict, module: str, saved_file_path: str) -> dict:
    # إذا تم إنشاء ملف، نضع مساره في حقل log_data لكي تعرضه المنصة كزر تحميل
    log_data_value = groq_challenge.get("logData", "")
    if saved_file_path:
        log_data_value = json.dumps({
            "downloadable_file": saved_file_path,
            "preview": log_data_value[:200] + "..." if len(log_data_value) > 200 else log_data_value
        }, ensure_ascii=False)

    return {
        "module": module,
        "title": groq_challenge.get("title", ""),
        "story": groq_challenge.get("story", ""),
        "task": groq_challenge.get("task", ""),
        "html_preview": groq_challenge.get("htmlPreview", ""),
        "log_data": log_data_value,
        "config_data": groq_challenge.get("configData", ""),
        "vulnerability_location": groq_challenge.get("vulnerabilityLocation", ""),
        "hints": json.dumps(groq_challenge.get("hints", []), ensure_ascii=False),
        "expected_answer": groq_challenge.get("expectedAnswer", ""),
        "explanation": groq_challenge.get("explanation", ""),
        "xp_reward": groq_challenge.get("xpReward", 150),
        "difficulty": groq_challenge.get("difficulty", "متوسط")
    }

async def generate_challenge_from_groq(team_role: str, module: str, path: str, category: str, difficulty: str) -> dict:
    topic_info = CYBER_SECURITY_TOPICS.get(module, {"name": f"موضوع: {module}", "category": category, "path": path})
    topic = topic_info["name"]

    is_web = category == "Web Security"

    environment_instructions = ""
    if is_web:
        environment_instructions = """
البيئة المطلوبة: ويب تفاعلي.
يجب توفير كود HTML/JS كامل وضعْه في حقل `htmlPreview`. اترك حقل `fileToGenerate` فارغاً null.
"""
    elif category == "Network Security":
        environment_instructions = """
البيئة المطلوبة: تحليل حزم شبكات.
لا تكتب كود HTML. اجعل `htmlPreview` فارغاً. 
يجب أن تستخدم حقل `fileToGenerate` لإنشاء ملف نصي يمثل محاكاة لملف الشبكة (مثلاً: `capture.pcap.txt` أو محتوى Wireshark hex dump أو tcpdump logs).
"""
    elif category == "Cryptography":
        environment_instructions = """
البيئة المطلوبة: فك تشفير (مثل أدوات CyberChef).
اجعل `htmlPreview` فارغاً. 
استخدم حقل `fileToGenerate` لإنشاء ملف نصي يحتوي على مفتاح التشفير العام (Public Key)، أو الهاش المطلوب كسره (مثال: `hashes.txt` أو `encrypted_message.enc.txt`).
"""
    elif category == "Digital Forensics":
        environment_instructions = """
البيئة المطلوبة: أدلة جنائية.
اجعل `htmlPreview` فارغاً.
استخدم حقل `fileToGenerate` لإنشاء ملف سجلات خادم مخترق (مثال: `auth.log` أو `access.log`) ليقوم المتدرب بتحميله وتحليله للبحث عن الـ IP أو البايلود المهاجم.
"""
    else:
        environment_instructions = """
البيئة المطلوبة: أنظمة وهندسة عكسية.
اجعل `htmlPreview` فارغاً.
استخدم حقل `fileToGenerate` لإنشاء ملف يحتوي على إعدادات نظام خاطئة أو كود Assembly للتحليل (مثال: `docker-compose.yml` أو `binary_dump.txt`).
"""

    role_instructions = ""
    if team_role == "blue":
        role_instructions = "اللاعب من الفريق الأزرق: مدافع. هدفه اكتشاف الثغرة في الويب، أو تحليل السجلات/الملفات لمعرفة سبب الاختراق وكيفية إغلاقه."
    else:
        role_instructions = "اللاعب من الفريق الأحمر: مهاجم. هدفه استغلال الثغرات، كسر التشفير، أو تحليل حزم الشبكات لاستخراج العلم (Flag)."

    json_structure = """
{
  "title": "عنوان التحدي",
  "story": "قصة سيبرانية واقعية مأخوذة من سيناريوهات الإنتاج",
  "task": "المهمة بوضوح",
  "htmlPreview": "كود الويب (فقط إذا كان التحدي Web Security، وإلا اتركه فارغاً)",
  "fileToGenerate": {
    "fileName": "اسم الملف مع الامتداد (مثل capture.log أو hashes.txt)",
    "content": "المحتوى الفعلي للملف الذي سيقوم المتدرب بتحميله وتحليله. يجب أن يكون محتوى حقيقي وكثيف يطابق السيناريو."
  },
  "logData": "أي بيانات إضافية (أو اتركها فارغة)",
  "configData": "إعدادات إضافية (أو اتركها فارغة)",
  "vulnerabilityLocation": "مكان الخلل أو التفسير المنطقي",
  "hints": ["تلميح 1", "تلميح 2"],
  "expectedAnswer": "الاستغلال أو الـ Flag الدقيق",
  "explanation": "شرح أمني عميق",
  "xpReward": """ + str(200 if difficulty == "قوي" else 150 if difficulty == "متوسط" else 100) + """,
  "difficulty": \"""" + difficulty + """\"
}
"""

    system_prompt = f"""أنت خبير أمن سيبراني. قم ببناء تحدي تقني دقيق بناءً على المعايير التالية:
- القسم: {category}
- الموضوع: {topic}
- الصعوبة: {difficulty}

{role_instructions}
{environment_instructions}

تنبيه هام جداً:
أرجع الاستجابة بصيغة JSON حصراً تتطابق مع الهيكل التالي بدون أي نصوص إضافية:
{json_structure}
"""

    async with httpx.AsyncClient(timeout=80) as client:
        resp = await client.post(GROQ_API_URL, json={
            "model": "llama-3.1-8b-instant",
            "messages": [{"role": "system", "content": system_prompt}],
            "temperature": 0.85,
            "max_tokens": 3000,
        }, headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {GROQ_API_KEY}",
        })

    if resp.status_code != 200:
        raise Exception(f"Groq API error: {resp.status_code}")

    content = resp.json()["choices"][0]["message"]["content"]
    training = parse_json_safe(content)

    if is_web and not training.get("htmlPreview", "").strip():
        training["htmlPreview"] = FALLBACK_HTML

    return training

async def populate_role(team_role: str, count_to_generate: int):
    print(f"\n--- بدء توليد تحديات الـ {team_role.upper()} ---")
    topics = list(CYBER_SECURITY_TOPICS.keys())
    difficulties = ["مبتدئ", "متوسط", "قوي"]
    
    generated = 0
    while generated < count_to_generate:
        module = topics[generated % len(topics)]
        difficulty = difficulties[generated % len(difficulties)]
        info = CYBER_SECURITY_TOPICS[module]
        
        try:
            print(f"[{generated + 1}/{count_to_generate}] جاري إنشاء تحدي | التصنيف: {info['category']} | الموضوع: {module}...")
            
            # 1. توليد التحدي من الذكاء الاصطناعي
            groq_challenge = await generate_challenge_from_groq(team_role, module, info["path"], info["category"], difficulty)
            
            # 2. إنشاء الملف فعلياً على السيرفر إذا كان التحدي يطلب ذلك
            saved_file_path = ""
            if groq_challenge.get("fileToGenerate"):
                saved_file_path = save_challenge_file(groq_challenge["fileToGenerate"], module, team_role)
            
            # 3. تجهيز البيانات وتخزين مسار الملف
            db_challenge = map_groq_to_db(groq_challenge, module, saved_file_path)
            
            # 4. الرفع لقاعدة البيانات
            await insert_challenge_to_supabase(db_challenge, team_role)
            print(f"[OK] تم حفظ التحدي بنجاح: \"{db_challenge['title']}\"\n")
            
            generated += 1
            await asyncio.sleep(8) # احترام حدود الـ API
            
        except Exception as e:
            print(f"[ERROR] خطأ أثناء إنشاء التحدي: {e}")
            print("إعادة المحاولة بعد 15 ثانية...")
            await asyncio.sleep(15)

async def main():
    print("====================================================")
    print("       APEX DB SEEDER: Generating Challenges        ")
    print("====================================================")
    
    if not GROQ_API_KEY or not SUPABASE_ANON_KEY:
        print("Error: Missing API Keys in .env file!")
        return

    blue_count = await get_supabase_challenge_count("blue")
    red_count = await get_supabase_challenge_count("red")
    
    blue_missing = max(0, 100 - blue_count)
    red_missing = max(0, 100 - red_count)
    
    print(f"الحالة الحالية لقاعدة البيانات:")
    print(f"- تحديات البلو تيم: {blue_count}/100")
    print(f"- تحديات الريد تيم: {red_count}/100")
    print(f"\nالمطلوب توليده: (البلو: {blue_missing})، (الريد: {red_missing})\n")
    
    if blue_missing > 0:
        await populate_role("blue", blue_missing)
    if red_missing > 0:
        await populate_role("red", red_missing)
        
    print("\n====================================================")
    print("      [SUCCESS] اكتمل توليد جميع التحديات بنجاح!     ")
    print("====================================================")

if __name__ == "__main__":
    asyncio.run(main())