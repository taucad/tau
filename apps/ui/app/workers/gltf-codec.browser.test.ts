import { expect, it } from 'vitest';

type WorkerResult = {
  compressedDeclaresDraco?: number;
  error?: string;
  plainBytes?: number;
  plainDeclaresDraco?: boolean;
};

it('encodes and decodes Draco in a real browser worker', async () => {
  const worker = new Worker(new URL('gltf-codec.browser-worker.ts', import.meta.url), { type: 'module' });
  const result = await new Promise<WorkerResult>((resolve, reject) => {
    worker.addEventListener(
      'message',
      ({ data }: MessageEvent<WorkerResult>) => {
        resolve(data);
      },
      { once: true },
    );
    worker.addEventListener(
      'error',
      (event) => {
        reject(event.error instanceof Error ? event.error : new Error(event.message));
      },
      { once: true },
    );
  }).finally(() => {
    worker.terminate();
  });

  expect(result.error).toBeUndefined();
  expect(result.compressedDeclaresDraco).toBe(2);
  expect(result.plainDeclaresDraco).toBe(false);
  expect(result.plainBytes).toBeGreaterThan(0);
}, 60_000);
