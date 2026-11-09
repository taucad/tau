/* eslint-disable @typescript-eslint/naming-convention -- keys are Prometheus label names */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/* The oracle lives in `scripts/` beside the other test-only derivations, outside the library and its coverage. */
const oracle = await import('../scripts/promql-oracle.mts');
type Oracle = typeof oracle;
const { assertSupported, parseDuration, SeriesStore, simulateAlert } = oracle;
type AlertRule = Parameters<Oracle['simulateAlert']>[1];
type Transition = ReturnType<Oracle['simulateAlert']>[number];
type Element = ReturnType<InstanceType<Oracle['SeriesStore']>['query']>[number];
type Series = ConstructorParameters<Oracle['SeriesStore']>[0][number];
type Labels = Series['labels'];
type Sample = Series['samples'][number];

/** A number within `10^-digits` of `value`, for `toEqual`. */
const near = (value: number, digits = 6): number => expect.closeTo(value, digits) as number;

/**
 * T13 (runtime alert and panel query correctness): the checked-in runtime rules and dashboard panels are evaluated
 * against synthetic series, offline, by the oracle in `scripts/promql-oracle.mts` (no PromQL engine is in the
 * dependency tree; the oracle documents the subset it implements). `grafana-contract.test.ts` pins the selectors
 * statically; this file asserts the numbers, the minimum-traffic guards, missing versus zero data, the
 * Pending → Alerting → Normal sequence per rule, and that series from two releases are not counted twice.
 */
const grafanaRoot = path.resolve(import.meta.dirname, '../../../infra/grafana');

type RuleJson = Readonly<{
  uid: string;
  condition: string;
  for: string;
  noDataState: AlertRule['noDataState'];
  execErrState: string;
  isPaused?: boolean;
  labels: Readonly<Record<string, string>>;
  data: ReadonlyArray<Readonly<{ refId: string; datasourceUid: string; model: Readonly<{ expr?: string }> }>>;
}>;

const warning = JSON.parse(readFileSync(path.join(grafanaRoot, 'alerts/tau-warning.json'), 'utf8')) as {
  // oxlint-disable-next-line tau-lint/no-bare-time-identifier -- Grafana's rule-group key, in seconds
  interval: number;
  rules: RuleJson[];
};
const runtimeRules = warning.rules.filter(({ labels }) => labels['component'] === 'runtime');
/** The rule group's evaluation interval, in seconds. */
const { interval: evaluationInterval } = warning;

/** The app this suite binds to, and a second environment's app whose series must never leak in. */
const boundApp = 'tau-api-production';
const otherApp = 'tau-api-staging';

/**
 * The rule as Tau Cloud renders it: `modules/grafana-content/main.tf` replaces the exact `app=~".*"` matcher with
 * one app and forces the condition query to an instant query, which is how the oracle evaluates it.
 */
const ruleOf = (uid: string): AlertRule & RuleJson => {
  const rule = runtimeRules.find((candidate) => candidate.uid === uid);
  if (!rule) {
    throw new Error(`no runtime rule ${uid}`);
  }
  const condition = rule.data.find(({ refId }) => refId === rule.condition)!;
  return {
    ...rule,
    expr: condition.model.expr!.replaceAll('app=~".*"', `app="${boundApp}"`),
    forSeconds: parseDuration(rule.for),
  };
};

const minute = 60;
const hour = 3600;
const day = 86_400;
/** The first evaluation; eight days of history before it leave room for the 7-day baselines. */
const start = 8 * day;
const end = start + 5 * hour;
const burstFrom = start + 30 * minute;
const burstTo = start + 150 * minute;
const inBurst = (t: number): boolean => t >= burstFrom && t < burstTo;
const always = (): boolean => true;

type Rate = number | ((t: number) => number);

/**
 * A cumulative counter exported every `step` seconds, as an OTLP exporter sends it.
 *
 * @param labels - Its labels, including `__name__`.
 * @param perMinute - Increments per minute, constant or as a function of time.
 * @param options - The first and last export, the export step and the starting value.
 * @returns The series.
 */
const counter = (
  labels: Labels,
  perMinute: Rate,
  {
    from = 0,
    to = end,
    step = minute,
    initial = 0,
  }: { from?: number; to?: number; step?: number; initial?: number } = {},
): Series => {
  const samples: Sample[] = [];
  let value = initial;
  for (let t = from; t <= to; t += step) {
    samples.push([t, value]);
    value += ((typeof perMinute === 'number' ? perMinute : perMinute(t)) * step) / minute;
  }
  return { labels, samples };
};

/** A gauge with one value from `from` to `to`. */
const gauge = (labels: Labels, value: number, { from = 0, to = end } = {}): Series =>
  counter(labels, 0, { from, to, initial: value });

/**
 * Series of the bound app from one Fly Machine. Fly's managed Prometheus scrapes the API's exporter and labels each
 * series by app and Machine (`instance`); the exporter adds `service_name`.
 */
const api = (name: string, labels: Readonly<Record<string, string>> = {}, instance = 'machine-1'): Labels => ({
  __name__: name,
  app: boundApp,
  instance,
  service_name: 'tau-api',
  ...labels,
});

/** `perMinute` while `active` holds, else `otherwise`. */
const during =
  (active: (t: number) => boolean, perMinute: number, otherwise = 0): ((t: number) => number) =>
  (t) =>
    active(t) ? perMinute : otherwise;

/** Classic histogram buckets for observations that all land in the bucket `le`. */
const histogram = (
  name: string,
  labels: Readonly<Record<string, string>>,
  { bounds, le: landing, perMinute }: Readonly<{ bounds: readonly string[]; le: string; perMinute: Rate }>,
): Series[] => {
  const landed = bounds.indexOf(landing);
  return [
    ...bounds.map((le, index) => counter(api(`${name}_bucket`, { ...labels, le }), index >= landed ? perMinute : 0)),
    counter(api(`${name}_count`, labels), perMinute),
  ];
};

/** Abandoned attempts of one operation, all taking up to `le` seconds. */
const abandoned = (operation: string, le: string, perMinute: Rate): Series[] =>
  histogram(
    'tau_runtime_operation_duration',
    { tau_runtime_operation: operation, tau_runtime_outcome: 'abandoned' },
    { bounds: ['30', '120', '600', '+Inf'], le, perMinute },
  );

/** Delivered telemetry batches from one route, all delayed up to `le` seconds. */
const delays = (route: string, le: string, perMinute: Rate): Series[] =>
  histogram(
    'tau_telemetry_client_delivery_delay',
    { tau_runtime_route: route },
    { bounds: ['60', '120', '300', '600', '+Inf'], le, perMinute },
  );

/**
 * `process_uptime` of one Fly machine: it restarts every 5 minutes while `active` holds and `scale` is non-zero, and
 * stands still when `scale` is 0.
 */
const uptime = (active: (t: number) => boolean, scale: number): Series => {
  const samples: Sample[] = [];
  let value = 3 * day;
  for (let t = 0; t <= end; t += minute) {
    samples.push([t, value]);
    value = scale > 0 && active(t) && (t - burstFrom) % (5 * minute) === 4 * minute ? 0 : value + minute * scale;
  }
  return { labels: api('process_uptime', { tau_process: 'app' }), samples };
};

type Scenario = Readonly<{
  /** The longest range the rule reads, which bounds how late it may enter Pending and leave Alerting. */
  window: number;
  /**
   * Healthy baseline traffic plus a breach while `active` holds, every rate multiplied by `scale`. `scale` 0 is the
   * same series, present and flat.
   */
  traffic: (active: (t: number) => boolean, scale: number) => Series[];
  /** The condition's value with the breach active for a whole window, from one instance. */
  value: number;
  /** A breach sustained for the whole run but below the rule's minimum traffic; absent when the rule has none. */
  low?: () => Series[];
  /** Why a flat series is not a quiet one for this rule; the zero case is skipped when set. */
  zeroFires?: string;
  /** Why a redeploy is itself this rule's signal; the redeploy cases are skipped when set. */
  redeployCounts?: string;
}>;

const operations = 'tau_runtime_operations_total';
const errors = 'tau_runtime_operation_errors_total';

/**
 * One scenario per `component=runtime` rule; `telemetry-runtime-absent` (it fires on absence) and
 * `telemetry-heartbeat` (it always fires) have their own tests below.
 */
const scenarios: Readonly<Record<string, Scenario>> = {
  'tau-process-restarting': {
    window: 30 * minute,
    traffic: (active, scale) => [uptime(active, scale)],
    // A restart every 5 minutes: six resets in any 30-minute window.
    value: 6,
    // A deploy restarts the process once.
    low: () => [uptime((t) => t === start + hour - 4 * minute, 1)],
    redeployCounts: 'a deploy restarts the process, and the low-traffic case shows one restart does not fire',
  },
  'runtime-implementation-failures': {
    window: 15 * minute,
    traffic: (active, scale) => [
      counter(api(operations, { tau_runtime_operation: 'render', tau_runtime_outcome: 'succeeded' }), 100 * scale),
      counter(
        api(operations, {
          tau_runtime_operation: 'render',
          tau_runtime_outcome: 'failed',
          tau_runtime_cause: 'implementation',
        }),
        during(active, 20 * scale),
      ),
      // Superseded work is neither a failure nor completed, so a flood of it cannot move the ratio.
      counter(api(operations, { tau_runtime_operation: 'render', tau_runtime_outcome: 'superseded' }), 500 * scale),
    ],
    value: 20 / 120,
    low: () => [
      // A third of the attempts fail and 15 failures pass the count guard, but 45 completed attempts are under 50.
      counter(api(operations, { tau_runtime_operation: 'render', tau_runtime_outcome: 'succeeded' }), 2),
      counter(
        api(operations, {
          tau_runtime_operation: 'render',
          tau_runtime_outcome: 'failed',
          tau_runtime_cause: 'implementation',
        }),
        1,
      ),
    ],
  },
  'runtime-host-kills-deadlines': {
    window: 15 * minute,
    traffic: (active, scale) => [
      counter(api(errors, { tau_runtime_operation: 'render', error_type: 'HOST_EXITED' }), during(active, scale)),
      // An error type outside the rule's set never counts.
      counter(api(errors, { tau_runtime_operation: 'render', error_type: 'KERNEL_ERROR' }), 10 * scale),
    ],
    value: 15,
    low: () => [counter(api(errors, { tau_runtime_operation: 'render', error_type: 'TIMEOUT_RECOVERY' }), 0.25)],
  },
  'runtime-boot-failures': {
    window: 15 * minute,
    traffic: (active, scale) => [
      counter(api(operations, { tau_runtime_operation: 'initialize', tau_runtime_outcome: 'succeeded' }), 10 * scale),
      counter(
        api(operations, { tau_runtime_operation: 'initialize', tau_runtime_outcome: 'failed' }),
        during(active, 5 * scale),
      ),
      counter(api(operations, { tau_runtime_operation: 'initialize', tau_runtime_outcome: 'cancelled' }), scale),
    ],
    value: 5 / 16,
    low: () => [
      // 15 failures out of 18 attempts: the ratio and failure guards pass, the 20-attempt guard does not.
      counter(api(operations, { tau_runtime_operation: 'initialize', tau_runtime_outcome: 'failed' }), 1),
      counter(api(operations, { tau_runtime_operation: 'initialize', tau_runtime_outcome: 'succeeded' }), 0.2),
    ],
  },
  'runtime-capacity-refusal-surge': {
    window: hour,
    traffic: (active, scale) => [
      counter(
        api('tau_runtime_capacity_refusals_total', { tau_runtime_limit: 'workers' }),
        during(active, 4 * scale, scale),
        {
          step: 5 * minute,
        },
      ),
    ],
    value: 4 / minute,
    // No refusals for a week, then 18 in an hour: infinitely above the baseline, under the 20-refusal guard.
    low: () => [
      counter(
        api('tau_runtime_capacity_refusals_total', { tau_runtime_limit: 'workers' }),
        (t) => (t >= start ? 0.3 : 0),
        {
          step: 5 * minute,
        },
      ),
    ],
  },
  'runtime-stalls': {
    window: hour,
    traffic: (active, scale) => [
      counter(
        api('tau_runtime_late_terminals_total', { tau_runtime_settled_as: 'succeeded' }),
        during(active, 0.05 * scale),
      ),
      // Abandoned operations over 120 s are stalls; the ones under it are not.
      ...abandoned('render', '600', during(active, 0.05 * scale)),
      ...abandoned('export', '30', 5 * scale),
    ],
    value: 6,
    low: () => [counter(api('tau_runtime_late_terminals_total', { tau_runtime_settled_as: 'failed' }), 4 / 60)],
  },
  'runtime-viewer-context-loss': {
    window: hour,
    traffic: (active, scale) => [
      counter(
        api('tau_runtime_viewer_events_total', {
          tau_runtime_backend: 'webgpu',
          tau_runtime_viewer_event: 'first-frame',
        }),
        10 * scale,
      ),
      counter(
        api('tau_runtime_viewer_events_total', {
          tau_runtime_backend: 'webgpu',
          tau_runtime_viewer_event: 'context-lost',
        }),
        during(active, scale),
      ),
    ],
    value: 0.1,
    low: () => [
      counter(
        api('tau_runtime_viewer_events_total', {
          tau_runtime_backend: 'webgl',
          tau_runtime_viewer_event: 'first-frame',
        }),
        2.5,
      ),
      counter(
        api('tau_runtime_viewer_events_total', {
          tau_runtime_backend: 'webgl',
          tau_runtime_viewer_event: 'context-lost',
        }),
        1,
      ),
    ],
  },
  'runtime-jobs-need-attention': {
    window: hour,
    traffic: (active, scale) => [
      counter(api('tau_runtime_job_attention_total', { tau_runtime_plugin: 'fea' }), during(active, 0.2 * scale)),
    ],
    value: 12,
    low: () => [counter(api('tau_runtime_job_attention_total', { tau_runtime_plugin: 'fea' }), 4 / 60)],
  },
  'telemetry-ingest-rejections': {
    window: 15 * minute,
    traffic: (active, scale) => [
      counter(api('tau_telemetry_ingest_entries_total', { disposition: 'recorded' }), 1000 * scale),
      counter(
        api('tau_telemetry_ingest_entries_total', { disposition: 'rejected-rate-limit' }),
        during(active, 20 * scale),
      ),
    ],
    value: 300,
    low: () => [counter(api('tau_telemetry_ingest_entries_total', { disposition: 'overflow' }), 6.6)],
  },
  'telemetry-spans-dropped': {
    window: hour,
    traffic: (active, scale) => [
      counter(api('tau_telemetry_spans_dropped_total', { tau_runtime_route: 'worker' }), during(active, 500 * scale)),
    ],
    value: 30_000,
    low: () => [counter(api('tau_telemetry_spans_dropped_total', { tau_runtime_route: 'worker' }), 150)],
  },
  'telemetry-delivery-delay': {
    window: 30 * minute,
    traffic: (active, scale) => [...delays('desktop', '60', scale), ...delays('web', '300', during(active, 2 * scale))],
    // 30 fast and 60 slow deliveries: rank 85.5 falls in (120, 300], 120 + 180 × 55.5 / 60.
    value: 286.5,
    low: () => delays('web', '600', 0.5),
  },
  'telemetry-metric-overflow': {
    window: 5 * minute,
    traffic: (active) => [
      {
        labels: api(operations, { otel_metric_overflow: 'true' }),
        samples: counter(api(operations), 1).samples.filter(([t]) => active(t)),
      },
    ],
    value: 1,
    // Each overflowing instrument is its own signal, so a sibling instrument's overflow series counts too.
    zeroFires:
      'an overflow series is the signal whatever its value, and a cumulative exporter keeps sending it for the life of the process',
  },
  'telemetry-ingest-redis-unavailable': {
    window: 10 * minute,
    traffic: (active, scale) => [
      counter(api('tau_telemetry_ingest_unavailable_total', { check: 'budget' }), during(active, 0.2 * scale)),
    ],
    value: 2,
  },
  'telemetry-signed-out-surge': {
    window: hour,
    traffic: (active, scale) => [
      counter(
        api('tau_telemetry_ingest_entries_total', { disposition: 'recorded', tau_runtime_population: 'signed-out' }),
        during(active, 50 * scale, 10 * scale),
        { step: 5 * minute },
      ),
    ],
    value: 50 / minute,
    // No signed-out traffic for a week, then 1,800 in an hour and 900 rate-limited in 15 minutes: both under their guards.
    low: () => [
      counter(
        api('tau_telemetry_ingest_entries_total', { disposition: 'recorded', tau_runtime_population: 'signed-out' }),
        (t) => (t >= start ? 30 : 0),
      ),
      counter(
        api('tau_telemetry_ingest_entries_total', {
          disposition: 'rejected-rate-limit',
          tau_runtime_population: 'signed-out',
        }),
        (t) => (t >= start ? 60 : 0),
      ),
    ],
  },
};

const simulate = (uid: string, series: readonly Series[]): Transition[] =>
  simulateAlert(new SeriesStore(series), ruleOf(uid), { from: start, to: end, evaluationInterval });

/** Every evaluation's result over the run. */
const results = (uid: string, series: readonly Series[]): Element[][] => {
  const store = new SeriesStore(series);
  const { expr } = ruleOf(uid);
  const out: Element[][] = [];
  for (let at = start; at <= end; at += evaluationInterval) {
    out.push(store.query(expr, at));
  }
  return out;
};

/** A time well inside the burst, with a whole window of it behind. */
const midBurst = burstFrom + 90 * minute;

const valuesAt = (uid: string, series: readonly Series[], at = midBurst): number[] =>
  new SeriesStore(series).query(ruleOf(uid).expr, at).map(({ value }) => value);

describe('PromQL oracle anchors (T13)', () => {
  // Expected values are Prometheus' own, from promql/promqltest/testdata (functions.test, histograms.test), Prometheus 3.
  const fiveMinutes = 5 * minute;
  const loaded = (labels: Labels, values: readonly number[]): Series => ({
    labels,
    samples: values.map((value, index) => [index * fiveMinutes, value] as const),
  });
  const ramp = (increment: number, count: number, from = 0): number[] =>
    Array.from({ length: count + 1 }, (_, index) => from + increment * index);

  it('should extrapolate increase and rate as Prometheus does, with a counter reset', () => {
    const store = new SeriesStore([
      loaded({ __name__: 'http_requests_total', path: '/foo' }, ramp(10, 10)),
      loaded({ __name__: 'http_requests_total', path: '/bar' }, [...ramp(10, 5), ...ramp(10, 5)]),
    ]);
    const increase = store.query('increase(http_requests_total[50m])', 50 * minute);
    expect(increase.map(({ labels, value }) => [labels['path'], value])).toEqual([
      ['/foo', 100],
      ['/bar', near(800 / 9, 9)],
    ]);
    expect(store.query('rate(http_requests_total{path="/foo"}[50m])', 50 * minute)[0]!.value).toBeCloseTo(
      100 / 3000,
      12,
    );
  });

  it('should interpolate a classic histogram quantile inside its bucket', () => {
    const bucket = (le: string, increment: number): Series =>
      loaded({ __name__: 'testhistogram_bucket', le, start: 'positive' }, ramp(increment, 10));
    const store = new SeriesStore([bucket('0.1', 5), bucket('.2', 7), bucket('1e0', 11), bucket('+Inf', 12)]);
    expect(store.query('histogram_quantile(0.5, testhistogram_bucket)', 50 * minute)).toEqual([
      { labels: { start: 'positive' }, value: near(0.15, 12) },
    ]);
  });

  it('should return nothing, not zero, for an aggregation or ratio over no series', () => {
    const store = new SeriesStore([]);
    expect(store.query('count({otel_metric_overflow="true"})', start)).toEqual([]);
    expect(store.query('sum(rate(a_total[5m])) / sum(rate(b_total[5m]))', start)).toEqual([]);
    expect(store.query('sum(rate(a_total[5m])) or vector(0)', start)).toEqual([{ labels: {}, value: 0 }]);
  });
});

describe('Runtime alert rules evaluated on synthetic series (T13)', () => {
  it('should have a scenario for every runtime rule', () => {
    expect([...Object.keys(scenarios), 'telemetry-runtime-absent', 'telemetry-heartbeat'].toSorted()).toEqual(
      runtimeRules.map(({ uid }) => uid).toSorted(),
    );
    // Every scenario rule maps NoData and errors to OK; the generic cases below rely on it.
    expect(
      runtimeRules.filter(({ noDataState, execErrState }) => noDataState !== 'OK' || execErrState !== 'OK'),
    ).toEqual([]);
  });

  describe.each(Object.entries(scenarios))('%s', (uid, scenario) => {
    const rule = ruleOf(uid);

    it(`T13: should compute the condition value from the checked-in expression`, () => {
      expect(valuesAt(uid, scenario.traffic(inBurst, 1))).toEqual([near(scenario.value, 6)]);
    });

    it('T13: should stay Normal with no series at all (NoData maps to OK)', () => {
      expect(results(uid, []).every((result) => result.length === 0)).toBe(true);
      expect(simulate(uid, [])).toEqual([]);
    });

    if (scenario.zeroFires === undefined) {
      it('T13: should stay Normal when every series is present and flat', () => {
        // A ratio over zero traffic is 0/0 = NaN; the filtering comparison drops it, so no NaN reaches Grafana.
        expect(results(uid, scenario.traffic(always, 0)).every((result) => result.length === 0)).toBe(true);
        expect(simulate(uid, scenario.traffic(always, 0))).toEqual([]);
      });
    } else {
      it(`T13: should fire on a flat series, since ${scenario.zeroFires}`, () => {
        expect(simulate(uid, scenario.traffic(always, 0)).map(({ to }) => to)).toEqual(['Pending', 'Alerting']);
      });
    }

    if (scenario.low) {
      const { low } = scenario;
      it('T13: should not fire on a breach below the minimum traffic', () => {
        expect(simulate(uid, low())).toEqual([]);
      });
    }

    it('T13: should go Pending, fire after its for duration, and resolve after the breach ends', () => {
      const transitions = simulate(uid, scenario.traffic(inBurst, 1));
      const immediate = rule.forSeconds === 0;
      expect(transitions.map(({ from, to }) => `${from}→${to}`)).toEqual([
        ...(immediate ? [] : ['Normal→Pending']),
        `${immediate ? 'Normal' : 'Pending'}→Alerting`,
        'Alerting→Normal',
      ]);
      expect(new Set(transitions.map(({ instance }) => instance)).size).toBe(1);
      const [pending, alerting, resolved] = (immediate ? [transitions[0], ...transitions] : transitions) as [
        Transition,
        Transition,
        Transition,
      ];
      expect(pending.at).toBeGreaterThanOrEqual(burstFrom);
      expect(pending.at).toBeLessThanOrEqual(burstFrom + scenario.window);
      expect(alerting.at).toBe(pending.at + rule.forSeconds);
      expect(resolved.at).toBeGreaterThan(burstTo);
      expect(resolved.at).toBeLessThanOrEqual(burstTo + scenario.window + 2 * evaluationInterval);
    });

    it('T13: should not count sibling instruments or another environment', () => {
      const own = scenario.traffic(inBurst, 1);
      const siblings = own
        // An overflow series is counted per instrument by design (telemetry-metric-overflow).
        .filter(({ labels }) => labels['__name__'] === operations && labels['otel_metric_overflow'] === undefined)
        .flatMap(({ labels, samples }) =>
          [
            'tau_runtime_operations_by_host_total',
            'tau_runtime_operations_by_transport_total',
            'tau_runtime_operations_by_release_total',
          ].map((name) => ({ labels: { ...labels, __name__: name }, samples })),
        );
      const staging = own.map(({ labels, samples }) => ({ labels: { ...labels, app: otherApp }, samples }));
      expect(valuesAt(uid, [...own, ...siblings, ...staging])).toEqual(valuesAt(uid, own));
    });

    // A rule whose signal is a restart has none of these: `redeployCounts` says why.
    it.each(scenario.redeployCounts === undefined ? ['in place', 'onto a new Machine'] : [])(
      'T13: should count a redeploy %s once, the new release counting from zero',
      (where) => {
        const deployAt = burstFrom + 75 * minute;
        const redeployed = scenario.traffic(inBurst, 1).flatMap(({ labels, samples }) => {
          const old = samples.filter(([t]) => t < deployAt);
          const base = old.at(-1)?.[1] ?? 0;
          const fresh = samples.filter(([t]) => t >= deployAt).map(([t, value]) => [t, value - base] as const);
          // Fly updates a Machine in place by default, so the new release continues the series after a counter reset.
          return where === 'in place'
            ? [{ labels, samples: [...old, ...fresh] }]
            : [
                { labels, samples: old },
                { labels: { ...labels, instance: 'machine-2' }, samples: fresh },
              ];
        });
        const at = deployAt + 5 * minute;
        const single = valuesAt(uid, scenario.traffic(inBurst, 1), at);
        const mixed = valuesAt(uid, redeployed, at);
        expect(mixed).toHaveLength(single.length);
        // Within 10 %: the old series' last half-interval of extrapolation, never a second copy of the traffic.
        for (const [index, value] of mixed.entries()) {
          expect(value / single[index]!).toBeGreaterThan(0.9);
          expect(value / single[index]!).toBeLessThan(1.1);
        }
        expect(simulate(uid, redeployed).map(({ to }) => to)).toEqual([
          ...(rule.forSeconds === 0 ? [] : ['Pending']),
          'Alerting',
          'Normal',
        ]);
      },
    );
  });

  describe('runtime-implementation-failures', () => {
    it('T13: should keep one alert per operation across instances and resolve a recovered one as missing', () => {
      const failing = (operation: string, until: number, instance: string): Series[] => [
        counter(api(operations, { tau_runtime_operation: operation, tau_runtime_outcome: 'succeeded' }, instance), 50),
        counter(
          api(
            operations,
            { tau_runtime_operation: operation, tau_runtime_outcome: 'failed', tau_runtime_cause: 'implementation' },
            instance,
          ),
          (t) => (t >= burstFrom && t < until ? 10 : 0),
        ),
      ];
      // Both instances fail render; export fails on one instance and recovers first.
      const transitions = simulate('runtime-implementation-failures', [
        ...failing('render', burstTo, 'machine-1'),
        ...failing('render', burstTo, 'machine-2'),
        ...failing('export', burstFrom + hour, 'machine-1'),
      ]);
      const of = (operation: string): string[] =>
        transitions
          .filter(({ instance }) => instance === JSON.stringify([['tau_runtime_operation', operation]]))
          .map(({ to, reason }) => `${to}${reason ? `:${reason}` : ''}`);
      expect(of('render')).toEqual(['Pending', 'Alerting', 'Normal:NoData']);
      // Export drops out of a still non-empty result, so Grafana resolves it as stale after two intervals.
      expect(of('export')).toEqual(['Pending', 'Alerting', 'Normal:MissingSeries']);
      expect(transitions).toHaveLength(6);
      const exportGone = transitions.find(({ reason }) => reason === 'MissingSeries')!;
      const exportLastTrue = Math.max(
        ...results('runtime-implementation-failures', [...failing('export', burstFrom + hour, 'machine-1')]).map(
          (result, index) => (result.length > 0 ? start + index * evaluationInterval : 0),
        ),
      );
      expect(exportGone.at).toBe(exportLastTrue + 2 * evaluationInterval);
    });
  });

  describe('runtime-stalls', () => {
    it('T13: should read missing late-terminal or duration series as zero, not as no data', () => {
      const late = counter(api('tau_runtime_late_terminals_total', { tau_runtime_settled_as: 'failed' }), 0.1);
      expect(valuesAt('runtime-stalls', [late])).toEqual([near(6, 6)]);
      expect(valuesAt('runtime-stalls', abandoned('render', '+Inf', 0.1))).toEqual([near(6, 6)]);
    });
  });

  describe('telemetry-signed-out-surge', () => {
    it('T13: should fire on rate-limited signed-out entries without a recorded surge', () => {
      const limited = counter(
        api('tau_telemetry_ingest_entries_total', {
          disposition: 'rejected-rate-limit',
          tau_runtime_population: 'signed-out',
        }),
        during(inBurst, 100),
      );
      expect(valuesAt('telemetry-signed-out-surge', [limited])).toEqual([near(1500, 6)]);
    });

    it('T13: should leave an older release without the population label out, never counting it twice', () => {
      const entries = 'tau_telemetry_ingest_entries_total';
      const current = counter(
        api(entries, { disposition: 'recorded', tau_runtime_population: 'signed-out' }),
        during(inBurst, 50, 10),
        {
          step: 5 * minute,
        },
      );
      // The older release records the same disposition without tau_runtime_population.
      const older = counter(api(entries, { disposition: 'recorded' }, 'machine-old'), 400, { step: 5 * minute });
      expect(valuesAt('telemetry-signed-out-surge', [current, older])).toEqual(
        valuesAt('telemetry-signed-out-surge', [current]),
      );
    });
  });

  describe('telemetry-metric-overflow', () => {
    it('T13: should stay firing while the overflow series is exported and resolve once it leaves the 5-minute lookback', () => {
      const overflowFrom = start + 20 * minute;
      const restartAt = start + 2 * hour;
      const marker: Series = {
        labels: api('tau_runtime_kernel_usage_total', { otel_metric_overflow: 'true' }),
        samples: gauge({}, 3).samples.filter(([t]) => t >= overflowFrom && t < restartAt),
      };
      const transitions = simulate('telemetry-metric-overflow', [marker]);
      expect(transitions.map(({ at, to, reason }) => [at - start, to, reason])).toEqual([
        [20 * minute, 'Pending', undefined],
        [35 * minute, 'Alerting', undefined],
        [restartAt - start + 5 * minute - minute, 'Normal', 'NoData'],
      ]);
    });
  });

  describe('telemetry-ingest-redis-unavailable', () => {
    it('T13: should not fire on one isolated fail-open batch, only on a sustained outage', () => {
      // The rule asks for 10 minutes of fail-open admissions: one batch keeps increase() above zero for 9 evaluations.
      const once = counter(
        api('tau_telemetry_ingest_unavailable_total', { check: 'dedupe' }),
        during((t) => t === burstFrom, 1),
      );
      expect(results('telemetry-ingest-redis-unavailable', [once]).filter((result) => result.length > 0)).toHaveLength(
        9,
      );
      expect(simulate('telemetry-ingest-redis-unavailable', [once]).map(({ to }) => to)).toEqual(['Pending', 'Normal']);
    });

    it('T13: should not see the increment that creates a counter series, since increase() needs an earlier sample', () => {
      const fresh = counter(api('tau_telemetry_ingest_unavailable_total', { check: 'dedupe' }), during(inBurst, 0.2), {
        from: burstFrom,
        initial: 1,
      });
      const counted = valuesAt('telemetry-ingest-redis-unavailable', [fresh], burstFrom + 10 * minute);
      // Two increments in the first 10 minutes are visible; the creating one is not.
      expect(counted).toEqual([near(2, 6)]);
    });
  });

  describe('telemetry-runtime-absent', () => {
    const uid = 'telemetry-runtime-absent';
    const requests = 'http_server_request_duration_count';
    const traffic = (perMinute: number, route = '/v1/projects/{id}'): Series =>
      counter(api(requests, { http_route: route, http_response_status_code: '200' }), perMinute);
    const enabled = (value: number, options?: { from?: number; to?: number }): Series =>
      gauge(api('tau_telemetry_runtime_enabled'), value, options);
    const recorded = (perMinute: Rate): Series =>
      counter(api('tau_telemetry_ingest_entries_total', { disposition: 'recorded' }), perMinute);

    it('T13: should fire on a missing ingest series and on a flat one, with traffic and telemetry enabled', () => {
      expect(valuesAt(uid, [traffic(6), enabled(1)])).toEqual([near(0.1, 6)]);
      expect(valuesAt(uid, [traffic(6), enabled(1), recorded(0)])).toEqual([near(0.1, 6)]);
      expect(valuesAt(uid, [traffic(6), enabled(1), recorded(5)])).toEqual([]);
    });

    it('T13: should stay silent when telemetry is paused or self-hosted, or traffic is below its floor', () => {
      expect(valuesAt(uid, [traffic(6), enabled(0)])).toEqual([]);
      expect(valuesAt(uid, [traffic(6)])).toEqual([]);
      // 2 requests a minute is under 0.05/s, and ingest's own route is not product traffic.
      expect(valuesAt(uid, [traffic(2), enabled(1)])).toEqual([]);
      expect(valuesAt(uid, [traffic(600, '/v1/telemetry/ingest'), enabled(1)])).toEqual([]);
      // Another environment's ingest does not satisfy this one.
      const staging = recorded(5);
      expect(
        valuesAt(uid, [traffic(6), enabled(1), { ...staging, labels: { ...staging.labels, app: otherApp } }]),
      ).toEqual([near(0.1, 6)]);
    });

    it('T13: should fire 15 minutes after a full 30-minute window without recorded entries and resolve when they return', () => {
      const transitions = simulate(uid, [traffic(6), enabled(1), recorded(during((t) => !inBurst(t), 5))]);
      expect(transitions.map(({ at, to }) => [at - start, to])).toEqual([
        // The last increment lands at burstFrom - 1 min; the 30-minute window is flat from burstFrom + 29 min.
        [burstFrom - start + 29 * minute, 'Pending'],
        [burstFrom - start + 44 * minute, 'Alerting'],
        // The first new increment is exported at burstTo + 1 min.
        [burstTo - start + minute, 'Normal'],
      ]);
    });

    it('T13: should keep the rule armed for up to the 5-minute lookback after a paused release replaces an enabled one', () => {
      const deployAt = start + hour;
      const store = new SeriesStore([
        traffic(6),
        enabled(1, { to: deployAt - minute }),
        { ...enabled(0, { from: deployAt }), labels: api('tau_telemetry_runtime_enabled', {}, 'machine-2') },
      ]);
      const { expr } = ruleOf(uid);
      expect(store.query(expr, deployAt + 3 * minute)).toHaveLength(1);
      expect(store.query(expr, deployAt + 4 * minute)).toEqual([]);
    });
  });

  describe('telemetry-heartbeat', () => {
    it('T13: should fire at its first evaluation with no data and never resolve', () => {
      const rule = ruleOf('telemetry-heartbeat');
      expect(rule.isPaused).toBe(true);
      expect(simulateAlert(new SeriesStore([]), rule, { from: start, to: end, evaluationInterval })).toEqual([
        { at: start, instance: '[]', from: 'Normal', to: 'Alerting' },
      ]);
    });
  });
});

/** Panel queries with the dashboards' variables bound as hosted provisioning binds them (one app, the defaults). */
const panelQueries = (file: string, population = 'signed-in'): Array<Readonly<{ title: string; expr: string }>> => {
  type Panel = { title?: string; targets?: Array<{ expr?: string }>; panels?: Panel[] };
  const dashboard = JSON.parse(readFileSync(path.join(grafanaRoot, 'dashboards', file), 'utf8')) as { panels: Panel[] };
  const walk = (panels: readonly Panel[]): Array<{ title: string; expr: string }> =>
    panels.flatMap((panel) => [
      ...(panel.targets ?? [])
        .map(({ expr }) => expr ?? '')
        // LogQL panels read Loki, which the oracle does not model.
        .filter((expr) => expr.length > 0 && !expr.includes('| json'))
        .map((expr) => ({
          title: panel.title ?? '',
          expr: expr
            .replaceAll('$app', boundApp)
            .replaceAll('$service', 'tau-api')
            .replaceAll('$population', population)
            .replaceAll('$kernel', '.*')
            .replaceAll('$__range', '1d'),
        })),
      ...walk(panel.panels ?? []),
    ]);
  return walk(dashboard.panels);
};

const panel = (file: string, title: string, population?: string): string => {
  const found = panelQueries(file, population).filter((query) => query.title === title);
  expect(found, title).toHaveLength(1);
  return found[0]!.expr;
};

describe('Runtime dashboard panels evaluated on synthetic series (T13)', () => {
  const panels = [...panelQueries('runtime-operations.json'), ...panelQueries('runtime-product.json')];
  const everything = Object.values(scenarios).flatMap((scenario) => scenario.traffic(inBurst, 1));

  it('should parse and evaluate every runtime panel query without a matching error', () => {
    expect(panels.length).toBeGreaterThan(80);
    const store = new SeriesStore(everything);
    const failures = panels.flatMap(({ title, expr }) => {
      try {
        assertSupported(expr);
        store.query(expr, midBurst);
        return [];
      } catch (error) {
        return [`${title}: ${(error as Error).message}`];
      }
    });
    expect(failures).toEqual([]);
  });

  it('T13: should show the completed success rate and the implementation-failure rate on the same denominator', () => {
    const store = new SeriesStore(scenarios['runtime-implementation-failures']!.traffic(inBurst, 1));
    const success = store.query(panel('runtime-operations.json', 'Completed Success Rate'), midBurst);
    const failure = store.query(panel('runtime-operations.json', 'Implementation-Failure Rate'), midBurst);
    expect(success).toEqual([{ labels: {}, value: near(100 / 120, 9) }]);
    expect(failure).toEqual([{ labels: {}, value: near(20 / 120, 9) }]);
    // Zero traffic is 0/0: Grafana shows no value, not a 0 % or 100 % rate.
    const idle = new SeriesStore(scenarios['runtime-implementation-failures']!.traffic(always, 0));
    expect(idle.query(panel('runtime-operations.json', 'Completed Success Rate'), midBurst)).toEqual([
      { labels: {}, value: Number.NaN },
    ]);
  });

  it('T13: should hide an export format with fewer than 20 completed exports instead of showing 100 % failure', () => {
    const exports = (format: string, outcome: string, perMinute: number): Series =>
      counter(
        api('tau_runtime_exports_total', {
          tau_runtime_format: format,
          tau_runtime_outcome: outcome,
          tau_runtime_population: 'signed-in',
        }),
        perMinute,
      );
    const store = new SeriesStore([
      exports('step', 'succeeded', 0.03),
      exports('step', 'failed', 0.01),
      exports('stl', 'succeeded', 0.9),
      exports('stl', 'failed', 0.1),
    ]);
    expect(store.query(panel('runtime-product.json', 'Export Failure Rate by Format'), start + day)).toEqual([
      { labels: { tau_runtime_format: 'stl' }, value: near(0.1, 6) },
    ]);
  });

  it('T13: should divide heap samples by each kernel’s operations once, clamped to 1', () => {
    const heap = (kernel: string, source: string, perMinute: number): Series =>
      counter(
        api('tau_runtime_kernel_heap_count', {
          kernel_id: kernel,
          tau_runtime_heap_source: source,
          tau_runtime_failed: 'false',
          tau_runtime_population: 'signed-in',
        }),
        perMinute,
      );
    const ops = (kernel: string, perMinute: number): Series =>
      counter(
        api(operations, {
          kernel_id: kernel,
          tau_runtime_operation: 'render',
          tau_runtime_outcome: 'succeeded',
          tau_runtime_population: 'signed-in',
        }),
        perMinute,
      );
    const store = new SeriesStore([
      heap('replicad', 'wasm', 5),
      heap('replicad', 'js', 3),
      ops('replicad', 10),
      heap('openscad', 'wasm', 12),
      ops('openscad', 10),
    ]);
    const coverage = store.query(panel('runtime-product.json', 'Heap Coverage per Kernel'), start + day);
    expect(
      Object.fromEntries(
        coverage.map(({ labels, value }) => [`${labels['kernel_id']}/${labels['tau_runtime_heap_source']}`, value]),
      ),
    ).toEqual({
      'replicad/wasm': near(0.5, 6),
      'replicad/js': near(0.3, 6),
      'openscad/wasm': 1,
    });
  });

  it('T13: should count an older release without the population label once in the signed-out share', () => {
    const recordedOps = (labels: Readonly<Record<string, string>>, perMinute: number, instance = 'machine-1'): Series =>
      counter(
        api(operations, { tau_runtime_operation: 'render', tau_runtime_outcome: 'succeeded', ...labels }, instance),
        perMinute,
      );
    const store = new SeriesStore([
      recordedOps({ tau_runtime_population: 'signed-out' }, 1),
      recordedOps({ tau_runtime_population: 'signed-in' }, 3),
      recordedOps({}, 4, 'machine-old'),
    ]);
    // The older release counts once in the denominator (its missing label matches .*) and never as signed-out.
    expect(store.query(panel('runtime-product.json', 'Population Share (signed-out)'), start + day)).toEqual([
      { labels: {}, value: near(1 / 8, 6) },
    ]);
  });
});
