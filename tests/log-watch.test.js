import os from 'node:os';
import path from 'node:path';
// The match detector reads the game's console log, so it is driven by a real excerpt.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  parseState,
  createLogReader,
  createTracker,
  trackLine,
  splitLines,
  nextOffset,
} from '../desktop/log-watch.js';

const fixture = fs.readFileSync(
  new URL('./fixtures/deadlock-log-sample.txt', import.meta.url),
  'utf8',
);

test('state transitions are parsed from the real log format', () => {
  assert.deepEqual(parseState('11/19 20:51:26 ChangeGameState: GameInProgress (7)'), {
    name: 'GameInProgress',
    code: 7,
  });
  assert.deepEqual(parseState('11/19 20:51:26 ChangeGameState: PreGameWait (6)'), {
    name: 'PreGameWait',
    code: 6,
  });
  assert.equal(parseState('11/19 20:51:20 [Server] SV:  Game started'), null);
  assert.equal(parseState(''), null);
  assert.equal(parseState(null), null);
});

test('a match is a window between GameInProgress and the post-game state', () => {
  const tracker = createTracker();
  assert.equal(
    trackLine(tracker, 'ChangeGameState: HeroSelection (3)'),
    null,
    'pre-game is ignored',
  );
  assert.equal(trackLine(tracker, 'ChangeGameState: MatchIntro (4)'), null);

  const start = trackLine(tracker, 'ChangeGameState: GameInProgress (7)', 1000);
  assert.deepEqual(start, { type: 'start', state: 'GameInProgress', at: 1000 });
  assert.equal(tracker.inMatch, true);

  assert.equal(trackLine(tracker, '11/19 20:51:20 [Server] SV:  Game started', 1500), null);

  const end = trackLine(tracker, 'ChangeGameState: PostGame (8)', 600000);
  assert.equal(end.type, 'end');
  assert.equal(end.state, 'PostGame');
  assert.equal(end.durationMs, 599000);
  assert.equal(tracker.inMatch, false);
});

test('every known spelling of the final state closes the match', () => {
  for (const name of ['PostGame', 'GameOver', 'game_over', 'MatchEnd', 'EndGame']) {
    const tracker = createTracker();
    trackLine(tracker, 'ChangeGameState: GameInProgress (7)', 1);
    const event = trackLine(tracker, 'ChangeGameState: ' + name + ' (8)', 2);
    assert.equal(event?.type, 'end', name + ' must close the match');
  }
});

test('an unknown transition inside a match is reported, not swallowed', () => {
  const tracker = createTracker();
  trackLine(tracker, 'ChangeGameState: GameInProgress (7)', 1);
  assert.deepEqual(trackLine(tracker, 'ChangeGameState: Paused (9)', 2), {
    type: 'unknown',
    state: 'Paused',
    at: 2,
  });
  assert.equal(tracker.inMatch, true, 'the match is still running');
});

test('a final state without a start is ignored', () => {
  const tracker = createTracker();
  assert.equal(trackLine(tracker, 'ChangeGameState: PostGame (8)', 5), null);
});

test('the whole real excerpt yields exactly one match start', () => {
  const tracker = createTracker();
  const events = splitLines(fixture)
    .lines.map((line) => trackLine(tracker, line))
    .filter(Boolean);
  assert.deepEqual(
    events.map((event) => event.type),
    ['start'],
  );
});

test('chunks split across reads keep the incomplete tail', () => {
  const first = splitLines('11/19 20:51:2');
  assert.deepEqual(first.lines, []);
  assert.equal(first.carry, '11/19 20:51:2');

  const second = splitLines('6 ChangeGameState: GameInProgress (7)\r\nnext', first.carry);
  assert.deepEqual(second.lines, ['11/19 20:51:26 ChangeGameState: GameInProgress (7)']);
  assert.equal(second.carry, 'next');
});

test('a restarted log resets the offset instead of skipping content', () => {
  assert.equal(nextOffset(500, 100), 100);
  assert.equal(nextOffset(500, 500), 500);
  assert.equal(nextOffset(10, 900), 0, 'the game truncated the log on launch');
});

test('tail reader ignores history, preserves UTF-8 and resets on truncation', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cl-reader-')),
    file = path.join(dir, 'console.log');
  try {
    fs.writeFileSync(file, 'old match\n');
    const poll = createLogReader(file);
    assert.deepEqual(poll().lines, []);
    const bytes = Buffer.from('Герой\nChangeGameState: GameInProgress (7)\n');
    fs.appendFileSync(file, bytes.subarray(0, 1));
    assert.deepEqual(poll().lines, []);
    fs.appendFileSync(file, bytes.subarray(1));
    assert.deepEqual(poll().lines, ['Герой', 'ChangeGameState: GameInProgress (7)']);
    fs.writeFileSync(file, 'fresh\n');
    assert.deepEqual(poll(), { lines: ['fresh'], reset: true });
    fs.appendFileSync(file, 'ChangeGameState: PostGame (8)\n');
    assert.deepEqual(poll().lines, ['ChangeGameState: PostGame (8)']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
