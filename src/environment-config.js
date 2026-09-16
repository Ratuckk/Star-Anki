// environment-config.js
//
// Configuração modular dos efeitos de ambiente cósmico, névoa e skybox (v0.56.0).
// Permite ligar ou desligar qualquer elemento individualmente a qualquer momento.
// Pode ser alterado diretamente aqui ou em tempo de execução via menu de debug.

export const ENVIRONMENT_CONFIG = {
  enableSkyDome: true,          // Cúpula cósmica procedural com gradientes de nebulosa orgânica
  enableCelestialBodies: true,  // Planeta gigante gasoso com anéis e lua em paralaxe profunda
  enableMultiLayerStars: true,  // Estrelas multicamadas com cintilação suave (twinkle)
  enableWarpStreaks: true,       // Esticamento de estrelas/poeira no boost (efeito hiperespaço)
  enableNebulaPockets: true,    // Bolsões de névoa densa e transição de atmosfera no percurso
  enableIonStorms: true,        // Relâmpagos cósmicos difusos esporádicos no horizonte
  enableShootingStars: true,    // Meteoros / estrelas cadentes periódicas cortando o céu
  enableEnergizedGrid: true,    // Ondas de pulso neon viajando no grid de solo
}

export function setEnvironmentFeature(feature, enabled) {
  if (feature in ENVIRONMENT_CONFIG) {
    ENVIRONMENT_CONFIG[feature] = !!enabled
  }
}

export function toggleEnvironmentFeature(feature) {
  if (feature in ENVIRONMENT_CONFIG) {
    ENVIRONMENT_CONFIG[feature] = !ENVIRONMENT_CONFIG[feature]
    return ENVIRONMENT_CONFIG[feature]
  }
  return false
}
