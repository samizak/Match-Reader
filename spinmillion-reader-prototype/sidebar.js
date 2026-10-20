const $=s=>document.querySelector(s);
let capture=null,busy=false,generation=0,selectedMarketId=null,selectedBetIndex=0,workspaceState=null,workspaceSequence=0,pairSelections={},pairRefreshPending=false,pairResetPending=false;
const workspaceView=typeof WindowPair==='undefined'&&typeof MatchWorkspace!=='undefined'?MatchWorkspace.createView($('#workspace'),{
 onRefreshPrices:()=>scan(true),
 onMarketChange:id=>{selectedMarketId=id;if(workspaceState)workspaceView.render(workspaceState,{marketId:id,betIndex:selectedBetIndex});scan();},
 onAutoPair:()=>{pairSelections={};pairResetPending=true;generation++;workspaceSequence++;applyWorkspace({livePair:true,pairing:{issues:['Pairing active match…']}});scan(true);},
 onSourceChange:(source,id)=>{pairSelections[source]=Number(id);generation++;workspaceSequence++;if(workspaceView)applyWorkspace({livePair:true,pairing:{...workspaceState?.pairing,selectedTabs:{...workspaceState?.pairing?.selectedTabs,...pairSelections},issues:['Updating selected windows…']}});scan(true);},
 onBetChange:index=>{selectedBetIndex=index;if(workspaceState)workspaceView.render(workspaceState,{marketId:selectedMarketId,betIndex:index});}
}):null;
const windowMonitor=typeof WindowPair!=='undefined'?WindowPair.create({root:$('#workspace'),browser,getSave:()=>$('#local').checked,getAuto:()=>$('#watch').checked,onStatus:text=>{$('#local-status').textContent=text;$('#connection-status').textContent='Connected';}}):null;
function applyWorkspace(value){workspaceState=value;selectedMarketId=value.selectedMarket?.id||null;workspaceView?.render(value,{marketId:selectedMarketId,betIndex:selectedBetIndex});}
async function nativeMessage(message){
 const sequence=++workspaceSequence;
 const result=await browser.runtime.sendNativeMessage('spinmillion_reader',{...message,marketId:selectedMarketId});
 if(sequence===workspaceSequence&&result?.workspace){if(message.pairing)result.workspace.pairing=message.pairing;if(message.livePair)result.workspace.quoteSources=Object.fromEntries((message.snapshots||[]).map(s=>[s.source,{...s.network?.event,priceRefresh:s.network?.priceRefresh}]));applyWorkspace(result.workspace);if(workspaceView)$('#connection-status').textContent='Local link active';}
 return result;
}
async function readWorkspace(preview=null){
 try{await nativeMessage({type:'workspace',...(preview?{snapshot:preview}:{})});}
 catch{if(workspaceView)$('#connection-status').textContent='Local helper unavailable';}
}
const local=SpinLocalDiagnostics.create({send:nativeMessage,onStatus:message=>$('#local-status').textContent=message,onFailure:()=>{$('#local').checked=false;}});
function clean(){$('#status').className='';for(const id of ['#cards','#network'])$(id).replaceChildren();$('#json').textContent='No current capture.';$('#copy').disabled=true;capture=null;}
function el(tag,txt,cls){const n=document.createElement(tag);if(txt!==undefined)n.textContent=txt;if(cls)n.className=cls;return n;}
function list(rows){const dl=el('dl');for(const [k,v]of Object.entries(rows)){dl.append(el('dt',k),el('dd',v===null||v===undefined||v===''?'UNVERIFIED':String(v)));}return dl;}
function renderMatchbookNetwork(net){
 const host=$('#network'),e=net?.event;
 host.append(el('h2','Matchbook API capture','network-title'),el('p',`${net?.responses||0} relevant responses captured. Betslip and orders are not read.`));
 const d=net?.diagnostics;if(d)host.append(list({'Event responses':d.selectedEvent?.responses,'Metadata captured':d.selectedEvent?.metadataCaptured,'Capture errors':Object.values(d.captureErrors||{}).reduce((n,v)=>n+v,0)}));
 if(!net?.eventId)host.append(el('p','A unique event ID could not be read from this page URL. Open an individual Matchbook event and reload it.','warning'));
 if(!e?.available){host.append(el('p',e?.warnings?.join(' ')||'Reload the Matchbook event page to capture its metadata.','warning'));return;}
 host.append(list({'Event ID':e.eventId,'Fixture':e.fixture,'Sport':e.sport,'Competition':e.competition,'Scheduled kickoff — London':e.kickoffLondon,'Scheduled kickoff — UTC':e.kickoffUTC,'Event status':e.status,'Live flag':e.isLive,'In-running flag':e.inRunning,'Team classification markers':e.teamClassMarkers?.join(', ')||'Unknown','Metadata observed at':e.observedAt}));
 for(const w of e.warnings||[])host.append(el('p',w,'warning'));
 for(const m of e.markets||[]){
  const details=el('details');details.append(el('summary',`${m.name||'Unknown market '+m.id} · ${m.status||'unknown status'}`),list({'Market ID':m.id,'Market type':m.marketType,'Settlement scope':m.settlementScope}));
  const table=el('table'),heading=el('tr');for(const text of ['Runner','Back quotes','Lay quotes'])heading.append(el('th',text));table.append(heading);
  for(const o of m.outcomes||[]){
   const row=el('tr');row.append(el('td',`${o.label||'Unknown runner '+o.id} (${o.status||'unknown status'})`));
   for(const side of ['back','lay']){
    const quotes=(o.prices||[]).filter(p=>p.side===side).map(p=>`${p.odds??('raw '+(p.rawOdds??'?')+' / '+(p.oddsType||'unknown format'))} · ${p.availableAmount??'?'} ${p.currency||'currency unknown'}${p.priceMode==='aggregated'?' (aggregated)':''}`);
    row.append(el('td',quotes.join(' | ')||'No captured quote'));
   }row.title='Quotes observed: '+(o.pricesObservedAt||'unknown');table.append(row);
  }details.append(table);host.append(details);
 }
}
function renderNetwork(net){
 if(net?.source==='Matchbook'||net?.event?.source==='Matchbook'){renderMatchbookNetwork(net);return;}
 const host=$('#network'),e=net?.event;
 host.append(el('h2','Network capture','network-title'),el('p',`${net?.responses||0} relevant responses captured in this tab.`));
 const d=net?.diagnostics;if(d)host.append(list({'Responses for this event':d.selectedEvent.responses,'Event metadata captured':d.selectedEvent.metadataCaptured,'Capture errors':Object.values(d.captureErrors).reduce((n,v)=>n+v,0)}));
 if(!e?.available){host.append(el('p',e?.warnings?.join(' ')||'Reload the match page to capture its initial responses.','warning'));return;}
 host.append(list({'Event ID':e.eventId,'Fixture':e.fixture,'Sport':e.sport,'Country / category':e.category,'Competition':e.competition,'Scheduled kickoff — London':e.kickoffLondon,'Scheduled kickoff — UTC':e.scheduledKickoffUTC||e.kickoffUTC,'Actual kickoff':e.actualStartUTC||'Not supplied by the feed','Team classification markers':e.teamClassMarkers?.join(', ')||'Unknown — no explicit marker','Event data generated':e.generatedAt,'Price snapshot complete':e.snapshotComplete}));
 const l=e.live;if(l){
  const pair=p=>p?`${p.home??'?'} – ${p.away??'?'}`:'Not captured';
  const seconds=e.wallTimeSinceScheduledSeconds;
  const duration=Number.isFinite(seconds)?`${seconds<0?'−':''}${Math.floor(Math.abs(seconds)/3600)}h ${Math.floor(Math.abs(seconds)%3600/60)}m ${Math.abs(seconds)%60}s`:null;
  host.append(el('h3','Live match details'),list({'Last reported score':pair(l.score),'Last reported match clock':l.matchTime||'Not captured','Period':l.periodLabel||(l.periodCode!==null&&l.periodCode!==undefined?'Unknown label (code '+l.periodCode+')':'Not captured'),'Clock reported stopped':l.clockStopped,'Time since scheduled kickoff (includes breaks)':duration,'Score data generated':l.scoreGeneratedAt,'Clock data generated':l.clockGeneratedAt,'Clock reference timestamp':l.clockTimestampUTC,'Clock reference age in seconds':l.clockReferenceAgeSeconds,'Clock data age in seconds':l.clockAgeSeconds}));
  for(const [key,value]of Object.entries(l.statistics||{}))host.append(list({[key.replaceAll('_',' ')]:pair(value)}));
 }
 const identity=el('details');identity.append(el('summary','More fixture identity details'),list({'Sport ID':e.sportId,'Category ID':e.categoryId,'Competition ID':e.competitionId,'Home competitor ID':e.homeCompetitorId,'Away competitor ID':e.awayCompetitorId,'Event type':e.eventType,'Virtual event flag':e.virtual,'Metadata generated':e.metadataGeneratedAt}));host.append(identity);
 for(const w of e.warnings)host.append(el('p',w,'warning'));
 const details=el('details'),summary=el('summary',`${e.markets.length} captured market/line combinations`);details.append(summary);
 const search=el('input');search.type='search';search.placeholder='Filter markets or selections';details.append(search);
 const table=el('table');details.append(table);
 function populate(){table.replaceChildren();const query=search.value.toLowerCase();for(const m of e.markets){
  const title=`${m.name||'Unknown market '+m.id}${m.specifiers?' · '+m.specifiers:''}`;
  const rows=m.outcomes.filter(o=>(title+' '+(o.label||o.id)).toLowerCase().includes(query));if(!rows.length)continue;
  const heading=el('tr'),th=el('th',title);th.colSpan=2;heading.append(th);table.append(heading);
  for(const o of rows){const row=el('tr');row.append(el('td',o.label||'Unknown outcome '+o.id),el('td',o.odds===null?'Unknown':String(o.odds)));table.append(row);}
 }}search.addEventListener('input',populate);populate();host.append(details);
}
function render(data){
 clean();capture=data;$('#json').textContent=JSON.stringify(data,null,2);$('#copy').disabled=false;
 $('#status').textContent=data.source==='Matchbook'?`Matchbook API capture · ${data.network?.responses||0} responses · NOT a verified hedge`:`${data.bets.length} betslip selection(s) · ${data.network?.responses||0} network responses · NOT a verified hedge`;
 if(data.bets.some(b=>b.fixtureLinkStatus==='DIFFERENT_EVENT')){$('#status').textContent='FIXTURE MISMATCH: the betslip contains a different event from the open match. Not a verified hedge.';$('#status').className='warning';}
 renderNetwork(data.network);
 for(const b of data.bets){
  const card=el('section',undefined,'card');card.append(el('div','BETSLIP ONLY — NOT PLACED','badge'),el('h2',b.fixture||'Unknown fixture'));
  const e=b.networkEvent;
  card.append(list({'Competition / country':e?[e.category,e.competition].filter(Boolean).join(' / '):b.categoryRaw,'Team classification':b.teamClass,'Selection':b.selection,'Market':b.marketRaw,'Kickoff shown':[b.kickoff.dateLabel,b.kickoff.timeLabel].filter(Boolean).join(' '),'Network kickoff UTC':e?.kickoffUTC,'Odds in betslip':b.odds,'Stake':b.stake,'Currency':b.currencyRaw,'Calculated cash return (stake type unconfirmed)':b.expectedCashReturn}));
  for(const w of b.warnings)card.append(el('p',w,'warning'));$('#cards').append(card);
 }
}
async function scanPair(force=false){
 if(busy){if(force)pairRefreshPending=true;return;}busy=true;pairRefreshPending=false;const g=generation;$('#scan').disabled=true;$('#local-status').textContent='Requesting prices for the selected events…';
 try{
  const selectedTabs={...pairSelections},resetPair=pairResetPending;
  const active=await browser.tabs.query({active:true,currentWindow:true});
  const pair=await browser.runtime.sendMessage({type:'reader-pair-read',selectedTabs,resetPair,anchorTabId:active[0]?.id,refreshPrices:true,force:force===true});
  if(g===generation){pairSelections={};pairResetPending=false;}
  if(g!==generation)return;
  if(!pair?.snapshots)throw Error('Reload the extension to enable paired windows.');
  const {snapshots,...pairing}=pair;
  const result=await nativeMessage({type:'workspace',livePair:true,snapshots,pairing,save:$('#local').checked});
  if(g!==generation)return;
  if(!result?.ok)throw Error('Local helper could not build the comparison.');
  $('#local-status').textContent=($('#watch').checked?'Live updates + automatic price checks.':'Automatic price checks paused.')+($('#local').checked?' Diagnostics saving on.':'');
  if(snapshots.length){try{render(snapshots.find(s=>s.source==='Spinmillion')||snapshots[0]);}catch{$('#status').textContent='Current paired captures received.';}}
 }catch(e){if(g===generation){applyWorkspace({livePair:true,pairing:{issues:[e.message||'Could not read both windows.']}});$('#connection-status').textContent='Pairing unavailable';}}
 finally{busy=false;$('#scan').disabled=false;if(pairRefreshPending)scanPair(true);}
}
async function scan(force=false){
 if(windowMonitor)return windowMonitor.scan(force);
 if(workspaceView)return scanPair(force);
 if(busy)return;busy=true;const g=++generation;
 try{
  const [tab]=await browser.tabs.query({active:true,currentWindow:true});
  if(!tab?.id)throw Error('No active tab.');
  const page=new URL(tab.url);
  const matchbook=page.protocol==='https:'&&['www.matchbook.com','matchbook.com'].includes(page.hostname);
  if(matchbook){
   const network=await browser.runtime.sendMessage({type:'reader-network-read',tabId:tab.id});if(network?.error)throw Error(network.error);
   const [now]=await browser.tabs.query({active:true,currentWindow:true});if(g!==generation||now?.id!==tab.id||now?.url!==tab.url){clean();return;}
   const data={prototype:true,source:'Matchbook',readOnly:true,frameHasBetslip:null,bets:[],network,domError:null,extensionVersion:browser.runtime.getManifest().version,capturedAt:new Date().toISOString(),pageEventPath:page.pathname,notice:'Read-only API capture. Matchbook betslip and accepted orders are not parsed. No hedge is verified.'};
   render(data);if(workspaceView&&!local.enabled)await readWorkspace(data);await local.publish(data);return;
  }
  if(!tab.url?.startsWith('https://www.spinmillion757.com/'))throw Error('Open a Spinmillion or Matchbook event tab.');
  const network=await browser.runtime.sendMessage({type:'spin-network-read',tabId:tab.id});
  if(network?.error)throw Error(network.error);
  let frames=[],domError=null;
  try{frames=await browser.tabs.executeScript(tab.id,{file:'reader.js',allFrames:true,matchAboutBlank:true});}catch{domError='Visible betslip could not be read. Network metadata is shown separately.';}
  const [now]=await browser.tabs.query({active:true,currentWindow:true});
  if(g!==generation||now?.id!==tab.id||now?.url!==tab.url){clean();return;}
  const sources=frames.filter(x=>x?.source==='Spinmillion');
  const populated=sources.filter(x=>x.bets.length);
  if(populated.length>1)throw Error('Selections found in multiple frames; ambiguous betslip.');
  const data=populated[0]||sources[0]||{prototype:true,source:'Spinmillion',readOnly:true,bets:[]};
  data.network=network;data.domError=domError;data.extensionVersion=browser.runtime.getManifest().version;data.capturedAt=new Date().toISOString();data.pageEventPath=new URL(tab.url).pathname;
  for(const b of data.bets){
   const id=b.eventPath?.match(/-(\d+)(?:[/?#]|$)/)?.[1];const e=network?.event;
   b.eventId=id||null;b.pageEventId=network?.eventId||null;b.fixtureLinkStatus=id&&network?.eventId&&id!==network.eventId?'DIFFERENT_EVENT':'UNVERIFIED';
   const norm=s=>(s||'').replace(/\s+/g,' ').trim().toLowerCase();
   if(e?.available&&id===e.eventId&&norm(e.home)===norm(b.home)&&norm(e.away)===norm(b.away)){
    b.fixtureLinkStatus='PAGE_METADATA_LINKED';
    b.networkEvent={eventId:e.eventId,category:e.category,competition:e.competition,kickoffUTC:e.kickoffUTC};
    if(e.kickoffUTC)b.warnings=b.warnings.filter(w=>!w.startsWith('Bookmaker timezone is not supplied'));
   }else b.warnings.push('Network fixture and selected bet have not been linked by event ID and team names.');
  }
  render(data);if(domError&&!data.bets.some(b=>b.fixtureLinkStatus==='DIFFERENT_EVENT'))$('#status').textContent=domError;
  if(workspaceView&&!local.enabled)await readWorkspace(data);
  await local.publish(data);
 }catch(e){clean();$('#status').textContent=e.message||String(e);}finally{busy=false;}
}
$('#scan').addEventListener('click',()=>scan(true));
$('#watch').addEventListener('change',()=>{if(workspaceView||windowMonitor){if($('#watch').checked)scan(true);else $('#local-status').textContent='Automatic price requests paused.';}});
$('#local').addEventListener('change',async()=>{local.setEnabled($('#local').checked);if(workspaceView||windowMonitor||local.enabled)await scan();});
$('#copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(JSON.stringify(capture,null,2));$('#status').textContent='Extracted JSON copied.';}catch{$('#status').textContent='Select and copy the JSON below manually.';}});
browser.tabs.onActivated.addListener(()=>{if(workspaceView||windowMonitor){if($('#watch').checked)scan();return;}generation++;clean();$('#status').textContent='Tab changed. Read the active tab again.';});
browser.tabs.onUpdated.addListener((id,info)=>{if(workspaceView||windowMonitor){if(info.status==='complete'&&$('#watch').checked)scan();return;}if(info.status==='loading'){generation++;clean();$('#status').textContent='Page loading. Reload capture when the match appears.';}});
setInterval(()=>{windowMonitor?.tick();if(workspaceView&&workspaceState)workspaceView.render(workspaceState,{marketId:selectedMarketId,betIndex:selectedBetIndex});if($('#watch').checked||(!workspaceView&&!windowMonitor&&local.enabled))scan();},2000);
if(windowMonitor)scan();else if(workspaceView){workspaceView.render({});scan();}
