# DESIGN AS-BUILT: TANK (UNIDADE PESADA DE ASSALTO)

> **Status:** AS-BUILT (VIGENTE EM PRODUÇÃO)  
> **Última verificação:** 2026-09-23  
> **Código relacionado:** [`src/enemies/tank.js`](../../../src/enemies/tank.js), [`src/enemies/index.js`](../../../src/enemies/index.js), [`src/enemies/state-machine.js`](../../../src/enemies/state-machine.js)  
> **ADR Relacionada:** [`docs/decisions/ADR-0003-tank-regular-heavy-unit.md`](../../decisions/ADR-0003-tank-regular-heavy-unit.md)  

---

## 1. PAPEL TÁTICO & IDENTIDADE
- **Unidade Pesada Regular:** O Tank não é boss, não inicia all-range, não possui barra de vida exclusiva de tela cheia nem fases com invulnerabilidade.
- **Orçamento:** Ocupa 2 vagas no limite de população de combate e concede 75 pontos ao ser destruído.

---

## 2. MODELO PROCEDURAL COM RECOIL DESACOPLADO
- `root` (`THREE.Group`): Mantém a posição autoritativa global e a âncora da hitbox (`TANK_HIT_RADIUS = 2.80`).
- `visualGroup` (`THREE.Group`, filho de `root`): Recebe impulsos de recuo físico ao atirar (-1.35u em Z) com retorno elástico amortecido, sem alterar a coordenada real da hitbox.

---

## 3. MÁQUINA DE ESTADOS (9 ESTADOS)
- `SPAWNING`: Entrada suave com invulnerabilidade temporária inicial.
- `ENGAGED`: Manutenção de distância dinâmica (standoff 32–52u à frente no trilho, 34u na arena).
- `BRACING`: Ancoragem mecânica desacelerando a nave e alinhando canhão (0.70s a 0.50s conforme D1–D9).
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
