// Extraído de main.js (refatoração de organização, zero mudança de comportamento): monta o
// objeto de bindings do painel de debug (hud.debug.bind). Depende de quase todos os sistemas
// do jogo de propósito — é o painel de debug, "alcançar tudo" é esperado aqui — mas isolar isso
// evita inflar main.js com ~70 linhas que não fazem parte do loop de jogo em si.
export function createDebugActions(deps) {
  const {
    state,
    gameLoop,
    combat, session, player, rail, effects, hud, enemies,
    environment,
    GOLDEN_SPREAD_MIN, GOLDEN_SPREAD_MAX, DEFLECT_RADIUS,
    debugFlags, triggerDebrisStorm, getPhase, resetBossHealthBonus,
    applyHealthLoss, endSector, forceAnswerOutcome,
    startArenaCutscene, enterBossBuildup, finishBossHunt, enterBossFight, enterGoldenArena,
    enterCardChoice, enterCombat,
    restartSector, nextSector, prevSector, exitArenaNow,
    aiValidator,
  } = deps

  function resetEverythingForDebugEvent() {
    // 1. Limpa TODOS os inimigos, projéteis, lasers e portais na tela imediatamente
    combat.clearAllCombatants()
    combat.clearOtherEnemies?.()

    // 2. Reseta o rail e arenas
    rail.exitArena()
    rail.setAdvancing(true)

    // 3. Reseta elementos de HUD
    hud.setBossFight(false, 0, 1)
    hud.setBossTint(false)
    hud.setBossActive(false)
    hud.setGoldenActive(false)
    hud.setMinimap(false)
    hud.setHorizon(null)
    hud.setCountdown(null)
    hud.setFeedback(null)
    hud.hideQuestionModal?.()
    hud.hideCardChoice?.()
    hud.hideMissionComplete?.()
    hud.setLetterbox?.(false)

    // 4. Limpa estados de transição/cutscenes pendentes
    if (state) {
      state.deathCutsceneTimer = 0
      state.deathCutsceneKind = null
      state.deathCutsceneOnDone = null
      state.deathCutsceneUiInitialized = false
      state.deathWhiteoutTriggered = false
      state.arenaCutsceneActive = false
      state.arenaCutsceneTimer = 0
      state.bossOrbsRemaining = 0
      state.pendingQuestionKind = null
      state.pendingCardChoice = false
      state.phase = 'combat'
    }
  }

  if (environment && hud?.debug?.setToggleActive) {
    const cfg = environment.getConfig()
    hud.debug.setToggleActive('toggleSkyDome', cfg.enableSkyDome)
    hud.debug.setToggleActive('toggleCelestialBodies', cfg.enableCelestialBodies)
    hud.debug.setToggleActive('toggleMultiLayerStars', cfg.enableMultiLayerStars)
    hud.debug.setToggleActive('toggleWarpStreaks', cfg.enableWarpStreaks)
    hud.debug.setToggleActive('toggleAbstractSpeedlines', cfg.enableAbstractSpeedlines)
    hud.debug.setToggleActive('toggleNebulaPockets', cfg.enableNebulaPockets)
    hud.debug.setToggleActive('toggleIonStorms', cfg.enableIonStorms)
    hud.debug.setToggleActive('toggleShootingStars', cfg.enableShootingStars)
    hud.debug.setToggleActive('toggleEnergizedGrid', cfg.enableEnergizedGrid)
    hud.debug.setToggleActive('toggleDebrisStorm', cfg.enableDebrisStormEvent)
  }

  return {
    restartSector: () => {
      resetEverythingForDebugEvent()
      if (restartSector) restartSector()
      else {
        enterCombat()
      }
    },
    nextSector: () => {
      resetEverythingForDebugEvent()
      if (nextSector) nextSector()
      else {
        session.pointer = (session.pointer + 1) % session.queue.length
        enterCombat()
      }
    },
    prevSector: () => {
      resetEverythingForDebugEvent()
      if (prevSector) prevSector()
      else {
        session.pointer = (session.pointer - 1 + session.queue.length) % session.queue.length
        enterCombat()
      }
    },
    exitArenaNow: () => {
      resetEverythingForDebugEvent()
      if (exitArenaNow) exitArenaNow()
      else {
        enterCombat()
      }
    },
    toggleDisableArena: () => {
      debugFlags.disableArena = !debugFlags.disableArena
      hud.debug.setToggleActive('toggleDisableArena', debugFlags.disableArena)
    },
    toggleAutoSpawn: () => {
      debugFlags.disableAutoSpawn = !debugFlags.disableAutoSpawn
      hud.debug.setToggleActive('toggleAutoSpawn', debugFlags.disableAutoSpawn)
    },
    nukeEnemies: () => {
      if (enemies && enemies.getAlive) {
        const alive = enemies.getAlive().concat(enemies.getGoldenAlive ? enemies.getGoldenAlive() : [])
        for (const e of alive) {
          if (e.mesh && e.mesh.position) {
            effects.explosion(e.mesh.position, '#ff4d6d', 2.0, { rings: true })
          }
        }
      }
      combat.clearAllCombatants()
    },
    spawnWave: () => {
      combat.spawnEnemy()
      combat.spawnEnemy()
      combat.spawnMiniSwarm()
      combat.spawnTankEnemy()
    },
    grantAllCards: () => {
      player.debugMaxBuffs()
      combat.setWingmanCount(player.getWingmanCount())
      hud.updateCollectedCards(player.getCollectedCards())
    },
    resetBuffs: () => {
      player.resetCards()
      combat.setWingmanCount(0)
      hud.updateCollectedCards(player.getCollectedCards())
    },
    spawnEnemy: () => combat.spawnEnemy(),
    spawnTimeEnemy: () => combat.spawnTimeEnemy(),
    spawnBonus: () => combat.spawnBonusTarget(),
    spawnGolden: () => combat.spawnGoldenSpecial({ distanceMin: GOLDEN_SPREAD_MIN, distanceMax: GOLDEN_SPREAD_MAX }),
    spawnTank: () => combat.spawnTankEnemy(),
    spawnMiniSwarm: () => combat.spawnMiniSwarm(),
    spawnTimeEnemyMega: () => combat.spawnTimeEnemyMega(),
    spawnDetrito: () => combat.spawnDetrito(),
    spawnSentinela: () => combat.spawnSentinela(),
    spawnReplica: () => combat.spawnReplica(),
    spawnFragata: () => combat.spawnFragata(),
    spawnVerme: () => combat.spawnVerme(),
    spawnImaSwarm: () => combat.spawnImaSwarm(),
    spawnSussurro: () => combat.spawnSussurro(),
    spawnHorda: () => combat.spawnHorda(),
    forceCorrect: () => forceAnswerOutcome(true),
    forceWrong: () => forceAnswerOutcome(false),
    addScore: () => { session.score += 100 },
    heal: () => player.heal(1),
    damage: () => {
      session.health = Math.max(0, session.health - 1)
      if (applyHealthLoss()) endSector()
    },
    fullHeal: () => { session.health = player.getMaxHealth() },
    loseLife: () => {
      session.lives = Math.max(0, session.lives - 1)
      hud.setLives(session.lives, player.getMaxLives())
      if (session.lives <= 0) endSector()
    },
    rechargeShield: () => player.rechargeShield(),
    godMode: () => {
      debugFlags.godMode = !debugFlags.godMode
      hud.debug.setToggleActive('godMode', debugFlags.godMode)
    },
    infiniteAmmo: () => {
      debugFlags.infiniteAmmoActive = !debugFlags.infiniteAmmoActive
      combat.setFireCooldown(debugFlags.infiniteAmmoActive ? 0 : player.config.fireCooldown)
      hud.debug.setToggleActive('infiniteAmmo', debugFlags.infiniteAmmoActive)
    },
    maxBuffs: () => {
      player.debugMaxBuffs()
      combat.setWingmanCount(player.getWingmanCount())
      hud.updateCollectedCards(player.getCollectedCards())
    },
    // QoL: antes iam direto pra enterBossBuildup/enterGoldenArena, pulando a cutscene — não
    // dava pra testar a transição sem esperar o gatilho natural (dourado 45-100s, chefe a cada
    // 5 perguntas). Agora roteiam pela mesma startArenaCutscene que o jogo usa de verdade.
    // skipToBossFight continua sendo o atalho SEM cutscene, pra testar só a luta em si.
    gotoBoss: () => {
      resetEverythingForDebugEvent()
      startArenaCutscene('boss', enterBossBuildup)
    },
    skipToBossFight: () => {
      resetEverythingForDebugEvent()
      resetBossHealthBonus()
      rail.enterArena()
      enterBossFight()
    },
    gotoGolden: () => {
      resetEverythingForDebugEvent()
      startArenaCutscene('golden', enterGoldenArena)
    },
    clearCombatants: () => {
      resetEverythingForDebugEvent()
    },
    showHitboxes: () => {
      debugFlags.hitboxesActive = !debugFlags.hitboxesActive
      combat.setShowHitboxes(debugFlags.hitboxesActive)
      hud.debug.setToggleActive('showHitboxes', debugFlags.hitboxesActive)
    },
    slowMo: () => {
      debugFlags.slowMoActive = !debugFlags.slowMoActive
      hud.debug.setToggleActive('slowMo', debugFlags.slowMoActive)
    },
    giveCard: () => {
      resetEverythingForDebugEvent()
      enterCardChoice(enterCombat)
    },
    triggerFullDodge: () => {
      player.grantInvincibility(1000)
      if (player.isDeflectActive()) {
        combat.deflectNearbyProjectiles(rail.getPlayerPosition(), DEFLECT_RADIUS)
        effects.deflectBurst(rail.getPlayerPosition(), rail.getFrameAt(0).forward)
      }
      rail.debugForceBank(1, 1000)
    },
    fireHomingTest: () => combat.fireHomingShot(rail.getShipNosePosition(), rail.getFrameAt(0).forward, player.config.homingMaxTargets),
    toggleManualStep: () => {
      if (gameLoop) {
        const next = !gameLoop.isManualStepping()
        gameLoop.setManualStepping(next)
      }
    },
    step1Frame: () => { if (gameLoop) gameLoop.step(1) },
    step10Frames: () => { if (gameLoop) gameLoop.step(10) },
    step60Frames: () => { if (gameLoop) gameLoop.step(60) },
    step180Frames: () => { if (gameLoop) gameLoop.step(180) },
    spawnWingman1: () => { combat.spawnSpecificWingman(0); player.setWingmanCount(combat.getWingmanCount()) },
    spawnWingman2: () => { combat.spawnSpecificWingman(1); player.setWingmanCount(combat.getWingmanCount()) },
    spawnWingman3: () => { combat.spawnSpecificWingman(2); player.setWingmanCount(combat.getWingmanCount()) },
    spawnWingman4: () => { combat.spawnSpecificWingman(3); player.setWingmanCount(combat.getWingmanCount()) },
    clearWingmen: () => { combat.clearSquadron(); player.setWingmanCount(0) },
    dumpWingmanTelemetry: () => {
      combat.dumpWingmanTelemetry?.()
      hud?.debug?.refreshStats?.()
    },
    copyWingmanLog: () => {
      combat.copyWingmanFlightLog?.()
    },
    clearWingmanLog: () => {
      combat.clearWingmanFlightLog?.()
      hud?.debug?.refreshStats?.()
    },
    dumpPlayerTelemetry: () => {
      combat.dumpPlayerTelemetry?.()
      hud?.debug?.refreshStats?.()
    },
    copyPlayerLog: () => {
      combat.copyPlayerFlightLog?.()
    },
    dumpEnemyTelemetry: () => {
      combat.dumpEnemyTelemetry?.()
      hud?.debug?.refreshStats?.()
    },
    copyEnemyLog: () => {
      combat.copyEnemyCombatLog?.()
    },
    copyAIValidationLog: () => {
      aiValidator?.copyReport()
    },
    clearAIValidationLog: () => {
      aiValidator?.reset()
    },
    dumpCombatTelemetry: () => {
      combat.dumpCombatTelemetry?.()
      hud?.debug?.refreshStats?.()
    },
    toggleSkyDome: () => {
      if (environment) {
        const active = environment.toggleFeature('enableSkyDome')
        hud.debug.setToggleActive('toggleSkyDome', active)
      }
    },
    toggleCelestialBodies: () => {
      if (environment) {
        const active = environment.toggleFeature('enableCelestialBodies')
        hud.debug.setToggleActive('toggleCelestialBodies', active)
      }
    },
    toggleMultiLayerStars: () => {
      if (environment) {
        const active = environment.toggleFeature('enableMultiLayerStars')
        hud.debug.setToggleActive('toggleMultiLayerStars', active)
      }
    },
    toggleWarpStreaks: () => {
      if (environment) {
        const active = environment.toggleFeature('enableWarpStreaks')
        hud.debug.setToggleActive('toggleWarpStreaks', active)
      }
    },
    toggleAbstractSpeedlines: () => {
      if (environment) {
        const active = environment.toggleFeature('enableAbstractSpeedlines')
        hud.debug.setToggleActive('toggleAbstractSpeedlines', active)
      }
    },
    toggleNebulaPockets: () => {
      if (environment) {
        const active = environment.toggleFeature('enableNebulaPockets')
        hud.debug.setToggleActive('toggleNebulaPockets', active)
      }
    },
    toggleIonStorms: () => {
      if (environment) {
        const active = environment.toggleFeature('enableIonStorms')
        hud.debug.setToggleActive('toggleIonStorms', active)
      }
    },
    toggleShootingStars: () => {
      if (environment) {
        const active = environment.toggleFeature('enableShootingStars')
        hud.debug.setToggleActive('toggleShootingStars', active)
      }
    },
    toggleEnergizedGrid: () => {
      if (environment) {
        const active = environment.toggleFeature('enableEnergizedGrid')
        hud.debug.setToggleActive('toggleEnergizedGrid', active)
      }
    },
    triggerDebrisStorm: () => {
      if (triggerDebrisStorm) triggerDebrisStorm(15000)
    },
    toggleDebrisStorm: () => {
      if (environment) {
        const active = environment.toggleFeature('enableDebrisStormEvent')
        hud.debug.setToggleActive('toggleDebrisStorm', active)
      }
    },
    spawnTitanic: () => combat.spawnTitanicDetrito({ drift: true }),
  }
}
