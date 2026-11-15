// Procedural crowd and hit audio — no sample files, so nothing to load and
// nothing to license. Built on one noise buffer plus filters.
// iOS only allows audio after a real user gesture, so start() is called
// from the first tap or key press.

export function createAudio() {
  let ctx = null;
  let master = null;
  let crowdGain = null;
  let crowdFilter = null;
  let roarGain = null;
  let started = false;
  let muted = false;
  let excitement = 0;

  function noiseBuffer(seconds = 2) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02; // brown-ish, sits under the mix
      d[i] = last * 3.2;
    }
    return buf;
  }

  function start() {
    if (started) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    started = true;

    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.85;
    master.connect(ctx.destination);

    // Crowd bed: looping noise through a bandpass that opens up as the
    // crowd gets loud, so a roar gets brighter as well as louder.
    const bed = ctx.createBufferSource();
    bed.buffer = noiseBuffer(3);
    bed.loop = true;
    crowdFilter = ctx.createBiquadFilter();
    crowdFilter.type = 'bandpass';
    crowdFilter.frequency.value = 520;
    crowdFilter.Q.value = 0.7;
    crowdGain = ctx.createGain();
    crowdGain.gain.value = 0.05;
    bed.connect(crowdFilter).connect(crowdGain).connect(master);
    bed.start();

    // A second, brighter layer only audible during a roar.
    const hype = ctx.createBufferSource();
    hype.buffer = noiseBuffer(3);
    hype.loop = true;
    const hypeFilter = ctx.createBiquadFilter();
    hypeFilter.type = 'bandpass';
    hypeFilter.frequency.value = 1500;
    hypeFilter.Q.value = 0.9;
    roarGain = ctx.createGain();
    roarGain.gain.value = 0;
    hype.connect(hypeFilter).connect(roarGain).connect(master);
    hype.start();
  }

  function resume() {
    if (ctx?.state === 'suspended') ctx.resume();
  }

  // One-shot helpers -------------------------------------------------------

  function burst({ freq = 180, dur = 0.14, type = 'noise', gain = 0.3, sweep = 0 }) {
    if (!ctx) return;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    g.connect(master);
    if (type === 'noise') {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(Math.max(0.3, dur));
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(freq * 6, ctx.currentTime);
      f.frequency.exponentialRampToValueAtTime(Math.max(80, freq), ctx.currentTime + dur);
      src.connect(f).connect(g);
      src.start();
      src.stop(ctx.currentTime + dur + 0.02);
    } else {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      if (sweep) osc.frequency.exponentialRampToValueAtTime(freq * sweep, ctx.currentTime + dur);
      osc.connect(g);
      osc.start();
      osc.stop(ctx.currentTime + dur + 0.02);
    }
  }

  const api = {
    start() {
      start();
      resume();
    },
    get started() {
      return started;
    },
    setMuted(on) {
      muted = on;
      if (master) master.gain.value = on ? 0 : 0.85;
    },
    get muted() {
      return muted;
    },
    // Crowd excitement, 0..1-ish, driven by the game.
    setExcitement(v) {
      excitement = v;
      if (!ctx) return;
      const t = ctx.currentTime;
      const e = Math.min(1.3, v);
      crowdGain.gain.setTargetAtTime(0.04 + e * 0.17, t, 0.25);
      crowdFilter.frequency.setTargetAtTime(500 + e * 900, t, 0.3);
      roarGain.gain.setTargetAtTime(Math.max(0, e - 0.25) * 0.1, t, 0.2);
    },
    whistle() {
      burst({ type: 'square', freq: 2300, dur: 0.3, gain: 0.07, sweep: 1.06 });
    },
    snapHike() {
      burst({ type: 'square', freq: 320, dur: 0.1, gain: 0.05, sweep: 0.7 });
    },
    hit(power = 1) {
      burst({ freq: 150 / power, dur: 0.16 * power, gain: 0.25 * power });
      burst({ type: 'triangle', freq: 90, dur: 0.1, gain: 0.12 * power, sweep: 0.5 });
    },
    catchBall() {
      burst({ freq: 900, dur: 0.07, gain: 0.14 });
    },
    throwBall() {
      burst({ freq: 700, dur: 0.1, gain: 0.08 });
    },
    pickup() {
      burst({ type: 'square', freq: 660, dur: 0.08, gain: 0.08, sweep: 2 });
      setTimeout(() => burst({ type: 'square', freq: 1320, dur: 0.1, gain: 0.07, sweep: 1.5 }), 70);
    },
    touchdown() {
      [523, 659, 784, 1047].forEach((f, i) =>
        setTimeout(() => burst({ type: 'triangle', freq: f, dur: 0.3, gain: 0.12 }), i * 110)
      );
    },
    uiTap() {
      burst({ type: 'square', freq: 440, dur: 0.05, gain: 0.05 });
    },
  };
  return api;
}
