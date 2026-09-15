// flow-question.js
//
// Etapa 5 do overhaul de organização do main.js. Extrai o fluxo da pergunta NORMAL (não-chefe,
// não-dourado) + cartas roguelike: enterAlternatives (abre o modal de pergunta), settleQuestion
// (resolve acerto/erro e encadeia pra resolução/carta), enterCardChoice (modal de 3 cartas),
// applyRoguelikeCard (aplica uma carta escolhida) e buildCardExcludeSet (filtra cartas já no
// cap). Zero mudança de comportamento.
//
// forceAnswerOutcome NÃO mora aqui de propósito — é o único ponto que roteia pros dois fluxos
// (bossFlow pra chefe/dourado, questionFlow pro normal), então fica no main.js, onde os dois
// lados são visíveis juntos. Aqui só o que é estritamente "pergunta normal + carta roguelike".
//
// Padrão (mesmo de cutscenes.js e flow-boss.js): recebe `state` por referência e mexe direto
// nele, mais os deps de jogo (hud/combat/player) e os helpers de progressão que ainda vivem no
// main.js (applyDifficulty/applySpeedProgression — vão pra flow-progression.js na etapa 6).

import { nextQuestion, resolveAnswer } from './quiz.js'
import { recordResult, saveHistory } from './storage.js'
import { pickRandomCards } from './roguelike.js'
import { WRONG_FEEDBACK_MS } from './main-constants.js'

export function createQuestionFlow(deps) {
  const {
    state, session, deck, menu,
    hud, combat, player,
    // helpers ainda em main.js (etapa 6 vai extrair pra flow-progression.js):
    applyDifficulty, applySpeedProgression,
    // callbacks que voltam pro main.js:
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

  // Fase 6: pergunta normal também pausa tudo e usa o modal centralizado (mesmo modelo do
  // chefe, Fase 5) — não é mais "voa e atira nos 4 alvos flutuantes". pendingQuestionKind
  // marca qual settle function usar enquanto phase === 'questionPause' (normal ou dourado
  // compartilham a mesma fase de pausa).
  // v0.32: pergunta abre na hora que o ciclo termina — era precedida por uma fase 'recall' de
  // 3.5s (só mostrando o texto da pergunta, sem alternativas, sobra da mecânica antiga de
  // "voar e atirar") que o usuário reportou como "intervalo estranho depois que o jogo pausa".
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
    // v0.29.6: painel de feedback só pra acerto — erro vira um texto flutuante rápido
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

    // v0.51.0 — `resolution.sectorOver` removido (ver comentário em flow-boss.js).
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
