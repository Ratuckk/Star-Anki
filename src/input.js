import { getBindings, edgeCodes } from './keybindings.js'

const DEADZONE = 0.25

export function createInputState() {
  const bindings = getBindings()

  const keyMap = {}
  for (const code of bindings.actions.moveLeft) keyMap[code] = [-1, 0]
  for (const code of bindings.actions.moveRight) keyMap[code] = [1, 0]
  for (const code of bindings.actions.moveUp) keyMap[code] = [0, 1]
  for (const code of bindings.actions.moveDown) keyMap[code] = [0, -1]

  const leftCodes = new Set(bindings.actions.moveLeft)
  const rightCodes = new Set(bindings.actions.moveRight)
  const upCodes = new Set(bindings.actions.moveUp)
  const downCodes = new Set(bindings.actions.moveDown)
  const fireCodes = new Set(bindings.actions.fire)
  const dodgeLeftCodes = new Set(bindings.actions.dodgeLeft)
  const dodgeRightCodes = new Set(bindings.actions.dodgeRight)
  const edgeCodeSet = edgeCodes(bindings)

  const gp = bindings.gamepad

  const state = { moveX: 0, moveY: 0, firing: false, bank: 0, pressed: new Set() }
  const keys = new Set()
  const pressedThisFrame = new Set()
  let prevPadStart = false

  // timestamps do último keydown de cada direção — usados para resolver conflito quando os
  // dois lados ficam "pressionados" ao mesmo tempo (tecla presa por blur, ghosting de teclado)
  let leftTime = 0
  let rightTime = 0
  let upTime = 0
  let downTime = 0
  let dodgeLeftTime = 0
  let dodgeRightTime = 0

  function onKeyDown(e) {
    if (edgeCodeSet.has(e.code) && !keys.has(e.code)) pressedThisFrame.add(e.code)
    keys.add(e.code)
    const t = performance.now()
    if (leftCodes.has(e.code)) leftTime = t
    else if (rightCodes.has(e.code)) rightTime = t
    else if (upCodes.has(e.code)) upTime = t
    else if (downCodes.has(e.code)) downTime = t
    if (dodgeLeftCodes.has(e.code)) dodgeLeftTime = t
    else if (dodgeRightCodes.has(e.code)) dodgeRightTime = t
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
      const mapped = keyMap[code]
      if (!mapped) continue
      moveX += mapped[0]
      moveY += mapped[1]
      if (leftCodes.has(code)) leftHeld = true
      if (rightCodes.has(code)) rightHeld = true
      if (upCodes.has(code)) upHeld = true
      if (downCodes.has(code)) downHeld = true
    }

    // se os dois lados estão no Set simultaneamente (sintoma de tecla presa ou ghosting),
    // prioriza a direção que o jogador apertou por último — respeita a intenção dele em
    // vez de zerar o movimento
    if (leftHeld && rightHeld) moveX = leftTime >= rightTime ? -1 : 1
    if (upHeld && downHeld) moveY = upTime >= downTime ? 1 : -1

    let firing = false
    for (const code of fireCodes) if (keys.has(code)) { firing = true; break }

    // giro-desvio (Z/C): -1/0/1 CONTÍNUO enquanto a tecla está segurada (não é um "toque"),
    // pra rail.js inclinar a nave e mantê-la assim enquanto durar o input
    let dodgeLeftHeld = false
    let dodgeRightHeld = false
    for (const code of dodgeLeftCodes) if (keys.has(code)) { dodgeLeftHeld = true; break }
    for (const code of dodgeRightCodes) if (keys.has(code)) { dodgeRightHeld = true; break }
    let bank = 0
    if (dodgeLeftHeld) bank -= 1
    if (dodgeRightHeld) bank += 1
    if (dodgeLeftHeld && dodgeRightHeld) bank = dodgeLeftTime >= dodgeRightTime ? -1 : 1

    return {
      moveX: Math.sign(moveX),
      moveY: Math.sign(moveY),
      firing,
      bank,
      active: moveX !== 0 || moveY !== 0 || firing,
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
      const rawX = pad.axes[gp.axisX] ?? 0
      const rawY = pad.axes[gp.axisY] ?? 0
      const firing = gp.fireButtons.some((i) => !!pad.buttons[i]?.pressed)
      const moveX = Math.abs(rawX) > DEADZONE ? rawX : 0
      const moveY = Math.abs(rawY) > DEADZONE ? (gp.invertY ? -rawY : rawY) : 0
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
      state.bank = kb.bank
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
