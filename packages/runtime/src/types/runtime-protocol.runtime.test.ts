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
} from '#types/runtime-protocol.types.js';
import type { RuntimeProtocol } from '#types/runtime-protocol.types.js';
import { runtimeAbortArgsSchema, runtimeStateChangedArgsSchema } from '#types/runtime-protocol.schemas.js';

describe('RuntimeProtocol — runtime inventory guard (R20)', () => {
  it('should expose exactly four acknowledged calls', () => {
    expect([...runtimeProtocolCallNames]).toEqual(['initialize', 'export', 'exportModel', 'cleanup']);
  });

  it('exposes exactly 5 client → worker notify commands (T18)', () => {
    expect([...runtimeProtocolClientNotifyNames]).toEqual([
      'openFile',
      'stage-and-render',
      'updateParameters',
      'setOptions',
      'abort',
    ]);
  });

  it('exposes exactly 10 worker → client autonomous event notifies', () => {
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
    ]);
  });

  it('exposes exactly 15 notify keys (5 client commands + 10 worker events)', () => {
    expect(runtimeProtocolNotifyNames).toHaveLength(15);
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
