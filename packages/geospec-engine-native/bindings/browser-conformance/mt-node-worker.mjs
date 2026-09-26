import { parentPort, workerData } from 'node:worker_threads';
import { pathToFileURL } from 'node:url';
// oxlint-disable-next-line eslint/no-restricted-imports -- This private worker shares its sibling exact-byte probe.
import { probeProduct } from './mt-probe.mjs';
/* oxlint-disable typescript/no-unsafe-assignment, typescript/no-unsafe-argument, typescript/no-unsafe-call, typescript/no-unsafe-return -- Worker data and the compiled binding are dynamic host inputs. */

if (!parentPort) {
  throw new Error('MT qualification requires a Node worker.');
}
try {
  const binding = await import(pathToFileURL(workerData.stModule).href);
  const execution =
    workerData.variant === 'mt'
      ? { variant: 'mt', permits: workerData.permits, receipt: pathToFileURL(workerData.mtReceipt).href }
      : { variant: 'st' };
  if (workerData.stress) {
    for (let iteration = 0; iteration < 10_000; iteration += 1) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- Cancellation proof intentionally performs sequential geometry.
      await probeProduct({ binding, execution, ...workerData });
      parentPort.postMessage({ type: 'progress', iteration });
    }
    parentPort.postMessage({ type: 'error', error: 'Stress loop completed before cancellation.' });
  } else {
    const report = await probeProduct({ binding, execution, ...workerData });
    parentPort.postMessage({ type: 'result', report, memory: process.memoryUsage() });
    await new Promise((resolve) => {
      parentPort.once('message', resolve);
    });
  }
} catch (error) {
  parentPort.postMessage({ type: 'error', error: error?.stack ?? String(error) });
}
/* oxlint-enable typescript/no-unsafe-assignment, typescript/no-unsafe-argument, typescript/no-unsafe-call, typescript/no-unsafe-return */
