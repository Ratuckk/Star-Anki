# REGISTRO CRONOLÓGICO DE IMPLEMENTAÇÃO — PÓS-v0.99.35 (v0.99.36 EM DIANTE)

> **Documento Canônico:** `docs/progress/PROGRESSO_v0.99.36-em-diante.md`  
> **Faixa de Versões:** v0.99.36 até o presente  
> **Status do Arquivo:** ATIVO (não mover para `archive/` enquanto a faixa estiver em desenvolvimento)  
> **Convenção de Estados:**
> - `IMPLEMENTADO LOCALMENTE`: Código escrito e testado na máquina local, branch dedicada criada, sem PR aberta.
> - `EM PR`: Pull Request publicado no repositório remoto com CI em execução ou aprovada, aguardando revisão humana.
> - `MERGED EM MAIN`: Pull Request revisado e mesclado formalmente na branch `main`.
>
> *(Nota: estes três estados são mutuamente exclusivos e nunca devem ser tratados como equivalentes).*

---

## 1. MARCO v0.99.36 — SOBREVOO GERAL

A versão **v0.99.36** consolida a reconstrução e modernização tática de três grandes subsistemas de combate e infraestrutura do jogo:
1. Reconstrução completa da Anomalia Dourada como Comandante Agressivo com Esquadrão de Caças Subordinados persistentes (PR #15).
2. Integração do Tank na rotina natural de spawn sobre trilhos com modelo estocástico dinâmico e controle de população (PR #16).
3. Pacote abrangente de polimento em Lock-on, assistência da Miyu, retícula com escala progressiva, três modos de draft no Arcade e fog volumétrico multicamadas (PR #17).

---

## 2. HISTÓRICO CRONOLÓGICO DE ENTREGAS

### 2.1 PR #15 — Overhaul do Dourado e Esquadrão de Caças Persistentes
* **Estado:** `MERGED EM MAIN`
* **Data:** 2026-09-24
* **Branch Original:** `feat/v0.99.36-golden-squadron`
* **Merge Commit:** `3c014a74f56dfd90428c6370372d90527f5c9716`
* **CI Run:** `35946376454` (pass)
* **Principais Alterações:**
  - **Comandante Dourado:** Preservação integral do moveset de boss/mini-chefe com 3 faixas táticas claras: aproximação acelerada (>75u), pressão e weaving contínuo (32u–70u) e dash de corte (<28u). Scaling de HP baseado no nível de dificuldade real.
  - **Caças Subordinados:** Descontinuação dos antigos mini-drones projéteis; substituição por caças físicos subordinados com HP próprio (`6 + floor((lvl-1)*0.5)`), navegando em formação 3D de até 6 slots ao redor do líder via steering amortecido.
  - **Ordens Táticas:** Quatro ordens de combate coordenadas: *Strafing Run* (mergulho rasante com disparo leve e recuperação), *Pinça (Pincer)* (ataque duplo em flancos convergentes com separação espacial), *Cerco do Laser* (posicionamento de contenção durante o mega laser) e *Fogo Coordenado* (disparos sincronizados respeitando o teto de atacantes).
  - **Dinâmica de Reposição e Teleporte:** Reposição gradual por ciclo de dificuldade (1 caça por vez, com cue sonoro `golden_drone_launch`). Na ativação de teleporte do comandante, os caças entram em desorganização tática temporária (`DISORGANIZED`) e viajam fisicamente até o novo ponto sem teleporte instantâneo.
* **Testes Adicionados:** `src/golden-squadron.test.mjs` (16 subtestes / 16 assertions cobrindo mapeamento, spawn, dano, reposição, limites de ataque, ordens e determinismo).
* **Documentação:** Detalhado em [`CURRENT.md`](CURRENT.md).

---

### 2.2 PR #16 — Integração do Tank no Spawn Natural do Trilho
* **Estado:** `MERGED EM MAIN`
* **Data:** 2026-09-24
* **Branch Original:** `feat/tank-natural-spawn`
* **Merge Commit:** `327bf50b24a8c5c1a2d1e32dcec230e360e08bc5`
* **CI Run:** `35997550149` (pass)
* **Documento Canônico:** [`tank-natural-spawn.md`](tank-natural-spawn.md)
* **Principais Alterações:**
  - **Seleção no Trilho:** O Tank (unidade pesada regular consolidada pelo ADR-0003) foi inserido no seletor condicional do loop de jogo com chance nominal de 5% (`TANK_SPAWN_CHANCE = 0.05`), avaliado após a Horda.
  - **Modelo Estocástico Dinâmico:** Probabilidade real modulada pelo estado de erros acumulados do jogador ($S(w) = 0.12 + \min(0.20, w \times 0.04)$), variando de ~1.43% ($w=0$) a ~1.11% ($w \ge 5$).
  - **Orçamento Populacional:** Ocupa 2 vagas de população (`TANK_POPULATION_WEIGHT = 2`, exigindo `room >= 2`), com limite de no máximo 2 Tanks ativos simultaneamente no trilho (`TANK_MAX_ACTIVE_ON_RAIL = 2`).
  - **Higiene e Compatibilidade:** Bloqueio automático de spawn quando `debugFlags.disableAutoSpawn` estiver ativo, preservando spawns manuais. Restituição imediata de vagas ao morrer ou despawnar.
* **Testes Adicionados:** `src/tank-spawn-integration.test.mjs` (6 blocos cobrindo alcançabilidade, bloqueio por flag, orçamento populacional, teto simultâneo e não-regressão de inimigos especiais).

---

### 2.3 PR #17 — Pacote de Polimento: Lock-on, Miyu Assist, Retícula, Arcade e Fog
* **Estado:** `MERGED EM MAIN`
* **Data:** 2026-09-24
* **Branch Original:** `fix/lockon-miyu-arcade-fog-polish`
* **Merge Commit:** `bdd8a879651ff4da411ec38a4c99745d9a93683f`
* **CI Run:** `36001243157` (pass)
* **Documento Canônico:** [`post-v09936-polish.md`](post-v09936-polish.md)
* **Principais Alterações:**
  - **Lock-on e Retícula:** A mira governa estritamente a aquisição de travas (`isTargetInCone`); alvos de alta prioridade (Boss/Dourado/maior HP) não roubam trava se estiverem fora do retículo do jogador (`AIM_ACQUIRE_ANGLE = 7.5°`, `AIM_MAINTAIN_ANGLE = 12°`, alcance 10u–90u). Descarte rigoroso de alvos fora do frustum ou atrás da câmera.
  - **Miyu Assist:** Capacidade de empilhar multi-locks no mesmo alvo focado pelo jogador. Cooldown de 9s (floor de 3s e delay inicial de 6s pós-spawn). Disparo sonoro do rádio `ability_assist` condicionado estritamente à criação real de projéteis. Projéteis e muzzles originados fisicamente na nave da Miyu.
  - **Retícula com Escala Progressiva:** Expansão visual contínua de 1.0 a ~1.45 proporcional à carga (`chargeFrac`), com reset instantâneo a 1.0 ao disparar, cancelar ou pausar.
  - **Arcade Card Draft Mode:** Três modos configuráveis (`pause`, `slowmo` a 0.18x por 1.5s, e `normal` em tempo real 1.0x), com migração automática retroativa de schemas antigos no LocalStorage.
  - **Fog Volumétrico:** Camadas volumétricas com envelope espacial (`insideEnvelope >= 0.40`), persistência interna e desvanecimento suave.
* **Testes Adicionados:** `src/lockon-miyu-reticle-fog.test.mjs` (7 blocos integrados ao selftest).
* **Pendência Declarada:** Homologação visual dos efeitos em tela real.

---

### 2.4 PR #18 — HUD Double Stack Architecture & Authoritative Seams
* **Estado:** `MERGED EM MAIN`
* **Data do Merge:** 2026-09-24
* **Branch Original:** `feat/score-hud-double-stack`
* **Merge Commit:** `7a6d10354486578bc1ba0d606b1d84a9410083af`
* **PR:** [PR #18](https://github.com/Ratuckk/Star-Anki/pull/18)
* **CI Run (PR):** `36014254094` (pass em 18s)
* **CI Run (main pós-merge):** `36017039624` (pass em 18s)
* **Principais Alterações:**
  - **Pilha Esquerda (Score + Métricas + Combo):**
    - Score autoritativo (`session.score`).
    - Sub-linha de métricas com pills: `STREAK` autoritativo de respostas consecutivas corretas (`session.correctStreak`, incrementado no acerto de perguntas normais, de chefe e da pergunta-bônus da Anomalia Dourada via `updateCorrectStreak`; resetado em erro/timeout) e `KILLS` acumulativo oficial (`session.totalKills` via `recordKills`, imune a despawns, hits não-letais e com guarda contra contagem dupla na morte de Boss/Dourado).
    - Multiplicador de Combo com barra neon abaixo da métrica.
    - Deslocamento horizontal desacoplado do cluster vital através do design token responsivo `--hud-left-stack-x: clamp(238px, 17vw, 290px)`.
  - **Pilha Direita (Mission Time + Nível):**
    - `MISSION TIME` com cronômetro progressivo real (`MM:SS`) medindo tempo efetivo em gameplay (`session.missionTimeMs`). Congelamento estrito governado pelo seam puro `shouldAdvanceMissionTime` durante pausas, card draft e cutscenes; avanço sempre por `rawDt * 1000` (imune a distorções de slow-motion do Arcade). Ticks decorativos estáticos.
    - `NÍVEL` com nível de dificuldade autoritativo em dois dígitos (`formatDifficultyLevel`).
    - `RANK` omitido do DOM (sem placeholders ou fórmulas arbitrárias).
  - **Cluster Superior Central (Wingmen + Swirl + Combate):**
    - Hexes dos 4 wingmen centralizados horizontalmente no topo.
    - Linha secundária de combate contendo Ordem de Esquadrão [D], widget do Swirl Blast [🌀] e Cadeia de Abates [KILL CHAIN], estável e desacoplada do Score.
  - **Radar / Minimapa:**
    - Oculto no modo rail (`hud.setMinimap(false)` e regra `[hidden] { display: none !important; }`), visível em arenas e chefes (`shouldDisplayMinimap`).
    - Reposicionado na lateral intermediária (`top: clamp(28%, 32%, 35%); right: clamp(16px, 2vw, 24px)`). Limpeza garantida da classe `alert` na saída da arena.
  - **Consolidação de API (Abordagem B):**
    - Fluxo consolidado via `hud.setStatus(...)` e formatadores puros compartilhados: `formatMissionTime`, `formatComboMultiplier` e `formatDifficultyLevel`. Métodos granulares mortos removidos.
* **Testes Adicionados:** `src/hud-double-stack.test.mjs` (7 blocos cobrindo streak normal e dourado, pipeline de kills, matriz de pausas de tempo, minimapa rail vs arena e checagens estáticas de layout).
* **Divergências Conscientes do Mockup:**
  1. *Rank:* Omitido do DOM por ausência de fórmula autoritativa balanceada na arquitetura atual.
  2. *Ticks de Mission Time:* Mantidos estáticos/decorativos sem countdown regressivo ou alertas críticos fictícios.
  3. *Linha Central de Combate:* Swirl e Kill Chain reunidos logo abaixo dos wingmen para estabilidade de layout.
* **Pendência Declarada:**
  - `TESTADO AUTOMATICAMENTE: SIM | VALIDADO VISUALMENTE: NÃO` (inspeção estática de tokens e AST aprovada; validação visual humana recomendada nas resoluções 1280×720, 1366×768 e 1920×1080).

---

## 3. DIRETRIZES DE MANUTENÇÃO DESTE DOCUMENTO

1. **Sincronização Contínua:** Toda PR substancial aprovada e mesclada na `main` deve receber uma subseção nesta página.
2. **Escopo Canônico:** Este documento é o registro histórico linear ativo das versões posteriores à v0.99.35. Arquivos específicos como [`tank-natural-spawn.md`](tank-natural-spawn.md) e [`post-v09936-polish.md`](post-v09936-polish.md) aprofundam subsistemas individuais e devem ser preservados lado a lado.
