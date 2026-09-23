import { readFileSync, writeFileSync } from 'node:fs'

function patch(path, from, to, label) {
  const src = readFileSync(path, 'utf8')
  const count = src.split(from).length - 1
  if (count !== 1) throw new Error(`${path}: esperado 1 trecho em ${label}, encontrado ${count}`)
  writeFileSync(path, src.replace(from, to))
}

// Snapshot de settings uma vez por frame: elimina várias cópias/consultas e torna opções do
// painel de pausa efetivas no frame seguinte. O cache de settings.js garante que isto não toca
// localStorage no hot path.
patch(
  'src/game-loop.js',
  `    const rawDt = forcedRawDt != null ? forcedRawDt : Math.min((now - state.lastTime) / 1000, 0.1)\n    const baseDt = state.debugFlags.slowMoActive ? rawDt * 0.25 : rawDt\n`,
  `    const rawDt = forcedRawDt != null ? forcedRawDt : Math.min((now - state.lastTime) / 1000, 0.1)\n    const liveSettings = getSettings()\n    const baseDt = state.debugFlags.slowMoActive ? rawDt * 0.25 : rawDt\n`,
  'snapshot settings por frame',
)

for (const [from, to, label] of [
  [`!getSettings().arcadeCardChoicePauses`, `!liveSettings.arcadeCardChoicePauses`, 'bullet-time live'],
  [`!!getSettings().fogTacticalEffects`, `!!liveSettings.fogTacticalEffects`, 'fog live'],
  [`if (getSettings().wingmanRadioEnabled)`, `if (liveSettings.wingmanRadioEnabled)`, 'rádio live'],
  [`const damageVisualSettings = getSettings()`, `const damageVisualSettings = liveSettings`, 'dano visual live'],
  [`!getSettings().fogTacticalColors`, `!liveSettings.fogTacticalColors`, 'cor fog live'],
  [`const ghostBlipsEnabled = getSettings().minimapGhostBlips`, `const ghostBlipsEnabled = liveSettings.minimapGhostBlips`, 'radar live'],
  [`if (showEnemyHealthBars) {`, `if (liveSettings.showEnemyHealthBars) {`, 'barra inimiga live'],
]) patch('src/game-loop.js', from, to, label)

patch(
  'src/game-loop.js',
  `    rail.update(dt, tumbleLocked ? TUMBLE_LOCKED_INPUT : inputState)\n`,
  `    // O slider também existe no painel de pausa; aplicar o valor atual antes do update faz a\n    // sensibilidade mudar imediatamente sem recriar o controlador/partida.\n    rail.setTurnSensitivity(liveSettings.arenaTurnSensitivity)\n    rail.update(dt, tumbleLocked ? TUMBLE_LOCKED_INPUT : inputState)\n`,
  'sensibilidade live',
)

// A primeira transição do ciclo do chefe usa kind='boss'; bossSummon é a segunda cutscene depois
// da caça aos orbes. updateArenaCutscene tratava só bossSummon como chefe, então a apresentação
// inicial recebia fog/preview de chefe mas não o warning card nem a fenda vermelha.
patch(
  'src/cutscenes.js',
  `    const isBoss = state.arenaCutsceneKind === 'bossSummon'\n`,
  `    const isBoss = state.arenaCutsceneKind === 'boss' || state.arenaCutsceneKind === 'bossSummon'\n`,
  'boss inicial também é cutscene de chefe',
)

console.log('apply-bughunt-fixes-v09932-round2.mjs: OK')
