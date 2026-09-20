# Progresso pós-v0.80 — novas documentações a partir daqui

Continuação do [PROGRESSO_POS_.70.md](PROGRESSO_POS_.70.md) (histórico v0.75.0 → v0.84.0, agora
congelado). A partir desta entrega, toda documentação nova entra neste arquivo.

---

## Backlog Pendente (herdado da v0.84.0)

Itens discutidos e aprovados pelo usuário mas ainda **não implementados**. Servem de referência
para futuras entregas neste arquivo. O detalhamento completo está em [BACKLOG.md](BACKLOG.md).

### P2 — Médio valor
- [ ] **Perguntas de cenário** — testar aplicação prática, não só definição.

### P3 — Especulativo / requer decisão
- [ ] **Bônus de pontos por abrir explicação em erros**.
- [ ] **Distratores por tag de confusão** — forçar discriminação entre conceitos comumente trocados.

Também pendentes, herdados do Overhaul 4 (fog) e do Overhaul de spawn/despawn (ver
`Docs/Overhaul 4 — Fog como mecânica de g.md` e `Docs/Overhaul do sistema de spawn e desp.md`),
sem prioridade definida — ficam só de referência:
- [ ] Redução de 60% na explosão de morte da Horda em fog denso (pilar 3 do Overhaul 4) —
  pulado por exigir checar 3+ pontos de código por um ganho visual pequeno.
- [ ] Fog reagindo ao nível de dificuldade (§4.5 do Overhaul 4) — bônus opcional.
- [ ] Ideia 4 do overhaul de spawn — orientação de aproximação (rotação convergindo no spawn) —
  pulado porque a maioria dos inimigos recalcula orientação por `lookAt` logo depois do bloco de
  spawn no mesmo frame, sobrescrevendo o slerp; precisaria de auditoria caso a caso por tipo.

---

## Histórico de Entregas pós-v0.84.0

### Cambalhota em arco de verdade (all-range) + fim do teleporte no deslize lateral — v0.84.1

Pedido do usuário: a cambalhota (Baixo+Repulsor no all-range) devia ficar mais fiel ao U-turn do
Star Fox 64 — "a nave faz uma volta pra trás em arco". Além disso, reportou um "bug de
reposicionamento" ao usar "os mesmos comandos só que pros lados" — depois de eu confirmar por
pergunta que o combo era Repulsor+seta lateral (vs. o Repulsor+Baixo da cambalhota) e simular os
dois cenários frame-a-frame via `window.__starAnki` (stepper determinístico, `rail.js` exposto),
não achei nenhum caminho de código que ligasse Repulsor+lateral a qualquer reposicionamento — o
único lugar do arquivo que de fato fazia um "teleporte" (salto instantâneo de posição, sem
interpolação nenhuma) era `triggerArenaLateralDash` (combo Propulsor+Z/C, o análogo lateral real
da cambalhota). O usuário confirmou depois: "na verdade a nave não devia teleportar" — ou seja, o
próprio salto instantâneo do dash lateral era o problema, não uma combinação de teclas específica.

**Cambalhota** (`rail.js`, `SUMMERSAULT_ARC_PITCH`/`updateSummersault`): antes, o yaw girava 180°
suavemente e um `rotateX` cosmético por cima fazia o MESH parecer girar, mas a trajetória
continuava reta/plana (spiral achatada, não um arco de verdade). Agora `updateSummersault` também
devolve um offset de pitch que segue `sin(π·eased)` — sobe até um pico de 55° na metade da manobra
e volta a 0 no fim — somado ao `arenaPitch` só no cálculo do `forward` usado pra mover a nave e
pra orientar a câmera (o `arenaPitch` de verdade fica congelado e intacto, retomado depois). Isso
faz a nave literalmente subir, fazer a volta por cima e descer de novo já de bico invertido — o
`ship.lookAt(forward)` que já existia acompanha o arco sozinho, então o `rotateX` cosmético foi
removido (senão duplicava a rotação). Verificado via stepper: `forward` termina com yaw exatamente
invertido (fx/fz trocam de sinal) e pitch de volta ao valor original, com ganho real de altitude
no meio do caminho.

**Deslize lateral** (`rail.js`, `ARENA_DASH_DURATION`/`updateLateralDash`): `triggerArenaLateralDash`
não move mais a nave com um `addScaledVector` instantâneo — só trava o eixo (`lastFrame.right` do
instante do trigger, pra guinada em andamento não desviar o dash no meio) e arma um progresso
0→1. `updateLateralDash` aplica por frame só a FATIA de distância correspondente ao delta de um
ease-out quadrático, então a soma ao longo de `ARENA_DASH_DURATION` (0.22s) fecha exatamente em
`ARENA_DASH_DISTANCE` (16u) — sem brigar com o avanço pra frente que também mexe em `arenaPos` no
mesmo `updateArena`. Verificado via stepper: posição desliza suave ao longo de ~13 frames em vez
de saltar num frame só.

**Nota pra próxima vez**: o ambiente de browser automatizado (Claude Browser) throttla o rAF real
de forma muito agressiva (chegou a ficar preso em ~1 FPS entre chamadas), o que torna testes por
tempo real (`wait` + screenshot) não-confiáveis pra validar timing de animação. `window.__starAnki`
expõe `rail`/`state`/`step(frames, dtMs)` — usar o stepper determinístico (`setManualStepping(true)`
+ `step(n, dtMs)`) junto de `KeyboardEvent` sintético via `window.dispatchEvent` pra simular
hold/tap de tecla é MUITO mais confiável pra reproduzir combos de input frame-exato do que
`computer` (screenshot/key) do browser tool.

---

### Overhaul visual do tiro básico do jogador (núcleo + halo) — v0.85.0

Pedido do usuário: 3 ideias de overhaul visual pro tiro básico (`combat/projectiles.js`, cone
sólido único `0x3ea6ff`/`MeshBasicMaterial`, sem trilha/brilho além do muzzle flash no disparo).
Ideias dadas: (1) rastro/estria de movimento, (2) brilho escalando com upgrade de
`projectileCount`, (3) núcleo+halo (2 camadas, mesma técnica outer/inner additive-blending do
laser do Chefe/Dourado). **Escolhida: 3**, com pedido extra de "+20% maior".

Cada tiro normal (`fire()`/`fireSingle()`) virou um `THREE.Group` com 2 meshes (halo translúcido
0x3ea6ff por fora + núcleo quase-branco 0xeaffff por dentro, ambos `AdditiveBlending`/
`depthWrite: false`) em vez de 1 `Mesh` só, construído por `buildPlayerShotMesh()`. Constantes
novas (`PLAYER_SHOT_SIZE_MULT=1.2`, `_HALO_RADIUS/_LENGTH/_COLOR/_OPACITY`,
`_CORE_RADIUS/_LENGTH/_COLOR/_OPACITY`) ficam logo acima, tamanho geral derivado do cone antigo
(0.21/1.5) × 1.2. Só o tiro NORMAL mudou — teleguiado/carga máxima (`homingProjectileGeometry`)
não foram tocados, mantêm a identidade visual verde/azul própria deles.

Nenhum outro código precisou mudar: todo lugar que já tratava a instância como objeto único
(`.position`, `.quaternion.setFromUnitVectors` no steering/movimento, `.scale.setScalar()` no
`visualScale` de upgrade, `scene.remove()`) continua funcionando sem alteração — `THREE.Group`
herda tudo isso de `Object3D` igual `Mesh`. Verificado ao vivo via `window.__starAnki` (disparo
manual com `combat.tryFire(origin, dir)` + inspeção do Group na cena): halo
radius=0.252/height=1.8 (=0.21/1.5 × 1.2, confirma o +20%), núcleo radius=0.126/height=1.53,
cores/opacidades/blending corretos, sem erros de console. Screenshot confirmou o brilho ciano
suave visível perto da nave (em vez do cone sólido flat de antes).

**Nota**: `preview_start "static"` (porta 8420) estava sendo usada por outra sessão concorrente
neste mesmo diretório — tive que aguardar ela liberar a porta (`preview_list` mostrando "ended")
antes de conseguir subir meu próprio server pra testar. Concorrência de sessão neste mesmo
working directory também significa que `git status`/`git diff` podem pegar mudanças NÃO-COMMITADAS
de outra sessão no meio do trabalho (aconteceu aqui: `rail.js` tinha uma reescrita da cambalhota
em andamento, não-relacionada) — sempre revisar `git diff --stat` arquivo por arquivo antes de
`git add`, nunca usar `-A`/`.` cego quando há sinal de trabalho concorrente.

---

### Cambalhota all-range: de "arco de trajetória" pra loop cosmético fiel ao original — v0.85.1

Retrabalho da entrega anterior (v0.84.1, cambalhota). O usuário testou e reportou "basicamente não
mudou nada" — a abordagem de v0.84.1 (arquear o PITCH usado no cálculo do `forward`, fazendo a
TRAJETÓRIA subir/descer) era sutil demais pra ler como "animação"/cutscene. O usuário esclareceu
que queria uma mini-cutscene de verdade, "assim como no jogo original", e apontou o link do
decompilado `HarbourMasters/Starship` de novo como referência.

Fui conferir o código-fonte de verdade (`src/engine/fox_play.c` do decomp, via `gh api
repos/HarbourMasters/Starship/contents/...`) — `Player_PerformLoop` (chamado quando
`player->somersault` está ativo) e `Camera_UpdateArwing360`. Descoberta importante: o jogo
original **NÃO** arqueia a trajetória de vôo durante a cambalhota. O que ele faz de verdade:
1. `player->aerobaticPitch` sobe suavemente de 0 a 360° ao longo da manobra — um `rotateX`
   **cosmético** no MODELO da nave, totalmente dissociado da direção real de vôo (a matriz de
   movimento sempre soma um `+180°` constante de yaw, presente também no vôo normal — não é a
   guinada da manobra).
2. `pos.y += 2.0f` por frame, só enquanto `aerobaticPitch < 180°` (metade da manobra) — uma subida
   linear simples, não uma curva de arco.
3. `Camera_UpdateArwing360`: `if (player->somersault) sp74.z += 500.0f` — a câmera some pra bem
   mais longe da nave durante a manobra (zoom-out), dando espaço/tempo pra ver o loop inteiro
   como se fosse uma cutscene, sem a câmera "colada" na nave acompanhando o giro (o que ficaria
   nauseante).

Reescrevi `updateSummersault`/`updateArena` (`rail.js`) nessa linha: `arenaYaw` continua girando
180° suave (é o que de fato reposiciona a nave nesse jogo — mantido, diferente do original, por
já ser a mecânica estabelecida aqui) só que agora em PARALELO a isso, `updateSummersault` devolve
um ângulo de loop cosmético `eased * 2π` aplicado via `ship.rotateX(summersaultSpin)` (mesmo
padrão do `updateFullSpin` do giro Z/C, só que no eixo de pitch em vez de roll) — o vetor
`forward`/direção de vôo real NÃO usa mais esse ângulo (removido o offset de pitch da v0.84.1).
Adicionado `SUMMERSAULT_CLIMB_SPEED` (10 u/s, só na primeira metade — `arenaPos.y +=` direto,
igual ao `pos.y += 2`/frame original) e `SUMMERSAULT_CAM_PULLBACK` (16u somado ao `CAM_BEHIND` só
durante a manobra) — o lerp de câmera que já existia (`CAM_LAG_RATE`) suaviza sozinho a ida e a
volta do zoom-out, sem precisar de easing manual extra.

Verificado via stepper determinístico (`window.__starAnki`, ver nota da entrega anterior):
localizei o mesh da nave na cena (`scene.traverse`/`getObjectByProperty('uuid', ...)`) e
acompanhei `ship.rotation` (spin contínuo confirmado), `rail.getPlayerPosition().y` (sobe de 3.06
a ~6.3 e estabiliza, batendo com a janela de subida da primeira metade) e
`camera.position.distanceTo(pos)` (sobe de ~10.4 pra ~24.3 no pico da manobra e já começa a
descer no frame seguinte ao fim — zoom-out e retorno confirmados). `forward.y` ficou fixo (~0.03)
o tempo todo, confirmando que a direção de vôo real não arqueia mais — só o corpo da nave.

---

### QoL — mira do carregado por tamanho de alvo + fim do homing "fantasma" sem mira

Início da implementação do `Docs/# QoL — Documento de Melhorias.md` (12 itens, proposta aguardando
aprovação item a item — usuário aprovou começar pelos itens 1–3, ver pergunta feita antes de mexer
em código). Descobri que o **item 1** (cutscene do chefe vermelho duplicada no Arcade) **já estava
corrigido** de uma entrega anterior — `bossNoDeckScoreCheckpoint` já é setado no topo de
`enterBossBuildup()` (`flow-boss.js:63`), antes de `finishBossHunt()`; confirmado também em
`PROGRESSO_POS_.70.md` linha ~866. Nenhuma mudança necessária ali.

**Item 2 — mira do tiro carregado escala com o tamanho do alvo.** `enemies/index.js` ganhou
`getLockableRadius(entity)` (= `entity.radius ?? hitRadiusFor(entity)`) na API pública — cobre o
caso do chefe, que não tinha `.radius` próprio e caía num fallback hardcoded de `5` em
`lockon.js` (removido `BIG_TARGET_FALLBACK_RADIUS`). `getLockedEnemySnapshots()` agora devolve
`sizeHint` (o raio real do alvo) em cada snapshot, usado tanto pro raio do anel de multi-lock
quanto — via `game-loop.js` → `hud.setLockedEnemyMarkers` — pra escalar o marcador em si:
`hud-game.js` mapeia `sizeHint` (1.3u a 7.7u, ímã→chefe) pra um tamanho em px (22–62px, clamp) via
`--marker-size`, custom property lida pelo CSS do `.enemy-lock-marker`. **Achado**: o CSS desse
marcador não mora em `hud-styles.js` (que o documento apontava) — vive em `index.html` (bloco de
`<style>` inline perto da linha 930), então foi lá que a var `--marker-size` entrou.

**Item 3 — tiro carregado não persegue mais alvo aleatório fora da mira.** `fireHomingShot` agora
recebe `direction` (a mira atual) além de origin/maxTargets/isMaxCharge — todos os 3 call sites
atualizados (`game-loop.js`, `debug-actions.js` no botão "Testar tiro teleguiado", `combat/index.js`
como pass-through). Sem alvo travado, o fallback antigo ("N inimigos mais próximos no range",
mesmo fora da mira) foi trocado por `lockon.getEnemiesInAimCone(origin, direction, maxCount)` (nova
função, reaproveita o cone de `isAimingAtEnemy`) — só persegue quem está DENTRO do cone da mira.
Se ninguém estiver no cone, dispara um tiro reto (mesmo visual do teleguiado — cone verde/azul —
mas sem `homingTarget`, `velocity` fixa na direção mirada); esse projétil já se autodestrói pelo
teto de `PROJECTILE_MAX_RANGE` como qualquer outro, sem precisar de lógica nova de limpeza.

**Validação**: sem servidor de preview visível (pane escondida ⇒ `requestAnimationFrame` sofre
throttle do browser, `fireHeldMs` não avançava em tempo real), troquei pra `window.__starAnki.step()`
(stepper determinístico) + eventos de teclado sintéticos, e pra testar o pipeline de lock-on em si
chamei `combat.sweepLockOn`/`getLockedEnemySnapshots`/`getLockableRadius`/`fireHomingShot`
diretamente via `javascript_tool` (mais confiável que tentar mirar de verdade no inimigo certo às
cegas). Confirmado: `getLockableRadius` devolve o raio certo por `kind` (ímã 1.43, blaster 2.28,
horda 6.5, chefe 7.7, dourado usa o `.radius` próprio de 2.42 sem cair no fallback); `fireHomingShot`
com trava ativa continua consumindo a trava normalmente (regressão limpa); sem trava e mirando reto
num inimigo, persegue-o (path do cone); sem trava e mirando pro nada (longe de qualquer inimigo),
dispara reto (`fired: 1`, sem `homingTarget`). `node --check` limpo em todos os arquivos tocados,
`node src/selftest.mjs` OK. Itens 4–11 do documento ainda não implementados (ficam pro próximo
pedido do usuário).

---

### Investigação e fix do bug do escudo do chefe (pré-requisito do Swirl Blast, `Docs/# Swirl Blast — Design & Plano de I.md` §3.2.5)

Antes de começar o Swirl Blast, o usuário pediu pra investigar primeiro por que o escudo
refletor azul do chefe (`boss.js`, `updateBossMovement`) parecia "não ativar de forma
consistente" — o próprio doc do Swirl já registrava 4 hipóteses sem confirmar nenhuma.

**Método**: em vez de inspeção visual, simulei a máquina de estados do escudo via
`window.__starAnki.step()` (stepper determinístico, sem depender de `requestAnimationFrame` —
que sofre throttle forte com a pane do browser escondida) chamando `combat.spawnBossEnemy`
direto e cravando `enemy.hp` em instantes conhecidos pra forçar transições de fase em momentos
controlados. Cobri: (1) ciclo completo isolado sem dano (ativa aos 7s, desativa aos 10s, reinicia
certinho); (2) duas transições de fase forçadas em pontos diferentes do cooldown — o timer
congela durante a transição (1.2s) e retoma exatamente de onde parou, sem perder sincronia.

**Resultado**: nenhuma das 4 hipóteses do doc é um bug de código — a máquina de estados em si
está correta. **Causa real**: `BOSS_BASE_HP = 33` (`main-constants.js`) é baixo o bastante pra
o chefe frequentemente morrer em **menos de 7s** de combate — antes do primeiro cooldown do
escudo sequer terminar. Não é RNG nem timer quebrado: é matematicamente esperado que o escudo
não apareça sempre que a luta durar menos que ~7s de tempo "vivo" (descontando transições).

**Fix aplicado** (`boss.js`): nova constante `BOSS_SHIELD_FIRST_COOLDOWN_S = 3.0`, usada **só**
no valor inicial de `shieldCooldown` em `spawnBossEnemy` — a partir da primeira desativação, o
reset volta a usar `BOSS_SHIELD_COOLDOWN_S` (7s) normalmente, sem tocar no resto da lógica.
Garante que o jogador veja o escudo pelo menos uma vez mesmo em kills rápidos, sem acelerar o
ritmo da luta inteira. Validado com o mesmo stepper: `shieldCooldown` nasce em `3.00`, ativa
perto dos 3s, e o cooldown seguinte volta a ~7s.

**Nota de metodologia**: pane do browser escondida throttla `requestAnimationFrame` o bastante
pra `fireHeldMs`/timers de gameplay não avançarem em tempo real entre chamadas de ferramenta —
qualquer teste que dependa de tempo decorrido precisa passar por `window.__starAnki.step(n, dtMs)`
(stepper manual já exposto em `mount-game.js`) em vez de segurar tecla e esperar.

---

### Swirl Blast — Etapa 1 (mecânica sem visual, ainda sem projétil de verdade)

Início da implementação de `Docs/# Swirl Blast — Design & Plano de I.md` (habilidade base — tiro
perfurante liberado ao soltar carga máxima durante o giro de invencibilidade). Usuário escolheu ir
etapa por etapa (§8 do doc), com checkpoint entre elas.

- `main-constants.js`: nova `SWIRL_COOLDOWN_MS = 12000` (as outras constantes de timing do Swirl —
  slow-mo/FOV — entram só na etapa 6, quando forem usadas).
- `player.js`: novo estado `swirlCooldownMs`; `getSwirlCooldownMs`/`getSwirlCooldownTotalMs`/
  `isSwirlReady`/`startSwirlCooldown`; decrementado em `update(dt)`; zerado em `resetCards` e em
  `debugMaxBuffs` (habilidade sempre pronta no debug).
- `rail.js`: `isFullSpinActive: () => fullSpinT < 1` exposta no retorno de `createRailController`.
- `game-loop.js`: no branch de release do fogo (`else` de `inputState.firing`, onde hoje dispara
  `combat.fireHomingShot`), detecção `canSwirl = isMaxCharge && rail.isFullSpinActive() &&
  player.isSwirlReady()` com só um `console.log('SWIRL BLAST!')` — o disparo de verdade continua
  sendo o homing normal (isso muda na etapa 2). Zero mudança de comportamento pro jogador ainda.

**Validação**: testei as 4 combinações de estado (com/sem giro × com/sem carga máx, mais
cooldown ativo) via `window.__starAnki.step()`, forçando `state.phase = 'combat'` primeiro —
achado de metodologia: sem isso, `cutscenes.updateLaunchCutscene()` retorna cedo no topo do
`runFrame` e a lógica de disparo nem roda (nenhuma combinação "dispara", mas por estar preso na
cutscene de decolagem, não por bug na condição). Depois de forçar a fase, resultado bateu 100%
com o esperado: giro+carga-máx+pronto loga `SWIRL BLAST!`; qualquer uma das 3 condições faltando,
não loga. Único cuidado extra: `triggerFullSpin` deixa `fullSpinT` "ativo" por ~0.45s (27 frames)
depois de disparado — testar o caso "sem giro" logo em seguida de um teste "com giro" no mesmo
frame dá falso positivo (giro anterior ainda não tinha terminado a animação); precisa deixar a
animação assentar (ou usar personagens/steps separados) antes de testar a combinação sem giro.

---

### Swirl Blast — Etapa 2 (projétil placeholder + mecânica de perfuração)

- `combat/projectiles.js`: novo bloco de constantes do Swirl (`SWIRL_BLAST_SPEED=520`,
  `DAMAGE=6`, `LIFETIME=8`, `MAX_RANGE=700`) + mesh placeholder (`BoxGeometry` azul sólido —
  o vórtice giratório de verdade é etapa 4). Nova `fireSwirlBlast(origin, direction)`: cria o
  projétil com `isPiercing: true` e `piercedTargets: new Set()`. No `update()`, os branches de
  steer (`PLAYER_PROJECTILE_STEER_RATE`) e deflexão do Ímã agora excluem `isPiercing` (R1: reto
  puro, sem steer/homing/magnet) — sem isso, o Swirl herdava o "puxão" de mira do tiro normal e
  a curva do campo do Ímã. Novo branch dedicado no loop de colisão: chama
  `enemies.resolvePiercingProjectileHits`, itera TODOS os hits (não só o primeiro), soma
  kills/pontos, e só remove o projétil por alcance/vida — nunca por ter acertado algo.
- `enemies/index.js`: nova `resolvePiercingProjectileHits(prevPos, currPos, meta)` — mesma
  lógica de morte de `resolveProjectileHit` (telemetria, sons por kind, split da Horda, corte do
  Verme, wipe de esquadrão), mas iterando **todos** os inimigos vivos não presentes em
  `piercedTargets` e devolvendo um array de hits em vez de parar no primeiro. Etapa 2 = só o
  caso genérico (regras especiais de detrito/chefe/escudo/dourado/fragata entram na etapa 3).
- `combat/index.js` / `game-loop.js`: `fireSwirlBlast` exposto e chamado de verdade no release
  do fogo quando `canSwirl` (troca o `console.log` da etapa 1); `player.startSwirlCooldown()`
  chamado no disparo. Fora do combo completo, cai no `fireHomingShot` normal como antes.

**Achado de teste importante — blasters "teleportam" sob a própria IA.** A primeira tentativa de
validar "3-4 blasters alinhados, todos tomam 6" (critério do próprio doc) falhou: só o mais
próximo morria. Depurei chamando `resolvePiercingProjectileHits` direto (sem `step()`) com um
segmento cobrindo 2 alvos — funcionou perfeitamente (os dois tomaram dano). Rodando pelo loop
real (`sa.step()` múltiplas vezes) com log de posição por frame, os blasters não travados
"saltavam" 16-51 unidades num ÚNICO frame — a FSM deles recalcula posição ABSOLUTA (órbita em
volta do jogador) a cada frame, sobrescrevendo qualquer `mesh.position` setado manualmente assim
que o primeiro `update()` deles roda. Não é bug do Swirl: é como o `blaster.js` já funciona.
Reposicionar um inimigo tipo blaster e esperar que ele fique parado por mais de 1 frame não é um
teste válido. Corrigi o teste espaçando os 4 blasters em só 1.8u (dentro do alcance de viagem de
UM frame do Swirl, ~8.6u a 520u/s) — os 4 morreram no mesmo frame, todos com "Recebeu 6 de dano
perfurante" no log de combate. Confirmado também que o dispatch real do `game-loop.js` cria o
Swirl só quando as 3 condições batem, e cai no homing normal caso contrário.

**Nota pra próximos testes de mecânica de projétil**: pra alinhar inimigos de propósito num
teste determinístico, ou (a) usar um obstáculo estático (detrito) em vez de blaster/mini-swarm/
etc. (que têm FSM própria recalculando posição a cada frame), ou (b) manter tudo dentro do
alcance de viagem de UM frame só, ou (c) chamar a função de resolução de colisão diretamente
(sem `step()`) pra isolar a mecânica da IA de movimento.

---

### Swirl Blast — Etapa 3 (regras especiais: detrito, chefe/escudo, dourado, fragata)

- `enemies/index.js` (`resolvePiercingProjectileHits`): 3 branches novos ANTES do dano genérico
  da etapa 2 — (1) **detrito**: kill direto ignorando HP e o `damage` numérico (§3.2.1), Swirl
  continua voando (`stopProjectile` nem existe pra esse branch); (2) **chefe com escudo ativo**:
  destrói o escudo (`isShieldActive=false`, esconde `shieldMesh`) em vez de refletir, aplica os 6
  de dano por cima, e marca `stopProjectile:true`; (3) **chefe/fragata em geral**: sempre param o
  Swirl — a "placa" da fragata nem é checada (`isFragataShielded` não é chamado aqui de propósito,
  diferente de `resolveProjectileHit`), o Swirl ignora blindagem de ângulo por completo.
- `enemies/golden.js`: nova `resolvePiercingHit(prevPos, currPos, damage, piercedTargets)` —
  mesma lógica de `resolveHit` (dano, som/explosão de morte, dash evasivo reativo em hit não-
  letal), mas com Set de perfuração PRÓPRIO (não compartilha o dos inimigos comuns) e sempre
  `stopProjectile:true` (dourado não tem conceito de escudo destrutível). Chamada de dentro de
  `resolvePiercingProjectileHits` (dourado vive em array separado, não em `enemies`).
- `combat/projectiles.js`: `fireSwirlBlast` ganhou `goldenPiercedTargets` (Set separado, passado
  junto no `meta` de cada chamada); o branch `isPiercing` do `update()` agora separa hits de
  dourado (não entram no `hitsLog` — mesma exclusão de propósito do path não-perfurante, viram os
  campos `goldenSpecialHit`/`goldenHitWorldPos`) e remove o projétil quando QUALQUER hit do frame
  trouxer `stopProjectile:true`. Chamada opcional a `effects.swirlBlastExplosion` (ainda não
  existe — etapa 5) já no lugar certo, sem precisar mexer aqui de novo quando a função existir.

**Validação** (stepper determinístico, `rail.setAdvancing(false)` + `rail.enterArena()` pro
fragata/dourado): detrito titânico (65 HP) morre num hit e o Swirl **continua vivo** depois;
chefe com escudo ativo perde o escudo (`isShieldActive`/`shieldMesh.visible` → false) E leva os 6
de dano, projétil some; chefe sem escudo leva 6 de dano, projétil some; dourado leva 6 de dano,
projétil some; fragata (6 HP) morre com 6 de dano ignorando a placa, projétil some. Regressão da
etapa 2 (4 blasters alinhados, nenhum para o Swirl) continua passando. Sem erros de console (só
o service worker do harness de preview, já visto em entregas anteriores, sem relação com o jogo).

Faltam etapas 4 (visual do vórtice), 5 (flash/afterimage/explosão de verdade), 6 (slow-mo/FOV/
speedlines) e 7 (carta "Vínculo: Swirl Blast" + Sound Cue).

---

### Swirl Blast — Etapa 4 (visual do vórtice de verdade)

Usuário pediu pra fechar todas as etapas restantes antes de ir pro próximo documento — sem
checkpoint de aprovação entre elas a partir daqui, só validação técnica normal.

- `combat/projectiles.js`: placeholder do cubo saiu, entrou o Group de 4 camadas do §4.1 —
  `buildSwirlBlastMesh()` monta core (`ConeGeometry` 0.6×3.6, mesma silhueta do homing) + 3 anéis
  de vórtice (`TorusGeometry`, posições Z `[-1.1, 0, 1.1]`) + aura (`SphereGeometry` 1.1,
  opacidade baixa) + glow na ponta dianteira (esfera pequena e brilhante em Z = metade do
  comprimento do core). Todas as constantes visuais do §7 (`SWIRL_SPIN_RATE`, `SWIRL_CORE_*`,
  `SWIRL_RING_*`, `SWIRL_AURA_RADIUS`, `SWIRL_TIP_GLOW_RADIUS`) adicionadas no topo do arquivo.
- **Achado técnico sobre o giro**: `mesh.rotation.z += SWIRL_SPIN_RATE * dt` direto NÃO funciona
  aqui — o `quaternion` do projétil é recalculado do ZERO todo frame só com a direção de voo
  (`setFromUnitVectors`), então um incremento direto de rotação seria sobrescrito no frame
  seguinte. Solução: acumular o ângulo total num campo próprio (`projectile.spinAngle`) e
  reaplicar via `mesh.rotateZ(spinAngle)` (rotação LOCAL relativa, não sobrescreve o quaternion)
  depois que a direção já foi setada — assim o giro cumulativo fica visível corretamente a cada
  frame em cima da direção sempre correta.
- Validado visualmente: reposicionando o mesh manualmente perto da câmera via
  `window.__starAnki`, dá pra ver claramente os anéis concêntricos brilhantes se espalhando com
  um núcleo branco na ponta — leitura de "vórtice"/"portal" batendo com a intenção do design.
  Regressão da mecânica de perfuração (4 blasters alinhados) continua passando com o novo mesh.

---

### Swirl Blast — Etapa 5 (flash de disparo, trilha de afterimages, explosão de impacto)

- `effects.js`: 3 funções novas — `swirlBlastFlash(position, direction)` reaproveita as MESMAS
  geometrias do muzzle flash do player (core + ring), empilhadas no array genérico
  `muzzleFlashes` (cujo loop de update já interpola duração/escala/opacidade por instância) —
  `growth` negativo nos 2 "anéis de sucção" faz eles ENCOLHEREM em vez de crescer, dando o efeito
  de "sugou o ar antes de disparar" sem precisar de um sistema de animação novo.
  `swirlAfterimage(position, quaternion)` segue o mesmo molde de `homingAfterimage` (array
  `swirlAfterimages` novo, só pra não misturar timing/escala com o homing). `swirlBlastExplosion`
  é só composição dos primitivos que já existem (`explosion` + `shockwave`, mesmo princípio de
  `maxChargeReady`) — não precisou de sistema visual dedicado.
- `combat/projectiles.js`: `fireSwirlBlast` chama `effects.swirlBlastFlash` no disparo; o branch
  `isPiercing` do `update()` spawna um afterimage a cada `SWIRL_AFTERIMAGE_INTERVAL` (0.03s); a
  chamada a `effects.swirlBlastExplosion` no `stopProjectile` (já cabeada na etapa 3) agora
  produz efeito de verdade em vez de ser um no-op.
- Todas as chamadas de effects usam `effects && effects.xxx` como guarda — nenhuma trava se um
  dia `effects` vier `null` (mesmo padrão do resto do arquivo).

**Validação**: disparo contra um chefe posicionado manualmente — chefe leva 6 de dano, projétil
some (explosão disparou sem erro). Disparo isolado perto da câmera confirmou visualmente o flash
(anel azul grande expandindo + núcleo brilhante) e a trilha de afterimages atrás do projétil em
voo. Regressão da perfuração (4 blasters) continua passando. Sem erros de console (só o service
worker do harness).

---

### Swirl Blast — Etapa 6 (câmera lenta, FOV bump, speedlines) — todas as etapas concluídas

Usuário confirmou seguir sem pausa até fechar o documento inteiro (chegou a pedir isso
explicitamente: "vamos finalizar todas etapas primeiro antes de ir para o próximo documento").

- `main-constants.js`: `SWIRL_SLOW_MO_MS=450`, `SWIRL_SLOW_MO_FACTOR=0.15`,
  `SWIRL_FOV_BUMP_MS=300`, `SWIRL_FOV_TARGET=95`.
- `mount-game.js`: `state.swirlSlowMoMs`/`state.swirlFovBumpMs` inicializados em 0.
- `game-loop.js`:
  - Topo do `runFrame`: `dt` passa a levar em conta o slow-mo do Swirl por cima do `baseDt` (que
    já considerava o slowMo de debug) — os dois se multiplicam se ativos ao mesmo tempo, aceitável
    (caso de teste raro). Os timers (`swirlSlowMoMs`/`swirlFovBumpMs`) decrementam com `rawDt`
    (tempo REAL, não o escalado) — senão a cutscene de 450ms levaria 3s de relógio de parede pra
    terminar, já que o próprio `dt` que ela escala é o que a decrementaria.
  - Logo depois de `rail.update()`: enquanto `swirlFovBumpMs > 0`, sobrescreve `camera.fov` com
    uma curva própria (sobe linear na primeira metade da janela, ease-out quadrático na segunda) e
    aplica um "punch" de câmera (`translateZ`/`rotateZ` pequenos, proporcionais à mesma fração da
    curva). O lerp de FOV do boost em `rail.js` continua rodando por baixo o tempo todo — quando o
    timer do Swirl zera, simplesmente paro de sobrescrever e o boost retoma o controle sozinho,
    sem precisar de um "handoff" explícito (confirmado: FOV converge suave de volta a 70, sem pop).
  - Speedlines: em vez de uma chamada avulsa no disparo + outra pra "desligar depois" (como o
    doc sugeria), incorporei `swirlSlowMoMs > 0` na MESMA linha que já liga/desliga as speedlines
    pelo boost (`hud.setMotionLines(boostOn || swirlMotionActive, swirlMotionActive ? 1.0 : null)`)
    — assim ela reage sozinha a cada frame, sem risco do call de boost (que roda sempre, todo
    frame) sobrescrever o `active:true` do Swirl no mesmo frame em que ele foi setado (bug pego
    justamente testando: a primeira versão com a chamada avulsa ficava "true" por 1 frame e
    "false" no seguinte, porque a linha do boost já rodava depois e não sabia do Swirl).
- `hud-game.js`/`hud-styles.js`: `setMotionLines(active, intensity=null)` — quando passado, seta
  `--intensity` via custom property; CSS mudou de `opacity: 1` fixo pra `opacity: var(--intensity, 1)`
  (default preserva o comportamento antigo pra quem chama sem intensidade).

**Validação** via stepper determinístico: disparo real (giro+carga-máx+pronto) seta
`swirlSlowMoMs=450`/`swirlFovBumpMs=300` e ativa as speedlines; aos ~167ms o FOV está perto do
pico (94.7 de 95); aos ~333ms o bump já zerou e o FOV está convergindo suave de volta (75.0,
controlado pelo lerp do boost); aos ~500ms tudo zerou e as speedlines desligaram (jogador não
estava boostando). Regressão da perfuração continua passando.

---

### Swirl Blast — Etapa 7 (carta "Vínculo: Swirl Blast" + Sound Cue) — documento fechado

- `roguelike.js`: carta `swirl-blast-cooldown` (categoria ofensivo, ícone 🌀) — texto e efeito
  exatamente como no §5 do doc.
- `player.js`: novo `swirlCooldownMult` (começa em 1); `applyCard` multiplica por 0.85 com piso em
  0.5 (cooldown mínimo de 6s); `getSwirlCooldownTotalMs`/`startSwirlCooldown` agora usam
  `SWIRL_COOLDOWN_MS * swirlCooldownMult` em vez do valor fixo; `resetCards` zera o multiplicador
  de volta pra 1; `debugMaxBuffs` põe no piso (0.5) e registra na bandeja de cartas do debug, igual
  o resto das cartas "sem cap real". **Sem exclusão** em `buildCardExcludeSet` — confirmado que a
  carta nunca fica indisponível, é stackável à vontade (pedido explícito do doc).
- `audio-cues.js`: novo `PLAYER_SOUND_CUES.swirl_blast_fire` (1.4s, cooldown 500ms) — parâmetros
  exatos do §4.7. `combat/projectiles.js`: `fireSwirlBlast` dispara o cue junto com o flash visual.

**Validação**: `getSwirlCooldownTotalMs()` bate exatamente com a tabela de testes do próprio doc
(§10.4) — 12000 → 10200 (1 aplicação) → 6000 (piso, 10 aplicações). `startSwirlCooldown()` usa o
valor multiplicado de verdade. Disparo real sem erro (som incluído). Regressão da perfuração
continua passando. `node src/selftest.mjs` reporta 79 Sound Cues (era 78), sem quebrar nada — o
teste valida só um piso mínimo (`>= 40`), não uma contagem exata.

**Resumo — Swirl Blast 100% implementado** (etapas 1-7 do `Docs/# Swirl Blast — Design & Plano de
I.md`): habilidade base disponível desde o início da partida, cooldown de 12s (reduzível até 6s
pela carta), dispara ao soltar carga máxima durante o giro de invencibilidade, perfura inimigos
comuns aplicando 6 de dano fixo, mata detritos instantaneamente sem parar, para e explode contra
chefe (destruindo o escudo se ativo)/dourado/fragata, com vórtice giratório de verdade, flash de
disparo próprio, trilha de afterimages, cutscene de câmera lenta com FOV bump e speedlines, e som
dedicado. Pontos de ajuste fino deixados para playtest real (não códigos pendentes, só tuning de
valores): força do FOV/slow-mo (§11.3/§11.4), se a aura do projétil fica "gorda" perto de alvos
pequenos (§11.5), e se perfurar o escudo do chefe é forte demais sem nenhum balanceamento (§11.1)
— usuário já orientou usar os padrões do doc e ajustar depois com playtest real.

---

### Bullet-time no Card Choice (Arcade) — implementado

Segundo item do `Checklist de overhauls pendentes.md` a ganhar código nesta sessão (depois do
Swirl Blast) — escolhido por ser o único dos 5 docs restantes marcado como "especificação
completa" (os outros 4 são rascunhos com perguntas de design em aberto). 3 perguntas do §7
respondidas pelo usuário, todas com a recomendação do próprio doc: `ARCADE_CARD_CHOICE_TIME_SCALE
= 0.18`, input normal do jogador durante o bullet-time, toggle exposto em Configurações **e** no
painel de pausa.

- `settings.js`: `arcadeCardChoicePauses: true` (default = comportamento atual, pausa total).
- `main-constants.js`: `ARCADE_CARD_CHOICE_TIME_SCALE = 0.18`.
- `game-loop.js`:
  - `inArcadeCardChoiceBulletTime` calculado no topo do `runFrame` (fase `cardChoice` + arcade +
    setting desligada) — usado tanto pro cálculo do `dt` quanto pro early-return logo abaixo.
  - **Precedência entre as 3 fontes de câmera lenta agora explícita** (debug slowMo > bullet-time
    do card choice > Swirl Blast > normal — só uma decide o `dt` por frame, nunca compõem, exceto
    debug+Swirl que já compunha antes). Reescrevi o comentário antigo do Swirl que dizia
    "multiplica em cima do debug" porque não era mais verdade com o terceiro ramo — na prática
    bullet-time e Swirl nunca competem de verdade (cardChoice pausa o combate, Swirl não tem como
    estar "no ar" nesse phase).
  - Early-return de `cardChoice` (linha que também cobria `bossQuestionPause`/`questionPause`)
    virou dois blocos: as duas pausas de pergunta continuam incondicionais, `cardChoice` agora só
    pausa se `!inArcadeCardChoiceBulletTime`.
- `hud-settings.js`/`hud-pause.js`: novo `buildArcadeSection()` — mesmo padrão de reaproveitamento
  de `buildFogSection()` (builder exportado, uma linha em cada lugar que já monta a tela de
  Configurações e a sub-tela "Opções" do painel de pausa). Descobri que `.settings-hint` (classe
  usada por outra seção pra texto explicativo abaixo do toggle) nunca tinha CSS de verdade em
  lugar nenhum — adicionado em `index.html` junto (texto pequeno, cor apagada, mesmo princípio do
  `.debug-hint` que já existia).
- **Auditoria do §5 do doc (lugares que assumem `cardChoice` = pausado)**: verifiquei o bloco de
  dano ao jogador (`game-loop.js`, "DANO AO JOGADOR") — não tem NENHUM gate de `state.phase`, roda
  igual não importa a fase. `outOfLives` chama `endSector()` → `teardown()` → `hud.unmount()`, que
  JÁ limpa `cardChoiceKeyHandler`/`cardChoiceGpStop` explicitamente (achei o código, não é
  suposição). Ou seja: **o cenário "jogador morre durante a escolha de carta" já funciona
  corretamente de graça**, sem precisar de nenhuma linha nova — não escrevi código defensivo
  especulativo pra um caso que a arquitetura já cobre.

**Validação** via stepper determinístico: com o setting desligado, `state.phase === 'cardChoice'`
e a nave se move (~1.3u em 20 frames) — antes ficava 100% parada; religando o setting, volta a
zero (pausa total preservada, comportamento antigo intacto). Medi a proporção real do `dt`
comparando distância percorrida em bullet-time vs. velocidade normal na mesma janela de frames:
**0.179**, batendo com o `0.18` esperado. Checkbox em Configurações renderiza e persiste
corretamente no `localStorage` (confirmado visualmente + lendo o storage depois de clicar). A
mesma seção no painel de pausa usa a função idêntica — não consegui abrir o painel via simulação
de tecla no stepper (edge-detection de "tecla pressionada" não pegou o evento sintético; provável
peculiaridade do `input.js` com KeyboardEvent disparado via JS em vez de reação real do SO), mas
não há razão pra achar que quebra — é a mesma chamada de função já provada funcionando na tela de
Configurações. Sem erros de console em nenhum teste.

---

### v0.87.0 — QoL itens 4 e 5 (repulsão progressiva sem VFX + faíscas de hit não-letal)

Achado antes de começar: os últimos 5 commits (QoL 1-3, fix do escudo, Swirl Blast completo,
Bullet-time) foram mesclados sem subir `GAME_VERSION` — falha de processo minha. Corrigido num
commit de catch-up pra v0.86.0 antes de iniciar este item; a partir daqui, todo commit relevante
volta a bumpar a versão (pedido explícito do usuário: sempre falar o número da versão).

**Item 4 — Repulsão: remove círculos + vira freio progressivo.** Pergunta feita antes de codar:
o que fazer com o freio de emergência de duplo-toque (`triggerEmergencyBrake`), já que ele também
some junto com os círculos? Usuário escolheu remover de vez (recomendação do próprio doc) — só a
repulsão progressiva cuida de trilho e arena.

- `effects.js`: removidos por completo `reverseBrakeJets`/`spawnReverseBrakeJetParticle`/
  `emergencyBrakeVFX`, o array `reverseBrakeJetsList`, os timers/constantes só usados por eles, e
  a entrada `repulsionActive`/`shipRight` do `update()` — `skipTrail` (efeito NÃO-relacionado,
  só esconde o rastro do motor durante o freio) foi mantido de propósito.
- `player.js`: `repulsionActiveTimer` (contagem regressiva de duração FIXA) virou `repulsionActive`
  (booleano). `activateRepulsion()` só ARMA o estado, não zera mais `boostCharge` na hora.
  `update(dt, repulsionHeld)` ganhou o parâmetro `repulsionHeld` (de `inputState.repulsionHeld`,
  já existia em `input.js` — nunca tinha sido consumido) — dreno de `BOOST_BRAKE_DRAIN_MS` (6s,
  2x a recarga normal) só enquanto `repulsionActive && repulsionHeld`; solta o botão OU zera a
  carga = para na hora, sem resíduo, recarga começa no frame seguinte.
- `game-loop.js`: `player.update(dt)` → `player.update(dt, inputState.repulsionHeld)`; removido o
  branch de duplo-toque (`state.lastRepulsionTapAt`, `triggerEmergencyBrake`, `emergencyBrakeVFX`).
- `rail.js`: removido `triggerEmergencyBrake` e todo o mecanismo de freio de emergência
  (`emergencyBrakeTimer`/`emergencyBrakeCooldownTimer`/`brakeFactor` em `updateArena`) —
  confirmei que o freio progressivo JÁ funciona em arena de graça, via o mesmo `speedMultiplier`
  compartilhado que `ARENA_SPEED * speedMultiplier * ...` já multiplicava (não precisou de nenhum
  código novo pra arena, só remover o que sobrava do freio de emergência).
- `mount-game.js`: removido `state.lastRepulsionTapAt` (dead state depois da remoção acima).

**Validação item 4** via stepper: segurar repulsão por 1s drena `boostCharge` de 1.0 → 0.833
(exatamente `1 - 1000/6000`); soltar para o dreno imediatamente e a barra já começa a subir no
frame seguinte; em arena, segurar repulsão reduz a distância percorrida numa janela fixa de
frames pra ~0.38x da velocidade normal (esperado `REPULSION_SPEED_MULT=0.35`, bate dentro da
margem de um frame de atraso na ativação). Sem nenhum círculo/partícula — as funções nem existem
mais.

**Item 5 — Feedback visual de hit não-letal.** Nova `effects.ricochetSparks(position, normal)`:
leque de 10-14 faíscas (cor `0xffd166`, branca-amarelada), cada uma uma esfera compartilhada
ESTICADA via `scale` não-uniforme + quaternion alinhado à própria velocidade (em vez de partícula
redonda) — decaimento de velocidade exponencial, 0.35s de vida. Chamada em `game-loop.js` no
mesmo loop que já processa `hitsLog` pra flash/hitSpark, só quando `!h.killed && !h.isHoming` —
exclui teleguiado de propósito porque ele já tem explosão de impacto incondicional (mataria ou
não) em `enemies/index.js`, ver comentário no código.

**Bug pego em teste, corrigido antes de commitar**: o primeiro `Edit` que inseriu `ricochetSparks`
logo depois de `ricochetArc` cortou a função errada no meio — as duas últimas linhas de
`ricochetArc` (`hitSpark(from,...)`/`hitSpark(to,...)`) acabaram dentro de `ricochetSparks`,
referenciando variáveis `from`/`to` que não existem nesse escopo. Só apareceu ao rodar de verdade
(`ReferenceError: from is not defined` disparado pelo primeiro tiro não-letal no teste) —
`node --check`/selftest não pegam esse tipo de erro porque a função só quebra quando CHAMADA, não
ao só parsear o arquivo. Reforça o valor de testar no browser antes de dar como pronto.

**Validação item 5**: tanque com 20 HP toma um tiro normal (dano 2), sobrevive, e gera as faíscas
(11 novas, dentro do range 10-14 esperado); o mesmo tanque com 2 HP morre no mesmo tiro e NÃO gera
faísca nova nenhuma — os dois critérios de aceitação do doc bateram exatamente. Descoberta lateral
reaproveitada do trabalho do Swirl Blast: blaster comum não é bom alvo de teste porque a FSM dele
recalcula posição toda hora (teleporta), por isso usei Tank (estacionário) pros dois cenários.

Sem erros de console em nenhum teste (item 4 ou 5).

---

### v0.88.0 — Swirl Blast: escala visual recalibrada (super ataque "invisível")

Bug reportado pelo usuário: o disparo do Swirl Blast era basicamente invisível — as geometrias
originais (etapa 1-7, ver acima) tinham o MESMO tamanho do tiro normal (core 0.6×3.6 vs. halo do
tiro normal 0.46×3.3), o flash reusava `playerMuzzleCoreGeo`/`playerMuzzleRingGeo` (as geometrias
TINY do muzzle flash comum) e o afterimage reusava `sharedConeGeometry` (0.5×2.5, a mesma do
rastro do homing). Nenhum dos três lia como "super ataque".

- `combat/projectiles.js`: core 0.6×3.6 → **0.9×7.5** (~2.2× o comprimento da nave do jogador);
  aura 1.1 → **2.6** (diâmetro maior que a envergadura da nave); anéis 0.75 → **1.6** de raio, 3
  anéis idênticos viraram `SWIRL_RING_SPECS` (4 anéis com escala crescente 0.75→1.30, desenha um
  funil que vende a leitura de vórtice de verdade); glow da ponta 0.35 → **1.0**.
- `effects.js`: flash de disparo ganhou geometrias PRÓPRIAS (`swirlFlashConeGeo` 1.3×5.0,
  `swirlFlashRingGeo` raio 0.9-1.9) em vez de reusar as do muzzle flash comum — cone maior que o
  tiro normal inteiro, mais um 2º anel branco e bloom de "instante zero"; afterimage ganhou
  `swirlAfterimageCoreGeo` (0.75×6.5) em vez do cone compartilhado minúsculo; explosão de impacto
  (contra chefe/dourado/fragata/escudo) 2.5 → **4.5** de raio + shockwave branco extra.
- Não mexi em velocidade/dano/cooldown/hitbox — só escala visual. Ajustes finos de tuning que o
  doc original já deixava pra depois do playtest (FOV/slow-mo, "aura gorda perto de alvo pequeno")
  continuam pendentes, não fazem parte deste fix.

Verificação: `node --check` nos dois arquivos + carregamento do jogo sem erro de console (não deu
pra chegar num disparo real de Swirl Blast via automação nesta sessão — precisa de progressão de
gameplay real; validação visual em playtest fica pendente pro usuário confirmar).

**Balanceamento adicional neste commit** (Horda, Sentinela, cambalhota do trilho) — tuning feito
mais cedo nesta sessão, cada mudança já documentada inline no próprio código:
- `enemies/horda.js`: `HORDA_DEATH_DURATION` 0.35→0.95, projétil mais rápido/maior (46→60 u/s,
  raio 2.6→4), `HORDA_FIRE_INTERVAL_MS` 2100→1200, órbita 12→8, spawn 45-55→85-135.
- `enemies/sentinela.js`: HP 10→14, `LATERAL_TRACK_RATE` 7→0.2, 4→6 tiros, moldura mais fina e
  mais lenta (`GATE_BORDER_MIN`/`GATE_SPEED`), dano da moldura 1→2 (escudo 1→4), spawn/leave mais
  distantes.
- `rail.js`: cambalhota (`summersault`) ganhou arco vertical real (`SUMMERSAULT_ARC_HEIGHT`) em
  vez de só girar o yaw no lugar — bug reportado como "in-game ela só troca de lado"; arremesso por
  colisão (`startTumble`) parou de teleportar a nave (removido `arenaPos.addScaledVector(...,16)`/
  `playerX + pushX` instantâneo) e passou a só setar velocidade (`tumbleKnockbackVel`/novo
  `railThrowVel`), integrada frame a frame com decaimento exponencial lento.

---

### v0.89.0 — Swirl Blast: bug real no punch de câmera (`camera.translateZ` acumulando)

Usuário revisou o código do Swirl Blast contra o doc e achou o bug de verdade (eu não tinha
pego): em `game-loop.js`, o bloco do FOV bump (§4.5) chamava `camera.translateZ(1.5 * bumpFrac)`
**a cada frame** enquanto `state.swirlFovBumpMs > 0` (~18 frames em 300ms a 60fps).
`camera.translateZ()` é incremento relativo ao eixo local da câmera, não um offset absoluto — e
`rail.update()` (que roda antes, por frame) só corrige a posição via `camera.position.lerp(...)`,
uma fração por frame, não o suficiente pra compensar o que acabou de ser somado. Resultado: a
câmera empilhava o deslocamento e fugia bem além dos "+1.5 no eixo Z **no instante do disparo**"
que o doc pede (é um impulso pontual, não contínuo). O `rotateZ` não sofria disso porque
`rail.update()` reescreve o quaternion via `lookAt()` todo frame — só a posição não era reescrita.

**Correção**: `state.swirlPunchFired` (novo, em `mount-game.js`) guarda se o punch já disparou
nesta ativação do bump — `camera.translateZ(1.5)` agora roda só no primeiro frame em que o bump
fica ativo (resetado pra `false` no momento do disparo, junto com `swirlFovBumpMs`/`swirlSlowMoMs`
em `game-loop.js`); o `rotateZ`/FOV continuam por cima a cada frame, sem mudança (não tinham o bug).

**Instrumentado** (`FLUXO_VALIDACAO_IA.md`) — `aiValidator.expect()` no próprio ponto do
`translateZ`, medindo a distância real percorrida pela câmera nesse frame contra o 1.5 esperado
(tolerância 0.01): é uma regressão exata do bug corrigido, dispara só uma vez por Swirl (evento
discreto, não por frame de update).

**Ponto em aberto, não mexido**: o doc §4.5 sugere debug slowMo e Swirl slowMo se multiplicarem
(`dt * 0.25 * 0.15`); o código trata como mutuamente exclusivos (debug vence) — decisão consciente
já comentada no código, o próprio doc admite que a multiplicação dá "efeito bizarro". Fica como
está até o usuário pedir o contrário.

Verificação: `node --check` nos arquivos alterados, `node src/selftest.mjs` passando, jogo carrega
sem erro de console novo (os erros de ServiceWorker no console são de infraestrutura do servidor
de preview, não relacionados a esta mudança). Não consegui chegar a um disparo real de Swirl
Blast via automação nesta sessão — a expectativa de validação IA fica pronta pra confirmar via
"Copiar Log de Validação IA" no próximo playtest real.

---

### v0.90.0 — Dash lateral: afterimage + speedlines; contador de cooldown do Swirl Blast na HUD

Dois pedidos do usuário na mesma mensagem.

**1) Afterimage + speedlines no dash lateral** (propulsão segurada + bank/dodge em arena,
`rail.triggerArenaLateralDash`, `ARENA_DASH_DURATION = 0.22s`). Achado no caminho: o dash tem
DUAS formas de disparo — segurar `propulsion` + eixo de bank (já chamava o burst pontual
`effects.lateralDashVFX`) E tocar `dodgeLeft`/`dodgeRight` com `propulsionHeld` (NÃO chamava
nada, gap pré-existente). Corrigido as duas:
- `rail.js`: novo getter `isLateralDashActive()` (`lateralDashT < 1`), mesmo padrão de
  `isFullSpinActive()`.
- `effects.js`: novo `dashAfterimage()` (cone genérico, igual em espírito a `rollAfterimage`/
  `ramAfterimage`, cor `0x4db8ff` — a mesma do burst de `lateralDashVFX`) tocando a cada
  `DASH_AFTERIMAGE_INTERVAL = 0.025s` enquanto `dashActive` (intervalo mais curto que o do roll,
  0.04s, porque a janela do dash é bem menor — senão a trilha fica esparsa). Registrado no mesmo
  `update()`/dispose()/reset que os outros afterimages do jogador.
- `game-loop.js`: `dashActive = rail.isLateralDashActive()` computado uma vez, usado em três
  lugares — `effects.update()` (afterimage), `hud.setMotionLines()` (speedlines, mesma
  intensidade máxima 1.0 que o Swirl Blast usa), e passado como estava faltando o burst
  `lateralDashVFX` no branch de `dodgeLeft`/`dodgeRight` + propulsão.

**2) Contador de cooldown do Swirl Blast na HUD.** O jogo já tinha o cooldown funcionando
(`player.getSwirlCooldownMs`/`getSwirlCooldownTotalMs`, ver etapas anteriores do Swirl Blast) mas
NENHUM indicador visual — pedido explícito pra colocar "embaixo do mesmo local de onde fica o
foco de aliados" (o widget `[D] FOCO` do comando de esquadrão, `hud-squad-command-widget`).
- `hud-game.js`: `squadCommandWidget` (antes filho direto de `topbarRow`) agora mora dentro de um
  novo wrapper `.hud-squad-column` (flex column) que ocupa o mesmo slot horizontal no topbar —
  não muda a posição de nada que já existia. Novo `swirlCooldownWidget` empilhado por baixo,
  MESMA estrutura/classes do widget de FOCO (badge + meter + timer), só com ícone 🌀/label
  "SWIRL" e sem o estado "active" (Swirl não tem janela de duração, só dispara e entra em
  cooldown — só `ready`/`cooling`). Novo `hud.setSwirlCooldown(cooldownMs, totalMs)` segue
  exatamente o padrão de `setSquadronCommandState` (fill cresce conforme o cooldown esvazia,
  texto em segundos, "PRONTO" quando liberado).
- `hud-styles.js`: `.hud-squad-column` (a coluna) + `.hud-swirl-widget.ready` (variante de cor —
  azul do Swirl, `0x2b8fff`, em vez do ciano `#38bdf8` do FOCO, pra não ler como o mesmo botão;
  estado `cooling` reaproveita o cinza neutro já existente sem modificação).
- `game-loop.js`: `hud.setSwirlCooldown(player.getSwirlCooldownMs(), player.getSwirlCooldownTotalMs())`
  chamado todo frame, ao lado do `setSquadronCommandState` existente.

Verificação: `node --check` em todos os arquivos alterados, `node src/selftest.mjs` passando. Não
consegui verificar visualmente no browser desta vez — o servidor de preview carregou mas a página
ficou em branco (o import map do jogo carrega `three` de `cdn.jsdelivr.net`; a rede da sessão não
completou esse fetch a tempo, mesmo problema já visto no timeout de 300s de uma tentativa de
`navigate`). Não é causado por este código (nenhum arquivo dependente do import de `three` sequer
chegou a ser requisitado no log do servidor — o import map trava antes disso). Ambas as mudanças
seguem 1:1 padrões já existentes e testados (`rollAfterimage`/`isFullSpinActive` e
`setSquadronCommandState`), mas ainda vale o usuário confirmar visualmente no próximo playtest.

### v0.91.0 — Overhaul visual v2 do Swirl Blast — forma triangular de 9 camadas + homing contra chefe/dourado

Pedido do usuário via documento de proposta pronto (`Docs/# Swirl Blast — Design & Plano de I.md`
tem a amenda no topo). Duas clarificações resolvidas ANTES de codar (ver histórico da conversa):

1. **Base de cálculo desatualizada** — o documento assumia como "hoje" os números PRÉ-v0.88.0 (ver
   entrada "Swirl Blast: escala visual recalibrada" nesta mesma cadeia de arquivos), mas o jogo já
   tinha valores maiores em produção. Usuário confirmou: aplicar os valores PROPOSTOS ao pé da
   letra (não recalcular a partir do real "hoje").
2. **Escala inicial** — o próprio doc recomenda 2 rodadas de teste (moderada 0.6× primeiro, cheia
   depois) por riscos reais que ele mesmo lista (near-clip da câmera, homing pode trivializar luta
   de chefe, pode ficar grande demais). Usuário escolheu **Rodada 1 (0.6×)** primeiro, depois do
   susto recente com o tamanho errado da Horda — quer ver funcionando antes de ir pro tamanho
   cheio. Constante `SWIRL_SCALE = 0.6` em `projectiles.js` — pra Rodada 2, é só subir esse valor
   pra 1.0 (todos os `*_RADIUS`/`*_LENGTH` já são derivados dele).
3. **Conflito com R1 do doc original** ("disparo reto, sem homing", citado como pedido explícito
   do usuário) — a proposta v2 pede homing contra chefe/dourado, batendo de frente com R1.
   Levantado explicitamente antes de implementar; usuário confirmou "homing apenas contra chefes"
   e depois esclareceu "chefes inclui o dourado" — R1 amendado só pra esse caso específico
   (`BOSS_KIND`/`GOLDEN_KIND`), continua valendo pra todo o resto. Doc original marcado com a
   amenda.

**`src/combat/projectiles.js`** — reescrita completa do bloco Swirl:
- Geometria: 9 camadas (pirâmide principal 3 segmentos radiais, pirâmide traseira invertida,
  agulha frontal, `TorusKnotGeometry` de espiral, 5 anéis triangulares em funil com velocidade de
  giro PRÓPRIA cada um via `userData.spinSpeed` — dessincronizados de propósito —, aura, núcleo
  cilíndrico branco, cone de cauda, 3 esferas de exaustão nas quinas da base traseira). Material
  da espiral é PRÓPRIO por instância (`buildSwirlSpiralMaterial()`, não compartilhado) — precisa
  variar opacidade/velocidade por projétil quando homing está ativo, sem afetar outro Swirl em
  voo; descartado em `removeProjectile` (não no `dispose()` global, que só cobre o que é
  compartilhado).
- Homing: `projectile.swirlHomingTarget` (campo NOVO, não reaproveita o `projectile.homingTarget`
  genérico do teleguiado comum — aquele também sobrescreveria a VELOCIDADE pro valor do
  teleguiado, errado aqui). Lerp de DIREÇÃO com `SWIRL_HOMING_TURN_RATE=4.0 rad/s`, mantendo a
  velocidade do Swirl sempre. Congela (mantendo velocidade) se o alvo morrer no meio do voo.
- `fireSwirlBlast(origin, direction, bossTarget = null)` — 3º parâmetro novo.
- `updateSwirlDynamicShell()` — gira a espiral e os 5 anéis cada um na sua velocidade, por cima do
  giro do grupo inteiro (`SWIRL_SPIN_RATE`); acende a espiral (opacidade 0.75→1.0, giro 15→22
  rad/s) quando `swirlHomingTarget` está ativo.

**`src/combat/index.js`** — `fireSwirlBlast` agora consulta `lockon.getLockedEntities()` e filtra
por `BOSS_KIND`/`GOLDEN_KIND` ANTES de `game-loop.js` chamar `combat.clearLockedEnemies()` (que já
rodava incondicionalmente depois do branch de release do fogo — não precisou de mudança lá).

**`src/effects.js`** — `swirlBlastFlash` ganhou parâmetro `isHoming` (mais intenso quando
travado); `swirlAfterimage` usa a mesma silhueta triangular nova (3 segmentos, não mais 8);
`swirlBlastExplosion` ganhou 8 fragmentos triangulares (`TetrahedronGeometry`) voando em leque
hemisférico; `swirlLockReticle(targetPosition, fireDirection)` novo — anel branco breve sobre o
alvo no instante do disparo homing (orientado contra `fireDirection`, não há acesso à câmera
neste arquivo pra fazer billboard de verdade).

**Validado com `aiValidator.expect()`**: homing só ativa com alvo chefe/dourado; velocidade
preservada ao congelar por morte do alvo no meio do voo. Testado ao vivo via
`window.__starAnki` (`combat.sweepLockOn` + `combat.fireSwirlBlast` chamados diretamente,
contornando o gate de carga/giro do game-loop só pra teste) — **duas trajetórias reais**
capturadas frame a frame: (a) chefe travado fora do eixo de disparo → X cresce em direção ao
chefe com incremento CRESCENTE a cada frame (correção proporcional visível, não teleporte); (b)
sem nenhum lock → X e Y decrescem em incremento CONSTANTE (reta perfeita, R1 preservado). Zero
erros no console em toda a sessão de teste; `getScene().children` confirmou o Group de 15 filhos
(1+1+1+1+5+1+1+1+3) batendo exato com as 9 camadas descritas.

## Rádio dos Aliados (Overhaul de Personalidade, Ideia 3) — implementado

Ideia 3 do `Docs/# Overhaul de Personalidade e Vida.md` (bloqueada até um protótipo HTML com 3
opções visuais ser decidido). Processo: prototipei as 3 opções como um canvas de Design (claude.ai
artifact), usuário gostou da Opção B (notificação de HUD no canto) mas pediu sprites reais de
personagens em vez de ícone colorido + quotes em inglês alinhadas ao Star Fox 64 original — nesse
ponto o usuário pediu pra **não** ser mais em artefato hospedado, e sim arquivo HTML local mesmo
(protótipos ficaram em `Docs/Rádio dos Aliados — Opção B (protótipo).html` e a v2 com os sprites/
estática reais). Depois de decidido, pediu refinamento: painel quadrado (não pill, acomoda melhor
o ícone) + efeito de "rádio riscado" (a estática de sintonia real do jogo, não um glitch genérico)
+ 3 novas opções de ANIMAÇÃO com isso em mente. Escolhida a **Opção 3**: painel corta pra dentro
em fatias (glitch de steps, tipo troca de canal) na entrada, retrato passa pelos frames de
estática, flicker rápido antes de sumir.

**Assets — de onde vieram (importante pra nunca esquecer a fonte)**: sprites reais recortados do
jogo **Star Fox 2 (SNES)**, via spriters-resource.com (asset `snes/starfox2/asset/1451/`
"Mugshots" pros retratos de Falco/Peppy/Slippy/Miyu — grade de 65×65px por personagem, confirmada
por pixel-sampling; asset `1452/` "Portraits" pra sequência de "estática de sintonia" — 2 ícones de
bracket + 4 blocos de ruído colorido + 1 ruído escuro, EXATAMENTE a animação de "sinal chegando"
que o jogo original usa antes de mostrar o retrato de um personagem no rádio). Baixados via
ImageMagick (`magick -crop` no grid certo, filter point + resize pra manter pixel art nítida) —
NÃO por base64 colado manualmente (primeira tentativa disso corrompeu silenciosamente as imagens,
gerando strings curtas inválidas; lição: para blobs >1KB, baixar/decodificar via arquivo, nunca
copiar base64 gigante à mão). Assets finais em `assets/wingman-radio/` (`falco.png`, `peppy.png`,
`slippy.png`, `miyu.png`, `static1.png`..`static7.png`) — commitados no repo público. **Risco de
direito autoral aceito conscientemente pelo usuário** (sprites da Nintendo/Argonaut, projeto
pessoal não-comercial) — se o projeto algum dia for distribuído/monetizado, trocar por arte
própria.

**Renomeação Krystal → Miyu**: o 4º piloto (roxo, `WINGMAN_PROFILES[3]`) se chamava "Krystal" mas
esse nome não existe no elenco clássico de Star Fox (ela só estreia em Star Fox Adventures/GameCube,
anos depois de SF64) — não tem sprite correspondente na folha de SF2. Como não dava pra ter um
retrato "Krystal" com a cara da Miyu Lynx, o usuário decidiu renomear o piloto inteiro pra Miyu em
todo o jogo (rename global via sed, case-preservado: `Krystal`→`Miyu`, `krystal`→`miyu`,
`KRYSTAL`→`MIYU`, 7 arquivos: `combat/wingmen.js`, `game-loop.js`, `hud-game.js`, `audio-cues.js`,
`roguelike.js`, `debug.js`, `flow-question.js`). Título ("Vanguarda Fantasma") e tema (stealth/
cloak) continuam batendo bem com a Miyu, não precisou mudar.

**Idioma das falas**: inglês, catchphrases curtas no espírito de Star Fox 64 (pedido explícito do
usuário — "Do a barrel roll!" pra Peppy, "Help me, Fox!" reaproveitado pro evento `alone` do
Slippy, etc) — o resto do jogo é todo em português, isso é homenagem direta à série, decisão
consciente, não inconsistência.

**Arquitetura**: `src/combat/wingman-radio.js` (novo) — dispatcher puramente lógico, sem DOM,
igual ao spec original do doc (`trySpeak(pilotId, eventId, now)`, cooldown global de 6s,
`trySpeakAlone` com estado próprio pra só falar 1x por partida). 10 pontos de disparo em
`combat/wingmen.js` (8 do doc + `player_low_health` edge-triggered + `alone`): `engage_dogfight`,
`engage_focus`, `ability_ram/guard/repair/assist`, `kill`, `return_formation`,
`player_low_health`, `alone`; mais `player_take_damage` disparado de FORA do laço de update
(`triggerPlayerTookDamage()`, chamado por `game-loop.js` no momento em que `player.takeDamage()`
resolve — decisão (b) do §3.5 do doc: só reage a dano do JOGADOR, nunca do wingman, que é
invulnerável). Mensagens que nascem fora do laço de `update()` ficam em `pendingRadioMessage`
(closure) até o próximo frame devolver — 1 frame de atraso, imperceptível. `combat/index.js`
repassa `radioMessage` no retorno de `update()` e expõe `notifyPlayerDamaged()` (patch cirúrgico —
arquivo tem WIP concorrente de outra sessão no Swirl Blast homing, mesma técnica de sempre:
extrai HEAD, replica só as 2 linhas novas, diff, `git apply --cached`). `hud-game.js` →
`showWingmanRadio({ pilotId, name, color, text })` monta o painel + toca o flipbook de 7 frames de
estática (55ms cada, pré-carregados no mount do HUD pra primeira fala da partida não perder frame
por cache frio) antes de resolver no retrato de verdade. CSS em `hud-styles.js`
(`.hud-wingman-radio*`) — `@keyframes hud-wingman-radio-glitch-in` (clip-path em steps) e
`-flicker` (opacity em steps) fazem as duas animações da Opção 3. Setting novo
`wingmanRadioEnabled` (default `true`, toggle em Configurações → "Rádio do Esquadrão").

**Testado ao vivo** via `window.__starAnki.combat.notifyPlayerDamaged()` + eventos orgânicos de IA
durante partida real com Esquadrão completo (4 pilotos) — painel apareceu corretamente pros 4
pilotos (cores/retratos certos), zero erros de console. `selftest.mjs` ganhou seção nova
(cooldown global bloqueia 2ª fala, libera depois de 6s, `pilotId`/`eventId` inexistentes devolvem
`null` sem lançar, `reset()` zera cooldown, `trySpeakAlone` só fala 1x mesmo com outro piloto e
cooldown livre).

### Swirl Blast Rodada 2 (escala cheia) + bug real do homing corrigido

(sem número de versão nesta entrada — havia um bump pra v0.92.0 pendente/staged de outra sessão
concorrente no momento desta entrega, ver nota sobre `game-loop.js` mais abaixo; não dava pra
commitar `version.js` sem entrelaçar as duas entregas)

Usuário aprovou a Rodada 1 (0.6×) em teste real e pediu pra seguir pra Rodada 2, mas reportou dois
problemas: (1) "o projétil precisa ser maior" — pedido de Rodada 2 mesmo; (2) "ele ainda não é
teleguiado corretamente até os chefes" — bug real, não percepção.

**Escala**: `SWIRL_SCALE` em `combat/projectiles.js` foi de `0.6` pra `1.0` (valores cheios da
proposta v2). As constantes duplicadas de propósito em `effects.js` (não importa de
`combat/projectiles.js` — mesma regra de sempre, evita import circular) também foram reescaladas
pra bater: `SWIRL_FLASH_RING_SCALE` (4.8→8.0), `SWIRL_EXPLOSION_RADIUS` (4.2→7.0),
`swirlFragmentGeo` (0.3→0.5), `swirlAfterimageCoreGeo` (1.8×6.0→3.0×10.0).

**Bug do homing — causa raiz encontrada via teste ao vivo, não suposição**: o homing da Rodada 1
usava `Vector3.lerp` entre a direção atual e a direção desejada (ambas normalizadas) pra simular
uma taxa de giro limitada. Isso tem um defeito geométrico conhecido: lerp entre dois vetores
UNITÁRIOS encolhe de magnitude perto de ângulos largos (~90°-180°) antes de normalizar de volta —
distorce a taxa de giro real e, em alvo próximo/ângulo largo, o projétil ULTRAPASSAVA o alvo e
entrava numa órbita instável ao redor dele sem nunca fechar a distância até o `hitRadius`. Provado
via `window.__starAnki`: disparo contra chefe reposicionado a 60u de distância / 15u lateral
(mira reta, sem apontar pro alvo — simula o jogador não conseguindo manter a mira exata após o
giro completo) — posição do projétil oscilando 36u↔147u em torno de um chefe PARADO, nunca
conectando, expirando por alcance máximo.

**Correção em 2 partes** (ambas em `combat/projectiles.js`, bloco do homing dentro de
`update(dt, ...)`):
1. Trocada a rotação de `Vector3.lerp` (degenera) por rotação de eixo-ângulo de verdade
   (`Vector3.applyAxisAngle` em torno do eixo `cross(direçãoAtual, direçãoDesejada)`, ângulo
   limitado por `SWIRL_HOMING_TURN_RATE * dt`) — taxa de giro genuinamente constante, sem a
   distorção do lerp. `SWIRL_HOMING_TURN_RATE` subiu de `4.0` pra `18.0` rad/s (o valor de 4.0
   nunca convergia a tempo mesmo com a rotação corrigida).
2. Mesmo com eixo-ângulo correto, perseguição pura (mirar sempre na posição ATUAL do alvo) tem um
   problema geométrico separado e conhecido: perto do alvo, a taxa angular NECESSÁRIA pra
   continuar apontando pra ele cresce sem limite — o projétil pode ficar preso numa órbita estável
   ao redor do alvo (visto ao vivo: mínimo de distância baixando de 68u→38u→18u conforme
   `SWIRL_HOMING_TURN_RATE` subia, mas nunca cruzando o `hitRadius` de ~7.7u — um ciclo-limite, não
   uma espiral convergente). Adicionado `SWIRL_HOMING_SNAP_RANGE = 26` — dentro desse raio, o
   projétil aponta DIRETO pro alvo (sem limite de giro), a "guiagem terminal" padrão de mísseis em
   jogos, só pro trecho final. É maior que a órbita observada em teste, então garante que a órbita
   sempre entra no raio de snap e converge de vez.

**Validado ao vivo** (`window.__starAnki`, chefe E dourado, caso fácil/moderado/extremo):
- 60u frente / 15u lateral, mira reta: hit em 6 frames.
- 40u frente / 25u lateral (~32°), mira reta: hit em 4 frames.
- 40u frente / 25u lateral, disparo PERPENDICULAR (mira "pra cima", pior caso de desalinhamento
  giro→soltura): hit em 7 frames — esse caso especificamente falhava 100% das vezes antes da
  correção (expirava sem conectar).
- Dourado, mesmo caso moderado: hit em 8 frames.
- R1 (sem alvo travado): 15 frames consecutivos com delta de posição EXATAMENTE idêntico
  (8.684u/frame) — zero curvatura, trajetória reta preservada intacta.
- `stopProjectile` (chefe/dourado sempre param o Swirl) continua funcionando — grupo do projétil
  removido da cena no mesmo frame do hit em todos os casos acima.

**Câmera lenta (slow-mo do Swirl)** — usuário pediu pra ajustar ele mesmo, só perguntou se as
variáveis já estavam isoladas/comentadas pra edição fácil. Confirmado que sim, sem precisar mexer:
`SWIRL_SLOW_MO_MS`/`SWIRL_SLOW_MO_FACTOR`/`SWIRL_FOV_BUMP_MS`/`SWIRL_FOV_TARGET` em
`main-constants.js` (bloco "SWIRL BLAST", cada uma já com comentário explicando o efeito). O punch
de câmera (`camera.translateZ(1.5)`) e o roll (`degToRad(3)`) em `game-loop.js` também têm
comentário no local explicando o que fazem, mas ficaram como número mágico inline (não extraídos
pra constante nomeada) — havia uma sessão concorrente com mudanças não commitadas nesse mesmo
arquivo (`game-loop.js`) no momento desta entrega; extrair essas duas constantes teria misturado
esta entrega com o trabalho pendente da outra sessão, então foi revertido de propósito. Se quiser
essa extração depois, é seguro fazer numa entrega isolada.

## Rádio dos Aliados — correção de bug + expansão de conteúdo + fila de mensagens

Entrega seguinte à implementação inicial do Rádio dos Aliados (ver seção acima). Usuário reportou
bug visual real: **os retratos só trocavam um tempo DEPOIS da mensagem aparecer**, não junto com
ela.

**Causa raiz**: o flipbook de estática reatribuía `img.src` a cada 55ms (7 frames). Browsers
cancelam o carregamento anterior assim que um novo `src` é atribuído — 55ms é rápido demais pra
completar fetch+decode+paint de um frame antes do próximo substituir, então NENHUM frame de
estática chegava a pintar; o `<img>` ficava com o retrato antigo (ou em branco) até o load final
(por acaso lento o bastante pra sobreviver) trocar de repente, bem depois do texto já ter
aparecido. **Fix**: os 7 frames de estática viraram `<img>` de verdade, pré-carregados 1x no mount
do HUD e NUNCA MAIS têm `src` tocado — "tocar o flipbook" virou só alternar qual já tem a classe
`visible` (opacity via CSS, sem nenhuma rede/decode no caminho crítico). Retrato final continua
reatribuindo `src` (não tem pressão de tempo, 2.4s de hold sobram).

**+52 falas novas** (pedido: mín. 40, referenciando inimigos/chefes/impulso/disparo carregado/
habilidades "principalmente"/eventos): mais variedade nos 4 eventos de habilidade existentes (2-3
falas cada agora, era 1); eventos novos — `engage_boss` (chefe/dourado, prioridade sobre o
genérico via `engageEventFor()`), `engage_horda`/`engage_fragata` (inimigos com identidade visual
forte), `boss_kill`/`golden_kill` (substituem `kill` genérico quando `hit.bossDefeated`/
`goldenSpecialHit`), `boost_used` (edge-trigger em `opts.boostActive`), `charged_shot_used`
(edge-trigger na SOLTA do carregado — `wasHomingCharging && !homingCharging`, só conta se segurou
>0.3s, evita comentar em tap acidental), `focus_ready` (ver fila abaixo).

**Fila de mensagens** (pedido: permitir uma fala depois da outra "como o botão de foco com todos
os 4 se comunicando de prontidão"): canal novo `radioQueue` (array), separado do `radioMessage`
singular — nasce em `toggleCommand()` quando o comando de foco ativa: cada piloto ativo (exceto
quem está com `abilityActive`, mesma exceção do assign de alvo) fala uma linha de `focus_ready` via
`wingmanRadio.getLine()` (lookup SEM cooldown — não é `trySpeak()`, senão só 1 dos 4 conseguiria
falar por causa do cooldown global de 6s). HUD (`showWingmanRadioQueue`) tem fila própria + flag
`wingmanRadioPlaying`: se já tem algo tocando, entra no fim da fila; ao terminar de sumir, encadeia
a próxima automaticamente. `showWingmanRadio` (trigger avulso) continua interrompendo tudo e
tocando na hora, comportamento inalterado.

**Tamanho -15%** (pedido explícito): avatar 52px→44px, fonte do nome 12px→10px, fonte da fala
13px→11px, padding/gap/cantos técnicos proporcionalmente menores.

Testado ao vivo com `window.__starAnki` + `setManualStepping(true)` (stepping determinístico,
necessário porque o `setInterval` do flipbook roda em tempo real de parede — testar com
`step()`+`await sleep` competia com o próprio timer): confirmado via `MutationObserver` +
inspeção de `naturalWidth`/classe `visible` que o frame 0 da estática fica visível IMEDIATAMENTE
(síncrono, no mesmo tick da chamada), os 7 frames chegam pré-decodificados (`naturalWidth: 260`
todos), e a rajada de prontidão do `[D]` realmente encadeia mensagens de pilotos diferentes em
sequência (Falco "Locked and loaded!" confirmado). Zero erros de console.
