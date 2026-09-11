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

export function buildCardsFromNotes(notes) {
  const clozePattern = /\{\{c\d+::/
  const cards = []
  for (const note of notes) {
    const clozeFieldIndex = note.fields.findIndex((f) => clozePattern.test(f))
    if (clozeFieldIndex !== -1) {
      const questions = extractClozeQuestions(note.fields[clozeFieldIndex])
      for (const q of questions) {
        cards.push({
          guid: note.guid,
          notetype: note.notetype,
          deck: note.deck,
          question: q.question,
          answer: q.answer,
          tags: note.tags,
          clozeIndex: q.index,
        })
      }
    } else {
      cards.push({
        guid: note.guid,
        notetype: note.notetype,
        deck: note.deck,
        question: cleanHtml(note.fields[0]),
        answer: cleanHtml(note.fields[1]),
        tags: note.tags,
        clozeIndex: null,
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

  const candidates = allCards.filter((c) => {
    if (c.guid === card.guid) return false
    const len = c.answer.length
    if (len < correctLen * 0.5 || len > correctLen * 1.5) return false
    return normalizeAnswer(c.answer) !== correctNorm
  })

  const sameType = candidates.filter((c) => c.notetype === card.notetype)
  const otherType = candidates.filter((c) => c.notetype !== card.notetype)

  const usedNorms = new Set([correctNorm])
  const picked = pickUnique(sameType, opts.count, usedNorms)
  if (picked.length < opts.count) {
    picked.push(...pickUnique(otherType, opts.count - picked.length, usedNorms))
  }
  return picked
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
