// Deadlock clipboard format: Base64(Zstandard frame(CMsgHeroBuild protobuf)).
// Schema: SteamTracking/Protobufs/deadlock/citadel_gcmessages_common.proto.
// Zstandard raw blocks are defined by RFC 8878; no server or runtime dependency is needed.
import {restoreBuild} from './builds.js';
const utf8=new TextEncoder();
const uint32=n=>{if(!Number.isSafeInteger(n)||n<0||n>0xffffffff)throw new Error('Invalid uint32');return n};
function variable(n){uint32(n);const out=[];while(n>=128){out.push(n%128+128);n=Math.floor(n/128)}out.push(n);return out}
const number=(field,n)=>[...variable(field*8),...variable(n)];
const bytes=(field,b)=>[...variable(field*8+2),...variable(b.length),...b];
const text=(field,s)=>bytes(field,utf8.encode(s));
export function encodeGameBuild(build,heroes,items){
 const valid=restoreBuild(build,heroes,items);if(!valid)throw new Error('Invalid build');
 const hero=heroes.find(h=>h.id===valid.hero);if(!hero.apiId)throw new Error('Missing game hero ID');uint32(hero.apiId);
 const stage={lane:'Laning',mid:'Mid game',full:'Full game'}[valid.settings.stage];
 const names=['Start & foundation','Power spikes','Final purchases'];const groups=[];
 for(const id of valid.items){const item=items.find(i=>i.id===id);if(!item?.apiId)throw new Error('Missing game item ID');uint32(item.apiId);const phase=item.tier<=2?0:item.tier===3?1:2;
  let group=groups.at(-1);if(!group||group.phase!==phase){group={phase,items:[]};groups.push(group)}group.items.push(item);
 }
 const details=groups.flatMap(group=>bytes(1,[...group.items.flatMap(item=>bytes(1,number(1,item.apiId))),...text(2,names[group.phase])]));
 // Omit published/local build IDs, account IDs and ability order: this is a new item build.
 const payload=new Uint8Array([...number(2,hero.apiId),...text(5,`ChallengeLock | ${hero.name} | ${stage}`),...text(6,`Experimental ${valid.settings.focus} build. Budget: ${valid.budget} souls; items: ${valid.spent} souls. Purchase order from ChallengeLock.`),...number(7,0),...number(8,0),...bytes(10,details)]);
 if(payload.length>16000)throw new Error('Game build exceeds 16000 bytes');return payload;
}
export function zstdFrame(payload){
 if(!(payload instanceof Uint8Array)||payload.length>16000)throw new Error('Invalid frame payload');
 const size=payload.length,content=size<256?[0x20,size]:[0x60,(size-256)&255,(size-256)>>>8];
 const block=size*8+1; // Last block, Raw_Block, exact byte count.
 return new Uint8Array([0x28,0xb5,0x2f,0xfd,...content,block&255,(block>>>8)&255,(block>>>16)&255,...payload]);
}
export function gameBuildCode(build,heroes,items){const frame=zstdFrame(encodeGameBuild(build,heroes,items));return btoa(String.fromCharCode(...frame))}
