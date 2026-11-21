import { icon } from './icons.js';
import { t, loc } from './i18n.js';
const esc = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  );
let dialog, sealObserver, returnFocus;
export function closeCelebration() {
  if (dialog?.open) dialog.close();
}
export function celebrationOpen() {
  return !!dialog?.open;
}
export function showCelebration(result, hero, challenges) {
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.id = 'completion-dialog';
    dialog.className = 'completion-dialog';
    dialog.setAttribute('aria-labelledby', 'completion-title');
    dialog.setAttribute('aria-describedby', 'completion-subtitle');
    document.body.append(dialog);
    dialog.addEventListener('click', (e) => {
      if (e.target.closest('[data-close-completion]')) dialog.close();
      else if (e.target === dialog) {
        const r = dialog.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)
          dialog.close();
      }
    });
    dialog.addEventListener('close', () => {
      sealObserver?.disconnect();
      document.body.classList.remove('completion-open');
      const target =
        returnFocus?.isConnected && returnFocus.getClientRects().length
          ? returnFocus
          : document.getElementById('spin');
      target?.focus({ preventScroll: true });
    });
  }
  if (dialog.open) dialog.close();
  sealObserver?.disconnect();
  dialog.classList.remove('stamp-visible');
  const success = result.outcome === 'done';
  dialog.dataset.outcome = result.outcome;
  dialog.innerHTML = `<article class="completion-card ${success ? 'success' : 'failure'}">
    <button class="completion-close" data-close-completion aria-label="${t('closeCard')}" autofocus>${icon('close', 20)}</button>
    <div class="completion-paper-head"><span>CHALLENGELOCK</span><span>${t('contractRecord')}</span></div>
    <div class="completion-heading"><div class="eyebrow">${t(success ? 'successKicker' : 'failureKicker')}</div><h2 id="completion-title">${t(success ? 'successTitle' : 'failureTitle')}</h2><p id="completion-subtitle">${t(success ? 'successSubtitle' : 'failureSubtitle')}</p></div>
    <div class="completion-hero"><div class="completion-portrait"><span>${esc(hero.name[0])}</span>${hero.icon ? `<img class="pic" src="${esc(hero.icon)}" alt="">` : ''}</div><div><span class="eyebrow">${t('yourHero')}</span><h3>${esc(hero.name)}</h3><small>${t('gameMode.' + (result.opts?.gameMode || 'normal'))} · ${t('diff.' + result.diff)} · ${result.conds.length} ${t('conditionsCount')}</small></div></div>
    <div class="completion-rules-title eyebrow">${t('challengeRules')}</div>
    <ol class="completion-rules">${result.conds
      .map((id, i) => {
        const c = challenges.find((c) => c.id === id);
        return `<li style="--rule-index:${i}"><span class="rule-index">${String(i + 1).padStart(2, '0')}</span><div><b>${esc(loc(c.name))}</b><p>${esc(loc(c.desc))}</p></div></li>`;
      })
      .join('')}</ol>
    <div class="completion-seal-row"><div class="completion-summary"><span class="eyebrow">${t('resultRecorded')}</span><p>${t(success ? 'successSaved' : 'failureSaved')}</p><span class="completion-seed">SEED / ${esc(result.seed)}</span></div>
    <div class="seal-space"><div class="ink-burst" aria-hidden="true"></div><div class="result-seal" role="img" aria-label="${t(success ? 'stampDone' : 'stampFailed')}">
      <svg viewBox="0 0 220 180" aria-hidden="true"><defs><path id="seal-upper-arc" d="M 39 87 A 71 71 0 0 1 181 87"/><path id="seal-lower-arc" d="M 44 106 A 70 70 0 0 0 176 106"/></defs><circle cx="110" cy="90" r="83"/><circle cx="110" cy="90" r="77" class="seal-inner"/><circle cx="110" cy="90" r="63" class="seal-inner"/><text class="seal-arc"><textPath href="#seal-upper-arc" startOffset="50%" text-anchor="middle">CHALLENGELOCK</textPath></text><text class="seal-arc"><textPath href="#seal-lower-arc" startOffset="50%" text-anchor="middle">${t('stampArchive')}</textPath></text><path d="${success ? 'm94 58 10 10 20-24' : 'm99 47 22 22m0-22-22 22'}" class="seal-symbol"/><rect x="8" y="78" width="204" height="37" rx="2" class="seal-band"/><text x="110" y="103" text-anchor="middle" class="seal-word">${t(success ? 'stampDone' : 'stampFailed')}</text><path d="m50 122 2 4 4 1-3 3 1 5-4-3-4 3 1-5-3-3 4-1Zm120 0 2 4 4 1-3 3 1 5-4-3-4 3 1-5-3-3 4-1Z" class="seal-star"/></svg>
    </div></div></div>
    <div class="completion-bottom"><span>${icon('history', 16)}${t('resultRecorded')}</span><button class="completion-continue" data-close-completion>${t('continuePlaying')}${icon('arrow', 16)}</button></div>
  </article>`;
  document.body.classList.add('completion-open');
  returnFocus = document.activeElement;
  dialog.showModal();
  // Long mobile contracts stamp only when their seal area actually enters view.
  sealObserver = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        dialog.classList.add('stamp-visible');
        sealObserver.disconnect();
      }
    },
    { root: dialog, threshold: 0.3 },
  );
  sealObserver.observe(dialog.querySelector('.seal-space'));
}
