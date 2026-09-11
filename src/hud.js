import { buildDeck } from './anki.js'
import { listDecks, addDeck, updateDeck, removeDeck, getDeck } from './decks.js'
import { getSettings, setSetting } from './settings.js'
import { getBindings, setBinding, resetToDefaults, setGamepadBinding, codeToLabel, ACTIONS } from './keybindings.js'
import { DEBUG_ACTIONS } from './debug.js'

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
  document.getElementById('pregame-screen').hidden = name !== 'pregame'
  document.getElementById('deck-manager-screen').hidden = name !== 'deckManager'
  document.getElementById('settings-screen').hidden = name !== 'settings'
  document.getElementById('game-screen').hidden = name !== 'game'
  document.getElementById('sector-end-screen').hidden = name !== 'end'
  document.getElementById('painel-screen').hidden = name !== 'painel'
}

export function showPreGameMenu({ onPlay, onAddDeck, onSettings }) {
  showScreen('pregame')
  const root = document.getElementById('pregame-screen')
  root.innerHTML = ''

  const title = document.createElement('h1')
  title.innerHTML = 'Star Anki <span class="version-tag">v0.16.0</span>'
  root.appendChild(title)

  const desc = document.createElement('p')
  desc.textContent = 'Transforme um baralho exportado do Anki num rail shooter de estudo.'
  root.appendChild(desc)

  const actions = document.createElement('div')
  actions.className = 'menu-actions'

  const playBtn = document.createElement('button')
  playBtn.textContent = 'Jogar'
  playBtn.addEventListener('click', onPlay)
  actions.appendChild(playBtn)

  const addBtn = document.createElement('button')
  addBtn.className = 'btn-secondary'
  addBtn.textContent = 'Adicionar baralho'
  addBtn.addEventListener('click', onAddDeck)
  actions.appendChild(addBtn)

  const settingsBtn = document.createElement('button')
  settingsBtn.className = 'btn-secondary'
  settingsBtn.textContent = 'Configurações'
  settingsBtn.addEventListener('click', onSettings)
  actions.appendChild(settingsBtn)

  root.appendChild(actions)
}

// Gerenciador de baralhos: lista/adiciona/edita/exclui baralhos salvos e mostra preview das
// perguntas (normais visíveis, extras ocultas atrás de um disclosure). Autocontido — lê/escreve
// direto em decks.js, só chama pra fora nas intenções de navegação (jogar, voltar).
export function showDeckManager({ onPlay, onBack, startInAdd = false }) {
  showScreen('deckManager')
  const root = document.getElementById('deck-manager-screen')

  let view = startInAdd ? 'add' : 'list'
  let editingId = null
  const expandedPreview = new Set()
  const expandedExtras = new Set()

  render()

  function render() {
    root.innerHTML = ''

    const back = document.createElement('button')
    back.className = 'back-link'
    back.textContent = '← Voltar'
    back.addEventListener('click', onBack)
    root.appendChild(back)

    if (view === 'list') renderList()
    else if (view === 'add') renderAddForm()
    else if (view === 'edit') renderEditForm()
  }

  function renderList() {
    const title = document.createElement('h2')
    title.textContent = 'Baralhos salvos'
    root.appendChild(title)

    const decks = listDecks()

    if (decks.length === 0) {
      const empty = document.createElement('p')
      empty.textContent = 'Nenhum baralho salvo ainda.'
      root.appendChild(empty)
    }

    const list = document.createElement('div')
    list.className = 'deck-list'
    for (const d of decks) list.appendChild(buildDeckCard(d))
    root.appendChild(list)

    const addBtn = document.createElement('button')
    addBtn.textContent = 'Adicionar baralho'
    addBtn.addEventListener('click', () => { view = 'add'; render() })
    root.appendChild(addBtn)
  }

  function buildDeckCard(d) {
    const card = document.createElement('div')
    card.className = 'deck-card' + (d.valid ? '' : ' invalid')

    const name = document.createElement('p')
    name.className = 'deck-card-name'
    name.textContent = d.name
    card.appendChild(name)

    const meta = document.createElement('p')
    meta.className = 'deck-card-meta'
    meta.textContent = d.valid
      ? `${d.shooterCount} pergunta${d.shooterCount === 1 ? '' : 's'} de combate · ${d.painelCount} de painel`
      : `Inválido: ${d.warning}`
    card.appendChild(meta)

    const btnRow = document.createElement('div')
    btnRow.className = 'btn-row'

    if (d.valid) {
      const playBtn = document.createElement('button')
      playBtn.className = 'btn-small'
      playBtn.textContent = 'Jogar'
      playBtn.addEventListener('click', () => onPlay(d.id))
      btnRow.appendChild(playBtn)
    }

    const editBtn = document.createElement('button')
    editBtn.className = 'btn-small btn-secondary'
    editBtn.textContent = 'Editar'
    editBtn.addEventListener('click', () => { view = 'edit'; editingId = d.id; render() })
    btnRow.appendChild(editBtn)

    const delBtn = document.createElement('button')
    delBtn.className = 'btn-small btn-danger'
    delBtn.textContent = 'Excluir'
    delBtn.addEventListener('click', () => {
      if (!window.confirm(`Excluir o baralho "${d.name}"?`)) return
      removeDeck(d.id)
      render()
    })
    btnRow.appendChild(delBtn)

    card.appendChild(btnRow)

    if (d.valid) {
      const previewToggle = document.createElement('button')
      previewToggle.className = 'disclosure-toggle'
      previewToggle.textContent = expandedPreview.has(d.id) ? 'Ocultar perguntas ▲' : 'Ver perguntas ▾'
      previewToggle.addEventListener('click', () => {
        if (expandedPreview.has(d.id)) expandedPreview.delete(d.id)
        else expandedPreview.add(d.id)
        render()
      })
      card.appendChild(previewToggle)

      if (expandedPreview.has(d.id)) card.appendChild(buildPreview(d.id))
    }

    return card
  }

  function buildPreview(id) {
    const entry = getDeck(id)
    const built = buildDeck(entry.text)
    const wrap = document.createElement('div')
    wrap.className = 'deck-preview'

    const shooterTitle = document.createElement('p')
    shooterTitle.textContent = `Perguntas normais (${built.shooterCards.length})`
    wrap.appendChild(shooterTitle)
    const shooterList = document.createElement('ul')
    for (const c of built.shooterCards) {
      const li = document.createElement('li')
      li.textContent = c.question
      shooterList.appendChild(li)
    }
    wrap.appendChild(shooterList)

    if (built.painelCards.length > 0) {
      const extrasToggle = document.createElement('button')
      extrasToggle.className = 'disclosure-toggle'
      extrasToggle.textContent = expandedExtras.has(id)
        ? 'Ocultar perguntas extra ▲'
        : `Mostrar perguntas extra (${built.painelCards.length}) ▾`
      extrasToggle.addEventListener('click', () => {
        if (expandedExtras.has(id)) expandedExtras.delete(id)
        else expandedExtras.add(id)
        render()
      })
      wrap.appendChild(extrasToggle)

      if (expandedExtras.has(id)) {
        const extrasList = document.createElement('ul')
        for (const c of built.painelCards) {
          const li = document.createElement('li')
          li.textContent = c.question
          extrasList.appendChild(li)
        }
        wrap.appendChild(extrasList)
      }
    }

    return wrap
  }

  function renderAddForm() {
    const title = document.createElement('h2')
    title.textContent = 'Adicionar baralho'
    root.appendChild(title)

    const p = document.createElement('p')
    p.textContent = 'Carregue um baralho exportado do Anki (formato .txt, notas com campos separados).'
    root.appendChild(p)

    const nameLabel = document.createElement('label')
    nameLabel.textContent = 'Nome do baralho'
    root.appendChild(nameLabel)
    const nameInput = document.createElement('input')
    nameInput.type = 'text'
    nameInput.placeholder = 'Ex: Arquitetura de computadores'
    root.appendChild(nameInput)

    const fileLabel = document.createElement('label')
    fileLabel.textContent = 'Arquivo .txt'
    root.appendChild(fileLabel)
    const fileInput = document.createElement('input')
    fileInput.type = 'file'
    fileInput.accept = '.txt'
    root.appendChild(fileInput)

    const textLabel = document.createElement('label')
    textLabel.textContent = 'Ou cole o texto exportado'
    root.appendChild(textLabel)
    const textarea = document.createElement('textarea')
    textarea.rows = 8
    textarea.placeholder = 'Cole aqui o conteúdo exportado do Anki'
    root.appendChild(textarea)

    const message = document.createElement('div')
    message.className = 'form-message'
    root.appendChild(message)

    const btnRow = document.createElement('div')
    btnRow.className = 'btn-row'

    const submitBtn = document.createElement('button')
    submitBtn.textContent = 'Salvar baralho'
    submitBtn.addEventListener('click', () => {
      message.textContent = ''
      const file = fileInput.files[0]
      if (file) {
        const reader = new FileReader()
        reader.onload = () => submit(String(reader.result))
        reader.readAsText(file)
        return
      }
      const pasted = textarea.value.trim()
      if (!pasted) {
        message.textContent = 'Selecione um arquivo .txt ou cole o texto exportado.'
        return
      }
      submit(pasted)
    })
    btnRow.appendChild(submitBtn)

    const cancelBtn = document.createElement('button')
    cancelBtn.className = 'btn-secondary'
    cancelBtn.textContent = 'Cancelar'
    cancelBtn.addEventListener('click', () => { view = 'list'; render() })
    btnRow.appendChild(cancelBtn)

    root.appendChild(btnRow)

    function submit(text) {
      const name = nameInput.value.trim() || 'Baralho sem nome'
      const result = addDeck(name, text)
      if (result.error) { message.textContent = result.error; return }
      view = 'list'
      render()
    }
  }

  function renderEditForm() {
    const entry = getDeck(editingId)
    if (!entry) { view = 'list'; render(); return }

    const title = document.createElement('h2')
    title.textContent = 'Editar baralho'
    root.appendChild(title)

    const nameLabel = document.createElement('label')
    nameLabel.textContent = 'Nome do baralho'
    root.appendChild(nameLabel)
    const nameInput = document.createElement('input')
    nameInput.type = 'text'
    nameInput.value = entry.name
    root.appendChild(nameInput)

    const textLabel = document.createElement('label')
    textLabel.textContent = 'Texto exportado'
    root.appendChild(textLabel)
    const textarea = document.createElement('textarea')
    textarea.rows = 16
    textarea.value = entry.text
    root.appendChild(textarea)

    const message = document.createElement('div')
    message.className = 'form-message'
    root.appendChild(message)

    const btnRow = document.createElement('div')
    btnRow.className = 'btn-row'

    const saveBtn = document.createElement('button')
    saveBtn.textContent = 'Salvar'
    saveBtn.addEventListener('click', () => {
      const result = updateDeck(editingId, { name: nameInput.value.trim(), text: textarea.value })
      if (result.error) { message.textContent = result.error; return }
      view = 'list'
      render()
    })
    btnRow.appendChild(saveBtn)

    const cancelBtn = document.createElement('button')
    cancelBtn.className = 'btn-secondary'
    cancelBtn.textContent = 'Cancelar'
    cancelBtn.addEventListener('click', () => { view = 'list'; render() })
    btnRow.appendChild(cancelBtn)

    const delBtn = document.createElement('button')
    delBtn.className = 'btn-danger'
    delBtn.textContent = 'Excluir baralho'
    delBtn.addEventListener('click', () => {
      if (!window.confirm(`Excluir o baralho "${entry.name}"?`)) return
      removeDeck(editingId)
      view = 'list'
      render()
    })
    btnRow.appendChild(delBtn)

    root.appendChild(btnRow)
  }
}

// Configurações: vida inicial, barra de vida de inimigo, editor de controles e mapeamento de
// gamepad. Autocontido — lê/escreve direto em settings.js/keybindings.js.
export function showSettingsScreen({ onBack }) {
  showScreen('settings')
  const root = document.getElementById('settings-screen')
  root.innerHTML = ''

  let gamepadRaf = null
  let waitingRebindAction = null
  let waitingRebindBtn = null

  const back = document.createElement('button')
  back.className = 'back-link'
  back.textContent = '← Voltar'
  back.addEventListener('click', () => { cleanup(); onBack() })
  root.appendChild(back)

  const title = document.createElement('h2')
  title.textContent = 'Configurações'
  root.appendChild(title)

  // ---- vida ----
  const lifeSection = document.createElement('div')
  lifeSection.className = 'settings-section'
  const lifeTitle = document.createElement('h3')
  lifeTitle.textContent = 'Vida'
  lifeSection.appendChild(lifeTitle)

  const lifeRow = document.createElement('div')
  lifeRow.className = 'settings-row'
  const lifeLabel = document.createElement('label')
  lifeLabel.textContent = 'Vida inicial'
  lifeRow.appendChild(lifeLabel)
  const lifeInput = document.createElement('input')
  lifeInput.type = 'number'
  lifeInput.min = '1'
  lifeInput.max = '20'
  lifeInput.value = String(getSettings().startingHealth)
  lifeInput.addEventListener('change', () => {
    const n = Math.max(1, Math.min(20, Math.round(Number(lifeInput.value)) || 1))
    lifeInput.value = String(n)
    setSetting('startingHealth', n)
  })
  lifeRow.appendChild(lifeInput)
  lifeSection.appendChild(lifeRow)
  root.appendChild(lifeSection)

  // ---- visual ----
  const visualSection = document.createElement('div')
  visualSection.className = 'settings-section'
  const visualTitle = document.createElement('h3')
  visualTitle.textContent = 'Visual'
  visualSection.appendChild(visualTitle)

  const enemyBarRow = document.createElement('div')
  enemyBarRow.className = 'settings-row'
  const enemyBarLabel = document.createElement('label')
  enemyBarLabel.textContent = 'Barra de vida acima dos inimigos'
  enemyBarRow.appendChild(enemyBarLabel)
  const enemyBarCheckbox = document.createElement('input')
  enemyBarCheckbox.type = 'checkbox'
  enemyBarCheckbox.checked = getSettings().showEnemyHealthBars
  enemyBarCheckbox.addEventListener('change', () => setSetting('showEnemyHealthBars', enemyBarCheckbox.checked))
  enemyBarRow.appendChild(enemyBarCheckbox)
  visualSection.appendChild(enemyBarRow)
  root.appendChild(visualSection)

  // ---- controles ----
  const controlsSection = document.createElement('div')
  controlsSection.className = 'settings-section'
  const controlsTitle = document.createElement('h3')
  controlsTitle.textContent = 'Editor de controles'
  controlsSection.appendChild(controlsTitle)

  const bindRows = document.createElement('div')
  controlsSection.appendChild(bindRows)
  renderBindRows()

  const resetBtn = document.createElement('button')
  resetBtn.className = 'btn-secondary'
  resetBtn.textContent = 'Restaurar padrão'
  resetBtn.addEventListener('click', () => {
    resetToDefaults()
    renderBindRows()
  })
  controlsSection.appendChild(resetBtn)
  root.appendChild(controlsSection)

  function renderBindRows() {
    bindRows.innerHTML = ''
    const bindings = getBindings()
    for (const action of ACTIONS) {
      const row = document.createElement('div')
      row.className = 'keybind-row'
      const label = document.createElement('span')
      label.textContent = action.label
      row.appendChild(label)

      const codes = bindings.actions[action.id] || []
      const btn = document.createElement('button')
      btn.className = 'keybind-btn'
      btn.textContent = codes.map(codeToLabel).join(' / ') || '—'
      btn.addEventListener('click', () => startRebind(action.id, btn))
      row.appendChild(btn)

      bindRows.appendChild(row)
    }
  }

  function startRebind(actionId, btn) {
    if (waitingRebindBtn) {
      waitingRebindBtn.classList.remove('waiting')
      waitingRebindBtn.textContent = waitingRebindBtn.dataset.prevLabel
    }
    waitingRebindAction = actionId
    waitingRebindBtn = btn
    btn.dataset.prevLabel = btn.textContent
    btn.textContent = 'Pressione uma tecla...'
    btn.classList.add('waiting')
  }

  function onRebindKeyDown(e) {
    if (!waitingRebindAction) return
    e.preventDefault()
    setBinding(waitingRebindAction, e.code)
    waitingRebindAction = null
    waitingRebindBtn = null
    renderBindRows()
  }
  window.addEventListener('keydown', onRebindKeyDown)

  // ---- gamepad ----
  const gpSection = document.createElement('div')
  gpSection.className = 'settings-section'
  const gpTitle = document.createElement('h3')
  gpTitle.textContent = 'Mapeamento de gamepad'
  gpSection.appendChild(gpTitle)

  const gpStatus = document.createElement('p')
  gpStatus.className = 'gp-status'
  gpSection.appendChild(gpStatus)

  const invertRow = document.createElement('div')
  invertRow.className = 'settings-row'
  const invertLabel = document.createElement('label')
  invertLabel.textContent = 'Inverter eixo Y'
  invertRow.appendChild(invertLabel)
  const invertCheckbox = document.createElement('input')
  invertCheckbox.type = 'checkbox'
  invertCheckbox.checked = getBindings().gamepad.invertY
  invertCheckbox.addEventListener('change', () => setGamepadBinding('invertY', invertCheckbox.checked))
  invertRow.appendChild(invertCheckbox)
  gpSection.appendChild(invertRow)

  const fireLabel = document.createElement('p')
  fireLabel.textContent = 'Eixos e botões do controle conectado (clique X/Y num eixo ou num botão pra usá-lo):'
  gpSection.appendChild(fireLabel)

  const axesBarsWrap = document.createElement('div')
  gpSection.appendChild(axesBarsWrap)

  const buttonsWrap = document.createElement('div')
  buttonsWrap.className = 'gp-buttons'
  gpSection.appendChild(buttonsWrap)

  root.appendChild(gpSection)

  function pollGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : []
    const pad = [...pads].find(Boolean)
    const bindings = getBindings()

    gpStatus.textContent = pad ? `Conectado: ${pad.id}` : 'Nenhum controle detectado. Pressione um botão nele.'

    axesBarsWrap.innerHTML = ''
    buttonsWrap.innerHTML = ''

    if (pad) {
      pad.axes.forEach((v, i) => {
        const barRow = document.createElement('div')
        barRow.className = 'gp-axis-row'
        const label = document.createElement('span')
        label.className = 'gp-axis-label'
        label.textContent = `Eixo ${i}${i === bindings.gamepad.axisX ? ' (X)' : ''}${i === bindings.gamepad.axisY ? ' (Y)' : ''}`
        barRow.appendChild(label)

        const bar = document.createElement('div')
        bar.className = 'gp-axis-bar'
        const fill = document.createElement('div')
        fill.className = 'gp-axis-fill'
        const pct = ((v + 1) / 2) * 100
        fill.style.left = `${Math.min(Math.max(pct, 0), 96)}%`
        fill.style.width = '4%'
        bar.appendChild(fill)
        barRow.appendChild(bar)

        const setXBtn = document.createElement('button')
        setXBtn.className = 'keybind-btn'
        setXBtn.textContent = 'X'
        setXBtn.title = 'Usar este eixo como X'
        setXBtn.addEventListener('click', () => setGamepadBinding('axisX', i))
        barRow.appendChild(setXBtn)

        const setYBtn = document.createElement('button')
        setYBtn.className = 'keybind-btn'
        setYBtn.textContent = 'Y'
        setYBtn.title = 'Usar este eixo como Y'
        setYBtn.addEventListener('click', () => setGamepadBinding('axisY', i))
        barRow.appendChild(setYBtn)

        axesBarsWrap.appendChild(barRow)
      })

      pad.buttons.forEach((b, i) => {
        const chip = document.createElement('button')
        chip.className = 'gp-btn-chip'
        if (b.pressed) chip.classList.add('pressed')
        if (bindings.gamepad.fireButtons.includes(i)) chip.classList.add('selected')
        chip.textContent = String(i)
        chip.title = 'Clique pra ativar/desativar como botão de tiro'
        chip.addEventListener('click', () => {
          const current = getBindings().gamepad.fireButtons
          const next = current.includes(i) ? current.filter((x) => x !== i) : [...current, i]
          setGamepadBinding('fireButtons', next)
        })
        buttonsWrap.appendChild(chip)
      })
    }

    gamepadRaf = requestAnimationFrame(pollGamepad)
  }
  pollGamepad()

  function cleanup() {
    window.removeEventListener('keydown', onRebindKeyDown)
    if (gamepadRaf) cancelAnimationFrame(gamepadRaf)
  }
}

export function createGameHud() {
  showScreen('game')
  const root = document.getElementById('game-screen')
  root.innerHTML = ''

  const sceneRoot = document.createElement('div')
  sceneRoot.id = 'scene-root'
  root.appendChild(sceneRoot)

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

  const livesBar = document.createElement('div')
  livesBar.className = 'hud-lives-bar'
  root.appendChild(livesBar)
  let livePips = []
  let livePipsMax = null

  const shieldBar = document.createElement('div')
  shieldBar.className = 'hud-shield-bar'
  root.appendChild(shieldBar)
  let shieldPips = []
  let shieldPipsMax = null

  const shieldRecharge = document.createElement('div')
  shieldRecharge.className = 'hud-shield-recharge'
  shieldRecharge.hidden = true
  root.appendChild(shieldRecharge)
  const shieldRechargeFill = document.createElement('div')
  shieldRechargeFill.className = 'hud-shield-recharge-fill'
  shieldRecharge.appendChild(shieldRechargeFill)

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

  // ============ PAINEL DE DEBUG ============
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

  // ============ BARRAS DE VIDA DE INIMIGO ============
  const enemyBarPool = new Map()

  return {
    sceneRoot,

    setStatus({ health, maxHealth = health, score, combo }) {
      status.textContent = `Pontos: ${Math.round(score)} · Combo x${combo.toFixed(2)}`

      if (maxHealth !== healthPipsMax) {
        healthPipsMax = maxHealth
        healthBar.innerHTML = ''
        healthPips = Array.from({ length: maxHealth }, () => {
          const pip = document.createElement('div')
          pip.className = 'hud-health-pip'
          healthBar.appendChild(pip)
          return pip
        })
      }
      healthPips.forEach((pip, i) => pip.classList.toggle('filled', i < health))
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

    // charges: escudos disponíveis agora; maxCharges: capacidade máxima; rechargeFrac: 0 (sem
    // recarga em andamento) a 1 (acabou de esgotar); a barra de recarga só aparece com 0 cargas
    setShield(charges, maxCharges, rechargeFrac = 0) {
      if (maxCharges !== shieldPipsMax) {
        shieldPipsMax = maxCharges
        shieldBar.innerHTML = ''
        shieldPips = Array.from({ length: maxCharges }, () => {
          const pip = document.createElement('div')
          pip.className = 'hud-shield-pip'
          shieldBar.appendChild(pip)
          return pip
        })
      }
      shieldPips.forEach((pip, i) => pip.classList.toggle('filled', i < charges))

      const recharging = charges <= 0 && rechargeFrac > 0
      shieldRecharge.hidden = !recharging
      if (recharging) shieldRechargeFill.style.width = `${(1 - rechargeFrac) * 100}%`
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

    setBossActive(active) {
      bossBanner.hidden = !active
    },

    setGoldenActive(active) {
      goldenBanner.hidden = !active
    },

    damageFlash() {
      damageVignette.classList.remove('flash')
      void damageVignette.offsetWidth
      damageVignette.classList.add('flash')
    },

    setReticlePosition(xFrac, yFrac) {
      reticle.style.left = `${xFrac * 100}%`
      reticle.style.top = `${yFrac * 100}%`
    },

    // feedback de lock-on: muda a cor e a animação da mira quando há alvo travado. É o que dá
    // a sensação de "travou no alvo" do Star Fox 64.
    setReticleLocked(locked) {
      reticle.classList.toggle('locked', !!locked)
    },

    // barras de vida acima do modelo dos inimigos (fração de tela 0..1, igual à mira)
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
