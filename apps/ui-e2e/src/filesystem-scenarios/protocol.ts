/**
 * Messages between the scenario page and its authority workers.
 *
 * @module
 */
import type { WorkerTimingSummary } from '@taucad/filesystem';
import type { ScenarioCounts } from '#filesystem-scenarios/counters.js';

/** One OPFS project directory a worker serves. */
export type ScenarioProject = Readonly<{ projectId: string; providerBasePath: string }>;

/** The fixture a worker plans from; both sides derive the same plan. */
export type ScenarioFixture = Readonly<{ seed: number; scale: number }>;

/** What a runner measured inside the worker. */
export type WorkerMeasurement = Readonly<{
  /** The scenario's clock, start to durable. */
  duration: number;
  counts: ScenarioCounts;
  /** Bus events delivered to one subscriber (the worker's own port). */
  busEvents: number;
  /** The production #1410 spans and counters over the same window. */
  spans: WorkerTimingSummary;
  /**
   * Exact production counter movement over the window. The summary above is
   * bucketed by the second, so it can include a neighbouring run's counts;
   * this is the difference of two cumulative readings from the worker's start.
   */
  productionCounters: Readonly<Record<string, number>>;
  /** Runner-specific figures (other clocks, per-phase counts). */
  extra: Readonly<Record<string, number>>;
}>;

/** A command the page sends. */
export type WorkerCommand =
  | Readonly<{ type: 'open'; fixture: ScenarioFixture; projects: readonly ScenarioProject[] }>
  | Readonly<{ type: 'run'; runner: RunnerName; projectId: string; parameters?: Readonly<Record<string, number>> }>
  | Readonly<{ type: 'probe-start'; projectId: string; readInterval: number }>
  | Readonly<{ type: 'probe-stop' }>;

/** The runners a worker implements. */
export type RunnerName =
  | 'materialize'
  | 'materialize-with-save'
  | 'warm-open'
  | 'index-open'
  | 'index-write'
  | 'external-edit'
  | 'index-snapshot'
  | 'import'
  | 'save'
  | 'agent-write'
  | 'grep-glob'
  | 'grep-with-save-and-reads'
  | 'stat-probes'
  | 'replace-seed'
  | 'replace-killable'
  | 'replace-recover';

/** The figures a second authority's read probe gathered. */
export type ProbeReport = Readonly<{
  reads: number;
  latencies: readonly number[];
  /** Cross-tab invalidations this authority received while probing. */
  invalidationsReceived: number;
  busEvents: number;
}>;

/** A request envelope. */
export type WorkerRequest = Readonly<{ id: number; command: WorkerCommand }>;

/** A response envelope. */
export type WorkerResponse =
  | Readonly<{ id: number; ok: true; value: unknown }>
  | Readonly<{ id: number; ok: false; error: string }>;

/** The posted once a worker can take commands. */
export const scenarioWorkerReady = 'filesystem-scenario-worker-ready';

/** Posted by `replace-killable` once its apply has completed the operations it was asked to reach. */
export const scenarioCrashPoint = 'filesystem-scenario-crash-point';
