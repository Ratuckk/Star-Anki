// Display de Armamento — widgets FOCO [D] e SWIRL da coluna esquerda (zona .hud-left-actions).
// Opção B aprovada pelo usuário (protótipo foco-swirl-v2): etiqueta vertical, leitura temporal
// grande, label secundária e medidor contínuo com 4 marcas. O widget é a fonte visual AUTORITATIVA
// do estado do comando: não existe mais nenhum aviso/painel acima da nave.
//
// Toda informação vem do runtime real (getSquadronCommandState / player.getSwirlCooldown*); este
// módulo não mantém relógio próprio. Só microanimações locais (classes com timeout curto).
import { aiValidator } from './ai-validator.js'

export const ARMAMENT_WORD = Object.freeze({ ready: 'PRONTO', active: 'ATIVO', cooling: 'RECARGA' })
export const ARMAMENT_READY_SUB = 'DISPONÍVEL'
const IGNITE_MS = 280
const FIRE_MS = 240
const READY_FLASH_MS = 260

const clamp01 = (v) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0)
const validMax = (v) => Number.isFinite(v) && v > 0
const validRemaining = (v) => (Number.isFinite(v) && v > 0 ? v : 0)

// Contrato: o HUD só REPRESENTA o estado real do runtime; nunca reconstrói duração/cooldown.
// Se o wiring vier incompleto (max ausente/<=0/não-finito) NADA é inventado: o texto usa o tempo
// restante real e a barra assume um valor visual seguro (ACTIVE = cheia, COOLDOWN = vazia), sem
// fingir proporção. O problema é devolvido em `wiring` e reportado pelo widget via aiValidator.

// FOCO: READY / ACTIVE / COOLDOWN, com os valores reais fornecidos por combat.getSquadronCommandState().
export function computeFocoView(cmd) {
  const { mode = 'free' } = cmd || {}
  const wiring = []
  const rawDur = cmd?.durationRemaining
  const rawCd = cmd?.cooldownRemaining
  if (rawDur != null && !Number.isFinite(rawDur)) wiring.push('durationRemaining')
  if (rawCd != null && !Number.isFinite(rawCd)) wiring.push('cooldownRemaining')
  const durationRemaining = validRemaining(rawDur)
  const cooldownRemaining = validRemaining(rawCd)
  const isActive = mode === 'focus' && durationRemaining > 0
  const isCooling = !isActive && cooldownRemaining > 0
  if (isActive) {
    const ok = validMax(cmd.durationMax)
    if (!ok) wiring.push('durationMax')
    return {
      state: 'active',
      value: `${durationRemaining.toFixed(1)}s`,
      sub: ARMAMENT_WORD.active,
      frac: ok ? clamp01(durationRemaining / cmd.durationMax) : 1,
      wiring,
    }
  }
  if (isCooling) {
    const ok = validMax(cmd.cooldownMax)
    if (!ok) wiring.push('cooldownMax')
    return {
      state: 'cooling',
      value: `${Math.ceil(cooldownRemaining)}s`,
      sub: ARMAMENT_WORD.cooling,
      frac: ok ? clamp01((cmd.cooldownMax - cooldownRemaining) / cmd.cooldownMax) : 0,
      wiring,
    }
  }
  return { state: 'ready', value: ARMAMENT_WORD.ready, sub: ARMAMENT_READY_SUB, frac: 1, wiring }
}

// SWIRL: só READY / COOLDOWN. O total efetivo (pode ser alterado por cartas) vem do player; se
// vier inválido nada é inventado (barra vazia + `wiring`).
export function computeSwirlView(cooldownMs, totalMs) {
  const wiring = []
  if (cooldownMs != null && !Number.isFinite(cooldownMs)) wiring.push('cooldownMs')
  const remaining = validRemaining(cooldownMs)
  if (remaining > 0) {
    const ok = validMax(totalMs)
    if (!ok) wiring.push('totalMs')
    return {
      state: 'cooling',
      value: `${(remaining / 1000).toFixed(1)}s`,
      sub: ARMAMENT_WORD.cooling,
      frac: ok ? clamp01((totalMs - remaining) / totalMs) : 0,
      wiring,
    }
  }
  return { state: 'ready', value: ARMAMENT_WORD.ready, sub: ARMAMENT_READY_SUB, frac: 1, wiring }
}

// kind: 'foco' | 'swirl'. schedule(fn, ms) deve ser um timeout rastreado pelo dono (limpo no unmount).
export function createArmamentWidget({ doc = document, kind, tag, schedule = (fn, ms) => setTimeout(fn, ms) }) {
  const el = doc.createElement('div')
  el.className = `hud-armament hud-armament--${kind} is-ready`
  el.setAttribute('role', 'img')
  el.setAttribute('aria-label', `${tag} ${ARMAMENT_WORD.ready}`)

  const tagEl = doc.createElement('div')
  tagEl.className = 'hud-arm-tag'
  tagEl.textContent = tag
  const main = doc.createElement('div')
  main.className = 'hud-arm-main'
  const readout = doc.createElement('div')
  const valueEl = doc.createElement('div')
  valueEl.className = 'hud-arm-value'
  const subEl = doc.createElement('div')
  subEl.className = 'hud-arm-sub'
  readout.appendChild(valueEl)
  readout.appendChild(subEl)
  const gauge = doc.createElement('div')
  gauge.className = 'hud-arm-gauge'
  const fill = doc.createElement('div')
  fill.className = 'hud-arm-fill'
  gauge.appendChild(fill)
  main.appendChild(readout)
  main.appendChild(gauge)
  const sweep = doc.createElement('span')
  sweep.className = 'hud-arm-sweep'
  el.appendChild(tagEl)
  el.appendChild(main)
  el.appendChild(sweep)

  let state = null
  let lastValue = null
  let lastSub = null
  let lastPct = null
  let destroyed = false
  let reportedWiring = ''
  const timers = new Set()

  function flash(className, ms) {
    el.classList.remove(className)
    void el.offsetWidth // reinicia a animação CSS
    el.classList.add(className)
    const t = schedule(() => {
      timers.delete(t)
      el.classList.remove(className)
    }, ms)
    timers.add(t)
  }

  // Só toca o DOM quando algo muda (nada de recriar nós por frame).
  function update(view) {
    if (destroyed) return
    // wiring quebrado é REPORTADO (uma vez por combinação de problemas), nunca mascarado
    const wiringKey = (view.wiring || []).join(',')
    if (wiringKey !== reportedWiring) {
      reportedWiring = wiringKey
      if (wiringKey) {
        aiValidator.expect(
          `armament(${kind}): runtime forneceu duração/cooldown válidos`,
          () => false,
          { kind, state: view.state, invalid: view.wiring },
        )
      }
    }
    if (state === null || view.state !== state) {
      const prev = state
      el.classList.remove('is-ready', 'is-active', 'is-cooling')
      el.classList.add(`is-${view.state}`)
      el.setAttribute('aria-label', `${tag} ${ARMAMENT_WORD[view.state]}`)
      // microanimações apenas nas transições (a inicial não anima)
      if (prev !== null) {
        if (kind === 'foco' && prev === 'ready' && view.state === 'active') flash('is-igniting', IGNITE_MS)
        else if (kind === 'swirl' && prev === 'ready' && view.state === 'cooling') flash('is-firing', FIRE_MS)
        else if (view.state === 'ready') flash('is-ready-flash', READY_FLASH_MS)
      }
      state = view.state
    }
    if (view.value !== lastValue) {
      valueEl.textContent = view.value
      lastValue = view.value
    }
    if (view.sub !== lastSub) {
      subEl.textContent = view.sub
      lastSub = view.sub
    }
    const pct = Math.round(view.frac * 1000) / 10
    if (pct !== lastPct) {
      fill.style.width = `${pct}%`
      lastPct = pct
      aiValidator.expect(
        `armament(${kind}): fração do medidor em [0,1]`,
        () => view.frac >= 0 && view.frac <= 1,
        { kind, frac: view.frac, state: view.state },
      )
    }
  }

  function destroy() {
    destroyed = true
    for (const t of timers) clearTimeout(t)
    timers.clear()
    el.remove()
  }

  update({ state: 'ready', value: ARMAMENT_WORD.ready, sub: ARMAMENT_READY_SUB, frac: 1 })
  return { el, update, destroy, getState: () => state }
}
