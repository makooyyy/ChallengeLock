import {makeRng,pick,int,shuffle} from './rng.js';
import {options,validRecord} from './validation.js';
export const DIFF={easy:{n:[1,1],max:2},mid:{n:[1,2],max:3},hard:{n:[2,3],max:4},insane:{n:[3,3],max:5}};
export const rarity=s=>s<=3?'common':s<=6?'rare':s<=9?'epic':'cursed';
export const compatible=(a,b)=>a.id!==b.id&&!a.conflicts.some(t=>b.tags.includes(t))&&!b.conflicts.some(t=>a.tags.includes(t));
export function heroPool(heroes,f){return heroes.filter(h=>h.active!==false&&!f.excluded.includes(h.id)&&(!f.only.length||f.only.includes(h.id)));}
export const supportsMode=(c,mode)=>(c.gameModes||['normal']).includes(mode);
const ok=(c,hero,o)=>supportsMode(c,o.gameMode)&&o.cats.includes(c.cat)&&c.difficulty<=DIFF[o.diff].max&&(c.mode!=='team'||o.team)&&(c.heroes==='all'||c.heroes.includes(hero.id));
export function resultFor({seed,r=0,diff,hero,conds,player=0,opts},challenges){
  const list=conds.map(id=>challenges.find(c=>c.id===id));
  const sum=list.reduce((a,c)=>a+c.difficulty,0),mult=list.reduce((a,c)=>a*c.mult,1);
  return {seed,r,diff,hero,conds:[...conds],player,opts:options({...opts,diff}),sum,mult:+mult.toFixed(2),points:Math.round(sum*mult),rarity:rarity(sum),ts:Date.now(),outcome:null};
}
export function restoreResult(x,heroes,challenges){
  if(!validRecord(x)||!heroes.some(h=>h.id===x.hero))throw new Error('Invalid result');
  const cs=x.conds.map(id=>challenges.find(c=>c.id===id));
  if(cs.some(c=>!c||!supportsMode(c,options(x.opts).gameMode))||cs.some((a,i)=>cs.slice(i+1).some(b=>!compatible(a,b))))throw new Error('Unavailable result');
  return resultFor(x,challenges);
}
export const resultKey=x=>JSON.stringify([x.seed,x.diff,x.r,x.hero,x.conds,options(x.opts).gameMode]);
// Independent count stream keeps direct replay and unlocked reroll identical.
export function roll({seed,r=0,heroes,challenges,o,locks=[],prev=null,player=0,same=true}){
  o=options(o);
  const pool=heroPool(heroes,o);if(!pool.length)return null;
  const rng=makeRng(seed+':'+o.diff+':'+r),hr=makeRng(seed+(same?'':'#'+player)+':'+o.diff+':'+r+':h');
  const [lo,hi]=DIFF[o.diff].n,n=int(makeRng(seed+':'+o.diff+':count'),lo,hi);
  const locked=prev?prev.conds.map((id,i)=>locks[i+1]?challenges.find(c=>c.id===id):null):[];
  if(locked.some((c,i)=>locks[i+1]&&(!c||i>=n)))return null;
  const eligible=pool.filter(h=>locked.every(c=>!c||ok(c,h,o)));
  const hero=prev&&locks[0]?eligible.find(h=>h.id===prev.hero):pick(hr,eligible);
  if(!hero)return null;
  const conds=Array.from({length:n},(_,i)=>locked[i]||null);
  const cand=shuffle(rng,challenges.filter(c=>ok(c,hero,o)));
  for(let i=0;i<n;i++)if(!conds[i])conds[i]=cand.find(x=>conds.every(y=>!y||compatible(x,y)))||null;
  const list=conds.filter(Boolean);if(!list.length)return null;
  return resultFor({seed,r,diff:o.diff,hero:hero.id,conds:list.map(c=>c.id),player:same?0:player,opts:o},challenges);
}
export function rollBan(seed,heroes,items,o,type){
  items=items.filter(i=>i.active!==false);
  const r=makeRng(seed+':ban'),hero=pick(r,heroPool(heroes,o));if(!hero||type==='item'&&!items.length)return null;
  return type==='item'?{hero:hero.id,item:pick(r,items).id}:{hero:hero.id,slot:int(r,1,hero.abilities)};
}

