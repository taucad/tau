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
  const local = (...rules: ReadonlyArray<ReturnType<typeof rule>>) => [
    { name: 'tau-critical', interval: '60s', rules },
  ];
  const cloud = (...rules: ReadonlyArray<ReturnType<typeof rule>>) => [{ title: 'tau-critical', interval: 60, rules }];

  it('treats YAML line folding as no difference', () => {
    expect(alertParityProblems(local(rule('a', 0, 'up\n  == 0\n')), cloud(rule('a', 0)))).toEqual([]);
  });

  it('keeps whitespace inside a line, where a label value can differ', () => {
    expect(
      alertParityProblems(
        local(rule('a', 0, 'up{job="api  server"} == 0')),
        cloud(rule('a', 0, 'up{job="api server"} == 0')),
      ),
    ).toEqual(['alert rule "a" differs between alerts.yaml and infra/grafana/alerts']);
  });

  it('reports missing rules on either side and any changed field, thresholds included', () => {
    expect(
      alertParityProblems(
        local(rule('same', 0), rule('threshold', 5), rule('local-only', 0)),
        cloud(rule('same', 0), rule('threshold', 0), rule('cloud-only', 0)),
      ),
    ).toEqual([
      'alert group "tau-critical" has a different interval or rules between alerts.yaml and infra/grafana/alerts',
      'alert rule "cloud-only" is missing locally',
      'alert rule "local-only" is missing in Cloud',
      'alert rule "threshold" differs between alerts.yaml and infra/grafana/alerts',
    ]);
  });

  it('compares groups by name and interval, and rejects a uid repeated across Cloud files', () => {
    expect(
      alertParityProblems(
        [{ name: 'tau-critical', interval: '1m', rules: [rule('a', 0)] }],
        [...cloud(rule('a', 0)), { title: 'tau-warning', interval: 60, rules: [rule('a', 0)] }],
      ),
    ).toEqual([
      'alert rule "a" appears more than once in infra/grafana/alerts',
      'alert group "tau-warning" is missing locally',
    ]);
    expect(
      alertParityProblems(
        [{ name: 'tau-critical', interval: '1h1m', rules: [rule('a', 0)] }],
        [...cloud(rule('a', 0)), { title: 'tau-critical', interval: 3660, rules: [rule('a', 0)] }],
      ),
    ).toEqual([
      'alert group "tau-critical" appears more than once in infra/grafana/alerts',
      'alert rule "a" appears more than once in infra/grafana/alerts',
    ]);
    expect(
      alertParityProblems(
        [{ name: 'tau-critical', interval: '5d', rules: [rule('a', 0)] }],
        [{ title: 'tau-critical', interval: '1d', rules: [rule('a', 0)] }],
      ),
    ).toEqual([
      'alert group "tau-critical" has an unreadable interval "1d" in infra/grafana/alerts',
      'alert group "tau-critical" has an unreadable interval "5d" in alerts.yaml',
    ]);
  });
});
