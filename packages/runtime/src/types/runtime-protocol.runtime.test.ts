/**
 * Runtime guard for the v5 {@link RuntimeProtocol} message inventory
 * (R20). The two arrays exported alongside the protocol type are the
 * single source of truth for the inventory at runtime — every consumer
 * (dispatcher, worker client, conformance harness, docs generators)
 * enumerates them rather than re-listing the names locally.
 *
 * The matching type-level guards live in
 * {@link ./runtime-protocol.test-d.ts}. Both files together fail closed
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

describe('RuntimeProtocol — runtime inventory guard (R20)', () => {
  it('should expose exactly three calls for initialization, current export, and request-scoped export', () => {
    expect([...runtimeProtocolCallNames]).toEqual(['initialize', 'export', 'exportModel']);
  });

  it('exposes exactly 7 client → worker notify commands', () => {
    expect([...runtimeProtocolClientNotifyNames]).toEqual([
      'openFile',
      'stage-and-render',
      'updateParameters',
      'setOptions',
      'fileChanged',
      'cleanup',
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

  it('exposes exactly 17 notify keys (7 client commands + 10 worker events)', () => {
    expect(runtimeProtocolNotifyNames).toHaveLength(17);
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
