/** When a transcoder's implementation assets are fetched and verified: before `initialize`, or on first use. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sha256Bytes } from '@taucad/utils/hash';
import { z } from 'zod';
import { KernelRuntimeWorker } from '#framework/kernel-runtime-worker.js';
import { attachRuntimePluginDefinition } from '#plugins/plugin-runtime-definition.js';
import type { ImplementationAssetLoader, TranscoderDefinition } from '#types/runtime-transcoder.types.js';
import type { RuntimeImplementationAsset } from '#types/runtime-kernel.types.js';
import { defineRuntime } from '#worker/runtime-definition.js';
/* oxlint-disable no-restricted-imports, import/extensions -- Runtime-private white-box fixture. */
import { initializeWorkerForTesting } from '../../test/support/kernel-worker.fixture.js';
/* oxlint-enable no-restricted-imports, import/extensions */

const assetBytes: Readonly<Record<string, Uint8Array<ArrayBuffer>>> = {
  'https://assets.example/jpeg.wasm': new Uint8Array([1, 2, 3]),
  'https://assets.example/avif.wasm': new Uint8Array([4, 5, 6]),
};

const originalFetch = globalThis.fetch;
const fetched: string[] = [];
const workers: KernelRuntimeWorker[] = [];

afterEach(async () => {
  globalThis.fetch = originalFetch;
  fetched.length = 0;
  await Promise.all(workers.splice(0).map(async (worker) => worker.cleanup()));
});

const serveAssets = (overrides: Readonly<Record<string, Uint8Array<ArrayBuffer>>> = {}): void => {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = input instanceof Request ? input.url : String(input);
    fetched.push(url);
    const bytes = overrides[url] ?? assetBytes[url];
    return bytes === undefined ? new Response(null, { status: 404 }) : new Response(bytes);
  });
};

const declaredAssets = async (): Promise<RuntimeImplementationAsset[]> => [
  {
    id: 'wasm:jpeg',
    url: 'https://assets.example/jpeg.wasm',
    sha256: await sha256Bytes(assetBytes['https://assets.example/jpeg.wasm']!),
  },
  {
    id: 'wasm:avif',
    url: 'https://assets.example/avif.wasm',
    sha256: await sha256Bytes(assetBytes['https://assets.example/avif.wasm']!),
  },
];

type Harness = { readonly worker: KernelRuntimeWorker; readonly loaded: Array<readonly number[]> };

/**
 * A worker with one transcoder whose `transcode` loads the asset named by the request's `asset` option.
 *
 * @param definition - Asset declarations and the loading mode.
 * @returns The worker and the bytes each transcode received.
 */
const createHarness = async (
  definition: Pick<TranscoderDefinition, 'implementationAssets' | 'implementationAssetLoading'>,
): Promise<Harness> => {
  const loaded: Array<readonly number[]> = [];
  const transcoder: TranscoderDefinition = {
    name: 'Codec transcoder',
    version: '1.0.0',
    ...definition,
    edges: [{ from: 'jpeg', to: 'png', optionsSchema: z.object({ asset: z.string() }) }],
    async initialize(_options, runtime) {
      return { assets: runtime.implementationAssets };
    },
    async transcode(input, _runtime, context) {
      const { assets } = context as { readonly assets: ImplementationAssetLoader };
      const bytes = await assets.load(String(input.options['asset']));
      loaded.push([...bytes]);
      return {
        success: true,
        data: [{ name: 'a.png', mimeType: 'image/png', bytes: new Uint8Array([1]) }],
        issues: [],
      };
    },
  };
  const worker = new KernelRuntimeWorker({
    runtime: defineRuntime({
      kernels: [],
      transcoders: [attachRuntimePluginDefinition({ id: 'codec' }, () => transcoder)],
    }),
  });
  workers.push(worker);
  await initializeWorkerForTesting(worker);
  return { worker, loaded };
};

const transcodeWith = async (worker: KernelRuntimeWorker, asset: string) =>
  worker.transcode({
    from: 'jpeg',
    to: 'png',
    files: [{ name: 'a.jpg', mimeType: 'image/jpeg', bytes: new Uint8Array([0xff, 0xd8]) }],
    options: { asset },
  });

describe('transcoder implementation assets loaded on use', () => {
  it('should fetch only the asset a transcode uses, once per worker, and hand it the verified bytes', async () => {
    serveAssets();
    const { worker, loaded } = await createHarness({
      implementationAssets: await declaredAssets(),
      implementationAssetLoading: 'on-use',
    });

    await expect(transcodeWith(worker, 'wasm:jpeg')).resolves.toMatchObject({ success: true });
    expect(fetched).toEqual(['https://assets.example/jpeg.wasm']);

    await expect(transcodeWith(worker, 'wasm:jpeg')).resolves.toMatchObject({ success: true });
    expect(fetched).toEqual(['https://assets.example/jpeg.wasm']);

    await expect(transcodeWith(worker, 'wasm:avif')).resolves.toMatchObject({ success: true });
    expect(fetched).toEqual(['https://assets.example/jpeg.wasm', 'https://assets.example/avif.wasm']);
    expect(loaded).toEqual([
      [1, 2, 3],
      [1, 2, 3],
      [4, 5, 6],
    ]);
  });

  it('should refuse bytes that do not match the pinned digest, and fetch again on the next use', async () => {
    serveAssets({ 'https://assets.example/jpeg.wasm': new Uint8Array([9, 9, 9]) });
    const { worker, loaded } = await createHarness({
      implementationAssets: await declaredAssets(),
      implementationAssetLoading: 'on-use',
    });

    const result = await transcodeWith(worker, 'wasm:jpeg');
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.issues)).toContain('Implementation asset digest mismatch for codec:wasm:jpeg');
    expect(loaded).toEqual([]);

    serveAssets();
    await expect(transcodeWith(worker, 'wasm:jpeg')).resolves.toMatchObject({ success: true });
    expect(loaded).toEqual([[1, 2, 3]]);
  });

  it('should refuse an asset id the transcoder did not declare', async () => {
    serveAssets();
    const { worker } = await createHarness({
      implementationAssets: await declaredAssets(),
      implementationAssetLoading: 'on-use',
    });

    const result = await transcodeWith(worker, 'wasm:undeclared');
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.issues)).toContain('Unknown implementation asset codec:wasm:undeclared');
    expect(fetched).toEqual([]);
  });

  it('should still reject malformed declarations before initialize without fetching', async () => {
    serveAssets();
    const [jpeg] = await declaredAssets();
    const { worker } = await createHarness({
      implementationAssets: [{ ...jpeg!, sha256: 'bad' }],
      implementationAssetLoading: 'on-use',
    });

    const result = await transcodeWith(worker, 'wasm:jpeg');
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.issues)).toContain('Invalid SHA-256 digest for codec:wasm:jpeg');
    expect(fetched).toEqual([]);
  });
});

describe('transcoder implementation assets verified before initialize (default)', () => {
  it('should fetch and verify every declared asset before the first transcode', async () => {
    serveAssets();
    const { worker } = await createHarness({ implementationAssets: await declaredAssets() });

    await expect(transcodeWith(worker, 'wasm:jpeg')).resolves.toMatchObject({ success: true });
    expect(fetched.slice(0, 2)).toEqual(['https://assets.example/jpeg.wasm', 'https://assets.example/avif.wasm']);
  });

  it('should fail the transcode when any declared asset mismatches, even one the request does not use', async () => {
    serveAssets({ 'https://assets.example/avif.wasm': new Uint8Array([0]) });
    const { worker, loaded } = await createHarness({ implementationAssets: await declaredAssets() });

    const result = await transcodeWith(worker, 'wasm:jpeg');
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.issues)).toContain('Implementation asset digest mismatch for codec:wasm:avif');
    expect(loaded).toEqual([]);
  });
});
