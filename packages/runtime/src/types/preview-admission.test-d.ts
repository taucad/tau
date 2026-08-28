/** Preview-admission boundary contracts for low-level runtime authors. */

import { describe, expectTypeOf, it } from 'vitest';
import type { KernelWorker } from '#framework/kernel-worker.js';
import type { RuntimeWorkerClient } from '#framework/runtime-worker-client.js';
import type { HashedGeometryResult, KernelIssue } from '#types/runtime.types.js';
import type {
  RuntimeOpenFileArgs,
  RuntimePreviewIdentity,
  RuntimeParametersResolvedArgs,
  RuntimeProtocol,
  RuntimeProgressArgs,
  RuntimeSetOptionsArgs,
  RuntimeStageAndRenderArgs,
  RuntimeStateChangedArgs,
  RuntimeUpdateParametersArgs,
} from '#types/runtime-protocol.types.js';

declare const client: RuntimeWorkerClient;
declare const worker: KernelWorker;

describe('preview admission type surface', () => {
  it('requires identity on every lower client preview command (T6)', () => {
    /* Arity alone satisfies the `@ts-expect-error` below (`openFile` takes
     * three required parameters), so pin the admission parameter itself. */
    expectTypeOf<Parameters<RuntimeWorkerClient['openFile']>[2]>().toEqualTypeOf<RuntimePreviewIdentity>();
    // @ts-expect-error -- admission identity is mandatory
    client.openFile({ path: '', filename: 'main.ts' }, {}, undefined);
    // @ts-expect-error -- admission identity is mandatory
    client.openFile({ path: '', filename: 'main.ts' });
    // @ts-expect-error -- admission identity is mandatory
    client.stageAndOpenFile({ stage: {}, file: { path: '', filename: 'main.ts' } });
    // @ts-expect-error -- admission identity is mandatory
    client.updateParameters({});
    // @ts-expect-error -- admission identity is mandatory
    client.setOptions({});
  });

  it('requires full protocol payloads on transported worker handlers (T7)', () => {
    expectTypeOf<KernelWorker['handleOpenFile']>().parameter(0).toEqualTypeOf<RuntimeOpenFileArgs>();
    expectTypeOf<KernelWorker['handleStageAndOpenFile']>().parameter(0).toEqualTypeOf<RuntimeStageAndRenderArgs>();
    expectTypeOf<KernelWorker['handleUpdateParameters']>().parameter(0).toEqualTypeOf<RuntimeUpdateParametersArgs>();
    expectTypeOf<KernelWorker['handleSetOptions']>().parameter(0).toEqualTypeOf<RuntimeSetOptionsArgs>();
  });

  it('requires total render identity on worker callback payloads (T14)', () => {
    expectTypeOf<NonNullable<KernelWorker['onStateChanged']>>().parameter(0).toEqualTypeOf<RuntimeStateChangedArgs>();
    expectTypeOf<NonNullable<KernelWorker['onProgressUpdate']>>().parameter(0).toMatchTypeOf<RuntimeProgressArgs>();
    expectTypeOf<NonNullable<KernelWorker['onParametersResolved']>>()
      .parameter(0)
      .toEqualTypeOf<RuntimeParametersResolvedArgs>();
    expectTypeOf<NonNullable<KernelWorker['onGeometryComputed']>>()
      .parameter(0)
      .toEqualTypeOf<{ readonly result: HashedGeometryResult; readonly renderId: string }>();
    expectTypeOf<NonNullable<KernelWorker['onError']>>()
      .parameter(0)
      .toEqualTypeOf<{ readonly issues: readonly KernelIssue[]; readonly renderId?: string }>();
    expectTypeOf<NonNullable<KernelWorker['onActiveKernelChanged']>>()
      .parameter(0)
      .toEqualTypeOf<RuntimeProtocol['notifies']['activeKernelChanged']['args']>();
  });
});
