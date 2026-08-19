/* ============================================================
   KINGSHOT — core.js
   Utilities, RNG, Audio (WebAudio-Synth), Eingabe (Joystick +
   Tastatur), Speicher-I/O (doppelter Slot, ausfallsicher).
   ============================================================ */
'use strict';

// ---------- Utilities ----------
KS.U = {
  clamp: (v, a, b) => v < a ? a : (v > b ? b : v),
  lerp: (a, b, t) => a + (b - a) * t,
  dist2: (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; },
  dist: (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by),
  angleTo: (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax),
  rand: (a, b) => a + Math.random() * (b - a),
  randInt: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
  pick: arr => arr[Math.floor(Math.random() * arr.length)],
  easeOutCubic: t => 1 - Math.pow(1 - t, 3),
  easeInCubic: t => t * t * t,
  easeOutBack: t => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
  easeOutElastic: t => t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI / 3)) + 1,

  // Zahlenformat: 1.2k / 3.4M
  fmt(n) {
    n = Math.floor(n);
    if (n < 1000) return String(n);
    if (n < 10000) return (n / 1000).toFixed(2).replace(/\.?0+$/, '') + 'k';
    if (n < 1e6) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    if (n < 1e9) return (n / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M';
    return (n / 1e9).toFixed(2).replace(/\.?0+$/, '') + 'B';
  },

  // Deterministischer RNG (mulberry32) für Deko
  seededRng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  },

  shade(hex, amt) { // hex-Farbe aufhellen (+) / abdunkeln (-), amt -1..1
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    if (amt >= 0) { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
    else { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt; }
    return `rgb(${r | 0},${g | 0},${b | 0})`;
  },
};

// ---------- Räumliches Gitter (für Kollisionen/Ziele) ----------
KS.Grid = class {
  constructor(cell) { this.cell = cell; this.map = new Map(); }
  clear() { this.map.clear(); }
  key(cx, cy) { return cx * 100000 + cy; }
  insert(e) {
    const cx = Math.floor(e.x / this.cell), cy = Math.floor(e.y / this.cell);
    const k = this.key(cx, cy);
    let arr = this.map.get(k);
    if (!arr) { arr = []; this.map.set(k, arr); }
    arr.push(e);
  }
  query(x, y, r, out) {
    out.length = 0;
    const c = this.cell;
    const x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c);
    const y0 = Math.floor((y - r) / c), y1 = Math.floor((y + r) / c);
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const arr = this.map.get(this.key(cx, cy));
      if (arr) for (let i = 0; i < arr.length; i++) out.push(arr[i]);
    }
    return out;
  }
};

// ---------- Audio ----------
KS.Audio = (() => {
  let ctx = null, master = null, sfxGain = null, musicGain = null;
  let sfxOn = true, musicOn = true, unlocked = false;
  let musicTimer = null, musicStep = 0, nightMode = false;

  function ensure() {
    if (ctx) return true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
      sfxGain = ctx.createGain(); sfxGain.gain.value = sfxOn ? 0.85 : 0; sfxGain.connect(master);
      musicGain = ctx.createGain(); musicGain.gain.value = musicOn ? 0.30 : 0; musicGain.connect(master);
      return true;
    } catch (e) { return false; }
  }

  function unlock() {
    if (!ensure()) return;
    if (ctx.state === 'suspended') ctx.resume();
    if (!unlocked) { unlocked = true; startMusic(); }
  }

  function env(g, t0, a, peak, d, sustain = 0.0001) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(Math.max(sustain, 0.0001), t0 + a + d);
  }

  function tone(type, f0, f1, dur, peak = 0.3, attack = 0.005, dest = null) {
    if (!ctx || !unlocked) return;
    const t0 = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    env(g, t0, attack, peak, dur);
    o.connect(g); g.connect(dest || sfxGain);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  let noiseBuf = null;
  function noise(dur, peak = 0.25, fLow = 400, fHigh = 4000, attack = 0.004) {
    if (!ctx || !unlocked) return;
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t0 = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass';
    bp.frequency.setValueAtTime(Math.sqrt(fLow * fHigh), t0);
    bp.Q.value = 0.8;
    const g = ctx.createGain();
    env(g, t0, attack, peak, dur);
    src.connect(bp); bp.connect(g); g.connect(sfxGain);
    src.start(t0); src.stop(t0 + dur + 0.05);
  }

  // ---- SFX-Bibliothek ----
  let coinCombo = 0, coinComboT = 0, clinkCombo = 0, clinkComboT = 0;
  const SFX = {
    coin() {
      const now = performance.now();
      coinCombo = (now - coinComboT < 700) ? Math.min(coinCombo + 1, 14) : 0;
      coinComboT = now;
      const f = 900 * Math.pow(1.045, coinCombo) * KS.U.rand(0.98, 1.02);
      tone('sine', f, f * 1.5, 0.09, 0.16, 0.002);
      tone('triangle', f * 2, f * 2.6, 0.06, 0.07, 0.002);
    },
    clink() {
      const now = performance.now();
      clinkCombo = (now - clinkComboT < 500) ? Math.min(clinkCombo + 1, 24) : 0;
      clinkComboT = now;
      const f = 620 * Math.pow(1.028, clinkCombo) * KS.U.rand(0.99, 1.01);
      tone('triangle', f, f * 1.25, 0.07, 0.2, 0.002);
      noise(0.03, 0.05, 3000, 8000);
    },
    swing() { noise(0.12, 0.10, 900, 2600, 0.01); },
    hit() { tone('square', 170, 110, 0.08, 0.13); noise(0.05, 0.10, 500, 1800); },
    playerHurt() { tone('sawtooth', 220, 120, 0.18, 0.2); },
    monsterDie() { tone('square', KS.U.rand(300, 420), 90, 0.16, 0.14); noise(0.08, 0.08, 300, 1200); },
    bossDie() { tone('sawtooth', 200, 40, 0.9, 0.35); noise(0.7, 0.25, 80, 600); },
    bossRoar() { tone('sawtooth', 90, 55, 0.7, 0.3); tone('sawtooth', 136, 70, 0.7, 0.2); noise(0.6, 0.18, 100, 700, 0.05); },
    arrow() { noise(0.06, 0.07, 1200, 5000); },
    cannon() { tone('sine', 90, 40, 0.28, 0.4); noise(0.2, 0.22, 100, 900); },
    frost() { tone('sine', 1400, 2200, 0.14, 0.08); tone('sine', 1900, 2800, 0.12, 0.05); },
    zap() { noise(0.09, 0.2, 2000, 9000, 0.001); tone('square', 800, 200, 0.07, 0.1); },
    flame() { noise(0.12, 0.05, 300, 1400, 0.02); },
    build() {
      tone('triangle', 300, 500, 0.12, 0.25);
      setTimeout(() => tone('triangle', 400, 660, 0.12, 0.25), 90);
      setTimeout(() => { tone('triangle', 520, 880, 0.2, 0.3); noise(0.25, 0.15, 200, 900); }, 190);
    },
    upgrade() { tone('sine', 520, 1040, 0.25, 0.22); tone('sine', 660, 1320, 0.3, 0.15); },
    quest() { tone('triangle', 660, 660, 0.12, 0.25); setTimeout(() => tone('triangle', 880, 880, 0.22, 0.28), 120); },
    chapter() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone('triangle', f, f, 0.4, 0.2), i * 130)); },
    hornDusk() { tone('sawtooth', 146, 146, 0.9, 0.16, 0.08); tone('sawtooth', 220, 220, 0.9, 0.12, 0.10); },
    hornDawn() { tone('triangle', 392, 392, 0.5, 0.2, 0.03); setTimeout(() => tone('triangle', 523, 523, 0.7, 0.2, 0.03), 180); },
    baseHit() { tone('sine', 100, 60, 0.2, 0.3); noise(0.12, 0.15, 150, 700); },
    click() { tone('triangle', 700, 900, 0.05, 0.12, 0.002); },
    survivor() { tone('triangle', 587, 784, 0.25, 0.16); },
    heal() { tone('sine', 780, 1180, 0.3, 0.06, 0.05); },
    defeat() { [330, 262, 220, 165].forEach((f, i) => setTimeout(() => tone('sawtooth', f, f * 0.97, 0.5, 0.2), i * 260)); },
    victory() { [523, 659, 784, 1046, 1318].forEach((f, i) => setTimeout(() => tone('triangle', f, f, 0.5, 0.22), i * 150)); },
  };

  // ---- Sanfte generative Musik ----
  // Tag: freundliche Dur-Folge · Nacht: gespannte Moll-Folge
  const DAY_CHORDS = [[196, 246.9, 293.7], [164.8, 196, 246.9], [174.6, 220, 261.6], [196, 246.9, 293.7]];
  const NIGHT_CHORDS = [[164.8, 196, 246.9], [155.6, 185, 233.1], [146.8, 174.6, 220], [164.8, 196, 246.9]];
  const PLUCKS_DAY = [392, 440, 493.9, 587.3, 659.3];
  const PLUCKS_NIGHT = [329.6, 370, 392, 440, 493.9];

  function padChord(freqs, dur) {
    if (!ctx) return;
    const t0 = ctx.currentTime;
    freqs.forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.value = f * (i === 0 ? 0.5 : 1);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(0.055, t0 + dur * 0.35);
      g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
      o.connect(lp); lp.connect(g); g.connect(musicGain);
      o.start(t0); o.stop(t0 + dur + 0.1);
    });
  }
  function pluck(f) {
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.05, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.9);
    o.connect(g); g.connect(musicGain);
    o.start(t0); o.stop(t0 + 1);
  }
  function startMusic() {
    if (musicTimer) return;
    const stepDur = 2.6;
    musicTimer = setInterval(() => {
      if (!musicOn || !ctx || ctx.state !== 'running' || document.hidden) return;
      const chords = nightMode ? NIGHT_CHORDS : DAY_CHORDS;
      padChord(chords[musicStep % chords.length], stepDur * 1.05);
      if (Math.random() < (nightMode ? 0.5 : 0.65)) {
        const p = nightMode ? PLUCKS_NIGHT : PLUCKS_DAY;
        setTimeout(() => pluck(KS.U.pick(p)), KS.U.rand(200, 1600));
      }
      musicStep++;
    }, stepDur * 1000);
  }

  return {
    unlock, SFX,
    setNight(n) { nightMode = n; },
    setSfx(on) { sfxOn = on; if (sfxGain) sfxGain.gain.value = on ? 0.85 : 0; },
    setMusic(on) { musicOn = on; if (musicGain) musicGain.gain.value = on ? 0.30 : 0; },
    get sfxOn() { return sfxOn; },
    get musicOn() { return musicOn; },
    suspend() { if (ctx && ctx.state === 'running') ctx.suspend(); },
    resume() { if (ctx && ctx.state === 'suspended' && unlocked) ctx.resume(); },
  };
})();

// ---------- Eingabe: Floating-Joystick + Tastatur ----------
KS.Input = (() => {
  const state = {
    mx: 0, my: 0,       // Bewegungsvektor -1..1
    active: false,
    keys: new Set(),
  };
  let joyId = null, baseX = 0, baseY = 0;
  const MAXR = 52;      // Joystick-Radius in px
  let elJoy, elBase, elThumb;

  function setBase(x, y) {
    baseX = x; baseY = y;
    elBase.style.transform = `translate(${x}px, ${y}px)`;
    elThumb.style.transform = `translate(${x}px, ${y}px)`;
  }
  function setThumb(dx, dy) {
    elThumb.style.transform = `translate(${baseX + dx}px, ${baseY + dy}px)`;
  }

  function onDown(e) {
    if (joyId !== null) return;
    KS.Audio.unlock();
    joyId = e.pointerId;
    elJoy.classList.remove('hidden');
    setBase(e.clientX, e.clientY);
    state.active = true;
    state.mx = 0; state.my = 0;
    // Für die Tipp-Erkennung mitschreiben (kurz + ohne Wandern = Klick)
    tapStart = performance.now();
    tapX = e.clientX; tapY = e.clientY; tapMoved = 0;
    try { e.target.setPointerCapture(e.pointerId); } catch (_) {}
  }
  function onMove(e) {
    if (e.pointerId !== joyId) return;
    tapMoved = Math.max(tapMoved, Math.hypot(e.clientX - tapX, e.clientY - tapY));
    let dx = e.clientX - baseX, dy = e.clientY - baseY;
    const d = Math.hypot(dx, dy);
    // Joystick "zieht nach", wenn der Finger weiter wandert → fühlt sich direkt an
    if (d > MAXR * 1.6) {
      const pull = (d - MAXR * 1.6) / d;
      baseX += dx * pull; baseY += dy * pull;
      elBase.style.transform = `translate(${baseX}px, ${baseY}px)`;
      dx = e.clientX - baseX; dy = e.clientY - baseY;
    }
    const d2 = Math.hypot(dx, dy);
    const cl = Math.min(d2, MAXR);
    if (d2 > 0.001) {
      const nx = dx / d2, ny = dy / d2;
      setThumb(nx * cl, ny * cl);
      // Feinfühlig: kleine Auslenkung = langsames Gehen
      const mag = Math.min(1, (d2 / MAXR) * 1.15);
      state.mx = nx * mag; state.my = ny * mag;
    } else {
      state.mx = 0; state.my = 0;
      setThumb(0, 0);
    }
  }
  function onUp(e) {
    if (e.pointerId !== joyId) return;
    joyId = null;
    state.active = false;
    state.mx = 0; state.my = 0;
    elJoy.classList.add('hidden');
    // Kurzer Tipp ohne Wandern → als Klick aufs Spielfeld melden
    const dur = performance.now() - tapStart;
    if (dur < 300 && tapMoved < 12 && tapHandler) tapHandler(tapX, tapY);
  }

  let tapStart = 0, tapX = 0, tapY = 0, tapMoved = 0, tapHandler = null;
  function onTap(fn) { tapHandler = fn; }

  const KEYMAP = {
    KeyW: [0, -1], KeyS: [0, 1], KeyA: [-1, 0], KeyD: [1, 0],
    ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
  };
  function keyVec() {
    let x = 0, y = 0;
    state.keys.forEach(k => { const v = KEYMAP[k]; if (v) { x += v[0]; y += v[1]; } });
    const d = Math.hypot(x, y);
    return d > 0 ? [x / d, y / d] : [0, 0];
  }

  function init(canvas) {
    elJoy = document.getElementById('joy');
    elBase = document.getElementById('joy-base');
    elThumb = document.getElementById('joy-thumb');
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('lostpointercapture', onUp);
    window.addEventListener('keydown', e => {
      if (KEYMAP[e.code]) { state.keys.add(e.code); e.preventDefault(); KS.Audio.unlock(); }
      // Bauen bestätigen / Markt öffnen (Desktop-Kürzel)
      if ((e.code === 'Space' || e.code === 'KeyE' || e.code === 'Enter') && KS.Game && KS.Game.G) {
        const G = KS.Game.G;
        if (!G.paused && G.nearPad) {
          e.preventDefault();
          const b = G.state.buildings[G.nearPad.id];
          if (G.nearPad.type === 'markt' && b && b.tier >= 1) KS.UI.openMarket(G);
          else KS.Systems.toggleBuild(G);
          KS.UI.refreshActBtn(G);
        }
      }
      if (e.code === 'Escape' && KS.UI && !KS.UI.isMarketOpen()) KS.UI.toggleMenu();
    });
    window.addEventListener('keyup', e => state.keys.delete(e.code));
    window.addEventListener('blur', () => state.keys.clear());
  }

  function vector() {
    if (state.active) return [state.mx, state.my];
    return keyVec();
  }

  return { init, vector, state, onTap };
})();

// ---------- Speicher-I/O (doppelt gepuffert, ausfallsicher) ----------
KS.SaveIO = (() => {
  let memoryFallback = null;
  let available = true;
  let flip = false;
  try {
    localStorage.setItem('__ks_test', '1');
    localStorage.removeItem('__ks_test');
  } catch (e) { available = false; }

  function write(obj) {
    const json = JSON.stringify(obj);
    if (!available) { memoryFallback = json; return true; }
    try {
      // Abwechselnd in zwei Slots schreiben → ein korrupter Slot ist nie fatal
      const key = flip ? KS.CFG.SAVE_KEY_B : KS.CFG.SAVE_KEY;
      localStorage.setItem(key, json);
      localStorage.setItem('kingshot_last', flip ? 'b' : 'a');
      flip = !flip;
      return true;
    } catch (e) {
      memoryFallback = json;
      return false;
    }
  }

  function read() {
    if (!available) return memoryFallback ? JSON.parse(memoryFallback) : null;
    const last = localStorage.getItem('kingshot_last');
    const order = last === 'b'
      ? [KS.CFG.SAVE_KEY_B, KS.CFG.SAVE_KEY]
      : [KS.CFG.SAVE_KEY, KS.CFG.SAVE_KEY_B];
    for (const key of order) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const obj = JSON.parse(raw);
        if (obj && typeof obj.version === 'number') return obj;
      } catch (e) { /* Slot korrupt → nächsten versuchen */ }
    }
    return null;
  }

  function wipe() {
    if (!available) { memoryFallback = null; return; }
    try {
      localStorage.removeItem(KS.CFG.SAVE_KEY);
      localStorage.removeItem(KS.CFG.SAVE_KEY_B);
      localStorage.removeItem('kingshot_last');
    } catch (e) {}
  }

  return { write, read, wipe, get available() { return available; } };
})();

// ---------- Auto-Update: neue Server-Version erkennen ----------
// Sehr sparsam: eine winzige JSON-Datei, nur im Vordergrund, mit
// großem Intervall. Bei neuer Version wird gespeichert und neu
// geladen — dank Auto-Save geht es genau an derselben Stelle weiter.
KS.Updater = (() => {
  const CHECK_MS = 5 * 60 * 1000;      // alle 5 Minuten
  const MIN_GAP_MS = 60 * 1000;        // nie öfter als 1×/Minute (z. B. bei Tab-Wechseln)
  const LOOP_GUARD_MS = 45 * 1000;     // nach einem Reload mind. so lange nicht wieder
  const RELOAD_KEY = 'ks_upd_reload_at';

  // Referenz ist die Version der ERSTEN Antwort nach dem Laden dieser Seite.
  // Damit ist ein Reload-Kreislauf konstruktiv unmöglich: nach jedem
  // Neuladen wird die Referenz neu gesetzt.
  let refVersion = null;
  let lastCheck = 0, pending = false, started = false;

  function recentlyReloaded() {
    try {
      const t = parseInt(sessionStorage.getItem(RELOAD_KEY) || '0', 10);
      return t > 0 && Date.now() - t < LOOP_GUARD_MS;
    } catch (e) { return false; }
  }

  async function check(force) {
    const now = Date.now();
    if (pending) return;
    if (!force && (document.hidden || now - lastCheck < MIN_GAP_MS)) return;
    lastCheck = now;
    let data;
    try {
      const res = await fetch('version.json?_=' + now, { cache: 'no-store' });
      if (!res.ok) return;
      data = await res.json();
    } catch (e) { return; }             // offline o. ä. — beim nächsten Mal wieder
    if (!data || !data.v) return;
    if (refVersion === null) { refVersion = data.v; return; }
    if (data.v === refVersion) return;
    if (recentlyReloaded()) { refVersion = data.v; return; }   // Schleifen-Bremse
    pending = true;
    applyUpdate();
  }

  function applyUpdate() {
    if (KS.UI && KS.UI.toast) KS.UI.toast('Neue Version verfügbar — wird geladen…', 2600, 'sparkle');
    try { KS.Game.save(); } catch (e) {}
    // Kurz warten, damit Speichern und Hinweis sicher durch sind
    setTimeout(() => {
      try { KS.Game.save(); } catch (e) {}
      try { sessionStorage.setItem(RELOAD_KEY, String(Date.now())); } catch (e) {}
      location.reload();
    }, 1400);
  }

  function start() {
    if (started) return;
    started = true;
    setInterval(check, CHECK_MS);
    // Beim Zurückkehren in den Tab prüfen — dort ist ein Reload am unauffälligsten
    document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
    check();
  }

  return { start, check, get version() { return refVersion; } };
})();
