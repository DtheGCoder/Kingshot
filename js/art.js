/* ============================================================
   KINGSHOT — art.js
   Prozedurale Grafik: reichhaltige Texturen, Ziegel, Schindeln,
   weiche Schatten & Glanzlichter — alles gecacht, keine Assets.
   ============================================================ */
'use strict';

KS.Art = (() => {
  const U = KS.U;
  const SS = 2;                 // Supersampling für knackige Sprites
  const cache = new Map();
  const TAU = Math.PI * 2;

  const OUTLINE = 'rgba(40,27,20,0.8)';

  // ---------- Sprite-Fabrik ----------
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
    g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.closePath();
  }
  function vgrad(g, y0, y1, c0, c1) {
    const gr = g.createLinearGradient(0, y0, 0, y1);
    gr.addColorStop(0, c0); gr.addColorStop(1, c1);
    return gr;
  }
  function outline(g, w = 2) { g.strokeStyle = OUTLINE; g.lineWidth = w; g.stroke(); }

  // Weicher Bodenschatten (Ambient Occlusion)
  function aoShadow(g, rx, ry = rx * 0.36, a = 0.3, y = 0) {
    const gr = g.createRadialGradient(0, y, rx * 0.1, 0, y, rx);
    gr.addColorStop(0, `rgba(24,32,16,${a})`);
    gr.addColorStop(0.7, `rgba(24,32,16,${a * 0.55})`);
    gr.addColorStop(1, 'rgba(24,32,16,0)');
    g.save();
    g.translate(0, y);
    g.scale(1, ry / rx);
    g.fillStyle = gr;
    g.beginPath(); g.arc(0, 0, rx, 0, TAU); g.fill();
    g.restore();
  }

  // ---------- Textur-Muster (gecacht) ----------
  const texCache = {};
  function tex(name) {
    if (texCache[name]) return texCache[name];
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const rnd = U.seededRng(name.length * 971 + 13);
    if (name === 'stone') {
      for (let i = 0; i < 90; i++) {
        g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(20,18,30,0.12)';
        g.beginPath(); g.arc(rnd() * 64, rnd() * 64, 0.6 + rnd() * 1.6, 0, TAU); g.fill();
      }
    } else if (name === 'wood') {
      for (let i = 0; i < 16; i++) {
        g.strokeStyle = rnd() < 0.5 ? 'rgba(60,35,10,0.16)' : 'rgba(255,220,160,0.10)';
        g.lineWidth = 0.8 + rnd();
        const y = rnd() * 64;
        g.beginPath();
        g.moveTo(0, y);
        g.bezierCurveTo(20, y + rnd() * 4 - 2, 44, y + rnd() * 4 - 2, 64, y + rnd() * 3 - 1.5);
        g.stroke();
      }
      for (let i = 0; i < 5; i++) {
        g.strokeStyle = 'rgba(60,35,10,0.2)';
        g.beginPath(); g.ellipse(rnd() * 64, rnd() * 64, 2 + rnd() * 2, 1 + rnd(), 0, 0, TAU); g.stroke();
      }
    } else if (name === 'plaster') {
      for (let i = 0; i < 60; i++) {
        g.fillStyle = rnd() < 0.5 ? 'rgba(120,90,60,0.07)' : 'rgba(255,255,255,0.09)';
        g.beginPath(); g.arc(rnd() * 64, rnd() * 64, 0.8 + rnd() * 2.4, 0, TAU); g.fill();
      }
    } else if (name === 'metal') {
      for (let i = 0; i < 26; i++) {
        g.strokeStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.07)' : 'rgba(10,12,20,0.10)';
        g.lineWidth = 0.7;
        const y = rnd() * 64;
        g.beginPath(); g.moveTo(0, y); g.lineTo(64, y + rnd() * 2 - 1); g.stroke();
      }
    }
    texCache[name] = g.createPattern ? c : c;
    return c;
  }
  // Textur über den aktuellen Pfad legen
  function texOver(g, name, x, y, w, h, alpha = 1) {
    g.save();
    g.clip();
    g.globalAlpha *= alpha;
    const p = g.createPattern(tex(name), 'repeat');
    g.fillStyle = p;
    g.fillRect(x, y, w, h);
    g.restore();
  }

  // Ziegelmauer mit einzeln schattierten Steinen
  function brickWall(g, x, y, w, h, c0, c1, seed = 7, bw = 13, bh = 7.5) {
    rr(g, x, y, w, h, 2);
    g.fillStyle = vgrad(g, y, y + h, c0, c1);
    g.fill();
    const rnd = U.seededRng(seed);
    g.save();
    rr(g, x, y, w, h, 2);
    g.clip();
    for (let row = 0; row * bh < h + bh; row++) {
      const off = (row % 2) * bw * 0.5;
      for (let col = -1; col * bw < w + bw; col++) {
        const bx = x + col * bw + off, by = y + row * bh;
        const v = rnd();
        if (v < 0.28) {
          g.fillStyle = v < 0.12 ? 'rgba(255,255,255,0.10)' : 'rgba(25,20,35,0.10)';
          g.fillRect(bx + 0.8, by + 0.8, bw - 1.6, bh - 1.6);
        }
        g.strokeStyle = 'rgba(30,24,38,0.28)';
        g.lineWidth = 1;
        g.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
      }
    }
    g.restore();
    rr(g, x, y, w, h, 2);
    texOver(g, 'stone', x, y, w, h, 0.8);
  }

  // Schindeldach (Dreieck) mit Reihen aus Bögen
  function shingleRoof(g, x0, x1, yBase, apexX, apexY, c1, c2, rows = 5) {
    g.beginPath();
    g.moveTo(x0, yBase); g.lineTo(apexX, apexY); g.lineTo(x1, yBase);
    g.closePath();
    g.fillStyle = vgrad(g, apexY, yBase, U.shade(c1, 0.18), c2);
    g.fill();
    outline(g, 2.6);
    // Reihen
    g.save();
    g.beginPath();
    g.moveTo(x0, yBase + 1); g.lineTo(apexX, apexY); g.lineTo(x1, yBase + 1);
    g.closePath();
    g.clip();
    const H = yBase - apexY;
    for (let r = 0; r < rows; r++) {
      const t = r / rows;
      const y = yBase - H * t;
      const shW = 12 - t * 3;
      g.strokeStyle = r % 2 ? 'rgba(30,20,15,0.30)' : 'rgba(30,20,15,0.20)';
      g.lineWidth = 1.6;
      g.beginPath();
      for (let sx = x0 - 8; sx < x1 + 8; sx += shW) {
        g.moveTo(sx, y);
        g.arc(sx + shW / 2, y, shW / 2, Math.PI, 0, true);
      }
      g.stroke();
      if (r % 2 === 0) {
        g.fillStyle = 'rgba(255,255,255,0.05)';
        g.fillRect(x0, y - H / rows, x1 - x0, H / rows * 0.5);
      }
    }
    g.restore();
    // First-Glanz
    g.strokeStyle = 'rgba(255,240,210,0.35)';
    g.lineWidth = 2.2;
    g.beginPath();
    g.moveTo(U.lerp(x0, apexX, 0.15), U.lerp(yBase, apexY, 0.15) - 1);
    g.lineTo(apexX, apexY - 1);
    g.stroke();
  }

  // Materialien für Turm-/Gebäudestufen (Holz→Stein→Eisen→Gold→Kristall)
  const MATS = [
    { w: '#b08252', d: '#7c5630', hi: '#d9a86e', name: 'Holz' },
    { w: '#b3b4be', d: '#7d7e8a', hi: '#dcdde6', name: 'Stein' },
    { w: '#77869f', d: '#4c5568', hi: '#a8b6cc', name: 'Eisen' },
    { w: '#eec254', d: '#b7872a', hi: '#ffe89a', name: 'Gold' },
    { w: '#a5e0f5', d: '#5ba9cc', hi: '#effdff', name: 'Kristall' },
  ];
  const matFor = tier => MATS[Math.min(4, Math.ceil(tier / 2) - 1)];

  // ============================================================
  //  GEBÄUDE
  // ============================================================

  function crenellation(g, x0, x1, y, h, n, fill) {
    const w = (x1 - x0) / (n * 2 - 1);
    for (let i = 0; i < n; i++) {
      const bx = x0 + i * 2 * w;
      g.fillStyle = fill;
      rr(g, bx, y - h, w, h + 1, 1.4);
      g.fill();
      g.strokeStyle = OUTLINE; g.lineWidth = 1.6; g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.fillRect(bx + 1, y - h + 1, w - 2, 1.6);
    }
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
    g.fillStyle = 'rgba(255,255,255,0.3)';
    g.beginPath();
    g.moveTo(x, y - h);
    g.quadraticCurveTo(x + 8, y - h + 1.6, x + 13, y - h + 3.4);
    g.lineTo(x + 9, y - h + 4);
    g.quadraticCurveTo(x + 5, y - h + 2.6, x, y - h + 1.6);
    g.closePath(); g.fill();
    g.fillStyle = '#f2d24a';
    g.beginPath(); g.arc(x, y - h - 1.5, 2.2, 0, TAU); g.fill();
  }

  function windowGlow(g, x, y, w, h) {
    // Lichtschein
    const gr = g.createRadialGradient(x, y + h / 2, 1, x, y + h / 2, w * 2.4);
    gr.addColorStop(0, 'rgba(255,214,110,0.5)');
    gr.addColorStop(1, 'rgba(255,214,110,0)');
    g.fillStyle = gr;
    ell(g, x, y + h / 2, w * 2.4, w * 2.4); g.fill();
    // Fenster
    rr(g, x - w / 2, y, w, h, w / 2);
    g.fillStyle = vgrad(g, y, y + h, '#ffedb0', '#ffb43e');
    g.fill();
    g.strokeStyle = 'rgba(40,27,20,0.85)'; g.lineWidth = 1.6; g.stroke();
    g.strokeStyle = 'rgba(120,70,20,0.55)'; g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x - w / 2 + 1, y + h * 0.45); g.lineTo(x + w / 2 - 1, y + h * 0.45);
    g.moveTo(x, y + 1); g.lineTo(x, y + h - 1);
    g.stroke();
  }

  // ---------- Türme ----------
  const TOWER_ACCENT = {
    tower_arrow: '#4e9a3e', tower_cannon: '#39404e', tower_frost: '#6fd0ec',
    tower_lightning: '#b48cff', tower_flame: '#ff9a3d',
  };

  function towerBody(g, tier, wB, wT, h) {
    const m = matFor(tier);
    const bodyPath = () => {
      g.beginPath();
      g.moveTo(-wB / 2, -10);
      g.lineTo(-wT / 2, -h);
      g.lineTo(wT / 2, -h);
      g.lineTo(wB / 2, -10);
      g.closePath();
    };
    bodyPath();
    g.fillStyle = vgrad(g, -h, -10, m.w, m.d);
    g.fill();
    if (tier <= 2) {
      // Holzplanken einzeln
      g.save(); bodyPath(); g.clip();
      const n = 6;
      for (let i = 0; i < n; i++) {
        const px = -wB / 2 + (i / n) * wB;
        g.fillStyle = i % 2 ? 'rgba(60,35,10,0.10)' : 'rgba(255,225,170,0.08)';
        g.fillRect(px, -h, wB / n + 1, h);
        g.strokeStyle = 'rgba(50,30,12,0.4)'; g.lineWidth = 1.2;
        g.beginPath(); g.moveTo(px, -h); g.lineTo(px, -8); g.stroke();
      }
      // Querbalken
      for (const ty of [-h * 0.35, -h * 0.7]) {
        g.fillStyle = 'rgba(70,45,20,0.5)';
        g.fillRect(-wB / 2, ty, wB, 4.4);
        g.fillStyle = 'rgba(255,225,170,0.14)';
        g.fillRect(-wB / 2, ty, wB, 1.4);
      }
      bodyPath(); texOver(g, 'wood', -wB / 2, -h, wB, h, 0.9);
      g.restore();
    } else if (tier <= 4) {
      g.save(); bodyPath(); g.clip();
      brickWall(g, -wB / 2, -h, wB, h - 8, m.w, m.d, tier * 31);
      g.restore();
    } else if (tier <= 6) {
      // Eisenplatten mit Nieten
      g.save(); bodyPath(); g.clip();
      const rows = 4;
      for (let r2 = 0; r2 < rows; r2++) {
        const y = -h + (r2 / rows) * (h - 10);
        g.strokeStyle = 'rgba(15,18,28,0.5)'; g.lineWidth = 1.6;
        g.beginPath(); g.moveTo(-wB / 2, y); g.lineTo(wB / 2, y); g.stroke();
        g.fillStyle = '#c9d2e0';
        for (let nx = -2; nx <= 2; nx++) {
          g.beginPath(); g.arc(nx * wT * 0.2, y + 4, 1.3, 0, TAU); g.fill();
        }
      }
      bodyPath(); texOver(g, 'metal', -wB / 2, -h, wB, h, 1);
      g.restore();
    } else if (tier <= 8) {
      // Goldpaneele mit kräftiger Struktur
      g.save(); bodyPath(); g.clip();
      for (let r2 = 0; r2 < 5; r2++) {
        const y0 = -h + (r2 / 5) * (h - 10);
        const y1 = -h + ((r2 + 1) / 5) * (h - 10);
        // Paneel-Verlauf (oben hell, unten satt)
        g.fillStyle = r2 % 2 ? 'rgba(120,80,10,0.14)' : 'rgba(255,246,200,0.14)';
        g.fillRect(-wB / 2, y0, wB, y1 - y0);
        g.strokeStyle = 'rgba(110,70,8,0.65)'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(-wB / 2, y1); g.lineTo(wB / 2, y1); g.stroke();
        g.fillStyle = 'rgba(255,248,210,0.7)';
        g.fillRect(-wB / 2, y0 + 1, wB, 1.8);
      }
      // Mittelnaht + Nieten
      g.strokeStyle = 'rgba(110,70,8,0.4)'; g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(0, -h + 3); g.lineTo(0, -12); g.stroke();
      g.fillStyle = 'rgba(120,76,10,0.85)';
      for (let r2 = 0; r2 < 5; r2++) {
        const y = -h + ((r2 + 0.5) / 5) * (h - 10);
        for (const nx of [-wT * 0.3, wT * 0.3]) {
          g.beginPath(); g.arc(nx, y, 1.7, 0, TAU); g.fill();
        }
      }
      // Seitliche Kantenschatten/-lichter
      const sg = g.createLinearGradient(-wB / 2, 0, wB / 2, 0);
      sg.addColorStop(0, 'rgba(255,250,220,0.35)');
      sg.addColorStop(0.25, 'rgba(255,250,220,0)');
      sg.addColorStop(0.72, 'rgba(110,70,8,0)');
      sg.addColorStop(1, 'rgba(110,70,8,0.4)');
      g.fillStyle = sg;
      g.fillRect(-wB / 2, -h, wB, h);
      g.restore();
    } else {
      // Kristallfacetten
      g.save(); bodyPath(); g.clip();
      g.globalAlpha = 0.5;
      for (let i = 0; i < 6; i++) {
        const fx = -wT / 2 + (i / 6) * wT;
        g.fillStyle = i % 2 ? 'rgba(255,255,255,0.5)' : 'rgba(90,169,204,0.4)';
        g.beginPath();
        g.moveTo(fx, -h); g.lineTo(fx + wT / 6, -h);
        g.lineTo(fx + wT / 8, -10); g.lineTo(fx - wT / 10, -10);
        g.closePath(); g.fill();
      }
      g.globalAlpha = 1;
      const gl = g.createRadialGradient(0, -h * 0.5, 2, 0, -h * 0.5, wB);
      gl.addColorStop(0, 'rgba(230,255,255,0.5)'); gl.addColorStop(1, 'rgba(230,255,255,0)');
      g.fillStyle = gl;
      g.fillRect(-wB / 2, -h, wB, h);
      g.restore();
    }
    bodyPath();
    outline(g, 2.6);
    // Rim-Light links
    g.beginPath();
    g.moveTo(-wB / 2 + 3, -12);
    g.lineTo(-wT / 2 + 3, -h + 3);
    g.strokeStyle = m.hi; g.lineWidth = 2.4; g.globalAlpha = 0.75; g.stroke(); g.globalAlpha = 1;
    // Kernschatten rechts
    g.beginPath();
    g.moveTo(wB / 2 - 3, -12);
    g.lineTo(wT / 2 - 3, -h + 3);
    g.strokeStyle = 'rgba(20,15,25,0.30)'; g.lineWidth = 3.4; g.stroke();
  }

  function paintTower(g, type, tier) {
    const m = matFor(tier);
    const acc = TOWER_ACCENT[type];
    const h = 58 + tier * 6;
    const wB = 46 + tier * 1.3;
    const wT = wB * 0.78;
    aoShadow(g, wB * 0.85, wB * 0.3, 0.34);

    // Sockel (2 Steinstufen)
    for (let i = 0; i < 2; i++) {
      const sw = wB + 12 - i * 6;
      rr(g, -sw / 2, -6 - i * 7, sw, 8, 3);
      g.fillStyle = vgrad(g, -14, 2, i ? '#a8a196' : '#8d867b', i ? '#7c766c' : '#655f56');
      g.fill(); outline(g, 2);
      g.fillStyle = 'rgba(255,255,255,0.14)';
      g.fillRect(-sw / 2 + 2, -6 - i * 7 + 1, sw - 4, 1.6);
    }

    towerBody(g, tier, wB, wT, h);

    // Fenster (glühend)
    windowGlow(g, 0, -h * 0.58, 6, 12);
    if (tier >= 4) windowGlow(g, -wT * 0.26, -h * 0.3, 5, 9);
    if (tier >= 6) windowGlow(g, wT * 0.26, -h * 0.3, 5, 9);

    // Plattform + Zinnen
    const pw = wT + 16;
    rr(g, -pw / 2, -h - 11, pw, 13, 3);
    g.fillStyle = vgrad(g, -h - 11, -h + 2, m.hi, m.w);
    g.fill(); outline(g, 2.2);
    // Schattenband unter der Plattform
    g.fillStyle = 'rgba(20,15,25,0.25)';
    g.fillRect(-wT / 2, -h + 1, wT, 3.4);
    crenellation(g, -pw / 2, pw / 2, -h - 10, 7, 4, m.w);

    // Kopf je Typ
    const ty = -h - 13;
    if (type === 'tower_arrow') {
      g.strokeStyle = '#6e4a26'; g.lineWidth = 3.6;
      g.beginPath(); g.arc(0, ty - 6, 12, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
      g.strokeStyle = '#f5efe0'; g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(-10.5, ty - 12); g.lineTo(10.5, ty - 12); g.stroke();
      g.strokeStyle = '#8a6a3a'; g.lineWidth = 2.6;
      g.beginPath(); g.moveTo(0, ty - 2); g.lineTo(0, ty - 16); g.stroke();
      g.fillStyle = '#d7dde8';
      g.beginPath(); g.moveTo(0, ty - 19); g.lineTo(-2.6, ty - 14); g.lineTo(2.6, ty - 14); g.closePath(); g.fill();
      flagPole(g, -pw / 2 + 2, ty + 3, 24 + tier, acc);
    } else if (type === 'tower_cannon') {
      g.save(); g.translate(0, ty - 7); g.rotate(-0.28);
      rr(g, -7, -7, 26, 14, 6);
      g.fillStyle = vgrad(g, -7, 7, '#67718a', '#23262e');
      g.fill(); outline(g, 2.2);
      g.fillStyle = 'rgba(255,255,255,0.16)';
      rr(g, -5, -6, 22, 3.4, 2); g.fill();
      for (const bx of [-2, 6, 14]) {
        g.strokeStyle = 'rgba(15,17,24,0.7)'; g.lineWidth = 1.8;
        g.beginPath(); g.moveTo(bx, -7); g.lineTo(bx, 7); g.stroke();
      }
      ell(g, 19, 0, 4.6, 6.4); g.fillStyle = '#111318'; g.fill(); outline(g, 2);
      g.restore();
      ell(g, -6, ty - 4, 6.5, 6.5);
      g.fillStyle = vgrad(g, ty - 11, ty + 3, '#4c5568', '#23262e'); g.fill(); outline(g, 2);
      g.fillStyle = acc; ell(g, -6, ty - 4, 2.6, 2.6); g.fill();
    } else if (type === 'tower_frost') {
      const ch = 20 + tier * 1.6;
      const gl = g.createRadialGradient(0, ty - ch * 0.5, 2, 0, ty - ch * 0.5, ch);
      gl.addColorStop(0, 'rgba(190,240,255,0.65)'); gl.addColorStop(1, 'rgba(190,240,255,0)');
      g.fillStyle = gl; ell(g, 0, ty - ch * 0.5, ch, ch); g.fill();
      g.beginPath();
      g.moveTo(0, ty - ch); g.lineTo(7.5, ty - ch * 0.45); g.lineTo(4.5, ty + 1);
      g.lineTo(-4.5, ty + 1); g.lineTo(-7.5, ty - ch * 0.45);
      g.closePath();
      g.fillStyle = vgrad(g, ty - ch, ty, '#f2feff', '#6fc2e6');
      g.fill(); outline(g, 2.2);
      g.beginPath(); g.moveTo(-2.5, ty - ch * 0.78); g.lineTo(-4.2, ty - ch * 0.36);
      g.strokeStyle = '#fff'; g.lineWidth = 1.8; g.stroke();
      for (const s of [-1, 1]) {
        g.beginPath();
        g.moveTo(s * 6, ty - ch * 0.3); g.lineTo(s * 11, ty - ch * 0.42); g.lineTo(s * 7.5, ty - ch * 0.16);
        g.closePath();
        g.fillStyle = '#bfeafc'; g.fill(); outline(g, 1.6);
      }
    } else if (type === 'tower_lightning') {
      g.strokeStyle = '#b87a3a'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(0, ty + 2); g.lineTo(0, ty - 18); g.stroke();
      const gl = g.createRadialGradient(0, ty - 24, 2, 0, ty - 24, 16);
      gl.addColorStop(0, 'rgba(200,160,255,0.7)'); gl.addColorStop(1, 'rgba(200,160,255,0)');
      g.fillStyle = gl; ell(g, 0, ty - 24, 16, 16); g.fill();
      ell(g, 0, ty - 24, 7.5, 7.5);
      g.fillStyle = vgrad(g, ty - 32, ty - 16, '#f0e4ff', '#7a4ad0');
      g.fill(); outline(g, 2.2);
      g.strokeStyle = '#fff'; g.lineWidth = 1.8;
      g.beginPath(); g.moveTo(-1.6, ty - 28.5); g.lineTo(1.6, ty - 24.5); g.lineTo(-1, ty - 21); g.stroke();
      for (const s of [-1, 1]) {
        g.strokeStyle = '#b87a3a'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(s * 5.5, ty - 2); g.lineTo(s * 9, ty - 12); g.stroke();
      }
    } else if (type === 'tower_flame') {
      g.beginPath();
      g.moveTo(-11, ty - 8); g.quadraticCurveTo(0, ty + 3, 11, ty - 8);
      g.lineTo(9, ty - 1); g.quadraticCurveTo(0, ty + 7, -9, ty - 1);
      g.closePath();
      g.fillStyle = vgrad(g, ty - 8, ty + 6, '#54402e', '#2c211a');
      g.fill(); outline(g, 2.2);
      const gl = g.createRadialGradient(0, ty - 12, 2, 0, ty - 12, 22);
      gl.addColorStop(0, 'rgba(255,180,80,0.7)'); gl.addColorStop(1, 'rgba(255,140,40,0)');
      g.fillStyle = gl; ell(g, 0, ty - 12, 22, 22); g.fill();
      g.beginPath();
      g.moveTo(0, ty - 26);
      g.quadraticCurveTo(9, ty - 14, 5.5, ty - 7);
      g.quadraticCurveTo(0, ty - 3, -5.5, ty - 7);
      g.quadraticCurveTo(-9, ty - 14, 0, ty - 26);
      g.fillStyle = vgrad(g, ty - 26, ty - 4, '#ffe084', '#ff7a2e');
      g.fill(); outline(g, 1.8);
      g.fillStyle = '#fff6c8';
      g.beginPath();
      g.moveTo(0, ty - 18);
      g.quadraticCurveTo(4, ty - 11, 0, ty - 6);
      g.quadraticCurveTo(-4, ty - 11, 0, ty - 18);
      g.fill();
    }

    // Rang-Sterne ab Gold
    if (tier >= 7) {
      for (let i = 0; i < Math.min(3, tier - 6); i++) {
        drawStar(g, -8 + i * 8, -h - 26, 3.2, '#ffd34e');
      }
    }
  }

  function drawStar(g, x, y, r, color) {
    g.save();
    g.translate(x, y);
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5;
      const rad = i % 2 ? r * 0.45 : r;
      i ? g.lineTo(Math.cos(a) * rad, Math.sin(a) * rad) : g.moveTo(Math.cos(a) * rad, Math.sin(a) * rad);
    }
    g.closePath();
    g.fillStyle = color; g.fill();
    g.strokeStyle = 'rgba(40,27,20,0.7)'; g.lineWidth = 1.2; g.stroke();
    g.restore();
  }

  // ---------- Burg ----------
  function paintCastle(g, tier) {
    const W = 132 + tier * 7;
    const H = 92 + tier * 9;
    const roofC = tier <= 2 ? '#b06a32' : tier <= 4 ? '#c0392b' : tier <= 6 ? '#3b6ea5' : tier <= 8 ? '#7a4fc9' : '#f2d24a';
    aoShadow(g, W * 0.72, W * 0.24, 0.36);

    // Mauer mit Ziegeln
    const wallH = 34 + tier * 2.5;
    brickWall(g, -W / 2, -wallH, W, wallH, '#d3ccbe', '#918a7b', 5 + tier);
    rr(g, -W / 2, -wallH, W, wallH, 3);
    outline(g, 2.6);
    // Ecksteine
    g.fillStyle = 'rgba(255,255,255,0.28)';
    for (const sx of [-W / 2, W / 2 - 7]) {
      for (let i = 0; i < 3; i++) g.fillRect(sx, -wallH + 4 + i * 11, 7, 6);
    }
    crenellation(g, -W / 2, W / 2, -wallH, 8, 7, '#c3bcae');

    // Tor mit Bogensteinen
    const gw = 26 + tier;
    g.beginPath();
    g.moveTo(-gw / 2, 0); g.lineTo(-gw / 2, -22);
    g.arc(0, -22, gw / 2, Math.PI, 0);
    g.lineTo(gw / 2, 0);
    g.closePath();
    g.fillStyle = vgrad(g, -34, 0, '#6e4a26', '#40270f');
    g.fill();
    texOver(g, 'wood', -gw / 2, -36, gw, 36, 0.9);
    g.beginPath();
    g.moveTo(-gw / 2, 0); g.lineTo(-gw / 2, -22);
    g.arc(0, -22, gw / 2, Math.PI, 0);
    g.lineTo(gw / 2, 0);
    g.closePath();
    outline(g, 2.4);
    // Bretterfugen + Eisenband + Nieten
    g.strokeStyle = 'rgba(30,20,10,0.55)'; g.lineWidth = 1.6;
    for (let i = -2; i <= 2; i++) {
      g.beginPath();
      g.moveTo(i * 5, 0);
      g.lineTo(i * 5, -22 - Math.sqrt(Math.max(0, (gw / 2) ** 2 - (i * 5) ** 2)));
      g.stroke();
    }
    g.strokeStyle = tier >= 5 ? '#e8bb4a' : '#5c6470'; g.lineWidth = 2.6;
    g.beginPath(); g.moveTo(-gw / 2 + 2, -12); g.lineTo(gw / 2 - 2, -12); g.stroke();
    g.fillStyle = tier >= 5 ? '#f6d87a' : '#8b95a5';
    for (let i = -2; i <= 2; i++) { g.beginPath(); g.arc(i * 6, -12, 1.4, 0, TAU); g.fill(); }
    // Bogensteine
    g.strokeStyle = 'rgba(90,84,72,0.9)'; g.lineWidth = 4.4;
    g.beginPath(); g.arc(0, -22, gw / 2 + 2.6, Math.PI, 0); g.stroke();
    g.strokeStyle = 'rgba(30,24,20,0.4)'; g.lineWidth = 1;
    for (let i = 0; i <= 6; i++) {
      const a = Math.PI + (i / 6) * Math.PI;
      g.beginPath();
      g.moveTo(Math.cos(a) * (gw / 2), -22 + Math.sin(a) * (gw / 2));
      g.lineTo(Math.cos(a) * (gw / 2 + 5), -22 + Math.sin(a) * (gw / 2 + 5));
      g.stroke();
    }

    // Bergfried
    const kw = W * 0.42, kH = H;
    g.save();
    g.beginPath();
    g.moveTo(-kw / 2, -wallH + 4);
    g.lineTo(-kw / 2 + 3, -kH);
    g.lineTo(kw / 2 - 3, -kH);
    g.lineTo(kw / 2, -wallH + 4);
    g.closePath();
    g.clip();
    brickWall(g, -kw / 2, -kH, kw, kH - wallH + 6, '#e6dfd1', '#a89f8e', 91 + tier);
    g.restore();
    g.beginPath();
    g.moveTo(-kw / 2, -wallH + 4);
    g.lineTo(-kw / 2 + 3, -kH);
    g.lineTo(kw / 2 - 3, -kH);
    g.lineTo(kw / 2, -wallH + 4);
    g.closePath();
    outline(g, 2.6);
    g.beginPath();
    g.moveTo(-kw / 2 + 4, -wallH + 2); g.lineTo(-kw / 2 + 6, -kH + 3);
    g.strokeStyle = 'rgba(255,250,240,0.5)'; g.lineWidth = 2; g.stroke();
    windowGlow(g, 0, -kH + 14, 7.5, 15);
    if (tier >= 3) { windowGlow(g, -kw * 0.24, -kH + 38, 5.5, 11); windowGlow(g, kw * 0.24, -kH + 38, 5.5, 11); }

    // Dach des Bergfrieds (Schindeln)
    shingleRoof(g, -kw / 2 - 8, kw / 2 + 8, -kH, 0, -kH - 27 - tier * 2, roofC, U.shade(roofC, -0.18), 5);

    // Seitentürme
    if (tier >= 2) {
      for (const side of [-1, 1]) {
        const tx = side * (W / 2 - 13), tw = 26 + tier, th = wallH + 26 + tier * 3.5;
        g.save();
        rr(g, tx - tw / 2, -th, tw, th, 4);
        g.clip();
        brickWall(g, tx - tw / 2, -th, tw, th, '#d8d1c2', '#9c9585', side * 13 + tier);
        g.restore();
        rr(g, tx - tw / 2, -th, tw, th, 4);
        outline(g, 2.4);
        windowGlow(g, tx, -th + 12, 5, 10);
        shingleRoof(g, tx - tw / 2 - 6, tx + tw / 2 + 6, -th, tx, -th - 20 - tier, U.shade(roofC, 0.05), U.shade(roofC, -0.22), 4);
        if (tier >= 6) flagPole(g, tx, -th - 20 - tier, 12, '#f2d24a');
      }
    }
    // Goldene Trims ab Stufe 7
    if (tier >= 7) {
      g.strokeStyle = '#e8bb4a'; g.lineWidth = 2.6; g.globalAlpha = 0.9;
      g.beginPath(); g.moveTo(-W / 2 + 4, -wallH + 8); g.lineTo(W / 2 - 4, -wallH + 8); g.stroke();
      g.globalAlpha = 1;
      g.fillStyle = '#f6d87a';
      for (let i = -3; i <= 3; i++) { g.beginPath(); g.arc(i * W / 8, -wallH + 8, 1.6, 0, TAU); g.fill(); }
    }
    // Kristall-Spitzen ab Stufe 9
    if (tier >= 9) {
      for (const dx of [-kw * 0.3, kw * 0.3]) {
        const gl = g.createRadialGradient(dx, -kH - 2, 1, dx, -kH - 2, 10);
        gl.addColorStop(0, 'rgba(190,240,255,0.8)'); gl.addColorStop(1, 'rgba(190,240,255,0)');
        g.fillStyle = gl; ell(g, dx, -kH - 2, 10, 10); g.fill();
        g.beginPath();
        g.moveTo(dx, -kH - 8); g.lineTo(dx + 4, -kH + 3); g.lineTo(dx - 4, -kH + 3);
        g.closePath();
        g.fillStyle = vgrad(g, -kH - 8, -kH + 3, '#effdff', '#8ecce8');
        g.fill(); outline(g, 1.6);
      }
    }
  }

  // ---------- Taverne ----------
  function paintTavern(g, tier) {
    const W = 76 + tier * 4.5;
    const H = 52 + tier * 4;
    const two = tier >= 4;
    aoShadow(g, W * 0.68, W * 0.24, 0.32);
    // Fachwerk-Wände (Putz)
    const bodyH = two ? H * 0.9 : H * 0.66;
    rr(g, -W / 2, -bodyH, W, bodyH, 3);
    g.fillStyle = vgrad(g, -bodyH, 0, '#f4e9d2', '#cbb894');
    g.fill();
    texOver(g, 'plaster', -W / 2, -bodyH, W, bodyH, 1);
    rr(g, -W / 2, -bodyH, W, bodyH, 3);
    outline(g, 2.6);
    // Balken mit Holzmaserung
    g.strokeStyle = '#6e4a26'; g.lineWidth = 4;
    g.beginPath();
    g.moveTo(-W / 2 + 3, -bodyH * 0.5); g.lineTo(W / 2 - 3, -bodyH * 0.5);
    g.moveTo(-W * 0.25, -bodyH); g.lineTo(-W * 0.25, 0);
    g.moveTo(W * 0.25, -bodyH); g.lineTo(W * 0.25, 0);
    g.stroke();
    g.strokeStyle = '#8a6234'; g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(-W / 2 + 3, -bodyH * 0.5 - 1); g.lineTo(W / 2 - 3, -bodyH * 0.5 - 1);
    g.stroke();
    g.strokeStyle = '#6e4a26'; g.lineWidth = 3.4;
    g.beginPath(); g.moveTo(-W * 0.25, -bodyH * 0.5); g.lineTo(-W * 0.05, -bodyH); g.stroke();
    g.beginPath(); g.moveTo(W * 0.25, -bodyH * 0.5); g.lineTo(W * 0.05, -bodyH); g.stroke();
    // Sockelsteine
    g.fillStyle = 'rgba(120,110,95,0.5)';
    g.fillRect(-W / 2 + 1, -7, W - 2, 7);
    // Tür (Planken + Bogen)
    rr(g, -10, -24, 20, 24, 8);
    g.fillStyle = vgrad(g, -24, 0, '#7c5630', '#43290f');
    g.fill();
    texOver(g, 'wood', -10, -24, 20, 24, 1);
    rr(g, -10, -24, 20, 24, 8);
    outline(g, 2.2);
    g.strokeStyle = 'rgba(30,20,10,0.5)'; g.lineWidth = 1.2;
    for (const lx of [-4, 1, 6]) { g.beginPath(); g.moveTo(lx, -22); g.lineTo(lx, -1); g.stroke(); }
    ell(g, 5.5, -12, 1.7, 1.7); g.fillStyle = '#e8bb4a'; g.fill();
    // Fenster mit warmem Licht
    windowGlow(g, -W * 0.34, -bodyH * 0.3, 10, 11);
    windowGlow(g, W * 0.34, -bodyH * 0.3, 10, 11);
    if (two) { windowGlow(g, -W * 0.2, -bodyH * 0.78, 8, 9); windowGlow(g, W * 0.2, -bodyH * 0.78, 8, 9); }
    // Schindeldach
    const ry = -bodyH;
    const roofC = tier >= 8 ? '#7a4fc9' : tier >= 6 ? '#3b6ea5' : '#b5502e';
    shingleRoof(g, -W / 2 - 10, W / 2 + 10, ry, 0, ry - H * 0.62 - tier * 1.5, roofC, U.shade(roofC, -0.2), 5);
    // Traufschatten
    g.fillStyle = 'rgba(25,18,12,0.28)';
    g.fillRect(-W / 2 - 4, ry, W + 8, 4);
    // Schornstein
    rr(g, W * 0.16, ry - H * 0.52, 12, H * 0.32, 2);
    g.fillStyle = vgrad(g, ry - H * 0.52, ry - H * 0.2, '#9a938a', '#6a655c');
    g.fill(); outline(g, 2.2);
    g.fillStyle = '#7a746a'; rr(g, W * 0.16 - 2, ry - H * 0.52 - 3, 16, 4.4, 1.6); g.fill(); outline(g, 1.8);
    // Wirtshausschild (Krug)
    g.strokeStyle = '#5a4632'; g.lineWidth = 2.6;
    g.beginPath(); g.moveTo(-W / 2 - 8, -bodyH + 4); g.lineTo(-W / 2 - 8, -bodyH + 13); g.stroke();
    g.beginPath(); g.moveTo(-W / 2 - 14, -bodyH + 6); g.lineTo(-W / 2 - 2, -bodyH + 6); g.stroke();
    rr(g, -W / 2 - 15, -bodyH + 13, 18, 15, 3);
    g.fillStyle = vgrad(g, -bodyH + 13, -bodyH + 28, '#f6d87a', '#c9992e');
    g.fill(); outline(g, 2);
    // Mini-Krug auf dem Schild
    g.fillStyle = '#7c5630';
    rr(g, -W / 2 - 11, -bodyH + 18, 7, 7, 1.6); g.fill();
    g.strokeStyle = '#7c5630'; g.lineWidth = 1.6;
    g.beginPath(); g.arc(-W / 2 - 3, -bodyH + 21.5, 2.4, -1.2, 1.2); g.stroke();
    g.fillStyle = '#fff';
    ell(g, -W / 2 - 7.5, -bodyH + 17.4, 3.4, 1.6); g.fill();
    // Fässer mit Bändern
    for (const bx of [W * 0.42, W * 0.42 + 14]) {
      rr(g, bx - 6.5, -14, 13, 14, 4.4);
      g.fillStyle = vgrad(g, -14, 0, '#b08252', '#6e4a26');
      g.fill();
      texOver(g, 'wood', bx - 7, -14, 14, 14, 0.8);
      rr(g, bx - 6.5, -14, 13, 14, 4.4);
      outline(g, 2);
      g.strokeStyle = '#3f4854'; g.lineWidth = 1.8;
      g.beginPath(); g.moveTo(bx - 6.5, -9.5); g.lineTo(bx + 6.5, -9.5); g.stroke();
      g.beginPath(); g.moveTo(bx - 6.5, -4.5); g.lineTo(bx + 6.5, -4.5); g.stroke();
      g.fillStyle = 'rgba(255,240,210,0.25)';
      g.fillRect(bx - 4.5, -13, 2.2, 12);
    }
    if (tier >= 5) {
      g.fillStyle = '#6e4a26';
      g.fillRect(-W * 0.34 - 7, -bodyH * 0.3 + 7, 14, 4);
      for (const [fx, fc] of [[-3.4, '#e5484d'], [0.5, '#ffd34e'], [4, '#c9a8ff']]) {
        ell(g, -W * 0.34 + fx, -bodyH * 0.3 + 6, 2, 2);
        g.fillStyle = fc; g.fill();
      }
    }
  }

  // ---------- Schmiede ----------
  function paintForge(g, tier) {
    const W = 72 + tier * 4;
    const H = 46 + tier * 3.4;
    aoShadow(g, W * 0.64, W * 0.24, 0.32);
    // Dunkler Steinkorpus
    g.save();
    rr(g, -W / 2, -H, W, H, 5);
    g.clip();
    brickWall(g, -W / 2, -H, W, H, '#8f8a82', '#4e4a42', 41 + tier);
    g.restore();
    rr(g, -W / 2, -H, W, H, 5);
    outline(g, 2.6);
    // Esse mit sattem Glutschein
    const fg2 = g.createRadialGradient(0, -8, 2, 0, -8, 26);
    fg2.addColorStop(0, 'rgba(255,190,90,0.9)');
    fg2.addColorStop(0.5, 'rgba(255,120,40,0.45)');
    fg2.addColorStop(1, 'rgba(200,60,20,0)');
    g.fillStyle = fg2; ell(g, 0, -8, 26, 22); g.fill();
    g.beginPath();
    g.moveTo(-14, 0); g.lineTo(-14, -16); g.arc(0, -16, 14, Math.PI, 0); g.lineTo(14, 0);
    g.closePath();
    g.fillStyle = '#160c04'; g.fill(); outline(g, 2.4);
    const fg = g.createRadialGradient(0, -5, 1, 0, -5, 15);
    fg.addColorStop(0, '#fff0b0'); fg.addColorStop(0.4, '#ffb44e'); fg.addColorStop(0.8, '#e5561e');
    fg.addColorStop(1, 'rgba(160,40,10,0)');
    g.fillStyle = fg;
    g.beginPath(); g.moveTo(-12, 0); g.arc(0, -14, 12, Math.PI, 0); g.lineTo(12, 0); g.closePath(); g.fill();
    // Kohlenstücke
    g.fillStyle = 'rgba(40,16,4,0.85)';
    for (const [cx2, cy2] of [[-7, -2], [-1, -4], [5, -2], [2, -1]]) ell(g, cx2, cy2, 2.6, 1.8), g.fill();
    // Pultdach aus Planken
    g.beginPath();
    g.moveTo(-W / 2 - 9, -H);
    g.lineTo(W * 0.1, -H - 24 - tier * 1.6);
    g.lineTo(W / 2 + 9, -H - 4);
    g.closePath();
    g.fillStyle = vgrad(g, -H - 26, -H, '#8a6234', '#4c3418');
    g.fill();
    texOver(g, 'wood', -W / 2 - 9, -H - 28, W + 18, 30, 1);
    g.beginPath();
    g.moveTo(-W / 2 - 9, -H);
    g.lineTo(W * 0.1, -H - 24 - tier * 1.6);
    g.lineTo(W / 2 + 9, -H - 4);
    g.closePath();
    outline(g, 2.6);
    g.strokeStyle = 'rgba(255,235,200,0.30)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(-W / 2 - 5, -H - 1); g.lineTo(W * 0.08, -H - 22 - tier * 1.4); g.stroke();
    // Schornstein mit Glutrand
    rr(g, W * 0.22, -H - 26 - tier * 1.2, 13, 26, 2);
    g.fillStyle = vgrad(g, -H - 28, -H, '#a29a8c', '#645e52');
    g.fill();
    texOver(g, 'stone', W * 0.22, -H - 28, 13, 28, 1);
    rr(g, W * 0.22, -H - 26 - tier * 1.2, 13, 26, 2);
    outline(g, 2.2);
    if (tier >= 3) {
      const cg = g.createRadialGradient(W * 0.22 + 6.5, -H - 26 - tier * 1.2, 1, W * 0.22 + 6.5, -H - 26 - tier * 1.2, 10);
      cg.addColorStop(0, 'rgba(255,150,50,0.85)'); cg.addColorStop(1, 'rgba(255,150,50,0)');
      g.fillStyle = cg; ell(g, W * 0.22 + 6.5, -H - 26 - tier * 1.2, 10, 6); g.fill();
    }
    // Amboss (mit Horn)
    g.save(); g.translate(-W * 0.36, 0);
    g.fillStyle = vgrad(g, -10, 0, '#5a6478', '#23262e');
    g.beginPath();
    g.moveTo(-10, -7);
    g.quadraticCurveTo(-14, -7.5, -13, -4.5);
    g.quadraticCurveTo(-10, -3.6, -8, -4);
    g.lineTo(9, -4) ; g.lineTo(6.5, -1.4); g.lineTo(4, -1.4); g.lineTo(4, 0); g.lineTo(-4, 0); g.lineTo(-4, -1.4); g.lineTo(-6, -1.6);
    g.lineTo(-8, -4);
    g.closePath(); g.fill(); outline(g, 2);
    g.fillStyle = 'rgba(255,255,255,0.30)';
    g.fillRect(-8, -7, 15, 1.6);
    g.restore();
    // Werkzeuge an der Wand
    g.strokeStyle = '#2e2a24'; g.lineWidth = 2.2;
    g.beginPath(); g.moveTo(W * 0.32, -H + 9); g.lineTo(W * 0.32, -H + 22); g.stroke();
    g.fillStyle = '#4c5568'; rr(g, W * 0.32 - 4, -H + 8, 8, 5, 1); g.fill();
    g.strokeStyle = '#2e2a24';
    g.beginPath(); g.moveTo(W * 0.42, -H + 9); g.lineTo(W * 0.42, -H + 20); g.stroke();
    g.beginPath(); g.arc(W * 0.42, -H + 9, 3.4, Math.PI * 0.9, Math.PI * 2.1); g.stroke();
    if (tier >= 6) {
      g.strokeStyle = '#e8bb4a'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(-W / 2 + 4, -H + 5); g.lineTo(W / 2 - 4, -H + 5); g.stroke();
    }
  }

  // ---------- Goldmine ----------
  function paintMine(g, tier) {
    const W = 74 + tier * 4;
    const rnd = U.seededRng(500 + tier);
    aoShadow(g, W * 0.6, W * 0.22, 0.32);
    // Felshügel (weiche Beulen)
    g.beginPath();
    g.moveTo(-W / 2, 0);
    g.bezierCurveTo(-W * 0.52, -20 - tier, -W * 0.4, -36 - tier * 2.4, -W * 0.16, -40 - tier * 3);
    g.bezierCurveTo(0, -46 - tier * 3, W * 0.2, -44 - tier * 2.6, W * 0.32, -32 - tier * 1.6);
    g.bezierCurveTo(W * 0.48, -22, W * 0.52, -8, W / 2, -2);
    g.quadraticCurveTo(W * 0.2, 3, 0, 3);
    g.quadraticCurveTo(-W * 0.3, 3, -W / 2, 0);
    g.closePath();
    g.fillStyle = vgrad(g, -50 - tier * 3, 3, '#a49d92', '#5c574d');
    g.fill();
    texOver(g, 'stone', -W / 2, -52 - tier * 3, W, 56 + tier * 3, 1);
    g.beginPath();
    g.moveTo(-W / 2, 0);
    g.bezierCurveTo(-W * 0.52, -20 - tier, -W * 0.4, -36 - tier * 2.4, -W * 0.16, -40 - tier * 3);
    g.bezierCurveTo(0, -46 - tier * 3, W * 0.2, -44 - tier * 2.6, W * 0.32, -32 - tier * 1.6);
    g.bezierCurveTo(W * 0.48, -22, W * 0.52, -8, W / 2, -2);
    g.quadraticCurveTo(W * 0.2, 3, 0, 3);
    g.quadraticCurveTo(-W * 0.3, 3, -W / 2, 0);
    g.closePath();
    outline(g, 2.6);
    // Licht-Facetten oben links
    g.strokeStyle = 'rgba(255,255,255,0.30)'; g.lineWidth = 2.4;
    g.beginPath(); g.moveTo(-W * 0.3, -16); g.quadraticCurveTo(-W * 0.24, -26, -W * 0.12, -34 - tier * 2); g.stroke();
    g.beginPath(); g.moveTo(-W * 0.05, -40 - tier * 2.6); g.quadraticCurveTo(W * 0.08, -42 - tier * 2.6, W * 0.16, -38 - tier * 2); g.stroke();
    // Schattenfacette rechts
    g.strokeStyle = 'rgba(20,16,12,0.35)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(W * 0.3, -12); g.quadraticCurveTo(W * 0.36, -20, W * 0.3, -28 - tier); g.stroke();
    // Goldadern mit Glanz
    for (let i = 0; i < Math.min(7, 2 + tier); i++) {
      const x = (rnd() - 0.5) * W * 0.72, y = -8 - rnd() * (26 + tier * 2);
      g.strokeStyle = '#c9992e'; g.lineWidth = 2.6;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + 5, y - 4); g.lineTo(x + 9, y - 2); g.stroke();
      g.strokeStyle = '#ffe084'; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(x + 1, y - 1); g.lineTo(x + 5, y - 4); g.stroke();
      g.fillStyle = '#fff3c0';
      g.beginPath(); g.arc(x + 5, y - 4, 1, 0, TAU); g.fill();
    }
    // Stolleneingang mit Tiefe
    const eg = g.createLinearGradient(0, -16, 0, 0);
    eg.addColorStop(0, '#050301'); eg.addColorStop(1, '#1c1208');
    g.beginPath();
    g.moveTo(-13, 0); g.lineTo(-13, -14); g.arc(0, -14, 13, Math.PI, 0); g.lineTo(13, 0);
    g.closePath();
    g.fillStyle = eg; g.fill(); outline(g, 2.4);
    // Holzrahmen mit Maserung
    g.strokeStyle = '#8a6234'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(-15.5, 1); g.lineTo(-15.5, -16); g.moveTo(15.5, 1); g.lineTo(15.5, -16); g.stroke();
    g.strokeStyle = '#a87c46'; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(-16.5, 0); g.lineTo(-16.5, -15); g.moveTo(14.5, 0); g.lineTo(14.5, -15); g.stroke();
    g.strokeStyle = '#8a6234'; g.lineWidth = 5.5;
    g.beginPath(); g.moveTo(-18, -16.5); g.lineTo(18, -16.5); g.stroke();
    // Gleis
    g.strokeStyle = 'rgba(60,50,40,0.8)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(-6, 1); g.lineTo(-10, 13); g.moveTo(6, 1); g.lineTo(10, 13); g.stroke();
    g.strokeStyle = 'rgba(90,70,45,0.8)'; g.lineWidth = 2.4;
    for (let i = 0; i < 3; i++) {
      g.beginPath(); g.moveTo(-8 - i, 4 + i * 4); g.lineTo(8 + i, 4 + i * 4); g.stroke();
    }
    // Lore mit Goldhaufen
    g.save(); g.translate(W * 0.3, 2);
    rr(g, -11, -11, 22, 11, 2);
    g.fillStyle = vgrad(g, -11, 0, '#7c5630', '#4c3418');
    g.fill();
    texOver(g, 'wood', -11, -11, 22, 11, 0.9);
    rr(g, -11, -11, 22, 11, 2);
    outline(g, 2);
    g.strokeStyle = '#3f4854'; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(-11, -5.5); g.lineTo(11, -5.5); g.stroke();
    for (let i = 0; i < 4; i++) {
      ell(g, -6 + i * 4, -12 - (i % 2) * 2, 3.2, 2.8);
      g.fillStyle = i % 2 ? '#ffd34e' : '#f0b83a'; g.fill();
      g.strokeStyle = 'rgba(140,90,15,0.8)'; g.lineWidth = 1.2; g.stroke();
    }
    g.fillStyle = '#fff3c0'; ell(g, -4, -13.4, 1, 1); g.fill();
    ell(g, -6, 0, 3.2, 3.2); g.fillStyle = '#2e2a24'; g.fill();
    g.fillStyle = '#6a655c'; ell(g, -6, 0, 1.2, 1.2); g.fill();
    ell(g, 6, 0, 3.2, 3.2); g.fillStyle = '#2e2a24'; g.fill();
    g.fillStyle = '#6a655c'; ell(g, 6, 0, 1.2, 1.2); g.fill();
    g.restore();
    // Laterne
    if (tier >= 4) {
      const lg = g.createRadialGradient(-W * 0.34, -28, 1, -W * 0.34, -28, 14);
      lg.addColorStop(0, 'rgba(255,220,120,0.8)'); lg.addColorStop(1, 'rgba(255,220,120,0)');
      g.fillStyle = lg; ell(g, -W * 0.34, -28, 14, 14); g.fill();
      g.strokeStyle = '#5a4632'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(-W * 0.34, 0); g.lineTo(-W * 0.34, -24); g.stroke();
      rr(g, -W * 0.34 - 4, -32, 8, 9, 2);
      g.fillStyle = '#ffe084'; g.fill(); outline(g, 1.8);
    }
  }

  // ---------- Schrein ----------
  function paintShrine(g, tier) {
    const W = 64 + tier * 3;
    aoShadow(g, W * 0.56, W * 0.2, 0.3);
    // Podest (Marmor)
    for (let i = 0; i < 2; i++) {
      const pw = W - i * 14;
      rr(g, -pw / 2, -6 - i * 6, pw, 7, 3);
      g.fillStyle = vgrad(g, -14, 2, i ? '#f0ebdd' : '#d8d2c2', i ? '#cfc8b8' : '#aaa494');
      g.fill(); outline(g, 2);
      g.fillStyle = 'rgba(255,255,255,0.4)';
      g.fillRect(-pw / 2 + 2, -6 - i * 6 + 1, pw - 4, 1.4);
    }
    // Säulen mit Kanneluren & Marmoradern
    const cols = tier >= 5 ? 4 : 2;
    const colX = [-W * 0.3, W * 0.3, -W * 0.14, W * 0.14];
    const colH = 34 + tier * 2.2;
    for (let i = 0; i < cols; i++) {
      const x = colX[i], back = i >= 2, off = back ? 4 : 0;
      rr(g, x - 4, -12 - colH + off, 8, colH, 2.4);
      g.fillStyle = vgrad(g, -12 - colH, -12, back ? '#ddd6c6' : '#f7f2e4', back ? '#a8a192' : '#c6bfae');
      g.fill(); outline(g, 2);
      // Kanneluren
      g.strokeStyle = 'rgba(120,112,95,0.35)'; g.lineWidth = 1;
      for (const lx of [-1.6, 0.8]) {
        g.beginPath(); g.moveTo(x + lx, -12 - colH + off + 4); g.lineTo(x + lx, -14 + off); g.stroke();
      }
      g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(x - 3, -12 - colH + off + 4); g.lineTo(x - 3, -14 + off); g.stroke();
      // Kapitell & Basis (golden ab Stufe 3)
      g.fillStyle = tier >= 3 ? '#e8bb4a' : '#e8e1d2';
      rr(g, x - 6, -12 - colH - 4.4 + off, 12, 5, 1.6); g.fill(); outline(g, 1.8);
      rr(g, x - 5.5, -13 + off, 11, 4, 1.4); g.fill(); outline(g, 1.6);
    }
    // Bogen mit Schlussstein
    g.beginPath(); g.arc(0, -12 - colH + 2, W * 0.34, Math.PI, 0);
    g.lineTo(W * 0.34 - 6, -12 - colH + 2);
    g.arc(0, -12 - colH + 2, W * 0.34 - 6, 0, Math.PI, true);
    g.closePath();
    g.fillStyle = tier >= 7 ? vgrad(g, -12 - colH - W * 0.34, -12 - colH, '#ffe89a', '#c9992e') : vgrad(g, -12 - colH - W * 0.34, -12 - colH, '#f7f2e4', '#c6bfae');
    g.fill(); outline(g, 2.2);
    rr(g, -4.4, -12 - colH + 2 - W * 0.34 - 3, 8.8, 8, 1.6);
    g.fillStyle = '#e8bb4a'; g.fill(); outline(g, 1.8);
    // Schwebender Kristall (mehrschichtiges Glühen)
    const cy = -30 - colH * 0.45;
    for (const [r, a] of [[30 + tier * 2, 0.18], [18, 0.3], [10, 0.4]]) {
      const gl = g.createRadialGradient(0, cy, 1, 0, cy, r);
      gl.addColorStop(0, `rgba(255,248,208,${a})`); gl.addColorStop(1, 'rgba(255,240,180,0)');
      g.fillStyle = gl; ell(g, 0, cy, r, r); g.fill();
    }
    g.beginPath();
    g.moveTo(0, cy - 13); g.lineTo(7.5, cy); g.lineTo(0, cy + 13); g.lineTo(-7.5, cy);
    g.closePath();
    g.fillStyle = vgrad(g, cy - 13, cy + 13, '#fffdf2', '#f0c93e');
    g.fill(); outline(g, 2);
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.beginPath(); g.moveTo(-1, cy - 8); g.lineTo(-3.4, cy - 1); g.lineTo(-1.4, cy - 1); g.closePath(); g.fill();
    drawStar(g, -12, cy - 12, 2.4, '#fff3c0');
    drawStar(g, 13, cy + 3, 2, '#fff3c0');
  }

  // ---------- Markt ----------
  function paintMarkt(g, tier) {
    const W = 78 + tier * 4;
    const H = 48 + tier * 3;
    aoShadow(g, W * 0.66, W * 0.24, 0.3);
    // Tresen (Holz)
    const counterH = 22;
    rr(g, -W / 2, -counterH, W, counterH, 3);
    g.fillStyle = vgrad(g, -counterH, 0, '#a87c46', '#6a4522');
    g.fill();
    texOver(g, 'wood', -W / 2, -counterH, W, counterH, 1);
    rr(g, -W / 2, -counterH, W, counterH, 3);
    outline(g, 2.4);
    g.fillStyle = 'rgba(255,235,190,0.28)';
    g.fillRect(-W / 2 + 2, -counterH + 1.4, W - 4, 2.2);
    // Pfosten
    for (const px of [-W / 2 + 5, W / 2 - 5]) {
      rr(g, px - 3, -H, 6, H, 2);
      g.fillStyle = vgrad(g, -H, 0, '#8a6234', '#5a3d1e');
      g.fill(); outline(g, 2);
    }
    // Markise: rot-weiße Streifen mit Bogenkante
    const awY = -H, awH = 16 + tier;
    g.save();
    g.beginPath();
    g.moveTo(-W / 2 - 8, awY + awH);
    g.lineTo(-W / 2 - 4, awY);
    g.lineTo(W / 2 + 4, awY);
    g.lineTo(W / 2 + 8, awY + awH);
    // Bogenkante unten
    const scal = 7;
    for (let x = W / 2 + 8; x > -W / 2 - 8; x -= scal * 2) {
      g.arc(x - scal, awY + awH, scal, 0, Math.PI, false);
    }
    g.closePath();
    g.clip();
    for (let i = -7; i < 8; i++) {
      g.fillStyle = i % 2 ? '#e8ddc8' : (tier >= 7 ? '#7a4fc9' : '#c0392b');
      g.fillRect(i * 10 - 5, awY - 4, 10, awH + 14);
    }
    // Schattierung
    g.fillStyle = 'rgba(30,20,15,0.16)';
    g.fillRect(-W / 2 - 8, awY + awH - 5, W + 16, 12);
    g.fillStyle = 'rgba(255,255,255,0.2)';
    g.fillRect(-W / 2 - 8, awY, W + 16, 3);
    g.restore();
    g.beginPath();
    g.moveTo(-W / 2 - 8, awY + awH);
    g.lineTo(-W / 2 - 4, awY);
    g.lineTo(W / 2 + 4, awY);
    g.lineTo(W / 2 + 8, awY + awH);
    for (let x = W / 2 + 8; x > -W / 2 - 8; x -= scal * 2) {
      g.arc(x - scal, awY + awH, scal, 0, Math.PI, false);
    }
    g.closePath();
    outline(g, 2.4);
    // Waren auf dem Tresen
    // Goldsäckchen
    g.save(); g.translate(-W * 0.28, -counterH);
    g.beginPath();
    g.moveTo(-6, 0);
    g.bezierCurveTo(-8, -6, -5, -11, -2, -12);
    g.quadraticCurveTo(-2.6, -14, 0, -14);
    g.quadraticCurveTo(2.6, -14, 2, -12);
    g.bezierCurveTo(5, -11, 8, -6, 6, 0);
    g.closePath();
    g.fillStyle = vgrad(g, -14, 0, '#b08a56', '#77572e');
    g.fill(); outline(g, 1.8);
    g.strokeStyle = '#f2d24a'; g.lineWidth = 1.8;
    g.beginPath(); g.moveTo(-2.4, -12); g.lineTo(2.4, -12); g.stroke();
    g.restore();
    // Äpfel-Kiste
    g.save(); g.translate(W * 0.02, -counterH);
    rr(g, -8, -7, 16, 7, 1.4);
    g.fillStyle = '#8a6234'; g.fill(); outline(g, 1.6);
    for (const [ax, ay] of [[-4.4, -7.4], [0, -8.4], [4.4, -7.4], [-2, -6], [2.4, -6]]) {
      ell(g, ax, ay, 2.6, 2.6);
      g.fillStyle = '#d0392b'; g.fill();
      g.strokeStyle = 'rgba(40,20,15,0.5)'; g.lineWidth = 1; g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.45)';
      ell(g, ax - 0.8, ay - 0.9, 0.8, 0.8); g.fill();
    }
    g.restore();
    // Angelehntes Schwert
    g.save(); g.translate(W * 0.3, -counterH); g.rotate(0.5);
    g.fillStyle = '#d7dde8';
    g.beginPath(); g.moveTo(-1.8, 0); g.lineTo(-1.4, -15); g.lineTo(0, -18); g.lineTo(1.4, -15); g.lineTo(1.8, 0); g.closePath();
    g.fill(); outline(g, 1.4);
    g.fillStyle = '#8a6a3a'; g.fillRect(-4, 0, 8, 2.4);
    g.restore();
    // Hängendes Münz-Schild
    g.strokeStyle = '#5a4632'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(-W * 0.4, awY + awH); g.lineTo(-W * 0.4, awY + awH + 9); g.stroke();
    const sg = g.createRadialGradient(-W * 0.4 - 1, awY + awH + 14, 1, -W * 0.4, awY + awH + 15, 7);
    sg.addColorStop(0, '#fff3c0'); sg.addColorStop(0.6, '#ffd34e'); sg.addColorStop(1, '#c9992e');
    ell(g, -W * 0.4, awY + awH + 15, 6.5, 6.5);
    g.fillStyle = sg; g.fill(); outline(g, 1.8);
    // Kiste & Fass daneben
    rr(g, -W / 2 - 16, -13, 15, 13, 2);
    g.fillStyle = vgrad(g, -13, 0, '#a87c46', '#6a4522'); g.fill(); outline(g, 2);
    g.strokeStyle = 'rgba(50,30,12,0.5)'; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(-W / 2 - 16, -6.5); g.lineTo(-W / 2 - 1, -6.5); g.stroke();
    if (tier >= 4) {
      const lg = g.createRadialGradient(W / 2 + 10, -H + 4, 1, W / 2 + 10, -H + 4, 12);
      lg.addColorStop(0, 'rgba(255,220,120,0.8)'); lg.addColorStop(1, 'rgba(255,220,120,0)');
      g.fillStyle = lg; ell(g, W / 2 + 10, -H + 4, 12, 12); g.fill();
      rr(g, W / 2 + 6, -H, 8, 9, 2);
      g.fillStyle = '#ffe084'; g.fill(); outline(g, 1.8);
    }
    if (tier >= 7) flagPole(g, W / 2 - 5, -H, 14, '#f2d24a');
  }

  // ---------- Baumeister-Hütte (Stadtmauer-Bauplatz) ----------
  function paintWallLodge(g, tier) {
    aoShadow(g, 40, 15, 0.3);
    // Werkbank
    rr(g, -20, -14, 40, 14, 2);
    g.fillStyle = vgrad(g, -14, 0, '#a87c46', '#6a4522');
    g.fill();
    texOver(g, 'wood', -20, -14, 40, 14, 1);
    rr(g, -20, -14, 40, 14, 2);
    outline(g, 2.2);
    // Zeltdach
    g.beginPath();
    g.moveTo(-26, -14); g.lineTo(0, -40 - tier); g.lineTo(26, -14);
    g.closePath();
    g.fillStyle = vgrad(g, -42, -14, '#e8ddc8', '#b9a683');
    g.fill(); outline(g, 2.4);
    g.strokeStyle = 'rgba(120,90,50,0.4)'; g.lineWidth = 1.6;
    for (let i = 1; i < 4; i++) {
      const t = i / 4;
      g.beginPath();
      g.moveTo(-26 + 26 * t, -14 - (26 + tier) * t);
      g.lineTo(26 - 26 * t, -14 - (26 + tier) * t);
      g.stroke();
    }
    // Steinstapel
    for (const [sx, sy, sw] of [[-30, 0, 9], [-24, -4, 8], [-33, -5, 7]]) {
      rr(g, sx - sw / 2, sy - 5, sw, 5.5, 1.4);
      g.fillStyle = '#a8a196'; g.fill(); outline(g, 1.6);
    }
    // Hammer auf der Bank
    g.save(); g.translate(6, -15); g.rotate(-0.4);
    g.strokeStyle = '#8a6234'; g.lineWidth = 2.2;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(8, -6); g.stroke();
    g.fillStyle = '#5a6478'; rr(g, 6, -9.4, 6, 5, 1); g.fill(); outline(g, 1.4);
    g.restore();
    // Plan-Rolle
    g.fillStyle = '#f0e8d2';
    rr(g, -12, -17.5, 12, 4, 2); g.fill(); outline(g, 1.4);
  }

  // Torwacht-Hütte: der Bauplatz, über den die Stadttore gebaut werden
  function paintGateLodge(g, tier) {
    aoShadow(g, 36, 14, 0.3);
    const gold = tier >= 8, iron = tier >= 5;
    // Kleines Wachhaus aus Stein
    const hgt = 30 + tier * 1.6;
    g.save();
    rr(g, -22, -hgt, 44, hgt, 3);
    g.clip();
    brickWall(g, -22, -hgt, 44, hgt,
      gold ? '#efe6d2' : '#c2c3cc', gold ? '#b9ac90' : '#8b8c96', tier * 9, 12, 6.6);
    g.restore();
    rr(g, -22, -hgt, 44, hgt, 3);
    outline(g, 2.4);
    // Zinnenkranz
    for (let i = 0; i < 3; i++) {
      rr(g, -21 + i * 15, -hgt - 6, 11, 7, 1.6);
      g.fillStyle = gold ? '#e2d7bd' : '#aeafb9'; g.fill(); outline(g, 1.8);
    }
    // Durchgang mit angelehntem Torflügel
    g.beginPath();
    g.moveTo(-9, 0); g.lineTo(-9, -16); g.arc(0, -16, 9, Math.PI, 0); g.lineTo(9, 0);
    g.closePath();
    g.fillStyle = '#241a10'; g.fill(); outline(g, 2.2);
    // Torflügel als Muster (zeigt, was gebaut wird)
    rr(g, -8, -22, 7.5, 22, 1.6);
    g.fillStyle = vgrad(g, -22, 0, '#a8794a', '#5c3f1c'); g.fill();
    texOver(g, 'wood', -8, -22, 7.5, 22, 1);
    rr(g, -8, -22, 7.5, 22, 1.6); outline(g, 1.8);
    g.fillStyle = iron ? (gold ? '#e8bb4a' : '#6e727e') : '#7a5a34';
    g.fillRect(-7.4, -17, 6.4, 2.6);
    g.fillRect(-7.4, -9, 6.4, 2.6);
    // Fenster
    windowGlow(g, 13, -hgt * 0.62, 5.5, 11);
    // Winde/Kurbel neben dem Haus
    g.strokeStyle = '#5a4632'; g.lineWidth = 2.6;
    g.beginPath(); g.moveTo(-30, 0); g.lineTo(-30, -18); g.stroke();
    ell(g, -30, -19, 6.4, 6.4);
    g.fillStyle = vgrad(g, -26, -13, '#a87c46', '#6a4522'); g.fill(); outline(g, 2);
    g.strokeStyle = '#3c2a16'; g.lineWidth = 1.6;
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 4 + 0.3;
      g.beginPath();
      g.moveTo(-30 + Math.cos(a) * 6.4, -19 + Math.sin(a) * 6.4);
      g.lineTo(-30 - Math.cos(a) * 6.4, -19 - Math.sin(a) * 6.4);
      g.stroke();
    }
    // Kette zur Winde
    g.strokeStyle = '#6e727e'; g.lineWidth = 1.8;
    g.beginPath(); g.moveTo(-24, -20); g.quadraticCurveTo(-14, -26, -9, -23); g.stroke();
    // Fahne oben (ab Stufe 4)
    if (tier >= 4) flagPole(g, 20, -hgt - 6, 20 + tier, gold ? '#f2d24a' : '#3b6ea5');
    // Ersatz-Bohlen am Boden
    for (const [bx, by] of [[27, -3], [30, -7]]) {
      g.save(); g.translate(bx, by); g.rotate(-0.15);
      rr(g, -8, -3, 16, 5, 1.4);
      g.fillStyle = '#8a6234'; g.fill(); outline(g, 1.6);
      g.restore();
    }
  }

  function paintBuilding(g, type, tier) {
    if (type === 'castle') return paintCastle(g, tier);
    if (type === 'mine') return paintMine(g, tier);
    if (type === 'tavern') return paintTavern(g, tier);
    if (type === 'forge') return paintForge(g, tier);
    if (type === 'shrine') return paintShrine(g, tier);
    if (type === 'markt') return paintMarkt(g, tier);
    if (type === 'wall') return paintWallLodge(g, tier);
    if (type === 'gates') return paintGateLodge(g, tier);
    return paintTower(g, type, tier);
  }

  function building(type, tier) {
    const big = type === 'castle';
    const w = big ? 260 : 150, h = big ? 240 : 190;
    return make(`bld:${type}:${tier}`, w, h, g => paintBuilding(g, type, tier), big ? 10 : 8);
  }

  // ---------- Stadtmauer: Pfosten, Trümmer, Torpfeiler ----------
  function paintWallPost(g, tier, v, cracked) {
    const hgt = 30 + tier * 2.2;
    aoShadow(g, 15, 6, 0.28);
    if (tier <= 3) {
      // Palisade: Doppel-Stamm mit Spitzen
      for (const [dx, dh] of [[-6, 0], [6, -4], [0, 3]]) {
        const hh = hgt + dh + (v ? 2 : 0);
        rr(g, dx - 5, -hh, 10, hh, 3);
        g.fillStyle = vgrad(g, -hh, 0, cracked ? '#8a6a44' : '#a87c46', cracked ? '#4a3418' : '#5f3f1c');
        g.fill();
        texOver(g, 'wood', dx - 5, -hh, 10, hh, 1);
        rr(g, dx - 5, -hh, 10, hh, 3);
        outline(g, 2);
        // Spitze
        g.beginPath();
        g.moveTo(dx - 5, -hh + 2); g.lineTo(dx, -hh - 7); g.lineTo(dx + 5, -hh + 2);
        g.closePath();
        g.fillStyle = cracked ? '#7a5a34' : '#96703e'; g.fill(); outline(g, 1.8);
        g.strokeStyle = 'rgba(255,230,180,0.35)'; g.lineWidth = 1.2;
        g.beginPath(); g.moveTo(dx - 3, -hh + 4); g.lineTo(dx - 3, -6); g.stroke();
      }
      // Seil-Bindung
      g.strokeStyle = '#c9a86a'; g.lineWidth = 2.6;
      g.beginPath(); g.moveTo(-11, -hgt * 0.55); g.lineTo(11, -hgt * 0.55 - 2); g.stroke();
      g.beginPath(); g.moveTo(-11, -hgt * 0.3); g.lineTo(11, -hgt * 0.3 + 1.4); g.stroke();
      if (cracked) {
        g.strokeStyle = 'rgba(20,12,6,0.75)'; g.lineWidth = 1.8;
        g.beginPath(); g.moveTo(2, -hgt); g.lineTo(-1, -hgt * 0.6); g.lineTo(3, -hgt * 0.35); g.stroke();
      }
    } else {
      const gold = tier >= 8;
      const c0 = gold ? '#efe6d2' : '#b3b4be', c1 = gold ? '#b9ac90' : '#7d7e8a';
      g.save();
      rr(g, -12, -hgt, 24, hgt, 2.4);
      g.clip();
      brickWall(g, -12, -hgt, 24, hgt, cracked ? U.shade(c0, -0.14) : c0, cracked ? U.shade(c1, -0.14) : c1, tier * 7 + v, 11, 6.4);
      g.restore();
      rr(g, -12, -hgt, 24, hgt, 2.4);
      outline(g, 2.2);
      // Zinnen (2 Merlonen; bei Schaden abgebrochen)
      const merlons = cracked ? [[-11, 8]] : [[-11, 8], [3, 8]];
      for (const [mx, mw] of merlons) {
        rr(g, mx, -hgt - 6, mw, 7, 1.4);
        g.fillStyle = gold ? '#e2d7bd' : '#a3a4ae'; g.fill(); outline(g, 1.8);
      }
      if (gold) {
        g.strokeStyle = '#e8bb4a'; g.lineWidth = 2.2;
        g.beginPath(); g.moveTo(-11, -hgt + 6); g.lineTo(11, -hgt + 6); g.stroke();
      }
      g.fillStyle = 'rgba(255,255,255,0.22)';
      g.fillRect(-11, -hgt + 1, 3, hgt - 3);
      if (cracked) {
        g.strokeStyle = 'rgba(15,12,10,0.8)'; g.lineWidth = 2;
        g.beginPath();
        g.moveTo(4, -hgt + 2); g.lineTo(0, -hgt * 0.6); g.lineTo(5, -hgt * 0.42) ; g.lineTo(1, -hgt * 0.2);
        g.stroke();
        // Abgeplatzte Steinchen am Fuß
        g.fillStyle = '#8d867b';
        ell(g, 9, -2, 3, 2); g.fill();
        ell(g, -10, -1.4, 2.4, 1.8); g.fill();
      }
    }
  }

  function wallPost(tier, v, cracked) {
    return make(`wallpost:${tier}:${v}:${cracked ? 1 : 0}`, 44, 76, g => paintWallPost(g, tier, v, cracked), 7);
  }

  // ---------- Stadttor (Torflügel im Durchgang) ----------
  // dmg: 0 = heil, 1 = angeschlagen, 2 = stark beschädigt
  function paintGateDoor(g, tier, dmg) {
    const W2 = 62, hgt = 34 + tier * 2.4;
    const gold = tier >= 8, iron = tier >= 5;
    aoShadow(g, W2 * 0.5, 8, 0.3);
    // Torbogen aus Stein
    for (const sd of [-1, 1]) {
      const px = sd * (W2 / 2 + 4);
      g.save();
      rr(g, px - 7, -hgt - 8, 14, hgt + 8, 2.4);
      g.clip();
      brickWall(g, px - 7, -hgt - 8, 14, hgt + 8,
        gold ? '#efe6d2' : '#bcbdc6', gold ? '#b9ac90' : '#84858f', tier * 5 + sd, 8, 6);
      g.restore();
      rr(g, px - 7, -hgt - 8, 14, hgt + 8, 2.4);
      outline(g, 2.2);
      // Zinne auf dem Pfosten
      rr(g, px - 8, -hgt - 14, 16, 7, 1.6);
      g.fillStyle = gold ? '#e2d7bd' : '#a9aab4'; g.fill(); outline(g, 1.8);
    }
    // Sturz über dem Durchgang
    rr(g, -W2 / 2 - 10, -hgt - 12, W2 + 20, 9, 2);
    g.fillStyle = gold ? '#e8dcc2' : '#b0b1bb'; g.fill(); outline(g, 2.2);

    // Torflügel (zwei Hälften)
    const doorH = hgt - 2;
    for (const sd of [-1, 1]) {
      const x0 = sd < 0 ? -W2 / 2 + 1 : 1;
      const w = W2 / 2 - 2;
      const lean = dmg >= 2 ? sd * 0.09 : 0;    // hängt schief, wenn stark beschädigt
      g.save();
      g.translate(0, 0); g.rotate(lean);
      rr(g, x0, -doorH, w, doorH, 2);
      g.fillStyle = vgrad(g, -doorH, 0,
        dmg ? '#8a6234' : '#a8794a', dmg ? '#402a12' : '#5c3f1c');
      g.fill();
      texOver(g, 'wood', x0, -doorH, w, doorH, dmg ? 1.25 : 1);
      rr(g, x0, -doorH, w, doorH, 2);
      outline(g, 2.2);
      // Senkrechte Planken
      g.strokeStyle = 'rgba(40,24,10,0.45)'; g.lineWidth = 1.4;
      for (let i = 1; i < 4; i++) {
        const px = x0 + (w / 4) * i;
        g.beginPath(); g.moveTo(px, -doorH + 2); g.lineTo(px, -2); g.stroke();
      }
      // Eisenbänder
      const band = iron ? (gold ? '#e8bb4a' : '#6e727e') : '#7a5a34';
      g.fillStyle = band;
      for (const by of [-doorH * 0.75, -doorH * 0.35]) {
        g.fillRect(x0 + 1, by, w - 2, 3.4);
        g.fillStyle = iron ? '#c9ccd4' : '#a8834a';
        for (let i = 0; i < 3; i++) { ell(g, x0 + 4 + i * (w - 8) / 2, by + 1.7, 1.1, 1.1); g.fill(); }
        g.fillStyle = band;
      }
      // Ring-Griff
      g.strokeStyle = iron ? '#575b66' : '#7a5a34'; g.lineWidth = 2.2;
      g.beginPath(); g.arc(x0 + (sd < 0 ? w - 7 : 7), -doorH * 0.5, 3.6, 0, Math.PI * 2); g.stroke();
      // Glanzkante
      g.fillStyle = 'rgba(255,235,190,0.2)';
      g.fillRect(x0 + 1, -doorH + 1, 2.4, doorH - 3);
      g.restore();
    }
    // Schadensbild
    if (dmg >= 1) {
      g.strokeStyle = 'rgba(15,10,6,0.8)'; g.lineWidth = 2.2;
      g.beginPath();
      g.moveTo(-6, -doorH + 4); g.lineTo(2, -doorH * 0.6); g.lineTo(-4, -doorH * 0.34);
      g.stroke();
    }
    if (dmg >= 2) {
      // Loch mit gesplittertem Rand
      g.fillStyle = '#1a1208';
      g.beginPath();
      g.moveTo(-10, -doorH * 0.62); g.lineTo(1, -doorH * 0.7); g.lineTo(7, -doorH * 0.4);
      g.lineTo(-3, -doorH * 0.26); g.closePath(); g.fill();
      g.strokeStyle = '#6e4a22'; g.lineWidth = 1.6; g.stroke();
      g.fillStyle = '#8a6234';
      ell(g, 12, -2.4, 3.4, 2.2); g.fill();
      ell(g, -14, -1.8, 2.8, 2); g.fill();
    }
    // Wappen über dem Tor (ab Stufe 6)
    if (tier >= 6) {
      g.save(); g.translate(0, -hgt - 8);
      g.fillStyle = gold ? '#f2d24a' : '#c9ccd4';
      g.beginPath();
      g.moveTo(-6, -6); g.lineTo(6, -6); g.lineTo(6, 1); g.quadraticCurveTo(6, 6, 0, 8);
      g.quadraticCurveTo(-6, 6, -6, 1); g.closePath();
      g.fill(); outline(g, 1.8);
      g.fillStyle = '#8e1f2c';
      g.beginPath(); g.arc(0, 0, 2.2, 0, Math.PI * 2); g.fill();
      g.restore();
    }
  }

  function gateDoor(tier, dmg) {
    return make(`gatedoor:${tier}:${dmg}`, 108, 96, g => paintGateDoor(g, tier, dmg), 8);
  }

  // Zerbrochenes Tor: nur noch Trümmer und Angeln
  function gateBroken(tier) {
    return make(`gatebroken:${tier}`, 108, 70, g => {
      const W2 = 62, hgt = 34 + tier * 2.4;
      const gold = tier >= 8;
      aoShadow(g, W2 * 0.5, 8, 0.24);
      for (const sd of [-1, 1]) {
        const px = sd * (W2 / 2 + 4);
        g.save();
        rr(g, px - 7, -hgt - 8, 14, hgt + 8, 2.4);
        g.clip();
        brickWall(g, px - 7, -hgt - 8, 14, hgt + 8,
          gold ? '#e2d9c4' : '#aeafb8', gold ? '#ac9f83' : '#77787f', tier * 5 + sd, 8, 6);
        g.restore();
        rr(g, px - 7, -hgt - 8, 14, hgt + 8, 2.4);
        outline(g, 2.2);
        // Abgerissene Angel
        g.fillStyle = '#575b66';
        g.fillRect(px + (sd < 0 ? 6 : -9), -hgt * 0.72, 3.4, 6);
        g.fillRect(px + (sd < 0 ? 6 : -9), -hgt * 0.34, 3.4, 6);
        // Splitter am Pfosten
        g.fillStyle = '#8a6234';
        g.beginPath();
        g.moveTo(px + (sd < 0 ? 7 : -7), -hgt * 0.66);
        g.lineTo(px + (sd < 0 ? 20 : -20), -hgt * 0.52);
        g.lineTo(px + (sd < 0 ? 8 : -8), -hgt * 0.44);
        g.closePath(); g.fill(); outline(g, 1.6);
      }
      // Trümmer im Durchgang
      const rnd = U.seededRng(tier * 31 + 7);
      for (let i = 0; i < 5; i++) {
        const x = (rnd() - 0.5) * W2 * 0.8, y = -rnd() * 6;
        g.save(); g.translate(x, y); g.rotate((rnd() - 0.5) * 1.6);
        rr(g, -6, -2.4, 12, 4.4, 1.4);
        g.fillStyle = rnd() < 0.5 ? '#8a6234' : '#6e4a26'; g.fill(); outline(g, 1.6);
        g.restore();
      }
    }, 8);
  }

  function wallRubble(v) {
    return make(`wallrubble:${v}`, 44, 34, g => {
      aoShadow(g, 16, 6, 0.26);
      const rnd = U.seededRng(v * 77 + 5);
      for (let i = 0; i < 6; i++) {
        const x = (rnd() - 0.5) * 24, y = -rnd() * 7, r = 3 + rnd() * 4.4;
        ell(g, x, y, r, r * 0.75);
        g.fillStyle = rnd() < 0.5 ? '#9a938a' : '#7a746a';
        g.fill(); outline(g, 1.8);
        g.fillStyle = 'rgba(255,255,255,0.2)';
        ell(g, x - r * 0.3, y - r * 0.3, r * 0.3, r * 0.22); g.fill();
      }
      // zersplitterter Balken
      g.save(); g.rotate(-0.2);
      g.fillStyle = '#7a5a34';
      rr(g, -14, -4.4, 16, 3.6, 1); g.fill(); outline(g, 1.4);
      g.restore();
    }, 6);
  }

  function gatePost(tier) {
    const t = Math.max(1, tier);
    return make(`gatepost:${t}`, 40, 96, g => {
      const hgt = 42 + t * 2.4;
      aoShadow(g, 13, 5.4, 0.3);
      const gold = t >= 8, wood = t <= 3;
      if (wood) {
        rr(g, -6.5, -hgt, 13, hgt, 3);
        g.fillStyle = vgrad(g, -hgt, 0, '#a87c46', '#5f3f1c');
        g.fill();
        texOver(g, 'wood', -7, -hgt, 14, hgt, 1);
        rr(g, -6.5, -hgt, 13, hgt, 3);
        outline(g, 2.2);
      } else {
        g.save();
        rr(g, -8, -hgt, 16, hgt, 2.4);
        g.clip();
        brickWall(g, -8, -hgt, 16, hgt, gold ? '#efe6d2' : '#b3b4be', gold ? '#b9ac90' : '#7d7e8a', t * 3, 10, 6);
        g.restore();
        rr(g, -8, -hgt, 16, hgt, 2.4);
        outline(g, 2.2);
      }
      // Dach-Kappe
      g.beginPath();
      g.moveTo(-11, -hgt); g.lineTo(0, -hgt - 11); g.lineTo(11, -hgt);
      g.closePath();
      g.fillStyle = vgrad(g, -hgt - 11, -hgt, '#c0392b', '#8a2620');
      g.fill(); outline(g, 2);
      // Laterne
      const lg = g.createRadialGradient(0, -hgt * 0.62, 1, 0, -hgt * 0.62, 12);
      lg.addColorStop(0, 'rgba(255,220,120,0.85)'); lg.addColorStop(1, 'rgba(255,220,120,0)');
      g.fillStyle = lg; ell(g, 0, -hgt * 0.62, 12, 12); g.fill();
      rr(g, -3.4, -hgt * 0.62 - 4, 6.8, 8, 1.6);
      g.fillStyle = '#ffe084'; g.fill(); outline(g, 1.6);
      // Banner
      if (gold) flagPole(g, 0, -hgt - 11, 10, '#f2d24a');
    }, 7);
  }

  // ---------- Bauplatte ----------
  function padPlate(locked) {
    return make(`pad:${locked ? 'l' : 'u'}`, 124, 82, g => {
      aoShadow(g, 52, 22, 0.22, -8);
      // Äußerer Steinring in Segmenten
      const segs = 12;
      for (let i = 0; i < segs; i++) {
        const a0 = (i / segs) * TAU, a1 = ((i + 0.9) / segs) * TAU;
        g.beginPath();
        g.ellipse(0, -9, 51, 26, 0, a0, a1);
        g.ellipse(0, -9, 42, 20.4, 0, a1, a0, true);
        g.closePath();
        const lit = Math.cos(a0 + 0.6) > 0.2;
        g.fillStyle = locked
          ? (lit ? '#9a948a' : '#87817a')
          : (lit ? '#c2b9a4' : '#a89f8a');
        g.fill();
        g.strokeStyle = 'rgba(60,50,38,0.45)'; g.lineWidth = 1.6; g.stroke();
      }
      // Innenfläche (vertieft)
      ell(g, 0, -9, 42, 20.4);
      g.fillStyle = locked ? '#8d877c' : '#b5ac96';
      g.fill();
      g.strokeStyle = 'rgba(50,42,30,0.5)'; g.lineWidth = 2; g.stroke();
      ell(g, 0, -7.6, 38, 17.6);
      g.fillStyle = locked ? '#97918a' : '#c4bba4';
      g.fill();
      // Gold-Einlage-Ring
      g.save();
      g.strokeStyle = locked ? 'rgba(150,150,158,0.5)' : 'rgba(201,153,46,0.75)';
      g.lineWidth = 2.4; g.setLineDash([8, 6]);
      g.beginPath(); g.ellipse(0, -8.4, 32, 14.4, 0, 0, TAU); g.stroke();
      g.restore();
      // Hammer-Relief
      g.save(); g.globalAlpha = locked ? 0.45 : 0.6; g.translate(0, -9);
      g.strokeStyle = locked ? '#3c3a34' : '#8a6a2e'; g.lineWidth = 3.2;
      g.beginPath(); g.moveTo(-6, 5); g.lineTo(5, -4); g.stroke();
      g.fillStyle = locked ? '#3c3a34' : '#8a6a2e';
      rr(g, 2, -8.5, 9, 6, 1.8); g.fill();
      g.restore();
      // Riss-Details
      g.strokeStyle = 'rgba(60,50,38,0.35)'; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(-24, -14); g.lineTo(-16, -10); g.lineTo(-18, -6); g.stroke();
      if (locked) {
        g.strokeStyle = '#26241f'; g.lineWidth = 4.6;
        g.beginPath(); g.moveTo(-44, -16); g.quadraticCurveTo(0, 0, 44, -14); g.stroke();
        g.strokeStyle = '#8a8478'; g.lineWidth = 2.2;
        g.beginPath(); g.moveTo(-44, -16); g.quadraticCurveTo(0, 0, 44, -14); g.stroke();
        g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(-44, -17); g.quadraticCurveTo(0, -1.4, 44, -15); g.stroke();
        rr(g, -8, -17, 16, 13, 3);
        g.fillStyle = vgrad(g, -17, -4, '#e0b84a', '#a87c1e');
        g.fill(); outline(g, 2.2);
        g.beginPath(); g.arc(0, -17, 5, Math.PI, 0);
        g.strokeStyle = '#8a6a1a'; g.lineWidth = 2.8; g.stroke();
        ell(g, 0, -11.4, 2, 2.8); g.fillStyle = '#4a3a10'; g.fill();
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
    gr.addColorStop(0, U.shade(sp.c1, 0.3)); gr.addColorStop(0.6, sp.c1); gr.addColorStop(1, sp.c2);
    g.beginPath();
    g.moveTo(-rx, 0);
    g.bezierCurveTo(-rx * 1.15, -ry * 1.5, -rx * 0.5, -ry * 2.05, 0, -ry * 2.05);
    g.bezierCurveTo(rx * 0.5, -ry * 2.05, rx * 1.15, -ry * 1.5, rx, 0);
    g.quadraticCurveTo(rx * 0.5, ry * 0.12, 0, ry * 0.1);
    g.quadraticCurveTo(-rx * 0.5, ry * 0.12, -rx, 0);
    g.closePath();
    g.fillStyle = gr; g.fill(); outline(g, 2.4);
    // Innerer Kern
    ell(g, rx * 0.05, -ry * 0.8, rx * 0.34, ry * 0.4);
    g.fillStyle = U.shade(sp.c2, -0.12); g.globalAlpha = 0.5; g.fill(); g.globalAlpha = 1;
    // Glanzlichter
    ell(g, -rx * 0.42, -ry * 1.5, rx * 0.26, ry * 0.36);
    g.fillStyle = 'rgba(255,255,255,0.6)'; g.fill();
    ell(g, -rx * 0.15, -ry * 1.78, rx * 0.1, ry * 0.1);
    g.fillStyle = 'rgba(255,255,255,0.5)'; g.fill();
    ell(g, rx * 0.35, -ry * 0.6, rx * 0.14, rx * 0.14);
    g.fillStyle = 'rgba(255,255,255,0.28)'; g.fill();
    eyes(g, s * 0.25, -ry * 1.1, s * 0.19);
    g.beginPath(); g.arc(s * 0.3, -ry * 0.72, s * 0.22, 0.15, Math.PI - 0.3);
    g.strokeStyle = 'rgba(20,40,25,0.7)'; g.lineWidth = 2; g.stroke();
    ell(g, -rx * 0.9, -1.5, 2.6, 3.2); g.fillStyle = sp.c2; g.fill();
  };

  M.gob = (g, sp, f) => {
    const s = sp.r, sw = f ? 1 : -1;
    limb(g, -3, -s * 0.5, -4 - sw * 2.4, 0, 4.6, sp.c2);
    limb(g, 3, -s * 0.5, 4 + sw * 2.4, 0, 4.6, sp.c2);
    ell(g, 0, -s * 0.85, s * 0.62, s * 0.55);
    g.fillStyle = vgrad(g, -s * 1.4, -s * 0.3, sp.c1, sp.c2); g.fill(); outline(g, 2.2);
    g.beginPath();
    g.moveTo(-s * 0.55, -s * 0.85); g.lineTo(s * 0.55, -s * 0.85);
    g.lineTo(s * 0.4, -s * 0.35); g.lineTo(s * 0.15, -s * 0.5); g.lineTo(-s * 0.1, -s * 0.32); g.lineTo(-s * 0.4, -s * 0.5);
    g.closePath();
    g.fillStyle = '#7a5a34'; g.fill(); outline(g, 1.8);
    limb(g, -s * 0.4, -s * 0.9, -s * 0.75, -s * 0.55 - sw * 2, 4, sp.c1);
    limb(g, s * 0.4, -s * 0.95, s * 0.9, -s * 0.75 + sw * 2, 4, sp.c1);
    if (sp.ranged) {
      ell(g, s * 1.0, -s * 0.75 + sw * 2, 4.5, 4);
      g.fillStyle = '#8a8478'; g.fill(); outline(g, 1.8);
    } else {
      g.save(); g.translate(s * 0.95, -s * 0.75 + sw * 2); g.rotate(-0.5);
      g.fillStyle = '#cfd5de';
      g.beginPath(); g.moveTo(0, 0); g.lineTo(9, -3.6); g.lineTo(0, -6); g.closePath(); g.fill(); outline(g, 1.6);
      g.fillStyle = '#6e4a26'; g.fillRect(-4, -4.4, 4.5, 3.4);
      g.restore();
    }
    const hy = -s * 1.5;
    ell(g, 0, hy, s * 0.6, s * 0.55);
    g.fillStyle = vgrad(g, hy - s * 0.6, hy + s * 0.5, U.shade(sp.c1, 0.15), sp.c1); g.fill(); outline(g, 2.2);
    for (const sd of [-1, 1]) {
      g.beginPath();
      g.moveTo(sd * s * 0.5, hy - 2);
      g.quadraticCurveTo(sd * s * 1.15, hy - s * 0.5, sd * s * 1.2, hy - 1);
      g.quadraticCurveTo(sd * s * 0.9, hy + 2, sd * s * 0.45, hy + 3);
      g.closePath();
      g.fillStyle = sp.c1; g.fill(); outline(g, 1.8);
    }
    eyes(g, s * 0.18, hy - 2, s * 0.16, 1, '#a02328');
    g.beginPath(); g.arc(s * 0.16, hy + s * 0.22, s * 0.26, 0.2, Math.PI - 0.5);
    g.strokeStyle = 'rgba(30,20,15,0.75)'; g.lineWidth = 1.8; g.stroke();
    g.fillStyle = '#fff';
    g.beginPath(); g.moveTo(s * 0.3, hy + s * 0.32); g.lineTo(s * 0.38, hy + s * 0.52); g.lineTo(s * 0.46, hy + s * 0.3); g.closePath(); g.fill();
    if (sp.ranged) {
      g.strokeStyle = '#a02328'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(-s * 0.55, hy - s * 0.26); g.lineTo(s * 0.55, hy - s * 0.3); g.stroke();
    }
  };

  M.skel = (g, sp, f) => {
    const s = sp.r, sw = f ? 1 : -1;
    const bone = sp.c1, boneD = sp.c2;
    limb(g, -3, -s * 0.55, -3 - sw * 2.6, 0, 3.4, bone);
    limb(g, 3, -s * 0.55, 3 + sw * 2.6, 0, 3.4, bone);
    ell(g, 0, -s * 0.6, s * 0.34, s * 0.2); g.fillStyle = bone; g.fill(); outline(g, 1.8);
    limb(g, 0, -s * 0.6, 0, -s * 1.42, 3.2, bone);
    g.strokeStyle = bone; g.lineWidth = 2.6;
    for (let i = 0; i < 3; i++) {
      const y = -s * (0.85 + i * 0.22);
      g.beginPath(); g.arc(0, y, s * (0.4 - i * 0.05), Math.PI * 0.15, Math.PI * 0.85); g.stroke();
      g.beginPath(); g.arc(0, y - 2, s * (0.4 - i * 0.05), Math.PI * 1.15, Math.PI * 1.85); g.stroke();
    }
    limb(g, -s * 0.3, -s * 1.3, -s * 0.62, -s * 0.85 - sw * 2, 3, boneD);
    limb(g, s * 0.3, -s * 1.3, s * 0.72, -s * 0.95 + sw * 2, 3, bone);
    if (sp.ranged) {
      g.strokeStyle = '#6e4a26'; g.lineWidth = 2.8;
      g.beginPath(); g.arc(s * 0.8, -s * 0.95 + sw * 2, s * 0.55, -Math.PI * 0.42, Math.PI * 0.42); g.stroke();
      g.strokeStyle = '#ded6c4'; g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(s * 0.8 + Math.cos(-Math.PI * 0.42) * s * 0.55, -s * 0.95 + sw * 2 + Math.sin(-Math.PI * 0.42) * s * 0.55);
      g.lineTo(s * 0.8 + Math.cos(Math.PI * 0.42) * s * 0.55, -s * 0.95 + sw * 2 + Math.sin(Math.PI * 0.42) * s * 0.55);
      g.stroke();
    } else {
      g.save(); g.translate(s * 0.75, -s * 0.95 + sw * 2); g.rotate(-0.9);
      g.fillStyle = '#9a8f7a';
      g.beginPath(); g.moveTo(0, -1.8); g.lineTo(s * 0.95, -3.4); g.lineTo(s * 1.05, -2.2); g.lineTo(s * 0.95, -1); g.lineTo(0, 1.4); g.closePath();
      g.fill(); outline(g, 1.6);
      g.strokeStyle = '#5a4632'; g.lineWidth = 2.6;
      g.beginPath(); g.moveTo(1, -5); g.lineTo(1, 4); g.stroke();
      g.restore();
    }
    const hy = -s * 1.75;
    ell(g, 0, hy, s * 0.48, s * 0.44);
    g.fillStyle = vgrad(g, hy - s * 0.5, hy + s * 0.4, '#f7f2e6', bone); g.fill(); outline(g, 2.2);
    rr(g, -s * 0.26, hy + s * 0.24, s * 0.52, s * 0.26, 2);
    g.fillStyle = bone; g.fill(); outline(g, 1.8);
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
    limb(g, -s * 0.3, -s * 0.5, -s * 0.32 - sw * 3, 0, 7, sp.c2);
    limb(g, s * 0.3, -s * 0.5, s * 0.32 + sw * 3, 0, 7, sp.c2);
    g.beginPath();
    g.moveTo(-s * 0.72, -s * 0.4);
    g.quadraticCurveTo(-s * 0.85, -s * 1.35, -s * 0.3, -s * 1.5);
    g.lineTo(s * 0.35, -s * 1.5);
    g.quadraticCurveTo(s * 0.8, -s * 1.3, s * 0.66, -s * 0.4);
    g.quadraticCurveTo(0, -s * 0.22, -s * 0.72, -s * 0.4);
    g.closePath();
    g.fillStyle = vgrad(g, -s * 1.55, -s * 0.3, U.shade(sp.c1, 0.12), sp.c2); g.fill(); outline(g, 2.6);
    ell(g, 0, -s * 0.62, s * 0.34, s * 0.26);
    g.fillStyle = U.shade(sp.c1, 0.25); g.fill();
    g.fillStyle = '#5a4028'; g.fillRect(-s * 0.62, -s * 0.48, s * 1.26, s * 0.16);
    g.fillStyle = '#c9a13a'; g.fillRect(-s * 0.1, -s * 0.5, s * 0.2, s * 0.2);
    ell(g, -s * 0.55, -s * 1.4, s * 0.34, s * 0.24);
    g.fillStyle = vgrad(g, -s * 1.65, -s * 1.15, '#8a8f9a', '#4c5568'); g.fill(); outline(g, 2.2);
    g.fillStyle = '#c9ccd4'; ell(g, -s * 0.62, -s * 1.46, s * 0.07, s * 0.07); g.fill();
    limb(g, -s * 0.55, -s * 1.25, -s * 0.8, -s * 0.6 - sw * 2, 6.4, sp.c1);
    limb(g, s * 0.5, -s * 1.3, s * 0.95, -s * 0.85 + sw * 2, 6.4, sp.c1);
    g.save(); g.translate(s * 1.0, -s * 0.85 + sw * 2); g.rotate(-0.35);
    g.strokeStyle = '#6e4a26'; g.lineWidth = 3.4;
    g.beginPath(); g.moveTo(0, 6); g.lineTo(0, -s * 0.95); g.stroke();
    g.fillStyle = vgrad(g, -s * 1.3, -s * 0.5, '#d3d6de', '#7d7e8a');
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
    const hy = -s * 1.72;
    ell(g, s * 0.05, hy, s * 0.42, s * 0.38);
    g.fillStyle = vgrad(g, hy - s * 0.4, hy + s * 0.35, U.shade(sp.c1, 0.2), sp.c1); g.fill(); outline(g, 2.2);
    eyes(g, s * 0.2, hy - 2, s * 0.11, 1, sp.rage ? '#ff4a4a' : '#3a2a18');
    rr(g, -s * 0.24, hy + s * 0.14, s * 0.6, s * 0.2, 3);
    g.fillStyle = U.shade(sp.c1, -0.12); g.fill(); outline(g, 1.8);
    g.fillStyle = '#fff';
    g.beginPath(); g.moveTo(-s * 0.14, hy + s * 0.18); g.lineTo(-s * 0.08, hy - s * 0.02); g.lineTo(0, hy + s * 0.18); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(s * 0.22, hy + s * 0.18); g.lineTo(s * 0.28, hy - s * 0.02); g.lineTo(s * 0.36, hy + s * 0.18); g.closePath(); g.fill();
    if (sp.rage) {
      g.strokeStyle = '#e5484d'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(-s * 0.1, hy - s * 0.28); g.lineTo(s * 0.05, hy - s * 0.1); g.stroke();
    }
  };

  M.wolf = (g, sp, f) => {
    const s = sp.r, sw = f ? 1 : -1;
    limb(g, -s * 0.55, -s * 0.55, -s * 0.62 - sw * 3, 0, 4.6, sp.c2);
    limb(g, s * 0.5, -s * 0.55, s * 0.56 + sw * 3, 0, 4.6, sp.c2);
    limb(g, -s * 0.35, -s * 0.55, -s * 0.4 + sw * 3, 0, 4.6, sp.c1);
    limb(g, s * 0.7, -s * 0.55, s * 0.76 - sw * 3, 0, 4.6, sp.c1);
    g.beginPath();
    g.moveTo(-s * 0.95, -s * 0.62);
    g.quadraticCurveTo(-s * 0.6, -s * 1.15, 0, -s * 1.1);
    g.quadraticCurveTo(s * 0.65, -s * 1.18, s * 0.95, -s * 0.75);
    g.quadraticCurveTo(s * 1.0, -s * 0.4, s * 0.6, -s * 0.38);
    g.quadraticCurveTo(0, -s * 0.3, -s * 0.85, -s * 0.42);
    g.closePath();
    g.fillStyle = vgrad(g, -s * 1.2, -s * 0.3, U.shade(sp.c1, 0.12), sp.c2); g.fill(); outline(g, 2.4);
    g.beginPath();
    g.moveTo(-s * 0.9, -s * 0.75);
    g.quadraticCurveTo(-s * 1.5, -s * 1.25, -s * 1.35, -s * 1.5 - sw * 1.5);
    g.quadraticCurveTo(-s * 1.15, -s * 1.1, -s * 0.8, -s * 0.95);
    g.closePath();
    g.fillStyle = sp.c2; g.fill(); outline(g, 2);
    const hx = s * 0.95, hy = -s * 0.95;
    ell(g, hx, hy, s * 0.42, s * 0.36);
    g.fillStyle = vgrad(g, hy - s * 0.4, hy + s * 0.3, U.shade(sp.c1, 0.15), sp.c1); g.fill(); outline(g, 2.2);
    g.beginPath();
    g.moveTo(hx + s * 0.25, hy - s * 0.06);
    g.lineTo(hx + s * 0.72, hy + s * 0.08);
    g.lineTo(hx + s * 0.25, hy + s * 0.26);
    g.closePath();
    g.fillStyle = sp.c1; g.fill(); outline(g, 2);
    ell(g, hx + s * 0.68, hy + s * 0.07, 2.4, 2.2); g.fillStyle = '#16181e'; g.fill();
    g.fillStyle = '#fff';
    g.beginPath(); g.moveTo(hx + s * 0.4, hy + s * 0.18); g.lineTo(hx + s * 0.45, hy + s * 0.32); g.lineTo(hx + s * 0.52, hy + s * 0.16); g.closePath(); g.fill();
    for (const d of [-0.12, 0.2]) {
      g.beginPath();
      g.moveTo(hx - s * 0.25 + d * s, hy - s * 0.25);
      g.lineTo(hx - s * 0.1 + d * s, hy - s * 0.72);
      g.lineTo(hx + s * 0.1 + d * s, hy - s * 0.3);
      g.closePath();
      g.fillStyle = sp.c2; g.fill(); outline(g, 1.8);
    }
    ell(g, hx + s * 0.1, hy - s * 0.05, s * 0.09, s * 0.1);
    g.fillStyle = sp.name && sp.name.includes('Alpha') ? '#ff4a4a' : '#ffd34e'; g.fill();
    ell(g, hx + s * 0.12, hy - s * 0.05, s * 0.035, s * 0.05); g.fillStyle = '#16181e'; g.fill();
    g.fillStyle = sp.c2;
    for (let i = 0; i < 3; i++) {
      const x = -s * 0.45 + i * s * 0.38;
      g.beginPath(); g.moveTo(x, -s * 1.05); g.lineTo(x + s * 0.12, -s * 1.32); g.lineTo(x + s * 0.26, -s * 1.02); g.closePath(); g.fill();
    }
  };

  M.spider = (g, sp, f) => {
    const s = sp.r;
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
    ell(g, -s * 0.55, -s * 0.85, s * 0.72, s * 0.6);
    g.fillStyle = vgrad(g, -s * 1.45, -s * 0.3, U.shade(sp.c1, 0.1), sp.c2); g.fill(); outline(g, 2.4);
    ell(g, -s * 0.75, -s * 1.05, s * 0.24, s * 0.16);
    g.fillStyle = 'rgba(255,255,255,0.22)'; g.fill();
    g.fillStyle = sp.venom ? '#b6e05a' : '#d8c8e8';
    g.beginPath();
    g.moveTo(-s * 0.55, -s * 1.25);
    g.lineTo(-s * 0.35, -s * 0.95); g.lineTo(-s * 0.55, -s * 0.75); g.lineTo(-s * 0.75, -s * 0.95);
    g.closePath(); g.fill(); outline(g, 1.6);
    ell(g, s * 0.42, -s * 0.68, s * 0.42, s * 0.38);
    g.fillStyle = vgrad(g, -s * 1.05, -s * 0.3, sp.c1, sp.c2); g.fill(); outline(g, 2.2);
    for (let i = 0; i < 4; i++) {
      const ex = s * (0.3 + (i % 2) * 0.24), ey = -s * (0.78 - Math.floor(i / 2) * 0.16);
      ell(g, ex, ey, s * (i < 2 ? 0.09 : 0.06), s * (i < 2 ? 0.1 : 0.07));
      g.fillStyle = '#ff3a3a'; g.fill();
      ell(g, ex - 1, ey - 1, s * 0.025, s * 0.025); g.fillStyle = '#ffb4b4'; g.fill();
    }
    g.strokeStyle = sp.c2; g.lineWidth = 2.6;
    g.beginPath(); g.moveTo(s * 0.75, -s * 0.55); g.quadraticCurveTo(s * 0.95, -s * 0.45, s * 0.85, -s * 0.28); g.stroke();
    g.beginPath(); g.moveTo(s * 0.8, -s * 0.62); g.quadraticCurveTo(s * 1.05, -s * 0.5, s * 0.98, -s * 0.34); g.stroke();
    if (sp.venom) {
      ell(g, -s * 0.55, -s * 0.5, s * 0.2, s * 0.15);
      g.fillStyle = 'rgba(182,224,90,0.8)'; g.fill();
    }
  };

  M.troll = (g, sp, f) => {
    const s = sp.r, sw = f ? 1 : -1;
    limb(g, -s * 0.35, -s * 0.35, -s * 0.4 - sw * 2, 0, 9, sp.c2);
    limb(g, s * 0.35, -s * 0.35, s * 0.4 + sw * 2, 0, 9, sp.c2);
    g.beginPath();
    g.moveTo(-s * 0.8, -s * 0.3);
    g.bezierCurveTo(-s * 1.05, -s * 1.1, -s * 0.55, -s * 1.62, 0, -s * 1.62);
    g.bezierCurveTo(s * 0.55, -s * 1.62, s * 1.0, -s * 1.05, s * 0.78, -s * 0.3);
    g.quadraticCurveTo(0, -s * 0.05, -s * 0.8, -s * 0.3);
    g.closePath();
    g.fillStyle = vgrad(g, -s * 1.65, -s * 0.1, U.shade(sp.c1, 0.1), sp.c2); g.fill(); outline(g, 2.8);
    ell(g, 0, -s * 0.55, s * 0.42, s * 0.32);
    g.fillStyle = U.shade(sp.c1, 0.28); g.fill();
    g.fillStyle = '#7a5a34';
    g.beginPath();
    g.moveTo(-s * 0.5, -s * 0.4); g.lineTo(s * 0.5, -s * 0.4); g.lineTo(s * 0.35, -s * 0.1); g.lineTo(0, -s * 0.22); g.lineTo(-s * 0.35, -s * 0.08);
    g.closePath(); g.fill(); outline(g, 2);
    g.fillStyle = U.shade(sp.c1, -0.18);
    ell(g, -s * 0.5, -s * 1.2, 2.6, 2.6); g.fill();
    ell(g, s * 0.42, -s * 0.9, 2.2, 2.2); g.fill();
    limb(g, -s * 0.6, -s * 1.25, -s * 1.0, -s * 0.35 - sw * 2.5, 8, sp.c1);
    limb(g, s * 0.6, -s * 1.3, s * 1.05, -s * 0.5 + sw * 2.5, 8, sp.c1);
    if (sp.ranged) {
      ell(g, s * 1.15, -s * 0.55 + sw * 2.5, s * 0.32, s * 0.28);
      g.fillStyle = vgrad(g, -s * 0.85, -s * 0.25, '#aca69e', '#6a655c'); g.fill(); outline(g, 2.2);
    } else {
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
    const hy = -s * 1.78;
    ell(g, 0, hy, s * 0.36, s * 0.3);
    g.fillStyle = sp.c1; g.fill(); outline(g, 2.4);
    eyes(g, s * 0.12, hy - 1, s * 0.08, 1, '#2a1e14');
    ell(g, s * 0.16, hy + s * 0.1, s * 0.13, s * 0.1);
    g.fillStyle = U.shade(sp.c1, -0.1); g.fill(); outline(g, 1.6);
    rr(g, -s * 0.2, hy + s * 0.14, s * 0.46, s * 0.14, 2);
    g.fillStyle = U.shade(sp.c1, -0.15); g.fill();
    g.fillStyle = '#fff';
    g.beginPath(); g.moveTo(-s * 0.1, hy + s * 0.16); g.lineTo(-s * 0.05, hy + s * 0.02); g.lineTo(0, hy + s * 0.16); g.closePath(); g.fill();
  };

  M.golem = (g, sp, f) => {
    const s = sp.r, sw = f ? 1.5 : -1.5;
    const rock = (x, y, rx, ry, light) => {
      g.beginPath();
      const n = 9;
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * TAU;
        const rad = 1 + Math.sin(a * 3 + x) * 0.1;
        const px = x + Math.cos(a) * rx * rad, py = y + Math.sin(a) * ry * rad;
        i ? g.lineTo(px, py) : g.moveTo(px, py);
      }
      g.closePath();
      g.fillStyle = vgrad(g, y - ry, y + ry, U.shade(sp.c1, light + 0.08), sp.c2);
      g.fill();
      texOver(g, 'stone', x - rx, y - ry, rx * 2, ry * 2, 1);
      g.beginPath();
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * TAU;
        const rad = 1 + Math.sin(a * 3 + x) * 0.1;
        const px = x + Math.cos(a) * rx * rad, py = y + Math.sin(a) * ry * rad;
        i ? g.lineTo(px, py) : g.moveTo(px, py);
      }
      g.closePath();
      outline(g, 2.6);
    };
    rock(-s * 0.85, -s * 0.75 - sw, s * 0.3, s * 0.42, 0.0);
    rock(s * 0.85, -s * 0.75 + sw, s * 0.3, s * 0.42, 0.0);
    rock(0, -s * 0.85, s * 0.72, s * 0.72, 0.12);
    const core = sp.core || '#7fd8ff';
    const cg = g.createRadialGradient(0, -s * 0.8, 1, 0, -s * 0.8, s * 0.4);
    cg.addColorStop(0, '#ffffff'); cg.addColorStop(0.4, core); cg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = cg; ell(g, 0, -s * 0.8, s * 0.4, s * 0.4); g.fill();
    ell(g, 0, -s * 0.8, s * 0.17, s * 0.17);
    g.fillStyle = core; g.fill(); outline(g, 2);
    g.strokeStyle = sp.core === '#ff9d2e' ? 'rgba(255,140,40,0.8)' : 'rgba(30,30,40,0.5)';
    g.lineWidth = 1.8;
    g.beginPath(); g.moveTo(-s * 0.3, -s * 1.2); g.lineTo(-s * 0.15, -s * 1.0); g.lineTo(-s * 0.3, -s * 0.8); g.stroke();
    g.beginPath(); g.moveTo(s * 0.35, -s * 0.65); g.lineTo(s * 0.5, -s * 0.5); g.stroke();
    rock(s * 0.1, -s * 1.72, s * 0.34, s * 0.26, 0.2);
    for (const sd of [-1, 1]) {
      ell(g, s * 0.1 + sd * s * 0.14, -s * 1.74, s * 0.06, s * 0.07);
      g.fillStyle = core; g.fill();
    }
    if (!sp.core || sp.core === '#7fd8ff') {
      g.fillStyle = 'rgba(110,160,80,0.75)';
      ell(g, -s * 0.45, -s * 1.35, s * 0.2, s * 0.09); g.fill();
      ell(g, s * 0.5, -s * 1.1, s * 0.14, s * 0.07); g.fill();
    }
  };

  M.cult = (g, sp, f) => {
    const s = sp.r, sw = f ? 1 : -1;
    g.beginPath();
    g.moveTo(-s * 0.62, 0);
    g.quadraticCurveTo(-s * 0.55, -s * 1.2, -s * 0.25, -s * 1.62);
    g.quadraticCurveTo(0, -s * 1.8, s * 0.25, -s * 1.62);
    g.quadraticCurveTo(s * 0.55, -s * 1.2, s * 0.62, 0);
    g.quadraticCurveTo(s * 0.3, s * 0.06 + sw, 0, 0);
    g.quadraticCurveTo(-s * 0.3, s * 0.06 - sw, -s * 0.62, 0);
    g.closePath();
    g.fillStyle = vgrad(g, -s * 1.8, 0, U.shade(sp.c1, 0.08), sp.c2); g.fill(); outline(g, 2.4);
    g.strokeStyle = 'rgba(20,10,30,0.4)'; g.lineWidth = 1.8;
    g.beginPath(); g.moveTo(-s * 0.2, -s * 1.0); g.quadraticCurveTo(-s * 0.25, -s * 0.5, -s * 0.18, 0); g.stroke();
    g.beginPath(); g.moveTo(s * 0.2, -s * 1.0); g.quadraticCurveTo(s * 0.28, -s * 0.5, s * 0.22, 0); g.stroke();
    ell(g, 0, -s * 1.45, s * 0.34, s * 0.3);
    g.fillStyle = '#0e0a14'; g.fill();
    g.strokeStyle = U.shade(sp.c1, 0.2); g.lineWidth = 2.2;
    g.beginPath(); g.arc(0, -s * 1.45, s * 0.36, Math.PI * 0.85, Math.PI * 2.15); g.stroke();
    for (const sd of [-1, 1]) {
      ell(g, sd * s * 0.12, -s * 1.45, s * 0.05, s * 0.07);
      g.fillStyle = '#c9a8ff'; g.fill();
    }
    g.strokeStyle = '#c9a13a'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(-s * 0.4, -s * 0.75); g.quadraticCurveTo(0, -s * 0.62, s * 0.4, -s * 0.75); g.stroke();
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
    for (const sd of [-1, 1]) {
      g.beginPath();
      g.moveTo(sd * s * 0.3, -s * 1.25);
      g.quadraticCurveTo(sd * s * 1.2, -s * 1.7 - sw * 3, sd * s * 1.25, -s * 1.0 - sw * 3);
      g.quadraticCurveTo(sd * s * 0.85, -s * 1.05, sd * s * 0.7, -s * 0.8);
      g.quadraticCurveTo(sd * s * 0.5, -s * 0.95, sd * s * 0.3, -s * 0.85);
      g.closePath();
      g.fillStyle = vgrad(g, -s * 1.7, -s * 0.8, U.shade(sp.c2, 0.05), '#2a1214'); g.fill(); outline(g, 2);
    }
    limb(g, -3, -s * 0.5, -4 - sw * 2, 0, 4, sp.c2);
    limb(g, 3, -s * 0.5, 4 + sw * 2, 0, 4, sp.c2);
    ell(g, 0, -s * 0.85, s * 0.55, s * 0.5);
    g.fillStyle = vgrad(g, -s * 1.35, -s * 0.35, U.shade(sp.c1, 0.15), sp.c2); g.fill(); outline(g, 2.2);
    g.strokeStyle = sp.c2; g.lineWidth = 3;
    g.beginPath();
    g.moveTo(-s * 0.45, -s * 0.6);
    g.quadraticCurveTo(-s * 1.1, -s * 0.55, -s * 1.15, -s * 1.05 - sw * 2);
    g.stroke();
    g.fillStyle = sp.c2;
    g.beginPath();
    g.moveTo(-s * 1.28, -s * 1.12 - sw * 2); g.lineTo(-s * 1.0, -s * 1.12 - sw * 2); g.lineTo(-s * 1.15, -s * 0.88 - sw * 2);
    g.closePath(); g.fill();
    limb(g, -s * 0.35, -s * 0.95, -s * 0.65, -s * 0.6, 3.4, sp.c1);
    limb(g, s * 0.35, -s * 0.95, s * 0.7, -s * 0.65, 3.4, sp.c1);
    const hy = -s * 1.5;
    ell(g, 0, hy, s * 0.5, s * 0.44);
    g.fillStyle = vgrad(g, hy - s * 0.45, hy + s * 0.4, U.shade(sp.c1, 0.18), sp.c1); g.fill(); outline(g, 2.2);
    for (const sd of [-1, 1]) {
      g.beginPath();
      g.moveTo(sd * s * 0.28, hy - s * 0.3);
      g.quadraticCurveTo(sd * s * 0.5, hy - s * 0.75, sd * s * 0.3, hy - s * 0.85);
      g.quadraticCurveTo(sd * s * 0.32, hy - s * 0.55, sd * s * 0.12, hy - s * 0.38);
      g.closePath();
      g.fillStyle = '#f0e4d0'; g.fill(); outline(g, 1.8);
    }
    eyes(g, s * 0.16, hy - 1, s * 0.13, 1, '#ffd34e');
    g.beginPath(); g.arc(s * 0.1, hy + s * 0.2, s * 0.22, 0.2, Math.PI - 0.4);
    g.strokeStyle = 'rgba(30,10,10,0.8)'; g.lineWidth = 1.8; g.stroke();
  };

  M.gargoyle = (g, sp, f) => {
    M.imp(g, sp, f);
    const s = sp.r;
    g.strokeStyle = 'rgba(30,30,40,0.55)'; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(-s * 0.2, -s * 1.0); g.lineTo(-s * 0.05, -s * 0.8); g.stroke();
    g.beginPath(); g.moveTo(s * 0.15, -s * 1.6); g.lineTo(s * 0.28, -s * 1.45); g.stroke();
  };

  M.demon = (g, sp, f) => {
    const s = sp.r, sw = f ? 1 : -1;
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
    limb(g, -s * 0.28, -s * 0.45, -s * 0.32 - sw * 2.4, 0, 6.4, sp.c2);
    limb(g, s * 0.28, -s * 0.45, s * 0.32 + sw * 2.4, 0, 6.4, sp.c2);
    g.beginPath();
    g.moveTo(-s * 0.6, -s * 0.35);
    g.quadraticCurveTo(-s * 0.78, -s * 1.3, -s * 0.35, -s * 1.55);
    g.lineTo(s * 0.35, -s * 1.55);
    g.quadraticCurveTo(s * 0.78, -s * 1.3, s * 0.6, -s * 0.35);
    g.quadraticCurveTo(0, -s * 0.15, -s * 0.6, -s * 0.35);
    g.closePath();
    g.fillStyle = vgrad(g, -s * 1.6, -s * 0.2, U.shade(sp.c1, 0.12), sp.c2); g.fill(); outline(g, 2.6);
    g.strokeStyle = 'rgba(30,8,12,0.5)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, -s * 1.45); g.lineTo(0, -s * 0.95); g.stroke();
    g.beginPath(); g.arc(-s * 0.2, -s * 1.1, s * 0.18, 0, Math.PI * 0.7); g.stroke();
    g.beginPath(); g.arc(s * 0.2, -s * 1.1, s * 0.18, Math.PI * 0.3, Math.PI); g.stroke();
    g.strokeStyle = '#ff7a2e'; g.lineWidth = 1.8;
    g.beginPath(); g.moveTo(-s * 0.35, -s * 0.8); g.lineTo(-s * 0.22, -s * 0.62); g.stroke();
    limb(g, -s * 0.5, -s * 1.3, -s * 0.85, -s * 0.6 - sw * 2.5, 5.6, sp.c1);
    limb(g, s * 0.5, -s * 1.3, s * 0.85, -s * 0.6 + sw * 2.5, 5.6, sp.c1);
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
    g.beginPath();
    g.moveTo(-s * 0.1, -s * 1.15);
    g.quadraticCurveTo(-s * 0.6, -s * 2.1 - sw * 6, -s * 1.5, -s * 1.7 - sw * 8);
    g.quadraticCurveTo(-s * 0.95, -s * 1.35 - sw * 2, -s * 0.55, -s * 1.0);
    g.closePath();
    g.fillStyle = vgrad(g, -s * 2.2, -s * 0.9, U.shade(sp.c2, 0.1), sp.c2); g.fill(); outline(g, 2.2);
    g.strokeStyle = 'rgba(20,20,20,0.35)'; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(-s * 0.25, -s * 1.2); g.lineTo(-s * 1.1, -s * 1.6 - sw * 7); g.stroke();
    g.strokeStyle = sp.c1; g.lineWidth = s * 0.3;
    g.beginPath();
    g.moveTo(-s * 0.7, -s * 0.75);
    g.quadraticCurveTo(-s * 1.4, -s * 0.65, -s * 1.7, -s * 1.05 + sw * 2);
    g.stroke();
    g.fillStyle = sp.c2;
    g.beginPath();
    g.moveTo(-s * 1.85, -s * 1.2 + sw * 2); g.lineTo(-s * 1.5, -s * 1.15 + sw * 2); g.lineTo(-s * 1.7, -s * 0.82 + sw * 2);
    g.closePath(); g.fill(); outline(g, 1.8);
    ell(g, 0, -s * 0.85, s * 0.8, s * 0.55);
    g.fillStyle = vgrad(g, -s * 1.4, -s * 0.3, U.shade(sp.c1, 0.12), sp.c2); g.fill(); outline(g, 2.6);
    g.fillStyle = belly;
    ell(g, s * 0.1, -s * 0.55, s * 0.55, s * 0.26); g.fill();
    g.strokeStyle = 'rgba(30,20,15,0.35)'; g.lineWidth = 1.4;
    for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(s * 0.1 + i * s * 0.22 - s * 0.14, -s * 0.62); g.quadraticCurveTo(s * 0.1 + i * s * 0.22, -s * 0.42, s * 0.1 + i * s * 0.22 + s * 0.14, -s * 0.62); g.stroke(); }
    limb(g, -s * 0.3, -s * 0.55, -s * 0.35, -s * 0.2, 4.6, sp.c2);
    limb(g, s * 0.35, -s * 0.55, s * 0.42, -s * 0.2, 4.6, sp.c2);
    g.strokeStyle = sp.c1; g.lineWidth = s * 0.34;
    g.beginPath();
    g.moveTo(s * 0.55, -s * 0.95);
    g.quadraticCurveTo(s * 0.95, -s * 1.25, s * 1.05, -s * 1.5);
    g.stroke();
    ell(g, s * 1.1, -s * 1.6, s * 0.36, s * 0.3);
    g.fillStyle = vgrad(g, -s * 1.9, -s * 1.3, U.shade(sp.c1, 0.15), sp.c1); g.fill(); outline(g, 2.2);
    rr(g, s * 1.25, -s * 1.68, s * 0.42, s * 0.24, s * 0.1);
    g.fillStyle = sp.c1; g.fill(); outline(g, 2);
    ell(g, s * 1.58, -s * 1.62, 1.8, 1.6); g.fillStyle = '#16181e'; g.fill();
    for (const d of [-0.05, 0.14]) {
      g.beginPath();
      g.moveTo(s * (0.95 + d), -s * 1.78);
      g.lineTo(s * (0.85 + d), -s * 2.05);
      g.lineTo(s * (1.05 + d), -s * 1.82);
      g.closePath();
      g.fillStyle = '#f0e4d0'; g.fill(); outline(g, 1.6);
    }
    ell(g, s * 1.12, -s * 1.66, s * 0.08, s * 0.09);
    g.fillStyle = '#ffd34e'; g.fill();
    ell(g, s * 1.14, -s * 1.66, s * 0.03, s * 0.05);
    g.fillStyle = '#16181e'; g.fill();
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
  //  SPIELER (König) — größer & detailreicher
  // ============================================================

  function paintKing(g, f) {
    g.scale(1.18, 1.18);
    const sw = f === 0 ? 0 : (f === 1 ? 1 : -1);
    // Beine mit Stiefeln
    limb(g, -3.4, -7, -3.4 - sw * 3, 0, 5, '#4a3120');
    limb(g, 3.4, -7, 3.4 + sw * 3, 0, 5, '#5e3f28');
    g.fillStyle = '#33231a';
    ell(g, -3.4 - sw * 3, -0.4, 3.2, 2); g.fill();
    ell(g, 3.4 + sw * 3, -0.4, 3.2, 2); g.fill();
    // Cape (zweilagig, mit Goldsaum)
    g.beginPath();
    g.moveTo(-7, -24);
    g.quadraticCurveTo(-15 - sw * 1.5, -14, -12 - sw * 3, -1 + Math.abs(sw));
    g.quadraticCurveTo(-4, -4, -2, -8);
    g.lineTo(-2, -22);
    g.closePath();
    g.fillStyle = vgrad(g, -24, 0, '#d64545', '#7e1a26'); g.fill(); outline(g, 2.2);
    g.strokeStyle = '#f2d24a'; g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(-11.6 - sw * 3, -1.6 + Math.abs(sw));
    g.quadraticCurveTo(-5, -4.4, -2.4, -8.4);
    g.stroke();
    g.strokeStyle = 'rgba(60,10,16,0.6)'; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(-6, -21); g.quadraticCurveTo(-9 - sw, -13, -8 - sw * 2, -4); g.stroke();
    // Körper (Tunika + Rüstung)
    rr(g, -7.5, -25, 15, 19, 6);
    g.fillStyle = vgrad(g, -25, -6, '#5279b8', '#28406c'); g.fill(); outline(g, 2.4);
    // Brustplatte mit Glanz
    ell(g, 0, -19, 5.8, 5.2);
    g.fillStyle = vgrad(g, -24.5, -14, '#e6ecf5', '#8a94a8'); g.fill();
    g.strokeStyle = 'rgba(40,45,60,0.55)'; g.lineWidth = 1.4; g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.65)';
    ell(g, -2, -21, 1.8, 1.1); g.fill();
    g.strokeStyle = '#f2d24a'; g.lineWidth = 1.2;
    g.beginPath(); g.arc(0, -19, 4.4, Math.PI * 0.15, Math.PI * 0.85); g.stroke();
    // Schulterplatte links
    ell(g, -6.4, -24, 3.6, 2.6);
    g.fillStyle = vgrad(g, -27, -21, '#d7dde8', '#7d879a'); g.fill(); outline(g, 1.8);
    g.fillStyle = '#f2d24a'; ell(g, -6.4, -24.6, 1, 1); g.fill();
    // Gürtel mit Wappenschnalle
    g.fillStyle = '#4a3120'; g.fillRect(-7.5, -11, 15, 3.6);
    g.fillStyle = vgrad(g, -12, -6.4, '#ffe084', '#c9992e');
    rr(g, -2.6, -11.8, 5.2, 5, 1.4); g.fill();
    g.strokeStyle = '#7a5410'; g.lineWidth = 1.2; g.stroke();
    // Linker Arm
    limb(g, -6, -21, -9.5, -13 - sw * 1.5, 4.4, '#4a6ea8');
    ell(g, -9.5, -12 - sw * 1.5, 2.8, 2.8); g.fillStyle = '#f0c8a0'; g.fill(); outline(g, 1.6);
    // Kopf
    ell(g, 0, -32, 8.5, 8);
    g.fillStyle = vgrad(g, -40, -25, '#ffe3c0', '#eeb987'); g.fill(); outline(g, 2.2);
    // Wangenröte
    g.fillStyle = 'rgba(230,120,90,0.30)';
    ell(g, 5.4, -30, 1.8, 1.1); g.fill();
    // Augen + Brauen
    ell(g, 2.8, -33, 1.2, 1.6); g.fillStyle = '#2c2620'; g.fill();
    ell(g, 6.4, -33, 1.2, 1.6); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.8)';
    ell(g, 2.5, -33.6, 0.4, 0.4); g.fill();
    ell(g, 6.1, -33.6, 0.4, 0.4); g.fill();
    g.strokeStyle = '#6a4322'; g.lineWidth = 1.3;
    g.beginPath(); g.moveTo(1.5, -35.6); g.lineTo(4, -35.9); g.stroke();
    g.beginPath(); g.moveTo(5.2, -35.9); g.lineTo(7.6, -35.5); g.stroke();
    // Lächeln + Bart
    g.strokeStyle = 'rgba(120,70,40,0.75)'; g.lineWidth = 1.3;
    g.beginPath(); g.arc(4.5, -29.5, 2.2, 0.3, Math.PI - 0.5); g.stroke();
    g.fillStyle = '#8a5a2c';
    g.beginPath(); g.arc(0, -33, 8.2, Math.PI * 0.75, Math.PI * 1.6); g.lineTo(-4, -36); g.closePath(); g.fill();
    g.beginPath(); g.arc(0, -28.6, 4.6, Math.PI * 0.15, Math.PI * 0.85); g.lineWidth = 2.2; g.strokeStyle = '#8a5a2c'; g.stroke();
    // Krone mit Juwelen & Glanz
    g.beginPath();
    g.moveTo(-6.5, -38);
    g.lineTo(-6.5, -43.5); g.lineTo(-3.6, -40.5); g.lineTo(0, -44.5); g.lineTo(3.6, -40.5); g.lineTo(6.5, -43.5); g.lineTo(6.5, -38);
    g.closePath();
    g.fillStyle = vgrad(g, -45, -37, '#ffe89a', '#d9930d'); g.fill(); outline(g, 2);
    g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(-5.6, -42.4); g.lineTo(-3.8, -40.6); g.stroke();
    ell(g, 0, -39.5, 1.6, 1.6); g.fillStyle = '#e5484d'; g.fill();
    g.strokeStyle = 'rgba(120,20,25,0.8)'; g.lineWidth = 0.8; g.stroke();
    ell(g, -4.4, -39.2, 1.1, 1.1); g.fillStyle = '#3b6ea5'; g.fill();
    ell(g, 4.4, -39.2, 1.1, 1.1); g.fillStyle = '#3f9e4e'; g.fill();
    ell(g, -0.6, -40.2, 0.5, 0.5); g.fillStyle = '#fff'; g.fill();
  }

  function king(f) {
    return make(`king:${f}`, 76, 76, g => paintKing(g, f), 9);
  }

  // Schwert (zeigt nach oben, Griff am Ursprung)
  function sword(tier) {
    const w = KS.CFG.WEAPONS[tier - 1];
    const L = 24 + tier * 2.6;
    return make(`sword:${tier}`, 34, L + 24, g => {
      g.translate(0, -6);
      if (w.glow) {
        g.save();
        g.shadowColor = w.glow; g.shadowBlur = 10;
        g.fillStyle = w.glow;
        rr(g, -2.4, -L, 4.8, L, 2.2); g.fill();
        g.restore();
      }
      g.beginPath();
      g.moveTo(-2.8, 0);
      g.lineTo(-2.8, -L + 5);
      g.quadraticCurveTo(-2.8, -L, 0, -L - 3.4);
      g.quadraticCurveTo(2.8, -L, 2.8, -L + 5);
      g.lineTo(2.8, 0);
      g.closePath();
      const gr = g.createLinearGradient(-3, 0, 3, 0);
      gr.addColorStop(0, w.blade); gr.addColorStop(0.5, '#ffffff'); gr.addColorStop(1, U.shade(w.blade, -0.3));
      g.fillStyle = gr; g.fill(); outline(g, 1.8);
      g.strokeStyle = 'rgba(60,70,90,0.45)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(0, -3); g.lineTo(0, -L + 6); g.stroke();
      // Parierstange (geschwungen)
      g.beginPath();
      g.moveTo(-8, -0.5);
      g.quadraticCurveTo(0, -4.4, 8, -0.5);
      g.quadraticCurveTo(0, 1.4, -8, -0.5);
      g.closePath();
      g.fillStyle = tier >= 5 ? vgrad(g, -4, 2, '#ffe084', '#c9992e') : vgrad(g, -4, 2, '#a8814e', '#6e4a26');
      g.fill(); outline(g, 1.6);
      rr(g, -1.9, 1.4, 3.8, 8.6, 1.6);
      g.fillStyle = vgrad(g, 1, 10, '#6e4a26', '#3f2a12'); g.fill(); outline(g, 1.4);
      g.strokeStyle = 'rgba(255,220,160,0.4)'; g.lineWidth = 0.8;
      for (const gy of [3.4, 5.4, 7.4]) { g.beginPath(); g.moveTo(-1.6, gy); g.lineTo(1.6, gy); g.stroke(); }
      ell(g, 0, 12, 2.8, 2.8);
      g.fillStyle = tier >= 5 ? '#f2d24a' : '#8a6a3a'; g.fill(); outline(g, 1.4);
      if (tier >= 9) { ell(g, 0, 12, 1.3, 1.3); g.fillStyle = '#e5484d'; g.fill(); }
    }, 15);
  }

  function villager(idx, f) {
    const hues = ['#7a9e5a', '#a8724a', '#5a7a9e', '#9e5a7a', '#8a8a5a', '#5a9e8e'];
    const c = hues[idx % hues.length];
    return make(`vil:${idx % hues.length}:${f}`, 34, 42, g => {
      const sw = f ? 1.6 : -1.6;
      limb(g, -2, -5, -2 - sw, 0, 3.4, '#4a3a28');
      limb(g, 2, -5, 2 + sw, 0, 3.4, '#4a3a28');
      g.beginPath();
      g.moveTo(-5.5, -4);
      g.quadraticCurveTo(-5, -14, 0, -15);
      g.quadraticCurveTo(5, -14, 5.5, -4);
      g.closePath();
      g.fillStyle = vgrad(g, -15, -3, U.shade(c, 0.18), U.shade(c, -0.15)); g.fill(); outline(g, 1.8);
      g.strokeStyle = 'rgba(40,30,20,0.5)'; g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(-4, -8); g.lineTo(4, -8); g.stroke();
      ell(g, 0, -19, 4.6, 4.4);
      g.fillStyle = '#f5d5ae'; g.fill(); outline(g, 1.8);
      ell(g, 1.4, -19.5, 0.7, 0.9); g.fillStyle = '#2c2620'; g.fill();
      ell(g, 3.4, -19.5, 0.7, 0.9); g.fill();
      g.beginPath(); g.arc(0, -20, 4.8, Math.PI * 0.85, Math.PI * 2.12); g.closePath();
      g.fillStyle = U.shade(c, -0.25); g.fill(); outline(g, 1.6);
    }, 6);
  }

  // ============================================================
  //  MÜNZEN & LOOT
  // ============================================================

  function coin(kind) {
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
        g.fillStyle = vgrad(g, -21, 0, '#b8946a', '#6e4f28'); g.fill(); outline(g, 2);
        g.strokeStyle = 'rgba(255,230,180,0.35)'; g.lineWidth = 1.6;
        g.beginPath(); g.moveTo(-7, -6); g.quadraticCurveTo(-8, -12, -4, -16); g.stroke();
        g.strokeStyle = '#f2d24a'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(-3.6, -18); g.lineTo(3.6, -18); g.stroke();
        // Münz-Prägung
        ell(g, 0, -9, 4.4, 4.4);
        g.strokeStyle = 'rgba(255,220,140,0.8)'; g.lineWidth = 1.8; g.stroke();
        drawStar(g, 0, -9, 2.2, 'rgba(255,220,140,0.9)');
      }, 4);
    }
    if (kind === 3) {
      return make('coin:chest', 42, 38, g => {
        rr(g, -14, -14, 28, 14, 3);
        g.fillStyle = vgrad(g, -14, 0, '#a8763e', '#5f3d1c'); g.fill();
        texOver(g, 'wood', -14, -14, 28, 14, 0.9);
        rr(g, -14, -14, 28, 14, 3);
        outline(g, 2.2);
        g.beginPath();
        g.moveTo(-14, -14); g.lineTo(-14, -17); g.arc(0, -17, 14, Math.PI, 0); g.lineTo(14, -14);
        g.closePath();
        g.fillStyle = vgrad(g, -30, -13, '#c08c50', '#74522a'); g.fill(); outline(g, 2.2);
        g.strokeStyle = '#f2d24a'; g.lineWidth = 2.2;
        g.beginPath(); g.moveTo(-14, -13.5); g.lineTo(14, -13.5); g.stroke();
        rr(g, -3, -16, 6, 7, 1.4);
        g.fillStyle = vgrad(g, -16, -9, '#ffe084', '#c9992e'); g.fill(); outline(g, 1.6);
        for (const [cx2, cy2] of [[-6, -28], [1, -31], [7, -27]]) {
          ell(g, cx2, cy2, 3.6, 3.4);
          const cg = g.createRadialGradient(cx2 - 1, cy2 - 1, 0.5, cx2, cy2, 3.6);
          cg.addColorStop(0, '#fff3c0'); cg.addColorStop(0.6, '#ffd34e'); cg.addColorStop(1, '#c9992e');
          g.fillStyle = cg; g.fill(); outline(g, 1.5);
        }
      }, 4);
    }
    const r = kind === 1 ? 10 : 7;
    return make(`coin:${kind}`, r * 3, r * 3.2, g => {
      ell(g, 0, -r, r, r);
      const gr = g.createRadialGradient(-r * 0.35, -r * 1.35, r * 0.15, 0, -r, r * 1.25);
      gr.addColorStop(0, '#fff6cc'); gr.addColorStop(0.45, '#ffd34e'); gr.addColorStop(1, '#cf8c0a');
      g.fillStyle = gr; g.fill();
      g.strokeStyle = '#a86e08'; g.lineWidth = 2; g.stroke();
      // Randkerben
      g.save();
      g.strokeStyle = 'rgba(168,110,8,0.55)'; g.lineWidth = 1.2;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU;
        g.beginPath();
        g.moveTo(Math.cos(a) * (r - 0.8), -r + Math.sin(a) * (r - 0.8));
        g.lineTo(Math.cos(a) * (r - 2.2), -r + Math.sin(a) * (r - 2.2));
        g.stroke();
      }
      g.restore();
      ell(g, 0, -r, r * 0.6, r * 0.6);
      g.strokeStyle = 'rgba(168,110,8,0.7)'; g.lineWidth = 1.3; g.stroke();
      // Krönchen-Prägung
      g.fillStyle = 'rgba(150,96,6,0.85)';
      const s = r * 0.4;
      g.beginPath();
      g.moveTo(-s, -r + s * 0.7);
      g.lineTo(-s, -r - s * 0.3); g.lineTo(-s * 0.4, -r + s * 0.1); g.lineTo(0, -r - s * 0.55);
      g.lineTo(s * 0.4, -r + s * 0.1); g.lineTo(s, -r - s * 0.3); g.lineTo(s, -r + s * 0.7);
      g.closePath(); g.fill();
      // Glanzbogen
      g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 1.4;
      g.beginPath(); g.arc(0, -r, r * 0.72, Math.PI * 1.1, Math.PI * 1.55); g.stroke();
    }, 4);
  }

  // ============================================================
  //  REQUISITEN (Bäume, Felsen, …)
  // ============================================================

  function prop(kind, variant) {
    const key = `prop:${kind}:${variant}`;
    const rnd = U.seededRng(kind.length * 1000 + variant * 77);
    if (kind === 'tree') {
      return make(key, 100, 120, g => {
        aoShadow(g, 30, 11, 0.26);
        // Stamm mit Wurzelansatz & Maserung
        g.beginPath();
        g.moveTo(-6, 0); g.quadraticCurveTo(-4.4, -14, -4, -30);
        g.lineTo(4, -30); g.quadraticCurveTo(4.4, -14, 7, 0);
        g.quadraticCurveTo(0, 2, -6, 0);
        g.closePath();
        g.fillStyle = vgrad(g, -30, 0, '#8a6234', '#54371a'); g.fill();
        texOver(g, 'wood', -8, -30, 16, 32, 1);
        g.beginPath();
        g.moveTo(-6, 0); g.quadraticCurveTo(-4.4, -14, -4, -30);
        g.lineTo(4, -30); g.quadraticCurveTo(4.4, -14, 7, 0);
        g.quadraticCurveTo(0, 2, -6, 0);
        g.closePath();
        outline(g, 2.2);
        const greens = [['#63b04a', '#3c7a2c'], ['#71c054', '#4a8c34'], ['#54a642', '#316a26']][variant % 3];
        const blob = (x, y, r) => {
          ell(g, x, y, r, r * 0.88);
          g.fillStyle = vgrad(g, y - r, y + r, greens[0], greens[1]); g.fill(); outline(g, 2.4);
        };
        blob(-15, -44, 20); blob(16, -48, 22); blob(0, -64, 25);
        // Blätter-Highlights (kleine Kreise oben links)
        g.fillStyle = 'rgba(255,255,220,0.30)';
        for (const [hx, hy, hr] of [[-8, -72, 5], [-16, -66, 4], [2, -76, 4.4], [-22, -50, 3.6], [8, -60, 3]]) {
          ell(g, hx, hy, hr, hr * 0.8); g.fill();
        }
        // Schatten unten im Laub
        g.fillStyle = 'rgba(20,50,20,0.28)';
        ell(g, 2, -42, 20, 8); g.fill();
        if (variant % 3 === 1) {
          g.fillStyle = '#e5484d';
          for (const [fx, fy] of [[-12, -52], [10, -42], [4, -58], [18, -54]]) {
            ell(g, fx, fy, 2, 2); g.fill();
          }
        }
      }, 8);
    }
    if (kind === 'pine') {
      return make(key, 80, 124, g => {
        aoShadow(g, 24, 9, 0.26);
        g.fillStyle = '#6a4a26'; rr(g, -4, -22, 8, 22, 3); g.fill(); outline(g, 2);
        const c1 = variant % 2 ? '#41855a' : '#357560', c2 = variant % 2 ? '#295c3a' : '#1f4a40';
        for (let i = 0; i < 3; i++) {
          const y = -20 - i * 24, w = 35 - i * 8;
          g.beginPath();
          g.moveTo(-w, y);
          g.quadraticCurveTo(-w * 0.3, y - 8, 0, y - 36);
          g.quadraticCurveTo(w * 0.3, y - 8, w, y);
          g.quadraticCurveTo(w * 0.4, y + 3, 0, y + 2);
          g.quadraticCurveTo(-w * 0.4, y + 3, -w, y);
          g.closePath();
          g.fillStyle = vgrad(g, y - 36, y + 2, c1, c2); g.fill(); outline(g, 2.4);
          g.strokeStyle = 'rgba(255,255,220,0.30)'; g.lineWidth = 2;
          g.beginPath(); g.moveTo(-w * 0.6, y - 3); g.quadraticCurveTo(-w * 0.25, y - 8, -3, y - 22); g.stroke();
        }
      }, 8);
    }
    if (kind === 'rock') {
      return make(key, 66, 52, g => {
        aoShadow(g, 24, 9, 0.24);
        const R = 17 + variant * 3;
        g.beginPath();
        g.moveTo(-R, -R * 0.3);
        g.bezierCurveTo(-R * 1.05, -R * 0.9, -R * 0.4, -R * 1.35, R * 0.1, -R * 1.2);
        g.bezierCurveTo(R * 0.7, -R * 1.1, R * 1.05, -R * 0.55, R * 0.9, -R * 0.1);
        g.quadraticCurveTo(R * 0.5, R * 0.12, 0, R * 0.1);
        g.quadraticCurveTo(-R * 0.6, R * 0.12, -R, -R * 0.3);
        g.closePath();
        g.fillStyle = vgrad(g, -R * 1.4, R * 0.1, '#aca69c', '#635e54'); g.fill();
        texOver(g, 'stone', -R, -R * 1.4, R * 2.2, R * 1.7, 1);
        g.beginPath();
        g.moveTo(-R, -R * 0.3);
        g.bezierCurveTo(-R * 1.05, -R * 0.9, -R * 0.4, -R * 1.35, R * 0.1, -R * 1.2);
        g.bezierCurveTo(R * 0.7, -R * 1.1, R * 1.05, -R * 0.55, R * 0.9, -R * 0.1);
        g.quadraticCurveTo(R * 0.5, R * 0.12, 0, R * 0.1);
        g.quadraticCurveTo(-R * 0.6, R * 0.12, -R, -R * 0.3);
        g.closePath();
        outline(g, 2.4);
        g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(-R * 0.5, -R * 0.9); g.quadraticCurveTo(-R * 0.2, -R * 1.1, R * 0.05, -R * 1.05); g.stroke();
        g.strokeStyle = 'rgba(25,20,16,0.35)'; g.lineWidth = 1.6;
        g.beginPath(); g.moveTo(R * 0.2, -R * 0.7); g.lineTo(R * 0.4, -R * 0.4); g.stroke();
        if (variant % 2) {
          g.fillStyle = 'rgba(110,160,80,0.6)';
          ell(g, -R * 0.4, -R * 0.2, R * 0.3, R * 0.12); g.fill();
        }
      }, 6);
    }
    if (kind === 'bush') {
      return make(key, 52, 42, g => {
        aoShadow(g, 18, 6.4, 0.22);
        for (const [x, y, r] of [[-8, -8, 11], [8, -9, 10], [0, -14, 11]]) {
          ell(g, x, y, r, r * 0.85);
          g.fillStyle = vgrad(g, y - r, y + r, '#6cb14e', '#417a2e'); g.fill(); outline(g, 2.2);
        }
        g.fillStyle = 'rgba(255,255,220,0.28)';
        ell(g, -6, -17, 4.4, 3); g.fill();
        ell(g, 5, -14, 3, 2.2); g.fill();
        if (variant % 2) {
          g.fillStyle = '#e5484d';
          ell(g, -6, -10, 2, 2); g.fill(); ell(g, 5, -13, 2, 2); g.fill(); ell(g, 1, -7, 2, 2); g.fill();
          g.fillStyle = 'rgba(255,255,255,0.5)';
          ell(g, -6.6, -10.7, 0.7, 0.7); g.fill();
        }
      }, 5);
    }
    if (kind === 'ruin') {
      return make(key, 50, 72, g => {
        aoShadow(g, 16, 6.4, 0.24);
        const h = 34 + variant * 8;
        rr(g, -8, -h, 16, h, 2);
        g.fillStyle = vgrad(g, -h, 0, '#e2dbcb', '#98917f'); g.fill();
        texOver(g, 'stone', -8, -h, 16, h, 1);
        rr(g, -8, -h, 16, h, 2);
        outline(g, 2.2);
        g.beginPath();
        g.moveTo(-8, -h); g.lineTo(-4, -h - 5); g.lineTo(2, -h + 2); g.lineTo(8, -h - 3); g.lineTo(8, -h + 4); g.lineTo(-8, -h + 4);
        g.closePath();
        g.fillStyle = '#cbc4b3'; g.fill(); outline(g, 1.8);
        g.strokeStyle = 'rgba(60,55,45,0.4)'; g.lineWidth = 1.4;
        g.beginPath(); g.moveTo(-8, -h * 0.5); g.lineTo(8, -h * 0.5); g.stroke();
        g.strokeStyle = 'rgba(255,255,255,0.4)'; g.lineWidth = 1.2;
        g.beginPath(); g.moveTo(-6.4, -h + 6); g.lineTo(-6.4, -6); g.stroke();
        g.fillStyle = 'rgba(110,160,80,0.6)';
        ell(g, -5, -6, 6, 4); g.fill();
        ell(g, 4, -h * 0.55, 3.4, 2.4); g.fill();
      }, 6);
    }
    if (kind === 'torch') {
      return make(key, 30, 66, g => {
        aoShadow(g, 9, 3.6, 0.26);
        g.fillStyle = vgrad(g, -46, 0, '#8a6234', '#54371a');
        rr(g, -2.8, -46, 5.6, 46, 2.4); g.fill();
        texOver(g, 'wood', -3, -46, 6, 46, 1);
        rr(g, -2.8, -46, 5.6, 46, 2.4);
        outline(g, 2);
        g.strokeStyle = '#3f4854'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(-3, -14); g.lineTo(3, -14); g.stroke();
        g.beginPath();
        g.moveTo(-7, -46); g.lineTo(7, -46); g.lineTo(5, -54); g.lineTo(-5, -54);
        g.closePath();
        g.fillStyle = vgrad(g, -55, -45, '#4c5568', '#23262e'); g.fill(); outline(g, 2);
      }, 5);
    }
    if (kind === 'cart') {
      return make(key, 78, 56, g => {
        aoShadow(g, 27, 10, 0.24);
        g.save(); g.rotate(-0.08);
        rr(g, -24, -26, 48, 18, 3);
        g.fillStyle = vgrad(g, -26, -8, '#a8763e', '#5f3d1c'); g.fill();
        texOver(g, 'wood', -24, -26, 48, 18, 1);
        rr(g, -24, -26, 48, 18, 3);
        outline(g, 2.2);
        g.strokeStyle = 'rgba(40,25,10,0.5)'; g.lineWidth = 1.6;
        for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(i * 12, -26); g.lineTo(i * 12, -8); g.stroke(); }
        ell(g, -14, -6, 8, 8);
        g.fillStyle = '#54371a'; g.fill(); outline(g, 2.2);
        for (let i = 0; i < 4; i++) {
          const a = i * Math.PI / 2 + 0.4;
          g.strokeStyle = '#8a6234'; g.lineWidth = 1.8;
          g.beginPath(); g.moveTo(-14, -6); g.lineTo(-14 + Math.cos(a) * 7, -6 + Math.sin(a) * 7); g.stroke();
        }
        ell(g, -14, -6, 2.6, 2.6); g.fillStyle = '#3f4854'; g.fill();
        g.strokeStyle = '#54371a'; g.lineWidth = 3;
        g.beginPath(); g.moveTo(18, -10); g.lineTo(30, -2); g.stroke();
        g.restore();
      }, 6);
    }
    if (kind === 'skull') {
      return make(key, 34, 28, g => {
        ell(g, 0, -8, 9, 8);
        g.fillStyle = vgrad(g, -16, 0, '#f0ead9', '#b3ab9a'); g.fill(); outline(g, 2);
        ell(g, -3.4, -8, 2.2, 2.6); g.fillStyle = '#2c2824'; g.fill();
        ell(g, 3.4, -8, 2.2, 2.6); g.fill();
        rr(g, -4.4, -2.5, 8.8, 3.4, 1.4);
        g.fillStyle = '#ded6c4'; g.fill(); outline(g, 1.6);
        g.strokeStyle = '#2c2824'; g.lineWidth = 1;
        for (const lx of [-2.4, 0, 2.4]) { g.beginPath(); g.moveTo(lx, -2); g.lineTo(lx, 0.4); g.stroke(); }
      }, 4);
    }
    // Zaun
    return make(key, 60, 40, g => {
      g.fillStyle = '#8a6234';
      for (const x of [-22, 0, 22]) {
        rr(g, x - 3, -22, 6, 22, 2); g.fill(); outline(g, 1.8);
        g.fillStyle = 'rgba(255,230,180,0.25)';
        g.fillRect(x - 2, -21, 1.6, 20);
        g.fillStyle = '#8a6234';
      }
      rr(g, -27, -18, 54, 4.4, 2); g.fill(); outline(g, 1.8);
      rr(g, -27, -9, 54, 4.4, 2); g.fill(); outline(g, 1.8);
    }, 5);
  }

  // ============================================================
  //  BODEN (vorgerendert, halbe Auflösung)
  // ============================================================

  function paintGround(seed) {
    const { w, h, cx, cy } = KS.CFG.WORLD;
    const SC = 0.5;
    const c = document.createElement('canvas');
    c.width = w * SC; c.height = h * SC;
    const g = c.getContext('2d');
    g.scale(SC, SC);
    const rnd = U.seededRng(seed);

    // Basis-Gras
    const base = g.createRadialGradient(cx, cy, 200, cx, cy, w * 0.72);
    base.addColorStop(0, '#8ecf63');
    base.addColorStop(0.55, '#79bd52');
    base.addColorStop(1, '#578f3e');
    g.fillStyle = base; g.fillRect(0, 0, w, h);

    // Große weiche Farbflecken (mehr Varianz)
    for (let i = 0; i < 1300; i++) {
      const x = rnd() * w, y = rnd() * h, r = 16 + rnd() * 76;
      const v = rnd();
      g.fillStyle = v < 0.35 ? 'rgba(255,255,200,0.05)'
        : v < 0.7 ? 'rgba(30,90,30,0.055)'
        : v < 0.85 ? 'rgba(150,200,80,0.05)'
        : 'rgba(60,120,40,0.05)';
      g.beginPath(); g.ellipse(x, y, r, r * (0.5 + rnd() * 0.5), rnd() * 3, 0, TAU); g.fill();
    }

    // Pfade von den 8 Toren zur Mitte (mit Radspuren)
    const gates = KS.CFG.GATES.map(a => ({
      a, x: cx + Math.cos(a) * (w * 0.485), y: cy + Math.sin(a) * (h * 0.485),
    }));
    for (const gate of gates) {
      const midx = (gate.x + cx) / 2 + (rnd() - 0.5) * 140;
      const midy = (gate.y + cy) / 2 + (rnd() - 0.5) * 140;
      const ex = cx + Math.cos(gate.a) * 250, ey = cy + Math.sin(gate.a) * 250;
      for (const [lw, col, al] of [[50, '#a3854f', 0.5], [38, '#c2a068', 0.85], [22, '#d4b47c', 0.5]]) {
        g.save();
        g.globalAlpha = al;
        g.strokeStyle = col; g.lineWidth = lw; g.lineCap = 'round';
        g.beginPath();
        g.moveTo(gate.x, gate.y);
        g.quadraticCurveTo(midx, midy, ex, ey);
        g.stroke();
        g.restore();
      }
      // Radspuren
      g.save();
      g.globalAlpha = 0.35;
      g.strokeStyle = '#8a6c40'; g.lineWidth = 3;
      const na = gate.a + Math.PI / 2;
      for (const s of [-1, 1]) {
        const ox = Math.cos(na) * 8 * s, oy = Math.sin(na) * 8 * s;
        g.beginPath();
        g.moveTo(gate.x + ox, gate.y + oy);
        g.quadraticCurveTo(midx + ox, midy + oy, ex + ox, ey + oy);
        g.stroke();
      }
      g.restore();
      // Kiesel & Grasbüschel am Rand
      for (let i = 0; i < 30; i++) {
        const t = rnd();
        const px = (1 - t) * (1 - t) * gate.x + 2 * (1 - t) * t * midx + t * t * ex;
        const py = (1 - t) * (1 - t) * gate.y + 2 * (1 - t) * t * midy + t * t * ey;
        g.fillStyle = rnd() < 0.5 ? 'rgba(120,95,60,0.55)' : 'rgba(170,145,100,0.6)';
        g.beginPath(); g.ellipse(px + (rnd() - 0.5) * 28, py + (rnd() - 0.5) * 28, 2.2 + rnd() * 3, 1.8 + rnd() * 2, 0, 0, TAU); g.fill();
      }
    }

    // Dorfplatz (Kopfsteinpflaster)
    const plazaR = 265;
    const pg = g.createRadialGradient(cx, cy, 40, cx, cy, plazaR);
    pg.addColorStop(0, '#cfbf9d');
    pg.addColorStop(0.85, '#c0ae88');
    pg.addColorStop(1, '#a89a76');
    g.beginPath(); g.arc(cx, cy, plazaR, 0, TAU); g.fillStyle = pg; g.fill();
    g.strokeStyle = 'rgba(90,75,50,0.6)'; g.lineWidth = 5;
    g.beginPath(); g.arc(cx, cy, plazaR, 0, TAU); g.stroke();
    g.strokeStyle = 'rgba(255,245,225,0.35)'; g.lineWidth = 2;
    g.beginPath(); g.arc(cx, cy, plazaR - 4, 0, TAU); g.stroke();
    // Pflasterung: feine Ringfugen + versetzte Stoßfugen + kleine Steine
    g.strokeStyle = 'rgba(90,75,50,0.26)'; g.lineWidth = 2.2;
    for (let ring = 1; ring <= 8; ring++) {
      const rr2 = plazaR * ring / 8.6;
      g.beginPath(); g.arc(cx, cy, rr2, 0, TAU); g.stroke();
      const n = 8 + ring * 7;
      for (let i = 0; i < n; i++) {
        const a = i / n * TAU + ring * 0.5;
        g.beginPath();
        g.moveTo(cx + Math.cos(a) * (rr2 - plazaR / 10), cy + Math.sin(a) * (rr2 - plazaR / 10));
        g.lineTo(cx + Math.cos(a) * rr2, cy + Math.sin(a) * rr2);
        g.stroke();
      }
    }
    // Einzelne helle/dunkle Steine + Abnutzung
    for (let i = 0; i < 190; i++) {
      const a = rnd() * TAU, r = Math.sqrt(rnd()) * (plazaR - 10);
      const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
      g.fillStyle = rnd() < 0.5 ? 'rgba(255,250,235,0.10)' : 'rgba(90,75,50,0.10)';
      g.beginPath();
      g.ellipse(px, py, 6 + rnd() * 9, 4.4 + rnd() * 6, a, 0, TAU);
      g.fill();
    }
    for (let i = 0; i < 26; i++) {
      const a = rnd() * TAU, r = rnd() * plazaR * 0.9;
      g.fillStyle = 'rgba(255,245,220,0.07)';
      g.beginPath();
      g.ellipse(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 20 + rnd() * 30, 14 + rnd() * 18, a, 0, TAU);
      g.fill();
    }
    // Gold-Einlage-Ring um die Burg
    g.save();
    g.strokeStyle = 'rgba(201,153,46,0.4)'; g.lineWidth = 6;
    g.beginPath(); g.arc(cx, cy, 150, 0, TAU); g.stroke();
    g.strokeStyle = 'rgba(255,230,160,0.30)'; g.lineWidth = 2; g.setLineDash([14, 10]);
    g.beginPath(); g.arc(cx, cy, 150, 0, TAU); g.stroke();
    g.restore();

    // Turmring-Markierung (dezent)
    g.save();
    g.strokeStyle = 'rgba(255,250,230,0.20)'; g.lineWidth = 4; g.setLineDash([16, 20]);
    g.beginPath(); g.arc(cx, cy, 338, 0, TAU); g.stroke();
    g.restore();

    // Teich im Nordosten
    {
      const pa = 5.24, pr2 = 760;
      const px = cx + Math.cos(pa) * pr2, py = cy + Math.sin(pa) * pr2;
      g.fillStyle = 'rgba(190,170,120,0.7)';
      g.beginPath(); g.ellipse(px, py, 104, 78, 0.3, 0, TAU); g.fill();
      const wg = g.createRadialGradient(px - 14, py - 12, 8, px, py, 100);
      wg.addColorStop(0, '#8fd4d8');
      wg.addColorStop(0.5, '#4d9db4');
      wg.addColorStop(1, '#2e6a86');
      g.fillStyle = wg;
      g.beginPath(); g.ellipse(px, py, 92, 66, 0.3, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(40,80,90,0.5)'; g.lineWidth = 3;
      g.stroke();
      // Glitzern & Seerosen
      g.strokeStyle = 'rgba(255,255,255,0.4)'; g.lineWidth = 2;
      for (let i = 0; i < 5; i++) {
        const lx = px + (rnd() - 0.5) * 110, ly = py + (rnd() - 0.5) * 70;
        g.beginPath(); g.moveTo(lx - 8, ly); g.lineTo(lx + 8, ly); g.stroke();
      }
      for (let i = 0; i < 4; i++) {
        const lx = px + (rnd() - 0.5) * 120, ly = py + (rnd() - 0.5) * 80;
        g.fillStyle = '#4a8a34';
        g.beginPath(); g.ellipse(lx, ly, 7, 5, rnd(), 0.4, TAU - 0.4); g.fill();
      }
      // Schilf
      for (let i = 0; i < 14; i++) {
        const a = rnd() * TAU;
        const sx = px + Math.cos(a) * (96 + rnd() * 16), sy = py + Math.sin(a) * (70 + rnd() * 12);
        g.strokeStyle = 'rgba(60,110,40,0.8)'; g.lineWidth = 2.4;
        g.beginPath(); g.moveTo(sx, sy); g.quadraticCurveTo(sx + 2, sy - 8, sx + (rnd() - 0.5) * 6, sy - 14 - rnd() * 6); g.stroke();
      }
    }

    // Blumen (mit Blütenblättern), Grasbüschel & Pilze
    for (let i = 0; i < 1500; i++) {
      const a = rnd() * TAU, r = plazaR + 30 + rnd() * (w * 0.46 - plazaR);
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      if (x < 20 || y < 20 || x > w - 20 || y > h - 20) continue;
      const v = rnd();
      if (v < 0.08) {
        // Blume mit Blütenblättern
        const fc = ['#ffdf6e', '#ff8f8f', '#c9a8ff', '#fff'][Math.floor(rnd() * 4)];
        g.fillStyle = fc;
        for (let p = 0; p < 5; p++) {
          const pa2 = p / 5 * TAU;
          g.beginPath(); g.ellipse(x + Math.cos(pa2) * 2.6, y + Math.sin(pa2) * 2.6, 2, 1.4, pa2, 0, TAU); g.fill();
        }
        g.fillStyle = '#ffb42e';
        g.beginPath(); g.arc(x, y, 1.6, 0, TAU); g.fill();
      } else if (v < 0.11) {
        // Pilz
        g.fillStyle = '#e8dcc8';
        g.fillRect(x - 1, y - 3, 2, 3.4);
        g.fillStyle = rnd() < 0.5 ? '#d0392b' : '#c98a2e';
        g.beginPath(); g.arc(x, y - 3.4, 3, Math.PI, 0); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.8)';
        g.beginPath(); g.arc(x - 1, y - 4.4, 0.7, 0, TAU); g.fill();
      } else if (v < 0.42) {
        // Grasbüschel (3 Halme)
        g.strokeStyle = rnd() < 0.5 ? 'rgba(40,95,35,0.34)' : 'rgba(220,255,180,0.28)';
        g.lineWidth = 1.4;
        for (let b = -1; b <= 1; b++) {
          g.beginPath();
          g.moveTo(x + b * 2, y);
          g.quadraticCurveTo(x + b * 3, y - 4, x + b * 4.4, y - 6 - rnd() * 4);
          g.stroke();
        }
      } else {
        g.strokeStyle = rnd() < 0.5 ? 'rgba(40,90,35,0.28)' : 'rgba(220,255,180,0.24)';
        g.lineWidth = 1.3;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 5, y - 4 - rnd() * 5); g.stroke();
      }
    }

    // Dunkler Waldrand
    const edge = g.createRadialGradient(cx, cy, w * 0.36, cx, cy, w * 0.72);
    edge.addColorStop(0, 'rgba(20,40,18,0)');
    edge.addColorStop(1, 'rgba(14,30,14,0.6)');
    g.fillStyle = edge; g.fillRect(0, 0, w, h);

    return { canvas: c, scale: SC };
  }

  // Requisiten-Platzierung (deterministisch)
  function generateProps(seed) {
    const { w, h, cx, cy } = KS.CFG.WORLD;
    const rnd = U.seededRng(seed + 7);
    const props = [];
    const pads = KS.CFG.PADS;
    const wallR = KS.CFG.WALL.r;
    const pondX = cx + Math.cos(5.24) * 760, pondY = cy + Math.sin(5.24) * 760;
    const clearOf = (x, y) => {
      if (!pads.every(p => U.dist2(x, y, p.x, p.y) > 95 * 95)) return false;
      const dC = Math.sqrt(U.dist2(x, y, cx, cy));
      if (Math.abs(dC - wallR) < 55) return false;             // Mauerring freihalten
      if (U.dist2(x, y, pondX, pondY) < 150 * 150) return false; // Teich freihalten
      return true;
    };

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
      const a = rnd() * TAU;
      const t = Math.pow(rnd(), 0.6);
      const r = 640 + t * (w * 0.5 - 700);
      const x = cx + Math.cos(a) * r + (rnd() - 0.5) * 120;
      const y = cy + Math.sin(a) * r + (rnd() - 0.5) * 120;
      if (x < 50 || y < 60 || x > w - 50 || y > h - 30) continue;
      if (!clearOf(x, y)) continue;
      const kind = rnd() < 0.55 ? 'tree' : (rnd() < 0.6 ? 'pine' : 'bush');
      props.push({ kind, v: Math.floor(rnd() * 3), x, y, s: 0.8 + rnd() * 0.55, flip: rnd() < 0.5 });
    }
    // Verstreute Bäume/Büsche im Mittelring
    for (let i = 0; i < 40; i++) {
      const a = rnd() * TAU, r = 300 + rnd() * 310;
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      if (!clearOf(x, y)) continue;
      const kind = rnd() < 0.5 ? 'bush' : (rnd() < 0.5 ? 'tree' : 'rock');
      props.push({ kind, v: Math.floor(rnd() * 3), x, y, s: 0.7 + rnd() * 0.4, flip: rnd() < 0.5 });
    }
    // Felsen bei den Minen
    for (const mid of ['mine_1', 'mine_2']) {
      const mp = pads.find(p => p.id === mid);
      for (let i = 0; i < 5; i++) {
        const a = rnd() * TAU, r = 70 + rnd() * 60;
        props.push({ kind: 'rock', v: Math.floor(rnd() * 3), x: mp.x + Math.cos(a) * r, y: mp.y + Math.sin(a) * r, s: 0.8 + rnd() * 0.7, flip: rnd() < 0.5 });
      }
    }
    // Ruinen & Schlachtfeld-Details
    for (let i = 0; i < 10; i++) {
      const a = rnd() * TAU, r = 460 + rnd() * 480;
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      if (!clearOf(x, y)) continue;
      props.push({ kind: ['ruin', 'cart', 'skull'][Math.floor(rnd() * 3)], v: Math.floor(rnd() * 2), x, y, s: 0.9 + rnd() * 0.3, flip: rnd() < 0.5 });
    }
    return props;
  }

  return {
    make, draw, building, padPlate, monster, king, sword, villager, coin,
    prop, paintGround, generateProps,
    wallPost, wallRubble, gatePost, gateDoor, gateBroken, drawStar,
    matFor, MATS, TOWER_ACCENT,
  };
})();
