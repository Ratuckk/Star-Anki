// ============ TELEMETRIA E REGISTRADOR DE COMBATE DOS INIMIGOS (ENEMY COMBAT RECORDER) ============
// Monitoramento em tempo real de todos os inimigos em cena, projéteis hostis e ameaças:
// - Posições mundiais e relativas ao jogador (distância frontal, lateral, vertical)
// - Orientação Euler (Pitch, Yaw, Roll em graus) e Quaternion de cada nave inimiga
// - Barras de vida (HP atual, HP máximo, porcentagem e status de escudo/blindagem)
// - Máquina de estados de IA (patrulha, aproximação, aviso visual telegraph, disparando, morrendo)
// - Contadores de perigos (projéteis hostis em voo, lasers de chefes, portais sentinela)
// - Caixa preta de combate (Event Log circular dos últimos 200 eventos de inimigos)

import { quaternionToEulerDeg, distance3D, dot3D, copyTextToClipboard } from '../telemetry-utils.js'

const MAX_EVENT_LOG = 200

export function createEnemyTelemetry() {
  const events = []
  let latestSnapshot = {
    timestamp: 0,
    summary: {
      activeEnemies: 0,
      activeProjectiles: 0,
      activeLasers: 0,
      activeGates: 0,
      goldenActive: 0,
      hasBoss: false,
    },
    enemies: [],
    hazards: {
      projectilesCount: 0,
      closestProjectileDist: null,
      gatesCount: 0,
      lasersCount: 0,
    },
  }

  function recordEvent(enemyId, enemyKind, category, message, meta = {}) {
    const entry = {
      t: Number((meta.elapsed || latestSnapshot.timestamp || 0).toFixed(2)),
      id: enemyId || null,
      kind: enemyKind || 'Ameaça',
      cat: category || 'combat', // 'spawn' | 'telegraph' | 'fire' | 'gate' | 'damage' | 'death' | 'despawn' | 'phase'
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

  function update(args) {
    _lastArgs = args
    _isDirty = true
    if (args && typeof args.elapsed === 'number') {
      latestSnapshot.timestamp = Number(args.elapsed.toFixed(2))
    }
    return latestSnapshot
  }

  function _computeSnapshot({ enemies, enemyProjectiles, enemyLasers, enemyGates, golden, playerPos, frame, elapsed }) {
    const now = typeof elapsed === 'number' ? elapsed : (performance.now() / 1000)
    const pPos = playerPos || { x: 0, y: 0, z: 0 }
    const fRight = frame?.right || { x: 1, y: 0, z: 0 }
    const fUp = frame?.up || { x: 0, y: 1, z: 0 }
    const fFwd = frame?.forward || { x: 0, y: 0, z: -1 }

    const enemyList = enemies || []
    const projectileList = enemyProjectiles || []
    const laserList = enemyLasers || []
    const gateList = enemyGates || []

    const goldenAlive = golden && golden.getAlive ? golden.getAlive().length : 0

    let hasBoss = false
    const parsedEnemies = []

    for (let i = 0; i < enemyList.length; i++) {
      const e = enemyList[i]
      if (!e || !e.mesh) continue

      if (e.kind === 'boss') hasBoss = true

      const pos = e.mesh.position
      const distToPlayer = distance3D(pos, pPos)
      const toPlayer = { x: pos.x - pPos.x, y: pos.y - pPos.y, z: pos.z - pPos.z }

      const latRel = dot3D(toPlayer, fRight)
      const vertRel = dot3D(toPlayer, fUp)
      const fwdRel = dot3D(toPlayer, fFwd)

      const quat = e.mesh.quaternion || { x: 0, y: 0, z: 0, w: 1 }
      const euler = quaternionToEulerDeg(quat)

      const hp = e.hp ?? 1
      const maxHp = e.maxHp || hp
      const hpPct = Math.max(0, Math.min(100, Math.round((hp / maxHp) * 100)))

      let state = 'patrol'
      if (e.dying) state = 'dying'
      else if (e.fsm) state = e.fsm.currentState // Blaster/Tank já migrados pra FSM — leitura direta e determinística
      else if (e.telegraphTimer > 0) state = 'telegraph'
      else if (e.fireTimer !== undefined && e.fireTimer <= 0.25) state = 'ready_to_fire'
      else if (e.state) state = e.state
      else if (e.phase) state = `phase_${e.phase}`

      let specialInfo = ''
      if (e.kind === 'sentinela') {
        specialInfo = `gates=${e.gateCount || 0}, fires=${e.fireCount || 0}`
      } else if (e.kind === 'boss') {
        specialInfo = `phase=${e.phase || 1}, shield=${Boolean(e.isShieldActive)}`
      } else if (e.kind === 'fragata') {
        specialInfo = `shielded=${Boolean(e.shieldActive)}`
      } else if (e.kind === 'blaster' && e.profile) {
        specialInfo = `profile=${e.profile.name || 'padrao'}`
      }

      parsedEnemies.push({
        id: e.id || i + 1,
        kind: e.kind || 'enemy',
        hp: Number(hp.toFixed(1)),
        maxHp: Number(maxHp.toFixed(1)),
        hpPct,
        state,
        position: {
          x: Number(pos.x.toFixed(2)),
          y: Number(pos.y.toFixed(2)),
          z: Number(pos.z.toFixed(2)),
        },
        relativeToPlayer: {
          dist: Number(distToPlayer.toFixed(2)),
          lateral: Number(latRel.toFixed(2)),
          vertical: Number(vertRel.toFixed(2)),
          forward: Number(fwdRel.toFixed(2)),
        },
        rotation: {
          pitchDeg: euler.pitch,
          yawDeg: euler.yaw,
          rollDeg: euler.roll,
          quaternion: {
            x: Number((quat.x || 0).toFixed(3)),
            y: Number((quat.y || 0).toFixed(3)),
            z: Number((quat.z || 0).toFixed(3)),
            w: Number((quat.w !== undefined ? quat.w : 1).toFixed(3)),
          },
        },
        timers: {
          fireTimer: Number(Math.max(0, e.fireTimer || 0).toFixed(2)),
          telegraphTimer: Number(Math.max(0, e.telegraphTimer || 0).toFixed(2)),
          dyingTimer: Number(Math.max(0, e.deathT || 0).toFixed(2)),
        },
        special: specialInfo,
      })
    }

    // Cálculos de projéteis hostis e perigos
    let closestProjDist = null
    for (let i = 0; i < projectileList.length; i++) {
      const p = projectileList[i]
      if (!p || !p.mesh) continue
      const d = distance3D(p.mesh.position, pPos)
      if (closestProjDist === null || d < closestProjDist) {
        closestProjDist = d
      }
    }

    latestSnapshot = {
      timestamp: Number(now.toFixed(2)),
      summary: {
        activeEnemies: parsedEnemies.filter((e) => e.state !== 'dying').length,
        totalTracked: parsedEnemies.length,
        activeProjectiles: projectileList.length,
        activeLasers: laserList.length,
        activeGates: gateList.length,
        goldenActive: goldenAlive,
        hasBoss,
      },
      enemies: parsedEnemies,
      hazards: {
        projectilesCount: projectileList.length,
        closestProjectileDist: closestProjDist !== null ? Number(closestProjDist.toFixed(2)) : null,
        gatesCount: gateList.length,
        lasersCount: laserList.length,
      },
    }

    return latestSnapshot
  }

  function getSnapshot() {
    if (_isDirty && _lastArgs) {
      _computeSnapshot(_lastArgs)
      _isDirty = false
    }
    return latestSnapshot
  }

  function getCombatLog(limit = MAX_EVENT_LOG) {
    if (!limit || limit >= events.length) return [...events]
    return events.slice(-limit)
  }

  function getFormattedText() {
    const s = getSnapshot()
    const sum = s.summary
    const haz = s.hazards

    const lines = [
      `=== TELEMETRIA DOS INIMIGOS E AMEAÇAS [t=${s.timestamp}s] ===`,
      `RESUMO:    Inimigos Vivos=${sum.activeEnemies} | Projéteis=${sum.activeProjectiles} | Lasers=${sum.activeLasers} | Portais=${sum.activeGates} | Dourados=${sum.goldenActive} | Chefe=${sum.hasBoss}`,
      `PERIGOS:   Projétil Mais Próximo=${haz.closestProjectileDist !== null ? haz.closestProjectileDist + 'u' : 'Nenhum'}`,
      `--- LISTA DE INIMIGOS ATIVOS (${s.enemies.length}) ---`,
    ]

    for (const e of s.enemies) {
      const p = e.position
      const r = e.relativeToPlayer
      const rot = e.rotation
      lines.push(
        `[#${e.id} ${e.kind.toUpperCase()}] HP: ${e.hp}/${e.maxHp} (${e.hpPct}%) | Estado: ${e.state} | ` +
        `Dist: ${r.dist}u (Frente: ${r.forward}u, Lat: ${r.lateral}u, Vert: ${r.vertical}u) | ` +
        `Euler: P:${rot.pitchDeg}° Y:${rot.yawDeg}° R:${rot.rollDeg}° | ` +
        `Tiro: ${e.timers.fireTimer}s | Aviso: ${e.timers.telegraphTimer}s ${e.special ? '| ' + e.special : ''}`
      )
    }

    lines.push(`--- ÚLTIMOS ${Math.min(10, events.length)} EVENTOS DE COMBATE INIMIGO ---`)
    for (const ev of events.slice(-10)) {
      lines.push(`  [${ev.t}s] [${ev.kind} #${ev.id || '?'}] [${ev.cat.toUpperCase()}] ${ev.msg}`)
    }

    return lines.join('\n')
  }

  function dumpToConsole() {
    const s = getSnapshot()
    console.groupCollapsed(`%c[Telemetria Inimigos] t=${s.timestamp}s | Vivos: ${s.summary.activeEnemies} | Projéteis: ${s.summary.activeProjectiles} | Portais: ${s.summary.activeGates}`, 'color: #ff5a3d; font-weight: bold;')
    console.log('%c--- Resumo Geral de Ameaças ---', 'color: #f7768e; font-weight: bold;')
    console.table(s.summary)

    if (s.enemies.length > 0) {
      console.log('%c--- Detalhes dos Inimigos em Cena ---', 'color: #f7768e; font-weight: bold;')
      const tableData = {}
      for (const e of s.enemies) {
        tableData[`#${e.id} ${e.kind}`] = {
          HP: `${e.hp}/${e.maxHp} (${e.hpPct}%)`,
          Estado: e.state,
          Distância: `${e.relativeToPlayer.dist}u`,
          AvançoRel: `${e.relativeToPlayer.forward}u`,
          LateralRel: `${e.relativeToPlayer.lateral}u`,
          PitchDeg: e.rotation.pitchDeg,
          YawDeg: e.rotation.yawDeg,
          RollDeg: e.rotation.rollDeg,
          TimerTiro: `${e.timers.fireTimer}s`,
          Telegraph: `${e.timers.telegraphTimer}s`,
          Especial: e.special || '-',
        }
      }
      console.table(tableData)
    } else {
      console.log('%cNenhum inimigo ativo na cena no momento.', 'color: #9ece6a;')
    }

    if (events.length > 0) {
      console.log('%c--- Últimos Eventos de Inimigos (Caixa Preta) ---', 'color: #f7768e; font-weight: bold;')
      console.table(events.slice(-15))
    }
    console.groupEnd()
  }

  function copyToClipboard() {
    copyTextToClipboard(getFormattedText(), 'Log de Combate dos Inimigos')
  }

  return {
    recordEvent,
    clearLog,
    update,
    getSnapshot,
    getCombatLog,
    getFormattedText,
    dumpToConsole,
    copyToClipboard,
  }
}
