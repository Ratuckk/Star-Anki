import { showScreen } from './hud-shared.js'
import { listDecks } from './decks.js'

export function showPreGameMenu({ onPlay, onAddDeck, onSettings }) {
  showScreen('pregame')
  const root = document.getElementById('pregame-screen')
  root.innerHTML = ''

  const decks = listDecks()
  const hasDecks = decks.length > 0
  const activeDeck = hasDecks ? decks[0] : null

  // 1. Título & Subtítulo
  const title = document.createElement('h1')
  title.innerHTML = 'Star Anki <span class="version-tag">v0.53.2</span>'
  root.appendChild(title)

  const desc = document.createElement('p')
  desc.className = 'pregame-desc'
  desc.textContent = 'Transforme um baralho exportado do Anki num rail shooter de estudo.'
  root.appendChild(desc)

  // 2. Card discreto do Baralho Ativo
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
      <div class="deck-card-meta">Adicione um arquivo .txt exportado do Anki para começar a jogar.</div>
    `
  }
  root.appendChild(deckCard)

  // 3. Ações principais
  const actions = document.createElement('div')
  actions.className = 'menu-actions'

  const playBtn = document.createElement('button')
  playBtn.id = 'btn-pregame-play'
  playBtn.textContent = hasDecks ? 'Jogar' : 'Adicionar baralho'
  playBtn.addEventListener('click', hasDecks ? onPlay : onAddDeck)
  actions.appendChild(playBtn)

  const btnRow = document.createElement('div')
  btnRow.className = 'btn-row'

  const decksBtn = document.createElement('button')
  decksBtn.id = 'btn-pregame-decks'
  decksBtn.className = 'btn-secondary'
  decksBtn.textContent = hasDecks ? 'Gerenciar baralhos' : 'Importar baralho'
  decksBtn.addEventListener('click', onPlay)
  btnRow.appendChild(decksBtn)

  const settingsBtn = document.createElement('button')
  settingsBtn.id = 'btn-pregame-settings'
  settingsBtn.className = 'btn-secondary'
  settingsBtn.textContent = 'Configurações'
  settingsBtn.addEventListener('click', onSettings)
  btnRow.appendChild(settingsBtn)

  actions.appendChild(btnRow)
  root.appendChild(actions)

  // 4. Rodapé discreto de controles
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
