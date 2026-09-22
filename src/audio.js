import { getAllRegisteredCues, registerAudioHandler } from './audio-cues.js'
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

export function createAudioSystem() {
  const lastPlayedAt = new Map()
  const activeLoops = new Map()
  const activeOneShots = new Set()
  const timers = new Set()
  const preloadAudio = []
  let audioContext = null
  let disposed = false

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
    const audio = activeLoops.get(id)
    if (!audio) return
    activeLoops.delete(id)
    audio.pause()
    audio.currentTime = 0
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
    audio.loop = cue.loop
    if (cue.loop) activeLoops.set(cue.id, audio)
    else activeOneShots.add(audio)
    audio.addEventListener('ended', () => activeOneShots.delete(audio), { once: true })
    audio.play().catch(() => {
      activeOneShots.delete(audio)
      if (cue.loop) activeLoops.delete(cue.id)
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
