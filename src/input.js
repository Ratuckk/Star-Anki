import { getBindings, edgeCodes, GAMEPAD_EDGE_ACTIONS } from './keybindings.js'

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
  // propulsor/repulsor: lidos como HOLD contínuo (igual bank) além da borda (via pressed/
  // edgeCodes) — o hold é o que permite o combo "segurar propulsor + Z/C" no all-range
  const propulsionCodes = new Set(bindings.actions.propulsion)
  const repulsionCodes = new Set(bindings.actions.repulsion)
  const edgeCodeSet = edgeCodes(bindings)

  const gp = bindings.gamepad

  const state = { moveX: 0, moveY: 0, firing: false, bank: 0, propulsionHeld: false, repulsionHeld: false, pressed: new Set() }
  const keys = new Set()
  const pressedThisFrame = new Set()

  // timestamps do último "aperto" de cada direção — usados para resolver conflito quando os
  // dois lados ficam "pressionados" ao mesmo tempo (tecla presa por blur, ghosting de teclado).
  // dodgeLeftTime/dodgeRightTime também são atualizados por botão de CONTROLE (readGamepadButtons
  // abaixo, na borda de subida) — o mesmo tie-break serve pros dois tipos de entrada
  let leftTime = 0
  let rightTime = 0
  let upTime = 0
  let downTime = 0
  let dodgeLeftTime = 0
  let dodgeRightTime = 0

  // último estado (por índice de botão) do primeiro controle conectado — usado só para detectar
  // borda de subida por BOTÃO em readGamepadButtons, já que cada ação pode estar mapeada a um
  // botão físico diferente
  let prevPadButtons = {}

  // painel de debug (overhaul v0.68.0) introduziu o primeiro campo de texto que pode ganhar
  // foco DURANTE a partida (busca de ações) — sem essa guarda, digitar "spawn" pra filtrar
  // também dispararia movimento/tiro/dodge, já que o jogo continua rodando com o painel aberto
  // e este listener é global em `window`.
  function isTypingTarget(e) {
    const t = e.target
    return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
  }

  function onKeyDown(e) {
    if (isTypingTarget(e)) return
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
    let propulsionHeld = false
    let repulsionHeld = false
    for (const code of propulsionCodes) if (keys.has(code)) { propulsionHeld = true; break }
    for (const code of repulsionCodes) if (keys.has(code)) { repulsionHeld = true; break }

    return {
      moveX: Math.sign(moveX),
      moveY: Math.sign(moveY),
      firing,
      dodgeLeftHeld,
      dodgeRightHeld,
      propulsionHeld,
      repulsionHeld,
      active: moveX !== 0 || moveY !== 0 || firing,
    }
  }

  // eixo analógico continua igual a antes desta entrega — só o primeiro controle conectado com
  // deflexão além da zona morta conta
  function readGamepadAxes() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : []
    for (const pad of pads) {
      if (!pad) continue
      const rawX = pad.axes[gp.axisX] ?? 0
      const rawY = pad.axes[gp.axisY] ?? 0
      const moveX = Math.abs(rawX) > DEADZONE ? rawX : 0
      const moveY = Math.abs(rawY) > DEADZONE ? (gp.invertY ? -rawY : rawY) : 0
      if (moveX !== 0 || moveY !== 0) return { moveX, moveY }
    }
    return { moveX: 0, moveY: 0 }
  }

  // mapeamento genérico de botão → ação (gp.buttons, configurável nas configurações): só o
  // primeiro controle conectado conta, pra não ter ambiguidade com 2+ controles plugados
  function readGamepadButtons() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : []
    const pad = [...pads].find(Boolean)

    const currButtons = {}
    if (pad) pad.buttons.forEach((b, i) => { currButtons[i] = !!b?.pressed })

    const heldBy = (actionId) => (gp.buttons[actionId] || []).some((i) => currButtons[i])
    const risingBy = (actionId) => (gp.buttons[actionId] || []).some((i) => currButtons[i] && !prevPadButtons[i])

    const t = performance.now()
    if (risingBy('dodgeLeft')) dodgeLeftTime = t
    if (risingBy('dodgeRight')) dodgeRightTime = t
    for (const actionId of GAMEPAD_EDGE_ACTIONS) {
      if (risingBy(actionId)) pressedThisFrame.add(actionId)
    }

    prevPadButtons = currButtons
    return {
      firing: heldBy('fire'),
      dodgeLeftHeld: heldBy('dodgeLeft'),
      dodgeRightHeld: heldBy('dodgeRight'),
      propulsionHeld: heldBy('propulsion'),
      repulsionHeld: heldBy('repulsion'),
    }
  }

  return {
    update() {
      const kb = readKeyboard()
      const axes = readGamepadAxes()
      const padBtn = readGamepadButtons()

      // teclado tem prioridade TOTAL sobre o eixo analógico quando está ativo, para drift de
      // analógico nunca cancelar o input do teclado — botões de controle (fire/dodge/propulsão)
      // já são booleanos independentes, então esses só somam (OR) em vez de competir
      let moveX, moveY
      if (kb.active) {
        moveX = kb.moveX
        moveY = kb.moveY
      } else {
        moveX = axes.moveX
        moveY = axes.moveY
      }

      const dodgeLeftHeld = kb.dodgeLeftHeld || padBtn.dodgeLeftHeld
      const dodgeRightHeld = kb.dodgeRightHeld || padBtn.dodgeRightHeld
      let bank = 0
      if (dodgeLeftHeld) bank -= 1
      if (dodgeRightHeld) bank += 1
      if (dodgeLeftHeld && dodgeRightHeld) bank = dodgeLeftTime >= dodgeRightTime ? -1 : 1

      state.moveX = moveX
      state.moveY = moveY
      state.firing = kb.firing || padBtn.firing
      state.bank = bank
      state.propulsionHeld = kb.propulsionHeld || padBtn.propulsionHeld
      state.repulsionHeld = kb.repulsionHeld || padBtn.repulsionHeld
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
