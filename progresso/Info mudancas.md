Aqui está o documento completo pra você mandar pro Claude. É autocontido — explica contexto, cada etapa, cada arquivo criado/modificado, os bugs corrigidos de passagem, o estado atual (com o erro que você está vendo) e próximos passos.

---

```markdown
# Relatório de Overhaul — Star Anki (main.js)

Documento autocontido pra retomar contexto em outra sessão (Claude). Cobre: (1) o que era o
`main.js` antes, (2) as 7 etapas de refatoração executadas, (3) arquivos criados e o que cada
um contém, (4) bugs latentes corrigidos de passagem, (5) estrutura final esperada, (6) estado
atual — com um bug em aberto — e (7) próximos passos possíveis.

---

## 1. Contexto

**Projeto**: Star Anki — um rail shooter de estudo que transforma um baralho exportado do
Anki num jogo estilo Star Fox 64, com modo trilho (rail) e all-range (arena), chefe, inimigo
dourado, cartas roguelike, etc. Roda no navegador, publicado em GitHub Pages.

**Situação antes do overhaul**: o `main.js` era um monolito de ~1050 linhas contendo:
- Constantes numéricas soltas (~120 linhas) misturadas com lógica.
- ~40 `let` mutáveis vivendo dentro do closure de `mountGame(session, deck, menu)`.
- Setup da cena (scene/camera/renderer/luzes/grid).
- Construção dos sistemas de jogo (rail/effects/enemies/player/combat/input).
- Máquina de estados com ~14 fases (`combat`, `questionPause`, `bossQuestionPause`,
  `bossBuildup`, `bossBuildupResolution`, `bossFight`, `bossVictory`, `goldenArena`,
  `goldenResolution`, `arenaCutscene`, `deathCutscene`, `cardChoice`, `resolution`).
- Todo o fluxo do chefe (caçada de orbes, invocação, luta, vitória).
- Todo o fluxo do dourado (arena, pergunta-bônus).
- Fluxo de pergunta normal + cartas roguelike.
- Fluxo de progressão (escalada por erro).
- Dois blocos de cutscene (arena + morte) com early-return no topo do `tick()`.
- O `tick()` inteiro (~350 linhas).
- `enterCombat`, `applyHealthLoss`, `endSector`, `teardown`, `onResize`.
- O `hud.debug.bind(createDebugActions({...}))`.

O projeto já tinha precedente de modularização em outras partes:
- `combat.js` → `combat/index.js` + `combat/projectiles.js` + `combat/targets.js` + `combat/lockon.js`
- `enemies.js` → `enemies/*.js` (um arquivo por classe de inimigo)
- `hud.js` → `hud-*.js` (um arquivo por tela) + `hud.js` como fachada

O `main.js` era o último monolito grande restante. O objetivo do overhaul foi aplicar o mesmo
padrão de modularização que já existia no projeto, sem alterar comportamento nenhum.

**Princípio central do overhaul**: zero mudança de comportamento. Apenas reorganização de
código. Cada entrega foi pensada para ser aplicável isoladamente (troca de arquivo inteiro,
nunca patch incremental).

---

## 2. As 7 etapas de refatoração

### Etapa 1 — Constantes → `main-constants.js`

**O que saiu de main.js**: todos os `const X = ...` numéricos no topo do arquivo (~120 linhas)
que não dependiam de nada em runtime — `CYCLE_MS`, `ENEMY_KILL_CYCLE_ADVANCE_MS`,
`WARNING_MS`, `FEEDBACK_MS`, `WRONG_FEEDBACK_MS`, `SPEED_STEP`, `BOOST_EVERY_CORRECT`,
`GROUND_Y`, `INVINCIBILITY_FLICKER_MS`, `HIT_SHAKE_DURATION_MS`,
`SHIP_SHAKE_MAGNITUDE`, `CAMERA_SHAKE_MAGNITUDE`, `HOMING_KILL_SHAKE_MS`,
`LEVEL_BACKGROUNDS`, `RETICLE_AHEAD`, `RETICLE_OVERSHOOT_FACTOR`,
`RETICLE_SETTLE_RATE`, `BOSS_EVERY_QUESTIONS`, `BOSS_CYCLE_MS`, `BOSS_ENEMY_INTERVAL_MULT`,
`BOSS_BUILDUP_MS`, `BOSS_QUESTION_COUNT`, `BOSS_HUNT_BONUS_MS`, `BOSS_BASE_HP`,
`BOSS_HP_PER_ERROR`, `BOSS_DEFEAT_BONUS`, e o bloco inteiro de `BOSS_SPREAD_*` /
`BOSS_EXTRA_ENEMIES_*` / `ENEMY_INTERVAL_*` / `ENEMY_AGGRESSION_*` / `ENEMY_CAP_*` /
`NORMAL_SPAWN_*` / `BONUS_INTERVAL_*` / `GOLDEN_*` / `TIME_ENEMY_*` / `DETRITO_*` /
`REPLICA_SPAWN_CHANCE` / `VERME_SPAWN_CHANCE` / `SUSSURRO_SPAWN_CHANCE` /
`FRAGATA_SPAWN_CHANCE` / `IMA_SPAWN_INTERVAL_*` / `ARENA_WARNING_*` /
`ARENA_CUTSCENE_*` / `BOSS_SUMMON_CUTSCENE_MS` / `DEATH_CUTSCENE_*` /
`HOMING_LOCK_INTERVAL_MS` / `DODGE_TAP_WINDOW_MS` / `DEFLECT_RADIUS` / `RAM_DAMAGE` /
`LOW_HEALTH_THRESHOLD_FRAC`.

**Arquivo criado**: `main-constants.js` — contém só os `export const`, com os mesmos
comentários históricos (marcadores tipo "v0.29.6", "Fase 5", "pedido do usuário") que existiam
no `main.js`. Nenhum valor mudou.

**`main.js`**: passou a importar tudo de `main-constants.js`. Comportamento idêntico.

---

### Etapa 2 — Estado → objeto `state`

**O que mudou dentro do `main.js`**: os ~40 `let` soltos no closure de `mountGame` viraram
propriedades de um único objeto `state` criado no início da função. Por exemplo:

```js
// ANTES:
let phase = null
let phaseTimer = 0
let cycleTimer = 0
let bossHealthBonus = 0
let enemyIntervalMin = ...
let lastDodgeLeftTapAt = -Infinity
let hitShakeTimer = 0
// ... mais ~35 let

// DEPOIS:
const state = {
  phase: null,
  phaseTimer: 0,
  cycleTimer: 0,
  bossHealthBonus: 0,
  enemyIntervalMin: ...,
  lastDodgeLeftTapAt: -Infinity,
  hitShakeTimer: 0,
  // ... resto
}
```

**Motivo**: destravar as próximas etapas. Extrair flows (`bossFlow`, `questionFlow`, etc.)
pra arquivos separados exige que eles recebam o estado por referência — com `let` soltos não dá
pra passar o closure inteiro, mas com um objeto único é só passar `state` como deps.

**Campos que ficaram em `state`** (organizados por seção no literal):
- Loop/debug: `debugVisible`, `debugFlags`, `lastTime`, `rafId`, `stopped`, `paused`
- Máquina de estados: `phase`, `phaseTimer`, `cycleTimer`, `enemyTimer`, `questionResult`,
  `pendingSectorOver`, `pendingQuestionKind`, `pendingCardChoice`, `consecutiveCorrect`,
  `speedMultiplier`, `isBossCycle`, `isReviewQuestion`
- Chefe: `bossHealthBonus`, `bossBuildupTimer`, `bossOrbsRemaining`, `bossDifficulty`
- Dourado: `goldenTimer`, `goldenCard`
- Cutscene arena: `arenaCutsceneTimer`, `arenaCutsceneDurationMs`, `arenaCutsceneOnDone`,
  `arenaCutsceneBaseCameraPos`, `arenaCutsceneBaseForward`, `arenaCutsceneBaseRight`,
  `arenaPreviewShown`
- Cutscene morte: `deathCutsceneTimer`, `deathCutscenePos`, `deathCutsceneOnDone`
- Input/timing: `fireHeldMs`, `reticleOffsetX`, `reticleOffsetY`, `lastDodgeLeftTapAt`,
  `lastDodgeRightTapAt`, `lastRepulsionTapAt`, `hitShakeTimer`
- Dificuldade: `enemyIntervalMin`, `enemyIntervalMax`, `enemyAggression`,
  `wrongAnswerCount`, `extraSpawnPerBatch`, `enemyDamageValue`, `enemyCap`
- Timers de spawn: `normalSpawnTimer`, `detritoTimer`, `imaTimer`, `bonusTimer`

**Detalhe**: os campos que dependiam de funções locais (`state.goldenTimer =
randomGoldenInterval()`, `state.detritoTimer = randomDetritoInterval()`, etc.) foram
inicializados em `0` no literal do objeto e receberam valor real logo depois, para não depender
de hoisting de function declaration dentro de object literal.

**`debugFlags` já era objeto** (por comentário em `debug-actions.js`), então virou
`state.debugFlags` — a mesma referência continua sendo passada pra `createDebugActions`.

**Zero mudança de comportamento**: todos os `x = ...` e `x === ...` viraram `state.x = ...` e
`state.x === ...`. Nenhum nome de variável mudou.

---

### Etapa 3 — Cutscenes → `cutscenes.js`

**O que saiu de main.js**: os dois blocos de cutscene que viviam no topo do `tick()` como
early-returns:

1. `if (state.phase === 'arenaCutscene') { ... }` — transição pro all-range antes do
   chefe/dourado.
2. `if (state.phase === 'deathCutscene') { ... }` — câmera lenta segurando na explosão do
   chefe/dourado.

**Arquivo criado**: `cutscenes.js`, exportando `createCutscenesSystem(deps)` que devolve
`{ updateArenaCutscene, updateDeathCutscene }`. Cada função recebe `dt` (ou `rawDt`) e devolve
`true`/`false` — "tratei este frame ou não". O `main.js` faz `if (cutscenes.updateArenaCutscene(dt)) return`.

**Detalhe preservado**: o `arenaCutscene` usa `dt` (escalado por slowMo de debug), o
`deathCutscene` usa `rawDt` (NÃO escalado). Isso é uma assimetria intencional do código
original — a cutscene de morte já é lenta por conta própria via
`DEATH_CUTSCENE_TIME_SCALE`; se usasse `dt`, um slowMo de debug em cima dela desaceleraria duas
vezes e travaria o jogador num limbo visual.

**Comportamento idêntico** — só o `renderer.render(scene, camera)` e as mutações de `state`
continuam iguais.

---

### Etapa 4 — Fluxo chefe/dourado → `flow-boss.js`

**O que saiu de main.js**: os 11 métodos que compõem os dois fluxos mais complexos do jogo
(chefe + dourado) mais a cutscene de transição compartilhada:

- `startArenaCutscene(kind, onDone, durationMs)` — dispara a cutscene de transição pra
  all-range (usada tanto pro chefe quanto pro dourado).
- `enterBossBuildup()` — fase de caçada de orbes.
- `triggerBossQuestion()` — abre o modal de pergunta quando um orbe é atingido.
- `settleBossBuildupQuestion(outcome)` — resolve a pergunta durante a caçada.
- `finishBossHunt()` — fim da caçada (tempo esgotou), dispara a cutscene de invocação.
- `enterBossFight()` — entra na luta contra o chefe de verdade.
- `enterGoldenArena()` — entra na arena dourada.
- `exitGoldenArenaVisuals()` — limpa os efeitos visuais da arena dourada.
- `resumeCombatFromGolden()` — volta ao combate normal.
- `enterGoldenAlternatives()` — abre o modal da pergunta-bônus do dourado.
- `settleGoldenBonus(outcome)` — resolve a pergunta-bônus.
- `handleBossDefeated(hitWorldPos)` — monta a cutscene de morte quando o chefe morre.
- `handleGoldenDefeated(hitWorldPos)` — mesma coisa pro dourado.

**Arquivo criado**: `flow-boss.js`, exportando `createBossFlow(deps)` que devolve todos os
métodos acima. Os deps incluem:
- `state` (por referência), `session`, `deck`, `menu` (o pacote com `sessionResults` e
  `renderEndScreen`).
- `camera`, `hud`, `combat`, `rail`.
- Helpers de progressão: `applyDifficulty`, `applyBossDifficulty`, `applySpeedProgression`,
  `currentBossSpread`, `currentBossExtraEnemies`, `randomGoldenInterval` — na etapa 4 esses
  ainda vinham via function declarations hoisted do `main.js`; na etapa 6 migraram pra
  `flow-progression.js` e passaram a vir de lá.
- Callbacks que voltam pro `main.js`: `applyHealthLoss`, `endSector`.

**Assimetria preservada**: `handleBossDefeated` NÃO checa fase internamente — a guarda de fase
fica no `main.js` (`if (events.bossDefeated && state.phase === 'bossFight')`), porque era um
`if` de topo de tick no original. Já `handleGoldenDefeated` também não checa — a guarda é o
branch `state.phase === 'goldenArena'` no tick. Essa assimetria foi propositalmente preservada.

**Migração do `setTimeout`**: `enterBossFight` mantém o `setTimeout(() => { camera.fov = 70; ... },
500)` pra desfazer o "punch" de FOV depois de meio segundo. Não é ideal (o timeout pode disparar
depois do teardown), mas está preservado como estava — resolver isso é um item separado.

---

### Etapa 5 — Fluxo pergunta normal + cartas → `flow-question.js`

**O que saiu de main.js**:
- `applyRoguelikeCard(card)` — aplica uma carta escolhida (chama `player.applyCard`, sincroniza
  cooldown de tiro e wingman count no `combat`, atualiza HUD de vidas).
- `buildCardExcludeSet()` — filtro de cartas já no cap (delega pra `player.buildCardExcludeSet`).
- `enterCardChoice(onDone)` — abre o modal de 3 cartas roguelike.
- `enterAlternatives()` — abre o modal da pergunta normal.
- `settleQuestion(outcome)` — resolve a pergunta normal (acerto/erro).

**Arquivo criado**: `flow-question.js`, exportando `createQuestionFlow(deps)` que devolve os 5
métodos acima.

**Detalhe importante**: `forceAnswerOutcome(correct)` NÃO migrou. Ele é o único ponto que
roteia pros 3 fluxos de pergunta (chefe / dourado / normal), então mora no `main.js`, onde os
dois flows são visíveis juntos:

```js
function forceAnswerOutcome(correct) {
  if (!state.questionResult) return
  const outcome = { ... }
  if (state.phase === 'bossQuestionPause') bossFlow.settleBossBuildupQuestion(outcome)
  else if (state.phase === 'questionPause' && state.pendingQuestionKind === 'golden') bossFlow.settleGoldenBonus(outcome)
  else if (state.phase === 'questionPause' && state.pendingQuestionKind === 'normal') questionFlow.settleQuestion(outcome)
}
```

**Bug latente corrigido de passagem**: os imports `GOLDEN_SPREAD_MIN` e `GOLDEN_SPREAD_MAX`
tinham sumido do bloco em `main.js` na etapa 4 (mas o `createDebugActions` recebia esses
valores — chegavam como `undefined` no debug "Spawnar especial dourado"). Repostos na etapa 5.
Também removido `FEEDBACK_MS` que continuava importado sem uso depois da etapa 4.

---

### Etapa 6 — Progressão → `flow-progression.js`

**O que saiu de main.js**: o cluster de escalada por erro + todos os randomizadores de
intervalo:
- `randomDetritoInterval()`, `randomImaInterval()`, `randomEnemyInterval()`,
  `randomBonusInterval()`, `randomGoldenInterval()`.
- `applySpeedProgression(type)` — combo de velocidade por acerto consecutivo.
- `applyDifficulty()` — escalada por erro (intervalo de spawn, agressão, enemyCap, spawn
  bônus, dano de projétil).
- `applyBossDifficulty()` — escalada do chefe.
- `currentEnemyCap()`, `currentBossSpread()`, `currentBossExtraEnemies()` — consultas de
  escalada.

**Arquivo criado**: `flow-progression.js`, exportando `createProgressionFlow(deps)` que devolve
os 11 métodos acima.

**Mudança estrutural**: nas etapas 4-5, `bossFlow` e `questionFlow` recebiam
`applyDifficulty`/`currentBossSpread`/etc. via function declarations hoisted do `main.js` (uma
"gambiarra elegante" — funcionava porque declarations são içadas, mas era frágil). A partir
da etapa 6, esses helpers vêm explicitamente do objeto `progression.*`:

```js
const progression = createProgressionFlow({ state, rail, combat })

const bossFlow = createBossFlow({
  state, session, deck, menu,
  camera, hud, combat, rail,
  applyDifficulty: progression.applyDifficulty,
  applyBossDifficulty: progression.applyBossDifficulty,
  applySpeedProgression: progression.applySpeedProgression,
  currentBossSpread: progression.currentBossSpread,
  currentBossExtraEnemies: progression.currentBossExtraEnemies,
  randomGoldenInterval: progression.randomGoldenInterval,
  applyHealthLoss, endSector,
})
```

---

### Etapa 7a — Game loop → `game-loop.js`

**O que saiu de main.js**: o `tick()` inteiro (~350 linhas) + o helper
`currentHomingAllowedTargets(heldMs)` que só ele usava.

**Arquivo criado**: `game-loop.js`, exportando `createGameLoop(deps)` que devolve
`{ start, stop }`. `start()` reseta `state.lastTime` e agenda o primeiro RAF; `stop()` seta
`state.stopped = true` e cancela o RAF pendente.

**Assinatura de deps**: recebe `state`, `session`, `bindings`, `showEnemyHealthBars`, todos os
sistemas (`hud`, `scene`, `camera`, `renderer`, `rail`, `effects`, `player`, `combat`,
`input`), os 4 flows (`progression`, `cutscenes`, `bossFlow`, `questionFlow`) e os 3 callbacks
que vêm do mount (`enterCombat`, `applyHealthLoss`, `endSector`).

**Ordem de chamadas preservada**: input → pause/debug → early-return de fases de pausa
(bossQuestionPause/questionPause/cardChoice) → cutscenes → hitShake → player.update →
rail.update → camera.updateMatrixWorld → reticle → tiro → dodge/propulsion/repulsion → events
→ dano ao jogador → branches de fase → HUD sync → render. Nada reordenado.

---

### Etapa 7b — Mount game → `mount-game.js` + `main.js` bootstrap

**O que saiu de main.js**: o `mountGame` inteiro. Ficou só o setup da cena, criação dos
sistemas, criação dos 4 flows, criação do `state`, `enterCombat`, `applyHealthLoss`,
`endSector`, `onResize`, `teardown`, `forceAnswerOutcome`, o bind do debug e a chamada final
pro `gameLoop.start()`.

**Arquivo criado**: `mount-game.js`, exportando `mountGame(session, deck, menu)` — mesma
assinatura de antes, consumida por `createGameMenu(mountGameFn)`.

**`main.js` virou bootstrap puro** (~10 linhas):

```js
import { initMobileSupport } from './mobile.js'
import { createGameMenu } from './game-menu.js'
import { mountGame } from './mount-game.js'

initMobileSupport()
const { restart } = createGameMenu(mountGame)
restart()
```

**`teardown` agora chama `gameLoop.stop()`** em vez de `cancelAnimationFrame(state.rafId)`
direto — o `game-loop.js` é dono do ciclo de vida do RAF.

---

## 3. Bugs latentes corrigidos de passagem

Estes são bugs que já existiam no código original (ou foram introduzidos por uma entrega
anterior do overhaul) e que foram corrigidos durante as etapas:

### 3.1 `faster-charge` nunca sorteada (bug pré-existente, ainda NÃO corrigido)

**Local**: `player.js`, função `buildCardExcludeSet()`.

**Bug**: a linha `if (homingChargeMinMs <= HOMING_CHARGE_MIN_FLOOR_MS) exclude.add('faster-charge')`
é verdadeira DESDE O INÍCIO DA PARTIDA, porque `homingChargeMinMs = HOMING_CHARGE_MIN_MS =
1000` e `HOMING_CHARGE_MIN_FLOOR_MS = 1000`. Resultado: a carta `faster-charge` NUNCA é
sorteada em nenhuma run.

**Status**: identificado, NÃO corrigido ainda. Esperando decisão sobre o overhaul.

### 3.2 `GOLDEN_SPREAD_MIN` / `GOLDEN_SPREAD_MAX` undefined no debug (introduzido na etapa 4)

**Local**: `main.js`, bloco de imports.

**Bug**: na etapa 4, quando o `bossFlow` foi criado, os imports de `GOLDEN_SPREAD_MIN` e
`GOLDEN_SPREAD_MAX` sumiram do bloco, mas `hud.debug.bind(createDebugActions({ GOLDEN_SPREAD_MIN,
GOLDEN_SPREAD_MAX, ... }))` continuava passando esses valores. Chegavam como `undefined`, então
a ação de debug "Spawnar especial dourado" spawnava sem distância definida.

**Status**: corrigido na etapa 5 (repostos no bloco de imports do `main.js`).

### 3.3 `FEEDBACK_MS` importado sem uso (introduzido na etapa 4)

**Local**: `main.js`, bloco de imports.

**Bug**: na etapa 4, `FEEDBACK_MS` deixou de ser usado no `main.js` (migrou pro
`flow-boss.js`), mas continuou no bloco de imports.

**Status**: corrigido na etapa 5 (removido do bloco).

---

## 4. Estrutura final pós-overhaul

| Arquivo | Responsabilidade | Linhas aprox. |
|---|---|---|
| `main.js` | Bootstrap: initMobileSupport + createGameMenu + restart | ~10 |
| `mount-game.js` | Setup da cena + sistemas + flows + enterCombat + teardown + debug bind | ~250 |
| `game-loop.js` | O `tick()` + `currentHomingAllowedTargets` | ~380 |
| `cutscenes.js` | `arenaCutscene` + `deathCutscene` | ~110 |
| `flow-boss.js` | Chefe (caçada → luta → vitória) + Dourado + `startArenaCutscene` + handlers | ~280 |
| `flow-question.js` | Pergunta normal + cartas roguelike | ~120 |
| `flow-progression.js` | Escalada por erro + randomizadores de intervalo | ~150 |
| `main-constants.js` | Todas as constantes numéricas | ~200 |

Comparado com o `main.js` original de ~1050 linhas, o `main.js` agora tem ~10 linhas de código
útil. O "cérebro" da partida se distribui nos 7 arquivos acima.

---

## 5. Padrão usado em todos os flows

Cada flow extraído segue o mesmo padrão:

```js
export function createXFlow(deps) {
  const {
    state, // objeto único compartilhado por referência
    // ...outros deps (session, deck, menu, sistemas, helpers)
  } = deps

  function algumMetodo() {
    state.phase = 'algo' // mexe direto no state
    // ...
  }

  return {
    algumMetodo,
    // ...outros métodos públicos
  }
}
```

O `state` é sempre passado por referência — nenhum flow tem estado próprio, todos operam no
mesmo objeto. Isso significa que mutações em `state.phase` de um flow são visíveis
imediatamente em qualquer outro flow ou no `game-loop.js`.

---

## 6. Estado atual — BUG EM ABERTO

### Sintoma

Ao carregar a página no Chrome (produção, GitHub Pages), o console mostra:

```
Uncaught SyntaxError: The requested module './flow-boss.js' does not provide an export named
'createBossFlow'
    at flow-boss.js:18:18
```

Linha 18 do `flow-boss.js` corresponde a `import { createBossFlow } from './flow-boss.js'` no
`main.js` (ou o import dentro de `mount-game.js`).

### Diagnóstico

O erro `does not provide an export named 'createBossFlow'` significa que:
1. O navegador CONSEGUIU carregar `flow-boss.js` (não é 404).
2. O módulo `flow-boss.js` carregou mas NÃO tem `export function createBossFlow(deps) { ... }`.

A causa mais provável: o arquivo `flow-boss.js` no repo está truncado, vazio, ou em uma versão
antiga que não tem esse export.

### Verificação feita

O usuário abriu `https://ratuckk.github.io/flow-boss.js` (sem o path `/Star-Anki/`) e viu uma
página 404 — mas isso NÃO é o problema real (essa URL está errada; o correto seria
`https://ratuckk.github.io/Star-Anki/flow-boss.js`).

Além disso, o usuário colou o conteúdo do `main.js` atual no repo e ele está num **estado
misto**: tem imports de `flow-boss.js` e criação de `bossFlow`, mas também mantém as funções
antigas (`enterBossBuildup`, `triggerBossQuestion`, `settleBossBuildupQuestion`, etc.)
definidas inline. Isso sugere que o paste da etapa 4 NÃO substituiu o arquivo inteiro — colou
por cima parcialmente.

### O que precisa ser feito

O usuário precisa:
1. Substituir TODOS os arquivos envolvidos por versões limpas (o `main.js` bootstrap puro, o
   `flow-boss.js` completo, o `flow-question.js` completo, o `flow-progression.js` completo,
   o `game-loop.js` completo, o `mount-game.js` completo).
2. Confirmar que `main-constants.js` e `cutscenes.js` estão no repo (etapas 1 e 3) — não
   precisam mexer.
3. Hard refresh no Chrome (Cmd+Shift+R) pra limpar cache de módulos ES.
4. Verificar em `https://ratuckk.github.io/Star-Anki/flow-boss.js` (com o path completo) se o
   arquivo servido tem `export function createBossFlow(deps) { ... }` no meio.

Os 6 arquivos foram reenviados numa última entrega (main.js bootstrap + flow-boss.js +
flow-question.js + flow-progression.js + game-loop.js + mount-game.js, todos completos).

### Se o erro persistir após isso

Abrir DevTools → aba Sources → procurar `flow-boss.js` no painel esquerdo → clicar e ver o que
está servido. Isso vai dizer exatamente o que o servidor está entregando (se está vazio, se
está truncado, se tem o export).

---

## 7. Próximos passos possíveis

Depois de resolver o bug em aberto (imports do `flow-boss.js`), o overhaul está pronto. A
partir daí, os próximos itens são do backlog (lista viva de pedidos/ideias, mantida em arquivo
separado). Os principais:

### Itens de bug (do backlog)

1. **Pergunta pré-boss "pulada"**: se o jogador acerta um dos asteroides-pergunta pré-chefe e
   aperta uma resposta IMEDIATAMENTE em seguida, a próxima pergunta não é contada no contador
   pré-boss nem chega a aparecer. Suspeita: corrida entre `questionPause` / fila de perguntas
   em `main.js` (agora `flow-boss.js` + `flow-question.js`) / `session.pointer` em `quiz.js`.

2. **Cartas roguelike novas quase nunca aparecem**: a grande maioria das cartas adicionadas
   recentemente nunca sorteia, exceto "Ricochete". Já identificado 1 bug concreto (item 3.1
   acima, `faster-charge` excluída sempre) mas o sintoma é mais amplo — precisa investigar
   `roguelike.js`, `player.js` (`buildCardExcludeSet`) e/ou o pool que chega em
   `pickRandomCards`.

### Itens de gameplay (do backlog)

3. **Dourado com dash lateral longo** quando o jogador chega perto, 1x a cada 3s.
4. **Sentinela mais lenta/maior/mais discreta**: 5 sub-itens concretos (velocidade do ciclo
   20% mais lenta, moldura viaja mais devagar, cresce em escala ao longo da trajetória, modelo
   3D mais curto, opacidade a 35%).
5. **Chefe vermelho com escudo refletor**: a cada 7s ergue escudo azul que reflete tiros por
   3s; cooldown de 7s só recomeça depois dos 3s.

### Itens de câmera/movimento (do backlog)

6. **P1**: cull/despawn por progresso no trilho (guardar `spawnDistance` do trilho no spawn,
   comparar contra `distance` atual do `rail`) em vez de `relative.dot(frame.forward) <
   PASS_BEHIND` (que quebra quando o frame gira).
7. **P2**: câmera também MIRA um pouco pro jogador, não só translada.
8. **P4 (grande)**: substituir a curva 3D com Frenet frame por uma curva de progresso-linear
   com deslocamento lateral aditivo.

### Itens visuais (do backlog)

9. **Tiro carregado no máximo**: marco visual ao atingir 100% + argolas ovais curtas
   disparadas junto.
10. **Overhaul de efeitos**: lista inicial de faltas identificadas (explosão do tiro carregado
    azul sem efeito condizente, teleportes do dourado sem efeito, lasers do chefe são cones
    pontudos que não parecem lasers, etc.).

---

## 8. Referência de arquivos por etapa (pro Claude)

Se o Claude quiser reconstruir o estado atual a partir do zero, a ordem de dependências é:

1. `main-constants.js` (nenhuma dep)
2. `cutscenes.js` (importa de `main-constants.js`)
3. `flow-progression.js` (importa de `main-constants.js`)
4. `flow-boss.js` (importa de `main-constants.js`, `quiz.js`, `storage.js`)
5. `flow-question.js` (importa de `main-constants.js`, `quiz.js`, `storage.js`,
   `roguelike.js`)
6. `game-loop.js` (importa de `main-constants.js`, `keybindings.js`, `three.js`)
7. `mount-game.js` (importa todos os módulos de sistema + os 6 acima)
8. `main.js` (importa `mobile.js`, `game-menu.js`, `mount-game.js`)

Os arquivos `.js` que NÃO foram alterados pelo overhaul e que são dependências:
- `quiz.js`, `storage.js`, `roguelike.js`, `keybindings.js`, `settings.js`, `mobile.js`
- `rail.js`, `effects.js`, `input.js`, `player.js`
- `combat/index.js`, `combat/projectiles.js`, `combat/targets.js`, `combat/lockon.js`
- `enemies/index.js` + todos os `enemies/*.js`
- `hud.js` + todos os `hud-*.js`
- `debug-actions.js`, `debug.js`, `game-menu.js`, `decks.js`, `anki.js`
- `blaster.js`, `boss.js`, `detrito.js`, `fragata.js`, `golden.js`, `ima.js`,
  `miniSwarm.js`, `replica.js`, `sentinela.js`, `shared.js`, `sussurro.js`, `tank.js`,
  `timeEnemy.js`, `verme.js`

---

## 9. Conclusão

O overhaul de organização do `main.js` foi executado em 7 etapas (1: constants, 2: state, 3:
cutscenes, 4: flow-boss, 5: flow-question, 6: flow-progression, 7a: game-loop, 7b:
mount-game), todas seguindo o princípio de zero mudança de comportamento. O `main.js` caiu de
~1050 linhas para ~10, e a lógica se distribui em 7 arquivos coesos por responsabilidade.

O estado atual tem 1 bug em aberto: `flow-boss.js` no repo não está exportando
`createBossFlow`. A causa provável é um paste parcial ou um arquivo truncado. Os 6 arquivos
envolvidos foram reenviados completos na última entrega — precisa substituir, hard refresh e
verificar.

Uma vez resolvido, o projeto está pronto pra atacar o backlog.
```

---

Esse é o documento completo. Ele é autocontido — o Claude vai entender o estado do projeto, o que foi feito, o que está quebrado, e o que pode ser atacado em seguida, sem precisar do contexto dessa conversa.
