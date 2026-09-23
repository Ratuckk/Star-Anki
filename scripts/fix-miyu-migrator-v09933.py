from pathlib import Path

path = Path('scripts/apply-miyu-owned-locks-v09933.py')
text = path.read_text(encoding='utf-8')
open_old = 'new_block = """  // Carga Compartilhada: cada lock triangular pertence EXCLUSIVAMENTE à Miyu. O Fox não\\n'
open_new = "new_block = r'''  // Carga Compartilhada: cada lock triangular pertence EXCLUSIVAMENTE à Miyu. O Fox não\\n"
close_old = "    return shots\\n  }\\n\\n\"\ntext = replace_between(text, start, end, new_block, 'Miyu assist firing')"
close_new = "    return shots\\n  }\\n\\n'''\ntext = replace_between(text, start, end, new_block, 'Miyu assist firing')"
if open_old not in text:
    raise RuntimeError('wingman block opening marker not found')
if close_old not in text:
    raise RuntimeError('wingman block closing marker not found')
text = text.replace(open_old, open_new, 1)
text = text.replace(close_old, close_new, 1)
path.write_text(text, encoding='utf-8')
print('migrator wingman block converted to raw triple-single string')
