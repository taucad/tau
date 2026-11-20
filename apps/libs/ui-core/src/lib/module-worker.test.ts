// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { workerCodeLoadFailureType } from '#lib/code-loading.js';
import {
  WorkerCodeLoadError,
  createModuleWorker,
  isWorkerCodeLoadFailure,
  setWorkerCodeLoadHandler,
} from '#lib/module-worker.js';

/** The page's side of a worker, as the factory sees it: an event target. */
class FakeWorker extends EventTarget {
  public postMessage(): void {
    // Nothing crosses in these tests.
  }

  public terminate(): void {
    // Nothing runs in these tests.
  }
}

const start = (): FakeWorker => {
  const fake = new FakeWorker();
  createModuleWorker(() => fake as unknown as Worker, { name: 'agent-host' });
  return fake;
};

const importFailed = (): MessageEvent =>
  new MessageEvent('message', {
    data: {
      type: workerCodeLoadFailureType,
      message: 'Failed to fetch dynamically imported module: https://tau.new/assets/agent-host.impl-BuKhIGu5.js',
    },
  });

let restore: (() => void) | undefined;

afterEach(() => {
  restore?.();
  restore = undefined;
});

describe('createModuleWorker', () => {
  it('should return the worker the thunk constructs', () => {
    const fake = new FakeWorker();

    expect(createModuleWorker(() => fake as unknown as Worker, { name: 'x' })).toBe(fake);
  });

  it('should take a failed import off the worker’s own channel, tell the page once, and announce it as an error', () => {
    const handler = vi.fn();
    restore = setWorkerCodeLoadHandler(handler);
    const fake = start();
    const protocol = vi.fn();
    const errors: ErrorEvent[] = [];
    fake.addEventListener('message', protocol);
    fake.addEventListener('error', (event) => {
      errors.push(event as ErrorEvent);
    });

    fake.dispatchEvent(importFailed());
    fake.dispatchEvent(importFailed());

    expect(protocol).not.toHaveBeenCalled();
    expect(handler).toHaveBeenCalledOnce();
    const [failure] = handler.mock.calls[0] as [WorkerCodeLoadError];
    expect(failure).toBeInstanceOf(WorkerCodeLoadError);
    expect(failure.worker).toBe('agent-host');
    expect(failure.code).toBe('WORKER_LOAD_FAILED');
    expect(failure.message).toContain('agent-host.impl-BuKhIGu5.js');
    // The owner retires the worker as it retires any failed one.
    expect(errors.map((event): unknown => event.error)).toContain(failure);
  });

  it('should leave the worker’s own messages to its protocol', () => {
    const handler = vi.fn();
    restore = setWorkerCodeLoadHandler(handler);
    const fake = start();
    const protocol = vi.fn();
    fake.addEventListener('message', protocol);

    fake.dispatchEvent(new MessageEvent('message', { data: { type: 'hello' } }));

    expect(protocol).toHaveBeenCalledOnce();
    expect(handler).not.toHaveBeenCalled();
  });

  it('should tell the page when the worker’s script did not load (a bare error event)', () => {
    const handler = vi.fn();
    restore = setWorkerCodeLoadHandler(handler);
    const fake = start();

    fake.dispatchEvent(new Event('error'));

    expect(handler).toHaveBeenCalledExactlyOnceWith(expect.any(WorkerCodeLoadError));
  });

  it('should leave an uncaught error inside a running worker to its owner', () => {
    const handler = vi.fn();
    restore = setWorkerCodeLoadHandler(handler);
    const fake = start();

    fake.dispatchEvent(new ErrorEvent('error', { message: 'Uncaught TypeError: x is undefined' }));

    expect(handler).not.toHaveBeenCalled();
  });
});

describe('isWorkerCodeLoadFailure', () => {
  it('should recognise the factory’s error and a coded error a protocol carried across', () => {
    expect(
      isWorkerCodeLoadFailure(new WorkerCodeLoadError('x', new TypeError('Importing a module script failed.'))),
    ).toBe(true);
    expect(
      isWorkerCodeLoadFailure(
        Object.assign(new Error('Agent host worker failed to load'), { code: 'WORKER_LOAD_FAILED' }),
      ),
    ).toBe(true);
    expect(isWorkerCodeLoadFailure(new Error('other'))).toBe(false);
  });
});
