/** Canonical dependency identity and verified implementation assets through V2 documents. */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { sha256Bytes } from '@taucad/utils/hash';
import { z } from 'zod';
import { KernelRuntimeWorker } from '#framework/kernel-runtime-worker.js';
import { defineRuntime } from '#worker/runtime-definition.js';
import { defineKernelV2 } from '#types/runtime-kernel-v2.types.js';
import { defineMiddlewareV2 as defineMiddleware } from '#middleware/runtime-middleware-v2.js';
import type { RuntimeImplementationAsset } from '#types/runtime-kernel.types.js';
import type { MiddlewarePlugin } from '#plugins/plugin-types.js';
import type { MaterializedRender } from '#framework/render-artifact.js';
import type { EvaluateResult } from '#types/runtime-kernel-v2.types.js';
import type { WrapEvaluateHook } from '#types/runtime-middleware-v2.types.js';
/* oxlint-disable no-restricted-imports, import/extensions -- Runtime-private white-box fixture. */
import { createGeometryFile, createMockFileSystem } from '../../test/support/kernel-worker.fixture.js';
/* oxlint-enable no-restricted-imports, import/extensions */

class AssetTestWorker extends KernelRuntimeWorker {
  public async verifyAssets(pluginId: string, assets: readonly RuntimeImplementationAsset[]): Promise<void> {
    await this.verifyImplementationAssets(pluginId, assets);
  }
  public cachedEvaluation(label: string): EvaluateResult {
    this.captureNativeHandle({ label });
    return { success: true, data: { views: ['model'] }, issues: [] };
  }
}
const workers: KernelRuntimeWorker[] = [];
afterEach(async () => {
  await Promise.all(workers.splice(0).map(async (worker) => worker.cleanup()));
});
const declaration = {
  schema: {
    $schema: 'https://json-structure.org/meta/extended/v0/#',
    $id: 'urn:hashing',
    name: 'Hashing',
    $uses: ['JSONSchemaUnits'],
    type: 'object',
    properties: { radius: { type: 'double' } },
  },
  defaults: {},
} as const;
type HarnessOptions = {
  source?: string;
  imported?: string;
  parameters?: Record<string, unknown>;
  kernelVersion?: string;
  initOptions?: { mode: string };
  implementationAssets?: readonly RuntimeImplementationAsset[];
  label?: string;
};
const artifactOf = (worker: KernelRuntimeWorker): MaterializedRender => {
  // @ts-expect-error -- Runtime-private identity evidence; no public escape or unchecked cast.
  const artifact = worker.documents.get('doc')?.current?.artifact;
  if (!artifact) {
    throw new Error('Missing document artifact');
  }
  return artifact;
};
const createHarness = async (options?: HarnessOptions & { middleware?: readonly MiddlewarePlugin[] }) => {
  const counts = { evaluations: 0 };
  const observed: number[] = [];
  const kernel = defineKernelV2({
    id: 'hash-kernel',
    extensions: ['mock'],
    name: 'Hash kernel',
    version: options?.kernelVersion ?? '1.0.0',
    optionsSchema: z.object({ mode: z.string().default('default') }),
    evaluateOptionsSchema: z.object({ token: z.number().default(0) }),
    implementationAssets: options?.implementationAssets ?? [],
    views: { model: { title: 'Model', mimeType: 'image/svg+xml' } },
    exports: {},
    async initialize() {
      return {};
    },
    async resolve({ entryPath }) {
      return { resolved: [entryPath, 'import.mock'], unresolved: [] };
    },
    async describe() {
      return { success: true, data: { parameters: declaration }, issues: [] };
    },
    async evaluate({ options: evaluationOptions }) {
      counts.evaluations++;
      observed.push(evaluationOptions.token);
      return { handle: { label: options?.label ?? 'model' } };
    },
    async render({ handle }) {
      return { content: `<svg xmlns="http://www.w3.org/2000/svg"><text>${handle.label}</text></svg>` };
    },
  })(options?.initOptions ?? { mode: 'default' });
  const bytesFor = (path: string) =>
    new TextEncoder().encode(path === 'import.mock' ? (options?.imported ?? 'import') : (options?.source ?? 'source'));
  const filesystem = createMockFileSystem({ readFileResult: bytesFor });
  filesystem.mocks.readFiles.mockImplementation(async (paths: string[]) =>
    Object.fromEntries(paths.map((path) => [path, bytesFor(path)])),
  );
  const worker = new AssetTestWorker({
    runtime: defineRuntime({ kernels: [kernel], middleware: options?.middleware ?? [] }),
  });
  workers.push(worker);
  await worker.initialize({ callbacks: { onLog: () => undefined }, transferables: { inlineFileSystem: filesystem } });
  const evaluated: Array<Parameters<NonNullable<KernelRuntimeWorker['onEvaluated']>>[0]> = [];
  worker.onEvaluated = (event) => {
    evaluated.push(event);
  };
  let intent = 0;
  const evaluate = async () => {
    const mark = evaluated.length;
    if (intent === 0) {
      worker.handleOpenDocument({
        documentId: 'doc',
        intent: intent++,
        file: createGeometryFile('model.mock'),
        parameters: options?.parameters ?? {},
        watch: false,
      });
    } else {
      worker.handleUpdateDocument({ documentId: 'doc', intent: intent++ });
    }
    await vi.waitFor(() => {
      expect(evaluated).toHaveLength(mark + 1);
    });
    expect(evaluated.at(-1), JSON.stringify(evaluated.at(-1))).toMatchObject({ success: true });
    return evaluated.at(-1)!;
  };
  const render = async () => {
    const rendered: Array<Parameters<NonNullable<KernelRuntimeWorker['onRendered']>>[0]> = [];
    worker.onRendered = (event) => {
      rendered.push(event);
    };
    worker.handleOpenView({
      documentId: 'doc',
      subscriptionId: `view-${intent}`,
      requestId: `render-${intent}`,
      view: 'model',
    });
    await vi.waitFor(() => {
      expect(rendered).toHaveLength(1);
    });
    return rendered[0]!;
  };
  return { worker, evaluate, render, counts, observed };
};

describe('kernel-worker hashing', () => {
  describe('document dependency identity', () => {
    it('returns a SHA-256 dependency hash on the rendering', async () => {
      const harness = await createHarness();
      await harness.evaluate();
      const rendered = await harness.render();
      expect(rendered.success).toBe(true);
      if (!rendered.success) {
        throw new Error('Expected rendering');
      }
      expect(rendered.hash).toMatch(/^[\da-f]{64}$/);
    });
    it('keeps the same dependency hash for the same inputs regardless of artifact bytes', async () => {
      const first = await createHarness({ label: 'first' });
      const second = await createHarness({ label: 'second' });
      await first.evaluate();
      await second.evaluate();
      const outputs = await Promise.all([first.render(), second.render()]);
      expect(outputs[0].success && outputs[0].hash).toBe(outputs[1].success && outputs[1].hash);
      expect(outputs[0].success && outputs[0].artifact.content).not.toBe(
        outputs[1].success && outputs[1].artifact.content,
      );
    });
    it('excludes non-mutating middleware from artifact and native-build identity', async () => {
      const observe: WrapEvaluateHook<Record<string, never>, Record<string, never>> = async (input, handler) =>
        handler(input);
      const observerSpy = vi.fn(observe);
      const observer = defineMiddleware({
        id: 'observer',
        name: 'Observer',
        mutates: false,
        wrapEvaluate: observerSpy,
      });
      const mutator = defineMiddleware({ id: 'mutator', name: 'Mutator', mutates: true, wrapEvaluate: observe });
      const base = await createHarness();
      const observed = await createHarness({ middleware: [observer()] });
      const mutated = await createHarness({ middleware: [mutator()] });
      await Promise.all([base.evaluate(), observed.evaluate(), mutated.evaluate()]);
      const identities = [
        artifactOf(base.worker).identity,
        artifactOf(observed.worker).identity,
        artifactOf(mutated.worker).identity,
      ] as const;
      expect(identities[0].dependencyHash).toBe(identities[1].dependencyHash);
      expect(identities[0].nativeHandleKey).toBe(identities[1].nativeHandleKey);
      expect(identities[2].dependencyHash).not.toBe(identities[0].dependencyHash);
      expect(identities[2].nativeHandleKey).not.toBe(identities[0].nativeHandleKey);
      expect(observerSpy).toHaveBeenCalledOnce();
    });
    it('forks native identity for every construction input', async () => {
      const firstBytes = new Uint8Array([1]);
      const secondBytes = new Uint8Array([2]);
      const digests = await Promise.all([sha256Bytes(firstBytes), sha256Bytes(secondBytes)]);
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn(
        async (input) => new Response(String(input).endsWith('second.wasm') ? secondBytes : firstBytes),
      );
      try {
        const asset = (index: number): RuntimeImplementationAsset => ({
          id: 'engine',
          url: `https://assets.example/${index === 0 ? 'first' : 'second'}.wasm`,
          sha256: digests[index]!,
        });
        const changes: HarnessOptions[] = [
          {},
          { source: 'changed source' },
          { imported: 'changed import' },
          { parameters: { radius: 20 } },
          { kernelVersion: '2.0.0' },
          { initOptions: { mode: 'alternate' } },
          { implementationAssets: [asset(1)] },
        ];
        const keys = await Promise.all(
          changes.map(async (change) => {
            const harness = await createHarness({
              parameters: { radius: 10 },
              implementationAssets: [asset(0)],
              ...change,
            });
            await harness.evaluate();
            return artifactOf(harness.worker).identity.nativeHandleKey;
          }),
        );
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
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
    it('does not reuse an evaluation when middleware changes the terminal build input', async () => {
      let token = 0;
      const dynamic = defineMiddleware({
        id: 'dynamic-input',
        name: 'Dynamic input',
        async wrapEvaluate(input, handler) {
          return handler({ ...input, options: { token: ++token } });
        },
      });
      const harness = await createHarness({ middleware: [dynamic()] });
      await harness.evaluate();
      await harness.evaluate();
      expect(harness.observed).toEqual([1, 2]);
      expect(harness.counts.evaluations).toBe(2);
    });
    it('runs response middleware once per reuse without retaining transformed issues', async () => {
      const decorated = defineMiddleware({
        id: 'decorate',
        name: 'Decorate',
        async wrapEvaluate(input, handler) {
          const result = await handler(input);
          return result.success
            ? {
                ...result,
                issues: [...result.issues, { code: 'RUNTIME', type: 'kernel', severity: 'warning', message: 'once' }],
              }
            : result;
        },
      });
      const harness = await createHarness({ middleware: [decorated()] });
      const first = await harness.evaluate();
      const second = await harness.evaluate();
      expect(first.issues.filter((issue) => issue.message === 'once')).toHaveLength(1);
      expect(second.issues.filter((issue) => issue.message === 'once')).toHaveLength(1);
      expect(harness.counts.evaluations).toBe(1);
    });
    it('does not assign terminal input to a middleware short-circuit handle', async () => {
      let label = 1;
      const middleware = defineMiddleware({
        id: 'short-circuit',
        name: 'Short circuit',
        async wrapEvaluate() {
          return worker.cachedEvaluation(String(label++));
        },
      });
      const harness = await createHarness({ middleware: [middleware()] });
      const { worker } = harness;
      await harness.evaluate();
      const first = await harness.render();
      await harness.evaluate();
      const second = await harness.render();
      expect(first).toMatchObject({
        success: true,
        artifact: { content: '<svg xmlns="http://www.w3.org/2000/svg"><text>1</text></svg>' },
      });
      expect(second).toMatchObject({
        success: true,
        artifact: { content: '<svg xmlns="http://www.w3.org/2000/svg"><text>2</text></svg>' },
      });
      expect(label).toBe(3);
      expect(artifactOf(worker).evaluationSlot?.nativeBuildInput).toBeUndefined();
    });
  });
  describe('implementation assets', () => {
    const originalFetch = globalThis.fetch;

    const createWorker = () => new AssetTestWorker({ runtime: defineRuntime({ kernels: [] }) });

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
        'Failed to load implementation asset replicad:engine: Failed to fetch WASM binary',
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

    it('should verify a Node file URL and still reject its wrong digest', async () => {
      const directory = await mkdtemp(join(tmpdir(), 'tau-runtime-asset-'));
      try {
        const bytes = new Uint8Array([4, 5, 6]);
        const path = join(directory, 'engine.wasm');
        await writeFile(path, bytes);
        const fileAsset = (sha256: string): RuntimeImplementationAsset => ({
          id: 'engine',
          url: pathToFileURL(path).href,
          sha256,
        });
        globalThis.fetch = vi.fn(() => {
          throw new Error('file assets must not use fetch in Node');
        });

        await expect(
          createWorker().verifyAssets('replicad', [fileAsset(await sha256Bytes(bytes))]),
        ).resolves.toBeUndefined();
        await expect(createWorker().verifyAssets('replicad', [fileAsset('0'.repeat(64))])).rejects.toThrow(
          'Implementation asset digest mismatch for replicad:engine',
        );
        expect(globalThis.fetch).not.toHaveBeenCalled();
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    });
  });
});
