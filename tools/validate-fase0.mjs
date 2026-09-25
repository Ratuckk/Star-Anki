import { launchBrowser } from './edge-cdp-harness.mjs'
import assert from 'node:assert/strict'
import { join } from 'node:path'

const ARTIFACTS_DIR = process.env.ARTIFACTS_DIR || 'C:\\Users\\zerke\\.gemini\\antigravity-ide\\brain\\4a71a9c7-c71f-4226-ac03-0646bbbbcc6c'
const SCREENSHOT_PATH = join(ARTIFACTS_DIR, 'media_fase0_debug_difficulty.png')

console.log('[FASE 0 RUNTIME VALIDATION] Iniciando Edge headless...')
const browser = await launchBrowser({ width: 1280, height: 720 })

try {
  console.log('[FASE 0 RUNTIME VALIDATION] Navegando para http://127.0.0.1:8420...')
  await browser.navigate('http://127.0.0.1:8420')
  await browser.wait(1500)

  // Inicia modo Arcade
  console.log('[FASE 0 RUNTIME VALIDATION] Selecionando modo Arcade...')
  try {
    await browser.waitForSelector('#btn-pregame-play-arcade', 8000)
  } catch (e) {
    console.error('Console messages:', browser.consoleMessages)
    console.error('Page errors:', browser.pageErrors)
    const html = await browser.evaluate('document.body.innerHTML')
    console.error('Body HTML preview:', html.slice(0, 500))
    throw e
  }
  await browser.click('#btn-pregame-play-arcade')
  console.log('[FASE 0 RUNTIME VALIDATION] Aguardando tela de jogo e pulando decolagem...')
  await browser.wait(500)
  // Pressiona Espaço para pular a decolagem
  await browser.pressKey(' ')
  await browser.wait(800)
  await browser.pressKey(' ')
  await browser.wait(800)

  // Abre o painel de debug
  console.log('[FASE 0 RUNTIME VALIDATION] Abrindo painel de Debug...')
  await browser.evaluate(`(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '\\\\', code: 'Backslash' }));
  })()`)
  await browser.wait(1000)

  // Verifica estado inicial do nível no HUD
  const initialHud = await browser.evaluate(`(() => {
    const levelVal = document.querySelector('.hud-level-value')?.textContent?.trim();
    const levelBlock = document.querySelector('.hud-level-block');
    const isOverride = levelBlock?.classList?.contains('debug-override') ?? false;
    const label = levelBlock?.querySelector('.hud-stack-label')?.textContent?.trim();
    const score = document.querySelector('.hud-score-value')?.textContent?.trim();
    return { levelVal, isOverride, label, score };
  })()`)

  console.log('[FASE 0 RUNTIME VALIDATION] Estado inicial HUD:', initialHud)
  assert.equal(initialHud.levelVal, '01', 'Nível inicial deve ser 01')
  assert.equal(initialHud.isOverride, false, 'Inicialmente sem override')
  assert.equal(initialHud.label, 'NÍVEL', 'Label deve ser NÍVEL')

  // Clica no botão "+ Nível de dificuldade" 3 vezes
  console.log('[FASE 0 RUNTIME VALIDATION] Clicando 3x em "+ Nível de dificuldade"...')
  for (let i = 0; i < 3; i++) {
    const clicked = await browser.evaluate(`(() => {
      const btns = Array.from(document.querySelectorAll('.debug-action-btn, button'));
      const incBtn = btns.find(b => b.textContent.includes('+ Nível de dificuldade'));
      if (incBtn) { incBtn.click(); return true; }
      return false;
    })()`)
    assert.ok(clicked, 'Botão "+ Nível de dificuldade" deve ser encontrado e clicado')
    await browser.wait(300)
  }

  // Verifica estado após incremento
  const plusHud = await browser.evaluate(`(() => {
    const levelVal = document.querySelector('.hud-level-value')?.textContent?.trim();
    const levelBlock = document.querySelector('.hud-level-block');
    const isOverride = levelBlock?.classList?.contains('debug-override') ?? false;
    const label = levelBlock?.querySelector('.hud-stack-label')?.textContent?.trim();
    const score = document.querySelector('.hud-score-value')?.textContent?.trim();
    return { levelVal, isOverride, label, score };
  })()`)

  console.log('[FASE 0 RUNTIME VALIDATION] Estado após 3x [+]:', plusHud)
  assert.equal(plusHud.levelVal, '04', 'Nível deve ser 04')
  assert.equal(plusHud.isOverride, true, 'Deve ter classe debug-override')
  assert.equal(plusHud.label, 'NÍVEL [DBG]', 'Label deve refletir [DBG]')
  assert.equal(plusHud.score, initialHud.score, 'Score não deve ser alterado')

  // Clica no botão "- Nível de dificuldade" 1 vez
  console.log('[FASE 0 RUNTIME VALIDATION] Clicando 1x em "- Nível de dificuldade"...')
  const clickedDec = await browser.evaluate(`(() => {
    const btns = Array.from(document.querySelectorAll('.debug-action-btn, button'));
    const decBtn = btns.find(b => b.textContent.includes('- Nível de dificuldade'));
    if (decBtn) { decBtn.click(); return true; }
    return false;
  })()`)
  assert.ok(clickedDec, 'Botão "- Nível de dificuldade" deve ser encontrado e clicado')
  await browser.wait(300)

  // Verifica estado após decremento
  const minusHud = await browser.evaluate(`(() => {
    const levelVal = document.querySelector('.hud-level-value')?.textContent?.trim();
    const levelBlock = document.querySelector('.hud-level-block');
    const isOverride = levelBlock?.classList?.contains('debug-override') ?? false;
    const label = levelBlock?.querySelector('.hud-stack-label')?.textContent?.trim();
    const score = document.querySelector('.hud-score-value')?.textContent?.trim();
    return { levelVal, isOverride, label, score };
  })()`)

  console.log('[FASE 0 RUNTIME VALIDATION] Estado após 1x [-]:', minusHud)
  assert.equal(minusHud.levelVal, '03', 'Nível deve ser 03')
  assert.equal(minusHud.isOverride, true, 'Deve ter classe debug-override')
  assert.equal(minusHud.label, 'NÍVEL [DBG]', 'Label deve refletir [DBG]')
  assert.equal(minusHud.score, initialHud.score, 'Score não deve ser alterado')

  // Captura screenshot
  console.log('[FASE 0 RUNTIME VALIDATION] Capturando screenshot de runtime...')
  await browser.captureScreenshot(SCREENSHOT_PATH)
  console.log(`[FASE 0 RUNTIME VALIDATION] Screenshot gravada em: ${SCREENSHOT_PATH}`)

  // Verifica se houve erros no console
  const errors = browser.pageErrors
  console.log(`[FASE 0 RUNTIME VALIDATION] Page errors: ${errors.length}`)
  if (errors.length > 0) {
    console.warn('Errors detectados:', errors)
  }

  console.log('=== FASE 0 VALIDADA COM SUCESSO EM RUNTIME E VISUALMENTE ===')
} finally {
  await browser.close()
}
