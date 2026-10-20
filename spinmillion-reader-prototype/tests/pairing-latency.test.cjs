const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function setup(){
 const tabs=[{id:1,url:'https://www.spinmillion757.com/gb/sport/psg-1111111111111111111'},{id:2,url:'https://www.matchbook.com/events/soccer/22222222222222222/psg'},{id:3,url:'https://www.spinmillion757.com/gb/sport/liverpool-3333333333333333333'},{id:4,url:'https://www.matchbook.com/events/soccer/44444444444444444/liverpool'}].map(t=>({...t,windowId:t.id<=2?10:20}));
 let listener;const releases=[],requests=[];
 const browser={runtime:{id:'reader',getManifest:()=>({version:'test'}),onMessage:{addListener:f=>listener=f}},browserAction:{onClicked:{addListener(){}}},sidebarAction:{open(){}},tabs:{query:async()=>tabs,get:async id=>tabs.find(t=>t.id===id),onRemoved:{addListener(){}},executeScript:async()=>[]},webRequest:{onBeforeRequest:{addListener(){}}}};
 const ctx=vm.createContext({setTimeout,clearTimeout,browser,URL,Date,Map,Set,Promise,console,SpinNetwork:{route:()=>null},MatchbookNetwork:{eventIdFromURL:url=>url.match(/\/(\d{6,})\//)[1]},PriceRefresh:{create:()=>({forget(){},refresh:tab=>{requests.push(tab.id);return new Promise(resolve=>releases.push(()=>resolve({status:'updated',confirmedAt:'2026-10-20T19:00:00Z'})));}})}});
 for(const name of ['paired-tabs.js','background.js'])vm.runInContext(fs.readFileSync('spinmillion-reader-prototype/'+name,'utf8'),ctx);
 ctx.fixtures=tabs.map(t=>({tabId:t.id,source:t.id%2?'Spinmillion':'Matchbook',event:{available:true,eventId:t.url.match(/(?:-|\/)(\d{6,})(?:\/|$)/)[1],home:t.id<=2?'PSG':'Liverpool',away:t.id<=2?'Barcelona':'Villarreal',sport:'Football',competition:'UEFA Champions League',kickoffUTC:'2026-10-20T19:00:00Z',teamClassMarkers:[]}}));
 vm.runInContext('for(const f of fixtures){sources.set(f.tabId,f.source);stores.set(f.tabId,{responses:1,diagnostics:()=>null,snapshot:()=>f.event});}',ctx);
 return {watch:options=>listener({type:'reader-window-read',refreshPrices:true,...options},{id:'reader'}),browser,ctx,requests,releases,read:options=>listener({type:'reader-pair-read',refreshPrices:true,...options},{id:'reader'})};
}
test('four-window pairing returns before unresolved HTTP requests and never queues behind them',async()=>{
 const h=setup();let finished=false;const pending=h.read({anchorTabId:1}).then(p=>{finished=true;return p});
 await new Promise(r=>setImmediate(r));
 assert.equal(finished,true,'fixture pairing must not wait for either price HTTP response');
 const p=await pending;assert.deepEqual(JSON.parse(JSON.stringify(p.selectedTabs)),{Spinmillion:1,Matchbook:2});assert.deepEqual(h.requests,[1,2]);
 const switched=await h.read({anchorTabId:3,resetPair:true});assert.equal(switched.selectedTabs.Spinmillion,3);assert.equal(switched.selectedTabs.Matchbook,4);
 await h.read({});assert.deepEqual(h.requests,[1,2,3,4],'pending price requests must coalesce');
 h.releases.forEach(f=>f());await new Promise(r=>setImmediate(r));
 const updated=await h.read({refreshPrices:false});assert(updated.snapshots.every(s=>s.network.priceRefresh.status==='updated'));
});

test('unresponsive Spinmillion page cannot block fixture pairing for a second',async()=>{
 const h=setup();h.browser.tabs.executeScript=()=>new Promise(()=>{});
 const started=performance.now();
 const pair=await h.read({anchorTabId:1});
 assert(performance.now()-started<900,'unresponsive betslip read must be bounded below one second');
 assert.equal(pair.selectedTabs.Matchbook,2);
 assert.equal(pair.snapshots[0].domError,'Betslip could not be read.');
 assert.equal(pair.snapshots[0].network.priceRefresh.confirmedAt,null,'neither a timeout nor pairing confirms a price');
 h.releases.forEach(f=>f());
});

test('discovery requests missing metadata even when that Matchbook tab is not paired yet',async()=>{
 const h=setup();vm.runInContext('stores.delete(2);sources.delete(2);',h.ctx);
 const pair=await h.read({anchorTabId:1});
 assert.equal(pair.selectedTabs.Matchbook,null,'missing metadata must not be treated as verified');
 await new Promise(r=>setImmediate(r));
 assert(h.requests.includes(2),'unselected Matchbook candidate must be able to bootstrap its metadata');
 h.releases.forEach(f=>f());
 vm.runInContext('const f=fixtures.find(f=>f.tabId===2);sources.set(2,f.source);stores.set(2,{responses:1,diagnostics:()=>null,snapshot:()=>f.event});',h.ctx);
 const resolved=await h.read({});assert.equal(resolved.selectedTabs.Matchbook,2,'next read pairs automatically after metadata arrives');
});

test('both split-window pairs return independently while all four API requests remain pending',async()=>{
 const h=setup();
 const left=await h.watch({windowId:10}),right=await h.watch({windowId:20});
 assert.deepEqual(Array.from(left.snapshots,s=>s.browserTabId),[1,2]);
 assert.deepEqual(Array.from(right.snapshots,s=>s.browserTabId),[3,4]);
 h.releases.forEach(f=>f());
});
