import { readFileSync, writeFileSync } from 'node:fs'

const path = 'tools/apply-playtest-polish-v09925.mjs'
const lines = readFileSync(path, 'utf8').split('\n')
const index = lines.findIndex((line) => line.includes('assert.match(wingmenSource, /↳'))
if (index === -1) throw new Error('linha de teste Call & Response nao encontrada')
lines[index] = "assert.ok(wingmenSource.includes('isCallResponse: true') && wingmenSource.includes('replyText'), 'resposta Call & Response precisa ser visualmente identificável')"
writeFileSync(path, lines.join('\n'))
