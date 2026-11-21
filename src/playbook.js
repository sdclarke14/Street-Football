// 7-on-7 playbook. Routes and runs are stored as yard offsets so one play
// works from either direction and on either side of the formation.
//
// Slot map (both teams use the same 7 slots):
//   0 QB   1 C (snapper)   2 RB   3 TE   4 X (wide)   5 Y (slot)   6 Z (wide)
// Throw targets are slots 2-6, keyed A S D F G in that order.

export const SLOT = { QB: 0, C: 1, RB: 2, TE: 3, X: 4, Y: 5, Z: 6 };
export const ROSTER_SIZE = 7;
export const TARGET_SLOTS = [SLOT.RB, SLOT.TE, SLOT.X, SLOT.Y, SLOT.Z];
export const TARGET_KEYS = ['a', 's', 'd', 'f', 'g'];
export const TARGET_LETTERS = { 2: 'A', 3: 'S', 4: 'D', 5: 'F', 6: 'G' };

// ---- Routes --------------------------------------------------------------
// Each waypoint is [downfield, inward]: downfield is yards past the player's
// own alignment toward the end zone; inward is yards toward the middle of
// the field (negative heads for the sideline). Mirroring is automatic.
export const ROUTES = {
  hitch: [[6, 0], [4.5, 0]],
  slant: [[2, 0], [7, 7]],
  drag: [[3, 0], [4, 15]],
  out: [[7, 0], [7.5, -6]],
  curl: [[11, 0], [9, 3]],
  comeback: [[13, 0], [10.5, -3.5]],
  post: [[9, 0], [19, 10]],
  corner: [[9, 0], [18, -8]],
  seam: [[16, 1.5], [24, 2]],
  fly: [[24, 0]],
  wheel: [[1, -4], [5, -6], [20, -7]],
  flare: [[0, -5], [2.5, -8]],
  swing: [[-1.5, -6], [3, -9]],
  screen: [[-3, -5]],
  checkdown: [[4, 0], [5.5, 4]],
  shake: [[5, -3], [9, 4], [20, 6]], // street improv: double move deep
};

// ---- Formations ----------------------------------------------------------
// [x, z]: x is yards behind the line of scrimmage, z is lateral (negative
// left, positive right from the offense's point of view).
export const FORMATIONS = {
  spread: {
    [SLOT.QB]: [5, 0],
    [SLOT.C]: [0.6, 0],
    [SLOT.RB]: [4.5, 3],
    [SLOT.TE]: [0.4, 6.5],
    [SLOT.X]: [0.2, -12.5],
    [SLOT.Y]: [1.2, -6.5],
    [SLOT.Z]: [0.2, 12.5],
  },
  trips: {
    [SLOT.QB]: [5, 0],
    [SLOT.C]: [0.6, 0],
    [SLOT.RB]: [4.5, -2.5],
    [SLOT.TE]: [1.2, -6],
    [SLOT.X]: [0.2, -12.5],
    [SLOT.Y]: [1.6, -9],
    [SLOT.Z]: [0.2, 12.5],
  },
  tight: {
    [SLOT.QB]: [4.5, 0],
    [SLOT.C]: [0.6, 0],
    [SLOT.RB]: [7, 0],
    [SLOT.TE]: [0.4, 4],
    [SLOT.X]: [0.2, -8],
    [SLOT.Y]: [1.2, -4],
    [SLOT.Z]: [0.2, 8],
  },
  split: {
    [SLOT.QB]: [5, 0],
    [SLOT.C]: [0.6, 0],
    [SLOT.RB]: [5, -3],
    [SLOT.TE]: [1.2, 7],
    [SLOT.X]: [0.2, -13],
    [SLOT.Y]: [1.2, -7],
    [SLOT.Z]: [0.2, 13],
  },
};

// ---- Offensive plays -----------------------------------------------------
// type: 'pass' | 'run' | 'trick'
// assign: per slot — { route } for a receiver, { block } for protection,
// { carry, dir, depth } for the ball carrier on a run, { pitch } for who the
// QB gives it to and how.
const PASS_PLAYS = [
  {
    id: 'four-verts',
    name: 'FOUR VERTS',
    type: 'pass',
    tag: 'DEEP SHOT',
    formation: 'spread',
    note: 'Everybody runs. Take the shot or scramble.',
    assign: {
      [SLOT.X]: { route: 'fly' },
      [SLOT.Z]: { route: 'fly' },
      [SLOT.Y]: { route: 'seam' },
      [SLOT.TE]: { route: 'seam' },
      [SLOT.RB]: { route: 'checkdown' },
      [SLOT.C]: { block: 'qb' },
    },
  },
  {
    id: 'slot-flood',
    name: 'SLOT FLOOD',
    type: 'pass',
    tag: 'HIGH / LOW',
    formation: 'trips',
    note: 'Three levels to one side. Easy reads.',
    assign: {
      [SLOT.X]: { route: 'corner' },
      [SLOT.Y]: { route: 'out' },
      [SLOT.TE]: { route: 'drag' },
      [SLOT.Z]: { route: 'fly' },
      [SLOT.RB]: { route: 'flare' },
      [SLOT.C]: { block: 'qb' },
    },
  },
  {
    id: 'all-curls',
    name: 'ALL CURLS',
    type: 'pass',
    tag: 'CHAINS',
    formation: 'split',
    note: 'Sit down in the soft spots. Move the sticks.',
    assign: {
      [SLOT.X]: { route: 'curl' },
      [SLOT.Z]: { route: 'curl' },
      [SLOT.Y]: { route: 'hitch' },
      [SLOT.TE]: { route: 'comeback' },
      [SLOT.RB]: { route: 'swing' },
      [SLOT.C]: { block: 'qb' },
    },
  },
  {
    id: 'slant-drag',
    name: 'SLANT & DRAG',
    type: 'pass',
    tag: 'QUICK',
    formation: 'spread',
    note: 'Fast release. Beats the blitz.',
    assign: {
      [SLOT.X]: { route: 'slant' },
      [SLOT.Y]: { route: 'drag' },
      [SLOT.Z]: { route: 'slant' },
      [SLOT.TE]: { route: 'hitch' },
      [SLOT.RB]: { route: 'flare' },
      [SLOT.C]: { block: 'qb' },
    },
  },
  {
    id: 'screen-wheel',
    name: 'SCREEN + WHEEL',
    type: 'pass',
    tag: 'TRAP',
    formation: 'split',
    note: 'Dump it short, let the blockers work.',
    assign: {
      [SLOT.RB]: { route: 'screen' },
      [SLOT.Y]: { route: 'wheel' },
      [SLOT.X]: { route: 'post' },
      [SLOT.Z]: { route: 'comeback' },
      [SLOT.TE]: { block: 'carrier' },
      [SLOT.C]: { block: 'carrier' },
    },
  },
];

const RUN_PLAYS = [
  {
    id: 'dive',
    name: 'DIVE',
    type: 'run',
    tag: 'INSIDE',
    formation: 'tight',
    note: 'Straight ahead. Lower your shoulder.',
    assign: {
      [SLOT.RB]: { carry: true, dir: 0, depth: 0 },
      [SLOT.C]: { block: 'carrier' },
      [SLOT.TE]: { block: 'carrier' },
      [SLOT.Y]: { block: 'carrier' },
      [SLOT.X]: { route: 'fly' },
      [SLOT.Z]: { route: 'fly' },
    },
    handoff: 0.45,
  },
  {
    id: 'sweep',
    name: 'SWEEP RIGHT',
    type: 'run',
    tag: 'OUTSIDE',
    formation: 'split',
    note: 'Get to the edge and turn it up.',
    assign: {
      [SLOT.RB]: { carry: true, dir: 1, depth: 2 },
      [SLOT.TE]: { block: 'carrier' },
      [SLOT.Z]: { block: 'carrier' },
      [SLOT.C]: { block: 'carrier' },
      [SLOT.X]: { route: 'slant' },
      [SLOT.Y]: { route: 'drag' },
    },
    handoff: 0.6,
  },
  {
    id: 'counter',
    name: 'COUNTER LEFT',
    type: 'run',
    tag: 'MISDIRECTION',
    formation: 'tight',
    note: 'Sell right, cut back left.',
    assign: {
      [SLOT.RB]: { carry: true, dir: -1, depth: 1.5, fake: 1 },
      [SLOT.C]: { block: 'carrier' },
      [SLOT.X]: { block: 'carrier' },
      [SLOT.Y]: { block: 'carrier' },
      [SLOT.TE]: { route: 'drag' },
      [SLOT.Z]: { route: 'post' },
    },
    handoff: 0.7,
  },
  {
    id: 'qb-draw',
    name: 'QB DRAW',
    type: 'run',
    tag: 'KEEP',
    formation: 'spread',
    note: 'Let them rush, then run through it.',
    assign: {
      [SLOT.QB]: { carry: true, dir: 0, depth: 0 },
      [SLOT.C]: { block: 'carrier' },
      [SLOT.RB]: { block: 'carrier' },
      [SLOT.X]: { route: 'fly' },
      [SLOT.Z]: { route: 'fly' },
      [SLOT.Y]: { route: 'drag' },
      [SLOT.TE]: { route: 'out' },
    },
    handoff: 0,
  },
  {
    id: 'jet',
    name: 'JET SWEEP',
    type: 'run',
    tag: 'SPEED',
    formation: 'trips',
    note: 'Slot takes it full speed across.',
    assign: {
      [SLOT.Y]: { carry: true, dir: 1, depth: 3 },
      [SLOT.C]: { block: 'carrier' },
      [SLOT.TE]: { block: 'carrier' },
      [SLOT.RB]: { block: 'carrier' },
      [SLOT.X]: { route: 'slant' },
      [SLOT.Z]: { route: 'fly' },
    },
    handoff: 0.75,
  },
];

const TRICK_PLAYS = [
  {
    id: 'street-ball',
    name: 'STREET BALL',
    type: 'trick',
    tag: 'IMPROV',
    formation: 'spread',
    note: 'No rules. Everybody shakes, QB runs free.',
    assign: {
      [SLOT.X]: { route: 'shake' },
      [SLOT.Z]: { route: 'shake' },
      [SLOT.Y]: { route: 'shake' },
      [SLOT.TE]: { route: 'wheel' },
      [SLOT.RB]: { route: 'swing' },
      [SLOT.C]: { block: 'qb' },
    },
    qbFree: true,
  },
  {
    id: 'option',
    name: 'RUN / PASS OPTION',
    type: 'trick',
    tag: 'OPTION',
    formation: 'split',
    note: 'Run it or pull up and throw. Your call.',
    assign: {
      [SLOT.QB]: { carry: true, dir: 1, depth: 1 },
      [SLOT.X]: { route: 'slant' },
      [SLOT.Z]: { route: 'corner' },
      [SLOT.Y]: { route: 'drag' },
      [SLOT.TE]: { route: 'hitch' },
      [SLOT.RB]: { block: 'carrier' },
      [SLOT.C]: { block: 'carrier' },
    },
    handoff: 0,
    keepPass: true, // carrier may still throw while behind the LOS
  },
];

export const OFFENSE_PLAYS = [...PASS_PLAYS, ...RUN_PLAYS, ...TRICK_PLAYS];
export const PLAY_GROUPS = [
  { key: 'pass', label: 'PASS', plays: PASS_PLAYS },
  { key: 'run', label: 'RUN', plays: RUN_PLAYS },
  { key: 'trick', label: 'TRICK', plays: TRICK_PLAYS },
];

// ---- Defensive plays -----------------------------------------------------
// coverage: 'man' | 'zone'; rushers: how many come after the QB; rushAt:
// seconds after the snap the rush is released (7-on-7 count).
export const DEFENSE_PLAYS = [
  {
    id: 'man-press',
    name: 'MAN PRESS',
    tag: 'LOCK UP',
    coverage: 'man',
    rushers: 1,
    rushAt: 3,
    note: 'Everybody has a man. One rusher on the count.',
  },
  {
    id: 'cover-3',
    name: 'COVER 3 ZONE',
    tag: 'ZONE',
    coverage: 'zone',
    rushers: 1,
    rushAt: 3,
    note: 'Deep thirds. Gives up the short stuff.',
  },
  {
    id: 'blitz',
    name: 'DOUBLE BLITZ',
    tag: 'HEAT',
    coverage: 'man',
    rushers: 2,
    rushAt: 0.6,
    note: 'Two come free right now. Risky.',
  },
  {
    id: 'contain',
    name: 'RUN CONTAIN',
    tag: 'STOP RUN',
    coverage: 'man',
    rushers: 0,
    rushAt: 99,
    spies: 2,
    note: 'Sit on the run, nobody rushes.',
  },
];

// Zone landmarks, as [x past the LOS, z] for the offense's direction.
export const ZONE_SPOTS = {
  [SLOT.X]: [14, -11],
  [SLOT.Z]: [14, 11],
  [SLOT.Y]: [20, 0],
  [SLOT.TE]: [7, 7],
  [SLOT.RB]: [6, -7],
  [SLOT.C]: [3, 0],
  [SLOT.QB]: [10, 0],
};

// ---- Geometry helpers ----------------------------------------------------

// Alignment in world space. attack = +1 or -1 along X.
export function alignmentFor(play, slot, los, attack) {
  const f = FORMATIONS[play.formation][slot];
  if (!f) return { x: los - attack * 1, z: 0 };
  return { x: los - attack * f[0], z: f[1] * attack };
}

// Turn a named route into world waypoints from where the player lined up.
// `inward` flips so the same route mirrors on both sides of the formation.
export function routeWaypoints(routeName, start, attack) {
  const pts = ROUTES[routeName];
  if (!pts) return [];
  // inward is already a world-space sign, so no attack factor here.
  const inward = start.z > 0.5 ? -1 : 1;
  return pts.map(([down, side]) => ({
    x: start.x + attack * down,
    z: start.z + inward * side,
  }));
}

// A run lane: aim for the hole, then straight downfield.
export function runWaypoints(assign, start, los, attack) {
  const dir = assign.dir ?? 0;
  const lane = dir * 9;
  const path = [];
  // Misdirection: a hard jab step the wrong way first. The waypoint carries
  // sell: true so the defense bites on it (main.js followRoute).
  if (assign.fake) {
    // Short enough to land before the handoff, so the jab happens even when
    // you take the ball and steer him yourself.
    path.push({
      x: start.x + attack * 1.6,
      z: start.z - dir * 2.2 * attack,
      sell: true,
    });
  }
  return [
    ...path,
    { x: los - attack * (assign.depth ?? 0), z: start.z + lane * 0.5 * attack },
    { x: los + attack * 4, z: start.z + lane * attack },
    { x: los + attack * 14, z: (start.z + lane * attack) * 0.6 },
    { x: los + attack * 30, z: 0 },
  ];
}

// ---- Play diagrams -------------------------------------------------------
// Chalkboard art for the play-call cards, drawn straight to a canvas so the
// diagram always matches the data the play actually runs.
export function drawPlayDiagram(canvas, play, teamColor = '#7ee081') {
  const W = canvas.width;
  const H = canvas.height;
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, W, H);

  // Chalkboard.
  g.fillStyle = '#17201c';
  g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(255,255,255,0.08)';
  g.lineWidth = 1;
  for (let i = 1; i < 6; i++) {
    g.beginPath();
    g.moveTo(0, (H / 6) * i);
    g.lineTo(W, (H / 6) * i);
    g.stroke();
  }

  // Field mapping: downfield is up, lateral is across. 34 yards deep,
  // 34 yards wide shown.
  const losY = H * 0.74;
  const yd = (H * 0.66) / 30;
  const cx = W / 2;
  const zScale = (W * 0.92) / 34;
  const P = (down, z) => [cx + z * zScale, losY - down * yd];

  // Line of scrimmage.
  g.strokeStyle = 'rgba(255,255,255,0.55)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(0, losY);
  g.lineTo(W, losY);
  g.stroke();

  const f = FORMATIONS[play.formation];
  const routeColor = teamColor;

  for (const slotStr of Object.keys(f)) {
    const slot = Number(slotStr);
    const [back, z] = f[slot];
    const a = play.assign[slot] || {};
    const [sxp, syp] = P(-back, z);

    if (a.route) {
      const inward = z > 0.5 ? -1 : 1;
      g.strokeStyle = routeColor;
      g.lineWidth = 2.4;
      g.lineJoin = 'round';
      g.beginPath();
      g.moveTo(sxp, syp);
      let last = [sxp, syp];
      for (const [down, side] of ROUTES[a.route]) {
        last = P(down - back, z + inward * side);
        g.lineTo(last[0], last[1]);
      }
      g.stroke();
      // Arrow head.
      g.fillStyle = routeColor;
      g.beginPath();
      g.arc(last[0], last[1], 3.4, 0, Math.PI * 2);
      g.fill();
    } else if (a.carry) {
      const dir = a.dir ?? 0;
      g.strokeStyle = '#ffd54a';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(sxp, syp);
      const p1 = P(-(a.depth ?? 0), z + dir * 4.5);
      const p2 = P(4, z + dir * 9);
      const p3 = P(16, (z + dir * 9) * 0.6);
      if (a.fake) {
        // The jab step the wrong way, drawn as a hook so the card shows the fake.
        const pf = P(-(a.depth ?? 0) - 0.6, z - dir * 3.2);
        g.lineTo(pf[0], pf[1]);
      }
      g.lineTo(p1[0], p1[1]);
      g.lineTo(p2[0], p2[1]);
      g.lineTo(p3[0], p3[1]);
      g.stroke();
      g.fillStyle = '#ffd54a';
      g.beginPath();
      g.arc(p3[0], p3[1], 4, 0, Math.PI * 2);
      g.fill();
    } else if (a.block) {
      g.strokeStyle = '#ff8a5c';
      g.lineWidth = 2.2;
      g.beginPath();
      g.moveTo(sxp, syp);
      g.lineTo(sxp, syp - yd * 2.2);
      g.moveTo(sxp - 5, syp - yd * 2.2);
      g.lineTo(sxp + 5, syp - yd * 2.2);
      g.stroke();
    }

    // The player marker.
    const isQB = slot === SLOT.QB;
    g.fillStyle = isQB ? '#ffd54a' : '#e9eef0';
    g.strokeStyle = '#0d0f0e';
    g.lineWidth = 1.5;
    g.beginPath();
    if (isQB) {
      g.rect(sxp - 4, syp - 4, 8, 8);
    } else {
      g.arc(sxp, syp, 4.2, 0, Math.PI * 2);
    }
    g.fill();
    g.stroke();
  }
  return canvas;
}

export function drawDefenseDiagram(canvas, def) {
  const W = canvas.width;
  const H = canvas.height;
  const g = canvas.getContext('2d');
  g.fillStyle = '#17201c';
  g.fillRect(0, 0, W, H);
  const losY = H * 0.78;
  g.strokeStyle = 'rgba(255,255,255,0.55)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(0, losY);
  g.lineTo(W, losY);
  g.stroke();

  const spots = [
    [0, 1.6], [-7, 3], [7, 3], [-13, 5.5], [13, 5.5], [-5, 9.5], [6, 10.5],
  ];
  spots.forEach(([z, up], i) => {
    const x = W / 2 + z * (W * 0.9) / 34;
    const y = losY - up * (H * 0.6) / 22;
    const rushing = i < def.rushers;
    g.strokeStyle = rushing ? '#ff5c5c' : def.coverage === 'zone' ? '#5cc8ff' : '#ffb84d';
    g.lineWidth = 2.4;
    if (rushing) {
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x, losY + 10);
      g.stroke();
    } else if (def.coverage === 'zone') {
      g.beginPath();
      g.arc(x, y - 10, 9, 0, Math.PI * 2);
      g.stroke();
    } else {
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x, y - 14);
      g.stroke();
    }
    g.fillStyle = '#e9eef0';
    g.font = 'bold 11px system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillText('X', x, y + 4);
  });
  return canvas;
}

// AI play choice: situational, not purely random.
export function pickOffensivePlay(down, toGo, goalLine) {
  const pool = [];
  if (toGo <= 4) pool.push(...RUN_PLAYS, ...RUN_PLAYS, ...PASS_PLAYS.filter((p) => p.tag === 'QUICK'));
  else if (toGo >= 14 || down >= 3) pool.push(...PASS_PLAYS, ...TRICK_PLAYS);
  else pool.push(...PASS_PLAYS, ...RUN_PLAYS);
  if (goalLine) pool.push(...RUN_PLAYS);
  return pool[(Math.random() * pool.length) | 0];
}

export function pickDefensivePlay(down, toGo) {
  const pool = [...DEFENSE_PLAYS];
  if (toGo <= 3) pool.push(DEFENSE_PLAYS[3], DEFENSE_PLAYS[3]); // expect run
  if (down >= 3 && toGo > 6) pool.push(DEFENSE_PLAYS[2]); // bring heat
  return pool[(Math.random() * pool.length) | 0];
}
