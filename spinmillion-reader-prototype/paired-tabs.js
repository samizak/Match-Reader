/* Read current event tabs across all Firefox windows. Never use saved captures. */
(() => {
 function context(tab){try{const u=new URL(tab.url);if(u.protocol!=='https:')return null;const source=u.hostname==='www.spinmillion757.com'?'Spinmillion':['matchbook.com','www.matchbook.com'].includes(u.hostname)?'Matchbook':null;if(!source)return null;const eventId=source==='Spinmillion'?u.pathname.match(/-(\d+)\/?$/)?.[1]:u.pathname.match(/\/(\d{6,})(?:\/|$)/)?.[1];return eventId?{source,eventId,eventPath:u.pathname,tabId:tab.id,windowId:tab.windowId,label:(tab.title||u.pathname).slice(0,160)}:null;}catch{return null;}}
 const aliases={'liverpool fc':'liverpool','villarreal cf':'villarreal'};
 const norm=v=>typeof v==='string'?v.trim().replace(/\s+/g,' ').toLowerCase():'';
 function agrees(a,b){
  if(!a?.available||!b?.available)return false;
  for(const field of ['home','away','sport','competition']){
   let x=norm(a[field]),y=norm(b[field]);
   if(field==='home'||field==='away'){x=aliases[x]||x;y=aliases[y]||y;}
   if(field==='sport'){if(x==='soccer')x='football';if(y==='soccer')y='football';}
   if(!x||!y||x!==y)return false;
  }
  const markers=e=>JSON.stringify([...new Set((e.teamClassMarkers||[]).map(norm).filter(Boolean))].sort());
  if(markers(a)!==markers(b))return false;
  const instant=e=>{const v=e.scheduledKickoffUTC||e.kickoffUTC;return typeof v==='string'&&/(Z|[+-]\d{2}:\d{2})$/.test(v)?Date.parse(v):NaN;};
  const at=instant(a),bt=instant(b);
  return Number.isFinite(at)&&Number.isFinite(bt)&&Math.abs(at-bt)<=120000&&!(typeof a.virtual==='boolean'&&typeof b.virtual==='boolean'&&a.virtual!==b.virtual);
 }
 function explain(a,b){
  if(!a?.available||!b?.available)return ['Fixture metadata missing; requesting it.'];
  const reasons=[];
  for(const field of ['home','away','sport','competition']){
   let x=norm(a[field]),y=norm(b[field]);
   if(field==='home'||field==='away'){x=aliases[x]||x;y=aliases[y]||y;}
   if(field==='sport'){x=x==='soccer'?'football':x;y=y==='soccer'?'football':y;}
   if(!x||!y)reasons.push('Missing '+field+'.');
   else if(x!==y)reasons.push(field+': '+a[field]+' / '+b[field]);
  }
  const at=a.scheduledKickoffUTC||a.kickoffUTC,bt=b.scheduledKickoffUTC||b.kickoffUTC;
  if(!at||!bt)reasons.push('Absolute kickoff missing.');
  else if(!/(Z|[+-]\d{2}:\d{2})$/.test(at)||!/(Z|[+-]\d{2}:\d{2})$/.test(bt)||!Number.isFinite(Date.parse(at))||!Number.isFinite(Date.parse(bt))||Math.abs(Date.parse(at)-Date.parse(bt))>120000)reasons.push('Kickoff: '+at+' / '+bt);
  if(!reasons.length&&!agrees(a,b))reasons.push('Team classification or virtual-event flags differ.');
  return reasons;
 }
 // A suspended or unresponsive document must not hold fixture identity hostage.
 function pageRead(promise){
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('Page read timed out')),400);
   promise.then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});
  });
 }
 function create({browser,networkRead,metadataRead}){let binding=null;return {async read(selections={},options={}){
  const scope=Number.isInteger(options.windowId)?{windowId:options.windowId}:{};
  const tabs=(await browser.tabs.query({...scope,url:['https://www.spinmillion757.com/*','https://www.matchbook.com/*','https://matchbook.com/*']})).filter(t=>scope.windowId===undefined||t.windowId===scope.windowId);
  const candidates={Spinmillion:[],Matchbook:[]},snapshots=[],issues=[],selectedTabs={Spinmillion:null,Matchbook:null};
  for(const tab of tabs){const c=context(tab);if(c)candidates[c.source].push(c);}
  const pairingChecks=[];
  let resolved=selections,mode='manual';
  if(metadataRead){
   mode='automatic';resolved={};
   if(options.resetPair)binding=null;
   const all=Object.values(candidates).flat();
   // Metadata reads are passive. Discovery never polls every open event for prices.
   const metadata=new Map(await Promise.all(all.map(async c=>{try{
    const tab=tabs.find(t=>t.id===c.tabId),n=await metadataRead(tab);
    const current=context(await browser.tabs.get(c.tabId));
    const valid=current&&current.eventPath===c.eventPath&&current.eventId===c.eventId&&current.source===c.source&&String(n?.eventId)===c.eventId&&(!n.event?.eventId||String(n.event.eventId)===c.eventId);
    return [c.tabId,valid?n.event:null];
   }catch{return [c.tabId,null];}})));
   for(const candidate of all){const e=metadata.get(candidate.tabId);if(e?.available){const fixture=e.fixture||[e.home,e.away].filter(Boolean).join(' vs ');if(fixture)candidate.label=fixture.slice(0,160);}}
   if(Object.keys(selections).length===1&&binding){const source=Object.keys(selections)[0],other=source==='Spinmillion'?'Matchbook':'Spinmillion';if(binding[other]!=null)selections={...selections,[other]:binding[other]};}
   const explicit=Object.keys(selections).filter(s=>Number.isInteger(selections[s]));
   let anchor=explicit.length===1?all.find(c=>c.source===explicit[0]&&c.tabId===selections[explicit[0]]):null;
   if(explicit.length===2||(explicit.length===0&&binding?.manual)){resolved=explicit.length?{...selections}:{Spinmillion:binding.Spinmillion,Matchbook:binding.Matchbook};mode='manual';if(explicit.length)binding={...resolved,manual:true,events:Object.fromEntries(all.filter(c=>resolved[c.source]===c.tabId).map(c=>[c.source,c.eventId]))};}
   else{
    if(!anchor&&explicit.length===0&&binding){
     for(const source of ['Spinmillion','Matchbook']){
      const c=candidates[source].find(c=>c.tabId===binding[source]&&c.eventId===binding.events[source]);
      if(c){anchor=c;break;}
     }
     // A bound tab closing or navigating must not redirect to an unrelated match.
     if(!anchor){issues.push('Paired match changed or closed. Use Pair active match.');}
    }
    if(!anchor&&!binding&&explicit.length===0)anchor=all.find(c=>c.tabId===options.anchorTabId);
    if(!anchor&&!binding&&explicit.length===0){
     const pairs=[];for(const a of candidates.Spinmillion)for(const b of candidates.Matchbook)if(agrees(metadata.get(a.tabId),metadata.get(b.tabId)))pairs.push([a,b]);
     if(pairs.length===1)anchor=pairs[0][0];
     else if(candidates.Spinmillion.length===1)anchor=candidates.Spinmillion[0];
     else if(candidates.Matchbook.length===1)anchor=candidates.Matchbook[0];
    }
    if(anchor){
     resolved[anchor.source]=anchor.tabId;
     const other=anchor.source==='Spinmillion'?'Matchbook':'Spinmillion';
     for(const c of candidates[other])pairingChecks.push({source:other,tabId:c.tabId,label:c.label,reasons:explain(metadata.get(anchor.tabId),metadata.get(c.tabId))});
     const matches=candidates[other].filter(c=>agrees(metadata.get(anchor.tabId),metadata.get(c.tabId)));
     const previous=candidates[other].find(c=>binding?.[other]===c.tabId&&binding.events[other]===c.eventId);
     if(binding?.[other]!=null){
      if(previous){resolved[other]=previous.tabId;if(!matches.includes(previous))issues.push('Bound fixture details changed or are missing. Check fixture details.');}
      else issues.push(other+' paired event changed or closed. Use Pair active match.');
     }else if(matches.length===1)resolved[other]=matches[0].tabId;
     else issues.push(matches.length?'Multiple matching '+other+' events — choose a window in details.':'No verified '+other+' match found. Open or reload its event page, or choose a window in details.');
     binding={...binding,...resolved,manual:explicit.length>0&&resolved[other]!=null,events:{...binding?.events,...Object.fromEntries(all.filter(c=>resolved[c.source]===c.tabId).map(c=>[c.source,c.eventId]))}};
    }else if(!issues.length)issues.push('Pairing is ambiguous. Open a match and use Pair active match, or choose windows in details.');
   }
  }
  for(const source of ['Spinmillion','Matchbook']){
   const choices=candidates[source],specified=resolved[source]!=null;
   const choice=specified?choices.find(c=>c.tabId===resolved[source]&&(!metadataRead||!binding?.events[source]||c.eventId===binding.events[source])):!metadataRead&&choices.length===1?choices[0]:null;
   if(!choice){issues.push(specified?`${source} selected window is closed or no longer on its event. Choose a window.`:choices.length?`Choose a ${source} window.`:`Open the match on ${source}.`);continue;}
   selectedTabs[source]=choice.tabId;
   const tab=tabs.find(t=>t.id===choice.tabId);
   try{
    const network=await networkRead(tab,options);if(network?.error)throw Error(network.error);
    let data={prototype:true,source,readOnly:true,bets:[]};
    if(source==='Spinmillion'){
     try{const frames=(await pageRead(browser.tabs.executeScript(tab.id,{file:'reader.js',allFrames:true,matchAboutBlank:true}))).filter(f=>f?.source===source);const populated=frames.filter(f=>f.bets?.length);if(populated.length>1)throw Error('Ambiguous betslip frames');data=populated[0]||frames[0]||data;}catch{data.domError='Betslip could not be read.';}
     for(const b of data.bets||[]){const id=b.eventPath?.match(/-(\d+)(?:[/?#]|$)/)?.[1];const e=network.event;const norm=s=>(s||'').trim().replace(/\s+/g,' ').toLowerCase();b.eventId=id||null;b.pageEventId=choice.eventId;b.fixtureLinkStatus=id&&id!==choice.eventId?'DIFFERENT_EVENT':'UNVERIFIED';if(e?.available&&id===e.eventId&&norm(e.home)===norm(b.home)&&norm(e.away)===norm(b.away)){b.fixtureLinkStatus='PAGE_METADATA_LINKED';b.networkEvent={eventId:e.eventId,category:e.category,competition:e.competition,kickoffUTC:e.kickoffUTC};}}
    }
    const current=context(await browser.tabs.get(tab.id));if(!current||current.eventId!==choice.eventId||current.source!==source||current.eventPath!==choice.eventPath){issues.push(`${source} match changed while reading. Refresh both windows.`);selectedTabs[source]=null;continue;}
    snapshots.push({...data,source,network,capturedAt:new Date().toISOString(),pageEventPath:choice.eventPath,browserTabId:tab.id,browserWindowId:tab.windowId,extensionVersion:browser.runtime.getManifest().version});
   }catch{issues.push(`${source} window could not be read. Refresh both windows.`);}
  }
  return {snapshots,candidates,issues,selectedTabs,mode,pairingChecks};
 }};}
 function createWindowReader(deps){
  const readers=new Map();
  return {async read(options={}){
   if(!Number.isInteger(options.windowId)||options.windowId<0)throw Error('A specific Firefox window is required.');
   if(!readers.has(options.windowId))readers.set(options.windowId,create(deps));
   return readers.get(options.windowId).read(options.selectedTabs||{},options);
  },forget:windowId=>readers.delete(windowId)};
 }
 globalThis.PairedTabs={create,createWindowReader};
})();
