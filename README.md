# Match Reader

A local, read-only Firefox extension for comparing Spinmillion back bets with Matchbook lay bets. Each sidebar handles the event pair in its own Firefox window.

The extension captures supported sports API responses and refreshes event quotes through the corresponding browser tabs. A local Python native-messaging helper checks fixture details and supplies the comparison workspace. The extension does not place bets.

## Project files

- `spinmillion-reader-prototype/`: extension source, manifest and JavaScript tests.
- `firefox-companion/`: Python helper, installer and tests.
- `spinmillion-reader-prototype/tests/fixtures/`: selected sports data used by regression tests; these fixtures are intentionally tracked.

See the [extension notes](spinmillion-reader-prototype/README.md) and [helper setup](firefox-companion/README.md) for installation and behaviour details.

## Run checks

From the project root, using Node.js and Python 3:

```sh
node --test spinmillion-reader-prototype/tests/*.test.cjs
python3 -m unittest discover -s firefox-companion/tests
```

## Local files excluded from Git

Live diagnostics, HAR captures, logs, generated extension packages, dependency folders, Python caches, environment secrets, machine-specific setup and editor/agent state are ignored. The native helper installer recreates its local `run-host.sh` launcher.

The personal bookmaker tracker and betting dashboard in the project root are also excluded. Ignoring these files does not delete them. Source HTML, the extension manifest, test fixtures and future dependency lockfiles remain eligible for version control.

No remote repository is required or configured by this setup.
