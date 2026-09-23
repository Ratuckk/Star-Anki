# GRAVITY PROGRESS — REGISTRO DE OVERHAULS & SISTEMAS DE COMBATE

Este documento é o registro autoritativo das reformas arquiteturais e evoluções de combate conduzidas no **Star-Anki**.

---

## ÍNDICE
1. [Overhaul 1: Sistema de Foco / Lock-On & Swirl Blast](#1-overhaul-1-sistema-de-foco--lock-on--swirl-blast)
2. [Overhaul 2: Overhaul Completo do Tank — Unidade Pesada de Assalto](#2-overhaul-2-overhaul-completo-do-tank--unidade-pesada-de-assalto)

---

# 1. OVERHAUL 1: SISTEMA DE FOCO / LOCK-ON & SWIRL BLAST

## 1.1 Objetivo
Reformular a aquisição de alvos do sistema de foco/lock-on para cumprir a regra fundamental:
> **“Focar automaticamente a ameaça mais importante presente no combate: BOSS ATIVO > INIMIGO COM MAIOR HP MÁXIMO.”**

E sanar duas pendências históricas do **Swirl Blast**:
1. Dano adicional contra Boss equivalente a **30% do HP máximo original do boss** no impacto direto;
2. Hitbox própria volumétrica coerente com seu modelo visual de alta escala.

---

## 1.2 Regra Central de Prioridade
- **Prioridade 1 (Absoluta) — BOSS**: Se houver um boss ativo e válido (`e.kind === 'boss'`), ele é focado imediatamente, mesmo que existam inimigos com mais HP.
- **Prioridade 2 — MAIOR `maxHp`**: Na ausência de boss, vence o alvo com o maior `maxHp` autoritativo.
  - HP atual e porcentagens são ignorados (ex: `10 / 300` vence `100 / 100`).
  - A mira não governa a prioridade: o cone restrito de 6° foi removido da aquisição.
- **Desempate Determinístico**: Em caso de empate exato em `maxHp`, o menor `entity.id` vence de forma fixa para evitar oscilações de frame (*flicker*).
- **Estabilidade**: Travas já adquiridas nunca pulam de alvo quando surge alguém com mais HP. A prioridade atua na **aquisição de novas travas**.

---

## 1.3 Multi-Lock por Entidade
- **Boss (`BOSS_KIND`)**: Aceita travas ilimitadas até o orçamento de carga (`maxAllowed`). Todas as travas concentram-se no Boss.
- **Dourado (`GOLDEN_KIND`)**: Mantém multi-lock sem exceções artificiais; se tiver o maior `maxHp` sem boss, concentra as travas.
- **Horda (`HORDA_KIND`)**: Limite especial de até **2 travas**.
- **Inimigos Comuns**: Limitados a **1 trava** por entidade. O excesso de orçamento percorre os próximos alvos em ordem decrescente de `maxHp`.

---

## 1.4 Swirl Blast — Dano Percentual & Hitbox Volumétrica
- **Dano Adicional contra Boss**:
  - Constante: `SWIRL_BOSS_MAX_HP_DAMAGE_RATIO = 0.30` (em `src/enemies/index.js`).
  - Fórmula:
    $$\text{danoTotal} = \text{danoBase (6)} + \text{bônusGlobal} + (0.30 \times \text{boss.maxHp})$$
  - Exemplo: Boss com 100 `maxHp` sofre $6 + 30 = 36$ de dano.
  - Escudo do Boss: Destruído no contato, sem reflexão e sem aplicar dano duplo.
  - Fases e Transições: Respeita os pisos de HP (`BOSS_PHASES[phase + 1].enterAtHpFrac`) e invulnerabilidade durante transições (`transitioning`). O feedback de dano reflete o dano real aplicado.
  - **Dourado Excluído**: O Dourado não recebe os 30% adicionais (recebe apenas os 6 de base + bônus globais).
- **Hitbox Própria Volumétrica**:
  - Constantes:
    - `SWIRL_BLAST_BASE_HIT_RADIUS = 3.0`
    - `SWIRL_BLAST_HIT_RADIUS = SWIRL_BLAST_BASE_HIT_RADIUS * SWIRL_SCALE` (3.0u com escala 1.0×).
  - Colisão Swept:
    $$\text{distanceToSegment}(\text{alvo.pos}, \text{prevPos}, \text{currPos}) \le \text{alvo.hitRadius} + \text{SWIRL\_BLAST\_HIT\_RADIUS}$$
  - Cobre fielmente o corpo cortante luminoso (3.0u) sem estender acertos fantasmas para a aura (5.0u) ou cauda (6.0u).
  - Perfuração mantida (`piercedTargets`), destruição imediata de detritos e parada em Boss/Fragata.

---

## 1.5 Arquivos Modificados & Testes
- Arquivos: `src/combat/lockon.js`, `src/combat/projectiles.js`, `src/enemies/boss.js`, `src/enemies/golden.js`, `src/enemies/index.js`, `Docs/# Swirl Blast — Design & Plano de I.md`.
- Suíte: `src/combat-lockon-swirl.test.mjs` (20 testes automatizados, 100% passados).

---

# 2. OVERHAUL 2: OVERHAUL COMPLETO DO TANK — UNIDADE PESADA DE ASSALTO

## 2.1 Objetivo & Fantasia
Transformar o inimigo `TANK_KIND = 'tank'` de um cone estático genérico com HP inflado em uma verdadeira:
# UNIDADE PESADA DE LINHA DE FRENTE

> **“Uma nave pesada de assalto que ocupa espaço, estabiliza seu armamento e força o jogador a respeitar sua linha de tiro, mas continua sendo apenas uma unidade dentro da composição normal de inimigos.”**

### O que o Tank NÃO é:
- NÃO é boss nem miniboss de arena;
- NÃO inicia All-Range nem cutscene;
- NÃO possui barra de vida exclusiva nem fases com invulnerabilidade;
- NÃO limpa outros inimigos ao morrer nem interrompe o fluxo normal.

---

## 2.2 Modelo Visual 3D (`THREE.Group`) & Hitbox
Substituição completa do cone simples por uma hierarquia procedural de massas pesadas em `src/enemies/tank.js`:
- **Hierarquia Visual**:
  - `root` (`THREE.Group`): Mantém a posição autoritativa global da nave e âncora da hitbox.
  - `visualGroup` (`THREE.Group`, filho de `root`): Recebe impulsos de **recoil** ao disparar (deslocamento ao longo de -Z) e retorna suavemente com amortecimento exponencial (`THREE.MathUtils.damp`), sem jamais perturbar a hitbox da raiz.
- **Componentes Estruturais**:
  - Fuselagem central em prisma escuro blindado (`tankHullGeometry`, material metálico escuro).
  - Canhão de cerco frontal cilíndrico de grande calibre (`tankCannonGeometry`).
  - Muzzle glow frontal com material emissivo ativado durante brace/telegraph.
  - Módulos laterais duplos (sponsons de blindagem) conferindo silhueta de peso e largura.
  - Placas externas destacáveis na cor de identidade `TANK_COLOR = 0xff9100`.
  - Thrusters duplos traseiros com bocais incandescentes.
- **Hitbox**:
  - `TANK_HIT_RADIUS = 2.80` (proporcional ao corpo de 2.4 de largura por 3.2 de comprimento).
  - `disposeTank()`: Liberação completa e centralizada de todas as geometrias e materiais para zero vazamento de memória.

---

## 2.3 Máquina de Estados (FSM) com 9 Estados
Preserva o motor leve `createStateMachine` com os estados formais:

```text
SPAWNING ──► ENGAGED ──► BRACING ──► TELEGRAPHING ──► ATTACKING ──► RECOVERY ──► REPOSITIONING
                ▲          ▲              ▲                         │                   │
                │          │              │                         ▼                   │
                │          └──────────────┴───────────────── STAGGERED                  │
                │                                                   │                   │
                │                                                   ▼                   │
                └───────────────────────────────────────────────────┴───────────────────┘
                                                (apenas no trilho após 5 ciclos) ──► DISENGAGING
```

1. **`SPAWNING`**: Respeita tempo de materialização e invencibilidade inicial; transiciona para `ENGAGED`.
2. **`ENGAGED`**: Estado neutro de combate. Mantém standoff, reorienta-se para o jogador e aguarda o cooldown entre ações (D1: 2.8s até D9: 2.0s).
3. **`BRACING`**: Estabilização prévia a ataques de artilharia. Reduz a velocidade a um quase-repouso, firma os estabilizadores e alinha a mira. Duração por dificuldade: D1–2: 0.70s, D3–4: 0.65s, D5–6: 0.60s, D7–8: 0.55s, D9: 0.50s. Permanece totalmente vulnerável a dano.
4. **`TELEGRAPHING`**: Emite aviso visual (brilho no bocal do canhão) e sinal sonoro específico para o ataque sorteado.
5. **`ATTACKING`**: Execução do ataque escolhido (Siege, Burst ou Ram).
6. **`RECOVERY`**: Período de vulnerabilidade pós-ataque. Incrementa ciclos (`attackCycles`). Se HP < 33%, a recuperação é 10% mais veloz. Sorteia reposicionamento tático.
7. **`REPOSITIONING`**: Desloca-se lateralmente para um novo ponto seguro na tela com aceleração controlada.
8. **`STAGGERED`**: Interrupção forçada provocada pelo impacto do Swirl Blast (0.45s). Cancela a carga de armas ativa e ativa cooldown de 2.5s contra stun-lock.
9. **`DISENGAGING`**: Retirada tática pesada no trilho após 5 ciclos completos de ataque. Inclina para cima e acelera lateralmente sem disparar nem mirar, despawnando com segurança. Na arena, o Tank nunca foge por contagem.

---

## 2.4 Arsenal Ofensivo
1. **Siege Shot (Canhão de Cerco)**:
   - Projétil pesado de artilharia: `speed = 34 u/s`, `hitRadius = 2.4`, `maxRange = 100`, `damage = 2`, `powerLevel = POWER_LEVEL_HIGH_IMPACT (4)`.
   - Gera recuo visual severo (-1.35u) no sub-grupo `visualGroup`.
   - Som: `tank_siege_fire`.
2. **Suppression Burst (Rajada de Supressão)**:
   - Rajada sequencial de 2 tiros (D1–D4) ou 3 tiros (D5–D9) com intervalo de `TANK_BURST_SHOT_INTERVAL = 0.22s`.
   - `speed = 40 u/s`, `hitRadius = 1.7`, `damage = 1`, `powerLevel = POWER_LEVEL_GUIDED_OR_LARGE (2)`.
   - Cada disparo re-mira a posição atual do jogador no momento exato do tiro, sem teleguiamento posterior.
   - Som: `tank_burst_fire`.
3. **Heavy Ram (Investida de Aríete)**:
   - Ataque situacional acionado apenas em curta distância (`distToPlayer < 13u` e jogador claramente à frente).
   - Telegraph com ignição de propulsores traseiros (0.55s), som `tank_ram_charge`.
   - Investida a `TANK_RAM_SPEED = 30 u/s` por até 0.55s com taxa de giro restrita.
   - Não duplica dano (utiliza o pipeline físico normal da nave).
   - Recovery longo de 1.10s e 100% de chance de reposicionamento.

---

## 2.5 Movimentação & Standoff
- **Modo Trilho (Rail)**:
  - Standoff alvo: `TANK_RAIL_STANDOFF_TARGET = 42u` (faixa segura de 32 a 52u).
  - Deslocamento lateral pesado: `TANK_RAIL_LATERAL_SPEED = 5.5 u/s` e aceleração `TANK_RAIL_LATERAL_ACCEL = 8.0 u/s²`.
  - Sem teletransporte, sem zigue-zague espasmódico e sem espelhar o retículo do jogador.
- **Modo Arena (All-Range)**:
  - Standoff ideal: `TANK_ARENA_STANDOFF = 34u` (tolerância de 5u).
  - Longe (>39u): aproximação lenta. Perto (<29u): impulso reverso (*reverse thrust*). Faixa ideal (29–39u): strafe/órbita pesada.
  - Taxa de curva restrita: `TANK_ARENA_TURN_RATE = 1.15 rad/s`. Permite que o jogador contorne e flanqueie o Tank.

---

## 2.6 Limiares Visuais de Dano (Sem Fases de Boss)
- **>66% HP**: Casco intacto.
- **33–66% HP**: Casco danificado. Deslocamento visual das placas de blindagem, fissuras e som mecânico `tank_armor_break`.
- **<33% HP**: Estado crítico. Núcleo exposto com tremor mecânico, alerta sonoro `tank_critical` e agressividade levemente aumentada (recuperação 10% mais rápida).

---

## 2.7 Morte Pesada & Recompensas
- **Duração da Morte**: `TANK_DEATH_DURATION = 0.65s` (em `src/enemies/tank.js` e `deathDurationFor`).
- Sequência: Contração com micro-explosões e faíscas internas, culminando na detonação do reator com o som `tank_death` e anéis de choque.
- **Pontuação**: `TANK_KILL_BONUS = 75` pontos (em `killPointsFor`).
- **Orçamento de População**: Ocupa **2 vagas** em `getEnemyCount()`.

---

## 2.8 Tabela de Dificuldade D1–D9

| Nível | HP | Brace | Cooldown Ação | Tiros Burst | Heavy Ram | Recovery Base |
| :---: | :-: | :---: | :-----------: | :---------: | :-------: | :-----------: |
| **D1–D2** | 15–17 | 0.70s | 2.8s | 2 | Não | 0.80s |
| **D3–D4** | 18–20 | 0.65s | 2.6s | 2 | Sim | 0.76s |
| **D5–D6** | 21–23 | 0.60s | 2.4s | 3 | Sim | 0.72s |
| **D7–D8** | 24–26 | 0.55s | 2.2s | 3 | Sim | 0.68s |
| **D9** | 27 (cap) | 0.50s | 2.0s | 3 | Sim | 0.64s |

---

## 2.9 Arquivos Modificados & Testes
- Arquivos:
  - `src/enemies/tank.js` (reescrita completa do modelo, FSM e ataques)
  - `src/enemies/state-machine.js` (novos estados `BRACING`, `REPOSITIONING`, `STAGGERED`)
  - `src/enemies/index.js` (pontuação 75, 2 vagas de população, stagger por Swirl, morte pesada, som customizável)
  - `src/audio-cues.js` (11 novas Sound Cues registradas)
  - `src/hud-game.js` (marcador tático `plus` para o Tank no minimapa)
  - `src/tank.test.mjs` (suíte dedicada de 13 testes unitários)
  - `src/selftest.mjs` (integração da suíte ao runner global)
- Validação: Todos os 33 testes automatizados executados e aprovados com 100% de sucesso.

---

# 3. SINCRONIZAÇÃO COMPLETA DO GITHUB & AUDITORIA DE BUGS (v0.99.31 / v0.99.32)

## 3.1 Escopo da Sincronização
Integradas todas as alterações remotas do GitHub provenientes de:
- `origin/main` (v0.99.30 e v0.99.31): Estabilidade de vôo dos aliados, 120 falas de rádio distribuídas, novo sistema de spawn lifecycle e reforços do Sussurro, feedback de dano orbital e v0.99.31.
- `origin/audit/full-project-bughunt-v09932`: Ferramentas adversariais de auditoria (`tools/full-project-audit.mjs`, `tools/state-fuzz-audit.mjs`, `tools/browser-smoke-audit.mjs`) e sanitização de configurações persistidas (`src/settings.js`).
- Preservação integral do trabalho local: Overhaul de Foco/Lock-On, Swirl Blast e Overhaul Completo do Tank.

---

## 3.2 Bugs Detectados e Corrigidos Durante a Sincronização

### 1. `tools/state-fuzz-audit.mjs` — Falha de setter no `navigator` do Node 21+
- **Sintoma**: `TypeError: Cannot set property navigator of #<Object> which has only a getter` em versões recentes do Node.js.
- **Causa**: `globalThis.navigator` possui apenas getter nativo em Node 21+.
- **Correção**: Implementada definição segura via `Object.defineProperty` e fallback defensivo com `try/catch`.

### 2. `src/keybindings.js` — Esquema corrompido em `star-anki-keybindings`
- **Sintoma**: Se o `localStorage` contivesse tipos corrompidos (ex: `moveLeft: null`, `fire: 'KeyQ'`, `buttons.fire: 'bad'`), `getBindings()` gerava estruturas inválidas que quebravam o loop de input.
- **Correção**: Sanitização estrita de `actions` garantindo sempre arrays de strings com fallback para `DEFAULT_ACTIONS`, e de `gamepad` garantindo inteiros válidos para eixos e botões.

### 3. `src/storage.js` — Falha não tratada de escrita em `saveHistory`
- **Sintoma**: Exceção não capturada quando `localStorage.setItem` falha por cota excedida ou restrição de segurança no navegador.
- **Correção**: Adicionado bloco `try/catch` com retorno booleano gracioso.

### 4. `src/storage.js` — Corrupção de entrada em `recordResult`
- **Sintoma**: `TypeError: Cannot create property 'acertos' on string` se uma entrada do histórico contivesse formato inválido ou não fosse objeto.
- **Correção**: Validação de tipo do objeto `rawEntry` com fallback defensivo para `{ acertos: 0, erros: 0, ultimaVez: null }`.

### 5. `src/decks.js` — Quebra ao listar baralhos com entradas nulas ou sem texto
- **Sintoma**: `TypeError: Cannot read properties of undefined (reading 'split')` em `listDecks` ao encontrar entrada corrompida ou nula.
- **Correção**: Filtro de objetos válidos em `readAll()`, validação de propriedades em `describe(rawEntry)` e garantia de que `text` seja string.

### 6. `src/input.js` — Vazamento de borda de tecla ao perder foco (`blur`)
- **Sintoma**: Pressionar uma tecla de comando/escape imediatamente antes de perder foco (Alt+Tab) mantinha a borda em `pressedThisFrame`, acionando a ação ao retornar à janela mesmo que a tecla já estivesse solta.
- **Correção**: `clearKeys()` agora limpa tanto `keys` quanto `pressedThisFrame`.

### 7. Compatibilização de Testes com o Novo Spawn Lifecycle
- **Sintoma**: Testes unitários com spawn imediato falhavam ao tentar atingir inimigos em fase de materialização (`isEnemySpawnPending`).
- **Correção**: Ajuste explícito de `spawnPhase = null` nos testes de colisão e dano direto.

---

## 3.3 Resultados Finais de Validação
- `tools/full-project-audit.mjs`: **0 erros, 0 avisos** (101 arquivos de código auditados, 219 arquivos totais).
- `tools/state-fuzz-audit.mjs`: **0 falhas** (todas as 6 sondas de estresse de schema, quota e blur passaram com sucesso).
- `src/selftest.mjs`: **33 testes aprovados, 0 falhas**.
- `hud-speedlines.test.mjs`, `damage-feedback.test.mjs`, `wingman-flight-stability.test.mjs`, `spawn-lifecycle.test.mjs`: **Todos OK**.

---

# 4. OVERHAUL 3: CAÇA EXTENSIVA DE BUGS DOS WINGMEN (SUBSISTEMA DE ALIADOS)

## 4.1 Escopo da Auditoria
Auditoria profunda e caça minuciosa por bugs de gameplay, máquina de estados, sincronização espacial e edge-cases nos módulos do subsistema de aliados:
- `src/combat/wingmen.js`
- `src/combat/wingman-state-controller.js`
- `src/combat/wingman-navigation.js`
- `src/combat/wingman-flight-stability.js`
- `src/combat/wingman-formation-separation.js`
- `src/combat/wingman-radio.js`
- `src/combat/wingman-radio-callresponse.js`
- `src/combat/wingman-world-radio.js`
- `src/combat/damage-orbit-tracker.js`
- Integração com `src/combat/index.js`, `src/game-loop.js` e `src/player.js`.

---

## 4.2 Os 10 Bugs Identificados para Resolução

### 1. (CRÍTICO) Mutação In-Place de Posição 3D do Wingman via `v.worldPos.project(camera)` em `getVitalSnapshots`
- **Causa**: `getVitalSnapshots()` retornava `worldPos: w.mesh.position` direto por referência sem `.clone()`. Em `game-loop.js`, ao renderizar as barras de vitais de aliados feridos, chamava `v.worldPos.project(camera)`. No Three.js, `Vector3.project` altera o vetor original in-place.
- **Efeito**: A cada frame de dano ou regeneração de escudo, o caça aliado era instantaneamente deformado para coordenadas NDC (`[-1, 1]`) em frente à câmera, quebrando a física de voo.

### 2. (ALTO) Bloqueio de Respawn e Recuperação por 5 Segundos de Retirada (`retreating`)
- **Causa**: Quando um wingman chega a 0 HP, ele entra em `retreating` por 5s antes de `removeMember` ser chamado. `spawnMember(id)` checava `if (activeWingmen.some(w => w.profile.id === profile.id)) return null`, impedindo recuperação via cartas Roguelike enquanto a nave recuava visualmente.

### 3. (ALTO) Dessincronia de `getWingmanCount()` com Aliados em Retirada
- **Causa**: `getWingmanCount()` retornava `activeWingmen.length` cru, sem filtrar `w.state !== 'retreating'`, gerando bônus de spawn de inimigos fantasmas no game loop e exibição incorreta no HUD.

### 4. (ALTO) Race Condition: `markWingmanDown` Atrasado em 5s Poluindo Pool Roguelike
- **Causa**: `combat/index.js` só invocava `player.markWingmanDown` ao término dos 5s de retreat. Se o jogador respondesse uma pergunta nesse ínterim, cartas de pilotos abatidos ainda eram ofertadas e a carta de recuperação 'wingman' não aparecia.

### 5. (MÉDIO) Falas Fantasmas no Rádio de Naves em Retirada
- **Causa**: `player_low_health`, `boost_used`, `charged_shot_used`, `triggerPlayerTookDamage`, abates de laser e pool de `activeRadioPilotIds` não filtravam `retreating`.

### 6. (MÉDIO) Glitch Visual: `auxShieldVisual` e Flash Crítico Congelados na Retirada
- **Causa**: O bloco `w.state === 'retreating'` chamava `continue` antes das linhas que ocultavam o escudo auxiliar e restauravam os materiais da nave.

### 7. (MÉDIO) Falco Chain Ram Alvejando Inimigos Inválidos e Ignorando Dourados
- **Causa**: Laço iterava sobre `enemies.getAlive()` cru (sem dourados e sem checar `isWingmanCombatTargetReady`). Efeito de explosão utilizava posição desatualizada.

### 8. (MÉDIO) `isWingmanCombatTargetReady` Ignorando `spawnPhase` e `hp <= 0`
- **Causa**: Falta de checagem explícita de `target.spawnPhase` e integridade zerada quando `readyTargets` não é fornecido.

### 9. (MÉDIO) Vazamento de Estado em `clearSquadron()`
- **Causa**: `clearSquadron()` não resetava modos de comando (`squadronCommandMode`), timers de focus nem multiplicadores de cooldown persistidos em `abilityCooldownMultByProfileId`.

### 10. (LEVE / ESTABILIDADE) Alocações de Vetores em Hot Loops e Possível NaN
- **Causa**: Criação de vetores a cada tiro de suporte (`tryFireSupport`) e normalização desprotegida em `fireMiyuBoombuster`.
