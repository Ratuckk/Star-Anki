import { showScreen } from './hud-shared.js'

// Extraído de hud.js na refatoração que separa cada tela em seu próprio arquivo. Zero mudança
// de comportamento.
export function showPreGameMenu({ onPlay, onAddDeck, onSettings }) {
  showScreen('pregame')
  const root = document.getElementById('pregame-screen')
  root.innerHTML = ''

  const title = document.createElement('h1')
  title.innerHTML = 'Star Anki <span class="version-tag">v0.33.0</span>'
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
