INSERT INTO public.encryption_challenges
(team_role, module, title, story, task_outline, files, file_metadata, command_outputs, hints, tools_whitelist, flag_hash, flag_preview, difficulty, xp_reward)
VALUES
('blue', 'encryption-basics', 'تشفير سجل طبي بـ authenticated encryption',
 'السجل الطبي للمريضة Fatima Hassan يجب إرساله إلى مستشفى آخر عبر قناة غير آمنة. الـ key تتولد من كلمة مرور ثابتة.', 'شفّر patient_record.txt بخوارزمية authenticated. كلمة المرور مذكورة في الـ task.',
 '{"patient_record.txt": "UGF0aWVudDogRmF0aW1hIEhhc3NhbgpET0I6IDE5ODUtMDMtMTIKRGlhZ25vc2lzOiBUMkRNLCBIeXBlcnRlbnNpb24KTWVkaWNhdGlvbnM6IE1ldGZvcm1pbiA1MDBtZyBCSUQsIExpc2lub3ByaWwgMTBtZyBRRApOb3RlczogQTFDIHRyZW5kaW5nIGRvd24sIGZvbGxvdy11cCBpbiAzIG1vbnRocw=="}'::jsonb, '{"patient_record.txt": {"encoding": "utf-8", "size": 169}}'::jsonb, '{"cat:patient_record.txt": {"stdout": "Patient: Fatima Hassan\nDOB: 1985-03-12\nDiagnosis: T2DM, Hypertension\nMedications: Metformin 500mg BID, Lisinopril 10mg QD\nNotes: A1C trending down, follow-up in 3 months", "stderr": "", "exit_code": 0}, "openssl:enc": {"stdout": "8ef9d9ef9043ab23fa88fc9af989ac9671f9409d80b7379faa68a53a4b556b739c14cd574ac5e0c7...", "stderr": "", "exit_code": 0}, "sha256sum": {"stdout": "1e73687ed4031fd64e0777aab8d9687f6bbc55be4009f7717815c3979605f170  data.enc", "stderr": "", "exit_code": 0}, "ls": {"stdout": "patient_record.txt", "stderr": "", "exit_code": 0}}'::jsonb,
 '["استخدم openssl بالأمر الصحيح من القصة", "الـ IV والـ salt يُولّدان تلقائياً — ركّز على الـ password"]'::jsonb,
 ARRAY['cat', 'ls', 'echo', 'openssl', 'sha256sum', 'base64', 'file'],
 'eebf50b804ddc3ed10136c214a3c1e62b276e553a0a49577162f53bd97a81fdc', 'CyberArena{1e73687ed4031fd64e0777aab8d9687f6bbc55be4009f7717815c3979605f170}',
 'متوسط', 150);