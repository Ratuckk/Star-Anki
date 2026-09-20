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
