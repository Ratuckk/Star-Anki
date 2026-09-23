# Overhaul de Personalidade e "Vida" dos Wingmen

## Documento de especificação completo

---

primeiro de tudo, renomeie phantom pra Krystal

## 0. Contexto

### 0.1 Estado atual

Os 4 wingmen (`Falco`, `Peppy`, `Slippy`, `Phantom`) compartilham hoje:
- **Mesma IA de voo** — taxas globais `CRUISE_TURN_RATE = 2.2`, `AIM_TURN_RATE = 3.2`, `accelRate = 3.0/5.5`, raios de detecção e engajamento iguais
- **Mesma agressividade** — `ENGAGEMENT_CHANCE = 0.45`, dogfight com duração idêntica, precisão de tiro uniforme
- **Mesmo comportamento de formação** — a vaga de `FORMATION_SLOTS` é estática, e o voo em direção a ela é o mesmo código pros 4
- **Zero reatividade** — não reagem a nada do estado do jogador (vida baixa, combo, dano, boost)

O que os diferencia hoje é puramente cosmético: nome, cor, modelo 3D (`modelType`), `homeSide`, `fireInterval`, `burstCount`, `abilityId`. O **comportamento emergente** é uniforme — todos parecem o mesmo piloto com skins diferentes.

### 0.2 Objetivo deste overhaul

Dar a cada piloto **personalidade reconhecível no comportamento**, não só no visual. O jogador deve conseguir identificar quem está fazendo o quê sem olhar pra tela — só pela sensação de voo, pelos padrões de engajamento, pelas frases de rádio, pelas reações ao estado dele.

**Princípio central**: nada do que já funciona é tocado. Formação, disciplina de engajamento (só 1 em dogfight por vez em modo livre), habilidades únicas, sistema de soft-lock corrigido em `toggleCommand` — tudo isso continua intacto. Cada ideia abaixo é **camada por cima**.

### 0.3 As 5 ideias

1. **Perfil de voo por piloto** — taxas próprias de rotação/aceleração/cruzeiro
2. **Agressividade assimétrica** — cada piloto engaja diferente
3. **Comunicação por rádio** — pilotos falam. *(PENDENTE: aguarda protótipo HTML com 3 opções visuais)*
4. **Personalidade de formação** — cada piloto voa a vaga do seu jeito
5. **Reatividade a estado do jogador** — pilotos reagem a vida baixa, combo, dano, boost

---

## 1. Ideia 1 — Perfil de voo por piloto

### 1.1 Conceito

Substituir as constantes globais (`CRUISE_TURN_RATE`, `AIM_TURN_RATE`, `accelRate` de dogfight, `profile.speed`) por **valores próprios por piloto**, declarados em `WINGMAN_PROFILES`.

### 1.2 Valores propostos (com justificativa)

| Piloto | `cruiseTurnRate` | `aimTurnRate` | `accelRate` | `speed` (cruzeiro) | Estilo de voo |
|---|---|---|---|---|---|
| **Falco** | 2.6 | 3.8 | 3.6 | 46 | Rápido, giros apertados, corta o horizonte |
| **Peppy** | 1.5 | 2.2 | 2.2 | 32 | Pesado, mantém curso, vira devagar |
| **Slippy** | 2.2 | 3.0 | 3.0 | 40 | Equilibrado, levemente ágil |
| **Phantom** | 2.4 | 3.2 | 3.2 | 44 | Fluido e controlado, elegante |

**Nota sobre `AIM_TURN_RATE`**: hoje é `3.2` global. Falco sobe pra `3.8` (trava mira rápido, é interceptador), Peppy desce pra `2.2` (não consegue acompanhar alvos em zigue-zague, reflete o "defensor" — ele prefere ir direto). Isso é intencional e dá personalidade real ao combate dele.

### 1.3 Como implementar

Em `src/combat/wingmen.js`, `WINGMAN_PROFILES` ganha os campos:

```js
{
  id: 0, name: 'Falco', /* ... */
  flightProfile: {
    cruiseTurnRate: 2.6,
    aimTurnRate: 3.8,
    accelRate: 3.6,
    cruiseSpeed: 46,
  },
  // ...
}
```

E no loop de update, substituir as constantes:
- `CRUISE_TURN_RATE` → `w.profile.flightProfile.cruiseTurnRate`
- `AIM_TURN_RATE` → `w.profile.flightProfile.aimTurnRate`
- `accelRate` local (dentro do bloco de física) → `w.profile.flightProfile.accelRate`
- `w.profile.speed` já existe — vira `w.profile.flightProfile.cruiseSpeed`

### 1.4 Risco

**Baixo.** Só mudam valores — nenhuma estrutura nova. Se Falco girar rápido demais e ficar "nervoso", é uma linha pra descer pra `2.3`. Se Peppy ficar lento demais pra acompanhar, sobe `cruiseTurnRate` pra `1.8`.

---

## 2. Ideia 2 — Agressividade assimétrica em combate

### 2.1 Conceito

Hoje `ENGAGEMENT_CHANCE = 0.45`, alcance de detecção `80u`, duração de dogfight `4.2-6.0s`, `AIM_SPREAD_RAD = 0.05` — todos globais. Cada piloto ganha o próprio conjunto.

### 2.2 Valores propostos

| Piloto | `engagementChance` | `dogfightDuration` | `detectionRange` | `aimSpreadRad` | Comportamento |
|---|---|---|---|---|---|
| **Falco** | 0.65 | 6.5s | 90u | 0.08 | Agressivo, atira muito, mira imperfeita |
| **Peppy** | 0.25 | 3.5s | 60u | 0.03 | Defensivo, raramente engaja, tiros certeiros |
| **Slippy** | 0.50 | 4.5s | 75u | 0.05 | Intermediário |
| **Phantom** | 0.40 | 5.5s | 80u | 0.03 | Cirúrgico, engaja quando vale |

**Nota sobre Peppy**: ele **não** deve ser o "wingman ruim". A ideia é que ele é o **defensor** — fica perto do jogador, engaja pouco, mas quando engaja é letal (mira precisa, poucos tiros certeiros). Combina com a vaga dele (próxima) e com a habilidade única (Guarda).

**Nota sobre `aimSpreadRad`**: Peppy e Phantom com `0.03` significa ~1.7° de dispersão, praticamente mira perfeita. Falco com `0.08` significa ~4.6°, mais "metralhadora de spray and pray". Reforça a personalidade.

### 2.3 Como implementar

Mesma estrutura da Ideia 1 — `combatProfile` em cada perfil:

```js
combatProfile: {
  engagementChance: 0.65,
  dogfightDuration: 6.5,
  detectionRange: 90,
  aimSpreadRad: 0.08,
}
```

Substitui `ENGAGEMENT_CHANCE`, os valores hardcoded de `stateTimer > 4.2`/`6.0`, o `dist < 80` do filtro de candidatos, e o `AIM_SPREAD_RAD` no cálculo de dispersão do tiro.

### 2.4 Risco

**Médio.** Falco com 0.65 + 6.5s de dogfight pode parecer overkill de novo — o histórico do projeto tem 3 iterações "overkill ↔ transe". Se acontecer, ajustar Falco pra `0.55` e `5.5s`. A disciplina de "só 1 em dogfight por vez" continua segurando o resto.

---

## 3. Ideia 3 — Comunicação por rádio

### ⚠️ STATUS: PENDENTE DE DECISÃO VISUAL

Antes de implementar, o usuário vai criar (com outro Claude) um **protótipo HTML animado com 3 opções visuais** para escolher como as falas aparecem. O que está especificado abaixo é o **modelo de dados e lógica** (que não muda independente da opção visual escolhida), com o "como aparece na tela" **deixado em aberto**.

### 3.1 Conceito

Pilotos emitem **frases curtas** em momentos-chave. Puramente cosmético — não altera IA, dano, ou timing. A frase reforça a personalidade e dá a sensação de que os aliados são **tripulação**, não drones.

### 3.2 Dispatcher de rádio (estrutura, independente do visual)

Novo módulo `src/combat/wingman-radio.js`:

```js
export function createWingmanRadio() {
  let lastSpokenAt = 0
  const GLOBAL_COOLDOWN_MS = 6000  // no máximo 1 frase a cada 6s no geral

  // Estrutura: { [pilotId]: { [eventId]: [strings] } }
  const LINES = {
    0: { /* Falco */
      engage_dogfight: ['Vou atrás dele!', 'Alvo travado.'],
      ability_ram: ['Investida!'],
      kill: ['Alvo abatido.'],
      take_damage: ['Estou levando fogo!'],
      player_low_health: ['Aguenta!'],
      return_formation: ['Voltando pra formação.'],
      alone: ['Sozinho de novo...'],
    },
    1: { /* Peppy */ /* ... */ },
    2: { /* Slippy */ /* ... */ },
    3: { /* Phantom */ /* ... */ },
  }

  return {
    // Chamado pelo dispatcher de eventos do wingman system
    // Retorna a string a ser exibida OU null se está em cooldown
    trySpeak(pilotId, eventId, now = performance.now()) {
      if (now - lastSpokenAt < GLOBAL_COOLDOWN_MS) return null
      const pool = LINES[pilotId]?.[eventId]
      if (!pool || pool.length === 0) return null
      lastSpokenAt = now
      return pool[Math.floor(Math.random() * pool.length)]
    },
    reset() { lastSpokenAt = 0 },
  }
}
```

### 3.3 Eventos (disparo)

Chamadas ao `trySpeak()` em pontos específicos do `wingmen.js`:

| Evento | Onde dispara | Comentário |
|---|---|---|
| `engage_dogfight` | Transição `patrol → dogfight` (autônomo) | Um dos pilotos fala, não todos |
| `engage_focus` | Comando manual `[D]` | Falco lidera |
| `ability_ram` / `ability_guard` / `ability_repair` / `ability_assist` | Ao ativar a habilidade única | Cada um com frase própria |
| `kill` | Quando um tiro do piloto dá o abate | |
| `take_damage` | Quando o piloto leva dano (hoje não existe — wingmen são invulneráveis) | ⚠️ Ver §3.5 |
| `player_low_health` | Quando a vida do jogador cruza < 40% | Só 1 piloto fala (o primeiro que checar) |
| `return_formation` | Transição `dogfight → patrol` | |
| `alone` | Quando o último wingman é removido (1x por partida) | Momento "quebrando a quarta parede", leve |

### 3.4 API para o HUD

O sistema retorna a string via callback/evento; quem decide **como mostrar** é o HUD. O módulo `wingman-radio.js` **não conhece o DOM** — é puramente lógico. Isso mantém ele testável em Node e independente da opção visual que você escolher no protótipo.

```js
// Em combat/index.js, repassar pro HUD:
wingmanRadio.trySpeak(pilotId, 'engage_dogfight')  // retorna string | null
// o HUD então chama hud.showWingmanRadio(pilotId, string)
```

### 3.5 Pendência real (não é design, é mecânica)

O evento `take_damage` **não existe hoje** — wingmen são invulneráveis por design (nunca viram alvo de nada). Se quiser essa fala, é preciso decidir se:
- (a) Inimigos podem mirar em wingmen (muda balanceamento, wingmen viram alvos de verdade, podem ser abatidos)
- (b) Só dispara quando o **jogador** leva dano, não o wingman (`player_take_damage`)
- (c) Cortar esse evento da lista

**Recomendação**: (b) — não muda balanceamento, mantém o pedido de "mais vida" sem custo mecânico. Marcar (a) como decisão futura se você quiser wingmen realmente destrutíveis.

### 3.6 Como implementar depois do protótipo

Quando você decidir qual das 3 opções visuais do HTML usar, a implementação:
1. Cria `src/combat/wingman-radio.js` (estrutura acima)
2. Adiciona os call sites em `wingmen.js` (8 pontos de disparo)
3. Expõe `hud.showWingmanRadio(pilotId, string)` no HUD, com o visual decidido
4. Adiciona o cooldown global e o "só 1 frase por vez" (o sistema já segura via `GLOBAL_COOLDOWN_MS`)
5. `settings.js` — toggle `wingmanRadioEnabled: true`

---

## 4. Ideia 4 — Personalidade de formação (voo estético)

### 4.1 Conceito

`FORMATION_SLOTS` continua definindo o **centro** da vaga, mas cada piloto tem um **comportamento de voo próprio por cima** — oscilações, rotações, efeitos, todos **cosméticos** (não afetam hitbox, nem colisão, nem lógica de combate).

### 4.2 Comportamentos por piloto

| Piloto | Efeito | Como implementar |
|---|---|---|
| **Falco** | Oscilação lateral lenta (±3u em ciclo de 2.5s) na vaga | `slot.side + sin(elapsed * 0.4) * 3` no cálculo do `_wmSlotPos` |
| **Peppy** | Nariz sempre virando levemente pro jogador quando em formação | Depois do `lookAt` normal, aplicar `rotateY` limitado a ±10° baseado no vetor até o jogador |
| **Slippy** | Roll que imita o bank do jogador com 0.3s de atraso | Buffer de `rail.getRollAngle()`, aplicar defasado no `smoothRoll` dele |
| **Phantom** | Fica semi-transparente (opacidade 0.35) por 1.5s a cada 8s | Timer por instância, animar `material.opacity` do mesh |

### 4.3 Implementação

Cada comportamento vive no **loop de orientação** de `wingmen.js`, em pontos de extensão bem definidos:

- **Falco**: modifica `_wmSlotPos` no bloco de formação
- **Peppy**: pós-`rotateTowards`, aplica um `rotateY` adicional limitado
- **Slippy**: no cálculo de `w.smoothRoll`, ler do buffer de roll do jogador em vez da velocidade lateral
- **Phantom**: timer dedicado (`phantomPhaseTimer`), anima o material por frame

**Nota crítica sobre materiais**: Phantom hoje compartilha material entre todos os wingmen do mesmo tipo (mesmo `profile.modelType`). Pra animar opacidade **só dele**, precisa clonar o material por instância (`mesh.material.clone()` no `spawnMember`), ou aceitar que trocar opacidade afeta todos os Phantom (não faz sentido — só tem 1 Phantom). **Recomendação**: clonar só pra Phantom.

### 4.4 Risco

**Médio.** Mexer em orientação é o terreno historicamente mais instável — `slerp`, `rotateZ`, `rotateTowards`, `AIM_SPREAD_RAD ausente`, formação em transe. Cada efeito:
- **Falco**: risco baixo — só muda o alvo da vaga.
- **Peppy**: risco médio — mexe em rotação pós-`lookAt` (mesmo padrão de `rollZ` do BUG-03, mas com `rotateY` em vez de `rotateZ`).
- **Slippy**: risco médio — mexe no `smoothRoll`.
- **Phantom**: risco baixo — só material.

Se algo quebrar, dá pra desligar cada efeito individualmente por toggle.

---

## 5. Ideia 5 — Reatividade a estado do jogador

### 5.1 Conceito

Pilotos reagem ao **estado do jogador** de formas diferentes, mudando peso de decisão existentes (não criando IA nova). Cada piloto tem uma resposta característica.

### 5.2 Reações propostas

| Gatilho | Falco | Peppy | Slippy | Phantom |
|---|---|---|---|---|
| **Vida baixa (<40%)** | `engagementChance` sobe pra 0.85 (ataca mais) | Desce pra vaga mais próxima (`forward: 2.0` em vez de `5.0`) — escolta apertada | Chance de soltar orbe de cura sobe 50% | Foca em mirar no inimigo mais próximo do jogador |
| **Combo alto (x2.0+)** | `engagementChance` sobe pra 0.70 | Sem mudança (continua defensivo) | Comenta rádio (ideia 3) | Reduz `aimSpreadRad` pra 0.02 (cirúrgico) |
| **Perdeu vida agora** | Recua pra vaga neutra | Voa **na frente** do jogador por 3s (escudo humano visual) | Sem mudança | Sem mudança |
| **Jogador em boost** | Sem mudança | Sem mudança | Se reposiciona pra não ficar no cone do boost | Acelera (acompanha o boost) |

### 5.3 Implementação

Um novo módulo `src/combat/wingman-reactivity.js` (ou uma função dentro de `wingmen.js`) que roda uma vez por frame, antes do loop de pilotos, e **escreve num objeto compartilhado**:

```js
const reactivityState = {
  playerLowHealth: session.health / player.getMaxHealth() < 0.4,
  playerHighCombo: session.comboMultiplier >= 2.0,
  playerJustLostLife: (performance.now() - lastLifeLossAt) < 3000,
  playerBoosting: player.isPropulsionActive(),
}
```

Cada piloto, no update, consulta esse objeto e modula seus próprios campos (não mexe no `wingman.js` principal — cada piloto **lê** o estado e ajusta o que quiser).

### 5.4 Reação "escudo humano" do Peppy

O Peppy voa **na frente** do jogador por 3s quando o jogador perde uma vida. Isso é puramente visual — **não bloqueia dano** (wingmen não absorvem tiros hoje, e implementar isso exigiria mudar o sistema de dano). Se você quiser que ele realmente absorva, é decisão de mecânica separada (ver §7).

### 5.5 Risco

**Baixo.** Cada reação é um ajuste de peso em cima de um sistema que já funciona. Se alguma ficar ruim, é uma linha pra reverter. A única preocupação é o **combo alto + vida baixa** ao mesmo tempo gerando confusão (Falco fica com `engagementChance` alta, mas qual prioridade?). **Solução**: prioridade fixa — vida baixa vence combo.

---

## 6. Ordem de implementação sugerida

1. **Ideia 1** — perfil de voo (mais barata, mais impacto, menos risco)
2. **Ideia 5** — reatividade (soma ao impacto da 1, risco baixo)
3. **Ideia 4** — personalidade de formação (visual, risco médio, efeitos independentes)
4. **Ideia 3** — rádio (**bloqueada até o protótipo HTML ser decidido**)
5. **Ideia 2** — agressividade assimétrica (por último, é a mais arriscada das 5)

Cada uma em commit separado. Testar visualmente após cada uma antes de seguir.

---

## 7. Arquivos afetados

| Arquivo | Ideias | Mudança |
|---|---|---|
| `src/combat/wingmen.js` | 1, 2, 3, 4, 5 | `WINGMAN_PROFILES` ganha `flightProfile`/`combatProfile`; loop de update lê os perfis; pontos de extensão pra personalidade de formação; call sites de rádio; leitura de `reactivityState` |
| `src/combat/wingman-radio.js` (**novo**) | 3 | Módulo de dispatcher de rádio |
| `src/combat/index.js` | 3, 5 | Repassa chamadas de rádio pro HUD; expõe `getReactivityState()` pro game-loop |
| `src/game-loop.js` | 5 | Calcula e atualiza `reactivityState` uma vez por frame (tem acesso a `session`, `player`, `rail`); chama `hud.showWingmanRadio` quando dispara |
| `src/hud-game.js` | 3 | `showWingmanRadio(pilotId, string)` — visual decidido pelo protótipo |
| `src/hud-styles.js` | 3 | CSS do balão/notificação de rádio — visual decidido pelo protótipo |
| `src/settings.js` | 3 | Toggle `wingmanRadioEnabled: true` |
| `src/selftest.mjs` | 3 | Testes do dispatcher (cooldown global, fallback se piloto/evento não existe) |

---

## 8. Riscos consolidados

### 8.1 Risco de "overkill" (Ideia 2)
Falco `0.65 + 6.5s` pode reintroduzir o problema de v0.70.0. **Mitigação**: começar com Falco em `0.55`/`5.5s` e subir se o jogador achar "pouco". A regra "1 em dogfight por vez" continua segurando.

### 8.2 Risco de "transe" (Ideias 1 e 4)
Se `cruiseTurnRate` ficar baixo demais pro Peppy, ou o lerp de formação (Ideia 4, Falco) sincronizar com a taxa base errada, pode voltar o comportamento "parados". **Mitigação**: Ideia 4 (Falco) só mexe em `slot.side`, não em `patrolTarget.lerp`. Ideia 1 (Peppy `1.5`) ainda é 3x mais rápido que o que causou o transe.

### 8.3 Risco de material compartilhado (Ideia 4, Phantom)
`mesh.material` é compartilhado. Animar opacidade afeta todos do mesmo tipo. **Mitigação**: `material.clone()` só pro Phantom no `spawnMember`. Confirmar no `dispose` que o clone é liberado.

### 8.4 Risco de rádio virar fadiga (Ideia 3)
Frases demais poluem. **Mitigação**: cooldown global de 6s (já no spec de §3.2), "só 1 frase visível por vez" no HUD, toggle em Configurações.

### 8.5 Risco de conflito com Horda / boss por score
O plano de Horda + boss por score (mensagens anteriores) também mexe em `enemies/index.js`. Nenhum dos dois toca `wingmen.js` ou os arquivos das Ideias 1-5 — **podem ser implementados em paralelo sem conflito**.

### 8.6 Risco de `reactivityState` ficar desatualizado (Ideia 5)
O `game-loop.js` precisa rodar **antes** de `combat.update()` no frame pra o estado estar fresco quando os pilotos leem. A ordem atual já é essa — só confirmar na hora da implementação.

---

## 9. Perguntas em aberto

1. **Ideia 3 (rádio)**: bloqueada até o protótipo HTML com 3 opções visuais ser decidido. As opções devem cobrir: (a) balão flutuante 3D perto do piloto no mundo; (b) notificação de HUD no canto (estilo `hud-squadron-notice`); (c) faixa inferior de "log de rádio" com 2-3 últimas falas visíveis. As três são implementáveis — o protótipo existe pra escolher a direção visual, não pra mudar o modelo de dados (que é o §3.2).

2. **Evento `take_damage` da rádio**: decidir entre (a) wingmen destrutíveis (muda balanceamento), (b) só reage a dano do jogador, (c) cortar. Recomendação (b), ver §3.5.

3. **Combo x2.0+ na Ideia 5** — o `comboMultiplier` é do `session`, mas o "combo" hoje do jogador é sobretudo do **combo de acertos de pergunta**, não do combo de kills (`hud-kill-chain` é outro sistema). Confirmar qual dos dois dispara a reação "combo alto". Recomendação: usar o **combo de perguntas** (`session.comboMultiplier`) — é o que mais muda o jogo ao longo da run.

4. **Phantom invisível da Ideia 4** — 0.35 de opacidade é quase invisível contra fundo preto. Se ficar forte demais, subir pra 0.5. Isso é ajuste visual que só roda após teste.

5. **Escudo humano do Peppy (Ideia 5)** — se o usuário quiser que ele **de fato** absorva dano, é uma mudança de mecânica separada (decisão de design fora deste documento). Este documento só especifica o comportamento **visual** de "voar na frente".

---

## 10. Resumo executivo

O overhaul dá **personalidade reconhecível** aos 4 pilotos em 5 camadas independentes:

1. **Perfil de voo** (Ideia 1) — cada piloto voa diferente
2. **Agressividade** (Ideia 2) — cada piloto luta diferente
3. **Rádio** (Ideia 3) — cada piloto fala diferente *(pendente de protótipo visual)*
4. **Formação estética** (Ideia 4) — cada piloto ocupa a vaga à sua maneira
5. **Reatividade** (Ideia 5) — cada piloto reage ao jogador à sua maneira

**Princípio central**: nada que já funciona é tocado. Cada ideia é camada por cima. Cada uma pode ser desligada individualmente se algo der errado.

**Riscos históricos reconhecidos**: qualquer mudança em rotação de wingman precisa de cuidado extra (o projeto já passou por `slerp`, `rotateZ`, `rotateTowards` corrigidos 3x). Ideia 4 (Peppy/Slippy) é a que mais toca esse terreno.

---

*Fim do documento. Aprovar §6 (ordem) e §9 (perguntas em aberto) antes de começar. Ideia 3 fica bloqueada até o protótipo visual — o resto pode começar imediatamente.*