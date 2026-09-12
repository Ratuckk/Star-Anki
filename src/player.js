import { DEFAULT_FIRE_COOLDOWN, DEFAULT_AIM_ASSIST_ANGLE } from './combat.js'

// ============ ESCUDO ============
// camada de defesa em FRENTE à barra de saúde: uma barra contínua (não binário cheio/vazio).
// Cada hit consome 1 unidade; depois de um hit, espera SHIELD_REGEN_DELAY_MS e passa a
// regenerar sozinho a SHIELD_REGEN_RATE por segundo — regenera aos poucos mesmo sem ter sido
// zerado de vez, não só quando esgota totalmente.
const SHIELD_MAX = 2
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
const AIM_ASSIST_STEP = (1.5 * Math.PI) / 180
const AIM_ASSIST_CAP = (14 * Math.PI) / 180
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
  let aimAssistAngle = DEFAULT_AIM_ASSIST_ANGLE
  let projectileCount = PROJECTILE_COUNT_START

  // saúde zerada consome 1 vida e reabastece a saúde (e o escudo); zerar as vidas é que
  // realmente acaba a run. Chamar isso é seguro mesmo com saúde > 0 (vira no-op) — usado tanto
  // pelo dano em combate (takeDamage) quanto por errar uma pergunta (main.js decrementa
  // session.health e chama isso na sequência).
  function applyHealthLoss() {
    if (session.health > 0) return false
    session.lives -= 1
    if (session.lives <= 0) return true
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
      get aimAssistAngle() { return aimAssistAngle },
      get homingMaxTargets() { return homingMaxTargets },
      get homingChargeMinMs() { return homingChargeMinMs },
      get homingChargeMaxMs() { return homingChargeMaxMs },
    },

    getMaxHealth: () => maxHealth,
    getMaxLives: () => maxLives,
    getShieldValue: () => shieldValue,
    getShieldMax: () => shieldMax,
    isInvincible: () => invincibleTimer > 0,
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
      const threshold = maxHealth * thresholdFrac
      if (session.health >= threshold) return 0
      return Math.max(0, Math.min(1, 1 - session.health / threshold))
    },

    applyCard(card) {
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
        case 'wider-lock':
          aimAssistAngle = Math.min(AIM_ASSIST_CAP, aimAssistAngle + AIM_ASSIST_STEP)
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
          break
      }
    },

    buildCardExcludeSet() {
      const exclude = new Set()
      if (deflectCardActive) exclude.add('deflect-on-spin')
      if (wingmanCount >= WINGMAN_CAP) exclude.add('wingman')
      if (shieldMax >= SHIELD_MAX_CAP) exclude.add('extra-shield-charge')
      if (homingMaxTargets >= HOMING_MAX_TARGETS_CAP) exclude.add('more-homing-targets')
      if (projectileCount >= PROJECTILE_COUNT_CAP) exclude.add('extra-projectile')
      if (aimAssistAngle >= AIM_ASSIST_CAP) exclude.add('wider-lock')
      if (session.lives >= LIVES_CAP) exclude.add('extra-life')
      if (homingChargeMinMs <= HOMING_CHARGE_MIN_FLOOR_MS) exclude.add('faster-charge')
      if (ramCardActive) exclude.add('propulsion-ram')
      return exclude
    },

    // combate: chamado quando o jogador leva um hit de verdade (main.js já checou
    // !isInvincible() && !godMode antes de chamar isso). Absorve pelo escudo primeiro; sem
    // escudo, tira 1 de saúde e aplica a cascata de vida.
    takeDamage() {
      invincibleTimer = invincibilityDurationMs
      shieldRegenDelayTimer = shieldRegenDelayMs
      if (shieldValue >= 1) {
        shieldValue -= 1
        return { absorbedByShield: true, shieldBroke: shieldValue < 1, outOfLives: false }
      }
      session.health = Math.max(0, session.health - 1)
      return { absorbedByShield: false, shieldBroke: false, outOfLives: applyHealthLoss() }
    },

    applyHealthLoss,

    grantInvincibility(ms) { invincibleTimer = Math.max(invincibleTimer, ms) },

    // giro completo (Z/C, 2 toques): cooldown global + i-frames, num método só — as duas
    // mudanças de estado sempre acontecem juntas quando o giro dispara de verdade
    triggerFullSpinIframes() {
      fullSpinCooldownTimer = FULL_SPIN_COOLDOWN_MS
      invincibleTimer = Math.max(invincibleTimer, fullSpinIframeMs)
    },

    canUseBoost: () => boostCharge >= 1 && propulsionActiveTimer <= 0 && repulsionActiveTimer <= 0,
    activatePropulsion() {
      if (boostCharge < 1 || propulsionActiveTimer > 0 || repulsionActiveTimer > 0) return false
      propulsionActiveTimer = BOOST_DURATION_MS
      boostCharge = 0
      return true
    },
    activateRepulsion() {
      if (boostCharge < 1 || propulsionActiveTimer > 0 || repulsionActiveTimer > 0) return false
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

    heal(amount) { session.health = Math.min(maxHealth, session.health + amount) },
    rechargeShield() { shieldValue = shieldMax; shieldRegenDelayTimer = 0 },

    // debug "Aplicar buffs máximos": pula direto pro teto, ignorando o ganho gradual por carta
    debugMaxBuffs() {
      aimAssistAngle = AIM_ASSIST_CAP
      projectileCount = PROJECTILE_COUNT_CAP
    },

    // tick (1x por frame, chamado pelo main.js antes de rail.update): decai todos os timers e
    // regenera escudo/boost. Cartas só mudam os alvos (shieldMax, boostRecharge etc.), não essa
    // lógica de decaimento em si.
    update(dt) {
      invincibleTimer = Math.max(0, invincibleTimer - dt * 1000)
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
