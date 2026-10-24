/* oxlint-disable no-restricted-imports -- Vitest loads global setup before test aliases exist. */
import { startStorage, stopChild } from './api-process.ts';
import { gitE2EStorageUrls } from './config.ts';
/* oxlint-enable no-restricted-imports */

/**
 * The tier's tau-storage workers alone (DC1), for a suite that boots its own
 * API processes, such as the project-deletion race: since DC1 an API forwards
 * every git RPC and every repository tombstone to tau-storage, and
 * `sharedEnvironment` points each API this tier boots at these workers.
 */
export const setup = async (): Promise<() => Promise<void>> => {
  const workers: Array<Awaited<ReturnType<typeof startStorage>>> = [];
  const stop = async (): Promise<void> => {
    await Promise.all(workers.map(async (worker) => stopChild(worker.child)));
    for (const worker of workers) {
      worker.log.end();
    }
  };
  try {
    for (const [index, url] of gitE2EStorageUrls.entries()) {
      // oxlint-disable-next-line no-await-in-loop -- sequential, so each fails for its own reasons
      workers.push(await startStorage({ url, label: `race-worker-${String(index + 1)}` }));
    }
  } catch (error) {
    await stop();
    throw error;
  }
  return stop;
};
