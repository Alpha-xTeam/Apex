"""
Pre-compute Blue team encryption challenges.
Generates 5 challenges with pre-computed encrypted outputs.
"""
import os
import json
import base64
import hashlib
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives import hashes, serialization, padding as sympad
from cryptography.hazmat.primitives.asymmetric import rsa, padding
from cryptography.hazmat.backends import default_backend

OUT = r"C:\Users\Admin\Desktop\Apex2\Apex\backend\enc_seed"
os.makedirs(OUT, exist_ok=True)

def b64(b: bytes) -> str:
    return base64.b64encode(b).decode("ascii")

def hex(b: bytes) -> str:
    return b.hex()

def sha256_hex(s: str) -> str:
    return hashlib.sha256(s.encode()).hexdigest()

def derive_key_pbkdf2(password: str, salt: bytes, length: int = 32) -> bytes:
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=length, salt=salt, iterations=100000, backend=default_backend())
    return kdf.derive(password.encode())

challenges = []

# ============================================================
# BLUE 1: AES-256-CBC encryption of customer CSV
# ============================================================
plain1 = "CustomerID,Name,CardNumber,Expiry,CVV\n1001,Ahmed Ali,4532-1234-5678-9010,12/27,123\n1002,Sara Khan,5500-9876-5432-1098,03/26,456\n1003,Omar Yusuf,4716-1111-2222-3333,08/28,789"
salt1 = os.urandom(8)
iv1 = os.urandom(16)
key1 = derive_key_pbkdf2("ApexSecure2026", salt1)
padder1 = sympad.PKCS7(128).padder()
padded1 = padder1.update(plain1.encode()) + padder1.finalize()
cipher1 = Cipher(algorithms.AES(key1), modes.CBC(iv1), backend=default_backend())
enc1 = cipher1.encryptor()
ct1 = enc1.update(padded1) + enc1.finalize()
encrypted1 = b"Salted__" + salt1 + ct1
flag1_inner = sha256_hex(hex(encrypted1))
flag1 = f"CyberArena{{{flag1_inner}}}"
challenges.append({
  "id": "blue1",
  "title": "تشفير بيانات العملاء في حالة السكون",
  "story": "تدير شركة Apex قسم payments يخزن بيانات بطاقات ائتمان العملاء في CSV. طلب منك مدير الأمن تشفير customer_data.csv قبل نقله إلى S3 bucket. التشفير يجب أن يستخدم AES-256 مع password ثابت و salt تلقائي. الـ password المعطى من قبل المدير: ApexSecure2026",
  "task_outline": "استخدم openssl لتشفير customer_data.csv بـ AES-256-CBC مع PBKDF2 و salt. ثم احسب SHA-256 للمخرجات. الـ flag هو CyberArena{<hex_hash_of_encrypted>}",
  "files": {"customer_data.csv": b64(plain1.encode("utf-8"))},
  "command_outputs": {
    "cat:customer_data.csv": {"stdout": plain1, "exit_code": 0},
    "openssl:aes-256-cbc": {"stdout": hex(encrypted1), "stderr": "", "exit_code": 0},
    "sha256sum": {"stdout": flag1_inner + "  encrypted.enc", "exit_code": 0},
    "ls": {"stdout": "customer_data.csv", "exit_code": 0}
  },
  "expected_command": "openssl enc -aes-256-cbc -salt -pbkdf2 -in customer_data.csv -out encrypted.enc -pass pass:ApexSecure2026",
  "password": "ApexSecure2026",
  "algorithm": "AES-256-CBC with PBKDF2",
  "flag": flag1,
  "flag_hash": sha256_hex(flag1),
  "difficulty": "مبتدئ",
  "module": "encryption-basics",
  "xp_reward": 100
})

# ============================================================
# BLUE 2: AES-256-GCM encryption of medical record
# ============================================================
plain2 = "Patient: Fatima Hassan\nDOB: 1985-03-12\nDiagnosis: T2DM, Hypertension\nMedications: Metformin 500mg BID, Lisinopril 10mg QD\nNotes: A1C trending down, follow-up in 3 months"
iv2 = os.urandom(12)  # GCM uses 96-bit IV
key2 = os.urandom(32)  # In real scenario, would be derived. For challenge, give the key.
cipher2 = Cipher(algorithms.AES(key2), modes.GCM(iv2), backend=default_backend())
enc2 = cipher2.encryptor()
ct2 = enc2.update(plain2.encode()) + enc2.finalize()
encrypted2 = iv2 + ct2 + enc2.tag  # iv + ciphertext + tag
flag2_inner = sha256_hex(hex(encrypted2))
flag2 = f"CyberArena{{{flag2_inner}}}"
challenges.append({
  "id": "blue2",
  "title": "تشفير سجل طبي بـ AES-GCM",
  "story": "السجل الطبي للمريضة Fatima Hassan يجب إرساله إلى مستشفى آخر عبر قناة غير آمنة. طلب منك تطبيق AES-GCM لتشفير patient_record.txt مع authenticated encryption. الـ key تولّد من password MedGCM_2026 و IV عشوائي 96-bit.",
  "task_outline": "استخدم openssl لتشفير patient_record.txt بـ AES-256-GCM. الـ password: MedGCM_2026. احسب SHA-256 للناتج.",
  "files": {"patient_record.txt": b64(plain2.encode("utf-8"))},
  "command_outputs": {
    "cat:patient_record.txt": {"stdout": plain2, "exit_code": 0},
    "openssl:aes-256-gcm": {"stdout": hex(encrypted2), "stderr": "", "exit_code": 0},
    "sha256sum": {"stdout": flag2_inner + "  encrypted_gcm.bin", "exit_code": 0},
    "ls": {"stdout": "patient_record.txt", "exit_code": 0}
  },
  "expected_command": "openssl enc -aes-256-gcm -in patient_record.txt -out encrypted_gcm.bin -pass pass:MedGCM_2026",
  "password": "MedGCM_2026",
  "algorithm": "AES-256-GCM",
  "flag": flag2,
  "flag_hash": sha256_hex(flag2),
  "difficulty": "متوسط",
  "module": "encryption-basics",
  "xp_reward": 150
})

# ============================================================
# BLUE 3: RSA sign contract (1024-bit key for smaller PEM)
# ============================================================
plain3 = "SERVICE AGREEMENT\n\nThis agreement is entered into on 2026-04-15\nbetween Apex Corp (Provider) and ZenTech GmbH (Client).\n\nScope: Security audit of ZenTech infrastructure\nDuration: 90 days\nFee: $250,000 USD\n\nSigned: ____________________"
priv_key3 = rsa.generate_private_key(public_exponent=65537, key_size=1024, backend=default_backend())
pem3 = priv_key3.private_bytes(
    encoding=serialization.Encoding.PEM,
    format=serialization.PrivateFormat.PKCS8,
    encryption_algorithm=serialization.NoEncryption()
)
sig3 = priv_key3.sign(
    plain3.encode(),
    padding.PSS(mgf=padding.MGF1(hashes.SHA256()), salt_length=padding.PSS.MAX_LENGTH),
    hashes.SHA256()
)
flag3_inner = sha256_hex(b64(sig3).rstrip("="))
flag3 = f"CyberArena{{{flag3_inner}}}"
challenges.append({
  "id": "blue3",
  "title": "توقيع عقد رقمي بـ RSA-PSS",
  "story": "محامي الشركة يحتاج توقيع رقمي على contract.txt. استخدم private_key.pem الموجود. الـ signature يجب أن تستخدم RSA-PSS مع SHA-256.",
  "task_outline": "وقّع contract.txt بـ openssl dgst -sha256 -sign. الـ flag هو CyberArena{<base64(signature) without padding>}",
  "files": {
    "contract.txt": b64(plain3.encode("utf-8")),
    "private_key.pem": b64(pem3)
  },
  "command_outputs": {
    "cat:contract.txt": {"stdout": plain3, "exit_code": 0},
    "openssl:sign": {"stdout": b64(sig3), "stderr": "", "exit_code": 0},
    "base64": {"stdout": b64(sig3), "stderr": "", "exit_code": 0},
    "ls": {"stdout": "contract.txt\nprivate_key.pem", "exit_code": 0}
  },
  "expected_command": "openssl dgst -sha256 -sign private_key.pem -out signature.bin contract.txt",
  "flag": flag3,
  "flag_hash": sha256_hex(flag3),
  "difficulty": "قوي",
  "module": "rsa-aes",
  "xp_reward": 200
})

# ============================================================
# BLUE 4: SHA-256 hash of firmware image
# ============================================================
import random
random.seed(42)
firmware = bytes([random.randint(0, 255) for _ in range(256)])  # 256-byte sample (concept is what matters)
fw_hash = hashlib.sha256(firmware).hexdigest()
flag4 = f"CyberArena{{{fw_hash}}}"
challenges.append({
  "id": "blue4",
  "title": "حساب SHA-256 لـ firmware قبل التوزيع",
  "story": "فريق QA رفع firmware.bin بحجم 4KB للنوافذ. قبل توزيعه على 10,000 جهاز، يجب أن يحسب SHA-256 ويُدرج في ملاحظات الإصدار. أداة sha256sum متوفرة في النظام.",
  "task_outline": "احسب SHA-256 لـ firmware.bin. الـ flag هو CyberArena{<hex_hash>}",
  "files": {"firmware.bin": b64(firmware)},
  "command_outputs": {
    "sha256sum:firmware.bin": {"stdout": fw_hash + "  firmware.bin", "exit_code": 0},
    "ls": {"stdout": "firmware.bin", "exit_code": 0},
    "file:firmware.bin": {"stdout": "firmware.bin: data", "exit_code": 0}
  },
  "expected_command": "sha256sum firmware.bin",
  "flag": flag4,
  "flag_hash": sha256_hex(flag4),
  "difficulty": "مبتدئ",
  "module": "hash-cracking",
  "xp_reward": 100
})

# ============================================================
# BLUE 5: HMAC-SHA256 of webhook payload
# ============================================================
import hmac
payload5 = '{"event":"payment.completed","amount":2500.00,"currency":"USD","timestamp":"2026-04-15T14:30:00Z","txn_id":"tx_abc123"}'
hmac_key = b"Zapier_Webhook_2026_Secret"
hmac_sig = hmac.new(hmac_key, payload5.encode(), hashlib.sha256).hexdigest()
flag5 = f"CyberArena{{{hmac_sig}}}"
challenges.append({
  "id": "blue5",
  "title": "توقيع Webhook بـ HMAC-SHA256",
  "story": "خدمة الدفعات ترسل webhook إلى endpoint الشركة. كل طلب يجب أن يحوي HMAC-SHA256 في الـ header X-Signature. الـ secret مشترك مع الـ receiver. احسب التوقيع لـ payload.json بالـ key: Zapier_Webhook_2026_Secret.",
  "task_outline": "استخدم openssl dgst -sha256 -hmac لتوقيع payload.json. الـ flag هو CyberArena{<hex_hmac>}",
  "files": {"payload.json": b64(payload5.encode("utf-8"))},
  "command_outputs": {
    "cat:payload.json": {"stdout": payload5, "exit_code": 0},
    "openssl:hmac": {"stdout": "HMAC-SHA256(payload.json)= " + hmac_sig, "stderr": "", "exit_code": 0},
    "ls": {"stdout": "payload.json", "exit_code": 0}
  },
  "expected_command": "openssl dgst -sha256 -hmac 'Zapier_Webhook_2026_Secret' payload.json",
  "flag": flag5,
  "flag_hash": sha256_hex(flag5),
  "difficulty": "متوسط",
  "module": "hash-cracking",
  "xp_reward": 150
})

# Write all challenges
with open(os.path.join(OUT, "blue_challenges.json"), "w", encoding="utf-8") as f:
    json.dump(challenges, f, ensure_ascii=False, indent=2)

# Print summary
print(f"Generated {len(challenges)} Blue challenges:")
for c in challenges:
    print(f"\n  {c['id']}: {c['title']}")
    print(f"    Module: {c['module']}, Difficulty: {c['difficulty']}")
    print(f"    Flag: {c['flag']}")
    print(f"    Flag hash: {c['flag_hash']}")
