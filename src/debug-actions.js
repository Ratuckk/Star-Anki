// Extraído de main.js (refatoração de organização, zero mudança de comportamento): monta o
// objeto de bindings do painel de debug (hud.debug.bind). Depende de quase todos os sistemas
// do jogo de propósito — é o painel de debug, "alcançar tudo" é esperado aqui — mas isolar isso
// evita inflar main.js com ~70 linhas que não fazem parte do loop de jogo em si.
export function createDebugActions(deps) {
  const {
    combat, session, player, rail, effects, hud, enemies,
    environment,
    GOLDEN_SPREAD_MIN, GOLDEN_SPREAD_MAX, DEFLECT_RADIUS,
    debugFlags, triggerDebrisStorm, getPhase, resetBossHealthBonus,
    applyHealthLoss, endSector, forceAnswerOutcome,
    startArenaCutscene, enterBossBuildup, finishBossHunt, enterBossFight, enterGoldenArena,
    enterCardChoice, enterCombat,
    restartSector, nextSector, prevSector, exitArenaNow,
  } = deps

  if (environment && hud?.debug?.setToggleActive) {
    const cfg = environment.getConfig()
    hud.debug.setToggleActive('toggleSkyDome', cfg.enableSkyDome)
    hud.debug.setToggleActive('toggleCelestialBodies', cfg.enableCelestialBodies)
    hud.debug.setToggleActive('toggleMultiLayerStars', cfg.enableMultiLayerStars)
    hud.debug.setToggleActive('toggleWarpStreaks', cfg.enableWarpStreaks)
    hud.debug.setToggleActive('toggleNebulaPockets', cfg.enableNebulaPockets)
    hud.debug.setToggleActive('toggleIonStorms', cfg.enableIonStorms)
    hud.debug.setToggleActive('toggleShootingStars', cfg.enableShootingStars)
    hud.debug.setToggleActive('toggleEnergizedGrid', cfg.enableEnergizedGrid)
    hud.debug.setToggleActive('toggleDebrisStorm', cfg.enableDebrisStormEvent)
  }

  return {
    restartSector: () => {
      if (restartSector) restartSector()
      else {
        rail.exitArena()
        combat.clearAllCombatants()
        enterCombat()
      }
    },
    nextSector: () => {
      if (nextSector) nextSector()
      else {
        session.pointer = (session.pointer + 1) % session.queue.length
        rail.exitArena()
        combat.clearAllCombatants()
        enterCombat()
      }
    },
    prevSector: () => {
      if (prevSector) prevSector()
      else {
        session.pointer = (session.pointer - 1 + session.queue.length) % session.queue.length
        rail.exitArena()
        combat.clearAllCombatants()
        enterCombat()
      }
    },
    exitArenaNow: () => {
      if (exitArenaNow) exitArenaNow()
      else {
        rail.exitArena()
        combat.clearAllCombatants()
        hud.setBossFight(false)
        hud.setBossTint(false)
        hud.setGoldenActive(false)
        hud.setMinimap(false)
        hud.setHorizon(null)
        enterCombat()
      }
    },
    toggleDisableArena: () => {
      debugFlags.disableArena = !debugFlags.disableArena
      hud.debug.setToggleActive('toggleDisableArena', debugFlags.disableArena)
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
    gotoBoss: () => { if (getPhase() === 'combat') startArenaCutscene('boss', enterBossBuildup) },
    skipToBossFight: () => {
      const phase = getPhase()
      if (phase === 'bossBuildup' || phase === 'bossQuestionPause') finishBossHunt()
      else if (phase === 'combat') { resetBossHealthBonus(); rail.enterArena(); enterBossFight() }
    },
    gotoGolden: () => { if (getPhase() === 'combat') startArenaCutscene('golden', enterGoldenArena) },
    clearCombatants: () => combat.clearAllCombatants(),
    showHitboxes: () => {
      debugFlags.hitboxesActive = !debugFlags.hitboxesActive
      combat.setShowHitboxes(debugFlags.hitboxesActive)
      hud.debug.setToggleActive('showHitboxes', debugFlags.hitboxesActive)
    },
    slowMo: () => {
      debugFlags.slowMoActive = !debugFlags.slowMoActive
      hud.debug.setToggleActive('slowMo', debugFlags.slowMoActive)
    },
    giveCard: () => { if (getPhase() === 'combat') enterCardChoice(enterCombat) },
    triggerFullDodge: () => {
      player.grantInvincibility(1000)
      if (player.isDeflectActive()) {
        combat.deflectNearbyProjectiles(rail.getPlayerPosition(), DEFLECT_RADIUS)
        effects.deflectBurst(rail.getPlayerPosition(), rail.getFrameAt(0).forward)
      }
      rail.debugForceBank(1, 1000)
    },
    fireHomingTest: () => combat.fireHomingShot(rail.getShipNosePosition(), player.config.homingMaxTargets),
    spawnWingman1: () => { combat.spawnSpecificWingman(0); player.setWingmanCount(combat.getWingmanCount()) },
    spawnWingman2: () => { combat.spawnSpecificWingman(1); player.setWingmanCount(combat.getWingmanCount()) },
    spawnWingman3: () => { combat.spawnSpecificWingman(2); player.setWingmanCount(combat.getWingmanCount()) },
    spawnWingman4: () => { combat.spawnSpecificWingman(3); player.setWingmanCount(combat.getWingmanCount()) },
    clearWingmen: () => { combat.clearSquadron(); player.setWingmanCount(0) },
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
