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
  if (!state) return null;
  tracker.lastState = state.name;

  if (state.name === START_STATE) {
    tracker.inMatch = true;
    tracker.startedAt = at;
    tracker.endedAt = null;
    return { type: 'start', state: state.name, at };
  }

  if (!tracker.inMatch) return null;

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
