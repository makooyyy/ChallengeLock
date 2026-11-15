// A release caches code and data together. Bump VERSION for every deployment.
const CATALOG_VERSION='7df33ce9dbedca22';
const PREFIX='challengelock:'+self.registration.scope+':',VERSION=PREFIX+'v7:'+CATALOG_VERSION;
const FILES=['./','index.html','css/style.css','css/enhancements.css','js/theme.js','js/celebration.js','js/ui.js','js/icons.js','js/state.js','js/rng.js','js/roulette.js','js/builds.js','js/storage.js','js/share.js','js/i18n.js','js/validation.js','data/heroes.json','data/items.json','data/challenges.json','data/i18n.json','manifest.json','assets/icon.svg'];
self.addEventListener('install',e=>e.waitUntil(caches.open(VERSION).then(c=>c.addAll(FILES))));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&k!==VERSION).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const url=new URL(e.request.url),scope=new URL(self.registration.scope);
  if(url.origin!==scope.origin||!url.pathname.startsWith(scope.pathname))return;
  const relative=url.pathname.slice(scope.pathname.length),file=relative||'./';
  if(!FILES.includes(file))return;
  // Ignore search parameters only for known static resources.
  url.search='';
  e.respondWith(caches.open(VERSION).then(async cache=>{
    const cached=await cache.match(url.href);
    if(cached)return cached;
    const response=await fetch(e.request);
    if(!response.ok)throw new Error('HTTP '+response.status);
    return response;
  }));
});

