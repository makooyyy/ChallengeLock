// Shared rendering helpers. Everything here is stateless: views own their data,
// this module owns markup and formatting.
import { icon } from './icons.js';
import { t } from './i18n.js';

export const $ = (s, r = document) => r.querySelector(s),
  $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  );

export const DIFF_COLOR = { easy: '#8c82a9', mid: '#7662ad', hard: '#9d62c9', insane: '#d55479' };
export const ROMAN = ['I', 'II', 'III'];
export const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

export const mmss = (ms) => {
  const s = Math.floor(ms / 1000);
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
};

let toastTimer;
export function toast(message) {
  const element = $('#toast');
  element.textContent = message;
  element.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove('on'), 1800);
}

export const dia = (h) =>
  `<div class="dia" style="--c:${h.color}"><span>${esc(h.name[0])}</span>${h.icon ? `<img class="pic" src="${esc(h.icon)}" alt="" loading="lazy">` : ''}</div>`;

export const seg = (arr, cur, attr) =>
  `<div class="seg" role="group" aria-label="${t(attr === 'diff' ? 'difficulty' : 'heroFilter')}">${arr.map(([v, l]) => `<button data-${attr}="${v}" class="${v == cur ? 'on' : ''}" aria-pressed="${v == cur}">${l}</button>`).join('')}</div>`;

export const difficultyBadge = (x) =>
  `<span class="difficulty-badge" style="--difficulty-color:${DIFF_COLOR[x.diff]}">${icon('spark', 11)} ${t('diff.' + x.diff)}</span>`;

export const intro = (title, description, action = '') =>
  `<div class="page-intro"><div><div class="eyebrow">DEADLOCK / CHALLENGELOCK</div><h1>${title}</h1><p>${description}</p></div>${action}</div>`;
