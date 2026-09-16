import * as THREE from 'three'
import { FORWARD_AXIS, distanceToSegment, randomSpawnAroundArena, HOMING_EXPLOSION_COLOR } from './shared.js'

// ============ ESPECIAL DOURADO + mini-naves + laser ============
// Array próprio (`goldenTargets`) e resolução de hit à parte de `enemies` — já era assim no
// enemies.js monolítico (o dourado só existe durante a fase 'goldenArena'), então este módulo
// vira uma instância própria (factory) em vez de funções soltas como os outros arquivos de
// classe, que compartilham os arrays do orquestrador.
export const GOLDEN_KIND = 'golden'
export const GOLDEN_COLOR = 0xfff2a0
const GOLDEN_EMISSIVE = 0xffb300
export const GOLDEN_HIT_RADIUS = 2.2
const GOLDEN_DEATH_DURATION = 0.25
const GOLDEN_PULSE_SPEED = 4
const GOLDEN_PULSE_AMOUNT = 0.18
const GOLDEN_HP = 40
const GOLDEN_CHASE_SPEED = 10
// pedido do usuário: "se teleportar pelo mapa 1 vez a cada 10 segundos quando for atingido por
// disparos" — cooldown próprio, reiniciado a cada teleporte de verdade (não a cada hit)
const GOLDEN_TELEPORT_COOLDOWN_S = 10
// pedido do usuário: "trate o inimigo dourado como um boss, de +20 de vida a ele, faça com que ele desvie mais do jogador"
const GOLDEN_DASH_TRIGGER_DIST = 46
const GOLDEN_DASH_COOLDOWN_S = 1.6
const GOLDEN_DASH_DURATION_S = 0.38
const GOLDEN_DASH_SPEED = 72
const GOLDEN_FIRE_INTERVAL_MIN = 1100
const GOLDEN_FIRE_INTERVAL_MAX = 2200
// solta mini-naves amarelas com IA de perseguição curva e mergulho
const MINION_INTERVAL_MIN = 2.2
const MINION_INTERVAL_MAX = 3.2
const MINION_SPEED = 18
const MINION_HIT_RADIUS = 1.0
const MINION_MAX_RANGE = 150
const MINION_COLOR = 0xffe066

// ============ LASER GRANDE DO DOURADO ============
// mesmo padrão do laser do chefe (mostra círculos crescendo durante o telegraph, dispara um
// cone-laser gigante na direção travada). Era o único tipo de ataque que faltava no dourado —
// antes ele só tinha projétil comum + mini-nave.
// Valores ligeiramente menores que os do chefe, porque o dourado é menor (hit radius 2.2 vs 7).
// pedido do usuário: "é pra serem LASERS, [feixes] IMENSOS e rápidos o bastante pro jogador só
// conseguir desviar na hora certa" — velocidade multiplicada ~7x (cruza o alcance máximo em
// ~0.4s em vez de ~2.9s, virou de fato "raio rápido" e não "torpedo lento") + raio/comprimento
// maiores.
const GOLDEN_LASER_INTERVAL_MIN = 8.0
const GOLDEN_LASER_INTERVAL_MAX = 12.0
const GOLDEN_LASER_TELEGRAPH_S = 2.5
const GOLDEN_LASER_RADIUS = 3.2
const GOLDEN_LASER_LENGTH = 36
const GOLDEN_LASER_SPEED = 500
const GOLDEN_LASER_HIT_RADIUS = 4.0
const GOLDEN_LASER_MAX_RANGE = 200

export const goldenGeometry = new THREE.TorusKnotGeometry(1.1, 0.4, 80, 12)
export const goldenMaterial = new THREE.MeshPhongMaterial({
  color: GOLDEN_COLOR, emissive: GOLDEN_EMISSIVE, emissiveIntensity: 0.9, flatShading: true,
})
const minionGeometry = new THREE.ConeGeometry(0.28, 1.0, 3)
minionGeometry.rotateX(Math.PI / 2)
const minionMaterial = new THREE.MeshPhongMaterial({ color: MINION_COLOR, emissive: 0x996600, emissiveIntensity: 0.8, flatShading: true })

function randomGoldenFireInterval() {
  return (GOLDEN_FIRE_INTERVAL_MIN + Math.random() * (GOLDEN_FIRE_INTERVAL_MAX - GOLDEN_FIRE_INTERVAL_MIN)) / 1000
}

export function createGoldenSystem(scene, rail, effects, nextId) {
  const goldenTargets = []
  let elapsed = 0

  function removeGoldenTarget(g) {
    g.dying = true
    scene.remove(g.mesh)
    goldenTargets.splice(goldenTargets.indexOf(g), 1)
  }

  function spawnMinion(originPos, playerPosition, pushProjectile) {
    const mesh = new THREE.Mesh(minionGeometry, minionMaterial)
    mesh.position.copy(originPos)
    const dir = playerPosition.clone().sub(originPos).normalize()
    mesh.quaternion.setFromUnitVectors(FORWARD_AXIS, dir)
    scene.add(mesh)
    pushProjectile({
      mesh, velocity: dir.clone().multiplyScalar(MINION_SPEED), traveled: 0,
      homing: true, maxRange: MINION_MAX_RANGE, hitRadius: MINION_HIT_RADIUS,
    })
  }

  // laser grande — mesmo formato do chefe (cone longo, additive blending, same quaternion
  // technique). Empurra pro array compartilhado de lasers inimigos via ctx.pushLaser.
  function fireGoldenLaser(g, targetPos, ctx) {
    const startPos = g.mesh.position.clone()
    const direction = targetPos.clone().sub(startPos).normalize()

    const geo = new THREE.ConeGeometry(GOLDEN_LASER_RADIUS, GOLDEN_LASER_LENGTH, 8)
    geo.rotateX(Math.PI / 2)
    const mat = new THREE.MeshBasicMaterial({
      color: GOLDEN_COLOR, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.copy(startPos)
    mesh.quaternion.setFromUnitVectors(FORWARD_AXIS, direction)
    scene.add(mesh)
    ctx.pushLaser({
      mesh, geo, mat,
      velocity: direction.multiplyScalar(GOLDEN_LASER_SPEED), traveled: 0,
      maxRange: GOLDEN_LASER_MAX_RANGE, hitRadius: GOLDEN_LASER_HIT_RADIUS,
      shieldDamage: 1,
    })
  }

  return {
    spawn(opts = {}) {
      const { distanceMin = 40, distanceMax = 90 } = opts
      const frame = rail.getFrameAt(0)
      const azimuth = Math.random() * Math.PI * 2
      const elevation = (Math.random() * 2 - 1) * THREE.MathUtils.degToRad(50)
      const distance = distanceMin + Math.random() * (distanceMax - distanceMin)
      const offset = new THREE.Vector3(
        Math.sin(azimuth) * Math.cos(elevation),
        Math.sin(elevation),
        Math.cos(azimuth) * Math.cos(elevation),
      ).multiplyScalar(distance)

      const mesh = new THREE.Mesh(goldenGeometry, goldenMaterial)
      mesh.position.copy(frame.position.clone().add(offset))
      scene.add(mesh)
      goldenTargets.push({
        id: nextId(), mesh, dying: false, deathT: 0,
        kind: GOLDEN_KIND,
        radius: GOLDEN_HIT_RADIUS,
        hp: GOLDEN_HP, maxHp: GOLDEN_HP, fireTimer: randomGoldenFireInterval(),
        minionTimer: MINION_INTERVAL_MIN + Math.random() * (MINION_INTERVAL_MAX - MINION_INTERVAL_MIN),
        laserCooldown: GOLDEN_LASER_INTERVAL_MIN + Math.random() * (GOLDEN_LASER_INTERVAL_MAX - GOLDEN_LASER_INTERVAL_MIN),
        laserTelegraphTimer: 0,
        laserTargetPos: null,
        distanceMin, distanceMax, teleportCooldownTimer: 0,
        dashCooldownTimer: 0,
        dashTimer: 0,
        dashDir: new THREE.Vector3(),
        ramHitActive: false,
        bodyHitActive: false,
      })
    },

    // ctx = { fireEnemyProjectile, pushProjectile, pushLaser }
    update(dt, playerPosition, ctx, ramDamage = 0) {
      elapsed += dt
      const pulse = 1 + Math.sin(elapsed * GOLDEN_PULSE_SPEED) * GOLDEN_PULSE_AMOUNT
      let ramGoldenDefeated = false
      let ramGoldenWorldPos = null
      let bossCollisionWorldPos = null
      let goldenHits = 0
      for (const g of [...goldenTargets]) {
        if (g.dying) {
          g.deathT += dt / GOLDEN_DEATH_DURATION
          g.mesh.scale.setScalar(Math.max(0, pulse * (1 - g.deathT)))
          if (g.deathT >= 1) removeGoldenTarget(g)
          continue
        }

        // Colisão com o Boss Dourado (aríete com dano E choque de fuselagem com knockback/tumble)
        const ramRadius = GOLDEN_HIT_RADIUS + 5.0
        const bodyRadius = GOLDEN_HIT_RADIUS + 2.5
        const inRamRange = ramDamage > 0 && playerPosition && playerPosition.distanceTo(g.mesh.position) <= ramRadius
        const inBodyRange = playerPosition && playerPosition.distanceTo(g.mesh.position) <= bodyRadius

        if (inRamRange || inBodyRange) {
          if (!g.ramHitActive && !g.bodyHitActive) {
            g.ramHitActive = inRamRange
            g.bodyHitActive = inBodyRange
            bossCollisionWorldPos = g.mesh.position.clone()

            if (inRamRange) {
              g.hp -= ramDamage
              if (effects) effects.flashMesh(g.mesh)
              if (g.hp <= 0) {
                g.dying = true
                g.deathT = 0
                ramGoldenDefeated = true
                ramGoldenWorldPos = g.mesh.position.clone()
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

        // Dash lateral evasivo: quando o jogador se aproxima ou foca nele
        if (g.dashTimer > 0) {
          g.dashTimer -= dt
          g.mesh.position.addScaledVector(g.dashDir, GOLDEN_DASH_SPEED * dt)
          g.mesh.rotation.z += dt * 12
        } else {
          if (distToPlayer <= GOLDEN_DASH_TRIGGER_DIST && g.dashCooldownTimer <= 0 && distToPlayer > 1e-4) {
            g.dashCooldownTimer = GOLDEN_DASH_COOLDOWN_S
            g.dashTimer = GOLDEN_DASH_DURATION_S
            const dirNorm = toPlayer.clone().normalize()
            const up = new THREE.Vector3(0, 1, 0)
            let lateral = new THREE.Vector3().crossVectors(dirNorm, up).normalize()
            if (lateral.lengthSq() < 0.01) lateral.set(1, 0, 0)
            if (Math.random() < 0.5) lateral.negate()
            g.dashDir.copy(lateral)
            if (effects) {
              if (effects.goldenDashVFX) {
                effects.goldenDashVFX(g.mesh.position, g.dashDir)
              } else {
                effects.shockwave(g.mesh.position, GOLDEN_COLOR, 0.7)
              }
            }
          } else if (distToPlayer > 1e-4) {
            // Perseguição com manobras evasivas em ziguezague/weaving
            const dirNorm = toPlayer.clone().normalize()
            const up = new THREE.Vector3(0, 1, 0)
            let lateral = new THREE.Vector3().crossVectors(dirNorm, up).normalize()
            const weave = Math.sin(elapsed * 3.2) * 12
            g.mesh.position.addScaledVector(dirNorm, GOLDEN_CHASE_SPEED * dt)
            g.mesh.position.addScaledVector(lateral, weave * dt)
          }
        }

        if (g.fireTimer > 0.3 && g.fireTimer - dt <= 0.3 && effects) effects.telegraph(g.mesh.position, GOLDEN_COLOR)
        g.fireTimer -= dt
        if (g.fireTimer <= 0) {
          ctx.fireEnemyProjectile({ mesh: g.mesh }, playerPosition)
          g.fireTimer = randomGoldenFireInterval()
        }

        g.minionTimer -= dt
        if (g.minionTimer <= 0) {
          spawnMinion(g.mesh.position, playerPosition, ctx.pushProjectile)
          g.minionTimer = MINION_INTERVAL_MIN + Math.random() * (MINION_INTERVAL_MAX - MINION_INTERVAL_MIN)
        }

        // laser grande — mesmo fluxo do chefe: cooldown corre, dispara telegraph com a posição
        // travada do jogador, espera o telegraph terminar, atira um laser na direção travada.
        if (g.laserTelegraphTimer > 0) {
          // pedido do usuário: o alvo continua "mirando" a posição ATUAL do jogador durante todo
          // o telegraph, não trava só no instante em que começou — senão dava pra sair de cima
          // a qualquer momento nos 2.5s e nunca precisar de fato desviar na hora do disparo.
          g.laserTargetPos = playerPosition.clone()
          g.laserTelegraphTimer -= dt
          if (g.laserTelegraphTimer <= 0) {
            if (g.laserTargetPos) fireGoldenLaser(g, g.laserTargetPos, ctx)
            g.laserTargetPos = null
            g.laserCooldown = GOLDEN_LASER_INTERVAL_MIN + Math.random() * (GOLDEN_LASER_INTERVAL_MAX - GOLDEN_LASER_INTERVAL_MIN)
          }
        } else {
          g.laserCooldown -= dt
          if (g.laserCooldown <= 0) {
            g.laserTargetPos = playerPosition.clone()
            g.laserTelegraphTimer = GOLDEN_LASER_TELEGRAPH_S
            if (effects) effects.chargeCircle(() => g.laserTargetPos, GOLDEN_LASER_TELEGRAPH_S, GOLDEN_COLOR)
          }
        }
      }
      return { ramGoldenDefeated, ramGoldenWorldPos, bossCollisionWorldPos, goldenHits }
    },

    resolveHit(prevPos, currPos, damage, isHoming, hitBuffer, effects) {
      const goldenHit = goldenTargets.find((g) => !g.dying && distanceToSegment(g.mesh.position, prevPos, currPos) <= GOLDEN_HIT_RADIUS + hitBuffer)
      if (!goldenHit) return null
      goldenHit.hp -= damage
      // o dourado nunca piscava (combat.js exclui kind:'golden' do hitsLog de propósito) — como
      // aqui já tem a referência do mesh, dispara o flash direto
      if (effects) effects.flashMesh(goldenHit.mesh)
      if (isHoming && effects) effects.explosion(goldenHit.mesh.position, HOMING_EXPLOSION_COLOR, 0.5)
      const killed = goldenHit.hp <= 0
      if (killed) {
        goldenHit.dying = true
        goldenHit.deathT = 0
        const killColor = isHoming ? HOMING_EXPLOSION_COLOR : GOLDEN_COLOR
        if (effects) {
          effects.explosion(goldenHit.mesh.position, killColor, 2.8, { rings: true })
          effects.shockwave(goldenHit.mesh.position, GOLDEN_COLOR, 1.1)
        }
      } else {
        // Dash evasivo reativo a tiros recebidos
        if (goldenHit.dashCooldownTimer <= 0.6) {
          goldenHit.dashCooldownTimer = GOLDEN_DASH_COOLDOWN_S
          goldenHit.dashTimer = GOLDEN_DASH_DURATION_S
          const lateral = new THREE.Vector3(Math.random() < 0.5 ? -1 : 1, (Math.random() - 0.5) * 0.4, 0).normalize()
          goldenHit.dashDir.copy(lateral)
          if (effects) effects.shockwave(goldenHit.mesh.position, GOLDEN_COLOR, 0.6)
        }
        if (goldenHit.teleportCooldownTimer <= 0) {
          // pedido do usuário: teleporta 1x a cada 10s quando atingido — reaproveita o mesmo
          // espalhamento em torno do centro da arena usado pelo spawn do chefe
          const oldPos = goldenHit.mesh.position.clone()
          const newPos = randomSpawnAroundArena(rail, goldenHit.distanceMin, goldenHit.distanceMax)
          goldenHit.mesh.position.copy(newPos)
          goldenHit.teleportCooldownTimer = GOLDEN_TELEPORT_COOLDOWN_S
          if (effects) {
            effects.shockwave(oldPos, GOLDEN_COLOR, 1.2)
            effects.explosion(oldPos, GOLDEN_COLOR, 1.0, { rings: true })
            effects.shockwave(newPos, GOLDEN_COLOR, 1.2)
            effects.explosion(newPos, GOLDEN_COLOR, 1.0, { rings: true })
          }
        }
      }
      return {
        kind: GOLDEN_KIND, killed, worldPos: goldenHit.mesh.position.clone(), meshRef: goldenHit.mesh,
        enemyKillPoints: 0, timeReductionMs: null, bossDefeated: false, goldenSpecialHit: killed,
      }
    },

    getAlive: () => goldenTargets.filter((g) => !g.dying),

    getMinimapBlips: () => goldenTargets.filter((g) => !g.dying).map((g) => ({ type: 'golden', worldPos: g.mesh.position })),
    getHitboxTargets: () => goldenTargets.filter((g) => !g.dying).map((g) => ({ worldPos: g.mesh.position, radius: GOLDEN_HIT_RADIUS })),
    getSnapshots: () => goldenTargets.filter((g) => !g.dying).map((g) => ({ id: g.id, worldPos: g.mesh.position.clone(), hp: g.hp, maxHp: g.maxHp })),

    clear() {
      for (const g of [...goldenTargets]) removeGoldenTarget(g)
    },

    dispose() {
      for (const g of [...goldenTargets]) removeGoldenTarget(g)
      goldenGeometry.dispose()
      goldenMaterial.dispose()
      minionGeometry.dispose()
      minionMaterial.dispose()
    },
  }
}
