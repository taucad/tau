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
 * `agent-evidence-langfuse-units` (Langfuse blueprint LW24, ruling 13): Langfuse Hobby allows 50k units a month, and a
 * unit is a trace, an observation or a score. The rule fires when the units Tau wrote in the last 31 days reach 70% of
 * that, 35,000; a rolling 31-day sum is never smaller than any billing period's running total, so it can fire early but
 * not late.
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
const boundApp = 'tau-api';

/** The rule as Tau Cloud renders it: one app in place of `app=~".*"`, evaluated as an instant query. */
const rule = ((): AlertRule => {
  const found = warning.rules.find(({ uid }) => uid === 'agent-evidence-langfuse-units');
  if (!found) {
    throw new Error('no agent-evidence-langfuse-units rule');
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
const day = 24 * hour;
const start = 32 * day;
const end = start + 2 * hour;
const lastWeek = start - 7 * day;

/** `tau.agent_evidence.langfuse_units` of one kind on one machine, exported every minute, `units` written at `at`. */
const written = (
  kind: 'trace' | 'observation' | 'score',
  units: number,
  { at = lastWeek, instance = 'machine-1' }: Readonly<{ at?: number; instance?: string }> = {},
): Series => {
  const samples: Sample[] = [];
  for (let t = 0; t <= end; t += minute) {
    samples.push([t, t >= at ? units : 0]);
  }
  return {
    labels: {
      __name__: 'tau_agent_evidence_langfuse_units_total',
      app: boundApp,
      instance,
      service_name: 'tau-api',
      kind,
    },
    samples,
  };
};

const simulate = (series: readonly Series[]) =>
  simulateAlert(new SeriesStore(series), rule, { from: start, to: end, evaluationInterval });

describe('agent-evidence-langfuse-units evaluated on synthetic series (LW24)', () => {
  it('should fire once the units of the last 31 days reach 35,000', () => {
    const transitions = simulate([written('observation', 35_000)]);

    expect(transitions.map(({ to }) => to)).toEqual(['Pending', 'Alerting']);
    expect(transitions[1]!.at).toBe(start + rule.forSeconds);
  });

  it('should stay quiet one unit below 35,000', () => {
    expect(simulate([written('observation', 34_999)])).toEqual([]);
  });

  it('should sum traces, observations and scores across machines', () => {
    const transitions = simulate([
      written('trace', 5000),
      written('observation', 20_000, { instance: 'machine-1' }),
      written('observation', 8000, { instance: 'machine-2' }),
      written('score', 2000),
    ]);

    expect(transitions.map(({ to }) => to)).toContain('Alerting');
  });

  it('should forget units written more than 31 days ago', () => {
    expect(simulate([written('observation', 35_000, { at: hour })])).toEqual([]);
  });

  it('should stay Normal with no series', () => {
    expect(simulate([])).toEqual([]);
  });
});
