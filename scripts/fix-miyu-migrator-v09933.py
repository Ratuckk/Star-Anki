from pathlib import Path

path = Path('scripts/apply-miyu-owned-locks-v09933.py')
text = path.read_text(encoding='utf-8')

# The generated migrator had one truncated triple-quoted terminator in the Miyu block.
broken_close = "    return shots\\n  }\\n\\n\"\ntext = replace_between(text, start, end, new_block, 'Miyu assist firing')"
fixed_close = "    return shots\\n  }\\n\\n\"\"\"\ntext = replace_between(text, start, end, new_block, 'Miyu assist firing')"
if broken_close not in text:
    raise RuntimeError('broken wingman block closing marker not found')
text = text.replace(broken_close, fixed_close, 1)

# Canonicalize every triple-double payload into repr(...). This avoids delimiter ambiguity from
# embedded JavaScript/Markdown quotes while preserving the intended newline escapes and Unicode.
out = []
pos = 0
converted = 0
while True:
    start = text.find('"""', pos)
    if start < 0:
        out.append(text[pos:])
        break
    end = text.find('"""', start + 3)
    if end < 0:
        raise RuntimeError('unpaired triple-double payload in migrator')
    out.append(text[pos:start])
    body = text[start + 3:end]
    body = body.replace('\\n', '\n').replace('\\"', '"')
    out.append(repr(body))
    converted += 1
    pos = end + 3

text = ''.join(out)
path.write_text(text, encoding='utf-8')
print(f'migrator payloads canonicalized: {converted}')
