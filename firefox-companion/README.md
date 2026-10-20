# Firefox local diagnostics companion

This Linux helper connects the Spinmillion Reader to the shared project folder using Firefox native messaging. It receives extracted sportsbook data only; it cannot run commands, navigate pages, click buttons or place bets. There is no listening web server and no extra sportsbook traffic.

## Setup on this computer

Run this once in a terminal, as your normal user (no sudo):

```bash
python3 "/home/sami/Documents/Matched Betting/firefox-companion/install.py"
```

Then:

1. In Firefox, open `about:debugging#/runtime/this-firefox`, remove the older temporary reader and load `spinmillion-reader-firefox.zip` (v0.6.0).
2. Reload the Spinmillion match page and open the reader sidebar.
3. Enable **Save diagnostics locally every 2 seconds**. Keep the sidebar open and the Spinmillion tab active.
4. Look for **Saved locally**. Tell the assistant it is connected; it can inspect files directly from this workspace on its next turn.

This is diagnostic access, not continuous autonomous browser control. The assistant is not running between chat turns. Disable the switch or close the sidebar to stop. Changing to another website does not export that website. Temporary add-ons disappear when Firefox restarts and must be loaded again.

## Where data goes

- `../firefox-diagnostics/latest.json`: latest capture, with a fresh save timestamp.
- `../firefox-diagnostics/latest-betslip.json`: most recent capture containing betslip selections. Check `savedAt`; it is retained when the current betslip becomes empty.

These files contain fixture names, competition, kickoff, captured markets/odds, diagnostics, and visible selections/stakes if present. Unknown fields are removed; raw HTTP bodies/headers, cookies, login details and account balances are not exported. Files use mode 0600. Output is overwritten rather than accumulated, keeping storage bounded. No fixture match or hedge is verified by this helper.

The installer registers `spinmillion_reader` for only `spinmillion-reader-prototype@example.invalid`, under `~/.mozilla/native-messaging-hosts/spinmillion_reader.json`, and creates an executable launcher beside the Python helper. Keep this project folder in place; rerun the installer if you move it. Python's standard library is sufficient.

## Troubleshooting

If local saving fails, run the setup command again, then re-enable the switch. It intentionally stops retrying after an error. The installer's self-test checks Python and the native protocol; **Saved locally** in Firefox confirms the browser-to-helper connection.

This setup targets standard Linux Firefox. Flatpak/Snap Firefox can require additional host integration; if Firefox cannot find the helper after a successful setup, report the browser packaging and the exact extension error from Firefox's add-on debugger.

To unregister, remove only `~/.mozilla/native-messaging-hosts/spinmillion_reader.json`. The Python helper runs only when Firefox sends a message; there is no background service to stop. Existing diagnostic files remain until deleted.

## Checks

```bash
python3 -m unittest discover -s firefox-companion/tests
node --test spinmillion-reader-prototype/tests/*.test.cjs
```

Reference: [Mozilla native messaging documentation](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_messaging).

The v0.4.0 projection also preserves live score, reported clock and its reference timestamp, period label/code, card/corner statistics, explicit team-class markers, competitor IDs, and per-selection page mismatch status. It keeps scheduled kickoff separate from unknown actual start. Updating `host.py` in place takes effect on the next capture because each save launches the host afresh. No registration change is needed for an in-place update.

In v0.5.0 the same helper accepts projected Matchbook captures and maintains `latest-spinmillion.json` and `latest-matchbook.json` alongside `latest.json`. When both exist, `comparison.json` records a strict identity screen with conflict/missing/stale reasons. A matching result is only an identity candidate; market and hedge verification remain false. See `../spinmillion-reader-prototype/MATCHBOOK.md`.

In v0.6.0 a fixed-purpose `workspace` operation reads only the two known projected capture files and returns a bounded comparison view for the sidebar. An optional read-only preview is projected using the same allowlist and is never written. No arbitrary paths, URLs or commands are accepted. Capture replies also include this view.
