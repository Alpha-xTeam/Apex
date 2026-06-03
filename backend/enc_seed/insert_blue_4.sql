INSERT INTO public.encryption_challenges
(team_role, module, title, story, task_outline, files, file_metadata, command_outputs, hints, tools_whitelist, flag_hash, flag_preview, difficulty, xp_reward)
VALUES
('blue', 'hash-cracking', 'حساب SHA-256 لـ firmware قبل التوزيع',
 'فريق QA رفع firmware.bin للحجم 256 بايت. قبل توزيعه، يجب حساب hash كامل.', 'احسب hash كامل (256-bit) للملف. الـ flag هو الـ hash نفسه.',
 '{"firmware.bin": "MzkwYzhjN2Q3MjQ3MzQyY2Q4MTAwZjJmNmY3NzBkNjVkNjcwZTU4ZTAzNTFkOGFlOGU0ZjZlYWMzNDJmYzIzMWI3YjA4NzE2ZWIzZmMxMjg5NmI5NjIyMzE3NzQ5NDI4NzczM2MyOGVlOGJhNTNiZGI1NmI4ODI0NTc3ZDUzZWNjMjhhNzBhNjFjNzUxMGExY2Q4OTIxNmNhMTZjZmZjYWVhNDk4NzQ3N2U4NmRiY2NiOTcwNDZmYzJlMTgzODRlNTFkODIwYzVjM2VmODAwNTNhODhhZTM5OTZkZTUwZTgwMTg2NWIzNjk4NjU0ZWJmNTIwMGE1ZmEwOTM5Yjk5ZDdhMWQ3YjI4MmJmODIzNDA0MWYzNTQ4N2Q4NmM2NjlmY2NiZmUwZTczZDdlNzMyMGFkMGE3NTcwMDMyNDFlNzUyMjEwYTkyNDc5OGVmODZkNDNmMjdjZjJkMDYxMzAzMWRjYjVkOGQyZWYxYjMyMWZjZWFkMzc3ZjYyNjFlNTQ3ZDg1ZDhlZWM3ZjI2ZTIzMjE5MDcyZjc5NTVkMGY4ZjY2ZGNkMWU1NGMyMDFjNzg3ZTg5MmQ4Zjk0ZjYxOTc2ZjFkMWZhMDFkMTlmNDUwMWQyOTVmMjMyMjc4Y2UzZDdlMTQyOWQ2YTE4NTY4YTA3YTg3Y2E0Mzk5ZWFhMTI1MDQ="}'::jsonb, '{"firmware.bin": {"encoding": "utf-8"}}'::jsonb, '{"sha256sum": {"stdout": "fe229da31c2fb9733775f665bfbcb8da41524978dc30ee3603bc678d6a39e0ba  input", "stderr": "", "exit_code": 0}, "ls": {"stdout": "firmware.bin", "stderr": "", "exit_code": 0}}'::jsonb,
 '["راجع أدوات سطر الأوامر المتوفرة في القائمة البيضاء", "اقرأ التعليمات بعناية — الـ key معطى في القصة", "الناتج النهائي يجب أن يكون بصيغة SHA-256 hex"]'::jsonb,
 ARRAY['cat', 'ls', 'echo', 'openssl', 'sha256sum', 'base64', 'file'],
 '9fcee393a5cfc5eed1993d024b80b6110208af2f7aa0b36ec7af5ad05c687523', 'CyberArena{fe229da31c2fb9733775f665bfbcb8da41524978dc30ee3603bc678d6a39e0ba}',
 'مبتدئ', 100);