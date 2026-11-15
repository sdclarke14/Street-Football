// Touch controls, laid out for a phone held in landscape (iPhone first):
// floating thumbstick bottom-left, action cluster bottom-right, receiver
// chips replacing the cluster while the quarterback has the ball.
//
// Pointer events only, with preventDefault everywhere, so iOS Safari never
// scrolls, zooms, text-selects or fires a 300ms tap delay mid-play.

const CSS = `
#tc { position: fixed; inset: 0; z-index: 30; pointer-events: none;
  font-family: -apple-system, system-ui, sans-serif; user-select: none;
  -webkit-user-select: none; -webkit-tap-highlight-color: transparent; }
#tc.off { display: none; }
#tc .zone { position: absolute; pointer-events: auto; touch-action: none; }
#tc-stickzone { left: 0; bottom: 0; width: 46%; height: 62%; }
#tc-stick { position: absolute; width: 132px; height: 132px; margin: -66px 0 0 -66px;
  border-radius: 50%; border: 2px solid rgba(255,255,255,0.3);
  background: radial-gradient(circle, rgba(255,255,255,0.14), rgba(0,0,0,0.26));
  opacity: 0; transition: opacity 0.14s; }
#tc-stick.on { opacity: 1; }
#tc-knob { position: absolute; width: 60px; height: 60px; margin: -30px 0 0 -30px;
  border-radius: 50%; background: rgba(255,255,255,0.85);
  box-shadow: 0 2px 10px rgba(0,0,0,0.45); opacity: 0; transition: opacity 0.14s; }
#tc-knob.on { opacity: 1; }
#tc .btn { position: absolute; pointer-events: auto; touch-action: none;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  border-radius: 50%; border: 3px solid rgba(0,0,0,0.55); color: #10130f;
  font-weight: 900; letter-spacing: 0.5px; text-align: center;
  box-shadow: 0 3px 12px rgba(0,0,0,0.4); transition: transform 0.06s, filter 0.06s; }
#tc .btn:active, #tc .btn.held { transform: scale(0.92); filter: brightness(1.25); }
#tc .btn .sub { font-size: 8px; font-weight: 700; opacity: 0.7; margin-top: -2px; }
#tc .btn.wide { border-radius: 26px; }
#tc .btn.hidden { display: none; }
#tc .chip-t { background: #ffd54a; }
#tc-snap { background: #b9f227; }
#tc-menu { background: rgba(20,24,20,0.72); color: #fff; border-color: rgba(255,255,255,0.25);
  width: 44px; height: 44px; font-size: 16px; }
#tc-rotate { position: fixed; inset: 0; z-index: 60; display: none;
  background: #0f1512; color: #fff; align-items: center; justify-content: center;
  flex-direction: column; gap: 14px; font-family: system-ui, sans-serif; text-align: center; }
#tc-rotate.on { display: flex; }
#tc-rotate .ph { width: 54px; height: 90px; border: 3px solid #b9f227; border-radius: 10px;
  animation: tcspin 1.8s ease-in-out infinite; }
@keyframes tcspin { 0%,40% { transform: rotate(0deg); } 60%,100% { transform: rotate(90deg); } }
`;

const BTN = (id, label, sub, size, bg) =>
  `<div class="btn" id="${id}" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.26)}px;background:${bg}">
     <div>${label}</div>${sub ? `<div class="sub">${sub}</div>` : ''}
   </div>`;

export function createTouchControls(handlers) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.id = 'tc';
  root.innerHTML = `
    <div class="zone" id="tc-stickzone">
      <div id="tc-stick"><div id="tc-knob"></div></div>
    </div>
    ${BTN('tc-turbo', 'TURBO', 'hold', 84, '#b9f227')}
    ${BTN('tc-spin', 'SPIN', 'Z', 66, '#8fd8ff')}
    ${BTN('tc-juke', 'JUKE', 'X', 66, '#ffa8e0')}
    ${BTN('tc-truck', 'TRUCK', 'C', 66, '#ff9a5c')}
    ${BTN('tc-switch', 'SWITCH', 'Q', 66, '#cfd6dc')}
    ${BTN('tc-pick', 'PICK', 'E', 72, '#ffd54a')}
    ${BTN('tc-gb', 'BREAK', 'V', 74, '#ffd54a')}
    ${BTN('tc-snap', 'SNAP', 'tap', 92, '#b9f227')}
    ${BTN('tc-menu', '☰', '', 44, 'rgba(20,24,20,0.72)')}
    <div id="tc-targets"></div>
  `;
  document.body.appendChild(root);

  const rotate = document.createElement('div');
  rotate.id = 'tc-rotate';
  rotate.innerHTML = `<div class="ph"></div><div><b>TURN YOUR PHONE</b><br>Street Football plays in landscape.</div>`;
  document.body.appendChild(rotate);

  const el = (id) => root.querySelector('#' + id);
  const stickZone = el('tc-stickzone');
  const stick = el('tc-stick');
  const knob = el('tc-knob');
  const targetsHost = el('tc-targets');

  // ---- Layout ----
  // Buttons are positioned from the safe-area corners in a thumb arc.
  function layout() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const cs = getComputedStyle(document.documentElement);
    const safeR = parseFloat(cs.getPropertyValue('--sar')) || 0;
    const safeB = parseFloat(cs.getPropertyValue('--sab')) || 0;
    const rightPad = 18 + safeR;
    const botPad = 18 + safeB;
    const place = (id, right, bottom) => {
      const node = el(id);
      node.style.right = `${right}px`;
      node.style.bottom = `${bottom}px`;
    };
    // Action diamond, turbo nearest the thumb.
    place('tc-turbo', rightPad, botPad);
    place('tc-spin', rightPad + 92, botPad + 18);
    place('tc-juke', rightPad + 14, botPad + 96);
    place('tc-truck', rightPad + 98, botPad + 100);
    place('tc-switch', rightPad + 92, botPad + 18);
    place('tc-pick', rightPad, botPad);
    place('tc-gb', rightPad + 46, Math.min(botPad + 176, h - 150));
    el('tc-snap').style.left = `${w / 2 - 46}px`;
    el('tc-snap').style.bottom = `${botPad + 6}px`;
    el('tc-snap').style.right = 'auto';
    const menu = el('tc-menu');
    menu.style.right = `${rightPad}px`;
    menu.style.top = `${12 + (parseFloat(cs.getPropertyValue('--sat')) || 0)}px`;
    menu.style.bottom = 'auto';

    // Receiver chips: arc above the action cluster.
    const chips = [...targetsHost.querySelectorAll('.btn')];
    chips.forEach((chip, i) => {
      const n = chips.length;
      const a = Math.PI * (0.52 - (i / Math.max(1, n - 1)) * 0.46);
      const R = Math.min(168, h * 0.42);
      chip.style.right = `${rightPad + 24 + Math.cos(a) * R - 29}px`;
      chip.style.bottom = `${botPad + 26 + Math.sin(a) * R - 29}px`;
    });

    rotate.classList.toggle('on', h > w && 'ontouchstart' in window);
  }

  // ---- Thumbstick ----
  const stickState = { x: 0, y: 0, active: false };
  let stickId = null;
  let originX = 0;
  let originY = 0;
  const RADIUS = 56;

  function setStickFromEvent(e) {
    let dx = e.clientX - originX;
    let dy = e.clientY - originY;
    const len = Math.hypot(dx, dy);
    if (len > RADIUS) {
      dx = (dx / len) * RADIUS;
      dy = (dy / len) * RADIUS;
    }
    knob.style.left = `${66 + dx}px`;
    knob.style.top = `${66 + dy}px`;
    // Dead zone keeps a resting thumb from drifting the carrier.
    const mag = Math.hypot(dx, dy) / RADIUS;
    if (mag < 0.18) {
      stickState.x = stickState.y = 0;
    } else {
      const k = (mag - 0.18) / 0.82;
      const inv = 1 / Math.max(mag, 0.0001);
      stickState.x = dx * inv * k;
      stickState.y = dy * inv * k;
    }
  }

  stickZone.addEventListener('pointerdown', (e) => {
    if (stickId !== null) return;
    e.preventDefault();
    stickId = e.pointerId;
    stickZone.setPointerCapture(e.pointerId);
    const r = stickZone.getBoundingClientRect();
    originX = e.clientX;
    originY = e.clientY;
    stick.style.left = `${e.clientX - r.left}px`;
    stick.style.top = `${e.clientY - r.top}px`;
    stick.classList.add('on');
    knob.classList.add('on');
    stickState.active = true;
    setStickFromEvent(e);
    handlers.onFirstTouch?.();
  });
  stickZone.addEventListener('pointermove', (e) => {
    if (e.pointerId !== stickId) return;
    e.preventDefault();
    setStickFromEvent(e);
  });
  const endStick = (e) => {
    if (e.pointerId !== stickId) return;
    stickId = null;
    stickState.active = false;
    stickState.x = stickState.y = 0;
    stick.classList.remove('on');
    knob.classList.remove('on');
  };
  stickZone.addEventListener('pointerup', endStick);
  stickZone.addEventListener('pointercancel', endStick);

  // ---- Buttons ----
  const held = new Set();
  function bindButton(id, { onDown, onUp, hold = false }) {
    const node = el(id);
    node.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      node.setPointerCapture(e.pointerId);
      node.classList.add('held');
      node.__downAt = performance.now();
      if (hold) held.add(id);
      onDown?.();
      handlers.onFirstTouch?.();
    });
    const up = (e) => {
      e.preventDefault();
      if (!node.classList.contains('held')) return;
      node.classList.remove('held');
      if (hold) held.delete(id);
      onUp?.(performance.now() - (node.__downAt || 0));
    };
    node.addEventListener('pointerup', up);
    node.addEventListener('pointercancel', up);
    node.addEventListener('pointerleave', (e) => {
      if (node.hasPointerCapture?.(e.pointerId)) return;
    });
    return node;
  }

  bindButton('tc-turbo', { hold: true });
  bindButton('tc-spin', { onDown: () => handlers.onMove?.('spin') });
  bindButton('tc-juke', { onDown: () => handlers.onMove?.('juke') });
  bindButton('tc-truck', { onDown: () => handlers.onMove?.('truck') });
  bindButton('tc-switch', { onDown: () => handlers.onSwitch?.() });
  bindButton('tc-pick', { onDown: () => handlers.onPick?.() });
  bindButton('tc-snap', { onDown: () => handlers.onSnap?.() });
  bindButton('tc-menu', { onDown: () => handlers.onMenu?.() });
  bindButton('tc-gb', { onDown: () => handlers.onGamebreaker?.() });
  // The gamebreaker button only exists while the meter is full.
  let gbReady = false;
  el('tc-gb').classList.add('hidden');
  const pulse = () => {
    const node = el('tc-gb');
    node.style.boxShadow = gbReady
      ? '0 0 22px rgba(255,213,74,0.85), 0 3px 12px rgba(0,0,0,0.4)'
      : '0 3px 12px rgba(0,0,0,0.4)';
  };

  // ---- Receiver chips ----
  let targets = [];
  function setTargets(list) {
    const sameShape =
      list.length === targets.length &&
      list.every((t, i) => t.slot === targets[i].slot);
    if (!sameShape) {
      targetsHost.innerHTML = list
        .map(
          (t) =>
            `<div class="btn chip-t" data-slot="${t.slot}" style="width:58px;height:58px;font-size:20px">
               <div>${t.letter}</div><div class="sub">${t.tag || ''}</div>
             </div>`
        )
        .join('');
      for (const node of targetsHost.querySelectorAll('.btn')) {
        const slot = Number(node.dataset.slot);
        bindChip(node, slot);
      }
      layout();
    }
    targets = list;
    for (const node of targetsHost.querySelectorAll('.btn')) {
      const t = list.find((x) => x.slot === Number(node.dataset.slot));
      const op = t?.live ? '1' : '0.35';
      if (node.__op !== op) { node.__op = op; node.style.opacity = op; }
      const sub = node.querySelector('.sub');
      const tag = t?.tag || '';
      if (sub && sub.__tag !== tag) { sub.__tag = tag; sub.textContent = tag; }
    }
  }
  function bindChip(node, slot) {
    node.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      node.setPointerCapture(e.pointerId);
      node.classList.add('held');
      node.__downAt = performance.now();
      handlers.onFirstTouch?.();
    });
    const up = (e) => {
      e.preventDefault();
      if (!node.classList.contains('held')) return;
      node.classList.remove('held');
      // Hold for a lob over the top, tap for a bullet.
      const lob = performance.now() - (node.__downAt || 0) > 260;
      handlers.onThrow?.(slot, lob);
    };
    node.addEventListener('pointerup', up);
    node.addEventListener('pointercancel', up);
  }

  // ---- Modes ----
  // Which cluster is on screen depends on what the player can do right now.
  const show = (id, on) => el(id).classList.toggle('hidden', !on);
  function setGamebreaker(ready) {
    if (ready === gbReady) return;
    gbReady = ready;
    el('tc-gb').classList.toggle('hidden', !ready);
    pulse();
  }

  function setMode(mode) {
    const carrier = mode === 'carry';
    const qb = mode === 'qb';
    const defense = mode === 'defense';
    show('tc-snap', mode === 'lineup');
    show('tc-turbo', carrier || qb || defense);
    show('tc-spin', carrier);
    show('tc-juke', carrier);
    show('tc-truck', carrier);
    show('tc-switch', defense);
    show('tc-pick', defense);
    targetsHost.style.display = qb ? 'block' : 'none';
    if (mode === 'menu') setGamebreaker(false);
    root.classList.toggle('off', mode === 'menu');
  }

  window.addEventListener('resize', layout);
  window.addEventListener('orientationchange', () => setTimeout(layout, 120));
  layout();
  setMode('lineup');

  return {
    stick: stickState,
    get sprintHeld() {
      return held.has('tc-turbo');
    },
    setTargets,
    setMode,
    setGamebreaker,
    layout,
    hide(on) {
      root.classList.toggle('off', on);
    },
  };
}

// Block the browser gestures that ruin a touch game: double-tap zoom,
// pinch, rubber-band scroll, long-press selection.
export function lockViewport() {
  const stop = (e) => {
    if (e.target.closest?.('[data-scrollable]')) return;
    e.preventDefault();
  };
  document.addEventListener('touchmove', stop, { passive: false });
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault());
  let lastTouch = 0;
  document.addEventListener(
    'touchend',
    (e) => {
      const now = Date.now();
      if (now - lastTouch < 320 && !e.target.closest?.('[data-scrollable]')) e.preventDefault();
      lastTouch = now;
    },
    { passive: false }
  );
  // Publish the safe-area insets as numbers the layout can read.
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;top:0;left:0;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);visibility:hidden;pointer-events:none';
  document.body.appendChild(probe);
  const read = () => {
    const s = getComputedStyle(probe);
    const r = document.documentElement.style;
    r.setProperty('--sat', s.paddingTop);
    r.setProperty('--sar', s.paddingRight);
    r.setProperty('--sab', s.paddingBottom);
    r.setProperty('--sal', s.paddingLeft);
  };
  read();
  window.addEventListener('resize', read);
  window.addEventListener('orientationchange', () => setTimeout(read, 120));
}
