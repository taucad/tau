// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChangeEventBus, MountTable, ProviderRegistry, ResourceQueue, WorkspaceFileService } from '@taucad/filesystem';
import type { WatchEvent } from '@taucad/filesystem';
import { populateBundledTypesMount } from '#machines/bundled-types-mount.js';
import type { BundledTypesRoot } from '#machines/bundled-types-mount.js';

const decoder = new TextDecoder();

/**
 * The live worker mounts `/node_modules` on its own OPFS provider and installs
 * through a rooted handle on it; a memory provider under the same route is the
 * same composition.
 *
 * @param providerRegistry - Shared registry, so two services can contend for one physical root.
 * @returns A service whose `/node_modules` route is its own mount.
 */
async function createService(providerRegistry = new ProviderRegistry()): Promise<WorkspaceFileService> {
  const provider = await providerRegistry.getProvider({ backend: 'memory', storageRootKey: 'memory:test-root' });
  const mountTable = new MountTable();
  mountTable.mount('/', provider, { class: 'authored', backend: 'memory', storageRootKey: 'memory:test-root' });
  const nodeModulesScope = { backend: 'memory', storageRootKey: 'memory:test-node-modules' } as const;
  mountTable.mount('/node_modules', await providerRegistry.getProvider(nodeModulesScope), {
    ...nodeModulesScope,
    providerBasePath: 'tau-node-modules',
    class: 'derived',
  });
  return new WorkspaceFileService({
    providerRegistry,
    resourceQueue: new ResourceQueue(),
    eventBus: new ChangeEventBus(),
    mountTable,
  });
}

/** The trusted installer handle for one service's `/node_modules` route. */
const nodeModulesOf = (service: WorkspaceFileService): BundledTypesRoot =>
  service.createRootedFileSystem('/node_modules');

describe('populateBundledTypesMount', () => {
  let service: WorkspaceFileService;
  let nodeModules: BundledTypesRoot;

  beforeEach(async () => {
    service = await createService();
    nodeModules = nodeModulesOf(service);
  });

  afterEach(() => {
    service.dispose();
    vi.unstubAllGlobals();
  });

  it('should write index.d.ts and package.json under /node_modules/<pkg>/', async () => {
    await populateBundledTypesMount(nodeModules, [{ packageName: 'replicad', content: 'export declare const x: 1;' }]);

    const dts = await service.readFile('/node_modules/replicad/index.d.ts');
    expect(typeof dts === 'string' ? dts : decoder.decode(dts)).toBe('export declare const x: 1;');

    const packageJsonRead = await service.readFile('/node_modules/replicad/package.json');
    const packageJsonText = typeof packageJsonRead === 'string' ? packageJsonRead : decoder.decode(packageJsonRead);
    expect(packageJsonText).toBe('{\n  "name": "replicad",\n  "types": "index.d.ts"\n}');
    expect(JSON.parse(packageJsonText)).toEqual({ name: 'replicad', types: 'index.d.ts' });
  });

  it('should replace stale files inside a payload-owned package root', async () => {
    await populateBundledTypesMount(nodeModules, [
      { packageName: 'replaced', content: 'old', files: { 'stale.d.ts': 'stale' } },
      { packageName: 'unrelated', content: 'preserved' },
    ]);
    const events: WatchEvent[] = [];
    const stop = service.watch({ paths: ['/node_modules/replaced/stale.d.ts'] }, (event) => events.push(event));

    await populateBundledTypesMount(nodeModules, [{ packageName: 'replaced', content: 'export {}' }]);

    await expect(service.exists('/node_modules/replaced/stale.d.ts')).resolves.toBe(false);
    await expect(service.readFile('/node_modules/replaced/index.d.ts', 'utf8')).resolves.toBe('export {}');
    await expect(service.readFile('/node_modules/unrelated/index.d.ts', 'utf8')).resolves.toBe('preserved');
    expect(events).toEqual([{ type: 'reset' }]);
    stop();
  });

  it('should write scoped and unscoped subpath declarations beneath one package root', async () => {
    await populateBundledTypesMount(nodeModules, [
      {
        packageName: '@jscad/modeling',
        content: 'export type Geometry = unknown;',
        files: { 'colors/index.d.ts': 'export declare const colorize: unknown;' },
      },
      {
        packageName: 'manifold-3d',
        content: 'export declare class Manifold {}',
        files: { 'manifoldCAD/index.d.ts': 'export declare const manifoldCAD: unknown;' },
      },
    ]);

    await expect(service.readFile('/node_modules/@jscad/modeling/index.d.ts', 'utf8')).resolves.toBe(
      'export type Geometry = unknown;',
    );
    await expect(service.readFile('/node_modules/@jscad/modeling/colors/index.d.ts', 'utf8')).resolves.toBe(
      'export declare const colorize: unknown;',
    );
    await expect(service.readFile('/node_modules/manifold-3d/index.d.ts', 'utf8')).resolves.toBe(
      'export declare class Manifold {}',
    );
    await expect(service.readFile('/node_modules/manifold-3d/manifoldCAD/index.d.ts', 'utf8')).resolves.toBe(
      'export declare const manifoldCAD: unknown;',
    );

    const jscadPackageJson = await service.readFile('/node_modules/@jscad/modeling/package.json', 'utf8');
    const manifoldPackageJson = await service.readFile('/node_modules/manifold-3d/package.json', 'utf8');
    if (typeof jscadPackageJson !== 'string' || typeof manifoldPackageJson !== 'string') {
      throw new TypeError('Expected bundled package metadata to be text.');
    }
    expect(JSON.parse(jscadPackageJson)).toEqual({ name: '@jscad/modeling', types: 'index.d.ts' });
    expect(JSON.parse(manifoldPackageJson)).toEqual({ name: 'manifold-3d', types: 'index.d.ts' });
    await expect(service.exists('/node_modules/@jscad/modeling/colors/package.json')).resolves.toBe(false);
    await expect(service.exists('/node_modules/manifold-3d/manifoldCAD/package.json')).resolves.toBe(false);
  });

  it.each([
    {
      entry: { packageName: '../escape', content: 'export {}' },
      message: 'Invalid package name: "../escape"',
    },
    {
      entry: { packageName: '@jscad/modeling/colors', content: 'export {}' },
      message: 'Invalid package name: "@jscad/modeling/colors"',
    },
    {
      entry: { packageName: 'manifold-3d/manifoldCAD', content: 'export {}' },
      message: 'Invalid package name: "manifold-3d/manifoldCAD"',
    },
    {
      entry: { packageName: 'safe', content: 'export {}', files: { '../escape.d.ts': 'export {}' } },
      message: 'Invalid bundled type path: "../escape.d.ts"',
    },
  ])('should reject invalid cache inputs before any filesystem access', async ({ entry, message }) => {
    const writeSpy = vi.spyOn(nodeModules, 'writeFiles');

    try {
      await populateBundledTypesMount(nodeModules, [{ packageName: 'valid', content: 'export {}' }, entry]);
      expect.fail('populateBundledTypesMount should reject invalid package input');
    } catch (error) {
      expect(error).toBeInstanceOf(TypeError);
      expect((error as Error).message).toBe(message);
    }

    expect(writeSpy).not.toHaveBeenCalled();
  });

  it.each<{ name: string; files: Record<string, string> }>([
    {
      name: 'a file and punctuation-interposed descendant',
      files: {
        leaf: 'file',
        'leaf!/sibling.d.ts': 'punctuation',
        'leaf/child.d.ts': 'descendant',
      },
    },
    {
      name: 'a package.json descendant separated by punctuation',
      files: {
        'package.json!/sibling.d.ts': 'punctuation',
        'package.json/child.d.ts': 'descendant',
      },
    },
    {
      name: 'an index.d.ts descendant separated by punctuation',
      files: {
        'index.d.ts!/sibling.d.ts': 'punctuation',
        'index.d.ts/child.d.ts': 'descendant',
      },
    },
  ])('should reject $name before any filesystem access', async ({ files }) => {
    const writeSpy = vi.spyOn(nodeModules, 'writeFiles');

    await expect(
      populateBundledTypesMount(nodeModules, [{ packageName: 'collision', content: 'export {};', files }]),
    ).rejects.toThrow('ancestor');

    expect(writeSpy).not.toHaveBeenCalled();
  });

  it('should materialize cyclic package metadata before replacing prior bytes', async () => {
    await populateBundledTypesMount(nodeModules, [
      { packageName: 'cyclic', content: 'old', files: { 'old.d.ts': 'old' } },
    ]);
    const packageJson: Record<string, unknown> = {};
    packageJson['self'] = packageJson;
    const writeSpy = vi.spyOn(nodeModules, 'writeFiles');

    await expect(
      populateBundledTypesMount(nodeModules, [{ packageName: 'cyclic', content: 'new', packageJson }]),
    ).rejects.toThrow(/circular/i);

    expect(writeSpy).not.toHaveBeenCalled();
    await expect(service.readFile('/node_modules/cyclic/old.d.ts', 'utf8')).resolves.toBe('old');
  });

  it('should serialize independent authorities into one complete package generation', async () => {
    const tails = new Map<string, Promise<void>>();
    const request = async <T>(name: string, _options: LockOptions, callback: () => Promise<T>): Promise<T> => {
      const predecessor = tails.get(name) ?? Promise.resolve();
      const completion = Promise.withResolvers<void>();
      tails.set(name, completion.promise);
      await predecessor;
      try {
        return await callback();
      } finally {
        completion.resolve();
        if (tails.get(name) === completion.promise) {
          tails.delete(name);
        }
      }
    };
    vi.stubGlobal('navigator', { locks: { request } });

    const registry = new ProviderRegistry();
    service.dispose();
    const first = await createService(registry);
    const second = await createService(registry);
    service = first;

    await Promise.all([
      populateBundledTypesMount(nodeModulesOf(first), [
        { packageName: 'race', content: 'first', files: { 'first.d.ts': 'first-extra' } },
      ]),
      populateBundledTypesMount(nodeModulesOf(second), [
        { packageName: 'race', content: 'second', files: { 'second.d.ts': 'second-extra' } },
      ]),
    ]);

    const content = await first.readFile('/node_modules/race/index.d.ts', 'utf8');
    const directory = await first.readDirectory('/node_modules/race');
    const names = directory.map(({ name }) => name).sort();
    expect(content === 'first' ? names : content === 'second' ? names : undefined).toEqual(
      content === 'first'
        ? ['first.d.ts', 'index.d.ts', 'package.json']
        : ['index.d.ts', 'package.json', 'second.d.ts'],
    );

    second.dispose();
  });
});
