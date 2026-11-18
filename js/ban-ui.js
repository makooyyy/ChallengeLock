import { rememberFocus, revealResult } from './tool-focus.js';
import { S, RT } from './state.js';
import { t } from './i18n.js';
import { icon } from './icons.js';
import { heroPool } from './roulette.js';
import { makeRng, pick, newSeed } from './rng.js';
import { copy } from './share.js';
const esc = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  );
const hero = (id) => RT.data.heroes.find((h) => h.id === id),
  item = (id) => RT.data.items.find((i) => i.id === id);
export function hydrateBan() {
  const b = S.savedBan;
  RT.ban =
    b &&
    hero(b.hero)?.active !== false &&
    hero(b.hero) &&
    (b.slot ? b.slot <= hero(b.hero).abilities : item(b.item)?.active !== false && item(b.item))
      ? b
      : null;
  S.savedBan = RT.ban;
}
const abilityName = (slot) => (slot === 4 ? t('ultimate') : t('abilitySlot') + ' ' + slot);
function rule(b) {
  return b.slot
    ? t('abilityRule').replace('{name}', abilityName(b.slot))
    : t('itemRule').replace('{name}', item(b.item).name);
}
export function renderBan() {
  const restoreFocus = rememberFocus(document.getElementById('p-ban'));
  const s = S.banSettings,
    b = RT.ban,
    pool = heroPool(RT.data.heroes, S);
  document.getElementById('p-ban').innerHTML =
    `<div class="page-intro"><div><div class="eyebrow">DEADLOCK / ONE RULE</div><h1>${t('newBanTitle')}</h1><p>${t('newBanIntro')}</p></div></div><div class="ban-explainer">${[
      ['1', 'banStep1'],
      ['2', 'banStep2'],
      ['3', 'banStep3'],
    ]
      .map(([n, key]) => `<div><span>${n}</span><p>${t(key)}</p></div>`)
      .join(
        '',
      )}</div><div class="lab-layout ban-layout"><section class="lab-settings card"><div class="lab-section-title"><span>01</span><h2>${t('banSetup')}</h2></div><label class="lab-field">${t('hero')}<select id="ban-hero"><option value="">${t('randomHero')}</option>${s.heroId && !pool.some((h) => h.id === s.heroId) ? `<option selected value="${esc(s.heroId)}">${esc(hero(s.heroId)?.name || s.heroId)} — ${t('unavailableHero')}</option>` : ''}${pool.map((h) => `<option value="${h.id}" ${s.heroId === h.id ? 'selected' : ''}>${esc(h.name)}</option>`).join('')}</select></label>${RT.cur ? `<button class="lab-use-hero" id="ban-use-hero">${icon('arrow', 14)}${t('useCurrentHero')}: ${esc(hero(RT.cur.hero).name)}</button>` : ''}<div class="lab-section-title"><span>02</span><h2>${t('banWhat')}</h2></div><div class="ban-type-picker">${['ability', 'item'].map((type) => `<button data-ban-type="${type}" aria-pressed="${s.type === type}" class="${s.type === type ? 'on' : ''}">${icon(type === 'ability' ? 'spark' : 'layers', 21)}<b>${t('banType.' + type)}</b><small>${t('banTypeHint.' + type)}</small></button>`).join('')}</div>${s.type === 'ability' ? `<label class="lab-field">${t('banSlotChoice')}<select id="ban-slot"><option value="0">${t('randomSlot')}</option>${[1, 2, 3, 4].map((n) => `<option value="${n}" ${s.slot === n ? 'selected' : ''}>${abilityName(n)}</option>`).join('')}</select></label><label class="chk lab-keep"><input type="checkbox" id="ban-no-ultimate" ${s.noUltimate ? 'checked' : ''} ${s.slot ? 'disabled' : ''}>${t('keepUltimate')}</label>` : `<label class="chk lab-keep"><input type="checkbox" id="ban-from-build" ${s.fromBuild ? 'checked' : ''}>${t('banFromBuild')}</label><p class="lab-help">${t('banFromBuildHelp')}</p>`}<button class="spin" id="ban-roll" data-ban="${s.type}">${icon('ban', 18)}${t('generateBan')}</button><p class="lab-help">${t('banVoluntary')}</p></section><section class="lab-result" aria-live="polite">${b ? `<div class="ban-rule-card card"><div class="ban-rule-top"><span class="eyebrow">${t('oneMatchRule')}</span><span>${icon('ban', 16)}${t(b.slot ? 'banType.ability' : 'banType.item')}</span></div><div class="lab-hero"><img class="pic" src="${esc(hero(b.hero).icon)}" alt=""><div><span class="eyebrow">${t('yourHero')}</span><h2>${esc(hero(b.hero).name)}</h2></div></div>${b.slot ? `<div class="ban-slot-map" aria-label="${t('banSlotMap')}">${[1, 2, 3, 4].map((n) => `<div class="${n === b.slot ? 'blocked' : ''}"><b>${n}</b><span>${n === b.slot ? icon('ban', 16) : icon('check', 16)}</span><small>${n === b.slot ? t('forbidden') : t('availableAbility')}</small></div>`).join('')}</div>` : `<div class="ban-forbidden-item"><img class="asset-img" src="${esc(item(b.item).icon)}" alt=""><span>${icon('ban', 30)}</span><div><h3>${esc(item(b.item).name)}</h3><p>${t('branch.' + item(b.item).branch)} · T${item(b.item).tier}</p></div></div>`}<div class="ban-rule-text"><span class="eyebrow">${t('yourRule')}</span><h3>${esc(rule(b))}</h3><p>${t(b.slot ? 'abilityRuleHelp' : 'itemRuleHelp')}</p></div><div class="ban-result-footer"><button id="cb2">${icon('copy', 16)}${t('copyRule')}</button><button id="ban-again">${icon('refresh', 16)}${t('anotherRule')}</button></div></div>` : `<div class="lab-empty"><div class="lab-empty-icon">${icon('ban', 36)}</div><span class="eyebrow">ONE MATCH. ONE RULE.</span><h2>${t('banNewEmpty')}</h2><p>${t('banExample')}</p><div class="ban-example-slots" aria-hidden="true"><span>1</span><span>2</span><span>×</span><span>4</span></div></div>`}</section></div>`;
  restoreFocus();
}
export async function banClick(button, notify, save) {
  const d = button.dataset,
    s = S.banSettings;
  if (d.banType) {
    s.type = d.banType;
    save();
    renderBan();
    return true;
  }
  if (button.id === 'ban-use-hero') {
    s.heroId = RT.cur.hero;
    save();
    renderBan();
    return true;
  }
  if (button.id === 'ban-roll' || button.id === 'ban-again') {
    const pool = heroPool(RT.data.heroes, S),
      r = makeRng(newSeed()),
      h = s.heroId ? pool.find((h) => h.id === s.heroId) : pick(r, pool);
    if (!h) {
      notify(t('noHeroes'));
      return true;
    }
    let b;
    if (s.type === 'ability') {
      const slots = Array.from({ length: h.abilities }, (_, i) => i + 1).filter((n) =>
        s.slot ? n === s.slot : !s.noUltimate || n !== 4,
      );
      const slot = pick(r, slots);
      if (!slot) {
        notify(t('noBanCandidates'));
        return true;
      }
      b = { hero: h.id, slot };
    } else {
      const candidate = pick(
        r,
        RT.data.items.filter(
          (i) => i.active !== false && (!s.fromBuild || RT.build?.items.includes(i.id)),
        ),
      );
      if (!candidate) {
        notify(t('noBuildForBan'));
        return true;
      }
      b = { hero: h.id, item: candidate.id };
    }
    RT.ban = b;
    S.savedBan = b;
    save();
    renderBan();
    revealResult(document.getElementById('p-ban'));
    return true;
  }
  if (button.id === 'cb2' && RT.ban) {
    notify(
      (await copy(
        hero(RT.ban.hero).name +
          ' — ' +
          rule(RT.ban) +
          '\n' +
          t(RT.ban.slot ? 'abilityRuleHelp' : 'itemRuleHelp'),
      ))
        ? t('copied')
        : t('error'),
    );
    return true;
  }
  return false;
}
export function banChange(input, save) {
  const s = S.banSettings;
  if (input.id === 'ban-hero') s.heroId = input.value;
  else if (input.id === 'ban-slot') {
    s.slot = +input.value;
    if (s.slot) s.noUltimate = false;
  } else if (input.id === 'ban-no-ultimate') s.noUltimate = input.checked;
  else if (input.id === 'ban-from-build') s.fromBuild = input.checked;
  else return false;
  save();
  renderBan();
  return true;
}
