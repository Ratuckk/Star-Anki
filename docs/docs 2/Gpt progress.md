# Gpt progress

Registro das ações implementadas pelo GPT neste projeto a partir de 23/09/2026.

## Regras daqui em diante
- Registrar cada pacote implementado vindo desta conversa.
- Descrever pedido, diagnóstico, solução e validação.
- Continuar resumindo as entregas em `progresso/PROGRESSO_POS_.90.md`.
- Manter `progresso/PROGRESSO_POS_.90.35.md` como registro incremental atual.
- Atualizar README e versão do site em toda entrega versionada.

---

## 23/09/2026 — v0.99.33 — Carga Compartilhada com ownership da Miyu

### Solicitação
O target triangular deve representar um disparo realmente pertencente à Miyu e poder acumular múltiplos triângulos no mesmo inimigo enquanto ele permanecer sob a mira.

### Diagnóstico
`lockon.js` marcava extras como `source: miyu`, mas `projectiles.fireHomingShot()` consumia a lista inteira; o Fox disparava esses projéteis e `wingmen.js` ainda inferia extras pela posição no array. O ownership era visual, não mecânico.

### Solução
1. Budgets BASE/MIYU independentes.
2. BASE mantém limite por entidade; MIYU pode repetir alvo comum.
3. O release separa grupos de ownership.
4. Fox dispara apenas BASE.
5. Cada MIYU lock gera laser roxo homing saindo da nave da Miyu, com dano de suporte.
6. Instrumentação `aiValidator` e regressão dedicada.

### Validação
Árvore validada em branch isolada com checks de sintaxe, teste dedicado, `selftest.mjs` e `git diff --check`. Playtest visual ainda é útil para confirmar trajetória/origem em runtime.
