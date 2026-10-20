/* Throwaway read-only prototype. No clicks, network requests, cookies or storage. */
(() => {
  function readSpin(root = document, pageURL = location.href) {
    const clean = s => (s || '').replace(/\s+/g, ' ').trim();
    const text = el => clean(el?.textContent);
    const sel = id => `[data-editor-id="${id}"]`;
    const visible = el => {
      if (!el || !el.isConnected || el.closest('[hidden], [aria-hidden="true"]')) return false;
      const w = el.ownerDocument.defaultView;
      const st = w.getComputedStyle(el);
      return st.display !== 'none' && st.visibility !== 'hidden' && el.getClientRects().length > 0;
    };
    const roots = [root];
    // Include accessible open shadow trees; closed trees cannot be inspected.
    for (let i=0; i<roots.length; i++) for (const el of roots[i].querySelectorAll('*')) {
      if (el.shadowRoot) roots.push(el.shadowRoot);
    }
    const all = q => roots.flatMap(r => [...r.querySelectorAll(q)]).filter(visible);
    const leaves = el => el ? [...el.querySelectorAll('*')].filter(n => !n.children.length && !['SVG','PATH','INPUT','BUTTON','STYLE','SCRIPT'].includes(n.tagName)).map(text).filter(Boolean) : [];
    const money = raw => /^\d+(?:\.\d{1,2})?$/.test(clean(raw)) ? Number(raw) : null;
    const norm = s => clean(s).toLocaleLowerCase('en-GB');
    const eventPath = raw => {
      try { return new URL(raw, pageURL).pathname.replace(/\/$/,''); } catch { return null; }
    };
    const boards = all(sel('scoreBoardCard'));
    const selections = all(sel('betslipSelection'));
    const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    // Include all distinct visible selections. Multiple selections are not automatically a single bet.
    const seen = new Set();
    const bets = selections.map(card => {
      const link = card.querySelector('a[href]');
      const oddsNode = card.querySelector(sel('betslipSelectionOdd'));
      const details = link ? [...link.children].find(n => !n.contains(oddsNode)) : null;
      const lines = leaves(details);
      const fixtureIndex = lines.findIndex(s => /\s+vs?\.?\s+/i.test(s));
      const fixture = fixtureIndex >= 0 ? lines[fixtureIndex] : null;
      const selection = fixtureIndex > 0 ? lines[fixtureIndex-1] : null;
      const market = fixtureIndex >= 0 ? lines[fixtureIndex+1] || null : null;
      const input = card.querySelector(sel('betslipStakeInput')+' input');
      const oddsRaw = text(oddsNode?.firstElementChild || oddsNode);
      const odds = money(oddsRaw);
      const stake = input ? money(input.value) : null;
      const relativePath = eventPath(link?.getAttribute('href'));
      const parts = fixture?.split(/\s+vs?\.?\s+/i) || [];
      const home = parts.length===2 ? parts[0] : null;
      const away = parts.length===2 ? parts[1] : null;
      const matchingBoards = boards.filter(board => {
        const content = board.querySelector(sel('scoreBoardContent'));
        const cols = [...(content?.firstElementChild?.children || [])];
        return cols.length === 3 && norm(cols[0].textContent)===norm(home) && norm(cols[2].textContent)===norm(away);
      });
      // Do not attach the currently open fixture's header to an unrelated betslip entry.
      const samePage = relativePath && relativePath === eventPath(pageURL);
      const header = samePage && matchingBoards.length===1 ? matchingBoards[0] : null;
      const categoryNode = header?.querySelector(sel('scoreBoardCategory'));
      const categoryParts = [];
      if (categoryNode) {
        const walk = categoryNode.ownerDocument.createTreeWalker(categoryNode, 4);
        while (walk.nextNode()) { const t = clean(walk.currentNode.textContent); if (t) categoryParts.push(t); }
      }
      const category = categoryParts.join(' / ') || null;
      const when = header?.querySelector(sel('prematchStartedAt'));
      const dateLabel = text(when?.firstElementChild) || null;
      const timeLabel = text(when?.querySelector('span')) || null;
      const warnings = [];
      if (!fixture || !home || !away) warnings.push('Fixture names could not be parsed.');
      if (!selection || !market) warnings.push('Selection or market is missing.');
      if (!odds || odds<=1) warnings.push('Valid decimal odds are missing.');
      if (stake===null || stake<=0) warnings.push('Enter a positive stake.');
      if (!header) warnings.push('No unique matching fixture header on the current page. Competition and kickoff are unverified.');
      if (!dateLabel || !timeLabel) warnings.push('Kickoff date/time are missing.');
      // A relative label plus local machine date does not establish the bookmaker's timezone.
      if (dateLabel) warnings.push('Bookmaker timezone is not supplied by this HTML. Kickoff instant is unverified; do not compare times automatically.');
      const classMarkers = category ? [...category.matchAll(/\b(?:u[- ]?\d{2}|under[- ]?\d{2}|women|ladies|reserves?|youth)\b/gi)].map(m=>m[0]) : [];
      return {
        source:'Spinmillion',status:'BETSLIP_ONLY_NOT_PLACED',fixture,home,away,
        sport:card.querySelector('[data-cy="sport-soccer"]')?'football':null,
        categoryRaw:category,teamClassMarkers:classMarkers,
        teamClass:classMarkers.length?'explicit markers present':'unknown — absence of a marker does not prove senior teams',
        eventPath:relativePath,selection,marketRaw:market,
        marketNormalized:norm(market)==='1x2'?'match-result':null,
        settlementScope:'unverified — must check market rules',
        odds,stake,currencyRaw:text(card.querySelector(sel('betslipStakeInput')+' i')) || null,
        expectedCashReturn:odds&&stake!==null?Math.round(odds*stake*100)/100:null,
        stakeType:'unknown — cash/free-bet not established',
        kickoff:{dateLabel,timeLabel,timezone:null,instant:null},
        browserTimezone:browserZone,capturedAt:new Date().toISOString(),warnings
      };
    }).filter(b=>{ const key=JSON.stringify([b.eventPath,b.selection,b.marketRaw,b.odds,b.stake]);if(seen.has(key))return false;seen.add(key);return true; });
    return {prototype:true,source:'Spinmillion',readOnly:true,frameHasBetslip:all('[data-cy="betslip"], '+sel('betslipContent')).length>0,bets,
      notice:bets.length?'Extraction only. No hedge or fixture match has been verified.':'No visible selections found. Add a selection and keep its betslip open.'};
  }
  globalThis.SpinmillionPrototypeReader = readSpin;
  return readSpin();
})();
