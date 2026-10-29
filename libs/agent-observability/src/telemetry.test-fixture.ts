import type { TelemetryAdapterFixture } from '@earendil-works/pi-telemetry/testing';
import type { PiTelemetry } from '#pi-telemetry.js';
import { ROOT_CONTEXT, trace, SpanStatusCode } from '@opentelemetry/api';
import type { Meter, SpanContext, Attributes, Context } from '@opentelemetry/api';
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { MeterProvider } from '@opentelemetry/sdk-metrics';
import type {
  RecordedTelemetrySpan,
  RecordedTelemetryMeasurement,
  TelemetryCarrier,
  SpanAttributes,
} from '@earendil-works/pi-telemetry';
import { createPiTelemetry } from '#pi-telemetry.js';
import type { TelemetryPolicy, TelemetryFields } from '#telemetry-policy.js';

const fields: TelemetryFields = {
  start: { kind: 'string', values: ['value'] },
  overwrite: { kind: 'string', values: ['start', 'middle', 'end'] },
  count: { kind: 'number' },
  index: { kind: 'number' },
  value: { kind: 'string', values: ['initial', 'late'] },
  reason: { kind: 'strings', values: ['initial'] },
};
const names = [
  'capabilities',
  'capabilities.child',
  'capabilities.extracted',
  'capabilities.inert',
  'measured',
  'target',
  'linked',
  'link-source',
  'sender',
  'receiver',
  'worker',
  'fallback-0',
  'fallback-1',
  'fallback-2',
  'success',
  'sync-error',
  'async-error',
  'undefined-error',
  'last-status',
  'explicit-before-throw',
  'explicit-before-rejection',
  'expected-failure',
  'recording',
  'settled',
  'parent',
  'first-child',
  'second-child',
  'late-child',
];
// Only these audited synthetic values enter the permissive conformance fixture; production defaults differ.
export const fixturePolicy: TelemetryPolicy = {
  spans: Object.fromEntries(names.map((name) => [name, fields])),
  events: { first: fields, second: fields, late: fields },
  links: { reason: { kind: 'strings', values: ['initial', 'late'] } },
  errors: Object.fromEntries([['Expected', ['async failure', 'returned failure', 'first']]]),
  metrics: {
    bytes: {
      kind: 'counter',
      fields: { direction: { kind: 'string', values: ['out'] } },
      description: 'Encoded bytes',
      unit: 'By',
    },
    active: { kind: 'upDownCounter', fields: {} },
    duration: {
      kind: 'histogram',
      fields: { method: { kind: 'string', values: ['read'] } },
      unit: 'ms',
      boundaries: [1, 10],
    },
    snapshot: {
      kind: 'histogram',
      fields: { tags: { kind: 'strings', values: ['original'] } },
      description: 'Original',
      boundaries: [1, 10],
    },
  },
};
const toPiAttributes = (attributes: Attributes | undefined): SpanAttributes => {
  const result: SpanAttributes = {};
  for (const [key, value] of Object.entries(attributes ?? {})) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      result[key] = value;
    } else if (Array.isArray(value)) {
      const items: readonly unknown[] = value;
      if (items.every((item): item is string => typeof item === 'string')) {
        result[key] = [...items];
      } else if (items.every((item): item is number => typeof item === 'number')) {
        result[key] = [...items];
      } else if (items.every((item): item is boolean => typeof item === 'boolean')) {
        result[key] = [...items];
      }
    }
  }
  return result;
};
const carrier = (context: SpanContext): TelemetryCarrier => ({
  traceparent: `00-${context.traceId}-${context.spanId}-${(context.traceFlags % 2).toString(16).padStart(2, '0')}`,
});

export const telemetryFixture = async (
  policy: TelemetryPolicy = fixturePolicy,
): Promise<
  TelemetryAdapterFixture & {
    adapter: PiTelemetry;
    exporter: InMemorySpanExporter;
    provider: BasicTracerProvider;
    metrics: NonNullable<TelemetryAdapterFixture['metrics']>;
    propagation: NonNullable<TelemetryAdapterFixture['propagation']>;
  }
> => {
  const exporter = new InMemorySpanExporter();
  const provider = new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] });
  const metricProvider = new MeterProvider();
  const real = metricProvider.getMeter('conformance');
  const measurements: RecordedTelemetryMeasurement[] = [];
  const capture = ({
    kind,
    name,
    options,
    value,
    attributes,
    context = ROOT_CONTEXT,
  }: {
    kind: RecordedTelemetryMeasurement['kind'];
    name: string;
    options: Parameters<Meter['createHistogram']>[1];
    value: number;
    attributes: RecordedTelemetryMeasurement['attributes'];
    context: Context | undefined;
  }): void => {
    const span = trace.getSpanContext(context);
    measurements.push({
      kind,
      name,
      ...(options?.description === undefined ? {} : { description: options.description }),
      ...(options?.unit === undefined ? {} : { unit: options.unit }),
      ...(options?.advice?.explicitBucketBoundaries === undefined
        ? {}
        : { boundaries: [...options.advice.explicitBucketBoundaries] }),
      value,
      attributes: structuredClone(attributes),
      context: span ? carrier(span) : null,
    });
  };
  const meter: Meter = {
    createCounter: (name, options) => {
      const instrument = real.createCounter(name, options);
      return {
        add: (value, attributes, context) => {
          capture({ kind: 'counter', name, options, value, attributes: toPiAttributes(attributes), context });
          instrument.add(value, attributes, context);
        },
      };
    },
    createUpDownCounter: (name, options) => {
      const instrument = real.createUpDownCounter(name, options);
      return {
        add: (value, attributes, context) => {
          capture({ kind: 'upDownCounter', name, options, value, attributes: toPiAttributes(attributes), context });
          instrument.add(value, attributes, context);
        },
      };
    },
    createHistogram: (name, options) => {
      const instrument = real.createHistogram(name, options);
      return {
        record: (value, attributes, context) => {
          capture({ kind: 'histogram', name, options, value, attributes: toPiAttributes(attributes), context });
          instrument.record(value, attributes, context);
        },
      };
    },
    createGauge: (name, options) => real.createGauge(name, options),
    createObservableCounter: (name, options) => real.createObservableCounter(name, options),
    createObservableGauge: (name, options) => real.createObservableGauge(name, options),
    createObservableUpDownCounter: (name, options) => real.createObservableUpDownCounter(name, options),
    addBatchObservableCallback: (callback, observables) => {
      real.addBatchObservableCallback(callback, observables);
    },
    removeBatchObservableCallback: (callback, observables) => {
      real.removeBatchObservableCallback(callback, observables);
    },
  };
  const adapter = createPiTelemetry({
    tracer: provider.getTracer('conformance'),
    meter,
    enabled: true,
    metricsEnabled: true,
    policy,
  });
  return {
    adapter,
    exporter,
    provider,
    context: adapter.context,
    metrics: adapter.context.metrics!,
    propagation: adapter.context.propagation!,
    getMetrics: async (): Promise<readonly RecordedTelemetryMeasurement[]> => measurements,
    getSpans: async (): Promise<readonly RecordedTelemetrySpan[]> => {
      const spans = exporter.getFinishedSpans();
      const ids = new Map(spans.map((span, index) => [span.spanContext().spanId, index + 1]));
      return spans.map((span, index) => ({
        id: ids.get(span.spanContext().spanId)!,
        parentId: span.parentSpanContext ? (ids.get(span.parentSpanContext.spanId) ?? null) : null,
        context: carrier(span.spanContext()),
        parentContext: span.parentSpanContext ? carrier(span.parentSpanContext) : null,
        links: span.links.map((link) => ({
          context: carrier(link.context),
          attributes: toPiAttributes(link.attributes),
        })),
        name: span.name,
        attributes: toPiAttributes(
          Object.fromEntries(Object.entries(span.attributes).filter(([key]) => key !== 'error.type')),
        ),
        events: span.events.map((event) => ({ name: event.name, attributes: toPiAttributes(event.attributes) })),
        status:
          span.status.code === SpanStatusCode.ERROR
            ? {
                status: 'error',
                ...(typeof span.attributes['error.type'] === 'string' && span.status.message !== undefined
                  ? { error: { name: span.attributes['error.type'], message: span.status.message } }
                  : {}),
              }
            : { status: 'ok' },
        settled: span.ended,
        endSequence: index + 1,
      }));
    },
    async [Symbol.asyncDispose](): Promise<void> {
      adapter.stop();
      await provider.shutdown();
      await metricProvider.shutdown();
    },
  };
};
