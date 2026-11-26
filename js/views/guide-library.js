import { setupComparison } from './item-comparison.js';
import { renderHeroes } from './hero-fieldbook.js';
const profiles = {
  bullets: ['bullet-resilience', 'metal-skin', 'disarming-hex'],
  spirit: ['spirit-resilience', 'spirit-shielding', 'warp-stone'],
  catch: ['reactive-barrier', 'extra-stamina', 'unstoppable'],
  sustain: ['healbane', 'decay', 'toxic-bullets'],
  channel: ['knockdown', 'spirit-resilience', 'warp-stone'],
  flying: ['knockdown', 'bullet-resilience', 'extra-stamina'],
  dive: ['slowing-hex', 'extra-stamina', 'reactive-barrier'],
};
// Matchups start with a signature ability; the player can switch threat if the observed build differs.
const matchups = {
  abrams: ['sustain', 0],
  apollo: ['dive', 2],
  bebop: ['catch', 2],
  billy: ['catch', 3],
  calico: ['dive', 1],
  celeste: ['spirit', 2],
  'deadman-danny': ['bullets', 0],
  drifter: ['dive', 1],
  dynamo: ['catch', 3],
  graves: ['spirit', 1],
  'grey-talon': ['flying', 1],
  haze: ['bullets', 3],
  holliday: ['catch', 3],
  infernus: ['spirit', 2],
  ivy: ['catch', 2],
  kelvin: ['spirit', 2],
  'lady-geist': ['sustain', 1],
  lash: ['dive', 1],
  mcginnis: ['sustain', 1],
  mina: ['dive', 1],
  mirage: ['spirit', 2],
  'mo-krill': ['catch', 3],
  'nurse-harrow': ['sustain', 2],
  paige: ['catch', 2],
  paradox: ['catch', 3],
  pocket: ['spirit', 3],
  'rat-king': ['spirit', 1],
  rem: ['catch', 3],
  seven: ['channel', 3],
  shiv: ['sustain', 2],
  silver: ['catch', 2],
  sinclair: ['catch', 2],
  solomon: ['spirit', 2],
  'the-doorman': ['catch', 2],
  venator: ['catch', 2],
  victor: ['sustain', 1],
  vindicta: ['flying', 1],
  viscous: ['catch', 2],
  vyper: ['bullets', 2],
  warden: ['catch', 2],
  wraith: ['bullets', 2],
  yamato: ['dive', 1],
};
const threats = {
  bullets: ['Пулевой урон', 'Bullet damage'],
  spirit: ['Спиритический урон', 'Spirit damage'],
  catch: ['Контроль', 'Crowd control'],
  sustain: ['Лечение в бою', 'Combat healing'],
  channel: ['Длительное применение', 'Channeling'],
  flying: ['Огонь с высоты', 'Airborne pressure'],
  dive: ['Сближение', 'Gap closing'],
};
const signaturePicks = {
  bebop: [
    'dispel-magic',
    'Сними Sticky Bomb до взрыва. У предмета есть ограничения во время контроля.',
    'Remove Sticky Bomb before detonation. Check the item’s restrictions while disabled.',
  ],
  infernus: [
    'dispel-magic',
    'Очисти Afterburn после выхода из-под огня, иначе Infernus сможет наложить его снова.',
    'Clear Afterburn once out of gunfire to avoid immediate reapplication.',
  ],
  vindicta: [
    'slowing-hex',
    'Используй против Flight, пока Vindicta в радиусе предмета.',
    'Use against Flight while Vindicta is within item range.',
  ],
  'grey-talon': [
    'slowing-hex',
    'Сохрани активный эффект для Rain of Arrows и используй укрытие во время сближения.',
    'Save the active for Rain of Arrows and use cover to approach.',
  ],
  warden: [
    'dispel-magic',
    'Если Binding Word уже наложен, проверь возможность очистки до срабатывания удержания.',
    'When marked by Binding Word, consider cleansing before the immobilization triggers.',
  ],
  wraith: [
    'return-fire',
    'При серии выстрелов Full Auto ответный огонь заставляет Wraith платить за продолжение атаки.',
    'Return Fire punishes Wraith for continuing to shoot during Full Auto.',
  ],
  seven: [
    'spirit-sap',
    'Снизь спиритическую мощь Seven перед его атакой, если можешь безопасно приблизиться.',
    'Reduce Seven’s spirit power before the attack if you can safely get in range.',
  ],
};
const reasons = {
  'bullet-resilience': [
    'Для затяжной перестрелки с противником, который попадает сериями.',
    'For extended trades against repeated gunfire.',
  ],
  'metal-skin': [
    'Активируй в момент пулевого залпа и смени позицию, пока действует защита.',
    'Activate during the bullet burst and reposition while protected.',
  ],
  'disarming-hex': [
    'Используй до того, как стрелок успеет реализовать усиление оружия.',
    'Use before the enemy gets full value from a weapon buff.',
  ],
  'spirit-resilience': [
    'Выбери, если основная потеря здоровья в сводке урона приходится на спиритизм.',
    'Choose when spirit damage dominates your damage recap.',
  ],
  'spirit-shielding': [
    'Рассмотри против короткого всплеска спиритического урона.',
    'Consider against a short burst of spirit damage.',
  ],
  'warp-stone': [
    'Оставь перемещение для выхода из опасной зоны или ухода за стену.',
    'Save the movement to leave the danger area or break line of sight.',
  ],
  'reactive-barrier': [
    'Полезен, если после первого контроля тебя добивают до возможности ответить.',
    'Useful when follow-up damage after a disable decides the fight.',
  ],
  'extra-stamina': [
    'Сохрани дополнительный рывок для отхода за укрытие.',
    'Reserve an extra dash for reaching cover.',
  ],
  unstoppable: [
    'Включай до ожидаемого контроля, пока ещё можешь нажать предмет.',
    'Activate before the expected disable while you can still use the item.',
  ],
  healbane: [
    'Для билдов, которые регулярно попадают способностями по лечащейся цели.',
    'For builds that repeatedly hit a healing target with abilities.',
  ],
  decay: [
    'Направь активный эффект на важную цель до её основного лечения.',
    'Use the active on the priority target before its main heal.',
  ],
  'toxic-bullets': [
    'Вариант для стрелка, который может удерживать огонь на одной цели.',
    'For a gun build that can sustain fire on one target.',
  ],
  knockdown: [
    'Учти задержку оглушения. После применения займи укрытие или подготовь продолжение.',
    'Allow for the stun delay. Take cover or prepare a follow-up.',
  ],
  'slowing-hex': [
    'Используй при сближении противника и создай дистанцию до его следующего рывка.',
    'Use as the enemy closes in and make space before the next dash.',
  ],
};
const lessons = [
  [
    'Линия',
    'Lane',
    'Когда возвращаться в магазин?',
    'When should I shop?',
    'Зачисти волну и проверь следующую покупку. Если до неё далеко, не отдавай позицию ради мелкого компонента.',
    'Clear the wave and check your next purchase. Avoid conceding lane position for a minor component.',
  ],
  [
    'Линия',
    'Lane',
    'Что делать под постоянным давлением?',
    'How do I handle constant pressure?',
    'Сначала определи источник урона. Против частых коротких разменов важны укрытие и восстановление; против одного залпа — защита к моменту атаки.',
    'Identify the damage source. Use cover and recovery against repeated trades; prepare protection for a single burst.',
  ],
  [
    'Карта',
    'Map',
    'Когда уходить за коробками?',
    'When should I route through crates?',
    'Разбивай их по дороге между волной и целью. Длинный обход стоит отложить, если у твоего строения уже собирается волна.',
    'Collect them between a wave and your next objective. Skip a long detour when a wave is reaching your structure.',
  ],
  [
    'Карта',
    'Map',
    'Как подготовить доставку урны?',
    'How do I set up an urn delivery?',
    'До подбора посмотри точку доставки и договорись, кто проверит последний проход. Если соперники исчезли с линий, остановись перед открытым участком.',
    'Check the delivery point and assign someone to scout the final approach. Pause before crossing open ground if opponents are missing.',
  ],
  [
    'Командный бой',
    'Teamfight',
    'Когда начинать мид-босса?',
    'When is it safe to start Mid Boss?',
    'Посчитай живых соперников и проверь подходы. Оставь игрока с контролем у входа: всей командой бить босса опасно, если враг может войти без предупреждения.',
    'Count living enemies and check approaches. Leave a player with control at an entrance when opponents could contest.',
  ],
  [
    'Командный бой',
    'Teamfight',
    'Как отвечать на дальний огонь?',
    'How do I answer ranged pressure?',
    'Выбирай путь между укрытиями. Дождись, пока соперник потратит важный выстрел, прежде чем пересекать открытую улицу.',
    'Move from cover to cover. Bait a key shot before crossing an exposed street.',
  ],
  [
    'Магазин',
    'Shop',
    'Когда менять порядок покупок?',
    'When should I change my purchase order?',
    'Если одна и та же атака дважды сорвала бой, отложи следующий предмет урона. Выбери защиту под конкретную угрозу, затем вернись к плану.',
    'If the same attack repeatedly decides fights, defer a damage item. Buy an answer to that threat, then return to the plan.',
  ],
  [
    'Магазин',
    'Shop',
    'Как выбрать между активным и пассивным?',
    'Active or passive defense?',
    'Активный предмет выгоден, если ты успеваешь распознать начало атаки. При внезапном контроле смотри на постоянную защиту и позицию до боя.',
    'An active is useful when you can recognize the wind-up. Against surprise disables, prioritize positioning and passive protection.',
  ],
];
const esc = (v) =>
  String(v ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
let heroId = 'haze',
  threat = null,
  query = '',
  branch = 'all',
  dictionary;
export function renderLibrary(panel, section, heroes, items, lang, getBuild) {
  const i = lang === 'en' ? 1 : 0,
    l = (a, b) => (i ? b : a),
    byId = new Map(items.map((x) => [x.id, x]));
  const root = panel.querySelector('.guide-content'),
    rerender = () => renderLibrary(panel, section, heroes, items, lang, getBuild);
  const pic = (id) => 'assets/guide-items/' + id + '.webp';
  const tile = (x, note = '') =>
    `<button type="button" class="field-item ${x.branch}" data-tip="${esc(x.id)}" aria-haspopup="dialog"><img src="${pic(x.id)}" alt="" loading="lazy"><span><b>${esc(x.name)}</b><small>${x.cost.toLocaleString(lang)} ${l('душ', 'souls')}</small></span></button>${note ? `<p>${esc(note)}</p>` : ''}`;
  let compare;
  if (section === 'heroes') {
    renderHeroes(root, heroes, byId, lang, esc, tile);
  } else if (section === 'counters') {
    const h = heroes.find((x) => x.id === heroId) || heroes[0],
      [base, slot] = matchups[h.id] || ['spirit', 0],
      key = threat || base;
    root.innerHTML = `<div class="field-match"><aside class="guide-sheet"><label>${l('Соперник', 'Opponent')}<select data-hero>${heroes.map((x) => `<option value="${x.id}" ${x.id === h.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label><div class="guide-portrait"><div><small>${l('Против героя', 'Against')}</small><strong>${esc(h.name)}</strong></div><img src="assets/portraits/${h.id}.webp" alt=""></div><h3>${esc(h.abilityDetails[slot]?.name)}</h3><p>${l('Перед покупкой проверь в сводке урона, чем именно опасен этот соперник.', 'Check the damage recap to see which threat is deciding this matchup.')}</p></aside><section class="guide-sheet"><label>${l('Подобрать ответ на', 'Choose an answer to')}<select data-threat>${Object.entries(
      threats,
    )
      .map(([k, v]) => `<option value="${k}" ${k === key ? 'selected' : ''}>${v[i]}</option>`)
      .join(
        '',
      )}</select></label><div class="field-answers">${key === base && signaturePicks[h.id] ? '<article>' + tile(byId.get(signaturePicks[h.id][0]), signaturePicks[h.id][i + 1]) + '</article>' : ''}${profiles[key].map((id) => `<article>${tile(byId.get(id), reasons[id][i])}</article>`).join('')}</div></section></div>`;
    root.querySelector('[data-hero]').onchange = (e) => {
      heroId = e.target.value;
      threat = null;
      rerender();
      root.querySelector('[data-hero]').focus();
    };
    root.querySelector('[data-threat]').onchange = (e) => {
      threat = e.target.value;
      rerender();
      root.querySelector('[data-threat]').focus();
    };
  } else if (section === 'items') {
    const categories = [
      [
        'physical',
        l('Физические', 'Physical'),
        ['weapon_range', 'weapon_damage', 'bullet_vuln', 'melee', 'weapon_ammo'],
      ],
      [
        'spirit',
        l('Спиритизм', 'Spirit'),
        [
          'spirit_additional_damage_pct',
          'spirit_range',
          'spirit_vuln',
          'spirit_cooldown_and_charges',
        ],
      ],
      [
        'defense',
        l('Защита', 'Defense'),
        [
          'anti_cc',
          'hp',
          'debuff_resist',
          'invulnerability',
          'spirit_damage_reduction',
          'physical_resist',
        ],
      ],
      ['move', l('Мобильность', 'Mobility'), ['teleport', 'jump_and_dash', 'stamina', 'stealth']],
      [
        'control',
        l('Контроль', 'Control'),
        [
          'mobility_reduction',
          'status_curse',
          'status_grounded',
          'status_immobilize',
          'status_stun',
        ],
      ],
      ['misc', l('Разное', 'Miscellaneous'), ['regen', 'out_of_combat_regen', 'healing']],
    ];
    root.innerHTML = `<section class="shop-index"><div class="shop-tools"><div>${categories.map(([k, name]) => `<button data-filter="${k}" aria-pressed="${branch === k}">${name}</button>`).join('')}</div><input type="search" aria-label="${l('Поиск предмета', 'Find an item')}" placeholder="${l('Поиск предмета', 'Find an item')}" value="${esc(query)}"></div><div class="market-wrap"><div class="market-grid"></div></div></section>`;
    compare = setupComparison(root, items, dictionary, lang, getBuild, esc);
    const groups = ['weapon', 'spirit', 'vitality'];
    const draw = () => {
      const q = query.trim().toLowerCase(),
        cat = categories.find((c) => c[0] === branch);
      const list = items.filter((x) => {
        const flags = dictionary[x.id].filters;
        return (
          (!cat || flags.some((f) => cat[2].includes(f)) || (branch === 'misc' && !flags.length)) &&
          (x.name + ' ' + dictionary[x.id].ru.name).toLowerCase().includes(q)
        );
      });
      const prices = [...new Set(list.map((x) => x.cost))].sort((a, b) => a - b);
      root.querySelector('.market-grid').innerHTML =
        groups
          .map(
            (g, i) => `<h2 class="market-banner ${g}">${['Weapon', 'Spirit', 'Vitality'][i]}</h2>`,
          )
          .join('') +
        prices
          .map(
            (cost) =>
              `<h3 class="market-price">◈ ${cost.toLocaleString(lang)}</h3>${groups
                .map(
                  (g) =>
                    `<div class="market-cell ${g}">${list
                      .filter((x) => x.cost === cost && x.branch === g)
                      .map(
                        (x) =>
                          `<button data-tip="${x.id}" aria-haspopup="dialog" class="market-item"><img src="${pic(x.id)}" loading="lazy" alt=""><span>${esc(x.name)}</span></button>`,
                      )
                      .join('')}</div>`,
                )
                .join('')}`,
          )
          .join('') +
        (prices.length
          ? ''
          : '<p class="market-price">' + l('Предметов не найдено', 'No items found') + '</p>');
    };
    root.querySelector('input').oninput = (e) => {
      query = e.target.value;
      draw();
    };
    root.querySelector('.shop-tools').onclick = (e) => {
      const b = e.target.closest('[data-filter]');
      if (!b) return;
      branch = branch === b.dataset.filter ? 'all' : b.dataset.filter;
      for (const btn of root.querySelectorAll('[data-filter]'))
        btn.setAttribute('aria-pressed', btn.dataset.filter === branch);
      draw();
    };
    draw();
  } else {
    root.innerHTML = `<div class="field-lessons">${[0, 2, 4, 6]
      .map(
        (start) =>
          `<section class="guide-sheet"><h2>${lessons[start][i]}</h2>${lessons
            .slice(start, start + 2)
            .map((row) => `<details><summary>${row[2 + i]}</summary><p>${row[4 + i]}</p></details>`)
            .join('')}</section>`,
      )
      .join('')}</div>`;
    return;
  }
  let pinned = false,
    active = null;
  const tip = document.createElement('div');
  tip.className = 'field-tooltip';
  tip.hidden = true;
  tip.setAttribute('role', 'dialog');
  root.append(tip);
  let hideTimer;
  function hide() {
    clearTimeout(hideTimer);
    tip.hidden = true;
    active = null;
    pinned = false;
  }
  function display(button) {
    if (!dictionary || !button) return;
    const x = byId.get(button.dataset.tip),
      data = dictionary[x.id][lang] || dictionary[x.id].en;
    active = button;
    tip.className = 'field-tooltip ' + x.branch;
    tip.hidden = false;
    tip.setAttribute('aria-label', x.name);
    tip.innerHTML = `<header><img src="${pic(x.id)}" alt=""><div><h3>${esc(x.name)}</h3><b>◈ ${x.cost.toLocaleString(lang)}</b></div><button aria-label="${l('Закрыть', 'Close')}">×</button></header><div class="field-tip-body">${data.sections.map((s) => `<section><h4>${{ innate: l('Характеристики', 'Attributes'), passive: l('Пассивное', 'Passive'), active: l('Активное', 'Active') }[s.kind] || esc(s.kind)}</h4>${s.blocks.map((b) => `${b.desc ? `<p>${esc(b.desc)}</p>` : ''}${b.stats.map(([k, v]) => `<div class="field-stat"><b>${esc(v)}</b> ${esc(k)}</div>`).join('')}`).join('')}</section>`).join('')}${x.components.length ? `<section><h4>${l('Компоненты', 'Components')}</h4>${x.components.map((id) => (byId.get(id) ? `<span class="field-component"><img src="${pic(id)}" alt="">${esc(byId.get(id).name)}</span>` : '')).join('')}</section>` : ''}</div>`;
    tip.style.maxHeight = '';
    if (compare) {
      const pick = document.createElement('button');
      pick.className = 'compare-pick';
      pick.textContent = l('Добавить к сравнению', 'Add to comparison');
      pick.onclick = (e) => {
        e.stopPropagation();
        hide();
        compare(x.id);
      };
      tip.querySelector('header').after(pick);
    }
    const r = button.getBoundingClientRect(),
      w = tip.offsetWidth,
      h = tip.offsetHeight;
    tip.style.left =
      Math.max(
        8,
        Math.min(innerWidth - w - 8, r.right + w + 12 < innerWidth ? r.right + 6 : r.left - w - 6),
      ) + 'px';
    tip.style.top = Math.max(8, Math.min(innerHeight - h - 8, r.top)) + 'px';
    if (r.right + w + 12 > innerWidth && r.left < w + 12) {
      const below = innerHeight - r.bottom - 14,
        above = r.top - 14,
        useBelow = below >= above;
      tip.style.maxHeight = Math.max(80, useBelow ? below : above) + 'px';
      tip.style.top = (useBelow ? r.bottom + 6 : Math.max(8, r.top - tip.offsetHeight - 6)) + 'px';
    }
    tip.querySelector('button').onclick = () => {
      button.focus();
      hide();
    };
  }
  root.onpointerover = (e) => {
    if (tip.contains(e.target) || e.target.closest('[data-tip]')) clearTimeout(hideTimer);
    const b = e.target.closest('[data-tip]');
    if (b && !pinned && e.pointerType !== 'touch' && active !== b) display(b);
  };
  root.onpointerout = (e) => {
    if (!pinned && active && !active.contains(e.relatedTarget) && !tip.contains(e.relatedTarget)) {
      clearTimeout(hideTimer);
      hideTimer = setTimeout(hide, 200);
    }
  };
  root.onfocusin = (e) => {
    const b = e.target.closest('[data-tip]');
    if (b && !pinned) display(b);
  };
  root.onfocusout = (e) => {
    if (!pinned && !tip.contains(e.relatedTarget)) hide();
  };
  root.onclick = (e) => {
    const b = e.target.closest('[data-tip]');
    if (b) {
      display(b);
      pinned = true;
    } else if (!tip.contains(e.target)) hide();
  };
  root.onkeydown = (e) => {
    if (e.key === 'Escape') {
      active?.focus();
      hide();
    }
  };
}
export async function loadGuideData() {
  if (!dictionary) {
    const res = await fetch('data/guide-items.json');
    if (!res.ok) throw Error('Item catalog unavailable');
    dictionary = await res.json();
  }
}
