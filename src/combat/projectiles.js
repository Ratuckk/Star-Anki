import * as THREE from 'three'
import { PLAYER_SOUND_CUES, ENEMY_SOUND_CUES, triggerSoundCue } from '../audio-cues.js'
import { aiValidator } from '../ai-validator.js'
import { BOSS_KIND } from '../enemies/boss.js'
import { GOLDEN_KIND } from '../enemies/golden.js'

// ============ TIROS DO JOGADOR — normal + carregado (teleguiado) ============
// Extraído de combat.js (v0.38.0, split por sistema). Os dois tipos de tiro ficam JUNTOS aqui de
// propósito (ao contrário de inimigos, que viraram um arquivo por classe) — compartilham o mesmo
// array e o mesmo loop de update/colisão; a diferença entre eles é só um punhado de campos
// (`isHoming`, `homingTarget`, `damage`) dentro de uma função só. Separar por tipo forçaria
// duplicar a resolução de colisão contra inimigo/bônus/orbe nos dois arquivos.

const FORWARD_AXIS = new THREE.Vector3(0, 0, 1)
const WORLD_UP = new THREE.Vector3(0, 1, 0)

const PROJECTILE_SPEED = 260
// pedido do usuário: tiro normal (não-carregado) some sozinho depois de 8s de voo — o teto de
// ALCANCE abaixo sobe junto com PROJECTILE_SPEED (velocidade * 8s + folga) só pra não cortar o
// tiro ANTES do tempo em voo reto; o timer (ver PLAYER_PROJECTILE_LIFETIME) é o que efetivamente
// decide na prática.
const PROJECTILE_MAX_RANGE = 700
const PLAYER_PROJECTILE_LIFETIME = 8
const PROJECTILE_LATERAL_SPACING = 1.6
const HOMING_PROJECTILE_SPEED = 70 // 46 * 1.5 (pedido: +50% de velocidade)
const HOMING_PROJECTILE_DAMAGE = 3 // pedido do usuário: era 3
// pedido do usuário: segurar o tiro carregado até o limite (carga máxima) aumenta o dano de 4
// pra 6 — recompensa esperar o círculo de carga encher de verdade, não só passar do mínimo.
const HOMING_PROJECTILE_DAMAGE_MAX_CHARGE = 6
// pedido do usuário: carga máxima também estoura uma explosão em área no impacto — circular,
// sem direção, além do dano direto no alvo travado.
const MAX_CHARGE_SPLASH_RADIUS = 3
const MAX_CHARGE_SPLASH_DAMAGE = 6
const HOMING_AFTERIMAGE_INTERVAL = 0.035 // segundos entre cada cópia fantasma do rastro

// tiro normal do jogador: 1 disparo central com 2 de dano (era 2 tiros de 1 dano lado a lado)
const PLAYER_PROJECTILE_DAMAGE = 2
// quão rápido (por segundo) o tiro normal em voo se realinha rumo à direção atual da mira — não
// é homing de verdade (sem alvo travado), só um leve "puxão" pra facilitar acertar
const PLAYER_PROJECTILE_STEER_RATE = 2.2
// cresce visualmente a cada projétil extra ganho por upgrade
const PLAYER_PROJECTILE_GROWTH_PER_EXTRA = 0.15

export const DEFAULT_FIRE_COOLDOWN = 0.15

// v0.29.6: +25% no tiro normal (não no teleguiado) — a colisão é feita contra o SEGMENTO
// percorrido no frame, então "aumentar a hitbox" aqui significa somar essa folga ao raio de
// acerto de cada tipo de alvo, só quando o projétil não é homing.
const PROJECTILE_HIT_BUFFER = 0.3

// mesmo valor de MAX_LOCK_RANGE em lockon.js — distância máxima pra um alvo poder receber
// teleguiado, seja via trava prévia ou via "N mais próximos" de fallback
const MAX_HOMING_RANGE = 140

// Overhaul visual do tiro básico (pedido do usuário — "núcleo + halo", reaproveitando a técnica
// outer/inner additive-blending já usada no laser do Chefe/Dourado, ver fireBossLaser em boss.js).
// Cada tiro é um Group com 2 camadas (halo translúcido por fora, núcleo quase-branco por dentro)
// em vez de 1 cone sólido — todo código que já tratava a instância como objeto único
// (`.position`, `.quaternion`, `.scale.setScalar()`, `scene.remove()`) continua funcionando sem
// mudança, Group herda tudo isso de Object3D igual Mesh.
//
// v0.85.x — RECALIBRADO. `PLAYER_SHOT_SIZE_MULT` subiu de 1.4 pra 2.2 (tiro bem maior — o valor
// anterior lia como pontinho a 260 u/s), e as proporções do core foram normalizadas:
//   - CORE_RADIUS = HALO_RADIUS * 0.5  (núcleo com metade do raio do halo — leitura clássica de
//     "núcleo brilhante dentro de um envelope translúcido")
//   - CORE_LENGTH = HALO_LENGTH * 1.0  (núcleo do MESMO comprimento que o halo — o valor anterior
//     de *5 fazia o core virar uma agulha de 5× o halo, o que lia como um feixe comprido em vez
//     de um tiro)
const PLAYER_SHOT_SIZE_MULT = 2.2
const PLAYER_SHOT_HALO_RADIUS = 0.21 * PLAYER_SHOT_SIZE_MULT
const PLAYER_SHOT_HALO_LENGTH = 1.5 * PLAYER_SHOT_SIZE_MULT
const PLAYER_SHOT_HALO_COLOR = 0x3ea6ff // cor de identidade original do tiro básico
const PLAYER_SHOT_HALO_OPACITY = 0.45
const PLAYER_SHOT_CORE_RADIUS = PLAYER_SHOT_HALO_RADIUS * 0.5
const PLAYER_SHOT_CORE_LENGTH = PLAYER_SHOT_HALO_LENGTH * 1.0
const PLAYER_SHOT_CORE_COLOR = 0xeaffff // quase-branco — núcleo brilhante
const PLAYER_SHOT_CORE_OPACITY = 0.95

const playerShotHaloGeometry = new THREE.ConeGeometry(PLAYER_SHOT_HALO_RADIUS, PLAYER_SHOT_HALO_LENGTH, 5)
playerShotHaloGeometry.rotateX(Math.PI / 2)
const playerShotHaloMaterial = new THREE.MeshBasicMaterial({
  color: PLAYER_SHOT_HALO_COLOR, transparent: true, opacity: PLAYER_SHOT_HALO_OPACITY,
  blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
})
const playerShotCoreGeometry = new THREE.ConeGeometry(PLAYER_SHOT_CORE_RADIUS, PLAYER_SHOT_CORE_LENGTH, 5)
playerShotCoreGeometry.rotateX(Math.PI / 2)
const playerShotCoreMaterial = new THREE.MeshBasicMaterial({
  color: PLAYER_SHOT_CORE_COLOR, transparent: true, opacity: PLAYER_SHOT_CORE_OPACITY,
  blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
})

function buildPlayerShotMesh() {
  const group = new THREE.Group()
  group.add(new THREE.Mesh(playerShotHaloGeometry, playerShotHaloMaterial))
  group.add(new THREE.Mesh(playerShotCoreGeometry, playerShotCoreMaterial))
  return group
}

const homingProjectileGeometry = new THREE.ConeGeometry(0.528, 3.36, 6)
homingProjectileGeometry.rotateX(Math.PI / 2)
const homingProjectileMaterial = new THREE.MeshBasicMaterial({ color: 0x2bff88 })
// pedido do usuário: tiro de carga MÁXIMA sai azul (mesmo tom do brilho de carga nesse estado,
// ver CHARGE_GLOW_MAX_COLOR em effects.js) — a cor vira o aviso visual de "este tiro causa
// explosão em área" (ver MAX_CHARGE_SPLASH_RADIUS/DAMAGE abaixo). Escala aplicada por instância
// (MAX_CHARGE_VISUAL_SCALE), não na geometria compartilhada.
const homingMaxChargeMaterial = new THREE.MeshBasicMaterial({ color: 0x2b8fff })
const MAX_CHARGE_VISUAL_SCALE = 1.2
// carta "Ricochete": distância do empurrão aplicado ao redirecionar pro próximo alvo — maior
// que qualquer hitRadius do jogo, garante que o próximo frame não recaia no alvo recém-atingido
const RICOCHET_NUDGE_DISTANCE = 3

// ============ SWIRL BLAST — projétil perfurante (Docs/# Swirl Blast — Design & Plano de I.md +
// "Proposta — Overhaul visual do Swirl Blast (v2)", pedido do usuário) ============
const SWIRL_BLAST_SPEED = 520     // velocidade em u/s (~2x o tiro normal de 260) — requisito R5
const SWIRL_BLAST_DAMAGE = 6      // dano por alvo atingido, sem falloff — requisito R4
const SWIRL_BLAST_LIFETIME = 8    // segundos de vida (mesmo do tiro normal)
const SWIRL_BLAST_MAX_RANGE = 700 // alcance máximo em u (mesmo do tiro normal)
const SWIRL_AFTERIMAGE_INTERVAL = 0.03 // segundos entre cada afterimage deixado pra trás (§4.4)

// --- Overhaul v2 (pedido do usuário): forma triangular (pirâmide de 3 lados, não mais cone
// redondo) em 9 camadas, e homing contra CHEFE e DOURADO (os dois — "chefes inclui o dourado")
// quando travados no release. Isso é um desvio DELIBERADO do requisito R1 original ("disparo
// reto, sem homing") do doc de design — confirmado explicitamente com o usuário depois de
// apontar o conflito; R1 continua valendo pra todo o resto (inimigos comuns, fragata — que já
// para o Swirl por conta própria e não precisa de homing pra ser atingida).
//
// ESCALA — Rodada 1 (0.6×) testada e aprovada ao vivo pelo usuário; Rodada 2 abaixo é a escala
// CHEIA da proposta v2 (1.0×). Pra voltar pra Rodada 1 se precisar, é só trocar de volta pra 0.6.
const SWIRL_SCALE = 1.0

const SWIRL_CORE_COLOR = 0x2b8fff  // azul principal — mesma família do tiro carregado máximo
const SWIRL_DEEP_COLOR = 0x1a5fb4  // azul escuro da "plumagem" traseira
const SWIRL_HOT_COLOR = 0xeaffff   // quase-branco do núcleo/agulha/bico
const SWIRL_TRAIL_COLOR = 0x5ac8ff // azul claro da cauda/exaustão

const SWIRL_SPIN_RATE = 18            // rad/s — giro do GRUPO inteiro em torno do próprio eixo de voo

// 1) Pirâmide principal (o "drill") — ConeGeometry com 3 segmentos radiais = pirâmide de base
// triangular, não um cone redondo. É essa aresta angular que lê como "cortante" de qualquer
// ângulo de câmera.
const SWIRL_CORE_RADIUS = 3.0 * SWIRL_SCALE   // 1.8
const SWIRL_CORE_LENGTH = 10.0 * SWIRL_SCALE  // 6.0
// 2) Pirâmide traseira invertida (plumagem) — mais larga e mais curta que a principal, aponta
// pro lado oposto. Junto com a principal forma um losango alongado visto de perfil.
const SWIRL_TAIL_RADIUS = 6.0 * SWIRL_SCALE   // 3.6
const SWIRL_TAIL_LENGTH = 8.0 * SWIRL_SCALE   // 4.8
// 3) Agulha frontal fina — o bico que fisicamente "rasga" os alvos.
const SWIRL_NEEDLE_RADIUS = 0.9 * SWIRL_SCALE // 0.54
const SWIRL_NEEDLE_LENGTH = 8.0 * SWIRL_SCALE // 4.8
// 4) Espiral de contenção — TorusKnotGeometry enrolando o corpo inteiro feito uma mola. É o
// componente mais importante da leitura "vórtice"; sem ele são só pirâmides soltas.
const SWIRL_SPIRAL_RADIUS = 4.5 * SWIRL_SCALE // 2.7
const SWIRL_SPIRAL_TUBE = Math.max(0.09, 0.12 * SWIRL_SCALE) // piso de 0.09 — tubo real menor que isso fica invisível
const SWIRL_SPIRAL_SPIN_BASE = 15     // rad/s quando reto
const SWIRL_SPIRAL_SPIN_HOMING = 22   // rad/s quando teleguiado (mais rápido = "travando em algo")
const SWIRL_SPIRAL_OPACITY_BASE = 0.75
const SWIRL_SPIRAL_OPACITY_HOMING = 1.0
// 5) 5 anéis triangulares em funil — mesma técnica angular da pirâmide principal (3 segmentos
// radiais = anel oco triangular, não redondo), escalas crescentes do bico pra cauda desenhando
// um funil, cada um girando numa velocidade própria (dessincronizados, reforça "vórtice vivo").
const SWIRL_RING_RADIUS = 2.5 * SWIRL_SCALE // 1.5 — base, escalada por instância abaixo
const SWIRL_RING_TUBE = 0.3 * SWIRL_SCALE   // 0.18
const SWIRL_RING_SPECS = [
  { z: -3.5 * SWIRL_SCALE, scale: 0.5, spin: 15 },
  { z: -1.75 * SWIRL_SCALE, scale: 0.9, spin: 18 },
  { z: 0, scale: 1.3, spin: 21 },
  { z: 1.75 * SWIRL_SCALE, scale: 1.7, spin: 24 },
  { z: 3.5 * SWIRL_SCALE, scale: 2.1, spin: 27 },
]
// 6) Aura de contenção — envelopa tudo, não gira, é o "campo de força".
const SWIRL_AURA_RADIUS = 5.0 * SWIRL_SCALE // 3.0
// 7) Núcleo branco saturado — cilindro coaxial dentro das pirâmides, "raio dentro da broca".
const SWIRL_INNER_CORE_RADIUS_TOP = 0.8 * SWIRL_SCALE    // 0.48
const SWIRL_INNER_CORE_RADIUS_BOTTOM = 1.4 * SWIRL_SCALE // 0.84
const SWIRL_INNER_CORE_LENGTH = 9.0 * SWIRL_SCALE         // 5.4
// 8) Trail plume — cone invertido saindo da base da pirâmide traseira, dá cauda.
const SWIRL_PLUME_RADIUS = 5.5 * SWIRL_SCALE // 3.3
const SWIRL_PLUME_LENGTH = 6.0 * SWIRL_SCALE // 3.6
// 9) Pontos de exaustão — 3 esferas pequenas nas quinas da base da pirâmide traseira (a base
// triangular tem 3 vértices — uma luz em cada).
const SWIRL_EXHAUST_RADIUS = 0.6 * SWIRL_SCALE // 0.36
const SWIRL_EXHAUST_DISTANCE = SWIRL_TAIL_RADIUS * 0.85

// Punch visual quando o alvo travado é chefe/dourado (§2 da proposta v2) — turn rate limitado
// (rotação de DIREÇÃO por eixo-ângulo, não retargeting instantâneo como o teleguiado comum): é
// um torpedo que corrige aos poucos, não um míssil telepático perfeito.
const SWIRL_HOMING_TURN_RATE = 18.0 // rad/s de correção angular enquanto FORA do raio de alcance final

// Perseguição pura com taxa de giro limitada tem um problema geométrico conhecido: perto do
// alvo, a taxa angular NECESSÁRIA pra continuar apontando pra ele cresce sem limite (é o ângulo
// que muda mais rápido que a distância encolhe) — mesmo com SWIRL_HOMING_TURN_RATE bem alto, o
// projétil pode ficar preso numa órbita ao redor do alvo sem nunca fechar a distância até o
// raio de colisão (visto ao vivo: distância oscilando 18u↔40u ao redor de um chefe parado,
// nunca cruzando o hitRadius de ~7.7u, até expirar). Dentro deste raio, aponta DIRETO pro alvo
// (sem limite de giro) — é a "guiagem terminal" padrão de mísseis em jogos, só pro trecho final.
// unidades — o raio de órbita estável da perseguição pura (contra alvo parado) é ~SWIRL_BLAST_SPEED
// / SWIRL_HOMING_TURN_RATE (≈28.9 aqui); um snap range abaixo disso deixa uma faixa de distância/
// ângulo onde o projétil orbita pra sempre sem nunca cruzar o raio de snap (bug real, achado por
// simulação numérica). Margem de 1.3× garante que o snap sempre alcança a órbita.
const SWIRL_HOMING_SNAP_RANGE = (SWIRL_BLAST_SPEED / SWIRL_HOMING_TURN_RATE) * 1.3

const swirlCoreGeometry = new THREE.ConeGeometry(SWIRL_CORE_RADIUS, SWIRL_CORE_LENGTH, 3)
swirlCoreGeometry.rotateX(Math.PI / 2)
const swirlCoreMaterial = new THREE.MeshBasicMaterial({
  color: SWIRL_CORE_COLOR, transparent: true, opacity: 0.95,
  blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
})
const swirlTailGeometry = new THREE.ConeGeometry(SWIRL_TAIL_RADIUS, SWIRL_TAIL_LENGTH, 3)
swirlTailGeometry.rotateX(-Math.PI / 2)
const swirlTailMaterial = new THREE.MeshBasicMaterial({
  color: SWIRL_DEEP_COLOR, transparent: true, opacity: 0.7,
  blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
})
const swirlNeedleGeometry = new THREE.ConeGeometry(SWIRL_NEEDLE_RADIUS, SWIRL_NEEDLE_LENGTH, 3)
swirlNeedleGeometry.rotateX(Math.PI / 2)
const swirlNeedleMaterial = new THREE.MeshBasicMaterial({
  color: SWIRL_HOT_COLOR, transparent: true, opacity: 1.0,
  blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
})
const swirlSpiralGeometry = new THREE.TorusKnotGeometry(SWIRL_SPIRAL_RADIUS, SWIRL_SPIRAL_TUBE, 128, 8, 2, 3)
// dois materiais COMPARTILHADOS (não um por instância) — só existem 2 estados possíveis (reto/
// homing), então updateSwirlDynamicShell troca a REFERÊNCIA de child.material entre eles em vez
// de mutar opacity por instância, sem precisar alocar/compilar um material novo por disparo
const swirlSpiralMaterialBase = new THREE.MeshBasicMaterial({
  color: SWIRL_CORE_COLOR, transparent: true, opacity: SWIRL_SPIRAL_OPACITY_BASE,
  blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
})
const swirlSpiralMaterialHoming = new THREE.MeshBasicMaterial({
  color: SWIRL_CORE_COLOR, transparent: true, opacity: SWIRL_SPIRAL_OPACITY_HOMING,
  blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
})
const swirlRingGeometry = new THREE.TorusGeometry(SWIRL_RING_RADIUS, SWIRL_RING_TUBE, 3, 24)
const swirlRingMaterial = new THREE.MeshBasicMaterial({
  color: SWIRL_CORE_COLOR, transparent: true, opacity: 0.85,
  blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
})
const swirlAuraGeometry = new THREE.SphereGeometry(SWIRL_AURA_RADIUS, 14, 12)
const swirlAuraMaterial = new THREE.MeshBasicMaterial({
  color: SWIRL_CORE_COLOR, transparent: true, opacity: 0.10,
  blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
})
const swirlInnerCoreGeometry = new THREE.CylinderGeometry(SWIRL_INNER_CORE_RADIUS_TOP, SWIRL_INNER_CORE_RADIUS_BOTTOM, SWIRL_INNER_CORE_LENGTH, 6)
swirlInnerCoreGeometry.rotateX(Math.PI / 2)
const swirlInnerCoreMaterial = new THREE.MeshBasicMaterial({
  color: SWIRL_HOT_COLOR, transparent: true, opacity: 1.0,
  blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
})
const swirlPlumeGeometry = new THREE.ConeGeometry(SWIRL_PLUME_RADIUS, SWIRL_PLUME_LENGTH, 6)
swirlPlumeGeometry.rotateX(-Math.PI / 2)
const swirlPlumeMaterial = new THREE.MeshBasicMaterial({
  color: SWIRL_TRAIL_COLOR, transparent: true, opacity: 0.4,
  blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
})
const swirlExhaustGeometry = new THREE.SphereGeometry(SWIRL_EXHAUST_RADIUS, 8, 6)
const swirlExhaustMaterial = new THREE.MeshBasicMaterial({
  color: SWIRL_TRAIL_COLOR, transparent: true, opacity: 0.9,
  blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
})
function buildSwirlBlastMesh() {
  const group = new THREE.Group()

  // corpo (estático, gira só com o grupo inteiro)
  group.add(new THREE.Mesh(swirlCoreGeometry, swirlCoreMaterial))
  const tail = new THREE.Mesh(swirlTailGeometry, swirlTailMaterial)
  tail.position.z = -(SWIRL_CORE_LENGTH / 2 + SWIRL_TAIL_LENGTH / 2) * 0.55
  group.add(tail)
  const needle = new THREE.Mesh(swirlNeedleGeometry, swirlNeedleMaterial)
  needle.position.z = SWIRL_CORE_LENGTH / 2 + SWIRL_NEEDLE_LENGTH * 0.3
  group.add(needle)

  // casca dinâmica — espiral (material próprio, marcada pra update() achar) + anéis triangulares
  // em funil (cada um com sua própria velocidade de giro, marcados via userData)
  const spiral = new THREE.Mesh(swirlSpiralGeometry, swirlSpiralMaterialBase)
  spiral.userData.swirlRole = 'spiral'
  spiral.userData.spinAngle = Math.random() * Math.PI * 2
  group.add(spiral)

  for (const spec of SWIRL_RING_SPECS) {
    const ring = new THREE.Mesh(swirlRingGeometry, swirlRingMaterial)
    ring.position.z = spec.z
    ring.scale.setScalar(spec.scale)
    ring.userData.swirlRole = 'ring'
    ring.userData.spinSpeed = spec.spin
    ring.userData.spinAngle = Math.random() * Math.PI * 2
    group.add(ring)
  }

  group.add(new THREE.Mesh(swirlAuraGeometry, swirlAuraMaterial))

  // punch — núcleo branco coaxial, cauda, pontos de exaustão nas 3 quinas da base traseira
  group.add(new THREE.Mesh(swirlInnerCoreGeometry, swirlInnerCoreMaterial))
  const plume = new THREE.Mesh(swirlPlumeGeometry, swirlPlumeMaterial)
  plume.position.z = tail.position.z - SWIRL_TAIL_LENGTH * 0.4
  group.add(plume)
  for (let i = 0; i < 3; i += 1) {
    const angle = (i / 3) * Math.PI * 2
    const exhaust = new THREE.Mesh(swirlExhaustGeometry, swirlExhaustMaterial)
    exhaust.position.set(Math.cos(angle) * SWIRL_EXHAUST_DISTANCE, Math.sin(angle) * SWIRL_EXHAUST_DISTANCE, tail.position.z)
    group.add(exhaust)
  }

  return group
}

// Chamado a cada frame (só pra projéteis isPiercing) — gira a espiral e os 5 anéis funil em
// velocidades independentes (dessincronizados de propósito), por cima do giro do grupo inteiro
// (SWIRL_SPIN_RATE, aplicado no quaternion do group em update()). Também aplica o "acende mais
// forte" da espiral quando o projétil está travado em chefe/dourado.
function updateSwirlDynamicShell(projectile, dt) {
  const isHoming = !!projectile.swirlHomingTarget
  for (const child of projectile.mesh.children) {
    if (child.userData.swirlRole === 'ring') {
      child.userData.spinAngle += child.userData.spinSpeed * dt
      child.rotation.z = child.userData.spinAngle
    } else if (child.userData.swirlRole === 'spiral') {
      const spinRate = isHoming ? SWIRL_SPIRAL_SPIN_HOMING : SWIRL_SPIRAL_SPIN_BASE
      child.userData.spinAngle += spinRate * dt
      child.rotation.z = child.userData.spinAngle
      child.material = isHoming ? swirlSpiralMaterialHoming : swirlSpiralMaterialBase
    }
  }
}

const FRENZY_OFFSET_L = new THREE.Vector3(-0.8, 0, 0)
const FRENZY_OFFSET_R = new THREE.Vector3(0.8, 0, 0)
const _projOrigin = new THREE.Vector3()
const _projPrevPos = new THREE.Vector3()
const _projStep = new THREE.Vector3()
const _projDeflect = new THREE.Vector3()
const _projToSource = new THREE.Vector3()
const _projDir = new THREE.Vector3()
const _projDesired = new THREE.Vector3()
const _projAxis = new THREE.Vector3()
const _projRingPos = new THREE.Vector3()
const _steerWorldUp = new THREE.Vector3(0, 1, 0)
const _steerWorldRight = new THREE.Vector3(1, 0, 0)

// Gira `dir` (MUTA em lugar) até `desired` por no máximo `maxAngle` radianos, via rotação de
// eixo-ângulo — não Vector3.lerp entre vetores unitários, que degenera em ângulos largos (a
// magnitude do vetor interpolado encolhe perto de 90°-180°, distorcendo a taxa de giro real; foi
// exatamente esse bug que fazia o homing do Swirl Blast ultrapassar o alvo e orbitar sem nunca
// conectar). Compartilhado entre o steer de mira normal e o homing do Swirl Blast — mesma lei de
// giro limitado, único ponto de manutenção. `axisTemp` é um Vector3 reutilizável do chamador.
function steerDirectionTowardTarget(dir, desired, maxAngle, axisTemp) {
  const angle = Math.acos(THREE.MathUtils.clamp(dir.dot(desired), -1, 1))
  if (angle <= maxAngle || angle < 1e-4) {
    dir.copy(desired)
    return dir
  }
  axisTemp.crossVectors(dir, desired)
  if (axisTemp.lengthSq() <= 1e-8) {
    // dir e desired (quase) paralelos/antiparalelos — cross product degenera pra zero, não dá
    // pra derivar um eixo de giro a partir dos dois vetores. Sem isso, o passo de correção vira
    // um no-op e `dir` fica CONGELADO nessa direção indefinidamente (podia acontecer, por
    // exemplo, se um dourado travado teleportar pra trás do projétil em pleno voo). Usa qualquer
    // eixo perpendicular a `dir` como desempate — a direção do giro não importa aqui (os dois
    // lados fecham o ângulo de 180° igualmente rápido), só precisa parar de congelar.
    axisTemp.crossVectors(dir, _steerWorldUp)
    if (axisTemp.lengthSq() <= 1e-8) axisTemp.crossVectors(dir, _steerWorldRight)
  }
  axisTemp.normalize()
  dir.applyAxisAngle(axisTemp, maxAngle).normalize()
  return dir
}

export function createProjectileSystem(scene, effects, player, enemies, targets, lockon) {
  const projectiles = []
  let cooldown = 0
  // fireCooldownDuration continua LOCAL (não delegado) porque o debug "Tiro infinito" precisa
  // poder zerá-lo por fora do stat real do jogador.
  let fireCooldownDuration = DEFAULT_FIRE_COOLDOWN

  function removeProjectile(p) {
    if (p.mesh) {
      scene.remove(p.mesh)
    }
    const idx = projectiles.indexOf(p)
    if (idx !== -1) projectiles.splice(idx, 1)
  }

  function fire(origin, direction) {
    const shotDirection = direction.clone()

    const lateralAxis = new THREE.Vector3().crossVectors(shotDirection, WORLD_UP)
    if (lateralAxis.lengthSq() < 1e-4) lateralAxis.set(1, 0, 0)
    lateralAxis.normalize()

    const projectileCount = player.config.projectileCount
    const mid = (projectileCount - 1) / 2
    const visualScale = 1 + (projectileCount - 1) * PLAYER_PROJECTILE_GROWTH_PER_EXTRA
    for (let i = 0; i < projectileCount; i += 1) {
      const lateralOffset = (i - mid) * PROJECTILE_LATERAL_SPACING
      const mesh = buildPlayerShotMesh()
      mesh.position.copy(origin).addScaledVector(lateralAxis, lateralOffset)
      mesh.scale.setScalar(visualScale)
      scene.add(mesh)
      projectiles.push({
        mesh, velocity: shotDirection.clone().multiplyScalar(PROJECTILE_SPEED), traveled: 0,
        damage: PLAYER_PROJECTILE_DAMAGE, life: PLAYER_PROJECTILE_LIFETIME,
      })
    }

    if (effects) effects.muzzleFlash(origin, shotDirection)
  }

  // QoL (v0.29.4): fireSingle carrega PLAYER_PROJECTILE_DAMAGE por padrão — wingman e "giro
  // rebatedor" usam o mesmo projétil visual, mesmo dano do tiro normal por padrão.
  function fireSingle(origin, direction, damage = PLAYER_PROJECTILE_DAMAGE) {
    const mesh = buildPlayerShotMesh()
    mesh.position.copy(origin)
    scene.add(mesh)
    projectiles.push({
      mesh, velocity: direction.clone().multiplyScalar(PROJECTILE_SPEED), traveled: 0,
      damage, life: PLAYER_PROJECTILE_LIFETIME,
    })
  }

  function update(dt, aimDirection, opts = {}) {
    const allowBossOrbHit = opts.allowBossOrbHit !== false
    let enemyKills = 0
    let enemyKillPoints = 0
    let bonusKillPoints = 0
    let goldenSpecialHit = false
    let goldenSpecialHitIsHoming = false
    let goldenHitWorldPos = null
    let timeReductionMs = null
    let timeReductionWorldPos = null
    let bossDefeated = false
    let bossDefeatedIsHoming = false
    let bossHitWorldPos = null
    let bossOrbHit = false
    let squadWipe = false
    let squadWipeBonus = 0
    // log de acertos (posição, dano, se matou) — usado pelo main.js pra faíscas, flash no mesh
    // atingido e números de dano flutuantes no HUD
    const hitsLog = []

    const magnetSources = enemies && enemies.getMagnetSources ? enemies.getMagnetSources() : null

    for (let pIdx = projectiles.length - 1; pIdx >= 0; pIdx--) {
      const projectile = projectiles[pIdx]
      // QoL (v0.29.4): checa .dying direto em vez de filtrar getAlive() por projétil por frame
      if (projectile.homingTarget) {
        if (projectile.homingTarget.dying) {
          projectile.homingTarget = null
        } else {
          _projDesired.copy(projectile.homingTarget.mesh.position).sub(projectile.mesh.position).normalize()
          const speed = projectile.isMaxCharge ? HOMING_PROJECTILE_SPEED * 1.25 : HOMING_PROJECTILE_SPEED
          projectile.velocity.copy(_projDesired.multiplyScalar(speed))
        }
      } else if (aimDirection && !projectile.isHoming && !projectile.isPiercing) {
        const speed = projectile.velocity.length()
        _projDir.copy(projectile.velocity).normalize()
        steerDirectionTowardTarget(_projDir, aimDirection, PLAYER_PROJECTILE_STEER_RATE * dt, _projAxis)
        projectile.velocity.copy(_projDir).multiplyScalar(speed)
      }

      // ============================================================
      // >>> BLOCO NOVO — Enxame-Ímã: curva o tiro NORMAL quando passa perto <<<
      // ============================================================
      // Swirl Blast (R1 — perfurante em linha reta pura) nunca é deflectido pelo campo do ímã.
      if (!projectile.isHoming && !projectile.isPiercing && magnetSources && magnetSources.length > 0) {
        const speed = projectile.velocity.length()
        _projDeflect.set(0, 0, 0)
        for (const source of magnetSources) {
          _projToSource.copy(source.position).sub(projectile.mesh.position)
          const dist = _projToSource.length()
          if (dist > 1e-4 && dist < source.radius) {
            const falloff = 1 - dist / source.radius
            _projDeflect.addScaledVector(_projToSource.multiplyScalar(1 / dist), -source.strength * falloff * dt)
          }
        }
        if (_projDeflect.lengthSq() > 1e-8) {
          projectile.velocity.add(_projDeflect)
          if (projectile.velocity.lengthSq() > 1e-6) projectile.velocity.normalize().multiplyScalar(speed)
          triggerSoundCue(ENEMY_SOUND_CUES.ima_deflect_shot, { worldPos: projectile.mesh.position })
        }
      }
      // ============================================================
      // >>> FIM DO BLOCO NOVO <<<
      // ============================================================

      // Swirl Blast v2 — homing contra chefe/dourado travado no release (desvio deliberado do
      // R1 "sempre reto" original, só pra esse caso — pedido explícito do usuário). Rotação de
      // DIREÇÃO com taxa angular limitada (SWIRL_HOMING_TURN_RATE), não retargeting instantâneo
      // como o `projectile.homingTarget` genérico acima (que também sobrescreveria a VELOCIDADE
      // pro valor do teleguiado comum — errado aqui, o Swirl mantém sua própria velocidade
      // sempre). Usa rotação por eixo-ângulo (não Vector3.lerp) — lerp entre dois vetores
      // unitários degenera em ângulos largos/alvo próximo (a magnitude do vetor interpolado
      // encolhe perto de 90°-180°, distorcendo a taxa de giro real), o que fazia o projétil
      // ULTRAPASSAR o alvo e entrar num loop orbital sem nunca conectar — bug real, visto ao
      // vivo via window.__starAnki (posição do projétil oscilando 36u↔147u em torno de um chefe
      // parado, nunca fechando a distância).
      if (projectile.isPiercing && projectile.swirlHomingTarget) {
        if (projectile.swirlHomingTarget.dying) {
          const speedBeforeFreeze = projectile.velocity.length()
          projectile.swirlHomingTarget = null
          aiValidator.expect(
            'Swirl Blast congela a direção (mantendo a velocidade) quando o alvo travado morre no meio do voo',
            () => Math.abs(projectile.velocity.length() - speedBeforeFreeze) < 0.01,
            { speedBeforeFreeze, speedAfter: projectile.velocity.length() },
          )
        } else {
          const speed = projectile.velocity.length()
          _projDir.copy(projectile.velocity).normalize()
          _projDesired.copy(projectile.swirlHomingTarget.mesh.position).sub(projectile.mesh.position)
          const distToTarget = _projDesired.length()
          _projDesired.normalize()
          if (distToTarget <= SWIRL_HOMING_SNAP_RANGE) {
            projectile.velocity.copy(_projDesired).multiplyScalar(speed)
          } else {
            steerDirectionTowardTarget(_projDir, _projDesired, SWIRL_HOMING_TURN_RATE * dt, _projAxis)
            projectile.velocity.copy(_projDir).multiplyScalar(speed)
          }
        }
      }

      if (projectile.life != null) {
        projectile.life -= dt
        if (projectile.life <= 0) {
          if (projectile.isPiercing && projectile.swirlHomingTarget) {
            aiValidator.expect(
              'Swirl Blast com alvo travado (chefe/dourado) não deveria expirar por tempo de vida sem conectar — indica falha no homing',
              () => false,
              { targetKind: projectile.swirlHomingTarget.kind, traveled: projectile.traveled },
            )
          }
          removeProjectile(projectile)
          continue
        }
      }

      _projPrevPos.copy(projectile.mesh.position)
      _projStep.copy(projectile.velocity).multiplyScalar(dt)
      projectile.mesh.position.add(_projStep)
      projectile.traveled += _projStep.length()
      if (projectile.velocity.lengthSq() > 1e-6) {
        _projDir.copy(projectile.velocity).normalize()
        projectile.mesh.quaternion.setFromUnitVectors(FORWARD_AXIS, _projDir)
      }

      // Swirl Blast: giro em torno do próprio eixo de voo (§4.1). O quaternion acima é
      // recalculado do zero TODO frame só com a direção — por isso o spin não pode ser um
      // `rotation.z +=` direto (seria sobrescrito no frame seguinte); acumula o ÂNGULO num
      // campo próprio do projétil e reaplica por cima da direção a cada frame.
      if (projectile.isPiercing) {
        projectile.spinAngle += SWIRL_SPIN_RATE * dt
        projectile.mesh.rotateZ(projectile.spinAngle)
        updateSwirlDynamicShell(projectile, dt)
        if (effects && effects.swirlAfterimage) {
          projectile.afterimageTimer -= dt
          if (projectile.afterimageTimer <= 0) {
            projectile.afterimageTimer = SWIRL_AFTERIMAGE_INTERVAL
            effects.swirlAfterimage(projectile.mesh.position, projectile.mesh.quaternion)
          }
        }
      }

      if (projectile.isHoming && effects) {
        projectile.afterimageTimer -= dt
        if (projectile.afterimageTimer <= 0) {
          projectile.afterimageTimer = HOMING_AFTERIMAGE_INTERVAL
          effects.homingAfterimage(projectile.mesh.position, projectile.mesh.quaternion)
        }
        if (projectile.isMaxCharge && effects.machSpeedRing) {
          projectile.machRingTimer = (projectile.machRingTimer ?? 0) - dt
          if (projectile.machRingTimer <= 0) {
            projectile.machRingTimer = 0.08
            _projDir.copy(projectile.velocity).normalize()
            _projRingPos.copy(projectile.mesh.position).addScaledVector(_projDir, 1.2)
            effects.machSpeedRing(_projRingPos, _projDir)
          }
        }
      }

      // Swirl Blast: pipeline de colisão próprio (multi-hit, sem orbe/bônus — só inimigos), o
      // resto do bloco abaixo (orbHit/hit único/bonusHit) é do tiro normal/teleguiado.
      if (projectile.isPiercing) {
        const pierceHits = enemies.resolvePiercingProjectileHits(_projPrevPos, projectile.mesh.position, {
          damage: projectile.damage,
          piercedTargets: projectile.piercedTargets,
          goldenPiercedTargets: projectile.goldenPiercedTargets,
        })
        let stopped = false
        for (const h of pierceHits) {
          // dourado nunca entra no hitsLog (mesma exclusão de propósito do path não-perfurante
          // logo abaixo) — vira os campos goldenSpecialHit/goldenHitWorldPos em vez disso
          if (h.kind === 'golden') {
            if (h.goldenSpecialHit) {
              goldenSpecialHit = true
              goldenSpecialHitIsHoming = false
              goldenHitWorldPos = h.worldPos
            }
          } else {
            hitsLog.push({
              worldPos: h.worldPos, damage: projectile.damage, killed: h.killed,
              isHoming: false, meshRef: h.meshRef, points: h.enemyKillPoints || 0,
            })
            if (h.killed) {
              if (h.bossDefeated) {
                bossDefeated = true
                bossDefeatedIsHoming = false
                bossHitWorldPos = h.worldPos
              } else {
                enemyKills += 1
              }
            }
          }
          if (h.enemyKillPoints) enemyKillPoints += h.enemyKillPoints
          if (h.squadWipe) {
            squadWipe = true
            squadWipeBonus += (h.squadWipeBonus || 150)
          }
          // §3.2.3/§3.2.4 — chefe/dourado/fragata param o Swirl (com ou sem destruir escudo no
          // caminho); explosão de impacto no ponto de parada.
          if (h.stopProjectile) {
            stopped = true
            if (effects && effects.swirlBlastExplosion) effects.swirlBlastExplosion(h.worldPos, _projDir)
          }
        }
        if (!stopped && projectile.traveled > SWIRL_BLAST_MAX_RANGE && projectile.swirlHomingTarget) {
          aiValidator.expect(
            'Swirl Blast com alvo travado (chefe/dourado) não deveria expirar por alcance máximo sem conectar — indica falha no homing',
            () => false,
            { targetKind: projectile.swirlHomingTarget.kind, traveled: projectile.traveled },
          )
        }
        if (stopped || projectile.traveled > SWIRL_BLAST_MAX_RANGE) removeProjectile(projectile)
        continue
      }

      const hitBuffer = projectile.isHoming ? 0 : PROJECTILE_HIT_BUFFER
      const orbHit = allowBossOrbHit && !bossOrbHit ? targets.resolveBossOrbHit(_projPrevPos, projectile.mesh.position, hitBuffer) : null
      if (orbHit) {
        bossOrbHit = true
        removeProjectile(projectile)
        continue
      }

      const hit = enemies.resolveProjectileHit(_projPrevPos, projectile.mesh.position, {
        damage: projectile.damage ?? 1,
        isHoming: !!projectile.isHoming,
        hitBuffer,
      })
      if (hit) {
        if (hit.squadWipe) {
          squadWipe = true
          squadWipeBonus += (hit.squadWipeBonus || 150)
        }
        if (hit.blocked) { removeProjectile(projectile); continue }
        if (projectile.isHoming) {
          triggerSoundCue(PLAYER_SOUND_CUES.homing_impact, { worldPos: hit.worldPos, isMaxCharge: projectile.isMaxCharge })
        }
        if (projectile.isMaxCharge) {
          triggerSoundCue(PLAYER_SOUND_CUES.max_charge_splash, { worldPos: hit.worldPos, radius: MAX_CHARGE_SPLASH_RADIUS })
          const splash = enemies.applyAreaDamage(hit.worldPos, MAX_CHARGE_SPLASH_RADIUS, MAX_CHARGE_SPLASH_DAMAGE)
          if (effects) {
            if (effects.maxChargeImpact) {
              effects.maxChargeImpact(hit.worldPos, MAX_CHARGE_SPLASH_RADIUS)
            } else {
              effects.explosion(hit.worldPos, 0x3ea6ff, MAX_CHARGE_SPLASH_RADIUS, { rings: true })
            }
          }
          enemyKills += splash.enemyKills
          enemyKillPoints += splash.enemyKillPoints
          hitsLog.push(...splash.hitsLog)
          if (splash.bossDefeated) {
            bossDefeated = true
            bossDefeatedIsHoming = true
            bossHitWorldPos = splash.bossHitWorldPos
          }
        }
        if (hit.kind !== 'golden') {
          hitsLog.push({
            worldPos: hit.worldPos, damage: projectile.damage ?? 1, killed: hit.killed,
            isHoming: !!projectile.isHoming, meshRef: hit.meshRef, points: hit.enemyKillPoints || 0,
          })
          if (hit.killed) {
            if (hit.bossDefeated) {
              bossDefeated = true
              bossDefeatedIsHoming = !!projectile.isHoming
              bossHitWorldPos = hit.worldPos
            } else {
              enemyKills += 1
            }
          }
        } else if (hit.goldenSpecialHit) {
          goldenSpecialHit = true
          goldenSpecialHitIsHoming = !!projectile.isHoming
          goldenHitWorldPos = hit.worldPos
        }
        if (hit.enemyKillPoints) enemyKillPoints += hit.enemyKillPoints
        if (hit.timeReductionMs != null) { timeReductionMs = hit.timeReductionMs; timeReductionWorldPos = hit.worldPos }

        // carta "Ricochete": em vez de remover, redireciona pro inimigo vivo mais próximo
        // (excluindo o que acabou de ser atingido) — mesmo projétil, mesmo dano, um pulo a
        // menos no orçamento. Sem alvo por perto ou sem pulo sobrando, remove normalmente.
        let bounced = false
        if (projectile.isHoming && projectile.bouncesLeft > 0) {
          let nextTarget = null
          let nextDist = Infinity
          for (const candidate of enemies.getAlive()) {
            if (candidate.mesh === hit.meshRef) continue
            const d = projectile.mesh.position.distanceTo(candidate.mesh.position)
            if (d < nextDist) { nextDist = d; nextTarget = candidate }
          }
          if (nextTarget) {
            // empurrão pra fora do raio de acerto do alvo que acabou de ser atingido — sem
            // isso, o segmento (prevPos→currPos) do PRÓXIMO frame ainda começa colado nele
            // (é onde o hit resolveu) e `resolveProjectileHit` batia de novo no MESMO alvo
            // repetidas vezes seguidas em vez de viajar até o próximo (medido: 3 hits seguidos
            // no mesmo inimigo, todos na mesma posição exata).
            _projToSource.copy(nextTarget.mesh.position).sub(projectile.mesh.position)
            if (_projToSource.lengthSq() > 1e-6) {
              projectile.mesh.position.addScaledVector(_projToSource.normalize(), RICOCHET_NUDGE_DISTANCE)
            }
            if (effects && effects.ricochetArc) {
              effects.ricochetArc(hit.worldPos, nextTarget.mesh.position)
            }
            projectile.homingTarget = nextTarget
            projectile.bouncesLeft -= 1
            bounced = true
            triggerSoundCue(PLAYER_SOUND_CUES.ricochet, { worldPos: hit.worldPos, bouncesLeft: projectile.bouncesLeft })
          }
        }
        if (!bounced) removeProjectile(projectile)
        continue
      }

      const bonusHit = targets.resolveBonusHit(_projPrevPos, projectile.mesh.position, hitBuffer)
      if (bonusHit) {
        bonusKillPoints += bonusHit.points
        removeProjectile(projectile)
        continue
      }

      if (projectile.traveled > PROJECTILE_MAX_RANGE) removeProjectile(projectile)
    }

    return {
      enemyKills, enemyKillPoints, bonusKillPoints,
      goldenSpecialHit, goldenSpecialHitIsHoming, goldenHitWorldPos,
      timeReductionMs, timeReductionWorldPos, bossDefeated, bossDefeatedIsHoming, bossHitWorldPos, bossOrbHit, hitsLog,
      squadWipe, squadWipeBonus,
    }
  }

  return {
    tryFire(origin, direction, opts = {}) {
      if (cooldown > 0) return null
      const isFrenzy = !!opts.isFrenzy
      cooldown = isFrenzy ? fireCooldownDuration * 0.45 : fireCooldownDuration
      fire(origin, direction)
      triggerSoundCue(PLAYER_SOUND_CUES.laser_fire, { isFrenzy, origin })
      if (isFrenzy) {
        _projOrigin.copy(origin).add(FRENZY_OFFSET_L)
        fire(_projOrigin, direction)
        _projOrigin.copy(origin).add(FRENZY_OFFSET_R)
        fire(_projOrigin, direction)
      }
      return true
    },

    fireSingle,

    // filtro de distância nos dois caminhos (locked e cone de mira)
    // isMaxCharge: true quando o jogador segurou até a carga máxima (não só passou do mínimo pra
    // poder atirar) — nesse caso cada tiro sai com dano maior (ver HOMING_PROJECTILE_DAMAGE_MAX_CHARGE)
    //
    // QoL #3: sem nenhum alvo travado, o fallback antigo pegava os N inimigos mais próximos no
    // range, mesmo fora da mira — o tiro perseguia coisa que o jogador nem estava mirando. Agora
    // só persegue se houver inimigo dentro do CONE da mira (getEnemiesInAimCone); sem nada no
    // cone, dispara reto na direção mirada (mesmo visual, sem homingTarget).
    fireHomingShot(origin, direction, maxTargets, isMaxCharge = false) {
      const inRange = (e) => origin.distanceTo(e.mesh.position) <= MAX_HOMING_RANGE
      const locked = lockon.takeLockedTargets(inRange)
      let targetList
      let straightShot = false
      if (locked.length > 0) {
        targetList = locked.slice(0, Math.max(0, maxTargets))
      } else {
        targetList = lockon.getEnemiesInAimCone(origin, direction, maxTargets).filter(inRange)
        if (targetList.length === 0) straightShot = true
      }
      const damage = isMaxCharge ? HOMING_PROJECTILE_DAMAGE_MAX_CHARGE : HOMING_PROJECTILE_DAMAGE
      const homingSpeed = isMaxCharge ? HOMING_PROJECTILE_SPEED * 1.25 : HOMING_PROJECTILE_SPEED
      for (const target of targetList) {
        const targetDir = target.mesh.position.clone().sub(origin).normalize()
        const mesh = new THREE.Mesh(homingProjectileGeometry, isMaxCharge ? homingMaxChargeMaterial : homingProjectileMaterial)
        mesh.position.copy(origin)
        if (isMaxCharge) mesh.scale.setScalar(MAX_CHARGE_VISUAL_SCALE)
        scene.add(mesh)
        projectiles.push({
          mesh, velocity: targetDir.multiplyScalar(homingSpeed), traveled: 0,
          homingTarget: target, damage, isHoming: true, afterimageTimer: 0, isMaxCharge,
          bouncesLeft: player.config.ricochetCount ?? 0,
        })
      }
      if (straightShot) {
        const mesh = new THREE.Mesh(homingProjectileGeometry, isMaxCharge ? homingMaxChargeMaterial : homingProjectileMaterial)
        mesh.position.copy(origin)
        if (isMaxCharge) mesh.scale.setScalar(MAX_CHARGE_VISUAL_SCALE)
        scene.add(mesh)
        projectiles.push({
          mesh, velocity: direction.clone().multiplyScalar(homingSpeed), traveled: 0,
          damage, isHoming: true, afterimageTimer: 0, isMaxCharge,
          bouncesLeft: player.config.ricochetCount ?? 0,
        })
      }
      const firstDir = targetList[0] ? targetList[0].mesh.position.clone().sub(origin).normalize() : direction.clone()
      if (effects) {
        effects.muzzleFlash(origin, firstDir)
        if (isMaxCharge && effects.maxChargeRings) {
          effects.maxChargeRings(origin, firstDir)
        } else {
          effects.smokeRing(origin, firstDir)
        }
      }
      const shotsFired = targetList.length + (straightShot ? 1 : 0)
      if (shotsFired > 0) {
        triggerSoundCue(PLAYER_SOUND_CUES.homing_fire, { count: shotsFired, isMaxCharge, origin })
      }
      return shotsFired
    },

    // Swirl Blast — habilidade base (Docs/# Swirl Blast). Etapa 7: Sound Cue próprio (§4.7).
    // `bossTarget` (novo, overhaul v2): entidade chefe/dourado travada no release — quem chama
    // (combat/index.js) já filtrou por BOSS_KIND/GOLDEN_KIND, aqui só decide se ativa o homing.
    fireSwirlBlast(origin, direction, bossTarget = null) {
      const mesh = buildSwirlBlastMesh()
      mesh.position.copy(origin)
      mesh.quaternion.setFromUnitVectors(FORWARD_AXIS, direction)
      scene.add(mesh)
      if (effects && effects.swirlBlastFlash) effects.swirlBlastFlash(origin, direction, !!bossTarget)
      if (bossTarget && effects && effects.swirlLockReticle) effects.swirlLockReticle(bossTarget.mesh.position, direction)
      triggerSoundCue(PLAYER_SOUND_CUES.swirl_blast_fire, { origin })
      aiValidator.expect(
        'Swirl Blast só ativa homing quando o alvo travado é chefe ou dourado',
        () => !bossTarget || bossTarget.kind === BOSS_KIND || bossTarget.kind === GOLDEN_KIND,
        { bossTargetKind: bossTarget?.kind ?? null },
      )
      projectiles.push({
        mesh, velocity: direction.clone().multiplyScalar(SWIRL_BLAST_SPEED), traveled: 0,
        damage: SWIRL_BLAST_DAMAGE, life: SWIRL_BLAST_LIFETIME, spinAngle: 0, afterimageTimer: 0,
        isPiercing: true, piercedTargets: new Set(), goldenPiercedTargets: new Set(),
        swirlHomingTarget: bossTarget || null,
      })
      return true
    },

    // carta utilitária "giro rebatedor": projéteis inimigos dentro do raio, perto do jogador,
    // são destruídos e viram tiros do próprio jogador mirando no inimigo vivo mais próximo.
    deflectNearbyProjectiles(playerPos, radius) {
      const removedPositions = enemies.removeProjectilesNear(playerPos, radius)
      if (removedPositions.length === 0) return 0
      const alive = enemies.getAlive()
      for (const _pos of removedPositions) {
        if (alive.length === 0) continue
        let nearest = alive[0]
        let nearestDist = playerPos.distanceTo(nearest.mesh.position)
        for (const e of alive) {
          const d = playerPos.distanceTo(e.mesh.position)
          if (d < nearestDist) { nearest = e; nearestDist = d }
        }
        fireSingle(playerPos, nearest.mesh.position.clone().sub(playerPos).normalize())
      }
      return removedPositions.length
    },

    tick(dt) { cooldown = Math.max(0, cooldown - dt) },
    update,

    setFireCooldown(seconds) { fireCooldownDuration = seconds },

    clearAll() {
      for (const p of [...projectiles]) removeProjectile(p)
    },

    dispose() {
      for (const p of [...projectiles]) removeProjectile(p)
      playerShotHaloGeometry.dispose()
      playerShotHaloMaterial.dispose()
      playerShotCoreGeometry.dispose()
      playerShotCoreMaterial.dispose()
      homingProjectileGeometry.dispose()
      homingProjectileMaterial.dispose()
      homingMaxChargeMaterial.dispose()
      swirlCoreGeometry.dispose()
      swirlCoreMaterial.dispose()
      swirlTailGeometry.dispose()
      swirlTailMaterial.dispose()
      swirlNeedleGeometry.dispose()
      swirlNeedleMaterial.dispose()
      swirlSpiralGeometry.dispose()
      swirlSpiralMaterialBase.dispose()
      swirlSpiralMaterialHoming.dispose()
      swirlRingGeometry.dispose()
      swirlRingMaterial.dispose()
      swirlAuraGeometry.dispose()
      swirlAuraMaterial.dispose()
      swirlInnerCoreGeometry.dispose()
      swirlInnerCoreMaterial.dispose()
      swirlPlumeGeometry.dispose()
      swirlPlumeMaterial.dispose()
      swirlExhaustGeometry.dispose()
      swirlExhaustMaterial.dispose()
    },
  }
}