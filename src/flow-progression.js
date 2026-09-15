// flow-progression.js
//
// Etapa 6 do overhaul de organização do main.js. Extrai o "cluster de progressão": tudo que
// muta a dificuldade da partida (por erro ou por contexto) e todos os randomizadores de
// intervalo que dependem desses valores. Zero mudança de comportamento.
//
// Motivo de ser um arquivo próprio (e não continuar em main.js como as ~11 function
// declarations hoisted que existiam até a etapa 5): esses helpers eram consumidos tanto pelo
// main.js (tick, enterCombat) quanto pelos dois flows (flow-boss, flow-question) — antes como
// "hoisting elegante", que é frágil (só funciona porque function declarations são içadas; a
// menor mudança de ordem quebra silenciosamente) e o comentário do main.js tinha uma nota de
// desculpa sobre isso desde a etapa 4. Agora o main.js importa o objeto pronto e injeta as
// deps nomeadas nos flows — a dependência fica explícita.
//
// Estado que este módulo lê/muta (via referência compartilhada, todas as chaves já existiam
// em `state` desde a etapa 2): enemyIntervalMin, enemyIntervalMax, enemyAggression,
// wrongAnswerCount, extraSpawnPerBatch, enemyDamageValue, enemyCap, consecutiveCorrect,
// speedMultiplier, bossDifficulty.
//
// Padrão (mesmo dos outros flows): recebe `state` + deps por referência, devolve funções. Não
// guarda estado próprio.

import {
  SPEED_STEP, BOOST_EVERY_CORRECT,
  ENEMY_INTERVAL_FLOOR, ENEMY_INTERVAL_STEP,
  ENEMY_AGGRESSION_STEP, ENEMY_AGGRESSION_CAP,
  ENEMY_SPAWN_BONUS_WRONG_THRESHOLD, ENEMY_PROJECTILE_SPEED_PER_WRONG, ENEMY_DAMAGE_WRONG_THRESHOLD,
  ENEMY_CAP_NORMAL_BASE, ENEMY_CAP_ARENA_BASE, ENEMY_CAP_STEP_PER_ERROR,
  BOSS_DIFFICULTY_CAP,
  BOSS_SPREAD_MIN_BASE, BOSS_SPREAD_MAX_BASE, BOSS_SPREAD_STEP,
  BOSS_SPREAD_MIN_CAP, BOSS_SPREAD_MAX_CAP,
  BOSS_EXTRA_ENEMIES_BASE, BOSS_EXTRA_ENEMIES_STEP, BOSS_EXTRA_ENEMIES_CAP,
  BONUS_INTERVAL_MIN, BONUS_INTERVAL_MAX,
  GOLDEN_INTERVAL_MIN_MS, GOLDEN_INTERVAL_MAX_MS,
  DETRITO_SPAWN_INTERVAL_MIN_MS, DETRITO_SPAWN_INTERVAL_MAX_MS,
  IMA_SPAWN_INTERVAL_MIN_MS, IMA_SPAWN_INTERVAL_MAX_MS,
} from './main-constants.js'

export function createProgressionFlow(deps) {
  const { state, rail, combat } = deps

  // ============ RANDOMIZADORES DE INTERVALO ============
  // (todos os que dependem de alguma mutação de estado — os puramente constantes ficaram
  // puros só por hábito de leitura, mas moram aqui pelo mesmo motivo: são "o próximo spawn
  // depois desse aqui", acoplados ao ritmo que applyDifficulty muta)

  function randomDetritoInterval() {
    return DETRITO_SPAWN_INTERVAL_MIN_MS + Math.random() * (DETRITO_SPAWN_INTERVAL_MAX_MS - DETRITO_SPAWN_INTERVAL_MIN_MS)
  }

  function randomImaInterval() {
    return IMA_SPAWN_INTERVAL_MIN_MS + Math.random() * (IMA_SPAWN_INTERVAL_MAX_MS - IMA_SPAWN_INTERVAL_MIN_MS)
  }

  function randomEnemyInterval() {
    return state.enemyIntervalMin + Math.random() * (state.enemyIntervalMax - state.enemyIntervalMin)
  }

  function randomBonusInterval() {
    return BONUS_INTERVAL_MIN + Math.random() * (BONUS_INTERVAL_MAX - BONUS_INTERVAL_MIN)
  }

  function randomGoldenInterval() {
    return GOLDEN_INTERVAL_MIN_MS + Math.random() * (GOLDEN_INTERVAL_MAX_MS - GOLDEN_INTERVAL_MIN_MS)
  }

  // ============ PROGRESSÃO POR RESPOSTA ============
  // Acerto consecutivo sobe a velocidade de avanço a cada BOOST_EVERY_CORRECT acertos; erro
  // reseta a velocidade E o contador — independente da escalada de dificuldade abaixo.
  function applySpeedProgression(type) {
    if (type === 'correct') {
      state.consecutiveCorrect += 1
      if (state.consecutiveCorrect % BOOST_EVERY_CORRECT === 0) {
        state.speedMultiplier *= 1 + SPEED_STEP
        rail.setSpeedMultiplier(state.speedMultiplier)
      }
    } else {
      state.consecutiveCorrect = 0
      state.speedMultiplier = 1
      rail.setSpeedMultiplier(1)
    }
  }

  // pedido do usuário: escalada explícita e quantificada por pergunta errada (comentário
  // completo em main-constants.js) — 3 contadores derivam do mesmo wrongAnswerCount, divididos
  // por thresholds diferentes. Os 3 efeitos originais (intervalo de spawn/enemyCap/agressão)
  // continuam acontecendo junto, sem mudança.
  function applyDifficulty() {
    state.enemyIntervalMin = Math.max(ENEMY_INTERVAL_FLOOR, state.enemyIntervalMin - ENEMY_INTERVAL_STEP)
    state.enemyIntervalMax = Math.max(state.enemyIntervalMin + 150, state.enemyIntervalMax - ENEMY_INTERVAL_STEP)
    state.enemyAggression = Math.min(ENEMY_AGGRESSION_CAP, state.enemyAggression + ENEMY_AGGRESSION_STEP)
    combat.setEnemyAggressiveness(state.enemyAggression)
    state.enemyCap += ENEMY_CAP_STEP_PER_ERROR

    // pedido do usuário: escalada quantificada em cima do que já existia acima
    state.wrongAnswerCount += 1
    state.extraSpawnPerBatch = Math.floor(state.wrongAnswerCount / ENEMY_SPAWN_BONUS_WRONG_THRESHOLD)
    state.enemyDamageValue = 1 + Math.floor(state.wrongAnswerCount / ENEMY_DAMAGE_WRONG_THRESHOLD)
    combat.setEnemyProjectileSpeedBonus(state.wrongAnswerCount * ENEMY_PROJECTILE_SPEED_PER_WRONG)
  }

  // separado de applyDifficulty porque a caçada do chefe tem a própria progressão (a dificuldade
  // "geral" continua sendo aplicada por erro, mas o chefe em si escala em paralelo — spread e
  // reforço extra). Cap próprio, BOSS_DIFFICULTY_CAP.
  function applyBossDifficulty() {
    state.bossDifficulty = Math.min(BOSS_DIFFICULTY_CAP, state.bossDifficulty + 1)
  }

  // ============ CONSULTAS DE ESCALADA ============
  // Chamadas pelo tick e por enterCombat/enterBossBuildup (via deps dos flows) pra ler o
  // estado atual da progressão. Nunca mutam nada.

  function currentEnemyCap() {
    return (rail.isArena() ? ENEMY_CAP_ARENA_BASE : ENEMY_CAP_NORMAL_BASE) + state.enemyCap
  }

  function currentBossSpread() {
    return {
      distanceMin: Math.min(BOSS_SPREAD_MIN_CAP, BOSS_SPREAD_MIN_BASE + state.bossDifficulty * BOSS_SPREAD_STEP),
      distanceMax: Math.min(BOSS_SPREAD_MAX_CAP, BOSS_SPREAD_MAX_BASE + state.bossDifficulty * BOSS_SPREAD_STEP),
    }
  }

  function currentBossExtraEnemies() {
    return Math.min(BOSS_EXTRA_ENEMIES_CAP, BOSS_EXTRA_ENEMIES_BASE + state.bossDifficulty * BOSS_EXTRA_ENEMIES_STEP)
  }

  return {
    // randomizadores
    randomDetritoInterval,
    randomImaInterval,
    randomEnemyInterval,
    randomBonusInterval,
    randomGoldenInterval,
    // progressão
    applyDifficulty,
    applyBossDifficulty,
    applySpeedProgression,
    // consultas
    currentEnemyCap,
    currentBossSpread,
    currentBossExtraEnemies,
  }
}
