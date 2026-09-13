import { showScreen } from './hud-shared.js'

// Extraído de hud.js na refatoração que separa cada tela em seu próprio arquivo. Zero mudança
// de comportamento.
export function showSectorEnd({ summary, onPlayAgain, practiceCount = 0, onPractice, onExportTags }) {
  showScreen('end')
  const root = document.getElementById('sector-end-screen')
  root.innerHTML = ''

  const title = document.createElement('h2')
  title.textContent = 'Setor concluído'
  root.appendChild(title)

  const stats = document.createElement('p')
  stats.textContent = `Pontuação: ${Math.round(summary.totalScore)} · Acertos: ${summary.correctCount} · Erros: ${summary.wrongCount}`
  root.appendChild(stats)

  if (summary.missed.length > 0) {
    const list = document.createElement('ul')
    list.className = 'missed-list'
    summary.missed.forEach((m) => {
      const li = document.createElement('li')
      li.textContent = `${m.question} — ${m.answer}`
      list.appendChild(li)
    })
    root.appendChild(list)
  }

  if (practiceCount > 0) {
    const practiceBtn = document.createElement('button')
    practiceBtn.textContent = `Praticar ${practiceCount} card${practiceCount === 1 ? '' : 's'} de resposta longa`
    practiceBtn.addEventListener('click', onPractice)
    root.appendChild(practiceBtn)
  }

  const exportBtn = document.createElement('button')
  exportBtn.textContent = 'Baixar tags atualizadas (.txt)'
  exportBtn.addEventListener('click', onExportTags)
  root.appendChild(exportBtn)

  const btn = document.createElement('button')
  btn.textContent = 'Jogar novamente'
  btn.addEventListener('click', onPlayAgain)
  root.appendChild(btn)
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
