// Single mutable state object, persisted via storage.js.
import { load, save } from './storage.js';
import { CATS } from './validation.js';
export const S = load({
  lang: 'ru',
  diff: 'mid',
  cats: CATS,
  team: false,
  excluded: [],
  only: [],
  sound: true,
  history: [],
  stats: { done: 0, fail: 0 },
  favs: [],
  friend: { same: true, player: 1 },
});
export const RT = {
  tab: 'roulette',
  data: null,
  cur: null,
  locks: [false, false, false, false],
  rerolls: 2,
  maxRerolls: 2,
  seed: null,
  r: 0,
  timer: { ms: 0, run: false, t0: 0 },
  finished: false,
  busy: false,
  build: null,
  ban: null,
  heroSearch: '',
  pendingHash: null,
};
export const persist = () => save(S);
export const ALL_CATS = CATS;
