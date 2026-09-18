// ============ MOTOR DE FSM (MÁQUINA DE ESTADOS FINITA) DOS INIMIGOS ============
// Motor genérico e leve (zero alocação por frame), usado por classes de inimigo migradas do
// loop monolítico antigo pra uma FSM formal. Ver OVERHAUL_ESTADOS_INIMIGOS.md pra motivação e
// progresso/PROGRESSO_POS_.70.md pra quais inimigos já migraram. Nenhuma dependência de Three.js
// aqui de propósito — isso deixa o motor testável em Node puro (ver src/selftest.mjs).

export const ENEMY_STATES = {
  SPAWNING: 'SPAWNING',
  ENGAGED: 'ENGAGED',
  TELEGRAPHING: 'TELEGRAPHING',
  ATTACKING: 'ATTACKING',
  RECOVERY: 'RECOVERY',
  CRITICAL_TUMBLE: 'CRITICAL_TUMBLE',
  DISENGAGING: 'DISENGAGING',
}

// statesConfig: { [ENEMY_STATES.X]: { onEnter?(enemy, ctx, payload), update?(enemy, dt, ctx), onExit?(enemy, ctx) } }
export function createStateMachine(enemy, statesConfig, initialState) {
  if (!statesConfig[initialState]) {
    throw new Error(`createStateMachine: estado inicial "${initialState}" não existe em statesConfig`)
  }

  const fsm = {
    currentState: initialState,
    previousState: null,
    timeInState: 0,

    transition(targetState, payload, ctx) {
      const targetConfig = statesConfig[targetState]
      if (!targetConfig) {
        throw new Error(`createStateMachine: transição para estado inexistente "${targetState}" (de "${fsm.currentState}")`)
      }
      const currentConfig = statesConfig[fsm.currentState]
      if (currentConfig && currentConfig.onExit) currentConfig.onExit(enemy, ctx)
      fsm.previousState = fsm.currentState
      fsm.currentState = targetState
      fsm.timeInState = 0
      if (targetConfig.onEnter) targetConfig.onEnter(enemy, ctx, payload)
    },

    update(dt, ctx) {
      fsm.timeInState += dt
      const config = statesConfig[fsm.currentState]
      if (config && config.update) config.update(enemy, dt, ctx)
    },

    isIn(state) {
      return fsm.currentState === state
    },
  }

  return fsm
}
