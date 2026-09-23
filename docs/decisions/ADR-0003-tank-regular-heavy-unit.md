# ADR-0003: Tank como Unidade Pesada de Linha de Frente (Não-Boss)

Status: **Aceito**  
Data: **2026-09-22**  
Relacionados: [`src/enemies/tank.js`](../../src/enemies/tank.js), [`docs/design/enemies/tank.md`](../design/enemies/tank.md)  

---

## Contexto
O Tank original era apenas um caça Blaster com mais pontos de vida, sem identidade nem mecânicas distintas. Havia o risco de que, ao torná-lo uma ameaça maior, ele fosse transformado em um mini-boss com cutscenes, transições para arena e barras de vida gigantescas, o que fragmentaria o ritmo fluido das fases de trilho.

## Decisão
O Tank foi formalmente consolidado como **Unidade Pesada de Linha de Frente**:
1. Continua sendo uma unidade normal de combate (não inicia all-range, não tem cutscene).
2. Ocupa 2 vagas na população máxima de combate para evitar saturação de tela.
3. Possui arsenal pesado (Siege Shot, Suppression Burst e Heavy Ram) com animações de recuo desacopladas da hitbox física.
4. Possui limiares visuais de blindagem danificada (>66%, 33-66%, <33%) sem conceder fases de invulnerabilidade.

## Consequências
- **Positivas:** O combate ganha profundidade e peso sem quebrar o fluxo arcade; o jogador precisa respeitar a linha de tiro do canhão de cerco enquanto manobra entre inimigos comuns.
- **Concessões:** Requer controle estrito de spawn para não saturar o trilho com múltiplas unidades pesadas simultaneamente.
