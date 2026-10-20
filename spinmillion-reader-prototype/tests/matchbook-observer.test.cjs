const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
function harness(){
 const handlers=[],filters=[];let read,tabURL='https://www.matchbook.com/events/soccer/1084275028330024/roma-vs-slovan';
 const browser={runtime:{id:'reader',onMessage:{addListener:f=>read=f}},browserAction:{onClicked:{addListener(){}}},sidebarAction:{open(){}},tabs:{onRemoved:{addListener(){}},get:async()=>({id:1,url:tabURL})},webRequest:{onBeforeRequest:{addListener:f=>handlers.push(f)},filterResponseData(){const f={written:[],write:b=>f.written.push(Buffer.from(b)),close(){f.closed=true},disconnect(){}};filters.push(f);return f;}}};
 const ctx=vm.createContext({setTimeout,clearTimeout,browser,URL,TextDecoder,Uint8Array,Date,Intl,Map,Set});for(const file of ['lossless-json.js','network-store.js','matchbook-store.js','paired-tabs.js','price-refresh.js','background.js'])vm.runInContext(fs.readFileSync('spinmillion-reader-prototype/'+file,'utf8'),ctx);
 return {filters,handlers,setURL:u=>tabURL=u,read:()=>read({type:'reader-network-read',tabId:1},{id:'reader'}),request:async(url,body,method='GET')=>{const before=filters.length;handlers[1]({url,tabId:1,method,timeStamp:Date.now(),requestId:'request'});if(filters.length===before)return null;const f=filters.at(-1),raw=Buffer.from(typeof body==='string'?body:JSON.stringify(body));f.ondata({data:Uint8Array.from(raw).buffer});f.onstop();await new Promise(r=>setImmediate(r));return {filter:f,raw};}};
}
const url='https://api.matchbook.com/edge/rest/events/1084275028330024?odds-type=DECIMAL&currency=GBP';
const body={id:'1084275028330024',name:'AS Roma vs Slovan Bratislava',start:'2026-10-20T12:00:00Z',markets:[]};
test('real observer routes Matchbook bytes to its own store without modifying the site response',async()=>{
 const h=harness(),r=await h.request(url,body);assert(Buffer.concat(r.filter.written).equals(r.raw));assert(r.filter.closed);const data=await h.read();assert.equal(data.source,'Matchbook');assert.equal(data.event.fixture,body.name);assert.equal(data.event.kickoffUTC,'2026-10-20T12:00:00.000Z');assert.equal(data.responses,1);
});
test('observer never filters login/account/orders routes or non-GET event calls',async()=>{
 const h=harness();for(const path of ['security/session','account/balance','offers'])assert.equal(await h.request('https://api.matchbook.com/edge/rest/'+path,body),null);assert.equal(await h.request(url,body,'POST'),null);assert.equal(h.filters.length,0);
});
test('a Matchbook response cannot be exported as Spinmillion data, and reload clears old event state',async()=>{
 const h=harness();await h.request(url,body);h.setURL('https://www.spinmillion757.com/gb/sport/fixture-1084275028330024');let data=await h.read();assert.equal(data.source,'Spinmillion');assert.equal(data.responses,0);assert.equal(data.event.available,false);
 h.setURL('https://www.matchbook.com/events/1084275028330024/fixture');h.handlers[0]({tabId:1});data=await h.read();assert.equal(data.responses,0);assert.equal(data.event.available,false);
});

test('passive API responses preserve full numeric int64 event and runner IDs before parsing',async()=>{const h=harness(),eid='34605803678400023';h.setURL('https://www.matchbook.com/events/soccer/'+eid+'/liverpool-vs-villarreal');const raw='{"id":34605803678400023,"name":"Liverpool vs Villarreal","start":"2026-10-20T19:00:00Z","markets":[{"id":34605803678400024,"name":"Match Odds","status":"open","runners":[{"id":34605803678400025,"name":"Draw","status":"open","prices":[{"side":"lay","decimal-odds":4.8,"available-amount":100}]}]}]}';await h.request('https://api.matchbook.com/edge/rest/events/'+eid+'?currency=GBP&odds-type=DECIMAL',raw);const r=await h.read();assert.equal(r.event.eventId,eid);assert.equal(r.event.available,true);assert.equal(r.event.markets[0].id,'34605803678400024');assert.equal(r.event.markets[0].outcomes[0].id,'34605803678400025');assert.equal(r.event.markets[0].outcomes[0].prices[0].odds,4.8);});
