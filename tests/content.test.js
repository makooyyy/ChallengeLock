// Guards the content mix: the generator can only be as varied as the pool behind it.
// A player on easy difficulty + street brawl used to see four possible challenges.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) =>
  JSON.parse(fs.readFileSync(new URL('../data/' + p + '.json', import.meta.url), 'utf8'));
const challenges = read('challenges').challenges;
const heroes = read('heroes').heroes;
const supports = (c, mode) => (c.gameModes || ['normal']).includes(mode);
const count = (predicate) => challenges.filter(predicate).length;

test('every difficulty bucket has enough variety to spin again', () => {
  assert.ok(count((c) => c.difficulty <= 1) >= 24, 'easy pool too thin');
  assert.ok(count((c) => c.difficulty <= 2) >= 32, 'normal pool too thin');
  for (const mode of ['street', 'normal', 'ranked'])
    assert.ok(
      count((c) => c.difficulty <= 1 && supports(c, mode)) >= 10,
      'easy pool too thin for ' + mode,
    );
});

test('team and hero-specific content actually exists', () => {
  assert.ok(count((c) => c.mode === 'team') >= 13, 'team pool too thin');
  const specific = challenges.filter((c) => c.heroes !== 'all');
  assert.ok(specific.length >= 8, 'no hero-specific challenges');
  const active = new Set(heroes.filter((h) => h.active !== false).map((h) => h.id));
  for (const challenge of specific)
    for (const id of challenge.heroes)
      assert.ok(active.has(id), `${challenge.id} targets an unavailable hero: ${id}`);
});

test('team contracts can be combined without conflicts', () => {
  const team = challenges.filter((c) => c.mode === 'team');
  const compatible = (a, b) =>
    a.id !== b.id &&
    !a.conflicts.some((tag) => b.tags.includes(tag)) &&
    !b.conflicts.some((tag) => a.tags.includes(tag));
  let pair = null;
  for (const a of team) for (const b of team) if (!pair && compatible(a, b)) pair = [a, b];
  assert.ok(pair, 'no two team challenges can appear together');
});

test('challenge ids and names stay unique', () => {
  const ids = new Set();
  const names = new Set();
  for (const challenge of challenges) {
    assert.ok(!ids.has(challenge.id), 'duplicate id: ' + challenge.id);
    ids.add(challenge.id);
    const name = challenge.name.ru.trim().toLowerCase();
    assert.ok(!names.has(name), 'duplicate name: ' + challenge.name.ru);
    names.add(name);
  }
});
