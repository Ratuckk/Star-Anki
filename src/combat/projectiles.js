import * as THREE from 'three'
import { PLAYER_SOUND_CUES, ENEMY_SOUND_CUES, triggerSoundCue } from '../audio-cues.js'

// ============ TIROS DO JOGADOR — normal + carregado (teleguiado) ============
// Extraído de combat.js (v0.38.0, split por sistema). Os dois tipos de tiro ficam JUNTOS aqui de
// propósito (ao contrário de inimigos, que viraram um arquivo por classe) — compartilham o mesmo
// array e o mesmo loop de update/colisão; a diferença entre eles é só um punhado de campos
// (`isHoming`, `homingTarget`, `damage`) dentro de uma função só. Separar por tipo forçaria
// duplicar a resolução de colisão contra inimigo/bônus/orbe nos dois arquivos.

const FORWARD_AXIS = new THREE.Vector3(0, 0, 1)
const WORLD_UP = new THREE.Vector3(0, 1, 0)

const PROJECTILE_SPEED = 360
// pedido do usuário: tiro normal (não-carregado) some sozinho depois de 8s de voo — o teto de
// ALCANCE abaixo sobe junto com PROJECTILE_SPEED (velocidade * 8s + folga) só pra não cortar o
// tiro ANTES do tempo em voo reto; o timer (ver PLAYER_PROJECTILE_LIFETIME) é o que efetivamente
// decide na prática.
const PROJECTILE_MAX_RANGE = 700
const PLAYER_PROJECTILE_LIFETIME = 8
const PROJECTILE_LATERAL_SPACING = 1.6
const HOMING_PROJECTILE_SPEED = 69 // 46 * 1.5 (pedido: +50% de velocidade)
const HOMING_PROJECTILE_DAMAGE = 3 // pedido do usuário: era 3
// pedido do usuário: segurar o tiro carregado até o limite (carga máxima) aumenta o dano de 4
// pra 6 — recompensa esperar o círculo de carga encher de verdade, não só passar do mínimo.
const HOMING_PROJECTILE_DAMAGE_MAX_CHARGE = 6
// pedido do usuário: carga máxima também estoura uma explosão em área no impacto — circular,
// sem direção, além do dano direto no alvo travado.
const MAX_CHARGE_SPLASH_RADIUS = 3
const MAX_CHARGE_SPLASH_DAMAGE = 6
const HOMING_AFTERIMAGE_INTERVAL = 0.035 // segundos entre cada cópia fantasma do rastro

// tiro normal do jogador: 1 disparo central com 2 de dano (era 2 tiros de 1 dano lado a lado)
const PLAYER_PROJECTILE_DAMAGE = 2
// quão rápido (por segundo) o tiro normal em voo se realinha rumo à direção atual da mira — não
// é homing de verdade (sem alvo travado), só um leve "puxão" pra facilitar acertar
const PLAYER_PROJECTILE_STEER_RATE = 2.2
// cresce visualmente a cada projétil extra ganho por upgrade
const PLAYER_PROJECTILE_GROWTH_PER_EXTRA = 0.15

export const DEFAULT_FIRE_COOLDOWN = 0.15

// v0.29.6: +25% no tiro normal (não no teleguiado) — a colisão é feita contra o SEGMENTO
// percorrido no frame, então "aumentar a hitbox" aqui significa somar essa folga ao raio de
// acerto de cada tipo de alvo, só quando o projétil não é homing.
const PROJECTILE_HIT_BUFFER = 0.3

// mesmo valor de MAX_LOCK_RANGE em lockon.js — distância máxima pra um alvo poder receber
// teleguiado, seja via trava prévia ou via "N mais próximos" de fallback
const MAX_HOMING_RANGE = 90

// Overhaul visual do tiro básico (pedido do usuário — "núcleo + halo", reaproveitando a técnica
// outer/inner additive-blending já usada no laser do Chefe/Dourado, ver fireBossLaser em boss.js)
// + tamanho geral +20% ("deixe 20% maior também", pedido explícito). Cada tiro vira um Group com
// 2 camadas (halo translúcido por fora, núcleo quase-branco por dentro) em vez de 1 cone sólido
// — todo código que já tratava a instância como objeto único (`.position`, `.quaternion`,
// `.scale.setScalar()`, `scene.remove()`) continua funcionando sem mudança, Group herda tudo isso
// de Object3D igual Mesh.
const PLAYER_SHOT_SIZE_MULT = 1.2 // "deixe 20% maior"
const PLAYER_SHOT_HALO_RADIUS = 0.21 * PLAYER_SHOT_SIZE_MULT
const PLAYER_SHOT_HALO_LENGTH = 1.5 * PLAYER_SHOT_SIZE_MULT
const PLAYER_SHOT_HALO_COLOR = 0x3ea6ff // cor de identidade original do tiro básico
const PLAYER_SHOT_HALO_OPACITY = 0.45
const PLAYER_SHOT_CORE_RADIUS = PLAYER_SHOT_HALO_RADIUS * 0.5
const PLAYER_SHOT_CORE_LENGTH = PLAYER_SHOT_HALO_LENGTH * 0.85
const PLAYER_SHOT_CORE_COLOR = 0xeaffff // quase-branco — núcleo brilhante
const PLAYER_SHOT_CORE_OPACITY = 0.95

const playerShotHaloGeometry = new THREE.ConeGeometry(PLAYER_SHOT_HALO_RADIUS, PLAYER_SHOT_HALO_LENGTH, 5)
playerShotHaloGeometry.rotateX(Math.PI / 2)
const playerShotHaloMaterial = new THREE.MeshBasicMaterial({
  color: PLAYER_SHOT_HALO_COLOR, transparent: true, opacity: PLAYER_SHOT_HALO_OPACITY,
  blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
})
const playerShotCoreGeometry = new THREE.ConeGeometry(PLAYER_SHOT_CORE_RADIUS, PLAYER_SHOT_CORE_LENGTH, 5)
playerShotCoreGeometry.rotateX(Math.PI / 2)
const playerShotCoreMaterial = new THREE.MeshBasicMaterial({
  color: PLAYER_SHOT_CORE_COLOR, transparent: true, opacity: PLAYER_SHOT_CORE_OPACITY,
  blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
})

function buildPlayerShotMesh() {
  const group = new THREE.Group()
  group.add(new THREE.Mesh(playerShotHaloGeometry, playerShotHaloMaterial))
  group.add(new THREE.Mesh(playerShotCoreGeometry, playerShotCoreMaterial))
  return group
}

const homingProjectileGeometry = new THREE.ConeGeometry(0.528, 3.36, 6)
homingProjectileGeometry.rotateX(Math.PI / 2)
const homingProjectileMaterial = new THREE.MeshBasicMaterial({ color: 0x2bff88 })
// pedido do usuário: tiro de carga MÁXIMA sai azul (mesmo tom do brilho de carga nesse estado,
// ver CHARGE_GLOW_MAX_COLOR em effects.js) — a cor vira o aviso visual de "este tiro causa
// explosão em área" (ver MAX_CHARGE_SPLASH_RADIUS/DAMAGE abaixo). Escala aplicada por instância
// (MAX_CHARGE_VISUAL_SCALE), não na geometria compartilhada.
const homingMaxChargeMaterial = new THREE.MeshBasicMaterial({ color: 0x2b8fff })
const MAX_CHARGE_VISUAL_SCALE = 1.2
// carta "Ricochete": distância do empurrão aplicado ao redirecionar pro próximo alvo — maior
// que qualquer hitRadius do jogo, garante que o próximo frame não recaia no alvo recém-atingido
const RICOCHET_NUDGE_DISTANCE = 3

const FRENZY_OFFSET_L = new THREE.Vector3(-0.8, 0, 0)
const FRENZY_OFFSET_R = new THREE.Vector3(0.8, 0, 0)
const _projOrigin = new THREE.Vector3()
const _projPrevPos = new THREE.Vector3()
const _projStep = new THREE.Vector3()
const _projDeflect = new THREE.Vector3()
const _projToSource = new THREE.Vector3()
const _projDir = new THREE.Vector3()
const _projDesired = new THREE.Vector3()
const _projSteered = new THREE.Vector3()
const _projRingPos = new THREE.Vector3()

export function createProjectileSystem(scene, effects, player, enemies, targets, lockon) {
  const projectiles = []
  let cooldown = 0
  // fireCooldownDuration continua LOCAL (não delegado) porque o debug "Tiro infinito" precisa
  // poder zerá-lo por fora do stat real do jogador.
  let fireCooldownDuration = DEFAULT_FIRE_COOLDOWN

  function removeProjectile(p) {
    if (p.mesh) scene.remove(p.mesh)
    const idx = projectiles.indexOf(p)
    if (idx !== -1) projectiles.splice(idx, 1)
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
      const mesh = buildPlayerShotMesh()
      mesh.position.copy(origin).addScaledVector(lateralAxis, lateralOffset)
      mesh.scale.setScalar(visualScale)
      scene.add(mesh)
      projectiles.push({
        mesh, velocity: shotDirection.clone().multiplyScalar(PROJECTILE_SPEED), traveled: 0,
        damage: PLAYER_PROJECTILE_DAMAGE, life: PLAYER_PROJECTILE_LIFETIME,
      })
    }

    if (effects) effects.muzzleFlash(origin, shotDirection)
  }

  // QoL (v0.29.4): fireSingle carrega PLAYER_PROJECTILE_DAMAGE por padrão — wingman e "giro
  // rebatedor" usam o mesmo projétil visual, mesmo dano do tiro normal por padrão.
  function fireSingle(origin, direction, damage = PLAYER_PROJECTILE_DAMAGE) {
    const mesh = buildPlayerShotMesh()
    mesh.position.copy(origin)
    scene.add(mesh)
    projectiles.push({
      mesh, velocity: direction.clone().multiplyScalar(PROJECTILE_SPEED), traveled: 0,
      damage, life: PLAYER_PROJECTILE_LIFETIME,
    })
  }

  function update(dt, aimDirection, opts = {}) {
    const allowBossOrbHit = opts.allowBossOrbHit !== false
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
    let squadWipe = false
    let squadWipeBonus = 0
    // log de acertos (posição, dano, se matou) — usado pelo main.js pra faíscas, flash no mesh
    // atingido e números de dano flutuantes no HUD
    const hitsLog = []

    const magnetSources = enemies && enemies.getMagnetSources ? enemies.getMagnetSources() : null

    for (let pIdx = projectiles.length - 1; pIdx >= 0; pIdx--) {
      const projectile = projectiles[pIdx]
      // QoL (v0.29.4): checa .dying direto em vez de filtrar getAlive() por projétil por frame
      if (projectile.homingTarget) {
        if (projectile.homingTarget.dying) {
          projectile.homingTarget = null
        } else {
          _projDesired.copy(projectile.homingTarget.mesh.position).sub(projectile.mesh.position).normalize()
          const speed = projectile.isMaxCharge ? HOMING_PROJECTILE_SPEED * 1.25 : HOMING_PROJECTILE_SPEED
          projectile.velocity.copy(_projDesired.multiplyScalar(speed))
        }
      } else if (aimDirection && !projectile.isHoming) {
        const speed = projectile.velocity.length()
        _projDir.copy(projectile.velocity).normalize()
        const steerT = Math.min(1, PLAYER_PROJECTILE_STEER_RATE * dt)
        _projSteered.copy(_projDir).lerp(aimDirection, steerT)
        if (_projSteered.lengthSq() > 1e-6) projectile.velocity.copy(_projSteered.normalize().multiplyScalar(speed))
      }

      // ============================================================
      // >>> BLOCO NOVO — Enxame-Ímã: curva o tiro NORMAL quando passa perto <<<
      // ============================================================
      if (!projectile.isHoming && magnetSources && magnetSources.length > 0) {
        const speed = projectile.velocity.length()
        _projDeflect.set(0, 0, 0)
        for (const source of magnetSources) {
          _projToSource.copy(source.position).sub(projectile.mesh.position)
          const dist = _projToSource.length()
          if (dist > 1e-4 && dist < source.radius) {
            const falloff = 1 - dist / source.radius
            _projDeflect.addScaledVector(_projToSource.multiplyScalar(1 / dist), -source.strength * falloff * dt)
          }
        }
        if (_projDeflect.lengthSq() > 1e-8) {
          projectile.velocity.add(_projDeflect)
          if (projectile.velocity.lengthSq() > 1e-6) projectile.velocity.normalize().multiplyScalar(speed)
          triggerSoundCue(ENEMY_SOUND_CUES.ima_deflect_shot, { worldPos: projectile.mesh.position })
        }
      }
      // ============================================================
      // >>> FIM DO BLOCO NOVO <<<
      // ============================================================

      if (projectile.life != null) {
        projectile.life -= dt
        if (projectile.life <= 0) { removeProjectile(projectile); continue }
      }

      _projPrevPos.copy(projectile.mesh.position)
      _projStep.copy(projectile.velocity).multiplyScalar(dt)
      projectile.mesh.position.add(_projStep)
      projectile.traveled += _projStep.length()
      if (projectile.velocity.lengthSq() > 1e-6) {
        _projDir.copy(projectile.velocity).normalize()
        projectile.mesh.quaternion.setFromUnitVectors(FORWARD_AXIS, _projDir)
      }

      if (projectile.isHoming && effects) {
        projectile.afterimageTimer -= dt
        if (projectile.afterimageTimer <= 0) {
          projectile.afterimageTimer = HOMING_AFTERIMAGE_INTERVAL
          effects.homingAfterimage(projectile.mesh.position, projectile.mesh.quaternion)
        }
        if (projectile.isMaxCharge && effects.machSpeedRing) {
          projectile.machRingTimer = (projectile.machRingTimer ?? 0) - dt
          if (projectile.machRingTimer <= 0) {
            projectile.machRingTimer = 0.08
            _projDir.copy(projectile.velocity).normalize()
            _projRingPos.copy(projectile.mesh.position).addScaledVector(_projDir, 1.2)
            effects.machSpeedRing(_projRingPos, _projDir)
          }
        }
      }

      const hitBuffer = projectile.isHoming ? 0 : PROJECTILE_HIT_BUFFER
      const orbHit = allowBossOrbHit && !bossOrbHit ? targets.resolveBossOrbHit(_projPrevPos, projectile.mesh.position, hitBuffer) : null
      if (orbHit) {
        bossOrbHit = true
        removeProjectile(projectile)
        continue
      }

      const hit = enemies.resolveProjectileHit(_projPrevPos, projectile.mesh.position, {
        damage: projectile.damage ?? 1,
        isHoming: !!projectile.isHoming,
        hitBuffer,
      })
      if (hit) {
        if (hit.squadWipe) {
          squadWipe = true
          squadWipeBonus += (hit.squadWipeBonus || 150)
        }
        if (hit.blocked) { removeProjectile(projectile); continue }
        if (projectile.isHoming) {
          triggerSoundCue(PLAYER_SOUND_CUES.homing_impact, { worldPos: hit.worldPos, isMaxCharge: projectile.isMaxCharge })
        }
        if (projectile.isMaxCharge) {
          triggerSoundCue(PLAYER_SOUND_CUES.max_charge_splash, { worldPos: hit.worldPos, radius: MAX_CHARGE_SPLASH_RADIUS })
          const splash = enemies.applyAreaDamage(hit.worldPos, MAX_CHARGE_SPLASH_RADIUS, MAX_CHARGE_SPLASH_DAMAGE)
          if (effects) {
            if (effects.maxChargeImpact) {
              effects.maxChargeImpact(hit.worldPos, MAX_CHARGE_SPLASH_RADIUS)
            } else {
              effects.explosion(hit.worldPos, 0x3ea6ff, MAX_CHARGE_SPLASH_RADIUS, { rings: true })
            }
          }
          enemyKills += splash.enemyKills
          enemyKillPoints += splash.enemyKillPoints
          hitsLog.push(...splash.hitsLog)
          if (splash.bossDefeated) {
            bossDefeated = true
            bossDefeatedIsHoming = true
            bossHitWorldPos = splash.bossHitWorldPos
          }
        }
        if (hit.kind !== 'golden') {
          hitsLog.push({
            worldPos: hit.worldPos, damage: projectile.damage ?? 1, killed: hit.killed,
            isHoming: !!projectile.isHoming, meshRef: hit.meshRef, points: hit.enemyKillPoints || 0,
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

        // carta "Ricochete": em vez de remover, redireciona pro inimigo vivo mais próximo
        // (excluindo o que acabou de ser atingido) — mesmo projétil, mesmo dano, um pulo a
        // menos no orçamento. Sem alvo por perto ou sem pulo sobrando, remove normalmente.
        let bounced = false
        if (projectile.isHoming && projectile.bouncesLeft > 0) {
          let nextTarget = null
          let nextDist = Infinity
          for (const candidate of enemies.getAlive()) {
            if (candidate.mesh === hit.meshRef) continue
            const d = projectile.mesh.position.distanceTo(candidate.mesh.position)
            if (d < nextDist) { nextDist = d; nextTarget = candidate }
          }
          if (nextTarget) {
            // empurrão pra fora do raio de acerto do alvo que acabou de ser atingido — sem
            // isso, o segmento (prevPos→currPos) do PRÓXIMO frame ainda começa colado nele
            // (é onde o hit resolveu) e `resolveProjectileHit` batia de novo no MESMO alvo
            // repetidas vezes seguidas em vez de viajar até o próximo (medido: 3 hits seguidos
            // no mesmo inimigo, todos na mesma posição exata).
            _projToSource.copy(nextTarget.mesh.position).sub(projectile.mesh.position)
            if (_projToSource.lengthSq() > 1e-6) {
              projectile.mesh.position.addScaledVector(_projToSource.normalize(), RICOCHET_NUDGE_DISTANCE)
            }
            if (effects && effects.ricochetArc) {
              effects.ricochetArc(hit.worldPos, nextTarget.mesh.position)
            }
            projectile.homingTarget = nextTarget
            projectile.bouncesLeft -= 1
            bounced = true
            triggerSoundCue(PLAYER_SOUND_CUES.ricochet, { worldPos: hit.worldPos, bouncesLeft: projectile.bouncesLeft })
          }
        }
        if (!bounced) removeProjectile(projectile)
        continue
      }

      const bonusHit = targets.resolveBonusHit(_projPrevPos, projectile.mesh.position, hitBuffer)
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
      squadWipe, squadWipeBonus,
    }
  }

  return {
    tryFire(origin, direction, opts = {}) {
      if (cooldown > 0) return null
      const isFrenzy = !!opts.isFrenzy
      cooldown = isFrenzy ? fireCooldownDuration * 0.45 : fireCooldownDuration
      fire(origin, direction)
      triggerSoundCue(PLAYER_SOUND_CUES.laser_fire, { isFrenzy, origin })
      if (isFrenzy) {
        _projOrigin.copy(origin).add(FRENZY_OFFSET_L)
        fire(_projOrigin, direction)
        _projOrigin.copy(origin).add(FRENZY_OFFSET_R)
        fire(_projOrigin, direction)
      }
      return true
    },

    fireSingle,

    // filtro de distância nos dois caminhos (locked e "N mais próximos")
    // isMaxCharge: true quando o jogador segurou até a carga máxima (não só passou do mínimo pra
    // poder atirar) — nesse caso cada tiro sai com dano maior (ver HOMING_PROJECTILE_DAMAGE_MAX_CHARGE)
    fireHomingShot(origin, maxTargets, isMaxCharge = false) {
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
      const damage = isMaxCharge ? HOMING_PROJECTILE_DAMAGE_MAX_CHARGE : HOMING_PROJECTILE_DAMAGE
      for (const target of targetList) {
        const direction = target.mesh.position.clone().sub(origin).normalize()
        const mesh = new THREE.Mesh(homingProjectileGeometry, isMaxCharge ? homingMaxChargeMaterial : homingProjectileMaterial)
        mesh.position.copy(origin)
        if (isMaxCharge) mesh.scale.setScalar(MAX_CHARGE_VISUAL_SCALE)
        scene.add(mesh)
        const homingSpeed = isMaxCharge ? HOMING_PROJECTILE_SPEED * 1.25 : HOMING_PROJECTILE_SPEED
        projectiles.push({
          mesh, velocity: direction.multiplyScalar(homingSpeed), traveled: 0,
          homingTarget: target, damage, isHoming: true, afterimageTimer: 0, isMaxCharge,
          bouncesLeft: player.config.ricochetCount ?? 0,
        })
      }
      const firstDir = targetList[0] ? targetList[0].mesh.position.clone().sub(origin).normalize() : new THREE.Vector3(0, 0, -1)
      if (effects) {
        effects.muzzleFlash(origin, firstDir)
        if (isMaxCharge && effects.maxChargeRings) {
          effects.maxChargeRings(origin, firstDir)
        } else {
          effects.smokeRing(origin, firstDir)
        }
      }
      if (targetList.length > 0) {
        triggerSoundCue(PLAYER_SOUND_CUES.homing_fire, { count: targetList.length, isMaxCharge, origin })
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
      playerShotHaloGeometry.dispose()
      playerShotHaloMaterial.dispose()
      playerShotCoreGeometry.dispose()
      playerShotCoreMaterial.dispose()
      homingProjectileGeometry.dispose()
      homingProjectileMaterial.dispose()
      homingMaxChargeMaterial.dispose()
    },
  }
}
