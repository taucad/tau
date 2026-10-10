import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRealmResources } from '#framework/realm-resources.js';
import { KernelRuntimeWorker } from '#framework/kernel-runtime-worker.js';
import { attachRuntimePluginDefinition } from '#plugins/plugin-runtime-definition.js';
import { defineRuntime } from '#worker/runtime-definition.js';
import type { AnyKernelDefinitionV2 } from '#types/runtime-kernel-v2.types.js';
import type { KernelIssue } from '#types/runtime.types.js';
/* oxlint-disable no-restricted-imports, import/extensions -- Runtime-private white-box fixture stays outside the package build graph. */
import {
  createGeometryFile,
  initializeWorkerForTesting,
  seedTestFileSystem,
} from '../../test/support/kernel-worker.fixture.js';
/* oxlint-enable no-restricted-imports, import/extensions */

type Deferred<Value> = {
  readonly promise: Promise<Value>;
  resolve(value: Value): void;
  reject(error: unknown): void;
};

const deferred = <Value>(): Deferred<Value> => {
  let resolve!: (value: Value) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

describe('createRealmResources', () => {
  it('should create one value for two holders and dispose it on the last release', async () => {
    const realm = createRealmResources();
    const value = { heap: 'A' };
    const create = vi.fn(async () => value);
    const dispose = vi.fn();

    const first = await realm.hold({ group: 'occt', key: 'single:a.wasm', create, dispose });
    const second = await realm.hold({ group: 'occt', key: 'single:a.wasm', create, dispose });

    expect(create).toHaveBeenCalledOnce();
    expect(first.value).toBe(value);
    expect(second.value).toBe(value);

    first.release();
    expect(dispose).not.toHaveBeenCalled();
    second.release();
    expect(dispose).toHaveBeenCalledExactlyOnceWith(value);
  });

  it('should recreate the value after the last holder released it', async () => {
    const realm = createRealmResources();
    let generation = 0;
    const create = vi.fn(async () => ({ generation: ++generation }));

    const first = await realm.hold({ group: 'occt', key: 'single', create });
    first.release();
    const second = await realm.hold({ group: 'occt', key: 'single', create });

    expect(create).toHaveBeenCalledTimes(2);
    expect(first.value).toEqual({ generation: 1 });
    expect(second.value).toEqual({ generation: 2 });
  });

  it('should ignore a repeated release of one hold', async () => {
    const realm = createRealmResources();
    const dispose = vi.fn();
    const create = async (): Promise<string> => 'heap';

    const first = await realm.hold({ group: 'occt', key: 'single', create, dispose });
    const second = await realm.hold({ group: 'occt', key: 'single', create, dispose });
    first.release();
    first.release();

    expect(dispose).not.toHaveBeenCalled();
    second.release();
    second.release();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('should share one pending creation between concurrent holders', async () => {
    const realm = createRealmResources();
    const pending = deferred<{ heap: string }>();
    const create = vi.fn(async () => pending.promise);

    const holds = Promise.all([
      realm.hold({ group: 'occt', key: 'single', create }),
      realm.hold({ group: 'occt', key: 'single', create }),
    ]);
    pending.resolve({ heap: 'shared' });
    const [first, second] = await holds;

    expect(create).toHaveBeenCalledOnce();
    expect(first.value).toBe(second.value);
  });

  it('should let the next holder retry after a rejected creation', async () => {
    const realm = createRealmResources();
    const create = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('wasm init failed'))
      .mockResolvedValueOnce('heap');

    await expect(realm.hold({ group: 'occt', key: 'single', create })).rejects.toThrow('wasm init failed');
    const retried = await realm.hold({ group: 'occt', key: 'single', create });

    expect(create).toHaveBeenCalledTimes(2);
    expect(retried.value).toBe('heap');
  });

  it('should reject every concurrent holder of a rejected creation', async () => {
    const realm = createRealmResources();
    const pending = deferred<string>();
    const create = vi.fn(async () => pending.promise);

    const first = realm.hold({ group: 'occt', key: 'single', create });
    const second = realm.hold({ group: 'occt', key: 'single', create });
    pending.reject(new Error('wasm init failed'));

    await expect(first).rejects.toThrow('wasm init failed');
    await expect(second).rejects.toThrow('wasm init failed');
    expect(create).toHaveBeenCalledOnce();
  });

  it('should reject a different key for a held group with KERNEL_REALM_CONFLICT naming both keys', async () => {
    const realm = createRealmResources();
    const create = vi.fn(async () => 'heap');
    const held = await realm.hold({ group: 'replicad-occt', key: 'single:a.wasm', create });

    try {
      await realm.hold({ group: 'replicad-occt', key: 'multi:b.wasm', create });
      expect.fail('a second build of a held group should be refused');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      const { message, issues } = error as Error & { issues: KernelIssue[] };
      expect(message).toContain('"single:a.wasm"');
      expect(message).toContain('"multi:b.wasm"');
      expect(issues).toEqual([
        {
          code: 'KERNEL_REALM_CONFLICT',
          message,
          severity: 'error',
          type: 'kernel',
          details: { group: 'replicad-occt', heldKey: 'single:a.wasm', requestedKey: 'multi:b.wasm' },
        },
      ]);
    }

    expect(create).toHaveBeenCalledOnce();
    held.release();
    await expect(realm.hold({ group: 'replicad-occt', key: 'multi:b.wasm', create })).resolves.toMatchObject({
      value: 'heap',
    });
  });

  it('should keep groups independent', async () => {
    const realm = createRealmResources();
    const replicad = await realm.hold({ group: 'replicad-occt', key: 'single', create: async () => 'replicad' });
    const libcascade = await realm.hold({ group: 'libcascade-occt', key: 'full', create: async () => 'libcascade' });

    expect([replicad.value, libcascade.value]).toEqual(['replicad', 'libcascade']);
  });
});

// =============================================================================
// services.realm through the kernel worker
// =============================================================================

const workers: KernelRuntimeWorker[] = [];
const emptyParameterDeclaration = {
  schema: {
    $schema: 'https://json-structure.org/meta/extended/v0/#',
    $id: 'urn:taucad:test:realm-parameters',
    $uses: ['JSONSchemaUnits'],
    name: 'RealmParameters',
    type: 'object',
  },
  defaults: {},
} as const;

afterEach(async () => {
  await Promise.all(workers.splice(0).map(async (worker) => worker.cleanup()));
});

/** A kernel that holds one realm resource from `initialize` and releases it in `onDispose`. */
const createHoldingKernel = (create: () => Promise<object>): AnyKernelDefinitionV2 => ({
  id: 'realm-kernel',
  extensions: ['realm'],
  name: 'Realm kernel',
  version: '1.0.0',
  views: { display: { title: 'Display', mimeType: 'model/gltf-binary' } },
  exports: {},
  initialize: async (_options, services) => {
    const hold = await services.realm.hold({ group: 'realm-resources-test', key: 'v1', create });
    return { hold };
  },
  onDispose: async (context) => {
    (context as { hold: { release(): void } }).hold.release();
  },
  resolve: async ({ entryPath }) => ({ resolved: [entryPath], unresolved: [] }),
  describe: async () => ({ success: true, data: { parameters: emptyParameterDeclaration }, issues: [] }),
  evaluate: async (_input, _services, context) => ({ handle: context }),
  render: async () => ({ content: new Uint8Array([1]) }),
  export: async () => {
    throw new Error('The realm kernel declares no exports.');
  },
});

const startWorker = async (kernel: AnyKernelDefinitionV2): Promise<KernelRuntimeWorker> => {
  const runtime = defineRuntime({
    kernels: [attachRuntimePluginDefinition({ id: kernel.id, extensions: ['realm'] }, () => kernel)],
  });
  const worker = new KernelRuntimeWorker({ runtime });
  workers.push(worker);
  await initializeWorkerForTesting(worker);
  const evaluated = vi.fn();
  worker.onEvaluated = evaluated;
  worker.handleOpenDocument({
    documentId: 'realm-document',
    intent: 1,
    file: createGeometryFile('model.realm'),
    parameters: {},
    watch: false,
  });
  await vi.waitFor(() => {
    expect(evaluated).toHaveBeenCalledOnce();
  });
  expect(evaluated.mock.calls[0]![0]).toMatchObject({ success: true });
  return worker;
};

describe('services.realm', () => {
  it('should share one realm resource between two kernel workers and free it after both clean up', async () => {
    await seedTestFileSystem({ 'model.realm': 'realm' });
    const create = vi.fn(async () => ({ heap: 'shared' }));

    const first = await startWorker(createHoldingKernel(create));
    const second = await startWorker(createHoldingKernel(create));
    expect(create).toHaveBeenCalledOnce();

    await first.cleanup();
    await second.cleanup();
    await startWorker(createHoldingKernel(create));
    expect(create).toHaveBeenCalledTimes(2);
  });
});
