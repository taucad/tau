/**
 * Type tests for the `RuntimeClient` event-bus surface — verifies registered
 * event names, payload shapes, and unsubscribe handle types via
 * `@ts-expect-error` and `expectTypeOf` guards.
 */

import { describe, expectTypeOf, it } from 'vitest';
import type { RenderStatus, RuntimeClient } from '#client/runtime-client.js';
import type { TelemetryBatch } from '#types/runtime-protocol.types.js';

// oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- pure type testing
const client = {} as RuntimeClient;

describe('RuntimeClient event surface', () => {
  it('should expose current renderStatus and accept "renderStatus" subscriptions', () => {
    expectTypeOf(client.renderStatus).toEqualTypeOf<RenderStatus>();
    const off = client.on('renderStatus', (status) => {
      expectTypeOf(status).toEqualTypeOf<RenderStatus>();
    });
    expectTypeOf(off).toEqualTypeOf<() => void>();
  });

  it('should accept "activeKernelChanged" with typed payload', () => {
    const off = client.on('activeKernelChanged', (kernelId) => {
      expectTypeOf(kernelId).toEqualTypeOf<string | undefined>();
    });
    expectTypeOf(off).toEqualTypeOf<() => void>();
  });

  it('should accept "telemetry" with a batch payload carrying its producer and epoch', () => {
    const off = client.on('telemetry', (batch) => {
      expectTypeOf(batch).toEqualTypeOf<TelemetryBatch>();
    });
    expectTypeOf(off).toEqualTypeOf<() => void>();
  });

  it('should NOT accept the legacy "activeKernel" event name', () => {
    // @ts-expect-error -- 'activeKernel' was renamed to 'activeKernelChanged'
    void client.on('activeKernel', (_kernelId: string | undefined) => undefined);
  });

  it('should NOT accept the speculative "fileResolutionFailed" event name', () => {
    // @ts-expect-error -- 'fileResolutionFailed' is not part of the public event surface
    void client.on('fileResolutionFailed', (_payload: unknown) => undefined);
  });
});
