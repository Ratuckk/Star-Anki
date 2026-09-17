// ============ TELEMETRIA E GRAVADOR DE VOO DO JOGADOR (PLAYER FLIGHT RECORDER) ============
// Monitoramento em tempo real de todos os parâmetros físicos, táticos e de estado da nave do jogador:
// - Posições 3D no mundo, limites de tela (lateral X/Y), bico da nave e distância no trilho
// - Vetores e escalares de velocidade (avanço, deslocamento lateral e multiplicadores)
// - Orientação Euler (Pitch, Yaw, Roll em graus), Quaternion bruto e inclinação de curva (banking)
// - Vitalidade e defesas (HP, Escudo contínuo, Vidas, I-Frames e Invulnerabilidade de rolamento)
// - Propulsor e Repulsor (Carga do boost, timers ativos de aceleração/frenagem)
// - Armamento e combate (cooldowns de disparo, tiros paralelos, teleguiado, cartas ativas)
// - Caixa preta (Event Log circular dos últimos 200 eventos de voo)

import { quaternionToEulerDeg, distance3D, copyTextToClipboard } from './telemetry-utils.js'

const MAX_EVENT_LOG = 200

export function createPlayerTelemetry() {
  const events = []
  let latestSnapshot = {
    timestamp: 0,
    position: { x: 0, y: 0, z: 0, lateralX: 0, lateralY: 0, railDistance: 0 },
    velocity: { forwardSpeed: 0, lateralX: 0, lateralY: 0, speedMultiplier: 1 },
    rotation: { pitchDeg: 0, yawDeg: 0, rollDeg: 0, bankDeg: 0, quaternion: { x: 0, y: 0, z: 0, w: 1 } },
    vitals: { health: 3, maxHealth: 3, shield: 3, maxShield: 3, shieldDelayMs: 0, lives: 3, maxLives: 3, invincible: false, iframeMs: 0 },
    boost: { charge: 1, boosting: false, braking: false, factor: 1 },
    combat: { fireCooldown: 0, projectileCount: 1, homingTargets: 4, spinCooldownMs: 0 },
    session: { score: 0, combo: 1, wrongAnswers: 0, activeCards: [] },
  }

  function recordEvent(category, message, meta = {}) {
    const entry = {
      t: Number((meta.elapsed || latestSnapshot.timestamp || 0).toFixed(2)),
      source: 'Jogador',
      cat: category || 'info', // 'fire' | 'homing' | 'boost' | 'roll' | 'damage' | 'shield' | 'heal' | 'card' | 'life'
      msg: message,
      ...meta,
    }
    delete entry.elapsed
    events.push(entry)
    if (events.length > MAX_EVENT_LOG) {
      events.shift()
    }
    return entry
  }

  function clearLog() {
    events.length = 0
  }

  function update({ player, rail, session, camera, elapsed }) {
    if (!player || !rail) return latestSnapshot

    const now = typeof elapsed === 'number' ? elapsed : (performance.now() / 1000)
    const pos = rail.getPlayerPosition ? rail.getPlayerPosition() : { x: 0, y: 0, z: 0 }
    const nose = rail.getShipNosePosition ? rail.getShipNosePosition() : pos
    const lat = rail.getPlayerLateral ? rail.getPlayerLateral() : { x: 0, y: 0 }
    const latVel = rail.getPlayerLateralVelocity ? rail.getPlayerLateralVelocity() : { x: 0, y: 0 }
    const railDist = rail.getDistance ? rail.getDistance() : 0

    const shipMesh = rail.getShipMesh ? rail.getShipMesh() : null
    const quat = shipMesh?.quaternion || { x: 0, y: 0, z: 0, w: 1 }
    const euler = quaternionToEulerDeg(quat)
    const bankAngle = rail.getRollAngle ? rail.getRollAngle() : 0

    const camPos = camera?.position || { x: 0, y: 0, z: 0 }
    const distToCamera = distance3D(pos, camPos)

    const cardsMap = player.getCollectedCards ? player.getCollectedCards() : new Map()
    const activeCards = Array.from(cardsMap.entries()).map(([id, stacks]) => ({ id, stacks }))

    latestSnapshot = {
      timestamp: Number(now.toFixed(2)),
      position: {
        x: Number(pos.x.toFixed(2)),
        y: Number(pos.y.toFixed(2)),
        z: Number(pos.z.toFixed(2)),
        lateralX: Number(lat.x.toFixed(2)),
        lateralY: Number(lat.y.toFixed(2)),
        noseZ: Number(nose.z.toFixed(2)),
        railDistance: Number(railDist.toFixed(1)),
        distToCamera: Number(distToCamera.toFixed(1)),
      },
      velocity: {
        forwardSpeed: Number((rail.isArena && rail.isArena() ? (rail.getArenaSpeed ? rail.getArenaSpeed() : 0) : 48 * (player.getBoostSpeedFactor ? player.getBoostSpeedFactor() : 1)).toFixed(2)),
        lateralX: Number(latVel.x.toFixed(2)),
        lateralY: Number(latVel.y.toFixed(2)),
        speedMultiplier: Number((player.getBoostSpeedFactor ? player.getBoostSpeedFactor() : 1).toFixed(2)),
      },
      rotation: {
        pitchDeg: euler.pitch,
        yawDeg: euler.yaw,
        rollDeg: euler.roll,
        bankDeg: Number((bankAngle * (180 / Math.PI)).toFixed(1)),
        quaternion: {
          x: Number((quat.x || 0).toFixed(3)),
          y: Number((quat.y || 0).toFixed(3)),
          z: Number((quat.z || 0).toFixed(3)),
          w: Number((quat.w !== undefined ? quat.w : 1).toFixed(3)),
        },
      },
      vitals: {
        health: session?.health ?? 0,
        maxHealth: player.getMaxHealth ? player.getMaxHealth() : 3,
        shield: Number((player.getShieldValue ? player.getShieldValue() : 0).toFixed(2)),
        maxShield: player.getShieldMax ? player.getShieldMax() : 3,
        shieldDelayMs: Number((player.getShieldRegenDelayTimer ? player.getShieldRegenDelayTimer() : 0).toFixed(0)),
        shieldRegenRate: Number((player.getShieldRegenRate ? player.getShieldRegenRate() : 0.4).toFixed(2)),
        lives: session?.lives ?? 3,
        maxLives: player.getMaxLives ? player.getMaxLives() : 3,
        invincible: Boolean(player.isInvincible ? player.isInvincible() : false),
        iframeRemainingMs: Number((player.getInvincibleRemainingMs ? player.getInvincibleRemainingMs() : 0).toFixed(0)),
        rollIframeRemainingMs: Number((player.getRollIframeTimer ? player.getRollIframeTimer() : 0).toFixed(0)),
      },
      boost: {
        charge: Number((player.getBoostCharge ? player.getBoostCharge() : 0).toFixed(2)),
        boosting: Boolean(player.isPropulsionActive ? player.isPropulsionActive() : false),
        braking: Boolean(player.isRepulsionActive ? player.isRepulsionActive() : false),
        factor: Number((player.getBoostSpeedFactor ? player.getBoostSpeedFactor() : 1).toFixed(2)),
        propulsionMs: Number((player.getPropulsionActiveTimer ? player.getPropulsionActiveTimer() : 0).toFixed(0)),
        repulsionMs: Number((player.getRepulsionActiveTimer ? player.getRepulsionActiveTimer() : 0).toFixed(0)),
      },
      combat: {
        fireCooldown: Number((player.getFireCooldown ? player.getFireCooldown() : 0.22).toFixed(3)),
        projectileCount: player.getProjectileCount ? player.getProjectileCount() : 1,
        homingTargets: player.getHomingMaxTargets ? player.getHomingMaxTargets() : 4,
        spinCooldownMs: Number((player.getFullSpinCooldownTimer ? player.getFullSpinCooldownTimer() : 0).toFixed(0)),
      },
      session: {
        score: Math.round(session?.score || 0),
        combo: session?.comboMultiplier || 1,
        wrongAnswers: player.getWrongCount ? player.getWrongCount() : 0,
        activeCards,
      },
    }

    return latestSnapshot
  }

  function getSnapshot() {
    return latestSnapshot
  }

  function getFlightLog(limit = MAX_EVENT_LOG) {
    if (!limit || limit >= events.length) return [...events]
    return events.slice(-limit)
  }

  function getFormattedText() {
    const s = latestSnapshot
    const p = s.position
    const v = s.velocity
    const r = s.rotation
    const vit = s.vitals
    const b = s.boost
    const c = s.combat

    return [
      `=== TELEMETRIA DO JOGADOR [t=${s.timestamp}s] ===`,
      `POSIÇÃO:  Mundo=(${p.x}, ${p.y}, ${p.z}) | Lateral Tela=(${p.lateralX}, ${p.lateralY}) | Trilho Dist=${p.railDistance}u`,
      `VELOCID:  Avanço=${v.forwardSpeed}u/s | Lateral=(${v.lateralX}, ${v.lateralY}) | Mult=${v.speedMultiplier}x`,
      `ATITUDE:  Euler=P:${r.pitchDeg}° Y:${r.yawDeg}° R:${r.rollDeg}° | Bank=${r.bankDeg}°`,
      `VITAIS:   HP=${vit.health}/${vit.maxHealth} | Escudo=${vit.shield}/${vit.maxShield} (delay=${vit.shieldDelayMs}ms) | Vidas=${vit.lives}/${vit.maxLives}`,
      `DEFESAS:  Invencível=${vit.invincible} (i-frame=${vit.iframeRemainingMs}ms, roll=${vit.rollIframeRemainingMs}ms)`,
      `PROPULS:  Carga=${(b.charge * 100).toFixed(0)}% | Turbo=${b.boosting} | Freio=${b.braking} | Fator=${b.factor}x`,
      `ARMAMENTO:Tiros=${c.projectileCount}x | Cooldown=${c.fireCooldown}s | Alvos Teleguiados=${c.homingTargets} | Giro Spin Cooldown=${c.spinCooldownMs}ms`,
      `SCORE:    Pontos=${s.session.score} | Combo=${s.session.combo}x | Erros=${s.session.wrongAnswers}`,
      `CARTAS:   ${s.session.activeCards.map((card) => `${card.id}(x${card.stacks})`).join(', ') || 'Nenhuma'}`,
      `ÚLTIMOS ${Math.min(10, events.length)} EVENTOS:`,
      ...events.slice(-10).map((e) => `  [${e.t}s] [${e.cat.toUpperCase()}] ${e.msg}`),
    ].join('\n')
  }

  function dumpToConsole() {
    const s = latestSnapshot
    console.groupCollapsed(`%c[Telemetria Jogador] t=${s.timestamp}s | HP: ${s.vitals.health}/${s.vitals.maxHealth} | Escudo: ${s.vitals.shield}/${s.vitals.maxShield} | Vel: ${s.velocity.forwardSpeed}u/s`, 'color: #00e5ff; font-weight: bold;')
    console.log('%c--- Estado Geral do Caça ---', 'color: #88c0d0; font-weight: bold;')
    console.table({
      Posição: { X: s.position.x, Y: s.position.y, Z: s.position.z, LateralX: s.position.lateralX, LateralY: s.position.lateralY, Trilho: s.position.railDistance },
      Velocidade: { Avanço: s.velocity.forwardSpeed, LateralX: s.velocity.lateralX, LateralY: s.velocity.lateralY, Multiplicador: s.velocity.speedMultiplier },
      Orientação: { PitchDeg: s.rotation.pitchDeg, YawDeg: s.rotation.yawDeg, RollDeg: s.rotation.rollDeg, BankCurva: s.rotation.bankDeg },
      Vitais: { HP: `${s.vitals.health}/${s.vitals.maxHealth}`, Escudo: `${s.vitals.shield}/${s.vitals.maxShield}`, DelayEscudo: `${s.vitals.shieldDelayMs}ms`, Vidas: `${s.vitals.lives}/${s.vitals.maxLives}`, Invencível: s.vitals.invincible },
      Propulsão: { Carga: `${(s.boost.charge * 100).toFixed(0)}%`, Turbo: s.boost.boosting, Freio: s.boost.braking, FatorVelocidade: `${s.boost.factor}x` },
      Combate: { QtdTiros: s.combat.projectileCount, CooldownTiro: `${s.combat.fireCooldown}s`, AlvosHoming: s.combat.homingTargets, SpinCooldown: `${s.combat.spinCooldownMs}ms` },
    })

    if (events.length > 0) {
      console.log('%c--- Últimos Eventos de Voo (Caixa Preta) ---', 'color: #88c0d0; font-weight: bold;')
      console.table(events.slice(-15))
    }
    console.groupEnd()
  }

  function copyToClipboard() {
    copyTextToClipboard(getFormattedText(), 'Log de Voo do Jogador')
  }

  return {
    recordEvent,
    clearLog,
    update,
    getSnapshot,
    getFlightLog,
    getFormattedText,
    dumpToConsole,
    copyToClipboard,
  }
}
