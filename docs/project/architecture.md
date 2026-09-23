# ARQUITETURA DO SISTEMA — STAR-ANKI

> **Status:** ATIVO / CANÔNICO  
> **Última verificação:** 2026-09-23  

---

## 1. VISÃO ESTRUTURAL DO RUNTIME

O Star-Anki é estruturado em módulos ES6 puros desacoplados, renderizados via WebGL (Three.js) e interface DOM:

```text
index.html (Ponto de entrada)
  └── src/main.js (Bootstrap)
        └── src/mount-game.js (Montagem da cena, Three.js, injeção de dependências)
              ├── src/game-loop.js (Loop principal tick: inputs, pausas, entidades, HUD, render)
              ├── src/flow-boss.js (Caçada de orbes, invocação, luta de fases, vitória)
              ├── src/flow-question.js (Modais de perguntas Anki, cartas Roguelike)
              ├── src/flow-progression.js (Escalonamento por erro/nível, randomizadores de spawn)
              ├── src/cutscenes.js (Transições cinemáticas para arena e câmera lenta de abates)
              ├── src/combat/ (Lock-on, projéteis, wingmen, rádio e alvos)
              ├── src/enemies/ (FSM de inimigos, bosses, colisões e despawn)
              ├── src/player.js (Física da nave Arwing, roll, vida, escudos e cartas)
              ├── src/audio.js (Reprodutor WebAudio e dispatcher de Sound Cues)
              └── src/hud-*.js (HUD do jogo, vitais, cartas, minimapa, configurações)
```

---

## 2. SUBSISTEMAS PRINCIPAIS

### 2.1 Combate (`src/combat/`)
- `lockon.js`: Prioridade autoritativa (`Boss > maior maxHp > menor id`).
- `projectiles.js`: Projéteis convencionais, lasers, homing shots e Swirl Blast volumétrico.
- `wingmen.js` & `wingman-state-controller.js`: Subsistema autônomo dos 4 companheiros de esquadrão (*Falco, Peppy, Slippy, Miyu*), integridade, habilidades e separação simétrica.
- `wingman-radio.js` & `wingman-world-radio.js`: Rádio com 4 slots paralelos e balões 3D no espaço mundial.

### 2.2 Inimigos (`src/enemies/`)
- `state-machine.js`: Motor FSM leve com ciclo `onEnter`, `update`, `onExit`.
- `tank.js`: Arquétipo de unidade pesada de assalto com modelo 3D desacoplado e 9 estados.
- `boss.js` & `golden.js`: Chefes de arena all-range com fases e lasers telegrafados.
- `index.js`: Despachante de ciclo de vida de spawn, colisão, perseguição e pontuação.

### 2.3 Estudo e SRS (`src/quiz.js`, `src/anki.js`, `src/decks.js`)
- Carregamento de baralhos Anki nos formatos Cloze e Basic.
- Resolução de respostas, Active Recall e explicações com fontes.
