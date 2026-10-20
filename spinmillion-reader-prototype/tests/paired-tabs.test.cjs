const {test}=require('node:test'),assert=require('node:assert/strict');
require('../paired-tabs.js');
const spin={id:1,windowId:10,url:'https://www.spinmillion757.com/gb/sport/psg-barcelona-2722259853606268954'};
const mb={id:2,windowId:20,url:'https://www.matchbook.com/events/soccer/34605784179800023/psg-barcelona'};
function setup(tabs=[spin,mb]){
 const injected=[];let queryInfo;const browser={runtime:{getManifest:()=>({version:'0.6.1'})},tabs:{query:async q=>{queryInfo=q;return tabs.map(t=>({...t}))},get:async id=>({...tabs.find(t=>t.id===id)}),executeScript:async id=>{injected.push(id);return [{source:'Spinmillion',readOnly:true,bets:[]}]}}};
 const reader=PairedTabs.create({browser,networkRead:async tab=>({source:tab.id===1?'Spinmillion':'Matchbook',eventId:tab.id===1?'2722259853606268954':'34605784179800023',event:{available:true,fixture:'Paris Saint-Germain vs FC Barcelona',home:'Paris Saint-Germain',away:'FC Barcelona'}})});
 return {reader,injected,queryInfo:()=>queryInfo,browser};
}
test('reads one event from each of two windows, even if only Matchbook is focused',async()=>{
 const h=setup();const p=await h.reader.read({});assert.equal(p.snapshots.length,2);assert.equal(p.snapshots.find(s=>s.source==='Spinmillion').browserWindowId,10);assert.equal(p.snapshots.find(s=>s.source==='Matchbook').browserWindowId,20);assert.equal(h.queryInfo().currentWindow,undefined);assert.deepEqual(h.injected,[1]);
});
test('multiple tabs from one source require an explicit selection instead of guessing',async()=>{
 const extra={...spin,id:3,windowId:30,url:'https://www.spinmillion757.com/gb/sport/other-9999999999999999999'};
 const h=setup([spin,mb,extra]);let p=await h.reader.read({});assert.equal(p.snapshots.some(s=>s.source==='Spinmillion'),false);assert(p.issues.some(i=>i.includes('Choose')&&i.includes('Spinmillion')));
 p=await h.reader.read({Spinmillion:1,Matchbook:2});assert.equal(p.snapshots.length,2);assert.equal(p.selectedTabs.Spinmillion,1);
});
test('a closed selected tab does not silently switch to a different match',async()=>{
 const h=setup([mb]);const p=await h.reader.read({Spinmillion:1,Matchbook:2});assert.equal(p.snapshots.length,1);assert(p.issues.some(i=>/Spinmillion/.test(i)));assert.equal(p.selectedTabs.Spinmillion,null);
});
test('navigation while reading clears that source rather than returning the previous fixture',async()=>{
 const h=setup();h.browser.tabs.get=async id=>id===1?{...spin,url:'https://www.spinmillion757.com/gb/sport/changed-9999999999999999999'}:{...mb};const p=await h.reader.read({});assert.equal(p.snapshots.some(s=>s.source==='Spinmillion'),false);assert(p.issues.some(i=>/changed/i.test(i)));
});
test('explicit selections stay bound to the intended tabs when two matches are open on both sites',async()=>{const otherSpin={...spin,id:3,windowId:30,url:'https://www.spinmillion757.com/gb/sport/other-9999999999999999999'},otherMB={...mb,id:4,windowId:40,url:'https://www.matchbook.com/events/soccer/99999999999999999/other'};const h=setup([otherMB,otherSpin,spin,mb]);const p=await h.reader.read({Spinmillion:1,Matchbook:2});assert.equal(p.issues.length,0);assert.deepEqual(p.snapshots.map(s=>s.browserTabId),[1,2]);assert.equal(p.candidates.Spinmillion.length,2);assert.equal(p.candidates.Matchbook.length,2);});
