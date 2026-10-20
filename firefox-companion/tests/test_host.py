import importlib.util
import io
import json
from pathlib import Path
import stat
import struct
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('spin_host', ROOT / 'host.py')
host = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(host)


def sample():
    return {'source': 'Spinmillion', 'prototype': True, 'readOnly': True,
            'extensionVersion': '0.3.0', 'bets': [],
            'network': {'eventId': '2722838592442470402', 'event': {
                'eventId': '2722838592442470402', 'available': True,
                'fixture': 'Wolverhampton Wanderers vs Portsmouth FC',
                'kickoffUTC': '2026-10-20T18:45:00.000Z', 'markets': []}}}


class HostTests(unittest.TestCase):
    def test_price_refresh_diagnostics_preserve_status_without_exporting_private_fields(self):
        s = sample()
        s['network']['priceRefresh'] = {'status': 'http-error', 'httpStatus': 401, 'quoteCount': 0, 'responseShape': 'bare-event', 'receivedEventIds': ['34605803678400023', 'PRIVATE'], 'responseKeys': ['id', 'token'], 'token': 'PRIVATE'}
        result = host.project(s)
        self.assertEqual(result['network']['priceRefresh']['httpStatus'], 401)
        self.assertEqual(result['network']['priceRefresh']['receivedEventIds'], ['34605803678400023'])
        self.assertEqual(result['network']['priceRefresh']['responseKeys'], ['id'])
        self.assertNotIn('PRIVATE', json.dumps(result))


    def test_live_pair_never_loads_historical_other_source(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            old = sample()
            host.handle({'type': 'capture', 'snapshot': old}, path)
            mb = sample(); mb['source'] = 'Matchbook'; mb['network']['event']['fixture'] = 'Current match'
            answer = host.handle({'type': 'workspace', 'livePair': True, 'snapshots': [mb]}, path)['workspace']
            self.assertNotIn('Spinmillion', answer['sources'])
            self.assertEqual(answer['comparison']['status'], 'UNVERIFIED')
            self.assertNotIn('Current match', (path / 'latest.json').read_text())


    def test_frame_roundtrip_unicode_and_truncated_input(self):
        buf = io.BytesIO()
        host.write_message(buf, {'fixture': '£ é'}); buf.seek(0)
        self.assertEqual(host.read_message(buf), {'fixture': '£ é'})
        with self.assertRaises(ValueError): host.read_message(io.BytesIO(b'\x01\x00'))
        with self.assertRaises(ValueError): host.read_message(io.BytesIO(struct.pack('=I', 99) + b'{}'))
        with self.assertRaises(ValueError): host.read_message(io.BytesIO(struct.pack('=I', host.MAX_BYTES + 1)))

    def test_save_retains_sports_fields_but_drops_unexpected_credentials(self):
        s = sample(); s['cookies'] = 'PRIVATE'; s['network']['headers'] = {'authorization': 'PRIVATE'}
        s['network']['event']['token'] = 'PRIVATE'
        with tempfile.TemporaryDirectory() as folder:
            result = host.handle({'type': 'capture', 'snapshot': s}, Path(folder))
            self.assertTrue(result['ok'])
            p = Path(folder) / 'latest.json'; text = p.read_text(); saved = json.loads(text)
            self.assertNotIn('PRIVATE', text)
            self.assertEqual(saved['snapshot']['network']['event']['kickoffUTC'], '2026-10-20T18:45:00.000Z')
            self.assertEqual(stat.S_IMODE(p.stat().st_mode), 0o600)
            self.assertIn('savedAt', saved)

    def test_latest_betslip_survives_subsequent_empty_betslip(self):
        s = sample(); s['bets'] = [{'fixture': 'A vs B', 'selection': 'draw', 'stake': 10, 'odds': 4.2, 'status': 'BETSLIP_ONLY_NOT_PLACED'}]
        with tempfile.TemporaryDirectory() as folder:
            host.handle({'type': 'capture', 'snapshot': s}, Path(folder))
            host.handle({'type': 'capture', 'snapshot': sample()}, Path(folder))
            saved = json.loads((Path(folder) / 'latest-betslip.json').read_text())
            self.assertEqual(saved['snapshot']['bets'][0]['stake'], 10)
            self.assertEqual(json.loads((Path(folder) / 'latest.json').read_text())['snapshot']['bets'], [])

    def test_rejects_commands_bad_sources_and_non_readonly_data(self):
        with tempfile.TemporaryDirectory() as folder:
            for msg in [{'type': 'exec', 'command': 'bad'}, {'type': 'capture', 'snapshot': {'source': 'Other', 'readOnly': True}}, {'type': 'capture', 'snapshot': {**sample(), 'readOnly': False}}]:
                with self.assertRaises(ValueError): host.handle(msg, Path(folder))
            self.assertEqual(list(Path(folder).iterdir()), [])

    def test_ping_uses_real_native_protocol(self):
        payload = json.dumps({'type': 'ping'}).encode()
        p = subprocess.run([sys.executable, str(ROOT / 'host.py')], input=struct.pack('=I', len(payload)) + payload, capture_output=True, timeout=5)
        self.assertEqual(p.returncode, 0, p.stderr)
        answer = host.read_message(io.BytesIO(p.stdout)); self.assertTrue(answer['ok']); self.assertEqual(answer['protocolVersion'], 1)

    def test_installer_registers_only_our_extension_and_launcher_works(self):
        with tempfile.TemporaryDirectory() as folder:
            p = subprocess.run([sys.executable, str(ROOT / 'install.py'), '--manifest-dir', folder], capture_output=True, text=True, timeout=5)
            self.assertEqual(p.returncode, 0, p.stderr)
            manifest = json.loads((Path(folder) / 'spinmillion_reader.json').read_text())
            self.assertEqual(manifest['allowed_extensions'], ['spinmillion-reader-prototype@example.invalid'])
            raw = json.dumps({'type': 'ping'}).encode()
            p = subprocess.run([manifest['path']], input=struct.pack('=I', len(raw)) + raw, capture_output=True, timeout=5)
            self.assertTrue(host.read_message(io.BytesIO(p.stdout))['ok'])

class LiveProjectionTests(unittest.TestCase):
    def test_live_state_and_identity_survive_local_projection(self):
        s = sample()
        s['network']['event'].update({
            'scheduledKickoffUTC': '2026-10-20T12:00:00Z', 'actualStartUTC': None,
            'sportId': '1', 'homeCompetitorId': 'h', 'awayCompetitorId': 'a',
            'teamClassMarkers': ['U19'], 'teamClass': 'explicit markers present',
            'participants': [{'id': 'h', 'name': 'AS Roma', 'cookie': 'PRIVATE'}],
            'live': {'score': {'home': '2', 'away': '0'}, 'matchTime': '45:00',
                     'periodLabel': 'Halftime', 'clockStopped': True,
                     'clockMode': 'reported_only_no_extrapolation',
                     'statistics': {'corners': {'home': 5, 'away': 1}},
                     'periodScores': [{'number': 1, 'home': 2, 'away': 0}],
                     'stateGeneratedAt': '2026-10-20T12:45:00Z', 'token': 'PRIVATE'}})
        saved = host.project(s)['network']['event']
        self.assertEqual(saved['live']['score']['home'], '2')
        self.assertEqual(saved['live']['periodLabel'], 'Halftime')
        self.assertEqual(saved['live']['matchTime'], '45:00')
        self.assertEqual(saved['live']['statistics']['corners']['home'], 5)
        self.assertEqual(saved['live']['periodScores'][0]['home'], 2)
        self.assertIsNone(saved['actualStartUTC'])
        self.assertEqual(saved['teamClassMarkers'], ['U19'])
        self.assertEqual(saved['homeCompetitorId'], 'h')
        self.assertNotIn('PRIVATE', json.dumps(saved))

class MatchbookTests(unittest.TestCase):
    def test_matchbook_projection_preserves_quotes_without_account_data(self):
        s = sample(); s['source'] = 'Matchbook'
        s['network']['event'].update({'source': 'Matchbook', 'status': 'open', 'observedAt': '2026-10-20T13:00:00Z',
            'metadataTags': [{'id': '15', 'name': 'Soccer', 'type': 'SPORT'}],
            'markets': [{'id': '22', 'name': 'Both Teams To Score', 'status': 'open', 'marketType': 'other',
                'outcomes': [{'id': '33', 'label': 'No', 'status': 'open', 'prices': [
                    {'side': 'lay', 'odds': 1.93, 'rawOdds': 1.93, 'availableAmount': 1239, 'currency': 'GBP', 'token': 'PRIVATE'}]}]}]})
        s['network']['diagnostics'] = {'routes': {'event': 1}, 'schema': {'event': {'recognizedKeys': ['id', 'name'], 'arrayResponse': False}}}
        with tempfile.TemporaryDirectory() as folder:
            host.handle({'type': 'capture', 'snapshot': s}, Path(folder))
            saved = json.loads((Path(folder) / 'latest-matchbook.json').read_text())['snapshot']
            self.assertEqual(saved['network']['event']['markets'][0]['outcomes'][0]['prices'][0]['availableAmount'], 1239)
            self.assertEqual(saved['network']['event']['metadataTags'][0]['type'], 'SPORT')
            self.assertEqual(saved['network']['diagnostics']['routes']['event'], 1)
            self.assertNotIn('PRIVATE', json.dumps(saved))


class ComparisonTests(unittest.TestCase):
    def record(self, source):
        return {'savedAt': host.datetime.now(host.timezone.utc).isoformat(), 'snapshot': {'source': source, 'network': {'event': {
            'available': True, 'eventId': '111' if source == 'Spinmillion' else '222',
            'home': 'AS Roma', 'away': 'Slovan Bratislava', 'sport': 'Football' if source == 'Spinmillion' else 'Soccer',
            'competition': 'U19 UEFA Youth League Champions League Path', 'scheduledKickoffUTC': '2026-10-20T12:00:00Z'}}}}

    def test_kickoff_tolerance_is_bounded_and_disclosed(self):
        for seconds in (0, 60, 120, -120, 121, -121):
            left, right = self.record('Spinmillion'), self.record('Matchbook')
            event = right['snapshot']['network']['event']
            event['scheduledKickoffUTC'] = (host.datetime.fromisoformat('2026-10-20T12:00:00+00:00') + __import__('datetime').timedelta(seconds=seconds)).isoformat()
            result = host.compare_fixtures(left, right)
            self.assertEqual(result['status'], 'IDENTITY_CANDIDATE' if abs(seconds) <= 120 else 'CONFLICT')
            self.assertEqual(result['kickoffDifferenceSeconds'], abs(seconds))
            self.assertEqual(bool(result['warnings']), 0 < abs(seconds) <= 120)

    def alias_pair(self):
        left, right = self.record('Spinmillion'), self.record('Matchbook')
        a, b = (r['snapshot']['network']['event'] for r in (left, right))
        a.update(home='Liverpool FC', away='Villarreal CF', competition='UEFA Champions League', scheduledKickoffUTC='2026-10-20T19:00:00Z')
        b.update(home='Liverpool', away='Villarreal', competition='UEFA Champions League', scheduledKickoffUTC='2026-10-20T19:00:00Z')
        return left, right

    def test_explicit_liverpool_villarreal_aliases_match_without_hiding_original_names(self):
        left, right = self.alias_pair()
        result = host.compare_fixtures(left, right)
        self.assertEqual(result['status'], 'IDENTITY_CANDIDATE')
        self.assertEqual(len(result['nameAliasesApplied']), 2)
        self.assertEqual(left['snapshot']['network']['event']['home'], 'Liverpool FC')
        self.assertFalse(result['hedgeVerified'])

    def test_club_aliases_never_remove_youth_womens_reserve_or_unrelated_club_names(self):
        for name in ['Liverpool U19', 'Liverpool Women', 'Liverpool Reserves', 'Liverpool FC Montevideo']:
            left, right = self.alias_pair()
            right['snapshot']['network']['event']['home'] = name
            self.assertEqual(host.compare_fixtures(left, right)['status'], 'CONFLICT', name)
        for field, value in [('competition', 'UEFA Youth League'), ('scheduledKickoffUTC', '2026-10-20T12:00:00Z')]:
            left, right = self.alias_pair()
            right['snapshot']['network']['event'][field] = value
            self.assertEqual(host.compare_fixtures(left, right)['status'], 'CONFLICT')

    def test_aliases_do_not_override_missing_or_conflicting_classification_markers(self):
        left, right = self.alias_pair()
        right['snapshot']['network']['event']['home'] = 'Liverpool FC'
        right['snapshot']['network']['event']['away'] = 'Villarreal CF'
        left['snapshot']['network']['event']['teamClassMarkers'] = ['U19']
        self.assertNotEqual(host.compare_fixtures(left, right)['status'], 'IDENTITY_CANDIDATE')

    def test_python_fixture_and_javascript_outcome_alias_policies_are_identical(self):
        matcher = ROOT.parent / 'spinmillion-reader-prototype' / 'odds-matcher.js'
        script = "require(process.argv[1]);process.stdout.write(JSON.stringify(OddsMatcher.teamAliases))"
        result = subprocess.run(['node', '-e', script, str(matcher)], check=True, capture_output=True, text=True)
        self.assertEqual(json.loads(result.stdout), host.TEAM_ALIASES)

    def test_identical_identity_fields_are_only_a_candidate_not_a_verified_hedge(self):
        result = host.compare_fixtures(self.record('Spinmillion'), self.record('Matchbook'))
        self.assertEqual(result['status'], 'IDENTITY_CANDIDATE')
        self.assertFalse(result['marketVerified'])
        self.assertFalse(result['hedgeVerified'])

    def test_different_kickoff_and_age_competitions_are_conflicts(self):
        left, right = self.record('Spinmillion'), self.record('Matchbook')
        right['snapshot']['network']['event']['scheduledKickoffUTC'] = '2026-10-20T19:00:00Z'
        self.assertEqual(host.compare_fixtures(left, right)['status'], 'CONFLICT')
        right = self.record('Matchbook'); right['snapshot']['network']['event']['competition'] = 'UEFA Champions League'
        self.assertEqual(host.compare_fixtures(left, right)['status'], 'CONFLICT')

    def test_missing_competition_naive_time_and_stale_capture_are_unverified(self):
        left, right = self.record('Spinmillion'), self.record('Matchbook')
        right['snapshot']['network']['event']['competition'] = None
        self.assertEqual(host.compare_fixtures(left, right)['status'], 'UNVERIFIED')
        right = self.record('Matchbook'); right['snapshot']['network']['event']['scheduledKickoffUTC'] = '2026-10-20T12:00:00'
        self.assertEqual(host.compare_fixtures(left, right)['status'], 'UNVERIFIED')
        right = self.record('Matchbook'); right['savedAt'] = '2020-01-01T00:00:00Z'
        self.assertEqual(host.compare_fixtures(left, right)['status'], 'UNVERIFIED')

class WorkspaceTests(unittest.TestCase):
    def test_workspace_returns_both_sources_and_a_bounded_selected_market(self):
        with tempfile.TemporaryDirectory() as folder:
            directory = Path(folder)
            spin = sample(); host.handle({'type': 'capture', 'snapshot': spin}, directory)
            mb = sample(); mb['source'] = 'Matchbook'; mb['network']['event']['markets'] = [
                {'id': '22', 'name': 'Total', 'status': 'open', 'outcomes': [{'id': '33', 'label': 'OVER 2.5', 'prices': [{'side': 'lay', 'odds': 1.9, 'availableAmount': 100, 'currency': 'GBP'}]}]}]
            host.handle({'type': 'capture', 'snapshot': mb}, directory)
            answer = host.handle({'type': 'workspace', 'marketId': '22'}, directory)
            self.assertTrue(answer['ok'])
            w = answer['workspace']
            self.assertEqual(set(w['sources']), {'Spinmillion', 'Matchbook'})
            self.assertEqual(w['selectedMarket']['id'], '22')
            self.assertEqual(w['selectedMarket']['outcomes'][0]['prices'][0]['odds'], 1.9)
            self.assertNotIn('markets', w['sources']['Matchbook']['snapshot']['network']['event'])
            self.assertLess(len(json.dumps(answer).encode()), 800000)

    def test_workspace_preview_is_readonly_and_does_not_create_capture_files(self):
        with tempfile.TemporaryDirectory() as folder:
            answer = host.handle({'type': 'workspace', 'snapshot': sample()}, Path(folder))
            self.assertIn('Spinmillion', answer['workspace']['sources'])
            self.assertEqual(list(Path(folder).iterdir()), [])

class WorkspaceFreshnessTests(unittest.TestCase):
    def test_preview_retains_the_capture_timestamp_instead_of_refreshing_it(self):
        old = sample(); old['capturedAt'] = '2020-01-01T00:00:00Z'
        with tempfile.TemporaryDirectory() as folder:
            w = host.handle({'type': 'workspace', 'snapshot': old}, Path(folder))['workspace']
            self.assertEqual(w['sources']['Spinmillion']['savedAt'], old['capturedAt'])

if __name__ == '__main__': unittest.main()
