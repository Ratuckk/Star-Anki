import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import {
  createWingmanRadio,
  SQUAD_TRIVIAL_GAP_MS,
  TRIVIAL_TRANSMISSION_ESTIMATED_MS,
  ABILITY_EVENT_IDS,
} from './combat/wingman-radio.js'
import { createSquadronSystem, WINGMAN_PROFILES } from './combat/wingmen.js'
import { formatMissionTime } from './hud-game.js'

console.log('--- TEST SUITE: Fase 1 — Rádio, Miyu, HUD e Timer Único ---')

// Helper mock rail
function createMockRail() {
  const dummyCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -100),
    new THREE.Vector3(0, 0, -500),
  ])
  return {
    curve: dummyCurve,
    getPointAt: (t) => dummyCurve.getPointAt(t),
    getTangentAt: (t) => dummyCurve.getTangentAt(t),
    getFrameAt: (_t) => ({
      forward: new THREE.Vector3(0, 0, -1),
      right: new THREE.Vector3(1, 0, 0),
      up: new THREE.Vector3(0, 1, 0),
    }),
    getPlayerPosition: () => new THREE.Vector3(0, 0, 0),
    isFullSpinActive: () => false,
    isArena: () => false,
  }
}

// ============================================================================
// 1. 60s DE EVENTOS DE RÁDIO COM NENHUM INTERVALO TRIVIAL < 6s (Item 1.2)
// ============================================================================
{
  console.log('Testing 1: 60s de combate contínuo com 4 aliados e rate-limit global >= 6s...')
  const radio = createWingmanRadio({
    random: () => 0.42,
    enforceSquadSilence: true,
    squadSilenceGapMs: 6000,
  })

  const emittedTrivials = []
  const activePilots = [0, 1, 2, 3]
  const trivialEvents = ['engage_dogfight', 'kill', 'boost_used', 'return_formation', 'charged_shot_used']

  // Dispara rajadas a cada 50ms simulando combate frenético
  for (let t = 0; t <= 60000; t += 50) {
    for (const pilotId of activePilots) {
      const evt = trivialEvents[(pilotId + Math.floor(t / 800)) % trivialEvents.length]
      const text = radio.trySpeak(pilotId, evt, t, { activePilotIds: activePilots })
      if (text) {
        emittedTrivials.push({ pilotId, eventId: evt, time: t, text })
      }
    }
  }

  assert.ok(emittedTrivials.length > 0, 'Deve emitir falas triviais ao longo de 60s')
  for (let i = 1; i < emittedTrivials.length; i++) {
    const prev = emittedTrivials[i - 1]
    const curr = emittedTrivials[i]
    const interval = curr.time - prev.time
    assert.ok(
      interval >= 6000,
      `Intervalo entre fala ${i - 1} (${prev.time}ms) e fala ${i} (${curr.time}ms) foi ${interval}ms, menor que 6000ms!`,
    )
  }
  console.log(`✔ 60s test passed (${emittedTrivials.length} falas, todos os intervalos >= 6000ms)`)
}

// ============================================================================
// 2. ABILITY NUNCA CRIA MENSAGEM DE RÁDIO (Item 1.1)
// ============================================================================
{
  console.log('Testing 2: Habilidade nunca cria mensagem de rádio...')
  const radio = createWingmanRadio({ random: () => 0 })

  for (const abilityId of ABILITY_EVENT_IDS) {
    for (const pilotId of [0, 1, 2, 3]) {
      const result = radio.speakAbility(pilotId, abilityId, 1000, { activePilotIds: [0, 1, 2, 3] })
      assert.strictEqual(result, null, `speakAbility(${pilotId}, ${abilityId}) deve retornar null`)
    }
  }

  // No sistema de esquadrão real
  const scene = new THREE.Group()
  const rail = createMockRail()
  const squadron = createSquadronSystem(scene, rail, {}, {})
  const peppy = squadron.spawnMember(1)
  peppy.control.cooldowns.primary = 0

  const testFrame = {
    position: new THREE.Vector3(0, 0, 0),
    forward: new THREE.Vector3(0, 0, -1),
    right: new THREE.Vector3(1, 0, 0),
    up: new THREE.Vector3(0, 1, 0),
  }

  // Peppy (pilot 1) com habilidade pronta e escudo do jogador baixo ativa Guarda
  const resGuard = squadron.update(0.1, testFrame.position, testFrame, { shieldNotFull: true })
  assert.strictEqual(resGuard.radioMessage, null, 'Guarda de Peppy NÃO deve gerar mensagem de rádio')

  console.log('✔ Ability nunca cria mensagem de rádio passed')
}

// ============================================================================
// 3. CADA ABILITY CRIA ÍCONE CORRETO SOBRE NAVE DO PILOTO CORRETO (Item 1.4)
// ============================================================================
{
  console.log('Testing 3: Ícones de ability sobre a nave do aliado...')
  const scene = new THREE.Group()
  const rail = createMockRail()
  const squadron = createSquadronSystem(scene, rail, {}, {})
  const peppy = squadron.spawnMember(1)
  peppy.control.cooldowns.primary = 0

  const testFrame = {
    position: new THREE.Vector3(0, 0, 0),
    forward: new THREE.Vector3(0, 0, -1),
    right: new THREE.Vector3(1, 0, 0),
    up: new THREE.Vector3(0, 1, 0),
  }

  // Peppy ativa guarda
  squadron.update(0.1, testFrame.position, testFrame, { shieldNotFull: true })

  const activeIcons = squadron.getActiveAbilityIcons()
  assert.ok(activeIcons.length >= 1, 'Deve conter ícone de ability ativo')
  const peppyIcon = activeIcons.find((i) => i.pilotId === 1)
  assert.ok(peppyIcon, 'Ícone de Peppy deve estar presente')
  assert.equal(peppyIcon.icon, '🔰', 'Ícone de Peppy deve ser 🔰')
  assert.ok(peppyIcon.worldPos.y > 0, 'Ícone deve estar posicionado acima da nave')

  // Tick de 1.6s deve expirar o ícone (duração 1.5s)
  squadron.update(1.6, testFrame.position, testFrame)
  const expiredIcons = squadron.getActiveAbilityIcons()
  assert.equal(expiredIcons.filter((i) => i.id === peppyIcon.id).length, 0, 'Ícone deve sumir após 1.5s')

  console.log('✔ Ability world icons passed')
}

// ============================================================================
// 4. MIYU — NÃO ATIVA MIRANDO ESPAÇO VAZIO (Item 1.5)
// ============================================================================
{
  console.log('Testing 4: Miyu não ativa mirando espaço vazio...')
  const scene = new THREE.Group()
  const rail = createMockRail()
  const squadron = createSquadronSystem(scene, rail, {}, {})
  const miyu = squadron.spawnMember(3)
  assert.ok(miyu, 'Miyu gerada')

  const testFrame = {
    position: new THREE.Vector3(0, 0, 0),
    forward: new THREE.Vector3(0, 0, -1),
    right: new THREE.Vector3(1, 0, 0),
    up: new THREE.Vector3(0, 1, 0),
  }

  // Jogador carregando por 1.0s MAS sem lock no alvo (olhando para o espaço vazio)
  miyu.control.cooldowns.primary = 0.0

  for (let i = 0; i < 20; i++) {
    squadron.update(0.05, testFrame.position, testFrame, {
      homingCharging: true,
      homingHasLockedTarget: false, // ESPAÇO VAZIO
    })
  }

  // Miyu não pode ter ativado
  assert.equal(miyu.abilityCooldown, 0, 'Cooldown de Miyu NÃO pode ser consumido em espaço vazio')
  const icons = squadron.getActiveAbilityIcons().filter((i) => i.pilotId === 3)
  assert.equal(icons.length, 0, 'Nenhum ícone de ability de Miyu deve aparecer em espaço vazio')

  console.log('✔ Miyu mirando espaço vazio passed')
}

// ============================================================================
// 5. MIYU — ATIVA QUANDO CARGA + ALVO VÁLIDO (Item 1.5)
// ============================================================================
{
  console.log('Testing 5: Miyu ativa quando carga + alvo válido...')
  const scene = new THREE.Group()
  const rail = createMockRail()
  let muzzleOrigin = null
  const mockEffects = {
    muzzleFlash: (origin) => { muzzleOrigin = origin.clone() },
    maxChargeRings: () => {},
    projectileTrail: () => {},
  }
  const squadron = createSquadronSystem(scene, rail, mockEffects, {})
  const miyu = squadron.spawnMember(3)

  const testFrame = {
    position: new THREE.Vector3(0, 0, 0),
    forward: new THREE.Vector3(0, 0, -1),
    right: new THREE.Vector3(1, 0, 0),
    up: new THREE.Vector3(0, 1, 0),
  }

  miyu.control.cooldowns.primary = 0.0

  // Jogador carregando COM lock válido por tempo >= ASSIST_MIN_HOLD_S (0.35s)
  for (let i = 0; i < 15; i++) {
    squadron.update(0.05, testFrame.position, testFrame, {
      homingCharging: true,
      homingHasLockedTarget: true, // ALVO VÁLIDO
    })
  }

  const icons = squadron.getActiveAbilityIcons().filter((i) => i.pilotId === 3)
  assert.ok(icons.length >= 1, 'Ícone visual de assist deve aparecer sobre a Miyu')
  assert.equal(icons[0].icon, '🔗', 'Ícone de Miyu deve ser 🔗')

  // Disparo assistido nasce fisicamente na nave da Miyu
  miyu.mesh.position.set(30, 10, -5)
  const dummyTarget = { id: 99, mesh: { position: new THREE.Vector3(0, 0, -80) }, radius: 2 }
  const shots = squadron.fireMiyuAssistShots([dummyTarget])
  assert.equal(shots, 1, 'Dispara 1 tiro assistido')
  assert.ok(muzzleOrigin, 'Muzzle flash deve existir')
  assert.ok(muzzleOrigin.distanceTo(miyu.mesh.position) < 2.5, 'Tiro assistido deve nascer fisicamente na Miyu')

  console.log('✔ Miyu carga + alvo válido passed')
}

// ============================================================================
// 6. UM ÚNICO TIMER VISÍVEL E AUSÊNCIA DE HUD-COUNTDOWN CENTRAL (Item 1.7)
// ============================================================================
{
  console.log('Testing 6: Um único timer visível na HUD...')
  const hudGameSource = readFileSync(new URL('./hud-game.js', import.meta.url), 'utf8')
  const hudStylesSource = readFileSync(new URL('./hud-styles.js', import.meta.url), 'utf8')

  // Rótulo TEMPO no bloco do Double Stack
  assert.ok(hudGameSource.includes('<div class="hud-stack-label">TEMPO</div>'), 'Bloco do timer deve usar label TEMPO')

  // .hud-countdown central deve estar permanentemente suprimido
  assert.ok(
    /\.hud-countdown\s*\{\s*display:\s*none\s*!important/.test(hudStylesSource),
    '.hud-countdown central deve ter display: none !important',
  )

  // setCountdown esconde elemento solto e alimenta timer do Double Stack
  assert.ok(hudGameSource.includes('countdown.hidden = true'), 'setCountdown deve manter countdown central oculto')
  assert.ok(hudGameSource.includes('formatMissionTime(activeCountdownSec * 1000)'), 'Single timer deve renderizar MM:SS')

  // Formatação MM:SS unificada
  assert.equal(formatMissionTime(15000), '00:15')
  assert.equal(formatMissionTime(65000), '01:05')
  assert.equal(formatMissionTime(0), '00:00')

  console.log('✔ Single visible timer contract passed')
}

// ============================================================================
// 7. CENTRO SUPERIOR LIMPO (NADA ESTÁTICO EM LEFT: 50% NO TOPO) (Item 1.6)
// ============================================================================
{
  console.log('Testing 7: Centro superior limpo e widgets agrupados na esquerda...')
  const hudGameSource = readFileSync(new URL('./hud-game.js', import.meta.url), 'utf8')
  const hudStylesSource = readFileSync(new URL('./hud-styles.js', import.meta.url), 'utf8')

  // hud-top-center-cluster não pode existir
  assert.ok(!hudGameSource.includes('hud-top-center-cluster'), 'hud-top-center-cluster não deve existir no código do HUD')
  assert.ok(!hudStylesSource.includes('.hud-top-center-cluster'), 'hud-top-center-cluster não deve existir no CSS')

  // Deve existir hud-combat-left-cluster na região esquerda
  assert.ok(hudGameSource.includes('hud-combat-left-cluster'), 'hud-combat-left-cluster deve existir no HUD')
  assert.ok(hudStylesSource.includes('.hud-combat-left-cluster'), 'hud-combat-left-cluster deve existir no CSS')
  assert.ok(
    hudStylesSource.includes('left: var(--hud-left-stack-x);'),
    'Cluster de combate deve alinhar à esquerda com a pilha esquerda',
  )

  console.log('✔ Clean top-center passed')
}

// ============================================================================
// 8. PROJEÇÃO DO RÁDIO E ÍCONES TRATA ALVO ATRÁS DA CÂMERA (Item 1.3 & 1.4)
// ============================================================================
{
  console.log('Testing 8: Projeção trata alvos atrás da câmera...')
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1000)
  camera.position.set(0, 0, 10)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld()

  // Alvo na frente da câmera (z = 0)
  const posFront = new THREE.Vector3(0, 0, 0)
  const ndcFront = posFront.project(camera)
  assert.ok(ndcFront.z >= -1 && ndcFront.z <= 1, 'Alvo na frente está dentro do frustum Z')

  // Alvo atrás da câmera (z = 20 > camera.z = 10)
  const posBehind = new THREE.Vector3(0, 0, 20)
  const ndcBehind = posBehind.project(camera)
  assert.ok(ndcBehind.z > 1 || ndcBehind.z < -1, 'Alvo atrás da câmera fica fora do intervalo [-1, 1]')

  // Verificação no game-loop.js
  const loopSource = readFileSync(new URL('./game-loop.js', import.meta.url), 'utf8')
  assert.ok(
    loopSource.includes('const radioVisible = ndcR.z >= -1 && ndcR.z <= 1'),
    'game-loop deve verificar se rádio está na frente da câmera',
  )
  assert.ok(
    loopSource.includes('if (ndcI.z < -1 || ndcI.z > 1) continue'),
    'game-loop deve ignorar ícones de ability atrás da câmera',
  )

  console.log('✔ Behind camera projection passed')
}

console.log('--- TODOS OS TESTES DA FASE 1 PASSARAM COM SUCESSO! ---')
