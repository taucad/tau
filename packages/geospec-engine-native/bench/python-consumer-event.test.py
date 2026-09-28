"""Ordinary host-only state checks with a runtime mock; imports no native package."""
import contextlib
import io
import json
import os
from pathlib import Path
import runpy
import sys
import tempfile
import types
import unittest
from unittest.mock import patch


class ConsumerStateTests(unittest.TestCase):
    def test_selected_states_retain_one_mock_subject_and_preserve_failed_verdicts(self):
        for mode in ('cold-process', 'warm-engine-cold-subject', 'resident-warm', 'incremental-edit', 'persisted-warm'):
            with self.subTest(mode=mode), tempfile.TemporaryDirectory(prefix='geospec-state-host-') as directory:
                root = Path(directory)
                (root / 'box.step').write_bytes(b'host-mock-only')
                claims = [{'claimId': 'volume', 'capability': 'toHaveVolume', 'payload': {'expected': 6000}}]
                prepared = {'subject': {'format': 'step', 'primary': {'path': str(root / 'box.step'), 'sha256': 'host-only'}, 'resources': []}, 'claims': claims}
                (root / 'input.json').write_text(json.dumps(prepared))
                calls = []
                subject = types.SimpleNamespace(close=lambda: calls.append('release'))
                self_test = self
                class Engine:
                    def __init__(self, **options):
                        calls.append('engine')
                        if mode == 'persisted-warm':
                            self_test.assertEqual(options['cache_root'], str(root / 'cache'))
                            self_test.assertEqual(options['project_root'], str(root / 'project'))
                    cache_producer_identity = json.dumps({'verified': True, 'producer': 'host-mock'})
                    cache_flush_result = json.dumps({'sealed': True, 'hits': 1})
                    def ingest_subject(self, *_, **__):
                        calls.append('admit')
                        return subject
                    def observations(self):
                        calls.append('snapshot')
                        return json.dumps({'logical': {'claims': str(sum(isinstance(call, tuple) for call in calls))}}).encode()
                    def close(self): calls.append('close')
                class AssertionErrorWithReport(Exception):
                    pass
                def expect_geo(actual, claim_id):
                    self.assertIs(actual, subject)
                    def volume(expected):
                        calls.append(('claim', expected))
                        return types.SimpleNamespace(result={'claimId': claim_id, 'status': 'failed'}, canonical_claim_bytes=b'{}', canonical_plan_bytes=b'{}', canonical_result_bytes=b'{}')
                    return types.SimpleNamespace(to_have_volume=volume)
                module = types.SimpleNamespace(GeoSpecEngine=Engine, GeoSpecAssertionError=AssertionErrorWithReport, expect_geo=expect_geo)
                state = {'mode': mode, 'prior': {**prepared, 'claims': [{**claims[0], 'payload': {'expected': 5999}}]}}
                output = io.StringIO()
                with patch.dict(sys.modules, {'geospec': module}), patch.dict(os.environ, {'GEOSPEC_PREPARED_WORKLOAD': str(root / 'input.json'), 'GEOSPEC_CAMPAIGN_STATE': json.dumps(state), **({'GEOSPEC_CAMPAIGN_CACHE': json.dumps({'root': str(root / 'cache'), 'projectRoot': str(root / 'project')})} if mode == 'persisted-warm' else {})}, clear=True), patch.object(sys, 'argv', ['consumer', 'config', 'route', 'box']), patch.object(sys, 'stdin', types.SimpleNamespace(buffer=io.BytesIO(b'\n\n'))), contextlib.redirect_stdout(output):
                    runpy.run_path(str(Path(__file__).with_name('python-consumer-event.py')), run_name='__main__')
                events = [json.loads(line) for line in output.getvalue().splitlines()]
                self.assertEqual([row['event'] for row in events], ([] if mode in ('cold-process', 'persisted-warm') else ['state-ready']) + ['first-report', 'suite-report', 'complete'])
                self.assertEqual(calls.count('engine'), 1)
                self.assertEqual(calls.count('admit'), 1)
                self.assertEqual(events[-1]['result']['successful'], True)
                if mode == 'persisted-warm':
                    self.assertEqual(events[-1]['result']['cache'], {'producer': {'verified': True, 'producer': 'host-mock'}, 'flush': {'sealed': True, 'hits': 1}})
                self.assertEqual(events[-2]['reports'][0]['status'], 'failed')
                work = events[-1]['result']['workCounters']
                self.assertEqual(work['observationEnd']['logical']['claims'], '2' if mode in ('resident-warm', 'incremental-edit') else '1')
                start = work['observationStart']
                self.assertEqual(None if start is None else start['logical']['claims'], '1' if mode in ('resident-warm', 'incremental-edit') else '0' if mode == 'warm-engine-cold-subject' else None)
                self.assertEqual(calls[calls.index('release') - 1:calls.index('release') + 2], ['snapshot', 'release', 'close'])
                evaluations = [call for call in calls if isinstance(call, tuple)]
                self.assertEqual(evaluations, [('claim', 5999 if mode == 'incremental-edit' else 6000), ('claim', 6000)] if mode in ('resident-warm', 'incremental-edit') else [('claim', 6000)])


if __name__ == '__main__':
    unittest.main()
