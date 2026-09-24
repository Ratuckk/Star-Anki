# Documentação de Entrega — Tank no Spawn Natural (PR A)

## Identificação
- **Branch:** `feat/tank-natural-spawn`
- **Escopo:** Integração exclusiva do Tank na rotação normal de combate sobre trilhos.

---

## 1. Contexto e Especificação Matemática
- **Documentação de Referência:** ADR-0003 e `docs/design/enemies/tank.md`.
- **Posicionamento na Cadeia:** O Tank é avaliado imediatamente após a Horda na cadeia condicional do `game-loop.js`.
- **Probabilidade Nominal da Branch:** `TANK_SPAWN_CHANCE = 0.05` (5.0%).
- **Probabilidade Efetiva por Spawn Attempt (Dependente do Estado de Erros):**
  - A chance da Sentinela no runtime é dinâmica:
    $$S(w) = 0.12 + \min(0.20, w \times 0.04)$$
    onde $w = \text{wrongAnswerCount}$. Varia de $12\%$ ($w=0$) até o teto de $32\%$ ($w \ge 5$).
  - A probabilidade conjunta de falha de todos os 7 inimigos anteriores (Time Enemy, Mini Swarm, Sentinela, Réplica, Verme, Sussurro, Horda) sobreviventes até a branch do Tank é:
    $$P(\text{pass} \mid w) = (1 - 0.20) \times (1 - 0.22) \times (1 - S(w)) \times (1 - 0.10) \times (1 - 0.08) \times (1 - 0.10) \times (1 - 0.30)$$
    $$P(\text{pass} \mid w) = 0.80 \times 0.78 \times (1 - S(w)) \times 0.90 \times 0.92 \times 0.90 \times 0.70$$
  - Multiplicando pela chance nominal da branch ($5\%$):
    $$P(\text{Tank} \mid w) = P(\text{pass} \mid w) \times 0.05$$
  - **Cenários Canônicos:**
    - **Zero Erros ($w = 0$, Sentinela inicial em $12\%$):**
      $$P(\text{pass} \mid 0) \approx 0.286443 \quad (28.64\%)$$
      $$P(\text{Tank} \mid 0) \approx 0.014322 \quad (\approx 1.43\%)$$
      *Resíduo de Blasters/Squadron:* reduz de $28.64\%$ para $27.21\%$.
    - **Cap de Erros ($w \ge 5$, Sentinela no teto de $32\%$):**
      $$P(\text{pass} \mid 5+) = 0.80 \times 0.78 \times 0.68 \times 0.90 \times 0.92 \times 0.90 \times 0.70 \approx 0.221342 \quad (22.13\%)$$
      $$P(\text{Tank} \mid 5+) \approx 0.011067 \quad (\approx 1.11\%)$$
      *Resíduo de Blasters/Squadron:* reduz de $22.13\%$ para $21.03\%$.
  - **Interpretação Adotada:** Interpretação A (nominal 5% na branch pós-Horda). Preserva 100% das probabilidades nominais e conjuntas de todos os 7 inimigos especiais anteriores em qualquer valor de $w$, absorvendo a fatia do Tank unicamente do resíduo de Blasters/Squadron.

---

## 2. Contratos e Regras de Negócio
- `TANK_POPULATION_WEIGHT = 2`: Ocupa 2 vagas no limite de população (`currentEnemyCap()`).
- `room >= 2`: Spawn automático só ocorre se houver pelo menos 2 vagas livres de população. Se houver 1 vaga ou 0, o spawn é bloqueado e cai para o fallback regular.
- `TANK_MAX_ACTIVE_ON_RAIL = 2`: No máximo 2 Tanks ativos simultaneamente no trilho. Se já houver 2 Tanks ativos, nenhum novo Tank é spawnado.
- **Liberação de Recursos na Morte:** Ao morrer/despawnar, as 2 unidades de população são integralmente restituídas para a cota de combate.
- **Debug Flags:** `debugFlags.disableAutoSpawn === true` desativa o spawn automático do Tank (assim como dos demais inimigos normais), preservando ações manuais de debug (`spawnTank`, `spawnWave`, etc.).

---

## 3. Validação e Testes
- Suíte dedicada: `src/tank-spawn-integration.test.mjs` (6 blocos cobrindo os 12 critérios solicitados).
- Integrado em `src/selftest.mjs` e na etapa de CI (`.github/workflows/ci.yml`).
