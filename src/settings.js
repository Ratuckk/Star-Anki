const SETTINGS_KEY = 'star-anki-settings'

const DEFAULTS = {
  startingHealth: 10,
  showEnemyHealthBars: false,
  damageNumberStyle: 'classic',
  damageOrbitEnabled: true, // coop visual do Buraco negro; nunca altera dano/gameplay
  // Fase 9 (ideia all-range 5): multiplicador de sensibilidade de giro no modo all-range
  arenaTurnSensitivity: 1,
  // visual da nave — ids de SHIP_VISUAL_OPTIONS em rail.js ('default'/'bombardeiro'/'racer')
  shipVisual: 'default',
  // companheiros de início na ala (0 a 4 pilotos)
  startingWingmen: 0,
  // estilo do cluster de vida/escudo/impulso: 'classic' (placas fixas no canto) ou 'orbital'
  // (arcos que acompanham a nave na tela) — ver hud-game.js
  vitalsHudStyle: 'classic',
  // Overhaul 4 (fog como mecânica) — default false preserva o "preto clássico" que o jogo
  // sempre teve; ligado, o fog ganha cor de verdade nos avisos de chefe/dourado/tempestade
  // (ver environment.js, setFogProfile) em vez do preto forçado incondicional de sempre.
  fogTacticalColors: false,
  // Radar mostra blips difusos ("fantasma") pra inimigos fora do alcance de visibilidade direta
  // do fog atual, em vez de escondê-los — ver game-loop.js (bloco RADAR TÁTICO) / hud-game.js.
  minimapGhostBlips: true,
  // Sussurro/Dourado/Horda/Detrito reagem a fog denso (mais escondidos/discretos) — ver §3 do
  // Overhaul 4. Efeitos sonoros continuam tocando normalmente mesmo com isso desligado.
  fogTacticalEffects: true,
  // Bullet-time no Card Choice do modo arcade (Docs/Bullet-time no Card Choice (Arcade).md) —
  // default true preserva o comportamento de hoje (pausa total). Desligado, a tela de 3 cartas
  // no arcade vira câmera lenta em vez de pausa (jogo continua rodando, só bem mais devagar) —
  // ver game-loop.js, ARCADE_CARD_CHOICE_TIME_SCALE.
  arcadeCardChoicePauses: true,
  // Rádio dos aliados (Overhaul de Personalidade, Ideia 3) — pilotos falam frases curtas em
  // momentos-chave (engajar, abate, aviso de vida baixa, etc). Puramente cosmético, sem efeito
  // em IA/dano/timing — ver combat/wingman-radio.js e hud-game.js → showWingmanRadio.
  wingmanRadioEnabled: true,
  // Áudio: 'all' reproduz tudo, 'radio' mantém só rádio/vozes aliados e 'off' silencia.
  audioMode: 'all',
  // Volume mestre dos efeitos, de 0 a 1. É consultado a cada cue, então vale durante a partida.
  audioVolume: 0.8,
}

const BOOLEAN_KEYS = [
  'showEnemyHealthBars', 'damageOrbitEnabled', 'fogTacticalColors', 'minimapGhostBlips',
  'fogTacticalEffects', 'arcadeCardChoicePauses', 'wingmanRadioEnabled',
]

let cachedSettings = null

function readAll() {
  try {
    if (typeof localStorage === 'undefined') return {}
    const raw = localStorage.getItem(SETTINGS_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function writeAll(settings) {
  try {
    if (typeof localStorage === 'undefined') return false
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
    return true
  } catch {
    // quota excedida ou localStorage desabilitado — a configuração ainda vale nesta aba
    return false
  }
}

function finiteClamped(value, fallback, min, max, { integer = false } = {}) {
  // Number(null), Number(false) e Number('') produzem números válidos, mas esses tipos não são
  // valores persistidos válidos para sliders. Sem esta guarda, corrupção podia virar 0/0.5 em
  // vez de restaurar o default.
  if (value == null || typeof value === 'boolean' || typeof value === 'object' || (typeof value === 'string' && value.trim() === '')) {
    return fallback
  }
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  const normalized = integer ? Math.round(parsed) : parsed
  return Math.max(min, Math.min(max, normalized))
}

function sanitizeSettings(raw = {}) {
  const settings = { ...DEFAULTS }

  settings.startingHealth = finiteClamped(raw.startingHealth, DEFAULTS.startingHealth, 1, 20, { integer: true })
  settings.startingWingmen = finiteClamped(raw.startingWingmen, DEFAULTS.startingWingmen, 0, 4, { integer: true })
  settings.arenaTurnSensitivity = finiteClamped(raw.arenaTurnSensitivity, DEFAULTS.arenaTurnSensitivity, 0.5, 2)
  settings.audioVolume = finiteClamped(raw.audioVolume, DEFAULTS.audioVolume, 0, 1)

  settings.damageNumberStyle = ['classic', 'manga', 'orbit'].includes(raw.damageNumberStyle)
    ? raw.damageNumberStyle : DEFAULTS.damageNumberStyle
  settings.audioMode = ['all', 'radio', 'off'].includes(raw.audioMode)
    ? raw.audioMode : DEFAULTS.audioMode
  settings.shipVisual = ['default', 'bombardeiro', 'racer'].includes(raw.shipVisual)
    ? raw.shipVisual : DEFAULTS.shipVisual
  settings.vitalsHudStyle = ['classic', 'orbital'].includes(raw.vitalsHudStyle)
    ? raw.vitalsHudStyle : DEFAULTS.vitalsHudStyle

  for (const key of BOOLEAN_KEYS) {
    settings[key] = typeof raw[key] === 'boolean' ? raw[key] : DEFAULTS[key]
  }
  return settings
}

function ensureCache() {
  if (!cachedSettings) cachedSettings = sanitizeSettings(readAll())
  return cachedSettings
}

export function getSettings() {
  // game-loop/audio consultam configurações várias vezes por frame. localStorage é síncrono e
  // JSON.parse também tem custo; manter o snapshot sanitizado em memória elimina esse I/O do
  // hot path sem perder atualização ao vivo (setSetting atualiza o cache imediatamente).
  return { ...ensureCache() }
}

export function setSetting(key, value) {
  if (!Object.prototype.hasOwnProperty.call(DEFAULTS, key)) return getSettings()
  const current = sanitizeSettings({ ...ensureCache(), [key]: value })
  cachedSettings = current
  writeAll(current)
  // O sistema de áudio encerra loops em curso quando muda para rádio/desligado.
  if (key === 'audioMode' && typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
    window.dispatchEvent(new CustomEvent('star-anki:audio-mode-changed', { detail: current.audioMode }))
  }
  return { ...current }
}

// Outra aba pode alterar as configurações. Invalida só o cache; o próximo leitor revalida o
// payload inteiro antes de expô-lo ao jogo.
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('storage', (event) => {
    if (event?.key === SETTINGS_KEY || event?.key == null) cachedSettings = null
  })
}
