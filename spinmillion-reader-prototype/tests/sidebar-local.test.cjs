const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
function harness(send,bets=[],event=null,source="Spinmillion"){
 const elements=new Map();function element(){return {textContent:'',value:'',checked:false,disabled:false,children:[],handlers:{},append(...x){this.children.push(...x)},replaceChildren(...x){this.children=x},addEventListener(k,f){this.handlers[k]=f}};}
 const query=s=>{if(!elements.has(s))elements.set(s,element());return elements.get(s)};
 let timer;const tab={id:1,url:source==='Matchbook'?'https://www.matchbook.com/events/soccer/1084275028330024/fixture?private=must-not-export':'https://www.spinmillion757.com/gb/sport/test-2722838592442470402?private=must-not-export'};
 const browser={runtime:{sendNativeMessage:send,getManifest:()=>({version:'0.3.0'}),sendMessage:async()=>({source,eventId:source==='Matchbook'?'1084275028330024':'2722838592442470402',responses:1,event:event||{available:false,warnings:['Missing metadata'],markets:[]}})},tabs:{query:async()=>[tab],executeScript:async()=>[{source:'Spinmillion',readOnly:true,prototype:true,bets}],onActivated:{addListener(){}},onUpdated:{addListener(){}}}};
 const ctx=vm.createContext({document:{querySelector:query,createElement:element},browser,URL,Date,setInterval:f=>{timer=f}});
 for(const file of ['local-diagnostics.js','sidebar.js'])vm.runInContext(fs.readFileSync('spinmillion-reader-prototype/'+file,'utf8'),ctx);
 return {query,tick:async()=>{timer();await new Promise(r=>setImmediate(r))}};
}
test('sidebar opt-in exports the current capture, starts refresh and omits URL queries',async()=>{
 const sent=[];const h=harness(async(name,payload)=>{sent.push({name,payload});return {ok:true,savedAt:'now'}});
 await h.query('#scan').handlers.click();assert.equal(sent.length,0);
 h.query('#local').checked=true;await h.query('#local').handlers.change();assert.equal(sent.length,1);assert.equal(sent[0].name,'spinmillion_reader');assert.equal(sent[0].payload.snapshot.extensionVersion,'0.3.0');assert.equal(sent[0].payload.snapshot.pageEventPath,'/gb/sport/test-2722838592442470402');assert(!JSON.stringify(sent).includes('must-not-export'));
 await h.tick();assert.equal(sent.length,2);
 h.query('#local').checked=false;await h.query('#local').handlers.change();await h.tick();assert.equal(sent.length,2);
});
test('missing native host unchecks local saving and does not retry every two seconds',async()=>{
 let calls=0;const h=harness(async()=>{calls++;throw Error('No such native application')});
 h.query('#local').checked=true;await h.query('#local').handlers.change();assert.equal(h.query('#local').checked,false);assert.match(h.query('#local-status').textContent,/setup/);await h.tick();assert.equal(calls,1);
});

test('a betslip entry for another event raises a prominent fixture mismatch warning',async()=>{
 let sent;const bet={source:'Spinmillion',home:'Paris Saint-Germain',away:'FC Barcelona',fixture:'Paris Saint-Germain vs FC Barcelona',eventPath:'/gb/sport/match-2722259853606268954',kickoff:{},warnings:[]};
 const h=harness(async(name,payload)=>{sent=payload;return {ok:true,savedAt:'now'}},[bet]);h.query('#local').checked=true;await h.query('#local').handlers.change();
 assert.match(h.query('#status').textContent,/FIXTURE MISMATCH/);assert.equal(sent.snapshot.bets[0].fixtureLinkStatus,'DIFFERENT_EVENT');assert.equal(sent.snapshot.bets[0].eventId,'2722259853606268954');
});

test('sidebar shows reported score and scheduled kickoff with a matching page selection',async()=>{
 const event={eventId:'2722838592442470402',available:true,home:'AS Roma',away:'Slovan Bratislava',fixture:'AS Roma vs Slovan Bratislava',competition:'U19 UEFA Youth League',teamClassMarkers:['U19'],kickoffUTC:'2026-10-20T12:00:00Z',warnings:[],markets:[],live:{score:{home:'2',away:'0'},matchTime:'71:23',periodLabel:'2nd half',statistics:{corners:{home:5,away:1}}}};
 const bet={source:'Spinmillion',home:event.home,away:event.away,fixture:event.fixture,eventPath:'/gb/sport/test-2722838592442470402',kickoff:{},warnings:[]};let payload;
 const h=harness(async(name,p)=>{payload=p;return {ok:true,savedAt:'now'}},[bet],event);h.query('#local').checked=true;await h.query('#local').handlers.change();
 const text=n=>[n.textContent,...n.children.map(text)].join(' ');const rendered=text(h.query('#network'));
 assert.match(rendered,/2 – 0/);assert.match(rendered,/71:23/);assert.match(rendered,/Scheduled kickoff/);assert.match(rendered,/Actual kickoff/);assert.match(rendered,/Not supplied by the feed/);assert.equal(payload.snapshot.bets[0].fixtureLinkStatus,'PAGE_METADATA_LINKED');
});

test('Matchbook tab displays API quotes and saves a Matchbook snapshot without claiming to read orders',async()=>{
 let payload;const event={source:'Matchbook',eventId:'1084275028330024',available:true,fixture:'AS Roma vs Slovan Bratislava',kickoffUTC:'2026-10-20T12:00:00Z',warnings:[],markets:[{id:'22',name:'Both Teams To Score',status:'open',outcomes:[{id:'33',label:'No',status:'open',prices:[{side:'lay',odds:1.93,availableAmount:1239,currency:'GBP'}]}]}]};
 const h=harness(async(name,p)=>{payload=p;return {ok:true,savedAt:'now'}},[],event,'Matchbook');h.query('#local').checked=true;await h.query('#local').handlers.change();const text=n=>[n.textContent,...n.children.map(text)].join(' ');const rendered=text(h.query('#network'));assert.match(rendered,/1.93/);assert.match(rendered,/1239 GBP/);assert.equal(payload.snapshot.source,'Matchbook');assert.match(payload.snapshot.notice,/orders are not parsed/);assert(!JSON.stringify(payload).includes('must-not-export'));
});
