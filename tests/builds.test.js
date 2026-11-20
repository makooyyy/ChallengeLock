import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makeBuild, replaceBuildItem, restoreBuild } from '../js/builds.js';
import { BUILD_STAGES, buildSettings, savedBuild } from '../js/build-config.js';
import { options, normalizeState } from '../js/validation.js';
const read = (name) =>
  JSON.parse(fs.readFileSync(new URL('../data/' + name + '.json', import.meta.url), 'utf8'))[name];
const heroes = read('heroes'),
  items = read('items'),
  o = options();
const get = (id) => items.find((i) => i.id === id);
test('build settings constrain tier, budget, hero, active items and slot count', () => {
  for (const stage of Object.keys(BUILD_STAGES))
    for (const maxActive of [0, 1, 2, 4])
      for (const focus of ['balanced', 'weapon', 'spirit', 'vitality'])
        for (let n = 0; n < 15; n++) {
          const cfg = buildSettings({ stage, maxActive, focus, heroId: 'abrams' }),
            b = makeBuild('lab' + n, heroes, items, cfg.budget, o, cfg);
          assert(b);
          assert.equal(b.hero, 'abrams');
          assert(b.spent <= cfg.budget);
          assert(b.items.length <= cfg.maxItems);
          assert(b.items.every((id) => get(id).tier <= BUILD_STAGES[stage].maxTier));
          assert(b.items.filter((id) => get(id).isActive).length <= maxActive);
          assert.deepEqual(b.items, makeBuild('lab' + n, heroes, items, cfg.budget, o, cfg).items);
        }
  for (const budget of [0, 799, -1, Infinity, NaN, 100001, 1600.5])
    assert.equal(makeBuild('bad', heroes, items, budget, o), null);
  assert.equal(
    makeBuild(
      'excluded',
      heroes,
      items,
      4800,
      { ...o, excluded: ['abrams'] },
      { heroId: 'abrams' },
    ),
    null,
  );
});
test('large budgets are spent on items instead of being left as remainder', () => {
  const cap = (stage) =>
    buildSettings({ stage }).maxItems *
    Math.max(...items.filter((i) => i.tier <= BUILD_STAGES[stage].maxTier).map((i) => i.cost));
  for (const stage of Object.keys(BUILD_STAGES))
    for (const budget of [16000, 32000, 48000, 64000, 100000])
      for (let n = 0; n < 5; n++) {
        const cfg = buildSettings({ stage, budget, maxActive: 4 }),
          b = makeBuild('spend' + n, heroes, items, budget, o, cfg);
        assert(b);
        assert(b.spent <= budget);
        assert(b.spent <= cap(stage));
        assert(
          budget - b.spent < 800 || b.spent >= cap(stage) - 800,
          `${stage} ${budget} spent ${b.spent}`,
        );
        assert.equal(new Set(b.items).size, b.items.length);
      }
  for (let n = 0; n < 5; n++)
    for (const budget of [48000, 64000]) {
      const b = makeBuild(
        'exact' + n,
        heroes,
        items,
        budget,
        o,
        buildSettings({ stage: 'full', budget, maxActive: 4 }),
      );
      assert.equal(b.spent, budget, `full ${budget} spent ${b.spent}`);
    }
});
test('pins and purchased items survive; replacing one item preserves the rest', () => {
  const cfg = buildSettings({ stage: 'full', budget: 32000 }),
    b = makeBuild('pins', heroes, items, 32000, o, cfg);
  b.locked = [b.items[0]];
  b.purchased = [b.items[1]];
  const next = makeBuild('again', heroes, items, 32000, o, {
    ...cfg,
    locked: [...b.locked, ...b.purchased],
  });
  assert(next.items.includes(b.items[0]));
  assert(next.items.includes(b.items[1]));
  const target = b.items[2],
    replacement = replaceBuildItem('replacement', b, target, heroes, items, o);
  assert(replacement);
  assert(!replacement.items.includes(target));
  assert(b.items.filter((id) => id !== target).every((id) => replacement.items.includes(id)));
  assert.deepEqual(replacement.locked, b.locked);
  assert.deepEqual(replacement.purchased, b.purchased);
  assert(replacement.spent <= b.budget);
  assert.equal(replaceBuildItem('locked', b, b.items[0], heroes, items, o), null);
  assert.equal(replaceBuildItem('bought', b, b.items[1], heroes, items, o), null);
  const pricey = items.find((i) => i.tier === 4);
  assert.equal(
    makeBuild('bad-pin', heroes, items, 1600, o, { stage: 'lane', locked: [pricey.id] }),
    null,
  );
});
test('saved builds are validated against catalog before display', () => {
  const cfg = buildSettings({ stage: 'lane' }),
    b = makeBuild('save', heroes, items, cfg.budget, o, cfg);
  b.locked = [b.items[0]];
  b.purchased = [b.items[0]];
  assert.equal(restoreBuild(b, heroes, items).spent, b.spent);
  assert.deepEqual(restoreBuild(b, heroes, items).purchased, b.purchased);
  assert.equal(restoreBuild({ ...b, items: ['missing'] }, heroes, items), null);
  assert.equal(restoreBuild({ ...b, items: [b.items[0], b.items[0]] }, heroes, items), null);
  assert.equal(savedBuild(null), null);
  const state = normalizeState(
    { buildSettings: { stage: 'bad', budget: -1, maxActive: 99 }, savedBuild: b },
    o,
  );
  assert.equal(state.buildSettings.stage, 'lane');
  assert.equal(state.buildSettings.maxActive, 2);
  assert.equal(state.savedBuild.hero, b.hero);
});

test('budget optimizer can rearrange slots and matches exhaustive small-catalog optimum', () => {
  for (const budget of [64800, 65600, 66400, 76800, 100000]) {
    const b = makeBuild('review0', heroes, items, budget, o, { stage: 'full', maxActive: 4 });
    assert.equal(b.spent, Math.min(budget, 76800));
  }
  const small = items.filter((i) => !i.isActive && i.tier <= 3).slice(0, 12);
  for (const budget of [5600, 10400, 12800, 20000]) {
    let best = 0;
    for (let mask = 1; mask < 1 << small.length; mask++) {
      const chosen = small.filter((_, i) => mask & (1 << i));
      if (chosen.length > 4) continue;
      const raw = {
        hero: heroes[0].id,
        seed: 'brute',
        items: chosen.map((i) => i.id),
        settings: { stage: 'full', maxItems: 4, maxActive: 0, budget },
      };
      const valid = restoreBuild(raw, heroes, small);
      if (valid) best = Math.max(best, valid.spent);
    }
    const b = makeBuild('optimum', heroes, small, budget, o, {
      stage: 'full',
      maxItems: 4,
      maxActive: 0,
    });
    assert.equal(b?.spent || 0, best);
  }
});
