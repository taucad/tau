/**
 * The runtime observation instruments (Runtime Observability package §1.2), created from `runtimeMetrics` in
 * `@taucad/telemetry` so names, units, descriptions and buckets cannot drift from the registry. Recorded only by the
 * ingest; the cardinality views for them live in `#telemetry/cardinality-views.js` (PR-0), not here.
 */
import { Injectable } from '@nestjs/common';
import type { BeforeApplicationShutdown } from '@nestjs/common';
import { metrics } from '@opentelemetry/api';
import type { Attributes, Counter, Histogram } from '@opentelemetry/api';
import { runtimeMetrics } from '@taucad/telemetry';
import type { InstrumentType } from '@taucad/telemetry';
import type { z } from 'zod';

type RuntimeMetrics = typeof runtimeMetrics;
type RuntimeMetricKey = keyof RuntimeMetrics;
type KeysOf<T extends InstrumentType> = {
  [K in RuntimeMetricKey]: RuntimeMetrics[K]['type'] extends T ? K : never;
}[RuntimeMetricKey];

/** A runtime counter. */
export type RuntimeCounterKey = KeysOf<'counter'>;
/** A runtime histogram. */
export type RuntimeHistogramKey = KeysOf<'histogram'>;
/** A runtime gauge; observed from the last values set. */
export type RuntimeGaugeKey = KeysOf<'gauge'>;
/** The typed attributes of one runtime instrument. */
export type RuntimeAttributesOf<K extends RuntimeMetricKey> = z.output<RuntimeMetrics[K]['attributes']>;
/** One gauge observation. */
export type RuntimeGaugeObservation<K extends RuntimeGaugeKey> = Readonly<{
  value: number;
  attributes: RuntimeAttributesOf<K>;
}>;

/**
 * Milliseconds. How long a counter series this process has not exported yet stays at 0 before its first increment lands, in
 * milliseconds: two Fly scrape intervals (15 s), so at least one scrape reads the 0.
 *
 * Why: a restarted process starts every series from nothing. When a low-rate series climbs back to the value it had
 * before the restart (7, restart, 7), Prometheus sees no reset and `increase()` drops the whole increment. Exporting 0
 * first makes every restart a visible reset, so the first increment after it is counted (R07, 2026-11-15).
 */
export const runtimeCounterZeroHold = 30_000;

type PendingSeries = {
  pending: number;
  timer: ReturnType<typeof setTimeout> | undefined;
  onRelease?: () => void;
};

@Injectable()
export class RuntimeMetricsService implements BeforeApplicationShutdown {
  /* Client-reported runtime instruments share the `tau-client` meter with today's client instruments. */
  private readonly meter = metrics.getMeter('tau-client');
  private readonly counters = new Map<string, Counter>();
  private readonly histograms = new Map<string, Histogram>();
  private readonly gauges = new Map<string, ReadonlyArray<Readonly<{ value: number; attributes: Attributes }>>>();
  /* Counter series this process has started, by instrument and attributes; `pending` holds increments not yet added. */
  private readonly series = new Map<string, PendingSeries>();
  private readonly releasers = new Map<string, () => void>();
  private closing = false;

  public constructor() {
    for (const [key, definition] of Object.entries(runtimeMetrics)) {
      const options = { description: definition.description, unit: definition.unit };
      switch (definition.type) {
        case 'counter': {
          this.counters.set(key, this.meter.createCounter(definition.name, options));
          break;
        }
        case 'histogram': {
          this.histograms.set(
            key,
            this.meter.createHistogram(definition.name, {
              ...options,
              advice: { explicitBucketBoundaries: [...definition.buckets] },
            }),
          );
          break;
        }
        default: {
          this.meter.createObservableGauge(definition.name, options).addCallback((result) => {
            for (const observation of this.gauges.get(key) ?? []) {
              result.observe(observation.value, observation.attributes);
            }
          });
        }
      }
    }
  }

  /**
   * Add to a runtime counter.
   *
   * @param key - The registry key.
   * @param value - The increment.
   * @param attributes - The closed attributes.
   */
  public count<K extends RuntimeCounterKey>(key: K, value: number, attributes: RuntimeAttributesOf<K>): void {
    const counter = this.counters.get(key);
    if (counter === undefined) {
      return;
    }
    const seriesKey = `${key}\u0000${stableAttributes(attributes as Attributes)}`;
    const existing = this.series.get(seriesKey);
    const isLive = existing !== undefined && existing.timer === undefined;
    if (this.closing || isLive) {
      counter.add(value, attributes as Attributes);
      return;
    }
    if (existing !== undefined) {
      existing.pending += value;
      return;
    }
    counter.add(0, attributes as Attributes);
    const entry: PendingSeries = { pending: value, timer: undefined };
    entry.timer = setTimeout(() => {
      this.release(counter, entry, attributes as Attributes);
    }, runtimeCounterZeroHold);
    entry.timer.unref();
    this.series.set(seriesKey, entry);
    this.releasers.set(seriesKey, () => {
      this.release(counter, entry, attributes as Attributes);
    });
    entry.onRelease = () => this.releasers.delete(seriesKey);
  }

  /**
   * Add every held increment before shutdown, so the final scrape the observability module waits for reads them.
   */
  public beforeApplicationShutdown(): void {
    this.closing = true;
    this.releaseHeld();
  }

  /**
   * Add every increment still held behind a series' first 0 now. Each release deletes its own entry, which Map iteration allows.
   */
  public releaseHeld(): void {
    for (const release of this.releasers.values()) {
      release();
    }
    this.releasers.clear();
  }

  public record<K extends RuntimeHistogramKey>(key: K, value: number, attributes: RuntimeAttributesOf<K>): void {
    this.histograms.get(key)?.record(value, attributes as Attributes);
  }

  /**
   * Replace what a runtime gauge exports at the next collection.
   *
   * @param key - The registry key.
   * @param observations - The values with their attributes.
   */
  public setGauge<K extends RuntimeGaugeKey>(key: K, observations: ReadonlyArray<RuntimeGaugeObservation<K>>): void {
    this.gauges.set(
      key,
      observations.map((observation) => ({
        value: observation.value,
        attributes: observation.attributes as Attributes,
      })),
    );
  }

  private release(counter: Counter, entry: PendingSeries, attributes: Attributes): void {
    if (entry.timer === undefined) {
      return;
    }
    clearTimeout(entry.timer);
    entry.timer = undefined;
    if (entry.pending !== 0) {
      counter.add(entry.pending, attributes);
    }
    entry.pending = 0;
    entry.onRelease?.();
  }

  /**
   * Record into a runtime histogram.
   *
   * @param key - The registry key.
   * @param value - The value, in the instrument's unit.
   * @param attributes - The closed attributes.
   */
}

const stableAttributes = (attributes: Attributes): string =>
  JSON.stringify(
    Object.keys(attributes)
      .sort()
      .map((name) => [name, attributes[name]]),
  );
