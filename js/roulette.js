// Challenge generator with compatibility + conflict rules (see data/challenges.json).
import {makeRng,pick,int,shuffle} from './rng.js';
export const DIFF={easy:{n:[1,1],max:2},mid:{n:[1,2],max:3},hard:{n:[2,3],max:4},insane:{n:[3,3],max:5}};
export const rarity=s=>s<=3?'common':s<=6?'rare':s<=9?'epic':'cursed';
/** Two challenges coexist if neither lists a tag the other carries. */
export const compatible=(a,b)=>a.id!==b.id&&!a.conflicts.some(t=>b.tags.includes(t))&&!b.conflicts.some(t=>a.tags.includes(t));
export function heroPool(heroes,f){let p=heroes.filter(h=>!f.excluded.includes(h.id));if(f.only.length)p=p.filter(h=>f.only.includes(h.id));return p.length?p:heroes}
const ok=(c,hero,o)=>o.cats.includes(c.cat)&&c.difficulty<=DIFF[o.diff].max&&(c.mode!=='team'||o.team)&&(c.heroes==='all'||c.heroes.includes(hero.id));
/** roll(): deterministic by seed+reroll counter. Locked parts are copied from prev. */
export function roll({seed,r=0,heroes,challenges,o,locks=[],prev=null,player=0,same=true}){
  const rng=makeRng(`${seed}:${o.diff}:${r}`);
  const hr=makeRng(`${seed}${same?'':'#'+player}:${o.diff}:${r}:h`);
  const pool=heroPool(heroes,o);
  const hero=prev&&locks[0]?heroes.find(h=>h.id===prev.hero):pick(hr,pool);
  const [lo,hi]=DIFF[o.diff].n,n=prev?prev.conds.length:int(rng,lo,hi);
  const conds=[];
  for(let i=0;i<n;i++)if(prev&&locks[i+1])conds[i]=challenges.find(c=>c.id===prev.conds[i]);
  const cand=shuffle(rng,challenges.filter(c=>ok(c,hero,o)));
  for(let i=0;i<n;i++){if(conds[i])continue;
    const c=cand.find(x=>conds.every(y=>!y||compatible(x,y)));
    if(c)conds[i]=c;}
  const list=conds.filter(Boolean);
  if(!list.length)return null;
  const sum=list.reduce((a,c)=>a+c.difficulty,0),mult=list.reduce((a,c)=>a*c.mult,1);
  return{seed,r,diff:o.diff,hero:hero.id,conds:list.map(c=>c.id),sum,mult:+mult.toFixed(2),points:Math.round(sum*mult),rarity:rarity(sum),ts:Date.now(),outcome:null};
}
/** Ban mode: hero + one ability slot or one item. */
export function rollBan(seed,heroes,items,o,type){
  const r=makeRng(seed+':ban'),hero=pick(r,heroPool(heroes,o));
  return type==='item'?{hero:hero.id,item:pick(r,items).id}:{hero:hero.id,slot:int(r,1,hero.abilities)};
}
