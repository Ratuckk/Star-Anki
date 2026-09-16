// flow-question.js
//
// Fluxo da pergunta NORMAL + cartas roguelike. Zero mudança de comportamento.

import { nextQuestion, resolveAnswer } from './quiz.js'
import { recordResult, saveHistory } from './storage.js'
import { pickRandomCards } from './roguelike.js'
import { WRONG_FEEDBACK_MS } from './main-constants.js'

export function createQuestionFlow(deps) {
  const {
    state, session, deck, menu,
    hud, combat, player,
    applyDifficulty, applySpeedProgression,
    applyHealthLoss, endSector,
  } = deps

  function applyRoguelikeCard(card) {
    player.applyCard(card)
    combat.setFireCooldown(player.config.fireCooldown)
    combat.setWingmanCount(player.getWingmanCount())
    hud.setLives(session.lives, player.getMaxLives())
    if (deps.effects && deps.rail && deps.effects.cardAcquiredPulse) {
      deps.effects.cardAcquiredPulse(deps.rail.getPlayerPosition(), card.category)
    }
    if (card.id === 'extra-life' && deps.effects?.extraLifeHeal && deps.rail) {
      deps.effects.extraLifeHeal(deps.rail.getPlayerPosition())
    }
    if (card.id === 'wingman' && deps.effects?.wingmanSpawn && deps.rail) {
      const positions = combat.getWingmanPositions?.()
      const pos = (positions && positions.length > 0) ? positions[positions.length - 1] : deps.rail.getPlayerPosition()
      deps.effects.wingmanSpawn(pos)
    }
  }

  function buildCardExcludeSet() {
    return player.buildCardExcludeSet()
  }

  function enterCardChoice(onDone) {
    const cards = pickRandomCards(3, buildCardExcludeSet())
    if (cards.length === 0) { onDone(); return }
    state.phase = 'cardChoice'
    hud.showCardChoice({
      cards,
      onPick: (card) => {
        applyRoguelikeCard(card)
        onDone()
      },
    })
  }

  function enterAlternatives() {
    const result = nextQuestion(session, deck.allCards)
    if (!result) {
      endSector()
      return
    }
    combat.clearBonusTargets()
    hud.setCountdown(null)
    hud.setFeedback(null)
    state.questionResult = result
    state.pendingQuestionKind = 'normal'
    state.phase = 'questionPause'
    hud.showQuestionModal({
      question: result.card.question,
      alternatives: result.alternatives,
      explanation: result.card.explanation,
      sourceUrl: result.card.sourceUrl,
      onPick: (slot) => {
        settleQuestion({
          type: slot === state.questionResult.correctSlot ? 'correct' : 'wrong',
          card: state.questionResult.card,
          timeBonus: 1.2,
          accuracyBonus: 1.2,
        })
      },
    })
  }

  function settleQuestion(outcome) {
    hud.hideQuestionModal()
    const resolution = resolveAnswer(session, outcome)
    applySpeedProgression(outcome.type)

    const correct = outcome.type === 'correct'
    if (!correct) applyDifficulty()

    recordResult(session.history, outcome.card.guid, correct)
    saveHistory(session.history)
    menu.sessionResults.push({ guid: outcome.card.guid, correct })

    hud.setBossActive(false)
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

    const prevLives = session.lives
    const outOfLives = applyHealthLoss()
    if (!outOfLives && session.lives < prevLives && deps.effects && deps.rail && deps.effects.respawnBurst) {
      deps.effects.respawnBurst(deps.rail.getPlayerPosition())
    }
    state.pendingSectorOver = outOfLives
    state.pendingCardChoice = correct
    state.phase = 'resolution'
    state.phaseTimer = correct ? 0 : WRONG_FEEDBACK_MS
  }

  return {
    applyRoguelikeCard,
    buildCardExcludeSet,
    enterCardChoice,
    enterAlternatives,
    settleQuestion,
  }
}
