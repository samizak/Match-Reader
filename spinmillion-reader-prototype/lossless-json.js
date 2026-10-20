/* Preserve plain integer tokens beyond JS's safe range before JSON.parse rounds
   them. Decimal prices and quoted text are left untouched. No eval or repairs. */
(() => {
 function parseSportsJSON(raw){
  if(typeof raw!=='string')throw new TypeError('Expected JSON text.');
  const number=/-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y,parts=[];let i=0,last=0;
  while(i<raw.length){
   if(raw[i]==='"'){
    i++;
    while(i<raw.length){if(raw[i]==='\\'){i+=2;continue;}if(raw[i++]==='"')break;}
    continue;
   }
   if(raw[i]==='-'||raw[i]>='0'&&raw[i]<='9'){
    number.lastIndex=i;const match=number.exec(raw);
    if(match){const token=match[0],end=number.lastIndex;
     if(/^-?\d+$/.test(token)&&!Number.isSafeInteger(Number(token))){parts.push(raw.slice(last,i),JSON.stringify(token));last=end;}
     i=end;continue;
    }
   }
   i++;
  }
  parts.push(raw.slice(last));return JSON.parse(parts.join(''));
 }
 globalThis.SportsJSON={parse:parseSportsJSON};
})();
