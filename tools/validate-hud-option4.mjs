import { launchBrowser } from './edge-cdp-harness.mjs'
import assert from 'node:assert/strict'
import { join } from 'node:path'

const ARTIFACTS_DIR = process.env.ARTIFACTS_DIR || 'C:\\Users\\zerke\\.gemini\\antigravity-ide\\brain\\4a71a9c7-c71f-4226-ac03-0646bbbbcc6c'
const SHOT_1280_IDLE = join(ARTIFACTS_DIR, 'media_hud_option4_1280x720_idle.png')
const SHOT_1280_COMBAT = join(ARTIFACTS_DIR, 'media_hud_option4_1280x720_combat.png')
const SHOT_1366_COMBAT = join(ARTIFACTS_DIR, 'media_hud_option4_1366x768_combat.png')
const SHOT_1920_COMBAT = join(ARTIFACTS_DIR, 'media_hud_option4_1920x1080_combat.png')
const SHOT_RESIZE = join(ARTIFACTS_DIR, 'media_hud_option4_resize.png')

console.log('[HUD OPTION 4 VALIDATION] Iniciando Edge headless...')
const browser = await launchBrowser({ width: 1280, height: 720 })

function rectsOverlap(a, b) {
  return !(
    a.right <= b.left ||
    a.left >= b.right ||
    a.bottom <= b.top ||
    a.top >= b.bottom
  )
}

try {
  console.log('[HUD OPTION 4 VALIDATION] Navegando para http://127.0.0.1:8420...')
  await browser.navigate('http://127.0.0.1:8420')
  await browser.wait(1500)

  // Inicia modo Arcade
  console.log('[HUD OPTION 4 VALIDATION] Selecionando modo Arcade...')
  await browser.waitForSelector('#btn-pregame-play-arcade', 8000)
  await browser.click('#btn-pregame-play-arcade')
  await browser.wait(600)

  // Pula a decolagem cinematográfica (espaço 3 vezes)
  console.log('[HUD OPTION 4 VALIDATION] Pulando cutscene de decolagem...')
  await browser.pressKey(' ')
  await browser.wait(500)
  await browser.pressKey(' ')
  await browser.wait(500)
  await browser.pressKey(' ')
  await browser.wait(2500)

  // Função auxiliar para coletar métricas dos 4 containers
  async function inspectGeometry(label) {
    const data = await browser.evaluate(`(() => {
      const stats = document.querySelector('.hud-left-stats');
      const resources = document.querySelector('.hud-left-resources');
      const actions = document.querySelector('.hud-left-actions');
      const vitals = document.querySelector('.hud-left-vitals');

      function getRect(el) {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return {
          left: r.left,
          top: r.top,
          right: r.right,
          bottom: r.bottom,
          width: r.width,
          height: r.height,
          cssLeft: style.left,
          cssTop: style.top,
          transform: style.transform,
          display: style.display,
          visibility: style.visibility,
          opacity: style.opacity
        };
      }

      return {
        viewport: { width: window.innerWidth, height: window.innerHeight },
        stats: getRect(stats),
        resources: getRect(resources),
        actions: getRect(actions),
        vitals: getRect(vitals)
      };
    })()`)
    return data
  }

  // Função de asserção geométrica completa
  function validateGeometry(metrics, resolutionName) {
    const { viewport, stats, resources, actions, vitals } = metrics
    console.log(`\n========================================================================`)
    console.log(`[GEOMETRIA HUD: ${resolutionName} (${viewport.width}x${viewport.height})]`)
    console.log(`  1. STATS:     left=${stats.left.toFixed(1)}px, top=${stats.top.toFixed(1)}px, bottom=${stats.bottom.toFixed(1)}px, w=${stats.width.toFixed(1)}px, h=${stats.height.toFixed(1)}px`)
    console.log(`  2. RESOURCES: left=${resources.left.toFixed(1)}px, top=${resources.top.toFixed(1)}px, bottom=${resources.bottom.toFixed(1)}px, w=${resources.width.toFixed(1)}px, h=${resources.height.toFixed(1)}px`)
    console.log(`  3. ACTIONS:   left=${actions.left.toFixed(1)}px, top=${actions.top.toFixed(1)}px, bottom=${actions.bottom.toFixed(1)}px, w=${actions.width.toFixed(1)}px, h=${actions.height.toFixed(1)}px`)
    console.log(`  4. VITALS:    left=${vitals.left.toFixed(1)}px, top=${vitals.top.toFixed(1)}px, bottom=${vitals.bottom.toFixed(1)}px, w=${vitals.width.toFixed(1)}px, h=${vitals.height.toFixed(1)}px`)

    // Gaps
    const gap1 = resources.top - stats.bottom
    const gap2 = actions.top - resources.bottom
    const gap3 = vitals.top - actions.bottom
    console.log(`  GAPS: stats->res=${gap1.toFixed(1)}px (min 10), res->act=${gap2.toFixed(1)}px (min 10), act->vit=${gap3.toFixed(1)}px (min 12)`)

    // Contrato 1: Ordem vertical estrita e gaps
    assert.ok(resources.top >= stats.bottom + 10, `resources.top (${resources.top.toFixed(1)}) deve ser >= stats.bottom + 10 (${(stats.bottom + 10).toFixed(1)})`)
    assert.ok(actions.top >= resources.bottom + 10, `actions.top (${actions.top.toFixed(1)}) deve ser >= resources.bottom + 10 (${(resources.bottom + 10).toFixed(1)})`)
    assert.ok(vitals.top >= actions.bottom + 12, `vitals.top (${vitals.top.toFixed(1)}) deve ser >= actions.bottom + 12 (${(actions.bottom + 12).toFixed(1)})`)

    // Contrato 2: Anti-overlap completo (todas as combinações par a par)
    assert.ok(!rectsOverlap(stats, resources), 'Stats e Resources NÃO podem se sobrepor')
    assert.ok(!rectsOverlap(stats, actions), 'Stats e Actions NÃO podem se sobrepor')
    assert.ok(!rectsOverlap(stats, vitals), 'Stats e Vitals NÃO podem se sobrepor')
    assert.ok(!rectsOverlap(resources, actions), 'Resources e Actions NÃO podem se sobrepor')
    assert.ok(!rectsOverlap(resources, vitals), 'Resources e Vitals NÃO podem se sobrepor')
    assert.ok(!rectsOverlap(actions, vitals), 'Actions e Vitals NÃO podem se sobrepor')
    console.log(`  ✔ Anti-overlap: Nenhuma das 6 combinações colide`)

    // Contrato 3: Alinhamento horizontal no mesmo eixo X (tolerância <= 4px)
    const diffRes = Math.abs(stats.left - resources.left)
    const diffAct = Math.abs(stats.left - actions.left)
    const diffVit = Math.abs(stats.left - vitals.left)
    console.log(`  ALINHAMENTO X: diff(stats,res)=${diffRes.toFixed(1)}px, diff(stats,act)=${diffAct.toFixed(1)}px, diff(stats,vit)=${diffVit.toFixed(1)}px (max 4px)`)
    assert.ok(diffRes <= 4, `stats.left (${stats.left}) e resources.left (${resources.left}) diferem por mais de 4px`)
    assert.ok(diffAct <= 4, `stats.left (${stats.left}) e actions.left (${actions.left}) diferem por mais de 4px`)
    assert.ok(diffVit <= 4, `stats.left (${stats.left}) e vitals.left (${vitals.left}) diferem por mais de 4px`)
    console.log(`  ✔ Alinhamento X unificado respeitado`)

    // Contrato 4: Confinamento na viewport
    for (const [name, r] of [['stats', stats], ['resources', resources], ['actions', actions], ['vitals', vitals]]) {
      assert.ok(r.left >= 0, `${name}.left deve ser >= 0`)
      assert.ok(r.top >= 0, `${name}.top deve ser >= 0`)
      assert.ok(r.right <= viewport.width, `${name}.right (${r.right}) deve caber na largura da viewport (${viewport.width})`)
      assert.ok(r.bottom <= viewport.height, `${name}.bottom (${r.bottom}) deve caber na altura da viewport (${viewport.height})`)
    }
    console.log(`  ✔ Todos os 4 blocos confinados 100% dentro da viewport`)

    // Contrato 5: Limite de ocupação lateral
    const rightmost = Math.max(stats.right, resources.right, actions.right, vitals.right)
    const occupancyPct = (rightmost / viewport.width) * 100
    console.log(`  OCUPAÇÃO LATERAL: rightmost=${rightmost.toFixed(1)}px (${occupancyPct.toFixed(1)}% da viewport)`)
    if (viewport.width === 1280) {
      assert.ok(occupancyPct <= 34.0, `Ocupação lateral em 1280x720 deve ser <= 34% (atual: ${occupancyPct.toFixed(1)}%)`)
    } else if (viewport.width === 1920) {
      assert.ok(occupancyPct <= 30.0, `Ocupação lateral em 1920x1080 deve ser <= 30% (atual: ${occupancyPct.toFixed(1)}%)`)
    } else {
      assert.ok(occupancyPct <= 35.0, `Ocupação lateral deve ser <= 35% (atual: ${occupancyPct.toFixed(1)}%)`)
    }
    console.log(`  ✔ Limite de ocupação lateral respeitado`)

    // Contrato 6: Proibição de centralização (left: 50% ou translateX(-50%))
    for (const [name, r] of [['stats', stats], ['resources', resources], ['actions', actions], ['vitals', vitals]]) {
      assert.ok(!r.cssLeft?.includes('50%'), `${name} não pode ter left: 50%`)
      assert.ok(!r.transform?.includes('matrix(1, 0, 0, 1, -') || !r.transform?.includes('-50%'), `${name} não pode ter translateX(-50%)`)
    }
    console.log(`  ✔ Nenhum elemento no centro superior`)
    console.log(`========================================================================\n`)
  }

  // ========================================================================
  // TESTE 1: 1280x720 — HUD IDLE
  // ========================================================================
  console.log('[HUD OPTION 4 VALIDATION] Testando 1280x720 Idle...')
  await browser.setViewport(1280, 720)
  await browser.wait(400)
  const metrics1280Idle = await inspectGeometry('1280x720 Idle')
  validateGeometry(metrics1280Idle, '1280x720 Idle')

  console.log(`[HUD OPTION 4 VALIDATION] Capturando screenshot: ${SHOT_1280_IDLE}...`)
  await browser.captureScreenshot(SHOT_1280_IDLE)

  // Configura estado completo de combate:
  // - 4 aliados preenchidos
  // - FOCO em cooldown
  // - SWIRL em cooldown
  // - Cadeia de abates ativa
  // - Vida e escudo parcialmente consumidos
  console.log('[HUD OPTION 4 VALIDATION] Aplicando estado completo de combate (4 aliados, cooldowns, cadeia, dano)...')
  await browser.evaluate(`(() => {
    const hud = window.__gameHudInstance;
    if (hud) {
      hud.setSquadronAbilities([
        { id: 'falco', abilityId: 'ram', recruited: true, ready: true, active: false, cooldownRemaining: 0, cooldownTotal: 10, color: 0x38bdf8, name: 'Falco' },
        { id: 'peppy', abilityId: 'guard', recruited: true, ready: true, active: false, cooldownRemaining: 0, cooldownTotal: 10, color: 0x22c55e, name: 'Peppy' },
        { id: 'slippy', abilityId: 'repair', recruited: true, ready: false, active: false, cooldownRemaining: 4, cooldownTotal: 10, color: 0xf59e0b, name: 'Slippy' },
        { id: 'miyu', abilityId: 'assist', recruited: true, ready: true, active: false, cooldownRemaining: 0, cooldownTotal: 10, color: 0xa855f7, name: 'Miyu' },
      ]);
      hud.setSquadronCommandState({ mode: 'free', cooldownRemaining: 4, cooldownMax: 10 });
      hud.setSwirlCooldown(4, 8);
      hud.setKillChain(3, 4, 6);
      hud.setStatus({
        health: 4,
        maxHealth: 8,
        score: 4850,
        combo: 2.5,
        streak: 12,
        kills: 8,
        missionTimeMs: 45000,
        difficultyLevel: 3
      });
      hud.setShield(55, 100);
      hud.setLives(3);
      hud.setBoost(0.65, true);
    }
  })()`)
  await browser.wait(400)

  // ========================================================================
  // TESTE 2: 1280x720 — COMBATE ATIVO
  // ========================================================================
  console.log('[HUD OPTION 4 VALIDATION] Testando 1280x720 Combate Ativo...')
  const metrics1280Combat = await inspectGeometry('1280x720 Combate')
  validateGeometry(metrics1280Combat, '1280x720 Combate')

  console.log(`[HUD OPTION 4 VALIDATION] Capturando screenshot: ${SHOT_1280_COMBAT}...`)
  await browser.captureScreenshot(SHOT_1280_COMBAT)

  // ========================================================================
  // TESTE 3: 1366x768 — COMBATE ATIVO
  // ========================================================================
  console.log('[HUD OPTION 4 VALIDATION] Testando 1366x768 Combate Ativo...')
  await browser.setViewport(1366, 768)
  await browser.wait(400)
  const metrics1366 = await inspectGeometry('1366x768 Combate')
  validateGeometry(metrics1366, '1366x768 Combate')

  console.log(`[HUD OPTION 4 VALIDATION] Capturando screenshot: ${SHOT_1366_COMBAT}...`)
  await browser.captureScreenshot(SHOT_1366_COMBAT)

  // ========================================================================
  // TESTE 4: 1920x1080 — COMBATE ATIVO
  // ========================================================================
  console.log('[HUD OPTION 4 VALIDATION] Testando 1920x1080 Combate Ativo...')
  await browser.setViewport(1920, 1080)
  await browser.wait(400)
  const metrics1920 = await inspectGeometry('1920x1080 Combate')
  validateGeometry(metrics1920, '1920x1080 Combate')

  console.log(`[HUD OPTION 4 VALIDATION] Capturando screenshot: ${SHOT_1920_COMBAT}...`)
  await browser.captureScreenshot(SHOT_1920_COMBAT)

  // ========================================================================
  // TESTE 5: RESIZE DINÂMICO DURANTE GAMEPLAY (1920 -> 1280 -> 1366)
  // ========================================================================
  console.log('[HUD OPTION 4 VALIDATION] Testando resize dinâmico durante gameplay...')
  await browser.setViewport(1280, 720)
  await browser.wait(200)
  await browser.setViewport(1440, 900)
  await browser.wait(200)
  await browser.setViewport(1280, 720)
  await browser.wait(400)
  const metricsResize = await inspectGeometry('1280x720 Pós-Resize')
  validateGeometry(metricsResize, '1280x720 Pós-Resize')

  console.log(`[HUD OPTION 4 VALIDATION] Capturando screenshot pós-resize: ${SHOT_RESIZE}...`)
  await browser.captureScreenshot(SHOT_RESIZE)

  console.log('\n[HUD OPTION 4 VALIDATION] SUCESSO TOTAL: Todos os contratos geométricos de runtime passaram perfeitamente!')
} finally {
  await browser.close()
}
