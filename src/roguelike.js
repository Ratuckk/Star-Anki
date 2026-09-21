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
  { id: 'wingman', category: 'ofensivo', label: 'Companheiro de Esquadrão', icon: '🛸', description: 'Convoca um companheiro de equipe permanente (até 4). Voam em formação, combatem ativamente e perseguem inimigos com tiros próprios.' },
  { id: 'more-homing-targets', category: 'ofensivo', label: 'Enxame teleguiado', icon: '🎯', description: 'O tiro carregado atinge mais alvos de uma vez.' },
  { id: 'ricochet', category: 'ofensivo', label: 'Ricochete', icon: '🔀', description: 'Seus tiros carregados pulam para outro inimigo (o mais próximo) após atingir o alvo mirado. Pode ser pego múltiplas vezes para mais pulos.' },
  { id: 'swirl-blast-cooldown', category: 'ofensivo', label: 'Vínculo: Swirl Blast', icon: '🌀', description: 'Reduz o cooldown do Swirl Blast em 15%. Pode ser pega múltiplas vezes (piso de 6s).' },

  { id: 'extra-shield-charge', category: 'defensivo', label: 'Escudo reforçado', icon: '🛡️', description: '+1 carga máxima de escudo.' },
  { id: 'faster-shield-recharge', category: 'defensivo', label: 'Recarga do escudo', icon: '⏱️', description: 'O escudo recarrega mais rápido após esgotar.' },
  { id: 'longer-invincibility', category: 'defensivo', label: 'Reflexos', icon: '✨', description: 'Mais tempo de invencibilidade após levar um hit.' },
  { id: 'extra-life', category: 'defensivo', label: 'Vida extra', icon: '❤️', description: '+1 vida, aplicada imediatamente.' },

  { id: 'deflect-on-spin', category: 'utilitario', label: 'Giro rebatedor', icon: '🔄', description: 'O giro completo (2 toques rápidos em Z ou C) rebate projéteis inimigos próximos de volta contra eles.' },
  { id: 'faster-charge', category: 'utilitario', label: 'Carga acelerada', icon: '🔋', description: 'O tiro teleguiado carrega mais rápido.' },
  { id: 'longer-dodge-iframe', category: 'utilitario', label: 'Desvio prolongado', icon: '💨', description: 'O giro completo concede mais tempo de invencibilidade.' },
  { id: 'propulsion-ram', category: 'utilitario', label: 'Impulso aríete', icon: '💥', description: 'Acionar o propulsor deixa você invencível durante o impulso e causa 5 de dano a quem colidir com você (inclusive o chefe).' },

  // Cartas "Vínculo": reduzem o cooldown da habilidade única de um piloto específico do
  // esquadrão. Só entram no sorteio se aquele piloto já estiver recrutado (buildCardExcludeSet
  // em player.js) — o efeito de fato mora em combat/wingmen.js (applyAbilityCooldownCard),
  // aplicado por flow-question.js logo depois de player.applyCard().
  { id: 'wingman-ram-cooldown', category: 'ofensivo', label: 'Vínculo: Falco', icon: '☄️', description: 'Reduz o cooldown da Investida Aríete de Falco. Só disponível com Falco na ala.' },
  { id: 'wingman-guard-cooldown', category: 'defensivo', label: 'Vínculo: Peppy', icon: '🔰', description: 'Reduz o cooldown da Guarda de Peppy. Só disponível com Peppy na ala.' },
  { id: 'wingman-repair-cooldown', category: 'defensivo', label: 'Vínculo: Slippy', icon: '🩹', description: 'Reduz o cooldown do Reparo de Campo de Slippy. Só disponível com Slippy na ala.' },
  { id: 'wingman-assist-cooldown', category: 'utilitario', label: 'Vínculo: Miyu', icon: '🔗', description: 'Reduz o cooldown da Carga Compartilhada de Miyu. Só disponível com Miyu na ala.' },

  // Cartas de Falco (Docs/# Documento de Implementação — Nova.md, item 3) — só aparecem com
  // Falco recrutado (buildCardExcludeSet em player.js), até 3 stacks cada. Efeito de fato mora
  // em combat/wingmen.js, lendo os stacks (player.getFalco*Stacks()) via opts no update().
  { id: 'falco-combat-chain', category: 'ofensivo', label: 'Falco — Investida em Cadeia', icon: '☄️', description: 'Ao acertar a Investida Aríete, Falco imediatamente parte pro inimigo vivo mais próximo e investe de novo, sem cooldown extra — até 3 alvos em cadeia. Se não achar ninguém por perto, volta à formação normalmente.' },
  { id: 'falco-intercept', category: 'ofensivo', label: 'Falco — Interceptação', icon: '🛑', description: 'Falco abate projéteis pesados inimigos antes que cheguem em você, a cada 6s (5s/4s/3s com mais stacks).' },
  { id: 'falco-status', category: 'ofensivo', label: 'Falco — Fôlego de Combate', icon: '⏳', description: '+2s na duração do dogfight de Falco por stack (base 5.5s → até 11.5s com 3 stacks).' },
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
