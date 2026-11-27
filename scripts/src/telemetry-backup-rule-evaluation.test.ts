/* eslint-disable @typescript-eslint/naming-convention -- keys are Prometheus label names */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/* The oracle lives in `scripts/` beside the other test-only derivations, outside the library and its coverage. */
const oracle = await import('./telemetry-promql-oracle.mts');
type Oracle = typeof oracle;
const { parseDuration, SeriesStore, simulateAlert } = oracle;
type AlertRule = Parameters<Oracle['simulateAlert']>[1];
type Series = ConstructorParameters<Oracle['SeriesStore']>[0][number];

/**
 * The backup admission rules (cloud backup admission blueprint D12, WP2a, review fixes F1 to F4), evaluated offline
 * against synthetic `tau_sync_hook_refusals_total` series:
 *
 * - F1: `backup-first-refused` is a Prometheus rule on its own, so it fires with no log data at all; its log twin is
 *   a separate rule whose empty query cannot mask it.
 * - F2: every log rule parses Fly's envelope before reading the app's fields.
 * - F4: a first backup refused by a terminal guard pages; quota and ceiling only warn; a single check-failed warns
 *   and three in 15 minutes page.
 */
const grafanaRoot = path.resolve(import.meta.dirname, '../../infra/grafana');

type RuleJson = Readonly<{
  uid: string;
  condition: string;
  for: string;
  noDataState: AlertRule['noDataState'];
  labels: Readonly<Record<string, string>>;
  data: ReadonlyArray<Readonly<{ refId: string; datasourceUid: string; model: Readonly<{ expr?: string }> }>>;
}>;
// oxlint-disable-next-line tau-lint/no-bare-time-identifier -- Grafana's rule-group key, in seconds
type Group = Readonly<{ interval: number; rules: readonly RuleJson[] }>;

const group = (file: string): Group =>
  JSON.parse(readFileSync(path.join(grafanaRoot, 'alerts', file), 'utf8')) as Group;
const critical = group('tau-storage-critical.json');
const warning = group('tau-storage-warning.json');
const rules = [...critical.rules, ...warning.rules];
const evaluationInterval = critical.interval;

const boundApp = 'tau-api-production';
const ruleJson = (uid: string): RuleJson => {
  const rule = rules.find((candidate) => candidate.uid === uid);
  if (!rule) {
    throw new Error(`no rule ${uid}`);
  }
  return rule;
};
/** The rule as Tau Cloud renders it: one app, the condition as an instant query. */
const ruleOf = (uid: string): AlertRule => {
  const rule = ruleJson(uid);
  const condition = rule.data.find(({ refId }) => refId === rule.condition)!;
  return {
    noDataState: rule.noDataState,
    expr: condition.model.expr!.replaceAll('app=~".*"', `app="${boundApp}"`),
    forSeconds: parseDuration(rule.for),
  };
};

const minute = 60;
const start = 2 * 3600;
const end = start + 3600;

/**
 * One seeded refusal counter: zero from boot, then `refusals` increments at `at`.
 *
 * @param labels - The series' code, first-backup flag and client rules.
 * @param count - Increments at `at`.
 * @param at - When the refusals land.
 * @returns The series.
 */
const refusals = (
  labels: Readonly<{ code: string; firstBackup: string; rules?: string }>,
  count: number,
  at: number,
): Series => {
  const samples: Array<readonly [number, number]> = [];
  for (let t = 0; t <= end; t += minute) {
    samples.push([t, t >= at ? count : 0]);
  }
  return {
    labels: {
      __name__: 'tau_sync_hook_refusals_total',
      app: boundApp,
      service_name: 'tau-api',
      tau_sync_refusal_code: labels.code,
      tau_sync_first_backup: labels.firstBackup,
      tau_sync_client_rules: labels.rules ?? 'none',
    },
    samples,
  };
};

const fires = (uid: string, series: readonly Series[]): boolean =>
  simulateAlert(new SeriesStore(series), ruleOf(uid), { from: start, to: end, evaluationInterval }).some(
    ({ to }) => to === 'Alerting',
  );

const at = start + 20 * minute;

describe('backup admission rules (WP2a review fixes)', () => {
  it('F1: backup-first-refused reads Prometheus only, and its log twin is a rule of its own', () => {
    const first = ruleJson('backup-first-refused');
    expect(first.data.map(({ datasourceUid }) => datasourceUid)).toEqual(['prometheus']);
    expect(first.labels['severity']).toBe('critical');
    const twin = ruleJson('backup-first-logs');
    expect(twin.data[0]?.datasourceUid).toBe('loki');
    expect(twin.labels['severity']).toBe('critical');
    expect(ruleJson('backup-retired-logs').data[0]?.datasourceUid).toBe('loki');
  });

  it('F1: pages on a refused first backup with the metric alone, from the first refusal after boot', () => {
    expect(
      fires('backup-first-refused', [refusals({ code: 'GIT_PUSH_FILE_TOO_LARGE', firstBackup: 'true' }, 1, at)]),
    ).toBe(true);
    expect(
      fires('backup-first-refused', [refusals({ code: 'GIT_PUSH_FILE_TOO_LARGE', firstBackup: 'true' }, 0, at)]),
    ).toBe(false);
    expect(
      fires('backup-first-refused', [refusals({ code: 'GIT_PUSH_FILE_TOO_LARGE', firstBackup: 'false' }, 1, at)]),
    ).toBe(false);
  });

  it('F4: pages on every terminal code, and never on quota, ceiling, check-failed or a code the client clears', () => {
    for (const code of [
      'GIT_PUSH_NOT_ADMITTED',
      'GIT_PUSH_REF_NOT_PUSHABLE',
      'GIT_PUSH_REF_DELETION',
      'GIT_PUSH_RECORD_REWRITTEN',
      'GIT_PUSH_CONFLICT_REF_INVALID',
      'GIT_PUSH_CONFLICT_OFF_LINE',
      'GIT_PUSH_VERSION_TAG_INVALID',
      'GIT_PUSH_VERSION_MOVED',
      'GIT_PUSH_FILE_TOO_LARGE',
      'GIT_PUSH_TOO_LARGE',
      'GIT_PUSH_OBJECT_INVALID',
      'GIT_PUSH_RECORD_UNREADABLE',
    ]) {
      expect(fires('backup-first-refused', [refusals({ code, firstBackup: 'true' }, 1, at)]), code).toBe(true);
    }
    for (const code of [
      'GIT_PUSH_QUOTA',
      'GIT_PUSH_CEILING',
      'GIT_PUSH_CHECK_FAILED',
      'GIT_PUSH_NOT_FAST_FORWARD',
      'GIT_PUSH_VERSION_NUMBER_TAKEN',
    ]) {
      expect(fires('backup-first-refused', [refusals({ code, firstBackup: 'true' }, 1, at)]), code).toBe(false);
    }
  });

  it('F4: a first backup over quota or the ceiling warns, and only on a first backup', () => {
    expect(ruleJson('backup-first-quota').labels['severity']).toBe('warning');
    for (const code of ['GIT_PUSH_QUOTA', 'GIT_PUSH_CEILING']) {
      expect(fires('backup-first-quota', [refusals({ code, firstBackup: 'true' }, 1, at)]), code).toBe(true);
      expect(fires('backup-first-quota', [refusals({ code, firstBackup: 'false' }, 1, at)]), code).toBe(false);
    }
  });

  it('F4: one check-failed warns; three in 15 minutes across projects page', () => {
    expect(ruleJson('backup-check-failed').labels['severity']).toBe('warning');
    expect(ruleJson('backup-check-repeat').labels['severity']).toBe('critical');
    const one = [refusals({ code: 'GIT_PUSH_CHECK_FAILED', firstBackup: 'false' }, 1, at)];
    expect(fires('backup-check-failed', one)).toBe(true);
    expect(fires('backup-check-repeat', one)).toBe(false);
    const three = [
      refusals({ code: 'GIT_PUSH_CHECK_FAILED', firstBackup: 'false' }, 2, at),
      refusals({ code: 'GIT_PUSH_CHECK_FAILED', firstBackup: 'true', rules: 'current' }, 1, at),
    ];
    expect(fires('backup-check-repeat', three)).toBe(true);
  });

  it('F3: a retired code on an unflagged push pages from the first refusal on a seeded series', () => {
    expect(
      fires('backup-retired-code', [refusals({ code: 'GIT_PUSH_RECORD_UNREADABLE', firstBackup: 'unknown' }, 1, at)]),
    ).toBe(true);
    expect(fires('backup-unknown-refusal', [refusals({ code: 'unknown', firstBackup: 'false' }, 1, at)])).toBe(true);
  });

  it('F2: every log rule parses the Fly envelope before it reads an app field', () => {
    const logRules = rules.filter(
      ({ uid, data }) => uid.startsWith('backup-') && data.some(({ datasourceUid }) => datasourceUid === 'loki'),
    );
    expect(logRules.map(({ uid }) => uid).toSorted()).toEqual([
      'backup-first-logs',
      'backup-retired-logs',
      'backup-terminal-loop',
    ]);
    for (const rule of logRules) {
      const expr = rule.data.find(({ datasourceUid }) => datasourceUid === 'loki')?.model.expr ?? '';
      expect(expr, rule.uid).toContain('|= "A push was refused" != "A push was refused for"');
      if (/\| (?:first_backup|terminal)=/u.test(expr)) {
        expect(expr, rule.uid).toContain('| json | line_format "{{.message}}" | json |');
      }
    }
  });
});
