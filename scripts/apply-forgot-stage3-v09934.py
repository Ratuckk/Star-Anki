from pathlib import Path

ROOT = Path('.')


def read(path):
    return (ROOT / path).read_text(encoding='utf-8')


def write(path, text):
    (ROOT / path).write_text(text, encoding='utf-8')


def replace_once(path, old, new):
    text = read(path)
    if old not in text:
        raise RuntimeError(f'marker not found in {path}: {old[:180]!r}')
    write(path, text.replace(old, new, 1))


# ---------------------------------------------------------------------------
# Pure visual models: deterministic, unit-testable math kept outside DOM/Three.
# ---------------------------------------------------------------------------
write('src/swirl-camera-model.js', r'''const clamp01 = (value) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
const smoothstep = (t) => {
  const x = clamp01(t)
  return x * x * (3 - 2 * x)
}
const easeOutCubic = (t) => 1 - Math.pow(1 - clamp01(t), 3)
const lerp = (a, b, t) => a + (b - a) * t

export const SWIRL_CAMERA_ANTICIPATION_FRAC = 0.16
export const SWIRL_CAMERA_RELEASE_FRAC = 0.48
export const SWIRL_CAMERA_COMPRESS_DEG = -4
export const SWIRL_CAMERA_RELEASE_DEG = 8
export const SWIRL_CAMERA_ROLL_DEG = 2.4

// Curva puramente visual. A câmera comprime primeiro (projétil parece maior), dá o kick no
// release e volta exatamente a zero no fim. O caller aplica os offsets sobre o FOV que o rail
// tinha no instante do disparo, então não existe um hardcode de 70° nem drift cumulativo.
export function sampleSwirlCamera(elapsedMs, durationMs) {
  const duration = Math.max(1, Number.isFinite(durationMs) ? durationMs : 1)
  const t = clamp01((Number.isFinite(elapsedMs) ? elapsedMs : 0) / duration)

  if (t < SWIRL_CAMERA_ANTICIPATION_FRAC) {
    const u = smoothstep(t / SWIRL_CAMERA_ANTICIPATION_FRAC)
    return {
      phase: 'anticipation',
      fovOffsetDeg: lerp(0, SWIRL_CAMERA_COMPRESS_DEG, u),
      rollRad: 0,
      punchReady: false,
      progress: t,
    }
  }

  if (t < SWIRL_CAMERA_RELEASE_FRAC) {
    const u = easeOutCubic((t - SWIRL_CAMERA_ANTICIPATION_FRAC) / (SWIRL_CAMERA_RELEASE_FRAC - SWIRL_CAMERA_ANTICIPATION_FRAC))
    return {
      phase: 'release',
      fovOffsetDeg: lerp(SWIRL_CAMERA_COMPRESS_DEG, SWIRL_CAMERA_RELEASE_DEG, u),
      rollRad: (SWIRL_CAMERA_ROLL_DEG * Math.PI / 180) * Math.sin(u * Math.PI * 0.5),
      punchReady: true,
      progress: t,
    }
  }

  const u = smoothstep((t - SWIRL_CAMERA_RELEASE_FRAC) / (1 - SWIRL_CAMERA_RELEASE_FRAC))
  return {
    phase: 'return',
    fovOffsetDeg: lerp(SWIRL_CAMERA_RELEASE_DEG, 0, u),
    rollRad: (SWIRL_CAMERA_ROLL_DEG * Math.PI / 180) * (1 - u),
    punchReady: true,
    progress: t,
  }
}
''')

write('src/fog-visual-model.js', r'''export const FOG_BANK_PERIOD = 340
export const FOG_BANK_LENGTH = 95
export const FOG_BANK_FADE_MARGIN = 26

function positiveMod(value, mod) {
  return ((value % mod) + mod) % mod
}

function smoothstep01(value) {
  const t = Math.max(0, Math.min(1, value))
  return t * t * (3 - 2 * t)
}

// Intensidade visual do bolsão atual, com fade antes/depois da faixa de densidade de gameplay.
// Isso não altera o FogExp2 nem a mecânica: só alimenta estrelas intermediárias e volumes.
export function fogPocketVisualStrength(distance) {
  const local = positiveMod(Number.isFinite(distance) ? distance : 0, FOG_BANK_PERIOD)
  const center = FOG_BANK_LENGTH * 0.5
  const half = FOG_BANK_LENGTH * 0.5
  const rawDelta = Math.abs(local - center)
  const circularDelta = Math.min(rawDelta, FOG_BANK_PERIOD - rawDelta)
  const core = Math.max(0, half - 10)
  const outer = half + FOG_BANK_FADE_MARGIN
  if (circularDelta <= core) return 1
  if (circularDelta >= outer) return 0
  return 1 - smoothstep01((circularDelta - core) / (outer - core))
}

// Centros dos próximos bancos à frente do jogador. Nunca retorna offset negativo, então o
// renderer não depende de getFrameAt() aceitar amostras atrás da nave.
export function nextFogBankOffsets(distance, count = 3) {
  const n = Math.max(0, Math.trunc(count))
  const local = positiveMod(Number.isFinite(distance) ? distance : 0, FOG_BANK_PERIOD)
  const center = FOG_BANK_LENGTH * 0.5
  let first = center - local
  if (first < 6) first += FOG_BANK_PERIOD
  return Array.from({ length: n }, (_, i) => first + i * FOG_BANK_PERIOD)
}
''')

# ---------------------------------------------------------------------------
# Swirl camera choreography: base-FOV capture + deterministic phase curve.
# ---------------------------------------------------------------------------
replace_once(
    'src/game-loop.js',
    "  SWIRL_SLOW_MO_MS, SWIRL_SLOW_MO_FACTOR, SWIRL_FOV_BUMP_MS, SWIRL_FOV_TARGET,\n",
    "  SWIRL_SLOW_MO_MS, SWIRL_SLOW_MO_FACTOR, SWIRL_FOV_BUMP_MS,\n",
)
replace_once(
    'src/game-loop.js',
    "import { createDamageOrbitTracker } from './combat/damage-orbit-tracker.js'\n",
    "import { createDamageOrbitTracker } from './combat/damage-orbit-tracker.js'\nimport { sampleSwirlCamera } from './swirl-camera-model.js'\n",
)
replace_once(
    'src/game-loop.js',
    "    state.swirlSlowMoMs = Math.max(0, state.swirlSlowMoMs - rawDt * 1000)\n    state.swirlFovBumpMs = Math.max(0, state.swirlFovBumpMs - rawDt * 1000)\n",
    "    const swirlCameraWasActive = state.swirlFovBumpMs > 0\n    state.swirlSlowMoMs = Math.max(0, state.swirlSlowMoMs - rawDt * 1000)\n    state.swirlFovBumpMs = Math.max(0, state.swirlFovBumpMs - rawDt * 1000)\n",
)
old_camera = r'''    // Swirl Blast (§4.5) — FOV bump + "punch" de câmera por cima do que rail.update() acabou de
    // calcular (o lerp de FOV do boost continua rodando por baixo; isso só SOBRESCREVE o valor
    // final do frame enquanto durar, e some sozinho quando o timer zera — sem precisar "devolver
    // o controle" de propósito). Sobe linear nos primeiros 50% da janela, ease-out nos últimos 50%.
    if (state.swirlFovBumpMs > 0) {
      const elapsedMs = SWIRL_FOV_BUMP_MS - state.swirlFovBumpMs
      const halfMs = SWIRL_FOV_BUMP_MS / 2
      const bumpFrac = elapsedMs <= halfMs
        ? elapsedMs / halfMs
        : 1 - Math.pow((elapsedMs - halfMs) / halfMs, 2)
      camera.fov = 70 + bumpFrac * (SWIRL_FOV_TARGET - 70)
      camera.updateProjectionMatrix()
      camera.rotateZ(THREE.MathUtils.degToRad(3) * bumpFrac)
      // Punch de câmera "afastando" (§4.5: "offset de +1.5 no eixo Z NO INSTANTE do disparo") —
      // BUG CORRIGIDO: `camera.translateZ()` é incremento relativo ao eixo local, não um offset
      // absoluto. Chamar isso a cada frame do bump (era `translateZ(1.5 * bumpFrac)` sem guarda)
      // empilhava ~18 frames de +1.5*bumpFrac em 300ms — o lerp de `rail.update()` só corrige uma
      // fração da posição por frame, não o suficiente pra compensar, então a câmera fugia dezenas
      // de unidades pra trás da nave em vez do impulso pontual de 1.5u descrito no doc. Agora
      // dispara só UMA VEZ (no primeiro frame em que o bump fica ativo, guardado por
      // `state.swirlPunchFired`) — o lerp do rail traz a câmera de volta sozinho depois, mesma
      // dinâmica do shake de dano.
      if (!state.swirlPunchFired) {
        state.swirlPunchFired = true
        const _prePunchPos = camera.position.clone()
        camera.translateZ(1.5)
        // Regressão exata do bug corrigido acima: translateZ(1.5) tem que mover a câmera 1.5u
        // NESTE frame e só neste frame — se voltar a empilhar (ex: alguém remove a guarda de
        // `swirlPunchFired` de novo), a distância medida aqui vai estourar bem além de 1.5.
        aiValidator.expect(
          'Swirl Blast: punch de câmera desloca exatamente 1.5u, uma vez por disparo (não acumula frame a frame)',
          () => Math.abs(camera.position.distanceTo(_prePunchPos) - 1.5) < 0.01,
          { distanceMoved: camera.position.distanceTo(_prePunchPos), bumpFrac }
        )
      }
    } else if (state.swirlPunchFired) {
      state.swirlPunchFired = false
    }
'''
new_camera = r'''    // Swirl Blast — coreografia em três beats: compressão curta, release e retorno.
    // A curva é pura/testável (swirl-camera-model.js) e trabalha como OFFSET sobre o FOV que o
    // rail tinha no disparo. Isso evita o antigo hardcode 70→95, que diminuía demais o projétil,
    // e garante retorno exato sem somar transformações de FOV frame a frame.
    if (swirlCameraWasActive) {
      const elapsedMs = SWIRL_FOV_BUMP_MS - state.swirlFovBumpMs
      const cameraBeat = sampleSwirlCamera(elapsedMs, SWIRL_FOV_BUMP_MS)
      const baseFov = Number.isFinite(state.swirlCameraBaseFov) ? state.swirlCameraBaseFov : camera.fov
      camera.fov = baseFov + cameraBeat.fovOffsetDeg
      camera.updateProjectionMatrix()
      camera.rotateZ(cameraBeat.rollRad)

      if (cameraBeat.phase !== state.swirlCameraPhase) {
        state.swirlCameraPhase = cameraBeat.phase
        aiValidator.logMechanic('swirl-camera', `phase-${cameraBeat.phase}`, {
          elapsedMs, baseFov, fov: camera.fov,
        })
      }

      // O punch continua sendo um único deslocamento de 1.5u, mas só acontece no beat de
      // release, depois da compressão visual. Nunca multiplica por frame.
      if (cameraBeat.punchReady && !state.swirlPunchFired) {
        state.swirlPunchFired = true
        const _prePunchPos = camera.position.clone()
        camera.translateZ(1.5)
        aiValidator.expect(
          'Swirl Blast: punch de câmera desloca exatamente 1.5u, uma vez por disparo',
          () => Math.abs(camera.position.distanceTo(_prePunchPos) - 1.5) < 0.01,
          { distanceMoved: camera.position.distanceTo(_prePunchPos), phase: cameraBeat.phase },
        )
      }

      if (state.swirlFovBumpMs <= 0) {
        camera.fov = baseFov
        camera.updateProjectionMatrix()
        aiValidator.expect(
          'Swirl Blast: coreografia devolve exatamente o FOV capturado no disparo',
          () => Math.abs(camera.fov - baseFov) < 0.001,
          { baseFov, restoredFov: camera.fov },
        )
        aiValidator.logMechanic('swirl-camera', 'choreography-ended', { baseFov })
        state.swirlCameraBaseFov = null
        state.swirlCameraPhase = null
        state.swirlPunchFired = false
      }
    }
'''
replace_once('src/game-loop.js', old_camera, new_camera)

replace_once(
    'src/game-loop.js',
    "          state.swirlFovBumpMs = SWIRL_FOV_BUMP_MS\n          state.swirlPunchFired = false\n",
    "          state.swirlFovBumpMs = SWIRL_FOV_BUMP_MS\n          state.swirlCameraBaseFov = camera.fov\n          state.swirlCameraPhase = null\n          state.swirlPunchFired = false\n          aiValidator.expect(\n            'Swirl Blast captura um FOV-base finito antes da coreografia',\n            () => Number.isFinite(state.swirlCameraBaseFov),\n            { baseFov: state.swirlCameraBaseFov },\n          )\n          aiValidator.logMechanic('swirl-camera', 'choreography-started', {\n            baseFov: state.swirlCameraBaseFov, durationMs: SWIRL_FOV_BUMP_MS,\n          })\n",
)

replace_once(
    'src/mount-game.js',
    "    swirlFovBumpMs: 0,\n    swirlPunchFired: false, // guarda o disparo único do punch de câmera (ver game-loop.js runFrame)\n",
    "    swirlFovBumpMs: 0,\n    swirlCameraBaseFov: null,\n    swirlCameraPhase: null,\n    swirlPunchFired: false, // guarda o disparo único do punch de câmera (ver game-loop.js runFrame)\n",
)

# ---------------------------------------------------------------------------
# Arcade Tactical Draft: compact top chips, gameplay remains visible.
# Existing optional pause/bullet-time setting is deliberately NOT redesigned here.
# ---------------------------------------------------------------------------
replace_once(
    'src/flow-question.js',
    "import { WRONG_FEEDBACK_MS } from './main-constants.js'\n",
    "import { WRONG_FEEDBACK_MS } from './main-constants.js'\nimport { aiValidator } from './ai-validator.js'\n",
)
replace_once(
    'src/flow-question.js',
    "    state.phase = 'cardChoice'\n    hud.showCardChoice({\n      cards,\n",
    "    state.phase = 'cardChoice'\n    const compactArcadeDraft = !!deck?.isNoDeck\n    if (compactArcadeDraft) {\n      aiValidator.logMechanic('arcade-draft', 'compact-draft-opened', { cards: cards.map((card) => card.id) })\n    }\n    hud.showCardChoice({\n      cards,\n      compact: compactArcadeDraft,\n",
)

replace_once(
    'src/hud-game.js',
    "    showCardChoice({ cards, stats, collectedCards, onPick }) {\n      cardChoiceList.innerHTML = ''\n      cardChoiceInspector.innerHTML = ''\n",
    "    showCardChoice({ cards, stats, collectedCards, compact = false, onPick }) {\n      cardChoiceList.innerHTML = ''\n      cardChoiceInspector.innerHTML = ''\n      cardChoiceOverlay.classList.toggle('arcade-compact', !!compact)\n      const draftBadge = cardChoiceHeader.querySelector('.card-choice-badge')\n      const draftTitle = cardChoiceHeader.querySelector('.card-choice-title')\n      const draftSubtitle = cardChoiceHeader.querySelector('.card-choice-subtitle')\n      if (compact) {\n        if (draftBadge) draftBadge.textContent = 'DRAFT TÁTICO'\n        if (draftTitle) draftTitle.textContent = 'ESCOLHA RÁPIDA'\n        if (draftSubtitle) draftSubtitle.innerHTML = 'Selecione <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> · o combate continua visível'\n      } else {\n        if (draftBadge) draftBadge.textContent = 'PROTOCOLO DE RECOMPENSA TÁTICA'\n        if (draftTitle) draftTitle.textContent = 'UPGRADE DE SISTEMA DISPONÍVEL'\n        if (draftSubtitle) draftSubtitle.innerHTML = 'Selecione um aprimoramento permanente para sua nave · Teclas <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd>'\n      }\n",
)
replace_once(
    'src/hud-game.js',
    "      // QOL (Item 2 — Inspetor de Build & Atributos)\n      if (stats) {\n",
    "      // No Arcade o draft é deliberadamente compacto: sem inspetor grande cobrindo a ação.\n      // Nos modos normais o inspetor existente continua intacto.\n      // QOL (Item 2 — Inspetor de Build & Atributos)\n      if (stats && !compact) {\n",
)
replace_once(
    'src/hud-game.js',
    "      if (collectedCards && collectedCards.size > 0) {\n",
    "      if (!compact && collectedCards && collectedCards.size > 0) {\n",
)
replace_once(
    'src/hud-game.js',
    "        cardChoiceOverlay.hidden = true\n        cardChoiceInspector.innerHTML = ''\n",
    "        cardChoiceOverlay.hidden = true\n        cardChoiceOverlay.classList.remove('arcade-compact')\n        cardChoiceInspector.innerHTML = ''\n",
)
replace_once(
    'src/hud-game.js',
    "      cardChoiceOverlay.hidden = true\n      cardChoiceOverlay.querySelectorAll('.hud-expl-card-row').forEach((el) => el.remove())\n",
    "      cardChoiceOverlay.hidden = true\n      cardChoiceOverlay.classList.remove('arcade-compact')\n      cardChoiceOverlay.querySelectorAll('.hud-expl-card-row').forEach((el) => el.remove())\n",
)

css_anchor = r'''  .card-choice-header {
    text-align: center;
'''
css_insert = r'''  /* Arcade — Draft Tático: ocupa só o topo e deixa o centro da ação legível. */
  .card-choice-overlay.arcade-compact {
    justify-content: flex-start;
    gap: 0.65rem;
    padding: max(12px, 2vh) 1rem 0;
    background: linear-gradient(180deg, rgba(5, 10, 18, 0.94) 0%, rgba(5, 10, 18, 0.72) 24%, rgba(5, 10, 18, 0.12) 43%, transparent 58%);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    pointer-events: none;
  }
  .card-choice-overlay.arcade-compact .card-choice-header {
    max-width: 760px;
    pointer-events: none;
  }
  .card-choice-overlay.arcade-compact .card-choice-badge {
    margin-bottom: 0.2rem;
    padding: 0.18rem 0.65rem;
    font-size: 0.6rem;
  }
  .card-choice-overlay.arcade-compact .card-choice-title {
    margin-bottom: 0.2rem;
    font-size: 1rem;
  }
  .card-choice-overlay.arcade-compact .card-choice-subtitle {
    font-size: 0.7rem;
  }
  .card-choice-overlay.arcade-compact .card-choice-inspector {
    display: none;
  }
  .card-choice-overlay.arcade-compact .card-choice-list {
    width: min(980px, 96vw);
    max-width: 96vw;
    gap: 0.65rem;
    flex-wrap: nowrap;
    pointer-events: auto;
  }
  .card-choice-overlay.arcade-compact .roguelike-card {
    width: min(30vw, 292px);
    min-height: 118px;
    margin: 0;
    padding: 0.62rem 0.72rem;
    border-radius: 10px;
  }
  .card-choice-overlay.arcade-compact .roguelike-card:hover {
    transform: translateY(-3px) scale(1.015);
  }
  .card-choice-overlay.arcade-compact .roguelike-card .card-top-row {
    margin-bottom: 0.32rem;
  }
  .card-choice-overlay.arcade-compact .roguelike-card .card-category {
    font-size: 0.56rem;
    padding: 0.1rem 0.35rem;
  }
  .card-choice-overlay.arcade-compact .roguelike-card .card-key-badge {
    width: 21px;
    height: 21px;
    color: #ffffff;
    border-color: rgba(125, 211, 252, 0.7);
    box-shadow: 0 0 9px rgba(56, 189, 248, 0.25);
  }
  .card-choice-overlay.arcade-compact .roguelike-card .card-icon-wrap {
    width: 30px;
    height: 30px;
    margin-bottom: 0.28rem;
    border-radius: 7px;
  }
  .card-choice-overlay.arcade-compact .roguelike-card .card-icon {
    font-size: 1.1rem;
  }
  .card-choice-overlay.arcade-compact .roguelike-card .card-name {
    margin-bottom: 0.18rem;
    font-size: 0.88rem;
  }
  .card-choice-overlay.arcade-compact .roguelike-card .card-desc {
    font-size: 0.68rem;
    line-height: 1.25;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    overflow: hidden;
  }
  .card-choice-overlay.arcade-compact .hud-expl-card-row {
    pointer-events: auto;
  }

  .card-choice-header {
    text-align: center;
'''
replace_once('index.html', css_anchor, css_insert)

# ---------------------------------------------------------------------------
# Fog visual depth: intermediate stars obey FogExp2 + localized world-space bank sprites.
# Deep stars stay visible, creating the requested depth contrast.
# ---------------------------------------------------------------------------
replace_once(
    'src/environment.js',
    "import { FOG_COVERAGE_TARGET, FOG_ARENA_DENSITY_MULT, FOG_DENSITY_LERP_RATE, FOG_COLOR_LERP_RATE } from './main-constants.js'\n",
    "import { FOG_COVERAGE_TARGET, FOG_ARENA_DENSITY_MULT, FOG_DENSITY_LERP_RATE, FOG_COLOR_LERP_RATE } from './main-constants.js'\nimport { fogPocketVisualStrength, nextFogBankOffsets } from './fog-visual-model.js'\n",
)

replace_once(
    'src/environment.js',
    "function createRingTexture() {\n",
    r'''function createFogBankTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  const g = ctx.createRadialGradient(128, 128, 10, 128, 128, 128)
  g.addColorStop(0, 'rgba(132, 169, 196, 0.34)')
  g.addColorStop(0.42, 'rgba(74, 109, 138, 0.22)')
  g.addColorStop(0.75, 'rgba(40, 67, 91, 0.10)')
  g.addColorStop(1, 'rgba(20, 36, 52, 0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 256, 256)
  return new THREE.CanvasTexture(canvas)
}

function createRingTexture() {
''',
)

star_anchor = r'''  const deepStars = new THREE.Points(deepStarGeo, deepStarMat)
  environmentGroup.add(deepStars)

  // ============ 4. ESTRELAS CADENTES / METEOROS ============
'''
star_insert = r'''  const deepStars = new THREE.Points(deepStarGeo, deepStarMat)
  environmentGroup.add(deepStars)

  // Camada intermediária: diferente das estrelas profundas, participa do FogExp2. Ela é a
  // referência de profundidade que deixa a névoa perceptível sem apagar o céu inteiro.
  const MID_STAR_COUNT = 360
  const midStarGeo = new THREE.BufferGeometry()
  const midStarPos = new Float32Array(MID_STAR_COUNT * 3)
  for (let i = 0; i < MID_STAR_COUNT; i++) {
    const r = 48 + Math.random() * 145
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    midStarPos[i * 3] = r * Math.sin(phi) * Math.cos(theta)
    midStarPos[i * 3 + 1] = r * Math.cos(phi) * 0.72
    midStarPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta)
  }
  midStarGeo.setAttribute('position', new THREE.BufferAttribute(midStarPos, 3))
  const midStarMat = new THREE.PointsMaterial({
    color: 0xc7e7ff,
    size: 1.15,
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
    fog: true,
  })
  const midStars = new THREE.Points(midStarGeo, midStarMat)
  environmentGroup.add(midStars)

  // Bancos localizados: três massas à frente no trilho, reutilizadas para não alocar por frame.
  // São sprites com depth-test (não overlay de tela inteira), portanto ocupam um lugar legível no
  // espaço e podem ser vistos antes de o jogador atravessar a região de densidade maior.
  const fogBankTexture = createFogBankTexture()
  const fogBankRoots = Array.from({ length: 3 }, (_, bankIndex) => {
    const root = new THREE.Group()
    const bankSpecs = [
      [-18, 5, 58, 32, 0.9],
      [10, -7, 70, 40, 1.0],
      [24, 9, 46, 28, 0.72],
    ]
    const bankMaterials = []
    for (const [x, y, sx, sy, alpha] of bankSpecs) {
      const material = new THREE.SpriteMaterial({
        map: fogBankTexture,
        color: 0x7894aa,
        transparent: true,
        opacity: 0.18 * alpha,
        depthWrite: false,
        depthTest: true,
        fog: false,
      })
      const sprite = new THREE.Sprite(material)
      sprite.position.set(x, y, 0)
      sprite.scale.set(sx, sy, 1)
      root.add(sprite)
      bankMaterials.push({ material, alpha })
    }
    root.userData.bankMaterials = bankMaterials
    root.userData.lateral = (bankIndex - 1) * 9
    root.userData.vertical = bankIndex === 1 ? 1 : (bankIndex === 0 ? -4 : 5)
    environmentGroup.add(root)
    return root
  })

  // ============ 4. ESTRELAS CADENTES / METEOROS ============
'''
replace_once('src/environment.js', star_anchor, star_insert)

replace_once(
    'src/environment.js',
    "    deepStars.visible = ENVIRONMENT_CONFIG.enableMultiLayerStars\n    gridPulseMesh.visible = ENVIRONMENT_CONFIG.enableEnergizedGrid\n",
    "    deepStars.visible = ENVIRONMENT_CONFIG.enableMultiLayerStars\n    midStars.visible = ENVIRONMENT_CONFIG.enableMultiLayerStars\n    gridPulseMesh.visible = ENVIRONMENT_CONFIG.enableEnergizedGrid\n",
)
replace_once(
    'src/environment.js',
    "      deepStars.scale.lerp(_tmpScaleOne, 1 - Math.exp(-6 * dt))\n      }\n    }\n\n    // 3. Meteoros / Estrelas Cadentes\n",
    r'''      deepStars.scale.lerp(_tmpScaleOne, 1 - Math.exp(-6 * dt))
      }

      // A camada intermediária acompanha a câmera como um volume estelar local, mas continua
      // submetida ao fog por profundidade. Dentro do bolsão ela perde brilho progressivamente;
      // as estrelas profundas permanecem, tornando a massa de fog visualmente comparável.
      if (camera) midStars.position.copy(camera.position)
      const pocketStrength = !inArena && ENVIRONMENT_CONFIG.enableNebulaPockets
        ? fogPocketVisualStrength(rail.getDistance()) : 0
      midStarMat.opacity = 0.78 * (1 - pocketStrength * 0.58)
      midStarMat.size = boostActive ? 1.45 : 1.15
    }

    // Volumes localizados de fog: só no rail. Arena conserva leitura limpa de Boss/Dourado.
    const showFogBanks = !!ENVIRONMENT_CONFIG.enableNebulaPockets && !inArena
    const bankOffsets = showFogBanks ? nextFogBankOffsets(rail.getDistance(), fogBankRoots.length) : []
    for (let i = 0; i < fogBankRoots.length; i += 1) {
      const bank = fogBankRoots[i]
      const offset = bankOffsets[i]
      bank.visible = showFogBanks && Number.isFinite(offset) && offset < 760
      if (!bank.visible) continue
      const bankFrame = rail.getFrameAt(offset)
      bank.position.copy(bankFrame.position)
        .addScaledVector(bankFrame.right, bank.userData.lateral)
        .addScaledVector(bankFrame.up, bank.userData.vertical)
      const approach = Math.max(0.35, Math.min(1, 1 - offset / 760))
      for (const entry of bank.userData.bankMaterials) {
        entry.material.opacity = (0.12 + approach * 0.16) * entry.alpha
      }
    }

    // 3. Meteoros / Estrelas Cadentes
''',
)

replace_once(
    'src/environment.js',
    "    deepStarGeo.dispose()\n    deepStarMat.dispose()\n    meteorMat.dispose()\n",
    "    deepStarGeo.dispose()\n    deepStarMat.dispose()\n    midStarGeo.dispose()\n    midStarMat.dispose()\n    for (const bank of fogBankRoots) {\n      for (const entry of bank.userData.bankMaterials || []) entry.material.dispose()\n    }\n    fogBankTexture.dispose()\n    meteorMat.dispose()\n",
)

# ---------------------------------------------------------------------------
# Stage-3 regression suite: math + integration guards, no browser assumptions.
# ---------------------------------------------------------------------------
write('src/forgot-stage3.test.mjs', r'''import assert from 'node:assert/strict'
import fs from 'node:fs'
import { sampleSwirlCamera, SWIRL_CAMERA_RELEASE_DEG } from './swirl-camera-model.js'
import { fogPocketVisualStrength, nextFogBankOffsets, FOG_BANK_PERIOD } from './fog-visual-model.js'

const start = sampleSwirlCamera(0, 300)
const anticipation = sampleSwirlCamera(30, 300)
const release = sampleSwirlCamera(120, 300)
const end = sampleSwirlCamera(300, 300)
assert.equal(start.phase, 'anticipation')
assert.equal(start.fovOffsetDeg, 0)
assert.ok(anticipation.fovOffsetDeg < 0, 'anticipation must compress FOV')
assert.equal(release.phase, 'release')
assert.ok(release.fovOffsetDeg > 0, 'release must open after the compression beat')
assert.ok(release.fovOffsetDeg <= SWIRL_CAMERA_RELEASE_DEG + 1e-9)
assert.equal(end.phase, 'return')
assert.ok(Math.abs(end.fovOffsetDeg) < 1e-9, 'camera curve must end on exact base FOV')
assert.ok(Math.abs(end.rollRad) < 1e-9, 'camera curve must end with zero added roll')

assert.ok(fogPocketVisualStrength(47.5) > 0.99, 'fog bank center should read as dense')
assert.ok(fogPocketVisualStrength(170) < 0.01, 'space between banks should remain clear')
assert.ok(fogPocketVisualStrength(47.5 + FOG_BANK_PERIOD) > 0.99, 'fog visual must be periodic')
const offsets = nextFogBankOffsets(50, 4)
assert.equal(offsets.length, 4)
assert.ok(offsets.every((v) => v >= 0), 'bank sampling must never ask rail for a negative offset')
for (let i = 1; i < offsets.length; i += 1) assert.equal(offsets[i] - offsets[i - 1], FOG_BANK_PERIOD)

const flow = fs.readFileSync(new URL('./flow-question.js', import.meta.url), 'utf8')
const hud = fs.readFileSync(new URL('./hud-game.js', import.meta.url), 'utf8')
const loop = fs.readFileSync(new URL('./game-loop.js', import.meta.url), 'utf8')
const env = fs.readFileSync(new URL('./environment.js', import.meta.url), 'utf8')
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8')
assert.match(flow, /compact:\s*compactArcadeDraft/)
assert.match(hud, /arcade-compact/)
assert.match(html, /\.card-choice-overlay\.arcade-compact/)
assert.match(loop, /sampleSwirlCamera\(/)
assert.match(loop, /swirlCameraBaseFov/)
assert.doesNotMatch(loop, /camera\.fov\s*=\s*70\s*\+/)
assert.match(env, /fog:\s*true/)
assert.match(env, /nextFogBankOffsets/)
assert.match(env, /fogBankRoots/)

console.log('forgot stage 3 tests: ok')
''')

print('forgot stage 3 migration applied')
