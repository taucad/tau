import { Worker } from 'node:worker_threads';
import { describe, expect, it } from 'vitest';

const executeInWorker = async (): Promise<string> => {
  const worker = new Worker(new URL('node-module-execution.test.worker.ts', import.meta.url), {
    execArgv: ['--import', '@oxc-node/core/register'],
  });

  try {
    return await new Promise<string>((resolve, reject) => {
      worker.once('message', (entryUrl: unknown) => {
        if (typeof entryUrl !== 'string') {
          reject(new TypeError('Expected the test worker to return an entry URL'));
          return;
        }
        resolve(entryUrl);
      });
      worker.once('error', reject);
    });
  } finally {
    await worker.terminate();
  }
};

describe('executeCodeInNode', () => {
  it('should use distinct temporary entry URLs across worker threads', async () => {
    const [firstEntryUrl, secondEntryUrl] = await Promise.all([executeInWorker(), executeInWorker()]);

    expect(firstEntryUrl).not.toBe(secondEntryUrl);
  });
});
