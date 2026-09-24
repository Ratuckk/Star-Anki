# Documentação de Entrega — Tank no Spawn Natural (PR A)

## Identificação
- **Branch:** `feat/tank-natural-spawn`
- **Escopo:** Integração exclusiva do Tank na rotação normal de combate sobre trilhos.

---

## 1. Contexto e Especificação Matemática
- **Documentação de Referência:** ADR-0003 e `docs/design/enemies/tank.md`.
- **Posicionamento na Cadeia:** O Tank é avaliado imediatamente após a Horda na cadeia condicional do `game-loop.js`.
- **Probabilidade Nominal da Branch:** `TANK_SPAWN_CHANCE = 0.05` (5.0%).
- **Probabilidade Efetiva por Spawn Attempt:**
  - A probabilidade conjunta dos 7 tipos de inimigos anteriores falharem simultaneamente é:
    $$P(\text{pass}) = (1 - 0.20) \times (1 - 0.22) \times (1 - 0.12) \times (1 - 0.10) \times (1 - 0.08) \times (1 - 0.10) \times (1 - 0.30) \approx 0.286443 \quad (28.64\%)$$
  - Multiplicando pela chance nominal da branch ($5\%$):
    $$P(\text{efetiva}) = 0.286443 \times 0.05 \approx 0.014322 \quad (\approx 1.43\%)$$
  - **Interpretação Adotada:** Interpretação A (nominal 5% na branch pós-Horda). Preserva 100% das probabilidades nominais e conjuntas de todos os 7 inimigos especiais anteriores (Time Enemy, Mini Swarm, Sentinela, Réplica, Verme, Sussurro, Horda), reduzindo apenas a fatia residual de Blasters/Squadron de 28.64% para 27.21%.

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
