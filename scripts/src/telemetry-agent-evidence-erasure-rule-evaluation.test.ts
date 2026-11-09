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
 * `agent-evidence-erasure-stuck` (charter W0, invariant I6): a Langfuse read-back that never answers is counted as
 * `recheck`, so a confirmation loop that never reaches `absent` (a legacy-API 410 every five minutes) alerts instead
 * of looping silently.
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

/** Deletion requested an hour in, then three unanswered read-backs five minutes apart. */
const requestedAt = start + hour;
const rechecks = [0, 5, 10].map((offset) => requestedAt + 15 * minute + offset * minute);

describe('agent-evidence-erasure-stuck evaluated on synthetic series (W0)', () => {
  it('should fire on three recheck increments with no absent within the window', () => {
    const transitions = simulate([outcome('requested', [requestedAt]), outcome('recheck', rechecks)]);

    expect(transitions.map(({ from, to }) => `${from}→${to}`)).toEqual([
      'Normal→Pending',
      'Pending→Alerting',
      'Alerting→Normal',
    ]);
    const [pending, alerting] = transitions as [(typeof transitions)[number], (typeof transitions)[number]];
    expect(pending.at).toBeGreaterThanOrEqual(rechecks[0]!);
    expect(pending.at).toBeLessThanOrEqual(rechecks[1]!);
    expect(alerting.at).toBe(pending.at + rule.forSeconds);
  });

  it('should keep firing while a confirmation loop rechecks every five minutes', () => {
    const loop = Array.from({ length: 48 }, (_, index) => requestedAt + 15 * minute + index * 5 * minute);
    const transitions = simulate([outcome('recheck', loop)]);

    /* The loop outlasts the run, so the alert never resolves inside it. */
    expect(transitions.map(({ to }) => to)).toEqual(['Pending', 'Alerting']);
    expect(transitions[1]!.at).toBeLessThan(loop.at(-1)!);
  });

  it('should stay quiet when a read-back confirms absence after the rechecks', () => {
    const transitions = simulate([
      outcome('recheck', rechecks),
      outcome('absent', [rechecks[2]! + 5 * minute], requestedAt),
    ]);

    expect(transitions.map(({ to }) => to)).not.toContain('Alerting');
  });

  it('should stay Normal with no series and with a flat recheck series', () => {
    expect(simulate([])).toEqual([]);
    expect(simulate([outcome('recheck', [])])).toEqual([]);
  });
});
