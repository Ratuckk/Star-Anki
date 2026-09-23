// Fachada — o resto do projeto continua importando daqui, sem depender dos módulos internos do HUD.
export { showPreGameMenu } from './hud-pregame.js'
export { showDeckManager } from './hud-decks.js'
export { showSettingsScreen } from './hud-settings.js'
export { showSectorEnd, showPainelCard, showPainelAnswer } from './hud-end.js'

import { createGameHud as createBaseGameHud } from './hud-game.js'
import { createWingmanRadioSlots } from './hud-wingman-radio-slots.js'
import { createHudSpeedlines } from './hud-speedlines.js'

export function createGameHud() {
  const hud = createBaseGameHud()
  const wingmanSlots = createWingmanRadioSlots()
  const speedlines = createHudSpeedlines(document.getElementById('game-screen'))
  const baseUnmount = hud.unmount?.bind(hud)

  // v0.99.28: lateral é EXCLUSIVO de trivial/Call & Response.
  // Ability/Focus já são apresentados no mundo, acima da nave correspondente.
  hud.showWingmanRadio = (payload) => {
    if (!payload || payload.isAbility || payload.inWorld) return
    wingmanSlots.show(payload)
  }

  // O nome legado "Queue" permanece por compatibilidade com game-loop.js, mas a implementação
  // nova NÃO serializa: distribui todos os payloads recebidos simultaneamente nos quatro slots.
  hud.showWingmanRadioQueue = (payloads) => {
    wingmanSlots.showMany(payloads)
  }

  // O contrato antigo do game-loop continua intacto: boost passa intensity=null e usa o
  // preset de gameplay; Swirl/Dash passam 1.0 e elevam apenas a intensidade para 100%.
  hud.setMotionLines = (active, intensity = null) => {
    speedlines.set(active, intensity)
  }

  hud.unmount = () => {
    speedlines.dispose()
    wingmanSlots.dispose()
    baseUnmount?.()
  }

  return hud
}
