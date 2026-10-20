/* Matchbook public event/market responses only. No credentials or trading API. */
(() => {
 const HOSTS=new Set(['api.matchbook.com','www.matchbook.com','matchbook.com']);
 const clean=v=>typeof v==='string'?v.slice(0,1000):null;
 const id=v=>typeof v==='string'&&/^\d+$/.test(v)?v:typeof v==='number'&&Number.isSafeInteger(v)&&v>=0?String(v):null;
 const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
 const iso=v=>typeof v==='string'&&/(?:Z|[+-]\d{2}:\d{2})$/i.test(v)&&Number.isFinite(Date.parse(v))?new Date(v).toISOString():null;
 const num=v=>(typeof v==='number'||typeof v==='string'&&v.trim()!=='')&&Number.isFinite(Number(v))?Number(v):null;
 const enums=(value,allowed)=>allowed.includes(value)?value:null;
 const upper=v=>typeof v==='string'?v.toUpperCase():null;
 function route(raw){
  try{
   const u=new URL(raw);if(u.protocol!=='https:'||!HOSTS.has(u.hostname))return null;
   const m=u.pathname.match(/^\/edge\/rest\/events(?:\/(\d+)(?:\/markets(?:\/(\d+)(?:\/runners(?:\/(\d+)(\/prices)?)?)?)?)?)?\/?$/);if(!m)return null;
   const p=u.pathname.replace(/\/$/,'');
   const kind=m[4]?'prices':m[3]?'runner':p.endsWith('/runners')?'runners':m[2]?'market':p.endsWith('/markets')?'markets':m[1]?'event':'events';
   return {kind,eventId:m[1]||null,marketId:m[2]||null,runnerId:m[3]||null,
    oddsType:enums(u.searchParams.get('odds-type')?.toUpperCase(),['DECIMAL','US','HK','MALAY','INDO','%']),
    exchangeType:enums(u.searchParams.get('exchange-type'),['back-lay','binary']),
    currency:enums(u.searchParams.get('currency')?.toUpperCase(),['GBP','EUR','USD','AUD','CAD','HKD']),
    side:enums(u.searchParams.get('side'),['back','lay','win','lose']),priceMode:enums(u.searchParams.get('price-mode'),['expanded','aggregated'])};
  }catch{return null;}
 }
 function eventIdFromURL(raw){
  try{const u=new URL(raw);if(!['www.matchbook.com','matchbook.com'].includes(u.hostname)||u.protocol!=='https:')return null;
   const ids=[...new Set(u.pathname.split('/').filter(x=>/^\d{6,20}$/.test(x)))];return ids.length===1?ids[0]:null;
  }catch{return null;}
 }
 const markers=s=>[...new Set([...s.matchAll(/\b(?:u[- ]?\d{2}|under[- ]?\d{2}|women|ladies|reserves?|youth)\b/gi)].map(m=>m[0]))];
 class Store{
  constructor(){this.events=new Map();this.responses=0;this.rejected=0;this.lastCapture=null;this.captureErrors={};this.routes={};this.eventResponses={};this.schema={};this.limited=0;}
  ensure(eid,priority=false){
   if(!eid)return null;
   if(!this.events.has(eid)){
    if(this.events.size>=200){if(!priority){this.limited++;return null;}this.events.delete(this.events.keys().next().value);}
    this.events.set(eid,{id:eid,metadata:null,metadataOrder:-Infinity,markets:new Map()});
   }return this.events.get(eid);
  }
  ingest(r,data,{requestStartedAt,observedAt=Date.now()}={}){
   if(!r||!data||typeof data!=='object')return;
   const order=Number.isFinite(requestStartedAt)?requestStartedAt:observedAt;
   const observed=new Date(observedAt).toISOString();this.responses++;this.lastCapture=observed;this.routes[r.kind]=(this.routes[r.kind]||0)+1;
   if(r.eventId)this.eventResponses[r.eventId]=(this.eventResponses[r.eventId]||0)+1;
   // Safe schema summaries: fixed, recognized keys and counts only, never bodies.
   const keys=['events','event','markets','runners','prices','id','name','start','meta-tags','event-participants','errors'];
   this.schema[r.kind]={recognizedKeys:keys.filter(k=>own(data,k)),arrayResponse:Array.isArray(data)};
   const list=(value,key)=>Array.isArray(value)?value:Array.isArray(value?.[key])?value[key]:[];
   if(r.kind==='events')for(const e of list(data,'events'))this.readEvent(e,r,order,observed);
   else if(r.kind==='event'){
    const es=list(data,'events');for(const e of es.length?es:[data.event||data])this.readEvent(e,r,order,observed);
   }else{
    const ev=this.ensure(r.eventId,true);if(!ev)return;
    if(r.kind==='markets'||r.kind==='market')for(const m of r.kind==='market'?[data.market||data]:list(data,'markets'))this.readMarket(ev,m,r,order,observed);
    else{
     const market=this.ensureMarket(ev,r.marketId);if(!market)return;
     if(r.kind==='runners'||r.kind==='runner')for(const runner of r.kind==='runner'?[data.runner||data]:list(data,'runners'))this.readRunner(market,runner,r,order,observed);
     else if(r.kind==='prices'){
      const runner=this.ensureRunner(market,r.runnerId);if(runner)this.readPrices(runner,list(data,'prices'),r,order,observed);
     }
    }
   }
  }
  readEvent(data,r,order,observed){
   if(!data||typeof data!=='object')return;const eid=id(data.id);if(!eid||r.eventId&&eid!==r.eventId)return;
   const ev=this.ensure(eid,r.eventId===eid);if(!ev)return;
   if(order>=ev.metadataOrder){
    const m=ev.metadata||{};
    for(const k of ['name','start','status'])if(own(data,k))m[k]=clean(data[k]);
    if(own(data,'sport-id'))m.sportId=id(data['sport-id']);
    if(own(data,'live'))m.isLive=typeof data.live==='boolean'?data.live:null;
    if(own(data,'in-running-flag'))m.inRunning=typeof data['in-running-flag']==='boolean'?data['in-running-flag']:null;
    if(own(data,'meta-tags'))m.tags=Array.isArray(data['meta-tags'])?data['meta-tags'].slice(0,100).map(t=>({id:id(t.id),name:clean(t.name),type:clean(t.type)})):[];
    if(own(data,'event-participants'))m.participants=Array.isArray(data['event-participants'])?data['event-participants'].slice(0,100).map(p=>({id:id(p.id),name:clean(p.name),role:clean(p.role)})):[];
    ev.metadata=m;ev.metadataOrder=order;ev.observedAt=observed;
   }else this.rejected++;
   if(Array.isArray(data.markets))for(const m of data.markets)this.readMarket(ev,m,r,order,observed);
  }
  ensureMarket(ev,mid){
   if(!mid)return null;if(!ev.markets.has(mid)){if(ev.markets.size>=500){this.limited++;return null;}ev.markets.set(mid,{id:mid,order:-Infinity,runners:new Map()});}return ev.markets.get(mid);
  }
  readMarket(ev,data,r,order,observed){
   if(!data||typeof data!=='object')return;const mid=id(data.id);if(!mid||r.marketId&&mid!==r.marketId||own(data,'event-id')&&id(data['event-id'])!==ev.id)return;
   const m=this.ensureMarket(ev,mid);if(!m)return;
   if(order>=m.order){for(const key of ['name','status','market-type','type','start'])if(own(data,key))m[key]=clean(data[key]);m.order=order;m.observedAt=observed;}else this.rejected++;
   if(Array.isArray(data.runners))for(const runner of data.runners)this.readRunner(m,runner,r,order,observed);
  }
  ensureRunner(m,rid){
   if(!rid)return null;if(!m.runners.has(rid)){if(m.runners.size>=500){this.limited++;return null;}m.runners.set(rid,{id:rid,order:-Infinity,priceOrder:-Infinity,prices:[],context:null});}return m.runners.get(rid);
  }
  readRunner(m,data,r,order,observed){
   if(!data||typeof data!=='object')return;const rid=id(data.id);if(!rid||r.runnerId&&rid!==r.runnerId||own(data,'market-id')&&id(data['market-id'])!==m.id||own(data,'event-id')&&r.eventId&&id(data['event-id'])!==r.eventId)return;
   const runner=this.ensureRunner(m,rid);if(!runner)return;
   if(order>=runner.order){for(const key of ['name','status'])if(own(data,key))runner[key]=clean(data[key]);runner.participantId=id(data['event-participant-id']);runner.order=order;}else this.rejected++;
   if(Array.isArray(data.prices))this.readPrices(runner,data.prices,r,order,observed);
  }
  readPrices(runner,prices,r,order,observed){
   if(order<runner.priceOrder){this.rejected++;return;}
   const context=JSON.stringify([r.currency,r.oddsType,r.exchangeType,r.priceMode]);
   const projected=prices.slice(0,100).filter(p=>p&&typeof p==='object').map(p=>{
    const side=own(p,'side')?enums(p.side,['back','lay','win','lose']):r.side;
    const decimal=num(p['decimal-odds']),raw=num(p.odds)??decimal;
    const oddsType=own(p,'odds-type')?enums(upper(p['odds-type']),['DECIMAL','US','HK','MALAY','INDO','%']):r.oddsType;
    const exchangeType=r.exchangeType;const amount=num(p['available-amount']);
    return {side,rawOdds:raw,odds:side&&['back','lay'].includes(side)&&exchangeType!=='binary'?(decimal!==null&&decimal>1?decimal:oddsType==='DECIMAL'&&raw!==null&&raw>1?raw:null):null,availableAmount:amount!==null&&amount>=0?amount:null,currency:own(p,'currency')?enums(upper(p.currency),['GBP','EUR','USD','AUD','CAD','HKD']):r.currency,oddsType,exchangeType,priceMode:r.priceMode,observedAt:observed};
   });
   if(prices.length>100)this.limited++;
   runner.prices=r.side&&runner.context===context?[...runner.prices.filter(p=>p.side!==r.side),...projected]:projected;
   runner.context=context;runner.priceOrder=order;runner.pricesObservedAt=observed;
  }
  diagnostics(eid){return {cache:{events:this.events.size,limit:200,limitedRecords:this.limited},routes:{...this.routes},schema:JSON.parse(JSON.stringify(this.schema)),rejectedOutOfOrder:this.rejected,captureErrors:{...this.captureErrors},selectedEvent:{responses:this.eventResponses[eid]||0,metadataCaptured:!!this.events.get(eid)?.metadata?.name}};}
  snapshot(eid){
   const ev=this.events.get(eid),d=ev?.metadata;
   if(!d?.name)return {source:'Matchbook',eventId:eid||null,available:false,markets:[],warnings:['No metadata captured for the event ID in this page URL. Reload the Matchbook event page with the reader loaded.']};
   const tags=d.tags||[],tag=type=>{const values=tags.filter(t=>t.type?.toUpperCase()===type);return values.length===1?values[0]:null;};
   const names=d.name.split(/\s+(?:vs?\.?)\s+/i),home=names.length===2?names[0]:null,away=names.length===2?names[1]:null;
   const kickoffUTC=iso(d.start),competition=tag('COMPETITION')?.name||null,sport=tag('SPORT')?.name||null;
   const teamClassMarkers=markers([d.name,competition].filter(Boolean).join(' '));
   const markets=[...ev.markets.values()].map(m=>({id:m.id,name:m.name||null,status:m.status||null,marketType:m['market-type']||null,type:m.type||null,settlementScope:'Unverified — market rules must be checked.',observedAt:m.observedAt||null,outcomes:[...m.runners.values()].map(o=>({id:o.id,label:o.name||null,status:o.status||null,participantId:o.participantId||null,prices:o.prices,pricesObservedAt:o.pricesObservedAt||null}))}));
   const warnings=['Capture only. Fixture identity and market settlement have not been verified against another bookmaker.','Matchbook betslip and accepted orders are not read by this version.'];
   if(!kickoffUTC)warnings.push('Scheduled kickoff with an explicit timezone is missing.');
   if(!competition)warnings.push('A unique competition tag has not been captured. Competition is not inferred from team names.');
   if(markets.some(m=>m.outcomes.some(o=>o.prices.some(p=>p.odds===null||!p.currency))))warnings.push('Some prices have unverified format, side or currency. Raw quotes are retained; no hedge sizing is enabled.');
   const quotes=markets.flatMap(m=>m.outcomes.flatMap(o=>o.prices));
   if(!quotes.length)warnings.push('No price quotes have been captured for this event.');
   if(quotes.some(p=>!Number.isFinite(Date.parse(p.observedAt))||Date.now()-Date.parse(p.observedAt)>30000))warnings.push('Some captured price quotes were observed over 30 seconds ago; do not treat them as current.');
   if(this.limited)warnings.push('Capture limits were reached; some data is incomplete.');
   return {source:'Matchbook',eventId:eid,available:true,fixture:d.name,home,away,sport,sportId:d.sportId||tag('SPORT')?.id||null,category:null,competition,competitionId:tag('COMPETITION')?.id||null,metadataTags:tags,participants:d.participants||[],teamClassMarkers,teamClass:teamClassMarkers.length?'explicit markers present':'unknown — absence of a marker does not prove senior teams',kickoffRaw:d.start||null,kickoffUTC,scheduledKickoffUTC:kickoffUTC,kickoffLondon:kickoffUTC?new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',dateStyle:'medium',timeStyle:'short'}).format(new Date(kickoffUTC)):null,actualStartUTC:null,actualStartStatus:'No actual kickoff is inferred from scheduled start.',status:d.status||null,isLive:d.isLive??null,inRunning:d.inRunning??null,observedAt:ev.observedAt,generatedAt:null,metadataGeneratedAt:null,snapshotComplete:false,markets,warnings};
  }
 }
 globalThis.MatchbookNetwork={Store,route,eventIdFromURL};
})();
