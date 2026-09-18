import { getSettings, setSetting } from './settings.js'
import {
  getBindings, setBinding, resetToDefaults, setGamepadBinding, codeToLabel, ACTIONS,
  GAMEPAD_ACTIONS, setGamepadActionButton, clearGamepadActionButton,
} from './keybindings.js'
import { showScreen } from './hud-shared.js'
import { SHIP_VISUAL_OPTIONS } from './rail.js'

// Extraído de hud.js na refatoração que separa cada tela em seu próprio arquivo. Zero mudança
// de comportamento.
export function showSettingsScreen({ onBack }) {
  showScreen('settings')
  const root = document.getElementById('settings-screen')
  root.innerHTML = ''

  let gamepadRaf = null
  let waitingRebindAction = null
  let waitingRebindBtn = null
  let waitingGpAction = null
  let waitingGpBtn = null
  // botões pressionados no frame anterior — usado só pra detectar a borda de subida enquanto
  // se espera o próximo aperto pra mapear uma ação (evita capturar o mesmo aperto que abriu o
  // modo "Pressione um botão..." se ele ainda estiver segurado)
  let prevGpButtonsPressed = {}

  const back = document.createElement('button')
  back.className = 'back-link'
  back.textContent = '← Voltar'
  back.addEventListener('click', () => { cleanup(); onBack() })
  root.appendChild(back)

  const title = document.createElement('h2')
  title.textContent = 'Configurações'
  root.appendChild(title)

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
  lifeSection.appendChild(wingmanRow)

  root.appendChild(lifeSection)

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

  root.appendChild(visualSection)

  // Fase 9 (ideia all-range 5): sensibilidade de giro configurável
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
  root.appendChild(allRangeSection)

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

  root.appendChild(gpSection)

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

  function cleanup() {
    window.removeEventListener('keydown', onRebindKeyDown)
    if (gamepadRaf) cancelAnimationFrame(gamepadRaf)
  }
}
