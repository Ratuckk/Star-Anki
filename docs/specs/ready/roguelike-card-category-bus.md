# Barramentos por Categoria — Overhaul dos Cards Roguelike

> **Status:** `ready` — decisão visual/estrutural fechada pelo usuário; implementação **ainda não iniciada**.
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

Critério de aceite: `grep -rn "hud-cards-tray\|hud-card-chip" src/` retorna **zero** ocorrências ao final da implementação.

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
- os barramentos **nunca invadem** a região inferior-central do rádio, e o rádio **nunca move** os barramentos; o aparecimento de uma fala não pode fazer a HUD saltar.

---

## 7. Validação obrigatória (na implementação)

1. Testes de layout com `getBoundingClientRect()` e helper de interseção, para **ambos** os modos de vitais (clássicos/orbitais), em **1280×720, 1366×768, 1600×900, 1920×1080**.
2. O bus não pode intersectar: Score/Stats, Recursos, FOCO/SWIRL/CADEIA, vitais clássicos (quando ativos), timer/nível, rádio inferior-central, região central de gameplay.
3. Casos: 0, 1, 4, 8, 16, 24, 32 cartas e stress 14/11/7; stacks `x1…x12`; categorias vazias ocultas; sem `flex-wrap`/scroll; ordem estável; nenhuma duplicação de cartas; `grep` do renderer antigo = 0.
4. Rodar suíte específica, regressões de HUD/selftest/audits e `git diff --check` (ver `CLAUDE.md` §6).
5. Instrumentar com `aiValidator.expect(...)` invariantes mensuráveis (ex.: nº de células == nº de cartas com count > 0; nenhuma carta em rail errado).
6. **Validação visual:** somente com screenshots/aprovação do usuário. Sem evidência visual, reportar `VALIDADO VISUALMENTE: NÃO — NÃO FOI POSSÍVEL VALIDAR VISUALMENTE.`

---

## 8. Critérios automáticos de rejeição

A implementação está errada se: colocar cards no topo / entre Combo e FOCO / ao lado do Score / sobre os vitais; seguir a nave; invadir rádio, timer ou centro; mover FOCO/SWIRL/CADEIA ou vitais; usar scroll ou wrap; esconder cartas coletadas; renderizar stacks como vários ícones; quebrar com `x10` ou 32 cartas; deixar rail vazio ocupando espaço; deixar tray/chips antigos coexistindo; alterar a posição de outros elementos da HUD para acomodar o bus.

---

## 9. Fora de escopo desta spec

- Mudar comportamento/efeito das cartas ou o draft (`card-choice`, arcade draft).
- Redesenhar o restante da HUD.
- A escolha da linguagem visual (protótipo HTML com 3 skins do mesmo layout, pendente do usuário). Alternar skin **não pode** mudar nenhuma posição.
