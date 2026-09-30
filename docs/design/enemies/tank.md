# DESIGN AS-BUILT: TANK (UNIDADE PESADA DE ASSALTO)

> **Status:** AS-BUILT (VIGENTE EM PRODUÇÃO)  
> **Última verificação:** 2026-09-30 (runtime: `src/tank-runtime.test.mjs`, `tools/validate-tank-runtime.mjs`)
> **Código relacionado:** [`src/enemies/tank.js`](../../../src/enemies/tank.js), [`src/enemies/index.js`](../../../src/enemies/index.js), [`src/enemies/state-machine.js`](../../../src/enemies/state-machine.js)  
> **ADR Relacionada:** [`docs/decisions/ADR-0003-tank-regular-heavy-unit.md`](../../decisions/ADR-0003-tank-regular-heavy-unit.md)  

---

## 1. PAPEL TÁTICO & IDENTIDADE
- **Unidade Pesada Regular:** O Tank não é boss, não inicia all-range, não possui barra de vida exclusiva de tela cheia nem fases com invulnerabilidade.
- **Orçamento:** Ocupa 2 vagas no limite de população de combate e concede 75 pontos ao ser destruído.
- **Spawn Automático no Trilho:** Chance nominal de 5% (`TANK_SPAWN_CHANCE = 0.05`), com probabilidade efetiva dependente de estado (~1.43% inicial com zero erros até ~1.11% no cap da Sentinela com 5+ erros), posicionado no seletor após os inimigos especiais para preservar integralmente o balanceamento existente, respeitando orçamento de população (`room >= 2`) e teto de no máximo 2 Tanks ativos simultaneamente no trilho (`TANK_MAX_ACTIVE_ON_RAIL = 2`).

---

## 2. MODELO PROCEDURAL COM RECOIL DESACOPLADO
- `root` (`THREE.Group`): Mantém a posição autoritativa global e a âncora da hitbox (`TANK_HIT_RADIUS = 4.48` — Fase 3, Tank ~60% maior; o valor 2.80 deste documento era o anterior).
- `visualGroup` (`THREE.Group`, filho de `root`): Recebe impulsos de recuo físico ao atirar (-1.35u em Z) com retorno elástico amortecido, sem alterar a coordenada real da hitbox.

---

## 3. MÁQUINA DE ESTADOS (9 ESTADOS)
- `SPAWNING`: Entrada suave com invulnerabilidade temporária inicial.
- `ENGAGED`: Manutenção de distância dinâmica (standoff 32–52u à frente no trilho, 34u na arena).
- `BRACING`: Ancoragem mecânica desacelerando a nave e alinhando canhão (0.70s a 0.50s conforme D1–D9). O ataque (Siege/Suppression/Ram) é escolhido AQUI com o contexto real: Ram só com o jogador a < 13u, à frente e D3+; senão alterna Siege/Suppression por ciclo.
- `TELEGRAPHING`: Brilho no bocal do canhão e cue sonora do ataque sorteado.
- `ATTACKING`: Executa:
  - *Siege Shot:* Artilharia pesada (speed 34, hitRadius 2.4, damage 2, High Impact, som `tank_siege_fire`).
  - *Suppression Burst:* Rajada de 2 a 3 projéteis (speed 40, damage 1, interval 0.22s, remirando para a posição atual do jogador a cada disparo).
  - *Heavy Ram:* Investida de aríete em distâncias < 13u (speed 30 u/s, 0.55s).
- `RECOVERY`: Período de vulnerabilidade pós-disparo (recuperação 10% mais ágil em HP crítico).
- `REPOSITIONING`: Deslocamento pesado lateral para nova coordenada segura.
- `STAGGERED`: Interrupção de 0.45s provocada pelo Swirl Blast, cancelando armamento e ativando cooldown de proteção de 2.5s contra stun-lock.
- `DISENGAGING`: Retirada tática no trilho após 5 ciclos completos de ataque (na arena ele nunca foge).

---

## 4. LIMIARES VISUAIS DE BLINDAGEM
- `> 66% HP`: Casco intacto.
- `33–66% HP`: Fissuras, deslocamento de placas e som `tank_armor_break`.
- `< 33% HP`: Tremor mecânico de reator exposto, alarme `tank_critical` e recuperação acelerada.

---

## 5. CORREÇÃO DE RUNTIME (2026-09-30)
- **Defeito:** `tank.js` (Fase 3, `cdc276f`) usava `ENEMY_STATES.RECOVERING` e `ENEMY_STATES.DYING`, inexistentes em `state-machine.js`. As chaves `[undefined]` colidiam em `"undefined"` no mapa de estados e o Tank, após o primeiro ataque, executava o handler `DYING` (autodestruição). Reprodução: Tank spawnado no sistema real → `BRACING → TELEGRAPHING → ATTACKING → "undefined"` em 3,4 s.
- **Correção:** `ENEMY_STATES.RECOVERY` e `DYING` (novo); `createStateMachine` lança erro se o mapa contiver a chave `"undefined"`/`"null"`.
- **Números restaurados** (a reescrita da Fase 3 os tinha trocado sem registro): Siege 34 u/s, raio 2,4, dano 2, High Impact (4); Suppression 40 u/s, raio 1,7, dano 1, 2 tiros (D1–4) ou 3 (D5–9), intervalo 0,22 s, re-mira por tiro; Ram a 30 u/s por ≤ 0,55 s com telegraph de 0,55 s e recovery de 1,10 s; Stagger 0,45 s com imunidade de 2,5 s; disengage após 5 ciclos; brace/cooldown/recovery por nível (spec `gravity-recovery-and-integration.md` §2.8).
- **Validação:** `tools/lib/tank-scenarios.mjs` roda o sistema de inimigos real (ciclo completo, projéteis reais, Ram com colisão tier 3, Stagger em BRACING/TELEGRAPHING/ATTACKING, blindagem, disengage, arena). **VALIDADO VISUALMENTE: NÃO.**
