# ---------- Dynamic Relevance Audit Keywords ----------
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

# State to keep track of rate limits and log only once
RATE_LIMIT_ALERTED = False

async def generate_and_store_challenge(team_role: str, module: str, path: str = "web-security", category: str = "web", difficulty: str = "متوسط"):
    global RATE_LIMIT_ALERTED
    try:
        groq_challenge = await generate_challenge_from_groq(team_role, module, path, category, difficulty)
        db_challenge = map_groq_to_db(groq_challenge, module)
        db_challenge["difficulty"] = difficulty
        await insert_challenge_to_supabase(db_challenge, team_role)
        print(f"Background Generator: Stored a new {team_role} challenge ({difficulty}) for {module} in Supabase pool.")
        RATE_LIMIT_ALERTED = False
    except Exception as e:
        if "429" in str(e) or "Rate Limit" in str(e):
            if not RATE_LIMIT_ALERTED:
                # Direct UTF-8 clean Arabic statement
                print("⚠️  [تنبيه الذكاء الاصطناعي] تم الوصول للحد الأقصى لطلبات Groq مجاناً (Rate Limit 429). سيقوم النظام بالمحاولة مجدداً لاحقاً تلقائياً.")
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
