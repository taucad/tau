/**
 * Cancellation declaration contract: plugin authors receive the operation
 * signal while opaque render correlation remains outside the consumer API.
 */

import { describe, expectTypeOf, it } from 'vitest';
import type {
  RenderOutcome,
  RuntimeClient,
  RuntimeClientOptions,
  RuntimeRenderInput,
  RuntimeTerminatedCause,
} from '#client/index.js';
import type { BundlerRuntime } from '#plugins/bundler-entry.js';
import type { KernelRuntime } from '#plugins/kernel-plugin-entry.js';
import type { KernelMiddlewareRuntime, MiddlewareDependencyRuntime } from '#plugins/middleware-entry.js';
import type { WorkerState } from '#types/runtime-protocol.types.js';
import type { KernelPlugin, MiddlewarePlugin } from '#plugins/plugin-types.js';
import type {
  RuntimeTransportClient,
  RuntimeTransportCloseResult,
  RuntimeTransportPreviewReservation,
  RuntimeTransportRenderTarget,
  RuntimeTransportTimeoutRecovery,
} from '#transport/index.js';

describe('public cancellation declarations', () => {
  it('requires the platform AbortSignal on every operation-scoped author runtime', () => {
    expectTypeOf<KernelRuntime['signal']>().toEqualTypeOf<AbortSignal>();
    expectTypeOf<KernelMiddlewareRuntime['signal']>().toEqualTypeOf<AbortSignal>();
    expectTypeOf<MiddlewareDependencyRuntime['signal']>().toEqualTypeOf<AbortSignal>();
    expectTypeOf<BundlerRuntime['signal']>().toEqualTypeOf<AbortSignal>();
  });

  it('includes render-timeout in the complete terminal cause union', () => {
    expectTypeOf<RuntimeTerminatedCause>().toEqualTypeOf<'explicit' | 'transport-closed' | 'render-timeout'>();
  });

  it('exposes exact-target timeout recovery and typed transport closure to transport authors', () => {
    expectTypeOf<
      RuntimeTransportClient['reservePreview']
    >().returns.toEqualTypeOf<RuntimeTransportPreviewReservation>();
    expectTypeOf<RuntimeTransportClient['renderTimeoutRecovery']>().toEqualTypeOf<RuntimeTransportTimeoutRecovery>();
    expectTypeOf<RuntimeTransportClient['closed']>().toEqualTypeOf<Promise<RuntimeTransportCloseResult>>();

    type TerminableRecovery = Extract<RuntimeTransportTimeoutRecovery, { kind: 'terminable' }>;
    expectTypeOf<TerminableRecovery['abortRender']>().parameter(0).toEqualTypeOf<RuntimeTransportRenderTarget>();
  });

  it('keeps opaque cancellation identity out of consumer inputs and outcomes', () => {
    type InternalKeys = 'renderId' | 'abortGeneration' | 'signal';
    expectTypeOf<Extract<keyof RuntimeClientOptions, InternalKeys>>().toEqualTypeOf<never>();
    expectTypeOf<
      Extract<keyof RuntimeRenderInput<KernelPlugin[], MiddlewarePlugin[]>, InternalKeys>
    >().toEqualTypeOf<never>();
    expectTypeOf<Extract<keyof RenderOutcome, InternalKeys>>().toEqualTypeOf<never>();
  });

  it('keeps render correlation out of high-level event callbacks', () => {
    expectTypeOf<RuntimeClient['on']>().toBeCallableWith(
      'state',
      (_state: WorkerState, _detail?: string): void => undefined,
    );
    expectTypeOf<RuntimeClient['on']>().toBeCallableWith(
      'progress',
      (_phase: string, _detail?: Record<string, unknown>): void => undefined,
    );
  });
});
