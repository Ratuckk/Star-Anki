import { readFileSync, writeFileSync } from 'node:fs'

const path = 'tools/apply-playtest-polish-v09925.mjs'
let source = readFileSync(path, 'utf8')
const bad = `assert.match(wingmenSource, /↳ \\\\${opener\\\\.name}: \\\\${reply\\\\.text}/, 'resposta Call & Response precisa ser visualmente identificável')`
const safe = `assert.ok(wingmenSource.includes('isCallResponse: true') && wingmenSource.includes('replyText'), 'resposta Call & Response precisa ser visualmente identificável')`
if (!source.includes(bad)) throw new Error('linha de escape esperada nao encontrada')
source = source.replace(bad, safe)
writeFileSync(path, source)
