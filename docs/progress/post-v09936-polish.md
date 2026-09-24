# Documentação de Entrega — Lock-on / Miyu / Arcade / Retícula / Fog Polish (PR B)

## Identificação
- **Branch:** `fix/lockon-miyu-arcade-fog-polish`
- **Escopo:** Geometria do lock-on com autoridade da retícula, screen-space multi-lock markers, integração da Miyu (cooldown, multi-lock, rádio em evento autoritativo, origem física), retícula progressiva, compatibilidade retroativa e round-trip do Arcade Draft Mode, renderização de Fog volumétrico multicamadas.

---

## 1. Lock-on & Geometria da Retícula
- **Autoridade da Retícula:** A aquisição e manutenção de alvo utilizam vetor normalizado do retículo/mira real via `isTargetInCone(forwardDir, toTargetNorm, angleThreshold)`, unificando a verificação de cone geométrico com vetores estritamente normalizados.
- **Prioridade e Mira:** A prioridade de alvos (Boss/Dourado/maior HP) atua estritamente sobre candidatos válidos dentro do cone de mira. Alvos fora do cone jamais roubam a trava.
- **Ângulos e Alcances Reais (Fonte da Verdade: Código):**
  - `AIM_HINT_ANGLE = 7°` (mira indicativa visual no crosshair)
  - `AIM_ACQUIRE_ANGLE = 7.5°` (cone de aquisição de trava)
  - `AIM_MAINTAIN_ANGLE = 12°` (cone de manutenção com histerese para evitar flicker)
  - `MAX_LOCK_RANGE = 90u` (alcance máximo de travamento)
  - `MIN_LOCK_RANGE = 10u` (piso de distância para evitar alvos ultrapassados)
- **Screen-Space Layout Multi-lock:**
  - Coordenadas de mundo (`worldPos`) representam a posição física autoritativa do alvo.
  - O HUD projeta e distribui marcadores em tela (pixels CSS):
    - 1 lock: centro do alvo;
    - 2 locks: offset horizontal simétrico curto ($\pm 14\text{ px}$);
    - 3+ locks: anel orbital compacto em torno do centro projetado ($16\text{ px}$ de raio com step angular).
- **Descarte de Fantasmas / Behind-Camera:** Snapshots descartados se `depth <= 0.1` ou fora dos limites de NDC / viewport, ou se entidade estiver morrendo/fading.

---

## 2. Miyu Assist
- **Orçamentos Independentes:** Orçamento BASE (Fox) obedece limites normais; orçamento de assistência da Miyu permite empilhar múltiplos locks no mesmo alvo focado.
- **Cooldown & Disponibilidade:**
  - Cooldown base: `abilityCooldownBase = 9.0s`
  - Cooldown floor: `abilityCooldownFloor = 3.0s`
  - Primeiro uso pós-spawn: ~6.0s (delay inicial de combate).
- **Rádio em Evento Autoritativo:**
  - Rádio `ability_assist` dispara exclusivamente quando `miyuShotsFired > 0` após criação do projétil real da Miyu.
  - Estados ready, charge, cancel ou lost target geram rigorosamente 0 falas.
- **Origem Física:**
  - Projéteis da Carga Compartilhada nascem na posição física (muzzle) da Miyu, não no Fox.
  - Efeitos visuais e sonoros de disparo do Fox ocorrem apenas quando `playerShotsFired > 0`. Disparos exclusivos da Miyu não reproduzem efeitos no Fox.

---

## 3. Retícula — Escala de Carga
- Escala progressiva contínua de `1.0` a `~1.45` conforme `chargeFrac` (0.0 a 1.0).
- Reset instantâneo para `1.0` ao disparar, cancelar, perder a carga ou reiniciar/pausar.

---

## 4. Arcade Draft Mode & Compatibilidade
- **3 Modos Disponíveis:**
  - `pause`: Congela o combate (`dt = 0`) enquanto o draft de cartas está aberto.
  - `slowmo`: Aplica ~1.5s de janela de bullet-time (`ARCADE_CARD_CHOICE_TIME_SCALE = 0.18`), retornando suavemente a 1.0x caso o draft permaneça aberto.
  - `normal`: Combate flui em tempo real (`1.0x`), permitindo escolha rápida com VFX completo sem desaceleração de tempo.
- **Migração e Persistência:**
  - `arcadeCardChoicePauses = true` migra para `arcadeDraftMode = 'pause'`.
  - `arcadeCardChoicePauses = false` migra para `arcadeDraftMode = 'slowmo'` (não converte silenciosamente para normal).
  - Round-trip completo no LocalStorage e sincronização bidirecional do boolean legado.

---

## 5. Fog Volumétrico
- **Arquitetura:** Camadas volumétricas com envelope espacial (`insideEnvelope >= 0.40`), atenuação de entrada e saída (fade), densidade contínua durante travessia interna.
- **Status de Validação:**
  - TESTADO AUTOMATICAMENTE: SIM (cobertura completa de lifecycle, envelopes e testes em `src/lockon-miyu-reticle-fog.test.mjs`).
  - VALIDADO VISUALMENTE: NÃO (NÃO FOI POSSÍVEL VALIDAR VISUALMENTE no ambiente headless atual).
