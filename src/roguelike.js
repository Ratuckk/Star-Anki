// Cartas de upgrade do roguelike: metadados puros (id, categoria, texto). O efeito de cada
// carta (o que ela realmente muda no jogo) vive em main.js, num dispatch por id — é lá que
// estão as variáveis mutáveis (fireCooldown, shieldMax, etc.) que as cartas ajustam.
export const CARD_CATEGORY_LABEL = {
  ofensivo: 'Ofensivo',
  defensivo: 'Defensivo',
  utilitario: 'Utilitário',
}

export const ROGUELIKE_CARDS = [
  { id: 'extra-projectile', category: 'ofensivo', label: 'Tiro duplicado', description: '+1 projétil disparado por tiro.' },
  { id: 'faster-fire', category: 'ofensivo', label: 'Recarga rápida', description: 'Reduz o tempo entre disparos.' },
  { id: 'wingman', category: 'ofensivo', label: 'Nave de apoio', description: 'Uma nave cosmética passa a atirar com você (não leva dano).' },
  { id: 'more-homing-targets', category: 'ofensivo', label: 'Enxame teleguiado', description: 'O tiro carregado atinge mais alvos de uma vez.' },

  { id: 'extra-shield-charge', category: 'defensivo', label: 'Escudo reforçado', description: '+1 carga máxima de escudo.' },
  { id: 'faster-shield-recharge', category: 'defensivo', label: 'Recarga do escudo', description: 'O escudo recarrega mais rápido após esgotar.' },
  { id: 'longer-invincibility', category: 'defensivo', label: 'Reflexos', description: 'Mais tempo de invencibilidade após levar um hit.' },
  { id: 'extra-life', category: 'defensivo', label: 'Vida extra', description: '+1 vida, aplicada imediatamente.' },

  { id: 'deflect-on-spin', category: 'utilitario', label: 'Giro rebatedor', description: 'O giro completo (2 toques rápidos em Z ou C) rebate projéteis inimigos próximos de volta contra eles.' },
  { id: 'faster-charge', category: 'utilitario', label: 'Carga acelerada', description: 'O tiro teleguiado carrega mais rápido.' },
  { id: 'longer-dodge-iframe', category: 'utilitario', label: 'Desvio prolongado', description: 'O giro completo concede mais tempo de invencibilidade.' },
  { id: 'propulsion-ram', category: 'utilitario', label: 'Impulso aríete', description: 'Acionar o propulsor deixa você invencível durante o impulso e causa 5 de dano a quem colidir com você (inclusive o chefe).' },
]

export function pickRandomCards(count, exclude = new Set()) {
  const pool = ROGUELIKE_CARDS.filter((c) => !exclude.has(c.id))
  const result = []
  const source = [...pool]
  while (result.length < count && source.length > 0) {
    const i = Math.floor(Math.random() * source.length)
    result.push(source.splice(i, 1)[0])
  }
  return result
}
