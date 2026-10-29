import type { SpanAttributes } from '@earendil-works/pi-telemetry';
import type { Attributes, AttributeValue } from '@opentelemetry/api';

/** Static classification of a native field. String values require a reviewed vocabulary. @public */
export type TelemetryField = Readonly<{
  kind: 'number' | 'boolean' | 'string' | 'strings' | 'numbers' | 'booleans';
  values?: readonly string[];
}>;
/** Reviewed fields for an exact signal name; wildcards are deliberately unsupported. @public */
export type TelemetryFields = Readonly<Record<string, TelemetryField>>;
/** Static policy is supplied by trusted composition, never by a client envelope. @public */
export type TelemetryPolicy = Readonly<{
  spans: Readonly<Record<string, TelemetryFields>>;
  events: Readonly<Record<string, TelemetryFields>>;
  links: TelemetryFields;
  metrics: Readonly<
    Record<
      string,
      Readonly<{
        kind: 'counter' | 'upDownCounter' | 'histogram';
        fields: TelemetryFields;
        description?: string;
        unit?: string;
        boundaries?: readonly number[];
      }>
    >
  >;
  errors: Readonly<Record<string, readonly string[]>>;
}>;
/** Bounded native recording defaults, independently tested at and beyond limits. @public */
export const telemetryLimits = Object.freeze({
  active: 128,
  depth: 16,
  attributes: 32,
  events: 64,
  links: 16,
  array: 16,
  string: 128,
  instruments: 32,
  lifetime: 60_000,
});
const admittedValue = (value: unknown, rule: TelemetryField): AttributeValue | undefined => {
  if (rule.kind === 'number' && typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (rule.kind === 'boolean' && typeof value === 'boolean') {
    return value;
  }
  if (
    (rule.kind === 'string' || rule.kind === 'strings') &&
    typeof value === 'string' &&
    value.length <= telemetryLimits.string &&
    rule.values?.includes(value)
  ) {
    return value;
  }
  if (!Array.isArray(value) || value.length > telemetryLimits.array) {
    return undefined;
  }
  const items: readonly unknown[] = value;
  if (
    rule.kind === 'strings' &&
    items.every(
      (item): item is string =>
        typeof item === 'string' && item.length <= telemetryLimits.string && rule.values?.includes(item) === true,
    )
  ) {
    return [...items];
  }
  if (
    rule.kind === 'numbers' &&
    items.every((item): item is number => typeof item === 'number' && Number.isFinite(item))
  ) {
    return [...items];
  }
  if (rule.kind === 'booleans' && items.every((item): item is boolean => typeof item === 'boolean')) {
    return [...items];
  }
  return undefined;
};
/** Copy classified fields without traversing arbitrary supplied keys or nested values. @public */
export const admittedAttributes = (input: SpanAttributes | undefined, fields: TelemetryFields): Attributes => {
  const result: Attributes = {};
  for (const [key, rule] of Object.entries(fields).slice(0, telemetryLimits.attributes)) {
    const value = admittedValue(input?.[key], rule);
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
};

const number: TelemetryField = { kind: 'number' };
const stop: TelemetryField = {
  kind: 'string',
  values: ['pending', 'stop', 'length', 'toolUse', 'error', 'aborted', 'deferred'],
};
const modelFields = {
  stop,
  'usage.input': number,
  'usage.output': number,
  'usage.cache_read': number,
  'usage.cache_write': number,
  'cost.total': number,
} satisfies TelemetryFields;
/** Metadata-only native policy. Model/provider/tool names and errors are intentionally absent. @public */
export const piTelemetryPolicy: TelemetryPolicy = {
  spans: { 'pi.ai.request': modelFields, 'pi.ai.poll': modelFields },
  events: {
    'pi.ai.first_chunk': {},
    'pi.ai.block': {
      type: { kind: 'string', values: ['text', 'thinking', 'tool_call'] },
      index: number,
      chars: number,
    },
  },
  links: {},
  errors: {},
  metrics: {
    'pi.ai.request.duration': {
      kind: 'histogram',
      fields: { stop },
      unit: 'ms',
      description: 'Logical request or poll duration.',
    },
    'pi.ai.first_chunk.duration': {
      kind: 'histogram',
      fields: {},
      unit: 'ms',
      description: 'Time to the first normalized stream event.',
    },
    'pi.ai.tokens': {
      kind: 'counter',
      fields: { kind: { kind: 'string', values: ['input', 'output', 'cache_read', 'cache_write'] } },
      unit: 'token',
      description: 'Reported model token usage; pending and deferred polls are excluded.',
    },
    'pi.ai.cost': {
      kind: 'counter',
      fields: {},
      unit: 'USD',
      description: 'Reported model cost; pending and deferred polls are excluded.',
    },
  },
};
