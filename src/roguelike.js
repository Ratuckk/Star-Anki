// Cartas de upgrade do roguelike: metadados puros (id, categoria, texto). O efeito de cada
// carta (o que ela realmente muda no jogo) vive em main.js, num dispatch por id — é lá que
// estão as variáveis mutáveis (fireCooldown, shieldMax, etc.) que as cartas ajustam.
export const CARD_CATEGORY_LABEL = {
  ofensivo: 'Ofensivo',
  defensivo: 'Defensivo',
  utilitario: 'Utilitário',
}

export const CARD_CATEGORY_COLOR = {
  ofensivo: '#ff4d6d',
  defensivo: '#3ea6ff',
  utilitario: '#ffd700',
}

export const ROGUELIKE_CARDS = [
  { id: 'extra-projectile', category: 'ofensivo', label: 'Tiro duplicado', icon: '⚔️', description: '+1 projétil disparado por tiro.' },
  { id: 'faster-fire', category: 'ofensivo', label: 'Recarga rápida', icon: '⚡', description: 'Reduz o tempo entre disparos.' },
  { id: 'wingman', category: 'ofensivo', label: 'Nave de apoio', icon: '🛸', description: 'Uma nave cosmética passa a atirar com você (não leva dano).' },
  { id: 'more-homing-targets', category: 'ofensivo', label: 'Enxame teleguiado', icon: '🎯', description: 'O tiro carregado atinge mais alvos de uma vez.' },
  { id: 'ricochet', category: 'ofensivo', label: 'Ricochete', icon: '🔀', description: 'Seus tiros carregados pulam para outro inimigo (o mais próximo) após atingir o alvo mirado. Pode ser pego múltiplas vezes para mais pulos.' },

  { id: 'extra-shield-charge', category: 'defensivo', label: 'Escudo reforçado', icon: '🛡️', description: '+1 carga máxima de escudo.' },
  { id: 'faster-shield-recharge', category: 'defensivo', label: 'Recarga do escudo', icon: '⏱️', description: 'O escudo recarrega mais rápido após esgotar.' },
  { id: 'longer-invincibility', category: 'defensivo', label: 'Reflexos', icon: '✨', description: 'Mais tempo de invencibilidade após levar um hit.' },
  { id: 'extra-life', category: 'defensivo', label: 'Vida extra', icon: '❤️', description: '+1 vida, aplicada imediatamente.' },

  { id: 'deflect-on-spin', category: 'utilitario', label: 'Giro rebatedor', icon: '🔄', description: 'O giro completo (2 toques rápidos em Z ou C) rebate projéteis inimigos próximos de volta contra eles.' },
  { id: 'faster-charge', category: 'utilitario', label: 'Carga acelerada', icon: '🔋', description: 'O tiro teleguiado carrega mais rápido.' },
  { id: 'longer-dodge-iframe', category: 'utilitario', label: 'Desvio prolongado', icon: '💨', description: 'O giro completo concede mais tempo de invencibilidade.' },
  { id: 'propulsion-ram', category: 'utilitario', label: 'Impulso aríete', icon: '💥', description: 'Acionar o propulsor deixa você invencível durante o impulso e causa 5 de dano a quem colidir com você (inclusive o chefe).' },
]

export function pickRandomCards(count, exclude = new Set()) {
  const pool = ROGUELIKE_CARDS.filter((c) => !exclude.has(c.id))
  if (pool.length <= count) return [...pool]

  // Se pedir 3 cartas, tenta selecionar 1 de cada categoria (ofensivo, defensivo, utilitario)
  if (count === 3) {
    const categories = ['ofensivo', 'defensivo', 'utilitario']
    const result = []
    const chosenIds = new Set()

    for (const cat of categories) {
      const catPool = pool.filter((c) => c.category === cat && !chosenIds.has(c.id))
      if (catPool.length > 0) {
        const picked = catPool[Math.floor(Math.random() * catPool.length)]
        result.push(picked)
        chosenIds.add(picked.id)
      }
    }

    // Fallback caso alguma categoria esteja sem cartas elegíveis
    const remainder = pool.filter((c) => !chosenIds.has(c.id))
    while (result.length < count && remainder.length > 0) {
      const idx = Math.floor(Math.random() * remainder.length)
      result.push(remainder.splice(idx, 1)[0])
    }
    return result
  }

  const result = []
  const source = [...pool]
  while (result.length < count && source.length > 0) {
    const i = Math.floor(Math.random() * source.length)
    result.push(source.splice(i, 1)[0])
  }
  return result
}
