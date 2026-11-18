// Tiny i18n: dictionary from /data/i18n.json, fallback to key.
let D = {},
  L = 'ru';
export const setDict = (d, l) => {
  D = d;
  L = l;
};
export const setLang = (l) => {
  L = l;
  document.documentElement.lang = l;
};
export const t = (k) => (D[L] && D[L][k]) ?? k;
export const loc = (o) => (typeof o === 'string' ? o : o?.[L] || o?.ru || '');

export const getDict = () => D;
