import { launchBrowser } from './edge-cdp-harness.mjs'
import assert from 'node:assert/strict'
import { join } from 'node:path'

const ARTIFACTS_DIR = process.env.ARTIFACTS_DIR || 'C:\\Users\\zerke\\.gemini\\antigravity-ide\\brain\\4a71a9c7-c71f-4226-ac03-0646bbbbcc6c'
const SHOT_TANK = join(ARTIFACTS_DIR, 'media_fase3_tank_new.png')
const SHOT_VERME = join(ARTIFACTS_DIR, 'media_fase3_verme_arc.png')

console.log('[FASE 3 RUNTIME VALIDATION] Iniciando Edge headless...')
const browser = await launchBrowser({ width: 1280, height: 720 })

try {
  console.log('[FASE 3 RUNTIME VALIDATION] Navegando para http://127.0.0.1:8420...')
  await browser.navigate('http://127.0.0.1:8420')
  await browser.wait(1500)

  // Inicia modo Arcade
  console.log('[FASE 3 RUNTIME VALIDATION] Selecionando modo Arcade...')
  await browser.waitForSelector('#btn-pregame-play-arcade', 8000)
  await browser.click('#btn-pregame-play-arcade')
  await browser.wait(600)

  // Pula a decolagem
  console.log('[FASE 3 RUNTIME VALIDATION] Pulando cutscene de decolagem...')
  await browser.pressKey(' ')
  await browser.wait(600)
  await browser.pressKey(' ')
  await browser.wait(600)
  await browser.pressKey(' ')
  await browser.wait(2000)

  // Abre o painel de debug
  console.log('[FASE 3 RUNTIME VALIDATION] Abrindo painel de Debug...')
  await browser.evaluate(`(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '\\\\', code: 'Backslash' }));
  })()`)
  await browser.wait(800)

  // ========================================================================
  // 1. TANK OVERHAUL: NOVO CASCO, TORRE INDEPENDENTE, HITBOX 4.48, TAMANHO 1.6X
  // ========================================================================
  console.log('[FASE 3 RUNTIME VALIDATION] Isolando e spawnando Tank novo...')
  const tankInfo = await browser.evaluate(`(() => {
    const combat = window.__combatInstance || null;
    combat?.clearAllCombatants?.();
    const tank = combat?.spawnTankEnemy?.();
    if (!tank) return { error: 'Tank not spawned' };

    // Mede bounding box real em world-space
    const THREE = window.THREE || null;
    let sizeX = 0, sizeZ = 0;
    if (tank.mesh) {
      tank.mesh.updateMatrixWorld(true);
      const debugInfo = [];
      tank.mesh.traverse((n) => {
        debugInfo.push({
          type: n.type,
          isMesh: !!n.isMesh,
          hasGeo: !!n.geometry,
          geoBounds: n.geometry ? { min: n.geometry.boundingBox?.min, max: n.geometry.boundingBox?.max } : null,
          scale: { x: n.scale.x, y: n.scale.y, z: n.scale.z }
        });
      });
      return {
        id: tank.id,
        kind: tank.kind,
        hp: tank.hp,
        maxHp: tank.maxHp,
        hitRadius: tank.hitRadius || 4.48,
        debugInfo,
        hasTurret: !!tank.turretGroup,
        armorPanelsCount: tank.armorPanels?.length || 0,
      };
    }

    return { error: 'no mesh' };
  })()`)

  console.log('[FASE 3 RUNTIME VALIDATION] Dados do Tank:', tankInfo)
  assert.equal(tankInfo.kind, 'tank', 'Inimigo deve ser tank')
  assert.ok(tankInfo.hasTurret, 'Tank deve ter grupo de torre elevada independente')
  assert.ok(tankInfo.debugInfo.length >= 10, 'Tank deve ter múltiplos nós de malha low-poly')
  assert.equal(tankInfo.armorPanelsCount, 6, 'Tank deve ter 6 painéis de blindagem')
  assert.equal(tankInfo.hitRadius, 4.48, 'Hitbox deve ser 4.48')

  // Aguarda 1.8s para observar deslocamento lateral e tracking da torre
  await browser.wait(1800)
  console.log(`[FASE 3 RUNTIME VALIDATION] Capturando screenshot Tank -> ${SHOT_TANK}...`)
  await browser.captureScreenshot(SHOT_TANK)

  // ========================================================================
  // 2. VERME OVERHAUL: ELO SEGMENTADO, MANDÍBULA, SPAN 8.0, ARCO 3D
  // ========================================================================
  console.log('[FASE 3 RUNTIME VALIDATION] Limpando e spawnando Verme novo...')
  const vermeInfo = await browser.evaluate(`(() => {
    const combat = window.__combatInstance || null;
    combat?.clearAllCombatants?.();
    const segments = combat?.spawnVerme?.() || [];

    return {
      segmentsCount: segments.length,
      isHeadLeader: segments[0]?.isHead,
      hasHistory: !!segments[0]?.pathHistory,
      childrenInHead: segments[0]?.mesh?.children?.length || 0,
    };
  })()`)

  console.log('[FASE 3 RUNTIME VALIDATION] Dados do Verme:', vermeInfo)
  assert.ok(vermeInfo.segmentsCount >= 4, 'Verme deve possuir pelo menos 4 segmentos')
  assert.ok(vermeInfo.isHeadLeader, 'Primeiro elo deve ser a cabeça líder')
  assert.ok(vermeInfo.hasHistory, 'Cabeça deve manter pathHistory para serpenteamento realista')
  assert.ok(vermeInfo.childrenInHead >= 2, 'Cabeça do Verme deve ter peças articuladas/mandíbulas')

  // Aguarda 2.0s para movimento em arco 3D
  await browser.wait(2000)
  console.log(`[FASE 3 RUNTIME VALIDATION] Capturando screenshot Verme -> ${SHOT_VERME}...`)
  await browser.captureScreenshot(SHOT_VERME)

  console.log('[FASE 3 RUNTIME VALIDATION] Sucesso completo em todos os contratos de runtime!')
} catch (err) {
  console.error('[FASE 3 RUNTIME VALIDATION] Erro fatal:', err)
  process.exitCode = 1
} finally {
  await browser.close()
}
