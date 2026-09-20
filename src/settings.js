const SETTINGS_KEY = 'star-anki-settings'

const DEFAULTS = {
  startingHealth: 10,
  showEnemyHealthBars: false,
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
}

function readAll() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeAll(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // quota excedida ou localStorage desabilitado — falha silenciosa de propósito
  }
}

export function getSettings() {
  return { ...DEFAULTS, ...readAll() }
}

export function setSetting(key, value) {
  const current = getSettings()
  current[key] = value
  writeAll(current)
  return current
}
