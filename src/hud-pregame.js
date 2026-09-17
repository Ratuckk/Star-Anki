import { showScreen } from './hud-shared.js'
import { listDecks } from './decks.js'
import { getSettings, setSetting } from './settings.js'
import { GAME_VERSION } from './version.js'

export function showPreGameMenu({ onPlay, onPlayNoDeck, onAddDeck, onSettings }) {
  showScreen('pregame')
  const root = document.getElementById('pregame-screen')
  root.innerHTML = ''

  const decks = listDecks()
  const hasDecks = decks.length > 0
  const activeDeck = hasDecks ? decks[0] : null

  // 1. Título & Subtítulo
  const title = document.createElement('h1')
  title.innerHTML = `Star Anki <span class="version-tag">${GAME_VERSION}</span>`
  root.appendChild(title)

  const desc = document.createElement('p')
  desc.className = 'pregame-desc'
  desc.textContent = 'Combate espacial 3D em trilho e arena — jogue no Modo Estudo com repetição espaçada ou no Modo Arcade Roguelike.'
  root.appendChild(desc)

  // 2. Card do Baralho Ativo
  const deckCard = document.createElement('div')
  deckCard.className = 'pregame-deck-card'
  if (hasDecks) {
    deckCard.innerHTML = `
      <div class="deck-card-label">Baralho selecionado</div>
      <div class="deck-card-name">${activeDeck.name}</div>
      <div class="deck-card-meta">${activeDeck.shooterCount} perguntas no trilho • ${activeDeck.painelCount} no painel de revisão</div>
    `
  } else {
    deckCard.innerHTML = `
      <div class="deck-card-label">Nenhum baralho cadastrado</div>
      <div class="deck-card-meta">Inicie direto no Modo Arcade sem perguntas, ou importe um arquivo .txt exportado do Anki.</div>
    `
  }
  root.appendChild(deckCard)

  // 3. Card de Companheiros de Início (Escolta Aliada)
  const wingmanCard = document.createElement('div')
  wingmanCard.className = 'pregame-option-card'
  const wingmanLabel = document.createElement('div')
  wingmanLabel.className = 'deck-card-label'
  wingmanLabel.textContent = '🚀 Companheiros de Início na Ala'
  wingmanCard.appendChild(wingmanLabel)

  const wingmanSelector = document.createElement('div')
  wingmanSelector.className = 'pregame-wingman-selector'

  const wingmanHints = {
    0: 'Voo solo. Recrute novos pilotos durante a missão com cartas de Esquadrão.',
    1: 'Inicia a missão com 1 ala aliado cobrindo seus flancos.',
    2: 'Inicia a missão com 2 alas aliados em formação tática.',
    3: 'Inicia a missão com 3 alas aliados cobrindo a esquadrilha.',
    4: 'Esquadrão completo de 4 naves em formação desde a decolagem!',
  }

  const wingmanHint = document.createElement('div')
  wingmanHint.className = 'deck-card-meta'

  let currentWingmen = getSettings().startingWingmen || 0

  function updateWingmanUi(val) {
    currentWingmen = val
    setSetting('startingWingmen', val)
    const btns = wingmanSelector.querySelectorAll('.wingman-opt-btn')
    btns.forEach((b) => {
      const count = Number(b.dataset.count)
      b.classList.toggle('active', count === currentWingmen)
    })
    wingmanHint.textContent = wingmanHints[currentWingmen] || wingmanHints[0]
  }

  const wingmanOptions = [
    { count: 0, label: 'Solo (0)' },
    { count: 1, label: '+1 Ala' },
    { count: 2, label: '+2 Alas' },
    { count: 3, label: '+3 Alas' },
    { count: 4, label: 'Esquadrão (4)' },
  ]

  wingmanOptions.forEach((opt) => {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = `wingman-opt-btn ${opt.count === currentWingmen ? 'active' : ''}`
    btn.dataset.count = String(opt.count)
    btn.textContent = opt.label
    btn.addEventListener('click', () => updateWingmanUi(opt.count))
    wingmanSelector.appendChild(btn)
  })

  wingmanCard.appendChild(wingmanSelector)
  wingmanHint.textContent = wingmanHints[currentWingmen] || wingmanHints[0]
  wingmanCard.appendChild(wingmanHint)
  root.appendChild(wingmanCard)

  // 4. Ações principais
  const actions = document.createElement('div')
  actions.className = 'menu-actions'

  if (hasDecks) {
    const playDeckBtn = document.createElement('button')
    playDeckBtn.id = 'btn-pregame-play-deck'
    playDeckBtn.textContent = '🎮 Jogar com Baralho'
    playDeckBtn.addEventListener('click', onPlay)
    actions.appendChild(playDeckBtn)

    const playArcadeBtn = document.createElement('button')
    playArcadeBtn.id = 'btn-pregame-play-arcade'
    playArcadeBtn.className = 'btn-arcade'
    playArcadeBtn.textContent = '⚡ Jogar Sem Baralho (Modo Arcade)'
    playArcadeBtn.addEventListener('click', onPlayNoDeck)
    actions.appendChild(playArcadeBtn)

    const btnRow = document.createElement('div')
    btnRow.className = 'btn-row'

    const decksBtn = document.createElement('button')
    decksBtn.id = 'btn-pregame-decks'
    decksBtn.className = 'btn-secondary'
    decksBtn.textContent = 'Gerenciar baralhos'
    decksBtn.addEventListener('click', onPlay)
    btnRow.appendChild(decksBtn)

    const settingsBtn = document.createElement('button')
    settingsBtn.id = 'btn-pregame-settings'
    settingsBtn.className = 'btn-secondary'
    settingsBtn.textContent = 'Configurações'
    settingsBtn.addEventListener('click', onSettings)
    btnRow.appendChild(settingsBtn)

    actions.appendChild(btnRow)
  } else {
    const playArcadeBtn = document.createElement('button')
    playArcadeBtn.id = 'btn-pregame-play-arcade'
    playArcadeBtn.className = 'btn-arcade'
    playArcadeBtn.textContent = '⚡ Jogar Sem Baralho (Modo Arcade)'
    playArcadeBtn.addEventListener('click', onPlayNoDeck)
    actions.appendChild(playArcadeBtn)

    const btnRow = document.createElement('div')
    btnRow.className = 'btn-row'

    const addDeckBtn = document.createElement('button')
    addDeckBtn.id = 'btn-pregame-add-deck'
    addDeckBtn.className = 'btn-secondary'
    addDeckBtn.textContent = 'Importar baralho'
    addDeckBtn.addEventListener('click', onAddDeck)
    btnRow.appendChild(addDeckBtn)

    const settingsBtn = document.createElement('button')
    settingsBtn.id = 'btn-pregame-settings'
    settingsBtn.className = 'btn-secondary'
    settingsBtn.textContent = 'Configurações'
    settingsBtn.addEventListener('click', onSettings)
    btnRow.appendChild(settingsBtn)

    actions.appendChild(btnRow)
  }

  root.appendChild(actions)

  // 5. Rodapé discreto de controles
  const footer = document.createElement('div')
  footer.className = 'pregame-footer'
  footer.innerHTML = `
    <div class="pregame-controls-hint">
      <span>WASD</span> Mover • <span>Espaço</span> Atirar • <span>Z / C</span> Giro • <span>Shift</span> Propulsão
    </div>
    <div class="pregame-gamepad-status" id="pregame-gamepad-status"></div>
  `
  root.appendChild(footer)

  // Detector discreto de Gamepad
  const gamepadStatus = root.querySelector('#pregame-gamepad-status')
  function updateGamepadStatus() {
    if (!gamepadStatus) return
    const gamepads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : []
    const connected = Array.from(gamepads).find((gp) => gp && gp.connected)
    if (connected) {
      const name = connected.id ? connected.id.split('(')[0].trim() : 'Controle Conectado'
      gamepadStatus.textContent = `🎮 ${name.slice(0, 24)}`
      gamepadStatus.style.display = 'block'
    } else {
      gamepadStatus.textContent = ''
      gamepadStatus.style.display = 'none'
    }
  }

  updateGamepadStatus()
  window.addEventListener('gamepadconnected', updateGamepadStatus)
  window.addEventListener('gamepaddisconnected', updateGamepadStatus)
}
