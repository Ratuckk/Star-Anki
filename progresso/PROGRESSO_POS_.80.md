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
