/**
 * Runtime guard for the v5 {@link RuntimeProtocol} message inventory
 * (R20). The two arrays exported alongside the protocol type are the
 * single source of truth for the inventory at runtime — every consumer
 * (dispatcher, worker client, conformance harness, docs generators)
 * enumerates them rather than re-listing the names locally.
 *
 * The matching type-level guards live in
 * {@link ./runtime-protocol-types-derive-from-schemas.test-d.ts} (the
 * legacy `runtime-protocol.test-d.ts` is deleted — see
 * `runtime-protocol-deletion.test.ts`). Both files together fail closed
 * if any name is added/removed without updating both surfaces.
 */
import { describe, it, expect } from 'vitest';
import type { RpcProtocol } from '@taucad/rpc';
import {
  runtimeProtocolCallNames,
  runtimeProtocolClientNotifyNames,
  runtimeProtocolWorkerNotifyNames,
  runtimeProtocolNotifyNames,
  runtimeProtocolListenNames,
} from '#types/runtime-protocol.types.js';
import type { RuntimeProtocol } from '#types/runtime-protocol.types.js';
import {
  runtimeAbortArgsSchema,
  runtimeEvaluateModelArgsSchema,
  runtimeProtocolSchemas,
  runtimeStateChangedArgsSchema,
} from '#types/runtime-protocol.schemas.js';

describe('RuntimeProtocol — runtime inventory guard (R20)', () => {
  it('should expose exactly nine acknowledged calls', () => {
    expect([...runtimeProtocolCallNames]).toEqual([
      'initialize',
      'export',
      'exportModel',
      'evaluateModel',
      'snapshotSource',
      'readSceneSnapshot',
      'listSceneBookmarks',
      'transcode',
      'cleanup',
    ]);
  });

  it('exposes the bounded progressive-scene listen', () => {
    expect([...runtimeProtocolListenNames]).toEqual(['sceneUpdates']);
  });

  it('exposes exactly 7 client → worker notify commands (T18)', () => {
    expect([...runtimeProtocolClientNotifyNames]).toEqual([
      'openFile',
      'stage-and-render',
      'updateParameters',
      'setOptions',
      'abort',
      'binaryMaterialised',
      'kernelCommand',
    ]);
  });

  it('exposes exactly 11 worker → client autonomous event notifies', () => {
    expect([...runtimeProtocolWorkerNotifyNames]).toEqual([
      'parametersResolved',
      'geometryComputed',
      'errorEvent',
      'progress',
      'activeKernelChanged',
      'stateChanged',
      'log',
      'logBatch',
      'telemetry',
      'capabilitiesUpdated',
      'kernelEvent',
    ]);
  });

  it('exposes exactly 18 notify keys (7 client commands + 11 worker events)', () => {
    expect(runtimeProtocolNotifyNames).toHaveLength(18);
    expect(runtimeProtocolNotifyNames).toHaveLength(
      runtimeProtocolClientNotifyNames.length + runtimeProtocolWorkerNotifyNames.length,
    );
  });

  it('contains no duplicate notify names', () => {
    expect(new Set(runtimeProtocolNotifyNames).size).toBe(runtimeProtocolNotifyNames.length);
  });

  it('compiles RuntimeProtocol against RpcProtocol (any drift fails compile)', () => {
    type RuntimeProtocolExtendsRpcProtocol = RuntimeProtocol extends RpcProtocol ? true : false;
    const guard: RuntimeProtocolExtendsRpcProtocol = true;
    expect(guard).toBe(true);
  });
});

describe('RuntimeProtocol — targeted timeout wire validation', () => {
  const renderId = '550e8400-e29b-41d4-a716-446655440000';

  it.each([
    ['the internal none reason', { renderId, reason: 0 }],
    ['a missing render identity', { reason: 2 }],
    ['a malformed render identity', { renderId: 'not-a-uuid', reason: 2 }],
    ['a redundant captured generation', { renderId, abortGeneration: 7, reason: 2 }],
  ])('rejects %s', (_label, payload) => {
    expect(runtimeAbortArgsSchema.safeParse(payload).success).toBe(false);
  });

  it('accepts only a render identity and timeout reason (T16)', () => {
    expect(runtimeAbortArgsSchema.parse({ renderId, reason: 2 })).toEqual({ renderId, reason: 2 });
  });
});

describe('RuntimeProtocol — request-owned evaluation validation', () => {
  const valid = {
    stage: { 'nested/main.ts': new Uint8Array([1, 2, 3]) },
    file: { path: 'nested', filename: 'main.ts' },
    parameters: { width: 10 },
    options: { quality: 'fine' },
    content: { includeEdges: true },
  };

  it('accepts only the normalized staged request shape', () => {
    expect(runtimeEvaluateModelArgsSchema.parse(valid)).toEqual(valid);
    expect(runtimeEvaluateModelArgsSchema.safeParse({ ...valid, signal: {} }).success).toBe(false);
    expect(runtimeEvaluateModelArgsSchema.safeParse({ ...valid, source: { path: 'main.ts' } }).success).toBe(false);
    expect(runtimeEvaluateModelArgsSchema.safeParse({ ...valid, extra: true }).success).toBe(false);
  });

  it('rejects malformed source locators, stages, and record fields', () => {
    expect(
      runtimeEvaluateModelArgsSchema.safeParse({ ...valid, file: { path: '../escape', filename: 'x.ts' } }).success,
    ).toBe(false);
    expect(
      runtimeEvaluateModelArgsSchema.safeParse({ ...valid, file: { path: '', filename: 'nested/x.ts' } }).success,
    ).toBe(false);
    expect(
      runtimeEvaluateModelArgsSchema.safeParse({ ...valid, stage: { '../escape.ts': new Uint8Array([1]) } }).success,
    ).toBe(false);
    expect(runtimeEvaluateModelArgsSchema.safeParse({ ...valid, stage: { 'main.ts': 'source' } }).success).toBe(false);
    expect(runtimeEvaluateModelArgsSchema.safeParse({ ...valid, parameters: [] }).success).toBe(false);
  });
});

describe('RuntimeProtocol — SVG coordinate provenance', () => {
  it('preserves canonical length units and permits scale-free standard SVG', () => {
    const schema = runtimeProtocolSchemas.calls.evaluateModel.result;
    const scaled = {
      success: true,
      data: { format: 'svg', content: '<svg/>', hash: 'drawing', units: { length: 'mm' } },
      issues: [],
    } as const;
    expect(schema.parse(scaled)).toEqual(scaled);
    expect(
      schema.safeParse({ success: true, data: { format: 'svg', content: '<svg/>', hash: 'drawing' }, issues: [] })
        .success,
    ).toBe(true);
  });

  it('rejects invalid unit symbols and unknown unit fields', () => {
    const schema = runtimeProtocolSchemas.calls.evaluateModel.result;
    for (const units of [{ length: 'pixels' }, { length: 'mm', angle: 'deg' }]) {
      expect(
        schema.safeParse({
          success: true,
          data: { format: 'svg', content: '<svg/>', hash: 'drawing', units },
          issues: [],
        }).success,
      ).toBe(false);
    }
  });
});

describe('RuntimeProtocol — resolved preview generation validation', () => {
  const renderId = '550e8400-e29b-41d4-a716-446655440000';

  it('rejects missing worker-resolved generation (T13)', () => {
    expect(runtimeStateChangedArgsSchema.safeParse({ renderId, state: 'rendering' }).success).toBe(false);
  });

  it.each([0, 4_294_967_295])('accepts uint32 generation %i (T13)', (abortGeneration) => {
    expect(runtimeStateChangedArgsSchema.parse({ renderId, abortGeneration, state: 'rendering' })).toEqual({
      renderId,
      abortGeneration,
      state: 'rendering',
    });
  });
});
