import { describe, expect, it } from 'vitest';
import { alertParityProblems, grafanaUidProblems } from '#validate-grafana.js';

describe('Grafana provisioning validation', () => {
  it('rejects UIDs Grafana refuses at boot and duplicates within one file', () => {
    expect(
      grafanaUidProblems([
        {
          file: 'alerts.yaml',
          kind: 'alert rule',
          uids: ['ok', 'billing-funded-operation-recovery-provider-execution'],
        },
        { file: 'tau-warning.json', kind: 'alert rule', uids: ['ok', 'ok'] },
        { file: 'api.json', kind: 'dashboard', uids: ['x'.repeat(40), ''] },
      ]),
    ).toEqual([
      'alerts.yaml: alert rule UID "billing-funded-operation-recovery-provider-execution" must be 1-40 characters (has 52)',
      'tau-warning.json: duplicate alert rule UID "ok"',
      'api.json: dashboard UID "" must be 1-40 characters (has 0)',
    ]);
  });
});

describe('alert parity', () => {
  const rule = (uid: string, threshold: number, expr = 'up == 0') => ({
    uid,
    data: [{ model: { expr } }, { model: { conditions: [{ evaluator: { params: [threshold] } }] } }],
    labels: { severity: 'critical' },
  });

  it('treats YAML line folding as no difference', () => {
    expect(alertParityProblems([{ rules: [rule('a', 0, 'up\n  == 0\n')] }], [{ rules: [rule('a', 0)] }])).toEqual([]);
  });

  it('reports missing rules on either side and any changed field, thresholds included', () => {
    expect(
      alertParityProblems(
        [{ rules: [rule('same', 0), rule('threshold', 5), rule('local-only', 0)] }],
        [{ rules: [rule('same', 0), rule('threshold', 0), rule('cloud-only', 0)] }],
      ),
    ).toEqual([
      'alert rule "cloud-only" is missing locally',
      'alert rule "local-only" is missing in Cloud',
      'alert rule "threshold" differs between alerts.yaml and infra/grafana/alerts',
    ]);
  });
});
