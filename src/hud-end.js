import { showScreen } from './hud-shared.js'

// Extraído de hud.js na refatoração que separa cada tela em seu próprio arquivo. Zero mudança
// de comportamento.
export function showSectorEnd({ summary, onPlayAgain, practiceCount = 0, onPractice, onPracticeMissed = null, onExportTags }) {
  showScreen('end')
  const root = document.getElementById('sector-end-screen')
  root.innerHTML = ''

  // Container principal estruturado
  const container = document.createElement('div')
  container.className = 'end-screen-container'
  root.appendChild(container)

  // 1. Cabeçalho
  const badge = document.createElement('div')
  badge.className = 'end-screen-badge'
  badge.textContent = 'RELATÓRIO TÁTICO // DADOS DA MISSÃO'
  container.appendChild(badge)

  const title = document.createElement('h2')
  title.className = 'end-screen-title'
  title.textContent = 'Fim de Jogo'
  container.appendChild(title)

  // 2. Grid de Métricas
  const totalAnswered = summary.correctCount + summary.wrongCount
  const accuracyPct = totalAnswered > 0 ? Math.round((summary.correctCount / totalAnswered) * 100) : 100

  const metricsGrid = document.createElement('div')
  metricsGrid.className = 'end-metrics-grid'
  metricsGrid.innerHTML = `
    <div class="end-metric-card">
      <span class="end-metric-icon">🏆</span>
      <div class="end-metric-val">${Math.round(summary.totalScore)}</div>
      <div class="end-metric-lbl">Pontuação Total</div>
    </div>
    <div class="end-metric-card">
      <span class="end-metric-icon">🎯</span>
      <div class="end-metric-val">${accuracyPct}%</div>
      <div class="end-metric-lbl">Precisão Anki</div>
    </div>
    <div class="end-metric-card highlight-green">
      <span class="end-metric-icon">✅</span>
      <div class="end-metric-val">${summary.correctCount}</div>
      <div class="end-metric-lbl">Acertos</div>
    </div>
    <div class="end-metric-card highlight-red">
      <span class="end-metric-icon">❌</span>
      <div class="end-metric-val">${summary.wrongCount}</div>
      <div class="end-metric-lbl">Erros</div>
    </div>
  `
  container.appendChild(metricsGrid)

  // 3. Códice de Revisão de Erros
  if (summary.missed && summary.missed.length > 0) {
    const codexSection = document.createElement('div')
    codexSection.className = 'end-codex-section'

    const codexHeader = document.createElement('div')
    codexHeader.className = 'end-codex-header'
    codexHeader.innerHTML = `
      <div class="end-codex-title-wrap">
        <h3 class="end-codex-title">📖 Códice de Revisão dos Erros (${summary.missed.length})</h3>
        <p class="end-codex-desc">Revise o conceito geral e as fontes de cada card com erro antes de iniciar a próxima surtida.</p>
      </div>
    `
    codexSection.appendChild(codexHeader)

    const list = document.createElement('div')
    list.className = 'end-missed-list'

    summary.missed.forEach((m, idx) => {
      const cardEl = document.createElement('div')
      cardEl.className = 'end-missed-card'

      const hasExpl = Boolean(m.explanation && m.explanation.trim().length > 0)
      const hasSource = Boolean(m.sourceUrl || m.sourcesText)

      let sourceLinkHtml = ''
      if (m.sourceUrl) {
        const label = m.sourceUrl.length > 50 ? m.sourceUrl.slice(0, 47) + '...' : m.sourceUrl
        sourceLinkHtml = `<a class="end-codex-source-link" href="${m.sourceUrl}" target="_blank" rel="noopener noreferrer">🔗 ${label}</a>`
      }
      if (m.sourcesText && m.sourcesText !== m.sourceUrl) {
        sourceLinkHtml += `<div class="end-codex-source-citation">${m.sourcesText}</div>`
      }

      cardEl.innerHTML = `
        <div class="end-missed-top">
          <span class="end-missed-tag">${m.deck || m.tags || 'Estudo'}</span>
          <span class="end-missed-num">#${idx + 1}</span>
        </div>
        <div class="end-missed-question">${m.question}</div>
        <div class="end-missed-answer">
          <span class="end-ans-check">✓ Resposta Correta:</span>
          <span class="end-ans-text">${m.answer}</span>
        </div>
        ${(hasExpl || hasSource) ? `
          <button type="button" class="end-expl-toggle-btn">
            <span class="btn-icon">💡</span> Ver Explicação & Fontes <span class="arrow">▾</span>
          </button>
          <div class="end-expl-drawer" hidden>
            ${hasExpl ? `
              <div class="end-expl-block">
                <div class="end-expl-label">💡 Conceito / Explicação:</div>
                <div class="end-expl-text">${m.explanation}</div>
              </div>
            ` : ''}
            ${hasSource ? `
              <div class="end-expl-block">
                <div class="end-expl-label">📚 Fonte Bibliográfica:</div>
                <div class="end-expl-sources">${sourceLinkHtml}</div>
              </div>
            ` : ''}
          </div>
        ` : ''}
      `

      if (hasExpl || hasSource) {
        const toggleBtn = cardEl.querySelector('.end-expl-toggle-btn')
        const drawer = cardEl.querySelector('.end-expl-drawer')
        const arrow = cardEl.querySelector('.arrow')
        toggleBtn.addEventListener('click', () => {
          drawer.hidden = !drawer.hidden
          arrow.textContent = drawer.hidden ? '▾' : '▴'
          toggleBtn.classList.toggle('active', !drawer.hidden)
        })
      }

      list.appendChild(cardEl)
    })

    codexSection.appendChild(list)

    if (onPracticeMissed) {
      const practiceMissedBtn = document.createElement('button')
      practiceMissedBtn.className = 'btn-practice-missed'
      practiceMissedBtn.innerHTML = `<span>🔁</span> Reforçar Cards Errados Agora (${summary.missed.length})`
      practiceMissedBtn.addEventListener('click', onPracticeMissed)
      codexSection.appendChild(practiceMissedBtn)
    }

    container.appendChild(codexSection)
  }

  // 4. Ações Principais
  const actionsWrap = document.createElement('div')
  actionsWrap.className = 'end-actions-wrap'

  const playAgainBtn = document.createElement('button')
  playAgainBtn.className = 'btn-primary-play'
  playAgainBtn.innerHTML = `<span>🚀</span> Jogar Novamente`
  playAgainBtn.addEventListener('click', onPlayAgain)
  actionsWrap.appendChild(playAgainBtn)

  if (practiceCount > 0 && onPractice) {
    const practiceBtn = document.createElement('button')
    practiceBtn.className = 'btn-secondary'
    practiceBtn.textContent = `Praticar ${practiceCount} card${practiceCount === 1 ? '' : 's'} de resposta longa`
    practiceBtn.addEventListener('click', onPractice)
    actionsWrap.appendChild(practiceBtn)
  }

  const exportBtn = document.createElement('button')
  exportBtn.className = 'btn-secondary'
  exportBtn.textContent = 'Baixar tags atualizadas (.txt)'
  exportBtn.addEventListener('click', onExportTags)
  actionsWrap.appendChild(exportBtn)

  container.appendChild(actionsWrap)
}

export function showPainelCard({ index, total, question, onReveal }) {
  showScreen('painel')
  const root = document.getElementById('painel-screen')
  root.innerHTML = ''

  const progress = document.createElement('p')
  progress.className = 'painel-progress'
  progress.textContent = `Card ${index + 1} de ${total}`
  root.appendChild(progress)

  const q = document.createElement('p')
  q.className = 'painel-question'
  q.textContent = question
  root.appendChild(q)

  const btn = document.createElement('button')
  btn.textContent = 'Revelar (Enter/Espaço)'
  btn.addEventListener('click', onReveal)
  root.appendChild(btn)
}

export function showPainelAnswer({ index, total, question, answer, onAssess }) {
  showScreen('painel')
  const root = document.getElementById('painel-screen')
  root.innerHTML = ''

  const progress = document.createElement('p')
  progress.className = 'painel-progress'
  progress.textContent = `Card ${index + 1} de ${total}`
  root.appendChild(progress)

  const q = document.createElement('p')
  q.className = 'painel-question'
  q.textContent = question
  root.appendChild(q)

  const a = document.createElement('p')
  a.className = 'painel-answer'
  a.textContent = answer
  root.appendChild(a)

  const actions = document.createElement('div')
  actions.className = 'painel-actions'

  const correctBtn = document.createElement('button')
  correctBtn.textContent = 'Acertei (1)'
  correctBtn.addEventListener('click', () => onAssess(true))
  actions.appendChild(correctBtn)

  const wrongBtn = document.createElement('button')
  wrongBtn.textContent = 'Errei (2)'
  wrongBtn.addEventListener('click', () => onAssess(false))
  actions.appendChild(wrongBtn)

  root.appendChild(actions)
}
