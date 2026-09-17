// ============ MOTOR DE VALIDAÇÃO GUIADA POR IA (AI VALIDATION ENGINE) ============
// Instrumentação em tempo de execução pra IA registrar "expectativas" sobre o código que
// acabou de escrever e descobrir, a partir de uma sessão de jogo REAL, se a lógica se
// comportou como previsto. Ver FLUXO_VALIDACAO_IA.md pra quando/como usar isso ao implementar
// features novas. Complementa (não substitui) src/selftest.mjs: selftest é cenário sintético
// rodado antes de commitar; isso aqui é comportamento emergente de uma sessão de play real,
// exportado pelo painel de debug ("Copiar Log de Validação IA").
import { copyTextToClipboard } from './telemetry-utils.js'

const MAX_TIMELINE = 200
const MAX_FAILURES = 500

export function createAIValidator() {
  const startTime = performance.now()
  const timeline = []
  const failures = []
  let passedCount = 0
  let failedCount = 0

  function elapsed() {
    return Number((performance.now() - startTime).toFixed(2))
  }

  // A IA chama isso logo depois de calcular um estado crítico (dano, mana, transição de FSM
  // etc.) pra checar a própria suposição sobre o resultado. Nunca lança exceção pro chamador —
  // uma expectativa mal escrita não pode derrubar o jogo — e só guarda contexto/detalhe quando
  // falha (uma expectativa que passou não tem valor diagnóstico, só o contador importa).
  function expect(description, evaluationFn, context = {}) {
    let passed
    let ctx = context
    try {
      passed = !!evaluationFn()
    } catch (err) {
      passed = false
      ctx = { ...context, excecao: err?.message || String(err) }
    }
    if (passed) {
      passedCount++
    } else {
      failedCount++
      failures.push({ t: elapsed(), description, context: ctx })
      if (failures.length > MAX_FAILURES) failures.shift()
      console.warn(`[AI Validator] Expectativa falhou: ${description}`, ctx)
    }
    return passed
  }

  // Rastreia um passo de uma mecânica nova (fila circular, últimos MAX_TIMELINE) — dá contexto
  // de "o que aconteceu antes" quando uma expectativa falha longe da causa raiz. Não é pra
  // chamar a cada frame do loop de update; só em eventos discretos (spawn, transição, disparo).
  function logMechanic(mechanicName, action, stateSnapshot = {}) {
    timeline.push({ t: elapsed(), mechanic: mechanicName, action, state: stateSnapshot })
    if (timeline.length > MAX_TIMELINE) timeline.shift()
  }

  function buildReport() {
    return {
      _instrucao_para_ia:
        'Se "expectativas_falhas" não estiver vazio, a implementação não se comportou como ' +
        'previsto. Leia o contexto de cada falha (valores no momento exato), corrija o código ' +
        'e, se fizer sentido, adicione novas expectativas cobrindo o caso.',
      total_expectativas_avaliadas: passedCount + failedCount,
      expectativas_ok: passedCount,
      expectativas_falhas: failures,
      timeline_mecanicas: timeline.slice(),
    }
  }

  function copyReport() {
    copyTextToClipboard(JSON.stringify(buildReport(), null, 2), 'Log de Validação IA')
  }

  function reset() {
    timeline.length = 0
    failures.length = 0
    passedCount = 0
    failedCount = 0
  }

  return { expect, logMechanic, buildReport, copyReport, reset }
}

export const aiValidator = createAIValidator()
