import { rule as banRule } from './ban-ui.js';
import { S, RT } from './state.js';
import { gameBuildCode, challengeForExport } from './game-export.js';
import { copy } from './share.js';
import { t, getDict } from './i18n.js';
import { icon } from './icons.js';
let dialog, sourceButton;
export async function showGameExport(build, heroes, items) {
  let challenge = challengeForExport(
    RT.preview ? null : RT.cur,
    heroes,
    RT.data.challenges,
    getDict(),
    S.lang,
  );
  if (RT.ban?.hero === build.hero) {
    const line = t('oneMatchRule') + ' · ' + banRule(RT.ban);
    challenge = challenge
      ? { ...challenge, text: challenge.text + '\n\n' + line }
      : { text: line, heroId: build.hero, language: S.lang === 'ru' ? 8 : 0 };
  }
  const code = gameBuildCode(build, heroes, items, challenge),
    hero = heroes.find((h) => h.id === build.hero);
  sourceButton = document.getElementById('copy-game-build');
  const copied = await copy(code);
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.className = 'game-export-dialog';
    dialog.id = 'game-export-dialog';
    dialog.setAttribute('aria-labelledby', 'game-export-title');
    document.body.append(dialog);
    dialog.addEventListener('close', () => {
      document.body.classList.remove('completion-open');
      sourceButton?.focus({ preventScroll: true });
    });
    dialog.addEventListener('click', async (e) => {
      if (e.target.closest('[data-export-close]')) dialog.close();
      if (e.target.closest('#export-copy-again')) {
        const ok = await copy(dialog.querySelector('textarea').value);
        dialog.querySelector('#export-status').textContent = t(
          ok ? 'exportCopied' : 'exportManual',
        );
        if (!ok) {
          dialog.querySelector('textarea').focus();
          dialog.querySelector('textarea').select();
        }
      }
    });
  }
  dialog.innerHTML = `<button class="export-close" data-export-close aria-label="${t('closeCard')}">${icon('close', 20)}</button><span class="eyebrow">DEADLOCK / IMPORT</span><h2 id="game-export-title">${t('exportTitle')}</h2><p id="export-status" role="status">${t(copied ? 'exportCopied' : 'exportManual')}</p><div class="export-hero"></div><details class="export-challenge"><summary></summary><p class="export-challenge-warning"></p><pre></pre></details><ol class="export-steps"><li>${t('exportStep1')}</li><li>${t('exportStep2')}</li><li>${t('exportStep3')}</li></ol><label for="export-code">${t('exportCodeLabel')}</label><textarea id="export-code" readonly spellcheck="false" rows="3"></textarea><div class="export-actions"><button id="export-copy-again">${icon('copy', 16)}${t('exportCopyAgain')}</button><button data-export-close>${t('exportDone')}</button></div><details class="export-troubleshoot"><summary>${t('exportTroubleTitle')}</summary><p>${t('exportTroubleText')}</p></details>`;
  dialog.querySelector('.export-hero').textContent =
    hero.name + ' · ' + build.items.length + ' ' + t('itemsCount');
  dialog.querySelector('textarea').value = code;
  const preview = dialog.querySelector('.export-challenge');
  preview.hidden = !challenge;
  if (challenge) {
    preview.querySelector('summary').textContent = t('exportChallengeIncluded');
    preview.querySelector('pre').textContent = challenge.text;
    const warning = preview.querySelector('p');
    warning.hidden = challenge.heroId === build.hero;
    warning.textContent = t('exportChallengeMismatch');
  }
  document.body.classList.add('completion-open');
  dialog.showModal();
  if (!copied) {
    dialog.querySelector('textarea').focus();
    dialog.querySelector('textarea').select();
  }
}
