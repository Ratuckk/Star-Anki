import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'

const executablePath = process.env.CHROME_BIN
if (!executablePath) throw new Error('CHROME_BIN ausente')

const browser = await chromium.launch({ headless: true, executablePath, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const context = await browser.newContext({ viewport: { width: 1365, height: 768 } })
const page = await context.newPage()
const errors = []
const warnings = []

page.on('pageerror', (err) => errors.push(`pageerror: ${err.stack || err.message}`))
page.on('console', (msg) => {
  const text = msg.text()
  if (msg.type() === 'error') errors.push(`console.error: ${text}`)
  else if (msg.type() === 'warning') warnings.push(`console.warn: ${text}`)
})
page.on('requestfailed', (req) => {
  // Chrome cancela preload/HTMLAudioElement legitimamente ao trocar/reiniciar a partida.
  // Só mídia com ERR_ABORTED é tolerada; qualquer outro recurso/falha continua fatal.
  const failure = req.failure()?.errorText || 'unknown'
  if (req.resourceType() === 'media' && failure.includes('ERR_ABORTED')) return
  errors.push(`requestfailed: ${req.resourceType()} ${req.method()} ${req.url()} :: ${failure}`)
})
page.on('response', (res) => {
  if (res.status() >= 400) errors.push(`http ${res.status()}: ${res.url()}`)
})

await page.addInitScript(() => {
  // Mistura JSON inválido com payloads de schema inválido: nenhum deles pode impedir o menu/boot.
  localStorage.setItem('star-anki-history', '{not-json')
  localStorage.setItem('star-anki-settings', JSON.stringify({
    startingHealth: {}, startingWingmen: 999, arenaTurnSensitivity: null,
    audioVolume: 'NaN', shipVisual: '???', vitalsHudStyle: 7,
    showEnemyHealthBars: 'true', wingmanRadioEnabled: 'false',
  }))
  localStorage.setItem('star-anki-keybindings', JSON.stringify({
    actions: { moveLeft: 42, pause: null, fire: 'KeyX' },
    gamepad: { axisX: 'x', axisY: -9, invertY: 'no', buttons: { pause: [999, -1] } },
  }))
  localStorage.setItem('star-anki-decks-v1', JSON.stringify([null, { id: 'x', name: 'sem text' }, { id: 4, text: 99 }]))
})

await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle', timeout: 30000 })
await page.waitForTimeout(700)
assert.equal(await page.evaluate(() => document.readyState), 'complete')

const arcade = page.getByRole('button', { name: /arcade|sem baralho/i }).first()
assert.equal(await arcade.count() > 0, true, 'botão Arcade deve existir mesmo com storage corrompido')
await arcade.click()
await page.waitForFunction(() => !!window.__starAnki, null, { timeout: 12000 })

// Pula decolagem e entra no stepper determinístico.
await page.keyboard.press('Space')
await page.waitForTimeout(150)
await page.evaluate(() => {
  window.__starAnki.setManualStepping(true)
  window.__starAnki.step(900, 16.6667)
})

let snapshot = await page.evaluate(() => {
  const api = window.__starAnki
  const p = api.rail.getPlayerPosition()
  return {
    phase: api.state.phase,
    stopped: api.state.stopped,
    pos: [p.x, p.y, p.z],
    camera: [api.camera.position.x, api.camera.position.y, api.camera.position.z],
    enemyCount: (api.enemies.getAlive?.().length || 0) + (api.enemies.getGoldenAlive?.().length || 0),
  }
})
assert.equal(snapshot.stopped, false)
assert.ok(snapshot.pos.every(Number.isFinite), `posição do jogador inválida: ${snapshot.pos}`)
assert.ok(snapshot.camera.every(Number.isFinite), `posição da câmera inválida: ${snapshot.camera}`)
console.log('DEEP_AFTER_STEPS', JSON.stringify(snapshot))

// Pausa normal, abre opções e confirma que sliders/toggles continuam montando com storage saneado.
await page.keyboard.press('Escape')
await page.waitForFunction(() => window.__starAnki?.state?.paused === true)
const options = page.getByRole('button', { name: /opções/i }).first()
await options.click()
assert.equal(await page.getByText('Modo All-Range', { exact: true }).count() > 0, true)
assert.equal(await page.getByText('Editor de controles', { exact: true }).count() > 0, true)
await page.getByRole('button', { name: /voltar/i }).first().click()
await page.getByRole('button', { name: /continuar/i }).first().click()
await page.waitForFunction(() => window.__starAnki?.state?.paused === false)

// Rebind DURANTE a partida via a mesma API usada pela UI. KeyQ deve passar a pausar imediatamente.
await page.evaluate(async () => {
  const mod = await import('./src/keybindings.js')
  mod.setBinding('pause', 'KeyQ')
})
await page.keyboard.press('KeyQ')
await page.waitForFunction(() => window.__starAnki?.state?.paused === true)
await page.keyboard.press('KeyQ')
await page.waitForFunction(() => window.__starAnki?.state?.paused === false)

// Testa teardown de restart: o objeto antigo não pode continuar recebendo input depois da nova mount.
await page.evaluate(() => { window.__oldStarAnkiAudit = window.__starAnki })
await page.keyboard.press('KeyQ')
await page.getByRole('button', { name: /reiniciar partida/i }).click()
await page.getByRole('button', { name: /sim, reiniciar/i }).click()
await page.waitForFunction(() => window.__starAnki && window.__starAnki !== window.__oldStarAnkiAudit, null, { timeout: 12000 })
await page.keyboard.press('Space')
await page.waitForTimeout(120)
const beforeOldPaused = await page.evaluate(() => window.__oldStarAnkiAudit.state.paused)
await page.keyboard.press('KeyQ')
await page.waitForFunction(() => window.__starAnki?.state?.paused === true)
const lifecycle = await page.evaluate(() => ({
  oldStopped: window.__oldStarAnkiAudit.state.stopped,
  oldPausedBefore: window.__oldStarAnkiAudit.state.paused,
  newPaused: window.__starAnki.state.paused,
}))
assert.equal(lifecycle.oldStopped, true, 'partida antiga deve estar stopped após restart')
assert.equal(lifecycle.oldPausedBefore, beforeOldPaused, 'listener antigo não pode reagir ao rebind/input da nova partida')
console.log('DEEP_RESTART_LIFECYCLE', JSON.stringify(lifecycle))

// Sai para o menu e garante remoção da API global e ausência de exceções no teardown.
await page.getByRole('button', { name: /sair para o menu principal/i }).click()
await page.getByRole('button', { name: /sim, sair/i }).click()
await page.waitForFunction(() => !window.__starAnki, null, { timeout: 10000 })
assert.equal(await page.getByRole('button', { name: /arcade|sem baralho/i }).first().count() > 0, true)

// Monta uma terceira partida no mesmo documento: pega vazamentos de listener/DOM que só aparecem
// depois de ciclos repetidos de mount/teardown.
await page.getByRole('button', { name: /arcade|sem baralho/i }).first().click()
await page.waitForFunction(() => !!window.__starAnki, null, { timeout: 12000 })
await page.keyboard.press('Space')
await page.evaluate(() => {
  window.__starAnki.setManualStepping(true)
  window.__starAnki.step(300, 16.6667)
})
snapshot = await page.evaluate(() => ({
  canvases: document.querySelectorAll('#game-screen canvas').length,
  pauseOverlays: document.querySelectorAll('.pause-overlay').length,
  finite: [
    window.__starAnki.rail.getPlayerPosition().x,
    window.__starAnki.rail.getPlayerPosition().y,
    window.__starAnki.rail.getPlayerPosition().z,
  ].every(Number.isFinite),
}))
assert.equal(snapshot.canvases, 1, 'restart/exit não pode acumular canvas WebGL')
assert.equal(snapshot.pauseOverlays, 1, 'restart/exit não pode acumular overlay de pausa')
assert.equal(snapshot.finite, true)
console.log('DEEP_REMOUNT', JSON.stringify(snapshot))

for (const w of warnings) console.log(`DEEP_WARN ${w}`)
for (const e of errors) console.log(`DEEP_ERROR ${e}`)
console.log(`DEEP_SUMMARY errors=${errors.length} warnings=${warnings.length}`)
await browser.close()
if (errors.length) process.exitCode = 3
