// Your saved record and menu preferences, kept in this browser's localStorage.
//
// Everything is wrapped in try/catch: private browsing, a full disk or a
// blocked storage API must never stop the game from running - it just plays
// without remembering. A save that can't be read is ignored, not overwritten
// with a blank profile, until a game actually finishes.

const KEY = 'streetFootball.record.v1';

export const DIFFICULTIES = ['easy', 'normal', 'hard'];

function blank() {
  return {
    v: 1,
    games: 0, wins: 0, losses: 0, ties: 0,
    pointsFor: 0, pointsAgainst: 0, touchdowns: 0,
    bestScore: 0, bestMargin: null,
    streak: 0, bestStreak: 0,
    byDifficulty: { easy: [0, 0, 0], normal: [0, 0, 0], hard: [0, 0, 0] }, // [w, l, t]
    prefs: { surface: 'concrete', difficulty: 'normal', pickups: true, sound: true },
  };
}

function read() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return blank();
    const data = JSON.parse(raw);
    if (!data || data.v !== 1) return blank();
    const base = blank();
    return {
      ...base, ...data,
      byDifficulty: { ...base.byDifficulty, ...(data.byDifficulty || {}) },
      prefs: { ...base.prefs, ...(data.prefs || {}) },
    };
  } catch {
    return blank();
  }
}

function write(data) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadRecord() {
  return read();
}

export function savePrefs(prefs) {
  const data = read();
  data.prefs = { ...data.prefs, ...prefs };
  write(data);
}

// Record a finished game. Returns { record, notes } where notes are the
// headline lines worth showing on the result screen.
export function recordGame({ home, away, touchdowns, difficulty }) {
  const data = read();
  const notes = [];
  data.games += 1;
  data.pointsFor += home;
  data.pointsAgainst += away;
  data.touchdowns += touchdowns;
  const d = DIFFICULTIES.includes(difficulty) ? difficulty : 'normal';
  const bucket = data.byDifficulty[d] || [0, 0, 0];
  if (home > away) {
    data.wins += 1;
    bucket[0] += 1;
    data.streak = Math.max(1, data.streak + 1);
  } else if (home < away) {
    data.losses += 1;
    bucket[1] += 1;
    data.streak = Math.min(-1, data.streak - 1);
  } else {
    data.ties += 1;
    bucket[2] += 1;
    data.streak = 0;
  }
  data.byDifficulty[d] = bucket;
  if (data.streak > data.bestStreak) {
    data.bestStreak = data.streak;
    if (data.streak >= 2) notes.push(`${data.streak} STRAIGHT WINS — BEST RUN YET`);
  }
  if (home > data.bestScore) {
    if (data.games > 1) notes.push(`NEW HIGH SCORE: ${home}`);
    data.bestScore = home;
  }
  const margin = home - away;
  if (margin > 0 && (data.bestMargin === null || margin > data.bestMargin)) {
    if (data.games > 1) notes.push(`BIGGEST WIN YET: BY ${margin}`);
    data.bestMargin = margin;
  }
  const saved = write(data);
  if (!saved) notes.push('RECORD NOT SAVED ON THIS BROWSER');
  return { record: data, notes };
}

export function recordLine(r) {
  if (!r.games) return 'NO GAMES ON RECORD YET';
  const tie = r.ties ? `-${r.ties}` : '';
  const streak = r.streak > 1 ? ` · W${r.streak}` : r.streak < -1 ? ` · L${-r.streak}` : '';
  return `RECORD ${r.wins}-${r.losses}${tie} · ${r.touchdowns} TD · HIGH SCORE ${r.bestScore}${streak}`;
}
