// Changelog view. Pure rendering: the caller owns the data and the language.
import { t, loc } from '../i18n.js';
import { esc, intro } from '../ui-kit.js';

export const releasesOf = (data) =>
  Array.isArray(data?.changelog?.releases) ? data.changelog.releases : [];

export const siteVersionOf = (releases) => releases[0]?.version || '';

export const releaseDate = (iso, lang) => {
  const date = new Date(String(iso) + 'T00:00:00');
  if (Number.isNaN(date.getTime())) return String(iso);
  return new Intl.DateTimeFormat(lang === 'ru' ? 'ru-RU' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
};

export function renderUpdates(panel, releases, lang) {
  const version = siteVersionOf(releases);
  panel.innerHTML =
    intro(
      t('updatesTitle'),
      t('updatesIntro'),
      version ? `<span class="version-pill">v${esc(version)}</span>` : '',
    ) +
    (releases.length
      ? `<div class="release-list">${releases
          .map(
            (r, i) => `<article class="card release">
      <div class="release-head"><span class="release-version">v${esc(r.version)}</span><time datetime="${esc(r.date)}">${esc(releaseDate(r.date, lang))}</time>${
        i === 0 ? `<span class="release-current">${t('currentVersion')}</span>` : ''
      }</div>
      <h2>${esc(loc(r.title))}</h2>
      <ul>${(loc(r.items) || []).map((item) => `<li>${esc(item)}</li>`).join('')}</ul>
    </article>`,
          )
          .join('')}</div>`
      : `<div class="card"><p>${t('updatesEmpty')}</p></div>`);
}
