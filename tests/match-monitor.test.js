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
