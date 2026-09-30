# Barramentos por Categoria — Overhaul dos Cards Roguelike

> **Status:** `ready` — estrutura, layout e renderer **implementados** (`src/hud-card-bus.js`; legado removido). **Pendente:** escolha da linguagem visual (skin) e validação visual pelo usuário. A skin atual é neutra/funcional, apenas base para o protótipo.
> **Tipo:** especificação de implementação/layout (não é ADR: reversível e restrita ao HUD).
> **Origem:** decisão do usuário produzida fora do GitHub (documento "STAR-ANKI_IMPLEMENTACAO_BARRAMENTOS"), registrada aqui para se tornar canônica.
> **Autoridade:** esta spec substitui qualquer regra anterior sobre onde os cards roguelike ficam na HUD (inclusive as antigas seções 9.1/9.5/27/34.3 do `CLAUDE.md`, já atualizadas junto com esta spec).
> **Ainda pendente:** escolha da **linguagem visual** (Tático / Arcade Neon / Módulos de Nave), via protótipo HTML. A **estrutura e o posicionamento abaixo já estão decididos** e não fazem parte da escolha visual.

---

## 1. Decisão

Os cards roguelike coletados passam a ser exibidos em **três barramentos (rails) por categoria**, um por categoria, cada um em **uma única linha**:

```text
O | cards ofensivos     (vermelho/rosa)
D | cards defensivos    (azul)
U | cards utilitários   (amarelo/dourado)
```

- Cada carta aparece **somente** no rail da sua categoria (`card.category` em `src/roguelike.js`: `ofensivo` / `defensivo` / `utilitario`).
- Cada carta coletada é **1 célula visual + 1 contador** (ex.: `⚡ x7`). Nunca N ícones repetidos.
- A categoria é a **única** taxonomia visual. Não existem raridades neste ciclo.
- Durante gameplay os rails são rotulados apenas `O`, `D`, `U`. Nomes completos só em legenda de protótipo/tooltip pausado.

---

## 2. Posicionamento autoritativo (HUD esquerda)

Os barramentos são **HUD fixa em screen-space**. Não acompanham a nave, não ficam no centro, no topo, junto do timer/nível, nem na região do rádio.

### 2.1 Vitais CLÁSSICOS

```text
SCORE
STREAK / KILLS
COMBO

RECURSOS

FOCO / SWIRL / CADEIA

VIDAS
ESCUDO
VIDA
BOOST

O | cards ofensivos
D | cards defensivos
U | cards utilitários
```

Os barramentos ficam **abaixo dos vitais clássicos**.

### 2.2 Vitais ORBITAIS

```text
SCORE
STREAK / KILLS
COMBO

RECURSOS

FOCO / SWIRL / CADEIA

O | cards ofensivos
D | cards defensivos
U | cards utilitários
```

VIDA / ESCUDO / BOOST permanecem orbitais junto da nave (comportamento atual do HUD orbital). Os barramentos **ocupam o slot fixo** que os vitais clássicos ocupariam. Continuam HUD fixa: **não se aproximam da nave**.

### 2.3 Proibido

Os barramentos **nunca** ficam:

- entre COMBO e FOCO/SWIRL/CADEIA, nem entre RECURSOS e FOCO;
- ao lado ou na mesma faixa Y de Score/Stats;
- sobre os vitais clássicos;
- no topo, no centro, perto do timer/nível ou dentro da região do rádio;
- presos a posição 3D da nave.

Se o componente não couber: **compactar o componente**. Nunca mover Score, Stats, Recursos, FOCO/SWIRL/CADEIA, vitais, timer, nível ou rádio para abrir espaço. O anchor externo é fixo por modo de vitais.

---

## 3. O sistema novo SUBSTITUI o antigo

O renderer atual **deve ser removido de verdade**, não apenas escondido:

- remover o elemento/estrutura `.hud-cards-tray` (`src/hud-game.js`, criação da bandeja) e todo o CSS correspondente em `src/hud-styles.js`;
- remover `.hud-card-chip` (criado em `updateCollectedCards()`), e o CSS de chip/hover/tooltip acoplado a ele;
- **nenhuma duplicação**: cada carta é renderizada UMA vez. Não pode existir tray/chips antigos coexistindo com os barramentos;
- remover o acoplamento do layout de rádio/abilities ao tamanho da bandeja: `updateWingmanRadioAnchor()` calcula `--wingman-ability-top` a partir de `cardsTray.offsetTop + offsetHeight`. Esse cálculo deve ser reavaliado/removido para que a posição de abilities e rádio **não dependa mais** do tamanho dos cards;
- `updateCollectedCards(cardsMap)` continua sendo o ponto de entrada, mas passa a alimentar somente o novo componente;
- não construir os barramentos "em cima" do tray antigo como camada extra.

Critério de aceite: teste DOM de ausência do legado (§7, item 1) e `grep -rn "hud-cards-tray\|hud-card-chip" src/ --exclude="*.test.mjs"` com **zero** ocorrências em código de produção ao final da implementação. O `grep` exclui `*.test.mjs` porque o próprio teste DOM referencia os seletores legados literalmente; o teste DOM é a autoridade sobre o renderer montado.

---

## 3.1 Estrutura DOM autoritativa (contrato)

```text
.hud-card-bus                                  ← raiz única, filha do root do HUD
  .hud-card-rail.hud-card-rail--offensive      ← categoria "ofensivo"
    .hud-card-rail-label                       ← texto "O"
    .hud-card-rail-items
      .hud-card-bus-item                       ← 1 por cardId distinto com count > 0
        .hud-card-bus-icon
        .hud-card-bus-stack                    ← "x{count}"; único nó atualizado quando o stack muda
  .hud-card-rail.hud-card-rail--defensive      ← "defensivo" (label "D")
  .hud-card-rail.hud-card-rail--utility        ← "utilitario" (label "U")
```

Regras:

- `hud-cards-tray` e `hud-card-chip` **não são reaproveitados**, renomeados por alias, nem mantidos "por compatibilidade".
- O renderer antigo **não fica escondido** (`display:none`, `hidden`, opacidade 0) nem criado e deixado vazio.
- A cor da categoria vem de `CARD_CATEGORY_COLOR`; o rail expõe a cor via custom property (ex.: `--card-color`), não por classes de raridade.
- `.hud-card-rail-items` é `display:flex; flex-wrap:nowrap; overflow:visible` — nunca `wrap`, nunca `overflow:auto|scroll`.
- Rail sem cartas: `hidden` (não ocupa espaço) — o `.hud-card-bus` inteiro também fica `hidden` quando não há nenhuma carta.

## 3.2 Algoritmo de `updateCollectedCards(cardsMap)`

1. Ler o `Map<cardId, count>` (`null`/`undefined` → limpar os rails e a assinatura).
2. Ignorar entradas com `count <= 0`.
3. Resolver cada `cardId` em `CARD_MAP`; id sem definição é ignorado com log de debug (como hoje).
4. Separar por `card.category` em ofensivo / defensivo / utilitário.
5. Preservar a **ordem do catálogo** `ROGUELIKE_CARDS` dentro de cada grupo (não a ordem de inserção do Map, nem ordem por stack).
6. Renderizar cada grupo no rail correspondente.
7. **Categoria desconhecida não cai silenciosamente em Ofensivo.** Deve ser tratada como erro observável: `aiValidator.expect(...)` falho e/ou log de debug, sem ser exibida num rail errado. A decisão de fallback visual (ex.: não renderizar) deve estar coberta por teste.
8. Manter a **otimização por assinatura** (`id:count` ordenado): sem mudança de assinatura, não toca no DOM.
9. Quando só o `count` muda para um `cardId` que já existe: **reusar a mesma célula**, atualizar apenas `.hud-card-bus-stack` e disparar a microanimação do contador; a ordem e os demais itens não são recriados nem piscam. Recriar rails só quando o *conjunto* de ids muda.

## 3.3 Ancoragem — vitais CLÁSSICOS

Não usar `top` fixo chutado. A posição é **derivada da medição real** do cluster de vitais clássicos (`.hud-vitals-cluster.hud-left-vitals`):

```text
cardsBus.top = vitals.getBoundingClientRect().bottom (relativo ao root do HUD) + gap
gap de referência: 8–12 px
```

## 3.4 Ancoragem — vitais ORBITAIS

Existe uma **única fonte de verdade** para o slot dos vitais clássicos: um token/variável compartilhada, equivalente a `--hud-classic-vitals-top` (nome final livre, mas único). Vitais clássicos e barramento no modo orbital consomem **a mesma** variável. Os cards continuam screen-space e **jamais** usam a posição dos vitais orbitais (`.hud-vitals-orbital`) ou da nave.

## 3.5 Recalcular posição: função e gatilhos

- Conceito: `updateCardsBusPosition()` (nome livre) escolhe modo (clássico/orbital), lê a medição/token e escreve **uma** custom property/`top` no `.hud-card-bus`.
- Gatilhos permitidos: montagem, troca de modo de vitais, mudança estrutural do cluster de vitais, resize da janela, mudança do conjunto de cartas (se afetar altura).
- Usar `ResizeObserver` no root do HUD e/ou no cluster de vitais quando necessário.
- **PROIBIDO recalcular a cada frame** (`tick`/`update` por frame): sem `getBoundingClientRect()` em hot loop.
- Esta função **substitui** `updateWingmanRadioAnchor()`, que hoje deriva o topo de abilities da altura do tray. Nenhum layout de rádio/abilities pode continuar dependendo do tamanho dos cards.

## 3.6 Ciclo de vida — `unmount()`

`unmount()` do HUD deve limpar tudo que o sistema novo (e o legado removido) criou, sem órfãos:

- `ResizeObserver`(s) → `disconnect()` (hoje `radioTrayResizeObserver`, ligado ao tray, deve sumir);
- referências DOM (`cardsBus`, rails, mapa `cardId → elemento`);
- timers/animações pendentes da microanimação (novo card / contador);
- assinatura/cache (`prevCardsSignature` ou equivalente);
- qualquer estado específico do tray antigo.

Remontar o HUD depois de `unmount()` não pode duplicar listeners nem itens.

## 3.7 Pointer events e hover

- Durante gameplay: `pointer-events: none` no bus e descendentes.
- Só em pausa (`#game-screen.game-paused`), e somente se o tooltip for mantido, liberar `pointer-events`.
- Hover **nunca** altera geometria/layout (sem `transform: scale`, sem mudar `width/height/padding/margin`); só brightness/outline/glow.

---

## 4. Escala: catálogo real e stress

- Catálogo atual: **32 cartas distintas** — **14 ofensivas / 11 defensivas / 7 utilitárias** (verificado em `ROGUELIKE_CARDS`).
- O pior caso real (**stress 14 / 11 / 7**, todas as cartas coletadas) precisa caber.
- **Stacks de dois dígitos** (`x10`, `x12`…) precisam caber. Não assumir `x5` como máximo. Testar `x1, x2, x3, x5, x9, x10, x12`.
- O número do stack **nunca desaparece**, em nenhuma densidade.

### 4.1 Regras de layout dos rails

- **Sem `flex-wrap`**: cada categoria = exatamente uma linha. Nunca "O linha 1 / O linha 2".
- **Sem scroll** (horizontal ou vertical), setas, paginação ou carrossel. Todas as cartas coletadas permanecem visíveis.
- **Densidade adaptativa** dentro do mesmo anchor: se houver muitas cartas, reduzir célula, gap, padding, compactar stack e reduzir glifo moderadamente. Baixa densidade pode mostrar `[ícone] x3`; média `ícone 3`; alta célula compacta com ícone + número.
- **Ordem estável**: não reordenar por stack nem dinamicamente; cada carta mantém o mesmo slot lógico (o jogador precisa desenvolver memória visual). Ordem sugerida: a do catálogo `ROGUELIKE_CARDS`.
- **Rail vazio é oculto**: categoria sem cartas não ocupa espaço (ex.: 3 ofensivas + 1 utilitária → mostra `O` e `U`, oculta `D`). Sem reservar altura.
- Dimensão de referência: largura ~220–310 px (responsiva à viewport); altura com três rails ativos ~57–78 px. Não invadir centro nem ultrapassar agressivamente a coluna esquerda.

---

## 5. Interação e animação

- Nova carta: flash curto / borda acende / glow discreto, **180–320 ms**.
- Aumento de stack: animar **somente o contador**, não o rail inteiro.
- Sem hover que altere geometria (`transform: scale(...)` proibido); hover só com brightness/outline/glow.
- A HUD **não depende de tooltip**. Tooltip apenas em estado PAUSED (preview), nunca obrigatório em gameplay.

---

## 6. Rádio e abilities (relação com esta spec)

Documentos antigos descreviam o rádio como painel projetado em world-space abaixo da nave. **Isso está obsoleto.** A regra vigente:

- rádio = **HUD fixa em screen-space**, região **inferior-central**, referência Star Fox;
- **não segue a nave**;
- rádio serve só para chatter trivial (gate global de ≥ 6 s);
- **abilities de wingmen não usam rádio**: ativação = somente ícone brilhante acima da nave do aliado;
- o feedback de ability é **edge-triggered** (transição inativo → ativo), não repetido por frame/salva;
- os barramentos **nunca invadem** a região inferior-central do rádio, e o rádio **nunca move** os barramentos; o aparecimento de uma fala não pode fazer a HUD saltar.

---

## 7. Testes e validação obrigatórios (na implementação)

Testes de renderer montado (DOM), **não substituíveis por `grep`** (o `grep` pode existir como proteção adicional):

1. **Ausência do legado:** teste falha se `document.querySelector('.hud-cards-tray') !== null` ou `document.querySelector('.hud-card-chip') !== null`. Teste positivo: `document.querySelector('.hud-card-bus') !== null`. Proteção adicional (só código de produção, excluindo os testes que citam os seletores): `grep -rn "hud-cards-tray\|hud-card-chip" src/ --exclude="*.test.mjs"` = 0.
2. **Nº de itens:** `.hud-card-bus-item` == nº de ids distintos com `count > 0`. Stack não multiplica elementos (A x7 + B x3 → 2 itens, não 10).
3. **Atualização de stack:** `x3 → x4` mantém a **mesma** célula (identidade do nó), mesma ordem, muda só o contador/estado visual; os demais itens não são recriados nem mudam de posição.
4. **Categoria:** `ofensivo → O`, `defensivo → D`, `utilitario → U`. Categoria desconhecida gera fallback/log observável, nunca reclassificação silenciosa em Ofensivo.
5. **Catálogo inteiro:** fixture/debug `Map` com **todas as 32 cartas** e stacks variados, incluindo dois dígitos: 32 itens distintos; 14 em O, 11 em D, 7 em U; sem overflow, sem wrap, sem scroll, sem overlap; stacks de 2 dígitos legíveis.
6. **Layout:** `getBoundingClientRect()` + helper de interseção, em **ambos** os modos de vitais, em **1280×720, 1366×768, 1600×900, 1920×1080**. O bus não pode intersectar Score/Stats, Recursos, FOCO/SWIRL/CADEIA, vitais clássicos (quando ativos), timer/nível, rádio inferior-central nem a região central de gameplay.
7. **Casos de densidade:** 0, 1, 4, 8, 16, 24, 32 cartas e stress 14/11/7; stacks `x1, x2, x3, x5, x9, x10, x12`; rails vazios ocultos; ordem estável; nenhuma duplicação.
8. **Ciclo de vida:** após `unmount()` não restam observers, timers, referências nem nós; remontar não duplica itens.
9. **Rádio:** com fala de rádio visível o bus não se move e o rádio não é deslocado pelo bus.
10. Suíte específica + regressões de HUD/selftest/audits + `git diff --check` (ver `CLAUDE.md` §6).
11. Instrumentar `aiValidator.expect(...)` para invariantes mensuráveis (nº de células == nº de cartas com count > 0; nenhuma carta em rail errado).
12. **Validação visual:** somente com screenshots/aprovação do usuário. Sem evidência visual, reportar `VALIDADO VISUALMENTE: NÃO — NÃO FOI POSSÍVEL VALIDAR VISUALMENTE.`

## 7.1 Ordem de implementação (obrigatória)

1. Remover o renderer legado (criação do tray, `.hud-card-chip`, `updateWingmanRadioAnchor` acoplado ao tray, `radioTrayResizeObserver`).
2. Remover o CSS legado em `src/hud-styles.js`.
3. Criar `cardsBus` (DOM da §3.1).
4. Reescrever `updateCollectedCards` (§3.2).
5. Implementar ancoragem clássica/orbital (§3.3–3.5).
6. Responsividade/densidade (§4.1).
7. Teste com as 32 cartas.
8. Teste com rádio.
9. Teste DOM garantindo ausência do legado.
10. Runtime no navegador e screenshots.

Não avançar para polish visual (skins, glow, microanimações finas) enquanto o renderer antigo ainda existir.

---

## 8. Critérios automáticos de rejeição

A implementação está errada se: colocar cards no topo / entre Combo e FOCO / ao lado do Score / sobre os vitais; seguir a nave; invadir rádio, timer ou centro; mover FOCO/SWIRL/CADEIA ou vitais; usar scroll ou wrap; esconder cartas coletadas; renderizar stacks como vários ícones; quebrar com `x10` ou 32 cartas; deixar rail vazio ocupando espaço; deixar tray/chips antigos coexistindo; alterar a posição de outros elementos da HUD para acomodar o bus.

---

## 9. Fora de escopo desta spec

- Mudar comportamento/efeito das cartas ou o draft (`card-choice`, arcade draft).
- Redesenhar o restante da HUD.
- A escolha da linguagem visual (protótipo HTML com 3 skins do mesmo layout, pendente do usuário). Alternar skin **não pode** mudar nenhuma posição.
