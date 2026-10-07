import { describe, expect, it } from 'vitest';
import { grafanaUidProblems } from '#validate-grafana.js';

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
