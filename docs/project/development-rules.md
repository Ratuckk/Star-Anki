# REGRAS PERMANENTES DE DESENVOLVIMENTO — STAR-ANKI

> **Status:** ATIVO / CANÔNICO  
> **Última verificação:** 2026-09-23  
> **Público-alvo:** Desenvolvedores e Agentes de IA  

---

## 1. MANDAMENTOS INVIOLÁVEIS DE QUALIDADE

1. **Aprovação nos Testes Unitários:**
   ```bash
   node src/selftest.mjs
   ```
   Todos os testes da suíte global devem passar 100% (33/33 ou mais). Nenhuma alteração é aceita com teste falhando.
2. **Auditoria Estática Zero-Avisos:**
   ```bash
   node tools/full-project-audit.mjs
   ```
   Deve retornar estritamente `AUDIT_SUMMARY errors=0 warnings=0`. Imports circulares, variáveis indefinidas e referências soltas não são permitidos.
3. **Fuzzing de Estresse:**
   ```bash
   node tools/state-fuzz-audit.mjs
   ```
   Deve retornar `FUZZ_SUMMARY failures=0`. Configurações salvas, esquemas de keybindings e dados de sessões do Anki devem suportar corrupção sem derrubar o jogo.
4. **Preservação de Interfaces Públicas:**
   Nunca altere assinaturas exportadas de funções consumidas por `src/combat/index.js`, `src/combat/projectiles.js`, `src/combat/wingmen.js` e `src/game-loop.js` sem atualizar atomicamente todos os consumidores.

---

## 2. REGRAS CRÍTICAS DE THREE.JS E PERFORMANCE (60 FPS)

1. **PROIBIÇÃO DE MUTAÇÃO IN-PLACE COM `.project(camera)`:**
   - No Three.js, `Vector3.project(camera)` altera as coordenadas do vetor de entrada *in-place*.
   - Se for passado `mesh.position` direto, a entidade no mundo 3D será instantaneamente transportada para coordenadas de tela `[-1, 1]`.
   - **Regra:** Sempre use `.clone()` antes de projetar:
     ```javascript
     const screenPos = worldPos.clone().project(camera)
     ```
2. **ZERO ALOCAÇÕES EM HOT LOOPS (Loops de 60 FPS e Disparos):**
   - Métodos chamados todo frame (`update(dt)`, render, detecção de colisão) nunca devem instanciar `new THREE.Vector3()`, `new THREE.Quaternion()` ou arrays descartáveis.
   - **Regra:** Declare vetores de rascunho (*scratch*) no topo do módulo:
     ```javascript
     const _scratchVecA = new THREE.Vector3()
     const _scratchVecB = new THREE.Vector3()
     ```
3. **PROTEÇÃO CONTRA VETORES NULOS:**
   - Nunca execute `.normalize()` em um vetor com comprimento zero ou quase zero (`lengthSq() < 0.000001`). O Three.js produzirá `NaN`, corrompendo matrizes mundiais.
4. **DISPOSE DE GEOMETRIAS E MATERIAIS:**
   - Ao despawnar naves ou efeitos especiais, libere explicitamente recursos de GPU chamando `.dispose()` em geometrias e materiais.

---

## 3. PADRÃO ARQUITETURAL DE SUBSISTEMAS

1. **Estado Central Compartilhado (`state`):**
   - Os fluxos do jogo (`flow-boss.js`, `flow-question.js`, `game-loop.js`, etc.) operam sobre a mesma referência de objeto `state` instanciada em `mount-game.js`. Não crie variáveis de estado concorrentes.
2. **FSM para Inimigos e Aliados:**
   - Inimigos devem utilizar o motor universal `src/enemies/state-machine.js` com o ciclo `onEnter`, `update(dt, ctx)` e `onExit`.
   - Inimigos abatidos devem contar pontuação formalmente via `killPointsFor(enemy)` e respeitar o orçamento de população `getEnemyCount()`.
3. **Áudio e Efeitos:**
   - Efeitos sonoros devem ser catalogados em `src/audio-cues.js` e acionados através de `triggerSoundCue(cueId, opts)`.
