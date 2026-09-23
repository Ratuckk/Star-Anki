# Star Anki

Rail shooter de estudo estilo Star Fox 64 que transforma um baralho do Anki em perguntas do jogo. Three.js via CDN import map, sem bundler, ES modules nativos.

**Estrutura de módulos** (`src/`):
- `main.js`: bootstrap puro e orquestração externa (suporte mobile e inicialização do menu de jogo).
- `mount-game.js`: montagem da cena Three.js, iluminação, fog, setup de partida, enterCombat e teardown.
- `game-loop.js`: loop principal (o tick), física, colisões, atualizações por frame e renderização.
- `rail.js`: trilho 3D (splines), câmera cinemática e controle de arena All-Range.
- `combat/index.js` (e subsistemas em `src/combat/`): orquestrador de combate, balística de tiros do jogador, lock-on prioritário, alvos bônus, orbes de chefe e esquadrão de wingmen (`src/combat/wingmen.js`).
- `player.js`: estado da nave do jogador (vida, escudo, boost, buffs, upgrades e telemetria).
- `cutscenes.js`: sequências cinemáticas (decolagem, transições e morte de chefes).
- `effects.js`: sistema de partículas, explosões, shockwaves e telegraphs visuais.
- `environment.js` e `environment-config.js`: starfield, reciclagem em world-space, parallax espacial e bancos de fog volumétricos.
- `flow-question.js`, `flow-boss.js`, `flow-progression.js`: fluxo de perguntas/feedback, fases de chefes e progressão de dificuldade.
- `anki.js`, `quiz.js`, `decks.js`: parsing de baralhos Anki e geração dinâmica de distratores coesos.
- `roguelike.js`: cartas de melhorias e mecânica de draft (incluindo bullet-time no modo Arcade).
- `input.js`, `keybindings.js`, `settings.js`: captura e mapeamento de controles (teclado, mouse e gamepad).
- `audio.js` e `audio-cues.js`: reprodução de áudio, catálogo de sound cues e prioridades sonoras.
- `debug.js` e `debug-actions.js`: telemetria, inspeção e ações do painel de debug.
- `hud.js` (fachada) + `hud-*.js`: interface modular por tela (pregame, decks, settings, game, pause, end, damage, speedlines, styles).

**`src/enemies/`** — cada CLASSE de inimigo tem seu próprio arquivo (variações de cor/movimento da MESMA classe ficam dentro do arquivo dela, não viram arquivo novo):
- `blaster.js`: caça Blaster padrão (vermelho atirador, 6 perfis de movimento/cor; FSM universal ativa).
- `tank.js`: unidade pesada regular consolidada (75 pts, 2 vagas de população, FSM de 9 estados, 3 ataques exclusivos, recoil desacoplado da hitbox e vulnerabilidade a Stagger por Swirl Blast — [ADR-0003](docs/decisions/ADR-0003-tank-regular-heavy-unit.md)).
- `miniSwarm.js`: enxame patrulha + mergulho (3 variantes: reto, zigue-zague, espiral).
- `timeEnemy.js`: ampulheta cronométrica (normal + variante com laser desacelerador).
- `sentinela.js`: inimigo de trilho com molduras holográficas (centro translúcido seguro, bordas com dano).
- `detrito.js`: asteroides e destroços físicos destrutíveis (spawn independente das regras de pausa).
- `boss.js`: chefe principal de setor (dodecaedro de 3 fases com canhões, lasers e escudos).
- `golden.js`: mini-chefe Anomalia Dourada (esquadrão, teleporte, dash, mega laser e cutscene cataclísmica).
- `fragata.js`, `verme.js`, `ima.js`, `sussurro.js`, `replica.js`: arquétipos especializados de suporte e combate.
- `state-machine.js`: motor genérico de FSM universal (`createStateMachine`, `ENEMY_STATES`).
- `index.js`: orquestrador de ciclo de vida (`createEnemiesSystem`, arrays compartilhados, despache e despawn universal). `combat/index.js` e `mount-game.js` importam de `./enemies/index.js`.
- Especificação de migração FSM: [`docs/specs/active/enemy-fsm-overhaul.md`](docs/specs/active/enemy-fsm-overhaul.md).

**Antes de criar ou reconfigurar QUALQUER inimigo, percorra [docs/templates/enemy-spec-template.md](docs/templates/enemy-spec-template.md) e pergunte ao usuário item por item** — checklist obrigatório (estados, movimento, disparo, reação a tiro normal/carregado, esquadrão, boost/repulsão, movimentação do jogador, spawn/fuga/teleporte/invisibilidade, integração técnica com os sistemas compartilhados). Não assuma comportamento "razoável" nem introduza mudança não pedida.

**Ao criar ou alterar mecânica de jogo, siga [docs/project/validation.md](docs/project/validation.md)** — instrumente estado crítico com `aiValidator.expect(...)` (`src/ai-validator.js`) pra conseguir validar via log real de playtest (botão "Copiar Log de Validação IA" no painel de debug) se a lógica funcionou, em vez de confiar só em inspeção visual.

**Toda a documentação canônica ativa mora em [`docs/`](docs/)** — consulte o mapa mestre em [`docs/README.md`](docs/README.md). A árvore histórica `Docs/` permanece temporariamente no repositório apenas como legado/compatibilidade e não deve receber novos documentos canônicos. O backlog unificado mora em [`docs/planning/BACKLOG.md`](docs/planning/BACKLOG.md), os templates em [`docs/templates/`](docs/templates/), e o estado operacional ativo em [`docs/progress/CURRENT.md`](docs/progress/CURRENT.md). A memória histórica de versões passadas está arquivada em [`docs/progress/archive/`](docs/progress/archive/) e as auditorias em [`docs/audits/archive/`](docs/audits/archive/). Avisos de materiais e licenças de terceiros estão em [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md). Sempre consulte [`docs/progress/CURRENT.md`](docs/progress/CURRENT.md) antes de iniciar qualquer trabalho.

Servidor de teste: `preview_start` com `name: "static"` (serve a raiz deste projeto em `http://localhost:8420`). Sempre `preview_stop` depois de testar.

**Git e Fluxo de Integração Canônico:**
- Nunca usar force-push (`git push --force`).
- Sempre revisar `git status` e `git diff` antes de commitar.
- Testar exaustivamente antes de commit e push (`node src/selftest.mjs`, auditorias e suítes relevantes).
- Mudanças substanciais devem ocorrer em branch dedicada (ex.: `feat/...`, `fix/...`, `chore/...`).
- Publicar a branch remota e abrir Pull Request para a branch `main`.
- A pipeline de integração contínua (CI) deve passar integralmente no GitHub Actions.
- Merge em `main` ocorre exclusivamente após decisão explícita de revisão humana.
- **NUNCA** fazer merge automático ou push direto na `main` apenas porque os testes ficaram verdes.
