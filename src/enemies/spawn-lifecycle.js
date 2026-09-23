// Helpers puros do lifecycle de spawn dos inimigos.
// Sem dependência de Three.js de propósito: permite validar em Node puro pelo selftest.

export function isEnemySpawnPending(enemy) {
  return !!enemy?.spawnPhase
}

export function isolateSpawnMaterial(enemy) {
  const material = enemy?.mesh?.material
  if (!material || Array.isArray(material) || typeof material.clone !== 'function') return material || null
  if (enemy.spawnAnimatedMaterial) return enemy.spawnAnimatedMaterial

  const clone = material.clone()
  enemy.spawnBaseMaterial = material
  enemy.spawnAnimatedMaterial = clone
  enemy.mesh.material = clone
  return clone
}

export function releaseSpawnMaterial(enemy) {
  const animated = enemy?.spawnAnimatedMaterial
  if (!animated) return

  if (enemy.mesh && enemy.mesh.material === animated && enemy.spawnBaseMaterial) {
    enemy.mesh.material = enemy.spawnBaseMaterial
  }
  if (typeof animated.dispose === 'function') animated.dispose()
  enemy.spawnAnimatedMaterial = null
  enemy.spawnBaseMaterial = null
}
