import os
import sys

main_path = r'c:\Users\Hasan\OneDrive\Desktop\Appx\backend\main.py'
replacement_path = r'c:\Users\Hasan\OneDrive\Desktop\Appx\backend\replacement.py'

with open(main_path, 'r', encoding='utf-8') as f:
    main_content = f.read()

with open(replacement_path, 'r', encoding='utf-8') as f:
    replacement_content = f.read()

marker_start = '# ---------- Background replenishment task handlers ----------'
marker_end = '# ---------- Training List ----------'

idx_start = main_content.find(marker_start)
idx_end = main_content.find(marker_end)

if idx_start != -1 and idx_end != -1 and idx_end > idx_start:
    new_content = main_content[:idx_start] + replacement_content + '\n\n' + main_content[idx_end:]
    with open(main_path, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("SUCCESS: main.py background block swapped successfully!")
else:
    print(f"FAILED: marker_start={idx_start}, marker_end={idx_end}")
