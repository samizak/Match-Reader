#!/usr/bin/env python3
"""A fixed-purpose Firefox native host: save projected reader diagnostics only."""
import json
import math
import os
import re
from pathlib import Path
import struct
import sys
import tempfile
from datetime import datetime, timezone

MAX_BYTES = 8 * 1024 * 1024
OUTPUT_DIR = Path(__file__).resolve().parent.parent / 'firefox-diagnostics'
EXTENSION_ID = 'spinmillion-reader-prototype@example.invalid'
# Deliberate club-specific aliases only. Do not strip FC/CF, age, gender or
# reserve markers generally. Keep this policy aligned with OddsMatcher.
TEAM_ALIASES = {'liverpool fc': 'liverpool', 'villarreal cf': 'villarreal'}


def read_exact(stream, size):
    parts = bytearray()
    while len(parts) < size:
        chunk = stream.read(size - len(parts))
        if not chunk:
            raise ValueError('Truncated native message.')
        parts.extend(chunk)
    return bytes(parts)


def read_message(stream):
    length = struct.unpack('=I', read_exact(stream, 4))[0]
    if not 0 < length <= MAX_BYTES:
        raise ValueError('Native message exceeds capture size limit.')
    return json.loads(read_exact(stream, length).decode('utf-8'))


def write_message(stream, value):
    raw = json.dumps(value, ensure_ascii=False, allow_nan=False).encode('utf-8')
    stream.write(struct.pack('=I', len(raw)) + raw)
    stream.flush()


def scalars(obj, keys):
    if not isinstance(obj, dict):
        return {}
    out = {}
    for key in keys.split():
        if key not in obj:
            continue
        v = obj[key]
        if v is None or isinstance(v, (str, bool, int, float)):
            if isinstance(v, str) and len(v) > 4000:
                raise ValueError('Unexpectedly long diagnostic field.')
            if isinstance(v, float) and not math.isfinite(v):
                raise ValueError('Non-finite diagnostic number.')
            out[key] = v
    return out


def array(value, limit):
    if value is None:
        return []
    if not isinstance(value, list) or len(value) > limit:
        raise ValueError('Unexpected diagnostic array.')
    return value


def warnings(obj):
    return [w for w in array(obj.get('warnings'), 100) if isinstance(w, str) and len(w) <= 4000]


def project(snapshot):
    if not isinstance(snapshot, dict) or snapshot.get('source') not in ('Spinmillion', 'Matchbook') or snapshot.get('readOnly') is not True:
        raise ValueError('Only read-only Spinmillion and Matchbook captures are accepted.')
    out = scalars(snapshot, 'source prototype readOnly frameHasBetslip notice domError capturedAt extensionVersion pageEventPath browserTabId browserWindowId')
    out['bets'] = []
    for bet in array(snapshot.get('bets'), 100):
        if not isinstance(bet, dict):
            raise ValueError('Unexpected betslip entry.')
        b = scalars(bet, 'source status eventId pageEventId fixtureLinkStatus fixture home away sport categoryRaw teamClass eventPath selection marketRaw marketNormalized settlementScope odds stake currencyRaw expectedCashReturn stakeType browserTimezone capturedAt')
        b['kickoff'] = scalars(bet.get('kickoff'), 'dateLabel timeLabel timezone instant')
        b['networkEvent'] = scalars(bet.get('networkEvent'), 'eventId category competition kickoffUTC')
        b['teamClassMarkers'] = [v for v in array(bet.get('teamClassMarkers'), 100) if isinstance(v, str)]
        b['warnings'] = warnings(bet)
        out['bets'].append(b)
    net = snapshot.get('network')
    if not isinstance(net, dict):
        raise ValueError('Missing network diagnostic object.')
    n = scalars(net, 'source eventId responses lastCapture error')
    n['priceRefresh'] = scalars(net.get('priceRefresh'), 'source eventId status attemptedAt confirmedAt httpStatus quoteCount nextRetryAt responseShape identifierEncoding returnedQuoteCount retainedFreshCount incomingGeneratedAt retainedGeneratedAt')
    refresh = net.get('priceRefresh') or {}
    n['priceRefresh']['receivedEventIds'] = [v for v in array(refresh.get('receivedEventIds'), 5) if isinstance(v, str) and re.fullmatch(r'\d{1,30}', v)]
    response_keys = {'id', 'event', 'events', 'markets', 'errors', 'error', 'data', 'status', 'code'}
    n['priceRefresh']['responseKeys'] = [v for v in array(refresh.get('responseKeys'), 20) if isinstance(v, str) and v in response_keys]
    event = net.get('event') or {}
    e = scalars(event, 'source eventId available home away fixture sport category competition competitionId virtual status isLive inRunning observedAt kickoffRaw kickoffUTC kickoffLondon scheduledKickoffUTC actualStartUTC actualStartStatus wallTimeSinceScheduledSeconds sportId categoryId homeCompetitorId awayCompetitorId eventType teamClass feedStream generatedAt metadataGeneratedAt snapshotComplete')
    e['warnings'] = warnings(event)
    e['teamClassMarkers'] = [v for v in array(event.get('teamClassMarkers'), 100) if isinstance(v, str)]
    e['participants'] = [scalars(p, 'id name abbreviation countryCode role') for p in array(event.get('participants'), 10)]
    live = event.get('live') or {}
    l = scalars(live, 'feedStream matchTime elapsedMatchSeconds clockStopped clockTimestampUTC clockMode periodCode periodLabel statusCode stateGeneratedAt scoreGeneratedAt clockGeneratedAt stateAgeSeconds scoreAgeSeconds clockAgeSeconds clockReferenceAgeSeconds')
    l['score'] = scalars(live['score'], 'home away') if isinstance(live.get('score'), dict) else None
    l['statistics'] = {key: scalars((live.get('statistics') or {})[key], 'home away') for key in ('corners', 'yellow_cards', 'red_cards', 'yellow_red_cards') if key in (live.get('statistics') or {})}
    l['periodScores'] = [scalars(p, 'number periodCode periodLabel home away') for p in array(live.get('periodScores'), 100)]
    e['live'] = l
    e['metadataTags'] = [scalars(t, 'id name type') for t in array(event.get('metadataTags'), 100)]
    e['markets'] = []
    for market in array(event.get('markets'), 10000):
        m = scalars(market, 'id name specifiers status marketType type settlementScope observedAt')
        m['outcomes'] = []
        for outcome in array(market.get('outcomes'), 500):
            o = scalars(outcome, 'id label odds blocked earlyPayout status participantId pricesObservedAt')
            if 'prices' in outcome:
                o['prices'] = [scalars(q, 'side odds rawOdds availableAmount currency oddsType exchangeType priceMode observedAt') for q in array(outcome.get('prices'), 100)]
            m['outcomes'].append(o)
        e['markets'].append(m)
    n['event'] = e
    d = net.get('diagnostics') or {}
    n['diagnostics'] = {
        'cache': scalars(d.get('cache'), 'events limit droppedGlobalEvents evictedEvents limitedRecords'),
        'rejectedOutOfOrder': d.get('rejectedOutOfOrder') if isinstance(d.get('rejectedOutOfOrder'), int) else None,
        'selectedEvent': scalars(d.get('selectedEvent'), 'responses metadataCaptured'),
        'captureErrors': scalars(d.get('captureErrors'), 'filterUnavailable streamError oversized emptyResponse parseOrSchemaError'),
        'feeds': {key: scalars((d.get('feeds') or {}).get(key), 'global event') for key in ('prematch', 'live')},
    }
    kinds = ('events', 'event', 'markets', 'market', 'runners', 'runner', 'prices')
    n['diagnostics']['routes'] = scalars(d.get('routes'), ' '.join(kinds))
    n['diagnostics']['schema'] = {}
    known_keys = {'events', 'event', 'markets', 'runners', 'prices', 'id', 'name', 'start', 'meta-tags', 'event-participants', 'errors'}
    for kind in kinds:
        schema = (d.get('schema') or {}).get(kind)
        if not isinstance(schema, dict):
            continue
        entry = scalars(schema, 'arrayResponse')
        entry['recognizedKeys'] = [v for v in array(schema.get('recognizedKeys'), 20) if isinstance(v, str) and v in known_keys]
        n['diagnostics']['schema'][kind] = entry
    out['network'] = n
    return out


def atomic_write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd, temporary = tempfile.mkstemp(prefix='.capture-', dir=path.parent)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            json.dump(value, f, ensure_ascii=False, indent=2, allow_nan=False)
            f.write('\n')
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def compare_fixtures(left, right):
    """Strict identity screen only. Never an authorization to bet or hedge."""
    reasons, conflicts, aliases_applied, warnings = [], [], [], []
    a, b = left.get('snapshot', {}).get('network', {}).get('event', {}), right.get('snapshot', {}).get('network', {}).get('event', {})
    normalize = lambda v: ' '.join(v.lower().split()) if isinstance(v, str) else ''
    def instant(value):
        if not isinstance(value, str) or not re.search(r'(Z|[+-]\d{2}:\d{2})$', value):
            return None
        try:
            return datetime.fromisoformat(value.replace('Z', '+00:00'))
        except ValueError:
            return None
    if not a.get('available') or not b.get('available'):
        reasons.append('Fixture metadata is missing on one source.')
    for field in ('home', 'away', 'sport', 'competition'):
        av, bv = normalize(a.get(field)), normalize(b.get(field))
        if field in ('home', 'away'):
            original_a, original_b = av, bv
            av, bv = TEAM_ALIASES.get(av, av), TEAM_ALIASES.get(bv, bv)
            if av and av == bv and original_a != original_b:
                aliases_applied.append({'field': field, 'spinmillion': a.get(field), 'matchbook': b.get(field), 'canonical': av})
        if field == 'sport':
            av = 'football' if av == 'soccer' else av
            bv = 'football' if bv == 'soccer' else bv
        if not av or not bv:
            reasons.append('Missing ' + field + ' on one source.')
        elif av != bv:
            conflicts.append(field + ' differs between sources.')
    classifications = [set(normalize(v) for v in e.get('teamClassMarkers', []) if isinstance(v, str) and v.strip()) for e in (a, b)]
    if classifications[0] != classifications[1]:
        reasons.append('Team classification markers differ or are missing on one source.')
    at, bt = instant(a.get('scheduledKickoffUTC') or a.get('kickoffUTC')), instant(b.get('scheduledKickoffUTC') or b.get('kickoffUTC'))
    kickoff_difference = abs((at - bt).total_seconds()) if at is not None and bt is not None else None
    if at is None or bt is None:
        reasons.append('Absolute scheduled kickoff is unverified on one source.')
    elif kickoff_difference > 120:
        conflicts.append('Scheduled kickoff instants differ by more than the 2-minute tolerance.')
    elif kickoff_difference > 0:
        warnings.append('Kickoff differs by ' + str(int(kickoff_difference)) + ' seconds; within the 2-minute tolerance.')
    if isinstance(a.get('virtual'), bool) and isinstance(b.get('virtual'), bool) and a['virtual'] != b['virtual']:
        conflicts.append('Virtual-event flags differ.')
    now = datetime.now(timezone.utc)
    for label, record in [('Spinmillion', left), ('Matchbook', right)]:
        saved = instant(record.get('savedAt'))
        if saved is None or (now - saved).total_seconds() > 30 or (now - saved).total_seconds() < -5:
            reasons.append(label + ' capture is missing, stale or has an inconsistent timestamp.')
    return {'status': 'CONFLICT' if conflicts else 'UNVERIFIED' if reasons else 'IDENTITY_CANDIDATE',
            'reasons': conflicts + reasons, 'nameAliasesApplied': aliases_applied,
            'warnings': warnings, 'kickoffDifferenceSeconds': kickoff_difference, 'kickoffToleranceSeconds': 120,
            'spinmillionEventId': a.get('eventId'), 'matchbookEventId': b.get('eventId'),
            'marketVerified': False, 'hedgeVerified': False,
            'notice': 'Matching names, competition and scheduled time are supporting identity evidence. Market rules, selection, prices, liquidity and commission still require verification.'}


def get_workspace(output_dir, market_id=None, preview=None, snapshots=None, live_pair=False):
    """Read only our two fixed, projected capture files; never arbitrary paths."""
    records = {}
    for source, filename in ([] if live_pair else [('Spinmillion', 'latest-spinmillion.json'), ('Matchbook', 'latest-matchbook.json')]):
        path = output_dir / filename
        if not path.exists() or path.stat().st_size > 16 * 1024 * 1024:
            continue
        try:
            record = json.loads(path.read_text())
            snapshot = project(record.get('snapshot'))
            if snapshot['source'] == source:
                records[source] = {'savedAt': record.get('savedAt'), 'snapshot': snapshot}
        except (ValueError, TypeError, AttributeError, OSError):
            continue
    for value in ([preview] if preview is not None else []) + array(snapshots, 2):
        snapshot = project(value)
        records[snapshot['source']] = {'savedAt': snapshot.get('capturedAt'), 'preview': True, 'snapshot': snapshot}
    mb = records.get('Matchbook', {}).get('snapshot', {}).get('network', {}).get('event', {})
    markets = mb.get('markets', [])
    selected = next((m for m in markets if m.get('id') == market_id), None)
    if selected is None:
        selected = next((m for m in markets if (m.get('name') or '').lower() == 'match odds'), markets[0] if markets else None)
    options = [{'id': m.get('id'), 'name': m.get('name'), 'status': m.get('status'),
                'labels': [o.get('label') for o in m.get('outcomes', [])[:3]]} for m in markets[:200]]
    if 'Spinmillion' in records and 'Matchbook' in records:
        comparison = compare_fixtures(records['Spinmillion'], records['Matchbook'])
    else:
        comparison = {'status': 'UNVERIFIED', 'reasons': ['Capture both sources to compare the fixtures.'], 'marketVerified': False, 'hedgeVerified': False}
    # Independent copies prevent this compact response from changing saved data.
    compact = json.loads(json.dumps(records))
    for record in compact.values():
        snapshot = record['snapshot']
        snapshot['bets'] = snapshot.get('bets', [])[:20]
        event = snapshot['network']['event']
        event.pop('markets', None)
        event['warnings'] = [w[:350] for w in event.get('warnings', [])[:10]]
        for bet in snapshot['bets']:
            bet['warnings'] = [w[:350] for w in bet.get('warnings', [])[:5]]
    chosen = json.loads(json.dumps(selected)) if selected else None
    truncated = len(markets) > 200
    if chosen:
        truncated = truncated or len(chosen.get('outcomes', [])) > 100
        chosen['outcomes'] = chosen.get('outcomes', [])[:100]
        for outcome in chosen['outcomes']:
            quotes = outcome.get('prices', [])
            # Preserve the best visible three levels per side, not arbitrary order.
            by_side = []
            for side in ('back', 'lay'):
                values = [q for q in quotes if q.get('side') == side]
                values.sort(key=lambda q: q.get('odds') if isinstance(q.get('odds'), (int, float)) else (-1 if side == 'back' else float('inf')), reverse=side == 'back')
                by_side.extend(values[:3])
            truncated = truncated or len(by_side) < len(quotes)
            outcome['prices'] = by_side
    workspace = {'sources': compact, 'comparison': comparison, 'marketOptions': options,
                 'selectedMarket': chosen, 'truncated': truncated,
                 'generatedAt': datetime.now(timezone.utc).isoformat()}
    # Native host replies must remain below Firefox's 1 MiB message limit.
    def size():
        return len(json.dumps(workspace, ensure_ascii=False).encode('utf-8'))
    while size() > 750000 and chosen and chosen['outcomes']:
        chosen['outcomes'].pop();workspace['truncated'] = True
    while size() > 750000 and options:
        options.pop();workspace['truncated'] = True
    if size() > 750000:
        workspace = {'sources': {}, 'comparison': {'status': 'UNVERIFIED', 'reasons': ['Workspace capture is too large.']}, 'marketOptions': [], 'selectedMarket': None, 'truncated': True}
    return workspace


def handle(message, output_dir=OUTPUT_DIR):
    if not isinstance(message, dict):
        raise ValueError('Expected a diagnostic message.')
    if message.get('type') == 'ping':
        return {'ok': True, 'protocolVersion': 1}
    if message.get('type') == 'workspace':
        workspace = get_workspace(output_dir, message.get('marketId'), message.get('snapshot'), message.get('snapshots'), message.get('livePair') is True)
        if message.get('livePair') is True:
            workspace['livePair'] = True
            if message.get('save') is True:
                for value in array(message.get('snapshots'), 2):
                    snapshot = project(value)
                    record = {'schemaVersion': 1, 'savedAt': snapshot.get('capturedAt'), 'snapshot': snapshot}
                    atomic_write(output_dir / ('latest-spinmillion.json' if snapshot['source'] == 'Spinmillion' else 'latest-matchbook.json'), record)
                    atomic_write(output_dir / 'latest.json', record)
                atomic_write(output_dir / 'comparison.json', workspace['comparison'])
        return {'ok': True, 'workspace': workspace}
    if message.get('type') != 'capture':
        raise ValueError('Unsupported operation. This helper only saves captures.')
    snapshot = project(message.get('snapshot'))
    saved_at = datetime.now(timezone.utc).isoformat()
    record = {'schemaVersion': 1, 'savedAt': saved_at, 'snapshot': snapshot}
    atomic_write(output_dir / 'latest.json', record)
    filename = 'latest-spinmillion.json' if snapshot['source'] == 'Spinmillion' else 'latest-matchbook.json'
    atomic_write(output_dir / filename, record)
    if snapshot['bets']:
        atomic_write(output_dir / 'latest-betslip.json', record)
    answer = {'ok': True, 'savedAt': saved_at}
    paths = [output_dir / 'latest-spinmillion.json', output_dir / 'latest-matchbook.json']
    if all(p.exists() for p in paths):
        try:
            comparison = compare_fixtures(*(json.loads(p.read_text()) for p in paths))
        except (ValueError, TypeError, AttributeError):
            comparison = {'status': 'UNVERIFIED', 'reasons': ['Saved comparison inputs could not be read.'], 'marketVerified': False, 'hedgeVerified': False}
        comparison['comparedAt'] = saved_at
        atomic_write(output_dir / 'comparison.json', comparison)
        answer['comparison'] = comparison
    answer['workspace'] = get_workspace(output_dir, message.get('marketId'))
    return answer


def main():
    # Firefox supplies the manifest path and extension ID. Normal stdin tests
    # omit these args; the manifest also restricts callers to our extension ID.
    if len(sys.argv) >= 3 and sys.argv[2] != EXTENSION_ID:
        write_message(sys.stdout.buffer, {'ok': False, 'error': 'Unexpected extension ID.'})
        return
    try:
        answer = handle(read_message(sys.stdin.buffer))
    except (ValueError, TypeError, AttributeError, OSError, OverflowError):
        # Never echo raw payloads, credentials or parser excerpts into logs.
        answer = {'ok': False, 'error': 'Capture rejected or local file could not be written.'}
    write_message(sys.stdout.buffer, answer)


if __name__ == '__main__':
    main()
