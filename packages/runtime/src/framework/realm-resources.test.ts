import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createRealmGroup, realmResources } from '#framework/realm-resources.js';
import { KernelRuntimeWorker } from '#framework/kernel-runtime-worker.js';
import { attachRuntimePluginDefinition, runtimePluginAbiVersion } from '#plugins/plugin-runtime-definition.js';
import { defineRuntime } from '#worker/runtime-definition.js';
import type { AnyKernelDefinitionV2 } from '#types/runtime-kernel-v2.types.js';
import { realmGroupState } from '#types/runtime-kernel.types.js';
import type { RealmGroup } from '#types/runtime-kernel.types.js';
import type { KernelIssue } from '#types/runtime.types.js';
/* oxlint-disable no-restricted-imports, import/extensions -- Runtime-private white-box fixture stays outside the package build graph. */
import {
  createGeometryFile,
  initializeWorkerForTesting,
  seedTestFileSystem,
} from '../../test/support/kernel-worker.fixture.js';
/* oxlint-enable no-restricted-imports, import/extensions */

let groupCount = 0;
/** A fresh token with a name no other test holds. */
const createTestGroup = <Value>(): RealmGroup<Value> => createRealmGroup<Value>(`realm-test-${++groupCount}`);

/** The issue a refused hold carries. */
const refusalIssue = async (hold: Promise<unknown>): Promise<KernelIssue> => {
  const error: unknown = await hold.then(
    () => undefined,
    (error: unknown) => error,
  );
  expect(error).toBeInstanceOf(Error);
  expect(error).toHaveProperty('issues');
  const { issues } = error as Error & { issues: KernelIssue[] };
  expect(issues).toHaveLength(1);
  return issues[0]!;
};

describe('realmResources', () => {
  it('should create one value for two holders and dispose it on the last release', async () => {
    const group = createTestGroup<{ heap: string }>();
    const value = { heap: 'A' };
    const create = vi.fn(async () => value);
    const dispose = vi.fn();

    const first = await realmResources.hold({ group, key: 'single:a.wasm', create, dispose });
    const second = await realmResources.hold({ group, key: 'single:a.wasm', create, dispose });

    expect(create).toHaveBeenCalledOnce();
    expect(first.value).toBe(value);
    expect(second.value).toBe(value);

    first.release();
    expect(dispose).not.toHaveBeenCalled();
    second.release();
    expect(dispose).toHaveBeenCalledExactlyOnceWith(value);
  });

  it('should recreate the value after the last holder released it', async () => {
    const group = createTestGroup<{ generation: number }>();
    let generation = 0;
    const create = vi.fn(async () => ({ generation: ++generation }));

    const first = await realmResources.hold({ group, key: 'single', create });
    first.release();
    const second = await realmResources.hold({ group, key: 'single', create });
    second.release();

    expect(create).toHaveBeenCalledTimes(2);
    expect(first.value).toEqual({ generation: 1 });
    expect(second.value).toEqual({ generation: 2 });
  });

  it('should ignore a repeated release of one hold', async () => {
    const group = createTestGroup<string>();
    const dispose = vi.fn();
    const create = async (): Promise<string> => 'heap';

    const first = await realmResources.hold({ group, key: 'single', create, dispose });
    const second = await realmResources.hold({ group, key: 'single', create, dispose });
    first.release();
    first.release();

    expect(dispose).not.toHaveBeenCalled();
    second.release();
    second.release();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('should share one pending creation between concurrent holders', async () => {
    const group = createTestGroup<{ heap: string }>();
    const pending = Promise.withResolvers<{ heap: string }>();
    const create = vi.fn(async () => pending.promise);

    const holds = Promise.all([
      realmResources.hold({ group, key: 'single', create }),
      realmResources.hold({ group, key: 'single', create }),
    ]);
    pending.resolve({ heap: 'shared' });
    const [first, second] = await holds;
    first.release();
    second.release();

    expect(create).toHaveBeenCalledOnce();
    expect(first.value).toBe(second.value);
  });

  it('should let the next holder retry after a rejected creation', async () => {
    const group = createTestGroup<string>();
    const create = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('wasm init failed'))
      .mockResolvedValueOnce('heap');

    await expect(realmResources.hold({ group, key: 'single', create })).rejects.toThrow('wasm init failed');
    const retried = await realmResources.hold({ group, key: 'single', create });
    retried.release();

    expect(create).toHaveBeenCalledTimes(2);
    expect(retried.value).toBe('heap');
  });

  it('should reject every concurrent holder of a rejected creation', async () => {
    const group = createTestGroup<string>();
    const pending = Promise.withResolvers<string>();
    const create = vi.fn(async () => pending.promise);

    const first = realmResources.hold({ group, key: 'single', create });
    const second = realmResources.hold({ group, key: 'single', create });
    pending.reject(new Error('wasm init failed'));

    await expect(first).rejects.toThrow('wasm init failed');
    await expect(second).rejects.toThrow('wasm init failed');
    expect(create).toHaveBeenCalledOnce();
  });

  it('should refuse a different key for a held group with KERNEL_REALM_CONFLICT for reason build', async () => {
    const group = createRealmGroup<string>('replicad-occt');
    const create = vi.fn(async () => 'heap');
    const held = await realmResources.hold({ group, key: 'single:a.wasm', create });

    const issue = await refusalIssue(realmResources.hold({ group, key: 'multi:b.wasm', create }));

    expect(issue).toEqual({
      code: 'KERNEL_REALM_CONFLICT',
      message: 'This realm already holds "single:a.wasm" for "replicad-occt" and cannot also hold "multi:b.wasm".',
      severity: 'error',
      type: 'kernel',
      details: { reason: 'build', group: 'replicad-occt', heldKey: 'single:a.wasm', requestedKey: 'multi:b.wasm' },
    });
    expect(create).toHaveBeenCalledOnce();
    held.release();
    const rebuilt = await realmResources.hold({ group, key: 'multi:b.wasm', create });
    rebuilt.release();
    expect(rebuilt.value).toBe('heap');
  });

  it('should let a different key proceed once a pending creation fails', async () => {
    const group = createTestGroup<string>();
    const pending = Promise.withResolvers<string>();

    const settled = Promise.allSettled([
      realmResources.hold({ group, key: 'single', create: async () => pending.promise }),
      realmResources.hold({ group, key: 'multi', create: async () => 'multi heap' }),
    ]);
    pending.reject(new Error('wasm init failed'));
    const [first, second] = await settled;

    expect(first).toMatchObject({ status: 'rejected', reason: new Error('wasm init failed') });
    expect(second).toMatchObject({ status: 'fulfilled', value: { value: 'multi heap' } });
  });

  it('should refuse a different key once a pending creation succeeds', async () => {
    const group = createTestGroup<string>();
    const pending = Promise.withResolvers<string>();
    const create = vi.fn(async () => 'multi heap');

    const settled = Promise.allSettled([
      realmResources.hold({ group, key: 'single', create: async () => pending.promise }),
      realmResources.hold({ group, key: 'multi', create }),
    ]);
    pending.resolve('single heap');
    const [first, second] = await settled;

    expect(first).toMatchObject({ status: 'fulfilled', value: { value: 'single heap' } });
    expect(second).toMatchObject({
      status: 'rejected',
      reason: { issues: [{ code: 'KERNEL_REALM_CONFLICT', details: { reason: 'build' } }] },
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('should keep groups independent', async () => {
    const replicadGroup = createTestGroup<string>();
    const libcascadeGroup = createTestGroup<string>();
    const replicad = await realmResources.hold({ group: replicadGroup, key: 'single', create: async () => 'replicad' });
    const libcascade = await realmResources.hold({
      group: libcascadeGroup,
      key: 'full',
      create: async () => 'libcascade',
    });
    replicad.release();
    libcascade.release();

    expect([replicad.value, libcascade.value]).toEqual(['replicad', 'libcascade']);
  });

  it('should refuse a second token of a held name for reason declaration and free the name after release', async () => {
    const group = createRealmGroup<string>('duplicate-declaration');
    const impostor = createRealmGroup<number>('duplicate-declaration');
    const create = vi.fn(async () => 1);
    const held = await realmResources.hold({ group, key: 'single', create: async () => 'heap' });

    const issue = await refusalIssue(realmResources.hold({ group: impostor, key: 'single', create }));

    expect(issue).toEqual({
      code: 'KERNEL_REALM_CONFLICT',
      message: 'Another declaration of realm group "duplicate-declaration" already holds its instance in this realm.',
      severity: 'error',
      type: 'kernel',
      details: { reason: 'declaration', group: 'duplicate-declaration' },
    });
    expect(create).not.toHaveBeenCalled();
    held.release();
    const freed = await realmResources.hold({ group: impostor, key: 'single', create });
    freed.release();
    expect(freed.value).toBe(1);
  });

  it('should refuse a token made by another runtime ABI for reason runtime', async () => {
    const foreignAbi = runtimePluginAbiVersion + 1;
    const foreign: RealmGroup<string> = {
      name: 'foreign-token',
      [realmGroupState]: { abi: foreignAbi, entry: undefined },
    };
    const create = vi.fn(async () => 'heap');

    const issue = await refusalIssue(realmResources.hold({ group: foreign, key: 'single', create }));

    expect(issue).toEqual({
      code: 'KERNEL_REALM_CONFLICT',
      message: `This realm's shared resources belong to @taucad/runtime plugin ABI ${foreignAbi}; this copy speaks ABI ${runtimePluginAbiVersion}.`,
      severity: 'error',
      type: 'kernel',
      details: { reason: 'runtime', heldAbi: foreignAbi, requestedAbi: runtimePluginAbiVersion },
    });
    expect(create).not.toHaveBeenCalled();
  });

  describe('with foreign realm state', () => {
    const directoryKey = Symbol.for('@taucad/runtime/realm-resources');
    let occupant: unknown;

    beforeEach(() => {
      occupant = Reflect.get(globalThis, directoryKey);
    });

    afterEach(() => {
      Reflect.set(globalThis, directoryKey, occupant);
    });

    it('should refuse a hold when another runtime ABI wrote the realm directory, for reason runtime', async () => {
      const foreignAbi = runtimePluginAbiVersion - 1;
      Reflect.set(globalThis, directoryKey, { abi: foreignAbi, holders: new Map() });
      const create = vi.fn(async () => 'heap');

      const issue = await refusalIssue(
        realmResources.hold({ group: createTestGroup<string>(), key: 'single', create }),
      );

      expect(issue).toMatchObject({
        code: 'KERNEL_REALM_CONFLICT',
        message: `This realm's shared resources belong to @taucad/runtime plugin ABI ${foreignAbi}; this copy speaks ABI ${runtimePluginAbiVersion}.`,
        details: { reason: 'runtime', heldAbi: foreignAbi, requestedAbi: runtimePluginAbiVersion },
      });
      expect(create).not.toHaveBeenCalled();
    });

    it('should refuse a hold when something other than a realm directory occupies its key, for reason runtime', async () => {
      // The shape an unstamped runtime copy left there: a registry object with its own `hold`.
      Reflect.set(globalThis, directoryKey, { hold: async () => undefined });
      const create = vi.fn(async () => 'heap');

      const issue = await refusalIssue(
        realmResources.hold({ group: createTestGroup<string>(), key: 'single', create }),
      );

      expect(issue).toEqual({
        code: 'KERNEL_REALM_CONFLICT',
        message: `This realm's shared resources were not written by @taucad/runtime plugin ABI ${runtimePluginAbiVersion}.`,
        severity: 'error',
        type: 'kernel',
        details: { reason: 'runtime', requestedAbi: runtimePluginAbiVersion },
      });
      expect(create).not.toHaveBeenCalled();
    });
  });

  it("should share one token's instance between two copies of the runtime module in one realm", async () => {
    const create = vi.fn(async () => 'heap');
    const first = await import('#framework/realm-resources.js');
    vi.resetModules();
    const second = await import('#framework/realm-resources.js');
    const group = first.createRealmGroup<string>('duplicate-copies');

    const held = await first.realmResources.hold({ group, key: 'single', create });
    const shared = await second.realmResources.hold({ group, key: 'single', create });
    const impostor = await refusalIssue(
      second.realmResources.hold({ group: second.createRealmGroup<string>('duplicate-copies'), key: 'single', create }),
    );
    held.release();
    shared.release();

    expect(create).toHaveBeenCalledOnce();
    expect(shared.value).toBe(held.value);
    expect(impostor.details).toEqual({ reason: 'declaration', group: 'duplicate-copies' });
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
const createHoldingKernel = (
  group: RealmGroup<Record<string, unknown>>,
  create: () => Promise<Record<string, unknown>>,
  key = 'v1',
): AnyKernelDefinitionV2 => ({
  id: 'realm-kernel',
  extensions: ['realm'],
  name: 'Realm kernel',
  version: '1.0.0',
  views: { display: { title: 'Display', mimeType: 'model/gltf-binary' } },
  exports: {},
  initialize: async (_options, services) => {
    const hold = await services.realm.hold({ group, key, create });
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
    const group = createRealmGroup<Record<string, unknown>>('realm-resources-test');
    const create = vi.fn(async () => ({ heap: 'shared' }));

    const first = await startWorker(createHoldingKernel(group, create));
    await expect(openDocument(first)).resolves.toMatchObject({ success: true });
    const second = await startWorker(createHoldingKernel(group, create));
    await expect(openDocument(second)).resolves.toMatchObject({ success: true });
    expect(create).toHaveBeenCalledOnce();

    await first.cleanup();
    await second.cleanup();
    const third = await startWorker(createHoldingKernel(group, create));
    await expect(openDocument(third)).resolves.toMatchObject({ success: true });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('should report a second build of a held group to the client as KERNEL_REALM_CONFLICT', async () => {
    await seedTestFileSystem({ 'model.realm': 'realm' });
    const group = createRealmGroup<Record<string, unknown>>('realm-resources-test');
    const create = vi.fn(async () => ({ heap: 'shared' }));

    await expect(openDocument(await startWorker(createHoldingKernel(group, create, 'single')))).resolves.toMatchObject({
      success: true,
    });
    const refused = await openDocument(await startWorker(createHoldingKernel(group, create, 'multi')));

    expect(refused).toMatchObject({
      success: false,
      issues: [
        {
          code: 'KERNEL_REALM_CONFLICT',
          details: {
            reason: 'build',
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
      ...createHoldingKernel(createTestGroup(), async () => ({})),
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
      ...createHoldingKernel(createTestGroup(), async () => ({})),
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
      ...createHoldingKernel(createTestGroup(), async () => ({})),
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
      ...createHoldingKernel(createTestGroup(), async () => ({})),
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
