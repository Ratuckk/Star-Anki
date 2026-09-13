import * as THREE from 'three'
import { TIME_REDUCTION_MIN_MS, TIME_REDUCTION_MAX_MS } from '../enemies/index.js'
import { createProjectileSystem, DEFAULT_FIRE_COOLDOWN } from './projectiles.js'
import { createTargetsSystem } from './targets.js'
import { createLockOnSystem } from './lockon.js'

// re-exportado pra não quebrar quem importava essas constantes daqui (combat.js era o dono
// antes da Fase 1 da refatoração enemies.js/player.js)
export { TIME_REDUCTION_MIN_MS, TIME_REDUCTION_MAX_MS, DEFAULT_FIRE_COOLDOWN }

// ============ ORQUESTRADOR — junta projéteis/alvos/lock-on + escoltas + hitbox debug ============
// v0.38.0: combat.js monolítico (750 linhas) dividido por SISTEMA (não por tipo de projétil —
// normal e carregado ficam juntos em projectiles.js, ver comentário lá): projectiles.js (tiros
// do jogador), targets.js (bônus + orbes do chefe), lockon.js (trava do tiro carregado). Este
// arquivo mantém só o que não vale a pena isolar sozinho (escoltas, hitbox debug) e a
// orquestração do `update()` — mesma API pública de antes, main.js/player.js não mudam nada.

const WINGMAN_OFFSETS = [3.2, -3.2]
const wingmanGeometry = new THREE.ConeGeometry(0.32, 1.1, 3)
wingmanGeometry.rotateX(-Math.PI / 2)
const wingmanMaterial = new THREE.MeshPhongMaterial({ color: 0x7fe0ff, flatShading: true })

const hitboxGeometry = new THREE.SphereGeometry(1, 8, 6)
const hitboxMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff88, wireframe: true, depthTest: false })

export function createCombatSystem(scene, rail, effects, enemies, player) {
  const lockon = createLockOnSystem(rail, enemies)
  const targets = createTargetsSystem(scene, rail, effects)
  const projectiles = createProjectileSystem(scene, effects, player, enemies, targets, lockon)

  const wingmen = []

  function updateWingmen() {
    if (wingmen.length === 0) return
    const playerPos = rail.getPlayerPosition()
    const frame = rail.getFrameAt(0)
    wingmen.forEach((w, i) => {
      const lateral = WINGMAN_OFFSETS[i] ?? 0
      const pos = playerPos.clone().addScaledVector(frame.right, lateral).addScaledVector(frame.up, -0.4)
      w.mesh.position.copy(pos)
      w.mesh.up.copy(frame.up)
      w.mesh.lookAt(pos.clone().add(frame.forward))
    })
  }

  let showHitboxes = false
  const hitboxGroup = new THREE.Group()
  scene.add(hitboxGroup)

  function markHitbox(position, radius) {
    const mesh = new THREE.Mesh(hitboxGeometry, hitboxMaterial)
    mesh.position.copy(position)
    mesh.scale.setScalar(radius)
    hitboxGroup.add(mesh)
  }

  function refreshHitboxes() {
    while (hitboxGroup.children.length) hitboxGroup.remove(hitboxGroup.children[0])
    if (!showHitboxes) return
    for (const item of targets.getHitboxTargets()) markHitbox(item.worldPos, item.radius)
    for (const item of enemies.getHitboxTargets()) markHitbox(item.worldPos, item.radius)
  }

  return {
    tryFire(origin, direction) {
      if (!projectiles.tryFire(origin, direction)) return
      for (const w of wingmen) projectiles.fireSingle(w.mesh.position, direction)
    },

    fireHomingShot: (origin, maxTargets) => projectiles.fireHomingShot(origin, maxTargets),
    deflectNearbyProjectiles: (playerPos, radius) => projectiles.deflectNearbyProjectiles(playerPos, radius),

    setWingmanCount(n) {
      n = Math.max(0, Math.min(WINGMAN_OFFSETS.length, n))
      while (wingmen.length < n) {
        const mesh = new THREE.Mesh(wingmanGeometry, wingmanMaterial)
        scene.add(mesh)
        wingmen.push({ mesh })
      }
      while (wingmen.length > n) {
        const w = wingmen.pop()
        scene.remove(w.mesh)
      }
    },

    getWingmanPositions: () => wingmen.map((w) => w.mesh.position.clone()),

    spawnEnemy: () => enemies.spawnEnemy(),
    spawnMiniSwarm: () => enemies.spawnMiniSwarm(),
    spawnTimeEnemy: () => enemies.spawnTimeEnemy(),
    spawnTimeEnemyMega: () => enemies.spawnTimeEnemyMega(),
    spawnTankEnemy: (hp) => enemies.spawnTankEnemy(hp),
    spawnBossEnemy: (hp) => enemies.spawnBossEnemy(hp),
    spawnGoldenSpecial: (opts) => enemies.spawnGoldenSpecial(opts),
    spawnDetrito: () => enemies.spawnDetrito(),
    spawnSentinela: () => enemies.spawnSentinela(),

    getEnemyCount: () => enemies.getEnemyCount(),
    getEnemySnapshots: () => enemies.getEnemySnapshots(),
    getBossSnapshot: () => enemies.getBossSnapshot(),

    // QoL (v0.29.4): os orbes-pergunta do chefe também aparecem no minimapa
    getMinimapBlips: () => [...enemies.getMinimapBlips(), ...targets.getMinimapBlips()],

    clearEnemies: () => enemies.clearEnemies(),
    clearGoldenTargets: () => enemies.clearGoldenTargets(),
    showArenaPreview: (kind) => enemies.showArenaPreview(kind),
    clearArenaPreview: () => enemies.clearArenaPreview(),
    clearOtherEnemies: () => enemies.clearOtherEnemies(),

    clearAllCombatants() {
      enemies.clearAll()
      projectiles.clearAll()
      // QoL (v0.29.4): sem isso, as travas sobreviviam a um clear — os marcadores de lock no
      // HUD ficavam pendurados por alguns frames até o próximo sweepLockOn limpar.
      lockon.clearLockedEnemies()
    },

    spawnBonusTarget: () => targets.spawnBonusTarget(),
    clearBonusTargets: () => targets.clearBonusTargets(),
    spawnBossOrbs: (count, opts) => targets.spawnBossOrbs(count, opts),
    clearBossOrbs: () => targets.clearBossOrbs(),

    sweepLockOn: (origin, direction, maxAllowed) => lockon.sweepLockOn(origin, direction, maxAllowed),
    isAimingAtEnemy: (origin, direction) => lockon.isAimingAtEnemy(origin, direction),
    clearLockedEnemies: () => lockon.clearLockedEnemies(),
    getLockedEnemySnapshots: () => lockon.getLockedEnemySnapshots(),

    // continua existindo só pro debug "Tiro infinito" poder zerar o cooldown por fora do stat
    // real do jogador
    setFireCooldown: (seconds) => projectiles.setFireCooldown(seconds),
    setEnemyAggressiveness(multiplier) { enemies.setEnemyAggressiveness(multiplier) },
    setEnemyProjectileSpeedBonus(bonus) { enemies.setEnemyProjectileSpeedBonus(bonus) },
    setShowHitboxes(v) { showHitboxes = v; refreshHitboxes() },

    update(dt, playerPosition, opts = {}) {
      const enemiesActive = opts.enemiesActive !== false
      const aimDirection = opts.aimDirection
      projectiles.tick(dt)

      const {
        enemyKills, enemyKillPoints, bonusKillPoints,
        goldenSpecialHit, goldenSpecialHitIsHoming, goldenHitWorldPos,
        timeReductionMs, timeReductionWorldPos, bossDefeated, bossDefeatedIsHoming, bossHitWorldPos, bossOrbHit, hitsLog,
      } = projectiles.update(dt, aimDirection)
      targets.update(dt)

      let enemyHits = 0
      let enemyDamage = 1
      let ramKills = 0
      let ramKillPoints = 0
      let ramBossDefeated = false
      let ramBossWorldPos = null
      if (enemiesActive) {
        // golden (só existe durante 'goldenArena', já uma das fases "enemiesActive") também
        // atualiza aqui dentro, via enemies.update()
        const enemyResult = enemies.update(dt, playerPosition, { ramDamage: opts.ramDamage || 0 })
        enemyHits += enemyResult.hits
        ramKills = enemyResult.ramKills
        ramKillPoints = enemyResult.ramKillPoints
        ramBossDefeated = enemyResult.ramBossDefeated
        ramBossWorldPos = enemyResult.ramBossWorldPos
        const projResult = enemies.updateProjectiles(dt, playerPosition)
        enemyHits += projResult.hits
        if (projResult.hits > 0) enemyDamage = Math.max(enemyDamage, projResult.damage)
      }

      updateWingmen()

      if (showHitboxes) refreshHitboxes()

      return {
        enemyKills: enemyKills + ramKills,
        enemyKillPoints: enemyKillPoints + ramKillPoints,
        bonusKillPoints,
        enemyHits,
        enemyDamage,
        goldenSpecialHit,
        goldenSpecialHitIsHoming,
        goldenHitWorldPos,
        timeReductionMs,
        timeReductionWorldPos,
        bossDefeated: bossDefeated || ramBossDefeated,
        bossDefeatedIsHoming,
        bossHitWorldPos: bossHitWorldPos || ramBossWorldPos || null,
        bossOrbHit,
        hitsLog,
      }
    },

    dispose() {
      for (const w of [...wingmen]) scene.remove(w.mesh)
      wingmen.length = 0
      lockon.clearLockedEnemies()
      enemies.dispose()
      projectiles.dispose()
      targets.dispose()
      wingmanGeometry.dispose()
      wingmanMaterial.dispose()
      while (hitboxGroup.children.length) hitboxGroup.remove(hitboxGroup.children[0])
      scene.remove(hitboxGroup)
      hitboxGeometry.dispose()
      hitboxMaterial.dispose()
    },
  }
}
