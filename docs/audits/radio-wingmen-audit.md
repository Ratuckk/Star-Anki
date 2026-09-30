# Auditoria do rádio dos wingmen — mapa de produtores de fala

> **Tipo:** auditoria somente leitura (nenhum arquivo de produção foi alterado por ela). **Status: as 4 decisões foram aprovadas e implementadas** no dispatcher único (`src/combat/wingman-radio-dispatcher.js`, `CLAUDE.md` §34.1); este documento descreve o estado ANTERIOR à correção. A sonda `tools/radio-audit-probe.mjs` hoje verifica o estado pós-correção.
> **Base auditada:** head `6485768` da PR #23 (`claude/relaxed-gates-3ulj5x`), que já removeu o painel world-space do Fox no Focus. Os números de linha abaixo são desse commit.
> **Contrato de referência:** `CLAUDE.md` §10 e §34.1 (rádio = chatter trivial; gate global ≥ 6 s; sem bypass; abilities nunca usam rádio; Focus não pode gerar rajada; painel fixo inferior-central).
> **Evidência dinâmica:** `tools/radio-audit-probe.mjs` (esquadrão e scheduler reais; fora da CI; `node tools/radio-audit-probe.mjs`).

Classificações: `CORRETO`, `BYPASS`, `ABILITY INDEVIDAMENTE NO RÁDIO`, `DUPLICAÇÃO`, `CÓDIGO MORTO`, `INCERTO — PRECISA DE RUNTIME`. Um achado que não cabe nelas é marcado `DEFEITO` (fora da taxonomia).

---

## 1. Como uma fala nasce hoje (arquitetura real)

Existem **três camadas**, e só uma delas é o gate:

1. **Scheduler** — `createWingmanRadio()` em `src/combat/wingman-radio.js`. O ponto único de decisão é `emit()` (chamado por `trySpeak`, `forceSpeak`, `trySpeakAlone`). Ele aplica, nesta ordem: (a) ability → `null`; (b) **gate global** `now − lastGlobalTrivialSpokenAt < 6000` → `null` (vale também para `force`/urgente); (c) se não urgente: janela de silêncio do esquadrão (`squadTrivialSilenceUntil`, 2,8 s + 6 s) e dedupe por categoria (8 s); (d) cooldown por piloto (6–20 s, ignorado por `force`); (e) escolha da linha; (f) arma o gate global; (g) `conversations.openFromEvent` (Call & Response).
2. **Fila do esquadrão** — em `createSquadronSystem()` (`wingmen.js`): `pendingRadioMessages` (falas produzidas fora do loop) + `radioMessages` local de `update()`. No início de `update()` (`wingmen.js:1558-1566`) a fila é consumida: se há payload com `isAbility`, todos os de ability passam e os triviais somem; senão só `trivials[0]` passa. Depois o Call & Response vencido (`takeDueResponse`) pode substituir `radioMessages[0]` (`:1568-1587`).
3. **HUD** — `game-loop.js:679-686` chama `hud.showWingmanRadioQueue` (se `radioQueue`) ou `hud.showWingmanRadio`; ambos **descartam payload `isAbility`** (`hud-game.js:2675-2684`).

**Fluxograma textual**

```text
evento → (queueTrivial | announceLateral | speak | onDecision | remove/retreat | Focus)
       → wingmanRadio.trySpeak / forceSpeak / trySpeakAlone  ─► emit(): [ability→null] → [gate 6 s] → [silêncio+dedupe] → [cooldown piloto] → linha → arma gate → abre Call&Response
       → payload = buildRadioPayload()  (isAbility = ABILITY_EVENT_IDS.has(eventId))
       → pendingRadioMessages.push  OU  radioMessages local
       → update(): consolidação (abilities>0 ? abilities : trivials[0]) → + reply C&R vencida
       → events.radioMessage / radioQueue → game-loop → hud.showWingmanRadio* (descarta isAbility) → wingmanRadioRegion (painel fixo inferior-central)
```

O **Focus é o único produtor que não passa por `emit()`**: ele usa `getLine()` (que não conhece gate algum) e `markSpoken()` (que só mexe no cooldown por piloto) e empurra direto na fila.

---

## 2. Tabela de produtores de fala

Legenda das colunas de controle: **Gate** = gate global de 6 s; **CD** = cooldown por piloto; **Dedup** = dedupe/silêncio por categoria; **Fila** = escreve em `pendingRadioMessages`; **Ability** = pode gerar `ABILITY_EVENT_IDS`; **Seq.** = pode gerar mais de uma transmissão em sequência.

| # | Origem / evento | Onde (wingmen.js) | Seleção da linha | Caminho | Gate | CD | Dedup | Fila | Ability | Seq. | Destino | Classe |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | engage dogfight/boss/horda/fragata | `:1965` `queueTrivial` | `emit` | `speak`→`trySpeak` | sim | sim | sim | não (local) | não | 1/frame | HUD lateral | CORRETO |
| 2 | re-engage do Focus (`engage_focus`/`engage_*`) | `:1899` `announceLateral` | `emit` | `trySpeak` | sim | sim | sim | sim (com guarda `pending.length>0`) | não | 1 | HUD lateral (frame seguinte) | CORRETO |
| 3 | `return_formation` | `:1991` | `emit` | `trySpeak` | sim | sim | sim | não | não | 1/frame | HUD lateral | CORRETO |
| 4 | `kill` / `boss_kill` / `golden_kill` | `:2404` | `emit` | `trySpeak` | sim | sim | sim | não | não | 1/frame | HUD lateral | CORRETO |
| 5 | `boost_used`, `charged_shot_used` | `:1613`, `:1618` | `emit` | `trySpeak` | sim | sim | sim | não | não | 1/frame | HUD lateral | CORRETO |
| 6 | `player_low_health` (na virada) | `:1602` | `emit` | `trySpeak` | sim | sim | sim | não | não | 1 | HUD lateral | CORRETO |
| 7 | `player_take_damage` | `:2494-2497` (`triggerPlayerTookDamage`) | `emit` | `trySpeak` | sim | sim | sim | sim (guarda `pending` não-ability) | não | 1 | HUD lateral (próximo `update`) | CORRETO |
| 8 | transições semânticas: `state_critical` (urgente), `state_recovered`, `action_interrupted` | `:673-692` (`onDecision`, urgente em `:677`) | `emit` | `forceSpeak` (crítico) / `trySpeak` | sim (também no `force`) | força ignora | força ignora | sim | não | 1 (+ resposta C&R) | HUD lateral | CORRETO com ressalva (§3.5) |
| 9 | `alone` (esquadrão vazio, 1×/partida) | `:980-983` | `emit` | `trySpeakAlone` | sim | sim | sim | sim | não | 1 | HUD lateral | CORRETO |
| 10 | `retreat` (aliado abatido) | `:1024-1028` | `emit` | `forceSpeak` | sim | ignora | ignora | sim | não | 1 (+ resposta C&R) | HUD lateral | CORRETO na emissão; ver §3.4 |
| 11 | **confirmação do Focus** (`focus_ready` / `ability_focus_upgrade`) | `:1206-1219` | **`getLine()` direto** | `getLine`+`markSpoken`+`push` | **NÃO** | consome de todos | **NÃO** | sim (1 por aliado ativo) | **SIM** (`ability_focus_upgrade`) | até N payloads; só 1 chega ao HUD por acaso | HUD (descartado se ability) | **BYPASS** + **ABILITY INDEVIDAMENTE NO RÁDIO** |
| 12 | resposta Call & Response | `:1560-1587` | `takeDueResponse` | `radio.takeDueResponse` | sim (arma o gate) | n/a | n/a | não | não | 1 (não encadeia) | HUD lateral | CORRETO na entrega; **DEFEITO** de janela (§3.4) |
| 13 | ativação de ability (`announceAbility`) | `:592-605` + chamadas `:1340…:2433` | — | visual (`triggerAbilityGlow` + `triggerAbilityWorldIcon`) | n/a | n/a | n/a | não | sim (só ícone) | n/a | ícone sobre o aliado | CORRETO |

Não há nenhum outro produtor: `getLine`, `trySpeak`, `forceSpeak`, `trySpeakAlone`, `markSpoken`, `takeDueResponse` e `pendingRadioMessages` só aparecem em `wingmen.js` e `wingman-radio*.js` (busca em todo `src/` e `tools/`). O painel world-space do Fox já foi removido na #23 (`showFoxFocus` não existe mais).

---

## 3. Bypasses e defeitos confirmados

### 3.1 `BYPASS` + `ABILITY INDEVIDAMENTE NO RÁDIO` — bloco do Focus (`wingmen.js:1206-1229`)

O que o código faz: para cada aliado ativo não em retirada, escolhe `eventId = ability_focus_upgrade` (Slippy com `moraleDamageBonus>0`, ou Peppy com escudo aux e ability pronta) ou `focus_ready`, chama `wingmanRadio.getLine(...)`, `wingmanRadio.markSpoken(...)` e empurra `buildRadioPayload(..., { focusResponse: true })` em `pendingRadioMessages`. É o **único** chamador de `markSpoken` e o único de `getLine` fora do scheduler.

Confirmado pela sonda (`tools/radio-audit-probe.mjs`, esquadrão e scheduler reais):

- **Não arma o gate global.** Depois de 4 "falas" do Focus, `getSquadTrivialSilenceUntil()` continua `-Infinity`. O caminho normal arma 8,8 s (2,8 + 6). Consequência: uma resposta C&R vencida ou uma fala forçada (`retreat`/`state_critical`, que ignoram o cooldown por piloto) pode sair logo depois do Focus, dentro dos 6 s; só as falas triviais normais ficam bloqueadas, e por outro motivo (o cooldown por piloto queimado abaixo).
- **Queima o cooldown por piloto dos 4 aliados**, embora no máximo 1 fala apareça. Depois do Focus, `trySpeak('kill')` dos 4 pilotos retorna `null` 6,5 s depois: os quatro ficam mudos por 6–20 s.
- **Ignora dedupe de categoria e janela de silêncio**, e **não abre Call & Response**.
- **`ability_focus_upgrade` vira `isAbility: true`** (está em `ABILITY_EVENT_IDS`). Na consolidação de `update()`, o payload de ability tem prioridade: com Slippy em morale, o frame do Focus entrega `Slippy:ability_focus_upgrade[ABILITY]` e **descarta a fala trivial**; o HUD então descarta o payload de ability. Resultado observado: o Focus **não mostra fala nenhuma** e ainda queima os cooldowns. As linhas `ability_focus_upgrade` (Peppy e Slippy, `wingman-radio.js:152`, `:246`) **nunca podem aparecer**.
- **A "rajada de 4 pilotos" não chega ao HUD apenas por acaso** da consolidação (`trivials[0]`): 4 payloads são criados (a ordem é a de `activeWingmen`, então Falco sempre "fala" e os outros pedidos morrem). É uma dependência frágil, não uma garantia; os outros 3 pilotos pagam cooldown por falas que nunca existem.
- **`aiValidator.expect('Focus gera confirmação lateral para todo Wingman ativo', focusReplyCount === focusResponders.length)`** (`:1221`) valida o contrato **errado** (todos falam), o oposto de §10.2.

### 3.2 Como o Focus deve se comportar (comportamento desejado)
Ao acionar FOCO: nenhum painel acima da nave (já removido); no máximo **uma** confirmação trivial, passando pelo scheduler (gate global, cooldown de **um** piloto, dedupe); nada de `ability_*` no rádio; sem consumir cooldown de quem não falou.

### 3.3 `CÓDIGO MORTO`

| Item | Onde | Por que é morto |
|---|---|---|
| `radioQueue` / `showWingmanRadioQueue` / `wingmanRadioRegion.showQueue` / `clearQueue` | `wingmen.js:2484`, `combat/index.js:428`, `game-loop.js:679-683`, `hud-game.js:296-320, 2675-2681` | `radioMessages.length > 1` só ocorre quando há ≥ 2 payloads de ability, e o HUD filtra ability antes de `showQueue`. Nunca exibe nada. O comentário "rajada de prontidão do [D]" é obsoleto. |
| Ramo `abilities.length > 0` da consolidação e o filtro `isAbility` no HUD | `wingmen.js:1560-1566`, `hud-game.js:2676,2682` | Só existem para tolerar o payload de ability do Focus (§3.1). Sem ele, nada é `isAbility`. |
| `speakAbility()` | `wingman-radio.js` (retorna sempre `null`) | Só é chamado por testes. |
| Linhas `ability_*` do catálogo (`LINES`): **60 linhas** (10/20/20/10 por piloto) | `wingman-radio.js` | `emit()` bloqueia qualquer ability; a única exceção é `getLine` no Focus, que também nunca aparece. Usadas só por estatísticas/testes de validação. |
| `RESPONSE_LINES` de `ability_*` (8 chaves) | `wingman-radio-callresponse.js:7-118` | `openFromEvent` só é chamado por `emit`, que bloqueia ability antes. Nenhuma thread C&R de ability pode abrir. |
| `worldRadio.showWingman()` + painéis in-world (`makePanelSprite`, `WINGMAN_AVATARS`, `messages[]`, `showMessage`) | `wingman-world-radio.js` | Sem chamadores desde a migração para o rádio lateral (`wingman-radio-overhaul.test.mjs` até proíbe). Só `triggerAbilityGlow`/`update`/`clear` são usados. |
| `worldRadio.clearPilot?.(…)` | `wingmen.js:991, 1022` | A função não existe em `createWingmanWorldRadio`; o `?.()` é um no-op silencioso. |

### 3.4 `DEFEITO` — Call & Response mal calibrado contra o gate (confirmado com números)

Constantes: resposta vence em 3000–4200 ms, vive 2200 ms depois de vencer; `takeDueResponse` só entrega se `now − lastGlobalTrivialSpokenAt ≥ 6000`. A fala que abre a thread arma o gate no instante `t0`, então a resposta só pode sair a partir de `t0+6000`, mas expira em `t0 + delay + 2200` (5200–6400 ms). Ela só sobrevive quando `delay ≥ 3800 ms`. A sonda (200 sorteios uniformes de `delay`, `retreat` → resposta) entregou **67/200 = 34%** (previsto 33%). Ou seja, ~2/3 das respostas C&R (retreat, state_critical, state_recovered, action_interrupted) expiram sem serem faladas.

Isso não viola o contrato (menos fala, não mais), mas o sistema descrito e testado como "Call & Response disciplinado" entrega só um terço do que promete. **Precisa de decisão do usuário:** aumentar TTL / atrasar a janela de vencimento (mais respostas) ou aceitar/documentar a taxa (e remover o que sobrar).

### 3.5 Ressalvas em caminhos `CORRETO`
- **Urgente descarta fila antes de saber se passa no gate** (`wingmen.js:677-681`): o `state_critical` remove os triviais pendentes e só depois chama `forceSpeak`, que pode retornar `null` pelo gate de 6 s. O trivial já tinha armado o gate ao ser emitido; ele é descartado e o crítico também não fala. `INCERTO — PRECISA DE RUNTIME` (caso de borda, fila com mensagem já emitida).
- **`retreat`/`state_critical` respeitam os 6 s** (o `force` não fura o gate): um aliado abatido logo depois de outra fala fica sem sua fala de retirada. Coerente com §10.2, mas convém confirmar que é a intenção.
- **`wingmanRadioEnabled = false`** só impede a exibição (`game-loop.js:679`): as falas continuam consumindo gate e cooldowns.

---

## 4. Testes existentes que congelam comportamento errado

Nenhum teste automatizado exercita o bloco do Focus. Os testes de rádio (`wingman-global-radio`, `wingman-radio-callresponse`, `wingman-radio-overhaul`, `wingman-bughunt`) só usam `createWingmanRadio` isolado ou leem o código-fonte:

- `wingman-radio-overhaul.test.mjs:29` exige `ABILITY_EVENT_IDS.has('ability_focus_upgrade')`: **mantém** o id de ability que o Focus depende de empurrar para o rádio.
- Os testes de linha (`getWingmanRadioValidationSnapshot`, `abilityLines`) mantêm as 60 linhas mortas de ability.
- O único "guardião" do Focus é o `aiValidator.expect` do §3.1, que assume o contrato errado.

**Lacuna:** não há teste que carregue `createSquadronSystem`, acione o comando e verifique fala/gate. A sonda faz isso manualmente; a correção deve trazer esse teste para a CI.

---

## 5. Proposta mínima de refatoração (para aprovação, **não implementada**)

**Objetivo:** um único dispatcher; nenhum caller faz `getLine()`+`push()` direto.

1. **Um único ponto de entrada de fala** no esquadrão, ex.: `enqueueRadio(profile, eventId, { force })` em `wingmen.js`, que chama `emit()` (via `trySpeak`/`forceSpeak`/`trySpeakAlone`) e só então `buildRadioPayload`/`push`. Todos os produtores da tabela §2 (1–10) passam a usá-lo; os que já usam `queueTrivial`/`announceLateral`/`speak` são trivialmente absorvidos.
2. **Focus:** trocar o bloco `:1206-1229` por **uma** chamada `enqueueRadio(pilotEscolhido, 'focus_ready')` (um só piloto, escolhido por regra determinística/rotativa, sem consumir cooldown dos demais). Remover `getLine` e `markSpoken` do caminho de produção. Decidir explicitamente o que acontece com `ability_focus_upgrade`: **não usar rádio** (o ganho de Peppy/Slippy já tem feedback próprio; ver §6).
3. **Tornar o bypass impossível de reintroduzir:** remover `getLine` e `markSpoken` da API pública do scheduler (ou torná-los internos ao `emit`), e um teste estático que falha se `wingmen.js` referenciar `getLine(`/`markSpoken(`/`pendingRadioMessages.push` fora do dispatcher.
4. **Remover o que fica sem consumidor:** ramo `abilities.length>0` da consolidação e filtro `isAbility` do HUD (nada passa a ser `isAbility`), `radioQueue`/`showQueue`/`clearQueue`, `speakAbility`, linhas `ability_*` e `RESPONSE_LINES` de ability, world-radio de mensagens (`showWingman`, painéis) e `clearPilot?.`. Manter `triggerAbilityGlow`.
5. **Corrigir a expectativa** do `aiValidator` do Focus para o contrato real (no máximo 1 confirmação; nunca ability).
6. **Call & Response:** decisão do usuário sobre o §3.4 antes de qualquer mudança de constantes.
7. **Novos testes para a CI:** (a) esquadrão real com 4 aliados: acionar Focus e afirmar ≤ 1 payload, nenhuma `isAbility`, gate global armado e cooldown dos outros 3 intocado; (b) nenhum `ABILITY_EVENT_IDS` chega a `events.radioMessage`; (c) teste estático de "único dispatcher"; (d) a taxa de entrega C&R conforme a decisão do §3.4.

**Arquivos que mudariam:** `src/combat/wingmen.js` (dispatcher, Focus, consolidação, chamadas mortas), `src/combat/wingman-radio.js` (API, linhas mortas), `src/combat/wingman-radio-callresponse.js` (RESPONSE_LINES de ability; constantes se decidido), `src/combat/wingman-world-radio.js` (painéis mortos), `src/combat/index.js` (`radioQueue`), `src/game-loop.js` (ramo de fila), `src/hud-game.js` (`showQueue`, filtro `isAbility`), testes: `wingman-radio-overhaul.test.mjs`, `wingman-global-radio.test.mjs`, novo teste de esquadrão; `docs`: `CLAUDE.md` §34.1, `CURRENT.md`.

---

## 6. Decisões que dependem do usuário
1. **Focus:** confirmação única por 1 piloto (qual regra de escolha?) ou nenhuma fala? E o `ability_focus_upgrade` (Peppy/Slippy): confirmado que **não** usa rádio?
2. **Call & Response (§3.4):** aumentar a janela para entregar mais respostas, ou aceitar ~34% e simplificar?
3. **Urgentes vs gate (§3.5):** `retreat`/`state_critical` devem poder furar os 6 s? (Hoje não.)
4. **Escopo da remoção de código morto:** junto da correção (recomendado) ou em PR à parte.

## 7. O que esta auditoria NÃO cobre
Áudio de voz/cues (`pilot_voice_*`, `radio_connect`) — só disparam quando o painel abre; conteúdo e qualidade das linhas; IA de voo dos wingmen (os 10 bugs da spec de gravidade ficam para a matriz de reconciliação separada); validação visual do painel.
