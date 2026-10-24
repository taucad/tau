/**
 * The runtime observation instruments (Runtime Observability package §1.2), created from `runtimeMetrics` in
 * `@taucad/telemetry` so names, units, descriptions and buckets cannot drift from the registry. Recorded only by the
 * ingest; the cardinality views for them live in `#telemetry/cardinality-views.js` (PR-0), not here.
 */
import { Injectable } from '@nestjs/common';
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

@Injectable()
export class RuntimeMetricsService {
  /* Client-reported runtime instruments share the `tau-client` meter with today's client instruments. */
  private readonly meter = metrics.getMeter('tau-client');
  private readonly counters = new Map<string, Counter>();
  private readonly histograms = new Map<string, Histogram>();
  private readonly gauges = new Map<string, ReadonlyArray<Readonly<{ value: number; attributes: Attributes }>>>();

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
    this.counters.get(key)?.add(value, attributes as Attributes);
  }

  /**
   * Record into a runtime histogram.
   *
   * @param key - The registry key.
   * @param value - The value, in the instrument's unit.
   * @param attributes - The closed attributes.
   */
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
}
