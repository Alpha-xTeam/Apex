INSERT INTO public.encryption_challenges
(team_role, module, title, story, task_outline, files, file_metadata, command_outputs, hints, tools_whitelist, flag_hash, flag_preview, difficulty, xp_reward)
VALUES
('blue', 'hash-cracking', 'توقيع Webhook',
 'خدمة الدفعات ترسل webhook مع توقيع integrity في الـ header. الـ secret مشترك.', 'احسب توقيع integrity لـ payload.json بالـ key: Zapier_Webhook_2026_Secret.',
 '{"payload.json": "eyJldmVudCI6InBheW1lbnQuY29tcGxldGVkIiwiYW1vdW50IjoyNTAwLjAwLCJjdXJyZW5jeSI6IlVTRCIsInRpbWVzdGFtcCI6IjIwMjYtMDQtMTVUMTQ6MzA6MDBaIiwidHhuX2lkIjoidHhfYWJjMTIzIn0="}'::jsonb, '{"payload.json": {"encoding": "utf-8"}}'::jsonb, '{"openssl": {"stdout": "a98eac9cc676f9d140b67bef045716e99464ec7d14e78755d31124ef8ec5917f  input", "stderr": "", "exit_code": 0}, "ls": {"stdout": "payload.json", "stderr": "", "exit_code": 0}}'::jsonb,
 '["استخدم openssl بالأمر الصحيح من القصة", "الـ IV والـ salt يُولّدان تلقائياً — ركّز على الـ password"]'::jsonb,
 ARRAY['cat', 'ls', 'echo', 'openssl', 'sha256sum', 'base64', 'file'],
 '6a7b2c26343ef2b4dd43fdb3e56dfff8c1de0e8c51d7dc0999b3f5dd2a6982ed', 'CyberArena{a98eac9cc676f9d140b67bef045716e99464ec7d14e78755d31124ef8ec5917f}',
 'متوسط', 150);