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
  function rebuildDerived(G) {
    const st = G.state;
    G.padList = CFG.PADS;
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
    G.magnetMul = 1 + 0.10 * mk('magnet');
    G.critCh = 0.12 + 0.02 * mk('crit');
    G.goldMul = 1 + 0.04 * mk('gold');
    G.armorMul = Math.max(0.55, 1 - 0.02 * mk('armor'));
    // Stadtmauer
    const wallB = st.buildings.wall;
    G.wallMax = wallB && wallB.tier >= 1 ? CFG.BUILDINGS.wall.segHp(wallB.tier) : 0;
    if (G.wallMax > 0) {
      if (!st.wall || !Array.isArray(st.wall.hp) || st.wall.hp.length !== CFG.WALL.segs) {
        st.wall = { hp: Array.from({ length: CFG.WALL.segs }, () => G.wallMax) };
      } else {
        for (let i = 0; i < st.wall.hp.length; i++) st.wall.hp[i] = Math.min(st.wall.hp[i], G.wallMax);
      }
    }
    // Stadttore (verschließen die acht Durchgänge)
    const gateB = st.buildings.gates;
    G.gateMax = gateB && gateB.tier >= 1 ? CFG.BUILDINGS.gates.gateHp(gateB.tier) : 0;
    if (G.gateMax > 0) {
      if (!st.gates || !Array.isArray(st.gates.hp) || st.gates.hp.length !== CFG.GATES.length) {
        st.gates = { hp: Array.from({ length: CFG.GATES.length }, () => G.gateMax) };
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
        G.towers.push({
          pad, type: pad.type, tier: b.tier,
          stats: CFG.towerStats(pad.type, b.tier),
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

  function repairWallAtDawn(G) {
    const st = G.state;
    let broken = repairGatesAtDawn(G);
    if (!st.wall || G.wallMax <= 0) {
      if (broken > 0) KS.UI.toast('Die Überlebenden haben die Tore über Nacht wieder eingesetzt.', 3400, 'hammer');
      return;
    }
    for (let i = 0; i < st.wall.hp.length; i++) {
      if (st.wall.hp[i] < G.wallMax) {
        if (st.wall.hp[i] <= 0) broken++;
        st.wall.hp[i] = G.wallMax;
      }
    }
    if (broken > 0) {
      KS.UI.toast('Die Überlebenden haben Mauer und Tore über Nacht repariert.', 3400, 'hammer');
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

  // Bauen bestätigen / abbrechen (vom Knopf oder der Tastatur)
  function toggleBuild(G) {
    const pad = G.nearPad;
    if (!pad) return false;
    if (G.buildArmed === pad.id) {          // schon aktiv → anhalten
      G.buildArmed = null;
      G.depositT = 0; G.depositAcc = 0;
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
    const rate = U.lerp(D.startRate, D.maxRate, Math.min(1, G.depositT / D.rampTime));
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
    // Bestätigung verfällt: die nächste Stufe startet erst auf erneuten Wunsch,
    // damit nicht unbemerkt das ganze Gold in Folge-Stufen wandert.
    G.buildArmed = null;
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
      const w = CFG.WEAPONS[G.weaponTier - 1];
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

  // ============ GEBÄUDE-LOGIK ============
  function updateBuildings(G, dt) {
    const st = G.state;
    // Türme
    for (const t of G.towers) {
      if (t.flash > 0) t.flash -= dt;
      t.cd -= dt;
      if (t.cd > 0) continue;
      const s = t.stats;
      G.grid.query(t.pad.x, t.pad.y, s.range + 40, G.qbuf);
      let target = null, bestD = Infinity;
      for (const m of G.qbuf) {
        if (m.dead) continue;
        const d = U.dist(t.pad.x, t.pad.y, m.x, m.y);
        if (d - m.r <= s.range && d < bestD) { bestD = d; target = m; }
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
      if (pad.type === 'mine') amount = def.income(b.tier);
      else {
        const tv = taverns.find(t => t.pad.id === pad.id);
        amount = tv && tv.housed > 0 ? def.income(b.tier) * tv.housed : 0;
      }
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
    const n = U.clamp(1 + Math.floor(free / 5), 1, 3);
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
    }
    return [0, 1];
  }

  function questBaseline(G, q) {
    const st = G.state;
    if (!q) return 0;
    if (q.type === 'kill') return st.killsByClass[q.cls] || 0;
    if (q.type === 'kill_any') return st.stats.kills;
    if (q.type === 'gold_collect') return st.goldCollected;
    return 0;
  }

  function questTargetPad(G, q) {
    if (!q) return null;
    if (q.type === 'build') return G.padList.find(p => p.id === q.pad);
    if (q.type === 'weapon') return G.padList.find(p => p.id === 'forge');
    if (q.type === 'castle') return G.padList.find(p => p.id === 'castle');
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
    wallSegAt, wallSegArc, wallSegCenter, damageWall, repairWallAtDawn,
    gateAt, gateCenter, gateBlocks, damageGate,
    nearestPad, padMaxed, toggleBuild,
    marketLvl, marketCost, buyMarket,
  };
})();
