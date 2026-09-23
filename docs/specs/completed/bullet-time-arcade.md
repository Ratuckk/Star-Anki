# Bullet-time no Card Choice (modo arcade)

## Documento de especificação completo

---

## 0. Contexto

### 0.1 Estado atual

Quando `state.phase === 'cardChoice'` (tela de escolha de 3 cartas roguelike), `game-loop.js:139-142`
faz um `return` antecipado logo no início de `runFrame`, antes de QUALQUER outro update do frame:

```js
if (state.phase === 'bossQuestionPause' || state.phase === 'questionPause' || state.phase === 'cardChoice') {
  renderer.render(scene, camera)
  return
}
```

Isso é pausa total: `player.update`, `rail.update`, `combat.update` (que internamente atualiza
inimigos, wingmen, projéteis), `effects.update`, `environment.update` e todos os timers
(`cycleTimer`, `normalSpawnTimer`, `enemyTimer`, `bonusTimer`, etc.) simplesmente não rodam
naquele frame — só a cena estática é renderizada de novo. Mesmo mecanismo usado pra
`questionPause`/`bossQuestionPause` (pergunta normal com baralho).

No modo sem baralho (arcade), `enterAlternatives()` (`flow-question.js:75-87`) pula a pergunta de
verdade e vai direto pra `cardChoice` a cada vez que o ciclo de combate vence — ou seja, no
arcade a tela de carta É o próprio "checkpoint" periódico do jogo, ela acontece com a mesma
frequência que uma pergunta aconteceria no modo com baralho.

### 0.2 Objetivo deste overhaul

Dar ao jogador do modo arcade a opção de trocar a pausa total por uma desaceleração forte
("bullet-time") — o jogo continua "vivo" (rail avança, inimigos se movem/atiram, o jogador pode
se mexer/atirar/ser atingido) só que numa fração da velocidade normal, dando tempo de ler as 3
cartas e decidir sem um congelamento absoluto. Escolhida entre 3 abordagens propostas
(`Checklist de overhauls pendentes.md`, item 1) — as outras duas (escolha 100% em tempo real sem
nenhuma desaceleração; fila assíncrona de cartas pendentes) ficam descartadas por ora.

**Só se aplica ao modo arcade** (`deck.isNoDeck`). No modo com baralho, `cardChoice` continua
pausando 100% como hoje — não faz sentido bullet-time numa tela que já não aparece com a mesma
cadência ali (lá a carta só aparece depois de responder uma pergunta de verdade, que já pausou o
jogo por conta própria).

---

## 1. Precedente técnico já existente: `DEATH_CUTSCENE_TIME_SCALE`

Não seria a primeira vez que o jogo desacelera parte da simulação via um multiplicador de `dt`.
Em `src/main-constants.js:190`:

```js
export const DEATH_CUTSCENE_TIME_SCALE = 0.22
```

Usado em `src/cutscenes.js:281` e `:439` (`updateDeathCutscene(rawDt)`):

```js
const slowDt = rawDt * DEATH_CUTSCENE_TIME_SCALE
```

`slowDt` ali só alimenta `effects.update(slowDt, ...)` durante a fase 1 da cutscene de morte
(chefe/dourado) — um uso pontual e estreito. O overhaul do bullet-time no arcade é mais amplo:
precisa alimentar **toda a simulação do frame** (player, rail, combat, effects, environment) com
o `dt` escalado, não só os efeitos visuais — porque o pedido é "o jogo continua rodando", não só
"as partículas continuam se mexendo".

Também existe `state.debugFlags.slowMoActive` (`game-loop.js:108`), um toggle de DEBUG que já
escala QUALQUER `dt` do frame por `0.25` — é o precedente mais próximo do comportamento que este
overhaul quer (escala tudo, não só efeitos), só que hoje é uma ferramenta de desenvolvedor, não
uma opção de gameplay condicionada a um estado (`cardChoice` + `isNoDeck` + setting ligada).

### 1.1 Cálculo do `dt` hoje (`game-loop.js:105-109`)

```js
function runFrame(now, forcedRawDt) {
  if (state.stopped) return
  const rawDt = forcedRawDt != null ? forcedRawDt : Math.min((now - state.lastTime) / 1000, 0.1)
  const dt = state.debugFlags.slowMoActive ? rawDt * 0.25 : rawDt
  state.lastTime = now
```

`rawDt` já vem clampado em 0.1s (proteção contra tick gigante após troca de aba). O bullet-time
do card choice entra como **mais uma condição** nessa mesma linha de decisão do `dt`, análoga ao
`slowMoActive`.

---

## 2. Setting nova

`src/settings.js` — `DEFAULTS` ganha um campo novo:

```js
arcadeCardChoicePauses: true, // default = comportamento atual (pausa total)
```

**Nome escolhido de propósito na afirmativa "pauses: true"** (não "bulletTimeEnabled: false") —
evita a armadilha de dupla negativa (`!disableBulletTime`) espalhada pelo código; o default
`true` preserva o comportamento de hoje sem precisar migrar saves antigos (chave ausente = `true`
via fallback do objeto `DEFAULTS`, mesmo padrão de toda outra flag em `settings.js`).

Exposta em **Configurações** (`hud-settings.js`, mesma seção de toggles simples que já existe
hoje — ex.: `showEnemyHealthBars`), com uma nota de UI: "Só se aplica ao modo arcade (sem
baralho)" — o toggle pode ficar sempre visível (sem custo, é uma constante lida em runtime) ou
condicionalmente escondido quando o jogador está numa sessão com baralho; mais simples deixar
sempre visível e o efeito simplesmente não se manifesta fora do arcade.

---

## 3. Mudança no `game-loop.js`

### 3.1 Novo cálculo de `dt`

```js
const inArcadeCardChoiceBulletTime =
  state.phase === 'cardChoice' && isNoDeck && !getSettings().arcadeCardChoicePauses
const dt = state.debugFlags.slowMoActive
  ? rawDt * 0.25
  : inArcadeCardChoiceBulletTime
    ? rawDt * ARCADE_CARD_CHOICE_TIME_SCALE
    : rawDt
```

`ARCADE_CARD_CHOICE_TIME_SCALE` nova constante em `main-constants.js`, sugestão de partida
`0.18` (mais lento que o `DEATH_CUTSCENE_TIME_SCALE=0.22`, porque aqui o jogador precisa
efetivamente LER texto e decidir, não só apreciar uma cutscene).

`getSettings()` já é lido em outros pontos de `mount-game.js`/`game-loop.js`-adjacentes hoje —
confirmar se `game-loop.js` já importa `getSettings` ou se precisa importar (`./settings.js`).
Ler a cada frame é barato (objeto já em memória, sem I/O), mesmo padrão de leitura direta que
`showEnemyHealthBars` já usa em outros lugares do bootstrap.

### 3.2 Early-return de `cardChoice` precisa condicionar

O bloco de `game-loop.js:139-142` precisa parar de tratar `cardChoice` como pausa incondicional:

```js
if (state.phase === 'bossQuestionPause' || state.phase === 'questionPause') {
  renderer.render(scene, camera)
  return
}
if (state.phase === 'cardChoice' && !inArcadeCardChoiceBulletTime) {
  renderer.render(scene, camera)
  return
}
```

Quando `inArcadeCardChoiceBulletTime` é `true`, o frame **continua** normalmente com o `dt` já
escalado — todo o resto do `runFrame` (player, rail, combat, timers) roda como sempre, só que em
câmera lenta. Isso é a parte estruturalmente mais delicada da mudança: `cardChoice` deixa de ser
um "phase que sempre pausa" e vira condicional — **todo outro lugar do código que assume
implicitamente que `cardChoice` = pausado** precisa ser auditado (ver §5).

### 3.3 Timers durante bullet-time

Como o mesmo `dt` escalado já alimenta `cycleTimer`/`normalSpawnTimer`/`enemyTimer`/etc.
(confirmado: todos escalam linearmente com `dt`, `game-loop.js:649,707` e afins), eles
naturalmente desaceleram junto — não precisa de nenhum tratamento especial. O próximo ciclo de
combate não "avança escondido" enquanto o jogador decide.

---

## 4. Input durante bullet-time

Pergunta de design em aberto: o jogador pode se mover/atirar enquanto o overlay de cartas está
na tela? Duas opções:

- **(a) Sim, input normal** — reforça a sensação de "bullet-time de verdade" (tipo Max Payne):
  o jogador pode até desviar de um tiro em câmera lenta enquanto decide a carta. Risco: pode ser
  difícil interagir com o overlay (teclas 1/2/3 de escolha) e ao mesmo tempo segurar direção/tiro
  sem conflito de binding — checar `keybindings.js` pra garantir que as teclas de escolha de
  carta não colidem com movimento/tiro (hoje `cardChoiceKeyHandler` em `hud-game.js` já existe
  pra escuta de teclado durante `cardChoice` — mesmo handler, sem mudança de binding).
- **(b) Não, input trava só a nave/tiro, mas o resto do mundo continua** — mais simples de
  raciocinar (jogador fica "intocável" mas o resto do mundo reage), porém aí o jogador não pode
  desviar de um tiro que já estava a caminho — se um inimigo mirou nele um instante antes do
  `cardChoice` abrir, o tiro continua vindo em câmera lenta e o jogador não consegue reagir.

**Recomendação**: (a), pela coerência com o nome "bullet-time" e porque simplesmente não
processar input do jogador enquanto tudo mais se move é inconsistente e pode frustrar mais que
ajudar. Fica marcado como decisão a confirmar antes de implementar.

---

## 5. Auditoria necessária: lugares que assumem `cardChoice` = pausado

Levantamento preliminar de pontos a revisar (não exaustivo — fazer uma varredura completa por
`state.phase === 'cardChoice'` e por qualquer lógica que dependa implicitamente do loop estar
parado nesse phase):

- **`hud.showCardChoice`** (`hud-game.js:1909+`) — hoje monta o overlay assumindo que nada mais
  muda atrás dele. Bullet-time não deveria quebrar a renderização do overlay em si (ele já é
  DOM/HUD, não parte da cena 3D), mas vale confirmar que nenhum efeito visual do jogo (ex.:
  flashes de dano, hit markers) fica "preso atrás" do overlay de forma confusa.
- **Detecção de dano ao jogador durante `cardChoice`** — hoje é moot (jogo pausado, nada pode
  acertar o jogador). Com bullet-time, o jogador PODE tomar dano/perder vida escolhendo uma
  carta. Se a vida chegar a 0 durante a escolha, o fluxo de "perdeu vida"/game over precisa
  continuar funcionando corretamente com o `cardChoice` ainda "aberto" — checar se
  `hud.hideCardChoice`/equivalente é chamado antes de transicionar pra fase de game over, senão o
  overlay de carta pode ficar preso na tela por cima de uma cutscene de morte.
- **`combat.spawnBonusTarget`/`spawnEnemy`/squadron spawns** — continuam rodando durante
  bullet-time (é o comportamento pretendido), só que mais devagar. Não deveria quebrar nada
  (esses sistemas já lidam com qualquer `dt` pequeno sem problema), mas vale um teste visual —
  inimigos surgindo "em câmera lenta" pode ficar estranho se a escala for baixa demais.
- **Áudio** — músicas/efeitos sonoros tocam em tempo real (não escalam com `dt`, `Audio`/`Web
  Audio API` não tem noção de "dt do jogo"). Durante bullet-time o som vai continuar em
  velocidade normal enquanto a imagem desacelera — dissonância perceptível (like todo jogo com
  bullet-time enfrenta). Fora de escopo resolver isso agora (pitch-shift de áudio seria um
  overhaul à parte), só documentando a limitação conhecida.

---

## 6. Arquivos afetados

| Arquivo | Mudança |
|---|---|
| `src/settings.js` | `DEFAULTS.arcadeCardChoicePauses = true` (nova flag) |
| `src/hud-settings.js` | Novo toggle na tela de Configurações (e no painel de pausa, se aplicável — reaproveita builder existente) |
| `src/main-constants.js` | `ARCADE_CARD_CHOICE_TIME_SCALE` (novo, sugestão `0.18`) |
| `src/game-loop.js` | Cálculo de `dt` ganha a condição de bullet-time; early-return de `cardChoice` vira condicional (§3.2) |
| `src/hud-game.js` | Auditoria de `showCardChoice`/`hideCardChoice` interagindo com dano/game over durante bullet-time (§5) |

---

## 7. Perguntas em aberto antes de implementar

1. **Valor de `ARCADE_CARD_CHOICE_TIME_SCALE`** — `0.18` é só um ponto de partida, ajustar depois
   de testar ao vivo (rápido demais = não dá tempo de ler; devagar demais = quase indistinguível
   de pausa total, perde o propósito).
2. **Input do jogador durante bullet-time** — confirmar opção (a) do §4 (input normal) antes de
   codar, já que muda a superfície de teste (precisa validar que dano/morte durante a escolha de
   carta não quebra o fluxo).
3. **Onde expor o toggle** — só na tela de Configurações pré-jogo, ou também no painel de pausa
   (`hud-pause.js`, que já reaproveita builders de `hud-settings.js`)? Recomendação: expor nos
   dois, mesmo padrão de outros toggles visuais/sensibilidade que já aparecem em ambos os locais.

---

*Fim do documento. Aguardando aprovação das perguntas do §7 antes de implementar.*
