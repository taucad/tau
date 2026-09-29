// oxlint-disable-next-line eslint/no-restricted-imports -- This private worker shares its sibling exact-byte probe.
import { probeProduct } from './mt-probe.mjs';
/* oxlint-disable typescript/no-unsafe-assignment, typescript/no-unsafe-argument, typescript/no-unsafe-call, typescript/no-unsafe-return -- Worker messages and the compiled binding are dynamic host inputs. */

const NativeWorker = globalThis.Worker;
let created = 0;
let active = 0;
globalThis.Worker = class ObservedWorker extends NativeWorker {
  constructor(...args) {
    super(...args);
    created += 1;
    active += 1;
  }
  terminate() {
    active -= 1;
    super.terminate();
  }
};

globalThis.addEventListener('message', async (event) => {
  const { id, variant, permits, receipt } = event.data;
  try {
    if (!globalThis.crossOriginIsolated || typeof SharedArrayBuffer === 'undefined') {
      throw new Error('Browser worker lacks cross-origin isolation or SharedArrayBuffer.');
    }
    const binding = await import('@taucad/geospec-engine-native/wasm');
    const execution = variant === 'mt' ? { variant, permits, receipt } : { variant: 'st' };
    if (event.data.stress) {
      for (let iteration = 0; iteration < 10_000; iteration += 1) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- Cancellation proof intentionally performs sequential geometry.
        await probeProduct({ ...event.data, binding, execution });
        globalThis.postMessage({ id, type: 'progress', iteration });
      }
      throw new Error('Stress loop completed before cancellation.');
    }
    const report = await probeProduct({ ...event.data, binding, execution });
    globalThis.postMessage({
      id,
      type: 'result',
      report,
      resources: { pthreadWorkersCreated: created, pthreadWorkersActive: active },
    });
  } catch (error) {
    globalThis.postMessage({
      id,
      type: 'error',
      error: error?.stack ?? String(error),
      resources: { pthreadWorkersCreated: created, pthreadWorkersActive: active },
    });
  }
});
/* oxlint-enable typescript/no-unsafe-assignment, typescript/no-unsafe-argument, typescript/no-unsafe-call, typescript/no-unsafe-return */
