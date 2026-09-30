// Cenários do Esquadrão Dourado no sistema de inimigos REAL (createEnemiesSystem → golden.js →
// golden-squadron.js), por frames simulados. Observa estado por caça, projéteis criados na cena e o
// estado do comandante; não chama funções internas do esquadrão para forçar comportamento
// (só aplica dano pelas mesmas APIs de projétil do jogador e posiciona o jogador).
// Usado por src/golden-runtime.test.mjs (CI) e tools/validate-golden-runtime.mjs (evidência).
import * as THREE from 'three'
import { createEnemyRuntime } from './enemy-runtime-harness.mjs'
import { getSquadronCapForLevel, getOffensiveCapForLevel, getReplenishIntervalForLevel, FORMATION_SLOTS } from '../../src/enemies/golden-squadron.js'

const DT = 1 / 60

function seedRandom(seed = 98765) {
  let s = seed >>> 0
  const original = Math.random
  Math.random = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296 }
  return () => { Math.random = original }
}

function makeRun({ level = 1, ally = 0 } = {}) {
  const rt = createEnemyRuntime({ level })
  rt.enemies.setDifficultyLevelProvider?.(() => level)
  rt.enemies.spawnGoldenSpecial({ distanceMin: 60, distanceMax: 70, allyCount: ally })
  const commander = () => rt.enemies.getGoldenAlive()[0] || null
  const fightersAll = () => rt.enemies.getAlive().filter((e) => e.kind === 'golden_fighter')
  const known = new Set(rt.scene.children)
  const log = {
    frames: 0,
    orders: [],          // { t, from, to, participants:[ids], alive }
    fighters: new Map(), // id → { states:[{t,state,order}], maxSlotDist, minSlotDist, positions:[...], actedAt:[], slot }
    shots: [],           // { t, shooter, pos, dirToPlayer, mesh, born }
    playerHits: 0,
    maxOffensive: 0, maxAlive: 0, minCommanderDist: Infinity,
    teleports: [],
  }
  let lastOrder = 'NONE'
  const projectileMeshes = new Map()
  const t = () => log.frames * DT
  const slotWorld = (f, c) => {
    const fwd = rt.playerPosition.clone().sub(c.mesh.position).normalize()
    const up = new THREE.Vector3(0, 1, 0)
    const right = new THREE.Vector3().crossVectors(fwd, up).normalize()
    const up2 = new THREE.Vector3().crossVectors(right, fwd).normalize()
    const o = FORMATION_SLOTS[f.slotIndex % FORMATION_SLOTS.length].offset
    return c.mesh.position.clone().addScaledVector(right, o.x).addScaledVector(up2, o.y).addScaledVector(fwd, o.z)
  }
  function step(n = 1, hook) {
    for (let i = 0; i < n; i++) {
      log.frames++
      hook?.(log.frames, api)
      rt.enemies.update(DT, rt.playerPosition, {})
      const p = rt.enemies.updateProjectiles(DT, rt.playerPosition, {})
      log.playerHits += p.hits
      const c = commander()
      const tel = rt.enemies.getGoldenTelemetry()?.squadron
      if (tel) {
        log.maxOffensive = Math.max(log.maxOffensive, tel.offensiveParticipants)
        log.maxAlive = Math.max(log.maxAlive, tel.aliveCount)
        if (tel.currentOrder !== lastOrder) {
          log.orders.push({ t: t(), from: lastOrder, to: tel.currentOrder, alive: tel.aliveCount, participants: fightersAll().filter((f) => f.currentOrder === tel.currentOrder).map((f) => f.id) })
          lastOrder = tel.currentOrder
        }
      }
      if (c) {
        for (const f of fightersAll()) {
          let rec = log.fighters.get(f.id)
          if (!rec) { rec = { id: f.id, slot: f.slotIndex, states: [], maxSlotDist: 0, samples: [], born: t() }; log.fighters.set(f.id, rec) }
          const last = rec.states[rec.states.length - 1]
          if (!last || last.state !== f.state || last.order !== f.currentOrder) {
            rec.states.push({ t: t(), state: f.state, order: f.currentOrder, pos: f.mesh.position.clone(), commanderPos: c.mesh.position.clone(), laser: c.laserTelegraphTimer > 0 || !!c.laserFiring })
          }
          rec.maxSlotDist = Math.max(rec.maxSlotDist, f.mesh.position.distanceTo(slotWorld(f, c)))
          rec.lastPos = f.mesh.position.clone()
        }
      }
      // tiros: novos filhos da cena que nascem exatamente na posição de um caça/comandante
      for (const child of rt.scene.children) {
        if (known.has(child)) continue
        known.add(child)
        if (!child.isMesh || child.isGroup) continue
        if (c && (child === c.guideBeamMesh || child === c.laserBeamMesh)) continue
        let shooter = null, best = 0.6
        for (const f of fightersAll()) { const d = child.position.distanceTo(f.mesh.position); if (d < best) { best = d; shooter = `F${f.id}` } }
        if (c) { const d = child.position.distanceTo(c.mesh.position); if (d < best) { best = d; shooter = 'G' } }
        if (shooter) {
          const rec = { t: t(), shooter, born: child.position.clone(), mesh: child, dirs: [] }
          log.shots.push(rec)
          projectileMeshes.set(child, rec)
        }
      }
      for (const [mesh, rec] of projectileMeshes) {
        if (!mesh.parent) { rec.removedAt = rec.removedAt ?? t(); continue }
        if (rec.dirs.length < 2) rec.dirs.push(mesh.position.clone())
      }
    }
  }
  const api = { rt, log, step, commander, fightersAll, t, slotWorld }
  return api
}

const angleBetween = (a, b) => THREE.MathUtils.radToDeg(a.clone().normalize().angleTo(b.clone().normalize()))

export function runGoldenScenarios() {
  const restore = seedRandom()
  const results = []
  const evidence = {}
  const check = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail })
  try {
    // ---- 1. caps, rodízio e ordens em 60 s, em 3 dificuldades ----
    for (const [level, ally] of [[1, 0], [5, 2], [9, 4]]) {
      const tag = `D${level}+${ally}aliados`
      const r = makeRun({ level, ally })
      const cap = getSquadronCapForLevel(level, ally)
      const offCap = getOffensiveCapForLevel(level, ally)
      const startCount = r.fightersAll().length
      check(`${tag}: esquadrão inicial = cap (${cap})`, startCount === cap, `inicial=${startCount}`)
      r.step(60 * 75)
      const L = r.log
      const ordersSeen = new Set(L.orders.map((o) => o.to).filter((o) => o !== 'NONE'))
      check(`${tag}: nunca acima do cap de tamanho (${cap}) nem do cap ofensivo (${offCap})`, L.maxAlive <= cap && L.maxOffensive <= offCap, `alive≤${L.maxAlive} ofensivos≤${L.maxOffensive}`)
      const acted = [...L.fighters.values()].filter((f) => f.states.some((s) => s.state === 'ATTACKING' || s.state === 'PREPARING'))
      check(`${tag}: TODOS os caças agem (rodízio) em 75 s`, acted.length === L.fighters.size && L.fighters.size >= cap, `agiram ${acted.length}/${L.fighters.size}`)
      const participations = [...L.fighters.values()].map((f) => f.states.filter((x) => x.state === 'PREPARING' && f.states.indexOf(x) >= 0).length)
      const mean = participations.reduce((acc, n) => acc + n, 0) / Math.max(1, participations.length)
      check(`${tag}: participação equilibrada (rodízio: nenhum caça com < 50% da média de ordens)`, Math.min(...participations) >= Math.max(1, Math.floor(mean * 0.5)), `participações=${participations.join('/')} média=${mean.toFixed(1)}`)
      const moved = [...L.fighters.values()].filter((f) => f.maxSlotDist > 15)
      check(`${tag}: todos se afastam do slot (>15u) em algum momento`, moved.length === L.fighters.size, `${moved.length}/${L.fighters.size}`)
      const full = [...L.fighters.values()].find((f) => ['FORMATION', 'PREPARING', 'ATTACKING', 'PASSING', 'RETURNING', 'REGROUPING', 'FORMATION'].every((st, i, arr) => {
        let idx = -1
        for (let k = 0; k <= i; k++) { idx = f.states.findIndex((s, j) => j > idx && s.state === arr[k]); if (idx < 0) return false }
        return true
      }))
      check(`${tag}: ciclo FORMATION→PREPARING→ATTACKING→PASSING→RETURNING→REGROUPING→FORMATION observado`, !!full)
      check(`${tag}: ordens observadas ⊇ {STRAFING_RUN, COORDINATED_FIRE, LASER_FLANK}${offCap >= 2 ? ' + PINCER' : ''}`,
        ['STRAFING_RUN', 'COORDINATED_FIRE', 'LASER_FLANK', ...(offCap >= 2 ? ['PINCER'] : [])].every((o) => ordersSeen.has(o)), [...ordersSeen].join(','))
      check(`${tag}: projéteis reais nasceram na nave de caças`, L.shots.filter((s) => s.shooter.startsWith('F')).length > 0, `tiros=${L.shots.length}`)
      evidence[tag] = { participacoes: participations, cap, offCap, orders: [...ordersSeen], fightersActed: `${acted.length}/${L.fighters.size}`, shots: L.shots.length, fighterShots: L.shots.filter((s) => s.shooter.startsWith('F')).length, maxOffensive: L.maxOffensive }
    }

    // ---- 2. Pincer: lados opostos e convergência ----
    {
      const r = makeRun({ level: 5, ally: 2 })
      let sample = null
      r.step(60 * 20, () => {
        const order = r.rt.enemies.getGoldenTelemetry()?.squadron?.currentOrder
        if (order === 'PINCER' && !sample) {
          const c = r.commander()
          const parts = r.fightersAll().filter((f) => f.currentOrder === 'PINCER' && f.state === 'PREPARING')
          if (parts.length >= 2 && parts.every((f) => f.attackContext?.reachedFlank)) {
            const fwd = r.rt.playerPosition.clone().sub(c.mesh.position).normalize()
            const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize()
            sample = parts.map((f) => ({ id: f.id, lateral: f.mesh.position.clone().sub(r.rt.playerPosition).dot(right), distToPlayer: f.mesh.position.distanceTo(r.rt.playerPosition) }))
          }
        }
      })
      check('Pincer: ≥ 2 caças chegam aos pontos de flanco', !!sample && sample.length >= 2, sample ? `n=${sample.length}` : 'nenhuma amostra')
      if (sample) {
        const left = sample.filter((s) => s.lateral < -8), rightS = sample.filter((s) => s.lateral > 8)
        check('Pincer: lados opostos reconhecíveis (≥1 de cada lado, |lateral| > 8u)', left.length >= 1 && rightS.length >= 1, JSON.stringify(sample.map((s) => +s.lateral.toFixed(1))))
        check('Pincer: separação lateral entre os flancos > 30u', Math.max(...sample.map((s) => s.lateral)) - Math.min(...sample.map((s) => s.lateral)) > 30, '')
        evidence.pincer = sample.map((s) => ({ id: s.id, lateral: +s.lateral.toFixed(1), dist: +s.distToPlayer.toFixed(1) }))
      }
      // convergência: no ATTACKING, as posições se aproximam do jogador
      const att = [...r.log.fighters.values()].flatMap((f) => f.states.filter((s) => s.order === 'PINCER' && s.state === 'ATTACKING'))
      const pass = [...r.log.fighters.values()].flatMap((f) => f.states.filter((s) => s.order === 'PINCER' && s.state === 'PASSING'))
      check('Pincer: convergem (ATTACKING → PASSING a < 10u do jogador)', pass.length >= 2 && pass.every((s) => s.pos.distanceTo(r.rt.playerPosition) < 10), pass.map((s) => s.pos.distanceTo(r.rt.playerPosition).toFixed(1)).join(','))
      check('Pincer: há estados ATTACKING registrados', att.length >= 2)
    }

    // ---- 3. Strafing Run: ≥ 4 estados, tiro real da nave do caça, retorno ----
    {
      const r = makeRun({ level: 1, ally: 0 })
      r.step(60 * 30)
      const rec = [...r.log.fighters.values()].find((f) => f.states.some((s) => s.order === 'STRAFING_RUN' && s.state === 'ATTACKING'))
      check('Strafing Run executado por um caça', !!rec)
      if (rec) {
        const names = [...new Set(rec.states.map((s) => s.state))]
        check('Strafing Run: ≥ 4 estados distintos no ciclo', names.length >= 4, names.join('→'))
        check('Strafing Run: distância ao slot muda (> 20u)', rec.maxSlotDist > 20, rec.maxSlotDist.toFixed(1))
        const shot = r.log.shots.find((s) => s.shooter === `F${rec.id}`)
        check('Strafing Run: projétil real nasce na nave do caça e se move', !!shot && shot.dirs.length >= 2 && shot.dirs[1].distanceTo(shot.dirs[0]) > 0.2, shot ? 'ok' : 'sem tiro')
        if (shot && shot.dirs.length >= 2) {
          const dir = shot.dirs[1].clone().sub(shot.dirs[0])
          const toPlayer = r.rt.playerPosition.clone().sub(shot.born)
          check('Strafing Run: tiro aponta para o jogador (≤ 12°)', angleBetween(dir, toPlayer) <= 12, angleBetween(dir, toPlayer).toFixed(1) + '°')
        }
        check('Strafing Run: caça retorna à formação', rec.states[rec.states.length - 1].state === 'FORMATION' || rec.states.some((s) => s.state === 'REGROUPING'))
      }
    }

    // ---- 4. Laser Flank: correlação com o telegraph do comandante ----
    {
      const r = makeRun({ level: 5, ally: 2 })
      r.step(60 * 40)
      const flank = [...r.log.fighters.values()].flatMap((f) => f.states.filter((s) => s.order === 'LASER_FLANK' && s.state === 'PREPARING'))
      check('Laser Flank: caças entram em PREPARING com o laser em telegraph', flank.length >= 1 && flank.every((s) => s.laser), `n=${flank.length}`)
      const tel = r.log.orders.filter((o) => o.to === 'LASER_FLANK')
      check('Laser Flank: ordem registrada no esquadrão', tel.length >= 1)
    }

    // ---- 5. Coordinated Fire: sequência com timestamps espaçados e o Dourado no meio ----
    {
      const r = makeRun({ level: 5, ally: 2 })
      r.step(60 * 30)
      const orders = r.log.orders.filter((o) => o.to === 'COORDINATED_FIRE')
      check('Coordinated Fire executado', orders.length >= 1)
      if (orders.length) {
        const start = orders[0].t
        const seq = r.log.shots.filter((s) => s.t >= start && s.t <= start + 3.5).slice(0, 5)
        const g = seq.findIndex((s) => s.shooter === 'G')
        check('Coordinated Fire: Dourado dispara no meio da sequência (não primeiro nem último)', g > 0 && g < seq.length - 1, seq.map((s) => s.shooter).join('→'))
        const gaps = seq.slice(1).map((s, i) => s.t - seq[i].t)
        check('Coordinated Fire: disparos escalonados (≥ 0,25 s), nunca no mesmo frame', gaps.length >= 2 && gaps.every((x) => x >= 0.25), gaps.map((x) => x.toFixed(2)).join(','))
        evidence.coordinatedFire = { sequencia: seq.map((s) => `${s.shooter}@${s.t.toFixed(2)}`) }
      }
    }

    // ---- 6. Fighters destrutíveis (tiro normal, teleguiado, Swirl), reposição 1 por ciclo, nunca acima do cap ----
    {
      const level = 5, ally = 0
      const r = makeRun({ level, ally })
      const cap = getSquadronCapForLevel(level, ally)
      r.step(60 * 3)
      const victims = r.fightersAll()
      check('esquadrão completo antes dos abates', victims.length === cap, `${victims.length}/${cap}`)
      const hitPoints = []
      const killWith = (f, how) => {
        const prev = f.mesh.position.clone().add(new THREE.Vector3(0, 0, -2))
        const curr = f.mesh.position.clone().add(new THREE.Vector3(0, 0, 2))
        let res = null
        for (let i = 0; i < 20 && !(res && res.killed); i++) {
          res = how === 'swirl'
            ? (r.rt.enemies.resolvePiercingProjectileHits(prev, curr, { damage: 3, piercedTargets: new Set() })?.find?.((h) => h.kind === 'golden_fighter') || null)
            : r.rt.enemies.resolveProjectileHit(prev, curr, { damage: 3, isHoming: how === 'homing' })
        }
        return res
      }
      const before = r.fightersAll().length
      const a = killWith(victims[0], 'normal')
      const b = killWith(victims[1], 'homing')
      check('tiro normal e teleguiado matam caças (kill/score)', a?.killed && a?.enemyKillPoints === 30 && b?.killed && b?.enemyKillPoints === 30, JSON.stringify([a?.killed, a?.enemyKillPoints, b?.killed, b?.enemyKillPoints]))
      r.step(30)
      const afterKill = r.fightersAll().length
      check('abates reduzem o esquadrão (sem referência fantasma)', afterKill === before - 2, `${before}→${afterKill}`)
      check('ordem se adapta aos caças restantes (nunca participante morto)', r.rt.enemies.getGoldenTelemetry().squadron.offensiveParticipants <= getOffensiveCapForLevel(level, ally))
      const interval = getReplenishIntervalForLevel(level)
      const tKill = r.t()
      const counts = []
      let firstRepl = null, secondRepl = null
      r.step(60 * (interval * 2 + 12), () => {
        const n = r.fightersAll().length
        counts.push(n)
        if (n === afterKill + 1 && firstRepl === null) firstRepl = r.t()
        if (n === afterKill + 2 && secondRepl === null) secondRepl = r.t()
      })
      check('reposição: gradual (1 por ciclo), nunca acima do cap', Math.max(...counts) <= cap && firstRepl !== null, `máx=${Math.max(...counts)}/${cap}`)
      check(`reposição: primeiro reforço ≈ ${interval}s depois (tolerância de janela segura)`, firstRepl !== null && firstRepl - tKill >= interval - 1 && firstRepl - tKill <= interval + 12, firstRepl !== null ? (firstRepl - tKill).toFixed(1) : 'sem reposição')
      check('reposição: reforços em ciclos separados (≥ 1 intervalo entre eles)', secondRepl === null || secondRepl - firstRepl >= interval - 1, `${firstRepl?.toFixed(1)}→${secondRepl?.toFixed(1)}`)
      evidence.replenish = { intervalo: interval, primeiro: firstRepl && +(firstRepl - tKill).toFixed(1), segundo: secondRepl && +(secondRepl - tKill).toFixed(1) }

      // Swirl (perfurante)
      const r2 = makeRun({ level: 5, ally: 0 })
      r2.step(60 * 3)
      const v = r2.fightersAll()[0]
      const prev = v.mesh.position.clone().add(new THREE.Vector3(0, 0, -2)); const curr = v.mesh.position.clone().add(new THREE.Vector3(0, 0, 2))
      let swirlKilled = false
      for (let i = 0; i < 10 && !swirlKilled; i++) {
        const hits = r2.rt.enemies.resolvePiercingProjectileHits(prev, curr, { damage: 3, piercedTargets: new Set() })
        const list = Array.isArray(hits) ? hits : (hits?.hits || [])
        swirlKilled = list.some((h) => h.kind === 'golden_fighter' && h.killed)
      }
      check('Swirl perfurante mata caças', swirlKilled)
    }

    // ---- 7. Teleporte do comandante: caças não teleportam, desorganizam e regressam fisicamente ----
    {
      const r = makeRun({ level: 5, ally: 0 })
      r.step(60 * 3)
      const c = r.commander()
      const fightersBefore = r.fightersAll().map((f) => ({ id: f.id, pos: f.mesh.position.clone() }))
      const commanderBefore = c.mesh.position.clone()
      // dano por projétil ao comandante pelo mesmo caminho do jogo (dispara teleporte reativo)
      const prev = c.mesh.position.clone().add(new THREE.Vector3(0, 0, -2)); const curr = c.mesh.position.clone().add(new THREE.Vector3(0, 0, 2))
      r.rt.enemies.resolveProjectileHit(prev, curr, { damage: 1, isHoming: false })
      const commanderAfter = r.commander().mesh.position.clone()
      const jumped = commanderBefore.distanceTo(commanderAfter)
      check('comandante teleportou (salto > 10u)', jumped > 10, `salto=${jumped.toFixed(1)}`)
      const fightersAfter = r.fightersAll()
      check('caças NÃO teleportaram junto (posições inalteradas no frame do teleporte)', fightersAfter.every((f) => { const b = fightersBefore.find((x) => x.id === f.id); return b && b.pos.distanceTo(f.mesh.position) < 0.001 }))
      check('caças em formação/preparo/retorno entram em DISORGANIZED; ATTACKING/PASSING terminam a passada', fightersAfter.every((f) => ['DISORGANIZED', 'REGROUPING', 'ATTACKING', 'PASSING'].includes(f.state)) && fightersAfter.some((f) => f.state === 'DISORGANIZED'), fightersAfter.map((f) => f.state).join(','))
      const seen = new Set()
      let backAt = null
      r.step(60 * 25, () => {
        for (const f of r.fightersAll()) seen.add(f.state)
        if (backAt === null && r.fightersAll().every((f) => f.state === 'FORMATION')) backAt = r.t()
      })
      check('caças atravessam REGROUPING fisicamente até o comandante e voltam a FORMATION', seen.has('REGROUPING') && backAt !== null, [...seen].join(','))
      evidence.teleport = { salto: +jumped.toFixed(1), estados: [...seen], voltaEm: backAt && +backAt.toFixed(1) }
    }

    // ---- 8. comandante sozinho continua agindo ----
    {
      const r = makeRun({ level: 3, ally: 0 })
      r.step(60 * 2)
      for (const f of r.fightersAll()) {
        const p0 = f.mesh.position.clone().add(new THREE.Vector3(0, 0, -2)); const p1 = f.mesh.position.clone().add(new THREE.Vector3(0, 0, 2))
        for (let i = 0; i < 20; i++) if (r.rt.enemies.resolveProjectileHit(p0, p1, { damage: 5 })?.killed) break
      }
      r.step(30)
      const alone = r.fightersAll().length
      const gShots0 = r.log.shots.filter((s) => s.shooter === 'G').length
      r.step(60 * 15)
      const gShots1 = r.log.shots.filter((s) => s.shooter === 'G').length
      check('comandante sozinho (sem caças vivos) continua disparando', alone === 0 && gShots1 > gShots0, `caças=${alone}, tiros ${gShots0}→${gShots1}`)
    }
  } finally {
    restore()
  }
  return { results, evidence }
}
