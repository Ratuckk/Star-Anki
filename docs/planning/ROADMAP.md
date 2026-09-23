# ROADMAP DE DESENVOLVIMENTO — STAR-ANKI

> **Status:** ATIVO  
> **Última atualização:** 2026-09-23  

---

## 🚀 SEQUÊNCIA MACRO DE ENTREGAS

### FASE CONCLUÍDA: MARCO v0.99.35 (ESTABILIZAÇÃO & INTEGRAÇÃO DE COMBATE)
- [x] Overhaul de Foco / Lock-On (Boss > maxHp).
- [x] Swirl Blast volumétrico com dano percentual no Boss (6 + 30% maxHp).
- [x] Overhaul Completo do Tank como Unidade Pesada de Assalto.
- [x] Caça aos 10 bugs de combate, rádio e ciclo de vida dos Wingmen.
- [x] Reorganização estrutural completa do repositório e da documentação.

---

### FASE ATUAL: MARCO v0.99.36 (OVERHAUL DO DOURADO E ESQUADRÃO DE CAÇAS)
- [x] **Overhaul do Dourado e Esquadrão de Caças:**
  - Dourado como Comandante agressivo com faixas úteis de combate (longe/ideal/perto) e dash tático.
  - Mini-naves transformadas em caças subordinados persistentes com HP, slots únicos e formation steering.
  - 4 Ordens táticas contextuais: Strafing Run, Pinça, Cerco do Laser e Fogo Coordenado.
  - Teleporte do Comandante desorganiza a formação sem teleportar caças; reagrupamento físico.
  - Reposição gradual por ciclo de dificuldade (2 a 6 caças, máx ofensivo 1 a 3).
  - Participação plena em kill count, score, targeting e swept piercing com Swirl.
  - *Spec concluída:* [`docs/specs/completed/overhaul-dourado-esquadrao.md`](../specs/completed/overhaul-dourado-esquadrao.md)

---

### PRÓXIMA FASE: MIRA E FSM UNIVERSAL
1. **Mira Direcional por Movimento (C/Z + Direcionais):**
   - Controle tático de mira relativo à nave com opção em Configurações.
   - *Spec pronta:* [`docs/specs/ready/mira-direcional-por-movimento.md`](../specs/ready/mira-direcional-por-movimento.md)
2. **FSM Universal de Inimigos (Fase 2):**
   - Migração dos 9 inimigos restantes para o motor `createStateMachine`.
   - *Spec ativa:* [`docs/specs/active/enemy-fsm-overhaul.md`](../specs/active/enemy-fsm-overhaul.md)

---

### FASE POSTERIOR: NOVOS ENCONTROS E AMBIENTE
1. **Cutscene de Vida Perdida:**
   - Sequência cênica de Queda + Reserva ao perder vida intermediária.
   - *Spec pronta:* [`docs/specs/ready/cutscene-vida-perdida.md`](../specs/ready/cutscene-vida-perdida.md)
2. **Novo Chefe de Arena: Colmeia-Mãe:**
   - *Spec pronta:* [`docs/specs/ready/boss-colmeia-mae.md`](../specs/ready/boss-colmeia-mae.md)
3. **Novo Evento: Apagão de Radar:**
   - *Spec pronta:* [`docs/specs/ready/evento-apagao-radar.md`](../specs/ready/evento-apagao-radar.md)
4. **Novos Obstáculos:**
   - Minas, anel rotativo, poeira densa e barreira setorial.
   - *Spec pronta:* [`docs/specs/ready/obstaculos-novos.md`](../specs/ready/obstaculos-novos.md)
