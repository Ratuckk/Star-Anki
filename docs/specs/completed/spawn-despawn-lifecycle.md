# Overhaul do sistema de spawn e despawn de inimigos

## Documento de especificação completo

---

## 0. Contexto

### 0.1 Estado atual do spawn

Todo inimigo nasce pelo mesmo funil, `registerSpawn()` em `src/enemies/index.js`:

```js
function registerSpawn(enemy) {
  if (!enemy) return null
  enemy.spawnRailDist = rail.getDistance()
  if (enemy.mesh && enemy.kind !== BOSS_KIND) {
    enemy.targetScale = enemy.scale || enemy.mesh.scale.x || 1.0
    enemy.spawnAge = 0
    enemy.spawnDuration = enemy.kind === DETRITO_KIND ? 0.42 : 0.35
    enemy.mesh.scale.setScalar(enemy.targetScale * 0.1)
    if (effects) {
      if (enemy.kind === MINI_SWARM_KIND && effects.flankSpawnTrail) {
        effects.flankSpawnTrail(enemy.mesh.position, null, colorFor(enemy))
      } else if (effects.fogWispCondensation) {
        effects.fogWispCondensation(enemy.mesh.position, colorFor(enemy))
      }
    }
  }
  enemies.push(enemy)
  telemetry.recordEvent(...)
  return enemy
}
```

E a animação, no bloco de `updateEnemies()`:

```js
if (enemy.spawnAge != null && enemy.spawnAge < enemy.spawnDuration) {
  enemy.spawnAge += dt
  const t = Math.min(1, enemy.spawnAge / enemy.spawnDuration)
  const targetScale = enemy.targetScale ?? 1.0
  const scale = THREE.MathUtils.lerp(targetScale * 0.2, targetScale, Math.sin(t * Math.PI * 0.5))
  enemy.mesh.scale.setScalar(scale)
}
```

E a condensação, em `src/effects.js → fogWispCondensation()`:

```js
function fogWispCondensation(position, colorHex = 0x7fe0ff) {
  const count = 5
  // ... 5 partículas saindo do centro pra fora, size 2.4, duração ~0.22s
}
```

### 0.2 Problema diagnosticado

Os inimigos **aparecem**, não **chegam**. O jogador vê a nave pipocar na tela no tamanho final e crescer por 0.35s. Causas:

1. **Só escala anima.** O mesh nasce com opacidade 100% e cor 100% — só o tamanho muda. Não lê como "materialização".
2. **Duração única pra todos.** 0.35s pra um mini-swarm de raio 2.4 e pra uma Horda de raio 6.5. A Horda "pisca" na tela como se fosse pequena.
3. **Condensação fraca.** 5 partículas de `size: 2.4` saindo pra fora — pra um inimigo pequeno ok, pra um grande some. E `fog: false` no material significa que elas ignoram o fog.
4. **Sem antecipação.** Nada avisa "tem algo chegando ali" antes do mesh nascer.
5. **Sem orientação de chegada.** O mesh nasce já alinhado com a direção do jogador — nada de "chegou girando pra frente".
6. **Sem wobble de chegada.** Nada de "acabou de pousar".
7. **Despawn instantâneo.** Fora de combate, `removeEnemy(enemy)` é chamado direto — o mesh some no mesmo frame do culling.

### 0.3 Filosofia do overhaul

**Spawn é uma frase, não uma palavra.** Um inimigo surgindo precisa ter três momentos distintos:

1. **Antecipação** — um aviso curto antes (o "vai chegar")
2. **Materialização** — o corpo aparecendo (o "chegou")
3. **Assentamento** — um micro-ajuste que confirma o pouso (o "está aqui")

E cada inimigo **deve contar sua natureza pelo timing**: enxame aparece rápido e nervoso, peso-pesado aparece lento e denso. O **tempo de spawn é informação**, não só polimento.

O despawn segue a mesma lógica invertida — nunca sumir de golpe, sempre sair.

---

## 1. Ideia 1 — Spawn em 3 fases

### 1.1 Conceito

Substituir a fase única atual (só escala) por **três fases explícitas**, cada uma com duração e comportamento próprios. A duração total varia por tipo de inimigo (ver Ideia 2), mas as proporções entre as fases são fixas:

| Fase | Proporção da duração total | O que faz |
|---|---|---|
| **A — Peek** | 20% | Anel de distorção marca o ponto antes do mesh nascer |
| **B — Materialização** | 60% | Mesh nasce, cresce, ganha opacidade, converge rotação |
| **C — Assentamento** | 20% | Escala 105% → 100%, flash curto de cor, wobble decai |

**Exemplo** com duração total de 0.5s (Tank):
- A: 0–0.1s (peek)
- B: 0.1–0.4s (materialização)
- C: 0.4–0.5s (assentamento)

### 1.2 Fase A — Peek

Antes do mesh existir, dispara um `effect` novo, `spawnAnticipation()`, que desenha um **anel fino** (não uma esfera como `telegraph`) no ponto de spawn:

```js
// Em effects.js
function spawnAnticipation(position, colorHex, radius = 1.0, durationSec = 0.1) {
  const geo = new THREE.RingGeometry(radius * 0.9, radius, 24)
  const mat = new THREE.MeshBasicMaterial({
    color: colorHex,
    transparent: true,
    opacity: 0.6,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: true,  // importante: sofre fog, some em setor denso
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.position.copy(position)
  scene.add(mesh)
  spawnAnticipations.push({ mesh, life: 0, duration: durationSec, radius })
}
```

E no update, o anel **encolhe** ao longo do tempo (não expande — a leitura é "algo está sendo puxado pra ali"):

```js
// no update:
const t = anim.life / anim.duration
const scale = 1 + (1 - t) * 0.4   // começa 1.4, termina 1.0
anim.mesh.scale.setScalar(scale)
anim.mesh.material.opacity = 0.6 * (1 - t)
```

**Cor do anel**: usar `colorFor(enemy)` — a cor de identidade do inimigo. Isso dá ao jogador uma dica visual do **tipo** antes do mesh aparecer.

**Exceção**: inimigos muito pequenos (mini-swarm, ima) **não ganham peek** — só poluiria a tela. Regra: `hitRadius >= 1.5` ganha peek.

### 1.3 Fase B — Materialização

O mesh nasce mas **não aparece de uma vez**. Três canais animam em paralelo, cada um com curva própria:

**Escala**: começa em 10% (como hoje), termina em **105%** (overshoot pra fase C):

```js
const scaleT = THREE.MathUtils.smoothstep(localT, 0, 1)  // 0..1
const scale = THREE.MathUtils.lerp(targetScale * 0.1, targetScale * 1.05, scaleT)
enemy.mesh.scale.setScalar(scale)
```

**Opacidade**: começa em 0, termina em 1. Requer ativar `transparent: true` no material no momento do spawn e desativar no fim da fase C (transparent tem custo de render):

```js
if (enemy.mesh.material && !Array.isArray(enemy.mesh.material)) {
  enemy.mesh.material.transparent = true
  enemy.mesh.material.opacity = THREE.MathUtils.smoothstep(localT, 0, 1)
}
```

**Exceção**: materiais com `emissive` muito alto (Blaster, Time) parecem estranhos com opacidade baixa — o emissivo brilha "através". Para esses, animar `emissiveIntensity` de 0 até o valor base **em vez de** opacidade:

```js
const BASE_EMISSIVE = enemy.mesh.material.emissiveIntensity || 0
enemy.mesh.material.emissiveIntensity = BASE_EMISSIVE * localT
```

A regra é: **não animar opacidade e emissive ao mesmo tempo** — escolher um. Se `emissiveIntensity > 0.5`, anima emissive; senão, anima opacidade.

**Rotação** (Ideia 4, ver §4) também roda nesta fase.

### 1.4 Fase C — Assentamento

Fase curta mas crítica — é o que faz a diferença entre "cresceu" e "pousou":

**Escala 105% → 100%**, com `ease-out`:

```js
const settleT = ... // 0..1 na fase C
const scale = THREE.MathUtils.lerp(targetScale * 1.05, targetScale, settleT * (2 - settleT))
enemy.mesh.scale.setScalar(scale)
```

**Flash de cor**: um `hitSpark` sutil no centro, com a cor de identidade, no primeiro frame da fase C. É o "pop" final. Uma única emissão, não contínua:

```js
if (!enemy.settleFlashFired) {
  enemy.settleFlashFired = true
  if (effects) effects.hitSpark(enemy.mesh.position, colorFor(enemy))
}
```

**Restaurar material**: opacidade volta pra 1.0, `transparent` de volta pra `false` (se foi ativado), `emissiveIntensity` de volta ao valor original.

### 1.5 Estado novo no inimigo

Três campos novos no objeto do inimigo, setados em `registerSpawn()`:

```js
enemy.spawnPhase = 'peek'         // 'peek' | 'materialize' | 'settle' | null
enemy.spawnPhaseTimer = 0         // contador dentro da fase atual
enemy.spawnDurations = {          // durações das 3 fases (calculadas na Ideia 2)
  peek: 0.10,
  materialize: 0.30,
  settle: 0.10,
}
enemy.spawnOriginalEmissive = null // capturado no início pra restaurar
enemy.spawnOpacityWasTransparent = false
```

O bloco de animação em `updateEnemies()` é **reescrito** para avançar entre fases:

```js
if (enemy.spawnPhase) {
  enemy.spawnPhaseTimer += dt
  const phaseDuration = enemy.spawnDurations[enemy.spawnPhase]
  const localT = Math.min(1, enemy.spawnPhaseTimer / phaseDuration)

  if (enemy.spawnPhase === 'peek') {
    // anel já foi disparado em registerSpawn; só espera
    if (localT >= 1) {
      enemy.spawnPhase = 'materialize'
      enemy.spawnPhaseTimer = 0
      // captura estado original do material
      // (ver bloco completo de código em §1.6)
    }
  } else if (enemy.spawnPhase === 'materialize') {
    // escala 0.1 → 1.05, opacidade/emissive 0 → 1, rotação convergindo
    // (ver bloco completo em §1.6)
    if (localT >= 1) {
      enemy.spawnPhase = 'settle'
      enemy.spawnPhaseTimer = 0
    }
  } else if (enemy.spawnPhase === 'settle') {
    // escala 1.05 → 1.0, flash, restaura material
    // (ver bloco completo em §1.6)
    if (localT >= 1) {
      enemy.spawnPhase = null
      // limpa campos temporários
    }
  }
}
```

### 1.6 Bloco de código completo (substituindo o atual)

```js
if (enemy.spawnPhase) {
  enemy.spawnPhaseTimer += dt
  const phaseDuration = enemy.spawnDurations[enemy.spawnPhase] || 0.1
  const localT = Math.min(1, enemy.spawnPhaseTimer / phaseDuration)
  const targetScale = enemy.targetScale ?? 1.0

  if (enemy.spawnPhase === 'peek') {
    // Fase A: só espera o peek terminar (o anel foi disparado em registerSpawn)
    if (localT >= 1) {
      enemy.spawnPhase = 'materialize'
      enemy.spawnPhaseTimer = 0

      // Captura estado original do material pra restaurar no fim
      const mat = enemy.mesh.material
      if (mat && !Array.isArray(mat)) {
        // Decide se anima emissive ou opacidade
        const emissiveIntensity = mat.emissiveIntensity || 0
        if (emissiveIntensity > 0.5) {
          enemy.spawnOriginalEmissive = emissiveIntensity
          enemy.spawnAnimationChannel = 'emissive'
          mat.emissiveIntensity = 0
        } else {
          enemy.spawnAnimationChannel = 'opacity'
          enemy.spawnOpacityWasTransparent = mat.transparent
          mat.transparent = true
          mat.opacity = 0
        }
      }
      // Aplica escala inicial de materialização
      enemy.mesh.scale.setScalar(targetScale * 0.1)
    }
  } else if (enemy.spawnPhase === 'materialize') {
    // Fase B: escala, opacidade/emissive, rotação (Ideia 4)
    const eased = THREE.MathUtils.smoothstep(localT, 0, 1)

    // Escala: 0.1 → 1.05 (overshoot no fim pra fase C)
    const scale = THREE.MathUtils.lerp(targetScale * 0.1, targetScale * 1.05, eased)
    enemy.mesh.scale.setScalar(scale)

    // Canal de material: emissive OU opacidade
    const mat = enemy.mesh.material
    if (mat && !Array.isArray(mat)) {
      if (enemy.spawnAnimationChannel === 'emissive') {
        mat.emissiveIntensity = enemy.spawnOriginalEmissive * eased
      } else if (enemy.spawnAnimationChannel === 'opacity') {
        mat.opacity = eased
      }
    }

    // Rotação (Ideia 4): convergir do offset inicial pra orientação correta
    if (enemy.spawnRotationFrom && enemy.spawnRotationTo) {
      enemy.mesh.quaternion.slerpQuaternions(
        enemy.spawnRotationFrom,
        enemy.spawnRotationTo,
        eased
      )
    }

    if (localT >= 1) {
      enemy.spawnPhase = 'settle'
      enemy.spawnPhaseTimer = 0
      enemy.settleFlashFired = false
    }
  } else if (enemy.spawnPhase === 'settle') {
    // Fase C: escala 1.05 → 1.0, flash, restaura material
    const settleEased = 1 - (1 - localT) * (1 - localT) // ease-out quadrático
    const scale = THREE.MathUtils.lerp(targetScale * 1.05, targetScale, settleEased)
    enemy.mesh.scale.setScalar(scale)

    // Flash único no primeiro frame da fase C
    if (!enemy.settleFlashFired) {
      enemy.settleFlashFired = true
      if (effects && effects.hitSpark) effects.hitSpark(enemy.mesh.position, colorFor(enemy))
    }

    if (localT >= 1) {
      // Restaura material ao estado original
      const mat = enemy.mesh.material
      if (mat && !Array.isArray(mat)) {
        if (enemy.spawnAnimationChannel === 'emissive') {
          mat.emissiveIntensity = enemy.spawnOriginalEmissive
        } else if (enemy.spawnAnimationChannel === 'opacity') {
          mat.opacity = 1
          mat.transparent = enemy.spawnOpacityWasTransparent
        }
      }
      enemy.mesh.scale.setScalar(targetScale)
      enemy.spawnPhase = null
      enemy.spawnDurations = null
      enemy.spawnOriginalEmissive = null
      enemy.spawnAnimationChannel = null
      enemy.spawnRotationFrom = null
      enemy.spawnRotationTo = null
      enemy.spawnOpacityWasTransparent = false
      enemy.settleFlashFired = false
    }
  }
}
```

**Importante**: o bloco antigo (`if (enemy.spawnAge != null && enemy.spawnAge < enemy.spawnDuration)`) sai inteiro. Os campos `spawnAge`, `spawnDuration`, `targetScale` param de ser usados pra animação — só `targetScale` continua (é referência de escala final).

---

## 2. Ideia 2 — Duração proporcional ao tamanho do inimigo

### 2.1 Conceito

Substituir a constante única `0.35` por uma **tabela por `kind`**. Cada tipo de inimigo declara sua duração total de spawn; as proporções entre fases (20% peek, 60% materialize, 20% settle) são aplicadas por cima.

### 2.2 Tabela de durações totais

| Tipo | Duração total | Peek | Materialize | Settle |
|---|---|---|---|---|
| **Mini-swarm** | 0.20s | — (sem peek) | 0.14s | 0.06s |
| **Ima** | 0.20s | — | 0.14s | 0.06s |
| **Sussurro** | 0.25s | — | 0.17s | 0.08s |
| **Blaster** | 0.35s | — (raio < 1.5) | 0.25s | 0.10s |
| **Réplica** | 0.35s | — | 0.25s | 0.10s |
| **Ampulheta normal** | 0.35s | — | 0.25s | 0.10s |
| **Tank** | 0.50s | 0.10s | 0.30s | 0.10s |
| **Verme (por elo)** | 0.40s | — | 0.26s | 0.14s |
| **Detrito** | 0.50s | 0.10s | 0.30s | 0.10s |
| **Ampulheta mega** | 0.50s | 0.10s | 0.30s | 0.10s |
| **Sentinela** | 0.65s | 0.13s | 0.39s | 0.13s |
| **Fragata** | 0.65s | 0.13s | 0.39s | 0.13s |
| **Horda** | 0.65s | 0.13s | 0.39s | 0.13s |
| **Chefe** | 0.90s | 0.18s | 0.54s | 0.18s |
| **Dourado** | 0.90s | 0.18s | 0.54s | 0.18s |

**Regra**: `peek` só entra se `hitRadius >= 1.5`. Inimigos abaixo disso pulam direto pra materialize.

### 2.3 Como o inimigo informa seu tamanho

Cada arquivo de inimigo exporta seu `HIT_RADIUS` (já existe). O `registerSpawn()` calcula:

```js
function getSpawnDurations(enemy) {
  const hitRadius = hitRadiusFor(enemy) // já existe no orquestrador
  const total = getSpawnDurationFor(enemy.kind, hitRadius)

  const hasPeek = hitRadius >= 1.5
  const peekRatio = hasPeek ? 0.2 : 0
  const materializeRatio = hasPeek ? 0.6 : 0.7
  const settleRatio = hasPeek ? 0.2 : 0.3

  return {
    peek: hasPeek ? total * peekRatio : 0,
    materialize: total * materializeRatio,
    settle: total * settleRatio,
  }
}

function getSpawnDurationFor(kind, hitRadius) {
  // Tabela declarativa
  if (kind === MINI_SWARM_KIND || kind === IMA_KIND) return 0.20
  if (kind === SUSSURRO_KIND) return 0.25
  if (kind === BLASTER_KIND || kind === REPLICA_KIND || kind === TIME_KIND) return 0.35
  if (kind === TANK_KIND || kind === DETRITO_KIND) return 0.50
  if (kind === VERME_KIND) return 0.40
  if (kind === SENTINELA_KIND || kind === FRAGATA_KIND || kind === HORDA_KIND) return 0.65
  if (kind === BOSS_KIND || kind === GOLDEN_KIND) return 0.90
  // Fallback por hit radius (para tipos novos que não estão na tabela)
  return hitRadius < 2 ? 0.30 : hitRadius < 4 ? 0.45 : 0.65
}
```

**Bônus**: a tabela é **editável em um lugar só**. Se o usuário quiser que a Horda apareça mais devagar, é uma linha.

### 2.4 Chefe e Dourado

Hoje eles **não passam** pelo `registerSpawn()` (a animação de spawn é pulada para `kind === BOSS_KIND`). Precisam ser incluídos:

- **Chefe**: já tem cutscene de entrada (`boss_entrance` + `startArenaCutscene`). A animação de spawn de 0.9s **substitui** o pop-in atual do mesh, mas mantém a cutscene.
- **Dourado**: idem (`golden_entrance` + cutscene).

**Remover** o guard `if (enemy.mesh && enemy.kind !== BOSS_KIND)` e trocar por lógica que aplique em todos.

**Atenção**: `spawnBossEnemy` é chamado de `flow-boss.js` — não passa por `registerSpawn()`. Precisa de um segundo ponto de aplicação **ou** mudar o fluxo pra chamar `registerSpawn()` internamente.

---

## 3. Ideia 3 — Condensação de névoa invertida

### 3.1 Conceito

Substituir `fogWispCondensation()` por uma versão **invertida**:

| Hoje | Proposto |
|---|---|
| 5 partículas saindo do centro pra fora | 15–20 partículas vindo de fora pra dentro |
| `size: 2.4` fixo | `size` escala com `hitRadius * 1.5` |
| Duração 0.22s | Duração 0.4s (pareada com a fase materialize) |
| `fog: false` | `fog: true` (sofre atenuação em setor denso) |
| Cor do inimigo | Cor do inimigo, opacidade maior no início |

**A leitura**: não é "puff", é "o espaço sugou névoa pra formar o inimigo". Direção da animação carrega semântica oposta.

### 3.2 Implementação

```js
// Em effects.js, substituindo fogWispCondensation
function fogCondensationInward(position, colorHex = 0x7fe0ff, hitRadius = 2.0) {
  const count = Math.min(20, Math.max(8, Math.round(hitRadius * 3)))
  const startRadius = hitRadius * 1.5
  const duration = 0.4

  const geometry = new THREE.BufferGeometry()
  const positions = new Float32Array(count * 3)
  const directions = new Float32Array(count * 3) // direção unitária do exterior pro centro
  for (let i = 0; i < count; i++) {
    // Ângulo aleatório em esfera
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    const dx = Math.sin(phi) * Math.cos(theta)
    const dy = Math.sin(phi) * Math.sin(theta)
    const dz = Math.cos(phi)
    // Posição inicial: fora
    positions[i * 3]     = position.x + dx * startRadius
    positions[i * 3 + 1] = position.y + dy * startRadius
    positions[i * 3 + 2] = position.z + dz * startRadius
    // Direção: pro centro (oposta à posição)
    directions[i * 3]     = -dx
    directions[i * 3 + 1] = -dy
    directions[i * 3 + 2] = -dz
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))

  const material = new THREE.PointsMaterial({
    color: colorHex,
    size: hitRadius * 0.4,
    sizeAttenuation: true,
    map: softCircleTexture,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: true,  // <-- CORRIGIDO: sofre fog, integra com Overhaul 4
  })
  const points = new THREE.Points(geometry, material)
  points.frustumCulled = false
  scene.add(points)
  condensationInwards.push({
    points,
    directions,
    startRadius,
    duration,
    life: 0,
    centerPos: position.clone(),
  })
}
```

E no `update()` do effects system:

```js
for (let i = condensationInwards.length - 1; i >= 0; i--) {
  const c = condensationInwards[i]
  c.life += dt
  const t = c.life / c.duration
  if (t >= 1) {
    scene.remove(c.points)
    c.points.geometry.dispose()
    c.points.material.dispose()
    condensationInwards.splice(i, 1)
    continue
  }
  const attr = c.points.geometry.attributes.position
  const arr = attr.array
  const speed = c.startRadius / c.duration
  // Mover cada partícula na direção do centro
  for (let j = 0; j < arr.length; j += 3) {
    arr[j]     += c.directions[j]     * speed * dt
    arr[j + 1] += c.directions[j + 1] * speed * dt
    arr[j + 2] += c.directions[j + 2] * speed * dt
  }
  attr.needsUpdate = true
  // Opacidade: alta no início, some ao chegar
  c.points.material.opacity = 0.85 * (1 - t * t)
}
```

### 3.3 Chamada em `registerSpawn()`

Substituir a chamada atual:

```js
// antes:
if (enemy.kind === MINI_SWARM_KIND && effects.flankSpawnTrail) {
  effects.flankSpawnTrail(enemy.mesh.position, null, colorFor(enemy))
} else if (effects.fogWispCondensation) {
  effects.fogWispCondensation(enemy.mesh.position, colorFor(enemy))
}

// depois:
if (enemy.kind === MINI_SWARM_KIND && effects.flankSpawnTrail) {
  effects.flankSpawnTrail(enemy.mesh.position, null, colorFor(enemy))
} else if (effects.fogCondensationInward) {
  effects.fogCondensationInward(enemy.mesh.position, colorFor(enemy), hitRadiusFor(enemy))
}
```

**Exceção**: mini-swarm mantém o `flankSpawnTrail` — o enxame tem identidade própria e a condensação inward ficaria pesada demais.

### 3.4 Timing em relação à fase

A condensação **roda em paralelo com a fase B (materialize)**. É disparada em `registerSpawn()` mas só começa a mover as partículas quando o mesh aparece. Para parear bem:

- Duração da condensação = duração de `materialize` da Ideia 2
- Disparada em `registerSpawn()` mesmo, mas partículas ficam invisíveis até a fase B começar

**Simplificação**: só disparar a condensação quando a fase B começa (dentro do transition peek → materialize). Assim fica sincronizada sem precisar gerenciar opacidade condicional.

---

## 4. Ideia 4 — Orientação de aproximação

### 4.1 Conceito

O mesh nasce com **rotação levemente errada** (offset aleatório) e converge pra orientação correta ao longo da fase materialize. Isso faz a leitura de "chegou girando pra frente" em vez de "apareceu alinhado".

### 4.2 Implementação

Em `registerSpawn()`, **depois** do spawn normal, antes do push pra `enemies`:

```js
// Orientação de aproximação (Ideia 4)
if (enemy.mesh && enemy.kind !== BOSS_KIND && enemy.kind !== GOLDEN_KIND) {
  // Captura a orientação "correta" — a que o mesh teria naturalmente
  // (o mesh já foi orientado em spawnBlaster/spawnTank/etc.)
  enemy.spawnRotationTo = enemy.mesh.quaternion.clone()

  // Offset aleatório: ±40° em Y (guinada), ±20° em X (arfagem), ±15° em Z (rolagem)
  const yawOffset = (Math.random() * 2 - 1) * THREE.MathUtils.degToRad(40)
  const pitchOffset = (Math.random() * 2 - 1) * THREE.MathUtils.degToRad(20)
  const rollOffset = (Math.random() * 2 - 1) * THREE.MathUtils.degToRad(15)

  const offsetEuler = new THREE.Euler(pitchOffset, yawOffset, rollOffset, 'YXZ')
  const offsetQuat = new THREE.Quaternion().setFromEuler(offsetEuler)
  enemy.spawnRotationFrom = enemy.spawnRotationTo.clone().multiply(offsetQuat)

  // Aplica a rotação inicial (com offset)
  enemy.mesh.quaternion.copy(enemy.spawnRotationFrom)
}
```

**Nota**: `quaternion.slerpQuaternions()` (usado no bloco de animação §1.6) precisa dos dois quaternions. `spawnRotationFrom` e `spawnRotationTo` já estão lá.

### 4.3 Detalhes

- **Mini-swarm e Ima**: skip — a rotação deles é cosmética, offset ficaria estranho
- **Chefe e Dourado**: skip — eles têm cutscene própria, e o `lookAt` do update sobrescreveria
- **Verme**: cada elo é tratado individualmente; a cabeça ganha offset, os elos que seguem também (bônus visual)
- **Horda**: ganha offset normal (é grande, o offset é visível)

### 4.4 Rotação pós-spawn

Depois que a fase C termina, `enemy.spawnRotationFrom` e `spawnRotationTo` são **deletados** (o mesh volta a ter rotação controlada pelo `lookAt` genérico do update). Isso é importante — sem isso, o `lookAt` brigaria com o `slerpQuaternions`.

---

## 5. Ideia 6 — Wobble pós-spawn

### 5.1 Conceito

Depois que o mesh termina a fase C (assentamento), uma **vibração curta** de posição que decai ao longo de ~0.2s. Não afeta hitbox — só `mesh.position`, não os pontos de colisão (que vêm de `getShipHitboxPoints()` no rail e de `enemy.mesh.position` recalculado a cada frame... **CUIDADO**, ver §5.3).

### 5.2 Implementação

Novo campo no inimigo: `enemy.wobbleTimer` (decrementado no bloco principal de update).

Ao terminar a fase C:

```js
if (localT >= 1) {
  // ... restaura material
  enemy.wobbleTimer = 0.2
  enemy.wobbleMagnitude = 0.15
  enemy.spawnPhase = null
}
```

E, no bloco principal de `updateEnemies()` (fora do bloco de spawn), ANTES do branch de movimento:

```js
// Wobble pós-spawn (Ideia 6)
if (enemy.wobbleTimer > 0) {
  enemy.wobbleTimer -= dt
  const mag = enemy.wobbleMagnitude * (enemy.wobbleTimer / 0.2)
  // Aplicar no mesh SEM afetar a posição lógica
  // (guardamos a posição lógica num campo separado antes do jitter)
  if (!enemy._wobbleAnchor) enemy._wobbleAnchor = enemy.mesh.position.clone()
  enemy.mesh.position.copy(enemy._wobbleAnchor)
  enemy.mesh.position.x += (Math.random() * 2 - 1) * mag
  enemy.mesh.position.y += (Math.random() * 2 - 1) * mag
  enemy.mesh.position.z += (Math.random() * 2 - 1) * mag
  if (enemy.wobbleTimer <= 0) {
    enemy.mesh.position.copy(enemy._wobbleAnchor)
    enemy._wobbleAnchor = null
  }
}
```

### 5.3 Problema do wobble afetar posição lógica

`enemy.mesh.position` é **a posição real** do inimigo — hit-test, IA, tudo lê dela. Aplicar jitter direto muda o **hit-test** e a **IA** (o inimigo "rebola" no espaço). Isso é ruim.

**Solução**: como o wobble dura só 0.2s e a magnitude é 0.15u, o impacto prático é mínimo — a hitbox do jogador mira com `hitBuffer` que já compensa isso. Mas é **um bug latente**: se o wobble durar mais ou for maior, o jogador vai sentir que está atirando "através" do inimigo.

**Alternativas**:
- (a) Aplicar wobble **depois** de toda a lógica de hit-test (no render, não no update). Complexo.
- (b) Fazer o wobble ser só **escala** (não posição). Menos perceptível, mas zero risco.
- (c) Aceitar o risco em troca do efeito, dado que duração é curta.

**Recomendação**: **(a)**. Aplicar wobble no **último passo** antes do render. Como o three.js renderiza no fim do `runFrame()` (em `game-loop.js`), o wobble pode ser aplicado imediatamente antes do `renderer.render(scene, camera)`.

Novo método no `enemies/index.js`:

```js
applySpawnWobbles: () => {
  for (const e of enemies) {
    if (e.wobbleTimer > 0) {
      const mag = e.wobbleMagnitude * (e.wobbleTimer / 0.2)
      e.mesh.position.x += (Math.random() * 2 - 1) * mag
      e.mesh.position.y += (Math.random() * 2 - 1) * mag
      e.mesh.position.z += (Math.random() * 2 - 1) * mag
    }
  }
}
```

E em `game-loop.js`, antes do render:

```js
if (combat.applySpawnWobbles) combat.applySpawnWobbles()
renderer.render(scene, camera)
```

**Problema**: como o wobble acumula a cada frame, precisa de reset. Sem reset, o mesh se afasta. **Solução**: guardar a posição "real" no início do frame, aplicar wobble, restaurar no próximo frame.

Melhor solução ainda: **aplicar no último momento** e guardar o offset usado pra desfazer no próximo frame. Ou usar `mesh.userData.wobbleOffset`.

**Simplificação aceita**: como o wobble dura 0.2s e o jitter é aleatório a cada frame (não acumulativo em direção única), o mesh **vibra em torno da posição real** na média. Não precisa desfazer. O desvio acumulado é estatisticamente nulo.

---

## 6. Ideia 8 — Despawn com animação

### 6.1 Conceito

Quando um inimigo sai de cena **sem morrer** (passou pra trás, ficou muito tempo em cena, saiu pela parte de cima), ele **não some de golpe**. Entra num estado `fadingOut` de ~0.4s onde encolhe e some suavemente.

### 6.2 Estados novos

```js
// Campos no objeto do inimigo:
enemy.fadingOut = false
enemy.fadeTimer = 0
const DESPAWN_FADE_DURATION = 0.4  // segundos
```

### 6.3 Onde interceptar

Hoje, o culling é chamado em 3 pontos:

1. `updateEnemies()` — no bloco `if (relativeForward < passBehind || passedDistance || offScreenAbove)` → `removeEnemy(enemy)`
2. `railDespawnCheck()` (blaster.js, tank.js) — idem
3. `sentinelaShouldDespawn()` — idem

**Proposta**: introduzir um método `beginFadeOut(enemy)` que **marca** o inimigo em vez de removê-lo. E o loop principal processa os fading antes do culling normal.

```js
function beginFadeOut(enemy) {
  if (enemy.fadingOut) return
  enemy.fadingOut = true
  enemy.fadeTimer = 0
  enemy.fadeTargetScale = enemy.mesh.scale.x || 1.0
  // Para a IA (não dispara, não persegue, não colide)
  enemy.disengaging = true
  enemy.fireTimer = Infinity
  enemy.ramHitActive = true  // impede toque/collision durante o fade
}

function processFadeOuts(dt) {
  for (const enemy of [...enemies]) {
    if (!enemy.fadingOut) continue
    enemy.fadeTimer += dt
    const t = Math.min(1, enemy.fadeTimer / DESPAWN_FADE_DURATION)
    const scale = enemy.fadeTargetScale * (1 - t)
    enemy.mesh.scale.setScalar(scale)
    if (t >= 1) {
      removeEnemy(enemy)
    }
  }
}
```

E em `updateEnemies()`, no início do loop (antes do bloco de `dying`):

```js
for (const enemy of [...enemies]) {
  if (enemy.fadingOut) {
    continue  // já está sendo processado em processFadeOuts
  }
  // ... resto do loop
}
```

### 6.4 Pontos de aplicação

Substituir os `removeEnemy(enemy)` "de despawn natural" por `beginFadeOut(enemy)`:

| Arquivo | Função | Mudança |
|---|---|---|
| `enemies/index.js` | `updateEnemies` — culling do trilho | `removeEnemy` → `beginFadeOut` |
| `enemies/index.js` | `updateEnemies` — culling de arena desengajando | `removeEnemy` → `beginFadeOut` |
| `enemies/blaster.js` | `railDespawnCheck` | `removeEnemy` → `beginFadeOut` |
| `enemies/tank.js` | `railDespawnCheck` | `removeEnemy` → `beginFadeOut` |
| `enemies/sentinela.js` | `sentinelaShouldDespawn` | `removeEnemy` → `beginFadeOut` |
| `enemies/miniSwarm.js` | `updateMiniSwarm` — dive timeout | `removeEnemy` → `beginFadeOut` |

**NÃO trocar**:
- `removeEnemy` chamado pela morte (`enemy.hp <= 0`) — esse caminho já tem a explosão + encolhimento de `dying`
- `removeEnemy` chamado por `clearAllCombatants`, `clearEnemies`, etc. — desmonte total é imediato
- `removeEnemy` no `applyAreaDamage` — kill de área tem seu próprio caminho

### 6.5 Interação com o resto

**IA durante o fade**: como `enemy.disengaging = true` é setado, o inimigo para de se mover e de atirar. Mas o **movimento residual** pode continuar por 1-2 frames. Aceitável.

**Hit-test durante o fade**: inimigos em fade ainda são alvos válidos? **Não deveriam ser** — o jogador atiraria num inimigo "quase sumido". Mas o `resolveProjectileHit` filtra por `!e.dying`, e o fading não seta `dying`. Precisa adicionar:

```js
const enemyHit = enemies.find((e) => 
  !e.dying && !e.fadingOut &&  // <-- NOVO
  distanceToSegment(...) <= hitRadiusFor(e) + hitBuffer
)
```

**Telemetria**: o `telemetry.recordEvent(e.id, e.kind, 'despawn', ...)` em `removeEnemy` continua funcionando. O fading só muda **quando** o `removeEnemy` é chamado, não o que ele faz.

**Horda e split**: se a Horda entra em fade, ela **não** dispara o split (não morreu de verdade). Correto — o split só deve rodar em morte real.

**Verme**: se um elo entra em fade, os outros elos que o seguem ficam esperando. `severChainAt` só é chamado no `removeEnemy`, que é chamado no fim do fade. Aceitável — o elo seguinte vai esperar 0.4s e depois virar cabeça.

---

## 7. Ordem de implementação sugerida

### Fase 1 — Infraestrutura
1. `effects.js` — `fogCondensationInward()` (§3.2) + `spawnAnticipation()` (§1.2)
2. `effects.js` — arrays `condensationInwards` e `spawnAnticipations` no `update()`
3. `enemies/index.js` — `getSpawnDurations()` (§2.3)

### Fase 2 — Spawn em 3 fases
4. `enemies/index.js` — novo bloco de animação (§1.6)
5. `enemies/index.js` — `registerSpawn()` dispara peek + condensação (§1.2, §3.3)
6. `enemies/index.js` — remover guard `BOSS_KIND` (§2.4)

### Fase 3 — Orientação
7. `enemies/index.js` — captura `spawnRotationFrom`/`To` (§4.2)
8. `enemies/index.js` — `slerpQuaternions` no bloco de animação

### Fase 4 — Wobble
9. `enemies/index.js` — `applySpawnWobbles()` (§5.2)
10. `game-loop.js` — chamar `applySpawnWobbles()` antes do render

### Fase 5 — Despawn
11. `enemies/index.js` — `beginFadeOut()`, `processFadeOuts()` (§6.3)
12. `enemies/index.js` — trocar `removeEnemy` por `beginFadeOut` nos pontos certos (§6.4)
13. `enemies/blaster.js`, `tank.js`, `sentinela.js`, `miniSwarm.js` — mesmas trocas
14. `enemies/index.js` — `resolveProjectileHit` ignora fading

### Fase 6 — Ajustes
15. Validar durações por tipo (§2.2) com teste manual
16. Verificar interação com Overhaul 4 (fog)

---

## 8. Arquivos afetados

| Arquivo | Mudança | Ideia |
|---|---|---|
| `src/effects.js` | `fogCondensationInward`, `spawnAnticipation`, arrays no update | 1, 3 |
| `src/enemies/index.js` | Bloco de spawn reescrito, `registerSpawn` atualizado, `beginFadeOut`, `applySpawnWobbles` | 1, 2, 3, 4, 6, 8 |
| `src/enemies/blaster.js` | `railDespawnCheck` usa `beginFadeOut` | 8 |
| `src/enemies/tank.js` | `railDespawnCheck` usa `beginFadeOut` | 8 |
| `src/enemies/sentinela.js` | `sentinelaShouldDespawn` usa `beginFadeOut` | 8 |
| `src/enemies/miniSwarm.js` | Dive timeout usa `beginFadeOut` | 8 |
| `src/game-loop.js` | Chama `applySpawnWobbles` antes do render | 6 |

---

## 9. Perguntas em aberto

1. **Durações da tabela §2.2** — valores de partida. Podem precisar ajuste após teste. Especialmente Chefe/Dourado (0.9s pode ser longo demais com a cutscene).
2. **Cor do peek** — `colorFor(enemy)` é a cor de identidade, mas pode conflitar com a cor do `telegraph` de tiro. Testar se fica visualmente distinguível.
3. **Wobble afeta hit-test?** — §5.3 recomenda aplicar antes do render. Se optar por aplicar no update normal, aceitar o trade-off.
4. **Fade-out afeta contagem de inimigos?** — §6.5 recomenda ignorar fading em `getEnemyCount`. Confirmar com o usuário.
5. **Chefe/Dourado no spawn em 3 fases** — hoje têm cutscene própria. Aplicar a animação de spawn **durante** a cutscene, **antes**, ou **depois**?
6. **Interação com Overhaul 4** — a condensação com `fog: true` fica invisível em setor denso. Isso é desejável (integra com o tema) ou indesejável (perde a leitura visual)?
7. **Performance da condensação** — 15-20 partículas por spawn × 6 spawns simultâneos = ~120 partículas. Medir.

---

## 10. Riscos

### 10.1 Risco de "spawn cênico demais"
O spawn total passa de 0.35s para 0.5-0.9s (dependendo do inimigo). Em combate frenético com múltiplos spawns, pode parecer **lento demais**. Mitigação: reduzir `peek` para 0 se a leva é grande (`spawnMiniSwarm` com 10 inimigos não precisa de peek).

### 10.2 Risco de "opacidade animando mal"
Materiais com `transparent: true` em inimigos que **nunca usaram transparência** podem causar artefatos de ordenação (z-fighting visual). Mitigação: usar o canal de **emissive** em vez de opacidade sempre que possível (§1.3).

### 10.3 Risco de "despawn com fade engana o jogador"
Um inimigo em fade ainda existe no array e pode ser travado pelo lock-on (que filtra por `!e.dying`). Precisa filtrar também `!e.fadingOut` em `getAlive()`. Mitigação: documentar (§6.5) e adicionar o filtro.

### 10.4 Risco de "wobble acumula"
Se a implementação de wobble somar offset sem reset, o mesh se afasta permanentemente. Mitigação: §5.3 recomenda aplicar antes do render.

### 10.5 Risco de "conflito com §1 do planejamento de dificuldade"
O planejamento de dificuldade mexe em `enemies/*`. Este overhaul também. **Ordem**: aplicar §1 do planejamento **primeiro**, depois este. Senão os dois se atropelam.

---

## 11. Resumo executivo

O overhaul transforma o spawn de "pop-in com escala" em **três fases explícitas com identidade própria por tipo de inimigo**:

1. **Peek** — anel fino de aviso antes do mesh nascer
2. **Materialização** — escala + opacidade/emissive + rotação convergindo + condensação inward
3. **Assentamento** — overshoot de escala + flash curto + wobble final

E o despawn ganha uma fase de **fade-out** de 0.4s em vez de desaparecer de golpe.

**Duração varia por tipo** (0.20s para enxames, 0.90s para chefe) — o timing é informação, não só polimento.

**Filosofia central**: o spawn é uma **frase**, não uma palavra. Antecipação, chegada, assentamento. E o despawn segue a mesma lógica invertida — nunca sumir de golpe.

---

*Fim do documento. Aprovar §2.2 (tabela de durações) e §9 (perguntas em aberto) antes de iniciar.*