import { buildSettings, savedBuild, banSettings, savedBan } from './build-config.js';
export const CATS = ['ab', 'it', 'gp', 'go', 'tm', 'ch'];
export const GAME_MODES = ['street', 'normal', 'ranked'];
export const DIFFICULTIES = ['easy', 'mid', 'hard', 'insane'];
const object = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
export const strings = (x) =>
  Array.isArray(x) ? [...new Set(x.filter((v) => typeof v === 'string' && v.length < 128))] : [];
export const count = (x, fallback = 0) => (Number.isSafeInteger(x) && x >= 0 ? x : fallback);
export function options(x = {}) {
  if (!object(x)) x = {};
  return {
    gameMode: GAME_MODES.includes(x.gameMode) ? x.gameMode : 'normal',
    diff: DIFFICULTIES.includes(x.diff) ? x.diff : 'mid',
    cats: Array.isArray(x.cats) ? strings(x.cats).filter((c) => CATS.includes(c)) : [...CATS],
    team: x.team === true,
    excluded: strings(x.excluded),
    only: strings(x.only),
  };
}
export function validRecord(x) {
  return (
    object(x) &&
    typeof x.seed === 'string' &&
    x.seed.length > 0 &&
    x.seed.length <= 256 &&
    DIFFICULTIES.includes(x.diff) &&
    Number.isSafeInteger(x.r) &&
    x.r >= 0 &&
    x.r <= 1000000 &&
    typeof x.hero === 'string' &&
    Array.isArray(x.conds) &&
    x.conds.length >= 1 &&
    x.conds.length <= 3 &&
    strings(x.conds).length === x.conds.length
  );
}
export function normalizeState(x, def) {
  if (!object(x)) x = {};
  const out = { ...def, ...options({ ...def, ...x }) };
  out.lang = x.lang === 'en' ? 'en' : 'ru';
  out.sound = typeof x.sound === 'boolean' ? x.sound : def.sound;
  out.theme = ['light', 'dark', 'system'].includes(x.theme) ? x.theme : 'system';
  out.stats = Object.fromEntries(['done', 'fail'].map((k) => [k, count(x.stats?.[k])]));
  out.friend = {
    same: x.friend?.same !== false,
    player: Number.isInteger(x.friend?.player) ? Math.max(1, Math.min(9, x.friend.player)) : 1,
  };
  for (const k of ['history', 'favs'])
    out[k] = (Array.isArray(x[k]) ? x[k] : [])
      .filter(validRecord)
      .slice(0, 50)
      .map((r) => ({
        seed: r.seed,
        r: r.r,
        diff: r.diff,
        hero: r.hero,
        conds: [...r.conds],
        player: count(r.player),
        opts: options(r.opts),
        ts: r.ts,
        reason: ['manual', 'match', 'deadline'].includes(r.reason) ? r.reason : null,
        endedAt: Number.isFinite(r.endedAt) && r.endedAt > 0 ? r.endedAt : null,
        checked: strings(r.checked).filter((id) => r.conds.includes(id)),
        outcome: ['done', 'fail'].includes(r.outcome) ? r.outcome : null,
      }));
  out.banSettings = banSettings(x.banSettings);
  out.banContractKey = typeof x.banContractKey === 'string' ? x.banContractKey : '';
  out.savedBan = savedBan(x.savedBan);
  out.buildSettings = buildSettings(x.buildSettings);
  out.savedBuild = savedBuild(x.savedBuild);
  out.comparisonBuild = savedBuild(x.comparisonBuild);
  out.buildContractKey = typeof x.buildContractKey === 'string' ? x.buildContractKey : '';
  out.heroMode = x.heroMode === 'only' ? 'only' : 'exclude';
  out.sel = strings(x.sel ?? (out.heroMode === 'only' ? out.only : out.excluded));
  return out;
}
export function validateData(data, dict) {
  const fail = (m) => {
    throw new Error('Invalid data: ' + m);
  };
  const localized = (x) =>
    object(x) && ['ru', 'en'].every((k) => typeof x[k] === 'string' && x[k].length > 0);
  for (const key of ['heroes', 'items', 'challenges']) {
    const list = data[key];
    if (!Array.isArray(list) || !list.length) fail(key);
    const ids = new Set();
    for (const x of list) {
      if (!object(x) || typeof x.id !== 'string' || !/^[a-z0-9_-]+$/.test(x.id) || ids.has(x.id))
        fail(key + ' id');
      ids.add(x.id);
    }
  }
  for (const h of data.heroes) {
    if (
      typeof h.name !== 'string' ||
      !h.name ||
      !/^#[0-9a-f]{6}$/i.test(h.color) ||
      !Number.isInteger(h.abilities) ||
      h.abilities < 1 ||
      h.abilities > 4
    )
      fail('hero');
    if (
      h.icon &&
      !(typeof h.icon === 'string' && /^https:\/\/assets-bucket\.deadlock-api\.com\//.test(h.icon))
    )
      fail('hero icon');
  }
  for (const i of data.items)
    if (
      typeof i.name !== 'string' ||
      !['weapon', 'vitality', 'spirit'].includes(i.branch) ||
      !Number.isInteger(i.cost) ||
      i.cost <= 0 ||
      !Number.isInteger(i.tier) ||
      i.tier < 1 ||
      i.tier > 4
    )
      fail('item');
  const itemIds = new Map(data.items.map((i) => [i.id, i]));
  for (const kind of ['heroes', 'items']) {
    const apiIds = new Set();
    for (const x of data[kind]) {
      if (x.active !== undefined && typeof x.active !== 'boolean') fail('active flag');
      if (x.apiId !== undefined) {
        if (!Number.isSafeInteger(x.apiId) || x.apiId < 1 || apiIds.has(x.apiId)) fail('API id');
        apiIds.add(x.apiId);
      }
    }
  }
  for (const i of data.items) {
    for (const field of ['components', 'buildsInto'])
      if (
        i[field] !== undefined &&
        (!Array.isArray(i[field]) ||
          strings(i[field]).length !== i[field].length ||
          i[field].some((id) => !itemIds.has(id)))
      )
        fail('recipe ' + i.id);
    if (
      i.icon &&
      !(typeof i.icon === 'string' && /^https:\/\/assets-bucket\.deadlock-api\.com\//.test(i.icon))
    )
      fail('item icon');
    if (i.active !== false)
      for (const id of i.components || []) {
        const component = itemIds.get(id);
        if (component.active === false || !component.buildsInto?.includes(i.id))
          fail('recipe backlink');
      }
  }
  const visited = new Set();
  function visit(id, stack = new Set()) {
    if (stack.has(id)) fail('recipe cycle');
    if (visited.has(id)) return;
    const next = new Set([...stack, id]);
    for (const parent of itemIds.get(id).components || []) visit(parent, next);
    visited.add(id);
  }
  data.items.forEach((i) => visit(i.id));
  if (data.catalog) {
    const { heroes: h, items: i } = data.catalog;
    if (
      !h ||
      !i ||
      h.schemaVersion !== 1 ||
      i.schemaVersion !== 1 ||
      h.revision !== i.revision ||
      h.clientVersion !== i.clientVersion ||
      !Number.isSafeInteger(h.clientVersion) ||
      h.clientVersion < 1 ||
      !Number.isFinite(Date.parse(h.retrievedAt)) ||
      !Number.isFinite(Date.parse(i.retrievedAt))
    )
      fail('catalog versions');
    for (const [kind, meta] of [
      ['heroes', h],
      ['items', i],
    ]) {
      if (
        !/^[a-f0-9]{16}$/.test(meta.revision) ||
        !/^https:\/\/api\.deadlock-api\.com\/v1\/assets\//.test(meta.source) ||
        !/^[a-f0-9]{64}$/.test(meta.sha256)
      )
        fail('catalog provenance');
      if (
        !data[kind].some((x) => x.active !== false) ||
        data[kind].some(
          (x) => x.active !== false && (!x.verified || !Number.isSafeInteger(x.apiId)),
        )
      )
        fail('unverified active entry');
    }
  }
  const heroIds = new Set(data.heroes.map((h) => h.id));
  for (const c of data.challenges)
    if (
      (c.active !== undefined && typeof c.active !== 'boolean') ||
      (c.gameModes !== undefined &&
        (!Array.isArray(c.gameModes) ||
          !c.gameModes.length ||
          c.gameModes.some((m) => !GAME_MODES.includes(m)))) ||
      !CATS.includes(c.cat) ||
      !localized(c.name) ||
      !localized(c.desc) ||
      !Number.isInteger(c.difficulty) ||
      c.difficulty < 1 ||
      c.difficulty > 5 ||
      !['solo', 'team'].includes(c.mode) ||
      !Array.isArray(c.tags) ||
      strings(c.tags).length !== c.tags.length ||
      !Array.isArray(c.conflicts) ||
      strings(c.conflicts).length !== c.conflicts.length ||
      !(c.heroes === 'all' || (Array.isArray(c.heroes) && c.heroes.every((id) => heroIds.has(id))))
    )
      fail('challenge ' + c.id);
  if (!object(dict) || !object(dict.ru) || !object(dict.en)) fail('translations');
  for (const lang of ['ru', 'en']) {
    for (const k of Object.keys(dict.ru))
      if (typeof dict[lang][k] !== 'string') fail('translation ' + k);
  }
  return data;
}
