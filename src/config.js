/**
 * Valores centrales del juego. Todo el balanceo vive aquí.
 */

// ────────────────────────── Jugador ──────────────────────────

export const PLAYER = {
  height: 1.7,
  crouchHeight: 1.1,
  radius: 0.38,
  walkSpeed: 5.4,
  sprintSpeed: 8.6,
  accel: 52,
  friction: 11,
  jumpVelocity: 6.2,
  gravity: -19,
  maxHealth: 100,
  regenDelay: 6.5, // s sin recibir daño antes de regenerar
  regenRate: 9, // PV/s
};

export const CAMERA = {
  fov: 76,
  near: 0.06,
  far: 260,
  pitchLimit: Math.PI / 2 - 0.02,
};

// ────────────────────────── Armas ──────────────────────────

/** Niveles máximos de mejora admitidos por arma. */
export const MAX_WEAPON_LEVEL = 3;

/**
 * Multiplicadores aplicados por cada nivel de mejora.
 * Cadencia: menor intervalo = más disparos por segundo.
 */
export const UPGRADE = {
  damage: 1.35, // x1.35 de daño por nivel
  fireRate: 0.82, // x0.82 de intervalo por nivel (=> +22% cadencia)
  magazine: 1.5, // x1.5 de cargador por nivel
};

/**
 * Catálogo de armas. `interval` está en segundos entre disparos.
 */
export const WEAPONS = [
  {
    id: 'pistol',
    name: 'Pistola',
    slot: 1,
    price: 0,
    damage: 26,
    interval: 0.3,
    magazine: 12,
    reloadTime: 1.05,
    reserve: 96,
    pellets: 1,
    spread: 0.008,
    auto: false,
    recoil: 1.1,
    sound: 'pistol',
    model: { body: [0.1, 0.15, 0.3], barrel: [0.045, 0.045, 0.22], mag: [0.07, 0.16, 0.09], tint: 0x2f3540 },
    upgradeCosts: [200, 380, 700],
    desc: 'Fiable y precisa. No falla, pero tampoco mata zombies de un tiro.',
  },
  {
    id: 'shotgun',
    name: 'Escopeta',
    slot: 2,
    price: 520,
    damage: 15, // por perdigón
    interval: 0.78,
    magazine: 6,
    reloadTime: 2.1,
    reserve: 54,
    pellets: 9,
    spread: 0.072,
    auto: false,
    recoil: 3.2,
    sound: 'shotgun',
    model: { body: [0.12, 0.14, 0.46], barrel: [0.07, 0.07, 0.44], mag: [0.08, 0.1, 0.12], tint: 0x4a3a28 },
    upgradeCosts: [340, 640, 1150],
    desc: '9 perdigones. Devastadora de cerca, inútil a distancia.',
  },
  {
    id: 'smg',
    name: 'Subfusil',
    slot: 3,
    price: 1050,
    damage: 16,
    interval: 0.072,
    magazine: 32,
    reloadTime: 1.35,
    reserve: 224,
    pellets: 1,
    spread: 0.032,
    auto: true,
    recoil: 0.55,
    sound: 'smg',
    model: { body: [0.1, 0.16, 0.36], barrel: [0.05, 0.05, 0.26], mag: [0.07, 0.22, 0.08], tint: 0x26332c },
    upgradeCosts: [480, 900, 1600],
    desc: 'Cadencia brutal. Gastará tu cargador en segundos.',
  },
  {
    id: 'rifle',
    name: 'Fusil',
    slot: 4,
    price: 2200,
    damage: 36,
    interval: 0.105,
    magazine: 30,
    reloadTime: 1.95,
    reserve: 210,
    pellets: 1,
    spread: 0.014,
    auto: true,
    recoil: 1.35,
    sound: 'rifle',
    model: { body: [0.11, 0.16, 0.52], barrel: [0.05, 0.05, 0.36], mag: [0.07, 0.2, 0.1], tint: 0x33291f },
    upgradeCosts: [640, 1200, 2100],
    desc: 'Equilibrio perfecto entre daño, precisión y alcance.',
  },
  {
    id: 'minigun',
    name: 'Minigun',
    slot: 5,
    price: 4200,
    damage: 21,
    interval: 0.042,
    magazine: 180,
    reloadTime: 3.4,
    reserve: 720,
    pellets: 1,
    spread: 0.05,
    auto: true,
    recoil: 0.5,
    sound: 'minigun',
    model: { body: [0.16, 0.19, 0.46], barrel: [0.1, 0.1, 0.3], mag: [0.11, 0.16, 0.12], tint: 0x23262b },
    upgradeCosts: [950, 1800, 3200],
    desc: 'Lluvia de balas. Un hillside entero cae en segundos.',
  },
];

export const WEAPON_BY_ID = Object.fromEntries(WEAPONS.map((w) => [w.id, w]));

// ────────────────────────── Zombies ──────────────────────────

export const ZOMBIE_TYPES = {
  walker: {
    id: 'walker',
    name: 'Caminante',
    hp: 52,
    speed: 2.15,
    damage: 9,
    attackRate: 1.1,
    radius: 0.42,
    height: 1.85,
    color: 0x6f8f5a,
    score: 10,
    attackRange: 1.25,
    fromRound: 1,
  },
  runner: {
    id: 'runner',
    name: 'Corredor',
    hp: 36,
    speed: 4.4,
    damage: 7,
    attackRate: 0.75,
    radius: 0.36,
    height: 1.7,
    color: 0xb9a13c,
    score: 18,
    attackRange: 1.15,
    fromRound: 3,
  },
  brute: {
    id: 'brute',
    name: 'Bruto',
    hp: 240,
    speed: 1.55,
    damage: 26,
    attackRate: 1.6,
    radius: 0.72,
    height: 2.5,
    color: 0x8e5a86,
    score: 45,
    attackRange: 1.85,
    fromRound: 5,
    knockbackResist: 0.85,
  },
};

export const ZOMBIE = {
  maxAlive: 90,
  scaling: {
    hpPerRound: 0.16, // +16% vida por oleada
    hpCap: 6.5, // multiplicador máximo
    damagePerRound: 0.07,
    damageCap: 5.0,
    speedPerRound: 0.035,
    speedCap: 0.55, // +55% velocidad
  },
  separation: 9, // fuerza de separación entre zombies
  wallPush: 14,
};

// ────────────────────────── Oleadas ──────────────────────────

export const ROUND = {
  /** Tiempo de calma entre oleadas para recargar y comprar. */
  intermission: 25,
  /** Enemigos en la oleada 1 (crece de forma exponencial suave). */
  baseCount: 6,
  countPerRound: 2.6,
  countGrowth: 1.13,
  countCap: 70,
  /** Segundos entre tandas de aparición. */
  spawnIntervalBase: 1.5,
  spawnIntervalMin: 0.22,
  batchBase: 1,
  batchGrowth: 1.12,
  batchCap: 7,
  /** Bonus por completar la oleada. */
  clearBonus: 90,
  clearBonusPerRound: 55,
  /** Progresión de tipos. */
  runnerChanceFrom: 3,
  bruteChanceFrom: 5,
};

// ────────────────────────── Economía ──────────────────────────

export const SHOP_ITEMS = [
  {
    id: 'ammo_light',
    name: 'Munición ligera',
    desc: 'Rellena la reserva de todas tus armas.',
    price: 220,
    icon: '▮',
    repeat: true,
    action: (arsenal) => arsenal.refillReserve(1),
  },
  {
    id: 'ammo_big',
    name: 'Caja de munición',
    desc: 'Rellena la reserva al doble y cura 40 PV.',
    price: 480,
    icon: '▤',
    repeat: true,
    action: (arsenal) => {
      arsenal.refillReserve(2);
      return { heal: 40 };
    },
  },
  {
    id: 'medkit',
    name: 'Botiquín',
    desc: 'Recupera 60 PV al instante.',
    price: 300,
    icon: '✚',
    repeat: true,
    action: () => ({ heal: 60 }),
  },
  {
    id: 'adrenaline',
    name: 'Adrenalina',
    desc: 'Aumenta un 8% tu velocidad de movimiento (permanente, acumulable).',
    price: 900,
    icon: '⚡',
    repeat: true,
    max: 6,
    action: (arsenal, player) => player.addSpeedBonus(0.08),
  },
  {
    id: 'armor',
    name: 'Placas de acero',
    desc: '+15 PV máximos y repara tu vida al máximo.',
    price: 1200,
    icon: '▣',
    repeat: true,
    max: 5,
    action: (arsenal, player) => player.addMaxHealth(15),
  },
];

// ────────────────────────── Mundo ──────────────────────────

export const ARENA = {
  half: 38, // semiancho del recinto (76 x 76 unidades)
  wallHeight: 6,
  wallThickness: 1.2,
  propCount: 34,
  fogNear: 16,
  fogFar: 88,
};