import { readFileSync, writeFileSync } from 'node:fs'

function patch(path, from, to, label) {
  const src = readFileSync(path, 'utf8')
  if (!src.includes(from)) throw new Error(`${path}: trecho ausente (${label})`)
  if (src.split(from).length - 1 !== 1) throw new Error(`${path}: trecho não é único (${label})`)
  writeFileSync(path, src.replace(from, to))
}

// 1 — rail: API pública referenciava uma variável inexistente e lançava ReferenceError quando lida.
patch(
  'src/rail.js',
  `    getFullSpinAngle: () => fullSpinAngle,\n`,
  `    getFullSpinAngle: () => fullSpinT < 1 ? fullSpinT * Math.PI * 2 * fullSpinDir : 0,\n`,
  'getFullSpinAngle indefinido',
)

// 2 — quiz/menu: prática de Cloze precisa preservar a identidade guid+pergunta, não expandir todo GUID.
patch(
  'src/quiz.js',
  `export function getSummary(session) {\n`,
  `export function selectMissedPracticeCards(allCards, missed) {\n  if (!Array.isArray(missed) || missed.length === 0) return []\n  const cardKey = (card) => card?.guid ? \`${'${card.guid}::${card.question}'}\` : card?.question\n  const wanted = new Set(missed.map(cardKey).filter(Boolean))\n  const exact = Array.isArray(allCards) ? allCards.filter((card) => wanted.has(cardKey(card))) : []\n  // O resumo já carrega question/answer/explanation; fallback mantém a prática disponível mesmo\n  // se o baralho de origem foi alterado entre o fim da run e a abertura da revisão.\n  return exact.length > 0 ? exact : missed\n}\n\nexport function getSummary(session) {\n`,
  'helper de prática exata',
)

patch(
  'src/game-menu.js',
  `import { createSession, getSummary, createPainelSession, nextPainelCard, resolvePainel } from './quiz.js'\n`,
  `import { createSession, getSummary, createPainelSession, nextPainelCard, resolvePainel, selectMissedPracticeCards } from './quiz.js'\n`,
  'import prática exata',
)
patch(
  'src/game-menu.js',
  `  let currentDeckIds = null\n  let history = loadHistory()\n`,
  `  let currentDeckIds = null\n  let currentTagFilter = []\n  let history = loadHistory()\n`,
  'estado de filtro atual',
)
patch(
  'src/game-menu.js',
  `    currentDeckIds = NO_DECK_ID\n    deck = buildNoDeckVirtual()\n`,
  `    currentDeckIds = NO_DECK_ID\n    currentTagFilter = []\n    deck = buildNoDeckVirtual()\n`,
  'reset filtro arcade',
)
patch(
  'src/game-menu.js',
  `    currentDeckIds = deckId\n    deck = built\n`,
  `    currentDeckIds = deckId\n    currentTagFilter = [...tagFilter]\n    deck = built\n`,
  'preserva filtro de tags',
)
patch(
  'src/game-menu.js',
  `    currentDeckIds = deckIds\n    deck = merged.built\n`,
  `    currentDeckIds = deckIds\n    currentTagFilter = []\n    deck = merged.built\n`,
  'reset filtro merge',
)
patch(
  'src/game-menu.js',
  `    else if (currentDeckIds) handlePlayDeck(currentDeckIds)\n`,
  `    else if (currentDeckIds) handlePlayDeck(currentDeckIds, currentTagFilter)\n`,
  'replay mantém filtro',
)
patch(
  'src/game-menu.js',
  `    const missedGuids = new Set(summary.missed.map((m) => m.guid))\n    const cardsToPractice = deck.allCards.filter((c) => missedGuids.has(c.guid))\n    const list = cardsToPractice.length > 0 ? cardsToPractice : summary.missed\n`,
  `    const list = selectMissedPracticeCards(deck.allCards, summary.missed)\n`,
  'prática Cloze exata',
)

// 3 — export de tags é por NOTA Anki (GUID), então não pode produzir linhas duplicadas/conflitantes.
patch(
  'src/anki.js',
  `  const outputLines = results.map(({ guid, correct }) => {\n    const note = notesByGuid.get(guid)\n    const targetTag = correct ? 'jogo::acertei' : 'jogo::errei'\n    const oppositeTag = correct ? 'jogo::errei' : 'jogo::acertei'\n    const newTags = note.tags.filter((t) => t !== oppositeTag)\n    if (!newTags.includes(targetTag)) newTags.push(targetTag)\n\n    const columns = note.rawLine.split(meta.separator)\n    columns[meta.tagsCol - 1] = newTags.join(' ')\n    return columns.join(meta.separator)\n  })\n\n  return [...headerLines, ...outputLines].join('\\n')\n`,
  `  if (!Number.isInteger(meta.tagsCol) || meta.tagsCol < 1) return [...headerLines].join('\\n')\n\n  // Tags do Anki pertencem à nota, não ao card Cloze. Agrega por GUID e deixa \"errei\" vencer\n  // se qualquer tentativa daquela nota falhou na sessão; isso evita duas linhas do mesmo GUID\n  // com tags conflitantes e preserva para revisão qualquer nota que teve ao menos um tropeço.\n  const outcomeByGuid = new Map()\n  for (const result of results || []) {\n    if (!result?.guid || !notesByGuid.has(result.guid)) continue\n    const previous = outcomeByGuid.get(result.guid)\n    const correct = result.correct === true\n    outcomeByGuid.set(result.guid, previous === undefined ? correct : previous && correct)\n  }\n\n  const outputLines = []\n  for (const [guid, correct] of outcomeByGuid) {\n    const note = notesByGuid.get(guid)\n    const targetTag = correct ? 'jogo::acertei' : 'jogo::errei'\n    const oppositeTag = correct ? 'jogo::errei' : 'jogo::acertei'\n    const newTags = note.tags.filter((t) => t !== oppositeTag)\n    if (!newTags.includes(targetTag)) newTags.push(targetTag)\n\n    const columns = note.rawLine.split(meta.separator)\n    columns[meta.tagsCol - 1] = newTags.join(' ')\n    outputLines.push(columns.join(meta.separator))\n  }\n\n  return [...headerLines, ...outputLines].join('\\n')\n`,
  'dedupe exportTagsTsv',
)

// 4 — áudio: one-shot/loop que aborta ou dá erro depois de começar precisa sair dos registries.
patch(
  'src/audio.js',
  `    if (cue.loop) {\n      const loopTailMs = Number(cue.loopTailMs)\n      if (Number.isFinite(loopTailMs) && loopTailMs > 0) {\n        audio.loop = false\n        const onEnded = () => {\n          const entry = activeLoops.get(cue.id)\n          if (!entry || entry.audio !== audio || disposed) return\n          audio.currentTime = getLoopTailRestartTime(audio.duration, loopTailMs, cue.durationMs)\n          audio.play().catch(() => removeLoopEntry(cue.id, audio))\n        }\n        audio.addEventListener('ended', onEnded)\n        activeLoops.set(cue.id, { audio, cleanup: () => audio.removeEventListener('ended', onEnded) })\n      } else {\n        audio.loop = true\n        activeLoops.set(cue.id, { audio, cleanup: null })\n      }\n    } else {\n      activeOneShots.add(audio)\n      audio.addEventListener('ended', () => activeOneShots.delete(audio), { once: true })\n    }\n\n    audio.play().catch(() => {\n      activeOneShots.delete(audio)\n      if (cue.loop) removeLoopEntry(cue.id, audio)\n    })\n`,
  `    if (cue.loop) {\n      const loopTailMs = Number(cue.loopTailMs)\n      const onMediaFailure = () => removeLoopEntry(cue.id, audio)\n      if (Number.isFinite(loopTailMs) && loopTailMs > 0) {\n        audio.loop = false\n        const onEnded = () => {\n          const entry = activeLoops.get(cue.id)\n          if (!entry || entry.audio !== audio || disposed) return\n          audio.currentTime = getLoopTailRestartTime(audio.duration, loopTailMs, cue.durationMs)\n          audio.play().catch(onMediaFailure)\n        }\n        audio.addEventListener('ended', onEnded)\n        audio.addEventListener('error', onMediaFailure)\n        audio.addEventListener('abort', onMediaFailure)\n        activeLoops.set(cue.id, {\n          audio,\n          cleanup: () => {\n            audio.removeEventListener('ended', onEnded)\n            audio.removeEventListener('error', onMediaFailure)\n            audio.removeEventListener('abort', onMediaFailure)\n          },\n        })\n      } else {\n        audio.loop = true\n        audio.addEventListener('error', onMediaFailure)\n        audio.addEventListener('abort', onMediaFailure)\n        activeLoops.set(cue.id, {\n          audio,\n          cleanup: () => {\n            audio.removeEventListener('error', onMediaFailure)\n            audio.removeEventListener('abort', onMediaFailure)\n          },\n        })\n      }\n    } else {\n      activeOneShots.add(audio)\n      const cleanupOneShot = () => {\n        activeOneShots.delete(audio)\n        audio.removeEventListener('ended', cleanupOneShot)\n        audio.removeEventListener('error', cleanupOneShot)\n        audio.removeEventListener('abort', cleanupOneShot)\n      }\n      audio.addEventListener('ended', cleanupOneShot)\n      audio.addEventListener('error', cleanupOneShot)\n      audio.addEventListener('abort', cleanupOneShot)\n    }\n\n    audio.play().catch(() => {\n      activeOneShots.delete(audio)\n      if (cue.loop) removeLoopEntry(cue.id, audio)\n    })\n`,
  'cleanup de mídia falha',
)

// 5 — controles alterados durante a pausa precisam atualizar o input já montado.
patch(
  'src/keybindings.js',
  `function commitBindings(bindings) {\n  cachedBindings = sanitizeBindings(bindings)\n  writeStored(cachedBindings)\n  return cloneBindings(cachedBindings)\n}\n`,
  `function commitBindings(bindings) {\n  cachedBindings = sanitizeBindings(bindings)\n  writeStored(cachedBindings)\n  const snapshot = cloneBindings(cachedBindings)\n  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') {\n    window.dispatchEvent(new CustomEvent('star-anki:keybindings-changed', { detail: snapshot }))\n  }\n  return snapshot\n}\n`,
  'evento de rebind',
)

// Torna estruturas do input reatribuíveis e reconstrói os maps/sets quando o editor salva.
for (const [from, to, label] of [
  [`  const bindings = getBindings()\n`, `  let bindings = getBindings()\n`, 'bindings mutável'],
  [`  const keyMap = {}\n`, `  let keyMap = {}\n`, 'keyMap mutável'],
  [`  const leftCodes = new Set(bindings.actions.moveLeft)\n`, `  let leftCodes = new Set(bindings.actions.moveLeft)\n`, 'leftCodes mutável'],
  [`  const rightCodes = new Set(bindings.actions.moveRight)\n`, `  let rightCodes = new Set(bindings.actions.moveRight)\n`, 'rightCodes mutável'],
  [`  const upCodes = new Set(bindings.actions.moveUp)\n`, `  let upCodes = new Set(bindings.actions.moveUp)\n`, 'upCodes mutável'],
  [`  const downCodes = new Set(bindings.actions.moveDown)\n`, `  let downCodes = new Set(bindings.actions.moveDown)\n`, 'downCodes mutável'],
  [`  const fireCodes = new Set(bindings.actions.fire)\n`, `  let fireCodes = new Set(bindings.actions.fire)\n`, 'fireCodes mutável'],
  [`  const dodgeLeftCodes = new Set(bindings.actions.dodgeLeft)\n`, `  let dodgeLeftCodes = new Set(bindings.actions.dodgeLeft)\n`, 'dodgeLeftCodes mutável'],
  [`  const dodgeRightCodes = new Set(bindings.actions.dodgeRight)\n`, `  let dodgeRightCodes = new Set(bindings.actions.dodgeRight)\n`, 'dodgeRightCodes mutável'],
  [`  const propulsionCodes = new Set(bindings.actions.propulsion)\n`, `  let propulsionCodes = new Set(bindings.actions.propulsion)\n`, 'propulsionCodes mutável'],
  [`  const repulsionCodes = new Set(bindings.actions.repulsion)\n`, `  let repulsionCodes = new Set(bindings.actions.repulsion)\n`, 'repulsionCodes mutável'],
  [`  const edgeCodeSet = edgeCodes(bindings)\n`, `  let edgeCodeSet = edgeCodes(bindings)\n`, 'edgeCodeSet mutável'],
  [`  const gp = bindings.gamepad\n`, `  let gp = bindings.gamepad\n`, 'gamepad mutável'],
]) patch('src/input.js', from, to, label)

patch(
  'src/input.js',
  `  function onKeyDown(e) {\n    if (isTypingTarget(e)) return\n    if (edgeCodeSet.has(e.code) && !keys.has(e.code)) pressedThisFrame.add(e.code)\n    keys.add(e.code)\n`,
  `  function onKeyDown(e) {\n    if (isTypingTarget(e)) return\n    if (edgeCodeSet.has(e.code) && !keys.has(e.code)) {\n      pressedThisFrame.add(e.code)\n      // Acrescenta também o ID lógico da ação. Assim consumidores que nasceram antes de um\n      // rebind (ex.: game-loop durante a pausa) não dependem do código físico antigo.\n      for (const actionId of GAMEPAD_EDGE_ACTIONS) {\n        if (bindings.actions[actionId]?.includes(e.code)) pressedThisFrame.add(actionId)\n      }\n    }\n    keys.add(e.code)\n`,
  'edge lógico de teclado',
)
patch(
  'src/input.js',
  `  function onVisibilityChange() {\n    if (document.hidden) clearKeys()\n  }\n\n  window.addEventListener('keydown', onKeyDown)\n`,
  `  function onVisibilityChange() {\n    if (document.hidden) clearKeys()\n  }\n\n  function refreshBindings(event) {\n    bindings = event?.detail || getBindings()\n    keyMap = {}\n    for (const code of bindings.actions.moveLeft) keyMap[code] = [-1, 0]\n    for (const code of bindings.actions.moveRight) keyMap[code] = [1, 0]\n    for (const code of bindings.actions.moveUp) keyMap[code] = [0, 1]\n    for (const code of bindings.actions.moveDown) keyMap[code] = [0, -1]\n    leftCodes = new Set(bindings.actions.moveLeft)\n    rightCodes = new Set(bindings.actions.moveRight)\n    upCodes = new Set(bindings.actions.moveUp)\n    downCodes = new Set(bindings.actions.moveDown)\n    fireCodes = new Set(bindings.actions.fire)\n    dodgeLeftCodes = new Set(bindings.actions.dodgeLeft)\n    dodgeRightCodes = new Set(bindings.actions.dodgeRight)\n    propulsionCodes = new Set(bindings.actions.propulsion)\n    repulsionCodes = new Set(bindings.actions.repulsion)\n    edgeCodeSet = edgeCodes(bindings)\n    gp = bindings.gamepad\n    clearKeys()\n    prevPadButtons = {}\n  }\n\n  window.addEventListener('keydown', onKeyDown)\n`,
  'refresh live bindings',
)
patch(
  'src/input.js',
  `  window.addEventListener('blur', clearKeys)\n  document.addEventListener('visibilitychange', onVisibilityChange)\n`,
  `  window.addEventListener('blur', clearKeys)\n  window.addEventListener('star-anki:keybindings-changed', refreshBindings)\n  document.addEventListener('visibilitychange', onVisibilityChange)\n`,
  'listener live bindings',
)
patch(
  'src/input.js',
  `      window.removeEventListener('blur', clearKeys)\n      document.removeEventListener('visibilitychange', onVisibilityChange)\n`,
  `      window.removeEventListener('blur', clearKeys)\n      window.removeEventListener('star-anki:keybindings-changed', refreshBindings)\n      document.removeEventListener('visibilitychange', onVisibilityChange)\n`,
  'cleanup live bindings',
)

// 6 — exclusão persistida precisa informar falha em vez de parecer que funcionou.
patch(
  'src/hud-decks.js',
  `      removeDeck(d.id)\n      render()\n`,
  `      const result = removeDeck(d.id)\n      if (result?.error) { window.alert(result.error); return }\n      render()\n`,
  'erro ao excluir card de deck',
)
patch(
  'src/hud-decks.js',
  `      removeDeck(editingId)\n      view = 'list'\n`,
  `      const result = removeDeck(editingId)\n      if (result?.error) { message.textContent = result.error; return }\n      view = 'list'\n`,
  'erro ao excluir edição de deck',
)

console.log('apply-bughunt-fixes-v09932.mjs: OK')
