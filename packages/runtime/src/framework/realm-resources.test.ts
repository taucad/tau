import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
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
    const pending = Promise.withResolvers<{ heap: string }>();
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
    const pending = Promise.withResolvers<string>();
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
      expect(message).toBe(
        'This realm already holds "single:a.wasm" for "replicad-occt" and cannot also hold "multi:b.wasm".',
      );
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

  it('should let a different key proceed once a pending creation fails', async () => {
    const realm = createRealmResources();
    const pending = Promise.withResolvers<string>();

    const settled = Promise.allSettled([
      realm.hold({ group: 'occt', key: 'single', create: async () => pending.promise }),
      realm.hold({ group: 'occt', key: 'multi', create: async () => 'multi heap' }),
    ]);
    pending.reject(new Error('wasm init failed'));
    const [first, second] = await settled;

    expect(first).toMatchObject({ status: 'rejected', reason: new Error('wasm init failed') });
    expect(second).toMatchObject({ status: 'fulfilled', value: { value: 'multi heap' } });
  });

  it('should refuse a different key once a pending creation succeeds', async () => {
    const realm = createRealmResources();
    const pending = Promise.withResolvers<string>();
    const create = vi.fn(async () => 'multi heap');

    const settled = Promise.allSettled([
      realm.hold({ group: 'occt', key: 'single', create: async () => pending.promise }),
      realm.hold({ group: 'occt', key: 'multi', create }),
    ]);
    pending.resolve('single heap');
    const [first, second] = await settled;

    expect(first).toMatchObject({ status: 'fulfilled', value: { value: 'single heap' } });
    expect(second).toMatchObject({ status: 'rejected', reason: { issues: [{ code: 'KERNEL_REALM_CONFLICT' }] } });
    expect(create).not.toHaveBeenCalled();
  });

  it('should share holds between two copies of the runtime module in one realm', async () => {
    const create = vi.fn(async () => 'heap');
    const first = await import('#framework/realm-resources.js');
    vi.resetModules();
    const second = await import('#framework/realm-resources.js');

    const held = await first.realmResources.hold({ group: 'duplicate-copies', key: 'single', create });
    const shared = await second.realmResources.hold({ group: 'duplicate-copies', key: 'single', create });
    held.release();
    shared.release();

    expect(create).toHaveBeenCalledOnce();
    expect(shared.value).toBe(held.value);
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
const createHoldingKernel = (create: () => Promise<Record<string, unknown>>, key = 'v1'): AnyKernelDefinitionV2 => ({
  id: 'realm-kernel',
  extensions: ['realm'],
  name: 'Realm kernel',
  version: '1.0.0',
  views: { display: { title: 'Display', mimeType: 'model/gltf-binary' } },
  exports: {},
  initialize: async (_options, services) => {
    const hold = await services.realm.hold({ group: 'realm-resources-test', key, create });
    return { hold };
  },
  onDispose: async (context) => {
    (context as { hold: { release(): void } }).hold.release();
  },
  resolve: async ({ entryPath }) => ({ resolved: [entryPath], unresolved: [] }),
  describe: async () => ({ success: true, data: { parameters: emptyParameterDeclaration }, issues: [] }),
  evaluate: async (_input, _services, context) => ({ handle: context as unknown }),
  render: async () => ({ content: new Uint8Array([1]) }),
  export: async () => {
    throw new Error('The realm kernel declares no exports.');
  },
});

const openDocument = async (worker: KernelRuntimeWorker): Promise<unknown> => {
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
  return evaluated.mock.calls[0]![0] as unknown;
};

const startWorker = async (kernel: AnyKernelDefinitionV2, id = 'realm-kernel'): Promise<KernelRuntimeWorker> => {
  const runtime = defineRuntime({
    kernels: [attachRuntimePluginDefinition({ id, extensions: ['realm'] }, () => kernel)],
  });
  const worker = new KernelRuntimeWorker({ runtime });
  workers.push(worker);
  await initializeWorkerForTesting(worker);
  return worker;
};

describe('services.realm', () => {
  it('should share one realm resource between two kernel workers and free it after both clean up', async () => {
    await seedTestFileSystem({ 'model.realm': 'realm' });
    const create = vi.fn(async () => ({ heap: 'shared' }));

    const first = await startWorker(createHoldingKernel(create));
    await expect(openDocument(first)).resolves.toMatchObject({ success: true });
    const second = await startWorker(createHoldingKernel(create));
    await expect(openDocument(second)).resolves.toMatchObject({ success: true });
    expect(create).toHaveBeenCalledOnce();

    await first.cleanup();
    await second.cleanup();
    const third = await startWorker(createHoldingKernel(create));
    await expect(openDocument(third)).resolves.toMatchObject({ success: true });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('should report a second build of a held group to the client as KERNEL_REALM_CONFLICT', async () => {
    await seedTestFileSystem({ 'model.realm': 'realm' });
    const create = vi.fn(async () => ({ heap: 'shared' }));

    await expect(openDocument(await startWorker(createHoldingKernel(create, 'single')))).resolves.toMatchObject({
      success: true,
    });
    const refused = await openDocument(await startWorker(createHoldingKernel(create, 'multi')));

    expect(refused).toMatchObject({
      success: false,
      issues: [
        {
          code: 'KERNEL_REALM_CONFLICT',
          details: {
            group: 'realm-resources-test',
            heldKey: 'single',
            requestedKey: 'multi',
            producer: 'realm-kernel',
          },
        },
      ],
    });
    expect((refused as { issues: KernelIssue[] }).issues[0]!.message).toContain('"single"');
    expect(create).toHaveBeenCalledOnce();
  });

  it('should name each refusing kernel without stamping a shared initialise error', async () => {
    await seedTestFileSystem({ 'model.realm': 'realm' });
    const issue: KernelIssue = {
      code: 'KERNEL_BINDING_FAILED',
      message: 'shared failure',
      severity: 'error',
      type: 'kernel',
    };
    const shared = Object.assign(new Error('shared failure'), { issues: [issue] });
    const refusing = (id: string): AnyKernelDefinitionV2 => ({
      ...createHoldingKernel(async () => ({})),
      id,
      initialize: async () => {
        throw shared;
      },
    });

    const first = await openDocument(await startWorker(refusing('kernel-a'), 'kernel-a'));
    const second = await openDocument(await startWorker(refusing('kernel-b'), 'kernel-b'));

    expect(first).toMatchObject({ success: false, issues: [{ details: { producer: 'kernel-a' } }] });
    expect(second).toMatchObject({ success: false, issues: [{ details: { producer: 'kernel-b' } }] });
    expect(shared.issues).toEqual([issue]);
  });

  it('should report a ZodError thrown by initialize as a well-formed KERNEL_BINDING_FAILED issue', async () => {
    await seedTestFileSystem({ 'model.realm': 'realm' });
    const failure = z.object({ wasmUrl: z.string() }).safeParse({}).error;
    const kernel: AnyKernelDefinitionV2 = {
      ...createHoldingKernel(async () => ({})),
      initialize: async () => {
        throw failure ?? new Error('The fixture schema accepted its input.');
      },
    };

    const refused = await openDocument(await startWorker(kernel));

    expect(refused).toEqual(
      expect.objectContaining({
        success: false,
        issues: [{ message: failure?.message, code: 'KERNEL_BINDING_FAILED', type: 'kernel', severity: 'error' }],
      }),
    );
  });

  it('should keep a realm conflict that arrives beside a foreign row', async () => {
    await seedTestFileSystem({ 'model.realm': 'realm' });
    const conflict: KernelIssue = {
      code: 'KERNEL_REALM_CONFLICT',
      message: 'This realm already holds "single" for "realm-resources-test" and cannot also hold "multi".',
      severity: 'error',
      type: 'kernel',
      details: { group: 'realm-resources-test', heldKey: 'single', requestedKey: 'multi' },
    };
    const foreign = { code: 'invalid_type', message: 'Invalid input', path: ['wasmUrl'] };
    const kernel: AnyKernelDefinitionV2 = {
      ...createHoldingKernel(async () => ({})),
      initialize: async () => {
        throw Object.assign(new Error(conflict.message), { issues: [conflict, foreign] });
      },
    };

    const refused = await openDocument(await startWorker(kernel));

    expect(refused).toEqual(
      expect.objectContaining({
        success: false,
        issues: [
          {
            ...conflict,
            details: {
              producer: 'realm-kernel',
              group: 'realm-resources-test',
              heldKey: 'single',
              requestedKey: 'multi',
            },
          },
        ],
      }),
    );
  });

  it('should name the refusing kernel when initialize rejects with a non-Error carrying kernel issues', async () => {
    await seedTestFileSystem({ 'model.realm': 'realm' });
    const conflict: KernelIssue = {
      code: 'KERNEL_REALM_CONFLICT',
      message: 'This realm already holds "single" for "realm-resources-test" and cannot also hold "multi".',
      severity: 'error',
      type: 'kernel',
    };
    const kernel: AnyKernelDefinitionV2 = {
      ...createHoldingKernel(async () => ({})),
      initialize: async () => {
        // oxlint-disable-next-line typescript/only-throw-error -- a kernel may reject with any value; this one carries issues.
        throw { issues: [conflict] };
      },
    };

    const refused = await openDocument(await startWorker(kernel));

    expect(refused).toEqual(
      expect.objectContaining({
        success: false,
        issues: [{ ...conflict, details: { producer: 'realm-kernel' } }],
      }),
    );
  });
});
