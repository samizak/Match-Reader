## Double-chance and BTTS bet availability (v0.13.0)

Adds the three double-chance bets: home or draw, home or away, and draw or away. Exact fixture participant names and the existing club aliases map named selections to these propositions; 1X, 12 and X2 shorthand is also accepted. Periods remain distinct, and combined propositions such as double chance & total do not match a plain double-chance bet. The optional bet-type filter now includes Double chance.

BTTS Yes/No already had matching support but could disappear because the liquidity filter examined only the cheapest lay level. In the saved PSG capture, BTTS Yes had £0.10 at 1.32 but £135 at 1.33; No had £11 at 4.20, £80.71 at 4.30 and £106 at 4.40. With the default £100 minimum the old code discarded both selections. The matcher now selects the cheapest individual captured lay level meeting the configured minimum. It never adds liquidity across levels; displayed odds, receipt time, stake and liability use the selected level. Disabling the liquidity filter retains the cheapest positive-liquidity price. Existing freshness and calculator liquidity checks still apply.

A Show all matched bets checkbox with an eligible-bet count exposes comparisons beyond the default top five. It respects the current filters and remains inside this window's own pair. Selecting a bet from the expanded list fills the existing calculator. This does not introduce a global watchlist or claim support for every bet type offered by either provider.

Tests replay the saved PSG BTTS and double-chance response data to obtain five eligible bets at a £100 minimum. Other tests cover team aliases, shorthand, wrong outcomes, combined propositions, different periods, insufficient depth without summing levels, stale chosen levels and expanded-list selection. Historical liquidity-filter descriptions below are superseded by this price-level selection behaviour.

## One pair per split-screen browser window (v0.12.0)

This replaces the global multi-match dashboard. The Liverpool split-screen window shows only Liverpool; the PSG split-screen window shows only PSG. Keep each site's event tab in its corresponding Firefox window, with the sidebar open and Auto prices enabled in both windows. Each sidebar has its own calculator state, filters and stake inputs. It renders the existing compact fixture/odds/calculator interface without a global match list or navigation shortcuts.

A sidebar resolves its owning Firefox window once with windows.getCurrent. Every tab query and pair read uses that explicit window ID. Candidate lists, metadata discovery, explicit refresh and manual selections are constrained to that window. Changing browser focus does not redirect an existing sidebar. Pair bindings are stored independently by window ID and removed when a window closes. Pair this window retries only the local pair. Quotes still update through passive responses and the existing nonblocking API refresher, with normal identity and copy checks.

This uses Firefox browser-window membership. It does not claim access to a Firefox split-view group identifier. Within a window containing multiple event sets, Pair this window uses the active local event as its anchor and the same ambiguity checks apply. A matching event in another browser window is intentionally not used. Source tabs must remain together in their intended window.

Regression coverage runs two independent sidebar controllers and two independent split-window bindings, checks that focusing the other window cannot retarget them, rejects cross-window manual selections, preserves independent calculator inputs, and replays the saved PSG tabs which both belong to window 3316. Tests also keep all four price requests unresolved to confirm pairing does not await their HTTP responses. The all-pairs dashboard implementation and its navigation controls were removed.

Earlier sections below describe historical builds and are superseded by this window-scoped behaviour.

## Find both monitored matches clearly (v0.11.1)

Fixes the missing-PSG bookie-dropdown behaviour reproduced in v0.11.0: the monitor explicitly filtered each panel's Spinmillion candidates to its anchor tab. Liverpool's menu therefore could never list PSG. Generic Spinmillion page titles also made different event tabs hard to distinguish.

All open event candidates now retain their fixture names when metadata is available. The bookie dropdown lists them all and is labelled “switch monitored match”. Selecting another bookie match navigates to that match's existing panel; it does not overwrite the current panel's binding. Matchbook selection remains a manual override scoped to its own panel. Named match shortcuts at the top provide direct access to both panels, with their status and fresh spread summary.

The current saved v0.11.0 PSG capture contains Paris Saint-Germain / FC Barcelona on both sources, UEFA Champions League, 19:00 UTC on Spinmillion and 19:02 UTC on Matchbook, and a native IDENTITY_CANDIDATE result. A replay using sanitized identity fields and the captured live-betting URL pairs that PSG event correctly alongside Liverpool. This supports the metadata/identity path; it does not establish the precise UI state in the user's running sidebar, because pairing UI state was not saved with those captures. No identity checks were weakened by this navigation change.

## Monitor multiple open fixture pairs (v0.11.0)

The sidebar now lists every open Spinmillion event as an independent monitored match. With Liverpool and PSG open on both providers, it discovers two pairs and keeps requesting prices for both. Monitoring no longer has one shared “current pair” that is replaced when another match is selected.

Each match has a collapsible panel with a fixture status and a fresh-comparison spread summary. Both panels can stay open; collapsing a panel does not pause it. Its full view has its own top five, filters, ranking mode, stake, commission and calculator selection. These persist in that sidebar while the corresponding Spinmillion event remains open. The summary spread uses the default £100 minimum liquidity and 2% commission and fresh quotes, independently of custom filters inside the panel.

The main Refresh prices now button requests all monitored pairs. Refresh these prices in a calculator targets that pair. Retry automatic pairing inside a match retries that anchored fixture only; it does not switch another panel. A manual Matchbook choice applies only to its own match. All existing identity checks, the two-minute kickoff tolerance, ambiguity handling, quote freshness, liquidity and copy checks remain enforced.

Closing a Spinmillion event removes its panel; reopening or navigating to another event creates a new one with fresh inputs. Closing a paired exchange event leaves that match unavailable without redirecting it to a different fixture; other pairs continue. Monitoring state is in memory rather than persisted through browser/add-on restarts. One provider/native-helper failure is handled per match. Older in-flight results are ignored after a manual change to that match.

This uses the existing open-tab/API metadata integration, not Firefox split-screen membership or a Matchbook-wide event search. Keep the relevant event tabs open and at least one sidebar open with Auto prices enabled. Saving diagnostics is still optional; the legacy latest-source diagnostic files hold the most recently written captures, not a historical archive for every monitored pair. Live comparisons use each pair's passed-in captures and never fall back to these files.

## Show selected quote freshness explicitly (v0.10.4)

The feed-level success label previously said “Prices received”, although it only established that some quotes in an event response were accepted. A selected market can be older than those other quotes. That wording made a recent feed response appear to contradict the calculator's quote-specific stale block.

The status now explicitly says “Feed quotes received … · not every market”. The calculator always displays the selected bookie and lay quote ages, with the absolute receipt timestamps available in its title. A local “Refresh these prices” control forces the existing selected-event refresh requests, subject to normal rate limits. The request may still omit a selected market; a receipt for another quote does not confirm that selection.

Regression coverage verifies that the calculator uses refreshed selected odds and timestamps without reselecting the row, including unchanged odds re-confirmed at a newer receipt time, and that copying automatically re-enables once the selected quotes are current and other checks pass. It also reproduces recent feed successes with stale selected quotes and ensures that distinction is displayed. No receipt timestamps are fabricated and the stale-quote copy gate is retained.

This release clarifies status and adds a direct refresh action. It does not establish the cause of the user's particular stale selected quote: the available saved diagnostic files predate the screenshot/build. A current diagnostic capture is needed to determine whether that market was omitted, withdrawn, rejected as an older generation or affected by another feed problem.

## Kickoff tolerance (v0.10.3)

Automatic pairing and the native fixture check now accept an absolute kickoff difference of up to 120 seconds, inclusive, provided the existing other identity checks pass. This replaces the previous exact-instant requirement. It allows the observed 20:00 / 20:01 discrepancy without changing or rounding either source's timestamp. Larger differences still conflict, and missing or timezone-unqualified times remain unverified. Multiple eligible events still require disambiguation.

The fixture banner discloses any accepted nonzero difference. Both original kickoff times remain in the source cards. The tolerance is a matching policy, not proof that Matchbook's start field represents actual rather than scheduled kickoff. Other checks for teams, sport, competition, classification and quote freshness remain in place.

## Unpaired event metadata recovery (v0.10.2)

Fixes a circular dependency in automatic discovery: a candidate tab with uncaptured or incomplete fixture metadata was ineligible to pair, but only selected tabs received explicit API requests. The candidate could remain unpaired forever unless a useful passive response arrived or the user selected it manually.

Discovery now schedules a background event GET for open candidate tabs whose identity fields are missing. It does not await those requests or relax fixture checks. Once metadata arrives, the next sidebar cycle retries the comparison. These bootstrap requests use the existing per-event throttling, coalescing, response validation and navigation guards. Complete unselected candidates do not get continuous explicit price polling. Therefore the earlier “only selected events” description has this exception for metadata recovery. The existing event endpoint returns prices as well as metadata; no separate metadata-only endpoint is claimed.

Fixture details now include per-candidate reasons when pairing fails: missing metadata, differing teams/competition/sport, kickoff values or classification differences. This helps distinguish discovery problems from verified conflicts. The screenshot alone does not establish which missing field or difference caused the user's live failure.

## Pairing does not wait for price HTTP requests (v0.10.1)

Fixes a reproduced delay in the four-window/two-fixture case: the pairing response awaited the selected Spinmillion and Matchbook price GETs sequentially, and the global pairing queue waited behind those GETs. One unavailable website could therefore delay the fixture result and later pairing actions.

Price GETs now run independently. Pairing returns captured metadata and the last completed refresh status; subsequent sidebar reads pick up the completed price responses. Pending requests coalesce, while existing price-controller throttling, response validation and navigation guards remain enforced. A betslip DOM read also times out after 400 ms if the document is unresponsive. Missing betslip data is reported explicitly. The fixture identity checks remain unchanged.

This does not make a down website available or make cached quotes current: neither pairing nor request completion advances price timestamps without accepted quotes. Missing metadata remains unverified; stale quotes and failed responses continue to block copying. Regression tests cover four open event windows, unresolved HTTP responses, switching pairs while responses are pending, and an unresponsive Spinmillion document. These are local controlled tests, not a measurement of the user's live outage.

## Automatic pairing of open event tabs (v0.10.0)

Load the updated temporary add-on, then reload both event pages so their fixture metadata is captured. Open the sidebar on your Spinmillion event (or Matchbook event). It uses that event as its anchor and looks for one exact matching fixture among already-open tabs across Firefox windows. Two dropdown selections are no longer required for the usual case.

The automatic screen checks ordered home/away names, sport, complete competition name, classification markers and the same timezone-qualified scheduled kickoff instant. Only the existing explicit Liverpool FC/Liverpool and Villarreal CF/Villarreal aliases are accepted. Missing metadata and multiple matching events require a choice; there is no fuzzy-name or local-clock fallback. Provider event IDs remain independent and are checked against each tab's URL.

The selected pair stays bound when unrelated tabs are opened or focused. To switch matches, activate the desired event tab, expand **Fixture & window details**, and click **Pair active match**. Manual dropdowns remain available there for exceptions. Manual choices remain selected on later polls and still pass the existing native fixture check. Closed or navigated paired events do not silently redirect to replacement events. A changed bound fixture still reaches the authoritative conflict check and comparisons remain blocked.

Discovery reads only in-memory metadata from current tab captures; it does not load saved diagnostics or request prices for every candidate. Existing price polling applies only to selected events. Reload an event page if its metadata was not captured. This release pairs already-open Spinmillion and Matchbook tabs, not Smarkets, exchange-wide event search or multiple monitored match pairs. Fixture agreement does not establish market settlement equivalence.

## Default liquidity and commission (v0.9.4)

Minimum lay liquidity now starts enabled at GBP 100. Commission starts at 2%. Both remain editable and liquidity can be disabled. Reset criteria restores the GBP 100 enabled liquidity default and clears the other optional restrictions; it does not overwrite an edited stake or commission.

Coverage remains limited to the selected event and the captured markets with explicit supported mappings: result, both teams to score, draw no bet, correct score, and half-goal goals totals, separating full match from first half. Every captured outcome in those families is considered before filtering/ranking and only five results are displayed. This is not a complete inventory of either website. BTTS already maps when an equivalent market is present on both feeds, open, unambiguous, and has eligible GBP lay liquidity. The older saved Liverpool capture contains BTTS on Spinmillion but not on Matchbook; that does not establish current website availability.

Handicaps, team totals, corners, cards, player props, accumulators and bet builders are not implemented. Supporting these requires additional settlement-aware mappings and complete relevant feeds. A builder additionally needs its actual joint price and an equivalent exchange proposition; independent leg lays are not treated as a hedge for a joint builder. No builder support is claimed by this defaults update.

## Distinguish an older poll from a failed live feed (v0.9.3)

Fixes a reproduced misleading **No quotes confirmed in response** status. A Spinmillion global live update can already contain a newer quote generation than the periodic event GET. The store correctly rejects the older GET instead of rolling prices back, but the refresh controller used to report this as a price-feed failure and block otherwise recent quotes.

The controller now reports **Newer live prices kept** only when the poll returned quotes, its generation was older than the same captured feed stream, and retained quote receipts are within 30 seconds. It uses the actual retained quote receipt time, never the poll time, for the status. A rejected old snapshot does not advance timestamps. Each candidate still passes its own quote-age check. If retained quotes are stale, the status remains unconfirmed; an empty response remains a separate no-quotes case.

Diagnostics now include returned quote count, accepted quote count, fresh retained quote count, incoming provider generation and retained provider generation. No raw responses or private headers are exported. The live session's precise cause still requires a current diagnostic capture; older saved v0.8.1 files cannot establish the response behind a newer screenshot.

## Exact numeric IDs and accurate response errors (v0.9.1)

Fixes a reproduced cause of **Wrong event response ignored**: Matchbook event/market/runner identifiers can exceed JavaScript's safe integer range. When an API response encodes them as JSON numbers, ordinary JSON.parse rounds them before comparison. The request is then rejected despite originally containing the selected ID.

Both explicit price fetching and passive response interception now parse JSON while preserving plain integer tokens beyond the safe range as exact decimal strings. Decimal odds, amounts in the normal numeric range, safe integers and string contents remain unchanged. Invalid JSON is still rejected. Already-rounded numeric objects remain untrusted; no guessed digit repair, fuzzy ID comparison or bypass of the selected-event guard is used.

The response validator now distinguishes a genuine different event ID, an unverified/unsafe ID, a missing/unsupported event envelope, and an API error payload. Root-array event responses already supported by the store are also recognized by the refresh validator. Failed validation never advances quote confirmation times or enables copying a stake plan.

Safe diagnostics include requested event ID, up to five returned numeric identifier strings, recognized root-key names, response-envelope kind and identifier encoding. Raw response bodies, messages, cookies, tokens and arbitrary keys are not written to diagnostic files. Enable Save diagnostics while testing if the provider still fails so the current shape can be inspected; older saved files cannot identify the new response.

This fix reproduces the observed warning using the selected 17-digit ID, but the screenshot alone does not establish which response the user's live session returned. The updated build still needs that session confirmation.

## Actual selected-event price polling (v0.9.0)

Fixes the cache-only **Follow both** behavior. The renamed **Auto prices** control now makes read-only event GET requests for both selected providers at most once per 10 seconds while the sidebar is open. **Refresh prices now** requests fresh data before that interval (minimum one second between requests, with backoff after access/rate-limit errors). Turning Auto prices off stops scheduled requests even if saving diagnostics remains enabled. Closing all sidebars stops the request loop. Multiple sidebars share the background throttling state.

Requests execute in the selected Firefox tab context using its normal session cookie jar. No login calls, token/cookie inspection, account endpoints, order placement or non-GET API calls are performed. URLs are constructed only for the selected numeric event IDs on the fixed permitted sports API hosts. Redirects are rejected, requests time out after 8 seconds, responses are bounded to 8 MiB, and tab identity/document epoch are checked before and after each request. A response for another event is ignored. This release needs verification in the user's logged-in session; access rejection/network failures are shown explicitly rather than treated as successful refreshes.

Matchbook uses the documented event GET with `include-prices=true`, GBP, DECIMAL, back-lay, expanded price mode, depth 3, minimum liquidity 0 and a bounded market limit. Spinmillion uses the selected event endpoint observed in the supplied HAR, choosing the currently captured feed stream. Existing passive interception remains active as well.

Per-quote last-received times advance only when an accepted provider response explicitly contains that quote. A response can reconfirm an unchanged number; score-only messages, other-market updates, sidebar reads, local saves, failures and rejected older responses cannot refresh that quote's timestamp. Spinmillion's original provider generation time remains separate from local receipt time. Matchbook quote receipt times remain attached to each price level.

The UI shows each provider's request status plus each comparison's separate bookie/lay quote ages. A 30-second age threshold, missing/future timestamps, or an unsuccessful latest price request prevents copying a stake plan. HTTP 401/403/429 receive a 60-second backoff and are displayed with retry timing. The fixture identity panel remains independent of price freshness. Net previews now also show the stake and commission basis explicitly.

Load the updated ZIP and reload both event pages once so initial market definitions are captured. No helper re-registration is needed. If a provider rejects the GET, inspect the visible provider status; do not bypass the freshness check.

## Explicit club-name aliases (v0.8.1)

Fixes a false fixture conflict for Spinmillion **Liverpool FC vs Villarreal CF** and Matchbook **Liverpool vs Villarreal**. The fixture comparator and outcome-price matcher now share the same narrowly tested alias policy for these two clubs. Original source labels stay visible, and the expanded fixture details show each recognized name pair. There is no fuzzy matching and no general removal of FC/CF or age/gender/reserve markers. Competition, ordered participants, sport and absolute scheduled kickoff checks remain required. Missing or inconsistent positive team-classification markers prevent green agreement. Other unknown name variants remain a conflict until explicitly reviewed.

The installed local helper is updated in place; no installer rerun is needed. Reload the extension for the corresponding odds-matcher update.

## Optional criteria and free-bet ranking (v0.8.0)

The existing spread comparison remains unchanged with all optional filters off. Expand **Optional criteria** to enable minimum/maximum bookmaker odds, maximum estimated cash loss percentage, minimum estimated free-bet conversion percentage, a market restriction, a period restriction, or fresh prices only. The existing minimum lay liquidity filter remains available separately. Numeric restrictions only apply when their checkbox is enabled; invalid enabled inputs or contradictory odds bounds produce no results. Reset clears all filters, including minimum liquidity, without changing commission or stake inputs.

Use **Highest free-bet conversion** to rank by estimated cash recovered from a stake-not-returned voucher: `(back odds − 1) × (1 − commission) / (lay odds − commission)`. This switches the calculator to free-bet mode. Changing the calculator to free-bet mode also selects that ranking. Cash and spread rankings remain available. The ranking percentage uses unrounded theoretical stakes; the displayed cash plan uses penny-rounded stakes and shows both resulting P&Ls. Draw-no-bet candidates are omitted from free-bet conversion ranking/filtering because voucher void rules are unverified.

Optional thresholds use the entered commission. With a blank rate, lists preview before fees and copying remains disabled until a rate is entered. The app does not establish promotion eligibility, minimum legs, accumulator or bet-builder requirements, wagering conditions, or excluded markets. Enter the criteria from the specific offer. These comparisons cover individual supported selections only, not accumulators. No stake placement or guaranteed balance transfer is performed.

## Compact comparison and calculator (v0.7.0)

The fixture cards and paired-window selectors live under one collapsed **Fixture & window details** group. Fixture agreement remains green and conflicts red.

**Top 5 comparisons** pairs Spinmillion back prices with the existing **Matchbook** lay feed. Smarkets is not integrated. Default order is smallest relative odds spread: `(lay - back) / back × 100`. Choose **Lowest cash loss** to rank by the commission-adjusted cost of an isolated cash back/lay pair instead. Commission is entered by the user; blank means ranking previews before fees, with copying unavailable until a rate is supplied. The optional GBP liquidity filter checks only the displayed best lay price, without adding amounts from worse prices.

Supported mappings use exact outcome names, lines and periods: match result, both teams to score, correct score, draw no bet, and half-goal total lines. Full match and first half remain separate. Ambiguous, blocked, suspended, unsupported and non-GBP exchange quotes are excluded. Asian handicap, quarter/integer total lines, team totals and accumulators are not mapped. Rankings are market candidates; settlement rules remain unverified.

Select a comparison, enter the bookmaker stake, commission and cash/free-bet type, then copy individual stakes/liability or all bet values. Free-bet mode excludes the voucher stake from winnings. Draw-no-bet free-bet plans are blocked pending voucher void rules. Cash draw-no-bet plans show a separate draw/void result. Calculations round the entered lay stake to pennies, then compute liability and each net result from that rounded stake. They assume no other exchange positions and exclude early-payout effects. Early-payout-marked outcomes are explicitly labeled in the plan.

Old observations remain marked stale even when tabs are reread. Copying is blocked for stale quotes, insufficient quoted liquidity, invalid inputs or conflicting fixtures. The displayed amounts are estimates, not placed bets. Follow both windows does not force either site to update its price feed; reload an event page if initial data or fresh quotes are missing.

## Using paired windows (v0.6.1)

Keep the same event open in Spinmillion and Matchbook, in separate tabs or windows. Open one Match Reader sidebar in either window. It finds both event tabs across Firefox windows and refreshes both automatically. If more than one match is open on a site, choose the intended tab under **Paired match windows**. Reload each event page once after updating the extension to capture its initial network metadata.

**Follow both** is on by default. **Save diagnostics** only controls writing diagnostic files; it is not required for comparison. Current comparisons never fall back to older saved capture files. Reading both windows does not force the sites to refresh their odds; quote ages remain visible. Market rules and hedge verification remain unverified.

# Match Reader v0.6.0 — Firefox prototype

Read-only network metadata and price reader with a DOM betslip reader. It captures Spinmillion and Matchbook website data. It does not place bets or verify hedges.

## Install / update

1. Open `about:debugging#/runtime/this-firefox`. Remove the old temporary Spinmillion reader.
2. Load the new ZIP with **Load Temporary Add-on**. Its manifest is at the ZIP root.
3. Open your Spinmillion match. **Reload the page after loading the extension** so initial metadata and definitions are captured.
4. Open the extension sidebar and click **Read active tab**. Enable two-second refresh if desired.
5. Inspect the network fixture, competition, UTC and London kickoff, market list and visible betslip. Copy JSON to report results.

Temporary extensions disappear on browser restart; state is kept only in memory. A full page navigation resets that tab's cache. A reload is necessary after installation or background restart.

## Data sources

The observed sportsbook host is `api-h-c7818b61-608.sptpub.com`, brand `2620402840463613956`.

The response observer is restricted to GET responses on the observed live/prematch feed and market/event-description routes. It forwards the original bytes unchanged before parsing a copy. It reads no request headers, bodies, cookies or authentication values, and ignores auth, balance, bonus, tracking and betting endpoints. No extra requests are made. It is Firefox-specific (`webRequest.filterResponseData`) and requires permission to observe the sportsbook host.

Network data supplies event IDs, competitor names, competition, absolute scheduled epoch seconds, market definitions, specifiers and quotes. IDs are retained as strings. Full event price snapshots are merged with incremental changes; null updates remove cached entries. Prematch and live streams keep separate epochs. Metadata and prices use separate update timestamps, so a delayed initial response can fill missing fixture details without restoring older prices. Older price payloads are ignored. General polling does not refresh the timestamp of unchanged prices. Unknown market/outcome names stay unknown. Feed update state is not a guarantee of executable prices or matching.

The DOM reader remains necessary for the actual selected odds and stake. Voucher/cash status, accepted bet confirmations, settlement rules and exact early-payout activation are not yet implemented. Early-payout metadata in definitions means eligibility, not proof of activation.

## Fail-closed limitations

- No cross-exchange fixture verification. Never interpret a successful extraction as an approved hedge.
- Youth/senior classification is not inferred from missing age markers. Compare full competition names too.
- DOM stake data is joined to network metadata only for matching event ID and both participant names.
- Missing snapshots, old data (>30 seconds), missing labels and missing kickoff raise warnings.
- Capture is limited to 16 MiB per response and 1,500 cached events per tab. Inaccessible frames/closed shadow DOM cannot supply the betslip.
- The API hostname can change; this prototype only allows the observed hostname.
- No raw HAR files, tokens or account information are packaged or exported.

## Verification

Eight checked-in regression tests (`node --test tests/*.test.cjs`, run from this folder), nine additional network-store checks against the supplied HAR and four response-observer checks passed. Coverage includes delayed metadata, independent live/prematch streams, price freshness, dictionary joining, UTC/London kickoff conversion, null removal, out-of-order rejection, epoch reset, byte-for-byte stream forwarding and private-route exclusion. Replaying all permitted responses in the refreshed HAR preserves the correct fixture and 231 market/line combinations. JavaScript syntax checks also passed. The actual logged-in network observer must still be tested in your Firefox session.

## Missing metadata diagnostics

The total response count includes general polling, which may never contain the current fixture. The sidebar now shows how many event-specific responses were received and whether metadata was captured. Exported `network.diagnostics` contains counts by stream/scope, rejected older price updates and capture errors (without response bodies or credentials). Reload after updating; if metadata is still missing, copy the new JSON. The exact failure in the reported live session could not be reproduced with the supplied HAR alone.

## v0.2.2 cache-capacity fix

The global feeds in the supplied HAR contain over 3,000 distinct fixtures. The previous 1,500-event cap could silently skip the opened event if unrelated fixtures filled the cache first. Event-specific responses now evict an unrelated cached fixture to make room. General feed responses still respect the cap. Cache size, skipped global entries and evictions are exported in `network.diagnostics.cache`. A regression test fills the cache before delivering the selected event response and verifies that its names, kickoff and quotes are retained.

## v0.3.0 local companion

Run the helper setup described in `../firefox-companion/README.md`, then enable **Save diagnostics locally every 2 seconds** in the sidebar. Saving is opt-in per sidebar session. The sidebar must remain open. The new `nativeMessaging` permission lets this reader send its projected captures to the fixed `spinmillion_reader` helper; no browser-control or betting commands are supported. A successful save shows a timestamp. A connection failure unchecks the switch and stops retries until it is enabled again.

Four local-export controller tests, two sidebar integration tests and six Python helper/installer tests cover opt-in/off, missing-helper errors, URL query exclusion, framed UTF-8 messages, field projection, restrictive file permissions and native launcher registration. The live Firefox connection still needs the user to run the installer and enable the switch.

## v0.4.0 match identity and live state

Captures the public `/api/v1/descriptions/statuses/gb` dictionary to label reported match phases without guessing status codes. Live feeds now retain score, match clock, stopped flag, reference timestamp, independent state/score/clock update timestamps, period scores, corners and card counts when supplied. Missing values stay unknown. Null patches clear values and older updates cannot roll back newer state.

The clock is shown as a **reported reference**, without extrapolation. Its reference timestamp and data age are separate. An old running/unknown clock reference raises a warning. Time since scheduled kickoff is wall-clock time, can be negative before kickoff, includes delays/breaks and is not football playing time. The observed feed does not supply an actual kickoff timestamp; `actualStartUTC` stays null.

Fixture identity now includes sport/category/competition/competitor IDs, participant names/abbreviations/country codes when supplied, explicit youth/women/reserve markers, event type and virtual flag (unknown if absent). A betslip selection with a different event ID from the page produces a prominent mismatch warning. A match to this page remains separate from cross-bookmaker verification; scores and clocks alone do not identify a fixture uniquely.

Update: load the new extension ZIP, reload the match page to capture the status dictionary, then re-enable local saving. The companion Python file in this workspace has already been updated; no host re-registration is required when its location is unchanged.

Verification includes 23 checked-in JavaScript tests, 7 Python tests, real football score/clock/phase checks for 32 fixtures in the supplied HAR, and a native-message save preserving a historical live capture. The new fields need a fresh live capture after the Firefox extension is reloaded.

## v0.5.0 Matchbook integration

The sidebar now supports normal Matchbook event tabs and reads only documented event/market/runner/price GET responses already received by the website. Separate back/lay quotes include liquidity, currency and observation time. No second login, extra API polling or account/order reading is implemented. See [MATCHBOOK.md](MATCHBOOK.md) for official references, supported routes, first-run validation, local source files and the conservative identity screen. The live Matchbook website capture remains to be checked in the user’s Firefox session.

## v0.6.0 comparison sidebar

The default view is now a compact comparison workspace: prominent fixture conflicts, both saved source fixtures, a bookmaker selection picker, a Matchbook market picker, separate best visible back/lay quotes and liquidity, independent quote ages, and a list of outstanding hedge checks. The previous extraction UI and JSON remain inside **Capture details & diagnostics**.

The sidebar reads compact projections of the two fixed local capture files through the existing helper. Reading the workspace does not save a new capture; **Save locally** remains opt-in. Reading an active tab without saving can preview that capture against the other saved source. Preview timestamps are preserved. Changing the exchange market clears old quotes while the requested market loads. Delayed native replies cannot replace a newer market choice.

The helper returns at most 200 market summaries and 100 runners for the selected market, with up to three visible price levels per side, keeping replies below the native-message limit. Truncated views are marked. No new site permissions or host registration are needed.

The UI always keeps hedge sizing disabled: matching fixture details alone do not verify settlement scope, liquidity sufficiency, commission or early-payout rules. Quote observation timestamps remain independent of capture/save timestamps. Conflicting currencies are not combined.

Verification: 42 JavaScript tests and 14 Python tests, including fixture mismatches, stale prices, currency conflicts, market switching, readonly workspace previews and timestamp preservation. The layout was also checked in headless Firefox at sidebar widths.
