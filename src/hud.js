// Fachada — o resto do projeto continua importando daqui, sem depender dos módulos internos do HUD.
export { showPreGameMenu } from './hud-pregame.js'
export { showDeckManager } from './hud-decks.js'
export { showSettingsScreen } from './hud-settings.js'
export { showSectorEnd, showPainelCard, showPainelAnswer } from './hud-end.js'

import { createGameHud as createBaseGameHud } from './hud-game.js'
import { createHudSpeedlines } from './hud-speedlines.js'

export function createGameHud() {
  const hud = createBaseGameHud()
  const speedlines = createHudSpeedlines(document.getElementById('game-screen'))
  const baseUnmount = hud.unmount?.bind(hud)

  // v0.99.30: rádio dos Wingmen volta integralmente aos dois painéis laterais de hud-game.js.
  // Isso restaura estática, connect/disconnect e vozes por piloto. Só o chamado do Fox permanece
  // no mundo, acima da nave do jogador. O renderer de speedlines continua substituindo o spinner.
  hud.setMotionLines = (active, intensity = null) => {
    speedlines.set(active, intensity)
  }

  hud.unmount = () => {
    speedlines.dispose()
    baseUnmount?.()
  }

  return hud
}
