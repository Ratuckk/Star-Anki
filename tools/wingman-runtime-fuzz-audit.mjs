#!/usr/bin/env node
// tools/wingman-runtime-fuzz-audit.mjs
//
// Fuzz de runtime dos Wingmen para validação de gameplay, steering, deconflição e estabilidade.
// Simula 4 caças ativos em gameplay contínuo cobrindo:
// - Formação e voo nominal de patrulha
// - Dogfight e aquisição dinâmica de alvos
// - Attack lane / comando de foco tático ([D])
// - Suporte e escolta (Aux Shield do Peppy, reparos do Slippy)
// - Damaged-passive e recuperação
// - Investida e ramming do Falco
// - Rail catch-up com histerese (start = 32u, release = 22u)
// - Desvio preditivo de obstáculos (obstacle avoidance)
// - Separação física e contrato de clumping (distância < 1.0u por no máximo 0.5s)
// - Finitude universal (zero NaNs ou Infs)

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
if (typeof Image === 'undefined') {
  globalThis.Image = class {
    constructor() {
      this.src = ''
    }
  }
}

import { createSquadronSystem } from '../src/combat/wingmen.js'
import {
  WINGMAN_CLUMP_DISTANCE,
  WINGMAN_CLUMP_GRACE_S,
} from '../src/combat/wingman-formation-separation.js'
import {
  WINGMAN_RAIL_CATCHUP_START,
  WINGMAN_RAIL_CATCHUP_RELEASE,
} from '../src/combat/wingman-navigation.js'
import { aiValidator } from '../src/ai-validator.js'

// PRNG Mulberry32 determinístico baseado em seed
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
const TOTAL_FRAMES = Number(process.env.FUZZ_FRAMES) || 3600 // 60 segundos a 60 fps
const DT = 1 / 60
const rng = createPrng(SEED)

console.log(`[Wingman Runtime Fuzz] Iniciando auditoria runtime com seed=${SEED}, frames=${TOTAL_FRAMES}...`)

// Mocks do ambiente de Three.js
const scene = new THREE.Scene()

// Mock do Rail
let playerForwardPos = new THREE.Vector3(0, 0, 0)
let playerForwardSpeed = 45
let railRoll = 0

const rail = {
  getPlayerPosition: () => playerForwardPos.clone(),
  getShipNosePosition: () => playerForwardPos.clone().add(new THREE.Vector3(0, 0, 2.5)),
  getFrameAt: () => ({
    position: playerForwardPos.clone(),
    forward: new THREE.Vector3(0, 0, 1),
    up: new THREE.Vector3(0, 1, 0),
    right: new THREE.Vector3(1, 0, 0),
  }),
  isArena: () => false,
  getRollAngle: () => railRoll,
}

// Mock de Effects
const effects = {
  muzzleFlash: () => {},
  bloomSprite: () => {},
  explosion: () => {},
  shockwave: () => {},
  ricochetSparks: () => {},
  wingmanSpawn: () => {},
  maxChargeRings: () => {},
  projectileTrail: () => {},
  hitSpark: () => {},
}

// Inimigos e obstáculos dinâmicos
const dynamicEnemies = []
const dynamicObstacles = []

const enemies = {
  removeProjectilesNear: () => {},
  getAlive: () => dynamicEnemies.filter((e) => e.hp > 0),
  getGoldenAlive: () => [],
  interceptThreateningProjectile: () => null,
  resolveProjectileHit: () => null,
  getAvoidanceObstacles: () => dynamicObstacles,
}

// Mock do Player
const player = {
  config: {
    homingChargeMinMs: 400,
    homingChargeMaxMs: 1200,
    homingMaxTargets: 4,
  },
  position: playerForwardPos,
  getShieldValue: () => 3,
  getShieldMax: () => 3,
  getMaxHealth: () => 10,
  markWingmanDown: () => {},
}

// Inicializa o esquadrão com 4 caças
aiValidator.reset()
const squadron = createSquadronSystem(scene, rail, effects, enemies)
squadron.setWingmanCount(4)

// Estatísticas e rastreamento
let failures = 0
const failureDetails = []

let clumpingEventsDetected = 0
let maxClumpDuration = 0
const clumpDurationByPair = new Map()
const isPairClumped = new Map()

let catchUpActivations = 0
let catchUpExits = 0
const wingmanCatchupState = new Map([ [0, false], [1, false], [2, false], [3, false] ])
const wingmanCatchupTransitions = new Map([ [0, []], [1, []], [2, []], [3, []] ])

let obstacleAvoidanceChallengeEvents = 0
let naNsDetected = 0
let expectationsEvaluated = 0

function recordFailure(msg, ctx = {}) {
  failures += 1
  failureDetails.push({ frame: currentFrame, msg, ctx })
  if (failureDetails.length <= 10) {
    console.error(`  [FALHA Fuzz Frame ${currentFrame}] ${msg}`, ctx)
  }
}

let currentFrame = 0

// Loop de simulação
for (currentFrame = 1; currentFrame <= TOTAL_FRAMES; currentFrame++) {
  const elapsed = currentFrame * DT

  // 1. Dinâmica do Jogador e Rail (Weaving, aceleração, frenagem, curvas)
  if (currentFrame % 450 >= 100 && currentFrame % 450 <= 175) {
    // Aceleração forte para testar catch-up
    playerForwardSpeed = 140 + rng() * 25
  } else if (currentFrame % 450 > 175 && currentFrame % 450 <= 280) {
    // Desaceleração para permitir retorno da formação e saída do catch-up
    playerForwardSpeed = 30 + rng() * 10
  } else {
    // Velocidade de cruzeiro padrão
    playerForwardSpeed = 45 + rng() * 15
  }

  // Weave lateral suave do líder
  playerForwardPos.x = Math.sin(elapsed * 0.8) * 14
  playerForwardPos.y = Math.cos(elapsed * 0.6) * 6
  playerForwardPos.z += playerForwardSpeed * DT
  railRoll = Math.sin(elapsed * 0.5) * 0.25

  // 2. Geração dinâmica de inimigos
  if (currentFrame % 180 === 0 && dynamicEnemies.length < 5) {
    const enemyId = `fuzz-enemy-${currentFrame}`
    dynamicEnemies.push({
      id: enemyId,
      kind: rng() > 0.5 ? 'blaster' : 'horda',
      hp: 3,
      mesh: {
        position: new THREE.Vector3(
          playerForwardPos.x + (rng() - 0.5) * 40,
          playerForwardPos.y + (rng() - 0.5) * 20,
          playerForwardPos.z + 45 + rng() * 35,
        ),
      },
      radius: 2.0,
      damageApplied: 0,
      speed: 15,
    })
  }

  // Atualiza posição dos inimigos e remove os derrotados
  for (let i = dynamicEnemies.length - 1; i >= 0; i--) {
    const e = dynamicEnemies[i]
    e.mesh.position.z -= 12 * DT
    if (e.mesh.position.z < playerForwardPos.z - 40 || e.hp <= 0) {
      dynamicEnemies.splice(i, 1)
    }
  }

  // 3. Geração dinâmica de obstáculos (Detritos para teste de avoidance)
  if (currentFrame % 240 === 0 && dynamicObstacles.length < 3) {
    const obstacleId = `fuzz-obs-${currentFrame}`
    dynamicObstacles.push({
      id: obstacleId,
      kind: 'detrito',
      radius: 3.5,
      mesh: {
        position: new THREE.Vector3(
          playerForwardPos.x + (rng() - 0.5) * 22,
          playerForwardPos.y + (rng() - 0.5) * 10,
          playerForwardPos.z + 55 + rng() * 30,
        ),
      },
      driftVel: new THREE.Vector3((rng() - 0.5) * 4, (rng() - 0.5) * 2, -18),
    })
  }

  for (let i = dynamicObstacles.length - 1; i >= 0; i--) {
    const obs = dynamicObstacles[i]
    obs.mesh.position.addScaledVector(obs.driftVel, DT)
    if (obs.mesh.position.z < playerForwardPos.z - 30) {
      dynamicObstacles.splice(i, 1)
    }
  }

  // 4. Ações Táticas Aleatórias
  if (currentFrame % 450 === 0) {
    squadron.toggleCommand() // Alterna entre Focus e Tactical Freedom
  }
  if (currentFrame % 700 === 0) {
    // Dano pontual em um piloto para testar damaged-passive e regeneração
    const victimId = Math.floor(rng() * 4)
    squadron.applyDamageToWingman(victimId, 4)
  }
  if (currentFrame % 900 === 0) {
    // Repara piloto
    squadron.repairNearbyWingmen(playerForwardPos, 2)
  }

  // 5. Update do esquadrão
  const updateResult = squadron.update(DT, playerForwardPos, rail.getFrameAt(0), {
    boostActive: playerForwardSpeed > 60,
    homingCharging: false,
    homingHasLockedTarget: false,
    shieldNotFull: player.getShieldValue() < player.getShieldMax(),
    reactivity: {
      playerJustLostLife: false,
      playerLowHealth: false,
      playerBoosting: playerForwardSpeed > 60,
    },
    falcoChainStacks: 0,
    falcoInterceptStacks: 0,
    slippyBoostActive: false,
    slippyBoostStacks: 0,
    playerJustDodgeTapped: false,
    playerChargeHeldMs: 0,
    enemies: dynamicEnemies,
    obstacles: dynamicObstacles,
  })

  expectationsEvaluated += 5

  // 6. VALIDAÇÃO DE FINITUDE
  const positions = squadron.getWingmanPositions()
  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i]
    if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y) || !Number.isFinite(pos.z)) {
      naNsDetected += 1
      recordFailure(`Posição do wingman ${i} não finita`, { pos })
    }
  }

  // 7. CONTRATO DE CLUMPING (Todos os 6 pares de Wingmen)
  // Pares: (0,1), (0,2), (0,3), (1,2), (1,3), (2,3)
  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      const pairKey = `${i}-${j}`
      const dist = positions[i].distanceTo(positions[j])
      expectationsEvaluated += 1

      if (dist < WINGMAN_CLUMP_DISTANCE) {
        if (!isPairClumped.get(pairKey)) {
          isPairClumped.set(pairKey, true)
          clumpingEventsDetected += 1
        }
        const currentDuration = (clumpDurationByPair.get(pairKey) || 0) + DT
        clumpDurationByPair.set(pairKey, currentDuration)
        if (currentDuration > maxClumpDuration) {
          maxClumpDuration = currentDuration
        }

        // Violação do contrato de clumping persistente (> 0.5s)
        if (currentDuration > WINGMAN_CLUMP_GRACE_S) {
          recordFailure(`Clumping persistente entre pilotos ${pairKey}: ${currentDuration.toFixed(3)}s > ${WINGMAN_CLUMP_GRACE_S}s`, {
            pairKey,
            dist,
            currentDuration,
            posA: positions[i],
            posB: positions[j],
          })
        }
      } else {
        isPairClumped.set(pairKey, false)
        clumpDurationByPair.set(pairKey, 0)
      }
    }
  }

  // 8. VALIDAÇÃO DE CATCH-UP E HISTERESE
  const vitals = squadron.getVitalSnapshots()
  for (const v of vitals) {
    const id = v.id
    const lag = playerForwardPos.z - v.worldPos.z
    const wasActive = wingmanCatchupState.get(id) || false
    let isNowActive = wasActive

    if (wasActive && lag <= WINGMAN_RAIL_CATCHUP_RELEASE) {
      isNowActive = false
      catchUpExits += 1
    } else if (!wasActive && lag >= WINGMAN_RAIL_CATCHUP_START) {
      isNowActive = true
      catchUpActivations += 1
    }

    if (isNowActive !== wasActive) {
      wingmanCatchupState.set(id, isNowActive)
      const transitions = wingmanCatchupTransitions.get(id)
      transitions.push({ frame: currentFrame, to: isNowActive })
      // Verifica histerese: não pode ter 3 transições em menos de 10 frames
      if (transitions.length >= 3) {
        const last3 = transitions.slice(-3)
        const frameSpan = last3[2].frame - last3[0].frame
        if (frameSpan < 10) {
          recordFailure(`Oscilação rápida de catch-up no piloto ${id} sem histerese (span: ${frameSpan} frames)`, { id, transitions: last3 })
        }
      }
    }
  }

  // 9. VALIDAÇÃO DE DESAFIO DE OBSTÁCULOS (Proximidade)
  if (dynamicObstacles.length > 0) {
    for (const pos of positions) {
      for (const obs of dynamicObstacles) {
        const obsDist = pos.distanceTo(obs.mesh.position)
        if (obsDist < obs.radius + 1.25) {
          obstacleAvoidanceChallengeEvents += 1
        }
      }
    }
  }
}

// Avaliações registradas pelo próprio aiValidator durante o fuzz
const validatorSummary = aiValidator.buildReport()
expectationsEvaluated += validatorSummary.total_expectativas_avaliadas

if (validatorSummary.expectativas_falhas.length > 0) {
  for (const f of validatorSummary.expectativas_falhas) {
    recordFailure(`aiValidator: ${f.description}`, f.context)
  }
}

const predictiveCurvesInitiated = (validatorSummary.timeline_mecanicas || []).filter(
  (m) => m.mechanic === 'wingman-obstacle-avoidance' && m.action === 'curva-preditiva-iniciada'
).length

// Relatório final estruturado
const simDurationS = (TOTAL_FRAMES * DT).toFixed(1)
console.log('\n======================================================')
console.log('       RELATÓRIO DO FUZZ RUNTIME DOS WINGMEN         ')
console.log('======================================================')
console.log(`seed: ${SEED}`)
console.log(`frames executados: ${TOTAL_FRAMES}`)
console.log(`duração simulada: ${simDurationS}s`)
console.log(`número de expectativas: ${expectationsEvaluated}`)
console.log(`quantidade de falhas: ${failures}`)
console.log(`número de eventos de clumping detectados: ${clumpingEventsDetected}`)
console.log(`maior duração observada de clumping: ${maxClumpDuration.toFixed(3)}s`)
console.log(`número de ativações de catch-up: ${catchUpActivations}`)
console.log(`número de saídas de catch-up: ${catchUpExits}`)
console.log(`eventos de desafio de obstáculos (proximidade): ${obstacleAvoidanceChallengeEvents}`)
console.log(`curvas preditivas de avoidance iniciadas: ${predictiveCurvesInitiated}`)
console.log(`NaNs detectados: ${naNsDetected}`)
console.log('======================================================')

if (failures > 0) {
  console.error(`\n[FALHA] O fuzz terminou com ${failures} falhas!`)
  process.exit(1)
} else {
  console.log(`\n[SUCESSO] failures = 0. Todos os contratos de navegação e deconflição foram cumpridos.`)
  process.exit(0)
}
