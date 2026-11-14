// URL hash seed, text export and Canvas card.
export const parseHash=()=>{const p=new URLSearchParams(location.hash.slice(1));return p.get('seed')?{seed:p.get('seed'),d:p.get('d'),r:+p.get('r')||0,p:+p.get('p')||0}:null};
export const linkFor=(x,player)=>`${location.origin}${location.pathname}#seed=${encodeURIComponent(x.seed)}&d=${x.diff}&r=${x.r}${player?'&p='+player:''}`;
export const setHash=x=>{try{history.replaceState(null,'',`#seed=${encodeURIComponent(x.seed)}&d=${x.diff}&r=${x.r}`)}catch(e){}};
export async function copy(s){try{await navigator.clipboard.writeText(s);return true}catch(e){const a=document.createElement('textarea');a.value=s;document.body.append(a);a.select();let ok=false;try{ok=document.execCommand('copy')}catch(_){}a.remove();return ok}}
export function drawCard(cv,{hero,lines,rar,pts,color,foot}){
  cv.width=1080;cv.height=600;const g=cv.getContext('2d');
  g.fillStyle='#070a12';g.fillRect(0,0,1080,600);
  const gr=g.createRadialGradient(850,0,0,850,0,600);gr.addColorStop(0,'rgba(124,92,255,.3)');gr.addColorStop(1,'transparent');g.fillStyle=gr;g.fillRect(0,0,1080,600);
  g.strokeStyle=color;g.lineWidth=3;g.strokeRect(24,24,1032,552);
  g.fillStyle=color;g.font='700 28px Oswald,sans-serif';g.fillText(rar.toUpperCase(),56,80);
  g.fillStyle='#e9edf7';g.font='700 84px Oswald,sans-serif';g.fillText(hero.toUpperCase(),56,170);
  g.font='600 36px Manrope,sans-serif';lines.slice(0,3).forEach((l,i)=>{g.fillStyle='#e9edf7';g.fillText('◆ '+l,56,250+i*64)});
  g.fillStyle='#ffb02e';g.font='700 44px Oswald,sans-serif';g.fillText(pts,56,520);
  g.fillStyle='#98a3bd';g.font='600 18px monospace';g.fillText(foot,56,556);
}
