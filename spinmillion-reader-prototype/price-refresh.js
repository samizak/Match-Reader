/* Selected-event GET polling only. No login, account, token or trading operations. */
(() => {
 function context(tab){try{const u=new URL(tab.url);if(u.protocol!=='https:')return null;if(u.hostname==='www.spinmillion757.com'){const id=u.pathname.match(/-(\d+)\/?$/)?.[1];return id?{source:'Spinmillion',eventId:id,path:u.pathname}:null;}if(['matchbook.com','www.matchbook.com'].includes(u.hostname)){const ids=[...new Set(u.pathname.split('/').filter(p=>/^\d{6,20}$/.test(p)))];return ids.length===1?{source:'Matchbook',eventId:ids[0],path:u.pathname}:null;}}catch{}return null;}
 function requestFor(tab,network={}){
  const c=context(tab);if(!c)return null;
  const url=c.source==='Matchbook'?new URL(`https://api.matchbook.com/edge/rest/events/${c.eventId}`):new URL(`https://api-h-c7818b61-608.sptpub.com/api/v4/${network.event?.feedStream==='live'?'live':'prematch'}/brand/2620402840463613956/event/gb/${c.eventId}`);
  if(c.source==='Matchbook')for(const [k,v]of Object.entries({'include-prices':'true','include-event-participants':'true','odds-type':'DECIMAL','exchange-type':'back-lay',currency:'GBP','price-mode':'expanded','price-depth':'3','minimum-liquidity':'0','markets-limit':'500'}))url.searchParams.set(k,v);
  return {...c,url:url.href};
 }
 function selectedData(request,data){
  const responseKeys=['id','event','events','markets','errors','error','data','status','code'].filter(k=>data&&Object.hasOwn(data,k));
  const responseShape=Array.isArray(data)?'array':Array.isArray(data?.events)?'events':data?.event&&typeof data.event==='object'?'event':data&&Object.hasOwn(data,'id')?'bare-event':'unrecognized';
  const diagnostic={responseShape,responseKeys,receivedEventIds:[],identifierEncoding:'missing'};
  if(!data||typeof data!=='object')return {...diagnostic,error:'unexpected-response'};
  if(request.source==='Spinmillion'){
   const event=data.events?.[request.eventId];
   diagnostic.responseShape='spin-events';diagnostic.receivedEventIds=Object.keys(data.events||{}).filter(s=>/^\d{1,30}$/.test(s)).slice(0,5);
   if(!event||typeof event!=='object')return {...diagnostic,error:diagnostic.receivedEventIds.length?'wrong-event':'unexpected-response'};
   let count=0;for(const variants of Object.values(event.markets||{}))for(const outcomes of Object.values(variants||{}))for(const o of Object.values(outcomes||{}))if(o&&Number(o.k)>1)count++;return {...diagnostic,count};
  }
  if(Array.isArray(data.errors)&&data.errors.length||data.error&&data.error!==false)return {...diagnostic,error:'api-error'};
  const list=Array.isArray(data)?data:Array.isArray(data.events)?data.events:[data.event||data];
  const validID=e=>typeof e?.id==='string'&&/^\d{1,30}$/.test(e.id)?e.id:Number.isSafeInteger(e?.id)&&e.id>=0?String(e.id):null;
  diagnostic.receivedEventIds=list.map(validID).filter(Boolean).slice(0,5);
  const e=list.find(e=>validID(e)===request.eventId);
  diagnostic.identifierEncoding=e?typeof e.id==='string'?'string':'safe-number':list.some(e=>typeof e?.id==='number'&&!Number.isSafeInteger(e.id))?'unsafe-number':diagnostic.receivedEventIds.length?'string-or-safe-number':'missing';
  if(!e)return {...diagnostic,error:diagnostic.identifierEncoding==='unsafe-number'?'unsafe-event-id':diagnostic.receivedEventIds.length?'wrong-event':'unexpected-response'};
  let count=0;for(const m of e.markets||[])for(const o of m.runners||[])count+=(o.prices||[]).length;return {...diagnostic,count};
 }
 function create({getTab,getEpoch=()=>0,fetchInTab,ingest,networkRead=()=>({}),now=Date.now}){
  const states=new Map();
  const summary=s=>({source:s.source,eventId:s.eventId,status:s.status,attemptedAt:s.attemptedAt||null,confirmedAt:s.confirmedAt||null,httpStatus:s.httpStatus||null,quoteCount:s.quoteCount||0,nextRetryAt:s.blockedUntil?new Date(s.blockedUntil).toISOString():null,responseShape:s.responseShape||null,responseKeys:s.responseKeys||[],receivedEventIds:s.receivedEventIds||[],identifierEncoding:s.identifierEncoding||null,returnedQuoteCount:s.returnedQuoteCount||0,retainedFreshCount:s.retainedFreshCount||0,incomingGeneratedAt:s.incomingGeneratedAt||null,retainedGeneratedAt:s.retainedGeneratedAt||null});
  function forget(tabId){for(const key of states.keys())if(key.startsWith(tabId+':'))states.delete(key);}
  async function refresh(tab,{force=false}={}){
   const request=requestFor(tab,await networkRead(tab));if(!request)return {status:'unsupported'};
   const epoch=getEpoch(tab.id),key=[tab.id,request.source,request.eventId,epoch].join(':');
   if(!states.has(key)){if(states.size>=200)states.delete(states.keys().next().value);states.set(key,{source:request.source,eventId:request.eventId,lastAttempt:-Infinity,status:'waiting'});}
   const state=states.get(key);
   if(state.pending)return state.pending;
   if(now()<(state.blockedUntil||0)||now()-state.lastAttempt<(force?1000:10000))return summary(state);
   state.lastAttempt=now();state.attemptedAt=new Date(now()).toISOString();state.httpStatus=null;state.responseShape=null;state.responseKeys=[];state.receivedEventIds=[];state.identifierEncoding=null;state.returnedQuoteCount=0;state.retainedFreshCount=0;state.incomingGeneratedAt=null;state.retainedGeneratedAt=null;
   const valid=async()=>{try{const c=context(await getTab(tab.id));return c&&c.source===request.source&&c.eventId===request.eventId&&c.path===request.path&&getEpoch(tab.id)===epoch;}catch{return false;}};
   state.pending=(async()=>{
    try{
     if(!await valid()){state.status='context-changed';return summary(state);}
     const started=now(),response=await fetchInTab(tab,request.url);state.httpStatus=Number.isInteger(response?.status)?response.status:null;
     if(!await valid()){state.status='context-changed';return summary(state);}
     if(!response?.ok){state.status=response?.status?'http-error':'request-error';state.httpStatus=response?.status||null;if([401,403,429].includes(state.httpStatus))state.blockedUntil=now()+60000;return summary(state);}
     const selected=selectedData(request,response.data);for(const key of ['responseShape','responseKeys','receivedEventIds','identifierEncoding'])state[key]=selected[key];if(selected.error){state.status=selected.error;return summary(state);}
     const observedAt=now(),applied=await ingest(tab,request.url,response.data,{requestStartedAt:started,observedAt});
     state.returnedQuoteCount=selected.count;state.retainedFreshCount=applied?.retainedFreshCount||0;state.incomingGeneratedAt=applied?.incomingGeneratedAt||null;state.retainedGeneratedAt=applied?.retainedGeneratedAt||null;
     state.quoteCount=applied?.quoteCount??selected.count;
     state.status=state.quoteCount>0?'updated':'no-prices';
     if(state.quoteCount>0)state.confirmedAt=new Date(observedAt).toISOString();
     else if(selected.count>0&&applied?.ignoredOlderResponse){state.status=applied.retainedFreshCount>0?'newer-prices-retained':'older-response';if(applied.retainedFreshCount>0)state.confirmedAt=applied.retainedObservedAt;}
     return summary(state);
    }catch{state.status='request-error';return summary(state);}finally{state.pending=null;}
   })();
   return state.pending;
  }
  return {refresh,forget};
 }
 // Runs in the selected tab's Firefox context, including its normal cookie jar.
 // Only fixed public sports URLs built above reach this function.
 function fetchCode(url){return `(async()=>{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);try{const r=await fetch(${JSON.stringify(url)},{method:'GET',credentials:'include',cache:'no-store',redirect:'error',headers:{Accept:'application/json'},signal:controller.signal});if(!r.ok)return {ok:false,status:r.status};const reader=r.body.getReader(),parts=[];let size=0;for(;;){const v=await reader.read();if(v.done)break;size+=v.value.byteLength;if(size>8388608){await reader.cancel();return {ok:false,status:0};}parts.push(v.value);}const bytes=new Uint8Array(size);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.byteLength;}return {ok:true,status:r.status,data:(${SportsJSON.parse.toString()})(new TextDecoder().decode(bytes))};}catch{return {ok:false,status:0};}finally{clearTimeout(timer);}})()`;}
 globalThis.PriceRefresh={create,requestFor,fetchCode};
})();
