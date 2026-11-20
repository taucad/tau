// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { isWorkerLoadFailure, loadInWorker } from '#workers/worker-load.js';

const chunkFailure = (): TypeError =>
  new TypeError('Failed to fetch dynamically imported module: https://tau.new/assets/agent-host.impl-Bu.js');

/* PL7 blueprint FP10 (D18): every import inside a worker goes through one loader, which reports a module load failure
 * to the page as WORKER_LOAD_FAILED, with the browser's own words, so the page can start a new worker. */
describe('loadInWorker', () => {
  it('should resolve the module the importer loaded', async () => {
    await expect(loadInWorker(async () => ({ value: 1 }))).resolves.toStrictEqual({ value: 1 });
  });

  it('should report a module load failure as WORKER_LOAD_FAILED, keeping the browser’s words and the cause', async () => {
    const failure = chunkFailure();

    try {
      await loadInWorker(async () => {
        throw failure;
      });
      expect.fail('should have thrown');
    } catch (error) {
      expect(isWorkerLoadFailure(error)).toBe(true);
      expect((error as Error).message).toContain('Failed to fetch dynamically imported module');
      expect((error as Error).cause).toBe(failure);
    }
  });

  it('should pass on an error the module threw while it ran', async () => {
    const thrown = new ReferenceError('document is not defined');

    await expect(
      loadInWorker(async () => {
        throw thrown;
      }),
    ).rejects.toBe(thrown);
    expect(isWorkerLoadFailure(thrown)).toBe(false);
  });
});
