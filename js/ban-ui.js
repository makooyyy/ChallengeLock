import { rememberFocus, revealResult } from './tool-focus.js';
import { S, RT } from './state.js';
import { t } from './i18n.js';
import { icon } from './icons.js';
import { heroPool, resultKey } from './roulette.js';
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
  reportBan();
}
const abilityName = (slot) => (slot === 4 ? t('ultimate') : t('abilitySlot') + ' ' + slot);
const passiveNames = new Set([
  'Infernal Resilience',
  'Fixation',
  'Afterburn',
  'Crackshot',
  'Love Bites',
  'Bloodscent',
  'Slither',
  'Shocking Reanimation',
  'Blasted',
  'Essence Theft',
]);
const requiredSlots = {
  street_ult: [4],
  team_ult_chain: [4],
  ab_rotate: [1, 2, 3, 4],
  ab_ult_only: [4],
  bebop_hook: [3],
  haze_sleep_kill: [1],
  infernus_ignite: [3],
  lash_death_slam: [4],
  seven_storm_cloud: [4],
  shiv_killing_blow: [4],
  vindicta_assassinate: [4],
  abrams_wall_pin: [2],
};
let draft = null;
const contract = () => (RT.cur && !RT.preview && !RT.finished ? RT.cur : null);
export function syncBanHero(x) {
  if (S.banContractKey === resultKey(x)) return;
  S.banContractKey = resultKey(x);
  S.banSettings.heroId = x.hero;
  if (RT.ban?.hero === x.hero && x.conds.some((id) => requiredSlots[id]?.includes(RT.ban.slot)))
    clearBan();
  draft = null;
}
export function clearBan() {
  RT.ban = null;
  S.savedBan = null;
  draft = null;
  reportBan();
}
export function reportBan() {
  window.challengeLockDesktop?.reportBan?.(
    RT.ban ? hero(RT.ban.hero).name + ' · ' + rule(RT.ban) : '',
  );
}
const ability = (b) => hero(b.hero)?.abilityDetails?.[b.slot - 1];
export function rule(b) {
  const a = b.slot && ability(b);
  if (a)
    return t(passiveNames.has(a.name) ? 'passiveBan' : 'abilityRule').replace(
      '{name}',
      a.name + ' (' + abilityName(b.slot) + ')',
    );
  return b.slot
    ? t('abilityRule').replace('{name}', abilityName(b.slot))
    : t('itemRule').replace('{name}', item(b.item).name);
}
export function renderBan() {
  if (
    draft &&
    S.banSettings.type === 'item' &&
    S.banSettings.fromBuild &&
    (RT.build?.hero !== draft.hero ||
      !RT.build.items.includes(draft.item) ||
      RT.build.purchased.includes(draft.item))
  )
    draft = null;
  const restoreFocus = rememberFocus(document.getElementById('p-ban'));
  const s = S.banSettings,
    b = draft || RT.ban,
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
      )}</div><div class="lab-layout ban-layout"><section class="lab-settings card"><div class="lab-section-title"><span>01</span><h2>${t('banSetup')}</h2></div><label class="lab-field">${t('hero')}<select id="ban-hero" ${s.type === 'item' && s.fromBuild ? 'disabled' : ''}><option value="">${t('randomHero')}</option>${s.heroId && !pool.some((h) => h.id === s.heroId) ? `<option selected value="${esc(s.heroId)}">${esc(hero(s.heroId)?.name || s.heroId)} — ${t('unavailableHero')}</option>` : ''}${pool.map((h) => `<option value="${h.id}" ${s.heroId === h.id ? 'selected' : ''}>${esc(h.name)}</option>`).join('')}</select></label>${contract() && !(s.type === 'item' && s.fromBuild) ? `<button class="lab-use-hero" id="ban-use-hero">${icon('arrow', 14)}${t('useCurrentHero')}: ${esc(hero(RT.cur.hero).name)}</button>` : ''}<div class="lab-section-title"><span>02</span><h2>${t('banWhat')}</h2></div><div class="ban-type-picker">${['ability', 'item'].map((type) => `<button data-ban-type="${type}" aria-pressed="${s.type === type}" class="${s.type === type ? 'on' : ''}">${icon(type === 'ability' ? 'spark' : 'layers', 21)}<b>${t('banType.' + type)}</b><small>${t('banTypeHint.' + type)}</small></button>`).join('')}</div>${s.type === 'ability' ? `<label class="lab-field">${t('banSlotChoice')}<select id="ban-slot"><option value="0">${t('randomSlot')}</option>${[1, 2, 3, 4].map((n) => `<option value="${n}" ${s.slot === n ? 'selected' : ''}>${abilityName(n)}</option>`).join('')}</select></label><label class="chk lab-keep"><input type="checkbox" id="ban-no-ultimate" ${s.noUltimate ? 'checked' : ''} ${s.slot ? 'disabled' : ''}>${t('keepUltimate')}</label>` : `<label class="chk lab-keep"><input type="checkbox" id="ban-from-build" ${s.fromBuild ? 'checked' : ''}>${t('banFromBuild')}</label><p class="lab-help">${s.fromBuild && RT.build ? esc(hero(RT.build.hero).name) : t('banFromBuildHelp')}</p>${s.fromBuild && !RT.build ? `<button data-tab="build">${t('createBuild')}</button>` : ''}`}<button class="spin" id="ban-roll" data-ban="${s.type}">${icon('ban', 18)}${t('generateBan')}</button><p class="lab-help">${t('banVoluntary')}</p></section><section class="lab-result" aria-live="polite">${draft && RT.ban ? `<p class="lab-notice">${t('oneMatchRule')} · ${esc(hero(RT.ban.hero).name)} · ${esc(rule(RT.ban))} <button id="discard-ban">${t('cancelChoice')}</button></p>` : ''}${b ? `<div class="ban-rule-card card"><div class="ban-rule-top"><span class="eyebrow">${t(draft ? 'previewTitle' : 'oneMatchRule')}</span><span>${icon('ban', 16)}${t(b.slot ? 'banType.ability' : 'banType.item')}</span></div><div class="lab-hero"><img class="pic" src="${esc(hero(b.hero).icon)}" alt=""><div><span class="eyebrow">${t('yourHero')}</span><h2>${esc(hero(b.hero).name)}</h2></div></div>${b.slot ? `<div class="ban-slot-map" aria-label="${t('banSlotMap')}">${[1, 2, 3, 4].map((n) => `<div class="${n === b.slot ? 'blocked' : ''}"><b>${n}</b><span>${n === b.slot ? icon('ban', 16) : icon('check', 16)}</span><small>${n === b.slot ? t('forbidden') : t('availableAbility')}</small></div>`).join('')}</div>` : `<div class="ban-forbidden-item"><img class="asset-img" src="${esc(item(b.item).icon)}" alt=""><span>${icon('ban', 30)}</span><div><h3>${esc(item(b.item).name)}</h3><p>${t('branch.' + item(b.item).branch)} · T${item(b.item).tier}</p></div></div>`}<div class="ban-rule-text"><span class="eyebrow">${t('yourRule')}</span><h3>${b.slot && ability(b)?.icon ? `<img width="32" height="32" alt="" src="${esc(ability(b).icon)}">` : ''} ${esc(rule(b))}</h3><p>${b.slot && ability(b) ? '' : t(b.slot ? 'abilityRuleHelp' : 'itemRuleHelp')}</p></div><div class="ban-result-footer">${draft ? `<button class="pb" id="apply-ban">${t('applyBan')}</button>` : `<button id="clear-ban">${t('endBan')}</button>`}<button id="cb2">${icon('copy', 16)}${t('copyRule')}</button><button id="ban-again">${icon('refresh', 16)}${t('anotherRule')}</button></div></div>` : `<div class="lab-empty"><div class="lab-empty-icon">${icon('ban', 36)}</div><span class="eyebrow">ONE MATCH. ONE RULE.</span><h2>${t('banNewEmpty')}</h2><p>${t('banExample')}</p><div class="ban-example-slots" aria-hidden="true"><span>1</span><span>2</span><span>×</span><span>4</span></div></div>`}</section></div>`;
  if (s.type === 'item' && s.fromBuild)
    document.getElementById('ban-hero').value = RT.build?.hero || '';
  restoreFocus();
}
export async function banClick(button, notify, save) {
  const d = button.dataset,
    s = S.banSettings;
  if (button.id === 'apply-ban' && draft) {
    RT.ban = draft;
    S.savedBan = draft;
    draft = null;
    save();
    reportBan();
    renderBan();
    return true;
  }
  if (button.id === 'discard-ban') {
    draft = null;
    renderBan();
    return true;
  }
  if (button.id === 'clear-ban') {
    clearBan();
    save();
    renderBan();
    return true;
  }
  if (d.banType) {
    draft = null;
    s.type = d.banType;
    save();
    renderBan();
    return true;
  }
  if (button.id === 'ban-use-hero') {
    draft = null;
    s.heroId = RT.cur.hero;
    save();
    renderBan();
    return true;
  }
  if (button.id === 'ban-roll' || button.id === 'ban-again') {
    const pool = heroPool(RT.data.heroes, S),
      r = makeRng(newSeed()),
      previous = draft || RT.ban;
    if (!pool.length) {
      notify(t('noHeroes'));
      return true;
    }
    const fromBuild = s.type === 'item' && s.fromBuild;
    if (fromBuild && !RT.build) {
      notify(t('noBuildForBan'));
      return true;
    }
    const heroId = fromBuild ? RT.build.hero : s.heroId;
    const heroes = heroId ? pool.filter((h) => h.id === heroId) : pool;
    const candidates = [];
    for (const h of heroes) {
      const x = contract();
      const forbidden = x?.hero === h.id ? x.conds.flatMap((id) => requiredSlots[id] || []) : [];
      if (s.type === 'ability') {
        for (let slot = 1; slot <= h.abilities; slot++)
          if (
            (!s.slot || slot === s.slot) &&
            !(slot === 4 && !s.slot && s.noUltimate) &&
            !forbidden.includes(slot)
          )
            candidates.push({ hero: h.id, slot });
      } else {
        for (const i of RT.data.items)
          if (
            i.active !== false &&
            (!fromBuild ||
              (RT.build.items.includes(i.id) &&
                !RT.build.purchased.includes(i.id) &&
                !RT.build.locked.includes(i.id)))
          )
            candidates.push({ hero: h.id, item: i.id });
      }
    }
    const distinct = candidates.filter(
      (b) =>
        !previous ||
        b.hero !== previous.hero ||
        b.slot !== previous.slot ||
        b.item !== previous.item,
    );
    if (!distinct.length) {
      notify(t(candidates.length ? 'noOtherBan' : 'noBanCandidates'));
      return true;
    }
    draft = pick(r, distinct);
    save();
    renderBan();
    revealResult(document.getElementById('p-ban'));
    return true;
  }
  if (button.id === 'cb2' && (draft || RT.ban)) {
    const b = draft || RT.ban;
    notify(
      (await copy(
        hero(b.hero).name + ' — ' + rule(b) + '\n' + t(b.slot ? 'abilityRuleHelp' : 'itemRuleHelp'),
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
  draft = null;
  save();
  renderBan();
  return true;
}
