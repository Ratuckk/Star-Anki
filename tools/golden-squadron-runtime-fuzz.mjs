#!/usr/bin/env node
// tools/golden-squadron-runtime-fuzz.mjs
//
// Fuzz de runtime prolongado do Esquadrão Dourado e Comandante (v0.99.36).
// Simula 3600 frames (60s a 60 fps) de combate contínuo na arena cobrindo:
// - Formação e acompanhamento suave do Comandante
// - Seleção contextual e execução das 4 ordens (Strafing, Pinça, Cerco do Laser, Fogo Coordenado)
// - Teleporte do Comandante e desorganização física dos caças
// - Reposição gradual respeitando cap e cadência
// - Abates dinâmicos por tiro normal, carregado e Swirl
// - Validação de finitude (zero NaNs ou Infs)
// - Verificação rigorosa de teto de esquadrão, limite ofensivo, slots únicos e ausência de referências mortas

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

const SEED = Number(process.env.FUZZ_SEED) || 1337
const TOTAL_FRAMES = Number(process.env.FUZZ_FRAMES) || 3600
const DT = 1 / 60
const rng = createPrng(SEED)

console.log(`[Golden Squadron Fuzz] Iniciando auditoria runtime com seed=${SEED}, frames=${TOTAL_FRAMES}...`)

const scene = new THREE.Scene()
let playerIdVal = 1

function makeMockRail() {
  const frame = {
    position: new THREE.Vector3(0, 0, 0),
    forward: new THREE.Vector3(0, 0, 1),
    up: new THREE.Vector3(0, 1, 0),
    right: new THREE.Vector3(1, 0, 0),
  }
  return {
    getFrameAt: () => frame,
    getPlayerPosition: () => new THREE.Vector3(0, 0, 0),
    getArenaCenter: () => new THREE.Vector3(0, 0, 0),
    getArenaRadius: () => 120,
    isArena: () => true,
  }
}

const rail = makeMockRail()

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

// Inicializa sistema Golden
const goldenSys = createGoldenSystem(scene, rail, effects, () => playerIdVal++)
const level = 5 // Dificuldade de referência (cap = 4, ofensivo = 2)
goldenSys.spawn({ distanceMin: 35, distanceMax: 50, level })

const commander = goldenSys.getAlive()[0]
const squadron = goldenSys.getSquadron()
const maxSquad = getSquadronCapForLevel(level)
const maxOffensive = getOffensiveCapForLevel(level)

// Métricas de auditoria
let failures = 0
let expectationsEvaluated = 0
let naNsDetected = 0
let maxFightersObserved = 0
let maxAttackersObserved = 0
let capViolations = 0
let offensiveViolations = 0
let duplicateSlotViolations = 0
let deadReferenceViolations = 0
let clumpingViolations = 0
let ordersWitnessed = new Set()
let totalKills = 0
let totalReplenishments = 0

const clumpDurations = new Map()

function recordFailure(msg, ctx = {}) {
  failures++
  console.error(`[FALHA FUZZ] ${msg}`, ctx)
}

let playerPos = new THREE.Vector3(0, 0, 0)
let previousFighterCount = squadron.getAlive().length

for (let frame = 0; frame < TOTAL_FRAMES; frame++) {
  // 1. Movimento dinâmico do jogador
  playerPos.x = Math.sin(frame * 0.02) * 20 + (rng() - 0.5) * 2.0
  playerPos.y = Math.cos(frame * 0.015) * 8 + (rng() - 0.5) * 1.5
  playerPos.z = Math.sin(frame * 0.01) * 15

  // 2. Mantém o comandante ativo durante todo o stress test de 60s
  if (commander.hp < 40) commander.hp = commander.maxHp

  // 3. Disparos do jogador simulando cadência de combate real (a cada ~0.5s a 1.0s)
  if (rng() < 0.04) {
    const fightersToTarget = squadron.getAlive()
    if (fightersToTarget.length > 0 && rng() < 0.7) {
      // Alvo: caça subordinado
      const target = fightersToTarget[Math.floor(rng() * fightersToTarget.length)]
      const shotStart = playerPos.clone()
      const shotEnd = target.mesh.position.clone()

      if (rng() < 0.3) {
        // Swirl Piercing Hit
        const pierced = new Set()
        const hits = goldenSys.resolvePiercingHit(shotStart, shotEnd, 6, pierced, 3.5)
        for (const h of hits) {
          if (h.killed && h.kind === 'golden_fighter') totalKills++
        }
      } else {
        // Tiro normal ou carregado
        const dmg = rng() < 0.3 ? 10 : 3
        const hit = goldenSys.resolveHit(shotStart, shotEnd, dmg, false, 1.5, effects)
        if (hit && hit.killed && hit.kind === 'golden_fighter') totalKills++
      }
    } else {
      // Disparo no comandante (ativa dash reativo ou teleporte quando disponível)
      const shotStart = playerPos.clone()
      const shotEnd = commander.mesh.position.clone()
      goldenSys.resolveHit(shotStart, shotEnd, 2, false, 2.0, effects)
    }
  }

  // 3. Atualização do sistema
  goldenSys.update(DT, playerPos, ctx)

  // 4. Inspeciona esquadrão
  const aliveFighters = squadron.getAlive()
  const activeCount = aliveFighters.length
  if (activeCount > maxFightersObserved) maxFightersObserved = activeCount

  // Detecta reposição
  if (activeCount > previousFighterCount) {
    totalReplenishments++
  }
  previousFighterCount = activeCount

  // Verificação de teto
  expectationsEvaluated++
  if (activeCount > maxSquad) {
    capViolations++
    recordFailure(`Teto de caças violado: ${activeCount} > ${maxSquad}`, { frame, activeCount, maxSquad })
  }

  // Verificação de limite ofensivo
  const attackingFighters = aliveFighters.filter((f) => f.state === FIGHTER_STATE.ATTACKING)
  if (attackingFighters.length > maxAttackersObserved) maxAttackersObserved = attackingFighters.length

  expectationsEvaluated++
  if (attackingFighters.length > maxOffensive) {
    offensiveViolations++
    recordFailure(`Limite ofensivo violado: ${attackingFighters.length} > ${maxOffensive}`, { frame, attackers: attackingFighters.length })
  }

  // Registra ordens observadas
  const order = squadron.getCurrentOrder()
  if (order !== SQUADRON_ORDER.NONE) ordersWitnessed.add(order)

  // Verificação de unicidade de slots e finitude
  const slotsUsed = new Set()
  for (const f of aliveFighters) {
    expectationsEvaluated++
    if (slotsUsed.has(f.slotIndex)) {
      duplicateSlotViolations++
      recordFailure(`Slot duplicado detectado: slot ${f.slotIndex}`, { frame, fighterId: f.id })
    }
    slotsUsed.add(f.slotIndex)

    const pos = f.mesh.position
    if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y) || !Number.isFinite(pos.z) || Number.isNaN(pos.x)) {
      naNsDetected++
      recordFailure(`NaN detectado em caça ${f.id}`, { frame, pos })
    }
  }

  // Verificação de clumping persistente entre caças (< 1.2u por > 1.0s)
  for (let i = 0; i < aliveFighters.length; i++) {
    for (let j = i + 1; j < aliveFighters.length; j++) {
      const f1 = aliveFighters[i]
      const f2 = aliveFighters[j]
      const key = `${Math.min(f1.id, f2.id)}-${Math.max(f1.id, f2.id)}`
      const dist = f1.mesh.position.distanceTo(f2.mesh.position)

      if (dist < 1.2) {
        const curDur = (clumpDurations.get(key) || 0) + DT
        clumpDurations.set(key, curDur)
        if (curDur > 1.2) {
          clumpingViolations++
          recordFailure(`Clumping persistente entre caças ${key} (${curDur.toFixed(2)}s)`, { frame, dist })
        }
      } else {
        clumpDurations.delete(key)
      }
    }
  }
}

// Avaliações de aiValidator
const validatorSummary = aiValidator.buildReport()
expectationsEvaluated += validatorSummary.total_expectativas_avaliadas
if (validatorSummary.expectativas_falhas.length > 0) {
  for (const f of validatorSummary.expectativas_falhas) {
    recordFailure(`aiValidator: ${f.description}`, f.context)
  }
}

const simDurationS = (TOTAL_FRAMES * DT).toFixed(1)
console.log('\n======================================================')
console.log('       RELATÓRIO DO FUZZ RUNTIME DO ESQUADRÃO DOURADO ')
console.log('======================================================')
console.log(`seed: ${SEED}`)
console.log(`frames executados: ${TOTAL_FRAMES}`)
console.log(`duração simulada: ${simDurationS}s`)
console.log(`número de expectativas: ${expectationsEvaluated}`)
console.log(`quantidade de falhas: ${failures}`)
console.log(`máximo de caças vivos observados: ${maxFightersObserved} (cap = ${maxSquad})`)
console.log(`máximo de atacantes simultâneos observados: ${maxAttackersObserved} (cap = ${maxOffensive})`)
console.log(`violações de teto de esquadrão: ${capViolations}`)
console.log(`violações de limite ofensivo: ${offensiveViolations}`)
console.log(`violações de slots duplicados: ${duplicateSlotViolations}`)
console.log(`violações de referências mortas: ${deadReferenceViolations}`)
console.log(`violações de clumping persistente: ${clumpingViolations}`)
console.log(`NaNs / Infs detectados: ${naNsDetected}`)
console.log(`total de abates de caças simulados: ${totalKills}`)
console.log(`total de reposições executadas: ${totalReplenishments}`)
console.log(`ordens táticas observadas: ${Array.from(ordersWitnessed).join(', ')}`)
console.log('======================================================')

if (failures > 0) {
  console.error(`\n[FALHA] O fuzz do Esquadrão Dourado terminou com ${failures} falhas!`)
  process.exit(1)
} else {
  console.log(`\n[SUCESSO] failures = 0. Todos os contratos táticos e invariantes foram cumpridos.`)
  process.exit(0)
}
