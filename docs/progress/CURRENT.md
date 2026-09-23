# ESTADO ATUAL DO PROJETO — STAR-ANKI

> **Versão:** v0.99.35
> **Branch:** `chore/reorganize-and-forgot-v09935`
> **Base SHA:** `bfad055e7bcb07f57e396a511b3258c15f0f2a91`
> **Última atualização:** 2026-09-23

---

## 1. IMPLEMENTADO RECENTEMENTE
- **Fechamento e Auditoria Pré-Merge da v0.99.35:**
  - **Arcade Draft Bullet-Time com Retorno a 1.0x:**
    - O timer de 1,5s (`state.arcadeBulletTimeTimer`) agora decrementa utilizando `rawDt` e governa autoritativamente a desaceleração (`ARCADE_CARD_CHOICE_TIME_SCALE`).
    - Ao atingir zero, o jogo retorna imediatamente ao tempo normal (1.0x), mantendo o draft aberto e visível, com gameplay (nave, inimigos, rail, disparos, colisões e wingmen) 100% ativo.
    - Seleção de carta antes ou depois de 1,5s fecha o draft e reseta o timer.
    - Setting `arcadeCardChoicePauses` continua respeitada quando ativada.
  - **Fuzz Runtime Real dos Wingmen (`tools/wingman-runtime-fuzz-audit.mjs`):**
    - Simulação determinística de 4 caças ativos por 3600 frames (60s a 60 fps).
    - Validação de todos os 6 pares de colisão: contrato de clumping persistente (<1.0u por >0.5s) rigorosamente respeitado com zero violações.
    - Finitude universal: zero NaNs, zero Infs em posições, velocidades e steering.
    - Histerese de rail catch-up (ativação > 32u, release <= 22u) sem oscilação contínua e sem thrashing.
    - Deconflição e separação física com autoridade garantida sobre alvos de formação e avoidance.
  - **Damage Feedback de Detritos:**
    - Contrato de dano ambiental strictly enforced: qualquer evento classificado como dano confirmado requer estritamente `damage > 0`.
    - Contatos sem dano de HP retornam `null` e nunca poluem a telemetria com `damage: 0`.
  - **Reconciliação e Hierarquia Canônica de Documentação:**
    - `docs/planning/BACKLOG.md` promovido a índice central canônico de backlog do projeto.
    - Backlog especializado de perguntas e flashcards movido para `docs/planning/question-system-backlog.md`.
    - Documento legado `Docs/Docs 2/forgot.md` arquivado como snapshot histórico em `docs/progress/archive/forgot-historical-snapshot-v09934.md` e transformado em ponte inequívoca.
    - Força do campo do Enxame-Ímã reconciliada canonicamente para 1100 u/s² (`IMA_FIELD_STRENGTH = 1100`).
  - **Pipeline Canônica de CI:**
    - Criado `.github/workflows/ci.yml` cobrindo pull requests e pushes em `main` e `chore/reorganize-and-forgot-v09935`.
    - Pipeline estritamente de validação (sem commits, edits ou mutações no repositório).
  - **Integração de Testes de Rádio Global e Arcade Bullet-Time:**
    - `src/wingman-global-radio.test.mjs` e `src/arcade-draft-bullet-time.test.mjs` integrados à execução padrão do `src/selftest.mjs`.
  - **Preservação Confirmada dos Três Fixes Anteriores:**
    - Rádio dos Wingmen: silêncio global do esquadrão (gap 6s, duração estimada 2,8s, dedup 8s, preempção de abilities/urgências e Call & Response no orçamento).
    - Estrelas e Fog: textura radial em point sprites, `midStars` com reciclagem em world-space, parallax espacial real e proximity fade em bancos de fog.
    - Boss Dourado: buffer de piercing, fail-safe `consumeGoldenDefeated`, `isGoldenDying` e guarda idempotente na cutscene de morte.

- **Superchecagem de Inimigos (15 Achados P0/P1/P2 Resolvidos):**
  - #1 (P0): Boss 100% invulnerável na origem durante transições (`transitioning`/`dying`) bloqueando tiros, Swirl, AoE e colisões físicas, com HP travado no piso da fase.
  - #2 (P0): Decremento de esquadrão (`decrementSquadron`) centralizado e idempotente com flag `_squadronCounted`, eliminando contagem dupla entre dano letal e `removeEnemy`.
  - #5 (P0): Dano composto da Sentinela (2 casco / 4 escudo) preservado através de todo o pipeline até `player.takeDamage`.
  - #7 (P1): Mísseis teleguiados e Swirl abandonam imediatamente alvos em `fadingOut`, mortos ou sem mesh em cada frame.
  - #8 (P1): Campo magnético do Enxame-Ímã (`getMagnetSources`) desativa fontes em `fadingOut` e HP <= 0.
  - #9 (P2): Wobble visual (`_spawnWobbleOffset`) desacoplado da posição lógica e autoritativa do inimigo.
  - #10 (P2): Quaternion dos minicars do Dourado utiliza vetor de velocidade unitário normalizado.
  - #11 (P1): Projéteis inimigos comuns utilizam detecção contínua swept (`distanceToSegment`) imune a quedas de taxa de quadros.
  - #12 (P1): Força do campo do Enxame-Ímã calibrada para 1100 u/s² (com `PROJECTILE_SPEED = 260`).
  - #13 (P1): Disparo de rajadas e laser do Chefe bloqueados durante transição/animação.
  - #14 (P1): Tank na arena preserva combate no trilho e nunca foge durante `DISENGAGING`.
  - #15 (P2): `severChainAt` do Verme tornado idempotente com guarda `deadSegment.severed = true`.

- **Reconciliação dos Wingmen & Miyu Assist Locks:**
  - Portabilidade limpa dos 10 fixes do bug hunt dos Wingmen integrada a `wingmen.js`.
  - Módulo `src/combat/miyu-assist-lock-budget.js` com orçamento dual independente (`LOCK_SOURCE_BASE` vs `LOCK_SOURCE_MIYU`).
  - Prioridade autoritativa: Boss ativo > maior maxHp > menor ID, concentrando travas no Boss e distribuindo travas adicionais da Miyu com feedback visual e telemetria.

- **Overhaul do Swirl Blast:**
  - Hitbox volumétrica swept de 3.0u.
  - Velocidade desacoplada da câmera lenta através de `unscaledDt`.
  - Dano balanceado: 6 base + 30% maxHp contra Chefes, gerando faíscas de impacto dedicadas em cada vítima perfurada.

- **Overhaul Completo do Tank:** Unidade pesada regular (75 pts, 2 vagas de população) com modelo 3D desacoplado para recoil físico, FSM de 9 estados, 3 ataques e reação a Stagger por Swirl.

---

## 2. DECISÕES RECENTES
- [`ADR-0001`](../decisions/ADR-0001-lock-on-priority-strategy.md): Prioridade autoritativa do Lock-on foca Boss e maior maxHp sem desvio pelo retículo.
- [`ADR-0002`](../decisions/ADR-0002-wingmen-tactical-freedom.md): Tactical Freedom remove a coleira de regroup por distância dos Wingmen.
- [`ADR-0003`](../decisions/ADR-0003-tank-regular-heavy-unit.md): Tank é consolidado como unidade pesada regular (sem virar boss de arena).

---

## 3. PROBLEMAS CONHECIDOS
- *Nenhum bug crítico aberto no momento.* Todos os cenários de wingmen, rádio, parallax/fog, boss dourado e arcade bullet-time foram testados e fechados.

---

## 4. IMPLEMENTAÇÕES PARCIAIS
- **FSM Universal de Inimigos (`docs/specs/active/enemy-fsm-overhaul.md`):** Fase 1 concluída (Blaster e Tank). Fases 2 em diante (MiniSwarm, Sentinela, Boss, Golden, Sussurro, Fragata, Verme, TimeEnemy, Réplica) mapeadas no backlog central.

---

## 5. AGUARDANDO VALIDAÇÃO
- Revisão final de auditoria pelo usuário pré-merge da v0.99.35.

---

## 6. PENDÊNCIAS REAIS
- Consultar o índice consolidado em [`docs/planning/BACKLOG.md`](../planning/BACKLOG.md).
- Catálogo de áudio com 6 arquivos aguardando mapeamento em [`docs/planning/audio-backlog.md`](../planning/audio-backlog.md).

---

## 7. SPECS ATIVAS & PRONTAS
- **Ativas:**
  - [`docs/specs/active/enemy-fsm-overhaul.md`](../specs/active/enemy-fsm-overhaul.md)
  - [`docs/specs/active/gravity-recovery-and-integration.md`](../specs/active/gravity-recovery-and-integration.md)
- **Prontas para Implementação:**
  - [`docs/specs/ready/overhaul-dourado-esquadrao.md`](../specs/ready/overhaul-dourado-esquadrao.md)
  - [`docs/specs/ready/mira-direcional-por-movimento.md`](../specs/ready/mira-direcional-por-movimento.md)
  - [`docs/specs/ready/cutscene-vida-perdida.md`](../specs/ready/cutscene-vida-perdida.md)
  - [`docs/specs/ready/boss-colmeia-mae.md`](../specs/ready/boss-colmeia-mae.md)
  - [`docs/specs/ready/evento-apagao-radar.md`](../specs/ready/evento-apagao-radar.md)
  - [`docs/specs/ready/obstaculos-novos.md`](../specs/ready/obstaculos-novos.md)

---

## 8. TESTES RECENTES
- `node src/selftest.mjs`: **35/35 suítes e contratos aprovados (100%)**
- `node tools/wingman-runtime-fuzz-audit.mjs`: **39.755 expectativas, 0 falhas, 0 NaNs, 0 clumping persistente**
- `node tools/state-fuzz-audit.mjs`: **FUZZ_SUMMARY failures=0 (6/6 verificações de estresse)**
- `node tools/full-project-audit.mjs`: **AUDIT_SUMMARY errors=0 warnings=0 (102 arquivos)**
- `node src/arcade-draft-bullet-time.test.mjs`: **7/7 critérios aprovados**
- `node src/wingman-global-radio.test.mjs`: **7/7 critérios aprovados**

---

## 9. PRÓXIMO PONTO DE CONTINUIDADE
1. Concluir a revisão desta branch `chore/reorganize-and-forgot-v09935` e submetê-la a merge.
2. Iniciar a próxima entrega de gameplay aprovada: **Overhaul do Dourado e Esquadrão de Caças** ([`docs/specs/ready/overhaul-dourado-esquadrao.md`](../specs/ready/overhaul-dourado-esquadrao.md)) ou **Mira Direcional por Movimento** ([`docs/specs/ready/mira-direcional-por-movimento.md`](../specs/ready/mira-direcional-por-movimento.md)).
