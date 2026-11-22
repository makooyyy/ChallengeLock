// A release caches code and data together. Bump VERSION for every deployment.
// CATALOG_VERSION is rewritten automatically by scripts/sync-catalog.mjs.
const CATALOG_VERSION = '6c5d33f1af6788bd';
const PREFIX = 'challengelock:' + self.registration.scope + ':';
const VERSION = PREFIX + 'v66:' + CATALOG_VERSION;
const FILES = [
  './',
  'index.html',
  'manifest.json',
  'css/app.css',
  'css/contract.css',
  'js/main.js',
  'js/vendor/fzstd.js',
  'js/theme-boot.js',
  'js/theme.js',
  'js/celebration.js',
  'js/ui.js',
  'js/ui-kit.js',
  'js/views/updates.js',
  'js/icons.js',
  'js/state.js',
  'js/rng.js',
  'js/roulette.js',
  'js/builds.js',
  'js/build-config.js',
  'js/builder-ui.js',
  'js/game-export.js',
  'js/game-export-ui.js',
  'js/ban-ui.js',
  'js/tool-focus.js',
  'js/storage.js',
  'js/share.js',
  'js/i18n.js',
  'js/validation.js',
  'js/update-check.js',
  'data/heroes.json',
  'data/items.json',
  'data/challenges.json',
  'data/i18n.json',
  'data/changelog.json',
  'assets/icon.svg',
  'assets/portraits/abrams.webp',
  'assets/portraits/apollo.webp',
  'assets/portraits/bebop.webp',
  'assets/portraits/billy.webp',
  'assets/portraits/calico.webp',
  'assets/portraits/celeste.webp',
  'assets/portraits/deadman-danny.webp',
  'assets/portraits/drifter.webp',
  'assets/portraits/dynamo.webp',
  'assets/portraits/graves.webp',
  'assets/portraits/grey-talon.webp',
  'assets/portraits/haze.webp',
  'assets/portraits/holliday.webp',
  'assets/portraits/infernus.webp',
  'assets/portraits/ivy.webp',
  'assets/portraits/kelvin.webp',
  'assets/portraits/lady-geist.webp',
  'assets/portraits/lash.webp',
  'assets/portraits/mcginnis.webp',
  'assets/portraits/mina.webp',
  'assets/portraits/mirage.webp',
  'assets/portraits/mo-krill.webp',
  'assets/portraits/nurse-harrow.webp',
  'assets/portraits/paige.webp',
  'assets/portraits/paradox.webp',
  'assets/portraits/pocket.webp',
  'assets/portraits/rat-king.webp',
  'assets/portraits/rem.webp',
  'assets/portraits/seven.webp',
  'assets/portraits/shiv.webp',
  'assets/portraits/silver.webp',
  'assets/portraits/sinclair.webp',
  'assets/portraits/solomon.webp',
  'assets/portraits/the-doorman.webp',
  'assets/portraits/venator.webp',
  'assets/portraits/victor.webp',
  'assets/portraits/vindicta.webp',
  'assets/portraits/viscous.webp',
  'assets/portraits/vyper.webp',
  'assets/portraits/warden.webp',
  'assets/portraits/wraith.webp',
  'assets/portraits/yamato.webp',
  'assets/icon-192.png',
  'assets/icon-512.png',
  'assets/apple-touch-icon.png',
  'assets/fonts/manrope-latin.woff2',
  'assets/fonts/manrope-cyrillic.woff2',
  'assets/fonts/oswald-latin.woff2',
  'assets/fonts/oswald-cyrillic.woff2',
  'assets/fonts/jetbrains-mono-latin.woff2',
  'assets/fonts/jetbrains-mono-cyrillic.woff2',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)));
  self.skipWaiting();
});
self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
self.addEventListener('activate', (e) =>
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k.startsWith(PREFIX) && k !== VERSION).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  ),
);
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  const scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  const relative = url.pathname.slice(scope.pathname.length);
  const file = relative || './';
  if (!FILES.includes(file)) return;
  // Ignore search parameters only for known static resources.
  url.search = '';
  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const cached = await cache.match(url.href);
      if (cached) return cached;
      const response = await fetch(e.request);
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response;
    }),
  );
});
