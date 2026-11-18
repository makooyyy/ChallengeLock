import { options, validRecord, DIFFICULTIES } from './validation.js';
export function parseHash(hash = location.hash) {
  if (!hash || hash === '#') return null;
  try {
    if (hash.length > 16000) throw new Error('Link too long');
    const p = new URLSearchParams(hash.slice(1)),
      seed = p.get('seed');
    if (!seed) return null;
    const d = p.get('d') || 'mid',
      r = Number(p.get('r') || 0),
      player = Number(p.get('p') || 0);
    if (
      seed.length > 256 ||
      !DIFFICULTIES.includes(d) ||
      !Number.isInteger(r) ||
      r < 0 ||
      r > 1000000 ||
      !Number.isInteger(player) ||
      player < 0 ||
      player > 9
    )
      throw new Error('Invalid parameters');
    if (p.has('v') && p.get('v') !== '2') throw new Error('Unsupported link');
    let result = null;
    if (p.get('v') === '2') {
      const x = JSON.parse(p.get('x'));
      result = { ...x, seed, diff: d, r, player, opts: options({ ...x?.opts, diff: d }) };
      if (!validRecord(result)) throw new Error('Invalid result');
    }
    return { seed, d, r, p: player, result };
  } catch {
    return { error: true };
  }
}
export function hashFor(x) {
  const p = new URLSearchParams({
    v: '2',
    seed: x.seed,
    d: x.diff,
    r: String(x.r),
    p: String(x.player || 0),
    x: JSON.stringify({ hero: x.hero, conds: x.conds, opts: options({ ...x.opts, diff: x.diff }) }),
  });
  return '#' + p.toString();
}
export const linkFor = (x) =>
  location.origin + location.pathname + (location.search || '') + hashFor(x);
export const setHash = (x) => {
  try {
    history.replaceState(null, '', hashFor(x));
  } catch {}
};
export async function copy(s) {
  try {
    await navigator.clipboard.writeText(s);
    return true;
  } catch (e) {
    const a = document.createElement('textarea');
    a.value = s;
    document.body.append(a);
    a.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (_) {}
    a.remove();
    return ok;
  }
}
export function drawCard(cv, { hero, lines, label, color, foot }) {
  cv.width = 1080;
  cv.height = 600;
  const g = cv.getContext('2d');
  g.fillStyle = '#070a12';
  g.fillRect(0, 0, 1080, 600);
  const gr = g.createRadialGradient(850, 0, 0, 850, 0, 600);
  gr.addColorStop(0, 'rgba(124,92,255,.3)');
  gr.addColorStop(1, 'transparent');
  g.fillStyle = gr;
  g.fillRect(0, 0, 1080, 600);
  g.strokeStyle = color;
  g.lineWidth = 3;
  g.strokeRect(24, 24, 1032, 552);
  g.fillStyle = color;
  g.font = '700 28px Oswald,sans-serif';
  g.fillText(label.toUpperCase(), 56, 80);
  g.fillStyle = '#e9edf7';
  g.font = '700 84px Oswald,sans-serif';
  g.fillText(hero.toUpperCase(), 56, 170, 968);
  g.font = '600 36px Manrope,sans-serif';
  lines.slice(0, 3).forEach((l, i) => {
    g.fillStyle = '#e9edf7';
    g.fillText('◆ ' + l, 56, 250 + i * 64, 968);
  });
  g.fillStyle = '#98a3bd';
  g.font = '600 18px monospace';
  g.fillText(foot, 56, 556, 968);
}
