# Documento de Implementação — "Novas mudanças.txt" (revisão final)

> \*\*Regras gerais para o implementador (IA):\*\*
> 1. \*\*Toda constante nova vai no topo do arquivo\*\*, num bloco `// ============` com comentário em português explicando o efeito. O usuário edita esses números constantemente.
> 2. \*\*Sem protótipos visuais.\*\* Tudo é implementado direto. Se algum visual for complexo, ainda assim entrega a versão funcional — o ajuste fino é por tentativa e erro do usuário em jogo.
> 3. \*\*Ordem de entrega:\*\* (a) sistema de rádio para todos os 4 pilotos, (b) depois por personagem: Falco → Peppy → Slippy → Miyu. Cada bloco de personagem inclui as cartas dele + as habilidades afetadas + os quotes.
> 4. \*\*Dependências de sistemas inexistentes são implementadas junto, na ordem em que bloqueiam.\*\* Knockback por tier (QoL #6/#7) vira pré-requisito de Rescue (Peppy) — vem antes.
> 5. \*\*Comentários em português\*\*, mesmo padrão do projeto.

\---

## Item 0 — Miyu

### 0.1 Marcadores de lock da Miyu viram triângulos ciano

**O que muda:** hoje todos os locks usam o mesmo marcador quadrado verde. Só os locks **liberados pelo bônus da Miyu** viram triângulo ciano rotativo. Todo lock normal continua quadrado.

**Arquivos:** `combat/lockon.js`, `hud-game.js`, `index.html`.

**Em `combat/lockon.js` (topo, comentado):**

```js
// ============ ORIGEM DO LOCK — MIYU vs. BASE ============
// Todo record de trava carrega `source`. Locks comuns → 'base' (marcador quadrado verde).
// Locks liberados pelo bônus de alvos extras da Miyu (Carga Compartilhada) → 'miyu' (marcador
// triângulo ciano). O bônus da Miyu é o que levanta o teto efetivo acima do player.config.
// homingMaxTargets — então qualquer lock adquirido APÓS esse teto base é marcado como 'miyu'.
export const LOCK\_SOURCE\_BASE = 'base'
export const LOCK\_SOURCE\_MIYU = 'miyu'
```

**Como marcar:** em `sweepLockOn`, ao adquirir um alvo, comparar `lockedEnemies.length` (já travados, após filtrar inválidos) contra `player.config.homingMaxTargets`. Se o índice atual for `>= homingMaxTargets`, é um lock do bônus da Miyu → `source: LOCK\_SOURCE\_MIYU`. Caso contrário, `source: LOCK\_SOURCE\_BASE`. O campo vai no record e é incluído em `getLockedEnemySnapshots()`.

**Em `hud-game.js → setLockedEnemyMarkers`:** se `item.source === 'miyu'`, adicionar a classe `is-assist` no elemento.

**Em `index.html`** (bloco de estilo inline, `.enemy-lock-marker`):

```css
/\* Variante Miyu — triângulo ciano rotativo. Herda a MESMA coreografia dos 3 quadrados
   (lock-sq-a/b/c convergindo + lock-sq-c girando infinito) e o --marker-size por inimigo.
   Só muda a FORMA (clip-path triangular) e a COR (ciano do Blaster orbit — 0x00e5ff). \*/
.enemy-lock-marker.is-assist .lock-sq {
  border-color: #00e5ff;
  box-shadow: 0 0 8px rgba(0,229,255,0.8), inset 0 0 6px rgba(0,229,255,0.5);
  border-radius: 0;
  clip-path: polygon(50% 0%, 100% 100%, 0% 100%);
}
```

### 0.2 Charge glow maior durante o assist da Miyu

**Constante nova em `effects.js` (topo, comentado):**

```js
// ============ CHARGE GLOW — BOOST DA MIYU ============
// Quando o assist da Miyu está ativo, SÓ A ÚLTIMA CAMADA (a mais externa, índice 3 do array
// CHARGE\_GLOW\_LAYERS) cresce 25%. As outras 3 ficam idênticas. Reforço visual discreto de
// "algo extra está acontecendo" sem inflar todas as camadas.
export const CHARGE\_GLOW\_MIYU\_BOOST\_MULT = 1.25
```

`setChargeGlow` ganha `opts.miyuAssistActive`. No loop das layers, se ativo e `i === chargeGlowLayers.length - 1`, multiplicar escala. Chamada em `game-loop.js` passa `{ miyuAssistActive: combat.getAssistChargeMult() > 1 }`.

### 0.3 Cor do disparo extra da Miyu = magenta

**Constante nova em `combat/wingmen.js` (topo, comentado):**

```js
// ============ MIYU — COR DO DISPARO EXTRA ============
// Só o tiro extra que a Carga Compartilhada dispara contra alvos adicionais sai em MAGENTA
// (0xd500f9 — magenta do Time enemy, escolhido pelo usuário). O laser normal dela continua
// rosa neon (profile.laserColor = 0xe879f9). O magenta distingue visualmente os dois.
export const MIYU\_ASSIST\_SHOT\_COLOR = 0xd500f9
```

Aplicar em `fireWingmanLaser` quando `wingman.state === 'escort' \&\& wingman.escortKind === 'assist'`.

\---

## Item 1 + 2 — Sistema de rádio

### 1.1 Estrutura de dados

**Arquivo:** `combat/wingman-radio.js`.

**Estrutura nova (comentada no topo):**

```js
// ============ DISTRIBUIÇÃO DE QUOTES (pedido do usuário) ============
// 30 quotes por piloto (120 total). Cada piloto tem:
//   - 5 falas por cada ABILITY dele (Falco 2 → 10; Peppy 3 → 15; Slippy 3 → 15; Miyu 2 → 10)
//   - o RESTANTE espalhado nos eventos TRIVIAIS já existentes (kill, engage, boost, etc.)
// A escolha de uma fala é sempre ALEATÓRIA dentro do pool do eventId disparado.
// REGRA CRÍTICA: um eventId de ability NUNCA pode disparar um quote trivial, e vice-versa.
// Isso é garantido por construção (o LINES\[eventId] só contém falas do tipo certo) + pela
// classificação em ABILITY\_EVENT\_IDS abaixo.
export const ABILITY\_EVENT\_IDS = new Set(\[
  'ability\_ram', 'ability\_intercept',
  'ability\_guard', 'ability\_rescue', 'ability\_aux\_shield',
  'ability\_repair', 'ability\_morale', 'ability\_boost\_dash',
  'ability\_assist', 'ability\_boombuster', 'ability\_focus\_upgrade',
])
```

**Falas existentes ficam.** As \~66 atuais continuam no pool e passam a conviver com as novas. Não há substituição.

**Distribuição dos triviais fica em aberto por ora** — só precisa garantir que `LINES\[pilotoId]` tenha 30 entradas por piloto no final.

**Cooldown global do dispatcher (`GLOBAL\_COOLDOWN\_MS` hoje = 6000) vira aleatório:**

```js
// ============ COOLDOWN GLOBAL DO DISPATCHER ============
// Tempo mínimo entre DUAS falas quaisquer (global, não por piloto). Aleatório a cada disparo
// — evita cadência robótica. Antes era fixo em 6s; agora mínimo 6s, máximo 20s.
export const GLOBAL\_COOLDOWN\_MIN\_MS = 6000
export const GLOBAL\_COOLDOWN\_MAX\_MS = 20000
```

`pick()` calcula o próximo `lastSpokenAt` como `now + min + random \* (max - min)`.

### 2.1 + 2.2 + 2.3 Regiões superior/inferior

**Arquivo:** `hud-game.js`.

**Estrutura:** novo `wingmanAbilityPanel` (região superior, top: 18%) em paralelo ao `wingmanRadioPanel` existente (região inferior, mantém posição atual). Ambos com a mesma estrutura de fila, mas canais independentes.

**Regra "não pode estar nas 2 regiões ao mesmo tempo":**

* Quando `playWingmanAbilityMessage(payload)` é chamado, se o `wingmanRadioPanel` atual está mostrando o MESMO `pilotId`, esconde ele imediatamente (fade-out rápido) antes de mostrar o painel superior.
* Vice-versa: quando `playWingmanRadioMessage(payload)` chega com o `pilotId` que está no painel superior, esconde o superior primeiro.

**CSS novo em `hud-styles.js`** (bloco no topo, perto do `.hud-wingman-radio`): `.hud-wingman-ability-panel` — mesma estrutura visual do painel inferior, mas `top: 18%`, cor de borda/glow mais saturada, e uma animação de entrada épica (fatias cortando em steps) no lugar da entrada atual.

### 2.4 Focus quote: trivial ou ability

**Arquivo:** `combat/wingmen.js → toggleCommand()`.

**Regra:** ao ativar o \[D], para cada piloto ativo:

* Se ele **tem a carta** que muda o foco (ver `FOCUS\_ABILITY\_CARDS`), **e a carta não está em cooldown**, ele enfileira uma fala `ability\_focus\_upgrade` no painel **superior**.
* Senão, enfileira `focus\_ready` no painel **inferior**.

```js
// ============ FOCUS QUOTE — TRIVIAL vs. ABILITY ============
// Cartas cuja ativação dispara uma ability quote (região superior) quando o jogador aperta \[D].
// Se o piloto TEM a carta E ela não está em cooldown, o quote do foco vai pra cima. Senão,
// vai pra baixo (trivial). Ver regra 2.4 + 17 do "Novas mudanças.txt".
export const FOCUS\_ABILITY\_CARDS = new Set(\[
  'slippy\_morale',
  'peppy\_aux\_shield',
])
```

\---

## Item 3 — Cartas por personagem

### Estrutura geral

**Em `roguelike.js`:** cada carta nova carrega:

```js
{
  id: 'falco\_combat\_double\_dash',
  category: 'ofensivo',
  label: 'Falco — Investida Dupla',
  icon: '☄️',
  description: '...',
  maxStacks: 3,              // 0/3 do pedido
  ownerPilotId: 0,           // só aparece se o piloto estiver recrutado
  abilityQuoteId: null,      // se preenchido, ativa ability quote no foco (ver FOCUS\_ABILITY\_CARDS)
}
```

**Em `player.js → buildCardExcludeSet()`:** excluir cartas cujo `ownerPilotId` não está no esquadrão; excluir cartas que já atingiram `maxStacks`.

**Em `combat/wingmen.js`:** novo método `applyWingmanCard(card, wingmanCount)` que aplica flags/multiplicadores por piloto. Chamado por `flow-question.js` no `applyRoguelikeCard` quando o card tem `ownerPilotId`.

**Reset de partida:** já é o comportamento atual (`resetCards()` zera `collectedCards`). Se por algum motivo não for, é bug a corrigir.

### Cartas — uma por uma

|Carta|Comportamento (implementação)|
|-|-|
|**Falco Combate**|Após acertar o ram, se `stacks > 0`, Falco imediatamente procura o próximo inimigo **mais próximo da posição atual dele** e inicia nova investida. Ao terminar os N alvos extras, a habilidade entra em cooldown normal. Se não achar alvo perto (raio a definir pela IA, sugestão 80u), volta pra formação sem cooldown extra.|
|**Falco Intercept**|Detecta projétil com `powerLevel >= 3` (níveis 3 e 4 — 3 ainda não é emitido hoje, mas será no futuro). Uma vez a cada `6 - stacks` segundos. Dispara laser em **azul mais forte que o do player** (proposta: `0x0066ff`) contra o projétil. Ability quote no painel superior.|
|**Falco Status**|`dogfightDuration` do Falco soma `+2 \* stacks` segundos (base 5.5 → 11.5 com 3 stacks).|
|**Peppy Guarda Extra**|Guarda passa a conceder `+1` escudo **acima do shieldMax**, por 10s. Some de uma vez quando o tempo acaba. Stacks: cada carta concede +1 (a AI vai confirmar se o 0/2 do pedido significa "+2 máximo" ou "+3 com a primeira"). Escudo extra em **verde neon** (proposta: `0x39ff6a`) em vez do azul padrão. Dano consumido primeiro no extra.|
|**Peppy Rescue**|Depende de **knockback por tier** (QoL #6/#7). Implementar o knockback primeiro, depois a carta. Cooldown `20 - 4 \* stacks` s. Ao detectar tumble, Peppy voa até o jogador e colide, cancelando o tumble + concedendo 1 escudo. Ability quote.|
|**Peppy Auxílio**|Enquanto o jogador segura repulsão, Peppy voa na frente dele com escudo que **bloqueia todos os projéteis**. A barra consumida é a **boostCharge do jogador** (mesmo dreno da repulsão normal — não é afetada pelos tiros bloqueados). Carta única (0/1). Ability quote.|
|**Slippy Repair Aliados**|Depende de **wingmen com HP** (Checklist item 3). Implementar HP dos wingmen primeiro. O orbe de reparo cura +1 vida de aliados próximos (raio a definir pela IA).|
|**Slippy Morale Boost**|No foco (\[D]), aplica `+stacks` de dano extra **a todas as fontes** contra inimigos. Faíscas de acerto saem **verdes** (`0x39ff6a`) em vez de brancas. Ability quote no foco (está em `FOCUS\_ABILITY\_CARDS`).|
|**Slippy Impulsão Conjunta**|Quando o jogador ativa propulsão, Slippy impulsiona junto e ambos ficam invencíveis pelos **950ms do boost**. Se `propulsion-ram` do jogador estiver ativo, +`4 \* stacks` de dano extra no impacto do ram.|
|**Miyu Assist +1 alvo**|`getAssistExtraTargets() = 1 + stacks`. Respeita `HOMING\_MAX\_TARGETS\_CAP = 8`.|
|**Miyu Boombuster**|Uma vez a cada `10 - stacks \* 2` s (sugestão), Miyu dispara **1 tiro carregado por alvo**, todos voando ao mesmo tempo, contra `1 + stacks` alvos. Alvo preferencial: mais próximo do jogador (raio a definir pela IA). Se nenhum perto, alvo aleatório. Ability quote. Precisa de sistema de projétil homing para wingmen (novo).|
|**Miyu Status**|Igual ao Falco Status, para Miyu.|

### Sub-ícones de cooldown

**Arquivo:** `hud-game.js`, dentro do loop de `abilityHexEls`.

**Regra:** cada `.hud-ability-slot` (o wrapper de cada piloto) ganha um container filho `.hud-ability-subcolumn`. Cada carta com cooldown próprio do piloto gera um `.hud-ability-subicon` (círculo) empilhado verticalmente dentro desse container.

**Aparecem sempre** (se o jogador tem a carta), **em lacunas** — não substituem o hexágono principal, são um bloco novo abaixo.

**CSS novo em `hud-styles.js`** (bloco no topo, perto de `.hud-ability-slot`):

```css
.hud-ability-subcolumn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  margin-top: 2px;
  pointer-events: none;
}
.hud-ability-subicon {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: rgba(20, 24, 32, 0.75);
  border: 1.5px solid #333944;
  /\* estados ready/cooling reaproveitam as cores do hexágono principal via --sub-color \*/
}
.hud-ability-subicon.ready { border-color: var(--sub-color, #38bdf8); box-shadow: 0 0 4px var(--sub-color, #38bdf8); }
.hud-ability-subicon.cooling { border-color: #333944; opacity: 0.7; }
```

**Ordem:** por piloto, cada piloto empilha os seus. Sem ordenação por urgência (você disse que não importa).

\---

## Item 3 (final) — Faíscas

**Alterar constantes em `effects.js` (comentário atualizado):**

```js
// ============ FAÍSCAS DE HIT NÃO-LETAL ============
// Pedido do usuário: mais faíscas, brancas, mais espalhadas. Antes 10-14 / ±35° / 0xffd166.
const RICOCHET\_SPARK\_COUNT\_MIN = 20
const RICOCHET\_SPARK\_COUNT\_MAX = 26
const RICOCHET\_SPARK\_ANGLE = THREE.MathUtils.degToRad(55)
const RICOCHET\_SPARK\_COLOR = 0xffffff
```

**Morale Boost do Slippy** muda a cor pra **verde do kill chain** (`0x39ff6a` — você escolheu). Se Morale ativo, cor override. Nunca coexistem — Morale substitui o branco.

\---

## Resumo dos arquivos tocados

|Arquivo|O que muda|
|-|-|
|`combat/lockon.js`|`LOCK\_SOURCE\_\*`, campo `source` nos records|
|`combat/wingman-radio.js`|120 quotes, `ABILITY\_EVENT\_IDS`, cooldown aleatório, `getLine`|
|`combat/wingmen.js`|`MIYU\_ASSIST\_SHOT\_COLOR`, `FOCUS\_ABILITY\_CARDS`, `applyWingmanCard`, branches das cartas por piloto|
|`effects.js`|`CHARGE\_GLOW\_MIYU\_BOOST\_MULT`, `ricochetSparks` com cor verde condicional, faíscas 20-26 / ±55° / brancas|
|`player.js`|`buildCardExcludeSet` (regras de piloto), rastreamento de stacks por carta|
|`roguelike.js`|12 cartas novas com `maxStacks`, `ownerPilotId`, `abilityQuoteId`|
|`flow-question.js`|Chama `combat.applyWingmanCard(card)` quando `ownerPilotId` existe|
|`hud-game.js`|`wingmanAbilityPanel` (região superior), `is-assist` no lock marker, sub-ícones de cooldown por piloto|
|`hud-styles.js`|CSS do painel superior + sub-ícones|
|`index.html`|CSS do `.enemy-lock-marker.is-assist` (triângulo ciano)|
|`combat/index.js`|Pass-through de `getGlobalDamageBonus`, `getMoraleActive`|

**Bloco de entrega:**

1. Sistema de rádio (todos os pilotos).
2. Falco (rádio + cartas + sub-ícones).
3. Peppy (rádio + cartas, incluindo knockback por tier).
4. Slippy (rádio + cartas, incluindo wingmen com HP).
5. Miyu (rádio + cartas + visuais do item 0).
6. Faíscas (independente, pode entrar a qualquer momento).

Entendi. Corrigindo:

**Peppy Guarda Extra — 0/3** (não 0/2). Cada acquisição concede +1 de escudo extra:
- 1ª carta: 1/3 → +1 escudo extra
- 2ª carta: 2/3 → +2 escudo extra (total)
- 3ª carta: 3/3 → +3 escudo extra (total)

Todos os 3 stacks somam por cima do `shieldMax` normal, com duração de 10s, verde neon (`0x39ff6a`).

---

# Documento final — pronto pra implementação

Tudo fechado. O documento que você montou tem agora **uma única correção** (Guarda Extra 0/2 → 0/3) e as 22 decisões estão consolidadas. Segue o resumo executivo do que vai pra IA:

## Decisões consolidadas (resumo)

**Rádio (itens 1 e 2):**
- 30 quotes por piloto, escolha aleatória dentro do pool de cada eventId
- Quotes de ability nunca aparecem na região inferior; triviais nunca na superior (garantido por construção)
- Falas antigas ficam (não substituem)
- Região superior (ability) e inferior (trivial) coexistem com exclusão mútua por piloto
- Cooldown global aleatório entre 6s e 20s
- Focus quote: ability se tem carta E ela não está em cooldown; senão trivial

**Miyu (item 0):**
- Só locks com `source: 'miyu'` viram triângulo ciano (`0x00e5ff`)
- Coreografia idêntica à dos quadrados (convergência a/b/c + spin), só muda forma + cor
- Charge glow: só a última camada cresce 25% durante assist
- Disparo extra em magenta (`0xd500f9`)

**Cartas por personagem (item 3):**
- **Falco:** Combate (0/3, investida em cadeia até o mais próximo), Intercept (0/3, cooldown 6-3s, projétil nível 3-4, laser azul forte `0x0066ff`), Status (0/3, +2s dogfight/stacks)
- **Peppy:** Guarda Extra (**0/3**, +3 escudo temporário 10s verde neon), Rescue (0/3, cooldown 20-12s, depende de knockback por tier), Auxílio (0/1, escudo bloqueia projéteis, drena boostCharge do jogador)
- **Slippy:** Repair Aliados (0/2, depende de wingmen com HP), Morale Boost (no foco, faíscas verdes `0x39ff6a`), Impulsão Conjunta (0/2, 950ms de boost, +4 dano/stacks com propulsion-ram)
- **Miyu:** Assist +1 alvo (0/3), Boombuster (0/3, cooldown 10-4s, N projéteis simultâneos), Status (0/3, +2s dogfight/stacks)

**Faíscas (item 3 final):**
- 20-26 faíscas, ±55°, brancas (`0xffffff`), nunca coexistem com verde do Morale (verde vence)

**Sub-ícones de cooldown:**
- Círculos, empilhados verticalmente por piloto, aparecem sempre que o jogador tem a carta, sem ordenação específica

**Ordem de implementação:**
1. Sistema de rádio (todos)
2. Falco (cartas + visuais)
3. Peppy (cartas + knockback por tier como pré-requisito de Rescue)
4. Slippy (cartas + wingmen com HP como pré-requisito de Repair)
5. Miyu (cartas + visuais do item 0)
6. Faíscas (independente)

**Dependências que puxam outras implementações:**
- Peppy Rescue → knockback por tier (QoL #6/#7)
- Slippy Repair → wingmen com HP (Checklist item 3)
- Miyu Boombuster → wingmen com projétil homing (novo)
- Peppy Auxílio → wingman bloqueando projéteis (novo)
