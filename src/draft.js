import { CHARACTERS, POSITIONS, bestAvailable, fitFor } from './roster.js';

// Playground draft: two captains alternate picks out of the 21-man pool,
// filling one roster position per round. You pick first every round, which
// is the advantage for having to watch the CPU take your guy next.
//
// 7 rounds x 2 teams = 14 picks; the last seven characters go undrafted.

export function createDraft() {
  const pool = [...CHARACTERS];
  const home = [];
  const away = [];
  const order = [];
  for (let r = 0; r < POSITIONS.length; r++) order.push('home', 'away');
  let pickIndex = 0;

  const roundOf = (i) => Math.floor(i / 2);

  return {
    pool,
    home,
    away,
    get done() {
      return pickIndex >= order.length;
    },
    get turn() {
      return order[pickIndex];
    },
    get position() {
      return POSITIONS[roundOf(pickIndex)] ?? POSITIONS[POSITIONS.length - 1];
    },
    get pickNumber() {
      return Math.min(pickIndex + 1, order.length);
    },
    get totalPicks() {
      return order.length;
    },
    // How well a character suits the position currently on the clock.
    fit(character) {
      return fitFor(character, this.position);
    },
    pick(character) {
      const i = pool.indexOf(character);
      if (i < 0 || this.done) return false;
      pool.splice(i, 1);
      (order[pickIndex] === 'home' ? home : away).push(character);
      pickIndex += 1;
      return true;
    },
    cpuChoice() {
      return bestAvailable(pool, this.position);
    },
    // Fill whatever is left, used by the auto-draft button.
    autoFill() {
      while (!this.done) this.pick(this.cpuChoice());
    },
  };
}

export { CHARACTERS, POSITIONS };
