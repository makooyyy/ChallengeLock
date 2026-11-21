// Match detection from Deadlock's console.log. The game prints state transitions
// ("11/19 20:51:26 ChangeGameState: GameInProgress (7)"), so a match is a window
// between GameInProgress and a post-game state. Pure functions: no Electron, no I/O.
const STATE_RE = /ChangeGameState:\s*([A-Za-z_]+)\s*\((\d+)\)/;
// The exact name of the final state is not documented; all known spellings match.
const END_STATE = /postgame|gameover|game_over|matchend|match_end|endgame|shutdown/i;
const START_STATE = 'GameInProgress';

function parseState(line) {
  const match = STATE_RE.exec(String(line || ''));
  if (!match) return null;
  return { name: match[1], code: Number(match[2]) };
}

function createTracker() {
  return { inMatch: false, startedAt: null, endedAt: null, lastState: null };
}

// Feed one log line; returns an event when it matters.
function trackLine(tracker, line, at = Date.now()) {
  const state = parseState(line);
  if (!state) {
    if (
      tracker.inMatch &&
      /\[Client\] Disconnecting from server:|SIGNONSTATE_FULL -> SIGNONSTATE_NONE/.test(
        String(line),
      )
    ) {
      tracker.inMatch = false;
      tracker.endedAt = at;
      return { type: 'interrupted', state: 'Disconnected', at, durationMs: at - tracker.startedAt };
    }
    return null;
  }
  tracker.lastState = state.name;

  if (state.name === START_STATE) {
    if (tracker.inMatch) return null;
    tracker.inMatch = true;
    tracker.startedAt = at;
    tracker.endedAt = null;
    return { type: 'start', state: state.name, at };
  }

  if (!tracker.inMatch) return null;

  if (/shutdown/i.test(state.name)) {
    tracker.inMatch = false;
    tracker.endedAt = at;
    return { type: 'interrupted', state: state.name, at, durationMs: at - tracker.startedAt };
  }

  if (END_STATE.test(state.name)) {
    tracker.inMatch = false;
    tracker.endedAt = at;
    return { type: 'end', state: state.name, at, durationMs: at - tracker.startedAt };
  }

  // A transition we do not recognise inside a match: report it so the pattern can
  // be extended instead of silently missing the end.
  return { type: 'unknown', state: state.name, at };
}

// Splits a chunk read from the middle of a file into complete lines.
function splitLines(text, carry = '') {
  const combined = carry + String(text || '');
  const parts = combined.split(/\r?\n/);
  return { lines: parts.slice(0, -1), carry: parts[parts.length - 1] };
}

// Watches the file through an offset. A shrunk file means the game restarted the log.
function nextOffset(size, offset) {
  return size < offset ? 0 : offset;
}

module.exports = {
  parseState,
  createTracker,
  trackLine,
  splitLines,
  nextOffset,
  START_STATE,
  END_STATE,
};

// Reads only new bytes, preserves split UTF-8/lines, and never replays old matches.
function createLogReader(file) {
  const fs = require('fs');
  const { StringDecoder } = require('string_decoder');
  let offset = 0,
    identity = null,
    decoder = new StringDecoder('utf8'),
    carry = '',
    skipPartial = false;
  return function poll() {
    const fd = fs.openSync(file, 'r');
    try {
      const stat = fs.fstatSync(fd),
        id = stat.dev + ':' + stat.ino;
      const reset = identity !== null && (id !== identity || stat.size < offset);
      if (identity === null) {
        identity = id;
        offset = stat.size;
        carry = '';
        decoder = new StringDecoder('utf8');
        const last = Buffer.alloc(1);
        skipPartial = offset > 0 && fs.readSync(fd, last, 0, 1, offset - 1) === 1 && last[0] !== 10;
        return { lines: [], reset: true };
      }
      if (reset) {
        identity = id;
        offset = 0;
        carry = '';
        decoder = new StringDecoder('utf8');
        skipPartial = false;
      }
      const buffer = Buffer.alloc(Math.min(65536, Math.max(0, stat.size - offset)));
      const read = fs.readSync(fd, buffer, 0, buffer.length, offset);
      offset += read;
      let chunk = decoder.write(buffer.subarray(0, read));
      if (skipPartial) {
        const end = chunk.indexOf('\n');
        if (end < 0) return { lines: [], reset: false };
        chunk = chunk.slice(end + 1);
        skipPartial = false;
      }
      const split = splitLines(chunk, carry);
      carry = split.carry;
      return { lines: split.lines, reset };
    } finally {
      fs.closeSync(fd);
    }
  };
}
module.exports.createLogReader = createLogReader;

// Recovery is display-only and only considers timestamped lines from this game
// process. An old log touched during startup must not resurrect yesterday's match.
function recoverCurrentMatch(lines, processStartedAt, now = Date.now()) {
  const tracker = createTracker();
  for (const line of lines) {
    const stamp = /^(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(line);
    if (!stamp) continue;
    const date = new Date(now);
    date.setMonth(Number(stamp[1]) - 1, Number(stamp[2]));
    date.setHours(Number(stamp[3]), Number(stamp[4]), Number(stamp[5]), 0);
    if (date.getTime() > now + 86400000) date.setFullYear(date.getFullYear() - 1);
    const at = date.getTime();
    if (at >= processStartedAt - 2000 && at <= now + 2000) trackLine(tracker, line, at);
  }
  return tracker;
}
module.exports.recoverCurrentMatch = recoverCurrentMatch;
