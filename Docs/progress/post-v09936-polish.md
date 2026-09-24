# Documentação de Entrega — Lock-on / Miyu / Arcade / Retícula / Fog Polish (PR B)

## Identificação
- **Branch:** `fix/lockon-miyu-arcade-fog-polish`
- **Escopo:** Geometria do lock-on com autoridade da retícula, screen-space multi-lock markers, integração da Miyu (cooldown, multi-lock, rádio em evento autoritativo, origem física), retícula progressiva, compatibilidade retroativa e round-trip do Arcade Draft Mode, renderização de Fog volumétrico multicamadas.

---

## 1. Lock-on & Geometria da Retícula
- **Autoridade da Retícula:** A aquisição e manutenção de alvo utilizam vetor normalizado do retículo/mira real (`isTargetInCone`), unificando a verificação de cone geométrico.
- **Prioridade e Mira:** A prioridade de alvos (Boss/Dourado/maior HP) só atua sobre candidatos estritamente válidos dentro do cone de mira. Alvos fora do cone jamais roubam a trava.
- **Histerese:**
  - `AIM_ACQUIRE_ANGLE = 0.28 rad (~16°)`
  - `AIM_MAINTAIN_ANGLE = 0.40 rad (~23°)`
  - `maintain > acquire` elimina flickers na borda da mira.
- **Screen-Space Layout Multi-lock:**
  - Coordenadas de mundo (`worldPos`) representam a posição física autoritativa do alvo.
  - HUD projeta e distribui marcadores em tela (pixels CSS):
    - 1 lock: centro do alvo;
    - 2 locks: offset horizontal curto e simétrico;
    - 3+ locks: anel orbital compacto em torno do centro projetado.
- **Descarte de Fantasmas / Behind-Camera:** Snapshots descartados se `depth <= 0.1` ou fora dos limites de NDC / viewport, ou se entidade estiver morrendo/fading.

---

## 2. Miyu Assist
- **Orçamentos Independentes:** Orçamento BASE (Fox) obedece limites normais; orçamento de assistência da Miyu permite empilhar múltiplos locks no mesmo alvo focado.
- **Cooldown & Disponibilidade:**
  - Cooldown base: `abilityCooldownBase = 9s`
  - Cooldown floor: `abilityCooldownFloor = 3s`
  - Primeiro uso pós-spawn: ~6.0s (delay inicial de combate).
- **Rádio em Evento Autoritativo:**
  - Rádio `ability_assist` dispara exclusivamente quando `miyuShotsFired > 0` após criação do projétil real da Miyu.
  - Estados ready, charge, cancel ou lost target geram 0 falas.
- **Origem Física:**
  - Projéteis da Carga Compartilhada nascem na posição física (muzzle) da Miyu, não no Fox.
  - Efeitos visuais e sonoros de disparo do Fox ocorrem apenas quando `playerShotsFired > 0`.

---

## 3. Retícula — Escala de Carga
- Escala progressiva contínua de `1.0` a `~1.45` conforme `chargeFrac` (0.0 a 1.0).
- Reset instantâneo para `1.0` ao disparar, cancelar, perder a carga ou reiniciar/pausar.

---

## 4. Arcade Draft Mode & Compatibilidade
- **3 Modos Disponíveis:**
  - `pause`: Congela o combate (`dt = 0`) enquanto o draft de cartas está aberto.
  - `slowmo`: Aplica ~1.5s de bullet-time (`ARCADE_CARD_CHOICE_TIME_SCALE = 0.05`), retornando suavemente a 1.0x caso o draft permaneça aberto.
  - `normal`: Combate flui em tempo real (`1.0x`), permitindo escolha rápida com VFX completo sem desaceleração de tempo.
- **Migração e Persistência:**
  - `arcadeCardChoicePauses = true` migra para `arcadeDraftMode = 'pause'`.
  - `arcadeCardChoicePauses = false` migra para `arcadeDraftMode = 'slowmo'` (não converte para normal).
  - Round-trip completo no LocalStorage e sincronização bidirecional do boolean legado.

---

## 5. Fog Volumétrico
- **Arquitetura:** Camadas volumétricas com envelope espacial (`insideEnvelope >= 0.40`), atenuação de entrada e saída (fade), densidade contínua durante travessia interna.
- **Status de Validação:**
  - TESTADO AUTOMATICAMENTE: Cobertura completa de lifecycle, envelopes e testes de regressão.
  - VALIDAÇÃO VISUAL: Registrado conforme protocolo (ver relatório de playtest).
