import * as THREE from 'three'
import { TIME_REDUCTION_MIN_MS, TIME_REDUCTION_MAX_MS } from '../enemies/index.js'
import { BOSS_KIND } from '../enemies/boss.js'
import { GOLDEN_KIND } from '../enemies/golden.js'
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

import { createSquadronSystem } from './wingmen.js'

const hitboxGeometry = new THREE.SphereGeometry(1, 8, 6)
const hitboxMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff88, wireframe: true, depthTest: false })

export function createCombatSystem(scene, rail, effects, enemies, player) {
  const lockon = createLockOnSystem(rail, enemies)
  const targets = createTargetsSystem(scene, rail, effects)
  const projectiles = createProjectileSystem(scene, effects, player, enemies, targets, lockon)
  const squadron = createSquadronSystem(scene, rail, effects, enemies)

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
    if (rail && rail.getShipHitboxPoints) {
      for (const item of rail.getShipHitboxPoints()) markHitbox(item.worldPos, item.radius)
    }
  }

  let focusFrenzyTimer = 0

  return {
    tryFire(origin, direction) {
      if (!projectiles.tryFire(origin, direction, { isFrenzy: focusFrenzyTimer > 0 })) return false
      squadron.tryFireSupport(direction)
      player.getTelemetry?.()?.recordEvent('fire', `Laser primário disparado (${player.getProjectileCount?.() || 1}x)`, { pos: origin })
      return true
    },

    fireHomingShot: (origin, direction, maxTargets, isMaxCharge) => {
      const fired = projectiles.fireHomingShot(origin, direction, maxTargets, isMaxCharge)
      if (fired) {
        player.getTelemetry?.()?.recordEvent('homing', `Tiro teleguiado disparado! Carga máx: ${isMaxCharge}, Alvos: ${maxTargets}`, { isMaxCharge, maxTargets })
      }
      return fired
    },
    // overhaul v2 (pedido do usuário): homing contra chefe/dourado ("chefes inclui o dourado")
    // travado no instante do disparo — locks ainda não foram limpos aqui (game-loop.js só chama
    // combat.clearLockedEnemies() DEPOIS de fireSwirlBlast, ver o branch de release do fogo).
    fireSwirlBlast: (origin, direction) => {
      const bossTarget = lockon.getLockedEntities().find((e) => e.kind === BOSS_KIND || e.kind === GOLDEN_KIND) || null
      const fired = projectiles.fireSwirlBlast(origin, direction, bossTarget)
      if (fired) {
        player.getTelemetry?.()?.recordEvent('swirl', `Swirl Blast disparado!${bossTarget ? ' (homing em ' + bossTarget.kind + ')' : ''}`, { origin, homing: !!bossTarget })
      }
      return fired
    },
    deflectNearbyProjectiles: (playerPos, radius) => {
      const count = projectiles.deflectNearbyProjectiles(playerPos, radius)
      if (count > 0) {
        player.getTelemetry?.()?.recordEvent('deflect', `${count} projétil(eis) hostil(is) defletido(s)!`, { count, radius })
      }
      return count
    },

    setWingmanCount: (n) => squadron.setWingmanCount(n),
    getWingmanCount: () => squadron.getWingmanCount(),
    spawnSpecificWingman: (id) => squadron.spawnMember(id),
    removeSpecificWingman: (id) => squadron.removeMember(id),
    clearSquadron: () => squadron.clearSquadron(),
    // Rádio dos aliados (Ideia 3): game-loop.js chama isso no momento em que o dano do jogador
    // resolve — o wingman que comenta é sorteado dentro de wingmen.js, aqui é só o repasse.
    notifyPlayerDamaged: () => squadron.triggerPlayerTookDamage?.(),
    getWingmanPositions: () => squadron.getWingmanPositions(),
    getActiveWingmen: () => squadron.getActiveMembers(),
    getSquadronCommandMode: () => squadron.getCommandMode ? squadron.getCommandMode() : 'free',
    getSquadronCommandState: () => squadron.getCommandState ? squadron.getCommandState() : { mode: 'free', durationRemaining: 0, durationMax: 6, cooldownRemaining: 0, cooldownMax: 10 },
    toggleSquadronCommand: (playerPos) => squadron.toggleCommand(lockon.getLockedEntities ? lockon.getLockedEntities() : [], playerPos),
    getAbilityStates: () => squadron.getAbilityStates(),
    applyWingmanAbilityCard: (profileId) => squadron.applyAbilityCooldownCard(profileId),
    getAssistChargeMult: () => squadron.getAssistChargeMult ? squadron.getAssistChargeMult() : 1,
    getAssistExtraTargets: () => squadron.getAssistExtraTargets ? squadron.getAssistExtraTargets() : 0,

    // Telemetria da Esquadrilha
    getWingmanTelemetry: () => (squadron.getTelemetry ? squadron.getTelemetry() : null),
    getWingmanFlightLog: (limit) => (squadron.getFlightLog ? squadron.getFlightLog(limit) : []),
    dumpWingmanTelemetry: () => (squadron.dumpTelemetry ? squadron.dumpTelemetry() : null),
    copyWingmanFlightLog: () => (squadron.copyFlightLog ? squadron.copyFlightLog() : ''),
    getWingmanTelemetryText: () => (squadron.getTelemetryText ? squadron.getTelemetryText() : ''),
    clearWingmanFlightLog: () => { squadron.clearFlightLog?.() },

    // Telemetria do Jogador
    getPlayerTelemetry: () => player.getTelemetry?.()?.getSnapshot(),
    getPlayerFlightLog: (limit) => player.getTelemetry?.()?.getFlightLog(limit),
    dumpPlayerTelemetry: () => player.getTelemetry?.()?.dumpToConsole(),
    copyPlayerFlightLog: () => player.getTelemetry?.()?.copyToClipboard(),
    getPlayerTelemetryText: () => player.getTelemetry?.()?.getFormattedText(),
    clearPlayerFlightLog: () => player.getTelemetry?.()?.clearLog(),

    // Telemetria dos Inimigos
    getEnemyTelemetry: () => enemies.getTelemetry?.(),
    getEnemyCombatLog: (limit) => enemies.getCombatLog?.(limit),
    dumpEnemyTelemetry: () => enemies.dumpTelemetry?.(),
    copyEnemyCombatLog: () => enemies.copyCombatLog?.(),
    getEnemyTelemetryText: () => enemies.getTelemetryText?.(),
    clearEnemyCombatLog: () => enemies.clearCombatLog?.(),

    // Telemetria Global Integrada de Combate
    getCombatTelemetry: () => ({
      player: player.getTelemetry?.()?.getSnapshot(),
      wingmen: squadron.getTelemetry?.(),
      enemies: enemies.getTelemetry?.(),
    }),
    dumpCombatTelemetry: () => {
      console.log('%c==================== TELEMETRIA GERAL DE COMBATE ====================', 'color: #ffd700; font-size: 14px; font-weight: bold;')
      player.getTelemetry?.()?.dumpToConsole()
      squadron.dumpTelemetry?.()
      enemies.dumpTelemetry?.()
      console.log('%c======================================================================', 'color: #ffd700; font-size: 14px; font-weight: bold;')
    },

    spawnEnemy: () => enemies.spawnEnemy(),
    spawnSquadron: (formationType) => enemies.spawnSquadron ? enemies.spawnSquadron(formationType) : null,
    spawnMiniSwarm: () => enemies.spawnMiniSwarm(),
    spawnTimeEnemy: () => enemies.spawnTimeEnemy(),
    spawnTimeEnemyMega: () => enemies.spawnTimeEnemyMega(),
    spawnTankEnemy: (hp) => enemies.spawnTankEnemy(hp),
    spawnBossEnemy: (hp, level) => enemies.spawnBossEnemy(hp, level),
    spawnGoldenSpecial: (opts) => enemies.spawnGoldenSpecial(opts),
    spawnDetrito: (count, opts) => enemies.spawnDetrito(count, opts),
    spawnTitanicDetrito: (opts) => enemies.spawnTitanicDetrito(opts),
    spawnSentinela: () => enemies.spawnSentinela(),
    spawnReplica: () => enemies.spawnReplica(),
    spawnFragata: () => enemies.spawnFragata(),
    spawnVerme: () => enemies.spawnVerme(),
    spawnImaSwarm: () => enemies.spawnImaSwarm(),
    spawnSussurro: () => enemies.spawnSussurro(),
    spawnHorda: () => enemies.spawnHorda(),

    getEnemyCount: () => enemies.getEnemyCount(),
    getEnemySnapshots: () => enemies.getEnemySnapshots(),
    getBossSnapshot: () => enemies.getBossSnapshot(),
    getGoldenSnapshot: () => enemies.getGoldenSnapshot(),

    // QoL (v0.29.4): os orbes-pergunta do chefe também aparecem no minimapa
    getMinimapBlips: () => [...enemies.getMinimapBlips(), ...targets.getMinimapBlips()],

    clearEnemies: () => enemies.clearEnemies(),
    clearGoldenTargets: () => enemies.clearGoldenTargets(),
    showArenaPreview: (kind) => enemies.showArenaPreview(kind),
    clearArenaPreview: () => enemies.clearArenaPreview(),
    applySpawnWobbles: () => enemies.applySpawnWobbles(),
    clearOtherEnemies: () => enemies.clearOtherEnemies(),
    clearProjectiles: () => projectiles.clearAll(),

    clearAllCombatants() {
      enemies.clearAll()
      projectiles.clearAll()
      targets.clearBonusTargets()
      targets.clearBossOrbs()
      squadron.clearLasers?.()
      // QoL (v0.29.4): sem isso, as travas sobreviviam a um clear — os marcadores de lock no
      // HUD ficavam pendurados por alguns frames até o próximo sweepLockOn limpar.
      lockon.clearLockedEnemies()
    },

    consumeBossDefeated: () => (enemies.consumeBossDefeated ? enemies.consumeBossDefeated() : null),
    hasAliveBoss: () => (enemies.hasAliveBoss ? enemies.hasAliveBoss() : false),
    isBossDying: () => (enemies.isBossDying ? enemies.isBossDying() : false),
    getBossWorldPos: () => (enemies.getBossWorldPos ? enemies.getBossWorldPos() : null),

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
    setEnemyAimError(deg) { enemies.setEnemyAimError(deg) },
    setShowHitboxes(v) { showHitboxes = v; refreshHitboxes() },

    update(dt, playerPosition, opts = {}) {
      const enemiesActive = opts.enemiesActive !== false
      const aimDirection = opts.aimDirection
      projectiles.tick(dt)

      // Micro-Orbes Anki & Frenesi de Foco
      let focusFrenzyActivated = false
      if (effects && effects.updateMicroOrbes) {
        effects.updateMicroOrbes(dt, playerPosition)
        const orbesCollected = effects.getMicroOrbesCollected ? effects.getMicroOrbesCollected() : 0
        if (orbesCollected > 0) {
          focusFrenzyTimer = 5.0
          focusFrenzyActivated = true
        }
      }
      if (focusFrenzyTimer > 0) {
        focusFrenzyTimer = Math.max(0, focusFrenzyTimer - dt)
      }

      const {
        enemyKills, enemyKillPoints, bonusKillPoints,
        goldenSpecialHit, goldenSpecialHitIsHoming, goldenHitWorldPos,
        timeReductionMs, timeReductionWorldPos, bossDefeated, bossDefeatedIsHoming, bossHitWorldPos, bossOrbHit, hitsLog,
        squadWipe, squadWipeBonus,
      } = projectiles.update(dt, aimDirection, { allowBossOrbHit: opts.allowBossOrbHit !== false })
      targets.update(dt)

      let enemyHits = 0
      let enemyDamage = 1
      // Nível de poder do maior hit de PROJÉTIL/laser/moldura no frame (ver PROJECTILE_POWER_LEVEL
      // em enemies/shared.js) — toque físico direto (kamikaze/aríete) não conta aqui, tem seu
      // próprio tumble via bossCollisionWorldPos (rail.triggerBossCollisionTumble).
      let enemyHitPowerLevel = 1
      let ramKills = 0
      let ramKillPoints = 0
      let ramBossDefeated = false
      let ramBossWorldPos = null
      let ramGoldenDefeated = false
      let ramGoldenWorldPos = null
      let bossCollisionWorldPos = null
      if (enemiesActive) {
        // golden (só existe durante 'goldenArena', já uma das fases "enemiesActive") também
        // atualiza aqui dentro, via enemies.update()
        const enemyResult = enemies.update(dt, playerPosition, { ...opts, ramDamage: opts.ramDamage || 0 })
        enemyHits += enemyResult.hits
        ramKills = enemyResult.ramKills
        ramKillPoints = enemyResult.ramKillPoints
        ramBossDefeated = enemyResult.ramBossDefeated
        ramBossWorldPos = enemyResult.ramBossWorldPos
        ramGoldenDefeated = enemyResult.ramGoldenDefeated
        ramGoldenWorldPos = enemyResult.ramGoldenWorldPos
        bossCollisionWorldPos = enemyResult.bossCollisionWorldPos || null
        const projResult = enemies.updateProjectiles(dt, playerPosition, opts)
        enemyHits += projResult.hits
        if (projResult.hits > 0) {
          enemyDamage = Math.max(enemyDamage, projResult.damage)
          enemyHitPowerLevel = Math.max(enemyHitPowerLevel, projResult.powerLevel)
        }
      }

      const wingmanResult = squadron.update(dt, playerPosition, rail.getFrameAt(0), {
        boostActive: opts.boostActive,
        homingCharging: opts.homingCharging,
        shieldNotFull: player.getShieldValue() < player.getShieldMax(),
        reactivity: opts.reactivity,
      }) || {}

      // Habilidades únicas do esquadrão que afetam o jogador diretamente (Peppy: Guarda / Slippy:
      // Reparo de Campo) resolvem aqui — combat/index.js já tem `player`/`effects` no escopo, não
      // precisa subir esse encanamento até o game-loop.
      if (wingmanResult.shieldGrants > 0 && player.grantShieldPip) {
        for (let i = 0; i < wingmanResult.shieldGrants; i++) player.grantShieldPip()
      }
      if (wingmanResult.healOrbSpawns && wingmanResult.healOrbSpawns.length > 0 && effects && effects.spawnMicroOrbe) {
        for (const pos of wingmanResult.healOrbSpawns) effects.spawnMicroOrbe(pos, { kind: 'heal' })
      }

      const healOrbesCollected = effects && effects.getHealOrbesCollected ? effects.getHealOrbesCollected() : 0
      if (healOrbesCollected > 0 && player.heal) player.heal(healOrbesCollected)

      if (showHitboxes) refreshHitboxes()

      return {
        enemyKills: enemyKills + ramKills + (wingmanResult.enemyKills || 0),
        enemyKillPoints: enemyKillPoints + ramKillPoints + (wingmanResult.enemyKillPoints || 0),
        bonusKillPoints,
        enemyHits,
        enemyDamage,
        enemyHitPowerLevel,
        goldenSpecialHit: goldenSpecialHit || ramGoldenDefeated || Boolean(wingmanResult.goldenSpecialHit),
        goldenSpecialHitIsHoming,
        goldenHitWorldPos: goldenHitWorldPos || ramGoldenWorldPos || wingmanResult.goldenHitWorldPos || null,
        timeReductionMs,
        timeReductionWorldPos,
        bossDefeated: bossDefeated || ramBossDefeated || Boolean(wingmanResult.bossDefeated),
        bossDefeatedIsHoming,
        bossHitWorldPos: bossHitWorldPos || ramBossWorldPos || wingmanResult.bossHitWorldPos || null,
        bossOrbHit,
        bossCollisionWorldPos,
        hitsLog,
        squadWipe: Boolean(squadWipe),
        squadWipeBonus: squadWipeBonus || 0,
        focusFrenzyActivated,
        isFrenzyActive: focusFrenzyTimer > 0,
        radioMessage: wingmanResult.radioMessage || null,
        radioQueue: wingmanResult.radioQueue || null,
      }
    },

    dispose() {
      squadron.dispose()
      lockon.clearLockedEnemies()
      enemies.dispose()
      projectiles.dispose()
      targets.dispose()
      while (hitboxGroup.children.length) hitboxGroup.remove(hitboxGroup.children[0])
      scene.remove(hitboxGroup)
      hitboxGeometry.dispose()
      hitboxMaterial.dispose()
    },
  }
}
