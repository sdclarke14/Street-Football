import { drawPlayDiagram, drawDefenseDiagram, PLAY_GROUPS, DEFENSE_PLAYS } from './playbook.js';

// All menus and the in-game HUD. Everything is DOM over the canvas so it
// stays crisp on a retina phone and costs the renderer nothing.

const CSS = `
:root { --acid: #b9f227; --ink: #0f1512; }
* { -webkit-tap-highlight-color: transparent; }
#ui { position: fixed; inset: 0; z-index: 40; pointer-events: none;
  font-family: -apple-system, system-ui, "Segoe UI", sans-serif; color: #fff; }
#ui .screen { position: absolute; inset: 0; pointer-events: auto; display: none;
  flex-direction: column; background: #0f1512; overflow: hidden; }
#ui .screen.on { display: flex; }

/* ---- Title ---- */
#ui-title .bg { position: absolute; inset: 0; background-size: cover;
  background-position: center 40%; filter: saturate(1.05); }
#ui-title .veil { position: absolute; inset: 0;
  background: linear-gradient(180deg, rgba(15,21,18,0.82) 0%, rgba(15,21,18,0.35) 38%, rgba(15,21,18,0.95) 100%); }
#ui-title .inner { position: relative; display: flex; flex-direction: column; height: 100%;
  padding: calc(14px + var(--sat,0px)) calc(20px + var(--sar,0px)) calc(14px + var(--sab,0px)) calc(20px + var(--sal,0px)); }
#ui .wordmark { font-size: clamp(26px, 6.2vw, 54px); font-weight: 900; letter-spacing: -1px;
  line-height: 0.92; text-shadow: 0 4px 18px rgba(0,0,0,0.8); }
#ui .wordmark span { color: var(--acid); }
#ui .kicker { font-size: clamp(10px, 1.7vw, 13px); font-weight: 800; letter-spacing: 3px;
  color: #ffd54a; margin-top: 6px; }
#ui .fields { display: flex; gap: 10px; margin-top: auto; }
#ui .field-card { flex: 1; border-radius: 14px; overflow: hidden; cursor: pointer;
  border: 2px solid rgba(255,255,255,0.18); background: #1a221d; position: relative;
  transition: transform 0.12s, border-color 0.12s; min-width: 0; }
#ui .field-card.sel { border-color: var(--acid); transform: translateY(-4px); }
#ui .field-card .pic { width: 100%; aspect-ratio: 16/9; background-size: cover; background-position: center; display: block; }
#ui .field-card .meta { padding: 7px 9px 9px; }
#ui .field-card .nm { font-weight: 900; font-size: clamp(11px, 1.9vw, 15px); letter-spacing: 0.5px; }
#ui .field-card .bl { font-size: clamp(9px, 1.4vw, 11px); opacity: 0.68; margin-top: 2px; line-height: 1.25; }
#ui .field-card .tick { position: absolute; top: 7px; right: 7px; width: 22px; height: 22px;
  border-radius: 50%; background: var(--acid); color: #10130f; font-weight: 900; font-size: 13px;
  display: none; align-items: center; justify-content: center; }
#ui .field-card.sel .tick { display: flex; }
#ui .row { display: flex; gap: 10px; align-items: center; margin-top: 12px; flex-wrap: wrap; }
#ui .toggle { pointer-events: auto; cursor: pointer; padding: 8px 13px; border-radius: 999px;
  border: 2px solid rgba(255,255,255,0.22); font-size: clamp(10px, 1.5vw, 12px); font-weight: 800;
  letter-spacing: 1px; background: rgba(0,0,0,0.3); }
#ui .toggle.on { background: var(--acid); color: #10130f; border-color: var(--acid); }
#ui .cta { margin-left: auto; pointer-events: auto; cursor: pointer; padding: 13px 30px;
  border-radius: 999px; background: var(--acid); color: #10130f; font-weight: 900;
  font-size: clamp(13px, 2.1vw, 17px); letter-spacing: 1.5px; border: none;
  box-shadow: 0 6px 22px rgba(185,242,39,0.35); }
#ui .cta:active { transform: scale(0.96); }
#ui .hint { font-size: 10px; opacity: 0.55; letter-spacing: 0.5px; margin-top: 8px; }

/* ---- Play call ---- */
#ui-playcall { background: #101713; }
#ui-playcall .pcbar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  width: 100%; max-width: 1180px; margin: 0 auto; box-sizing: border-box;
  padding: calc(10px + var(--sat,0px)) calc(16px + var(--sar,0px)) 8px calc(16px + var(--sal,0px));
  border-bottom: 1px solid rgba(255,255,255,0.1); }
#ui-playcall .pcscore { font-weight: 900; font-size: clamp(11px,1.9vw,15px); }
#ui-playcall .pcscore b { color: #b9f227; } #ui-playcall .pcscore i { font-style: normal; color: #ff6b6b; }
#ui-playcall .sit { font-weight: 900; font-size: clamp(14px, 2.6vw, 22px); letter-spacing: 0.5px; }
#ui-playcall .sit em { font-style: normal; color: #ffd54a; }
#ui-playcall .side { font-size: 10px; font-weight: 800; letter-spacing: 2px; padding: 4px 9px;
  border-radius: 999px; background: rgba(255,255,255,0.12); }
#ui-playcall .clockmini { margin-left: auto; font-weight: 800; font-size: clamp(11px,1.9vw,15px); opacity: 0.85; }
#ui-playcall .tabs { display: flex; gap: 7px; width: 100%; max-width: 1180px; margin: 0 auto;
  box-sizing: border-box; padding: 8px calc(16px + var(--sal,0px)); }
#ui-playcall .tab { cursor: pointer; padding: 6px 15px; border-radius: 999px; font-size: 11px;
  font-weight: 900; letter-spacing: 1.5px; background: rgba(255,255,255,0.09); }
#ui-playcall .tab.on { background: var(--acid); color: #10130f; }
#ui-playcall .grid { flex: 1; display: grid; gap: 12px; overflow-y: auto; -webkit-overflow-scrolling: touch;
  grid-template-columns: repeat(auto-fit, minmax(165px, 1fr));
  width: 100%; max-width: 1180px; margin: 0 auto; box-sizing: border-box;
  padding: 4px calc(16px + var(--sar,0px)) calc(14px + var(--sab,0px)) calc(16px + var(--sal,0px)); align-content: start; }
#ui-playcall .card { cursor: pointer; border-radius: 12px; overflow: hidden; background: #17201c;
  border: 2px solid rgba(255,255,255,0.13); transition: transform 0.1s, border-color 0.1s; }
#ui-playcall .card:active { transform: scale(0.97); }
#ui-playcall .card.sel { border-color: var(--acid); }
#ui-playcall .card canvas { width: 100%; display: block; background: #17201c; }
#ui-playcall .card .nm { font-weight: 900; font-size: 12px; letter-spacing: 0.4px; padding: 6px 8px 0; }
#ui-playcall .card .tg { font-size: 9px; font-weight: 800; letter-spacing: 1px; color: var(--acid); padding: 1px 8px 7px; }

/* ---- HUD ---- */
#ui-hud { position: absolute; inset: 0; pointer-events: none; display: none; }
#ui-hud.on { display: block; }
#ui .board { position: absolute; top: calc(8px + var(--sat,0px)); left: 50%; transform: translateX(-50%);
  display: flex; align-items: stretch; border-radius: 10px; overflow: hidden;
  background: rgba(10,14,12,0.74); border: 1px solid rgba(255,255,255,0.14);
  font-weight: 900; letter-spacing: 0.5px; backdrop-filter: blur(6px); }
#ui .board .t { padding: 5px 11px; font-size: clamp(12px,2vw,16px); display: flex; align-items: center; gap: 7px; }
#ui .board .t.home { color: #b9f227; }
#ui .board .t.away { color: #ff6b6b; }
#ui .board .clk { padding: 5px 11px; background: rgba(255,255,255,0.09); font-size: clamp(12px,2vw,16px); }
#ui .dd { position: absolute; top: calc(42px + var(--sat,0px)); left: 50%; transform: translateX(-50%);
  font-size: clamp(10px,1.7vw,13px); font-weight: 800; letter-spacing: 1.4px; color: #ffd54a;
  text-shadow: 0 1px 4px rgba(0,0,0,0.8); white-space: nowrap; }
#ui .meters { position: absolute; top: calc(8px + var(--sat,0px)); left: calc(12px + var(--sal,0px)); width: min(190px, 34vw); }
#ui .mtrack { height: 11px; border-radius: 6px; background: rgba(0,0,0,0.5); overflow: hidden;
  border: 1px solid rgba(255,255,255,0.14); }
#ui .mfill { height: 100%; width: 100%; background: #22c55e; transition: background-color 0.25s; }
#ui .mlabel { font-size: 9px; font-weight: 800; letter-spacing: 1.2px; margin: 3px 0 7px; opacity: 0.85;
  text-shadow: 0 1px 3px rgba(0,0,0,0.8); }
#ui .gb { margin-top: 2px; }
#ui .gb .mfill { background: linear-gradient(90deg, #ff9a3c, #ffd54a); }
#ui .gb.ready .mtrack { border-color: #ffd54a; box-shadow: 0 0 14px rgba(255,213,74,0.6); }
#ui .pclock { position: absolute; top: calc(84px + var(--sat,0px)); left: 50%; transform: translateX(-50%);
  width: 118px; height: 7px; border-radius: 4px; background: rgba(0,0,0,0.5); overflow: hidden; display: none;
  border: 1px solid rgba(255,255,255,0.18); }
#ui .pclock.on { display: block; }
#ui .pclock i { display: block; height: 100%; background: #ff5c5c; width: 100%; }
#ui .banner { position: absolute; top: 44%; left: 50%; transform: translate(-50%,-50%);
  max-width: 86vw;
  font-size: clamp(26px, 6vw, 52px); font-weight: 900; letter-spacing: -0.5px; text-align: center;
  text-shadow: 0 3px 16px rgba(0,0,0,0.85); display: none; line-height: 1.05; }
#ui .banner .sub { font-size: 0.4em; letter-spacing: 2px; color: #ffd54a; margin-top: 6px; }
#ui .toast { position: absolute; top: calc(62px + var(--sat,0px)); left: 50%; transform: translateX(-50%);
  font-size: clamp(11px,1.8vw,14px); font-weight: 900; letter-spacing: 1.5px; color: var(--acid);
  text-shadow: 0 1px 6px rgba(0,0,0,0.9); opacity: 0; transition: opacity 0.2s; white-space: nowrap; }
#ui .playname { position: absolute; bottom: calc(10px + var(--sab,0px)); left: 50%; transform: translateX(-50%);
  font-size: 10px; font-weight: 800; letter-spacing: 1.6px; opacity: 0.6; white-space: nowrap; }
#ui .keys { position: absolute; bottom: calc(10px + var(--sab,0px)); left: calc(12px + var(--sal,0px));
  font-size: 10px; opacity: 0.5; letter-spacing: 0.4px; max-width: 46vw; line-height: 1.5; }

/* ---- Result ---- */
#ui-result { background: rgba(10,14,12,0.95); align-items: center; justify-content: center; text-align: center; }
#ui-result .fs { font-size: clamp(34px, 9vw, 86px); font-weight: 900; letter-spacing: -2px; }
#ui-result .ln { font-size: clamp(12px,2vw,16px); opacity: 0.75; margin-top: 10px; letter-spacing: 1px; }
@media (max-width: 1000px), (pointer: coarse) { #ui .keys { display: none; } }
`;

const DOWN_NAMES = ['1ST', '2ND', '3RD', '4TH'];

export function createUI({ surfaces, art }) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.id = 'ui';
  root.innerHTML = `
    <div class="screen" id="ui-title">
      <div class="bg"></div><div class="veil"></div>
      <div class="inner">
        <div>
          <div class="wordmark">STREET<br><span>FOOTBALL</span></div>
          <div class="kicker">7 ON 7 · NO PUNTS · NO MERCY</div>
        </div>
        <div class="fields" id="ui-fields"></div>
        <div class="row">
          <div class="toggle on" id="tg-pickups">STREET RULES</div>
          <div class="toggle on" id="tg-sound">SOUND</div>
          <button class="cta" id="ui-start">PLAY BALL</button>
        </div>
        <div class="hint">Phone: thumbstick + buttons. Keyboard: arrows move · Shift turbo · Space snap · A/S/D/F/G throw · Z spin · X juke · C truck.</div>
      </div>
    </div>

    <div class="screen" id="ui-playcall">
      <div class="pcbar">
        <div class="side" id="pc-side">OFFENSE</div>
        <div class="sit" id="pc-sit"></div>
        <div class="pcscore" id="pc-score"></div>
        <div class="clockmini" id="pc-clock"></div>
      </div>
      <div class="tabs" id="pc-tabs"></div>
      <div class="grid" id="pc-grid" data-scrollable></div>
    </div>

    <div id="ui-hud">
      <div class="board">
        <div class="t home" id="hud-home">HOME 0</div>
        <div class="clk" id="hud-clock">5:00</div>
        <div class="t away" id="hud-away">0 AWAY</div>
      </div>
      <div class="dd" id="hud-dd"></div>
      <div class="pclock" id="hud-pclock"><i></i></div>
      <div class="meters">
        <div class="mtrack"><div class="mfill" id="hud-stam"></div></div>
        <div class="mlabel" id="hud-stam-label">TURBO</div>
        <div class="gb" id="hud-gb"><div class="mtrack"><div class="mfill" id="hud-gbfill" style="width:0%"></div></div>
        <div class="mlabel" id="hud-gb-label">STYLE</div></div>
      </div>
      <div class="banner" id="hud-banner"></div>
      <div class="toast" id="hud-toast"></div>
      <div class="playname" id="hud-playname"></div>
      <div class="keys" id="hud-keys"></div>
    </div>

    <div class="screen" id="ui-result">
      <div class="fs" id="res-score"></div>
      <div class="ln" id="res-line"></div>
      <div class="row" style="justify-content:center"><button class="cta" id="res-again" style="margin:18px auto 0">RUN IT BACK</button></div>
    </div>
  `;
  document.body.appendChild(root);
  const $ = (id) => root.querySelector('#' + id);

  // ---- Title ----
  let selectedSurface = 'concrete';
  const opts = { pickups: true, sound: true };
  $('ui-title').querySelector('.bg').style.backgroundImage = `url(${art.title})`;

  const fieldsHost = $('ui-fields');
  fieldsHost.innerHTML = surfaces
    .map(
      (s) => `
      <div class="field-card ${s.key === selectedSurface ? 'sel' : ''}" data-k="${s.key}">
        <div class="tick">✓</div>
        <div class="pic" style="background-image:url(${art.fields[s.key]})"></div>
        <div class="meta"><div class="nm">${s.name}</div><div class="bl">${s.blurb}</div></div>
      </div>`
    )
    .join('');
  fieldsHost.addEventListener('click', (e) => {
    const card = e.target.closest('.field-card');
    if (!card) return;
    selectedSurface = card.dataset.k;
    for (const c of fieldsHost.children) c.classList.toggle('sel', c === card);
    handlers.onSurfacePreview?.(selectedSurface);
  });

  const bindToggle = (id, key) => {
    const node = $(id);
    node.addEventListener('click', () => {
      opts[key] = !opts[key];
      node.classList.toggle('on', opts[key]);
      handlers.onToggle?.(key, opts[key]);
    });
  };
  bindToggle('tg-pickups', 'pickups');
  bindToggle('tg-sound', 'sound');

  const handlers = {};
  $('ui-start').addEventListener('click', () => handlers.onStart?.(selectedSurface, { ...opts }));
  $('res-again').addEventListener('click', () => handlers.onRestart?.());

  // ---- Play call ----
  let activeTab = 'pass';
  function renderPlayCall({ side, down, toGo, ballOn, clock, score, onPick }) {
    $('pc-score').innerHTML = score ? `<b>HOME ${score[0]}</b> — <i>${score[1]} AWAY</i>` : '';
    $('pc-side').textContent = side === 'offense' ? 'YOUR BALL' : 'YOUR DEFENSE';
    $('pc-side').style.background =
      side === 'offense' ? 'rgba(185,242,39,0.22)' : 'rgba(255,107,107,0.22)';
    $('pc-sit').innerHTML =
      `${DOWN_NAMES[down - 1]} & <em>${toGo}</em>` + (ballOn ? ` · BALL ON ${ballOn}` : '');
    $('pc-clock').textContent = clock;

    const tabs = $('pc-tabs');
    const grid = $('pc-grid');
    const cardFor = (play, isDef) => {
      const card = document.createElement('div');
      card.className = 'card';
      const cv = document.createElement('canvas');
      cv.width = 220;
      cv.height = 150;
      card.appendChild(cv);
      const nm = document.createElement('div');
      nm.className = 'nm';
      nm.textContent = play.name;
      const tg = document.createElement('div');
      tg.className = 'tg';
      tg.textContent = play.tag + (play.note ? ' · ' + play.note : '');
      card.append(nm, tg);
      if (isDef) drawDefenseDiagram(cv, play);
      else drawPlayDiagram(cv, play, side === 'offense' ? '#b9f227' : '#ff6b6b');
      card.addEventListener('click', () => {
        card.classList.add('sel');
        onPick(play);
      });
      return card;
    };

    if (side === 'offense') {
      tabs.style.display = 'flex';
      tabs.innerHTML = PLAY_GROUPS.map(
        (g) => `<div class="tab ${g.key === activeTab ? 'on' : ''}" data-g="${g.key}">${g.label}</div>`
      ).join('');
      const paint = () => {
        grid.innerHTML = '';
        const group = PLAY_GROUPS.find((g) => g.key === activeTab);
        for (const p of group.plays) grid.appendChild(cardFor(p, false));
      };
      tabs.onclick = (e) => {
        const t = e.target.closest('.tab');
        if (!t) return;
        activeTab = t.dataset.g;
        for (const n of tabs.children) n.classList.toggle('on', n === t);
        paint();
      };
      paint();
    } else {
      tabs.style.display = 'none';
      grid.innerHTML = '';
      for (const d of DEFENSE_PLAYS) grid.appendChild(cardFor(d, true));
    }
  }

  // ---- Screens ----
  const screens = ['ui-title', 'ui-playcall', 'ui-result'];
  function show(which) {
    for (const s of screens) $(s).classList.toggle('on', s === which);
    $('ui-hud').classList.toggle('on', which === null);
  }

  // ---- HUD ----
  let toastT = 0;
  let bannerVisible = false;
  const last = {};
  const write = (key, node, prop, value) => {
    if (last[key] === value) return;
    last[key] = value;
    node[prop] = value;
  };
  const hud = {
    setScore(home, away, homeName = 'HOME', awayName = 'AWAY') {
      write('h', $('hud-home'), 'textContent', `${homeName} ${home}`);
      write('a', $('hud-away'), 'textContent', `${away} ${awayName}`);
    },
    setClock(text) {
      write('c', $('hud-clock'), 'textContent', text);
    },
    setDown(text) {
      write('d', $('hud-dd'), 'textContent', text);
    },
    setStamina(pct, color, label) {
      $('hud-stam').style.width = `${pct.toFixed(1)}%`;
      write('sc', $('hud-stam').style, 'backgroundColor', color);
      write('sl', $('hud-stam-label'), 'textContent', label);
    },
    setStyle(pct, ready, label) {
      $('hud-gbfill').style.width = `${pct.toFixed(1)}%`;
      $('hud-gb').classList.toggle('ready', ready);
      write('gl', $('hud-gb-label'), 'textContent', label);
    },
    setPassClock(frac) {
      const node = $('hud-pclock');
      node.classList.toggle('on', frac !== null);
      if (frac !== null) {
        node.firstElementChild.style.width = `${Math.max(0, frac) * 100}%`;
        node.firstElementChild.style.background = frac < 0.35 ? '#ff5c5c' : '#ffd54a';
      }
    },
    banner(text, sub = '') {
      const b = $('hud-banner');
      b.innerHTML = `${text}${sub ? `<div class="sub">${sub}</div>` : ''}`;
      b.style.display = 'block';
      bannerVisible = true;
    },
    hideBanner() {
      if (!bannerVisible) return;
      $('hud-banner').style.display = 'none';
      bannerVisible = false;
    },
    toast(text) {
      $('hud-toast').textContent = text;
      $('hud-toast').style.opacity = '1';
      toastT = 2.2;
    },
    setPlayName(text) {
      write('pn', $('hud-playname'), 'textContent', text);
    },
    setKeys(text) {
      write('kk', $('hud-keys'), 'textContent', text);
    },
    tick(dt) {
      if (toastT > 0) {
        toastT -= dt;
        if (toastT <= 0.6) $('hud-toast').style.opacity = String(Math.max(toastT / 0.6, 0));
      }
    },
  };

  return {
    handlers,
    hud,
    showTitle: () => show('ui-title'),
    showGame: () => show(null),
    showPlayCall(cfg) {
      renderPlayCall(cfg);
      show('ui-playcall');
    },
    showResult(scoreText, line) {
      $('res-score').textContent = scoreText;
      $('res-line').textContent = line;
      show('ui-result');
    },
    get options() {
      return opts;
    },
  };
}
