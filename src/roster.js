// The 21-character roster.
//
// Kit colours are sampled out of the generated character art (two shoulder
// strips either side of where the ball is held, skin and leather hues
// filtered). The sampler got 17 of 21; BIG MAN and LIL MAN have bare
// shoulders so it returned skin, TOWER's tank is black at the shoulder, and
// SHADE's hoodie read as the brown of the ball. Those four are set by hand.
//
// Every character is rated 0-100 on eight attributes, and every rating
// drives something you can feel on the field — see ATTR_RANGES below for
// exactly what each one moves. Each also carries one standout and one real
// flaw, so a pick is a trade rather than a ranking.

// attribute -> [value at rating 0, value at rating 100] as a multiplier on
// the game's base figure.
export const ATTR_RANGES = {
  speed:    [0.80, 1.20], // top speed
  accel:    [0.70, 1.30], // how fast he gets there, and how fast he stops
  agility:  [0.78, 1.26], // turning, and how well a juke or spin sells
  power:    [0.70, 1.34], // breaking tackles, and trucking
  tackling: [0.72, 1.30], // making a tackle stick when he is the one hitting
  blocking: [0.65, 1.35], // holding a block
  hands:    [0.82, 1.22], // catch radius; low hands also drop passes
  stamina:  [0.72, 1.28], // turbo drain and recovery
};

export const ATTR_KEYS = Object.keys(ATTR_RANGES);

// Rating (0-100) to the multiplier the game actually uses.
export function mul(attr, rating) {
  const [lo, hi] = ATTR_RANGES[attr];
  return lo + (hi - lo) * Math.max(0, Math.min(100, rating)) / 100;
}

const C = (id, name, art, kit, height, girth, a, best, flaw) => ({
  id, name, art, kit,
  build: { height, girth },
  attr: {
    speed: a[0], accel: a[1], agility: a[2], power: a[3],
    tackling: a[4], blocking: a[5], hands: a[6], stamina: a[7],
  },
  best, flaw,
});

//                id            name       art                 kit        h     g     [spd acc agi pow tkl blk hnd sta]
export const CHARACTERS = [
  C('speedster',  'FLASH',   '01-speedster',     '#4c9e16', 1.00, 0.88, [96, 92, 88, 30, 35, 25, 68, 60], 'TOP-END SPEED',     'GETS BULLIED'),
  C('tall',       'STRETCH', '02-tall-receiver', '#ea4f09', 1.14, 0.84, [82, 70, 60, 45, 40, 35, 94, 65], 'CATCH RADIUS',      'SLOW OFF THE LINE'),
  C('bruiser',    'TANK',    '03-bruiser',       '#2d2e4c', 0.90, 1.22, [48, 62, 40, 92, 88, 90, 40, 70], 'WRECKING BALL',     'NO SPEED'),
  C('qb',         'CAP',     '04-quarterback',   '#cf1317', 1.02, 1.00, [65, 68, 70, 58, 45, 45, 80, 80], 'STEADY HANDS',      'AVERAGE EVERYWHERE'),
  C('bigman',     'HOUSE',   '05-big-man',       '#9aa3ad', 1.08, 1.40, [32, 40, 25, 99, 92, 99, 35, 45], 'IMMOVABLE',         'GASSES FAST'),
  C('kid',        'LIL MAN', '06-kid',           '#e8c927', 0.82, 0.80, [92, 96, 95, 18, 25, 15, 72, 85], 'UNTOUCHABLE JUKE',  'NO STRENGTH'),
  C('veteran',    'POPS',    '07-veteran',       '#713324', 1.00, 1.12, [52, 55, 58, 70, 82, 78, 85, 50], 'READS EVERYTHING',  'LEGS ARE GONE'),
  C('showman',    'FLEX',    '08-showman',       '#9405ae', 1.02, 0.98, [84, 80, 86, 55, 50, 40, 78, 62], 'SHOWSTOPPER',       'ALL FLASH'),
  C('throwback',  'LEATHER', '09-throwback',     '#fee9b7', 0.98, 1.18, [55, 60, 45, 84, 86, 88, 55, 90], 'NEVER TIRES',       'STONE HANDS'),
  C('punk',       'SPIKE',   '10-punk',          '#4175a6', 1.00, 0.95, [78, 82, 76, 66, 72, 55, 60, 68], 'PLAYS DIRTY',       'UNDISCIPLINED'),
  C('sprinter',   'JETS',    '11-sprinter',      '#028c8f', 1.03, 0.90, [99, 88, 70, 35, 30, 28, 62, 55], 'FASTEST ON THE LOT','ONE TRICK'),
  C('shirtless',  'BRICK',   '12-shirtless',     '#e69a61', 1.06, 1.32, [44, 58, 35, 96, 90, 94, 38, 58], 'TRUCKS ANYONE',     'CANNOT CUT'),
  C('hoodie',     'SHADE',   '13-hoodie',        '#3a3f44', 1.00, 1.02, [72, 74, 72, 64, 68, 62, 70, 72], 'NO WEAKNESS',       'NO STANDOUT'),
  C('classic',    'DUKE',    '14-classic',       '#094a99', 1.01, 1.00, [70, 72, 66, 68, 70, 72, 82, 75], 'RELIABLE',          'NEVER SPECTACULAR'),
  C('hooper',     'TOWER',   '15-hooper',        '#feca0a', 1.16, 0.82, [76, 64, 55, 48, 44, 42, 97, 60], 'WINS JUMP BALLS',   'PUSHED OFF ROUTES'),
  C('worker',     'BOOTS',   '16-working-man',   '#d26a2d', 0.94, 1.15, [50, 66, 48, 82, 84, 86, 52, 95], 'WORKS ALL DAY',     'HEAVY FEET'),
  C('technician', 'WIRE',    '17-technician',    '#efeef4', 0.99, 0.92, [80, 86, 90, 42, 48, 38, 76, 70], 'ROUTE TECHNICIAN',  'LIGHT FRAME'),
  C('puffer',     'BULK',    '18-puffer',        '#c4271c', 1.04, 1.28, [46, 52, 38, 90, 86, 92, 44, 54], 'ROAD GRADER',       'SLOW TO TURN'),
  C('pinnie',     'STUB',    '19-pinnie',        '#fed404', 0.88, 1.10, [62, 78, 68, 76, 78, 80, 56, 82], 'LOW CENTRE OF GRAVITY', 'SHORT REACH'),
  C('rugby',      'SCRUM',   '20-rugby',         '#192b55', 1.01, 1.26, [54, 60, 42, 94, 96, 90, 46, 78], 'BEST TACKLER',      'CANNOT CATCH'),
  C('keeper',     'REACH',   '21-keeper',        '#9ad911', 1.09, 0.90, [74, 68, 64, 52, 58, 48, 92, 66], 'GLUE HANDS',        'AVOIDS CONTACT'),
];

export const byId = (id) => CHARACTERS.find((c) => c.id === id);

// Turn ratings into the multipliers the simulation reads, once, at draft
// time. Height also buys a little reach on a catch — a 6'5" receiver should
// come down with balls a 5'6" one cannot.
export function toMultipliers(character) {
  const a = character.attr;
  return {
    speedMul: mul('speed', a.speed),
    accelMul: mul('accel', a.accel),
    agilityMul: mul('agility', a.agility),
    powerMul: mul('power', a.power),
    tackleMul: mul('tackling', a.tackling),
    blockMul: mul('blocking', a.blocking),
    handsMul: mul('hands', a.hands) * (0.9 + character.build.height * 0.1),
    staminaMul: mul('stamina', a.stamina),
    dropChance: Math.max(0, (70 - a.hands) / 100) * 0.35,
  };
}

// What each roster position wants, as weights over the attributes. Drives
// both the CPU's draft logic and the fit badge on a draft card.
export const POSITIONS = [
  { slot: 0, key: 'QB', name: 'QUARTERBACK', wants: { hands: 2, agility: 1.5, speed: 1, stamina: 1 } },
  { slot: 1, key: 'C',  name: 'CENTER',      wants: { blocking: 3, power: 2, tackling: 1 } },
  { slot: 2, key: 'RB', name: 'RUNNING BACK',wants: { power: 2, accel: 2, agility: 1.5, speed: 1.5 } },
  { slot: 3, key: 'TE', name: 'TIGHT END',   wants: { blocking: 1.5, hands: 2, power: 1.5 } },
  { slot: 4, key: 'X',  name: 'WIDE OUT X',  wants: { speed: 2.5, hands: 2, accel: 1 } },
  { slot: 5, key: 'Y',  name: 'SLOT Y',      wants: { agility: 2.5, accel: 2, hands: 1.5 } },
  { slot: 6, key: 'Z',  name: 'WIDE OUT Z',  wants: { speed: 2.5, hands: 1.5, agility: 1.5 } },
];

// 0..1 fit of a character for a position.
export function fitFor(character, position) {
  let total = 0;
  let weight = 0;
  for (const [k, w] of Object.entries(position.wants)) {
    total += (character.attr[k] / 100) * w;
    weight += w;
  }
  return total / weight;
}

export function bestAvailable(pool, position) {
  let best = pool[0];
  let bestFit = -1;
  for (const c of pool) {
    const f = fitFor(c, position) + Math.random() * 0.05; // a little noise
    if (f > bestFit) { bestFit = f; best = c; }
  }
  return best;
}
