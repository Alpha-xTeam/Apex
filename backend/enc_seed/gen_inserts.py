"""Generate single-row INSERT SQL files for each Blue challenge (small enough for MCP)."""
import json

with open(r"C:\Users\Admin\Desktop\Apex2\Apex\backend\enc_seed\built_blue.json", encoding="utf-8") as f:
    challenges = json.load(f)

for i, c in enumerate(challenges, 1):
    # Use ::jsonb casts and escape single quotes
    def esc(s): return s.replace("'", "''")
    files_j   = json.dumps(c["files"], ensure_ascii=False).replace("'", "''")
    files_md  = json.dumps(c["file_metadata"], ensure_ascii=False).replace("'", "''")
    outs_j    = json.dumps(c["command_outputs"], ensure_ascii=False).replace("'", "''")
    hints_j   = json.dumps(c["hints"], ensure_ascii=False).replace("'", "''")
    tools_j   = json.dumps(c["tools_whitelist"], ensure_ascii=False).replace("'", "''")

    sql = f"""INSERT INTO public.encryption_challenges
(team_role, module, title, story, task_outline, files, file_metadata, command_outputs, hints, tools_whitelist, flag_hash, flag_preview, difficulty, xp_reward)
VALUES
('{esc(c["team_role"])}', '{esc(c["module"])}', '{esc(c["title"])}',
 '{esc(c["story"])}', '{esc(c["task_outline"])}',
 '{files_j}'::jsonb, '{files_md}'::jsonb, '{outs_j}'::jsonb,
 '{hints_j}'::jsonb,
 ARRAY[{', '.join(repr(t) for t in c["tools_whitelist"])}],
 '{c["flag_hash"]}', '{esc(c["flag_preview"])}',
 '{esc(c["difficulty"])}', {c["xp_reward"]});"""

    fname = rf"C:\Users\Admin\Desktop\Apex2\Apex\backend\enc_seed\insert_blue_{i}.sql"
    with open(fname, "w", encoding="utf-8") as f:
        f.write(sql)
    print(f"blue{i}: {len(sql)} bytes -> insert_blue_{i}.sql")
