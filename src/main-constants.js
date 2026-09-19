// main-constants.js
//
// Constantes extraídas de main.js na etapa 1 do overhaul de organização. Zero mudança de
// comportamento — só movidas pra cá, mantendo os mesmos comentários explicativos onde eles
// carregam contexto histórico ("pedido do usuário", "v0.xx", "Fase 9", etc.). Nenhuma delas
// é lida ou escrita por fluxo nenhum (não há estado aqui) — são valores fixos que qualquer
// flow extraído nas próximas etapas vai poder importar direto sem depender do closure de
// mountGame.

export const CYCLE_MS = 110000 // era 90000 (pedido do usuário: 110s, compensado pelo avanço por kill abaixo)
// pedido do usuário: "avance este timer em 2 para cada inimigo derrotado durante ele" — todo
// kill de inimigo comum (não só o redutor de tempo, que já reduz bem mais) adianta o ciclo
export const ENEMY_KILL_CYCLE_ADVANCE_MS = 2000
export const WARNING_MS = 10000
export const FEEDBACK_MS = 1500
// v0.29.6: errar não mostra mais o painel de feedback (resposta certa/pontos/combo) — só um
// texto flutuante vermelho pequeno por 3s, e o jogo segura a fase por esse tempo
export const WRONG_FEEDBACK_MS = 3000
export const SPEED_STEP = 0.05
export const BOOST_EVERY_CORRECT = 2
export const GROUND_Y = -10

export const INVINCIBILITY_FLICKER_MS = 90

// ============ SHAKE AO LEVAR HIT ============
export const HIT_SHAKE_DURATION_MS = 300
export const SHIP_SHAKE_MAGNITUDE = 0.3
export const CAMERA_SHAKE_MAGNITUDE = 0.5
// pedido do usuário: shake de tela maior especificamente quando o tiro CARREGADO (teleguiado)
// destrói um inimigo comum, dourado ou o chefe — usa a mesma barra de tempo de hitShakeTimer,
// só com um valor bem acima do shake padrão de kill (120ms)
export const HOMING_KILL_SHAKE_MS = 380

// ============ BACKGROUND POR "NÍVEL" ============
export const LEVEL_BACKGROUNDS = [
  0x000000,
  0x000000,
  0x000000,
  0x000000,
  0x000000,
  0x000000,
]

// ============ MIRA ============
export const RETICLE_AHEAD = 30
export const RETICLE_OVERSHOOT_FACTOR = 0.12
export const RETICLE_SETTLE_RATE = 6

export const BOSS_EVERY_QUESTIONS = 5
export const BOSS_CYCLE_MS = 120000
export const BOSS_ENEMY_INTERVAL_MULT = 0.7
export const BOSS_BUILDUP_MS = 90000
// ============ FASE 5: CAÇADA DE PERGUNTAS DO CHEFE (orbes no mapa) ============
export const BOSS_QUESTION_COUNT = 6 // quantos orbes-pergunta espalhados na arena do chefe
export const BOSS_HUNT_BONUS_MS = 10000 // tempo ganho a cada pergunta acertada durante a caçada
export const BOSS_BASE_HP = 33 // era 3 (pedido do usuário: +30 de vida inicial)
// pedido do usuário: "aumente a quantidade de vida que ele recebe por erro em 20" — troca o
// antigo `bossHealthMultiplier *= 2` (dobrava a cada erro/orbe sem resposta, virava
// exponencial rápido demais) por um bônus aditivo simples, mais fácil de calibrar
export const BOSS_HP_PER_ERROR = 20
// Nível de dificuldade 1-9 (eixo separado de bossHealthBonus/BOSS_HP_PER_ERROR acima — ver
// enemies/shared.js getDifficultyLevel) soma +15hp/nível por cima, sem teto próprio (o teto
// prático é 9 níveis * 15 = +120). Dourado usa o mesmo valor (GOLDEN_HP_PER_LEVEL em golden.js).
export const BOSS_HP_PER_LEVEL = 15
export const BOSS_DEFEAT_BONUS = 500
// Modo sem baralho (arcade): não há perguntas erradas nem session.pointer que avance de verdade
// (fica preso em 0, ver flow-question.js), então o chefe dispara por pontuação acumulada desde o
// último chefe em vez do ciclo de perguntas.
export const BOSS_NO_DECK_SCORE_INTERVAL = 15000
export const BOSS_SPREAD_MIN_BASE = 45
export const BOSS_SPREAD_MAX_BASE = 95
export const BOSS_SPREAD_STEP = 12
export const BOSS_SPREAD_MIN_CAP = 75
export const BOSS_SPREAD_MAX_CAP = 150
export const BOSS_EXTRA_ENEMIES_BASE = 2
export const BOSS_EXTRA_ENEMIES_STEP = 1
export const BOSS_EXTRA_ENEMIES_CAP = 6
export const BOSS_DIFFICULTY_CAP = 5

// intervalo de spawn do modo ARENA
export const ENEMY_INTERVAL_MIN_BASE = 900
export const ENEMY_INTERVAL_MAX_BASE = 1500
export const ENEMY_INTERVAL_FLOOR = 350
export const ENEMY_INTERVAL_STEP = 70
export const ENEMY_AGGRESSION_STEP = 0.15
export const ENEMY_AGGRESSION_CAP = 3.5

// pedido do usuário: escalada explícita e quantificada por pergunta errada, em cima do que já
// existia (intervalo de spawn/enemyCap/enemyAggression, que continuam iguais) — "+1 na geração
// de inimigos a cada 3 erros, +1 na velocidade dos disparos por erro, +1 no dano deles a cada
// 2 erros". Os 3 contadores derivam do mesmo wrongAnswerCount, só dividem por thresholds
// diferentes.
export const ENEMY_SPAWN_BONUS_WRONG_THRESHOLD = 3
export const ENEMY_PROJECTILE_SPEED_PER_WRONG = 1
export const ENEMY_DAMAGE_WRONG_THRESHOLD = 2

// Fase 9 (ideia de baralho, item 1): só desloca o PONTO DE PARTIDA do intervalo de spawn — a
// escalada por erro (applyDifficulty, ENEMY_INTERVAL_STEP) continua igual depois disso. Baralho
// com histórico de muito erro (difficultyBias perto de 1) começa um pouco mais devagar — o
// conteúdo já é difícil, não precisa também punir mais no combate; baralho fácil (bias perto de
// 0) começa um pouco mais rápido.
export const DIFFICULTY_BIAS_INTERVAL_RANGE_MS = 250

// ============ FASE 4: TETO DE INIMIGOS E TAXA DE SPAWN DO MODO NORMAL ============
export const ENEMY_CAP_NORMAL_BASE = 16
export const ENEMY_CAP_ARENA_BASE = 14 // era 20 (pedido do usuário: geração no all-range "um pouco demais")
export const ENEMY_CAP_STEP_PER_ERROR = 1
// pedido do usuário: spawn no all-range um pouco mais espaçado que o padrão (randomEnemyInterval)
export const ARENA_ENEMY_INTERVAL_MULT = 1.3

export const NORMAL_SPAWN_INTERVAL_MS = 2500
export const NORMAL_SPAWN_MIN_COUNT = 2
export const NORMAL_SPAWN_MAX_COUNT = 4
export const NORMAL_SPAWN_PAUSE_BEFORE_QUESTION_MS = 3000
export const MINI_SWARM_CHANCE = 0.22

export const BONUS_INTERVAL_MIN = 9000
export const BONUS_INTERVAL_MAX = 16000

export const REVIEW_ENEMY_INTERVAL_MULT = 0.6

export const GOLDEN_INTERVAL_MIN_MS = 45000
export const GOLDEN_INTERVAL_MAX_MS = 100000
// Pedido do usuário: inimigos no mínimo 20% mais distantes (era 40-90)
export const GOLDEN_SPREAD_MIN = 48 // 40 * 1.2
export const GOLDEN_SPREAD_MAX = 108 // 90 * 1.2

export const TIME_ENEMY_SPAWN_CHANCE = 0.2
// v0.34.0: variante grande da ampulheta — sorteada dentro do mesmo branch de spawn da normal
export const TIME_ENEMY_MEGA_CHANCE = 0.2
// v0.34.0: sentinela entra na mesma rotação de spawn normal (time/mini-swarm/blaster) — mais
// rara, é um mini-encontro de 4 disparos, não um inimigo qualquer
export const SENTINELA_SPAWN_CHANCE = 0.12
// v0.34.0: Detrito (obstáculo cinza) — pedido do usuário: NÃO segue a pausa antes de
// pergunta/dourado nem o currentEnemyCap(), só o "tá em combate de verdade" (enemiesActive)
export const DETRITO_SPAWN_INTERVAL_MIN_MS = 4000
export const DETRITO_SPAWN_INTERVAL_MAX_MS = 8000

// ============ 5 INIMIGOS NOVOS (ideias escolhidas pelo usuário) ============
// Réplica/Verme/Sussurro: só trilho, mesma rotação de sorteio da leva normal (time/mini-swarm/
// sentinela/blaster). Fragata-Escudo: só arena/all-range (o mecanismo de "flanquear" só faz
// sentido lá). Enxame-Ímã: os dois modos, tem seu próprio timer independente (parado, não
// precisa da mesma pausa-antes-de-pergunta dos outros — mesmo princípio do Detrito).
export const REPLICA_SPAWN_CHANCE = 0.1
export const VERME_SPAWN_CHANCE = 0.08
export const SUSSURRO_SPAWN_CHANCE = 0.1
export const FRAGATA_SPAWN_CHANCE = 0.15
// Horda: última checagem da cadeia (ver game-loop.js), só rola se Time/MiniSwarm/Sentinela/
// Réplica/Verme/Sussurro já falharam nesse tick — o nominal 30% (pedido do usuário) já sai bem
// mais raro que isso na prática por causa da posição no fim da cadeia.
export const HORDA_SPAWN_CHANCE = 0.3
export const IMA_SPAWN_INTERVAL_MIN_MS = 10000
export const IMA_SPAWN_INTERVAL_MAX_MS = 18000

// ============ TRANSIÇÃO PARA ALL-RANGE MODE (dourado/chefe se aproximando) — Fase 5 ============
// aviso visível ("surgindo em Ns") nos últimos ARENA_WARNING_COUNTDOWN_MS antes da arena
export const ARENA_WARNING_COUNTDOWN_MS = 5000
// para de gerar inimigo/bônus/dourado novo a partir daqui (3s de silêncio antes do aviso
// começar a contar, mais os 5s do aviso em si = 8s totais sem spawn novo)
export const ARENA_WARNING_STOP_SPAWN_MS = 8000
// duração da cutscene (câmera se ajeitando) entre o fim do aviso e a arena de verdade começar
export const ARENA_CUTSCENE_MS = 2500
export const ARENA_CUTSCENE_PULLBACK = 14
export const ARENA_CUTSCENE_FOV_BUMP = 16
// Fase 8 (VISUAL): leve varredura lateral por cima do pull-back reto (sai e volta, sincronizada
// com o mesmo `pull` do zoom) — dá sensação de dolly/orbit de verdade em vez de câmera só
// recuando em linha reta olhando pro mesmo ponto.
export const ARENA_CUTSCENE_ORBIT = 9

// pedido do usuário: em vez do chefe simplesmente aparecer assim que a caçada de orbes termina
// (acertou a última/errou/tempo acabou), roda a cutscene de apresentação arcade antes de enterBossFight
export const BOSS_SUMMON_CUTSCENE_MS = 3200

// ============ CUTSCENE DE DECOLAGEM / INÍCIO DE MISSÃO ============
// pedido do usuário: "péssimo timing e background/efeitos incorretos" — diagnóstico ao vivo
// (ver cutscenes.js) achou a causa raiz do background: environment.update() nunca rodava
// durante esta cutscene, deixando skyDome/planeta/grid energizado (todos desligados no resto
// do jogo) visíveis o tempo todo por acidente. 2000ms → 2400ms dá mais respiro pro pulso de
// FOV assentar ANTES do handoff (não mais no mesmo frame) sem esticar o hold parado inicial,
// que continua ~700ms em tempo absoluto (só a fração dele muda, ver ignitionT em cutscenes.js).
export const LAUNCH_CUTSCENE_MS = 2400

// ============ CUTSCENE DE MORTE (chefe/dourado explodindo) ============
// pedido do usuário: câmera lenta segurando na explosão do chefe/dourado ao ser derrotado,
// em vez de sair da arena instantaneamente por cima da explosão ainda rodando. Nave travada
// (sem input), tempo desacelerado — a explosão (efeitos + encolhimento do mesh em enemies.js)
// continua rodando normalmente durante a cutscene, só em câmera lenta.
export const DEATH_CUTSCENE_MS = 1200
export const BOSS_DEATH_CUTSCENE_MS = 3000
export const DEATH_CUTSCENE_TIME_SCALE = 0.22
export const DEATH_CUTSCENE_ZOOM_FOV = 55

// ============ ROGUELIKE (fase 4) ============
export const HOMING_LOCK_INTERVAL_MS = 500

export const DODGE_TAP_WINDOW_MS = 350
export const DEFLECT_RADIUS = 6

// ============ PROPULSOR / REPULSOR (A/S — Fase 3) ============
export const RAM_DAMAGE = 5

// ============ VIGNETTE DE VIDA BAIXA ============
export const LOW_HEALTH_THRESHOLD_FRAC = 0.4
