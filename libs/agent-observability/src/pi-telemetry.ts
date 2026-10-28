import { ROOT_CONTEXT, SpanStatusCode, trace, isSpanContextValid } from '@opentelemetry/api';
import type { Context, Meter, SpanContext, Tracer } from '@opentelemetry/api';
import type {
  TelemetryContext,
  TelemetrySpan,
  TelemetryMetrics,
  TelemetryPropagation,
  SpanOptions,
  SpanStatus,
  SpanLink,
} from '@earendil-works/pi-telemetry';
import { admittedAttributes, piTelemetryPolicy, telemetryLimits } from '#telemetry-policy.js';
import type { TelemetryPolicy } from '#telemetry-policy.js';

// Weak identities do not retain completed spans or application lifetimes.
const identities = new WeakMap<TelemetryContext, SpanContext>();
const carrierOf = (context: SpanContext): Record<string, string> => ({
  traceparent: `00-${context.traceId}-${context.spanId}-${(context.traceFlags % 2).toString(16).padStart(2, '0')}`,
});
const readCarrier = (carrier: Record<string, string> | undefined): SpanContext | undefined => {
  const value = carrier?.['traceparent'];
  if (typeof value !== 'string' || !/^00-[a-f0-9]{32}-[a-f0-9]{16}-0[01]$/u.test(value)) {
    return undefined;
  }
  const [, traceId, spanId, flags] = value.split('-');
  const context = { traceId: traceId!, spanId: spanId!, traceFlags: Number.parseInt(flags!, 16), isRemote: true };
  return isSpanContextValid(context) ? context : undefined;
};
/** Portable adapter handle. Stop only ends telemetry, never the observed application callback. @public */
export type PiTelemetry = Readonly<{
  context: TelemetryContext;
  stop(): void;
  stats(): Readonly<{ active: number; dropped: number; failures: number; expired: number }>;
}>;
/**
 * Bridge Pi's existing contract to explicit OTel contexts. No global provider or exporter is installed.
 * Supply trusted bounded SDK providers; permission is off unless enabled explicitly.
 * @param options - Destination policy, provider handles and permission resolved by host composition.
 * @returns A scoped adapter with inert late recording and synchronous stop.
 * @public
 */
export const createPiTelemetry = (
  options: Readonly<{
    tracer: Tracer;
    meter?: Meter;
    enabled?: boolean;
    metricsEnabled?: boolean;
    policy?: TelemetryPolicy;
  }>,
): PiTelemetry => {
  // Snapshot trusted policy so a later settings mutation cannot silently expand collection.
  const policy = structuredClone(options.policy ?? piTelemetryPolicy);
  const enabled = options.enabled === true;
  const metricsEnabled = options.metricsEnabled === true;
  const { tracer, meter } = options;
  let stopped = false;
  let dropped = 0;
  let failures = 0;
  let expired = 0;
  // eslint-disable-next-line tau-lint/no-handrolled-fanout -- Owned span disposal registry, not event subscriptions or pub/sub.
  const active = new Set<() => void>();
  const safe = <T>(operation: () => T): T | undefined => {
    try {
      return operation();
    } catch {
      failures++;
      return undefined;
    }
  };
  const instruments = new Map<string, ReturnType<Meter['createHistogram']> | ReturnType<Meter['createCounter']>>();
  const metrics: TelemetryMetrics = {
    counter: (name) => ({
      add: (value, attributes) => {
        recordMetric({ kind: 'counter', name, value, attributes });
      },
    }),
    upDownCounter: (name) => ({
      add: (value, attributes) => {
        recordMetric({ kind: 'upDownCounter', name, value, attributes });
      },
    }),
    histogram: (name) => ({
      record: (value, attributes, context) => {
        recordMetric({ kind: 'histogram', name, value, attributes, context });
      },
    }),
  };
  const recordMetric = ({
    kind,
    name,
    value,
    attributes,
    context,
  }: {
    kind: 'counter' | 'upDownCounter' | 'histogram';
    name: string;
    value: number;
    attributes?: Parameters<TelemetrySpan['setAttributes']>[0] | undefined;
    context?: TelemetryContext | undefined;
  }): void => {
    if (stopped || !metricsEnabled || !meter) {
      return;
    }
    safe(() => {
      const definition = Object.hasOwn(policy.metrics, name) ? policy.metrics[name] : undefined;
      if (!definition || definition.kind !== kind || !Number.isFinite(value) || (kind === 'counter' && value < 0)) {
        dropped++;
        return;
      }
      let instrument = instruments.get(name);
      if (!instrument) {
        if (instruments.size >= telemetryLimits.instruments) {
          dropped++;
          return;
        }
        const instrumentOptions = {
          ...(definition.description === undefined ? {} : { description: definition.description }),
          ...(definition.unit === undefined ? {} : { unit: definition.unit }),
          ...(definition.boundaries === undefined
            ? {}
            : { advice: { explicitBucketBoundaries: [...definition.boundaries] } }),
        };
        instrument =
          kind === 'histogram'
            ? meter.createHistogram(name, instrumentOptions)
            : kind === 'counter'
              ? meter.createCounter(name, instrumentOptions)
              : meter.createUpDownCounter(name, instrumentOptions);
        instruments.set(name, instrument);
      }
      const fields = admittedAttributes(attributes, definition.fields);
      const identity = context && identities.get(context);
      const parent = identity ? trace.setSpanContext(ROOT_CONTEXT, identity) : ROOT_CONTEXT;
      if ('record' in instrument) {
        instrument.record(value, fields, parent);
      } else {
        instrument.add(value, fields, parent);
      }
    });
  };
  const propagation: TelemetryPropagation = {
    inject: (context) => {
      const identity = identities.get(context);
      return identity ? carrierOf(identity) : undefined;
    },
    extract: (carrier) => {
      const identity = safe(() => readCarrier(carrier));
      if (!identity) {
        return root;
      }
      const context = makeContext(trace.setSpanContext(ROOT_CONTEXT, identity), 0, () => false);
      identities.set(context, identity);
      return context;
    },
  };
  const inert = (): TelemetrySpan => ({
    metrics,
    propagation,
    startSpan: async (_spanOptions, callback) => callback(inert()),
    addLink: () => undefined,
    addEvent: () => undefined,
    setAttributes: () => undefined,
    setStatus: () => undefined,
  });
  const makeContext = (parent: Context, depth: number, parentEnded: () => boolean): TelemetryContext => ({
    metrics,
    propagation,
    startSpan: async <T>(spanOptions: SpanOptions, callback: (span: TelemetrySpan) => T | Promise<T>): Promise<T> => {
      if (stopped || !enabled || parentEnded()) {
        return callback(inert());
      }
      const fields = safe(() =>
        Object.hasOwn(policy.spans, spanOptions.name) ? policy.spans[spanOptions.name] : undefined,
      );
      if (!fields || depth >= telemetryLimits.depth || active.size >= telemetryLimits.active) {
        dropped++;
        return callback(inert());
      }
      const linkOf = (link: SpanLink) => {
        const context = identities.get(link.context);
        return context ? { context, attributes: admittedAttributes(link.attributes, policy.links) } : undefined;
      };
      const recorded = safe(() =>
        tracer.startSpan(
          spanOptions.name,
          {
            attributes: admittedAttributes(spanOptions.attributes, fields),
            links: (spanOptions.links ?? []).slice(0, telemetryLimits.links).flatMap((link) => {
              const admitted = linkOf(link);
              return admitted ? [admitted] : [];
            }),
          },
          parent,
        ),
      );
      if (!recorded) {
        return callback(inert());
      }
      let settled = false;
      const explicit = { value: false };
      let status: SpanStatus = { status: 'ok' };
      let events = 0;
      let links = Math.min(spanOptions.links?.length ?? 0, telemetryLimits.links);
      // Each input is bounded by a fixed policy; union also stays within the attribute cap.
      const record = (operation: () => void): void => {
        if (!settled && !stopped) {
          safe(operation);
        }
      };
      const finish = (reason: 'settled' | 'expired' | 'stopped'): void => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        active.delete(finalize);
        if (reason !== 'settled') {
          safe(() => recorded.setAttribute('tau.telemetry.completeness', 'truncated'));
        }
        safe(() => {
          const allowed =
            status.status === 'error' &&
            status.error &&
            Object.hasOwn(policy.errors, status.error.name) &&
            policy.errors[status.error.name]?.includes(status.error.message);
          if (allowed && status.status === 'error' && status.error) {
            recorded.setAttributes({ 'error.type': status.error.name });
          }
          recorded.setStatus({
            code:
              reason === 'settled'
                ? status.status === 'error'
                  ? SpanStatusCode.ERROR
                  : SpanStatusCode.OK
                : SpanStatusCode.UNSET,
            ...(allowed && status.status === 'error' && status.error ? { message: status.error.message } : {}),
          });
        });
        safe(() => {
          recorded.end();
        });
      };
      const finalize = (): void => {
        finish('stopped');
      };
      const timer = setTimeout(() => {
        expired++;
        finish('expired');
      }, telemetryLimits.lifetime);
      active.add(finalize);
      const current = trace.setSpan(parent, recorded);
      const span: TelemetrySpan = {
        ...makeContext(current, depth + 1, () => settled),
        addLink: (link) => {
          record(() => {
            if (links >= telemetryLimits.links) {
              dropped++;
              return;
            }
            const admitted = linkOf(link);
            if (admitted) {
              links++;
              recorded.addLink(admitted);
            }
          });
        },
        addEvent: (name, attributes) => {
          record(() => {
            const eventFields = Object.hasOwn(policy.events, name) ? policy.events[name] : undefined;
            if (!eventFields || events >= telemetryLimits.events) {
              dropped++;
              return;
            }
            events++;
            recorded.addEvent(name, admittedAttributes(attributes, eventFields));
          });
        },
        setAttributes: (attributes) => {
          record(() => {
            recorded.setAttributes(admittedAttributes(attributes, fields));
          });
        },
        setStatus: (next) => {
          record(() => {
            explicit.value = true;
            // Retain only exact reviewed error strings, never arbitrary provider error text.
            status =
              next.status === 'error' &&
              next.error &&
              Object.hasOwn(policy.errors, next.error.name) &&
              policy.errors[next.error.name]?.includes(next.error.message)
                ? { status: 'error', error: { name: next.error.name, message: next.error.message } }
                : { status: next.status };
          });
        },
      };
      safe(() => identities.set(span, recorded.spanContext()));
      try {
        return await callback(span);
      } catch (error) {
        if (!explicit.value) {
          status = { status: 'error' };
        }
        throw error;
      } finally {
        finish('settled');
      }
    },
  });
  const root = makeContext(ROOT_CONTEXT, 0, () => false);
  return {
    context: root,
    stop: () => {
      stopped = true;
      for (const end of active) {
        end();
      }
      instruments.clear();
    },
    stats: () => ({ active: active.size, dropped, failures, expired }),
  };
};
