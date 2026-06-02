import os
import re
import httpx
import asyncio
import sys
from dotenv import load_dotenv

sys.stdout.reconfigure(encoding='utf-8')

backend_dir = os.path.dirname(os.path.abspath(__file__))
load_dotenv(dotenv_path=os.path.join(backend_dir, ".env"))

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://yevtnyokixocpihpdwqu.supabase.co")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"

CYBER_SECURITY_TOPICS = {
    "xss": {"name": "ثغرات XSS", "category": "Web Security", "path": "web-security"},
    "sql-injection": {"name": "ثغرات SQL Injection", "category": "Web Security", "path": "web-security"},
    "csrf": {"name": "ثغرات CSRF", "category": "Web Security", "path": "web-security"},
    "packet-analysis": {"name": "تحليل حزم الشبكات", "category": "Network Security", "path": "network-security"},
    "hash-cracking": {"name": "كسر الهاش", "category": "Cryptography", "path": "cryptography"},
    "log-analysis": {"name": "تحليل السجلات", "category": "Digital Forensics", "path": "forensics"},
    "cloud-config": {"name": "أمن السحابة", "category": "Cloud Security", "path": "cloud-security"},
}


def parse_json_safe(raw: str) -> dict:
    start = raw.find("{")
    end = raw.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("No JSON found in response")
    json_str = re.sub(r"[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]", "", raw[start:end + 1])
    return json.loads(json_str)


def scenario_table(team_role: str) -> str:
    return "blue_scenarios" if team_role == "blue" else "red_scenarios"


async def get_scenario_count(team_role: str) -> int:
    table = scenario_table(team_role)
    headers = {"apikey": SUPABASE_ANON_KEY, "Authorization": f"Bearer {SUPABASE_ANON_KEY}"}
    url = f"{SUPABASE_URL}/rest/v1/{table}?select=id"
    async with httpx.AsyncClient() as client:
        resp = await client.get(url, headers=headers)
        if resp.status_code == 200:
            return len(resp.json())
    return 0


async def insert_scenario(scenario_data: dict, team_role: str):
    table = scenario_table(team_role)
    headers = {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
        "Content-Type": "application/json",
    }
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    async with httpx.AsyncClient() as client:
        resp = await client.post(url, json=scenario_data, headers=headers)
        if resp.status_code not in (200, 201):
            print(f"Failed to insert scenario: {resp.status_code} - {resp.text}")


async def generate_scenario_from_groq(team_role: str, module: str, path: str, category: str, difficulty: str) -> dict:
    topic = CYBER_SECURITY_TOPICS.get(module, {"name": module})["name"]
    team_label = "الفريق الأزرق (مدافع)" if team_role == "blue" else "الفريق الأحمر (مهاجم)"
    system_prompt = f"""أنت مصمم سيناريوهات تدريب أمن سيبراني.
أنشئ سيناريو مختصر فقط (بدون HTML أو ملفات). الدور: {team_label}. الموضوع: {topic}. الصعوبة: {difficulty}.
أرجع JSON فقط:
{{"title":"...","story":"...","task":"...","difficulty":"{difficulty}","xpReward":{150}}}"""

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(GROQ_API_URL, json={
            "model": "llama-3.3-70b-versatile",
            "messages": [{"role": "system", "content": system_prompt}],
            "temperature": 0.85,
            "max_tokens": 1200,
        }, headers={"Content-Type": "application/json", "Authorization": f"Bearer {GROQ_API_KEY}"})

    if resp.status_code != 200:
        raise Exception(f"Groq API error: {resp.status_code}")

    return parse_json_safe(resp.json()["choices"][0]["message"]["content"])


async def populate_role(team_role: str, count_to_generate: int):
    print(f"\n--- توليد سيناريوهات {team_role.upper()} ---")
    topics = list(CYBER_SECURITY_TOPICS.keys())
    difficulties = ["مبتدئ", "متوسط", "قوي"]
    generated = 0

    while generated < count_to_generate:
        module = topics[generated % len(topics)]
        difficulty = difficulties[generated % len(difficulties)]
        info = CYBER_SECURITY_TOPICS[module]
        try:
            print(f"[{generated + 1}/{count_to_generate}] {module} ({difficulty})...")
            groq_scenario = await generate_scenario_from_groq(
                team_role, module, info["path"], info["category"], difficulty
            )
            await insert_scenario({
                "module": module,
                "title": groq_scenario.get("title", ""),
                "story": groq_scenario.get("story", ""),
                "task_outline": groq_scenario.get("task", ""),
                "difficulty": groq_scenario.get("difficulty", difficulty),
                "xp_reward": groq_scenario.get("xpReward", 150),
            }, team_role)
            generated += 1
            await asyncio.sleep(8)
        except Exception as e:
            print(f"[ERROR] {e}")
            await asyncio.sleep(15)


async def main():
    print("APEX DB SEEDER: Scenario Pool")
    if not GROQ_API_KEY or not SUPABASE_ANON_KEY:
        print("Error: Missing API Keys in .env")
        return

    blue_count = await get_scenario_count("blue")
    red_count = await get_scenario_count("red")
    blue_missing = max(0, 100 - blue_count)
    red_missing = max(0, 100 - red_count)

    print(f"Blue scenarios: {blue_count}/100 | Red scenarios: {red_count}/100")
    if blue_missing > 0:
        await populate_role("blue", blue_missing)
    if red_missing > 0:
        await populate_role("red", red_missing)
    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
