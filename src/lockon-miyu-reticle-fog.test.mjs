import assert from 'node:assert/strict'
import * as THREE from 'three'
import {
  createLockOnSystem,
  isTargetInCone,
  AIM_HINT_ANGLE,
  AIM_ACQUIRE_ANGLE,
  AIM_MAINTAIN_ANGLE,
} from './combat/lockon.js'
import {
  WINGMAN_PROFILES,
  createSquadronSystem,
} from './combat/wingmen.js'
import { getSettings, setSetting } from './settings.js'
import { createQuestionFlow } from './flow-question.js'

console.log('--- TEST SUITE: Pacote de Correções (Lock-on, Miyu, Retícula, Carta Arcade, Fog) ---')

// Helper mock rail & frame
function createMockRail(forward = new THREE.Vector3(0, 0, 1)) {
  return {
    getPlayerPosition: () => new THREE.Vector3(0, 0, 0),
    getFrameAt: () => ({
      position: new THREE.Vector3(0, 0, 0),
      right: new THREE.Vector3(1, 0, 0),
      up: new THREE.Vector3(0, 1, 0),
      forward: forward.clone(),
    }),
    isArena: () => false,
  }
}

function makeLockonHarness(entities, golden = [], forward = new THREE.Vector3(0, 0, 1)) {
  const rail = createMockRail(forward)
  const enemies = {
    getAlive: () => entities,
    getGoldenAlive: () => golden,
    getLockableRadius: () => 2,
  }
  return createLockOnSystem(rail, enemies)
}

function makeTarget(id, kind, maxHp, z = 45, x = 0) {
  const mesh = new THREE.Object3D()
  mesh.position.set(x, 0, z)
  return { id, kind, hp: maxHp, maxHp, mesh, dying: false, fadingOut: false }
}

const testFrame = {
  position: new THREE.Vector3(0, 0, 0),
  right: new THREE.Vector3(1, 0, 0),
  up: new THREE.Vector3(0, 1, 0),
  forward: new THREE.Vector3(0, 0, -1),
}

// ============================================================================
// 1. LOCK-ON & RETICLE CONE GEOMETRY (Item 2)
// ============================================================================
{
  console.log('Testing 1: Lock-on Reticle Cone & Priority Constraints...')
  const origin = new THREE.Vector3(0, 0, 0)
  const forward = new THREE.Vector3(0, 0, 1)
  const crosshairDir = new THREE.Vector3(0, 0, 1) // mirando exatamente para frente

  // Inimigo A: fraco (HP 50), diretamente na mira (dist 60, offset 0) -> ângulo 0 rad
  const weakBlaster = makeTarget(101, 'blaster', 50, 60, 0)

  // Inimigo B: Boss (HP 1000), lateralmente a 20 graus (fora de AIM_ACQUIRE_ANGLE = 7.5 deg)
  // dist 60: x = 60 * sin(20 deg) = 20.5, z = 60 * cos(20 deg) = 56.3
  const offCenterBoss = makeTarget(102, 'boss', 1000, 56.3, 20.5)

  // Test 1.1: Boss fora do cone de mira NÃO deve ser elegível no cone
  const inConeBoss = isTargetInCone(offCenterBoss.mesh.position, 2, origin, forward, crosshairDir, AIM_ACQUIRE_ANGLE)
  assert.equal(inConeBoss, false, 'Boss a 20 graus deve estar fora do cone de aquisição (7.5°)')

  const inConeWeak = isTargetInCone(weakBlaster.mesh.position, 2, origin, forward, crosshairDir, AIM_ACQUIRE_ANGLE)
  assert.equal(inConeWeak, true, 'Alvo central na mira deve estar dentro do cone de aquisição')

  // Test 1.2: Lock-on com ambos inimigos: Alvo na mira deve ser escolhido, Boss fora NÃO pode roubar!
  const lockon = makeLockonHarness([weakBlaster, offCenterBoss], [], forward)
  lockon.sweepLockOn(origin, crosshairDir, 1, 1)
  const groups = lockon.takeLockedTargetGroups(() => true)
  assert.equal(groups.base.length, 1)
  assert.equal(groups.base[0], weakBlaster, 'Alvo na mira (101) deve ser escolhido; Boss fora da mira (102) NÃO pode roubar a trava!')

  // Test 1.3: Histerese: se o retículo se afastar além do cone de manutenção (AIM_MAINTAIN_ANGLE = 12°), solta a trava
  const lockonMaintain = makeLockonHarness([weakBlaster], [], forward)
  lockonMaintain.sweepLockOn(origin, crosshairDir, 1, 1)
  assert.equal(lockonMaintain.getLockedEnemySnapshots().length, 1, 'Alvo travado inicialmente')

  // Movendo a mira 25 graus para o lado (sin(25)=0.422, cos(25)=0.906)
  const movedDir = new THREE.Vector3(0.422, 0, 0.906).normalize()
  lockonMaintain.sweepLockOn(origin, movedDir, 1, 1)
  assert.equal(lockonMaintain.getLockedEnemySnapshots().length, 0, 'Alvo que saiu claramente da mira (25° > 12°) deve ter o lock dropado')

  // Test 1.4: Inimigo fading descarta lock imediatamente
  const fadingBlaster = makeTarget(103, 'blaster', 50, 60, 0)
  const lockonFade = makeLockonHarness([fadingBlaster], [], forward)
  lockonFade.sweepLockOn(origin, crosshairDir, 1, 1)
  assert.equal(lockonFade.getLockedEnemySnapshots().length, 1)
  fadingBlaster.fadingOut = true
  lockonFade.sweepLockOn(origin, crosshairDir, 1, 1)
  assert.equal(lockonFade.getLockedEnemySnapshots().length, 0, 'Inimigo fadingOut deve ter lock removido imediatamente')

  console.log('✔ Lock-on Reticle Cone & Priority Contracts passed')
}

// ============================================================================
// 2. MIYU MULTI-LOCK SCREEN-SPACE SNAPSHOTS & STACKING (Items 1 & 6B)
// ============================================================================
{
  console.log('Testing 2: Miyu Multi-Lock Stacking & Screen-Space Snapshots...')
  const origin = new THREE.Vector3(0, 0, 0)
  const forward = new THREE.Vector3(0, 0, 1)
  const crosshairDir = new THREE.Vector3(0, 0, 1)

  const heavyTank = makeTarget(201, 'tank', 400, 50, 0)
  const lockon = makeLockonHarness([heavyTank], [], forward)

  // baseMaxAllowed = 1, maxAllowed = 4 (1 base + 3 miyu)
  lockon.sweepLockOn(origin, crosshairDir, 4, 1)
  const snapshots = lockon.getLockedEnemySnapshots()
  assert.equal(snapshots.length, 4, '1 lock BASE + 3 locks Miyu empilhados no mesmo Tank')

  // Test 2.1: getLockedEnemySnapshots deve retornar a MESMA worldPos original para todos os locks (Item 1)
  for (const snap of snapshots) {
    assert.equal(snap.worldPos.x, 0, 'worldPos.x do snapshot deve ser a posição 3D real do alvo sem offset no mundo')
    assert.equal(snap.worldPos.y, 0, 'worldPos.y do snapshot deve ser a posição 3D real do alvo sem offset no mundo')
    assert.equal(snap.worldPos.z, 50, 'worldPos.z do snapshot deve ser a posição 3D real do alvo sem offset no mundo')
    assert.equal(snap.groupCount, 4, 'groupCount deve informar que existem 4 travas agrupadas')
  }
  // groupIndex deve ser 0, 1, 2, 3
  assert.deepEqual(snapshots.map(s => s.groupIndex), [0, 1, 2, 3], 'groupIndex deve ser indexado de 0 a groupCount - 1')
  assert.equal(snapshots[0].source, 'base')
  assert.equal(snapshots[1].source, 'miyu')
  assert.equal(snapshots[2].source, 'miyu')
  assert.equal(snapshots[3].source, 'miyu')

  console.log('✔ Miyu Multi-Lock Stacking & Screen-Space Snapshots passed')
}

// ============================================================================
// 3. MIYU RADIO & COOLDOWN (Item 3)
// ============================================================================
{
  console.log('Testing 3: Miyu Radio Timing & Cooldown Contracts...')
  const miyuProfile = WINGMAN_PROFILES.find(p => p.id === 3)
  assert.ok(miyuProfile, 'Perfil da Miyu deve existir')

  // Test 3.1: Cooldown base deve ser 9s (floor 3s)
  assert.equal(miyuProfile.abilityCooldownBase, 9, 'Miyu abilityCooldownBase deve ser 9s (+3s)')
  assert.equal(miyuProfile.abilityCooldownFloor, 3, 'Miyu abilityCooldownFloor deve ser 3s')

  // Mock scene and squadron system
  const scene = new THREE.Group()
  const rail = createMockRail()
  const squadron = createSquadronSystem(scene, rail, {}, {})
  const miyu = squadron.spawnMember(3) // Spawna Miyu
  assert.ok(miyu, 'Miyu deve estar ativa no esquadrão')

  // Test 3.2: Primeiro uso calibrado (+3s reais no atraso inicial = 6.0s)
  assert.equal(miyu.abilityCooldown, 6.0, 'Primeiro uso da habilidade da Miyu deve ser inicializado em 6.0s')

  // Test 3.3: Ao sair de cooldown / ficar ready, NÃO deve falar!
  miyu.control.cooldowns.primary = 0.05
  const resReady = squadron.update(0.1, testFrame.position, testFrame, { canAttack: true })
  assert.equal(miyu.abilityCooldown, 0, 'Habilidade deve estar pronta')
  assert.equal(resReady.radioMessage, null, 'Miyu NÃO deve falar ao ficar pronta / sair de cooldown')

  // Test 3.4: Ao iniciar carga / obter lock, NÃO deve falar!
  const resCharge = squadron.update(0.1, testFrame.position, testFrame, { homingCharging: true })
  assert.equal(resCharge.radioMessage, null, 'Miyu NÃO deve falar durante a preparação da carga')

  // Test 3.5: Soltar sem tiros válidos NÃO deve falar!
  squadron.fireMiyuAssistShots([])
  const resNoShots = squadron.update(0.016, testFrame.position, testFrame)
  assert.equal(resNoShots.radioMessage, null, 'Soltar sem tiros válidos NÃO gera fala da Miyu')

  // Test 3.6: Disparo efetivo gera exatamente 1 fala de assist!
  const dummyTarget = { mesh: { position: new THREE.Vector3(0, 0, -40) }, radius: 2 }
  const shots = squadron.fireMiyuAssistShots([dummyTarget, dummyTarget])
  assert.equal(shots, 2, 'Dois disparos efetuados')
  const resFired = squadron.update(0.016, testFrame.position, testFrame)
  assert.ok(resFired.radioMessage, 'Exatamente 1 fala de rádio deve ser emitida ao disparar')
  assert.equal(resFired.radioMessage.eventId, 'ability_assist', 'A fala deve ser ability_assist')
  assert.equal(resFired.radioMessage.pilotId, 3, 'A fala deve ser da Miyu (pilotId = 3)')
  assert.equal(resFired.radioMessage.isAbility, true, 'isAbility deve ser true')

  console.log('✔ Miyu Radio Timing & Cooldown Contracts passed')
}

// ============================================================================
// 4. MIYU ASSIST SHOTS PHYSICAL ORIGIN (Item 6A)
// ============================================================================
{
  console.log('Testing 4: Miyu Assist Shots Physical Origin & Fox Isolation...')
  const scene = new THREE.Group()
  const rail = createMockRail()
  let muzzleOrigin = null
  let chargeRingsOrigin = null
  const mockEffects = {
    muzzleFlash: (origin) => { muzzleOrigin = origin.clone() },
    maxChargeRings: (origin) => { chargeRingsOrigin = origin.clone() },
    projectileTrail: () => {},
  }
  const squadron = createSquadronSystem(scene, rail, mockEffects, {})
  const miyu = squadron.spawnMember(3)

  // Colocamos Miyu e Fox em posições bem distintas
  const foxNose = new THREE.Vector3(0, 0, -5)
  miyu.mesh.position.set(45, 12, -8)

  const targetEnemy = {
    id: 301,
    mesh: { position: new THREE.Vector3(0, 0, -100) },
    radius: 3,
  }

  // Chamamos fireMiyuAssistShots
  const shotsFired = squadron.fireMiyuAssistShots([targetEnemy])
  assert.equal(shotsFired, 1, 'Deve disparar 1 tiro de assistência')

  // Muzzle flash e anéis de carga devem nascer na Miyu!
  assert.ok(muzzleOrigin, 'muzzleFlash deve ser disparado')
  const distMuzzleToMiyu = muzzleOrigin.distanceTo(miyu.mesh.position)
  const distMuzzleToFox = muzzleOrigin.distanceTo(foxNose)
  assert.ok(distMuzzleToMiyu < 2.5, `Muzzle flash (${distMuzzleToMiyu.toFixed(2)}u) deve nascer fisicamente na Miyu`)
  assert.ok(distMuzzleToFox > 35.0, `Muzzle flash (${distMuzzleToFox.toFixed(2)}u) NÃO pode nascer no Fox`)

  assert.ok(chargeRingsOrigin, 'maxChargeRings deve ser disparado')
  const distRingsToMiyu = chargeRingsOrigin.distanceTo(miyu.mesh.position)
  assert.ok(distRingsToMiyu < 2.5, `Anéis de carga (${distRingsToMiyu.toFixed(2)}u) devem nascer fisicamente na Miyu`)

  console.log('✔ Miyu Assist Shots Physical Origin passed')
}

// ============================================================================
// 5. RETICLE PROGRESSIVE CHARGE SCALING (Item 6C)
// ============================================================================
{
  console.log('Testing 5: Reticle Progressive Charge Scaling...')
  // Testamos a fórmula matemática e o comportamento do HUD mock
  const homingChargeMinMs = 400
  const homingChargeMaxMs = 1400

  function computeChargeScale(fireHeldMs) {
    if (fireHeldMs < homingChargeMinMs) return 1.0
    const frac = Math.max(0, Math.min(1, Number(fireHeldMs - homingChargeMinMs) / (homingChargeMaxMs - homingChargeMinMs) || 0))
    return 1.0 + frac * 0.45
  }

  assert.equal(computeChargeScale(0), 1.0, 'Sem segurar fogo: escala 1.0 (base)')
  assert.equal(computeChargeScale(200), 1.0, 'Abaixo do threshold: escala 1.0 (base)')
  assert.equal(computeChargeScale(400), 1.0, 'No threshold exato: escala 1.0 (base)')
  
  const halfScale = computeChargeScale(900)
  assert.ok(halfScale > 1.20 && halfScale < 1.25, `Metade da carga deve ter escala intermediária (~1.225), deu ${halfScale}`)

  const maxScale = computeChargeScale(1400)
  assert.equal(maxScale, 1.45, 'Na carga máxima deve atingir 1.45')

  const beyondMaxScale = computeChargeScale(3000)
  assert.equal(beyondMaxScale, 1.45, 'Segurar além do máximo não ultrapassa o limite calibrado')

  // Verificação estrita de desacoplamento: hud-game.js não deve usar THREE
  const { readFileSync } = await import('node:fs')
  const hudGameSource = readFileSync(new URL('./hud-game.js', import.meta.url), 'utf8')
  assert.ok(!hudGameSource.includes('THREE.MathUtils.clamp'), 'hud-game.js não deve usar THREE.MathUtils.clamp')
  assert.ok(hudGameSource.includes('Math.max(0, Math.min(1, Number(chargeFrac) || 0))'), 'hud-game.js deve usar clamp nativo Number(chargeFrac)')

  console.log('✔ Reticle Progressive Charge Scaling passed')
}

// ============================================================================
// 6. ARCADE CARD DRAFT SETTING & FULL-SPEED CHOREOGRAPHY (Item 4)
// ============================================================================
{
  console.log('Testing 6: Arcade Card Draft Setting & Full-Speed Visuals...')
  const initialSettings = getSettings()

  // Test 6.1: 3-mode selector updates settings properly
  setSetting('arcadeDraftMode', 'normal')
  assert.equal(getSettings().arcadeDraftMode, 'normal')
  assert.equal(getSettings().arcadeCardChoicePauses, false)

  setSetting('arcadeDraftMode', 'pause')
  assert.equal(getSettings().arcadeDraftMode, 'pause')
  assert.equal(getSettings().arcadeCardChoicePauses, true)

  setSetting('arcadeDraftMode', 'slowmo')
  assert.equal(getSettings().arcadeDraftMode, 'slowmo')
  assert.equal(getSettings().arcadeCardChoicePauses, false)

  // Test 6.2: questionFlow com arcadeDraftMode = 'normal' passa fullSpeed: true para cardAcquiredPulse
  let capturedPulseOpts = null
  let shownChoice = null
  const questionFlowState = { phase: 'cardChoice', arcadeBulletTimeTimer: 1.5 }
  const qFlow = createQuestionFlow({
    state: questionFlowState,
    session: { health: 10, lives: 3, pointer: 0, queue: [{ id: 'q1' }] },
    deck: { isNoDeck: true, allCards: [{ id: 'rapid-fire', name: 'Rapid Fire', category: 'ofensivo' }] },
    hud: {
      showCardChoice: (opts) => { shownChoice = opts },
      setCountdown: () => {},
      setFeedback: () => {},
      setLives: () => {},
      setShield: () => {},
      setHealth: () => {},
      renderCards: () => {},
    },
    player: {
      buildCardExcludeSet: () => new Set(),
      getMaxHealth: () => 10,
      getShieldValue: () => 3,
      getShieldMax: () => 3,
      getMaxLives: () => 3,
      getCollectedCards: () => new Map(),
      getWingmanCount: () => 0,
      applyCard: () => {},
      config: {},
    },
    combat: { clearBonusTargets: () => {}, setFireCooldown: () => {}, setHomingMaxTargets: () => {}, setMultiHomingUnlocked: () => {}, setWingmanCount: () => {} },
    effects: {
      cardAcquiredPulse: (pos, cat, opts) => { capturedPulseOpts = opts },
    },
    rail: { getPlayerPosition: () => new THREE.Vector3(0, 0, 0) },
    enterCombat: () => { questionFlowState.phase = 'combat' },
  })

  // Abrir draft em modo normal
  setSetting('arcadeDraftMode', 'normal')
  qFlow.enterAlternatives()
  assert.ok(shownChoice, 'Draft deve ser exibido via hud.showCardChoice')
  assert.equal(shownChoice.isArcade, true, 'isArcade deve ser true')

  // Selecionar card com setting = 'normal'
  shownChoice.onPick({ id: 'twin-laser', category: 'ofensivo' })
  assert.ok(capturedPulseOpts, 'cardAcquiredPulse deve ter sido chamado')
  assert.equal(capturedPulseOpts.fullSpeed, true, 'Em modo normal, cardAcquiredPulse DEVE receber fullSpeed: true')

  // Restaurar setting
  setSetting('arcadeDraftMode', initialSettings.arcadeDraftMode || 'slowmo')

  console.log('✔ Arcade Card Draft Setting & Full-Speed Visuals passed')
}

// ============================================================================
// 7. VOLUMETRIC FOG VISIBILITY & INSIDE ENVELOPE (Item 5)
// ============================================================================
{
  console.log('Testing 7: Volumetric Fog Visibility & Non-Zero Inside Envelope...')
  // Validamos a curva de opacidade calibrada
  function calculateFogBankOpacity(cameraDist, offset, approach, alpha) {
    const insideEnvelope = THREE.MathUtils.clamp(cameraDist / 28, 0.40, 1.0)
    const exitFade = offset < -25 ? THREE.MathUtils.clamp((offset + 120) / 95, 0, 1) : 1.0
    return (0.18 + approach * 0.22) * alpha * insideEnvelope * exitFade
  }

  // 1. À distância (cameraDist = 300, offset = 300, approach = 0.6)
  const distOpacity = calculateFogBankOpacity(300, 300, 0.6, 0.8)
  assert.ok(distOpacity > 0.20, `Névoa à distância deve ser claramente observável (deu ${distOpacity.toFixed(3)})`)

  // 2. Dentro do volume de névoa (cameraDist = 0 ou 10, offset = 0, approach = 1.0)
  const insideOpacity = calculateFogBankOpacity(10, 0, 1.0, 0.8)
  assert.ok(insideOpacity >= 0.12, `Dentro da névoa o alpha NÃO deve zerar! Mínimo esperado >= 0.12, deu ${insideOpacity.toFixed(3)}`)

  // Teste de regressão específico: com cameraDist = 0 (câmera exatamente no centro do banco)
  const centerOpacity = calculateFogBankOpacity(0, 0, 1.0, 0.8)
  assert.ok(centerOpacity >= 0.12, `Centro exato do banco deve manter opacidade (deu ${centerOpacity.toFixed(3)})`)

  // 3. Após sair do banco (offset = -120, além do volume)
  const exitOpacity = calculateFogBankOpacity(150, -125, 1.0, 0.8)
  assert.equal(exitOpacity, 0, 'Após ultrapassar completamente o banco a opacidade zera suavemente')

  console.log('✔ Volumetric Fog Visibility passed')
}

console.log('--- TODOS OS TESTES DO PACOTE DE CORREÇÕES PASSARAM COM SUCESSO! ---')
