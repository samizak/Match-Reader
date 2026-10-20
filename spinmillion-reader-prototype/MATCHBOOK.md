# Selected-event polling update (v0.9.0)

The current integration adds GET polling of the documented selected-event endpoint, including prices, every 10 seconds while Auto prices is enabled in an open sidebar. It uses the selected tab context and normal cookie handling, without inspecting tokens or calling login/account/trading routes. Access failures are shown and backed off; no response is assumed fresh unless quotes were actually accepted by the parser. Reload initial event pages once after installation for market definitions. The passive-capture-only description below documents the earlier v0.5 integration and no longer describes the refresh loop.

References checked for this update:
- https://developers.matchbook.com/reference/get-event
- https://developers.matchbook.com/reference/get-markets
- https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/permissions

# Matchbook capture (v0.5.0)

Official documentation:

- Developer centre: https://developers.matchbook.com/
- Getting started/authentication: https://developers.matchbook.com/docs/getting-started
- API access and usage FAQ: https://developers.matchbook.com/docs/faq
- Events: https://developers.matchbook.com/reference/get-events
- Event: https://developers.matchbook.com/reference/get-event
- Markets: https://developers.matchbook.com/reference/get-markets
- Runners: https://developers.matchbook.com/reference/get-runners
- Prices: https://developers.matchbook.com/reference/get-prices
- Published market/runner examples: https://developers.matchbook.com/changelog/new-market-types

These official pages were checked on 20 October 2026. Matchbook says its website uses the same API. Direct API clients normally authenticate with a session token; API usage terms and fees depend on use. This prototype does not implement a second login or create API requests. It observes the permitted GET responses the website already receives while the user browses normally. No passwords, session tokens, cookies, headers or account/order endpoints are read or stored by the observer.

## Supported surface

HTTPS hosts: `api.matchbook.com`, `www.matchbook.com`, `matchbook.com`.

Only these endpoint shapes are eligible:

```
/edge/rest/events
/edge/rest/events/{event_id}
/edge/rest/events/{event_id}/markets
/edge/rest/events/{event_id}/markets/{market_id}
/edge/rest/events/{event_id}/markets/{market_id}/runners
/edge/rest/events/{event_id}/markets/{market_id}/runners/{runner_id}
/edge/rest/events/{event_id}/markets/{market_id}/runners/{runner_id}/prices
```

Only GET XHR/fetch responses from a permitted Matchbook tab are ingested. Requests to login, account, balances, offers, betting history and order submission are ignored, as are non-GET methods. Original response bytes are forwarded unchanged. API defaults can depend on localisation: unknown currency and odds format are not guessed. An explicit decimal quote can establish decimal odds; other quotes need an explicit DECIMAL context. Binary win/lose prices are not relabelled back/lay. Aggregated prices retain their mode and are not guaranteed executable at the displayed average.

The reader projects event name/ID, explicit timezone-qualified start, typed metadata tags, participants when present, status/live flags, market/runner IDs and status, and quote side, decimal/raw odds, amount, currency, format, mode and observed timestamp. Missing competition metadata remains unknown. Raw metadata tags remain visible in JSON so differences in the live schema can be diagnosed without sharing HAR files.

No provider score/clock fields are guessed for Matchbook. The first integration uses event/market/runner/price response shapes from official docs with constructed test fixtures. It still needs validation against the user's actual Matchbook website responses. Recognized schema keys, route counts and cache limits are exported for that check; raw bodies are not exported.

## Testing in Firefox

1. Remove the older temporary add-on and load the new ZIP (manifest at root). The sidebar is now named **Match Reader**; the extension ID and native helper registration remain unchanged.
2. Open a single Matchbook event in a normal logged-in tab and reload it after installation.
3. Open the sidebar, click **Read active tab**, and enable local saving.
4. Inspect the event ID, full competition, UTC/London scheduled kickoff, market names, back/lay quote sides, currency and available amounts. Missing metadata is not replaced with the Spinmillion page's metadata.
5. Switch to the corresponding Spinmillion event and read it too. Keep both captures recent if examining the strict identity screen.

The Matchbook page URL must contain exactly one standalone numeric event-ID path segment. Ambiguous URLs stay unlinked. If the actual website uses another URL shape, host, WebSocket stream or response envelope, the first local capture will help adapt it. The reader does not enumerate or replay authenticated requests to work around a missing capture.

## Local files and comparison

The existing helper is updated in place; no re-registration is needed when its path is unchanged.

- `firefox-diagnostics/latest.json`: latest active source.
- `firefox-diagnostics/latest-spinmillion.json`: most recent Spinmillion capture.
- `firefox-diagnostics/latest-matchbook.json`: most recent Matchbook capture.
- `firefox-diagnostics/latest-betslip.json`: last nonempty betslip capture; inspect its timestamp.
- `firefox-diagnostics/comparison.json`: strict comparison of the two latest saved source captures, when both exist.

The identity screen compares ordered team names, sport (Soccer/Football are equivalent labels), full competition, and timezone-qualified scheduled kickoff. Names and competition must match exactly except case/whitespace; aliases are not guessed. Conflicts produce `CONFLICT`, missing/stale inputs produce `UNVERIFIED`, and matching required fields produce only `IDENTITY_CANDIDATE`. Both captures must be at most 30 seconds old. Provider event/competitor IDs are retained as provenance and are not expected to match between independent providers.

The result always has `marketVerified: false` and `hedgeVerified: false`. It does not calculate a hedge or verify settlement scope, commission, liquidity sufficiency, accepted orders or early-payout activation.

## Verification

Run from the project root:

```bash
node --test spinmillion-reader-prototype/tests/*.test.cjs
python3 -m unittest discover -s firefox-companion/tests
```

Tests cover route exclusions, original-byte forwarding, source isolation, numeric ID safety, timezone requirements, quote side/format/currency handling, filtered-side deletion, out-of-order responses, sidebar/local export, and fixture identity conflicts. No tests place bets or authenticate to the exchange.
