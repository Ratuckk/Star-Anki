const SETTINGS_KEY = 'star-anki-settings'

const DEFAULTS = {
  startingHealth: 10,
  showEnemyHealthBars: false,
  // Fase 9 (ideia all-range 5): multiplicador de sensibilidade de giro no modo all-range
  arenaTurnSensitivity: 1,
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
