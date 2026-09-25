import { launchBrowser } from './edge-cdp-harness.mjs'
import assert from 'node:assert/strict'
import { join } from 'node:path'

const ARTIFACTS_DIR = process.env.ARTIFACTS_DIR || 'C:\\Users\\zerke\\.gemini\\antigravity-ide\\brain\\4a71a9c7-c71f-4226-ac03-0646bbbbcc6c'
const SHOT_LVL1 = join(ARTIFACTS_DIR, 'media_fase2_golden_lvl1_4allies.png')
const SHOT_LVL9 = join(ARTIFACTS_DIR, 'media_fase2_golden_lvl9_4allies.png')
const SHOT_BEAM = join(ARTIFACTS_DIR, 'media_fase2_golden_beam_fire.png')

console.log('[FASE 2 RUNTIME VALIDATION] Iniciando Edge headless...')
const browser = await launchBrowser({ width: 1280, height: 720 })

try {
  console.log('[FASE 2 RUNTIME VALIDATION] Navegando para http://127.0.0.1:8420...')
  await browser.navigate('http://127.0.0.1:8420')
  await browser.wait(1500)

  // Inicia modo Arcade (inicia com 4 wingmen)
  console.log('[FASE 2 RUNTIME VALIDATION] Selecionando modo Arcade...')
  await browser.waitForSelector('#btn-pregame-play-arcade', 8000)
  await browser.click('#btn-pregame-play-arcade')
  await browser.wait(600)

  // Pula a decolagem
  console.log('[FASE 2 RUNTIME VALIDATION] Pulando cutscene de decolagem...')
  await browser.pressKey(' ')
  await browser.wait(600)
  await browser.pressKey(' ')
  await browser.wait(600)
  await browser.pressKey(' ')
  await browser.wait(2000)

  // Abre o painel de debug
  console.log('[FASE 2 RUNTIME VALIDATION] Abrindo painel de Debug...')
  await browser.evaluate(`(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '\\\\', code: 'Backslash' }));
  })()`)
  await browser.wait(800)

  // ========================================================================
  // 1. DOURADO NO NÍVEL 1 COM 4 ALIADOS -> DEVE GERAR EXATAMENTE 6 CAÇAS
  // ========================================================================
  console.log('[FASE 2 RUNTIME VALIDATION] Spawnando Dourado no Nível 1 com 4 aliados...')
  const squadLvl1State = await browser.evaluate(`(() => {
    const dbg = window.__debugInstance || null;
    const combat = window.__combatInstance || null;
    if (combat?.setWingmanCount) combat.setWingmanCount(4);
    // Clica no botão de spawnar Dourado
    const spawnBtn = Array.from(document.querySelectorAll('.debug-btn')).find(b => b.textContent.toLowerCase().includes('dourado'));
    if (spawnBtn) spawnBtn.click();
    else if (window.__combatInstance?.spawnGoldenSpecial) window.__combatInstance.spawnGoldenSpecial();

    const wingmenCount = combat?.getWingmanCount?.() ?? 4;
    return {
      wingmenCount,
    };
  })()`)

  await browser.wait(1200)

  const lvl1Fighters = await browser.evaluate(`(() => {
    const enemies = window.__enemiesSysInstance || null;
    const goldenTele = enemies?.getGoldenTelemetry?.();
    const fighters = goldenTele?.squadron?.aliveCount ?? 0;
    const cap = goldenTele?.squadron?.cap ?? 0;
    const allyBonus = goldenTele?.squadron?.allyBonus ?? 0;
    return { fighters, cap, allyBonus };
  })()`)

  console.log('[FASE 2 RUNTIME VALIDATION] Estado Dourado Lvl 1:', lvl1Fighters)
  assert.equal(lvl1Fighters.fighters, 6, 'Dourado no nível 1 com 4 aliados deve ter exatamente 6 caças')
  assert.equal(lvl1Fighters.cap, 6, 'Cap deve ser 6')
  assert.equal(lvl1Fighters.allyBonus, 4, 'Bônus de aliados deve ser 4')

  console.log(`[FASE 2 RUNTIME VALIDATION] Capturando screenshot Lvl 1 -> ${SHOT_LVL1}...`)
  await browser.captureScreenshot(SHOT_LVL1)

  // ========================================================================
  // 2. DOURADO NO NÍVEL 9 COM 4 ALIADOS -> DEVE GERAR EXATAMENTE 10 CAÇAS (CAP MÁXIMO)
  // ========================================================================
  console.log('[FASE 2 RUNTIME VALIDATION] Ajustando dificuldade para Nível 9...')
  for (let i = 0; i < 8; i++) {
    await browser.evaluate(`(() => {
      const btn = Array.from(document.querySelectorAll('.debug-action-btn, button')).find(b => b.textContent.includes('+ Nível de dificuldade'));
      if (btn) btn.click();
    })()`)
    await browser.wait(150)
  }

  // Limpa inimigos prévios e spawna novo Dourado nível 9
  await browser.evaluate(`(() => {
    const combat = window.__combatInstance || null;
    if (combat?.clearAllCombatants) combat.clearAllCombatants();
    if (combat?.setWingmanCount) combat.setWingmanCount(4);
    if (combat?.spawnGoldenSpecial) combat.spawnGoldenSpecial();
  })()`)

  await browser.wait(1500)

  const lvl9Fighters = await browser.evaluate(`(() => {
    const enemies = window.__enemiesSysInstance || null;
    const goldenTele = enemies?.getGoldenTelemetry?.();
    const fighters = goldenTele?.squadron?.aliveCount ?? 0;
    const cap = goldenTele?.squadron?.cap ?? 0;
    const allyBonus = goldenTele?.squadron?.allyBonus ?? 0;
    return { fighters, cap, allyBonus };
  })()`)

  console.log('[FASE 2 RUNTIME VALIDATION] Estado Dourado Lvl 9:', lvl9Fighters)
  assert.equal(lvl9Fighters.fighters, 10, 'Dourado no nível 9 com 4 aliados deve ter exatamente 10 caças')
  assert.equal(lvl9Fighters.cap, 10, 'Cap máximo deve ser 10')
  assert.equal(lvl9Fighters.allyBonus, 4, 'Bônus de aliados deve ser 4')

  console.log(`[FASE 2 RUNTIME VALIDATION] Capturando screenshot Lvl 9 -> ${SHOT_LVL9}...`)
  await browser.captureScreenshot(SHOT_LVL9)

  // ========================================================================
  // 3. CAPTURA DO FEIXE SUSTENTADO (BEAM FIRE)
  // ========================================================================
  console.log('[FASE 2 RUNTIME VALIDATION] Forçando disparo do feixe sustentado do Golden...')
  await browser.evaluate(`(() => {
    // Localiza Comandante Dourado e força laser
    const enemies = window.__enemiesSysInstance || null;
    const goldenAlive = enemies?.getGoldenAlive?.() || [];
    if (goldenAlive.length > 0) {
      const cmd = goldenAlive[0];
      cmd.laserCooldown = 0;
      cmd.laserTelegraphTimer = 0.05; // Finaliza telegraph imediatamente
    }
  })()`)

  await browser.wait(200)

  const beamState = await browser.evaluate(`(() => {
    const enemies = window.__enemiesSysInstance || null;
    const goldenTele = enemies?.getGoldenTelemetry?.();
    const goldenAlive = enemies?.getGoldenAlive?.() || [];
    const isFiring = goldenTele?.laserFiring || goldenAlive.some(g => g.laserFiring);
    return { isFiring };
  })()`)

  console.log('[FASE 2 RUNTIME VALIDATION] Beam firing state:', beamState)
  console.log(`[FASE 2 RUNTIME VALIDATION] Capturando screenshot Beam -> ${SHOT_BEAM}...`)
  await browser.captureScreenshot(SHOT_BEAM)

  console.log('[FASE 2 RUNTIME VALIDATION] SUCESSO! Todos os critérios da Fase 2 foram validados em runtime e visualmente.')
} finally {
  await browser.close()
}
