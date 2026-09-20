# Boss novo — Colmeia-Mãe

## Documento de planejamento (rascunho inicial, pra discussão futura)

---

## 0. Contexto

### 0.1 Bosses existentes hoje

- **Chefe** (`src/enemies/boss.js`): dodecaedro móvel, persegue o jogador (`chaseSpeed` por
  fase), 3 fases por HP (`BOSS_PHASES`, thresholds 1.0/0.66/0.33) que mudam cor/velocidade/
  densidade de tiro/padrão, laser telegrafado periódico, escudo refletor azul a cada 7s (3s
  ativo). Ataca ativamente o tempo todo.
- **Dourado** (`src/enemies/golden.js`): torus knot, também persegue (mais devagar), solta
  minions (mini-naves), laser grande telegrafado, dash evasivo + teleporte reativo a dano.
  Também ativo/ofensivo o tempo todo.

Nenhum dos dois tem uma fase "passiva" real — ambos estão sempre perseguindo/atirando. A
Colmeia-Mãe propõe o oposto: um boss majoritariamente **estacionário e defensivo**, que abre
janelas de vulnerabilidade em vez de ficar exposto o tempo todo.

### 0.2 Conceito

Fica parada (ou quase) no centro da arena, protegida por um escudo giratório **permanente e sem
ângulo exposto fixo** (diferente da Fragata, que tem um arco fixo que gira lentamente e SEMPRE
tem um lado exposto — a Colmeia-Mãe fica 100% coberta o tempo todo, exceto durante uma janela
curta de vulnerabilidade). Periodicamente "expele" ondas de mini-swarms em direções específicas
que o jogador precisa desviar/abater, e só nesse momento de expelir (ou logo depois) ela fica
vulnerável por alguns segundos.

Tema: "sobreviva às ondas, ataque na abertura" — inverte o ritmo usual de chefe (que é
"esquive do ataque dele, ataque quando puder") pra "aguente a pressão do enxame, ataque só
quando ele se abrir".

---

## 1. Mecânica proposta

### 1.1 Estados (máquina de estados, análoga ao `enemy.fsm`/`state-machine.js` já usado por
Blaster/Tank)

- **`shielded`** (padrão): escudo 360° ativo, invulnerável a qualquer dano (mesmo tratamento que
  o escudo refletor do Chefe hoje — `enemyHit.isShieldActive`, `boss.js`, bloqueia dano e
  reflete/absorve o tiro). Gira lentamente em torno do próprio eixo (cosmético).
- **`spawning`** (periódico, a cada `HIVE_SPAWN_INTERVAL_S`): ainda `shielded`, mas dispara uma
  onda de mini-swarms (reaproveitando `spawnMiniSwarmFromHorda`-like, mas partindo do PRÓPRIO
  corpo da Colmeia-Mãe em vez de um ponto de morte) em N direções/ângulos pré-definidos —
  telegrafado visualmente (ex.: pulso de luz nas "aberturas" de onde os mini-swarms vão sair,
  reaproveitando o padrão de `telegraph`/`chargeCircle` já usado por outros inimigos).
- **`vulnerable`** (logo após terminar de expelir uma onda, dura `HIVE_VULNERABLE_DURATION_S`):
  escudo cai (visualmente muda de cor/opacidade, mesmo padrão do Chefe trocando de fase), HP
  real fica exposto a dano normal. Ao fim da janela (ou ao levar dano suficiente — decisão de
  design em aberto, ver §4), volta pra `shielded` e reinicia o ciclo.

### 1.2 Números de partida (a ajustar em playtest)

| Constante | Valor sugerido | Nota |
|---|---|---|
| `HIVE_HP_BASE` | 40 | Entre Chefe (33) e Dourado (70) — miniboss "médio" |
| `HIVE_SPAWN_INTERVAL_S` | 8.0 | Tempo em `shielded` antes da próxima onda |
| `HIVE_WAVE_COUNT` | 4-6 mini-swarms por onda | Escala por `getDifficultyLevel()`, mesmo padrão de `HORDA_SPLIT_COUNT_PER_LEVEL` |
| `HIVE_VULNERABLE_DURATION_S` | 3.5 | Janela de ataque real |
| `HIVE_HIT_RADIUS` | ~6.0 | Entre Fragata (3.74) e Chefe (7.7), coerente com "corpo grande e parado" |

### 1.3 Nível de dificuldade (1-9)

Seguindo o padrão já estabelecido pra Chefe/Dourado (`BOSS_HP_PER_LEVEL = 15`, sem fórmula
genérica de `xStatsForLevel`): a Colmeia-Mãe ganharia HP por nível E, mais interessante pro
conceito dela, **encolheria `HIVE_VULNERABLE_DURATION_S`** conforme o nível sobe (janela de
ataque menor = mais difícil de aproveitar), análogo a como o Chefe encolhe o intervalo de laser
por nível hoje (`boss.js`, `BOSS_LEVEL_LASER_SHRINK_PER_LEVEL`).

---

## 2. Onde ela se encaixa

Arena-only (como Chefe/Dourado/Fragata) — não faz sentido em trilho, o conceito depende do
jogador poder circular ao redor dela e ler o timing das ondas. Precisa de uma decisão de
**onde ela entra no fluxo do jogo**: é um chefe alternativo (substitui o Chefe normal em alguns
ciclos, como uma variante) ou é um encontro à parte (tipo um "mini-evento" de arena, nem toda
run necessariamente encontra ela)? Não decidido — ver §4.

---

## 3. Reaproveitamento técnico

- **Escudo**: mesmo padrão booleano `isShieldActive` do Chefe (`boss.js`), só que sem o
  ciclo automático de 7s/3s — controlado pelos estados `shielded`/`vulnerable` acima.
- **Mini-swarms**: reaproveita 100% o kind `MINI_SWARM_KIND` já existente (`miniSwarm.js`),
  igual a Horda já faz — só muda o ponto de spawn (corpo da Colmeia-Mãe) e a razão do spawn
  (ciclo de onda, não morte).
- **Telegraph**: reaproveita `effects.telegraph`/`effects.chargeCircle`, já usados por Blaster/
  Chefe/Dourado antes de disparar.
- **FSM**: candidata natural a usar `createStateMachine`/`ENEMY_STATES` de
  `src/enemies/state-machine.js` desde o início (Blaster/Tank já migraram, é o padrão atual pra
  inimigo novo — ver `PROGRESSO_POS_.70.md`).

---

## 4. Perguntas em aberto (não decidir sozinho, confirmar com o usuário antes de implementar)

Como pede o `TEMPLATE_INIMIGOS.md` do projeto ("antes de criar ou reconfigurar QUALQUER
inimigo, percorra o template e pergunte item por item") — este documento é só o rascunho de
conceito, a ficha completa do template (estados, movimento, disparo, reação a tiro normal/
carregado, esquadrão, boost/repulsão, spawn/fuga, integração técnica) ainda precisa ser
preenchida em conversa antes de codar. Pontos que já saltam como decisões de design reais:

1. **Ela é um Chefe alternativo ou um encontro à parte?** Substitui o Chefe normal às vezes, ou
   é um "mini-evento" de arena independente do ciclo de perguntas?
2. **A janela `vulnerable` acaba só por tempo, ou também acaba antes se ela tomar dano
   suficiente?** (ex.: se o jogador a esvazia rápido, ela reage voltando ao escudo antes do
   tempo — adicionaria tensão de "não adianta acertar tudo de uma vez, ela se esconde de novo")
3. **As ondas de mini-swarm têm padrão fixo (sempre as mesmas direções) ou variam?** Padrão fixo
   é mais "lê e decora"; variado é mais imprevisível mas puxa mais pro acaso.
4. **Ela ataca o jogador diretamente em algum momento**, ou o único perigo dela é o enxame que
   solta (ela mesma nunca atira)? Puramente "fonte de enxame" é mais diferenciado dos outros 2
   bosses (que atiram ativamente); dar um ataque próprio também na fase `vulnerable` (punição por
   ficar perto demais tentando acertar o núcleo) é outra opção.
5. **Nome/tema visual** — "Colmeia-Mãe" sugere geometria orgânica/hexagonal, diferente do
   dodecaedro anguloso do Chefe e do torus knot do Dourado. Confirmar direção visual antes de
   modelar (`buildXShip`-style function).

---

*Fim do rascunho. Fica pra planejamento futuro — nada implementado ainda.*
