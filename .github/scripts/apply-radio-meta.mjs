import fs from 'node:fs'
function read(p) { return fs.readFileSync(p, 'utf8') }
function write(p, s) { fs.writeFileSync(p, s) }
function one(s, a, b, label) { const n = s.split(a).length - 1; if (n !== 1) throw new Error(`${label}: ${n} matches`); return s.replace(a, b) }

let selftest = read('src/selftest.mjs')
selftest = one(selftest,
  `import './wingman-state-controller.test.mjs'\n`,
  `import './wingman-state-controller.test.mjs'\nimport './wingman-radio-callresponse.test.mjs'\n`,
  'selftest import',
)
write('src/selftest.mjs', selftest)

let version = read('src/version.js')
version = one(version, "export const GAME_VERSION = 'v0.99.22'", "export const GAME_VERSION = 'v0.99.23'", 'version')
write('src/version.js', version)

const entry = `### v0.99.23 — Rádio Call & Response dos Wingmen\n\n- O rádio deixa de ser apenas uma coleção de falas isoladas: eventos selecionados agora podem abrir uma **thread Call & Response** com outro piloto ativo. A réplica é escolhida por personalidade, nunca pelo mesmo piloto que abriu a conversa, e só aparece depois que a transmissão inicial teve tempo visual para terminar.\n- Threads têm janela própria de 3,0–4,2s, expiração, cooldown narrativo de 10s e cancelamento determinístico. Respostas são descartadas se o piloto que responderia ficar indisponível; eventos urgentes ou a rajada do comando Focus cancelam conversas antigas para impedir diálogos fora de contexto.\n- A nova máquina de estados passa a alimentar semanticamente o rádio: entrada em \`critical\`, \`emergency return\`, recuperação de \`critical\` e interrupção real de Action recebem eventos próprios. \`retreat\` continua prioritário e agora também pode abrir uma resposta contextual.\n- Ram, Guard, Rescue, Repair, Assist e Boombuster podem iniciar microconversas curtas entre os pilotos sem transformar todo evento em diálogo. O cooldown global de falas avulsas continua valendo; a resposta é tratada como continuação da mesma transmissão.\n- \`aiValidator\` registra a classificação semântica e cada resposta efetivamente entregue, além de validar que Call & Response nunca usa o mesmo piloto como chamador e respondente. \`clearSquadron()\` também limpa threads para impedir resposta fantasma entre resets.\n- Adicionado \`src/combat/wingman-radio-callresponse.js\` como núcleo puro/testável e \`src/wingman-radio-callresponse.test.mjs\` cobrindo timing, cooldown narrativo, cancelamento, indisponibilidade do respondente e classificação das novas transições.\n\n**Validado:** \`node --check\` dos módulos alterados, \`node src/wingman-radio-callresponse.test.mjs\`, \`node src/wingman-state-controller.test.mjs\`, \`node src/selftest.mjs\` e \`git diff --check\`.\n\n`
let progress = read('progresso/PROGRESSO_POS_.90.md')
progress = one(progress, `## Histórico de Entregas pós-v0.90.0\n\n`, `## Histórico de Entregas pós-v0.90.0\n\n${entry}`, 'progress')
write('progresso/PROGRESSO_POS_.90.md', progress)
console.log('radio meta migration applied')
