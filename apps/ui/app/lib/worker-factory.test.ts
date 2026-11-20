// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setCodeLoadFailureHandler } from '#lib/code-loading.js';
import { createModuleWorker } from '#lib/worker-factory.js';
import { isWorkerLoadFailure } from '#workers/worker-load.js';

vi.mock('#lib/error-reporting.js', () => ({ reportUiError: vi.fn(async () => undefined) }));

/** A stand-in `Worker` whose events a test dispatches. */
class FakeWorker extends EventTarget {
  public readonly terminate = vi.fn();
}

afterEach(() => {
  setCodeLoadFailureHandler(undefined);
});

/* PL7 blueprint FP10 (D18): one factory creates every module worker and reports its script failing to load (a plain
 * `error` event with nothing in it), which no page recovery heard before. */
describe('createModuleWorker', () => {
  it('should report the script failing to load as WORKER_LOAD_FAILED to its owner', () => {
    const worker = new FakeWorker();
    const onLoadFailure = vi.fn();
    createModuleWorker(() => worker as unknown as Worker, { name: 'kernel', onLoadFailure });

    worker.dispatchEvent(new Event('error'));

    expect(onLoadFailure).toHaveBeenCalledOnce();
    expect(isWorkerLoadFailure(onLoadFailure.mock.calls[0]?.[0])).toBe(true);
  });

  it('should hand a script that failed to load to the page’s code-load recovery when the owner has no restart', () => {
    const worker = new FakeWorker();
    const recover = vi.fn();
    setCodeLoadFailureHandler(recover);
    createModuleWorker(() => worker as unknown as Worker, { name: 'printer' });

    worker.dispatchEvent(new Event('error'));

    expect(recover).toHaveBeenCalledOnce();
    expect(isWorkerLoadFailure(recover.mock.calls[0]?.[0])).toBe(true);
  });

  it('should leave an uncaught error inside a running worker to its owner’s own handling', () => {
    const worker = new FakeWorker();
    const onLoadFailure = vi.fn();
    createModuleWorker(() => worker as unknown as Worker, { name: 'kernel', onLoadFailure });

    worker.dispatchEvent(new ErrorEvent('error', { message: 'Uncaught TypeError: x is undefined' }));

    expect(onLoadFailure).not.toHaveBeenCalled();
  });
});
