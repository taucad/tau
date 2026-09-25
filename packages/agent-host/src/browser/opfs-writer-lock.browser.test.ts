import { expect, it } from 'vitest';

type WorkerResult = { readonly code?: unknown; readonly reopened?: boolean; readonly error?: string };

// CL-A8 (OPFS leg): the handle is the fence; a second writer is refused until the first closes.
it('should answer WRITER_LOCKED while another handle is open', async () => {
  const worker = new Worker(new URL('opfs-writer-lock.browser.fixture.ts', import.meta.url), { type: 'module' });
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
    worker.postMessage('run');
  });
  worker.terminate();

  expect(result).toEqual({ code: 'WRITER_LOCKED', reopened: true });
});
