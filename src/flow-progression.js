// flow-progression.js
//
// Cluster de progressão: escalada por erro (dificuldade) e randomizadores de intervalo.
// Zero mudança de comportamento.

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

  function applyDifficulty() {
    state.enemyIntervalMin = Math.max(ENEMY_INTERVAL_FLOOR, state.enemyIntervalMin - ENEMY_INTERVAL_STEP)
    state.enemyIntervalMax = Math.max(state.enemyIntervalMin + 150, state.enemyIntervalMax - ENEMY_INTERVAL_STEP)
    state.enemyAggression = Math.min(ENEMY_AGGRESSION_CAP, state.enemyAggression + ENEMY_AGGRESSION_STEP)
    combat.setEnemyAggressiveness(state.enemyAggression)
    state.enemyCap += ENEMY_CAP_STEP_PER_ERROR

    state.wrongAnswerCount += 1
    state.extraSpawnPerBatch = Math.floor(state.wrongAnswerCount / ENEMY_SPAWN_BONUS_WRONG_THRESHOLD)
    state.enemyDamageValue = 1 + Math.floor(state.wrongAnswerCount / ENEMY_DAMAGE_WRONG_THRESHOLD)
    combat.setEnemyProjectileSpeedBonus(state.wrongAnswerCount * ENEMY_PROJECTILE_SPEED_PER_WRONG)
  }

  function applyBossDifficulty() {
    state.bossDifficulty = Math.min(BOSS_DIFFICULTY_CAP, state.bossDifficulty + 1)
  }

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
    randomDetritoInterval,
    randomImaInterval,
    randomEnemyInterval,
    randomBonusInterval,
    randomGoldenInterval,
    applyDifficulty,
    applyBossDifficulty,
    applySpeedProgression,
    currentEnemyCap,
    currentBossSpread,
    currentBossExtraEnemies,
  }
}
