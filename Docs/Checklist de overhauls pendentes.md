# Checklist de overhauls pendentes

Lista viva de overhauls/ideias discutidas em conversa, ainda não implementadas. Itens que já têm
documento de especificação completo apontam pro arquivo correspondente nesta mesma pasta.

---

## Já com documento de especificação completo (nesta pasta)

- [ ] **Cutscene de vida perdida** — ver `Cutscene de vida perdida — planejam.md`. Duas cutscenes
  consecutivas (queda + reserva) ao perder uma vida intermediária, em vez do flash de 1 frame atual.
- [x] **Overhaul 4 — Fog como mecânica de gameplay** — ver `Overhaul 4 — Fog como mecânica de g.md`.
  4 pilares implementados em v0.83.0 (commits `1a2bc27`/`ab2680b`). Cor do fog por evento virou
  setting opcional (`fogTacticalColors`, default `false`) a pedido do usuário. Redução de 60%
  na explosão de morte da Horda em fog denso não implementada (custo/benefício ruim).
- [x] **Overhaul do sistema de spawn e despawn** — ver `Overhaul do sistema de spawn e desp.md`.
  Ideias 1/2/3/6/8 implementadas em v0.83.0 (commit `feb0355`). Ideia 4 (orientação de
  aproximação) não implementada — competiria com o `lookAt` que a maioria dos inimigos já roda
  todo frame. Chefe fica fora do sistema de 3 fases (cutscene própria já cobre a entrada).
- [x] **Overhaul de Personalidade e Vida dos Wingmen** — ver `# Overhaul de Personalidade e Vida.md`.
  Ideias 1, 5, 4, 2 implementadas em v0.82.0 (commits `bc8b22d`/`c596ecf`/`c3c5d61`/`5b63546`).
  Ideia 3 (rádio) continua bloqueada até o protótipo visual (3 opções) ser decidido.
- [x] **Bullet-time no Card Choice (Arcade)** — ver `Bullet-time no Card Choice (Arcade).md`.
  Ideia B do Item 1 abaixo, escolhida pelo usuário — implementado (setting `arcadeCardChoicePauses`,
  default ligado = comportamento antigo). Ver `progresso/PROGRESSO_POS_.80.md`.
- [ ] **Boss — Colmeia-Mãe** — ver `Boss - Colmeia-Mãe.md`. Ideia 1 do Item 4 abaixo, escolhida
  pelo usuário pra virar rascunho de planejamento (Duelista Espelhado/Leviatã de Sucata seguem
  só como ideia, sem doc próprio ainda).
- [ ] **Evento — Apagão de Radar** — ver `Evento - Apagão de Radar.md`. Ideia 1 do Item 5 abaixo,
  escolhida pelo usuário pra virar rascunho de planejamento.
- [ ] **Obstáculos novos (4 selecionados)** — ver `Obstaculos novos (selecionados).md`. Ideias
  1/2/3/6 do Item 6 abaixo (Campo de Minas, Anel Rotativo, Nuvem de Poeira, Barreira de Energia
  Setorial) — Destroço Telecomandado e Cristal Instável ficam de fora por ora.

---

## Item 1 — Pause automático das cartas no modo arcade (opção em Settings)

Hoje `cardChoice` pausa 100% o jogo: `game-loop.js:139-142` dá um `return` antes de qualquer
update (rail, inimigos, jogador) — mesmo mecanismo das perguntas normais. Não existe flag de
settings parecida hoje pra usar de precedente. Pedido: opção pra desligar isso **só no modo
arcade (sem baralho)**, mantendo a gameplay coesa (sem travar como nos baralhos).

Três abordagens propostas, nenhuma escolhida ainda:

- **A — Escolha ao vivo**: overlay de cartas num canto do HUD (não modal full-screen), jogo
  continua 100% normal (rail avança, inimigos atiram, dá pra ser atingido). Escolhe com 1/2/3
  quando quiser; timeout sorteia automaticamente. Mais fiel ao pedido, mas ler 3 opções em
  combate ativo pode ser estressante.
- **B — Bullet-time**: `dt` cai pra ~0.2x por alguns segundos (ou até escolher) em vez de 1.0/0.0
  — tudo continua se movendo, só bem mais devagar, modal atual quase intacto por cima. Mais
  barato de implementar, mas tecnicamente ainda é uma forma de pausa (suavizada).
- **C — Fila pendente**: ao vencer o ciclo, aparece só uma notificação discreta ("Upgrade
  disponível — [tecla]"), jogo roda normal; escolhe quando quiser abrindo um overlay rápido.
  Mais fiel e flexível, mas exige um sistema de fila novo (cartas podem empilhar se nunca abrir).

Recomendação: B é a mais barata e menos arriscada visualmente; A é a que mais bate literalmente
com "não pausa como nos baralhos".

**Decisão do usuário: B (bullet-time)** — planejamento completo em
`Bullet-time no Card Choice (Arcade).md`.

---

## Item 2 — Escalar timer de cartas e spawn por nível de dificuldade

Pedido: a cada nível de dificuldade (1-9, `getDifficultyLevel()`), +25s no timer de geração de
cartas e +1 inimigo por leva de spawn.

**Ambiguidade resolvida pelo usuário**: é o **mesmo timer** que dispara tanto as 3 cartas no
arcade quanto uma pergunta no modo com baralho — confirmado que é o ciclo de combate
(`CYCLE_MS`/`cycleTimer`, `main-constants.js`/`mount-game.js`/`game-loop.js`), não o
`BONUS_INTERVAL_MIN/MAX` de cartas bônus no campo (que é outro sistema, alvo bônus pra atirar).

Técnica: `NORMAL_SPAWN_MIN_COUNT/MAX_COUNT` (`main-constants.js:112`) já tem precedente direto
de bônus dinâmico — `wingmanSpawnBonus = wingmanCount * 2` somado em `game-loop.js:676`. Somar
`+1 * (nível-1)` no mesmo lugar é trivial. O timer de ciclo (`CYCLE_MS`) somaria
`+25000 * (nível-1)` ms em `enterCombat()` (`mount-game.js`) — aplicado tanto no modo com
baralho quanto sem (o pedido não restringiu a um modo só, diferente do Item 1).

---

## Item 3 — Wingmen com vida + all-range mais livre

Pedido: aliados terem barra de vida e poderem ser alvejados por inimigos; mais livres no
all-range até ativar o botão de foco (focando outros inimigos enquanto o jogador foca o boss,
até apertar foco pra todos convergirem no boss).

Confirmado: hoje wingmen são **100% invulneráveis** — todo tiro/mira inimigo usa só
`playerPosition`, nunca a posição de um wingman (`enemies/index.js`). E o sistema `[D]`/foco que
foi descrito **já existe exatamente assim**: modo `'free'` = cada um decide sozinho quando
engajar (por `combatProfile.engagementChance` próprio, ver Ideia 2 do overhaul de personalidade),
modo `'focus'` (botão) = todos convergem no mesmo alvo por 6s com cooldown de 10s
(`wingmen.js:605-689`).

A parte nova de verdade é: (a) HP/barra de vida por wingman, (b) inimigos passarem a mirar neles
também.

**Decisão do usuário sobre morte/recrutamento**: ao zerar a vida, o wingman é destruído de
verdade (cutscene de queda — provavelmente reaproveitando/adaptando a mecânica de queda da
"Cutscene de vida perdida" já planejada em `Cutscene de vida perdida — planejam.md`, que também
descreve uma nave "pegando fogo e caindo"). Ele só volta se uma **carta de recrutamento
específica dele** aparecer como opção de carta-recompensa depois. Regra de timing importante:
essa carta **não pode aparecer no mesmo ciclo em que ele acabou de morrer** — só no ciclo
seguinte (o próximo disparo do timer do Item 2 acima).

**Peça técnica nova que isso exige**: hoje só existe UMA carta genérica `{ id: 'wingman', ... }`
(`roguelike.js:19`) que recruta o PRÓXIMO piloto por índice sequencial (`player.js:210-212`,
`applyCard`, `wingmanCount += 1`) — não existe conceito de recrutar um piloto ESPECÍFICO nomeado.
Pra "uma carta dele" fazer sentido, precisaria de 4 cartas novas (uma por piloto morto) ou uma
carta dinâmica cujo texto/efeito se adapta a qual piloto está morto no momento — e o
`buildCardExcludeSet()` (`player.js:287-309`) precisaria de uma nova regra: excluir a carta de
recrutamento de um piloto enquanto ele está VIVO, e (pela regra de timing acima) também excluí-la
no PRÓPRIO ciclo em que ele acabou de morrer, liberando só a partir do ciclo seguinte.

**Ainda por planejar** (nas palavras do usuário: "a forma como os inimigos devem focar neles tem
que ser planejada"): hoje todo tiro/mira inimigo mira só `playerPosition` — dar aos inimigos a
capacidade de mirar em wingmen também precisa de regras próprias (miram só quando o wingman está
mais perto que o jogador? Um inimigo escolhe um alvo e mantém foco nele, ou reavalia todo frame?
Todos os tipos de inimigo passam a poder mirar wingman, ou só alguns? Chefe/Dourado também?) —
nenhuma decisão tomada ainda, fica como próximo ponto de discussão antes de codar.

---

## Item 4 — Boss novo (3 ideias, nenhuma escolhida)

1. **Colmeia-Mãe** — parada no centro, escudo giratório 360° permanente (tipo Fragata sem ângulo
   fixo exposto), expele ondas de mini-swarms periodicamente e só fica vulnerável nos segundos de
   "recarga" após cada onda.
2. **Duelista Espelhado** — pequeno e ágil, copia o próprio movimento do jogador com atraso curto
   (mesma técnica de buffer usada no roll do Slippy, ver Ideia 4 do overhaul de personalidade)
   pra ficar sempre colado/de lado, dificultando mira direta.
3. **Leviatã de Sucata** — gigante e lento, múltiplos módulos/torretas destacáveis com HP próprio
   espalhados pelo casco — núcleo central só fica vulnerável depois que todos os módulos caem.

**Escolhido pelo usuário: 1 (Colmeia-Mãe)** — planejamento em `Boss - Colmeia-Mãe.md`.

---

## Item 5 — Evento novo (3 ideias, nenhuma escolhida)

1. **Apagão de Radar** — minimapa cego por N segundos, combinado com mais Sussurro (que já é
   invisível) pra reforçar o tema.
2. **Corrente Solar** — vento estelar atravessa a tela empurrando lateralmente jogador E
   inimigos, obrigando a compensar o desvio manualmente.
3. **Eco de Baralho** — janela curta de pontuação em dobro por resposta certa, mas
   `enemyAggression` no teto — risco-recompensa puro de estudo.

**Escolhido pelo usuário: 1 (Apagão de Radar)** — planejamento em `Evento - Apagão de Radar.md`.

---

## Item 6 — Obstáculo novo (6 ideias, nenhuma escolhida)

1. **Campo de Minas Estelares** — esferas estáticas que explodem em área ao serem tocadas OU
   atingidas (força desvio, não só absorve tiro como o Detrito).
2. **Anel Rotativo** — argola giratória; passar pelo centro é seguro, tocar a borda dói.
3. **Nuvem de Poeira Densa** — sem dano, mas reduz visibilidade e desacelera ao atravessar.
4. **Destroço Telecomandado** — detrito maior em trajetória senoidal em vez de deriva aleatória —
   precisa ler o padrão.
5. **Cristal Instável** — 1 HP, explode em cadeia acertando obstáculos vizinhos ao morrer.
6. **Barreira de Energia Setorial** — parede fina pulsando sólida/atravessável — timing de
   passagem, sem HP.

**Escolhidos pelo usuário: 1, 2, 3, 6** — planejamento conjunto em
`Obstaculos novos (selecionados).md`. Ideias 4 (Destroço Telecomandado) e 5 (Cristal Instável)
ficam de fora por ora.
