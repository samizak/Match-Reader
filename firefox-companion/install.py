#!/usr/bin/env python3
"""Register the fixed native helper for a standard Linux Firefox installation."""
import argparse
import json
from pathlib import Path
import shlex
import subprocess
import sys
import struct

ROOT = Path(__file__).resolve().parent
NAME = 'spinmillion_reader'
EXTENSION_ID = 'spinmillion-reader-prototype@example.invalid'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest-dir', type=Path, default=Path.home() / '.mozilla/native-messaging-hosts')
    args = parser.parse_args()
    if sys.platform != 'linux':
        parser.error('This installer currently supports Linux Firefox only.')
    launcher = ROOT / 'run-host.sh'
    launcher.write_text('#!/bin/sh\nexec ' + shlex.quote(sys.executable) + ' ' + shlex.quote(str(ROOT / 'host.py')) + ' "$@"\n')
    launcher.chmod(0o700)
    manifest = {'name': NAME, 'description': 'Save Spinmillion reader diagnostics locally',
                'path': str(launcher), 'type': 'stdio', 'allowed_extensions': [EXTENSION_ID]}
    # Self-test the actual executable and framed protocol before registration.
    raw = json.dumps({'type': 'ping'}).encode()
    p = subprocess.run([str(launcher)], input=struct.pack('=I', len(raw)) + raw, capture_output=True, timeout=5)
    if p.returncode or len(p.stdout) < 4 or json.loads(p.stdout[4:]).get('ok') is not True:
        raise SystemExit('Helper self-test failed; registration was not changed.')
    args.manifest_dir.mkdir(parents=True, exist_ok=True)
    target = args.manifest_dir / (NAME + '.json')
    if target.exists():
        old = json.loads(target.read_text())
        if old.get('allowed_extensions') != [EXTENSION_ID] or old.get('name') != NAME:
            raise SystemExit('An unrelated host registration already exists; leaving it unchanged.')
    target.write_text(json.dumps(manifest, indent=2) + '\n')
    target.chmod(0o600)
    print('Helper installed and its connection self-test passed.')
    print('Now load the v0.6.0 reader in Firefox and enable Save diagnostics locally.')
    print('Captures will appear in: ' + str(ROOT.parent / 'firefox-diagnostics'))
    print('Firefox registration: ' + str(target))


if __name__ == '__main__':
    main()
