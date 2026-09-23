const KEYBINDINGS_KEY = 'star-anki-keybindings'

export const ACTIONS = [
  { id: 'moveLeft', label: 'Mover esquerda' },
  { id: 'moveRight', label: 'Mover direita' },
  { id: 'moveUp', label: 'Mover cima' },
  { id: 'moveDown', label: 'Mover baixo' },
  { id: 'fire', label: 'Atirar (segurar carrega tiro teleguiado)' },
  { id: 'dodgeLeft', label: 'Inclinar esquerda (segurar); 2 toques rápidos = giro completo' },
  { id: 'dodgeRight', label: 'Inclinar direita (segurar); 2 toques rápidos = giro completo' },
  { id: 'propulsion', label: 'Propulsor (impulso; segurar com Z/C no all-range = deslocar lateral)' },
  { id: 'repulsion', label: 'Repulsor (desacelerar; Baixo+isto no all-range = cambalhota)' },
  { id: 'pause', label: 'Pausar' },
  { id: 'debugToggle', label: 'Painel de debug' },
  { id: 'quizSlot1', label: 'Resposta 1' },
  { id: 'quizSlot2', label: 'Resposta 2' },
  { id: 'quizSlot3', label: 'Resposta 3' },
  { id: 'quizSlot4', label: 'Resposta 4' },
  { id: 'squadronCommand', label: 'Comando do esquadrão (Foco / Ataque livre)' },
  { id: 'skipErrorFeedback', label: 'Pular feedback de erro / Continuar' },
]

// A e S viraram propulsor/repulsor; D virou comando tático de esquadrão (Star Fox).
// Movimento lateral usa ArrowLeft/ArrowRight (W continua pra cima junto com ArrowUp).
const DEFAULT_ACTIONS = {
  moveLeft: ['ArrowLeft'],
  moveRight: ['ArrowRight'],
  moveUp: ['ArrowUp', 'KeyW'],
  moveDown: ['ArrowDown'],
  fire: ['KeyX'],
  dodgeLeft: ['KeyZ'],
  dodgeRight: ['KeyC'],
  propulsion: ['KeyA'],
  repulsion: ['KeyS'],
  squadronCommand: ['KeyD'],
  skipErrorFeedback: ['Space'],
  pause: ['Escape', 'KeyP'],
  debugToggle: ['Backquote'],
  quizSlot1: ['Digit1'],
  quizSlot2: ['Digit2'],
  quizSlot3: ['Digit3'],
  quizSlot4: ['Digit4'],
}

// Ações mapeáveis a um botão físico de controle — movimento fica de fora de propósito (usa os
// eixos analógicos configurados abaixo, não faz sentido "botão = direção" com um analógico à mão)
export const GAMEPAD_ACTIONS = [
  'fire', 'dodgeLeft', 'dodgeRight', 'propulsion', 'repulsion', 'squadronCommand', 'skipErrorFeedback',
  'pause', 'debugToggle', 'quizSlot1', 'quizSlot2', 'quizSlot3', 'quizSlot4',
]

// subconjunto que precisa de detecção de BORDA (evento único por aperto) além do hold contínuo —
// mesma ideia do edgeCodes() de teclado logo abaixo, só que por ação em vez de por tecla física
const GAMEPAD_EDGE_ACTIONS = GAMEPAD_ACTIONS.filter((a) => a !== 'fire')
export { GAMEPAD_EDGE_ACTIONS }

const DEFAULT_GAMEPAD = {
  axisX: 0,
  axisY: 1,
  invertY: true,
  buttons: {
    fire: [0, 7],
    dodgeLeft: [4],
    dodgeRight: [5],
    propulsion: [],
    repulsion: [],
    squadronCommand: [3],
    skipErrorFeedback: [0],
    pause: [9],
    debugToggle: [8],
    quizSlot1: [],
    quizSlot2: [],
    quizSlot3: [],
    quizSlot4: [],
  },
}

const CODE_LABELS = {
  ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',
  Space: 'Espaço', Escape: 'Esc', Backquote: '` (crase)',
  Enter: 'Enter', ShiftLeft: 'Shift E', ShiftRight: 'Shift D',
  ControlLeft: 'Ctrl E', ControlRight: 'Ctrl D',
}

let cachedBindings = null

export function codeToLabel(code) {
  if (!code) return '—'
  if (CODE_LABELS[code]) return CODE_LABELS[code]
  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)
  return code
}

function readStored() {
  try {
    if (typeof localStorage === 'undefined') return {}
    const raw = localStorage.getItem(KEYBINDINGS_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function writeStored(data) {
  try {
    if (typeof localStorage === 'undefined') return false
    localStorage.setItem(KEYBINDINGS_KEY, JSON.stringify(data))
    return true
  } catch {
    // O remapeamento continua válido nesta aba mesmo quando persistência está indisponível.
    return false
  }
}

function stringArray(value, fallback) {
  const source = typeof value === 'string' ? [value] : value
  if (!Array.isArray(source)) return [...fallback]
  return [...new Set(source.filter((v) => typeof v === 'string' && v.length > 0))]
}

function buttonArray(value, fallback) {
  if (!Array.isArray(value)) return [...fallback]
  return [...new Set(value.filter((v) => Number.isInteger(v) && v >= 0 && v <= 63))]
}

function safeAxis(value, fallback) {
  return Number.isInteger(value) && value >= 0 && value <= 31 ? value : fallback
}

function sanitizeBindings(stored = {}) {
  const storedActions = stored.actions && typeof stored.actions === 'object' && !Array.isArray(stored.actions)
    ? stored.actions : {}
  const actions = {}
  for (const [action, defaults] of Object.entries(DEFAULT_ACTIONS)) {
    actions[action] = stringArray(storedActions[action], defaults)
  }

  const storedGamepad = stored.gamepad && typeof stored.gamepad === 'object' && !Array.isArray(stored.gamepad)
    ? stored.gamepad : {}
  const storedButtons = storedGamepad.buttons && typeof storedGamepad.buttons === 'object' && !Array.isArray(storedGamepad.buttons)
    ? storedGamepad.buttons : {}
  // Migração do formato antigo (`gamepad.fireButtons` solto) pro novo `gamepad.buttons.fire`.
  const legacyFire = !storedGamepad.buttons && Array.isArray(storedGamepad.fireButtons)
    ? storedGamepad.fireButtons : undefined
  const buttons = {}
  for (const [action, defaults] of Object.entries(DEFAULT_GAMEPAD.buttons)) {
    const candidate = action === 'fire' && legacyFire !== undefined ? legacyFire : storedButtons[action]
    buttons[action] = buttonArray(candidate, defaults)
  }

  return {
    actions,
    gamepad: {
      axisX: safeAxis(storedGamepad.axisX, DEFAULT_GAMEPAD.axisX),
      axisY: safeAxis(storedGamepad.axisY, DEFAULT_GAMEPAD.axisY),
      invertY: typeof storedGamepad.invertY === 'boolean' ? storedGamepad.invertY : DEFAULT_GAMEPAD.invertY,
      buttons,
    },
  }
}

function cloneBindings(bindings) {
  return {
    actions: Object.fromEntries(Object.entries(bindings.actions).map(([key, value]) => [key, [...value]])),
    gamepad: {
      axisX: bindings.gamepad.axisX,
      axisY: bindings.gamepad.axisY,
      invertY: bindings.gamepad.invertY,
      buttons: Object.fromEntries(Object.entries(bindings.gamepad.buttons).map(([key, value]) => [key, [...value]])),
    },
  }
}

function ensureCache() {
  if (!cachedBindings) cachedBindings = sanitizeBindings(readStored())
  return cachedBindings
}

export function getBindings() {
  return cloneBindings(ensureCache())
}

function commitBindings(bindings) {
  cachedBindings = sanitizeBindings(bindings)
  writeStored(cachedBindings)
  return cloneBindings(cachedBindings)
}

export function setBinding(action, code) {
  const bindings = getBindings()
  if (!Object.prototype.hasOwnProperty.call(DEFAULT_ACTIONS, action) || typeof code !== 'string' || !code) return bindings
  bindings.actions[action] = [code]
  return commitBindings(bindings)
}

export function setGamepadBinding(key, value) {
  const bindings = getBindings()
  if (!['axisX', 'axisY', 'invertY'].includes(key)) return bindings
  bindings.gamepad[key] = value
  return commitBindings(bindings)
}

// substitui (não soma) o botão mapeado pra uma ação — mesmo comportamento de "última tecla
// pressionada vence" já usado no rebind de teclado, aplicado a controle
export function setGamepadActionButton(actionId, buttonIndex) {
  const bindings = getBindings()
  if (!Object.prototype.hasOwnProperty.call(DEFAULT_GAMEPAD.buttons, actionId)) return bindings
  bindings.gamepad.buttons[actionId] = [buttonIndex]
  return commitBindings(bindings)
}

export function clearGamepadActionButton(actionId) {
  const bindings = getBindings()
  if (!Object.prototype.hasOwnProperty.call(DEFAULT_GAMEPAD.buttons, actionId)) return bindings
  bindings.gamepad.buttons[actionId] = []
  return commitBindings(bindings)
}

export function getGamepadButtons(bindings, actionId) {
  const buttons = bindings?.gamepad?.buttons?.[actionId]
  return Array.isArray(buttons) ? buttons : []
}

export function resetToDefaults() {
  return commitBindings({ actions: DEFAULT_ACTIONS, gamepad: DEFAULT_GAMEPAD })
}

export function getActionCodes(bindings, action) {
  const codes = bindings?.actions?.[action]
  return Array.isArray(codes) ? codes : []
}

// pressedSet mistura 2 tipos de entrada: codes de teclado (ex: 'ArrowLeft', vindos do próprio
// evento) e ids de ação de controle (ex: 'pause', adicionados por input.js quando o botão de
// controle mapeado pra aquela ação sobe) — checar o id da ação primeiro cobre o controle sem
// precisar duplicar a lista de binds de teclado
export function isActionPressed(bindings, pressedSet, action) {
  if (!pressedSet || typeof pressedSet.has !== 'function') return false
  if (pressedSet.has(action)) return true
  return getActionCodes(bindings, action).some((code) => pressedSet.has(code))
}

// codes que precisam de detecção de borda (evento único por toque) em vez de "segurando".
// dodgeLeft/dodgeRight e propulsion/repulsion TAMBÉM são lidos como hold contínuo em paralelo
// (input.js expõe os dois: bank/propulsionHeld/repulsionHeld E o Set de borda) — um mecanismo
// não atrapalha o outro: a borda serve pra detectar o toque duplo do giro completo e a ativação
// pontual de propulsor/repulsor; o hold serve pra inclinação cosmética e pro combo A+Z/C
export function edgeCodes(bindings) {
  const codes = new Set()
  for (const action of GAMEPAD_EDGE_ACTIONS) {
    for (const code of getActionCodes(bindings, action)) codes.add(code)
  }
  return codes
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('storage', (event) => {
    if (event?.key === KEYBINDINGS_KEY || event?.key == null) cachedBindings = null
  })
}
