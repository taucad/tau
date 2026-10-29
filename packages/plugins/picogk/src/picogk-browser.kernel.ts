import { loadPicogkBrowserAssets } from '#picogk-browser-assets.js';
import { createPicogkBrowserContext } from '#picogk-browser-context.js';
import { picogkBrowserOptionsSchema } from '#picogk-browser.schemas.js';
import { createPicogkKernelDefinition, PicogkKernelError } from '#picogk-kernel-definition.js';

/** PicoGK capability backed by the prepared browser .NET runtime. @public */
export const picogkBrowserKernel = createPicogkKernelDefinition({
  optionsSchema: picogkBrowserOptionsSchema,
  authoredOutputs: true,
  version: '2.5.2+dotnet11rc3.browser2.protocol9.material2.mechanism2.meshing2',
  async initialize(options, services) {
    if (!options.assets) {
      throw new PicogkKernelError([
        {
          code: 'KERNEL_NOT_PREPARED',
          type: 'kernel',
          severity: 'error',
          message: 'The host must supply a prepared PicoGK browser asset manifest.',
          details: { producer: 'picogk', environment: 'browser' },
        },
      ]);
    }
    const { assets } = await loadPicogkBrowserAssets({
      manifest: { ...options.assets, url: new URL(options.assets.url, globalThis.location.href).href },
      wasm: options.wasm,
      isolated: globalThis.crossOriginIsolated,
      signal: services.signal,
    });
    return createPicogkBrowserContext({
      assets,
      recycleHeapBytes: options.recycleHeapBytes,
      createWorker: () => new Worker(new URL('picogk-browser.worker.mjs', import.meta.url), { type: 'module' }),
      startupTimeout: 120_000,
      requestTimeout: 0,
    });
  },
});
