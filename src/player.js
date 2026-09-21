import { DEFAULT_FIRE_COOLDOWN } from './combat/index.js'
import { PLAYER_SOUND_CUES, triggerSoundCue } from './audio-cues.js'
import { aiValidator } from './ai-validator.js'
import { SWIRL_COOLDOWN_MS } from './main-constants.js'

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

const WINGMAN_CAP = 4
const LIVES_CAP = 5

const FIRE_COOLDOWN_MULT_PER_CORRECT = 0.85
const FIRE_COOLDOWN_FLOOR = 0.06
const PROJECTILE_COUNT_CAP = 4
const PROJECTILE_COUNT_START = 1

// tiro teleguiado (v0.53.9): carga base ágil (600ms a 2200ms) para ritmo de arcade,
// e redução real por stack da carta 'faster-charge' (-500ms na máxima, -120ms na mínima)
const HOMING_CHARGE_MIN_MS = 600
const HOMING_CHARGE_MAX_MS = 2200
const HOMING_CHARGE_MIN_FLOOR_MS = 250
const HOMING_MAX_TARGETS_BASE = 4
export const HOMING_MAX_TARGETS_CAP = 8
// carta "Ricochete": quantas vezes um tiro carregado pula pro próximo inimigo mais próximo após
// atingir o alvo mirado. Cap defensivo (evita uma cadeia infinita se o jogador empilhar demais).
const RICOCHET_CAP = 5

// Cartas de Falco (Docs/# Documento de Implementação — Nova.md, item 3) — cada uma vai até 3
// stacks (0/3 do doc). Efeito de fato mora em combat/wingmen.js, que lê esses valores via opts
// no update() (mesmo padrão de player.config.homingMaxTargets lido por combat/lockon.js).
const FALCO_CARD_STACKS_CAP = 3

// ============ CARTAS DO PEPPY — ESCUDO TEMPORÁRIO ============
// Guarda Extra acumula até três cargas ACIMA do teto normal por 10s. Essas cargas são um estado
// separado: não aumentam shieldMax, não regeneram e sempre absorvem dano antes do escudo azul.
const PEPPY_GUARD_EXTRA_STACKS_CAP = 3
const PEPPY_RESCUE_STACKS_CAP = 3
const PEPPY_AUX_SHIELD_STACKS_CAP = 1
const PEPPY_GUARD_EXTRA_DURATION_MS = 10000

// ============ CARTAS DO SLIPPY E SUPORTE À ALA ============
// Repair cura aliados próximos; Morale reforça todo o dano enquanto o foco dura; Impulsão
// acompanha os 950ms do propulsor. Casco Reforçado é o suporte global pedido pelo usuário.
const SLIPPY_REPAIR_STACKS_CAP = 2
const SLIPPY_MORALE_STACKS_CAP = 3
const SLIPPY_BOOST_STACKS_CAP = 2
const WINGMAN_HULL_STACKS_CAP = 3

// giro completo (Z/C, 2 toques): cooldown global (não importa o lado) pra não spammar
// invencibilidade, e quanto de i-frame cada giro concede (cartas somam em cima)
const FULL_SPIN_COOLDOWN_MS = 3000
const FULL_SPIN_IFRAME_MS_BASE = 900
const FULL_SPIN_IFRAME_MS_CAP = 1800

// ============ PROPULSOR / REPULSOR (A/S) ============
// 1 barra COMPARTILHADA entre os dois: ao usar qualquer um, a barra zera e recarrega devagar;
// não dá pra usar de novo (nenhum dos dois) enquanto não encher totalmente.
const BOOST_DURATION_MS = 950
const BOOST_RECHARGE_MS = 3000
const PROPULSION_SPEED_MULT = 1.9 // multiplicador de velocidade de avanço durante o impulso
const REPULSION_SPEED_MULT = 0.35 // multiplicador de velocidade de avanço durante a repulsão
// QoL (item 4b — Docs/# QoL — Documento de Melhorias.md): repulsão parou de zerar a barra de
// boost de uma vez (era instantânea, igual ao propulsor) — agora dreno progressivo enquanto o
// botão fica SEGURADO, parando imediatamente ao soltar. Tempo pra drenar a barra CHEIA do zero;
// 2x o tempo de recarga normal, sugestão do próprio doc.
const BOOST_BRAKE_DRAIN_MS = BOOST_RECHARGE_MS * 2

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
  let temporaryShieldValue = 0
  let temporaryShieldTimerMs = 0
  let wrongAnswerCount = 0

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
  let ricochetCount = 0
  let falcoChainStacks = 0 // carta "Falco Combate" — investida em cadeia contra o alvo mais próximo
  let falcoInterceptStacks = 0 // carta "Falco Intercept" — abate projéteis pesados (powerLevel 3-4)
  let falcoStatusStacks = 0 // carta "Falco Status" — +2s de dogfightDuration por stack
  let peppyGuardExtraStacks = 0
  let peppyRescueStacks = 0
  let peppyAuxShieldStacks = 0
  let slippyRepairStacks = 0
  let slippyMoraleStacks = 0
  let slippyBoostStacks = 0
  let wingmanHullStacks = 0
  const downedWingmanIds = new Set()
  let recoveredWingmanId = null
  let fullSpinIframeMs = FULL_SPIN_IFRAME_MS_BASE
  let fullSpinCooldownTimer = 0

  let boostCharge = 1
  let propulsionActiveTimer = 0
  // QoL item 4b: não é mais um timer de duração fixa — fica true enquanto o freio está de fato
  // drenando a barra (ver update()), e cai pra false na hora (soltou o botão OU zerou a carga).
  let repulsionActive = false
  let ramCardActive = false

  // Swirl Blast (habilidade base — Docs/# Swirl Blast — Design & Plano de I.md)
  let swirlCooldownMs = 0
  // carta "Vínculo: Swirl Blast" (§5): cada aplicação multiplica por 0.85, piso em 0.5 (metade
  // do cooldown base = 6s)
  let swirlCooldownMult = 1

  let fireCooldown = DEFAULT_FIRE_COOLDOWN
  let projectileCount = PROJECTILE_COUNT_START
  const collectedCards = new Map()

  let telemetry = null

  // QoL (v0.29.4): única fonte de verdade de "pode usar boost?" — antes a checagem estava
  // copiada dentro de activatePropulsion/activateRepulsion, e canUseBoost() existia na API
  // pública mas era código morto (nunca chamado). Agora os três pontos (público + os dois
  // activate*) leem daqui.
  function boostReady() {
    return boostCharge >= 1 && propulsionActiveTimer <= 0 && !repulsionActive
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
    temporaryShieldValue = 0
    temporaryShieldTimerMs = 0
    return false
  }

  return {
    // objeto mutável que combat.js, game-loop.js e main.js leem direto
    config: {
      get projectileCount() { return projectileCount },
      get fireCooldown() { return fireCooldown },
      get homingMaxTargets() { return homingMaxTargets },
      get homingChargeMinMs() { return homingChargeMinMs },
      get homingChargeMaxMs() { return homingChargeMaxMs },
      get ricochetCount() { return ricochetCount },
    },
    get stats() { return this.config },

    setTelemetry: (t) => { telemetry = t },
    getTelemetry: () => telemetry,
    getMaxHealth: () => maxHealth,
    getMaxLives: () => maxLives,
    getShieldValue: () => shieldValue,
    getShieldMax: () => shieldMax,
    getTemporaryShieldValue: () => temporaryShieldValue,
    getTemporaryShieldRemainingMs: () => temporaryShieldTimerMs,
    getShieldRegenDelayTimer: () => shieldRegenDelayTimer,
    getShieldRegenRate: () => shieldRegenRate,
    setWrongCount(count) { wrongAnswerCount = Math.max(0, count || 0) },
    getWrongCount: () => wrongAnswerCount,
    isInvincible: () => invincibleTimer > 0,
    // pedido do usuário: nave não pisca durante o rolamento — main.js usa isso pra suprimir o
    // flicker padrão de invencibilidade e mostrar afterimage no lugar só nessa janela
    isRollIframeActive: () => rollIframeTimer > 0,
    getInvincibleRemainingMs: () => invincibleTimer,
    getRollIframeTimer: () => rollIframeTimer,
    isFullSpinOnCooldown: () => fullSpinCooldownTimer > 0,
    getFullSpinCooldownTimer: () => fullSpinCooldownTimer,
    getFireCooldown: () => fireCooldown,
    getProjectileCount: () => projectileCount,
    getHomingMaxTargets: () => homingMaxTargets,
    isDeflectActive: () => deflectCardActive,
    isRamCardActive: () => ramCardActive,
    setWingmanCount: (count) => {
      wingmanCount = Math.max(0, Math.min(WINGMAN_CAP, count || 0))
      if (wingmanCount > 0) collectedCards.set('wingman', wingmanCount)
      else collectedCards.delete('wingman')
    },
    getWingmanCount: () => wingmanCount,

    getBoostCharge: () => boostCharge,
    isPropulsionActive: () => propulsionActiveTimer > 0,
    isRepulsionActive: () => repulsionActive,
    getPropulsionActiveTimer: () => propulsionActiveTimer,
    // não é mais um timer de verdade (item 4b) — reporta quanto tempo de freio "restaria" no
    // ritmo de dreno atual, só pra telemetria continuar tendo um número útil pra exibir.
    getRepulsionActiveTimer: () => (repulsionActive ? boostCharge * BOOST_BRAKE_DRAIN_MS : 0),

    // Swirl Blast — cooldown da habilidade base (ver §3.1/§6.1 do doc)
    getSwirlCooldownMs: () => swirlCooldownMs,
    getSwirlCooldownTotalMs: () => SWIRL_COOLDOWN_MS * swirlCooldownMult,
    isSwirlReady: () => swirlCooldownMs <= 0,
    startSwirlCooldown() { swirlCooldownMs = SWIRL_COOLDOWN_MS * swirlCooldownMult },

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

    // v0.51.0 — `getStats()` REMOVIDO. Era um snapshot de todos os stats mutáveis por carta,
    // com comentário justificando "ponto único de leitura pra debug/telemetria" — mas nenhum
    // call site (debug, HUD, teste) realmente chamava. Pior: o snapshot tinha lista fixa de
    // campos, então cada stat novo ficava divergindo silenciosamente (quem confiasse nele pra
    // debug via um objeto desatualizado). Se um dia voltar a precisar, é reconstruir a partir
    // dos `let`/`getters` acima — não vale manter a versão desatualizada.

    // QoL (v0.29.4): guard contra card inválido + retorno boolean. Antes quebrava com
    // `Cannot read property 'id' of undefined` se card fosse null, e não devolvia nada —
    // main.js não tinha como saber que uma carta no cap foi ignorada (ex: bug de excludeSet).
    applyCard(card) {
      if (!card || typeof card.id !== 'string') return false
      let restoredWingman = false

      switch (card.id) {
        case 'extra-projectile':
          projectileCount = Math.min(PROJECTILE_COUNT_CAP, projectileCount + 1)
          break
        case 'faster-fire':
          fireCooldown = Math.max(FIRE_COOLDOWN_FLOOR, fireCooldown * FIRE_COOLDOWN_MULT_PER_CORRECT)
          break
        case 'wingman': {
          // Uma nova carta de companhia primeiro resgata um piloto abatido; só aumenta o tamanho
          // da ala se não houver ninguém aguardando retorno.
          const [downedId] = [...downedWingmanIds].sort((a, b) => a - b)
          if (downedId != null) {
            downedWingmanIds.delete(downedId)
            recoveredWingmanId = downedId
            restoredWingman = true
          } else {
            wingmanCount = Math.min(WINGMAN_CAP, wingmanCount + 1)
          }
          break
        }
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
          homingChargeMinMs = Math.max(HOMING_CHARGE_MIN_FLOOR_MS, homingChargeMinMs - 120)
          homingChargeMaxMs = Math.max(homingChargeMinMs + 450, homingChargeMaxMs - 500)
          break
        case 'ricochet':
          ricochetCount = Math.min(RICOCHET_CAP, ricochetCount + 1)
          break
        case 'falco-combat-chain':
          falcoChainStacks = Math.min(FALCO_CARD_STACKS_CAP, falcoChainStacks + 1)
          break
        case 'falco-intercept':
          falcoInterceptStacks = Math.min(FALCO_CARD_STACKS_CAP, falcoInterceptStacks + 1)
          break
        case 'falco-status':
          falcoStatusStacks = Math.min(FALCO_CARD_STACKS_CAP, falcoStatusStacks + 1)
          break
        case 'peppy-guard-extra':
          peppyGuardExtraStacks = Math.min(PEPPY_GUARD_EXTRA_STACKS_CAP, peppyGuardExtraStacks + 1)
          break
        case 'peppy-rescue':
          peppyRescueStacks = Math.min(PEPPY_RESCUE_STACKS_CAP, peppyRescueStacks + 1)
          break
        case 'peppy-aux-shield':
          peppyAuxShieldStacks = PEPPY_AUX_SHIELD_STACKS_CAP
          break
        case 'slippy-repair-allies':
          slippyRepairStacks = Math.min(SLIPPY_REPAIR_STACKS_CAP, slippyRepairStacks + 1)
          break
        case 'slippy-morale-boost':
          slippyMoraleStacks = Math.min(SLIPPY_MORALE_STACKS_CAP, slippyMoraleStacks + 1)
          break
        case 'slippy-joint-boost':
          slippyBoostStacks = Math.min(SLIPPY_BOOST_STACKS_CAP, slippyBoostStacks + 1)
          break
        case 'wingman-hull-support':
          wingmanHullStacks = Math.min(WINGMAN_HULL_STACKS_CAP, wingmanHullStacks + 1)
          break
        case 'swirl-blast-cooldown':
          swirlCooldownMult = Math.max(0.5, swirlCooldownMult * 0.85)
          break
        case 'longer-dodge-iframe':
          fullSpinIframeMs = Math.min(FULL_SPIN_IFRAME_MS_CAP, fullSpinIframeMs + 150)
          break
        case 'propulsion-ram':
          ramCardActive = true
          break
        // Cartas "Vínculo" (reduzem o cooldown da habilidade única de cada piloto do esquadrão)
        // não mexem em nenhum stat local — o multiplicador de cooldown mora no sistema de
        // esquadrão (combat/wingmen.js), aplicado por flow-question.js logo após applyCard()
        // retornar aqui. Só precisam cair nos cases pra contar em collectedCards (bandeja de
        // cartas) e pra pickRandomCards não rejeitar o id como desconhecido.
        case 'wingman-ram-cooldown':
        case 'wingman-guard-cooldown':
        case 'wingman-repair-cooldown':
        case 'wingman-assist-cooldown':
          break
        default:
          return false
      }
      if (!restoredWingman) collectedCards.set(card.id, (collectedCards.get(card.id) || 0) + 1)
      telemetry?.recordEvent('card', `Carta adquirida: ${card.title || card.id} (total: ${collectedCards.get(card.id)}x)`, { cardId: card.id, count: collectedCards.get(card.id) })
      return true
    },

    getCollectedCards: () => new Map(collectedCards),
    // Lidos por combat/wingmen.js (via opts no update(), mesmo padrão de shieldNotFull) — o
    // efeito de fato das cartas de Falco mora lá, aqui é só o contador de stacks (0-3).
    getFalcoChainStacks: () => falcoChainStacks,
    getFalcoInterceptStacks: () => falcoInterceptStacks,
    getFalcoStatusStacks: () => falcoStatusStacks,
    getPeppyGuardExtraStacks: () => peppyGuardExtraStacks,
    getPeppyRescueStacks: () => peppyRescueStacks,
    getPeppyAuxShieldStacks: () => peppyAuxShieldStacks,
    getSlippyRepairStacks: () => slippyRepairStacks,
    getSlippyMoraleStacks: () => slippyMoraleStacks,
    getSlippyBoostStacks: () => slippyBoostStacks,
    getWingmanHullStacks: () => wingmanHullStacks,
    consumeRecoveredWingmanId() {
      const id = recoveredWingmanId
      recoveredWingmanId = null
      return id
    },
    markWingmanDown(profileId) {
      if (!Number.isInteger(profileId)) return
      downedWingmanIds.add(profileId)
      // Buffs específicos do piloto não sobrevivem à retirada; Casco Reforçado é global e fica.
      const cardsByPilot = [
        ['falco-combat-chain', 'falco-intercept', 'falco-status'],
        ['peppy-guard-extra', 'peppy-rescue', 'peppy-aux-shield'],
        ['slippy-repair-allies', 'slippy-morale-boost', 'slippy-joint-boost'],
        ['miyu-assist-target', 'miyu-boombuster', 'miyu-status'],
      ]
      for (const id of cardsByPilot[profileId] || []) collectedCards.delete(id)
      if (profileId === 0) { falcoChainStacks = 0; falcoInterceptStacks = 0; falcoStatusStacks = 0 }
      if (profileId === 1) { peppyGuardExtraStacks = 0; peppyRescueStacks = 0; peppyAuxShieldStacks = 0 }
      if (profileId === 2) { slippyRepairStacks = 0; slippyMoraleStacks = 0; slippyBoostStacks = 0 }
    },

    resetCards() {
      collectedCards.clear()
      deflectCardActive = false
      wingmanCount = 0
      shieldMax = SHIELD_MAX
      shieldValue = shieldMax
      shieldRegenRate = SHIELD_REGEN_RATE
      shieldRegenDelayMs = SHIELD_REGEN_DELAY_MS
      wrongAnswerCount = 0
      invincibilityDurationMs = INVINCIBILITY_MS
      homingMaxTargets = HOMING_MAX_TARGETS_BASE
      homingChargeMinMs = HOMING_CHARGE_MIN_MS
      homingChargeMaxMs = HOMING_CHARGE_MAX_MS
      ricochetCount = 0
      falcoChainStacks = 0
      falcoInterceptStacks = 0
      falcoStatusStacks = 0
      peppyGuardExtraStacks = 0
      peppyRescueStacks = 0
      peppyAuxShieldStacks = 0
      slippyRepairStacks = 0
      slippyMoraleStacks = 0
      slippyBoostStacks = 0
      wingmanHullStacks = 0
      downedWingmanIds.clear()
      recoveredWingmanId = null
      temporaryShieldValue = 0
      temporaryShieldTimerMs = 0
      fullSpinIframeMs = FULL_SPIN_IFRAME_MS_BASE
      ramCardActive = false
      fireCooldown = DEFAULT_FIRE_COOLDOWN
      projectileCount = PROJECTILE_COUNT_START
      swirlCooldownMs = 0
      swirlCooldownMult = 1
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
      if (ricochetCount >= RICOCHET_CAP) exclude.add('ricochet')
      if (ramCardActive) exclude.add('propulsion-ram')
      if (invincibilityDurationMs >= INVINCIBILITY_CAP_MS) exclude.add('longer-invincibility')
      if (shieldRegenDelayMs <= SHIELD_REGEN_DELAY_FLOOR_MS) exclude.add('faster-shield-recharge')
      if (fireCooldown <= FIRE_COOLDOWN_FLOOR) exclude.add('faster-fire')
      if (fullSpinIframeMs >= FULL_SPIN_IFRAME_MS_CAP) exclude.add('longer-dodge-iframe')
      // Cartas "Vínculo": só aparecem se aquele piloto específico já estiver recrutado
      // (setWingmanCount preenche por ordem de id 0→3, então presença por id é monotônica).
      if (wingmanCount <= 0) exclude.add('wingman-ram-cooldown')
      if (wingmanCount <= 1) exclude.add('wingman-guard-cooldown')
      if (wingmanCount <= 2) exclude.add('wingman-repair-cooldown')
      if (wingmanCount <= 3) exclude.add('wingman-assist-cooldown')
      // Cartas de Falco: mesma regra de recrutamento das Vínculo (wingmanCount <= 0 = Falco ainda
      // não está na ala), mais o cap de stacks (0/3) de cada uma.
      if (wingmanCount <= 0) { exclude.add('falco-combat-chain'); exclude.add('falco-intercept'); exclude.add('falco-status') }
      if (falcoChainStacks >= FALCO_CARD_STACKS_CAP) exclude.add('falco-combat-chain')
      if (falcoInterceptStacks >= FALCO_CARD_STACKS_CAP) exclude.add('falco-intercept')
      if (falcoStatusStacks >= FALCO_CARD_STACKS_CAP) exclude.add('falco-status')
      if (wingmanCount <= 1) { exclude.add('peppy-guard-extra'); exclude.add('peppy-rescue'); exclude.add('peppy-aux-shield') }
      if (peppyGuardExtraStacks >= PEPPY_GUARD_EXTRA_STACKS_CAP) exclude.add('peppy-guard-extra')
      if (peppyRescueStacks >= PEPPY_RESCUE_STACKS_CAP) exclude.add('peppy-rescue')
      if (peppyAuxShieldStacks >= PEPPY_AUX_SHIELD_STACKS_CAP) exclude.add('peppy-aux-shield')
      const hasPilot = (id) => wingmanCount > id && !downedWingmanIds.has(id)
      if (!hasPilot(2)) { exclude.add('slippy-repair-allies'); exclude.add('slippy-morale-boost'); exclude.add('slippy-joint-boost') }
      if (slippyRepairStacks >= SLIPPY_REPAIR_STACKS_CAP) exclude.add('slippy-repair-allies')
      if (slippyMoraleStacks >= SLIPPY_MORALE_STACKS_CAP) exclude.add('slippy-morale-boost')
      if (slippyBoostStacks >= SLIPPY_BOOST_STACKS_CAP) exclude.add('slippy-joint-boost')
      if (wingmanHullStacks >= WINGMAN_HULL_STACKS_CAP) exclude.add('wingman-hull-support')
      // Mesmo no teto de quatro, a carta volta ao pool se existe piloto abatido para resgatar.
      if (downedWingmanIds.size > 0) exclude.delete('wingman')
      return exclude
    },

    // combate: chamado quando o jogador leva um hit de verdade (main.js já checou
    // !isInvincible() && !godMode antes de chamar isso). Absorve pelo escudo primeiro; o que
    // sobrar (escudo vazio, ou quebrou nesse hit e sobrou dano) desce pra vida. `amount` varia
    // com a dificuldade por erro (ver applyDifficulty em main.js) — era sempre 1 fixo.
    takeDamage(amount = 1) {
      // Seção 3 do backlog (contrapeso do jogador): em patamares altos (wrongAnswerCount >= 3), atraso de +150ms na recarga do escudo
      shieldRegenDelayTimer = shieldRegenDelayMs + (wrongAnswerCount >= 3 ? 150 : 0)
      let remaining = Math.max(1, amount)
      const absorbedByTemporaryShield = temporaryShieldValue > 0
      if (absorbedByTemporaryShield) {
        const absorbed = Math.min(temporaryShieldValue, remaining)
        temporaryShieldValue -= absorbed
        remaining -= absorbed
      }
      aiValidator.expect(
        'Escudo temporário do Peppy nunca fica negativo nem passa de três cargas',
        () => temporaryShieldValue >= 0 && temporaryShieldValue <= PEPPY_GUARD_EXTRA_STACKS_CAP,
        { temporaryShieldValue, damage: amount },
      )
      const absorbedByShield = shieldValue > 0
      if (absorbedByShield) {
        if (shieldValue >= remaining) {
          shieldValue -= remaining
          remaining = 0
        } else {
          // O escudo quebra: absorve o impacto até o limite inteiro (shield gate) e quebra
          remaining = Math.max(0, Math.floor(remaining - shieldValue))
          shieldValue = 0
        }
      }
      // Exemplo de uso do Motor de Validação IA (ver FLUXO_VALIDACAO_IA.md): checa a própria
      // suposição de que a absorção de escudo acima nunca deixa o valor fora de [0, shieldMax].
      aiValidator.expect(
        'Escudo do jogador nunca fica negativo nem passa do máximo após absorver dano',
        () => shieldValue >= 0 && shieldValue <= shieldMax,
        { shieldValue, shieldMax, damage: amount }
      )
      const shieldBroke = absorbedByShield && shieldValue <= 0
      if (absorbedByTemporaryShield || absorbedByShield) {
        if (shieldBroke) {
          triggerSoundCue(PLAYER_SOUND_CUES.shield_break, { remainingShield: shieldValue, damage: amount })
        } else {
          triggerSoundCue(PLAYER_SOUND_CUES.shield_absorb, { remainingShield: shieldValue, damage: amount })
        }
      }
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
        triggerSoundCue(PLAYER_SOUND_CUES.hull_damage, { damage: remaining, health: session.health, lives: session.lives })
        if (session.health <= 0) {
          if (outOfLives) {
            triggerSoundCue(PLAYER_SOUND_CUES.game_over, { score: session.score || 0 })
          } else {
            triggerSoundCue(PLAYER_SOUND_CUES.life_lost, { livesRemaining: session.lives })
          }
        }
      }
      telemetry?.recordEvent('damage', `Dano sofrido: ${amount} (Escudo: ${absorbedByShield ? 'absorveu' : 'vazio'}, HP restante: ${session.health}, Vidas: ${session.lives})`, {
        amount, absorbedByShield, absorbedByTemporaryShield, shieldBroke, outOfLives, health: session.health, lives: session.lives,
      })
      return { absorbedByShield: absorbedByShield || absorbedByTemporaryShield, absorbedByTemporaryShield, shieldBroke, outOfLives }
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
      triggerSoundCue(PLAYER_SOUND_CUES.barrel_roll, { durationMs: fullSpinIframeMs })
      telemetry?.recordEvent('roll', `Giro completo efetuado! I-frames ativados por ${fullSpinIframeMs}ms`, { iframeMs: fullSpinIframeMs })
      return true
    },

    canUseBoost: boostReady,
    activatePropulsion() {
      // QoL (v0.29.4): usa boostReady() em vez de recopiar a mesma checagem inline
      if (!boostReady()) return false
      propulsionActiveTimer = BOOST_DURATION_MS
      boostCharge = 0
      triggerSoundCue(PLAYER_SOUND_CUES.boost_ignite, { durationMs: BOOST_DURATION_MS })
      telemetry?.recordEvent('boost', `Propulsor ativado (velocidade ${PROPULSION_SPEED_MULT}x)`, { factor: PROPULSION_SPEED_MULT })
      return true
    },
    // QoL item 4b: não zera mais a barra de uma vez — só ARMA o estado; o dreno de verdade
    // acontece em update(dt, repulsionHeld) frame a frame, enquanto o botão continuar segurado.
    activateRepulsion() {
      if (!boostReady()) return false
      repulsionActive = true
      triggerSoundCue(PLAYER_SOUND_CUES.brake_ignite, { durationMs: BOOST_BRAKE_DRAIN_MS })
      telemetry?.recordEvent('boost', `Repulsor/Freio ativado (velocidade ${REPULSION_SPEED_MULT}x, dreno progressivo)`, { factor: REPULSION_SPEED_MULT })
      return true
    },

    // quanto o impulso/freio atual multiplica a velocidade de avanço da nave (1 = normal)
    getBoostSpeedFactor() {
      let factor = 1
      if (propulsionActiveTimer > 0) factor *= PROPULSION_SPEED_MULT
      if (repulsionActive) factor *= REPULSION_SPEED_MULT
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
      const healed = session.health - before
      if (healed > 0) {
        triggerSoundCue(PLAYER_SOUND_CUES.heal, { amount: healed, health: session.health, maxHealth })
        telemetry?.recordEvent('heal', `Cura recebida: +${healed} HP (${session.health}/${maxHealth})`, { healed, health: session.health })
      }
      return healed
    },

    // QoL (v0.29.4): devolve quanto restaurou de fato (paralelo a heal()), permitindo o debug/
    // HUD mostrarem "escudo recarregado: 2 → 3" ou não mexer no estado se já estava cheio.
    // Ainda reseta o delay de regen (senão o próximo hit pega o delay pendente do anterior).
    rechargeShield() {
      const before = shieldValue
      shieldValue = shieldMax
      shieldRegenDelayTimer = 0
      telemetry?.recordEvent('shield', `Escudo totalmente restaurado para ${shieldMax}`, { shield: shieldMax })
      return shieldMax - before
    },

    // Guarda do Peppy (habilidade única do esquadrão): topa 1 carga de escudo, sem alterar o
    // teto (diferente da carta 'extra-shield-charge', que aumenta shieldMax). Não mexe no delay
    // de regen — é um bônus pontual, não uma recarga completa.
    grantShieldPip(amount = 1) {
      if (!Number.isFinite(amount) || amount <= 0) return 0
      const before = shieldValue
      shieldValue = Math.min(shieldMax, shieldValue + amount)
      const granted = shieldValue - before
      if (granted > 0) {
        telemetry?.recordEvent('shield', `Guarda aliada concedeu +${granted} carga de escudo (${shieldValue.toFixed(1)}/${shieldMax})`, { granted, shield: shieldValue })
      }
      return granted
    },

    grantTemporaryShieldPips(amount = 1) {
      if (!Number.isFinite(amount) || amount <= 0) return 0
      const granted = Math.min(PEPPY_GUARD_EXTRA_STACKS_CAP, Math.floor(amount))
      temporaryShieldValue = Math.max(temporaryShieldValue, granted)
      temporaryShieldTimerMs = PEPPY_GUARD_EXTRA_DURATION_MS
      telemetry?.recordEvent('shield', `Guarda Extra de Peppy: +${granted} escudo temporário por 10s`, { granted, temporaryShieldValue })
      return granted
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
      ricochetCount = RICOCHET_CAP
      falcoChainStacks = FALCO_CARD_STACKS_CAP
      falcoInterceptStacks = FALCO_CARD_STACKS_CAP
      falcoStatusStacks = FALCO_CARD_STACKS_CAP
      deflectCardActive = true
      ramCardActive = true
      session.lives = LIVES_CAP
      maxLives = Math.max(maxLives, session.lives)
      swirlCooldownMs = 0
      swirlCooldownMult = 0.5

      collectedCards.set('extra-projectile', PROJECTILE_COUNT_CAP - 1)
      collectedCards.set('more-homing-targets', HOMING_MAX_TARGETS_CAP - HOMING_MAX_TARGETS_BASE)
      collectedCards.set('faster-charge', 2)
      collectedCards.set('extra-shield-charge', SHIELD_MAX_CAP - SHIELD_MAX)
      collectedCards.set('faster-shield-recharge', DEBUG_MAX_UNCAPPED_STACKS)
      collectedCards.set('longer-invincibility', DEBUG_MAX_UNCAPPED_STACKS)
      collectedCards.set('longer-dodge-iframe', DEBUG_MAX_UNCAPPED_STACKS)
      collectedCards.set('wingman', WINGMAN_CAP)
      collectedCards.set('ricochet', RICOCHET_CAP)
      collectedCards.set('falco-combat-chain', FALCO_CARD_STACKS_CAP)
      collectedCards.set('falco-intercept', FALCO_CARD_STACKS_CAP)
      collectedCards.set('falco-status', FALCO_CARD_STACKS_CAP)
      collectedCards.set('deflect-on-spin', 1)
      collectedCards.set('propulsion-ram', 1)
      collectedCards.set('extra-life', 2)
      collectedCards.set('swirl-blast-cooldown', DEBUG_MAX_UNCAPPED_STACKS)
    },

    // tick (1x por frame, chamado pelo main.js antes de rail.update): decai todos os timers e
    // regenera escudo/boost. Cartas só mudam os alvos (shieldMax, boostRecharge etc.), não essa
    // lógica de decaimento em si.
    // `repulsionHeld` (item 4b): true enquanto o jogador segura o botão de repulsão AGORA — vem
    // de inputState.repulsionHeld (input.js), não de uma flag "acabou de apertar".
    update(dt, repulsionHeld = false) {
      invincibleTimer = Math.max(0, invincibleTimer - dt * 1000)
      rollIframeTimer = Math.max(0, rollIframeTimer - dt * 1000)
      fullSpinCooldownTimer = Math.max(0, fullSpinCooldownTimer - dt * 1000)
      if (propulsionActiveTimer > 0) propulsionActiveTimer = Math.max(0, propulsionActiveTimer - dt * 1000)
      // dreno progressivo enquanto segurado; solta o botão OU zera a carga = para na hora, sem
      // "resíduo" — a recarga (linha abaixo) só começa depois disso, no frame seguinte.
      if (repulsionActive) {
        if (repulsionHeld && boostCharge > 0) {
          boostCharge = Math.max(0, boostCharge - (dt * 1000) / BOOST_BRAKE_DRAIN_MS)
        }
        if (!repulsionHeld || boostCharge <= 0) repulsionActive = false
      }
      if (temporaryShieldTimerMs > 0) {
        temporaryShieldTimerMs = Math.max(0, temporaryShieldTimerMs - dt * 1000)
        if (temporaryShieldTimerMs <= 0) temporaryShieldValue = 0
      }
      if (swirlCooldownMs > 0) swirlCooldownMs = Math.max(0, swirlCooldownMs - dt * 1000)
      if (propulsionActiveTimer <= 0 && !repulsionActive && boostCharge < 1) {
        boostCharge = Math.min(1, boostCharge + (dt * 1000) / BOOST_RECHARGE_MS)
      }
      if (shieldRegenDelayTimer > 0) {
        shieldRegenDelayTimer = Math.max(0, shieldRegenDelayTimer - dt * 1000)
        if (shieldRegenDelayTimer <= 0 && shieldValue < shieldMax) {
          triggerSoundCue(PLAYER_SOUND_CUES.shield_regen, { currentShield: shieldValue, shieldMax })
        }
      } else if (shieldValue < shieldMax) {
        shieldValue = Math.min(shieldMax, shieldValue + shieldRegenRate * dt)
      }
    },
  }
}
