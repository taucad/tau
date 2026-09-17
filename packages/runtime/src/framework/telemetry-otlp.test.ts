import { describe, expect, it } from 'vitest';
import { toOtlpJson } from '#framework/telemetry-otlp.js';
import type { TelemetryBatch } from '#types/runtime-protocol.types.js';

const batch: TelemetryBatch = {
  origin: { label: 'kernel', instance: 'i-1' },
  epoch: 1_700_000_000_000,
  entries: [
    { name: 'kernel.render', startTime: 10, duration: 100, workerTimeOrigin: 5, detail: { spanId: '0' } },
    {
      name: 'kernel.parse',
      startTime: 20,
      duration: 30,
      workerTimeOrigin: 5,
      detail: { spanId: '1', parentSpanId: '0', entryPath: 'main.ts', triangles: 12, cached: true },
    },
  ],
};

type OtlpAttribute = { key: string; value: Record<string, unknown> };

type OtlpSpan = {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes: OtlpAttribute[];
};

type OtlpPayload = {
  resourceSpans: Array<{
    resource: { attributes: OtlpAttribute[] };
    scopeSpans: Array<{ spans: OtlpSpan[] }>;
  }>;
};

const convert = (input: TelemetryBatch): OtlpSpan[] => {
  const payload = JSON.parse(toOtlpJson(input)) as OtlpPayload;
  return payload.resourceSpans[0]!.scopeSpans[0]!.spans;
};

describe('OTLP conversion at the sink', () => {
  it('emits one OTLP payload whose spans share the trace of their root', () => {
    const payload = JSON.parse(toOtlpJson(batch)) as OtlpPayload;

    expect(payload.resourceSpans[0]?.resource.attributes).toEqual([
      { key: 'service.name', value: { stringValue: 'kernel' } },
      { key: 'service.instance.id', value: { stringValue: 'i-1' } },
    ]);

    const [root, child] = payload.resourceSpans[0]!.scopeSpans[0]!.spans;
    expect(payload.resourceSpans[0]!.scopeSpans[0]!.spans).toHaveLength(2);
    // A collector rejects a span whose ids are not 32/16 lowercase hex characters.
    expect(root?.traceId).toMatch(/^[\da-f]{32}$/u);
    expect(root?.spanId).toMatch(/^[\da-f]{16}$/u);
    expect(root?.parentSpanId).toBeUndefined();
    // The child hangs off the root by identity, and inherits the root's trace.
    expect(child?.traceId).toBe(root?.traceId);
    expect(child?.parentSpanId).toBe(root?.spanId);
    expect(child?.spanId).not.toBe(root?.spanId);

    // Absolute nanoseconds: `epoch + startTime`, never the realm-relative reading.
    expect(root?.startTimeUnixNano).toBe('1700000000010000000');
    expect(root?.endTimeUnixNano).toBe('1700000000110000000');
  });

  it('carries span detail as typed attributes and drops the identity keys', () => {
    expect(convert(batch)[1]?.attributes).toEqual([
      { key: 'entryPath', value: { stringValue: 'main.ts' } },
      { key: 'triangles', value: { doubleValue: 12 } },
      { key: 'cached', value: { boolValue: true } },
    ]);
  });

  it('gives an orphaned span its own trace rather than inventing a parent', () => {
    const [orphan] = convert({ ...batch, entries: [batch.entries[1]!] });

    expect(orphan?.parentSpanId).toBeUndefined();
    expect(orphan?.traceId).toMatch(/^[\da-f]{32}$/u);
  });
});
