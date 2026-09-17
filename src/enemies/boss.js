import * as THREE from 'three'
import { FORWARD_AXIS, randomSpawnAroundArena, HOMING_EXPLOSION_COLOR, ENEMY_ARENA_SPAWN_MAX } from './shared.js'
import { ENEMY_SOUND_CUES, triggerSoundCue } from '../audio-cues.js'

// ============ CHEFE — dodecaedro móvel + laser telegrafado, com 3 FASES por HP ============
// Overhaul (v0.50.0): antes o chefe era igual em 100% e 5% de HP — perseguição linear, rajada
// fixa de 3, laser a cada 6-10s. Agora tem 3 FASES discretas que mudam cor, velocidade,
// densidade de ataque e padrão de tiro, com uma transição cênica entre elas (invulnerável,
// pulso visual, rotação acelerada). A API pública continua IDÊNTICA — enemies/index.js e
// main.js não precisam saber que fases existem.
//
// v0.51.0 — fan do chefe (fases 2-3) reescrito pra usar o 3º parâmetro `extraAngleRad` de
// fireEnemyProjectile (enemies/index.js) em vez de mover o MESH lateralmente antes de cada
// tiro e restaurar no fim. A gambiarra antiga funcionava porque a ordem no loop era
// updateBossMovement → fire block → updateBossLaser, sem nenhuma leitura externa entre os
// passos — no dia em que qualquer coisa lesse `enemy.mesh.position` nesse intervalo (lockon
// do jogador, minimapa, spawn de minion do dourado), o chefe aparecia teleportado. Agora o
// corpo do chefe nunca se mexe e o offset angular viaja como argumento.

export const BOSS_KIND = 'boss'
export const BOSS_COLOR = 0xff1744 // Vermelho escarlate neon vibrante
const BOSS_EMISSIVE = 0x880018
export const BOSS_SCALE = 5.5 // 5 * 1.10 (+10%)
export const BOSS_HIT_RADIUS = 7.7 // 7 * 1.10 (+10%)
export const BOSS_DEATH_DURATION = 0.6

// LASER: mesma dimensão física em todas as fases — o que muda é frequência, tempo de telegraph
// e (só na fase 3) a rajada de 2 disparos.
const LASER_RADIUS = 4.5
const LASER_LENGTH = 45
const LASER_SPEED = 600
const LASER_MAX_RANGE = 240
export const BOSS_LASER_HIT_RADIUS = 5.0
export const BOSS_LASER_COLOR = 0xff2d4d

// ============ FASES ============
// enterAtHpFrac: fração de HP na qual ESTA fase começa (fase 1 = 1.0, sempre começa cheio).
// Thresholds escolhidos assimétricos (0.66 e 0.33 em vez de 0.5/0.5) porque fase 3 é a mais
// curta e intensa. ATENÇÃO ao ajustar: o que importa é o DELTA entre um threshold e o
// seguinte (0.66 → 0.33 = 33% da barra pra fase 2), não o valor absoluto. Subir só o 0.66
// pra 0.7 encurta a fase 1 e alonga a fase 2 (0.7 → 0.33 = 37%); se quiser simetricamente
// mais tempo na fase 2, suba o 0.66 E o 0.33 juntos (ex: 0.7/0.35 mantém a fase 2 com ~35%).
//
// volleyCount/fanEnabled/fanSpreadDeg: fase 1 dispara 3 tiros "retos" (mesma direção, com o
// erro-padrão de 5° que fireEnemyProjectile aplica em cima); fases 2-3 disparam em leque
// controlado (ver fireBossVolley pra como o spread é implementado via extraAngleRad do
// fireEnemyProjectile — NÃO move mais o mesh do chefe).
//
// laserBurstCount/laserBurstDelayS: fase 3 solta o laser em rajada de 2, com 0.4s entre os
// disparos. Só o PRIMEIRO mira a posição travada no telegraph; o segundo mira a posição ATUAL
// do jogador — mais perigoso, obriga a continuar se mexendo.
const BOSS_PHASES = [
  {
    enterAtHpFrac: 1.0,
    chaseSpeed: 14,
    volleyCount: 3,
    fanEnabled: false,
    fanSpreadDeg: 0,
    laserIntervalMin: 6.0,
    laserIntervalMax: 10.0,
    laserTelegraphS: 3.0,
    laserBurstCount: 1,
    laserBurstDelayS: 0,
    color: 0xff2d4d,
    emissive: 0x5c0018,
    emissiveIntensity: 1.0,
    rotationSpeedMult: 1.0,
  },
  {
    enterAtHpFrac: 0.66,
    chaseSpeed: 18,
    volleyCount: 5,
    fanEnabled: true,
    fanSpreadDeg: 40,
    laserIntervalMin: 4.0,
    laserIntervalMax: 6.0,
    laserTelegraphS: 3.0,
    laserBurstCount: 1,
    laserBurstDelayS: 0,
    color: 0xff5c2d,
    emissive: 0x661a00,
    emissiveIntensity: 1.5,
    rotationSpeedMult: 1.4,
  },
  {
    enterAtHpFrac: 0.33,
    chaseSpeed: 22,
    volleyCount: 8,
    fanEnabled: true,
    fanSpreadDeg: 60,
    laserIntervalMin: 3.0,
    laserIntervalMax: 4.5,
    laserTelegraphS: 1.5,
    laserBurstCount: 2,
    laserBurstDelayS: 0.4,
    color: 0xff1010,
    emissive: 0x880000,
    emissiveIntensity: 2.2,
    rotationSpeedMult: 1.8,
  },
]

// Transição entre fases: 1.2s, invulnerável (HP travado no threshold), gira rápido e pulsa
// escala. A leitura é "o chefe está subindo de nível, espere".
const PHASE_TRANSITION_DURATION_S = 1.2
const PHASE_TRANSITION_SPIN_MULT = 4.0
const PHASE_TRANSITION_PULSE_AMPLITUDE = 0.18
const PHASE_TRANSITION_PULSE_RATE = 20 // rad/s

const BOSS_FIRE_INTERVAL_MIN = 800
const BOSS_FIRE_INTERVAL_MAX = 1600

// (FAN_MAX_LATERAL_OFFSET foi removido na v0.51.0 — ver comentário em fireBossVolley.)

export const bossEnemyGeometry = new THREE.DodecahedronGeometry(1, 0)
export const bossEnemyMaterial = new THREE.MeshPhongMaterial({ color: BOSS_COLOR, emissive: BOSS_EMISSIVE, flatShading: true })

// 3 materiais estáticos, um por fase — 1 chefe por vez na tela, então o `mesh.material` do
// boss vivo pode ser trocado sem risco de vazar. disposeBoss() limpa os 3.
const bossPhaseMaterials = BOSS_PHASES.map((phase) => new THREE.MeshPhongMaterial({
  color: phase.color, emissive: phase.emissive, emissiveIntensity: phase.emissiveIntensity, flatShading: true,
}))

// ============ ESCUDO REFLETOR DO CHEFE ============
// pedido do usuário: a cada 7s ergue escudo azul que reflete tiros por 3s; cooldown de 7s só
// recomeça depois dos 3s terminarem.
const BOSS_SHIELD_DURATION_S = 3.0
const BOSS_SHIELD_COOLDOWN_S = 7.0
export const BOSS_SHIELD_COLOR = 0x3ea6ff
const BOSS_SHIELD_EMISSIVE = 0x0055aa

export const bossShieldGeometry = new THREE.SphereGeometry(1.35, 18, 14)
export const bossShieldMaterial = new THREE.MeshPhongMaterial({
  color: BOSS_SHIELD_COLOR,
  emissive: BOSS_SHIELD_EMISSIVE,
  emissiveIntensity: 0.9,
  transparent: true,
  opacity: 0.45,
  depthWrite: false,
  side: THREE.DoubleSide,
  blending: THREE.AdditiveBlending,
})

function randomLaserInterval(phaseCfg) {
  return phaseCfg.laserIntervalMin + Math.random() * (phaseCfg.laserIntervalMax - phaseCfg.laserIntervalMin)
}

export function spawnBossEnemy(scene, rail, id, hp) {
  const position = randomSpawnAroundArena(rail, ENEMY_ARENA_SPAWN_MAX * 0.6, ENEMY_ARENA_SPAWN_MAX)
  const mesh = new THREE.Mesh(bossEnemyGeometry, bossPhaseMaterials[0])
  mesh.position.copy(position)
  mesh.scale.setScalar(BOSS_SCALE)

  const shieldMesh = new THREE.Mesh(bossShieldGeometry, bossShieldMaterial)
  shieldMesh.visible = false
  mesh.add(shieldMesh)

  scene.add(mesh)
  triggerSoundCue(ENEMY_SOUND_CUES.boss_entrance, { worldPos: position, hp })
  return {
    id, mesh, kind: BOSS_KIND, dying: false, deathT: 0, hp, maxHp: hp, fireTimer: 1,
    laserCooldown: randomLaserInterval(BOSS_PHASES[0]),
    laserTelegraphTimer: 0,
    laserTargetPos: null,
    shieldMesh,
    isShieldActive: false,
    shieldTimer: 0,
    shieldCooldown: BOSS_SHIELD_COOLDOWN_S,
    shieldActivationFxPending: false,
    // ============ estado de fase ============
    phase: 0,                        // 0-indexed; 0 = fase 1
    phaseConfig: BOSS_PHASES[0],
    transitioning: false,
    transitionTimer: 0,
    transitionFloorHp: 0,
    // fx pendente de transição — setado em updateBossMovement, consumido em updateBossLaser
    // (que tem acesso a `effects`) no mesmo frame
    phaseTransitionFxPending: false,
    // burst de laser (só fase 3 usa)
    laserBurstRemaining: 0,
    laserBurstTimer: 0,
    // relógio próprio do pulse visual — dessincroniza (raro) múltiplos bosses
    rotationClock: Math.random() * 10,
  }
}

// ============ MOVIMENTO + TRANSIÇÃO DE FASE ============
// Chamado a cada frame por enemies/index.js. Além do chase, é AQUI que a transição de fase é
// detectada: o HP pode ter cruzado o threshold em resolveProjectileHit, que roda ANTES no
// frame (dentro de combat/projectiles.js). Então o boss "reage" no frame seguinte.
//
// Invulnerabilidade durante a transição: HP é TRAVADO no threshold — o jogador continua
// podendo atirar, mas o HP nunca cai abaixo do piso. Depois da transição, segue normal a
// partir do piso.
//
// Movimento: durante a transição, o boss PARA (nem chase). É a leitura de "está carregando".
export function updateBossMovement(enemy, dt, playerPosition) {
  enemy.rotationClock += dt

  // ============ TRANSIÇÃO DE FASE EM ANDAMENTO ============
  if (enemy.transitioning) {
    // trava o HP no piso (não deixa morrer no meio da transição, nem descer mais)
    enemy.hp = Math.max(enemy.hp, enemy.transitionFloorHp)
    enemy.transitionTimer -= dt
    // pulso visual + rotação acelerada
    const pulseT = 0.5 + 0.5 * Math.sin(enemy.rotationClock * PHASE_TRANSITION_PULSE_RATE)
    enemy.mesh.scale.setScalar(BOSS_SCALE * (1 + pulseT * PHASE_TRANSITION_PULSE_AMPLITUDE))
    enemy.mesh.rotateX(dt * 0.6 * PHASE_TRANSITION_SPIN_MULT)
    enemy.mesh.rotateY(dt * 0.9 * PHASE_TRANSITION_SPIN_MULT)
    if (enemy.transitionTimer <= 0) {
      enemy.transitioning = false
      enemy.mesh.scale.setScalar(BOSS_SCALE)
    }
    return
  }

  // ============ DETECÇÃO DE NOVA TRANSIÇÃO ============
  // Só considera a PRÓXIMA fase (não pula de 1 pra 3 mesmo se HP cruzar os dois thresholds no
  // mesmo frame). Após a transição, o HP fica exatamente no threshold — evita re-disparo.
  if (enemy.phase < BOSS_PHASES.length - 1) {
    const nextPhase = BOSS_PHASES[enemy.phase + 1]
    const hpFrac = enemy.hp / enemy.maxHp
    if (hpFrac <= nextPhase.enterAtHpFrac) {
      enemy.phase += 1
      enemy.phaseConfig = nextPhase
      enemy.transitioning = true
      enemy.transitionTimer = PHASE_TRANSITION_DURATION_S
      enemy.transitionFloorHp = enemy.maxHp * nextPhase.enterAtHpFrac
      // trava o HP já no frame da detecção
      enemy.hp = Math.max(enemy.hp, enemy.transitionFloorHp)
      // troca material — efeito visual principal da transição (a cor muda)
      enemy.mesh.material = bossPhaseMaterials[enemy.phase]
      // rearma cooldowns pra não herdar cadência da fase anterior
      enemy.laserCooldown = randomLaserInterval(nextPhase)
      enemy.laserTelegraphTimer = 0
      enemy.laserTargetPos = null
      enemy.laserBurstRemaining = 0
      enemy.laserBurstTimer = 0
      // fx (shockwave/explosion) vai ser disparado por updateBossLaser no mesmo frame — este
      // movimento roda primeiro, e o flag é consumido depois
      enemy.phaseTransitionFxPending = true
      return
    }
  }

  // ============ MOVIMENTO NORMAL DA FASE ============
  const toPlayer = playerPosition.clone().sub(enemy.mesh.position)
  if (toPlayer.lengthSq() > 1e-4) {
    toPlayer.normalize()
    enemy.mesh.position.addScaledVector(toPlayer, enemy.phaseConfig.chaseSpeed * dt)
    enemy.mesh.lookAt(playerPosition)
  }
  const rotMult = enemy.phaseConfig.rotationSpeedMult
  enemy.mesh.rotateX(dt * 0.6 * rotMult)
  enemy.mesh.rotateY(dt * 0.9 * rotMult)

  // pulse suave de escala em fases 2+ — reforça visualmente "está mais agressivo"
  if (enemy.phase >= 1) {
    const pulseAmp = enemy.phase === 1 ? 0.03 : 0.06
    enemy.mesh.scale.setScalar(BOSS_SCALE * (1 + Math.sin(enemy.rotationClock * 5) * pulseAmp))
  }

  // ============ ESCUDO REFLETOR AZUL (3s ativo, 7s cooldown após desativar) ============
  if (enemy.isShieldActive) {
    enemy.shieldTimer -= dt
    enemy.shieldMesh.visible = true
    enemy.shieldMesh.rotation.y += dt * 1.5
    enemy.shieldMesh.rotation.z += dt * 0.8
    const sPulse = 1 + Math.sin(enemy.rotationClock * 8) * 0.05
    enemy.shieldMesh.scale.setScalar(sPulse)
    if (enemy.shieldTimer <= 0) {
      enemy.isShieldActive = false
      enemy.shieldMesh.visible = false
      enemy.shieldCooldown = BOSS_SHIELD_COOLDOWN_S
    }
  } else {
    enemy.shieldMesh.visible = false
    if (!enemy.dying && !enemy.transitioning) {
      enemy.shieldCooldown -= dt
      if (enemy.shieldCooldown <= 0) {
        enemy.isShieldActive = true
        enemy.shieldTimer = BOSS_SHIELD_DURATION_S
        enemy.shieldMesh.visible = true
        enemy.shieldActivationFxPending = true
      }
    }
  }
}

// ============ VOLUME DE TIRO ============
// Assinatura mantida (enemy, playerPosition, ctx). O comportamento muda por fase:
//   fase 1: N tiros "retos" — mesma direção-base, cada um com o erro-padrão de 5° do
//           fireEnemyProjectile.
//   fase 2-3: N tiros em leque. O offset angular de cada tiro vai como 3º argumento de
//             `fireEnemyProjectile` (o `extraAngleRad` que gira a direção base em torno do
//             eixo vertical do mundo). O CORPO DO CHEFE NÃO SE MOVE — a posição do mesh lida
//             por lockon/minimapa/spawn de minions no mesmo tick continua correta.
export function fireBossVolley(enemy, playerPosition, ctx) {
  const cfg = enemy.phaseConfig
  const count = cfg.volleyCount
  triggerSoundCue(ENEMY_SOUND_CUES.boss_volley, { worldPos: enemy.mesh.position, count, phase: enemy.phase + 1 })
  if (!cfg.fanEnabled || count <= 1) {
    for (let i = 0; i < count; i += 1) ctx.fireEnemyProjectile(enemy, playerPosition)
    return
  }
  const halfSpreadRad = THREE.MathUtils.degToRad(cfg.fanSpreadDeg) / 2
  for (let i = 0; i < count; i += 1) {
    const t = count > 1 ? i / (count - 1) : 0.5
    const angleRad = -halfSpreadRad + t * halfSpreadRad * 2
    ctx.fireEnemyProjectile(enemy, playerPosition, angleRad)
  }
}

export function randomBossFireInterval() {
  return (BOSS_FIRE_INTERVAL_MIN + Math.random() * (BOSS_FIRE_INTERVAL_MAX - BOSS_FIRE_INTERVAL_MIN)) / 1000
}

function fireBossLaser(scene, ctx, enemy, targetPos) {
  const startPos = enemy.mesh.position.clone()
  const direction = targetPos.clone().sub(startPos).normalize()

  const group = new THREE.Group()
  const outerGeo = new THREE.CylinderGeometry(LASER_RADIUS * 1.5, LASER_RADIUS * 1.5, LASER_LENGTH, 8)
  outerGeo.rotateX(Math.PI / 2)
  const outerMat = new THREE.MeshBasicMaterial({
    color: enemy.phaseConfig.color, transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  })
  const outerMesh = new THREE.Mesh(outerGeo, outerMat)

  const innerGeo = new THREE.CylinderGeometry(LASER_RADIUS * 0.6, LASER_RADIUS * 0.6, LASER_LENGTH * 1.05, 8)
  innerGeo.rotateX(Math.PI / 2)
  const innerMat = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  })
  const innerMesh = new THREE.Mesh(innerGeo, innerMat)

  group.add(outerMesh, innerMesh)
  group.position.copy(startPos)
  group.quaternion.setFromUnitVectors(FORWARD_AXIS, direction)
  scene.add(group)

  triggerSoundCue(ENEMY_SOUND_CUES.boss_laser_fire, { worldPos: startPos, targetPos })

  ctx.pushLaser({
    mesh: group,
    outerMat,
    innerMat,
    velocity: direction.multiplyScalar(LASER_SPEED),
    traveled: 0,
    maxRange: LASER_MAX_RANGE,
    hitRadius: BOSS_LASER_HIT_RADIUS,
    shieldDamage: 1,
  })
}

// ============ LASER (telegrafado) ============
// Assinatura mantida. Além do fluxo normal (cooldown → telegraph → disparo), agora trata:
//   - burst: fase 3 dispara 2 lasers em sequência (0.4s), o segundo mira a posição ATUAL do
//            jogador (não a travada no telegraph).
//   - fx de transição de fase: como essa função recebe `effects` e roda uma vez por frame
//            pro chefe, é aqui que o shockwave/explosion da transição é disparado (o flag
//            `phaseTransitionFxPending` é setado em updateBossMovement no mesmo frame).
export function updateBossLaser(scene, enemy, dt, playerPosition, effects, ctx) {
  const cfg = enemy.phaseConfig

  // ============ FX DE TRANSIÇÃO DE FASE (pendente) ============
  if (enemy.phaseTransitionFxPending) {
    enemy.phaseTransitionFxPending = false
    triggerSoundCue(ENEMY_SOUND_CUES.boss_phase_transition, { worldPos: enemy.mesh.position, newPhase: enemy.phase + 1 })
    if (effects) {
      effects.shockwave(enemy.mesh.position.clone(), cfg.color, 2.2)
      effects.explosion(enemy.mesh.position.clone(), cfg.color, 3.0, { rings: true, isBoss: true })
    }
  }

  // ============ FX DE ATIVAÇÃO DO ESCUDO REFLETOR ============
  if (enemy.shieldActivationFxPending) {
    enemy.shieldActivationFxPending = false
    triggerSoundCue(ENEMY_SOUND_CUES.boss_shield_activate, { worldPos: enemy.mesh.position })
    if (effects) {
      effects.shockwave(enemy.mesh.position.clone(), BOSS_SHIELD_COLOR, 1.6)
      effects.bloomSprite(enemy.mesh.position.clone(), BOSS_SHIELD_COLOR, 1.8)
    }
  }

  // ============ BURST EM ANDAMENTO ============
  if (enemy.laserBurstRemaining > 0) {
    enemy.laserBurstTimer -= dt
    if (enemy.laserBurstTimer <= 0) {
      fireBossLaser(scene, ctx, enemy, playerPosition.clone()) // mira na posição ATUAL
      enemy.laserBurstRemaining -= 1
      if (enemy.laserBurstRemaining > 0) {
        enemy.laserBurstTimer = cfg.laserBurstDelayS
      } else {
        enemy.laserTargetPos = null
        enemy.laserCooldown = randomLaserInterval(cfg)
      }
    }
    return
  }

  // ============ TELEGRAPH EM ANDAMENTO ============
  if (enemy.laserTelegraphTimer > 0) {
    // continua "mirando" a posição atual do jogador durante o telegraph inteiro
    enemy.laserTargetPos = playerPosition.clone()
    enemy.laserTelegraphTimer -= dt
    if (enemy.laserTelegraphTimer <= 0) {
      if (enemy.laserTargetPos) {
        fireBossLaser(scene, ctx, enemy, enemy.laserTargetPos.clone())
        // se a fase tem burst, arma os disparos extras
        if (cfg.laserBurstCount > 1) {
          enemy.laserBurstRemaining = cfg.laserBurstCount - 1
          enemy.laserBurstTimer = cfg.laserBurstDelayS
        } else {
          enemy.laserTargetPos = null
          enemy.laserCooldown = randomLaserInterval(cfg)
        }
      }
    }
  } else {
    // ============ COOLDOWN ============
    enemy.laserCooldown -= dt
    if (enemy.laserCooldown <= 0) {
      enemy.laserTargetPos = playerPosition.clone()
      enemy.laserTelegraphTimer = cfg.laserTelegraphS
      triggerSoundCue(ENEMY_SOUND_CUES.boss_laser_charge, { worldPos: enemy.mesh.position, phase: enemy.phase + 1 })
      if (effects) effects.chargeCircle(() => enemy.laserTargetPos, cfg.laserTelegraphS, cfg.color)
    }
  }
}

// explosão de kill do chefe — mantida idêntica à entrega anterior.
export function explodeBoss(effects, position, isHoming = false) {
  const pos = position.clone()
  triggerSoundCue(ENEMY_SOUND_CUES.boss_death_sequence, { worldPos: pos })
  const mainColor = isHoming ? HOMING_EXPLOSION_COLOR : BOSS_COLOR
  effects.explosion(pos, mainColor, 5.0, { rings: true, isBoss: true })
  effects.shockwave(pos, BOSS_COLOR, 1.6)
  setTimeout(() => effects.explosion(pos, 0xffaa33, 3.2, { rings: true, isBoss: true }), 110)
  setTimeout(() => effects.explosion(pos, mainColor, 3.8, { rings: true, isBoss: true }), 240)
}

export function disposeBoss() {
  bossEnemyGeometry.dispose()
  bossEnemyMaterial.dispose()
  for (const m of bossPhaseMaterials) m.dispose()
  bossShieldGeometry.dispose()
  bossShieldMaterial.dispose()
}
