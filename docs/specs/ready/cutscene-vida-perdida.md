# Cutscene de vida perdida — planejamento completo

## Documento de especificação

---

## 0. Visão geral

Quando o jogador perde uma vida (health chegou a 0 mas ainda tem vidas), em vez do `respawnBurst` de 1 frame que existe hoje, roda uma sequência de **duas cutscenes consecutivas** com uma transição entre elas:

1. **Cutscene 1 — Queda**: a nave do jogador pega fogo, gira e cai descontrolada. Câmera lenta. Câmera acompanha a queda girando levemente ao redor. Termina em **fade para preto** (com um flash vermelho no impacto com o "chão" implícito).
2. **Transição — Tela preta**: 300ms de beat. Só preto. Sem HUD, sem nada.
3. **Cutscene 2 — Reserva**: a nova nave do jogador surge de trás da câmera em alta velocidade, atravessa o quadro, desacelera e para exatamente na posição onde o rail espera ela. Flicker de i-frames no fim. **Transição suave** de volta pro gameplay.

Filosofia: **a morte precisa doer**, mas a volta precisa aliviar. Queda é longa e triste, respawn é rápido e heroico.

O game over (perdeu a última vida) **não** usa isso — continua indo pro `endSector()` como hoje. Esse documento só cobre a perda de vida intermediária.

---

## 1. Bloco de configuração (topo do arquivo)

Todos os timings, distâncias, velocidades e constantes visuais das duas cutscenes num único bloco, no topo do arquivo, exportados pra serem lidos em qualquer lugar. Ajustar aqui muda o comportamento completo sem tocar na lógica.

```js
// ============================================================================
// CUTSCENE DE VIDA PERDIDA — TIMINGS E CONSTANTES
// ============================================================================
// Dois sub-ciclos: "queda" (nave pegando fogo e caindo) e "reserva" (nova nave
// chegando pra substituir). Entre os dois, uma tela preta de beat.
//
// Tudo aqui é configurável — a lógica abaixo só lê estas constantes, não
// hardcoda nada. Ajustar uma linha muda o comportamento inteiro.

// --- Fase 1: Queda (nave pegando fogo e caindo) ---
export const LIFE_LOST_FALLING_DURATION_MS = 2000        // duração total da queda
export const LIFE_LOST_FALLING_TIME_SCALE = 0.35         // câmera lenta (1 = normal)
export const LIFE_LOST_FALLING_FOV_START = 70            // FOV no início
export const LIFE_LOST_FALLING_FOV_END = 45              // FOV no fim (zoom dramático)
export const LIFE_LOST_FALLING_FOV_LERP_RATE = 2.8       // quão rápido o FOV muda
export const LIFE_LOST_FALLING_SHAKE_MAX = 0.7           // magnitude máxima do shake
export const LIFE_LOST_FALLING_FALL_DISTANCE = 35        // distância total que cai (u)
export const LIFE_LOST_FALLING_FALL_ACCEL = 1.4          // expoente de aceleração (t^accel)
export const LIFE_LOST_FALLING_DRIFT_BACK = 12           // quanto derrapa pra trás (u)
export const LIFE_LOST_FALLING_SPIN_RATE = 0.45          // voltas por segundo no próprio eixo
export const LIFE_LOST_FALLING_SWAY_AMPLITUDE = 3.5      // balanço lateral (u)
export const LIFE_LOST_FALLING_SWAY_FREQ = 1.2           // frequência do balanço (Hz)
export const LIFE_LOST_FALLING_CAMERA_ORBIT_ANGLE = 0.6  // quanto a câmera orbita (rad)
export const LIFE_LOST_FALLING_CAMERA_ORBIT_EASE = 0.5   // suavização da órbita
export const LIFE_LOST_FALLING_FIRE_INTERVAL_MS = 180    // intervalo entre detonações
export const LIFE_LOST_FALLING_SMOKE_INTERVAL_MS = 60    // intervalo entre partículas
export const LIFE_LOST_FALLING_FLASH_HOLD_MS = 250       // duração do flash vermelho final

// --- Transição (tela preta entre as duas fases) ---
export const LIFE_LOST_BLACK_SCREEN_HOLD_MS = 300        // beat de tela preta

// --- Fase 2: Reserva (nova nave chegando) ---
export const LIFE_LOST_RESPAWN_DURATION_MS = 1500        // duração total da chegada
export const LIFE_LOST_RESPAWN_SPAWN_BACK = 60           // distância atrás da câmera (u)
export const LIFE_LOST_RESPAWN_APPROACH_SPEED = 200      // velocidade de aproximação (u/s)
export const LIFE_LOST_RESPAWN_DECEL_START_DIST = 20     // começa a frear a essa distância
export const LIFE_LOST_RESPAWN_DECEL_RATE = 4.0          // taxa de desaceleração (s⁻¹)
export const LIFE_LOST_RESPAWN_FOV_START = 90            // FOV quando entra (velocidade)
export const LIFE_LOST_RESPAWN_FOV_END = 70              // FOV quando para
export const LIFE_LOST_RESPAWN_FOV_LERP_RATE = 3.0
export const LIFE_LOST_RESPAWN_FLICKER_INTERVAL_MS = 90  // piscada de i-frames
export const LIFE_LOST_RESPAWN_FLICKER_DURATION_MS = 500 // duração total do flicker
export const LIFE_LOST_RESPAWN_SETTLE_PUFF_DELAY_MS = 80 // delay até o puff de chegada

// --- Comuns ---
export const LIFE_LOST_LETTERBOX_IN_MS = 250             // duração da entrada do letterbox
export const LIFE_LOST_LETTERBOX_OUT_MS = 400            // duração da saída
export const LIFE_LOST_SKIP_AFTER_MS = 500               // jogador pode pular após isso
export const LIFE_LOST_IFRAME_MS = 1500                  // i-frames após o respawn
export const LIFE_LOST_TOTAL_BUDGET_MS =
  LIFE_LOST_FALLING_DURATION_MS +
  LIFE_LOST_FALLING_FLASH_HOLD_MS +
  LIFE_LOST_BLACK_SCREEN_HOLD_MS +
  LIFE_LOST_RESPAWN_DURATION_MS
  // ≈ 4050ms com os valores default
```

**Todos os valores default acima são ponto de partida.** O documento marca onde ajustar cada um.

---

## 2. Fase 1 — Queda (nave pegando fogo e caindo)

### 2.1 Trigger

Em `game-loop.js`, no bloco de dano ao jogador (`if (events.enemyHits > 0 && !player.isInvincible() && !state.debugFlags.godMode)`), depois de `player.takeDamage()`:

```js
const result = player.takeDamage(...)

if (result.outOfLives) {
  endSector()  // game over — comportamento atual, não muda
  return
}

// NOVO: perdeu uma vida mas ainda tem vidas
if (result.lifeLost) {
  cutscenes.startLifeLostFallingCutscene(() => {
    // callback: ao terminar a queda, chama a fase 2
    cutscenes.startLifeLostRespawnCutscene(() => {
      // callback: ao terminar a fase 2, volta pro combate
      enterCombat()  // ou apenas retomar o estado anterior
    })
  })
  return
}
```

**Pré-requisito**: `player.takeDamage()` precisa retornar `lifeLost: true` quando `session.health` chega a 0 **e** `session.lives > 0` (após decremento). Ver §7.1.

### 2.2 Entrada no estado

`cutscenes.startLifeLostFallingCutscene(onDone)`:

```js
state.phase = 'lifeLostFalling'
state.lifeLostFallingTimer = LIFE_LOST_FALLING_DURATION_MS
state.lifeLostFallingOnDone = onDone
state.lifeLostFallingShipStartPos = rail.getPlayerPosition()      // captura pra referência
state.lifeLostFallingShipStartQuat = rail.getShipMesh().quaternion.clone()
state.lifeLostFallingCameraStartPos = camera.position.clone()
state.lifeLostFallingFrameAtStart = rail.getFrameAt(0)            // frame no momento da morte
state.lifeLostFallingSmokeAccumulator = 0
state.lifeLostFallingFireAccumulator = 0
state.lifeLostFallingSwayPhase = 0
state.lifeLostFallingOrbitProgress = 0

hud.setLetterbox(true)
hud.showLifeLostBanner?.({ text: 'VIDA PERDIDA', subtext: 'NAVE RESERVA EM TRÂNSITO' })
// Opcional: banner mostrado no início do falling, some sozinho
```

### 2.3 Comportamento por frame

`cutscenes.updateLifeLostFallingCutscene(rawDt)`:

```js
if (state.phase !== 'lifeLostFalling') return false

// câmera lenta — mas o timer da cutscene em si usa dt real pra não durar eternamente
const dt = rawDt * LIFE_LOST_FALLING_TIME_SCALE
state.lifeLostFallingTimer -= rawDt * 1000
const elapsed = LIFE_LOST_FALLING_DURATION_MS - state.lifeLostFallingTimer
const t = clamp(elapsed / LIFE_LOST_FALLING_DURATION_MS, 0, 1)
```

**Movimento da nave** (a do jogador, `rail.getShipMesh()`):

```js
const ship = rail.getShipMesh()
const frame = state.lifeLostFallingFrameAtStart

// Posição base: parte da posição capturada, adiciona deslocamentos
const fallY = -Math.pow(t, LIFE_LOST_FALLING_FALL_ACCEL) * LIFE_LOST_FALLING_FALL_DISTANCE
const driftZ = -t * LIFE_LOST_FALLING_DRIFT_BACK
const sway = Math.sin(elapsed * LIFE_LOST_FALLING_SWAY_FREQ * 0.001) * LIFE_LOST_FALLING_SWAY_AMPLITUDE

ship.position.copy(state.lifeLostFallingShipStartPos)
  .addScaledVector(frame.up, fallY)
  .addScaledVector(frame.forward, driftZ)
  .addScaledVector(frame.right, sway * t)  // sway cresce com o tempo (descontrole)

// Rotação: gira no próprio eixo + tomba pra um lado
const spinAngle = elapsed * LIFE_LOST_FALLING_SPIN_RATE * 0.001 * Math.PI * 2
ship.quaternion.copy(state.lifeLostFallingShipStartQuat)
ship.rotateZ(spinAngle)
ship.rotateX(-t * 0.8)  // nariz aponta pra baixo
```

**Câmera** (acompanha a nave, orbitando levemente):

```js
// A câmera segue a nave caindo, mantendo distância, e orbita em torno dela
state.lifeLostFallingOrbitProgress += dt * LIFE_LOST_FALLING_CAMERA_ORBIT_EASE
const orbitAngle = state.lifeLostFallingOrbitProgress * LIFE_LOST_FALLING_CAMERA_ORBIT_ANGLE
const orbitAxis = frame.up.clone()
const behind = frame.forward.clone().negate().applyAxisAngle(orbitAxis, orbitAngle)

const cameraTarget = ship.position.clone()
  .addScaledVector(behind, 12)
  .addScaledVector(frame.up, 2.5 - t * 3)  // câmera desce junto
camera.position.lerp(cameraTarget, 1 - Math.exp(-4 * rawDt))
camera.lookAt(ship.position)

// FOV zoom dramático
const fovProgress = Math.min(1, t * 2)  // chega no FOV final em 50% do tempo
camera.fov = lerp(LIFE_LOST_FALLING_FOV_START, LIFE_LOST_FALLING_FOV_END, fovProgress * fovProgress)
camera.updateProjectionMatrix()
```

**Efeitos visuais** (fogo, fumaça, detonações):

```js
// Detonações secundárias na fuselagem
state.lifeLostFallingFireAccumulator += rawDt * 1000
if (state.lifeLostFallingFireAccumulator >= LIFE_LOST_FALLING_FIRE_INTERVAL_MS) {
  state.lifeLostFallingFireAccumulator = 0
  const offset = new THREE.Vector3(
    (Math.random() - 0.5) * 3,
    (Math.random() - 0.5) * 1.5,
    (Math.random() - 0.5) * 3,
  )
  effects.explosion(ship.position.clone().add(offset), 0xff6622, 1.2, { rings: true })
  effects.hitSpark(ship.position.clone().add(offset), 0xffffff)
}

// Rastro de fumaça contínuo
state.lifeLostFallingSmokeAccumulator += rawDt * 1000
if (state.lifeLostFallingSmokeAccumulator >= LIFE_LOST_FALLING_SMOKE_INTERVAL_MS) {
  state.lifeLostFallingSmokeAccumulator = 0
  const exhaust = ship.position.clone().addScaledVector(frame.forward, -1.8)
  effects.fogWispCondensation(exhaust, 0x332211)  // reaproveita o efeito existente
}

// Fogo constante nos motores (efeito novo — ver §3)
effects.hullFirePulse(ship.position, LIFE_LOST_FALLING_TIME_SCALE)  // NOVO
```

**Shake da câmera** (cresce com a queda):

```js
const shakeMag = LIFE_LOST_FALLING_SHAKE_MAX * t
camera.position.x += (Math.random() * 2 - 1) * shakeMag * 0.1
camera.position.y += (Math.random() * 2 - 1) * shakeMag * 0.1
camera.position.z += (Math.random() * 2 - 1) * shakeMag * 0.1
```

### 2.4 Fim da fase

Quando `state.lifeLostFallingTimer <= 0`:

```js
// Flash vermelho final — impacto implícito com o "chão"
hud.triggerRedout?.()  // NOVO — análogo a triggerWhiteout, mas vermelho
setTimeout(() => {
  hud.hideLifeLostBanner?.()
  const done = state.lifeLostFallingOnDone
  state.lifeLostFallingOnDone = null
  if (done) done()
}, LIFE_LOST_FALLING_FLASH_HOLD_MS)
```

**Importante**: `setTimeout` aqui é gerenciável mas o ideal é usar o `scheduleTimeout` do HUD (que já existe em `hud-game.js` e é cancelado no `unmount`). Reaproveitar.

---

## 3. Efeitos novos necessários

Alguns efeitos do §2.3 já existem. Outros precisam ser criados em `src/effects.js`:

### 3.1 `hullFirePulse(position, timeScale)` — NOVO

Chamas persistentes saindo da fuselagem enquanto a nave cai. Diferente de `explosion` (transiente) — é um pulso contínuo.

**Como funciona**:
- 3–5 sprites de fogo (`bloomSprite` com cores `0xff6622`/`0xffaa33`) emitidos a cada ~40ms
- Cada sprite vive ~400ms, escala de 0.5 a 1.8, opacidade 0.9 → 0
- Emitidos em posições aleatórias ao redor do mesh (`±1.5u`)

```js
function hullFirePulse(position, timeScale = 1) {
  const spriteCount = 2 + Math.floor(Math.random() * 3)
  for (let i = 0; i < spriteCount; i++) {
    const offset = new THREE.Vector3(
      (Math.random() - 0.5) * 3,
      (Math.random() - 0.5) * 2,
      (Math.random() - 0.5) * 3,
    )
    const pos = position.clone().add(offset)
    bloomSprite(pos, Math.random() < 0.5 ? 0xff6622 : 0xffaa33, 0.7 + Math.random() * 0.6)
    hitSpark(pos, 0xff8844)
  }
}
```

Adicionar ao `return` do `createEffectsSystem`.

### 3.2 `triggerRedout()` — NOVO no HUD

Equivalente a `triggerWhiteout()` mas vermelho. Usado no impacto final da queda.

Em `hud-game.js`:

```js
const redoutOverlay = document.createElement('div')
redoutOverlay.className = 'hud-redout-overlay'
root.appendChild(redoutOverlay)

// no return do createGameHud:
triggerRedout() {
  redoutOverlay.classList.add('flash')
  setTimeout(() => redoutOverlay.classList.remove('flash'), 50)
}
```

CSS em `hud-styles.js` (cópia do whiteout, cor vermelha):

```css
.hud-redout-overlay {
  position: absolute;
  inset: 0;
  background: #ff2200;
  opacity: 0;
  pointer-events: none;
  z-index: 41;
  transition: opacity 0.4s ease-out;
}
.hud-redout-overlay.flash {
  opacity: 0.9;
  transition: none;
}
```

### 3.3 `showLifeLostBanner({ text, subtext })` — NOVO no HUD

Banner arcade "VIDA PERDIDA" estilo Star Fox. Aparece no início da queda, some sozinho.

Em `hud-game.js`:

```js
const lifeLostBanner = document.createElement('div')
lifeLostBanner.className = 'hud-life-lost-banner'
lifeLostBanner.hidden = true
root.appendChild(lifeLostBanner)

// API:
showLifeLostBanner({ text = 'VIDA PERDIDA', subtext = 'NAVE RESERVA EM TRÂNSITO' } = {}) {
  lifeLostBanner.innerHTML = `
    <div class="hud-life-lost-title">${text}</div>
    <div class="hud-life-lost-sub">${subtext}</div>
  `
  lifeLostBanner.hidden = false
}
hideLifeLostBanner() {
  lifeLostBanner.hidden = true
}
```

CSS em `hud-styles.js` (parecido com o `hud-mission-complete` que já existe, mas vermelho e dramático):

```css
.hud-life-lost-banner {
  position: absolute;
  top: 42%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  z-index: 34;
  pointer-events: none;
  font-family: monospace, sans-serif;
  animation: life-lost-in 0.5s cubic-bezier(0.18, 1.25, 0.4, 1) both;
}
@keyframes life-lost-in {
  0% { opacity: 0; transform: translate(-50%, -60%) scale(0.85); }
  100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
}
.hud-life-lost-title {
  color: #ff2222;
  font-size: 2.4rem;
  font-weight: 900;
  letter-spacing: 0.22em;
  text-shadow: 0 0 25px rgba(255, 30, 30, 0.8), 0 2px 4px #000;
  animation: life-lost-pulse 0.9s ease-in-out infinite alternate;
}
@keyframes life-lost-pulse {
  from { text-shadow: 0 0 20px rgba(255, 30, 30, 0.6), 0 2px 4px #000; }
  to   { text-shadow: 0 0 35px rgba(255, 30, 30, 1.0), 0 2px 4px #000; }
}
.hud-life-lost-sub {
  color: #ffcccc;
  font-size: 1.0rem;
  letter-spacing: 0.18em;
}
```

---

## 4. Transição (tela preta)

**Não é um estado novo** — é parte do fim da fase 1 e do início da fase 2.

- Ao terminar o `LIFE_LOST_FALLING_FLASH_HOLD_MS` (flash vermelho), o callback `lifeLostFallingOnDone` dispara
- Esse callback chama `startLifeLostRespawnCutscene`, que **começa com a tela preta**
- O preto é uma camada DOM no HUD (`hud-blackout-overlay`) que começa opaca e clareia no primeiro `LIFE_LOST_BLACK_SCREEN_HOLD_MS` da fase 2

Em `hud-game.js`:

```js
const blackoutOverlay = document.createElement('div')
blackoutOverlay.className = 'hud-blackout-overlay'
root.appendChild(blackoutOverlay)

// API:
showBlackout() { blackoutOverlay.classList.add('active') }
hideBlackout() { blackoutOverlay.classList.remove('active') }
```

CSS:

```css
.hud-blackout-overlay {
  position: absolute;
  inset: 0;
  background: #000000;
  opacity: 0;
  pointer-events: none;
  z-index: 50;
  transition: opacity 0.4s ease-out;
}
.hud-blackout-overlay.active {
  opacity: 1;
  transition: opacity 0.15s ease-in;
}
```

**Na fase 2**, a blackout começa ativa e é removida depois de `LIFE_LOST_BLACK_SCREEN_HOLD_MS`.

---

## 5. Fase 2 — Reserva (nova nave chegando)

### 5.1 Entrada no estado

`cutscenes.startLifeLostRespawnCutscene(onDone)`:

```js
state.phase = 'lifeLostRespawn'
state.lifeLostRespawnTimer = LIFE_LOST_RESPAWN_DURATION_MS
state.lifeLostRespawnOnDone = onDone
state.lifeLostRespawnFrame = rail.getFrameAt(0)

// Posiciona a nova nave atrás da câmera
const ship = rail.getShipMesh()
ship.visible = true
const spawnPos = rail.getPlayerPosition()
  .addScaledVector(state.lifeLostRespawnFrame.forward, -LIFE_LOST_RESPAWN_SPAWN_BACK)
ship.position.copy(spawnPos)
ship.quaternion.identity()
ship.lookAt(ship.position.clone().add(state.lifeLostRespawnFrame.forward))

// Blackout ativo até o início da fase
hud.showBlackout()
// Depois do hold, esconde
state.lifeLostRespawnBlackoutTimer = LIFE_LOST_BLACK_SCREEN_HOLD_MS

hud.setLetterbox(true)  // mantém o letterbox da fase 1

// FOV inicial alto (sensação de velocidade)
camera.fov = LIFE_LOST_RESPAWN_FOV_START
camera.updateProjectionMatrix()
```

**Antes disso** (no callback do falling), chamar `player.rechargeShield()` ou resetar HP para o máximo — pra a nova nave vir "de fábrica". Ver §7.2.

### 5.2 Comportamento por frame

`cutscenes.updateLifeLostRespawnCutscene(rawDt)`:

```js
if (state.phase !== 'lifeLostRespawn') return false

state.lifeLostRespawnTimer -= rawDt * 1000
const elapsed = LIFE_LOST_RESPAWN_DURATION_MS - state.lifeLostRespawnTimer
const t = clamp(elapsed / LIFE_LOST_RESPAWN_DURATION_MS, 0, 1)

// Blackout inicial — clareia depois do hold
if (state.lifeLostRespawnBlackoutTimer > 0) {
  state.lifeLostRespawnBlackoutTimer -= rawDt * 1000
  if (state.lifeLostRespawnBlackoutTimer <= 0) {
    hud.hideBlackout()
  }
}
```

**Movimento da nave**:

```js
const ship = rail.getShipMesh()
const frame = state.lifeLostRespawnFrame
const playerPos = rail.getPlayerPosition()

// Direção de aproximação: de trás pra frente
const direction = frame.forward.clone()
const totalDist = LIFE_LOST_RESPAWN_SPAWN_BACK

// Velocidade: começa alta, desacelera nos últimos DECEL_START_DIST
let speed = LIFE_LOST_RESPAWN_APPROACH_SPEED
const distToTarget = ship.position.distanceTo(playerPos)
if (distToTarget < LIFE_LOST_RESPAWN_DECEL_START_DIST) {
  speed = LIFE_LOST_RESPAWN_APPROACH_SPEED * (distToTarget / LIFE_LOST_RESPAWN_DECEL_START_DIST)
}

// Move em direção ao alvo
const toTarget = playerPos.clone().sub(ship.position)
if (toTarget.lengthSq() > 0.01) {
  const moveVec = toTarget.normalize().multiplyScalar(speed * rawDt)
  ship.position.add(moveVec)
} else {
  // chegou — trava exato
  ship.position.copy(playerPos)
}

// Orientação: olha pra frente
ship.lookAt(ship.position.clone().add(direction))
```

**FOV** (desacelera junto com a nave):

```js
const fovT = 1 - Math.exp(-LIFE_LOST_RESPAWN_FOV_LERP_RATE * rawDt)
camera.fov += (LIFE_LOST_RESPAWN_FOV_END - camera.fov) * fovT
camera.updateProjectionMatrix()
```

**Flicker de i-frames** (nos últimos `LIFE_LOST_RESPAWN_FLICKER_DURATION_MS`):

```js
const timeLeft = state.lifeLostRespawnTimer
if (timeLeft < LIFE_LOST_RESPAWN_FLICKER_DURATION_MS) {
  const flickerOn = Math.floor(timeLeft / LIFE_LOST_RESPAWN_FLICKER_INTERVAL_MS) % 2 === 0
  ship.visible = flickerOn
}
```

**Puff de chegada** (quando para):

```js
if (distToTarget < 0.5 && !state.lifeLostRespawnSettlePuffed) {
  state.lifeLostRespawnSettlePuffed = true
  effects.propulsionBurst(ship.position, frame.forward)
  effects.shockwave(ship.position, 0x3ea6ff, 1.0)
}
```

**Câmera** (segue a nave de longe, aproximando-se conforme ela se aproxima):

```js
const camTarget = playerPos.clone()
  .addScaledVector(frame.forward, -10)
  .addScaledVector(frame.up, 3)
camera.position.lerp(camTarget, 1 - Math.exp(-2.5 * rawDt))
camera.lookAt(playerPos)
```

**Importante**: `camera` deve estar na posição correta **antes** do fim da cutscene pra não dar snap quando `rail.update()` voltar a controlar.

### 5.3 Fim da fase

Quando `state.lifeLostRespawnTimer <= 0`:

```js
// Garante que a nave está exatamente na posição esperada
ship.position.copy(rail.getPlayerPosition())
ship.quaternion.copy(rail.getShipMesh().quaternion)  // (manter a atual, é a correta)
ship.visible = true

// Sai do letterbox suavemente
hud.setLetterbox(false)

// Restaura FOV
camera.fov = 70
camera.updateProjectionMatrix()

// Limpa o estado
state.lifeLostRespawnBlackoutTimer = 0
state.lifeLostRespawnSettlePuffed = false

const done = state.lifeLostRespawnOnDone
state.lifeLostRespawnOnDone = null
if (done) done()
```

O callback final chama `enterCombat()` (ou só retoma o estado anterior — `state.phase = 'combat'` se já era combate).

---

## 6. Comportamento da câmera durante as duas fases

### 6.1 Fase 1 — Queda

| Tempo | Câmera |
|---|---|
| 0–15% | Estática na posição normal, olhando pra nave |
| 15–60% | Segue a nave caindo, distância cresce de 10 → 12u |
| 60–100% | Órbita se intensifica, FOV afunila, câmera desce junto |
| Final | Fica olhando pra nave sumindo abaixo, shake máximo |

**Suavização**: `1 - Math.exp(-rate * dt)` em todas as transições — nada de lerp linear.

### 6.2 Fase 2 — Reserva

| Tempo | Câmera |
|---|---|
| 0–20% | Tela preta (blackout). Câmera já na posição final. |
| 20–50% | Câmera estática no ponto final (atrás da posição do jogador). Nave ainda fora do quadro. |
| 50–80% | Nave entra no quadro vindo de trás. Câmera estática. |
| 80–100% | Nave desacelera e trava. Câmera estática. FOV volta ao normal. |

**Filosofia**: câmera **não se mexe** na fase 2. A nave faz todo o trabalho. É mais limpo e evita enjoo.

---

## 7. Pré-requisitos em outros arquivos

### 7.1 `player.js` — `takeDamage()` precisa retornar `lifeLost`

Hoje:

```js
function takeDamage(amount = 1) {
  // ...lógica...
  let outOfLives = false
  if (remaining > 0) {
    // ...
    outOfLives = applyHealthLoss()
    // ...
  }
  return { absorbedByShield, shieldBroke, outOfLives }
}
```

Adicionar:

```js
function takeDamage(amount = 1) {
  const livesBefore = session.lives
  // ...lógica existente...
  let outOfLives = false
  if (remaining > 0) {
    // ...
    outOfLives = applyHealthLoss()
    // ...
  }
  const lifeLost = !outOfLives && session.lives < livesBefore
  return { absorbedByShield, shieldBroke, outOfLives, lifeLost }
}
```

`lifeLost` é `true` quando **health chegou a 0**, `applyHealthLoss` decrementou 1 vida, **e** não era a última vida. É o caso "intermediário" que dispara a cutscene.

### 7.2 `player.js` — reset de HP ao entrar na fase 2

Quando a vida é perdida, `applyHealthLoss()` já reseta `session.health = maxHealth`. Então a nova nave já vem com HP cheio por design. **Nada a fazer** — só confirmar que o reset acontece **antes** da cutscene começar (hoje acontece dentro do próprio `applyHealthLoss`, chamado por `takeDamage`, antes do return).

### 7.3 `game-loop.js` — dispatcher

Adicionar no topo do bloco de cutscenes (junto com as 3 existentes):

```js
if (cutscenes.updateLifeLostFallingCutscene(rawDt)) return
if (cutscenes.updateLifeLostRespawnCutscene(rawDt)) return
```

**Ordem importa**: essas duas devem vir **depois** de `updateLaunchCutscene` e `updateArenaCutscene`, mas **antes** de `updateDeathCutscene` (a de inimigo). Se `lifeLostFalling` está ativo, `updateDeathCutscene` não faz sentido rodar.

### 7.4 `game-loop.js` — input lock

Como o dispatcher retorna `true`, o `runFrame` **para ali** e não chama `player.update()`, `rail.update()`, etc. O input naturalmente não chega ao jogador. Nada a fazer.

### 7.5 `hud-game.js` — blackout/redout/banner

Adicionar os métodos `showBlackout/hideBlackout/triggerRedout/showLifeLostBanner/hideLifeLostBanner` (ver §3).

### 7.6 `cutscenes.js` — novos métodos

Os dois novos métodos (`startLifeLostFallingCutscene`, `updateLifeLostFallingCutscene`, `startLifeLostRespawnCutscene`, `updateLifeLostRespawnCutscene`) podem ser adicionados **em `cutscenes.js`** (já tem todas as deps) ou num arquivo novo `life-lost-cutscene.js`. Recomendo **arquivo novo** — `cutscenes.js` já tem 280+ linhas e as duas cutscenes novas somam ~200.

Estrutura do arquivo novo:

```js
// life-lost-cutscene.js
import * as THREE from 'three'
import {
  LIFE_LOST_FALLING_DURATION_MS,
  // ... todos os outros timings
} from './main-constants.js'

export function createLifeLostCutsceneSystem(deps) {
  const { state, camera, renderer, scene, effects, hud, rail, player } = deps

  function startLifeLostFallingCutscene(onDone) { /* ... */ }
  function updateLifeLostFallingCutscene(rawDt) { /* ... */ }
  function startLifeLostRespawnCutscene(onDone) { /* ... */ }
  function updateLifeLostRespawnCutscene(rawDt) { /* ... */ }

  return {
    startLifeLostFallingCutscene,
    updateLifeLostFallingCutscene,
    startLifeLostRespawnCutscene,
    updateLifeLostRespawnCutscene,
  }
}
```

E em `mount-game.js`, instanciar e passar pro `gameLoop`:

```js
const lifeLostCutscene = createLifeLostCutsceneSystem({ state, camera, renderer, scene, effects, hud, rail, player })
// ...
const gameLoop = createGameLoop({
  // ...
  lifeLostCutscene,
  // ...
})
```

`game-loop.js` só precisa dos dois `update` no dispatcher.

---

## 8. Fluxo completo (diagrama de estados)

```
[combat]
   ↓ jogador perde vida (health → 0, lives > 0)
[lifeLostFalling]  (2000ms)
   ↓ timer esgota
[flash vermelho]   (250ms)
   ↓
[lifeLostRespawn]  (1500ms)
   ├── [blackout]     (300ms) — tela preta
   ├── [fade in]      — nave aparece vindo de trás
   ├── [aproximação]  — nave voa em direção ao ponto
   ├── [deceleração]  — freia nos últimos 20u
   └── [estabilização]— flicker de i-frames + puff
   ↓ timer esgota
[combat]  (retomado)
```

Tempo total: **~4050ms** (com os valores default do §1).

**Pular** (opcional): se o jogador apertar [Espaço]/[Enter] depois de `LIFE_LOST_SKIP_AFTER_MS`, a cutscene é acelerada — `state.lifeLostFallingTimer = 0` e/ou `state.lifeLostRespawnTimer = 0`, o que faz a fase terminar no próximo frame e disparar os callbacks. Aplicar só depois do threshold pra não pular por acidente.

---

## 9. Casos extremos

### 9.1 Perder vida durante pergunta (questionPause/cardChoice)

**Não acontece.** Durante essas fases, o jogo está pausado — `runFrame` retorna antes de chegar no bloco de dano. Nada a fazer.

### 9.2 Perder vida durante boss fight / golden arena

**Acontece normalmente.** A cutscene roda, o boss/dourado fica congelado (não é atualizado porque o loop retorna cedo), e retoma do mesmo estado ao voltar. O `arenaCutscene` também não interfere — ele roda **antes** das duas novas no dispatcher, então só roda se a fase for `arenaCutscene`.

**Cuidado**: se a nave morrer **durante** um ataque de laser do chefe, o telegraph do laser some quando a fase entra em `lifeLostFalling`. É justo? Talvez. É uma decisão de design. Se quiser preservar o laser em curso, teria que rodar `updateBossLaser` mesmo durante a cutscene — o que é complexo e provavelmente não vale.

### 9.3 Perder vida enquanto o jogo está em `slowMo` (debug)

`state.debugFlags.slowMoActive` afeta `rawDt` no `runFrame`, mas as cutscenes usam `rawDt` (que já é afetado). O `LIFE_LOST_FALLING_TIME_SCALE` é aplicado **em cima** — então em slowMo, a cutscene fica ainda mais lenta. **Aceitável** (é debug).

### 9.4 Perder vida com o rail em modo arena

`rail.isArena()` retorna `true`. A cutscene precisa funcionar em 3D livre, não só no trilho. Por isso o §2.3 usa `frame.up`, `frame.right`, `frame.forward` — funciona nos dois modos (o `frame` do trilho tem os mesmos eixos).

**Importante**: usar `state.lifeLostFallingFrameAtStart` capturado **no início da cutscene**, não `rail.getFrameAt(0)` (que é o frame do trilho e pode não existir em arena). O `frame` em arena é `{ position, forward, right, up }` também — só que vem do `lastFrame` que o rail mantém.

### 9.5 Perder vida enquanto está em `launchCutscene`

Impossível — o jogo não aceita dano durante a decolagem (o input está bloqueado, os inimigos não spawnam até o combate começar).

### 9.6 Perder a última vida

Não usa essas cutscenes. Vai direto pro `endSector()` como hoje. **Considerar** no futuro adicionar uma terceira fase específica de game over (o documento atual não cobre).

### 9.7 Perder vida com `debugFlags.godMode = true`

Não acontece. O `game-loop.js` já filtra: `if (events.enemyHits > 0 && !player.isInvincible() && !state.debugFlags.godMode)`.

### 9.8 Perder vida e clicar em "skip" muito rápido

Se o jogador pular a fase de queda em 100ms, o flash vermelho ainda roda (250ms) e depois entra na fase 2. Aceitável.

### 9.9 Mesh da nave ficar escondido

Durante a fase 1, `rail.setShipVisible(...)` pode ser chamado pelo game-loop por conta da invencibilidade (o `INVINCIBILITY_FLICKER_MS` pisca a nave). **Precisa desabilitar o flicker durante as duas cutscenes** — senão a nave pisca enquanto cai. Ou controlar `ship.visible = true` explicitamente dentro da cutscene.

**Solução**: no `game-loop.js`, o bloco que faz `rail.setShipVisible(...)` **não roda** durante as cutscenes (porque o `runFrame` retorna antes). Já está garantido pelo dispatcher.

---

## 10. Arquivos afetados (visão consolidada)

| Arquivo | Mudança | Obrigatório? |
|---|---|---|
| `src/main-constants.js` | Bloco de timings `LIFE_LOST_*` | Sim |
| `src/player.js` | `takeDamage()` retorna `lifeLost` | Sim |
| `src/life-lost-cutscene.js` | **Arquivo novo** com os dois sistemas | Sim |
| `src/mount-game.js` | Instanciar `lifeLostCutscene` e passar pro game-loop | Sim |
| `src/game-loop.js` | Dispatcher das duas fases + call no bloco de dano | Sim |
| `src/effects.js` | `hullFirePulse` (novo efeito de chama) | Sim |
| `src/hud-game.js` | `triggerRedout`, `showBlackout`, `showLifeLostBanner` | Sim |
| `src/hud-styles.js` | CSS de redout, blackout, life-lost-banner | Sim |
| `src/hud.js` | Re-exportar se necessário (fachada) | Verificar |
| `src/main-constants.js` | (já citado acima) | Sim |
| `src/selftest.mjs` | Testes do `lifeLost` no `takeDamage` | Opcional |
| `src/debug-actions.js` | Ação de debug "testar cutscene de vida perdida" | Opcional |

---

## 11. Ordem de implementação sugerida

### Fase 1 — Preparação (baixo risco)
1. `main-constants.js` — bloco completo de timings
2. `player.js` — adicionar `lifeLost` ao retorno de `takeDamage`
3. `selftest.mjs` — teste unitário de `lifeLost` (verifica que o campo existe e funciona)

### Fase 2 — Fase 1 da cutscene (média complexidade)
4. `effects.js` — `hullFirePulse`
5. `hud-game.js` + `hud-styles.js` — `triggerRedout`
6. `life-lost-cutscene.js` — `startLifeLostFallingCutscene` + `updateLifeLostFallingCutscene` (sem ligar no loop ainda)
7. `mount-game.js` — instanciar o sistema e passar pro game-loop

### Fase 3 — Transição e Fase 2 (média complexidade)
8. `hud-game.js` + `hud-styles.js` — `showBlackout` / `hideBlackout`
9. `hud-game.js` + `hud-styles.js` — `showLifeLostBanner` / `hideLifeLostBanner`
10. `life-lost-cutscene.js` — `startLifeLostRespawnCutscene` + `updateLifeLostRespawnCutscene`

### Fase 4 — Integração (alto risco)
11. `game-loop.js` — dispatcher das duas fases
12. `game-loop.js` — call no bloco de dano ao jogador
13. Testar em combate normal (fora de arena) — verificar visual
14. Testar em arena (chefe/dourado) — verificar se não trava

### Fase 5 — Polimento (opcional)
15. `debug-actions.js` — ação "testar cutscene de vida perdida"
16. Skip com [Espaço] após `LIFE_LOST_SKIP_AFTER_MS`
17. Fade-in do HUD depois do respawn
18. Áudio (quando existir áudio — `PLAYER_SOUND_CUES.life_lost` + nova cue de respawn)

---

## 12. Ideias de polimento

- **"NEW SHIP INBOUND"** ou **"NAVE RESERVA"** em texto arcade durante o blackout — tipo insert de fliperama
- **Contador de vidas** aparece brevemente durante o blackout — feedback de "gastou uma vida"
- **Wingmen** fazem uma formação de honra quando a nave volta — se tiver esquadrão ativo, os aliados voam em V ao redor da nave nova por 0.5s
- **Rastro de luz** na nave que chega — `boostTrailParticle` durante a aproximação
- **Fumaça residual** na fase 2 — um pouco de fumaça na tela no primeiro frame do respawn (resíduo da explosão anterior), some em 0.3s
- **Nome do baralho/setor** aparece no blackout — "SETOR 03 // CONTINUANDO"

---

## 13. Perguntas em aberto

1. **Duração total de ~4050ms é aceitável?** Em combate rápido, pode parecer longo. Se for, cortar pra ~3000ms ajustando os três timings grandes (`FALLING_DURATION_MS`, `BLACK_SCREEN_HOLD_MS`, `RESPAWN_DURATION_MS`).
2. **Skip deve existir?** Star Fox 64 tem morte **não pulável** — é parte do ritmo. Arcade puro às vezes tem. Recomendo **não pular**, mas se você quiser, é 3 linhas.
3. **Nave nova deve ter visual diferente?** Star Fox 64 mantém a mesma (é a mesma nave que reaparece). Sugiro manter a mesma pra consistência.
4. **HP ao voltar**: já vem com `maxHealth` porque `applyHealthLoss()` reseta. Confirmar se é o desejado — poderia ser menos (ex: 50% do máximo) pra punir a morte mais duramente. Se quiser, é 1 linha em `player.js`.
5. **Shield ao voltar**: hoje `applyHealthLoss()` seta `shieldValue = shieldMax`. Confirmar se mantém.
6. **Nome do arquivo**: `life-lost-cutscene.js` ou `player-life-cutscene.js` ou adicionar em `cutscenes.js`? Recomendo `life-lost-cutscene.js` (nome curto e descritivo).
7. **Boss fight**: enquanto a cutscene roda, o boss fica congelado. É justo? Se quiser que ele continue se movendo (sem causar dano), teria que chamar `enemies.update` durante a cutscene — mais complexo. Recomendo deixar congelado.

---

## 14. Riscos

### 14.1 Risco de "câmera estranha"

A câmera da fase 1 usa o `state.lifeLostFallingFrameAtStart` capturado **uma vez** — não atualiza com o trilho. Se a nave cai enquanto o trilho continua movendo, o frame fica "desatualizado" e a câmera pode parecer que está solta no espaço.

**Mitigação**: enquanto a cutscene roda, o `rail.update()` **não é chamado** (o dispatcher retorna antes). O trilho congela. A queda acontece num "espaço congelado". É o comportamento desejado — a queda é uma suspensão do tempo.

### 14.2 Risco de "mesh com material compartilhado"

O `hullFirePulse` usa `bloomSprite` e `hitSpark` que criam meshes temporários. Não mexe no material da nave. Nenhum risco de contaminar outras naves.

### 14.3 Risco de "vida perdida durante telegraph de tiro inimigo"

O telegraph é um efeito transiente (`effects.telegraph`). Ele é desenhado por `effects.update` que **não roda** durante a cutscene. Vai "sumir" quando a cutscene terminar. Aceitável.

### 14.4 Risco de "HP da nova nave não é full"

Se `applyHealthLoss()` não resetar `session.health` (por algum bug), a nova nave nasce com HP 0 e morre de novo. **Verificar** que o reset acontece. Teste com `selftest.mjs`.

### 14.5 Risco de "snap no fim da fase 2"

Se o `camera` não estiver exatamente onde o `rail.update()` espera, dá um snap de 1 frame. **Mitigação**: no fim da fase 2, chamar `camera.position.copy(...)` com a posição exata que o rail usaria. Reaproveitar a fórmula do `update()` do rail (ver `rail.js`, bloco final de `update()`).

### 14.6 Risco de "conflito com Overhaul de spawn de inimigos"

Se o overhaul de spawn (documento anterior) estiver sendo implementado em paralelo, ambos mexem em `enemies/index.js` e `effects.js`. **Ordem**: implementar este documento **primeiro** (é mais isolado), depois o overhaul de spawn.

---

## 15. Resumo executivo

A cutscene de vida perdida tem **duas fases distintas** com uma tela preta entre elas:

1. **Queda** (2s): nave pegando fogo, caindo e girando. Câmera lenta + zoom + shake. Termina em flash vermelho.
2. **Tela preta** (300ms): beat dramático.
3. **Reserva** (1.5s): nova nave surgindo de trás da câmera em alta velocidade, desacelerando e estacionando no lugar exato do rail. Flicker de i-frames + puff de chegada.

**Timings, distâncias e velocidades ficam todos no topo do arquivo** em constantes exportadas. Nada é hardcoded na lógica.

**Ponto crítico de integração**: `player.takeDamage()` precisa retornar um campo novo `lifeLost: true` quando o jogador perde uma vida intermediária (health = 0, lives > 0). Sem isso, o `game-loop.js` não tem como saber que deve rodar a cutscene em vez de só chamar `respawnBurst`.

**Filosofia**: a morte precisa doer, a volta precisa aliviar. Queda é longa e cinematográfica, respawn é rápido e heroico.

---

*Fim do documento. Aprovar §1 (timings) e §13 (perguntas em aberto) antes de começar. Assim que você mandar o material sobre os wingmen, planejo as mudanças deles em cima deste formato.*