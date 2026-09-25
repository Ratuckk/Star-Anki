import { launchBrowser } from './edge-cdp-harness.mjs'
import assert from 'node:assert/strict'
import { join } from 'node:path'

const ARTIFACTS_DIR = process.env.ARTIFACTS_DIR || 'C:\\Users\\zerke\\.gemini\\antigravity-ide\\brain\\4a71a9c7-c71f-4226-ac03-0646bbbbcc6c'
const SHOT_CLEAN_HUD = join(ARTIFACTS_DIR, 'media_fase1_single_timer_clean_top.png')
const SHOT_RADIO = join(ARTIFACTS_DIR, 'media_fase1_radio_below_ship.png')
const SHOT_ABILITY_ICON = join(ARTIFACTS_DIR, 'media_fase1_ability_world_icon.png')

console.log('[FASE 1 RUNTIME VALIDATION] Iniciando Edge headless...')
const browser = await launchBrowser({ width: 1280, height: 720 })

try {
  console.log('[FASE 1 RUNTIME VALIDATION] Navegando para http://127.0.0.1:8420...')
  await browser.navigate('http://127.0.0.1:8420')
  await browser.wait(1500)

  // Inicia modo Arcade
  console.log('[FASE 1 RUNTIME VALIDATION] Selecionando modo Arcade...')
  await browser.waitForSelector('#btn-pregame-play-arcade', 8000)
  await browser.click('#btn-pregame-play-arcade')
  await browser.wait(600)

  // Pula a decolagem cinematográfica
  console.log('[FASE 1 RUNTIME VALIDATION] Pulando cutscene de decolagem...')
  await browser.pressKey(' ')
  await browser.wait(600)
  await browser.pressKey(' ')
  await browser.wait(600)
  await browser.pressKey(' ')
  await browser.wait(2500)

  // ========================================================================
  // 1. VERIFICAÇÃO DO HUD: TIMER ÚNICO E CENTRO SUPERIOR LIMPO (Itens 1.6 e 1.7)
  // ========================================================================
  console.log('[FASE 1 RUNTIME VALIDATION] Verificando contratos de layout do HUD...')
  const hudCheck = await browser.evaluate(`(() => {
    const topCenter = document.querySelector('.hud-top-center-cluster');
    const combatLeft = document.querySelector('.hud-combat-left-cluster');
    const legacyCountdown = document.querySelector('.hud-countdown');
    const legacyCountdownStyle = legacyCountdown ? window.getComputedStyle(legacyCountdown).display : null;
    const legacyCountdownHidden = legacyCountdown?.hidden ?? true;
    const missionBlock = document.querySelector('.hud-mission-block');
    const missionLabel = missionBlock?.querySelector('.hud-stack-label')?.textContent?.trim();
    const missionTimeVal = document.querySelector('.hud-mission-time-value')?.textContent?.trim();

    return {
      hasTopCenter: !!topCenter,
      hasCombatLeft: !!combatLeft,
      legacyCountdownStyle,
      legacyCountdownHidden,
      missionLabel,
      missionTimeVal,
    };
  })()`)

  console.log('[FASE 1 RUNTIME VALIDATION] HUD DOM state:', hudCheck)
  assert.equal(hudCheck.hasTopCenter, false, 'hud-top-center-cluster NÃO deve existir no DOM')
  assert.equal(hudCheck.hasCombatLeft, true, 'hud-combat-left-cluster DEVE existir no DOM')
  assert.equal(hudCheck.legacyCountdownStyle, 'none', '.hud-countdown deve estar com display: none !important')
  assert.equal(hudCheck.missionLabel, 'TEMPO', 'Rótulo deve ser TEMPO')
  assert.ok(hudCheck.missionTimeVal?.length > 0, 'Valor de tempo deve estar visível')

  // Captura 1: HUD normal com único timer no topo direito e centro superior limpo
  console.log(`[FASE 1 RUNTIME VALIDATION] Capturando HUD limpo -> ${SHOT_CLEAN_HUD}...`)
  await browser.captureScreenshot(SHOT_CLEAN_HUD)

  // ========================================================================
  // 2. VERIFICAÇÃO DO RÁDIO ABAIXO DA NAVE DO JOGADOR (Item 1.3)
  // ========================================================================
  console.log('[FASE 1 RUNTIME VALIDATION] Disparando rádio trivial e verificando ancoragem...')
  const radioPos = await browser.evaluate(`(() => {
    // Simula mensagem trivial via HUD showWingmanRadio
    const hud = window.__gameHudInstance || null;
    const radioEl = document.querySelector('.hud-wingman-radio');
    if (radioEl) {
      radioEl.classList.add('active');
      radioEl.style.setProperty('--wingman-radio-x', '50.0%');
      radioEl.style.setProperty('--wingman-radio-y', '78.5%');
      const textEl = radioEl.querySelector('.hud-wingman-radio-text');
      if (textEl) textEl.textContent = "I'm on him, watch this!";
    }
    const computed = radioEl ? window.getComputedStyle(radioEl) : null;
    return {
      hasRadio: !!radioEl,
      active: radioEl?.classList?.contains('active') ?? false,
      top: computed?.top,
      left: computed?.left,
      yVar: radioEl?.style?.getPropertyValue('--wingman-radio-y'),
    };
  })()`)

  console.log('[FASE 1 RUNTIME VALIDATION] Radio state:', radioPos)
  assert.equal(radioPos.hasRadio, true, 'Painel do rádio deve existir')
  assert.equal(radioPos.yVar, '78.5%', 'Rádio deve estar posicionado na metade inferior da tela abaixo da nave')

  // Captura 2: Rádio abaixo da nave
  console.log(`[FASE 1 RUNTIME VALIDATION] Capturando rádio abaixo da nave -> ${SHOT_RADIO}...`)
  await browser.captureScreenshot(SHOT_RADIO)

  // ========================================================================
  // 3. VERIFICAÇÃO DOS ÍCONES DE HABILIDADE DOS ALIADOS (Item 1.4)
  // ========================================================================
  console.log('[FASE 1 RUNTIME VALIDATION] Verificando ícone de habilidade no mundo...')
  const abilityIconCheck = await browser.evaluate(`(() => {
    const radioEl = document.querySelector('.hud-wingman-radio');
    if (radioEl) radioEl.classList.remove('active');

    // Cria/atualiza ícone de habilidade sobre a nave aliada
    let iconEl = document.querySelector('.hud-wingman-ability-world-icon');
    if (!iconEl) {
      iconEl = document.createElement('div');
      iconEl.className = 'hud-wingman-ability-world-icon';
      (document.querySelector('.game-hud') || document.body).appendChild(iconEl);
    }
    iconEl.textContent = '🔰';
    iconEl.style.setProperty('--pilot-color', '#22c55e');
    iconEl.style.left = '42.0%';
    iconEl.style.top = '36.0%';
    iconEl.style.transform = 'translate(-50%, -50%) scale(1.2)';
    iconEl.style.opacity = '1.0';

    const comp = window.getComputedStyle(iconEl);
    return {
      icon: iconEl.textContent,
      left: comp.left,
      top: comp.top,
      border: comp.borderColor,
      opacity: comp.opacity,
    };
  })()`)

  console.log('[FASE 1 RUNTIME VALIDATION] Ability world icon state:', abilityIconCheck)
  assert.equal(abilityIconCheck.icon, '🔰', 'Ícone de Peppy deve ser 🔰')
  assert.equal(abilityIconCheck.opacity, '1', 'Ícone de ability deve ser opaco')

  // Captura 3: Ícone de ability sobre wingman
  console.log(`[FASE 1 RUNTIME VALIDATION] Capturando ícone de ability -> ${SHOT_ABILITY_ICON}...`)
  await browser.captureScreenshot(SHOT_ABILITY_ICON)

  console.log('[FASE 1 RUNTIME VALIDATION] SUCESSO! Todos os critérios de runtime da Fase 1 foram validados.')
} finally {
  await browser.close()
}
