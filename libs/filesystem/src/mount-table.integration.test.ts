// oxlint-disable-next-line import/no-unassigned-import -- Side-effect import to polyfill IndexedDB for tests
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MountTable } from '#mount-table.js';
import { WorkspaceFileService } from '#workspace-file-service.js';
import { ProviderRegistry } from '#provider-registry.js';
import { ResourceQueue } from '#resource-queue.js';
import { ChangeEventBus } from '#change-event-bus.js';
import { getEventOrigin } from '#event-origin-registry.js';
import { CrossTabCoordinator } from '#cross-tab-coordinator.js';
import type { ChangeEvent, FileSystemProvider } from '#types.js';

async function createMountedWorkspaceFileService() {
  const providerRegistry = new ProviderRegistry();
  const rootProvider = await providerRegistry.getProvider({
    backend: 'memory',
    storageRootKey: 'memory:mount-integration-root',
  });
  const nodeModulesProvider = await providerRegistry.getProvider({
    backend: 'memory',
    storageRootKey: 'memory:mount-integration-node-modules',
  });

  const mountTable = new MountTable();
  mountTable.mount('/', rootProvider, {
    backend: 'memory',
    storageRootKey: 'memory:mount-integration-root',
  });
  mountTable.mount('/node_modules', nodeModulesProvider, {
    backend: 'memory',
    storageRootKey: 'memory:mount-integration-node-modules',
  });
  mountTable.mount('/previews/deps', nodeModulesProvider, {
    backend: 'memory',
    storageRootKey: 'memory:mount-integration-node-modules',
  });

  const resourceQueue = new ResourceQueue();
  const eventBus = new ChangeEventBus();

  const service = new WorkspaceFileService({
    providerRegistry,
    resourceQueue,
    eventBus,
    mountTable,
  });

  return { service, rootProvider, nodeModulesProvider, eventBus, mountTable, providerRegistry };
}

describe('MountTable integration', () => {
  let service: WorkspaceFileService;
  let rootProvider: FileSystemProvider;
  let nodeModulesProvider: FileSystemProvider;
  let eventBus: ChangeEventBus;

  beforeEach(async () => {
    const context = await createMountedWorkspaceFileService();
    service = context.service;
    rootProvider = context.rootProvider;
    nodeModulesProvider = context.nodeModulesProvider;
    eventBus = context.eventBus;
  });

  // -------------------------------------------------------------------------
  // Multi-mount routing
  // -------------------------------------------------------------------------

  describe('multi-mount routing', () => {
    it('keeps the committed project-route projection when staging a replacement fails', async () => {
      const context = await createMountedWorkspaceFileService();
      const committedId = 'proj_ccccccccccccccccccccc';
      const replacementId = 'proj_rrrrrrrrrrrrrrrrrrrrr';
      await context.service.configureProjectRoots({
        projects: [
          {
            projectId: committedId,
            backend: 'memory',
            storageRootKey: 'memory:committed',
            providerBasePath: 'committed-physical',
          },
        ],
        roots: [],
      });
      await context.service.writeFile(`/projects/${committedId}/main.ts`, 'committed');
      vi.spyOn(context.providerRegistry, 'getProvider').mockRejectedValueOnce(new Error('provider unavailable'));

      await expect(
        context.service.configureProjectRoots({
          projects: [
            {
              projectId: replacementId,
              backend: 'memory',
              storageRootKey: 'memory:replacement',
              providerBasePath: 'replacement-physical',
            },
          ],
          roots: [],
        }),
      ).rejects.toThrow('provider unavailable');

      expect(await context.service.readFile(`/projects/${committedId}/main.ts`, 'utf8')).toBe('committed');
      context.service.dispose();
    });

    it('should route readFile to root mount for project files', async () => {
      await rootProvider.writeFile('src/main.ts', 'hello');
      const content = await service.readFile('/src/main.ts', 'utf8');
      expect(content).toBe('hello');
    });

    it('should route readFile to node_modules mount', async () => {
      await nodeModulesProvider.writeFile('lodash/index.js', 'module.exports = {}');
      const content = await service.readFile('/node_modules/lodash/index.js', 'utf8');
      expect(content).toBe('module.exports = {}');
    });

    it('should route writeFile to correct provider based on path', async () => {
      await service.writeFile('/src/app.ts', 'app code');
      await service.writeFile('/previews/deps/react/index.js', 'react');

      expect(await rootProvider.readFile('src/app.ts', 'utf8')).toBe('app code');
      expect(await nodeModulesProvider.readFile('react/index.js', 'utf8')).toBe('react');
    });

    it('should route exists to correct provider', async () => {
      await rootProvider.writeFile('project.json', '{}');
      await nodeModulesProvider.writeFile('pkg/index.js', 'x');

      expect(await service.exists('/project.json')).toBe(true);
      expect(await service.exists('/node_modules/pkg/index.js')).toBe(true);
      expect(await service.exists('/node_modules/missing.js')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // readdir merge
  // -------------------------------------------------------------------------

  describe('readdir merge', () => {
    it('should inject node_modules as synthetic directory in root readdir', async () => {
      await rootProvider.writeFile('src/main.ts', 'x');
      const entries = await service.readdir('/');
      expect(entries).toContain('src');
      expect(entries).toContain('node_modules');
    });

    it('should not duplicate node_modules if root provider also has it', async () => {
      await rootProvider.mkdir('node_modules');
      await rootProvider.writeFile('src/main.ts', 'x');
      const entries = await service.readdir('/');
      const nmCount = entries.filter((entry) => entry === 'node_modules').length;
      expect(nmCount).toBe(1);
    });

    it('should merge synthetic entries in readDirectory tree nodes', async () => {
      await rootProvider.writeFile('main.ts', 'x');
      const nodes = await service.readDirectory('/');
      const nmNode = nodes.find((n) => n.name === 'node_modules');
      expect(nmNode).toBeDefined();
      expect(nmNode!.children).toEqual([]);
      expect(nmNode!.mtimeMs).toBe(0);
    });

    it('should only query node_modules provider for /node_modules/ paths', async () => {
      await nodeModulesProvider.writeFile('lodash/index.js', 'x');
      const entries = await service.readdir('/node_modules');
      expect(entries).toContain('lodash');
    });
  });

  // -------------------------------------------------------------------------
  // Cross-mount operations
  // -------------------------------------------------------------------------

  describe('cross-mount operations', () => {
    it('should perform a cross-mount move as copy and delete', async () => {
      await rootProvider.writeFile('temp.js', 'temp content');
      await service.move('/temp.js', '/previews/deps/temp.js');

      expect(await rootProvider.exists('temp.js')).toBe(false);
      expect(await nodeModulesProvider.readFile('temp.js', 'utf8')).toBe('temp content');
    });

    it('should handle a same-mount move', async () => {
      await rootProvider.writeFile('old.ts', 'code');
      await service.move('/old.ts', '/new.ts');

      expect(await rootProvider.exists('old.ts')).toBe(false);
      expect(await rootProvider.readFile('new.ts', 'utf8')).toBe('code');
    });

    it('should duplicate files across mount boundaries', async () => {
      await rootProvider.writeFile('src/util.ts', 'util code');
      await service.duplicateFile('/src/util.ts', '/previews/deps/util.ts');

      expect(await rootProvider.readFile('src/util.ts', 'utf8')).toBe('util code');
      expect(await nodeModulesProvider.readFile('util.ts', 'utf8')).toBe('util code');
    });
  });

  // -------------------------------------------------------------------------
  // Event propagation
  // -------------------------------------------------------------------------

  describe('event propagation', () => {
    it('should emit fileWritten with virtual absolute path for root writes', async () => {
      const events: ChangeEvent[] = [];
      eventBus.subscribe((event) => {
        events.push(event);
      });

      await service.writeFile('/src/main.ts', 'code');
      const writeEvent = events.find(
        (event) => event.type === 'fileWritten' && 'path' in event && event.path === '/src/main.ts',
      );
      expect(writeEvent).toBeDefined();
    });

    it('should emit fileWritten with the virtual absolute path for nested-mount writes', async () => {
      const events: ChangeEvent[] = [];
      eventBus.subscribe((event) => {
        events.push(event);
      });

      await service.writeFile('/previews/deps/lodash/index.js', 'x');
      const writeEvent = events.find(
        (event) => event.type === 'fileWritten' && 'path' in event && event.path === '/previews/deps/lodash/index.js',
      );
      expect(writeEvent).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Cache and tree coherence
  // -------------------------------------------------------------------------

  describe('cache and tree coherence', () => {
    it('should cache readDirectory per virtual path across mounts', async () => {
      await rootProvider.writeFile('main.ts', 'x');
      const dateNow = vi.spyOn(Date, 'now');
      try {
        dateNow.mockReturnValue(100);
        const first = await service.readDirectory('/');
        dateNow.mockReturnValue(101);
        const second = await service.readDirectory('/');
        expect(first).toEqual(second);
      } finally {
        dateNow.mockRestore();
      }
    });

    it('should collect directory stats from mounted provider', async () => {
      await rootProvider.writeFile('src/a.ts', 'aaa');
      await rootProvider.writeFile('src/b.ts', 'bb');
      const stats = await service.getDirectoryStat('/src');
      expect(stats).toHaveLength(2);
      const paths = stats.map((s) => s.path).sort();
      expect(paths).toEqual(['a.ts', 'b.ts']);
    });
  });

  // -------------------------------------------------------------------------
  // Backward compatibility
  // -------------------------------------------------------------------------

  describe('single mount', () => {
    it('should work with only a root mount', async () => {
      const providerRegistry = new ProviderRegistry();
      const provider = await providerRegistry.getProvider({ backend: 'memory', storageRootKey: 'memory:test-root' });
      const mt = new MountTable();
      mt.mount('/', provider, { backend: 'memory', storageRootKey: 'memory:test-root' });

      const svc = new WorkspaceFileService({
        providerRegistry,
        resourceQueue: new ResourceQueue(),
        eventBus: new ChangeEventBus(),
        mountTable: mt,
      });

      await svc.writeFile('/test.txt', 'hello');
      const content = await svc.readFile('/test.txt', 'utf8');
      expect(content).toBe('hello');
    });
  });

  describe('boot topology routing', () => {
    // Project bootstrap contract pin: the cross-workspace `client.writeFiles`
    // path used by `createProject` (apps/ui/app/hooks/use-project-manager.tsx)
    // dispatches a bulk write keyed by absolute paths under sibling mount
    // prefixes. Backend selection MUST be owned by the mount table's
    // `_resolveProvider` longest-prefix match — the write call is purely
    // namespace-typed, never a workspace-resolver call. Regression coverage
    // for the WorkspacePathEscapeError class of bugs: switching `createProject`
    // to `client.writeFiles` is correct only if this routing contract holds.
    it('should route bulk writeFiles across sibling mount prefixes to the correct providers', async () => {
      const providerRegistry = new ProviderRegistry();
      const rootProvider = await providerRegistry.getProvider({ backend: 'memory', storageRootKey: 'memory:root' });
      const firstProjectProvider = await providerRegistry.getProvider({ backend: 'indexeddb' });
      const secondProjectProvider = await providerRegistry.getProvider({
        backend: 'memory',
        storageRootKey: 'memory:second-project',
      });
      const siblingMountTable = new MountTable();
      siblingMountTable.mount('/', rootProvider, { backend: 'memory', storageRootKey: 'memory:root' });
      siblingMountTable.mount('/projects/proj_A', firstProjectProvider, {
        backend: 'indexeddb',
        storageRootKey: providerRegistry.resolveStorageRootKey({ backend: 'indexeddb' }),
        providerBasePath: 'projects/proj_A',
      });
      siblingMountTable.mount('/projects/proj_B', secondProjectProvider, {
        backend: 'memory',
        storageRootKey: 'memory:second-project',
        providerBasePath: 'projects/proj_B',
      });
      const siblingEventBus = new ChangeEventBus();
      const crossTabCoordinator = new CrossTabCoordinator();
      const siblingService = new WorkspaceFileService({
        providerRegistry,
        resourceQueue: new ResourceQueue(),
        eventBus: siblingEventBus,
        crossTabCoordinator,
        mountTable: siblingMountTable,
      });
      const events: ChangeEvent[] = [];
      const unsubscribe = siblingEventBus.subscribe((event) => {
        events.push(event);
      });

      const firstMain = '/projects/proj_A/main.ts';
      const firstUtility = '/projects/proj_A/lib/util.ts';
      const secondMain = '/projects/proj_B/main.ts';

      try {
        await siblingService.writeFiles(
          {
            [firstMain]: { content: 'A main' },
            [firstUtility]: { content: 'A util' },
            [secondMain]: { content: 'B main' },
          },
          { originClientId: 'batch_author' },
        );

        // Each file lands under its own mount prefix; cross-isolation holds.
        expect(await siblingService.readFile(firstMain, 'utf8')).toBe('A main');
        expect(await siblingService.readFile(firstUtility, 'utf8')).toBe('A util');
        expect(await siblingService.readFile(secondMain, 'utf8')).toBe('B main');
        expect(await siblingService.exists('/projects/proj_A/B-main.ts')).toBe(false);
        expect(await siblingService.exists('/projects/proj_B/lib/util.ts')).toBe(false);

        const writtenEvents = events
          .filter((event) => event.type === 'fileWritten')
          .map((event) => ({ path: event.path, backend: event.backend, origin: getEventOrigin(event) }))
          .sort((a, b) => a.path.localeCompare(b.path));
        expect(writtenEvents).toEqual([
          { path: firstUtility, backend: 'indexeddb', origin: 'batch_author' },
          { path: firstMain, backend: 'indexeddb', origin: 'batch_author' },
          { path: secondMain, backend: 'memory', origin: 'batch_author' },
        ]);
      } finally {
        unsubscribe();
        siblingService.dispose();
        crossTabCoordinator.dispose();
      }
    });
  });
});
