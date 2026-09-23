# Overhaul 4 — Fog como mecânica de gameplay

## Documento de especificação completo

---

## 0. Contexto

### 0.1 Estado atual do fog no jogo

O jogo tem hoje **três camadas de fog** independentes, sem coordenação entre si:

**Camada 1 — `FogExp2` (depth fog real)**
- Definido em `src/mount-game.js`: `scene.fog = new THREE.FogExp2(0x000000, 0.0075)`
- Cor forçada pra preto em `game-loop.js` durante combate fora de arena:
  ```js
  if (scene.fog && state.phase === 'combat' && !rail.isArena()) {
    scene.fog.color.set(0x000000)
    scene.background.set(0x000000)
  }
  ```
- Densidade base `0.0075` — cobre apenas ~11% da cor de um objeto a 45u, ~37% a 90u

**Camada 2 — Nebulosa dinâmica (`enableNebulaPockets`)**
- Em `src/environment.js`, aumenta densidade em "bolsões" a cada 340u de trilho
- Efeito de apenas +13% relativo — visualmente imperceptível

**Camada 3 — Fog Wisps (nuvens visíveis)**
- 85 sprites grandes em `src/effects.js`, fixos em espaço-mundo
- `FOG_WISP_OPACITY = 0.24` — contraste baixíssimo contra fundo preto
- Sem relação com as outras duas camadas

### 0.2 Problema diagnosticado

O jogador **vê os inimigos surgindo e sendo posicionados** ao invés de emergirem do fundo. Causas:

1. Densidade baixa demais (inimigos spawnam a 45–90u, faixa onde a cobertura é 11–37%)
2. Emissive dos materiais (0.75–0.95) brilha "através" do fog em três.js — o emissive não sofre atenuação de fog
3. `scene.background` preto anula o contraste — sem contraste, fog não tem o que atenuar
4. Animação de spawn escala de 0.1x para 1.0x em 0.35s — visível de propósito, e o `fogWispCondensation` (5 partículas, 0.22s) é curto demais pra ler como "emergiu"

### 0.3 Filosofia do Overhaul 4

Em vez de tratar o problema como **"o fog é fraco demais, aumenta a densidade"**, este overhaul **abreça o fog como mecânica central**. Ele passa a ser a **cortina funcional** entre o jogador e o mundo, e o jogo é redesenhado para contar com isso. Existem 4 pilares:

1. **Densidade calibrada por expectativa de spawn** — o fog cobre exatamente o que precisa cobrir, em cada setor, dinamicamente
2. **Radar como contra-jogo** — o minimapa passa a mostrar informação que o olho não vê
3. **Fog como sinal tático** — mecânicas existentes ganham uma camada nova de profundidade com o fog como aliado
4. **Fog como indicador de ameaça** — engrossar antes de um chefe/dourado, clarear depois

Cada pilar é independente. Podem ser implementados em qualquer ordem. O documento abaixo cobre os 4 com a mesma profundidade.

---

## 1. Pilar 1 — Densidade calibrada por expectativa de spawn

### 1.1 Conceito

Em vez de fixar a densidade em `0.0075` e esperar que funcione em todos os setores, o sistema **recalcula a densidade a cada `enterCombat`** com base na **distância máxima de spawn** do setor atual. O fog é calibrado para cobrir X% da cor do inimigo mais distante.

### 1.2 Fórmula

Cobertura do `FogExp2`:
```
coverage(d) = 1 - exp(-(density * d)²)
```

Para uma cobertura alvo `C` na distância de spawn máxima `D`:
```
density = sqrt(-ln(1 - C)) / D
```

**Valores propostos**:
- `C = 0.85` (85% de cobertura no spawn máximo)
- `D` varia por setor — ver §1.3

### 1.3 Cálculo de `D` por setor

Cada inimigo declara sua própria distância máxima de spawn. O sistema pega o **maior valor entre todos os inimigos elegíveis do setor**:

```js
// Cada arquivo de inimigo exporta sua distância máxima:
export const BLASTER_SPAWN_DISTANCE_MAX = 90
export const TANK_SPAWN_DISTANCE_MAX = 84
export const DETRITO_SPAWN_DISTANCE_MAX = 96
export const HORDA_SPAWN_DISTANCE_MAX = 55
export const VERME_SPAWN_DISTANCE_MAX = 90
// etc.
```

O `environment.js` recebe um novo método:

```js
setSpawnDistanceExpectation(maxSpawnDistance) {
  const COVERAGE_TARGET = 0.85
  const targetDensity = Math.sqrt(-Math.log(1 - COVERAGE_TARGET)) / maxSpawnDistance
  this._targetFogDensity = targetDensity
  // lerp suave de 1.5s até targetDensity (ver §1.5)
}
```

**Exemplos de densidade resultante**:

| `maxSpawnDistance` | Densidade calculada | Cobertura a essa distância |
|---|---|---|
| 45u (só Horda) | 0.042 | 85% |
| 60u | 0.031 | 85% |
| 90u (maioria dos inimigos) | 0.021 | 85% |
| 120u | 0.016 | 85% |
| 150u (chefe/dourado em arena) | 0.013 | 85% |

**Ponto crítico**: 0.021 é **quase 3x** a densidade atual (0.0075). Isso muda o jogo visualmente de forma perceptível. Testar em setor de baixa densidade (só Horda) antes de generalizar.

### 1.4 Como o setor informa sua `D`

Em `mount-game.js → enterCombat()`, adicionar:

```js
const sectorMaxSpawn = computeSectorMaxSpawnDistance(state, session)
if (environment.setSpawnDistanceExpectation) {
  environment.setSpawnDistanceExpectation(sectorMaxSpawn)
}
```

E a função `computeSectorMaxSpawnDistance` (pode morar em `environment.js` ou `main-constants.js`):

```js
function computeSectorMaxSpawnDistance(state, session) {
  // Em arena (chefe/dourado), usa a distância da arena
  if (rail.isArena()) return ENEMY_ARENA_SPAWN_MAX // 96
  
  // Em trilho, o maior spawn entre os inimigos que podem aparecer agora
  let maxDist = BLASTER_SPAWN_DISTANCE_MAX // fallback: 90
  
  // Se for ciclo de chefe, considerar chefe/dourado
  if (state.isBossCycle) maxDist = Math.max(maxDist, GOLDEN_SPREAD_MAX) // 108
  
  return maxDist
}
```

**Nota**: a função precisa saber se o setor pode spawnar Horda, Detrito Titânico, etc. — se for o caso, esses valores entram no cálculo. Simplificação: **usar o maior entre todos os que podem spawnar**, não o que de fato vai spawnar.

### 1.5 Transição suave

A densidade **não muda de uma vez** quando um novo setor começa. Ela lerpa do valor atual para o alvo em **~1.5s** durante a cutscene de decolagem ou durante o primeiro segundo de combate:

```js
// Em update():
if (this._currentFogDensity !== this._targetFogDensity) {
  const lerpRate = 1 - Math.exp(-1.5 * dt)
  this._currentFogDensity += (this._targetFogDensity - this._currentFogDensity) * lerpRate
  scene.fog.density = this._currentFogDensity
}
```

**Importante**: no modo sem baralho, a densidade alvo muda apenas quando o `state.isBossCycle` muda (com chefe = maior distância = menor densidade).

### 1.6 Interação com arena

Em arena (`rail.isArena()`), a densidade cai **40%** automaticamente, porque o chefe/dourado precisa ser visível:

```js
const arenaMultiplier = rail.isArena() ? 0.6 : 1.0
scene.fog.density = this._currentFogDensity * arenaMultiplier
```

Isso é aplicado no mesmo `update()` do §1.5.

### 1.7 Trade-offs

- **Mudança drástica visual**: subir de 0.0075 para 0.021 é o overhaul inteiro visualmente. Pode não ser o que o usuário quer.
- **Inimigos grandes somem**: em setores com densidade alta, o Chefe pode desaparecer se `maxSpawnDistance` incluir 108u. Precisa da exceção da §1.6.
- **Inimigos pequenos ficam invisíveis antes de perto**: um Blaster spawnando a 90u com 85% de cobertura fica 15% visível — quase invisível.

---

## 2. Pilar 2 — Radar como contra-jogo

### 2.1 Conceito

O minimapa (`hud-game.js → setMinimap`) hoje mostra **todos os inimigos como pontos sólidos**, revelando posição exata. Se o fog esconde visualmente, o radar deve ser **parcialmente cego também** — mostrando **direção aproximada** mas não posição exata nem tipo.

### 2.2 Tipos de blip

Cada inimigo no minimapa passa a ter **estado de visibilidade**:

| Estado | Critério | Representação |
|---|---|---|
| **VISÍVEL** | Distância < limiar de visibilidade direta | Blip sólido com cor/forma atual (mantém o design atual) |
| **FANTASMA** | Entre limiar de visibilidade e distância de spawn máximo | Blip difuso, translúcido, sem forma específica |
| **FORA** | Além do spawn máximo | Não aparece |

**Limiar de visibilidade direta**: `density` do fog define a distância. Regra prática:
```js
const visibilityThreshold = Math.sqrt(-Math.log(0.15)) / scene.fog.density
// Com density 0.021, isso dá ~45u (15% de cobertura = 85% visível)
```

Em outras palavras: um inimigo é "VISÍVEL" se o fog não cobre mais que 15% da cor dele.

### 2.3 Como o HUD recebe o estado

`game-loop.js`, no bloco que já monta os `blips` do minimapa:

```js
const visibilityThreshold = Math.sqrt(-Math.log(0.15)) / (scene.fog?.density || 0.0075)

const blips = rawBlips.map((b) => {
  _minimapRel.copy(b.worldPos).sub(playerPos)
  const dist = _minimapRel.length()
  const visState = dist < visibilityThreshold ? 'visible' : 'ghost'
  return {
    type: b.type,
    kind: b.kind,
    visState, // NOVO
    xFrac: ...,
    yFrac: ...,
  }
})
```

### 2.4 Renderização dos blips fantasma

Em `hud-game.js → setMinimap`, cada blip fantasma ganha uma classe CSS diferente:

```js
const cls = `hud-minimap-blip hud-minimap-blip-${shape} ${b.visState === 'ghost' ? 'hud-minimap-blip-ghost' : ''}`
```

Estilo em `hud-styles.js`:

```css
.hud-minimap-blip-ghost {
  opacity: 0.35;
  filter: blur(1px);
  /* Forma circular genérica, sem indicar tipo exato */
}
.hud-minimap-blip-ghost::before {
  /* Substituir pela forma genérica — círculo difuso */
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: radial-gradient(circle, #6b7a99 0%, transparent 70%);
}
```

**Efeito**: o jogador vê no radar que **tem algo ali**, mas não sabe **o quê** (Blaster? Tank? Detrito?) nem **onde exatamente**.

### 2.5 QOL — Distinguir perigo iminente

Alguns inimigos (Detrito Titânico, Boss) **nunca devem virar fantasma** — são grandes demais pra se esconder. Adicionar uma exceção:

```js
const ALWAYS_VISIBLE_KINDS = ['boss', 'golden', 'detrito']
const visState = ALWAYS_VISIBLE_KINDS.includes(b.kind) || dist < visibilityThreshold
  ? 'visible'
  : 'ghost'
```

### 2.6 Trade-offs

- **Justiça**: um jogador atacado "do nada" sem aviso pode sentir que é bug. Mitigável com blips fantasma — o radar **dá direção**.
- **Complexidade**: o HUD passa a consumir estado do fog. Isso é uma inversão de dependência (HUD nunca dependeu do ambiente antes).
- **Override manual**: se o jogador quiser desligar o efeito de "blip fantasma", precisa poder. Sugestão: toggle em `settings.js` (`minimapGhostBlips: true` por padrão).

---

## 3. Pilar 3 — Fog como sinal tático

### 3.1 Conceito

Três mecânicas já existentes ganham uma camada nova de profundidade quando há fog denso. Não são mecânicas novas — são **exceções que usam o fog como gatilho**.

### 3.2 Sussurro — invisibilidade real em fog denso

**Estado atual** (`src/enemies/sussurro.js`):
- Pulsa visível por 500ms, depois invisível por 2200ms
- Opacidade visível 0.95, invisível 0.28
- Nunca fica **realmente** invisível — 0.28 de opacidade ainda é detectável

**Mudança proposta**:
Quando `scene.fog.density > DENSE_THRESHOLD` (sugestão: `0.015`):
- Opacidade invisível cai para **0.05** (quase nada)
- O pulso visível continua com 0.95, mas o **período muda**: 300ms visível, 3000ms invisível (mais tempo escondido)

Em fog limpo, mantém o comportamento atual.

```js
// Em updateSussurro:
const isDenseFog = rail.getSceneFogDensity?.() > DENSE_THRESHOLD
const hiddenOpacity = isDenseFog ? 0.05 : OPACITY_HIDDEN
const visibleMs = isDenseFog ? 300 : PULSE_VISIBLE_MS
const invisibleMs = isDenseFog ? 3000 : PULSE_INVISIBLE_MS

enemy.mesh.material.opacity = enemy.pulseVisible ? OPACITY_VISIBLE : hiddenOpacity
```

**Efeito**: em setores densos, o Sussurro vira uma ameaça real — você **não sabe que ele existe** até ele invocar reforços (o som dele, `sussurro_summon`, é o único aviso).

**Sinalização de justiça**: o jogador precisa de alguma pista. Sugestão: a única leitura é o `fogWispCondensation` no spawn dele — que também precisa ser mais visível (§3.4).

### 3.3 Dourado — teleporte disfarçado em fog denso

**Estado atual** (`src/enemies/golden.js`):
- Dourado teleporta quando acerta um hit, com cooldown de 10s
- O teleporte dispara dois `shockwave` (old + new) + duas `explosion` — visual óbvio

**Mudança proposta**:
Em fog denso (`density > 0.015`), o Dourado reduz drasticamente a **partícula visual** do teleporte:
- Sem `shockwave` e `explosion` no ponto de partida (o jogador não vê ele sumir)
- Apenas um `bloomSprite` sutil no destino (o jogador vê uma "aparição", não uma "partida")
- O som `golden_teleport` continua tocando — é o único aviso sonoro

```js
// Em golden.js → resolveHit, bloco do teleporte:
const isDenseFog = scene.userData.fogDensity > 0.015
if (isDenseFog) {
  // Sem efeitos no ponto de partida
  effects.bloomSprite(newPos, GOLDEN_COLOR, 0.8) // só isso
} else {
  // Comportamento atual: shockwave + explosion nos dois pontos
}
```

**Efeito**: em setores densos, o Dourado "desaparece" e reaparece sem aviso visual — o jogador tem que estar atento ao som. Em setores limpos, é o que sempre foi.

### 3.4 Horda — dissolução silenciosa em fog denso

**Estado atual** (`src/enemies/horda.js` + `miniSwarm.js`):
- Horda morre com explosão grande (15 de dano / filhotes nascem no ponto)
- Cada filhote nasce com `fogWispCondensation` + `flankSpawnTrail`

**Mudança proposta**:
Em fog denso (`density > 0.015`):
- A explosão de morte da Horda é **reduzida em 60%** (menor e mais discreta)
- Os filhotes nascem **sem** `fogWispCondensation` / `flankSpawnTrail` — nascem literalmente invisíveis
- Os filhotes começam com opacidade 0 e fazem fade-in **durante os primeiros 500ms do spreadOut** (já é o período em que estão se espalhando, ninguém vai ver a "aparição" mesmo)

**Efeito**: a Horda morre, o jogador vê uma explosão pequena, continua voando — e de repente tem 5 mini-swarms mergulhando nele. Em setores limpos, é o que sempre foi.

### 3.5 Bônus — Detritos se escondem melhor

**Estado atual** (`src/enemies/detrito.js`):
- Detrito Titânico é impossível de não ver (raio ~14u quando grande)
- Detritos menores aparecem como pontos cinzas contra o fundo preto

**Mudança proposta**:
Em fog denso, os detritos **não são isentos** da atenuação de fog (hoje são, por `emissive: 0x282c34, emissiveIntensity: 0.35`). Reduzir emissive para 0.15 em fog denso faz com que eles **apareçam** apenas quando perto. É o "obstáculo que você não viu a tempo" — Star Fox 64 fazia isso com asteroides.

```js
// Em updateDetritoSpin ou registerSpawn:
const isDenseFog = scene.userData.fogDensity > 0.015
material.emissiveIntensity = isDenseFog ? 0.15 : 0.35
```

**Cuidado**: `material` é compartilhado entre todas as instâncias de detrito. Mudar em runtime afeta todos. Aceitável porque a mudança é global (todo mundo no mesmo setor).

### 3.6 Trade-offs

Todos os 4 sub-pilares são mudanças de **justiça percebida**. O jogador vai reclamar que ficou injusto se:
- Sussurro invocar reforços sem aviso visual
- Dourado teleportar "do nada" durante uma luta
- Horda virar 5 filhotes invisíveis
- Detrito aparecer "do nada" no meio do caminho

**Mitigação obrigatória**:
1. Densidade alta deve ser **rara** e **avisada** (ver §4)
2. Os efeitos sonoros (`sussurro_summon`, `golden_teleport`, `verme_segment_break`) **não são reduzidos** — o som é o aviso
3. O jogador precisa poder desligar isso em Configurações (`settings.fogTacticalEffects: true` por padrão)

---

## 4. Pilar 4 — Fog como indicador de ameaça

### 4.1 Conceito

O fog deixa de ser puramente ambiente e passa a **anunciar eventos** — engrossando antes de um chefe, dourado, ou evento especial, e clareando depois. É feedback diegético.

### 4.2 Chefe — engrossar no aviso, clarear no fim

**Timeline** (usa as constantes existentes):

| Fase | Duração | Densidade alvo |
|---|---|---|
| `ARENA_WARNING_COUNTDOWN_MS` (5s) | 5s | Sobe linearmente de base para `base * 1.8` |
| `BOSS_SUMMON_CUTSCENE_MS` (3.2s) | 3.2s | Mantém `base * 1.8` |
| Boss fight | variável | Cai para `base * 0.6` (arena herda §1.6) |
| Boss death cutscene | 3s | Sobe de volta para `base * 1.2` |
| Pós-boss | — | Volta ao normal do setor |

**Onde implementar**:
- `flow-boss.js → startArenaCutscene('boss', ...)` — setar `environment.setFogProfile('bossWarn')`
- `flow-boss.js → handleBossDefeated` — setar `environment.setFogProfile('bossDeath')`
- `environment.js → update()` — aplicar perfil ativo, lerp suave

### 4.3 Dourado — mesmo padrão, cor diferente

**Diferença**: dourado usa **fog âmbar** (`0x1a1008`), chefe usa **fog vermelho-escuro** (`0x1a0508`). Isso permite distinguir os dois **pelo ambiente**, antes do card aparecer.

**Timeline**:
- `ARENA_WARNING_COUNTDOWN_MS` (5s) — fog sobe pra `base * 1.6` com cor âmbar
- Arena começa — cai pra `base * 0.7` (arena §1.6)
- Vitória do dourado — volta ao normal do setor

### 4.4 Evento de tempestade de detritos

**Estado atual** (`game-loop.js → triggerDebrisStorm`):
- `state.debrisStormActive` com timer
- HUD `showDebrisStormNotice` avisa o jogador
- Fog não muda

**Mudança**: durante a tempestade, fog sobe 30% e cor desloca levemente pra bege (`0x0a0805`) — sensação de "poeira no ar". Ao terminar, volta ao normal.

```js
// Em triggerDebrisStorm:
environment.setFogProfile('debrisStorm')

// No bloco que desativa a tempestade:
environment.setFogProfile(null) // volta ao perfil do setor
```

### 4.5 Fog como indicador de nível

**Bônus opcional**: conectar §1.5 do planejamento de dificuldade com o fog. Nível 1–3 = fog limpo; nível 7–9 = fog denso permanente. Isso faz o **nível ser perceptível pelo ambiente**, não só pelo HP dos inimigos.

**Fórmula sugerida**:
```js
const levelDensityBoost = (state.wrongAnswerCount > 8) ? 1.25 : 1.0
scene.fog.density = this._currentFogDensity * levelDensityBoost
```

**Cuidado**: se o nível ficar em 9 permanentemente, o fog fica permanentemente denso — e o jogador pode achar que o jogo "bugou". Só usar se for combinado com §4.3 do planejamento (indicador visual de nível).

### 4.6 Trade-offs

- **Agressividade visual**: fog que engrossa do nada pode parecer bug. Precisa ser acompanhado de card (`hud.showBossWarningCard` já existe).
- **Cor do fog é fixa em 0x000000**: o `game-loop.js` força isso todo frame. **Precisa ser removido** pra qualquer mudança de cor funcionar. Isso muda o "preto clássico" que o projeto valoriza — decisão do usuário.
- **Performance**: mudar a cor do fog por frame força recomputar todos os shaders que usam fog (`MeshPhongMaterial` reage a isso). Mitigável com `scene.fog.color.setRGB()` que só marca dirty quando o valor realmente muda.

---

## 5. Ordem de implementação sugerida

Ordem que **minimiza risco** e **maximiza aprendizado por fase**:

### Fase 1 — Infraestrutura (baixo risco, alto valor)
1. `environment.js` — método `setSpawnDistanceExpectation(maxDist)` com lerp suave
2. `mount-game.js` — calcular `maxSpawnDistance` em `enterCombat` e chamar
3. `game-loop.js` — **remover** o trecho que força `scene.fog.color.set(0x000000)`
4. `mount-game.js` — densidade inicial vem de `environment.setSpawnDistanceExpectation`, não do literal `0.0075`

**Critério de sucesso**: rodar o jogo, ver que inimigos spawnam de forma mais "surgindo do fundo" sem mudar nada mais.

### Fase 2 — Sinal tático (risco médio, valor alto)
5. `hud-game.js` + `hud-styles.js` — blips fantasma no minimapa (§2)
6. `settings.js` — toggle `minimapGhostBlips`

**Critério de sucesso**: em setor com densidade alta, o radar mostra blips difusos ao longe, sólidos quando perto.

### Fase 3 — Mecânicas táticas (risco alto, valor alto)
7. `sussurro.js` — opacidade dinâmica por densidade (§3.2)
8. `golden.js` — teleporte disfarçado em fog denso (§3.3)
9. `miniSwarm.js` — filhotes invisíveis em fog denso (§3.4)
10. `detrito.js` — emissive dinâmico (§3.5)
11. `settings.js` — toggle `fogTacticalEffects`

**Critério de sucesso**: o jogador sente que o jogo está mais difícil em setores densos, mas **não sente que é injusto** (o som avisa).

### Fase 4 — Indicadores de ameaça (risco baixo, valor médio)
12. `environment.js` — método `setFogProfile(name)` com perfis pré-definidos
13. `flow-boss.js` — chamar `setFogProfile('bossWarn')` / `'bossDeath'`
14. `flow-boss.js` — idem pra dourado
15. `game-loop.js` — chamar `setFogProfile('debrisStorm')` no trigger

**Critério de sucesso**: o fog engrossa antes do chefe/dourado/tempestade e clareia depois.

### Fase 5 — Refinamento (baixo risco, valor cosmético)
16. `environment.js` — perfis de cor por tipo de ameaça (§4.2, §4.3)
17. Opcional: §4.5 (fog reage ao nível)
18. `selftest.mjs` — adicionar testes pra `setSpawnDistanceExpectation` e cálculos de cobertura

---

## 6. Arquivos afetados (visão consolidada)

| Arquivo | Mudança | Pilar |
|---|---|---|
| `src/environment.js` | `setSpawnDistanceExpectation`, `setFogProfile`, sistema de perfis | 1, 4 |
| `src/mount-game.js` | Calcular `maxSpawnDistance` em `enterCombat`, densidade inicial do environment | 1 |
| `src/game-loop.js` | **Remover** `scene.fog.color.set(0x000000)`; passar `fogDensity` pro HUD | 1, 2 |
| `src/hud-game.js` | Blips fantasma no `setMinimap` | 2 |
| `src/hud-styles.js` | CSS `.hud-minimap-blip-ghost` | 2 |
| `src/settings.js` | `minimapGhostBlips`, `fogTacticalEffects` | 2, 3 |
| `src/sussurro.js` | Opacidade dinâmica por densidade | 3 |
| `src/golden.js` | Teleporte disfarçado em fog denso | 3 |
| `src/miniSwarm.js` | Filhotes invisíveis em fog denso | 3 |
| `src/detrito.js` | Emissive dinâmico | 3 |
| `src/flow-boss.js` | `setFogProfile('bossWarn'/'bossDeath')` | 4 |
| `src/main-constants.js` | `DENSE_FOG_THRESHOLD`, `FOG_PROFILES` | 1, 3, 4 |
| `src/selftest.mjs` | Testes do cálculo de densidade | 1 |

---

## 7. Perguntas em aberto para o Claude

Deixar explícito para o implementador decidir:

1. **`COVERAGE_TARGET = 0.85` é o valor certo?** Pode ser 0.80 (menos denso, mais visível) ou 0.90 (mais denso, mais escondido). O cálculo é trivialmente ajustável, mas o **default** precisa ser decidido.
2. **`DENSE_FOG_THRESHOLD = 0.015`** — ponto em que as mecânicas táticas (§3) ativam. Precisa ser testado com a densidade real da §1.3. Se `maxSpawnDistance` cai pra 45u (só Horda), a densidade é 0.042 — bem acima de 0.015, então as mecânicas ativam sempre. Se cai pra 150u (chefe), a densidade é 0.013 — abaixo de 0.015, então nunca ativam. Precisa de recalibração ou fazer o threshold proporcional (`base * 1.4`).
3. **`scene.userData.fogDensity`** — o jeito mais limpo de expor a densidade atual pro HUD e pra `golden.js`/`miniSwarm.js` lerem. Mas é um hack de estado global. Alternativa: `environment.getFogDensity()` chamado explicitamente por quem precisa (mais explícito, mais código).
4. **Fog em modo sem baralho** — o modo sem baralho é jogado em arcade puro, com score subindo rápido. O fog deve reagir a `session.score` (como o `getDifficultyLevel` faz) ou ficar estático?
5. **Interação com §1 do planejamento de dificuldade** — se o nível 1–9 for aplicado a inimigos, e o fog reagir ao nível, os dois sistemas podem entrar em ressonância (nível alto → fog denso → inimigos invisíveis → jogador erra mais → nível sobe). Precisa de um freio — sugestão: fog reage ao nível **com atraso** (5s de histerese).

---

## 8. Riscos gerais

### 8.1 Risco de "mudou demais"
O overhaul mexe em **5 arquivos de gameplay** (`sussurro`, `golden`, `miniSwarm`, `detrito`, `flow-boss`) e **3 de apresentação** (`hud-game`, `hud-styles`, `environment`). Se algo der errado, é difícil isolar. **Mitigação**: implementar por fase (ver §5) e validar cada uma antes de seguir.

### 8.2 Risco de "injusto percebido"
As mecânicas do pilar 3 são **agressivas**. Se o jogador não entende que o fog está escondendo coisas, ele acha que é bug. **Mitigação**: o `showDebrisStormNotice` já tem o padrão de aviso — replicar pra "setor denso" com um card único no início (`ATENÇÃO: NEBULOSA DENSA — VISIBILIDADE REDUZIDA`).

### 8.3 Risco de "monotonia visual"
Se a densidade subir pra 0.021 em todo setor, o jogo perde o "preto clássico" que sempre teve. **Mitigação**: se o usuário valoriza o preto, limitar a densidade máxima a 0.015 e ajustar `COVERAGE_TARGET` pra 0.70.

### 8.4 Risco de "performance"
`FogExp2` é barato, mas mudar a **cor** por frame força recomputar uniforms. **Mitigação**: usar `scene.fog.color.setRGB()` só quando o delta for > 0.01. Para a densidade, `setFloat` é mais barato.

### 8.5 Risco de "conflito com §1 do planejamento"
O planejamento de dificuldade (§1 do doc principal) também mexe em `enemies/*` — todos os arquivos que este overhaul toca. **Mitigação**: implementar §1 do planejamento **primeiro**, depois este overhaul. Senão os dois se atropelam.

---

## 9. Resumo executivo

O Overhaul 4 transforma o fog de "parâmetro visual" em "mecânica central". Os 4 pilares são:

1. **Densidade calibrada** — cada setor calcula sua densidade com base na distância máxima de spawn. Fórmula: `density = sqrt(-ln(0.15)) / maxSpawnDistance`.
2. **Radar cego** — blips fantasmas no minimapa. Jogador vê direção, não tipo nem posição exata.
3. **Mecânicas táticas** — Sussurro, Dourado, Horda e Detrito ganham comportamento diferente em fog denso. **O som é o único aviso.**
4. **Indicadores de ameaça** — fog engrossa antes de chefe/dourado/tempestade, clareia depois.

**Filosofia central**: o fog é a **cortina funcional** entre o jogador e o mundo. Ele esconde o que precisa esconder, e o jogo **conta com isso**.

**Decisão crítica antes de começar**: remover o `game-loop.js` que força `scene.fog.color.set(0x000000)` todo frame. Sem isso, nenhuma mudança de cor funciona.

---

*Fim do documento. Aprovar §5 (ordem) e §7 (perguntas em aberto) antes de iniciar implementação.*