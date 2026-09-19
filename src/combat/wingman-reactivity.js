// ============ REATIVIDADE DOS WINGMEN AO ESTADO DO JOGADOR ============
// Overhaul de Personalidade, Ideia 5 (ver Docs/# Overhaul de Personalidade e Vida.md). Roda uma
// vez por frame, ANTES do loop de pilotos em wingmen.js (game-loop.js chama update() aqui e
// repassa o resultado via opts.reactivity pro createSquadronSystem().update) — cada piloto LÊ
// esse objeto compartilhado e ajusta o próprio comportamento, sem mexer em wingmen.js fora dos
// pontos de extensão já existentes.

// "Combo alto" (x2.0+ no sistema de perguntas) não existe no modo sem baralho — session.
// comboMultiplier fica travado em 1.0 lá (nunca roda resolveAnswer). Pedido do usuário: usar o
// kill chain (state.killChainCount) como equivalente NO ARCADE por ora; no modo com baralho essa
// reação fica desligada até decisão futura (não usa comboMultiplier ainda).
// Threshold escolhido pra ficar na mesma ordem de grandeza do x2.0 de perguntas: COMBO_STEP=0.15,
// base 1.0 → (2.0-1.0)/0.15 ≈ 6.7, arredondado pra 7 abates seguidos.
const KILL_CHAIN_HIGH_THRESHOLD = 7

// Janela depois de perder uma vida em que `playerJustLostLife` fica true (Peppy voa na frente
// do jogador, Falco recua pra vaga neutra — ver wingmen.js).
const JUST_LOST_LIFE_WINDOW_MS = 3000

export function createWingmanReactivity() {
  let lastLivesSeen = null
  let lastLifeLossAt = -Infinity

  return {
    update({ session, player, isNoDeck, killChainCount, now = performance.now() }) {
      if (lastLivesSeen != null && session.lives < lastLivesSeen) {
        lastLifeLossAt = now
      }
      lastLivesSeen = session.lives

      const maxHealth = player.getMaxHealth()
      return {
        playerLowHealth: maxHealth > 0 && (session.health / maxHealth) < 0.4,
        playerHighCombo: isNoDeck ? (killChainCount || 0) >= KILL_CHAIN_HIGH_THRESHOLD : false,
        playerJustLostLife: (now - lastLifeLossAt) < JUST_LOST_LIFE_WINDOW_MS,
        playerBoosting: player.isPropulsionActive(),
      }
    },
  }
}
