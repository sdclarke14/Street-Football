// Game-portal hooks (CrazyGames SDK v3, Poki SDK v2) behind one small API.
//
// Which portal is picked at BUILD time: `npm run build:crazygames`,
// `npm run build:poki`, `npm run build:itch`. The plain `npm run build`
// (GitHub Pages) and itch.io get the no-op adapter: no SDK, no ads.
// vite.config.js puts the portal's SDK <script> in <head> for those builds.
//
// What the game calls:
//   init()            once at boot, before loading finishes
//   loadingDone()     assets are in, the title is up
//   setGameplay(on)   edge-triggered here, so the portal never sees the same
//                     event twice in a row (a Poki rule)
//   adBreak(hooks)    a natural break (new game, after a score). Resolves when
//                     play can continue. hooks.mute(true/false) and
//                     hooks.block(true/false) let the game silence audio and
//                     ignore input while an ad runs (required by both).
//   onMuteSetting(fn) CrazyGames' site-wide mute setting, which must win over
//                     the in-game sound toggle.
// Every call is wrapped: a blocked SDK, an ad blocker or an unfilled ad must
// never stop the game.

const PORTAL = import.meta.env.VITE_PORTAL || '';

const safe = (fn) => {
  try {
    return fn();
  } catch (e) {
    console.warn('[portal]', e?.message || e);
    return undefined;
  }
};

function crazyGames() {
  const sdk = () => window.CrazyGames?.SDK;
  let ready = false;
  return {
    name: 'crazygames',
    async init() {
      if (!sdk()) return;
      try {
        await sdk().init();
        ready = sdk().environment !== 'disabled';
        if (ready) safe(() => sdk().game.loadingStart());
      } catch (e) {
        console.warn('[portal] CrazyGames init failed', e);
      }
    },
    loadingDone() {
      if (ready) safe(() => sdk().game.loadingStop());
    },
    gameplayStart() {
      if (ready) safe(() => sdk().game.gameplayStart());
    },
    gameplayStop() {
      if (ready) safe(() => sdk().game.gameplayStop());
    },
    adBreak({ mute, block }) {
      if (!ready) return Promise.resolve();
      return new Promise((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          mute(false);
          block(false);
          resolve();
        };
        safe(() =>
          sdk().ad.requestAd('midgame', {
            adStarted: () => { mute(true); block(true); },
            adFinished: finish,
            adError: finish, // unfilled, cooldown, adblock, disabled in Basic Launch
          })
        );
        // Never hang the game if the SDK goes quiet.
        setTimeout(finish, 45000);
      });
    },
    onMuteSetting(fn) {
      if (!ready) return;
      safe(() => {
        fn(!!sdk().game.settings?.muteAudio);
        sdk().game.addSettingsChangeListener((s) => fn(!!s?.muteAudio));
      });
    },
  };
}

function poki() {
  const sdk = () => window.PokiSDK;
  let ready = false;
  return {
    name: 'poki',
    async init() {
      if (!sdk()) return;
      try {
        await sdk().init();
        ready = true;
      } catch {
        // Ad blocker or offline: Poki's own guidance is to load the game anyway.
        ready = false;
      }
    },
    loadingDone() {
      safe(() => sdk()?.gameLoadingFinished());
    },
    gameplayStart() {
      safe(() => sdk()?.gameplayStart());
    },
    gameplayStop() {
      safe(() => sdk()?.gameplayStop());
    },
    adBreak({ mute, block }) {
      if (!sdk()) return Promise.resolve();
      let started = false;
      return Promise.race([
        Promise.resolve(
          safe(() => sdk().commercialBreak(() => { started = true; mute(true); block(true); }))
        ).catch(() => {}),
        new Promise((r) => setTimeout(r, 45000)),
      ]).finally(() => {
        if (started) { mute(false); block(false); }
      });
    },
    onMuteSetting() {},
  };
}

function none() {
  return {
    name: 'none',
    async init() {},
    loadingDone() {},
    gameplayStart() {},
    gameplayStop() {},
    adBreak() { return Promise.resolve(); },
    onMuteSetting() {},
  };
}

const impl = PORTAL === 'crazygames' ? crazyGames() : PORTAL === 'poki' ? poki() : none();
let inGameplay = false;

export const portal = {
  name: impl.name,
  isPortal: impl.name !== 'none',
  init: () => impl.init(),
  loadingDone: () => impl.loadingDone(),
  setGameplay(on) {
    if (on === inGameplay) return;
    inGameplay = on;
    if (on) impl.gameplayStart();
    else impl.gameplayStop();
  },
  async adBreak(hooks) {
    const was = inGameplay;
    portal.setGameplay(false); // no gameplay events while an ad runs
    await impl.adBreak(hooks);
    if (was) portal.setGameplay(true);
  },
  onMuteSetting: (fn) => impl.onMuteSetting(fn),
};

// Poki requirement, harmless everywhere: arrows and space must never scroll
// the host page, and neither may the mouse wheel.
if (impl.name !== 'none') {
  window.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', ' '].includes(e.key)) e.preventDefault();
  });
  window.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
}
