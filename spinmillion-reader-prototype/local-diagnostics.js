/* Fixed-purpose local export. No navigation, execution or betting commands. */
(() => {
 function create({send,onStatus,onFailure}){
  let enabled=false,version=0;
  return {
   get enabled(){return enabled;},
   setEnabled(value){enabled=!!value;version++;onStatus(enabled?'Waiting for a capture to save locally…':'Local saving is off.');},
   async publish(snapshot){
    if(!enabled)return;
    const current=version;
    try{
     const result=await send({type:'capture',snapshot});
     if(current!==version)return;
     if(result?.ok!==true)throw Error('Local helper rejected this capture.');
     onStatus('Saved locally · '+result.savedAt+(result.comparison?.status?' · Fixture comparison: '+result.comparison.status.replaceAll('_',' ').toLowerCase()+' (hedge unverified)':''));
    }catch{
     if(current!==version)return;
     enabled=false;version++;onFailure();
     onStatus('Local save failed. Run the helper setup command, then enable local saving again.');
    }
   }
  };
 }
 globalThis.SpinLocalDiagnostics={create};
})();
