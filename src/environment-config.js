// environment-config.js
//
// Configuração modular dos efeitos de ambiente cósmico, névoa e skybox (v0.56.0).
// Permite ligar ou desligar qualquer elemento individualmente a qualquer momento.
// Pode ser alterado diretamente aqui ou em tempo de execução via menu de debug.

export const ENVIRONMENT_CONFIG = {
  enableSkyDome: false,         // Desativado: fundo preto clássico do espaço
  enableCelestialBodies: false, // Desativado: planetas/luas removidos conforme pedido
  enableMultiLayerStars: true,  // Estrelas multicamadas com cintilação suave (twinkle)
  enableWarpStreaks: true,      // Esticamento de estrelas/poeira no boost (efeito hiperespaço)
  enableAbstractSpeedlines: true, // Linhas radiais 2D aprovadas no laboratório visual
  enableNebulaPockets: true,    // Bolsões de névoa densa e transição de atmosfera no percurso
  enableVolumetricFogBanks: true, // Bancos volumétricos localizados de névoa no espaço
  enableIonStorms: false,       // Desativado: preserva fundo preto limpo
  enableShootingStars: false,   // Desativado
  enableEnergizedGrid: false,   // Desativado: grid clássico
  enableDebrisStormEvent: true,  // Evento periódico de tempestade de detritos
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
