/* Exact, allowlisted market matching and isolated-position arithmetic. */
(() => {
 const norm=s=>typeof s==='string'?s.normalize('NFC').trim().replace(/\s+/g,' ').toLowerCase():'';
 // Club-specific aliases; never discard youth, gender or reserve labels.
 const teamAliases=Object.freeze({'liverpool fc':'liverpool','villarreal cf':'villarreal'});
 const team=s=>teamAliases[s]||s;
 const money=n=>Math.round((n+Number.EPSILON)*100)/100;
 const age=(t,now)=>typeof t==='string'&&Number.isFinite(Date.parse(t))?(now-Date.parse(t))/1000:null;
 function doubleChance(label,event){
  const home=team(norm(event?.home)),away=team(norm(event?.away));
  if(!home||!away||home===away)return null;
  const shortcut={'1x':'home-draw','x1':'home-draw','12':'home-away','21':'home-away','x2':'draw-away','2x':'draw-away'};
  if(shortcut[label])return shortcut[label];
  const parts=label.split(/\s+or\s+|\s*\/\s*/);if(parts.length!==2)return null;
  const slot=v=>v==='draw'||v==='x'?'draw':team(v)===home||v==='1'?'home':team(v)===away||v==='2'?'away':null;
  const slots=parts.map(slot);if(slots.includes(null)||slots[0]===slots[1])return null;
  return ['home','draw','away'].filter(v=>slots.includes(v)).join('-');
 }
 function marketKey(m,o,event){
  const n=norm(m.name),label=norm(o.label),spec=m.specifiers||'';
  if(!label||/[{}]/.test(label))return null;
  const half=/^(?:1st half|first half)(?:\s*-\s*|\s+)/.test(n),base=n.replace(/^(?:1st half|first half)(?:\s*-\s*|\s+)/,'');
  const period=half?'first-half':'full-time';
  if(['1x2','match odds','match result'].includes(base)&&!spec)return `${period}|result|${team(label)}`;
  if(['both teams to score','both teams score'].includes(base)&&!spec&&['yes','no'].includes(label))return `${period}|btts|${label}`;
  if(base==='double chance'&&!spec){const selection=doubleChance(label,event);return selection?`${period}|double-chance|${selection}`:null;}
  if(base==='draw no bet'&&!spec)return `${period}|dnb|${team(label)}`;
  if(base==='correct score'&&!spec){const score=label.match(/^(\d{1,2})\s*[:\-]\s*(\d{1,2})$/);return score?`${period}|score|${Number(score[1])}-${Number(score[2])}`:null;}
  if(['total','total goals','over/under','over / under'].includes(base)){
   const outcome=label.match(/^(over|under)\s+(\d+(?:\.\d+)?)$/),line=Number(outcome?.[2]);
   // Half-goal lines have no partial wins or pushes. Other Asian lines need a separate model.
   if(!outcome||line%1!==0.5)return null;
   if(spec){const s=spec.match(/^total=(\d+(?:\.\d+)?)$/);if(!s||Number(s[1])!==line)return null;}
   return `${period}|total|${outcome[1]}|${line}`;
  }
  return null;
 }
 function rank(book,exchange,{identityStatus,now=Date.now(),minimumLiquidity=0,sortBy='spread',commissionPercent=0,minimumBackOdds=null,maximumBackOdds=null,maximumCashLossPercent=null,minimumFreeConversion=null,marketKind=null,period=null,freshOnly=false,limit=5}={}){
  if(identityStatus!=='IDENTITY_CANDIDATE'||!book||!exchange||!Number.isFinite(minimumLiquidity)||minimumLiquidity<0||!Number.isFinite(commissionPercent)||commissionPercent<0||commissionPercent>=100)return [];
  for(const [value,min]of [[minimumBackOdds,1.000000001],[maximumBackOdds,1.000000001],[maximumCashLossPercent,0],[minimumFreeConversion,0]])if(value!==null&&(!Number.isFinite(value)||value<min))return [];
  if(minimumBackOdds!==null&&maximumBackOdds!==null&&minimumBackOdds>maximumBackOdds)return [];
  if(marketKind&&!['result','total','btts','score','dnb','double-chance'].includes(marketKind)||period&&!['first-half','full-time'].includes(period))return [];
  const index=new Map();
  for(const m of exchange.markets||[])for(const o of m.outcomes||[]){const key=marketKey(m,o,exchange);if(!key)continue;const entries=index.get(key)||[];entries.push({m,o});index.set(key,entries);}
  const bookCounts=new Map();for(const m of book.markets||[])for(const o of m.outcomes||[]){const k=marketKey(m,o,book);if(k)bookCounts.set(k,(bookCounts.get(k)||0)+1);}
  const rows=[];
  for(const m of book.markets||[])for(const o of m.outcomes||[]){
   const key=marketKey(m,o,book);if(!key||bookCounts.get(key)!==1||index.get(key)?.length!==1||!Number.isFinite(o.odds)||o.odds<=1||![undefined,null,false,0].includes(o.blocked))continue;
   const [candidatePeriod,kind]=key.split('|');
   if(marketKind&&kind!==marketKind||period&&candidatePeriod!==period||minimumBackOdds!==null&&o.odds<minimumBackOdds||maximumBackOdds!==null&&o.odds>maximumBackOdds)continue;
   if((sortBy==='free-return'||minimumFreeConversion!==null)&&kind==='dnb')continue;
   const {m:em,o:eo}=index.get(key)[0];if(em.status!=='open'||eo.status!=='open')continue;
   const quotes=(eo.prices||[]).filter(p=>p.side==='lay'&&p.currency==='GBP'&&Number.isFinite(p.odds)&&p.odds>1&&Number.isFinite(p.availableAmount)&&p.availableAmount>0).sort((a,b)=>a.odds-b.odds);
   const q=quotes.find(p=>p.availableAmount>=minimumLiquidity);if(!q)continue;
   const bookObservedAt=o.pricesObservedAt||m.observedAt||book.generatedAt,layObservedAt=q.observedAt;
   const ba=age(bookObservedAt,now),la=age(layObservedAt,now),spread=q.odds-o.odds;
   const refreshFailed=[book.priceRefresh,exchange.priceRefresh].some(r=>r&&['http-error','request-error','wrong-event','context-changed','no-prices','unexpected-response','unsafe-event-id','api-error','older-response'].includes(r.status));
   rows.push({id:[m.id,m.specifiers||'',o.id||o.label,em.id,eo.id||eo.label].join('|'),key,market:m.name,exchangeMarket:em.name,selection:o.label,exchangeSelection:eo.label,backOdds:o.odds,layOdds:q.odds,spread,spreadPercent:spread/o.odds*100,cashCostPercent:100*(1-o.odds*(1-commissionPercent/100)/(q.odds-commissionPercent/100)),freeConversionPercent:100*(o.odds-1)*(1-commissionPercent/100)/(q.odds-commissionPercent/100),liquidity:q.availableAmount,currency:'GBP',bookObservedAt,layObservedAt,bookAge:ba,layAge:la,stale:ba===null||la===null||ba< -5||la< -5||ba>30||la>30,earlyPayout:o.earlyPayout===true,voidPossible:key.includes('|dnb|'),marketVerified:false,refreshFailed});
  }
  return rows.filter(r=>(maximumCashLossPercent===null||r.cashCostPercent<=maximumCashLossPercent+1e-10)&&(minimumFreeConversion===null||r.freeConversionPercent+1e-10>=minimumFreeConversion)&&(!freshOnly||!r.stale&&!r.refreshFailed)).sort((a,b)=>(sortBy==='free-return'?b.freeConversionPercent-a.freeConversionPercent:sortBy==='cash-loss'?a.cashCostPercent-b.cashCostPercent:a.spreadPercent-b.spreadPercent)||b.liquidity-a.liquidity||a.id.localeCompare(b.id)).slice(0,limit===null?undefined:limit);
 }
 function calculate({backOdds,layOdds,stake,commissionPercent,type='cash',liquidity}={}){
  if(![backOdds,layOdds,stake,commissionPercent].every(Number.isFinite)||backOdds<=1||layOdds<=1||stake<=0||stake>1e9||commissionPercent<0||commissionPercent>=100||!['cash','free'].includes(type))return null;
  const c=commissionPercent/100,free=type==='free',layStake=money(stake*(backOdds-(free?1:0))/(layOdds-c));
  if(layStake<=0)return null;
  const liability=money(layStake*(layOdds-1)),ifBackWins=money(stake*(backOdds-1)-liability),ifBackLoses=money(layStake*(1-c)-(free?0:stake));
  return {layStake,liability,ifBackWins,ifBackLoses,worst:Math.min(ifBackWins,ifBackLoses),liquidityEnough:Number.isFinite(liquidity)&&layStake<=liquidity};
 }
 function copyText(r,c,{fixture,kickoffUTC,exchangeName='Matchbook',stake,commissionPercent,type='cash',bookEventId,exchangeEventId}={}){
  return [`${fixture} · ${kickoffUTC||'Kickoff unverified'}`,`Market: ${r.market} → ${r.exchangeMarket}`,`BACK Spinmillion: ${r.selection}`,`Back odds: ${r.backOdds}`,`Back stake: GBP ${Number(stake).toFixed(2)} (${type==='free'?'free bet, stake not returned':'cash'})`,`LAY ${exchangeName}: ${r.exchangeSelection}`,`Lay odds: ${r.layOdds}`,`Lay stake: GBP ${c.layStake.toFixed(2)}`,`Liability: GBP ${c.liability.toFixed(2)}`,`Liquidity at quoted price: GBP ${r.liquidity.toFixed(2)}`,`Commission: ${commissionPercent}%`,`Net if back wins: GBP ${c.ifBackWins.toFixed(2)}`,`Net if back loses: GBP ${c.ifBackLoses.toFixed(2)}`,`Observed — bookie: ${r.bookObservedAt}; exchange: ${r.layObservedAt}`,`Event IDs — bookie: ${bookEventId||'?'}; exchange: ${exchangeEventId||'?'}`,`Estimate only. Confirm identical settlement rules. Assumes no other exchange positions.${r.earlyPayout?' Early payout effects excluded.':''}${r.voidPossible?' Draw voids both cash bets; voucher void rules need checking.':''}`].join('\n');
 }
 globalThis.OddsMatcher={rank,calculate,copyText,marketKey,teamAliases};
})();
