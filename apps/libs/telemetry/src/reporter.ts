import type { z } from 'zod';
import type { MetricDefinition, InstrumentType } from '#define-metric.js';
import type { TauMetrics } from '#registry.js';

/**
 * Backend interface for recording OTEL metrics.
 * Each method corresponds to an instrument type.
 * @public
 */
export type TelemetryBackend = {
  recordCounter(name: string, value: number, attributes: Record<string, unknown>): void;
  recordHistogram(name: string, value: number, attributes: Record<string, unknown>): void;
  recordGauge(name: string, value: number, attributes: Record<string, unknown>): void;
  recordUpDownCounter(name: string, value: number, attributes: Record<string, unknown>): void;
};

type RecordFunction<Definition extends MetricDefinition> = (
  value: number,
  attributes: z.infer<Definition['attributes']>,
) => void;

/**
 * A type-safe reporter that delegates to the correct backend method
 * based on each metric's instrument type.
 * @public
 */
export type TelemetryReporter = {
  readonly [K in keyof typeof TauMetrics]: RecordFunction<(typeof TauMetrics)[K]>;
};

const backendMethodMap: Record<InstrumentType, keyof TelemetryBackend> = {
  counter: 'recordCounter',
  histogram: 'recordHistogram',
  gauge: 'recordGauge',
  upDownCounter: 'recordUpDownCounter',
};

/**
 * Create a type-safe telemetry reporter from a backend and the metric registry.
 *
 * @param backend - The backend that actually records metrics
 * @param registry - The metric registry (defaults to TauMetrics)
 * @returns A reporter with one method per registry key
 * @public
 */
export const createReporter = (
  backend: TelemetryBackend,
  registry: Record<string, MetricDefinition>,
): Record<string, (value: number, attributes: Record<string, unknown>) => void> => {
  const reporter: Record<string, (value: number, attributes: Record<string, unknown>) => void> = {};

  for (const [key, metric] of Object.entries(registry)) {
    const method = backendMethodMap[metric.type];
    reporter[key] = (value, attributes) => {
      backend[method](metric.name, value, attributes);
    };
  }

  return reporter;
};
