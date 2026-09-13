// Helpers compartilhados entre as telas de hud-*.js — sem lógica de jogo, só DOM/dados puros.
// Extraído de hud.js na refatoração que separa cada tela em seu próprio arquivo (hud.js virou
// fachada, re-exportando tudo). Zero mudança de comportamento.
import { syncRotateOverlay } from './mobile.js'

export const COLOR_MAP = { azul: '#4da6ff', 'âmbar': '#ffb84d', magenta: '#ff4dd2', ciano: '#4dfff2' }

export function shapeMarkup(shape, hex) {
  const attrs = 'width="28" height="28" viewBox="0 0 100 100" aria-hidden="true"'
  if (shape === 'octaedro') return `<svg ${attrs}><polygon points="50,5 95,50 50,95 5,50" fill="${hex}"/></svg>`
  if (shape === 'cubo') return `<svg ${attrs}><rect x="15" y="15" width="70" height="70" fill="${hex}"/></svg>`
  if (shape === 'tetraedro') return `<svg ${attrs}><polygon points="50,10 90,90 10,90" fill="${hex}"/></svg>`
  if (shape === 'icosaedro') return `<svg ${attrs}><circle cx="50" cy="50" r="42" fill="${hex}"/></svg>`
  return ''
}

export function showScreen(name) {
  document.getElementById('pregame-screen').hidden = name !== 'pregame'
  document.getElementById('deck-manager-screen').hidden = name !== 'deckManager'
  document.getElementById('settings-screen').hidden = name !== 'settings'
  document.getElementById('game-screen').hidden = name !== 'game'
  document.getElementById('sector-end-screen').hidden = name !== 'end'
  document.getElementById('painel-screen').hidden = name !== 'painel'
  // suporte mobile: o aviso de "gire o celular" só se aplica à tela de jogo — recalcula sempre
  // que a tela ativa muda (entrar/sair da partida)
  syncRotateOverlay()
}
