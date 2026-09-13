import { DEFAULT_FIRE_COOLDOWN } from './combat.js'

// ============ ESCUDO ============
// camada de defesa em FRENTE à barra de saúde: uma barra contínua (não binário cheio/vazio).
// Cada hit consome 1 unidade; depois de um hit, espera SHIELD_REGEN_DELAY_MS e passa a
// regenerar sozinho a SHIELD_REGEN_RATE por segundo — regenera aos poucos mesmo sem ter sido
// zerado de vez, não só quando esgota totalmente.
const SHIELD_MAX = 3 // era 2 (pedido do usuário: +1 de resistência inicial)
const SHIELD_REGEN_DELAY_MS = 1500
const SHIELD_REGEN_RATE = 0.4
const SHIELD_MAX_CAP = 4
const SHIELD_REGEN_DELAY_FLOOR_MS = 500

const INVINCIBILITY_MS = 1500
const INVINCIBILITY_CAP_MS = 3000

const WINGMAN_CAP = 2
const LIVES_CAP = 5

const FIRE_COOLDOWN_MULT_PER_CORRECT = 0.85
const FIRE_COOLDOWN_FLOOR = 0.06
const PROJECTILE_COUNT_CAP = 4
const PROJECTILE_COUNT_START = 1

// tiro teleguiado: segurar o botão de atirar carrega, de HOMING_CHARGE_MIN_MS (começa a valer)
// até HOMING_CHARGE_MAX_MS (carga máxima); nº de alvos escala com homingMaxTargets (cartas
// aumentam), travando um novo a cada HOMING_LOCK_INTERVAL_MS (ver currentHomingAllowedTargets
// em main.js)
const HOMING_CHARGE_MIN_MS = 1000
const HOMING_CHARGE_MAX_MS = 4000
const HOMING_CHARGE_MIN_FLOOR_MS = 1000
const HOMING_MAX_TARGETS_BASE = 4
const HOMING_MAX_TARGETS_CAP = 8

// giro completo (Z/C, 2 toques): cooldown global (não importa o lado) pra não spammar
// invencibilidade, e quanto de i-frame cada giro concede (cartas somam em cima)
const FULL_SPIN_COOLDOWN_MS = 3000
const FULL_SPIN_IFRAME_MS_BASE = 900

// ============ PROPULSOR / REPULSOR (A/S) ============
// 1 barra COMPARTILHADA entre os dois: ao usar qualquer um, a barra zera e recarrega devagar;
// não dá pra usar de novo (nenhum dos dois) enquanto não encher totalmente.
const BOOST_DURATION_MS = 900
const BOOST_RECHARGE_MS = 4500
const PROPULSION_SPEED_MULT = 1.9 // multiplicador de velocidade de avanço durante o impulso
const REPULSION_SPEED_MULT = 0.35 // multiplicador de velocidade de avanço durante a repulsão

// ============ BUFFS MÁXIMOS (debug) ============
// quantas aplicações de cartas SEM CAP definido são tratadas como "máximo" pelo debug
// "Aplicar buffs máximos" — ver comentário dentro de debugMaxBuffs(). Não é usado pelo jogo
// normal, só pela ação de debug (mantido aqui pra ficar perto de onde é consumido).
const DEBUG_MAX_UNCAPPED_STACKS = 4

// estado do JOGADOR: vida/vidas, escudo, invencibilidade, boost, cooldowns e os stats que as
// cartas roguelike mutam (projectileCount, fireCooldown, aimAssistAngle, homingMaxTargets...).
// Não inclui posição/movimento (rail.js), nem projéteis/armas de verdade (combat.js) — só o
// estado "de personagem" que main.js consultava direto antes desta refatoração.
export function createPlayerSystem(session) {
  const maxHealth = session.health
  let maxLives = session.lives

  let shieldMax = SHIELD_MAX
  let shieldRegenDelayMs = SHIELD_REGEN_DELAY_MS
  let shieldRegenRate = SHIELD_REGEN_RATE
  let shieldValue = shieldMax
  let shieldRegenDelayTimer = 0

  let invincibilityDurationMs = INVINCIBILITY_MS
  let invincibleTimer = 0
  // pedido do usuário: "não pisque a nave no rolamento, dê afterimage" — precisa saber SE o
  // invincibleTimer atual veio do giro completo (rolamento) especificamente, já que ele e o
  // i-frame de dano/ram compartilham o mesmo timer. Timer paralelo, só pra essa distinção.
  let rollIframeTimer = 0

  let wingmanCount = 0
  let deflectCardActive = false
  let homingMaxTargets = HOMING_MAX_TARGETS_BASE
  let homingChargeMinMs = HOMING_CHARGE_MIN_MS
  let homingChargeMaxMs = HOMING_CHARGE_MAX_MS
  let fullSpinIframeMs = FULL_SPIN_IFRAME_MS_BASE
  let fullSpinCooldownTimer = 0

  let boostCharge = 1
  let propulsionActiveTimer = 0
  let repulsionActiveTimer = 0
  let ramCardActive = false

  let fireCooldown = DEFAULT_FIRE_COOLDOWN
  let projectileCount = PROJECTILE_COUNT_START

  // QoL (v0.29.4): única fonte de verdade de "pode usar boost?" — antes a checagem estava
  // copiada dentro de activatePropulsion/activateRepulsion, e canUseBoost() existia na API
  // pública mas era código morto (nunca chamado). Agora os três pontos (público + os dois
  // activate*) leem daqui.
  function boostReady() {
    return boostCharge >= 1 && propulsionActiveTimer <= 0 && repulsionActiveTimer <= 0
  }

  // saúde zerada consome 1 vida e reabastece a saúde (e o escudo); zerar as vidas é que
  // realmente acaba a run. Chamar isso é seguro mesmo com saúde > 0 (vira no-op) — usado tanto
  // pelo dano em combate (takeDamage) quanto por errar uma pergunta (main.js decrementa
  // session.health e chama isso na sequência).
  function applyHealthLoss() {
    if (session.health > 0) return false
    // QoL (v0.29.4): clamp de session.lives em 0 — antes ia pra -1 se chamada duas vezes com
    // health=0 (multi-hit no mesmo frame, ou debug + hit real), deixando o HUD de pips e o
    // debug reportando um número negativo de vidas. O segundo guard evita decrementar de novo
    // depois de já ter morrido.
    if (session.lives <= 0) return true
    session.lives -= 1
    if (session.lives <= 0) {
      session.lives = 0
      return true
    }
    session.health = maxHealth
    shieldValue = shieldMax
    shieldRegenDelayTimer = 0
    return false
  }

  return {
    // objeto mutável que combat.js (Fase 3) e main.js leem direto, sem setters
    config: {
      get projectileCount() { return projectileCount },
      get fireCooldown() { return fireCooldown },
      get homingMaxTargets() { return homingMaxTargets },
      get homingChargeMinMs() { return homingChargeMinMs },
      get homingChargeMaxMs() { return homingChargeMaxMs },
    },

    getMaxHealth: () => maxHealth,
    getMaxLives: () => maxLives,
    getShieldValue: () => shieldValue,
    getShieldMax: () => shieldMax,
    isInvincible: () => invincibleTimer > 0,
    // pedido do usuário: nave não pisca durante o rolamento — main.js usa isso pra suprimir o
    // flicker padrão de invencibilidade e mostrar afterimage no lugar só nessa janela
    isRollIframeActive: () => rollIframeTimer > 0,
    getInvincibleRemainingMs: () => invincibleTimer,
    isFullSpinOnCooldown: () => fullSpinCooldownTimer > 0,
    isDeflectActive: () => deflectCardActive,
    isRamCardActive: () => ramCardActive,
    getWingmanCount: () => wingmanCount,

    getBoostCharge: () => boostCharge,
    isPropulsionActive: () => propulsionActiveTimer > 0,
    isRepulsionActive: () => repulsionActiveTimer > 0,
    getPropulsionActiveTimer: () => propulsionActiveTimer,

    getLowHealthIntensity(thresholdFrac) {
      // QoL (v0.29.4): clamp de thresholdFrac em (0, 1] — antes, passar 0 desligava a vignette
      // em silêncio (threshold=0, session.health >= 0 sempre true) e passar >1 a ligava com
      // vida cheia (threshold maior que maxHealth). Hoje o único call site passa 0.4 via
      // LOW_HEALTH_THRESHOLD_FRAC em main.js, mas o valor é ajustável e o método não protegia
      // contra configuração inválida.
      const frac = Math.max(0.01, Math.min(1, thresholdFrac))
      const threshold = maxHealth * frac
      if (session.health >= threshold) return 0
      return Math.max(0, Math.min(1, 1 - session.health / threshold))
    },

    // QoL (v0.29.4): snapshot de tudo que as cartas mutam — pra debug panel/HUD mostrarem os
    // valores reais sem espalhar `player.config.X` em N lugares. Não substitui o `config`
    // (que combat.js lê por getter pra evitar cópia desatualizada); só dá um ponto único de
    // leitura pra debug/telemetria.
    getStats() {
      return {
        projectileCount,
        fireCooldown,
        homingMaxTargets,
        homingChargeMinMs,
        homingChargeMaxMs,
        shieldMax,
        shieldValue,
        shieldRegenDelayMs,
        shieldRegenRate,
        invincibilityDurationMs,
        fullSpinIframeMs,
        wingmanCount,
        hasDeflect: deflectCardActive,
        hasRam: ramCardActive,
      }
    },

    // QoL (v0.29.4): guard contra card inválido + retorno boolean. Antes quebrava com
    // `Cannot read property 'id' of undefined` se card fosse null, e não devolvia nada —
    // main.js não tinha como saber que uma carta no cap foi ignorada (ex: bug de excludeSet).
    applyCard(card) {
      if (!card || typeof card.id !== 'string') return false

      switch (card.id) {
        case 'extra-projectile':
          projectileCount = Math.min(PROJECTILE_COUNT_CAP, projectileCount + 1)
          break
        case 'faster-fire':
          fireCooldown = Math.max(FIRE_COOLDOWN_FLOOR, fireCooldown * FIRE_COOLDOWN_MULT_PER_CORRECT)
          break
        case 'wingman':
          wingmanCount = Math.min(WINGMAN_CAP, wingmanCount + 1)
          break
        case 'more-homing-targets':
          homingMaxTargets = Math.min(HOMING_MAX_TARGETS_CAP, homingMaxTargets + 1)
          break
        case 'extra-shield-charge':
          shieldMax = Math.min(SHIELD_MAX_CAP, shieldMax + 1)
          shieldValue = Math.min(shieldMax, shieldValue + 1)
          break
        case 'faster-shield-recharge':
          shieldRegenRate *= 1.3
          shieldRegenDelayMs = Math.max(SHIELD_REGEN_DELAY_FLOOR_MS, shieldRegenDelayMs * 0.75)
          break
        case 'longer-invincibility':
          invincibilityDurationMs = Math.min(INVINCIBILITY_CAP_MS, invincibilityDurationMs + 200)
          break
        case 'extra-life':
          session.lives = Math.min(LIVES_CAP, session.lives + 1)
          maxLives = Math.max(maxLives, session.lives)
          break
        case 'deflect-on-spin':
          deflectCardActive = true
          break
        case 'faster-charge':
          homingChargeMinMs = Math.max(HOMING_CHARGE_MIN_FLOOR_MS, homingChargeMinMs - 300)
          homingChargeMaxMs = Math.max(homingChargeMinMs + 500, homingChargeMaxMs - 300)
          break
        case 'longer-dodge-iframe':
          fullSpinIframeMs += 150
          break
        case 'propulsion-ram':
          ramCardActive = true
          break
        default:
          return false
      }
      return true
    },

    buildCardExcludeSet() {
      const exclude = new Set()
      if (deflectCardActive) exclude.add('deflect-on-spin')
      if (wingmanCount >= WINGMAN_CAP) exclude.add('wingman')
      if (shieldMax >= SHIELD_MAX_CAP) exclude.add('extra-shield-charge')
      if (homingMaxTargets >= HOMING_MAX_TARGETS_CAP) exclude.add('more-homing-targets')
      if (projectileCount >= PROJECTILE_COUNT_CAP) exclude.add('extra-projectile')
      if (session.lives >= LIVES_CAP) exclude.add('extra-life')
      if (homingChargeMinMs <= HOMING_CHARGE_MIN_FLOOR_MS) exclude.add('faster-charge')
      if (ramCardActive) exclude.add('propulsion-ram')
      return exclude
    },

    // combate: chamado quando o jogador leva um hit de verdade (main.js já checou
    // !isInvincible() && !godMode antes de chamar isso). Absorve pelo escudo primeiro; o que
    // sobrar (escudo vazio, ou quebrou nesse hit e sobrou dano) desce pra vida. `amount` varia
    // com a dificuldade por erro (ver applyDifficulty em main.js) — era sempre 1 fixo.
    takeDamage(amount = 1) {
      shieldRegenDelayTimer = shieldRegenDelayMs
      let remaining = Math.max(1, amount)
      const absorbedByShield = shieldValue >= 1
      if (absorbedByShield) {
        const absorbed = Math.min(shieldValue, remaining)
        shieldValue -= absorbed
        remaining -= absorbed
      }
      const shieldBroke = absorbedByShield && shieldValue < 1
      let outOfLives = false
      if (remaining > 0) {
        // pedido do usuário: a invencibilidade momentânea só existe quando o escudo está
        // desligado de verdade — se ele absorveu o hit inteiro, não sobra dano pra vida e não
        // faz sentido dar i-frames em cima (isso ficava dobrando a proteção).
        // QoL (v0.29.4): Math.max em vez de atribuição direta — não reescreve i-frames já em
        // andamento (só main.js chama isso, e já garante !isInvincible() antes; o guard mora
        // aqui pra qualquer chamador futuro não conseguir encurtar iframes sem querer).
        invincibleTimer = Math.max(invincibleTimer, invincibilityDurationMs)
        session.health = Math.max(0, session.health - remaining)
        outOfLives = applyHealthLoss()
      }
      return { absorbedByShield, shieldBroke, outOfLives }
    },

    applyHealthLoss,

    grantInvincibility(ms) { invincibleTimer = Math.max(invincibleTimer, ms) },

    // giro completo (Z/C, 2 toques): cooldown global + i-frames, num método só — as duas
    // mudanças de estado sempre acontecem juntas quando o giro dispara de verdade.
    // QoL (v0.29.4): guard defensivo — o cooldown global não deve ser REINICIADO se um giro
    // chegar aqui com o cooldown ainda correndo. main.js já checa isFullSpinOnCooldown() antes,
    // mas o método em si não era defensivo: qualquer call site novo resetava o cooldown à toa.
    // Retorna true/false pra quem chamar poder saber se o giro pegou.
    triggerFullSpinIframes() {
      if (fullSpinCooldownTimer > 0) return false
      fullSpinCooldownTimer = FULL_SPIN_COOLDOWN_MS
      invincibleTimer = Math.max(invincibleTimer, fullSpinIframeMs)
      rollIframeTimer = fullSpinIframeMs
      return true
    },

    canUseBoost: boostReady,
    activatePropulsion() {
      // QoL (v0.29.4): usa boostReady() em vez de recopiar a mesma checagem inline
      if (!boostReady()) return false
      propulsionActiveTimer = BOOST_DURATION_MS
      boostCharge = 0
      return true
    },
    activateRepulsion() {
      if (!boostReady()) return false
      repulsionActiveTimer = BOOST_DURATION_MS
      boostCharge = 0
      return true
    },

    // quanto o impulso/freio atual multiplica a velocidade de avanço da nave (1 = normal)
    getBoostSpeedFactor() {
      let factor = 1
      if (propulsionActiveTimer > 0) factor *= PROPULSION_SPEED_MULT
      if (repulsionActiveTimer > 0) factor *= REPULSION_SPEED_MULT
      return factor
    },

    // QoL (v0.29.4): valida o argumento — amount negativo virava dano silencioso, NaN
    // envenenava o estado permanentemente (Math.min(maxHealth, NaN) = NaN). Retorna o quanto
    // curou de fato, pra quem chamar poder mostrar feedback ("curou 2") sem ler session.health
    // por fora.
    heal(amount) {
      if (!Number.isFinite(amount) || amount <= 0) return 0
      const before = session.health
      session.health = Math.min(maxHealth, session.health + amount)
      return session.health - before
    },

    // QoL (v0.29.4): devolve quanto restaurou de fato (paralelo a heal()), permitindo o debug/
    // HUD mostrarem "escudo recarregado: 2 → 3" ou não mexer no estado se já estava cheio.
    // Ainda reseta o delay de regen (senão o próximo hit pega o delay pendente do anterior).
    rechargeShield() {
      const before = shieldValue
      shieldValue = shieldMax
      shieldRegenDelayTimer = 0
      return shieldMax - before
    },

    // debug "Aplicar buffs máximos": pula direto pro teto, ignorando o ganho gradual por carta.
    // QoL (v0.29.4): antes só setava aimAssistAngle e projectileCount, apesar do nome prometer
    // "buffs máximos". Agora aplica TODOS os tetos diretamente, refletindo o efeito de ter
    // pegado cada carta até o cap. Cartas SEM cap definido (faster-shield-recharge,
    // longer-invincibility, longer-dodge-iframe) usam DEBUG_MAX_UNCAPPED_STACKS como
    // referência — não é um teto real, é só "uns stacks a mais pra dar pra ver o efeito".
    //
    // Nota: wingmanCount sobe aqui, mas o mesh do wingman vive em combat.js — quem chama
    // (main.js, handler do debug) precisa rodar `combat.setWingmanCount(player.getWingmanCount())`
    // na sequência pra o efeito aparecer.
    debugMaxBuffs() {
      projectileCount = PROJECTILE_COUNT_CAP
      homingMaxTargets = HOMING_MAX_TARGETS_CAP
      homingChargeMinMs = HOMING_CHARGE_MIN_FLOOR_MS
      homingChargeMaxMs = homingChargeMinMs + 500
      shieldMax = SHIELD_MAX_CAP
      shieldValue = shieldMax
      shieldRegenDelayMs = SHIELD_REGEN_DELAY_FLOOR_MS
      shieldRegenRate = SHIELD_REGEN_RATE * Math.pow(1.3, DEBUG_MAX_UNCAPPED_STACKS)
      invincibilityDurationMs = INVINCIBILITY_CAP_MS
      fullSpinIframeMs = FULL_SPIN_IFRAME_MS_BASE + 150 * DEBUG_MAX_UNCAPPED_STACKS
      wingmanCount = WINGMAN_CAP
      deflectCardActive = true
      ramCardActive = true
      session.lives = LIVES_CAP
      maxLives = Math.max(maxLives, session.lives)
    },

    // tick (1x por frame, chamado pelo main.js antes de rail.update): decai todos os timers e
    // regenera escudo/boost. Cartas só mudam os alvos (shieldMax, boostRecharge etc.), não essa
    // lógica de decaimento em si.
    update(dt) {
      invincibleTimer = Math.max(0, invincibleTimer - dt * 1000)
      rollIframeTimer = Math.max(0, rollIframeTimer - dt * 1000)
      fullSpinCooldownTimer = Math.max(0, fullSpinCooldownTimer - dt * 1000)
      if (propulsionActiveTimer > 0) propulsionActiveTimer = Math.max(0, propulsionActiveTimer - dt * 1000)
      if (repulsionActiveTimer > 0) repulsionActiveTimer = Math.max(0, repulsionActiveTimer - dt * 1000)
      if (propulsionActiveTimer <= 0 && repulsionActiveTimer <= 0 && boostCharge < 1) {
        boostCharge = Math.min(1, boostCharge + (dt * 1000) / BOOST_RECHARGE_MS)
      }
      if (shieldRegenDelayTimer > 0) {
        shieldRegenDelayTimer = Math.max(0, shieldRegenDelayTimer - dt * 1000)
      } else if (shieldValue < shieldMax) {
        shieldValue = Math.min(shieldMax, shieldValue + shieldRegenRate * dt)
      }
    },
  }
}
