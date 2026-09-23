from pathlib import Path

path = Path('scripts/apply-miyu-owned-locks-v09933.py')
text = path.read_text(encoding='utf-8')
old = "    return shots\\n  }\\n\\n\"\ntext = replace_between(text, start, end, new_block, 'Miyu assist firing')"
new = "    return shots\\n  }\\n\\n\"\"\"\ntext = replace_between(text, start, end, new_block, 'Miyu assist firing')"
if old not in text:
    raise RuntimeError('broken wingman block terminator not found')
text = text.replace(old, new, 1)
path.write_text(text, encoding='utf-8')
print('migrator quoting repaired')
