/* ============================================================
   KINGSHOT — ui.js
   DOM-HUD: Goldanzeige, Tag/Nacht, Burg-HP, Quest-Karte, Markt,
   Toasts, Banner, Story-/Kapitel-Overlay, Menü, Boss-Leiste,
   Titelbildschirm, Sieg & Niederlage. Alle Symbole sind SVGs.
   ============================================================ */
'use strict';

KS.UI = (() => {
  const U = KS.U, CFG = KS.CFG;
  const $ = id => document.getElementById(id);

  // SVG-Icon aus der Symbolbibliothek
  const icon = (name, cls = 'ico') => `<svg class="${cls}"><use href="#i-${name}"/></svg>`;

  let els = {};
  let bannerTimer = null;
  let lastGold = -1, lastQuestKey = '', lastDay = -1, lastPhase = '';
  let goldBumpT = 0;
  let marketVisible = false, marketRefreshT = 0;
  let hintBuild = false, hintTech = false;

  function init() {
    els = {
      gold: $('gold-txt'), goldPill: $('gold-pill'),
      day: $('day-txt'), phaseIco: $('phase-ico'), phaseFill: $('phase-fill'),
      baseHp: $('base-hp'), baseFill: $('base-hp-fill'), baseTxt: $('base-hp-txt'),
      questCard: $('quest-card'), questCh: $('quest-chapter'), questIco: $('quest-ico'),
      questText: $('quest-text'), questFill: $('quest-prog-fill'), questProgTxt: $('quest-prog-txt'),
      questReward: $('quest-reward-txt'),
      toasts: $('toasts'),
      banner: $('banner'), bannerTitle: $('banner-title'), bannerSub: $('banner-sub'),
      bossBar: $('boss-bar'), bossName: $('boss-name-txt'), bossFill: $('boss-hp-fill'),
      story: $('story'), storyKap: $('story-kapitel'), storyTitle: $('story-title'),
      storyText: $('story-text'), storyBtn: $('story-btn'),
      menu: $('menu'), menuDay: $('menu-day'), statsGrid: $('stats-grid'), chronik: $('chronik-list'),
      title: $('title-screen'), titleInfo: $('title-info'),
      defeat: $('defeat'), defeatTitle: $('defeat-title'), defeatText: $('defeat-text'),
      market: $('market-panel'), marketRows: $('market-rows'),
      marketGold: $('market-gold-txt'), marketCount: $('market-count'),
      actBtn: $('act-btn'), actIco: $('act-ico'), actTitle: $('act-title'),
      actSub: $('act-sub'), actHint: $('act-hint'),
      questToggle: $('quest-toggle'), questTab: $('quest-tab'), questTabProg: $('quest-tab-prog'),
      demoBtn: $('demo-btn'), demoTxt: $('demo-txt'), shopBtn: $('shop-btn'),
      resBar: $('res-bar'), sideBtns: $('side-btns'),
      buildPanel: $('build-panel'), buildRows: $('build-rows'), buildPurse: $('build-purse'),
      techPanel: $('tech-panel'), techRows: $('tech-rows'), techTabs: $('tech-tabs'), techPurse: $('tech-purse'),
      metaPanel: $('meta-panel'), metaRows: $('meta-rows'), metaTabs: $('meta-tabs'),
      metaPurse: $('meta-purse'), metaGain: $('meta-gain'), metaFoot: $('meta-foot'),
      defeatEss: $('defeat-ess'), defeatEnd: $('defeat-end'), defeatEndLbl: $('defeat-end-lbl'),
      metaNext: $('meta-next'), metaNextLbl: $('meta-next-lbl'),
      placeBar: $('place-bar'), placeIco: $('place-ico'), placeName: $('place-name'),
      placeHint: $('place-hint'), placeOk: $('place-ok'),
      sndOn: $('snd-on'), sndOff: $('snd-off'),
    };

    // Ereignis anhängen, aber nur wenn das Element da ist. Bei einem halb
    // aktualisierten Webroot fehlt sonst ein Knopf und das ganze HUD stirbt.
    const wire = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };

    // Buttons
    $('btn-pause').addEventListener('click', () => { KS.Audio.SFX.click(); toggleMenu(); });
    $('btn-sound').addEventListener('click', () => {
      KS.Audio.unlock();
      const on = !(KS.Audio.sfxOn || KS.Audio.musicOn);
      KS.Audio.setSfx(on); KS.Audio.setMusic(on);
      $('opt-sfx').checked = on; $('opt-music').checked = on;
      updateSoundBtn();
      KS.Game.G.state.settings.sfx = on;
      KS.Game.G.state.settings.music = on;
      KS.Game.requestSave();
    });
    $('menu-close').addEventListener('click', () => { KS.Audio.SFX.click(); toggleMenu(false); });
    $('story-btn').addEventListener('click', () => {
      KS.Audio.SFX.click();
      els.story.classList.add('hidden');
      KS.Game.setPaused(false);
    });
    // Aktionsknopf: bauen bestätigen oder Markt öffnen
    els.actBtn.addEventListener('click', e => {
      e.stopPropagation();
      KS.Audio.unlock();
      const G = KS.Game.G;
      const pad = G.nearPad;
      if (!pad) return;
      // Der Markt ist hier kein Sonderfall mehr: der Aktionsknopf baut aus,
      // den Laden öffnet der eigene Knopf daneben. Nur auf der Endstufe, wo
      // es nichts mehr zu bauen gibt, öffnet er den Laden.
      if (pad.type === 'markt' && KS.Systems.padMaxed(G, pad)) openMarket(G);
      else KS.Systems.toggleBuild(G);
      refreshActBtn(G);
    });
    // Abreißen — zwei Tipper, damit es nie versehentlich passiert
    if (els.demoBtn) els.demoBtn.addEventListener('click', e => {
      e.stopPropagation();
      KS.Audio.unlock(); KS.Audio.SFX.click();
      const G = KS.Game.G, pad = G.nearPad;
      if (!pad || !pad.placed) return;
      if (demoArmed === pad.id) {
        demoArmed = null; demoArmT = 0;
        KS.Systems.demolish(G, pad.id);
      } else {
        demoArmed = pad.id; demoArmT = 4;
        const back = KS.Systems.refundOf(G, pad.id);
        toast(`${pad.label} abreißen? Du bekommst ${U.fmt(back)} Gold zurück — noch einmal tippen.`, 3800, 'trash');
      }
      lastDemoKey = '';
    });
    // Shop am Markt öffnen
    if (els.shopBtn) els.shopBtn.addEventListener('click', e => {
      e.stopPropagation();
      KS.Audio.unlock(); KS.Audio.SFX.click();
      openMarket(KS.Game.G);
    });
    // Bauen & Forschung
    wire('btn-build', 'click', () => { KS.Audio.unlock(); KS.Audio.SFX.click(); openBuild(KS.Game.G); });
    wire('btn-tech', 'click', () => { KS.Audio.unlock(); KS.Audio.SFX.click(); openTech(KS.Game.G); });
    wire('build-close', 'click', () => { KS.Audio.SFX.click(); closeBuild(); });
    wire('tech-close', 'click', () => { KS.Audio.SFX.click(); closeTech(); });
    if (els.buildPanel) els.buildPanel.addEventListener('click', e => { if (e.target === els.buildPanel) closeBuild(); });
    if (els.techPanel) els.techPanel.addEventListener('click', e => { if (e.target === els.techPanel) closeTech(); });
    // Gebäude wählen → Baumodus
    if (els.buildRows) els.buildRows.addEventListener('click', e => {
      const btn = e.target.closest('.bd-pick');
      if (!btn) return;
      KS.Audio.SFX.click();
      const type = btn.dataset.type;
      closeBuild();
      KS.Game.startPlaceMode(type);
    });
    // Forschung kaufen
    if (els.techRows) els.techRows.addEventListener('click', e => {
      const btn = e.target.closest('.tt-buy');
      if (!btn || btn.classList.contains('max')) return;
      if (KS.Systems.buyTech(KS.Game.G, btn.dataset.id)) renderTech(KS.Game.G);
      else renderTech(KS.Game.G);
    });
    if (els.techTabs) els.techTabs.addEventListener('click', e => {
      const tab = e.target.closest('.tt-tab');
      if (!tab) return;
      KS.Audio.SFX.click();
      techBranch = tab.dataset.br;
      renderTech(KS.Game.G);
    });
    // Sternenbaum. Er ist bewusst NUR nach einem beendeten Lauf erreichbar
    // und hat keinen Schließen-Knopf: der einzige Ausgang ist der nächste Lauf.
    wire('meta-next', 'click', () => {
      KS.Audio.unlock(); KS.Audio.SFX.build();
      KS.Game.startNextRun();
    });
    if (els.metaRows) els.metaRows.addEventListener('click', e => {
      const btn = e.target.closest('.mn-buy');
      if (!btn || btn.classList.contains('max')) return;
      buyMeta(KS.Game.G, btn.dataset.id);
    });
    if (els.metaTabs) els.metaTabs.addEventListener('click', e => {
      const tab = e.target.closest('.mt-tab');
      if (!tab) return;
      KS.Audio.SFX.click();
      metaBranch = tab.dataset.br;
      renderMeta(KS.Game.G);
    });
    // Ernte — nach einer Niederlage und (freiwillig) aus dem Menü
    wire('defeat-end', 'click', () => { KS.Audio.SFX.click(); hideDefeat(); KS.Game.harvestRun(); });
    wire('btn-endrun', 'click', () => {
      KS.Audio.SFX.click();
      const r = KS.Game.pendingEssence();
      if (!confirm(`Diesen Lauf jetzt aufgeben?\n\nDu bekommst ${U.fmt(r.total)} Weltenessenz und beginnst danach von vorn.`)) return;
      toggleMenu(false);
      KS.Game.harvestRun();
    });
    // Platzierungsleiste
    wire('place-cancel', 'click', () => { KS.Audio.SFX.click(); KS.Game.cancelPlaceMode(); });
    if (els.placeOk) els.placeOk.addEventListener('click', () => { KS.Game.confirmPlaceMode(); });

    // Markt schließen
    const closeM = () => { KS.Audio.SFX.click(); closeMarket(); };
    $('market-close').addEventListener('click', closeM);
    $('market-done').addEventListener('click', closeM);
    els.market.addEventListener('click', e => { if (e.target === els.market) closeM(); });
    // Menü-Tabs
    document.querySelectorAll('.mtab').forEach(tab => {
      tab.addEventListener('click', () => {
        KS.Audio.SFX.click();
        document.querySelectorAll('.mtab').forEach(t => t.classList.toggle('active', t === tab));
        document.querySelectorAll('.mtab-page').forEach(p => p.classList.add('hidden'));
        $('mtab-' + tab.dataset.tab).classList.remove('hidden');
        if (tab.dataset.tab === 'stats') renderStats();
        if (tab.dataset.tab === 'chronik') renderChronik();
      });
    });
    // Optionen
    $('opt-sfx').addEventListener('change', e => {
      KS.Audio.setSfx(e.target.checked);
      KS.Game.G.state.settings.sfx = e.target.checked;
      updateSoundBtn(); KS.Game.requestSave();
    });
    $('opt-music').addEventListener('change', e => {
      KS.Audio.setMusic(e.target.checked);
      KS.Game.G.state.settings.music = e.target.checked;
      updateSoundBtn(); KS.Game.requestSave();
    });
    $('opt-shake').addEventListener('change', e => {
      KS.Game.G.state.settings.shake = e.target.checked;
      KS.Game.requestSave();
    });
    $('btn-export').addEventListener('click', exportSave);
    $('btn-import').addEventListener('click', importSave);
    $('btn-reset').addEventListener('click', () => {
      if (confirm('Wirklich ganz von vorn beginnen? Dein gesamter Fortschritt geht verloren!')) {
        KS.Game.hardReset();
      }
    });
    // Quest-Symbol antippen → Ziel auf der Karte hervorheben
    // (die Karte selbst lässt Wischgesten durch, damit der Joystick überall geht)
    els.questIco.addEventListener('click', e => {
      e.stopPropagation();
      KS.Audio.SFX.click();
      KS.Game.pingQuestTarget();
    });
    // Quest-Karte ein-/ausklappen (gibt den Daumenbereich für den Joystick frei)
    els.questToggle.addEventListener('click', e => {
      e.stopPropagation();
      KS.Audio.SFX.click();
      setQuestCollapsed(true);
    });
    els.questTab.addEventListener('click', e => {
      e.stopPropagation();
      KS.Audio.SFX.click();
      setQuestCollapsed(false);
    });
    // Markt: Kauf-Klicks (delegiert)
    els.marketRows.addEventListener('click', e => {
      const btn = e.target.closest('.mk-buy');
      if (!btn || btn.classList.contains('max')) return;
      KS.Systems.buyMarket(KS.Game.G, btn.dataset.track);
      renderMarketRows(KS.Game.G);
      els.marketGold.textContent = U.fmt(KS.Game.G.state.gold);
    });
    // Escape schließt Vollbildfenster bzw. bricht das Platzieren ab
    window.addEventListener('keydown', e => {
      if (e.code !== 'Escape') return;
      if (marketVisible) { e.preventDefault(); closeMarket(); }
      else if (buildVisible) { e.preventDefault(); closeBuild(); }
      else if (techVisible) { e.preventDefault(); closeTech(); }
      else if (KS.Game.G && KS.Game.G.placeMode) { e.preventDefault(); KS.Game.cancelPlaceMode(); }
    });
  }

  function updateSoundBtn() {
    const on = KS.Audio.sfxOn || KS.Audio.musicOn;
    els.sndOn.classList.toggle('hidden', !on);
    els.sndOff.classList.toggle('hidden', on);
  }

  // ---------- Titelbildschirm ----------
  function showTitle(hasSave, state) {
    els.title.classList.remove('hidden');
    const btnNew = $('btn-new'), btnCont = $('btn-continue');
    if (hasSave) {
      const ch = CFG.CHAPTERS[Math.min(Math.max(0, state.chapterShown), CFG.CHAPTERS.length - 1)];
      els.titleInfo.innerHTML =
        `Tag ${state.day} · Kapitel ${state.chapterShown + 1} „${ch.title}“<br>` +
        `${icon('coin')} ${U.fmt(state.gold)} &nbsp;·&nbsp; ${icon('person')} ${state.survivors} &nbsp;·&nbsp; ${icon('swords')} ${U.fmt(state.stats.kills)} Siege`;
      // Zwischen zwei Läufen führt der Weg zuerst in den Sternenbaum
      btnCont.innerHTML = state.runEnded
        ? `${icon('sparkle')} Sternenbaum öffnen`
        : `${icon('play')} Weiterspielen`;
      btnNew.classList.remove('hidden');
    } else {
      els.titleInfo.textContent = 'Das Königreich Alderian braucht dich, König!';
      btnCont.innerHTML = `${icon('swords')} Abenteuer beginnen`;
      btnNew.classList.add('hidden');
    }
  }
  function hideTitle() { els.title.classList.add('hidden'); }

  // ---------- Laufende HUD-Aktualisierung ----------
  function bumpGold() { goldBumpT = 0.05; }

  function update(G, dt) {
    const st = G.state;
    // Gold
    if (st.gold !== lastGold) {
      els.gold.textContent = U.fmt(st.gold);
      lastGold = st.gold;
    }
    if (goldBumpT > 0) {
      goldBumpT -= dt;
      if (!els.goldPill.classList.contains('bump')) {
        els.goldPill.classList.add('bump');
        setTimeout(() => els.goldPill.classList.remove('bump'), 230);
      }
    }
    // Tag & Phase
    if (st.day !== lastDay || st.phase !== lastPhase) {
      els.day.textContent = (st.phase === 'night' ? 'Nacht ' : 'Tag ') + st.day;
      els.phaseIco.innerHTML = `<use href="#i-${st.phase === 'night' ? 'moon' : 'sun'}"/>`;
      els.phaseIco.style.color = st.phase === 'night' ? '#9db4ff' : '#ffd34e';
      lastDay = st.day; lastPhase = st.phase;
    }
    const len = st.phase === 'night' ? CFG.PHASES.nightLen(st.day) : CFG.PHASES.dayLen(st.day);
    els.phaseFill.style.width = Math.min(100, st.phaseT / len * 100) + '%';
    els.phaseFill.style.background = st.phase === 'night'
      ? 'linear-gradient(90deg,#7a9cff,#b48cff)' : 'linear-gradient(90deg,#ffd34e,#ff9d2e)';
    // Burg-HP
    const pct = Math.max(0, st.baseHp / G.baseHpMax);
    els.baseFill.style.width = (pct * 100) + '%';
    els.baseTxt.textContent = U.fmt(Math.ceil(st.baseHp)) + '/' + U.fmt(G.baseHpMax);
    els.baseHp.classList.toggle('danger', pct < 0.35);
    // Boss
    if (G.boss && !G.boss.dead) {
      els.bossFill.style.width = Math.max(0, G.boss.hp / G.boss.hpMax * 100) + '%';
    }
    // Quest
    const q = KS.Systems.activeQuest(G);
    if (q) {
      const [cur, max] = KS.Systems.questProgress(G, q);
      const key = (st.questIdx >= CFG.QUESTS.length ? 'e' + st.endlessIdx : st.questIdx) + ':' + q.text;
      if (key !== lastQuestKey) {
        lastQuestKey = key;
        els.questCh.textContent = `Kapitel ${q.ch + 1} · ${CFG.CHAPTERS[Math.min(q.ch, CFG.CHAPTERS.length - 1)].title}`;
        els.questIco.innerHTML = icon(q.ico || 'scroll');
        els.questText.textContent = q.text;
        els.questReward.textContent = U.fmt(q.reward);
      }
      els.questFill.style.width = (max > 0 ? cur / max * 100 : 0) + '%';
      els.questProgTxt.textContent = max > 1 ? `${U.fmt(cur)} / ${U.fmt(max)}` : (cur >= max ? '✓' : '…');
      // Eingeklappt: Fortschritt kompakt am Reiter zeigen
      if (questCollapsed) {
        els.questTabProg.textContent = max > 1 ? `${U.fmt(cur)}/${U.fmt(max)}` : 'Quest';
      }
    }
    // Rohstoffe
    if (els.resBar) updateResBar(G);
    // Abriss-Knopf
    if (els.demoBtn) refreshDemoBtn(G, dt);
    // Shop-Knopf am Markt
    if (els.shopBtn) {
      const pad = G.nearPad;
      const zeig = !!pad && pad.type === 'markt' && !G.playerDown && !anyPanelOpen() && !G.placeMode
        && (G.state.buildings.markt || {}).tier >= 1;
      els.shopBtn.classList.toggle('hidden', !zeig);
    }
    // Markt-Preise regelmäßig auffrischen (Kaufkraft-Anzeige)
    if (marketVisible) {
      marketRefreshT -= dt;
      if (marketRefreshT <= 0) {
        marketRefreshT = 0.4;
        refreshMarketAfford(G);
        els.marketGold.textContent = U.fmt(st.gold);
      }
    }
    // Bau-/Forschungsknöpfe verstecken, solange ein Bauplatz-Knopf im Weg wäre
    if (els.sideBtns) {
      els.sideBtns.classList.toggle('hidden-soft', !!G.placeMode || !!G.nearPad || G.playerDown);
      // Verlangt die Quest ein neues Gebäude oder eine Forschung? Dann darf der
      // passende Knopf ruhig auf sich aufmerksam machen.
      const wantBuild = !!q && (q.type === 'place' || q.type === 'res');
      const wantTech = !!q && q.type === 'tech';
      if (wantBuild !== hintBuild) { hintBuild = wantBuild; $('btn-build').classList.toggle('nudge', wantBuild); }
      if (wantTech !== hintTech) { hintTech = wantTech; $('btn-tech').classList.toggle('nudge', wantTech); }
    }
    // Aktionsknopf am Bauplatz
    refreshActBtn(G);
  }

  // ---------- Quest-Karte ein-/ausklappen ----------
  let questCollapsed = false;

  function setQuestCollapsed(v) {
    questCollapsed = v;
    els.questCard.classList.toggle('collapsed', v);
    els.questTab.classList.toggle('hidden', !v);
    const st = KS.Game.G && KS.Game.G.state;
    if (st) { st.settings.questCollapsed = v; KS.Game.requestSave(); }
    lastQuestKey = '';   // Anzeige beim Aufklappen neu füllen
  }

  function applyQuestCollapsed(st) {
    setQuestCollapsed(!!(st.settings && st.settings.questCollapsed));
  }

  // ---------- Aktionsknopf ----------
  // Erscheint nur, wenn der König an einem Bauplatz steht. Ohne Druck auf
  // diesen Knopf fließt kein einziges Goldstück — Vorbeilaufen tut nichts.
  let lastActKey = '';

  function refreshActBtn(G) {
    const pad = G.nearPad;
    if (!pad || G.playerDown || anyPanelOpen() || G.placeMode) {
      if (!els.actBtn.classList.contains('hidden')) {
        els.actBtn.classList.add('hidden');
        els.questCard.classList.remove('raised');
        els.questTab.classList.remove('raised');
        lastActKey = '';
      }
      return;
    }
    const st = G.state;
    const def = CFG.BUILDINGS[pad.type];
    const b = st.buildings[pad.id] || { tier: 0, prog: 0 };
    const maxed = b.tier >= def.tiers;
    // Der Markt wurde bisher NUR geöffnet — ausbauen war dadurch unmöglich.
    // Jetzt baut der Aktionsknopf wie überall aus; den Shop öffnet ein
    // zweiter Knopf daneben. Nur auf der Maximalstufe übernimmt der große
    // Knopf wieder das Öffnen.
    const isMarket = pad.type === 'markt' && b.tier >= 1 && maxed;
    const running = G.buildArmed === pad.id;
    const cost = maxed ? 0 : CFG.costOf(pad.type, b.tier + 1);
    const rest = Math.max(0, cost - b.prog);

    let title, sub, hint, ico;
    if (isMarket) {
      title = 'Markt öffnen';
      sub = 'Dauerhafte Verbesserungen';
      hint = 'Tippen';
      ico = 'market';
    } else if (maxed) {
      title = `${pad.label}`;
      sub = 'Maximalstufe erreicht';
      hint = '';
      ico = 'check';
    } else if (G.buildLock === pad.id) {
      // Eine Stufe pro Besuch — erst weggehen, dann geht die nächste
      title = `${pad.label} · Stufe ${b.tier}`;
      sub = 'Weggehen und wiederkommen für die nächste Stufe';
      hint = '';
      ico = 'check';
    } else {
      title = b.tier === 0 ? `${pad.label} bauen` : `${pad.label} → Stufe ${b.tier + 1}`;
      sub = `<span class="coin-ico"></span>${U.fmt(rest)}${b.prog > 0 ? ` von ${U.fmt(cost)}` : ''}`;
      hint = running ? 'Stop' : 'Tippen';
      ico = running ? 'hammer' : def.ico;
    }
    const key = `${pad.id}|${b.tier}|${running}|${maxed}|${rest}|${isMarket}|${G.buildLock === pad.id}`;
    if (key !== lastActKey) {
      lastActKey = key;
      els.actIco.innerHTML = icon(ico);
      els.actTitle.textContent = title;
      els.actSub.innerHTML = sub;
      els.actHint.textContent = hint;
    }
    const locked = G.buildLock === pad.id || maxed;
    els.actBtn.classList.toggle('running', running);
    els.actBtn.classList.toggle('done', locked);
    els.actBtn.classList.toggle('broke', !locked && !isMarket && st.gold <= 0 && !running);
    if (els.actBtn.classList.contains('hidden')) {
      els.actBtn.classList.remove('hidden');
      els.questCard.classList.add('raised');
      els.questTab.classList.add('raised');
    }
  }

  // ---------- Abreißen ----------
  // Nur an selbst gesetzten Gebäuden. Der erste Tipper fragt nach, der
  // zweite reißt ab — so kostet ein Fehlgriff nichts.
  let demoArmed = null, demoArmT = 0, lastDemoKey = '';

  function refreshDemoBtn(G, dt) {
    const pad = G.nearPad;
    const show = pad && pad.placed && !G.playerDown && !anyPanelOpen() && !G.placeMode;
    if (!show) {
      if (!els.demoBtn.classList.contains('hidden')) {
        els.demoBtn.classList.add('hidden');
        els.demoBtn.classList.remove('armed');
      }
      if (demoArmed) { demoArmed = null; demoArmT = 0; lastDemoKey = ''; }
      return;
    }
    if (demoArmed && demoArmed !== pad.id) { demoArmed = null; demoArmT = 0; }
    if (demoArmT > 0) {
      demoArmT -= dt;
      if (demoArmT <= 0) { demoArmed = null; lastDemoKey = ''; }
    }
    const armed = demoArmed === pad.id;
    const key = pad.id + '|' + armed;
    if (key !== lastDemoKey) {
      lastDemoKey = key;
      els.demoTxt.textContent = armed ? 'Wirklich?' : 'Abreißen';
      els.demoBtn.classList.toggle('armed', armed);
    }
    els.demoBtn.classList.remove('hidden');
  }

  // ---------- Markt (Vollbild, pausiert das Spiel) ----------
  function openMarket(G) {
    if (marketVisible) return;
    marketVisible = true;
    renderMarketRows(G);
    els.marketGold.textContent = U.fmt(G.state.gold);
    els.market.classList.remove('hidden');
    els.actBtn.classList.add('hidden');
    els.questCard.classList.remove('raised');
    els.questTab.classList.remove('raised');
    lastActKey = '';
    KS.Game.setPaused(true);      // Welt ruht — niemand greift an
  }

  function closeMarket() {
    if (!marketVisible) return;
    marketVisible = false;
    els.market.classList.add('hidden');
    resumeIfClear();
  }

  function isMarketOpen() { return marketVisible; }

  function renderMarketRows(G) {
    const st = G.state;
    const b = st.buildings.markt;
    const slots = b && b.tier >= 1 ? CFG.BUILDINGS.markt.slots(b.tier) : 0;
    const offen = Math.min(slots, CFG.MARKET.length);
    const rows = [];
    let grp = '';
    for (let i = 0; i < offen; i++) {
      const t = CFG.MARKET[i];
      const lvl = KS.Systems.marketLvl(G, t.id);
      const maxed = lvl >= t.max;
      const cost = maxed ? 0 : KS.Systems.marketCost(G, t, lvl);
      const g = CFG.MARKET_GRP[t.grp] || { name: '' };
      rows.push(`
        <div class="mk-row">
          <div class="mk-ico">${icon(t.ico)}</div>
          <div class="mk-body">
            <div class="mk-name">${t.name}
              <span class="mk-grp mk-g-${t.grp}">${g.name}</span>
              <span class="mk-lvl">${lvl}/${t.max}</span></div>
            <div class="mk-desc">${t.desc}</div>
          </div>
          <button class="mk-buy${maxed ? ' max' : ''}" data-track="${t.id}" data-cost="${cost}">
            ${maxed ? 'MAX' : `<span class="coin-ico"></span>${U.fmt(cost)}`}
          </button>
        </div>`);
    }
    // Was der nächste Marktausbau bringt — dafür baut man ihn ja aus
    if (offen < CFG.MARKET.length) {
      const naechste = CFG.MARKET[offen];
      const def = CFG.BUILDINGS.markt;
      let bis = (b ? b.tier : 0) + 1;
      while (bis <= def.tiers && def.slots(bis) <= offen) bis++;
      rows.push(`
        <div class="mk-locked">
          <div class="mk-ico locked">${icon('lock')}</div>
          <div class="mk-body">
            <div class="mk-name">${naechste.name}</div>
            <div class="mk-desc">${naechste.desc}</div>
            <div class="mk-need">${icon('market')} Markt auf Stufe ${bis} ausbauen
              — dann liegen ${CFG.MARKET.length - offen} weitere Waren bereit</div>
          </div>
        </div>`);
    }
    els.marketRows.innerHTML = rows.join('');
    if (els.marketCount) {
      els.marketCount.textContent = `${offen} von ${CFG.MARKET.length} Waren`;
    }
    refreshMarketAfford(G);
  }

  function refreshMarketAfford(G) {
    els.marketRows.querySelectorAll('.mk-buy').forEach(btn => {
      if (btn.classList.contains('max')) return;
      btn.classList.toggle('broke', G.state.gold < Number(btn.dataset.cost));
    });
  }

  // ---------- Rohstoffleiste ----------
  // Erscheint erst, wenn ein Lager steht — vorher gibt es nichts zu zeigen.
  let lastResKey = '';

  function updateResBar(G) {
    // Der Bann der Leere gehört dauerhaft ins Bild: er erklärt, warum die
    // Nächte härter werden, und wofür man Weltenessenz ausgibt.
    // Direkt aus dem Tag gerechnet, nicht aus einem Zwischenwert: so stimmt
    // die Anzeige auch, wenn der Tag ohne Neuberechnung gewechselt hat.
    const vt = CFG.SCALE.voidTier(G.state.day, G.voidDelay || 0);
    const vm = CFG.SCALE.voidMul(G.state.day, G.voidDelay || 0);
    const bann = vt > 0
      ? `<span class="res-pill res-bann" title="Bann der Leere">${icon('skull')}` +
        `<b>${vt}</b><span class="cap">×${vm < 100 ? vm.toFixed(1) : Math.round(vm)}</span></span>` : '';
    if (!G.storeCap) {
      if (bann) {
        if (els.resBar.innerHTML !== bann) { els.resBar.innerHTML = bann; lastResKey = 'b' + bann; }
        els.resBar.classList.remove('hidden');
        return;
      }
      if (!els.resBar.classList.contains('hidden')) {
        els.resBar.classList.add('hidden');
        els.resBar.innerHTML = '';
        lastResKey = '';
      }
      return;
    }
    const parts = [], keys = [];
    for (const r of CFG.RES_ORDER) {
      const have = KS.Systems.storeTotal(G, r);
      const full = have >= G.storeCap;
      keys.push(have + (full ? 'f' : ''));
      parts.push(
        `<span class="res-pill res-${r}${full ? ' full' : ''}">` +
        `${icon(CFG.RESOURCES[r].ico)}${U.fmt(have)}` +
        `<span class="cap">/${U.fmt(G.storeCap)}</span></span>`
      );
    }
    if (bann) parts.push(bann);
    const key = G.storeCap + '|' + keys.join(',') + '|' + bann;
    if (key !== lastResKey) {
      lastResKey = key;
      els.resBar.innerHTML = parts.join('');
    }
    els.resBar.classList.remove('hidden');
  }

  // Gold + Rohstoffe als Kopfzeile eines Menüs
  function purseHtml(G) {
    let html = `<span class="purse-pill"><span class="coin-ico"></span>${U.fmt(G.state.gold)}</span>`;
    if (G.storeCap) {
      for (const r of CFG.RES_ORDER) {
        html += `<span class="purse-pill res-${r}">` +
                `${icon(CFG.RESOURCES[r].ico)}${U.fmt(KS.Systems.storeTotal(G, r))}</span>`;
      }
    }
    return html;
  }

  // ---------- Bau-Menü (Vollbild, pausiert das Spiel) ----------
  let buildVisible = false;

  // Was das Gebäude auf Stufe 1 leistet — konkrete Zahlen sagen mehr als Worte
  function buildStats(def) {
    const rn = def.res ? CFG.RESOURCES[def.res].name : '';
    const cls = def.res ? ` class="res-${def.res}"` : '';
    if (def.kind === 'store') return `Platz für <b>${U.fmt(def.cap(1))}</b> je Rohstoff`;
    if (def.kind === 'gather') {
      return `<b${cls}>${rn}</b> · ${def.workers(1)} Arbeiter · ${U.fmt(def.load(1))}/Fuhre`;
    }
    if (def.kind === 'craft') {
      const s = def.interval(1).toFixed(1).replace('.', ',');
      return `<b${cls}>${U.fmt(def.batch(1))} ${rn}</b> → <b>${U.fmt(def.gold(1))} Gold</b> (${s} s)`;
    }
    return '';
  }

  function openBuild(G) {
    if (buildVisible || G.placeMode || !els.buildPanel) return;
    buildVisible = true;
    renderBuild(G);
    els.buildPanel.classList.remove('hidden');
    els.actBtn.classList.add('hidden');
    els.questCard.classList.remove('raised');
    els.questTab.classList.remove('raised');
    lastActKey = '';
    KS.Game.setPaused(true);
  }

  function closeBuild() {
    if (!buildVisible) return;
    buildVisible = false;
    els.buildPanel.classList.add('hidden');
    resumeIfClear();
  }

  function renderBuild(G) {
    const st = G.state;
    els.buildPurse.innerHTML = purseHtml(G);
    const rows = KS.Systems.placeableTypes(G).map(({ type, def }) => {
      const built = (st.placed || []).filter(p => p.type === type).length;
      const cost = KS.Systems.placeCost(G, type);
      const broke = st.gold < cost;
      const stats = buildStats(def);
      return `
        <div class="bd-row">
          <div class="bd-ico">${icon(def.ico)}</div>
          <div class="bd-body">
            <div class="bd-name">${def.name}${built ? ` <span class="mk-lvl">${built}×</span>` : ''}</div>
            ${stats ? `<div class="bd-stats">${stats}</div>` : ''}
            <div class="bd-desc">${def.desc}</div>
          </div>
          <button class="bd-pick${broke ? ' broke' : ''}" data-type="${type}">
            <span class="coin-ico"></span>${U.fmt(cost)}
          </button>
        </div>`;
    });
    if (!G.storeCap) {
      rows.unshift(`<div class="bd-row"><div class="bd-desc">${icon('crate')} ` +
        `Baue zuerst ein <b>Lager</b> — erst dann haben Rohstoffe einen Platz.</div></div>`);
    }
    els.buildRows.innerHTML = rows.join('');
  }

  function isBuildOpen() { return buildVisible; }

  // ---------- Techtree (Vollbild, pausiert das Spiel) ----------
  let techVisible = false;
  let techBranch = 'eco';

  function openTech(G) {
    if (techVisible || G.placeMode || !els.techPanel) return;
    techVisible = true;
    renderTech(G);
    els.techPanel.classList.remove('hidden');
    els.actBtn.classList.add('hidden');
    els.questCard.classList.remove('raised');
    els.questTab.classList.remove('raised');
    lastActKey = '';
    KS.Game.setPaused(true);
  }

  function closeTech() {
    if (!techVisible) return;
    techVisible = false;
    els.techPanel.classList.add('hidden');
    resumeIfClear();
  }

  function renderTech(G) {
    const st = G.state;
    els.techPurse.innerHTML = purseHtml(G);
    // Reiter je Zweig, mit Fortschrittszähler
    els.techTabs.innerHTML = Object.entries(CFG.TECH_BRANCHES).map(([br, b]) => {
      const nodes = CFG.TECH.filter(t => t.br === br);
      const done = nodes.filter(t => st.tech && st.tech[t.id]).length;
      return `<button class="tt-tab${br === techBranch ? ' active' : ''}" data-br="${br}">` +
             `<span class="tt-tab-name">${icon(b.ico)}${b.name}</span>` +
             `<span class="tt-tab-cnt">${done}/${nodes.length}</span></button>`;
    }).join('');
    // Knoten des aktiven Zweigs, nach Stufe gruppiert
    const nodes = CFG.TECH.filter(t => t.br === techBranch);
    const tiers = [...new Set(nodes.map(t => t.tier))].sort((a, b) => a - b);
    const html = [];
    for (const tier of tiers) {
      html.push(`<div class="tt-tier"><div class="tt-tier-label">Stufe ${tier}</div>`);
      for (const node of nodes.filter(t => t.tier === tier)) {
        const state = KS.Systems.techState(G, node);
        const done = state === 'done', locked = state === 'locked';
        // Fehlende Voraussetzungen als eigene Zeile
        let needLine = '';
        if (locked) {
          const need = node.req.filter(r => !(st.tech && st.tech[r]))
            .map(r => (KS.Systems.techNode(r) || {}).name).filter(Boolean);
          needLine = `<div class="tt-need">${icon('lock')}${need.join(' + ')}</div>`;
        }
        // Kostenzeile: Gold plus optionale Rohstoffe
        let resLine = '';
        if (node.res && !done) {
          resLine = '<div class="tt-res">' + Object.entries(node.res).map(([r, n]) => {
            const miss = KS.Systems.storeTotal(G, r) < n;
            return `<span class="${miss ? 'miss' : ''}">${icon(CFG.RESOURCES[r].ico)}${U.fmt(n)}</span>`;
          }).join('') + '</div>';
        }
        const broke = !done && !locked && !KS.Systems.techAffordable(G, node);
        const btn = done
          ? `<button class="tt-buy max">${icon('check')}</button>`
          : `<button class="tt-buy${broke ? ' broke' : ''}" data-id="${node.id}">` +
            `<span class="coin-ico"></span>${U.fmt(node.gold)}</button>`;
        html.push(`
          <div class="tt-row${done ? ' done' : locked ? ' locked' : ''}">
            <div class="tt-ico">${icon(done ? 'check' : node.ico)}</div>
            <div class="tt-body">
              <div class="tt-name">${node.name}</div>
              <div class="tt-desc">${node.desc}</div>
              ${needLine}${resLine}
            </div>
            ${btn}
          </div>`);
      }
      html.push('</div>');
    }
    els.techRows.innerHTML = html.join('');
  }

  function isTechOpen() { return techVisible; }

  // ---------- Sternenbaum (Weltenessenz) ----------
  let metaVisible = false;
  let metaBranch = 'macht';

  function openMeta(G, gain) {
    if (!els.metaPanel) return;
    metaVisible = true;
    if (marketVisible) closeMarket();
    if (buildVisible) closeBuild();
    if (techVisible) closeTech();
    els.menu.classList.add('hidden');
    metaGain = gain || null;
    renderMeta(G);
    els.metaPanel.classList.remove('hidden');
    els.actBtn.classList.add('hidden');
    els.questCard.classList.remove('raised');
    els.questTab.classList.remove('raised');
    lastActKey = '';
    KS.Game.setPaused(true);
    if (gain) KS.Audio.SFX.essence();
  }

  function closeMeta() {
    if (!metaVisible) return;
    metaVisible = false;
    metaGain = null;
    els.metaPanel.classList.add('hidden');
    resumeIfClear();
  }

  function isMetaOpen() { return metaVisible; }
  let metaGain = null;

  function renderMeta(G) {
    const st = G.state;
    const lvl = id => (st.meta && st.meta[id]) || 0;

    // Ausbeute des gerade beendeten Laufs
    if (els.metaGain) {
      if (metaGain) {
        const b = metaGain.bonus > 0
          ? `<div class="mg-line">Grundwert ${U.fmt(metaGain.roh)} + Sternendeuter ${U.fmt(metaGain.bonus)}</div>` : '';
        const tag = metaGain.day || st.runBest || 0;
        const bos = metaGain.bosses !== undefined ? metaGain.bosses : (st.runBossBest || 0);
        els.metaGain.innerHTML =
          `<div class="mg-top">${icon('sparkle')}+${U.fmt(metaGain.total)} Weltenessenz geborgen</div>` +
          `<div class="mg-line">Lauf ${st.runs || 1}: ${tag} ${tag === 1 ? 'Tag' : 'Tage'} überlebt, ` +
          `${bos} ${bos === 1 ? 'Boss' : 'Bosse'} gefallen.</div>${b}`;
        els.metaGain.classList.remove('hidden');
      } else {
        els.metaGain.classList.add('hidden');
      }
    }

    // Börse
    const total = CFG.META.reduce((a, n) => a + n.lvl, 0);
    const owned = CFG.META.reduce((a, n) => a + lvl(n.id), 0);
    els.metaPurse.innerHTML =
      `<div><div class="mp-lbl">Weltenessenz</div>` +
      `<div class="mp-val">${icon('sparkle')}${U.fmt(st.essence || 0)}</div></div>` +
      `<div class="mp-runs">${st.runs || 0} ${(st.runs || 0) === 1 ? 'Lauf' : 'Läufe'} · bester Tag ${st.runBest || 0}<br>` +
      `${owned}/${total} Segnungen · ${U.fmt(st.essenceTotal || 0)} je geborgen</div>`;

    // Reiter je Zweig
    els.metaTabs.innerHTML = Object.entries(CFG.META_BRANCHES).map(([br, b]) => {
      const nodes = CFG.META.filter(n => n.br === br);
      const have = nodes.reduce((a, n) => a + lvl(n.id), 0);
      const max = nodes.reduce((a, n) => a + n.lvl, 0);
      return `<button class="mt-tab br-${br}${br === metaBranch ? ' active' : ''}" data-br="${br}">` +
             `${icon(b.ico)}<span class="mt-name">${b.name}</span>` +
             `<span class="mt-cnt">${have}/${max}</span></button>`;
    }).join('');

    // Knoten des aktiven Zweigs
    const html = [];
    for (const node of CFG.META.filter(n => n.br === metaBranch)) {
      const l = lvl(node.id);
      const maxed = l >= node.lvl;
      const cost = maxed ? 0 : CFG.metaCost(node, l);
      const broke = !maxed && (st.essence || 0) < cost;
      const pips = Array.from({ length: node.lvl },
        (_, i) => `<span class="mn-pip${i < l ? ' on' : ''}"></span>`).join('');
      const jetzt = l > 0 ? `<div class="mn-desc">Jetzt: ${node.desc(l)}</div>` : '';
      const naechste = maxed ? '' : `<div class="mn-next">Nächste Stufe: ${node.desc(l + 1)}</div>`;
      const btn = maxed
        ? `<button class="mn-buy max"><span class="mb-cost">${icon('check')}</span><span class="mb-lbl">VOLL</span></button>`
        : `<button class="mn-buy${broke ? ' broke' : ''}" data-id="${node.id}">` +
          `<span class="mb-cost">${icon('sparkle')}${U.fmt(cost)}</span>` +
          `<span class="mb-lbl">STUFE ${l + 1}</span></button>`;
      html.push(`
        <div class="mn-row br-${metaBranch}${node.key ? ' key' : ''}">
          <div class="mn-orb${l > 0 ? ' lit' : ''}${maxed ? ' full' : ''}">
            ${icon(node.ico)}${l > 0 ? `<span class="mn-lvl">${l}</span>` : ''}
          </div>
          <div class="mn-body">
            <div class="mn-name">${node.name}</div>
            ${jetzt}${naechste}
            <div class="mn-pips">${pips}</div>
          </div>
          ${btn}
        </div>`);
    }
    els.metaRows.innerHTML = html.join('');
    if (els.metaFoot) {
      const offen = CFG.META.filter(n => lvl(n.id) < n.lvl)
        .reduce((a, n) => Math.min(a, CFG.metaCost(n, lvl(n.id))), Infinity);
      const rest = (st.essence || 0) >= offen
        ? '<b>Du kannst noch etwas kaufen</b> — gekaufte Segnungen gelten sofort im nächsten Lauf.'
        : (offen === Infinity
            ? 'Der ganze Baum ist deiner. Jetzt zählt nur noch, wie weit du kommst.'
            : `Die nächste Segnung kostet ${U.fmt(offen)} Essenz — dafür brauchst du noch einen Lauf.`);
      els.metaFoot.innerHTML =
        'Segnungen bleiben für immer und gelten ab dem nächsten Lauf. Der Bann der Leere ' +
        'holt jeden Lauf ein — wie weit du kommst, entscheidet dieser Baum.<br>' + rest;
    }
    if (els.metaNextLbl) els.metaNextLbl.textContent = `Lauf ${(st.runs || 0) + 1} beginnen`;
  }

  // Kauf einer Knotenstufe
  function buyMeta(G, id) {
    const st = G.state;
    const node = CFG.META.find(n => n.id === id);
    if (!node) return;
    if (!st.meta) st.meta = {};
    const l = st.meta[id] || 0;
    if (l >= node.lvl) return;
    const cost = CFG.metaCost(node, l);
    if ((st.essence || 0) < cost) {
      toast(`Dafür fehlen ${U.fmt(cost - (st.essence || 0))} Weltenessenz.`, 2200, 'sparkle');
      KS.Audio.SFX.denied();
      return;
    }
    st.essence -= cost;
    st.meta[id] = l + 1;
    KS.Systems.rebuildDerived(G);
    KS.Audio.SFX.essence();
    toast(`${node.name} Stufe ${l + 1}: ${node.desc(l + 1)}`, 3200, node.ico);
    renderMeta(G);
    KS.Game.requestSave();
  }

  // Vorschau der Essenz auf dem Niederlagen-Bildschirm
  function updateDefeatEssence() {
    if (!els.defeatEss || !KS.Game.pendingEssence) return;
    const r = KS.Game.pendingEssence();
    els.defeatEss.innerHTML =
      `<div class="de-val">${icon('sparkle')}${U.fmt(r.total)} Weltenessenz</div>` +
      `<div class="de-note">aus diesem Lauf geborgen</div>`;
    if (els.defeatEndLbl) els.defeatEndLbl.textContent = `Weltenessenz bergen (+${U.fmt(r.total)})`;
  }

  // Weiterlaufen, sobald kein Vollbildfenster mehr offen ist
  function resumeIfClear() {
    if (marketVisible || buildVisible || techVisible || metaVisible) return;
    if (KS.Game.G.state && KS.Game.G.state.runEnded) return;
    if (!els.story.classList.contains('hidden')) return;
    if (!els.defeat.classList.contains('hidden')) return;
    if (!els.menu.classList.contains('hidden')) return;
    KS.Game.setPaused(false);
  }

  function anyPanelOpen() { return marketVisible || buildVisible || techVisible || metaVisible; }

  // ---------- Platzierungsleiste ----------
  // Der Geist folgt dem König; die Leiste sagt jederzeit, ob es hier geht.
  let lastPlaceKey = '';

  function showPlaceBar(G) {
    const pm = G.placeMode;
    if (!pm || !els.placeBar) return;
    els.placeIco.innerHTML = icon(pm.def.ico);
    els.placeName.textContent = pm.def.name;
    els.placeBar.classList.remove('hidden');
    els.sideBtns.classList.add('hidden-soft');
    els.actBtn.classList.add('hidden');
    els.questCard.classList.remove('raised');
    els.questTab.classList.remove('raised');
    lastActKey = '';
    lastPlaceKey = '';
    updatePlaceBar(G);
  }

  function hidePlaceBar() {
    if (!els.placeBar) return;
    els.placeBar.classList.add('hidden');
    els.sideBtns.classList.remove('hidden-soft');
    lastPlaceKey = '';
  }

  function updatePlaceBar(G) {
    const pm = G.placeMode;
    if (!pm || !els.placeBar) return;
    const cost = KS.Systems.placeCost(G, pm.type);
    const key = `${pm.ok}|${pm.problem || ''}`;
    if (key === lastPlaceKey) return;
    lastPlaceKey = key;
    els.placeHint.textContent = pm.ok
      ? `Platz frei · Baustelle für ${U.fmt(cost)} Gold`
      : pm.problem;
    els.placeHint.classList.toggle('good', !!pm.ok);
    els.placeHint.classList.toggle('bad', !pm.ok);
    els.placeOk.disabled = !pm.ok;
  }

  // ---------- Toasts & Banner ----------
  function toast(msg, dur = 3400, ico = null) {
    const div = document.createElement('div');
    div.className = 'toast';
    if (ico) div.innerHTML = icon(ico) + '<span></span>';
    else div.innerHTML = '<span></span>';
    div.querySelector('span').textContent = msg;
    els.toasts.appendChild(div);
    while (els.toasts.children.length > 3) els.toasts.firstChild.remove();
    setTimeout(() => {
      div.classList.add('out');
      setTimeout(() => div.remove(), 420);
    }, dur);
  }

  function banner(title, sub, style) {
    els.banner.className = '';
    if (style) els.banner.classList.add(style === 'night' ? 'night' : style === 'danger' ? 'danger' : 'x');
    els.bannerTitle.textContent = title;
    els.bannerSub.textContent = sub || '';
    els.banner.classList.remove('hidden');
    if (bannerTimer) clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => {
      els.banner.classList.add('fadeout');
      bannerTimer = setTimeout(() => els.banner.classList.add('hidden'), 520);
    }, 2300);
  }

  function questComplete(q) {
    els.questCard.classList.remove('complete');
    void els.questCard.offsetWidth;
    els.questCard.classList.add('complete');
    toast(`Quest abgeschlossen! +${U.fmt(q.reward)} Gold`, 3400, 'check');
  }

  // ---------- Boss-Leiste ----------
  function showBossBar(name) {
    els.bossName.textContent = name;
    els.bossBar.classList.remove('hidden');
  }
  function hideBossBar() { els.bossBar.classList.add('hidden'); }

  // ---------- Kapitel-Story ----------
  function showChapter(chIdx) {
    const ch = CFG.CHAPTERS[Math.min(chIdx, CFG.CHAPTERS.length - 1)];
    els.storyKap.textContent = `Kapitel ${chIdx + 1}`;
    els.storyTitle.textContent = ch.title;
    els.storyText.textContent = ch.text;
    els.storyBtn.innerHTML = `${icon('swords')} Weiter`;
    els.story.classList.remove('hidden');
    KS.Game.setPaused(true);
    KS.Audio.SFX.chapter();
  }

  function showVictory() {
    els.storyKap.textContent = 'SIEG';
    els.storyTitle.textContent = 'Das neue Königreich';
    els.storyText.textContent = CFG.VICTORY_TEXT;
    els.storyBtn.innerHTML = `${icon('moon')} Ewige Wacht beginnen`;
    els.story.classList.remove('hidden');
    KS.Game.setPaused(true);
    KS.Audio.SFX.victory();
  }

  function hideDefeat() {
    if (els.defeat) els.defeat.classList.add('hidden');
  }

  function showDefeat(day) {
    els.defeatTitle.textContent = `Die Burg ist gefallen… (Nacht ${day})`;
    updateDefeatEssence();
    els.defeat.classList.remove('hidden');
    KS.Audio.SFX.defeat();
  }

  // ---------- Menü ----------
  function toggleMenu(force) {
    const show = force !== undefined ? force : els.menu.classList.contains('hidden');
    if (show) {
      const st = KS.Game.G.state;
      els.menuDay.textContent = `Tag ${st.day} · Kapitel ${st.chapterShown + 1} „${CFG.CHAPTERS[Math.min(Math.max(0, st.chapterShown), CFG.CHAPTERS.length - 1)].title}“`;
      $('opt-sfx').checked = KS.Audio.sfxOn;
      $('opt-music').checked = KS.Audio.musicOn;
      $('opt-shake').checked = st.settings.shake !== false;
      renderStats();
      const ver = $('opt-version');
      if (ver) ver.textContent = runningVersion();
      els.menu.classList.remove('hidden');
      KS.Game.setPaused(true);
    } else {
      els.menu.classList.add('hidden');
      resumeIfClear();
    }
  }

  // Laufende Version aus dem Cache-Busting-Stempel der Skripte lesen.
  // So sieht man im Menü sofort, ob der Server schon aktualisiert hat.
  function runningVersion() {
    const sc = document.querySelector('script[src*="game.js"]');
    const m = sc && /[?&]v=([\w.-]+)/.exec(sc.getAttribute('src') || '');
    return m ? m[1] : 'lokal (ohne Stempel)';
  }

  function renderStats() {
    const G = KS.Game.G, st = G.state;
    const mins = Math.floor(st.stats.playTime / 60);
    const rows = [
      ['swords', U.fmt(st.stats.kills), 'Monster besiegt'],
      ['crown', st.stats.bossKills, 'Bosse bezwungen'],
      ['coin', U.fmt(st.stats.goldEarned), 'Gold erbeutet'],
      ['person', st.survivors, 'Überlebende'],
      ['moon', Math.max(0, st.day - 1), 'Nächte überstanden'],
      ['time', mins >= 60 ? Math.floor(mins / 60) + ' h ' + (mins % 60) + ' min' : mins + ' min', 'Spielzeit'],
      ['castle', 'Stufe ' + (st.buildings.castle ? st.buildings.castle.tier : 1), 'Burg'],
      ['sword', CFG.weaponFor(G.weaponTier).name, 'Waffe'],
      ['sparkle', U.fmt(st.essence || 0), 'Weltenessenz'],
      ['star', (st.runs || 0) + ' · Tag ' + (st.runBest || 0), 'Läufe / bester Tag'],
      ['skull', 'Stufe ' + CFG.SCALE.voidTier(st.day, G.voidDelay || 0),
        'Bann der Leere (ab Tag ' + CFG.SCALE.voidStart(G.voidDelay || 0) + ')'],
    ];
    $('stats-grid').innerHTML = rows.map(r =>
      `<div class="stat-box"><div class="sv">${icon(r[0])} ${r[1]}</div><div class="sl">${r[2]}</div></div>`
    ).join('');
  }

  function renderChronik() {
    const log = KS.Game.G.state.log;
    $('chronik-list').innerHTML = log.length
      ? log.slice().reverse().map(e => {
          const row = document.createElement('div');
          row.className = 'chron-row';
          const d = document.createElement('span');
          d.className = 'chron-day'; d.textContent = `Tag ${e.d}`;
          const t = document.createElement('span'); t.textContent = e.t;
          row.append(d, t);
          return row.outerHTML;
        }).join('')
      : '<div class="chron-row">Noch keine Einträge — deine Legende beginnt gerade erst.</div>';
  }

  // ---------- Export / Import ----------
  function exportSave() {
    const data = btoa(unescape(encodeURIComponent(JSON.stringify(KS.Game.serialize()))));
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(data).then(
        () => toast('Spielstand in die Zwischenablage kopiert!', 3400, 'check'),
        () => prompt('Spielstand kopieren:', data)
      );
    } else prompt('Spielstand kopieren:', data);
  }
  function importSave() {
    const data = prompt('Spielstand einfügen:');
    if (!data) return;
    try {
      const obj = JSON.parse(decodeURIComponent(escape(atob(data.trim()))));
      if (!obj || typeof obj.version !== 'number') throw new Error('ungültig');
      KS.Game.loadImported(obj);
    } catch (e) {
      alert('Dieser Spielstand ist leider ungültig.');
    }
  }

  function applySettings(st) {
    KS.Audio.setSfx(st.settings.sfx !== false);
    KS.Audio.setMusic(st.settings.music !== false);
    updateSoundBtn();
    applyQuestCollapsed(st);
  }

  return {
    init, update, bumpGold, toast, banner, questComplete,
    showBossBar, hideBossBar, showChapter, showVictory, showDefeat,
    toggleMenu, showTitle, hideTitle, applySettings,
    renderMarketRows, icon, refreshActBtn,
    openMarket, closeMarket, isMarketOpen,
    openBuild, closeBuild, renderBuild, isBuildOpen,
    openTech, closeTech, renderTech, isTechOpen,
    openMeta, closeMeta, renderMeta, isMetaOpen, hideDefeat,
    showPlaceBar, hidePlaceBar, updatePlaceBar,
    updateResBar, anyPanelOpen,
    setQuestCollapsed,
  };
})();
