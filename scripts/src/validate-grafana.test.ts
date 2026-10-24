import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  alertParityProblems,
  alertRuleProblems,
  grafanaUidProblems,
  logSecretProblems,
  uidPrefixProblems,
} from '#validate-grafana.js';

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

const fixture = (name: string): string => readFileSync(join(import.meta.dirname, 'fixtures/grafana', name), 'utf8');
type FixtureGroup = Parameters<typeof alertRuleProblems>[1][number];
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- checked-in rule-group fixtures
const group = (name: string): FixtureGroup => JSON.parse(fixture(name)) as FixtureGroup;
const alertsDirectory = join(import.meta.dirname, '../../infra/grafana/alerts');
const shippedGroups = (): Array<[file: string, group: FixtureGroup]> =>
  readdirSync(alertsDirectory)
    .filter((name) => name.endsWith('.json'))
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Grafana's rule-group JSON
    .map((name) => [name, JSON.parse(readFileSync(join(alertsDirectory, name), 'utf8')) as FixtureGroup]);

describe('alert rule lint (W14 OB1 a)', () => {
  it('rejects the seeded rules: no runbook, a runbook outside the cloud handbook, an unknown severity and info rules without trigger labels', () => {
    expect(alertRuleProblems('alerts-bad.json', [group('alerts-bad.json')])).toEqual([
      'alerts-bad.json: alert rule "storage-no-runbook" needs annotations.runbook_url naming a docs/handbooks/cloud/**.md page (has none)',
      'alerts-bad.json: alert rule "storage-runbook-research" needs annotations.runbook_url naming a docs/handbooks/cloud/**.md page (has "docs/research/hosted-remote-storage-observability.md")',
      'alerts-bad.json: alert rule "storage-runbook-link" needs annotations.runbook_url naming a docs/handbooks/cloud/**.md page (has "https://grafana.example/runbooks/storage")',
      'alerts-bad.json: alert rule "storage-runbook-escape" needs annotations.runbook_url naming a docs/handbooks/cloud/**.md page (has "docs/handbooks/cloud/../../research/storage.md")',
      'alerts-bad.json: alert rule "storage-page-severity" needs label severity critical, warning or info (has "page")',
      'alerts-bad.json: alert rule "trigger-stage2-commit-ceiling" is severity=info, so it needs kind=trigger and non-empty trigger and package labels (missing kind=trigger, trigger, package)',
      'alerts-bad.json: alert rule "trigger-stage2-commit-bound-latency" is severity=info, so it needs kind=trigger and non-empty trigger and package labels (missing package)',
    ]);
  });

  it('accepts what binding contract v2 renders: info triggers with kind, trigger and package, and critical mirror rules', () => {
    expect(alertRuleProblems('alerts-v2.json', [group('alerts-v2.json')])).toEqual([]);
  });

  it('passes every rule group in infra/grafana/alerts', () => {
    const groups = shippedGroups();
    expect(groups.length).toBeGreaterThan(0);
    expect(groups.flatMap(([file, shipped]) => alertRuleProblems(file, [shipped]))).toEqual([]);
  });
});

describe('rule UID prefixes (W14 OB1 b)', () => {
  it('rejects UIDs that share the 20 characters hosted provisioning keeps', () => {
    const uids = (group('alerts-bad.json').rules ?? []).map((rule) => rule.uid ?? '');
    expect(uidPrefixProblems(uids, [])).toEqual([
      'alert rule UIDs "trigger-stage2-commit-ceiling", "trigger-stage2-commit-bound-latency" share their first 20 characters "trigger-stage2-commi"; hosted provisioning keeps only those, so each UID must differ within them',
    ]);
  });

  it('tolerates a listed legacy collision only while every member is listed and the entry still collides', () => {
    const legacy = ['billing-funded-operation-a', 'billing-funded-operation-b', 'retired-rule-uid'];
    expect(
      uidPrefixProblems(
        ['billing-funded-operation-a', 'billing-funded-operation-b', 'billing-funded-operation-c'],
        legacy,
      ),
    ).toEqual([
      'alert rule UIDs "billing-funded-operation-a", "billing-funded-operation-b", "billing-funded-operation-c" share their first 20 characters "billing-funded-opera"; hosted provisioning keeps only those, so each UID must differ within them',
      'legacy UID collision "retired-rule-uid" no longer collides: remove it from legacyUidPrefixCollisions',
    ]);
    expect(uidPrefixProblems(['billing-funded-operation-a', 'billing-funded-operation-b'], legacy.slice(0, 2))).toEqual(
      [],
    );
  });

  it('passes the rule UIDs in infra/grafana/alerts', () => {
    expect(
      uidPrefixProblems(shippedGroups().flatMap(([, shipped]) => (shipped.rules ?? []).map((rule) => rule.uid ?? ''))),
    ).toEqual([]);
  });
});

describe('storage log lint (W14 OB1 f, FR20)', () => {
  it('finds every seeded grant header, receipt signature and X-Amz-Signature value without printing it', () => {
    const problems = logSecretProblems('storage-logs-leaky.ndjson', fixture('storage-logs-leaky.ndjson'));
    expect(problems).toEqual([
      'storage-logs-leaky.ndjson:1: a storage grant or receipt token (v.kid.payload.signature) appears in the line',
      'storage-logs-leaky.ndjson:1: field req.headers.x-tau-storage-grant carries credential material',
      'storage-logs-leaky.ndjson:2: a storage grant or receipt token (v.kid.payload.signature) appears in the line',
      'storage-logs-leaky.ndjson:3: field receipt.signature carries credential material',
      'storage-logs-leaky.ndjson:4: a presigned URL X-Amz-Signature value appears in the line',
      'storage-logs-leaky.ndjson:5: a presigned URL X-Amz-Signature value appears in the line',
    ]);
    expect(problems.join('\n')).not.toMatch(/FIXTURExSIGNATURE|0123456789abcdef/u);
  });

  it('accepts redacted headers, key ids, reasons and redacted signatures', () => {
    expect(logSecretProblems('storage-logs-clean.ndjson', fixture('storage-logs-clean.ndjson'))).toEqual([]);
  });
});
