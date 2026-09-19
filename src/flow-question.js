// flow-question.js
//
// Fluxo da pergunta NORMAL + cartas roguelike. Zero mudança de comportamento.

import { nextQuestion, resolveAnswer } from './quiz.js'
import { recordResult, saveHistory } from './storage.js'
import { pickRandomCards } from './roguelike.js'
import { WRONG_FEEDBACK_MS } from './main-constants.js'

// Cartas "Vínculo" → id do piloto (mesma ordem de WINGMAN_PROFILES em combat/wingmen.js:
// 0 Falco, 1 Peppy, 2 Slippy, 3 Krystal).
const WINGMAN_ABILITY_CARD_PROFILE_ID = {
  'wingman-ram-cooldown': 0,
  'wingman-guard-cooldown': 1,
  'wingman-repair-cooldown': 2,
  'wingman-assist-cooldown': 3,
}

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
    if (card.id in WINGMAN_ABILITY_CARD_PROFILE_ID && combat.applyWingmanAbilityCard) {
      combat.applyWingmanAbilityCard(WINGMAN_ABILITY_CARD_PROFILE_ID[card.id])
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
      stats: {
        health: session.health,
        maxHealth: player.getMaxHealth ? player.getMaxHealth() : 10,
        shield: player.getShieldValue ? player.getShieldValue() : 3,
        maxShield: player.getShieldMax ? player.getShieldMax() : 3,
        projectileCount: player.config?.projectileCount || 1,
        homingTargets: player.config?.homingMaxTargets || 1,
        wingmanCount: player.getWingmanCount ? player.getWingmanCount() : 0,
      },
      collectedCards: player.getCollectedCards ? player.getCollectedCards() : new Map(),
      onPick: (card) => {
        applyRoguelikeCard(card)
        onDone()
      },
    })
  }

  function enterAlternatives() {
    if (deck?.isNoDeck) {
      combat.clearBonusTargets()
      hud.setCountdown(null)
      hud.setFeedback(null)
      state.pendingCardChoice = false
      state.phase = 'cardChoice'
      enterCardChoice(() => {
        session.pointer = (session.pointer + 1) % session.queue.length
        deps.enterCombat?.()
      })
      return
    }

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
      sourcesText: result.card.sourcesText,
      tags: result.card.tags,
      deck: result.card.deck,
      isFastRetry: !!result.card?._isFastRetry,
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
    // Sempre alimentar o HUD com a resposta correta para o painel de explicação
    hud.setFeedback({
      correct,
      correctAnswer: outcome.card.answer,
      points: correct ? resolution.points : 0,
      comboMultiplier: correct ? resolution.comboMultiplier : session.comboMultiplier,
      health: correct ? resolution.healthRemaining : session.health,
      accuracyBonus: outcome.accuracyBonus,
    })
    const prevLives = session.lives
    const outOfLives = applyHealthLoss()
    if (!outOfLives && session.lives < prevLives && deps.effects && deps.rail && deps.effects.respawnBurst) {
      deps.effects.respawnBurst(deps.rail.getPlayerPosition())
    }

    if (outOfLives) {
      endSector()
      return
    }

    if (correct) {
      // Pedido 10: instantâneo, o jogo não despausa após acertar a pergunta
      state.pendingCardChoice = false
      state.phase = 'cardChoice'
      enterCardChoice(() => {
        if (deps.enterCombat) deps.enterCombat()
        else {
          state.phase = 'combat'
          hud.setFeedback(null)
          hud.setCountdown(null)
        }
      })
    } else {
      // Pedido 16: ao errar, jogo permanece pausado por 5s ou até o jogador apertar Espaço
      hud.showErrorFloat(`Errou! Resposta: ${outcome.card.answer}`)
      state.pendingCardChoice = false
      state.phase = 'wrongPause'
      state.phaseTimer = 5000
    }
  }

  return {
    applyRoguelikeCard,
    buildCardExcludeSet,
    enterCardChoice,
    enterAlternatives,
    settleQuestion,
  }
}
