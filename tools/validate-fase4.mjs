import { launchBrowser } from './edge-cdp-harness.mjs'
import assert from 'node:assert/strict'
import { join } from 'node:path'

const ARTIFACTS_DIR = process.env.ARTIFACTS_DIR || 'C:\\Users\\zerke\\.gemini\\antigravity-ide\\brain\\4a71a9c7-c71f-4226-ac03-0646bbbbcc6c'
const SHOT_SUSSURRO = join(ARTIFACTS_DIR, 'media_fase4_sussurro_cloaked.png')
const SHOT_REPLICA = join(ARTIFACTS_DIR, 'media_fase4_replica_firing.png')

console.log('[FASE 4 RUNTIME VALIDATION] Iniciando Edge headless...')
const browser = await launchBrowser({ width: 1280, height: 720 })

try {
  console.log('[FASE 4 RUNTIME VALIDATION] Navegando para http://127.0.0.1:8420...')
  await browser.navigate('http://127.0.0.1:8420')
  await browser.wait(1500)

  // Inicia modo Arcade
  console.log('[FASE 4 RUNTIME VALIDATION] Selecionando modo Arcade...')
  await browser.waitForSelector('#btn-pregame-play-arcade', 8000)
  await browser.click('#btn-pregame-play-arcade')
  await browser.wait(600)

  // Pula a decolagem
  console.log('[FASE 4 RUNTIME VALIDATION] Pulando cutscene de decolagem...')
  await browser.pressKey(' ')
  await browser.wait(600)
  await browser.pressKey(' ')
  await browser.wait(600)
  await browser.pressKey(' ')
  await browser.wait(2000)

  // Abre o painel de debug
  console.log('[FASE 4 RUNTIME VALIDATION] Abrindo painel de Debug...')
  await browser.evaluate(`(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '\\\\', code: 'Backslash' }));
  })()`)
  await browser.wait(800)

  // ========================================================================
  // 1. SUSSURRO: CLOAK VISÍVEL CONTRA ESPAÇO PRETO E FOG, SILHUETA ASSIMÉTRICA
  // ========================================================================
  console.log('[FASE 4 RUNTIME VALIDATION] Isolando e spawnando Sussurro novo...')
  const sussurroData = await browser.evaluate(`(() => {
    const combat = window.__combatInstance || null;
    combat?.clearAllCombatants?.();
    const sussurro = combat?.spawnSussurro?.();
    if (!sussurro) return { error: 'Sussurro not spawned' };

    return {
      kind: sussurro.kind,
      hp: sussurro.hp,
      hitRadius: sussurro.hitRadius,
      state: sussurro.state,
      opacity: sussurro.hullMat?.opacity || 0,
      hasCore: !!sussurro.coreMesh,
      hasRim: !!sussurro.rimMesh,
      childrenCount: sussurro.visualGroup?.children?.length || 0,
    };
  })()`)

  console.log('[FASE 4 RUNTIME VALIDATION] Dados do Sussurro:', sussurroData)
  assert.equal(sussurroData.kind, 'sussurro')
  assert.ok(sussurroData.hasCore, 'Sussurro deve ter núcleo interno')
  assert.ok(sussurroData.hasRim, 'Sussurro deve ter rim de distorção')
  assert.ok(sussurroData.childrenCount >= 4, 'Sussurro deve ter múltiplos componentes assimétricos')
  assert.ok(sussurroData.opacity >= 0.22, `Opacidade no cloak nunca deve sumir (foi ${sussurroData.opacity})`)

  // Aguarda 1.0s para aproximação em cloak
  await browser.wait(1000)
  console.log(`[FASE 4 RUNTIME VALIDATION] Capturando screenshot Sussurro cloaked -> ${SHOT_SUSSURRO}...`)
  await browser.captureScreenshot(SHOT_SUSSURRO)

  // ========================================================================
  // 2. RÉPLICA: CÓPIA CORROMPIDA, FUSELAGEM, ASAS, MOTORES, RAJADA DE 3 TIROS
  // ========================================================================
  console.log('[FASE 4 RUNTIME VALIDATION] Limpando e spawnando Réplica nova...')
  const replicaData = await browser.evaluate(`(() => {
    const combat = window.__combatInstance || null;
    combat?.clearAllCombatants?.();
    const replica = combat?.spawnReplica?.();
    if (!replica) return { error: 'Replica not spawned' };

    // Posiciona próximo e adianta o fireTimer para entrar rapidamente em telegraph/disparo
    replica.fireTimer = 0.4;

    return {
      kind: replica.kind,
      hp: replica.hp,
      hitRadius: replica.hitRadius,
      hasEcho: !!replica.echoGroup,
      fireTimerFinite: Number.isFinite(replica.fireTimer),
      childrenCount: replica.visualGroup?.children?.length || 0,
    };
  })()`)

  console.log('[FASE 4 RUNTIME VALIDATION] Dados da Réplica:', replicaData)
  assert.equal(replicaData.kind, 'replica')
  assert.ok(replicaData.hasEcho, 'Réplica deve possuir grupo de eco/glitch duplicado')
  assert.ok(replicaData.fireTimerFinite, 'Fire timer deve ser finito')
  assert.ok(replicaData.childrenCount >= 4, 'Réplica deve ter fuselagem, asas, motores e canhões')

  // Aguarda 800ms para telegraph e início da rajada de disparos
  await browser.wait(800)
  console.log(`[FASE 4 RUNTIME VALIDATION] Capturando screenshot Réplica disparando -> ${SHOT_REPLICA}...`)
  await browser.captureScreenshot(SHOT_REPLICA)

  console.log('[FASE 4 RUNTIME VALIDATION] Sucesso completo em todos os contratos de runtime!')
} catch (err) {
  console.error('[FASE 4 RUNTIME VALIDATION] Erro fatal:', err)
  process.exitCode = 1
} finally {
  await browser.close()
}
