/* Presentation of projected captures. No order placement or hedge sizing. */
(() => {
 const stamp=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))?Date.parse(v):null;
 const age=(v,now)=>stamp(v)===null?null:Math.floor((now-stamp(v))/1000);
 const ago=n=>n===null?'unknown':n<0?'clock mismatch':n<60?`${n}s ago`:n<3600?`${Math.floor(n/60)}m ago`:`${Math.floor(n/3600)}h ago`;
 function model(w={}, {now=Date.now(),betIndex=0,marketId=null}={}){
  const issues=[...(w.pairing?.issues||[])],sources={};
  for(const name of ['Spinmillion','Matchbook']){
   const r=w.sources?.[name],s=r?.snapshot,e=s?.network?.event;
   const times=[e?.generatedAt,e?.observedAt,e?.live?.stateGeneratedAt,e?.live?.clockGeneratedAt].map(stamp).filter(v=>v!==null);
   sources[name]={record:r,event:e||null,savedAge:age(r?.savedAt,now),feedAge:times.length?Math.floor((now-Math.max(...times))/1000):null};
  }
  const bets=sources.Spinmillion.record?.snapshot?.bets||[];
  const selectedBet=bets[Math.min(Math.max(0,betIndex),Math.max(0,bets.length-1))]||null;
  const market=w.selectedMarket,loadingMarket=!!marketId&&market?.id!==marketId;
  function best(quotes,side){
   const usable=quotes.filter(p=>p.side===side&&Number.isFinite(p.odds)&&p.odds>1&&Number.isFinite(p.availableAmount)&&p.availableAmount>0);
   const currencies=new Set(usable.map(q=>q.currency||'?'));
   if(currencies.size>1){issues.push('Conflicting quote currencies. No combined liquidity is shown.');return null;}
   usable.sort((a,b)=>side==='back'?b.odds-a.odds:a.odds-b.odds);
   if(!usable.length)return null;
   const q=usable[0],seconds=age(q.observedAt,now);
   if(!q.currency)issues.push('Quote currency is unconfirmed.');
   return {...q,age:seconds,stale:seconds===null||seconds< -5||seconds>30};
  }
  const rows=loadingMarket?[]:(market?.outcomes||[]).map(o=>({id:o.id,label:o.label||'Unknown runner',status:o.status,back:best(o.prices||[],'back'),lay:best(o.prices||[],'lay')}));
  const quotes=rows.flatMap(r=>[r.back,r.lay]).filter(Boolean);
  const stale=quotes.some(q=>q.stale);
  const betMismatch=selectedBet&&(selectedBet.fixtureLinkStatus==='DIFFERENT_EVENT'||selectedBet.eventId&&selectedBet.eventId!==sources.Spinmillion.event?.eventId);
  let check={tone:'caution',title:'Capture both fixtures',detail:'Read the same event on Spinmillion and Matchbook to begin.'};
  const haveBoth=Object.values(sources).every(s=>s.event?.available);
  if(haveBoth){
   if(w.comparison?.status==='CONFLICT')check={tone:'danger',title:'Different fixtures',detail:'The selected windows do not agree. Open the same event on both sites.'};
   else if(betMismatch)check={tone:'danger',title:'Betslip is a different fixture',detail:'The bookmaker selection belongs to another event. Check it before comparing odds.'};
   else if(Object.values(sources).some(s=>s.savedAge===null||s.savedAge< -5||s.savedAge>30))check={tone:'caution',title:'Captures need refreshing',detail:'Read both event tabs again. One saved capture is over 30 seconds old or has an unknown timestamp.'};
   else if(w.comparison?.status==='IDENTITY_CANDIDATE')check={tone:'success',title:'Fixture details agree',detail:'Names, competition and scheduled kickoff match.'};
   else check={tone:'caution',title:'Fixture check incomplete',detail:'Some identity details are missing or differ. Review the reasons below.'};
  }
  if(w.livePair&&!haveBoth)check={tone:'caution',title:issues.length?'Choose both match windows':'Reload the selected match pages',detail:issues.join(' ')||'The windows are linked, but event metadata has not arrived. Reload each selected page once with the extension running.'};
  if(w.livePair&&w.pairing?.issues?.length&&check.tone!=='danger')check={tone:'caution',title:'Window pairing needs attention',detail:issues.join(' ')};
  if(stale)issues.push('Prices need refreshing. Quoted odds are over 30 seconds old or unverified.');
  if(market?.status&&market.status!=='open')issues.push(`Exchange market is ${market.status}.`);
  if(w.truncated)issues.push('The workspace is a shortened view. Full captures remain in diagnostics.');
  return {sources,bets,selectedBet,market,loadingMarket,rows,stale,issues:[...new Set(issues)],check,canSizeHedge:false,
   reasons:w.comparison?.reasons||[],marketOptions:w.marketOptions||[],
   betLinked:!!selectedBet&&selectedBet.fixtureLinkStatus==='PAGE_METADATA_LINKED'&&!betMismatch,
   identityCandidate:haveBoth&&w.comparison?.status==='IDENTITY_CANDIDATE'&&check.title==='Fixture details agree',
   quotesFresh:quotes.length>0&&!stale&&market?.status==='open'&&rows.every(r=>r.status==='open')&&!issues.some(v=>/currenc/i.test(v))};
 }
 const node=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
 const pair=(label,value)=>{const row=node('div',undefined,'detail-row');row.append(node('span',label),node('strong',value||'Unknown'));return row;};
 function kickoff(e){
  const raw=e?.scheduledKickoffUTC||e?.kickoffUTC;if(stamp(raw)===null)return {local:'Kickoff unverified',utc:'Timezone-qualified kickoff missing'};
  const d=new Date(raw);
  return {local:new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZoneName:'short'}).format(d),utc:new Intl.DateTimeFormat('en-GB',{timeZone:'UTC',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(d)+' UTC'};
 }
 function createView(root,{onSourceChange=()=>{},onAutoPair=()=>{},onRefreshPrices=()=>{},autoPairLabel='Pair active match',bookiePickerLabel='Spinmillion'}={}){
  let current={},options={},selectedId=null,copyValue=null,lastRows=[];
  const check=node('section',undefined,'check-panel');
  const details=node('details',undefined,'fixture-details'),summary=node('summary','Fixture & window details');
  const windowControls=node('div',undefined,'window-controls'),fixtures=node('div',undefined,'fixture-stack');
  const autoPair=node('button',autoPairLabel,'secondary-button');autoPair.type='button';autoPair.addEventListener('click',onAutoPair);
  const pairingStatus=node('p','Automatically pairs open event tabs.','microcopy');
  details.append(summary,autoPair,pairingStatus,windowControls,fixtures);
  const sourcePickers={};
  for(const source of ['Spinmillion','Matchbook']){const label=node('label',source==='Spinmillion'?bookiePickerLabel:source),picker=node('select');picker.setAttribute('aria-label',source+' match window');picker.addEventListener('change',()=>{if(picker.value)onSourceChange(source,picker.value);});label.append(picker);windowControls.append(label);sourcePickers[source]=picker;}
  const feedStatus=node('div',undefined,'price-refresh-status');
  const section=node('section',undefined,'workspace-section opportunities'),comparisonTitle=node('h2','Top 5 comparisons');section.append(comparisonTitle);
  const sort=node('select');sort.setAttribute('aria-label','Rank comparisons');for(const [value,label]of [['spread','Smallest spread'],['cash-loss','Lowest cash loss · after commission'],['free-return','Highest free-bet conversion']]){const o=node('option',label);o.value=value;sort.append(o);}sort.className='rank-picker';section.append(sort);
  const filter=node('label',undefined,'liquidity-filter'),enabled=node('input'),minimum=node('input');enabled.type='checkbox';enabled.checked=true;minimum.type='number';minimum.min='0';minimum.step='1';minimum.value='100';minimum.disabled=false;minimum.setAttribute('aria-label','Minimum available lay liquidity in GBP');filter.append(enabled,node('span','Min. lay liquidity £'),minimum);section.append(filter);
  const criteria=node('details',undefined,'optional-criteria'),criteriaSummary=node('summary','Optional criteria · off'),criteriaContent=node('div',undefined,'criteria-content');criteria.append(criteriaSummary,criteriaContent);section.append(criteria);
  const bounds={};
  function criterion(key,label,initial,min,step='0.01'){
   const wrap=node('div',undefined,'criterion'),labelNode=node('label'),toggle=node('input'),value=node('input');toggle.type='checkbox';value.type='number';value.value=initial;value.min=String(min);value.step=step;value.disabled=true;value.setAttribute('aria-label',label);toggle.setAttribute('aria-label','Enable '+label);labelNode.append(toggle,node('span',label));wrap.append(labelNode,value);criteriaContent.append(wrap);bounds[key]={toggle,value};toggle.addEventListener('change',()=>{value.disabled=!toggle.checked;refreshOffers();});value.addEventListener('input',refreshOffers);
  }
  criterion('minimumBackOdds','Min. bookie odds','2.00',1.01);
  criterion('maximumBackOdds','Max. bookie odds','10.00',1.01);
  criterion('maximumCashLossPercent','Max. cash loss %','5',0);
  criterion('minimumFreeConversion','Min. free-bet conversion %','70',0);
  function selectFilter(label,choices){const wrap=node('label',label),select=node('select');for(const [value,text]of choices){const o=node('option',text);o.value=value;select.append(o);}select.setAttribute('aria-label',label);wrap.append(select);criteriaContent.append(wrap);select.addEventListener('change',refreshOffers);return select;}
  const marketFilter=selectFilter('Market',[['','All supported markets'],['result','Match result'],['total','Goals over / under'],['btts','Both teams to score'],['double-chance','Double chance'],['score','Correct score'],['dnb','Draw no bet']]);
  const periodFilter=selectFilter('Period',[['','Full match & first half'],['full-time','Full match only'],['first-half','First half only']]);
  const freshLabel=node('label',undefined,'fresh-filter'),freshOnly=node('input');freshOnly.type='checkbox';freshLabel.append(freshOnly,node('span','Fresh prices only'));criteriaContent.append(freshLabel);freshOnly.addEventListener('change',refreshOffers);
  criteriaContent.append(node('p','Uses commission below; blank previews before fees. Single bets only: offer eligibility, acca and minimum-leg rules are not checked.','microcopy'));
  const reset=node('button','Reset criteria','secondary-button');reset.addEventListener('click',()=>{for(const b of Object.values(bounds)){b.toggle.checked=false;b.value.disabled=true;}marketFilter.value='';periodFilter.value='';freshOnly.checked=false;enabled.checked=true;minimum.value='100';minimum.disabled=false;refreshOffers();});criteriaContent.append(reset);
  const showAllLabel=node('label',undefined,'liquidity-filter'),showAll=node('input'),betCount=node('span');showAll.type='checkbox';showAll.setAttribute('aria-label','Show all matched bets');showAllLabel.append(showAll,node('span','Show all matched bets'),betCount);section.append(showAllLabel);showAll.addEventListener('change',refreshOffers);
  const list=node('div',undefined,'opportunity-list'),note=node('p',undefined,'microcopy');section.append(list,note);
  const calculator=node('section',undefined,'workspace-section calculator');calculator.append(node('h2','Match bet values'));
  const chosen=node('p','Select a comparison above.','chosen-bet');calculator.append(chosen);
  const quoteStatus=node('p',undefined,'microcopy selected-quote-status'),refreshSelected=node('button','Refresh these prices','secondary-button');refreshSelected.type='button';refreshSelected.disabled=true;refreshSelected.addEventListener('click',onRefreshPrices);calculator.append(quoteStatus,refreshSelected);
  const inputs=node('div',undefined,'calculator-inputs');
  function input(label,type,value){const wrap=node('label',label),e=node('input');e.type=type;e.value=value;e.min='0';e.step='0.01';wrap.append(e);inputs.append(wrap);return e;}
  const stake=input('Bookie stake £','number','10'),commission=input('Commission %','number','2');commission.placeholder='Enter rate';commission.max='99.99';
  const typeLabel=node('label','Bet type'),type=node('select');for(const [value,label]of [['cash','Cash bet'],['free','Free bet · stake not returned']]){const o=node('option',label);o.value=value;type.append(o);}typeLabel.append(type);inputs.append(typeLabel);calculator.append(inputs);
  const values=node('div',undefined,'calculator-values'),result=node('div',undefined,'calculation-result'),warning=node('p',undefined,'microcopy stale-text'),copy=node('button','Copy all bet values','primary-button copy-plan');copy.disabled=true;
  const copyStatus=node('p',undefined,'microcopy');copy.addEventListener('click',async()=>{if(!copyValue||copy.disabled)return;try{await navigator.clipboard.writeText(copyValue);copyStatus.textContent='Bet values copied.';}catch{copyStatus.textContent='Clipboard unavailable. Values remain visible below.';}});
  calculator.append(values,result,warning,copy,copyStatus);
  root.replaceChildren(check,details,feedStatus,section,calculator);
  function sourceCard(name,s){
   const card=node('article',undefined,'fixture-card'),e=s.event;
   card.append(node('strong',name,'source-name'));
   if(!e?.available){card.append(node('p',s.record?'Reload this match page once.':'No current event tab read.','microcopy'));return card;}
   card.append(node('h3',e.fixture||[e.home,e.away].filter(Boolean).join(' vs ')),node('p',e.competition||'Competition unknown','microcopy'));
   const when=kickoff(e);card.append(pair('Kickoff',when.local),node('p',when.utc,'utc-line'));
   const l=e.live;if(l?.score||l?.matchTime)card.append(node('p',[l.score?`${l.score.home??'?'}–${l.score.away??'?'}`:null,l.matchTime,l.periodLabel].filter(Boolean).join(' · '),'match-live'));
   card.append(node('p','Read '+ago(s.savedAge)+' · Feed '+ago(s.feedAge),'microcopy'));return card;
  }
  const format=n=>'£'+Number(n).toFixed(2),signed=n=>(n>=0?'+':'−')+format(Math.abs(n));
  function refreshCalculator(){
   values.replaceChildren();result.replaceChildren();copyValue=null;copy.disabled=true;copyStatus.textContent='';quoteStatus.textContent='';refreshSelected.disabled=true;
   const row=lastRows.find(r=>r.id===selectedId);
   if(!row){chosen.textContent='Select a comparison above.';warning.textContent='';return;}
   chosen.textContent=`${row.selection} · ${row.market}`;refreshSelected.disabled=false;
   quoteStatus.textContent=`Selected quotes · Bookie ${ago(row.bookAge===null?null:Math.floor(row.bookAge))} / Lay ${ago(row.layAge===null?null:Math.floor(row.layAge))}`;
   quoteStatus.setAttribute('title',`Bookie quote: ${row.bookObservedAt||'Unverified'}; lay quote: ${row.layObservedAt||'Unverified'}`);
   values.append(pair('Spinmillion back odds',String(row.backOdds)),pair('Matchbook lay odds',String(row.layOdds)),pair('Available at lay price',format(row.liquidity)));
   const entered=commission.value.trim()!==''&&stake.value.trim()!=='';
   const c=entered?OddsMatcher.calculate({backOdds:row.backOdds,layOdds:row.layOdds,stake:Number(stake.value),commissionPercent:Number(commission.value),type:type.value,liquidity:row.liquidity}):null;
   if(!c){warning.textContent='Enter a positive stake and your commission rate (0 if none).';return;}
   const blocked=row.stale||row.refreshFailed||!c.liquidityEnough||type.value==='free'&&row.voidPossible;
   function copyField(label,value){const line=pair(label,value),button=node('button','Copy','copy-field');button.disabled=blocked;button.setAttribute('aria-label','Copy '+label);button.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(value.replace('£',''));copyStatus.textContent=label+' copied.';}catch{copyStatus.textContent='Clipboard unavailable.';}});line.append(button);values.append(line);}
   copyField('Back stake',format(Number(stake.value)));copyField('Lay stake',format(c.layStake));copyField('Liability',format(c.liability));
   result.append(pair('Net if back wins',signed(c.ifBackWins)),pair('Net if back loses',signed(c.ifBackLoses)));
   if(type.value==='cash'&&row.voidPossible)result.append(pair('Net if draw / both void','£0.00'));
   const messages=[];if(row.refreshFailed)messages.push('A price request failed. Copying waits for a successful response; see price status above.');if(row.stale)messages.push(`Prices not recently confirmed: bookie ${ago(row.bookAge===null?null:Math.floor(row.bookAge))}, lay ${ago(row.layAge===null?null:Math.floor(row.layAge))}. A recent feed update may not include this selection. Use Refresh these prices.`);if(!c.liquidityEnough)messages.push(`Needs ${format(c.layStake)} lay liquidity; ${format(row.liquidity)} captured.`);if(type.value==='free'&&row.voidPossible)messages.push('Free-bet void rules unverified. Choose a market without a void outcome.');if(row.earlyPayout)messages.push('Early-payout effects excluded.');
   warning.textContent=messages.join(' ');copy.disabled=blocked;
   const b=current.quoteSources?.Spinmillion,e=current.quoteSources?.Matchbook;
   copyValue=OddsMatcher.copyText(row,c,{fixture:b?.fixture,kickoffUTC:b?.scheduledKickoffUTC||b?.kickoffUTC,stake:Number(stake.value),commissionPercent:Number(commission.value),type:type.value,exchangeName:'Matchbook',bookEventId:b?.eventId,exchangeEventId:e?.eventId});
  }
  function refreshOffers(){
   const b=current.quoteSources?.Spinmillion,e=current.quoteSources?.Matchbook;
   const min=enabled.checked?Number(minimum.value):0;
   const activeFilters=Object.fromEntries(Object.entries(bounds).map(([key,b])=>[key,b.toggle.checked?(b.value.value.trim()===''?NaN:Number(b.value.value)):null]));
   const count=Object.values(bounds).filter(b=>b.toggle.checked).length+Number(!!marketFilter.value)+Number(!!periodFilter.value)+Number(freshOnly.checked);criteriaSummary.textContent=count?`Optional criteria · ${count} active`:'Optional criteria · off';
   lastRows=OddsMatcher.rank(b,e,{...activeFilters,marketKind:marketFilter.value||null,period:periodFilter.value||null,freshOnly:freshOnly.checked,identityStatus:current.pairing?.issues?.length?'UNVERIFIED':current.comparison?.status,now:options.now||Date.now(),sortBy:sort.value,commissionPercent:commission.value.trim()===''?0:Number(commission.value),limit:null,minimumLiquidity:enabled.checked&&minimum.value.trim()===''?NaN:min});
   comparisonTitle.textContent=showAll.checked?'All matched bets':'Top 5 comparisons';
   const total=lastRows.length;betCount.textContent=`(${total})`;if(!showAll.checked)lastRows=lastRows.slice(0,5);
   list.replaceChildren();
   for(const [index,row]of lastRows.entries()){
    const button=node('button',undefined,'opportunity'+(row.id===selectedId?' selected':'')+(row.stale?' stale-offer':''));button.setAttribute('aria-pressed',String(row.id===selectedId));
    const title=node('div',undefined,'offer-title');title.append(node('strong',`${index+1}. ${row.selection}`),node('span',row.market));
    const prices=node('div',undefined,'offer-prices');for(const [label,value]of [['Spinmillion',row.backOdds],['Matchbook lay',row.layOdds],[sort.value==='free-return'?'Free-bet conversion':'Spread',sort.value==='free-return'?`${row.freeConversionPercent.toFixed(1)}%`:`${row.spreadPercent>=0?'+':''}${row.spreadPercent.toFixed(2)}%`]]){const cell=node('span');cell.append(node('small',label),node('strong',String(value)));prices.append(cell);}
    const calc=OddsMatcher.calculate({backOdds:row.backOdds,layOdds:row.layOdds,stake:Number(stake.value),commissionPercent:commission.value.trim()===''?0:Number(commission.value),type:type.value,liquidity:row.liquidity});
    const extra=node('small',`Gap ${row.spread>=0?'+':''}${row.spread.toFixed(2)} · ${format(row.liquidity)} available${row.refreshFailed?' · REFRESH FAILED':row.stale?' · STALE':''}${calc?` · ${type.value==='free'?'Free-bet':'Cash'} net ${signed(calc.worst)}${commission.value.trim()===''?' before fees':''}`:''}`,'offer-meta');
    const context=node('small',`${format(Number(stake.value)||0)} ${type.value==='free'?'voucher':'cash stake'} · ${commission.value.trim()===''?'commission not set':commission.value+'% commission'} · Bookie ${ago(row.bookAge===null?null:Math.floor(row.bookAge))} / Lay ${ago(row.layAge===null?null:Math.floor(row.layAge))}`,'offer-meta price-context');
    button.append(title,prices,extra,context);button.addEventListener('click',()=>{selectedId=row.id;refreshOffers();});list.append(button);
   }
   if(!lastRows.length)list.append(node('p',current.comparison?.status!=='IDENTITY_CANDIDATE'?'Fixture details must agree before comparing bets.':(enabled.checked||count)?'No matching selections meet your criteria.':'No supported matching markets captured. Reload both event pages.','empty-title'));
   note.textContent=lastRows.length?(sort.value==='free-return'?'Ranks cash recovered from a free bet, stake not returned'+(commission.value.trim()===''?' · before fees.':` · after ${commission.value}% commission.`):sort.value==='cash-loss'?'Ranks estimated cash loss'+(commission.value.trim()===''?' before fees.':` after ${commission.value}% commission.`)+' Tap a row to calculate.':'Spread = (lay − back) ÷ back. Smaller first. Tap a row to calculate.'):'Matches exact market, period, line and outcome. Unsupported markets are skipped.';
   refreshCalculator();
  }
  sort.addEventListener('change',()=>{if(sort.value==='free-return')type.value='free';refreshOffers();});
  enabled.addEventListener('change',()=>{minimum.disabled=!enabled.checked;refreshOffers();});minimum.addEventListener('input',refreshOffers);for(const e of [stake,commission])e.addEventListener('input',refreshOffers);type.addEventListener('change',()=>{if(type.value==='free')sort.value='free-return';else if(sort.value==='free-return')sort.value='cash-loss';refreshOffers();});
  return {render(w,opts={}){
   current=w;options=opts;
   for(const source of ['Spinmillion','Matchbook']){const picker=sourcePickers[source],choices=w.pairing?.candidates?.[source]||[],sig=JSON.stringify(choices);if(picker.dataset.signature!==sig){picker.dataset.signature=sig;picker.replaceChildren();const blank=node('option',choices.length?'Choose a window…':'No event window found');blank.value='';picker.append(blank);for(const c of choices){const o=node('option',`Window ${c.windowId} · ${c.label}`);o.value=String(c.tabId);picker.append(o);}}picker.value=String(w.pairing?.selectedTabs?.[source]??'');}
   feedStatus.replaceChildren();
   for(const name of ['Spinmillion','Matchbook']){
    const state=w.quoteSources?.[name]?.priceRefresh;
    const failed=state&&['http-error','request-error','wrong-event','context-changed','no-prices','unexpected-response','unsafe-event-id','api-error','older-response'].includes(state.status);
    const descriptions={'http-error':`HTTP ${state?.httpStatus||'?'} · price request rejected`,'request-error':'Price request failed','wrong-event':'Different event ID received — ignored','unexpected-response':'Response missing a verifiable event ID','unsafe-event-id':'Event ID lost precision — ignored','api-error':'API error returned — quotes not refreshed','context-changed':'Match page changed','no-prices':'Response confirmed no usable quotes','older-response':'Older snapshot ignored; no recent quotes confirmed'};
    let description=state?.status==='newer-prices-retained'?'Newer live prices kept · '+ago(age(state.confirmedAt,opts.now||Date.now())):state?.status==='updated'?'Feed quotes received '+ago(age(state.confirmedAt,opts.now||Date.now()))+' · not every market':descriptions[state?.status]||'Waiting for price request';
    if(failed&&stamp(state.nextRetryAt)!==null&&Date.parse(state.nextRetryAt)>(opts.now||Date.now()))description+=' · retry in '+Math.ceil((Date.parse(state.nextRetryAt)-(opts.now||Date.now()))/1000)+'s';
    feedStatus.append(node('p',`${name}: ${description}`,failed?'stale-text':''));
   }
   const m=model(w,opts);check.className='check-panel tone-'+m.check.tone;check.replaceChildren();
   const tag=node('div',undefined,'check-eyebrow');tag.append(node('span','FIXTURE CHECK'),node('span',m.check.tone==='success'?'✓':m.check.tone==='danger'?'✕':'!','check-symbol'));
   const b=m.sources.Spinmillion.event;check.append(tag,node('h2',m.check.title),node('p',m.check.tone==='success'?`${b?.fixture||''} · ${kickoff(b).local}`:m.check.detail));
   for(const warning of w.comparison?.warnings||[])check.append(node('p',warning,'microcopy'));
   pairingStatus.textContent=w.pairing?.mode==='automatic'&&!w.pairing?.issues?.length?'Automatically paired · kickoff within 2 minutes.':w.pairing?.mode==='manual'?'Manually selected windows. Fixture checks still apply.':'Automatic pairing needs a unique fixture match. Choose below if needed.';
   summary.textContent='Fixture & window details'+(w.pairing?.issues?.length?' · needs attention':w.pairing?.mode==='automatic'?' · auto-paired':'');
   fixtures.replaceChildren(sourceCard('Spinmillion',m.sources.Spinmillion),sourceCard('Matchbook',m.sources.Matchbook));
   for(const alias of w.comparison?.nameAliasesApplied||[])fixtures.append(node('p',`Recognized club names: ${alias.spinmillion} = ${alias.matchbook}`,'microcopy'));
   if(w.pairing?.issues?.length)for(const candidate of w.pairing?.pairingChecks||[]){if(candidate.reasons?.length)fixtures.append(node('p',`${candidate.source} · ${candidate.label}: ${candidate.reasons.join(' · ')}`,'microcopy'));}
   if(m.reasons.length){const reasons=node('div',undefined,'check-reasons');for(const reason of m.reasons)reasons.append(node('p',reason));fixtures.append(reasons);}
   refreshOffers();return m;
  }};
 }
 globalThis.MatchWorkspace={model,createView};
})();
