export const BUILD_STAGES = {
  lane: { maxTier: 2, slots: 6, budget: 4800, presets: [1600, 3200, 4800, 6400] },
  mid: { maxTier: 3, slots: 8, budget: 16000, presets: [8000, 12000, 16000, 20000] },
  full: { maxTier: 4, slots: 12, budget: 32000, presets: [24000, 32000, 48000, 64000] },
};
export function buildSettings(x = {}) {
  if (!x || typeof x !== 'object') x = {};
  const stage = Object.hasOwn(BUILD_STAGES, x.stage) ? x.stage : 'lane',
    base = BUILD_STAGES[stage];
  return {
    stage,
    budget:
      Number.isSafeInteger(x.budget) && x.budget >= 800 && x.budget <= 100000
        ? x.budget
        : base.budget,
    heroId: typeof x.heroId === 'string' && /^[a-z0-9_-]{1,100}$/.test(x.heroId) ? x.heroId : '',
    focus: ['balanced', 'weapon', 'vitality', 'spirit'].includes(x.focus) ? x.focus : 'balanced',
    maxActive: [0, 1, 2, 4].includes(x.maxActive) ? x.maxActive : 2,
    maxItems:
      Number.isInteger(x.maxItems) && x.maxItems >= 1 && x.maxItems <= base.slots
        ? x.maxItems
        : base.slots,
    keepHero: x.keepHero !== false,
  };
}
export function savedBuild(x) {
  if (
    !x ||
    typeof x !== 'object' ||
    typeof x.hero !== 'string' ||
    typeof x.seed !== 'string' ||
    x.seed.length > 256 ||
    !Array.isArray(x.items) ||
    !x.items.length ||
    x.items.length > 12 ||
    x.items.some((v) => typeof v !== 'string' || v.length > 100) ||
    new Set(x.items).size !== x.items.length
  )
    return null;
  const settings = buildSettings(x.settings),
    subset = (v) => (Array.isArray(v) ? [...new Set(v.filter((id) => x.items.includes(id)))] : []);
  return {
    hero: x.hero,
    seed: x.seed,
    items: [...x.items],
    budget: settings.budget,
    settings,
    locked: subset(x.locked),
    purchased: subset(x.purchased),
  };
}
export function banSettings(x = {}) {
  if (!x || typeof x !== 'object') x = {};
  return {
    heroId: typeof x.heroId === 'string' && /^[a-z0-9_-]{1,100}$/.test(x.heroId) ? x.heroId : '',
    type: x.type === 'item' ? 'item' : 'ability',
    slot: [1, 2, 3, 4].includes(x.slot) ? x.slot : 0,
    noUltimate: x.noUltimate === true,
    fromBuild: x.fromBuild === true,
  };
}
export function savedBan(x) {
  if (!x || typeof x !== 'object' || typeof x.hero !== 'string' || x.hero.length > 100) return null;
  if ([1, 2, 3, 4].includes(x.slot)) return { hero: x.hero, slot: x.slot };
  if (typeof x.item === 'string' && x.item.length < 100) return { hero: x.hero, item: x.item };
  return null;
}
