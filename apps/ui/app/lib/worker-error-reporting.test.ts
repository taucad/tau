// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/naming-convention -- environment variable names and Sentry tag names are wire names. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkerFailure, reportWorkerFailures } from '#lib/worker-error-reporting.js';

const mocks = vi.hoisted(() => {
  const env: { SENTRY_DSN?: string } = { SENTRY_DSN: 'https://public@o0.ingest.sentry.io/42' };
  return { env, reportUiError: vi.fn(async () => undefined) };
});

vi.mock('#environment.config.js', () => ({ ENV: mocks.env }));
vi.mock('#lib/error-reporting.js', () => ({ reportUiError: mocks.reportUiError }));

afterEach(() => {
  mocks.reportUiError.mockClear();
  mocks.env.SENTRY_DSN = 'https://public@o0.ingest.sentry.io/42';
});

/** A worker stand-in: the reporter only listens to it. */
const fakeWorker = (): Worker => new EventTarget() as Worker;

const workerError = (message: string): ErrorEvent =>
  new ErrorEvent('error', {
    message,
    filename: 'https://taucad.dev/assets/kernel.js',
    lineno: 3,
    colno: 9,
    cancelable: true,
  });

describe('reportWorkerFailures', () => {
  it('should report the first error of a worker incarnation, tagged with the worker', () => {
    const worker = reportWorkerFailures(fakeWorker(), 'file-manager');
    const event = workerError('Uncaught TypeError: x is undefined');

    worker.dispatchEvent(event);

    expect(mocks.reportUiError).toHaveBeenCalledOnce();
    const [error, details] = mocks.reportUiError.mock.calls[0] as unknown as [Error, Record<string, unknown>];
    expect(error).toBeInstanceOf(WorkerFailure);
    expect(error.message).toBe('Uncaught TypeError: x is undefined');
    expect(details).toEqual({
      tags: { worker: 'file-manager' },
      contexts: {
        worker: { event: 'error', filename: 'https://taucad.dev/assets/kernel.js', lineno: 3, colno: 9 },
      },
      fingerprint: [
        'worker-failure',
        'file-manager',
        'error',
        'Uncaught TypeError: x is undefined',
        '/assets/kernel.js',
      ],
    });
    // Handled here, so the browser does not repeat it on `window` for the global handlers.
    expect(event.defaultPrevented).toBe(true);
  });

  it('should report once per incarnation, and again for a new worker', () => {
    const first = reportWorkerFailures(fakeWorker(), 'agent-host');
    first.dispatchEvent(workerError('one'));
    first.dispatchEvent(workerError('two'));
    first.dispatchEvent(new MessageEvent('messageerror'));
    const second = reportWorkerFailures(fakeWorker(), 'agent-host');
    second.dispatchEvent(new MessageEvent('messageerror'));

    expect(mocks.reportUiError).toHaveBeenCalledTimes(2);
    const [error, details] = mocks.reportUiError.mock.calls[1] as unknown as [Error, { tags: unknown }];
    expect(error.message).toBe('A worker message could not be deserialized');
    expect(details.tags).toEqual({ worker: 'agent-host' });
  });

  it('should tag a kernel worker with its runtime transport', () => {
    reportWorkerFailures(fakeWorker(), 'kernel').dispatchEvent(workerError('kernel failed'));

    const [, details] = mocks.reportUiError.mock.calls[0] as unknown as [Error, { tags: unknown }];
    expect(details.tags).toEqual({ worker: 'kernel', 'runtime.transport': 'web-worker' });
  });

  // D19 (`TAU-UI-N`): the reporter read only `message` and `filename`, so an event whose detail sat in `error` became "A worker failed".
  it('should report the thrown error of an error event that carries no message of its own', () => {
    const thrown = new TypeError('kernel exploded');
    const event = new ErrorEvent('error', { error: thrown, cancelable: true });

    reportWorkerFailures(fakeWorker(), 'kernel').dispatchEvent(event);

    const [error, details] = mocks.reportUiError.mock.calls[0] as unknown as [
      Error,
      { contexts: { worker: Record<string, unknown> }; fingerprint: string[] },
    ];
    expect(error).toBeInstanceOf(WorkerFailure);
    expect(error.message).toBe('TypeError: kernel exploded');
    expect(error.cause).toBe(thrown);
    expect(details.contexts.worker).toEqual({
      event: 'error',
      error: { name: 'TypeError', message: 'kernel exploded', stack: thrown.stack },
    });
    expect(details.fingerprint).toEqual([
      'worker-failure',
      'kernel',
      'error',
      'TypeError',
      'TypeError: kernel exploded',
    ]);
  });

  it('should name the failing script when the event carries nothing else, keeping its full URL in the context', () => {
    const filename = 'https://taucad.dev/assets/runtime.worker-B6x_k2Qa.js';

    reportWorkerFailures(fakeWorker(), 'kernel').dispatchEvent(new ErrorEvent('error', { filename }));

    const [error, details] = mocks.reportUiError.mock.calls[0] as unknown as [
      Error,
      { contexts: { worker: Record<string, unknown> }; fingerprint: string[] },
    ];
    expect(error.message).toBe('A worker failed in /assets/runtime.worker.js');
    expect(details.contexts.worker['filename']).toBe(filename);
    expect(details.fingerprint).toEqual([
      'worker-failure',
      'kernel',
      'error',
      'A worker failed in /assets/runtime.worker.js',
      '/assets/runtime.worker.js',
    ]);
  });

  // D19: a fingerprint carrying the build hash would split `TAU-UI-N` into a new issue every deploy.
  it('should fingerprint two builds of the same script the same', () => {
    const thrown = new TypeError('kernel exploded');
    for (const filename of [
      'https://taucad.dev/assets/runtime.worker-B6x_k2Qa.js',
      'https://tau.new/assets/runtime.worker-Zq9-p1Lm.js',
    ]) {
      reportWorkerFailures(fakeWorker(), 'kernel').dispatchEvent(
        new ErrorEvent('error', { message: 'Uncaught TypeError: kernel exploded', error: thrown, filename }),
      );
    }

    const [first, second] = mocks.reportUiError.mock.calls.map(
      (call) => (call as unknown as [Error, { fingerprint: string[] }])[1].fingerprint,
    );
    expect(first).toEqual([
      'worker-failure',
      'kernel',
      'error',
      'TypeError',
      'Uncaught TypeError: kernel exploded',
      '/assets/runtime.worker.js',
    ]);
    expect(second).toEqual(first);
  });

  it('should fall back to the generic message only when the event carries nothing', () => {
    reportWorkerFailures(fakeWorker(), 'kernel').dispatchEvent(new Event('error', { cancelable: true }));

    const [error, details] = mocks.reportUiError.mock.calls[0] as unknown as [Error, { fingerprint: string[] }];
    expect(error.message).toBe('A worker failed');
    expect(error.cause).toBeUndefined();
    expect(details.fingerprint).toEqual(['worker-failure', 'kernel', 'error', 'A worker failed']);
  });

  it('should neither report nor handle the event without error reporting', () => {
    mocks.env.SENTRY_DSN = undefined;
    const event = workerError('unreported');

    reportWorkerFailures(fakeWorker(), 'printer').dispatchEvent(event);

    expect(mocks.reportUiError).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });
});
