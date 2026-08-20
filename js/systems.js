/* ============================================================
   KINGSHOT — systems.js
   Bauplatten & Einzahlung, Gebäude-Logik (Türme, Produktion,
   Schrein), Tag/Nacht-Direktor mit Spawn-Plänen & Bossen,
   Quest-/Kapitel-Engine (roter Faden), Überlebende.
   ============================================================ */
'use strict';

KS.Systems = (() => {
  const U = KS.U, CFG = KS.CFG, Ent = KS.Ent;
  const TAU = Math.PI * 2;
  const PAD_R = 54;            // Radius zum Einzahlen

  // ---------- Abgeleitete Daten neu aufbauen ----------
  // ---- Techtree-Abfragen ----
  function hasTech(G, id) { return !!(G.state.tech && G.state.tech[id]); }

  function rebuildDerived(G) {
    const st = G.state;
    // Bauplätze = feste Plätze + frei platzierte
    if (!st.placed) st.placed = [];
    G.padList = CFG.PADS.concat(st.placed);
    if (!st.res) st.res = { wood: 0, stone: 0, grain: 0 };
    if (!st.tech) st.tech = {};
    const T = id => hasTech(G, id);
    // Waffe = Schmiede-Stufe
    const forge = st.buildings.forge;
    G.weaponTier = Math.max(1, forge ? forge.tier : 0) || 1;
    // Burg-HP-Maximum
    const castle = st.buildings.castle;
    G.baseHpMax = CFG.BUILDINGS.castle.hp(Math.max(1, castle ? castle.tier : 1));
    st.baseHp = Math.min(st.baseHp, G.baseHpMax);
    // Markt-Verbesserungen des Königs
    if (!st.market) st.market = {};
    const mk = id => st.market[id] || 0;
    G.playerHpMax = Math.round((CFG.PLAYER.hpMax + (castle ? (castle.tier - 1) * 10 : 0)) * (1 + 0.12 * mk('hp')));
    st.player.hp = Math.min(st.player.hp, G.playerHpMax);
    G.playerSpeed = CFG.PLAYER.speed * (1 + 0.03 * mk('speed'));
    G.magnetMul = (1 + 0.10 * mk('magnet')) * (T('magnet_tech') ? 1.4 : 1);
    G.critCh = 0.12 + 0.02 * mk('crit');
    G.armorMul = Math.max(0.55, 1 - 0.02 * mk('armor'));

    // ---- Techtree-Faktoren ----
    G.goldMul = (1 + 0.04 * mk('gold')) * (T('golden_age') ? 1.3 : 1);
    G.tech = {
      towerDmg: (T('fletching') ? 1.15 : 1) * (T('grand_arsenal') ? 1.5 : 1),
      towerRate: T('drill') ? 1.12 : 1,
      towerRange: T('spyglass') ? 1.12 : 1,
      heavyDmg: T('ballistics') ? 1.4 : 1,          // Kanone & Blitz
      kingDmg: T('kings_edge') ? 1.25 : 1,
      wallHp: T('masonry') ? 1.5 : 1,
      wallRegen: T('night_watch'),
      workerLoad: T('carts') ? 1.3 : 1,
      workerSpeed: T('boots_eco') ? 1.25 : 1,
      harvestSpeed: T('sharp_axes') ? 1.25 : 1,
      extraWorker: T('crew') ? 1 : 0,
      storeCap: T('big_barn') ? 1.6 : 1,
      craftGold: (T('guilds') ? 1.3 : 1) * (T('trade_route') ? 1.25 : 1),
      craftSpeed: (T('saw_basics') ? 1.15 : 1) * (T('mechanised') ? 2 : 1),
      prodGold: T('trade_route') ? 1.25 : 1,        // Minen & Tavernen
      taxes: T('granary') ? 1.5 : 1,
      arrivals: T('heralds') ? 2 : 1,
      buildCost: T('ledger') ? 0.9 : 1,
      depositSpeed: T('architects') ? 2 : 1,
      gapShrink: T('surveying') ? 0.82 : 1,
      breadBonus: 0,
    };

    // ---- Lager & Wirtschaft ----
    G.storeCap = 0;
    G.gatherers = [];
    G.crafters = [];
    for (const pad of G.padList) {
      const b = st.buildings[pad.id];
      if (!b || b.tier < 1) continue;
      const def = CFG.BUILDINGS[pad.type];
      if (!def) continue;
      if (def.kind === 'store') G.storeCap += Math.round(def.cap(b.tier) * G.tech.storeCap);
      else if (def.kind === 'gather') {
        G.gatherers.push({
          pad, def, tier: b.tier,
          workers: Math.min(6, def.workers(b.tier) + G.tech.extraWorker),
          load: Math.max(1, Math.round(def.load(b.tier) * G.tech.workerLoad)),
          harvestTime: def.chopTime(b.tier) / G.tech.harvestSpeed,
        });
      } else if (def.kind === 'craft') {
        G.crafters.push({
          pad, def, tier: b.tier,
          batch: def.batch(b.tier),
          gold: Math.round(def.gold(b.tier) * G.tech.craftGold),
          interval: def.interval(b.tier) / G.tech.craftSpeed,
        });
        if (def.bread) G.tech.breadBonus += def.bread(b.tier);
      }
    }
    // Lagerbestand auf Kapazität begrenzen
    if (!st.resTotal) st.resTotal = { wood: 0, stone: 0, grain: 0 };
    for (const r of CFG.RES_ORDER) st.res[r] = Math.min(st.res[r] || 0, G.storeCap);

    // Stadtmauer
    const wallB = st.buildings.wall;
    G.wallMax = wallB && wallB.tier >= 1 ? Math.round(CFG.BUILDINGS.wall.segHp(wallB.tier) * G.tech.wallHp) : 0;
    if (G.wallMax > 0) {
      if (!st.wall || !Array.isArray(st.wall.hp) || st.wall.hp.length !== CFG.WALL.segs) {
        st.wall = { hp: Array.from({ length: CFG.WALL.segs }, () => G.wallMax), tier: wallB.tier };
      } else if (st.wall.tier === undefined) {
        st.wall.tier = wallB.tier;      // alter Spielstand: Stufe nachtragen, nicht heilen
        for (let i = 0; i < st.wall.hp.length; i++) st.wall.hp[i] = Math.min(st.wall.hp[i], G.wallMax);
      } else if (st.wall.tier !== wallB.tier) {
        // Ausgebaut: frisch gemauert ist frisch gemauert — voll auf die neue Stufe
        st.wall.tier = wallB.tier;
        for (let i = 0; i < st.wall.hp.length; i++) st.wall.hp[i] = G.wallMax;
      } else {
        for (let i = 0; i < st.wall.hp.length; i++) st.wall.hp[i] = Math.min(st.wall.hp[i], G.wallMax);
      }
    }
    // Stadttore (verschließen die acht Durchgänge)
    const gateB = st.buildings.gates;
    G.gateMax = gateB && gateB.tier >= 1 ? Math.round(CFG.BUILDINGS.gates.gateHp(gateB.tier) * G.tech.wallHp) : 0;
    if (G.gateMax > 0) {
      if (!st.gates || !Array.isArray(st.gates.hp) || st.gates.hp.length !== CFG.GATES.length) {
        st.gates = { hp: Array.from({ length: CFG.GATES.length }, () => G.gateMax), tier: gateB.tier };
      } else if (st.gates.tier === undefined) {
        st.gates.tier = gateB.tier;     // alter Spielstand: Stufe nachtragen, nicht heilen
        for (let i = 0; i < st.gates.hp.length; i++) st.gates.hp[i] = Math.min(st.gates.hp[i], G.gateMax);
      } else if (st.gates.tier !== gateB.tier) {
        // Neue Tore eingesetzt → sofort unbeschädigt, auch die vorher zerstörten
        st.gates.tier = gateB.tier;
        for (let i = 0; i < st.gates.hp.length; i++) st.gates.hp[i] = G.gateMax;
      } else {
        for (let i = 0; i < st.gates.hp.length; i++) st.gates.hp[i] = Math.min(st.gates.hp[i], G.gateMax);
      }
    }
    // Türme
    G.towers = [];
    for (const pad of G.padList) {
      const b = st.buildings[pad.id];
      if (!b || b.tier < 1) continue;
      const def = CFG.BUILDINGS[pad.type];
      if (def.kind === 'tower') {
        // Techtree wirkt auf Schaden, Feuerrate und Reichweite
        const s = CFG.towerStats(pad.type, b.tier);
        const heavy = pad.type === 'tower_cannon' || pad.type === 'tower_lightning';
        s.dmg *= G.tech.towerDmg * (heavy ? G.tech.heavyDmg : 1);
        s.rate *= G.tech.towerRate;
        s.range *= G.tech.towerRange;
        if (s.burn) s.burn *= G.tech.towerDmg;
        G.towers.push({
          pad, type: pad.type, tier: b.tier, stats: s,
          cd: Math.random() * 0.5, flash: 0, topY: 70 + b.tier * 6,
        });
      }
    }
  }

  function isUnlocked(G, padId) { return G.state.unlockedPads.includes(padId); }

  function unlockPad(G, padId, silent) {
    if (isUnlocked(G, padId)) return;
    G.state.unlockedPads.push(padId);
    const pad = G.padList.find(p => p.id === padId);
    if (pad && !silent) {
      Ent.ring(G, pad.x, pad.y, { r0: 10, r1: 90, life: 0.8, color: 'rgba(255,220,120,0.9)', lw: 5 });
      Ent.burst(G, pad.x, pad.y - 10, 14, { colors: ['#ffe084', '#fff'], speed: 90, up: 110 });
      KS.UI.toast(`Neuer Bauplatz: ${pad.label}!`, 3400, 'hammer');
    }
  }

  // ============ STADTMAUER ============
  // Segment-Index für einen Winkel (−1 = Toröffnung)
  function wallSegAt(ang) {
    const TAU2 = Math.PI * 2;
    const span = Math.PI / 4;
    let rel = (ang - CFG.GATES[0]) % TAU2;
    if (rel < 0) rel += TAU2;
    const k = Math.floor(rel / span) % 8;
    const within = rel - Math.floor(rel / span) * span;
    const g = CFG.WALL.gateHalf;
    if (within < g || within > span - g) return -1;   // Tor
    return k * 2 + (within < span / 2 ? 0 : 1);
  }

  // Mittelpunkt-Winkel & Position eines Segments
  function wallSegArc(seg) {
    const span = Math.PI / 4, g = CFG.WALL.gateHalf;
    const k = Math.floor(seg / 2), half = seg % 2;
    const start = CFG.GATES[0] + k * span + g + (half ? (span - 2 * g) / 2 : 0);
    const len = (span - 2 * g) / 2;
    return { start, end: start + len, mid: start + len / 2 };
  }
  function wallSegCenter(seg) {
    const { mid } = wallSegArc(seg);
    return {
      x: CFG.WORLD.cx + Math.cos(mid) * CFG.WALL.r,
      y: CFG.WORLD.cy + Math.sin(mid) * CFG.WALL.r,
    };
  }

  // ---- Tore ----
  // Index 0..7, wenn der Winkel in einer Toröffnung liegt, sonst −1
  function gateAt(ang) {
    const TAU2 = Math.PI * 2;
    const span = Math.PI / 4;
    let rel = (ang - CFG.GATES[0]) % TAU2;
    if (rel < 0) rel += TAU2;
    const k = Math.floor(rel / span) % 8;
    const within = rel - Math.floor(rel / span) * span;
    const g = CFG.WALL.gateHalf;
    if (within < g) return k;                       // Öffnung am Anfang des Bogens
    if (within > span - g) return (k + 1) % 8;      // Öffnung am Ende → nächstes Tor
    return -1;
  }

  function gateCenter(i) {
    const a = CFG.GATES[i];
    return {
      x: CFG.WORLD.cx + Math.cos(a) * CFG.WALL.r,
      y: CFG.WORLD.cy + Math.sin(a) * CFG.WALL.r,
    };
  }

  // Steht dort ein intaktes Tor?
  function gateBlocks(G, i) {
    return G.gateMax > 0 && G.state.gates && i >= 0 && G.state.gates.hp[i] > 0;
  }

  function damageGate(G, i, dmg) {
    const st = G.state;
    if (!gateBlocks(G, i)) return;
    st.gates.hp[i] = Math.max(0, st.gates.hp[i] - dmg);
    G.gateFlash[i] = 1;
    if (G.baseHitSfxT <= 0) { KS.Audio.SFX.baseHit(); G.baseHitSfxT = 0.3; }
    const c = gateCenter(i);
    if (Math.random() < 0.5) {
      Ent.particle(G, c.x + U.rand(-16, 16), c.y - U.rand(10, 34), {
        vz: U.rand(40, 90), grav: 240, life: 0.5, size: 3,
        color: U.pick(['#8a6234', '#5c3f1e', '#c9a13a']),
      });
    }
    if (st.gates.hp[i] <= 0) {
      Ent.burst(G, c.x, c.y - 16, 20, { colors: ['#8a6234', '#5c3f1e', '#c9a13a'], speed: 130, up: 150, size: 4.6, life: 0.8 });
      Ent.ring(G, c.x, c.y, { r0: 8, r1: 70, life: 0.5, color: 'rgba(200,160,80,0.8)' });
      G.shake = Math.max(G.shake, 6);
      if (G.wallBreachT <= 0) {
        KS.UI.toast('Ein Stadttor ist zerborsten!', 3400, 'gate');
        G.wallBreachT = 6;
      }
    }
  }

  function repairGatesAtDawn(G) {
    const st = G.state;
    if (!st.gates || G.gateMax <= 0) return 0;
    let broken = 0;
    for (let i = 0; i < st.gates.hp.length; i++) {
      if (st.gates.hp[i] < G.gateMax) {
        if (st.gates.hp[i] <= 0) broken++;
        st.gates.hp[i] = G.gateMax;
      }
    }
    return broken;
  }

  function damageWall(G, seg, dmg, from) {
    const st = G.state;
    if (!st.wall || G.wallMax <= 0 || st.wall.hp[seg] <= 0) return;
    st.wall.hp[seg] = Math.max(0, st.wall.hp[seg] - dmg);
    G.wallFlash[seg] = 1;
    if (G.baseHitSfxT <= 0) { KS.Audio.SFX.baseHit(); G.baseHitSfxT = 0.3; }
    const c = wallSegCenter(seg);
    if (Math.random() < 0.5) {
      Ent.particle(G, c.x + U.rand(-14, 14), c.y - U.rand(10, 30), { vz: U.rand(40, 90), grav: 240, life: 0.5, size: 3, color: U.pick(['#c9c2b4', '#8a8478']) });
    }
    if (st.wall.hp[seg] <= 0) {
      Ent.burst(G, c.x, c.y - 14, 18, { colors: ['#c9c2b4', '#8a8478', '#6a655c'], speed: 120, up: 140, size: 4.4, life: 0.7 });
      Ent.ring(G, c.x, c.y, { r0: 8, r1: 60, life: 0.5, color: 'rgba(200,190,170,0.8)' });
      G.shake = Math.max(G.shake, 5);
      if (G.wallBreachT <= 0) {
        KS.UI.toast('Mauerdurchbruch! Ein Abschnitt ist gefallen.', 3400, 'wall');
        G.wallBreachT = 6;
      }
    }
  }

  // Mauer und Tore vollständig wiederherstellen. Rückgabe: wie viele
  // Abschnitte bzw. Tore vorher ganz durchbrochen waren.
  function restoreDefences(G) {
    const st = G.state;
    let broken = repairGatesAtDawn(G);
    if (st.wall && G.wallMax > 0) {
      for (let i = 0; i < st.wall.hp.length; i++) {
        if (st.wall.hp[i] < G.wallMax) {
          if (st.wall.hp[i] <= 0) broken++;
          st.wall.hp[i] = G.wallMax;
        }
      }
    }
    return broken;
  }

  function repairWallAtDawn(G) {
    const hasWall = G.state.wall && G.wallMax > 0;
    const broken = restoreDefences(G);
    if (broken > 0) {
      KS.UI.toast(hasWall
        ? 'Die Überlebenden haben Mauer und Tore über Nacht repariert.'
        : 'Die Überlebenden haben die Tore über Nacht wieder eingesetzt.', 3400, 'hammer');
    }
  }

  // ============ MARKT ============
  function marketLvl(G, id) { return (G.state.market && G.state.market[id]) || 0; }

  function marketCost(G, track, lvl) {
    const b = G.state.buildings.markt;
    const disc = b && b.tier >= 1 ? CFG.BUILDINGS.markt.discount(b.tier) : 1;
    return Math.round(track.base * Math.pow(track.mul, lvl) * disc);
  }

  function buyMarket(G, trackId) {
    const track = CFG.MARKET.find(t => t.id === trackId);
    if (!track) return false;
    const lvl = marketLvl(G, trackId);
    if (lvl >= track.max) return false;
    const cost = marketCost(G, track, lvl);
    if (G.state.gold < cost) {
      KS.Audio.SFX.click();
      return false;
    }
    G.state.gold -= cost;
    G.state.market[trackId] = lvl + 1;
    rebuildDerived(G);
    KS.Audio.SFX.upgrade();
    const pl = G.state.player;
    Ent.text(G, pl.x, pl.y - 56, track.name + ' ' + (lvl + 1), { color: '#baffc8', size: 15, life: 1.1, up: 50 });
    Ent.burst(G, pl.x, pl.y - 20, 10, { colors: ['#baffc8', '#fff'], speed: 70, up: 90 });
    KS.Game.requestSave();
    return true;
  }

  // ============ EINZAHLUNG ============
  // Wichtig: Gold fließt NIE allein durchs Vorbeilaufen. Der König muss in
  // Reichweite stehen UND das Bauen bestätigen (Knopf / Leertaste). Sobald er
  // weggeht oder erneut drückt, hört es sofort auf.

  // Nächster bedienbarer Bauplatz in Reichweite (oder null)
  function nearestPad(G) {
    const st = G.state, pl = st.player;
    if (G.playerDown) return null;
    let best = null, bestD = Infinity;
    for (const pad of G.padList) {
      if (!isUnlocked(G, pad.id)) continue;
      if (!st.buildings[pad.id]) st.buildings[pad.id] = { tier: 0, prog: 0 };
      const r = CFG.interactR(pad.type);
      const d = U.dist2(pl.x, pl.y, pad.x, pad.y);
      if (d < r * r && d < bestD) { bestD = d; best = pad; }
    }
    return best;
  }

  function padMaxed(G, pad) {
    const b = G.state.buildings[pad.id];
    return !!b && b.tier >= CFG.BUILDINGS[pad.type].tiers;
  }

  // Punkt zum (Wieder-)Einsteigen, der sicher außerhalb JEDER Bauplatz-Zone
  // liegt — sonst steht der König nach dem Tod sofort wieder „an der Kasse“.
  function safeSpawnPoint() {
    const { cx, cy } = CFG.WORLD;
    // Kandidaten auf dem Dorfplatz durchgehen und den ersten freien nehmen
    for (const r of [150, 175, 200, 235, 265]) {
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
        let free = true;
        for (const pad of CFG.PADS) {
          const need = CFG.interactR(pad.type) + 26;   // Sicherheitsabstand
          if (U.dist2(x, y, pad.x, pad.y) < need * need) { free = false; break; }
        }
        if (free) return { x, y };
      }
    }
    return { x: cx, y: cy + 265 };   // Notfall
  }

  // Bauen bestätigen / abbrechen (vom Knopf oder der Tastatur)
  function toggleBuild(G) {
    const pad = G.nearPad;
    if (!pad) return false;
    if (G.buildArmed === pad.id) {          // schon aktiv → anhalten
      G.buildArmed = null;
      G.depositT = 0; G.depositAcc = 0;
      return false;
    }
    // Pro Besuch nur EINE Stufe: nach einem fertigen Ausbau ist der Platz
    // gesperrt, bis der König weggegangen und wiedergekommen ist.
    if (G.buildLock === pad.id) {
      KS.UI.toast('Erst weggehen und wiederkommen — dann geht die nächste Stufe.', 2600, 'hammer');
      return false;
    }
    if (padMaxed(G, pad)) {
      KS.UI.toast(`${CFG.BUILDINGS[pad.type].name} ist schon auf Maximalstufe.`, 2200, 'check');
      return false;
    }
    if (G.state.gold <= 0) {
      const b = G.state.buildings[pad.id];
      const cost = CFG.costOf(pad.type, b.tier + 1);
      KS.UI.toast(`Kein Gold — es fehlen ${U.fmt(cost - b.prog)} Münzen.`, 2400, 'coin');
      return false;
    }
    G.buildArmed = pad.id;
    G.depositT = 0; G.depositAcc = 0;
    KS.Audio.SFX.click();
    return true;
  }

  function updateDeposit(G, dt) {
    const st = G.state, pl = st.player;
    // Wer ist in Reichweite?
    const near = nearestPad(G);
    if (G.nearPad !== near) {
      // Bauplatz gewechselt oder verlassen → Bestätigung verfällt
      if (!near || !G.buildArmed || G.buildArmed !== near.id) {
        G.buildArmed = null;
        G.depositT = 0; G.depositAcc = 0;
      }
      // Weggegangen → Sperre des zuletzt ausgebauten Platzes fällt
      if (G.buildLock && (!near || near.id !== G.buildLock)) G.buildLock = null;
      G.nearPad = near;
    }

    const active = (near && G.buildArmed === near.id && !padMaxed(G, near)) ? near : null;
    G.activePad = active;
    if (!active) { G.depositT = 0; G.depositAcc = 0; return; }

    const b = st.buildings[active.id];
    const def = CFG.BUILDINGS[active.type];
    const cost = CFG.costOf(active.type, b.tier + 1);
    if (b.prog >= cost) { G.depositT = 0; return; }
    if (st.gold <= 0) { G.depositT = 0; return; }   // wartet, bis wieder Gold da ist

    G.depositT += dt;
    const D = CFG.DEPOSIT;
    // „Baumeister“ lässt die Münzen doppelt so schnell fließen
    const rate = U.lerp(D.startRate, D.maxRate, Math.min(1, G.depositT / D.rampTime)) * G.tech.depositSpeed;
    G.depositAcc += rate * dt;
    while (G.depositAcc >= 1 && st.gold > 0 && b.prog < cost) {
      G.depositAcc -= 1;
      const chunk = Math.min(
        Math.max(1, Math.round(cost * D.chunkPct)),
        st.gold, cost - b.prog
      );
      st.gold -= chunk;
      b.prog += chunk;
      // Fliegende Münze (Bogenwurf)
      G.depositFx.push({
        x0: pl.x + U.rand(-4, 4), y0: pl.y - 22,
        x1: active.x + U.rand(-8, 8), y1: active.y - 4,
        t: 0, dur: U.rand(0.3, 0.4), spin: Math.random() * TAU,
      });
      KS.UI.bumpGold();
      if (b.prog >= cost) {
        completeBuild(G, active, b);
        break;
      }
    }
  }

  function completeBuild(G, pad, b) {
    const def = CFG.BUILDINGS[pad.type];
    b.tier += 1;
    b.prog = 0;
    // Nur eine Stufe pro Besuch: Bestätigung verfällt und der Platz wird
    // gesperrt, bis der König weggegangen und wiedergekommen ist.
    G.buildArmed = null;
    G.buildLock = pad.id;
    G.depositT = 0; G.depositAcc = 0;
    G.buildBounce[pad.id] = 1;
    const first = b.tier === 1;
    KS.Audio.SFX[first ? 'build' : 'upgrade']();
    G.shake = Math.max(G.shake, 5);
    Ent.ring(G, pad.x, pad.y, { r0: 14, r1: 100, life: 0.6, color: 'rgba(255,230,140,0.95)', lw: 6 });
    Ent.burst(G, pad.x, pad.y - 20, 22, {
      colors: ['#e8d8b0', '#c9b896', '#ffe084', '#fff'],
      speed: 140, up: 160, size: 4.4, life: 0.8, layer: 'below',
    });
    Ent.text(G, pad.x, pad.y - 70, first ? 'GEBAUT!' : `STUFE ${b.tier}!`, { color: '#ffe084', size: 22, crit: true, life: 1.2, up: 60 });
    if (first) {
      KS.UI.toast(`${pad.label} errichtet!`, 3400, def.ico);
      KS.Game.log(`${pad.label} errichtet.`);
    } else if (b.tier === def.tiers) {
      KS.UI.toast(`${pad.label} auf MAXIMUM (Stufe ${b.tier})!`, 3400, 'star');
      KS.Game.log(`${pad.label} hat die Maximalstufe erreicht!`);
    } else {
      KS.UI.toast(`${pad.label} → Stufe ${b.tier}`, 2600, def.ico);
    }
    // Effekte des Gebäudes anwenden
    if (pad.type === 'castle') {
      const before = G.baseHpMax;
      rebuildDerived(G);
      G.state.baseHp = Math.min(G.baseHpMax, G.state.baseHp + (G.baseHpMax - before));
    } else if (pad.type === 'wall') {
      rebuildDerived(G);
      // Neubau/Ausbau: alle Abschnitte auf volle Stärke
      if (G.state.wall) for (let i = 0; i < G.state.wall.hp.length; i++) G.state.wall.hp[i] = G.wallMax;
    } else {
      rebuildDerived(G);
    }
    if (pad.type === 'forge') {
      const w = CFG.weaponFor(G.weaponTier);
      KS.UI.toast(`Neue Waffe: ${w.name}!`, 3400, 'sword');
      KS.Game.log(`${w.name} geschmiedet.`);
      Ent.ring(G, G.state.player.x, G.state.player.y, { r0: 8, r1: 60, color: 'rgba(190,230,255,0.9)' });
    }
    if (pad.type === 'tavern') syncVillagers(G);
    KS.Game.requestSave();
  }

  function updateDepositFx(G, dt) {
    for (let i = G.depositFx.length - 1; i >= 0; i--) {
      const f = G.depositFx[i];
      f.t += dt;
      if (f.t >= f.dur) {
        G.depositFx.splice(i, 1);
        KS.Audio.SFX.clink();
        Ent.particle(G, f.x1, f.y1, { vz: 30, grav: 40, life: 0.25, size: 3, color: '#ffe9a8' });
        if (Math.random() < 0.3) Ent.ring(G, f.x1, f.y1 + 4, { r0: 3, r1: 16, life: 0.25, color: 'rgba(255,220,120,0.6)', lw: 2 });
      }
    }
  }

  // ============ FREIES BAUEN ============
  // Der König läuft dorthin, wo das Haus stehen soll — ein Geist zeigt an,
  // ob der Platz taugt. Bestätigen legt eine Baustelle an, die wie jeder
  // andere Bauplatz mit Münzen gefüllt wird.

  function placeableTypes(G) {
    return Object.entries(CFG.BUILDINGS)
      .filter(([, d]) => d.placeable)
      .map(([id, d]) => ({ type: id, def: d }));
  }

  // Warum geht es hier nicht? (null = Platz ist gut)
  function placeProblem(G, type, x, y) {
    const Z = CFG.BUILD_ZONE;
    const { cx, cy } = CFG.WORLD;
    const d = U.dist(x, y, cx, cy);
    if (d < Z.rMin) return 'Zu nah an der Burg';
    if (d > Z.rMax) return 'Außerhalb der Stadtmauer';
    // Abstand zu den acht Wegen (dort laufen Monster und Bewohner)
    const ang = Math.atan2(y - cy, x - cx);
    for (const g of CFG.GATES) {
      let da = Math.abs(((ang - g + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (da * d < Z.pathClear) return 'Blockiert einen Weg';
    }
    // Abstand zu bestehenden Bauplätzen
    const gap = Z.minGap * G.tech.gapShrink;
    for (const pad of G.padList) {
      const need = pad.type === 'castle' ? gap + 60 : gap;
      if (U.dist2(x, y, pad.x, pad.y) < need * need) return 'Zu nah am Nachbargebäude';
    }
    return null;
  }

  function placeCost(G, type) {
    return Math.round(CFG.costOf(type, 1) * G.tech.buildCost);
  }

  // Baustelle anlegen (kostet nichts — bezahlt wird beim Einzahlen)
  function placeBuilding(G, type, x, y) {
    const problem = placeProblem(G, type, x, y);
    if (problem) { KS.UI.toast(problem, 2200, 'x'); return null; }
    const st = G.state;
    if (!st.placed) st.placed = [];
    st.placedSeq = (st.placedSeq || 0) + 1;
    const def = CFG.BUILDINGS[type];
    const Z = CFG.BUILD_ZONE;
    const pad = {
      id: `p${st.placedSeq}`,
      type,
      label: def.name,
      x: Math.round(x / Z.gridSnap) * Z.gridSnap,
      y: Math.round(y / Z.gridSnap) * Z.gridSnap,
      placed: true,
    };
    st.placed.push(pad);
    st.buildings[pad.id] = { tier: 0, prog: 0 };
    if (!st.unlockedPads.includes(pad.id)) st.unlockedPads.push(pad.id);
    rebuildDerived(G);
    Ent.ring(G, pad.x, pad.y, { r0: 8, r1: 80, life: 0.6, color: 'rgba(255,230,140,0.9)', lw: 5 });
    Ent.burst(G, pad.x, pad.y - 10, 14, { colors: ['#e8d8b0', '#ffe084'], speed: 90, up: 110, layer: 'below' });
    KS.Audio.SFX.click();
    KS.UI.toast(`${def.name}: Baustelle gesetzt — jetzt Münzen einzahlen!`, 3200, def.ico);
    KS.Game.requestSave();
    return pad;
  }

  // Was ein Abriss zurückgibt: die Hälfte allen eingezahlten Goldes
  function refundOf(G, padId) {
    const st = G.state;
    const pad = (st.placed || []).find(p => p.id === padId);
    if (!pad) return 0;
    const b = st.buildings[padId] || { tier: 0, prog: 0 };
    let back = Math.round(b.prog * 0.5);
    for (let t = 1; t <= b.tier; t++) back += Math.round(CFG.costOf(pad.type, t) * 0.5);
    return back;
  }

  // Baustelle/Gebäude wieder abreißen (gibt die Hälfte des Einsatzes zurück)
  function demolish(G, padId) {
    const st = G.state;
    const i = (st.placed || []).findIndex(p => p.id === padId);
    if (i < 0) return false;
    const pad = st.placed[i];
    const back = refundOf(G, padId);
    st.placed.splice(i, 1);
    delete st.buildings[padId];
    const ui = st.unlockedPads.indexOf(padId);
    if (ui >= 0) st.unlockedPads.splice(ui, 1);
    G.workers = G.workers.filter(w => w.padId !== padId);
    if (G.buildArmed === padId) G.buildArmed = null;
    if (G.buildLock === padId) G.buildLock = null;
    G.nearPad = null;
    st.gold += back;
    rebuildDerived(G);
    Ent.burst(G, pad.x, pad.y - 10, 18, { colors: ['#c9b896', '#8a8478'], speed: 110, up: 120 });
    KS.UI.toast(`${pad.label} abgerissen — ${U.fmt(back)} Gold zurück.`, 2800, 'hammer');
    KS.Game.requestSave();
    return true;
  }

  // ============ TECHTREE ============
  function techNode(id) { return CFG.TECH.find(t => t.id === id); }

  function techState(G, node) {
    if (hasTech(G, node.id)) return 'done';
    for (const r of node.req) if (!hasTech(G, r)) return 'locked';
    return 'open';
  }

  function techAffordable(G, node) {
    const st = G.state;
    if (st.gold < node.gold) return false;
    if (node.res) for (const [r, n] of Object.entries(node.res)) {
      if ((st.res[r] || 0) < n) return false;
    }
    return true;
  }

  function buyTech(G, id) {
    const node = techNode(id);
    if (!node) return false;
    const state = techState(G, node);
    if (state === 'done') return false;
    if (state === 'locked') {
      KS.UI.toast('Erst die Voraussetzungen erforschen.', 2200, 'lock');
      return false;
    }
    if (!techAffordable(G, node)) {
      const st = G.state;
      const miss = [];
      if (st.gold < node.gold) miss.push(`${U.fmt(node.gold - st.gold)} Gold`);
      if (node.res) for (const [r, n] of Object.entries(node.res)) {
        const d = n - (st.res[r] || 0);
        if (d > 0) miss.push(`${d} ${CFG.RESOURCES[r].name}`);
      }
      KS.UI.toast('Es fehlt: ' + miss.join(', '), 2800, 'x');
      return false;
    }
    G.state.gold -= node.gold;
    if (node.res) for (const [r, n] of Object.entries(node.res)) storeTake(G, r, n);
    G.state.tech[id] = 1;
    rebuildDerived(G);
    KS.Audio.SFX.upgrade();
    KS.UI.toast(`Erforscht: ${node.name} — ${node.desc}`, 3600, node.ico);
    KS.Game.log(`Erforscht: ${node.name}.`);
    KS.Game.requestSave();
    return true;
  }

  // ============ WIRTSCHAFT: ARBEITER & VERARBEITUNG ============
  // Kette: Arbeiter erntet an einem Knoten → trägt zum Lager → Verarbeiter
  // wandelt den Rohstoff in Münzen. Alles endet in Gold.

  function storeTotal(G, res) { return G.state.res[res] || 0; }
  function storeFree(G, res) { return Math.max(0, G.storeCap - storeTotal(G, res)); }

  function storeAdd(G, res, n) {
    const free = storeFree(G, res);
    const put = Math.min(n, free);
    if (put > 0) {
      const st = G.state;
      st.res[res] = (st.res[res] || 0) + put;
      // Gesamtmenge fürs Chronik-/Questwesen mitzählen
      if (!st.resTotal) st.resTotal = { wood: 0, stone: 0, grain: 0 };
      st.resTotal[res] = (st.resTotal[res] || 0) + put;
    }
    return put;
  }
  function storeTake(G, res, n) {
    const have = storeTotal(G, res);
    const take = Math.min(n, have);
    if (take > 0) G.state.res[res] = have - take;
    return take;
  }

  // Nächstes Lager (Arbeiter tragen dorthin)
  function nearestStore(G, x, y) {
    let best = null, bd = Infinity;
    for (const pad of G.padList) {
      if (CFG.BUILDINGS[pad.type] && CFG.BUILDINGS[pad.type].kind === 'store') {
        const b = G.state.buildings[pad.id];
        if (!b || b.tier < 1) continue;
        const d = U.dist2(x, y, pad.x, pad.y);
        if (d < bd) { bd = d; best = pad; }
      }
    }
    return best;
  }

  // Erntbare Knoten (Bäume/Felsen aus der Deko, Felder rund um den Hof)
  function findHarvestNode(G, g, worker) {
    const kind = g.def.node;
    const px = g.pad.x, py = g.pad.y;
    if (kind === 'field') {
      // Bauernhof: eigene Felder im Kreis um den Hof
      const n = 6;
      const i = (worker.nodeIdx = (worker.nodeIdx + 1) % n);
      const a = (i / n) * Math.PI * 2 + 0.3;
      const r = g.def.workRange * 0.55;
      return { x: px + Math.cos(a) * r, y: py + Math.sin(a) * r, kind };
    }
    // Holz/Stein: die passende Requisite mit dem kürzesten Weg suchen —
    // gewertet wird der ganze Rundgang Hütte → Baum → Lager, nicht nur die
    // Entfernung zur Hütte. Sonst rennen die Arbeiter quer über die Karte.
    const want = kind === 'tree' ? ['tree', 'pine'] : ['rock', 'ruin'];
    const store = nearestStore(G, px, py);
    const sx = store ? store.x : px, sy = store ? store.y : py;
    let best = null, bd = Infinity;
    const R2 = g.def.workRange * g.def.workRange;
    const skip = worker.lastNode;
    for (const p of G.props) {
      if (!want.includes(p.kind)) continue;
      if (U.dist2(px, py, p.x, p.y) > R2) continue;
      if (p === skip) continue;
      // Rundweg-Länge, plus etwas Streuung, damit nicht alle am selben Baum stehen
      const trip = U.dist(px, py, p.x, p.y) + U.dist(p.x, p.y, sx, sy);
      const jitter = ((p.x * 7 + p.y * 13) % 97) * 0.9;
      const score = trip + jitter;
      if (score < bd) { bd = score; best = p; }
    }
    if (best) return { x: best.x, y: best.y, kind, prop: best };
    return null;
  }

  function spawnWorker(G, g, idx) {
    const a = Math.random() * Math.PI * 2;
    const w = {
      id: g.pad.id + ':' + idx,
      padId: g.pad.id,
      res: g.def.res,
      x: g.pad.x + Math.cos(a) * 26, y: g.pad.y + Math.sin(a) * 26 + 10,
      state: 'idle', t: 0, animT: Math.random() * 10, face: 1,
      carry: 0, nodeIdx: idx, lastNode: null, target: null,
      idx: idx % 6,
      speed: U.rand(70, 82),
    };
    G.workers.push(w);
    return w;
  }

  // Arbeiterzahl an die Gebäudestufen angleichen
  function syncWorkers(G) {
    const want = new Map();
    for (const g of G.gatherers) want.set(g.pad.id, g);
    // zu viele oder verwaiste entfernen
    for (let i = G.workers.length - 1; i >= 0; i--) {
      const w = G.workers[i];
      const g = want.get(w.padId);
      if (!g) { G.workers.splice(i, 1); continue; }
      const n = G.workers.filter(o => o.padId === w.padId).length;
      if (n > g.workers) G.workers.splice(i, 1);
    }
    // fehlende ergänzen
    for (const g of G.gatherers) {
      let have = G.workers.filter(o => o.padId === g.pad.id).length;
      for (; have < g.workers; have++) spawnWorker(G, g, have);
    }
  }

  function updateWorkers(G, dt) {
    const isNight = G.state.phase === 'night';
    G.workerSyncT = (G.workerSyncT || 0) + dt;
    if (G.workerSyncT > 1.5) { G.workerSyncT = 0; syncWorkers(G); }

    for (const w of G.workers) {
      const g = G.gatherers.find(x => x.pad.id === w.padId);
      if (!g) continue;
      w.animT += dt;
      const speed = w.speed * G.tech.workerSpeed;

      // Nachts sind die Arbeiter in Sicherheit → zurück zur Hütte, dann warten
      if (isNight) {
        const d = U.dist(w.x, w.y, g.pad.x, g.pad.y);
        if (d > 24) {
          w.x += (g.pad.x - w.x) / d * speed * 1.5 * dt;
          w.y += (g.pad.y - w.y) / d * speed * 1.5 * dt;
          w.face = g.pad.x < w.x ? -1 : 1;
          w.state = 'home';
        } else {
          w.state = 'sleep';
        }
        continue;
      }

      switch (w.state) {
        case 'sleep':
        case 'home':
        case 'idle': {
          const node = findHarvestNode(G, g, w);
          if (!node) { w.state = 'nonode'; w.t = 2; break; }
          w.target = node;
          w.lastNode = node.prop || null;
          w.state = 'toNode';
          break;
        }
        case 'nonode':
          w.t -= dt;
          if (w.t <= 0) w.state = 'idle';
          break;
        case 'toNode': {
          const t = w.target;
          const d = U.dist(w.x, w.y, t.x, t.y);
          if (d > 20) {
            w.x += (t.x - w.x) / d * speed * dt;
            w.y += (t.y - w.y) / d * speed * dt;
            w.face = t.x < w.x ? -1 : 1;
          } else {
            w.state = 'harvest';
            w.t = g.harvestTime;
          }
          break;
        }
        case 'harvest': {
          w.t -= dt;
          // Späne / Staub beim Arbeiten
          if (Math.random() < dt * 7) {
            const col = w.res === 'wood' ? ['#c9a86a', '#8a6234']
              : w.res === 'stone' ? ['#c8c2b6', '#8d867b'] : ['#e8c15a', '#c9a13a'];
            Ent.particle(G, w.x + U.rand(-8, 8), w.y - U.rand(6, 18), {
              vx: U.rand(-24, 24), vz: U.rand(30, 70), grav: 220,
              life: 0.45, size: 2.2, color: U.pick(col),
            });
          }
          if (w.t <= 0) {
            w.carry = g.load;
            w.state = 'toStore';
            w.store = nearestStore(G, w.x, w.y);
            if (!w.store) { w.state = 'nostore'; w.t = 2.5; w.carry = 0; }
          }
          break;
        }
        case 'nostore':
          w.t -= dt;
          if (w.t <= 0) w.state = 'idle';
          break;
        case 'toStore': {
          const s = w.store || nearestStore(G, w.x, w.y);
          if (!s) { w.state = 'nostore'; w.t = 2.5; break; }
          const d = U.dist(w.x, w.y, s.x, s.y);
          if (d > 30) {
            w.x += (s.x - w.x) / d * speed * 0.92 * dt;   // beladen etwas langsamer
            w.y += (s.y - w.y) / d * speed * 0.92 * dt;
            w.face = s.x < w.x ? -1 : 1;
          } else {
            const put = storeAdd(G, w.res, w.carry);
            if (put > 0) {
              Ent.text(G, s.x, s.y - 40, `+${put}`, {
                color: CFG.RESOURCES[w.res].color, size: 12, life: 0.7, up: 26,
              });
              Ent.particle(G, s.x, s.y - 16, { vz: 40, grav: 120, life: 0.35, size: 3, color: CFG.RESOURCES[w.res].color });
            } else if (G.storeFullT <= 0) {
              KS.UI.toast('Das Lager ist voll — baue es aus!', 2600, 'crate');
              G.storeFullT = 22;
            }
            w.carry = 0;
            w.state = 'idle';
          }
          break;
        }
      }
    }
    if (G.storeFullT > 0) G.storeFullT -= dt;
  }

  // Verarbeiter: Rohstoff → Münzen
  function updateCrafters(G, dt) {
    for (const c of G.crafters) {
      const key = c.pad.id;
      G.craftT[key] = (G.craftT[key] || 0) + dt;
      if (G.craftT[key] < c.interval) continue;
      const took = storeTake(G, c.def.res, c.batch);
      if (took <= 0) {
        G.craftT[key] = c.interval * 0.6;    // wartet auf Material
        c.idle = true;
        continue;
      }
      c.idle = false;
      G.craftT[key] = 0;
      const gold = Math.max(1, Math.round(c.gold * (took / c.batch) * G.goldMul));
      Ent.spawnCoinBurst(G, c.pad.x + U.rand(-16, 16), c.pad.y + U.rand(12, 28), gold);
      Ent.text(G, c.pad.x, c.pad.y - 58, `+${U.fmt(gold)}`, { color: '#ffe084', size: 13, life: 0.9 });
      sendHauler(G, c);
      // Rauch/Funken je Werk
      for (let i = 0; i < 3; i++) {
        Ent.particle(G, c.pad.x + U.rand(-10, 10), c.pad.y - U.rand(20, 40), {
          vx: U.rand(-8, 8), vz: U.rand(18, 34), grav: -14,
          life: 1.1, size: 3.4, endSize: 8, color: 'rgba(220,215,205,0.3)',
        });
      }
    }
  }

  // Zweiter Abschnitt der Kette: ein Träger bringt den Rohstoff sichtbar vom
  // Lager zum Werk. Das Gold ist bereits gebucht — der Träger ist Beiwerk und
  // darf jederzeit verschwinden (Neuladen, Abriss), ohne dass etwas fehlt.
  function sendHauler(G, c) {
    if (G.haulers.length >= 16) return;
    const store = nearestStore(G, c.pad.x, c.pad.y);
    if (!store) return;
    const d = U.dist(store.x, store.y, c.pad.x, c.pad.y);
    if (d < 70) return;                       // direkt daneben — kein Weg zu zeigen
    G.haulers.push({
      x: store.x + U.rand(-10, 10), y: store.y + U.rand(4, 16),
      tx: c.pad.x + U.rand(-10, 10), ty: c.pad.y + U.rand(10, 22),
      res: c.def.res, idx: (G.haulers.length + c.tier) % 6,
      speed: U.rand(64, 76) * G.tech.workerSpeed,
      animT: Math.random() * 10, face: 1,
    });
  }

  function updateHaulers(G, dt) {
    for (let i = G.haulers.length - 1; i >= 0; i--) {
      const h = G.haulers[i];
      h.animT += dt;
      const dx = h.tx - h.x, dy = h.ty - h.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d < 12) {
        // Abgeliefert: kurzer Staubwirbel am Werk
        Ent.particle(G, h.x, h.y - 8, {
          vx: U.rand(-14, 14), vz: U.rand(20, 40), grav: 180,
          life: 0.4, size: 2.6, color: CFG.RESOURCES[h.res].color,
        });
        G.haulers.splice(i, 1);
        continue;
      }
      h.x += dx / d * h.speed * dt;
      h.y += dy / d * h.speed * dt;
      h.face = dx < 0 ? -1 : 1;
    }
  }

  // „Nachtwache“: angeschlagene Mauern und Tore flicken sich auch mitten in
  // der Schlacht. Was schon durchbrochen ist, bleibt offen bis zum Morgen —
  // sonst wäre eine Bresche wirkungslos.
  function regenWalls(G, dt) {
    if (!G.tech.wallRegen || G.state.phase !== 'night') return;
    const st = G.state, k = 0.014 * dt;    // 1,4 % der Höchst-HP je Sekunde
    if (st.wall && G.wallMax > 0) {
      const add = G.wallMax * k;
      for (let i = 0; i < st.wall.hp.length; i++) {
        if (st.wall.hp[i] > 0 && st.wall.hp[i] < G.wallMax) {
          st.wall.hp[i] = Math.min(G.wallMax, st.wall.hp[i] + add);
        }
      }
    }
    if (st.gates && G.gateMax > 0) {
      const add = G.gateMax * k;
      for (let i = 0; i < st.gates.hp.length; i++) {
        if (st.gates.hp[i] > 0 && st.gates.hp[i] < G.gateMax) {
          st.gates.hp[i] = Math.min(G.gateMax, st.gates.hp[i] + add);
        }
      }
    }
  }

  // Vorzug für Belagerer bei der Turm-Zielwahl (in Pixeln „näher" gerechnet).
  // Groß genug, damit ein Mauerknabberer ein durchgekommenes Monster schlägt,
  // klein genug, dass ein Gegner direkt am Turm weiter Vorrang hat.
  const SIEGE_PRIO = 150;
  // Takt der Mauerwache (Sekunden zwischen den Salven)
  const GARRISON_INTERVAL = 1.1;

  // Mauerwache: auf der Mauer stehen Bogenschützen. Einzeln sind sie deutlich
  // schwächer als ein Turm, dafür stehen sie überall.
  // Ohne sie gibt es tote Winkel: ein Turm deckt nur rund 45° des Mauerrings,
  // mit drei Türmen bleiben über 130° übrig, in denen Monster die Mauer in
  // aller Ruhe zerlegen, weil kein Turm sie erreicht.
  function updateGarrison(G, dt) {
    const st = G.state;
    const wb = st.buildings.wall;
    if (!wb || wb.tier < 1 || G.wallMax <= 0) return;
    G.garrisonT = (G.garrisonT || 0) + dt;
    if (G.garrisonT < GARRISON_INTERVAL) return;
    G.garrisonT = 0;

    // Wer nagt gerade an Mauer oder Tor?
    const ziele = [];
    for (const m of G.monsters) if (!m.dead && m.siege) ziele.push(m);
    if (!ziele.length) return;

    // Zahl der gleichzeitig schießenden Verteidiger und ihr Schaden wachsen
    // mit der Mauerstufe — ein Grund mehr, die Mauer auszubauen.
    const schuesse = Math.min(2 + Math.floor(wb.tier / 2), 8, ziele.length);
    const dmg = 18 * Math.pow(1.26, wb.tier - 1) * G.tech.towerDmg;
    const { cx, cy } = CFG.WORLD;
    // Angeschlagene zuerst: gebündeltes Feuer holt Angreifer wirklich runter.
    // Verteilt man den Schaden gleichmäßig, nimmt jeder etwas Schaden, aber
    // keiner fällt — und die Mauer bekommt trotzdem die volle Breitseite.
    ziele.sort((a, b) => a.hp - b.hp);
    for (let i = 0; i < schuesse; i++) {
      const m = ziele[i];
      // Der Schütze steht auf der Mauer, direkt vor dem Angreifer
      const ang = Math.atan2(m.y - cy, m.x - cx);
      const sx = cx + Math.cos(ang) * (CFG.WALL.r - 8);
      const sy = cy + Math.sin(ang) * (CFG.WALL.r - 8) - 26;
      const a = U.angleTo(sx, sy, m.x, m.y - m.r * 0.5);
      G.projectiles.push({
        kind: 'arrow', x: sx, y: sy,
        vx: Math.cos(a) * 480, vy: Math.sin(a) * 480,
        t: 0, ttl: 0.35, dmg, side: 'ally',
      });
    }
    if (schuesse > 0) KS.Audio.SFX.arrow();
  }

  // ============ GEBÄUDE-LOGIK ============
  function updateBuildings(G, dt) {
    const st = G.state;
    regenWalls(G, dt);
    updateGarrison(G, dt);
    // Türme
    for (const t of G.towers) {
      if (t.flash > 0) t.flash -= dt;
      t.cd -= dt;
      if (t.cd > 0) continue;
      const s = t.stats;
      G.grid.query(t.pad.x, t.pad.y, s.range + 40, G.qbuf);
      // Wer an Mauer oder Tor nagt, wird bevorzugt beschossen: er steht still,
      // zerlegt deine Verteidigung und ist fast immer etwas WEITER weg als das,
      // was schon durchgekommen ist. Ohne diesen Vorzug zielen die Türme
      // grundsätzlich nach innen und die Mauer fällt unbehelligt.
      let target = null, bestScore = Infinity, bestD = 0;
      for (const m of G.qbuf) {
        if (m.dead) continue;
        const d = U.dist(t.pad.x, t.pad.y, m.x, m.y);
        if (d - m.r > s.range) continue;
        const score = m.siege ? d - SIEGE_PRIO : d;
        if (score < bestScore) { bestScore = score; bestD = d; target = m; }
      }
      if (!target) { t.cd = 0.08; continue; }
      t.cd = 1 / s.rate;
      t.flash = 0.12;
      const topX = t.pad.x, topY = t.pad.y - t.topY;
      if (t.type === 'tower_arrow') {
        const lead = predict(target, bestD / 520);
        const a = U.angleTo(topX, topY, lead.x, lead.y);
        G.projectiles.push({
          kind: 'arrow', x: topX, y: topY,
          vx: Math.cos(a) * 520, vy: Math.sin(a) * 520,
          t: 0, ttl: (s.range + 60) / 520, dmg: s.dmg, side: 'ally',
        });
        KS.Audio.SFX.arrow();
      } else if (t.type === 'tower_cannon') {
        const lead = predict(target, 0.8);
        G.projectiles.push({
          kind: 'cannon', x: topX, y: topY, x0: topX, y0: topY,
          tx: lead.x, ty: lead.y, arc: 60 + bestD * 0.25,
          t: 0, ttl: 0.8, dmg: s.dmg, splash: s.splash, side: 'ally',
        });
      } else if (t.type === 'tower_frost') {
        const lead = predict(target, bestD / 380);
        const a = U.angleTo(topX, topY, lead.x, lead.y);
        G.projectiles.push({
          kind: 'frost', x: topX, y: topY,
          vx: Math.cos(a) * 380, vy: Math.sin(a) * 380,
          t: 0, ttl: (s.range + 50) / 380, dmg: s.dmg, side: 'ally',
          slow: s.slow, slowDur: s.slowDur,
        });
        KS.Audio.SFX.frost();
      } else if (t.type === 'tower_lightning') {
        // Kettenblitz sofort
        const pts = [[topX, topY - 8]];
        let cur = target;
        const hitSet = new Set();
        let dmg = s.dmg;
        for (let c = 0; c < s.chain && cur; c++) {
          hitSet.add(cur);
          // Zickzack-Punkte
          const px = pts[pts.length - 1];
          const segs = 3;
          for (let sgi = 1; sgi <= segs; sgi++) {
            const k = sgi / segs;
            pts.push([
              U.lerp(px[0], cur.x, k) + (sgi < segs ? U.rand(-14, 14) : 0),
              U.lerp(px[1], cur.y - cur.r, k) + (sgi < segs ? U.rand(-14, 14) : 0),
            ]);
          }
          Ent.damageMonster(G, cur, dmg, { color: '#e0ccff' });
          Ent.burst(G, cur.x, cur.y - cur.r, 4, { colors: ['#e0ccff', '#fff'], speed: 60, up: 60, size: 2.4, life: 0.3 });
          dmg *= 0.75;
          // nächstes Ziel (eigener Puffer — G.qbuf wird gerade iteriert!)
          let next = null, nd = Infinity;
          G.grid.query(cur.x, cur.y, s.chainR, G.qbuf2);
          for (const m of G.qbuf2) {
            if (m.dead || hitSet.has(m)) continue;
            const d = U.dist2(cur.x, cur.y, m.x, m.y);
            if (d < nd && d < s.chainR * s.chainR) { nd = d; next = m; }
          }
          cur = next;
        }
        G.zaps.push({ pts, t: 0 });
        KS.Audio.SFX.zap();
      } else if (t.type === 'tower_flame') {
        // Flammenstoß: Kegelschaden über kurze Zeit
        t.cd = 1 / s.rate;
        const a = U.angleTo(t.pad.x, t.pad.y, target.x, target.y);
        G.grid.query(t.pad.x, t.pad.y, s.range + 30, G.qbuf);
        for (const m of G.qbuf) {
          if (m.dead) continue;
          const d = U.dist(t.pad.x, t.pad.y, m.x, m.y);
          if (d - m.r > s.range) continue;
          let da = Math.abs(U.angleTo(t.pad.x, t.pad.y, m.x, m.y) - a);
          if (da > Math.PI) da = TAU - da;
          if (da > 0.55) continue;
          Ent.damageMonster(G, m, s.dmg, { burn: s.burn, burnDur: s.burnDur, color: '#ffb46e' });
        }
        // Flammenpartikel
        for (let i = 0; i < 3; i++) {
          const spd = U.rand(160, 260), aa = a + U.rand(-0.3, 0.3);
          Ent.particle(G, topX, topY, {
            vx: Math.cos(aa) * spd, vy: Math.sin(aa) * spd,
            vz: U.rand(-10, 30), grav: -10, z: 4,
            life: U.rand(0.3, 0.55), size: U.rand(3.5, 6), endSize: 1,
            color: U.pick(['#ffd34e', '#ff9d2e', '#e5484d']),
          });
        }
        if (Math.random() < 0.4) KS.Audio.SFX.flame();
      }
    }

    // Produktion (Minen & Tavernen) — Münzen erscheinen am Gebäude
    const taverns = [];
    let survivorsLeft = G.state.survivors;
    for (const pad of G.padList) {
      const b = st.buildings[pad.id];
      if (!b || b.tier < 1) continue;
      if (pad.type === 'tavern') {
        const cap = CFG.BUILDINGS.tavern.capacity(b.tier);
        const housed = Math.min(cap, survivorsLeft);
        survivorsLeft -= housed;
        taverns.push({ pad, b, housed });
      }
    }
    for (const pad of G.padList) {
      const b = st.buildings[pad.id];
      if (!b || b.tier < 1) continue;
      const def = CFG.BUILDINGS[pad.type];
      if (def.kind !== 'prod') continue;
      const key = pad.id;
      G.prodTimers[key] = (G.prodTimers[key] || 0) + dt;
      let interval = def.interval, amount = 0;
      if (pad.type === 'mine') {
        amount = def.income(b.tier) * G.tech.prodGold;
      } else {
        // Tavernen: Steuern je Kopf, dazu der Brotbonus aus Mühlen
        const tv = taverns.find(t => t.pad.id === pad.id);
        amount = tv && tv.housed > 0
          ? def.income(b.tier) * tv.housed * G.tech.prodGold * G.tech.taxes * (1 + G.tech.breadBonus)
          : 0;
      }
      amount = Math.round(amount);
      if (G.prodTimers[key] >= interval) {
        G.prodTimers[key] -= interval;
        if (amount > 0) {
          Ent.spawnCoinBurst(G, pad.x + U.rand(-14, 14), pad.y + U.rand(10, 26), amount);
          Ent.text(G, pad.x, pad.y - 60, `+${U.fmt(amount)}`, { color: '#ffe084', size: 13, life: 0.9 });
        }
      }
      // Schornstein-Rauch
      if ((pad.type === 'tavern' || pad.type === 'mine') && Math.random() < dt * 2.2) {
        const sx = pad.type === 'tavern' ? pad.x + 14 : pad.x + 2;
        const sy = pad.type === 'tavern' ? pad.y - 78 - b.tier * 4 : pad.y - 20;
        if (pad.type === 'tavern') Ent.particle(G, sx, sy, { vx: U.rand(-4, 10), vz: U.rand(18, 30), grav: -18, life: 1.6, size: 4, endSize: 9, color: 'rgba(220,220,225,0.25)' });
      }
    }
    // Schmiede-Funken
    const forgeB = st.buildings.forge;
    if (forgeB && forgeB.tier >= 1 && Math.random() < dt * 3) {
      const fp = G.padList.find(p => p.id === 'forge');
      Ent.particle(G, fp.x + U.rand(-8, 8), fp.y - 20, {
        vx: U.rand(-30, 30), vz: U.rand(40, 90), grav: 260,
        life: 0.5, size: 2, color: U.pick(['#ffd34e', '#ff9d2e', '#fff']),
      });
    }
    // Innere Selbstheilung der Burg (langsam)
    if (st.baseHp > 0 && st.baseHp < G.baseHpMax) {
      st.baseHp = Math.min(G.baseHpMax, st.baseHp + G.baseHpMax * CFG.BUILDINGS.castle.regen * dt);
    }
    // Schrein-Aura
    G.shrineGlow = 0;
    const shrineB = st.buildings.shrine;
    if (shrineB && shrineB.tier >= 1) {
      const sp = G.padList.find(p => p.id === 'shrine');
      const def = CFG.BUILDINGS.shrine;
      const R = def.auraR(shrineB.tier);
      // Burg heilen
      if (st.baseHp < G.baseHpMax) {
        st.baseHp = Math.min(G.baseHpMax, st.baseHp + G.baseHpMax * def.baseHeal(shrineB.tier) * dt);
      }
      // Spieler heilen in Aura
      const pl = st.player;
      if (!G.playerDown && U.dist2(pl.x, pl.y, sp.x, sp.y) < R * R) {
        G.shrineGlow = 1;
        if (pl.hp < G.playerHpMax) {
          pl.hp = Math.min(G.playerHpMax, pl.hp + def.heal(shrineB.tier) * dt);
          if (Math.random() < dt * 3) Ent.particle(G, pl.x + U.rand(-10, 10), pl.y - U.rand(6, 26), { vz: 26, grav: -20, life: 0.7, size: 2.2, color: '#baffc8' });
        }
      }
      if (Math.random() < dt * 4) {
        const a = Math.random() * TAU, r = Math.random() * 30;
        Ent.particle(G, sp.x + Math.cos(a) * r, sp.y - 10 + Math.sin(a) * r * 0.4, { vz: U.rand(14, 30), grav: -14, life: 1.1, size: 2.2, color: 'rgba(255,244,190,0.85)' });
      }
    }
    // Burg raucht bei schweren Schäden
    if (st.baseHp < G.baseHpMax * 0.4 && Math.random() < dt * 4) {
      Ent.particle(G, CFG.WORLD.cx + U.rand(-40, 40), CFG.WORLD.cy - U.rand(40, 90), {
        vx: U.rand(-6, 6), vz: U.rand(16, 30), grav: -16,
        life: 1.4, size: 4, endSize: 10, color: 'rgba(60,55,55,0.4)',
      });
    }
  }

  function predict(m, t) {
    // grobe Zielvorhersage
    const speedF = m.slowT > 0 ? 1 - m.slowF : 1;
    const a = m.state === 'chase'
      ? U.angleTo(m.x, m.y, KS.Game.G.state.player.x, KS.Game.G.state.player.y)
      : U.angleTo(m.x, m.y, CFG.WORLD.cx, CFG.WORLD.cy);
    return { x: m.x + Math.cos(a) * m.speed * speedF * t, y: m.y + Math.sin(a) * m.speed * speedF * t };
  }

  // ============ TAG/NACHT-DIREKTOR ============
  function generateNightPlan(G, day) {
    const bossDef = CFG.bossForDay(day);
    let budget = CFG.SCALE.budget(day) * (bossDef ? 0.55 : 1);
    const nightLen = CFG.PHASES.nightLen(day);
    const speciesPool = Object.entries(CFG.MONSTERS)
      .filter(([k, s]) => s.minDay <= day)
      .map(([k, s]) => ({ key: k, sp: s, w: (1 + s.cls * 0.25) * (day - s.minDay < 6 ? 2.2 : 1) }));
    const totalW = speciesPool.reduce((a, s) => a + s.w, 0);
    const plan = [];
    const eliteCh = CFG.SCALE.eliteChance(day);
    const maxEntries = bossDef ? 130 : 220;
    // Wellen-Fenster: 3 Stoßwellen + Tröpfeln
    const windows = [
      [0.04, 0.16, 0.34], [0.32, 0.46, 0.3], [0.62, 0.8, 0.26],
    ];
    let guard = 0;
    while (budget > 0 && plan.length < maxEntries && guard++ < 500) {
      let r = Math.random() * totalW, chosen = speciesPool[0];
      for (const s of speciesPool) { r -= s.w; if (r <= 0) { chosen = s; break; } }
      const pack = chosen.sp.pack || 1;
      // Zeitfenster wählen
      const wr = Math.random();
      let t;
      if (wr < 0.9) {
        const win = windows[Math.floor(Math.random() * windows.length)];
        t = U.rand(win[0], win[1]) * nightLen;
      } else {
        t = U.rand(0.05, 0.85) * nightLen;
      }
      const gateA = Math.floor(Math.random() * 8) * Math.PI / 4 + 0.12;
      for (let p = 0; p < pack && budget > 0; p++) {
        plan.push({ t: t + p * 0.4, key: chosen.key, elite: Math.random() < eliteCh, gate: gateA });
        budget -= chosen.sp.cost;
      }
    }
    plan.sort((a, b) => a.t - b.t);
    return {
      plan, idx: 0,
      bossId: bossDef ? bossDef.id : null,
      bossSpawned: false, bossDead: !bossDef,
    };
  }

  function spawnFromEntry(G, e) {
    const { cx, cy, w } = CFG.WORLD;
    const R = w * 0.485;
    const a = e.gate + U.rand(-0.22, 0.22);
    const x = U.clamp(cx + Math.cos(a) * R, 30, w - 30);
    const y = U.clamp(cy + Math.sin(a) * R, 30, w - 30);
    const m = Ent.makeMonster(G, e.key, x, y, { elite: e.elite });
    Ent.particle(G, x, y - 10, { life: 0.5, size: 8, endSize: 1, color: 'rgba(60,30,80,0.4)', grav: 0 });
    return m;
  }

  function spawnBoss(G, bossId) {
    const def = CFG.bossForDay(G.state.day) || CFG.BOSSES.find(b => b.id === bossId);
    if (!def) return;
    const { cx, cy, w } = CFG.WORLD;
    const a = Math.random() * TAU;
    const x = U.clamp(cx + Math.cos(a) * w * 0.46, 60, w - 60);
    const y = U.clamp(cy + Math.sin(a) * w * 0.46, 60, w - 60);
    const m = Ent.makeMonster(G, def.base, x, y, {
      boss: true, bossId: def.id, name: def.name,
      hpOverride: CFG.bossHp(G.state.day, def.hpTweak), dmgMul: def.dmgMul, size: def.size,
      gold: def.gold, speed: def.speed,
    });
    G.boss = m;
    KS.Audio.SFX.bossRoar();
    G.shake = Math.max(G.shake, 10);
    KS.UI.banner(def.name, def.sub, 'danger');
    KS.UI.showBossBar(def.name);
    KS.Game.log(`${def.name} ist erschienen!`);
    Ent.ring(G, x, y, { r0: 20, r1: 160, life: 0.8, color: 'rgba(229,72,77,0.8)', lw: 6 });
  }

  function onBossKilled(G, m) {
    G.state.bossesKilled[m.bossId] = true;
    G.state.stats.bossKills++;
    if (G.night) G.night.bossDead = true;
    G.boss = null;
    KS.UI.hideBossBar();
    KS.UI.banner('BESIEGT!', `${m.name} ist gefallen`, 'gold');
    KS.Game.log(`${m.name} wurde besiegt!`);
    KS.Game.requestSave();
  }

  function startNight(G) {
    const st = G.state;
    st.phase = 'night';
    st.phaseT = 0;
    G.night = generateNightPlan(G, st.day);
    st.night = G.night;
    KS.Audio.SFX.hornDusk();
    KS.Audio.setNight(true);
    const bossDef = G.night.bossId ? (CFG.bossForDay(st.day) || {}) : null;
    KS.UI.banner(`Nacht ${st.day}`, bossDef ? `${bossDef.name} naht!` : 'Sie kommen…', 'night');
    KS.Game.log(`Nacht ${st.day} bricht herein.`);
    KS.Game.requestSave();
  }

  function startDay(G, first) {
    const st = G.state;
    st.phase = 'day';
    st.phaseT = 0;
    G.night = null;
    st.night = null;
    G.boss = null;
    KS.UI.hideBossBar();
    KS.Audio.setNight(false);
    if (!first) {
      st.day += 1;
      st.stats.days = st.day - 1;
      KS.Audio.SFX.hornDawn();
      KS.UI.banner(`Tag ${st.day}`, U.pick(CFG.DAWN_LINES));
      KS.Game.log(`Tag ${st.day} — die Burg steht.`);
      // Monster fliehen
      for (const m of G.monsters) if (!m.boss) m.state = 'flee';
      // Überlebende kommen an, Mauer wird repariert
      dawnArrivals(G);
      repairWallAtDawn(G);
      // Spieler etwas heilen
      st.player.hp = Math.min(G.playerHpMax, st.player.hp + G.playerHpMax * 0.35);
    }
    KS.Game.requestSave();
  }

  function updateDirector(G, dt) {
    const st = G.state;
    st.phaseT += dt;
    if (st.phase === 'day') {
      const len = CFG.PHASES.dayLen(st.day);
      // Tags-Tröpfeln: vereinzelte schwache Monster (ab Tag 2, anfangs selten)
      G.dayTrickleT = (G.dayTrickleT || 0) + dt;
      const interval = Math.max(4, 14 - st.day * 0.3);
      if (st.day >= 2 && G.dayTrickleT >= interval && G.monsters.length < 24) {
        G.dayTrickleT = 0;
        const pool = Object.entries(CFG.MONSTERS).filter(([k, s]) => s.minDay <= st.day && s.cls <= Math.max(1, Math.ceil(st.day / 6)));
        if (pool.length) {
          const [key] = U.pick(pool);
          spawnFromEntry(G, { key, elite: false, gate: Math.random() * TAU });
        }
      }
      if (st.phaseT >= len) startNight(G);
    } else {
      // Nacht
      const len = CFG.PHASES.nightLen(st.day);
      const night = G.night;
      if (night) {
        // Spawns freigeben
        while (night.idx < night.plan.length && night.plan[night.idx].t <= st.phaseT) {
          if (G.monsters.length >= 70) { night.plan[night.idx].t += 1.2; break; }
          spawnFromEntry(G, night.plan[night.idx]);
          night.idx++;
        }
        // Boss bei 25 % der Nacht
        if (night.bossId && !night.bossSpawned && st.phaseT >= len * 0.25) {
          night.bossSpawned = true;
          spawnBoss(G, night.bossId);
        }
        const planDone = night.idx >= night.plan.length;
        const bossOk = !night.bossId || night.bossDead || !night.bossSpawned ? (!night.bossId || night.bossDead) : false;
        if (st.phaseT >= len) {
          if (planDone && (!night.bossId || night.bossDead)) startDay(G, false);
          else st.phaseT = len; // Nacht hält an, bis der Boss fällt
        }
      } else {
        // Sollte nicht passieren — sicherheitshalber Plan erzeugen
        G.night = st.night = generateNightPlan(G, st.day);
      }
    }
  }

  // ============ ÜBERLEBENDE ============
  function tavernCapacity(G) {
    let cap = 0;
    for (const pad of G.padList) {
      if (pad.type !== 'tavern') continue;
      const b = G.state.buildings[pad.id];
      if (b && b.tier >= 1) cap += CFG.BUILDINGS.tavern.capacity(b.tier);
    }
    return cap;
  }

  function dawnArrivals(G) {
    const st = G.state;
    const cap = tavernCapacity(G);
    if (st.survivors >= cap) return;
    const free = cap - st.survivors;
    // „Herolde“ holen doppelt so viele Flüchtlinge herein
    const n = U.clamp((1 + Math.floor(free / 5)) * G.tech.arrivals, 1, 6);
    const taverns = G.padList.filter(p => p.type === 'tavern' && st.buildings[p.id] && st.buildings[p.id].tier >= 1);
    if (!taverns.length) return;
    for (let i = 0; i < Math.min(n, free); i++) {
      st.survivors += 1;
      const v = Ent.spawnVillager(G, U.pick(taverns), true);
      v.name = U.pick(CFG.SURVIVOR_NAMES);
    }
  }

  function onSurvivorArrived(G, v) {
    KS.Audio.SFX.survivor();
    const name = v.name || U.pick(CFG.SURVIVOR_NAMES);
    KS.UI.toast(`${name} ${U.pick(CFG.SURVIVOR_LINES)} (${G.state.survivors} Überlebende)`, 3400, 'person');
    KS.Game.log(`${name} hat Zuflucht gefunden. (${G.state.survivors})`);
    Ent.ring(G, v.x, v.y, { r0: 6, r1: 34, color: 'rgba(180,255,190,0.8)' });
  }

  // Kosmetische Dorfbewohner an Überlebendenzahl angleichen
  function syncVillagers(G) {
    if (G.state.phase === 'night') return;
    const want = Math.min(12, G.state.survivors);
    const have = G.villagers.filter(v => !v.arriving).length;
    const taverns = G.padList.filter(p => p.type === 'tavern' && G.state.buildings[p.id] && G.state.buildings[p.id].tier >= 1);
    if (!taverns.length) return;
    for (let i = have; i < want; i++) Ent.spawnVillager(G, U.pick(taverns), false);
  }

  // ============ QUESTS & KAPITEL ============
  function activeQuest(G) {
    const st = G.state;
    if (st.questIdx < CFG.QUESTS.length) return CFG.QUESTS[st.questIdx];
    return CFG.endlessQuest(st.endlessIdx, st);
  }

  function questProgress(G, q) {
    const st = G.state;
    switch (q.type) {
      case 'gold_collect': return [Math.min(q.n, st.goldCollected - (st.questBase || 0)), q.n];
      case 'build': {
        const b = st.buildings[q.pad];
        return [Math.min(q.tier, b ? b.tier : 0), q.tier];
      }
      case 'day': return [Math.min(q.n, st.day), q.n];
      case 'kill': {
        const k = (st.killsByClass[q.cls] || 0) - (st.questBase || 0);
        return [U.clamp(k, 0, q.n), q.n];
      }
      case 'kill_any': {
        const k = st.stats.kills - (st.questBase || 0);
        return [U.clamp(k, 0, q.n), q.n];
      }
      case 'boss': return [st.bossesKilled[q.boss] ? 1 : 0, 1];
      case 'survivors': return [Math.min(q.n, st.survivors), q.n];
      case 'weapon': {
        const b = st.buildings.forge;
        return [Math.min(q.tier, b ? b.tier : 0), q.tier];
      }
      case 'castle': {
        const b = st.buildings.castle;
        return [Math.min(q.tier, b ? b.tier : 1), q.tier];
      }
      case 'towers_tier': {
        let n = 0;
        for (const pad of G.padList) {
          if (!pad.type.startsWith('tower_')) continue;
          const b = st.buildings[pad.id];
          if (b && b.tier >= q.tier) n++;
        }
        return [Math.min(q.count, n), q.count];
      }
      // Selbst gesetzte Wirtschaftsgebäude ab Stufe 1 zählen
      case 'place': {
        let n = 0;
        for (const pad of (st.placed || [])) {
          if (pad.type !== q.bt) continue;
          const b = st.buildings[pad.id];
          if (b && b.tier >= (q.tier || 1)) n++;
        }
        return [Math.min(q.n, n), q.n];
      }
      // Insgesamt ins Lager gelieferte Rohstoffe
      case 'res': {
        const got = (st.resTotal && st.resTotal[q.res] || 0) - (st.questBase || 0);
        return [U.clamp(got, 0, q.n), q.n];
      }
      case 'tech': {
        const n = Object.keys(st.tech || {}).length - (st.questBase || 0);
        return [U.clamp(n, 0, q.n), q.n];
      }
    }
    return [0, 1];
  }

  function questBaseline(G, q) {
    const st = G.state;
    if (!q) return 0;
    if (q.type === 'kill') return st.killsByClass[q.cls] || 0;
    if (q.type === 'kill_any') return st.stats.kills;
    if (q.type === 'gold_collect') return st.goldCollected;
    if (q.type === 'res') return (st.resTotal && st.resTotal[q.res]) || 0;
    if (q.type === 'tech') return Object.keys(st.tech || {}).length;
    return 0;
  }

  function questTargetPad(G, q) {
    if (!q) return null;
    if (q.type === 'build') return G.padList.find(p => p.id === q.pad);
    if (q.type === 'weapon') return G.padList.find(p => p.id === 'forge');
    if (q.type === 'castle') return G.padList.find(p => p.id === 'castle');
    // Wirtschaftsquests zeigen auf das erste Gebäude dieser Art (oder nichts,
    // wenn noch keines steht — dann führt der Bau-Knopf weiter)
    if (q.type === 'place') return (G.state.placed || []).find(p => p.type === q.bt) || null;
    if (q.type === 'res') {
      return G.padList.find(p => CFG.BUILDINGS[p.type] && CFG.BUILDINGS[p.type].kind === 'store') || null;
    }
    return null;
  }

  function updateQuests(G) {
    const st = G.state;
    const q = activeQuest(G);
    if (!q) return;
    // Kapitelwechsel anzeigen?
    if (q.ch > st.chapterShown) {
      st.chapterShown = q.ch;
      KS.UI.showChapter(q.ch);
      KS.Game.log(`Kapitel ${q.ch + 1}: ${CFG.CHAPTERS[q.ch].title}`);
      KS.Game.requestSave();
    }
    const [cur, max] = questProgress(G, q);
    if (cur >= max) {
      // Abgeschlossen!
      const pl = st.player;
      st.gold += q.reward;
      st.goldCollected += q.reward;
      KS.Audio.SFX.quest();
      KS.UI.questComplete(q);
      Ent.text(G, pl.x, pl.y - 60, `+${U.fmt(q.reward)} Gold`, { color: '#ffe084', size: 19, crit: true, life: 1.3, up: 66 });
      Ent.burst(G, pl.x, pl.y - 20, 12, { colors: ['#ffe084', '#fff'], speed: 90, up: 110 });
      KS.Game.log(`Quest geschafft: ${q.text} (+${U.fmt(q.reward)} Gold)`);
      if (q.unlock) for (const pid of q.unlock) unlockPad(G, pid);
      if (q.victory && !st.victoryShown) {
        st.victoryShown = true;
        KS.UI.showVictory();
      }
      if (st.questIdx < CFG.QUESTS.length) st.questIdx += 1;
      else st.endlessIdx += 1;
      const nq = activeQuest(G);
      st.questBase = questBaseline(G, nq);
      KS.Game.requestSave();
    }
  }

  return {
    PAD_R,
    rebuildDerived, isUnlocked, unlockPad,
    updateDeposit, updateDepositFx, completeBuild,
    updateBuildings, updateDirector,
    startDay, startNight, generateNightPlan, spawnBoss, onBossKilled,
    tavernCapacity, dawnArrivals, onSurvivorArrived, syncVillagers,
    activeQuest, questProgress, questBaseline, questTargetPad, updateQuests,
    wallSegAt, wallSegArc, wallSegCenter, damageWall, repairWallAtDawn, restoreDefences,
    // Wirtschaft
    storeTotal, storeFree, storeAdd, storeTake, nearestStore,
    updateWorkers, updateCrafters, updateHaulers, syncWorkers,
    // Freies Bauen
    placeableTypes, placeProblem, placeCost, placeBuilding, demolish, refundOf,
    // Techtree
    hasTech, techNode, techState, techAffordable, buyTech,
    gateAt, gateCenter, gateBlocks, damageGate,
    nearestPad, padMaxed, toggleBuild, safeSpawnPoint,
    marketLvl, marketCost, buyMarket,
  };
})();
