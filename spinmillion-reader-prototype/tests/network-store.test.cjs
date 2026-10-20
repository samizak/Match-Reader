const {test}=require('node:test');
const assert=require('node:assert/strict');
require('../network-store.js');
const id='2722838592442470402',g=1792499067794;
const feed={kind:'feed',stream:'prematch',eventId:id};
const desc={scheduled:1792521900,sport:'1',category:'2',tournament:'3',competitors:[{id:'3',name:'Wolverhampton Wanderers'},{id:'2',name:'Portsmouth FC'}]};
const initial={generated:g,epoch:1,events:{[id]:{desc,markets:{'1':{'':{'2':{k:'4.2'}}}}}}};
const update=(generated,patch,epoch=1)=>({generated,epoch,events:{[id]:patch}});
test('delayed metadata is retained after a newer price-only global patch',()=>{
 const s=new SpinNetwork.Store();s.ingest({...feed,eventId:null},update(g+10,{markets:{'1':{'':{'2':{k:'4.3'}}}}}));s.ingest(feed,initial);
 assert.equal(s.snapshot(id).available,true);
 assert.equal(s.snapshot(id).kickoffUTC,'2026-10-20T18:45:00.000Z');
 assert.equal(s.snapshot(id).markets[0].outcomes[0].odds,4.2);
});
test('live stream epoch does not erase prematch fixture data',()=>{
 const s=new SpinNetwork.Store();s.ingest(feed,initial);s.ingest({...feed,eventId:null,stream:'live'},update(g+10,{markets:{}},2));
 assert.equal(s.snapshot(id).available,true);assert.equal(s.snapshot(id).markets.length,1);
});
test('global polling cannot make unchanged prices look fresh',()=>{
 const s=new SpinNetwork.Store();s.ingest(feed,initial);s.ingest({...feed,eventId:null},update(g+10,{state:{}}));
 assert.equal(s.snapshot(id).generatedAt,new Date(g).toISOString());
});
test('newer market patches still apply and old prices cannot revive removed outcomes',()=>{
 const s=new SpinNetwork.Store();s.ingest(feed,initial);s.ingest({...feed,eventId:null},update(g+2,{markets:{'1':{'':{'2':null}}}}));s.ingest(feed,initial);
 assert.equal(s.snapshot(id).markets[0].outcomes.length,0);
});
test('an epoch change within the same stream invalidates old event data',()=>{
 const s=new SpinNetwork.Store();s.ingest(feed,initial);s.ingest({...feed,eventId:null},update(g+10,{state:{}},2));assert.equal(s.snapshot(id).available,false);
});
test('capture diagnostics distinguish polling from a selected event response',()=>{
 const s=new SpinNetwork.Store();s.ingest({...feed,eventId:null},update(g+1,{state:{}}));const d=s.diagnostics(id);
 assert.equal(d.feeds.prematch.global,1);assert.equal(d.selectedEvent.responses,0);assert.equal(d.selectedEvent.metadataCaptured,false);
 s.ingest(feed,initial);assert.equal(s.diagnostics(id).selectedEvent.responses,1);assert.equal(s.diagnostics(id).selectedEvent.metadataCaptured,true);
});
test('null live entry does not delete separate prematch metadata',()=>{
 const s=new SpinNetwork.Store();s.ingest(feed,initial);s.ingest({...feed,stream:'live'},update(g+1,null,2));assert.equal(s.snapshot(id).available,true);
});
test('selected event is captured even when unrelated fixtures have filled the cache',()=>{
 const s=new SpinNetwork.Store(),events={};
 for(let i=0;i<1500;i++)events['900000000000000'+String(i).padStart(4,'0')]={state:{}};
 s.ingest({...feed,eventId:null,stream:'live'},{generated:g,epoch:2,events});
 s.ingest(feed,initial);
 assert.equal(s.snapshot(id).available,true);
 assert.equal(s.snapshot(id).fixture,'Wolverhampton Wanderers vs Portsmouth FC');
 assert.equal(s.snapshot(id).kickoffUTC,'2026-10-20T18:45:00.000Z');
 assert.equal(s.snapshot(id).markets[0].outcomes[0].odds,4.2);
 assert.equal(s.diagnostics(id).selectedEvent.metadataCaptured,true);
 assert(Object.keys(s.events).length<=1500);
 // A later broad feed cannot evict the selected event.
 const more={};for(let i=0;i<300;i++)more['800000000000000'+String(i).padStart(4,'0')]={state:{}};
 s.ingest({...feed,eventId:null},{generated:g+5,epoch:1,events:more});
 assert.equal(s.snapshot(id).available,true);
});
test('an explicit event quote response confirms unchanged odds without changing provider generation time',()=>{const s=new SpinNetwork.Store();s.ingest(feed,initial,{observedAt:100000});assert.equal(s.snapshot(id).markets[0].outcomes[0].pricesObservedAt,new Date(100000).toISOString());s.ingest(feed,initial,{observedAt:110000});assert.equal(s.snapshot(id).markets[0].outcomes[0].pricesObservedAt,new Date(110000).toISOString());assert.equal(s.snapshot(id).generatedAt,new Date(g).toISOString());});
test('score-only and unrelated quote patches cannot reconfirm untouched odds',()=>{const s=new SpinNetwork.Store();s.ingest(feed,initial,{observedAt:100000});s.ingest({...feed,eventId:null},update(g+10,{state:{},markets:{'1':{'':{'3':{k:'3.0'}}}}}),{observedAt:110000});const r=s.snapshot(id).markets[0].outcomes;assert.equal(r.find(o=>o.id==='2').pricesObservedAt,new Date(100000).toISOString());assert.equal(r.find(o=>o.id==='3').pricesObservedAt,new Date(110000).toISOString());});
