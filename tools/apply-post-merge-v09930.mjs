import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs'

function read(path) { return readFileSync(path, 'utf8') }
function write(path, content) { writeFileSync(path, content) }
function replaceOnce(path, from, to, label = from.slice(0, 60)) {
  const src = read(path)
  if (src.includes(to)) return
  if (!src.includes(from)) throw new Error(`Trecho não encontrado em ${path}: ${label}`)
  write(path, src.replace(from, to))
}
function replaceRegex(path, re, to, label) {
  const src = read(path)
  if (typeof to === 'string' && src.includes(to)) return
  if (!re.test(src)) throw new Error(`Regex não encontrou trecho em ${path}: ${label}`)
  write(path, src.replace(re, to))
}

// 1/5 — volta completa do rádio dos Wingmen para os painéis laterais legados.
write('src/hud.js', `// Fachada — o resto do projeto continua importando daqui, sem depender dos módulos internos do HUD.
export { showPreGameMenu } from './hud-pregame.js'
export { showDeckManager } from './hud-decks.js'
export { showSettingsScreen } from './hud-settings.js'
export { showSectorEnd, showPainelCard, showPainelAnswer } from './hud-end.js'

import { createGameHud as createBaseGameHud } from './hud-game.js'
import { createHudSpeedlines } from './hud-speedlines.js'

export function createGameHud() {
  const hud = createBaseGameHud()
  const speedlines = createHudSpeedlines(document.getElementById('game-screen'))
  const baseUnmount = hud.unmount?.bind(hud)

  // v0.99.30: rádio dos Wingmen volta integralmente aos dois painéis laterais de hud-game.js.
  // Isso restaura estática, connect/disconnect e vozes por piloto. Só o chamado do Fox permanece
  // no mundo, acima da nave do jogador. O renderer de speedlines continua substituindo o spinner.
  hud.setMotionLines = (active, intensity = null) => {
    speedlines.set(active, intensity)
  }

  hud.unmount = () => {
    speedlines.dispose()
    baseUnmount?.()
  }

  return hud
}
`)
if (existsSync('src/hud-wingman-radio-slots.js')) unlinkSync('src/hud-wingman-radio-slots.js')

// 3/7 — helpers puros de estabilidade de voo e validade de alvo.
write('src/combat/wingman-flight-stability.js', `export const WINGMAN_ARENA_ARRIVAL_STOP_RADIUS = 0.9
export const WINGMAN_ARENA_ARRIVAL_FULL_SPEED_RADIUS = 10
export const WINGMAN_RESCUE_TIMEOUT_S = 5
export const WINGMAN_STALL_SAMPLE_INTERVAL_S = 0.35
export const WINGMAN_STALL_RECOVERY_S = 1.4
export const WINGMAN_STALL_MIN_PROGRESS = 0.12

function clamp01(value) { return Math.max(0, Math.min(1, value)) }
function smoothstep01(value) {
  const t = clamp01(value)
  return t * t * (3 - 2 * t)
}

export function computeWingmanArrivalScale(distance, stopRadius = WINGMAN_ARENA_ARRIVAL_STOP_RADIUS, fullSpeedRadius = WINGMAN_ARENA_ARRIVAL_FULL_SPEED_RADIUS) {
  if (!Number.isFinite(distance) || distance <= stopRadius) return 0
  if (distance >= fullSpeedRadius) return 1
  return smoothstep01((distance - stopRadius) / Math.max(0.001, fullSpeedRadius - stopRadius))
}

export function computeFormationMotionGain(playerSpeed, idleThreshold = 0.75, fullMotionSpeed = 8) {
  if (!Number.isFinite(playerSpeed) || playerSpeed <= idleThreshold) return 0
  if (playerSpeed >= fullMotionSpeed) return 1
  return smoothstep01((playerSpeed - idleThreshold) / Math.max(0.001, fullMotionSpeed - idleThreshold))
}

export function isWingmanCombatTargetReady(target, readyTargets = null) {
  if (!target || target.dying || target.fadingOut || !target.mesh || !target.mesh.parent) return false
  if (readyTargets && !readyTargets.has(target)) return false
  return true
}

export function createWingmanStallWatch(position) {
  return {
    sampleElapsed: 0,
    stalledFor: 0,
    lastPosition: { x: position?.x || 0, y: position?.y || 0, z: position?.z || 0 },
  }
}

export function updateWingmanStallWatch(watch, { dt, position, targetDistance, desiredSpeed } = {}) {
  if (!watch || !position || !Number.isFinite(dt) || dt <= 0) return { recover: false, moved: 0, stalledFor: watch?.stalledFor || 0 }
  watch.sampleElapsed += dt
  if (watch.sampleElapsed < WINGMAN_STALL_SAMPLE_INTERVAL_S) return { recover: false, moved: 0, stalledFor: watch.stalledFor }

  const sampleElapsed = watch.sampleElapsed
  watch.sampleElapsed = 0
  const dx = position.x - watch.lastPosition.x
  const dy = position.y - watch.lastPosition.y
  const dz = position.z - watch.lastPosition.z
  const moved = Math.hypot(dx, dy, dz)
  watch.lastPosition.x = position.x
  watch.lastPosition.y = position.y
  watch.lastPosition.z = position.z

  const shouldProgress = Number.isFinite(targetDistance) && targetDistance > 6 && Number.isFinite(desiredSpeed) && desiredSpeed > 6
  if (shouldProgress && moved < WINGMAN_STALL_MIN_PROGRESS) watch.stalledFor += sampleElapsed
  else watch.stalledFor = 0

  const recover = watch.stalledFor >= WINGMAN_STALL_RECOVERY_S
  if (recover) watch.stalledFor = 0
  return { recover, moved, stalledFor: watch.stalledFor }
}
`)

let wing = read('src/combat/wingmen.js')
const navImport = `import {\n  WINGMAN_NAVIGATION_INTENTS,\n  computeRailCatchupBoost,\n  computeRailLongitudinalLag,\n  isFiniteWingmanPosition,\n  navigationIntentForWingman,\n} from './wingman-navigation.js'\n`
const stabilityImport = `${navImport}import {\n  WINGMAN_RESCUE_TIMEOUT_S,\n  computeFormationMotionGain,\n  computeWingmanArrivalScale,\n  createWingmanStallWatch,\n  isWingmanCombatTargetReady,\n  updateWingmanStallWatch,\n} from './wingman-flight-stability.js'\n`
if (!wing.includes("from './wingman-flight-stability.js'")) {
  if (!wing.includes(navImport)) throw new Error('wingmen: import navigation não encontrado')
  wing = wing.replace(navImport, stabilityImport)
}
wing = wing.replace(`const FALCO_WEAVE_AMPLITUDE = 3.0 // ±3u`, `const FALCO_WEAVE_AMPLITUDE = 1.2 // personalidade visível sem oscilar a formação inteira`)

const announceRe = /  function announceAbility\(wingman, eventId\) \{[\s\S]*?\n  \}\n\n  function announceWorld\(wingman, eventId\) \{[\s\S]*?\n  \}\n  \/\/ Rádio:/
const announceNew = `  function announceAbility(wingman, eventId) {
    // A nave continua recebendo o pulso de 1,5 s, mas a TRANSMISSÃO volta ao rádio lateral.
    worldRadio.triggerAbilityGlow(wingman.mesh, wingman.profile.accentColor, WINGMAN_ABILITY_GLOW_DURATION_S)
    const text = wingmanRadio.speakAbility(
      wingman.profile.id,
      eventId,
      performance.now(),
      { activePilotIds: activeRadioPilotIds() },
    )
    aiValidator.expect(
      'Habilidade de Wingman possui quote lateral e brilho de 1.5s',
      () => typeof text === 'string' && text.length > 0 && WINGMAN_ABILITY_GLOW_DURATION_S === 1.5,
      { pilotId: wingman.profile.id, eventId, glowDuration: WINGMAN_ABILITY_GLOW_DURATION_S },
    )
    if (text) pendingRadioMessages.push(buildRadioPayload(wingman.profile, text, eventId))
    aiValidator.logMechanic('wingman-radio', 'ability-announced-lateral', {
      pilotId: wingman.profile.id,
      eventId,
      glowDuration: WINGMAN_ABILITY_GLOW_DURATION_S,
      hasQuote: !!text,
    })
    return text
  }

  function announceLateral(wingman, eventId) {
    const text = wingmanRadio.getLine(wingman.profile.id, eventId)
    if (!text) return null
    pendingRadioMessages.push(buildRadioPayload(wingman.profile, text, eventId))
    return text
  }
  // Rádio:`
if (!wing.includes("Habilidade de Wingman possui quote lateral e brilho de 1.5s")) {
  if (!announceRe.test(wing)) throw new Error('wingmen: announceAbility/announceWorld não encontrados')
  wing = wing.replace(announceRe, announceNew)
}

wing = wing.replace(
`  const reportedFormationClumps = new Set()\n`,
`  const reportedFormationClumps = new Set()\n  const previousPlayerPosition = new THREE.Vector3()\n  let hasPreviousPlayerPosition = false\n`,
)
wing = wing.replace(
`      railCatchupActive: false,\n`,
`      railCatchupActive: false,\n      motionWatch: createWingmanStallWatch(spawnPos),\n`,
)
wing = wing.replace(
`    const inArena = rail.isArena()\n`,
`    const inArena = rail.isArena()\n    const playerMotionSpeed = hasPreviousPlayerPosition && dt > 0\n      ? previousPlayerPosition.distanceTo(playerPos) / dt\n      : 0\n    previousPlayerPosition.copy(playerPos)\n    hasPreviousPlayerPosition = true\n    const formationMotionGain = inArena ? computeFormationMotionGain(playerMotionSpeed) : 1\n`,
)
wing = wing.replace(
`      const validLocked = Array.isArray(lockedTargets) ? lockedTargets.filter((e) => e && !e.dying && e.mesh) : []\n`,
`      const readyFocusTargets = new Set(getAliveEnemies())\n      const validLocked = Array.isArray(lockedTargets)\n        ? lockedTargets.filter((e) => isWingmanCombatTargetReady(e, readyFocusTargets))\n        : []\n`,
)

const focusRe = /      triggerSoundCue\(WINGMAN_SOUND_CUES\.command_focus_toggle,[\s\S]*?\n      aiValidator\.logMechanic\('wingman-world-radio', 'focus-broadcast',[\s\S]*?\n      \}\)\n\n      return \{/
const focusNew = `      triggerSoundCue(WINGMAN_SOUND_CUES.command_focus_toggle, { targetCount: squadronFocusTargets.length, hasLocked: validLocked.length > 0 })

      // Só Fox permanece in-world. Toda confirmação dos Wingmen volta ao rádio lateral, inclusive
      // pilotos ocupados em Actions: responder ao comando não significa cancelar sua ação atual.
      worldRadio.showFoxFocus(playerPos, {
        text: validLocked.length > 0 ? 'All units, focus on my target!' : 'All units, focus fire!',
        targetCount: squadronFocusTargets.length,
        hasLocked: validLocked.length > 0,
      })
      const focusResponders = activeWingmen.filter((w) => w.state !== 'retreating')
      let focusReplyCount = 0
      for (const w of focusResponders) {
        const slippyFocusUpgrade = w.profile.id === 2 && moraleDamageBonus > 0
        const peppyFocusUpgrade = w.profile.id === 1 && peppyAuxShieldStacks > 0 && w.abilityCooldown <= 0
        const eventId = slippyFocusUpgrade || peppyFocusUpgrade ? 'ability_focus_upgrade' : 'focus_ready'
        const text = wingmanRadio.getLine(w.profile.id, eventId)
        if (!text) continue
        pendingRadioMessages.push(buildRadioPayload(w.profile, text, eventId, { focusResponse: true }))
        focusReplyCount += 1
      }
      aiValidator.expect(
        'Focus gera confirmação lateral para todo Wingman ativo',
        () => focusReplyCount === focusResponders.length,
        { responders: focusResponders.map((w) => w.profile.id), focusReplyCount, targetCount: squadronFocusTargets.length },
      )
      aiValidator.logMechanic('wingman-radio', 'focus-broadcast-lateral', {
        foxInWorld: true,
        responders: focusResponders.map((w) => w.profile.id),
        focusReplyCount,
        hasLocked: validLocked.length > 0,
      })

      return {`
if (!wing.includes("Focus gera confirmação lateral para todo Wingman ativo")) {
  if (!focusRe.test(wing)) throw new Error('wingmen: bloco Focus não encontrado')
  wing = wing.replace(focusRe, focusNew)
}

wing = wing.replace(`announceWorld(w, focusEventId)`, `announceLateral(w, focusEventId)`)
wing = wing.replace(
`    // O HUD novo aceita mensagens simultâneas por piloto. Consome todas as triviais acumuladas\n`,
`    // O rádio lateral consome as mensagens acumuladas e mantém os canais trivial/ability do HUD.\n`,
)
wing = wing.replace(
`    const radioMessages = pendingRadioMessages.splice(0)\n`,
`    const radioMessages = pendingRadioMessages.splice(0)\n    const readyCombatTargets = new Set(getAliveEnemies())\n`,
)

const weaveOld = `        reactiveSide += Math.sin(elapsed * (Math.PI * 2 / FALCO_WEAVE_PERIOD_S)) * FALCO_WEAVE_AMPLITUDE\n`
const weaveNew = `        reactiveSide += Math.sin(elapsed * (Math.PI * 2 / FALCO_WEAVE_PERIOD_S)) * FALCO_WEAVE_AMPLITUDE * formationMotionGain\n`
wing = wing.replace(weaveOld, weaveNew)
const idleRe = /      const idleX = Math\.sin\(elapsed \* 0\.7 \+ w\.profile\.id \* 1\.6\) \* 0\.55\n        \+ Math\.sin\(elapsed \* 0\.11 \+ w\.profile\.id \* 3\.3\) \* 5\.5\n      const idleY = Math\.cos\(elapsed \* 0\.5 \+ w\.profile\.id \* 2\.1\) \* 0\.35\n        \+ Math\.cos\(elapsed \* 0\.09 \+ w\.profile\.id \* 2\.7\) \* 2\.2/
const idleNew = `      // Movimento cosmético desaparece quando o jogador está parado/quase parado. Mesmo em
      // movimento, a excursão é pequena: personalidade sem caça à própria vaga.
      const idleX = (Math.sin(elapsed * 0.7 + w.profile.id * 1.6) * 0.35
        + Math.sin(elapsed * 0.11 + w.profile.id * 3.3) * 1.2) * formationMotionGain
      const idleY = (Math.cos(elapsed * 0.5 + w.profile.id * 2.1) * 0.22
        + Math.cos(elapsed * 0.09 + w.profile.id * 2.7) * 0.55) * formationMotionGain`
if (!wing.includes('Movimento cosmético desaparece quando o jogador está parado/quase parado')) {
  if (!idleRe.test(wing)) throw new Error('wingmen: bloco idle não encontrado')
  wing = wing.replace(idleRe, idleNew)
}

const dogfightOld = `        const enemyLost = !w.targetEnemy || w.targetEnemy.dying || !w.targetEnemy.mesh ||\n          w.mesh.position.distanceTo(w.targetEnemy.mesh.position) > 110 ||\n          w.stateTimer > effectiveDogfightDuration(w.profile, opts)\n`
const dogfightNew = `        const enemyLost = !isWingmanCombatTargetReady(w.targetEnemy, readyCombatTargets) ||\n          w.mesh.position.distanceTo(w.targetEnemy.mesh.position) > 110 ||\n          w.stateTimer > effectiveDogfightDuration(w.profile, opts)\n`
wing = wing.replace(dogfightOld, dogfightNew)
wing = wing.replace(
`        const targetLost = !target || target.dying || !target.mesh\n`,
`        const targetLost = !isWingmanCombatTargetReady(target, readyCombatTargets)\n`,
)
wing = wing.replace(
`            squadronFocusTargets = squadronFocusTargets.filter((t) => t && !t.dying && t.mesh)\n`,
`            squadronFocusTargets = squadronFocusTargets.filter((t) => isWingmanCombatTargetReady(t, readyCombatTargets))\n`,
)

const rescueEnd = `          telemetry.recordEvent(w.profile.name, 'ability', 'Rescue alcançou o jogador: tumble cancelado e +1 escudo', { elapsed })\n        }\n      } else if (w.state === 'escort') {`
const rescueNew = `          telemetry.recordEvent(w.profile.name, 'ability', 'Rescue alcançou o jogador: tumble cancelado e +1 escudo', { elapsed })
        } else if (w.abilityTimer >= WINGMAN_RESCUE_TIMEOUT_S) {
          stateController.finishAction(w, {
            source: 'peppy-rescue', event: 'rescue-timeout', outcome: 'timeout', engagementCooldown: 2.5,
          })
          aiValidator.logMechanic('wingman-navigation-stall', 'rescue-timeout', {
            pilotId: w.profile.id, timeoutS: WINGMAN_RESCUE_TIMEOUT_S,
          })
        }
      } else if (w.state === 'escort') {`
wing = wing.replace(rescueEnd, rescueNew)

const speedBlock = `      if (boostActive) {\n        cruiseSpeed *= 1.45\n        // Miyu "acompanha o boost" com um empurrão extra (reatividade, Ideia 5) — os outros 3\n        // já acompanham igual antes (o multiplicador acima é global, "sem mudança" pra eles).\n        if (w.profile.id === 3) cruiseSpeed *= 1.15\n      } else if (w.state === 'ram') cruiseSpeed *= 1.9\n      else if (w.state === 'dogfight') cruiseSpeed *= 1.15\n      else if (w.state === 'escort') cruiseSpeed *= 1.25\n\n      _wmDesiredVelocity.copy(_wmAimDir).multiplyScalar(cruiseSpeed)\n`
const speedNew = `      if (boostActive) {
        cruiseSpeed *= 1.45
        if (w.profile.id === 3) cruiseSpeed *= 1.15
      } else if (w.state === 'ram') cruiseSpeed *= 1.9
      else if (w.state === 'dogfight') cruiseSpeed *= 1.15
      else if (w.state === 'escort') cruiseSpeed *= 1.25

      // No All-Range, patrulha não cruza a vaga a velocidade máxima. A curva de chegada reduz a
      // velocidade a zero perto do slot, eliminando o ciclo ultrapassa→vira→ultrapassa.
      if (inArena && (w.state === 'patrol' || w.state === 'damaged-passive')) {
        cruiseSpeed *= computeWingmanArrivalScale(targetDist)
      }

      _wmDesiredVelocity.copy(_wmAimDir).multiplyScalar(cruiseSpeed)
`
if (!wing.includes('ciclo ultrapassa→vira→ultrapassa')) {
  if (!wing.includes(speedBlock)) throw new Error('wingmen: bloco cruiseSpeed não encontrado')
  wing = wing.replace(speedBlock, speedNew)
}

const moveOld = `      w.velocity.lerp(_wmDesiredVelocity, 1 - Math.exp(-accelRate * dt))\n      w.mesh.position.addScaledVector(w.velocity, dt)\n\n      // ============ ORIENTAÇÃO`
const moveNew = `      w.velocity.lerp(_wmDesiredVelocity, 1 - Math.exp(-accelRate * dt))
      w.mesh.position.addScaledVector(w.velocity, dt)

      // Failsafe não espacial: se existe destino distante e velocidade desejada, mas a nave não
      // progride por tempo prolongado, recupera apenas a VELOCIDADE. Nunca teleporta nem troca
      // Behavior/Action. Estados presos por alvo inválido são resolvidos acima, semanticamente.
      const stall = updateWingmanStallWatch(w.motionWatch, {
        dt,
        position: w.mesh.position,
        targetDistance: targetDist,
        desiredSpeed: _wmDesiredVelocity.length(),
      })
      if (stall.recover) {
        w.velocity.copy(_wmDesiredVelocity)
        aiValidator.expect(
          'Failsafe de Wingman recupera movimento sem teleporte nem troca de estado',
          () => isFiniteWingmanPosition(w.velocity) && isFiniteWingmanPosition(w.mesh.position),
          { pilotId: w.profile.id, state: w.state, targetDist, desiredSpeed: _wmDesiredVelocity.length(), moved: stall.moved },
        )
        aiValidator.logMechanic('wingman-navigation-stall', 'velocity-recovered', {
          pilotId: w.profile.id, state: w.state, targetDist, desiredSpeed: _wmDesiredVelocity.length(), moved: stall.moved,
        })
      }

      // ============ ORIENTAÇÃO`
if (!wing.includes('Failsafe não espacial')) {
  if (!wing.includes(moveOld)) throw new Error('wingmen: integração do watchdog não encontrada')
  wing = wing.replace(moveOld, moveNew)
}

write('src/combat/wingmen.js', wing)

// 4/8/9 — números: Manga metade do tamanho; mesma emergência central; Buraco Negro com círculo real.
let damage = read('src/hud-damage.js')
damage = damage.replace(
`export const DAMAGE_NUMBER_SCALE = 0.8\nexport const ORBIT_IDLE_DURATION_MS = 500\nexport const ORBIT_ACTIVE_DURATION_MS = 850\nexport const ORBIT_ARC_SEGMENT = 16\nexport const ORBIT_ARC_STEP = 20\n`,
`export const DAMAGE_NUMBER_SCALE = 0.8\nexport const MANGA_VISUAL_SCALE = 0.5\nexport const ORBIT_IDLE_DURATION_MS = 500\nexport const ORBIT_ACTIVE_DURATION_MS = 850\nexport const ORBIT_RADIUS = 64\n`,
)
damage = damage.replace(/\nexport function getOrbitArcDashOffset\(slot\) \{[\s\S]*?\n\}\n/, '\n')
damage = damage.replace(/function orbitFrame\(slot, t, \{ calm = false, killed = false \} = \{\}\) \{[\s\S]*?\n\}/, `function orbitFrame(slot, t, { calm = false, killed = false } = {}) {
  const angle = getOrbitAngle(slot, t, calm)
  const launch = calm ? 1 : Math.min(1, t / .16)
  const exit = Math.max(0, (t - .72) / .28)
  const collapse = killed && !calm ? Math.max(0, 1 - Math.max(0, (t - .82) / .18)) : 1
  return {
    x: Math.cos(angle) * ORBIT_RADIUS * launch * collapse,
    y: Math.sin(angle) * ORBIT_RADIUS * launch * collapse,
    opacity: 1 - exit,
  }
}`)

damage = damage.replace(
`    .damage-feedback.manga{color:#111522;gap:0;padding:9px 0}\n`,
`    .damage-feedback.manga{color:#111522;gap:0;padding:4.5px 0;width:48px;height:31px}\n    .damage-feedback.manga strong{font-size:${30 * 0.8 * 0.5}px}\n    .damage-feedback.manga small{font-size:${10 * 0.8 * 0.5}px}\n    .damage-feedback.manga.charged strong{font-size:${36 * 0.8 * 0.5}px}\n    .damage-feedback.manga.word strong{font-size:${19 * 0.8 * 0.5}px}\n`,
)
damage = damage.replace(
`    .damage-feedback-orbit-ring{position:absolute;left:50%;top:50%;width:194px;height:132px;transform:translate(-50%,-50%) rotate(-90deg);transform-origin:50% 50%;overflow:visible;z-index:1;filter:drop-shadow(0 0 5px var(--damage-color));will-change:opacity}\n`,
`    .damage-feedback-orbit-ring{position:absolute;left:50%;top:50%;width:144px;height:144px;transform:translate(-50%,-50%);transform-origin:50% 50%;overflow:visible;z-index:1;filter:drop-shadow(0 0 5px var(--damage-color));will-change:opacity}\n`,
)
damage = damage.replace(/function createOrbitRing\(slot, color\) \{[\s\S]*?\n\}/, `function createOrbitRing(color) {
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  svg.classList.add('damage-feedback-orbit-ring')
  svg.setAttribute('viewBox', '0 0 144 144')
  svg.setAttribute('aria-hidden', 'true')
  const circle = document.createElementNS(ns, 'circle')
  circle.setAttribute('cx', '72')
  circle.setAttribute('cy', '72')
  circle.setAttribute('r', String(ORBIT_RADIUS))
  circle.setAttribute('fill', 'none')
  circle.setAttribute('stroke', color)
  circle.setAttribute('stroke-width', '2.4')
  circle.setAttribute('stroke-linecap', 'round')
  svg.appendChild(circle)
  return svg
}`)
damage = damage.replace(
`        ;[x, y] = OFFSETS[slot]\n        if (!calm) {\n`,
`        const launch = calm ? 1 : Math.min(1, t / .16)\n        x = OFFSETS[slot][0] * launch\n        y = OFFSETS[slot][1] * launch\n        if (!calm) {\n`,
)
damage = damage.replace(
`    entry.ringEl = createOrbitRing(entry.slot, entry.color)\n`,
`    entry.ringEl = createOrbitRing(entry.color)\n`,
)
const activateOld = `  function activateOrbitForTarget(targetId) {\n    if (!targetId) return\n    for (const entry of active) {\n      if (entry.targetId !== targetId || entry.style !== 'orbit' || entry.killed) continue\n      entry.orbitActive = true\n      ensureOrbitRing(entry)\n      animate(entry)\n    }\n  }\n`
const activateNew = `  function activateOrbitForTarget(targetId) {
    if (!targetId) return
    const orbiters = [...active].filter((entry) => entry.targetId === targetId && entry.style === 'orbit' && !entry.killed)
    if (orbiters.length === 0) return
    // Um alvo, um círculo. Os números compartilham a mesma geometria; não empilhamos arcos
    // independentes com centros ligeiramente diferentes.
    for (const entry of orbiters) {
      entry.orbitActive = true
      if (entry.ringEl) {
        entry.ringEl.remove()
        entry.ringEl = null
      }
    }
    ensureOrbitRing(orbiters[0])
    for (const entry of orbiters) animate(entry)
  }
`
damage = damage.replace(activateOld, activateNew)
damage = damage.replace(
`          ringEl = createOrbitRing(slot, author.color)\n          el.append(ringEl, content)\n`,
`          el.append(content)\n`,
)
damage = damage.replace(
`      active.add(entry)\n      animate(entry)\n`,
`      active.add(entry)\n      if (orbitActive && opts.targetId) activateOrbitForTarget(opts.targetId)\n      else animate(entry)\n`,
)
write('src/hud-damage.js', damage)

// Centro visual estável por alvo (em vez do ponto específico de cada impacto).
let feedback = read('src/combat/damage-feedback.js')
feedback = feedback.replace(
`  return {\n    worldPos: hit.worldPos.clone(), targetId: hit.meshRef?.uuid ?? null, kind: hit.kind ?? null,\n`,
`  const targetPosition = hit.meshRef?.position\n  const targetPositionValid = targetPosition && [targetPosition.x, targetPosition.y, targetPosition.z].every(Number.isFinite)\n  return {\n    worldPos: hit.worldPos.clone(),\n    targetWorldPos: targetPositionValid && typeof targetPosition.clone === 'function' ? targetPosition.clone() : hit.worldPos.clone(),\n    targetId: hit.meshRef?.uuid ?? null, kind: hit.kind ?? null,\n`,
)
write('src/combat/damage-feedback.js', feedback)

let loop = read('src/game-loop.js')
loop = loop.replace(
`      // Copiar: worldPos continua em coordenadas de mundo para outros consumidores.\n      const ndcH = _threatProj.copy(h.worldPos).project(camera)\n`,
`      // O feedback visual usa o centro estável do alvo. worldPos continua preservado como ponto\n      // real de impacto para partículas/telemetria.\n      const visualAnchor = h.targetWorldPos || h.worldPos\n      const ndcH = _threatProj.copy(visualAnchor).project(camera)\n`,
)
write('src/game-loop.js', loop)

// 6 — versão do site + README + progresso.
write('src/version.js', `export const GAME_VERSION = 'v0.99.30'\n`)
let readme = read('README.md')
readme = readme.replace('versão-v0.78.0-blue.svg', 'versão-v0.99.30-blue.svg')
readme = readme.replace('*Falco, Peppy, Slippy, Phantom*', '*Falco, Peppy, Slippy, Miyu*')
if (!readme.includes('### v0.99.30 — Estabilidade dos Wingmen, rádio lateral e feedback de dano')) {
  const marker = '## 📜 Histórico e Evolução\n'
  const note = `## 📜 Histórico e Evolução\n\n### v0.99.30 — Estabilidade dos Wingmen, rádio lateral e feedback de dano\n- Rádio dos quatro Wingmen volta aos painéis laterais com vozes, conexão/desconexão e estática; somente o chamado de Fox no Focus permanece acima da nave do jogador.\n- Focus recebe confirmação de todo aliado ativo sem cancelar Actions comprometidas.\n- IA de voo valida alvos realmente ativos, limita Rescue, desacelera ao chegar à formação no All-Range e possui failsafe de progresso sem teleportes.\n- Manga fica 50% menor e nasce do centro do alvo; Buraco Negro usa um círculo único e correto por alvo.\n\n`
  if (!readme.includes(marker)) throw new Error('README: seção histórico não encontrada')
  readme = readme.replace(marker, note)
}
write('README.md', readme)

let progress = read('progresso/PROGRESSO_POS_.90.md')
if (!progress.includes('### v0.99.30 — Correções pós-merge')) {
  const marker = '## Histórico de Entregas pós-v0.90.0\n\n'
  const section = `### v0.99.30 — Correções pós-merge: Wingmen, rádio e dano visual\n\n- **Rádio revertido para lateral:** os quatro Wingmen voltam aos painéis originais com estática, connect/disconnect e voz individual; apenas Fox continua in-world ao iniciar Focus. Os 120 quotes novos permanecem.\n- **Focus corrigido:** todos os Wingmen ativos confirmam lateralmente o comando, mesmo quando uma Action impede a troca imediata para dogfight; a confirmação não cancela a Action.\n- **Alvos válidos:** Focus, dogfight e Ram exigem inimigo realmente gameplay-ready. Mesh de spawn/fade/entidade removida não mantém mais piloto preso perseguindo um alvo fantasma.\n- **Rescue com limite:** Rescue do Peppy recebe timeout técnico de 5s para não manter a Action indefinidamente quando a aproximação não conclui.\n- **Estabilidade de formação:** All-Range passa a desacelerar suavemente ao chegar à vaga; weave/idle diminuem e somem com o jogador parado. Failsafe detecta ausência real de progresso e recupera somente a velocidade, sem teleporte ou regroup por distância.\n- **Mangá:** elementos de dano ficam 50% menores e emergem do centro estável do alvo antes de ocupar seu offset.\n- **Buraco Negro:** segmentos desconexos são removidos; cada alvo cooperativo usa um único círculo real, centrado no alvo, compartilhado pelos números orbitais.\n- **Documentação/versão:** README e versão exibida no site atualizados para v0.99.30.\n\n`
  if (!progress.includes(marker)) throw new Error('PROGRESSO: marcador histórico não encontrado')
  progress = progress.replace(marker, marker + section)
}
write('progresso/PROGRESSO_POS_.90.md', progress)

// Testes de regressão desta entrega.
write('src/wingman-flight-stability.test.mjs', `import assert from 'node:assert/strict'
import {
  WINGMAN_RESCUE_TIMEOUT_S,
  computeFormationMotionGain,
  computeWingmanArrivalScale,
  createWingmanStallWatch,
  isWingmanCombatTargetReady,
  updateWingmanStallWatch,
} from './combat/wingman-flight-stability.js'

assert.equal(computeWingmanArrivalScale(0), 0)
assert.equal(computeWingmanArrivalScale(.9), 0)
assert.equal(computeWingmanArrivalScale(10), 1)
assert.ok(computeWingmanArrivalScale(4) > 0 && computeWingmanArrivalScale(4) < 1)
assert.equal(computeFormationMotionGain(0), 0)
assert.equal(computeFormationMotionGain(.7), 0)
assert.equal(computeFormationMotionGain(8), 1)
assert.equal(WINGMAN_RESCUE_TIMEOUT_S, 5)

const ready = { mesh: { parent: {} }, dying: false, fadingOut: false }
const pending = { mesh: { parent: {} }, dying: false, fadingOut: false }
const readySet = new Set([ready])
assert.equal(isWingmanCombatTargetReady(ready, readySet), true)
assert.equal(isWingmanCombatTargetReady(pending, readySet), false, 'alvo fora da lista gameplay-ready não pode sustentar dogfight')
assert.equal(isWingmanCombatTargetReady({ ...ready, fadingOut: true }, null), false)
assert.equal(isWingmanCombatTargetReady({ ...ready, mesh: { parent: null } }, null), false)

const watch = createWingmanStallWatch({ x: 0, y: 0, z: 0 })
let recovered = false
for (let i = 0; i < 6; i++) {
  const result = updateWingmanStallWatch(watch, { dt: .35, position: { x: 0, y: 0, z: 0 }, targetDistance: 20, desiredSpeed: 30 })
  recovered ||= result.recover
}
assert.equal(recovered, true, 'ausência persistente de progresso deve acionar recuperação de velocidade')
const settled = createWingmanStallWatch({ x: 0, y: 0, z: 0 })
for (let i = 0; i < 8; i++) {
  assert.equal(updateWingmanStallWatch(settled, { dt: .35, position: { x: 0, y: 0, z: 0 }, targetDistance: .5, desiredSpeed: 0 }).recover, false)
}
console.log('wingman-flight-stability.test.mjs: OK')
`)

write('src/wingman-radio-overhaul.test.mjs', `import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  ABILITY_EVENT_IDS,
  NEW_TRIVIAL_QUOTES_PER_PILOT,
  createWingmanRadio,
  getNewTrivialQuoteCount,
  getWingmanRadioValidationSnapshot,
} from './combat/wingman-radio.js'

assert.equal(NEW_TRIVIAL_QUOTES_PER_PILOT, 30)
for (const pilotId of [0, 1, 2, 3]) {
  assert.equal(getNewTrivialQuoteCount(pilotId), 30)
  const snapshot = getWingmanRadioValidationSnapshot(pilotId)
  assert.equal(new Set(snapshot.newTrivialLines).size, 30)
  for (const line of snapshot.newTrivialLines) {
    assert.ok(snapshot.trivialLines.includes(line))
    assert.ok(!snapshot.abilityLines.includes(line))
  }
}
const independent = createWingmanRadio({ random: () => 0 })
assert.ok(independent.trySpeak(0, 'engage_dogfight', 0, { activePilotIds: [0, 1] }))
assert.ok(independent.trySpeak(1, 'engage_dogfight', 0, { activePilotIds: [0, 1] }))
assert.ok(independent.speakAbility(0, 'ability_ram', 1, { activePilotIds: [0, 1] }))
assert.ok(ABILITY_EVENT_IDS.has('ability_focus_upgrade'))

const hudFacade = readFileSync(new URL('./hud.js', import.meta.url), 'utf8')
assert.ok(!hudFacade.includes('createWingmanRadioSlots'), 'grid de quatro blocos não pode voltar ao runtime')
const hudGame = readFileSync(new URL('./hud-game.js', import.meta.url), 'utf8')
for (const required of ['radio_connect', 'radio_disconnect', 'pilot_voice_falco', 'pilot_voice_peppy', 'pilot_voice_slippy', 'pilot_voice_miyu']) {
  assert.ok(hudGame.includes(required), `rádio lateral precisa preservar áudio ${required}`)
}
const worldRadio = readFileSync(new URL('./combat/wingman-world-radio.js', import.meta.url), 'utf8')
assert.match(worldRadio, /WINGMAN_ABILITY_GLOW_DURATION_S\\s*=\\s*1\\.5/)
assert.ok(worldRadio.includes("assets/wingman-radio/fox.png"))
const wingmen = readFileSync(new URL('./combat/wingmen.js', import.meta.url), 'utf8')
assert.ok(wingmen.includes('worldRadio.showFoxFocus'), 'Fox continua acima da nave do jogador')
assert.ok(!wingmen.includes('worldRadio.showWingman('), 'Wingmen não podem mais emitir quote acima da nave')
assert.ok(wingmen.includes("pendingRadioMessages.push(buildRadioPayload(wingman.profile, text, eventId))"), 'abilities voltam ao painel lateral')
assert.ok(wingmen.includes('Focus gera confirmação lateral para todo Wingman ativo'))
assert.ok(wingmen.includes('focusResponders = activeWingmen.filter'))
assert.ok(wingmen.includes('worldRadio.triggerAbilityGlow'), 'glow de ability permanece')
console.log('wingman-radio-overhaul.test.mjs: OK')
`)

write('src/damage-feedback.test.mjs', `import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createDamageFeedback } from './combat/damage-feedback.js'
import { MANGA_VISUAL_SCALE, ORBIT_RADIUS, getOrbitAngle } from './hud-damage.js'
import { aiValidator } from './ai-validator.js'
import { getSettings, setSetting } from './settings.js'

const data = new Map()
globalThis.localStorage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }
const position = { x: 1, y: 2, z: 3, clone() { return { x: this.x, y: this.y, z: this.z } } }
const targetPosition = { x: 9, y: 8, z: 7, clone() { return { x: this.x, y: this.y, z: this.z } } }
const hit = { worldPos: position, meshRef: { uuid: 'target-7', position: targetPosition }, kind: 'tank', targetMaxHp: 18, killed: true, enemyKillPoints: 100 }
assert.equal(createDamageFeedback({ ...hit, blocked: true }, 8), null)
const result = createDamageFeedback(hit, 8, { pilotId: 2, charged: true })
assert.equal(result.targetWorldPos.x, 9)
result.targetWorldPos.x = 999
assert.equal(targetPosition.x, 9, 'centro visual deve ser clone independente')
result.worldPos.x = 999
assert.equal(position.x, 1)
assert.equal(MANGA_VISUAL_SCALE, .5, 'Mangá precisa ter metade do tamanho visual')
assert.equal(ORBIT_RADIUS, 64)
assert.ok(Math.abs((getOrbitAngle(2, 1) - getOrbitAngle(2, 0)) - Math.PI * 2) < 1e-9)
const damageSource = readFileSync(new URL('./hud-damage.js', import.meta.url), 'utf8')
assert.ok(damageSource.includes("document.createElementNS(ns, 'circle')"), 'Buraco Negro precisa usar círculo SVG real')
assert.ok(!damageSource.includes('stroke-dasharray'), 'círculo não pode voltar a ser fragmentos por autor')
assert.ok(damageSource.includes('OFFSETS[slot][0] * launch'), 'Mangá precisa nascer do centro antes de ocupar o offset')
assert.equal(aiValidator.buildReport().expectativas_falhas.length, 0)
assert.equal(getSettings().damageNumberStyle, 'classic')
for (const style of ['manga', 'orbit', 'classic']) { setSetting('damageNumberStyle', style); assert.equal(getSettings().damageNumberStyle, style) }
console.log('damage-feedback.test.mjs: OK')
`)

let polish = read('src/playtest-polish.test.mjs')
polish = polish.replace(
`import { DAMAGE_NUMBER_SCALE, getOrbitAngle, getOrbitArcDashOffset, ORBIT_ARC_SEGMENT } from './hud-damage.js'`,
`import { DAMAGE_NUMBER_SCALE, MANGA_VISUAL_SCALE, ORBIT_RADIUS, getOrbitAngle } from './hud-damage.js'`,
)
polish = polish.replace(
`assert.strictEqual(new Set([0, 1, 2, 3, 4].map(getOrbitArcDashOffset)).size, 5, 'jogador + 4 aliados precisam ocupar cinco segmentos orbitais distintos')\nassert.ok(ORBIT_ARC_SEGMENT < 20, 'segmentos precisam deixar pequenas folgas entre autores')`,
`assert.strictEqual(MANGA_VISUAL_SCALE, 0.5, 'Mangá precisa ficar 50% menor')\nassert.strictEqual(ORBIT_RADIUS, 64, 'Buraco Negro usa uma geometria circular compartilhada')`,
)
write('src/playtest-polish.test.mjs', polish)

console.log('apply-post-merge-v09930.mjs: OK')
