const {test}=require('node:test'),assert=require('node:assert/strict');
require('../local-diagnostics.js');
const data={source:'Spinmillion',readOnly:true,bets:[],network:{eventId:'123'}};
test('local writing starts disabled and stops when disabled',async()=>{
 let writes=0;const c=SpinLocalDiagnostics.create({send:async()=>{writes++;return {ok:true,savedAt:'now'}},onStatus(){},onFailure(){}});
 await c.publish(data);assert.equal(writes,0);c.setEnabled(true);await c.publish(data);assert.equal(writes,1);c.setEnabled(false);await c.publish(data);assert.equal(writes,1);
});
test('native failure stops automatic retries and reports setup instruction',async()=>{
 let writes=0,status='';const c=SpinLocalDiagnostics.create({send:async()=>{writes++;throw Error('No such native application')},onStatus:s=>status=s,onFailure(){}});
 c.setEnabled(true);await c.publish(data);await c.publish(data);assert.equal(writes,1);assert.match(status,/setup/i);assert.equal(c.enabled,false);
});
test('successful capture carries only the fixed capture operation and snapshot',async()=>{
 let payload,status='';const c=SpinLocalDiagnostics.create({send:async p=>{payload=p;return {ok:true,savedAt:'2026-10-20T13:00:00Z'}},onStatus:s=>status=s,onFailure(){}});
 c.setEnabled(true);await c.publish(data);assert.deepEqual(payload,{type:'capture',snapshot:data});assert.match(status,/Saved locally/);
});
test('turning off while native response is pending does not show connected status',async()=>{
 let resolve,status='';const c=SpinLocalDiagnostics.create({send:()=>new Promise(r=>resolve=r),onStatus:s=>status=s,onFailure(){}});
 c.setEnabled(true);const p=c.publish(data);c.setEnabled(false);resolve({ok:true,savedAt:'now'});await p;assert.equal(status,'Local saving is off.');
});
