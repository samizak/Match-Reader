/* A sidebar belongs to one fixed Firefox window; it never lists other windows. */
(() => {
 function create({root,browser,getSave=()=>false,getAuto=()=>true,onStatus=()=>{}}){
  let workspace=null,busy=false,pending=false,revision=0;
  const actions=[];
  // Resolve once in this sidebar, not from the globally focused window on every tick.
  const windowId=browser.windows.getCurrent().then(w=>{if(!Number.isInteger(w.id)||w.id<0)throw Error('Could not identify this Firefox window.');return w.id;});
  function request(action,clear=false){revision++;if(clear){workspace=null;view.render({livePair:true,pairing:{issues:['Updating this window’s pair…']}});}actions.push(action);scan();}
  const view=MatchWorkspace.createView(root,{
   autoPairLabel:'Pair this window',bookiePickerLabel:'Spinmillion',
   onRefreshPrices:()=>request({force:true}),
   onAutoPair:()=>request({resetPair:true,force:true},true),
   onSourceChange:(source,id)=>request({selectedTabs:{[source]:Number(id)},force:true},true)
  });
  view.render({livePair:true,pairing:{issues:['Reading this window…']}});
  async function scan(force=false){
   if(busy){if(force||actions.length)pending=true;return;}
   busy=true;pending=false;const sequence=revision,action=actions.shift()||{};
   onStatus('Reading this window’s pair…');
   try{
    const id=await windowId;
    const active=await browser.tabs.query({windowId:id,active:true});
    const pair=await browser.runtime.sendMessage({type:'reader-window-read',windowId:id,anchorTabId:active[0]?.id,refreshPrices:true,force:force===true,...action});
    if(sequence!==revision)return;
    if(!Array.isArray(pair?.snapshots))throw Error('Reload the add-on to enable window pairing.');
    const {snapshots,...pairing}=pair;
    const response=await browser.runtime.sendNativeMessage('spinmillion_reader',{type:'workspace',livePair:true,snapshots,pairing,save:getSave()});
    if(sequence!==revision)return;
    if(!response?.ok||!response.workspace)throw Error('Local helper could not check this pair.');
    workspace={...response.workspace,pairing,quoteSources:Object.fromEntries(snapshots.map(s=>[s.source,{...s.network?.event,priceRefresh:s.network?.priceRefresh}]))};
    view.render(workspace);
    onStatus(getAuto()?'Automatic price updates enabled.':'Automatic refresh paused.');
   }catch(error){if(sequence===revision){workspace={livePair:true,pairing:{issues:[error.message||'Pair unavailable.']}};view.render(workspace);onStatus(error.message||'Pair unavailable.');}}
   finally{busy=false;if(pending||actions.length)scan();}
  }
  return {scan,tick:()=>{if(workspace)view.render(workspace);}};
 }
 globalThis.WindowPair={create};
})();
