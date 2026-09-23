# Backlog Central — Star-Anki

> **Documento Canônico Central de Backlog Operacional**
> **Versão de Referência:** v0.99.35
> **Estado Atual de Entrega:** [`docs/progress/CURRENT.md`](docs/progress/CURRENT.md)
> **Localização Canônica:** [`docs/planning/BACKLOG.md`](docs/planning/BACKLOG.md)

Este documento serve como índice canônico e centralizador de todas as pendências, melhorias planejadas e direções de desenvolvimento do Star-Anki, organizadas por frente técnica e apontando para backlogs e especificações detalhadas.

---

## 1. Gameplay & Combate

### 1.1 Concluído na v0.99.36
- [x] **Overhaul do Dourado e Esquadrão:** Dourado comandante com faixas úteis de combate, caças subordinados persistentes com HP, slots de formação, 4 ordens táticas (Strafing, Pinça, Cerco do Laser, Fogo Coordenado), desorganização ao teleporte e reposição gradual ([`docs/specs/completed/overhaul-dourado-esquadrao.md`](docs/specs/completed/overhaul-dourado-esquadrao.md)).

### 1.2 Concluído na v0.99.35
- [x] **Arcade Draft Bullet-Time:** Janela de desaceleração de 1,5s com retorno automático a 1.0x (gameplay, naves, tiros e wingmen ativos sem pausar o jogo).
- [x] **Swirl Blast Overhaul:** Hitbox volumétrica de 3.0u swept, 6 de dano-base + 30% do `maxHp` do Boss, penetração de detritos sem impacto e proteção contra dano duplo consecutivo.
- [x] **Lock-on Prioritário:** Boss ativo > maior `maxHp` > menor ID, desacoplado do cone visual de mira e concentrando travas na ameaça máxima.
- [x] **Tank (Unidade Pesada Regular):** 75 pts, 2 vagas de população, modelo 3D desacoplado para recoil, FSM de 9 estados e vulnerabilidade a Stagger por Swirl.
- [x] **Volume Espacial & Fog:** Estrelas intermediárias com reciclagem em world-space, parallax real e bancos de fog com proximity fade.
- [x] **Boss Dourado:** Buffer de acerto piercing corrigido, fail-safe `consumeGoldenDefeated` e guarda idempotente na cutscene de morte.
- [x] **Damage Feedback de Detritos:** Dano confirmado exige estritamente `damage > 0`; destruições por contato/ambiente sem HP não emitem dano zero.

### 1.3 Próximas Entregas (Specs Prontas)
- [ ] **Mira Direcional por Movimento:** Retículo adaptativo guiado por inércia e vetor de velocidade ([`docs/specs/ready/mira-direcional-por-movimento.md`](docs/specs/ready/mira-direcional-por-movimento.md)).
- [ ] **Cutscene de Vida Perdida:** Transição dramática e recuperação sem quebra de fluxo ([`docs/specs/ready/cutscene-vida-perdida.md`](docs/specs/ready/cutscene-vida-perdida.md)).
- [ ] **Boss Colmeia-Mãe:** Arena orgânica com enxames em espiral e pontos fracos expostos ([`docs/specs/ready/boss-colmeia-mae.md`](docs/specs/ready/boss-colmeia-mae.md)).
- [ ] **Novos Obstáculos:** Detritos magnéticos, portais de gravidade e campos de asteroides reativos ([`docs/specs/ready/obstaculos-novos.md`](docs/specs/ready/obstaculos-novos.md)).

---

## 2. Esquadrão dos Wingmen

### 2.1 Concluído na v0.99.35
- [x] **Rádio Anti-Spam com Orçamento Global:**
  - Silêncio global de esquadrão (`squadTrivialSilenceUntil`) com gap de 6000ms.
  - Estimativa de transmissão de 2800ms por fala trivial.
  - Janela de desduplicação semântica por categoria de evento (8000ms).
  - Preempção imediata e prioridade total para abilities e urgências (`retreat`, `state_critical`).
  - Call & Response disciplinado com respostas cooperativas respeitando o orçamento global.
  - Registro de cooldown por piloto via `markSpoken` na emissão de comandos de rádio.
- [x] **Miyu Assist Locks:** Orçamento dual independente de travas com feedback visual e telemetria.
- [x] **Fuzz Runtime Determinístico:** Auditoria contínua cobrindo 4 caças ativos, validação dos 6 pares de colisão, finitude universal (zero NaNs), histerese de rail catch-up e autoridade de deconflição/separação (`tools/wingman-runtime-fuzz-audit.mjs`).

### 2.2 Planejado / Backlog Futuro
- [ ] **Animações de Manobra Tática:** Animações específicas de rolamento e barril para evasão de lasers.
- [ ] **Voz Sintética/Efeitos de Filtro:** Modulação por rádio simulada via Web Audio API.

---

## 3. Inimigos & FSM Universal

### 3.1 Estado Atual ([`docs/specs/active/enemy-fsm-overhaul.md`](docs/specs/active/enemy-fsm-overhaul.md))
- [x] **Fase 1 (Concluída):** Blaster e Tank operando com FSM desacoplada e validada.
- [x] **Enxame-Ímã Calibrado:** Força do campo gravitacional autoritativa em 1100 u/s² (`IMA_FIELD_STRENGTH = 1100`) para velocidade nominal de projétil de 260.
- [ ] **Fase 2:** Migração de MiniSwarm, Sentinela e Horda para FSM universal.
- [ ] **Fase 3:** Migração de Boss principal, Boss Dourado e Verme Segmentado.
- [ ] **Fase 4:** Migração de Sussurro, Fragata, TimeEnemy e Réplica.

---

## 4. Estudo, Perguntas & Quiz

As pendências específicas do sistema de flashcards, cloze, explicações densas e distratores estão detalhadas no backlog especializado:

👉 **[`docs/planning/question-system-backlog.md`](docs/planning/question-system-backlog.md)**

### Resumo das Frentes:
- [x] Botões duplos de Contexto e Explicação da Resposta (v0.61.0).
- [x] Cloze balanceado com Basic e regra de um fato por card.
- [ ] Perguntas-cenário situacionais (aplicação prática).
- [ ] Distratores semânticos por tag de confusão (`confunde:X`).

---

## 5. Áudio & Efeitos Sonoros

O catálogo e mapeamento dos 97 sound cues e pendências de áudio estão documentados em:

👉 **[`docs/planning/audio-backlog.md`](docs/planning/audio-backlog.md)**

### Resumo:
- [x] 97 Sound Cues validados e mapeados no selftest.
- [ ] Incorporação de novas faixas temáticas e balanceamento dinâmico de mixagem.

---

## 6. Qualidade, Automação & CI

- [x] **Suíte Canônica de CI:** Pipeline de validação pura no GitHub Actions (`.github/workflows/ci.yml`) para PRs e pushes na branch `main` e v0.99.35.
- [x] **Selftest Integrado:** `src/selftest.mjs` executa todos os subsistemas críticos, incluindo rádio global e arcade bullet-time.
- [x] **Auditorias de Projeto:** `tools/full-project-audit.mjs` (0 erros) e `tools/state-fuzz-audit.mjs` (0 falhas).
- [x] **Wingman Runtime Fuzz:** `tools/wingman-runtime-fuzz-audit.mjs` (0 falhas em 3600 frames a 60 fps).
