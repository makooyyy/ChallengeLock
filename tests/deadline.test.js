import test from 'node:test';
import assert from 'node:assert/strict';
import { CONTRACT_DAY, expireContracts } from '../js/roulette.js';

test('a pending challenge expires exactly once at its deadline, including its favorite copy', () => {
  const record = { seed: 'a', r: 0, hero: 'rem', conds: [], ts: 1000 };
  const completed = { ...record, seed: 'b', outcome: 'done' };
  const state = { history: [record, completed], favs: [{ ...record }], stats: { fail: 0 } };
  assert.equal(expireContracts(state, 999 + CONTRACT_DAY).size, 0);
  assert.equal(expireContracts(state, 1000 + CONTRACT_DAY).size, 1);
  assert.equal(state.history[0].outcome, 'fail');
  assert.equal(state.favs[0].outcome, 'fail');
  assert.equal(completed.outcome, 'done');
  assert.equal(expireContracts(state, 2000 + CONTRACT_DAY).size, 0);
  assert.equal(state.stats.fail, 1);
});
