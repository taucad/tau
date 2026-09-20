"""Execute exact verdict/campaign functions only; never import the installed pytest module."""
import ast
import copy
import json
from pathlib import Path
from types import SimpleNamespace
import tempfile
import unittest

SOURCE = Path(__file__).resolve().with_name('test_installed.py')
NAMES = {'_compare_verdict', 'test_should_exercise_complete_selected_corpus_through_installed_pytest'}
tree = ast.parse(SOURCE.read_text())
selected = [node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name in NAMES]
assert {node.name for node in selected} == NAMES
# Future annotations prevent loading product types. Bodies below are the exact source AST.
module = ast.Module(body=[ast.ImportFrom(module='__future__', names=[ast.alias(name='annotations')], level=0), *selected], type_ignores=[])
namespace = {'json': json, 'Path': Path}
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
        'stages': {'cleanup': {'status': 'released'}}}


class VerdictTests(unittest.TestCase):
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
            for status in ['failed', 'passed']:
                namespace['run_installed_row'] = lambda native, row, route: {**outcome(status), 'id': row['id'], 'route': route}
                if status == 'failed':
                    with self.assertRaisesRegex(AssertionError, 'expected-status'):
                        run_test(InertEngine(), config)
                else:
                    run_test(InertEngine(), config)
                saved = json.loads(output_path.read_text())
                self.assertEqual(len(rows), len(saved['rows']))
                for record in saved['rows']:
                    self.assertEqual(outcome(status)['report'], record['report'])
                    self.assertEqual(outcome(status)['error'], record['error'])
                    self.assertEqual(status == 'passed', record['comparison']['statusEqual'])


if __name__ == '__main__':
    unittest.main(verbosity=2)
