import type { TauMetrics } from '@taucad/telemetry';
import type { z } from 'zod';
import type { StorageAccountingTask } from '#telemetry/metrics.js';

/** The gauges the storage accounting scheduler exports from its tasks' figures (W14 OB3). */
export const accountingGauges = [
  'storageUsageBytes',
  'storageUsageRepositories',
  'gitRepositorySizeDistribution',
  'gitRepositoryCeilingProximity',
  'storageQuotaOwners',
  'databaseConnections',
  'databaseConnectionBudget',
  'r2Requests',
  'r2StoredBytes',
  'r2Objects',
  'r2BandwidthBytes',
] as const;

export type AccountingGauge = (typeof accountingGauges)[number];

/** One value of one gauge, with the registry's own attribute schema, so a stray label fails to compile. */
export type AccountingObservation<Gauge extends AccountingGauge> = {
  readonly value: number;
  readonly attributes: z.infer<(typeof TauMetrics)[Gauge]['attributes']>;
};

/** What one task pass computed, gauge by gauge. A gauge a task does not own is absent. */
export type AccountingFigures = {
  readonly [Gauge in AccountingGauge]?: ReadonlyArray<AccountingObservation<Gauge>>;
};

/** One task's latest figures and when they were computed: what the lock holder shares with every Machine. */
export type AccountingSnapshot = {
  /** Epoch milliseconds the pass finished. */
  readonly computedAt: number;
  readonly figures: AccountingFigures;
};

/** One periodic task of the scheduler. */
export type AccountingTask = {
  readonly name: StorageAccountingTask;
  /** How old the shared figures may get before some Machine computes them again. */
  readonly intervalMilliseconds: number;
  /**
   * Computes the task's figures; `undefined` when configuration leaves the task off. The signal aborts
   * when the pass's deadline (shorter than its lock) passes or the API shuts down.
   */
  readonly run: ((signal: AbortSignal) => Promise<AccountingFigures>) | undefined;
};
