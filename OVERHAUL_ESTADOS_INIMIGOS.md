# Documento de Implementação: Overhaul Completo dos Estados dos Inimigos (FSM) — Star-Anki

> **Público-alvo deste documento:** Engenheiro de Software / IA de Código.  
> **Objetivo:** Executar a refatoração e overhaul estrutural completo de todos os inimigos do Star-Anki, substituindo o loop monolítico e as flags booleanas soltas por uma **Máquina de Estados Finita (FSM) Hierárquica, Modular e Desacoplada**, garantindo jogabilidade estilo *Star Fox 64*, telemetria limpa e integração nativa com o sistema de Sound Cues (`src/audio-cues.js`).  
> **Regra Crítica de Segurança:** Zero regressões na API pública consumida por `src/combat/index.js`, `src/combat/projectiles.js`, `src/combat/wingmen.js` e `src/game-loop.js`. Todos os testes existentes em `src/selftest.mjs` devem continuar passando 100%.

---

## 1. Visão Geral da Arquitetura

### 1.1 O Problema Atual
1. **Loop Monolítico em `src/enemies/index.js` (~1.213 linhas):** O método `updateEnemies()` contém centenas de linhas de condicionais `if-else if` aninhados que misturam física, detecção de colisão, despacho de tiro, animações e remoção.
2. **Flags Booleanas Soltas e Concorrentes:** Inimigos como o `Blaster` não possuem estados formais, dependendo de variáveis booleanas e numéricas desarticuladas (`enemy.disengaging`, `enemy.tumbleSpin`, `enemy.wingBroken`, `enemy.recoilZ < 0`, `enemy.shotsFired >= 4`).
3. **Incompatibilidade Entre Inimigos:** `MiniSwarm` usa `enemy.swarmState`, `Sentinela` usa `enemy.state`, `Boss` usa `enemy.phaseIndex` + timers isolados de laser, e outros tipos não possuem estado explícito.
4. **Acoplamento entre Modos (Trilho vs Arena):** Funções de movimentação separadas e redundantes (`updateBlasterRailMovement` vs `updateBlasterArenaMovement`).

### 1.2 A Solução Proposta
1. **Módulo de FSM Universal (`src/enemies/state-machine.js`):** Um motor de FSM ultraleve, com alocação zero por frame e ciclo padronizado: `onEnter(enemy, ctx, payload)`, `update(enemy, dt, ctx)` e `onExit(enemy, ctx)`.
2. **Padrão Controller por Arquétipo:** Cada arquivo de inimigo (`blaster.js`, `boss.js`, `sentinela.js`, etc.) exporta um objeto controlador modular que gerencia a FSM daquela classe.
3. **Núcleo Orquestrador Limpo (`src/enemies/index.js`):** Reduzido a um despachante genérico que itera sobre os inimigos, delega o update para `enemy.fsm.update(dt, ctx)` e executa a limpeza universal de entidades despawnadas.
4. **Combat Readability & Telegrafia Padronizada:** O estado `TELEGRAPHING` é padrão em todos os atacantes, emitindo flash visual e acionando `triggerSoundCue` de forma determinística antes de qualquer projétil sair.

---

## 2. Mapa de Arquivos e Escopo de Alterações

| Arquivo | Ação | Responsabilidade |
| :--- | :--- | :--- |
| [`src/enemies/state-machine.js`](src/enemies/state-machine.js) | **[CRIAR NOVO]** | Motor universal de Máquina de Estados Finita (FSM), enums globais de estados e utilitários de transição. |
| [`src/enemies/index.js`](src/enemies/index.js) | **[MODIFICAR / REDUZIR]** | Remover o bloco `if-else` de 200 linhas em `updateEnemies`; padronizar despache para `enemy.controller.update`. |
| [`src/enemies/blaster.js`](src/enemies/blaster.js) | **[REFATORAR]** | Eliminar flags soltas (`disengaging`, `tumbleSpin`, `wingBroken`); implementar FSM completa do caça Blaster. |
| [`src/enemies/miniSwarm.js`](src/enemies/miniSwarm.js) | **[REFATORAR]** | Migrar `swarmState` para a FSM universal (`SWARM_PATROL`, `SWARM_TELEGRAPH`, `SWARM_DIVE`). |
| [`src/enemies/sentinela.js`](src/enemies/sentinela.js) | **[REFATORAR]** | FSM formal (`APPROACH`, `STANDOFF`, `GATE_TELEGRAPH`, `GATE_FIRE`, `LEAVING`) com auto-remoção limpa. |
| [`src/enemies/boss.js`](src/enemies/boss.js) | **[REFATORAR]** | HFSM (Fases 1, 2, 3 com sub-estados de ação: `MANEUVER`, `VOLLEY`, `LASER_CHARGE`, `LASER_FIRE`, `PHASE_TRANSITION`). |
| [`src/enemies/golden.js`](src/enemies/golden.js) | **[REFATORAR]** | FSM para a Anomalia Dourada (`PATROL`, `DASH`, `TELEPORT`, `MINION_BURST`, `MEGA_LASER`, `CATACLYSM`). |
| [`src/enemies/sussurro.js`](src/enemies/sussurro.js) | **[REFATORAR]** | FSM de camuflagem (`CLOAKED`, `GLITCH_VISIBLE`, `SUMMONING`, `RETREAT`). |
| [`src/enemies/fragata.js`](src/enemies/fragata.js) | **[REFATORAR]** | FSM de blindagem rotativa (`SHIELD_PATROL`, `CORE_EXPOSED`, `BROADSIDE`). |
| [`src/enemies/verme.js`](src/enemies/verme.js) | **[MODIFICAR]** | Integrar controlador compatível para elos e promoção de cabeças de subcadeia. |
| [`src/enemies/timeEnemy.js`](src/enemies/timeEnemy.js) | **[MODIFICAR]** | Integrar controlador compatível para rotação e disparo de desaceleração temporal. |
| [`src/enemies/tank.js`](src/enemies/tank.js) | **[MODIFICAR]** | Integrar controlador compatível com telegrafia pesada. |
| [`src/enemies/detrito.js`](src/enemies/detrito.js) | **[MODIFICAR]** | Integrar controlador passivo de rotação e estilhaçamento. |
| [`src/enemies/ima.js`](src/enemies/ima.js) | **[MODIFICAR]** | Integrar controlador passivo com campo de atração polar. |
| [`src/enemies/replica.js`](src/enemies/replica.js) | **[MODIFICAR]** | Integrar controlador compatível com espelhamento de rota. |
| [`src/enemies/enemy-telemetry.js`](src/enemies/enemy-telemetry.js) | **[MODIFICAR]** | Substituir leituras ad-hoc por consulta direta a `enemy.fsm.currentState`. |
| [`src/selftest.mjs`](src/selftest.mjs) | **[MODIFICAR]** | Adicionar bateria de testes unitários para a FSM e transições de todos os arquétipos. |

---

## 3. Especificação do Novo Módulo: `src/enemies/state-machine.js`

### 3.1 Enums Universais de Estado (`ENEMY_STATES`)
```javascript
export const ENEMY_STATES = {
  SPAWNING: 'SPAWNING',             // Entrada na cena / fade-in / interpolação de escala inicial
  PATROL: 'PATROL',                 // Voo em formação ou rota passiva
  ENGAGED: 'ENGAGED',               // Em combate ativo (manobras de órbita, aproximação ou perseguição)
  TELEGRAPHING: 'TELEGRAPHING',     // Travamento de mira / aviso visual e sonoro de disparo iminente
  ATTACKING: 'ATTACKING',           // Instante de disparo de projétil, laser ou investida
  RECOVERY: 'RECOVERY',             // Recuo elástico / cooldown pós-ataque
  CRITICAL_TUMBLE: 'CRITICAL_TUMBLE', // Falha mecânica / asa partida / parafuso descontrolado
  DISENGAGING: 'DISENGAGING',       // Limite de ataques atingido; retirando-se em alta velocidade
  PHASE_TRANSITION: 'PHASE_TRANSITION', // Invulnerabilidade cênica e mudança de fase (Chefe / Dourado)
  DYING: 'DYING',                   // Sequência de destruição / explosão
  DESPAWNED: 'DESPAWNED',           // Finalizado; pronto para descarte ou reciclagem
}
```

### 3.2 Estrutura da FSM (`createStateMachine`)
A fábrica `createStateMachine(enemy, statesConfig, initialState)` deve gerenciar:
- `enemy.fsm.currentState`: String do estado atual.
- `enemy.fsm.previousState`: String do estado anterior.
- `enemy.fsm.timeInState`: Tempo acumulado no estado atual em segundos.
- `enemy.fsm.transition(targetState, payload)`: Executa `statesConfig[current].onExit(enemy, ctx)`, atualiza estado e executa `statesConfig[target].onEnter(enemy, ctx, payload)`.
- `enemy.fsm.update(dt, ctx)`: Incrementa `timeInState` e executa `statesConfig[current].update(enemy, dt, ctx)`.
- `enemy.fsm.isIn(state)`: Helper booleano.
- Proteção contra transições inválidas ou loops infinitos.

---

## 4. Detalhamento Por Inimigo

---

### 4.1 `Blaster` (Caças Estelares Genéricos)
- **Arquivo:** [`src/enemies/blaster.js`](src/enemies/blaster.js)
- **Localização Atual:** Linhas 101–285 (`spawnBlaster`, `updateBlasterRailMovement`, `updateBlasterArenaMovement`, `breakBlasterWing`).

#### O que REMOVER:
- As propriedades soltas no objeto instanciado por `spawnBlaster`:
  - `enemy.disengaging`
  - `enemy.wingBroken`
  - `enemy.tumbleSpin`
  - `enemy.tumbleRollSpeed`
  - `enemy.recoilZ`
- As funções separadas e bifurcadas `updateBlasterRailMovement` e `updateBlasterArenaMovement`.

#### O que IMPLEMENTAR:
- **FSM do Blaster com os seguintes estados:**
  1. `SPAWNING`: Interpolação suave de escala inicial se `spawnDuration` existir; transiciona para `ENGAGED`.
  2. `ENGAGED`:
     - Modo Trilho: Executa o perfil correspondente (`orbit`, `advance`, `slow`, `follow`, `circular`, `evasive`).
     - Modo Arena: Executa a navegação 3D com standoff e curvas suaves.
     - Condição de Saída: Quando `fireTimer <= 0.3s` e o jogador estiver na zona de fogo (`inFireRange`), transiciona para `TELEGRAPHING`.
     - Condição de Fuga: Se `shotsFired >= 4`, transiciona para `DISENGAGING`.
  3. `TELEGRAPHING`:
     - `onEnter`: Emite efeito visual de flash no bico (`effects.telegraph`) e chama `triggerSoundCue(ENEMY_SOUND_CUES.blaster_telegraph)`.
     - `update`: Segura por exatamente 0.3s mantendo a trava de mira. Ao zerar o tempo, transiciona para `ATTACKING`.
  4. `ATTACKING`:
     - `onEnter`: Dispara o projétil hostil, chama `triggerSoundCue(ENEMY_SOUND_CUES.blaster_fire)`, aplica recuo elástico (`recoilZ = -0.3`) e incrementa `shotsFired++`.
     - Transiciona imediatamente para `RECOVERY`.
  5. `RECOVERY`:
     - Restaura suavemente `recoilZ` para 0.
     - Sorteia novo intervalo de tiro (`randomEnemyFireInterval()`).
     - Se `shotsFired >= 4`, transiciona para `DISENGAGING`; caso contrário, retorna para `ENGAGED`.
  6. `CRITICAL_TUMBLE`:
     - Disparado exclusivamente por `breakBlasterWing(enemy)`.
     - `onEnter`: Ativa `triggerSoundCue(ENEMY_SOUND_CUES.blaster_spin_damage)` e define velocidade de rotação no eixo Z.
     - `update`: Gira descontroladamente em Z, perde estabilidade lateral e avança em direção à câmera.
  7. `DISENGAGING`:
     - `onEnter`: Empina a nave para cima (`rotation.x = -0.35`) e desativa travamento de mira no jogador.
     - `update`: Acelera em alta velocidade para cima e para frente até cruzar a borda de despawn.
  8. `DYING`:
     - `onEnter`: Desativa colisões e aciona explosão (`triggerSoundCue(ENEMY_SOUND_CUES.generic_death)`).

---

### 4.2 `MiniSwarm` (Fila / Enxame em Rasante)
- **Arquivo:** [`src/enemies/miniSwarm.js`](src/enemies/miniSwarm.js)
- **Localização Atual:** Linhas 80–140 (`spawnMiniSwarm`, `updateMiniSwarm`).

#### O que REMOVER:
- A propriedade `enemy.swarmState` com controle manual de strings `'patrol'`, `'telegraph'`, `'dive'`.
- Os condicionais em cascata de strings dentro de `updateMiniSwarm`.

#### O que IMPLEMENTAR:
- Estados da FSM:
  1. `SWARM_PATROL`: Voo ondulante na formação com base no `patrolBase` e `formationOffset`.
  2. `SWARM_TELEGRAPH`:
     - `onEnter`: Chama `triggerSoundCue(ENEMY_SOUND_CUES.mini_swarm_dive_telegraph)`.
     - `update`: Trava mira estrita na nave do jogador e pulsa de escala (`pulse = 1 + sin(t*18)*0.18`) por 0.45s.
  3. `SWARM_DIVE`:
     - `onEnter`: Calcula o vetor final de dispersão (`spread`) e dispara `triggerSoundCue(ENEMY_SOUND_CUES.mini_swarm_whoosh)`.
     - `update`: Mergulha a 55 u/s em direção à câmera. Ao cruzar a profundidade limite (`-2.0`) ou estourar o tempo de voo, chama `removeEnemy`.

---

### 4.3 `Sentinela` (Moldura Pulsante)
- **Arquivo:** [`src/enemies/sentinela.js`](src/enemies/sentinela.js)
- **Localização Atual:** Linhas 26–28, 115–185 (`SENTINELA_STATE_ENGAGING`, `SENTINELA_STATE_LEAVING`, `updateSentinelaMovement`).

#### O que REMOVER:
- As constantes legadas `SENTINELA_STATE_ENGAGING` e `SENTINELA_STATE_LEAVING`.
- A checagem externa de despawn forçado em `src/enemies/index.js:447` (`sentinelaShouldDespawn(enemy, frame)`).

#### O que IMPLEMENTAR:
- Estados da FSM:
  1. `APPROACH`: Aproximação frontal até o standoff de 48 unidades.
  2. `STANDOFF_TRACK`: Rastreamento lateral suave da nave com contagem regressiva entre disparos de moldura.
  3. `GATE_TELEGRAPH`: Brilho intenso nas barras da moldura e sinal sonoro preparatório.
  4. `GATE_FIRE`:
     - Instancia a moldura de dano no mundo, incrementa disparos e aciona `triggerSoundCue(ENEMY_SOUND_CUES.sentinela_gate_fire)`.
     - Se completou o 4º disparo, transiciona para `LEAVING`; senão, volta para `STANDOFF_TRACK`.
  5. `LEAVING`:
     - `onEnter`: Chama `triggerSoundCue(ENEMY_SOUND_CUES.sentinela_escape)`.
     - `update`: Acelera a 32 u/s para a frente e para cima. Ao atingir a distância à frente (`distanceAhead > 160`), auto-despawna com segurança.

---

### 4.4 `Boss` (Chefe Dodecaedro de 3 Fases)
- **Arquivo:** [`src/enemies/boss.js`](src/enemies/boss.js)
- **Localização Atual:** Linhas 52–100 (`BOSS_PHASES`), 180–260 (transição de fases e HP floors), 265–440 (`updateBossMovement`, `updateBossLaser`, `fireBossVolley`).

#### O que REMOVER:
- A mistura de timers de laser (`laserTelegraphTimer`, `laserIntervalTimer`, `laserBurstPending`) competindo com `transitionTimer`.
- Modificação imperativa de flags de escudo no meio do loop de atualização.

#### O que IMPLEMENTAR:
- **Arquitetura HFSM (Hierarchical Finite State Machine):**
  - **Nível 1 — Fase de HP (Global):**
    - `PHASE_1`: 100% a 66% HP (velocidade 14, 3 tiros retos, laser simples).
    - `PHASE_2`: 66% a 33% HP (velocidade 18, 5 tiros em leque 40°, rotação acelerada).
    - `PHASE_3`: 33% a 0% HP (velocidade 22, 8 tiros em leque 60°, laser em rajada dupla).
  - **Nível 2 — Estados de Ação da Fase:**
    1. `MANEUVER`: Perseguição espacial e aproximação suave.
    2. `VOLLEY_TELEGRAPH` & `VOLLEY_FIRE`: Aviso visual e dispersão de disparos (`triggerSoundCue(ENEMY_SOUND_CUES.boss_volley)`).
    3. `LASER_CHARGE`:
       - `onEnter`: Posiciona o cone de telegraph no nariz e chama `triggerSoundCue(ENEMY_SOUND_CUES.boss_laser_charge)`.
       - `update`: Acompanha a rotação do jogador pelo tempo de telegraph da fase atual.
    4. `LASER_FIRE`:
       - `onEnter`: Emite o feixe destrutivo colinear e chama `triggerSoundCue(ENEMY_SOUND_CUES.boss_laser_fire)`.
       - Lida com a rajada de 2 lasers na Fase 3 via timer interno.
    5. `PHASE_TRANSITION`:
       - Disparado automaticamente quando o HP cruza o threshold da fase (66% ou 33%).
       - `onEnter`: Ativa escudo refletor azul, trava o HP no piso da fase (`transitionFloorHp`), chama `triggerSoundCue(ENEMY_SOUND_CUES.boss_phase_transition)` e emite pulso visual.
       - `update`: Dura 2.0s com rotação visual intensificada. Ao terminar, transiciona para a próxima fase.
    6. `DYING`:
       - `onEnter`: Desliga escudos e inicia a sequência dramática de 3 explosões encadeadas (`triggerSoundCue(ENEMY_SOUND_CUES.boss_death_sequence)`).

---

### 4.5 `Golden` (Anomalia Dourada)
- **Arquivo:** [`src/enemies/golden.js`](src/enemies/golden.js)
- **Localização Atual:** Linhas 15–45, 120–320.

#### O que REMOVER:
- Timers soltos desacoplados (`teleportCooldownTimer`, `dashCooldownTimer`, `minionTimer`, `laserTimer`).

#### O que IMPLEMENTAR:
- Estados da FSM:
  1. `ARENA_PATROL`: Movimentação senoidal e perseguição ao redor da arena.
  2. `EVASIVE_DASH`:
     - Disparado quando a nave do jogador se aproxima a menos de 46u.
     - `onEnter`: Acelera a 72 u/s perpendicularmente ao jogador com rastro de partículas.
  3. `TELEPORTING`:
     - Disparado ao sofrer dano (cooldown de 10s).
     - `onEnter`: Shockwave no ponto de partida, sumiço do mesh e `triggerSoundCue(ENEMY_SOUND_CUES.golden_teleport)`.
     - `update`: Reaparece em nova coordenada orbital na arena com segundo shockwave.
  4. `MINION_LAUNCH`: Lança mini-drones amarelos com `triggerSoundCue(ENEMY_SOUND_CUES.golden_drone_launch)`.
  5. `MEGA_LASER_CHARGE` & `FIRE`: Telegraph concentrado seguido pelo feixe dourado colossal (`triggerSoundCue(ENEMY_SOUND_CUES.golden_laser_fire)`).
  6. `CATACLYSM_DEATH`: Morte com whiteout e onda de choque maciça (`triggerSoundCue(ENEMY_SOUND_CUES.golden_cataclysm_death)`).

---

### 4.6 `Fragata-Escudo`
- **Arquivo:** [`src/enemies/fragata.js`](src/enemies/fragata.js)
- **O que IMPLEMENTAR:**
  - `SHIELD_CRUISE`: Blindagem girando a 0.9 rad/s protegendo o arco frontal.
  - `CORE_EXPOSED`: Ao girar para a janela aberta, emite um brilho pulsante no núcleo. Se tomar tiro neste ângulo, sofre dano direto.
  - `BROADSIDE_SALVO`: Rajada lateral pesada com `triggerSoundCue(ENEMY_SOUND_CUES.fragata_side_broadside)`.

---

### 4.7 `Sussurro`
- **Arquivo:** [`src/enemies/sussurro.js`](src/enemies/sussurro.js)
- **O que REMOVER:** Checagem de invocação de reforços solta em `index.js:453` (`if (sussurroShouldSummon(enemy))`).
- **O que IMPLEMENTAR:**
  - `CLOAKED_CRUISE`: Opacidade em 0.28, avançando suavemente pelo trilho.
  - `PULSE_VISIBLE`: Janela de 500ms com opacidade em 0.95 (`triggerSoundCue(ENEMY_SOUND_CUES.sussurro_cloak_pulse)`), permitindo acertos críticos.
  - `SUMMON_BEACON`: Ao completar 6 segundos vivo, entra no estado de invocação, emite farol luminoso e chama esquadrão de reforços (`triggerSoundCue(ENEMY_SOUND_CUES.sussurro_summon)`).

---

### 4.8 `Verme`, `TimeEnemy`, `Tank`, `Detrito`, `Ima`, `Replica`
- Cada um desses arquivos deve exportar um objeto padronizado com os métodos:
  ```javascript
  export function createEnemyController(enemy, scene, rail, effects) {
    return {
      update(dt, ctx) { ... },
      onHit(damage, hitMeta) { ... },
      dispose() { ... }
    }
  }
  ```
- Isso garante que nenhum tipo precise de tratamento especial ou exceções no loop principal.

---

## 5. Refatoração do Núcleo: `src/enemies/index.js`

### 5.1 O Que REMOVER de `src/enemies/index.js`
- **Linhas 391 a 536:** Todo o bloco em cascata `if (enemy.kind === BLASTER_KIND) ... else if (enemy.kind === SENTINELA_KIND) ...` dentro da função `updateEnemies`.
- A rotina manual de telegraphing e cálculo de `fireTimer` que estava acoplada no loop central.

### 5.2 O Que ALTERAR em `src/enemies/index.js`
- **Assinatura e Corpo do Loop Principal:**
  O laço em `updateEnemies` deve ser enxuto e estritamente orquestrador:
  ```javascript
  const ctx = {
    dt,
    playerPosition,
    frame,
    rail,
    inArena,
    effects,
    scene,
    enemyProjectiles,
    enemyGates,
    nextEnemyId: () => nextEnemyId++,
    removeEnemy: (e) => removeEnemy(e)
  };

  for (let i = enemies.length - 1; i >= 0; i--) {
    const enemy = enemies[i];
    
    // 1. Atualiza a FSM do inimigo
    enemy.fsm.update(dt, ctx);

    // 2. Verifica despawn universal (pass-behind no trilho ou distância de fuga na arena)
    if (shouldUniversalDespawn(enemy, rail, frame, inArena)) {
      removeEnemy(enemy);
      continue;
    }
  }
  ```
- **Resolução de Acertos (`resolveProjectileHit`):**
  Ao detectar colisão geométrica com o projétil do jogador, delegar a resposta ao inimigo:
  ```javascript
  const hitResult = enemyHit.controller.onHit(damage, projectileMeta);
  ```
  O controlador retorna `{ blocked, reflected, killed, points }`, eliminando os `if (enemyHit.kind === BOSS_KIND)` espalhados por 80 linhas.

---

## 6. Telemetria e Debug (`src/enemies/enemy-telemetry.js`)

- **Modificação:** Linhas 40 a 75.
- Substituir a extração heurística de estados:
  ```javascript
  // ANTES (heurística frágil):
  const state = enemy.swarmState || enemy.state || (enemy.disengaging ? 'disengaging' : 'normal');

  // DEPOIS (determinístico e tipado):
  const state = enemy.fsm ? enemy.fsm.currentState : 'LEGACY';
  ```
- No snapshot gerado por `getSnapshot()`, incluir `timeInState` e `previousState`, permitindo que o overlay de debug e radar mostre com precisão o estado de cada caça na tela.

---

## 7. Plano de Execução Passo a Passo para a IA Executora

1. **Passo 1 — Infraestrutura Base:**
   - Criar [`src/enemies/state-machine.js`](src/enemies/state-machine.js) com `ENEMY_STATES` e a função de criação `createStateMachine`.
2. **Passo 2 — Migração do Blaster:**
   - Refatorar [`src/enemies/blaster.js`](src/enemies/blaster.js). Remover flags booleanas e implementar a FSM com os 8 estados definidos na seção 4.1.
3. **Passo 3 — Migração dos Inimigos de Trilho (MiniSwarm e Sentinela):**
   - Refatorar [`src/enemies/miniSwarm.js`](src/enemies/miniSwarm.js) e [`src/enemies/sentinela.js`](src/enemies/sentinela.js).
4. **Passo 4 — Migração dos Chefes (Boss e Golden):**
   - Refatorar [`src/enemies/boss.js`](src/enemies/boss.js) implementando a HFSM de 3 fases e [`src/enemies/golden.js`](src/enemies/golden.js).
5. **Passo 5 — Migração dos Demais Inimigos (Sussurro, Fragata, Verme, etc.):**
   - Adequar os arquivos restantes à interface de controlador padronizada.
6. **Passo 6 — Limpeza do Orquestrador Central:**
   - Esvaziar o loop monolítico em [`src/enemies/index.js`](src/enemies/index.js), conectando o despache modular e a delegação de dano.
7. **Passo 7 — Atualização da Telemetria:**
   - Atualizar [`src/enemies/enemy-telemetry.js`](src/enemies/enemy-telemetry.js).
8. **Passo 8 — Testes Automatizados e Validação:**
   - Adicionar uma nova seção de testes em [`src/selftest.mjs`](src/selftest.mjs) que simule instâncias de cada inimigo e verifique as transições de estado da FSM.
   - Executar `node --check` em todos os arquivos modificados.
   - Executar `node src/selftest.mjs` e garantir aprovação de 100%.
