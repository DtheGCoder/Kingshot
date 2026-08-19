/* ============================================================
   KINGSHOT — entities.js
   Spieler, Monster (KI), Münzen (Magnet!), Projektile, Partikel,
   schwebende Texte, Dorfbewohner.
   ============================================================ */
'use strict';

KS.Ent = (() => {
  const U = KS.U, CFG = KS.CFG;
  const TAU = Math.PI * 2;

  // ============ PARTIKEL & EFFEKTE ============
  function particle(G, x, y, opts = {}) {
    if (G.particles.length > 650) return;
    G.particles.push({
      x, y, z: opts.z || 0,
      vx: opts.vx || 0, vy: opts.vy || 0, vz: opts.vz || 0,
      grav: opts.grav !== undefined ? opts.grav : 300,
      t: 0, life: opts.life || 0.6,
      size: opts.size || 3, endSize: opts.endSize !== undefined ? opts.endSize : 0,
      color: opts.color || '#fff',
      fade: opts.fade !== undefined ? opts.fade : true,
      layer: opts.layer || 'above',   // 'below' = Staub unter Einheiten
    });
  }
  function burst(G, x, y, n, opts = {}) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, sp = (opts.speed || 90) * (0.4 + Math.random() * 0.8);
      particle(G, x, y, {
        ...opts,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6,
        vz: (opts.up || 60) * (0.5 + Math.random()),
        z: opts.z || 6,
        life: (opts.life || 0.6) * (0.6 + Math.random() * 0.7),
        size: (opts.size || 3) * (0.6 + Math.random() * 0.8),
        color: Array.isArray(opts.colors) ? U.pick(opts.colors) : (opts.color || '#fff'),
      });
    }
  }
  function ring(G, x, y, opts = {}) {
    G.rings.push({ x, y, t: 0, life: opts.life || 0.45, r0: opts.r0 || 8, r1: opts.r1 || 60, color: opts.color || 'rgba(255,220,120,0.9)', lw: opts.lw || 3 });
  }
  function text(G, x, y, str, opts = {}) {
    if (G.texts.length > 60) G.texts.shift();
    G.texts.push({ x: x + U.rand(-6, 6), y, str, t: 0, life: opts.life || 0.85, color: opts.color || '#fff', size: opts.size || 15, up: opts.up !== undefined ? opts.up : 46, crit: opts.crit });
  }

  function updateFx(G, dt) {
    const P = G.particles;
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i];
      p.t += dt;
      if (p.t >= p.life) { P.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.z += p.vz * dt; p.vz -= p.grav * dt;
      if (p.z < 0) { p.z = 0; p.vz *= -0.4; p.vx *= 0.7; p.vy *= 0.7; }
    }
    for (let i = G.rings.length - 1; i >= 0; i--) {
      const r = G.rings[i]; r.t += dt;
      if (r.t >= r.life) G.rings.splice(i, 1);
    }
    for (let i = G.texts.length - 1; i >= 0; i--) {
      const t = G.texts[i]; t.t += dt;
      if (t.t >= t.life) G.texts.splice(i, 1);
    }
    for (let i = G.zaps.length - 1; i >= 0; i--) {
      const z = G.zaps[i]; z.t += dt;
      if (z.t > 0.14) G.zaps.splice(i, 1);
    }
  }

  function drawParticles(G, ctx, layer) {
    const P = G.particles;
    for (let i = 0; i < P.length; i++) {
      const p = P[i];
      if (p.layer !== layer) continue;
      const k = p.t / p.life;
      ctx.globalAlpha = p.fade ? 1 - k : 1;
      const s = U.lerp(p.size, p.endSize, k);
      if (s <= 0.2) continue;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y - p.z, s, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  function drawRings(G, ctx) {
    for (const r of G.rings) {
      const k = r.t / r.life;
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.lw * (1 - k * 0.5);
      ctx.beginPath();
      ctx.arc(r.x, r.y, U.lerp(r.r0, r.r1, U.easeOutCubic(k)), 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  function drawTexts(G, ctx) {
    for (const t of G.texts) {
      const k = t.t / t.life;
      const scale = t.crit ? (1 + (1 - Math.min(1, t.t * 5)) * 0.7) : 1;
      ctx.globalAlpha = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
      ctx.font = `900 ${Math.round(t.size * scale)}px Nunito, sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 3.4; ctx.strokeStyle = 'rgba(30,20,15,0.85)';
      const y = t.y - U.easeOutCubic(k) * t.up;
      ctx.strokeText(t.str, t.x, y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, t.x, y);
    }
    ctx.globalAlpha = 1;
  }
  function drawZaps(G, ctx) {
    for (const z of G.zaps) {
      const a = 1 - z.t / 0.14;
      ctx.globalAlpha = a;
      ctx.strokeStyle = '#e8d8ff'; ctx.lineWidth = 3.6;
      ctx.beginPath();
      for (let i = 0; i < z.pts.length; i++) {
        const p = z.pts[i];
        i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]);
      }
      ctx.stroke();
      ctx.strokeStyle = '#a86ee8'; ctx.lineWidth = 7;
      ctx.globalAlpha = a * 0.4;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // ============ MÜNZEN ============
  const COIN_KIND = v => v >= 100 ? 3 : v >= 25 ? 2 : v >= 5 ? 1 : 0;

  function spawnCoin(G, x, y, value, opts = {}) {
    const a = Math.random() * TAU;
    const sp = opts.speed !== undefined ? opts.speed : U.rand(40, 130);
    G.coins.push({
      x, y, value,
      kind: COIN_KIND(value),
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6,
      z: opts.z || 10, vz: U.rand(120, 230),
      state: 'fly', t: Math.random() * 10,
      spin: U.rand(3, 5),
    });
  }

  // Wert hübsch in Münz-Stückelungen zerlegen
  function spawnCoinBurst(G, x, y, value) {
    let v = Math.max(1, Math.round(value));
    const drops = [];
    while (v >= 100 && drops.length < 3) { drops.push(100); v -= 100; }
    while (v >= 25 && drops.length < 8) { drops.push(25); v -= 25; }
    while (v >= 5 && drops.length < 16) { drops.push(5); v -= 5; }
    while (v > 0 && drops.length < 22) { drops.push(1); v -= 1; }
    if (v > 0 && drops.length) drops[drops.length - 1] += v;
    for (const d of drops) spawnCoin(G, x + U.rand(-6, 6), y + U.rand(-6, 6), d);
  }

  function updateCoins(G, dt) {
    const C = G.coins, pl = G.state.player;
    const iv = KS.Input.vector();
    const magnet = (iv[0] !== 0 || iv[1] !== 0 ? CFG.PLAYER.magnetRMoving : CFG.PLAYER.magnetR) * (G.magnetMul || 1);
    const mag2 = magnet * magnet;
    for (let i = C.length - 1; i >= 0; i--) {
      const c = C[i];
      c.t += dt;
      // Magnet greift SOFORT — auch während die Münze noch fliegt/hüpft
      if (c.state !== 'magnet' && !G.playerDown && U.dist2(c.x, c.y, pl.x, pl.y) < mag2) {
        c.state = 'magnet';
      }
      if (c.state === 'fly') {
        c.x += c.vx * dt; c.y += c.vy * dt;
        c.z += c.vz * dt; c.vz -= 620 * dt;
        if (c.z <= 0) {
          c.z = 0;
          if (Math.abs(c.vz) > 40) { c.vz = -c.vz * 0.45; }
          else { c.state = 'idle'; c.vx = c.vy = c.vz = 0; }
          c.vx *= 0.6; c.vy *= 0.6;
        }
      } else if (c.state === 'idle') {
        if (Math.random() < dt * 0.5) {
          particle(G, c.x + U.rand(-4, 4), c.y - c.z - U.rand(2, 8), { vz: 10, grav: 0, life: 0.4, size: 1.6, color: '#fff8d0' });
        }
      } else { // magnet
        const dx = pl.x - c.x, dy = (pl.y - 14) - c.y + c.z * 0;
        const d = Math.hypot(dx, dy) || 1;
        const sp = CFG.COINS.magnetSpeed * (1.35 - Math.min(1, d / magnet) * 0.55);
        c.x += dx / d * sp * dt;
        c.y += dy / d * sp * dt;
        c.z = Math.max(0, c.z - 120 * dt);
        if (d < 22) {
          C.splice(i, 1);
          G.state.gold += c.value;
          G.state.goldCollected += c.value;
          G.state.stats.coins++;
          KS.Audio.SFX.coin();
          KS.UI.bumpGold();
          if (c.value >= 5) text(G, pl.x, pl.y - 46, '+' + c.value, { color: '#ffe084', size: c.value >= 25 ? 17 : 14 });
          particle(G, pl.x, pl.y - 20, { vz: 40, grav: 60, life: 0.3, size: 2.4, color: '#fff3c0' });
          continue;
        }
      }
    }
    // Zu viele Münzen? Älteste kleine zu Beuteln zusammenfassen
    if (C.length > CFG.COINS.maxOnGround) {
      let sum = 0, cx = 0, cy = 0, n = 0;
      for (let i = 0; i < C.length && n < 30; i++) {
        if (C[i].state === 'idle' && C[i].kind <= 1) {
          sum += C[i].value; cx += C[i].x; cy += C[i].y; n++;
          C.splice(i, 1); i--;
        }
      }
      if (n > 0) {
        const c = { x: cx / n, y: cy / n, value: sum, kind: 2, vx: 0, vy: 0, z: 0, vz: 0, state: 'idle', t: 0, spin: 4 };
        C.push(c);
        ring(G, c.x, c.y, { r0: 4, r1: 30, color: 'rgba(255,220,120,0.7)' });
      }
    }
  }

  function drawCoin(ctx, c, time) {
    // Schatten
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#1c2814';
    ctx.beginPath();
    const shr = (c.kind >= 2 ? 10 : c.kind === 1 ? 7 : 5) * (1 - Math.min(0.5, c.z / 60));
    ctx.ellipse(c.x, c.y, shr, shr * 0.4, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
    const spr = KS.Art.coin(c.kind);
    let sx = 1;
    if (c.kind <= 1) sx = 0.35 + Math.abs(Math.sin(c.t * c.spin)) * 0.65;  // Dreh-Glitzern
    KS.Art.draw(ctx, spr, c.x, c.y - c.z, 1, 1, false);
    if (c.kind <= 1 && sx < 0.55) {
      // Funkeln beim Drehen
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(c.x + 2, c.y - c.z - (c.kind === 1 ? 10 : 7), 1.6, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // ============ SCHADEN ============
  function damageMonster(G, m, dmg, opts = {}) {
    if (m.dead) return;
    m.hp -= dmg;
    m.hitT = 0.12;
    if (opts.kb) {
      const d = Math.hypot(opts.kbx, opts.kby) || 1;
      m.kx += opts.kbx / d * opts.kb / (m.boss ? 6 : 1);
      m.ky += opts.kby / d * opts.kb / (m.boss ? 6 : 1);
    }
    if (opts.slow) { m.slowT = Math.max(m.slowT, opts.slowDur || 1.5); m.slowF = opts.slow; }
    if (opts.burn) { m.burnT = Math.max(m.burnT, opts.burnDur || 2); m.burnDps = opts.burn; }
    const crit = opts.crit;
    text(G, m.x, m.y - m.r * 2.4 - (m.boss ? 30 : 0), U.fmt(Math.round(dmg)), {
      color: crit ? '#ffd34e' : (opts.color || '#fff'),
      size: crit ? 19 : 13.5, crit,
    });
    if (m.hp <= 0) killMonster(G, m, opts);
  }

  function killMonster(G, m, opts = {}) {
    m.dead = true;
    G.state.stats.kills++;
    G.state.killsByClass[m.cls] = (G.state.killsByClass[m.cls] || 0) + 1;
    G.killsThisFrame++;
    // Kleiner Lebensraub für den König
    const pl = G.state.player;
    if (!G.playerDown && pl.hp < G.playerHpMax) {
      pl.hp = Math.min(G.playerHpMax, pl.hp + G.playerHpMax * 0.02);
    }
    // Markt-Bonus: mehr Gold von Monstern
    m.gold *= (G.goldMul || 1);
    // Gold
    const gold = Math.round(m.gold * (m.elite ? 2.5 : 1));
    if (m.boss) {
      // Truhe + Regen aus Münzen
      spawnCoin(G, m.x, m.y, Math.round(gold * 0.5), { speed: 20 });
      spawnCoinBurst(G, m.x, m.y, Math.round(gold * 0.5));
      KS.Audio.SFX.bossDie();
      G.shake = Math.max(G.shake, 14);
      ring(G, m.x, m.y, { r0: 20, r1: 180, life: 0.7, color: 'rgba(255,220,120,0.9)', lw: 6 });
      KS.Systems.onBossKilled(G, m);
    } else {
      spawnCoinBurst(G, m.x, m.y, gold);
      KS.Audio.SFX.monsterDie();
    }
    G.state.stats.goldEarned += gold;
    burst(G, m.x, m.y - m.r, Math.min(26, 8 + m.r * 0.5), {
      colors: [m.sp.c1, m.sp.c2, '#fff'],
      speed: 120, up: 120, size: m.boss ? 6 : 4, life: 0.7,
    });
    ring(G, m.x, m.y, { r0: 4, r1: m.r * 3, color: 'rgba(255,255,255,0.5)' });
  }

  function damagePlayer(G, dmg, fromX, fromY) {
    const pl = G.state.player;
    if (G.playerDown || G.playerInvuln > 0) return;
    dmg *= (G.armorMul || 1);
    pl.hp -= dmg;
    G.playerHurtT = 0.25;
    G.regenWait = CFG.PLAYER.regenDelay;
    KS.Audio.SFX.playerHurt();
    G.shake = Math.max(G.shake, 5);
    if (fromX !== undefined) {
      const d = U.dist(fromX, fromY, pl.x, pl.y) || 1;
      G.playerKx += (pl.x - fromX) / d * 130;
      G.playerKy += (pl.y - fromY) / d * 130;
    }
    text(G, pl.x, pl.y - 56, '-' + Math.round(dmg), { color: '#ff8f8f', size: 15 });
    if (pl.hp <= 0) {
      pl.hp = 0;
      G.playerDown = true;
      G.playerDownT = 0;
      burst(G, pl.x, pl.y - 16, 16, { colors: ['#d64545', '#4a6ea8', '#f0c8a0'], speed: 100, up: 120 });
      KS.UI.toast('Der König ist gestürzt! Er rappelt sich auf…', 3400, 'crown');
    }
  }

  function damageBase(G, dmg) {
    G.state.baseHp -= dmg;
    G.baseFlash = 1;
    G.shake = Math.max(G.shake, 3);
    if (G.baseHitSfxT <= 0) { KS.Audio.SFX.baseHit(); G.baseHitSfxT = 0.25; }
    if (G.state.baseHp <= 0) {
      G.state.baseHp = 0;
      KS.Game.onDefeat();
    }
  }

  // ============ SPIELER ============
  function updatePlayer(G, dt) {
    const pl = G.state.player;
    const st = G.state;

    if (G.playerInvuln > 0) G.playerInvuln -= dt;
    if (G.baseHitSfxT > 0) G.baseHitSfxT -= dt;

    if (G.playerDown) {
      G.playerDownT += dt;
      if (G.playerDownT >= CFG.PLAYER.reviveTime) {
        G.playerDown = false;
        pl.hp = G.playerHpMax;
        // Abseits jedes Bauplatzes aufstehen (sonst zahlt man sofort weiter ein)
        const sp = KS.Systems.safeSpawnPoint();
        pl.x = sp.x; pl.y = sp.y;
        G.buildArmed = null; G.buildLock = null; G.nearPad = null;
        G.playerInvuln = 2.5;
        ring(G, pl.x, pl.y, { r0: 10, r1: 70, color: 'rgba(140,220,255,0.9)' });
        burst(G, pl.x, pl.y - 20, 14, { colors: ['#9adcf2', '#fff'], speed: 80, up: 90 });
      }
      return;
    }

    // Bewegung
    const [ix, iy] = KS.Input.vector();
    const spd = G.playerSpeed || CFG.PLAYER.speed;
    let vx = ix * spd, vy = iy * spd;
    // Rückstoß
    vx += G.playerKx; vy += G.playerKy;
    G.playerKx *= Math.pow(0.0001, dt); G.playerKy *= Math.pow(0.0001, dt);
    pl.x += vx * dt; pl.y += vy * dt;
    // Weltgrenzen
    pl.x = U.clamp(pl.x, 30, CFG.WORLD.w - 30);
    pl.y = U.clamp(pl.y, 40, CFG.WORLD.h - 16);
    // Kollision mit Gebäuden (weich herausschieben)
    for (const pad of G.padList) {
      const b = st.buildings[pad.id];
      if (!b || b.tier < 1) continue;
      const cr = pad.type === 'castle' ? 95 : pad.type === 'wall' ? 24 : 34;
      const dx = pl.x - pad.x, dy = pl.y - (pad.y - 6);
      const d2 = dx * dx + dy * dy;
      if (d2 < cr * cr && d2 > 0.01) {
        const d = Math.sqrt(d2);
        pl.x = pad.x + dx / d * cr;
        pl.y = pad.y - 6 + dy / d * cr;
      }
    }

    const moving = Math.abs(ix) > 0.01 || Math.abs(iy) > 0.01;
    if (moving) {
      G.playerAnimT += dt * (0.6 + Math.hypot(ix, iy));
      if (ix < -0.05) G.playerFace = -1; else if (ix > 0.05) G.playerFace = 1;
      if (Math.random() < dt * 6) {
        particle(G, pl.x - G.playerFace * 8, pl.y - 1, { vz: 16, grav: 40, life: 0.4, size: 2.6, endSize: 0.5, color: 'rgba(180,160,120,0.5)', layer: 'below' });
      }
    } else {
      G.playerAnimT = 0;
    }

    // Regeneration
    if (G.regenWait > 0) G.regenWait -= dt;
    else if (pl.hp < G.playerHpMax) {
      pl.hp = Math.min(G.playerHpMax, pl.hp + G.playerHpMax * CFG.PLAYER.regenRate * dt);
    }

    // Auto-Angriff
    G.attackCd -= dt;
    if (G.swing) {
      G.swing.t += dt;
      if (G.swing.t >= G.swing.dur) G.swing = null;
    }
    const w = CFG.WEAPONS[G.weaponTier - 1];
    if (G.attackCd <= 0) {
      // Nächstes Monster in Reichweite suchen
      let best = null, bestD = Infinity;
      const R = w.range + 30;
      G.grid.query(pl.x, pl.y, R + 40, G.qbuf);
      for (const m of G.qbuf) {
        if (m.dead) continue;
        const d = U.dist(pl.x, pl.y, m.x, m.y) - m.r;
        if (d < bestD) { bestD = d; best = m; }
      }
      if (best && bestD <= w.range) {
        const dir = U.angleTo(pl.x, pl.y, best.x, best.y);
        G.playerFace = Math.cos(dir) < 0 ? -1 : 1;
        G.swing = { t: 0, dur: 0.22, dir };
        G.attackCd = 1 / w.rate;
        KS.Audio.SFX.swing();
        // Schaden im Bogen
        const arc = 1.5;
        G.grid.query(pl.x, pl.y, w.range + 40, G.qbuf);
        let hits = 0;
        for (const m of G.qbuf) {
          if (m.dead) continue;
          const d = U.dist(pl.x, pl.y, m.x, m.y) - m.r;
          if (d > w.range) continue;
          const a = U.angleTo(pl.x, pl.y, m.x, m.y);
          let da = Math.abs(a - dir);
          if (da > Math.PI) da = TAU - da;
          if (da > arc) continue;
          const crit = Math.random() < (G.critCh || 0.12);
          damageMonster(G, m, w.dmg * (crit ? 2 : 1), { kb: 130, kbx: m.x - pl.x, kby: m.y - pl.y, crit });
          hits++;
        }
        if (hits) KS.Audio.SFX.hit();
        // Klingenwelle
        if (w.beam > 0) {
          G.projectiles.push({
            kind: 'beam', x: pl.x, y: pl.y - 16,
            vx: Math.cos(dir) * 420, vy: Math.sin(dir) * 420,
            t: 0, ttl: 0.55, dmg: w.dmg * w.beam, side: 'ally',
            pierce: true, hitSet: new Set(), dir, color: w.glow || '#cfe0ff',
          });
        }
      }
    }
  }

  function drawPlayer(G, ctx) {
    const pl = G.state.player;
    if (G.playerDown) {
      // Am Boden, Sterne kreisen
      const spr = KS.Art.king(0);
      ctx.save();
      ctx.translate(pl.x, pl.y);
      ctx.rotate(-Math.PI / 2 * 0.9);
      ctx.globalAlpha = 0.9;
      ctx.drawImage(spr.c, -spr.ax, -spr.ay + 10, spr.w, spr.h);
      ctx.restore();
      for (let i = 0; i < 3; i++) {
        const a = G.time * 4 + i * TAU / 3;
        ctx.fillStyle = '#ffe084';
        ctx.beginPath();
        ctx.arc(pl.x + Math.cos(a) * 16, pl.y - 34 + Math.sin(a) * 5, 2.2, 0, TAU);
        ctx.fill();
      }
      return;
    }
    const frame = G.playerAnimT === 0 ? 0 : (Math.floor(G.playerAnimT * 7) % 2 ? 1 : 2);
    const bob = G.playerAnimT === 0 ? Math.sin(G.time * 2.4) * 1 : 0;
    if (G.playerInvuln > 0 && Math.floor(G.time * 14) % 2) ctx.globalAlpha = 0.45;
    if (G.playerHurtT > 0) { ctx.globalAlpha = 0.85; }
    // Schatten
    ctx.globalAlpha *= 0.3;
    ctx.fillStyle = '#1c2814';
    ctx.beginPath(); ctx.ellipse(pl.x, pl.y, 13, 5, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = G.playerInvuln > 0 && Math.floor(G.time * 14) % 2 ? 0.45 : 1;

    const spr = KS.Art.king(frame);
    // Schwert hinter dem Körper, wenn nach links geschwungen
    const w = CFG.WEAPONS[G.weaponTier - 1];
    const sw = KS.Art.sword(G.weaponTier);
    let swingA;
    if (G.swing) {
      const k = G.swing.t / G.swing.dur;
      const rel = U.lerp(-2.4, 1.1, U.easeOutCubic(k));
      swingA = G.swing.dir + Math.PI / 2 + rel * (G.playerFace === -1 ? 1 : 1);
      // Schwung-Trail
      const trailA = G.swing.dir + Math.PI / 2 + U.lerp(-2.4, 1.1, U.easeOutCubic(Math.max(0, k - 0.18)));
      ctx.save();
      ctx.translate(pl.x + G.playerFace * 4, pl.y - 20 + bob);
      ctx.globalAlpha = 0.35 * (1 - k);
      ctx.fillStyle = w.glow || '#e8f0ff';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, w.range * 0.82, swingA - Math.PI / 2, trailA - Math.PI / 2, swingA < trailA);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    } else {
      swingA = G.playerFace === 1 ? 0.65 : -0.65 + 0;
      swingA = 0.65 * G.playerFace + Math.sin(G.time * 2.4) * 0.05;
    }
    // Körper
    KS.Art.draw(ctx, spr, pl.x, pl.y + bob, 1, 1, G.playerFace === -1);
    // Schwertarm
    ctx.save();
    ctx.translate(pl.x + G.playerFace * 4, pl.y - 20 + bob);
    ctx.rotate(swingA);
    ctx.drawImage(sw.c, -sw.ax, -sw.ay, sw.w, sw.h);
    // Hand
    ctx.fillStyle = '#f0c8a0';
    ctx.beginPath(); ctx.arc(0, 0, 3.2, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(38,26,20,0.75)'; ctx.lineWidth = 1.4; ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = 1;
    // Heil-Aura-Anzeige
    if (G.shrineGlow > 0) {
      ctx.globalAlpha = Math.min(0.5, G.shrineGlow) * (0.6 + Math.sin(G.time * 5) * 0.2);
      ctx.fillStyle = '#d0ffd8';
      for (let i = 0; i < 2; i++) {
        const a = G.time * 2 + i * Math.PI;
        ctx.beginPath();
        ctx.arc(pl.x + Math.cos(a) * 14, pl.y - 24 + Math.sin(G.time * 3 + i) * 8, 1.8, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  // ============ MONSTER ============
  function makeMonster(G, spKey, x, y, opts = {}) {
    const sp = CFG.MONSTERS[spKey];
    const day = G.state.day;
    const hpM = CFG.SCALE.hpMul(day) * (opts.hpMul || 1) * (opts.elite ? 3 : 1);
    const dmgM = CFG.SCALE.dmgMul(day) * (opts.dmgMul || 1) * (opts.elite ? 1.8 : 1);
    const goldM = CFG.SCALE.goldMul(day) * (opts.elite ? 1 : 1);
    const size = (opts.size || 1) * CFG.SCALE.sizeMul(day) * (opts.elite ? 1.28 : 1);
    const hpTotal = opts.hpOverride !== undefined ? opts.hpOverride : sp.hp * hpM;
    const m = {
      key: spKey, sp, cls: sp.cls,
      x, y, r: sp.r * size * (sp.big || 1),
      hp: hpTotal, hpMax: hpTotal,
      dmg: sp.dmg * dmgM,
      speed: (opts.speed || sp.speed) * U.rand(0.92, 1.08),
      gold: opts.gold !== undefined ? opts.gold * goldM : sp.gold * goldM,
      size, elite: !!opts.elite, boss: !!opts.boss, bossId: opts.bossId, name: opts.name,
      kx: 0, ky: 0, slowT: 0, slowF: 0, burnT: 0, burnDps: 0, hitT: 0,
      animT: Math.random() * 10, attackCd: U.rand(0.3, 1),
      rangedCd: U.rand(0.5, 1.5), lunge: 0, face: 1,
      state: 'march', dead: false,
      fly: sp.fly, venom: sp.venom,
    };
    G.monsters.push(m);
    return m;
  }

  function updateMonsters(G, dt) {
    const pl = G.state.player;
    const M = G.monsters;
    const { cx, cy, baseRadius } = CFG.WORLD;

    for (let i = M.length - 1; i >= 0; i--) {
      const m = M[i];
      if (m.dead) { M.splice(i, 1); continue; }
      m.animT += dt * (m.slowT > 0 ? 0.6 : 1);
      if (m.hitT > 0) m.hitT -= dt;
      if (m.lunge > 0) m.lunge -= dt * 4;
      // Status
      let speedF = 1;
      if (m.slowT > 0) { m.slowT -= dt; speedF = 1 - m.slowF; }
      if (m.burnT > 0) {
        m.burnT -= dt;
        m.hp -= m.burnDps * dt;
        if (Math.random() < dt * 8) particle(G, m.x + U.rand(-m.r, m.r) * 0.6, m.y - m.r - U.rand(0, m.r), { vz: 40, grav: -30, life: 0.5, size: 3, endSize: 0.5, color: U.pick(['#ff9d2e', '#ffd34e', '#e5484d']) });
        if (m.hp <= 0) { killMonster(G, m); M.splice(i, 1); continue; }
      }

      // Flucht bei Tagesanbruch
      if (m.state === 'flee') {
        const a = U.angleTo(cx, cy, m.x, m.y);
        m.x += Math.cos(a) * m.speed * 1.6 * dt;
        m.y += Math.sin(a) * m.speed * 1.6 * dt;
        m.face = Math.cos(a) < 0 ? -1 : 1;
        if (U.dist2(m.x, m.y, cx, cy) > 1300 * 1300) { M.splice(i, 1); continue; }
        m.x += m.kx * dt; m.y += m.ky * dt;
        m.kx *= Math.pow(0.001, dt); m.ky *= Math.pow(0.001, dt);
        continue;
      }

      // Ziel bestimmen
      const distPl2 = G.playerDown ? Infinity : U.dist2(m.x, m.y, pl.x, pl.y);
      const aggro = CFG.PLAYER.aggroR * (m.boss ? 1.4 : 1);
      let tx = cx, ty = cy, targetPlayer = false, stopDist = baseRadius + m.r;
      if (distPl2 < aggro * aggro * (m.state === 'chase' ? 2.6 : 1)) {
        targetPlayer = true; m.state = 'chase';
        tx = pl.x; ty = pl.y; stopDist = CFG.PLAYER.r + m.r - 2;
      } else if (m.state === 'chase') m.state = 'march';

      // Stadtmauer & Tore: blockieren Bodenmonster auf dem Weg nach innen
      let wallSeg = -1, gateIdx = -1;
      if (!m.fly && (G.wallMax > 0 || G.gateMax > 0)) {
        const wR = CFG.WALL.r;
        const dC = Math.sqrt(U.dist2(m.x, m.y, cx, cy));
        if (dC > wR - 6) {
          const targetInside = !targetPlayer || U.dist2(tx, ty, cx, cy) < wR * wR;
          if (targetInside) {
            const ang = Math.atan2(m.y - cy, m.x - cx);
            const seg = G.wallMax > 0 && G.state.wall ? KS.Systems.wallSegAt(ang) : -1;
            if (seg >= 0 && G.state.wall.hp[seg] > 0) {
              wallSeg = seg;
              tx = cx + Math.cos(ang) * wR;
              ty = cy + Math.sin(ang) * wR;
              stopDist = m.r + 10;
              targetPlayer = false;
            } else if (seg < 0) {
              // Toröffnung — steht dort ein intaktes Tor, muss es fallen
              const gi = KS.Systems.gateAt(ang);
              if (KS.Systems.gateBlocks(G, gi)) {
                gateIdx = gi;
                tx = cx + Math.cos(ang) * wR;
                ty = cy + Math.sin(ang) * wR;
                stopDist = m.r + 10;
                targetPlayer = false;
              }
            }
          }
        }
      }

      // Fernkampf (nicht gegen Mauer/Tor — die werden im Nahkampf zerlegt)
      if (m.sp.ranged && wallSeg < 0 && gateIdx < 0) {
        const rr = m.sp.ranged.range;
        const distT = Math.sqrt(targetPlayer ? distPl2 : U.dist2(m.x, m.y, cx, cy)) - (targetPlayer ? 0 : baseRadius);
        m.rangedCd -= dt;
        if (distT <= rr) {
          // stehen bleiben & schießen
          if (m.rangedCd <= 0) {
            m.rangedCd = 1 / m.sp.ranged.rate;
            m.lunge = 1;
            const a = U.angleTo(m.x, m.y, tx, ty);
            m.face = Math.cos(a) < 0 ? -1 : 1;
            G.projectiles.push({
              kind: m.sp.ranged.proj, x: m.x, y: m.y - m.r,
              vx: Math.cos(a) * 260, vy: Math.sin(a) * 260,
              t: 0, ttl: rr / 260 + 0.4, dmg: m.dmg, side: 'enemy',
              targetPlayer,
            });
            KS.Audio.SFX.arrow();
          }
          m.x += m.kx * dt; m.y += m.ky * dt;
          m.kx *= Math.pow(0.001, dt); m.ky *= Math.pow(0.001, dt);
          continue;
        }
      }

      const a = U.angleTo(m.x, m.y, tx, ty);
      const distT = targetPlayer ? Math.sqrt(distPl2)
        : (wallSeg >= 0 || gateIdx >= 0 ? U.dist(m.x, m.y, tx, ty) : Math.sqrt(U.dist2(m.x, m.y, cx, cy)));
      if (distT > stopDist + 2) {
        const sp = m.speed * speedF;
        m.x += Math.cos(a) * sp * dt;
        m.y += Math.sin(a) * sp * dt;
        m.face = Math.cos(a) < 0 ? -1 : 1;
      } else {
        // Angriff
        m.attackCd -= dt;
        if (m.attackCd <= 0) {
          m.attackCd = m.boss ? 1.4 : 1.0;
          m.lunge = 1;
          if (wallSeg >= 0) {
            KS.Systems.damageWall(G, wallSeg, m.dmg * (m.boss ? 3 : 1), m);
          } else if (gateIdx >= 0) {
            KS.Systems.damageGate(G, gateIdx, m.dmg * (m.boss ? 3 : 1));
          } else if (targetPlayer) {
            damagePlayer(G, m.dmg, m.x, m.y);
            if (m.venom) { G.regenWait = Math.max(G.regenWait, 5); }
          } else {
            damageBase(G, m.dmg);
            particle(G, U.lerp(m.x, cx, 0.3), U.lerp(m.y, cy, 0.3) - 20, { vz: 60, grav: 100, life: 0.4, size: 3.4, color: '#c9c2b4' });
          }
          if (m.boss) G.shake = Math.max(G.shake, 6);
        }
      }

      // Separation (nicht stapeln)
      G.grid.query(m.x, m.y, m.r + 26, G.qbuf);
      for (const o of G.qbuf) {
        if (o === m || o.dead) continue;
        const dx = m.x - o.x, dy = m.y - o.y;
        const rr2 = (m.r + o.r) * 0.75;
        const d2 = dx * dx + dy * dy;
        if (d2 < rr2 * rr2 && d2 > 0.01) {
          const d = Math.sqrt(d2);
          const push = (rr2 - d) / rr2 * 46 * dt;
          m.x += dx / d * push; m.y += dy / d * push;
        }
      }
      // Rückstoß
      m.x += m.kx * dt; m.y += m.ky * dt;
      m.kx *= Math.pow(0.001, dt); m.ky *= Math.pow(0.001, dt);
      m.x = U.clamp(m.x, 10, CFG.WORLD.w - 10);
      m.y = U.clamp(m.y, 10, CFG.WORLD.h - 10);

      // Harte Barriere: Mauer und Tore lassen sich nicht durch Gedränge oder
      // Rückstoß überwinden. Wer draußen ist, bleibt draußen — solange dort
      // ein intakter Abschnitt bzw. ein intaktes Tor steht.
      if (!m.fly && (G.wallMax > 0 || G.gateMax > 0)) {
        const wR = CFG.WALL.r;
        const dx = m.x - cx, dy = m.y - cy;
        const dC = Math.hypot(dx, dy) || 1;
        const minR = wR + m.r * 0.5;
        if (dC < minR && dC > wR * 0.35) {
          const ang = Math.atan2(dy, dx);
          const seg = G.wallMax > 0 && G.state.wall ? KS.Systems.wallSegAt(ang) : -1;
          const closed = seg >= 0
            ? G.state.wall.hp[seg] > 0
            : KS.Systems.gateBlocks(G, KS.Systems.gateAt(ang));
          if (closed && !m.insideWall) {
            m.x = cx + dx / dC * minR;
            m.y = cy + dy / dC * minR;
            m.kx *= 0.2; m.ky *= 0.2;
          }
        }
        // Wer einmal drin ist (Durchbruch), darf drin bleiben
        if (dC < wR - m.r) m.insideWall = true;
      }
    }
  }

  const SIZE_BUCKET = s => Math.max(0.5, Math.round(s * 4) / 4);

  function drawMonster(G, ctx, m) {
    const frame = Math.floor(m.animT * 6) % 2;
    const bucket = SIZE_BUCKET(m.size);
    const spr = KS.Art.monster(m.key, m.sp, frame, bucket);
    const hover = m.fly ? 14 + Math.sin(m.animT * 3.2) * 4 : 0;
    // Schatten
    ctx.globalAlpha = m.fly ? 0.18 : 0.28;
    ctx.fillStyle = '#1c2814';
    ctx.beginPath();
    ctx.ellipse(m.x, m.y, m.r * (m.fly ? 0.7 : 1.05), m.r * 0.4, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
    // Elite-Aura
    if (m.elite) {
      ctx.globalAlpha = 0.45 + Math.sin(G.time * 5) * 0.15;
      ctx.strokeStyle = '#ffd34e'; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.ellipse(m.x, m.y, m.r * 1.3, m.r * 0.52, 0, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (m.boss) {
      ctx.globalAlpha = 0.4 + Math.sin(G.time * 3) * 0.12;
      ctx.strokeStyle = '#ff5a5a'; ctx.lineWidth = 3.4;
      ctx.beginPath(); ctx.ellipse(m.x, m.y, m.r * 1.35, m.r * 0.55, 0, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // Lunge-Versatz Richtung Ziel
    const lungeX = m.lunge > 0 ? m.face * m.lunge * 6 : 0;
    const lungeY = m.lunge > 0 ? -m.lunge * 3 : 0;
    // Treffer-Blitz: kurz aufhellen + stauchen
    const squash = m.hitT > 0 ? 1 + m.hitT * 1.2 : 1;
    ctx.save();
    if (m.hitT > 0) ctx.globalAlpha = 0.85;
    KS.Art.draw(ctx, spr, m.x + lungeX, m.y - hover + lungeY, squash, 1, m.face === -1);
    ctx.restore();
    if (m.hitT > 0.05) {
      ctx.globalAlpha = m.hitT * 3.2;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.ellipse(m.x + lungeX, m.y - hover - m.r, m.r * 0.85, m.r * 0.85, 0, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    // Bosskrone
    if (m.boss) {
      ctx.save();
      ctx.translate(m.x + lungeX, m.y - hover - m.r * (m.sp.fam === 'slime' ? 2.4 : 2.6) * (m.sp.big || 1));
      const s = m.r / 16;
      ctx.scale(s, s);
      ctx.fillStyle = '#ffd34e';
      ctx.beginPath();
      ctx.moveTo(-8, 2); ctx.lineTo(-8, -6); ctx.lineTo(-4, -2); ctx.lineTo(0, -8); ctx.lineTo(4, -2); ctx.lineTo(8, -6); ctx.lineTo(8, 2);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(38,26,20,0.8)'; ctx.lineWidth = 1.6; ctx.stroke();
      ctx.fillStyle = '#e5484d';
      ctx.beginPath(); ctx.arc(0, -2, 1.6, 0, TAU); ctx.fill();
      ctx.restore();
    }
    // HP-Balken (nicht für Bosse — die haben die große Leiste)
    if (!m.boss && m.hp < m.hpMax) {
      const w = Math.max(26, m.r * 2.2), h = 4.4;
      const y = m.y - hover - m.r * 2.6 * (m.sp.big || 1) - 8;
      ctx.fillStyle = 'rgba(20,14,10,0.75)';
      ctx.fillRect(m.x - w / 2 - 1, y - 1, w + 2, h + 2);
      const pct = Math.max(0, m.hp / m.hpMax);
      ctx.fillStyle = pct > 0.5 ? '#58d162' : pct > 0.25 ? '#ffd34e' : '#e5484d';
      ctx.fillRect(m.x - w / 2, y, w * pct, h);
      if (m.elite) {
        ctx.fillStyle = '#ffd34e';
        ctx.font = '900 9px Nunito, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('ELITE', m.x + 4, y - 3);
        KS.Art.drawStar(ctx, m.x - 16, y - 6, 3.4, '#ffd34e');
      }
    }
    // Verlangsamungs-Schimmer
    if (m.slowT > 0) {
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#bdf0ff';
      for (let i = 0; i < 2; i++) {
        ctx.beginPath();
        ctx.arc(m.x + Math.sin(m.animT * 4 + i * 3) * m.r * 0.7, m.y - m.r - i * m.r * 0.6, 2, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  // ============ PROJEKTILE ============
  function updateProjectiles(G, dt) {
    const P = G.projectiles;
    const pl = G.state.player;
    const { cx, cy, baseRadius } = CFG.WORLD;
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i];
      p.t += dt;
      if (p.t >= p.ttl) {
        if (p.kind === 'cannon') explodeCannon(G, p);
        P.splice(i, 1); continue;
      }
      if (p.kind === 'cannon') {
        // Parabelflug zum Ziel
        const k = p.t / p.ttl;
        p.x = U.lerp(p.x0, p.tx, k);
        p.y = U.lerp(p.y0, p.ty, k);
        p.z = Math.sin(k * Math.PI) * p.arc;
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.side === 'ally') {
        // Monster treffen
        G.grid.query(p.x, p.y, 40, G.qbuf);
        for (const m of G.qbuf) {
          if (m.dead) continue;
          if (p.hitSet && p.hitSet.has(m)) continue;
          if (U.dist2(p.x, p.y, m.x, m.y - m.r) < (m.r + 7) * (m.r + 7) || U.dist2(p.x, p.y, m.x, m.y) < (m.r + 6) * (m.r + 6)) {
            damageMonster(G, m, p.dmg, {
              kb: p.kind === 'beam' ? 60 : 26, kbx: p.vx, kby: p.vy,
              slow: p.slow, slowDur: p.slowDur,
              color: p.kind === 'frost' ? '#bdf0ff' : undefined,
            });
            if (p.kind === 'frost') burst(G, p.x, p.y, 5, { colors: ['#bdf0ff', '#fff'], speed: 60, up: 40, size: 2.6, life: 0.35 });
            if (p.pierce) { p.hitSet.add(m); continue; }
            P.splice(i, 1);
            break;
          }
        }
      } else {
        // Spieler oder Burg treffen
        if (!G.playerDown && G.playerInvuln <= 0 && U.dist2(p.x, p.y, pl.x, pl.y - 14) < 18 * 18) {
          damagePlayer(G, p.dmg, p.x, p.y);
          P.splice(i, 1); continue;
        }
        if (U.dist2(p.x, p.y, cx, cy) < (baseRadius - 10) * (baseRadius - 10)) {
          damageBase(G, p.dmg);
          burst(G, p.x, p.y, 4, { colors: ['#c9c2b4', '#8a8478'], speed: 60, up: 60, size: 3, life: 0.4 });
          P.splice(i, 1); continue;
        }
      }
    }
  }

  function explodeCannon(G, p) {
    KS.Audio.SFX.cannon();
    G.shake = Math.max(G.shake, 4);
    ring(G, p.tx, p.ty, { r0: 6, r1: p.splash, life: 0.35, color: 'rgba(255,180,80,0.9)', lw: 4 });
    burst(G, p.tx, p.ty, 14, { colors: ['#ff9d2e', '#ffd34e', '#6a655c', '#3a3f4a'], speed: 130, up: 130, size: 4, life: 0.55 });
    G.grid.query(p.tx, p.ty, p.splash + 30, G.qbuf);
    for (const m of G.qbuf) {
      if (m.dead) continue;
      const d = U.dist(p.tx, p.ty, m.x, m.y);
      if (d < p.splash + m.r) {
        damageMonster(G, m, p.dmg * (1 - 0.4 * d / (p.splash + m.r)), { kb: 120, kbx: m.x - p.tx, kby: m.y - p.ty });
      }
    }
  }

  function drawProjectiles(G, ctx) {
    for (const p of G.projectiles) {
      if (p.kind === 'arrow' || p.kind === 'bonearrow') {
        const a = Math.atan2(p.vy, p.vx);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(a);
        ctx.strokeStyle = p.kind === 'arrow' ? '#8a6234' : '#ded6c4';
        ctx.lineWidth = 2.6;
        ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(6, 0); ctx.stroke();
        ctx.fillStyle = '#d7dde8';
        ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(4, -2.6); ctx.lineTo(4, 2.6); ctx.closePath(); ctx.fill();
        ctx.fillStyle = p.kind === 'arrow' ? '#e8e2d2' : '#a8a294';
        ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(-5, -2.4); ctx.lineTo(-3, 0); ctx.lineTo(-5, 2.4); ctx.closePath(); ctx.fill();
        ctx.restore();
      } else if (p.kind === 'cannon') {
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = '#1c2814';
        ctx.beginPath(); ctx.ellipse(p.x, p.y, 6, 2.6, 0, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
        const grd = ctx.createRadialGradient(p.x - 2, p.y - p.z - 2, 1, p.x, p.y - p.z, 7);
        grd.addColorStop(0, '#6a7080'); grd.addColorStop(1, '#23262e');
        ctx.fillStyle = grd;
        ctx.beginPath(); ctx.arc(p.x, p.y - p.z, 6.5, 0, TAU); ctx.fill();
        if (Math.random() < 0.6) particle(G, p.x, p.y - p.z, { life: 0.3, size: 2.6, endSize: 0.5, color: 'rgba(120,120,130,0.5)', grav: 0 });
      } else if (p.kind === 'frost' || p.kind === 'frostball') {
        ctx.fillStyle = '#bdf0ff';
        ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(190,240,255,0.4)';
        ctx.beginPath(); ctx.arc(p.x - p.vx * 0.02, p.y - p.vy * 0.02, 7, 0, TAU); ctx.fill();
      } else if (p.kind === 'beam') {
        const a = Math.atan2(p.vy, p.vx);
        ctx.save();
        ctx.translate(p.x, p.y); ctx.rotate(a);
        ctx.globalAlpha = 0.85 * (1 - p.t / p.ttl * 0.5);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.moveTo(10, 0); ctx.quadraticCurveTo(0, -13, -12, 0); ctx.quadraticCurveTo(0, 13, 10, 0);
        ctx.fill();
        ctx.globalAlpha *= 0.5;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(6, 0); ctx.quadraticCurveTo(0, -6, -7, 0); ctx.quadraticCurveTo(0, 6, 6, 0);
        ctx.fill();
        ctx.restore();
        ctx.globalAlpha = 1;
      } else if (p.kind === 'rock' || p.kind === 'boulder') {
        const r = p.kind === 'boulder' ? 9 : 4.6;
        ctx.fillStyle = '#8a8478';
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(38,26,20,0.6)'; ctx.lineWidth = 1.6; ctx.stroke();
      } else if (p.kind === 'bolt') {
        ctx.fillStyle = '#c9a8ff';
        ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, TAU); ctx.fill();
        if (Math.random() < 0.5) particle(G, p.x, p.y, { life: 0.25, size: 2.6, color: 'rgba(168,110,232,0.6)', grav: 0 });
      } else if (p.kind === 'fireball') {
        ctx.fillStyle = '#ff9d2e';
        ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ffe084';
        ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, TAU); ctx.fill();
        if (Math.random() < 0.7) particle(G, p.x, p.y, { life: 0.3, size: 3, endSize: 0.5, color: U.pick(['#ff9d2e', '#e5484d']), grav: -60 });
      }
    }
  }

  // ============ DORFBEWOHNER ============
  function spawnVillager(G, tavernPad, walkIn) {
    const v = {
      idx: Math.floor(Math.random() * 6), f: 0, animT: Math.random() * 10,
      home: tavernPad.id,
      x: tavernPad.x + U.rand(-30, 30), y: tavernPad.y + U.rand(20, 44),
      tx: 0, ty: 0, waitT: U.rand(0.5, 2), speed: U.rand(36, 50),
      arriving: false,
    };
    if (walkIn) {
      // Vom Tor hereinlaufen
      const a = Math.random() * TAU;
      v.x = CFG.WORLD.cx + Math.cos(a) * 1050;
      v.y = CFG.WORLD.cy + Math.sin(a) * 1050;
      v.arriving = true;
      v.tx = tavernPad.x + U.rand(-20, 20); v.ty = tavernPad.y + U.rand(24, 40);
      v.waitT = 0;
    }
    pickVillagerTarget(G, v);
    G.villagers.push(v);
    return v;
  }

  function pickVillagerTarget(G, v) {
    if (v.arriving) return;
    // Zwischen Gebäuden schlendern
    const spots = G.padList.filter(p => {
      const b = G.state.buildings[p.id];
      return b && b.tier >= 1 && p.type !== 'castle';
    });
    const home = G.padList.find(p => p.id === v.home);
    const spot = Math.random() < 0.5 && home ? home : (spots.length ? U.pick(spots) : home);
    if (spot) {
      v.tx = spot.x + U.rand(-52, 52);
      v.ty = spot.y + U.rand(34, 72);
    } else { v.tx = v.x; v.ty = v.y; }
  }

  function updateVillagers(G, dt) {
    const isNight = G.state.phase === 'night';
    for (let i = G.villagers.length - 1; i >= 0; i--) {
      const v = G.villagers[i];
      v.animT += dt;
      // Nachts verstecken sie sich (außer Ankommende)
      if (isNight && !v.arriving) { G.villagers.splice(i, 1); continue; }
      if (v.waitT > 0 && !v.arriving) { v.waitT -= dt; continue; }
      const d = U.dist(v.x, v.y, v.tx, v.ty);
      if (d < 6) {
        if (v.arriving) {
          v.arriving = false;
          KS.Systems.onSurvivorArrived(G, v);
        }
        v.waitT = U.rand(1.5, 5);
        pickVillagerTarget(G, v);
        continue;
      }
      const sp = v.arriving ? v.speed * 1.7 : v.speed;
      v.x += (v.tx - v.x) / d * sp * dt;
      v.y += (v.ty - v.y) / d * sp * dt;
      v.face = v.tx < v.x ? -1 : 1;
    }
  }

  function drawVillager(G, ctx, v) {
    const frame = Math.floor(v.animT * 6) % 2;
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#1c2814';
    ctx.beginPath(); ctx.ellipse(v.x, v.y, 7, 3, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
    KS.Art.draw(ctx, KS.Art.villager(v.idx, frame), v.x, v.y, 1, 1, v.face === -1);
    if (v.arriving) {
      // Ausrufezeichen — Neuankömmling
      ctx.fillStyle = '#ffe084';
      ctx.font = '900 13px Nunito, sans-serif';
      ctx.textAlign = 'center';
      ctx.strokeStyle = 'rgba(30,20,15,0.8)'; ctx.lineWidth = 3;
      const y = v.y - 34 + Math.sin(G.time * 6) * 2;
      ctx.strokeText('!', v.x, y);
      ctx.fillText('!', v.x, y);
    }
  }

  return {
    particle, burst, ring, text,
    updateFx, drawParticles, drawRings, drawTexts, drawZaps,
    spawnCoin, spawnCoinBurst, updateCoins, drawCoin,
    damageMonster, killMonster, damagePlayer, damageBase,
    updatePlayer, drawPlayer,
    makeMonster, updateMonsters, drawMonster,
    updateProjectiles, drawProjectiles, explodeCannon,
    spawnVillager, updateVillagers, drawVillager, pickVillagerTarget,
  };
})();
