/**
 * OTLP JSON at the sink (D8).
 *
 * Tau's spans are `RuntimeTracer`'s own shape, and no OpenTelemetry SDK runs in
 * any Tau process — the charter forbids one on a hot path. An external
 * collector still has to be able to read a trace, so the translation happens
 * where the bytes are already leaving: one OTLP JSON payload per flushed batch,
 * one line each, which is exactly what the collector's `otlpjsonfile` receiver
 * reads. Nothing on the render path calls this; the sink does, after the
 * dispatcher has returned.
 */

import type { TelemetryBatch, TelemetryEntry } from '#types/runtime-protocol.types.js';

/** Keys that describe a span's place in the tree rather than its work. */
const identityKeys = new Set(['spanId', 'parentSpanId', 'devtools']);

/**
 * A 64-bit multiplicative hash of a string, as sixteen hex characters.
 *
 * Span ids restart at 0 in every realm, so the wire id means nothing to a
 * collector; the hash of `instance:spanId` is stable, collision-free in
 * practice at this cardinality, and needs no dependency. It is FNV's constants
 * with addition where FNV mixes with xor, because bitwise operators are banned
 * here and identity, not avalanche, is what this has to deliver.
 *
 * @param value - The identity to hash.
 * @returns Sixteen lowercase hex characters.
 */
const hex64 = (value: string): string => {
  let hash = 14_695_981_039_346_656_037n;
  for (const character of value) {
    hash = BigInt.asUintN(64, (hash + BigInt(character.codePointAt(0) ?? 0)) * 1_099_511_628_211n);
  }
  return hash.toString(16).padStart(16, '0');
};

const attributeValue = (value: unknown): Record<string, unknown> | undefined => {
  if (typeof value === 'string') {
    return { stringValue: value };
  }
  if (typeof value === 'number') {
    return { doubleValue: value };
  }
  if (typeof value === 'boolean') {
    return { boolValue: value };
  }
  return undefined;
};

const spanKey = (entry: TelemetryEntry): string | undefined => {
  const spanId = entry.detail?.['spanId'];
  return typeof spanId === 'string' ? spanId : undefined;
};

const parentKey = (entry: TelemetryEntry): string | undefined => {
  const parentSpanId = entry.detail?.['parentSpanId'];
  return typeof parentSpanId === 'string' ? parentSpanId : undefined;
};

/**
 * Convert one flushed batch into an OTLP JSON payload.
 *
 * @param batch - The spans as the tracer flushed them, with the producer identity and clock anchor.
 * @returns One line of OTLP JSON: `resourceSpans` for this producer, no trailing newline.
 */
export function toOtlpJson(batch: TelemetryBatch): string {
  const identity = (key: string): string => hex64(`${batch.origin.instance}:${key}`);
  const present = new Map(
    batch.entries.flatMap((entry) => {
      const key = spanKey(entry);
      return key === undefined ? [] : [[key, entry] as const];
    }),
  );

  /* A trace is named by its root. A span whose parent did not come in this batch is treated as a
   * root: the alternative is emitting a traceId the collector can never join to anything. */
  const traceOf = (entry: TelemetryEntry): string => {
    let current = entry;
    const seen = new Set<string>();
    for (let parent = parentKey(current); parent !== undefined; parent = parentKey(current)) {
      const next = present.get(parent);
      if (next === undefined || seen.has(parent)) {
        break;
      }
      seen.add(parent);
      current = next;
    }
    const root = spanKey(current) ?? `${current.name}:${String(current.startTime)}`;
    return `${identity(root)}${identity(`trace:${root}`)}`;
  };

  /* Nanoseconds past 2001 exceed `Number.MAX_SAFE_INTEGER`, so the whole and fractional
   * milliseconds are widened separately — multiplying first loses the last four digits. */
  const nanoseconds = (milliseconds: number): string => {
    const absolute = batch.epoch + milliseconds;
    const whole = Math.trunc(absolute);
    return String(BigInt(whole) * 1_000_000n + BigInt(Math.round((absolute - whole) * 1e6)));
  };

  const spans = batch.entries.map((entry) => {
    const parent = parentKey(entry);
    return {
      traceId: traceOf(entry),
      spanId: identity(spanKey(entry) ?? `${entry.name}:${String(entry.startTime)}`),
      ...(parent !== undefined && present.has(parent) ? { parentSpanId: identity(parent) } : {}),
      name: entry.name,
      kind: 1,
      startTimeUnixNano: nanoseconds(entry.startTime),
      endTimeUnixNano: nanoseconds(entry.startTime + entry.duration),
      attributes: Object.entries(entry.detail ?? {}).flatMap(([key, value]) => {
        const converted = identityKeys.has(key) ? undefined : attributeValue(value);
        return converted === undefined ? [] : [{ key, value: converted }];
      }),
    };
  });

  return JSON.stringify({
    resourceSpans: [
      {
        resource: {
          attributes: [
            { key: 'service.name', value: { stringValue: batch.origin.label } },
            { key: 'service.instance.id', value: { stringValue: batch.origin.instance } },
          ],
        },
        scopeSpans: [{ scope: { name: 'tau.runtime' }, spans }],
      },
    ],
  });
}
