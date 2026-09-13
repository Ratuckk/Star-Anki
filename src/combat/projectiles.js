import * as THREE from 'three'

// ============ TIROS DO JOGADOR — normal + carregado (teleguiado) ============
// Extraído de combat.js (v0.38.0, split por sistema). Os dois tipos de tiro ficam JUNTOS aqui de
// propósito (ao contrário de inimigos, que viraram um arquivo por classe) — compartilham o mesmo
// array e o mesmo loop de update/colisão; a diferença entre eles é só um punhado de campos
// (`isHoming`, `homingTarget`, `damage`) dentro de uma função só. Separar por tipo forçaria
// duplicar a resolução de colisão contra inimigo/bônus/orbe nos dois arquivos.

const FORWARD_AXIS = new THREE.Vector3(0, 0, 1)
const WORLD_UP = new THREE.Vector3(0, 1, 0)

const PROJECTILE_SPEED = 60
const PROJECTILE_MAX_RANGE = 260
const PROJECTILE_LATERAL_SPACING = 1.6
const HOMING_PROJECTILE_SPEED = 69 // 46 * 1.5 (pedido: +50% de velocidade)
const HOMING_PROJECTILE_DAMAGE = 3
const HOMING_AFTERIMAGE_INTERVAL = 0.035 // segundos entre cada cópia fantasma do rastro

// tiro normal do jogador: 1 disparo central com 2 de dano (era 2 tiros de 1 dano lado a lado)
const PLAYER_PROJECTILE_DAMAGE = 2
// quão rápido (por segundo) o tiro normal em voo se realinha rumo à direção atual da mira — não
// é homing de verdade (sem alvo travado), só um leve "puxão" pra facilitar acertar
const PLAYER_PROJECTILE_STEER_RATE = 2.2
// cresce visualmente a cada projétil extra ganho por upgrade
const PLAYER_PROJECTILE_GROWTH_PER_EXTRA = 0.15

export const DEFAULT_FIRE_COOLDOWN = 0.2

// v0.29.6: +25% no tiro normal (não no teleguiado) — a colisão é feita contra o SEGMENTO
// percorrido no frame, então "aumentar a hitbox" aqui significa somar essa folga ao raio de
// acerto de cada tipo de alvo, só quando o projétil não é homing.
const PROJECTILE_HIT_BUFFER = 0.3

// mesmo valor de MAX_LOCK_RANGE em lockon.js — distância máxima pra um alvo poder receber
// teleguiado, seja via trava prévia ou via "N mais próximos" de fallback
const MAX_HOMING_RANGE = 90

const projectileGeometry = new THREE.ConeGeometry(0.21, 1.5, 5) // +25% visual (v0.29.6)
projectileGeometry.rotateX(Math.PI / 2)
const projectileMaterial = new THREE.MeshBasicMaterial({ color: 0x3ea6ff })

const homingProjectileGeometry = new THREE.ConeGeometry(0.528, 3.36, 6)
homingProjectileGeometry.rotateX(Math.PI / 2)
const homingProjectileMaterial = new THREE.MeshBasicMaterial({ color: 0x2bff88 })

export function createProjectileSystem(scene, effects, player, enemies, targets, lockon) {
  const projectiles = []
  let cooldown = 0
  // fireCooldownDuration continua LOCAL (não delegado) porque o debug "Tiro infinito" precisa
  // poder zerá-lo por fora do stat real do jogador.
  let fireCooldownDuration = DEFAULT_FIRE_COOLDOWN

  function removeProjectile(p) {
    scene.remove(p.mesh)
    projectiles.splice(projectiles.indexOf(p), 1)
  }

  function fire(origin, direction) {
    const shotDirection = direction.clone()

    const lateralAxis = new THREE.Vector3().crossVectors(shotDirection, WORLD_UP)
    if (lateralAxis.lengthSq() < 1e-4) lateralAxis.set(1, 0, 0)
    lateralAxis.normalize()

    const projectileCount = player.config.projectileCount
    const mid = (projectileCount - 1) / 2
    const visualScale = 1 + (projectileCount - 1) * PLAYER_PROJECTILE_GROWTH_PER_EXTRA
    for (let i = 0; i < projectileCount; i += 1) {
      const lateralOffset = (i - mid) * PROJECTILE_LATERAL_SPACING
      const mesh = new THREE.Mesh(projectileGeometry, projectileMaterial)
      mesh.position.copy(origin).addScaledVector(lateralAxis, lateralOffset)
      mesh.scale.setScalar(visualScale)
      scene.add(mesh)
      projectiles.push({ mesh, velocity: shotDirection.clone().multiplyScalar(PROJECTILE_SPEED), traveled: 0, damage: PLAYER_PROJECTILE_DAMAGE })
    }

    if (effects) effects.muzzleFlash(origin, shotDirection)
  }

  // QoL (v0.29.4): fireSingle carrega PLAYER_PROJECTILE_DAMAGE por padrão — wingman e "giro
  // rebatedor" usam o mesmo projétil visual, mesmo dano do tiro normal por padrão.
  function fireSingle(origin, direction, damage = PLAYER_PROJECTILE_DAMAGE) {
    const mesh = new THREE.Mesh(projectileGeometry, projectileMaterial)
    mesh.position.copy(origin)
    scene.add(mesh)
    projectiles.push({ mesh, velocity: direction.clone().multiplyScalar(PROJECTILE_SPEED), traveled: 0, damage })
  }

  function update(dt, aimDirection) {
    let enemyKills = 0
    let enemyKillPoints = 0
    let bonusKillPoints = 0
    let goldenSpecialHit = false
    let goldenSpecialHitIsHoming = false
    let goldenHitWorldPos = null
    let timeReductionMs = null
    let timeReductionWorldPos = null
    let bossDefeated = false
    let bossDefeatedIsHoming = false
    let bossHitWorldPos = null
    let bossOrbHit = false
    // log de acertos (posição, dano, se matou) — usado pelo main.js pra faíscas, flash no mesh
    // atingido e números de dano flutuantes no HUD
    const hitsLog = []

    for (const projectile of [...projectiles]) {
      // QoL (v0.29.4): checa .dying direto em vez de filtrar getAlive() por projétil por frame
      if (projectile.homingTarget) {
        if (projectile.homingTarget.dying) {
          projectile.homingTarget = null
        } else {
          const desired = projectile.homingTarget.mesh.position.clone().sub(projectile.mesh.position).normalize()
          projectile.velocity.copy(desired.multiplyScalar(HOMING_PROJECTILE_SPEED))
        }
      } else if (aimDirection && !projectile.isHoming) {
        const speed = projectile.velocity.length()
        const currentDir = projectile.velocity.clone().normalize()
        const steerT = Math.min(1, PLAYER_PROJECTILE_STEER_RATE * dt)
        const steeredDir = currentDir.lerp(aimDirection, steerT)
        if (steeredDir.lengthSq() > 1e-6) projectile.velocity.copy(steeredDir.normalize().multiplyScalar(speed))
      }

      const prevPos = projectile.mesh.position.clone()
      const step = projectile.velocity.clone().multiplyScalar(dt)
      projectile.mesh.position.add(step)
      projectile.traveled += step.length()
      if (projectile.velocity.lengthSq() > 1e-6) {
        projectile.mesh.quaternion.setFromUnitVectors(FORWARD_AXIS, projectile.velocity.clone().normalize())
      }

      if (projectile.isHoming && effects) {
        projectile.afterimageTimer -= dt
        if (projectile.afterimageTimer <= 0) {
          projectile.afterimageTimer = HOMING_AFTERIMAGE_INTERVAL
          effects.homingAfterimage(projectile.mesh.position, projectile.mesh.quaternion)
        }
      }

      const hitBuffer = projectile.isHoming ? 0 : PROJECTILE_HIT_BUFFER
      const orbHit = targets.resolveBossOrbHit(prevPos, projectile.mesh.position, hitBuffer)
      if (orbHit) {
        bossOrbHit = true
        removeProjectile(projectile)
        continue
      }

      const hit = enemies.resolveProjectileHit(prevPos, projectile.mesh.position, {
        damage: projectile.damage ?? 1,
        isHoming: !!projectile.isHoming,
        hitBuffer,
      })
      if (hit) {
        removeProjectile(projectile)
        if (hit.kind !== 'golden') {
          hitsLog.push({
            worldPos: hit.worldPos, damage: projectile.damage ?? 1, killed: hit.killed,
            isHoming: !!projectile.isHoming, meshRef: hit.meshRef,
          })
          if (hit.killed) {
            if (hit.bossDefeated) {
              bossDefeated = true
              bossDefeatedIsHoming = !!projectile.isHoming
              bossHitWorldPos = hit.worldPos
            } else {
              enemyKills += 1
            }
          }
        } else if (hit.goldenSpecialHit) {
          goldenSpecialHit = true
          goldenSpecialHitIsHoming = !!projectile.isHoming
          goldenHitWorldPos = hit.worldPos
        }
        if (hit.enemyKillPoints) enemyKillPoints += hit.enemyKillPoints
        if (hit.timeReductionMs != null) { timeReductionMs = hit.timeReductionMs; timeReductionWorldPos = hit.worldPos }
        continue
      }

      const bonusHit = targets.resolveBonusHit(prevPos, projectile.mesh.position, hitBuffer)
      if (bonusHit) {
        bonusKillPoints += bonusHit.points
        removeProjectile(projectile)
        continue
      }

      if (projectile.traveled > PROJECTILE_MAX_RANGE) removeProjectile(projectile)
    }

    return {
      enemyKills, enemyKillPoints, bonusKillPoints,
      goldenSpecialHit, goldenSpecialHitIsHoming, goldenHitWorldPos,
      timeReductionMs, timeReductionWorldPos, bossDefeated, bossDefeatedIsHoming, bossHitWorldPos, bossOrbHit, hitsLog,
    }
  }

  return {
    tryFire(origin, direction) {
      if (cooldown > 0) return null
      cooldown = fireCooldownDuration
      fire(origin, direction)
      return true
    },

    fireSingle,

    // filtro de distância nos dois caminhos (locked e "N mais próximos")
    fireHomingShot(origin, maxTargets) {
      const inRange = (e) => origin.distanceTo(e.mesh.position) <= MAX_HOMING_RANGE
      const locked = lockon.takeLockedTargets(inRange)
      let targetList
      if (locked.length > 0) {
        targetList = locked.slice(0, Math.max(0, maxTargets))
      } else {
        const alive = enemies.getAlive().filter(inRange)
        alive.sort((a, b) => origin.distanceTo(a.mesh.position) - origin.distanceTo(b.mesh.position))
        targetList = alive.slice(0, Math.max(0, maxTargets))
      }
      for (const target of targetList) {
        const direction = target.mesh.position.clone().sub(origin).normalize()
        const mesh = new THREE.Mesh(homingProjectileGeometry, homingProjectileMaterial)
        mesh.position.copy(origin)
        scene.add(mesh)
        projectiles.push({
          mesh, velocity: direction.multiplyScalar(HOMING_PROJECTILE_SPEED), traveled: 0,
          homingTarget: target, damage: HOMING_PROJECTILE_DAMAGE, isHoming: true, afterimageTimer: 0,
        })
      }
      const firstDir = targetList[0] ? targetList[0].mesh.position.clone().sub(origin).normalize() : new THREE.Vector3(0, 0, -1)
      if (effects) {
        effects.muzzleFlash(origin, firstDir)
        effects.smokeRing(origin, firstDir)
      }
      return targetList.length
    },

    // carta utilitária "giro rebatedor": projéteis inimigos dentro do raio, perto do jogador,
    // são destruídos e viram tiros do próprio jogador mirando no inimigo vivo mais próximo.
    deflectNearbyProjectiles(playerPos, radius) {
      const removedPositions = enemies.removeProjectilesNear(playerPos, radius)
      if (removedPositions.length === 0) return 0
      const alive = enemies.getAlive()
      for (const _pos of removedPositions) {
        if (alive.length === 0) continue
        let nearest = alive[0]
        let nearestDist = playerPos.distanceTo(nearest.mesh.position)
        for (const e of alive) {
          const d = playerPos.distanceTo(e.mesh.position)
          if (d < nearestDist) { nearest = e; nearestDist = d }
        }
        fireSingle(playerPos, nearest.mesh.position.clone().sub(playerPos).normalize())
      }
      return removedPositions.length
    },

    tick(dt) { cooldown = Math.max(0, cooldown - dt) },
    update,

    setFireCooldown(seconds) { fireCooldownDuration = seconds },

    clearAll() {
      for (const p of [...projectiles]) removeProjectile(p)
    },

    dispose() {
      for (const p of [...projectiles]) removeProjectile(p)
      projectileGeometry.dispose()
      projectileMaterial.dispose()
      homingProjectileGeometry.dispose()
      homingProjectileMaterial.dispose()
    },
  }
}
