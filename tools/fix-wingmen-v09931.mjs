import { readFileSync, writeFileSync } from 'node:fs'

function replaceRequired(source, pattern, replacement, label) {
  const next = source.replace(pattern, replacement)
  if (next === source) throw new Error(`Padrão esperado não encontrado: ${label}`)
  return next
}

function count(source, needle) {
  return source.split(needle).length - 1
}

let wing = readFileSync('src/combat/wingmen.js', 'utf8')

const previousBlock = `  const previousPlayerPosition = new THREE.Vector3()\n  let hasPreviousPlayerPosition = false\n`
wing = replaceRequired(
  wing,
  /(?:  const previousPlayerPosition = new THREE\.Vector3\(\)\n  let hasPreviousPlayerPosition = false\n){2,}/,
  previousBlock,
  'estado previousPlayerPosition duplicado',
)

const motionWatchLine = `      motionWatch: createWingmanStallWatch(spawnPos),\n`
wing = replaceRequired(
  wing,
  /(?:      motionWatch: createWingmanStallWatch\(spawnPos\),\n){2,}/,
  motionWatchLine,
  'motionWatch duplicado',
)

const motionBlock = `    const playerMotionSpeed = hasPreviousPlayerPosition && dt > 0\n      ? previousPlayerPosition.distanceTo(playerPos) / dt\n      : 0\n    previousPlayerPosition.copy(playerPos)\n    hasPreviousPlayerPosition = true\n    const formationMotionGain = inArena ? computeFormationMotionGain(playerMotionSpeed) : 1\n`
wing = replaceRequired(
  wing,
  /(?:    const playerMotionSpeed = hasPreviousPlayerPosition && dt > 0\n      \? previousPlayerPosition\.distanceTo\(playerPos\) \/ dt\n      : 0\n    previousPlayerPosition\.copy\(playerPos\)\n    hasPreviousPlayerPosition = true\n    const formationMotionGain = inArena \? computeFormationMotionGain\(playerMotionSpeed\) : 1\n){2,}/,
  motionBlock,
  'cálculo de movimento duplicado',
)

const readyTargetsLine = `    const readyCombatTargets = new Set(getAliveEnemies())\n`
wing = replaceRequired(
  wing,
  /(?:    const readyCombatTargets = new Set\(getAliveEnemies\(\)\)\n){2,}/,
  readyTargetsLine,
  'readyCombatTargets duplicado',
)

const sourceInvariants = [
  [previousBlock, 1, 'estado previousPlayerPosition'],
  [motionWatchLine, 1, 'motionWatch'],
  [motionBlock, 1, 'cálculo de movimento'],
  [readyTargetsLine, 1, 'readyCombatTargets'],
]
for (const [needle, expected, label] of sourceInvariants) {
  const actual = count(wing, needle)
  if (actual !== expected) throw new Error(`${label}: esperado ${expected}, encontrado ${actual}`)
}

const hardenedGetAlive = 'for (const e of enemies.getAlive()) if (isWingmanCombatTargetReady(e)) alive.push(e)'
const hardenedFocus = 'squadronFocusTargets = squadronFocusTargets.filter((t) => isWingmanCombatTargetReady(t, readyCombatTargets))'
if (!wing.includes(hardenedGetAlive)) throw new Error('Hardening de getAliveEnemies foi perdido')
if (!wing.includes(hardenedFocus)) throw new Error('Hardening de Focus foi perdido')
writeFileSync('src/combat/wingmen.js', wing)

let stabilityTest = readFileSync('src/wingman-flight-stability.test.mjs', 'utf8')
if (!stabilityTest.includes("readFileSync(new URL('./combat/wingmen.js'")) {
  stabilityTest = stabilityTest.replace(
    "import assert from 'node:assert/strict'\n",
    "import assert from 'node:assert/strict'\nimport { readFileSync } from 'node:fs'\n",
  )
  const marker = "const ready = { mesh: { parent: {} }, dying: false, fadingOut: false }\n"
  if (!stabilityTest.includes(marker)) throw new Error('Marcador do teste estrutural de Wingmen não encontrado')
  const regression = `const wingmenSource = readFileSync(new URL('./combat/wingmen.js', import.meta.url), 'utf8')\nconst occurrences = (needle) => wingmenSource.split(needle).length - 1\nassert.equal(occurrences('const previousPlayerPosition = new THREE.Vector3()'), 1, 'estado de posição anterior não pode ser redeclarado')\nassert.equal(occurrences('motionWatch: createWingmanStallWatch(spawnPos)'), 1, 'motionWatch não pode ser duplicado no objeto do Wingman')\nassert.equal(occurrences('const playerMotionSpeed = hasPreviousPlayerPosition && dt > 0'), 1, 'velocidade do jogador deve ser calculada uma vez por frame')\nassert.equal(occurrences('const readyCombatTargets = new Set(getAliveEnemies())'), 1, 'snapshot de alvos deve existir uma vez por update')\nassert.ok(wingmenSource.includes('for (const e of enemies.getAlive()) if (isWingmanCombatTargetReady(e)) alive.push(e)'), 'lista de alvos deve preservar hardening gameplay-ready')\nassert.ok(wingmenSource.includes('squadronFocusTargets = squadronFocusTargets.filter((t) => isWingmanCombatTargetReady(t, readyCombatTargets))'), 'Focus deve preservar validação de alvo ativo')\n\n`
  stabilityTest = stabilityTest.replace(marker, regression + marker)
  writeFileSync('src/wingman-flight-stability.test.mjs', stabilityTest)
}

let version = readFileSync('src/version.js', 'utf8')
if (!version.includes("v0.99.30")) throw new Error('src/version.js não está em v0.99.30')
version = version.replace('v0.99.30', 'v0.99.31')
writeFileSync('src/version.js', version)

let readme = readFileSync('README.md', 'utf8')
if (!readme.includes('versão-v0.99.30-blue.svg')) throw new Error('Badge v0.99.30 não encontrado no README')
readme = readme.replace('versão-v0.99.30-blue.svg', 'versão-v0.99.31-blue.svg')
if (!readme.includes('### v0.99.31 — Hotfix de carregamento dos Wingmen')) {
  const marker = '### v0.99.30 — Estabilidade dos Wingmen, rádio lateral e feedback de dano\n'
  if (!readme.includes(marker)) throw new Error('Seção v0.99.30 não encontrada no README')
  const section = `### v0.99.31 — Hotfix de carregamento dos Wingmen\n- Corrige quatro blocos reaplicados por engano em \`src/combat/wingmen.js\`: estado de posição anterior, watchdog de movimento, cálculo de velocidade do jogador e snapshot de alvos.\n- Restaura o carregamento do módulo e, portanto, o boot do jogo no navegador.\n- Preserva o hardening legítimo da v0.99.30: Wingmen continuam ignorando alvos fora do gameplay e o Focus continua validando alvos ativos.\n- Adiciona regressão estrutural para impedir novas redeclarações/reaplicações desses blocos.\n\n`
  readme = readme.replace(marker, section + marker)
}
writeFileSync('README.md', readme)

let progress = readFileSync('progresso/PROGRESSO_POS_.90.md', 'utf8')
if (!progress.includes('### v0.99.31 — Hotfix de carregamento dos Wingmen')) {
  const marker = '### v0.99.30 — Correções pós-merge: Wingmen, rádio e dano visual\n'
  if (!progress.includes(marker)) throw new Error('Seção v0.99.30 não encontrada no progresso')
  const section = `### v0.99.31 — Hotfix de carregamento dos Wingmen\n\n- **Boot restaurado:** dois follow-ups da v0.99.30 reaplicaram hunks já presentes em \`src/combat/wingmen.js\`, deixando três declarações de \`previousPlayerPosition\`/\`hasPreviousPlayerPosition\` no mesmo escopo. O navegador abortava o parse com \`SyntaxError: Identifier 'previousPlayerPosition' has already been declared\`, impedindo o jogo inteiro de iniciar.\n- **Duplicações removidas na causa-raiz:** também foram consolidados para uma única cópia \`motionWatch\`, o cálculo \`playerMotionSpeed/formationMotionGain\` e \`readyCombatTargets\`, que haviam sido reaplicados pelos mesmos commits.\n- **Sem regressão de IA:** foram preservadas as mudanças legítimas dos follow-ups — \`getAliveEnemies\` continua filtrando por \`isWingmanCombatTargetReady\`, o Focus continua limpando alvos com o mesmo contrato e a invencibilidade de spawn continua impedindo aquisição prematura.\n- **Regressão automatizada:** \`wingman-flight-stability.test.mjs\` agora lê \`wingmen.js\` e exige exatamente uma ocorrência dos quatro blocos estruturais, além de conferir os dois filtros gameplay-ready.\n- **Validação:** sintaxe de \`wingmen.js\`, suítes de estabilidade/navegação/formação/state/radio, playtest-polish, selftest e \`git diff --check\`.\n- **Versão:** v0.99.30 → v0.99.31.\n\n`
  progress = progress.replace(marker, section + marker)
}
writeFileSync('progresso/PROGRESSO_POS_.90.md', progress)

console.log('fix-wingmen-v09931.mjs: OK')
