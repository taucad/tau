/**
 * Tests for kernel-worker hashing behavior.
 *
 * Tests canonical dependency-hash output and implementation-asset verification.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { OnWorkerLog } from '@taucad/types';
import type { CreateGeometryResult } from '#types/runtime.types.js';
import type { GetDependenciesInput, KernelRuntime, RuntimeImplementationAsset } from '#types/runtime-kernel.types.js';
import type { GetDependenciesResult } from '#types/runtime-dependency.types.js';
import type { WrapCreateGeometryHook } from '#types/runtime-middleware.types.js';
import { MockKernelWorker, createMockFileSystem } from '#testing/kernel-testing.utils.js';
import { sha256Bytes } from '@taucad/utils/hash';
import { defineMiddleware } from '#middleware/runtime-middleware.js';
import type { MaterializedRender } from '#framework/render-artifact.js';

class AssetTestWorker extends MockKernelWorker {
  public async verifyAssets(pluginId: string, assets: readonly RuntimeImplementationAsset[]): Promise<void> {
    await this.verifyImplementationAssets(pluginId, assets);
  }
}

class NativeIdentityTestWorker extends MockKernelWorker {
  public kernelVersion = '1.0.0';

  public configureIdentity(
    initOptions: Record<string, unknown>,
    implementationAssets: readonly RuntimeImplementationAsset[],
  ): void {
    this.kernelInitOptionsMap.set('mock-kernel', initOptions);
    this.kernelImplementationAssetsMap.set('mock-kernel', implementationAssets);
  }

  protected override async onGetDependencies(
    { entryPath }: GetDependenciesInput,
    _runtime: KernelRuntime,
  ): Promise<GetDependenciesResult> {
    return { resolved: [entryPath, '/import.mock'], unresolved: [] };
  }

  protected override getActiveKernelVersion(): string {
    return this.kernelVersion;
  }
}

describe('kernel-worker hashing', () => {
  let onLog: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onLog = vi.fn();
  });

  describe('geometry hash', () => {
    it('should return dependencyHash format in geometry.hash', async () => {
      const successResult: CreateGeometryResult = {
        success: true,
        data: { format: 'gltf', content: new Uint8Array([1, 2, 3, 4, 5]) },
        issues: [],
      };

      const worker = new MockKernelWorker({
        middleware: [],
        computeResult: successResult,
        onLog: onLog as OnWorkerLog,
      });

      const result = await worker.runCreateGeometry();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.hash).toMatch(/^[\da-f]{64}$/);
      }
    });

    it('should generate same dependency hash for same inputs regardless of geometry content', async () => {
      const result1: CreateGeometryResult = {
        success: true,
        data: { format: 'gltf', content: new Uint8Array([1, 2, 3]) },
        issues: [],
      };

      const result2: CreateGeometryResult = {
        success: true,
        data: { format: 'gltf', content: new Uint8Array([4, 5, 6]) },
        issues: [],
      };

      const worker1 = new MockKernelWorker({
        middleware: [],
        computeResult: result1,
        onLog: onLog as OnWorkerLog,
      });

      const worker2 = new MockKernelWorker({
        middleware: [],
        computeResult: result2,
        onLog: onLog as OnWorkerLog,
      });

      const output1 = await worker1.runCreateGeometry();
      const output2 = await worker2.runCreateGeometry();

      expect(output1.success).toBe(true);
      expect(output2.success).toBe(true);

      if (output1.success && output2.success) {
        expect(output1.data.hash).toBe(output2.data.hash);
      }
    });

    it('excludes non-mutating middleware from artifact and native-build identity', async () => {
      const observe: WrapCreateGeometryHook = async (input, handler) => handler(input);
      const observerSpy = vi.fn(observe);
      const observer = defineMiddleware({
        id: 'observer',
        name: 'Observer',
        mutates: false,
        wrapCreateGeometry: observerSpy,
      });
      const mutator = defineMiddleware({
        id: 'mutator',
        name: 'Mutator',
        mutates: true,
        wrapCreateGeometry: async (input, handler) => handler(input),
      });
      const createWorker = (middleware: ConstructorParameters<typeof MockKernelWorker>[0]['middleware']) =>
        new MockKernelWorker({
          middleware,
          onLog: onLog as OnWorkerLog,
          filesystem: createMockFileSystem({
            readFileResult: (path) => new TextEncoder().encode(path === '/observed.config' ? 'config' : 'source'),
          }),
        });
      const base = createWorker([]);
      const observed = createWorker([observer]);
      const mutated = createWorker([mutator]);

      const [baseResult, observedResult, mutatedResult] = await Promise.all([
        base.runCreateGeometry(),
        observed.runCreateGeometry(),
        mutated.runCreateGeometry(),
      ]);
      const artifact = (worker: MockKernelWorker) =>
        (worker as unknown as { currentPublishedRender: MaterializedRender }).currentPublishedRender;

      expect(baseResult.success && baseResult.data.hash).toBe(observedResult.success && observedResult.data.hash);
      expect(mutatedResult.success && mutatedResult.data.hash).not.toBe(baseResult.success && baseResult.data.hash);
      expect(artifact(base).identity.nativeHandleKey).toBe(artifact(observed).identity.nativeHandleKey);
      expect(artifact(mutated).identity.dependencyHash).not.toBe(artifact(base).identity.dependencyHash);
      expect(artifact(mutated).identity.nativeHandleKey).not.toBe(artifact(base).identity.nativeHandleKey);
      expect(observerSpy).toHaveBeenCalledOnce();
    });

    it('forks native identity for every construction input', async () => {
      const keyFor = async (options?: {
        source?: string;
        imported?: string;
        parameters?: Record<string, unknown>;
        kernelVersion?: string;
        initOptions?: Record<string, unknown>;
        assetDigest?: string;
      }) => {
        const fileBytes = (path: string) =>
          new TextEncoder().encode(
            path === '/import.mock' ? (options?.imported ?? 'import') : (options?.source ?? 'source'),
          );
        const filesystem = createMockFileSystem({ readFileResult: fileBytes });
        filesystem.mocks.readFiles.mockImplementation(async (paths: string[]) =>
          Object.fromEntries(paths.map((path) => [path, fileBytes(path)])),
        );
        const worker = new NativeIdentityTestWorker({
          middleware: [],
          onLog: onLog as OnWorkerLog,
          filesystem,
        });
        worker.kernelVersion = options?.kernelVersion ?? '1.0.0';
        worker.configureIdentity(options?.initOptions ?? { mode: 'default' }, [
          {
            id: 'engine',
            url: 'https://assets.example/engine.wasm',
            sha256: options?.assetDigest ?? '0'.repeat(64),
          },
        ]);

        await worker.runCreateGeometry('model.mock', options?.parameters ?? { radius: 10 });
        return (worker as unknown as { currentPublishedRender: MaterializedRender }).currentPublishedRender.identity
          .nativeHandleKey;
      };

      const keys = await Promise.all([
        keyFor(),
        keyFor({ source: 'changed source' }),
        keyFor({ imported: 'changed import' }),
        keyFor({ parameters: { radius: 20 } }),
        keyFor({ kernelVersion: '2.0.0' }),
        keyFor({ initOptions: { mode: 'alternate' } }),
        keyFor({ assetDigest: '1'.repeat(64) }),
      ]);

      for (const [index, label] of [
        'source bytes',
        'import bytes',
        'parameters',
        'kernel version',
        'kernel init options',
        'implementation asset',
      ].entries()) {
        expect(keys[index + 1], label).not.toBe(keys[0]);
      }
    });
  });

  describe('implementation assets', () => {
    const originalFetch = globalThis.fetch;

    const createWorker = () => new AssetTestWorker({ middleware: [], onLog: onLog as OnWorkerLog });

    const asset = (sha256: string): RuntimeImplementationAsset => ({
      id: 'engine',
      url: 'https://assets.example/engine.wasm',
      sha256,
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('should reject malformed digests before fetching bytes', async () => {
      globalThis.fetch = vi.fn();

      await expect(createWorker().verifyAssets('replicad', [asset('bad')])).rejects.toThrow(
        'Invalid SHA-256 digest for replicad:engine',
      );
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('should reject duplicate asset ids before fetching bytes', async () => {
      const digest = '0'.repeat(64);
      globalThis.fetch = vi.fn();

      await expect(createWorker().verifyAssets('replicad', [asset(digest), asset(digest)])).rejects.toThrow(
        'Duplicate implementation asset id for replicad: engine',
      );
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('should reject fetched bytes that do not match the declared digest', async () => {
      globalThis.fetch = vi.fn(async () => new Response(new Uint8Array([1, 2, 3])));

      await expect(createWorker().verifyAssets('replicad', [asset('0'.repeat(64))])).rejects.toThrow(
        'Implementation asset digest mismatch for replicad:engine',
      );
    });

    it('should reject failed asset responses instead of inventing an identity', async () => {
      globalThis.fetch = vi.fn(async () => new Response(null, { status: 503 }));

      await expect(createWorker().verifyAssets('replicad', [asset('0'.repeat(64))])).rejects.toThrow(
        'Failed to fetch implementation asset replicad:engine (503)',
      );
    });

    it('should verify matching bytes once per worker and URL', async () => {
      const bytes = new Uint8Array([1, 2, 3]);
      const digest = await sha256Bytes(bytes);
      globalThis.fetch = vi.fn(async () => new Response(bytes));
      const worker = createWorker();

      await worker.verifyAssets('replicad', [asset(digest)]);
      await worker.verifyAssets('replicad', [asset(digest)]);

      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });
  });
});
