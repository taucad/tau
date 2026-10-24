import { metrics } from '@opentelemetry/api';
import type { Meter } from '@opentelemetry/api';
import { TauMetrics } from '@taucad/telemetry';
import type { MetricDefinition } from '@taucad/telemetry';
import type { MirrorFailureReason, MirrorFailureStage } from '#api/git/mirror/failure.js';

/**
 * The `tau.mirror.*` instruments (W13 Finding 8, W14 OB6), emitted by the
 * long-running `tau-mirror` process and scraped through its `[[metrics]]` port.
 * Every series carries `destination` and nothing that names an owner or project.
 */

export type MirrorObjectKind = 'pack' | 'idx' | 'manifest' | 'segment' | 'retired_marker' | 'lfs' | 'owner_marker';
export type MirrorRoundOutcome = 'copied' | 'noop' | 'failed' | 'tombstoned';

const counter = (meter: Meter, metric: MetricDefinition<'counter'>) =>
  meter.createCounter(metric.name, {
    description: metric.description,
    unit: metric.unit,
  });

const gauge = (meter: Meter, metric: MetricDefinition<'gauge'>) =>
  meter.createGauge(metric.name, {
    description: metric.description,
    unit: metric.unit,
  });

/** The copier's instruments, created once per process on the `tau-mirror` meter. */
export class MirrorMetrics {
  private readonly meter: Meter;

  private readonly rounds;
  private readonly objectsCopied;
  private readonly bytesCopied;
  private readonly copyFailures;
  private readonly retentionExtensions;
  private readonly copyDelay;
  private readonly copyLag;
  private readonly copyLagGenerations;
  private readonly backlogRepositories;
  private readonly lfsBacklogObjects;
  private readonly retentionMinRemaining;
  private readonly retentionMaxAhead;
  private readonly destinationUp;
  private readonly reconcileLastSuccess;
  private readonly reconcileMissingObjects;
  private readonly reconcileHiddenVersions;
  private readonly destinationStoredBytes;
  private readonly destinationObjectVersions;

  /** The `destination` label: B2 is the only second copy (W13 B1). */
  private get destination(): 'b2' {
    return 'b2';
  }

  public constructor(meter: Meter = metrics.getMeter('tau-mirror')) {
    this.meter = meter;
    this.rounds = counter(this.meter, TauMetrics.mirrorRounds);
    this.objectsCopied = counter(this.meter, TauMetrics.mirrorObjectsCopied);
    this.bytesCopied = counter(this.meter, TauMetrics.mirrorBytesCopied);
    this.copyFailures = counter(this.meter, TauMetrics.mirrorCopyFailures);
    this.retentionExtensions = counter(this.meter, TauMetrics.mirrorRetentionExtensions);
    this.copyDelay = this.meter.createHistogram(TauMetrics.mirrorCopyDelay.name, {
      description: TauMetrics.mirrorCopyDelay.description,
      unit: TauMetrics.mirrorCopyDelay.unit,
      advice: {
        explicitBucketBoundaries: [...TauMetrics.mirrorCopyDelay.buckets],
      },
    });
    this.copyLag = gauge(this.meter, TauMetrics.mirrorCopyLag);
    this.copyLagGenerations = gauge(this.meter, TauMetrics.mirrorCopyLagGenerations);
    this.backlogRepositories = gauge(this.meter, TauMetrics.mirrorBacklogRepositories);
    this.lfsBacklogObjects = gauge(this.meter, TauMetrics.mirrorLfsBacklogObjects);
    this.retentionMinRemaining = gauge(this.meter, TauMetrics.mirrorRetentionMinRemaining);
    this.retentionMaxAhead = gauge(this.meter, TauMetrics.mirrorRetentionMaxAhead);
    this.destinationUp = gauge(this.meter, TauMetrics.mirrorDestinationUp);
    this.reconcileLastSuccess = gauge(this.meter, TauMetrics.mirrorReconcileLastSuccess);
    this.reconcileMissingObjects = gauge(this.meter, TauMetrics.mirrorReconcileMissingObjects);
    this.reconcileHiddenVersions = gauge(this.meter, TauMetrics.mirrorReconcileHiddenVersions);
    this.destinationStoredBytes = gauge(this.meter, TauMetrics.mirrorDestinationStoredBytes);
    this.destinationObjectVersions = gauge(this.meter, TauMetrics.mirrorDestinationObjectVersions);
  }

  public round(outcome: MirrorRoundOutcome): void {
    this.rounds.add(1, { destination: this.destination, outcome });
  }

  public copied(kind: MirrorObjectKind, bytes: number): void {
    this.objectsCopied.add(1, { destination: this.destination, kind });
    this.bytesCopied.add(bytes, { destination: this.destination, kind });
  }

  public failure(stage: MirrorFailureStage, reason: MirrorFailureReason): void {
    this.copyFailures.add(1, { destination: this.destination, stage, reason });
  }

  public extension(outcome: 'extended' | 'failed', count = 1): void {
    if (count > 0) {
      this.retentionExtensions.add(count, {
        destination: this.destination,
        outcome,
      });
    }
  }

  public delay(seconds: number): void {
    this.copyDelay.record(Math.max(0, seconds), {
      destination: this.destination,
    });
  }

  /** The lag, backlog and lock-headroom gauges, from one Postgres reading. */
  public backlog(reading: {
    lagSeconds: number;
    lagGenerations: number;
    steady: number;
    backfill: number;
    lfsBacklog: number;
    lockHeadroomSeconds: number | undefined;
  }): void {
    const { destination } = this;
    this.copyLag.record(reading.lagSeconds, { destination });
    this.copyLagGenerations.record(reading.lagGenerations, { destination });
    this.backlogRepositories.record(reading.steady, {
      destination,
      phase: 'steady',
    });
    this.backlogRepositories.record(reading.backfill, {
      destination,
      phase: 'backfill',
    });
    this.lfsBacklogObjects.record(reading.lfsBacklog, { destination });
    if (reading.lockHeadroomSeconds !== undefined) {
      this.retentionMinRemaining.record(reading.lockHeadroomSeconds, {
        destination,
      });
    }
  }

  public up(reachable: boolean): void {
    this.destinationUp.record(reachable ? 1 : 0, {
      destination: this.destination,
    });
  }

  /** What one reconcile saw. Bytes and versions are only exact after a full one. */
  public reconciled(
    scope: 'active' | 'full',
    seen: {
      at: Date;
      missing: Readonly<Partial<Record<MirrorObjectKind, number>>>;
      hidden: number;
      maxAheadSeconds: number | undefined;
      storedBytes?: number;
      objectVersions?: number;
    },
  ): void {
    const { destination } = this;
    for (const kind of ['pack', 'idx', 'manifest', 'segment', 'retired_marker', 'lfs'] as const) {
      this.reconcileMissingObjects.record(seen.missing[kind] ?? 0, {
        destination,
        kind,
      });
    }
    this.reconcileHiddenVersions.record(seen.hidden, { destination });
    if (seen.maxAheadSeconds !== undefined) {
      this.retentionMaxAhead.record(seen.maxAheadSeconds, { destination });
    }
    if (seen.storedBytes !== undefined) {
      this.destinationStoredBytes.record(seen.storedBytes, { destination });
    }
    if (seen.objectVersions !== undefined) {
      this.destinationObjectVersions.record(seen.objectVersions, {
        destination,
      });
    }
    this.reconcileLastSuccess.record(Math.floor(seen.at.getTime() / 1000), {
      destination,
      scope,
    });
  }
}
