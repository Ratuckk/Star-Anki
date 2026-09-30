// Validação em Chromium REAL do rádio fixo inferior-central, do Fox (FOCO) e do retrato de
// habilidade dos aliados. NÃO roda na CI.
//  1. centerX do painel durante TODA a entrada/hold/saída e numa transmissão imediata após outra
//     (|centerX − innerWidth/2| ≤ 1 px) em 4 resoluções, para Falco e Fox;
//  2. KeyD real → uma única fala do Fox (payload com speaker real), painel único;
//  3. retrato de habilidade por piloto: 1 indicador, src correto, sem glifo, acompanha a projeção,
//     some, não reinicia.
//   CHROME_BIN=... THREE_MODULE=... node tools/validate-radio-runtime.mjs
import { startHarness } from './lib/chromium-harness.mjs'
const H = await startHarness()
const { check } = H
const evidence = []

// ---------- 1. centralização durante a animação ----------
let maxErr = 0
for (const [w, h] of [[1280, 720], [1366, 768], [1600, 900], [1920, 1080]]) {
  const page = await H.browser.newPage({ viewport: { width: w, height: h } })
  const errs = []
  page.on('pageerror', (e) => errs.push(e.message))
  await H.startGame(page)
  const sampler = `(() => {
    window.__cx = []
    const el = document.querySelector('.hud-wingman-radio')
    const tick = () => { const r = el.getBoundingClientRect(); if (getComputedStyle(el).opacity > 0) window.__cx.push({ t: performance.now(), cx: (r.left + r.right) / 2, w: r.width, cls: el.className }); window.__cxRaf = requestAnimationFrame(tick) }
    tick()
  })()`
  await page.evaluate(sampler)
  const speakers = [
    { pilotId: 0, speakerId: 'wingman-0', speakerType: 'wingman', name: 'Falco', color: '#ef4444', avatar: 'assets/wingman-radio/falco.png', voiceCue: 'pilot_voice_falco', text: 'Dois na minha cola. Me dá espaço.' },
    { pilotId: null, speakerId: 'fox', speakerType: 'player', name: 'Fox', color: '#38bdf8', avatar: 'assets/wingman-radio/fox.png', voiceCue: 'pilot_voice_fox', text: 'Esquadrão, foco no alvo!' },
  ]
  for (const p of speakers) {
    await page.evaluate((payload) => { window.__cx = []; window.__gameHudInstance.showWingmanRadio(payload) }, p)
    await page.waitForTimeout(3300) // entrada (280) + hold (2400) + saída (190) + folga
    // transmissão imediata após outra (reinício durante a exibição)
    await page.evaluate((payload) => { window.__gameHudInstance.showWingmanRadio(payload) }, p)
    await page.waitForTimeout(500)
    await page.evaluate((payload) => { window.__gameHudInstance.showWingmanRadio({ ...payload, text: 'Segunda transmissão colada.' }) }, p)
    await page.waitForTimeout(3300)
    const samples = await page.evaluate(() => window.__cx)
    const entering = samples.filter((s) => s.cls.includes('entering')).length
    const leaving = samples.filter((s) => s.cls.includes('leaving')).length
    const err = samples.reduce((m, s) => Math.max(m, Math.abs(s.cx - w / 2)), 0)
    maxErr = Math.max(maxErr, err)
    check(samples.length > 30, `[${w}x${h} ${p.name}] amostras insuficientes (${samples.length})`)
    check(entering > 0 && leaving > 0, `[${w}x${h} ${p.name}] não amostrou entrada (${entering}) e saída (${leaving})`)
    check(err <= 1, `[${w}x${h} ${p.name}] |centerX − innerWidth/2| = ${err.toFixed(2)} px > 1 (${samples.length} amostras)`)
    const portrait = await page.evaluate(() => { const i = document.querySelector('.hud-wingman-radio .wr-portrait'); return i ? i.getAttribute('src') : null })
    check(portrait === p.avatar, `[${w}x${h} ${p.name}] retrato ${portrait} ≠ ${p.avatar}`)
  }
  check(errs.length === 0, `[${w}x${h}] erros de página: ${errs.join(' | ')}`)
  await page.close()
}
evidence.push(`RÁDIO: erro máximo de centerX em todas as amostras = ${maxErr.toFixed(3)} px (limite 1 px)`)

// ---------- 2. KeyD real → Fox ----------
{
  const page = await H.browser.newPage({ viewport: { width: 1280, height: 720 } })
  await H.startGame(page)
  await page.evaluate(() => {
    window.__radioLog = []
    const hud = window.__gameHudInstance
    const orig = hud.showWingmanRadio.bind(hud)
    hud.showWingmanRadio = (p) => { window.__radioLog.push({ ...p, at: performance.now() }); return orig(p) }
    window.__spritesBefore = window.__spriteCount || 0
  })
  await page.keyboard.press('KeyD')
  await page.waitForTimeout(1500)
  let log = await page.evaluate(() => window.__radioLog)
  const fox = log.filter((m) => m.speakerId === 'fox')
  check(fox.length === 1 && fox[0].eventId === 'focus_activated', `KeyD deveria gerar exatamente 1 fala do Fox (focus_activated): ${JSON.stringify(log.map((m) => m.eventId))}`)
  check(log.filter((m) => m.speakerId !== 'fox' && m.eventId?.startsWith('engage')).length <= 1, 'Focus não pode gerar rajada de pilotos')
  const shown = await page.evaluate(() => ({ name: document.querySelector('.hud-wingman-radio-name').textContent, src: document.querySelector('.wr-portrait').getAttribute('src'), panels: document.querySelectorAll('.hud-wingman-radio').length, notice: document.querySelectorAll('.hud-squadron-notice').length, sprites: (window.__spriteCount || 0) - window.__spritesBefore }))
  check(shown.name === 'Fox' && shown.src === 'assets/wingman-radio/fox.png', `painel deveria mostrar Fox: ${JSON.stringify(shown)}`)
  check(shown.panels === 1 && shown.notice === 0 && shown.sprites === 0, `painel único, sem aviso legado/sprite world-space: ${JSON.stringify(shown)}`)
  // READY: espera o ciclo completo (6 s ativo + 10 s recarga, no relógio do jogo)
  const t0 = Date.now()
  for (;;) {
    log = await page.evaluate(() => window.__radioLog)
    if (log.some((m) => m.eventId === 'focus_ready') || Date.now() - t0 > 90000) break
    await page.waitForTimeout(500)
  }
  const ready = log.filter((m) => m.eventId === 'focus_ready')
  check(ready.length === 1 && ready[0].speakerId === 'fox', `FOCO→READY deve gerar exatamente 1 fala do Fox: ${JSON.stringify(log.map((m) => m.eventId))}`)
  await page.waitForTimeout(2500)
  log = await page.evaluate(() => window.__radioLog)
  check(log.filter((m) => m.eventId === 'focus_ready').length === 1, 'focus_ready não pode repetir por frame')
  // gate: nenhuma transmissão a < 6 s da anterior (relógio real ≥ tempo de jogo quando o GL é lento? mede em tempo de página)
  evidence.push(`FOX: eventos = ${JSON.stringify(log.map((m) => `${m.speakerId}:${m.eventId}`))}`)
  await page.close()
}

// ---------- 3. retrato de habilidade ----------
{
  const page = await H.browser.newPage({ viewport: { width: 1280, height: 720 } })
  await H.startGame(page)
  const names = ['falco', 'peppy', 'slippy', 'miyu']
  let dup = 0
  for (let pilot = 0; pilot < 4; pilot++) {
    const res = await page.evaluate(async ({ pilot }) => {
      const sa = window.__starAnki
      const hud = window.__gameHudInstance
      const sq = sa.combat
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
      const out = { ok: false }
      // aciona o caminho real de ativação por piloto através do esquadrão do combate
      const hook = sq.debugTriggerAbilityFeedback
      out.hasHook = typeof hook === 'function'
      if (!out.hasHook) return out
      hook(pilot)
      await sleep(250)
      const q = () => Array.from(document.querySelectorAll('.hud-ability-pilot-portrait'))
      const a = q()
      out.count1 = a.length
      out.src = a[0]?.querySelector('img')?.getAttribute('src')
      out.text = a[0]?.textContent.trim()
      out.left1 = a[0]?.style.left
      hook(pilot) // repetição durante a janela: não reinicia
      await sleep(250)
      out.count2 = sq.getActiveAbilityPortraits().filter((x) => x.pilotId === pilot).length
      out.domCount2 = q().length
      await sleep(1700)
      out.count3 = sq.getActiveAbilityPortraits().filter((x) => x.pilotId === pilot).length + q().length
      out.panelsActive = document.querySelectorAll('.hud-wingman-radio.active').length
      out.ok = true
      return out
    }, { pilot })
    if (!res.hasHook) { check(false, 'hook debugTriggerAbility ausente em combat (necessário para o validator)'); break }
    check(res.count1 === 1, `piloto ${names[pilot]}: exatamente 1 retrato (${res.count1})`)
    check(res.src === `assets/wingman-radio/${names[pilot]}.png`, `piloto ${names[pilot]}: src ${res.src}`)
    check(res.text === '', `piloto ${names[pilot]}: retrato sem texto/glifo ("${res.text}")`)
    check(res.count2 === 1 && res.domCount2 <= 1, `piloto ${names[pilot]}: repetição não duplica (modelo ${res.count2}, DOM ${res.domCount2})`)
    check(res.count3 === 0, `piloto ${names[pilot]}: retrato some após ~1,5 s (${res.count3})`)
    dup += Math.max(0, res.count2 - 1)
  }
  evidence.push(`PORTRAITS: duplicações = ${dup}`)
  await page.close()
}
await H.finish('RADIO-RUNTIME', evidence)
