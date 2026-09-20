// flow-boss.js
//
// Fluxo do CHEFE (caçada de orbes → invocação → luta → vitória) e do DOURADO (arena →
// pergunta-bônus → volta ao combate), mais a cutscene de transição (startArenaCutscene) que
// ambos compartilham e os dois handlers de "chefe morreu / dourado morreu". Zero mudança de
// comportamento em relação ao código que vivia inline no main.js.

import {
  BOSS_BASE_HP, BOSS_HP_PER_ERROR, BOSS_HP_PER_LEVEL, BOSS_BUILDUP_MS, BOSS_HUNT_BONUS_MS,
  BOSS_QUESTION_COUNT, BOSS_DEFEAT_BONUS, BOSS_SUMMON_CUTSCENE_MS,
  ARENA_CUTSCENE_MS, FEEDBACK_MS, WRONG_FEEDBACK_MS,
  GOLDEN_SPREAD_MIN, GOLDEN_SPREAD_MAX,
  DEATH_CUTSCENE_MS, BOSS_DEATH_CUTSCENE_MS,
  BOSS_EVERY_QUESTIONS, BOSS_NO_DECK_SCORE_INTERVAL,
  ARENA_MAX_SPAWN_DISTANCE, TRACK_MAX_SPAWN_DISTANCE,
} from './main-constants.js'
import { nextQuestion, resolveAnswer, pickBonusCard, buildBonusQuestion } from './quiz.js'
import { recordResult, saveHistory } from './storage.js'
import { getDifficultyLevel } from './enemies/shared.js'

export function createBossFlow(deps) {
  const {
    state, session, deck, menu,
    camera, hud, combat, rail, effects, environment,
    applyDifficulty, applyBossDifficulty, applySpeedProgression,
    currentBossSpread, currentBossExtraEnemies,
    randomGoldenInterval,
    applyHealthLoss, endSector,
  } = deps

  function startArenaCutscene(kind, onDone, durationMs = ARENA_CUTSCENE_MS) {
    state.phase = 'arenaCutscene'
    state.arenaCutsceneKind = kind
    state.arenaCutsceneTimer = durationMs
    state.arenaCutsceneDurationMs = durationMs
    state.arenaCutsceneOnDone = onDone
    state.arenaCutsceneBaseCameraPos = camera.position.clone()
    state.arenaCutsceneBaseForward = rail.getFrameAt(0).forward.clone()
    state.arenaCutsceneBaseRight = rail.getFrameAt(0).right.clone()
    hud.setArenaWarning(null)
    hud.setCountdown(null)
    combat.clearArenaPreview()

    // Fog como indicador de ameaça (Overhaul 4, pilar 4) — engrossa e ganha cor de aviso (se a
    // setting estiver ligada, ver environment.js) já no aviso de 5s, antes da arena começar de
    // verdade, pra a transição visual já estar rolando quando a luta entra em cena.
    if (environment?.setSpawnDistanceExpectation && (kind === 'boss' || kind === 'bossSummon' || kind === 'golden')) {
      environment.setSpawnDistanceExpectation(ARENA_MAX_SPAWN_DISTANCE)
    }
    if (environment?.setFogProfile) {
      if (kind === 'boss' || kind === 'bossSummon') environment.setFogProfile('bossWarn')
      else if (kind === 'golden') environment.setFogProfile('goldenWarn')
    }
  }

  function enterBossBuildup() {
    state.phase = 'bossBuildup'
    state.bossHealthBonus = 0
    state.questionResult = null
    // consumido AQUI (não em enterCombat, que só decide o gatilho) — pro próximo chefe sem
    // baralho contar só a pontuação ganha DEPOIS deste. Inofensivo em modo com baralho (ninguém
    // lê esse campo fora do ramo isNoDeck abaixo).
    state.bossNoDeckScoreCheckpoint = session.score
    rail.enterArena()
    if (deck?.isNoDeck) {
      // Sem baralho não há pergunta pra caçar orbe nenhum (ver comentário em main-constants.js,
      // BOSS_NO_DECK_SCORE_INTERVAL) — pula a caçada inteira (bossBuildup/triggerBossQuestion)
      // e vai direto pro finishBossHunt, que já dispara a cutscene de invocação antes da luta
      // de verdade (senão o combate começava "no susto"). rail.enterArena() acima continua
      // rodando igual ao fluxo normal — sem ele o chefe nasceria/lutaria no modo trilho errado.
      state.bossOrbsRemaining = 0
      finishBossHunt()
      return
    }
    state.bossBuildupTimer = BOSS_BUILDUP_MS
    state.bossOrbsRemaining = BOSS_QUESTION_COUNT
    hud.setBossActive(true, state.bossOrbsRemaining)
    hud.setCountdown(null)
    for (let i = 0; i < currentBossExtraEnemies(); i += 1) combat.spawnEnemy()
    combat.spawnBossOrbs(BOSS_QUESTION_COUNT, currentBossSpread())
  }

  function triggerBossQuestion() {
    combat.clearProjectiles?.()
    if (deck?.isNoDeck) {
      state.bossOrbsRemaining = Math.max(0, state.bossOrbsRemaining - 1)
      hud.setBossActive(true, state.bossOrbsRemaining)
      state.bossBuildupTimer += BOSS_HUNT_BONUS_MS
      if (effects && rail && effects.cardAcquiredPulse) {
        effects.cardAcquiredPulse(rail.getPlayerPosition(), 'especial')
      }
      if (state.bossOrbsRemaining <= 0) {
        finishBossHunt()
      } else {
        state.pendingCardChoice = true
        state.phase = 'bossBuildupResolution'
        state.phaseTimer = 0
      }
      return
    }

    const result = nextQuestion(session, deck.allCards)
    if (!result) {
      endSector()
      return
    }
    state.questionResult = result
    state.bossOrbsRemaining = Math.max(0, state.bossOrbsRemaining - 1)
    hud.setBossActive(true, state.bossOrbsRemaining)
    state.phase = 'bossQuestionPause'
    hud.showQuestionModal({
      question: result.card.question,
      alternatives: result.alternatives,
      explanation: result.card.explanation,
      sourceUrl: result.card.sourceUrl,
      sourcesText: result.card.sourcesText,
      tags: result.card.tags,
      deck: result.card.deck,
      isFastRetry: !!result.card?._isFastRetry,
      onPick: (slot) => {
        settleBossBuildupQuestion({
          type: slot === state.questionResult.correctSlot ? 'correct' : 'wrong',
          card: state.questionResult.card,
          timeBonus: 1.2,
          accuracyBonus: 1.2,
        })
      },
    })
  }

  function settleBossBuildupQuestion(outcome) {
    hud.hideQuestionModal()
    const correct = outcome.type === 'correct'
    const resolution = resolveAnswer(session, outcome)
    applySpeedProgression(outcome.type)
    if (!correct) {
      applyDifficulty()
      applyBossDifficulty()
      state.bossHealthBonus += BOSS_HP_PER_ERROR
    } else {
      state.bossBuildupTimer += BOSS_HUNT_BONUS_MS
    }

    recordResult(session.history, outcome.card.guid, correct)
    saveHistory(session.history)
    menu.sessionResults.push({ guid: outcome.card.guid, correct })

    hud.setFeedback({
      correct,
      correctAnswer: outcome.card.answer,
      points: correct ? resolution.points : 0,
      comboMultiplier: correct ? resolution.comboMultiplier : session.comboMultiplier,
      health: correct ? resolution.healthRemaining : session.health,
      accuracyBonus: outcome.accuracyBonus,
    })
    if (!correct) {
      hud.showErrorFloat(`Errou! Resposta: ${outcome.card.answer}`)
    }

    const prevLives = session.lives
    const outOfLives = applyHealthLoss()
    if (outOfLives) {
      state.pendingSectorOver = true
      state.pendingCardChoice = false
      state.phase = 'resolution'
      state.phaseTimer = correct ? 0 : WRONG_FEEDBACK_MS
      return
    }
    if (session.lives < prevLives && effects && rail && effects.respawnBurst) {
      effects.respawnBurst(rail.getPlayerPosition())
    }

    state.pendingCardChoice = correct
    state.phase = 'bossBuildupResolution'
    state.phaseTimer = correct ? 0 : WRONG_FEEDBACK_MS
  }

  function finishBossHunt() {
    hud.hideQuestionModal()
    state.bossHealthBonus += BOSS_HP_PER_ERROR * state.bossOrbsRemaining
    state.bossOrbsRemaining = 0
    combat.clearBossOrbs()
    startArenaCutscene('bossSummon', enterBossFight, BOSS_SUMMON_CUTSCENE_MS)
  }

  function enterBossFight() {
    state.phase = 'bossFight'
    hud.setBossActive(false)
    hud.setCountdown(null)
    hud.setBossTint(true)
    combat.clearAllCombatants()
    const level = getDifficultyLevel({ wrongAnswerCount: state.wrongAnswerCount, score: session.score, isNoDeck: !!deck?.isNoDeck })
    const bossHp = BOSS_BASE_HP + state.bossHealthBonus + BOSS_HP_PER_LEVEL * Math.max(0, level - 1)
    combat.spawnBossEnemy(bossHp, level)
    hud.setBossFight(true, bossHp, bossHp)

    hud.damageFlash()
    camera.fov = 88
    camera.updateProjectionMatrix()
    if (state.bossFovTimeout) clearTimeout(state.bossFovTimeout)
    state.bossFovTimeout = setTimeout(() => {
      state.bossFovTimeout = null
      camera.fov = 70
      camera.updateProjectionMatrix()
    }, 500)
  }

  function enterGoldenArena() {
    state.phase = 'goldenArena'
    rail.enterArena()
    const level = getDifficultyLevel({ wrongAnswerCount: state.wrongAnswerCount, score: session.score, isNoDeck: !!deck?.isNoDeck })
    combat.spawnGoldenSpecial({ distanceMin: GOLDEN_SPREAD_MIN, distanceMax: GOLDEN_SPREAD_MAX, level })
    hud.setGoldenActive(true)
  }

  function exitGoldenArenaVisuals() {
    rail.exitArena()
    combat.clearGoldenTargets()
    hud.setGoldenActive(false)
    environment?.setFogProfile?.(null)
    environment?.setSpawnDistanceExpectation?.(TRACK_MAX_SPAWN_DISTANCE)
  }

  function resumeCombatFromGolden() {
    state.phase = 'combat'
    rail.setAdvancing(true)
    state.goldenTimer = randomGoldenInterval()
    hud.setFeedback(null)
  }

  function enterGoldenAlternatives() {
    if (deck?.isNoDeck) {
      state.pendingCardChoice = true
      state.phase = 'goldenResolution'
      state.phaseTimer = 0
      return
    }

    state.goldenCard = pickBonusCard(deck, session)
    const result = buildBonusQuestion(state.goldenCard, deck.allCards)
    state.questionResult = result
    state.pendingQuestionKind = 'golden'
    state.phase = 'questionPause'
    hud.showQuestionModal({
      question: result.card.question,
      alternatives: result.alternatives,
      explanation: result.card.explanation,
      sourceUrl: result.card.sourceUrl,
      sourcesText: result.card.sourcesText,
      tags: result.card.tags,
      deck: result.card.deck,
      isFastRetry: !!result.card?._isFastRetry,
      onPick: (slot) => {
        settleGoldenBonus({
          type: slot === state.questionResult.correctSlot ? 'correct' : 'wrong',
          card: state.questionResult.card,
          timeBonus: 1.2,
          accuracyBonus: 1.2,
        })
      },
    })
  }

  function settleGoldenBonus(outcome) {
    hud.hideQuestionModal()
    const correct = outcome.type === 'correct'

    recordResult(session.history, outcome.card.guid, correct)
    saveHistory(session.history)
    menu.sessionResults.push({ guid: outcome.card.guid, correct })

    hud.setFeedback({
      correct,
      correctAnswer: outcome.card.answer,
      bonus: true,
      accuracyBonus: outcome.accuracyBonus,
    })
    if (!correct) {
      hud.showErrorFloat(`Errou! Resposta: ${outcome.card.answer}`)
    }

    state.pendingCardChoice = correct
    state.phase = 'goldenResolution'
    state.phaseTimer = correct ? 0 : WRONG_FEEDBACK_MS
  }

  function handleBossDefeated(hitWorldPos) {
    // Momento de impacto "Arcade Neon" (v0.73.0) — dispara IMEDIATAMENTE, antes da cutscene de
    // morte mais sedada abaixo (que já existia e continua intacta). Zera a cadeia de abates
    // junto, mesmo comportamento do protótipo de design aprovado pelo usuário.
    hud.showBossKO?.(BOSS_DEFEAT_BONUS)
    state.killChainCount = 0
    state.killChainTimer = 0
    hud.setBossFight(false)
    hud.setBossTint(false)
    combat.clearOtherEnemies()
    environment?.setFogProfile?.('bossDeath')
    state.deathCutsceneKind = 'boss'
    state.deathCutscenePos = hitWorldPos.clone()
    state.deathCutsceneOnDone = () => {
      session.score += BOSS_DEFEAT_BONUS
      rail.exitArena()
      environment?.setFogProfile?.(null)
      environment?.setSpawnDistanceExpectation?.(TRACK_MAX_SPAWN_DISTANCE)
      hud.setFeedback({
        correct: true,
        correctAnswer: '',
        points: BOSS_DEFEAT_BONUS,
        comboMultiplier: session.comboMultiplier,
        health: session.health,
      })
      state.pendingCardChoice = true
      state.phase = 'bossVictory'
      state.phaseTimer = FEEDBACK_MS
    }
    state.phase = 'deathCutscene'
    state.deathCutsceneTimer = BOSS_DEATH_CUTSCENE_MS
    state.deathCutsceneDurationMs = BOSS_DEATH_CUTSCENE_MS
  }

  function handleGoldenDefeated(hitWorldPos) {
    combat.clearOtherEnemies()
    environment?.setFogProfile?.('goldenDeath')
    state.deathCutsceneKind = 'golden'
    state.deathCutscenePos = hitWorldPos.clone()
    state.deathCutsceneOnDone = () => {
      exitGoldenArenaVisuals()
      enterGoldenAlternatives()
    }
    state.phase = 'deathCutscene'
    state.deathCutsceneTimer = 3400
    state.deathCutsceneDurationMs = 3400
  }

  return {
    startArenaCutscene,
    enterBossBuildup,
    triggerBossQuestion,
    settleBossBuildupQuestion,
    finishBossHunt,
    enterBossFight,
    enterGoldenArena,
    exitGoldenArenaVisuals,
    resumeCombatFromGolden,
    enterGoldenAlternatives,
    settleGoldenBonus,
    handleBossDefeated,
    handleGoldenDefeated,
  }
}
