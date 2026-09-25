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
  - `TESTADO AUTOMATICAMENTE: SIM | VALIDADO VISUALMENTE: SIM` (inspeção estática e validação gráfica via CDP em Edge real executadas em 1280×720, 1366×768, 1920×1080 e 1280×800).

---

### 2.5 PR #19 — Hotfix Bloqueador: ReferenceError THREE em setReticleCharge
* **Estado:** `MERGED EM MAIN`
* **Data do Merge:** 2026-09-24
* **Branch Original:** `fix/hud-reference-error-three`
* **Merge Commit:** `8b499bddbed11d00b70747ceef9ca621ed6f5414`
* **PR:** [PR #19](https://github.com/Ratuckk/Star-Anki/pull/19)
* **CI Run (PR):** `36026650851` (pass em 13s)
* **CI Run (main pós-merge):** `36031499957` (pass em 22s)
* **Problema Resolvido:**
  - `game-loop.js` invoca `hud.setReticleCharge(0, ...)` no loop principal a cada frame.
  - Em `src/hud-game.js`, `setReticleCharge()` utilizava `THREE.MathUtils.clamp(...)`, porém `THREE` não estava importado no módulo (já que a camada de HUD é desacoplada do Three.js).
  - Isso gerava `ReferenceError: THREE is not defined` no primeiro frame da partida em navegadores reais, quebrando a renderização contínua.
* **Correção:**
  - Substituição da dependência Three.js por clamp JavaScript puro: `const frac = Math.max(0, Math.min(1, Number(chargeFrac) || 0))`.
  - Adição de testes de regressão em `src/hud-double-stack.test.mjs` e `src/lockon-miyu-reticle-fog.test.mjs` garantindo ausência de chamadas a `THREE` nos módulos de HUD e validação do clamp nativo.
  - Validação completa em navegador real (Edge headless CDP) com zero exceções e zero erros de console durante gameplay ativo em resoluções 1280×720, 1366×768, 1920×1080 e 1280×800.

### 2.6 PR #20 — Pacote de Correção em Fases (0 a 5) + HUD Opção 4 (Coluna Esquerda Clássica)
* **Estado:** `MERGED EM MAIN`
* **Data do Merge:** 2026-09-25
* **Branch Original:** `feat/system-correction-phases`
* **Merge Commit:** `3028139552140bb6bf70c5384667d26ca75ad67f`
* **PR:** [PR #20](https://github.com/Ratuckk/Star-Anki/pull/20)
* **Baseline Original:** `main` @ `e5f68e93fee9b75a2edc8f219f3de08893524607`
* **Escopo e Fases:**
  - **Fase 0 — Protocolo de Auditoria e Debug de Dificuldade:**
    - Botões `-` e `+` de nível de dificuldade no painel de debug com faixa clampada em `[1, 9]`.
    - Override explícito de debug via `effectiveDifficultyLevel()` compartilhado por spawner, cálculo de bônus, inimigos especiais (Golden, Tank, Verme, Sussurro, Réplica) e HUD.
    - Zero falsificação de score e zero alteração de `wrongAnswerCount`.
    - Indicador de override discreto na HUD (`[DBG]`).
    - Testes dedicados em `src/debug-difficulty-override.test.mjs` e integração no `selftest.mjs`.
  - **Fase 1 — Rádio dos Aliados, Miyu, HUD e Timer Único:**
    - Rádio restrito estritamente a chatter trivial e falas de personalidade; abilities completamente desacopladas do rádio (nenhum diálogo ou painel de rádio emitido por habilidades).
    - Rate limit global autoritativo de no máximo 1 fala trivial a cada 6.0s no esquadrão inteiro.
    - Painel do rádio projetado em world-space abaixo da nave do jogador (`distToCam * 0.16`), com clamp de segurança de viewport e ocultação se atrás da câmera.
    - Ícones visuais 3D holográficos de ability acima da nave do aliado executor (duração 1.5s, halo com cor do piloto, pulso de escala e fade-out, sem gerar rádio).
    - Carga Compartilhada da Miyu condicionada cumulativamente a: estar viva/ativa, fora de cooldown, jogador carregando o tiro E com mira válida/lock ativo sobre inimigo elegível (zero disparo/cooldown mirando o vazio).
    - Remoção do cluster estático superior central (`top-center-cluster`): widgets de FOCO, SWIRL, KILL CHAIN agrupados à esquerda; retícula limpa no centro.
    - Timer único visível no canto superior direito (`hud-timer`), unificando contagem regressiva de combate normal, warnings e transições sem relógios concorrentes.
  - **Fase 2 — Dourado: Esquadrão Tático e Mega Laser Sustentado:**
    - Escalonamento de caças com bônus de aliados: `base (2..6) + 1 por aliado presente`, até o cap técnico estrito de 10.
    - 10 slots 3D de formação distintos e legíveis (sem compressão por módulo).
    - Nova malha de caça dourado em low-poly (fuselagem angular, duas asas, nariz e propulsores duplos emissivos).
    - Ordens táticas ativas no combate: *Strafing Run* (mergulho rasante com curva e retorno físico), *Pinça (Pincer)* (ataque por flancos convergentes com separação espacial), *Fogo Coordenado* (cadência escalonada entre 0.18s e 0.28s) e *Cerco do Laser* (posicionamento de contenção preservando rota de fuga).
    - Limite ofensivo escalonado: `baseOffensiveCap + ceil(allyBonus / 2)`.
    - Descontinuação do míssil/cone voador: substituição por Mega Laser com telegraph de 2.5s e feixe sustentado por 0.6s (envelope aditivo dourado com núcleo branco e swept cylinder hit com dano único).
    - Correção do scheduler de ordens (`lastOrderExecutedTime`) prevenindo inanição estatística de Pinça e transição correta do cerco do laser. Fuzz runtime validado em 7.200 frames com 0 falhas.
  - **Fase 3 — Tank + Verme + Hard-Pity de Spawn:**
    - Ambos elegíveis e ativos desde o nível 1.
    - Probabilidades nominais aumentadas: Verme (0.08 -> 0.12) e Tank (0.05 -> 0.08).
    - Hard-pity acumulado em tempo ativo de spawn: Verme aos 12.5s e Tank aos 20.0s, com resolução de conflito estocástica proporcional (`activeTime / limit`).
    - Tank: hitbox expandida para 4.48 (bounding box ~1.60x), nova geometria pesada (casco angular inclinado, proa blindada, sponsons laterais assimétricos, torre elevada com mira independente e propulsores duplos) e movimentação lateral ampla no trilho entre -10u e +10u.
    - Verme: extensão lateral total (span) inicial de exatamente 8.0u, anatomia com mandíbulas, 4 segmentos articulados com placas dorsais e cauda cônica, trajetória ondulante 3D (pitch/yaw/roll suaves) e amostragem histórica de caminho contínuo prevenindo snaps ou NaNs ao seccionar.
  - **Fase 4 — Sussurro + Réplica:**
    - Sussurro: silhueta alongada assimétrica com aletas laterais, núcleo interno pulsante e rim de distorção; visibilidade mínima garantida no cloak (opacidade >= 0.22 mesmo em fog denso e >= 0.38 normal); ciclo FSM perceptível (`CLOAKED_APPROACH` -> `REVEAL_TELEGRAPH` 0.7s -> `ATTACK` rajada espectral de 2 disparos a 0.18s / `SUMMON` com cap -> `EVADE` em arco lateral).
    - Réplica: silhueta de cópia corrompida da nave do jogador (fuselagem, asas com enflechamento, motores duplos, canhões nas pontas e aura glitch wireframe aditiva); perseguição com atraso histórico de ~0.4s; comportamento ofensivo real com `fireTimer` finito, telegraph de ~0.35s, rajada de 3 tiros a 0.12s e mira preditiva contra o jogador.
  - **Fase 5 — Validação Integrada, Regressão e Telemetria:**
    - Instrumentação de debug em `src/mount-game.js` e `src/hud-game.js`: exibição de dificuldade efetiva, esquadrão/ordens do Dourado, timers de pity de Tank/Verme e estados de Sussurro/Réplica.
    - Suíte completa de testes automatizados executada e verde (56 subtestes em `selftest.mjs`, suítes unitárias dedicadas, fuzz de wingmen de 3600 frames e integridade estrita de links de documentação).
    - Validação visual completa por captura de tela em runtime real (11 artefatos gerados cobrindo todos os requisitos visuais).
  - **HUD Opção 4 — Coluna Esquerda Clássica:**
    - Reestruturação em 4 zonas verticais com eixo X unificado (`--hud-left-x: clamp(18px, 3.2vw, 52px)`):
      1. `.hud-left-stats`: SCORE, STREAK, KILLS, COMBO.
      2. `.hud-left-resources`: 4 emblemas de habilidade (Falco, Peppy, Slippy, Miyu).
      3. `.hud-left-actions`: [D] FOCO, [Q] SWIRL, CADEIA DE ABATES.
      4. `.hud-left-vitals`: VIDAS, ESCUDO, VIDA, BARRA AUXILIAR.
    - Vitais posicionados estritamente abaixo dos comandos (`vitals.top >= actions.bottom + 12px`).
    - Anti-overlap: 0 colisões em todos os 6 pares de containers.
    - Ocupação lateral compacta: 25.7% (1280x720) e 17.8% (1920x1080), abaixo dos tetos contratuais de 34% e 30%.
    - Validação em runtime via Edge CDP (`tools/validate-hud-option4.mjs`) com screenshots capturadas para 1280x720, 1366x768, 1920x1080 e resize dinâmico.

---

## 3. DIRETRIZES DE MANUTENÇÃO DESTE DOCUMENTO

1. **Sincronização Contínua:** Toda PR substancial aprovada e mesclada na `main` deve receber uma subseção nesta página.
2. **Escopo Canônico:** Este documento é o registro histórico linear ativo das versões posteriores à v0.99.35. Arquivos específicos como [`tank-natural-spawn.md`](tank-natural-spawn.md) e [`post-v09936-polish.md`](post-v09936-polish.md) aprofundam subsistemas individuais e devem ser preservados lado a lado.
