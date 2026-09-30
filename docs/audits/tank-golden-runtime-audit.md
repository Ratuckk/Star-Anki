# Auditoria de runtime — Tank “inerte” e caças do Dourado “decorativos” (2026-09-30)

> Método: sistema de inimigos REAL (`createEnemiesSystem`) rodando por frames simulados (60 Hz), com trilho/efeitos mínimos e `Math.random` semeado; observação de estado por frame e de projéteis criados na cena. Harness: `tools/lib/enemy-runtime-harness.mjs`. **Nada aqui avalia aparência: VALIDADO VISUALMENTE: NÃO.**

## 1. Tank

**Sintoma:** Tank “parado”/irrelevante no jogo.
**Reprodução (antes da correção):** `0,00 s SPAWNING → 0,52 s ENGAGED → 2,30 s BRACING (siege-shot) → 2,73 s TELEGRAPHING → 3,08 s ATTACKING → 3,37 s "undefined" (dying=true)`; um projétil Siege é disparado e o Tank se autodestrói, sem nunca completar um ciclo.
**Causa raiz:** `ENEMY_STATES.RECOVERING`/`ENEMY_STATES.DYING` não existiam; `{ [undefined]: … }` vira a chave literal `"undefined"`, e a entrada `DYING` (declarada por último) sobrescrevia `RECOVERING`. `fsm.transition(undefined)` encontrava o handler `DYING`.
**Por que os testes antigos não pegaram:** `tank.test.mjs` e `enemy-supercheck.test.mjs` verificam funções puras e trechos de código-fonte (`tankShouldLeaveAfterCycle`, `block(tankSrc, …)`); `tank-spawn-integration.test.mjs` valida spawn/cap/morte, nunca o ciclo de ataque completo depois do 1º tiro. Nenhum exercitava `ATTACKING → RECOVERY`.
**Divergência design ↔ código** (a Fase 3 trocou sem registrar decisão): Siege 20 u/s dano 3 power 3 vs design 34/2/High Impact; Suppression 31 u/s, 3 tiros fixos a 0,14 s vs 40 u/s, 2–3 a 0,22 s; Ram a 58 u/s por 0,78 s em qualquer distância vs < 13u, 30 u/s, 0,55 s; Stagger 0,65 s/imunidade 1,65 s vs 0,45 s/2,5 s; disengage após 3 ciclos vs 5. Restaurado o design; o raio de hit 4,48 segue o `CLAUDE.md` §19 (mais novo que o 2,80 do design).
**Evidência pós-correção:** `node tools/validate-tank-runtime.mjs` (70 verificações).

## 2. Esquadrão Dourado

**Sintoma:** caças “decorativos”.
**Instrumentação (D1, 40 s):** só o caça F2 (slot 0) deixou `FORMATION`; F3 ficou parado o tempo todo. Com D5+2 aliados (6 caças, cap ofensivo 3): F5/F6/F7 só agiam no `LASER_FLANK`, quando F2–F4 estavam fora de formação.
**Causas raiz:** (1) `startOrder` escolhia participantes com `activeFighters.slice(0, maxOffensive)` — sempre os primeiros do array; (2) Pincer: `flankOffset`/`elevationOffset` eram gravados em `attackContext` e **nunca lidos**; o estado `ATTACKING` era um mergulho reto ao alvo a partir do slot de formação, com ~6–9u de abertura lateral — não uma pinça de dois flancos reconhecíveis.
**Correção:** rodízio por `lastActedAt` (quem agiu há mais tempo); Pincer com lados opostos garantidos (ordenação pelo X do slot, metades esquerda/direita), ponto de flanco à frente do jogador (28u, lateral ±22u, elevação ±3u), janela comum de ataque e convergência no jogador vivo.
**Participações por caça em 75 s (D1):** antes `15/1`; depois `8/8`. D5+2: `8/8/8/7/7/7`.
**Por que os testes antigos não pegaram:** `golden-squadron.test.mjs` valida caps/slots/estados isolados e `golden-squadron-runtime-fuzz.mjs` checa invariantes (cap, NaN, ordens vistas ≥ 1 vez); ambos aceitam “a ordem existiu” sem medir *quem* agiu nem *onde* os caças estavam (lados do Pincer). Uma ordem com sempre os mesmos caças passa em todos os invariantes.
**Evidência pós-correção:** `node tools/validate-golden-runtime.mjs` (53 verificações em D1/D5/D9, Pincer, Strafing, Laser Flank, Coordinated Fire, tiros reais, abates normal/teleguiado/Swirl, reposição, teleporte, comandante sozinho).
