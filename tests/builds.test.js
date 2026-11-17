import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {makeBuild,replaceBuildItem,restoreBuild} from '../js/builds.js';import {BUILD_STAGES,buildSettings,savedBuild} from '../js/build-config.js';import {options,normalizeState} from '../js/validation.js';
const read=name=>JSON.parse(fs.readFileSync(new URL('../data/'+name+'.json',import.meta.url),'utf8'))[name];const heroes=read('heroes'),items=read('items'),o=options();const get=id=>items.find(i=>i.id===id);
test('build settings constrain tier, budget, hero, active items and slot count',()=>{
 for(const stage of Object.keys(BUILD_STAGES))for(const maxActive of [0,1,2,4])for(const focus of ['balanced','weapon','spirit','vitality'])for(let n=0;n<15;n++){
  const cfg=buildSettings({stage,maxActive,focus,heroId:'abrams'}),b=makeBuild('lab'+n,heroes,items,cfg.budget,o,cfg);assert(b);assert.equal(b.hero,'abrams');assert(b.spent<=cfg.budget);assert(b.items.length<=cfg.maxItems);assert(b.items.every(id=>get(id).tier<=BUILD_STAGES[stage].maxTier));assert(b.items.filter(id=>get(id).isActive).length<=maxActive);assert.deepEqual(b.items,makeBuild('lab'+n,heroes,items,cfg.budget,o,cfg).items);
 }
 for(const budget of [0,799,-1,Infinity,NaN,100001,1600.5])assert.equal(makeBuild('bad',heroes,items,budget,o),null);
 assert.equal(makeBuild('excluded',heroes,items,4800,{...o,excluded:['abrams']},{heroId:'abrams'}),null);
});
test('large budgets are spent on items instead of being left as remainder',()=>{
 const cap=stage=>buildSettings({stage}).maxItems*Math.max(...items.filter(i=>i.tier<=BUILD_STAGES[stage].maxTier).map(i=>i.cost));
 for(const stage of Object.keys(BUILD_STAGES))for(const budget of [16000,32000,48000,64000,100000])for(let n=0;n<5;n++){
  const cfg=buildSettings({stage,budget,maxActive:4}),b=makeBuild('spend'+n,heroes,items,budget,o,cfg);assert(b);
  assert(b.spent<=budget);assert(b.spent<=cap(stage));assert(budget-b.spent<800||b.spent>=cap(stage)-800,`${stage} ${budget} spent ${b.spent}`);
  assert.equal(new Set(b.items).size,b.items.length);
 }
 for(let n=0;n<5;n++)for(const budget of [48000,64000]){const b=makeBuild('exact'+n,heroes,items,budget,o,buildSettings({stage:'full',budget,maxActive:4}));assert.equal(b.spent,budget,`full ${budget} spent ${b.spent}`)}
});
test('pins and purchased items survive; replacing one item preserves the rest',()=>{
 const cfg=buildSettings({stage:'full',budget:32000}),b=makeBuild('pins',heroes,items,32000,o,cfg);b.locked=[b.items[0]];b.purchased=[b.items[1]];
 const next=makeBuild('again',heroes,items,32000,o,{...cfg,locked:[...b.locked,...b.purchased]});assert(next.items.includes(b.items[0]));assert(next.items.includes(b.items[1]));
 const target=b.items[2],replacement=replaceBuildItem('replacement',b,target,heroes,items,o);assert(replacement);assert(!replacement.items.includes(target));assert(b.items.filter(id=>id!==target).every(id=>replacement.items.includes(id)));assert.deepEqual(replacement.locked,b.locked);assert.deepEqual(replacement.purchased,b.purchased);assert(replacement.spent<=b.budget);
 assert.equal(replaceBuildItem('locked',b,b.items[0],heroes,items,o),null);assert.equal(replaceBuildItem('bought',b,b.items[1],heroes,items,o),null);
 const pricey=items.find(i=>i.tier===4);assert.equal(makeBuild('bad-pin',heroes,items,1600,o,{stage:'lane',locked:[pricey.id]}),null);
});
test('saved builds are validated against catalog before display',()=>{
 const cfg=buildSettings({stage:'lane'}),b=makeBuild('save',heroes,items,cfg.budget,o,cfg);b.locked=[b.items[0]];b.purchased=[b.items[0]];
 assert.equal(restoreBuild(b,heroes,items).spent,b.spent);assert.deepEqual(restoreBuild(b,heroes,items).purchased,b.purchased);
 assert.equal(restoreBuild({...b,items:['missing']},heroes,items),null);assert.equal(restoreBuild({...b,items:[b.items[0],b.items[0]]},heroes,items),null);assert.equal(savedBuild(null),null);
 const state=normalizeState({buildSettings:{stage:'bad',budget:-1,maxActive:99},savedBuild:b},o);assert.equal(state.buildSettings.stage,'lane');assert.equal(state.buildSettings.maxActive,2);assert.equal(state.savedBuild.hero,b.hero);
});
