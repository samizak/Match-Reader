const {test}=require('node:test'),assert=require('node:assert/strict');
require('../network-store.js');
const id='2723918377524531243',g=1792501200000;
const feed={kind:'feed',stream:'live',eventId:id};
const initial={generated:g,epoch:1,tournaments:{'t':{name:'U19 UEFA Youth League Champions League Path'}},events:{[id]:{desc:{scheduled:1792497600,type:'match',sport:'1',category:'c',tournament:'t',competitors:[{id:'h',name:'AS Roma'},{id:'a',name:'Slovan Bratislava'}]},state:{status:1,match_status:31,clock:{match_time:'45:00',timestamp:g-10000,stopped:true}},score:{home_score:'2',away_score:'0',statistics:{corners:{home:5,away:1}},period_scores:[{number:1,match_status_code:6,home_score:2,away_score:0}]},markets:{}}}};
function store(){const s=new SpinNetwork.Store();s.ingest({kind:'statuses'},{'6':'1st half','31':'Halftime'});s.ingest(feed,initial);return s;}
test('live scores, clock and period label come from captured fields',()=>{
 const e=store().snapshot(id);assert.equal(e.live.score.home,'2');assert.equal(e.live.score.away,'0');assert.equal(e.live.matchTime,'45:00');assert.equal(e.live.elapsedMatchSeconds,2700);assert.equal(e.live.periodLabel,'Halftime');assert.equal(e.live.clockStopped,true);assert.equal(e.live.statistics.corners.home,5);assert.equal(e.live.periodScores[0].home,2);assert.equal(e.live.clockTimestampUTC,new Date(g-10000).toISOString());
});
test('scheduled kickoff is distinguished from unknown actual start',()=>{
 const e=store().snapshot(id);assert.equal(e.kickoffUTC,'2026-10-20T12:00:00.000Z');assert.equal(e.actualStartUTC,null);assert.equal(e.scheduledKickoffUTC,e.kickoffUTC);assert.equal(e.live.clockMode,'reported_only_no_extrapolation');
});
test('identity keeps participant IDs and explicit youth competition markers',()=>{
 const e=store().snapshot(id);assert.equal(e.homeCompetitorId,'h');assert.equal(e.awayCompetitorId,'a');assert.equal(e.sportId,'1');assert.equal(e.categoryId,'c');assert(e.teamClassMarkers.some(x=>x.toLowerCase()==='u19'));assert.equal(e.eventType,'match');
});
test('score patches preserve untouched values, reject older updates and honour null deletion',()=>{
 const s=store();s.ingest({...feed,eventId:null},{generated:g+20,epoch:1,events:{[id]:{score:{home_score:'3'},state:{clock:{match_time:'46:12',stopped:false}}}}});let e=s.snapshot(id);assert.equal(e.live.score.home,'3');assert.equal(e.live.score.away,'0');assert.equal(e.live.matchTime,'46:12');assert.equal(e.live.clockStopped,false);
 s.ingest(feed,initial);assert.equal(s.snapshot(id).live.score.home,'3');
 s.ingest(feed,{generated:g+30,epoch:1,events:{[id]:{score:null,state:{clock:null}}}});e=s.snapshot(id);assert.equal(e.live.score,null);assert.equal(e.live.matchTime,null);
});
test('clock-only updates do not make unchanged score or price snapshots appear fresh',()=>{
 const s=store();const before=s.snapshot(id);s.ingest(feed,{generated:g+20,epoch:1,events:{[id]:{state:{clock:{match_time:'46:12'}}}}});const e=s.snapshot(id);assert.equal(e.live.stateGeneratedAt,new Date(g+20).toISOString());assert.equal(e.live.scoreGeneratedAt,before.live.scoreGeneratedAt);assert.equal(e.generatedAt,before.generatedAt);
});
test('missing score and clock stay unknown rather than implying 0-0 or not started',()=>{
 const s=new SpinNetwork.Store(),data=JSON.parse(JSON.stringify(initial));delete data.events[id].state;delete data.events[id].score;s.ingest(feed,data);const e=s.snapshot(id);assert.equal(e.live.score,null);assert.equal(e.live.matchTime,null);assert.equal(e.live.periodLabel,null);
});
test('status dictionary is accepted only from the observed public sports endpoint',()=>{
 assert.equal(SpinNetwork.route('https://api-h-c7818b61-608.sptpub.com/api/v1/descriptions/statuses/gb').kind,'statuses');assert.equal(SpinNetwork.route('https://evil.example/api/v1/descriptions/statuses/gb'),null);
});
