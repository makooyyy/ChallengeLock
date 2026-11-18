import { renderBuilder, builderClick, builderChange, hydrateBuilder } from './builder-ui.js';
import { renderBan, banClick, banChange, hydrateBan } from './ban-ui.js';
// UI: tabs, reels animation, contract, timer, builds, bans, filters, history.
import { icon } from './icons.js';
import { applyTheme, toggleTheme } from './theme.js';
import { showCelebration, closeCelebration, celebrationOpen } from './celebration.js';
import { S, RT, persist as saveState, ALL_CATS } from './state.js';
import { t, loc, setDict, setLang } from './i18n.js';
import { roll, DIFF, restoreResult, resultKey, heroPool } from './roulette.js';
import { newSeed, dailySeed, pick } from './rng.js';
import { validateData, options, GAME_MODES } from './validation.js';
import { parseHash, linkFor, setHash, copy, drawCard } from './share.js';

const $ = (s, r = document) => r.querySelector(s),
  $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  );
const RC = { easy: '#8c82a9', mid: '#7662ad', hard: '#9d62c9', insane: '#d55479' };
const ROM = ['I', 'II', 'III'];
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const H = (id) => RT.data.heroes.find((h) => h.id === id),
  C = (id) => RT.data.challenges.find((c) => c.id === id),
  I = (id) => RT.data.items.find((i) => i.id === id);
const mmss = (ms) => {
  const s = Math.floor(ms / 1000);
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
};
const DIFFS = Object.keys(DIFF);

/* ---------- helpers ---------- */
let tt;
function toast(m) {
  const e = $('#toast');
  e.textContent = m;
  e.classList.add('on');
  clearTimeout(tt);
  tt = setTimeout(() => e.classList.remove('on'), 1800);
}
function persist() {
  if (!saveState()) toast(t('storageError'));
}
const TIMER_KEY = 'dlr.timer';
// The match timer survives reloads: a running timer keeps its absolute start time.
function saveTimer() {
  if (!RT.cur) return;
  try {
    localStorage.setItem(
      TIMER_KEY,
      JSON.stringify({
        key: resultKey(RT.cur),
        ms: RT.timer.ms,
        run: RT.timer.run,
        t0: RT.timer.t0,
      }),
    );
  } catch (e) {
    console.warn(e);
  }
}
function restoreTimer() {
  if (!RT.cur) return;
  try {
    const s = JSON.parse(localStorage.getItem(TIMER_KEY) || 'null');
    if (!s || s.key !== resultKey(RT.cur) || !Number.isFinite(s.ms) || s.ms < 0) return;
    if (s.run && (!Number.isFinite(s.t0) || s.t0 > Date.now())) return;
    RT.timer = {
      ms: s.run ? Math.max(0, Date.now() - s.t0) : s.ms,
      run: !!s.run,
      t0: s.run ? Number(s.t0) || 0 : 0,
    };
    paintContract();
  } catch (e) {
    console.warn(e);
  }
}
let ac;
function beep(f, d = 0.1) {
  if (!S.sound) return;
  try {
    ac ??= new (window.AudioContext || window.webkitAudioContext)();
    const o = ac.createOscillator(),
      g = ac.createGain();
    o.frequency.value = f;
    o.type = 'square';
    g.gain.value = 0.04;
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + d);
    o.connect(g).connect(ac.destination);
    o.start();
    o.stop(ac.currentTime + d);
  } catch (e) {
    console.warn(e);
  }
}
const dia = (h) =>
  `<div class="dia" style="--c:${h.color}"><span>${esc(h.name[0])}</span>${h.icon ? `<img class="pic" src="${esc(h.icon)}" alt="" loading="lazy">` : ''}</div>`;
const seg = (arr, cur, attr) =>
  `<div class="seg" role="group" aria-label="${t(attr === 'diff' ? 'difficulty' : 'heroFilter')}">${arr.map(([v, l]) => `<button data-${attr}="${v}" class="${v == cur ? 'on' : ''}" aria-pressed="${v == cur}">${l}</button>`).join('')}</div>`;
const difficultyBadge = (x) =>
  `<span class="difficulty-badge" style="--difficulty-color:${RC[x.diff]}">${icon('spark', 11)} ${t('diff.' + x.diff)}</span>`;
const intro = (title, description, action = '') =>
  `<div class="page-intro"><div><div class="eyebrow">DEADLOCK / CHALLENGELOCK</div><h1>${title}</h1><p>${description}</p></div>${action}</div>`;
const emptyPanel = (glyph, title, description) =>
  `<div class="empty-panel">${icon(glyph)}<h2>${title}</h2><p>${description}</p></div>`;
const activeHeroes = () => RT.data.heroes.filter((h) => h.active !== false);
function setBusy(busy) {
  const board = $('.mach');
  if (board) board.setAttribute('aria-busy', String(busy));
  $$('#spin,#daily,[data-game-mode],[data-diff],[data-lock]').forEach(
    (b) =>
      (b.disabled =
        busy ||
        (b.dataset.lock !== undefined &&
          (!RT.cur || (+b.dataset.lock > 0 && !RT.cur.conds[+b.dataset.lock - 1])))),
  );
  const reroll = $('#reroll');
  if (reroll) reroll.disabled = busy || !RT.cur || RT.rerolls <= 0;
  $$('#done,#failb,#tgl').forEach((b) => (b.disabled = busy || RT.finished));
  const label = $('#spin-label');
  if (label) label.textContent = t(busy ? 'rolling' : 'spin');
}

const modeName = (x) => t('gameMode.' + options(x?.opts || S).gameMode);
const resText = (x) =>
  `🎯 Deadlock Challenge — ${modeName(x)} — ${H(x.hero).name} [${t('diff.' + x.diff)}]\n${x.conds.map((id) => '• ' + loc(C(id).name)).join('\n')}\n${linkFor(x)}`;

/* ---------- header / shell ---------- */
function paintHeader() {
  const button = $('#lang');
  const label = S.lang === 'ru' ? 'EN' : 'RU';
  const name = label + ' — ' + t('switchLanguage');
  button.textContent = label;
  button.setAttribute('aria-label', name);
  button.title = name;
}

/* ---------- version / changelog ---------- */
const releases = () =>
  Array.isArray(RT.data.changelog?.releases) ? RT.data.changelog.releases : [];
const siteVersion = () => releases()[0]?.version || '';

// Footer chip: the current version doubles as the entry point to the changelog.
function paintFooterVersion() {
  const button = $('#foot-version');
  if (!button) return;
  const version = siteVersion();
  button.textContent = (version ? 'v' + version + ' · ' : '') + t('whatsNew');
  button.title = t('versionLabel') + (version ? ' ' + version : '');
}

const releaseDate = (iso) => {
  const date = new Date(String(iso) + 'T00:00:00');
  if (Number.isNaN(date.getTime())) return String(iso);
  return new Intl.DateTimeFormat(S.lang === 'ru' ? 'ru-RU' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
};

function applyStatic() {
  $$('[data-icon]').forEach((e) => (e.innerHTML = icon(e.dataset.icon)));
  $$('[data-i18n]').forEach((e) => (e.textContent = t(e.dataset.i18n)));
  $('#foot').textContent = t('footer');
  paintFooterVersion();
  paintCatalog();
  paintHeader();
  applyTheme();
}
function paintCatalog() {
  const el = $('#data-notice');
  if (!el) return;
  const meta = RT.data.catalog?.heroes;
  el.textContent = meta
    ? t('catalogVerified') +
      ' · ' +
      meta.retrievedAt.slice(0, 10) +
      ' · ' +
      t('clientVersion') +
      ' ' +
      meta.clientVersion
    : t('unverifiedData');
  if (meta) {
    const a = document.createElement('a');
    a.href = 'https://deadlock-api.com/';
    a.textContent = ' · Deadlock API';
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    el.append(a);
  }
}
function show(tab) {
  RT.tab = tab;
  $$('.nb').forEach((b) => {
    const on = b.dataset.tab === tab;
    b.classList.toggle('on', on);
    b.setAttribute('aria-current', on ? 'page' : 'false');
  });
  $$('.panel').forEach((p) => (p.hidden = p.id !== 'p-' + tab));
  const views = {
    roulette: viewRoulette,
    build: viewBuild,
    ban: viewBan,
    custom: viewCustom,
    history: viewHistory,
    updates: viewUpdates,
  };
  const view = views[tab];
  if (typeof view === 'function') view();
}

/* ---------- ROULETTE ---------- */
function viewRoulette() {
  const p = $('#p-roulette');
  p.innerHTML =
    `<div class="studio-intro"><div><div class="eyebrow"><span class="live-indicator"></span>DEADLOCK / CHALLENGE GENERATOR</div><h1>${t('studioTitle')} <span>${t('studioTitleAccent')}</span></h1><p>${t('rouletteIntro')}</p></div><div class="studio-art" aria-hidden="true"><span class="art-orbit"></span>${[
      'haze',
      'abrams',
      'ivy',
    ]
      .map((id) => H(id))
      .filter(Boolean)
      .map((h) => `<img src="${esc(h.icon)}" alt="">`)
      .join(
        '',
      )}<span class="art-caption">PICK. PLAY. REPEAT.</span></div></div><div class="session-toolbar"><span class="session-title">${icon('settings', 16)}${t('sessionSetup')}</span><button id="daily" class="daily-button">${icon('calendar', 16)}${t('daily')}</button></div>` +
    `
  <section class="mode-picker" aria-label="${t('gameModeTitle')}"><div class="mode-picker-heading"><span class="eyebrow">${t('gameModeTitle')}</span><span>${t('gameModeHint')}</span></div><div class="mode-options">${GAME_MODES.map((m, i) => `<button data-game-mode="${m}" aria-pressed="${S.gameMode === m}" class="mode-option ${S.gameMode === m ? 'selected' : ''}"><span class="mode-index">0${i + 1}</span><span class="mode-glyph">${icon(['spark', 'dice', 'trophy'][i], 21)}</span><span><b>${t('gameMode.' + m)}</b><small>${t('gameModeDesc.' + m)}</small></span><span class="mode-check">${icon('check', 15)}</span></button>`).join('')}</div></section>
  <div class="roulette-layout"><section class="mach" aria-label="${t('tab.roulette')}" aria-busy="false">
    <h2 class="sr-only">${t('tab.roulette')}</h2>
    <div class="board-toolbar"><div class="toolbar-label"><b>${t('difficulty')}</b><small>${t('difficultyHint')}</small></div>${seg(
      DIFFS.map((d) => [d, t('diff.' + d)]),
      S.diff,
      'diff',
    )}</div>
    <div class="reel-stage"><div class="reel hero-reel" data-i="0"><div class="reel-title"><span>${t('yourHero')}</span>${icon('shield', 13)}</div><div class="strip"></div><button class="lk" data-lock="0" aria-label="${t('lock')} — ${t('hero')}"></button></div>
    <div class="conditions">${[1, 2, 3].map((i) => `<div class="reel condition-reel" data-i="${i}"><div class="condition-top"><div class="reel-title"><span class="condition-number">0${i}</span><span>${t('cond')} ${ROM[i - 1]}</span></div><button class="lk" data-lock="${i}" aria-label="${t('lock')} — ${t('cond')} ${ROM[i - 1]}"></button></div><div class="strip"></div></div>`).join('')}</div></div>
    <div class="filter-summary"><span>${icon('shield', 12)}${heroPool(RT.data.heroes, S).length} ${t('heroesCount')}</span><span class="sep">/</span><span>${S.cats.length} ${t('categoriesCount')}</span><button data-tab="custom">${t('configure')}${icon('arrow', 12)}</button></div>
    <div class="board-actions"><button class="spin" id="spin">${icon('shuffle')}<span id="spin-label">${t('spin')}</span><kbd>SPACE</kbd></button><button class="reroll-button" id="reroll">${icon('refresh', 17)}${t('reroll')}<small id="rr">${RT.rerolls}</small></button></div>
    <details class="board-options"><summary><span>${icon('settings', 14)}${t('extraSettings')}</span>${icon('chevron', 14)}</summary><div class="options-content"><label class="chk"><input type="checkbox" id="snd" ${S.sound ? 'checked' : ''}>${t('soundOn')}</label><label class="chk"><input type="checkbox" id="fsame" ${S.friend.same ? 'checked' : ''}>${t('sameHero')}</label><label class="chk">${t('player')}<input type="number" id="fpl" min="1" max="9" value="${S.friend.player}" class="num" ${S.friend.same ? 'disabled' : ''}></label><p class="keyboard-hint">${t('keys')}</p></div></details>
  </section><section class="paper" id="contract" aria-live="polite" tabindex="-1"></section></div>`;
  paintReels(RT.cur, false);
  paintContract();
  setBusy(RT.busy);
}
function paintReels(res, animate) {
  const promises = [];
  for (let i = 0; i < 4; i++) {
    const el = $(`.reel[data-i="${i}"] .strip`);
    if (!el) continue;
    const entry = res ? (i === 0 ? H(res.hero) : C(res.conds[i - 1])) : null;
    el.closest('.reel').hidden = i > 0 && (res ? !entry : i > 1);
    if (i === 0) {
      el.innerHTML = entry
        ? `<div class="hero-display" style="--hero-color:${entry.color}"><div class="hero-avatar"><span>${esc(entry.name[0])}</span><img class="pic" src="${esc(entry.icon)}" alt=""></div><div><p>DEADLOCK / CHALLENGE</p><h3>${esc(entry.name)}</h3><div class="hero-context"><span>${modeName(res)}</span><span>${t('diff.' + res.diff)}</span></div></div></div>`
        : `<div class="hero-empty"><div class="portrait-stack">${['abrams', 'ivy', 'haze']
            .map((id) => H(id))
            .filter(Boolean)
            .map((h) => `<img src="${esc(h.icon)}" alt="">`)
            .join(
              '',
            )}</div><div><b>${t('whoNext')}</b><small>${activeHeroes().length} ${t('heroesReady')}</small></div></div>`;
    } else
      el.innerHTML = entry
        ? `<div class="condition-result"><h3>${esc(loc(entry.name))}</h3><p>${esc(loc(entry.desc))}</p></div>`
        : `<div class="condition-empty">${res ? t('unusedCondition') : t('conditionPlaceholder')}</div>`;
    const lock = $(`.reel[data-i="${i}"] .lk`);
    lock.innerHTML =
      icon(RT.locks[i] ? 'lock' : 'unlock', 12) +
      `<span>${t(RT.locks[i] ? 'locked' : 'lock')}</span>`;
    lock.title = t('lockHelp');
    lock.classList.toggle('on', RT.locks[i]);
    lock.setAttribute('aria-pressed', String(RT.locks[i]));
    lock.disabled = !entry || RT.busy;
    lock.hidden = !entry;
    if (animate && !reduce && entry && !RT.locks[i])
      promises.push(
        el.animate(
          [
            { opacity: 0.1, transform: 'translateY(9px)' },
            { opacity: 1, transform: 'translateY(0)' },
          ],
          { duration: 360 + i * 80, easing: 'ease-out' },
        ).finished,
      );
  }
  return Promise.all(promises);
}
function paintContract() {
  const el = $('#contract');
  if (!el) return;
  const x = RT.cur;
  el.classList.toggle('finished', RT.finished);
  el.classList.toggle('has-result', !!x);
  if (!x) {
    el.innerHTML = `<div class="contract-top"><span class="eyebrow">${t('yourContract')}</span>${icon('shield', 16)}</div><div class="contract-empty"><div class="contract-illustration">${icon('lock', 28)}</div><h2>${t('emptyTitle')}</h2><p>${t('empty')}</p><div class="steps"><b>1</b>${t('stepSpin')}<span>→</span><b>2</b>${t('stepPlay')}<span>→</span><b>3</b>${t('stepEarn')}</div></div>`;
    return;
  }
  const h = H(x.hero),
    fav = S.favs.some((f) => resultKey(f) === resultKey(x));
  el.innerHTML = `<div class="contract-top"><span class="eyebrow">${t('yourContract')}</span>${difficultyBadge(x)}</div>
  <div class="contract-hero">${dia(h)}<div><h2>${esc(h.name)}</h2><p>${modeName(x)} · ${t('diff.' + x.diff)} · ${x.conds.length} ${t('conditionsCount')}</p></div><button class="icon-button" id="fav" aria-label="${t('fav')}" title="${t('fav')}" aria-pressed="${fav}">${icon('star', 18)}</button></div>
  <div class="contract-state">${icon(RT.finished ? 'check' : 'play', 12)}${t(RT.finished ? 'sessionClosed' : 'sessionActive')}</div><p class="contract-note">${t('contractHint')}</p>
  ${RT.finished ? `<div class="completion-status ${x.outcome === 'fail' ? 'failed' : ''}">${icon(x.outcome === 'done' ? 'check' : 'close', 17)}${t(x.outcome === 'done' ? 'completedStatus' : 'failedStatus')}</div>` : ''}
  <div class="result-actions"><button class="pb" id="done" ${RT.finished ? 'disabled' : ''}>${icon('check', 16)}${t('done')}</button><button class="pb o" id="failb" ${RT.finished ? 'disabled' : ''}>${icon('close', 15)}${t('fail')}</button></div>
  ${RT.finished ? `<button class="review-stamp" id="review-stamp">${icon('shield', 17)}${t('reviewStamp')}${icon('arrow', 15)}</button>` : ''}
  <div class="timer-row"><div class="timer-readout">${icon('clock', 17)}<b id="tm" class="mono-t">${mmss(RT.timer.ms)}</b></div><button class="timer-toggle" id="tgl" ${RT.finished ? 'disabled' : ''}>${icon(RT.timer.run ? 'clock' : 'play', 12)}${RT.timer.run ? t('pause') : t('start')}</button></div>
  <div class="share-actions"><button id="cl">${icon('link', 14)}${t('copyLink')}</button><button id="ct">${icon('copy', 14)}${t('copyText')}</button><button id="cp">${icon('download', 14)}${t('png')}</button></div>
  <div class="contract-seed">SEED / ${esc(x.seed)} · R${x.r}</div>`;
}

function particles(col) {
  const m = $('.mach');
  if (!m || reduce) return;
  for (let i = 0; i < 26; i++) {
    const s = document.createElement('i');
    s.className = 'pt';
    s.style.cssText = `--x:${(Math.random() - 0.5) * 500}px;--y:${-Math.random() * 260}px;background:${col};left:50%;top:50%`;
    m.append(s);
    setTimeout(() => s.remove(), 1000);
  }
}
async function doRoll(reroll, opt = {}) {
  if (RT.busy) return;
  if (reroll && (!RT.cur || RT.rerolls <= 0)) return toast(t('noRerolls'));
  const seed = reroll ? RT.seed : opt.seed || newSeed(),
    r = reroll ? RT.r + 1 : opt.r || 0;
  const locks = reroll ? RT.locks : [false, false, false, false];
  let res;
  try {
    res = opt.result
      ? restoreResult(opt.result, RT.data.heroes, RT.data.challenges)
      : roll({
          seed,
          r,
          heroes: RT.data.heroes,
          challenges: RT.data.challenges,
          o: S,
          locks,
          prev: reroll ? RT.cur : null,
          player: S.friend.player,
          same: S.friend.same,
        });
  } catch (e) {
    console.error(e);
    return toast(t('invalidLink'));
  }
  if (!res) return toast(t(heroPool(RT.data.heroes, S).length ? 'noConditions' : 'noHeroes'));
  RT.seed = seed;
  RT.r = r;
  RT.locks = locks;
  RT.rerolls = reroll ? RT.rerolls - 1 : Math.max(0, RT.maxRerolls - r);
  const existing = S.history.find((x) => resultKey(x) === resultKey(res));
  if (existing) res.outcome = existing.outcome;
  S.history = S.history.filter((x) => resultKey(x) !== resultKey(res));
  if (reroll && S.history[0]?.seed === res.seed && !S.history[0].outcome) S.history.shift();
  S.history.unshift(res);
  S.history = S.history.slice(0, 50);
  RT.cur = res;
  RT.finished = !!res.outcome;
  RT.timer = { ms: 0, run: false, t0: 0 };
  persist();
  setHash(res);
  show('roulette');
  RT.busy = true;
  setBusy(true);
  beep(330);
  try {
    await paintReels(res, !opt.result);
  } catch (e) {
    console.warn(e);
  }
  RT.busy = false;
  setBusy(false);
  beep(res.diff === 'insane' ? 160 : 660, 0.18);
  if (res.diff === 'hard' || res.diff === 'insane') {
    particles(RC[res.diff]);
    const m = $('.mach');
    if (!reduce && m) {
      m.classList.add('shake');
      setTimeout(() => m.classList.remove('shake'), 450);
    }
  }
  if (RT.pendingHash) {
    const next = RT.pendingHash;
    RT.pendingHash = null;
    fromHash(next);
  }
}
function finish(o) {
  const x = RT.cur;
  if (!x || RT.finished) return;
  RT.finished = true;
  RT.timer.run = false;
  x.outcome = o;
  for (const f of S.favs) if (resultKey(f) === resultKey(x)) f.outcome = o;
  if (o === 'done') {
    S.stats.done++;
  } else S.stats.fail++;
  persist();
  paintContract();
  paintHeader();
  beep(o === 'done' ? 880 : 140, 0.2);
  showCelebration(x, H(x.hero), RT.data.challenges);
}
setInterval(() => {
  const T = RT.timer;
  if (T.run) {
    T.ms = Date.now() - T.t0;
    const e = $('#tm');
    if (e) e.textContent = mmss(T.ms);
  }
}, 250);
async function png() {
  const x = RT.cur;
  if (!x) return;
  const cv = document.createElement('canvas');
  try {
    await document.fonts.ready;
  } catch (e) {
    console.warn(e);
  }
  drawCard(cv, {
    hero: H(x.hero).name,
    lines: x.conds.map((id) => loc(C(id).name)),
    label: t('diff.' + x.diff),
    color: RC[x.diff],
    foot: `${modeName(x)} · seed ${x.seed} · Deadlock Challenge Roulette`,
  });
  cv.toBlob((b) => {
    if (!b) return toast(t('error'));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = `dlr-${x.seed}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
}

/* ---------- BUILD ---------- */
function viewBuild() {
  renderBuilder();
}
function viewBan() {
  renderBan();
}
function applyHeroSel() {
  S.excluded = S.heroMode === 'exclude' ? S.sel.slice() : [];
  S.only = S.heroMode === 'only' ? S.sel.slice() : [];
  persist();
}
function updateHeroSearch() {
  const query = (RT.heroSearch || '').toLowerCase().trim();
  let count = 0;
  $$('.hc').forEach((el) => {
    el.hidden = !el.dataset.search.includes(query);
    if (!el.hidden) count++;
  });
  const countEl = $('#hero-count'),
    available = heroPool(RT.data.heroes, S).length;
  if (countEl) {
    countEl.textContent = t('available') + ': ' + available + ' / ' + activeHeroes().length;
    countEl.classList.toggle('warning', available === 0);
  }
  const empty = $('#hero-search-empty');
  if (empty) empty.hidden = count > 0;
}
function viewCustom() {
  const p = $('#p-custom');
  p.innerHTML =
    intro(t('customTitle'), t('customIntro')) +
    `<div class="card"><div class="section-heading"><div><h2>${t('cats')}</h2><p>${t('categoriesHint')}</p></div>${icon('settings', 20)}</div><div class="cat-grid">${ALL_CATS.map((c) => `<label class="cat-choice"><input type="checkbox" data-cat="${c}" ${S.cats.includes(c) ? 'checked' : ''}>${t('cat.' + c)}</label>`).join('')}</div><div class="team-row"><label class="chk"><input type="checkbox" id="team" ${S.team ? 'checked' : ''}>${t('teamMode')}</label><p>${t('teamHint')}</p></div></div>
  <div class="card"><div class="section-heading"><div><h2>${t('heroFilter')}</h2><p>${t('heroFilterHint')}</p></div>${seg(
    [
      ['exclude', t('exclude')],
      ['only', t('onlyHeroes')],
    ],
    S.heroMode,
    'hm',
  )}</div><div class="hero-tools"><label class="search-wrap">${icon('search', 16)}<input class="search-input" id="hero-search" type="search" placeholder="${t('searchHeroes')}" aria-label="${t('searchHeroes')}" value="${esc(RT.heroSearch || '')}"></label><span class="hero-count" id="hero-count" aria-live="polite"></span><button id="hreset">${t('reset')}</button></div>
  <div class="hg">${activeHeroes()
    .map(
      (h) =>
        `<label class="hc" data-search="${esc((h.name + ' ' + h.id).toLowerCase())}"><input type="checkbox" data-h="${h.id}" ${S.sel.includes(h.id) ? 'checked' : ''}>${dia(h)}<span>${esc(h.name)}</span></label>`,
    )
    .join(
      '',
    )}</div><p class="search-empty" id="hero-search-empty" hidden>${t('noSearchResults')}</p></div>`;
  updateHeroSearch();
}
function viewHistory() {
  const p = $('#p-history'),
    row = (x) =>
      `<li><a href="${linkFor(x)}">${H(x.hero) ? dia(H(x.hero)) : ''}<div class="history-copy"><div class="fx" style="gap:6px"><b>${esc(H(x.hero)?.name || x.hero)}</b>${difficultyBadge(x)}</div><small class="history-mode">${modeName(x)}</small><small>${x.conds.map((id) => esc(loc(C(id)?.name || id))).join(' · ')}</small></div></a><span class="history-status ${x.outcome === 'fail' ? 'failed' : ''}">${x.outcome === 'done' ? '✓' : x.outcome === 'fail' ? '×' : t('pending')}</span></li>`;
  const total = S.stats.done + S.stats.fail;
  const rate = total ? Math.round((S.stats.done / total) * 100) : 0;
  const heroCounts = new Map();
  for (const x of S.history)
    if (x.outcome === 'done') heroCounts.set(x.hero, (heroCounts.get(x.hero) || 0) + 1);
  const topHeroes = [...heroCounts.entries()]
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .slice(0, 3);
  const topHeroesHtml = topHeroes.length
    ? topHeroes
        .map(([id, count]) => `<li><span>${esc(H(id)?.name || id)}</span><b>${count}</b></li>`)
        .join('')
    : `<li class="history-empty">${t('noStats')}</li>`;
  p.innerHTML =
    intro(t('historyTitle'), t('historyIntro')) +
    `<div class="stat">${[
      ['won', S.stats.done, 'check'],
      ['lost', S.stats.fail, 'close'],
      ['successRate', rate + '%', 'spark'],
    ]
      .map(
        ([label, value, glyph]) =>
          `<div class="card"><div><span>${t(label)}</span><b>${value}</b></div>${icon(glyph, 30)}</div>`,
      )
      .join(
        '',
      )}</div><div class="card"><div class="section-heading"><h2>${t('topHeroes')}</h2>${icon('trophy', 18)}</div><ul class="hl">${topHeroesHtml}</ul></div><div class="history-columns"><div class="card"><div class="section-heading"><h2>${t('hist')}</h2>${icon('history', 18)}</div><ul class="hl">${S.history.map(row).join('') || `<li class="history-empty">${t('noHist')}</li>`}</ul></div><div class="card"><div class="section-heading"><h2>${t('favs')}</h2>${icon('star', 18)}</div><ul class="hl">${S.favs.map(row).join('') || `<li class="history-empty">${t('noFavs')}</li>`}</ul></div></div>`;
}

/* ---------- UPDATES ---------- */
function viewUpdates() {
  const p = $('#p-updates');
  const list = releases();
  const version = siteVersion();
  p.innerHTML =
    intro(
      t('updatesTitle'),
      t('updatesIntro'),
      version ? `<span class="version-pill">v${esc(version)}</span>` : '',
    ) +
    (list.length
      ? `<div class="release-list">${list
          .map(
            (r, i) => `<article class="card release">
      <div class="release-head"><span class="release-version">v${esc(r.version)}</span><time datetime="${esc(r.date)}">${esc(releaseDate(r.date))}</time>${
        i === 0 ? `<span class="release-current">${t('currentVersion')}</span>` : ''
      }</div>
      <h2>${esc(loc(r.title))}</h2>
      <ul>${(loc(r.items) || []).map((item) => `<li>${esc(item)}</li>`).join('')}</ul>
    </article>`,
          )
          .join('')}</div>`
      : `<div class="card"><p>${t('updatesEmpty')}</p></div>`);
}

/* ---------- events ---------- */
function bind() {
  document.addEventListener('click', async (e) => {
    if (e.target.closest('.skip-link')) {
      e.preventDefault();
      $('#main').focus();
      return;
    }
    const a = e.target.closest('.hl a');
    if (a) {
      e.preventDefault();
      const h = parseHash(new URL(a.href).hash);
      if (h) return fromHash(h);
    }
    const b = e.target.closest('button');
    if (!b) return;
    const d = b.dataset;
    if (d.tab) return show(d.tab);
    if (RT.busy) return;
    if ((await builderClick(b, toast, persist)) || (await banClick(b, toast, persist))) return;
    if (b.id === 'theme') {
      toggleTheme();
      persist();
      return;
    }
    if (b.id === 'lang') {
      S.lang = S.lang === 'ru' ? 'en' : 'ru';
      setLang(S.lang);
      persist();
      applyStatic();
      return show(RT.tab);
    }
    if (b.id === 'spin') return doRoll(false);
    if (b.id === 'reroll') return doRoll(true);
    if (b.id === 'daily') return doRoll(false, { seed: dailySeed() });
    if (d.gameMode && GAME_MODES.includes(d.gameMode)) {
      if (S.gameMode === d.gameMode) return;
      S.gameMode = d.gameMode;
      RT.cur = null;
      RT.seed = null;
      RT.r = 0;
      RT.finished = false;
      RT.locks = [false, false, false, false];
      RT.rerolls = RT.maxRerolls;
      RT.timer = { ms: 0, run: false, t0: 0 };
      history.replaceState(null, '', location.pathname + location.search);
      persist();
      viewRoulette();
      document.querySelector('[data-game-mode="' + S.gameMode + '"]').focus();
      return;
    }
    if (d.diff) {
      S.diff = d.diff;
      RT.locks = [false, false, false, false];
      paintReels(RT.cur, false);
      persist();
      return $$('[data-diff]').forEach((x) => {
        x.classList.toggle('on', x === b);
        x.setAttribute('aria-pressed', x === b);
      });
    }
    if (d.lock !== undefined) {
      const i = +d.lock;
      if (!RT.cur || (i > 0 && !RT.cur.conds[i - 1])) return;
      RT.locks[i] = !RT.locks[i];
      paintReels(RT.cur, false);
      return;
    }
    if (b.id === 'review-stamp' && RT.cur && RT.finished)
      return showCelebration(RT.cur, H(RT.cur.hero), RT.data.challenges);
    if (b.id === 'done') return finish('done');
    if (b.id === 'failb') return finish('fail');
    if (b.id === 'tgl') {
      if (RT.finished) return;
      const T = RT.timer;
      T.run = !T.run;
      if (T.run) T.t0 = Date.now() - T.ms;
      saveTimer();
      return paintContract();
    }
    if (b.id === 'fav') {
      const x = RT.cur,
        k = (f) => resultKey(f) === resultKey(x);
      S.favs = S.favs.some(k) ? S.favs.filter((f) => !k(f)) : [{ ...x }, ...S.favs].slice(0, 50);
      persist();
      return paintContract();
    }
    if (b.id === 'cl') return toast((await copy(linkFor(RT.cur))) ? t('copied') : t('error'));
    if (b.id === 'ct') return toast((await copy(resText(RT.cur))) ? t('copied') : t('error'));
    if (b.id === 'cp') return png();
    if (d.hm) {
      S.heroMode = d.hm;
      applyHeroSel();
      return viewCustom();
    }
    if (b.id === 'hreset') {
      S.sel = [];
      applyHeroSel();
      return viewCustom();
    }
  });
  document.addEventListener('change', (e) => {
    const i = e.target;
    if (builderChange(i, toast, persist) || banChange(i, persist)) return;
    if (i.dataset.cat) {
      S.cats = $$('[data-cat]')
        .filter((x) => x.checked)
        .map((x) => x.dataset.cat);
      if (!S.cats.length) {
        S.cats = [i.dataset.cat];
        i.checked = true;
      }
      persist();
    } else if (i.id === 'team') {
      S.team = i.checked;
      persist();
    } else if (i.dataset.h) {
      S.sel = $$('[data-h]')
        .filter((x) => x.checked)
        .map((x) => x.dataset.h);
      applyHeroSel();
      updateHeroSearch();
    } else if (i.id === 'snd') {
      S.sound = i.checked;
      persist();
    } else if (i.id === 'fsame') {
      S.friend.same = i.checked;
      const player = $('#fpl');
      if (player) player.disabled = S.friend.same;
      persist();
    } else if (i.id === 'fpl') {
      S.friend.player = Math.max(1, Math.min(9, +i.value || 1));
      persist();
    }
  });
  document.addEventListener('input', (e) => {
    if (e.target.id === 'hero-search') {
      RT.heroSearch = e.target.value;
      updateHeroSearch();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (celebrationOpen()) return;
    if (
      RT.tab !== 'roulette' ||
      e.ctrlKey ||
      e.metaKey ||
      e.altKey ||
      e.target.closest('input,select,textarea,summary,[contenteditable="true"]')
    )
      return;
    if (e.code === 'Space' && !e.target.closest('button,a')) {
      e.preventDefault();
      doRoll(false);
    } else if (e.code === 'KeyR') doRoll(true);
    else if (e.code === 'KeyL') {
      const b = $('[data-lock="0"]');
      if (b) b.click();
    }
  });
  addEventListener('hashchange', () => {
    const h = parseHash();
    if (h) fromHash(h);
  });
  document.addEventListener(
    'error',
    (e) => {
      if (e.target.matches?.('img.pic,img.asset-img')) {
        console.warn('image failed:', e.target.currentSrc || e.target.src);
        e.target.remove();
      }
    },
    true,
  );
  addEventListener('visibilitychange', () => {
    if (document.hidden) saveTimer();
  });
  addEventListener('pagehide', saveTimer);
}
function fromHash(h) {
  closeCelebration();
  if (RT.busy) {
    RT.pendingHash = h;
    return;
  }
  if (h.error) {
    show('roulette');
    return toast(t('invalidLink'));
  }
  if (h.result) {
    try {
      restoreResult(h.result, RT.data.heroes, RT.data.challenges);
    } catch {
      show('roulette');
      return toast(t('invalidLink'));
    }
  }
  Object.assign(S, options(h.result?.opts || { diff: h.d }));
  S.diff = h.d;
  S.friend = { same: !h.p, player: h.p || 1 };
  S.heroMode = S.only.length ? 'only' : 'exclude';
  S.sel = [...(S.only.length ? S.only : S.excluded)];
  show('roulette');
  return doRoll(false, { seed: h.seed, r: h.r, result: h.result });
}

/* ---------- boot ---------- */
export async function boot() {
  applyTheme();
  try {
    const j = (u) =>
      fetch(u).then((r) => {
        if (!r.ok) throw new Error(u + ' ' + r.status);
        return r.json();
      });
    // The changelog is optional: a missing file must not block the app.
    const optional = (u) => j(u).catch(() => null);
    const [h, i, c, l, u] = await Promise.all([
      j('data/heroes.json'),
      j('data/items.json'),
      j('data/challenges.json'),
      j('data/i18n.json'),
      optional('data/changelog.json'),
    ]);
    RT.data = validateData(
      {
        heroes: h.heroes,
        items: i.items,
        challenges: c.challenges,
        catalog: { heroes: h._meta, items: i._meta },
      },
      l,
    );
    RT.data.changelog = u && Array.isArray(u.releases) ? u : { releases: [] };
    setDict(l, S.lang);
    setLang(S.lang);
    for (const key of ['history', 'favs'])
      S[key] = S[key].flatMap((x) => {
        try {
          return [{ ...restoreResult(x, h.heroes, c.challenges), outcome: x.outcome }];
        } catch {
          return [];
        }
      });
  } catch (e) {
    console.error(e);
    $('#boot').innerHTML =
      `<div class="err" role="alert">Не удалось загрузить данные / Failed to load data</div>`;
    return;
  }
  hydrateBuilder();
  hydrateBan();
  S.sel ??= [];
  S.heroMode ??= 'exclude';
  $('#boot').remove();
  $('#app').hidden = false;
  bind();
  applyStatic();
  persist();
  const h = parseHash();
  h ? await fromHash(h) : show('roulette');
  restoreTimer();
  const notice = document.createElement('p');
  notice.id = 'data-notice';
  notice.className = 'mo';
  $('#foot').before(notice);
  paintCatalog();
  if ('serviceWorker' in navigator) {
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
    navigator.serviceWorker
      .register('sw.js')
      .then((registration) => {
        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              worker.postMessage('skipWaiting');
            }
          });
        });
      })
      .catch(() => {});
  }
  checkForUpdates();
}

async function checkForUpdates() {
  const APP_VERSION = RT.data?.changelog?.releases?.[0]?.version || '1.0.1';
  try {
    const r = await fetch('https://api.github.com/repos/makooyyy/ChallengeLock/releases/latest');
    if (!r.ok) return;
    const data = await r.json();
    const latest = String(data.tag_name || '').replace(/^v/, '');
    if (!latest || !isNewerVersion(latest, APP_VERSION)) return;
    showUpdateBanner(
      latest,
      data.html_url || 'https://github.com/makooyyy/ChallengeLock/releases/latest',
    );
  } catch (e) {
    console.warn(e);
  }
}

function isNewerVersion(latest, current) {
  const a = latest.split('.').map((n) => parseInt(n, 10) || 0);
  const b = current.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] || 0) > (b[i] || 0)) return true;
    if ((a[i] || 0) < (b[i] || 0)) return false;
  }
  return false;
}

function showUpdateBanner(version, url) {
  if (document.getElementById('update-banner')) return;
  const safeVersion = String(version).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  );
  const safeUrl = /^https:\/\/github\.com\/makooyyy\/ChallengeLock\//.test(String(url))
    ? String(url)
    : 'https://github.com/makooyyy/ChallengeLock/releases/latest';
  const b = document.createElement('div');
  b.id = 'update-banner';
  b.style.cssText =
    'position:fixed;top:0;left:0;right:0;z-index:9999;background:#3475fa;color:#fff;padding:10px 16px;display:flex;align-items:center;justify-content:space-between;font-size:13px;box-shadow:0 2px 8px rgba(0,0,0,.2)';
  const text = document.createElement('span');
  text.textContent = 'Доступна новая версия ' + safeVersion;
  const actions = document.createElement('span');
  const link = document.createElement('a');
  link.href = safeUrl;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.style.cssText = 'color:#fff;font-weight:700;margin-right:12px;text-decoration:underline;';
  link.textContent = 'Скачать';
  const close = document.createElement('button');
  close.id = 'update-close';
  close.type = 'button';
  close.setAttribute('aria-label', 'Закрыть уведомление об обновлении');
  close.style.cssText =
    'background:transparent;border:0;color:#fff;font-size:18px;cursor:pointer;line-height:1;';
  close.textContent = '×';
  close.onclick = () => b.remove();
  actions.append(link, close);
  b.append(text, actions);
  document.body.prepend(b);
}
