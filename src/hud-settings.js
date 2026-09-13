import { getSettings, setSetting } from './settings.js'
import { getBindings, setBinding, resetToDefaults, setGamepadBinding, codeToLabel, ACTIONS } from './keybindings.js'
import { showScreen } from './hud-shared.js'

// Extraído de hud.js na refatoração que separa cada tela em seu próprio arquivo. Zero mudança
// de comportamento.
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
