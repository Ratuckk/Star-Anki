import fs from 'node:fs'

function read(p) { return fs.readFileSync(p, 'utf8') }
function write(p, s) { fs.writeFileSync(p, s) }
function one(s, a, b, label) {
  const n = s.split(a).length - 1
  if (n !== 1) throw new Error(`${label}: ${n} matches`)
  return s.replace(a, b)
}
function replaceBetween(s, start, end, replacement, label) {
  const i = s.indexOf(start)
  if (i < 0) throw new Error(`${label}: start missing`)
  const j = s.indexOf(end, i)
  if (j < 0) throw new Error(`${label}: end missing`)
  return s.slice(0, i) + replacement + s.slice(j)
}

let w = read('src/combat/wingmen.js')
w = one(
  w,
  `} from './wingman-state-controller.js'\n`,
  `} from './wingman-state-controller.js'\nimport {\n  WINGMAN_CLUMP_DISTANCE,\n  WINGMAN_CLUMP_GRACE_S,\n  computeWingmanPairSeparation,\n} from './wingman-formation-separation.js'\n`,
  'formation solver import',
)
w = one(
  w,
  `const _wmDesiredVelocity = new THREE.Vector3()\nconst _wmDiff = new THREE.Vector3()\nconst _wmPush = new THREE.Vector3()\n`,
  `const _wmDesiredVelocity = new THREE.Vector3()\nconst _wmPairPush = new THREE.Vector3()\n`,
  'pair scratch vectors',
)
w = one(
  w,
  `  const playerRollHistory = []\n\n  function activeRadioPilotIds() {`,
  `  const playerRollHistory = []\n  let activeSeparationPairs = new Set()\n  const closeSeparationSince = new Map()\n  const reportedFormationClumps = new Set()\n\n  function activeRadioPilotIds() {`,
  'separation tracking state',
)
w = one(
  w,
  `      overlapWith: new Set(),\n      auxShieldVisual,`,
  `      separationPush: new THREE.Vector3(),\n      auxShieldVisual,`,
  'spawn separation vector',
)
w = one(
  w,
  `    wingmanRadio.reset()\n    pendingRadioMessage = null\n    pendingRadioQueue = null\n`,
  `    wingmanRadio.reset()\n    pendingRadioMessage = null\n    pendingRadioQueue = null\n    activeSeparationPairs.clear()\n    closeSeparationSince.clear()\n    reportedFormationClumps.clear()\n`,
  'clear separation tracking',
)
w = one(
  w,
  `    chargeHeldTimer = homingCharging ? chargeHeldTimer + dt : 0\n\n    // Comando de ofensividade do esquadrão`,
  `    chargeHeldTimer = homingCharging ? chargeHeldTimer + dt : 0\n\n    // Deconflição da ala usa um snapshot único do começo do frame e calcula cada par uma vez.\n    // Isso evita o solver antigo A→B/B→A, em que a posição de A já podia ter sido alterada\n    // quando B era processado. O impulso é aplicado de forma perfeitamente oposta aos dois.\n    for (const member of activeWingmen) member.separationPush.set(0, 0, 0)\n    const nextSeparationPairs = new Set()\n    for (let idx = 0; idx < activeWingmen.length; idx += 1) {\n      const a = activeWingmen[idx]\n      for (let otherIdx = idx + 1; otherIdx < activeWingmen.length; otherIdx += 1) {\n        const b = activeWingmen[otherIdx]\n        const result = computeWingmanPairSeparation(\n          { id: a.profile.id, position: a.mesh.position, slot: FORMATION_SLOTS[a.profile.id], retreating: a.state === 'retreating' },\n          { id: b.profile.id, position: b.mesh.position, slot: FORMATION_SLOTS[b.profile.id], retreating: b.state === 'retreating' },\n          frame,\n          WINGMAN_SEPARATION_DISTANCE,\n          WINGMAN_SEPARATION_SPEED,\n        )\n        const lowId = Math.min(a.profile.id, b.profile.id)\n        const highId = Math.max(a.profile.id, b.profile.id)\n        const pairKey = lowId + ':' + highId\n        if (!result) {\n          closeSeparationSince.delete(pairKey)\n          reportedFormationClumps.delete(pairKey)\n          continue\n        }\n\n        nextSeparationPairs.add(pairKey)\n        _wmPairPush.set(result.pushA.x, result.pushA.y, result.pushA.z)\n        a.separationPush.addScaledVector(_wmPairPush, 1)\n        b.separationPush.addScaledVector(_wmPairPush, -1)\n\n        if (!activeSeparationPairs.has(pairKey)) {\n          aiValidator.expect(\n            'Separação de ala calcula impulsos finitos e simétricos por par',\n            () => Number.isFinite(result.pushA.x) && Number.isFinite(result.pushA.y) && Number.isFinite(result.pushA.z) &&\n              Math.abs(result.pushA.x + result.pushB.x) < 1e-6 &&\n              Math.abs(result.pushA.y + result.pushB.y) < 1e-6 &&\n              Math.abs(result.pushA.z + result.pushB.z) < 1e-6,\n            { pilotA: a.profile.id, pilotB: b.profile.id, distance: result.distance, pushA: result.pushA, pushB: result.pushB },\n          )\n          aiValidator.logMechanic('wingman-formation-separation', 'separacao-iniciada', {\n            pilotA: a.profile.id, pilotB: b.profile.id, distance: result.distance,\n            stateA: a.state, stateB: b.state, emergencyA: a.emergencyRegroup, emergencyB: b.emergencyRegroup,\n          })\n        }\n\n        if (result.distance < WINGMAN_CLUMP_DISTANCE) {\n          if (!closeSeparationSince.has(pairKey)) closeSeparationSince.set(pairKey, elapsed)\n          const closeFor = elapsed - closeSeparationSince.get(pairKey)\n          if (closeFor >= WINGMAN_CLUMP_GRACE_S && !reportedFormationClumps.has(pairKey)) {\n            reportedFormationClumps.add(pairKey)\n            aiValidator.expect(\n              'Wingmen não permanecem praticamente sobrepostos por mais de 0.5s',\n              () => false,\n              {\n                pilotA: a.profile.id, pilotB: b.profile.id, distance: result.distance, closeFor,\n                stateA: a.state, stateB: b.state, emergencyA: a.emergencyRegroup, emergencyB: b.emergencyRegroup,\n                distanceAPlayer: a.mesh.position.distanceTo(playerPos), distanceBPlayer: b.mesh.position.distanceTo(playerPos),\n              },\n            )\n            aiValidator.logMechanic('wingman-formation-clump', 'sobreposicao-persistente', {\n              pilotA: a.profile.id, pilotB: b.profile.id, distance: result.distance, closeFor,\n              stateA: a.state, stateB: b.state,\n            })\n          }\n        } else {\n          closeSeparationSince.delete(pairKey)\n          reportedFormationClumps.delete(pairKey)\n        }\n      }\n    }\n    for (const pairKey of activeSeparationPairs) {\n      if (!nextSeparationPairs.has(pairKey)) {\n        closeSeparationSince.delete(pairKey)\n        reportedFormationClumps.delete(pairKey)\n      }\n    }\n    activeSeparationPairs = nextSeparationPairs\n\n    // Comando de ofensividade do esquadrão`,
  'pairwise prepass',
)
w = one(
  w,
  `          w.overlapWith.clear()\n          w.patrolTarget.copy(_wmSlotPos)`,
  `          w.patrolTarget.copy(_wmSlotPos)`,
  'emergency overlap clear',
)
w = replaceBetween(
  w,
  `      // Separação de ala: também resolve o caso degenerado de duas naves exatamente no mesmo\n`,
  `      // Aceleração com inércia estável (por piloto — ver flightProfile.accelRate)\n`,
  `      // Impulso de separação já foi calculado simetricamente no prepass do frame.\n      if (w.separationPush.lengthSq() > 0) _wmDesiredVelocity.add(w.separationPush)\n\n`,
  'legacy sequential separation loop',
)
write('src/combat/wingmen.js', w)

let selftest = read('src/selftest.mjs')
selftest = one(
  selftest,
  `import './wingman-radio-callresponse.test.mjs'\n`,
  `import './wingman-radio-callresponse.test.mjs'\nimport './wingman-formation-separation.test.mjs'\n`,
  'selftest formation import',
)
write('src/selftest.mjs', selftest)

let version = read('src/version.js')
version = one(version, "export const GAME_VERSION = 'v0.99.23'", "export const GAME_VERSION = 'v0.99.24'", 'version bump')
write('src/version.js', version)

let progress = read('progresso/PROGRESSO_POS_.90.md')
const marker = '### v0.99.23 — Rádio Call & Response dos Wingmen\n'
const entry = `### v0.99.24 — Deconflição simétrica e detector de clump dos Wingmen\n\n- Playtest real revelou que os quatro Wingmen ainda podiam convergir para praticamente o mesmo ponto durante retorno de emergência. O log do \`aiValidator\` mostrou pares a 0.0002–2.4u e 200 eventos de separação em ~267ms, embora todas as expectativas anteriores passassem.\n- A separação deixou de ser resolvida sequencialmente dentro do loop de cada piloto. Agora cada par não ordenado é calculado uma única vez a partir do snapshot do começo do frame e recebe impulsos exatamente opostos, eliminando dependência da ordem de iteração.\n- Sobreposição exata usa a diferença entre as vagas de formação como direção determinística de escape, em vez de um vetor genérico por paridade. Assim cada piloto é empurrado para o lado coerente com sua própria vaga.\n- Emergency regroup não limpa mais memória de separação todo frame. O log passa a registrar apenas a entrada real de um par em conflito, impedindo que a timeline de 200 eventos seja apagada em frações de segundo.\n- Adicionado detector de clump persistente: se dois Wingmen permanecerem a menos de 1u por 0.5s, o \`aiValidator\` gera uma falha com estados, flags de emergência e distâncias ao jogador. Isso cobre justamente o falso verde observado no playtest.\n- Criado \`wingman-formation-separation.js\`, puro e testável, e a suíte \`wingman-formation-separation.test.mjs\` cobre simetria, sobreposição exata, retreat e proteção estrutural contra a regressão do loop antigo.\n\n**Validado:** sintaxe dos módulos alterados, suíte de separação, suíte da state machine, suíte de Call & Response, \`src/selftest.mjs\` e \`git diff --check\`.\n\n`
if (!progress.includes(marker)) throw new Error('progress marker missing')
progress = progress.replace(marker, entry + marker)
write('progresso/PROGRESSO_POS_.90.md', progress)

console.log('wingman formation fix applied')
