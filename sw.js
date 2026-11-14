// Cache-first offline shell; data JSON is network-first so patches arrive quickly.
const V='dlr-v1',F=['./','index.html','css/style.css','js/ui.js','js/state.js','js/rng.js','js/roulette.js','js/builds.js','js/storage.js','js/share.js','js/i18n.js','data/heroes.json','data/items.json','data/challenges.json','data/i18n.json','manifest.json','assets/icon.svg'];
self.addEventListener('install',e=>e.waitUntil(caches.open(V).then(c=>c.addAll(F)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V).map(x=>caches.delete(x)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;const u=new URL(e.request.url);if(u.origin!==location.origin)return;
  const net=u.pathname.includes('/data/');
  e.respondWith(net?fetch(e.request).then(r=>{const c=r.clone();caches.open(V).then(x=>x.put(e.request,c));return r}).catch(()=>caches.match(e.request)):caches.match(e.request).then(m=>m||fetch(e.request)))});
