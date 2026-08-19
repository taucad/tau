/* eslint-disable @typescript-eslint/naming-convention -- PascalCase constant objects */
import type { InstrumentType, MetricDefinition } from '#define-metric.js';
import { TauMetrics } from '#registry.js';

/**
 * Convert an OTEL metric name + instrument type + unit to its Prometheus-compatible name.
 *
 * Follows the OTEL-to-Prometheus mapping specification.
 *
 * @param name - The OTEL metric name (dot-delimited)
 * @param type - The OTEL instrument type
 * @param unit - The OTEL unit string (UCUM format)
 * @returns The Prometheus-compatible metric name
 * @public
 * @see https://github.com/open-telemetry/opentelemetry-specification/blob/main/specification/compatibility/prometheus_and_openmetrics.md
 */
export const toPrometheusName = (name: string, type: InstrumentType, unit: string): string => {
  let result = name.replaceAll('.', '_');

  const normalizedUnit = normalizeUnit(unit);
  if (normalizedUnit && !result.endsWith(`_${normalizedUnit}`)) {
    result = `${result}_${normalizedUnit}`;
  }

  if (type === 'counter') {
    result = `${result}_total`;
  }

  return result;
};

const normalizeUnit = (unit: string): string => {
  if (!unit || unit.startsWith('{')) {
    return '';
  }

  const unitMap: Record<string, string> = {
    s: 'seconds',
    ms: 'milliseconds',
    By: 'bytes',
    '1': 'ratio',
  };

  return unitMap[unit] ?? unit;
};

/**
 * Pre-computed Prometheus metric names for all TauMetrics entries.
 * @public
 */
export const PrometheusNames = Object.fromEntries(
  Object.entries(TauMetrics).map(([key, metric]) => [key, toPrometheusName(metric.name, metric.type, metric.unit)]),
) as { readonly [K in keyof typeof TauMetrics]: string };

/**
 * Get the Prometheus name for a metric definition.
 *
 * @param metric - The metric definition to convert
 * @returns The Prometheus-compatible metric name
 * @public
 */
export const prometheusNameOf = (metric: MetricDefinition): string =>
  toPrometheusName(metric.name, metric.type, metric.unit);
