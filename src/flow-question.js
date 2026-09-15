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

    const outOfLives = applyHealthLoss()
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
