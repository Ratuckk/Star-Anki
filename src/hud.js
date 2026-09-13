// Fachada — o resto do projeto (main.js) continua importando tudo daqui, sem saber que por
// trás cada tela agora mora no seu próprio arquivo (hud-*.js). Refatoração puramente
// estrutural: hud.js tinha ~1650 linhas misturando CSS, telas de fora do jogo (menu/baralhos/
// config), o HUD de partida e as telas de fim — zero mudança de comportamento aqui, só
// separação por responsabilidade (mesmo padrão já usado em combat.js → enemies.js/player.js).
export { showPreGameMenu } from './hud-pregame.js'
export { showDeckManager } from './hud-decks.js'
export { showSettingsScreen } from './hud-settings.js'
export { createGameHud } from './hud-game.js'
export { showSectorEnd, showPainelCard, showPainelAnswer } from './hud-end.js'
