// ============ REGISTRO E DEFINIÇÃO DE SONS DE PERSONAGENS E ENTIDADES ============
// Estrutura preparatória de áudio (Sound Cues) para todos os personagens, naves aliadas,
// inimigos, chefes e perigos do Star-Anki, baseada na especificação do SONS_TODO.md.
//
// Cada entrada define estritamente:
// - id: identificador único do evento de som
// - file: null (nenhum som carregado ainda — pronto para receber o caminho em sons/ no futuro)
// - durationMs: tempo de duração do som em milissegundos
// - delayMs: retardo/timing de quando o som deve começar em relação ao evento
// - cooldownMs: janela de bloqueio para evitar sobreposição caótica em disparos frequentes
// - volume: volume relativo base (0.0 a 1.0)
// - category: 'sfx' | 'voice' | 'ambient' | 'music'
// - spatial: se possui posicionamento 3D no espaço ou estéreo fixo
// - loop: se é contínuo enquanto o estado persistir
// - triggerLogic: descrição exata da lógica e do momento em que o evento é ativado

/**
 * @typedef {Object} SoundCue
 * @property {string} id
 * @property {string|null} file
 * @property {number} durationMs
 * @property {number} delayMs
 * @property {number} cooldownMs
 * @property {number} volume
 * @property {'sfx'|'voice'|'ambient'|'music'} category
 * @property {boolean} spatial
 * @property {boolean} loop
 * @property {string} triggerLogic
 */

// ============================================================================
// 1. JOGADOR (Player) — Armas, Manobras, Defesa e Vitalidade
// ============================================================================
export const PLAYER_SOUND_CUES = {
  // --- Armas ---
  laser_fire: {
    id: 'player_laser_fire',
    file: null,
    durationMs: 240,
    delayMs: 0,
    cooldownMs: 80,
    volume: 0.85,
    category: 'sfx',
    spatial: false,
    loop: false,
    triggerLogic: 'Disparado instantaneamente a cada tiro normal de laser saindo do canhão (combat.tryFire).'
  },
  charge_loop: {
    id: 'player_charge_loop',
    file: null,
    durationMs: 1200,
    delayMs: 0,
    cooldownMs: 0,
    volume: 0.65,
    category: 'sfx',
    spatial: false,
    loop: true,
    triggerLogic: 'Inicia em loop quando o botão de tiro é mantido pressionado (fireHeldMs >= homingChargeMinMs).'
  },
  charge_max_ready: {
    id: 'player_charge_max_ready',
    file: null,
    durationMs: 450,
    delayMs: 0,
    cooldownMs: 400,
    volume: 0.95,
    category: 'sfx',
    spatial: false,
    loop: false,
    triggerLogic: 'Chime de aviso disparado no instante em que fireHeldMs atinge homingChargeMaxMs (carga 100%).'
  },
  homing_fire: {
    id: 'player_homing_fire',
    file: null,
    durationMs: 600,
    delayMs: 0,
    cooldownMs: 200,
    volume: 0.90,
    category: 'sfx',
    spatial: false,
    loop: false,
    triggerLogic: 'Disparado no instante em que o jogador solta o botão de tiro carregado com alvos travados.'
  },
  homing_impact: {
    id: 'player_homing_impact',
    file: null,
    durationMs: 380,
    delayMs: 0,
    cooldownMs: 50,
    volume: 0.90,
    category: 'sfx',
    spatial: true,
    loop: false,
    triggerLogic: 'Disparado no momento exato em que um tiro teleguiado colide contra o mesh de um inimigo/chefe.'
  },
  swirl_blast_fire: {
    id: 'player_swirl_blast_fire',
    file: null,
    durationMs: 1400,
    delayMs: 0,
    cooldownMs: 500,
    volume: 1.0,
    category: 'sfx',
    spatial: false,
    loop: false,
    triggerLogic: 'Disparo do Swirl Blast — whoosh agudo + zumbido crescente de perfuração, sustentado por ~1.4s enquanto o projétil viaja'
  },
  max_charge_splash: {
    id: 'player_max_charge_splash',
    file: null,
    durationMs: 850,
    delayMs: 0,
    cooldownMs: 300,
    volume: 1.0,
    category: 'sfx',
    spatial: true,
    loop: false,
    triggerLogic: 'Disparado no impacto de tiro com carga máxima, gerando a explosão em área circular de raio 3.'
  },
  ricochet: {
    id: 'player_ricochet',
    file: null,
    durationMs: 280,
    delayMs: 0,
    cooldownMs: 60,
    volume: 0.80,
    category: 'sfx',
    spatial: true,
    loop: false,
    triggerLogic: 'Disparado quando a carta Ricochete redireciona o tiro para o próximo inimigo mais próximo.'
  },
  frenzy_activated: {
    id: 'player_frenzy_activated',
    file: null,
    durationMs: 650,
    delayMs: 0,
    cooldownMs: 500,
    volume: 0.90,
    category: 'sfx',
    spatial: false,
    loop: false,
    triggerLogic: 'Disparado ao coletar micro-orbe de foco ou abater esquadrão, ativando tiro triplo acelerado.'
  },

  // --- Manobras ---
  barrel_roll: {
    id: 'player_barrel_roll',
    file: null,
    durationMs: 520,
    delayMs: 0,
    cooldownMs: 300,
    volume: 0.85,
    category: 'sfx',
    spatial: false,
    loop: false,
    triggerLogic: 'Disparado no momento em que o jogador aperta duplo-toque lateral ou teclas Z/C para giro rebatedor.'
  },
  deflect: {
    id: 'player_deflect',
    file: null,
    durationMs: 340,
    delayMs: 0,
    cooldownMs: 100,
    volume: 0.90,
    category: 'sfx',
    spatial: true,
    loop: false,
    triggerLogic: 'Disparado quando a asa girando no barrel roll intercepta e rebate um projétil hostil.'
  },
  boost_ignite: {
    id: 'player_boost_ignite',
    file: null,
    durationMs: 400,
    delayMs: 0,
    cooldownMs: 250,
    volume: 0.85,
    category: 'sfx',
    spatial: false,
    loop: false,
    triggerLogic: 'Disparado no instante inicial em que a barra de espaço ou tecla de propulsão é acionada.'
  },
  boost_loop: {
    id: 'player_boost_loop',
    file: null,
    durationMs: 1000,
    delayMs: 150,
    cooldownMs: 0,
    volume: 0.70,
    category: 'sfx',
    spatial: false,
    loop: true,
    triggerLogic: 'Loop contínuo mantido enquanto a aceleração de boost estiver ativa e houver energia de propulsor.'
  },
  brake_ignite: {
    id: 'player_brake_ignite',
    file: null,
    durationMs: 350,
    delayMs: 0,
    cooldownMs: 250,
    volume: 0.75,
    category: 'sfx',
    spatial: false,
    loop: false,
    triggerLogic: 'Disparado no momento de acionamento do freio reverso / repulsor.'
  },
  ram_impact: {
    id: 'player_ram_impact',
    file: null,
    durationMs: 600,
    delayMs: 0,
    cooldownMs: 300,
    volume: 1.0,
    category: 'sfx',
    spatial: true,
    loop: false,
    triggerLogic: 'Disparado quando o jogador colide frontalmente contra um inimigo estando com o upgrade Aríete ativo.'
  },

  // --- Defesa, Dano e Vitalidade ---
  shield_absorb: {
    id: 'player_shield_absorb',
    file: null,
    durationMs: 320,
    delayMs: 0,
    cooldownMs: 100,
    volume: 0.85,
    category: 'sfx',
    spatial: false,
    loop: false,
    triggerLogic: 'Disparado quando o escudo absorve o dano de um projétil ou colisão sem esgotar completamente.'
  },
  shield_break: {
    id: 'player_shield_break',
    file: null,
    durationMs: 700,
    delayMs: 0,
    cooldownMs: 400,
    volume: 1.0,
    category: 'sfx',
    spatial: false,
    loop: false,
    triggerLogic: 'Disparado quando a energia do escudo zera e o escudo quebra (efeito de vidro estilhaçando).'
  },
  shield_regen: {
    id: 'player_shield_regen',
    file: null,
    durationMs: 450,
    delayMs: 0,
    cooldownMs: 1000,
    volume: 0.50,
    category: 'sfx',
    spatial: false,
    loop: false,
    triggerLogic: 'Disparado sutilmente no momento em que o timer de atraso de recarga zera e o escudo volta a encher.'
  },
  hull_damage: {
    id: 'player_hull_damage',
    file: null,
    durationMs: 450,
    delayMs: 0,
    cooldownMs: 200,
    volume: 0.95,
    category: 'sfx',
    spatial: false,
    loop: false,
    triggerLogic: 'Disparado quando o jogador recebe dano direto na vida do casco (sem escudo protetor).'
  },
  low_health_alarm: {
    id: 'player_low_health_alarm',
    file: null,
    durationMs: 800,
    delayMs: 0,
    cooldownMs: 0,
    volume: 0.70,
    category: 'sfx',
    spatial: false,
    loop: true,
    triggerLogic: 'Disparado em loop intermitente de alerta enquanto health <= 30% do HP máximo.'
  },
  life_lost: {
    id: 'player_life_lost',
    file: null,
    durationMs: 1100,
    delayMs: 0,
    cooldownMs: 1000,
    volume: 1.0,
    category: 'sfx',
    spatial: false,
    loop: false,
    triggerLogic: 'Disparado quando o casco chega a zero e uma vida inteira é consumida para renascer a nave.'
  },
  heal: {
    id: 'player_heal',
    file: null,
    durationMs: 500,
    delayMs: 0,
    cooldownMs: 300,
    volume: 0.85,
    category: 'sfx',
    spatial: false,
    loop: false,
    triggerLogic: 'Disparado quando o jogador recupera HP (coleta de orbe ou cura de carta).'
  },
  game_over: {
    id: 'player_game_over',
    file: null,
    durationMs: 3200,
    delayMs: 100,
    cooldownMs: 0,
    volume: 1.0,
    category: 'sfx',
    spatial: false,
    loop: false,
    triggerLogic: 'Disparado no momento da destruição final da nave após esgotar a última vida.'
  },
}

// ============================================================================
// 2. ESQUADRÃO (Wingmen) — Pilotos Aliados e Habilidades Únicas
// ============================================================================
export const WINGMAN_SOUND_CUES = {
  // --- Comportamentos Gerais do Esquadrão ---
  laser_fire: {
    id: 'wingman_laser_fire',
    file: null,
    durationMs: 220,
    delayMs: 0,
    cooldownMs: 90,
    volume: 0.65,
    category: 'sfx',
    spatial: true,
    loop: false,
    triggerLogic: 'Disparado a cada tiro de laser efetuado por qualquer piloto aliado durante patrulha ou dogfight.'
  },
  support_volley: {
    id: 'wingman_support_volley',
    file: null,
    durationMs: 300,
    delayMs: 0,
    cooldownMs: 150,
    volume: 0.70,
    category: 'sfx',
    spatial: true,
    loop: false,
    triggerLogic: 'Disparado quando companheiros em formação acompanham sincronicamente o disparo do líder.'
  },
  dogfight_engage: {
    id: 'wingman_dogfight_engage',
    file: null,
    durationMs: 650,
    delayMs: 0,
    cooldownMs: 1000,
    volume: 0.75,
    category: 'voice',
    spatial: true,
    loop: false,
    triggerLogic: 'Disparado quando um companheiro avista um alvo e quebra a formação para perseguição individual.'
  },
  command_focus_toggle: {
    id: 'wingman_command_focus_toggle',
    file: null,
    durationMs: 400,
    delayMs: 0,
    cooldownMs: 300,
    volume: 0.85,
    category: 'sfx',
    spatial: false,
    loop: false,
    triggerLogic: 'Bip tático de alta frequência disparado quando o jogador aperta [D] para focar fogo do esquadrão.'
  },
  command_free_toggle: {
    id: 'wingman_command_free_toggle',
    file: null,
    durationMs: 350,
    delayMs: 0,
    cooldownMs: 300,
    volume: 0.75,
    category: 'sfx',
    spatial: false,
    loop: false,
    triggerLogic: 'Bip de desativação quando o comando de foco expira ou é cancelado manualmente para voo livre.'
  },
  flyby_whoosh: {
    id: 'wingman_flyby_whoosh',
    file: null,
    durationMs: 700,
    delayMs: 0,
    cooldownMs: 800,
    volume: 0.60,
    category: 'sfx',
    spatial: true,
    loop: false,
    triggerLogic: 'Disparado quando um caça aliado corta a tela rente à câmera em manobra de retorno.'
  },
  pilot_hit: {
    id: 'wingman_pilot_hit',
    file: null,
    durationMs: 600,
    delayMs: 0,
    cooldownMs: 500,
    volume: 0.80,
    category: 'voice',
    spatial: true,
    loop: false,
    triggerLogic: 'Vocalização de rádio quando a nave de um aliado é alvejada por fogo inimigo.'
  },

  // --- Habilidades Únicas por Personagem ---
  falco_ram: {
    id: 'wingman_falco_ram',
    file: null,
    durationMs: 1400,
    delayMs: 0,
    cooldownMs: 2000,
    volume: 0.95,
    category: 'sfx',
    spatial: true,
    loop: false,
    triggerLogic: 'Falco (Ás Interceptor) acelera violentamente em investida aríete contra o inimigo selecionado.'
  },
  peppy_guard: {
    id: 'wingman_peppy_guard',
    file: null,
    durationMs: 900,
    delayMs: 0,
    cooldownMs: 2000,
    volume: 0.85,
    category: 'sfx',
    spatial: true,
    loop: false,
    triggerLogic: 'Peppy (Defensor Blindado) acopla na ala direita do jogador e transfere 1 carga completa de escudo.'
  },
  slippy_repair: {
    id: 'wingman_slippy_repair',
    file: null,
    durationMs: 600,
    delayMs: 0,
    cooldownMs: 1500,
    volume: 0.85,
    category: 'sfx',
    spatial: true,
    loop: false,
    triggerLogic: 'Slippy (Batedor Solar) acerta um disparo crítico gerando um Orbe de Reparo de Campo no local.'
  },
  phantom_assist: {
    id: 'wingman_phantom_assist',
    file: null,
    durationMs: 800,
    delayMs: 0,
    cooldownMs: 2000,
    volume: 0.85,
    category: 'sfx',
    spatial: true,
    loop: false,
    triggerLogic: 'Krystal (Vanguarda Fantasma) sincroniza sistemas de armas, acelerando o tempo de carga em +50%.'
  },
}

// ============================================================================
// 3. INIMIGOS (Enemies) — Disparos, Telegraphs, Morte e Habilidades de Classe
// ============================================================================
export const ENEMY_SOUND_CUES = {
  // --- Inimigos Genéricos & Blasters ---
  blaster_fire: {
    id: 'enemy_blaster_fire',
    file: null,
    durationMs: 260,
    delayMs: 0,
    cooldownMs: 70,
    volume: 0.70,
    category: 'sfx',
    spatial: true,
    loop: false,
    triggerLogic: 'Disparo de projétil laser vermelho saindo da proa de Blasters, Tanques ou inimigos normais.'
  },
  blaster_telegraph: {
    id: 'enemy_blaster_telegraph',
    file: null,
    durationMs: 300,
    delayMs: 0,
    cooldownMs: 120,
    volume: 0.55,
    category: 'sfx',
    spatial: true,
    loop: false,
    triggerLogic: 'Chime agudo de aviso disparado ~0.3s antes do disparo enquanto o canhão brilha em telegraph.'
  },
  blaster_spin_damage: {
    id: 'enemy_blaster_spin_damage',
    file: null,
    durationMs: 500,
    delayMs: 0,
    cooldownMs: 200,
    volume: 0.80,
    category: 'sfx',
    spatial: true,
    loop: false,
    triggerLogic: 'Asa quebrando e motor falhando quando o Blaster sofre dano não-letal e entra em parafuso.'
  },
  enemy_explosion_small: {
    id: 'enemy_explosion_small',
    file: null,
    durationMs: 700,
    delayMs: 0,
    cooldownMs: 50,
    volume: 0.85,
    category: 'sfx',
    spatial: true,
    loop: false,
    triggerLogic: 'Explosão de destruição de naves inimigas leves e médias (Blaster, Sentinela, Mini-Swarm).'
  },
  squad_wipe: {
    id: 'enemy_squad_wipe',
    file: null,
    durationMs: 900,
    delayMs: 0,
    cooldownMs: 500,
    volume: 0.95,
    category: 'sfx',
    spatial: false,
    loop: false,
    triggerLogic: 'Fanfarra de bônus arcade disparada quando todos os caças de uma esquadrilha são abatidos.'
  },

  // --- Chefe (Boss - Destruidor Dimensional) ---
  boss_entrance: {
    id: 'boss_entrance',
    file: null,
    durationMs: 3200,
    delayMs: 0,
    cooldownMs: 0,
    volume: 1.0,
    category: 'sfx',
    spatial: true,
    loop: false,
    triggerLogic: 'Rugido metálico e turbinas dimensionais no momento em que o Chefe surge na arena.'
  },
  boss_volley: {
    id: 'boss_volley',
    file: null,
    durationMs: 800,
    delayMs: 0,
    cooldownMs: 400,
    volume: 0.85,
    category: 'sfx',
    spatial: true,
    loop: false,
    triggerLogic: 'Disparo de rajada em arco de orbes de plasma pesados em direção ao jogador.'
  },
  boss_laser_charge: {
    id: 'boss_laser_charge',
    file: null,
    durationMs: 1400,
    delayMs: 0,
    cooldownMs: 1000,
    volume: 0.90,
    category: 'sfx',
    spatial: true,
    loop: false,
    triggerLogic: 'Zumbido crescente e ressonância de alta energia durante o telegraph do canhão laser principal.'
  },
  boss_laser_fire: {
    id: 'boss_laser_fire',
    file: null,
    durationMs: 2200,
    delayMs: 0,
    cooldownMs: 1000,
    volume: 1.0,
    category: 'sfx',
    spatial: true,
    loop: false,
    triggerLogic: 'Feixe contínuo massivo do laser de partículas disparado através de toda a arena.'
  },
  boss_shield_activate: {
    id: 'boss_shield_activate',
    file: null,
    durationMs: 650,
    delayMs: 0,
    cooldownMs: 800,
    volume: 0.85,
    category: 'sfx',
    spatial: true,
    loop: false,
    triggerLogic: 'Cúpula holográfica de barreira de energia se armando ao redor do núcleo do Chefe.'
  },
  boss_shield_deflect: {
    id: 'boss_shield_deflect',
    file: null,
    durationMs: 350,
    delayMs: 0,
    cooldownMs: 70,
    volume: 0.80,
    category: 'sfx',
    spatial: true,
    loop: false,
    triggerLogic: 'Clang de energia quando tiros do jogador colidem e são ricocheteados pelo escudo do Chefe.'
  },
  boss_phase_transition: {
    id: 'boss_phase_transition',
    file: null,
    durationMs: 1600,
    delayMs: 0,
    cooldownMs: 0,
    volume: 1.0,
    category: 'sfx',
    spatial: true,
    loop: false,
    triggerLogic: 'Sobrecarga de sistemas, estilhaços e sirene de emergência na troca de fase (1→2 ou 2→3).'
  },
  boss_critical_damage: {
    id: 'boss_critical_damage',
    file: null,
    durationMs: 500,
    delayMs: 0,
    cooldownMs: 120,
    volume: 0.90,
    category: 'sfx',
    spatial: true,
    loop: false,
    triggerLogic: 'Impacto potente ao acertar o núcleo exposto desprotegido do Chefe.'
  },
  boss_death_sequence: {
    id: 'boss_death_sequence',
    file: null,
    durationMs: 4200,
    delayMs: 0,
    cooldownMs: 0,
    volume: 1.0,
    category: 'sfx',
    spatial: true,
    loop: false,
    triggerLogic: 'Sequência encadeada de 3 grandes explosões culminando na aniquilação total do Chefe.'
  },

  // --- Anomalia Dourada (Golden Boss) ---
  golden_entrance: {
    id: 'golden_entrance',
    file: null,
    durationMs: 2400,
    delayMs: 0,
    cooldownMs: 0,
    volume: 0.95,
    category: 'sfx',
    spatial: true,
    loop: false,
    triggerLogic: 'Fenda quântica se abrindo com som cristalino na entrada da Anomalia Dourada.'
  },
  golden_straight_volley: {
    id: 'golden_straight_volley',
    file: null,
    durationMs: 650,
    delayMs: 0,
    cooldownMs: 300,
    volume: 0.80,
    category: 'sfx',
    spatial: true,
    loop: false,
    triggerLogic: 'Disparo de dardos dourados de hipervelocidade em linha reta.'
  },
  golden_drone_launch: {
    id: 'golden_drone_launch',
    file: null,
    durationMs: 550,
    delayMs: 0,
    cooldownMs: 400,
    volume: 0.80,
    category: 'sfx',
    spatial: true,
    loop: false,
    triggerLogic: 'Desacoplamento e lançamento de drones miniaturizados teleguiados.'
  },
  golden_laser_fire: {
    id: 'golden_laser_fire',
    file: null,
    durationMs: 2000,
    delayMs: 0,
    cooldownMs: 1000,
    volume: 1.0,
    category: 'sfx',
    spatial: true,
    loop: false,
    triggerLogic: 'Disparo do laser dourado colossal que varre transversalmente o campo de visão.'
  },
  golden_teleport: {
    id: 'golden_teleport',
    file: null,
    durationMs: 420,
    delayMs: 0,
    cooldownMs: 300,
    volume: 0.85,
    category: 'sfx',
    spatial: true,
    loop: false,
    triggerLogic: 'Whoosh e estalo eletrostático no desaparecimento e reaparição súbita da Anomalia.'
  },
  golden_cataclysm_death: {
    id: 'golden_cataclysm_death',
    file: null,
    durationMs: 3800,
    delayMs: 0,
    cooldownMs: 0,
    volume: 1.0,
    category: 'sfx',
    spatial: true,
    loop: false,
    triggerLogic: 'Implosão cataclísmica acompanhada de clarão branco ao derrotar a Anomalia Dourada.'
  },

  // --- Sentinela (Sentinela) ---
  sentinela_pulse: {
    id: 'sentinela_pulse',
    file: null,
    durationMs: 300,
    delayMs: 0,
    cooldownMs: 200,
    volume: 0.65,
    category: 'sfx',
    spatial: true,
    loop: false,
    triggerLogic: 'Pulso rítmico mecânico enquanto a moldura expande e contrai em sincronia com o trilho.'
  },
  sentinela_gate_fire: {
    id: 'sentinela_gate_fire',
    file: null,
    durationMs: 420,
    delayMs: 0,
    cooldownMs: 180,
    volume: 0.75,
    category: 'sfx',
    spatial: true,
    loop: false,
    triggerLogic: 'Disparo de plasma energizado dos vértices da moldura retangular da Sentinela.'
  },
  sentinela_crush: {
    id: 'sentinela_crush',
    file: null,
    durationMs: 850,
    delayMs: 0,
    cooldownMs: 500,
    volume: 1.0,
    category: 'sfx',
    spatial: true,
    loop: false,
    triggerLogic: 'Fechamento rápido da abertura da moldura esmagando o jogador que não desviou a tempo.'
  },
  sentinela_escape: {
    id: 'sentinela_escape',
    file: null,
    durationMs: 950,
    delayMs: 0,
    cooldownMs: 0,
    volume: 0.80,
    category: 'sfx',
    spatial: true,
    loop: false,
    triggerLogic: 'Impulso supersônico de fuga quando a Sentinela encerra seu 4º ciclo de disparo e vai embora.'
  },

  // --- Verme de Fogo (Verme) ---
  verme_segment_break: {
    id: 'verme_segment_break',
    file: null,
    durationMs: 480,
    delayMs: 0,
    cooldownMs: 80,
    volume: 0.85,
    category: 'sfx',
    spatial: true,
    loop: false,
    triggerLogic: 'Som de corrente metálica estalando e partindo ao abater qualquer elo do corpo do Verme.'
  },
  verme_head_dive: {
    id: 'verme_head_dive',
    file: null,
    durationMs: 700,
    delayMs: 0,
    cooldownMs: 500,
    volume: 0.75,
    category: 'sfx',
    spatial: true,
    loop: false,
    triggerLogic: 'Whoosh senoidal da cabeça do Verme serpenteando pelo espaço do trilho.'
  },
  verme_death: {
    id: 'verme_death',
    file: null,
    durationMs: 1300,
    delayMs: 0,
    cooldownMs: 0,
    volume: 0.95,
    category: 'sfx',
    spatial: true,
    loop: false,
    triggerLogic: 'Explosão em cadeia destruindo o último elo/cabeça do Verme de Fogo.'
  },

  // --- Sussurro (Sussurro) ---
  sussurro_cloak_pulse: {
    id: 'sussurro_cloak_pulse',
    file: null,
    durationMs: 520,
    delayMs: 0,
    cooldownMs: 300,
    volume: 0.60,
    category: 'sfx',
    spatial: true,
    loop: false,
    triggerLogic: 'Pulso etéreo de distorção ótica ao transitar entre camuflagem invisível e visível.'
  },
  sussurro_summon: {
    id: 'sussurro_summon',
    file: null,
    durationMs: 1100,
    delayMs: 0,
    cooldownMs: 1000,
    volume: 0.85,
    category: 'sfx',
    spatial: true,
    loop: false,
    triggerLogic: 'Transmissão sub-espacial acionando reforços hostis para emboscar o jogador.'
  },
  sussurro_fire: {
    id: 'sussurro_fire',
    file: null,
    durationMs: 320,
    delayMs: 0,
    cooldownMs: 100,
    volume: 0.70,
    category: 'sfx',
    spatial: true,
    loop: false,
    triggerLogic: 'Tiro de alta precisão disparado silenciosamente de longa distância.'
  },

  // --- Mini-Swarm (Enxame de Caças Ligeiros) ---
  mini_swarm_dive_telegraph: {
    id: 'mini_swarm_dive_telegraph',
    file: null,
    durationMs: 380,
    delayMs: 0,
    cooldownMs: 150,
    volume: 0.65,
    category: 'sfx',
    spatial: true,
    loop: false,
    triggerLogic: 'Zumbido de inseto mecânico precedendo o mergulho rasante das mini-naves.'
  },
  mini_swarm_whoosh: {
    id: 'mini_swarm_whoosh',
    file: null,
    durationMs: 650,
    delayMs: 0,
    cooldownMs: 100,
    volume: 0.75,
    category: 'sfx',
    spatial: true,
    loop: false,
    triggerLogic: 'Whoosh rápido de ar e propulsão quando o enxame cruza a tela em formação voadora.'
  },
  mini_swarm_kamikaze: {
    id: 'mini_swarm_kamikaze',
    file: null,
    durationMs: 500,
    delayMs: 0,
    cooldownMs: 80,
    volume: 0.80,
    category: 'sfx',
    spatial: true,
    loop: false,
    triggerLogic: 'Impacto violento de colisão kamikaze do mini-caça contra o casco ou escudo da nave.'
  },

  // --- Fragata com Blindagem (Fragata) ---
  fragata_shield_deflect: {
    id: 'fragata_shield_deflect',
    file: null,
    durationMs: 420,
    delayMs: 0,
    cooldownMs: 60,
    volume: 0.85,
    category: 'sfx',
    spatial: true,
    loop: false,
    triggerLogic: 'Clang metálico maciço quando um tiro atinge as placas blindadas da Fragata.'
  },
  fragata_plate_rotate: {
    id: 'fragata_plate_rotate',
    file: null,
    durationMs: 850,
    delayMs: 0,
    cooldownMs: 0,
    volume: 0.50,
    category: 'sfx',
    spatial: true,
    loop: true,
    triggerLogic: 'Rangido de engrenagens mecânicas durante a rotação contínua dos escudos rotativos.'
  },
  fragata_cannon_fire: {
    id: 'fragata_cannon_fire',
    file: null,
    durationMs: 580,
    delayMs: 0,
    cooldownMs: 300,
    volume: 0.85,
    category: 'sfx',
    spatial: true,
    loop: false,
    triggerLogic: 'Tiro de canhão pesado com reverberação profunda disparado das torres da Fragata.'
  },

  // --- Inimigo Ampulheta (Time Enemy) ---
  time_enemy_tick: {
    id: 'time_enemy_tick',
    file: null,
    durationMs: 1000,
    delayMs: 0,
    cooldownMs: 0,
    volume: 0.45,
    category: 'ambient',
    spatial: true,
    loop: true,
    triggerLogic: 'Tique-taque mecânico contínuo emanando dos anéis giratórios do inimigo temporal.'
  },
  time_bonus_chime: {
    id: 'time_bonus_chime',
    file: null,
    durationMs: 850,
    delayMs: 0,
    cooldownMs: 200,
    volume: 0.95,
    category: 'sfx',
    spatial: true,
    loop: false,
    triggerLogic: 'Chime cristalino premiando o jogador com redução de -3s no tempo da fase.'
  },
  time_mega_laser: {
    id: 'time_mega_laser',
    file: null,
    durationMs: 1200,
    delayMs: 0,
    cooldownMs: 800,
    volume: 0.90,
    category: 'sfx',
    spatial: true,
    loop: false,
    triggerLogic: 'Disparo do laser acelerador da Ampulheta Mega.'
  },

  // --- Enxame-Ímã (Ima) ---
  ima_magnetic_hum: {
    id: 'ima_magnetic_hum',
    file: null,
    durationMs: 1200,
    delayMs: 0,
    cooldownMs: 0,
    volume: 0.55,
    category: 'ambient',
    spatial: true,
    loop: true,
    triggerLogic: 'Hum elétrico pulsante gerado pelo campo gravitacional/magnético do enxame.'
  },
  ima_deflect_shot: {
    id: 'ima_deflect_shot',
    file: null,
    durationMs: 350,
    delayMs: 0,
    cooldownMs: 50,
    volume: 0.75,
    category: 'sfx',
    spatial: true,
    loop: false,
    triggerLogic: 'Whoosh distorcido no momento em que um tiro normal do jogador é curvado pelo campo.'
  },

  // --- Réplica Fantasma (Replica) ---
  replica_spawn: {
    id: 'replica_spawn',
    file: null,
    durationMs: 650,
    delayMs: 0,
    cooldownMs: 500,
    volume: 0.70,
    category: 'sfx',
    spatial: true,
    loop: false,
    triggerLogic: 'Ressonância espectral no surgimento do eco que espelha os movimentos do jogador.'
  },
  replica_fire: {
    id: 'replica_fire',
    file: null,
    durationMs: 250,
    delayMs: 0,
    cooldownMs: 90,
    volume: 0.70,
    category: 'sfx',
    spatial: true,
    loop: false,
    triggerLogic: 'Tiro espelhado da réplica acompanhando o histórico de disparos do jogador.'
  },

  // --- Detritos e Asteroides (Debris) ---
  debris_shatter: {
    id: 'debris_shatter',
    file: null,
    durationMs: 550,
    delayMs: 0,
    cooldownMs: 60,
    volume: 0.85,
    category: 'sfx',
    spatial: true,
    loop: false,
    triggerLogic: 'Estilhaço mineral seco e estalo de fragmentação ao destruir um asteroide com tiro.'
  },
  debris_titanic_shatter: {
    id: 'debris_titanic_shatter',
    file: null,
    durationMs: 1500,
    delayMs: 0,
    cooldownMs: 500,
    volume: 1.0,
    category: 'sfx',
    spatial: true,
    loop: false,
    triggerLogic: 'Estrondo grave de baixa frequência e esfarelamento de asteroide titânico.'
  },
}

// ============================================================================
// 4. DESPACHANTE SEGURO DE GATILHOS DE ÁUDIO (Safe Audio Trigger Dispatcher)
// ============================================================================
// Permite que qualquer subsistema do jogo dispare um Sound Cue passando parâmetros
// contextuais (posição mundial, alvo, intensidade). Como nenhum arquivo de som
// está carregado ainda (`file: null`), este despachante apenas repassa para um
// handler registrado (ex: futuro createAudioSystem), permanecendo como no-op seguro
// sem quebrar execução, sem gerar ruído no console e sem alocar memória desnecessária.

let _activeAudioHandler = null

/**
 * Registra o manipulador ativo de áudio do jogo (usado pelo futuro createAudioSystem).
 * @param {Function} handler - Função com assinatura (cue, params) => void
 */
export function registerAudioHandler(handler) {
  _activeAudioHandler = typeof handler === 'function' ? handler : null
}

/**
 * Dispara um Sound Cue pré-configurado.
 * @param {SoundCue} cue - Objeto SoundCue com timing, duração e lógica
 * @param {Object} [params] - Parâmetros do momento da chamada (ex: { worldPos, entityId, volumeMult })
 */
export function triggerSoundCue(cue, params = {}) {
  if (!cue || !cue.id) return
  if (_activeAudioHandler) {
    try {
      _activeAudioHandler(cue, params)
    } catch {
      // Falhas no áudio jamais quebram o laço de renderização ou combate
    }
  } else if (typeof window !== 'undefined' && window.__starAnkiAudio && typeof window.__starAnkiAudio.onSoundCue === 'function') {
    try {
      window.__starAnkiAudio.onSoundCue(cue, params)
    } catch {
      // No-op seguro
    }
  }
}

/**
 * Retorna todos os Sound Cues registrados no sistema agrupados por entidade.
 */
export function getAllRegisteredCues() {
  return {
    player: PLAYER_SOUND_CUES,
    wingmen: WINGMAN_SOUND_CUES,
    enemies: ENEMY_SOUND_CUES,
  }
}
