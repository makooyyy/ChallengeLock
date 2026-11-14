// UI: tabs, reels animation, contract, timer, builds, bans, filters, history.
import {S,RT,persist,ALL_CATS,RANKS,rankIdx} from './state.js';
import {t,loc,setDict,setLang} from './i18n.js';
import {roll,rollBan,DIFF} from './roulette.js';
import {makeBuild,BRANCHES} from './builds.js';
import {newSeed,dailySeed,pick} from './rng.js';
import {parseHash,linkFor,setHash,copy,drawCard} from './share.js';

const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const RC={common:'#98a3bd',rare:'#4aa3ff',epic:'#b06bff',cursed:'#ff4d82'},RP={common:'#5b6478',rare:'#1f6fd1',epic:'#7a3fd0',cursed:'#e0245e'};
const BC={weapon:'#ffb02e',vitality:'#4ad3b5',spirit:'#8fa0ff'},CELL=84,ROM=['I','II','III'];
const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches,mob=()=>matchMedia('(max-width:780px)').matches;
const H=id=>RT.data.heroes.find(h=>h.id===id),C=id=>RT.data.challenges.find(c=>c.id===id),I=id=>RT.data.items.find(i=>i.id===id);
const mmss=ms=>{const s=Math.floor(ms/1000);return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0')};
const DIFFS=Object.keys(DIFF);

/* ---------- helpers ---------- */
let tt;function toast(m){const e=$('#toast');e.textContent=m;e.classList.add('on');clearTimeout(tt);tt=setTimeout(()=>e.classList.remove('on'),1800)}
let ac;function beep(f,d=.1){if(!S.sound)return;try{ac??=new (window.AudioContext||window.webkitAudioContext)();const o=ac.createOscillator(),g=ac.createGain();o.frequency.value=f;o.type='square';g.gain.value=.04;g.gain.exponentialRampToValueAtTime(.0001,ac.currentTime+d);o.connect(g).connect(ac.destination);o.start();o.stop(ac.currentTime+d)}catch(e){}}
const dia=h=>`<div class="dia" style="--c:${h.color}"><span>${esc(h.name[0])}</span>${h.icon?`<img class="pic" src="${esc(h.icon)}" alt="" loading="lazy">`:''}</div>`;
const heroCell=(h,m)=>`<div class="cell${m?' mid':''}">${dia(h)}<b>${esc(h.name)}</b></div>`;
const condCell=(c,m)=>`<div class="cell${m?' mid':''}"><div><b>${esc(loc(c.name))}</b><small>${t('cat.'+c.cat)}</small></div></div>`;
const cellHTML=(i,x,m)=>!x?`<div class="cell${m?' mid':''}"><div><b>—</b></div></div>`:i===0?heroCell(x,m):condCell(x,m);
const seg=(arr,cur,attr)=>`<div class="seg" role="group">${arr.map(([v,l])=>`<button data-${attr}="${v}" class="${v==cur?'on':''}" aria-pressed="${v==cur}">${l}</button>`).join('')}</div>`;
const resText=x=>`🎯 Deadlock Challenge — ${H(x.hero).name} [${x.rarity.toUpperCase()}]\n${x.conds.map(id=>'• '+loc(C(id).name)).join('\n')}\n${x.sum}×${x.mult}=${x.points} ${t('pts')}\n${linkFor(x,S.friend.same?0:S.friend.player)}`;

/* ---------- header / shell ---------- */
function paintHeader(){const i=rankIdx(S.stats.points);$('#rank').innerHTML=`<span class="mo">${t('rank')}</span><b style="color:#ffb02e">${t('ranks')[i]}</b><span>${S.stats.points}${RANKS[i+1]?' / '+RANKS[i+1]:''}</span>`;$('#lang').textContent=S.lang==='ru'?'EN':'RU'}
function applyStatic(){$$('[data-i18n]').forEach(e=>e.textContent=t(e.dataset.i18n));$('#foot').textContent=t('footer');paintHeader()}
function show(tab){RT.tab=tab;$$('.nb').forEach(b=>{const on=b.dataset.tab===tab;b.classList.toggle('on',on);b.setAttribute('aria-current',on?'page':'false')});
  $$('.panel').forEach(p=>p.hidden=p.id!=='p-'+tab);({roulette:viewRoulette,build:viewBuild,ban:viewBan,custom:viewCustom,history:viewHistory})[tab]()}

/* ---------- ROULETTE ---------- */
function viewRoulette(){
  const p=$('#p-roulette');
  p.innerHTML=`<div><div class="mo" style="color:#8fa0ff">${t('tab.roulette')}</div><h1 class="os">${t('h1a')} <span class="out">${t('h1b')}</span></h1></div>
  <div class="row"><section class="mach" aria-label="${t('tab.roulette')}"><div class="rg">${[0,1,2,3].map(i=>`<div class="reel" data-i="${i}"><div class="rl mo">${i?t('cond')+' '+ROM[i-1]:t('hero')}</div><div class="vp"><div class="strip"></div></div><button class="lk" data-lock="${i}" aria-pressed="false" aria-label="${t('lock')} ${i?ROM[i-1]:t('hero')}">🔒 <span>${t('lock')}</span></button></div>`).join('')}<div class="pay"></div></div>
  <div class="fx dk"><div class="sw"><button class="spin" id="spin"><span class="si"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 4v4"/></svg></span><span class="st">${t('spin')}<small>SPACE</small></span></button></div>
  <div class="fx" style="align-items:center">${seg(DIFFS.map(d=>[d,t('diff.'+d)]),S.diff,'diff')}<button id="reroll">${t('reroll')} (<span id="rr">${RT.rerolls}</span>)</button><button id="daily">${t('daily')}</button></div></div>
  <div class="fx opts"><label class="chk"><input type="checkbox" id="snd" ${S.sound?'checked':''}> ${t('soundOn')}</label><label class="chk"><input type="checkbox" id="fsame" ${S.friend.same?'checked':''}> ${t('sameHero')}</label><label class="chk">${t('player')}<input type="number" id="fpl" min="1" max="9" value="${S.friend.player}" class="num"></label><span class="mo">${t('keys')}</span></div></section>
  <section class="paper" id="contract" aria-live="polite"></section></div>`;
  paintReels(RT.cur,false);paintContract();
}
function paintReels(res,anim){
  const ps=[];
  for(let i=0;i<4;i++){
    const st=$(`.reel[data-i="${i}"] .strip`);if(!st)continue;
    const win=res?(i===0?H(res.hero):C(res.conds[i-1])):null,pool=i===0?RT.data.heroes:RT.data.challenges;
    const spin=anim&&!reduce&&!RT.locks[i]&&win,L=spin?16+i*4:1;
    let h='';for(let k=0;k<L;k++)h+=cellHTML(i,pick(Math.random,pool),false);
    h+=cellHTML(i,win,true)+cellHTML(i,pick(Math.random,pool),false);st.innerHTML=h;
    const off=(mob()?L:L-1)*CELL;st.style.transform=`translateY(-${off}px)`;
    $(`.reel[data-i="${i}"] .lk`).classList.toggle('on',RT.locks[i]);
    if(spin)ps.push(st.animate([{transform:'translateY(0)'},{transform:`translateY(-${off}px)`}],{duration:1300+i*380,easing:'cubic-bezier(.12,.72,.12,1)'}).finished);
  }
  return Promise.all(ps);
}
function paintContract(){
  const el=$('#contract');if(!el)return;const x=RT.cur;
  if(!x){el.innerHTML=`<div class="mo" style="color:#4a5370">${t('empty')}</div>`;return}
  const h=H(x.hero),col=RP[x.rarity],fav=S.favs.some(f=>f.seed===x.seed&&f.r===x.r&&f.diff===x.diff);
  el.innerHTML=`<div class="mo" style="color:#4a5370">seed ${esc(x.seed)} · r${x.r}</div><h2 class="os" style="font-size:30px;margin:6px 0 10px">${esc(h.name)}</h2><span class="stamp" style="color:${col};border-color:${col}">${t('rar.'+x.rarity)}</span>
  ${x.conds.map((id,i)=>{const c=C(id);return `<div class="cl"><i></i><div style="flex:1">${ROM[i]}. ${esc(loc(c.name))}<small>${esc(loc(c.desc))}</small></div><span>x${c.mult}</span></div>`}).join('')}
  <div class="fx" style="justify-content:space-between;align-items:baseline;margin:14px 0"><span class="mo" style="color:#4a5370">${t('reward')}</span><b class="os" style="font-size:26px">${x.sum} × ${x.mult} = ${x.points} ${t('pts')}</b></div>
  <div class="fx" style="gap:8px"><button class="pb" id="done" ${RT.finished?'disabled':''}>${t('done')}</button><button class="pb o" id="failb" ${RT.finished?'disabled':''}>${t('fail')}</button></div>
  <div class="fx" style="justify-content:space-between;margin-top:14px;align-items:center"><b id="tm" class="mono-t">${mmss(RT.timer.ms)}</b><div class="fx" style="gap:6px"><button class="pb o sm" id="tgl">${RT.timer.run?t('pause'):t('start')}</button><button class="pb o sm" id="fav" aria-pressed="${fav}">${fav?'★':'☆'}</button></div></div>
  <div class="fx" style="gap:6px;margin-top:10px"><button class="pb o sm" id="cl">${t('copyLink')}</button><button class="pb o sm" id="ct">${t('copyText')}</button><button class="pb o sm" id="cp">${t('png')}</button></div>`;
}
function particles(col){const m=$('.mach');if(!m||reduce)return;for(let i=0;i<26;i++){const s=document.createElement('i');s.className='pt';s.style.cssText=`--x:${(Math.random()-.5)*500}px;--y:${-Math.random()*260}px;background:${col};left:50%;top:50%`;m.append(s);setTimeout(()=>s.remove(),1000)}}
async function doRoll(reroll,opt={}){
  if(RT.busy)return;let prev=null;
  if(reroll){if(!RT.cur)return;if(RT.rerolls<=0)return toast(t('noRerolls'));RT.rerolls--;RT.r++;prev=RT.cur}
  else{RT.seed=opt.seed||newSeed();RT.r=opt.r||0;RT.rerolls=RT.maxRerolls;RT.locks=[false,false,false,false]}
  let res;try{res=roll({seed:RT.seed,r:RT.r,heroes:RT.data.heroes,challenges:RT.data.challenges,o:S,locks:RT.locks,prev,player:S.friend.player,same:S.friend.same})}catch(e){console.error(e);return toast(t('error'))}
  if(!res)return toast(t('error'));
  RT.cur=res;RT.finished=false;RT.timer={ms:0,run:false,t0:0};
  const last=S.history[0];if(reroll&&last&&last.seed===res.seed&&!last.outcome)S.history[0]=res;else S.history.unshift(res);S.history.length=Math.min(S.history.length,50);persist();setHash(res);
  if(RT.tab!=='roulette')show('roulette');else{const rr=$('#rr');if(rr)rr.textContent=RT.rerolls}
  RT.busy=true;beep(330);paintContract();
  try{await paintReels(res,true)}catch(e){}
  RT.busy=false;beep(res.rarity==='cursed'?160:660,.18);
  if(res.rarity==='epic'||res.rarity==='cursed'){particles(RC[res.rarity]);if(!reduce){const m=$('.mach');m.classList.add('shake');setTimeout(()=>m.classList.remove('shake'),450)}}
}
function finish(o){const x=RT.cur;if(!x||RT.finished)return;RT.finished=true;RT.timer.run=false;x.outcome=o;
  if(o==='done'){S.stats.done++;S.stats.points+=x.points}else S.stats.fail++;persist();paintContract();paintHeader();beep(o==='done'?880:140,.2)}
setInterval(()=>{const T=RT.timer;if(T.run){T.ms=Date.now()-T.t0;const e=$('#tm');if(e)e.textContent=mmss(T.ms)}},250);
async function png(){const x=RT.cur;if(!x)return;const cv=document.createElement('canvas');
  try{await document.fonts.ready}catch(e){}
  drawCard(cv,{hero:H(x.hero).name,lines:x.conds.map(id=>loc(C(id).name)),rar:t('rar.'+x.rarity),pts:`${x.points} ${t('pts')}`,color:RC[x.rarity],foot:`seed ${x.seed} · Deadlock Challenge Roulette`});
  cv.toBlob(b=>{if(!b)return toast(t('error'));const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=`dlr-${x.seed}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000)})}

/* ---------- BUILD ---------- */
function viewBuild(){
  const b=RT.build,p=$('#p-build');
  p.innerHTML=`<div><div class="mo" style="color:#8fa0ff">${t('tab.build')}</div><h1 class="os">${t('tab.build')}</h1></div>
  <div class="fx" style="align-items:center"><label class="chk">${t('budget')} <select id="bud">${[2500,5000,8000].map(v=>`<option ${v==(RT.budget||5000)?'selected':''}>${v}</option>`).join('')}</select></label><button class="spin small" id="rb">${t('build')}</button>${b?`<button id="cb">${t('copyText')}</button>`:''}</div>
  ${b?`<div class="card"><div class="fx" style="align-items:center">${dia(H(b.hero))}<h2 class="os">${esc(H(b.hero).name)}</h2><span class="mo">${t('spent')}: ${b.spent}/${b.budget}</span></div><div class="mo" style="margin:14px 0 6px">${t('order')}</div><ol class="ol">${b.items.map(id=>{const i=I(id);return `<li><i style="background:${BC[i.branch]}"></i><b>${esc(i.name)}</b><span class="mo">${i.branch} · T${i.tier}</span><span>${i.cost}</span></li>`}).join('')}</ol></div>`:`<div class="mo">${t('empty')}</div>`}`;
}
/* ---------- BAN ---------- */
function viewBan(){
  const b=RT.ban,p=$('#p-ban');
  p.innerHTML=`<div><div class="mo" style="color:#8fa0ff">${t('tab.ban')}</div><h1 class="os">${t('tab.ban')}</h1></div>
  <div class="fx"><button class="spin small" data-ban="ability">${t('banAbility')}</button><button class="spin small" data-ban="item">${t('banItem')}</button></div>
  ${b?`<div class="card"><div class="fx" style="align-items:center">${dia(H(b.hero))}<h2 class="os">${esc(H(b.hero).name)}</h2></div><p class="big">⛔ ${b.slot?t('slot')+b.slot:esc(I(b.item).name)}</p><button id="cb2">${t('copyText')}</button></div>`:`<div class="mo">${t('empty')}</div>`}`;
}
/* ---------- CUSTOM ---------- */
function applyHeroSel(){S.excluded=S.heroMode==='exclude'?S.sel.slice():[];S.only=S.heroMode==='only'?S.sel.slice():[];persist()}
function viewCustom(){
  const p=$('#p-custom');
  p.innerHTML=`<div><div class="mo" style="color:#8fa0ff">${t('tab.custom')}</div><h1 class="os">${t('tab.custom')}</h1></div>
  <div class="card"><div class="mo">${t('cats')}</div><div class="fx" style="margin-top:10px">${ALL_CATS.map(c=>`<label class="chk"><input type="checkbox" data-cat="${c}" ${S.cats.includes(c)?'checked':''}> ${t('cat.'+c)}</label>`).join('')}<label class="chk"><input type="checkbox" id="team" ${S.team?'checked':''}> ${t('cat.tm')}: team</label></div></div>
  <div class="card"><div class="fx" style="justify-content:space-between;align-items:center"><div class="mo">${t('heroFilter')}</div>${seg([['exclude',t('exclude')],['only',t('onlyHeroes')]],S.heroMode,'hm')}<button id="hreset">${t('reset')}</button></div>
  <div class="hg">${RT.data.heroes.map(h=>`<label class="hc"><input type="checkbox" data-h="${h.id}" ${S.sel.includes(h.id)?'checked':''}>${dia(h)}<span>${esc(h.name)}</span></label>`).join('')}</div></div>`;
}
/* ---------- HISTORY ---------- */
function viewHistory(){
  const p=$('#p-history'),row=x=>`<li><a href="${linkFor(x)}"><b>${esc(H(x.hero)?.name||x.hero)}</b> <span style="color:${RC[x.rarity]}">${t('rar.'+x.rarity)}</span><small>${x.conds.map(id=>esc(loc(C(id)?.name||id))).join(' · ')}</small></a><span class="mo">${x.outcome==='done'?'✔ +'+x.points:x.outcome==='fail'?'✘':t('pending')}</span></li>`;
  p.innerHTML=`<div><div class="mo" style="color:#8fa0ff">${t('tab.history')}</div><h1 class="os">${t('stats')}</h1></div>
  <div class="fx stat"><div class="card"><span class="mo">${t('won')}</span><b class="os">${S.stats.done}</b></div><div class="card"><span class="mo">${t('lost')}</span><b class="os">${S.stats.fail}</b></div><div class="card"><span class="mo">${t('total')}</span><b class="os">${S.stats.points}</b></div></div>
  <div class="card"><div class="mo">${t('favs')}</div><ul class="hl">${S.favs.map(row).join('')||`<li class="mo">${t('noHist')}</li>`}</ul></div>
  <div class="card"><div class="mo">${t('hist')}</div><ul class="hl">${S.history.map(row).join('')||`<li class="mo">${t('noHist')}</li>`}</ul></div>`;
}

/* ---------- events ---------- */
function bind(){
  document.addEventListener('click',async e=>{
    const b=e.target.closest('button');if(!b)return;const d=b.dataset;
    if(d.tab)return show(d.tab);
    if(b.id==='lang'){S.lang=S.lang==='ru'?'en':'ru';setLang(S.lang);persist();applyStatic();return show(RT.tab)}
    if(b.id==='spin')return doRoll(false);
    if(b.id==='reroll')return doRoll(true);
    if(b.id==='daily')return doRoll(false,{seed:dailySeed()});
    if(d.diff){S.diff=d.diff;persist();return $$('[data-diff]').forEach(x=>{x.classList.toggle('on',x===b);x.setAttribute('aria-pressed',x===b)})}
    if(d.lock!==undefined){const i=+d.lock;RT.locks[i]=!RT.locks[i];b.classList.toggle('on',RT.locks[i]);return b.setAttribute('aria-pressed',RT.locks[i])}
    if(b.id==='done')return finish('done');if(b.id==='failb')return finish('fail');
    if(b.id==='tgl'){const T=RT.timer;T.run=!T.run;if(T.run)T.t0=Date.now()-T.ms;return paintContract()}
    if(b.id==='fav'){const x=RT.cur,k=f=>f.seed===x.seed&&f.r===x.r&&f.diff===x.diff;S.favs=S.favs.some(k)?S.favs.filter(f=>!k(f)):[{...x},...S.favs].slice(0,50);persist();return paintContract()}
    if(b.id==='cl')return toast(await copy(linkFor(RT.cur,S.friend.same?0:S.friend.player))?t('copied'):t('error'));
    if(b.id==='ct')return toast(await copy(resText(RT.cur))?t('copied'):t('error'));
    if(b.id==='cp')return png();
    if(b.id==='rb'){RT.budget=+$('#bud').value;RT.build=makeBuild(newSeed(),RT.data.heroes,RT.data.items,RT.budget,S);return viewBuild()}
    if(b.id==='cb'){const x=RT.build;return toast(await copy(`🛠 ${H(x.hero).name}\n${x.items.map((id,i)=>`${i+1}. ${I(id).name}`).join('\n')}`)?t('copied'):t('error'))}
    if(d.ban){RT.ban=rollBan(newSeed(),RT.data.heroes,RT.data.items,S,d.ban);return viewBan()}
    if(b.id==='cb2'){const x=RT.ban;return toast(await copy(`⛔ ${H(x.hero).name}: ${x.slot?t('slot')+x.slot:I(x.item).name}`)?t('copied'):t('error'))}
    if(d.hm){S.heroMode=d.hm;applyHeroSel();return viewCustom()}
    if(b.id==='hreset'){S.sel=[];applyHeroSel();return viewCustom()}
  });
  document.addEventListener('change',e=>{const i=e.target;
    if(i.dataset.cat){S.cats=$$('[data-cat]').filter(x=>x.checked).map(x=>x.dataset.cat);if(!S.cats.length){S.cats=[i.dataset.cat];i.checked=true}persist()}
    else if(i.id==='team'){S.team=i.checked;persist()}
    else if(i.dataset.h){S.sel=$$('[data-h]').filter(x=>x.checked).map(x=>x.dataset.h);applyHeroSel()}
    else if(i.id==='snd'){S.sound=i.checked;persist()}
    else if(i.id==='fsame'){S.friend.same=i.checked;persist()}
    else if(i.id==='fpl'){S.friend.player=Math.max(1,Math.min(9,+i.value||1));persist()}});
  document.addEventListener('keydown',e=>{
    if(RT.tab!=='roulette'||e.ctrlKey||e.metaKey||e.altKey||e.target.closest('input,select,textarea'))return;
    if(e.code==='Space'&&!e.target.closest('button,a')){e.preventDefault();doRoll(false)}
    else if(e.code==='KeyR')doRoll(true);
    else if(e.code==='KeyL'){const b=$('[data-lock="0"]');if(b)b.click()}});
  addEventListener('hashchange',()=>{const h=parseHash();if(h&&h.seed!==RT.seed||h&&h.r!==RT.r)fromHash(h)});
  matchMedia('(max-width:780px)').addEventListener('change',()=>{if(RT.tab==='roulette')paintReels(RT.cur,false)});
}
function fromHash(h){if(DIFF[h.d])S.diff=DIFF[h.d]?h.d:S.diff;if(h.p){S.friend.player=h.p;S.friend.same=false}RT.tab='roulette';doRoll(false,{seed:h.seed,r:h.r})}

/* ---------- boot ---------- */
export async function boot(){
  try{
    const j=u=>fetch(u).then(r=>{if(!r.ok)throw new Error(u+' '+r.status);return r.json()});
    const [h,i,c,l]=await Promise.all([j('data/heroes.json'),j('data/items.json'),j('data/challenges.json'),j('data/i18n.json')]);
    RT.data={heroes:h.heroes,items:i.items,challenges:c.challenges};setDict(l,S.lang);setLang(S.lang);
  }catch(e){console.error(e);$('#boot').innerHTML=`<div class="err" role="alert">Не удалось загрузить данные / Failed to load data</div>`;return}
  S.sel??=[];S.heroMode??='exclude';$('#boot').remove();$('#app').hidden=false;
  bind();applyStatic();
  const h=parseHash();h?fromHash(h):show('roulette');
  if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
}
