import { readFileSync, writeFileSync } from 'node:fs'

const path = 'tools/apply-playtest-polish-v09925.mjs'
const lines = readFileSync(path, 'utf8').split('\n')
const radioTestIndex = lines.findIndex((line) => line.includes('assert.match(wingmenSource, /↳'))
if (radioTestIndex === -1) throw new Error('linha de teste Call & Response nao encontrada')
lines[radioTestIndex] = "assert.ok(wingmenSource.includes('isCallResponse: true') && wingmenSource.includes('replyText'), 'resposta Call & Response precisa ser visualmente identificável')"

const newTestDocIndex = lines.findIndex((line) => line.includes('Novo') && line.includes('playtest-polish.test.mjs') && line.includes('cobre a volta orbital'))
if (newTestDocIndex === -1) throw new Error('linha de documentacao do novo teste nao encontrada')
lines[newTestDocIndex] = '- Novo playtest-polish.test.mjs cobre a volta orbital, segmentos por autor, volume/cauda do áudio, cooldown da Miyu, Call & Response do Intercept, contrato de escudo e guarda estrutural contra reintroduzir o kick de emergência a cada frame.'

const validatedDocIndex = lines.findIndex((line) => line.includes('**Validado:**') && line.includes('playtest-polish.test.mjs'))
if (validatedDocIndex === -1) throw new Error('linha de documentacao da validacao nao encontrada')
lines[validatedDocIndex] = '**Validado:** sintaxe dos módulos alterados, suítes de Wingman/rádio/formação, node src/playtest-polish.test.mjs, node src/selftest.mjs e git diff --check.'

writeFileSync(path, lines.join('\n'))
