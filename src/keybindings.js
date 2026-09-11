const KEYBINDINGS_KEY = 'star-anki-keybindings'

export const ACTIONS = [
  { id: 'moveLeft', label: 'Mover esquerda' },
  { id: 'moveRight', label: 'Mover direita' },
  { id: 'moveUp', label: 'Mover cima' },
  { id: 'moveDown', label: 'Mover baixo' },
  { id: 'fire', label: 'Atirar (segurar carrega tiro teleguiado)' },
  { id: 'dodgeLeft', label: 'Desvio esquerda (2x = giro completo)' },
  { id: 'dodgeRight', label: 'Desvio direita (2x = giro completo)' },
  { id: 'pause', label: 'Pausar' },
  { id: 'debugToggle', label: 'Painel de debug' },
  { id: 'quizSlot1', label: 'Resposta 1' },
  { id: 'quizSlot2', label: 'Resposta 2' },
  { id: 'quizSlot3', label: 'Resposta 3' },
  { id: 'quizSlot4', label: 'Resposta 4' },
]

const DEFAULT_ACTIONS = {
  moveLeft: ['ArrowLeft', 'KeyA'],
  moveRight: ['ArrowRight', 'KeyD'],
  moveUp: ['ArrowUp', 'KeyW'],
  moveDown: ['ArrowDown', 'KeyS'],
  fire: ['KeyX'],
  dodgeLeft: ['KeyZ'],
  dodgeRight: ['KeyC'],
  pause: ['Escape', 'KeyP'],
  debugToggle: ['Backquote'],
  quizSlot1: ['Digit1'],
  quizSlot2: ['Digit2'],
  quizSlot3: ['Digit3'],
  quizSlot4: ['Digit4'],
}

const DEFAULT_GAMEPAD = {
  fireButtons: [0, 7],
  axisX: 0,
  axisY: 1,
  invertY: true,
}

const CODE_LABELS = {
  ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',
  Space: 'Espaço', Escape: 'Esc', Backquote: '` (crase)',
  Enter: 'Enter', ShiftLeft: 'Shift E', ShiftRight: 'Shift D',
  ControlLeft: 'Ctrl E', ControlRight: 'Ctrl D',
}

export function codeToLabel(code) {
  if (!code) return '—'
  if (CODE_LABELS[code]) return CODE_LABELS[code]
  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)
  return code
}

function readStored() {
  try {
    const raw = localStorage.getItem(KEYBINDINGS_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeStored(data) {
  try {
    localStorage.setItem(KEYBINDINGS_KEY, JSON.stringify(data))
  } catch {
    // quota excedida ou localStorage desabilitado — falha silenciosa de propósito
  }
}

export function getBindings() {
  const stored = readStored()
  return {
    actions: { ...DEFAULT_ACTIONS, ...(stored.actions || {}) },
    gamepad: { ...DEFAULT_GAMEPAD, ...(stored.gamepad || {}) },
  }
}

export function setBinding(action, code) {
  const bindings = getBindings()
  bindings.actions[action] = [code]
  writeStored(bindings)
  return bindings
}

export function setGamepadBinding(key, value) {
  const bindings = getBindings()
  bindings.gamepad[key] = value
  writeStored(bindings)
  return bindings
}

export function resetToDefaults() {
  writeStored({ actions: { ...DEFAULT_ACTIONS }, gamepad: { ...DEFAULT_GAMEPAD } })
  return getBindings()
}

export function getActionCodes(bindings, action) {
  return bindings.actions[action] || []
}

export function isActionPressed(bindings, pressedSet, action) {
  return getActionCodes(bindings, action).some((code) => pressedSet.has(code))
}

// codes que precisam de detecção de borda (evento único por toque) em vez de "segurando"
export function edgeCodes(bindings) {
  const codes = new Set()
  for (const action of ['pause', 'debugToggle', 'quizSlot1', 'quizSlot2', 'quizSlot3', 'quizSlot4', 'dodgeLeft', 'dodgeRight']) {
    for (const code of getActionCodes(bindings, action)) codes.add(code)
  }
  return codes
}
