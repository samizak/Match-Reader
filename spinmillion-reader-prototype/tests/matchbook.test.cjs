const {test}=require('node:test'),assert=require('node:assert/strict');
require('../matchbook-store.js');
const base='https://api.matchbook.com/edge/rest/events/1084275028330024';
const url=base+'?odds-type=DECIMAL&exchange-type=back-lay&currency=GBP';
const event={id:'1084275028330024',name:'AS Roma vs Slovan Bratislava',start:'2026-10-20T12:00:00.000Z','sport-id':15,'meta-tags':[{id:15,type:'SPORT',name:'Soccer'},{id:16,type:'COMPETITION',name:'U19 UEFA Youth League Champions League Path'}],status:'open',live:true,markets:[{id:'1084275029280021','event-id':'1084275028330024',name:'Both Teams To Score','market-type':'both_teams_to_score',status:'open',runners:[{id:'1084275029450024',name:'No',status:'open',prices:[{side:'back','decimal-odds':1.9,'available-amount':100},{side:'lay','decimal-odds':1.93,'available-amount':1239}]}]}]};
function store(){const s=new MatchbookNetwork.Store();s.ingest(MatchbookNetwork.route(url),event,{requestStartedAt:100,observedAt:200});return s;}
test('only documented sports event GET paths are eligible; private routes stay excluded',()=>{
 assert.equal(MatchbookNetwork.route(url).kind,'event');for(const p of ['/edge/rest/security/session','/edge/rest/account/balance','/edge/rest/offers','/edge/rest/events/123/offer'])assert.equal(MatchbookNetwork.route('https://api.matchbook.com'+p),null);assert.equal(MatchbookNetwork.route(url.replace('api.matchbook.com','evil.example')),null);assert.equal(MatchbookNetwork.route(base+'/markets/12/runners/13/prices').kind,'prices');
});
test('event metadata and distinct back/lay liquidity are preserved',()=>{
 const e=store().snapshot(event.id);assert.equal(e.fixture,event.name);assert.equal(e.kickoffUTC,event.start);assert.equal(e.competition,event['meta-tags'][1].name);assert(e.teamClassMarkers.includes('U19'));const prices=e.markets[0].outcomes[0].prices;assert.equal(prices.find(p=>p.side==='lay').odds,1.93);assert.equal(prices.find(p=>p.side==='lay').availableAmount,1239);assert.equal(prices[0].currency,'GBP');assert.equal(e.actualStartUTC,null);assert.equal(e.source,'Matchbook');
});
test('non-decimal quotes are retained raw and never silently treated as decimal',()=>{
 const s=new MatchbookNetwork.Store(),data=JSON.parse(JSON.stringify(event));data.markets[0].runners[0].prices=[{side:'lay',odds:-110,'available-amount':10}];s.ingest(MatchbookNetwork.route(url.replace('DECIMAL','US')),data);const p=s.snapshot(event.id).markets[0].outcomes[0].prices[0];assert.equal(p.odds,null);assert.equal(p.rawOdds,-110);assert.equal(p.oddsType,'US');
});
test('filtered price updates preserve the opposite side, clear an empty side, and reject older responses',()=>{
 const s=store(),r=MatchbookNetwork.route(base+'/markets/1084275029280021/runners/1084275029450024/prices?odds-type=DECIMAL&exchange-type=back-lay&currency=GBP&side=lay');s.ingest(r,{prices:[{side:'lay','decimal-odds':1.94,'available-amount':25}]},{requestStartedAt:101,observedAt:201});let ps=s.snapshot(event.id).markets[0].outcomes[0].prices;assert.equal(ps.find(p=>p.side==='lay').odds,1.94);assert.equal(ps.find(p=>p.side==='back').odds,1.9);s.ingest(r,{prices:[]},{requestStartedAt:102,observedAt:202});s.ingest(r,{prices:[{side:'lay','decimal-odds':2,'available-amount':99}]},{requestStartedAt:101,observedAt:203});ps=s.snapshot(event.id).markets[0].outcomes[0].prices;assert.equal(ps.some(p=>p.side==='lay'),false);assert.equal(ps.length,1);
});
test('unknown currency/format and ambiguous event URL remain unverified',()=>{
 const s=new MatchbookNetwork.Store(),data=JSON.parse(JSON.stringify(event));delete data.markets[0].runners[0].prices[0]['decimal-odds'];data.markets[0].runners[0].prices[0].odds=1.9;s.ingest(MatchbookNetwork.route(base),data);const p=s.snapshot(event.id).markets[0].outcomes[0].prices[0];assert.equal(p.currency,null);assert.equal(p.odds,null);assert.equal(MatchbookNetwork.eventIdFromURL('https://www.matchbook.com/events/soccer/12345678/87654321'),null);assert.equal(MatchbookNetwork.eventIdFromURL('https://www.matchbook.com/events/soccer/12345678/roma-vs-slovan'),'12345678');
});
test('timezone-free starts and unsafe numeric IDs cannot establish fixture identity',()=>{
 const s=new MatchbookNetwork.Store();s.ingest(MatchbookNetwork.route(url),{...event,start:'2026-10-20T13:00:00'});assert.equal(s.snapshot(event.id).kickoffUTC,null);const bad=new MatchbookNetwork.Store();bad.ingest(MatchbookNetwork.route(url),{...event,id:9007199254740994});assert.equal(bad.snapshot(event.id).available,false);
});
test('stored output omits arbitrary credentials and only exposes safe schema diagnostics',()=>{
 const s=new MatchbookNetwork.Store();s.ingest(MatchbookNetwork.route(url),{...event,'session-token':'SECRET',account:{balance:100}});assert(!JSON.stringify(s.snapshot(event.id)).includes('SECRET'));assert(!JSON.stringify(s.snapshot(event.id)).includes('balance'));assert.equal(s.diagnostics(event.id).selectedEvent.metadataCaptured,true);
});
test('explicit unrecognized quote currency or side cannot fall back to request defaults',()=>{
 const s=new MatchbookNetwork.Store(),data=JSON.parse(JSON.stringify(event));data.markets[0].runners[0].prices=[{side:'unknown-side',odds:1.9,currency:'UNKNOWN','odds-type':'UNKNOWN','available-amount':10}];s.ingest(MatchbookNetwork.route(url+'&side=lay'),data);const q=s.snapshot(event.id).markets[0].outcomes[0].prices[0];assert.equal(q.currency,null);assert.equal(q.side,null);assert.equal(q.odds,null);assert.equal(q.oddsType,null);
});
