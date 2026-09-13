// Extraído de main.js (refatoração de organização, zero mudança de comportamento): monta o
// objeto de bindings do painel de debug (hud.debug.bind). Depende de quase todos os sistemas
// do jogo de propósito — é o painel de debug, "alcançar tudo" é esperado aqui — mas isolar isso
// evita inflar main.js com ~70 linhas que não fazem parte do loop de jogo em si.
export function createDebugActions(deps) {
  const {
    combat, session, player, rail, effects, hud,
    GOLDEN_SPREAD_MIN, GOLDEN_SPREAD_MAX, DEFLECT_RADIUS,
    debugFlags, getPhase, resetBossHealthBonus,
    applyHealthLoss, endSector, forceAnswerOutcome,
    startArenaCutscene, enterBossBuildup, finishBossHunt, enterBossFight, enterGoldenArena,
    enterCardChoice, enterCombat,
  } = deps

  return {
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
  }
}
