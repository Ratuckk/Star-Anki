import * as THREE from 'three'
import { FORWARD_AXIS, distanceToSegment, randomSpawnAroundArena, HOMING_EXPLOSION_COLOR, POWER_LEVEL_HIGH_IMPACT } from './shared.js'
import { ENEMY_SOUND_CUES, triggerSoundCue } from '../audio-cues.js'
import {
  createGoldenSquadron,
  GOLDEN_FIGHTER_KIND,
  GOLDEN_FIGHTER_HIT_RADIUS,
  GOLDEN_FIGHTER_RAM_RADIUS,
  SQUADRON_ORDER,
  fighterGeometry,
  fighterMaterial,
} from './golden-squadron.js'

// ============ ESPECIAL DOURADO: COMANDANTE + ESQUADRÃO DE CAÇAS (v0.99.36) ============
// Dourado = Comandante agressivo de um esquadrão de caças persistentes e destrutíveis.
// Preserva o moveset essencial (chase, weaving, dash, teleporte reativo, volley, laser grande,
// cataclysm death flow) e implementa posicionamento com faixa de combate útil e orquestração de esquadrão.

export const GOLDEN_KIND = 'golden'
export const GOLDEN_COLOR = 0xffea00 // Ouro neon vibrante
const GOLDEN_EMISSIVE = 0xffaa00
export const GOLDEN_HIT_RADIUS = 2.42 // 2.2 * 1.10 (+10%)
const GOLDEN_DEATH_DURATION = 0.25
const GOLDEN_PULSE_SPEED = 4
const GOLDEN_PULSE_AMOUNT = 0.18
const GOLDEN_HP = 70 // Base de vida
const GOLDEN_HP_PER_LEVEL = 15
const GOLDEN_LEVEL_COOLDOWN_SHRINK_PER_LEVEL = 0.05
const GOLDEN_LEVEL_COOLDOWN_SHRINK_CAP = 0.5

function goldenCooldownShrinkFor(level) {
  const steps = Math.max(0, (level || 1) - 1)
  return 1 - Math.min(GOLDEN_LEVEL_COOLDOWN_SHRINK_CAP, steps * GOLDEN_LEVEL_COOLDOWN_SHRINK_PER_LEVEL)
}

// Faixa útil de combate centralizada (v0.99.36)
export const GOLDEN_COMBAT_FAR_DIST = 75   // Acima de 75u: aproximação acelerada
export const GOLDEN_COMBAT_IDEAL_MIN = 32  // 32u a 70u: pressão tática e weaving sem aproximação direta
export const GOLDEN_COMBAT_IDEAL_MAX = 70
export const GOLDEN_COMBAT_CLOSE_DIST = 28 // Abaixo de 28u: dash de reposicionamento e quebra de mira

const GOLDEN_CHASE_SPEED = 10.0
const GOLDEN_CHASE_FAR_SPEED = 16.0
const GOLDEN_TELEPORT_COOLDOWN_S = 10.0
const GOLDEN_DASH_TRIGGER_DIST = 46.0
const GOLDEN_DASH_COOLDOWN_S = 1.6
const GOLDEN_DASH_DURATION_S = 0.38
const GOLDEN_DASH_SPEED = 72.0
const GOLDEN_FIRE_INTERVAL_MIN = 1100
const GOLDEN_FIRE_INTERVAL_MAX = 2200

// ============ LASER GRANDE DO DOURADO ============
const GOLDEN_LASER_INTERVAL_MIN = 8.0
const GOLDEN_LASER_INTERVAL_MAX = 12.0
const GOLDEN_LASER_TELEGRAPH_S = 2.5
const GOLDEN_LASER_RADIUS = 3.2
const GOLDEN_LASER_LENGTH = 36
const GOLDEN_LASER_SPEED = 500
const GOLDEN_LASER_HIT_RADIUS = 4.0
const GOLDEN_LASER_MAX_RANGE = 200

export const goldenGeometry = new THREE.TorusKnotGeometry(1.21, 0.44, 80, 12)
export const goldenMaterial = new THREE.MeshPhongMaterial({
  color: GOLDEN_COLOR,
  emissive: GOLDEN_EMISSIVE,
  emissiveIntensity: 1.0,
  flatShading: true,
})

const goldenLaserGeometry = new THREE.ConeGeometry(GOLDEN_LASER_RADIUS, GOLDEN_LASER_LENGTH, 8)
goldenLaserGeometry.rotateX(Math.PI / 2)
const goldenLaserMaterial = new THREE.MeshBasicMaterial({
  color: GOLDEN_COLOR, transparent: true, opacity: 0.95,
  blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
})

export function createGoldenSystem(scene, rail, effects, nextId, opts = {}) {
  const rng = (opts && typeof opts.rng === 'function') ? opts.rng : Math.random
  const goldenTargets = []
  let elapsed = 0
  let currentIsDenseFog = false
  let goldenDefeatedPending = false
  let goldenDefeatedWorldPos = null
  let currentLevel = 1

  function randomGoldenFireInterval() {
    return (GOLDEN_FIRE_INTERVAL_MIN + rng() * (GOLDEN_FIRE_INTERVAL_MAX - GOLDEN_FIRE_INTERVAL_MIN)) / 1000
  }

  // Instância modular do Esquadrão com injeção de RNG
  const squadron = createGoldenSquadron(scene, effects, nextId, currentLevel, { rng })

  function removeGoldenTarget(g) {
    g.dying = true
    scene.remove(g.mesh)
    const idx = goldenTargets.indexOf(g)
    if (idx !== -1) goldenTargets.splice(idx, 1)
  }

  // Laser grande do Dourado
  function fireGoldenLaser(g, targetPos, ctx) {
    const startPos = g.mesh.position.clone()
    const direction = targetPos.clone().sub(startPos).normalize()

    const mesh = new THREE.Mesh(goldenLaserGeometry, goldenLaserMaterial)
    mesh.position.copy(startPos)
    mesh.quaternion.setFromUnitVectors(FORWARD_AXIS, direction)
    scene.add(mesh)
    triggerSoundCue(ENEMY_SOUND_CUES.golden_laser_fire, { worldPos: startPos, targetPos })
    ctx.pushLaser({
      mesh,
      velocity: direction.multiplyScalar(GOLDEN_LASER_SPEED), traveled: 0,
      maxRange: GOLDEN_LASER_MAX_RANGE, hitRadius: GOLDEN_LASER_HIT_RADIUS,
      shieldDamage: 1,
      powerLevel: POWER_LEVEL_HIGH_IMPACT,
    })
  }

  return {
    spawn(spawnOpts = {}) {
      const { distanceMin = 48, distanceMax = 108, level = 1 } = spawnOpts
      currentLevel = level
      squadron.setLevel(level)
      const shrink = goldenCooldownShrinkFor(level)
      const dashCooldownS = GOLDEN_DASH_COOLDOWN_S * shrink
      const teleportCooldownS = GOLDEN_TELEPORT_COOLDOWN_S * shrink
      const hp = GOLDEN_HP + Math.max(0, (level || 1) - 1) * GOLDEN_HP_PER_LEVEL
      const frame = rail.getFrameAt(0)
      const azimuth = rng() * Math.PI * 2
      const elevation = (rng() * 2 - 1) * THREE.MathUtils.degToRad(50)
      const distance = distanceMin + rng() * (distanceMax - distanceMin)
      const offset = new THREE.Vector3(
        Math.sin(azimuth) * Math.cos(elevation),
        Math.sin(elevation),
        Math.cos(azimuth) * Math.cos(elevation),
      ).multiplyScalar(distance)

      const mesh = new THREE.Mesh(goldenGeometry, goldenMaterial)
      mesh.position.copy(frame.position.clone().add(offset))
      scene.add(mesh)
      triggerSoundCue(ENEMY_SOUND_CUES.golden_entrance, { worldPos: mesh.position })

      const commander = {
        id: nextId(), mesh, dying: false, deathT: 0,
        kind: GOLDEN_KIND,
        radius: GOLDEN_HIT_RADIUS,
        hp, maxHp: hp, fireTimer: randomGoldenFireInterval(),
        laserCooldown: GOLDEN_LASER_INTERVAL_MIN + rng() * (GOLDEN_LASER_INTERVAL_MAX - GOLDEN_LASER_INTERVAL_MIN),
        laserTelegraphTimer: 0,
        laserTargetPos: null,
        dashCooldownS, teleportCooldownS,
        distanceMin, distanceMax, teleportCooldownTimer: 0,
        dashCooldownTimer: 0,
        dashTimer: 0,
        dashDir: new THREE.Vector3(),
        ramHitActive: false,
        bodyHitActive: false,
      }
      goldenTargets.push(commander)

      // Inicializa esquadrão subordinado na formação inicial ao redor do Comandante
      squadron.initSquadron(mesh.position, frame.forward)
    },

    update(dt, playerPosition, ctx, ramDamage = 0, updateOpts = {}) {
      elapsed += dt
      currentIsDenseFog = !!updateOpts.isDenseFog
      const pulse = 1 + Math.sin(elapsed * GOLDEN_PULSE_SPEED) * GOLDEN_PULSE_AMOUNT
      let ramGoldenDefeated = false
      let ramGoldenWorldPos = null
      let bossCollisionWorldPos = null
      let goldenHits = 0
      const ramFeedback = []
      const shipPoints = (updateOpts && updateOpts.shipHitboxPoints) || (playerPosition ? [{ worldPos: playerPosition, radius: 0.5 }] : [])

      for (const g of [...goldenTargets]) {
        if (g.dying) {
          g.deathT += dt / GOLDEN_DEATH_DURATION
          g.mesh.scale.setScalar(Math.max(0, pulse * (1 - g.deathT)))
          squadron.onCommanderDying()
          if (g.deathT >= 1) removeGoldenTarget(g)
          continue
        }

        // Colisão com o Boss Dourado (TorusKnotGeometry)
        const ramRadius = 3.0
        const bodyRadius = 1.6
        const inRamRange = ramDamage > 0 && shipPoints.some((pt) => pt.worldPos.distanceTo(g.mesh.position) <= ramRadius + pt.radius)
        const inBodyRange = shipPoints.some((pt) => pt.worldPos.distanceTo(g.mesh.position) <= bodyRadius + pt.radius)

        if (inRamRange || inBodyRange) {
          if (!g.ramHitActive && !g.bodyHitActive) {
            g.ramHitActive = inRamRange
            g.bodyHitActive = inBodyRange
            bossCollisionWorldPos = g.mesh.position.clone()

            if (inRamRange) {
              g.hp -= ramDamage
              ramFeedback.push({ worldPos: g.mesh.position.clone(), meshRef: g.mesh, damage: ramDamage, killed: g.hp <= 0 })
              if (effects) effects.flashMesh(g.mesh)
              if (g.hp <= 0) {
                g.dying = true
                g.deathT = 0
                goldenDefeatedPending = true
                goldenDefeatedWorldPos = g.mesh.position.clone()
                ramGoldenDefeated = true
                ramGoldenWorldPos = g.mesh.position.clone()
                squadron.onCommanderDying()
                if (effects) {
                  effects.explosion(g.mesh.position, GOLDEN_COLOR, 2.8, { rings: true })
                  effects.shockwave(g.mesh.position, GOLDEN_COLOR, 1.1)
                }
              }
            } else if (inBodyRange) {
              goldenHits += 1
            }
          }
          continue
        }
        g.ramHitActive = false
        g.bodyHitActive = false

        g.mesh.scale.setScalar(pulse)
        g.mesh.rotation.y += dt * 0.8
        g.mesh.rotation.x += dt * 0.4
        g.teleportCooldownTimer = Math.max(0, g.teleportCooldownTimer - dt)
        g.dashCooldownTimer = Math.max(0, g.dashCooldownTimer - dt)

        if (!playerPosition) continue
        const toPlayer = playerPosition.clone().sub(g.mesh.position)
        const distToPlayer = toPlayer.length()

        // ============ MOVIMENTAÇÃO POR FAIXA ÚTIL DE COMBATE ============
        if (g.dashTimer > 0) {
          g.dashTimer -= dt
          g.mesh.position.addScaledVector(g.dashDir, GOLDEN_DASH_SPEED * dt)
          g.mesh.rotation.z += dt * 12
        } else if (distToPlayer > 1e-4) {
          const dirNorm = toPlayer.clone().normalize()
          const up = new THREE.Vector3(0, 1, 0)
          let lateral = new THREE.Vector3().crossVectors(dirNorm, up).normalize()
          if (lateral.lengthSq() < 0.01) lateral.set(1, 0, 0)

          if (distToPlayer < GOLDEN_COMBAT_CLOSE_DIST) {
            // Zona 5: Muito perto (< 28u) -> Dash tático para quebrar mira e reposicionar
            if (g.dashCooldownTimer <= 0) {
              g.dashCooldownTimer = g.dashCooldownS
              g.dashTimer = GOLDEN_DASH_DURATION_S
              if (rng() < 0.5) lateral.negate()
              g.dashDir.copy(lateral)
              if (effects) {
                if (effects.goldenDashVFX) {
                  effects.goldenDashVFX(g.mesh.position, g.dashDir)
                } else {
                  effects.shockwave(g.mesh.position, GOLDEN_COLOR, 0.7)
                }
              }
            } else {
              // Dash em recarga: recuo tático imediato
              g.mesh.position.addScaledVector(dirNorm, -12.0 * dt)
              const weave = Math.sin(elapsed * 3.8) * 12.0
              g.mesh.position.addScaledVector(lateral, weave * dt)
            }
          } else if (distToPlayer < GOLDEN_COMBAT_IDEAL_MIN) {
            // Zona 4: Transição baixa (28u - 32u) -> Afastamento suave para preservar a faixa ideal
            const t = (GOLDEN_COMBAT_IDEAL_MIN - distToPlayer) / (GOLDEN_COMBAT_IDEAL_MIN - GOLDEN_COMBAT_CLOSE_DIST)
            const radialSpeed = -8.0 * t
            const weave = Math.sin(elapsed * 3.5) * 14.0
            g.mesh.position.addScaledVector(dirNorm, radialSpeed * dt)
            g.mesh.position.addScaledVector(lateral, weave * dt)
          } else if (distToPlayer <= GOLDEN_COMBAT_IDEAL_MAX) {
            // Zona 3: Faixa ideal (32u - 70u) -> Standoff tático!
            // Sem avanço direto pro jogador; mantém faixa com lateralidade/weaving e suave centralização
            const radialSpeed = (distToPlayer - 51.0) * 0.25
            const weave = Math.sin(elapsed * 3.2) * 12.0
            g.mesh.position.addScaledVector(dirNorm, radialSpeed * dt)
            g.mesh.position.addScaledVector(lateral, weave * dt)
          } else if (distToPlayer <= GOLDEN_COMBAT_FAR_DIST) {
            // Zona 2: Transição alta (70u - 75u) -> Desaceleração suave entrando na faixa
            const t = (distToPlayer - GOLDEN_COMBAT_IDEAL_MAX) / (GOLDEN_COMBAT_FAR_DIST - GOLDEN_COMBAT_IDEAL_MAX)
            const radialSpeed = GOLDEN_CHASE_FAR_SPEED * t
            const weave = Math.sin(elapsed * 2.8) * 10.0
            g.mesh.position.addScaledVector(dirNorm, radialSpeed * dt)
            g.mesh.position.addScaledVector(lateral, weave * dt)
          } else {
            // Zona 1: Muito longe (> 75u) -> Interceptação acelerada
            const weave = Math.sin(elapsed * 2.5) * 8.0
            g.mesh.position.addScaledVector(dirNorm, GOLDEN_CHASE_FAR_SPEED * dt)
            g.mesh.position.addScaledVector(lateral, weave * dt)
          }
        }

        // ============ DISPARO CONVENCIONAL ============
        // Só dispara se não estiver ocupado com laser ou fogo coordenado
        const currentSquadOrder = squadron.getCurrentOrder()
        const isCoordinatedFire = currentSquadOrder === SQUADRON_ORDER.COORDINATED_FIRE
        const isLaserActive = g.laserTelegraphTimer > 0

        if (!isCoordinatedFire && !isLaserActive) {
          if (g.fireTimer > 0.3 && g.fireTimer - dt <= 0.3 && effects) effects.telegraph(g.mesh.position, GOLDEN_COLOR)
          g.fireTimer -= dt
          if (g.fireTimer <= 0) {
            triggerSoundCue(ENEMY_SOUND_CUES.golden_straight_volley, { worldPos: g.mesh.position })
            ctx.fireEnemyProjectile({ mesh: g.mesh, projectileOpts: { powerLevel: POWER_LEVEL_HIGH_IMPACT } }, playerPosition)
            g.fireTimer = randomGoldenFireInterval()
          }
        }

        // ============ LASER GRANDE COM CERCO DE ESQUADRÃO ============
        if (g.laserTelegraphTimer > 0) {
          if (!g.laserTargetPos) g.laserTargetPos = new THREE.Vector3()
          g.laserTargetPos.copy(playerPosition)
          g.laserTelegraphTimer -= dt
          if (g.laserTelegraphTimer <= 0) {
            if (g.laserTargetPos) fireGoldenLaser(g, g.laserTargetPos, ctx)
            g.laserTargetPos = null
            g.laserCooldown = GOLDEN_LASER_INTERVAL_MIN + rng() * (GOLDEN_LASER_INTERVAL_MAX - GOLDEN_LASER_INTERVAL_MIN)
          }
        } else {
          g.laserCooldown -= dt
          if (g.laserCooldown <= 0) {
            // Política A: laser aguarda janela segura sem ordem ofensiva ativa
            if (squadron.getCurrentOrder() === SQUADRON_ORDER.NONE) {
              g.laserTargetPos = playerPosition.clone()
              g.laserTelegraphTimer = GOLDEN_LASER_TELEGRAPH_S
              // Convoca os caças para o Cerco do Laser nos flancos
              squadron.coordinateLaserFlank(g.mesh.position, playerPosition, GOLDEN_LASER_TELEGRAPH_S)
              if (effects) effects.chargeCircle(() => g.laserTargetPos, GOLDEN_LASER_TELEGRAPH_S, GOLDEN_COLOR)
              triggerSoundCue(ENEMY_SOUND_CUES.golden_laser_charge, { worldPos: g.mesh.position, targetPos: g.laserTargetPos })
            } else {
              // Mantém o laser pronto aguardando a ordem ativa terminar sem corromper estados
              g.laserCooldown = 0
            }
          }
        }

        // Atualização autoritativa do Esquadrão
        squadron.update(dt, g, playerPosition, ctx, updateOpts)
      }

      // Colisão de Ram com caças subordinados via método autoritativo do esquadrão
      let squadronRamKills = 0
      let squadronRamKillPoints = 0
      if (ramDamage > 0) {
        const squadRam = squadron.applyRamDamage(shipPoints, ramDamage)
        squadronRamKills = squadRam.ramKills
        squadronRamKillPoints = squadRam.ramKillPoints
        ramFeedback.push(...squadRam.ramFeedback)
      }

      return {
        ramGoldenDefeated,
        ramGoldenWorldPos,
        bossCollisionWorldPos,
        goldenHits,
        ramFeedback,
        ramKills: squadronRamKills,
        ramKillPoints: squadronRamKillPoints,
      }
    },

    resolveHit(prevPos, currPos, damage, isHoming, hitBuffer, fx) {
      // 1. Checa caças subordinados primeiro
      const fighterHit = squadron.resolveHit(prevPos, currPos, damage, isHoming, hitBuffer, fx)
      if (fighterHit) return fighterHit

      // 2. Checa o Comandante
      const goldenHit = goldenTargets.find((g) => !g.dying && distanceToSegment(g.mesh.position, prevPos, currPos) <= GOLDEN_HIT_RADIUS + hitBuffer)
      if (!goldenHit) return null

      goldenHit.hp -= damage
      if (fx) fx.flashMesh(goldenHit.mesh)
      if (isHoming && fx) fx.explosion(goldenHit.mesh.position, HOMING_EXPLOSION_COLOR, 0.5)
      const killed = goldenHit.hp <= 0
      if (killed) {
        goldenHit.dying = true
        goldenHit.deathT = 0
        goldenDefeatedPending = true
        goldenDefeatedWorldPos = goldenHit.mesh.position.clone()
        squadron.onCommanderDying()
        triggerSoundCue(ENEMY_SOUND_CUES.golden_cataclysm_death, { worldPos: goldenHit.mesh.position })
        const killColor = isHoming ? HOMING_EXPLOSION_COLOR : GOLDEN_COLOR
        if (fx) {
          fx.explosion(goldenHit.mesh.position, killColor, 2.8, { rings: true })
          fx.shockwave(goldenHit.mesh.position, GOLDEN_COLOR, 1.1)
        }
      } else {
        // Dash evasivo reativo a tiros recebidos
        if (goldenHit.dashCooldownTimer <= 0.6) {
          goldenHit.dashCooldownTimer = goldenHit.dashCooldownS
          goldenHit.dashTimer = GOLDEN_DASH_DURATION_S
          const lateral = new THREE.Vector3(rng() < 0.5 ? -1 : 1, (rng() - 0.5) * 0.4, 0).normalize()
          goldenHit.dashDir.copy(lateral)
          if (fx) fx.shockwave(goldenHit.mesh.position, GOLDEN_COLOR, 0.6)
        }

        // Teleporte reativo: desorganiza o esquadrão sem teleportar as mini-naves
        if (goldenHit.teleportCooldownTimer <= 0) {
          const oldPos = goldenHit.mesh.position.clone()
          const newPos = randomSpawnAroundArena(rail, goldenHit.distanceMin, goldenHit.distanceMax)
          goldenHit.mesh.position.copy(newPos)
          goldenHit.teleportCooldownTimer = goldenHit.teleportCooldownS

          // Notifica esquadrão: caças permanecem fisicamente e entram em DISORGANIZED
          squadron.onCommanderTeleported(oldPos, newPos)

          triggerSoundCue(ENEMY_SOUND_CUES.golden_teleport, { oldPos, newPos })
          if (fx && currentIsDenseFog) {
            if (fx.bloomSprite) fx.bloomSprite(newPos, GOLDEN_COLOR, 0.8)
          } else if (fx) {
            fx.shockwave(oldPos, GOLDEN_COLOR, 1.2)
            fx.explosion(oldPos, GOLDEN_COLOR, 1.0, { rings: true })
            fx.shockwave(newPos, GOLDEN_COLOR, 1.2)
            fx.explosion(newPos, GOLDEN_COLOR, 1.0, { rings: true })
          }
        }
      }
      return {
        kind: GOLDEN_KIND, killed, worldPos: goldenHit.mesh.position.clone(), meshRef: goldenHit.mesh,
        enemyKillPoints: 0, timeReductionMs: null, bossDefeated: false, goldenSpecialHit: killed,
      }
    },

    resolvePiercingHit(prevPos, currPos, damage, piercedTargets, hitBuffer = 0, meta = {}) {
      const buffer = typeof hitBuffer === 'number'
        ? hitBuffer
        : (Number.isFinite(hitBuffer?.hitBuffer) ? hitBuffer.hitBuffer : (Number.isFinite(hitBuffer?.projectileRadius) ? hitBuffer.projectileRadius : 0))
      const bossHpRatio = Number.isFinite(meta?.bossHpRatio)
        ? meta.bossHpRatio
        : (Number.isFinite(hitBuffer?.bossHpRatio) ? hitBuffer.bossHpRatio : 0)

      const hits = []

      // 1. Caças subordinados são perfurados pelo Swirl (stopProjectile: false)
      hits.push(...squadron.resolvePiercingHit(prevPos, currPos, damage, piercedTargets, buffer))

      // 2. O Comandante Dourado para o Swirl (stopProjectile: true)
      for (const goldenHit of goldenTargets) {
        if (goldenHit.dying) continue
        if (piercedTargets.has(goldenHit.id)) continue
        if (distanceToSegment(goldenHit.mesh.position, prevPos, currPos) > GOLDEN_HIT_RADIUS + buffer) continue
        piercedTargets.add(goldenHit.id)

        const bonusDamage = bossHpRatio > 0 ? Math.ceil((goldenHit.maxHp || 0) * bossHpRatio) : 0
        const totalDamage = damage + bonusDamage
        goldenHit.hp -= totalDamage
        if (effects) effects.flashMesh(goldenHit.mesh)
        const killed = goldenHit.hp <= 0
        if (killed) {
          goldenHit.dying = true
          goldenHit.deathT = 0
          goldenDefeatedPending = true
          goldenDefeatedWorldPos = goldenHit.mesh.position.clone()
          squadron.onCommanderDying()
          triggerSoundCue(ENEMY_SOUND_CUES.golden_cataclysm_death, { worldPos: goldenHit.mesh.position })
          if (effects) {
            effects.explosion(goldenHit.mesh.position, GOLDEN_COLOR, 2.8, { rings: true })
            effects.shockwave(goldenHit.mesh.position, GOLDEN_COLOR, 1.1)
          }
        } else if (goldenHit.dashCooldownTimer <= 0.6) {
          goldenHit.dashCooldownTimer = goldenHit.dashCooldownS
          goldenHit.dashTimer = GOLDEN_DASH_DURATION_S
          const lateral = new THREE.Vector3(rng() < 0.5 ? -1 : 1, (rng() - 0.5) * 0.4, 0).normalize()
          goldenHit.dashDir.copy(lateral)
          if (effects) effects.shockwave(goldenHit.mesh.position, GOLDEN_COLOR, 0.6)
        }

        hits.push({
          kind: GOLDEN_KIND, killed, worldPos: goldenHit.mesh.position.clone(), meshRef: goldenHit.mesh,
          damage: totalDamage,
          enemyKillPoints: 0, timeReductionMs: null, bossDefeated: false, goldenSpecialHit: killed,
          stopProjectile: true,
        })
        break
      }
      return hits
    },

    getAlive: () => goldenTargets.filter((g) => !g.dying),
    getSquadronAlive: () => squadron.getAlive(),
    hasAlive: () => goldenTargets.some((g) => !g.dying),
    isDying: () => goldenTargets.some((g) => g.dying),
    getWorldPos: () => {
      const g = goldenTargets.find((g) => !g.dying) || goldenTargets[0]
      return g?.mesh ? g.mesh.position.clone() : null
    },

    getMinimapBlips: () => [
      ...goldenTargets.filter((g) => !g.dying).map((g) => ({ type: 'golden', worldPos: g.mesh.position })),
      ...squadron.getMinimapBlips(),
    ],
    getHitboxTargets: () => [
      ...goldenTargets.filter((g) => !g.dying).map((g) => ({ worldPos: g.mesh.position, radius: GOLDEN_HIT_RADIUS })),
      ...squadron.getHitboxTargets(),
    ],
    getSnapshots: () => [
      ...goldenTargets.filter((g) => !g.dying).map((g) => ({ id: g.id, worldPos: g.mesh.position.clone(), hp: g.hp, maxHp: g.maxHp })),
      ...squadron.getSnapshots(),
    ],

    getSquadron: () => squadron,

    consumeDefeated() {
      if (!goldenDefeatedPending) return null
      const res = { defeated: true, worldPos: goldenDefeatedWorldPos ? goldenDefeatedWorldPos.clone() : null }
      goldenDefeatedPending = false
      return res
    },

    clear() {
      goldenDefeatedPending = false
      goldenDefeatedWorldPos = null
      squadron.clear()
      for (const g of [...goldenTargets]) removeGoldenTarget(g)
    },

    dispose() {
      goldenDefeatedPending = false
      goldenDefeatedWorldPos = null
      squadron.dispose()
      for (const g of [...goldenTargets]) removeGoldenTarget(g)
      goldenGeometry.dispose()
      goldenMaterial.dispose()
      fighterGeometry.dispose()
      fighterMaterial.dispose()
      goldenLaserGeometry.dispose()
      goldenLaserMaterial.dispose()
    },
  }
}
