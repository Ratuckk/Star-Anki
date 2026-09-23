# Evento novo — Apagão de Radar

## Documento de planejamento (rascunho inicial, pra discussão futura)

---

## 0. Contexto

### 0.1 Como o radar/minimap funciona hoje

- **100% DOM**, não canvas/SVG: `src/hud-game.js` cria um `<div class="hud-minimap">` com
  elementos filhos reaproveitados via pool (`minimapBlipPool`/`minimapAllyPool`, ambos `Map`).
  Atualizado por `setMinimap(active, data)` (`hud-game.js:1845-1886`).
- **Fonte dos blips**: `combat.getMinimapBlips()` (`combat/index.js:152`) agrega
  `enemies.getMinimapBlips()` (`enemies/index.js:1192-1201`, todo inimigo `!dying`),
  `golden.getMinimapBlips()` (`golden.js:354`) e orbes de chefe (`combat/targets.js:201`).
- **Sem ocultação por distância** — todo inimigo vivo sempre aparece no radar, só a posição é
  clampada geometricamente na borda (`mapRadius = 190`, `game-loop.js:832-844`) se estiver longe
  demais pra caber no raio visual do minimapa. `alert` fica `true` (CSS `.alert`) quando algum
  blip não-dourado está a menos de `alertRadius = 32` do jogador.
- Existe também um sistema PARALELO de indicadores fora-de-tela (`hud.setOffscreenThreats`,
  `game-loop.js:860-917`), que filtra por `MAX_THREAT_DIST = 70` e mostra só as 4 ameaças mais
  próximas — diferente do minimapa, esse é sobre "o que está fora do campo de visão da câmera
  agora", não sobre "o que existe no mundo".
- **Não existe hoje nenhum precedente de "cegar" o radar** — busca completa por
  `radarDisabled`/`blindRadar`/`radarRange` não encontrou nada. Seria mecânica nova, sem
  reaproveitamento direto de um toggle já existente.

### 0.2 Conceito

Evento temporário (mesma categoria de "Tempestade de Detritos", já implementado — ver
`triggerDebrisStorm` em `game-loop.js`) que desliga o minimapa por alguns segundos, forçando o
jogador a depender só da visão direta pra perceber ameaças. Reforçado combinando com um pico
temporário de spawn de Sussurro (que já é intrinsecamente invisível/pulsante — `sussurro.js`),
duplicando o tema "você não está vendo tudo que está lá".

---

## 1. Mecânica proposta

### 1.1 O que "cegar" significa exatamente (3 variações possíveis, a decidir)

- **(a) Apagão total** — minimapa fica completamente vazio/estático (nem o próprio jogador
  aparece) por `RADAR_BLACKOUT_DURATION_S`. Mais dramático, mas remove até a noção de "pra onde
  estou virado" que o próprio marcador do jogador dá.
  Mais simples de implementar (uma flag: `setMinimap(false, ...)` ou similar já teria efeito
  parecido, já existe o parâmetro `active` na função).
- **(b) Apagão parcial (ruído/glitch)** — blips aparecem e desaparecem aleatoriamente, piscando
  com posição levemente errada (jitter) em vez de sumirem de vez — sensação de "sinal
  instável", não "sinal morto". Mais trabalho (precisa de uma camada de ruído sobre os dados
  reais antes de `setMinimap`), mas fica mais interessante visualmente e ainda dá alguma
  informação (picada, não confiável).
- **(c) Apagão seletivo** — o minimapa continua funcionando normalmente pra inimigos "comuns",
  mas fica cego especificamente pra um subconjunto (ex.: só o Sussurro, que já é temático de
  invisibilidade, fica "impossível de radarar" durante o evento — reforça a combinação com mais
  spawn de Sussurro do §0.2 de forma mais cirúrgica, sem afetar a legibilidade do resto do
  combate).

**Nenhuma escolhida ainda** — puxa bastante pro "quero planejar melhor" que motivou este
documento. (b) é provavelmente a mais interessante tematicamente mas também a mais arriscada
(evento não deveria deixar o jogo confuso/frustrante ao ponto de virar "adivinhação").

### 1.2 Onde plugar tecnicamente

Independente da variação escolhida, o ponto de intercepção natural é logo antes da chamada de
`hud.setMinimap(...)` em `game-loop.js` (perto do bloco "RADAR TÁTICO", linhas 832-844) — um
novo `state.radarBlackoutTimer` (por analogia a `state.debrisStormActive`/`debrisStormTimer` já
existentes) controla se/como os dados são transformados antes de chegar no HUD.

### 1.3 Gatilho do evento

Análogo a `triggerDebrisStorm(durationMs)` (`game-loop.js`) — provavelmente por temporizador
aleatório próprio (`radarBlackoutTimer` com intervalo min/max em `main-constants.js`, mesmo
padrão de `DETRITO_SPAWN_INTERVAL_MIN_MS`/`IMA_SPAWN_INTERVAL_MIN_MS`), possivelmente só em
trilho (fora de arena) já que em arena o jogador já tem visão 360° mais natural do espaço ao
redor e o radar importa relativamente menos.

### 1.4 Combinação com Sussurro

Durante o apagão, aumentar temporariamente a chance de spawn de Sussurro
(`SUSSURRO_SPAWN_CHANCE` em `main-constants.js`) — mesmo padrão de outros multiplicadores
temporários de evento já no jogo. Preso à duração do apagão (reverte ao normal quando termina).

---

## 2. Perguntas em aberto

1. **Qual das 3 variações do §1.1** — total, ruído, ou seletivo (só Sussurro)?
2. **Duração e frequência** — quanto tempo dura o apagão, e com que frequência pode acontecer
   numa run (evento raro tipo Dourado, ou mais frequente tipo Tempestade de Detritos)?
3. **Afeta os indicadores fora-de-tela também** (`setOffscreenThreats`) ou só o minimapa
   propriamente dito? Cegar os dois juntos é mais consistente tematicamente, mas mais punitivo —
   o jogador perde tanto "o que está por perto" quanto "o que está vindo de fora do campo de
   visão" ao mesmo tempo.
4. **Efeito visual do apagão em si** — precisa de algum feedback claro de "o radar caiu agora"
   (flash, texto, mudança de cor do minimapa pra estática/cinza) pra não parecer um bug.

---

*Fim do rascunho. Fica pra planejamento futuro — nada implementado ainda.*
