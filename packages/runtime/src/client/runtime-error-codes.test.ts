// @vitest-environment node
/**
 * Locks the typed `code` discriminator on every public runtime-client error
 * class. Consumers classify failures via `error.code` (literal string union)
 * instead of `instanceof` chains or `error.name` substring matches.
 *
 * Type-level assertions (`expectTypeOf`) lock the literal return type so any
 * future widening from `'RUNTIME_RENDER_TIMEOUT'` to `string` fails CI.
 */
import { describe, it, expect, expectTypeOf } from 'vitest';
import {
  NoRenderOutcomeError,
  RenderTimeoutError,
  RenderAbortedError,
  RuntimeConnectionError,
  RuntimeNotConnectedError,
  RuntimeTerminatedError,
  SharedPoolEntryNotFoundError,
} from '#index.js';
import { RuntimeConfigError } from '#worker/runtime-definition.js';

describe('runtime error codes', () => {
  it('NoRenderOutcomeError exposes code RUNTIME_NO_RENDER_OUTCOME', () => {
    const error = new NoRenderOutcomeError();
    expect(error.code).toBe('RUNTIME_NO_RENDER_OUTCOME');
    expectTypeOf(error.code).toEqualTypeOf<'RUNTIME_NO_RENDER_OUTCOME'>();
  });

  it('RenderTimeoutError exposes code RUNTIME_RENDER_TIMEOUT', () => {
    const error = new RenderTimeoutError(30_000);
    expect(error.code).toBe('RUNTIME_RENDER_TIMEOUT');
    expectTypeOf(error.code).toEqualTypeOf<'RUNTIME_RENDER_TIMEOUT'>();
  });

  it('RenderAbortedError exposes code RUNTIME_RENDER_ABORTED', () => {
    const error = new RenderAbortedError();
    expect(error.code).toBe('RUNTIME_RENDER_ABORTED');
    expectTypeOf(error.code).toEqualTypeOf<'RUNTIME_RENDER_ABORTED'>();
  });

  it('RuntimeConnectionError exposes code RUNTIME_CONNECTION_FAILED and a typed causeKind', () => {
    const error = new RuntimeConnectionError('boom', 'kernel-binding', undefined);
    expect(error.code).toBe('RUNTIME_CONNECTION_FAILED');
    expect(error.causeKind).toBe('kernel-binding');
    expectTypeOf(error.code).toEqualTypeOf<'RUNTIME_CONNECTION_FAILED'>();
  });

  it('RuntimeConfigError exposes code RUNTIME_CONFIG_INVALID', () => {
    const cause = new Error('invalid endpoint');
    const error = new RuntimeConfigError('Invalid runtime config: endpoint: Invalid URL', cause);
    expect(error.code).toBe('RUNTIME_CONFIG_INVALID');
    expect(error.cause).toBe(cause);
    expectTypeOf(error.code).toEqualTypeOf<'RUNTIME_CONFIG_INVALID'>();
  });

  it('RuntimeNotConnectedError exposes code RUNTIME_NOT_CONNECTED', () => {
    const error = new RuntimeNotConnectedError('render');
    expect(error.code).toBe('RUNTIME_NOT_CONNECTED');
    expectTypeOf(error.code).toEqualTypeOf<'RUNTIME_NOT_CONNECTED'>();
  });

  it('RuntimeTerminatedError exposes code RUNTIME_TERMINATED', () => {
    const error = new RuntimeTerminatedError();
    expect(error.code).toBe('RUNTIME_TERMINATED');
    expectTypeOf(error.code).toEqualTypeOf<'RUNTIME_TERMINATED'>();
  });

  it('SharedPoolEntryNotFoundError exposes code RUNTIME_SHARED_POOL_KEY_MISSING', () => {
    const error = new SharedPoolEntryNotFoundError('missing-key');
    expect(error.code).toBe('RUNTIME_SHARED_POOL_KEY_MISSING');
    expect(error.key).toBe('missing-key');
    expectTypeOf(error.code).toEqualTypeOf<'RUNTIME_SHARED_POOL_KEY_MISSING'>();
  });
});
