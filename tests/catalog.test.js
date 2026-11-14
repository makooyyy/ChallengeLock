import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildCatalog} from '../scripts/catalog.js';
import {validateData,options} from '../js/validation.js';
import {makeBuild} from '../js/builds.js';
import {heroPool,rollBan} from '../js/roulette.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../data/'+p+'.json',import.meta.url),'utf8'));
const hd=read('heroes'),id=read('items'),heroes=hd.heroes,items=id.items;
function fixture(){
 const rh=heroes.filter(h=>h.active!==false).map(h=>({id:h.apiId,name:h.name,class_name:h.className,player_selectable:true,disabled:false,in_development:false,colors:{style_hex:h.color},images:{icon_image_small_webp:h.icon},items:Object.fromEntries(h.abilityClasses.map((s,i)=>['signature'+(i+1),s]))}));
 const ri=items.filter(i=>i.active!==false).map(i=>({id:i.apiId,name:i.name,class_name:i.className,type:'upgrade',shopable:true,item_tier:i.tier,cost:i.cost,item_slot_type:i.branch,shop_image_webp:i.icon,is_active_item:i.isActive,component_items:i.components.map(id=>items.find(x=>x.id===id).className)}));
 return {rh,ri};
}
const convert=({rh,ri})=>buildCatalog({heroText:JSON.stringify(rh),itemText:JSON.stringify(ri),clientVersion:hd._meta.clientVersion,retrievedAt:'2026-11-14T00:00:00.000Z',previousHeroes:heroes,previousItems:items});
test('published catalog has consistent provenance and preserves legacy IDs',()=>{
 validateData({heroes,items,challenges:read('challenges').challenges,catalog:{heroes:hd._meta,items:id._meta}},read('i18n'));
 assert.equal(hd._meta.revision,id._meta.revision);assert.equal(hd._meta.clientVersion,id._meta.clientVersion);
 for(const name of ['abrams','mo-krill','basic-magazine','high-velocity-mag','mystic-regen'])assert([...heroes,...items].some(x=>x.id===name&&x.verified));
 assert(heroes.filter(h=>h.active!==false).length>=28);assert(items.filter(i=>i.active!==false).length>=100);
 assert(items.some(i=>i.tier===4));assert(items.every(i=>i.components.every(c=>items.find(x=>x.id===c).buildsInto.includes(i.id))));
});
test('sync is deterministic, preserves renames by API ID and excludes test assets',()=>{
 const f=fixture(),first=convert(f),second=convert(f);assert.deepEqual(first,second);
 f.rh[0].name='Renamed Hero';f.ri[0].name='Renamed Item';
 f.rh.push({...f.rh[0],id:999999,class_name:'hero_test',name:'Test Hero',in_development:true});
 f.ri.push({...f.ri[0],id:999999,class_name:'test_item',name:'Test Item',item_tier:5});
 const updated=convert(f);
 assert.equal(updated.heroes.heroes.find(h=>h.name==='Renamed Hero').id,heroes[0].id);
 assert.equal(updated.items.items.find(i=>i.name==='Renamed Item').id,items[0].id);
 assert(!updated.heroes.heroes.some(h=>h.name==='Test Hero'));assert(!updated.items.items.some(i=>i.name==='Test Item'));
});
test('retired heroes remain available for history but never enter a generator',()=>{
 const f=fixture(),old=heroes[0];f.rh=f.rh.filter(h=>h.id!==old.apiId);
 const updated=convert(f).heroes.heroes,retired=updated.find(h=>h.id===old.id);
 assert.equal(retired.active,false);assert.equal(retired.verified,false);
 assert(!heroPool(updated,options()).some(h=>h.id===old.id));
 assert.equal(rollBan('retired',updated,items,{...options(),only:[old.id]},'item'),null);
});
test('sync rejects broken and incomplete sources before producing output',()=>{
 for(const mutate of [f=>f.rh.splice(0,40),f=>f.ri[0].cost=-1,f=>f.ri[0].component_items=['unknown'],f=>f.ri[0].component_items=[f.ri[0].class_name],f=>f.ri.push(f.ri[0]),f=>f.rh[0].items={}]){
  const f=fixture();mutate(f);assert.throws(()=>convert(f));
 }
});
test('expanded builds respect budgets and never contain an upgrade plus its component',()=>{
 const parents=id=>items.find(x=>x.id===id).components.flatMap(p=>[p,...parents(p)]);
 for(const budget of [2500,5000,8000,16000,32000])for(let n=0;n<100;n++){
  const build=makeBuild('catalog'+n,heroes,items,budget,options());
  assert(build.spent<=budget);assert.equal(build.spent,build.items.reduce((sum,id)=>sum+items.find(i=>i.id===id).cost,0));
  for(const id of build.items)assert(!parents(id).some(p=>build.items.includes(p)));
 }
});
test('runtime rejects mixed releases and invalid recipe links',()=>{
 const data={heroes,items,challenges:read('challenges').challenges,catalog:{heroes:hd._meta,items:id._meta}},dict=read('i18n');
 const mixed=structuredClone(data);mixed.catalog.items.clientVersion++;assert.throws(()=>validateData(mixed,dict));
 const broken=structuredClone(data);broken.items[0].components=['missing'];assert.throws(()=>validateData(broken,dict));
});
