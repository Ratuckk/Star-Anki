from pathlib import Path

path = Path('tools/apply-orbit-clump-v09926.py')
source = path.read_text(encoding='utf-8')
old_a = '''    "  damageNumberStyle: 'classic', // 'classic' | 'manga' | 'orbit'\\n",'''
new_a = '''    "  damageNumberStyle: 'classic',\\n",'''
old_b = '''    "  damageNumberStyle: 'classic', // 'classic' | 'manga' | 'orbit'\\n  damageOrbitEnabled: true, // coop visual do Buraco negro; nunca altera dano/gameplay\\n",'''
new_b = '''    "  damageNumberStyle: 'classic',\\n  damageOrbitEnabled: true, // coop visual do Buraco negro; nunca altera dano/gameplay\\n",'''
if old_a not in source or old_b not in source:
    raise RuntimeError('matchers antigos de settings nao encontrados')
source = source.replace(old_a, new_a, 1).replace(old_b, new_b, 1)
path.write_text(source, encoding='utf-8')
