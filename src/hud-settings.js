import { getSettings, setSetting } from './settings.js'
import {
  getBindings, setBinding, resetToDefaults, setGamepadBinding, codeToLabel, ACTIONS,
  GAMEPAD_ACTIONS, setGamepadActionButton, clearGamepadActionButton,
} from './keybindings.js'
import { showScreen } from './hud-shared.js'
import { SHIP_VISUAL_OPTIONS } from './rail.js'
import { createDamageNumbers } from './hud-damage.js'

// Overhaul do menu de pausa (v0.80.0): as 3 seções abaixo (Visual/Sensibilidade/Controles de
// teclado) precisavam existir tanto aqui (tela de Configurações completa, pré-jogo) quanto no
// painel de "opções básicas" da pausa (hud-pause.js, dentro de uma partida em andamento) — em
// vez de duplicar o HTML/lógica nos dois lugares, viraram builders exportados e reaproveitados
// pelos dois. `showSettingsScreen` continua idêntico a antes pra quem já usa (pregame/game-menu).
export function buildVisualSection({ onDamageStyleChange = null } = {}) {
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

  // seletor da nave: 1 botão por preset de rail.js (SHIP_VISUAL_OPTIONS) — clicar troca na hora
  // (setSetting persiste; a nave só é remontada de fato no início da PRÓXIMA partida, igual
  // aos outros ajustes desta tela)
  const shipRow = document.createElement('div')
  shipRow.className = 'settings-row'
  const shipLabel = document.createElement('label')
  shipLabel.textContent = 'Visual da nave'
  shipRow.appendChild(shipLabel)

  const shipButtonsWrap = document.createElement('div')
  shipButtonsWrap.className = 'btn-row'
  const shipButtons = {}
  for (const option of SHIP_VISUAL_OPTIONS) {
    const btn = document.createElement('button')
    btn.className = 'btn-secondary'
    btn.textContent = option.label
    btn.addEventListener('click', () => {
      setSetting('shipVisual', option.id)
      renderShipButtons()
    })
    shipButtons[option.id] = btn
    shipButtonsWrap.appendChild(btn)
  }
  shipRow.appendChild(shipButtonsWrap)
  visualSection.appendChild(shipRow)

  function renderShipButtons() {
    const current = getSettings().shipVisual
    for (const [id, btn] of Object.entries(shipButtons)) btn.classList.toggle('active', id === current)
  }
  renderShipButtons()

  // seletor do estilo do cluster de vida/escudo/impulso: canto fixo (clássico, como sempre foi)
  // vs. arcos que acompanham a nave na tela (orbital — pedido do usuário). Mesmo padrão do
  // seletor de nave acima: setSetting persiste, mas createGameHud só lê isso na criação do HUD,
  // então a troca vale a partir do próximo jogo, não ao vivo em partida.
  const vitalsStyleRow = document.createElement('div')
  vitalsStyleRow.className = 'settings-row'
  const vitalsStyleLabel = document.createElement('label')
  vitalsStyleLabel.textContent = 'Estilo do HUD de vida/escudo/impulso'
  vitalsStyleRow.appendChild(vitalsStyleLabel)

  const vitalsStyleButtonsWrap = document.createElement('div')
  vitalsStyleButtonsWrap.className = 'btn-row'
  const VITALS_STYLE_OPTIONS = [
    { id: 'classic', label: 'Clássico (canto)' },
    { id: 'orbital', label: 'Orbital (ao redor da nave)' },
  ]
  const vitalsStyleButtons = {}
  for (const option of VITALS_STYLE_OPTIONS) {
    const btn = document.createElement('button')
    btn.className = 'btn-secondary'
    btn.textContent = option.label
    btn.addEventListener('click', () => {
      setSetting('vitalsHudStyle', option.id)
      renderVitalsStyleButtons()
    })
    vitalsStyleButtons[option.id] = btn
    vitalsStyleButtonsWrap.appendChild(btn)
  }
  vitalsStyleRow.appendChild(vitalsStyleButtonsWrap)
  visualSection.appendChild(vitalsStyleRow)

  function renderVitalsStyleButtons() {
    const current = getSettings().vitalsHudStyle
    for (const [id, btn] of Object.entries(vitalsStyleButtons)) btn.classList.toggle('active', id === current)
  }
  renderVitalsStyleButtons()

  const damageRow = document.createElement('div')
  damageRow.className = 'settings-row settings-row-stacked'
  const damageLabel = document.createElement('label')
  damageLabel.textContent = 'Números de dano (jogador e aliados)'
  damageRow.appendChild(damageLabel)

  const damageChoices = document.createElement('div')
  damageChoices.className = 'damage-style-choices'
  const damageButtons = {}
  const DAMAGE_STYLES = [
    { id: 'classic', glyph: '123', label: 'Clássico', hint: 'Direto e discreto' },
    { id: 'manga', glyph: 'BAM!', label: 'Mangá', hint: 'Impactos em quadros' },
    { id: 'orbit', glyph: '◎', label: 'Buraco negro', hint: 'Dano em órbita' },
  ]
  for (const option of DAMAGE_STYLES) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'damage-style-card'
    btn.setAttribute('aria-label', `${option.label}: ${option.hint}`)
    const glyph = document.createElement('strong')
    glyph.textContent = option.glyph
    const copy = document.createElement('span')
    const name = document.createElement('b')
    name.textContent = option.label
    const hint = document.createElement('small')
    hint.textContent = option.hint
    copy.append(name, hint)
    btn.append(glyph, copy)
    btn.addEventListener('click', () => {
      setSetting('damageNumberStyle', option.id)
      renderDamageButtons()
      onDamageStyleChange?.()
    })
    damageButtons[option.id] = btn
    damageChoices.appendChild(btn)
  }
  damageRow.appendChild(damageChoices)
  visualSection.appendChild(damageRow)

  const damageOrbitRow = document.createElement('div')
  damageOrbitRow.className = 'settings-row'
  const damageOrbitLabel = document.createElement('label')
  damageOrbitLabel.textContent = 'Órbita cooperativa em inimigos resistentes (12+ HP)'
  const damageOrbitCheckbox = document.createElement('input')
  damageOrbitCheckbox.type = 'checkbox'
  damageOrbitCheckbox.checked = getSettings().damageOrbitEnabled !== false
  damageOrbitCheckbox.addEventListener('change', () => {
    setSetting('damageOrbitEnabled', damageOrbitCheckbox.checked)
    onDamageStyleChange?.()
  })
  damageOrbitRow.append(damageOrbitLabel, damageOrbitCheckbox)
  visualSection.appendChild(damageOrbitRow)
  const damageOrbitHint = document.createElement('p')
  damageOrbitHint.className = 'settings-hint'
  damageOrbitHint.textContent = 'Só afeta Buraco negro. É puramente visual e só arma quando jogador/aliados compartilham o mesmo alvo em até 1s.'
  visualSection.appendChild(damageOrbitHint)

  function renderDamageButtons() {
    const current = getSettings().damageNumberStyle
    for (const [id, btn] of Object.entries(damageButtons)) {
      const active = id === current
      btn.classList.toggle('active', active)
      btn.setAttribute('aria-pressed', String(active))
    }
    damageOrbitCheckbox.disabled = current !== 'orbit'
    damageOrbitRow.classList.toggle('disabled', current !== 'orbit')
  }
  renderDamageButtons()

  const damageHint = document.createElement('p')
  damageHint.className = 'settings-hint'
  damageHint.textContent = 'A troca vale para os próximos impactos, inclusive ao voltar da pausa.'
  visualSection.appendChild(damageHint)

  return visualSection
}

function buildDamagePreview() {
  const el = document.createElement('aside')
  el.className = 'settings-damage-preview'

  const eyebrow = document.createElement('span')
  eyebrow.className = 'settings-preview-eyebrow'
  eyebrow.textContent = 'SIMULAÇÃO AO VIVO'
  const title = document.createElement('h3')
  title.textContent = 'Leitura de impacto'
  const copy = document.createElement('p')
  copy.textContent = 'O mesmo efeito usado em combate, com cada piloto preservando sua própria cor.'

  const stage = document.createElement('div')
  stage.className = 'settings-damage-stage'
  stage.setAttribute('aria-label', 'Prévia animada dos números de dano')
  const reticle = document.createElement('div')
  reticle.className = 'settings-preview-reticle'
  const target = document.createElement('div')
  target.className = 'settings-preview-target'
  const targetCore = document.createElement('div')
  targetCore.className = 'settings-preview-target-core'
  target.appendChild(targetCore)
  stage.append(reticle, target)

  const footer = document.createElement('div')
  footer.className = 'settings-preview-footer'
  const current = document.createElement('span')
  const replayButton = document.createElement('button')
  replayButton.type = 'button'
  replayButton.className = 'btn-secondary settings-preview-replay'
  replayButton.textContent = '↻ Repetir impacto'
  footer.append(current, replayButton)
  el.append(eyebrow, title, copy, stage, footer)

  const damageNumbers = createDamageNumbers(stage)
  const timeouts = new Set()
  let kickoffRaf = null
  const labels = { classic: 'CLÁSSICO', manga: 'MANGÁ', orbit: 'BURACO NEGRO' }

  function clearSequence() {
    for (const timeout of timeouts) clearTimeout(timeout)
    timeouts.clear()
    damageNumbers.dispose()
  }

  function schedule(delay, fn) {
    const timeout = setTimeout(() => {
      timeouts.delete(timeout)
      fn()
    }, delay)
    timeouts.add(timeout)
  }

  function replay() {
    clearSequence()
    current.textContent = labels[getSettings().damageNumberStyle] || labels.classic
    stage.classList.remove('is-firing')
    void stage.offsetWidth
    stage.classList.add('is-firing')
    schedule(40, () => damageNumbers.spawn(.5, .5, 12, { targetId: 'preview-drone', orbitActive: false }))
    schedule(230, () => damageNumbers.spawn(.5, .5, 7, { targetId: 'preview-drone', pilotId: 0, orbitActive: true }))
    schedule(330, () => damageNumbers.spawn(.5, .5, 5, { targetId: 'preview-drone', pilotId: 1, orbitActive: true }))
    schedule(430, () => damageNumbers.spawn(.5, .5, 6, { targetId: 'preview-drone', pilotId: 2, orbitActive: true }))
  }

  replayButton.addEventListener('click', replay)

  return {
    el,
    replay,
    start() { kickoffRaf = requestAnimationFrame(replay) },
    dispose() {
      if (kickoffRaf) cancelAnimationFrame(kickoffRaf)
      clearSequence()
    },
  }
}

// Overhaul 4 (fog como mecânica) — as 3 flags viviam em settings.js com valor padrão fixo mas
// sem controle nenhum na UI (pedido pelo próprio doc do overhaul, §2.6/§3.6: "jogador precisa
// poder desligar isso"). Mesmo padrão de reaproveitamento das outras seções (builder exportado,
// usado pela tela de Configurações completa e pelo painel de pausa).
export function buildFogSection() {
  const fogSection = document.createElement('div')
  fogSection.className = 'settings-section'
  const fogTitle = document.createElement('h3')
  fogTitle.textContent = 'Névoa (Fog)'
  fogSection.appendChild(fogTitle)

  const FOG_TOGGLES = [
    { key: 'minimapGhostBlips', label: 'Radar: blips fantasma pra inimigos escondidos na névoa' },
    { key: 'fogTacticalEffects', label: 'Inimigos reagem à névoa densa (mais escondidos/discretos)' },
    { key: 'fogTacticalColors', label: 'Névoa colorida nos avisos de chefe/dourado/tempestade' },
  ]
  for (const { key, label } of FOG_TOGGLES) {
    const row = document.createElement('div')
    row.className = 'settings-row'
    const rowLabel = document.createElement('label')
    rowLabel.textContent = label
    row.appendChild(rowLabel)
    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.checked = getSettings()[key]
    checkbox.addEventListener('change', () => setSetting(key, checkbox.checked))
    row.appendChild(checkbox)
    fogSection.appendChild(row)
  }

  return fogSection
}

// Bullet-time no Card Choice (Docs/Bullet-time no Card Choice (Arcade).md) — mesmo padrão de
// reaproveitamento das outras seções (builder exportado, usado pela tela de Configurações
// completa e pelo painel de pausa).
export function buildArcadeSection() {
  const arcadeSection = document.createElement('div')
  arcadeSection.className = 'settings-section'
  const arcadeTitle = document.createElement('h3')
  arcadeTitle.textContent = 'Modo Arcade'
  arcadeSection.appendChild(arcadeTitle)

  const row = document.createElement('div')
  row.className = 'settings-row'
  const label = document.createElement('label')
  label.textContent = 'Pausar totalmente na escolha de cartas (desligado = câmera lenta)'
  row.appendChild(label)
  const checkbox = document.createElement('input')
  checkbox.type = 'checkbox'
  checkbox.checked = getSettings().arcadeCardChoicePauses
  checkbox.addEventListener('change', () => setSetting('arcadeCardChoicePauses', checkbox.checked))
  row.appendChild(checkbox)
  arcadeSection.appendChild(row)

  const hint = document.createElement('p')
  hint.className = 'settings-hint'
  hint.textContent = 'Só se aplica ao modo arcade (sem baralho) — no modo com baralho a escolha de carta sempre pausa.'
  arcadeSection.appendChild(hint)

  return arcadeSection
}

// Overhaul de Personalidade (Ideia 3): rádio dos aliados — frases curtas em momentos-chave,
// puramente cosmético. Ver settings.js (wingmanRadioEnabled) e combat/wingman-radio.js.
export function buildRadioSection() {
  const radioSection = document.createElement('div')
  radioSection.className = 'settings-section'
  const radioTitle = document.createElement('h3')
  radioTitle.textContent = 'Rádio do Esquadrão'
  radioSection.appendChild(radioTitle)

  const row = document.createElement('div')
  row.className = 'settings-row'
  const label = document.createElement('label')
  label.textContent = 'Pilotos falam em momentos-chave (engajar, abate, vida baixa...)'
  row.appendChild(label)
  const checkbox = document.createElement('input')
  checkbox.type = 'checkbox'
  checkbox.checked = getSettings().wingmanRadioEnabled
  checkbox.addEventListener('change', () => setSetting('wingmanRadioEnabled', checkbox.checked))
  row.appendChild(checkbox)
  radioSection.appendChild(row)

  const hint = document.createElement('p')
  hint.className = 'settings-hint'
  hint.textContent = 'Puramente cosmético — não muda comportamento, dano ou timing do esquadrão.'
  radioSection.appendChild(hint)

  return radioSection
}

// Controles de áudio persistentes. O modo rádio é útil para quem quer manter a ambientação das
// transmissões sem os demais efeitos de combate.
export function buildAudioSection() {
  const section = document.createElement('div')
  section.className = 'settings-section'
  const title = document.createElement('h3')
  title.textContent = 'Áudio'
  section.appendChild(title)

  const modeRow = document.createElement('div')
  modeRow.className = 'settings-row'
  const modeLabel = document.createElement('label')
  modeLabel.textContent = 'Reprodução de áudio'
  const mode = document.createElement('select')
  for (const [value, label] of [['all', 'Tudo ligado'], ['radio', 'Somente rádio'], ['off', 'Desligado']]) {
    const option = document.createElement('option')
    option.value = value
    option.textContent = label
    mode.appendChild(option)
  }
  mode.value = getSettings().audioMode
  mode.addEventListener('change', () => setSetting('audioMode', mode.value))
  modeRow.append(modeLabel, mode)
  section.appendChild(modeRow)

  const volumeRow = document.createElement('div')
  volumeRow.className = 'settings-row'
  const volumeLabel = document.createElement('label')
  volumeLabel.textContent = 'Volume'
  const volume = document.createElement('input')
  volume.type = 'range'
  volume.min = '0'
  volume.max = '100'
  volume.step = '1'
  volume.value = String(Math.round(getSettings().audioVolume * 100))
  const value = document.createElement('span')
  value.textContent = `${volume.value}%`
  volume.addEventListener('input', () => {
    value.textContent = `${volume.value}%`
    setSetting('audioVolume', Number(volume.value) / 100)
  })
  volumeRow.append(volumeLabel, volume, value)
  section.appendChild(volumeRow)
  return section
}

// Fase 9 (ideia all-range 5): sensibilidade de giro configurável
export function buildSensitivitySection() {
  const allRangeSection = document.createElement('div')
  allRangeSection.className = 'settings-section'
  const allRangeTitle = document.createElement('h3')
  allRangeTitle.textContent = 'Modo All-Range'
  allRangeSection.appendChild(allRangeTitle)

  const turnRow = document.createElement('div')
  turnRow.className = 'settings-row'
  const turnLabel = document.createElement('label')
  turnLabel.textContent = 'Sensibilidade de giro'
  turnRow.appendChild(turnLabel)
  const turnInput = document.createElement('input')
  turnInput.type = 'range'
  turnInput.min = '0.5'
  turnInput.max = '2'
  turnInput.step = '0.1'
  turnInput.value = String(getSettings().arenaTurnSensitivity)
  const turnValueLabel = document.createElement('span')
  turnValueLabel.textContent = `${Number(turnInput.value).toFixed(1)}x`
  turnInput.addEventListener('input', () => {
    turnValueLabel.textContent = `${Number(turnInput.value).toFixed(1)}x`
    setSetting('arenaTurnSensitivity', Number(turnInput.value))
  })
  turnRow.appendChild(turnInput)
  turnRow.appendChild(turnValueLabel)
  allRangeSection.appendChild(turnRow)
  return allRangeSection
}

// Editor de teclado (não inclui gamepad — a tela de Configurações completa continua sendo o
// único lugar pra isso, ver showSettingsScreen abaixo). Retorna {el, cleanup} porque precisa de
// um listener global de keydown pro modo "Pressione uma tecla..." — quem monta isso num overlay
// que pode fechar (ex.: painel de pausa) PRECISA chamar cleanup() antes de descartar o `el`,
// senão o listener vaza e continua capturando teclas depois do painel sumir.
export function buildKeybindSection() {
  let waitingRebindAction = null
  let waitingRebindBtn = null

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

  return { el: controlsSection, cleanup: () => window.removeEventListener('keydown', onRebindKeyDown) }
}

// Extraído de hud.js na refatoração que separa cada tela em seu próprio arquivo. Zero mudança
// de comportamento.
export function showSettingsScreen({ onBack }) {
  showScreen('settings')
  const root = document.getElementById('settings-screen')
  root.innerHTML = ''
  const app = document.getElementById('app')
  app.classList.add('settings-mode')

  let gamepadRaf = null
  let waitingGpAction = null
  let waitingGpBtn = null
  // botões pressionados no frame anterior — usado só pra detectar a borda de subida enquanto
  // se espera o próximo aperto pra mapear uma ação (evita capturar o mesmo aperto que abriu o
  // modo "Pressione um botão..." se ele ainda estiver segurado)
  let prevGpButtonsPressed = {}

  const masthead = document.createElement('header')
  masthead.className = 'settings-masthead'
  const mastheadCopy = document.createElement('div')
  const eyebrow = document.createElement('span')
  eyebrow.className = 'settings-eyebrow'
  eyebrow.textContent = 'ARWING // SISTEMAS DE BORDO'
  const title = document.createElement('h2')
  title.textContent = 'Configurações'
  const subtitle = document.createElement('p')
  subtitle.textContent = 'Ajuste a experiência de voo e veja as mudanças visuais antes de decolar.'
  mastheadCopy.append(eyebrow, title, subtitle)
  const back = document.createElement('button')
  back.className = 'back-link settings-back-button'
  back.textContent = '← Voltar ao hangar'
  back.addEventListener('click', () => { cleanup(); onBack() })
  masthead.append(mastheadCopy, back)
  root.appendChild(masthead)

  const consoleEl = document.createElement('div')
  consoleEl.className = 'settings-console'
  const navigation = document.createElement('nav')
  navigation.className = 'settings-navigation'
  navigation.setAttribute('role', 'tablist')
  navigation.setAttribute('aria-label', 'Categorias de configuração')
  const content = document.createElement('div')
  content.className = 'settings-content'
  consoleEl.append(navigation, content)
  root.appendChild(consoleEl)

  const categoryDefs = [
    { id: 'visual', glyph: '◈', label: 'Visual', hint: 'HUD e impactos' },
    { id: 'game', glyph: '✦', label: 'Partida', hint: 'Vida e arcade' },
    { id: 'controls', glyph: '⌁', label: 'Controles', hint: 'Teclado e gamepad' },
    { id: 'fog', glyph: '≋', label: 'Névoa', hint: 'Leitura tática' },
    { id: 'squad', glyph: '◇', label: 'Esquadrão', hint: 'Alas e rádio' },
  ]
  const categoryButtons = {}
  const panels = {}
  categoryDefs.forEach((category, categoryIndex) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'settings-nav-button'
    button.id = `settings-tab-${category.id}`
    button.setAttribute('role', 'tab')
    button.setAttribute('aria-controls', `settings-panel-${category.id}`)
    const glyph = document.createElement('strong')
    glyph.textContent = category.glyph
    const navCopy = document.createElement('span')
    const label = document.createElement('b')
    label.textContent = category.label
    const hint = document.createElement('small')
    hint.textContent = category.hint
    navCopy.append(label, hint)
    button.append(glyph, navCopy)
    navigation.appendChild(button)

    const panel = document.createElement('section')
    panel.id = `settings-panel-${category.id}`
    panel.className = 'settings-category-panel'
    panel.setAttribute('role', 'tabpanel')
    panel.setAttribute('aria-labelledby', button.id)
    content.appendChild(panel)
    categoryButtons[category.id] = button
    panels[category.id] = panel
    button.addEventListener('click', () => activateCategory(category.id))
    button.addEventListener('keydown', (event) => {
      const delta = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0
      let nextIndex = categoryIndex
      if (delta) nextIndex = (categoryIndex + delta + categoryDefs.length) % categoryDefs.length
      else if (event.key === 'Home') nextIndex = 0
      else if (event.key === 'End') nextIndex = categoryDefs.length - 1
      else return
      event.preventDefault()
      const next = categoryDefs[nextIndex].id
      activateCategory(next)
      categoryButtons[next].focus()
    })
  })

  function activateCategory(categoryId) {
    for (const category of categoryDefs) {
      const active = category.id === categoryId
      categoryButtons[category.id].classList.toggle('active', active)
      categoryButtons[category.id].setAttribute('aria-selected', String(active))
      categoryButtons[category.id].tabIndex = active ? 0 : -1
      panels[category.id].hidden = !active
    }
  }

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

  const squadSetupSection = document.createElement('div')
  squadSetupSection.className = 'settings-section'
  const squadSetupTitle = document.createElement('h3')
  squadSetupTitle.textContent = 'Formação inicial'
  squadSetupSection.appendChild(squadSetupTitle)

  const wingmanRow = document.createElement('div')
  wingmanRow.className = 'settings-row'
  const wingmanLabel = document.createElement('label')
  wingmanLabel.textContent = 'Companheiros iniciais na ala'
  wingmanRow.appendChild(wingmanLabel)
  const wingmanSelect = document.createElement('select')
  const wingmanOpts = [
    { val: 0, text: 'Nenhum (Voo Solo)' },
    { val: 1, text: '1 Ala (Falco)' },
    { val: 2, text: '2 Alas (Falco & Peppy)' },
    { val: 3, text: '3 Alas (Falco, Peppy & Slippy)' },
    { val: 4, text: '4 Alas (Esquadrão Completo)' },
  ]
  wingmanOpts.forEach((o) => {
    const opt = document.createElement('option')
    opt.value = String(o.val)
    opt.textContent = o.text
    if ((getSettings().startingWingmen || 0) === o.val) opt.selected = true
    wingmanSelect.appendChild(opt)
  })
  wingmanSelect.addEventListener('change', () => {
    setSetting('startingWingmen', Number(wingmanSelect.value) || 0)
  })
  wingmanRow.appendChild(wingmanSelect)
  squadSetupSection.appendChild(wingmanRow)

  panels.game.appendChild(lifeSection)

  const damagePreview = buildDamagePreview()
  const visualLayout = document.createElement('div')
  visualLayout.className = 'settings-visual-layout'
  visualLayout.append(buildVisualSection({ onDamageStyleChange: damagePreview.replay }), damagePreview.el)
  panels.visual.appendChild(visualLayout)
  panels.fog.appendChild(buildFogSection())
  panels.game.appendChild(buildArcadeSection())
  panels.game.appendChild(buildAudioSection())
  panels.squad.appendChild(squadSetupSection)
  panels.squad.appendChild(buildRadioSection())
  panels.controls.appendChild(buildSensitivitySection())

  const { el: controlsSection, cleanup: cleanupKeybindSection } = buildKeybindSection()
  panels.controls.appendChild(controlsSection)

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

  const axesLabel = document.createElement('p')
  axesLabel.textContent = 'Eixos do controle conectado (clique X/Y num eixo pra usá-lo como movimento):'
  gpSection.appendChild(axesLabel)

  const axesBarsWrap = document.createElement('div')
  gpSection.appendChild(axesBarsWrap)

  // mapeamento genérico ação → botão: uma linha por ação (mesmo texto de ACTIONS, reaproveitado
  // pra não duplicar os labels), clique em "Definir" espera o próximo aperto no controle
  const gpActionsLabel = document.createElement('p')
  gpActionsLabel.textContent = 'Ações mapeáveis a um botão do controle:'
  gpSection.appendChild(gpActionsLabel)

  const gpActionRows = document.createElement('div')
  gpSection.appendChild(gpActionRows)
  renderGpActionRows()

  const buttonsLabel = document.createElement('p')
  buttonsLabel.textContent = 'Botões do controle (feedback visual — pressione um físico pra ver qual índice é qual):'
  gpSection.appendChild(buttonsLabel)

  const buttonsWrap = document.createElement('div')
  buttonsWrap.className = 'gp-buttons'
  gpSection.appendChild(buttonsWrap)

  panels.controls.appendChild(gpSection)

  function actionLabel(actionId) {
    return ACTIONS.find((a) => a.id === actionId)?.label || actionId
  }

  function renderGpActionRows() {
    gpActionRows.innerHTML = ''
    const bindings = getBindings()
    for (const actionId of GAMEPAD_ACTIONS) {
      const row = document.createElement('div')
      row.className = 'keybind-row'
      const label = document.createElement('span')
      label.textContent = actionLabel(actionId)
      row.appendChild(label)

      const idxs = bindings.gamepad.buttons[actionId] || []
      const btn = document.createElement('button')
      btn.className = 'keybind-btn'
      btn.textContent = idxs.length ? `Botão ${idxs.join(' / ')}` : '—'
      btn.addEventListener('click', () => startGpRebind(actionId, btn))
      row.appendChild(btn)

      if (idxs.length) {
        const clearBtn = document.createElement('button')
        clearBtn.className = 'btn-secondary'
        clearBtn.textContent = 'Limpar'
        clearBtn.addEventListener('click', () => {
          clearGamepadActionButton(actionId)
          renderGpActionRows()
        })
        row.appendChild(clearBtn)
      }

      gpActionRows.appendChild(row)
    }
  }

  function startGpRebind(actionId, btn) {
    if (waitingGpBtn) {
      waitingGpBtn.classList.remove('waiting')
      waitingGpBtn.textContent = waitingGpBtn.dataset.prevLabel
    }
    waitingGpAction = actionId
    waitingGpBtn = btn
    btn.dataset.prevLabel = btn.textContent
    btn.textContent = 'Pressione um botão no controle...'
    btn.classList.add('waiting')
  }

  function assignGpButton(buttonIndex) {
    setGamepadActionButton(waitingGpAction, buttonIndex)
    waitingGpAction = null
    waitingGpBtn = null
    renderGpActionRows()
  }

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

      const currPressed = {}
      pad.buttons.forEach((b, i) => {
        currPressed[i] = !!b.pressed
        const chip = document.createElement('button')
        chip.className = 'gp-btn-chip'
        if (b.pressed) chip.classList.add('pressed')
        chip.textContent = String(i)
        chip.title = waitingGpAction ? 'Clique pra usar este botão' : 'Índice do botão no controle'
        chip.addEventListener('click', () => {
          if (waitingGpAction) assignGpButton(i)
        })
        buttonsWrap.appendChild(chip)
      })

      // modo "Pressione um botão...": detecta a borda de subida (não o hold) pra não capturar
      // o clique do mouse no botão "Definir" nem um botão físico que já estava segurado
      if (waitingGpAction) {
        for (let i = 0; i < pad.buttons.length; i += 1) {
          if (currPressed[i] && !prevGpButtonsPressed[i]) { assignGpButton(i); break }
        }
      }
      prevGpButtonsPressed = currPressed
    }

    gamepadRaf = requestAnimationFrame(pollGamepad)
  }
  pollGamepad()
  activateCategory('visual')
  damagePreview.start()

  function cleanup() {
    cleanupKeybindSection()
    if (gamepadRaf) cancelAnimationFrame(gamepadRaf)
    damagePreview.dispose()
    app.classList.remove('settings-mode')
  }
}
