// Experimental, budget-constrained builds; not hero-specific meta recommendations.
import { makeRng, pick, shuffle } from './rng.js';
import { heroPool } from './roulette.js';
import { BUILD_STAGES, buildSettings, savedBuild } from './build-config.js';
export const BRANCHES = ['weapon', 'vitality', 'spirit'];
function catalog(items) {
  const byId = new Map(items.filter((i) => i.active !== false).map((i) => [i.id, i]));
  const ancestors = (id, seen = new Set()) => {
    if (seen.has(id)) return [];
    const next = new Set([...seen, id]);
    return (byId.get(id)?.components || []).flatMap((p) => [p, ...ancestors(p, next)]);
  };
  return {
    byId,
    conflict: (a, b) =>
      a.id === b.id || ancestors(a.id).includes(b.id) || ancestors(b.id).includes(a.id),
  };
}
// The greedy pass stops at the slot cap, so a large budget can stay half spent.
// Search price-count plans in descending spend order, then assign compatible items.
// Pins remain fixed; equal-cost plans prefer more occupied slots.
function spendRemaining(out, left, { candidates, conflict, locked, settings }) {
  if (!left) return left;
  const fixed = out.filter((item) => locked.has(item.id)),
    budget = out.reduce((s, i) => s + i.cost, 0) + left;
  const available = candidates.filter((i) => !fixed.some((j) => conflict(i, j)));
  const costs = [...new Set(available.map((i) => i.cost))].sort((a, b) => b - a),
    slots = settings.maxItems - fixed.length;
  const remaining = budget - fixed.reduce((s, i) => s + i.cost, 0),
    plans = [];
  function plan(at, space, sum, counts) {
    if (at === costs.length) {
      plans.push({ sum, counts: [...counts], count: slots - space });
      return;
    }
    const cost = costs[at],
      max = Math.min(
        space,
        Math.floor((remaining - sum) / cost),
        available.filter((i) => i.cost === cost).length,
      );
    for (let n = max; n >= 0; n--) plan(at + 1, space - n, sum + n * cost, [...counts, n]);
  }
  plan(0, slots, 0, []);
  plans.sort((a, b) => b.sum - a.sum || b.count - a.count);
  const baseline = out.reduce((s, i) => s + i.cost, 0) - fixed.reduce((s, i) => s + i.cost, 0);
  for (const p of plans) {
    if (p.sum <= baseline) break;
    const wanted = p.counts.flatMap((n, i) => Array(n).fill(costs[i])),
      chosen = [...fixed];
    function fill(at, previous = -1) {
      if (at === wanted.length) return true;
      const cost = wanted[at],
        same = at > 0 && wanted[at - 1] === cost;
      const branchCounts = Object.fromEntries(
        BRANCHES.map((b) => [b, chosen.filter((i) => i.branch === b).length]),
      );
      const preferred =
        settings.focus === 'balanced'
          ? BRANCHES.reduce((a, b) => (branchCounts[a] <= branchCounts[b] ? a : b))
          : settings.focus;
      const eligible = available
        .map((item, index) => ({ item, index }))
        .filter(
          ({ item, index }) =>
            item.cost === cost &&
            (!same || index > previous) &&
            !chosen.some((j) => conflict(item, j)) &&
            (!item.isActive || chosen.filter((j) => j.isActive).length < settings.maxActive),
        );
      eligible.sort((a, b) => (b.item.branch === preferred) - (a.item.branch === preferred));
      for (const { item, index } of eligible) {
        chosen.push(item);
        if (fill(at + 1, index)) return true;
        chosen.pop();
      }
      return false;
    }
    if (fill(0)) {
      out.splice(0, out.length, ...chosen);
      return remaining - p.sum;
    }
  }
  return left;
}
export function makeBuild(seed, heroes, items, budget, o, raw = { stage: 'full', maxActive: 4 }) {
  if (!Number.isSafeInteger(budget) || budget < 800 || budget > 100000) return null;
  const settings = buildSettings({ ...raw, budget }),
    stage = BUILD_STAGES[settings.stage],
    r = makeRng(seed + ':build'),
    pool = heroPool(heroes, o),
    hero = settings.heroId ? pool.find((h) => h.id === settings.heroId) : pick(r, pool);
  if (!hero) return null;
  const { byId, conflict } = catalog(items),
    excluded = new Set(raw.excluded || []),
    locked = [...new Set(raw.locked || [])],
    out = locked.map((id) => byId.get(id));
  if (
    out.some((i) => !i || i.tier > stage.maxTier || excluded.has(i.id)) ||
    out.length > settings.maxItems ||
    out.some((x, j) => out.slice(j + 1).some((y) => conflict(x, y)))
  )
    return null;
  let left = budget - out.reduce((s, i) => s + i.cost, 0);
  if (left < 0 || out.filter((i) => i.isActive).length > settings.maxActive) return null;
  const candidates = [...byId.values()].filter(
    (i) => i.tier <= stage.maxTier && !excluded.has(i.id),
  );
  while (out.length < settings.maxItems) {
    const eligible = shuffle(
      r,
      candidates.filter(
        (i) =>
          i.cost <= left &&
          !out.some((j) => conflict(i, j)) &&
          (!i.isActive || out.filter((j) => j.isActive).length < settings.maxActive),
      ),
    );
    if (!eligible.length) break;
    const counts = Object.fromEntries(
      BRANCHES.map((b) => [b, out.filter((i) => i.branch === b).length]),
    );
    const preferred =
      settings.focus === 'balanced'
        ? BRANCHES.reduce((a, b) => (counts[a] <= counts[b] ? a : b))
        : out.length % 2 === 0
          ? settings.focus
          : BRANCHES.reduce((a, b) => (counts[a] <= counts[b] ? a : b));
    const slots = settings.maxItems - out.length,
      target = left / slots;
    const starts = Math.min(2, Math.floor(settings.maxItems / 3));
    const tier =
      out.filter((i) => i.tier === 1).length < starts
        ? 1
        : settings.stage === 'lane'
          ? 2
          : out.filter((i) => i.tier === 2).length < starts
            ? 2
            : settings.stage === 'full' && out.length >= Math.max(4, settings.maxItems - 3)
              ? 4
              : 3;
    const score = (i) =>
      (i.branch === preferred ? 3 : 0) +
      (i.tier === tier ? 5 : 0) -
      Math.abs(Math.log2(i.cost / Math.max(800, target)));
    eligible.sort((a, b) => score(b) - score(a));
    const item = eligible[0];
    out.push(item);
    left -= item.cost;
  }
  if (!out.length) return null;
  left = spendRemaining(out, left, {
    candidates: shuffle(r, candidates),
    conflict,
    locked: new Set(locked),
    settings,
  });
  out.sort((a, b) => a.tier - b.tier || a.cost - b.cost || a.name.localeCompare(b.name));
  return {
    hero: hero.id,
    budget,
    spent: budget - left,
    items: out.map((x) => x.id),
    seed,
    settings,
    locked,
    purchased: [],
  };
}
export function restoreBuild(raw, heroes, items) {
  const b = savedBuild(raw);
  if (!b || !heroes.some((h) => h.id === b.hero && h.active !== false)) return null;
  const { byId, conflict } = catalog(items),
    list = b.items.map((id) => byId.get(id));
  if (
    list.some((i) => !i || i.tier > BUILD_STAGES[b.settings.stage].maxTier) ||
    list.length > b.settings.maxItems ||
    list.filter((i) => i.isActive).length > b.settings.maxActive ||
    list.some((i, j) => list.slice(j + 1).some((k) => conflict(i, k)))
  )
    return null;
  const spent = list.reduce((s, i) => s + i.cost, 0);
  return spent <= b.budget ? { ...b, spent } : null;
}
export function replaceBuildItem(seed, b, id, heroes, items, o) {
  if (!b.items.includes(id) || b.locked.includes(id) || b.purchased.includes(id)) return null;
  const next = makeBuild(seed, heroes, items, b.budget, o, {
    ...b.settings,
    heroId: b.hero,
    maxItems: b.items.length,
    locked: b.items.filter((x) => x !== id),
    excluded: [id],
  });
  return next && next.items.length === b.items.length
    ? { ...next, settings: b.settings, locked: [...b.locked], purchased: [...b.purchased] }
    : null;
}

// Prefer an alternative at a similar price, then a cheaper option and a different activation type.
export function replacementOptions(b, id, heroes, items) {
  if (!b.items.includes(id) || b.locked.includes(id) || b.purchased.includes(id)) return [];
  const original = items.find((i) => i.id === id);
  const options = items
    .filter((i) => i.active !== false && !b.items.includes(i.id))
    .sort((a, c) => Math.abs(a.cost - original.cost) - Math.abs(c.cost - original.cost))
    .map((i) => ({
      i,
      build: restoreBuild(
        { ...b, items: b.items.map((key) => (key === id ? i.id : key)) },
        heroes,
        items,
      ),
    }))
    .filter((x) => x.build);
  const selected = [];
  for (const test of [
    () => true,
    (x) => x.i.cost < original.cost,
    (x) => x.i.isActive !== original.isActive,
    () => true,
    () => true,
  ]) {
    const x = options.find((x) => !selected.includes(x) && test(x));
    if (x) selected.push(x);
    if (selected.length === 3) break;
  }
  return selected.map((x) => x.build);
}
