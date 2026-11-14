// Random build: items from 3 branches within a souls budget, sorted into buy order.
import {makeRng,pick,shuffle} from './rng.js';
import {heroPool} from './roulette.js';
export const BRANCHES=['weapon','vitality','spirit'];
export function makeBuild(seed,heroes,items,budget,o){
  const r=makeRng(seed+':build'),hero=pick(r,heroPool(heroes,o));
  if(!hero||!Number.isFinite(budget)||budget<0)return null;
  items=items.filter(i=>i.active!==false);
  const byId=new Map(items.map(i=>[i.id,i]));
  const ancestors=id=>(byId.get(id)?.components||[]).flatMap(parent=>[parent,...ancestors(parent)]);
  let left=budget;const out=[];
  for(let i=0;i<60&&out.length<12;i++){
    const c=shuffle(r,items.filter(x=>x.branch===BRANCHES[i%3]&&!out.includes(x)&&x.cost<=left&&!out.some(y=>ancestors(x.id).includes(y.id)||ancestors(y.id).includes(x.id))))[0];
    if(c){out.push(c);left-=c.cost}
  }
  out.sort((a,b)=>a.tier-b.tier||a.cost-b.cost);
  return{hero:hero.id,budget,spent:budget-left,items:out.map(x=>x.id),seed};
}

