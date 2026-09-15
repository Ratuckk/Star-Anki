import { getBindings } from './keybindings.js'
import { DEBUG_ACTIONS } from './debug.js'
import { CARD_CATEGORY_LABEL } from './roguelike.js'
import { COLOR_MAP, shapeMarkup, showScreen } from './hud-shared.js'
import { injectHudExtraStyles } from './hud-styles.js'

// Extraído de hud.js na refatoração que separa cada tela em seu próprio arquivo. Zero mudança
// de comportamento. `createGameHud` continua sendo uma closure única — todos os métodos abaixo
// compartilham o mesmo `root`/pools de elementos, então não faz sentido dividir mais que isso
// (dividir a closure em vários arquivos ia exigir passar estado por parâmetro ou virar classe,
// mais risco de regressão do que ganho).
//
// v0.51.0 (fix de vazamento): todos os setTimeout que agendam remoção de DOM passam por
// `scheduleTimeout()` e são limpos em bloco pelo `unmount()`. Antes, cada setTimeout vivia por
// conta própria — um HUD remontado num novo jogo antes do próximo timeout vencer via os
// callbacks dispararem em nós órfãos (sem crash, mas vazava entre sessões). Além disso,
// `playFocusCollapse` virou cancelável: se o modal fosse fechado durante os ~350ms da animação
// de convergência (chefe morrendo no mesmo frame do trigger, debug forçando outcome), o
// setTimeout do collapse reabria o modal sozinho depois do overlay já escondido.
export function createGameHud() {
  injectHudExtraStyles()

  showScreen('game')
  const root = document.getElementById('game-screen')
  root.innerHTML = ''

  const sceneRoot = document.createElement('div')
  sceneRoot.id = 'scene-root'
  root.appendChild(sceneRoot)

  // ============ CAMADAS VISUAIS (ordem importa) ============
  const boostDistortion = document.createElement('div')
  boostDistortion.className = 'hud-boost-distortion'
  root.appendChild(boostDistortion)

  const motionLines = document.createElement('div')
  motionLines.className = 'hud-motion-lines'
  root.appendChild(motionLines)

  const lowHealthVignette = document.createElement('div')
  lowHealthVignette.className = 'hud-low-health-vignette'
  root.appendChild(lowHealthVignette)

  const damageVignette = document.createElement('div')
  damageVignette.className = 'hud-damage-vignette'
  root.appendChild(damageVignette)

  const bossTint = document.createElement('div')
  bossTint.className = 'hud-boss-tint'
  root.appendChild(bossTint)

  const sideFlash = document.createElement('div')
  sideFlash.className = 'hud-side-flash'
  root.appendChild(sideFlash)

  // ============ MIRA + HIT MARKER ============
  const reticle = document.createElement('div')
  reticle.className = 'reticle'
  reticle.innerHTML = '<div class="reticle-ring"></div>'
  root.appendChild(reticle)
  const reticleRing = reticle.querySelector('.reticle-ring')

  const hitMarkerEl = document.createElement('div')
  hitMarkerEl.className = 'hit-marker'
  hitMarkerEl.innerHTML = '<span></span><span></span>'
  reticle.appendChild(hitMarkerEl)

  let hitMarkerTimeout = null

  // ============ TIMEOUTS PENDENTES (fix de vazamento — ver comentário do topo) ============
  // Set único de tudo que agenda DOM-removal por tempo: damage numbers, hit marker, absorb
  // beam, focus collapse, error float. `unmount()` limpa em bloco. `focusCollapse` precisa de
  // referência direta (não só estar no Set) porque o `hideQuestionModal` tem que abortar a
  // animação caso o jogador saia do estado antes dela terminar — por isso os dois `let`
  // dedicados abaixo, além da entrada no Set.
  const pendingTimeouts = new Set()
  let focusCollapseTimeout = null
  let focusCollapseContainer = null

  function scheduleTimeout(fn, ms) {
    const id = setTimeout(() => {
      pendingTimeouts.delete(id)
      fn()
    }, ms)
    pendingTimeouts.add(id)
    return id
  }

  function cancelTimeout(id) {
    if (id == null) return
    clearTimeout(id)
    pendingTimeouts.delete(id)
  }

  function cancelFocusCollapse() {
    cancelTimeout(focusCollapseTimeout)
    focusCollapseTimeout = null
    if (focusCollapseContainer) {
      focusCollapseContainer.remove()
      focusCollapseContainer = null
    }
  }

  const status = document.createElement('div')
  status.className = 'hud-status'
  root.appendChild(status)

  // ============ HORIZONTE ARTIFICIAL (Fase 9, ideia all-range 2) ============
  // só visível no modo all-range — ajuda a não perder a noção de "pra cima" (main.js chama
  // setHorizon(null) fora do all-range pra esconder). Linha de céu/chão que gira com o roll e
  // desloca verticalmente com o pitch, dentro de um recorte circular.
  const horizon = document.createElement('div')
  horizon.className = 'hud-horizon'
  horizon.hidden = true
  horizon.innerHTML = '<div class="hud-horizon-line"></div>'
  root.appendChild(horizon)
  const horizonLine = horizon.querySelector('.hud-horizon-line')

  const livesBar = document.createElement('div')
  livesBar.className = 'hud-lives-bar'
  root.appendChild(livesBar)
  let livePips = []
  let livePipsMax = null

  const shieldBar = document.createElement('div')
  shieldBar.className = 'hud-bar-wrap hud-shield-wrap'
  root.appendChild(shieldBar)
  const shieldFill = document.createElement('div')
  shieldFill.className = 'hud-bar-fill hud-shield-fill'
  shieldBar.appendChild(shieldFill)

  const healthBar = document.createElement('div')
  healthBar.className = 'hud-bar-wrap hud-health-wrap'
  root.appendChild(healthBar)
  const healthFill = document.createElement('div')
  healthFill.className = 'hud-bar-fill hud-health-fill'
  healthBar.appendChild(healthFill)

  const boostBar = document.createElement('div')
  boostBar.className = 'hud-bar-wrap hud-boost-wrap'
  root.appendChild(boostBar)
  const boostFill = document.createElement('div')
  boostFill.className = 'hud-bar-fill hud-boost-fill'
  boostBar.appendChild(boostFill)
  let prevBoostCharge = 1

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
  bossBanner.hidden = true
  root.appendChild(bossBanner)

  const goldenBanner = document.createElement('div')
  goldenBanner.className = 'hud-golden-banner'
  goldenBanner.textContent = 'ALVO DOURADO ESPECIAL — CAÇA LIVRE'
  goldenBanner.hidden = true
  root.appendChild(goldenBanner)

  // ============ AVISO + CUTSCENE DE TRANSIÇÃO PRO ALL-RANGE MODE (Fase 5) ============
  const arenaWarning = document.createElement('div')
  arenaWarning.className = 'hud-arena-warning'
  arenaWarning.hidden = true
  root.appendChild(arenaWarning)

  const arenaCutsceneOverlay = document.createElement('div')
  arenaCutsceneOverlay.className = 'hud-arena-cutscene'
  arenaCutsceneOverlay.textContent = 'Transicionando para o modo All-Range...'
  arenaCutsceneOverlay.hidden = true
  root.appendChild(arenaCutsceneOverlay)

  // ============ MODAL DE PERGUNTA (chefe: pausa total ao acertar um orbe) ============
  const questionModalOverlay = document.createElement('div')
  questionModalOverlay.className = 'question-modal-overlay'
  questionModalOverlay.hidden = true
  root.appendChild(questionModalOverlay)
  const questionModalTitle = document.createElement('h3')
  questionModalTitle.className = 'question-modal-title'
  questionModalOverlay.appendChild(questionModalTitle)
  const questionModalList = document.createElement('div')
  questionModalList.className = 'question-modal-list'
  questionModalOverlay.appendChild(questionModalList)

  const bossFightBar = document.createElement('div')
  bossFightBar.className = 'hud-boss-fight-bar'
  bossFightBar.hidden = true
  root.appendChild(bossFightBar)
  const bossFightLabel = document.createElement('div')
  bossFightLabel.className = 'hud-boss-fight-label'
  bossFightLabel.textContent = 'CHEFE'
  bossFightBar.appendChild(bossFightLabel)
  const bossFightTrack = document.createElement('div')
  bossFightTrack.className = 'hud-boss-fight-track'
  bossFightBar.appendChild(bossFightTrack)
  const bossFightFill = document.createElement('div')
  bossFightFill.className = 'hud-boss-fight-fill'
  bossFightTrack.appendChild(bossFightFill)

  const minimap = document.createElement('div')
  minimap.className = 'hud-minimap'
  minimap.hidden = true
  root.appendChild(minimap)
  const minimapPlayer = document.createElement('div')
  minimapPlayer.className = 'hud-minimap-player'
  minimap.appendChild(minimapPlayer)
  const minimapBlipPool = new Map()

  const pause = document.createElement('div')
  pause.className = 'hud-pause'
  pause.textContent = 'Pausado'
  pause.hidden = true
  root.appendChild(pause)

  const cardChoiceOverlay = document.createElement('div')
  cardChoiceOverlay.className = 'card-choice-overlay'
  cardChoiceOverlay.hidden = true
  root.appendChild(cardChoiceOverlay)

  const cardChoiceTitle = document.createElement('h3')
  cardChoiceTitle.textContent = 'Acertou! Escolha um upgrade'
  cardChoiceOverlay.appendChild(cardChoiceTitle)

  const cardChoiceList = document.createElement('div')
  cardChoiceList.className = 'card-choice-list'
  cardChoiceOverlay.appendChild(cardChoiceList)

  const debugPanel = document.createElement('div')
  debugPanel.className = 'debug-panel'
  debugPanel.hidden = true
  root.appendChild(debugPanel)

  const debugHeading = document.createElement('h4')
  debugHeading.textContent = 'Debug'
  debugPanel.appendChild(debugHeading)

  const debugHint = document.createElement('p')
  debugHint.className = 'debug-hint'
  debugHint.textContent = 'Crase (`) para abrir/fechar'
  debugPanel.appendChild(debugHint)

  const debugButtons = {}
  for (const action of DEBUG_ACTIONS) {
    const btn = document.createElement('button')
    btn.textContent = action.label
    debugPanel.appendChild(btn)
    debugButtons[action.id] = btn
  }

  // handler do keydown 1–4 do modal de pergunta — guardado pra remover quando o modal fecha
  // (evita listener órfão se o modal abrir/fechar várias vezes, ou se `hideQuestionModal` for
  // chamado de fora sem ter passado pelo clique)
  let questionModalKeyHandler = null
  // mesma ideia, pra tela de escolha de carta roguelike (pedido do usuário: selecionar as
  // cartas pelos números também, igual já funciona na pergunta)
  let cardChoiceKeyHandler = null
  // função de parar (cancela o rAF) do watcher de controle de cada modal — mesmo padrão dos
  // handlers de teclado acima, só que via polling em vez de evento
  let questionModalGpStop = null
  let cardChoiceGpStop = null

  // suporte a controle genérico pra escolher um dos N slots (pergunta ou carta): como não existe
  // "keydown" de gamepad, poll a cada rAF enquanto o modal estiver aberto e dispara onSlot(i) na
  // borda de subida do botão mapeado pra quizSlot{i+1} nas Configurações (reusa os mesmos binds
  // já usados pro teclado 1-4 — vazio por padrão até o jogador mapear um botão)
  function watchGamepadSlots(count, onSlot) {
    let raf = null
    let prevPressed = {}
    function poll() {
      const pads = navigator.getGamepads ? navigator.getGamepads() : []
      const pad = [...pads].find(Boolean)
      if (pad) {
        const bindings = getBindings()
        const currPressed = {}
        pad.buttons.forEach((b, i) => { currPressed[i] = !!b?.pressed })
        for (let i = 0; i < count; i += 1) {
          const idxs = bindings.gamepad.buttons[`quizSlot${i + 1}`] || []
          const rising = idxs.some((bi) => currPressed[bi] && !prevPressed[bi])
          if (rising) {
            stop()
            onSlot(i)
            return
          }
        }
        prevPressed = currPressed
      }
      raf = requestAnimationFrame(poll)
    }
    function stop() {
      if (raf) cancelAnimationFrame(raf)
      raf = null
    }
    poll()
    return stop
  }

  // Fase 9 (ideia visual 4, bloco 1): "facho de absorção" — uma partícula de luz viajando do
  // card escolhido até a nave (aproximada pelo centro-baixo da tela) no instante da escolha,
  // reforçando "esse upgrade entrou em mim" antes do overlay fechar. Puramente DOM/CSS — a
  // escolha em si já fecha o overlay logo em seguida, então isso só precisa sobreviver ~400ms.
  function cardAbsorbBeam(rect) {
    const startX = rect.left + rect.width / 2
    const startY = rect.top + rect.height / 2
    const el = document.createElement('div')
    el.className = 'card-absorb-beam'
    el.style.left = `${startX}px`
    el.style.top = `${startY}px`
    el.style.setProperty('--tx', `${window.innerWidth * 0.5 - startX}px`)
    el.style.setProperty('--ty', `${window.innerHeight * 0.82 - startY}px`)
    root.appendChild(el)
    scheduleTimeout(() => el.remove(), 450)
  }

  // pedido do usuário (item 19, cutscene "5 — partículas convergindo pro centro da tela"): em
  // vez do modal de pergunta simplesmente dar snap, um punhado de partículas nasce espalhado
  // perto das bordas e converge pro centro exato da tela (onde o modal vai aparecer) antes dele
  // ser revelado de verdade. Puramente DOM/CSS, mesmo padrão do cardAbsorbBeam acima — preciso
  // disso rodar independente do loop 3D porque o jogo já está em pausa total nesse instante.
  //
  // v0.51.0: guarda referência do container/timeout nos dois `let` de fora pra que
  // `cancelFocusCollapse()` (chamado por hideQuestionModal/unmount) consiga abortar tanto a
  // animação visual quanto o callback de reveal — sem isso, fechar o modal durante os ~350ms
  // da convergência reabria ele do nada (o onComplete disparava mesmo com o overlay escondido).
  const FOCUS_COLLAPSE_PARTICLES = 10
  const FOCUS_COLLAPSE_MS = 350 // animação CSS (280ms) + folga pro maior animationDelay aleatório (até 60ms)
  function playFocusCollapse(onComplete) {
    const container = document.createElement('div')
    container.className = 'question-focus-collapse'
    for (let i = 0; i < FOCUS_COLLAPSE_PARTICLES; i += 1) {
      const angle = (i / FOCUS_COLLAPSE_PARTICLES) * Math.PI * 2 + Math.random() * 0.4
      const radius = 55 + Math.random() * 12 // % da tela a partir do centro — nasce perto da borda
      const startX = 50 + Math.cos(angle) * radius
      const startY = 50 + Math.sin(angle) * radius
      const p = document.createElement('div')
      p.className = 'question-focus-particle'
      p.style.setProperty('--sx', `${startX}%`)
      p.style.setProperty('--sy', `${startY}%`)
      p.style.animationDelay = `${Math.random() * 60}ms`
      container.appendChild(p)
    }
    root.appendChild(container)
    focusCollapseContainer = container
    focusCollapseTimeout = scheduleTimeout(() => {
      focusCollapseTimeout = null
      focusCollapseContainer = null
      container.remove()
      onComplete()
    }, FOCUS_COLLAPSE_MS)
  }

  // burst de luz no instante exato em que o modal nasce — mesmo ponto onde as partículas do
  // playFocusCollapse convergiram; reforça o "pouso" da anticipation (princípio de Staging: guia
  // o olho pro centro bem no momento em que título/cards começam a aparecer)
  function questionModalBurst() {
    const el = document.createElement('div')
    el.className = 'question-modal-burst'
    root.appendChild(el)
    scheduleTimeout(() => el.remove(), 520)
  }

  // corpo de verdade do modal de pergunta — chamado só depois do playFocusCollapse acima
  // terminar (ver showQuestionModal no objeto retornado). Comportamento idêntico ao que já
  // existia (escolha por clique ou pelos números 1–4, via quizSlot1..4) — a única mudança é
  // visual: título e cards entram com exaggeration/follow-through (overshoot de escala) em vez
  // de aparecerem instantâneos junto do overlay (pedido do usuário).
  function revealQuestionModal({ question, alternatives, onPick }) {
    questionModalBurst()
    questionModalTitle.textContent = question
    questionModalList.innerHTML = ''

    // ponto único de escolha (clique, tecla 1–4 ou botão de controle mapeado) — evita triplicar
    // o teardown dos 3 listeners/watchers em cada caminho
    function pick(i) {
      questionModalOverlay.hidden = true
      if (questionModalKeyHandler) {
        window.removeEventListener('keydown', questionModalKeyHandler)
        questionModalKeyHandler = null
      }
      if (questionModalGpStop) {
        questionModalGpStop()
        questionModalGpStop = null
      }
      onPick(alternatives[i].slot)
    }

    alternatives.forEach((alt, i) => {
      const hex = COLOR_MAP[alt.color] ?? '#ffffff'
      const btn = document.createElement('button')
      btn.className = 'question-modal-card'
      btn.style.borderColor = hex
      btn.style.setProperty('--stagger', i) // secondary action: cards entram em sequência, não juntos
      // pequeno hint numérico no canto do card pra lembrar que 1–4 também funciona
      btn.innerHTML = `${shapeMarkup(alt.shape, hex)}<span>${alt.text}</span><span class="question-modal-hint">${i + 1}</span>`
      btn.addEventListener('click', () => pick(i))
      questionModalList.appendChild(btn)
    })
    questionModalOverlay.hidden = false

    // se algum listener/watcher antigo ficou pendurado de um modal que não foi fechado direito,
    // remove antes de registrar o novo (defensivo, evita disparo duplo)
    if (questionModalKeyHandler) {
      window.removeEventListener('keydown', questionModalKeyHandler)
      questionModalKeyHandler = null
    }
    if (questionModalGpStop) {
      questionModalGpStop()
      questionModalGpStop = null
    }
    const bindings = getBindings()
    questionModalKeyHandler = (e) => {
      for (let i = 0; i < alternatives.length; i += 1) {
        const codes = bindings.actions[`quizSlot${i + 1}`] || []
        if (codes.includes(e.code)) {
          e.preventDefault()
          pick(i)
          return
        }
      }
    }
    window.addEventListener('keydown', questionModalKeyHandler)
    questionModalGpStop = watchGamepadSlots(alternatives.length, pick)
  }

  const enemyBarPool = new Map()
  const lockMarkerPool = new Map()

  return {
    sceneRoot,

    setStatus({ health, maxHealth = health, score, combo }) {
      status.textContent = `Pontos: ${Math.round(score)} · Combo x${combo.toFixed(2)}`
      healthFill.style.width = `${Math.max(0, Math.min(1, health / maxHealth)) * 100}%`
    },

    setLives(lives, maxLives = lives) {
      if (maxLives !== livePipsMax) {
        livePipsMax = maxLives
        livesBar.innerHTML = ''
        livePips = Array.from({ length: maxLives }, () => {
          const pip = document.createElement('div')
          pip.className = 'hud-life-pip'
          livesBar.appendChild(pip)
          return pip
        })
      }
      livePips.forEach((pip, i) => pip.classList.toggle('filled', i < lives))
    },

    setShield(value, maxValue) {
      shieldFill.style.width = `${Math.max(0, Math.min(1, value / maxValue)) * 100}%`
    },

    setBoost(charge, active) {
      boostFill.style.width = `${Math.max(0, Math.min(1, charge)) * 100}%`
      boostBar.classList.toggle('active', !!active)
      if (charge >= 1 && prevBoostCharge < 1) {
        boostBar.classList.remove('ready-flash')
        void boostBar.offsetWidth
        boostBar.classList.add('ready-flash')
      }
      prevBoostCharge = charge
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

      let title, titleClass
      if (data.correct) {
        let quality = data.quality
        if (!quality && typeof data.accuracyBonus === 'number') {
          if (data.accuracyBonus >= 1.15) quality = 'perfect'
          else if (data.accuracyBonus >= 1.05) quality = 'good'
          else quality = 'ok'
        }
        if (quality === 'perfect') { title = 'PERFEITO!'; titleClass = 'perfect' }
        else if (quality === 'good') { title = 'BOM!'; titleClass = 'good' }
        else if (quality === 'ok') { title = 'ACERTOU!'; titleClass = 'ok' }
        else { title = data.bonus ? 'Bônus dourado: acertou!' : 'Acertou!'; titleClass = 'correct' }
      } else {
        title = data.bonus ? 'Bônus dourado: errou (sem penalidade).' : 'Errou.'
        titleClass = 'wrong'
      }

      const result = document.createElement('p')
      result.className = `feedback ${titleClass}`
      result.textContent = title
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
        : `+${Math.round(data.points)} pontos · combo x${data.comboMultiplier.toFixed(2)} · vida ${data.health}`
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

    // remaining: quantos orbes-pergunta ainda faltam achar/atirar (Fase 5) — opcional, só pra
    // texto informativo; omitir mantém o rótulo genérico
    setBossActive(active, remaining) {
      bossBanner.hidden = !active
      if (active) {
        bossBanner.textContent = typeof remaining === 'number'
          ? `CHEFE — ache e atire nos orbes de pergunta (${remaining} restante${remaining === 1 ? '' : 's'})`
          : 'CHEFE — ache e atire nos orbes de pergunta'
      }
    },

    setGoldenActive(active) {
      goldenBanner.hidden = !active
    },

    // aviso de 5s antes da cutscene de transição pro all-range (dourado surgindo / chefe se
    // aproximando) — kind null esconde
    setArenaWarning(kind, seconds) {
      if (!kind) { arenaWarning.hidden = true; return }
      arenaWarning.hidden = false
      arenaWarning.className = `hud-arena-warning kind-${kind}`
      arenaWarning.textContent = kind === 'golden'
        ? `Inimigo dourado surgindo em ${seconds}s`
        : `Chefe se aproximando em ${seconds}s`
    },

    // overlay de texto durante a cutscene de câmera/mapa se ajeitando — kind null esconde.
    // 'bossSummon' (pedido do usuário): texto próprio pra cutscene de invocação do chefe, que
    // roda depois da caçada de orbes em vez do chefe simplesmente aparecer na hora.
    setArenaCutscene(kind) {
      arenaCutsceneOverlay.textContent = kind === 'bossSummon'
        ? 'O chefe está sendo invocado...'
        : 'Transicionando para o modo All-Range...'
      arenaCutsceneOverlay.hidden = !kind
    },

    // pausa total: pergunta+alternativas centralizadas, visual de card (Fase 5/6) — usado
    // quando o jogador atira num orbe do chefe. onPick(slot) resolve a escolha.
    //
    // desde a v0.29.2, também dá pra escolher pelos NÚMEROS 1–4 (reusa os binds quizSlot1..4,
    // padrão Digit1..Digit4) em vez de ter que clicar no card — quem remapeou os números nas
    // Configurações também funciona aqui, porque leio de getBindings() em vez de hardcodar.
    showQuestionModal({ question, alternatives, onPick }) {
      // pedido do usuário (item 19, cutscene "5 — partículas convergindo pro centro"): em vez
      // do modal simplesmente dar snap, um burst de partículas nas bordas da tela voa pro
      // centro exato onde ele vai nascer, e só então o modal aparece de verdade. Puramente
      // DOM/CSS (mesmo padrão do cardAbsorbBeam) — o jogo já está em pausa total nesse ponto
      // (phase questionPause/bossQuestionPause), então um atraso visual de ~300ms aqui não
      // acumula com nada, é só o "beat" da cutscene.
      playFocusCollapse(() => revealQuestionModal({ question, alternatives, onPick }))
    },

    hideQuestionModal() {
      // v0.51.0: aborta a animação de convergência se ela estiver rodando. Sem isso, fechar o
      // modal durante os ~350ms do playFocusCollapse deixava o setTimeout do callback disparar
      // depois do overlay já escondido — o modal reabria "do nada" quando o jogador saía do
      // estado por outra via (morte do chefe no mesmo frame, debug forçando outcome).
      cancelFocusCollapse()
      questionModalOverlay.hidden = true
      if (questionModalKeyHandler) {
        window.removeEventListener('keydown', questionModalKeyHandler)
        questionModalKeyHandler = null
      }
      if (questionModalGpStop) {
        questionModalGpStop()
        questionModalGpStop = null
      }
    },

    damageFlash() {
      damageVignette.classList.remove('flash')
      void damageVignette.offsetWidth
      damageVignette.classList.add('flash')
    },

    setLowHealth(intensity) {
      const v = Math.max(0, Math.min(1, intensity))
      lowHealthVignette.style.opacity = String(v)
    },

    // ============ MOTION LINES (boost) ============
    setMotionLines(active) {
      motionLines.classList.toggle('active', !!active)
    },

    // ============ SCREEN DISTORTION (boost) ============
    setBoostDistortion(active) {
      boostDistortion.classList.toggle('active', !!active)
    },

    // ============ BOSS TINT ============
    setBossTint(active) {
      bossTint.classList.toggle('active', !!active)
    },

    // ============ FAIXAS LATERAIS DE DANO (escudo vs vida) ============
    // escudo absorveu o hit: efeito azul com grid de escudo nas laterais
    showShieldBlock() {
      sideFlash.classList.remove('flash', 'damage')
      sideFlash.classList.add('shield')
      void sideFlash.offsetWidth
      sideFlash.classList.add('flash')
    },

    // dano foi direto na vida (sem escudo pra absorver): faixas vermelhas nas laterais
    showDamageSide() {
      sideFlash.classList.remove('flash', 'shield')
      sideFlash.classList.add('damage')
      void sideFlash.offsetWidth
      sideFlash.classList.add('flash')
    },

    setReticlePosition(xFrac, yFrac) {
      reticle.style.left = `${xFrac * 100}%`
      reticle.style.top = `${yFrac * 100}%`
    },

    // Fase 8 (VISUAL): mira muda de cor/engrossa quando há um inimigo vivo bem na frente dela
    // (combat.isAimingAtEnemy) — só hint visual, não afeta o disparo nem o teleguiado.
    setReticleAiming(active) {
      reticleRing.classList.toggle('aiming', !!active)
    },

    // Fase 9 (ideia all-range 2): horizonte artificial — passar null esconde (fora do
    // all-range). pitch/roll em radianos, vindos de rail.getArenaAttitude().
    setHorizon(pitch, roll) {
      if (pitch == null) { horizon.hidden = true; return }
      horizon.hidden = false
      const rollDeg = -roll * (180 / Math.PI)
      const pitchOffsetPx = pitch * 60
      horizonLine.style.transform = `translateY(${pitchOffsetPx}px) rotate(${rollDeg}deg)`
    },

    hitMarker(killed = false) {
      hitMarkerEl.classList.remove('active', 'kill')
      void hitMarkerEl.offsetWidth
      hitMarkerEl.classList.add('active')
      if (killed) hitMarkerEl.classList.add('kill')
      if (hitMarkerTimeout) cancelTimeout(hitMarkerTimeout)
      hitMarkerTimeout = scheduleTimeout(() => {
        hitMarkerTimeout = null
        hitMarkerEl.classList.remove('active', 'kill')
      }, killed ? 240 : 170)
    },

    spawnDamageNumber(xFrac, yFrac, value, opts = {}) {
      const el = document.createElement('div')
      el.className = 'hud-damage-number'
      if (opts.homing) el.classList.add('homing')
      if (opts.points) el.classList.add('points')
      if (opts.big) el.classList.add('big')
      if (opts.time) el.classList.add('time')
      const prefix = opts.prefix != null ? opts.prefix : ''
      el.textContent = `${prefix}${value}`
      el.style.left = `${Math.max(0, Math.min(1, xFrac)) * 100}%`
      el.style.top = `${Math.max(0, Math.min(1, yFrac)) * 100}%`
      root.appendChild(el)
      scheduleTimeout(() => el.remove(), 950)
    },

    // v0.29.6: errar pergunta não mostra mais o painel de feedback (resposta certa/pontos) —
    // só isso, um texto vermelho pequeno que sobe e some sozinho em 3s. O jogo continua
    // "pausado" (fase de resolução) até ele sumir, mas sem UI grande no meio da tela.
    showErrorFloat(text = 'Errou!') {
      const el = document.createElement('div')
      el.className = 'hud-error-float'
      el.textContent = text
      root.appendChild(el)
      scheduleTimeout(() => el.remove(), 3000)
    },

    setEnemyHealthBars(list) {
      const seen = new Set()
      for (const item of list) {
        seen.add(item.id)
        let el = enemyBarPool.get(item.id)
        if (!el) {
          el = document.createElement('div')
          el.className = 'enemy-health-bar'
          const fill = document.createElement('div')
          fill.className = 'enemy-health-bar-fill'
          el.appendChild(fill)
          root.appendChild(el)
          enemyBarPool.set(item.id, el)
        }
        el.style.left = `${item.xFrac * 100}%`
        el.style.top = `${item.yFrac * 100}%`
        el.firstChild.style.width = `${Math.max(0, Math.min(1, item.hp / item.maxHp)) * 100}%`
      }
      for (const [id, el] of enemyBarPool) {
        if (!seen.has(id)) { el.remove(); enemyBarPool.delete(id) }
      }
    },

    setLockedEnemyMarkers(list) {
      const seen = new Set()
      for (const item of list) {
        seen.add(item.id)
        let el = lockMarkerPool.get(item.id)
        if (!el) {
          el = document.createElement('div')
          el.className = 'enemy-lock-marker'
          // 3 quadrados que convergem (grande→pequeno) até sobrar só o que gira — a
          // animação de "lock-in" só roda uma vez, no instante em que o alvo é travado
          el.innerHTML = '<div class="lock-sq lock-sq-a"></div><div class="lock-sq lock-sq-b"></div><div class="lock-sq lock-sq-c"></div>'
          root.appendChild(el)
          lockMarkerPool.set(item.id, el)
        }
        el.style.left = `${item.xFrac * 100}%`
        el.style.top = `${item.yFrac * 100}%`
      }
      for (const [id, el] of lockMarkerPool) {
        if (!seen.has(id)) { el.remove(); lockMarkerPool.delete(id) }
      }
    },

    setBossFight(active, hp, maxHp) {
      bossFightBar.hidden = !active
      if (active) bossFightFill.style.width = `${Math.max(0, Math.min(1, hp / maxHp)) * 100}%`
    },

    setMinimap(active, data) {
      minimap.hidden = !active
      if (!active) return
      const { player, blips } = data
      minimapPlayer.style.left = `${(player.xFrac * 0.5 + 0.5) * 100}%`
      minimapPlayer.style.top = `${(player.yFrac * 0.5 + 0.5) * 100}%`
      minimapPlayer.style.transform = `translate(-50%, -50%) rotate(${player.angle}rad)`

      const seen = new Set()
      blips.forEach((b, i) => {
        seen.add(i)
        let el = minimapBlipPool.get(i)
        if (!el) {
          el = document.createElement('div')
          minimap.appendChild(el)
          minimapBlipPool.set(i, el)
        }
        el.className = `hud-minimap-blip hud-minimap-blip-${b.type}`
        el.style.left = `${(b.xFrac * 0.5 + 0.5) * 100}%`
        el.style.top = `${(b.yFrac * 0.5 + 0.5) * 100}%`
      })
      for (const [i, el] of minimapBlipPool) {
        if (!seen.has(i)) { el.remove(); minimapBlipPool.delete(i) }
      }
    },

    // pedido do usuário: selecionar as cartas de upgrade pelos NÚMEROS também, igual já
    // funciona no modal de pergunta — reusa os mesmos binds quizSlot1..4 (Digit1..4 por padrão).
    showCardChoice({ cards, onPick }) {
      cardChoiceList.innerHTML = ''
      const close = () => {
        cardChoiceOverlay.hidden = true
        if (cardChoiceKeyHandler) {
          window.removeEventListener('keydown', cardChoiceKeyHandler)
          cardChoiceKeyHandler = null
        }
        if (cardChoiceGpStop) {
          cardChoiceGpStop()
          cardChoiceGpStop = null
        }
      }
      function pick(i) {
        cardAbsorbBeam(cardChoiceList.children[i].getBoundingClientRect())
        close()
        onPick(cards[i])
      }
      cards.forEach((card, i) => {
        const el = document.createElement('button')
        el.className = `roguelike-card category-${card.category}`
        el.innerHTML = `<span class="card-category">${CARD_CATEGORY_LABEL[card.category] ?? card.category}</span><h4>${card.label}</h4><p>${card.description}</p><span class="question-modal-hint">${i + 1}</span>`
        el.addEventListener('click', () => pick(i))
        cardChoiceList.appendChild(el)
      })
      cardChoiceOverlay.hidden = false

      if (cardChoiceKeyHandler) {
        window.removeEventListener('keydown', cardChoiceKeyHandler)
        cardChoiceKeyHandler = null
      }
      if (cardChoiceGpStop) {
        cardChoiceGpStop()
        cardChoiceGpStop = null
      }
      const bindings = getBindings()
      cardChoiceKeyHandler = (e) => {
        for (let i = 0; i < cards.length; i += 1) {
          const codes = bindings.actions[`quizSlot${i + 1}`] || []
          if (codes.includes(e.code)) {
            e.preventDefault()
            pick(i)
            return
          }
        }
      }
      window.addEventListener('keydown', cardChoiceKeyHandler)
      cardChoiceGpStop = watchGamepadSlots(cards.length, pick)
    },

    debug: {
      setVisible(v) { debugPanel.hidden = !v },
      bind(handlers) {
        for (const [id, fn] of Object.entries(handlers)) {
          if (debugButtons[id]) debugButtons[id].onclick = fn
        }
      },
      setToggleActive(id, active) {
        if (debugButtons[id]) debugButtons[id].classList.toggle('active', !!active)
      },
    },

    unmount() {
      // v0.51.0: cancela TUDO que estava agendado (damage numbers, hit marker, absorb beam,
      // focus collapse, error float) e aborta o collapse se ele ainda estiver em voo. Sem
      // isso, um HUD remontado num novo jogo antes do próximo timeout vencer disparava
      // callbacks em nós já desanexados do DOM — não quebrava nada, mas era exatamente o
      // tipo de vazamento silencioso que aparece como bug intermitente depois de N partidas.
      cancelFocusCollapse()
      for (const id of pendingTimeouts) clearTimeout(id)
      pendingTimeouts.clear()
      hitMarkerTimeout = null

      // se o HUD for desmontado com o modal aberto (fim de setor, teardown), remove o listener
      // global de keydown e o watcher de controle pra não vazar entre sessões
      if (questionModalKeyHandler) {
        window.removeEventListener('keydown', questionModalKeyHandler)
        questionModalKeyHandler = null
      }
      if (cardChoiceKeyHandler) {
        window.removeEventListener('keydown', cardChoiceKeyHandler)
        cardChoiceKeyHandler = null
      }
      if (questionModalGpStop) {
        questionModalGpStop()
        questionModalGpStop = null
      }
      if (cardChoiceGpStop) {
        cardChoiceGpStop()
        cardChoiceGpStop = null
      }
      root.innerHTML = ''
    },
  }
}
