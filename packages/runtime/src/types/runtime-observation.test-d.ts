/**
 * What the operation observation types refuse (the runtime half of the design's `misuse.ts`).
 */
import { describe, expectTypeOf, it } from 'vitest';
import type { RuntimeClient } from '#client/runtime-client.js';
import type { ResourceLimitDetails } from '#types/runtime.types.js';
import type {
  RuntimeLateTerminal,
  RuntimeObservationMode,
  RuntimeObservationSupport,
  RuntimeOperationObservation,
  WorkerOperationFacts,
} from '#types/runtime-observation.types.js';

declare const client: RuntimeClient;

const facts = { queue: 0, execution: 1, cold: false, reuse: 'computed' } as const;

describe('operation observation types', () => {
  it('should refuse a value on unknown demand', () => {
    const guessed: ResourceLimitDetails = {
      limit: 'occt.export.triangles',
      unit: '{triangle}',
      maximum: 8_000_000,
      // @ts-expect-error -- `value` does not exist on the unknown branch
      demand: { kind: 'unknown', value: 0 },
      origin: 'default',
    };
    expectTypeOf(guessed).toEqualTypeOf<ResourceLimitDetails>();
  });

  it('should refuse outcomes outside the designed cases', () => {
    // @ts-expect-error -- 'error' is not an outcome
    const free: RuntimeOperationObservation['outcome'] = { type: 'error' };
    // @ts-expect-error -- 'Out of memory' is not a KernelIssueCode
    const message: RuntimeOperationObservation['outcome'] = { type: 'issue', code: 'Out of memory' };
    const close: RuntimeOperationObservation['outcome'] = {
      type: 'terminated',
      // @ts-expect-error -- 'requested' is excluded from `terminated.close`
      close: 'requested',
      detail: undefined,
    };
    expectTypeOf([free, message, close]).toBeArray();
  });

  it('should refuse names, flags and free strings in the worker facts', () => {
    // @ts-expect-error -- 'on' is not a reuse value
    const reuseOn: WorkerOperationFacts['reuse'] = 'on';
    const leaky: WorkerOperationFacts = {
      ...facts,
      // @ts-expect-error -- only counts, `truncated` and `features` exist
      parameters: { declared: 3, modified: 1, names: ['width'] },
    };
    // @ts-expect-error -- `unknown` is a count
    const unknownAsFlag: WorkerOperationFacts['parameters'] = { declared: 3, modified: 1, unknown: true };
    // @ts-expect-error -- 'memoryUsage' is not a heap source
    const memoryUsage: WorkerOperationFacts['heapSource'] = 'memoryUsage';
    // @ts-expect-error -- 'supervisor' is not a heap source
    const supervisor: WorkerOperationFacts['heapSource'] = 'supervisor';
    // @ts-expect-error -- 'websocket' is a transport, not a RuntimeRealm
    const transportAsRealm: WorkerOperationFacts['realm'] = 'websocket';
    // @ts-expect-error -- 'main-thread' is not a RuntimeRealm
    const threadAsRealm: WorkerOperationFacts['realm'] = 'main-thread';
    const spanAsPhase: WorkerOperationFacts = {
      ...facts,
      // @ts-expect-error -- a span name is not a RuntimePhase
      phases: { 'cache.geometry.mesh.evaluate': 4 },
    };
    // @ts-expect-error -- 'serialize' is not a RuntimePhase
    const retired: WorkerOperationFacts['phases'] = { serialize: 1 };
    expectTypeOf([
      reuseOn,
      leaky,
      unknownAsFlag,
      memoryUsage,
      supervisor,
      transportAsRealm,
      threadAsRealm,
      spanAsPhase,
      retired,
    ]).toBeArray();
  });

  it('should take observation as a typed mode and a closed facts status', () => {
    // @ts-expect-error -- a boolean is not a RuntimeObservationMode
    client.observe(true);
    expectTypeOf(client.observe).parameter(0).toEqualTypeOf<RuntimeObservationMode>();
    expectTypeOf(client.workerObservation).toEqualTypeOf<readonly RuntimeObservationMode[]>();
    // @ts-expect-error -- 'pending' is not a RuntimeFactsStatus
    const withheld: RuntimeOperationObservation['facts'] = 'pending';
    // @ts-expect-error -- 'requested' is not a RuntimeTransport
    const closeAsTransport: RuntimeOperationObservation['transport'] = 'requested';
    // @ts-expect-error -- a message is not a KernelIssueCode
    const messageAsAdaptation: RuntimeOperationObservation['adaptations'] = ['Fell back to coarse tessellation'];
    // @ts-expect-error -- a list of modes, not a boolean
    const observationAsBoolean: RuntimeObservationSupport = { observation: true };
    expectTypeOf([withheld, closeAsTransport, messageAsAdaptation, observationAsBoolean]).toBeArray();
  });

  it('should hand subscribers read-only observations', () => {
    client.on('operation', (seen) => {
      expectTypeOf(seen).toEqualTypeOf<RuntimeOperationObservation>();
      // @ts-expect-error -- readonly
      seen.duration = 0;
    });
    client.on('operation-late', (late) => {
      expectTypeOf(late).toEqualTypeOf<RuntimeLateTerminal>();
      // @ts-expect-error -- readonly
      late.after = 0;
    });
  });
});
