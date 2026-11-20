import { createModuleWorker } from '#lib/worker-factory.js';
/** Create the browser-only GeoSpec runner worker. Desktop aliases this module to a refusal. */
export const createBrowserGeoSpecWorker = (): Worker =>
  createModuleWorker(
    () =>
      new Worker(new URL('../workers/geospec-runner.worker.ts', import.meta.url), {
        type: 'module',
        name: 'tau-geospec-runner-worker',
      }),
    { name: 'geospec' },
  );
