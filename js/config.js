/* ============================================================
   KINGSHOT — config.js
   Alle Daten & Balance: Welt, Gebäude, Türme, Waffen, Monster,
   Bosse, Nächte, Kapitel & Quests (der rote Faden).
   ============================================================ */
'use strict';
window.KS = window.KS || {};

KS.CFG = (() => {

  // ---------- Welt ----------
  const WORLD = {
    w: 2400, h: 2400,
    cx: 1200, cy: 1200,
    baseRadius: 118,          // Angriffs-Radius der Burg
    villageRadius: 520,       // Dorf-/Fackelring (Deko)
    spawnMargin: 60,          // Abstand der Spawns vom Rand
  };

  // ---------- Spieler ----------
  const PLAYER = {
    speed: 182,
    r: 16,
    hpMax: 100,
    regenDelay: 3.0,
    regenRate: 0.09,          // Anteil pro Sekunde
    magnetR: 130,
    magnetRMoving: 155,
    reviveTime: 3.0,
    aggroR: 150,              // Monster jagen den Spieler in dieser Nähe
  };

  // ---------- Tore & Stadtmauer ----------
  // 8 Tore — identisch mit den Pfaden auf dem Boden
  const GATES = Array.from({ length: 8 }, (_, i) => i * Math.PI / 4 + 0.12);
  const WALL = {
    r: 402,            // Radius des Mauerrings
    gateHalf: 0.115,   // halbe Toröffnung (rad)
    postGap: 30,       // Abstand der Mauersegmente-Pfosten
    segs: 16,          // 8 Bögen × 2 Abschnitte
  };

  // ---------- Markt: dauerhafte König-Verbesserungen ----------
  const MARKET = [
    { id: 'hp',     ico: 'heart',  name: 'Königliche Vitalität', desc: '+12 % max. Leben',        max: 20, base: 45, mul: 1.42 },
    { id: 'speed',  ico: 'boot',   name: 'Windläufer-Stiefel',   desc: '+3 % Tempo',              max: 12, base: 60, mul: 1.50 },
    { id: 'magnet', ico: 'magnet', name: 'Goldmagnet',           desc: '+10 % Sammelradius',      max: 12, base: 50, mul: 1.45 },
    { id: 'crit',   ico: 'swords', name: 'Königsschlag',         desc: '+2 % kritische Treffer',  max: 15, base: 80, mul: 1.50 },
    { id: 'gold',   ico: 'clover', name: 'Steuerprivileg',       desc: '+4 % Gold von Monstern',  max: 20, base: 75, mul: 1.50 },
    { id: 'armor',  ico: 'shield', name: 'Königsplatte',         desc: '2 % weniger Schaden',     max: 15, base: 90, mul: 1.50 },
  ];

  // ---------- Waffe (über Schmiede-Stufe) ----------
  // Stufe 1..10 — Schaden, Angriffe/s, Reichweite, Klingenwelle
  const WEAPONS = [
    { name: 'Rostiges Schwert',  dmg: 7,   rate: 1.45, range: 62,  beam: 0,    blade: '#b9c0c9', glow: null },
    { name: 'Eisenschwert',      dmg: 11,  rate: 1.52, range: 66,  beam: 0,    blade: '#cdd5de', glow: null },
    { name: 'Stahlklinge',       dmg: 17,  rate: 1.60, range: 70,  beam: 0,    blade: '#dfe7f0', glow: null },
    { name: 'Ritterschwert',     dmg: 26,  rate: 1.68, range: 74,  beam: 0,    blade: '#e8eef7', glow: '#9db8ff' },
    { name: 'Sturmklinge',       dmg: 38,  rate: 1.76, range: 78,  beam: 0.35, blade: '#bfe3ff', glow: '#66b8ff' },
    { name: 'Flammenzahn',       dmg: 56,  rate: 1.84, range: 82,  beam: 0.40, blade: '#ffd9a0', glow: '#ff9d2e' },
    { name: 'Frostbringer',      dmg: 80,  rate: 1.92, range: 86,  beam: 0.45, blade: '#d8f4ff', glow: '#6fd8ff' },
    { name: 'Drachenklinge',     dmg: 116, rate: 2.00, range: 90,  beam: 0.55, blade: '#ffc4c4', glow: '#ff5a5a' },
    { name: 'Königsklinge',      dmg: 165, rate: 2.10, range: 95,  beam: 0.65, blade: '#ffe9a8', glow: '#f7c948' },
    { name: 'Lichtbringer',      dmg: 240, rate: 2.20, range: 100, beam: 0.80, blade: '#fffbe8', glow: '#fff2a8' },
  ];

  // ---------- Gebäude-Typen ----------
  // costMul: Kosten je Stufe = baseCost * costMul^(stufe-1)
  const BUILDINGS = {
    castle: {
      name: 'Burg', ico: 'castle', kind: 'castle', tiers: 10,
      baseCost: 120, costMul: 2.0,
      hp: t => Math.round(450 * Math.pow(1.55, t - 1)),
      regen: 0.0035,          // Anteil der Max-HP pro Sekunde (innere Selbstheilung)
      desc: 'Das Herz des Königreichs. Fällt die Burg, fällt alles.',
    },
    tower_arrow: {
      name: 'Wachturm', ico: 'bow', kind: 'tower', tiers: 10,
      baseCost: 60, costMul: 1.8,
      proj: 'arrow', dmg: 7, rate: 1.15, range: 235,
      dmgMul: 1.45, rateAdd: 0.05, rangeAdd: 7,
      desc: 'Verlässliche Pfeile in schneller Folge.',
    },
    tower_cannon: {
      name: 'Kanonenturm', ico: 'cannon', kind: 'tower', tiers: 10,
      baseCost: 150, costMul: 1.8,
      proj: 'cannon', dmg: 26, rate: 0.42, range: 265, splash: 62,
      dmgMul: 1.45, rateAdd: 0.016, rangeAdd: 6,
      desc: 'Donnernde Kugeln mit Flächenschaden.',
    },
    tower_frost: {
      name: 'Frostturm', ico: 'snow', kind: 'tower', tiers: 10,
      baseCost: 170, costMul: 1.8,
      proj: 'frost', dmg: 10, rate: 0.85, range: 225, slow: 0.45, slowDur: 1.8,
      dmgMul: 1.42, rateAdd: 0.03, rangeAdd: 6,
      desc: 'Eisige Geschosse, die Feinde verlangsamen.',
    },
    tower_lightning: {
      name: 'Blitzturm', ico: 'bolt', kind: 'tower', tiers: 10,
      baseCost: 210, costMul: 1.8,
      proj: 'zap', dmg: 20, rate: 0.75, range: 245, chain: 3, chainR: 130,
      dmgMul: 1.46, rateAdd: 0.03, rangeAdd: 6,
      desc: 'Kettenblitze springen von Feind zu Feind.',
    },
    tower_flame: {
      name: 'Flammenturm', ico: 'flame', kind: 'tower', tiers: 10,
      baseCost: 190, costMul: 1.8,
      proj: 'flame', dmg: 6, rate: 5.5, range: 165, burn: 3, burnDur: 2.2,
      dmgMul: 1.42, rateAdd: 0.12, rangeAdd: 5,
      desc: 'Ein Strom aus Feuer, der Feinde verbrennt.',
    },
    mine: {
      name: 'Goldmine', ico: 'pickaxe', kind: 'prod', tiers: 10,
      baseCost: 90, costMul: 1.9,
      income: t => Math.round(3 * Math.pow(1.55, t - 1)),
      interval: 6,
      desc: 'Fördert stetig Gold aus der Tiefe.',
    },
    tavern: {
      name: 'Taverne', ico: 'mug', kind: 'prod', tiers: 10,
      baseCost: 110, costMul: 1.9,
      capacity: t => t * 2,
      income: t => Math.round(2 * Math.pow(1.35, t - 1)),   // pro Überlebendem
      interval: 9,
      desc: 'Ein warmes Dach für Überlebende — sie zahlen Steuern.',
    },
    forge: {
      name: 'Schmiede', ico: 'anvil', kind: 'forge', tiers: 10,
      baseCost: 140, costMul: 1.9,
      desc: 'Schmiedet dem König immer mächtigere Klingen.',
    },
    markt: {
      name: 'Markt', ico: 'market', kind: 'market', tiers: 10,
      baseCost: 120, costMul: 1.9,
      slots: t => Math.min(6, 3 + Math.floor(t / 2)),         // sichtbare Angebote
      discount: t => Math.max(0.82, 1 - 0.02 * (t - 1)),      // Rabatt je Stufe
      desc: 'Dauerhafte Verbesserungen für den König — Ware gegen Gold.',
    },
    wall: {
      name: 'Stadtmauer', ico: 'wall', kind: 'wall', tiers: 10,
      baseCost: 150, costMul: 1.85,
      segHp: t => Math.round(260 * Math.pow(1.5, t - 1)),
      desc: 'Schützt das Dorf. Abschnitte können brechen — im Morgengrauen wird repariert.',
    },
    shrine: {
      name: 'Schrein des Lichts', ico: 'sparkle', kind: 'shrine', tiers: 10,
      baseCost: 160, costMul: 1.9,
      auraR: t => 220 + t * 26,
      heal: t => 2.2 * Math.pow(1.32, t - 1),   // Spieler-HP/s in Aura
      baseHeal: t => 0.0022 * t,                // Burg-Anteil/s
      desc: 'Heiliges Licht heilt König und Burg.',
    },
  };

  // ---------- Bauplätze (Pads) ----------
  // Winkel: 0° = Osten, 90° = Süden (y nach unten)
  const deg = a => a * Math.PI / 180;
  const pad = (id, type, angle, r, label) => ({
    id, type, label,
    x: WORLD.cx + Math.cos(deg(angle)) * r,
    y: WORLD.cy + Math.sin(deg(angle)) * r,
  });

  const PADS = [
    { id: 'castle', type: 'castle', label: 'Burg', x: WORLD.cx, y: WORLD.cy },
    pad('tower_n',  'tower_arrow',     270, 330, 'Wachturm Nord'),
    pad('tower_e',  'tower_arrow',       0, 330, 'Wachturm Ost'),
    pad('tower_s',  'tower_arrow',      90, 330, 'Wachturm Süd'),
    pad('tower_w',  'tower_cannon',    180, 330, 'Kanonenturm West'),
    pad('tower_ne', 'tower_frost',     315, 348, 'Frostturm'),
    pad('tower_nw', 'tower_lightning', 225, 348, 'Blitzturm'),
    pad('tower_sw', 'tower_flame',     135, 348, 'Flammenturm'),
    pad('tower_se', 'tower_cannon',     45, 348, 'Kanonenturm Ost'),
    pad('tavern_1', 'tavern',           25, 196, 'Taverne „Zum Funken“'),
    pad('tavern_2', 'tavern',          155, 196, 'Taverne „Goldener Eber“'),
    pad('forge',    'forge',            90, 192, 'Schmiede'),
    pad('shrine',   'shrine',          270, 192, 'Schrein'),
    pad('markt',    'markt',           330, 205, 'Markt'),
    pad('wall',     'wall',            112, 352, 'Stadtmauer'),
    pad('mine_1',   'mine',            205, 470, 'Alte Goldmine'),
    pad('mine_2',   'mine',            335, 470, 'Tiefenstollen'),
  ];

  // ---------- Monster ----------
  // cls = Klasse (1 sehr einfach … 12 tödlich), minDay = ab welchem Tag
  // cost = Spawn-Budgetkosten, gold = Basis-Goldwert
  const MONSTERS = {
    // Klasse 1 — Schleime
    slime:        { name: 'Grünschleim',      cls: 1,  minDay: 1,  hp: 11,   dmg: 3,   speed: 44,  r: 15, gold: 3,  cost: 1,   fam: 'slime',  c1: '#5fd672', c2: '#2e9e4a' },
    slime_blue:   { name: 'Flinkschleim',     cls: 1,  minDay: 2,  hp: 8,    dmg: 2.5, speed: 72,  r: 13, gold: 4,  cost: 1.2, fam: 'slime',  c1: '#5fb8e8', c2: '#2a72b0' },
    // Klasse 2 — Goblins
    goblin:       { name: 'Goblin',           cls: 2,  minDay: 4,  hp: 26,   dmg: 7,   speed: 66,  r: 15, gold: 6,  cost: 2.2, fam: 'gob',    c1: '#8fbf4d', c2: '#5c8a2e', weapon: 'dagger' },
    goblin_throw: { name: 'Steinwerfer',      cls: 2,  minDay: 5,  hp: 20,   dmg: 6,   speed: 58,  r: 15, gold: 8,  cost: 2.8, fam: 'gob',    c1: '#a8c95c', c2: '#6e9a38', ranged: { range: 190, rate: 0.55, proj: 'rock' } },
    // Klasse 3 — Spinnen
    spider:       { name: 'Waldspinne',       cls: 3,  minDay: 7,  hp: 42,   dmg: 10,  speed: 84,  r: 17, gold: 9,  cost: 3.6, fam: 'spider', c1: '#6b5a7d', c2: '#3f3350' },
    spider_venom: { name: 'Giftspinne',       cls: 3,  minDay: 9,  hp: 36,   dmg: 13,  speed: 92,  r: 16, gold: 11, cost: 4.2, fam: 'spider', c1: '#7da05a', c2: '#46652c', venom: true },
    // Klasse 4 — Untote
    skeleton:     { name: 'Skelett',          cls: 4,  minDay: 11, hp: 66,   dmg: 13,  speed: 60,  r: 16, gold: 12, cost: 5,   fam: 'skel',   c1: '#e8e2d2', c2: '#b8b0a0', weapon: 'sword' },
    skeleton_bow: { name: 'Knochenschütze',   cls: 4,  minDay: 12, hp: 50,   dmg: 11,  speed: 54,  r: 16, gold: 14, cost: 6,   fam: 'skel',   c1: '#ded8c8', c2: '#aaa294', ranged: { range: 230, rate: 0.5, proj: 'bonearrow' } },
    // Klasse 5 — Orks
    orc:          { name: 'Ork-Grunzer',      cls: 5,  minDay: 16, hp: 130,  dmg: 20,  speed: 56,  r: 20, gold: 18, cost: 8,   fam: 'orc',    c1: '#7ba24a', c2: '#4e6e2c', weapon: 'axe' },
    orc_berserk:  { name: 'Ork-Berserker',    cls: 5,  minDay: 18, hp: 105,  dmg: 27,  speed: 82,  r: 19, gold: 22, cost: 9.5, fam: 'orc',    c1: '#9a4a3a', c2: '#6e2e22', weapon: 'axe', rage: true },
    // Klasse 6 — Wölfe
    wolf:         { name: 'Schattenwolf',     cls: 6,  minDay: 21, hp: 150,  dmg: 24,  speed: 118, r: 18, gold: 24, cost: 10,  fam: 'wolf',   c1: '#5a6070', c2: '#33384a', pack: 3 },
    wolf_alpha:   { name: 'Alphawolf',        cls: 6,  minDay: 23, hp: 260,  dmg: 34,  speed: 108, r: 22, gold: 34, cost: 14,  fam: 'wolf',   c1: '#3a3f52', c2: '#20242f', pack: 2 },
    // Klasse 7 — Trolle
    troll:        { name: 'Höhlentroll',      cls: 7,  minDay: 26, hp: 520,  dmg: 46,  speed: 42,  r: 28, gold: 42, cost: 20,  fam: 'troll',  c1: '#7d8f6a', c2: '#4d5c3e', weapon: 'club' },
    troll_rock:   { name: 'Felsschleuderer',  cls: 7,  minDay: 28, hp: 420,  dmg: 40,  speed: 38,  r: 27, gold: 48, cost: 23,  fam: 'troll',  c1: '#8a8f7a', c2: '#565a48', ranged: { range: 260, rate: 0.35, proj: 'boulder' } },
    // Klasse 8 — Golems
    golem:        { name: 'Steingolem',       cls: 8,  minDay: 31, hp: 1050, dmg: 62,  speed: 34,  r: 30, gold: 60, cost: 30,  fam: 'golem',  c1: '#8d99ae', c2: '#5a6478', core: '#7fd8ff' },
    golem_lava:   { name: 'Lavagolem',        cls: 8,  minDay: 33, hp: 850,  dmg: 78,  speed: 40,  r: 29, gold: 72, cost: 34,  fam: 'golem',  c1: '#6e4a3a', c2: '#3f2a20', core: '#ff9d2e' },
    // Klasse 9 — Kult & Brut
    cultist:      { name: 'Kultist',          cls: 9,  minDay: 36, hp: 620,  dmg: 55,  speed: 62,  r: 18, gold: 70, cost: 32,  fam: 'cult',   c1: '#5e3a7a', c2: '#38204c', ranged: { range: 250, rate: 0.6, proj: 'bolt' } },
    imp:          { name: 'Dämonenbrut',      cls: 9,  minDay: 37, hp: 480,  dmg: 62,  speed: 104, r: 17, gold: 66, cost: 30,  fam: 'imp',    c1: '#c05a3a', c2: '#8a3420' },
    // Klasse 10 — Dämonen
    gargoyle:     { name: 'Gargoyle',         cls: 10, minDay: 41, hp: 900,  dmg: 80,  speed: 96,  r: 22, gold: 95, cost: 42,  fam: 'gargoyle', c1: '#7a7f92', c2: '#4a4e5e', fly: true },
    demon:        { name: 'Schattendämon',    cls: 10, minDay: 42, hp: 1600, dmg: 110, speed: 58,  r: 26, gold: 120, cost: 52, fam: 'demon',  c1: '#8a2a3a', c2: '#521622' },
    // Klasse 11 — Drachenbrut
    drakeling:    { name: 'Drachling',        cls: 11, minDay: 45, hp: 1400, dmg: 105, speed: 88,  r: 23, gold: 130, cost: 55, fam: 'drake',  c1: '#4d9e6a', c2: '#2c6e44', fly: true },
    drake_fire:   { name: 'Glutdrachling',    cls: 11, minDay: 46, hp: 1200, dmg: 95,  speed: 80,  r: 23, gold: 145, cost: 60, fam: 'drake',  c1: '#c9563a', c2: '#8a3220', fly: true, ranged: { range: 220, rate: 0.6, proj: 'fireball' } },
    // Klasse 12 — Junge Drachen
    dragon_young: { name: 'Junger Drache',    cls: 12, minDay: 48, hp: 3200, dmg: 150, speed: 70,  r: 30, gold: 260, cost: 90, fam: 'drake',  c1: '#3a7ac9', c2: '#22528a', fly: true, big: 1.35 },
    dragon_frost: { name: 'Frostdrache',      cls: 12, minDay: 50, hp: 2800, dmg: 135, speed: 76,  r: 30, gold: 290, cost: 95, fam: 'drake',  c1: '#7ad0e8', c2: '#3a8aa8', fly: true, big: 1.35, ranged: { range: 240, rate: 0.5, proj: 'frostball' } },
  };

  // ---------- Bosse (alle 5 Nächte) ----------
  // hpTweak: relative Zähigkeit · Boss-HP folgen einer eigenen Kurve (bossHp)
  const BOSSES = [
    { day: 5,  id: 'boss_slime',  base: 'slime',    name: 'Schleimkönig',    sub: 'Urahn der Schleime',      hpTweak: 0.85, dmgMul: 2.6, size: 3.2, gold: 240,  speed: 34 },
    { day: 10, id: 'boss_gob',    base: 'goblin',   name: 'Goblin-Häuptling', sub: 'Herr der grünen Flut',   hpTweak: 0.95, dmgMul: 2.6, size: 2.7, gold: 520,  speed: 46 },
    { day: 15, id: 'boss_spider', base: 'spider',   name: 'Spinnenkönigin',  sub: 'Mutter der Brut',         hpTweak: 1.0,  dmgMul: 2.7, size: 2.9, gold: 900,  speed: 52 },
    { day: 20, id: 'boss_bone',   base: 'skeleton', name: 'Knochenfürst',    sub: 'Wächter der Totenwacht',  hpTweak: 1.05, dmgMul: 2.8, size: 2.7, gold: 1400, speed: 44 },
    { day: 25, id: 'boss_orc',    base: 'orc',      name: 'Ork-Kriegsherr',  sub: 'Trommler des Krieges',    hpTweak: 1.0,  dmgMul: 2.8, size: 2.6, gold: 2100, speed: 46 },
    { day: 30, id: 'boss_troll',  base: 'troll',    name: 'Trollkönig',      sub: 'Berg, der wandelt',       hpTweak: 1.15, dmgMul: 2.7, size: 2.5, gold: 3000, speed: 34 },
    { day: 35, id: 'boss_golem',  base: 'golem',    name: 'Golem-Koloss',    sub: 'Uraltes Bollwerk',        hpTweak: 1.3,  dmgMul: 2.7, size: 2.5, gold: 4200, speed: 28 },
    { day: 40, id: 'boss_demon',  base: 'demon',    name: 'Dämonenfürst',    sub: 'Schatten über Alderian',  hpTweak: 1.1,  dmgMul: 2.8, size: 2.5, gold: 6000, speed: 46 },
    { day: 45, id: 'boss_dragonm',base: 'drakeling',name: 'Drachenmutter',   sub: 'Der Himmel brennt',       hpTweak: 1.15, dmgMul: 2.9, size: 2.8, gold: 8500, speed: 56 },
    { day: 50, id: 'boss_world',  base: 'demon',    name: 'Weltenfresser',   sub: 'Das Ende aller Dinge',    hpTweak: 1.5,  dmgMul: 3.2, size: 3.4, gold: 15000, speed: 40 },
  ];

  // Boss-HP: eigene Kurve, ausgelegt auf ~30–60 s Kampf je nach Ausbau
  function bossHp(day, tweak) {
    let hp = 1550 * Math.pow(1.72, day / 5 - 1);
    if (day > 50) hp = 1550 * Math.pow(1.72, 9) * Math.pow(1.32, (day - 50) / 5);
    return Math.round(hp * (tweak || 1));
  }

  // ---------- Skalierung ----------
  const SCALE = {
    hpMul: d => {
      if (d <= 25) return Math.pow(1.105, d - 1);
      if (d <= 50) return Math.pow(1.105, 24) * Math.pow(1.05, d - 25);
      return Math.pow(1.105, 24) * Math.pow(1.05, 25) * Math.pow(1.035, d - 50);
    },
    dmgMul: d => {
      if (d <= 25) return Math.pow(1.065, d - 1);
      if (d <= 50) return Math.pow(1.065, 24) * Math.pow(1.04, d - 25);
      return Math.pow(1.065, 24) * Math.pow(1.04, 25) * Math.pow(1.03, d - 50);
    },
    goldMul: d => 1 + 0.075 * (d - 1),
    budget: d => {
      if (d === 1) return 8;
      if (d === 2) return 12;
      if (d <= 15) return 13 * Math.pow(1.24, d - 1);
      if (d <= 30) return 13 * Math.pow(1.24, 14) * Math.pow(1.10, d - 15);
      return 13 * Math.pow(1.24, 14) * Math.pow(1.10, 15) * Math.pow(1.06, d - 30);
    },
    eliteChance: d => (d < 12 ? 0 : Math.min(0.18, 0.03 + (d - 12) * 0.006)),
    sizeMul: d => Math.min(1.35, 1 + (d - 1) * 0.006),   // Monster werden mit der Zeit sichtbar größer
  };

  // ---------- Tag/Nacht ----------
  const PHASES = {
    dayLen:  d => (d === 1 ? 50 : Math.min(75, 58 + d * 0.5)),
    nightLen: d => Math.min(95, 46 + d * 1.3),
    duskLen: 5, dawnLen: 5,
  };

  // ---------- Kapitel & Quests (der rote Faden) ----------
  const CHAPTERS = [
    { title: 'Der letzte Funke', text:
`Das Königreich Alderian ist gefallen. Eine Flut aus Monstern hat das Land verschlungen — Städte, Dörfer, Hoffnung.
Nur du stehst noch, junger König, vor den Trümmern der letzten Bastion.
Doch ein einziger Funke genügt, um ein Feuer zu entfachen. Sammle Gold, errichte Verteidigung — und überlebe die Nacht.` },
    { title: 'Glut der Hoffnung', text:
`Dein Wachturm hat die erste Nacht überstanden — und das Land hat es gesehen.
Aus Wäldern und Ruinen kriechen Überlebende hervor. Sie brauchen Arbeit, ein Dach und ein warmes Feuer.
Gib ihnen eine Heimat, und sie geben dir ein Königreich.` },
    { title: 'Stahl und Stein', text:
`Mit Händen allein hält man keine Horde auf.
Entzünde die Esse der alten Schmiede: Es ist Zeit, dass die Klinge des Königs wieder Furcht verbreitet.
In der Tiefe des Sumpfes aber rührt sich etwas Großes — die Schleime haben einen König…` },
    { title: 'Die grüne Flut', text:
`Kriegshörner in den Hügeln: Die Goblin-Stämme haben Blut gerochen.
Sie kommen in Scharen, gierig nach deinem Gold.
Zeig ihnen, dass diese Burg kein Aas ist — sondern ein Amboss.` },
    { title: 'Flüstern im Netz', text:
`Die alten Wälder sind still geworden. Zu still.
Zwischen den Bäumen spannen sich Netze, dick wie Schiffstaue, und in der Dunkelheit klackern tausend Beine.
Die Spinnenkönigin webt an deinem Untergang.` },
    { title: 'Die Totenwacht', text:
`Auf den Schlachtfeldern des gefallenen Reiches erheben sich die Gebeine der Gefallenen.
Ein Knochenfürst schart die Toten um sich — Soldaten, die niemals müde werden.
Frost soll sie brechen, wo Stahl nicht reicht.` },
    { title: 'Kriegstrommeln', text:
`Boom. Boom. Boom. Die Trommeln der Ork-Kriegsherren hallen durch die Berge.
Sie kommen nicht für Gold. Sie kommen für Ruhm — deinen Kopf als Trophäe.
Lass den Himmel selbst für dich kämpfen.` },
    { title: 'Riesen und Schatten', text:
`Die Erde bebt: Trolle, groß wie Türme, und Golems aus uraltem Stein marschieren auf deine Mauern zu.
Was so groß ist, fällt tief — wenn das Feuer heiß genug brennt.
Doch hinter den Riesen wartet etwas noch Älteres…` },
    { title: 'Das brennende Firmament', text:
`Der Nachthimmel färbt sich rot. Dämonen reiten auf Aschewolken, und Drachenschwingen verdunkeln die Sterne.
Dies ist die Stunde, für die du all die Nächte gekämpft hast.
Alderian sieht auf dich, König.` },
    { title: 'Das neue Königreich', text:
`Aus einem Funken wurde ein Feuer. Aus Ruinen eine Festung. Aus Fremden ein Volk.
Nur noch ein Schatten steht zwischen dir und der Morgenröte: der Weltenfresser.
Beende, was in jener ersten Nacht begann.` },
    { title: 'Ewige Wacht', text:
`Der Weltenfresser ist gefallen — doch die Welt bleibt wild und dunkel jenseits deiner Mauern.
Deine Legende wächst mit jeder Nacht, die du bestehst.
Wie lange kann ein König wachen? Zeig es der Ewigkeit.` },
  ];

  // Quest-Typen: gold_collect, build (pad+tier), day, kill (cls), boss, survivors,
  //              weapon, castle, towers_tier {count,tier}
  const QUESTS = [
    // Kapitel 1 — Der letzte Funke
    { ch: 0, type: 'gold_collect', n: 50,  ico: 'coin', text: 'Sammle 50 Münzen',                 reward: 40,  unlock: ['mine_1'] },
    { ch: 0, type: 'build', pad: 'tower_n', tier: 1, ico: 'bow', text: 'Errichte den Wachturm Nord', reward: 50 },
    { ch: 0, type: 'day', n: 2,   ico: 'moon', text: 'Überlebe die erste Nacht',        reward: 80,  unlock: ['tavern_1'] },
    // Kapitel 2 — Glut der Hoffnung
    { ch: 1, type: 'build', pad: 'mine_1', tier: 1, ico: 'pickaxe', text: 'Baue die alte Goldmine wieder auf', reward: 60 },
    { ch: 1, type: 'build', pad: 'tavern_1', tier: 1, ico: 'mug', text: 'Eröffne die Taverne „Zum Funken“', reward: 60 },
    { ch: 1, type: 'survivors', n: 3, ico: 'person', text: 'Nimm 3 Überlebende auf',       reward: 100, unlock: ['forge', 'tower_e', 'markt'] },
    { ch: 1, type: 'day', n: 4,   ico: 'moon', text: 'Überlebe Nacht 3',               reward: 120 },
    // Kapitel 3 — Stahl und Stein
    { ch: 2, type: 'build', pad: 'forge', tier: 1, ico: 'anvil', text: 'Entfache die Schmiede',    reward: 100 },
    { ch: 2, type: 'weapon', tier: 2, ico: 'sword', text: 'Schmiede das Eisenschwert (Schmiede Stufe 2)', reward: 120 },
    { ch: 2, type: 'build', pad: 'tower_n', tier: 3, ico: 'bow', text: 'Wachturm Nord auf Stufe 3', reward: 150 },
    { ch: 2, type: 'boss', boss: 'boss_slime', ico: 'crown', text: 'Besiege den Schleimkönig (Nacht 5)', reward: 400, unlock: ['tower_s', 'tower_w', 'wall'] },
    // Kapitel 4 — Die grüne Flut
    { ch: 3, type: 'build', pad: 'wall', tier: 1, ico: 'wall', text: 'Errichte die Stadtmauer', reward: 150 },
    { ch: 3, type: 'build', pad: 'tower_w', tier: 1, ico: 'cannon', text: 'Errichte den Kanonenturm West', reward: 150 },
    { ch: 3, type: 'kill', cls: 2, n: 60, ico: 'swords', text: 'Besiege 60 Goblins',        reward: 200 },
    { ch: 3, type: 'castle', tier: 2, ico: 'castle', text: 'Baue die Burg auf Stufe 2 aus', reward: 250 },
    { ch: 3, type: 'boss', boss: 'boss_gob', ico: 'crown', text: 'Besiege den Goblin-Häuptling (Nacht 10)', reward: 700, unlock: ['shrine', 'mine_2'] },
    // Kapitel 5 — Flüstern im Netz
    { ch: 4, type: 'build', pad: 'shrine', tier: 1, ico: 'sparkle', text: 'Weihe den Schrein des Lichts', reward: 200 },
    { ch: 4, type: 'build', pad: 'mine_2', tier: 1, ico: 'pickaxe', text: 'Erschließe den Tiefenstollen', reward: 250 },
    { ch: 4, type: 'survivors', n: 8, ico: 'person', text: 'Beherberge 8 Überlebende',   reward: 300, unlock: ['tavern_2'] },
    { ch: 4, type: 'boss', boss: 'boss_spider', ico: 'crown', text: 'Besiege die Spinnenkönigin (Nacht 15)', reward: 1000, unlock: ['tower_ne'] },
    // Kapitel 6 — Die Totenwacht
    { ch: 5, type: 'build', pad: 'tower_ne', tier: 1, ico: 'snow', text: 'Errichte den Frostturm', reward: 300 },
    { ch: 5, type: 'weapon', tier: 4, ico: 'sword', text: 'Schmiede das Ritterschwert (Stufe 4)', reward: 350 },
    { ch: 5, type: 'towers_tier', count: 4, tier: 3, ico: 'shield', text: '4 Türme auf Stufe 3 ausbauen', reward: 450 },
    { ch: 5, type: 'boss', boss: 'boss_bone', ico: 'crown', text: 'Besiege den Knochenfürsten (Nacht 20)', reward: 1500, unlock: ['tower_nw'] },
    // Kapitel 7 — Kriegstrommeln
    { ch: 6, type: 'build', pad: 'tower_nw', tier: 1, ico: 'bolt', text: 'Errichte den Blitzturm', reward: 400 },
    { ch: 6, type: 'castle', tier: 4, ico: 'castle', text: 'Burg auf Stufe 4 ausbauen',   reward: 500 },
    { ch: 6, type: 'survivors', n: 12, ico: 'person', text: 'Beherberge 12 Überlebende', reward: 600 },
    { ch: 6, type: 'boss', boss: 'boss_orc', ico: 'crown', text: 'Besiege den Ork-Kriegsherrn (Nacht 25)', reward: 2200, unlock: ['tower_sw', 'tower_se'] },
    // Kapitel 8 — Riesen und Schatten
    { ch: 7, type: 'build', pad: 'tower_sw', tier: 1, ico: 'flame', text: 'Errichte den Flammenturm', reward: 500 },
    { ch: 7, type: 'kill', cls: 7, n: 25, ico: 'swords', text: 'Besiege 25 Trolle',         reward: 700 },
    { ch: 7, type: 'weapon', tier: 6, ico: 'sword', text: 'Schmiede den Flammenzahn (Stufe 6)', reward: 900 },
    { ch: 7, type: 'build', pad: 'wall', tier: 5, ico: 'wall', text: 'Stadtmauer auf Stufe 5 ausbauen', reward: 1200 },
    { ch: 7, type: 'boss', boss: 'boss_troll', ico: 'crown', text: 'Besiege den Trollkönig (Nacht 30)', reward: 3000 },
    { ch: 7, type: 'boss', boss: 'boss_golem', ico: 'crown', text: 'Zerschmettere den Golem-Koloss (Nacht 35)', reward: 4000 },
    // Kapitel 9 — Das brennende Firmament
    { ch: 8, type: 'castle', tier: 6, ico: 'castle', text: 'Burg auf Stufe 6 ausbauen',  reward: 1200 },
    { ch: 8, type: 'towers_tier', count: 2, tier: 8, ico: 'shield', text: '2 Türme auf Stufe 8 ausbauen', reward: 1500 },
    { ch: 8, type: 'boss', boss: 'boss_demon', ico: 'crown', text: 'Besiege den Dämonenfürsten (Nacht 40)', reward: 5000 },
    { ch: 8, type: 'boss', boss: 'boss_dragonm', ico: 'crown', text: 'Besiege die Drachenmutter (Nacht 45)', reward: 6500 },
    // Kapitel 10 — Das neue Königreich
    { ch: 9, type: 'survivors', n: 20, ico: 'person', text: 'Beherberge 20 Überlebende', reward: 2000 },
    { ch: 9, type: 'castle', tier: 8, ico: 'castle', text: 'Burg auf Stufe 8 ausbauen',  reward: 3000 },
    { ch: 9, type: 'boss', boss: 'boss_world', ico: 'crown', text: 'Vernichte den Weltenfresser (Nacht 50)', reward: 10000, victory: true },
  ];

  // Endlose Quests nach der Hauptgeschichte (Kapitel „Ewige Wacht")
  function endlessQuest(i, state) {
    const kind = i % 4;
    if (kind === 0) {
      const target = Math.max(55, state.day + 5);
      return { ch: 10, type: 'day', n: target, ico: 'moon', text: `Überlebe bis Tag ${target}`, reward: 200 * target };
    }
    if (kind === 1) {
      const n = 150 + Math.floor(i / 4) * 100;
      return { ch: 10, type: 'kill_any', n, ico: 'swords', text: `Besiege ${n} Monster`, reward: 45 * n };
    }
    if (kind === 2) {
      return { ch: 10, type: 'castle', tier: Math.min(10, (state.buildings.castle?.tier || 1) + 1), ico: 'castle', text: 'Baue die Burg weiter aus', reward: 4000 + i * 500 };
    }
    const t = Math.min(10, 8 + Math.floor(i / 8));
    return { ch: 10, type: 'towers_tier', count: Math.min(8, 4 + Math.floor(i / 8)), tier: t, ico: 'shield', text: `${Math.min(8, 4 + Math.floor(i / 8))} Türme auf Stufe ${t}`, reward: 5000 + i * 600 };
  }

  // Quest-Indizes älterer Spielstände (vor Einfügen der Mauer-Quests) übersetzen
  function migrateQuestIdx(oldIdx) {
    if (oldIdx <= 10) return oldIdx;
    if (oldIdx <= 29) return oldIdx + 1;
    return oldIdx + 2;
  }
  const QUEST_VERSION = 2;

  // Morgen-Sprüche
  const DAWN_LINES = [
    'Die Sonne vertreibt die Schatten — für einen Moment.',
    'Ein neuer Tag. Das Königreich atmet auf.',
    'Die Raben zählen die Gefallenen. Du zählst die Münzen.',
    'Noch steht die Burg. Noch weht die Fahne.',
    'Der Morgen gehört den Mutigen.',
    'Asche im Wind — aber Glut im Herzen.',
    'Die Nacht war lang. Dein Wille länger.',
  ];
  const SURVIVOR_LINES = [
    'hat die Schrecken der Wildnis überlebt.',
    'floh drei Nächte durch den Spinnenwald.',
    'bringt Saatgut und zwei müde Hühner mit.',
    'hat von der Burg gehört, die nicht fällt.',
    'schwört dem König die Treue.',
    'sucht Schutz für die Familie.',
  ];
  const SURVIVOR_NAMES = ['Alda', 'Bertram', 'Cedric', 'Doria', 'Edwin', 'Frieda', 'Gunnar', 'Hilda', 'Ivo', 'Jorunn', 'Konrad', 'Lena', 'Magnus', 'Nessa', 'Odo', 'Petra', 'Quirin', 'Runa', 'Sigmund', 'Thea', 'Ulf', 'Vera', 'Wendel', 'Ylva'];

  const VICTORY_TEXT =
`Der Weltenfresser zerfällt zu Asche, und zum ersten Mal seit dem Fall Alderians… ist der Himmel still.
Aus einem einzigen Funken hast du ein Königreich geschmiedet. Die Barden werden singen: vom König, der niemals wich.
Die Wacht geht weiter — die Nächte werden härter, deine Legende größer. Ewige Wacht beginnt.`;

  // ---------- Sonstiges ----------
  const COINS = {
    values: [1, 5, 25, 100],       // Münze, Großmünze, Beutel, Truhe
    magnetSpeed: 620,
    maxOnGround: 220,
    lifetime: 90,                  // Sekunden bis Münzen zu funkeln beginnen (bleiben liegen)
  };

  const DEPOSIT = {
    startRate: 7,     // Münz-Pakete pro Sekunde zu Beginn
    maxRate: 26,      // maximale Paketrate
    rampTime: 3.2,    // Sekunden bis maximale Rate
    chunkPct: 0.02,   // Paketgröße: Anteil der Kosten (min 1)
  };

  const SAVE_KEY = 'kingshot_save_a';
  const SAVE_KEY_B = 'kingshot_save_b';
  const SAVE_VERSION = 1;

  return {
    WORLD, PLAYER, WEAPONS, BUILDINGS, PADS, MONSTERS, BOSSES, bossHp,
    GATES, WALL, MARKET, migrateQuestIdx, QUEST_VERSION,
    SCALE, PHASES, CHAPTERS, QUESTS, endlessQuest,
    DAWN_LINES, SURVIVOR_LINES, SURVIVOR_NAMES, VICTORY_TEXT,
    COINS, DEPOSIT, SAVE_KEY, SAVE_KEY_B, SAVE_VERSION,
    costOf(type, tier) {  // Kosten für Stufe `tier` (1-basiert)
      const b = BUILDINGS[type];
      return Math.round(b.baseCost * Math.pow(b.costMul, tier - 1));
    },
    towerStats(type, tier) {
      const b = BUILDINGS[type];
      return {
        dmg: b.dmg * Math.pow(b.dmgMul, tier - 1),
        rate: b.rate + (b.rateAdd || 0) * (tier - 1),
        range: b.range + (b.rangeAdd || 0) * (tier - 1),
        splash: b.splash ? b.splash + tier * 3 : 0,
        slow: b.slow, slowDur: b.slowDur,
        chain: b.chain ? b.chain + Math.floor((tier - 1) / 3) : 0,
        chainR: b.chainR,
        burn: b.burn ? b.burn * Math.pow(1.4, tier - 1) : 0,
        burnDur: b.burnDur,
        proj: b.proj,
      };
    },
    bossForDay(day) {
      if (day % 5 !== 0) return null;
      const exact = BOSSES.find(b => b.day === day);
      if (exact) return { ...exact, level: 1 };
      // Nach Tag 50: Bosse rotieren, immer stärker
      const idx = ((day - 5) / 5) % BOSSES.length;
      const lvl = Math.floor((day - 5) / 5 / BOSSES.length) + 1;
      const base = BOSSES[idx | 0];
      return {
        ...base, level: lvl + 1,
        name: base.name + ' ' + ['II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][Math.min(8, lvl - 1)],
        dmgMul: base.dmgMul * Math.pow(1.35, lvl),
        gold: Math.round(base.gold * Math.pow(1.8, lvl)),
      };
    },
  };
})();
