import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, selectMatch, MatchMonitor, INTERVAL } from '../desktop/match-monitor.js';
import { createTracker, trackLine } from '../desktop/log-watch.js';

const contract = {
  key: 'A',
  heroId: 1,
  gameMode: 'normal',
  conditions: [{ id: 'normal_first_assist', name: 'Assist' }],
};
const match = {
  account_id: 10,
  match_id: 123,
  hero_id: 1,
  game_mode: 1,
  match_mode: 1,
  start_time: 1000,
  match_duration_s: 600,
  player_kills: 2,
  player_assists: 3,
  player_deaths: 0,
  player_match_outcome: 2,
  brawl_score_team0: null,
  brawl_score_team1: null,
};
const session = { contract, selectedAt: 900000, startedAt: 1020000, endedAt: 1600000 };

test('only complete supported evidence closes a challenge; a loss can satisfy it', () => {
  assert.equal(evaluate(contract, match).outcome, 'done');
  assert.equal(evaluate(contract, { ...match, player_assists: 0 }).outcome, 'fail');
  assert.equal(evaluate(contract, { ...match, player_assists: null }).outcome, null);
  assert.equal(
    evaluate({ ...contract, conditions: [{ id: 'go_souls' }, { id: 'gp_nojump' }] }, match).outcome,
    null,
  );
  assert.equal(
    evaluate({ ...contract, conditions: [{ id: 'go_zero_death' }, { id: 'gp_nojump' }] }, match)
      .outcome,
    null,
  );
  assert.equal(
    evaluate(
      { ...contract, conditions: [{ id: 'go_zero_death' }, { id: 'gp_nojump' }] },
      { ...match, player_deaths: 1 },
    ).outcome,
    'fail',
  );
});

test('history matching rejects stale, unscored, future, wrong-player/hero and wrong-mode data', () => {
  assert.equal(selectMatch([match], session, 10, 1700000), match);
  for (const patch of [
    { account_id: 11 },
    { hero_id: 2 },
    { start_time: 800 },
    { start_time: 1700 },
    { player_match_outcome: 0 },
    { match_duration_s: 0 },
    { game_mode: 4, match_mode: 1 },
    { match_mode: 2 },
    { match_mode: 4 },
  ])
    assert.equal(
      selectMatch([{ ...match, ...patch }], session, 10, 1700000),
      null,
      JSON.stringify(patch),
    );
  assert.equal(selectMatch([match, { ...match, match_id: 124 }], session, 10, 1700000), null);
});

test('history never skips an earlier wrong-hero match to credit a later one', () => {
  assert.equal(
    selectMatch(
      [
        { ...match, hero_id: 2 },
        { ...match, match_id: 124, start_time: 2000 },
      ],
      { ...session, startedAt: null, endedAt: null },
      10,
      3000000,
    ),
    null,
  );
});

test('polling is bounded and results are emitted once for the selected contract', async () => {
  let now = 900000,
    calls = 0;
  const updates = [];
  const monitor = new MatchMonitor({
    now: () => now,
    notify: (s) => updates.push(s),
    fetchHistory: async () => {
      calls++;
      return [match];
    },
  });
  monitor.configure(true, 10);
  monitor.contract(contract);
  await monitor.poll();
  assert.equal(monitor.state.api, 'waiting');
  now = 1700000;
  await monitor.poll();
  assert.equal(monitor.state.outcome, 'done');
  assert.equal(monitor.state.matchId, 123);
  now += INTERVAL;
  await monitor.poll();
  assert.equal(calls, 2);
  assert.equal(updates.filter((x) => x.api === 'verified').length, 1);
});

test('late API replies cannot finish a replacement contract or a disabled integration', async () => {
  for (const replace of [true, false]) {
    let resolve;
    let now = 900000;
    const monitor = new MatchMonitor({
      now: () => now,
      notify: () => {},
      fetchHistory: () => new Promise((r) => (resolve = r)),
    });
    monitor.configure(true, 10);
    monitor.contract(contract);
    now = 1700000;
    const request = monitor.poll();
    if (replace) monitor.contract({ ...contract, key: 'B' });
    else monitor.configure(false, 10);
    resolve([match]);
    await request;
    assert.notEqual(monitor.state.api, 'verified');
    assert.equal(monitor.state.outcome, null);
  }
});

test('API failure remains unknown, throttles retries and preserves manual completion', async () => {
  let calls = 0;
  const monitor = new MatchMonitor({
    now: () => 900000,
    notify: () => {},
    fetchHistory: async () => {
      calls++;
      throw Error('offline');
    },
  });
  monitor.configure(true, 10);
  monitor.contract(contract);
  await monitor.poll();
  await monitor.poll();
  assert.equal(calls, 1);
  assert.equal(monitor.state.api, 'unavailable');
  assert.equal(monitor.state.outcome, null);
});

test('ranked conditions require the matching official queue enum', async () => {
  let now = 900000;
  const monitor = new MatchMonitor({
    now: () => now,
    notify: () => {},
    fetchHistory: async () => [{ ...match, match_mode: 4 }],
  });
  monitor.configure(true, 10);
  monitor.contract({ ...contract, gameMode: 'ranked' });
  now = 1700000;
  await monitor.poll();
  assert.equal(monitor.state.outcome, 'done');
});

test('disconnect and shutdown stop a match without declaring a defeat', () => {
  for (const line of [
    '[Client] Disconnecting from server: NETWORK_DISCONNECT_EXITING',
    'ChangeGameState: Shutdown (9)',
  ]) {
    const tracker = createTracker();
    trackLine(tracker, 'ChangeGameState: GameInProgress (7)', 100);
    assert.equal(trackLine(tracker, line, 200).type, 'interrupted');
    assert.equal(tracker.inMatch, false);
    assert.equal(trackLine(tracker, 'ChangeGameState: PostGame (8)', 300), null);
  }
});

test('reviewing a different eligible game replaces all checks and rejects unrelated games', async () => {
  const later = { ...match, match_id: 456, start_time: 2000, player_assists: 0 };
  const monitor = new MatchMonitor({
    now: () => 3000000,
    notify: () => {},
    fetchHistory: async () => [match, later, { ...later, match_id: 999, hero_id: 2 }],
  });
  monitor.configure(true, 10);
  monitor.contract({ ...contract, selectedAt: 900000 });
  await monitor.poll();
  assert.deepEqual(
    monitor.state.candidates.map((m) => m.id),
    [123, 456],
  );
  assert.equal(monitor.choose('other', 456), false);
  assert.equal(monitor.choose('A', 999), false);
  assert.equal(monitor.choose('A', 456), true);
  assert.equal(monitor.state.matchTime, 2000000);
  assert.equal(monitor.state.outcome, 'fail');
});

for (const assists of [0, 3]) {
  test(`empty refresh never emits stale evidence (${assists} assists)`, async () => {
    let now = 1700000;
    let history = [{ ...match, player_assists: assists }];
    const updates = [];
    const m = new MatchMonitor({
      notify: (s) => updates.push(s),
      now: () => now,
      fetchHistory: async () => history,
    });
    m.configure(true, 10);
    m.contract({ ...contract, selectedAt: 900000 });
    await m.poll();
    assert.equal(m.state.outcome, assists ? 'done' : 'fail');
    updates.length = 0;
    now += INTERVAL;
    history = [];
    await m.poll(true);
    assert.ok(updates.every((s) => !s.outcome || s.candidates.some((c) => c.id === s.matchId)));
    assert.equal(m.state.api, 'waiting');
    assert.equal(m.state.outcome, null);
    assert.deepEqual(m.state.candidates, []);
  });
}

test('renderer echoes cannot re-arm a disconnected selection', async () => {
  const c = { ...contract, selectedAt: 900000 };
  const m = new MatchMonitor({
    notify: (s) => {
      if (s.phase === 'interrupted') m.contract({ ...c });
    },
    now: () => 1700000,
    fetchHistory: async () => assert.fail('retired selection polled'),
  });
  m.configure(true, 10);
  m.contract(c);
  m.local({ type: 'start', at: 1000000 }, c);
  m.local({ type: 'interrupted', durationMs: 123 }, c);
  m.contract({ ...c });
  assert.equal(m.state.phase, 'interrupted');
  assert.equal(m.session, null);
  await m.poll(true);
  m.contract({ ...c, selectedAt: 1700000 });
  assert.equal(m.state.phase, 'waiting');
});

test('the selected earliest match stays reviewable among 51 newest-first records', async () => {
  const history = Array.from({ length: 51 }, (_, i) => ({
    ...match,
    match_id: 123 + i,
    start_time: 1000 + i,
  })).reverse();
  const m = new MatchMonitor({
    notify: () => {},
    now: () => 1700000,
    fetchHistory: async () => history,
  });
  m.configure(true, 10);
  m.contract({ ...contract, selectedAt: 900000 });
  await m.poll();
  assert.equal(m.state.api, 'verified');
  assert.equal(m.state.matchId, 123);
  assert.equal(m.state.candidates.length, 50);
  assert.ok(m.state.candidates.some((c) => c.id === 123));
});

test('poll and manual refresh rediscover Steam login, replacement and logout without leaking results', async () => {
  let account = null,
    now = 1700000;
  const calls = [];
  const m = new MatchMonitor({
    notify: () => {},
    now: () => now,
    refreshAccount: async () => m.configure(true, account),
    fetchHistory: async (id) => {
      calls.push(id);
      return [{ ...match, account_id: id }];
    },
  });
  const c = { ...contract, selectedAt: 900000 };
  m.configure(true, null);
  m.contract(c);
  await m.poll();
  assert.equal(m.state.api, 'no-account');
  account = 10;
  await m.poll();
  assert.equal(m.state.matchId, 123);
  account = 11;
  await m.poll(true);
  assert.equal(m.accountId, 11);
  assert.equal(m.state.matchId, null);
  assert.equal(m.state.outcome, null);
  assert.deepEqual(m.state.candidates, []);
  m.contract({ ...c });
  assert.equal(m.session, null);
  now += INTERVAL;
  m.contract({ ...c, key: 'B' });
  await m.poll();
  assert.deepEqual(calls, [10, 11]);
  account = null;
  await m.poll();
  assert.equal(m.state.api, 'no-account');
  assert.equal(m.state.matchId, null);
});
