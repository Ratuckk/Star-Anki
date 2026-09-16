function resolveSeparator(value) {
  const known = { tab: '\t', comma: ',', semicolon: ';', pipe: '|', space: ' ' }
  return known[value] ?? value
}

export function parseAnkiExport(text) {
  const lines = text.split(/\r\n|\r|\n/)
  const headerLines = lines.filter((l) => l.startsWith('#'))
  const dataLines = lines.filter((l) => l.length > 0 && !l.startsWith('#'))

  // separator guarda o caractere real (ex: '\t'), não a palavra crua do cabeçalho, pois split/join precisam dele
  const meta = {
    separator: '\t',
    html: false,
    guidCol: null,
    notetypeCol: null,
    deckCol: null,
    tagsCol: null,
  }

  const columnPattern = /^#(\w+)\s+column:(\d+)$/
  const simplePattern = /^#(\w+):(.*)$/
  for (const line of headerLines) {
    const columnMatch = line.match(columnPattern)
    if (columnMatch) {
      const [, name, num] = columnMatch
      meta[`${name}Col`] = Number(num)
      continue
    }
    const simpleMatch = line.match(simplePattern)
    if (simpleMatch) {
      const [, name, value] = simpleMatch
      if (name === 'separator') meta.separator = resolveSeparator(value)
      else if (name === 'html') meta.html = value === 'true'
    }
  }

  const specialCols = new Set([meta.guidCol, meta.notetypeCol, meta.deckCol, meta.tagsCol])
  const notes = dataLines.map((rawLine) => {
    const columns = rawLine.split(meta.separator)
    const fields = columns.filter((_, i) => !specialCols.has(i + 1))
    return {
      guid: columns[meta.guidCol - 1],
      notetype: columns[meta.notetypeCol - 1],
      deck: columns[meta.deckCol - 1],
      fields,
      tags: (columns[meta.tagsCol - 1] || '').split(/\s+/).filter(Boolean),
      rawLine,
    }
  })

  return { notes, meta }
}

export function cleanHtml(text) {
  let result = text.replace(/<br\s*\/?>/gi, ' ').replace(/<\/div>/gi, ' ')
  result = result.replace(/\[sound:[^\]]*\]/g, '').replace(/<img[^>]*>/gi, '')
  result = result.replace(/<[^>]+>/g, '')
  const entities = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" }
  result = result.replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;/g, (m) => entities[m])
  return result.replace(/\s+/g, ' ').trim()
}

export function extractClozeQuestions(rawFieldText) {
  const clozeRegex = /\{\{c(\d+)::([\s\S]*?)\}\}/g
  const matches = [...rawFieldText.matchAll(clozeRegex)]
  const indices = [...new Set(matches.map((m) => Number(m[1])))].sort((a, b) => a - b)

  return indices.map((index) => {
    const questionRaw = rawFieldText.replace(clozeRegex, (full, idxStr, inner) => {
      if (Number(idxStr) === index) return '_____'
      return inner.split('::')[0]
    })
    const answer = matches
      .filter((m) => Number(m[1]) === index)
      .map((m) => cleanHtml(m[2].split('::')[0]))
      .join('; ')
    return { index, question: cleanHtml(questionRaw), answer }
  })
}

export function extractSourceUrl(text) {
  if (!text) return null
  const match = text.match(/https?:\/\/[^\s"'<>)]+/)
  return match ? match[0] : null
}

export function resolveExplanationAndSources(extraFields) {
  if (!extraFields || extraFields.length === 0) return { explanation: '', sourceUrl: null, sourcesText: '' }
  let rawExplanation = ''
  let rawSources = ''

  if (extraFields.length >= 2) {
    rawExplanation = extraFields[0] || ''
    rawSources = extraFields[1] || ''
  } else if (extraFields.length === 1) {
    const single = (extraFields[0] || '').trim()
    if (single.startsWith('http://') || single.startsWith('https://')) {
      rawSources = single
    } else {
      rawExplanation = single
    }
  }

  const explanation = cleanHtml(rawExplanation)
  const sourceUrl = extractSourceUrl(rawSources) || extractSourceUrl(rawExplanation)
  const sourcesText = cleanHtml(rawSources)

  return { explanation, sourceUrl, sourcesText }
}

export function buildCardsFromNotes(notes) {
  const clozePattern = /\{\{c\d+::/
  const cards = []
  for (const note of notes) {
    const clozeFieldIndex = note.fields.findIndex((f) => clozePattern.test(f))
    if (clozeFieldIndex !== -1) {
      const questions = extractClozeQuestions(note.fields[clozeFieldIndex])
      const extraFields = note.fields.filter((f, idx) => idx !== clozeFieldIndex && f && f.trim().length > 0)
      const info = resolveExplanationAndSources(extraFields)
      for (const q of questions) {
        cards.push({
          guid: note.guid,
          notetype: note.notetype,
          deck: note.deck,
          question: q.question,
          answer: q.answer,
          tags: note.tags,
          clozeIndex: q.index,
          explanation: info.explanation,
          sourceUrl: info.sourceUrl,
          sourcesText: info.sourcesText,
        })
      }
    } else {
      const extraFields = note.fields.slice(2).filter((f) => f && f.trim().length > 0)
      const info = resolveExplanationAndSources(extraFields)
      cards.push({
        guid: note.guid,
        notetype: note.notetype,
        deck: note.deck,
        question: cleanHtml(note.fields[0] || ''),
        answer: cleanHtml(note.fields[1] || ''),
        tags: note.tags,
        clozeIndex: null,
        explanation: info.explanation,
        sourceUrl: info.sourceUrl,
        sourcesText: info.sourcesText,
      })
    }
  }
  return cards
}

export function triageCard(card, opts = { maxAnswerLength: 60 }) {
  return card.answer.length <= opts.maxAnswerLength ? 'shooter' : 'painel'
}

export function buildDeck(text, opts) {
  const { notes } = parseAnkiExport(text)
  const allCards = buildCardsFromNotes(notes)
  const shooterCards = []
  const painelCards = []
  for (const card of allCards) {
    if (triageCard(card, opts) === 'shooter') shooterCards.push(card)
    else painelCards.push(card)
  }
  const warning =
    shooterCards.length < 4
      ? `Baralho recusado para o modo shooter: apenas ${shooterCards.length} carta(s) com resposta curta (minimo 4).`
      : null
  return { shooterCards, painelCards, allCards, warning }
}

function normalizeAnswer(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .trim()
    .replace(/\s+/g, ' ')
}

function shuffle(array) {
  const result = [...array]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

// deduplica por texto normalizado para não gerar duas alternativas erradas iguais
function pickUnique(list, count, usedNorms) {
  const picked = []
  for (const c of shuffle(list)) {
    if (picked.length >= count) break
    const norm = normalizeAnswer(c.answer)
    if (usedNorms.has(norm)) continue
    usedNorms.add(norm)
    picked.push(c.answer)
  }
  return picked
}

export function generateDistractors(card, allCards, opts = { count: 3 }) {
  const correctLen = card.answer.length
  const correctNorm = normalizeAnswer(card.answer)
  const targetCount = opts.count ?? 3

  // Prioridade 1: candidatos do mesmo baralho com comprimento aproximado (±50%)
  const strictCandidates = allCards.filter((c) => {
    if (c.guid === card.guid) return false
    const len = c.answer.length
    if (len < correctLen * 0.5 || len > correctLen * 1.5) return false
    return normalizeAnswer(c.answer) !== correctNorm
  })

  // Prioridade 2: candidatos que compartilham tags (alta afinidade temática)
  const cardTags = new Set(card.tags || [])
  const tagCandidates = allCards.filter((c) => {
    if (c.guid === card.guid) return false
    if (normalizeAnswer(c.answer) === correctNorm) return false
    return (c.tags || []).some((t) => cardTags.has(t))
  })

  // Prioridade 3: qualquer outra carta do baralho
  const anyCandidates = allCards.filter((c) => {
    if (c.guid === card.guid) return false
    return normalizeAnswer(c.answer) !== correctNorm
  })

  const usedNorms = new Set([correctNorm])
  const picked = []

  // 1. Mesmo notetype + comprimento similar
  picked.push(...pickUnique(strictCandidates.filter((c) => c.notetype === card.notetype), targetCount - picked.length, usedNorms))

  // 2. Outro notetype + comprimento similar
  if (picked.length < targetCount) {
    picked.push(...pickUnique(strictCandidates.filter((c) => c.notetype !== card.notetype), targetCount - picked.length, usedNorms))
  }

  // 3. Mesma tag / tópico (coesão semântica)
  if (picked.length < targetCount) {
    picked.push(...pickUnique(tagCandidates, targetCount - picked.length, usedNorms))
  }

  // 4. Qualquer outra carta do baralho
  if (picked.length < targetCount) {
    picked.push(...pickUnique(anyCandidates, targetCount - picked.length, usedNorms))
  }

  // 5. Fallback temático caso o baralho seja muito curto
  if (picked.length < targetCount) {
    const contextualFallbacks = [
      'Memória Cache L2', 'Placa de Vídeo Dedicada', 'Barramento PCIe',
      'Controlador DMA', 'Fonte de Alimentação ATX', 'Chipset Ponte Sul',
      'Interface SATA III', 'Registrador de Estado (FLAGS)', 'Memória ROM Flash',
      'Unidade de Controle (UC)', 'Módulo DDR4 SDRAM', 'Arranjo RAID 5',
      'Microprocessador CISC', 'Barramento de Controle', 'Circuito Integrado',
    ]
    for (const fb of shuffle(contextualFallbacks)) {
      if (picked.length >= targetCount) break
      const norm = normalizeAnswer(fb)
      if (usedNorms.has(norm)) continue
      usedNorms.add(norm)
      picked.push(fb)
    }
  }

  return picked
}

// Fase 9 (ideia de baralho, item 2): filtra um baralho já construído por tags do Anki
// (`card.tags`, já vem nativo do export — nenhuma sintaxe nova precisou ser inventada). Usado
// pelo gerenciador de baralhos quando o jogador marca 1+ "assunto" antes de jogar.
export function filterDeckByTags(built, tags) {
  const tagSet = new Set(tags)
  const matches = (c) => c.tags.some((t) => tagSet.has(t))
  const shooterCards = built.shooterCards.filter(matches)
  const painelCards = built.painelCards.filter(matches)
  const allCards = built.allCards.filter(matches)
  const warning = shooterCards.length < 4
    ? `Filtro deixou poucas perguntas de combate (${shooterCards.length}, mínimo 4) — remova algum assunto marcado.`
    : null
  return { shooterCards, painelCards, allCards, warning }
}

export function exportTagsTsv(originalText, results) {
  const lines = originalText.split(/\r\n|\r|\n/)
  const headerLines = lines.filter((l) => l.startsWith('#'))
  const { notes, meta } = parseAnkiExport(originalText)
  const notesByGuid = new Map(notes.map((n) => [n.guid, n]))

  const outputLines = results.map(({ guid, correct }) => {
    const note = notesByGuid.get(guid)
    const targetTag = correct ? 'jogo::acertei' : 'jogo::errei'
    const oppositeTag = correct ? 'jogo::errei' : 'jogo::acertei'
    const newTags = note.tags.filter((t) => t !== oppositeTag)
    if (!newTags.includes(targetTag)) newTags.push(targetTag)

    const columns = note.rawLine.split(meta.separator)
    columns[meta.tagsCol - 1] = newTags.join(' ')
    return columns.join(meta.separator)
  })

  return [...headerLines, ...outputLines].join('\n')
}
