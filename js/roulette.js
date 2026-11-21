import { makeRng, pick, int, shuffle } from './rng.js';
import { options, validRecord } from './validation.js';
export const DIFF = {
  easy: { n: [1, 1], max: 1 },
  mid: { n: [1, 1], max: 2 },
  hard: { n: [2, 2], max: 4 },
  insane: { n: [3, 3], max: 5 },
};
export const compatible = (a, b) =>
  a.id !== b.id &&
  !a.conflicts.some((t) => b.tags.includes(t)) &&
  !b.conflicts.some((t) => a.tags.includes(t));
export function heroPool(heroes, f) {
  return heroes.filter(
    (h) =>
      h.active !== false && !f.excluded.includes(h.id) && (!f.only.length || f.only.includes(h.id)),
  );
}
export const supportsMode = (c, mode) => (c.gameModes || ['normal']).includes(mode);
const ok = (c, hero, o) =>
  c.active !== false &&
  supportsMode(c, o.gameMode) &&
  o.cats.includes(c.cat) &&
  c.difficulty <= DIFF[o.diff].max &&
  (c.mode !== 'team' || o.team) &&
  (c.heroes === 'all' || c.heroes.includes(hero.id));
export function resultFor({ seed, r = 0, diff, hero, conds, player = 0, opts, ts }) {
  return {
    seed,
    r,
    diff,
    hero,
    conds: [...conds],
    player,
    opts: options({ ...opts, diff }),
    // Restoring a saved contract keeps its original timestamp; a new roll starts now.
    ts: Number.isFinite(ts) && ts > 0 ? ts : Date.now(),
    outcome: null,
  };
}
export function restoreResult(x, heroes, challenges) {
  if (!validRecord(x) || !heroes.some((h) => h.id === x.hero)) throw new Error('Invalid result');
  const cs = x.conds.map((id) => challenges.find((c) => c.id === id));
  if (
    cs.some((c) => !c || !supportsMode(c, options(x.opts).gameMode)) ||
    cs.some((a, i) => cs.slice(i + 1).some((b) => !compatible(a, b)))
  )
    throw new Error('Unavailable result');
  return resultFor(x);
}
export const resultKey = (x) =>
  JSON.stringify([x.seed, x.diff, x.r, x.hero, x.conds, options(x.opts).gameMode]);
// Independent count stream keeps direct replay and unlocked reroll identical.
export function roll(input) {
  return rollDetailed(input).result;
}
// Same generator, but every refusal carries a reason the UI can explain.
export function rollDetailed({
  seed,
  r = 0,
  heroes,
  challenges,
  o,
  locks = [],
  prev = null,
  requireChange = false,
  player = 0,
  same = true,
}) {
  const fail = (reason) => ({ result: null, reason });
  o = options(o);
  const pool = heroPool(heroes, o);
  if (!pool.length) return fail('no-heroes');
  const rng = makeRng(seed + ':' + o.diff + ':' + r),
    hr = makeRng(seed + (same ? '' : '#' + player) + ':' + o.diff + ':' + r + ':h');
  const [lo, hi] = DIFF[o.diff].n,
    n = int(makeRng(seed + ':' + o.diff + ':count'), lo, hi);
  const locked = prev
    ? prev.conds.map((id, i) => (locks[i + 1] ? challenges.find((c) => c.id === id) : null))
    : [];
  if (locked.some((c, i) => locks[i + 1] && (!c || i >= n))) return fail('locked-condition');
  const eligible = pool.filter((h) => locked.every((c) => !c || ok(c, h, o)));
  const keptHero = prev && locks[0] ? pool.find((h) => h.id === prev.hero) : null;
  if (prev && locks[0] && !keptHero) return fail('locked-hero');
  if (!eligible.length) return fail(locked.some(Boolean) ? 'locked-condition' : 'no-conditions');
  if (keptHero && !eligible.includes(keptHero)) return fail('locked-condition');
  const first = keptHero || pick(hr, eligible);
  const order = keptHero ? [first] : [first, ...eligible.filter((h) => h !== first)];
  const ranges = {
    easy: [[1, 1]],
    mid: [[2, 2]],
    hard: [
      [3, 4],
      [1, 2],
    ],
    insane: [
      [4, 5],
      [2, 3],
      [1, 2],
    ],
  }[o.diff];
  for (const hero of order) {
    const cand = shuffle(
      rng,
      challenges.filter((c) => ok(c, hero, o)),
    );
    const list = [];
    function fill(i) {
      if (i === n)
        return (
          !requireChange ||
          !prev ||
          hero.id !== prev.hero ||
          list.some((c) => !prev.conds.includes(c.id))
        );
      const [min, max] = ranges[i];
      for (const c of locked[i] ? [locked[i]] : cand) {
        if (
          c.difficulty < min ||
          c.difficulty > max ||
          !list.every((other) => compatible(c, other))
        )
          continue;
        list.push(c);
        if (fill(i + 1)) return true;
        list.pop();
      }
      return false;
    }
    if (fill(0))
      return {
        result: resultFor({
          seed,
          r,
          diff: o.diff,
          hero: hero.id,
          conds: list.map((c) => c.id),
          player: same ? 0 : player,
          opts: o,
        }),
        reason: null,
      };
  }
  return fail(requireChange ? 'no-alternative' : 'no-conditions');
}
export function rollBan(seed, heroes, items, o, type) {
  items = items.filter((i) => i.active !== false);
  const r = makeRng(seed + ':ban'),
    hero = pick(r, heroPool(heroes, o));
  if (!hero || (type === 'item' && !items.length)) return null;
  return type === 'item'
    ? { hero: hero.id, item: pick(r, items).id }
    : { hero: hero.id, slot: int(r, 1, hero.abilities) };
}

export const CONTRACT_DAY = 24 * 60 * 60 * 1000;

export function expireContracts(state, now = Date.now()) {
  const failed = new Set();
  const records = [...state.history, ...state.favs];
  for (const x of records) {
    if (!x.outcome && now >= x.ts + CONTRACT_DAY) failed.add(resultKey(x));
  }
  for (const x of records) {
    if (!x.outcome && failed.has(resultKey(x))) x.outcome = 'fail';
  }
  state.stats.fail += failed.size;
  return failed;
}
