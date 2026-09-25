# ESTADO ATUAL DO PROJETO — STAR-ANKI

> **Versão:** v0.99.36 — Pacote de Correção em Fases (Fases 0 a 5) + HUD Opção 4 integrado em `main`
> **Branch Atual de Trabalho:** `main` (após merge do PR #20)
> **Última Atualização:** 2026-09-25
> **Histórico Recente de Integrações em `main`:**
> - **PR #15 (Dourado + Esquadrão):** Merge `3c014a74f56dfd90428c6370372d90527f5c9716` (CI Run `35946376454` pass)
> - **PR #16 (Tank Natural Spawn):** Merge `327bf50b24a8c5c1a2d1e32dcec230e360e08bc5` (CI Run `35997550149` pass)
> - **PR #17 (Lock-on / Miyu / Reticle / Arcade / Fog Polish):** Merge `bdd8a879651ff4da411ec38a4c99745d9a93683f` (CI Run `36001243157` pass)
> - **PR #18 (HUD Double Stack Architecture):** Merge `7a6d10354486578bc1ba0d606b1d84a9410083af` (CI Run `36017039624` pass)
> - **PR #19 (Hotfix Runtime ReferenceError THREE em setReticleCharge):** Merge `8b499bddbed11d00b70747ceef9ca621ed6f5414` (CI Run `36031499957` pass)
> - **PR #20 (Pacote de Correções Fases 0 a 5 + HUD Opção 4):** Merge `3028139552140bb6bf70c5384667d26ca75ad67f`
> **Registro Cronológico Pós-v0.99.35:** [`docs/progress/PROGRESSO_v0.99.36-em-diante.md`](PROGRESSO_v0.99.36-em-diante.md)
> **Pacote de Correções Ativo:** Fases 0 a 5 e HUD Opção 4 integrados integralmente na branch `main`.

---

## 1. IMPLEMENTADO RECENTEMENTE
- **Hotfix Bloqueador de Runtime — ReferenceError THREE em setReticleCharge (PR #19):**
  - Substituição da chamada `THREE.MathUtils.clamp` por clamp JS puro `Math.max(0, Math.min(1, Number(chargeFrac) || 0))` em `src/hud-game.js`.
  - Eliminação definitiva da exceção fatal no loop principal a cada frame em ambiente de navegador real.
  - Testes de regressão adicionados e homologação gráfica em navegador real com 0 erros/exceções.

- **HUD Double Stack Architecture & Authoritative Seams (PR #18):**
  - **Pilha Esquerda (Score + Métricas + Combo):**
    - Score autoritativo em tipografia pesada (`session.score`).
    - Sub-linha com pills de `STREAK` (`session.correctStreak`, cobrindo perguntas normais, de chefe e bônus do Dourado via `updateCorrectStreak`) e `KILLS` (`session.totalKills` via `recordKills`, imune a despawns e hits não-letais, com guarda idempotente contra contagem dupla na morte de Boss/Dourado).
    - Combo (`session.comboMultiplier`) mantido sob a métrica com barra de acento neon.
    - Deslocamento horizontal seguro à direita do cluster vital via token responsivo `--hud-left-stack-x: clamp(238px, 17vw, 290px)`.
  - **Pilha Direita (Mission Time + Nível):**
    - Cronômetro progressivo real `MM:SS` medindo tempo efetivo de missão (`session.missionTimeMs`) via `rawDt * 1000`. Congelamento estrito durante pausas, card draft e cutscenes via seam `shouldAdvanceMissionTime`, imune a distorções de slow-motion. Ticks decorativos estáticos.
    - Nível autoritativo em 2 dígitos (`01..09`) via `formatDifficultyLevel(level)`.
    - Rank inexistente intencionalmente omitido do DOM (sem placeholders ou dados fake).
  - **Cluster Superior Central (Wingmen + Swirl + Combate):**
    - Hexes dos 4 wingmen centralizados horizontalmente no topo (`top: clamp(8px, 1.2vh, 14px); left: 50%`).
    - Linha secundária de combate agrupando Ordem de Esquadrão [D], widget do Swirl Blast [🌀] e Cadeia de Abates [KILL CHAIN], desacoplados do Score e sem provocar saltos de layout.
  - **Radar / Minimapa:**
    - Oculto no modo rail (`hud.setMinimap(false)` e regra `[hidden] { display: none !important; }`), visível em arenas e chefes via `shouldDisplayMinimap`.
    - Reposicionado na lateral intermediária (`top: clamp(28%, 32%, 35%); right: clamp(16px, 2vw, 24px)`), liberando o topo direito. Limpeza garantida da classe `alert` na saída da arena.
  - **Consolidação de API (Abordagem B):**
    - API centralizada em `hud.setStatus(...)` com formatadores puros compartilhados (`formatMissionTime`, `formatComboMultiplier`, `formatDifficultyLevel`). Métodos granulares mortos removidos.
  - **Documentação e Testes:**
    - Registro canônico: [`docs/progress/PROGRESSO_v0.99.36-em-diante.md`](PROGRESSO_v0.99.36-em-diante.md). Suíte dedicada: `src/hud-double-stack.test.mjs` (7 blocos).

- **Pacote de Polimento: Lock-on, Miyu Assist, Retícula, Arcade e Fog (PR #17):**
  - **Autoridade da Retícula & Lock-on:**
    - Mira real (`isTargetInCone`) governa a aquisição com vetores normalizados; alvos prioritários (Boss/Dourado/maior HP) só são travados se estiverem dentro do cone da mira.
    - Valores reais do código: `AIM_HINT_ANGLE = 7°`, `AIM_ACQUIRE_ANGLE = 7.5°`, `AIM_MAINTAIN_ANGLE = 12°`, `MAX_LOCK_RANGE = 90u`, `MIN_LOCK_RANGE = 10u`.
    - Screen-space layout de multi-locks em pixels CSS (1 central, 2 horizontal offset ±14px, 3+ anel orbital 16px) e descarte rigoroso de alvos atrás da câmera (`depth <= 0.1`) e fora do frustum.
  - **Miyu Assist & Multi-lock Empilhado:**
    - Orçamentos independentes BASE vs MIYU (Fox obedece caps normais; Miyu empilha multi-locks no mesmo alvo mirado).
    - Cooldown base de 9s, floor de 3s e delay inicial de ~6s pós-spawn.
    - Rádio `ability_assist` disparado exclusivamente com `miyuShotsFired > 0` após projétil real criado (0 falas em ready, charge, cancel ou lost target).
    - Projéteis e efeitos de muzzle nascem fisicamente na nave da Miyu; jogador Fox isolado visual e sonoramente quando apenas Miyu dispara.
  - **Retícula com Escala Progressiva:**
    - Expansão visual progressiva e contínua de 1.0 a ~1.45 por `chargeFrac`, com reset instantâneo para 1.0 ao disparar, cancelar, perder charge ou pausar/reiniciar.
  - **Arcade Draft Mode com 3 Modos:**
    - Modos `pause` (dt = 0), `slowmo` (janela de 1.5s a 0.18x retornando a 1.0x) e `normal` (tempo real 1.0x com VFX completo).
    - Migração retroativa automática de configurações legadas: `arcadeCardChoicePauses = true` migra para `pause`; `false` migra para `slowmo`.
    - Persistência e sincronização bidirecional no LocalStorage; preview ao vivo nas configurações totalmente isolada do gameplay real.
  - **Fog Volumétrico Multicamadas:**
    - Camadas volumétricas com envelope espacial (`insideEnvelope >= 0.40`), persistência interna e fade suave de saída.
  - **Documentação e Testes:**
    - Documento canônico: [`docs/progress/post-v09936-polish.md`](post-v09936-polish.md). Suíte: `src/lockon-miyu-reticle-fog.test.mjs` (7 blocos).

- **Tank no Spawn Natural (PR #16):**
  - **Integração no Ciclo Normal sobre Trilhos:**
    - Tank avaliado no seletor condicional do `game-loop.js` após a Horda com chance nominal de 5% (`TANK_SPAWN_CHANCE = 0.05`).
    - Probabilidade efetiva dependente do estado de erros acumulados ($S(w) = 0.12 + \min(0.20, w \times 0.04)$): inicial de ~1.43% ($w=0$), reduzindo até ~1.11% no cap da Sentinela ($w \ge 5$).
    - 100% de preservação das probabilidades nominais e efetivas de todos os 7 inimigos especiais pré-existentes.
  - **Orçamento e Limites de População:**
    - Ocupa 2 vagas (`TANK_POPULATION_WEIGHT = 2`, exige `room >= 2`).
    - Teto de no máximo 2 unidades simultâneas no trilho (`TANK_MAX_ACTIVE_ON_RAIL = 2`).
    - Restituição imediata das 2 vagas na destruição/despawn.
    - Bloqueio via `debugFlags.disableAutoSpawn` preservando comandos manuais de debug.
  - **Documentação e Testes:**
    - Documento canônico: [`docs/progress/tank-natural-spawn.md`](tank-natural-spawn.md). Suíte: `src/tank-spawn-integration.test.mjs` (6 blocos).
- **Overhaul do Inimigo Dourado e Esquadrão de Caças (v0.99.36):**
  - **Dourado como Comandante Agressivo:**
    - Faixas úteis de combate com intenção de pilotagem: aproximação acelerada (>75u), pressão tática e weaving contínuo (32u a 70u), e dash tático por proximidade (<28u) para cruzar a linha de mira do jogador.
    - Preservação integral do moveset essencial: chase, weaving, dash lateral, dash reativo a dano, teleporte reativo a dano com cooldown, disparo convencional, laser grande com telegraph circular, colisão corporal/ram, scaling de HP e áudios/VFX.
  - **Esquadrão de Caças Subordinados Persistentes:**
    - Mini-naves descontinuadas como projéteis homing; transformadas em entidades de combate persistentes, destrutíveis e com HP próprio (`6 + Math.floor((lvl - 1) * 0.5)`).
    - Formação orgânica com 6 slots tridimensionais ao redor do comandante com steering amortecido (sem snaps rígidos e sem teleportes).
    - Teto estrito por dificuldade (2/2/3/3/4/4/5/5/6) e teto de atacantes ofensivos simultâneos (1 a 3).
    - Reposição gradual por ciclo de dificuldade (~15s no nível 1 até ~8s no nível 9), limitada a 1 nave por ciclo, visual e com cue de áudio `golden_drone_launch`.
  - **Compositor de Ordens Táticas Contextuais:**
    - *Strafing Run:* caças mergulham contra o jogador, disparam projétil leve de energia, ultrapassam sem colidir suicidamente e curvam de volta ao comandante.
    - *Pinça (Pincer):* 2 caças abrem flancos assimétricos em vetores convergentes, mantendo rotas de fuga justas para o jogador.
    - *Cerco do Laser:* durante o telegraph de 2,5s do laser gigante, caças assumem flancos espaciais sem fechar todas as saídas.
    - *Fogo Coordenado:* sequência de disparos escalonada no tempo (intervalos de 280ms) intercalando caças e o comandante sem disparos simultâneos no mesmo frame.
  - **Teleporte e Desorganização:**
    - Ao teleporte do Dourado, os caças **não teleportam**; permanecem no espaço e entram em `DISORGANIZED`, voando fisicamente até a nova posição com aceleração de aproximação antes de reagrupar.
  - **Integração de Combate e Dano:**
    - Cada caça destruído conta como inimigo abatido no pipeline padrão (30 pontos, kill feedback, explosão visual sem cataclismo de boss).
    - Swirl Blast perfura múltiplos caças com dano volumétrico swept sem ser interrompido (`stopProjectile: false`), enquanto o Comandante interrompe o Swirl (`stopProjectile: true`).
    - Lock-on prioritário: Dourado permanece a prioridade máxima (maxHp 70+ e multi-locks infinitos), com caças atuando como alvos secundários com teto unitário.
    - Morte do Comandante limpa subordinados imediatamente sem deixar entidades órfãs.
  - **Testes Automatizados e Fuzz de Runtime:**
    - Criada suíte dedicada `src/golden-squadron.test.mjs` cobrindo 13 áreas funcionais (35.1 a 35.13).
    - Criado `tools/golden-squadron-runtime-fuzz.mjs` com simulação contínua de 3600 frames (60s a 60 fps) validando zero falhas, zero NaNs, zero violações de teto ou limite ofensivo e zero clumping persistente.

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
- **Concluídas Recentemente:**
  - [`docs/specs/completed/overhaul-dourado-esquadrao.md`](../specs/completed/overhaul-dourado-esquadrao.md)
- **Ativas:**
  - [`docs/specs/active/enemy-fsm-overhaul.md`](../specs/active/enemy-fsm-overhaul.md)
  - [`docs/specs/active/gravity-recovery-and-integration.md`](../specs/active/gravity-recovery-and-integration.md)
- **Prontas para Implementação:**
  - [`docs/specs/ready/mira-direcional-por-movimento.md`](../specs/ready/mira-direcional-por-movimento.md)
  - [`docs/specs/ready/cutscene-vida-perdida.md`](../specs/ready/cutscene-vida-perdida.md)
  - [`docs/specs/ready/boss-colmeia-mae.md`](../specs/ready/boss-colmeia-mae.md)
  - [`docs/specs/ready/evento-apagao-radar.md`](../specs/ready/evento-apagao-radar.md)
  - [`docs/specs/ready/obstaculos-novos.md`](../specs/ready/obstaculos-novos.md)

---

## 8. TESTES RECENTES
- `node src/selftest.mjs`: **34/34 suítes e contratos aprovados (100%), incluindo golden-squadron.test.mjs**
- `node src/golden-squadron.test.mjs`: **13/13 testes unitários aprovados cobrindo os contratos 35.1 a 35.13**
- `node tools/golden-squadron-runtime-fuzz.mjs`: **3.600 frames a 60 fps (60s), 12.778 expectativas avaliadas, 0 falhas, 0 NaNs, 0 violações de teto/ofensivo/slots**
- `node tools/wingman-runtime-fuzz-audit.mjs`: **39.755 expectativas, 0 falhas, 0 NaNs, 0 clumping persistente**
- `node tools/state-fuzz-audit.mjs`: **FUZZ_SUMMARY failures=0 (6/6 verificações de estresse)**
- `node tools/full-project-audit.mjs`: **AUDIT_SUMMARY errors=0 warnings=0 (118 arquivos de código)**
- `node tools/docs-link-audit.mjs`: **200 links relativos estritos verificados, 0 quebrados**

---

## 9. PRÓXIMO PONTO DE CONTINUIDADE
1. Revisão e abertura de Pull Request para a branch `feat/v0.99.36-golden-squadron`.
2. Após aprovação humana e merge, avançar para a próxima entrega: **Mira Direcional por Movimento** ([`docs/specs/ready/mira-direcional-por-movimento.md`](../specs/ready/mira-direcional-por-movimento.md)).
