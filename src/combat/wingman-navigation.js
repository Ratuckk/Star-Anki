export const WINGMAN_NAVIGATION_INTENTS = Object.freeze({
  FORMATION: 'formation',
  ATTACK_LANE: 'attack-lane',
  SUPPORT_PLAYER: 'support-player',
  RECOVERY: 'recovery',
})

// Rail: distância espacial não decide mais estado. Só o atraso LONGITUDINAL em relação ao
// frame atual do trilho acrescenta velocidade, sem cancelar Behavior/Action nem mudar target.
export const WINGMAN_RAIL_CATCHUP_START = 32
export const WINGMAN_RAIL_CATCHUP_RELEASE = 22
export const WINGMAN_RAIL_CATCHUP_FULL = 120
export const WINGMAN_RAIL_CATCHUP_MAX_BONUS = 72

function finiteVector(v) {
  return !!v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z)
}

export function isFiniteWingmanPosition(position) {
  return finiteVector(position)
}

export function computeRailLongitudinalLag(position, playerPosition, frame) {
  if (!finiteVector(position) || !finiteVector(playerPosition) || !finiteVector(frame?.forward)) return null
  const dx = playerPosition.x - position.x
  const dy = playerPosition.y - position.y
  const dz = playerPosition.z - position.z
  // Positivo = Wingman atrás do jogador ao longo do trilho. Distância lateral/vertical não entra.
  return dx * frame.forward.x + dy * frame.forward.y + dz * frame.forward.z
}

export function updateRailCatchupState(longitudinalLag, wasActive = false) {
  if (!Number.isFinite(longitudinalLag)) return false
  if (wasActive) return longitudinalLag > WINGMAN_RAIL_CATCHUP_RELEASE
  return longitudinalLag > WINGMAN_RAIL_CATCHUP_START
}

export function computeRailCatchupBoost(longitudinalLag) {
  if (!Number.isFinite(longitudinalLag) || longitudinalLag <= WINGMAN_RAIL_CATCHUP_START) return 0
  const span = WINGMAN_RAIL_CATCHUP_FULL - WINGMAN_RAIL_CATCHUP_START
  const raw = Math.max(0, Math.min(1, (longitudinalLag - WINGMAN_RAIL_CATCHUP_START) / span))
  // smoothstep evita degrau perceptível quando cruza o limiar.
  const t = raw * raw * (3 - 2 * raw)
  return Math.min(WINGMAN_RAIL_CATCHUP_MAX_BONUS, WINGMAN_RAIL_CATCHUP_MAX_BONUS * t)
}

export function navigationIntentForWingman({ state, escortKind = null } = {}) {
  if (state === 'retreating') return WINGMAN_NAVIGATION_INTENTS.RECOVERY
  if (state === 'dogfight' || state === 'ram') return WINGMAN_NAVIGATION_INTENTS.ATTACK_LANE
  if (state === 'rescue' || state === 'escort' || escortKind) return WINGMAN_NAVIGATION_INTENTS.SUPPORT_PLAYER
  return WINGMAN_NAVIGATION_INTENTS.FORMATION
}
