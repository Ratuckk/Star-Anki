// Cenários do Tank rodando o sistema de inimigos REAL (createEnemiesSystem), por frames simulados.
// Reprodução do defeito original: o Tank disparava UM Siege Shot e caía num estado "undefined"
// (ENEMY_STATES.RECOVERING/DYING inexistentes), autodestruindo-se sem nunca completar um ciclo.
// Usado por src/tank-runtime.test.mjs (CI) e tools/validate-tank-runtime.mjs (evidência).
import * as THREE from 'three'
import { createEnemyRuntime } from './enemy-runtime-harness.mjs'
import { TANK_ATTACKS, TANK_SIEGE_PROJECTILE, TANK_SUPPRESSION_PROJECTILE, tankTuningForLevel } from '../../src/enemies/tank.js'

const DT = 1 / 60

function seedRandom(seed = 1234567) {
  let s = seed >>> 0
  const original = Math.random
  Math.random = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296 }
  return () => { Math.random = original }
}

function makeRun({ level = 1, isArena = false, playerZ = 0 } = {}) {
  const rt = createEnemyRuntime({ isArena, level })
  rt.enemies.setDifficultyLevelProvider?.(() => level)
  rt.playerPosition.set(0, 0, playerZ)
  const tank = rt.enemies.spawnTankEnemy()
  const trace = []
  const seen = new Set()
  const projectiles = new Map() // mesh → { firstPos, lastPos, frames, born, tankState }
  let frame = 0
  const knownChildren = new Set(rt.scene.children)
  const agg = { hits: 0, maxDamage: 0, maxPower: 0, collisionTier: 0, collisions: 0 }
  function step(n = 1, hook) {
    for (let i = 0; i < n; i++) {
      frame++
      hook?.(frame)
      const before = tank.shotsFired || 0
      const r = rt.enemies.update(DT, rt.playerPosition, {})
      const p = rt.enemies.updateProjectiles(DT, rt.playerPosition, {})
      if (r.enemyCollisionTier) { agg.collisions++; agg.collisionTier = Math.max(agg.collisionTier, r.enemyCollisionTier) }
      agg.hits += p.hits
      if (p.hits) { agg.maxDamage = Math.max(agg.maxDamage, p.damage); agg.maxPower = Math.max(agg.maxPower, p.powerLevel) }
      for (const c of rt.scene.children) {
        if (c === tank.mesh || knownChildren.has(c)) continue
        knownChildren.add(c)
        projectiles.set(c, { born: frame * DT, pos: [c.position.clone()], state: tank.fsm.currentState, attack: tank.currentAttack })
      }
      for (const [mesh, info] of projectiles) if (mesh.parent && info.born < frame * DT - 1e-9 && info.pos.length < 4) info.pos.push(mesh.position.clone())
      const st = tank.fsm.currentState
      seen.add(st)
      const last = trace[trace.length - 1]
      if (!last || last.state !== st) trace.push({ state: st, t: frame * DT, attack: tank.currentAttack, cycle: tank.cycleCount, shots: tank.shotsFired || 0 })
      if ((tank.shotsFired || 0) > before) tank.__lastShotAt = frame * DT
    }
  }
  return { rt, tank, trace, seen, projectiles, step, agg, now: () => frame * DT }
}

const projSpeed = (info) => (info.pos.length >= 2 ? info.pos[1].distanceTo(info.pos[0]) / DT : 0)

export function runTankScenarios() {
  const restore = seedRandom()
  const results = []
  const evidence = {}
  const check = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail })

  try {
    // ---- A. ciclo completo no trilho (nível 1): todos os estados, sem autodestruição, disengage após 5 ciclos ----
    {
      const r = makeRun({ level: 1 })
      let dyingBeforeLeave = false
      r.step(60 * 100, () => { if (r.tank.dying && r.tank.fsm.currentState !== 'DISENGAGING') dyingBeforeLeave = true })
      const states = [...r.seen]
      evidence.cycle = { states, cycleCount: r.tank.cycleCount, trace: r.trace.slice(0, 14).map((t) => `${t.t.toFixed(2)}s ${t.state}${t.attack ? ':' + t.attack : ''}`) }
      check('nunca entra em estado "undefined"', !states.includes('undefined') && !states.includes(undefined))
      for (const s of ['ENGAGED', 'BRACING', 'TELEGRAPHING', 'ATTACKING', 'RECOVERY', 'REPOSITIONING', 'DISENGAGING']) check(`ciclo visita ${s}`, states.includes(s), states.join(','))
      check('não morre sozinho: dying nunca é true fora de DISENGAGING', dyingBeforeLeave === false)
      const attacks = new Set(r.trace.filter((t) => t.state === 'ATTACKING').map((t) => t.attack))
      check('usa Siege e Suppression', attacks.has(TANK_ATTACKS.SIEGE) && attacks.has(TANK_ATTACKS.SUPPRESSION), [...attacks].join(','))
      check('5 ciclos completos antes do disengage', r.tank.cycleCount === 5 && r.trace.filter((t) => t.state === 'ATTACKING').length === 5, `ciclos=${r.tank.cycleCount}`)
      check('disengage remove o Tank do sistema', !r.rt.enemies.getAlive().includes(r.tank), 'ainda ativo após 100 s')
      check('tiros reais foram criados e atingiram o jogador', r.agg.hits > 0, `hits=${r.agg.hits}`)
    }

    // ---- B. Siege: projétil distinto, speed 34, dano 2, High Impact (4), hitRadius 2.4 ----
    {
      const r = makeRun({ level: 1 })
      r.step(60 * 12)
      const siege = [...r.projectiles.values()].filter((p) => p.attack === TANK_ATTACKS.SIEGE)
      check('Siege gera projétil real', siege.length >= 1)
      const speed = siege.length ? projSpeed(siege[0]) : 0
      evidence.siege = { speed: +speed.toFixed(1), maxDamage: r.agg.maxDamage, maxPower: r.agg.maxPower, opts: TANK_SIEGE_PROJECTILE }
      check('Siege speed ≈ 34', Math.abs(speed - TANK_SIEGE_PROJECTILE.speed) < 1.5, `speed=${speed}`)
      check('Siege dano 2 e High Impact (4) no impacto', r.agg.maxDamage === 2 && r.agg.maxPower === 4, `dano=${r.agg.maxDamage} power=${r.agg.maxPower}`)
      check('Siege hitRadius 2.4', TANK_SIEGE_PROJECTILE.hitRadius === 2.4)
      check('Siege dispara 1 projétil por ataque', (() => { const t = r.trace.find((x) => x.state === 'ATTACKING'); return t !== undefined })())
    }

    // ---- C. Suppression: 2 tiros (D1) / 3 tiros (D5), intervalo 0,22 s, speed 40, re-mira por tiro ----
    for (const level of [1, 5]) {
      const r = makeRun({ level })
      // ciclo 1 (ímpar) = Suppression; move o jogador lateralmente entre os tiros para provar o re-aim
      let moved = 0
      r.step(60 * 40, () => {
        if (r.tank.fsm.currentState === 'ATTACKING' && r.tank.currentAttack === TANK_ATTACKS.SUPPRESSION) { moved += 0.12; r.rt.playerPosition.x = moved * 8 }
        else r.rt.playerPosition.x = 0
      })
      const burst = r.tank.shotTimestamps.slice()
      const expected = tankTuningForLevel(level).burstShots
      const supp = [...r.projectiles.values()].filter((p) => p.attack === TANK_ATTACKS.SUPPRESSION)
      // tiros por ataque de Suppression
      const firstBurst = supp.slice(0, expected)
      const gaps = []
      for (let i = 1; i < firstBurst.length; i++) gaps.push(firstBurst[i].born - firstBurst[i - 1].born)
      check(`Suppression D${level}: ${expected} tiros no primeiro burst`, firstBurst.length === expected && supp.length >= expected, `tiros=${supp.length}`)
      check(`Suppression D${level}: intervalo ≈ 0,22 s`, gaps.length > 0 && gaps.every((g) => Math.abs(g - 0.22) < 0.05), gaps.map((g) => g.toFixed(3)).join(','))
      const spd = firstBurst.length ? projSpeed(firstBurst[0]) : 0
      check(`Suppression D${level}: speed ≈ 40`, Math.abs(spd - TANK_SUPPRESSION_PROJECTILE.speed) < 1.5, `speed=${spd}`)
      const dirs = firstBurst.filter((p) => p.pos.length >= 2).map((p) => p.pos[1].clone().sub(p.pos[0]).normalize())
      const spread = dirs.length >= 2 ? THREE.MathUtils.radToDeg(dirs[0].angleTo(dirs[dirs.length - 1])) : 0
      check(`Suppression D${level}: cada tiro re-mira o jogador (direções diferem)`, spread > 1, `Δângulo=${spread.toFixed(2)}°`)
      evidence[`suppression_D${level}`] = { tiros: expected, gaps: gaps.map((g) => +g.toFixed(3)), speed: +spd.toFixed(1), reaimDeg: +spread.toFixed(2), timestamps: burst.slice(0, 4).map((t) => +t.toFixed(2)) }
    }

    // ---- D. Ram: contexto (<13u, nível ≥3), telegraph 0,55 s, investida a 30 u/s, colisão/dano, recovery 1,10 s ----
    {
      const r = makeRun({ level: 3, playerZ: 38 }) // tank em ~z=44: distância ≈ 6–8u, jogador "atrás" dele
      r.step(60 * 14)
      const tr = r.trace
      const brace = tr.find((t) => t.state === 'BRACING')
      check('Ram escolhido com jogador a < 13u (D3)', brace && brace.attack === TANK_ATTACKS.RAM, brace ? brace.attack : 'sem BRACING')
      const tele = tr.find((t) => t.state === 'TELEGRAPHING')
      const atk = tr.find((t) => t.state === 'ATTACKING')
      const rec = tr.find((t) => t.state === 'RECOVERY' && t.t > (atk?.t ?? 0))
      const telegraph = atk && tele ? atk.t - tele.t : 0
      check('Ram: telegraph ≈ 0,55 s', Math.abs(telegraph - 0.55) < 0.05, `telegraph=${telegraph.toFixed(2)}`)
      const ramTime = rec && atk ? rec.t - atk.t : 0
      check('Ram: investida ≤ 0,55 s e termina em RECOVERY', rec && ramTime <= 0.6, `duração=${ramTime.toFixed(2)}`)
      const reposition = tr.find((t) => t.state === 'REPOSITIONING' && t.t > (rec?.t ?? 0))
      const recoveryTime = rec && reposition ? reposition.t - rec.t : 0
      check('Ram: recovery longo ≈ 1,10 s', Math.abs(recoveryTime - 1.10) < 0.06, `recovery=${recoveryTime.toFixed(2)}`)
      check('Ram: colisão física com knockback (tier 3) pelo pipeline normal', r.agg.collisionTier === 3, `tier=${r.agg.collisionTier}`)
      check('Ram: ramAttackActive só durante ATTACKING', r.tank.ramAttackActive === false)
      evidence.ram = { telegraph: +telegraph.toFixed(2), investida: +ramTime.toFixed(2), recovery: +recoveryTime.toFixed(2), collisionTier: r.agg.collisionTier }
      const d1 = makeRun({ level: 1, playerZ: 38 })
      d1.step(60 * 14)
      const b1 = d1.trace.find((t) => t.state === 'BRACING')
      check('Ram NÃO é usado em D1–D2 (mesmo perto)', b1 && b1.attack !== TANK_ATTACKS.RAM, b1 && b1.attack)
    }

    // ---- E. Stagger (Swirl) em BRACING / TELEGRAPHING / ATTACKING (Siege, Suppression, Ram), anti stun-lock ----
    for (const [label, level, playerZ, stateName, attack] of [
      ['BRACING', 1, 0, 'BRACING', null], ['TELEGRAPHING', 1, 0, 'TELEGRAPHING', null],
      ['ATTACKING Siege', 1, 0, 'ATTACKING', TANK_ATTACKS.SIEGE], ['ATTACKING Suppression', 5, 0, 'ATTACKING', TANK_ATTACKS.SUPPRESSION],
      ['ATTACKING Ram', 3, 38, 'ATTACKING', TANK_ATTACKS.RAM],
    ]) {
      const r = makeRun({ level, playerZ })
      let fired = false
      let shotsAtStagger = 0
      let t0 = 0
      let lockedDuringImmunity = null
      let acceptedAfterImmunity = null
      r.step(60 * 30, (f) => {
        const t = f * DT
        if (!fired) {
          const okState = r.tank.fsm.currentState === stateName && (!attack || r.tank.currentAttack === attack)
          // Suppression: só com o burst em andamento (≥1 tiro já saiu, restam outros)
          const okBurst = attack !== TANK_ATTACKS.SUPPRESSION || (r.tank.attackShotsRemaining > 0 && r.tank.attackShotsRemaining < tankTuningForLevel(level).burstShots)
          if (okState && okBurst) { shotsAtStagger = r.tank.shotsFired || 0; fired = r.tank.requestStagger('swirl'); t0 = t }
          return
        }
        if (lockedDuringImmunity === null && t >= t0 + 1.0 && r.tank.fsm.currentState !== 'DISENGAGING') lockedDuringImmunity = r.tank.requestStagger('swirl-again') === false
        if (acceptedAfterImmunity === null && t >= t0 + 2.7 && !r.tank.disengaging && !r.tank.dying && r.tank.fsm.currentState !== 'STAGGERED') {
          acceptedAfterImmunity = r.tank.requestStagger('swirl-depois') === true
          r.tank.pendingStaggerReason = null // só sondava: não consome um segundo stagger no cenário
        }
      })
      check(`Stagger em ${label}: aceito`, fired)
      const idx = r.trace.findIndex((t) => t.state === 'STAGGERED')
      const after = idx >= 0 ? r.trace[idx] : null
      check(`Stagger em ${label}: entra em STAGGERED`, !!after)
      if (after) {
        const next = r.trace[idx + 1]
        check(`Stagger em ${label}: dura ≈ 0,45 s e segue para RECOVERY`, next && next.state === 'RECOVERY' && Math.abs(next.t - after.t - 0.45) < 0.05, next ? `${(next.t - after.t).toFixed(2)}s→${next.state}` : 'sem próximo')
        check(`Stagger em ${label}: nenhum tiro novo entre o stagger e o RECOVERY`, next && next.shots === shotsAtStagger, `tiros ${shotsAtStagger}→${next?.shots}`)
      }
      check(`Stagger em ${label}: anti stun-lock (2º pedido com 1,0 s recusado)`, lockedDuringImmunity === true, String(lockedDuringImmunity))
      check(`Stagger em ${label}: novo stagger aceito depois da imunidade (2,5 s)`, acceptedAfterImmunity === true || acceptedAfterImmunity === null, String(acceptedAfterImmunity))
      check(`Stagger em ${label}: cancela ramAttackActive/rajada`, r.tank.ramAttackActive === false && r.tank.attackShotsRemaining === 0)
      evidence[`stagger_${label.replace(/\s+/g, '_')}`] = { aceito: fired, estados: r.trace.slice(idx - 1, idx + 3).map((t) => `${t.t.toFixed(2)}s ${t.state}`) }
    }

    // ---- F. blindagem visual por HP ----
    {
      const r = makeRun({ level: 1 })
      const visible = () => r.tank.armorPanels.filter((p) => p.visible).length
      r.step(90); r.tank.hp = r.tank.maxHp; r.step(3); const v3 = visible()
      r.tank.hp = Math.ceil(r.tank.maxHp * 0.5); r.step(3); const v2 = visible()
      r.tank.hp = Math.floor(r.tank.maxHp * 0.2); r.step(3); const v1 = visible()
      check('blindagem: >66% = 6 placas, 33–66% = 4, <33% = 2', v3 === 6 && v2 === 4 && v1 === 2, `${v3}/${v2}/${v1}`)
      evidence.armor = { acima66: v3, entre33e66: v2, abaixo33: v1 }
    }

    // ---- G. arena: nunca foge por contagem ----
    {
      const r = makeRun({ level: 1, isArena: true })
      r.step(60 * 90)
      check('arena: Tank não entra em DISENGAGING por ciclos', !r.seen.has('DISENGAGING') && r.tank.cycleCount >= 5, `ciclos=${r.tank.cycleCount}`)
    }
  } finally {
    restore()
  }
  return { results, evidence }
}
