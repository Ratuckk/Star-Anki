from pathlib import Path

path = Path('scripts/apply-miyu-owned-locks-v09933.py')
text = path.read_text(encoding='utf-8')
# The generated migrator had one truncated triple-double terminator in the Miyu block.
broken_close = "    return shots\\n  }\\n\\n\"\ntext = replace_between(text, start, end, new_block, 'Miyu assist firing')"
fixed_close = "    return shots\\n  }\\n\\n\"\"\"\ntext = replace_between(text, start, end, new_block, 'Miyu assist firing')"
if broken_close not in text:
    raise RuntimeError('broken wingman block closing marker not found')
text = text.replace(broken_close, fixed_close, 1)
# Use triple-single delimiters for all generated payload strings. They preserve normal Python
# escape processing (not raw strings), while allowing the embedded JavaScript double-quoted
# assertions and Markdown to remain unambiguous.
text = text.replace('"""', "'''")
path.write_text(text, encoding='utf-8')
print('migrator string delimiters normalized')
