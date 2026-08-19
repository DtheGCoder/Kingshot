/* ============================================================
   KINGSHOT — art.js
   Prozedurale Grafik: alle Sprites werden im Cartoon-Stil mit
   Outlines, Verläufen und Glanzlichtern vorgezeichnet & gecacht.
   ============================================================ */
'use strict';

KS.Art = (() => {
  const U = KS.U;
  const SS = 2;                 // Supersampling für knackige Sprites
  const cache = new Map();

  const OUTLINE = 'rgba(38,26,20,0.75)';

  // ---------- Sprite-Fabrik ----------
  // fn zeichnet in logischen Einheiten, Ursprung = Fußpunkt (0,0), x zentriert
  function make(key, w, h, fn, footPad = 6) {
    let s = cache.get(key);
    if (s) return s;
    const c = document.createElement('canvas');
    c.width = Math.ceil(w * SS); c.height = Math.ceil(h * SS);
    const g = c.getContext('2d');
    g.scale(SS, SS);
    g.translate(w / 2, h - footPad);
    g.lineJoin = 'round'; g.lineCap = 'round';
    fn(g);
    s = { c, w, h, ax: w / 2, ay: h - footPad };
    cache.set(key, s);
    return s;
  }

  function draw(ctx, s, x, y, scale = 1, alpha = 1, flip = false, rot = 0) {
    ctx.save();
    ctx.translate(x, y);
    if (rot) ctx.rotate(rot);
    ctx.scale(flip ? -scale : scale, scale);
    if (alpha < 1) ctx.globalAlpha *= alpha;
    ctx.drawImage(s.c, -s.ax, -s.ay, s.w, s.h);
    ctx.restore();
  }

  // ---------- Zeichen-Helfer ----------
  function rr(g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  function ell(g, x, y, rx, ry) {
    g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.closePath();
  }
  function vgrad(g, y0, y1, c0, c1) {
    const gr = g.createLinearGradient(0, y0, 0, y1);
    gr.addColorStop(0, c0); gr.addColorStop(1, c1);
    return gr;
  }
  function outline(g, w = 2) { g.strokeStyle = OUTLINE; g.lineWidth = w; g.stroke(); }
  function softShadow(g, rx, ry = rx * 0.38, a = 0.28) {
    ell(g, 0, 0, rx, ry);
    g.fillStyle = `rgba(20,30,15,${a})`; g.fill();
  }

  // Materialien für Turm-/Gebäudestufen (Holz→Stein→Eisen→Gold→Kristall)
  const MATS = [
    { w: '#a8794a', d: '#7c5630', hi: '#cf9d66', name: 'Holz' },
    { w: '#a9aab4', d: '#7d7e8a', hi: '#d2d3dc', name: 'Stein' },
    { w: '#71809a', d: '#4c5568', hi: '#a2b0c6', name: 'Eisen' },
    { w: '#e9bc4d', d: '#b7872a', hi: '#ffe28c', name: 'Gold' },
    { w: '#9fdcf2', d: '#5ba9cc', hi: '#eafcff', name: 'Kristall' },
  ];
  const matFor = tier => MATS[Math.min(4, Math.ceil(tier / 2) - 1)];

  // ============================================================
  //  GEBÄUDE
  // ============================================================

  function crenellation(g, x0, x1, y, h, n, fill) {
    const w = (x1 - x0) / (n * 2 - 1);
    g.fillStyle = fill;
    g.beginPath();
    for (let i = 0; i < n; i++) g.rect(x0 + i * 2 * w, y - h, w, h);
    g.fill();
    g.strokeStyle = OUTLINE; g.lineWidth = 1.6;
    for (let i = 0; i < n; i++) { g.beginPath(); g.rect(x0 + i * 2 * w, y - h, w, h); g.stroke(); }
  }

  function bricks(g, x, y, w, h, rows, color, alpha = 0.35) {
    g.save(); g.globalAlpha = alpha; g.strokeStyle = color; g.lineWidth = 1.2;
    const rh = h / rows;
    for (let r = 1; r < rows; r++) {
      g.beginPath(); g.moveTo(x, y + r * rh); g.lineTo(x + w, y + r * rh); g.stroke();
      const off = (r % 2) ? w * 0.25 : w * 0.55;
      g.beginPath(); g.moveTo(x + off, y + (r - 1) * rh); g.lineTo(x + off, y + r * rh); g.stroke();
    }
    g.restore();
  }

  function flagPole(g, x, y, h, color) {
    g.strokeStyle = '#5a4632'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - h); g.stroke();
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(x, y - h);
    g.quadraticCurveTo(x + 9, y - h + 2, x + 16, y - h + 4.5);
    g.quadraticCurveTo(x + 9, y - h + 7, x, y - h + 9);
    g.closePath(); g.fill(); outline(g, 1.4);
    g.fillStyle = '#f2d24a';
    g.beginPath(); g.arc(x, y - h - 1.5, 2.2, 0, 7); g.fill();
  }

  function windowSlit(g, x, y, w, h, lit = '#ffd97a') {
    rr(g, x - w / 2, y, w, h, w / 2);
    g.fillStyle = lit; g.fill();
    g.strokeStyle = 'rgba(38,26,20,0.8)'; g.lineWidth = 1.4; g.stroke();
  }

  // ---------- Türme ----------
  const TOWER_ACCENT = {
    tower_arrow: '#4e9a3e', tower_cannon: '#39404e', tower_frost: '#6fd0ec',
    tower_lightning: '#b48cff', tower_flame: '#ff9a3d',
  };

  function paintTower(g, type, tier) {
    const m = matFor(tier);
    const acc = TOWER_ACCENT[type];
    const h = 58 + tier * 6;            // Körperhöhe wächst je Stufe
    const wB = 46 + tier * 1.3;         // Fußbreite
    const wT = wB * 0.78;               // Kopfbreite
    softShadow(g, wB * 0.62, wB * 0.24);

    // Sockel
    rr(g, -wB / 2 - 5, -12, wB + 10, 13, 4);
    g.fillStyle = vgrad(g, -12, 1, '#9a938a', '#6f6a61'); g.fill(); outline(g, 2);

    // Körper (leicht konisch)
    g.beginPath();
    g.moveTo(-wB / 2, -10);
    g.lineTo(-wT / 2, -h);
    g.lineTo(wT / 2, -h);
    g.lineTo(wB / 2, -10);
    g.closePath();
    g.fillStyle = vgrad(g, -h, -10, m.w, m.d); g.fill(); outline(g, 2.4);
    // Kante hell (Rim-Light links)
    g.beginPath();
    g.moveTo(-wB / 2 + 3, -12);
    g.lineTo(-wT / 2 + 3, -h + 2);
    g.strokeStyle = m.hi; g.lineWidth = 2.4; g.globalAlpha = 0.7; g.stroke(); g.globalAlpha = 1;
    if (tier <= 2) { // Holzplanken
      g.save(); g.globalAlpha = 0.3; g.strokeStyle = '#4a3218'; g.lineWidth = 1.4;
      for (let i = 1; i <= 3; i++) {
        const t = i / 4, y = -10 - (h - 10) * t, wl = U.lerp(wB, wT, t) / 2 - 2;
        g.beginPath(); g.moveTo(-wl, y); g.lineTo(wl, y); g.stroke();
      }
      g.restore();
    } else {
      bricks(g, -wT / 2, -h, wT, h - 12, 5 + Math.min(3, tier), 'rgba(30,25,40,0.8)', 0.22);
    }
    if (tier >= 9) { // Kristall glüht
      g.save(); g.globalAlpha = 0.5;
      g.fillStyle = vgrad(g, -h, -10, 'rgba(190,255,255,0.55)', 'rgba(120,200,255,0)');
      g.beginPath();
      g.moveTo(-wB / 2, -10); g.lineTo(-wT / 2, -h); g.lineTo(wT / 2, -h); g.lineTo(wB / 2, -10);
      g.closePath(); g.fill(); g.restore();
    }

    // Fenster
    windowSlit(g, 0, -h * 0.55, 5.5, 12);
    if (tier >= 4) windowSlit(g, -wT * 0.26, -h * 0.32, 4.5, 9);
    if (tier >= 6) windowSlit(g, wT * 0.26, -h * 0.32, 4.5, 9);

    // Plattform + Zinnen
    const pw = wT + 14;
    rr(g, -pw / 2, -h - 10, pw, 12, 3);
    g.fillStyle = vgrad(g, -h - 10, -h + 2, m.hi, m.w); g.fill(); outline(g, 2.2);
    crenellation(g, -pw / 2, pw / 2, -h - 10, 7, 4, m.w);

    // Kopf je Typ
    const ty = -h - 12;
    if (type === 'tower_arrow') {
      // Ballista-Bogen
      g.strokeStyle = '#6e4a26'; g.lineWidth = 3.4;
      g.beginPath(); g.arc(0, ty - 6, 12, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
      g.strokeStyle = '#ded6c4'; g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(-10.5, ty - 12); g.lineTo(10.5, ty - 12); g.stroke();
      g.strokeStyle = '#8a6a3a'; g.lineWidth = 2.6;
      g.beginPath(); g.moveTo(0, ty - 2); g.lineTo(0, ty - 16); g.stroke();
      flagPole(g, -pw / 2 + 2, ty + 2, 24 + tier, acc);
    } else if (type === 'tower_cannon') {
      // Kanonenrohr
      g.save(); g.translate(0, ty - 7); g.rotate(-0.28);
      rr(g, -7, -7, 26, 14, 6);
      g.fillStyle = vgrad(g, -7, 7, '#5a6070', '#23262e'); g.fill(); outline(g, 2.2);
      ell(g, 19, 0, 4.6, 6.4); g.fillStyle = '#16181e'; g.fill(); outline(g, 2);
      g.restore();
      ell(g, -6, ty - 4, 6.5, 6.5); g.fillStyle = '#3a3f4a'; g.fill(); outline(g, 2);
      g.fillStyle = acc; ell(g, -6, ty - 4, 2.6, 2.6); g.fill();
    } else if (type === 'tower_frost') {
      // Eiskristall
      const ch = 20 + tier * 1.6;
      g.beginPath();
      g.moveTo(0, ty - ch); g.lineTo(7.5, ty - ch * 0.45); g.lineTo(4.5, ty + 1);
      g.lineTo(-4.5, ty + 1); g.lineTo(-7.5, ty - ch * 0.45);
      g.closePath();
      g.fillStyle = vgrad(g, ty - ch, ty, '#eafdff', '#7ac8ea'); g.fill(); outline(g, 2.2);
      g.beginPath(); g.moveTo(-2.5, ty - ch * 0.75); g.lineTo(-4.5, ty - ch * 0.4);
      g.strokeStyle = '#fff'; g.lineWidth = 1.6; g.stroke();
      g.save(); g.globalAlpha = 0.45; g.fillStyle = '#bdf0ff';
      ell(g, 0, ty - ch * 0.5, 13, ch * 0.62); g.fill(); g.restore();
    } else if (type === 'tower_lightning') {
      // Kupferstab + Orb
      g.strokeStyle = '#b87a3a'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(0, ty + 2); g.lineTo(0, ty - 18); g.stroke();
      ell(g, 0, ty - 24, 7.5, 7.5);
      g.fillStyle = vgrad(g, ty - 32, ty - 16, '#e8d4ff', '#8a5adf'); g.fill(); outline(g, 2.2);
      g.strokeStyle = '#f0e4ff'; g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(-2, ty - 28); g.lineTo(1, ty - 24); g.lineTo(-1, ty - 21); g.stroke();
      g.save(); g.globalAlpha = 0.35; g.fillStyle = '#c9a8ff';
      ell(g, 0, ty - 24, 12, 12); g.fill(); g.restore();
    } else if (type === 'tower_flame') {
      // Feuerschale
      g.beginPath();
      g.moveTo(-11, ty - 8); g.quadraticCurveTo(0, ty + 3, 11, ty - 8);
      g.lineTo(9, ty - 1); g.quadraticCurveTo(0, ty + 7, -9, ty - 1);
      g.closePath();
      g.fillStyle = vgrad(g, ty - 8, ty + 6, '#4a3a2c', '#2c211a'); g.fill(); outline(g, 2.2);
      // Flamme
      g.beginPath();
      g.moveTo(0, ty - 26);
      g.quadraticCurveTo(9, ty - 14, 5.5, ty - 7);
      g.quadraticCurveTo(0, ty - 3, -5.5, ty - 7);
      g.quadraticCurveTo(-9, ty - 14, 0, ty - 26);
      g.fillStyle = vgrad(g, ty - 26, ty - 4, '#ffe084', '#ff7a2e'); g.fill(); outline(g, 1.8);
      g.fillStyle = '#fff6c8'; ell(g, 0, ty - 10, 3, 5); g.fill();
    }

    // Stufen-Sterne (ab Gold sichtbarer Rang)
    if (tier >= 7) {
      g.fillStyle = '#ffd34e';
      for (let i = 0; i < Math.min(3, tier - 6); i++) {
        ell(g, -8 + i * 8, -h - 24, 2.2, 2.2); g.fill();
      }
    }
  }

  // ---------- Burg ----------
  function paintCastle(g, tier) {
    const m = matFor(Math.min(9, tier + 1));
    const W = 132 + tier * 7;
    const H = 92 + tier * 9;
    const roofC = tier <= 2 ? '#a8622e' : tier <= 4 ? '#c0392b' : tier <= 6 ? '#3b6ea5' : tier <= 8 ? '#7a4fc9' : '#f2d24a';
    softShadow(g, W * 0.62, W * 0.2, 0.3);

    // Mauer
    const wallH = 34 + tier * 2.5;
    rr(g, -W / 2, -wallH, W, wallH, 5);
    g.fillStyle = vgrad(g, -wallH, 0, '#c9c2b4', '#948d7e'); g.fill(); outline(g, 2.6);
    bricks(g, -W / 2, -wallH, W, wallH, 4, 'rgba(30,25,40,0.8)', 0.2);
    crenellation(g, -W / 2, W / 2, -wallH, 8, 7, '#b5aea0');

    // Tor
    const gw = 26 + tier;
    g.beginPath();
    g.moveTo(-gw / 2, 0); g.lineTo(-gw / 2, -22);
    g.arc(0, -22, gw / 2, Math.PI, 0);
    g.lineTo(gw / 2, 0);
    g.closePath();
    g.fillStyle = vgrad(g, -34, 0, '#6e4a26', '#4a3016'); g.fill(); outline(g, 2.4);
    g.strokeStyle = 'rgba(30,20,10,0.5)'; g.lineWidth = 1.6;
    for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(i * 5, 0); g.lineTo(i * 5, -22 - Math.sqrt(Math.max(0, (gw / 2) ** 2 - (i * 5) ** 2))); g.stroke(); }
    // Goldbeschlag am Tor
    g.strokeStyle = tier >= 5 ? '#e8bb4a' : '#8a6a3a'; g.lineWidth = 2.2;
    g.beginPath(); g.moveTo(-gw / 2 + 2, -12); g.lineTo(gw / 2 - 2, -12); g.stroke();

    // Bergfried (Hauptturm)
    const kw = W * 0.42, kH = H;
    g.beginPath();
    g.moveTo(-kw / 2, -wallH + 4);
    g.lineTo(-kw / 2 + 3, -kH);
    g.lineTo(kw / 2 - 3, -kH);
    g.lineTo(kw / 2, -wallH + 4);
    g.closePath();
    g.fillStyle = vgrad(g, -kH, -wallH, '#ded7c8', '#a29a8a'); g.fill(); outline(g, 2.6);
    bricks(g, -kw / 2 + 3, -kH, kw - 6, kH - wallH, 6, 'rgba(30,25,40,0.8)', 0.18);
    windowSlit(g, 0, -kH + 16, 7, 15);
    if (tier >= 3) { windowSlit(g, -kw * 0.24, -kH + 38, 5.5, 11); windowSlit(g, kw * 0.24, -kH + 38, 5.5, 11); }

    // Dach des Bergfrieds
    g.beginPath();
    g.moveTo(-kw / 2 - 7, -kH);
    g.lineTo(0, -kH - 26 - tier * 2);
    g.lineTo(kw / 2 + 7, -kH);
    g.closePath();
    g.fillStyle = vgrad(g, -kH - 28, -kH, U.shade(roofC, 0.25), roofC); g.fill(); outline(g, 2.6);
    g.beginPath(); g.moveTo(-kw / 2 - 2, -kH - 3); g.lineTo(-4, -kH - 20 - tier * 1.6);
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2; g.stroke();

    // Seitentürme (ab Stufe 2, größer ab 5)
    if (tier >= 2) {
      for (const side of [-1, 1]) {
        const tx = side * (W / 2 - 13), tw = 26 + tier, th = wallH + 26 + tier * 3.5;
        rr(g, tx - tw / 2, -th, tw, th, 4);
        g.fillStyle = vgrad(g, -th, 0, '#cfc8ba', '#9a9384'); g.fill(); outline(g, 2.4);
        bricks(g, tx - tw / 2, -th, tw, th, 5, 'rgba(30,25,40,0.8)', 0.18);
        windowSlit(g, tx, -th + 12, 5, 10);
        g.beginPath();
        g.moveTo(tx - tw / 2 - 5, -th);
        g.lineTo(tx, -th - 18 - tier);
        g.lineTo(tx + tw / 2 + 5, -th);
        g.closePath();
        g.fillStyle = vgrad(g, -th - 20, -th, U.shade(roofC, 0.2), U.shade(roofC, -0.1)); g.fill(); outline(g, 2.4);
        if (tier >= 6) flagPole(g, tx, -th - 18 - tier, 12, '#f2d24a');
      }
    }
    // Goldene Trims ab Stufe 7
    if (tier >= 7) {
      g.strokeStyle = '#e8bb4a'; g.lineWidth = 2.6; g.globalAlpha = 0.9;
      g.beginPath(); g.moveTo(-W / 2 + 4, -wallH + 8); g.lineTo(W / 2 - 4, -wallH + 8); g.stroke();
      g.globalAlpha = 1;
    }
    // Kristall-Spitzen ab Stufe 9
    if (tier >= 9) {
      for (const dx of [-kw * 0.3, kw * 0.3]) {
        g.beginPath();
        g.moveTo(dx, -kH - 6); g.lineTo(dx + 4, -kH + 4); g.lineTo(dx - 4, -kH + 4);
        g.closePath();
        g.fillStyle = '#bdf0ff'; g.fill(); outline(g, 1.6);
      }
    }
  }

  // ---------- Produktion ----------
  function paintMine(g, tier) {
    const W = 74 + tier * 4;
    softShadow(g, W * 0.55, W * 0.2);
    // Felshügel
    g.beginPath();
    g.moveTo(-W / 2, 0);
    g.quadraticCurveTo(-W * 0.42, -34 - tier * 2.4, -W * 0.1, -40 - tier * 3);
    g.quadraticCurveTo(W * 0.28, -44 - tier * 3, W / 2, -6);
    g.quadraticCurveTo(W * 0.3, 2, 0, 2);
    g.closePath();
    g.fillStyle = vgrad(g, -48 - tier * 3, 2, '#9a938a', '#615c52'); g.fill(); outline(g, 2.6);
    // Facetten
    g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(-W * 0.28, -14); g.lineTo(-W * 0.12, -32 - tier * 2); g.stroke();
    g.beginPath(); g.moveTo(W * 0.22, -10); g.lineTo(W * 0.3, -26 - tier * 1.6); g.stroke();
    // Goldadern (mehr je Stufe)
    g.strokeStyle = '#ffd34e'; g.lineWidth = 2.2;
    for (let i = 0; i < Math.min(6, 1 + tier); i++) {
      const a = (i * 2.3) % 1, x = (a - 0.5) * W * 0.7, y = -8 - (i * 7) % 26;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + 5, y - 4); g.lineTo(x + 9, y - 2); g.stroke();
    }
    // Stolleneingang
    g.beginPath();
    g.moveTo(-13, 0); g.lineTo(-13, -14); g.arc(0, -14, 13, Math.PI, 0); g.lineTo(13, 0);
    g.closePath();
    g.fillStyle = '#1c150e'; g.fill(); outline(g, 2.4);
    // Holzrahmen
    g.strokeStyle = '#8a6234'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(-15, 1); g.lineTo(-15, -15); g.moveTo(15, 1); g.lineTo(15, -15);
    g.moveTo(-17, -16); g.lineTo(17, -16); g.stroke();
    // Lore mit Gold
    g.save(); g.translate(W * 0.3, 0);
    rr(g, -10, -10, 20, 10, 2);
    g.fillStyle = '#6e4a26'; g.fill(); outline(g, 2);
    for (let i = 0; i < 3; i++) { ell(g, -5 + i * 5, -11, 3.4, 3); g.fillStyle = '#ffd34e'; g.fill(); outline(g, 1.4); }
    ell(g, -5, 0, 3, 3); g.fillStyle = '#3a3428'; g.fill();
    ell(g, 5, 0, 3, 3); g.fill();
    g.restore();
    if (tier >= 4) { // Laterne
      g.strokeStyle = '#5a4632'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(-W * 0.34, 0); g.lineTo(-W * 0.34, -24); g.stroke();
      rr(g, -W * 0.34 - 4, -32, 8, 9, 2);
      g.fillStyle = '#ffe084'; g.fill(); outline(g, 1.8);
    }
  }

  function paintTavern(g, tier) {
    const W = 76 + tier * 4.5;
    const H = 52 + tier * 4;
    const two = tier >= 4;
    softShadow(g, W * 0.58, W * 0.2);
    // Wände (Fachwerk)
    const bodyH = two ? H * 0.9 : H * 0.66;
    rr(g, -W / 2, -bodyH, W, bodyH, 3);
    g.fillStyle = vgrad(g, -bodyH, 0, '#f0e3c8', '#cbb894'); g.fill(); outline(g, 2.6);
    // Balken
    g.strokeStyle = '#6e4a26'; g.lineWidth = 3;
    g.beginPath();
    g.moveTo(-W / 2 + 3, -bodyH * 0.5); g.lineTo(W / 2 - 3, -bodyH * 0.5);
    g.moveTo(-W * 0.25, -bodyH); g.lineTo(-W * 0.25, 0);
    g.moveTo(W * 0.25, -bodyH); g.lineTo(W * 0.25, 0);
    g.stroke();
    g.beginPath(); g.moveTo(-W * 0.25, -bodyH * 0.5); g.lineTo(-W * 0.05, -bodyH); g.stroke();
    // Tür + Fenster
    rr(g, -9, -22, 18, 22, 7);
    g.fillStyle = vgrad(g, -22, 0, '#7c5630', '#4a3016'); g.fill(); outline(g, 2.2);
    ell(g, 4.5, -11, 1.6, 1.6); g.fillStyle = '#e8bb4a'; g.fill();
    windowSlit(g, -W * 0.32, -bodyH * 0.32, 9, 10);
    windowSlit(g, W * 0.32, -bodyH * 0.32, 9, 10);
    if (two) { windowSlit(g, -W * 0.2, -bodyH * 0.78, 8, 9); windowSlit(g, W * 0.2, -bodyH * 0.78, 8, 9); }
    // Dach
    const ry = -bodyH;
    g.beginPath();
    g.moveTo(-W / 2 - 9, ry);
    g.lineTo(0, ry - H * 0.62 - tier * 1.5);
    g.lineTo(W / 2 + 9, ry);
    g.closePath();
    const roofC = tier >= 8 ? '#7a4fc9' : tier >= 6 ? '#3b6ea5' : '#b5502e';
    g.fillStyle = vgrad(g, ry - H * 0.62, ry, U.shade(roofC, 0.22), U.shade(roofC, -0.12)); g.fill(); outline(g, 2.6);
    g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 1.6;
    for (let i = 1; i < 4; i++) {
      const t = i / 4;
      g.beginPath();
      g.moveTo(-W / 2 - 9 + (W / 2 + 9) * t, ry - (H * 0.62 + tier * 1.5) * t);
      g.lineTo(W / 2 + 9 - (W / 2 + 9) * t, ry - (H * 0.62 + tier * 1.5) * t);
      g.stroke();
    }
    // Schornstein
    rr(g, W * 0.16, ry - H * 0.5, 11, H * 0.3, 2);
    g.fillStyle = '#8a8478'; g.fill(); outline(g, 2.2);
    // Wirtshausschild
    g.strokeStyle = '#5a4632'; g.lineWidth = 2.4;
    g.beginPath(); g.moveTo(-W / 2 - 6, -bodyH + 6); g.lineTo(-W / 2 - 6, -bodyH + 14); g.stroke();
    rr(g, -W / 2 - 14, -bodyH + 14, 17, 13, 3);
    g.fillStyle = '#e8bb4a'; g.fill(); outline(g, 2);
    ell(g, -W / 2 - 5.5, -bodyH + 20.5, 3.6, 4.2); g.fillStyle = '#f5e6c8'; g.fill();
    g.fillStyle = '#c98a2e'; ell(g, -W / 2 - 5.5, -bodyH + 19, 3.6, 1.8); g.fill();
    // Fässer
    for (const bx of [W * 0.42, W * 0.42 + 13]) {
      rr(g, bx - 6, -13, 12, 13, 4);
      g.fillStyle = vgrad(g, -13, 0, '#a8794a', '#6e4a26'); g.fill(); outline(g, 2);
      g.strokeStyle = '#4a3016'; g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(bx - 6, -8); g.lineTo(bx + 6, -8); g.stroke();
    }
    if (tier >= 5) { // Blumenkästen
      g.fillStyle = '#6e4a26';
      g.fillRect(-W * 0.32 - 6, -bodyH * 0.32 + 6, 12, 3.6);
      g.fillStyle = '#e5484d'; ell(g, -W * 0.32 - 3, -bodyH * 0.32 + 5, 2, 2); g.fill();
      g.fillStyle = '#ffd34e'; ell(g, -W * 0.32 + 2, -bodyH * 0.32 + 5, 2, 2); g.fill();
    }
  }

  function paintForge(g, tier) {
    const W = 72 + tier * 4;
    const H = 46 + tier * 3.4;
    softShadow(g, W * 0.56, W * 0.2);
    // Steinkorpus
    rr(g, -W / 2, -H, W, H, 5);
    g.fillStyle = vgrad(g, -H, 0, '#8f8a82', '#5c584e'); g.fill(); outline(g, 2.6);
    bricks(g, -W / 2, -H, W, H, 4, 'rgba(20,16,12,0.9)', 0.25);
    // Esse (offenes Feuer)
    g.beginPath();
    g.moveTo(-14, 0); g.lineTo(-14, -16); g.arc(0, -16, 14, Math.PI, 0); g.lineTo(14, 0);
    g.closePath();
    g.fillStyle = '#1c1008'; g.fill(); outline(g, 2.4);
    const fg = g.createRadialGradient(0, -6, 2, 0, -6, 15);
    fg.addColorStop(0, '#ffe084'); fg.addColorStop(0.55, '#ff8a2e'); fg.addColorStop(1, 'rgba(160,40,10,0)');
    g.fillStyle = fg;
    g.beginPath(); g.moveTo(-12, 0); g.arc(0, -14, 12, Math.PI, 0); g.lineTo(12, 0); g.closePath(); g.fill();
    // Dach schräg
    g.beginPath();
    g.moveTo(-W / 2 - 8, -H);
    g.lineTo(W * 0.1, -H - 24 - tier * 1.6);
    g.lineTo(W / 2 + 8, -H - 4);
    g.closePath();
    g.fillStyle = vgrad(g, -H - 26, -H, '#7c5630', '#503820'); g.fill(); outline(g, 2.6);
    // Schornstein (glüht ab Stufe 3)
    rr(g, W * 0.22, -H - 26 - tier * 1.2, 13, 24, 2);
    g.fillStyle = vgrad(g, -H - 28, -H, '#9a938a', '#6a655c'); g.fill(); outline(g, 2.2);
    if (tier >= 3) { g.fillStyle = 'rgba(255,140,40,0.7)'; ell(g, W * 0.22 + 6.5, -H - 26 - tier * 1.2, 4, 2.4); g.fill(); }
    // Amboss
    g.save(); g.translate(-W * 0.36, 0);
    g.fillStyle = '#3a3f4a';
    g.beginPath();
    g.moveTo(-9, -8); g.lineTo(9, -8); g.lineTo(6, -4); g.lineTo(4, -1); g.lineTo(-4, -1); g.lineTo(-6, -4);
    g.closePath(); g.fill(); outline(g, 2);
    g.fillRect(-3.6, -1, 7.2, 1.6);
    g.restore();
    // Hammer-Schild
    g.strokeStyle = '#5a4632'; g.lineWidth = 2.2;
    g.beginPath(); g.moveTo(W / 2 + 5, -H + 4); g.lineTo(W / 2 + 5, -H + 12); g.stroke();
    rr(g, W / 2 - 3, -H + 12, 16, 12, 3);
    g.fillStyle = '#c9c2b4'; g.fill(); outline(g, 2);
    g.strokeStyle = '#3a3f4a'; g.lineWidth = 2.4;
    g.beginPath(); g.moveTo(W / 2 + 1, -H + 21); g.lineTo(W / 2 + 9, -H + 15); g.stroke();
    g.fillStyle = '#3a3f4a'; rr(g, W / 2 + 7, -H + 12.5, 5, 4, 1); g.fill();
    if (tier >= 6) { // goldener Amboss-Akzent
      g.strokeStyle = '#e8bb4a'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(-W / 2 + 4, -H + 5); g.lineTo(W / 2 - 4, -H + 5); g.stroke();
    }
  }

  function paintShrine(g, tier) {
    const W = 64 + tier * 3;
    softShadow(g, W * 0.5, W * 0.18);
    // Podest
    for (let i = 0; i < 2; i++) {
      const pw = W - i * 14;
      rr(g, -pw / 2, -6 - i * 6, pw, 7, 3);
      g.fillStyle = i ? '#e4ddd0' : '#cfc8ba'; g.fill(); outline(g, 2.2);
    }
    // Säulen
    const cols = tier >= 5 ? 4 : 2;
    const colX = [-W * 0.3, W * 0.3, -W * 0.14, W * 0.14];
    const colH = 34 + tier * 2.2;
    for (let i = 0; i < cols; i++) {
      const x = colX[i], back = i >= 2;
      rr(g, x - 3.6, -12 - colH + (back ? 4 : 0), 7.2, colH, 2.4);
      g.fillStyle = vgrad(g, -12 - colH, -12, back ? '#d8d1c2' : '#f2ecdc', back ? '#a8a192' : '#c2bbaa');
      g.fill(); outline(g, 2);
      rr(g, x - 5.4, -12 - colH - 4 + (back ? 4 : 0), 10.8, 5, 1.6);
      g.fillStyle = '#e8e1d2'; g.fill(); outline(g, 1.8);
    }
    // Bogen oben
    g.beginPath(); g.arc(0, -12 - colH + 2, W * 0.34, Math.PI, 0);
    g.lineTo(W * 0.34 - 6, -12 - colH + 2);
    g.arc(0, -12 - colH + 2, W * 0.34 - 6, 0, Math.PI, true);
    g.closePath();
    g.fillStyle = tier >= 7 ? '#e8bb4a' : '#e4ddd0'; g.fill(); outline(g, 2.2);
    // Schwebender Kristall
    const cy = -30 - colH * 0.45;
    g.save(); g.globalAlpha = 0.4;
    const gl = g.createRadialGradient(0, cy, 2, 0, cy, 24 + tier * 2);
    gl.addColorStop(0, '#fff8d0'); gl.addColorStop(1, 'rgba(255,240,180,0)');
    g.fillStyle = gl; ell(g, 0, cy, 24 + tier * 2, 24 + tier * 2); g.fill();
    g.restore();
    g.beginPath();
    g.moveTo(0, cy - 12); g.lineTo(7, cy); g.lineTo(0, cy + 12); g.lineTo(-7, cy);
    g.closePath();
    g.fillStyle = vgrad(g, cy - 12, cy + 12, '#fffbe8', '#f2d24a'); g.fill(); outline(g, 2);
    g.strokeStyle = '#fff'; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(-2, cy - 5); g.lineTo(-3.5, cy); g.stroke();
  }

  function paintBuilding(g, type, tier) {
    if (type === 'castle') return paintCastle(g, tier);
    if (type === 'mine') return paintMine(g, tier);
    if (type === 'tavern') return paintTavern(g, tier);
    if (type === 'forge') return paintForge(g, tier);
    if (type === 'shrine') return paintShrine(g, tier);
    return paintTower(g, type, tier);
  }

  function building(type, tier) {
    const big = type === 'castle';
    const w = big ? 260 : 150, h = big ? 240 : 170;
    return make(`bld:${type}:${tier}`, w, h, g => paintBuilding(g, type, tier), big ? 10 : 8);
  }

  // ---------- Bauplatte ----------
  function padPlate(locked) {
    return make(`pad:${locked ? 'l' : 'u'}`, 120, 78, g => {
      // Steinplatte
      ell(g, 0, -8, 50, 26);
      g.fillStyle = locked ? '#5c5a52' : '#b3aa96'; g.fill(); outline(g, 2.6);
      ell(g, 0, -10.5, 44, 21);
      g.fillStyle = locked ? '#6a6860' : '#c6bda8'; g.fill();
      g.strokeStyle = locked ? 'rgba(30,28,24,0.6)' : 'rgba(90,75,50,0.55)';
      g.lineWidth = 2; g.stroke();
      // Runenring
      g.save();
      g.strokeStyle = locked ? 'rgba(140,140,150,0.5)' : 'rgba(122,90,40,0.6)';
      g.lineWidth = 2.6; g.setLineDash([7, 6]);
      g.beginPath(); g.ellipse(0, -10.5, 34, 15.5, 0, 0, Math.PI * 2); g.stroke();
      g.restore();
      // Hammer-Gravur in der Mitte
      g.save(); g.globalAlpha = locked ? 0.4 : 0.5; g.translate(0, -11);
      g.strokeStyle = locked ? '#3c3a34' : '#7a5a28'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(-6, 5); g.lineTo(5, -4); g.stroke();
      g.fillStyle = locked ? '#3c3a34' : '#7a5a28';
      rr(g, 2, -8.5, 8.5, 6, 1.6); g.fill();
      g.restore();
      if (locked) { // Ketten + Schloss
        g.strokeStyle = '#2e2c28'; g.lineWidth = 4;
        g.beginPath(); g.moveTo(-42, -18); g.quadraticCurveTo(0, -2, 42, -16); g.stroke();
        g.strokeStyle = '#8a8478'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(-42, -18); g.quadraticCurveTo(0, -2, 42, -16); g.stroke();
        rr(g, -7, -18, 14, 12, 3);
        g.fillStyle = '#c9a13a'; g.fill(); outline(g, 2.2);
        g.beginPath(); g.arc(0, -18, 4.6, Math.PI, 0);
        g.strokeStyle = '#8a6a1a'; g.lineWidth = 2.6; g.stroke();
        ell(g, 0, -12, 1.8, 2.6); g.fillStyle = '#4a3a10'; g.fill();
      }
    }, 24);
  }

  // ============================================================
  //  MONSTER (13 Familien, je 2 Frames)
  // ============================================================

  function eyes(g, x, y, r, look = 1, color = '#1c1c22') {
    for (const s of [-1, 1]) {
      ell(g, x + s * r * 2.2, y, r, r * 1.25);
      g.fillStyle = '#fff'; g.fill();
      g.strokeStyle = 'rgba(30,20,15,0.5)'; g.lineWidth = 1; g.stroke();
      ell(g, x + s * r * 2.2 + look * r * 0.35, y + r * 0.15, r * 0.52, r * 0.62);
      g.fillStyle = color; g.fill();
      ell(g, x + s * r * 2.2 + look * r * 0.15, y - r * 0.25, r * 0.2, r * 0.2);
      g.fillStyle = '#fff'; g.fill();
    }
  }

  function limb(g, x0, y0, x1, y1, w, color) {
    g.strokeStyle = color; g.lineWidth = w;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  }

  const M = {};

  M.slime = (g, sp, f) => {
    const s = sp.r;
    const rx = f ? s * 0.95 : s * 1.12, ry = f ? s * 1.1 : s * 0.88;
    const gr = g.createLinearGradient(0, -ry * 2, 0, 0);
    gr.addColorStop(0, U.shade(sp.c1, 0.25)); gr.addColorStop(1, sp.c2);
    g.beginPath();
    g.moveTo(-rx, 0);
    g.bezierCurveTo(-rx * 1.15, -ry * 1.5, -rx * 0.5, -ry * 2.05, 0, -ry * 2.05);
    g.bezierCurveTo(rx * 0.5, -ry * 2.05, rx * 1.15, -ry * 1.5, rx, 0);
    g.quadraticCurveTo(rx * 0.5, ry * 0.12, 0, ry * 0.1);
    g.quadraticCurveTo(-rx * 0.5, ry * 0.12, -rx, 0);
    g.closePath();
    g.fillStyle = gr; g.fill(); outline(g, 2.4);
    // Glanz
    ell(g, -rx * 0.4, -ry * 1.5, rx * 0.28, ry * 0.4);
    g.fillStyle = 'rgba(255,255,255,0.55)'; g.fill();
    // Blase im Inneren
    ell(g, rx * 0.3, -ry * 0.7, rx * 0.16, rx * 0.16);
    g.fillStyle = 'rgba(255,255,255,0.25)'; g.fill();
    eyes(g, s * 0.25, -ry * 1.1, s * 0.19);
    // Mund
    g.beginPath(); g.arc(s * 0.3, -ry * 0.72, s * 0.22, 0.15, Math.PI - 0.3);
    g.strokeStyle = 'rgba(20,40,25,0.7)'; g.lineWidth = 2; g.stroke();
    // Tropfen
    ell(g, -rx * 0.9, -1.5, 2.6, 3.2); g.fillStyle = sp.c2; g.fill();
  };

  M.gob = (g, sp, f) => {
    const s = sp.r, sw = f ? 1 : -1;
    // Beine
    limb(g, -3, -s * 0.5, -4 - sw * 2.4, 0, 4.6, sp.c2);
    limb(g, 3, -s * 0.5, 4 + sw * 2.4, 0, 4.6, sp.c2);
    // Körper mit Lumpen
    ell(g, 0, -s * 0.85, s * 0.62, s * 0.55);
    g.fillStyle = vgrad(g, -s * 1.4, -s * 0.3, sp.c1, sp.c2); g.fill(); outline(g, 2.2);
    g.beginPath();
    g.moveTo(-s * 0.55, -s * 0.85); g.lineTo(s * 0.55, -s * 0.85);
    g.lineTo(s * 0.4, -s * 0.35); g.lineTo(s * 0.15, -s * 0.5); g.lineTo(-s * 0.1, -s * 0.32) ; g.lineTo(-s * 0.4, -s * 0.5);
    g.closePath();
    g.fillStyle = '#7a5a34'; g.fill(); outline(g, 1.8);
    // Arme
    limb(g, -s * 0.4, -s * 0.9, -s * 0.75, -s * 0.55 - sw * 2, 4, sp.c1);
    limb(g, s * 0.4, -s * 0.95, s * 0.9, -s * 0.75 + sw * 2, 4, sp.c1);
    // Waffe
    if (sp.ranged) { // Stein in der Hand
      ell(g, s * 1.0, -s * 0.75 + sw * 2, 4.5, 4);
      g.fillStyle = '#8a8478'; g.fill(); outline(g, 1.8);
    } else { // Dolch
      g.save(); g.translate(s * 0.95, -s * 0.75 + sw * 2); g.rotate(-0.5);
      g.fillStyle = '#cfd5de';
      g.beginPath(); g.moveTo(0, 0); g.lineTo(9, -3.6); g.lineTo(0, -6); g.closePath(); g.fill(); outline(g, 1.6);
      g.fillStyle = '#6e4a26'; g.fillRect(-4, -4.4, 4.5, 3.4);
      g.restore();
    }
    // Kopf
    const hy = -s * 1.5;
    ell(g, 0, hy, s * 0.6, s * 0.55);
    g.fillStyle = vgrad(g, hy - s * 0.6, hy + s * 0.5, U.shade(sp.c1, 0.15), sp.c1); g.fill(); outline(g, 2.2);
    // Ohren
    for (const sd of [-1, 1]) {
      g.beginPath();
      g.moveTo(sd * s * 0.5, hy - 2);
      g.quadraticCurveTo(sd * s * 1.15, hy - s * 0.5, sd * s * 1.2, hy - 1);
      g.quadraticCurveTo(sd * s * 0.9, hy + 2, sd * s * 0.45, hy + 3);
      g.closePath();
      g.fillStyle = sp.c1; g.fill(); outline(g, 1.8);
    }
    eyes(g, s * 0.18, hy - 2, s * 0.16, 1, '#a02328');
    // Grinsen mit Zahn
    g.beginPath(); g.arc(s * 0.16, hy + s * 0.22, s * 0.26, 0.2, Math.PI - 0.5);
    g.strokeStyle = 'rgba(30,20,15,0.75)'; g.lineWidth = 1.8; g.stroke();
    g.fillStyle = '#fff';
    g.beginPath(); g.moveTo(s * 0.3, hy + s * 0.32); g.lineTo(s * 0.38, hy + s * 0.52); g.lineTo(s * 0.46, hy + s * 0.3); g.closePath(); g.fill();
    if (sp.ranged) { // Stirnband
      g.strokeStyle = '#a02328'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(-s * 0.55, hy - s * 0.26); g.lineTo(s * 0.55, hy - s * 0.3); g.stroke();
    }
  };

  M.skel = (g, sp, f) => {
    const s = sp.r, sw = f ? 1 : -1;
    const bone = sp.c1, boneD = sp.c2;
    // Beine
    limb(g, -3, -s * 0.55, -3 - sw * 2.6, 0, 3.4, bone);
    limb(g, 3, -s * 0.55, 3 + sw * 2.6, 0, 3.4, bone);
    // Becken
    ell(g, 0, -s * 0.6, s * 0.34, s * 0.2); g.fillStyle = bone; g.fill(); outline(g, 1.8);
    // Wirbel + Rippen
    limb(g, 0, -s * 0.6, 0, -s * 1.42, 3.2, bone);
    g.strokeStyle = bone; g.lineWidth = 2.6;
    for (let i = 0; i < 3; i++) {
      const y = -s * (0.85 + i * 0.22);
      g.beginPath(); g.arc(0, y, s * (0.4 - i * 0.05), Math.PI * 0.15, Math.PI * 0.85); g.stroke();
      g.beginPath(); g.arc(0, y - 2, s * (0.4 - i * 0.05), Math.PI * 1.15, Math.PI * 1.85); g.stroke();
    }
    // Arme
    limb(g, -s * 0.3, -s * 1.3, -s * 0.62, -s * 0.85 - sw * 2, 3, boneD);
    limb(g, s * 0.3, -s * 1.3, s * 0.72, -s * 0.95 + sw * 2, 3, bone);
    if (sp.ranged) { // Bogen
      g.strokeStyle = '#6e4a26'; g.lineWidth = 2.8;
      g.beginPath(); g.arc(s * 0.8, -s * 0.95 + sw * 2, s * 0.55, -Math.PI * 0.42, Math.PI * 0.42); g.stroke();
      g.strokeStyle = '#ded6c4'; g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(s * 0.8 + Math.cos(-Math.PI * 0.42) * s * 0.55, -s * 0.95 + sw * 2 + Math.sin(-Math.PI * 0.42) * s * 0.55);
      g.lineTo(s * 0.8 + Math.cos(Math.PI * 0.42) * s * 0.55, -s * 0.95 + sw * 2 + Math.sin(Math.PI * 0.42) * s * 0.55);
      g.stroke();
    } else { // Rostschwert
      g.save(); g.translate(s * 0.75, -s * 0.95 + sw * 2); g.rotate(-0.9);
      g.fillStyle = '#9a8f7a';
      g.beginPath(); g.moveTo(0, -1.8); g.lineTo(s * 0.95, -3.4); g.lineTo(s * 1.05, -2.2); g.lineTo(s * 0.95, -1); g.lineTo(0, 1.4); g.closePath();
      g.fill(); outline(g, 1.6);
      g.strokeStyle = '#5a4632'; g.lineWidth = 2.6;
      g.beginPath(); g.moveTo(1, -5); g.lineTo(1, 4); g.stroke();
      g.restore();
    }
    // Schädel
    const hy = -s * 1.75;
    ell(g, 0, hy, s * 0.48, s * 0.44);
    g.fillStyle = vgrad(g, hy - s * 0.5, hy + s * 0.4, '#f4efe2', bone); g.fill(); outline(g, 2.2);
    rr(g, -s * 0.26, hy + s * 0.24, s * 0.52, s * 0.26, 2);
    g.fillStyle = bone; g.fill(); outline(g, 1.8);
    // Augenhöhlen mit Glut
    for (const sd of [-1, 1]) {
      ell(g, sd * s * 0.2, hy - 1, s * 0.13, s * 0.15);
      g.fillStyle = '#16181e'; g.fill();
      ell(g, sd * s * 0.2, hy - 1, s * 0.05, s * 0.06);
      g.fillStyle = '#7ad0ec'; g.fill();
    }
    g.strokeStyle = '#16181e'; g.lineWidth = 1.2;
    for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(i * 3, hy + s * 0.26); g.lineTo(i * 3, hy + s * 0.44); g.stroke(); }
  };

  M.orc = (g, sp, f) => {
    const s = sp.r, sw = f ? 1 : -1;
    // Beine
    limb(g, -s * 0.3, -s * 0.5, -s * 0.32 - sw * 3, 0, 7, sp.c2);
    limb(g, s * 0.3, -s * 0.5, s * 0.32 + sw * 3, 0, 7, sp.c2);
    // Torso massiv
    g.beginPath();
    g.moveTo(-s * 0.72, -s * 0.4);
    g.quadraticCurveTo(-s * 0.85, -s * 1.35, -s * 0.3, -s * 1.5);
    g.lineTo(s * 0.35, -s * 1.5);
    g.quadraticCurveTo(s * 0.8, -s * 1.3, s * 0.66, -s * 0.4);
    g.quadraticCurveTo(0, -s * 0.22, -s * 0.72, -s * 0.4);
    g.closePath();
    g.fillStyle = vgrad(g, -s * 1.55, -s * 0.3, U.shade(sp.c1, 0.12), sp.c2); g.fill(); outline(g, 2.6);
    // Bauchplatte
    ell(g, 0, -s * 0.62, s * 0.34, s * 0.26);
    g.fillStyle = U.shade(sp.c1, 0.25); g.fill();
    // Gürtel
    g.fillStyle = '#5a4028'; g.fillRect(-s * 0.62, -s * 0.48, s * 1.26, s * 0.16);
    g.fillStyle = '#c9a13a'; g.fillRect(-s * 0.1, -s * 0.5, s * 0.2, s * 0.2);
    // Schulterpanzer
    ell(g, -s * 0.55, -s * 1.4, s * 0.34, s * 0.24);
    g.fillStyle = vgrad(g, -s * 1.65, -s * 1.15, '#8a8f9a', '#4c5568'); g.fill(); outline(g, 2.2);
    g.fillStyle = '#c9ccd4'; ell(g, -s * 0.62, -s * 1.46, s * 0.07, s * 0.07); g.fill();
    // Arme
    limb(g, -s * 0.55, -s * 1.25, -s * 0.8, -s * 0.6 - sw * 2, 6.4, sp.c1);
    limb(g, s * 0.5, -s * 1.3, s * 0.95, -s * 0.85 + sw * 2, 6.4, sp.c1);
    // Axt
    g.save(); g.translate(s * 1.0, -s * 0.85 + sw * 2); g.rotate(-0.35);
    g.strokeStyle = '#6e4a26'; g.lineWidth = 3.4;
    g.beginPath(); g.moveTo(0, 6); g.lineTo(0, -s * 0.95); g.stroke();
    g.fillStyle = vgrad(g, -s * 1.3, -s * 0.5, '#c9ccd4', '#7d7e8a');
    g.beginPath();
    g.moveTo(0, -s * 0.95);
    g.quadraticCurveTo(s * 0.5, -s * 1.05, s * 0.5, -s * 0.55);
    g.quadraticCurveTo(s * 0.25, -s * 0.72, 0, -s * 0.68);
    g.closePath(); g.fill(); outline(g, 2);
    if (sp.rage) {
      g.beginPath();
      g.moveTo(0, -s * 0.95); g.quadraticCurveTo(-s * 0.5, -s * 1.05, -s * 0.5, -s * 0.55);
      g.quadraticCurveTo(-s * 0.25, -s * 0.72, 0, -s * 0.68);
      g.closePath(); g.fill(); outline(g, 2);
    }
    g.restore();
    // Kopf klein, Unterbiss
    const hy = -s * 1.72;
    ell(g, s * 0.05, hy, s * 0.42, s * 0.38);
    g.fillStyle = vgrad(g, hy - s * 0.4, hy + s * 0.35, U.shade(sp.c1, 0.2), sp.c1); g.fill(); outline(g, 2.2);
    eyes(g, s * 0.2, hy - 2, s * 0.11, 1, sp.rage ? '#ff4a4a' : '#3a2a18');
    // Kiefer + Hauer
    rr(g, -s * 0.24, hy + s * 0.14, s * 0.6, s * 0.2, 3);
    g.fillStyle = U.shade(sp.c1, -0.12); g.fill(); outline(g, 1.8);
    g.fillStyle = '#fff';
    g.beginPath(); g.moveTo(-s * 0.14, hy + s * 0.18); g.lineTo(-s * 0.08, hy - s * 0.02); g.lineTo(-s * 0.0, hy + s * 0.18); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(s * 0.22, hy + s * 0.18); g.lineTo(s * 0.28, hy - s * 0.02); g.lineTo(s * 0.36, hy + s * 0.18); g.closePath(); g.fill();
    if (sp.rage) { // Kriegsbemalung
      g.strokeStyle = '#e5484d'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(-s * 0.1, hy - s * 0.28); g.lineTo(s * 0.05, hy - s * 0.1); g.stroke();
    }
  };

  M.wolf = (g, sp, f) => {
    const s = sp.r, sw = f ? 1 : -1;
    // Beine (diagonal alternierend)
    limb(g, -s * 0.55, -s * 0.55, -s * 0.62 - sw * 3, 0, 4.6, sp.c2);
    limb(g, s * 0.5, -s * 0.55, s * 0.56 + sw * 3, 0, 4.6, sp.c2);
    limb(g, -s * 0.35, -s * 0.55, -s * 0.4 + sw * 3, 0, 4.6, sp.c1);
    limb(g, s * 0.7, -s * 0.55, s * 0.76 - sw * 3, 0, 4.6, sp.c1);
    // Rumpf horizontal
    g.beginPath();
    g.moveTo(-s * 0.95, -s * 0.62);
    g.quadraticCurveTo(-s * 0.6, -s * 1.15, 0, -s * 1.1);
    g.quadraticCurveTo(s * 0.65, -s * 1.18, s * 0.95, -s * 0.75);
    g.quadraticCurveTo(s * 1.0, -s * 0.4, s * 0.6, -s * 0.38);
    g.quadraticCurveTo(0, -s * 0.3, -s * 0.85, -s * 0.42);
    g.closePath();
    g.fillStyle = vgrad(g, -s * 1.2, -s * 0.3, U.shade(sp.c1, 0.12), sp.c2); g.fill(); outline(g, 2.4);
    // Buschiger Schweif
    g.beginPath();
    g.moveTo(-s * 0.9, -s * 0.75);
    g.quadraticCurveTo(-s * 1.5, -s * 1.25, -s * 1.35, -s * 1.5 - sw * 1.5);
    g.quadraticCurveTo(-s * 1.15, -s * 1.1, -s * 0.8, -s * 0.95);
    g.closePath();
    g.fillStyle = sp.c2; g.fill(); outline(g, 2);
    // Kopf
    const hx = s * 0.95, hy = -s * 0.95;
    ell(g, hx, hy, s * 0.42, s * 0.36);
    g.fillStyle = vgrad(g, hy - s * 0.4, hy + s * 0.3, U.shade(sp.c1, 0.15), sp.c1); g.fill(); outline(g, 2.2);
    // Schnauze
    g.beginPath();
    g.moveTo(hx + s * 0.25, hy - s * 0.06);
    g.lineTo(hx + s * 0.72, hy + s * 0.08);
    g.lineTo(hx + s * 0.25, hy + s * 0.26);
    g.closePath();
    g.fillStyle = sp.c1; g.fill(); outline(g, 2);
    ell(g, hx + s * 0.68, hy + s * 0.07, 2.4, 2.2); g.fillStyle = '#16181e'; g.fill();
    // Zähne
    g.fillStyle = '#fff';
    g.beginPath(); g.moveTo(hx + s * 0.4, hy + s * 0.18); g.lineTo(hx + s * 0.45, hy + s * 0.32); g.lineTo(hx + s * 0.52, hy + s * 0.16); g.closePath(); g.fill();
    // Ohren
    for (const d of [-0.12, 0.2]) {
      g.beginPath();
      g.moveTo(hx - s * 0.25 + d * s, hy - s * 0.25);
      g.lineTo(hx - s * 0.1 + d * s, hy - s * 0.72);
      g.lineTo(hx + s * 0.1 + d * s, hy - s * 0.3);
      g.closePath();
      g.fillStyle = sp.c2; g.fill(); outline(g, 1.8);
    }
    // Auge
    ell(g, hx + s * 0.1, hy - s * 0.05, s * 0.09, s * 0.1);
    g.fillStyle = sp.fam === 'wolf' && sp.name.includes('Alpha') ? '#ff4a4a' : '#ffd34e'; g.fill();
    ell(g, hx + s * 0.12, hy - s * 0.05, s * 0.035, s * 0.05); g.fillStyle = '#16181e'; g.fill();
    // Fell-Zacken auf Rücken
    g.fillStyle = sp.c2;
    for (let i = 0; i < 3; i++) {
      const x = -s * 0.45 + i * s * 0.38;
      g.beginPath(); g.moveTo(x, -s * 1.05); g.lineTo(x + s * 0.12, -s * 1.32); g.lineTo(x + s * 0.26, -s * 1.02); g.closePath(); g.fill();
    }
  };

  M.spider = (g, sp, f) => {
    const s = sp.r;
    // Beine: 4 je Seite
    g.strokeStyle = sp.c2; g.lineWidth = 3;
    for (let i = 0; i < 4; i++) {
      const bx = -s * 0.2 + i * s * 0.24;
      const phase = (i % 2 === (f ? 0 : 1)) ? 1 : -1;
      for (const sd of [-1, 1]) {
        const kneeX = bx + sd * s * 0.7, kneeY = -s * 1.15 - phase * 2;
        const footX = bx + sd * (s * 1.15 + phase * 2), footY = 0;
        g.beginPath();
        g.moveTo(bx, -s * 0.7);
        g.quadraticCurveTo(kneeX, kneeY, footX, footY);
        g.stroke();
      }
    }
    // Hinterleib
    ell(g, -s * 0.55, -s * 0.85, s * 0.72, s * 0.6);
    g.fillStyle = vgrad(g, -s * 1.45, -s * 0.3, U.shade(sp.c1, 0.1), sp.c2); g.fill(); outline(g, 2.4);
    // Markierung
    g.fillStyle = sp.venom ? '#b6e05a' : '#d8c8e8';
    g.beginPath();
    g.moveTo(-s * 0.55, -s * 1.25);
    g.lineTo(-s * 0.35, -s * 0.95); g.lineTo(-s * 0.55, -s * 0.75); g.lineTo(-s * 0.75, -s * 0.95);
    g.closePath(); g.fill(); outline(g, 1.6);
    // Kopf
    ell(g, s * 0.42, -s * 0.68, s * 0.42, s * 0.38);
    g.fillStyle = vgrad(g, -s * 1.05, -s * 0.3, sp.c1, sp.c2); g.fill(); outline(g, 2.2);
    // 4 rote Augen
    for (let i = 0; i < 4; i++) {
      const ex = s * (0.3 + (i % 2) * 0.24), ey = -s * (0.78 - Math.floor(i / 2) * 0.16);
      ell(g, ex, ey, s * (i < 2 ? 0.09 : 0.06), s * (i < 2 ? 0.1 : 0.07));
      g.fillStyle = '#ff3a3a'; g.fill();
      ell(g, ex - 1, ey - 1, s * 0.025, s * 0.025); g.fillStyle = '#ffb4b4'; g.fill();
    }
    // Mandibeln
    g.strokeStyle = sp.c2; g.lineWidth = 2.6;
    g.beginPath(); g.moveTo(s * 0.75, -s * 0.55); g.quadraticCurveTo(s * 0.95, -s * 0.45, s * 0.85, -s * 0.28); g.stroke();
    g.beginPath(); g.moveTo(s * 0.8, -s * 0.62); g.quadraticCurveTo(s * 1.05, -s * 0.5, s * 0.98, -s * 0.34); g.stroke();
    if (sp.venom) { // Giftsack
      ell(g, -s * 0.55, -s * 0.5, s * 0.2, s * 0.15);
      g.fillStyle = 'rgba(182,224,90,0.8)'; g.fill();
    }
  };

  M.troll = (g, sp, f) => {
    const s = sp.r, sw = f ? 1 : -1;
    // Beine stämmig
    limb(g, -s * 0.35, -s * 0.35, -s * 0.4 - sw * 2, 0, 9, sp.c2);
    limb(g, s * 0.35, -s * 0.35, s * 0.4 + sw * 2, 0, 9, sp.c2);
    // Birnenkörper
    g.beginPath();
    g.moveTo(-s * 0.8, -s * 0.3);
    g.bezierCurveTo(-s * 1.05, -s * 1.1, -s * 0.55, -s * 1.62, 0, -s * 1.62);
    g.bezierCurveTo(s * 0.55, -s * 1.62, s * 1.0, -s * 1.05, s * 0.78, -s * 0.3);
    g.quadraticCurveTo(0, -s * 0.05, -s * 0.8, -s * 0.3);
    g.closePath();
    g.fillStyle = vgrad(g, -s * 1.65, -s * 0.1, U.shade(sp.c1, 0.1), sp.c2); g.fill(); outline(g, 2.8);
    // Bauch
    ell(g, 0, -s * 0.55, s * 0.42, s * 0.32);
    g.fillStyle = U.shade(sp.c1, 0.28); g.fill();
    // Lendenschurz
    g.fillStyle = '#7a5a34';
    g.beginPath();
    g.moveTo(-s * 0.5, -s * 0.4); g.lineTo(s * 0.5, -s * 0.4); g.lineTo(s * 0.35, -s * 0.1); g.lineTo(0, -s * 0.22); g.lineTo(-s * 0.35, -s * 0.08);
    g.closePath(); g.fill(); outline(g, 2);
    // Warzen
    g.fillStyle = U.shade(sp.c1, -0.18);
    ell(g, -s * 0.5, -s * 1.2, 2.6, 2.6); g.fill();
    ell(g, s * 0.42, -s * 0.9, 2.2, 2.2); g.fill();
    // Arme lang
    limb(g, -s * 0.6, -s * 1.25, -s * 1.0, -s * 0.35 - sw * 2.5, 8, sp.c1);
    limb(g, s * 0.6, -s * 1.3, s * 1.05, -s * 0.5 + sw * 2.5, 8, sp.c1);
    if (sp.ranged) { // Felsbrocken
      ell(g, s * 1.15, -s * 0.55 + sw * 2.5, s * 0.32, s * 0.28);
      g.fillStyle = vgrad(g, -s * 0.85, -s * 0.25, '#a8a29a', '#6a655c'); g.fill(); outline(g, 2.2);
    } else { // Keule mit Stacheln
      g.save(); g.translate(s * 1.05, -s * 0.5 + sw * 2.5); g.rotate(0.45);
      g.fillStyle = vgrad(g, -s * 1.2, 0, '#8a6234', '#5a3d1e');
      g.beginPath();
      g.moveTo(-3.5, 4); g.lineTo(-2, -s * 0.7); g.quadraticCurveTo(0, -s * 1.15, s * 0.22, -s * 0.72); g.lineTo(s * 0.2, 2);
      g.closePath(); g.fill(); outline(g, 2.2);
      g.fillStyle = '#c9ccd4';
      for (const [px, py] of [[-2, -s * 0.85], [s * 0.16, -s * 0.9], [s * 0.05, -s * 1.05]]) {
        g.beginPath(); g.moveTo(px, py); g.lineTo(px + 2, py - 5); g.lineTo(px + 4, py); g.closePath(); g.fill();
      }
      g.restore();
    }
    // Kopf
    const hy = -s * 1.78;
    ell(g, 0, hy, s * 0.36, s * 0.3);
    g.fillStyle = sp.c1; g.fill(); outline(g, 2.4);
    eyes(g, s * 0.12, hy - 1, s * 0.08, 1, '#2a1e14');
    // Riesige Nase
    ell(g, s * 0.16, hy + s * 0.1, s * 0.13, s * 0.1);
    g.fillStyle = U.shade(sp.c1, -0.1); g.fill(); outline(g, 1.6);
    // Unterbiss
    rr(g, -s * 0.2, hy + s * 0.14, s * 0.46, s * 0.14, 2);
    g.fillStyle = U.shade(sp.c1, -0.15); g.fill();
    g.fillStyle = '#fff';
    g.beginPath(); g.moveTo(-s * 0.1, hy + s * 0.16); g.lineTo(-s * 0.05, hy + s * 0.02); g.lineTo(0, hy + s * 0.16); g.closePath(); g.fill();
  };

  M.golem = (g, sp, f) => {
    const s = sp.r, sw = f ? 1.5 : -1.5;
    const rock = (x, y, rx, ry, light) => {
      g.beginPath();
      const n = 7;
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        const rad = 1 + Math.sin(a * 3 + x) * 0.12;
        const px = x + Math.cos(a) * rx * rad, py = y + Math.sin(a) * ry * rad;
        i ? g.lineTo(px, py) : g.moveTo(px, py);
      }
      g.closePath();
      g.fillStyle = vgrad(g, y - ry, y + ry, U.shade(sp.c1, light), sp.c2); g.fill(); outline(g, 2.6);
    };
    // Arme (Felsen)
    rock(-s * 0.85, -s * 0.75 - sw, s * 0.3, s * 0.42, 0.0);
    rock(s * 0.85, -s * 0.75 + sw, s * 0.3, s * 0.42, 0.0);
    // Körper
    rock(0, -s * 0.85, s * 0.72, s * 0.72, 0.12);
    // Kern (glüht)
    const core = sp.core || '#7fd8ff';
    g.save();
    const cg = g.createRadialGradient(0, -s * 0.8, 1, 0, -s * 0.8, s * 0.4);
    cg.addColorStop(0, '#ffffff'); cg.addColorStop(0.4, core); cg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = cg; ell(g, 0, -s * 0.8, s * 0.4, s * 0.4); g.fill();
    g.restore();
    ell(g, 0, -s * 0.8, s * 0.17, s * 0.17);
    g.fillStyle = core; g.fill(); outline(g, 2);
    // Risse
    g.strokeStyle = sp.core === '#ff9d2e' ? 'rgba(255,140,40,0.8)' : 'rgba(30,30,40,0.5)';
    g.lineWidth = 1.8;
    g.beginPath(); g.moveTo(-s * 0.3, -s * 1.2); g.lineTo(-s * 0.15, -s * 1.0); g.lineTo(-s * 0.3, -s * 0.8); g.stroke();
    g.beginPath(); g.moveTo(s * 0.35, -s * 0.65); g.lineTo(s * 0.5, -s * 0.5); g.stroke();
    // Kopf
    rock(s * 0.1, -s * 1.72, s * 0.34, s * 0.26, 0.2);
    // Augen
    for (const sd of [-1, 1]) {
      ell(g, s * 0.1 + sd * s * 0.14, -s * 1.74, s * 0.06, s * 0.07);
      g.fillStyle = core; g.fill();
    }
    // Moos
    if (!sp.core || sp.core === '#7fd8ff') {
      g.fillStyle = 'rgba(110,160,80,0.75)';
      ell(g, -s * 0.45, -s * 1.35, s * 0.2, s * 0.09); g.fill();
      ell(g, s * 0.5, -s * 1.1, s * 0.14, s * 0.07); g.fill();
    }
  };

  M.cult = (g, sp, f) => {
    const s = sp.r, sw = f ? 1 : -1;
    // Robe
    g.beginPath();
    g.moveTo(-s * 0.62, 0);
    g.quadraticCurveTo(-s * 0.55, -s * 1.2, -s * 0.25, -s * 1.62);
    g.quadraticCurveTo(0, -s * 1.8, s * 0.25, -s * 1.62);
    g.quadraticCurveTo(s * 0.55, -s * 1.2, s * 0.62, 0);
    g.quadraticCurveTo(s * 0.3, s * 0.06 + sw, 0, 0);
    g.quadraticCurveTo(-s * 0.3, s * 0.06 - sw, -s * 0.62, 0);
    g.closePath();
    g.fillStyle = vgrad(g, -s * 1.8, 0, U.shade(sp.c1, 0.08), sp.c2); g.fill(); outline(g, 2.4);
    // Faltenlinien
    g.strokeStyle = 'rgba(20,10,30,0.4)'; g.lineWidth = 1.8;
    g.beginPath(); g.moveTo(-s * 0.2, -s * 1.0); g.quadraticCurveTo(-s * 0.25, -s * 0.5, -s * 0.18, 0); g.stroke();
    g.beginPath(); g.moveTo(s * 0.2, -s * 1.0); g.quadraticCurveTo(s * 0.28, -s * 0.5, s * 0.22, 0); g.stroke();
    // Kapuze / Gesicht
    ell(g, 0, -s * 1.45, s * 0.34, s * 0.3);
    g.fillStyle = '#0e0a14'; g.fill();
    g.strokeStyle = U.shade(sp.c1, 0.2); g.lineWidth = 2.2;
    g.beginPath(); g.arc(0, -s * 1.45, s * 0.36, Math.PI * 0.85, Math.PI * 2.15); g.stroke();
    for (const sd of [-1, 1]) {
      ell(g, sd * s * 0.12, -s * 1.45, s * 0.05, s * 0.07);
      g.fillStyle = '#c9a8ff'; g.fill();
    }
    // Gürtelkordel
    g.strokeStyle = '#c9a13a'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(-s * 0.4, -s * 0.75); g.quadraticCurveTo(0, -s * 0.62, s * 0.4, -s * 0.75); g.stroke();
    // Stab mit Orb
    g.strokeStyle = '#4a3a5c'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(s * 0.55, 0); g.lineTo(s * 0.62, -s * 1.7); g.stroke();
    const og = g.createRadialGradient(s * 0.63, -s * 1.85, 1, s * 0.63, -s * 1.85, s * 0.28);
    og.addColorStop(0, '#f4e8ff'); og.addColorStop(0.6, '#a86ee8'); og.addColorStop(1, 'rgba(120,60,180,0)');
    g.fillStyle = og; ell(g, s * 0.63, -s * 1.85, s * 0.28, s * 0.28); g.fill();
    ell(g, s * 0.63, -s * 1.85, s * 0.13, s * 0.13);
    g.fillStyle = '#c9a8ff'; g.fill(); outline(g, 1.8);
  };

  M.imp = (g, sp, f) => {
    const s = sp.r, sw = f ? 1 : -1;
    // Flügel
    for (const sd of [-1, 1]) {
      g.beginPath();
      g.moveTo(sd * s * 0.3, -s * 1.25);
      g.quadraticCurveTo(sd * s * 1.2, -s * 1.7 - sw * 3, sd * s * 1.25, -s * 1.0 - sw * 3);
      g.quadraticCurveTo(sd * s * 0.85, -s * 1.05, sd * s * 0.7, -s * 0.8);
      g.quadraticCurveTo(sd * s * 0.5, -s * 0.95, sd * s * 0.3, -s * 0.85);
      g.closePath();
      g.fillStyle = vgrad(g, -s * 1.7, -s * 0.8, U.shade(sp.c2, 0.05), '#2a1214'); g.fill(); outline(g, 2);
    }
    // Beine
    limb(g, -3, -s * 0.5, -4 - sw * 2, 0, 4, sp.c2);
    limb(g, 3, -s * 0.5, 4 + sw * 2, 0, 4, sp.c2);
    // Körper
    ell(g, 0, -s * 0.85, s * 0.55, s * 0.5);
    g.fillStyle = vgrad(g, -s * 1.35, -s * 0.35, U.shade(sp.c1, 0.15), sp.c2); g.fill(); outline(g, 2.2);
    // Schweif
    g.strokeStyle = sp.c2; g.lineWidth = 3;
    g.beginPath();
    g.moveTo(-s * 0.45, -s * 0.6);
    g.quadraticCurveTo(-s * 1.1, -s * 0.55, -s * 1.15, -s * 1.05 - sw * 2);
    g.stroke();
    g.fillStyle = sp.c2;
    g.beginPath();
    g.moveTo(-s * 1.28, -s * 1.12 - sw * 2); g.lineTo(-s * 1.0, -s * 1.12 - sw * 2); g.lineTo(-s * 1.15, -s * 0.88 - sw * 2);
    g.closePath(); g.fill();
    // Arme mit Krallen
    limb(g, -s * 0.35, -s * 0.95, -s * 0.65, -s * 0.6, 3.4, sp.c1);
    limb(g, s * 0.35, -s * 0.95, s * 0.7, -s * 0.65, 3.4, sp.c1);
    // Kopf
    const hy = -s * 1.5;
    ell(g, 0, hy, s * 0.5, s * 0.44);
    g.fillStyle = vgrad(g, hy - s * 0.45, hy + s * 0.4, U.shade(sp.c1, 0.18), sp.c1); g.fill(); outline(g, 2.2);
    // Hörner
    for (const sd of [-1, 1]) {
      g.beginPath();
      g.moveTo(sd * s * 0.28, hy - s * 0.3);
      g.quadraticCurveTo(sd * s * 0.5, hy - s * 0.75, sd * s * 0.3, hy - s * 0.85);
      g.quadraticCurveTo(sd * s * 0.32, hy - s * 0.55, sd * s * 0.12, hy - s * 0.38);
      g.closePath();
      g.fillStyle = '#f0e4d0'; g.fill(); outline(g, 1.8);
    }
    eyes(g, s * 0.16, hy - 1, s * 0.13, 1, '#ffd34e');
    // Grinsen
    g.beginPath(); g.arc(s * 0.1, hy + s * 0.2, s * 0.22, 0.2, Math.PI - 0.4);
    g.strokeStyle = 'rgba(30,10,10,0.8)'; g.lineWidth = 1.8; g.stroke();
  };

  M.gargoyle = (g, sp, f) => {
    M.imp(g, { ...sp, c1: sp.c1, c2: sp.c2 }, f);
    // steinerne Textur-Risse
    const s = sp.r;
    g.strokeStyle = 'rgba(30,30,40,0.55)'; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(-s * 0.2, -s * 1.0); g.lineTo(-s * 0.05, -s * 0.8); g.stroke();
    g.beginPath(); g.moveTo(s * 0.15, -s * 1.6); g.lineTo(s * 0.28, -s * 1.45); g.stroke();
  };

  M.demon = (g, sp, f) => {
    const s = sp.r, sw = f ? 1 : -1;
    // Flügel groß
    for (const sd of [-1, 1]) {
      g.beginPath();
      g.moveTo(sd * s * 0.35, -s * 1.45);
      g.quadraticCurveTo(sd * s * 1.5, -s * 2.1 - sw * 3, sd * s * 1.7, -s * 1.1 - sw * 4);
      g.lineTo(sd * s * 1.25, -s * 1.15);
      g.lineTo(sd * s * 1.05, -s * 0.85);
      g.lineTo(sd * s * 0.7, -s * 1.0);
      g.closePath();
      g.fillStyle = vgrad(g, -s * 2.1, -s * 0.8, '#3a1218', '#1c0a0e'); g.fill(); outline(g, 2.2);
      g.strokeStyle = 'rgba(255,90,60,0.35)'; g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(sd * s * 0.5, -s * 1.35); g.lineTo(sd * s * 1.4, -s * 1.3 - sw * 3); g.stroke();
    }
    // Beine
    limb(g, -s * 0.28, -s * 0.45, -s * 0.32 - sw * 2.4, 0, 6.4, sp.c2);
    limb(g, s * 0.28, -s * 0.45, s * 0.32 + sw * 2.4, 0, 6.4, sp.c2);
    // Muskeltorso
    g.beginPath();
    g.moveTo(-s * 0.6, -s * 0.35);
    g.quadraticCurveTo(-s * 0.78, -s * 1.3, -s * 0.35, -s * 1.55);
    g.lineTo(s * 0.35, -s * 1.55);
    g.quadraticCurveTo(s * 0.78, -s * 1.3, s * 0.6, -s * 0.35);
    g.quadraticCurveTo(0, -s * 0.15, -s * 0.6, -s * 0.35);
    g.closePath();
    g.fillStyle = vgrad(g, -s * 1.6, -s * 0.2, U.shade(sp.c1, 0.12), sp.c2); g.fill(); outline(g, 2.6);
    // Brustmuskeln
    g.strokeStyle = 'rgba(30,8,12,0.5)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, -s * 1.45); g.lineTo(0, -s * 0.95); g.stroke();
    g.beginPath(); g.arc(-s * 0.2, -s * 1.1, s * 0.18, 0, Math.PI * 0.7); g.stroke();
    g.beginPath(); g.arc(s * 0.2, -s * 1.1, s * 0.18, Math.PI * 0.3, Math.PI); g.stroke();
    // Glührisse
    g.strokeStyle = '#ff7a2e'; g.lineWidth = 1.8;
    g.beginPath(); g.moveTo(-s * 0.35, -s * 0.8); g.lineTo(-s * 0.22, -s * 0.62); g.stroke();
    // Arme mit Klauen
    limb(g, -s * 0.5, -s * 1.3, -s * 0.85, -s * 0.6 - sw * 2.5, 5.6, sp.c1);
    limb(g, s * 0.5, -s * 1.3, s * 0.85, -s * 0.6 + sw * 2.5, 5.6, sp.c1);
    for (const sd of [-1, 1]) {
      const ax = sd * s * 0.85, ay = -s * 0.6 - sd * sw * 2.5 * (sd === -1 ? 1 : -1);
      g.fillStyle = '#f0e4d0';
      for (let i = -1; i <= 1; i++) {
        g.beginPath();
        g.moveTo(ax + i * 3, ay);
        g.lineTo(ax + i * 3 + 1.4, ay + 7);
        g.lineTo(ax + i * 3 + 2.8, ay);
        g.closePath(); g.fill();
      }
    }
    // Kopf mit großen Hörnern
    const hy = -s * 1.78;
    ell(g, 0, hy, s * 0.36, s * 0.32);
    g.fillStyle = sp.c1; g.fill(); outline(g, 2.4);
    for (const sd of [-1, 1]) {
      g.beginPath();
      g.moveTo(sd * s * 0.22, hy - s * 0.2);
      g.quadraticCurveTo(sd * s * 0.75, hy - s * 0.35, sd * s * 0.6, hy - s * 0.95);
      g.quadraticCurveTo(sd * s * 0.42, hy - s * 0.45, sd * s * 0.08, hy - s * 0.32);
      g.closePath();
      g.fillStyle = vgrad(g, hy - s, hy - s * 0.2, '#e8dcc8', '#a89478'); g.fill(); outline(g, 2);
    }
    // Feueraugen
    for (const sd of [-1, 1]) {
      ell(g, sd * s * 0.14, hy - 1, s * 0.08, s * 0.09);
      g.fillStyle = '#ffd34e'; g.fill();
      ell(g, sd * s * 0.14, hy - 1, s * 0.035, s * 0.045);
      g.fillStyle = '#ff5a2e'; g.fill();
    }
  };

  M.drake = (g, sp, f) => {
    const s = sp.r, sw = f ? 1 : -1;
    const belly = U.shade(sp.c1, 0.4);
    // Flügel (Flattern)
    for (const sd of [1]) {
      g.beginPath();
      g.moveTo(-s * 0.1, -s * 1.15);
      g.quadraticCurveTo(-s * 0.6, -s * 2.1 - sw * 6, -s * 1.5, -s * 1.7 - sw * 8);
      g.quadraticCurveTo(-s * 0.95, -s * 1.35 - sw * 2, -s * 0.55, -s * 1.0);
      g.closePath();
      g.fillStyle = vgrad(g, -s * 2.2, -s * 0.9, U.shade(sp.c2, 0.1), sp.c2); g.fill(); outline(g, 2.2);
      // Flügelfinger
      g.strokeStyle = 'rgba(20,20,20,0.35)'; g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(-s * 0.25, -s * 1.2); g.lineTo(-s * 1.1, -s * 1.6 - sw * 7); g.stroke();
    }
    // Schweif
    g.strokeStyle = sp.c1; g.lineWidth = s * 0.3;
    g.beginPath();
    g.moveTo(-s * 0.7, -s * 0.75);
    g.quadraticCurveTo(-s * 1.4, -s * 0.65, -s * 1.7, -s * 1.05 + sw * 2);
    g.stroke();
    g.fillStyle = sp.c2;
    g.beginPath();
    g.moveTo(-s * 1.85, -s * 1.2 + sw * 2); g.lineTo(-s * 1.5, -s * 1.15 + sw * 2); g.lineTo(-s * 1.7, -s * 0.82 + sw * 2);
    g.closePath(); g.fill(); outline(g, 1.8);
    // Rumpf
    ell(g, 0, -s * 0.85, s * 0.8, s * 0.55);
    g.fillStyle = vgrad(g, -s * 1.4, -s * 0.3, U.shade(sp.c1, 0.12), sp.c2); g.fill(); outline(g, 2.6);
    // Bauchplatten
    g.fillStyle = belly;
    ell(g, s * 0.1, -s * 0.55, s * 0.55, s * 0.26); g.fill();
    g.strokeStyle = 'rgba(30,20,15,0.35)'; g.lineWidth = 1.4;
    for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(s * 0.1 + i * s * 0.22 - s * 0.14, -s * 0.62); g.quadraticCurveTo(s * 0.1 + i * s * 0.22, -s * 0.42, s * 0.1 + i * s * 0.22 + s * 0.14, -s * 0.62); g.stroke(); }
    // Beine angezogen
    limb(g, -s * 0.3, -s * 0.55, -s * 0.35, -s * 0.2, 4.6, sp.c2);
    limb(g, s * 0.35, -s * 0.55, s * 0.42, -s * 0.2, 4.6, sp.c2);
    // Hals + Kopf
    g.strokeStyle = sp.c1; g.lineWidth = s * 0.34;
    g.beginPath();
    g.moveTo(s * 0.55, -s * 0.95);
    g.quadraticCurveTo(s * 0.95, -s * 1.25, s * 1.05, -s * 1.5);
    g.stroke();
    ell(g, s * 1.1, -s * 1.6, s * 0.36, s * 0.3);
    g.fillStyle = vgrad(g, -s * 1.9, -s * 1.3, U.shade(sp.c1, 0.15), sp.c1); g.fill(); outline(g, 2.2);
    // Schnauze
    rr(g, s * 1.25, -s * 1.68, s * 0.42, s * 0.24, s * 0.1);
    g.fillStyle = sp.c1; g.fill(); outline(g, 2);
    ell(g, s * 1.58, -s * 1.62, 1.8, 1.6); g.fillStyle = '#16181e'; g.fill();
    // Nüster-Rauch? (dynamisch) — Hörner
    for (const d of [-0.05, 0.14]) {
      g.beginPath();
      g.moveTo(s * (0.95 + d), -s * 1.78);
      g.lineTo(s * (0.85 + d), -s * 2.05);
      g.lineTo(s * (1.05 + d), -s * 1.82);
      g.closePath();
      g.fillStyle = '#f0e4d0'; g.fill(); outline(g, 1.6);
    }
    // Auge
    ell(g, s * 1.12, -s * 1.66, s * 0.08, s * 0.09);
    g.fillStyle = '#ffd34e'; g.fill();
    ell(g, s * 1.14, -s * 1.66, s * 0.03, s * 0.05);
    g.fillStyle = '#16181e'; g.fill();
    // Rückenzacken
    g.fillStyle = sp.c2;
    for (let i = 0; i < 3; i++) {
      const x = -s * 0.35 + i * s * 0.35;
      g.beginPath(); g.moveTo(x, -s * 1.3); g.lineTo(x + s * 0.12, -s * 1.55); g.lineTo(x + s * 0.26, -s * 1.28); g.closePath(); g.fill();
    }
  };

  function monster(spKey, sp, frame, sizeBucket) {
    const size = 5.4 * sp.r * (sp.big || 1) * sizeBucket;
    return make(`mon:${spKey}:${frame}:${sizeBucket.toFixed(2)}`, size, size, g => {
      g.scale(sizeBucket * (sp.big || 1), sizeBucket * (sp.big || 1));
      M[sp.fam](g, sp, frame);
    }, size * 0.1);
  }

  // ============================================================
  //  SPIELER (König) & DORFBEWOHNER
  // ============================================================

  function paintKing(g, f) {
    const sw = f === 0 ? 0 : (f === 1 ? 1 : -1);
    // Beine
    limb(g, -3.4, -7, -3.4 - sw * 3, 0, 5, '#5a3d24');
    limb(g, 3.4, -7, 3.4 + sw * 3, 0, 5, '#6e4a2c');
    // Cape (hinter dem Körper)
    g.beginPath();
    g.moveTo(-7, -24);
    g.quadraticCurveTo(-14 - sw * 1.5, -14, -11 - sw * 3, -1 + Math.abs(sw));
    g.quadraticCurveTo(-4, -4, -2, -8);
    g.lineTo(-2, -22);
    g.closePath();
    g.fillStyle = vgrad(g, -24, 0, '#d64545', '#8e1f2c'); g.fill(); outline(g, 2.2);
    // Körper (Tunika + Rüstung)
    rr(g, -7.5, -25, 15, 19, 6);
    g.fillStyle = vgrad(g, -25, -6, '#4a6ea8', '#2c4470'); g.fill(); outline(g, 2.4);
    // Brustplatte
    ell(g, 0, -19, 5.5, 5);
    g.fillStyle = vgrad(g, -24, -14, '#d7dde8', '#8a94a8'); g.fill();
    g.strokeStyle = 'rgba(40,45,60,0.5)'; g.lineWidth = 1.4; g.stroke();
    // Gürtel
    g.fillStyle = '#5a3d24'; g.fillRect(-7.5, -11, 15, 3.4);
    g.fillStyle = '#f2d24a'; g.fillRect(-2.2, -11.6, 4.4, 4.6);
    // Linker Arm
    limb(g, -6, -21, -9.5, -13 - sw * 1.5, 4.4, '#4a6ea8');
    ell(g, -9.5, -12 - sw * 1.5, 2.8, 2.8); g.fillStyle = '#f0c8a0'; g.fill(); outline(g, 1.6);
    // Kopf
    ell(g, 0, -32, 8.5, 8);
    g.fillStyle = vgrad(g, -40, -25, '#ffe0bd', '#f0c092'); g.fill(); outline(g, 2.2);
    // Gesicht
    ell(g, 2.8, -33, 1.15, 1.5); g.fillStyle = '#2c2620'; g.fill();
    ell(g, 6.4, -33, 1.15, 1.5); g.fill();
    g.strokeStyle = 'rgba(120,70,40,0.7)'; g.lineWidth = 1.3;
    g.beginPath(); g.arc(4.5, -29.5, 2.2, 0.3, Math.PI - 0.5); g.stroke();
    // Bart-Stoppel / Haar
    g.fillStyle = '#8a5a2c';
    g.beginPath(); g.arc(0, -33, 8.2, Math.PI * 0.75, Math.PI * 1.6); g.lineTo(-4, -36); g.closePath(); g.fill();
    // Krone
    g.beginPath();
    g.moveTo(-6.5, -38);
    g.lineTo(-6.5, -43.5); g.lineTo(-3.6, -40.5); g.lineTo(0, -44.5); g.lineTo(3.6, -40.5); g.lineTo(6.5, -43.5); g.lineTo(6.5, -38);
    g.closePath();
    g.fillStyle = vgrad(g, -45, -37, '#ffe084', '#d9930d'); g.fill(); outline(g, 2);
    ell(g, 0, -39.5, 1.5, 1.5); g.fillStyle = '#e5484d'; g.fill();
    ell(g, -4.4, -39.2, 1.05, 1.05); g.fillStyle = '#3b6ea5'; g.fill();
    ell(g, 4.4, -39.2, 1.05, 1.05); g.fillStyle = '#3f9e4e'; g.fill();
  }

  function king(f) {
    return make(`king:${f}`, 64, 64, g => paintKing(g, f), 8);
  }

  // Schwert (zeigt nach oben, Griff am Ursprung)
  function sword(tier) {
    const w = KS.CFG.WEAPONS[tier - 1];
    const L = 24 + tier * 2.6;
    return make(`sword:${tier}`, 30, L + 22, g => {
      g.translate(0, -6);
      if (w.glow) {
        g.save();
        g.shadowColor = w.glow; g.shadowBlur = 9;
        g.fillStyle = w.glow;
        rr(g, -2.4, -L, 4.8, L, 2.2); g.fill();
        g.restore();
      }
      // Klinge
      g.beginPath();
      g.moveTo(-2.6, 0);
      g.lineTo(-2.6, -L + 5);
      g.quadraticCurveTo(-2.6, -L, 0, -L - 3);
      g.quadraticCurveTo(2.6, -L, 2.6, -L + 5);
      g.lineTo(2.6, 0);
      g.closePath();
      const gr = g.createLinearGradient(-3, 0, 3, 0);
      gr.addColorStop(0, w.blade); gr.addColorStop(0.5, '#ffffff'); gr.addColorStop(1, U.shade(w.blade, -0.25));
      g.fillStyle = gr; g.fill(); outline(g, 1.8);
      // Blutrinne
      g.strokeStyle = 'rgba(60,70,90,0.4)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(0, -3); g.lineTo(0, -L + 6); g.stroke();
      // Parierstange
      rr(g, -7, -1.5, 14, 3.6, 1.6);
      g.fillStyle = tier >= 5 ? '#f2d24a' : '#8a6a3a'; g.fill(); outline(g, 1.6);
      // Griff
      rr(g, -1.9, 2, 3.8, 8, 1.6);
      g.fillStyle = '#5a3d24'; g.fill(); outline(g, 1.4);
      ell(g, 0, 11.5, 2.6, 2.6);
      g.fillStyle = tier >= 5 ? '#f2d24a' : '#8a6a3a'; g.fill(); outline(g, 1.4);
      if (tier >= 9) { ell(g, 0, 11.5, 1.2, 1.2); g.fillStyle = '#e5484d'; g.fill(); }
    }, 14);
  }

  function villager(idx, f) {
    const hues = ['#7a9e5a', '#a8724a', '#5a7a9e', '#9e5a7a', '#8a8a5a', '#5a9e8e'];
    const c = hues[idx % hues.length];
    return make(`vil:${idx % hues.length}:${f}`, 34, 42, g => {
      const sw = f ? 1.6 : -1.6;
      limb(g, -2, -5, -2 - sw, 0, 3.4, '#4a3a28');
      limb(g, 2, -5, 2 + sw, 0, 3.4, '#4a3a28');
      // Kittel
      g.beginPath();
      g.moveTo(-5.5, -4);
      g.quadraticCurveTo(-5, -14, 0, -15);
      g.quadraticCurveTo(5, -14, 5.5, -4);
      g.closePath();
      g.fillStyle = vgrad(g, -15, -3, U.shade(c, 0.15), U.shade(c, -0.15)); g.fill(); outline(g, 1.8);
      g.strokeStyle = 'rgba(40,30,20,0.5)'; g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(-4, -8); g.lineTo(4, -8); g.stroke();
      // Kopf
      ell(g, 0, -19, 4.6, 4.4);
      g.fillStyle = '#f5d5ae'; g.fill(); outline(g, 1.8);
      ell(g, 1.4, -19.5, 0.7, 0.9); g.fillStyle = '#2c2620'; g.fill();
      ell(g, 3.4, -19.5, 0.7, 0.9); g.fill();
      // Kapuze/Haube
      g.beginPath(); g.arc(0, -20, 4.8, Math.PI * 0.85, Math.PI * 2.12); g.closePath();
      g.fillStyle = U.shade(c, -0.25); g.fill(); outline(g, 1.6);
    }, 6);
  }

  // ============================================================
  //  MÜNZEN & LOOT
  // ============================================================

  function coin(kind) { // 0 Münze, 1 Großmünze, 2 Beutel, 3 Truhe
    if (kind === 2) {
      return make('coin:sack', 34, 36, g => {
        g.beginPath();
        g.moveTo(-9, 0);
        g.bezierCurveTo(-13, -8, -8, -16, -3, -18);
        g.quadraticCurveTo(-4, -21, 0, -21);
        g.quadraticCurveTo(4, -21, 3, -18);
        g.bezierCurveTo(8, -16, 13, -8, 9, 0);
        g.quadraticCurveTo(0, 2.4, -9, 0);
        g.closePath();
        g.fillStyle = vgrad(g, -21, 0, '#b08a56', '#77572e'); g.fill(); outline(g, 2);
        g.strokeStyle = '#f2d24a'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(-3.6, -18); g.lineTo(3.6, -18); g.stroke();
        g.fillStyle = '#ffd34e';
        g.font = '900 11px Nunito, sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('$', 0, -8.6);
      }, 4);
    }
    if (kind === 3) {
      return make('coin:chest', 42, 38, g => {
        rr(g, -14, -14, 28, 14, 3);
        g.fillStyle = vgrad(g, -14, 0, '#9a6a3a', '#6a4522'); g.fill(); outline(g, 2.2);
        g.beginPath();
        g.moveTo(-14, -14); g.lineTo(-14, -17); g.arc(0, -17, 14, Math.PI, 0); g.lineTo(14, -14);
        g.closePath();
        g.fillStyle = vgrad(g, -30, -13, '#b08048', '#7c552c'); g.fill(); outline(g, 2.2);
        // Goldrand + Schloss
        g.strokeStyle = '#f2d24a'; g.lineWidth = 2.2;
        g.beginPath(); g.moveTo(-14, -13.5); g.lineTo(14, -13.5); g.stroke();
        rr(g, -3, -16, 6, 7, 1.4);
        g.fillStyle = '#f2d24a'; g.fill(); outline(g, 1.6);
        // Münzen quellen heraus
        for (const [cx, cy] of [[-6, -28], [1, -31], [7, -27]]) {
          ell(g, cx, cy, 3.6, 3.4);
          g.fillStyle = '#ffd34e'; g.fill(); outline(g, 1.5);
        }
      }, 4);
    }
    const r = kind === 1 ? 10 : 7;
    return make(`coin:${kind}`, r * 3, r * 3.2, g => {
      ell(g, 0, -r, r, r);
      const gr = g.createRadialGradient(-r * 0.35, -r * 1.35, r * 0.15, 0, -r, r * 1.25);
      gr.addColorStop(0, '#fff3c0'); gr.addColorStop(0.45, '#ffd34e'); gr.addColorStop(1, '#d9930d');
      g.fillStyle = gr; g.fill();
      g.strokeStyle = '#a86e08'; g.lineWidth = 2; g.stroke();
      ell(g, 0, -r, r * 0.62, r * 0.62);
      g.strokeStyle = 'rgba(168,110,8,0.7)'; g.lineWidth = 1.4; g.stroke();
      // Krönchen-Prägung
      g.fillStyle = 'rgba(168,110,8,0.8)';
      const s = r * 0.4;
      g.beginPath();
      g.moveTo(-s, -r + s * 0.7);
      g.lineTo(-s, -r - s * 0.3); g.lineTo(-s * 0.4, -r + s * 0.1); g.lineTo(0, -r - s * 0.55);
      g.lineTo(s * 0.4, -r + s * 0.1); g.lineTo(s, -r - s * 0.3); g.lineTo(s, -r + s * 0.7);
      g.closePath(); g.fill();
    }, 4);
  }

  // ============================================================
  //  REQUISITEN (Bäume, Felsen, …)
  // ============================================================

  function prop(kind, variant) {
    const key = `prop:${kind}:${variant}`;
    const rnd = U.seededRng(kind.length * 1000 + variant * 77);
    if (kind === 'tree') {
      return make(key, 96, 116, g => {
        softShadow(g, 26, 9, 0.25);
        g.fillStyle = vgrad(g, -30, 0, '#8a6234', '#5c3f1e');
        rr(g, -5, -30, 10, 30, 4); g.fill(); outline(g, 2.2);
        const greens = [['#5da844', '#3f7d2e'], ['#6cb84e', '#4a8a34'], ['#4f9e3c', '#356e28']][variant % 3];
        const blob = (x, y, r) => {
          ell(g, x, y, r, r * 0.88);
          g.fillStyle = vgrad(g, y - r, y + r, greens[0], greens[1]); g.fill(); outline(g, 2.4);
          ell(g, x - r * 0.3, y - r * 0.35, r * 0.34, r * 0.26);
          g.fillStyle = 'rgba(255,255,255,0.22)'; g.fill();
        };
        blob(-14, -44, 20); blob(15, -48, 22); blob(0, -64, 24);
      }, 8);
    }
    if (kind === 'pine') {
      return make(key, 76, 120, g => {
        softShadow(g, 22, 8, 0.25);
        g.fillStyle = '#6a4a26'; rr(g, -4, -22, 8, 22, 3); g.fill(); outline(g, 2);
        const c1 = variant % 2 ? '#3f7d4e' : '#35705e', c2 = variant % 2 ? '#2a5c36' : '#224a3e';
        for (let i = 0; i < 3; i++) {
          const y = -20 - i * 24, w = 34 - i * 8;
          g.beginPath();
          g.moveTo(-w, y); g.lineTo(0, y - 34); g.lineTo(w, y);
          g.closePath();
          g.fillStyle = vgrad(g, y - 34, y, c1, c2); g.fill(); outline(g, 2.4);
        }
      }, 8);
    }
    if (kind === 'rock') {
      return make(key, 66, 50, g => {
        softShadow(g, 22, 8, 0.22);
        g.beginPath();
        const n = 8, R = 17 + variant * 3;
        for (let i = 0; i <= n; i++) {
          const a = i / n * Math.PI * 2;
          const rad = R * (1 + (rnd() - 0.5) * 0.4);
          const px = Math.cos(a) * rad, py = -R * 0.62 + Math.sin(a) * rad * 0.62;
          i ? g.lineTo(px, py) : g.moveTo(px, py);
        }
        g.closePath();
        g.fillStyle = vgrad(g, -R * 1.4, 0, '#a5a09a', '#6a655e'); g.fill(); outline(g, 2.4);
        g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 1.8;
        g.beginPath(); g.moveTo(-R * 0.4, -R * 0.9); g.lineTo(-R * 0.05, -R * 1.05); g.stroke();
      }, 6);
    }
    if (kind === 'bush') {
      return make(key, 52, 40, g => {
        softShadow(g, 17, 6, 0.2);
        for (const [x, y, r] of [[-8, -8, 11], [8, -9, 10], [0, -14, 11]]) {
          ell(g, x, y, r, r * 0.85);
          g.fillStyle = vgrad(g, y - r, y + r, '#66aa4a', '#447a30'); g.fill(); outline(g, 2.2);
        }
        if (variant % 2) {
          g.fillStyle = '#e5484d';
          ell(g, -6, -10, 2, 2); g.fill(); ell(g, 5, -13, 2, 2); g.fill(); ell(g, 1, -7, 2, 2); g.fill();
        }
      }, 5);
    }
    if (kind === 'ruin') {
      return make(key, 50, 72, g => {
        softShadow(g, 15, 6, 0.22);
        const h = 34 + variant * 8;
        rr(g, -8, -h, 16, h, 2);
        g.fillStyle = vgrad(g, -h, 0, '#d8d1c2', '#9a9384'); g.fill(); outline(g, 2.2);
        g.beginPath();
        g.moveTo(-8, -h); g.lineTo(-4, -h - 5); g.lineTo(2, -h + 2); g.lineTo(8, -h - 3); g.lineTo(8, -h + 4); g.lineTo(-8, -h + 4);
        g.closePath();
        g.fillStyle = '#c2bbac'; g.fill(); outline(g, 1.8);
        g.strokeStyle = 'rgba(60,55,45,0.4)'; g.lineWidth = 1.4;
        g.beginPath(); g.moveTo(-8, -h * 0.5); g.lineTo(8, -h * 0.5); g.stroke();
        g.fillStyle = 'rgba(110,160,80,0.6)';
        ell(g, -5, -6, 6, 4); g.fill();
      }, 6);
    }
    if (kind === 'torch') {
      return make(key, 30, 66, g => {
        softShadow(g, 8, 3.4, 0.25);
        g.fillStyle = vgrad(g, -46, 0, '#8a6234', '#5c3f1e');
        rr(g, -2.8, -46, 5.6, 46, 2.4); g.fill(); outline(g, 2);
        g.beginPath();
        g.moveTo(-7, -46); g.lineTo(7, -46); g.lineTo(5, -54) ; g.lineTo(-5, -54);
        g.closePath();
        g.fillStyle = '#3a3f4a'; g.fill(); outline(g, 2);
      }, 5);
    }
    if (kind === 'cart') {
      return make(key, 78, 56, g => {
        softShadow(g, 26, 9, 0.22);
        g.save(); g.rotate(-0.08);
        rr(g, -24, -26, 48, 18, 3);
        g.fillStyle = vgrad(g, -26, -8, '#9a6a3a', '#6a4522'); g.fill(); outline(g, 2.2);
        g.strokeStyle = 'rgba(40,25,10,0.5)'; g.lineWidth = 1.6;
        for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(i * 12, -26); g.lineTo(i * 12, -8); g.stroke(); }
        ell(g, -14, -6, 8, 8);
        g.fillStyle = '#5c3f1e'; g.fill(); outline(g, 2.2);
        ell(g, -14, -6, 3, 3); g.fillStyle = '#8a6234'; g.fill();
        g.strokeStyle = '#5c3f1e'; g.lineWidth = 3;
        g.beginPath(); g.moveTo(18, -10); g.lineTo(30, -2); g.stroke();
        g.restore();
      }, 6);
    }
    if (kind === 'skull') {
      return make(key, 34, 28, g => {
        ell(g, 0, -8, 9, 8);
        g.fillStyle = vgrad(g, -16, 0, '#eae4d4', '#b8b0a0'); g.fill(); outline(g, 2);
        ell(g, -3.4, -8, 2.2, 2.6); g.fillStyle = '#2c2824'; g.fill();
        ell(g, 3.4, -8, 2.2, 2.6); g.fill();
        rr(g, -4.4, -2.5, 8.8, 3.4, 1.4);
        g.fillStyle = '#d8d1c2'; g.fill(); outline(g, 1.6);
      }, 4);
    }
    // Zaun
    return make(key, 60, 40, g => {
      g.fillStyle = '#8a6234';
      for (const x of [-22, 0, 22]) { rr(g, x - 3, -22, 6, 22, 2); g.fill(); outline(g, 1.8); }
      rr(g, -27, -18, 54, 4.4, 2); g.fill(); outline(g, 1.8);
      rr(g, -27, -9, 54, 4.4, 2); g.fill(); outline(g, 1.8);
    }, 5);
  }

  // ============================================================
  //  BODEN (vorgerendert, halbe Auflösung)
  // ============================================================

  function paintGround(seed) {
    const { w, h, cx, cy, villageRadius } = KS.CFG.WORLD;
    const SC = 0.5;
    const c = document.createElement('canvas');
    c.width = w * SC; c.height = h * SC;
    const g = c.getContext('2d');
    g.scale(SC, SC);
    const rnd = U.seededRng(seed);

    // Basis-Gras
    const base = g.createRadialGradient(cx, cy, 200, cx, cy, w * 0.72);
    base.addColorStop(0, '#84c85a');
    base.addColorStop(0.55, '#74b84e');
    base.addColorStop(1, '#5a9440');
    g.fillStyle = base; g.fillRect(0, 0, w, h);

    // Weiche Flecken
    for (let i = 0; i < 900; i++) {
      const x = rnd() * w, y = rnd() * h, r = 18 + rnd() * 66;
      g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,220,0.045)' : 'rgba(30,80,30,0.05)';
      g.beginPath(); g.ellipse(x, y, r, r * (0.5 + rnd() * 0.5), rnd() * 3, 0, 7); g.fill();
    }

    // Pfade von den 8 Toren zur Mitte
    const gates = [];
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4 + 0.12;
      gates.push({ a, x: cx + Math.cos(a) * (w * 0.485), y: cy + Math.sin(a) * (h * 0.485) });
    }
    for (const gate of gates) {
      const midx = (gate.x + cx) / 2 + (rnd() - 0.5) * 160;
      const midy = (gate.y + cy) / 2 + (rnd() - 0.5) * 160;
      for (const [lw, col, al] of [[46, '#a98a58', 0.55], [34, '#c2a068', 0.8]]) {
        g.save();
        g.globalAlpha = al;
        g.strokeStyle = col; g.lineWidth = lw; g.lineCap = 'round';
        g.beginPath();
        g.moveTo(gate.x, gate.y);
        g.quadraticCurveTo(midx, midy, cx + Math.cos(gate.a) * 250, cy + Math.sin(gate.a) * 250);
        g.stroke();
        g.restore();
      }
      // Kiesel auf dem Pfad
      for (let i = 0; i < 26; i++) {
        const t = rnd();
        const px = (1 - t) * (1 - t) * gate.x + 2 * (1 - t) * t * midx + t * t * (cx + Math.cos(gate.a) * 250);
        const py = (1 - t) * (1 - t) * gate.y + 2 * (1 - t) * t * midy + t * t * (cy + Math.sin(gate.a) * 250);
        g.fillStyle = rnd() < 0.5 ? 'rgba(120,95,60,0.5)' : 'rgba(160,135,95,0.6)';
        g.beginPath(); g.ellipse(px + (rnd() - 0.5) * 26, py + (rnd() - 0.5) * 26, 2.4 + rnd() * 3, 2 + rnd() * 2, 0, 0, 7); g.fill();
      }
    }

    // Dorfplatz (Kopfsteinpflaster)
    const plazaR = 265;
    const pg = g.createRadialGradient(cx, cy, 40, cx, cy, plazaR);
    pg.addColorStop(0, '#c9b896');
    pg.addColorStop(0.85, '#bba983');
    pg.addColorStop(1, '#a89a76');
    g.beginPath(); g.arc(cx, cy, plazaR, 0, 7); g.fillStyle = pg; g.fill();
    g.strokeStyle = 'rgba(90,75,50,0.55)'; g.lineWidth = 5;
    g.beginPath(); g.arc(cx, cy, plazaR, 0, 7); g.stroke();
    // Pflastersteine (Ringe)
    g.strokeStyle = 'rgba(90,75,50,0.28)'; g.lineWidth = 2.4;
    for (let ring = 1; ring <= 6; ring++) {
      const rr2 = plazaR * ring / 6.5;
      g.beginPath(); g.arc(cx, cy, rr2, 0, 7); g.stroke();
      const n = 6 + ring * 5;
      for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2 + ring;
        g.beginPath();
        g.moveTo(cx + Math.cos(a) * (rr2 - plazaR / 13), cy + Math.sin(a) * (rr2 - plazaR / 13));
        g.lineTo(cx + Math.cos(a) * rr2, cy + Math.sin(a) * rr2);
        g.stroke();
      }
    }
    // Helle Abnutzung
    for (let i = 0; i < 40; i++) {
      const a = rnd() * 7, r = rnd() * plazaR;
      g.fillStyle = 'rgba(255,245,220,0.09)';
      g.beginPath(); g.ellipse(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 14 + rnd() * 22, 10 + rnd() * 14, a, 0, 7); g.fill();
    }

    // Turmring-Markierung (dezent)
    g.save();
    g.strokeStyle = 'rgba(255,250,230,0.20)'; g.lineWidth = 4; g.setLineDash([16, 20]);
    g.beginPath(); g.arc(cx, cy, 338, 0, 7); g.stroke();
    g.restore();

    // Blumen & Grashalme
    for (let i = 0; i < 700; i++) {
      const a = rnd() * 7, r = plazaR + 30 + rnd() * (w * 0.46 - plazaR);
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      if (x < 20 || y < 20 || x > w - 20 || y > h - 20) continue;
      if (rnd() < 0.16) {
        g.fillStyle = ['#ffdf6e', '#ff8f8f', '#c9a8ff', '#fff'][Math.floor(rnd() * 4)];
        g.beginPath(); g.arc(x, y, 2.6, 0, 7); g.fill();
        g.fillStyle = 'rgba(255,200,60,0.9)';
        g.beginPath(); g.arc(x, y, 1.1, 0, 7); g.fill();
      } else {
        g.strokeStyle = rnd() < 0.5 ? 'rgba(40,90,35,0.5)' : 'rgba(220,255,180,0.4)';
        g.lineWidth = 1.6;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 5, y - 4 - rnd() * 5); g.stroke();
      }
    }

    // Dunkler Waldrand
    const edge = g.createRadialGradient(cx, cy, w * 0.36, cx, cy, w * 0.72);
    edge.addColorStop(0, 'rgba(20,40,18,0)');
    edge.addColorStop(1, 'rgba(16,32,16,0.55)');
    g.fillStyle = edge; g.fillRect(0, 0, w, h);

    return { canvas: c, scale: SC };
  }

  // Requisiten-Platzierung (deterministisch)
  function generateProps(seed) {
    const { w, h, cx, cy } = KS.CFG.WORLD;
    const rnd = U.seededRng(seed + 7);
    const props = [];
    const pads = KS.CFG.PADS;
    const clearOfPads = (x, y, d) => pads.every(p => U.dist2(x, y, p.x, p.y) > d * d);

    // Fackelring um den Dorfplatz
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4 + Math.PI / 8;
      props.push({ kind: 'torch', v: 0, x: cx + Math.cos(a) * 282, y: cy + Math.sin(a) * 282, s: 1, light: true });
    }
    // Zäune nahe der Tavernen
    props.push({ kind: 'fence', v: 0, x: cx + 260, y: cy + 60, s: 1 });
    props.push({ kind: 'fence', v: 0, x: cx - 265, y: cy + 40, s: 1 });

    // Wald außen (dichter zum Rand)
    for (let i = 0; i < 240; i++) {
      const a = rnd() * Math.PI * 2;
      const t = Math.pow(rnd(), 0.6);
      const r = 640 + t * (w * 0.5 - 700);
      const x = cx + Math.cos(a) * r + (rnd() - 0.5) * 120;
      const y = cy + Math.sin(a) * r + (rnd() - 0.5) * 120;
      if (x < 50 || y < 60 || x > w - 50 || y > h - 30) continue;
      if (!clearOfPads(x, y, 95)) continue;
      const kind = rnd() < 0.55 ? 'tree' : (rnd() < 0.6 ? 'pine' : 'bush');
      props.push({ kind, v: Math.floor(rnd() * 3), x, y, s: 0.8 + rnd() * 0.55, flip: rnd() < 0.5 });
    }
    // Verstreute Bäume/Büsche im Mittelring
    for (let i = 0; i < 40; i++) {
      const a = rnd() * Math.PI * 2, r = 330 + rnd() * 280;
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      if (!clearOfPads(x, y, 110)) continue;
      const kind = rnd() < 0.5 ? 'bush' : (rnd() < 0.5 ? 'tree' : 'rock');
      props.push({ kind, v: Math.floor(rnd() * 3), x, y, s: 0.7 + rnd() * 0.4, flip: rnd() < 0.5 });
    }
    // Felsen bei den Minen
    for (const mid of ['mine_1', 'mine_2']) {
      const mp = pads.find(p => p.id === mid);
      for (let i = 0; i < 5; i++) {
        const a = rnd() * Math.PI * 2, r = 70 + rnd() * 60;
        props.push({ kind: 'rock', v: Math.floor(rnd() * 3), x: mp.x + Math.cos(a) * r, y: mp.y + Math.sin(a) * r, s: 0.8 + rnd() * 0.7, flip: rnd() < 0.5 });
      }
    }
    // Ruinen & Schlachtfeld-Details
    for (let i = 0; i < 10; i++) {
      const a = rnd() * Math.PI * 2, r = 430 + rnd() * 500;
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      if (!clearOfPads(x, y, 110)) continue;
      props.push({ kind: ['ruin', 'cart', 'skull'][Math.floor(rnd() * 3)], v: Math.floor(rnd() * 2), x, y, s: 0.9 + rnd() * 0.3, flip: rnd() < 0.5 });
    }
    return props;
  }

  return {
    make, draw, building, padPlate, monster, king, sword, villager, coin,
    prop, paintGround, generateProps,
    matFor, MATS, TOWER_ACCENT,
  };
})();
