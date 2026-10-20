/* Firefox response observer: pass every byte through unchanged immediately. */
const stores=new Map(), epochs=new Map(), priceReads=new Map();
const SITE='https://www.spinmillion757.com/';
const sources=new Map();
function sourceForURL(raw){try{const u=new URL(raw);if(u.protocol!=='https:')return null;if(u.hostname==='www.spinmillion757.com')return 'Spinmillion';if(['www.matchbook.com','matchbook.com'].includes(u.hostname))return 'Matchbook';}catch{}return null;}
const storeFor=(id,source='Spinmillion')=>{if(!stores.has(id)||sources.get(id)!==source){stores.set(id,source==='Matchbook'?new MatchbookNetwork.Store():new SpinNetwork.Store());sources.set(id,source);}return stores.get(id);};
browser.browserAction.onClicked.addListener(()=>browser.sidebarAction.open());
browser.tabs.onRemoved.addListener(id=>{stores.delete(id);sources.delete(id);epochs.delete(id);priceReads.delete(id);priceRefresher.forget(id);});
// Clear the previous document's cached data on a full top-level navigation.
browser.webRequest.onBeforeRequest.addListener(d=>{stores.delete(d.tabId);sources.delete(d.tabId);priceReads.delete(d.tabId);epochs.set(d.tabId,(epochs.get(d.tabId)||0)+1);},{urls:[SITE+'*','https://www.matchbook.com/*','https://matchbook.com/*'],types:['main_frame']});
browser.webRequest.onBeforeRequest.addListener(details=>{
 const spin=SpinNetwork.route(details.url),r=spin||(typeof MatchbookNetwork!=='undefined'?MatchbookNetwork.route(details.url):null);if(!r||details.tabId<0||details.method!=='GET')return;
 const source=spin?'Spinmillion':'Matchbook',requestStartedAt=Number.isFinite(details.timeStamp)?details.timeStamp:Date.now();
 const tabId=details.tabId,epoch=epochs.get(tabId)||0;
 const issue=key=>{const s=storeFor(tabId,source);s.captureErrors[key]=(s.captureErrors[key]||0)+1;};
 let filter;try{filter=browser.webRequest.filterResponseData(details.requestId);}catch{issue('filterUnavailable');return;}
 const chunks=[];let size=0,oversized=false;
 filter.ondata=e=>{
  filter.write(e.data); // Preserve the site's response, even when capture is skipped.
  size+=e.data.byteLength;
  if(size>16*1024*1024){oversized=true;chunks.length=0;}
  if(!oversized)chunks.push(new Uint8Array(e.data));
 };
 filter.onerror=()=>{if((epochs.get(tabId)||0)===epoch)issue('streamError');chunks.length=0;try{filter.disconnect();}catch{}};
 filter.onstop=()=>{
  filter.close();
  if(oversized||!size){if((epochs.get(tabId)||0)===epoch)issue(oversized?'oversized':'emptyResponse');return;}
  // Establish which first-party tab initiated the request. Never ingest other sites' traffic.
  browser.tabs.get(tabId).then(tab=>{
   if(sourceForURL(tab.url)!==source||(epochs.get(tabId)||0)!==epoch)return;
   const decoder=new TextDecoder('utf-8');let text='';for(const c of chunks)text+=decoder.decode(c,{stream:true});text+=decoder.decode();chunks.length=0;
   try{storeFor(tabId,source).ingest(r,SportsJSON.parse(text),{requestStartedAt,observedAt:Date.now()});}catch{issue('parseOrSchemaError');/* No raw response or credentials recorded. */}
  }).catch(()=>{});
 };
 return {};
},{urls:['https://api-h-c7818b61-608.sptpub.com/*','https://api.matchbook.com/*','https://www.matchbook.com/edge/rest/*','https://matchbook.com/edge/rest/*'],types:['xmlhttprequest']},['blocking']);
function readNetwork(tab){
 const source=sourceForURL(tab.url);if(!source)return {error:'Open a permitted event tab.'};
 const eventId=source==='Matchbook'?MatchbookNetwork.eventIdFromURL(tab.url):tab.url.match(/-(\d+)(?:[/?#]|$)/)?.[1]||null;
 const store=sources.get(tab.id)===source?stores.get(tab.id):null;
 return {source,eventId,responses:store?.responses||0,lastCapture:store?.lastCapture||null,diagnostics:store?.diagnostics(eventId)||null,event:store?store.snapshot(eventId):{available:false,eventId,markets:[],warnings:['Reload this match page to capture its metadata.']}};
}
const priceRefresher=PriceRefresh.create({
 getTab:id=>browser.tabs.get(id),getEpoch:id=>epochs.get(id)||0,networkRead:readNetwork,
 fetchInTab:async(tab,url)=>{const frames=await browser.tabs.executeScript(tab.id,{code:PriceRefresh.fetchCode(url),allFrames:false});return frames?.[0];},
 ingest:(tab,url,data,times)=>{
  const source=sourceForURL(tab.url),route=source==='Matchbook'?MatchbookNetwork.route(url):SpinNetwork.route(url);
  if(!route)return {quoteCount:0};const store=storeFor(tab.id,source),eventId=source==='Matchbook'?MatchbookNetwork.eventIdFromURL(tab.url):tab.url.match(/-(\d+)(?:[/?#]|$)/)?.[1];
  const before=store.snapshot(eventId),previousGenerated=Date.parse(before.generatedAt),incomingGenerated=Number(data.generated);
  const ignoredOlderResponse=source==='Spinmillion'&&route.stream===before.feedStream&&Number.isFinite(previousGenerated)&&Number.isFinite(incomingGenerated)&&incomingGenerated<previousGenerated;
  store.ingest(route,data,times);
  const event=store.snapshot(source==='Matchbook'?MatchbookNetwork.eventIdFromURL(tab.url):tab.url.match(/-(\d+)(?:[/?#]|$)/)?.[1]);
  const observed=new Date(times.observedAt).toISOString();let quoteCount=0;
  for(const m of event.markets||[])for(const o of m.outcomes||[])quoteCount+=source==='Matchbook'?(o.prices||[]).filter(p=>p.observedAt===observed).length:Number(o.pricesObservedAt===observed);
  const retainedTimes=[];
  for(const m of event.markets||[])for(const o of m.outcomes||[]){
   const stamps=source==='Matchbook'?(o.prices||[]).map(p=>p.observedAt):[o.pricesObservedAt];
   for(const stamp of stamps){const t=Date.parse(stamp),age=times.observedAt-t;if(Number.isFinite(t)&&age>=-5000&&age<=30000)retainedTimes.push(t);}
  }
  return {quoteCount,ignoredOlderResponse,retainedFreshCount:retainedTimes.length,retainedObservedAt:retainedTimes.length?new Date(Math.max(...retainedTimes)).toISOString():null,
   incomingGeneratedAt:Number.isFinite(incomingGenerated)&&incomingGenerated>0?new Date(incomingGenerated).toISOString():null,retainedGeneratedAt:event.generatedAt||null};
 }
});
// Fixture reads never await HTTP. PriceRefresh still enforces its own quote age,
// per-event request coalescing, rate limits, validation and navigation guards.
function readPairNetwork(tab,options){
 const epoch=epochs.get(tab.id)||0;
 let state=priceReads.get(tab.id);
 if(!state||state.url!==tab.url||state.epoch!==epoch){
  if(priceReads.size>=200)priceReads.delete(priceReads.keys().next().value);
  state={url:tab.url,epoch,pending:false,result:null};priceReads.set(tab.id,state);
 }
 if(options.refreshPrices&&!state.pending){
  state.pending=true;
  Promise.resolve().then(()=>priceRefresher.refresh(tab,{force:options.force===true})).then(result=>{
   if(priceReads.get(tab.id)===state&&(epochs.get(tab.id)||0)===epoch)state.result=result;
  }).catch(()=>{if(priceReads.get(tab.id)===state)state.result={status:'request-error'};}).finally(()=>{state.pending=false;});
 }
 return {...readNetwork(tab),priceRefresh:state.result||{status:'waiting',confirmedAt:null}};
}
function readDiscoveryNetwork(tab){
 const network=readNetwork(tab),e=network.event;
 // Unselected tabs must be able to acquire identity metadata. Otherwise there is
 // a circular dependency: no pair without metadata, no request without a pair.
 if(!e?.available||!e.home||!e.away||!e.sport||!e.competition||!(e.scheduledKickoffUTC||e.kickoffUTC)){
  readPairNetwork(tab,{refreshPrices:true,force:false});
 }
 return network;
}
const pairReader=PairedTabs.create({browser,metadataRead:readDiscoveryNetwork,networkRead:readPairNetwork});
const windowPairReader=PairedTabs.createWindowReader({browser,metadataRead:readDiscoveryNetwork,networkRead:readPairNetwork});
browser.windows?.onRemoved?.addListener(id=>windowPairReader.forget(id));
let pairQueue=Promise.resolve();
browser.runtime.onMessage.addListener((msg,sender)=>{
 if(sender.id!==browser.runtime.id||sender.tab)return;
 if(msg?.type==='reader-window-read'){
  const task=pairQueue.then(()=>windowPairReader.read({windowId:msg.windowId,selectedTabs:msg.selectedTabs,resetPair:msg.resetPair===true,refreshPrices:msg.refreshPrices===true,force:msg.force===true,anchorTabId:msg.anchorTabId}));
  pairQueue=task.catch(()=>{});return task;
 }
 if(msg?.type==='reader-pair-read'){
  const task=pairQueue.then(()=>pairReader.read(msg.selectedTabs||{},{refreshPrices:msg.refreshPrices===true,force:msg.force===true,resetPair:msg.resetPair===true,anchorTabId:msg.anchorTabId}));
  pairQueue=task.catch(()=>{});return task;
 }
 if(!['spin-network-read','reader-network-read'].includes(msg?.type))return;
 return browser.tabs.get(msg.tabId).then(readNetwork);
});
