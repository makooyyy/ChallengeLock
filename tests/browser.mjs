// Optional real-browser regression suite. Install playwright or set PLAYWRIGHT_MODULE.
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../',import.meta.url));
const server=createServer(async(req,res)=>{
 try{
  const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\//,'')||'index.html';
  const target=path.resolve(root,relative);
  if(!target.startsWith(root))throw new Error('outside root');
  const body=await fs.readFile(target);res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml'})[path.extname(target)]||'application/octet-stream');res.end(body);
 }catch{res.statusCode=404;res.end('Not found')}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
 const context=await browser.newContext({reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>{errors.push(e.message);console.error(e.stack)});
 await page.goto(origin+'/#seed=hello&d=mid&r=0');
 await page.waitForSelector('#contract h2');
 assert(await page.locator('#spin').isVisible());
 assert(await page.locator('#data-notice').isVisible());
 assert((await page.locator('#data-notice').textContent()).includes('Каталог сверён с API'));
 assert.equal(await page.locator('#data-notice a').getAttribute('href'),'https://deadlock-api.com/');
 const state=()=>page.evaluate(async()=>{const {S,RT}=await import('/js/state.js');return {cur:RT.cur,rerolls:RT.rerolls,stats:S.stats,friend:S.friend,diff:S.diff,busy:RT.busy}});
 const initial=(await state()).cur;
 await page.click('[data-tab="history"]');await page.click('.hl a');assert(await page.locator('#spin').isVisible());
 await page.click('[data-lock="0"]');await page.click('[data-lock="1"]');await page.click('#reroll');
 await page.waitForFunction(async()=>!(await import('/js/state.js')).RT.busy);
 const rerolled=await state();assert.equal(rerolled.cur.hero,initial.hero);assert.equal(rerolled.cur.conds[0],initial.conds[0]);
 const url=page.url();const second=await browser.newContext({reducedMotion:'reduce'});const receiver=await second.newPage();
 await receiver.addInitScript(()=>localStorage.setItem('dlr.v1',JSON.stringify({only:['bebop'],cats:['tm'],team:false,friend:{same:false,player:9}})));
 await receiver.goto(url);await receiver.waitForSelector('#contract h2');
 const received=await receiver.evaluate(async()=>(await import('/js/state.js')).RT.cur);
 assert.equal(received.hero,rerolled.cur.hero);assert.deepEqual(received.conds,rerolled.cur.conds);assert.deepEqual(received.opts,rerolled.cur.opts);
 await page.click('#done');const points=(await state()).stats.points;
 await page.click('[data-tab="history"]');await page.click('.hl a');assert(await page.locator('#done').isDisabled());assert.equal((await state()).stats.points,points);
 await page.evaluate(()=>location.hash='#seed=change&d=easy&r=0&p=2');await page.waitForFunction(async()=>(await import('/js/state.js')).S.diff==='easy');
 await page.evaluate(()=>location.hash='#seed=change&d=hard&r=0&p=3');await page.waitForFunction(async()=>(await import('/js/state.js')).S.friend.player===3);
 assert.equal((await state()).diff,'hard');
 await page.evaluate(()=>location.hash='#seed=change&d=hard&r=0');await page.waitForFunction(async()=>(await import('/js/state.js')).S.friend.same);
 await page.click('[data-tab="build"]');await page.click('#rb');
 const priorBuild=await page.evaluate(async()=>(await import('/js/state.js')).RT.build);
 await page.click('[data-tab="ban"]');await page.click('[data-ban="item"]');
 const priorBan=await page.evaluate(async()=>(await import('/js/state.js')).RT.ban);
 await page.click('[data-tab="roulette"]');
 const before=await state();
 await page.evaluate(async()=>{const {S,RT}=await import('/js/state.js');S.excluded=RT.data.heroes.map(h=>h.id)});
 await page.click('#reroll');assert.equal((await state()).rerolls,before.rerolls);assert.deepEqual((await state()).cur,before.cur);
 await page.click('[data-tab="build"]');await page.click('#rb');assert((await page.locator('#toast').textContent()).includes('героев'));
 await page.click('[data-tab="ban"]');await page.click('[data-ban="item"]');assert((await page.locator('#toast').textContent()).includes('героев'));
 assert.deepEqual(await page.evaluate(async()=>(await import('/js/state.js')).RT.build),priorBuild);
 assert.deepEqual(await page.evaluate(async()=>(await import('/js/state.js')).RT.ban),priorBan);
 await page.evaluate(()=>localStorage.setItem('dlr.v1',JSON.stringify({stats:{points:'oops'},friend:null,cats:null,history:[null,{}],favs:'broken'})));
 await page.goto(origin+'/');await page.waitForSelector('#spin');assert.equal((await state()).stats.points,0);
 await page.goto(origin+'/#seed=a&v=2&x=null');await page.waitForSelector('#spin');assert((await page.locator('#toast').textContent()).includes('Ссылка'));
 await page.click('#spin');await page.waitForSelector('#contract h2');await page.click('#lang');assert.equal(await page.locator('html').getAttribute('lang'),'en');
 await page.setViewportSize({width:390,height:844});assert(await page.locator('#spin').isVisible());
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 // Real Service Worker installation, offline reload, and isolation from another app's cache.
 await page.evaluate(async()=>{await caches.open('unrelated-test-cache');await navigator.serviceWorker.ready});
 await page.reload();await page.waitForSelector('#spin');
 await context.setOffline(true);await page.reload();await page.waitForSelector('#spin');await page.click('#spin');await page.waitForSelector('#contract h2');
 assert(await page.evaluate(async()=>(await caches.keys()).includes('unrelated-test-cache')));
 await context.setOffline(false);
 // Search must preserve selected heroes even when other cards are hidden.
 await page.click('[data-tab="custom"]');await page.fill('#hero-search','abrams');
 assert.equal(await page.locator('.hc:visible').count(),1);
 await page.check('[data-h="abrams"]');await page.fill('#hero-search','haze');await page.check('[data-h="haze"]');
 assert.deepEqual(await page.evaluate(async()=>(await import('/js/state.js')).S.sel.sort()),['abrams','haze']);
 await page.fill('#hero-search','nothing-matches-this');assert(await page.locator('#hero-search-empty').isVisible());
 await page.click('#hreset');await page.fill('#hero-search','');assert.equal(await page.locator('.hc:visible').count(),42);
 await page.click('[data-tab="roulette"]');await page.locator('.board-options summary').click();
 await page.uncheck('#fsame');assert(await page.locator('#fpl').isEnabled());await page.check('#fsame');assert(await page.locator('#fpl').isDisabled());
 for(const language of ['ru','en']){
 if(await page.locator('html').getAttribute('lang')!==language)await page.click('#lang');
 for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:900});
  for(const tab of ['roulette','build','ban','custom','history']){
   await page.click('[data-tab="'+tab+'"]');
   assert(await page.locator('#p-'+tab+' h1').isVisible());
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Overflow: '+language+' '+tab+' at '+width);
  }
 }
 }
 assert.deepEqual(errors,[]);
 console.log('PASS browser: deep links, history, locks, clean-session replay, duplicate completion, hash changes, failed-roll transaction, empty builds/bans, corrupt storage, malformed links, language, mobile, offline PWA, cache isolation; no page errors.');
}finally{await browser?.close();await new Promise(r=>server.close(r))}
