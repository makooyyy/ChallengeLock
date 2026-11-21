import { showGameExport } from './game-export-ui.js';
import { decodeGameBuild } from './game-export.js';
import { rememberFocus, revealResult } from './tool-focus.js';
import { S, RT } from './state.js';
import { t } from './i18n.js';
import { icon } from './icons.js';
import { heroPool, resultKey } from './roulette.js';
import { newSeed } from './rng.js';
import { copy } from './share.js';
import { BUILD_STAGES, buildSettings } from './build-config.js';
import { abilityPlan, makeBuild, restoreBuild, replacementOptions, BRANCHES } from './builds.js';
const esc = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  );
const item = (id) => RT.data.items.find((i) => i.id === id),
  hero = (id) => RT.data.heroes.find((h) => h.id === id),
  money = (n) => n.toLocaleString(S.lang),
  branchColor = { weapon: '#db9b42', vitality: '#50b5a4', spirit: '#aa8aef' };
let advanced = false;
let replacing = null;
let choices = [];
let undo = null;
let undoTimer;
const bannedItem = (b) => (RT.ban?.hero === b.hero ? RT.ban.item : null);
const nextPurchase = (b) =>
  item(b.items.find((id) => !b.purchased.includes(id) && id !== bannedItem(b)));
function clearTransient() {
  clearTimeout(undoTimer);
  undo = null;
  replacing = null;
  choices = [];
}
export function useContractHero(contract) {
  if (S.buildContractKey === resultKey(contract)) return;
  S.buildContractKey = resultKey(contract);
  S.buildSettings.heroId = contract.hero;
}
function store(save) {
  S.savedBuild = RT.build;
  save();
}
export function hydrateBuilder() {
  RT.build = restoreBuild(S.savedBuild, RT.data.heroes, RT.data.items);
  S.savedBuild = RT.build;
  S.comparisonBuild = restoreBuild(S.comparisonBuild, RT.data.heroes, RT.data.items);
  reportBuild();
}
export function renderBuilder() {
  const p = document.getElementById('p-build'),
    s = S.buildSettings,
    b = RT.build,
    stage = BUILD_STAGES[s.stage],
    pool = heroPool(RT.data.heroes, S);
  const previousAdvanced = p.querySelector('#build-advanced');
  if (previousAdvanced) advanced = previousAdvanced.open;
  const restoreFocus = rememberFocus(p);
  const stale =
    b &&
    ['stage', 'budget', 'focus', 'maxActive', 'maxItems', 'heroId'].some(
      (k) => s[k] !== b.settings[k],
    );
  p.innerHTML = `<div class="page-intro"><div><div class="eyebrow">DEADLOCK / BUILD LAB</div><h1>${t('labTitle')}</h1><p>${t('labIntro')}</p></div></div>
 <div class="lab-layout"><section class="lab-settings card" id="build-settings"><div class="lab-section-title"><span>01</span><h2>${t('labStage')}</h2></div><div class="lab-stages">${Object.entries(
   BUILD_STAGES,
 )
   .map(
     ([id, phase]) =>
       `<button data-build-stage="${id}" aria-pressed="${s.stage === id}" class="${s.stage === id ? 'on' : ''}">${icon(id === 'lane' ? 'play' : id === 'mid' ? 'layers' : 'trophy', 18)}<span><b>${t('phase.' + id)}</b><small>T1–T${phase.maxTier} · ${t('upTo')} ${phase.slots} ${t('itemsCount')}</small></span></button>`,
   )
   .join('')}</div>
 <div class="lab-section-title"><span>02</span><h2>${t('labBudget')}</h2></div><label class="lab-budget"><span>${icon('layers', 18)}</span><input id="bud" type="number" min="800" max="100000" step="1" value="${s.budget}" aria-label="${t('labBudget')}"><small>${t('soulsLabel')}</small></label><div class="lab-presets">${stage.presets.map((n) => `<button data-build-budget="${n}" aria-pressed="${s.budget === n}" class="${s.budget === n ? 'on' : ''}">${money(n)}</button>`).join('')}</div><p class="lab-help">${t('budgetHelp')}</p>
 <div class="lab-section-title"><span>03</span><h2>${t('labHeroStyle')}</h2></div><label class="lab-field">${t('hero')}<select id="build-hero"><option value="">${t('randomHero')}</option>${s.heroId && !pool.some((h) => h.id === s.heroId) ? `<option value="${esc(s.heroId)}" selected>${esc(hero(s.heroId)?.name || s.heroId)} — ${t('unavailableHero')}</option>` : ''}${pool.map((h) => `<option value="${h.id}" ${h.id === s.heroId ? 'selected' : ''}>${esc(h.name)}</option>`).join('')}</select></label>${RT.cur ? `<button class="lab-use-hero" id="build-use-hero">${icon('arrow', 14)}${t('useCurrentHero')}: ${esc(hero(RT.cur.hero).name)}</button>` : ''}
 <details id="build-advanced" ${advanced ? 'open' : ''}><summary>${t('buildOptions')}</summary><label class="lab-field">${t('buildFocus')}<select id="build-focus">${['balanced', ...BRANCHES].map((f) => `<option value="${f}" ${s.focus === f ? 'selected' : ''}>${t('focus.' + f)}</option>`).join('')}</select></label><div class="lab-field-row"><label class="lab-field">${t('activeLimit')}<select id="build-active">${[0, 1, 2, 4].map((n) => `<option value="${n}" ${s.maxActive === n ? 'selected' : ''}>${n === 0 ? t('passiveOnly') : n}</option>`).join('')}</select></label><label class="lab-field">${t('itemLimit')}<select id="build-slots">${Array.from(
   { length: stage.slots },
   (_, i) => i + 1,
 )
   .map((n) => `<option value="${n}" ${s.maxItems === n ? 'selected' : ''}>${n}</option>`)
   .join('')}</select></label></div>
 <label class="chk lab-keep"><input type="checkbox" id="build-keep" ${s.keepHero ? 'checked' : ''}>${t('keepHero')}</label></details><button class="spin" id="rb">${icon('shuffle', 18)}${t(b ? 'rebuild' : 'createBuild')}</button><button class="ghost" id="build-import">${icon('download', 18)}${t('importGame')}</button><p class="lab-help">${t('buildMethod')}</p></section>
 <section class="lab-result" aria-live="polite">${b ? result(b, stale) : `<div class="lab-empty"><div class="lab-empty-icon">${icon('layers', 36)}</div><span class="eyebrow">BUILD LAB</span><h2>${t('labEmptyTitle')}</h2><p>${t('labEmptyText')}</p><div class="lab-preview-items">${[1, 2, 3].map((n) => `<span>${String(n).padStart(2, '0')}${icon('layers', 24)}</span>`).join('')}</div>`}</section></div>`;
  restoreFocus();
  p.querySelector('#build-advanced').ontoggle = (e) => {
    advanced = e.currentTarget.open;
  };
  reportBuild();
}
function reportBuild() {
  const desktopApi = window.challengeLockDesktop;
  if (desktopApi?.reportBuild) {
    if (!RT.build) {
      desktopApi.reportBuild(null);
    } else {
      const next = nextPurchase(RT.build);
      desktopApi.reportBuild({
        hero: hero(RT.build.hero)?.name || RT.build.hero,
        nextItem: next?.name || null,
        complete: RT.build.items.length > 0 && !next,
        lang: S.lang,
        nextCost: next?.cost || 0,
        nextTier: next ? (S.lang === 'en' ? 'Tier ' : 'Тир ') + next.tier : null,
        budget: RT.build.budget,
        spent: RT.build.spent,
        displayItems: RT.build.items.map((id) => ({
          name:
            (id === bannedItem(RT.build) ? t('forbidden') + ' · ' : '') + (item(id)?.name || id),
          purchased: RT.build.purchased.includes(id),
        })),
        items: RT.build.items,
        purchased: RT.build.purchased,
      });
    }
  }
}
function purchaseCard(b) {
  const next = nextPurchase(b);
  return `<section class="card build-shopping"><div><small>${t(next ? 'nextPurchase' : 'shoppingDone')}</small>
    ${next ? `<h3>${esc(next.name)}</h3><b>${money(next.cost)} ${t('soulsLabel')}</b>` : ''}</div>
    ${next ? `<button class="pb" data-buy-next="${esc(next.id)}">${t('markPurchased')}</button>` : ''}
    ${undo?.build === b ? `<button id="undo-buy" class="ghost">${t('undoBuy')} · ${esc(item(undo.id).name)}</button>` : ''}</section>`;
}
function compareCard(b) {
  const saved = S.comparisonBuild;
  const summary = (x, label) =>
    `<div><strong>${t(label)} · ${esc(hero(x.hero).name)}</strong><p>${money(x.spent)} ${t('soulsLabel')} · ${t('activeItem')}: ${x.items.filter((id) => item(id).isActive).length}</p><ol>${x.items
      .slice(0, 3)
      .map((id) => `<li>${esc(item(id).name)}</li>`)
      .join('')}</ol></div>`;
  return `<section class="card build-comparison">${saved ? `<div class="variant-pair">${summary(saved, 'savedVariant')}${summary(b, 'currentVariant')}</div><button class="ghost" id="swap-build">${t('switchVariant')}</button>` : ''}
    <button class="ghost" id="compare-build">${t('compareBuild')}</button></section>`;
}
function replacementMenu(id) {
  if (replacing !== id) return '';
  return `<li class="replacement-menu"><b>${t('replaceItem')} · ${esc(item(id).name)}</b>${choices
    .map((b) => {
      const i = item(b.items.find((key) => !RT.build.items.includes(key)));
      return `<button class="ghost" data-choose-item="${esc(i.id)}"><b>${esc(i.name)}</b> · ${money(i.cost)} · ${t('branch.' + i.branch)} · ${t(i.isActive ? 'activeItem' : 'passiveItem')}</button>`;
    })
    .join('')}<button class="ghost" id="cancel-replace">${t('cancelChoice')}</button></li>`;
}
function budgetReason(b) {
  if (b.items.length >= b.settings.maxItems)
    return t('slotsFilled').replace('{slots}', b.settings.maxItems);
  const cheapest = Math.min(
    ...RT.data.items
      .filter(
        (i) =>
          i.active !== false &&
          !b.items.includes(i.id) &&
          i.tier <= BUILD_STAGES[b.settings.stage].maxTier,
      )
      .map((i) => i.cost),
  );
  if (Number.isFinite(cheapest) && b.budget - b.spent < cheapest)
    return t('belowPrice').replace('{cost}', money(cheapest));
  return t('budgetCapHint')
    .replace('{slots}', b.settings.maxItems)
    .replace('{tier}', BUILD_STAGES[b.settings.stage].maxTier);
}
function skillLabel(step) {
  return step.tier ? 'T' + step.tier : t('abilityUnlock');
}
function skillCard(build, hero) {
  const steps = abilityPlan(build, hero);
  if (!steps.length) return '';
  return `<section class="card skill-plan"><h2>${t('abilityPlan')}</h2><ol>${steps.map((s) => `<li><b>${s.slot} · ${esc(s.name)}</b><small>${skillLabel(s)}</small></li>`).join('')}</ol></section>`;
}
function result(b, stale) {
  const h = hero(b.hero),
    purchased = b.items.filter((id) => b.purchased.includes(id)),
    paid = purchased.reduce((s, id) => s + item(id).cost, 0);
  let cumulative = 0;
  const rows = b.items.map((id, index) => {
    const i = item(id);
    cumulative += i.cost;
    return { i, index, cumulative };
  });
  return `${purchaseCard(b)}${stale ? `<div class="lab-notice">${icon('settings', 16)}${t('settingsPending')}</div>` : ''}<div class="lab-overview card"><div class="lab-result-header"><div class="lab-hero"><img class="pic" src="${esc(h.icon)}" alt=""><div><span class="eyebrow">${t('experimentalBuild')} · ${t('phase.' + b.settings.stage)} · ${t('focus.' + b.settings.focus)}</span><h2>${esc(h.name)}</h2></div></div><div class="lab-result-tools"><button id="build-edit">${icon('settings', 15)}${t('configure')}</button><button id="copy-game-build" class="game-export-button">${icon('download', 15)}${t('exportGame')}</button><button id="cb">${icon('copy', 15)}${t('copyText')}</button></div></div><div class="lab-totals"><div><small>${t('buildCost')}</small><b>${money(b.spent)}</b><span>/ ${money(b.budget)} ${t('soulsLabel')}</span></div><div><small>${t('remaining')}</small><b>${money(b.budget - b.spent)}</b><span>${t('budgetReserve')}</span></div><div><small>${t('purchased')}</small><b>${purchased.length}<em> / ${b.items.length}</em></b><span>${money(b.spent - paid)} ${t('toBuy')}</span></div></div><div class="lab-branch-bar" aria-label="${t('branchMix')}">${BRANCHES.map(
    (branch) => {
      const cost = b.items
        .filter((id) => item(id).branch === branch)
        .reduce((s, id) => s + item(id).cost, 0);
      return cost
        ? `<span style="width:${(cost / b.spent) * 100}%;background:${branchColor[branch]}" title="${t('branch.' + branch)}: ${money(cost)}"></span>`
        : '';
    },
  ).join(
    '',
  )}</div><div class="lab-branch-labels">${BRANCHES.map((branch) => `<span><i style="background:${branchColor[branch]}"></i>${t('branch.' + branch)} <b>${b.items.filter((id) => item(id).branch === branch).length}</b></span>`).join('')}</div>${b.budget > b.spent ? `<p class="lab-help lab-budget-note">${icon('layers', 14)}${budgetReason(b)}</p>` : ''}</div>
 ${skillCard(b, h)}
 <div class="lab-order-title"><div><h2>${t('purchasePlan')}</h2><p>${t('purchaseHelp')}</p></div>${b.locked.length ? `<button id="build-unlock">${icon('unlock', 14)}${t('unpinAll')}</button>` : ''}</div>
 ${[1, 2, 3]
   .map((group) => {
     const list = rows.filter(({ i }) => (i.tier <= 2 ? 1 : i.tier === 3 ? 2 : 3) === group);
     return list.length
       ? `<section class="lab-phase"><div class="lab-phase-heading"><span>0${group}</span><h3>${t('buyPhase.' + group)}</h3><small>${money(list.reduce((s, { i }) => s + i.cost, 0))} ${t('soulsLabel')}</small></div><ol class="lab-items">${list.map(({ i, index, cumulative }) => `<li class="lab-item ${b.purchased.includes(i.id) ? 'bought' : ''}" style="--item-branch:${branchColor[i.branch]}"><label class="lab-buy" title="${t('markPurchased')}"><input type="checkbox" data-build-buy="${i.id}" ${bannedItem(b) === i.id ? 'disabled' : ''} ${b.purchased.includes(i.id) ? 'checked' : ''} aria-label="${t('markPurchased')}: ${esc(i.name)}"><span>${String(index + 1).padStart(2, '0')}</span></label><div class="lab-item-art"><img class="asset-img" src="${esc(i.icon)}" alt="" loading="lazy"></div><div class="lab-item-name"><small>${t('branch.' + i.branch)} · T${i.tier}${i.isActive ? ' · ' + t('activeItem') : ''}</small><h3>${esc(i.name)}</h3>${bannedItem(b) === i.id ? `<strong>${t('forbidden')}</strong><button data-build-replace="${i.id}">${t('replaceItem')}</button>` : ''}<span>${t('cumulative')}: ${money(cumulative)}</span></div><div class="lab-item-price"><b>${money(i.cost)}</b><small>${t('soulsLabel')}</small></div><div class="lab-item-actions"><button data-build-lock="${i.id}" aria-pressed="${b.locked.includes(i.id)}" aria-label="${t(b.locked.includes(i.id) ? 'unpin' : 'pin')}: ${esc(i.name)}" title="${t(b.locked.includes(i.id) ? 'unpin' : 'pin')}">${icon(b.locked.includes(i.id) ? 'lock' : 'unlock', 16)}</button><button data-build-replace="${i.id}" ${b.locked.includes(i.id) || b.purchased.includes(i.id) ? 'disabled' : ''} aria-label="${t('replaceItem')}: ${esc(i.name)}" title="${t('replaceItem')}">${icon('refresh', 16)}</button></div></li>${replacementMenu(i.id)}`).join('')}</ol></section>`
       : '';
   })
   .join('')}
 ${compareCard(b)}<p class="lab-footnote">${icon('shield', 14)}${t('recipeNote')}</p>`;
}
export async function builderClick(button, notify, save) {
  const d = button.dataset,
    s = S.buildSettings;
  if (d.buildStage) {
    S.buildSettings = buildSettings({
      ...s,
      stage: d.buildStage,
      budget: BUILD_STAGES[d.buildStage].budget,
      maxItems: BUILD_STAGES[d.buildStage].slots,
    });
    save();
    renderBuilder();
    return true;
  }
  if (d.buildBudget) {
    s.budget = +d.buildBudget;
    save();
    renderBuilder();
    return true;
  }
  if (button.id === 'build-use-hero') {
    s.heroId = RT.cur.hero;
    save();
    renderBuilder();
    return true;
  }
  if (button.id === 'build-edit') {
    document.getElementById('build-settings').scrollIntoView({ behavior: 'auto', block: 'start' });
    document.querySelector('[data-build-stage="' + s.stage + '"]').focus({ preventScroll: true });
    return true;
  }
  if (button.id === 'swap-build' && RT.build && S.comparisonBuild) {
    [RT.build, S.comparisonBuild] = [S.comparisonBuild, RT.build];
    S.buildSettings = { ...RT.build.settings };
    clearTransient();
    store(save);
    renderBuilder();
    return true;
  }
  if (d.buyNext && RT.build && nextPurchase(RT.build)?.id === d.buyNext) {
    clearTransient();
    RT.build.purchased.push(d.buyNext);
    undo = { build: RT.build, id: d.buyNext };
    undoTimer = setTimeout(() => {
      undo = null;
      document.getElementById('undo-buy')?.remove();
    }, 8000);
    store(save);
    renderBuilder();
    return true;
  }
  if (button.id === 'undo-buy' && undo?.build === RT.build) {
    RT.build.purchased = RT.build.purchased.filter((id) => id !== undo.id);
    clearTransient();
    store(save);
    renderBuilder();
    return true;
  }
  if (button.id === 'rb' || button.id === 'compare-build') {
    const budget = Number(document.getElementById('bud').value);
    if (!Number.isSafeInteger(budget) || budget < 800 || budget > 100000) {
      notify(t('invalidBudget'));
      return true;
    }
    s.budget = budget;
    const old = RT.build,
      locked = old ? [...new Set([...old.locked, ...old.purchased])] : [],
      heroId = s.heroId || (s.keepHero && old ? old.hero : '');
    const b = makeBuild(newSeed(), RT.data.heroes, RT.data.items, budget, S, {
      ...s,
      heroId,
      excluded: heroId && RT.ban?.hero === heroId && RT.ban.item ? [RT.ban.item] : [],
      locked,
    });
    if (!b) {
      notify(t(heroPool(RT.data.heroes, S).length ? 'buildNoFit' : 'noHeroes'));
      return true;
    }
    b.settings = { ...s };
    b.locked = old ? old.locked.filter((id) => b.items.includes(id)) : [];
    b.purchased = old ? old.purchased.filter((id) => b.items.includes(id)) : [];
    if (button.id === 'compare-build' && old) {
      if (b.hero === old.hero && b.items.join() === old.items.join()) {
        notify(t('sameVariant'));
        return true;
      }
      S.comparisonBuild = old;
    }
    clearTransient();
    RT.build = b;
    store(save);
    renderBuilder();
    revealResult(document.getElementById('p-build'));
    return true;
  }
  if (button.id === 'build-import') {
    const code = window.prompt(t('importGamePrompt'));
    if (!code) return true;
    try {
      const build = decodeGameBuild(code, RT.data.heroes, RT.data.items);
      clearTransient();
      RT.build = build;
      store(save);
      renderBuilder();
      notify(t('importGameDone'));
    } catch (e) {
      console.warn(e);
      notify(t('importGameError'));
    }
    return true;
  }
  if (button.id === 'copy-game-build' && RT.build) {
    button.disabled = true;
    try {
      await showGameExport(RT.build, RT.data.heroes, RT.data.items);
    } catch {
      notify(t('exportError'));
    } finally {
      button.disabled = false;
    }
    return true;
  }
  if (button.id === 'cb' && RT.build) {
    const b = RT.build;
    const text = `${hero(b.hero).name} — ${t('phase.' + b.settings.stage)}\n${t('focus.' + b.settings.focus)} · ${money(b.spent)} / ${money(b.budget)} ${t('soulsLabel')}\n${b.items.map((id, i) => `${b.purchased.includes(id) ? '[✓]' : '[ ]'} ${i + 1}. ${item(id).name} — ${money(item(id).cost)}`).join('\n')}`;
    notify(
      (await copy(
        [
          text,
          ...abilityPlan(b, hero(b.hero)).map(
            (s, i) => i + 1 + '. ' + s.name + ' · ' + skillLabel(s),
          ),
        ].join('\n'),
      ))
        ? t('copied')
        : t('error'),
    );
    return true;
  }
  if (d.buildLock && RT.build) {
    const b = RT.build;
    clearTransient();
    b.locked = b.locked.includes(d.buildLock)
      ? b.locked.filter((id) => id !== d.buildLock)
      : [...b.locked, d.buildLock];
    store(save);
    renderBuilder();
    return true;
  }
  if (d.buildReplace && RT.build) {
    replacing = d.buildReplace;
    choices = replacementOptions(
      RT.build,
      replacing,
      RT.data.heroes,
      RT.data.items.filter((i) => i.id !== bannedItem(RT.build) || RT.build.items.includes(i.id)),
    );
    if (!choices.length) notify(t('noReplacement'));
    renderBuilder();
    return true;
  }
  if (
    d.chooseItem &&
    RT.build &&
    !RT.build.locked.includes(replacing) &&
    !RT.build.purchased.includes(replacing)
  ) {
    const b = choices.find((candidate) => candidate.items.includes(d.chooseItem));
    if (b) {
      RT.build = b;
      clearTransient();
      store(save);
      renderBuilder();
    }
    return true;
  }
  if (button.id === 'cancel-replace') {
    replacing = null;
    choices = [];
    renderBuilder();
    return true;
  }
  if (button.id === 'build-unlock' && RT.build) {
    RT.build.locked = [];
    store(save);
    renderBuilder();
    return true;
  }
  return false;
}
export function builderChange(input, notify, save) {
  const s = S.buildSettings,
    map = {
      'build-hero': 'heroId',
      'build-focus': 'focus',
      'build-active': 'maxActive',
      'build-slots': 'maxItems',
    };
  if (input.id === 'bud') {
    const value = +input.value;
    if (!Number.isSafeInteger(value) || value < 800 || value > 100000) {
      notify(t('invalidBudget'));
      return true;
    }
    s.budget = value;
    save();
    // Keep clicked result buttons attached when the budget field loses focus.
    document.querySelectorAll('[data-build-budget]').forEach((b) => {
      const on = +b.dataset.buildBudget === value;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    if (RT.build && !document.querySelector('#p-build .lab-notice') && value !== RT.build.budget) {
      const note = document.createElement('div');
      note.className = 'lab-notice';
      note.textContent = t('settingsPending');
      document.querySelector('#p-build .lab-result').append(note);
    }
    return true;
  } else if (map[input.id])
    s[map[input.id]] = ['build-active', 'build-slots'].includes(input.id)
      ? +input.value
      : input.value;
  else if (input.id === 'build-keep') s.keepHero = input.checked;
  else if (input.dataset.buildBuy && RT.build) {
    const b = RT.build,
      id = input.dataset.buildBuy;
    clearTransient();
    b.purchased = input.checked
      ? [...new Set([...b.purchased, id])]
      : b.purchased.filter((x) => x !== id);
    store(save);
    renderBuilder();
    return true;
  } else return false;
  save();
  renderBuilder();
  return true;
}
