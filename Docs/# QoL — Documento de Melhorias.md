# QoL — Documento de Melhorias

> **Versão:** 0.1
> **Escopo:** 11 itens de qualidade de vida / correção de bug / melhoria de feedback
> **Status:** proposta — aguardando aprovação antes de qualquer alteração de código
> **Formato:** cada item traz sintoma, causa provável, arquivos afetados, correção proposta e critérios de aceitação.

---

## Índice

1. [Cutscene do chefe vermelho duplicada no modo Arcade](#1) — ✅ já estava corrigido (v0.85.x)
2. [Mira do carregado: tamanho por inimigo + multi-miras sob alvos grandes](#2) — ✅ implementado
3. [Carregado perseguindo alvo aleatório sem mira válida](#3) — ✅ implementado
4. [Repulsão: remover círculos + virar freio progressivo](#4) — ✅ implementado (v0.87.0)
5. [Feedback visual de hit "não-letal" em alvo resistente](#5) — ✅ implementado (v0.87.0)
6. [Knockback por tier de ameaça + Danger triangle + vignette vermelha](#6)
7. [Knockback com duração maior e cancelável](#7)
8. [Variedade de comportamento dos Blasters por cor](#8)
9. [Chefe vermelho e Dourado sumiram do preview do aviso](#9)
10. [Background/tema muda de cor por nível de dificuldade](#10)
11. [Verme, Ímã, Tank, Réplica, Sussurro, Fragata: perceptibilidade e mecânica](#11)

---

<a id="1"></a>
## 1. Cutscene do chefe vermelho duplicada no modo Arcade

### Sintoma
No **modo Arcade (sem baralho)**, a cutscene de invocação do chefe vermelho (`arenaCutsceneKind === 'bossSummon'`) roda **duas vezes seguidas** — o jogador vê o aviso "NÚCLEO RUBRO // RED CORE" aparecer, sumir, e aparecer de novo antes da luta começar.

### Causa provável
No modo Arcade, `flow-boss.js → enterBossBuildup()` **pula a fase de caçada de orbes** e chama `finishBossHunt()` diretamente. `finishBossHunt()` dispara `startArenaCutscene('bossSummon', enterBossFight, ...)`.

Paralelamente, `mount-game.js → enterCombat()` decide se é ciclo de chefe por:

```js
state.isBossCycle = deck?.isNoDeck
  ? (session.score - state.bossNoDeckScoreCheckpoint) >= BOSS_NO_DECK_SCORE_INTERVAL
  : (session.pointer + 1) % BOSS_EVERY_QUESTIONS === 0
```

Como o checkpoint de score só é atualizado **dentro** de `enterBossBuildup()`, e `enterBossBuildup` **chama `finishBossHunt` antes de setar o checkpoint de novo** — quando o `enterCombat()` subsequente é chamado (pós-cutscene), `(session.score - checkpoint)` continua maior que o intervalo, então **`isBossCycle` fica `true` de novo**, e o game-loop dispara **outra** `startArenaCutscene('boss', enterBossBuildup)`.

### Correção proposta
Atualizar `bossNoDeckScoreCheckpoint` **no início** de `enterBossBuildup()`, antes de qualquer chamada a `finishBossHunt()`.

### Arquivos afetados
- `src/flow-boss.js` — `enterBossBuildup()`

### Critério de aceitação
- No modo Arcade, do checkpoint de score até o início da luta, a cutscene `bossSummon` roda **uma única vez**.
- Após a luta do chefe, um novo intervalo de score precisa ser acumulado antes do próximo gatilho.

---

<a id="2"></a>
## 2. Mira do carregado: tamanho por inimigo + multi-miras sob alvos grandes

### Sintomas
- **2a)** A mira do tiro carregado (o marcador quadrado que aparece quando você trava um alvo) tem **tamanho fixo**, não importa se o alvo é um mini-swarm do tamanho de uma moeda ou o chefe do tamanho de um prédio. Alvos grandes parecem "pequenos demais" pro retículo.
- **2b)** Quando o alvo acumula **múltiplas travas** (Horda = 2, Chefe/Dourado = N), o anel de marcadores é calculado com raio fixo de `BIG_TARGET_RING_RADIUS = 4` — mas o **corpo do chefe é bem maior que isso em tela**, então os marcadores podem ficar **fora do corpo visual dele** (parecem flutuar no espaço vazio).

### Causa provável
- **2a)** `hud-game.js → setLockedEnemyMarkers` recebe `{ id, xFrac, yFrac }` (posição em tela), mas **não recebe tamanho**. O CSS do `.enemy-lock-marker` tem `width/height` fixos.
- **2b)** Em `lockon.js → getLockedEnemySnapshots`, o raio do anel usa `entity.radius ?? BIG_TARGET_FALLBACK_RADIUS = 5`, mas o chefe nunca expõe um `radius`. O fallback hardcoded de `5` é **menor que o `BOSS_HIT_RADIUS = 7.7`** real — então o anel fica dentro do corpo, não sob ele.

### Correção proposta
- **2a)** Estender `getLockedEnemySnapshots` para devolver também um `sizeHint` (o raio de colisão do alvo, ou um fallback por `kind`) — `hud-game.js` usa esse hint pra setar `--marker-size` via CSS custom property no `.enemy-lock-marker`, com clamp min/max pra não virar gigantesco nem minúsculo.
- **2b)** O mesmo `sizeHint` alimenta o raio do anel em `lockon.js` (substituindo `BIG_TARGET_FALLBACK_RADIUS`).
- **2c)** Cada `entity` ganha um `radius` exposto (`enemy.radius` ou um getter `hitRadiusFor(enemy)` já existente em `enemies/index.js` — precisa ser exposto pro `lockon` ler).

### Arquivos afetados
- `src/combat/lockon.js` — `getLockedEnemySnapshots`, `BIG_TARGET_FALLBACK_RADIUS`
- `src/enemies/index.js` — expor raio por inimigo (provável: `getLockableRadius(entity)` no retorno do sistema)
- `src/hud-game.js` — `setLockedEnemyMarkers`
- `src/hud-styles.js` — CSS do `.enemy-lock-marker` com `--marker-size`

### Critério de aceitação
- Travar um Mini-Swarm mostra um marcador **pequeno**, proporcional ao modelo.
- Travar o Chefe mostra marcador **grande**, cobrindo boa parte do corpo.
- Multi-lock na Horda espalha 2 marcadores sobre o corpo dela.
- Multi-lock no Chefe espalha N marcadores num anel **ao redor do corpo**, todos visíveis.

---

<a id="3"></a>
## 3. Carregado perseguindo alvo aleatório sem mira válida

### Sintoma
Sem nenhum inimigo travado e sem nenhum na mira visual, o tiro carregado às vezes **persegue um alvo aleatório** — o jogador aperta o botão esperando um disparo reto, mas o projétil curva em direção a um inimigo distante. Isso quebra a leitura "só persegue o que eu mirei".

### Causa provável
Em `projectiles.js → fireHomingShot`, quando não há travados (`locked.length === 0`):

```js
const alive = enemies.getAlive().filter(inRange)
alive.sort((a, b) => origin.distanceTo(a.mesh.position) - origin.distanceTo(b.mesh.position))
targetList = alive.slice(0, Math.max(0, maxTargets))
```

Isso pega **os N mais próximos dentro do range** sem checar se algum deles está **na direção da mira** — então o projétil sai voando atrás do inimigo mais próximo, que pode estar atrás do jogador.

### Correção proposta
- Se **não houver nenhum alvo travado**, verificar se há inimigo na direção da mira (usar o mesmo teste do `lockon.isAimingAtEnemy` — cone estreito). 
  - **Se houver** ao menos 1 dentro do cone: dispara homing nos N mais próximos **dentro do cone** (comportamento correto esperado).
  - **Se não houver nenhum**: dispara um **projétil reto normal** (mesmo visual de homing, mas sem `homingTarget`) — o projétil voa reto na direção da mira e só acerta quem estiver no caminho. Isso é o "disparo normal" que o usuário descreveu.
- **Fallback defensivo** (para o caso de "a mira sair" do alvo no frame exato do release, por lag): se o cone de mira detectar pelo menos 1 alvo e o `takeLockedTargets` retornar vazio (por qualquer bug), ainda assim travar no alvo detectado — evita o tiro ir pra lugar nenhum.

### Arquivos afetados
- `src/combat/projectiles.js` — `fireHomingShot`
- `src/combat/lockon.js` — nova função pública `getEnemiesInAimCone(origin, direction, maxCount)` (reaproveitando a lógica de `isAimingAtEnemy`)

### Critério de aceitação
- Mira vazia + release → tiro reto, não persegue ninguém.
- Mira com 1 inimigo dentro do cone → tiro persegue (não muda comportamento atual).
- Mira com 5 inimigos no cone + `homingMaxTargets = 3` → persegue 3 mais próximos.
- Se o alvo sumir no meio do voo (morreu), o projétil continua reto na última direção.

---

<a id="4"></a>
## 4. Repulsão: remover círculos + virar freio progressivo

### Sintomas
- **4a)** A repulsão (S / botão de freio) gera **efeitos visuais circulares** que poluem a tela mais do que ajudam a leitura — o usuário quer **zero** efeito visual nela.
- **4b)** A repulsão hoje consome **100% da barra compartilhada** com o propulsor (mesma `boostCharge`). Isso torna impossível "tocar o freio um pouquinho" — é tudo ou nada. O usuário quer que o freio **consuma progressivamente** enquanto segurado, parando quando soltar.

### Causa provável
- **4a)** `effects.js → reverseBrakeJets` cria partículas esféricas azuis; `effects.js → emergencyBrakeVFX` (não confundir, é outro) cria shockwaves. Além disso `update()` no `effects.js` chama `reverseBrakeJets` a cada `REVERSE_BRAKE_INTERVAL = 0.04s` enquanto `repulsionActive`.
- **4b)** Em `player.js → activateRepulsion()`, faz `boostCharge = 0` de uma vez (igual propulsor). O freio é instantâneo, não progressivo.

### Correção proposta
- **4a)** Remover completamente:
  - Chamada a `effects.reverseBrakeJets()` em `game-loop.js`/`effects.update`.
  - `emergencyBrakeVFX` (usada no duplo-toque de repulsão — se for pra sumir também).
  - Arrays `reverseBrakeJetsList` e `emergencyBrake` em `effects.js`.
  - Se houver alguma chamada a `reverseBrakeJets` no `combat/`, remover.
  - **Nota:** a repulsão continua funcionando mecanicamente (freio de velocidade), só perde o visual.
- **4b)** Trocar o consumo instantâneo por **dreno progressivo**:
  - `activateRepulsion()` **não zera** mais `boostCharge`. Em vez disso, ativa um estado `repulsionActive` com timer baseado em quanto charge restar.
  - No `player.update(dt)`, enquanto `repulsionActive && input.repulsionHeld`, decrementar `boostCharge -= dt / BOOST_BRAKE_DRAIN_TIME` (onde `BOOST_BRAKE_DRAIN_TIME` é o tempo total pra drenar a barra cheia — sugestão: 2× `BOOST_RECHARGE_MS` = 6s).
  - Quando `boostCharge <= 0` **ou** o jogador solta o botão, `repulsionActive = false`.
  - O freio **para imediatamente** ao soltar (não há "residual"). A recarga só começa depois disso.
- **4c)** O mesmo tratamento se aplica ao **modo arena** — hoje o `emergencyBrake` (duplo-toque) tem comportamento próprio e cooldown próprio. Como ele some com 4a, considerar **remover** o duplo-toque e deixar a repulsão progressiva cuidar dos dois casos. Se o usuário quiser manter o duplo-toque, ele vira um "freio forte instantâneo" com consumo de charge fixo.

### Arquivos afetados
- `src/effects.js` — remover `reverseBrakeJets`, `emergencyBrakeVFX`, `reverseBrakeJetsList`, `spawnReverseBrakeJetParticle`
- `src/game-loop.js` — parar de passar `repulsionActive` pro `effects.update`; mudar lógica de `activateRepulsion`
- `src/player.js` — `activateRepulsion`, `update`, adicionar estado `repulsionActive` persistente
- `src/rail.js` — `triggerEmergencyBrake` (remover ou inutilizar, conforme 4c)

### Critério de aceitação
- Segurar repulsão: freio entra em ação e continua freando **enquanto o botão estiver pressionado**.
- Soltar: freio para imediatamente.
- A barra cai **progressivamente**, não zera de uma vez.
- Nenhum círculo / partícula / anel é gerado pela repulsão.
- No modo arena, o freio progressivo funciona igual ao trilho.

---

<a id="5"></a>
## 5. Feedback visual de hit "não-letal" em alvo resistente

### Sintoma
Quando um tiro normal acerta um inimigo com **mais HP do que o dano do tiro** (ex: 2 de dano em chefe com 80 HP), o feedback visual é **só a piscada branca** de `flashMesh`. Isso é fraco — parece que o tiro foi "absorvido" e não que "acertou mas não matou".

### Causa provável
`effects.hitSpark` existe e é chamado (via `game-loop.js`), mas gera só 6 partículas pequenas (`HIT_SPARK_PARTICLES = 6`), durando 0.22s — sutil demais pra ler como "acertou".

### Correção proposta
Criar um **efeito de faíscas em leque** dedicado pra hits "não-letais" (onde `hit.killed === false`):

- **Nome:** `effects.ricochetSparks(position, normal)` (novo).
- **Formato:** leque cônico de 10-14 partículas, todas saindo do ponto de impacto **na direção do vetor normal** (a direção contrária à do tiro), com ângulo de abertura ±35°.
- **Velocidade:** alta (25-40 u/s), com decaimento rápido.
- **Cor:** branca-amarelada (`0xffd166`), contrasta com o tiro normal (azul).
- **Duração:** 0.35s (mais longo que o `hitSpark` padrão).
- **Billboard:** cada faísca é uma pequena esfera **esticada** ao longo da velocidade (pra parecer um traço fino, não um ponto).

O efeito se soma ao `flashMesh` atual — os dois acontecem juntos, o alvo pisca **e** solta faíscas em leque.

### Arquivos afetados
- `src/effects.js` — nova função `ricochetSparks`, novo array `ricochetSparkBursts`, processamento no `update()`
- `src/game-loop.js` — chamar `effects.ricochetSparks(h.worldPos, fireDirectionInverse)` quando `!h.killed && h.damage < targetHpRestante`

### Critério de aceitação
- Acertar o chefe com tiro normal: piscada branca + faíscas em leque saindo do ponto de impacto.
- Acertar um blaster que morre no hit: **só** a explosão de morte (sem faíscas extras).
- Acertar um blaster que sobrevive (hp 3, dano 2): faíscas em leque aparecem.

---

<a id="6"></a>
## 6. Knockback por tier de ameaça + Danger triangle + vignette vermelha

### Sintoma
Hoje, o knockback da nave (`startTumble` em `rail.js`) usa a **mesma intensidade** independente do inimigo — colidir com um blaster pequeno tem o mesmo efeito visual que colidir com o chefe. O usuário quer:
- Knockback **sempre** acontece (não só contra boss/dourado) — colidir com qualquer inimigo ou levar projétil gera reação.
- **Intensidade proporcional** ao tier do inimigo/projétil.
- Feedback visual: **triângulo Danger** + **bordas avermelhadas** (vignette).
- O **último hit antes de perder o escudo** conta como knockback de tier alto.

### Causa provável
`startTumble` hoje só é chamado em 2 lugares:
- `triggerBossCollisionTumble` — colisão com chefe/dourado (e agora detrito, com o fix anterior).
- `triggerHighImpactTumble` — projétil de nível 4 (`POWER_LEVEL_HIGH_IMPACT`).

Colisão com inimigo comum (blaster, mini-swarm, etc.) só faz `hits += 1` e aplica dano, **sem** chamar tumble.

### Correção proposta

**6a — Tiers de knockback.** Definir 4 tiers:

| Tier | Fonte | Duração do tumble | Força do empurrão | Feedback |
|---|---|---|---|---|
| **0** | Sem knockback (nada hoje) | — | — | — |
| **1** | Colisão com inimigo pequeno (blaster, mini-swarm, sussurro, réplica, ímã) | `0.4s` | Baixa | Vignette leve |
| **2** | Colisão com inimigo médio (tank, time, sentinela, verme, horda) ou projétil pequeno | `0.6s` | Média | Vignette média + Danger |
| **3** | Colisão com inimigo grande (fragata, detrito) ou projétil grande | `0.85s` | Alta | Vignette forte + Danger |
| **4** | Colisão com boss/dourado, projétil nível 4 | `1.2s` | Muito alta | Vignette máxima + Danger + tela treme mais |

**6b — `startTumble` recebe o tier.** Assinatura nova: `startTumble(duration, impactOrigin, { highImpact, tier })`. O tier escala `tumbleKnockbackVel` (multiplicador) e a amplitude dos wobble pitch/yaw.

**6c — Colisão com qualquer inimigo dispara tumble.** Em `enemies/index.js`, no bloco de colisão genérica, além de `hits += 1`, chamar `game-loop` (via retorno) com uma flag `enemyCollisionTier` que propaga pro `startTumble`.

**6d — Último hit antes de perder escudo.** Em `player.js → takeDamage`, quando o escudo vai a 0 (`shieldBroke === true`), o retorno já traz `shieldBroke`. No `game-loop.js`, se `shieldBroke`, forçar tier do tumble pra pelo menos 3 (independente da fonte).

**6e — Danger triangle.** Novo elemento HUD: `hud.showDangerIndicator(durationMs)`. Um triângulo vermelho pulsante aparece no centro-inferior da tela, com animação de "warning" (pulsa, escala, some). Ícone: `⚠` ou triângulo desenhado em CSS.

**6f — Vignette vermelha.** Reaproveitar `lowHealthVignette` (já existe pra vida baixa), mas com uma **segunda camada** `hud-damage-vignette` (já existe `damageVignette`?) ou um novo `hud-knockback-vignette` que aparece durante o tumble, com intensidade proporcional ao tier.

### Arquivos afetados
- `src/rail.js` — `startTumble`, `triggerBossCollisionTumble`, `triggerHighImpactTumble` (adicionar parâmetro `tier`), nova função `triggerEnemyCollisionTumble(tier, origin)`
- `src/enemies/index.js` — detectar tier por `enemy.kind` e devolver no resultado de `updateEnemies`
- `src/combat/index.js` — propagar o tier do resultado dos inimigos pro retorno de `combat.update`
- `src/game-loop.js` — chamar `rail.triggerEnemyCollisionTumble(tier, origin)`, aplicar `hud.showDangerIndicator`, aplicar vignette
- `src/player.js` — `takeDamage` retorna `shieldBroke` (já retorna)
- `src/hud.js` — nova função `showDangerIndicator`, nova classe CSS pra vignette
- `src/hud-styles.js` — CSS novo

### Critério de aceitação
- Colidir com blaster pequeno: tumble leve, vignette leve, sem Danger.
- Colidir com fragata: tumble forte, vignette forte, Danger aparece.
- Levar projétil nível 4 do chefe: tumble máximo, vignette máxima, Danger aparece, tela treme mais.
- Último hit antes de perder escudo: tumble força tier 3 mesmo se for de projétil pequeno.

---

<a id="7"></a>
## 7. Knockback com duração maior e cancelável por giro/repulsão

### Sintoma
O knockback atual dura ~0.85s-2s, mas **não pode ser cancelado** — se o jogador quer reagir rápido (girar pra esquivar, frear pra reposicionar), ele tem que esperar o knockback terminar. O usuário quer poder **cancelar antecipadamente**.

### Correção proposta

- **7a)** **Aumentar** a duração base do tumble em ~50% (`0.85s → 1.3s` no tier 3 padrão; `1.2s → 1.8s` no tier 4 de boss). Isso dá tempo de ler a "perda de controle" sem ser instantâneo.
- **7b)** **Cancelamento por giro**: se durante o tumble o jogador dispara um giro completo (`rail.triggerFullSpin` chamado), o tumble termina **suavemente** (não abruptamente). Nos primeiros 0.2s depois do cancel, o `tumbleSpin` decai pra 0 em vez de cortar seco.
- **7c)** **Cancelamento por repulsão**: se durante o tumble o jogador ativa a repulsão (agora progressiva, ver item 4), o mesmo cancelamento suave acontece.
- **7d)** **Cancelar suave** significa: `tumbleSpin *= lerp(1, 0, dt / CANCEL_RAMP_TIME)` nos frames seguintes ao cancel, com `CANCEL_RAMP_TIME = 0.2s`. A nave volta ao controle normalmente com uma rampa curta.

### Arquivos afetados
- `src/rail.js` — `startTumble` (duração base), `update` (detecção de cancel), nova função `cancelTumble()`
- `src/game-loop.js` — chamar `rail.cancelTumble()` quando giro ou repulsão são acionados durante tumble

### Critério de aceitação
- Durante o tumble, apertar Z/C duas vezes rapidamente: tumble termina suave em ~0.2s, controle volta.
- Durante o tumble, apertar repulsão: mesmo comportamento.
- Sem cancelar: tumble dura os 1.3s completos.

---

<a id="8"></a>
## 8. Variedade de comportamento dos Blasters por cor

### Sintoma
Existem 6 perfis de Blaster (`orbit`, `advance`, `slow`, `follow`, `circular`, `evasive`), cada um com **cor e emissive próprios**. Em teoria, cada cor = comportamento diferente. Mas in-game, eles **parecem iguais** — todos orbitam, todos avançam devagar, todos disparam de longe.

### Causa provável
Verificar em `blaster.js` a diferença real entre perfis:
- `speedFactor` varia entre 0.15 e 0.95 — **diferença de velocidade é real**, mas sutil.
- `updateBlasterArenaProfileMovement` tem branches por `profile`, mas a diferença entre `follow` e `advance` (por exemplo) é quase invisível.
- **Perfis orbit/circular/follow têm movimento muito similar** — orbitam, se aproximam, param no standoff.
- Nenhum perfil tem uma **assinatura visual única** além da cor (não há: disparo diferente, padrão de voo errático, comportamento defensivo).
- Nenhum perfil tem **padrão de tiro diferente** (todos atiram 1 projétil reto na direção do jogador).

### Correção proposta — assinaturas mecânicas distintas por perfil

**8a — Orbit (ciano)**: comportamento atual. Orbita a uma distância fixa, atira 1 projétil por vez. **Sem mudança** — é o baseline.

**8b — Advance (vermelho)**: comportamento atual + **nunca atira**, só **abala** com o jogador (kamikaze). A cor vermelha já comunica perigo — hoje ele atira, o que não bate com "escarlate kamikaze". Mudança: **remover disparo**.

**8c — Slow (verde)**: comportamento atual (lento) + **dispara em leque triplo** (3 projéteis em ângulo aberto). Fica "verde" = "perigoso à distância".

**8d — Follow (âmbar)**: comportamento atual (segue a distância) + **acelera** se o jogador boosta (reage ao boost). Hoje já tem um standoff menor quando o jogador boosta; deixar mais agressivo — se o jogador boosta, o Follow também boosta.

**8e — Circular (branco)**: comportamento atual (espiral aproximando) + **dispara mais rápido** (fire cooldown reduzido) mas **dano menor** (1 em vez de 2). Fica "branco" = "chuva de tiros fracos".

**8f — Evasive (magenta/roxo)**: comportamento atual (juke) + **teleporte curto** a cada 3s. Fica "roxo" = "invisível/escapista". Implementar como um blink de 2u numa direção aleatória perpendicular, com efeito visual discreto.

### Arquivos afetados
- `src/enemies/blaster.js` — `updateBlasterArenaProfileMovement`, `updateBlasterRailProfileMovement`; adicionar campos de disparo por perfil
- `src/enemies/index.js` — `fireEnemyProjectile` para disparo em leque (perfil slow)

### Critério de aceitação
- Jogar 60s com cada perfil ativo → comportamento **visivelmente** diferente.
- Sem nenhuma mudança visual de cor, é possível distinguir o perfil pelo movimento + padrão de tiro.

---

<a id="9"></a>
## 9. Chefe vermelho e Dourado sumiram do preview do aviso

### Sintoma
Quando o aviso de "Chefe se aproximando em 5s" ou "Inimigo dourado surgindo em 5s" aparece, o usuário costumava ver uma **silhueta grande** do chefe/dourado no horizonte (`combat.showArenaPreview('boss'|'golden')`). Agora **não vê mais nada** — os dois estão "sumidos".

### Causa provável
`enemies/index.js → showArenaPreview(kind)` faz:

```js
const frame = rail.getFrameAt(ARENA_PREVIEW_DISTANCE)  // 220 unidades à frente
mesh.position.copy(frame.position)
mesh.scale.setScalar(ARENA_PREVIEW_SCALE[kind] ?? 1)
```

Mas com o overhaul do fog (Overhaul 4), o `scene.fog` ficou **calibrado pra cobrir ~85% de cobertura** até a distância de spawn máxima. Se a distância de spawn for `TRACK_MAX_SPAWN_DISTANCE = 96`, mas o preview fica a **220 unidades**, o fog em 220 é muito mais denso que o fog em 96 — o preview fica **100% encoberto**, invisível.

### Correção proposta
- **9a)** Reduzir `ARENA_PREVIEW_DISTANCE` de 220 pra algo dentro do range do fog — sugestão: **140** (1.5× o spawn máximo do trilho). Ainda é "distante", mas visível.
- **9b)** **Ignorar o fog** no mesh de preview. Os materiais do chefe (`bossPhaseMaterials`) têm `fog` — se for `MeshPhongMaterial` sem `fog: false` explícito, o three.js aplica fog nele por padrão. Colocar `fog: false` **só na instância do preview** (clone do material ou override).
- **9c)** Aumentar `ARENA_PREVIEW_SCALE` se necessário pra compensar a distância menor (o preview deve continuar parecendo "longe").

### Arquivos afetados
- `src/enemies/index.js` — `showArenaPreview`, `ARENA_PREVIEW_DISTANCE`, `ARENA_PREVIEW_SCALE`
- `src/enemies/boss.js` — possivelmente expor variante do material com `fog: false`

### Critério de aceitação
- 5s antes do chefe, a silhueta dele aparece no horizonte, visível apesar do fog.
- 5s antes do dourado, idem.
- Ao entrar na arena, o preview é removido sem pop visual.

---

<a id="10"></a>
## 10. Background e linhas do ambiente mudam de cor por nível de dificuldade

### Sintoma
Hoje o background é **preto clássico** em todos os níveis (`LEVEL_BACKGROUNDS` é array de 6 valores `0x000000`). O usuário quer que a cada nível de dificuldade (1-9) o background e as linhas do grid mudem de cor, **ainda escura** (não cores vivas — tons escuros distintos).

### Correção proposta
- **10a)** Substituir `LEVEL_BACKGROUNDS` por 9 cores distintas, todas escuras:
  - Nível 1: `0x000000` (preto)
  - Nível 2: `0x0a0510` (roxo muito escuro)
  - Nível 3: `0x05100a` (verde muito escuro)
  - Nível 4: `0x100805` (marrom muito escuro)
  - Nível 5: `0x050a10` (azul muito escuro)
  - Nível 6: `0x100510` (magenta muito escuro)
  - Nível 7: `0x0f0a05` (âmbar muito escuro)
  - Nível 8: `0x0a0f05` (oliva muito escuro)
  - Nível 9: `0x100005` (vermelho muito escuro)
- **10b)** O grid também muda: `grid.material.color` e `grid.material.vertexColors` (ou apenas `color`, dependendo da config atual do GridHelper) deslocam pra um tom compatível com o background do nível.
- **10c)** A mudança acontece **com lerp suave** (0.5s) quando `lastDifficultyLevel` muda — não corte seco.
- **10d)** Interação com fog tático: se `fogTacticalColors` estiver ligado, o fog mantém a cor do perfil; o background continua mudando por nível (mas com blending).

### Arquivos afetados
- `src/main-constants.js` — `LEVEL_BACKGROUNDS` (novas cores)
- `src/game-loop.js` — lógica de transição de cor por nível
- `src/mount-game.js` — grid, aplicar cor inicial
- `src/environment.js` — considerar interação com fog tático

### Critério de aceitação
- A cada nível de dificuldade, o background e as linhas do grid mudam suavemente.
- Todas as cores continuam escuras o suficiente pra não ofuscar o HUD.
- Ao retroceder nível (decayDifficulty), a cor também retrocede.

---

<a id="11"></a>
## 11. Verme, Ímã, Tank, Réplica, Sussurro e Fragata: perceptibilidade e mecânica

### Sintoma
O usuário relata que esses 6 inimigos **mal são perceptíveis in-game** e **mecanicamente não demonstram nada interessante** — suspeita que nem estejam sendo invocados.

### Diagnóstico — o que está realmente acontecendo

**Vermes, Tank, Réplica, Sussurro**: cada um tem `*_SPAWN_CHANCE` em `main-constants.js`:
- `VERME_SPAWN_CHANCE = 0.08` (8%)
- `SUSSURRO_SPAWN_CHANCE = 0.1` (10%)
- `REPLICA_SPAWN_CHANCE = 0.1` (10%)
- Tank **não tem chance** — só spawna via debug ou via código de eventos pontuais (o comentário em `tank.js` diz "spawn de debug/eventos pontuais").

**Fragata**: `FRAGATA_SPAWN_CHANCE = 0.15` **mas só em arena** (`spawnFragata` retorna `null` fora dela).

**Ímã**: `IMA_SPAWN_INTERVAL_MIN_MS = 10000` / `IMA_SPAWN_INTERVAL_MAX_MS = 18000` — spawn próprio, **fora** do sorteio de inimigos comuns.

### Causa raiz provável
Os `*_SPAWN_CHANCE` são **verificados dentro de uma cadeia de `else if`** no `game-loop.js`:

```js
if (Math.random() < TIME_ENEMY_SPAWN_CHANCE) { ... }
else if (Math.random() < MINI_SWARM_CHANCE) { ... }
else if (Math.random() < sentinelaChance) { ... }
else if (Math.random() < REPLICA_SPAWN_CHANCE) { ... }
else if (Math.random() < VERME_SPAWN_CHANCE) { ... }
else if (Math.random() < SUSSURRO_SPAWN_CHANCE) { ... }
else if (Math.random() < HORDA_SPAWN_CHANCE) { ... }
else { ... }
```

Como `MINI_SWARM_CHANCE = 0.22` já consome 22% dos rolls **antes** de chegar nos perfis menores, e há outras chances antes também — a probabilidade efetiva de Réplica/Verme/Sussurro é muito menor que o valor nominal. Por exemplo, Réplica efetiva: `(1 - 0.22 - 0.2 - 0.12) * 0.1 = 0.046` (4.6%). Verme: `~4%`. Sussurro: `~3.5%`.

Considerando que o sorteio só acontece a cada `NORMAL_SPAWN_INTERVAL_MS = 2500ms`, isso dá um Verme a cada ~60 segundos de jogo — **raríssimo**. E quando aparece, o jogador nem percebe porque:

- **Verme**: 4 esferas verdes pequenas alinhadas. Fácil de confundir com detritos.
- **Réplica**: nave ciano espectral, mas ela é **invisível por 2.2s e visível por 0.5s** — na prática, o jogador raramente a vê.
- **Sussurro**: opacidade **0.28 quando "invisível"** — quase imperceptível.
- **Tank**: spawn de debug, nunca no jogo normal.
- **Fragata**: só em arena, e mesmo lá 15% de chance dividida com outros.
- **Ímã**: **invisível na maior parte do tempo** — efeito só notado se o tiro do jogador desviar; jogador raramente nota.

### Melhorias propostas

**11a — Aumentar as chances nominais.** Rebalancear pra valores que façam os inimigos aparecerem:
- `VERME_SPAWN_CHANCE`: 0.08 → **0.14**
- `SUSSURRO_SPAWN_CHANCE`: 0.1 → **0.12**
- `REPLICA_SPAWN_CHANCE`: 0.1 → **0.12**
- `FRAGATA_SPAWN_CHANCE`: 0.15 → **0.22** (só afeta arena)
- **Tank**: adicionar spawn normal (fora de debug) com chance **0.05**
- **Ímã**: reduzir intervalo pra 6-12s (era 10-18s)

**11b — Rebalancear a cadeia de sorteio.** Em vez de cadeia `else if`, usar **rolls independentes** com um "orçamento total" — se nenhum vencer, cai no blaster padrão. Isso muda a probabilidade efetiva de cada um pra perto do valor nominal.

**11c — Melhorar legibilidade visual de cada um:**

| Inimigo | Problema | Melhoria |
|---|---|---|
| **Verme** | Esferas verdes pequenas, fáceis de confundir com detritos | Aumentar tamanho da esfera em 30%, adicionar glow emissive mais forte, adicionar cauda brilhante entre elos |
| **Réplica** | Invisível 2.2s de cada 2.7s | Reduzir janela invisível pra 1.5s, subir opacidade "escondida" de 0.28 pra 0.45 |
| **Sussurro** | Opacidade "invisível" muito baixa (0.28) | Subir opacidade "invisível" pra 0.4, adicionar leve pulso visual quando invisível |
| **Tank** | Nunca aparece no jogo normal | Adicionar spawn normal (11a) — antes, só debug |
| **Fragata** | Só arena + placa girando devagar | Adicionar rotação da placa **2× mais rápida** no primeiro segundo após spawn (efeito "abrindo"), glow âmbar pulsante na placa |
| **Ímã** | Efeito invisível (só no tiro) | Adicionar linha tênue conectando as esferas do enxame ao tiro do jogador quando o campo está ativo, com opacidade baixa (0.3) |

**11d — Mecânicas mais interessantes por inimigo:**

- **Verme**: quando a cabeça morre, os elos restantes **aceleram** (hoje só se separam em cadeias). Adicionar raiva visual (emissive sobe) + aceleração.
- **Ímã**: aumentar o **efeito de curvatura do tiro** quando o jogador dispara normal (hoje é sutil). Aumentar `IMA_FIELD_STRENGTH` de 180 pra 240.
- **Tank**: adicionar uma **rajada tripla** em vez de tiro único — hoje é só um blaster lento.
- **Réplica**: adicionar **dash lateral** quando o jogador atira nela (reação evasiva) — hoje é só "espelho do movimento lateral".
- **Sussurro**: ao invocar reforços, **desaparecer completamente** por 2s (fica invisível de verdade) — hoje só pisca.
- **Fragata**: adicionar **investida** curta a cada 5s — sai do standoff, avança rápido por 0.5s, volta. Hoje é passiva.

### Arquivos afetados
- `src/main-constants.js` — chances de spawn, intervalos
- `src/game-loop.js` — lógica da cadeia de spawn (11b)
- `src/enemies/verme.js`, `replica.js`, `sussurro.js`, `fragata.js`, `ima.js`, `tank.js` — legibilidade e mecânica
- `src/enemies/index.js` — geometrias compartilhadas (Verme, Ímã)

### Critério de aceitação
- Jogar 5 minutos de partida: ver **pelo menos um** de cada um (Verme, Réplica, Sussurro, Ímã) sem precisar de debug.
- Cada um tem reação visual clara ao entrar em cena (não é mais "apareceu do nada").
- Mecanicamente, cada um faz algo que o distingue dos outros.

---

## Apêndice — resumo por arquivo

| Arquivo | Itens relacionados |
|---|---|
| `main-constants.js` | 4 (novas constantes de repulsão), 6 (tiers), 10 (cores de level), 11 (chances de spawn) |
| `flow-boss.js` | 1 |
| `game-loop.js` | 3, 4, 6, 7, 10, 11 |
| `combat/projectiles.js` | 3 |
| `combat/lockon.js` | 2 |
| `enemies/index.js` | 2, 6, 9, 11 |
| `enemies/blaster.js` | 8 |
| `enemies/verme.js` | 11 |
| `enemies/replica.js` | 11 |
| `enemies/sussurro.js` | 11 |
| `enemies/fragata.js` | 11 |
| `enemies/ima.js` | 11 |
| `enemies/tank.js` | 11 |
| `player.js` | 4, 6 |
| `rail.js` | 6, 7 |
| `effects.js` | 4, 5 |
| `hud.js` / `hud-game.js` | 2, 5, 6 |
| `hud-styles.js` | 2, 6 |
| `mount-game.js` | 10 |
| `environment.js` | 10 |

---

*Fim do documento.*

Por favor fazer perguntas para literalmente qualquer mínima ambiguidade ou indecisão.


---

<a id="12"></a>
## 12. Mira normal se abre em verde conforme o carregamento avança

### Sintoma
Hoje a mira normal (o `.reticle` com o `.reticle-ring`) tem **dois estados visuais apenas**:
- **Normal**: anel branco pequeno, sempre do mesmo tamanho.
- **Aiming** (`isAimingAtEnemy === true`): anel engrossa e muda de cor (vermelho/laranja — é o "hint" de que tem inimigo na frente).

Isso não comunica nada sobre **quantos inimigos podem ser travados** conforme o jogador carrega o tiro. O jogador não sabe, olhando pra mira, se está carregando "o bastante pra pegar 1 alvo" ou "o bastante pra pegar 4 alvos" — só descobre quando solta o botão e vê quantos projéteis teleguiados saíram.

### Causa provável
`hud-game.js → setReticleAiming(active)` só alterna a classe CSS `.aiming`. Nada no HUD lê `currentHomingAllowedTargets(state.fireHeldMs)` — a função que o game-loop já usa pra decidir o número de travas.

### Correção proposta

**12a — Abertura animada e contínua, com a mesma lógica de expansão do charge glow.**

A mira **não salta** de tamanho quando uma trava extra fica disponível. Ela se **expande lentamente durante todo o carregamento**, do mesmo jeito que o `charge glow` (as esferas verde-lima em `effects.setChargeGlow`) se expande conforme a fração de carga sobe. A leitura é: "a mira está respirando junto com a carga, ficando maior conforme enche".

Especificamente:

- **Estado "parado" (não carregando)**: raio visual `1.0`. Cor base do jogo (branco do `.reticle-ring` atual, ou o vermelho do `.aiming` se houver inimigo na frente).
- **No instante em que o jogador começa a carregar** (`fireHeldMs >= homingChargeMinMs`): a mira entra em estado `charging` — cor vira verde, e **começa a expandir** de `1.0` em direção ao seu tamanho máximo.
- **Durante todo o carregamento** (`fireHeldMs` entre `homingChargeMinMs` e `homingChargeMaxMs`): a mira se expande **linearmente** entre `1.0` e o tamanho máximo, na mesma proporção que a carga. Ou seja: `fraçãoCarga = (fireHeldMs - homingChargeMinMs) / (homingChargeMaxMs - homingChargeMinMs)`, e `escala = lerp(1.0, tamanhoMáximo, fraçãoCarga)`.
- **No ápice** (`fraçãoCarga === 1`): mira no tamanho máximo, verde saturado, com glow forte. É o "instante de ouro" — bate com o momento em que o `charge_max_ready` já toca e o jogador sabe que soltou no máximo.

**12b — "Níveis" não são steps discretos, são o teto de tamanho.**

O número de travas disponíveis a cada instante (`currentHomingAllowedTargets`) **determina até onde a mira pode crescer** — não desenha "steps" visuais discretos na mira.

Exemplo prático: se o jogador tem `homingMaxTargets = 4` (teto de 4 travas), a mira cresce de `1.0` até, digamos, `1.8` ao longo de todo o carregamento. Nesse caminho, os momentos em que o `currentHomingAllowedTargets` passa de 1 → 2 → 3 → 4 são **invisíveis como saltos** — a mira apenas continua crescendo suavemente, e o lock-on do jogo (que roda por trás) é que libera cada trava nova no seu tempo.

O jogador lê isso como: *"a mira está enchendo, e quando ela para de crescer eu sei que estou no máximo"*. É a mesma linguagem visual do charge glow.

**12c — Alvo de escala final ajustável pelo teto.**

O tamanho máximo da mira precisa ser **o mesmo** sempre que a carga chega no máximo, independente do teto de alvos? Ou deve ser maior quando o teto é maior? Decisão de design:

- **Opção A (recomendada)**: tamanho máximo **fixo** em ~1.8×. O que muda é só a cor final: verde mais saturado se o teto de alvos for maior. Mais simples, menos ruído visual.
- **Opção B**: tamanho máximo escala com o teto (`1.4` pra teto 1, `1.8` pra teto 4, `2.2` pra teto 6+). Reforça visualmente builds de "multi-lock" — mas deixa a mira gigante em runs focadas em homing.

Recomendo **A** por clareza, com a cor fazendo o trabalho de comunicar "quanto maior o teto, mais brilhante o verde no final".

**12d — Cor verde em gradiente (não em saltos).**

A cor da mira também transiciona **suavemente** com a fração de carga:

- `fraçãoCarga = 0`: verde suave (`#3df0a6`, o mesmo do health arc).
- `fraçãoCarga = 1`: verde saturado brilhante (`#00ff88`) com `box-shadow` mais forte.

Sem saltos intermediários. A cor vira parte do "respiro" da mira.

**12e — Conflito com `.aiming` (vermelho).**

O `.aiming` atual (vermelho) é ativado quando há **inimigo vivo na frente da mira**. Enquanto o jogador carrega, os dois estados coexistem. Regra de precedência:

- Se estiver carregando **e** houver inimigo na mira: a mira fica **verde** (o carregamento vence visualmente) **mas** ganha uma borda interna pulsante vermelha — sinal de "aqui tem alvo pra travar, se você continuar enchendo".
- Se não estiver carregando **e** houver inimigo: `.aiming` puro (vermelho, como hoje).
- Se estiver carregando **e não** houver inimigo: verde puro (só indica o progresso da carga).

**12f — Feedback no momento de cada trava liberada.**

Como a mira não faz "steps" discretos, o jogador perde a leitura de "agora você liberou mais uma trava". Pra não perder esse micro-feedback:

- No instante em que `currentHomingAllowedTargets` **aumenta de valor** (1 → 2, 2 → 3, etc.), disparar um **pulso rápido na mira** — tipo um "flash" curto de 150ms onde o `box-shadow` verde fica momentaneamente mais forte e a mira dá uma micro expansão de +5% que volta. É o mesmo princípio dos "pulsos de revelação" das camadas do charge glow (`CHARGE_GLOW_LAYERS` surgem uma a uma).

Isso preserva a informação sem quebrar a animação contínua da mira.

**12g — Reset visual.**

Ao soltar o botão de fogo (`inputState.firing === false`), a mira volta **rápido** pra escala `1.0` e cor base — mas não com corte seco: transição de 120ms (curta, mas perceptível). Ao começar a carregar de novo, a mira entra no estado `charging` com transição suave pra escala base do carregamento (mesmo timing).

**12h — Mesma técnica visual do charge glow.**

A implementação no HUD deve **espelhar a lógica de `effects.setChargeGlow`**: uma fração de 0..1 que alimenta `escala = lerp(min, max, fração)` e `cor = lerp(verdeClaro, verdeSaturado, fração)`. Não inventar uma animação nova — reaproveitar a linguagem visual que o jogador já conhece da carga.

### Arquivos afetados
- `src/hud-game.js` — novo método `setReticleCharge(fraction, maxTargets)`; substitui a necessidade de `setReticleChargeLevel` (a fração já contém tudo); `setReticleAiming` mantém a assinatura atual e passa a coexistir com o novo estado
- `src/hud-styles.js` — CSS do `.reticle-ring` com `--charge-frac` custom property; novas regras `.reticle-ring.charging`, transição suave de `transform: scale(...)`, transição suave de cor e `box-shadow`
- `src/game-loop.js` — computar `fraçãoCarga` a cada frame (a função **já calcula** no branch de carregamento: `chargeFrac = Math.min(1, (state.fireHeldMs - homingChargeMinMs) / (homingChargeMaxMs - homingChargeMinMs))`) e chamar `hud.setReticleCharge(chargeFrac, effectiveMax)`; detectar quando `currentHomingAllowedTargets` aumenta de valor e chamar `hud.pulseReticleLock()` (micro-pulso verde)

### Critério de aceitação
- Segurar o botão de fogo: a mira cresce **suavemente** ao longo dos 2.2s de carga, não salta.
- No momento de cada trava nova liberada, um micro-pulso verde passa pela mira (~150ms).
- Soltar no máximo: mira no tamanho e brilho máximo, verde saturado.
- Soltar no mínimo: mira só um tiquinho maior que o base, verde suave.
- Soltar o botão: mira volta ao base em ~120ms, sem pop.
- Com inimigo na mira durante a carga: verde + borda interna vermelha pulsante.
- Com teto de 6 travas (build de multi-lock): mira chega a 1.8× com verde muito brilhante no final, sem ficar maior que o permitido (Opção A de 12c).
- Com Krystal dando +1 alvo: `effectiveMax` sobe, a cor final fica um pouco mais brilhante (a escala final não muda se Opção A).

---

### Nota de design

A razão pra usar a **mesma linguagem visual do charge glow** (fração → escala + cor, tudo contínuo) em vez de steps discretos é **carga cognitiva**: o jogador já está processando "a carga está enchendo" pelo glow verde-lima do canhão. Se a mira tivesse uma linguagem própria (steps discretos, saltos de tamanho), o cérebro teria que aprender **duas** representações do mesmo conceito. Reaproveitando, é uma representação só — o glow no canhão e a mira no centro da tela comunicam a mesma informação em dois pontos focais.

O micro-pulso no momento de cada trava liberada (12f) é o único "step" que sobra — e é justamente o que precisa ser sentido com precisão ("agora eu posso travar mais um"), então vale o detalhe.

---

Se concordar, esse item substitui o 12 anterior. A linha do apêndice continua a mesma (só `hud-game.js`, `hud-styles.js`, `game-loop.js`).