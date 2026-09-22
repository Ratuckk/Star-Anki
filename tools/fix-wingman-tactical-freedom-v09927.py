from pathlib import Path


def patch(path, old, new):
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    if old not in text:
        raise RuntimeError(f'padrao de correcao nao encontrado em {path}: {old!r}')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')

patch(
    'src/combat/wingman-radio-callresponse.js',
    "  state_recovered: {  state_recovered: {",
    "  state_recovered: {",
)
patch(
    'src/combat/wingman-radio-callresponse.js',
    "  if (beforeIntegrity.critical && !afterIntegrity.critical) {  if (beforeIntegrity.critical && !afterIntegrity.critical) {",
    "  if (beforeIntegrity.critical && !afterIntegrity.critical) {",
)
patch(
    'src/combat/wingmen.js',
    "      if (w.state === 'damaged-passive') {      } else if (w.state === 'damaged-passive') {",
    "      if (w.state === 'damaged-passive') {",
)
print('migration marker fix applied')
