import { describe, expect, it } from 'vitest';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
import { openrscadKernel } from '@taucad/openrscad';

import { desktopAssimpBackend, desktopOpenrscadKernel } from '#tau/desktop-runtime.definition.js';

import { kernelEngineEvent, kernelEngineRecord, nativeVersionMarker } from '#tau/kernel-diagnostics.js';

describe('kernelEngineRecord', () => {
  it('selects native Assimp only for the supported Apple Silicon slice', () => {
    expect(desktopAssimpBackend).toBe(process.arch === 'arm64' ? 'native' : 'wasm');
  });

  it('reports the native build and the asserted copied-buffer trace under Electron', () => {
    expect(
      kernelEngineRecord({
        kernelId: 'openrscad',
        version: '0.11.0-beta.1+native',
        versions: { electron: '43.5.0', node: '24.19.0' },
      }),
    ).toEqual({
      kernelId: 'openrscad',
      version: '0.11.0-beta.1+native',
      native: true,
      electron: '43.5.0',
      node: '24.19.0',
      napiExternalBuffersAssumedCopied: true,
    });
  });

  it('flips `native` when the definition is the WebAssembly twin', () => {
    /* The whole point of deriving it: swap the recipe back to `openrscad()` and
     * the e2e's assertion fails, rather than a constant that reads true either way. */
    const record = kernelEngineRecord({
      kernelId: 'openrscad',
      version: '0.11.0-beta.1',
      versions: { electron: '43.5.0', node: '24.19.0' },
    });
    expect(record.native).toBe(false);
  });

  it('drops the copied-buffer assertion when the utility is plain Node', () => {
    /* The field is asserted from Electron's build flag, never measured, so it
     * tracks exactly one thing: whether this process is Electron. */
    const record = kernelEngineRecord({
      kernelId: 'openrscad',
      version: `1.0.0${nativeVersionMarker}`,
      versions: { node: '24.10.0' },
    });
    expect([record.electron, record.napiExternalBuffersAssumedCopied]).toEqual([undefined, false]);
  });
});

describe('the version the record reports', () => {
  it('comes from the kernel the desktop recipe actually serves', async () => {
    /* The witness resolves `desktopOpenrscadKernel` — the same binding
     * `desktop-runtime.definition.ts` registers under `kernels:` — not a fresh
     * `openrscadNativeKernel()`. A second instantiation would report `+native`
     * even after the recipe was swapped back to WebAssembly, i.e. a witness
     * that cannot fail. Asserting through the exported binding is what ties the
     * log line to the served engine. */
    const served = await resolveRuntimePluginDefinition('kernel', desktopOpenrscadKernel);
    const record = kernelEngineRecord({
      kernelId: desktopOpenrscadKernel.id,
      version: served.version,
      versions: process.versions,
    });

    expect(record.kernelId).toBe('openrscad');
    expect(record.version).toContain(nativeVersionMarker);
    expect(record.native).toBe(true);
  });

  it('would flip if the recipe served the WebAssembly kernel instead', async () => {
    /* The other half of non-vacuousness: the two engines' resolved versions
     * genuinely differ, so swapping the binding changes what gets logged. */
    const served = await resolveRuntimePluginDefinition('kernel', desktopOpenrscadKernel);
    const wasm = await resolveRuntimePluginDefinition('kernel', openrscadKernel());

    expect(wasm.version).not.toContain(nativeVersionMarker);
    expect(served.version).not.toBe(wasm.version);
    expect(
      kernelEngineRecord({ kernelId: 'openrscad', version: wasm.version, versions: process.versions }).native,
    ).toBe(false);
  });

  it('is logged under the event name the e2e greps for', () => {
    expect(kernelEngineEvent).toBe('kernel.engine');
  });
});
