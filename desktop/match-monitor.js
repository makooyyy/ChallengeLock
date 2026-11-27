// Only public, final per-player statistics can prove these conditions. Missing
// fields and unsupported actions remain unknown; a match win is not a challenge win.
const RULES = {
  go_assists: ['player_assists', 10],
  ranked_assist: ['player_assists', 5],
  normal_first_assist: ['player_assists', 1],
  ranked_denies: ['denies', 10],
  ranked_impact: ['participation', 20],
  street_participate: ['participation', 1],
  go_zero_death: ['player_deaths', 0, 'equal'],
};
const INTERVAL = 6 * 60 * 1000;
const validCount = (x) => Number.isSafeInteger(x) && x >= 0;

function evaluate(contract, match) {
  const stats = { ...match };
  if (validCount(match.player_kills) && validCount(match.player_assists))
    stats.participation = match.player_kills + match.player_assists;
  const checks = (contract.conditions || []).map((condition) => {
    const rule = RULES[condition.id];
    if (!rule || !validCount(stats[rule[0]]))
      return { id: condition.id, name: condition.name, status: 'manual' };
    const [field, target, operator] = rule;
    const value = stats[field];
    const pass = operator === 'equal' ? value === target : value >= target;
    return {
      id: condition.id,
      name: condition.name,
      status: pass ? 'pass' : 'fail',
      value,
      target,
    };
  });
  const outcome = checks.some((c) => c.status === 'fail')
    ? 'fail'
    : checks.length && checks.every((c) => c.status === 'pass')
      ? 'done'
      : null;
  return { checks, outcome };
}

// Match the first *new* scored game, not the newest arbitrary game in history.
// Ambiguous overlaps, old games, wrong heroes and unscored games never auto-close.
function selectMatch(history, session, accountId, now) {
  const candidates = history
    .filter((m) => {
      const start = m.start_time * 1000,
        end = start + m.match_duration_s * 1000;
      return (
        m.account_id === accountId &&
        validCount(m.match_id) &&
        m.match_id > 0 &&
        Number.isFinite(start) &&
        validCount(m.match_duration_s) &&
        m.match_duration_s > 0 &&
        start >= session.selectedAt &&
        end <= now + 5000 &&
        (!session.startedAt || Math.abs(start - session.startedAt) <= 300000) &&
        (!session.endedAt || Math.abs(end - session.endedAt) <= 180000)
      );
    })
    .sort((a, b) => a.start_time - b.start_time);
  const match = candidates[0];
  if (!match || (candidates[1] && candidates[1].start_time === match.start_time)) return null;
  if (match.hero_id !== session.contract.heroId || ![1, 2].includes(match.player_match_outcome))
    return null;
  // Valve enum definitions: SteamDatabase/Protobufs, deadlock/citadel_gcmessages_common.proto.
  // Unknown modes, bot matches and private lobbies are never used for auto-credit.
  const modes = { normal: [1, 1], ranked: [1, 4], street: [4, 1] };
  const expected = modes[session.contract.gameMode];
  if (!expected || match.game_mode !== expected[0] || match.match_mode !== expected[1]) return null;
  return match;
}

const candidatesFor = (session) =>
  session.matches.map((m) => ({ id: m.match_id, time: m.start_time * 1000, hero: m.hero_id }));
const emptyReview = () => ({
  checks: [],
  candidates: [],
  outcome: null,
  matchId: null,
  matchTime: null,
  matchHero: null,
  stats: null,
});

class MatchMonitor {
  constructor({ fetchHistory, notify, now = Date.now, refreshAccount }) {
    this.refreshAccount = refreshAccount;
    this.fetchHistory = fetchHistory;
    this.notify = notify;
    this.now = now;
    this.enabled = false;
    this.accountId = null;
    this.nextRequestAt = 0;
    this.busy = false;
    this.session = null;
    this.state = { phase: 'idle', api: 'disabled', key: null, checks: [] };
  }
  publish(patch) {
    Object.assign(this.state, patch);
    this.notify({
      ...this.state,
      enabled: this.enabled,
      accountId: this.accountId,
      nextRequestAt: this.nextRequestAt,
    });
  }
  configure(enabled, accountId) {
    const id = validCount(accountId) && accountId > 0 ? accountId : null;
    if (this.configured && this.enabled === (enabled === true) && this.accountId === id) return;
    this.configured = true;
    const changedUser = this.accountId !== null && this.accountId !== id;
    if (changedUser) {
      if (this.session) this.retired = this.session.contract;
      this.session = null;
    }
    this.enabled = enabled === true;
    this.accountId = id;
    this.publish({
      ...(changedUser
        ? { ...emptyReview(), phase: 'idle', key: null, startedAt: null, durationMs: null }
        : {}),
      api: !this.enabled ? 'disabled' : this.accountId ? 'ready' : 'no-account',
    });
  }
  contract(contract) {
    if (!contract || contract.outcome) {
      this.session = null;
      return;
    }
    if (this.retired?.key === contract.key && this.retired.selectedAt === contract.selectedAt)
      return;
    if (
      this.session?.contract.key === contract.key &&
      this.session.contract.selectedAt === contract.selectedAt
    ) {
      this.session.contract = contract;
      return;
    }
    this.session = {
      contract,
      selectedAt: Number.isFinite(contract.selectedAt)
        ? Math.max(this.now() - 86400000, Math.min(contract.selectedAt, this.now()))
        : this.now(),
      startedAt: null,
      endedAt: null,
    };
    this.publish({
      key: this.state.phase === 'playing' ? null : contract.key,
      phase: this.state.phase === 'playing' ? 'playing' : 'waiting',
      ...emptyReview(),
      durationMs: null,
    });
  }
  local(event, contract) {
    const session = this.session;
    const matches =
      session &&
      contract?.key === session.contract.key &&
      contract.selectedAt === session.contract.selectedAt;
    if (event.type === 'start') {
      if (matches) session.startedAt = event.at;
      this.publish({
        phase: 'playing',
        key: matches ? contract.key : null,
        startedAt: event.at,
        durationMs: null,
      });
    } else if (event.type === 'end') {
      if (matches) session.endedAt = event.at;
      this.publish({
        phase: 'ended',
        key: matches ? contract.key : null,
        durationMs: event.durationMs,
      });
      if (matches) void this.poll();
    } else if (event.type === 'interrupted') {
      // Disconnect is not proof of defeat or a completed match. Do not reuse this
      // selection after a reconnect; the player can still finish it manually.
      if (matches) {
        this.retired = session.contract;
        this.session = null;
      }
      this.publish({
        ...emptyReview(),
        api: !this.enabled ? 'disabled' : this.accountId ? 'ready' : 'no-account',
        phase: 'interrupted',
        key: contract?.key || null,
        durationMs: event.durationMs,
      });
    }
  }
  choose(key, id) {
    const session = this.session;
    const match = session?.matches?.find((m) => m.match_id === id);
    if (!this.enabled || !match || key !== session.contract.key) return false;
    const result = evaluate(session.contract, match);
    session.checked = true;
    this.publish({
      api: 'verified',
      phase: 'ended',
      key,
      candidates: candidatesFor(session),
      matchId: id,
      matchTime: match.start_time * 1000,
      matchHero: match.hero_id,
      checks: result.checks,
      outcome: result.outcome,
      durationMs: match.match_duration_s * 1000,
      stats: {
        kills: match.player_kills,
        deaths: match.player_deaths,
        assists: match.player_assists,
      },
    });
    return true;
  }
  async poll(refresh = false) {
    if (this.enabled && this.refreshAccount) await this.refreshAccount();
    const session = this.session;
    if (
      !this.enabled ||
      !this.accountId ||
      !session ||
      (session.checked && !refresh) ||
      this.busy ||
      this.now() < this.nextRequestAt
    )
      return;
    const accountId = this.accountId;
    this.busy = true;
    this.nextRequestAt = this.now() + INTERVAL;
    this.publish({ api: 'loading' });
    try {
      const history = await this.fetchHistory(accountId);
      if (!Array.isArray(history)) throw new Error('Invalid match history');
      if (this.session !== session || !this.enabled || accountId !== this.accountId) return;
      const match = selectMatch(history, session, this.accountId, this.now());
      const window = { ...session, startedAt: null, endedAt: null };
      const eligible = history.filter((m) => selectMatch([m], window, accountId, this.now()));
      const selected = eligible.find((m) => m.match_id === this.state.matchId) || match;
      session.matches = eligible.slice(0, 50);
      // Keep the evidence we intend to review reachable even for long, newest-first histories.
      if (selected && !session.matches.includes(selected)) session.matches[49] = selected;
      if (selected) this.choose(session.contract.key, selected.match_id);
      else {
        session.checked = false;
        this.publish({
          api: 'waiting',
          ...emptyReview(),
          candidates: candidatesFor(session),
        });
      }
    } catch {
      if (this.session === session) this.publish({ api: 'unavailable' });
    } finally {
      this.busy = false;
    }
  }
}

async function fetchHistory(accountId) {
  const response = await fetch(
    `https://api.deadlock-api.com/v1/players/${accountId}/match-history`,
    {
      signal: AbortSignal.timeout(12000),
      headers: { Accept: 'application/json' },
    },
  );
  if (!response.ok) throw new Error('History unavailable');
  return response.json();
}
module.exports = { RULES, INTERVAL, evaluate, selectMatch, MatchMonitor, fetchHistory };
