// ============ UTILITÁRIOS MATEMÁTICOS DE TELEMETRIA (ZERO DEPENDÊNCIAS) ============
// Funções puras em JavaScript para conversão de coordenadas, quaternions para Euler e
// manipulação de logs de telemetria sem dependência de Three.js ou libs externas.

export function quaternionToEulerDeg(q) {
  if (!q) return { pitch: 0, yaw: 0, roll: 0 }
  const x = q.x || 0, y = q.y || 0, z = q.z || 0, w = q.w !== undefined ? q.w : 1
  const sinr_cosp = 2 * (w * z + x * y)
  const cosr_cosp = 1 - 2 * (y * y + z * z)
  const roll = Math.atan2(sinr_cosp, cosr_cosp)
  const sinp = 2 * (w * x - y * z)
  const pitch = Math.abs(sinp) >= 1 ? Math.sign(sinp) * (Math.PI / 2) : Math.asin(sinp)
  const siny_cosp = 2 * (w * y + z * x)
  const cosy_cosp = 1 - 2 * (x * x + y * y)
  const yaw = Math.atan2(siny_cosp, cosy_cosp)
  return {
    pitch: Number((pitch * (180 / Math.PI)).toFixed(1)),
    yaw: Number((yaw * (180 / Math.PI)).toFixed(1)),
    roll: Number((roll * (180 / Math.PI)).toFixed(1)),
  }
}

export function distance3D(a, b) {
  if (!a || !b) return 0
  const dx = (a.x || 0) - (b.x || 0)
  const dy = (a.y || 0) - (b.y || 0)
  const dz = (a.z || 0) - (b.z || 0)
  return Math.hypot(dx, dy, dz)
}

export function dot3D(a, b) {
  if (!a || !b) return 0
  return (a.x || 0) * (b.x || 0) + (a.y || 0) * (b.y || 0) + (a.z || 0) * (b.z || 0)
}

export function copyTextToClipboard(text, label = 'Log') {
  if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      console.log(`%c[Telemetria] ${label} copiado para a área de transferência! (${text.length} caracteres)`, 'color: #00ff88; font-weight: bold;')
    }).catch((err) => {
      console.warn(`[Telemetria] Erro ao copiar ${label} via clipboard API:`, err)
    })
  } else {
    console.log(`%c[Telemetria] ${label}:\n`, 'color: #00ff88; font-weight: bold;', text)
  }
}
