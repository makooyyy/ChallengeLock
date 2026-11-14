// Seeded PRNG (mulberry32) + helpers. Same seed → same results.
export function hashStr(s){let h=1779033703^s.length;for(let i=0;i<s.length;i++){h=Math.imul(h^s.charCodeAt(i),3432918353);h=h<<13|h>>>19}h=Math.imul(h^h>>>16,2246822507);h=Math.imul(h^h>>>13,3266489909);return(h^=h>>>16)>>>0}
export function mulberry32(a){return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
export const makeRng=s=>mulberry32(hashStr(String(s)));
export const pick=(r,a)=>a[Math.floor(r()*a.length)];
export const int=(r,lo,hi)=>lo+Math.floor(r()*(hi-lo+1));
export const shuffle=(r,a)=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
export const newSeed=()=>Math.random().toString(36).slice(2,8);
export const dailySeed=()=>'daily-'+new Date().toISOString().slice(0,10);
