"""Rebuild SQL inserts with truncated stdout to keep under 2KB each."""
import json

with open(r"C:\Users\Admin\Desktop\Apex2\Apex\backend\enc_seed\blue_challenges.json", encoding="utf-8") as f:
    challenges = json.load(f)

def esc(s: str) -> str:
    return s.replace("'", "''")

for c in challenges:
    # Truncate long stdout values in command_outputs
    trimmed_outputs = {}
    for cmd, out in c["command_outputs"].items():
        trimmed = dict(out)
        stdout = trimmed.get("stdout", "")
        if len(stdout) > 80:
            trimmed["stdout"] = stdout[:60] + f"... [truncated, full output in sandbox]"
        trimmed_outputs[cmd] = trimmed

    files_json = json.dumps(c["files"], ensure_ascii=False).replace("'", "''")
    outputs_json = json.dumps(trimmed_outputs, ensure_ascii=False).replace("'", "''")
    hints_json = json.dumps(c.get("hints", []), ensure_ascii=False).replace("'", "''")
    tools_json = json.dumps(c.get("tools_whitelist", ["cat", "openssl", "sha256sum", "ls", "base64"]), ensure_ascii=False).replace("'", "''")
    file_meta_json = json.dumps({}, ensure_ascii=False).replace("'", "''")

    sql = f"""INSERT INTO public.encryption_challenges
  (team_role, module, title, story, task_outline, files, file_metadata, command_outputs, hints, tools_whitelist, flag_hash, flag_preview, difficulty, xp_reward)
VALUES
  ('blue', '{c["module"]}', '{esc(c["title"])}', '{esc(c["story"])}', '{esc(c["task_outline"])}',
   '{files_json}'::jsonb, '{file_meta_json}'::jsonb, '{outputs_json}'::jsonb,
   '{hints_json}'::jsonb, '{tools_json}'::jsonb,
   '{c["flag_hash"]}', '{esc(c["flag"])}', '{c["difficulty"]}', {c["xp_reward"]});"""

    fname = rf"C:\Users\Admin\Desktop\Apex2\Apex\backend\enc_seed\sql_{c['id']}.sql"
    with open(fname, "w", encoding="utf-8") as f:
        f.write(sql)
    print(f"{c['id']}: {len(sql)} bytes")
