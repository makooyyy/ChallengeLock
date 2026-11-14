export const CATS=['ab','it','gp','go','tm','ch'];
export const DIFFICULTIES=['easy','mid','hard','insane'];
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
export const strings=x=>Array.isArray(x)?[...new Set(x.filter(v=>typeof v==='string'&&v.length<128))]:[];
export const count=(x,fallback=0)=>Number.isSafeInteger(x)&&x>=0?x:fallback;
export function options(x={}){
  if(!object(x))x={};
  return {diff:DIFFICULTIES.includes(x.diff)?x.diff:'mid',cats:Array.isArray(x.cats)?strings(x.cats).filter(c=>CATS.includes(c)):[...CATS],team:x.team===true,excluded:strings(x.excluded),only:strings(x.only)};
}
export function validRecord(x){return object(x)&&typeof x.seed==='string'&&x.seed.length>0&&x.seed.length<=256&&DIFFICULTIES.includes(x.diff)&&Number.isSafeInteger(x.r)&&x.r>=0&&x.r<=1000000&&typeof x.hero==='string'&&Array.isArray(x.conds)&&x.conds.length>=1&&x.conds.length<=3&&strings(x.conds).length===x.conds.length;}
export function normalizeState(x,def){
  if(!object(x))x={};
  const out={...def,...options({...def,...x})};
  out.lang=x.lang==='en'?'en':'ru';out.sound=typeof x.sound==='boolean'?x.sound:def.sound;
  out.stats=Object.fromEntries(['done','fail','points'].map(k=>[k,count(x.stats?.[k])]));
  out.friend={same:x.friend?.same!==false,player:Number.isInteger(x.friend?.player)?Math.max(1,Math.min(9,x.friend.player)):1};
  for(const k of ['history','favs'])out[k]=(Array.isArray(x[k])?x[k]:[]).filter(validRecord).slice(0,50).map(r=>({...r,points:count(r.points),outcome:['done','fail'].includes(r.outcome)?r.outcome:null}));
  out.heroMode=x.heroMode==='only'?'only':'exclude';
  out.sel=strings(x.sel??(out.heroMode==='only'?out.only:out.excluded));
  return out;
}
export function validateData(data,dict){
  const fail=m=>{throw new Error('Invalid data: '+m)};
  const localized=x=>object(x)&&['ru','en'].every(k=>typeof x[k]==='string'&&x[k].length>0);
  for(const key of ['heroes','items','challenges']){
    const list=data[key];if(!Array.isArray(list)||!list.length)fail(key);
    const ids=new Set();for(const x of list){if(!object(x)||typeof x.id!=='string'||!/^[a-z0-9_-]+$/.test(x.id)||ids.has(x.id))fail(key+' id');ids.add(x.id);}
  }
  for(const h of data.heroes){
    if(typeof h.name!=='string'||!h.name||!/^#[0-9a-f]{6}$/i.test(h.color)||!Number.isInteger(h.abilities)||h.abilities<1||h.abilities>4)fail('hero');
    if(h.icon&&!(typeof h.icon==='string'&&/^https:\/\//.test(h.icon)))fail('hero icon');
  }
  for(const i of data.items)if(typeof i.name!=='string'||!['weapon','vitality','spirit'].includes(i.branch)||!Number.isInteger(i.cost)||i.cost<=0||!Number.isInteger(i.tier)||i.tier<1||i.tier>4)fail('item');
  const heroIds=new Set(data.heroes.map(h=>h.id));
  for(const c of data.challenges)if(!CATS.includes(c.cat)||!localized(c.name)||!localized(c.desc)||!Number.isInteger(c.difficulty)||c.difficulty<1||c.difficulty>5||!Number.isFinite(c.mult)||c.mult<=0||!['solo','team'].includes(c.mode)||!Array.isArray(c.tags)||strings(c.tags).length!==c.tags.length||!Array.isArray(c.conflicts)||strings(c.conflicts).length!==c.conflicts.length||!(c.heroes==='all'||Array.isArray(c.heroes)&&c.heroes.every(id=>heroIds.has(id))))fail('challenge '+c.id);
  if(!object(dict)||!object(dict.ru)||!object(dict.en))fail('translations');
  for(const lang of ['ru','en']){
    if(!Array.isArray(dict[lang].ranks)||dict[lang].ranks.length!==6||!dict[lang].ranks.every(v=>typeof v==='string'))fail('ranks');
    for(const k of Object.keys(dict.ru))if(k!=='ranks'&&typeof dict[lang][k]!=='string')fail('translation '+k);
  }
  return data;
}
