import { expect, it } from 'vitest';

type WorkerResult = {
  readonly origin?: string;
  readonly healedCount?: number;
  readonly persistedCount?: number;
  readonly firstAppend?: { readonly appended: boolean };
  readonly duplicateAppend?: { readonly appended: boolean };
  readonly partialWriteRejected?: boolean;
  readonly recoveredAppend?: { readonly appended: boolean };
  readonly recoveredCount?: number;
  readonly error?: string;
};

it('uses a dedicated-worker OPFS sync handle on a real origin', async () => {
  const worker = new Worker(new URL('opfs-event-log.browser.fixture.ts', import.meta.url), { type: 'module' });
  const result = await new Promise<WorkerResult>((resolve, reject) => {
    const workerTimeout = setTimeout(() => {
      reject(new Error('OPFS worker did not respond'));
    }, 15_000);
    worker.addEventListener(
      'message',
      (message: MessageEvent<WorkerResult>) => {
        clearTimeout(workerTimeout);
        resolve(message.data);
      },
      { once: true },
    );
    worker.addEventListener(
      'error',
      (error) => {
        clearTimeout(workerTimeout);
        reject(new Error(error.message));
      },
      { once: true },
    );
    worker.postMessage('run');
  });
  worker.terminate();

  expect(result.error).toBeUndefined();
  expect(result.origin).not.toBe('null');
  expect(result.healedCount).toBe(1);
  expect(result.persistedCount).toBe(2);
  expect(result.firstAppend).toEqual({ appended: true });
  expect(result.duplicateAppend).toEqual({ appended: false });
  expect(result.partialWriteRejected).toBe(true);
  expect(result.recoveredAppend).toEqual({ appended: true });
  expect(result.recoveredCount).toBe(1);
});
