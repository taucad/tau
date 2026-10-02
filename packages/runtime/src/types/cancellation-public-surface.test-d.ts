/** Cancellation declaration contract for document clients and transport authors. */

import { describe, expectTypeOf, it } from 'vitest';
import type { RuntimeClient, RuntimeClientOptions, RuntimeDocument } from '#client/index.js';
import type { BundlerServices } from '#plugins/bundler-entry.js';
import type { KernelServices } from '#plugins/kernel-plugin-entry.js';
import type { KernelMiddlewareServices, MiddlewareDependencyServices } from '#plugins/middleware-entry.js';
import type {
  RuntimeTransportClient,
  RuntimeTransportCloseResult,
  RuntimeTransportTimeoutRecovery,
} from '#transport/index.js';

describe('public cancellation declarations', () => {
  it('requires the platform AbortSignal on operation-scoped author runtimes', () => {
    expectTypeOf<KernelServices['signal']>().toEqualTypeOf<AbortSignal>();
    expectTypeOf<KernelMiddlewareServices['signal']>().toEqualTypeOf<AbortSignal>();
    expectTypeOf<MiddlewareDependencyServices['signal']>().toEqualTypeOf<AbortSignal>();
    expectTypeOf<BundlerServices['signal']>().toEqualTypeOf<AbortSignal>();
  });

  it('exposes terminable timeout recovery and typed transport closure', () => {
    expectTypeOf<RuntimeTransportClient['operationTimeoutRecovery']>().toEqualTypeOf<RuntimeTransportTimeoutRecovery>();
    expectTypeOf<RuntimeTransportClient['closed']>().toEqualTypeOf<Promise<RuntimeTransportCloseResult>>();
    type TerminableRecovery = Extract<RuntimeTransportTimeoutRecovery, { kind: 'terminable' }>;
    expectTypeOf<TerminableRecovery['terminate']>().toEqualTypeOf<() => Promise<void>>();
  });

  it('keeps shared-memory cancellation identities out of public document requests', () => {
    type InternalKeys = 'renderId' | 'abortGeneration' | 'abortSequence' | 'operationId';
    expectTypeOf<Extract<keyof RuntimeClientOptions, InternalKeys>>().toEqualTypeOf<never>();
    expectTypeOf<Extract<keyof Parameters<RuntimeDocument['update']>[0], InternalKeys>>().toEqualTypeOf<never>();
    expectTypeOf<Extract<keyof RuntimeDocument, InternalKeys>>().toEqualTypeOf<never>();
  });

  it('keeps worker correlation out of public event callbacks', () => {
    expectTypeOf<RuntimeClient['on']>().toBeCallableWith(
      'state',
      (_state: 'idle' | 'busy' | 'error', _detail?: string): void => undefined,
    );
    expectTypeOf<RuntimeDocument['on']>().toBeCallableWith(
      'progress',
      (_progress: { phase: string; detail?: Record<string, unknown> }): void => undefined,
    );
  });
});
