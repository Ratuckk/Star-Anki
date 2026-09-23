# ESTADO ATUAL DO PROJETO — STAR-ANKI

> **Versão:** v0.99.35  
> **Branch:** `chore/reorganize-repository-docs` (base: `refactor/wingman-state-controller`)  
> **Base SHA:** `2fb2c959cf74266ddaa4456b74c3c7c64a27199f`  
> **Última atualização:** 2026-09-23  

---

## 1. IMPLEMENTADO RECENTEMENTE
- **Resolução e Reconciliação Total do `forgot.md` (v0.99.35):**
  - **Superchecagem de Inimigos (15 Achados P0/P1/P2 Resolvidos):**
    - #1 (P0): Boss 100% invulnerável na origem durante transições (`transitioning`/`dying`) bloqueando tiros, Swirl, AoE e colisões físicas, com HP travado no piso da fase.
    - #2 (P0): Decremento de esquadrão (`decrementSquadron`) centralizado e idempotente com flag `_squadronCounted`, eliminando contagem dupla entre dano letal e `removeEnemy`.
    - #5 (P0): Dano composto da Sentinela (2 casco / 4 escudo) preservado através de todo o pipeline até `player.takeDamage`.
    - #7 (P1): Mísseis teleguiados e Swirl abandonam imediatamente alvos em `fadingOut`, mortos ou sem mesh em cada frame.
    - #8 (P1): Campo magnético do Enxame-Ímã (`getMagnetSources`) desativa fontes em `fadingOut` e HP <= 0.
    - #9 (P2): Wobble visual (`_spawnWobbleOffset`) desacoplado da posição lógica e autoritativa do inimigo.
    - #10 (P2): Quaternion dos minicars do Dourado utiliza vetor de velocidade unitário normalizado.
    - #11 (P1): Projéteis inimigos comuns utilizam detecção contínua swept (`distanceToSegment`) imune a quedas de taxa de quadros.
    - #12 (P1): Força do campo do Enxame-Ímã recalibrada para 420 u/s² para física de projéteis atual.
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
  - **Draft Tático Superior no Arcade:**
    - Menu compacto com 3 chips no topo da tela, acionável via teclas 1, 2, 3 e clique.
    - Bullet-time curto (1.5s) para leitura tática, retornando à velocidade normal sem pausar o jogo.
    - Controles de voo e armas 100% ativos e desobstruídos durante a escolha.
  - **Volume Espacial e Bancos de Fog:**
    - Camada intermediária de estrelas (`midStars`) a 38u-145u com `fog: true` que responde à névoa da cena.
    - Bancos volumétricos 3D posicionados ao longo do percurso e na arena, integrados à condensação visual de materialização de inimigos.
- **Reorganização Estrutural do Repositório e Documentação:** Conclusão da migração de todos os 35 documentos legados e rascunhos para a arquitetura canônica de 7 categorias sob `docs/`.
- **Overhaul Completo do Tank:** Unidade pesada regular (75 pts, 2 vagas de população) com modelo 3D desacoplado para recoil físico, FSM de 9 estados, 3 ataques e reação a Stagger por Swirl.
- **Sincronização com Auditoria Adversarial (v0.99.31/v0.99.32):** Sanitização de storage, keybindings, decks e blur em `src/input.js`.

---

## 2. DECISÕES RECENTES
- [`ADR-0001`](../decisions/ADR-0001-lock-on-priority-strategy.md): Prioridade autoritativa do Lock-on foca Boss e maior maxHp sem desvio pelo retículo.
- [`ADR-0002`](../decisions/ADR-0002-wingmen-tactical-freedom.md): Tactical Freedom remove a coleira de regroup por distância dos Wingmen.
- [`ADR-0003`](../decisions/ADR-0003-tank-regular-heavy-unit.md): Tank é consolidado como unidade pesada regular (sem virar boss de arena).

---

## 3. PROBLEMAS CONHECIDOS
- *Nenhum bug crítico aberto no momento.* Todos os 10 cenários identificados na auditoria de wingmen foram testados e corrigidos.

---

## 4. IMPLEMENTAÇÕES PARCIAIS
- **FSM Universal de Inimigos (`docs/specs/active/enemy-fsm-overhaul.md`):** Fase 1 concluída (Blaster e Tank). Fases 2 em diante (MiniSwarm, Sentinela, Boss, Golden, Sussurro, Fragata, Verme, TimeEnemy, Réplica) permanecem pendentes.

---

## 5. AGUARDANDO VALIDAÇÃO
- Playtest humano de combate com esquadrão completo e cópia do log do `aiValidator` para conferência de telemetria em voo livre.

---

## 6. PENDÊNCIAS REAIS
- Consultar a lista consolidada e categorizada em [`docs/planning/BACKLOG.md`](../planning/BACKLOG.md).
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
- `node src/selftest.mjs`: **33/33 testes aprovados (100%)**
- `node tools/full-project-audit.mjs`: **AUDIT_SUMMARY errors=0 warnings=0 (102 arquivos de código auditados)**
- `node tools/state-fuzz-audit.mjs`: **FUZZ_SUMMARY failures=0 (6/6 testes de estresse aprovados)**

---

## 9. PRÓXIMO PONTO DE CONTINUIDADE
1. Concluir a revisão desta branch `chore/reorganize-repository-docs` e mesclá-la na base principal.
2. Iniciar a próxima entrega de gameplay aprovada: **Overhaul do Dourado e Esquadrão de Caças** ([`docs/specs/ready/overhaul-dourado-esquadrao.md`](../specs/ready/overhaul-dourado-esquadrao.md)) ou **Mira Direcional por Movimento** ([`docs/specs/ready/mira-direcional-por-movimento.md`](../specs/ready/mira-direcional-por-movimento.md)).
