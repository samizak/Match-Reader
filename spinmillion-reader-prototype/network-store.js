/* Only public sports metadata/prices. No request credentials or raw bodies retained. */
(() => {
const MAX_EVENTS=1500;
const HOST='api-h-c7818b61-608.sptpub.com', BRAND='2620402840463613956';
const clone=x=>JSON.parse(JSON.stringify(x));
const clean=s=>typeof s==='string'?s.slice(0,300):null;
function route(raw){
 try{
 const u=new URL(raw);if(u.protocol!=='https:'||u.hostname!==HOST)return null;
 if(u.pathname==='/api/v1/descriptions/statuses/gb')return {kind:'statuses'};
 const b='/brand/'+BRAND;
 let m=u.pathname.match(new RegExp('^/api/v4/(prematch|live)'+b+'/(?:event/gb/(\\d+)|gb/(\\d+))$'));
 if(m)return {kind:'feed',eventId:m[2]||null,stream:m[1]};
 if(u.pathname==='/api/v3/descriptions'+b+'/markets/gb')return {kind:'definitions'};
 m=u.pathname.match(new RegExp('^/api/v3/descriptions'+b+'/event/(\\d+)/gb$'));
 if(m)return {kind:'eventDefinitions',eventId:m[1]};
 return null;
 }catch{return null;}
}
function merge(target,patch){
 for(const [k,v] of Object.entries(patch||{})){
  if(['__proto__','constructor','prototype'].includes(k))continue;
  if(v===null)delete target[k];
  else if(typeof v==='object'&&!Array.isArray(v)){if(!target[k]||typeof target[k]!=='object'||Array.isArray(target[k]))target[k]={};merge(target[k],v);}
  else target[k]=clone(v);
 }return target;
}
function labels(def){
 if(!def||typeof def!=='object')return null;
 const variants={};
 for(const [key,groups] of Object.entries(def.variants||{})){
  if(!Array.isArray(groups))continue;
  variants[key]=groups.map(g=>({name:clean(g.name),outcomes:(g.outcomes||[]).map(o=>({id:String(o.id),name:clean(o.name),earlyPayout:o.early_payout===true}))}));
 }
 return {name:clean(def.name),marketType:clean(def.market_type),variants};
}
class Store{
 constructor(){this.statuses={};this.sports={};this.categories={};this.tournaments={};this.definitions={};this.eventDefinitions={};this.events={};this.responses=0;this.rejected=0;this.lastCapture=null;this.feeds={};this.eventResponses={};this.captureErrors={};this.droppedGlobalEvents=0;this.evictedEvents=0;}
 ingest(r,data,{observedAt=Date.now()}={}){
 if(!r||!data||typeof data!=='object'||Array.isArray(data))return;
 this.responses++;this.lastCapture=new Date().toISOString();
 if(r.kind==='statuses'){for(const [id,name]of Object.entries(data)){const label=clean(name);if(label)this.statuses[id]=label;}return;}
 if(r.kind==='definitions'||r.kind==='eventDefinitions'){
  const dest=r.kind==='definitions'?this.definitions:(this.eventDefinitions[r.eventId]||={});
  for(const [id,v] of Object.entries(r.kind==='definitions'?data:data.markets||{})){if(v===null)delete dest[id];else if(v&&typeof v==='object')dest[id]=labels(v);}
  return;
 }
 const stream=r.stream||'prematch';
 const counts=this.feeds[stream]||=( {global:0,event:0} );counts[r.eventId?'event':'global']++;
 if(r.eventId && (this.eventResponses[r.eventId]!==undefined||Object.keys(this.eventResponses).length<1500))this.eventResponses[r.eventId]=(this.eventResponses[r.eventId]||0)+1;
 const generated=Number(data.generated);if(!Number.isFinite(generated))return;
 for(const key of ['sports','categories','tournaments'])for(const [id,v] of Object.entries(data[key]||{})){
  if(v===null)delete this[key][id];else this[key][id]={name:clean(v.name),slug:clean(v.slug)};
 }
 for(const [id,patch] of Object.entries(data.events||{})){
  if(patch!==null&&typeof patch!=='object')continue;
  if(!this.events[id]){
   if(Object.keys(this.events).length>=MAX_EVENTS){
    // Broad feeds contain thousands of unrelated fixtures. A response for an
    // explicitly opened event must take priority over those background entries.
    if(r.eventId!==id){this.droppedGlobalEvents++;continue;}
    const keys=Object.keys(this.events);
    const victim=keys.find(key=>!this.eventResponses[key])||keys[0];
    delete this.events[victim];this.evictedEvents++;
   }
   this.events[id]={};
  }
  const sources=this.events[id];
  let ev=sources[stream];
  const fresh=()=>({desc:null,markets:{},state:{},score:{},stateGenerated:0,scoreGenerated:0,clockGenerated:0,generated:0,descGenerated:0,latestGenerated:0,quoteTimes:new Map(),snapshot:false,hasEventResponse:false,epoch:data.epoch??null});
  if(!ev)ev=sources[stream]=fresh();
  // Epochs belong to a feed stream. A live response cannot reset prematch metadata.
  if(ev.epoch!==null && data.epoch!==undefined && ev.epoch!==data.epoch){
   if(generated<ev.latestGenerated){this.rejected++;continue;}
   ev=sources[stream]=fresh();
  }
  ev.epoch=data.epoch??ev.epoch;
  ev.latestGenerated=Math.max(ev.latestGenerated,generated);
  if(patch===null){
   if(generated<Math.max(ev.generated,ev.descGenerated)){this.rejected++;continue;}
   ev.desc=null;ev.markets={};ev.quoteTimes.clear();ev.state={};ev.score={};ev.stateGenerated=generated;ev.scoreGenerated=generated;ev.clockGenerated=generated;ev.snapshot=false;ev.hasEventResponse=false;ev.generated=generated;ev.descGenerated=generated;continue;
  }
  // Metadata and quotes have independent clocks: a delayed initial response can
  // fill missing names without rolling back a newer quote or a deletion.
  if(patch.desc && generated>=ev.descGenerated){const d=patch.desc;ev.desc={scheduled:d.scheduled,sport:String(d.sport),category:String(d.category),tournament:String(d.tournament),slug:clean(d.slug),eventType:clean(d.type),virtual:typeof d.virtual==='boolean'?d.virtual:null,competitors:(d.competitors||[]).map(c=>({id:String(c.id),name:clean(c.name),abbreviation:clean(c.abbreviation),countryCode:clean(c.country_code)}))};ev.descGenerated=generated;}
  for(const key of ['state','score']){
   if(!Object.hasOwn(patch,key))continue;
   const clockKey=key+'Generated';
   if(generated<ev[clockKey]){this.rejected++;continue;}
   const value=patch[key];
   if(value===null)ev[key]={};
   else if(value&&typeof value==='object'&&!Array.isArray(value))merge(ev[key],value);
   else continue;
   ev[clockKey]=generated;
   if(key==='state'&&(value===null||Object.hasOwn(value,'clock')))ev.clockGenerated=generated;
  }
  if(patch.markets && (r.eventId===id||ev.hasEventResponse)){
   if(generated<ev.generated){this.rejected++;continue;}
   if(r.eventId===id){
    ev.hasEventResponse=true;
    if(data.snapshot_complete===true){ev.markets={};ev.quoteTimes.clear();}
    ev.snapshot=ev.snapshot||data.snapshot_complete===true;
   }
   merge(ev.markets,patch.markets);ev.generated=generated;
   // A timestamp advances only for a quote explicitly present in this response,
   // never for another market, a score update, a sidebar read or a local save.
   for(const [mid,variants]of Object.entries(patch.markets))for(const [spec,outcomes]of Object.entries(variants||{}))for(const [oid,value]of Object.entries(outcomes||{})){
    const key=JSON.stringify([mid,spec,oid]);
    if(value===null)ev.quoteTimes.delete(key);
    else if(value&&Object.hasOwn(value,'k')&&Number.isFinite(Number(value.k))&&Number(value.k)>1)ev.quoteTimes.set(key,observedAt);
   }
  }
 }
 }
 diagnostics(id){
  return {cache:{events:Object.keys(this.events).length,limit:MAX_EVENTS,droppedGlobalEvents:this.droppedGlobalEvents,evictedEvents:this.evictedEvents},feeds:clone(this.feeds),rejectedOutOfOrder:this.rejected,captureErrors:clone(this.captureErrors),selectedEvent:{responses:this.eventResponses[id]||0,metadataCaptured:Object.values(this.events[id]||{}).some(e=>!!e.desc)}};
 }
 snapshot(id){
 const sources=Object.entries(this.events[id]||{}).filter(([,e])=>e.desc).sort((a,b)=>b[1].descGenerated-a[1].descGenerated);
 const [stream,ev]=sources[0]||[];const d=ev?.desc;
 const missing={eventId:id||null,available:false,markets:[],warnings:[this.eventResponses[id]?'Event responses were captured but fixture metadata is missing. Copy the diagnostics below.':'No initial response for this event was captured. Reload the match page with the extension loaded; polling responses alone do not contain the fixture.']};
 if(!d)return missing;
 const home=d.competitors?.[0]?.name,away=d.competitors?.[1]?.name;
 const ts=Number(d.scheduled);const validTime=Number.isFinite(ts)&&ts>1000000000&&ts<5000000000;
 const kickoffUTC=validTime?new Date(ts*1000).toISOString():null;
 const sub=(s,spec)=>{
  if(!s)return null;let result=s.replaceAll('{$competitor1}',home||'[unknown home]').replaceAll('{$competitor2}',away||'[unknown away]');
  for(const part of spec.split('|')){const [k,v]=part.split('=');if(k&&v!==undefined)result=result.replaceAll('{'+k+'}',v);}
  return result;
 };
 const markets=[];
 for(const [mid,variants] of Object.entries(ev.markets))for(const [spec,outs] of Object.entries(variants||{})){
  const specific=this.eventDefinitions[id]?.[mid],generic=this.definitions[mid];
  const def=specific||generic;
  const groups=def?.variants?.[spec]||def?.variants?.[''];
  const outcomes=Object.entries(outs||{}).map(([oid,v])=>{
   const description=groups?.flatMap(g=>g.outcomes).find(o=>o.id===oid);
   const n=Number(v?.k),confirmed=ev.quoteTimes.get(JSON.stringify([mid,spec,oid]));return {id:oid,pricesObservedAt:Number.isFinite(confirmed)?new Date(confirmed).toISOString():null,label:sub(description?.name,spec),odds:Number.isFinite(n)&&n>1?n:null,blocked:v?.b??null,earlyPayout:description?.earlyPayout===true};
  });
  markets.push({id:mid,name:def?.name||null,specifiers:spec,outcomes});
 }
 const iso=n=>Number.isFinite(n)&&n>0?new Date(n).toISOString():null;
 const age=n=>n>0?Math.max(0,Math.floor((Date.now()-n)/1000)):null;
 const liveEv=this.events[id]?.live||ev;
 const state=liveEv.state,score=liveEv.score,clock=state.clock||{};
 const goal=v=>typeof v==='number'&&Number.isInteger(v)&&v>=0?String(v):typeof v==='string'&&/^\d{1,4}$/.test(v)?v:null;
 const count=v=>goal(v)===null?null:Number(goal(v));
 const homeScore=goal(score.home_score),awayScore=goal(score.away_score);
 const matchTime=clean(clock.match_time),parsedTime=matchTime?.match(/^(\d{1,3}):([0-5]\d)$/);
 const periodCode=state.match_status??null;
 const statistics={};
 for(const name of ['corners','yellow_cards','red_cards','yellow_red_cards']){
  const v=score.statistics?.[name];if(!v||typeof v!=='object')continue;
  statistics[name]={home:count(v.home),away:count(v.away)};
 }
 const live={
  feedStream:this.events[id]?.live?'live':stream,
  score:homeScore!==null||awayScore!==null?{home:homeScore,away:awayScore}:null,
  matchTime,elapsedMatchSeconds:parsedTime?Number(parsedTime[1])*60+Number(parsedTime[2]):null,
  clockStopped:typeof clock.stopped==='boolean'?clock.stopped:null,
  clockTimestampUTC:typeof clock.timestamp==='number'&&clock.timestamp>1e12&&clock.timestamp<5e12?iso(clock.timestamp):null,
  clockReferenceAgeSeconds:typeof clock.timestamp==='number'&&clock.timestamp>1e12&&clock.timestamp<5e12?age(clock.timestamp):null,
  clockMode:'reported_only_no_extrapolation',
  periodCode,periodLabel:this.statuses[String(periodCode)]||null,statusCode:state.status??null,
  stateGeneratedAt:iso(liveEv.stateGenerated),scoreGeneratedAt:iso(liveEv.scoreGenerated),clockGeneratedAt:iso(liveEv.clockGenerated),
  stateAgeSeconds:age(liveEv.stateGenerated),scoreAgeSeconds:age(liveEv.scoreGenerated),clockAgeSeconds:age(liveEv.clockGenerated),
  statistics,
  periodScores:Array.isArray(score.period_scores)?score.period_scores.slice(0,100).map(p=>({number:p.number??null,periodCode:p.match_status_code??null,periodLabel:this.statuses[String(p.match_status_code)]||null,home:count(p.home_score),away:count(p.away_score)})):[]
 };
 const identityText=[home,away,this.categories[d.category]?.name,this.tournaments[d.tournament]?.name].filter(Boolean).join(' ');
 const teamClassMarkers=[...new Set([...identityText.matchAll(/\b(?:u[- ]?\d{2}|under[- ]?\d{2}|women|ladies|reserves?|youth)\b/gi)].map(m=>m[0]))];
 const identity={sportId:d.sport,categoryId:d.category,homeCompetitorId:d.competitors?.[0]?.id||null,awayCompetitorId:d.competitors?.[1]?.id||null,eventType:d.eventType,participants:d.competitors,teamClassMarkers,teamClass:teamClassMarkers.length?'explicit markers present':'unknown — absence of a marker does not prove senior teams'};
 const warnings=[];
 if(live.feedStream==='live'){
  if(!live.score)warnings.push('Live score has not been captured.');
  if(!live.matchTime)warnings.push('Live match clock has not been captured.');
  if(live.stateAgeSeconds===null||live.stateAgeSeconds>30)warnings.push('Live state is missing or over 30 seconds old; do not treat it as current.');
  if(live.matchTime&&live.clockStopped!==true&&live.clockReferenceAgeSeconds>30)warnings.push('Clock reference is older than 30 seconds. The displayed reference is not a verified running match timer.');
  if(live.matchTime&&(live.clockAgeSeconds===null||live.clockAgeSeconds>30))warnings.push('Reported match clock is over 30 seconds old; it is not advanced automatically.');
 }
 if(!ev.snapshot)warnings.push('Initial event price snapshot not confirmed. Price list may be incomplete.');
 if(!ev.generated||Date.now()-ev.generated>30000)warnings.push('Captured event data is over 30 seconds old; prices may have changed.');
 if(!kickoffUTC)warnings.push('Absolute kickoff missing.');
 if(markets.some(m=>!m.name||m.outcomes.some(o=>!o.label)))warnings.push('Some outcome definitions are missing; those labels are not guessed.');
 warnings.push('Network prices are not accepted bets. No cross-exchange fixture verification yet.');
 return {eventId:id,available:true,...identity,live,scheduledKickoffUTC:kickoffUTC,actualStartUTC:null,actualStartStatus:'Not supplied by the observed feed; scheduled kickoff is not proof of actual start.',wallTimeSinceScheduledSeconds:validTime?Math.floor((Date.now()-ts*1000)/1000):null,home,away,fixture:home&&away?home+' vs '+away:null,sport:this.sports[d.sport]?.name||null,category:this.categories[d.category]?.name||null,competition:this.tournaments[d.tournament]?.name||null,competitionId:d.tournament,virtual:d.virtual,kickoffUTC,kickoffLondon:kickoffUTC?new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',dateStyle:'medium',timeStyle:'short'}).format(new Date(kickoffUTC)):null,feedStream:stream,generatedAt:ev.generated?new Date(ev.generated).toISOString():null,metadataGeneratedAt:new Date(ev.descGenerated).toISOString(),snapshotComplete:ev.snapshot,markets,warnings};
 }
}
globalThis.SpinNetwork={Store,route};
})();
