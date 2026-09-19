// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChangeEventBus, MountTable, ProviderRegistry, ResourceQueue, WorkspaceFileService } from '@taucad/filesystem';
import { populateBundledTypesMount } from '#machines/bundled-types-mount.js';
import type { BundledTypesPayload } from '#machines/bundled-types-mount.js';
import { bundledTypesSentinelPath, ensureBundledTypesMount } from '#machines/bundled-types-sentinel.js';

const payload: BundledTypesPayload = [
  { packageName: 'replicad', content: 'export declare const a: 1;' },
  { packageName: '@jscad/modeling', content: 'export declare const b: 2;' },
];

/**
 * @param nodeModulesBasePath - Provider base path of the `/node_modules` mount,
 *   mirroring the worker's OPFS `tau-node-modules` mount. A provider base path
 *   is rooted, so it carries no leading slash (`assertRootedPath`,
 *   `1c6436dfa`). (`service.mount` itself pins that prefix to the OPFS backend,
 *   which does not exist under vitest, so the mount table is loaded directly.)
 */
const createService = async (nodeModulesBasePath = 'tau-node-modules'): Promise<WorkspaceFileService> => {
  const providerRegistry = new ProviderRegistry();
  const scope = { backend: 'memory', storageRootKey: 'memory:sentinel-test' } as const;
  const provider = await providerRegistry.getProvider(scope);
  const mountTable = new MountTable();
  mountTable.mount('/', provider, { ...scope, class: 'authored' });
  const nodeModulesScope = { backend: 'memory', storageRootKey: 'memory:sentinel-node-modules' } as const;
  mountTable.mount('/node_modules', await providerRegistry.getProvider(nodeModulesScope), {
    ...nodeModulesScope,
    providerBasePath: nodeModulesBasePath,
    class: 'derived',
  });
  return new WorkspaceFileService({
    providerRegistry,
    resourceQueue: new ResourceQueue(),
    eventBus: new ChangeEventBus(),
    mountTable,
  });
};

const readText = async (service: WorkspaceFileService, path: string): Promise<string> => {
  const content = await service.readFile(path, 'utf8');
  return typeof content === 'string' ? content : new TextDecoder().decode(content);
};

describe('ensureBundledTypesMount against the real WorkspaceFileService', () => {
  let service: WorkspaceFileService;
  const populate = vi.fn(async (entries: BundledTypesPayload) =>
    populateBundledTypesMount(service.createRootedFileSystem('/node_modules'), entries),
  );

  beforeEach(async () => {
    service = await createService();
    populate.mockClear();
  });

  afterEach(() => {
    service.dispose();
  });

  it('stamps the mount through the service mutation boundary', async () => {
    await expect(ensureBundledTypesMount(service, payload, { populate })).resolves.toBe('populated');

    await expect(readText(service, '/node_modules/replicad/index.d.ts')).resolves.toBe('export declare const a: 1;');
    await expect(readText(service, '/node_modules/@jscad/modeling/index.d.ts')).resolves.toBe(
      'export declare const b: 2;',
    );
    await expect(readText(service, bundledTypesSentinelPath)).resolves.toBeTypeOf('string');
  });

  it('skips a second boot with the same payload', async () => {
    await ensureBundledTypesMount(service, payload, { populate });
    populate.mockClear();

    await expect(ensureBundledTypesMount(service, payload, { populate })).resolves.toBe('skipped');
    expect(populate).not.toHaveBeenCalled();
  });

  it('repopulates after the payload changes', async () => {
    await ensureBundledTypesMount(service, payload, { populate });

    await expect(
      ensureBundledTypesMount(service, [{ packageName: 'replicad', content: 'export declare const a: 2;' }], {
        populate,
      }),
    ).resolves.toBe('populated');
    await expect(readText(service, '/node_modules/replicad/index.d.ts')).resolves.toBe('export declare const a: 2;');
    await expect(ensureBundledTypesMount(service, payload, { populate })).resolves.toBe('populated');
  });

  it('stamps a /node_modules sub-mount whose provider base path is its own', async () => {
    // The handle follows the mount's provider base path rather than assuming
    // one, so the stamp survives that indirection wherever the mount points.
    service.dispose();
    service = await createService('some-other-node-modules');

    await expect(ensureBundledTypesMount(service, payload, { populate })).resolves.toBe('populated');
    await expect(readText(service, '/node_modules/replicad/index.d.ts')).resolves.toBe('export declare const a: 1;');
    await expect(readText(service, bundledTypesSentinelPath)).resolves.toBeTypeOf('string');
    await expect(ensureBundledTypesMount(service, payload, { populate })).resolves.toBe('skipped');
  });

  it('still delivers the declarations when the stamp itself cannot be written', async () => {
    // A stamp the mount rejects must degrade to pre-sentinel behaviour — a
    // rewrite every boot — never to a mount without declarations.
    const rejectStamp = vi.fn(async (entries: BundledTypesPayload) => {
      if (entries.some((entry) => entry.packageName === 'tau-bundled-types')) {
        throw new TypeError('Invalid bundled type package root');
      }
      await populateBundledTypesMount(service.createRootedFileSystem('/node_modules'), entries);
    });

    await expect(ensureBundledTypesMount(service, payload, { populate: rejectStamp })).resolves.toBe('populated');
    await expect(readText(service, '/node_modules/replicad/index.d.ts')).resolves.toBe('export declare const a: 1;');
    await expect(ensureBundledTypesMount(service, payload, { populate: rejectStamp })).resolves.toBe('populated');
  });
});
