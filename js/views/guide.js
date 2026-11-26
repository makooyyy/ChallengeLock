import { renderLibrary, loadGuideData } from './guide-library.js';
const objects = [
  {
    name: ['Коробки', 'Crates'],
    first: 180,
    delay: [180],
    url: 'Crate',
    hint: [
      'Обычные точки на карте. Выбери отдельную зону для исключений.',
      'Standard map locations. Select a special area for exceptions.',
    ],
  },
  {
    name: ['Мид-босс', 'Mid Boss'],
    first: 0,
    delay: [420, 360, 300],
    url: 'Midboss',
    hint: [
      'На карте с начала матча. Повторный отсчёт начинается после убийства.',
      'Present from match start. The next timer starts on the kill.',
    ],
  },
  {
    name: ['Средний лагерь', 'Medium camp'],
    first: 300,
    delay: [290],
    url: 'Haunt',
    hint: ['Считай от полной зачистки лагеря.', 'Count from clearing the entire camp.'],
  },
  {
    name: ['Sinner’s Sacrifice', 'Sinner’s Sacrifice'],
    first: 480,
    delay: [300],
    url: 'Sinner%27s_Sacrifice',
    hint: [
      'Для одиночного автомата считай от разрушения; для смешанного лагеря — от полной зачистки.',
      'Count from machine destruction at a solo site, or the full clear at a hybrid camp.',
    ],
  },
  {
    name: ['Коробки над боссом', 'Crates above Mid Boss'],
    first: 600,
    delay: [180],
    url: 'Crate',
    hint: [
      'Комната под Times Squares над ямой босса.',
      'The room below Times Squares above the pit.',
    ],
  },
  {
    name: ['Башня и площадь', 'Tower and plaza'],
    first: 300,
    delay: [180],
    url: 'Crate',
    hint: ['Верх колокольни и Sunken Plaza.', 'Top of the Bell Tower and Sunken Plaza.'],
  },
  {
    name: ['Коробки в тоннелях', 'Tunnel crates'],
    first: 300,
    delay: [300],
    url: 'Crate',
    hint: [
      'В тоннелях интервал дольше, чем у обычных коробок.',
      'Tunnel crates take longer than regular crates.',
    ],
  },
];
const sections = [
  ['counters', 'Контрпредметы', 'Hero counters'],
  ['timings', 'Тайминги карты', 'Map timings'],
  ['items', 'Каталог предметов', 'Item catalog'],
  ['situations', 'Игровые ситуации', 'Playbook'],
];
let section = 'counters',
  object = 0,
  kill = 0,
  minutes = 12,
  seconds = 0;
export async function renderGuide(panel, items, lang, heroes) {
  const idx = lang === 'en' ? 1 : 0,
    l = (a, b) => (idx ? b : a);
  panel.innerHTML = `<div class="guide-head"><h1>${l('Полевой справочник', 'Field guide')}</h1><p>${l('Покупки под угрозу, цели на карте и решения по ходу матча.', 'Matchup purchases, map objectives and decisions during a match.')}</p></div>
 <nav class="guide-tabs field-nav" aria-label="${l('Разделы справочника', 'Guide sections')}">${sections.map(([id, ru, en]) => `<button data-section="${id}" aria-pressed="${id === section}">${l(ru, en)}</button>`).join('')}</nav><div class="guide-content"></div>`;
  const root = panel.querySelector('.guide-content');
  panel.querySelector('.field-nav').onclick = (e) => {
    const b = e.target.closest('button');
    if (b) {
      section = b.dataset.section;
      renderGuide(panel, items, lang, heroes);
      panel.querySelector('[aria-pressed=true]').focus();
    }
  };
  if (section !== 'timings') {
    try {
      await loadGuideData();
      if (panel.contains(root)) renderLibrary(panel, section, heroes, items, lang);
    } catch {
      if (panel.contains(root))
        root.textContent = l(
          'Не удалось загрузить локальный каталог. Открой раздел ещё раз.',
          'Could not load the local catalog. Reopen this section to retry.',
        );
    }
    return;
  }
  const o = objects[object],
    delay = o.delay[kill] || o.delay[0],
    fmt = (m, s) => String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  const clock = (total) => fmt(Math.floor(total / 60), total % 60);
  root.innerHTML = `<section class="guide-sheet"><h2>${l('Появление объектов', 'Objective spawns')}</h2><div class="guide-tabs">${objects.map((v, i) => `<button data-object="${i}" aria-pressed="${object === i}">${v.name[idx]}</button>`).join('')}</div><div class="spawn-summary"><div><small>${l('Первое появление', 'First spawn')}</small><b>${clock(o.first)}</b></div><div><small>${l('После зачистки', 'After clear')}</small><b>+ ${clock(delay)}</b></div></div><div class="field-clock"><div class="guide-time"><small>${l('Следующее появление', 'Next spawn')}</small><strong></strong><span></span></div><div><h3>${o.name[idx]}</h3><p>${o.hint[idx]}</p><div class="field-filters"><label>${l('Минуты', 'Minutes')}<input type="number" min="0" max="180" value="${minutes}"></label><label>${l('Секунды', 'Seconds')}<input type="number" min="0" max="59" value="${seconds}"></label>${o.delay.length > 1 ? `<label>${l('Убийство', 'Kill')}<select>${['1', '2', '3+'].map((v, i) => `<option value="${i}" ${kill === i ? 'selected' : ''}>${v}</option>`).join('')}</select></label>` : ''}</div></div></div><small class="guide-source">${l('Сверено 22.11.2026 ·', 'Checked 22 Nov 2026 ·')} <a href="https://deadlock.wiki/${o.url}" target="_blank" rel="noopener">Deadlock Wiki</a></small></section>`;
  const inputs = root.querySelectorAll('input');
  const calc = () => {
    const ok = [...inputs].every((el) => el.value !== '' && el.validity.valid);
    if (ok) {
      minutes = inputs[0].valueAsNumber;
      seconds = inputs[1].valueAsNumber;
    }
    root.querySelector('.guide-time strong').textContent = ok
      ? clock(minutes * 60 + seconds + delay)
      : '—';
    root.querySelector('.guide-time span').textContent = ok
      ? fmt(minutes, seconds) + ' + ' + clock(delay)
      : l('Проверь время события', 'Check the event time');
  };
  calc();
  root.oninput = calc;
  root.onclick = (e) => {
    const b = e.target.closest('[data-object]');
    if (b) {
      object = Number(b.dataset.object);
      kill = 0;
      renderGuide(panel, items, lang, heroes);
      panel.querySelector('[data-object][aria-pressed=true]').focus();
    }
  };
  root.onchange = (e) => {
    if (e.target.matches('select')) {
      kill = Number(e.target.value);
      renderGuide(panel, items, lang, heroes);
      panel.querySelector('.guide-content select').focus();
    }
  };
}
