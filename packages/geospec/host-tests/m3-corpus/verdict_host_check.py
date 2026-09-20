"""Execute exact harness AST with inert dependencies; never import product modules."""
import ast
import copy
from hashlib import sha256
import json
from pathlib import Path
from types import SimpleNamespace
import tempfile
import unittest

SOURCE = Path(__file__).resolve().with_name('test_installed.py')
NAMES = {'run_installed_campaign', '_compare_verdict', 'test_should_exercise_complete_selected_corpus_through_installed_pytest',
         '_RecordingNativeEngine', 'run_installed_row', '_byte_record', '_binary_record', '_error_record'}
tree = ast.parse(SOURCE.read_text())
selected = [node for node in tree.body if isinstance(node, (ast.FunctionDef, ast.ClassDef)) and node.name in NAMES]
assert {node.name for node in selected} == NAMES
# Future annotations prevent loading product types. Bodies below are the exact source AST.
module = ast.Module(body=[ast.ImportFrom(module='__future__', names=[ast.alias(name='annotations')], level=0), *selected], type_ignores=[])
namespace = {'json': json, 'Path': Path, 'sha256': sha256}
exec(compile(ast.fix_missing_locations(module), str(SOURCE), 'exec'), namespace)
compare = namespace['_compare_verdict']

ROW = {'id': 'ordinary-box-volume', 'claimId': 'ordinary-box-volume', 'matcher': True,
       'expected': {'status': 'passed', 'protocolError': None, 'canonicalResultUtf8': None}}


def outcome(status='passed'):
    return {'id': ROW['id'], 'report': {
        'claimId': ROW['claimId'], 'status': status,
        'canonicalClaim': {'utf8': '{"claimId":"ordinary-box-volume"}'},
        'canonicalPlan': {'utf8': '{"plan":{"claims":[{"claimId":"ordinary-box-volume"}]}}'},
        'canonicalResult': {'utf8': json.dumps({'results': [{'claimId': ROW['claimId'], 'status': status}]})}},
        'error': None if status == 'passed' else {'assertionError': True, 'structuredGeoSpec': {'claimId': ROW['claimId'], 'status': status}},
        'stages': {'cleanup': {'status': 'released', 'error': None, 'close': 'GeoSpecEngine.close',
                               'nativeClose': [{'operation': 'close', 'succeeded': True}]}}}


class VerdictTests(unittest.TestCase):
    def test_native_close_requires_successful_forwarding_not_a_facade_label(self):
        for closes in [[], [{'succeeded': False}], [{'succeeded': True, 'error': {'message': 'close failed'}}]]:
            captured = outcome()
            captured['stages']['cleanup']['nativeClose'] = closes
            self.assertIn('native-close', compare(ROW, captured)['hardFailures'])

    def test_row_cleanup_forwards_release_flush_close_and_preserves_first_error(self):
        for release_error, close_error in [(False, False), (True, False), (True, True), (False, True)]:
            with self.subTest(release_error=release_error, close_error=close_error):
                events = []
                inert = dict(namespace)
                exec(compile(ast.fix_missing_locations(module), str(SOURCE), 'exec'), inert)

                class InertNative:
                    def release_subject(self, request):
                        events.append('release')
                        if release_error:
                            raise ValueError('inert subject release error')
                        return b'{"result":{"released":true}}'

                    def flush_cache(self):
                        events.append('flush')
                        return b'{"persisted":false}'

                    def close(self):
                        events.append('native-close')
                        if close_error:
                            raise RuntimeError('inert native close error')

                class InertFacade:
                    def __init__(self, *, native_engine, **options):
                        self.recorder = native_engine

                    def ingest_subject(self, primary, **options):
                        return SimpleNamespace(identity_field='subjectHash', identity='inert-subject',
                                               close=lambda: self.recorder.release_subject(b'{}'))

                    def close(self):
                        self.recorder.flush_cache()
                        self.recorder.close()

                inert.update({
                    'GeoSpecEngine': InertFacade,
                    'GeoSpecAssertionError': type('InertAssertionError', (Exception,), {}),
                    '_read_fixture': lambda fixture: b'inert',
                    '_evaluate_row': lambda recorder, subject, row: (outcome()['report'], None),
                    '_report_record': lambda report: report,
                })
                row = {**ROW, 'workUnitBudget': 1, 'identityField': 'subjectHash',
                       'expectedIdentity': 'inert-subject', 'subjectSlot': 'part', 'authoring': {},
                       'subject': {'primary': {}, 'resources': []},
                       'admission': {'format': 'step', 'ingestOptions': {},
                                     'frame': {'coordinateSystem': 'z-up', 'sourceUnit': 'auto', 'outputUnit': 'mm'}}}
                captured = inert['run_installed_row'](SimpleNamespace(Engine=InertNative), row, 'inert')
                self.assertEqual(['release', 'flush', 'native-close'], events)
                cleanup = captured['stages']['cleanup']
                self.assertEqual(1, len(cleanup['nativeClose']))
                self.assertEqual(not close_error, cleanup['nativeClose'][0]['succeeded'])
                self.assertEqual('{"persisted":false}', cleanup['cacheFlush'][0]['output']['utf8'])
                self.assertEqual(None if close_error else 'GeoSpecEngine.close', cleanup['close'])
                self.assertEqual(outcome()['report'], captured['report'])
                if release_error or close_error:
                    self.assertEqual('cleanup-error', cleanup['status'])
                    self.assertEqual('ValueError' if release_error else 'RuntimeError', cleanup['error']['name'])
                    self.assertEqual('inert subject release error' if release_error else 'inert native close error',
                                     cleanup['error']['message'])
                    self.assertIn('cleanup', inert['_compare_verdict'](row, captured)['hardFailures'])
                else:
                    self.assertEqual('released', cleanup['status'])
                    self.assertIsNone(cleanup['error'])
                    self.assertEqual([], inert['_compare_verdict'](row, captured)['hardFailures'])
                if close_error:
                    self.assertEqual('RuntimeError', cleanup['nativeClose'][0]['error']['name'])
                    self.assertEqual('inert native close error', cleanup['nativeClose'][0]['error']['message'])
                    self.assertIn('native-close', inert['_compare_verdict'](row, captured)['hardFailures'])

    def test_wrong_verdict_and_missing_report_fail_without_result_golden(self):
        self.assertIn('expected-status', compare(ROW, outcome('failed'))['hardFailures'])
        missing = outcome()
        missing['report'] = None
        self.assertIn('missing-report', compare(ROW, missing)['hardFailures'])
        unexpected = outcome()
        unexpected['error'] = {'assertionError': True, 'message': 'ordinary captured host assertion'}
        self.assertIn('unexpected-error', compare(ROW, unexpected)['hardFailures'])

    def test_independent_failed_unsupported_and_query_verdicts(self):
        for status in ['failed', 'unsupported', 'refused']:
            row = copy.deepcopy(ROW)
            row['expected']['status'] = status
            self.assertEqual([], compare(row, outcome(status))['hardFailures'])
            query = outcome(status)
            row['matcher'] = False
            query['error'] = None
            self.assertEqual([], compare(row, query)['hardFailures'])
        unstructured = outcome('failed')
        unstructured['error'] = {'message': 'unrelated assertion'}
        row = copy.deepcopy(ROW)
        row['expected']['status'] = 'failed'
        self.assertIn('unstructured-assertion-error', compare(row, unstructured)['hardFailures'])

    def test_protocol_error_is_explicit_and_unknown_authority_is_withheld(self):
        row = copy.deepcopy(ROW)
        row['expected'].update(status='protocol-error', protocolError={'code': 'ordinary-control', 'message': 'independent control'})
        captured = outcome()
        captured.update(report=None, error={**row['expected']['protocolError'], 'protocolError': True})
        self.assertEqual([], compare(row, captured)['hardFailures'])
        captured['error']['protocolError'] = False
        self.assertIn('canonical-plan-protocol-error', compare(row, captured)['hardFailures'])
        for status in ['pending-new-domain-authority', 'premise-pending', 'independent-oracle-bound-current-result-pending', 'full', None]:
            row = copy.deepcopy(ROW)
            row['expected']['status'] = status
            comparison = compare(row, outcome())
            self.assertIsNone(comparison['statusEqual'])
            self.assertEqual('withheld', comparison['statusAuthority'])
            self.assertIn('expected-status-authority', comparison['hardFailures'])

    def test_full_uses_only_frozen_result_status(self):
        row = copy.deepcopy(ROW)
        row['expected'].update(status='full', canonicalResultUtf8=outcome('failed')['report']['canonicalResult']['utf8'])
        self.assertEqual([], compare(row, outcome('failed'))['hardFailures'])
        self.assertIn('expected-status', compare(row, outcome())['hardFailures'])

    def test_actual_pytest_function_gates_and_finally_preserves_all_raw_reports(self):
        with tempfile.TemporaryDirectory(prefix='geospec-verdict-host-') as directory:
            folder = Path(directory)
            campaign_path, output_path = folder/'inputs.json', folder/'output.json'
            rows = [ROW, {**ROW, 'id': 'second-ordinary-row'}]
            campaign_path.write_text(json.dumps({'taskId': 'inert-only', 'sourceCorpusFingerprint': 'inert-source', 'rows': rows}))
            class InertEngine:
                pass
            namespace.update({
                'GeoSpecEngine': InertEngine,
                'importlib': SimpleNamespace(import_module=lambda name: object()),
                'sys': SimpleNamespace(version_info=SimpleNamespace(major=3, minor=14)),
                '_required_environment': lambda name: str(campaign_path if name == 'GEOSPEC_INSTALLED_MAP' else output_path),
                '_provenance': lambda: {'scope': 'inert-host-only'},
            })
            config = SimpleNamespace(pluginmanager=SimpleNamespace(hasplugin=lambda name: True))
            run_test = namespace['test_should_exercise_complete_selected_corpus_through_installed_pytest']
            for route, status in [('pytest', 'failed'), ('pytest', 'passed'), ('standalone', 'failed'), ('standalone', 'passed')]:
                namespace['run_installed_row'] = lambda native, row, route: {**outcome(status), 'id': row['id'], 'route': route}
                invoke = (lambda: run_test(InertEngine(), config)) if route == 'pytest' else namespace['run_installed_campaign']
                if status == 'failed':
                    with self.assertRaisesRegex(AssertionError, 'expected-status'):
                        invoke()
                else:
                    invoke()
                saved = json.loads(output_path.read_text())
                self.assertEqual([row['id'] for row in rows], [record['id'] for record in saved['rows']])
                self.assertEqual(f'python3.14-{route}', saved['route'])
                self.assertEqual({'scope': 'inert-host-only'}, saved['provenance'])
                for record in saved['rows']:
                    self.assertEqual(outcome(status)['report'], record['report'])
                    self.assertEqual(outcome(status)['error'], record['error'])
                    self.assertEqual(status == 'passed', record['comparison']['statusEqual'])


if __name__ == '__main__':
    unittest.main(verbosity=2)
