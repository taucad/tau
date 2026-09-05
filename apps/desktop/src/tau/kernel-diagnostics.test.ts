import { describe, expect, it } from 'vitest';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';

import { desktopAssimpBackend, desktopOpenrscadKernel } from '#tau/desktop-runtime.definition.js';

import { kernelEngineEvent, kernelEngineRecord } from '#tau/kernel-diagnostics.js';

describe('kernelEngineRecord', () => {
  it('selects native Assimp only for the supported Apple Silicon slice', () => {
    expect(desktopAssimpBackend).toBe(process.arch === 'arm64' ? 'native' : 'wasm');
  });

  it('reports the bound addon and the asserted copied-buffer trace under Electron', () => {
    expect(
      kernelEngineRecord({
        kernelId: 'openrscad',
        version: '0.11.0-beta.3',
        backend: 'native',
        versions: { electron: '43.5.0', node: '24.19.0' },
      }),
    ).toEqual({
      kernelId: 'openrscad',
      version: '0.11.0-beta.3',
      backend: 'native',
      native: true,
      electron: '43.5.0',
      node: '24.19.0',
      napiExternalBuffersAssumedCopied: true,
    });
  });

  it('flips `native` when no platform package matched and the engine fell back', () => {
    /* The whole point of reading the engine's `backend` export: the version is
     * now the same string either way, so a witness keyed on it could not fail. */
    const record = kernelEngineRecord({
      kernelId: 'openrscad',
      version: '0.11.0-beta.3',
      backend: 'wasm',
      versions: { electron: '43.5.0', node: '24.19.0' },
    });
    expect([record.backend, record.native]).toEqual(['wasm', false]);
  });

  it('drops the copied-buffer assertion when the utility is plain Node', () => {
    /* The field is asserted from Electron's build flag, never measured, so it
     * tracks exactly one thing: whether this process is Electron. */
    const record = kernelEngineRecord({
      kernelId: 'openrscad',
      version: '1.0.0',
      backend: 'native',
      versions: { node: '24.10.0' },
    });
    expect([record.electron, record.napiExternalBuffersAssumedCopied]).toEqual([undefined, false]);
  });
});

describe('the identity the record reports', () => {
  it('comes from the kernel the desktop recipe actually serves and the engine it loaded', async () => {
    /* The witness resolves `desktopOpenrscadKernel` — the same binding
     * `desktop-runtime.definition.ts` registers under `kernels:` — and the
     * `backend` export of the engine module that binding loads. Both halves are
     * read from what the process serves, never from a second instantiation. */
    const served = await resolveRuntimePluginDefinition('kernel', desktopOpenrscadKernel);
    const { backend } = await import('@taulabs/openrscad-engine');
    const record = kernelEngineRecord({
      kernelId: desktopOpenrscadKernel.id,
      version: served.version,
      backend,
      versions: process.versions,
    });

    expect(record.kernelId).toBe('openrscad');
    expect(record.version).toBe(served.version);
    /* This host runs the addon; a host with no matching platform package would
     * report `wasm` here and still render (`native-wasm-parity.test.ts` and the
     * kernel's own fallback test cover both directions). */
    expect(record.backend).toBe('native');
    expect(record.native).toBe(true);
  });

  it('is logged under the event name the e2e greps for', () => {
    expect(kernelEngineEvent).toBe('kernel.engine');
  });
});
