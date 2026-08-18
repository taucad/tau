import type { z } from 'zod';

/**
 * Supported OpenTelemetry instrument types.
 * @public
 */
export type InstrumentType = 'counter' | 'histogram' | 'gauge' | 'upDownCounter';

/**
 * A strongly-typed metric definition that can be used to create OTEL instruments.
 *
 * @template T - The instrument type discriminant
 * @template A - Zod raw shape for the attribute schema
 * @public
 */
export type MetricDefinition<T extends InstrumentType = InstrumentType, A extends z.ZodRawShape = z.ZodRawShape> = {
  readonly name: string;
  readonly type: T;
  readonly unit: string;
  readonly description: string;
  readonly buckets: T extends 'histogram' ? readonly number[] : undefined;
  readonly attributes: z.ZodObject<A>;
};

type BaseMetricOptions<A extends z.ZodRawShape> = {
  readonly name: string;
  readonly unit: string;
  readonly description: string;
  readonly attributes: z.ZodObject<A>;
};

type HistogramMetricOptions<A extends z.ZodRawShape> = BaseMetricOptions<A> & {
  readonly buckets: readonly number[];
};

/**
 * Define a counter metric (monotonically increasing sum).
 *
 * @param options - Counter metric configuration
 * @returns A counter metric definition
 * @public
 */
export const defineCounter = <A extends z.ZodRawShape>(
  options: BaseMetricOptions<A>,
): MetricDefinition<'counter', A> => ({
  ...options,
  type: 'counter',
  buckets: undefined,
});

/**
 * Define a histogram metric (distribution of values).
 *
 * @param options - Histogram metric configuration including bucket boundaries
 * @returns A histogram metric definition
 * @public
 */
export const defineHistogram = <A extends z.ZodRawShape>(
  options: HistogramMetricOptions<A>,
): MetricDefinition<'histogram', A> => ({
  ...options,
  type: 'histogram',
});

/**
 * Define a gauge metric (point-in-time value).
 *
 * @param options - Gauge metric configuration
 * @returns A gauge metric definition
 * @public
 */
export const defineGauge = <A extends z.ZodRawShape>(options: BaseMetricOptions<A>): MetricDefinition<'gauge', A> => ({
  ...options,
  type: 'gauge',
  buckets: undefined,
});

/**
 * Define an up-down counter metric (bidirectional sum).
 *
 * @param options - Up-down counter metric configuration
 * @returns An up-down counter metric definition
 * @public
 */
export const defineUpDownCounter = <A extends z.ZodRawShape>(
  options: BaseMetricOptions<A>,
): MetricDefinition<'upDownCounter', A> => ({
  ...options,
  type: 'upDownCounter',
  buckets: undefined,
});
