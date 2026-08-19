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
      sndOn: $('snd-on'), sndOff: $('snd-off'),
    };

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
    $('defeat-btn').addEventListener('click', () => {
      KS.Audio.SFX.click();
      els.defeat.classList.add('hidden');
      KS.Game.reviveAfterDefeat();
    });
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
    // Quest-Karte → Ping auf Ziel
    els.questCard.addEventListener('click', () => {
      KS.Audio.SFX.click();
      KS.Game.pingQuestTarget();
    });
    // Markt: Kauf-Klicks (delegiert)
    els.marketRows.addEventListener('click', e => {
      const btn = e.target.closest('.mk-buy');
      if (!btn || btn.classList.contains('max')) return;
      KS.Systems.buyMarket(KS.Game.G, btn.dataset.track);
      renderMarketRows(KS.Game.G);
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
      btnCont.innerHTML = `${icon('play')} Weiterspielen`;
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
    }
    // Markt-Preise regelmäßig auffrischen (Kaufkraft-Anzeige)
    if (marketVisible) {
      marketRefreshT -= dt;
      if (marketRefreshT <= 0) { marketRefreshT = 0.4; refreshMarketAfford(G); }
    }
  }

  // ---------- Markt ----------
  function updateMarket(G, near) {
    if (near && !marketVisible) {
      marketVisible = true;
      renderMarketRows(G);
      els.market.classList.remove('hidden');
    } else if (!near && marketVisible) {
      marketVisible = false;
      els.market.classList.add('hidden');
    }
  }

  function renderMarketRows(G) {
    const st = G.state;
    const b = st.buildings.markt;
    const slots = b && b.tier >= 1 ? CFG.BUILDINGS.markt.slots(b.tier) : 0;
    const rows = [];
    for (let i = 0; i < Math.min(slots, CFG.MARKET.length); i++) {
      const t = CFG.MARKET[i];
      const lvl = KS.Systems.marketLvl(G, t.id);
      const maxed = lvl >= t.max;
      const cost = maxed ? 0 : KS.Systems.marketCost(G, t, lvl);
      rows.push(`
        <div class="mk-row">
          <div class="mk-ico">${icon(t.ico)}</div>
          <div class="mk-body">
            <div class="mk-name">${t.name} <span class="mk-lvl">${lvl}/${t.max}</span></div>
            <div class="mk-desc">${t.desc}</div>
          </div>
          <button class="mk-buy${maxed ? ' max' : ''}" data-track="${t.id}" data-cost="${cost}">
            ${maxed ? 'MAX' : `<span class="coin-ico"></span>${U.fmt(cost)}`}
          </button>
        </div>`);
    }
    if (CFG.MARKET.length > slots) {
      rows.push(`<div class="mk-row"><div class="mk-desc">${icon('lock')} Markt ausbauen schaltet weitere Waren frei</div></div>`);
    }
    els.marketRows.innerHTML = rows.join('');
    refreshMarketAfford(G);
  }

  function refreshMarketAfford(G) {
    els.marketRows.querySelectorAll('.mk-buy').forEach(btn => {
      if (btn.classList.contains('max')) return;
      btn.classList.toggle('broke', G.state.gold < Number(btn.dataset.cost));
    });
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

  function showDefeat(day) {
    els.defeatTitle.textContent = `Die Burg ist gefallen… (Nacht ${day})`;
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
      els.menu.classList.remove('hidden');
      KS.Game.setPaused(true);
    } else {
      els.menu.classList.add('hidden');
      if (els.story.classList.contains('hidden') && els.defeat.classList.contains('hidden')) {
        KS.Game.setPaused(false);
      }
    }
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
      ['sword', CFG.WEAPONS[G.weaponTier - 1].name, 'Waffe'],
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
  }

  return {
    init, update, bumpGold, toast, banner, questComplete,
    showBossBar, hideBossBar, showChapter, showVictory, showDefeat,
    toggleMenu, showTitle, hideTitle, applySettings,
    updateMarket, renderMarketRows, icon,
  };
})();
