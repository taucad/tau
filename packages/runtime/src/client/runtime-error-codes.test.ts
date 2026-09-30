// @vitest-environment node
import { runInNewContext } from 'node:vm';
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  isOperationAbortedError,
  isOperationTimeoutError,
  OperationAbortedError,
  OperationTimeoutError,
  RuntimeTerminatedError,
  SharedPoolEntryNotFoundError,
} from '#index.js';
import { RuntimeConfigError } from '#worker/runtime-definition.js';

describe('public runtime error codes', () => {
  it('keeps exact operation discriminators and phases', () => {
    const aborted = new OperationAbortedError('evaluate');
    const timedOut = new OperationTimeoutError('write', 'Export timed out.');
    expect(aborted.code).toBe('RUNTIME_OPERATION_ABORTED');
    expect(timedOut.code).toBe('RUNTIME_OPERATION_TIMEOUT');
    expect(aborted.phase).toBe('evaluate');
    expect(timedOut.phase).toBe('write');
    expectTypeOf(aborted.code).toEqualTypeOf<'RUNTIME_OPERATION_ABORTED'>();
    expectTypeOf(timedOut.code).toEqualTypeOf<'RUNTIME_OPERATION_TIMEOUT'>();
  });

  it('recognizes genuine cross-realm errors and rejects name-only impostors', () => {
    const foreign: unknown = runInNewContext(
      "Object.assign(new Error('remote timeout'), { name: 'OperationTimeoutError', code: 'RUNTIME_OPERATION_TIMEOUT', phase: 'render' })",
    );
    expect(foreign).not.toBeInstanceOf(Error);
    expect(isOperationTimeoutError(foreign)).toBe(true);
    expect(isOperationAbortedError({ name: 'OperationAbortedError' })).toBe(false);
    expect(isOperationTimeoutError({ name: 'OperationTimeoutError', code: 'RUNTIME_OPERATION_TIMEOUT' })).toBe(false);
  });

  it('keeps runtime configuration, termination and pool-error codes', () => {
    const cause = new Error('invalid endpoint');
    const config = new RuntimeConfigError('Invalid runtime config: endpoint: Invalid URL', cause);
    const terminated = new RuntimeTerminatedError();
    const missing = new SharedPoolEntryNotFoundError('missing-key');
    expect(config.code).toBe('RUNTIME_CONFIG_INVALID');
    expect(config.cause).toBe(cause);
    expect(terminated.code).toBe('RUNTIME_TERMINATED');
    expect(missing.code).toBe('RUNTIME_SHARED_POOL_KEY_MISSING');
    expect(missing.key).toBe('missing-key');
    expectTypeOf(config.code).toEqualTypeOf<'RUNTIME_CONFIG_INVALID'>();
    expectTypeOf(terminated.code).toEqualTypeOf<'RUNTIME_TERMINATED'>();
    expectTypeOf(missing.code).toEqualTypeOf<'RUNTIME_SHARED_POOL_KEY_MISSING'>();
  });
});
