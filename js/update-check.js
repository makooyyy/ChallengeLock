// Desktop release notice. The web build updates itself through the Service
// Worker, so this only announces the packaged Windows app from GitHub Releases.
import { t } from './i18n.js';

const CHECKED_KEY = 'dlr.updateChecked';
const DAY = 24 * 60 * 60 * 1000;
const RELEASES = 'https://api.github.com/repos/makooyyy/ChallengeLock/releases/latest';
const RELEASES_PAGE = 'https://github.com/makooyyy/ChallengeLock/releases/latest';

// A release without a Windows installer is not something a web visitor can use.
export const hasInstaller = (assets = []) =>
  assets.some((a) => typeof a?.name === 'string' && /\.exe$/i.test(a.name));

export function isNewerVersion(latest, current) {
  const a = String(latest).split('.'),
    b = String(current).split('.');
  const toNum = (v) => parseInt(v, 10) || 0;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (toNum(a[i]) > toNum(b[i])) return true;
    if (toNum(a[i]) < toNum(b[i])) return false;
  }
  return false;
}

function recentlyChecked() {
  try {
    return Date.now() - Number(localStorage.getItem(CHECKED_KEY) || 0) < DAY;
  } catch {
    return false;
  }
}

function markChecked() {
  try {
    localStorage.setItem(CHECKED_KEY, String(Date.now()));
  } catch {
    /* quota or private mode: the next load simply checks again */
  }
}

export function showUpdateBanner(version, url) {
  if (document.getElementById('update-banner')) return;
  const safeUrl = /^https:\/\/github\.com\/makooyyy\/ChallengeLock\//.test(String(url))
    ? String(url)
    : RELEASES_PAGE;
  const banner = document.createElement('div');
  banner.id = 'update-banner';
  banner.className = 'update-banner';
  banner.setAttribute('role', 'status');
  const text = document.createElement('span');
  text.textContent = t('updateAvailable') + ' ' + String(version);
  const actions = document.createElement('span');
  actions.className = 'update-banner-actions';
  const link = document.createElement('a');
  link.href = safeUrl;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = t('updateDownload');
  const close = document.createElement('button');
  close.id = 'update-close';
  close.type = 'button';
  close.setAttribute('aria-label', t('updateClose'));
  close.title = t('updateClose');
  close.textContent = '×';
  close.addEventListener('click', () => banner.remove());
  actions.append(link, close);
  banner.append(text, actions);
  document.body.prepend(banner);
}

// Cheap, silent, and bounded: one request per day, and only for real installers.
export async function checkForUpdates(siteVersion) {
  // The desktop build ships electron-updater, which already notifies about releases.
  if (globalThis.challengeLockDesktop?.isDesktop) return;
  if (!siteVersion || recentlyChecked()) return;
  markChecked();
  try {
    const response = await fetch(RELEASES);
    if (!response.ok) return;
    const data = await response.json();
    const latest = String(data.tag_name || '').replace(/^v/, '');
    if (!latest || !isNewerVersion(latest, siteVersion) || !hasInstaller(data.assets)) return;
    showUpdateBanner(latest, data.html_url);
  } catch (e) {
    console.warn(e);
  }
}
