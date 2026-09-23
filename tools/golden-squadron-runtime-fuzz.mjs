#!/usr/bin/env node
// tools/golden-squadron-runtime-fuzz.mjs
//
// Fuzz de runtime prolongado do Esquadrão Dourado e Comandante (v0.99.36).
// Executa cenários determinísticos nos níveis canônicos 1, 5 e 9 cobrindo:
// - Formação e acompanhamento suave do Comandante
// - Seleção contextual e execução das 4 ordens (Strafing, Pinça, Cerco do Laser, Fogo Coordenado)
// - Teleporte do Comandante e desorganização física dos caças
// - Reposição gradual respeitando cap, cadência e janela tática
// - Abates dinâmicos por tiro normal, carregado e Swirl
// - Validação de finitude (zero NaNs ou Infs)
// - Verificação rigorosa de teto de esquadrão, limite ofensivo autoritativo, slots únicos e ausência de referências mortas
// - Auditoria estrita de clumping (< 1.2u por > 1.0s)

import * as THREE from 'three'

if (typeof document === 'undefined') {
  const dummyCtx = new Proxy({}, {
    get: (target, prop) => {
      if (prop === 'measureText') return () => ({ width: 10 })
      if (prop === 'createLinearGradient') return () => ({ addColorStop: () => {} })
      return () => {}
    },
  })
  globalThis.document = {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => dummyCtx,
    }),
  }
}

import { createGoldenSystem } from '../src/enemies/golden.js'
import {
  getSquadronCapForLevel,
  getOffensiveCapForLevel,
  getReplenishIntervalForLevel,
  FIGHTER_STATE,
  SQUADRON_ORDER,
} from '../src/enemies/golden-squadron.js'
import { aiValidator } from '../src/ai-validator.js'

function createPrng(seed = 1337) {
  let s = seed >>> 0
  return function () {
    s = (s + 0x6D2B79F5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const BASE_SEED = Number(process.env.FUZZ_SEED) || 1337
const FRAMES_PER_SCENARIO = Number(process.env.FUZZ_FRAMES) || 2400
const DT = 1 / 60

console.log(`[Golden Squadron Fuzz] Iniciando auditoria determinística multi-nível (1, 5, 9)...`)
console.log(`Configuração: baseSeed=${BASE_SEED}, framesPorCenário=${FRAMES_PER_SCENARIO}, dt=${DT.toFixed(4)}s\n`)

const allOrdersWitnessedGlobal = new Set()
const scenarioReports = []
let globalFailures = 0

function runScenario({ level, seed, frames }) {
  const rng = createPrng(seed)
  const scene = new THREE.Scene()
  let nextEntityId = 1

  const frame = {
    position: new THREE.Vector3(0, 0, 0),
    forward: new THREE.Vector3(0, 0, 1),
    up: new THREE.Vector3(0, 1, 0),
    right: new THREE.Vector3(1, 0, 0),
  }
  const rail = {
    getFrameAt: () => frame,
    getPlayerPosition: () => new THREE.Vector3(0, 0, 0),
    getArenaCenter: () => new THREE.Vector3(0, 0, 0),
    getArenaRadius: () => 120,
    isArena: () => true,
    getDistance: () => 0,
  }

  const effects = {
    explosion: () => {},
    shockwave: () => {},
    flashMesh: () => {},
    telegraph: () => {},
    chargeCircle: () => {},
    hitSpark: () => {},
    bloomSprite: () => {},
  }

  const firedProjectiles = []
  const pushedLasers = []
  const ctx = {
    fireEnemyProjectile: (opts, targetPos) => firedProjectiles.push({ opts, targetPos }),
    pushProjectile: () => {},
    pushLaser: (l) => pushedLasers.push(l),
  }

  // Inicializa sistema Golden com RNG injetado para determinismo integral
  const goldenSys = createGoldenSystem(scene, rail, effects, () => nextEntityId++, { rng })
  goldenSys.spawn({ distanceMin: 35, distanceMax: 50, level })

  const commander = goldenSys.getAlive()[0]
  const squadron = goldenSys.getSquadron()
  const maxSquad = getSquadronCapForLevel(level)
  const maxOffensive = getOffensiveCapForLevel(level)
  const expectedReplenishInterval = getReplenishIntervalForLevel(level)

  let failures = 0
  let expectationsEvaluated = 0
  let naNsDetected = 0
  let maxFightersObserved = 0
  let maxOffensiveObserved = 0
  let capViolations = 0
  let offensiveViolations = 0
  let duplicateSlotViolations = 0
  let deadReferenceViolations = 0
  let clumpingViolations = 0
  let ordersWitnessed = new Set()
  let kills = 0
  let replenishments = 0

  const clumpDurations = new Map()

  function recordFailure(msg, ctxObj = {}) {
    failures++
    globalFailures++
    console.error(`  [FALHA Nível ${level}] ${msg}`, ctxObj)
  }

  let playerPos = new THREE.Vector3(0, 0, 0)
  let previousFighterCount = squadron.getAlive().length

  for (let f = 0; f < frames; f++) {
    // 1. Movimento dinâmico do jogador
    playerPos.x = Math.sin(f * 0.02) * 20 + (rng() - 0.5) * 2.0
    playerPos.y = Math.cos(f * 0.015) * 8 + (rng() - 0.5) * 1.5
    playerPos.z = Math.sin(f * 0.01) * 15

    // 2. Mantém o comandante com vida para prosseguir todo o teste do cenário
    if (commander.hp < 40) commander.hp = commander.maxHp

    // 3. Disparos simulados do jogador
    if (rng() < 0.05) {
      const aliveFighters = squadron.getAlive()
      if (aliveFighters.length > 0 && rng() < 0.7) {
        const target = aliveFighters[Math.floor(rng() * aliveFighters.length)]
        const shotStart = playerPos.clone()
        const shotEnd = target.mesh.position.clone()

        if (rng() < 0.3) {
          // Swirl Piercing Hit
          const pierced = new Set()
          const hits = goldenSys.resolvePiercingHit(shotStart, shotEnd, 6, pierced, 3.5)
          for (const h of hits) {
            if (h.killed && h.kind === 'golden_fighter') kills++
          }
        } else {
          // Tiro normal ou carregado
          const dmg = rng() < 0.3 ? 10 : 3
          const hit = goldenSys.resolveHit(shotStart, shotEnd, dmg, false, 1.5, effects)
          if (hit && hit.killed && hit.kind === 'golden_fighter') kills++
        }
      } else {
        // Disparo no comandante (ativa dash reativo ou teleporte quando disponível)
        const shotStart = playerPos.clone()
        const shotEnd = commander.mesh.position.clone()
        goldenSys.resolveHit(shotStart, shotEnd, 2, false, 2.0, effects)
      }
    }

    // 4. Atualização do sistema
    goldenSys.update(DT, playerPos, ctx)

    // 5. Verificação do estado do esquadrão
    const alive = squadron.getAlive()
    const activeCount = alive.length
    if (activeCount > maxFightersObserved) maxFightersObserved = activeCount

    if (activeCount > previousFighterCount) {
      replenishments++
    }
    previousFighterCount = activeCount

    // Verificação estrita de teto de esquadrão
    expectationsEvaluated++
    if (activeCount > maxSquad) {
      capViolations++
      recordFailure(`Teto de caças violado: ${activeCount} > ${maxSquad}`, { frame: f, activeCount, maxSquad })
    }

    // Verificação estrita de limite ofensivo autoritativo (cobre PREPARING, ATTACKING, PASSING)
    const offensiveParticipants = squadron.getOffensiveParticipants()
    if (offensiveParticipants.length > maxOffensiveObserved) maxOffensiveObserved = offensiveParticipants.length

    expectationsEvaluated++
    if (offensiveParticipants.length > maxOffensive) {
      offensiveViolations++
      recordFailure(`Limite ofensivo violado: ${offensiveParticipants.length} > ${maxOffensive}`, {
        frame: f,
        offensiveParticipants: offensiveParticipants.length,
        maxOffensive,
        order: squadron.getCurrentOrder(),
      })
    }

    // Registra ordens observadas
    const currentOrder = squadron.getCurrentOrder()
    if (currentOrder !== SQUADRON_ORDER.NONE) {
      ordersWitnessed.add(currentOrder)
      allOrdersWitnessedGlobal.add(currentOrder)
    }

    // Verificação de unicidade de slots e finitude de coordenadas
    const slotsUsed = new Set()
    for (const ftr of alive) {
      expectationsEvaluated++
      if (slotsUsed.has(ftr.slotIndex)) {
        duplicateSlotViolations++
        recordFailure(`Slot duplicado: slot ${ftr.slotIndex}`, { frame: f, fighterId: ftr.id })
      }
      slotsUsed.add(ftr.slotIndex)

      const pos = ftr.mesh.position
      if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y) || !Number.isFinite(pos.z) || Number.isNaN(pos.x)) {
        naNsDetected++
        recordFailure(`NaN detectado em caça #${ftr.id}`, { frame: f, pos })
      }
    }

    // Auditoria estrita de referências mortas (deadReferenceViolations)
    const currentOrderState = squadron.getOrderState()
    if (currentOrderState && Array.isArray(currentOrderState.participants)) {
      const participantIds = new Set()
      const allFighters = squadron.getAll()
      for (const p of currentOrderState.participants) {
        expectationsEvaluated++
        // 1. Participante deve pertencer à lista de caças do esquadrão
        if (!allFighters.some((item) => item.id === p.id)) {
          deadReferenceViolations++
          recordFailure(`Participante #${p.id} da ordem não pertence ao esquadrão`, { frame: f, order: currentOrder })
        }
        // 2. Participante ativo não pode estar marcado como dying
        if (p.dying) {
          deadReferenceViolations++
          recordFailure(`Participante #${p.id} está marcado como dying mas permaneceu ativo na ordem`, { frame: f, order: currentOrder })
        }
        // 3. Mesh deve estar anexado à cena
        if (!p.mesh || p.mesh.parent !== scene) {
          deadReferenceViolations++
          recordFailure(`Mesh do participante #${p.id} foi desanexado da cena durante a ordem`, { frame: f, order: currentOrder })
        }
        // 4. Cada ID deve ser único na ordem
        if (participantIds.has(p.id)) {
          deadReferenceViolations++
          recordFailure(`ID #${p.id} duplicado em participants da ordem`, { frame: f, order: currentOrder })
        }
        participantIds.add(p.id)
      }
    }

    // Checa integridade dos meshes de todos os caças vivos
    for (const ftr of alive) {
      expectationsEvaluated++
      if (!ftr.mesh || ftr.mesh.parent !== scene) {
        deadReferenceViolations++
        recordFailure(`Caça vivo #${ftr.id} sem mesh válido anexado à cena`, { frame: f })
      }
    }

    // Auditoria estrita de clumping (< 1.2u por > 1.0s)
    for (let i = 0; i < alive.length; i++) {
      for (let j = i + 1; j < alive.length; j++) {
        const f1 = alive[i]
        const f2 = alive[j]
        const key = `${Math.min(f1.id, f2.id)}-${Math.max(f1.id, f2.id)}`
        const dist = f1.mesh.position.distanceTo(f2.mesh.position)

        if (dist < 1.2) {
          const curDur = (clumpDurations.get(key) || 0) + DT
          clumpDurations.set(key, curDur)
          // Contrato estrito: > 1.0s de sobreposição a < 1.2u constitui violação de clumping
          if (curDur > 1.0) {
            clumpingViolations++
            recordFailure(`Clumping persistente entre caças ${key} (${curDur.toFixed(2)}s > 1.0s)`, { frame: f, dist })
          }
        } else {
          clumpDurations.delete(key)
        }
      }
    }
  }

  // Integra expectativas do aiValidator
  const valReport = aiValidator.buildReport()
  expectationsEvaluated += valReport.total_expectativas_avaliadas
  if (valReport.expectativas_falhas.length > 0) {
    for (const failItem of valReport.expectativas_falhas) {
      recordFailure(`aiValidator: ${failItem.description}`, failItem.context)
    }
  }

  goldenSys.dispose()

  const report = {
    level,
    seed,
    frames,
    durationS: (frames * DT).toFixed(1),
    expectations: expectationsEvaluated,
    maxSquadObserved: maxFightersObserved,
    squadCap: maxSquad,
    maxOffensiveObserved,
    offensiveCap: maxOffensive,
    replenishIntervalS: expectedReplenishInterval,
    kills,
    replenishments,
    capViolations,
    offensiveViolations,
    duplicateSlotViolations,
    deadReferenceViolations,
    clumpViolations: clumpingViolations,
    naNs: naNsDetected,
    ordersWitnessed: Array.from(ordersWitnessed),
    failures,
  }

  scenarioReports.push(report)
  return report
}

// Executa os 3 cenários canônicos de dificuldade
console.log('--- Executando Cenário 1: Dificuldade 1 (Cap 2, Ofensivo 1, Reposição 15s) ---')
const rep1 = runScenario({ level: 1, seed: BASE_SEED, frames: FRAMES_PER_SCENARIO })
console.log(`  > Concluído: ${rep1.expectations} expectativas, ${rep1.failures} falhas, ordens: [${rep1.ordersWitnessed.join(', ')}]`)

console.log('\n--- Executando Cenário 2: Dificuldade 5 (Cap 4, Ofensivo 2, Reposição 11s) ---')
const rep5 = runScenario({ level: 5, seed: BASE_SEED + 1, frames: FRAMES_PER_SCENARIO })
console.log(`  > Concluído: ${rep5.expectations} expectativas, ${rep5.failures} falhas, ordens: [${rep5.ordersWitnessed.join(', ')}]`)

console.log('\n--- Executando Cenário 3: Dificuldade 9 (Cap 6, Ofensivo 3, Reposição 8s) ---')
const rep9 = runScenario({ level: 9, seed: BASE_SEED + 2, frames: FRAMES_PER_SCENARIO })
console.log(`  > Concluído: ${rep9.expectations} expectativas, ${rep9.failures} falhas, ordens: [${rep9.ordersWitnessed.join(', ')}]`)

// Validação das 4 ordens obrigatórias
const requiredOrders = [
  SQUADRON_ORDER.STRAFING_RUN,
  SQUADRON_ORDER.PINCER,
  SQUADRON_ORDER.COORDINATED_FIRE,
  SQUADRON_ORDER.LASER_FLANK,
]

for (const reqOrder of requiredOrders) {
  if (!allOrdersWitnessedGlobal.has(reqOrder)) {
    globalFailures++
    console.error(`\n[FALHA DE COBERTURA] Ordem obrigatória ${reqOrder} NÃO foi observada em nenhum cenário do fuzz!`)
  }
}

// Relatório Canônico Estruturado Consolidado
const totalFrames = scenarioReports.reduce((acc, r) => acc + r.frames, 0)
const totalExpectations = scenarioReports.reduce((acc, r) => acc + r.expectations, 0)
const totalKills = scenarioReports.reduce((acc, r) => acc + r.kills, 0)
const totalReplenishments = scenarioReports.reduce((acc, r) => acc + r.replenishments, 0)
const totalDeadRefViolations = scenarioReports.reduce((acc, r) => acc + r.deadReferenceViolations, 0)
const totalClumpViolations = scenarioReports.reduce((acc, r) => acc + r.clumpViolations, 0)
const totalNaNs = scenarioReports.reduce((acc, r) => acc + r.naNs, 0)
const totalCapViolations = scenarioReports.reduce((acc, r) => acc + r.capViolations, 0)
const totalOffensiveViolations = scenarioReports.reduce((acc, r) => acc + r.offensiveViolations, 0)

console.log('\n========================================================================================')
console.log('              RELATÓRIO CANÔNICO DO FUZZ RUNTIME DO ESQUADRÃO DOURADO                   ')
console.log('========================================================================================')
console.table(scenarioReports.map((r) => ({
  'Nível': r.level,
  'Seed': r.seed,
  'Frames': r.frames,
  'Expectativas': r.expectations,
  'Ordens Presenciadas': r.ordersWitnessed.join(', '),
  'Squad Max (Cap)': `${r.maxSquadObserved} (${r.squadCap})`,
  'Ofensivo Max (Cap)': `${r.maxOffensiveObserved} (${r.offensiveCap})`,
  'Kills': r.kills,
  'Reposições': r.replenishments,
  'Dead Refs': r.deadReferenceViolations,
  'Clump (>1.0s)': r.clumpViolations,
  'NaNs': r.naNs,
  'Falhas': r.failures,
})))

console.log('----------------------------------------------------------------------------------------')
console.log(`TOTAL CONSOLIDADO:`)
console.log(`- Cenários testados: 3 (Níveis 1, 5 e 9)`)
console.log(`- Frames totais: ${totalFrames} (${(totalFrames * DT).toFixed(1)}s de gameplay a 60 fps)`)
console.log(`- Expectativas totais avaliadas: ${totalExpectations}`)
console.log(`- Abates simulados: ${totalKills}`)
console.log(`- Reposições realizadas: ${totalReplenishments}`)
console.log(`- Violações de teto de esquadrão: ${totalCapViolations}`)
console.log(`- Violações de limite ofensivo: ${totalOffensiveViolations}`)
console.log(`- Violações de referências mortas: ${totalDeadRefViolations}`)
console.log(`- Violações de clumping (>1.0s): ${totalClumpViolations}`)
console.log(`- NaNs / Infs detectados: ${totalNaNs}`)
console.log(`- Ordens obrigatórias confirmadas: [${Array.from(allOrdersWitnessedGlobal).join(', ')}]`)
console.log(`- Falhas totais: ${globalFailures}`)
console.log('========================================================================================')

if (globalFailures > 0) {
  console.error(`\n[FALHA] O Fuzz do Esquadrão Dourado concluiu com ${globalFailures} falhas!`)
  process.exit(1)
} else {
  console.log(`\n[SUCESSO] failures = 0. Todos os contratos táticos, invariantes e ordens foram validados.`)
  process.exit(0)
}
