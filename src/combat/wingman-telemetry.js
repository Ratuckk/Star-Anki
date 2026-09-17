// ============ TELEMETRIA E GRAVADOR DE VOO DOS ALIADOS (FLIGHT RECORDER) ============
// Sistema de diagnóstico, monitoramento e telemetria de alta precisão para a esquadrilha.
// Registra todos os parâmetros físicos e de IA:
// - Posições (absolutas e relativas ao jogador e à vaga de formação)
// - Vetores e escalares de velocidade (avanço, lateral e vertical)
// - Rotações e ângulos (Euler pitch/yaw/roll em graus, quaternion, roll de banking)
// - Estados de IA, contadores de tempo e objetivos
// - Cooldowns de disparo, descanso e habilidades únicas
// - Buffer circular cronológico com os últimos eventos de voo detalhados

import { quaternionToEulerDeg, copyTextToClipboard } from '../telemetry-utils.js'

const MAX_EVENT_LOG = 200

export function createWingmanTelemetry() {
  const events = []
  let latestSnapshot = {
    timestamp: 0,
    activeCount: 0,
    commandMode: 'free',
    wingmen: [],
    recentEvents: [],
  }

  function recordEvent(pilot, category, message, meta = {}) {
    const entry = {
      t: Number((meta.elapsed || latestSnapshot.timestamp || 0).toFixed(2)),
      pilot: pilot || 'Esquadrão',
      cat: category || 'info', // 'state' | 'combat' | 'ability' | 'flight' | 'alert'
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

  let _lastArgs = null
  let _isDirty = true

  function update(activeWingmen, playerPos, frame, squadronCommandMode, elapsed) {
    if (!playerPos || !frame) return latestSnapshot
    _lastArgs = { activeWingmen, playerPos, frame, squadronCommandMode, elapsed }
    _isDirty = true
    if (typeof elapsed === 'number') {
      latestSnapshot.timestamp = Number(elapsed.toFixed(2))
    }
    return latestSnapshot
  }

  function _computeSnapshot(activeWingmen, playerPos, frame, squadronCommandMode, elapsed) {
    const wingmenStats = []

    for (let i = 0; i < activeWingmen.length; i++) {
      const w = activeWingmen[i]
      if (!w || !w.mesh) continue

      const pos = w.mesh.position
      const dx = pos.x - playerPos.x
      const dy = pos.y - playerPos.y
      const dz = pos.z - playerPos.z
      const distToPlayer = Math.hypot(dx, dy, dz)

      const lateralRel = dx * frame.right.x + dy * frame.right.y + dz * frame.right.z
      const verticalRel = dx * frame.up.x + dy * frame.up.y + dz * frame.up.z
      const forwardRel = dx * frame.forward.x + dy * frame.forward.y + dz * frame.forward.z

      const vel = w.velocity || { x: 0, y: 0, z: 0 }
      const speed = Math.hypot(vel.x || 0, vel.y || 0, vel.z || 0)
      const lateralVel = (vel.x || 0) * frame.right.x + (vel.y || 0) * frame.right.y + (vel.z || 0) * frame.right.z
      const verticalVel = (vel.x || 0) * frame.up.x + (vel.y || 0) * frame.up.y + (vel.z || 0) * frame.up.z
      const forwardVel = (vel.x || 0) * frame.forward.x + (vel.y || 0) * frame.forward.y + (vel.z || 0) * frame.forward.z

      const targetPos = w.patrolTarget || pos
      const tdx = pos.x - targetPos.x
      const tdy = pos.y - targetPos.y
      const tdz = pos.z - targetPos.z
      const distToTarget = Math.hypot(tdx, tdy, tdz)

      const euler = quaternionToEulerDeg(w.mesh.quaternion)

      wingmenStats.push({
        id: w.profile.id,
        name: w.profile.name,
        title: w.profile.title,
        colorHex: '#' + w.profile.color.toString(16).padStart(6, '0'),
        state: w.state,
        stateTimer: Number(w.stateTimer.toFixed(2)),
        position: {
          x: Number(pos.x.toFixed(2)),
          y: Number(pos.y.toFixed(2)),
          z: Number(pos.z.toFixed(2)),
        },
        relativeToPlayer: {
          dist: Number(distToPlayer.toFixed(2)),
          lateral: Number(lateralRel.toFixed(2)),
          vertical: Number(verticalRel.toFixed(2)),
          forward: Number(forwardRel.toFixed(2)),
        },
        target: {
          x: Number(targetPos.x.toFixed(2)),
          y: Number(targetPos.y.toFixed(2)),
          z: Number(targetPos.z.toFixed(2)),
          dist: Number(distToTarget.toFixed(2)),
        },
        velocity: {
          speed: Number(speed.toFixed(2)),
          lateralSpeed: Number(lateralVel.toFixed(2)),
          verticalSpeed: Number(verticalVel.toFixed(2)),
          forwardSpeed: Number(forwardVel.toFixed(2)),
          x: Number((vel.x || 0).toFixed(2)),
          y: Number((vel.y || 0).toFixed(2)),
          z: Number((vel.z || 0).toFixed(2)),
        },
        rotation: {
          smoothRollRad: Number((w.smoothRoll || 0).toFixed(4)),
          smoothRollDeg: Number(((w.smoothRoll || 0) * (180 / Math.PI)).toFixed(1)),
          eulerDeg: {
            pitch: euler.pitch,
            yaw: euler.yaw,
            roll: euler.roll,
          },
          quaternion: {
            x: Number((w.mesh.quaternion?.x || 0).toFixed(3)),
            y: Number((w.mesh.quaternion?.y || 0).toFixed(3)),
            z: Number((w.mesh.quaternion?.z || 0).toFixed(3)),
            w: Number((w.mesh.quaternion?.w !== undefined ? w.mesh.quaternion.w : 1).toFixed(3)),
          },
        },
        combat: {
          fireCooldown: Number(Math.max(0, w.fireCooldown || 0).toFixed(2)),
          engagementCooldown: Number(Math.max(0, w.engagementCooldown || 0).toFixed(2)),
          targetEnemyId: w.targetEnemy ? w.targetEnemy.id : null,
          targetEnemyKind: w.targetEnemy ? w.targetEnemy.kind : null,
          burstRemaining: w.burstRemaining || 0,
          burstTimer: Number(Math.max(0, w.burstTimer || 0).toFixed(2)),
        },
        ability: {
          id: w.profile.abilityId,
          label: w.profile.abilityLabel,
          active: !!w.abilityActive,
          timer: Number((w.abilityTimer || 0).toFixed(2)),
          cooldown: Number(Math.max(0, w.abilityCooldown || 0).toFixed(2)),
          ready: (w.abilityCooldown || 0) <= 0,
          escortKind: w.escortKind || null,
        },
      })
    }

    latestSnapshot = {
      timestamp: Number((elapsed || 0).toFixed(2)),
      activeCount: wingmenStats.length,
      commandMode: squadronCommandMode,
      wingmen: wingmenStats,
      recentEvents: events.slice(-30),
    }

    return latestSnapshot
  }

  function getSnapshot() {
    if (_isDirty && _lastArgs) {
      _computeSnapshot(_lastArgs.activeWingmen, _lastArgs.playerPos, _lastArgs.frame, _lastArgs.squadronCommandMode, _lastArgs.elapsed)
      _isDirty = false
    }
    return latestSnapshot
  }

  function getFlightLog(limit = 50) {
    return events.slice(-limit)
  }

  function getFormattedText() {
    const s = getSnapshot()
    let out = `=== TELEMETRIA DOS ALIADOS (${s.timestamp}s) | Modo: ${s.commandMode.toUpperCase()} ===\n\n`
    out += `Caças ativos: ${s.activeCount}\n\n`

    for (const w of s.wingmen) {
      out += `[${w.name.toUpperCase()} - ${w.title}]\n`
      out += `  Estado: ${w.state.toUpperCase()} (${w.stateTimer}s)\n`
      out += `  Distância ao Jogador: ${w.relativeToPlayer.dist}u (Lateral: ${w.relativeToPlayer.lateral}u, Altura: ${w.relativeToPlayer.vertical}u, Avanço: ${w.relativeToPlayer.forward}u)\n`
      out += `  Velocidade: ${w.velocity.speed} u/s (Lateral: ${w.velocity.lateralSpeed} u/s, Avanço: ${w.velocity.forwardSpeed} u/s)\n`
      out += `  Roll (Banking): ${w.rotation.smoothRollDeg}° (Euler: P=${w.rotation.eulerDeg.pitch}°, Y=${w.rotation.eulerDeg.yaw}°, R=${w.rotation.eulerDeg.roll}°)\n`
      out += `  Combate: Cooldown Tiro=${w.combat.fireCooldown}s | Cooldown Descanso=${w.combat.engagementCooldown}s | Alvo=${w.combat.targetEnemyId ? '#' + w.combat.targetEnemyId + ' (' + w.combat.targetEnemyKind + ')' : 'nenhum'}\n`
      out += `  Habilidade: ${w.ability.label} (${w.ability.ready ? 'PRONTA' : w.ability.cooldown + 's'} | Ativa: ${w.ability.active})\n\n`
    }

    out += `--- ÚLTIMOS EVENTOS DE VOO ---\n`
    for (const e of events.slice(-25)) {
      out += `[${e.t}s] [${e.pilot}] [${e.cat.toUpperCase()}]: ${e.msg}\n`
    }

    return out
  }

  function dumpToConsole() {
    const s = getSnapshot()
    if (typeof console !== 'undefined') {
      console.group(`🚀 [Star-Anki Telemetria dos Aliados] T=${s.timestamp}s | Modo: ${s.commandMode.toUpperCase()}`)
      console.log('--- RESUMO EM TEMPO REAL ---')
      console.table(s.wingmen.map((w) => ({
        Piloto: w.name,
        Estado: w.state,
        Dist_Jogador: w.relativeToPlayer.dist + ' u',
        Offsets_L_A_F: `[${w.relativeToPlayer.lateral}, ${w.relativeToPlayer.vertical}, ${w.relativeToPlayer.forward}]`,
        Velocidade: w.velocity.speed + ' u/s',
        Roll_Graus: w.rotation.smoothRollDeg + '°',
        Cooldown_Tiro: w.combat.fireCooldown + 's',
        Descanso: w.combat.engagementCooldown + 's',
        Habilidade: `${w.ability.label} (${w.ability.ready ? 'PRONTA' : w.ability.cooldown + 's'})`,
      })))
      console.log('--- ÚLTIMOS EVENTOS DE VOO ---')
      console.table(events.slice(-20))
      console.groupEnd()
    }
    return s
  }

  function copyToClipboard() {
    const text = getFormattedText()
    copyTextToClipboard(text, 'Log de Voo da Esquadrilha')
    return text
  }

  return {
    recordEvent,
    update,
    getSnapshot,
    getFlightLog,
    getFormattedText,
    dumpToConsole,
    copyToClipboard,
    clearLog,
  }
}
