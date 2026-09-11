const COLOR_MAP = { azul: '#4da6ff', 'âmbar': '#ffb84d', magenta: '#ff4dd2', ciano: '#4dfff2' }

function shapeMarkup(shape, hex) {
  const attrs = 'width="28" height="28" viewBox="0 0 100 100" aria-hidden="true"'
  if (shape === 'octaedro') return `<svg ${attrs}><polygon points="50,5 95,50 50,95 5,50" fill="${hex}"/></svg>`
  if (shape === 'cubo') return `<svg ${attrs}><rect x="15" y="15" width="70" height="70" fill="${hex}"/></svg>`
  if (shape === 'tetraedro') return `<svg ${attrs}><polygon points="50,10 90,90 10,90" fill="${hex}"/></svg>`
  if (shape === 'icosaedro') return `<svg ${attrs}><circle cx="50" cy="50" r="42" fill="${hex}"/></svg>`
  return ''
}

function showScreen(name) {
  document.getElementById('load-screen').hidden = name !== 'load'
  document.getElementById('game-screen').hidden = name !== 'game'
  document.getElementById('sector-end-screen').hidden = name !== 'end'
  document.getElementById('painel-screen').hidden = name !== 'painel'
}

// opts.savedDeck: quando presente, mostra a seção de "baralho salvo" no topo da tela de
// carregamento. Dois formatos aceitos:
//   { valid: true, text, deckNames, shooterCount, painelCount }  → botão "Usar baralho salvo" ativo
//   { valid: false, text }                                        → só aviso + botão "Esquecer"
// opts.onForget: callback ao clicar em "Esquecer" (limpa o localStorage e re-renderiza)
export function showLoadScreen(onLoad, opts = {}) {
  showScreen('load')
  const fileInput = document.getElementById('file-input')
  const textarea = document.getElementById('paste-textarea')
  const btn = document.getElementById('load-btn')
  const message = document.getElementById('load-message')

  const savedSection = document.getElementById('saved-deck-section')
  const savedInfo = document.getElementById('saved-deck-info')
  const savedUseBtn = document.getElementById('saved-deck-use-btn')
  const savedForgetBtn = document.getElementById('saved-deck-forget-btn')
  const separator = document.getElementById('load-separator')

  fileInput.value = ''
  textarea.value = ''
  message.textContent = ''

  const saved = opts.savedDeck
  if (saved) {
    savedSection.hidden = false
    separator.hidden = false
    savedSection.classList.toggle('invalid', !saved.valid)

    if (saved.valid) {
      const shooter = saved.shooterCount
      const painel = saved.painelCount
      savedInfo.textContent = `${saved.deckNames} — ${shooter} pergunta${shooter === 1 ? '' : 's'} de combate · ${painel} de painel`
      savedUseBtn.hidden = false
      savedUseBtn.onclick = () => onLoad(saved.text)
    } else {
      savedInfo.textContent = 'O baralho salvo não passou na validação (talvez tenha sido corrompido ou esteja com menos de 4 cartas curtas). Recarregue um arquivo abaixo.'
      savedUseBtn.hidden = true
    }

    savedForgetBtn.onclick = () => {
      if (typeof opts.onForget === 'function') opts.onForget()
    }
  } else {
    savedSection.hidden = true
    separator.hidden = true
  }

  btn.onclick = () => {
    message.textContent = ''
    const file = fileInput.files[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = () => onLoad(String(reader.result))
      reader.readAsText(file)
      return
    }
    const pasted = textarea.value.trim()
    if (!pasted) {
      message.textContent = 'Selecione um arquivo .txt ou cole o texto exportado.'
      return
    }
    onLoad(pasted)
  }
}

export function showWarning(message) {
  document.getElementById('load-message').textContent = message
}

export function createGameHud() {
  showScreen('game')
  const root = document.getElementById('game-screen')
  root.innerHTML = ''

  const sceneRoot = document.createElement('div')
  sceneRoot.id = 'scene-root'
  root.appendChild(sceneRoot)

  // vinheta de dano: overlay fullscreen com gradiente vermelho nas bordas. Fica em opacity 0
  // e ganha a classe .flash por 0.5s quando o jogador toma um hit (main.js chama damageFlash()).
  const damageVignette = document.createElement('div')
  damageVignette.className = 'hud-damage-vignette'
  root.appendChild(damageVignette)

  const reticle = document.createElement('div')
  reticle.className = 'reticle'
  reticle.innerHTML = '<div class="reticle-ring"></div>'
  root.appendChild(reticle)

  const status = document.createElement('div')
  status.className = 'hud-status'
  root.appendChild(status)

  const healthBar = document.createElement('div')
  healthBar.className = 'hud-health-bar'
  root.appendChild(healthBar)
  let healthPips = []
  let healthPipsMax = null

  const question = document.createElement('p')
  question.className = 'hud-question'
  question.hidden = true
  root.appendChild(question)

  const legend = document.createElement('div')
  legend.className = 'hud-legend'
  legend.hidden = true
  root.appendChild(legend)

  const feedback = document.createElement('div')
  feedback.className = 'hud-feedback'
  feedback.hidden = true
  root.appendChild(feedback)

  const countdown = document.createElement('div')
  countdown.className = 'hud-countdown'
  countdown.hidden = true
  root.appendChild(countdown)

  const bossBanner = document.createElement('div')
  bossBanner.className = 'hud-boss-banner'
  bossBanner.textContent = 'MODO CHEFE — VOO LIVRE: ENCONTRE A RESPOSTA'
  bossBanner.hidden = true
  root.appendChild(bossBanner)

  const goldenBanner = document.createElement('div')
  goldenBanner.className = 'hud-golden-banner'
  goldenBanner.textContent = 'ALVO DOURADO ESPECIAL — CAÇA LIVRE'
  goldenBanner.hidden = true
  root.appendChild(goldenBanner)

  const pause = document.createElement('div')
  pause.className = 'hud-pause'
  pause.textContent = 'Pausado'
  pause.hidden = true
  root.appendChild(pause)

  return {
    sceneRoot,

    setStatus({ shields, maxShields = shields, score, combo }) {
      status.textContent = `Pontos: ${Math.round(score)} · Combo x${combo.toFixed(2)}`

      if (maxShields !== healthPipsMax) {
        healthPipsMax = maxShields
        healthBar.innerHTML = ''
        healthPips = Array.from({ length: maxShields }, () => {
          const pip = document.createElement('div')
          pip.className = 'hud-health-pip'
          healthBar.appendChild(pip)
          return pip
        })
      }
      healthPips.forEach((pip, i) => pip.classList.toggle('filled', i < shields))
    },

    setQuestion(text) {
      question.hidden = text == null
      question.textContent = text ?? ''
    },

    setAlternatives(alternatives) {
      legend.hidden = alternatives == null
      legend.innerHTML = ''
      if (!alternatives) return
      alternatives.forEach((alt, i) => {
        const hex = COLOR_MAP[alt.color] ?? '#ffffff'
        const item = document.createElement('div')
        item.className = 'hud-legend-item'
        item.style.borderColor = hex
        item.innerHTML = `${shapeMarkup(alt.shape, hex)}<span class="hud-legend-text">${i + 1}. ${alt.text}</span>`
        legend.appendChild(item)
      })
    },

    setFeedback(data) {
      feedback.hidden = data == null
      feedback.innerHTML = ''
      if (!data) return

      const result = document.createElement('p')
      result.className = data.correct ? 'feedback correct' : 'feedback wrong'
      result.textContent = data.bonus
        ? (data.correct ? 'Bônus dourado: acertou!' : 'Bônus dourado: errou (sem penalidade).')
        : (data.correct ? 'Acertou!' : 'Errou.')
      feedback.appendChild(result)

      if (!data.correct) {
        const answer = document.createElement('p')
        answer.className = 'feedback-answer'
        answer.textContent = `Resposta correta: ${data.correctAnswer}`
        feedback.appendChild(answer)
      }

      const stats = document.createElement('p')
      stats.className = 'feedback-stats'
      stats.textContent = data.bonus
        ? (data.correct ? 'Buff de arma reforçado!' : 'Sem efeito na partida.')
        : `+${Math.round(data.points)} pontos · combo x${data.comboMultiplier.toFixed(2)} · vida ${data.shields}`
      feedback.appendChild(stats)
    },

    setPaused(paused) {
      pause.hidden = !paused
    },

    setCountdown(n, urgent) {
      countdown.hidden = n == null
      countdown.textContent = n == null ? '' : String(n)
      countdown.classList.toggle('urgent', !!urgent)
    },

    setBossActive(active) {
      bossBanner.hidden = !active
    },

    setGoldenActive(active) {
      goldenBanner.hidden = !active
    },

    // flash vermelho nas bordas quando o jogador toma dano. Reinicia a animação CSS a cada
    // chamada: remove a classe, força reflow, readiciona — sem isso, dois hits seguidos em
    // menos de 0.5s não reiniciariam o pulso visual.
    damageFlash() {
      damageVignette.classList.remove('flash')
      void damageVignette.offsetWidth
      damageVignette.classList.add('flash')
    },

    setReticlePosition(xFrac, yFrac) {
      reticle.style.left = `${xFrac * 100}%`
      reticle.style.top = `${yFrac * 100}%`
    },

    unmount() {
      root.innerHTML = ''
    },
  }
}

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
