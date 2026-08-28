// oxlint-disable-next-line import/no-unassigned-import -- Side-effect import to polyfill IndexedDB for tests
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { WorkspaceFileService } from '#workspace-file-service.js';
import { ProviderRegistry } from '#provider-registry.js';
import { ResourceQueue } from '#resource-queue.js';
import { ChangeEventBus } from '#change-event-bus.js';
import { MountTable } from '#mount-table.js';
import type { ProjectRootConfig, WorkspaceScope } from '#mount-table.js';
import type { ChangeEvent, FileSystemProvider, WatchEvent } from '#types.js';
import { getEventAuthorities } from '#event-origin-registry.js';

/**
 * Unified scope-routing tests for {@link WorkspaceFileService}.
 *
 * Asserts that the migrated FS dispatch surface (`readFile`, `unlink`,
 * `rmdir`, `getZippedDirectory`, `readShallowDirectory`) routes via the
 * standalone provider when `options.scope` is supplied, and via the
 * mount table otherwise. Lives in a separate file so the main
 * `workspace-file-service.test.ts` stays under the 1500-line cap.
 */

const activeServices: WorkspaceFileService[] = [];

async function createService() {
  const providerRegistry = new ProviderRegistry();
  const provider = await providerRegistry.getProvider({ backend: 'memory', storageRootKey: 'memory:test-root' });

  const mountTable = new MountTable();
  mountTable.mount('/', provider, { backend: 'memory', storageRootKey: 'memory:test-root' });

  const resourceQueue = new ResourceQueue();
  const eventBus = new ChangeEventBus();

  const service = new WorkspaceFileService({
    providerRegistry,
    resourceQueue,
    eventBus,
    mountTable,
  });
  activeServices.push(service);

  return { service, eventBus, providerRegistry, rootProvider: provider, mountTable };
}

afterEach(() => {
  for (const service of activeServices.splice(0)) {
    service.dispose();
  }
});

describe('WorkspaceFileService — unified scope routing', () => {
  let service: WorkspaceFileService;
  let eventBus: ChangeEventBus;
  let providerRegistry: ProviderRegistry;
  let rootProvider: FileSystemProvider;
  const scope: WorkspaceScope = { backend: 'indexeddb' };

  beforeEach(async () => {
    const context = await createService();
    service = context.service;
    eventBus = context.eventBus;
    providerRegistry = context.providerRegistry;
    rootProvider = context.rootProvider;
  });

  it('readFile({ scope }) reads from the standalone provider, not the mount table', async () => {
    const standaloneReadFile = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]));
    vi.spyOn(providerRegistry, 'getProvider').mockResolvedValue(
      mock<FileSystemProvider>({ readFile: standaloneReadFile }),
    );
    const mountReadFileSpy = vi.spyOn(rootProvider, 'readFile');

    const data = await service.readFile('/scope/data.bin', { scope });

    expect(standaloneReadFile).toHaveBeenCalledWith('scope/data.bin');
    expect(mountReadFileSpy).not.toHaveBeenCalled();
    expect(data).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('rmdir({ recursive: true }) without a scope walks a mount-routed project subtree', async () => {
    const events: ChangeEvent[] = [];
    eventBus.subscribe((event) => events.push(event));

    await service.mkdir('/scope/dir', { recursive: true });
    await service.writeFile('/scope/dir/nested.txt', 'content');

    await service.rmdir('/scope/dir', { recursive: true });

    await expect(service.stat('/scope/dir')).rejects.toThrow(/ENOENT/);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'directoryDeleted', path: '/scope/dir', backend: 'memory' }),
    );
  });

  it('rmdir({ recursive: true }) without a scope refuses to cross a nested mount boundary', async () => {
    const { service, providerRegistry, mountTable } = await createService();
    await service.mkdir('/scope/dir', { recursive: true });
    const nestedProvider = await providerRegistry.getProvider({
      backend: 'memory',
      storageRootKey: 'memory:nested-boundary',
    });
    mountTable.mount('/scope/dir/mounted', nestedProvider, {
      backend: 'memory',
      storageRootKey: 'memory:nested-boundary',
    });

    await expect(service.rmdir('/scope/dir', { recursive: true })).rejects.toThrow(/cross mount boundary/);
  });

  it('rejects copy and move when either subtree contains a descendant mount', async () => {
    const { service, providerRegistry, mountTable } = await createService();
    await service.writeFile('/source/file.txt', 'source');
    await service.writeFile('/plain/file.txt', 'plain');
    const sourceNested = await providerRegistry.getProvider({
      backend: 'memory',
      storageRootKey: 'memory:copy-source-boundary',
    });
    const targetNested = await providerRegistry.getProvider({
      backend: 'memory',
      storageRootKey: 'memory:copy-target-boundary',
    });
    mountTable.mount('/source/mounted', sourceNested, {
      backend: 'memory',
      storageRootKey: 'memory:copy-source-boundary',
    });
    mountTable.mount('/target/mounted', targetNested, {
      backend: 'memory',
      storageRootKey: 'memory:copy-target-boundary',
    });

    await expect(service.move('/source', '/moved')).rejects.toThrow(/cross mount boundary/);
    await expect(service.copyDirectory('/source', '/copied')).rejects.toThrow(/cross mount boundary/);
    await expect(service.move('/plain', '/target')).rejects.toThrow(/cross mount boundary/);
    await expect(service.copyDirectory('/plain', '/target')).rejects.toThrow(/cross mount boundary/);

    await expect(service.readFile('/source/file.txt', 'utf8')).resolves.toBe('source');
    await expect(service.readFile('/plain/file.txt', 'utf8')).resolves.toBe('plain');
    await expect(service.exists('/moved')).resolves.toBe(false);
    await expect(service.exists('/copied')).resolves.toBe(false);
  });

  it('getZippedDirectory({ scope }) zips from the standalone provider', async () => {
    const standaloneExists = vi.fn().mockResolvedValue(true);
    const standaloneReaddir = vi.fn().mockResolvedValue([]);
    vi.spyOn(providerRegistry, 'getProvider').mockResolvedValue(
      mock<FileSystemProvider>({
        exists: standaloneExists,
        readdir: standaloneReaddir,
        readdirEntries: undefined,
      }),
    );

    const blob = await service.getZippedDirectory('/scope/dir', { scope });

    expect(standaloneExists).not.toHaveBeenCalled();
    expect(standaloneReaddir).toHaveBeenCalledWith('scope/dir');
    expect(blob).toBeInstanceOf(Blob);
  });

  it('without a scope, every method routes through the mount table (no standalone provider lookup)', async () => {
    const standaloneSpy = vi.spyOn(providerRegistry, 'getProvider');

    await service.writeFile('/mount/file.txt', 'hi');
    await service.unlink('/mount/file.txt');
    await service.mkdir('/mount/sub');
    await service.rmdir('/mount/sub');

    expect(standaloneSpy).not.toHaveBeenCalled();
  });
});

describe('WorkspaceFileService — rooted project filesystems', () => {
  const alphaProjectId = 'proj_aaaaaaaaaaaaaaaaaaaaa';
  const betaProjectId = 'proj_bbbbbbbbbbbbbbbbbbbbb';

  const configureProjects = async (
    service: WorkspaceFileService,
    projects: ReadonlyArray<{ projectId: string; storageRootKey: string }>,
  ): Promise<void> => {
    await service.configureProjectRoots({
      projects: projects.map(
        ({ projectId, storageRootKey }): ProjectRootConfig => ({
          projectId,
          backend: 'memory',
          storageRootKey,
          providerBasePath: projectId,
        }),
      ),
      roots: [],
    });
  };

  const invalidTopologyCases: Array<{ name: string; projects: ProjectRootConfig[] }> = [
    {
      name: 'a duplicate physical route',
      projects: [
        {
          projectId: alphaProjectId,
          backend: 'memory',
          storageRootKey: 'memory:duplicate',
          providerBasePath: 'duplicate',
        },
        {
          projectId: betaProjectId,
          backend: 'memory',
          storageRootKey: 'memory:duplicate',
          providerBasePath: 'duplicate',
        },
      ],
    },
    {
      name: 'a late invalid project id',
      projects: [
        {
          projectId: betaProjectId,
          backend: 'memory',
          storageRootKey: 'memory:valid-before-invalid',
          providerBasePath: betaProjectId,
        },
        {
          projectId: '../invalid',
          backend: 'memory',
          storageRootKey: 'memory:invalid',
          providerBasePath: 'invalid',
        },
      ],
    },
  ];

  it('ignores delayed project-unavailable facts from a replaced physical authority', async () => {
    const { service } = await createService();
    await configureProjects(service, [{ projectId: alphaProjectId, storageRootKey: 'memory:authority-a' }]);
    await configureProjects(service, [{ projectId: alphaProjectId, storageRootKey: 'memory:authority-b' }]);
    await service.writeFile(`/projects/${alphaProjectId}/current.txt`, 'authority b');
    const sender = new BroadcastChannel('tau-fs-changes');

    try {
      sender.postMessage({
        type: 'project-unavailable',
        path: `/projects/${alphaProjectId}`,
        authority: {
          storageRootKey: 'memory:authority-a',
          providerBasePath: alphaProjectId,
        },
      });
      await new Promise((resolve) => {
        setTimeout(resolve, 20);
      });
      await expect(service.readFile(`/projects/${alphaProjectId}/current.txt`, 'utf8')).resolves.toBe('authority b');

      sender.postMessage({
        type: 'project-unavailable',
        path: `/projects/${alphaProjectId}`,
        authority: {
          storageRootKey: 'memory:authority-b',
          providerBasePath: alphaProjectId,
        },
      });
      await vi.waitFor(async () => {
        await expect(service.readFile(`/projects/${alphaProjectId}/current.txt`)).rejects.toMatchObject({
          code: 'UNBOUND_PROJECT_ROUTE',
        });
      });
    } finally {
      sender.close();
    }
  });

  it('exposes each configured project as an independent writable local root', async () => {
    const { service } = await createService();
    await configureProjects(service, [
      { projectId: alphaProjectId, storageRootKey: 'memory:alpha' },
      { projectId: betaProjectId, storageRootKey: 'memory:beta' },
    ]);
    const alpha = service.createRootedFileSystem(`/projects/${alphaProjectId}`);
    const beta = service.createRootedFileSystem(`/projects/${betaProjectId}`);

    await alpha.mkdir('src', { recursive: true });
    await alpha.writeFile('src/main.ts', 'alpha');
    await beta.mkdir('src', { recursive: true });
    await beta.writeFile('src/main.ts', 'beta');
    await alpha.rename('src/main.ts', 'src/renamed.ts');

    await expect(alpha.readFile('src/renamed.ts', 'utf8')).resolves.toBe('alpha');
    await expect(beta.readFile('src/main.ts', 'utf8')).resolves.toBe('beta');
    await expect(service.readFile(`/projects/${alphaProjectId}/src/renamed.ts`, 'utf8')).resolves.toBe('alpha');
    await expect(service.readFile(`/projects/${betaProjectId}/src/main.ts`, 'utf8')).resolves.toBe('beta');

    await alpha.unlink('src/renamed.ts');
    await alpha.rmdir('src');
    await expect(alpha.exists('src')).resolves.toBe(false);
    await expect(beta.exists('src/main.ts')).resolves.toBe(true);
  });

  it('keeps cache and project-local module files writable after reopening the same project root', async () => {
    const { service } = await createService();
    const configuration = [{ projectId: alphaProjectId, storageRootKey: 'memory:alpha-cache' }] as const;
    await configureProjects(service, configuration);
    const first = service.createRootedFileSystem(`/projects/${alphaProjectId}`);

    await first.mkdir('.tau/cache/geometry', { recursive: true });
    await first.writeFile('.tau/cache/geometry/result.bin', new Uint8Array([1, 2, 3]));
    await first.mkdir('node_modules/local-package', { recursive: true });
    await first.writeFile('node_modules/local-package/index.js', 'export const cached = true;');
    await configureProjects(service, configuration);

    const reopened = service.createRootedFileSystem(`/projects/${alphaProjectId}`);
    await expect(reopened.readFile('.tau/cache/geometry/result.bin')).resolves.toEqual(new Uint8Array([1, 2, 3]));
    await expect(reopened.readFile('node_modules/local-package/index.js', 'utf8')).resolves.toBe(
      'export const cached = true;',
    );
  });

  it('can root a trusted ephemeral preview at an exact dynamic mount', async () => {
    const { service } = await createService();
    await service.mount('/previews/preview', {
      backend: 'memory',
      storageRootKey: 'memory:preview:preview',
    });

    const preview = service.createRootedFileSystem('/previews/preview');
    await preview.writeFile('main.ts', 'preview');

    await expect(preview.readFile('main.ts', 'utf8')).resolves.toBe('preview');
    await expect(service.readFile('/previews/preview/main.ts', 'utf8')).resolves.toBe('preview');
  });

  it('rejects traversal above local root and treats authority-looking paths as ordinary local names', async () => {
    const { service } = await createService();
    await configureProjects(service, [
      { projectId: alphaProjectId, storageRootKey: 'memory:alpha-boundary' },
      { projectId: betaProjectId, storageRootKey: 'memory:beta-boundary' },
    ]);
    const alpha = service.createRootedFileSystem(`/projects/${alphaProjectId}`);

    await expect(alpha.writeFile('../beta/escaped.txt', 'no')).rejects.toMatchObject({
      code: 'PATH_OUTSIDE_ROOT',
    });
    await alpha.writeFile('projects/beta/local.txt', 'inside alpha');

    await expect(service.readFile(`/projects/${alphaProjectId}/projects/beta/local.txt`, 'utf8')).resolves.toBe(
      'inside alpha',
    );
    await expect(service.exists(`/projects/${betaProjectId}/local.txt`)).resolves.toBe(false);
  });

  it('validates both rename operands before mutating the source', async () => {
    const { service } = await createService();
    await configureProjects(service, [{ projectId: alphaProjectId, storageRootKey: 'memory:alpha-rename' }]);
    const alpha = service.createRootedFileSystem(`/projects/${alphaProjectId}`);
    await alpha.writeFile('source.txt', 'preserved');

    await expect(alpha.rename('source.txt', '../outside.txt')).rejects.toMatchObject({
      code: 'PATH_OUTSIDE_ROOT',
    });
    await expect(alpha.readFile('source.txt', 'utf8')).resolves.toBe('preserved');
  });

  it('preserves a rooted view across an unchanged route and invalidates it on replacement', async () => {
    const { service } = await createService();
    const firstConfiguration = [{ projectId: alphaProjectId, storageRootKey: 'memory:alpha-stable' }] as const;
    await configureProjects(service, firstConfiguration);
    const rooted = service.createRootedFileSystem(`/projects/${alphaProjectId}`);

    await configureProjects(service, firstConfiguration);
    await rooted.writeFile('still-current.txt', 'yes');

    await configureProjects(service, [{ projectId: alphaProjectId, storageRootKey: 'memory:alpha-replaced' }]);
    await expect(rooted.readFile('still-current.txt', 'utf8')).rejects.toMatchObject({ code: 'ESTALE' });
    const replacement = service.createRootedFileSystem(`/projects/${alphaProjectId}`);
    await expect(replacement.exists('still-current.txt')).resolves.toBe(false);
  });

  it.each(invalidTopologyCases)('preflights $name without replacing the active topology', async ({ projects }) => {
    const { service } = await createService();
    await configureProjects(service, [{ projectId: alphaProjectId, storageRootKey: 'memory:active' }]);
    const rooted = service.createRootedFileSystem(`/projects/${alphaProjectId}`);
    await rooted.writeFile('preserved.txt', 'preserved');

    await expect(service.configureProjectRoots({ projects, roots: [] })).rejects.toThrow();

    await expect(rooted.readFile('preserved.txt', 'utf8')).resolves.toBe('preserved');
  });

  it('applies concurrent project configurations in invocation order', async () => {
    const { service, providerRegistry, mountTable } = await createService();
    const originalGetProvider = providerRegistry.getProvider.bind(providerRegistry);
    const releaseOld = Promise.withResolvers<void>();
    const oldLookupStarted = Promise.withResolvers<void>();
    vi.spyOn(providerRegistry, 'getProvider').mockImplementation(async (requestedScope) => {
      if (requestedScope.backend === 'memory' && requestedScope.storageRootKey === 'memory:slow-old') {
        oldLookupStarted.resolve();
        await releaseOld.promise;
      }
      return originalGetProvider(requestedScope);
    });

    const oldConfiguration = configureProjects(service, [
      { projectId: alphaProjectId, storageRootKey: 'memory:slow-old' },
    ]);
    await oldLookupStarted.promise;
    const newConfiguration = configureProjects(service, [
      { projectId: alphaProjectId, storageRootKey: 'memory:fast-new' },
    ]);

    expect(providerRegistry.getProvider).not.toHaveBeenCalledWith({
      backend: 'memory',
      storageRootKey: 'memory:fast-new',
    });
    releaseOld.resolve();
    await Promise.all([oldConfiguration, newConfiguration]);

    expect(mountTable.getExactMount(`/projects/${alphaProjectId}`)?.storageRootKey).toBe('memory:fast-new');
  });

  it('removes a disposed physical root from discovery before it can be recreated', async () => {
    const { service, providerRegistry } = await createService();
    await service.configureProjectRoots({ projects: [], roots: [{ backend: 'indexeddb' }] });
    service.disposeStorageRoot('indexeddb:tau');
    const getProvider = vi.spyOn(providerRegistry, 'getProvider');

    await expect(service.listProjectManifests()).resolves.toEqual({ entries: [], roots: [] });
    expect(getProvider).not.toHaveBeenCalled();
  });

  it('treats equal WebAccess storage-root keys as equal discovery topology', async () => {
    const { service } = await createService();
    const firstHandle = mock<FileSystemDirectoryHandle>({ name: 'first-wrapper' });
    const secondHandle = mock<FileSystemDirectoryHandle>({ name: 'second-wrapper' });
    firstHandle.isSameEntry.mockResolvedValue(true);
    await service.configureProjectRoots({
      projects: [],
      roots: [{ backend: 'webaccess', workspaceId: 'wsp_same', directoryHandle: firstHandle }],
    });
    const events: WatchEvent[] = [];
    const stop = service.watch({ paths: ['/'], recursive: true }, (event) => events.push(event));

    await service.configureProjectRoots({
      projects: [],
      roots: [{ backend: 'webaccess', workspaceId: 'wsp_same', directoryHandle: secondHandle }],
    });

    expect(events).toEqual([]);
    expect(firstHandle.isSameEntry).toHaveBeenCalledWith(secondHandle);
    stop();
  });

  it('revokes rooted views before disposing their physical provider', async () => {
    const { service } = await createService();
    const storageRootKey = 'memory:disposable';
    await configureProjects(service, [{ projectId: alphaProjectId, storageRootKey }]);
    const rooted = service.createRootedFileSystem(`/projects/${alphaProjectId}`);

    service.disposeStorageRoot(storageRootKey);

    await expect(rooted.exists('')).rejects.toMatchObject({ code: 'ESTALE' });
  });

  it.each(['', '.tau', 'projects/nested/child', 'other/project', '/slash-prefixed'])(
    'rejects invalid configured provider base %s before provider lookup',
    async (providerBasePath) => {
      const { service, providerRegistry } = await createService();
      const getProvider = vi.spyOn(providerRegistry, 'getProvider');
      await expect(
        service.configureProjectRoots({
          projects: [
            {
              projectId: alphaProjectId,
              backend: 'memory',
              storageRootKey: `memory:invalid-base:${providerBasePath}`,
              providerBasePath,
            },
          ],
          roots: [],
        }),
      ).rejects.toThrow();
      expect(getProvider).not.toHaveBeenCalled();
    },
  );

  it('revokes rooted views when the owning service is disposed', async () => {
    const { service } = await createService();
    await configureProjects(service, [{ projectId: alphaProjectId, storageRootKey: 'memory:service-dispose' }]);
    const rooted = service.createRootedFileSystem(`/projects/${alphaProjectId}`);

    service.dispose();

    await expect(rooted.exists('')).rejects.toMatchObject({ code: 'ESTALE' });
  });

  it('does not retarget an operation whose provider was captured before route replacement', async () => {
    const { service, providerRegistry } = await createService();
    const oldScope: { backend: 'memory'; storageRootKey: string } = {
      backend: 'memory',
      storageRootKey: 'memory:alpha-queued-old',
    };
    await configureProjects(service, [{ projectId: alphaProjectId, storageRootKey: oldScope.storageRootKey }]);
    const oldProvider = await providerRegistry.getProvider(oldScope);
    const originalWrite = oldProvider.writeFile.bind(oldProvider);
    const started = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    vi.spyOn(oldProvider, 'writeFile').mockImplementation(async (path, data) => {
      started.resolve();
      await release.promise;
      await originalWrite(path, data);
    });
    const rooted = service.createRootedFileSystem(`/projects/${alphaProjectId}`);

    const queuedWrite = rooted.writeFile('queued.txt', 'old provider');
    await started.promise;
    await configureProjects(service, [{ projectId: alphaProjectId, storageRootKey: 'memory:alpha-queued-new' }]);
    const replacementProvider = await providerRegistry.getProvider({
      backend: 'memory',
      storageRootKey: 'memory:alpha-queued-new',
    });
    await replacementProvider.mkdir(alphaProjectId, { recursive: true });
    const replacement = service.createRootedFileSystem(`/projects/${alphaProjectId}`);
    const replacementEvents: WatchEvent[] = [];
    const stopReplacement = replacement.watch({ paths: ['queued.txt'] }, (event) => replacementEvents.push(event));
    await service.getDirectoryStat(`/projects/${alphaProjectId}`);
    release.resolve();
    await queuedWrite;
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });

    await expect(oldProvider.readFile(`${alphaProjectId}/queued.txt`, 'utf8')).resolves.toBe('old provider');
    await expect(replacement.exists('queued.txt')).resolves.toBe(false);
    expect(replacementEvents).toEqual([]);
    expect(await service.getDirectoryStat(`/projects/${alphaProjectId}`)).toEqual([]);
    stopReplacement();
  });

  it('isolates a captured parent-provider watch from a later nested mount', async () => {
    const { service, providerRegistry, mountTable } = await createService();
    await configureProjects(service, [{ projectId: alphaProjectId, storageRootKey: 'memory:parent-overlay' }]);
    const rooted = service.createRootedFileSystem(`/projects/${alphaProjectId}`);
    const events: WatchEvent[] = [];
    const stop = rooted.watch({ paths: ['nested'], recursive: true }, (event) => events.push(event));
    const nestedProvider = await providerRegistry.getProvider({
      backend: 'memory',
      storageRootKey: 'memory:nested-overlay',
    });
    mountTable.mount(`/projects/${alphaProjectId}/nested`, nestedProvider, {
      backend: 'memory',
      storageRootKey: 'memory:nested-overlay',
    });

    await service.writeFile(`/projects/${alphaProjectId}/nested/overlay.txt`, 'overlay');
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
    expect(events).toEqual([]);

    await rooted.writeFile('nested/parent.txt', 'parent provider');
    await vi.waitFor(() => {
      expect(events).toEqual([{ type: 'change', path: 'nested/parent.txt' }]);
    });
    await expect(nestedProvider.exists('parent.txt')).resolves.toBe(false);
    stop();
  });

  it('checks rooted staleness before accepting an empty watch request', async () => {
    const { service } = await createService();
    await configureProjects(service, [{ projectId: alphaProjectId, storageRootKey: 'memory:empty-old' }]);
    const rooted = service.createRootedFileSystem(`/projects/${alphaProjectId}`);
    await configureProjects(service, [{ projectId: alphaProjectId, storageRootKey: 'memory:empty-new' }]);

    expect(() => rooted.watch({ paths: [] }, () => undefined)).toThrow(expect.objectContaining({ code: 'ESTALE' }));
  });

  it('rebases watches to local paths without exposing sibling project events', async () => {
    const { service, eventBus, mountTable } = await createService();
    await configureProjects(service, [
      { projectId: alphaProjectId, storageRootKey: 'memory:alpha-watch' },
      { projectId: betaProjectId, storageRootKey: 'memory:beta-watch' },
    ]);
    const alpha = service.createRootedFileSystem(`/projects/${alphaProjectId}`);
    const beta = service.createRootedFileSystem(`/projects/${betaProjectId}`);
    const alphaEvents: unknown[] = [];
    const betaEvents: unknown[] = [];
    const stopAlpha = alpha.watch({ paths: [''], recursive: true }, (event) => alphaEvents.push(event));
    const stopBeta = beta.watch({ paths: [''], recursive: true }, (event) => betaEvents.push(event));
    const rawAuthorities: Array<readonly WeakKey[] | undefined> = [];
    const stopRaw = eventBus.subscribe((event) => rawAuthorities.push(getEventAuthorities(event)));

    await alpha.writeFile('main.ts', 'alpha');
    expect(rawAuthorities.at(-1)).toContain(mountTable.getExactMount(`/projects/${alphaProjectId}`));
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
    expect(alphaEvents).toContainEqual({ type: 'change', path: 'main.ts' });
    expect(betaEvents).toEqual([]);

    stopAlpha();
    stopBeta();
    stopRaw();
  });

  it('delivers one rebased event for an in-root rename', async () => {
    const { service } = await createService();
    await configureProjects(service, [{ projectId: alphaProjectId, storageRootKey: 'memory:alpha-rename-watch' }]);
    const rooted = service.createRootedFileSystem(`/projects/${alphaProjectId}`);
    const events: WatchEvent[] = [];
    const stop = rooted.watch({ paths: [''], recursive: true }, (event) => events.push(event));
    await rooted.writeFile('before.ts', 'source');
    await vi.waitFor(() => {
      expect(events).toContainEqual({ type: 'change', path: 'before.ts' });
    });
    events.length = 0;

    await rooted.rename('before.ts', 'after.ts');
    await vi.waitFor(() => {
      expect(events).toEqual([{ type: 'rename', oldPath: 'before.ts', newPath: 'after.ts' }]);
    });
    stop();
  });

  it('delivers non-root events when the captured authority root is /', async () => {
    const { service } = await createService();
    const rooted = service.createRootedFileSystem('/');
    const events: WatchEvent[] = [];
    const stop = rooted.watch({ paths: ['src/main.ts'] }, (event) => events.push(event));

    await service.writeFile('/src/main.ts', 'root');
    await vi.waitFor(() => {
      expect(events).toContainEqual({ type: 'change', path: 'src/main.ts' });
    });
    stop();
  });

  it('should preserve relative includes and rebase absolute exclusions for rooted watches', async () => {
    const { service } = await createService();
    await configureProjects(service, [{ projectId: alphaProjectId, storageRootKey: 'memory:glob-projection' }]);
    const rooted = service.createRootedFileSystem(`/projects/${alphaProjectId}`);
    const events: WatchEvent[] = [];
    const stop = rooted.watch(
      { paths: [''], recursive: true, includes: ['**/*.ts'], excludes: ['.tau/cache/**'] },
      (event) => events.push(event),
    );

    await rooted.writeFile('.tau/cache/generated.ts', 'cache');
    await rooted.writeFile('src/main.js', 'javascript');
    await rooted.writeFile('Src/Main.ts', 'typescript');
    await vi.waitFor(() => {
      expect(events).toContainEqual({ type: 'change', path: 'Src/Main.ts' });
    });
    expect(events).toEqual([{ type: 'change', path: 'Src/Main.ts' }]);
    stop();
  });

  it('should reset and stop a rooted watch when its captured mount becomes stale', async () => {
    const { service } = await createService();
    await configureProjects(service, [{ projectId: alphaProjectId, storageRootKey: 'memory:alpha-watch-old' }]);
    const rooted = service.createRootedFileSystem(`/projects/${alphaProjectId}`);
    const events: WatchEvent[] = [];
    const stop = rooted.watch({ paths: ['main.ts'] }, (event) => events.push(event));

    await configureProjects(service, [{ projectId: alphaProjectId, storageRootKey: 'memory:alpha-watch-new' }]);
    expect(events).toEqual([{ type: 'reset' }]);
    await service.writeFile(`/projects/${alphaProjectId}/main.ts`, 'new provider');
    await vi.waitFor(() => {
      expect(events).toEqual([{ type: 'reset' }]);
    });

    await service.writeFile(`/projects/${alphaProjectId}/main.ts`, 'later write');
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
    expect(events).toEqual([{ type: 'reset' }]);
    stop();
  });

  it('stops a stale rooted watch before invoking a reset handler that throws', async () => {
    const { service } = await createService();
    await configureProjects(service, [{ projectId: alphaProjectId, storageRootKey: 'memory:throwing-watch-old' }]);
    const rooted = service.createRootedFileSystem(`/projects/${alphaProjectId}`);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const handler = vi.fn(() => {
      throw new Error('reset handler failed');
    });
    const stop = rooted.watch({ paths: ['main.ts'] }, handler);

    await configureProjects(service, [{ projectId: alphaProjectId, storageRootKey: 'memory:throwing-watch-new' }]);
    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith({ type: 'reset' });

    await service.writeFile(`/projects/${alphaProjectId}/main.ts`, 'replacement');
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
    expect(handler).toHaveBeenCalledOnce();

    stop();
    consoleError.mockRestore();
  });

  it('suppresses a scoped self-write but preserves an external write', async () => {
    const { service } = await createService();
    const rooted = service.createRootedFileSystem('/', { originClientId: 'runtime' });
    const events: WatchEvent[] = [];
    const stop = rooted.watch({ paths: ['main.ts'] }, (event) => events.push(event));

    await rooted.writeFile('main.ts', 'self');
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
    expect(events).toEqual([]);

    await service.writeFile('/main.ts', 'external');
    await vi.waitFor(() => {
      expect(events).toContainEqual({ type: 'change', path: 'main.ts' });
    });
    stop();
  });
});
