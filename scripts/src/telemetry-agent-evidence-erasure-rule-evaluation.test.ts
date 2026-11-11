/* eslint-disable @typescript-eslint/naming-convention -- keys are Prometheus label names */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/* The same offline oracle as `telemetry-runtime-rule-evaluation.test.ts`; it documents the PromQL subset it implements. */
const oracle = await import('./telemetry-promql-oracle.mts');
type Oracle = typeof oracle;
const { parseDuration, SeriesStore, simulateAlert } = oracle;
type AlertRule = Parameters<Oracle['simulateAlert']>[1];
type Series = ConstructorParameters<Oracle['SeriesStore']>[0][number];
type Sample = Series['samples'][number];

/**
 * `agent-evidence-erasure-stuck` (charter I6 as amended by ruling 9; blueprint LI8): an accepted Langfuse delete is
 * the erasure and nothing is read back, so the rule fires when trace deletions have been retried for 2 h with none
 * accepted, and read-backs no longer count.
 */
const grafanaRoot = path.resolve(import.meta.dirname, '../../infra/grafana');

type RuleJson = Readonly<{
  uid: string;
  condition: string;
  for: string;
  noDataState: AlertRule['noDataState'];
  data: ReadonlyArray<Readonly<{ refId: string; model: Readonly<{ expr?: string }> }>>;
}>;

const warning = JSON.parse(readFileSync(path.join(grafanaRoot, 'alerts/tau-warning.json'), 'utf8')) as {
  // oxlint-disable-next-line tau-lint/no-bare-time-identifier -- Grafana's rule-group key, in seconds
  interval: number;
  rules: RuleJson[];
};
const { interval: evaluationInterval } = warning;
const boundApp = 'tau-api-staging';

/** The rule as Tau Cloud renders it: one app in place of `app=~".*"`, evaluated as an instant query. */
const rule = ((): AlertRule => {
  const found = warning.rules.find(({ uid }) => uid === 'agent-evidence-erasure-stuck');
  if (!found) {
    throw new Error('no agent-evidence-erasure-stuck rule');
  }
  const condition = found.data.find(({ refId }) => refId === found.condition)!;
  return {
    expr: condition.model.expr!.replaceAll('app=~".*"', `app="${boundApp}"`),
    forSeconds: parseDuration(found.for),
    noDataState: found.noDataState,
  };
})();

const minute = 60;
const hour = 3600;
const start = 6 * hour;
const end = start + 6 * hour;

/**
 * One `outcome` of `tau.agent_evidence.erasure_traces`, exported every minute from `from`, stepping up by one at
 * each time in `increments`.
 */
const outcome = (name: string, increments: readonly number[], from = 0): Series => {
  const samples: Sample[] = [];
  for (let t = from; t <= end; t += minute) {
    samples.push([t, increments.filter((at) => at <= t).length]);
  }
  return {
    labels: {
      __name__: 'tau_agent_evidence_erasure_traces_total',
      app: boundApp,
      instance: 'machine-1',
      service_name: 'tau-api',
      outcome: name,
    },
    samples,
  };
};

const simulate = (series: readonly Series[]) =>
  simulateAlert(new SeriesStore(series), rule, { from: start, to: end, evaluationInterval });

/** The first deletion an hour in, then retries on the drainer's doubling backoff, the last two hours after the first. */
const failedAt = start + hour;
const backoff = [0, 1, 3, 7, 15, 31, 63, 123].map((offset) => failedAt + offset * minute);

describe('agent-evidence-erasure-stuck evaluated on synthetic series (LW1)', () => {
  it('should fire when deletions are retried for 2 h with none accepted', () => {
    const transitions = simulate([outcome('retry', backoff)]);

    expect(transitions.map(({ to }) => to)).toEqual(['Pending', 'Alerting', 'Normal']);
    const [pending, alerting] = transitions as [(typeof transitions)[number], (typeof transitions)[number]];
    expect(pending.at).toBeGreaterThanOrEqual(backoff[0]!);
    expect(pending.at).toBeLessThanOrEqual(backoff[0]! + 2 * minute);
    expect(alerting.at).toBe(pending.at + rule.forSeconds);
  });

  it('should stay quiet when a retried deletion is accepted within the window', () => {
    const transitions = simulate([
      outcome('retry', backoff.slice(0, 4)),
      outcome('accepted', [backoff[3]! + 8 * minute], failedAt),
    ]);

    expect(transitions.map(({ to }) => to)).not.toContain('Alerting');
  });

  it('should no longer count read-backs, which the drainer no longer makes', () => {
    const loop = Array.from({ length: 48 }, (_, index) => failedAt + index * 5 * minute);

    expect(simulate([outcome('recheck', loop)])).toEqual([]);
    expect(simulate([outcome('present', loop)])).toEqual([]);
    expect(simulate([outcome('accepted', [failedAt])])).toEqual([]);
  });

  it('should stay Normal with no series and with a flat retry series', () => {
    expect(simulate([])).toEqual([]);
    expect(simulate([outcome('retry', [])])).toEqual([]);
  });
});
