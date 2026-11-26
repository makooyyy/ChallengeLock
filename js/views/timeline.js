import { objects } from './map-events.js';
const events = [
  ...objects,
  { id: 'bridge', name: ['Усиления на мостах', 'Bridge buffs'], first: 300, period: 300 },
  { id: 'urn', name: ['Урна душ', 'Soul Urn'], first: 600, period: 300 },
  { id: 'wave', name: ['Волна солдат', 'Trooper wave'], first: 0 },
];
const validTime = (n) => Number.isSafeInteger(n) && n >= 0;
const clock = (n) => Math.floor(n / 60) + ':' + String(n % 60).padStart(2, '0');
function read(storage, key) {
  try {
    return JSON.parse(storage.getItem(key));
  } catch {
    return null;
  }
}
function write(storage, key, value) {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    /* Keep the timeline usable when storage is full. */
  }
}
const prefKey = 'cl.timeline.preferences',
  sessionKey = 'cl.timeline.session';
let session, selected, leads, lastSecond, callback, getLang, host, language, ticker;
function init() {
  if (selected) return;
  const prefs = read(localStorage, prefKey);
  selected = new Set(events.map((e) => e.id).filter((id) => prefs?.selected?.includes?.(id)));
  leads = new Set([30, 10].filter((n) => !Array.isArray(prefs?.leads) || prefs.leads.includes(n)));
  const raw = read(sessionStorage, sessionKey);
  session = {
    start: validTime(raw?.start) ? raw.start : 0,
    detected: validTime(raw?.detected) ? raw.detected : 0,
    clears: {},
  };
  for (const e of events) {
    const c = raw?.clears?.[e.id];
    if (e.delay && validTime(c?.at) && Number.isSafeInteger(c.count) && c.count > 0)
      session.clears[e.id] = c;
  }
  lastSecond = elapsed();
}
const elapsed = () =>
  session.start ? Math.max(0, Math.floor((Date.now() - session.start) / 1000)) : 0;
export function nextEvent(e, t, clear) {
  if (e.id === 'wave') {
    const origin = t >= 2100 ? 2100 : t >= 1200 ? 1200 : 0,
      period = t >= 2100 ? 20 : t >= 1200 ? 25 : 30;
    return origin + Math.ceil((t - origin) / period) * period;
  }
  if (e.period) return e.first + Math.max(0, Math.ceil((t - e.first) / e.period)) * e.period;
  if (clear) return clear.at + e.delay[Math.min(clear.count - 1, e.delay.length - 1)];
  return e.first;
}
function persist() {
  write(sessionStorage, sessionKey, session);
}
function reset(start, detected) {
  session = { start, detected, clears: {} };
  lastSecond = elapsed();
  persist();
  refresh();
}
export function syncTimeline(m) {
  init();
  if (
    m.phase === 'playing' &&
    validTime(m.startedAt) &&
    m.startedAt > 0 &&
    m.startedAt !== session.detected
  )
    reset(m.startedAt, m.startedAt);
  if (
    ['ended', 'interrupted'].includes(m.phase) &&
    session.start &&
    session.detected &&
    (!m.startedAt || session.detected === m.startedAt)
  )
    reset(0, session.detected);
}
export function watchTimeline(lang, notify) {
  init();
  getLang = lang;
  callback = notify;
  if (!ticker) ticker = setInterval(tick, 500);
}
function tick() {
  const now = elapsed();
  if (session.start && now > lastSecond) {
    const messages = [];
    for (const e of events.filter((e) => selected.has(e.id))) {
      for (const lead of leads) {
        // A delayed tick can cross a threshold. Ignore alerts over two seconds late.
        const earliest = Math.max(now - 2, lastSecond + 1);
        const due = nextEvent(e, earliest + lead, session.clears[e.id]);
        if (due - lead >= earliest && due - lead <= now)
          messages.push(
            e.name[getLang() === 'en' ? 1 : 0] +
              ' · ' +
              (due - now) +
              (getLang() === 'en' ? 's' : ' с'),
          );
      }
    }
    if (messages.length) callback(messages.join(' / '));
  }
  lastSecond = now;
  if (host?.isConnected && !host.closest('[hidden]')) updateTimes();
}
function updateTimes() {
  const now = elapsed();
  host.querySelector('[data-game-clock]').textContent = clock(now);
  for (const e of events) {
    const row = host.querySelector('[data-event="' + e.id + '"]');
    const due = nextEvent(e, now, session.clears[e.id]);
    row.querySelector('time').textContent = clock(due);
    row.querySelector('small').textContent = !session.start
      ? ''
      : due <= now
        ? language === 'en'
          ? 'Expected on map'
          : 'По таймеру на карте'
        : '−' + clock(due - now);
    const clear = row.querySelector('button');
    if (clear) clear.disabled = !session.start || due > now;
  }
}
function refresh() {
  if (host?.isConnected) renderTimeline(host, language);
}
export function renderTimeline(root, lang) {
  init();
  host = root;
  language = lang;
  const en = lang === 'en',
    l = (ru, eng) => (en ? eng : ru);
  const now = elapsed(),
    sorted = [...events].sort(
      (a, b) => nextEvent(a, now, session.clears[a.id]) - nextEvent(b, now, session.clears[b.id]),
    );
  root.innerHTML = `<section class="guide-sheet match-timeline"><h2>${l('Часы матча', 'Match clock')}</h2><div class="timeline-clock"><strong data-game-clock></strong><button class="pb" data-run>${session.start ? l('Завершить отсчёт', 'Stop clock') : l('Матч начался', 'Match started')}</button></div><p>${l('Для обычной карты. Приложение запускает часы по сигналу игры. Если время расходится, сверь его с игровым таймером.', 'For the standard map. The desktop app starts the clock when it detects a match. Adjust it to the in-game timer if needed.')}</p><form class="timeline-form"><label>${l('Время в игре', 'In-game time')} <input name="time" placeholder="12:35" required pattern="[0-9]{1,3}:[0-5][0-9]" aria-label="${l('Минуты и секунды', 'Minutes and seconds')}"></label><button>${l('Применить', 'Apply')}</button></form><fieldset><legend>${l('Напоминать за', 'Notify before')}</legend>${[30, 10].map((n) => `<label><input type="checkbox" data-lead="${n}" ${leads.has(n) ? 'checked' : ''}> ${n} ${l('секунд', 'seconds')}</label>`).join('')}</fieldset><p>${l('Выбери объекты для напоминаний. Для лагеря или коробки отмечай одну и ту же точку после полной зачистки.', 'Select the objectives you want alerts for. For camps and crates, track the same location and mark it after clearing.')}</p><ol>${sorted.map((e) => `<li data-event="${e.id}"><time></time><label><input type="checkbox" data-track="${e.id}" ${selected.has(e.id) ? 'checked' : ''}> ${e.name[en ? 1 : 0]}</label><small></small>${e.delay ? `<button data-clear="${e.id}">${l('Зачищено сейчас', 'Cleared now')}</button>` : ''}</li>`).join('')}</ol><details class="timeline-sources"><summary>${l('Расписание карты', 'Map schedule')}</summary><p><a href="https://deadlock.wiki/Troopers" target="_blank" rel="noopener">${l('Волны', 'Waves')}</a> · ${l('0–20 мин: 30 с · 20–35 мин: 25 с · 35+ мин: 20 с', '0–20 min: 30s · 20–35 min: 25s · 35+ min: 20s')}</p><p><a href="https://deadlock.wiki/Powerup" target="_blank" rel="noopener">${l('Усиления', 'Bridge buffs')}</a> · 5:00, 10:00, 15:00…</p><p><a href="https://deadlock.wiki/Soul_Urn" target="_blank" rel="noopener">${l('Урна', 'Urn')}</a> · 10:00, 15:00, 20:00…</p></details></section>`;
  updateTimes();
  root.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.hasAttribute('data-run')) reset(session.start ? 0 : Date.now(), session.detected);
    if (b.dataset.clear) {
      const id = b.dataset.clear;
      session.clears[id] = { at: elapsed(), count: (session.clears[id]?.count || 0) + 1 };
      persist();
      refresh();
    }
  };
  root.onchange = (e) => {
    const d = e.target.dataset;
    const set = d.track ? selected : d.lead ? leads : null;
    if (!set) return;
    const v = d.track || Number(d.lead);
    if (e.target.checked) set.add(v);
    else set.delete(v);
    write(localStorage, prefKey, { selected: [...selected], leads: [...leads] });
  };
  root.querySelector('form').onsubmit = (e) => {
    e.preventDefault();
    const [m, s] = e.currentTarget.elements.time.value.split(':').map(Number);
    const to = m * 60 + s,
      delta = to - elapsed();
    for (const c of Object.values(session.clears)) c.at = Math.max(0, c.at + delta);
    session.start = Date.now() - to * 1000;
    lastSecond = to;
    persist();
    refresh();
  };
}
