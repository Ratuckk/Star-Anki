// main.js
//
// Bootstrap puro do jogo. Depois do overhaul de organização (etapas 1-7), a lógica da partida
// mora em: mount-game.js (setup + enterCombat + teardown + debug bind), game-loop.js (o tick),
// cutscenes.js (cutscenes), flow-boss.js (chefe/dourado), flow-question.js (pergunta normal +
// cartas), flow-progression.js (escalada por erro + randomizadores), main-constants.js (todas
// as constantes). Este arquivo só liga os dois fios externos: suporte mobile (uma vez) e o
// menu de jogo (que internamente vai chamar mountGame quando o jogador escolhe um baralho).
import { initMobileSupport } from './mobile.js'
import { createGameMenu } from './game-menu.js'
import { mountGame } from './mount-game.js'

initMobileSupport()
const { restart } = createGameMenu(mountGame)
restart()
