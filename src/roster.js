// The 21-character roster.
//
// Kit colours were sampled straight out of the generated character art
// (torso band, dominant saturated colour, skin and backdrop filtered out),
// so the palette comes from the images rather than being invented here. Two
// The automatic sample got 17 of 21. Four defeated it and are corrected by
// hand: BIG MAN and LIL MAN have bare shoulders so the sampler returned skin,
// TOWER's tank is black at the shoulder, and SHADE's hoodie read as brown
// leather off the ball he is holding.
//
// build.height scales the rig vertically, build.girth scales it in X and Z.
// speed and power are modifiers, both 1.0 for an average player: speed
// multiplies the velocity a player asks for, power helps him break tackles.

export const CHARACTERS = [
  { id: 'speedster',   name: 'FLASH',    art: '01-speedster',    kit: '#4c9e16', build: { height: 1.00, girth: 0.88 }, speed: 1.10, power: 0.82 },
  { id: 'tall',        name: 'STRETCH',  art: '02-tall-receiver', kit: '#ea4f09', build: { height: 1.10, girth: 0.84 }, speed: 1.05, power: 0.88 },
  { id: 'bruiser',     name: 'TANK',     art: '03-bruiser',      kit: '#2d2e4c', build: { height: 0.93, girth: 1.22 }, speed: 0.90, power: 1.24 },
  { id: 'qb',          name: 'CAP',      art: '04-quarterback',  kit: '#cf1317', build: { height: 1.02, girth: 1.00 }, speed: 1.00, power: 1.00 },
  { id: 'bigman',      name: 'HOUSE',    art: '05-big-man',      kit: '#9aa3ad', build: { height: 1.06, girth: 1.38 }, speed: 0.82, power: 1.35 },
  { id: 'kid',         name: 'LIL MAN',  art: '06-kid',          kit: '#e8c927', build: { height: 0.86, girth: 0.82 }, speed: 1.12, power: 0.70 },
  { id: 'veteran',     name: 'POPS',     art: '07-veteran',      kit: '#713324', build: { height: 1.00, girth: 1.12 }, speed: 0.92, power: 1.12 },
  { id: 'showman',     name: 'FLEX',     art: '08-showman',      kit: '#9405ae', build: { height: 1.02, girth: 0.98 }, speed: 1.04, power: 0.96 },
  { id: 'throwback',   name: 'LEATHER',  art: '09-throwback',    kit: '#fee9b7', build: { height: 0.99, girth: 1.18 }, speed: 0.93, power: 1.18 },
  { id: 'punk',        name: 'SPIKE',    art: '10-punk',         kit: '#4175a6', build: { height: 1.00, girth: 0.95 }, speed: 1.03, power: 0.98 },
  { id: 'sprinter',    name: 'JETS',     art: '11-sprinter',     kit: '#028c8f', build: { height: 1.02, girth: 0.90 }, speed: 1.12, power: 0.84 },
  { id: 'shirtless',   name: 'BRICK',    art: '12-shirtless',    kit: '#e69a61', build: { height: 1.05, girth: 1.30 }, speed: 0.86, power: 1.30 },
  { id: 'hoodie',      name: 'SHADE',    art: '13-hoodie',       kit: '#3a3f44', build: { height: 1.00, girth: 1.02 }, speed: 1.00, power: 1.02 },
  { id: 'classic',     name: 'DUKE',     art: '14-classic',      kit: '#094a99', build: { height: 1.01, girth: 1.00 }, speed: 1.00, power: 1.00 },
  { id: 'hooper',      name: 'TOWER',    art: '15-hooper',       kit: '#feca0a', build: { height: 1.12, girth: 0.82 }, speed: 1.02, power: 0.88 },
  { id: 'worker',      name: 'BOOTS',    art: '16-working-man',  kit: '#d26a2d', build: { height: 0.95, girth: 1.15 }, speed: 0.92, power: 1.14 },
  { id: 'technician',  name: 'WIRE',     art: '17-technician',   kit: '#efeef4', build: { height: 0.99, girth: 0.92 }, speed: 1.06, power: 0.90 },
  { id: 'puffer',      name: 'BULK',     art: '18-puffer',       kit: '#c4271c', build: { height: 1.03, girth: 1.26 }, speed: 0.88, power: 1.26 },
  { id: 'pinnie',      name: 'STUB',     art: '19-pinnie',       kit: '#fed404', build: { height: 0.92, girth: 1.10 }, speed: 0.96, power: 1.10 },
  { id: 'rugby',       name: 'SCRUM',    art: '20-rugby',        kit: '#192b55', build: { height: 1.01, girth: 1.24 }, speed: 0.90, power: 1.28 },
  { id: 'keeper',      name: 'REACH',    art: '21-keeper',       kit: '#9ad911', build: { height: 1.06, girth: 0.90 }, speed: 1.01, power: 0.94 },
];

export const byId = (id) => CHARACTERS.find((c) => c.id === id);

// Deal two teams out of the roster without repeats. The quarterback slot
// gets a balanced build so the position isn't randomly a 5'6" kid.
export function dealTeams(size = 7) {
  const pool = [...CHARACTERS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const pickQB = (list) => {
    const i = list.findIndex((c) => c.speed >= 0.95 && c.power >= 0.9 && c.build.girth < 1.2);
    return list.splice(i < 0 ? 0 : i, 1)[0];
  };
  const home = [pickQB(pool)];
  const away = [pickQB(pool)];
  while (home.length < size) home.push(pool.pop());
  while (away.length < size) away.push(pool.pop());
  return { home, away };
}
