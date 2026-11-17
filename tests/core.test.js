import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {roll,heroPool,rollBan,compatible,restoreResult,resultKey} from '../js/roulette.js';
import {makeBuild} from '../js/builds.js';
import {hashFor,parseHash} from '../js/share.js';
import {options,normalizeState,validateData} from '../js/validation.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../data/'+p+'.json',import.meta.url),'utf8'));
const heroes=read('heroes').heroes,items=read('items').items,challenges=read('challenges').challenges,dict=read('i18n');
const o=options(),base={heroes,challenges,o};
test('2000 seeds: deterministic replay, reroll, conflicts, build budgets and uniqueness',()=>{
 for(const diff of ['easy','mid','hard','insane'])for(let i=0;i<500;i++){
  const input={...base,o:{...o,diff},seed:'regression'+i};
  const first=roll(input),reroll=roll({...input,prev:first,r:1}),direct=roll({...input,r:1});
  assert.equal(resultKey(reroll),resultKey(direct));
  assert.equal(resultKey(first),resultKey(roll(input)));
  const cs=direct.conds.map(id=>challenges.find(c=>c.id===id));
  for(let j=0;j<cs.length;j++)for(const c of cs.slice(j+1))assert(compatible(cs[j],c));
  const build=makeBuild(input.seed,heroes,items,5000,o);assert(build.spent<=5000);assert.equal(new Set(build.items).size,build.items.length);
 }
});
test('links preserve locked result, player and options in a clean session',()=>{
 const opts={...o,diff:'insane',only:['abrams'],cats:['ab','it','gp']};
 const first=roll({...base,o:opts,seed:'locked',same:false,player:3});
 const result=roll({...base,o:opts,seed:'locked',same:false,player:3,r:1,prev:first,locks:[true,true,false,false]});
 assert.equal(result.hero,first.hero);assert.equal(result.conds[0],first.conds[0]);
 const h=parseHash(hashFor(result)),restored=restoreResult(h.result,heroes,challenges);
 assert.equal(resultKey(restored),resultKey(result));assert.deepEqual(restored.opts,opts);assert.equal(h.p,3);
});
test('empty hero pool is respected by every generator',()=>{
 const opts={...o,excluded:heroes.map(h=>h.id)};
 assert.deepEqual(heroPool(heroes,opts),[]);
 assert.equal(roll({...base,seed:'empty',o:opts}),null);
 assert.equal(makeBuild('empty',heroes,items,5000,opts),null);
 assert.equal(rollBan('empty',heroes,items,opts,'item'),null);
 assert.equal(roll({...base,seed:'empty',o:{...o,cats:[]}}),null);
});
test('locked hero-specific challenges cannot migrate to an incompatible hero',()=>{
 const special={...challenges[0],id:'specific',difficulty:1,heroes:[heroes[0].id]};
 const cs=[special,...challenges];
 const prev={hero:heroes[0].id,conds:['specific']};
 const result=roll({seed:'lock',heroes,challenges:cs,o:{...o,diff:'easy'},prev,locks:[false,true]});
 assert.equal(result.hero,heroes[0].id);
 assert.equal(roll({seed:'lock',heroes,challenges:cs,o:{...o,diff:'easy',excluded:[heroes[0].id]},prev,locks:[false,true]}),null);
});
test('invalid links fail without throwing; old links get predictable defaults',()=>{
 for(const h of ['#seed=a&d=bad','#seed=a&r=-1','#seed=a&r=Infinity','#seed=a&p=42','#seed=a&v=9','#seed=a&v=2&x=null','#seed=a&v=2&x=%7B'])assert.equal(parseHash(h).error,true);
 assert.equal(parseHash('#seed=abc').d,'mid');assert.equal(parseHash('#seed=abc').p,0);
 const result=roll({...base,seed:'missing'});result.hero='missing';assert.throws(()=>restoreResult(result,heroes,challenges));
});
test('corrupt saved state is normalized deeply',()=>{
 const def={...o,sound:true};
 const s=normalizeState({lang:'bad',diff:'bad',stats:{done:2,points:'oops'},friend:{player:Infinity},history:[null,{}],favs:'oops',excluded:null,sel:34},def);
 assert.equal(normalizeState({theme:'invalid'},def).theme,'system');assert.equal(normalizeState({theme:'dark'},def).theme,'dark');
 assert.deepEqual(s.stats,{done:2,fail:0});assert.deepEqual(s.friend,{same:true,player:1});assert.deepEqual(s.history,[]);assert.deepEqual(s.favs,[]);assert.deepEqual(s.excluded,[]);assert.equal(s.diff,'mid');
 for(const input of [null,[],42,'oops'])assert.equal(normalizeState(input,def).lang,'ru');
});
test('data schema accepts catalog and rejects corruption before rendering',()=>{
 const data={heroes,items,challenges};assert.equal(validateData(data,dict),data);
 for(const mutate of [d=>d.heroes.push(d.heroes[0]),d=>d.heroes[0].color='red;bad',d=>d.items[0].cost=-1,d=>d.challenges[0].heroes=['missing'],d=>d.challenges[0].tags=null]){
  const copy=structuredClone(data);mutate(copy);assert.throws(()=>validateData(copy,dict));
 }
});
test('service worker keeps other apps caches and ignores unrelated requests',async()=>{
 const events={},deleted=[],scope='https://example.test/ChallengeLock/',prefix='challengelock:'+scope+':',swSource=fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8'),release=swSource.match(/VERSION=PREFIX\+'(v\d+:)'/)[1];
 const context={self:{registration:{scope},addEventListener:(k,f)=>events[k]=f,clients:{claim:async()=>{}}},caches:{keys:async()=>['other-app','dlr-v1',prefix+'v1',prefix+release+read('heroes')._meta.revision,'challengelock:https://example.test/Other/:v1'],delete:async k=>deleted.push(k)},URL,Promise};
 vm.runInNewContext(swSource,context);
 let pending;events.activate({waitUntil:p=>pending=p});await pending;assert.deepEqual(deleted,[prefix+'v1']);
 for(const url of ['https://example.test/Other/index.html','https://other.test/ChallengeLock/index.html',scope+'api'])events.fetch({request:{method:'GET',url},respondWith(){assert.fail('Intercepted unrelated request')}});
});

test('mode pools stay separate across difficulties, rerolls and shared links',()=>{
 assert.equal(options({gameMode:'bad'}).gameMode,'normal');
 for(const gameMode of ['street','normal','ranked'])for(const diff of ['easy','mid','hard','insane'])for(let i=0;i<100;i++){
  const input={...base,o:{...o,gameMode,diff},seed:'mode-'+i};const x=roll(input);assert(x);
  for(const id of x.conds)assert((challenges.find(c=>c.id===id).gameModes||['normal']).includes(gameMode));
  const again=roll({...input,r:1,prev:x,locks:[true,true]});assert(again);assert.equal(again.conds[0],x.conds[0]);
  const restored=restoreResult(parseHash(hashFor(x)).result,heroes,challenges);assert.equal(restored.opts.gameMode,gameMode);assert.equal(resultKey(restored),resultKey(x));
 }
 const street=roll({...base,seed:'wrong-mode',o:{...o,gameMode:'street'}});
 assert.throws(()=>restoreResult({...street,opts:{...street.opts,gameMode:'ranked'}},heroes,challenges));
 const legacy=roll({...base,seed:'old'});delete legacy.opts.gameMode;assert.equal(restoreResult(legacy,heroes,challenges).opts.gameMode,'normal');
 const bad=structuredClone(challenges);bad[0].gameModes=['bad'];assert.throws(()=>validateData({heroes,items,challenges:bad},dict));
});

test('difficulty ceilings and contract size protect easy and normal games',()=>{
 const sizes={easy:1,mid:1,hard:2,insane:3},ceilings={easy:1,mid:2,hard:4,insane:5};
 for(const gameMode of ['normal','street','ranked'])for(const diff of Object.keys(sizes))for(let i=0;i<150;i++){
  const x=roll({...base,seed:'balance-'+i,o:{...o,gameMode,diff}});assert(x);assert.equal(x.conds.length,sizes[diff]);
  for(const id of x.conds)assert(challenges.find(c=>c.id===id).difficulty<=ceilings[diff]);
  for(const key of ['points','mult','sum','rarity'])assert(!(key in x));
 }
 for(const id of ['ab_no1','ab_no2','ab_no3','ab_no_ult','gp_nobuy','gp_nozip','gp_nojump','go_guardian','go_assists','street_rounds','street_survivor','normal_courier','ranked_objective'])assert(challenges.find(c=>c.id===id).difficulty>2,id);
});
test('legacy scores are discarded while outcomes and favorites survive migration',()=>{
 const old={...roll({...base,seed:'migration'}),outcome:'done',points:99,sum:8,mult:12,rarity:'cursed'};
 const saved=normalizeState({stats:{done:4,fail:2,points:999},history:[old],favs:[old]},o);
 assert.deepEqual(saved.stats,{done:4,fail:2});
 for(const row of [saved.history[0],saved.favs[0],restoreResult(old,heroes,challenges)])for(const key of ['points','sum','mult','rarity'])assert(!(key in row));
 assert.equal(saved.history[0].outcome,'done');assert.deepEqual(saved.history[0].conds,old.conds);
});
