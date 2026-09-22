import * as THREE from 'three'
import { createWingmanTelemetry } from './wingman-telemetry.js'
import { createWingmanRadio, ABILITY_EVENT_IDS } from './wingman-radio.js'
import { WINGMAN_SOUND_CUES, triggerSoundCue } from '../audio-cues.js'
import { HORDA_KIND } from '../enemies/horda.js'
import { FRAGATA_KIND } from '../enemies/fragata.js'
import { BOSS_KIND } from '../enemies/boss.js'
import { GOLDEN_KIND } from '../enemies/golden.js'
import { POWER_LEVEL_AREA_DAMAGE } from '../enemies/shared.js'
import { aiValidator } from '../ai-validator.js'
import { createDamageFeedback } from './damage-feedback.js'

function hexToCss(n) {
  return '#' + n.toString(16).padStart(6, '0')
}

// ============ ESQUADRÃO STAR FOX (WINGMEN IA DE VOO LIVRE) ============
// Sistema de companheiros de equipe autônomos, vivos e úteis (v0.54.1).
// Até 4 membros permanentes com naves, modelos 3D, cores, personalidades e IA distintas.
// Modelo de Voo Livre (Free-Flight Patrol): voam livremente pelo espaço do trilho e da arena,
// cortam a tela em fly-bys cinematográficos, fazem dogfights independentes com roll dinâmico
// (banking nas curvas) e atacam inimigos sem ficarem colados como satélites na nave do jogador.

export const WINGMAN_PROFILES = [
  {
    id: 0,
    name: 'Falco',
    title: 'Ás Interceptor',
    color: 0x1d4ed8, // azul cobalto
    accentColor: 0x38bdf8, // ciano elétrico
    laserColor: 0x38bdf8,
    homeSide: -1, // viés de patrulha: ala esquerda
    fireInterval: 1.7,
    burstCount: 2,
    burstDelay: 0.14,
    // Perfil de voo (Overhaul de Personalidade, Ideia 1): rápido, giros apertados, corta o
    // horizonte — interceptador de verdade.
    flightProfile: { cruiseTurnRate: 2.6, aimTurnRate: 3.8, accelRate: 3.6, cruiseSpeed: 46 },
    // Agressividade (Ideia 2): agressivo, atira muito, mira imperfeita. Documento propunha
    // 0.65/6.5s "cru", mas o próprio §2.4 recomenda mitigar (histórico do projeto: 3 iterações
    // overkill↔transe) — começando em 0.55/5.5s, mais perto do 0.65 antigo global só que com
    // teto de segurança mais curto.
    combatProfile: { engagementChance: 0.55, dogfightDuration: 5.5, detectionRange: 90, aimSpreadRad: 0.08 },
    modelType: 'interceptor',
    abilityId: 'ram',
    abilityLabel: 'Investida Aríete',
    abilityCooldownBase: 14,
    abilityCooldownFloor: 7,
  },
  {
    id: 1,
    name: 'Peppy',
    title: 'Defensor Blindado',
    color: 0x059669, // verde esmeralda
    accentColor: 0xfbbf24, // ouro
    laserColor: 0x34d399,
    homeSide: 1, // viés de patrulha: ala direita
    fireInterval: 2.4,
    burstCount: 1,
    burstDelay: 0,
    // Perfil de voo: pesado, mantém curso, vira devagar — o "defensor" não persegue alvo em
    // zigue-zague, prefere ir direto.
    flightProfile: { cruiseTurnRate: 1.5, aimTurnRate: 2.2, accelRate: 2.2, cruiseSpeed: 32 },
    // Agressividade: defensivo, raramente engaja, tiros certeiros — não é o "wingman ruim", é o
    // que fica perto e é letal quando engaja de verdade.
    combatProfile: { engagementChance: 0.25, dogfightDuration: 3.5, detectionRange: 60, aimSpreadRad: 0.03 },
    modelType: 'bomber',
    abilityId: 'guard',
    abilityLabel: 'Guarda',
    abilityCooldownBase: 20,
    abilityCooldownFloor: 10,
  },
  {
    id: 2,
    name: 'Slippy',
    title: 'Batedor Solar',
    color: 0xea580c, // laranja intenso
    accentColor: 0xfde047, // amarelo brilhante
    laserColor: 0xfbbf24,
    homeSide: -1,
    fireInterval: 1.9,
    burstCount: 2,
    burstDelay: 0.16,
    // Perfil de voo: equilibrado, levemente ágil.
    flightProfile: { cruiseTurnRate: 2.2, aimTurnRate: 3.0, accelRate: 3.0, cruiseSpeed: 40 },
    // Agressividade: intermediário — meio-termo entre Falco e Peppy em tudo.
    combatProfile: { engagementChance: 0.50, dogfightDuration: 4.5, detectionRange: 75, aimSpreadRad: 0.05 },
    modelType: 'scout',
    abilityId: 'repair',
    abilityLabel: 'Reparo de Campo',
    abilityCooldownBase: 18,
    abilityCooldownFloor: 9,
  },
  {
    id: 3,
    name: 'Miyu',
    title: 'Vanguarda Fantasma',
    color: 0x7c3aed, // roxo estelar
    accentColor: 0xf43f5e, // rosa neon
    laserColor: 0xe879f9,
    homeSide: 1,
    fireInterval: 1.8,
    burstCount: 2,
    burstDelay: 0.12,
    // Perfil de voo: fluido e controlado, elegante.
    flightProfile: { cruiseTurnRate: 2.4, aimTurnRate: 3.2, accelRate: 3.2, cruiseSpeed: 44 },
    // Agressividade: cirúrgico, engaja quando vale — mira quase perfeita mesmo fora de combo alto.
    combatProfile: { engagementChance: 0.40, dogfightDuration: 5.5, detectionRange: 80, aimSpreadRad: 0.03 },
    modelType: 'stealth',
    abilityId: 'assist',
    abilityLabel: 'Carga Compartilhada',
    abilityCooldownBase: 16,
    abilityCooldownFloor: 8,
  },
]

// Vagas de formação tática fixa (estilo Star Fox 64):
// O jogador fica no bolsão central da formação; os companheiros mantêm disciplina
// rígida de escolta e serenidade cinematográfica em vez de piruetas frenéticas.
//
// Fix (pedido do usuário: "tem um aliado que fica fora da tela na maior parte do tempo"): Peppy e
// Slippy tinham `forward` NEGATIVO (-3 e -5, "atrás" do jogador) — como a câmera já fica atrás da
// própria nave do jogador, isso colocava os dois quase em cima ou atrás da câmera. Medido ao vivo
// via projeção NDC em 600 frames de voo livre: Slippy ficava visível em tela apenas 0.0% do tempo,
// Peppy só 9.8% (contra 96.7% do Falco e 88.8% da Miyu). Ambos agora ficam À FRENTE da nave
// também, só mais perto dela que Falco/Miyu — reconfirmado no mesmo teste: 90%+ pros quatro.
export const FORMATION_SLOTS = [
  // Falco: Ala Esquerda Avançada (Ás Interceptor)
  { side: -11.0, up: 1.0, forward: 14.0 },
  // Peppy: Ala Direita Próxima (Defensor Blindado)
  { side: 12.5, up: -0.5, forward: 5.0 },
  // Slippy: Ala Esquerda Próxima (Batedor Solar)
  { side: -12.5, up: -0.5, forward: 4.0 },
  // Miyu: Ala Direita Alta Avançada (Vanguarda Fantasma)
  { side: 11.0, up: 2.2, forward: 16.0 },
]

// ============ REAGRUPAMENTO E LINHAS DE ATAQUE ============
// Um aliado só sai de `regroup` quando realmente retorna à sua própria vaga, nunca por um
// timeout. Durante foco, cada piloto usa uma linha de aproximação exclusiva no mesmo alvo;
// isso evita que os quatro convirjam para o mesmo ponto visual e pareçam uma única nave.
const WINGMAN_MAX_DISTANCE_RAIL = 48
const WINGMAN_MAX_DISTANCE_ARENA = 72
const WINGMAN_REGROUP_ARRIVAL_RAIL = 4
const WINGMAN_REGROUP_ARRIVAL_ARENA = 5
const WINGMAN_REGROUP_SPEED_CAP = 64
// Última rede de segurança: estados ofensivos podem se afastar temporariamente, mas nunca podem
// manter um aliado perdido fora do espaço de jogo. É um retorno em voo, não teleporte.
const WINGMAN_EMERGENCY_REGROUP_MULTIPLIER = 1.5
const WINGMAN_EMERGENCY_REGROUP_SPEED = 140
const WINGMAN_ATTACK_LANE_SPACING = 9
const WINGMAN_ATTACK_LANE_VERTICAL = 3.5
const WINGMAN_SEPARATION_DISTANCE = 7
const WINGMAN_SEPARATION_SPEED = 48

// Reutilizáveis de rotação e matriz ortonormal para cálculo de orientação sem piruetas
const _rotMatrix = new THREE.Matrix4()
const _targetQuat = new THREE.Quaternion()
const _bankedRight = new THREE.Vector3()
const _bankedUp = new THREE.Vector3()
const _fwdVec = new THREE.Vector3()
const _rightVec = new THREE.Vector3()
const _upVec = new THREE.Vector3()
const _UP_DIR = new THREE.Vector3(0, 1, 0)
const _wmSlotPos = new THREE.Vector3()
const _wmToTarget = new THREE.Vector3()
const _wmDesiredVelocity = new THREE.Vector3()
const _wmDiff = new THREE.Vector3()
const _wmPush = new THREE.Vector3()
const _wmToEnemy = new THREE.Vector3()
const _wmVelNorm = new THREE.Vector3()
const _wmAimDir = new THREE.Vector3()
const _wmSpreadDir = new THREE.Vector3()
const _wmLaserMuzzle = new THREE.Vector3()
const _wmRel = new THREE.Vector3()
const _wlPrevPos = new THREE.Vector3()
const _wlStep = new THREE.Vector3()
const _wmNoseToPlayer = new THREE.Vector3()
const _wmInvQuat = new THREE.Quaternion()
const _wmAttackLane = new THREE.Vector3()
const _wmObstacleRelative = new THREE.Vector3()
const _wmObstacleRelativeVelocity = new THREE.Vector3()
const _wmObstacleClosestPoint = new THREE.Vector3()

// Taxa de giro (rad/s, usada por quaternion.rotateTowards) e velocidade/aceleração de cruzeiro
// agora vêm de `profile.flightProfile` (Overhaul de Personalidade, Ideia 1) — cada piloto tem o
// próprio valor em vez de uma constante global única.

const WINGMAN_LASER_SPEED = 125
const WINGMAN_LASER_LIFETIME = 1.8
const WINGMAN_LASER_DAMAGE = 1
// ============ MIYU — COR DOS DISPAROS CARREGADOS ============
// Carga Compartilhada e Boombuster usam roxo no projétil, nas argolas e no rastro. O laser
// normal de combate da Miyu permanece rosa, preservando a identidade visual da piloto.
const MIYU_CHARGED_SHOT_COLOR = 0x9b5de5
// ============ MIYU — BOOMBUSTER ============
// Orbes roxos homing: 3 de dano (definido pelo usuário), até 1 + stacks alvos. Cooldown
// sugerido pelo documento (10→4s) e raio de 90u escolhido para cobrir o combate normal.
const MIYU_BOOMBUSTER_COLOR = MIYU_CHARGED_SHOT_COLOR
const MIYU_BOOMBUSTER_DAMAGE = 3
const MIYU_BOOMBUSTER_BASE_COOLDOWN_S = 10
const MIYU_BOOMBUSTER_COOLDOWN_PER_STACK_S = 2
const MIYU_BOOMBUSTER_TARGET_RADIUS = 90
const MIYU_BOOMBUSTER_TURN_RATE = 6.5
const MIYU_BOOMBUSTER_LIFETIME_S = 3.0
const MIYU_STATUS_BONUS_S = 2
// Dispersão angular (rad) da rajada de dogfight — mira imperfeita, tiros não saem 100% retos.
// Valor base agora é por piloto (combatProfile.aimSpreadRad, Ideia 2 do Overhaul de
// Personalidade); esta constante só documenta a origem histórica.
const FORWARD_AXIS = new THREE.Vector3(0, 0, 1)

// ============ HABILIDADES ÚNICAS DO ESQUADRÃO ============
// Uma ação autônoma por piloto (ver PLANO_HABILIDADES_ESQUADRAO.md), cada uma com cooldown
// próprio (abilityCooldownBase, reduzido por carta até abilityCooldownFloor — ver
// applyAbilityCooldownCard). Falco investe em aríete, Peppy dá guarda (escudo), Slippy solta
// orbe de reparo ao acertar um tiro, Miyu acopla pra acelerar o tiro carregado do jogador.
const RAM_MIN_RANGE = 20
const RAM_MAX_RANGE = 45
const RAM_HIT_RADIUS = 2.2
const RAM_DAMAGE = 6
const RAM_DAMAGE_VS_BOSS = 2
const RAM_TIMEOUT_S = 2.5

// ============ CARTAS DE FALCO (Docs/# Documento de Implementação — Nova.md, item 3) ============
// Falco Combate: raio de busca do próximo alvo em cadeia (sugestão do próprio doc, "a definir
// pela IA") a partir da posição ATUAL de Falco no instante do acerto — não da posição do alvo.
const FALCO_CHAIN_RADIUS = 80
// Falco Intercept: nível de poder mínimo do projétil pra valer a pena interceptar (3 = área, 4 =
// alto impacto — chefe/dourado/horda hoje; nível 3 ainda não é emitido por nenhum inimigo, mas o
// doc já pede a checagem "3-4" de antemão). Cooldown por stack: `6 - stacks` segundos (6s sem
// carta não dispara — a ability só ativa com stacks > 0). A remoção é atômica no sistema de
// inimigos: um Intercept nunca pode destruir projéteis vizinhos como efeito colateral.
const FALCO_INTERCEPT_MIN_POWER_LEVEL = POWER_LEVEL_AREA_DAMAGE
const FALCO_INTERCEPT_BASE_COOLDOWN_S = 6
const FALCO_INTERCEPT_COLOR = 0x0066ff // azul mais forte que o laser padrão de Falco (0x38bdf8)
// Falco Status: bônus de dogfightDuration por stack (base 5.5s → 11.5s com 3 stacks).
const FALCO_STATUS_BONUS_S = 2

// ============ PEPPY RESCUE — COOLDOWN E ALCANCE ============
// Cartão 0/3: 20, 16 ou 12 segundos. Peppy só cancela knockback ao chegar perto do jogador;
// não há teleporte, portanto o resgate permanece legível e respeita a distância física.
const PEPPY_RESCUE_BASE_COOLDOWN_S = 20
const PEPPY_RESCUE_COOLDOWN_PER_STACK_S = 4
const PEPPY_RESCUE_TRIGGER_RANGE = 5
const PEPPY_AUX_SHIELD_INNER_RADIUS = 2.8
const PEPPY_AUX_SHIELD_OUTER_RADIUS = 3.15

// ============ INTEGRIDADE DOS ALIADOS ============
// Todos começam com 4 HP e 3 de escudo; Peppy e Slippy recebem duas cargas extras. O escudo
// segue o jogador: 1.5s sem dano e 0.4 carga/s. Casco da Ala soma até três HP máximos globais.
const WINGMAN_BASE_HP = 4
const WINGMAN_BASE_SHIELD = 3
const WINGMAN_DEFENDER_SHIELD_BONUS = 2
const WINGMAN_SHIELD_REGEN_DELAY_S = 1.5
const WINGMAN_SHIELD_REGEN_PER_S = 0.4
const WINGMAN_LOW_HP = 1
const WINGMAN_RETREAT_DURATION_S = 5
const WINGMAN_REPAIR_RADIUS_BASE = 15
const WINGMAN_REPAIR_RADIUS_PER_STACK = 8
const WINGMAN_CRITICAL_COLOR = new THREE.Color(0xff263d)

// ============ DESVIO DE OBSTÁCULOS — OPÇÃO 1 ============
// Aliados prevêem o ponto de maior aproximação contra detritos e aplicam só um vetor lateral
// temporário. Não há teleporte, troca de state nem dano por colisão: é uma rota segura que
// preserva dogfight, escolta e formação. O lado fica travado por obstáculo para não oscilar.
const WINGMAN_OBSTACLE_LOOKAHEAD_S = 2.0
const WINGMAN_OBSTACLE_CLEARANCE = 7.5
const WINGMAN_OBSTACLE_AVOID_SPEED = 52
const WINGMAN_OBSTACLE_RADIUS = 1.25

const GUARD_ESCORT_S = 4.0
const GUARD_TRIGGER_RANGE = 9

const ASSIST_MIN_HOLD_S = 0.35
const ASSIST_MAX_S = 3.0
const ASSIST_CHARGE_MULT = 1.5
const ASSIST_EXTRA_TARGETS = 1

// Comando de ofensividade do esquadrão ([D], concentrar fogo) — pedido do usuário: não pode mais
// ficar ligado indefinidamente até o jogador desligar na mão. Dura 6s e depois volta sozinho pro
// normal; só pode ser reativado 10s depois de terminar (contado a partir do fim, não do início).
const SQUADRON_COMMAND_DURATION_S = 6.0
const SQUADRON_COMMAND_COOLDOWN_S = 10.0

const ESCORT_SIDE_OFFSET = 3.0
const ESCORT_UP_OFFSET = 0.6
const ESCORT_FORWARD_OFFSET = 2.5

// ============ PERSONALIDADE DE FORMAÇÃO (Overhaul de Personalidade, Ideia 4) ============
// Puramente cosmético — nenhum destes mexe em hitbox, colisão ou lógica de combate.
const FALCO_WEAVE_PERIOD_S = 2.5 // ciclo completo da oscilação lateral
const FALCO_WEAVE_AMPLITUDE = 3.0 // ±3u
const PEPPY_NOSE_MAX_RAD = THREE.MathUtils.degToRad(10)
const PEPPY_NOSE_EASE_RATE = 1.6 // rad/s aproximados em direção ao ângulo-alvo
const SLIPPY_ROLL_DELAY_S = 0.3
const SLIPPY_ROLL_HISTORY_MAX_S = 1.0 // poda o buffer além disso — mais que suficiente pro delay
const MIYU_CLOAK_CYCLE_S = 8.0
const MIYU_CLOAK_DURATION_S = 1.5
const MIYU_CLOAK_OPACITY = 0.35

// ============ CONSTRUTORES DE MODELOS 3D ÚNICOS ============

// Pedido explícito do usuário (repetido — a redução de tamanho da v0.73.2 não foi suficiente):
// o caça do jogador (buildShip em rail.js) não tem chama de propulsor NENHUMA, só corpo/asa/
// barbatanas — pra "impedir distrações". Os aliados agora seguem a mesma regra: a malha do
// propulsor continua existindo (algum código ainda anima sua escala por isThrusting), só que
// invisível, igual ao jogador não ter chama alguma.
function createThrusterLight(color) {
  const geo = new THREE.CylinderGeometry(0.06, 0.09, 0.24, 8)
  geo.rotateX(Math.PI / 2)
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75 })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.visible = false
  return mesh
}

function buildInterceptorShip(profile) {
  const group = new THREE.Group()
  const hullMat = new THREE.MeshPhongMaterial({ color: profile.color, flatShading: true })
  const accentMat = new THREE.MeshPhongMaterial({ color: profile.accentColor, flatShading: true })
  const cockpitMat = new THREE.MeshBasicMaterial({ color: profile.accentColor })

  // Fuselagem esguia pontiaguda
  const bodyGeo = new THREE.ConeGeometry(0.35, 2.4, 4)
  bodyGeo.rotateX(-Math.PI / 2)
  const body = new THREE.Mesh(bodyGeo, hullMat)
  group.add(body)

  // Asas em flecha invertida / interceptor
  const wingGeo = new THREE.BoxGeometry(3.4, 0.06, 0.9)
  const wings = new THREE.Mesh(wingGeo, hullMat)
  wings.position.set(0, 0, -0.2)
  group.add(wings)

  // Canards dianteiros
  const canardGeo = new THREE.BoxGeometry(1.2, 0.05, 0.35)
  const canards = new THREE.Mesh(canardGeo, accentMat)
  canards.position.set(0, 0.04, 0.65)
  group.add(canards)

  // Cockpit
  const cockpitGeo = new THREE.BoxGeometry(0.24, 0.22, 0.7)
  const cockpit = new THREE.Mesh(cockpitGeo, cockpitMat)
  cockpit.position.set(0, 0.15, 0.2)
  group.add(cockpit)

  // Estabilizadores verticais duplos
  const finGeo = new THREE.BoxGeometry(0.05, 0.45, 0.5)
  const finL = new THREE.Mesh(finGeo, accentMat)
  finL.position.set(-0.5, 0.25, -0.7)
  finL.rotation.z = -0.2
  const finR = new THREE.Mesh(finGeo, accentMat)
  finR.position.set(0.5, 0.25, -0.7)
  finR.rotation.z = 0.2
  group.add(finL, finR)

  // Propulsores duplos
  const thrusterL = createThrusterLight(profile.accentColor)
  thrusterL.position.set(-0.35, 0, -1.2)
  const thrusterR = createThrusterLight(profile.accentColor)
  thrusterR.position.set(0.35, 0, -1.2)
  group.add(thrusterL, thrusterR)

  group.scale.setScalar(1.0)
  return { mesh: group, thrusters: [thrusterL, thrusterR] }
}

function buildBomberShip(profile) {
  const group = new THREE.Group()
  const hullMat = new THREE.MeshPhongMaterial({ color: profile.color, flatShading: true })
  const accentMat = new THREE.MeshPhongMaterial({ color: profile.accentColor, flatShading: true })
  const cockpitMat = new THREE.MeshBasicMaterial({ color: profile.accentColor })

  // Fuselagem robusta e chanfrada
  const bodyGeo = new THREE.BoxGeometry(0.85, 0.5, 2.1)
  const body = new THREE.Mesh(bodyGeo, hullMat)
  group.add(body)

  // Blindagem dianteira
  const noseGeo = new THREE.ConeGeometry(0.55, 0.8, 4)
  noseGeo.rotateX(-Math.PI / 2)
  const nose = new THREE.Mesh(noseGeo, accentMat)
  nose.position.set(0, 0, 1.25)
  group.add(nose)

  // Asas largas e pesadas
  const wingGeo = new THREE.BoxGeometry(4.2, 0.16, 1.3)
  const wings = new THREE.Mesh(wingGeo, hullMat)
  wings.position.set(0, 0, -0.15)
  group.add(wings)

  // Pods de canhões pesados nas asas
  const cannonGeo = new THREE.CylinderGeometry(0.12, 0.12, 1.3, 8)
  cannonGeo.rotateX(Math.PI / 2)
  const cannonL = new THREE.Mesh(cannonGeo, accentMat)
  cannonL.position.set(-1.8, -0.05, 0.1)
  const cannonR = new THREE.Mesh(cannonGeo, accentMat)
  cannonR.position.set(1.8, -0.05, 0.1)
  group.add(cannonL, cannonR)

  // Cockpit
  const cockpitGeo = new THREE.BoxGeometry(0.38, 0.28, 0.6)
  const cockpit = new THREE.Mesh(cockpitGeo, cockpitMat)
  cockpit.position.set(0, 0.28, 0.15)
  group.add(cockpit)

  // Propulsor pesado
  const thrusterL = createThrusterLight(profile.laserColor)
  thrusterL.position.set(-0.25, 0, -1.15)
  const thrusterR = createThrusterLight(profile.laserColor)
  thrusterR.position.set(0.25, 0, -1.15)
  group.add(thrusterL, thrusterR)

  group.scale.setScalar(0.95)
  return { mesh: group, thrusters: [thrusterL, thrusterR] }
}

function buildScoutShip(profile) {
  const group = new THREE.Group()
  const hullMat = new THREE.MeshPhongMaterial({ color: profile.color, flatShading: true })
  const accentMat = new THREE.MeshPhongMaterial({ color: profile.accentColor, flatShading: true })
  const cockpitMat = new THREE.MeshBasicMaterial({ color: profile.accentColor })

  // Fuselagem compacta e arredondada
  const bodyGeo = new THREE.CylinderGeometry(0.4, 0.45, 1.8, 6)
  bodyGeo.rotateX(Math.PI / 2)
  const body = new THREE.Mesh(bodyGeo, hullMat)
  group.add(body)

  // Bico com sensor
  const noseGeo = new THREE.ConeGeometry(0.4, 0.7, 6)
  noseGeo.rotateX(-Math.PI / 2)
  const nose = new THREE.Mesh(noseGeo, accentMat)
  nose.position.set(0, 0, 1.15)
  group.add(nose)

  // Asas em V (diedro positivo)
  const wingGeo = new THREE.BoxGeometry(1.6, 0.08, 0.8)
  const wingL = new THREE.Mesh(wingGeo, hullMat)
  wingL.position.set(-0.95, 0.18, -0.2)
  wingL.rotation.z = 0.22
  const wingR = new THREE.Mesh(wingGeo, hullMat)
  wingR.position.set(0.95, 0.18, -0.2)
  wingR.rotation.z = -0.22
  group.add(wingL, wingR)

  // Cockpit abobadado
  const cockpitGeo = new THREE.SphereGeometry(0.3, 8, 8)
  const cockpit = new THREE.Mesh(cockpitGeo, cockpitMat)
  cockpit.position.set(0, 0.22, 0.25)
  group.add(cockpit)

  // Propulsor central
  const thruster = createThrusterLight(profile.laserColor)
  thruster.position.set(0, 0, -1.0)
  group.add(thruster)

  group.scale.setScalar(0.92)
  return { mesh: group, thrusters: [thruster] }
}

function buildStealthShip(profile) {
  const group = new THREE.Group()
  const hullMat = new THREE.MeshPhongMaterial({ color: profile.color, flatShading: true })
  const accentMat = new THREE.MeshPhongMaterial({ color: profile.accentColor, flatShading: true })
  const cockpitMat = new THREE.MeshBasicMaterial({ color: profile.accentColor })

  // Fuselagem angular em facetas de diamante
  const bodyGeo = new THREE.ConeGeometry(0.5, 2.2, 4)
  bodyGeo.rotateX(-Math.PI / 2)
  bodyGeo.rotateZ(Math.PI / 4)
  const body = new THREE.Mesh(bodyGeo, hullMat)
  group.add(body)

  // Asas enflechadas em delta furtivo
  const wingGeo = new THREE.BoxGeometry(3.8, 0.06, 1.4)
  const wings = new THREE.Mesh(wingGeo, hullMat)
  wings.position.set(0, -0.05, -0.3)
  group.add(wings)

  // Pontas de asa anguladas para baixo
  const tipGeo = new THREE.BoxGeometry(0.6, 0.05, 0.8)
  const tipL = new THREE.Mesh(tipGeo, accentMat)
  tipL.position.set(-1.95, -0.15, -0.35)
  tipL.rotation.z = -0.45
  const tipR = new THREE.Mesh(tipGeo, accentMat)
  tipR.position.set(1.95, -0.15, -0.35)
  tipR.rotation.z = 0.45
  group.add(tipL, tipR)

  // Cockpit em fenda
  const cockpitGeo = new THREE.BoxGeometry(0.18, 0.16, 0.8)
  const cockpit = new THREE.Mesh(cockpitGeo, cockpitMat)
  cockpit.position.set(0, 0.2, 0.1)
  group.add(cockpit)

  // Propulsor furtivo
  const thrusterL = createThrusterLight(profile.laserColor)
  thrusterL.position.set(-0.25, 0, -1.15)
  const thrusterR = createThrusterLight(profile.laserColor)
  thrusterR.position.set(0.25, 0, -1.15)
  group.add(thrusterL, thrusterR)

  group.scale.setScalar(0.96)
  return { mesh: group, thrusters: [thrusterL, thrusterR] }
}

function buildWingmanShip(profile) {
  switch (profile.modelType) {
    case 'interceptor': return buildInterceptorShip(profile)
    case 'bomber': return buildBomberShip(profile)
    case 'scout': return buildScoutShip(profile)
    case 'stealth': return buildStealthShip(profile)
    default: return buildInterceptorShip(profile)
  }
}

// ============ SISTEMA PRINCIPAL DO ESQUADRÃO LIVRE ============

export function createSquadronSystem(scene, rail, effects, enemies) {
  const telemetry = createWingmanTelemetry()
  const wingmanRadio = createWingmanRadio()
  // Mensagens de rádio disparadas FORA do laço de update() (dano externo ao jogador vindo de
  // game-loop.js, ou dismiss de piloto que esvazia o esquadrão) ficam aqui até o próximo update()
  // pegar e devolver no wingmanResult — 1 frame de atraso, imperceptível pra um popup de texto.
  let pendingRadioMessage = null
  // isAbility decide em qual região do HUD a fala aparece (hud-game.js: painel superior/ability
  // vs. inferior/trivial) — classificado por eventId via ABILITY_EVENT_IDS, nunca por engano.
  function buildRadioPayload(profile, text, eventId) {
    return { pilotId: profile.id, name: profile.name, color: hexToCss(profile.accentColor), text, isAbility: ABILITY_EVENT_IDS.has(eventId) }
  }
  // Chama o dispatcher pra um evento de um piloto específico; devolve o payload pro HUD ou null
  // (cooldown global ainda ativo, ou esse par piloto+evento não tem fala cadastrada).
  function speak(profile, eventId) {
    const text = wingmanRadio.trySpeak(profile.id, eventId)
    return text ? buildRadioPayload(profile, text, eventId) : null
  }
  // Rádio: qual evento de "engajei" falar depende do tipo de inimigo — chefe/dourado e alguns
  // inimigos com identidade mais forte (Horda, Fragata) têm fala própria; o resto cai no genérico
  // engage_dogfight/engage_focus (fallbackEvent, decidido por quem chama).
  function engageEventFor(kind, fallbackEvent) {
    if (kind === BOSS_KIND || kind === GOLDEN_KIND) return 'engage_boss'
    if (kind === HORDA_KIND) return 'engage_horda'
    if (kind === FRAGATA_KIND) return 'engage_fragata'
    return fallbackEvent
  }
  const activeWingmen = []
  const activeLasers = []
  let elapsed = 0
  let chargeHeldTimer = 0
  let wasPlayerLowHealth = false // edge-detect pro evento player_low_health (só dispara na virada)
  let wasBoostActive = false // edge-detect pro evento boost_used
  let wasHomingCharging = false // edge-detect pro evento charged_shot_used (dispara ao SOLTAR)
  let pendingRadioQueue = null // rajada de "prontidão" do comando de foco — ver toggleCommand()
  // Slippy (Ideia 4): buffer do roll do JOGADOR pra imitar com 0.3s de atraso — um só histórico
  // no nível do sistema (o valor de origem é o mesmo pra quem quer que o leia), não por instância.
  const playerRollHistory = []

  function delayedPlayerRoll(delaySeconds) {
    const targetT = elapsed - delaySeconds
    for (let i = playerRollHistory.length - 1; i >= 0; i -= 1) {
      if (playerRollHistory[i].t <= targetT) return playerRollHistory[i].roll
    }
    return playerRollHistory.length > 0 ? playerRollHistory[0].roll : 0
  }

  const laserGeometry = new THREE.CylinderGeometry(0.09, 0.09, 1.4, 6)
  laserGeometry.rotateX(Math.PI / 2)

  // Carta "Falco Intercept" — feixe VISUAL-ONLY (array próprio, fora de activeLasers de
  // propósito): o projétil interceptado já é destruído na hora via
  // enemies.removeProjectilesNear(), então esse feixe não pode participar da resolução de
  // colisão normal (senão ia poder acertar/matar um inimigo qualquer no meio do caminho, dano
  // não previsto pelo doc). Geometria unitária (altura 1, eixo Z) escalada por instância pra
  // cobrir a distância real Falco→projétil.
  const interceptBeams = []
  const interceptBeamGeometry = new THREE.CylinderGeometry(0.05, 0.05, 1, 6)
  interceptBeamGeometry.rotateX(Math.PI / 2)
  // O bloqueio precisa ser lido à primeira vista: feixe mais espesso e persistente que um laser
  // comum, seguido de clarão, onda e faíscas azuis no ponto exato do projétil cancelado.
  const FALCO_INTERCEPT_BEAM_LIFETIME = 0.58

  function fireFalcoInterceptBeam(origin, targetPos) {
    const dir = targetPos.clone().sub(origin)
    const dist = dir.length()
    if (dist < 1e-4) return
    dir.multiplyScalar(1 / dist)
    const material = new THREE.MeshBasicMaterial({ color: FALCO_INTERCEPT_COLOR, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false })
    const mesh = new THREE.Mesh(interceptBeamGeometry, material)
    mesh.position.copy(origin).addScaledVector(dir, dist / 2)
    mesh.quaternion.setFromUnitVectors(FORWARD_AXIS, dir)
    mesh.scale.set(3.4, 3.4, dist)
    scene.add(mesh)
    interceptBeams.push({ mesh, material, life: FALCO_INTERCEPT_BEAM_LIFETIME })
    if (effects) {
      effects.muzzleFlash?.(origin, dir)
      effects.bloomSprite?.(origin, FALCO_INTERCEPT_COLOR, 1.35)
      effects.explosion?.(targetPos, FALCO_INTERCEPT_COLOR, 0.92, { rings: true })
      effects.shockwave?.(targetPos, FALCO_INTERCEPT_COLOR, 1.3)
      effects.bloomSprite?.(targetPos, FALCO_INTERCEPT_COLOR, 2.2)
      effects.ricochetSparks?.(targetPos, dir, FALCO_INTERCEPT_COLOR)
    }
  }

  function clearInterceptBeams() {
    for (let i = interceptBeams.length - 1; i >= 0; i--) {
      scene.remove(interceptBeams[i].mesh)
      interceptBeams[i].material.dispose()
    }
    interceptBeams.length = 0
  }

  // Multiplicador de cooldown por piloto (id 0-3), reduzido pelas cartas "Vínculo" — mora no
  // sistema (não na instância do wingman) pra sobreviver a remoção/respawn via debug.
  const abilityCooldownMultByProfileId = [1, 1, 1, 1]

  function applyAbilityCooldownCard(profileId) {
    const profile = WINGMAN_PROFILES[profileId]
    if (!profile) return
    const floorRatio = profile.abilityCooldownFloor / profile.abilityCooldownBase
    abilityCooldownMultByProfileId[profileId] = Math.max(floorRatio, abilityCooldownMultByProfileId[profileId] * 0.75)
  }

  function abilityCooldownFor(profile) {
    return profile.abilityCooldownBase * abilityCooldownMultByProfileId[profile.id]
  }

  // Carta "Falco Status" — só Falco (id 0) é afetado; os outros pilotos usam o
  // combatProfile.dogfightDuration de sempre, sem alteração.
  function effectiveDogfightDuration(profile, opts) {
    const bonus = profile.id === 0 ? (opts.falcoStatusStacks || 0) * FALCO_STATUS_BONUS_S
      : profile.id === 3 ? (opts.miyuStatusStacks || 0) * MIYU_STATUS_BONUS_S : 0
    return profile.combatProfile.dogfightDuration + bonus
  }

  function getAbilityStates() {
    return WINGMAN_PROFILES.map((profile) => {
      const cooldownTotal = abilityCooldownFor(profile)
      const w = activeWingmen.find((x) => x.profile.id === profile.id)
      if (!w) {
        return {
          id: profile.id, abilityId: profile.abilityId, name: profile.name, color: profile.accentColor,
          recruited: false, ready: false, active: false, cooldownRemaining: cooldownTotal, cooldownTotal,
        }
      }
      return {
        id: profile.id, abilityId: profile.abilityId, name: profile.name, color: profile.accentColor,
        recruited: true,
        ready: !w.abilityActive && w.abilityCooldown <= 0,
        active: w.abilityActive,
        cooldownRemaining: Math.max(0, w.abilityCooldown),
        cooldownTotal,
      }
    })
  }

  // Sub-ícones de cooldown por piloto (Docs/# Documento de Implementação — Nova.md, item 3 —
  // "Sub-ícones de cooldown"): cada carta com cooldown PRÓPRIO (independente do hex principal)
  // gera um sub-ícone, só aparece se o jogador tem a carta. Hoje só Falco Intercept se qualifica
  // (Combate reusa o cooldown do Ram; Status é passivo, sem cooldown nenhum). `cardStacks` vem de
  // game-loop.js (leitura direta do player, mesmo padrão do opts passado pro update() normal).
  function getSubAbilityStates(cardStacks = {}) {
    const falcoInterceptStacks = cardStacks.falcoInterceptStacks || 0
    const falcoSubs = []
    const peppySubs = []
    const miyuSubs = []
    if (falcoInterceptStacks > 0) {
      const w = activeWingmen.find((x) => x.profile.id === 0)
      const cooldownTotal = Math.max(1, FALCO_INTERCEPT_BASE_COOLDOWN_S - falcoInterceptStacks)
      falcoSubs.push({
        id: 'falco-intercept',
        icon: '🛑',
        color: WINGMAN_PROFILES[0].accentColor,
        ready: !!w && w.interceptCooldown <= 0,
        cooldownRemaining: w ? Math.max(0, w.interceptCooldown) : cooldownTotal,
        cooldownTotal,
      })
    }
    if ((cardStacks.peppyRescueStacks || 0) > 0) {
      const w = activeWingmen.find((x) => x.profile.id === 1)
      const cooldownTotal = Math.max(1, PEPPY_RESCUE_BASE_COOLDOWN_S - PEPPY_RESCUE_COOLDOWN_PER_STACK_S * cardStacks.peppyRescueStacks)
      peppySubs.push({ id: 'peppy-rescue', icon: '🛟', color: WINGMAN_PROFILES[1].accentColor, ready: !!w && w.rescueCooldown <= 0, cooldownRemaining: w ? Math.max(0, w.rescueCooldown) : cooldownTotal, cooldownTotal })
    }
    if ((cardStacks.miyuBoombusterStacks || 0) > 0) {
      const stacks = cardStacks.miyuBoombusterStacks
      const w = activeWingmen.find((x) => x.profile.id === 3)
      const cooldownTotal = Math.max(1, MIYU_BOOMBUSTER_BASE_COOLDOWN_S - MIYU_BOOMBUSTER_COOLDOWN_PER_STACK_S * stacks)
      miyuSubs.push({ id: 'miyu-boombuster', icon: '🟣', color: MIYU_BOOMBUSTER_COLOR, ready: !!w && w.boombusterCooldown <= 0, cooldownRemaining: w ? Math.max(0, w.boombusterCooldown) : cooldownTotal, cooldownTotal })
    }
    return WINGMAN_PROFILES.map((profile) => ({
      profileId: profile.id,
      subs: profile.id === 0 ? falcoSubs : profile.id === 1 ? peppySubs : profile.id === 3 ? miyuSubs : [],
    }))
  }

  function getAssistChargeMult() {
    return activeWingmen.some((w) => w.abilityActive && w.escortKind === 'assist') ? ASSIST_CHARGE_MULT : 1
  }

  // Quantos alvos extras de trava do tiro teleguiado a Carga Compartilhada da Miyu concede
  // enquanto acoplado — empilha com a carta 'more-homing-targets', o teto (HOMING_MAX_TARGETS_CAP)
  // é respeitado do lado de fora (game-loop.js), aqui é só o bônus bruto.
  function getAssistExtraTargets(stacks = 0) {
    return activeWingmen.some((w) => w.abilityActive && w.escortKind === 'assist') ? ASSIST_EXTRA_TARGETS + stacks : 0
  }

  // Coleta os materiais únicos de um mesh composto (grupo de partes) — usado pela Miyu pra
  // animar opacidade (Ideia 4). buildWingmanShip já cria materiais NOVOS a cada chamada (nunca
  // compartilhados entre instâncias — só há 1 Miyu viva por vez de qualquer forma), então não
  // precisa clonar de novo aqui, só coletar as referências.
  function collectMaterials(mesh) {
    const materials = new Set()
    mesh.traverse((child) => {
      if (child.isMesh && child.material) materials.add(child.material)
    })
    return [...materials]
  }

  // Arco frontal da Opção 1: fica preso ao Peppy e só aparece durante a repulsão.
  // O impacto em cada projétil bloqueado é criado pelo sistema de combate.
  function createPeppyAuxShieldVisual() {
    const arc = new THREE.Mesh(
      new THREE.RingGeometry(PEPPY_AUX_SHIELD_INNER_RADIUS, PEPPY_AUX_SHIELD_OUTER_RADIUS, 28, 1, 0, Math.PI),
      new THREE.MeshBasicMaterial({ color: 0x7be7ff, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false }),
    )
    arc.position.z = 1.8
    arc.visible = false
    return arc
  }

  function spawnMember(profileId) {
    const profile = WINGMAN_PROFILES[profileId]
    if (!profile) return null
    if (activeWingmen.some((w) => w.profile.id === profile.id)) return null

    const { mesh, thrusters } = buildWingmanShip(profile)
    const playerPos = rail.getPlayerPosition()
    const frame = rail.getFrameAt(0)
    
    // Posição inicial no espaço: vaga de formação dedicada
    const slot = FORMATION_SLOTS[profile.id] || { side: profile.homeSide * 11, up: 0, forward: 8 }
    const spawnPos = playerPos.clone()
      .addScaledVector(frame.right, slot.side)
      .addScaledVector(frame.up, slot.up)
      .addScaledVector(frame.forward, slot.forward)
    mesh.position.copy(spawnPos)
    mesh.quaternion.setFromUnitVectors(FORWARD_AXIS, frame.forward)
    scene.add(mesh)

    const laserMaterial = new THREE.MeshBasicMaterial({ color: profile.laserColor })
    const auxShieldVisual = profile.id === 1 ? createPeppyAuxShieldVisual() : null
    if (auxShieldVisual) mesh.add(auxShieldVisual)

    const wingman = {
      profile,
      mesh,
      thrusters,
      laserMaterial,
      state: 'patrol', // 'patrol' | 'dogfight' | 'regroup' | 'escort' | 'ram'
      stateTimer: 0,
      velocity: frame.forward.clone().multiplyScalar(profile.flightProfile.cruiseSpeed),
      smoothRoll: 0,
      patrolTarget: spawnPos.clone(),
      targetEnemy: null,
      fireCooldown: 1.5 + Math.random() * 1.0,
      engagementCooldown: 3.0 + Math.random() * 2.0, // calma inicial antes de qualquer engajamento
      burstRemaining: 0,
      burstTimer: 0,
      // habilidade única (ver seção "HABILIDADES ÚNICAS DO ESQUADRÃO" acima): começa na metade
      // do cooldown, não pronta de cara no primeiro segundo de jogo.
      abilityCooldown: abilityCooldownFor(profile) * 0.5,
      abilityActive: false,
      abilityTimer: 0,
      abilityApplied: false,
      // Falco: cooldown próprio do Intercept (independente do abilityCooldown da Investida
      // Aríete) e contador de alvos já encadeados na Investida em Cadeia (zerado a cada nova
      // investida, ver início do state 'ram' abaixo).
      interceptCooldown: 0,
      rescueCooldown: 0,
      boombusterCooldown: 0,
      hp: WINGMAN_BASE_HP,
      maxHp: WINGMAN_BASE_HP,
      shieldMax: WINGMAN_BASE_SHIELD + ((profile.id === 1 || profile.id === 2) ? WINGMAN_DEFENDER_SHIELD_BONUS : 0),
      shield: WINGMAN_BASE_SHIELD + ((profile.id === 1 || profile.id === 2) ? WINGMAN_DEFENDER_SHIELD_BONUS : 0),
      shieldRegenDelay: 0,
      retreatEffectTimer: 0,
      collisionBumpCooldown: 0,
      obstacleAvoidanceId: null,
      obstacleAvoidanceSide: 0,
      overlapWith: new Set(),
      emergencyRegroup: false,
      chainCount: 0,
      escortKind: null, // 'guard' | 'assist' | 'auxShield' — só usado quando state === 'escort'
      auxShieldVisual,
      damageMaterials: collectMaterials(mesh),
      damageColors: null,
      // Personalidade de formação (Ideia 4) — só o piloto correspondente usa cada campo:
      miyuCloakTimer: 0, // Miyu: fase do ciclo de semi-transparência (8s, 1.5s "cloaked")
      miyuMaterials: profile.id === 3 ? collectMaterials(mesh) : null,
    }
    wingman.damageColors = wingman.damageMaterials.map((material) => material.color ? material.color.clone() : null)
    if (wingman.miyuMaterials) {
      for (const m of wingman.miyuMaterials) m.transparent = true
    }

    activeWingmen.push(wingman)
    if (effects && effects.wingmanSpawn) {
      effects.wingmanSpawn(mesh.position)
    }
    telemetry.recordEvent(profile.name, 'flight', `Caça ${profile.name} (${profile.title}) ingressou na formação`, {
      slot,
      elapsed,
    })
    return wingman
  }

  function disposeWingmanMesh(mesh) {
    if (!mesh) return
    mesh.traverse((child) => {
      if (child.isMesh) {
        if (child.geometry) child.geometry.dispose()
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => m.dispose())
          } else {
            child.material.dispose()
          }
        }
      }
    })
  }

  function removeMember(profileId) {
    const index = activeWingmen.findIndex((w) => w.profile.id === profileId)
    if (index === -1) return
    const w = activeWingmen.splice(index, 1)[0]
    scene.remove(w.mesh)
    disposeWingmanMesh(w.mesh)
    w.laserMaterial.dispose()
    telemetry.recordEvent(w.profile.name, 'flight', `Caça ${w.profile.name} dispensado da formação`, { elapsed })
    // Rádio (Ideia 3, evento "alone"): o piloto que acabou de sair fala, se o esquadrão ficou
    // vazio — só 1x por partida (ver wingman-radio.js → trySpeakAlone).
    if (activeWingmen.length === 0) {
      const text = wingmanRadio.trySpeakAlone(w.profile.id)
      if (text) pendingRadioMessage = buildRadioPayload(w.profile, text, 'alone')
    }
  }

  function recoverMember(profileId, hullStacks = 0) {
    const wingman = spawnMember(profileId)
    if (!wingman) return null
    wingman.maxHp = WINGMAN_BASE_HP + Math.max(0, hullStacks)
    wingman.hp = wingman.maxHp
    wingman.shield = wingman.shieldMax
    telemetry.recordEvent(wingman.profile.name, 'flight', `Caça ${wingman.profile.name} retornou à ala após recuperação`, { elapsed })
    return wingman
  }

  function applyDamageToWingman(profileId) {
    const w = activeWingmen.find((member) => member.profile.id === profileId)
    if (!w || w.state === 'retreating') return { applied: false }
    w.shieldRegenDelay = WINGMAN_SHIELD_REGEN_DELAY_S
    if (w.shield > 0) w.shield = Math.max(0, w.shield - 1)
    else w.hp = Math.max(0, w.hp - 1)
    const retreating = w.hp <= 0
    if (retreating) {
      w.state = 'retreating'
      w.stateTimer = 0
      w.abilityActive = false
      w.escortKind = null
      w.targetEnemy = null
      const text = wingmanRadio.getLine(w.profile.id, 'retreat')
      if (text) pendingRadioMessage = buildRadioPayload(w.profile, text, 'retreat')
    } else if (w.hp <= WINGMAN_LOW_HP) {
      w.state = 'damaged-passive'
      w.abilityActive = false
      w.escortKind = null
      w.targetEnemy = null
    }
    aiValidator.expect(
      'Integridade de aliado fica dentro dos limites após hit',
      () => w.hp >= 0 && w.hp <= w.maxHp && w.shield >= 0 && w.shield <= w.shieldMax,
      { pilotId: profileId, hp: w.hp, maxHp: w.maxHp, shield: w.shield, shieldMax: w.shieldMax },
    )
    return { applied: true, retreating, hp: w.hp, shield: w.shield }
  }

  function repairNearbyWingmen(position, stacks = 0) {
    const radius = WINGMAN_REPAIR_RADIUS_BASE + Math.max(0, stacks - 1) * WINGMAN_REPAIR_RADIUS_PER_STACK
    let repaired = 0
    for (const w of activeWingmen) {
      if (w.state === 'retreating' || w.mesh.position.distanceTo(position) > radius || w.hp >= w.maxHp) continue
      w.hp = Math.min(w.maxHp, w.hp + 1)
      if (w.hp > WINGMAN_LOW_HP && w.state === 'damaged-passive') w.state = 'patrol'
      repaired += 1
    }
    return repaired
  }

  function setWingmanCount(n, hullStacks = 0) {
    const targetCount = Math.max(0, Math.min(4, n))
    for (let i = 0; i < targetCount; i += 1) {
      if (!activeWingmen.some((w) => w.profile.id === i)) {
        const spawned = spawnMember(i)
        if (spawned) {
          spawned.maxHp = WINGMAN_BASE_HP + Math.max(0, hullStacks)
          spawned.hp = spawned.maxHp
        }
      }
    }
    while (activeWingmen.length > targetCount) {
      const last = activeWingmen[activeWingmen.length - 1]
      removeMember(last.profile.id)
    }
  }

  let squadronCommandMode = 'free' // 'free' | 'focus'
  let squadronFocusTargets = []
  let squadronCommandDurationTimer = 0 // conta pra baixo enquanto em 'focus' — ver update()
  let squadronCommandCooldownTimer = 0 // conta pra baixo depois que 'focus' termina
  let moraleDamageBonus = 0

  function getAliveEnemies() {
    const alive = []
    if (enemies && enemies.getAlive) {
      for (const e of enemies.getAlive()) if (!e.dying && e.mesh) alive.push(e)
    }
    if (enemies && enemies.getGoldenAlive) {
      for (const g of enemies.getGoldenAlive()) if (!g.dying && g.mesh) alive.push(g)
    }
    return alive
  }

  // Contrato de leitura para obstáculos atuais e futuros: o sistema de inimigos expõe apenas
  // objetos inertes que devem ser contornados. Hoje são os detritos; uma classe futura entra na
  // mesma lista sem precisar alterar a física dos aliados.
  function steerAroundObstacle(wingman, desiredVelocity, frame) {
    const obstacles = enemies?.getAvoidanceObstacles?.() || []
    let chosen = null
    let chosenTime = Infinity

    for (const obstacle of obstacles) {
      const position = obstacle.mesh?.position
      if (!position) continue
      _wmObstacleRelative.copy(position).sub(wingman.mesh.position)
      // A posição relativa é obstáculo - aliado; portanto a velocidade relativa precisa ser
      // velocidade do obstáculo - velocidade pretendida do aliado. O sinal inverso fazia o
      // ponto de maior aproximação cair em t=0 justamente quando o aliado avançava no detrito.
      _wmObstacleRelativeVelocity.copy(obstacle.driftVel || _wmObstacleRelativeVelocity.set(0, 0, 0))
      _wmObstacleRelativeVelocity.sub(desiredVelocity)
      const relativeSpeedSq = _wmObstacleRelativeVelocity.lengthSq()
      if (relativeSpeedSq < 0.01) continue

      const closestTime = THREE.MathUtils.clamp(
        -_wmObstacleRelative.dot(_wmObstacleRelativeVelocity) / relativeSpeedSq,
        0,
        WINGMAN_OBSTACLE_LOOKAHEAD_S,
      )
      _wmObstacleClosestPoint.copy(_wmObstacleRelative).addScaledVector(_wmObstacleRelativeVelocity, closestTime)
      const safeRadius = (obstacle.radius || 0) + WINGMAN_OBSTACLE_RADIUS + WINGMAN_OBSTACLE_CLEARANCE
      if (_wmObstacleClosestPoint.lengthSq() > safeRadius * safeRadius || closestTime >= chosenTime) continue
      chosen = obstacle
      chosenTime = closestTime
    }

    if (!chosen) {
      wingman.obstacleAvoidanceId = null
      wingman.obstacleAvoidanceSide = 0
      return false
    }

    if (wingman.obstacleAvoidanceId !== chosen.id) {
      _wmObstacleRelative.copy(chosen.mesh.position).sub(wingman.mesh.position)
      const lateralOffset = _wmObstacleRelative.dot(frame.right)
      // Se o obstáculo estiver exatamente no centro, a paridade dá uma decisão determinística;
      // assim dois aliados não escolhem sempre a mesma curva por acaso.
      wingman.obstacleAvoidanceSide = lateralOffset === 0
        ? ((wingman.profile.id + chosen.id) % 2 === 0 ? -1 : 1)
        : -Math.sign(lateralOffset)
      wingman.obstacleAvoidanceId = chosen.id
      aiValidator.expect(
        'Desvio de obstáculo sempre escolhe uma lateral válida e finita',
        () => Number.isFinite(wingman.obstacleAvoidanceSide) && Math.abs(wingman.obstacleAvoidanceSide) === 1,
        { pilotId: wingman.profile.id, obstacleId: chosen.id, side: wingman.obstacleAvoidanceSide },
      )
      aiValidator.logMechanic('wingman-obstacle-avoidance', 'curva-preditiva-iniciada', {
        pilotId: wingman.profile.id, obstacleId: chosen.id, kind: chosen.kind, closestTime: chosenTime,
      })
    }

    const urgency = 1 - chosenTime / WINGMAN_OBSTACLE_LOOKAHEAD_S
    const lateralSpeed = Math.max(WINGMAN_OBSTACLE_AVOID_SPEED, desiredVelocity.length() * 0.55)
    desiredVelocity.addScaledVector(frame.right, wingman.obstacleAvoidanceSide * lateralSpeed * (0.45 + urgency * 0.55))
    return true
  }

  // Compartilhado pelo fim natural (duração de 6s esgotada, ver update()) e pelo cancelamento
  // manual (jogador aperta [D] de novo enquanto já está em foco) — os dois entram em cooldown.
  function deactivateFocusCommand() {
    squadronCommandMode = 'free'
    squadronFocusTargets = []
    squadronCommandDurationTimer = 0
    squadronCommandCooldownTimer = SQUADRON_COMMAND_COOLDOWN_S
    moraleDamageBonus = 0
    for (const w of activeWingmen) {
      if (w.abilityActive) continue // mesmo cuidado do bloco de foco abaixo
      w.state = 'patrol'
      w.stateTimer = 0
      w.targetEnemy = null
      w.nextWaypointTimer = 0.4
    }
  }

  function toggleCommand(lockedTargets = [], playerPos, slippyMoraleStacks = 0, peppyAuxShieldStacks = 0) {
    if (squadronCommandMode === 'free') {
      if (squadronCommandCooldownTimer > 0) {
        return { mode: 'cooldown', remaining: squadronCommandCooldownTimer }
      }
      squadronCommandMode = 'focus'
      squadronCommandDurationTimer = SQUADRON_COMMAND_DURATION_S
      const slippy = activeWingmen.find((w) => w.profile.id === 2 && w.state !== 'damaged-passive' && w.state !== 'retreating')
      moraleDamageBonus = slippy && slippyMoraleStacks > 0 ? slippyMoraleStacks : 0
      const validLocked = Array.isArray(lockedTargets) ? lockedTargets.filter((e) => e && !e.dying && e.mesh) : []

      if (validLocked.length > 0) {
        squadronFocusTargets = validLocked
      } else {
        const alive = getAliveEnemies()
        if (alive.length > 0 && playerPos) {
          alive.sort((a, b) => playerPos.distanceTo(a.mesh.position) - playerPos.distanceTo(b.mesh.position))
          squadronFocusTargets = [alive[0]]
        } else {
          squadronFocusTargets = []
        }
      }

      // Atribui alvos imediatamente para todos os caças ativos — exceto quem estiver no meio de
      // uma habilidade única (investida/escolta): puxar o state pra 'dogfight' à força deixaria
      // abilityActive travado em true pra sempre (nada mais o desligaria), soft-lock permanente
      // daquele piloto. Deixa a habilidade terminar sozinha, o comando de foco pega ele depois.
      for (let i = 0; i < activeWingmen.length; i++) {
        const w = activeWingmen[i]
        if (w.abilityActive) continue
        if (squadronFocusTargets.length > 0) {
          const chosen = squadronFocusTargets.length === 1
            ? squadronFocusTargets[0]
            : squadronFocusTargets[Math.floor(Math.random() * squadronFocusTargets.length)]
          w.targetEnemy = chosen
          w.state = 'dogfight'
          w.stateTimer = 0
          w.burstRemaining = w.profile.burstCount * 2
          w.burstTimer = 0
          w.fireCooldown = 0
        }
      }

      triggerSoundCue(WINGMAN_SOUND_CUES.command_focus_toggle, { targetCount: squadronFocusTargets.length, hasLocked: validLocked.length > 0 })

      // Rádio — rajada de "prontidão": TODOS os pilotos ativos confirmam em fila (não é 1 sorteado
      // como os outros eventos, e não passa pelo cooldown global do dispatcher — usa getLine(),
      // que é um lookup puro). Só quem realmente recebeu a ordem fala (abilityActive continua de
      // fora, ver comentário acima).
      // Regra 2.4 do Documento de Implementação: Slippy com Morale ou Peppy com Auxílio e
      // cooldown disponível usam `ability_focus_upgrade` no canal superior; os demais mantêm
      // `focus_ready` no rádio trivial. As filas são separadas no HUD pelo campo isAbility.
      const readyQueue = []
      for (const w of activeWingmen) {
        if (w.abilityActive) continue
        const slippyFocusUpgrade = w.profile.id === 2 && moraleDamageBonus > 0
        const peppyFocusUpgrade = w.profile.id === 1 && peppyAuxShieldStacks > 0 && w.abilityCooldown <= 0
        const eventId = slippyFocusUpgrade || peppyFocusUpgrade ? 'ability_focus_upgrade' : 'focus_ready'
        const text = wingmanRadio.getLine(w.profile.id, eventId)
        if (text) readyQueue.push(buildRadioPayload(w.profile, text, eventId))
      }
      if (readyQueue.length > 0) pendingRadioQueue = readyQueue

      return {
        mode: 'focus',
        targetCount: squadronFocusTargets.length,
        hasLocked: validLocked.length > 0,
      }
    } else {
      deactivateFocusCommand()
      triggerSoundCue(WINGMAN_SOUND_CUES.command_free_toggle)
      return { mode: 'free' }
    }
  }

  function clearSquadron() {
    squadronFocusTargets = []
    while (activeWingmen.length > 0) {
      const w = activeWingmen.pop()
      scene.remove(w.mesh)
      disposeWingmanMesh(w.mesh)
      w.laserMaterial.dispose()
    }
  }

  function fireWingmanLaser(wingman, origin, direction, opts = {}) {
    const material = opts.color != null
      ? new THREE.MeshBasicMaterial({ color: opts.color, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false })
      : wingman.laserMaterial
    const mesh = new THREE.Mesh(laserGeometry, material)
    mesh.position.copy(origin)
    mesh.quaternion.setFromUnitVectors(FORWARD_AXIS, direction.clone().normalize())
    scene.add(mesh)

    triggerSoundCue(WINGMAN_SOUND_CUES.laser_fire, {
      wingmanId: wingman.profile.id,
      name: wingman.profile.name,
      worldPos: origin,
    })

    activeLasers.push({
      mesh,
      velocity: direction.clone().normalize().multiplyScalar(WINGMAN_LASER_SPEED),
      traveled: 0,
      life: opts.lifetime ?? WINGMAN_LASER_LIFETIME,
      color: opts.color ?? wingman.profile.laserColor,
      damage: opts.damage ?? WINGMAN_LASER_DAMAGE,
      ownMaterial: material !== wingman.laserMaterial,
      owner: wingman, // usado pelo proc do Reparo de Campo (Slippy) na resolução de acerto
      homingTarget: opts.homingTarget || null,
      homingTurnRate: opts.homingTurnRate || 0,
      chargedVisual: !!opts.chargedVisual,
      chargedTrailTimer: 0,
    })

    if (effects && effects.muzzleFlash) {
      effects.muzzleFlash(origin, direction)
    }
    if (opts.chargedVisual && effects) {
      effects.maxChargeRings?.(origin, direction, opts.color)
      effects.projectileTrail?.(origin, mesh.quaternion, opts.color)
    }

    telemetry.recordEvent(wingman.profile.name, 'combat', `Disparou laser de suporte/ataque (dano ${WINGMAN_LASER_DAMAGE})`, {
      state: wingman.state,
      burstRemaining: wingman.burstRemaining,
      elapsed,
    })
  }

  // Carga Compartilhada: para cada lock QUE EXCEDE o teto base, Miyu solta um laser roxo
  // independente. Os tiros do jogador continuam sendo resolvidos pelo sistema de homing usual;
  // estes são lasers de ala normais, visíveis e com dano próprio, em vez de um bônus invisível.
  function fireMiyuAssistShots(lockedTargets, baseMaxTargets) {
    const miyu = activeWingmen.find((w) => w.profile.id === 3 && w.abilityActive && w.escortKind === 'assist')
    if (!miyu || !Array.isArray(lockedTargets)) return 0
    let shots = 0
    for (const target of lockedTargets.slice(Math.max(0, baseMaxTargets))) {
      if (!target?.mesh || target.dying) continue
      _wmToEnemy.copy(target.mesh.position).sub(miyu.mesh.position)
      if (_wmToEnemy.lengthSq() < 0.001) continue
      _wmToEnemy.normalize()
      const muzzle = _wmLaserMuzzle.copy(miyu.mesh.position).addScaledVector(_wmToEnemy, 1.3)
      fireWingmanLaser(miyu, muzzle, _wmToEnemy, { color: MIYU_CHARGED_SHOT_COLOR, chargedVisual: true })
      shots += 1
    }
    aiValidator.expect(
      'Carga Compartilhada da Miyu só cria disparos extras para locks além do teto base',
      () => shots <= Math.max(0, lockedTargets.length - baseMaxTargets),
      { shots, locks: lockedTargets.length, baseMaxTargets },
    )
    if (shots > 0) aiValidator.logMechanic('miyu-assist-shot', 'disparos-roxos', { shots, baseMaxTargets })
    return shots
  }

  function fireMiyuBoombuster(miyu, playerPos, stacks) {
    const cooldown = Math.max(1, MIYU_BOOMBUSTER_BASE_COOLDOWN_S - MIYU_BOOMBUSTER_COOLDOWN_PER_STACK_S * stacks)
    const nearby = getAliveEnemies().filter((target) => playerPos.distanceTo(target.mesh.position) <= MIYU_BOOMBUSTER_TARGET_RADIUS)
    const pool = nearby.length > 0 ? nearby : getAliveEnemies()
    if (pool.length === 0) return 0
    pool.sort((a, b) => playerPos.distanceTo(a.mesh.position) - playerPos.distanceTo(b.mesh.position))
    const targets = pool.slice(0, Math.min(pool.length, 1 + stacks))
    for (const target of targets) {
      _wmToEnemy.copy(target.mesh.position).sub(miyu.mesh.position).normalize()
      const muzzle = _wmLaserMuzzle.copy(miyu.mesh.position).addScaledVector(_wmToEnemy, 1.3)
      fireWingmanLaser(miyu, muzzle, _wmToEnemy, {
        color: MIYU_BOOMBUSTER_COLOR, damage: MIYU_BOOMBUSTER_DAMAGE, homingTarget: target,
        homingTurnRate: MIYU_BOOMBUSTER_TURN_RATE, lifetime: MIYU_BOOMBUSTER_LIFETIME_S, chargedVisual: true,
      })
    }
    miyu.boombusterCooldown = cooldown
    aiValidator.expect('Boombuster limita a salva ao número correto de alvos', () => targets.length <= 1 + stacks, { targets: targets.length, stacks })
    return targets.length
  }

  // Define uma aproximação distinta por piloto quando mais de um ataca o mesmo inimigo. A
  // separação é em relação ao frame do jogador para permanecer estável no trilho e na arena.
  function setDogfightApproachTarget(wingman, enemyPosition, approachDirection, frame) {
    const laneIndex = wingman.profile.id - (WINGMAN_PROFILES.length - 1) * 0.5
    _wmAttackLane.copy(frame.right).multiplyScalar(laneIndex * WINGMAN_ATTACK_LANE_SPACING)
    _wmAttackLane.addScaledVector(frame.up, (wingman.profile.id % 2 === 0 ? -1 : 1) * WINGMAN_ATTACK_LANE_VERTICAL)
    wingman.patrolTarget.copy(enemyPosition)
      .addScaledVector(approachDirection, -16)
      .add(_wmAttackLane)
  }

  // ============ TICK DE ATUALIZAÇÃO DA IA DE VOO LIVRE ============

  function update(dt, playerPos, frame, opts = {}) {
    elapsed += dt
    const boostActive = !!opts.boostActive
    const homingCharging = !!opts.homingCharging
    const shieldNotFull = !!opts.shieldNotFull
    const inArena = rail.isArena()
    // Overhaul de Personalidade, Ideia 5 — estado do jogador, computado uma vez por frame em
    // game-loop.js (único lugar com session/killChainCount/isNoDeck no escopo) e repassado até
    // aqui via opts.reactivity. Fallback all-false cobre chamadas sem esse campo (debug/testes).
    const reactivity = opts.reactivity || {
      playerLowHealth: false, playerHighCombo: false, playerJustLostLife: false, playerBoosting: false,
    }

    // Rádio (charged_shot_used): detecta a SOLTA do carregado (true→false) usando o
    // chargeHeldTimer ANTES do reset abaixo — só conta como "disparo carregado de verdade" se
    // segurou por pelo menos 0.3s (evita comentar em todo tap acidental do botão).
    const justReleasedCharge = wasHomingCharging && !homingCharging && chargeHeldTimer > 0.3
    wasHomingCharging = homingCharging
    // Rádio (boost_used): dispara só na virada false→true do impulso.
    const justStartedBoost = boostActive && !wasBoostActive
    wasBoostActive = boostActive

    chargeHeldTimer = homingCharging ? chargeHeldTimer + dt : 0

    // Comando de ofensividade do esquadrão — duração de 6s (volta sozinho ao normal) + cooldown
    // de 10s contado a partir do fim (manual ou automático), antes de poder ser reativado.
    if (squadronCommandCooldownTimer > 0) squadronCommandCooldownTimer = Math.max(0, squadronCommandCooldownTimer - dt)
    if (squadronCommandMode === 'focus') {
      squadronCommandDurationTimer -= dt
      if (squadronCommandDurationTimer <= 0) deactivateFocusCommand()
    }

    // Slippy (Ideia 4): amostra o roll do jogador uma vez por frame, poda o que já passou do
    // delay + folga.
    if (rail.getRollAngle) {
      playerRollHistory.push({ t: elapsed, roll: rail.getRollAngle() })
      while (playerRollHistory.length > 1 && playerRollHistory[0].t < elapsed - SLIPPY_ROLL_HISTORY_MAX_S) {
        playerRollHistory.shift()
      }
    }

    // acumuladores das habilidades (declarados aqui, não só depois do loop de wingmen, porque
    // a investida do Falco resolve o acerto DENTRO do próprio loop de estados)
    let enemyKills = 0
    let enemyKillPoints = 0
    const damageFeedback = []
    let bossDefeated = false
    let bossHitWorldPos = null
    let goldenSpecialHit = false
    let goldenHitWorldPos = null
    let shieldGrants = 0
    let guardExtraShieldGrants = 0
    let rescueShieldGrants = 0
    let rescueCancels = 0
    const healOrbSpawns = []
    const completedRetreatIds = []
    // Rádio (Ideia 3): consome qualquer mensagem disparada fora deste laço (dano externo, dismiss
    // — ver pendingRadioMessage acima) antes de tentar os eventos do próprio frame.
    let radioMessage = pendingRadioMessage
    pendingRadioMessage = null
    // Rajada de "prontidão" do comando de foco (radioQueue) — ver toggleCommand(). Canal
    // separado do radioMessage único porque aqui são VÁRIAS falas em fila, não uma só.
    let radioQueue = pendingRadioQueue
    pendingRadioQueue = null
    // player_low_health dispara só na VIRADA (false→true), não every frame — um piloto aleatório
    // comenta.
    const isPlayerLowHealthNow = !!reactivity.playerLowHealth
    if (isPlayerLowHealthNow && !wasPlayerLowHealth && !radioMessage && activeWingmen.length > 0) {
      const w = activeWingmen[Math.floor(Math.random() * activeWingmen.length)]
      radioMessage = speak(w.profile, 'player_low_health')
    }
    wasPlayerLowHealth = isPlayerLowHealthNow
    // boost_used / charged_shot_used — mesmo padrão: sorteia 1 piloto ativo, respeita o cooldown
    // global do dispatcher (speak() já checa) e o "só 1 por frame" (!radioMessage).
    if (justStartedBoost && !radioMessage && activeWingmen.length > 0) {
      const slippy = activeWingmen.find((w) => w.profile.id === 2 && w.state !== 'damaged-passive' && w.state !== 'retreating')
      if (slippy && (opts.slippyBoostStacks || 0) > 0) {
        radioMessage = speak(slippy.profile, 'ability_boost_dash')
        effects?.propulsionBurst?.(slippy.mesh.position, frame.forward)
      } else {
        const w = activeWingmen[Math.floor(Math.random() * activeWingmen.length)]
        radioMessage = speak(w.profile, 'boost_used')
      }
    }
    if (justReleasedCharge && !radioMessage && activeWingmen.length > 0) {
      const w = activeWingmen[Math.floor(Math.random() * activeWingmen.length)]
      radioMessage = speak(w.profile, 'charged_shot_used')
    }

    for (let idx = 0; idx < activeWingmen.length; idx++) {
      const w = activeWingmen[idx]
      w.stateTimer += dt
      w.fireCooldown -= dt
      if (w.engagementCooldown > 0) w.engagementCooldown -= dt
      if (!w.abilityActive) w.abilityCooldown = Math.max(0, w.abilityCooldown - dt)
      if (w.interceptCooldown > 0) w.interceptCooldown -= dt
      if (w.rescueCooldown > 0) w.rescueCooldown -= dt
      if (w.boombusterCooldown > 0) w.boombusterCooldown -= dt
      if (w.collisionBumpCooldown > 0) w.collisionBumpCooldown -= dt
      const desiredMaxHp = WINGMAN_BASE_HP + Math.max(0, opts.wingmanHullStacks || 0)
      if (w.maxHp !== desiredMaxHp) w.maxHp = desiredMaxHp
      if (w.shieldRegenDelay > 0) w.shieldRegenDelay = Math.max(0, w.shieldRegenDelay - dt)
      else if (w.shield < w.shieldMax) w.shield = Math.min(w.shieldMax, w.shield + WINGMAN_SHIELD_REGEN_PER_S * dt)
      if (w.state === 'retreating') {
        w.abilityActive = false
        w.retreatEffectTimer -= dt
        if (w.retreatEffectTimer <= 0) {
          w.retreatEffectTimer = 0.38
          effects?.smokeRing?.(w.mesh.position, frame.forward)
          effects?.bloomSprite?.(w.mesh.position, 0xff5a24, 0.7)
        }
        w.mesh.position.addScaledVector(frame.forward, 42 * dt)
        w.mesh.position.addScaledVector(frame.right, w.profile.homeSide * 25 * dt)
        w.mesh.position.addScaledVector(frame.up, 8 * dt)
        if (w.stateTimer >= WINGMAN_RETREAT_DURATION_S) completedRetreatIds.push(w.profile.id)
        continue
      }
      if (w.auxShieldVisual) {
        const active = w.abilityActive && w.escortKind === 'auxShield'
        w.auxShieldVisual.visible = active
        if (active) {
          w.auxShieldVisual.rotation.z += dt * 0.8
          w.auxShieldVisual.material.opacity = 0.58 + Math.sin(elapsed * 5) * 0.16
        }
      }
      const criticalFlash = w.hp <= WINGMAN_LOW_HP && Math.floor(elapsed * 7) % 2 === 0
      w.damageMaterials.forEach((material, materialIndex) => {
        const original = w.damageColors[materialIndex]
        if (material.color && original) material.color.copy(criticalFlash ? WINGMAN_CRITICAL_COLOR : original)
      })

      // Carta "Falco Intercept" — roda em QUALQUER state (não só dogfight/ram): Falco protege o
      // jogador proativamente, mesmo em formação. Independente do abilityCooldown da Investida
      // Aríete (timers separados, ver criação do wingman).
      const falcoInterceptStacks = opts.falcoInterceptStacks || 0
      if (w.state !== 'damaged-passive' && w.profile.id === 0 && falcoInterceptStacks > 0 && w.interceptCooldown <= 0 &&
          enemies && enemies.interceptThreateningProjectile) {
        const threat = enemies.interceptThreateningProjectile(FALCO_INTERCEPT_MIN_POWER_LEVEL, playerPos)
        if (threat) {
          aiValidator.expect(
            'Intercept do Falco remove exatamente um projétil pesado por ativação',
            () => threat.removedCount === 1,
            { removedCount: threat.removedCount, powerLevel: threat.powerLevel },
          )
          fireFalcoInterceptBeam(w.mesh.position, threat.worldPos)
          w.interceptCooldown = FALCO_INTERCEPT_BASE_COOLDOWN_S - falcoInterceptStacks
          telemetry.recordEvent(w.profile.name, 'ability', 'Falco interceptou um projétil pesado antes que chegasse no jogador!', { elapsed })
          if (!radioMessage) radioMessage = speak(w.profile, 'ability_intercept')
        }
      }

      const peppyRescueStacks = opts.peppyRescueStacks || 0
      if (w.state !== 'damaged-passive' && w.profile.id === 1 && peppyRescueStacks > 0 && w.rescueCooldown <= 0 &&
          opts.playerTumbling && !w.abilityActive) {
        w.state = 'rescue'
        w.stateTimer = 0
        w.abilityActive = true
        w.abilityTimer = 0
        telemetry.recordEvent(w.profile.name, 'ability', 'Peppy iniciou Rescue contra a cambalhota do jogador', { elapsed })
        if (!radioMessage) radioMessage = speak(w.profile, 'ability_rescue')
      }

      const peppyAuxActive = w.state !== 'damaged-passive' && w.profile.id === 1 && (opts.peppyAuxShieldStacks || 0) > 0 && !!opts.repulsionActive
      if (peppyAuxActive && !w.abilityActive) {
        w.state = 'escort'
        w.escortKind = 'auxShield'
        w.abilityActive = true
        w.abilityTimer = 0
        telemetry.recordEvent(w.profile.name, 'ability', 'Peppy ativou Auxílio: barreira frontal durante repulsão', { elapsed })
        if (!radioMessage) radioMessage = speak(w.profile, 'ability_aux_shield')
      }

      const miyuBoombusterStacks = opts.miyuBoombusterStacks || 0
      if (w.state !== 'damaged-passive' && w.profile.id === 3 && miyuBoombusterStacks > 0 && w.boombusterCooldown <= 0) {
        const shots = fireMiyuBoombuster(w, playerPos, miyuBoombusterStacks)
        if (shots > 0) {
          telemetry.recordEvent(w.profile.name, 'ability', `Boombuster lançou ${shots} orbe(s) homing magenta`, { elapsed })
          if (!radioMessage) radioMessage = speak(w.profile, 'ability_boombuster')
        }
      }

      // Fogo das turbinas reage a boost ou manobras — discreto, sem "inchar" a nave inteira
      const isThrusting = boostActive || w.state === 'dogfight' || w.state === 'ram'
      for (const t of w.thrusters) {
        const boostScale = isThrusting ? 1.6 : 1.0 + Math.sin(elapsed * 16 + w.profile.id) * 0.12
        t.scale.set(isThrusting ? 1.15 : 1.0, isThrusting ? 1.15 : 1.0, boostScale)
      }

      const distToPlayer = w.mesh.position.distanceTo(playerPos)
      // Colisões corpo-a-corpo não causam dano (decisão de balanceamento), mas têm um tranco
      // curto e legível para que naves não pareçam atravessar umas às outras sem reação.
      if (w.collisionBumpCooldown <= 0) {
        const contact = getAliveEnemies().find((enemy) => enemy.mesh && enemy.mesh.position.distanceTo(w.mesh.position) < 3)
        if (contact) {
          _wmToEnemy.copy(w.mesh.position).sub(contact.mesh.position)
          if (_wmToEnemy.lengthSq() > 0.001) w.velocity.addScaledVector(_wmToEnemy.normalize(), 14)
          w.collisionBumpCooldown = 0.5
          effects?.hitSpark?.(w.mesh.position, w.profile.color)
        }
      }

      // ============ FORMAÇÃO TÁTICA STAR FOX 64 (CALMA E CINEMATOGRÁFICA) ============
      // Vaga dedicada de cada piloto em relação à nave do jogador
      const slot = FORMATION_SLOTS[w.profile.id] || { side: w.profile.homeSide * 11, up: 0, forward: 8 }
      // Reatividade (Ideia 5) — ajustes de peso na vaga, nunca no ponto de origem `slot` (que
      // continua sendo a referência "neutra" pra quando a condição não se aplica mais).
      let reactiveForward = slot.forward
      let reactiveSide = slot.side
      if (w.profile.id === 0) {
        // Falco: oscilação lateral lenta na vaga (personalidade de formação, Ideia 4) — puramente
        // cosmético, não muda `patrolTarget` de propósito (deixa o lerp/física de voo cuidar do
        // resto, igual a qualquer outro deslocamento de vaga).
        reactiveSide += Math.sin(elapsed * (Math.PI * 2 / FALCO_WEAVE_PERIOD_S)) * FALCO_WEAVE_AMPLITUDE
      }
      if (w.profile.id === 1 && reactivity.playerLowHealth) {
        // Peppy: vida baixa do jogador → escolta mais apertada (vaga mais perto, não mais longe)
        reactiveForward = 2.0
      }
      if (w.profile.id === 2 && reactivity.playerBoosting) {
        // Slippy: se afasta lateralmente pra não ficar no cone de propulsão atrás do jogador
        reactiveSide = slot.side + (slot.side >= 0 ? 6 : -6)
      }
      // Flutuação de marcha lenta (idle float): micro-oscilação rápida (~4-5s, igual antes) somada
      // a um vaguear lento e largo (~35-55s) — pedido do usuário ("mais alcance de patrulha"): sem
      // isso a vaga de formação era um ponto fixo demais, lendo como "presos" em vez de voando.
      const idleX = Math.sin(elapsed * 0.7 + w.profile.id * 1.6) * 0.55
        + Math.sin(elapsed * 0.11 + w.profile.id * 3.3) * 5.5
      const idleY = Math.cos(elapsed * 0.5 + w.profile.id * 2.1) * 0.35
        + Math.cos(elapsed * 0.09 + w.profile.id * 2.7) * 2.2

      _wmSlotPos.copy(playerPos)
      if (inArena) {
        _wmSlotPos
          .addScaledVector(frame.right, reactiveSide * 1.3 + idleX)
          .addScaledVector(frame.up, slot.up + idleY)
          .addScaledVector(frame.forward, reactiveForward * 0.8)
      } else {
        _wmSlotPos
          .addScaledVector(frame.right, reactiveSide + idleX)
          .addScaledVector(frame.up, slot.up + idleY)
          .addScaledVector(frame.forward, reactiveForward)
      }
      // Peppy: "escudo humano visual" por 3s logo depois do jogador perder uma vida — voa NA
      // FRENTE dele em vez da vaga lateral normal. Puramente visual (não bloqueia dano, ver §5.4
      // do documento) — sobrescreve a vaga calculada acima só enquanto a janela dura.
      if (w.profile.id === 1 && reactivity.playerJustLostLife) {
        _wmSlotPos.copy(playerPos).addScaledVector(frame.forward, 9)
      }
      // Falco: "recua pra vaga neutra" quando o jogador acabou de perder uma vida — interrompe
      // um dogfight em andamento (não força ram/escort, que já têm saída própria) e volta pra
      // formação, em vez de continuar perseguindo enquanto o jogador está vulnerável.
      if (w.profile.id === 0 && reactivity.playerJustLostLife && w.state === 'dogfight') {
        w.state = 'patrol'
        w.stateTimer = 0
        w.targetEnemy = null
        w.fireCooldown = 1.5
        w.engagementCooldown = 2.0
      }

      // 1. Regroup se ficou longe demais do jogador. Os limites são deliberadamente menores que
      // os anteriores (130/65): aquela folga fazia aliados distantes continuarem visíveis como
      // pontos isolados, principalmente na arena.
      const maxDistance = inArena ? WINGMAN_MAX_DISTANCE_ARENA : WINGMAN_MAX_DISTANCE_RAIL
      const emergencyDistance = maxDistance * WINGMAN_EMERGENCY_REGROUP_MULTIPLIER
      // Uma habilidade em curso pode passar do limite normal (ex.: investida), mas não pode
      // prender toda a esquadra fora da arena. Nesse caso cancelamos a intenção antiga e cada
      // piloto volta imediatamente para a SUA vaga — inclusive se a origem foi um estado preso.
      if (distToPlayer > emergencyDistance && w.state !== 'retreating') {
        const stateBefore = w.state
        const wasEmergency = w.state === 'regroup' && w.emergencyRegroup
        w.state = 'regroup'
        w.stateTimer = 0
        w.targetEnemy = null
        w.abilityActive = false
        w.abilityTimer = 0
        w.abilityApplied = false
        w.escortKind = null
        w.obstacleAvoidanceId = null
        w.obstacleAvoidanceSide = 0
        w.overlapWith.clear()
        w.emergencyRegroup = true
        w.patrolTarget.copy(_wmSlotPos)
        _wmToTarget.copy(_wmSlotPos).sub(w.mesh.position)
        if (_wmToTarget.lengthSq() > 1e-4) {
          w.velocity.copy(_wmToTarget.normalize()).multiplyScalar(WINGMAN_EMERGENCY_REGROUP_SPEED)
        }
        if (!wasEmergency) {
          aiValidator.expect(
            'Aliado perdido entra em regroup de emergência com vaga e velocidade válidas',
            () => w.state === 'regroup' && w.patrolTarget.distanceTo(_wmSlotPos) < 0.001 && Number.isFinite(w.velocity.x) && Number.isFinite(w.velocity.y) && Number.isFinite(w.velocity.z),
            { pilotId: w.profile.id, distance: distToPlayer, emergencyDistance, inArena },
          )
          aiValidator.logMechanic('wingman-emergency-regroup', 'recuperacao-iniciada', {
            pilotId: w.profile.id, distance: distToPlayer, emergencyDistance, stateBefore,
          })
        }
      }
      if (distToPlayer > maxDistance && w.state !== 'regroup' && !w.abilityActive) {
        telemetry.recordEvent(w.profile.name, 'state', `Regroup acionado: caça a ${distToPlayer.toFixed(1)}u da nave (máx: ${maxDistance}u)`, { elapsed })
        w.state = 'regroup'
        w.stateTimer = 0
        w.targetEnemy = null
      }

      if (w.state === 'regroup') {
        w.patrolTarget.copy(_wmSlotPos)
        const distanceToSlot = w.mesh.position.distanceTo(_wmSlotPos)
        const arrivalDistance = inArena ? WINGMAN_REGROUP_ARRIVAL_ARENA : WINGMAN_REGROUP_ARRIVAL_RAIL
        if (distanceToSlot <= arrivalDistance) {
          aiValidator.expect(
            'Aliado só encerra regroup ao alcançar a própria vaga de formação',
            () => distanceToSlot <= arrivalDistance,
            { pilotId: w.profile.id, distanceToSlot, arrivalDistance, inArena },
          )
          telemetry.recordEvent(w.profile.name, 'state', 'Retornou à própria vaga de formação após regroup', { elapsed })
          w.state = 'patrol'
          w.stateTimer = 0
          w.emergencyRegroup = false
        }
      } else if (w.state === 'damaged-passive') {
        // Um aliado a 1 HP não inicia dogfight nem habilidade: só tenta manter a formação até
        // receber um Repair de Slippy. O escudo ainda regenera normalmente acima.
        w.patrolTarget.copy(_wmSlotPos)
      } else if (w.state === 'patrol') {
        // Pedido do usuário (v0.73.2): ao sair de dogfight/ram/escolta, o alvo de voo pulava
        // instantaneamente do inimigo perseguido pra vaga de formação — o salto brusco de
        // alongSlot (ver cálculo de cruiseSpeed abaixo) fazia a velocidade disparar e derrapar de
        // volta em menos de 0.1s ("chacoalhando"). A curva suave (lerp) resolvia isso, mas ficava
        // ligada o tempo todo — como a vaga de formação (_wmSlotPos) já se move sozinha a cada
        // frame (segue o jogador), suavizar um alvo que NUNCA para de se mexer cria um atraso
        // permanente de perseguição (bug achado por vídeo do usuário: aliados "em transe",
        // sempre alguns metros atrás de onde deveriam estar). Fix: só suaviza nos primeiros 0.6s
        // depois de entrar em patrol (cobre a curva de retorno); depois disso, segue a vaga em
        // tempo real — a suavização de velocidade abaixo (accelRate) já cuida do "voo macio".
        if (w.stateTimer < 0.6) {
          w.patrolTarget.lerp(_wmSlotPos, 1 - Math.exp(-2.2 * dt))
        } else {
          w.patrolTarget.copy(_wmSlotPos)
        }

        // Habilidades únicas de Peppy (Guarda) e Miyu (Carga Compartilhada)
        if (!w.abilityActive && w.abilityCooldown <= 0) {
          if (w.profile.abilityId === 'guard' && shieldNotFull) {
            telemetry.recordEvent(w.profile.name, 'ability', 'Peppy ativou Guarda: voando para escoltar e reparar escudo do jogador', { elapsed })
            if (!radioMessage) radioMessage = speak(w.profile, 'ability_guard')
            w.state = 'escort'
            w.escortKind = 'guard'
            w.stateTimer = 0
            w.abilityActive = true
            w.abilityTimer = 0
            w.abilityApplied = false
          } else if (w.profile.abilityId === 'assist' && homingCharging && chargeHeldTimer >= ASSIST_MIN_HOLD_S) {
            telemetry.recordEvent(w.profile.name, 'ability', 'Miyu sincronizou Carga Compartilhada (+50% veloc. carga, +1 alvo)', { elapsed })
            if (!radioMessage) radioMessage = speak(w.profile, 'ability_assist')
            w.state = 'escort'
            w.escortKind = 'assist'
            w.stateTimer = 0
            w.abilityActive = true
            w.abilityTimer = 0
            triggerSoundCue(WINGMAN_SOUND_CUES.phantom_assist, { worldPos: w.mesh.position })
          }
        }

        if (w.state === 'patrol') {
          if (squadronCommandMode === 'focus' && w.engagementCooldown <= 0) {
            squadronFocusTargets = squadronFocusTargets.filter((t) => t && !t.dying && t.mesh)
            if (squadronFocusTargets.length === 0) {
              const alive = getAliveEnemies()
              if (alive.length > 0 && playerPos) {
                const reachable = alive.filter((e) => playerPos.distanceTo(e.mesh.position) < 120)
                const pool = reachable.length > 0 ? reachable : alive
                pool.sort((a, b) => playerPos.distanceTo(a.mesh.position) - playerPos.distanceTo(b.mesh.position))
                squadronFocusTargets = [pool[0]]
              }
            }
            if (squadronFocusTargets.length > 0) {
              const candidate = squadronFocusTargets.length === 1
                ? squadronFocusTargets[0]
                : squadronFocusTargets[Math.floor(Math.random() * squadronFocusTargets.length)]
              if (candidate && candidate.mesh && w.mesh.position.distanceTo(candidate.mesh.position) < 105) {
                w.targetEnemy = candidate
                telemetry.recordEvent(w.profile.name, 'combat', `[FOCO] Engajou em dogfight contra ${w.targetEnemy.kind} #${w.targetEnemy.id}`, { elapsed })
                if (!radioMessage) radioMessage = speak(w.profile, engageEventFor(w.targetEnemy.kind, 'engage_focus'))
                w.state = 'dogfight'
                w.stateTimer = 0
                w.burstRemaining = 4
                w.burstTimer = 0.2
              } else {
                w.engagementCooldown = 0.6
              }
            }
          } else if (w.fireCooldown <= 0 && w.engagementCooldown <= 0) {
            // Disciplina de esquadrão: no máximo 1 companheiro sai em dogfight por vez
            const othersInDogfight = activeWingmen.some((other, oIdx) => oIdx !== idx && other.state === 'dogfight')
            if (!othersInDogfight) {
              const alive = getAliveEnemies()
              // Pedido do usuário ("mais alcance de patrulha", sem voltar pro "ataca tudo"
              // perfeito de antes): cone de detecção e chance de engajar alargados moderadamente
              // — continuam raros o bastante pra não sentir robótico, só não tão raros a ponto de
              // precisar quase sempre do comando [D] manual pra ver algum aliado brigar sozinho.
              // Agressividade assimétrica (Ideia 2): cada piloto tem o próprio engagementChance/
              // detectionRange base (ver combatProfile em WINGMAN_PROFILES) em vez do valor único
              // global de antes. Reatividade (Ideia 5), só o Falco — vida baixa do jogador vence
              // combo alto se as duas estiverem ativas ao mesmo tempo (prioridade fixa, §5.5 do
              // documento evita a ambiguidade "qual pesa mais").
              let engagementChance = w.profile.combatProfile.engagementChance
              if (w.profile.id === 0) {
                if (reactivity.playerLowHealth) engagementChance = 0.85
                else if (reactivity.playerHighCombo) engagementChance = 0.70
              }
              const detectionRange = w.profile.combatProfile.detectionRange
              if (alive.length > 0 && Math.random() < engagementChance) {
                const candidates = alive.filter((e) => {
                  _wmRel.copy(e.mesh.position).sub(w.mesh.position)
                  const d = _wmRel.length()
                  // arena guarda a mesma proporção relativa (75/80) que já existia antes desta
                  // mudança, só escalada pelo detectionRange do piloto em vez do 80 fixo
                  if (inArena) return d < detectionRange * 0.9375
                  const dotForward = d > 1e-4 ? (_wmRel.dot(frame.forward) / d) : 0
                  return dotForward > -0.15 && d < detectionRange
                })
                if (candidates.length > 0) {
                  // pedido do usuário: Horda tem "foco maior" dos wingmen — sempre preferida sobre
                  // qualquer outro alvo elegível, mesmo um mais perto (única prioridade desse tipo
                  // no jogo hoje; todo outro inimigo só entra/sai da lista de alvos, nunca é
                  // priorizado dentro dela)
                  // Miyu com o jogador em vida baixa: foca no inimigo mais próximo DO
                  // JOGADOR (protege), não do mais conveniente pra ela mesma (reatividade,
                  // Ideia 5) — os outros 3 pilotos continuam ordenando pela própria posição.
                  const distanceRef = (w.profile.id === 3 && reactivity.playerLowHealth) ? playerPos : w.mesh.position
                  candidates.sort((a, b) => {
                    const aHorda = a.kind === HORDA_KIND ? 0 : 1
                    const bHorda = b.kind === HORDA_KIND ? 0 : 1
                    if (aHorda !== bHorda) return aHorda - bHorda
                    return distanceRef.distanceTo(a.mesh.position) - distanceRef.distanceTo(b.mesh.position)
                  })
                  w.targetEnemy = candidates[0]
                  telemetry.recordEvent(w.profile.name, 'combat', `Engajou em dogfight contra ${candidates[0].kind} #${candidates[0].id} a ${w.mesh.position.distanceTo(candidates[0].mesh.position).toFixed(1)}u`, { elapsed })
                  if (!radioMessage) radioMessage = speak(w.profile, engageEventFor(candidates[0].kind, 'engage_dogfight'))
                  w.state = 'dogfight'
                  w.stateTimer = 0
                  w.burstRemaining = 5
                  w.burstTimer = 0.35
                  triggerSoundCue(WINGMAN_SOUND_CUES.dogfight_engage, { wingmanId: w.profile.id, name: w.profile.name, enemyKind: candidates[0].kind })
                } else {
                  w.fireCooldown = 1.2 + Math.random() * 0.8
                }
              } else {
                w.fireCooldown = 1.2 + Math.random() * 0.8
              }
            } else {
              w.fireCooldown = 1.0
            }
          }
        }
      } else if (w.state === 'dogfight') {
        // ============ PERSEGUIÇÃO E DOGFIGHT DISCIPLINADO ============
        // Agressividade (Ideia 2): teto de segurança por piloto (combatProfile.dogfightDuration)
        // em vez do 6.0 fixo global — Peppy sai antes (3.5s), Falco/Miyu ficam mais (5.5s).
        const enemyLost = !w.targetEnemy || w.targetEnemy.dying || !w.targetEnemy.mesh ||
          w.mesh.position.distanceTo(w.targetEnemy.mesh.position) > 110 ||
          w.stateTimer > effectiveDogfightDuration(w.profile, opts)

        if (enemyLost) {
          telemetry.recordEvent(w.profile.name, 'combat', `Fim do dogfight (alvo perdido ou tempo esgotado). Retornando à formação`, { elapsed })
          if (!radioMessage) radioMessage = speak(w.profile, 'return_formation')
          w.state = 'patrol'
          w.stateTimer = 0
          w.targetEnemy = null
          w.fireCooldown = 1.5
          w.engagementCooldown = squadronCommandMode === 'focus' ? 0.8 : (3.0 + Math.random() * 2.5)
          if (squadronCommandMode === 'focus') {
            squadronFocusTargets = squadronFocusTargets.filter((t) => t && !t.dying && t.mesh)
          }
        } else {
          _wmToEnemy.copy(w.targetEnemy.mesh.position).sub(w.mesh.position)
          const dist = _wmToEnemy.length()
          if (dist > 1e-4) _wmAimDir.copy(_wmToEnemy).multiplyScalar(1 / dist)
          else _wmAimDir.copy(frame.forward)

          // Falco: investida em aríete
          if (w.profile.abilityId === 'ram' && !w.abilityActive && w.abilityCooldown <= 0 &&
              dist >= RAM_MIN_RANGE && dist <= RAM_MAX_RANGE) {
            telemetry.recordEvent(w.profile.name, 'ability', `Falco iniciou Investida Aríete contra ${w.targetEnemy.kind} #${w.targetEnemy.id}!`, { elapsed })
            if (!radioMessage) radioMessage = speak(w.profile, 'ability_ram')
            w.state = 'ram'
            w.stateTimer = 0
            w.abilityActive = true
            w.abilityTimer = 0
            w.chainCount = 0 // carta "Falco Combate" — cada ativação nova começa a cadeia do zero
            triggerSoundCue(WINGMAN_SOUND_CUES.falco_ram, { worldPos: w.mesh.position })
          } else {
            setDogfightApproachTarget(w, w.targetEnemy.mesh.position, _wmAimDir, frame)

            w.burstTimer -= dt
            if (w.burstTimer <= 0 && w.burstRemaining > 0 && dist < 85) {
              w.burstRemaining -= 1
              w.burstTimer = 0.55
              // Miyu com combo alto: mira cirúrgica (reatividade, Ideia 5) — os outros 3
              // continuam com a dispersão padrão.
              // Agressividade (Ideia 2): dispersão base vem de combatProfile.aimSpreadRad (Falco
              // "metralhadora" 0.08, Peppy/Miyu certeiros 0.03, Slippy 0.05). Miyu com
              // combo alto (Ideia 5) fica ainda mais cirúrgica por cima disso (0.02).
              const aimSpread = (w.profile.id === 3 && reactivity.playerHighCombo) ? 0.02 : w.profile.combatProfile.aimSpreadRad
              _wmSpreadDir.copy(_wmAimDir)
                .addScaledVector(frame.right, (Math.random() * 2 - 1) * aimSpread)
                .addScaledVector(frame.up, (Math.random() * 2 - 1) * aimSpread)
                .normalize()
              _wmLaserMuzzle.copy(w.mesh.position).addScaledVector(_wmSpreadDir, 1.3)
              fireWingmanLaser(w, _wmLaserMuzzle, _wmSpreadDir)
            }

            // fim natural da rajada — mesma proporção (0.7) que 4.2/6.0 já tinha antes desta
            // mudança, agora escalada pelo teto de segurança do piloto
            if (w.burstRemaining <= 0 && w.stateTimer > effectiveDogfightDuration(w.profile, opts) * 0.7) {
              telemetry.recordEvent(w.profile.name, 'combat', 'Concluiu rajada de ataque no dogfight. Retornando à formação', { elapsed })
              w.state = 'patrol'
              w.stateTimer = 0
              w.targetEnemy = null
              w.fireCooldown = 1.5
              w.engagementCooldown = squadronCommandMode === 'focus' ? 0.8 : (3.0 + Math.random() * 2.0)
            }
          }
        }
      } else if (w.state === 'ram') {
        // ============ INVESTIDA ARÍETE (Falco) ============
        w.abilityTimer += dt
        const target = w.targetEnemy
        const targetLost = !target || target.dying || !target.mesh
        if (targetLost) {
          w.abilityActive = false
          w.abilityCooldown = abilityCooldownFor(w.profile)
          w.state = 'patrol'
          w.stateTimer = 0
          w.targetEnemy = null
          w.engagementCooldown = 4.5
        } else {
          w.patrolTarget.copy(target.mesh.position)
          const distNow = w.mesh.position.distanceTo(target.mesh.position)
          if (distNow < RAM_HIT_RADIUS || w.abilityTimer > RAM_TIMEOUT_S) {
            let didHit = false
            if (distNow < RAM_HIT_RADIUS && enemies && enemies.resolveProjectileHit) {
              const isBig = target.kind === 'boss' || target.kind === 'golden'
              const hit = enemies.resolveProjectileHit(w.mesh.position, target.mesh.position, {
                damage: isBig ? RAM_DAMAGE_VS_BOSS : RAM_DAMAGE,
                isHoming: false,
                hitBuffer: 1.5,
              })
              if (hit) {
                const feedback = createDamageFeedback(hit, isBig ? RAM_DAMAGE_VS_BOSS : RAM_DAMAGE, { pilotId: w.profile.id, charged: true })
                if (feedback) damageFeedback.push(feedback)
                didHit = true
                if (effects && effects.explosion) {
                  effects.explosion(target.mesh.position, isBig ? 1.5 : 1.0)
                }
                if (hit.killed) {
                  telemetry.recordEvent(w.profile.name, 'combat', `Investida Aríete DESTRUIU ${target.kind} #${target.id}!`, { elapsed })
                  enemyKills++
                  enemyKillPoints += (hit.enemyKillPoints || 0)
                }
                if (hit.bossDefeated) {
                  bossDefeated = true
                  bossHitWorldPos = hit.worldPos ? hit.worldPos.clone() : target.mesh.position.clone()
                }
                if (hit.goldenSpecialHit) {
                  goldenSpecialHit = true
                  goldenHitWorldPos = hit.worldPos ? hit.worldPos.clone() : target.mesh.position.clone()
                }
              }
            }

            // Carta "Falco Combate" — em vez de voltar pra formação, encadeia contra o próximo
            // inimigo vivo mais próximo da posição ATUAL de Falco (não do alvo abatido). Só
            // tenta encadear em cima de um acerto de verdade (didHit), nunca num timeout sem
            // conectar. Sem cooldown extra entre elos da cadeia (só no fim dela, comportamento
            // padrão de sempre).
            const chainStacks = opts.falcoChainStacks || 0
            let chained = false
            if (didHit && chainStacks > 0 && w.chainCount < chainStacks && enemies && enemies.getAlive) {
              let nextTarget = null
              let nextDist = FALCO_CHAIN_RADIUS
              for (const candidate of enemies.getAlive()) {
                if (candidate === target || !candidate.mesh) continue
                const d = w.mesh.position.distanceTo(candidate.mesh.position)
                if (d < nextDist) { nextDist = d; nextTarget = candidate }
              }
              if (nextTarget) {
                chained = true
                w.chainCount += 1
                w.targetEnemy = nextTarget
                w.abilityTimer = 0
                telemetry.recordEvent(w.profile.name, 'ability', `Investida em Cadeia: Falco parte pro próximo alvo (${w.chainCount}/${chainStacks})!`, { elapsed })
              }
            }

            if (!chained) {
              w.abilityActive = false
              w.abilityCooldown = abilityCooldownFor(w.profile)
              w.state = 'patrol'
              w.stateTimer = 0
              w.targetEnemy = null
              w.engagementCooldown = 4.5
              w.chainCount = 0
            }
          }
        }
      } else if (w.state === 'rescue') {
        w.patrolTarget.copy(playerPos)
        if (w.mesh.position.distanceTo(playerPos) < PEPPY_RESCUE_TRIGGER_RANGE) {
          const cooldown = PEPPY_RESCUE_BASE_COOLDOWN_S - PEPPY_RESCUE_COOLDOWN_PER_STACK_S * peppyRescueStacks
          w.rescueCooldown = Math.max(1, cooldown)
          w.abilityActive = false
          w.state = 'patrol'
          w.stateTimer = 0
          w.engagementCooldown = 2.5
          rescueShieldGrants += 1
          rescueCancels += 1
          aiValidator.expect(
            'Rescue do Peppy só conclui uma vez por aproximação e entra no cooldown correto',
            () => w.rescueCooldown >= 12 && w.rescueCooldown <= 20,
            { rescueCooldown: w.rescueCooldown, stacks: peppyRescueStacks },
          )
          telemetry.recordEvent(w.profile.name, 'ability', 'Rescue alcançou o jogador: tumble cancelado e +1 escudo', { elapsed })
        }
      } else if (w.state === 'escort') {
        // ============ ESCOLTA (Peppy: Guarda / Miyu: Carga Compartilhada) ============
        w.abilityTimer += dt
        const side = w.escortKind === 'auxShield' ? 0 : w.profile.homeSide * ESCORT_SIDE_OFFSET
        w.patrolTarget.copy(playerPos)
          .addScaledVector(frame.right, side)
          .addScaledVector(frame.up, ESCORT_UP_OFFSET)
          .addScaledVector(frame.forward, ESCORT_FORWARD_OFFSET)

        if (w.escortKind === 'guard') {
          if (!w.abilityApplied && w.mesh.position.distanceTo(playerPos) < GUARD_TRIGGER_RANGE) {
            w.abilityApplied = true
            shieldGrants += 1
            guardExtraShieldGrants += opts.peppyGuardExtraStacks || 0
            triggerSoundCue(WINGMAN_SOUND_CUES.peppy_guard, { worldPos: w.mesh.position })
            telemetry.recordEvent(w.profile.name, 'ability', 'Guarda de Peppy: +1 escudo transferido com sucesso ao jogador', { elapsed })
          }
          if (w.abilityTimer > GUARD_ESCORT_S) {
            telemetry.recordEvent(w.profile.name, 'ability', 'Guarda de Peppy concluída, retornando à formação', { elapsed })
            w.abilityActive = false
            w.abilityApplied = false
            w.abilityCooldown = abilityCooldownFor(w.profile)
            w.state = 'patrol'
            w.stateTimer = 0
            w.engagementCooldown = 4.0
          }
        } else if (w.escortKind === 'assist') {
          if (!homingCharging || w.abilityTimer > ASSIST_MAX_S) {
            telemetry.recordEvent(w.profile.name, 'ability', 'Carga Compartilhada de Miyu concluída, retornando à formação', { elapsed })
            w.abilityActive = false
            w.abilityCooldown = abilityCooldownFor(w.profile)
            w.state = 'patrol'
            w.stateTimer = 0
            w.engagementCooldown = 4.0
          }
        } else if (w.escortKind === 'auxShield' && !opts.repulsionActive) {
          w.abilityActive = false
          w.escortKind = null
          w.state = 'patrol'
          w.stateTimer = 0
        }
      }

      // ============ FÍSICA DE VOO DISCIPLINADA E SUAVE ============
      _wmToTarget.copy(w.patrolTarget).sub(w.mesh.position)
      const targetDist = _wmToTarget.length()
      if (targetDist > 1e-4) _wmAimDir.copy(_wmToTarget).multiplyScalar(1 / targetDist)
      else _wmAimDir.copy(frame.forward)

      let cruiseSpeed = w.profile.flightProfile.cruiseSpeed
      if (w.state === 'regroup') {
        // Recuperação proporcional à distância restante, com teto: retorna rápido o suficiente
        // para não ficar perdido fora da tela, sem teleporte ou mudança brusca de direção.
        cruiseSpeed += Math.min(WINGMAN_REGROUP_SPEED_CAP, targetDist * 1.25)
      }
      if (!inArena) {
        // No rail, compensa a velocidade do mundo (+48u/s)
        cruiseSpeed += 48
        // Modulação suave para manter a formação com serenidade
        const alongSlot = _wmToTarget.dot(frame.forward)
        if (alongSlot > 4.0) cruiseSpeed += Math.min(22, alongSlot * 2.0)
        else if (alongSlot < -4.0) cruiseSpeed = Math.max(25, cruiseSpeed + alongSlot * 1.5)
      }
      if (boostActive) {
        cruiseSpeed *= 1.45
        // Miyu "acompanha o boost" com um empurrão extra (reatividade, Ideia 5) — os outros 3
        // já acompanham igual antes (o multiplicador acima é global, "sem mudança" pra eles).
        if (w.profile.id === 3) cruiseSpeed *= 1.15
      } else if (w.state === 'ram') cruiseSpeed *= 1.9
      else if (w.state === 'dogfight') cruiseSpeed *= 1.15
      else if (w.state === 'escort') cruiseSpeed *= 1.25

      _wmDesiredVelocity.copy(_wmAimDir).multiplyScalar(cruiseSpeed)

      // O desvio é aditivo e não troca o state: formação, escolta, ataque, Investida e Rescue
      // preservam a intenção original, mas nenhum aliado atravessa deliberadamente um detrito.
      steerAroundObstacle(w, _wmDesiredVelocity, frame)

      // Separação de ala: também resolve o caso degenerado de duas naves exatamente no mesmo
      // ponto. Antes, `distBetween > 0.01` eliminava o vetor de separação justamente nesse caso.
      for (let otherIdx = 0; otherIdx < activeWingmen.length; otherIdx++) {
        if (otherIdx === idx) continue
        const other = activeWingmen[otherIdx]
        if (other.state === 'retreating') {
          w.overlapWith.delete(other.profile.id)
          continue
        }
        _wmDiff.copy(w.mesh.position).sub(other.mesh.position)
        const distBetween = _wmDiff.length()
        if (distBetween < WINGMAN_SEPARATION_DISTANCE) {
          if (distBetween > 0.01) {
            _wmPush.copy(_wmDiff).multiplyScalar(1 / distBetween)
          } else {
            // Ordem por piloto garante vetores opostos e estáveis para os dois membros.
            const pairDirection = w.profile.id < other.profile.id ? -1 : 1
            _wmPush.copy(frame.right).multiplyScalar(pairDirection)
            _wmPush.addScaledVector(frame.up, (w.profile.id % 2 === 0 ? -1 : 1) * 0.28).normalize()
          }
          const overlapFrac = 1 - distBetween / WINGMAN_SEPARATION_DISTANCE
          _wmDesiredVelocity.addScaledVector(_wmPush, WINGMAN_SEPARATION_SPEED * overlapFrac)
          if (!w.overlapWith.has(other.profile.id)) {
            w.overlapWith.add(other.profile.id)
            aiValidator.expect(
              'Separação de ala sempre resolve pares sobrepostos com um vetor finito',
              () => Number.isFinite(_wmPush.x) && Number.isFinite(_wmPush.y) && Number.isFinite(_wmPush.z) && _wmPush.lengthSq() > 0,
              { pilotId: w.profile.id, otherPilotId: other.profile.id, distance: distBetween },
            )
            aiValidator.logMechanic('wingman-formation-separation', 'separacao-iniciada', {
              pilotId: w.profile.id, otherPilotId: other.profile.id, distance: distBetween,
            })
          }
        } else {
          w.overlapWith.delete(other.profile.id)
        }
      }

      // Aceleração com inércia estável (por piloto — ver flightProfile.accelRate)
      const accelRate = w.state === 'ram' ? 5.5 : w.profile.flightProfile.accelRate
      w.velocity.lerp(_wmDesiredVelocity, 1 - Math.exp(-accelRate * dt))
      w.mesh.position.addScaledVector(w.velocity, dt)

      // ============ ORIENTAÇÃO COM BASE ORTONORMAL (ZERO PIRUETAS) ============
      // Orientação matemática absoluta: o roll é rigorosamente travado entre -22° e +22°
      // e derivado diretamente da base ortonormal. Jamais usa rotateZ incremental.
      let desiredForward = null
      if ((w.state === 'dogfight' || w.state === 'ram') && w.targetEnemy && w.targetEnemy.mesh && !w.targetEnemy.dying) {
        _wmToEnemy.copy(w.targetEnemy.mesh.position).sub(w.mesh.position)
        if (_wmToEnemy.lengthSq() > 1e-4) {
          desiredForward = _wmToEnemy.normalize()
        }
      }
      if (!desiredForward) {
        if (w.velocity.lengthSq() > 1.0) {
          desiredForward = _wmToEnemy.copy(w.velocity).normalize()
        } else {
          desiredForward = frame.forward
        }
      }

      // Roll de banking suave estritamente limitado a [-0.38, 0.38] rad (±21.7°)
      // Slippy (Ideia 4): em vez de bankar pelo próprio movimento lateral, imita o roll do
      // JOGADOR com 0.3s de atraso — mesmo clamp/lerp de sempre, só troca a fonte do alvo.
      let targetRoll
      if (w.profile.id === 2) {
        targetRoll = THREE.MathUtils.clamp(delayedPlayerRoll(SLIPPY_ROLL_DELAY_S), -0.38, 0.38)
      } else {
        const lateralMove = w.velocity.dot(frame.right)
        targetRoll = THREE.MathUtils.clamp(-lateralMove * 0.012, -0.38, 0.38)
      }
      w.smoothRoll = THREE.MathUtils.lerp(w.smoothRoll, (w.state === 'ram' ? 0 : targetRoll), 1 - Math.exp(-4.5 * dt))

      // Constrói a base ortonormal absoluta: Forward, Banked Right, Banked Up
      _fwdVec.copy(desiredForward)
      _rightVec.crossVectors(frame.up, _fwdVec)
      if (_rightVec.lengthSq() < 1e-4) {
        _rightVec.crossVectors(_UP_DIR, _fwdVec)
      }
      _rightVec.normalize()
      _upVec.crossVectors(_fwdVec, _rightVec).normalize()

      const cosR = Math.cos(w.smoothRoll)
      const sinR = Math.sin(w.smoothRoll)
      _bankedRight.copy(_rightVec).multiplyScalar(cosR).addScaledVector(_upVec, sinR).normalize()
      _bankedUp.crossVectors(_fwdVec, _bankedRight).normalize()

      _rotMatrix.makeBasis(_bankedRight, _bankedUp, _fwdVec)
      _targetQuat.setFromRotationMatrix(_rotMatrix)

      const turnRate = (w.state === 'dogfight' || w.state === 'ram') ? w.profile.flightProfile.aimTurnRate : w.profile.flightProfile.cruiseTurnRate
      w.mesh.quaternion.rotateTowards(_targetQuat, turnRate * dt)

      // Peppy (Ideia 4): nariz sempre virando levemente pro jogador quando em formação — ajuste
      // pequeno e incremental POR CIMA da orientação já resolvida acima (nunca mexe na base
      // ortonormal principal), clampado a ±10° e a uma taxa própria de aproximação por frame.
      // Recalculado do zero a cada frame a partir da orientação REAL atual (não acumula viés).
      if (w.profile.id === 1 && w.state === 'patrol') {
        _wmNoseToPlayer.copy(playerPos).sub(w.mesh.position)
        if (_wmNoseToPlayer.lengthSq() > 1e-4) {
          _wmNoseToPlayer.normalize()
          _wmInvQuat.copy(w.mesh.quaternion).invert()
          _wmNoseToPlayer.applyQuaternion(_wmInvQuat) // pro espaço local: x=right, z=forward
          const yawNeeded = THREE.MathUtils.clamp(Math.atan2(_wmNoseToPlayer.x, _wmNoseToPlayer.z), -PEPPY_NOSE_MAX_RAD, PEPPY_NOSE_MAX_RAD)
          const yawStep = THREE.MathUtils.clamp(yawNeeded, -PEPPY_NOSE_EASE_RATE * dt, PEPPY_NOSE_EASE_RATE * dt)
          w.mesh.rotateY(yawStep)
        }
      }

      // Miyu (Ideia 4): fica semi-transparente 1.5s a cada ciclo de 8s — só material, nada de
      // hitbox/lógica (mesma hitbox/colisão sempre, ver risco baixo no documento).
      if (w.profile.id === 3 && w.miyuMaterials) {
        w.miyuCloakTimer = (w.miyuCloakTimer + dt) % MIYU_CLOAK_CYCLE_S
        const targetOpacity = w.miyuCloakTimer < MIYU_CLOAK_DURATION_S ? MIYU_CLOAK_OPACITY : 1.0
        for (const m of w.miyuMaterials) m.opacity = targetOpacity
      }
    }

    // 2. Atualiza os lasers disparados pelos companheiros
    for (let i = activeLasers.length - 1; i >= 0; i--) {
      const laser = activeLasers[i]
      laser.life -= dt
      if (laser.life <= 0) {
        scene.remove(laser.mesh)
        if (laser.ownMaterial) laser.mesh.material.dispose()
        activeLasers.splice(i, 1)
        continue
      }

      _wlPrevPos.copy(laser.mesh.position)
      if (laser.homingTarget?.mesh && !laser.homingTarget.dying) {
        _wmToEnemy.copy(laser.homingTarget.mesh.position).sub(laser.mesh.position)
        if (_wmToEnemy.lengthSq() > 0.001) {
          _wmToEnemy.normalize()
          _wmVelNorm.copy(laser.velocity).normalize().lerp(_wmToEnemy, Math.min(1, laser.homingTurnRate * dt)).normalize()
          laser.velocity.copy(_wmVelNorm.multiplyScalar(WINGMAN_LASER_SPEED))
          laser.mesh.quaternion.setFromUnitVectors(FORWARD_AXIS, _wmVelNorm)
        }
      }
      _wlStep.copy(laser.velocity).multiplyScalar(dt)
      laser.mesh.position.add(_wlStep)
      laser.traveled += _wlStep.length()
      if (laser.chargedVisual) {
        laser.chargedTrailTimer -= dt
        if (laser.chargedTrailTimer <= 0) {
          effects?.projectileTrail?.(laser.mesh.position, laser.mesh.quaternion, laser.color)
          laser.chargedTrailTimer = 0.075
        }
      }

      // Checa colisão com inimigos
      if (enemies && enemies.resolveProjectileHit) {
        const hit = enemies.resolveProjectileHit(_wlPrevPos, laser.mesh.position, {
          damage: laser.damage + (opts.moraleDamageBonus || 0),
          isHoming: false,
          hitBuffer: 0.8,
        })
        if (hit) {
          const feedback = createDamageFeedback(hit, laser.damage + (opts.moraleDamageBonus || 0), {
            pilotId: laser.owner?.profile.id ?? null, charged: !!laser.chargedVisual,
          })
          if (feedback) damageFeedback.push(feedback)
          if (effects && effects.hitSpark) {
            effects.hitSpark(laser.mesh.position, laser.color)
          }
          if (laser.chargedVisual && effects) {
            effects.maxChargeRings?.(laser.mesh.position, laser.velocity, laser.color)
          }
          if (hit.killed) {
            enemyKills++
            enemyKillPoints += (hit.enemyKillPoints || 0)
            if (laser.owner && !radioMessage) {
              const killEvent = hit.bossDefeated ? 'boss_kill' : hit.goldenSpecialHit ? 'golden_kill' : 'kill'
              radioMessage = speak(laser.owner.profile, killEvent)
            }
          }
          if (hit.bossDefeated) {
            bossDefeated = true
            bossHitWorldPos = hit.worldPos ? hit.worldPos.clone() : laser.mesh.position.clone()
          }
          if (hit.goldenSpecialHit) {
            goldenSpecialHit = true
            goldenHitWorldPos = hit.worldPos ? hit.worldPos.clone() : laser.mesh.position.clone()
          }
          // Slippy: o próximo tiro que acertar (mata ou não) depois do cooldown pronto solta um
          // orbe de reparo no ponto do impacto — proc no acerto, não em cada disparo.
          const owner = laser.owner
          if (owner && owner.profile.abilityId === 'repair' && !owner.abilityActive && owner.abilityCooldown <= 0) {
            const orbPos = hit.worldPos ? hit.worldPos.clone() : laser.mesh.position.clone()
            healOrbSpawns.push(orbPos)
            // Reatividade (Ideia 5): vida baixa do jogador reduz o cooldown pela metade — o
            // sistema de proc já é determinístico (sempre solta ao acertar com cooldown pronto),
            // então "chance sobe 50%" vira "solta com o dobro de frequência" nesse estado.
            owner.abilityCooldown = abilityCooldownFor(owner.profile) * (reactivity.playerLowHealth ? 0.5 : 1)
            triggerSoundCue(WINGMAN_SOUND_CUES.slippy_repair, { worldPos: orbPos })
            telemetry.recordEvent(owner.profile.name, 'ability', 'Tiro certeiro de Slippy gerou Orbe de Reparo de Campo no impacto!', { elapsed })
            if (!radioMessage) radioMessage = speak(owner.profile, 'ability_repair')
          }
          scene.remove(laser.mesh)
          if (laser.ownMaterial) laser.mesh.material.dispose()
          activeLasers.splice(i, 1)
          continue
        }
      }
    }

    // 2b. Feixes de Intercept de Falco — puramente visuais, só decaem/fadeiam (ver
    // fireFalcoInterceptBeam acima; o projétil já foi destruído no instante do disparo).
    for (let i = interceptBeams.length - 1; i >= 0; i--) {
      const beam = interceptBeams[i]
      beam.life -= dt
      if (beam.life <= 0) {
        scene.remove(beam.mesh)
        beam.material.dispose()
        interceptBeams.splice(i, 1)
        continue
      }
      beam.material.opacity = Math.max(0, beam.life / FALCO_INTERCEPT_BEAM_LIFETIME)
    }

    for (const profileId of completedRetreatIds) removeMember(profileId)
    telemetry.update(activeWingmen, playerPos, frame, squadronCommandMode, elapsed)

    return {
      enemyKills,
      enemyKillPoints,
      damageFeedback,
      bossDefeated,
      bossHitWorldPos,
      goldenSpecialHit,
      goldenHitWorldPos,
      shieldGrants,
      guardExtraShieldGrants,
      rescueShieldGrants,
      rescueCancels,
      healOrbSpawns,
      completedRetreatIds,
      radioMessage,
      radioQueue,
    }
  }

  // Rádio (Ideia 3, evento player_take_damage — §3.5 do doc, decisão (b): só reage a dano do
  // JOGADOR, nunca do próprio wingman, que é invulnerável). Chamado de fora do laço de update()
  // (game-loop.js, no momento em que player.takeDamage() resolve), por isso guarda em
  // pendingRadioMessage pro próximo update() devolver.
  function triggerPlayerTookDamage() {
    if (activeWingmen.length === 0 || pendingRadioMessage) return
    const w = activeWingmen[Math.floor(Math.random() * activeWingmen.length)]
    const msg = speak(w.profile, 'player_take_damage')
    if (msg) pendingRadioMessage = msg
  }

  // Disparo manual sincronizado de suporte: companheiros em formação acompanham o fogo do líder
  // respeitando estritamente suas cadências e intervalos individuais de recarga (sem spam caótico)
  function tryFireSupport(direction) {
    if (activeWingmen.length > 0) {
      triggerSoundCue(WINGMAN_SOUND_CUES.support_volley, { activeCount: activeWingmen.length })
    }
    for (const w of activeWingmen) {
      if (w.state === 'patrol' && w.fireCooldown <= 0) {
        w.fireCooldown = w.profile.fireInterval * (0.85 + Math.random() * 0.3)
        const muzzlePos = w.mesh.position.clone().addScaledVector(direction, 1.3)
        fireWingmanLaser(w, muzzlePos, direction)
      }
    }
  }

  function clearLasers() {
    for (let i = activeLasers.length - 1; i >= 0; i--) {
      scene.remove(activeLasers[i].mesh)
      if (activeLasers[i].ownMaterial) activeLasers[i].mesh.material.dispose()
    }
    activeLasers.length = 0
    clearInterceptBeams()
  }

  function dispose() {
    clearSquadron()
    clearLasers()
    laserGeometry.dispose()
    interceptBeamGeometry.dispose()
  }

  return {
    update,
    tryFireSupport,
    fireMiyuAssistShots,
    setWingmanCount,
    spawnMember,
    removeMember,
    triggerPlayerTookDamage,
    clearSquadron,
    clearLasers,
    toggleCommand,
    getCommandMode: () => squadronCommandMode,
    getCommandState: () => ({
      mode: squadronCommandMode,
      durationRemaining: Math.max(0, squadronCommandDurationTimer),
      durationMax: SQUADRON_COMMAND_DURATION_S,
      cooldownRemaining: Math.max(0, squadronCommandCooldownTimer),
      cooldownMax: SQUADRON_COMMAND_COOLDOWN_S,
    }),
    getMoraleDamageBonus: () => moraleDamageBonus,
    getWingmanPositions: () => activeWingmen.filter((w) => w.state !== 'retreating').map((w) => w.mesh.position.clone()),
    getWingmanCount: () => activeWingmen.length,
    getActiveMembers: () => activeWingmen.filter((w) => w.state !== 'retreating').map((w) => ({ id: w.profile.id, name: w.profile.name, title: w.profile.title, color: w.profile.color })),
    getDamageTargets: (opts = {}) => activeWingmen
      .filter((w) => w.state !== 'retreating' && !(w.profile.id === 2 && opts.slippyBoostActive))
      .map((w) => ({ id: w.profile.id, worldPos: w.mesh.position, radius: 1.25 })),
    getVitalSnapshots: () => activeWingmen.map((w) => ({
      id: w.profile.id, name: w.profile.name, color: w.profile.color, worldPos: w.mesh.position,
      hp: w.hp, maxHp: w.maxHp, shield: w.shield, maxShield: w.shieldMax,
      lowHp: w.hp <= WINGMAN_LOW_HP,
      retreating: w.state === 'retreating',
    })),
    applyDamageToWingman,
    repairNearbyWingmen,
    recoverMember,
    getAbilityStates,
    getSubAbilityStates,
    getAuxShieldState: () => {
      const peppy = activeWingmen.find((w) => w.profile.id === 1 && w.escortKind === 'auxShield' && w.abilityActive)
      return peppy ? { worldPos: peppy.mesh.position.clone(), radius: 5 } : null
    },
    applyAbilityCooldownCard,
    getAssistChargeMult,
    getAssistExtraTargets,
    getTelemetry: () => telemetry.getSnapshot(),
    getFlightLog: (limit) => telemetry.getFlightLog(limit),
    dumpTelemetry: () => telemetry.dumpToConsole(),
    copyFlightLog: () => telemetry.copyToClipboard(),
    getTelemetryText: () => telemetry.getFormattedText(),
    clearFlightLog: () => telemetry.clearLog(),
    dispose,
  }
}
