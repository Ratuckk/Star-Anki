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
