// Tank e Esquadrão Dourado no JOGO REAL (Chromium, Arcade, game-loop completo): spawna pelos
// mesmos caminhos do debug (`combat.spawnTankEnemy` / `spawnGoldenSpecial`), avança o relógio real
// do jogo com `__starAnki.step` e observa estado por frame (Tank: estados/ciclos/projéteis; Dourado:
// estados por caça, ordens, participação). NÃO roda na CI; NÃO avalia aparência.
//   CHROME_BIN=... THREE_MODULE=... node tools/validate-enemies-browser.mjs
import { startHarness } from './lib/chromium-harness.mjs'
const H = await startHarness()
const { check } = H
const evidence = []
const page = await H.browser.newPage({ viewport: { width: 1280, height: 720 } })
const errs = []
page.on('pageerror', (e) => errs.push(e.message))
await H.startGame(page)

// ---- Tank no game-loop real ----
const tank = await page.evaluate(() => {
  const sa = window.__starAnki
  sa.setManualStepping(true)
  sa.state.debugFlags = { ...(sa.state.debugFlags || {}), godMode: true }
  const t = sa.combat.spawnTankEnemy()
  const seen = new Set(); const trace = []; let last = ''
  for (let i = 0; i < 60 * 70; i++) {
    sa.step(1, 1000 / 60)
    const st = t.fsm.currentState
    seen.add(st)
    if (st !== last) { trace.push(`${(i / 60).toFixed(1)}s ${st}${t.currentAttack ? ':' + t.currentAttack : ''}`); last = st }
  }
  return { seen: [...seen], trace: trace.slice(0, 16), cycles: t.cycleCount, dying: t.dying, shots: t.shotsFired }
})
check(!tank.seen.includes('undefined'), `Tank no jogo real entrou em estado "undefined": ${tank.seen}`)
for (const s of ['BRACING', 'TELEGRAPHING', 'ATTACKING', 'RECOVERY', 'REPOSITIONING']) check(tank.seen.includes(s), `Tank no jogo real nunca visitou ${s}: ${tank.seen}`)
check(tank.cycles >= 2, `Tank deve completar ≥ 2 ciclos no jogo real (ciclos=${tank.cycles})`)
check(tank.shots >= 2, `Tank deve disparar ≥ 2 projéteis reais (tiros=${tank.shots})`)
evidence.push(`TANK (jogo real, ${tank.cycles} ciclos, ${tank.shots} tiros): ${tank.trace.join(' | ')}`)

// ---- Dourado no game-loop real ----
const gold = await page.evaluate(() => {
  const sa = window.__starAnki
  sa.combat.spawnGoldenSpecial({ distanceMin: 60, distanceMax: 70 })
  const all = () => sa.enemies.getAlive()
  const acted = new Map(); const orders = new Set(); let maxOff = 0
  for (let i = 0; i < 60 * 60; i++) {
    sa.step(1, 1000 / 60)
    const tel = sa.enemies.getGoldenTelemetry()
    if (tel?.squadron) { orders.add(tel.squadron.currentOrder); maxOff = Math.max(maxOff, tel.squadron.offensiveParticipants) }
    for (const f of all()) if (f.kind === 'golden_fighter' && f.state && f.state !== 'FORMATION' && f.state !== 'REGROUPING') acted.set(f.id, (acted.get(f.id) || 0) + 1)
  }
  return { orders: [...orders], acted: acted.size, maxOff, hasApi: typeof sa.enemies.getGoldenTelemetry }
})
check(gold.hasApi === 'function', 'enemies.getGoldenTelemetry ausente')
check(gold.acted >= 2, `caças do Dourado devem agir no jogo real (distintos que saíram de formação: ${gold.acted})`)
check(gold.orders.filter((o) => o !== 'NONE').length >= 2, `ordens observadas no jogo real: ${gold.orders}`)
evidence.push(`DOURADO (jogo real, 60 s): ordens=${gold.orders.join(',')}; caças distintos que agiram=${gold.acted}; máx. ofensivos=${gold.maxOff}`)
check(errs.length === 0, `erros de página: ${errs.join(' | ')}`)
await page.close()
await H.finish('ENEMIES-BROWSER', evidence)
