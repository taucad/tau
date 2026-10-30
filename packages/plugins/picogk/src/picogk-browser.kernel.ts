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
    const { assets, mode } = await loadPicogkBrowserAssets({
      manifest: { ...options.assets, url: new URL(options.assets.url, globalThis.location.href).href },
      wasm: options.wasm,
      isolated: globalThis.crossOriginIsolated,
      signal: services.signal,
    });
    // Tau prefers the threaded build, so the author's console says which one ran their program.
    // A page without cross-origin isolation can hold no shared memory, and `auto` takes the serial
    // build there rather than failing, which is the only reason a production page reports `single`.
    services.logger.log(
      mode === 'multi'
        ? 'PicoGK browser WASM variant: multi'
        : `PicoGK browser WASM variant: single (threaded build ${globalThis.crossOriginIsolated ? 'absent from this bundle' : 'unavailable: no cross-origin isolation'})`,
    );
    return createPicogkBrowserContext({
      assets,
      recycleHeapBytes: options.recycleHeapBytes,
      createWorker: () => new Worker(new URL('picogk-browser.worker.mjs', import.meta.url), { type: 'module' }),
      startupTimeout: 120_000,
      requestTimeout: 0,
    });
  },
});
