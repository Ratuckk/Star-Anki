# 🗺️ MAPA MESTRE DA DOCUMENTAÇÃO — STAR-ANKI

> **Entrada oficial e canônica para toda a documentação, arquitetura, design, especificações, planejamento e histórico do Star-Anki.**

---

## 🧭 COMO NAVEGAR NESTE REPOSITÓRIO

| Para entender... | Consulte... | Descrição |
| :--- | :--- | :--- |
| **Regras e arquitetura do projeto** | [`docs/project/`](project/) | Visão, arquitetura do core, fluxo de validação (`validation.md`) e regras de desenvolvimento. |
| **Como um sistema funciona hoje** | [`docs/design/`](design/) | Documentação *as-built* comprovada pelo código em produção (combate, wingmen, inimigos, áudio, UI). |
| **Trabalhos e especificações em andamento ou prontos** | [`docs/specs/`](specs/) | Especificações com escopo fechado (`active/`, `ready/`, `blocked/`, `completed/`). |
| **O que ainda falta fazer (pendências)** | [`docs/planning/BACKLOG.md`](planning/BACKLOG.md) | Fonte canônica única de pendências ativas do projeto. |
| **Catálogo de ideias futuras / brainstorm** | [`docs/planning/catalog/`](planning/catalog/) | Ideias em maturação, rascunhos descartados ou em avaliação (`ideias/`, `implementacoes/`). |
| **Estado operacional mais recente** | [`docs/progress/CURRENT.md`](progress/CURRENT.md) | Versão atual, branch, último SHA, o que acabou de ser feito e próximo ponto de continuidade. |
| **Decisões arquiteturais fundamentais (ADRs)** | [`docs/decisions/`](decisions/) | Registros de "por que o projeto funciona assim" (Architecture Decision Records). |
| **Auditorias e evidências técnicas** | [`docs/audits/`](audits/) | Relatórios de conformidade estática, fuzzing, bugs identificados e histórico de auditorias. |
| **Modelos reutilizáveis** | [`docs/templates/`](templates/) | Templates para novas especificações de inimigos, features, ADRs e auditorias. |
| **Memória histórica arquivada** | [`docs/archive/`](archive/) e [`docs/progress/archive/`](progress/archive/) | Progressos legados (v0.00 até v0.99.31) e documentos descontinuados. |

---

## ⚖️ POLÍTICA DE CANONICIDADE E FONTE ÚNICA DA VERDADE

1. **Código e Design Vigente:**
   - O código em `src/` e os documentos em [`docs/design/`](design/) representam o comportamento comprovado do jogo hoje.
   - Nenhum documento de planejamento ou especificação antiga deve ser lido como verdade presente se divergir de `docs/design/` ou de `src/`.
2. **Histórico é Histórico:**
   - Documentos em [`docs/progress/archive/`](progress/archive/) e [`docs/archive/`](archive/) são registros imutáveis de decisões e entregas de versões passadas. Eles **não** representam pendências ativas nem garantem que comportamentos antigos ainda existam.
3. **Status de Especificações:**
   - Toda especificação em [`docs/specs/`](specs/) possui status explícito:
     - `active/`: Implementação ativamente em andamento.
     - `ready/`: Especificação aprovada e desenhada, pronta para início imediato.
     - `blocked/`: Especificação aguardando dependência externa ou decisão de design.
     - `completed/`: Funcionalidade implementada, testada e integrada com commit registrado.
4. **Backlog Único:**
   - [`docs/planning/BACKLOG.md`](planning/BACKLOG.md) é a única lista autoritativa de tarefas a fazer. Checkboxes soltos em documentos históricos ou em arquivos de progresso arquivados não constituem backlog ativo.
