import { showScreen } from './hud-shared.js'
import { listDecks } from './decks.js'
import { getSettings } from './settings.js'

export function showPreGameMenu({ onPlay, onAddDeck, onSettings }) {
  showScreen('pregame')
  const root = document.getElementById('pregame-screen')
  root.innerHTML = ''

  const decks = listDecks()
  const settings = getSettings()

  const shipLabels = {
    default: 'Clássica',
    bombardeiro: 'Bombardeiro',
    racer: 'Veloz',
  }
  const shipName = shipLabels[settings.shipVisual] || 'Clássica'

  const hasDecks = decks.length > 0
  const activeDeck = hasDecks ? decks[0] : null

  const wrapper = document.createElement('div')
  wrapper.className = 'pregame-wrapper'

  // 1. Header Hero
  const header = document.createElement('header')
  header.className = 'pregame-header'
  header.innerHTML = `
    <div class="pregame-status-pill">
      <span class="status-indicator-dot"></span>
      <span class="status-indicator-text">SISTEMA OPERACIONAL // v0.53.1</span>
    </div>
    <h1 class="pregame-title">
      <span class="pregame-title-star">STAR</span>
      <span class="pregame-title-anki">ANKI</span>
    </h1>
    <div class="pregame-subtitle">ARCADEMIC SPACE RAIL SHOOTER</div>
    <p class="pregame-desc">Transforme seus baralhos do Anki em combates espaciais estilo Star Fox 64.</p>
  `
  wrapper.appendChild(header)

  // 2. Card Principal de Decolagem / Missão
  const heroCard = document.createElement('section')
  heroCard.className = 'pregame-hero-card'

  const statusLabel = hasDecks ? 'PRONTO PARA DECOLAGEM' : 'AGUARDANDO DADOS DE MISSÃO'
  const deckBadgeText = hasDecks ? `${decks.length} ${decks.length === 1 ? 'baralho pronto' : 'baralhos prontos'}` : 'Sem baralho'
  const deckTitleText = hasDecks ? activeDeck.name : 'Nenhum baralho cadastrado'
  const deckMetaText = hasDecks
    ? `${activeDeck.shooterCount} perguntas no trilho • ${activeDeck.painelCount} no painel de revisão`
    : 'Importe um arquivo .txt ou texto exportado do Anki para iniciar seu treinamento de combate.'
  const playButtonText = hasDecks ? 'Iniciar Missão' : 'Adicionar Primeiro Baralho'

  heroCard.innerHTML = `
    <div class="hero-card-glow" aria-hidden="true"></div>
    <div class="hero-card-header">
      <div class="hero-card-status">
        <span class="hero-card-icon">⚡</span>
        <span>${statusLabel}</span>
      </div>
      <div class="hero-card-badge">${deckBadgeText}</div>
    </div>
    <div class="hero-deck-highlight">
      <div class="hero-deck-title">${deckTitleText}</div>
      <div class="hero-deck-meta">${deckMetaText}</div>
    </div>
  `

  const launchBtn = document.createElement('button')
  launchBtn.className = 'btn-primary-launch'
  launchBtn.id = 'btn-pregame-play'
  launchBtn.innerHTML = `
    <span class="launch-icon">${hasDecks ? '🚀' : '📥'}</span>
    <span class="launch-label">${playButtonText}</span>
  `
  launchBtn.addEventListener('click', hasDecks ? onPlay : onAddDeck)
  heroCard.appendChild(launchBtn)

  wrapper.appendChild(heroCard)

  // 3. Grid de Ações Rápidas (Baralhos e Hangar)
  const grid = document.createElement('div')
  grid.className = 'pregame-grid'

  const decksTile = document.createElement('div')
  decksTile.className = 'pregame-tile'
  decksTile.id = 'btn-pregame-decks'
  decksTile.innerHTML = `
    <div class="tile-icon-box">📚</div>
    <div class="tile-content">
      <div class="tile-title">Gerenciador de Baralhos</div>
      <div class="tile-subtitle">${hasDecks ? 'Selecionar, fundir ou importar novos' : 'Importar seus primeiros flashcards'}</div>
    </div>
    <div class="tile-arrow">➔</div>
  `
  decksTile.addEventListener('click', onPlay)
  grid.appendChild(decksTile)

  const settingsTile = document.createElement('div')
  settingsTile.className = 'pregame-tile'
  settingsTile.id = 'btn-pregame-settings'
  settingsTile.innerHTML = `
    <div class="tile-icon-box">🛸</div>
    <div class="tile-content">
      <div class="tile-title">Hangar & Configurações</div>
      <div class="tile-subtitle">Nave: <strong>${shipName}</strong> • Áudio & Controles</div>
    </div>
    <div class="tile-arrow">➔</div>
  `
  settingsTile.addEventListener('click', onSettings)
  grid.appendChild(settingsTile)

  wrapper.appendChild(grid)

  // 4. Dock Inferior com Controles & Gamepad em tempo real
  const dock = document.createElement('footer')
  dock.className = 'pregame-footer-dock'
  dock.innerHTML = `
    <div class="pregame-controls-summary">
      <span class="control-key-tag">WASD</span> Mover
      <span class="control-sep">•</span>
      <span class="control-key-tag">ESPAÇO</span> Atirar
      <span class="control-sep">•</span>
      <span class="control-key-tag">Z / C</span> Giro
      <span class="control-sep">•</span>
      <span class="control-key-tag">SHIFT</span> Propulsão
    </div>
    <div class="pregame-gamepad-pill" id="pregame-gamepad-indicator">
      <span class="gamepad-status-dot"></span>
      <span class="gamepad-status-label">Gamepad: Verificando...</span>
    </div>
  `
  wrapper.appendChild(dock)

  root.appendChild(wrapper)

  // Detector dinâmico de Gamepad
  const gamepadPill = root.querySelector('#pregame-gamepad-indicator')
  const gamepadLabel = gamepadPill?.querySelector('.gamepad-status-label')

  function updateGamepadStatus() {
    if (!gamepadPill || !gamepadLabel) return
    const gamepads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : []
    const connected = Array.from(gamepads).find((gp) => gp && gp.connected)
    if (connected) {
      gamepadPill.classList.add('connected')
      const name = connected.id ? connected.id.split('(')[0].trim() : 'Controle Conectado'
      gamepadLabel.textContent = `🎮 ${name.slice(0, 18)}`
    } else {
      gamepadPill.classList.remove('connected')
      gamepadLabel.textContent = 'Gamepad: Desconectado'
    }
  }

  updateGamepadStatus()
  window.addEventListener('gamepadconnected', updateGamepadStatus)
  window.addEventListener('gamepaddisconnected', updateGamepadStatus)
}
