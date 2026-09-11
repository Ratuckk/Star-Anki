const DEADZONE = 0.25

const KEY_MAP = {
  ArrowLeft: [-1, 0], KeyA: [-1, 0],
  ArrowRight: [1, 0], KeyD: [1, 0],
  ArrowUp: [0, 1], KeyW: [0, 1],
  ArrowDown: [0, -1], KeyS: [0, -1],
}

const EDGE_CODES = new Set(['Escape', 'KeyP', 'Digit1', 'Digit2', 'Digit3', 'Digit4'])
const LEFT_CODES = new Set(['ArrowLeft', 'KeyA'])
const RIGHT_CODES = new Set(['ArrowRight', 'KeyD'])
const UP_CODES = new Set(['ArrowUp', 'KeyW'])
const DOWN_CODES = new Set(['ArrowDown', 'KeyS'])

export function createInputState() {
  const state = { moveX: 0, moveY: 0, firing: false, pressed: new Set() }
  const keys = new Set()
  const pressedThisFrame = new Set()
  let prevPadStart = false

  // timestamps do último keydown de cada direção — usados para resolver conflito quando os
  // dois lados ficam "pressionados" ao mesmo tempo (tecla presa por blur, ghosting de teclado)
  let leftTime = 0
  let rightTime = 0
  let upTime = 0
  let downTime = 0

  function onKeyDown(e) {
    if (EDGE_CODES.has(e.code) && !keys.has(e.code)) pressedThisFrame.add(e.code)
    keys.add(e.code)
    const t = performance.now()
    if (LEFT_CODES.has(e.code)) leftTime = t
    else if (RIGHT_CODES.has(e.code)) rightTime = t
    else if (UP_CODES.has(e.code)) upTime = t
    else if (DOWN_CODES.has(e.code)) downTime = t
  }
  function onKeyUp(e) {
    keys.delete(e.code)
  }

  // CRÍTICO: ao perder foco (Alt+Tab, clicar fora, trocar de aba), o keyup das teclas que
  // estavam pressionadas nunca chega — elas ficariam presas no Set para sempre, cancelando
  // inputs futuros do lado oposto. Limpar no blur resolve a causa raiz.
  function clearKeys() {
    keys.clear()
  }
  function onVisibilityChange() {
    if (document.hidden) clearKeys()
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', clearKeys)
  document.addEventListener('visibilitychange', onVisibilityChange)

  function readKeyboard() {
    let moveX = 0
    let moveY = 0
    let leftHeld = false
    let rightHeld = false
    let upHeld = false
    let downHeld = false

    for (const code of keys) {
      const mapped = KEY_MAP[code]
      if (!mapped) continue
      moveX += mapped[0]
      moveY += mapped[1]
      if (LEFT_CODES.has(code)) leftHeld = true
      if (RIGHT_CODES.has(code)) rightHeld = true
      if (UP_CODES.has(code)) upHeld = true
      if (DOWN_CODES.has(code)) downHeld = true
    }

    // se os dois lados estão no Set simultaneamente (sintoma de tecla presa ou ghosting),
    // prioriza a direção que o jogador apertou por último — respeita a intenção dele em
    // vez de zerar o movimento
    if (leftHeld && rightHeld) moveX = leftTime >= rightTime ? -1 : 1
    if (upHeld && downHeld) moveY = upTime >= downTime ? 1 : -1

    return {
      moveX: Math.sign(moveX),
      moveY: Math.sign(moveY),
      firing: keys.has('Space'),
      active: moveX !== 0 || moveY !== 0 || keys.has('Space'),
    }
  }

  function readGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : []
    let result = null
    for (const pad of pads) {
      if (!pad) continue

      const startPressed = !!pad.buttons[9]?.pressed
      if (startPressed && !prevPadStart) pressedThisFrame.add('GamepadStart')
      prevPadStart = startPressed

      if (result) continue
      const rawX = pad.axes[0] ?? 0
      const rawY = pad.axes[1] ?? 0
      const firing = !!(pad.buttons[0]?.pressed || pad.buttons[7]?.pressed)
      const moveX = Math.abs(rawX) > DEADZONE ? rawX : 0
      const moveY = Math.abs(rawY) > DEADZONE ? -rawY : 0
      if (moveX !== 0 || moveY !== 0 || firing) result = { moveX, moveY, firing }
    }
    return result
  }

  return {
    update() {
      const kb = readKeyboard()
      const pad = readGamepad()

      // teclado tem prioridade TOTAL quando está ativo, para drift de analógico nunca
      // cancelar o input do teclado
      let moveX, moveY, firing
      if (kb.active) {
        moveX = kb.moveX
        moveY = kb.moveY
        firing = kb.firing
      } else {
        moveX = pad?.moveX ?? 0
        moveY = pad?.moveY ?? 0
        firing = pad?.firing ?? false
      }

      state.moveX = moveX
      state.moveY = moveY
      state.firing = firing
      state.pressed = new Set(pressedThisFrame)
      pressedThisFrame.clear()
      return state
    },
    dispose() {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', clearKeys)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    },
  }
}