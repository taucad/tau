/* eslint-disable @typescript-eslint/naming-convention -- PascalCase constant objects */
import type { InstrumentType, MetricDefinition } from '#define-metric.js';
import { TauMetrics } from '#registry.js';

/**
 * Convert an OTEL metric name + instrument type to the name Tau's Prometheus exporter emits.
 *
 * Mirrors `@opentelemetry/exporter-prometheus`'s serializer, not the OTEL compatibility spec: invalid
 * characters (the dots) become `_`, repeated `_` collapse, and monotonic counters gain `_total`. The
 * exporter appends no unit suffix, so a histogram in seconds stays `<name>_bucket`, not `<name>_seconds_bucket`.
 *
 * @param name - The OTEL metric name (dot-delimited)
 * @param type - The OTEL instrument type
 * @returns The Prometheus metric name (histograms add `_bucket`, `_sum` and `_count` per series)
 * @public
 */
export const toPrometheusName = (name: string, type: InstrumentType): string => {
  const result = name.replaceAll(/[^\w:]/gu, '_').replaceAll(/_{2,}/gu, '_');
  return type === 'counter' && !result.endsWith('_total') ? `${result}_total` : result;
};

/**
 * Pre-computed Prometheus metric names for all TauMetrics entries.
 * @public
 */
export const PrometheusNames = Object.fromEntries(
  Object.entries(TauMetrics).map(([key, metric]) => [key, toPrometheusName(metric.name, metric.type)]),
) as { readonly [K in keyof typeof TauMetrics]: string };

/**
 * Get the Prometheus name for a metric definition.
 *
 * @param metric - The metric definition to convert
 * @returns The Prometheus-compatible metric name
 * @public
 */
export const prometheusNameOf = (metric: MetricDefinition): string => toPrometheusName(metric.name, metric.type);
