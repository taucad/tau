import { describe, it, expect } from 'vitest';
import {
  formatWorkerError,
  formatWorkerErrorEnvelope,
  isWorkerErrorEnvelope,
  toWorkerError,
} from '#machines/file-manager-worker-error.js';

describe('formatWorkerError', () => {
  it('formats a plain Event (worker script load failure) as a load-failure with actionable guidance', () => {
    const result = formatWorkerError(new Event('error'));

    expect(result.kind).toBe('load');
    expect(result.message).toMatch(/Worker script failed to load/);
    expect(result.message).toMatch(/Network tab/);
    expect(result.stack).toBeUndefined();
    expect(result.cause).toBeUndefined();
  });

  it('formats an ErrorEvent with `error.stack` into a runtime error preserving stack and cause', () => {
    const cause = new Error('boom inside worker');
    cause.stack = 'Error: boom\n    at worker.ts:42:7';

    const event = new ErrorEvent('error', {
      message: 'Uncaught Error: boom inside worker',
      filename: 'http://localhost:3000/assets/file-manager.worker-XXX.js',
      lineno: 42,
      colno: 7,
      error: cause,
    });

    const result = formatWorkerError(event);

    expect(result.kind).toBe('runtime');
    expect(result.message).toContain('Uncaught Error: boom inside worker');
    expect(result.message).toContain('file-manager.worker-XXX.js:42:7');
    expect(result.stack).toBe(cause.stack);
    expect(result.cause).toBe(cause);
  });

  it('formats a messageerror Event with a structured-clone explanation', () => {
    const result = formatWorkerError(new Event('messageerror'));

    expect(result.kind).toBe('messageerror');
    expect(result.message).toMatch(/messageerror/);
    expect(result.message).toMatch(/structured-clone/);
  });
});

describe('isWorkerErrorEnvelope', () => {
  it('accepts the two known envelope shapes', () => {
    expect(
      isWorkerErrorEnvelope({ type: '__worker_init_error__', phase: "mount('/', 'indexeddb')", message: 'nope' }),
    ).toBe(true);
    expect(
      isWorkerErrorEnvelope({ type: '__worker_runtime_error__', phase: 'unhandledrejection', message: 'whoops' }),
    ).toBe(true);
  });

  it('rejects unrelated message payloads', () => {
    expect(isWorkerErrorEnvelope(undefined)).toBe(false);
    expect(isWorkerErrorEnvelope(null)).toBe(false);
    expect(isWorkerErrorEnvelope('error')).toBe(false);
    expect(isWorkerErrorEnvelope({ type: 'filePool' })).toBe(false);
    expect(isWorkerErrorEnvelope({ type: '__worker_init_error__' })).toBe(false);
  });
});

describe('formatWorkerErrorEnvelope', () => {
  it('includes phase and original message in the formatted output', () => {
    const formatted = formatWorkerErrorEnvelope({
      type: '__worker_init_error__',
      phase: "mount('/', 'indexeddb')",
      message: 'IndexedDB unavailable',
      filename: 'file-manager.worker.ts',
      lineno: 56,
      colno: 1,
      stack: 'Error: IndexedDB unavailable\n    at file-manager.worker.ts:56',
      causeMessage: 'SecurityError',
    });

    expect(formatted.kind).toBe('runtime');
    expect(formatted.message).toContain("Worker mount('/', 'indexeddb') failed: IndexedDB unavailable");
    expect(formatted.message).toContain('file-manager.worker.ts:56:1');
    expect(formatted.message).toContain('caused by: SecurityError');
    expect(formatted.stack).toBe('Error: IndexedDB unavailable\n    at file-manager.worker.ts:56');
  });
});

describe('toWorkerError', () => {
  it('builds a real Error preserving message, stack, and cause', () => {
    const cause = new Error('underlying');
    const error = toWorkerError({
      kind: 'runtime',
      message: 'Top-level message',
      stack: 'custom stack',
      cause,
    });

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('Top-level message');
    expect(error.stack).toBe('custom stack');
    expect(error.cause).toBe(cause);
  });

  it('omits cause when not provided', () => {
    const error = toWorkerError({ kind: 'load', message: 'no cause' });
    expect(error.cause).toBeUndefined();
  });
});
