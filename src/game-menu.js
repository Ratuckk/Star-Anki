import { buildDeck, exportTagsTsv, parseAnkiExport, filterDeckByTags } from './anki.js'
import { createSession, getSummary, createPainelSession, nextPainelCard, resolvePainel } from './quiz.js'
import { loadHistory, saveHistory, recordResult } from './storage.js'
import { getDeck, buildMergedDeck, buildReviewDeck, REVIEW_DECK_ID, NO_DECK_ID, buildNoDeckVirtual } from './decks.js'
import { getSettings } from './settings.js'
import { showPreGameMenu, showDeckManager, showSettingsScreen, showSectorEnd, showPainelCard, showPainelAnswer } from './hud.js'

// Extraído de main.js (refatoração de organização, zero mudança de comportamento): todo o
// fluxo de menu/baralho/prática de painel — roda ANTES e DEPOIS de uma partida, sem nenhuma
// dependência do loop de jogo em si (tick()). `mountGameFn` é injetado por quem chama
// (main.js define mountGame) pra evitar import circular entre este arquivo e main.js — o
// próprio mountGame também recebe de volta um pouco de estado daqui (`deck`, `sessionResults`,
// `renderEndScreen`) via o 2º/3º parâmetro, porque endSector() precisa mostrar a tela de fim.
export function createGameMenu(mountGameFn) {
  let deck = null
  let deckTexts = []
  let currentDeckIds = null
  let history = loadHistory()
  let sessionResults = []
  let painelDone = false

  function handlePlayNoDeck() {
    currentDeckIds = NO_DECK_ID
    deck = buildNoDeckVirtual()
    deckTexts = []
    sessionResults = []
    painelDone = true
    startGame()
  }

  // tagFilter (Fase 9, ideia de baralho "tags/categorias"): guids de assunto marcados no
  // gerenciador de baralhos — vazio joga o baralho inteiro, igual sempre foi.
  function handlePlayDeck(deckId, tagFilter = []) {
    if (deckId === NO_DECK_ID) {
      handlePlayNoDeck()
      return
    }
    let built
    let text = null
    if (deckId === REVIEW_DECK_ID) {
      // Fase 9 (ideia de baralho "revisão automática"): baralho virtual, recalculado na hora a
      // partir do histórico — nunca fica obsoleto, e não existe texto original pra exportar tags.
      built = buildReviewDeck(history)
      if (!built) return
    } else {
      const entry = getDeck(deckId)
      if (!entry) return
      text = entry.text
      built = buildDeck(text)
      if (built.warning) return
      if (tagFilter.length > 0) {
        built = filterDeckByTags(built, tagFilter)
        if (built.warning) return
      }
    }

    currentDeckIds = deckId
    deck = built
    deckTexts = text ? [text] : []
    sessionResults = []
    painelDone = false
    startGame()
  }

  function handlePlayMergedDecks(deckIds) {
    const merged = buildMergedDeck(deckIds)
    if (merged.error) return

    currentDeckIds = deckIds
    deck = merged.built
    deckTexts = merged.texts
    sessionResults = []
    painelDone = false
    startGame()
  }

  // ponto único que chama mountGameFn — deck/sessionResults/renderEndScreen são o que o loop de
  // jogo precisa de volta daqui (ver comentário no topo do arquivo)
  function startGame() {
    const settings = getSettings()
    const session = createSession(deck, { history, startingHealth: settings.startingHealth })
    mountGameFn(session, deck, {
      sessionResults,
      renderEndScreen,
      startingWingmen: settings.startingWingmen || 0,
    })
  }

  function restart() {
    deck = null
    deckTexts = []
    showPreGameMenu({
      onPlay: () => showDeckManager({ onPlay: handlePlayDeck, onPlayMerged: handlePlayMergedDecks, onBack: restart, history }),
      onPlayNoDeck: handlePlayNoDeck,
      onAddDeck: () => showDeckManager({ onPlay: handlePlayDeck, onPlayMerged: handlePlayMergedDecks, onBack: restart, startInAdd: true, history }),
      onSettings: () => showSettingsScreen({ onBack: restart }),
    })
  }

  function playAgain() {
    if (currentDeckIds === NO_DECK_ID || deck?.isNoDeck) handlePlayNoDeck()
    else if (Array.isArray(currentDeckIds)) handlePlayMergedDecks(currentDeckIds)
    else if (currentDeckIds) handlePlayDeck(currentDeckIds)
    else restart()
  }

  function renderEndScreen(summary) {
    const practiceAvailable = !painelDone && deck.painelCards && deck.painelCards.length > 0
    const missedAvailable = summary.missed && summary.missed.length > 0
    showSectorEnd({
      summary,
      onPlayAgain: playAgain,
      practiceCount: practiceAvailable ? deck.painelCards.length : 0,
      onPractice: practiceAvailable ? () => startPainelPractice(summary) : null,
      onPracticeMissed: missedAvailable ? () => startMissedPractice(summary) : null,
      onExportTags: downloadTagsExport,
    })
  }

  function startMissedPractice(summary) {
    if (!summary.missed || summary.missed.length === 0) return
    const missedGuids = new Set(summary.missed.map((m) => m.guid))
    const cardsToPractice = deck.allCards.filter((c) => missedGuids.has(c.guid))
    const list = cardsToPractice.length > 0 ? cardsToPractice : summary.missed
    const session = createPainelSession(list)
    let revealed = false

    function onKeyDown(e) {
      const card = nextPainelCard(session)
      if (!card) return
      if (!revealed && (e.code === 'Enter' || e.code === 'Space')) {
        e.preventDefault()
        reveal(card)
      } else if (revealed && e.code === 'Digit1') {
        assess(card, true)
      } else if (revealed && e.code === 'Digit2') {
        assess(card, false)
      }
    }
    window.addEventListener('keydown', onKeyDown)

    function renderCard() {
      const card = nextPainelCard(session)
      if (!card) {
        window.removeEventListener('keydown', onKeyDown)
        renderEndScreen(summary)
        return
      }
      revealed = false
      showPainelCard({
        index: session.pointer,
        total: session.queue.length,
        question: card.question,
        onReveal: () => reveal(card),
      })
    }

    function reveal(card) {
      revealed = true
      showPainelAnswer({
        index: session.pointer,
        total: session.queue.length,
        question: card.question,
        answer: card.answer,
        onAssess: (correct) => assess(card, correct),
      })
    }

    function assess(card, correct) {
      history = recordResult(history, card.guid, correct)
      saveHistory(history)
      sessionResults.push({ guid: card.guid, correct })
      resolvePainel(session, correct)
      renderCard()
    }

    renderCard()
  }

  function startPainelPractice(summary) {
    const ordered = [...deck.painelCards].sort((a, b) => (history[b.guid]?.erros ?? 0) - (history[a.guid]?.erros ?? 0))
    const session = createPainelSession(ordered)
    let revealed = false

    function onKeyDown(e) {
      const card = nextPainelCard(session)
      if (!card) return
      if (!revealed && (e.code === 'Enter' || e.code === 'Space')) {
        e.preventDefault()
        reveal(card)
      } else if (revealed && e.code === 'Digit1') {
        assess(card, true)
      } else if (revealed && e.code === 'Digit2') {
        assess(card, false)
      }
    }
    window.addEventListener('keydown', onKeyDown)

    function renderCard() {
      const card = nextPainelCard(session)
      if (!card) {
        window.removeEventListener('keydown', onKeyDown)
        painelDone = true
        renderEndScreen(summary)
        return
      }
      revealed = false
      showPainelCard({
        index: session.pointer,
        total: session.queue.length,
        question: card.question,
        onReveal: () => reveal(card),
      })
    }

    function reveal(card) {
      revealed = true
      showPainelAnswer({
        index: session.pointer,
        total: session.queue.length,
        question: card.question,
        answer: card.answer,
        onAssess: (correct) => assess(card, correct),
      })
    }

    function assess(card, correct) {
      history = recordResult(history, card.guid, correct)
      saveHistory(history)
      sessionResults.push({ guid: card.guid, correct })
      resolvePainel(session, correct)
      renderCard()
    }

    renderCard()
  }

  function downloadTagsExport() {
    deckTexts.forEach((text, i) => {
      const { notes } = parseAnkiExport(text)
      const guidsHere = new Set(notes.map((n) => n.guid))
      const resultsHere = sessionResults.filter((r) => guidsHere.has(r.guid))
      if (resultsHere.length === 0) return

      const tsv = exportTagsTsv(text, resultsHere)
      const blob = new Blob([tsv], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = deckTexts.length > 1 ? `star-anki-tags-${i + 1}.txt` : 'star-anki-tags.txt'
      link.click()
      URL.revokeObjectURL(url)
    })
  }

  return { restart }
}
