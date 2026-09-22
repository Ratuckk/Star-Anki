import { readFileSync, writeFileSync } from 'node:fs'

function replaceOnce(path, from, to) {
  const source = readFileSync(path, 'utf8')
  if (!source.includes(from)) throw new Error(`Trecho nao encontrado em ${path}: ${from.slice(0, 80)}`)
  writeFileSync(path, source.replace(from, to))
}

const hudDamage = `import { getSettings } from './settings.js'

const AUTHORS = [
  { color: '#f3f6ff', shape: 'burst' },
  { color: '#76ceff', shape: 'slash' },
  { color: '#ffc96e', shape: 'seal' },
  { color: '#a4f57a', shape: 'bubble' },
  { color: '#d795ff', shape: 'burst' },
]
const OFFSETS = [[-55, -60], [-94, 0], [-55, 57], [55, 57], [94, 0]]
const ORBIT_START_ANGLE = -Math.PI / 2
const ANGLES = Array.from({ length: AUTHORS.length }, (_, slot) => ORBIT_START_ANGLE + slot * (Math.PI * 2 / AUTHORS.length))
const MAX_LABELS = 36
export const DAMAGE_NUMBER_SCALE = 0.8
export const ORBIT_DURATION_MS = 1700
export const ORBIT_ARC_SEGMENT = 16
export const ORBIT_ARC_STEP = 20

export function getOrbitAngle(slot, t, reducedMotion = false) {
  const start = ANGLES[Math.max(0, Math.min(ANGLES.length - 1, slot))]
  return start + (reducedMotion ? 0 : Math.PI * 2 * Math.max(0, Math.min(1, t)))
}

export function getOrbitArcDashOffset(slot) {
  return -(Math.max(0, Math.min(AUTHORS.length - 1, slot)) * ORBIT_ARC_STEP + 2)
}

function orbitFrame(slot, t, { calm = false, killed = false } = {}) {
  const angle = getOrbitAngle(slot, t, calm)
  const launch = calm ? 1 : Math.min(1, t / .16)
  const exit = Math.max(0, (t - .72) / .28)
  const collapse = killed && !calm ? Math.max(0, 1 - Math.max(0, (t - .82) / .18)) : 1
  return {
    x: Math.cos(angle) * 97 * launch * collapse,
    y: Math.sin(angle) * 66 * launch * collapse,
    opacity: 1 - exit,
  }
}

function injectStyles() {
  if (document.getElementById('damage-feedback-styles')) return
  const style = document.createElement('style')
  style.id = 'damage-feedback-styles'
  style.textContent = \`
    .damage-feedback{position:absolute;z-index:30;pointer-events:none;display:grid;place-items:center;width:96px;height:62px;will-change:transform,opacity;font-family:system-ui,sans-serif;color:var(--damage-color);isolation:isolate;overflow:visible}
    .damage-feedback strong{font-size:\${30 * DAMAGE_NUMBER_SCALE}px;font-weight:900;line-height:1;position:relative;text-shadow:0 1px 4px #000}
    .damage-feedback small{font-size:\${10 * DAMAGE_NUMBER_SCALE}px;font-weight:800;line-height:1.2;position:relative;white-space:nowrap;color:#f4f7ff;text-shadow:0 1px 3px #000}
    .damage-feedback.charged strong{font-size:\${36 * DAMAGE_NUMBER_SCALE}px}
    .damage-feedback.word strong{font-size:\${19 * DAMAGE_NUMBER_SCALE}px}
    .damage-feedback.manga{color:#111522;gap:0;padding:9px 0}
    .damage-feedback.manga:before{content:'';position:absolute;inset:0;background:var(--damage-color);z-index:-1;clip-path:polygon(50% 0,60% 17%,80% 3%,79% 27%,100% 27%,88% 47%,100% 62%,79% 66%,85% 90%,60% 83%,50% 100%,38% 82%,15% 95%,20% 70%,0 72%,12% 52%,0 34%,22% 29%,19% 5%,40% 17%)}
    .damage-feedback.manga.slash:before{clip-path:polygon(0 12%,94% 0,100% 87%,6% 100%)}
    .damage-feedback.manga.seal:before{clip-path:ellipse(49% 48%)}
    .damage-feedback.manga.bubble:before{clip-path:ellipse(49% 43%)}
    .damage-feedback.manga strong,.damage-feedback.manga small{color:#111522;text-shadow:none}
    .damage-feedback.orbit{width:96px;height:62px}
    .damage-feedback.orbit strong{text-shadow:0 0 10px var(--damage-color),0 2px 3px #000}
    .damage-feedback-orbit-content{position:absolute;inset:0;display:grid;place-items:center;z-index:2;will-change:transform,opacity}
    .damage-feedback-orbit-ring{position:absolute;left:50%;top:50%;width:194px;height:132px;transform:translate(-50%,-50%) rotate(-90deg);transform-origin:50% 50%;overflow:visible;z-index:1;filter:drop-shadow(0 0 5px var(--damage-color));will-change:opacity}
    .damage-feedback.classic{width:76px;height:40px}
    .damage-feedback.classic strong{font:900 \${18 * DAMAGE_NUMBER_SCALE}px ui-monospace,monospace}
    .damage-feedback.classic small{font-size:\${9 * DAMAGE_NUMBER_SCALE}px}
  \`
  document.head.appendChild(style)
}

function createOrbitRing(slot, color) {
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  svg.classList.add('damage-feedback-orbit-ring')
  svg.setAttribute('viewBox', '0 0 200 136')
  svg.setAttribute('aria-hidden', 'true')
  const ellipse = document.createElementNS(ns, 'ellipse')
  ellipse.setAttribute('cx', '100')
  ellipse.setAttribute('cy', '68')
  ellipse.setAttribute('rx', '97')
  ellipse.setAttribute('ry', '66')
  ellipse.setAttribute('pathLength', '100')
  ellipse.setAttribute('fill', 'none')
  ellipse.setAttribute('stroke', color)
  ellipse.setAttribute('stroke-width', '2.4')
  ellipse.setAttribute('stroke-linecap', 'round')
  ellipse.setAttribute('stroke-dasharray', \`\${ORBIT_ARC_SEGMENT} \${100 - ORBIT_ARC_SEGMENT}\`)
  ellipse.setAttribute('stroke-dashoffset', String(getOrbitArcDashOffset(slot)))
  svg.appendChild(ellipse)
  return svg
}

// Animações limitadas; recursos cancelados ao desmontar o HUD.
export function createDamageNumbers(root) {
  injectStyles()
  const active = new Set()
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')
  function remove(entry) {
    clearTimeout(entry.timeout)
    entry.animation?.cancel()
    entry.ringAnimation?.cancel()
    entry.el.remove()
    active.delete(entry)
  }
  function animate(entry) {
    entry.animation?.cancel()
    entry.ringAnimation?.cancel()
    const { el, style, slot, killed } = entry
    const calm = reduced?.matches
    const duration = style === 'orbit' ? ORBIT_DURATION_MS : 1100
    const frames = []
    for (let i = 0; i <= 32; i++) {
      const t = i / 32
      let x = 0, y = -22, scale = 1, rotation = 0
      const exit = Math.max(0, (t - .7) / .3)
      let opacity = 1 - exit
      if (style === 'manga') {
        ;[x, y] = OFFSETS[slot]
        if (!calm) {
          scale = t < .15 ? .35 + (t / .15) * .85 : 1 + .2 * Math.exp(-(t - .15) * 16) * Math.cos((t - .15) * 35)
          rotation = (slot % 2 ? 5 : -5) * (1 - exit)
          x += (slot % 2 ? -1 : 1) * exit * 28
          y -= exit * 22
        }
      } else if (style === 'orbit') {
        const orbit = orbitFrame(slot, t, { calm, killed })
        x = orbit.x
        y = orbit.y
        opacity = orbit.opacity
      } else if (!calm) y = -16 - t * 48
      frames.push({ offset: t, opacity, transform: \`translate(calc(-50% + \${x}px),calc(-50% + \${y}px)) rotate(\${rotation}deg) scale(\${scale})\` })
    }
    const motionEl = entry.motionEl || el
    entry.animation = motionEl.animate(frames, { duration, fill: 'forwards' })
    if (entry.ringEl) {
      entry.ringAnimation = entry.ringEl.animate([
        { offset: 0, opacity: 0 },
        { offset: .10, opacity: .72 },
        { offset: .72, opacity: .72 },
        { offset: 1, opacity: 0 },
      ], { duration, fill: 'forwards' })
    }
    clearTimeout(entry.timeout)
    entry.timeout = setTimeout(() => remove(entry), duration)
  }
  return {
    spawn(xFrac, yFrac, value, opts = {}) {
      const style = getSettings().damageNumberStyle
      const slot = Number.isInteger(opts.pilotId) && opts.pilotId >= 0 && opts.pilotId <= 3 ? opts.pilotId + 1 : 0
      const author = AUTHORS[slot]
      const now = performance.now()
      // Mesmo alvo/autor em uma rajada curta vira uma soma, sem misturar pilotos.
      const existing = opts.targetId && typeof value === 'number' && [...active].find(e =>
        e.targetId === opts.targetId && e.slot === slot && e.style === style && typeof e.value === 'number' && now - e.started < 120)
      if (existing) {
        existing.value += value
        existing.hits++
        existing.killed ||= !!opts.killed
        existing.el.classList.toggle('charged', existing.el.classList.contains('charged') || !!opts.homing)
        existing.el.querySelector('strong').textContent = String(Math.round(existing.value * 100) / 100)
        existing.el.querySelector('small').textContent = \`\${existing.hits} hits\`
        animate(existing)
        return
      }
      if (active.size >= MAX_LABELS) remove(active.values().next().value)
      const el = document.createElement('div')
      el.className = \`damage-feedback \${style} \${author.shape}\${opts.homing ? ' charged' : ''}\${typeof value === 'string' ? ' word' : ''}\`
      el.style.setProperty('--damage-color', author.color)
      const number = document.createElement('strong')
      number.textContent = typeof value === 'number' ? String(Math.round(value * 100) / 100) : value
      const label = document.createElement('small')
      label.textContent = ''
      let motionEl = el
      let ringEl = null
      if (style === 'orbit') {
        ringEl = createOrbitRing(slot, author.color)
        const content = document.createElement('span')
        content.className = 'damage-feedback-orbit-content'
        content.append(number, label)
        el.append(ringEl, content)
        motionEl = content
      } else {
        el.append(number, label)
      }
      // Reservar a excursão completa da animação para não cortar números nas bordas.
      const width = root.clientWidth, height = root.clientHeight
      const mx = Math.min(154, width / 2), my = Math.min(106, height / 2)
      el.style.left = \`\${Math.min(width - mx, Math.max(mx, xFrac * width))}px\`
      el.style.top = \`\${Math.min(height - my, Math.max(my, yFrac * height))}px\`
      root.appendChild(el)
      const entry = { el, motionEl, ringEl, value, hits: 1, style, slot, targetId: opts.targetId, started: now, killed: !!opts.killed }
      active.add(entry)
      animate(entry)
    },
    dispose() { for (const entry of active) remove(entry) },
  }
}
`
writeFileSync('src/hud-damage.js', hudDamage)

const audioSystem = `import { getAllRegisteredCues, registerAudioHandler } from './audio-cues.js'
import { getSettings } from './settings.js'

// ============ REPRODUÇÃO DE ÁUDIO ============
// Arquivos fornecidos pelo usuário tocam pelo HTMLAudio. Onde ainda não há arquivo, um sinal
// sintético curto preserva feedback básico sem fingir ser efeito final ou fala de personagem.
const MAX_SIMULTANEOUS_ONE_SHOTS = 18
const FALLBACK_MAX_SECONDS = 0.42

function clamp01(value) {
  return Math.max(0, Math.min(1, value))
}

function stableToneFromId(id) {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0
  return 160 + Math.abs(hash % 420)
}

export function getLoopTailRestartTime(durationSeconds, loopTailMs, fallbackDurationMs = 0) {
  const duration = Number.isFinite(durationSeconds) && durationSeconds > 0
    ? durationSeconds
    : Math.max(0, Number(fallbackDurationMs) || 0) / 1000
  const tail = Math.max(0, Number(loopTailMs) || 0) / 1000
  return Math.max(0, duration - tail)
}

export function createAudioSystem() {
  const lastPlayedAt = new Map()
  // entry = { audio, cleanup }; loopTailMs usa replay manual do trecho final, em vez de voltar ao zero.
  const activeLoops = new Map()
  const activeOneShots = new Set()
  const timers = new Set()
  const preloadAudio = []
  let audioContext = null
  let disposed = false

  function removeLoopEntry(id, expectedAudio = null) {
    const entry = activeLoops.get(id)
    if (!entry || (expectedAudio && entry.audio !== expectedAudio)) return null
    activeLoops.delete(id)
    entry.cleanup?.()
    return entry
  }

  function stopAllLoops() {
    for (const id of [...activeLoops.keys()]) stopLoop(id)
  }

  function onAudioModeChanged(event) {
    // Não deixa um loop de carga/propulsor continuar audível depois de o usuário reduzir o modo.
    if (event.detail !== 'all') stopAllLoops()
  }

  if (typeof window !== 'undefined') window.addEventListener('star-anki:audio-mode-changed', onAudioModeChanged)

  function getAudioContext() {
    if (audioContext || typeof window === 'undefined') return audioContext
    const Context = window.AudioContext || window.webkitAudioContext
    if (!Context) return null
    try {
      audioContext = new Context()
      return audioContext
    } catch {
      return null
    }
  }

  function unlock() {
    const context = getAudioContext()
    if (context?.state === 'suspended') context.resume().catch(() => {})
  }

  function preloadMappedFiles() {
    const files = new Set()
    for (const group of Object.values(getAllRegisteredCues())) {
      for (const cue of Object.values(group)) if (cue.file) files.add(cue.file)
    }
    for (const file of files) {
      const audio = new Audio(file)
      audio.preload = 'auto'
      audio.load()
      preloadAudio.push(audio)
    }
  }

  function stopLoop(id) {
    const entry = removeLoopEntry(id)
    if (!entry) return
    entry.audio.pause()
    entry.audio.currentTime = 0
  }

  function playFallback(cue, volume) {
    const context = getAudioContext()
    if (!context) return
    if (context.state === 'suspended') context.resume().catch(() => {})
    const now = context.currentTime
    const gain = context.createGain()
    const oscillator = context.createOscillator()
    const isVoice = cue.category === 'voice'
    const isAmbient = cue.category === 'ambient'
    const duration = Math.min(FALLBACK_MAX_SECONDS, Math.max(0.08, cue.durationMs / 1000))
    const baseFrequency = stableToneFromId(cue.id)

    oscillator.type = isVoice ? 'square' : (isAmbient ? 'sine' : 'sawtooth')
    oscillator.frequency.setValueAtTime(baseFrequency, now)
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(55, isVoice ? baseFrequency * 1.3 : baseFrequency * 0.58), now + duration)
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume * (isVoice ? 0.09 : 0.07)), now + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)
    oscillator.connect(gain).connect(context.destination)
    oscillator.start(now)
    oscillator.stop(now + duration + 0.02)
  }

  function playFile(cue, volume) {
    if (cue.loop && activeLoops.has(cue.id)) return
    if (!cue.loop && activeOneShots.size >= MAX_SIMULTANEOUS_ONE_SHOTS) return
    const audio = new Audio(cue.file)
    audio.preload = 'auto'
    audio.volume = volume

    if (cue.loop) {
      const loopTailMs = Number(cue.loopTailMs)
      if (Number.isFinite(loopTailMs) && loopTailMs > 0) {
        audio.loop = false
        const onEnded = () => {
          const entry = activeLoops.get(cue.id)
          if (!entry || entry.audio !== audio || disposed) return
          audio.currentTime = getLoopTailRestartTime(audio.duration, loopTailMs, cue.durationMs)
          audio.play().catch(() => removeLoopEntry(cue.id, audio))
        }
        audio.addEventListener('ended', onEnded)
        activeLoops.set(cue.id, { audio, cleanup: () => audio.removeEventListener('ended', onEnded) })
      } else {
        audio.loop = true
        activeLoops.set(cue.id, { audio, cleanup: null })
      }
    } else {
      activeOneShots.add(audio)
      audio.addEventListener('ended', () => activeOneShots.delete(audio), { once: true })
    }

    audio.play().catch(() => {
      activeOneShots.delete(audio)
      if (cue.loop) removeLoopEntry(cue.id, audio)
    })
  }

  function playNow(cue, params) {
    if (disposed) return
    const settings = getSettings()
    if (settings.audioMode === 'off') return
    if (settings.audioMode === 'radio' && !cue.radio) return
    const volume = clamp01(cue.volume * settings.audioVolume * (Number.isFinite(params.volumeMult) ? params.volumeMult : 1))
    if (cue.file) playFile(cue, volume)
    else playFallback(cue, volume)
  }

  function onSoundCue(cue, params = {}) {
    if (disposed || !cue?.id) return
    const now = performance.now()
    const lastAt = lastPlayedAt.get(cue.id) || -Infinity
    if (now - lastAt < cue.cooldownMs) return
    lastPlayedAt.set(cue.id, now)
    if (cue.delayMs > 0) {
      const timer = setTimeout(() => {
        timers.delete(timer)
        playNow(cue, params)
      }, cue.delayMs)
      timers.add(timer)
    } else {
      playNow(cue, params)
    }
  }

  registerAudioHandler(onSoundCue, stopLoop)
  return {
    unlock,
    preloadMappedFiles,
    stopLoop,
    dispose() {
      if (disposed) return
      disposed = true
      registerAudioHandler(null)
      for (const timer of timers) clearTimeout(timer)
      timers.clear()
      if (typeof window !== 'undefined') window.removeEventListener('star-anki:audio-mode-changed', onAudioModeChanged)
      stopAllLoops()
      for (const audio of activeOneShots) {
        audio.pause()
        audio.currentTime = 0
      }
      activeOneShots.clear()
      preloadAudio.length = 0
      if (audioContext && audioContext.state !== 'closed') audioContext.close().catch(() => {})
    },
  }
}
`
writeFileSync('src/audio.js', audioSystem)

replaceOnce('src/audio-cues.js',
`  charge_loop: {
    id: 'player_charge_loop',
    file: 'sons/Disparo carregado carregando.mp3',
    durationMs: 1200,
    delayMs: 0,
    cooldownMs: 0,
    volume: 0.65,
    category: 'sfx',
    spatial: false,
    loop: true,
    triggerLogic: 'Inicia em loop quando o botão de tiro é mantido pressionado (fireHeldMs >= homingChargeMinMs).'
  },`,
`  charge_loop: {
    id: 'player_charge_loop',
    file: 'sons/Disparo carregado carregando.mp3',
    durationMs: 1200,
    delayMs: 0,
    cooldownMs: 0,
    volume: 0.5525, // 15% abaixo de 0.65
    category: 'sfx',
    spatial: false,
    loop: true,
    loopTailMs: 360,
    startAfterChargeMs: 180,
    triggerLogic: 'Começa 180ms depois do limiar de carga; toca a introdução uma vez e depois repete apenas os 360ms finais enquanto o botão continua pressionado.'
  },`)

replaceOnce('src/game-loop.js',
`      if (isCharging) {
        if (!state.chargeLoopSignaled) {
          state.chargeLoopSignaled = true
          triggerSoundCue(PLAYER_SOUND_CUES.charge_loop)
        }`,
`      if (isCharging) {
        const chargeAudioReadyAt = player.config.homingChargeMinMs + (PLAYER_SOUND_CUES.charge_loop.startAfterChargeMs || 0)
        if (!state.chargeLoopSignaled && state.fireHeldMs >= chargeAudioReadyAt) {
          state.chargeLoopSignaled = true
          triggerSoundCue(PLAYER_SOUND_CUES.charge_loop)
        }`)

replaceOnce('src/combat/wingmen.js',
`    abilityLabel: 'Carga Compartilhada',
    abilityCooldownBase: 16,
    abilityCooldownFloor: 8,`,
`    abilityLabel: 'Carga Compartilhada',
    abilityCooldownBase: 6,
    abilityCooldownFloor: 3,`)

replaceOnce('src/combat/wingmen.js',
`        if (transition.decision === 'accepted') {
          w.obstacleAvoidanceId = null
          w.obstacleAvoidanceSide = 0
          w.patrolTarget.copy(_wmSlotPos)
          _wmToTarget.copy(_wmSlotPos).sub(w.mesh.position)
          if (_wmToTarget.lengthSq() > 1e-4) {
            w.velocity.copy(_wmToTarget.normalize()).multiplyScalar(WINGMAN_EMERGENCY_REGROUP_SPEED)
          }
          if (!wasEmergency) {
            aiValidator.expect(`,
`        if (transition.decision === 'accepted') {
          // A vaga acompanha o jogador em todos os frames, mas o "kick" de 140u/s só pertence
          // à ENTRADA no emergency regroup. Reaplicá-lo em cada noop apagava a separação de ala
          // calculada no prepass e fazia dois pilotos distantes seguirem praticamente a mesma reta.
          w.patrolTarget.copy(_wmSlotPos)
          if (!wasEmergency) {
            w.obstacleAvoidanceId = null
            w.obstacleAvoidanceSide = 0
            _wmToTarget.copy(_wmSlotPos).sub(w.mesh.position)
            if (_wmToTarget.lengthSq() > 1e-4) {
              w.velocity.copy(_wmToTarget.normalize()).multiplyScalar(WINGMAN_EMERGENCY_REGROUP_SPEED)
            }
            aiValidator.expect(`)

replaceOnce('src/combat/wingmen.js',
`          radioMessage = buildRadioPayload(responder.profile, reply.text, 'radio_response', { threadId: reply.threadId, inReplyTo: reply.triggerEventId, openerPilotId: reply.openerPilotId })`,
`          const opener = WINGMAN_PROFILES[reply.openerPilotId]
          const replyText = opener ? \`↳ \${opener.name}: \${reply.text}\` : \`↳ \${reply.text}\`
          radioMessage = buildRadioPayload(responder.profile, replyText, 'radio_response', { threadId: reply.threadId, inReplyTo: reply.triggerEventId, openerPilotId: reply.openerPilotId, isCallResponse: true })`)

replaceOnce('src/combat/wingman-radio-callresponse.js',
`  ability_ram: {
    1: ["Falco, don't overcommit.", 'Keep an exit vector, Falco.'],
    2: ["Falco, that's way too close!", 'Try not to hit EVERYTHING!'],
    3: ['Impact vector confirmed.', 'Aggressive. Effective.'],
  },`,
`  ability_ram: {
    1: ["Falco, don't overcommit.", 'Keep an exit vector, Falco.'],
    2: ["Falco, that's way too close!", 'Try not to hit EVERYTHING!'],
    3: ['Impact vector confirmed.', 'Aggressive. Effective.'],
  },
  ability_intercept: {
    1: ['Good catch, Falco.', 'Threat cleared. Stay on the line.'],
    2: ['Whoa! Nice save, Falco!', 'That was way too close!'],
    3: ['Projectile neutralized.', 'Intercept confirmed.'],
  },`)

replaceOnce('src/combat/wingman-radio-callresponse.js',
`  ability_rescue: {
    0: ['Get him out clean, Peppy.', "I'll keep the heat off you."],
    2: ["I've got the systems side!", 'Rescue lane looks clear!'],
    3: ['Rescue corridor is clear.', 'Covering the extraction vector.'],
  },`,
`  ability_rescue: {
    0: ['Get him out clean, Peppy.', "I'll keep the heat off you."],
    2: ["I've got the systems side!", 'Rescue lane looks clear!'],
    3: ['Rescue corridor is clear.', 'Covering the extraction vector.'],
  },
  ability_aux_shield: {
    0: ["I'll use the opening.", 'Keep that wall facing forward.'],
    2: ['Barrier looks solid!', "I'll stay inside the cover!"],
    3: ['Shield geometry confirmed.', 'Barrier coverage acknowledged.'],
  },`)

writeFileSync('src/version.js', "export const GAME_VERSION = 'v0.99.25'\n")

replaceOnce('src/selftest.mjs',
`import './wingman-formation-separation.test.mjs'`,
`import './wingman-formation-separation.test.mjs'
import './playtest-polish.test.mjs'`)

const polishTest = `import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { DAMAGE_NUMBER_SCALE, getOrbitAngle, getOrbitArcDashOffset, ORBIT_ARC_SEGMENT } from './hud-damage.js'
import { PLAYER_SOUND_CUES } from './audio-cues.js'
import { getLoopTailRestartTime } from './audio.js'
import { createWingmanRadioConversationManager } from './combat/wingman-radio-callresponse.js'
import { createWingmanStateController, initializeWingmanControl } from './combat/wingman-state-controller.js'

assert.strictEqual(DAMAGE_NUMBER_SCALE, 0.8, 'números de dano precisam estar 20% menores')
const fullTurn = getOrbitAngle(2, 1) - getOrbitAngle(2, 0)
assert.ok(Math.abs(fullTurn - Math.PI * 2) < 1e-9, 'órbita precisa completar uma volta horária por ciclo')
assert.strictEqual(new Set([0, 1, 2, 3, 4].map(getOrbitArcDashOffset)).size, 5, 'jogador + 4 aliados precisam ocupar cinco segmentos orbitais distintos')
assert.ok(ORBIT_ARC_SEGMENT < 20, 'segmentos precisam deixar pequenas folgas entre autores')

const chargeCue = PLAYER_SOUND_CUES.charge_loop
assert.strictEqual(chargeCue.volume, 0.5525, 'carga deve ficar 15% abaixo do volume antigo 0.65')
assert.strictEqual(chargeCue.startAfterChargeMs, 180, 'áudio de carga deve entrar um pouco depois do limiar visual')
assert.strictEqual(chargeCue.loopTailMs, 360, 'loop da carga deve repetir apenas a cauda final')
assert.ok(Math.abs(getLoopTailRestartTime(1.2, chargeCue.loopTailMs, chargeCue.durationMs) - 0.84) < 1e-9, 'loop final deve reiniciar perto do fim, não em 0s')

const shielded = { profile: { id: 9, name: 'Shield test' } }
initializeWingmanControl(shielded, { hp: 4, maxHp: 4, shield: 2, maxShield: 2, lowHpThreshold: 1 })
const controller = createWingmanStateController({ lowHpThreshold: 1 })
controller.applyDamage(shielded, { amount: 1, shieldRegenDelay: 1.5 })
assert.strictEqual(shielded.control.resources.hp, 4, 'hit absorvido pelo escudo não pode reduzir HP')
assert.strictEqual(shielded.control.resources.shield, 1, 'escudo deve absorver o hit')
assert.strictEqual(shielded.control.retreat, null, 'perder escudo não pode iniciar retreat')
assert.strictEqual(shielded.state, 'patrol', 'perder escudo não pode iniciar regroup/retreat')

const radio = createWingmanRadioConversationManager({ random: () => 0 })
const interceptThread = radio.openFromEvent({ openerPilotId: 0, triggerEventId: 'ability_intercept', now: 0, activePilotIds: [0, 1, 2, 3] })
assert.ok(interceptThread && interceptThread.responderPilotId !== 0, 'Intercept precisa poder abrir Call & Response')

const wingmenSource = readFileSync(new URL('./combat/wingmen.js', import.meta.url), 'utf8')
assert.match(wingmenSource, /abilityLabel: 'Carga Compartilhada',[\\s\\S]{0,100}abilityCooldownBase: 6,[\\s\\S]{0,80}abilityCooldownFloor: 3/, 'Carga Compartilhada deve ter cooldown base de 6s')
assert.match(wingmenSource, /w\\.patrolTarget\\.copy\\(_wmSlotPos\\)[\\s\\S]{0,180}if \\(!wasEmergency\\) \\{[\\s\\S]{0,260}w\\.velocity\\.copy/, 'kick de emergency regroup deve ocorrer apenas na entrada')
assert.match(wingmenSource, /↳ \\${opener\\.name}: \\${reply\\.text}/, 'resposta Call & Response precisa ser visualmente identificável')

console.log('playtest-polish.test.mjs: OK')
`
writeFileSync('src/playtest-polish.test.mjs', polishTest)

const progressPath = 'progresso/PROGRESSO_POS_.90.md'
const progress = readFileSync(progressPath, 'utf8')
const marker = '## Histórico de Entregas pós-v0.90.0\n\n'
if (!progress.includes(marker)) throw new Error('marcador de progresso nao encontrado')
const entry = `### v0.99.25 — Polimento pós-playtest: órbita, áudio, rádio e retorno de emergência

- **Buraco negro / números de dano:** todos os números ficaram 20% menores. No modo orbital, os cinco autores (jogador + quatro Wingmen) recebem posições igualmente espaçadas e giram uma volta completa no sentido horário durante a vida do feedback. O arco deixa de viajar preso ao número e vira um segmento central fixo; os cinco segmentos juntos formam o círculo orbital ao redor do alvo, usando a mesma implementação na prévia das Configurações e no combate.
- **Som de carga:** o cue de carregamento entra 180ms depois do limiar de carga, toca 15% mais baixo e, ao chegar ao fim do arquivo, repete somente os 360ms finais em vez de reiniciar toda a introdução.
- **Rádio Call & Response:** respostas agora aparecem explicitamente com o marcador “↳ Nome do chamador: …”, e Intercept/Aux Shield também podem abrir microconversas. O log de playtest confirmou que a feature já entregava respostas; a mudança torna a relação chamada→resposta perceptível no HUD existente.
- **Miyu:** Carga Compartilhada passa de 16s para 6s de cooldown base; o piso proporcional do Vínculo passa de 8s para 3s. Boombuster permanece em seu cooldown independente.
- **Retorno de emergência:** o kick inicial de 140u/s agora é aplicado somente ao entrar em emergency regroup. Frames seguintes atualizam a vaga móvel normalmente, mas não sobrescrevem a velocidade/deconflição. O controller foi reconfirmado: escudo baixo nunca inicia retreat; HP zero é a única origem de retreat, e HP crítico apenas bloqueia ofensiva.
- Novo \\`playtest-polish.test.mjs\\` cobre a volta orbital, segmentos por autor, volume/cauda do áudio, cooldown da Miyu, Call & Response do Intercept, contrato de escudo e guarda estrutural contra reintroduzir o kick de emergência a cada frame.

**Validado:** sintaxe dos módulos alterados, suítes de Wingman/rádio/formação, \\`node src/playtest-polish.test.mjs\\`, \\`node src/selftest.mjs\\` e \\`git diff --check\\`.

`
writeFileSync(progressPath, progress.replace(marker, marker + entry))
