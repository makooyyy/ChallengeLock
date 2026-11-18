import { S } from './state.js';
import { t } from './i18n.js';
import { icon } from './icons.js';
const preference = matchMedia('(prefers-color-scheme: dark)');
export function applyTheme() {
  const theme = S.theme === 'system' ? (preference.matches ? 'dark' : 'light') : S.theme;
  document.documentElement.dataset.theme = theme;
  const button = document.getElementById('theme');
  if (button) {
    button.innerHTML = icon(theme === 'dark' ? 'sun' : 'moon', 17);
    button.setAttribute('aria-label', t(theme === 'dark' ? 'lightTheme' : 'darkTheme'));
    button.title = t(theme === 'dark' ? 'lightTheme' : 'darkTheme');
    button.setAttribute('aria-pressed', String(theme === 'dark'));
  }
  const color = document.querySelector('meta[name="theme-color"]');
  if (color) color.content = theme === 'dark' ? '#101217' : '#f3f5f9';
}
export function toggleTheme() {
  S.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme();
}
preference.addEventListener('change', () => {
  if (S.theme === 'system') applyTheme();
});
