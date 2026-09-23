# PROGRESSO POS .90.35

Registro incremental criado em 23/09/2026. Não substitui `PROGRESSO_POS_.90.md`; ambos continuam sendo atualizados.

---

## v0.99.33 — Ownership dos locks triangulares da Miyu

### Pedido
- Fazer o disparo extra indicado pelo target triangular sair da Miyu, e não do jogador.
- Permitir múltiplos locks da Miyu no mesmo inimigo independentemente do tamanho, enquanto a mira permanecer nele.

### Implementação
- Orçamentos BASE e MIYU separados.
- BASE preserva limites antigos por entidade; MIYU ignora o limite por entidade e usa o orçamento `1 + stacks` (até 4 extras).
- Release preserva ownership: Fox recebe BASE; Miyu recebe MIYU.
- Cada triângulo gera laser roxo homing de suporte originado na nave da Miyu.
- Nenhum triângulo é convertido em disparo carregado adicional do Fox.

### Validação
- `aiValidator` para aquisição/disparo.
- Teste dedicado integrado ao `selftest.mjs`.
- README e versão do site em v0.99.33.
