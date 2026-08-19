/* ============================================================
   KINGSHOT — game.js
   Spielzustand, Game-Loop, Kamera & Renderer (Tag/Nacht, Licht),
   lückenloses Auto-Save (Intervall + Ereignisse + pagehide),
   Niederlage/Wiederaufstehen, Boot.
   ============================================================ */
'use strict';

KS.Game = (() => {
  const U = KS.U, CFG = KS.CFG, Ent = KS.Ent, Sys = KS.Systems;
  const TAU = Math.PI * 2;

  let canvas, ctx, W = 0, H = 0, DPR = 1, ZOOM = 1;
  let vignette = null;
  let last = 0, rafId = 0;
  let saveDirty = false, saveTimer = 0;

  const G = {};      // Laufzeit-Zustand
  let booted = false;

  // ================== ZUSTAND ==================
  function newState() {
    return {
      version: CFG.SAVE_VERSION,
      seed: (Math.random() * 1e9) | 0,
      createdAt: Date.now(),
      gold: 0, goldCollected: 0,
      day: 1, phase: 'day', phaseT: 0,
      baseHp: CFG.BUILDINGS.castle.hp(1),
      player: { x: CFG.WORLD.cx, y: CFG.WORLD.cy + 170, hp: CFG.PLAYER.hpMax },
      buildings: { castle: { tier: 1, prog: 0 } },
      unlockedPads: ['castle', 'tower_n'],
      survivors: 0,
      questIdx: 0, endlessIdx: 0, questBase: 0, chapterShown: -1,
      questVersion: CFG.QUEST_VERSION,
      market: {},
      wall: null,
      bossesKilled: {},
      killsByClass: {},
      stats: { kills: 0, bossKills: 0, goldEarned: 0, coins: 0, days: 0, playTime: 0, defeats: 0 },
      log: [],
      night: null,
      settings: { sfx: true, music: true, shake: true },
      victoryShown: false,
    };
  }

  function initRuntime(state) {
    G.state = state;
    G.padList = CFG.PADS;
    G.monsters = []; G.coins = []; G.projectiles = [];
    G.particles = []; G.rings = []; G.texts = []; G.zaps = [];
    G.villagers = []; G.depositFx = [];
    G.grid = new KS.Grid(72); G.qbuf = []; G.qbuf2 = [];
    G.towers = []; G.prodTimers = {}; G.buildBounce = {}; G.padDisplay = {};
    G.time = 0; G.shake = 0; G.dark = state.phase === 'night' ? 0.66 : 0;
    G.baseFlash = 0; G.baseHitSfxT = 0; G.baseAlertT = 0;
    G.playerAnimT = 0; G.playerFace = 1;
    G.playerDown = false; G.playerDownT = 0; G.playerInvuln = 0; G.playerHurtT = 0;
    G.playerKx = 0; G.playerKy = 0; G.regenWait = 0; G.attackCd = 0; G.swing = null;
    G.shrineGlow = 0; G.killsThisFrame = 0;
    G.depositT = 0; G.depositAcc = 0; G.activePad = null;
    G.boss = null; G.night = state.night || null;
    G.pingT = 0; G.dayTrickleT = 0;
    G.wallFlash = new Array(CFG.WALL.segs).fill(0);
    G.wallBreachT = 0;
    G.paused = true;
    G.cam = { x: state.player.x, y: state.player.y };
    Sys.rebuildDerived(G);
    // Mauerpfosten-Positionen (statisch)
    G.wallPosts = [];
    for (let seg = 0; seg < CFG.WALL.segs; seg++) {
      const arc = Sys.wallSegArc(seg);
      const len = (arc.end - arc.start) * CFG.WALL.r;
      const n = Math.max(3, Math.round(len / CFG.WALL.postGap));
      for (let i = 0; i < n; i++) {
        const a = arc.start + (arc.end - arc.start) * ((i + 0.5) / n);
        const rJit = CFG.WALL.r + ((seg * 7 + i * 13) % 5) - 2;   // leichte organische Staffelung
        G.wallPosts.push({
          seg, v: i % 2,
          x: CFG.WORLD.cx + Math.cos(a) * rJit,
          y: CFG.WORLD.cy + Math.sin(a) * rJit,
        });
      }
    }
    // Torpfosten flankieren jede Öffnung
    G.gatePosts = [];
    for (const g of CFG.GATES) {
      for (const s of [-1, 1]) {
        const a = g + s * (CFG.WALL.gateHalf + 0.015);
        G.gatePosts.push({
          x: CFG.WORLD.cx + Math.cos(a) * CFG.WALL.r,
          y: CFG.WORLD.cy + Math.sin(a) * CFG.WALL.r,
        });
      }
    }
    // Welt (deterministisch aus Seed)
    G.ground = KS.Art.paintGround(state.seed);
    G.props = KS.Art.generateProps(state.seed);
    if (state.phase === 'night') KS.Audio.setNight(true);
  }

  // ================== SPEICHERN & LADEN ==================
  function serialize() {
    const st = G.state;
    const snap = JSON.parse(JSON.stringify(st));
    snap.monstersSnap = G.monsters.filter(m => !m.dead).map(m => ({
      key: m.key, x: Math.round(m.x), y: Math.round(m.y),
      hp: Math.round(m.hp), hpMax: Math.round(m.hpMax),
      dmg: Math.round(m.dmg * 10) / 10, speed: Math.round(m.speed),
      gold: Math.round(m.gold), size: Math.round(m.size * 100) / 100,
      r: Math.round(m.r * 10) / 10,
      elite: m.elite || undefined, boss: m.boss || undefined,
      bossId: m.bossId, name: m.name, state: m.state === 'flee' ? 'flee' : undefined,
    }));
    snap.coinsSnap = G.coins.map(c => [Math.round(c.x), Math.round(c.y), c.value]);
    snap.savedAt = Date.now();
    return snap;
  }

  function restoreFromSave(saved) {
    const st = saved;
    const monsters = st.monstersSnap || [];
    const coins = st.coinsSnap || [];
    delete st.monstersSnap; delete st.coinsSnap;
    // fehlende Felder auffüllen (Migrationsfreundlich)
    const fresh = newState();
    for (const k of Object.keys(fresh)) if (st[k] === undefined) st[k] = fresh[k];
    for (const k of Object.keys(fresh.stats)) if (st.stats[k] === undefined) st.stats[k] = fresh.stats[k];
    // Quest-Kette wurde erweitert → alte Indizes übersetzen
    if ((st.questVersion || 1) < CFG.QUEST_VERSION) {
      if (st.questIdx < 99) st.questIdx = CFG.migrateQuestIdx(st.questIdx);
      st.questVersion = CFG.QUEST_VERSION;
    }
    initRuntime(st);
    // Rückwirkend: Freischaltungen bereits abgeschlossener Quests anwenden
    for (let i = 0; i < Math.min(st.questIdx, CFG.QUESTS.length); i++) {
      const q = CFG.QUESTS[i];
      if (q.unlock) for (const pid of q.unlock) Sys.unlockPad(G, pid, true);
    }
    // Monster wiederherstellen
    for (const s of monsters) {
      const sp = CFG.MONSTERS[s.key];
      if (!sp) continue;
      const m = {
        key: s.key, sp, cls: sp.cls,
        x: s.x, y: s.y, r: s.r || sp.r, hp: s.hp, hpMax: s.hpMax,
        dmg: s.dmg, speed: s.speed, gold: s.gold, size: s.size || 1,
        elite: !!s.elite, boss: !!s.boss, bossId: s.bossId, name: s.name,
        kx: 0, ky: 0, slowT: 0, slowF: 0, burnT: 0, burnDps: 0, hitT: 0,
        animT: Math.random() * 10, attackCd: U.rand(0.3, 1), rangedCd: 1,
        lunge: 0, face: 1, state: s.state === 'flee' ? 'flee' : 'march',
        dead: false, fly: sp.fly, venom: sp.venom,
      };
      G.monsters.push(m);
      if (m.boss) {
        G.boss = m;
        KS.UI.showBossBar(m.name || 'Boss');
      }
    }
    for (const c of coins) Ent.spawnCoin(G, c[0], c[1], c[2], { speed: 0, z: 0 });
    for (const c of G.coins) { c.state = 'idle'; c.z = 0; }
    Sys.syncVillagers(G);
  }

  function save() {
    if (!booted || !G.state) return;
    KS.SaveIO.write(serialize());
    saveDirty = false;
  }
  function requestSave() { saveDirty = true; }

  function hardReset() {
    KS.SaveIO.wipe();
    location.reload();
  }
  function loadImported(obj) {
    KS.SaveIO.write(obj);
    KS.SaveIO.write(obj);   // beide Slots überschreiben
    location.reload();
  }

  function log(msg) {
    const st = G.state;
    st.log.push({ d: st.day, t: msg });
    if (st.log.length > 90) st.log.shift();
  }

  // ================== NIEDERLAGE ==================
  // Wird mitten in Update-Schleifen ausgelöst → nur vormerken,
  // ausgeführt wird am sicheren Ende des Frames.
  function onDefeat() {
    G.defeatQueued = true;
  }

  function performDefeat() {
    const st = G.state;
    st.stats.defeats += 1;
    log('Die Burg ist gefallen…');
    // Monster ziehen ab
    for (const m of G.monsters) {
      Ent.burst(G, m.x, m.y - m.r, 5, { colors: [m.sp.c1, m.sp.c2], speed: 80, up: 90 });
    }
    G.monsters.length = 0;
    G.projectiles.length = 0;
    G.boss = null;
    KS.UI.hideBossBar();
    G.shake = 16;
    setPaused(true);
    KS.UI.showDefeat(st.day);
    save();
  }

  function reviveAfterDefeat() {
    const st = G.state;
    st.gold = Math.floor(st.gold * 0.7);          // 30 % des getragenen Goldes verloren
    st.baseHp = Math.round(G.baseHpMax * 0.5);
    st.player.hp = G.playerHpMax;
    st.player.x = CFG.WORLD.cx; st.player.y = CFG.WORLD.cy + 170;
    G.playerDown = false; G.playerInvuln = 3;
    st.phase = 'day'; st.phaseT = 0;
    st.night = null; G.night = null;
    KS.Audio.setNight(false);
    KS.UI.banner(`Tag ${st.day}`, 'Ein König gibt niemals auf.');
    log('Der Wiederaufbau beginnt — die Hoffnung lebt.');
    setPaused(false);
    save();
  }

  // ================== PAUSE ==================
  function setPaused(p) {
    G.paused = p;
    if (p) save();
  }

  // ================== UPDATE ==================
  function update(dt) {
    const st = G.state;
    G.time += dt;
    st.stats.playTime += dt;
    G.killsThisFrame = 0;

    // Gitter neu aufbauen
    G.grid.clear();
    for (const m of G.monsters) if (!m.dead) G.grid.insert(m);

    Sys.updateDirector(G, dt);
    Ent.updatePlayer(G, dt);
    Ent.updateMonsters(G, dt);
    Sys.updateBuildings(G, dt);
    Sys.updateDeposit(G, dt);
    Sys.updateDepositFx(G, dt);
    Ent.updateProjectiles(G, dt);
    Ent.updateCoins(G, dt);
    Ent.updateVillagers(G, dt);
    Ent.updateFx(G, dt);
    Sys.updateQuests(G);

    if (G.defeatQueued) {
      G.defeatQueued = false;
      performDefeat();
      return;
    }

    // Dorf-Sync alle paar Sekunden
    G.vilSyncT = (G.vilSyncT || 0) + dt;
    if (G.vilSyncT > 3) { G.vilSyncT = 0; Sys.syncVillagers(G); }

    // Burg-Alarm, wenn Spieler weit weg
    if (G.baseFlash > 0.9 && G.baseAlertT <= 0) {
      const d = U.dist(st.player.x, st.player.y, CFG.WORLD.cx, CFG.WORLD.cy);
      if (d > 620) {
        KS.UI.toast('Die Burg wird angegriffen!', 3400, 'castle');
        G.baseAlertT = 7;
      }
    }
    if (G.baseAlertT > 0) G.baseAlertT -= dt;
    if (G.baseFlash > 0) G.baseFlash -= dt * 2.4;
    if (G.playerHurtT > 0) G.playerHurtT -= dt;
    if (G.pingT > 0) G.pingT -= dt;
    if (G.wallBreachT > 0) G.wallBreachT -= dt;
    for (let i = 0; i < G.wallFlash.length; i++) if (G.wallFlash[i] > 0) G.wallFlash[i] -= dt * 3;
    G.shake = Math.max(0, G.shake - dt * 26);

    // Markt-Panel bei Nähe anzeigen
    const marktPad = G.padList.find(p => p.id === 'markt');
    const marktB = st.buildings.markt;
    const marktNear = marktB && marktB.tier >= 1 && !G.playerDown &&
      U.dist2(st.player.x, st.player.y, marktPad.x, marktPad.y) < 150 * 150;
    KS.UI.updateMarket(G, !!marktNear);

    // Dunkelheit angleichen
    const targetDark = st.phase === 'night' ? 0.62 : 0;
    G.dark += (targetDark - G.dark) * Math.min(1, dt * 0.9);

    // Kamera
    const [ix, iy] = KS.Input.vector();
    const lookX = ix * 70, lookY = iy * 70;
    const k = 1 - Math.pow(0.002, dt);
    G.cam.x += (st.player.x + lookX - G.cam.x) * k;
    G.cam.y += (st.player.y + lookY - G.cam.y) * k;
    const hw = W / (2 * ZOOM), hh = H / (2 * ZOOM);
    G.cam.x = U.clamp(G.cam.x, hw - 80, CFG.WORLD.w - hw + 80);
    G.cam.y = U.clamp(G.cam.y, hh - 80, CFG.WORLD.h - hh + 80);

    // Auto-Save: alle 2 s oder bei Ereignissen
    saveTimer += dt;
    if (saveTimer >= 2 || (saveDirty && saveTimer > 0.4)) {
      saveTimer = 0;
      save();
    }
  }

  // ================== RENDER ==================
  const GLOWS = {};
  function glowSprite(color) {
    if (GLOWS[color]) return GLOWS[color];
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 2, 64, 64, 64);
    gr.addColorStop(0, color);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    GLOWS[color] = c;
    return c;
  }

  function drawGlow(x, y, r, color, alpha) {
    ctx.globalAlpha = alpha;
    ctx.drawImage(glowSprite(color), x - r, y - r, r * 2, r * 2);
    ctx.globalAlpha = 1;
  }

  function render() {
    const st = G.state;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = '#1a2a16';
    ctx.fillRect(0, 0, W, H);

    // Kamera-Transform
    const shX = G.shake > 0 && st.settings.shake !== false ? U.rand(-G.shake, G.shake) * 0.5 : 0;
    const shY = G.shake > 0 && st.settings.shake !== false ? U.rand(-G.shake, G.shake) * 0.5 : 0;
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(ZOOM, ZOOM);
    ctx.translate(-G.cam.x + shX, -G.cam.y + shY);

    const vx0 = G.cam.x - W / (2 * ZOOM) - 120, vx1 = G.cam.x + W / (2 * ZOOM) + 120;
    const vy0 = G.cam.y - H / (2 * ZOOM) - 160, vy1 = G.cam.y + H / (2 * ZOOM) + 160;
    const inView = (x, y, m = 0) => x > vx0 - m && x < vx1 + m && y > vy0 - m && y < vy1 + m;

    // Boden
    ctx.drawImage(G.ground.canvas, 0, 0, G.ground.canvas.width, G.ground.canvas.height, 0, 0, CFG.WORLD.w, CFG.WORLD.h);

    // Schrein-Aura (dezent)
    const shrineB = st.buildings.shrine;
    if (shrineB && shrineB.tier >= 1) {
      const sp = G.padList.find(p => p.id === 'shrine');
      const R = CFG.BUILDINGS.shrine.auraR(shrineB.tier);
      ctx.globalAlpha = 0.10 + Math.sin(G.time * 1.6) * 0.03;
      ctx.fillStyle = '#fff3c8';
      ctx.beginPath(); ctx.arc(sp.x, sp.y, R, 0, TAU); ctx.fill();
      ctx.globalAlpha = 0.25;
      ctx.strokeStyle = '#fff3c8'; ctx.lineWidth = 2; ctx.setLineDash([10, 14]);
      ctx.beginPath(); ctx.arc(sp.x, sp.y, R, G.time * 0.15, G.time * 0.15 + TAU); ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    // Bauplatten (flach am Boden)
    for (const pad of G.padList) {
      if (!inView(pad.x, pad.y, 80)) continue;
      const unlocked = Sys.isUnlocked(G, pad.id);
      const b = st.buildings[pad.id];
      const hasBuilding = b && b.tier >= 1;
      if (!hasBuilding) {
        KS.Art.draw(ctx, KS.Art.padPlate(!unlocked), pad.x, pad.y + 26);
      } else if (pad.type !== 'castle') {
        // dezente Plattenbasis unter Gebäuden
        ctx.globalAlpha = 0.5;
        KS.Art.draw(ctx, KS.Art.padPlate(false), pad.x, pad.y + 26);
        ctx.globalAlpha = 1;
      }
    }

    // Münzen
    for (const c of G.coins) if (inView(c.x, c.y, 40)) Ent.drawCoin(ctx, c, G.time);

    // Staub-Partikel (unter Einheiten)
    Ent.drawParticles(G, ctx, 'below');

    // Y-sortierte Szene
    const items = [];
    for (const p of G.props) {
      if (!inView(p.x, p.y, 140)) continue;
      items.push({ y: p.y, kind: 'prop', p });
    }
    for (const pad of G.padList) {
      const b = st.buildings[pad.id];
      const unlocked = Sys.isUnlocked(G, pad.id);
      if (!inView(pad.x, pad.y, 260)) continue;
      if (b && b.tier >= 1) items.push({ y: pad.y, kind: 'bld', pad, b });
      else if (unlocked) items.push({ y: pad.y, kind: 'ghost', pad });
    }
    for (const m of G.monsters) if (!m.dead && inView(m.x, m.y, 160)) items.push({ y: m.y, kind: 'mon', m });
    for (const v of G.villagers) if (inView(v.x, v.y, 60)) items.push({ y: v.y, kind: 'vil', v });
    // Stadtmauer (Pfosten & Torpfeiler, einzeln y-sortiert)
    if (G.wallMax > 0 && st.wall) {
      const wTier = st.buildings.wall.tier;
      for (const p of G.wallPosts) {
        if (!inView(p.x, p.y, 70)) continue;
        items.push({ y: p.y, kind: 'wall', p, wTier });
      }
      for (const p of G.gatePosts) {
        if (!inView(p.x, p.y, 70)) continue;
        items.push({ y: p.y, kind: 'gate', p, wTier });
      }
    }
    items.push({ y: st.player.y, kind: 'player' });
    items.sort((a, b2) => a.y - b2.y);

    for (const it of items) {
      if (it.kind === 'prop') {
        const p = it.p;
        KS.Art.draw(ctx, KS.Art.prop(p.kind, p.v), p.x, p.y, p.s, 1, p.flip);
      } else if (it.kind === 'bld') {
        drawBuilding(it.pad, it.b);
      } else if (it.kind === 'ghost') {
        const spr = KS.Art.building(it.pad.type, 1);
        ctx.globalAlpha = 0.32 + Math.sin(G.time * 2.2) * 0.06;
        KS.Art.draw(ctx, spr, it.pad.x, it.pad.y, it.pad.type === 'castle' ? 1 : 0.92);
        ctx.globalAlpha = 1;
      } else if (it.kind === 'mon') {
        Ent.drawMonster(G, ctx, it.m);
      } else if (it.kind === 'vil') {
        Ent.drawVillager(G, ctx, it.v);
      } else if (it.kind === 'wall') {
        const hp = st.wall.hp[it.p.seg];
        const pct = hp / G.wallMax;
        let spr;
        if (hp <= 0) spr = KS.Art.wallRubble(it.p.v);
        else spr = KS.Art.wallPost(it.wTier, it.p.v, pct < 0.5);
        const fl = G.wallFlash[it.p.seg];
        KS.Art.draw(ctx, spr, it.p.x, it.p.y, 1, 1, it.p.v === 1);
        if (fl > 0 && hp > 0) {
          ctx.globalAlpha = fl * 0.5;
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.ellipse(it.p.x, it.p.y - 18, 16, 24, 0, 0, TAU);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      } else if (it.kind === 'gate') {
        KS.Art.draw(ctx, KS.Art.gatePost(it.wTier), it.p.x, it.p.y);
      } else {
        Ent.drawPlayer(G, ctx);
      }
    }
    // HP-Balken beschädigter Mauerabschnitte
    if (G.wallMax > 0 && st.wall) {
      for (let seg = 0; seg < CFG.WALL.segs; seg++) {
        const hp = st.wall.hp[seg];
        if (hp >= G.wallMax || hp <= 0) continue;
        const c = Sys.wallSegCenter(seg);
        if (!inView(c.x, c.y, 60)) continue;
        const w = 44, h = 5;
        ctx.fillStyle = 'rgba(20,14,10,0.75)';
        ctx.fillRect(c.x - w / 2 - 1, c.y - 52, w + 2, h + 2);
        const pct = hp / G.wallMax;
        ctx.fillStyle = pct > 0.5 ? '#58d162' : pct > 0.25 ? '#ffd34e' : '#e5484d';
        ctx.fillRect(c.x - w / 2, c.y - 51, w * pct, h);
      }
    }

    // Projektile & Blitze
    Ent.drawProjectiles(G, ctx);
    Ent.drawZaps(G, ctx);

    // Effekte oben
    Ent.drawParticles(G, ctx, 'above');
    Ent.drawRings(G, ctx);

    // Einzahlungs-Münzen (fliegen)
    drawDepositFx();

    // Pad-Overlays (Fortschritt, Kosten, Pfeile)
    drawPadOverlays();

    // Spieler-HP-Balken
    drawPlayerHp();

    // Schwebende Texte
    Ent.drawTexts(G, ctx);

    // Nacht & Licht
    if (G.dark > 0.02) {
      ctx.fillStyle = `rgba(16,20,58,${G.dark})`;
      ctx.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0);
      ctx.globalCompositeOperation = 'lighter';
      drawLights(vx0, vy0, vx1, vy1);
      ctx.globalCompositeOperation = 'source-over';
    }

    // Quest-Ziel & Alarm-Pfeile (Weltkoordinaten)
    drawGuides();

    ctx.restore();

    // Vignette & Verletzungs-Blitz (Bildschirmebene)
    if (vignette) ctx.drawImage(vignette, 0, 0, W, H);
    if (G.playerHurtT > 0) {
      ctx.fillStyle = `rgba(190,30,30,${Math.min(0.28, G.playerHurtT)})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (G.baseFlash > 0) {
      ctx.strokeStyle = `rgba(229,72,77,${Math.min(0.7, G.baseFlash) * 0.8})`;
      ctx.lineWidth = 10;
      ctx.strokeRect(4, 4, W - 8, H - 8);
    }

    // Bildschirmrand-Indikator für Quest-Ziel
    drawEdgeIndicator();
  }

  function drawBuilding(pad, b) {
    const spr = KS.Art.building(pad.type, b.tier);
    let sc = 1;
    if (G.buildBounce[pad.id] > 0) {
      G.buildBounce[pad.id] -= 0.016;
      const t = 1 - Math.max(0, G.buildBounce[pad.id]);
      sc = U.easeOutElastic(Math.min(1, t)) * 0.25 + 0.78 + Math.min(1, t) * -0.03;
      sc = 0.75 + U.easeOutElastic(Math.min(1, t)) * 0.25;
    }
    KS.Art.draw(ctx, spr, pad.x, pad.y + 20, sc);
    // Burg: wehende Fahne + Schadensrauch
    if (pad.type === 'castle') {
      const tier = b.tier;
      const topY = pad.y + 20 - (92 + tier * 9) - 26 - tier * 2 - 8;
      ctx.strokeStyle = '#5a4632'; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(pad.x, topY + 6); ctx.lineTo(pad.x, topY - 22); ctx.stroke();
      // Fahne weht
      ctx.fillStyle = '#e5484d';
      ctx.beginPath();
      ctx.moveTo(pad.x, topY - 22);
      const wv = Math.sin(G.time * 5) * 2.4;
      ctx.quadraticCurveTo(pad.x + 10, topY - 20 + wv, pad.x + 20, topY - 17 + wv * 1.4);
      ctx.quadraticCurveTo(pad.x + 10, topY - 13 + wv, pad.x, topY - 10);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(38,26,20,0.7)'; ctx.lineWidth = 1.6; ctx.stroke();
      ctx.fillStyle = '#ffd34e';
      ctx.beginPath(); ctx.arc(pad.x, topY - 24, 2.4, 0, TAU); ctx.fill();
      if (G.baseFlash > 0) {
        ctx.globalAlpha = Math.min(0.3, G.baseFlash * 0.3);
        ctx.fillStyle = '#ff5a5a';
        ctx.beginPath(); ctx.ellipse(pad.x, pad.y - 60, 110, 90, 0, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    // Turm-Mündungsblitz
    if (pad.type.startsWith('tower_')) {
      const t = G.towers.find(tw => tw.pad.id === pad.id);
      if (t && t.flash > 0) {
        ctx.globalAlpha = t.flash * 6;
        ctx.fillStyle = '#fff3c0';
        ctx.beginPath(); ctx.arc(pad.x, pad.y + 20 - t.topY, 7, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  }

  function drawDepositFx() {
    const spr = KS.Art.coin(0);
    for (const f of G.depositFx) {
      const k = Math.min(1, f.t / f.dur);
      const mx = (f.x0 + f.x1) / 2, my = Math.min(f.y0, f.y1) - 46;
      const x = U.lerp(U.lerp(f.x0, mx, k), U.lerp(mx, f.x1, k), k);
      const y = U.lerp(U.lerp(f.y0, my, k), U.lerp(my, f.y1, k), k);
      const sc = 0.9 + Math.sin(k * Math.PI) * 0.25;
      KS.Art.draw(ctx, spr, x, y, sc, 1, false, f.spin + k * 9);
    }
  }

  function isActivePadNear(pad) {
    const pl = G.state.player;
    return U.dist2(pl.x, pl.y, pad.x, pad.y) < 190 * 190;
  }

  function drawPadOverlays() {
    const st = G.state;
    const pl = st.player;
    const hw = W / (2 * ZOOM) + 120, hh = H / (2 * ZOOM) + 120;
    ctx.textAlign = 'center';
    for (const pad of G.padList) {
      if (Math.abs(pad.x - G.cam.x) > hw || Math.abs(pad.y - G.cam.y) > hh) continue;
      if (!Sys.isUnlocked(G, pad.id)) {
        // Gesperrt: Hinweis nur ganz nah am Spieler
        if (U.dist2(pl.x, pl.y, pad.x, pad.y) < 115 * 115) {
          ctx.globalAlpha = 0.8;
          ctx.font = '800 12px Nunito, sans-serif';
          ctx.fillStyle = 'rgba(255,255,255,0.9)';
          ctx.strokeStyle = 'rgba(30,20,15,0.8)'; ctx.lineWidth = 3;
          ctx.strokeText('Durch Quests freischalten', pad.x, pad.y + 48);
          ctx.fillText('Durch Quests freischalten', pad.x, pad.y + 48);
          ctx.globalAlpha = 1;
        }
        continue;
      }
      const b = st.buildings[pad.id] || { tier: 0, prog: 0 };
      const def = CFG.BUILDINGS[pad.type];
      const maxed = b.tier >= def.tiers;
      const near = U.dist2(pl.x, pl.y, pad.x, pad.y) < 190 * 190;
      // Stufen-Abzeichen
      if (b.tier >= 1 && pad.type !== 'castle') {
        drawTierBadge(pad.x + 36, pad.y + 14, b.tier, maxed);
      } else if (pad.type === 'castle' && b.tier >= 1) {
        drawTierBadge(pad.x + 78, pad.y + 26, b.tier, maxed);
      }
      if (maxed) continue;
      const cost = CFG.costOf(pad.type, b.tier + 1);
      const show = near || b.prog > 0 || b.tier === 0;
      if (!show) continue;
      // Fortschrittsring
      const disp = G.padDisplay[pad.id] = U.lerp(G.padDisplay[pad.id] || 0, b.prog / cost, 0.12);
      const R = 47;
      ctx.lineWidth = 7;
      ctx.strokeStyle = 'rgba(20,14,10,0.4)';
      ctx.beginPath(); ctx.ellipse(pad.x, pad.y + 16, R, R * 0.48, 0, 0, TAU); ctx.stroke();
      if (disp > 0.003) {
        ctx.strokeStyle = '#ffd34e';
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.ellipse(pad.x, pad.y + 16, R, R * 0.48, 0, -Math.PI / 2, -Math.PI / 2 + disp * TAU); ctx.stroke();
        ctx.lineCap = 'butt';
      }
      // Kosten-Text
      const isActive = G.activePad === pad;
      const yTx = pad.y + 46;
      ctx.font = '900 15px Nunito, sans-serif';
      const label = b.prog > 0 ? `${U.fmt(b.prog)} / ${U.fmt(cost)}` : `${U.fmt(cost)}`;
      // Münz-Icon
      const tw = ctx.measureText(label).width;
      ctx.strokeStyle = 'rgba(30,20,15,0.85)'; ctx.lineWidth = 3.4;
      ctx.strokeText(label, pad.x + 8, yTx);
      ctx.fillStyle = isActive ? '#ffe9a8' : '#fff';
      ctx.fillText(label, pad.x + 8, yTx);
      const cg = ctx.createRadialGradient(pad.x - tw / 2 - 1, yTx - 6.5, 1, pad.x - tw / 2 + 1, yTx - 4.5, 7);
      cg.addColorStop(0, '#fff3c0'); cg.addColorStop(0.6, '#ffd34e'); cg.addColorStop(1, '#d9930d');
      ctx.fillStyle = cg;
      ctx.beginPath(); ctx.arc(pad.x - tw / 2 - 1, yTx - 5, 6.4, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#a86e08'; ctx.lineWidth = 1.6; ctx.stroke();
      // Hinweis bei Geldmangel / Aktion
      if (isActive && st.gold <= 0 && b.prog < cost) {
        const miss = cost - b.prog;
        ctx.font = '900 13.5px Nunito, sans-serif';
        ctx.globalAlpha = 0.75 + Math.sin(G.time * 6) * 0.25;
        ctx.strokeStyle = 'rgba(30,20,15,0.85)'; ctx.lineWidth = 3;
        ctx.strokeText(`Es fehlen ${U.fmt(miss)} Münzen!`, pad.x, yTx + 19);
        ctx.fillStyle = '#ff9d9d';
        ctx.fillText(`Es fehlen ${U.fmt(miss)} Münzen!`, pad.x, yTx + 19);
        ctx.globalAlpha = 1;
      }
      // Mauerring-Vorschau am Stadtmauer-Bauplatz
      if (pad.id === 'wall' && b.tier === 0 && isActivePadNear(pad)) {
        ctx.save();
        ctx.globalAlpha = 0.4 + Math.sin(G.time * 3) * 0.12;
        ctx.strokeStyle = '#f6e8c8';
        ctx.lineWidth = 5;
        ctx.setLineDash([14, 12]);
        ctx.beginPath();
        ctx.arc(CFG.WORLD.cx, CFG.WORLD.cy, CFG.WALL.r, 0, TAU);
        ctx.stroke();
        ctx.restore();
      }
      // Bau-Pfeil über leeren Plätzen
      if (b.tier === 0) {
        const bob = Math.sin(G.time * 4) * 5;
        const ay = pad.y - 66 + bob;
        ctx.fillStyle = '#ffd34e';
        ctx.strokeStyle = 'rgba(30,20,15,0.8)'; ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(pad.x - 11, ay - 16); ctx.lineTo(pad.x + 11, ay - 16); ctx.lineTo(pad.x + 11, ay - 6);
        ctx.lineTo(pad.x + 17, ay - 6); ctx.lineTo(pad.x, ay + 8); ctx.lineTo(pad.x - 17, ay - 6);
        ctx.lineTo(pad.x - 11, ay - 6);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
      }
    }
    // Quest-Ping
    if (G.pingT > 0) {
      const q = Sys.activeQuest(G);
      const target = Sys.questTargetPad(G, q);
      if (target) {
        const k = 1 - (G.pingT % 0.7) / 0.7;
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = '#ffd34e'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.ellipse(target.x, target.y + 16, 30 + k * 70, (30 + k * 70) * 0.48, 0, 0, TAU); ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
  }

  function drawTierBadge(x, y, tier, maxed) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = maxed ? '#ffd34e' : '#f6e8c8';
    ctx.strokeStyle = maxed ? '#8a5f14' : '#5a3d24';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-9, -10); ctx.lineTo(9, -10); ctx.lineTo(9, 2); ctx.quadraticCurveTo(9, 8, 0, 11); ctx.quadraticCurveTo(-9, 8, -9, 2);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = maxed ? '#6e4a08' : '#3a2a18';
    ctx.font = '900 11px Nunito, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(tier), 0, 3.6);
    ctx.restore();
  }

  function drawPlayerHp() {
    const pl = G.state.player;
    if (G.playerDown) {
      // Wiederbelebungs-Ring
      const k = G.playerDownT / CFG.PLAYER.reviveTime;
      ctx.strokeStyle = 'rgba(20,14,10,0.5)'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(pl.x, pl.y - 14, 22, 0, TAU); ctx.stroke();
      ctx.strokeStyle = '#7ad0ec'; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(pl.x, pl.y - 14, 22, -Math.PI / 2, -Math.PI / 2 + k * TAU); ctx.stroke();
      ctx.lineCap = 'butt';
      return;
    }
    if (pl.hp >= G.playerHpMax - 0.5) return;
    const w = 40, h = 5.4, y = pl.y - 58;
    ctx.fillStyle = 'rgba(20,14,10,0.75)';
    ctx.fillRect(pl.x - w / 2 - 1, y - 1, w + 2, h + 2);
    const pct = Math.max(0, pl.hp / G.playerHpMax);
    ctx.fillStyle = pct > 0.5 ? '#58d162' : pct > 0.25 ? '#ffd34e' : '#e5484d';
    ctx.fillRect(pl.x - w / 2, y, w * pct, h);
  }

  function drawLights(vx0, vy0, vx1, vy1) {
    const st = G.state;
    const d = G.dark;
    const flick = () => 0.85 + Math.sin(G.time * 11 + Math.sin(G.time * 5.3) * 3) * 0.12;
    // Fackeln
    for (const p of G.props) {
      if (!p.light) continue;
      if (p.x < vx0 || p.x > vx1 || p.y < vy0 || p.y > vy1) continue;
      drawGlow(p.x, p.y - 52, 90, 'rgba(255,166,66,0.85)', d * 0.7 * flick());
      // Flämmchen
      ctx.fillStyle = `rgba(255,210,90,${0.9 * flick()})`;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - 55 - Math.sin(G.time * 9) * 1.5, 3.4, 6, Math.sin(G.time * 7) * 0.2, 0, TAU);
      ctx.fill();
    }
    // Gebäude
    for (const pad of G.padList) {
      const b = st.buildings[pad.id];
      if (!b || b.tier < 1) continue;
      if (pad.x < vx0 - 100 || pad.x > vx1 + 100 || pad.y < vy0 - 100 || pad.y > vy1 + 100) continue;
      if (pad.type === 'castle') drawGlow(pad.x, pad.y - 60, 210, 'rgba(255,190,100,0.7)', d * 0.55);
      else if (pad.type === 'tavern') drawGlow(pad.x, pad.y - 30, 130, 'rgba(255,180,80,0.8)', d * 0.6 * flick());
      else if (pad.type === 'forge') drawGlow(pad.x, pad.y - 16, 120, 'rgba(255,130,50,0.9)', d * 0.65 * flick());
      else if (pad.type === 'shrine') drawGlow(pad.x, pad.y - 55, 170, 'rgba(255,244,200,0.8)', d * 0.6);
      else if (pad.type === 'mine' && b.tier >= 4) drawGlow(pad.x - 26, pad.y - 26, 70, 'rgba(255,210,110,0.8)', d * 0.5 * flick());
      else if (pad.type === 'tower_flame') drawGlow(pad.x, pad.y - 80 - b.tier * 5, 110, 'rgba(255,150,60,0.9)', d * 0.7 * flick());
      else if (pad.type === 'tower_lightning') drawGlow(pad.x, pad.y - 90 - b.tier * 5, 85, 'rgba(190,150,255,0.8)', d * 0.55);
      else if (pad.type === 'tower_frost') drawGlow(pad.x, pad.y - 85 - b.tier * 5, 75, 'rgba(150,220,255,0.7)', d * 0.45);
      else drawGlow(pad.x, pad.y - 50, 60, 'rgba(255,200,120,0.6)', d * 0.35);
    }
    // Spieler-Laterne
    const pl = st.player;
    drawGlow(pl.x, pl.y - 16, 170, 'rgba(255,214,140,0.75)', d * 0.55);
    // Boss-Glut
    if (G.boss && !G.boss.dead) drawGlow(G.boss.x, G.boss.y - G.boss.r, G.boss.r * 4, 'rgba(255,90,80,0.5)', d * 0.5);
    // Münzen glitzern leicht (begrenzt für Performance)
    let coinGlows = 0;
    for (const c of G.coins) {
      if (c.x < vx0 || c.x > vx1 || c.y < vy0 || c.y > vy1) continue;
      drawGlow(c.x, c.y - c.z, 18, 'rgba(255,220,120,0.5)', d * 0.4);
      if (++coinGlows >= 50) break;
    }
  }

  function drawGuides() {
    const st = G.state, pl = st.player;
    // Nachts: Pfeil zur Burg, wenn weit entfernt
    if (st.phase === 'night') {
      const d = U.dist(pl.x, pl.y, CFG.WORLD.cx, CFG.WORLD.cy);
      if (d > 640) {
        const a = U.angleTo(pl.x, pl.y, CFG.WORLD.cx, CFG.WORLD.cy);
        drawArrow(pl.x + Math.cos(a) * 90, pl.y - 20 + Math.sin(a) * 90, a, '#ff8484');
      }
    }
  }

  function drawArrow(x, y, angle, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.globalAlpha = 0.75 + Math.sin(G.time * 6) * 0.25;
    ctx.fillStyle = color;
    ctx.strokeStyle = 'rgba(30,20,15,0.8)';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(14, 0); ctx.lineTo(-6, -9); ctx.lineTo(-2, 0); ctx.lineTo(-6, 9);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawEdgeIndicator() {
    const q = Sys.activeQuest(G);
    const target = Sys.questTargetPad(G, q);
    if (!target) return;
    // Weltposition → Bildschirm
    const sx = (target.x - G.cam.x) * ZOOM + W / 2;
    const sy = (target.y - G.cam.y) * ZOOM + H / 2;
    const margin = 46;
    if (sx > margin && sx < W - margin && sy > margin + 40 && sy < H - margin) {
      // Ziel sichtbar: schwebender Pfeil darüber (nur solange nicht gebaut/erreicht)
      const b = G.state.buildings[target.id];
      const needTier = q.tier || 1;
      if (!b || b.tier < needTier) {
        const bob = Math.sin(G.time * 4) * 6;
        ctx.save();
        ctx.translate(sx, sy - 120 * ZOOM + bob - 20);
        ctx.rotate(Math.PI / 2);
        ctx.fillStyle = '#ffd34e';
        ctx.strokeStyle = 'rgba(30,20,15,0.85)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(16, 0); ctx.lineTo(-8, -11); ctx.lineTo(-3, 0); ctx.lineTo(-8, 11);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.restore();
      }
      return;
    }
    // Außerhalb: Rand-Indikator
    const cxs = W / 2, cys = H / 2;
    const dx = sx - cxs, dy = sy - cys;
    const t = Math.min(
      Math.abs((W / 2 - margin) / (dx || 0.001)),
      Math.abs((H / 2 - margin - 20) / (dy || 0.001))
    );
    const ex = cxs + dx * t, ey = cys + dy * t;
    const a = Math.atan2(dy, dx);
    ctx.save();
    ctx.translate(ex, ey);
    ctx.rotate(a);
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#ffd34e';
    ctx.strokeStyle = 'rgba(30,20,15,0.85)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(18, 0); ctx.lineTo(-8, -12); ctx.lineTo(-3, 0); ctx.lineTo(-8, 12);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.rotate(-a);
    // kleiner Quest-Marker (Raute mit Ausrufezeichen)
    ctx.translate(0, -22);
    ctx.fillStyle = '#ffd34e';
    ctx.beginPath();
    ctx.moveTo(0, -9); ctx.lineTo(7.5, 0); ctx.lineTo(0, 9); ctx.lineTo(-7.5, 0);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#4a2f08';
    ctx.fillRect(-1.4, -4.4, 2.8, 5.4);
    ctx.beginPath(); ctx.arc(0, 3.6, 1.5, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function pingQuestTarget() {
    G.pingT = 2.1;
  }

  // ================== LOOP ==================
  function frame(now) {
    rafId = requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.05) dt = 0.05;
    if (dt <= 0) return;
    if (KS.debug && KS.debug.timeScale) {
      const steps = Math.min(60, Math.ceil(KS.debug.timeScale));
      if (!G.paused) for (let i = 0; i < steps; i++) update(dt * KS.debug.timeScale / steps);
    } else if (!G.paused) {
      update(dt);
    }
    KS.UI.update(G, dt);
    render();
  }

  // ================== GRÖSSE ==================
  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    DPR = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    // Näher dran — vor allem am Handy soll der König groß und klar sein
    ZOOM = U.clamp(Math.min(W, H) / 430, 0.9, 1.5);
    // Vignette neu erstellen
    vignette = document.createElement('canvas');
    vignette.width = Math.max(2, Math.round(W / 3)); vignette.height = Math.max(2, Math.round(H / 3));
    const vg = vignette.getContext('2d');
    const grad = vg.createRadialGradient(
      vignette.width / 2, vignette.height / 2, Math.min(vignette.width, vignette.height) * 0.36,
      vignette.width / 2, vignette.height / 2, Math.max(vignette.width, vignette.height) * 0.72
    );
    grad.addColorStop(0, 'rgba(10,8,20,0)');
    grad.addColorStop(1, 'rgba(10,8,20,0.4)');
    vg.fillStyle = grad;
    vg.fillRect(0, 0, vignette.width, vignette.height);
  }

  // ================== NEUES SPIEL ==================
  function scatterStarterCoins() {
    const { cx, cy } = CFG.WORLD;
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * TAU, r = 90 + Math.random() * 200;
      Ent.spawnCoin(G, cx + Math.cos(a) * r, cy + Math.sin(a) * r, Math.random() < 0.25 ? 5 : 1, { speed: 0, z: 0 });
    }
    for (const c of G.coins) { c.state = 'idle'; c.z = 0; }
  }

  // ================== BOOT ==================
  function boot() {
    canvas = document.getElementById('game');
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', () => setTimeout(resize, 120));
    KS.Input.init(canvas);
    KS.UI.init();

    // Spielstand laden oder neu beginnen
    const saved = KS.SaveIO.read();
    let hasSave = false;
    if (saved && saved.version === CFG.SAVE_VERSION) {
      try {
        restoreFromSave(saved);
        hasSave = true;
      } catch (e) {
        console.error('Spielstand konnte nicht geladen werden:', e);
        initRuntime(newState());
        scatterStarterCoins();
      }
    } else {
      initRuntime(newState());
      scatterStarterCoins();
    }
    booted = true;

    KS.UI.applySettings(G.state);
    KS.UI.showTitle(hasSave, G.state);

    document.getElementById('btn-continue').addEventListener('click', () => {
      KS.Audio.unlock();
      KS.Audio.SFX.click();
      KS.UI.hideTitle();
      setPaused(false);
      if (!KS.SaveIO.available) {
        KS.UI.toast('Speicher nicht verfügbar (privater Modus?) — Fortschritt geht beim Schließen verloren!', 6000, 'lock');
      }
    });
    document.getElementById('btn-new').addEventListener('click', () => {
      KS.Audio.unlock();
      if (confirm('Neues Abenteuer beginnen? Dein bisheriger Fortschritt wird überschrieben!')) {
        hardReset();
      }
    });

    // Lückenloses Speichern bei jedem Verlassen
    window.addEventListener('pagehide', save);
    window.addEventListener('beforeunload', save);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        save();
        KS.Audio.suspend();
      } else {
        KS.Audio.resume();
        last = performance.now();
      }
    });

    // Debug-Werkzeuge (?debug=1)
    if (/[?&]debug=1/.test(location.search)) {
      KS.debug = {
        timeScale: 0,
        G,
        gold: n => { G.state.gold += n; },
        day: n => { G.state.day = n; Sys.rebuildDerived(G); },
        build: (padId, tier) => {
          const pad = CFG.PADS.find(p => p.id === padId);
          if (!pad) return 'unbekanntes Pad';
          Sys.unlockPad(G, padId, true);
          G.state.buildings[padId] = { tier, prog: 0 };
          Sys.rebuildDerived(G);
        },
        buildAll: tier => {
          for (const pad of CFG.PADS) {
            Sys.unlockPad(G, pad.id, true);
            G.state.buildings[pad.id] = { tier, prog: 0 };
          }
          Sys.rebuildDerived(G);
        },
        spawn: (key, n = 1, elite = false) => {
          for (let i = 0; i < n; i++) {
            const a = Math.random() * TAU;
            Ent.makeMonster(G, key, G.state.player.x + Math.cos(a) * 260, G.state.player.y + Math.sin(a) * 260, { elite });
          }
        },
        wall: tier => {
          Sys.unlockPad(G, 'wall', true);
          G.state.buildings.wall = { tier, prog: 0 };
          Sys.rebuildDerived(G);
          if (G.state.wall) for (let i = 0; i < G.state.wall.hp.length; i++) G.state.wall.hp[i] = G.wallMax;
        },
        breach: (seg = 0) => Sys.damageWall(G, seg, 1e9),
        market: lvl => {
          for (const t of CFG.MARKET) G.state.market[t.id] = Math.min(t.max, lvl);
          Sys.rebuildDerived(G);
        },
        night: () => Sys.startNight(G),
        dawn: () => Sys.startDay(G, false),
        boss: () => { G.state.day = Math.max(5, Math.ceil(G.state.day / 5) * 5); Sys.spawnBoss(G, 'x'); },
        killAll: () => { for (const m of G.monsters) Ent.damageMonster(G, m, m.hp + 1); },
        tp: (x, y) => { G.state.player.x = x; G.state.player.y = y; },
        pad: id => { const p = CFG.PADS.find(p2 => p2.id === id); if (p) { G.state.player.x = p.x; G.state.player.y = p.y; } },
        survivors: n => { G.state.survivors = n; },
        quest: () => Sys.activeQuest(G),
        save, state: () => G.state,
      };
    }

    last = performance.now();
    rafId = requestAnimationFrame(frame);
  }

  return {
    G, boot, save, requestSave, serialize, hardReset, loadImported,
    setPaused, onDefeat, reviveAfterDefeat, log, pingQuestTarget,
  };
})();

// Start
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => KS.Game.boot());
} else {
  KS.Game.boot();
}
