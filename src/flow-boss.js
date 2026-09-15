// flow-boss.js
//
// Fluxo do CHEFE (caçada de orbes → invocação → luta → vitória) e do DOURADO (arena →
// pergunta-bônus → volta ao combate), mais a cutscene de transição (startArenaCutscene) que
// ambos compartilham e os dois handlers de "chefe morreu / dourado morreu". Zero mudança de
// comportamento em relação ao código que vivia inline no main.js.

import {
  BOSS_BASE_HP, BOSS_HP_PER_ERROR, BOSS_BUILDUP_MS, BOSS_HUNT_BONUS_MS,
  BOSS_QUESTION_COUNT, BOSS_DEFEAT_BONUS, BOSS_SUMMON_CUTSCENE_MS,
  ARENA_CUTSCENE_MS, FEEDBACK_MS, WRONG_FEEDBACK_MS,
  GOLDEN_SPREAD_MIN, GOLDEN_SPREAD_MAX,
  DEATH_CUTSCENE_MS,
} from './main-constants.js'
import { nextQuestion, resolveAnswer, pickBonusCard, buildBonusQuestion } from './quiz.js'
import { recordResult, saveHistory } from './storage.js'

export function createBossFlow(deps) {
  const {
    state, session, deck, menu,
    camera, hud, combat, rail,
    applyDifficulty, applyBossDifficulty, applySpeedProgression,
    currentBossSpread, currentBossExtraEnemies,
    randomGoldenInterval,
    applyHealthLoss, endSector,
  } = deps

  function startArenaCutscene(kind, onDone, durationMs = ARENA_CUTSCENE_MS) {
    state.phase = 'arenaCutscene'
    state.arenaCutsceneTimer = durationMs
    state.arenaCutsceneDurationMs = durationMs
    state.arenaCutsceneOnDone = onDone
    state.arenaCutsceneBaseCameraPos = camera.position.clone()
    state.arenaCutsceneBaseForward = rail.getFrameAt(0).forward.clone()
    state.arenaCutsceneBaseRight = rail.getFrameAt(0).right.clone()
    hud.setArenaWarning(null)
    hud.setCountdown(null)
    hud.setArenaCutscene(kind)
    combat.clearArenaPreview()
  }

  function enterBossBuildup() {
    state.phase = 'bossBuildup'
    state.bossBuildupTimer = BOSS_BUILDUP_MS
    state.bossHealthBonus = 0
    state.bossOrbsRemaining = BOSS_QUESTION_COUNT
    state.questionResult = null
    rail.enterArena()
    hud.setBossActive(true, state.bossOrbsRemaining)
    hud.setCountdown(null)
    for (let i = 0; i < currentBossExtraEnemies(); i += 1) combat.spawnEnemy()
    combat.spawnBossOrbs(BOSS_QUESTION_COUNT, currentBossSpread())
  }

  function triggerBossQuestion() {
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

    if (correct) {
      hud.setFeedback({
        correct: true,
        correctAnswer: outcome.card.answer,
        points: resolution.points,
        comboMultiplier: resolution.comboMultiplier,
        health: resolution.healthRemaining,
        accuracyBonus: outcome.accuracyBonus,
      })
    } else {
      hud.showErrorFloat('Errou!')
    }

    const outOfLives = applyHealthLoss()
    if (outOfLives) {
      state.pendingSectorOver = true
      state.pendingCardChoice = false
      state.phase = 'resolution'
      state.phaseTimer = correct ? 0 : WRONG_FEEDBACK_MS
      return
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
    const bossHp = BOSS_BASE_HP + state.bossHealthBonus
    combat.spawnBossEnemy(bossHp)
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
    combat.spawnGoldenSpecial({ distanceMin: GOLDEN_SPREAD_MIN, distanceMax: GOLDEN_SPREAD_MAX })
    hud.setGoldenActive(true)
  }

  function exitGoldenArenaVisuals() {
    rail.exitArena()
    combat.clearGoldenTargets()
    hud.setGoldenActive(false)
  }

  function resumeCombatFromGolden() {
    state.phase = 'combat'
    rail.setAdvancing(true)
    state.goldenTimer = randomGoldenInterval()
    hud.setFeedback(null)
  }

  function enterGoldenAlternatives() {
    state.goldenCard = pickBonusCard(deck, session)
    const result = buildBonusQuestion(state.goldenCard, deck.allCards)
    state.questionResult = result
    state.pendingQuestionKind = 'golden'
    state.phase = 'questionPause'
    hud.showQuestionModal({
      question: result.card.question,
      alternatives: result.alternatives,
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

    if (correct) {
      hud.setFeedback({
        correct: true,
        correctAnswer: outcome.card.answer,
        bonus: true,
        accuracyBonus: outcome.accuracyBonus,
      })
    } else {
      hud.showErrorFloat('Errou!')
    }

    state.pendingCardChoice = correct
    state.phase = 'goldenResolution'
    state.phaseTimer = correct ? 0 : WRONG_FEEDBACK_MS
  }

  function handleBossDefeated(hitWorldPos) {
    hud.setBossFight(false)
    hud.setBossTint(false)
    combat.clearOtherEnemies()
    state.deathCutscenePos = hitWorldPos.clone()
    state.deathCutsceneOnDone = () => {
      session.score += BOSS_DEFEAT_BONUS
      rail.exitArena()
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
    state.deathCutsceneTimer = DEATH_CUTSCENE_MS
  }

  function handleGoldenDefeated(hitWorldPos) {
    combat.clearOtherEnemies()
    state.deathCutscenePos = hitWorldPos.clone()
    state.deathCutsceneOnDone = () => {
      exitGoldenArenaVisuals()
      enterGoldenAlternatives()
    }
    state.phase = 'deathCutscene'
    state.deathCutsceneTimer = DEATH_CUTSCENE_MS
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
