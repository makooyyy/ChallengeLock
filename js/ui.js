import {
  renderBuilder,
  shopAction,
  builderClick,
  builderChange,
  useContractHero,
  hydrateBuilder,
} from './builder-ui.js';
import {
  renderBan,
  banClick,
  banChange,
  hydrateBan,
  syncBanHero,
  clearBan,
  rule as banRule,
} from './ban-ui.js';
// UI: tabs, reels animation, contract, timer, builds, bans, filters, history.
import { icon } from './icons.js';
import { applyTheme, toggleTheme } from './theme.js';
import { showCelebration, closeCelebration, celebrationOpen } from './celebration.js';
import { S, RT, persist as saveState, ALL_CATS } from './state.js';
import { t, loc, setDict, setLang } from './i18n.js';
import {
  rollDetailed,
  CONTRACT_DAY,
  expireContracts,
  DIFF,
  restoreResult,
  resultKey,
  heroPool,
} from './roulette.js';
import { newSeed, dailySeed } from './rng.js';
import { validateData, normalizeState, options, GAME_MODES } from './validation.js';
import { parseHash, linkFor, setHash, copy, drawCard } from './share.js';
import { checkForUpdates } from './update-check.js';
import { challengeTips } from './views/challenge-tips.js';
import { syncTimeline, watchTimeline } from './views/timeline.js';
import { renderGuide } from './views/guide.js';
import { releasesOf, siteVersionOf, renderUpdates } from './views/updates.js';
import {
  $,
  $$,
  esc,
  toast,
  dia,
  seg,
  difficultyBadge,
  intro,
  mmss,
  reduce,
  ROMAN,
  DIFF_COLOR,
} from './ui-kit.js';

const H = (id) => RT.data.heroes.find((h) => h.id === id),
  C = (id) => RT.data.challenges.find((c) => c.id === id);
const DIFFS = Object.keys(DIFF);
const TABS = ['roulette', 'build', 'ban', 'custom', 'history', 'guide', 'updates'];
// Present only inside the Electron shell; undefined in a normal browser tab.
const desktop = globalThis.challengeLockDesktop;
// Why a roll produced nothing, phrased as an i18n key the player can act on.
const ROLL_FAILURE = {
  'no-alternative': 'noAlternative',
  'no-heroes': 'noHeroes',
  'locked-hero': 'lockedHeroGone',
  'locked-condition': 'lockedConditionBlocked',
  'no-conditions': 'noConditions',
};

/* ---------- helpers ---------- */
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
  if (!RT.cur || RT.preview || RT.finished) return;
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
const activeHeroes = () => RT.data.heroes.filter((h) => h.active !== false);
function setBusy(busy) {
  const board = $('.mach');
  if (board) board.setAttribute('aria-busy', String(busy));
  $$('#spin,#daily,[data-game-mode],[data-diff],[data-lock]').forEach(
    (b) =>
      (b.disabled =
        busy ||
        (!!RT.cur && !RT.preview && !RT.finished) ||
        (b.dataset.lock !== undefined &&
          (!RT.cur || (+b.dataset.lock > 0 && !RT.cur.conds[+b.dataset.lock - 1])))),
  );
  const accept = $('#accept-contract');
  if (accept) accept.disabled = busy;
  const reroll = $('#reroll');
  if (reroll) {
    const possible =
      !busy &&
      RT.preview &&
      RT.cur &&
      RT.rerolls > 0 &&
      rollDetailed({
        seed: RT.seed,
        r: RT.r + 1,
        heroes: RT.data.heroes,
        challenges: RT.data.challenges,
        o: S,
        locks: RT.locks,
        prev: RT.cur,
        requireChange: true,
        player: S.friend.player,
        same: S.friend.same,
      }).result;
    reroll.disabled = !possible;
    reroll.title = RT.preview && !possible && !busy && RT.rerolls > 0 ? t('noAlternative') : '';
    const hint = $('#reroll-hint');
    if (hint) hint.textContent = reroll.title;
  }
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
const releases = () => releasesOf(RT.data);
const siteVersion = () => siteVersionOf(releases());

// Footer chip: the current version doubles as the entry point to the changelog.
function paintFooterVersion() {
  const button = $('#foot-version');
  if (!button) return;
  const version = siteVersion();
  button.textContent = (version ? 'v' + version + ' · ' : '') + t('whatsNew');
  button.title = t('versionLabel') + (version ? ' ' + version : '');
}

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
let tipId = null;
function viewFieldGuide() {
  const panel = $('#p-guide');
  const current = RT.cur;
  const ids = (current?.conds || []).filter((id) => challengeTips.has(id));
  const active = ids.includes(tipId) ? C(tipId) : null;
  if (active) {
    const hero = H(current.hero);
    panel.innerHTML = `<div class="guide-head"><h1>${t('tab.guide')}</h1></div><article class="guide-sheet contract-advice"><small class="eyebrow">${esc(hero.name)} · ${esc(modeName(current))}</small><h2 tabindex="-1" id="tip-title">${esc(loc(active.name))}</h2><p class="advice-rule">${esc(loc(active.desc))}</p><h3>${t('tipHow')}</h3><p>${esc(loc(challengeTips.get(active.id)))}</p><div class="tip-actions"><button class="pb" data-tip-return="${esc(active.id)}">${t('tipReturn')}</button><button data-tab="guide">${t('tipBrowse')}</button></div></article>`;
    return;
  }
  panel.innerHTML = '<div class="guide-standard"></div>';
  const guide = panel.firstElementChild;
  renderGuide(guide, RT.data.items, S.lang, RT.data.heroes, () => RT.build);
  if (ids.length) {
    const box = document.createElement('section');
    box.className = 'guide-sheet contract-recommendations';
    box.innerHTML = `<h2>${t('tipRelated')}</h2><div class="tip-actions">${ids.map((id) => `<button data-condition-tip="${esc(id)}">${esc(loc(C(id).name))}</button>`).join('')}</div>`;
    panel.prepend(box);
  }
}
function show(tab) {
  RT.tab = tab;
  const context = document.querySelector('.context-name [data-i18n]');
  if (context) {
    context.dataset.i18n = 'tab.' + tab;
    context.textContent = t('tab.' + tab);
  }
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
    guide: viewFieldGuide,
    updates: viewUpdates,
  };
  const view = views[tab];
  if (typeof view === 'function') view();
}

/* ---------- ROULETTE ---------- */
function stampAcceptance(contract) {
  const panel = $('#p-roulette');
  const receipt = document.createElement('div');
  receipt.className = 'acceptance-receipt';
  receipt.setAttribute('role', 'status');
  const seal = document.createElement('div');
  seal.className = 'acceptance-seal';
  const game = document.createElement('small');
  game.textContent = 'CHALLENGELOCK';
  const verdict = document.createElement('strong');
  verdict.textContent = t('acceptedSeal');
  const signature = document.createElement('span');
  signature.textContent =
    H(contract.hero).name + ' · ' + new Date(contract.ts).toLocaleDateString(S.lang);
  seal.append(game, verdict, signature);
  receipt.append(seal);
  panel.append(receipt);
  setTimeout(() => receipt.remove(), 1500);
}
function viewRoulette() {
  const p = $('#p-roulette');
  p.innerHTML =
    `<div class="studio-intro"><div><h1>${t('studioTitle')}</h1><p>${t('rouletteIntro')}</p></div><div class="studio-art" aria-hidden="true"><img src="assets/portraits/abrams.webp" alt=""></div></div><div class="session-toolbar"><span class="session-title">${icon('settings', 16)}${t('sessionSetup')}</span><button id="daily" class="daily-button">${icon('calendar', 16)}${t('daily')}</button></div>` +
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
    <div class="conditions"><div class="folio-heading">${t('challengeRules')}</div>${[1, 2, 3].map((i) => `<div class="reel condition-reel" data-i="${i}"><div class="condition-top"><div class="reel-title"><span class="condition-number">0${i}</span><span>${t('cond')} ${ROMAN[i - 1]}</span></div><button class="lk" data-lock="${i}" aria-label="${t('lock')} — ${t('cond')} ${ROMAN[i - 1]}"></button></div><div class="strip"></div></div>`).join('')}</div></div>
    <div class="filter-summary"><span>${icon('shield', 12)}${heroPool(RT.data.heroes, S).length} ${t('heroesCount')}</span><span class="sep">/</span><span>${S.cats.length} ${t('categoriesCount')}</span><button id="configure-pool" data-tab="custom">${t('configure')}${icon('arrow', 12)}</button></div>
    <div class="board-actions"><button class="spin" id="spin">${icon('shuffle')}<span id="spin-label">${t('spin')}</span><kbd>SPACE</kbd></button></div>
    <details class="board-options"><summary><span>${icon('settings', 14)}${t('extraSettings')}</span>${icon('chevron', 14)}</summary><div class="options-content"><label class="chk"><input type="checkbox" id="snd" ${S.sound ? 'checked' : ''}>${t('soundOn')}</label><label class="chk"><input type="checkbox" id="fsame" ${S.friend.same ? 'checked' : ''}>${t('sameHero')}</label><label class="chk">${t('player')}<input type="number" id="fpl" min="1" max="9" value="${S.friend.player}" class="num" ${S.friend.same ? 'disabled' : ''}></label><p class="keyboard-hint">${t('keys')}</p></div></details>
  </section><section class="paper" id="contract" aria-live="polite" tabindex="-1"></section></div>`;
  $('#p-roulette').classList.toggle('playing-contract', !!RT.cur && !RT.preview && !RT.finished);
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
        ? `<div class="hero-display" data-portrait="${esc(entry.id)}" style="--hero-color:${entry.color}"><img class="contract-portrait" aria-hidden="true" alt="" src="assets/portraits/${esc(entry.id)}.webp"><div class="hero-avatar"><span>${esc(entry.name[0])}</span><img class="pic" src="${esc(entry.icon)}" alt=""></div><div><p>${t('yourHero')}</p><h3>${esc(entry.name)}</h3><div class="hero-context"><span>${modeName(res)}</span><span>${t('diff.' + res.diff)}</span></div></div></div>`
        : `<div class="hero-empty"><div class="portrait-stack">${['abrams', 'ivy', 'haze']
            .map((id) => H(id))
            .filter(Boolean)
            .map((h) => `<img src="${esc(h.icon)}" alt="">`)
            .join(
              '',
            )}</div><div><b>${t('whoNext')}</b><small>${activeHeroes().length} ${t('heroesReady')}</small></div></div>`;
    } else
      el.innerHTML = entry
        ? `<div class="condition-result"><h3>${esc(loc(entry.name))}</h3><p>${esc(loc(entry.desc))}</p>${challengeTips.has(entry.id) ? `<button data-condition-tip="${esc(entry.id)}" class="condition-tip">${t('tipHow')}${icon('arrow', 14)}</button>` : ''}</div>`
        : `<div class="condition-empty">${res ? t('unusedCondition') : t('conditionPlaceholder')}</div>`;
    const lock = $(`.reel[data-i="${i}"] .lk`);
    lock.innerHTML =
      icon(RT.locks[i] ? 'lock' : 'unlock', 12) +
      `<span>${t(RT.locks[i] ? 'locked' : 'lock')}</span>`;
    lock.title = t('lockHelp');
    lock.classList.toggle('on', RT.locks[i]);
    lock.setAttribute('aria-pressed', String(RT.locks[i]));
    lock.disabled = !entry || RT.busy;
    lock.hidden = !entry || !RT.preview;
    if (entry && i > 0 && !RT.preview && !RT.finished && res.conds.length > 1) {
      const auto = verifiedCondition(entry.id);
      const checked = auto || !!res.checked?.includes(entry.id);
      el.insertAdjacentHTML(
        'beforeend',
        `<button class="progress-check" ${auto ? 'disabled' : ''} data-progress="${esc(entry.id)}" aria-pressed="${checked}">${icon(checked ? 'check' : 'plus', 14)} ${t(auto ? 'checkPassed' : checked ? 'markedCondition' : 'markCondition')}</button>`,
      );
    }
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
function verifiedCondition(id) {
  return (
    RT.cur &&
    RT.match?.key === resultKey(RT.cur) &&
    RT.match.checks?.some((c) => c.id === id && c.status === 'pass')
  );
}
function paintContract() {
  desktop?.reportContract?.(
    RT.cur && !RT.preview
      ? {
          key: resultKey(RT.cur),
          label: `${H(RT.cur.hero).name} · ${t('diff.' + RT.cur.diff)}`,
          hero: H(RT.cur.hero)?.name || RT.cur.hero,
          heroId: H(RT.cur.hero)?.apiId,
          selectedAt: RT.cur.ts,
          gameMode: options(RT.cur.opts).gameMode,
          difficulty: t('diff.' + RT.cur.diff),
          conditions: RT.cur.conds.map((id) => {
            const c = C(id);
            return {
              id,
              name: loc(c?.name || id),
              desc: loc(c?.desc || ''),
              checked: !!(RT.cur.checked?.includes(id) || verifiedCondition(id)),
            };
          }),
          mode: modeName(RT.cur),
          timer: mmss(RT.timer.ms),
          outcome: RT.cur?.outcome,
          lang: S.lang,
        }
      : null,
  );
  const el = $('#contract');
  if (!el) return;
  const x = RT.cur;
  el.classList.toggle('finished', RT.finished);
  el.classList.toggle('has-result', !!x);
  if (!x) {
    el.innerHTML = `<div class="contract-top"><span class="eyebrow">${t('yourContract')}</span>${icon('shield', 16)}</div><div class="contract-empty"><div class="contract-illustration">${icon('lock', 28)}</div><h2>${t('emptyTitle')}</h2><p>${t('empty')}</p><div class="steps"><b>1</b>${t('stepSpin')}<span>→</span><b>2</b>${t('stepPlay')}<span>→</span><b>3</b>${t('stepEarn')}</div></div>`;
    return;
  }
  if (RT.preview) {
    el.innerHTML = `<div class="contract-top"><h2>${t('previewTitle')}</h2></div><p class="contract-note">${t('previewNote')}</p><div class="result-actions preview-actions"><button class="pb" id="accept-contract">${t('acceptContract')}</button><button class="reroll-button" id="reroll">${icon('refresh', 17)}${t('reroll')}<small id="rr">${RT.rerolls}</small></button></div><small id="reroll-hint" role="status"></small><div class="share-actions"><button id="cl">${t('copyLink')}</button></div>`;
    return;
  }
  el.innerHTML = `<div class="contract-top"><h2 class="eyebrow">${t('yourContract')}</h2>${difficultyBadge(x)}</div>
  ${RT.finished ? `<div class="completion-status ${x.outcome === 'fail' ? 'failed' : ''}">${icon(x.outcome === 'done' ? 'check' : 'close', 17)}${t(x.outcome === 'done' ? 'completedStatus' : 'failedStatus')}</div>` : ''}
  <div class="result-actions"><button class="pb" id="done" ${RT.finished ? 'disabled' : ''}>${icon('check', 16)}${t('done')}</button><button class="pb o" id="failb" ${RT.finished ? 'disabled' : ''}>${icon('close', 15)}${t('fail')}</button></div>
  ${!RT.finished ? `<button class="pb contract-build" id="contract-build">${icon('layers', 16)}${t('buildThisHero')}</button><p>${RT.ban?.hero === x.hero ? esc(banRule(RT.ban)) : ''}</p><button class="pb" data-tab="ban">${t('addBan')}</button>` : ''}
  <button class="pb friend-challenge" id="cf">${icon('shield', 15)}${t('challengeFriend')}</button>
  ${RT.finished ? `<button class="review-stamp" id="review-stamp">${icon('shield', 17)}${t('reviewStamp')}${icon('arrow', 15)}</button>` : ''}
  <div class="share-actions"><button id="cl">${icon('link', 14)}${t('copyLink')}</button><button id="ct">${icon('copy', 14)}${t('copyText')}</button><button id="cp">${icon('download', 14)}${t('png')}</button></div>
  <div class="contract-seed">SEED / ${esc(x.seed)} · R${x.r}</div>
  ${!RT.finished ? `<footer class="contract-followup">${desktop?.matchState ? `<div data-match-status>${matchStatus()}</div>` : ''}<p class="contract-note">${t('contractDeadline')} ${esc(new Date(x.ts + CONTRACT_DAY).toLocaleString(S.lang, { dateStyle: 'short', timeStyle: 'short' }))}</p></footer>` : ''}`;
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
  checkDeadlines();
  if (RT.busy) return;
  if (RT.cur && !RT.preview && !RT.finished && !opt.result && !opt.seed) return;
  if (reroll && !RT.preview) return;
  if (reroll && $('#reroll')?.title) return toast(t('noAlternative'));
  if (reroll && (!RT.cur || RT.rerolls <= 0)) return toast(t('noRerolls'));
  const seed = reroll ? RT.seed : opt.seed || newSeed(),
    r = reroll ? RT.r + 1 : opt.r || 0;
  const locks = reroll ? RT.locks : [false, false, false, false];
  let res,
    reason = null;
  try {
    if (opt.result) res = restoreResult(opt.result, RT.data.heroes, RT.data.challenges);
    else
      ({ result: res, reason } = rollDetailed({
        seed,
        r,
        heroes: RT.data.heroes,
        challenges: RT.data.challenges,
        o: S,
        locks,
        prev: reroll ? RT.cur : null,
        requireChange: reroll,
        player: S.friend.player,
        same: S.friend.same,
      }));
  } catch (e) {
    console.error(e);
    return toast(t('invalidLink'));
  }
  if (!res) return toast(t(ROLL_FAILURE[reason] || 'noConditions'));
  RT.seed = seed;
  RT.r = r;
  RT.locks = locks;
  RT.rerolls = reroll ? RT.rerolls - 1 : Math.max(0, RT.maxRerolls - r);
  const existing = [...S.history, ...S.favs].find((x) => resultKey(x) === resultKey(res));
  RT.cur = existing || res;
  RT.preview = !existing;
  if (existing && !existing.outcome) {
    useContractHero(existing);
    syncBanHero(existing);
    persist();
  }
  RT.finished = !!RT.cur.outcome;
  RT.timer = { ms: 0, run: false, t0: 0 };
  setHash(RT.cur);
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
    particles(DIFF_COLOR[res.diff]);
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
setInterval(async () => {
  const el = document.getElementById('shop-signal');
  if (!el?.getClientRects().length || !desktop?.shopSignal) return;
  const time = await desktop.shopSignal();
  el.textContent =
    t('modSignal') + ' · ' + (time ? new Date(time).toLocaleTimeString(S.lang) : t('noSignal'));
}, 1500);
function makeRecap(x) {
  const checks = RT.match?.key === resultKey(x) ? RT.match.checks || [] : [];
  const b = RT.build?.hero === x.hero ? RT.build : null;
  return {
    rules: x.conds.map((id) => {
      const status = checks.find((c) => c.id === id)?.status;
      return ['pass', 'fail'].includes(status)
        ? status
        : x.checked?.includes(id)
          ? 'marked'
          : 'unknown';
    }),
    build: b
      ? { bought: b.purchased.length, total: b.items.length, skill: b.skillIndex || 0 }
      : null,
  };
}
function checkDeadlines() {
  const failed = expireContracts(S);
  if (!failed.size) return;
  persist();
  if (RT.cur && failed.has(resultKey(RT.cur))) {
    $('#p-roulette')?.classList.remove('playing-contract');
    RT.cur.recap = makeRecap(RT.cur);
    for (const entry of [...S.history, ...S.favs])
      if (resultKey(entry) === resultKey(RT.cur)) entry.recap = RT.cur.recap;
    persist();
    RT.cur.outcome = 'fail';
    RT.finished = true;
    setBusy(RT.busy);
    RT.timer.run = false;
    paintContract();
    if (RT.tab === 'roulette') showCelebration(RT.cur, H(RT.cur.hero), RT.data.challenges);
  }
  paintHeader();
  if (RT.tab === 'history') viewHistory();
}
function finish(o, reason = 'manual') {
  checkDeadlines();
  const x = RT.cur;
  if (!x || RT.preview || RT.finished) return;
  RT.finished = true;
  setBusy(RT.busy);
  RT.timer.run = false;
  const completion = { recap: makeRecap(x), outcome: o, reason, endedAt: Date.now() };
  if (RT.match?.key === resultKey(x) && RT.match.matchId && RT.match.matchTime) {
    completion.matchId = RT.match.matchId;
    completion.matchTime = RT.match.matchTime;
  }
  Object.assign(x, completion);
  for (const entry of [...S.favs, ...S.history])
    if (resultKey(entry) === resultKey(x)) Object.assign(entry, completion);
  if (o === 'done') {
    S.stats.done++;
  } else S.stats.fail++;
  persist();
  viewRoulette();
  paintHeader();
  if (RT.tab === 'history') renderJournalRows();
  // paintContract reports the final result; the shell excludes it from match tracking.
  beep(o === 'done' ? 880 : 140, 0.2);
  showCelebration(x, H(x.hero), RT.data.challenges);
}
setInterval(() => {
  const T = RT.timer;
  if (T.run) {
    T.ms = Date.now() - T.t0;
    const e = $('#tm');
    if (e) e.textContent = mmss(T.ms);
    desktop?.reportTimer?.(mmss(T.ms));
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
    color: DIFF_COLOR[x.diff],
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

// Same seed, another hero: the link hands the friend their own contract instead of
// a copy of yours, which is the whole point of a duel between two players.
async function friendChallenge() {
  const x = RT.cur;
  if (!x) return;
  const o = options(x.opts || S);
  for (const player of [2, 3, 4, 5, 6, 7, 8, 9]) {
    const { result } = rollDetailed({
      seed: x.seed,
      r: x.r,
      heroes: RT.data.heroes,
      challenges: RT.data.challenges,
      o,
      same: false,
      player,
    });
    if (result && result.hero !== x.hero)
      return toast((await copy(linkFor(result))) ? t('friendCopied') : t('error'));
  }
  return toast(t('noConditions'));
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
    countEl.textContent = t('poolCount')
      .replace('{n}', available)
      .replace('{total}', activeHeroes().length);
    const eligible = new Set(heroPool(RT.data.heroes, S).map((h) => h.id));
    $$('[data-pool-label]').forEach((el) => {
      el.textContent = t(eligible.has(el.dataset.poolLabel) ? 'inPool' : 'outPool');
    });
    countEl.classList.toggle('warning', available === 0);
  }
  const empty = $('#hero-search-empty');
  if (empty) empty.hidden = count > 0;
}
function poolCheck() {
  const works = (o) =>
    rollDetailed({
      seed: 'filter-check',
      heroes: RT.data.heroes,
      challenges: RT.data.challenges,
      o,
    }).result;
  const label = modeName() + ' · ' + t('diff.' + S.diff);
  if (works(S)) return esc(label) + ' — ' + t('poolReady');
  const fixes = [
    ['heroes', { excluded: [], only: [] }],
    ['cats', { cats: ALL_CATS }],
    ['team', { team: true }],
    ['cats-team', { cats: ALL_CATS, team: true }],
    ['heroes-cats', { excluded: [], only: [], cats: ALL_CATS }],
    ['heroes-team', { excluded: [], only: [], team: true }],
    ['heroes-cats-team', { excluded: [], only: [], cats: ALL_CATS, team: true }],
  ];
  const fix = fixes.find(([, patch]) => works({ ...S, ...patch }));
  return (
    esc(label) +
    ' — ' +
    t(heroPool(RT.data.heroes, S).length ? 'poolNoSet' : 'poolNoHero') +
    (fix
      ? ` <button data-filter-fix="${fix[0]}">${fix[0]
          .split('-')
          .map((k) => t('fix.' + k))
          .join(' + ')}</button>`
      : '')
  );
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
  )}</div><div class="hero-tools"><label class="search-wrap">${icon('search', 16)}<input class="search-input" id="hero-search" type="search" placeholder="${t('searchHeroes')}" aria-label="${t('searchHeroes')}" value="${esc(RT.heroSearch || '')}"></label><span class="hero-count" id="hero-count" aria-live="polite"></span><button id="hreset">${t('fix.heroes')}</button></div>
  <div class="hg">${activeHeroes()
    .map(
      (h) =>
        `<label class="hc" data-search="${esc((h.name + ' ' + h.id).toLowerCase())}"><input type="checkbox" data-h="${h.id}" ${S.sel.includes(h.id) ? 'checked' : ''}>${dia(h)}<span>${esc(h.name)}<small data-pool-label="${esc(h.id)}"></small></span></label>`,
    )
    .join(
      '',
    )}</div><p class="search-empty" id="hero-search-empty" hidden>${t('noSearchResults')}</p><div class="pool-check" aria-live="polite">${poolCheck()}</div><button id="back-to-roll">${t('backToRoll')}</button></div>` +
    gameCard() +
    overlayCard();
  updateHeroSearch();
  updatePreview();
}
function updatePreview() {
  const el = $('#overlay-example');
  if (!el) return;
  const s = RT.overlay,
    shop = (s.mode || 'shop') === 'shop',
    x = RT.cur && !RT.preview ? RT.cur : null;
  const rows = x
    ? x.conds
        .filter((id) => !shop || !(x.checked?.includes(id) || verifiedCondition(id)))
        .map((id) => loc(C(id).name))
    : [t('exampleCondition1'), t('exampleCondition2'), t('exampleCondition3')];
  const b = RT.build,
    next = b?.items.find(
      (id) => !b.purchased.includes(id) && !(RT.ban?.hero === b.hero && RT.ban.item === id),
    );
  const i = RT.data.items.find((i) => i.id === next);
  el.style.opacity = s.opacity ?? 0.92;
  el.style.width = Math.round((s.width || 360) * 0.8) + 'px';
  const purchase =
    s.showBuild !== false &&
    esc(t('nextPurchase') + ' · ' + (i ? i.name + ' · ' + i.cost : t('examplePurchase')));
  el.innerHTML = [
    shop && purchase,
    shop && RT.ban && esc(banRule(RT.ban)),
    s.showHero !== false && `<strong>${esc(x ? H(x.hero).name : 'Abrams')}</strong>`,
    s.showStatus !== false && t('sessionActive'),
    s.showConditions !== false && rows.map((r) => esc(r)).join('<br>'),
    shop &&
      s.showConditions !== false &&
      x &&
      x.conds.length > rows.length &&
      esc(t('markedCondition') + ' · ' + (x.conds.length - rows.length)),
    !shop && s.showTimer !== false && '02:15',
    !shop && purchase,
  ]
    .filter(Boolean)
    .map((v) => `<div>${v}</div>`)
    .join('');
}
function overlayCard() {
  const s = { mode: 'shop', ...RT.overlay };
  const positions = ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center'];
  return `<div class="card"><div class="section-heading"><div><h2>${t('overlayTitle')}</h2><p>${t('overlayHint')}</p></div>${icon('layers', 20)}</div>
    <div class="overlay-controls">${desktop?.overlayState ? '' : `<p class="lab-help">${t('browserOverlayHint')}</p>`}<div class="overlay-modes">${['shop', 'match', 'manual'].map((m) => `<button data-overlay-mode="${m}" aria-pressed="${(s.mode || 'shop') === m}">${t('overlayMode.' + m)}</button>`).join('')}</div><p>${t(s.mode === 'shop' || !s.mode ? 'shopModeHint' : 'normalModeHint')}</p><div id="overlay-example" aria-label="${t('previewTitle')}"></div>
      <button ${s.mode === 'shop' ? 'hidden' : ''} id="overlay-toggle" ${desktop?.toggleOverlay ? '' : 'disabled'} class="pb">${icon('play', 16)}${t('overlayToggle')}</button>
      <label class="lab-field">${t('overlayOpacity')}<input type="range" id="overlay-opacity" min="0.35" max="1" step="0.01" value="${s.opacity ?? 0.92}"></label>
      <div class="overlay-position-grid">
        ${positions.map((p) => `<button type="button" class="overlay-pos ${p === s.position ? 'on' : ''}" data-overlay-pos="${p}" aria-pressed="${p === s.position}">${t('pos.' + p)}</button>`).join('')}
      </div>
      <label class="lab-field">${t('overlaySize')}<input type="range" id="overlay-size" min="70" max="160" step="1" value="${Math.round(((s.width || 360) / 360) * 100)}"></label>
      <div class="overlay-size-readout">${s.width || 360} × ${s.height || 440}</div>
      ${desktop?.shopTraining ? `<div class="shop-test"><button id="shop-training">${t('shopTest')}</button><small id="shop-signal"></small></div>` : ''}
      <button id="overlay-reset" class="ghost">${t('overlayReset')}</button>
      <label class="chk" ${s.mode === 'shop' ? 'hidden' : ''}><input type="checkbox" id="overlay-clickthrough" ${s.clickThrough ? 'checked' : ''}>${t('overlayClickThrough')}</label>
      <label class="chk"><input type="checkbox" id="overlay-show-hero" ${s.showHero !== false ? 'checked' : ''}>${t('overlayShowHero')}</label>
      <label class="chk"><input type="checkbox" id="overlay-show-conditions" ${s.showConditions !== false ? 'checked' : ''}>${t('overlayShowConditions')}</label>
      <label class="chk" ${s.mode === 'shop' ? 'hidden' : ''}><input type="checkbox" id="overlay-show-timer" ${s.showTimer !== false ? 'checked' : ''}>${t('overlayShowTimer')}</label>
      <label class="chk"><input type="checkbox" id="overlay-show-status" ${s.showStatus !== false ? 'checked' : ''}>${t('overlayShowStatus')}</label>
      <label class="chk" ${s.mode === 'shop' ? 'hidden' : ''}><input type="checkbox" id="overlay-lock" ${s.lockPosition ? 'checked' : ''}>${t('overlayLock')}</label>
      <label class="chk"><input type="checkbox" id="overlay-show-build" ${s.showBuild !== false ? 'checked' : ''}>${t('overlayShowBuild')}</label>
    </div></div>`;
}
// Desktop only: where the game lives and what its console log says. This panel is the
// ground truth we need before the shell can close contracts by itself.
function matchStatus() {
  const m = RT.match || {};
  const en = S.lang === 'en';
  const phase = {
    idle: en ? 'Waiting for a match' : 'Ожидание матча',
    waiting: en ? 'Challenge ready — waiting for a match' : 'Челлендж выбран — ожидание матча',
    playing: en ? 'Match in progress' : 'Матч идёт',
    ended: en ? 'Match ended' : 'Матч закончился',
    interrupted: en
      ? 'Disconnected — result needs confirmation'
      : 'Соединение прервано — результат нужно подтвердить',
  };
  const api = {
    disabled: en ? 'API disabled' : 'API отключён',
    'no-account': en ? 'Sign in to Steam' : 'Войди в Steam',
    ready: en ? 'API connected' : 'API подключён',
    loading: en ? 'Checking match history…' : 'Проверяю историю матчей…',
    waiting: en
      ? 'Waiting for match data. You can confirm manually.'
      : 'Ожидаю данные матча. Можно подтвердить результат вручную.',
    unavailable: en
      ? 'API unavailable; will retry automatically.'
      : 'API недоступен; повторю запрос автоматически.',
    verified: en ? 'Match statistics received' : 'Статистика матча получена',
  };
  const current = RT.cur && m.key === resultKey(RT.cur);
  const checks = current ? m.checks || [] : [];
  let review = '';
  if (current && !RT.finished && m.candidates?.length) {
    const label = (c) =>
      (RT.data.heroes.find((h) => h.apiId === c.hero)?.name || '—') +
      ' · ' +
      new Date(c.time).toLocaleString(S.lang) +
      ' · #' +
      c.id;
    const selected = m.candidates.find((c) => c.id === m.matchId);
    review =
      '<div class="match-review">' +
      (selected ? '<strong>' + esc(label(selected)) + '</strong>' : '') +
      m.candidates
        .filter((c) => c.id !== m.matchId)
        .map(
          (c) =>
            `<button data-match-pick="${Number(c.id)}">${en ? 'Select match' : 'Выбрать матч'} · ${esc(label(c))}</button>`,
        )
        .join('') +
      (selected && m.outcome
        ? `<button class="pb" data-match-accept>${en ? 'Confirm result' : 'Подтвердить результат'}</button>`
        : '') +
      '</div>';
  }
  if (checks.length) {
    const groups = [
      ['checkPassed', checks.filter((c) => c.status === 'pass')],
      ['checkFailed', checks.filter((c) => c.status === 'fail')],
      [
        'checkManual',
        checks.filter((c) => c.status === 'manual' && !RT.cur.checked?.includes(c.id)),
      ],
      [
        'checkMarked',
        checks.filter((c) => c.status === 'manual' && RT.cur.checked?.includes(c.id)),
      ],
    ];
    return (
      '<div class="match-status">' +
      review +
      groups
        .filter(([, cs]) => cs.length)
        .map(
          ([key, cs]) =>
            `<section><strong>${t(key)}</strong><ul>${cs.map((c) => `<li>${esc(C(c.id) ? loc(C(c.id).name) : c.name || c.id)}${c.status === 'manual' ? '' : ` · ${esc(c.value)} / ${esc(c.target)}`}</li>`).join('')}</ul></section>`,
        )
        .join('') +
      '</div>'
    );
  }
  const late = m.phase === 'playing' && !current;
  return `<div class="match-status">${review}<strong>${esc(phase[m.phase] || phase.idle)}</strong><small>${esc(api[m.api] || '')}</small>${late ? `<small>${en ? 'Joined an ongoing match. Automatic completion is available from the next match.' : 'Подключились к уже начатому матчу. Автозачёт доступен со следующего матча.'}</small>` : ''}${['stale', 'missing'].includes(m.logHealth) ? `<small>${en ? 'No fresh log. Add -condebug in Steam launch options and restart Deadlock.' : 'Нет свежего журнала. Нужен -condebug в параметрах Steam и перезапуск Deadlock.'}</small>` : ''}${current && m.matchId ? `<small>${en ? 'Match' : 'Матч'} #${m.matchId} · ${m.stats?.kills ?? '—'}/${m.stats?.deaths ?? '—'}/${m.stats?.assists ?? '—'}</small>` : ''}</div>`;
}
function updateMatch(state) {
  if (!state) return;
  syncTimeline(state);
  const previous = RT.match;
  RT.match = state;
  if (RT.ban && previous?.phase === 'playing' && ['ended', 'interrupted'].includes(state.phase)) {
    clearBan();
    persist();
    renderBan();
    renderBuilder();
    paintContract();
  }
  const current = !RT.preview && RT.cur && state.key === resultKey(RT.cur) && !RT.finished;
  if (
    current &&
    state.phase === 'playing' &&
    (previous?.phase !== 'playing' || previous?.key !== state.key)
  ) {
    RT.timer = { ms: Math.max(0, Date.now() - state.startedAt), t0: state.startedAt, run: true };
    paintContract();
  }
  if (current && ['ended', 'interrupted'].includes(state.phase)) {
    RT.timer.run = false;
    if (Number.isFinite(state.durationMs)) RT.timer.ms = state.durationMs;
    const timer = $('#tm');
    if (timer) timer.textContent = mmss(RT.timer.ms);
    desktop?.reportTimer?.(mmss(RT.timer.ms));
    if (!state.candidates?.length && ['done', 'fail'].includes(state.outcome))
      finish(state.outcome, 'match');
    else if (
      previous?.phase !== state.phase ||
      JSON.stringify(previous?.checks) !== JSON.stringify(state.checks)
    ) {
      paintContract();
      paintReels(RT.cur, false);
    }
  }
  $$('[data-match-status]').forEach((el) => {
    el.innerHTML = matchStatus();
  });
  if ($('#connection-summary')) $('#connection-summary').innerHTML = connectionSummary();
  const toggle = $('#match-api-enabled');
  if (toggle) toggle.checked = state.enabled === true;
}
function connectionSummary() {
  const m = RT.match || {};
  const log = {
    ready: 'logReady',
    receiving: 'logReady',
    missing: 'logMissing',
    stale: 'logStale',
    'not-running': 'logStopped',
  };
  const api = {
    disabled: 'apiOff',
    'no-account': 'apiAccount',
    unavailable: 'apiError',
    ready: 'apiReady',
    verified: 'apiReady',
    waiting: 'apiWait',
    loading: 'apiWait',
  };
  return `<p>${t('matchDetection')} · ${t(log[m.logHealth] || 'statusUnknown')}</p><p>${t('matchHistory')} · ${t(api[m.api] || 'statusUnknown')}</p>`;
}
function gameCard() {
  const en = S.lang === 'en';
  return `<div class="card"><div class="section-heading"><div><h2>${t('gameTitle')}</h2><p>${t('gameHint')}</p></div>${icon('search', 20)}</div><div id="connection-summary">${desktop?.game ? connectionSummary() : esc(t('desktopGameHint'))}</div><label class="chk"><input type="checkbox" id="match-api-enabled" ${desktop?.setMatchEnabled ? '' : 'disabled'} ${RT.match?.enabled ? 'checked' : ''}>${en ? 'Check my matches using Deadlock API' : 'Проверять мои матчи через Deadlock API'}</label><p class="lab-help">${en ? 'Sends the active Steam Account ID to api.deadlock-api.com. No API key required. Unsupported conditions stay manual; history may arrive late.' : 'Передаёт ID активного Steam-аккаунта на api.deadlock-api.com. Ключ не нужен. Недоступные в статистике условия проверяются вручную; данные могут задерживаться.'}</p><button id="match-refresh" ${desktop?.refreshMatch ? '' : 'disabled'}>${en ? 'Check match data' : 'Проверить данные матча'}</button><details><summary>${t('diagnostics')}</summary><div data-match-status>${matchStatus()}</div><button id="game-probe" ${desktop?.game ? '' : 'disabled'}>${icon('search', 14)}${t('gameFind')}</button><div id="game-result" class="game-result" aria-live="polite"></div></details></div>`;
}

async function probeGameDesktop() {
  const box = $('#game-result');
  if (!box || !desktop?.game) return;
  box.textContent = t('gameSearching');
  try {
    const info = await desktop.game();
    if (!info || !info.install) {
      box.innerHTML =
        `<p>${t('gameNotFound')}</p>` +
        (info?.candidates || []).map((candidate) => `<code>${esc(candidate)}</code>`).join('');
      return;
    }
    const tail = await desktop.gameLog(40);
    const lines = tail?.lines || [];
    box.innerHTML =
      `<p>${esc(info.install)}</p>` +
      `<p>${esc(info.log?.exists ? t('gameLogFound') : t('gameNoLog'))}</p>` +
      (lines.length ? `<pre class="game-log">${esc(lines.join('\n'))}</pre>` : '');
  } catch (error) {
    console.error(error);
    box.textContent = t('gameFailed');
  }
}
let journalSearch = '',
  onlyFavorites = false;
let journalRecords = [];
function remaining(ts) {
  const minutes = Math.max(0, Math.ceil((ts + CONTRACT_DAY - Date.now()) / 60000));
  return t('journalLeft')
    .replace('{h}', Math.floor(minutes / 60))
    .replace('{m}', minutes % 60);
}
function journalStatus(x) {
  if (!x.outcome) return remaining(x.ts);
  if (x.reason === 'deadline') return t('journalExpired');
  const label = t(x.outcome === 'done' ? 'completedStatus' : 'failedStatus');
  return x.reason
    ? label + ' · ' + t(x.reason === 'match' ? 'journalVerified' : 'journalManual')
    : label;
}
function renderJournalRows() {
  const list = $('#journal-list');
  if (!list) return;
  const open = new Set(
    Array.from(list.querySelectorAll('details[open]')).map((el) => el.dataset.key),
  );
  const favorites = new Set(S.favs.map(resultKey));
  const records = new Map(S.favs.map((x) => [resultKey(x), x]));
  for (const x of S.history) records.set(resultKey(x), x);
  journalRecords = Array.from(records.values())
    .filter((x) => {
      const text = [
        H(x.hero)?.name || x.hero,
        ...x.conds.map((id) => (C(id) ? loc(C(id).name) : id)),
      ]
        .join(' ')
        .toLocaleLowerCase();
      return (
        (!onlyFavorites || favorites.has(resultKey(x))) &&
        text.includes(journalSearch.trim().toLocaleLowerCase())
      );
    })
    .sort(
      (a, b) =>
        Number(!!a.outcome) - Number(!!b.outcome) || (b.endedAt || b.ts) - (a.endedAt || a.ts),
    );
  let lastGroup = '';
  list.innerHTML =
    journalRecords
      .map((x, index) => {
        const hero = H(x.hero),
          key = resultKey(x);
        const group = x.outcome
          ? new Date(x.endedAt || x.ts).toLocaleDateString(S.lang, { dateStyle: 'long' })
          : t('journalActive');
        const heading = group !== lastGroup ? `<h3>${esc(group)}</h3>` : '';
        lastGroup = group;
        return (
          heading +
          `<details class="journal-record" data-key="${esc(key)}" ${open.has(key) ? 'open' : ''}><summary>${hero ? dia(hero) : ''}<span><b>${esc(hero?.name || x.hero)}</b> ${favorites.has(key) ? icon('star', 14) : ''}<small>${modeName(x)} · ${t('diff.' + x.diff)}</small></span><strong ${!x.outcome ? `data-countdown="${Number(x.ts)}"` : ''}>${esc(journalStatus(x))}</strong></summary>
      <p>${t('journalStarted')} · ${esc(new Date(x.ts).toLocaleString(S.lang))}</p>
      ${x.matchId && x.matchTime ? `<p>${esc(hero?.name || x.hero)} · #${Number(x.matchId)} · ${esc(new Date(x.matchTime).toLocaleString(S.lang))}</p>` : ''}
      <ol>${x.conds
        .map((id) => {
          const c = C(id);
          return `<li><b>${x.checked?.includes(id) ? '✓ ' : ''}${esc(c ? loc(c.name) : id)}</b><p>${esc(c ? loc(c.desc) : '')}</p></li>`;
        })
        .join('')}</ol>
      <div class="journal-actions">${x.outcome ? `<button data-journal-stamp="${index}">${t('reviewStamp')}</button><button data-journal-repeat="${index}">${t('journalRepeat')}</button>` : `<button data-journal-resume="${index}">${t('journalResume')}</button>`}</div></details>`
        );
      })
      .join('') ||
    `<p>${t(journalSearch ? 'noSearchResults' : onlyFavorites ? 'noFavs' : 'noHist')}</p>`;
}
function viewHistory() {
  const total = S.stats.done + S.stats.fail;
  const recent = S.history.filter((x) => x.outcome);
  const firstFailure = recent.findIndex((x) => x.outcome === 'fail');
  const streak = firstFailure < 0 ? recent.length : firstFailure;
  const counts = new Map();
  for (const x of recent)
    if (x.outcome === 'done') counts.set(x.hero, (counts.get(x.hero) || 0) + 1);
  const top = Array.from(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  $('#p-history').innerHTML =
    intro(t('historyTitle'), t('historyIntro')) +
    `
    <section class="card"><div class="journal-tools"><input id="journal-search" type="search" aria-label="${t('journalSearch')}" placeholder="${t('journalSearch')}" value="${esc(journalSearch)}"><button id="journal-favorites" aria-pressed="${onlyFavorites}">${icon('star', 16)} ${t('favs')}</button></div><div id="journal-list"></div></section>
    <section class="card"><h2>${t('journalAllTime')}</h2><div class="journal-stats">${[
      ['won', S.stats.done],
      ['lost', S.stats.fail],
      ['successRate', total ? Math.round((S.stats.done * 100) / total) + '%' : '—'],
    ]
      .map(([k, v]) => `<div>${t(k)} <b>${v}</b></div>`)
      .join('')}</div></section>
    <section class="card"><h2>${t('journalRecent')}</h2><p>${t('streak')} · ${streak}</p><h3>${t('topHeroes')}</h3>${top.length ? top.map(([id, n]) => `<p>${esc(H(id)?.name || id)} · ${n}</p>`).join('') : t('noStats')}</section>
    <details class="card"><summary>${t('backupTitle')}</summary><p>${t('backupHint')}</p><div class="backup-actions"><button id="export-data">${t('exportData')}</button><button id="import-data">${t('importData')}</button><input id="import-file" type="file" accept="application/json,.json" hidden></div></details>`;
  renderJournalRows();
}
// Local-only data never leaves the browser on its own: give the player a file.
function exportData() {
  const payload = {
    v: 1,
    exportedAt: new Date().toISOString(),
    history: S.history,
    favs: S.favs,
    stats: S.stats,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'challengelock-backup.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
async function importData(file) {
  if (!file) return;
  let parsed;
  try {
    parsed = JSON.parse(await file.text());
  } catch (e) {
    console.warn(e);
    return toast(t('importFailed'));
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    return toast(t('importFailed'));
  if (!Array.isArray(parsed.history) && !Array.isArray(parsed.favs))
    return toast(t('importFailed'));
  const clean = normalizeState({ ...S, ...parsed }, S);
  const dedupe = (list) => {
    const seen = new Set();
    return list.filter((x) => {
      try {
        restoreResult(x, RT.data.heroes, RT.data.challenges);
      } catch {
        return false;
      }
      const key = resultKey(x);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  S.history = dedupe(clean.history).slice(0, 50);
  S.favs = dedupe(clean.favs).slice(0, 50);
  S.stats = clean.stats;
  persist();
  show('history');
  toast(`${t('importDone')} ${S.history.length} / ${S.favs.length}`);
}

/* ---------- UPDATES ---------- */
function viewUpdates() {
  renderUpdates($('#p-updates'), releases(), S.lang);
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
    if (b.dataset.windowAction) {
      if (b.dataset.windowAction === 'minimize') desktop?.minimizeWindow?.();
      if (b.dataset.windowAction === 'maximize') desktop?.maximizeWindow?.();
      if (b.dataset.windowAction === 'close') desktop?.closeWindow?.();
      return;
    }
    const d = b.dataset;
    if (b.id === 'back-to-roll') {
      show('roulette');
      $('#configure-pool')?.focus();
      return;
    }
    if (b.id === 'journal-favorites') {
      onlyFavorites = !onlyFavorites;
      b.setAttribute('aria-pressed', String(onlyFavorites));
      renderJournalRows();
      return;
    }
    if (d.journalStamp !== undefined) {
      const x = journalRecords[Number(d.journalStamp)];
      if (x?.outcome) showCelebration(x, H(x.hero), RT.data.challenges);
      return;
    }
    if (d.journalRepeat !== undefined || d.journalResume !== undefined) {
      const x = journalRecords[Number(d.journalRepeat ?? d.journalResume)];
      if (!x) return;
      const next = d.journalRepeat !== undefined ? { ...x, seed: crypto.randomUUID(), r: 0 } : x;
      return fromHash(parseHash(new URL(linkFor(next)).hash));
    }
    if (d.conditionTip && RT.cur?.conds.includes(d.conditionTip)) {
      tipId = d.conditionTip;
      show('guide');
      $('#tip-title')?.focus();
      return;
    }
    if (d.tipReturn) {
      tipId = null;
      show('roulette');
      document.querySelector('[data-condition-tip="' + CSS.escape(d.tipReturn) + '"]')?.focus();
      return;
    }
    if (d.tab) {
      tipId = null;
      show(d.tab);
      if (b.id === 'configure-pool') $('#hero-search')?.focus();

      return;
    }
    if (d.filterFix) {
      if (d.filterFix.includes('heroes')) {
        S.sel = [];
        S.heroMode = 'exclude';
        applyHeroSel();
      }
      if (d.filterFix.includes('cats')) S.cats = [...ALL_CATS];
      if (d.filterFix.includes('team')) S.team = true;
      persist();
      viewCustom();
      return;
    }
    if (d.overlayMode) {
      RT.overlay.mode = d.overlayMode;
      await desktop?.setOverlaySettings?.({ mode: d.overlayMode });
      viewCustom();
      return;
    }
    if (RT.busy) return;
    if (await builderClick(b, toast, persist)) return;
    if (await banClick(b, toast, persist)) {
      if (['apply-ban', 'clear-ban'].includes(b.id)) {
        renderBuilder();
        paintContract();
      }
      return;
    }
    if (b.id === 'match-refresh') {
      updateMatch(await desktop?.refreshMatch?.());
      return;
    }
    if (b.id === 'overlay-toggle') {
      desktop?.toggleOverlay?.();
      return;
    }
    if (b.dataset.overlayPos) {
      const pos = b.dataset.overlayPos;
      RT.overlay = { ...RT.overlay, position: pos, bounds: null };
      desktop?.setOverlaySettings?.({ position: pos, bounds: null, resetPosition: true });
      viewCustom();
      return;
    }
    if (b.id === 'shop-training') return desktop?.shopTraining?.(S.lang);
    if (b.id === 'overlay-reset') {
      RT.overlay = {
        ...RT.overlay,
        bounds: null,
        position: 'top-right',
        width: null,
        height: null,
      };
      desktop?.setOverlaySettings?.({
        resetPosition: true,
        bounds: null,
        position: 'top-right',
        width: null,
        height: null,
      });
      viewCustom();
      return;
    }
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
      RT.preview = false;
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
      setBusy(false);
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
      setBusy(false);
      return;
    }
    if (b.id === 'review-stamp' && RT.cur && RT.finished)
      return showCelebration(RT.cur, H(RT.cur.hero), RT.data.challenges);
    if (b.id === 'contract-build' && RT.cur && !RT.preview && !RT.finished) {
      S.buildSettings.heroId = RT.cur.hero;
      persist();
      show('build');
      $('#rb')?.focus();
      return;
    }
    if (b.id === 'accept-contract' && RT.cur && RT.preview) {
      RT.cur.ts = Date.now();
      RT.preview = false;
      useContractHero(RT.cur);
      syncBanHero(RT.cur);
      S.history = [RT.cur, ...S.history.filter((x) => resultKey(x) !== resultKey(RT.cur))].slice(
        0,
        50,
      );
      persist();
      viewRoulette();
      stampAcceptance(RT.cur);
      return;
    }
    if (b.dataset.progress && RT.cur && !RT.preview && !RT.finished) {
      const id = b.dataset.progress;
      const checked = RT.cur.checked || [];
      RT.cur.checked = checked.includes(id)
        ? checked.filter((value) => value !== id)
        : [...checked, id];
      for (const f of S.favs) if (resultKey(f) === resultKey(RT.cur)) f.checked = RT.cur.checked;
      persist();
      paintReels(RT.cur, false);
      paintContract();
      document.querySelector('[data-progress="' + CSS.escape(id) + '"]')?.focus();
      return;
    }
    if (b.dataset.matchPick && RT.cur && !RT.finished)
      return desktop?.chooseMatch?.(resultKey(RT.cur), Number(b.dataset.matchPick));
    if (
      b.hasAttribute('data-match-accept') &&
      RT.cur &&
      RT.match?.key === resultKey(RT.cur) &&
      ['done', 'fail'].includes(RT.match.outcome)
    )
      return finish(RT.match.outcome, 'match');
    if (b.id === 'done') return finish('done');
    if (b.id === 'failb') return finish('fail');
    if (b.id === 'cl') return toast((await copy(linkFor(RT.cur))) ? t('copied') : t('error'));
    if (b.id === 'ct') return toast((await copy(resText(RT.cur))) ? t('copied') : t('error'));
    if (b.id === 'cp') return png();
    if (b.id === 'cf') return friendChallenge();
    if (b.id === 'export-data') return exportData();
    if (b.id === 'game-probe') return probeGameDesktop();
    if (b.id === 'import-data') {
      $('#import-file')?.click();
      return;
    }
    if (d.hm) {
      S.heroMode = d.hm;
      applyHeroSel();
      return viewCustom();
    }
    if (b.id === 'hreset') {
      S.heroMode = 'exclude';
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
    } else if (i.id === 'import-file') {
      importData(i.files?.[0]);
      i.value = '';
    } else if (i.id === 'match-api-enabled') {
      desktop
        ?.setMatchEnabled?.(i.checked)
        .then(updateMatch)
        .catch(() => toast(t('gameFailed')));
    } else if (i.id === 'overlay-toggle') {
      desktop?.toggleOverlay?.();
    } else if (
      i.id === 'overlay-clickthrough' ||
      i.id === 'overlay-autoshow' ||
      i.id === 'overlay-autohide' ||
      i.id === 'overlay-position' ||
      i.id === 'overlay-show-hero' ||
      i.id === 'overlay-show-conditions' ||
      i.id === 'overlay-show-timer' ||
      i.id === 'overlay-show-status' ||
      i.id === 'overlay-lock' ||
      i.id === 'overlay-show-build' ||
      i.id === 'overlay-width' ||
      i.id === 'overlay-height' ||
      i.id === 'overlay-reset'
    ) {
      const settings = {
        clickThrough: $('#overlay-clickthrough')?.checked ?? RT.overlay.clickThrough,
        autoShow: $('#overlay-autoshow')?.checked ?? RT.overlay.autoShow,
        autoHide: $('#overlay-autohide')?.checked ?? RT.overlay.autoHide,
        position: $('#overlay-position')?.value ?? RT.overlay.position,
        showHero: $('#overlay-show-hero')?.checked ?? RT.overlay.showHero,
        showConditions: $('#overlay-show-conditions')?.checked ?? RT.overlay.showConditions,
        showTimer: $('#overlay-show-timer')?.checked ?? RT.overlay.showTimer,
        showStatus: $('#overlay-show-status')?.checked ?? RT.overlay.showStatus,
        lockPosition: $('#overlay-lock')?.checked ?? RT.overlay.lockPosition,
        showBuild: $('#overlay-show-build')?.checked ?? RT.overlay.showBuild,
        width: Number($('#overlay-width')?.value) || RT.overlay.width,
        height: Number($('#overlay-height')?.value) || RT.overlay.height,
        resetPosition: i.id === 'overlay-reset',
      };
      RT.overlay = { ...RT.overlay, ...settings };
      desktop?.setOverlaySettings?.(settings);
      updatePreview();
    }
    if (i.dataset.cat || i.dataset.h || i.id === 'team') $('.pool-check').innerHTML = poolCheck();
  });
  document.addEventListener('input', (e) => {
    const i = e.target;
    if (i.id === 'overlay-opacity') {
      const opacity = Number(i.value);
      RT.overlay.opacity = opacity;
      desktop?.setOverlaySettings?.({ opacity });
      updatePreview();
    } else if (i.id === 'overlay-size') {
      const scale = Number(i.value) / 100;
      const width = Math.round(360 * scale);
      const height = Math.round(440 * scale);
      RT.overlay = { ...RT.overlay, width, height, bounds: null };
      desktop?.setOverlaySettings?.({ width, height });
      const readout = document.querySelector('.overlay-size-readout');
      updatePreview();
      if (readout) readout.textContent = width + ' × ' + height;
    }
  });
  document.addEventListener('input', (e) => {
    if (e.target.id === 'journal-search') {
      journalSearch = e.target.value;
      renderJournalRows();
      return;
    }
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
      if (e.target.matches?.('img.contract-portrait')) {
        e.target.parentElement.classList.add('missing-portrait');
        e.target.remove();
        return;
      }
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
  if (desktop) {
    document.body.classList.add('desktop');
    desktop.appVersion?.().then((version) => {
      const label = document.querySelector('.titlebar-version');
      if (label && version) label.textContent = version;
    });
  }
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
          return [
            {
              ...restoreResult(x, h.heroes, c.challenges),
              outcome: x.outcome,
              reason: x.reason,
              recap: x.recap,
              matchId: x.matchId,
              matchTime: x.matchTime,
              endedAt: x.endedAt,
              checked: x.checked || [],
            },
          ];
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
  if (h) await fromHash(h);
  else {
    const pending = S.history.find((x) => !x.outcome);
    if (pending && !new URLSearchParams(location.search).has('daily'))
      await fromHash(parseHash(new URL(linkFor(pending)).hash));
    show(initialTab());
    // A PWA shortcut for the daily challenge opens the app with the roll already made.
    if (new URLSearchParams(location.search).has('daily'))
      await doRoll(false, { seed: dailySeed() });
  }
  checkDeadlines();
  setInterval(() => {
    checkDeadlines();
    if (RT.tab === 'history')
      $$('[data-countdown]').forEach((el) => {
        const value = remaining(Number(el.dataset.countdown));
        if (el.textContent !== value) el.textContent = value;
      });
  }, 1000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) checkDeadlines();
  });
  restoreTimer();
  const notice = document.createElement('p');
  notice.id = 'data-notice';
  notice.className = 'mo';
  $('#foot').before(notice);
  paintCatalog();
  if ('serviceWorker' in navigator) {
    // The first claim of a fresh visit is not an update: the page just came from the
    // network, so reloading it would restart the boot for no reason.
    let controlled = !!navigator.serviceWorker.controller;
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!controlled) {
        controlled = true;
        return;
      }
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
  // The desktop hotkey rolls a new contract without stealing focus from the game.
  desktop?.onSpin?.(() => {
    if (!RT.busy) doRoll(false);
  });
  // The shell detected a finished match and the player picked the outcome.
  desktop?.onShopAction?.((action, token) => shopAction(action, token, persist));
  watchTimeline(
    () => S.lang,
    (message) => {
      toast(message);
      beep(660);
      if (document.hidden || !document.hasFocus()) desktop?.timelineAlert?.(message);
    },
  );
  desktop?.onMatch?.(updateMatch);
  desktop?.matchState?.().then(updateMatch);
  desktop?.onOutcome?.((event) => {
    if (
      RT.cur &&
      !RT.finished &&
      event?.key === resultKey(RT.cur) &&
      ['done', 'fail'].includes(event.outcome)
    )
      finish(event.outcome);
  });
  const applyCompact = (value) => {
    document.documentElement.classList.toggle('desktop-compact', !!value);
    if (value) {
      show('roulette');
      window.scrollTo(0, 0);
    }
  };
  desktop?.onCompact?.(applyCompact);
  desktop?.compactState?.().then(applyCompact);
  desktop?.overlayState?.().then((state) => {
    if (state) {
      RT.overlay = { ...RT.overlay, ...state };
      if (RT.tab === 'custom') viewCustom();
    }
  });
  if (desktop) {
    const exit = document.createElement('button');
    exit.className = 'compact-exit';
    exit.textContent = S.lang === 'ru' ? 'Развернуть' : 'Expand';
    exit.onclick = () => desktop.toggleCompact?.();
    document.querySelector('.titlebar-controls').prepend(exit);
  }
  checkForUpdates(RT.data.changelog.installerVersion || siteVersion());
}

// PWA shortcuts and bookmarked sections arrive as ?tab=<name>; a shared result
// hash still wins because it carries the contract itself.
function initialTab() {
  try {
    const tab = new URLSearchParams(location.search).get('tab');
    return TABS.includes(tab) ? tab : 'roulette';
  } catch {
    return 'roulette';
  }
}
