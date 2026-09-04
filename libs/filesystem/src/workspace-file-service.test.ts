// oxlint-disable-next-line import/no-unassigned-import -- Side-effect import to polyfill IndexedDB for tests
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { WorkspaceFileService } from '#workspace-file-service.js';
import { ProviderRegistry } from '#provider-registry.js';
import { ResourceQueue } from '#resource-queue.js';
import { ChangeEventBus } from '#change-event-bus.js';
import { MountTable } from '#mount-table.js';
import type { CommitPendingProjectDirectoryResult, StorageRootConfig } from '#mount-table.js';
import { CrossTabCoordinator } from '#cross-tab-coordinator.js';
import { DirectIdbProvider } from '#backend/direct-idb-provider.js';
import { SharedPool } from '@taucad/memory';
import type { ChangeEvent, FileSystemProvider, WatchEvent } from '#types.js';
import { getEventOrigin } from '#event-origin-registry.js';
import {
  parseProjectManifestBytes,
  projectManifestSchemaUrl,
  projectToManifest,
  serializeProjectManifest,
} from '@taucad/types';
import type { ProjectManifest } from '@taucad/types';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
let databaseSequence = 0;

/**
 * Poll a predicate until it becomes true. Used to await asynchronous
 * timer-driven side effects (e.g. EventCoalescer flushes) without coupling
 * the test to a specific wall-clock duration. Pure scheduler-bounded waits
 * are inherently flaky on loaded CI runners; this loop is bounded by
 * `timeout` (milliseconds) instead, so a slow scheduler delays the test rather
 * than failing it.
 */
async function waitFor(predicate: () => boolean, waitTimeout = 2000, pollInterval = 5): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > waitTimeout) {
      throw new Error(`waitFor timed out after ${waitTimeout}ms`);
    }
    // oxlint-disable-next-line no-await-in-loop -- Sequential execution is intentional for polling
    await new Promise((resolve) => {
      setTimeout(resolve, pollInterval);
    });
  }
}

async function createWorkspaceFileService(options?: { crossTabCoordinator?: CrossTabCoordinator }) {
  const providerRegistry = new ProviderRegistry({ databasePrefix: `tau-workspace-test-${databaseSequence++}` });
  const provider = await providerRegistry.getProvider({ backend: 'memory', storageRootKey: 'memory:0' });

  const mountTable = new MountTable();
  mountTable.mount('/', provider, { backend: 'memory', storageRootKey: 'memory:0' });

  const resourceQueue = new ResourceQueue();
  const eventBus = new ChangeEventBus();

  const service = new WorkspaceFileService({
    providerRegistry,
    resourceQueue,
    eventBus,
    crossTabCoordinator: options?.crossTabCoordinator,
    mountTable,
  });

  return { service, eventBus, providerRegistry, resourceQueue, mountTable, provider };
}

describe('WorkspaceFileService', () => {
  let service: WorkspaceFileService;
  let eventBus: ChangeEventBus;
  let providerRegistry: ProviderRegistry;
  let rootProvider: FileSystemProvider;

  beforeEach(async () => {
    const context = await createWorkspaceFileService();
    service = context.service;
    eventBus = context.eventBus;
    providerRegistry = context.providerRegistry;
    rootProvider = context.provider;
  });

  describe('project discovery', () => {
    const manifestProject = (id: string, name = id): ProjectManifest =>
      projectToManifest({
        id,
        name,
        description: '',
        tags: [],
        assets: { main: { entryPath: 'main.ts' } },
      });

    const writeManifest = async (
      provider: FileSystemProvider,
      directory: string,
      project: ProjectManifest,
    ): Promise<void> => {
      await provider.mkdir(directory);
      await provider.writeFile(`${directory}/tau.json`, serializeProjectManifest(projectToManifest(project)));
    };

    it('discovers valid manifests and applies deterministic duplicate-id ordering', async () => {
      const provider = await providerRegistry.getProvider({ backend: 'indexeddb' });
      const duplicateId = 'proj_aaaaaaaaaaaaaaaaaaaaa';
      await writeManifest(provider, 'b-copy', manifestProject(duplicateId, 'copy'));
      await writeManifest(provider, 'a-original', manifestProject(duplicateId, 'original'));
      await service.configureProjectRoots({
        projects: [],
        roots: [{ backend: 'indexeddb' }],
      });

      const result = await service.listProjectManifests();
      expect(result.entries.map((entry) => [entry.locator.relativeDirectory, entry.status])).toEqual([
        ['a-original', 'duplicate-id'],
        ['b-copy', 'duplicate-id'],
      ]);
      expect(result.roots).toEqual([{ status: 'complete', root: { backend: 'indexeddb' } }]);
    });

    it('surfaces a malformed id as adoption-required without mutating the file', async () => {
      const provider = await providerRegistry.getProvider({ backend: 'indexeddb' });
      const source = projectToManifest(manifestProject('proj_bbbbbbbbbbbbbbbbbbbbb', 'Dropped')) as Record<
        string,
        unknown
      >;
      source['id'] = 'copied-folder';
      await provider.mkdir('dropped');
      const bytes = encoder.encode(JSON.stringify(source));
      await provider.writeFile('dropped/tau.json', bytes);
      await service.configureProjectRoots({
        projects: [],
        roots: [{ backend: 'indexeddb' }],
      });

      expect(await service.listProjectManifests()).toMatchObject({
        entries: [
          {
            status: 'adoption-required',
            locator: { relativeDirectory: 'dropped' },
            manifest: { name: 'Dropped' },
          },
        ],
      });
      expect(await provider.readFile('dropped/tau.json')).toEqual(bytes);
    });

    // R11 — `adoption-required` used to be a dead-end banner.
    describe('adoptProjectDirectory', () => {
      const adoptable = {
        $schema: projectManifestSchemaUrl,
        name: 'Dropped',
        description: 'copied without its identity',
        tags: ['gearbox', 'v2'],
        assets: { main: { entryPath: 'main.ts', thumbnail: 'thumb.png' } },
      };

      const writeRaw = async (provider: FileSystemProvider, directory: string, value: unknown): Promise<void> => {
        await provider.mkdir(directory);
        await provider.writeFile(`${directory}/tau.json`, encoder.encode(JSON.stringify(value)));
        await service.configureProjectRoots({ projects: [], roots: [{ backend: 'indexeddb' }] });
      };

      const locatorFor = async (directory: string) => {
        const { entries } = await service.listProjectManifests();
        const entry = entries.find((candidate) => candidate.locator.relativeDirectory === directory);
        if (!entry) {
          throw new Error(`No discovery entry for /${directory}`);
        }
        return entry.locator;
      };

      it('mints an identity in place and preserves every other field byte-stably', async () => {
        const provider = await providerRegistry.getProvider({ backend: 'indexeddb' });
        await writeRaw(provider, 'dropped', { ...adoptable, id: 'copied-folder' });

        const adopted = await service.adoptProjectDirectory(await locatorFor('dropped'));

        expect(adopted).toEqual({ ...adoptable, id: adopted.id });
        expect(adopted.id).toMatch(/^proj_[\dA-Za-z]{21}$/);
        expect(await provider.readFile('dropped/tau.json')).toEqual(serializeProjectManifest(adopted));
        expect(await service.listProjectManifests()).toMatchObject({
          entries: [{ status: 'valid', manifest: { id: adopted.id, name: 'Dropped' } }],
        });
      });

      it('refuses a manifest that already carries a valid identity', async () => {
        const provider = await providerRegistry.getProvider({ backend: 'indexeddb' });
        const identified = manifestProject('proj_eeeeeeeeeeeeeeeeeeeee', 'Identified');
        await writeRaw(provider, 'identified', identified);
        const locator = await locatorFor('identified');

        await expect(service.adoptProjectDirectory(locator)).rejects.toThrow(TypeError);
        expect(decoder.decode(await provider.readFile('identified/tau.json'))).toBe(JSON.stringify(identified));
      });

      it('refuses a manifest whose damage is not confined to its id', async () => {
        const provider = await providerRegistry.getProvider({ backend: 'indexeddb' });
        const broken = { ...adoptable, id: 'copied-folder', assets: { main: { entryPath: '../escape.ts' } } };
        await writeRaw(provider, 'broken', broken);
        const locator = await locatorFor('broken');

        await expect(service.adoptProjectDirectory(locator)).rejects.toThrow(TypeError);
        expect(decoder.decode(await provider.readFile('broken/tau.json'))).toBe(JSON.stringify(broken));
      });
    });

    it('strictly quarantines unsafe structural and presentation data', async () => {
      const provider = await providerRegistry.getProvider({ backend: 'indexeddb' });
      const unsafe = {
        ...projectToManifest(manifestProject('proj_ccccccccccccccccccccc')),
        assets: { main: { entryPath: '../escape.ts' } },
      };
      await provider.mkdir('unsafe');
      await provider.writeFile('unsafe/tau.json', encoder.encode(JSON.stringify(unsafe)));
      const salvaged = {
        ...projectToManifest(manifestProject('proj_ddddddddddddddddddddd')),
        name: 42,
      };
      await provider.mkdir('salvaged');
      await provider.writeFile('salvaged/tau.json', encoder.encode(JSON.stringify(salvaged)));
      await service.configureProjectRoots({
        projects: [],
        roots: [{ backend: 'indexeddb' }],
      });

      const { entries } = await service.listProjectManifests();
      expect(entries.find((entry) => entry.locator.relativeDirectory === 'unsafe')).toMatchObject({
        status: 'invalid',
      });
      expect(entries.find((entry) => entry.locator.relativeDirectory === 'salvaged')).toMatchObject({
        status: 'invalid',
      });
    });

    it('reports one unreadable child directory without discarding the rest of the root', async () => {
      const provider = await providerRegistry.getProvider({ backend: 'indexeddb' });
      const readable = manifestProject('proj_rrrrrrrrrrrrrrrrrrrrr');
      await writeManifest(provider, 'b-readable', readable);
      await provider.mkdir('a-unreadable');
      vi.spyOn(provider, 'readFile').mockRejectedValueOnce(new Error('storage unavailable'));
      await service.configureProjectRoots({ projects: [], roots: [{ backend: 'indexeddb' }] });

      await expect(service.listProjectManifests()).resolves.toMatchObject({
        entries: [
          {
            status: 'invalid',
            locator: { relativeDirectory: 'a-unreadable' },
            issue: { code: 'manifest-unreadable', message: 'storage unavailable' },
          },
          { status: 'valid', manifest: { id: readable.id }, locator: { relativeDirectory: 'b-readable' } },
        ],
        roots: [{ status: 'complete', root: { backend: 'indexeddb' } }],
      });
    });

    it('marks a root inaccessible when the root listing itself fails', async () => {
      const provider = await providerRegistry.getProvider({ backend: 'indexeddb' });
      await writeManifest(provider, 'b-readable', manifestProject('proj_rrrrrrrrrrrrrrrrrrrrr'));
      vi.spyOn(provider, 'readdirEntries').mockRejectedValueOnce(new Error('root unavailable'));
      await service.configureProjectRoots({ projects: [], roots: [{ backend: 'indexeddb' }] });

      await expect(service.listProjectManifests()).resolves.toEqual({
        entries: [],
        roots: [{ status: 'inaccessible', root: { backend: 'indexeddb' }, reason: 'root unavailable' }],
      });
    });

    it('discovers manifest-bearing root children and never probes dot-directories or files', async () => {
      const provider = await providerRegistry.getProvider({ backend: 'indexeddb' });
      await writeManifest(provider, 'alpha', manifestProject('proj_aaaaaaaaaaaaaaaaaaaaa'));
      await writeManifest(provider, 'beta', manifestProject('proj_bbbbbbbbbbbbbbbbbbbbb'));
      await writeManifest(provider, '.tau', manifestProject('proj_ttttttttttttttttttttt'));
      await provider.mkdir('.tau/imports', { recursive: true });
      await provider.mkdir('no-manifest');
      await provider.writeFile('loose.txt', encoder.encode('loose'));
      const stat = vi.spyOn(provider, 'stat');
      const readFile = vi.spyOn(provider, 'readFile');
      await service.configureProjectRoots({ projects: [], roots: [{ backend: 'indexeddb' }] });

      const result = await service.listProjectManifests();

      expect(result.entries.map((entry) => [entry.locator.relativeDirectory, entry.status])).toEqual([
        ['alpha', 'valid'],
        ['beta', 'valid'],
      ]);
      expect(readFile.mock.calls.map(([path]) => path)).toEqual([
        'alpha/tau.json',
        'beta/tau.json',
        'no-manifest/tau.json',
      ]);
      expect(stat).not.toHaveBeenCalled();
    });

    it('probes manifests with bounded concurrency in deterministic order', async () => {
      const provider = await providerRegistry.getProvider({ backend: 'indexeddb' });
      const names = Array.from({ length: 40 }, (_, index) => `p${String(index).padStart(2, '0')}`);
      for (const [index, name] of names.entries()) {
        // oxlint-disable-next-line no-await-in-loop -- Fixture writes are sequential for determinism.
        await writeManifest(provider, name, manifestProject(`proj_${String(index).padStart(21, 'z')}`));
      }
      let inFlight = 0;
      let maxInFlight = 0;
      const readManifest = provider.readFile.bind(provider);
      vi.spyOn(provider, 'readFile').mockImplementation((async (path: string) => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => {
          setTimeout(resolve, 0);
        });
        try {
          return await readManifest(path);
        } finally {
          inFlight--;
        }
      }) as FileSystemProvider['readFile']);
      await service.configureProjectRoots({ projects: [], roots: [{ backend: 'indexeddb' }] });

      const result = await service.listProjectManifests();

      expect(result.entries.map((entry) => entry.locator.relativeDirectory)).toEqual(names);
      expect(maxInFlight).toBe(16);
    });

    it('discovers out-of-band project creation from the external-change path without refreshing per scan', async () => {
      const provider = await providerRegistry.getProvider({ backend: 'indexeddb' });
      await service.configureProjectRoots({ projects: [], roots: [{ backend: 'indexeddb' }] });
      const dbName = (provider as unknown as { _dbName: string })._dbName;
      const peer = new DirectIdbProvider('unused');
      (peer as unknown as { _dbName: string })._dbName = dbName;
      await peer.initialize();
      const project = manifestProject('proj_ooooooooooooooooooooo', 'Out of band');
      await writeManifest(peer, 'out-of-band', project);
      const refresh = vi.spyOn(provider, 'refresh');
      const sender = new BroadcastChannel('tau-fs-changes');

      try {
        sender.postMessage({
          type: 'directory-change',
          path: '/',
          authority: {
            storageRootKey: providerRegistry.resolveStorageRootKey({ backend: 'indexeddb' }),
            providerBasePath: '',
          },
        });
        await waitFor(() => refresh.mock.calls.length > 0);
        refresh.mockClear();

        await expect(service.listProjectManifests()).resolves.toMatchObject({
          entries: [
            {
              status: 'valid',
              manifest: { id: project.id },
              locator: { relativeDirectory: 'out-of-band' },
            },
          ],
        });
        expect(refresh).not.toHaveBeenCalled();
      } finally {
        sender.close();
        peer.dispose();
      }
    });

    it('ignores a directory notification that does not match the known physical authority', async () => {
      const provider = await providerRegistry.getProvider({ backend: 'indexeddb' });
      await service.configureProjectRoots({ projects: [], roots: [{ backend: 'indexeddb' }] });
      const refresh = vi.spyOn(provider, 'refresh');
      const changes: ChangeEvent[] = [];
      const unsubscribe = eventBus.subscribe((event) => changes.push(event));
      const sender = new BroadcastChannel('tau-fs-changes');

      try {
        sender.postMessage({
          type: 'directory-change',
          path: '/unrelated',
          authority: {
            storageRootKey: providerRegistry.resolveStorageRootKey({ backend: 'indexeddb' }),
            providerBasePath: 'different-project',
          },
        });
        await new Promise((resolve) => {
          setTimeout(resolve, 20);
        });

        expect(refresh).not.toHaveBeenCalled();
        expect(changes).toEqual([]);
      } finally {
        sender.close();
        unsubscribe();
      }
    });
  });

  describe('permanentlyDeleteProjectDirectory', () => {
    const projectId = 'proj_eeeeeeeeeeeeeeeeeeeee';
    const directory = 'readable-project';
    const scope: StorageRootConfig = { backend: 'indexeddb' };

    beforeEach(async () => {
      rootProvider = await providerRegistry.getProvider(scope);
    });

    const writePhysicalProject = async (id = projectId): Promise<void> => {
      await rootProvider.mkdir(directory, { recursive: true });
      await rootProvider.writeFile(
        `${directory}/tau.json`,
        serializeProjectManifest(
          projectToManifest({
            id,
            name: 'Readable Project',
            description: '',
            tags: [],
            assets: { main: { entryPath: 'main.ts' } },
          }),
        ),
      );
      await rootProvider.writeFile(`${directory}/main.ts`, encoder.encode('export default {};'));
    };

    it('rejects an untyped memory scope before provider or storage-key lookup', async () => {
      const resolveStorageRootKey = vi.spyOn(providerRegistry, 'resolveStorageRootKey');
      const getProvider = vi.spyOn(providerRegistry, 'getProvider');

      await expect(
        service.permanentlyDeleteProjectDirectory({
          projectId,
          providerBasePath: directory,
          scope: { backend: 'memory', storageRootKey: 'memory:forbidden' },
        } as unknown as Parameters<WorkspaceFileService['permanentlyDeleteProjectDirectory']>[0]),
      ).rejects.toThrow('durable storage');
      expect(resolveStorageRootKey).not.toHaveBeenCalled();
      expect(getProvider).not.toHaveBeenCalled();
    });

    it('deletes only the exact directory after re-establishing manifest identity', async () => {
      await writePhysicalProject();

      await expect(
        service.permanentlyDeleteProjectDirectory({
          projectId,
          providerBasePath: directory,
          scope,
        }),
      ).resolves.toEqual({ status: 'deleted' });

      expect(await rootProvider.exists(directory)).toBe(false);
    });

    it('is idempotent when the exact directory is already absent', async () => {
      await expect(
        service.permanentlyDeleteProjectDirectory({
          projectId,
          providerBasePath: directory,
          scope,
        }),
      ).resolves.toEqual({ status: 'absent' });
    });

    it('preserves every byte when the manifest belongs to another project', async () => {
      const actualProjectId = 'proj_fffffffffffffffffffff';
      await writePhysicalProject(actualProjectId);

      await expect(
        service.permanentlyDeleteProjectDirectory({
          projectId,
          providerBasePath: directory,
          scope,
        }),
      ).resolves.toEqual({ status: 'identity-mismatch', actualProjectId });

      expect(await rootProvider.exists(`${directory}/main.ts`)).toBe(true);
    });

    it('preserves a non-empty directory that has no identifiable manifest', async () => {
      await rootProvider.mkdir(directory, { recursive: true });
      await rootProvider.writeFile(`${directory}/user-file.txt`, encoder.encode('keep me'));

      await expect(
        service.permanentlyDeleteProjectDirectory({
          projectId,
          providerBasePath: directory,
          scope,
        }),
      ).resolves.toEqual({ status: 'unidentifiable' });

      expect(decoder.decode(await rootProvider.readFile(`${directory}/user-file.txt`))).toBe('keep me');
    });

    it('preserves an empty manifest-less directory', async () => {
      await rootProvider.mkdir(directory, { recursive: true });

      await expect(
        service.permanentlyDeleteProjectDirectory({ projectId, providerBasePath: directory, scope }),
      ).resolves.toEqual({ status: 'unidentifiable' });

      expect(await rootProvider.exists(directory)).toBe(true);
    });

    it.each([
      { name: 'an invalid project id', projectId: '../invalid', providerBasePath: directory },
      { name: 'a slash-prefixed path', projectId, providerBasePath: '/readable-project' },
      { name: 'a non-canonical path', projectId, providerBasePath: 'readable-project/../readable-project' },
      { name: 'a nested project path', projectId, providerBasePath: `${directory}/nested` },
      { name: 'a workspace-state directory', projectId, providerBasePath: '.tau' },
      { name: 'the workspace root itself', projectId, providerBasePath: '' },
    ])('rejects $name before provider access', async ({ projectId: inputProjectId, providerBasePath }) => {
      const getProvider = vi.spyOn(providerRegistry, 'getProvider');

      await expect(
        service.permanentlyDeleteProjectDirectory({
          projectId: inputProjectId,
          providerBasePath,
          scope,
        }),
      ).rejects.toThrow();

      expect(getProvider).not.toHaveBeenCalled();
    });

    it.each([
      { name: 'an absent directory', fixture: 'absent', expected: { status: 'absent' } },
      {
        name: 'a foreign manifest',
        fixture: 'foreign',
        expected: { status: 'identity-mismatch', actualProjectId: 'proj_fffffffffffffffffffff' },
      },
      { name: 'a manifest-less directory', fixture: 'unidentifiable', expected: { status: 'unidentifiable' } },
    ])('keeps $name silent', async ({ fixture, expected }) => {
      const coordinator = new CrossTabCoordinator();
      const notifyProjectUnavailable = vi.spyOn(coordinator, 'notifyProjectUnavailable');
      const context = await createWorkspaceFileService({ crossTabCoordinator: coordinator });
      const deleteProvider = await context.providerRegistry.getProvider(scope);
      const events: ChangeEvent[] = [];
      context.eventBus.subscribe((event) => events.push(event));
      if (fixture !== 'absent') {
        await deleteProvider.mkdir(directory, { recursive: true });
      }
      if (fixture === 'foreign') {
        await deleteProvider.writeFile(
          `${directory}/tau.json`,
          serializeProjectManifest(
            projectToManifest({
              id: 'proj_fffffffffffffffffffff',
              name: 'Foreign',
              description: '',
              tags: [],
              assets: { main: { entryPath: 'main.ts' } },
            }),
          ),
        );
      }

      try {
        await expect(
          context.service.permanentlyDeleteProjectDirectory({ projectId, providerBasePath: directory, scope }),
        ).resolves.toEqual(expected);
        expect(events).toEqual([]);
        expect(notifyProjectUnavailable).not.toHaveBeenCalled();
      } finally {
        context.service.dispose();
      }
    });

    it('keeps the manifest as replay evidence when deletion fails, then safely retries', async () => {
      await writePhysicalProject();
      const manifestPath = `${directory}/tau.json`;
      const originalUnlink = rootProvider.unlink.bind(rootProvider);
      let rejectManifest = true;
      vi.spyOn(rootProvider, 'unlink').mockImplementation(async (path) => {
        if (path === manifestPath && rejectManifest) {
          rejectManifest = false;
          throw new Error('manifest delete failed');
        }
        await originalUnlink(path);
      });

      await expect(
        service.permanentlyDeleteProjectDirectory({ projectId, providerBasePath: directory, scope }),
      ).rejects.toThrow('manifest delete failed');
      expect(await rootProvider.exists(manifestPath)).toBe(true);

      await expect(
        service.permanentlyDeleteProjectDirectory({ projectId, providerBasePath: directory, scope }),
      ).resolves.toEqual({ status: 'deleted' });
      expect(await rootProvider.exists(directory)).toBe(false);
    });

    it('restores the exact manifest bytes when final directory removal fails', async () => {
      await writePhysicalProject();
      const manifestPath = `${directory}/tau.json`;
      const manifest = await rootProvider.readFile(manifestPath);
      const originalRmdir = rootProvider.rmdir.bind(rootProvider);
      let rejectFinalDirectory = true;
      vi.spyOn(rootProvider, 'rmdir').mockImplementation(async (path) => {
        if (path === directory && rejectFinalDirectory) {
          rejectFinalDirectory = false;
          throw new Error('final directory removal failed');
        }
        await originalRmdir(path);
      });

      await expect(
        service.permanentlyDeleteProjectDirectory({ projectId, providerBasePath: directory, scope }),
      ).rejects.toThrow('final directory removal failed');
      expect(await rootProvider.readFile(manifestPath)).toEqual(manifest);

      await expect(
        service.permanentlyDeleteProjectDirectory({ projectId, providerBasePath: directory, scope }),
      ).resolves.toEqual({ status: 'deleted' });
    });

    it('holds both the logical project lock and exact physical-directory lock', async () => {
      const coordinator = new CrossTabCoordinator();
      const withLocks = vi.spyOn(coordinator, 'withLocks');
      const context = await createWorkspaceFileService({ crossTabCoordinator: coordinator });
      const queueForMany = vi.spyOn(context.resourceQueue, 'queueForMany');
      const physicalLock = `${context.providerRegistry.resolveStorageRootKey(scope)}:${directory}`;

      try {
        await context.service.permanentlyDeleteProjectDirectory({
          projectId,
          providerBasePath: directory,
          scope,
        });

        expect(withLocks).toHaveBeenCalledWith([`project:${projectId}`, physicalLock], expect.any(Function));
        expect(queueForMany).toHaveBeenCalledWith([`project:${projectId}`, physicalLock], expect.any(Function));
      } finally {
        context.service.dispose();
        coordinator.dispose();
      }
    });
  });

  describe('commitPendingProjectDirectory', () => {
    const projectId = 'proj_ppppppppppppppppppppp';
    const directory = 'pending-project';
    const scope: StorageRootConfig = { backend: 'indexeddb' };
    let commitProvider: FileSystemProvider;
    const mainFile = 'main.ts';
    const escapeFile = '../escape.ts';
    const nestedManifest = 'nested/tau.json';
    const absoluteMainFile = '/main.ts';
    const nonCanonicalMainFile = 'src/./main.ts';
    const canonicalMainFile = 'src/main.ts';
    const manifestDescendant = 'tau.json/child';
    const punctuationSibling = 'src!/sibling.ts';
    const punctuationManifestSibling = 'tau.json!/sibling';
    const manifest = serializeProjectManifest(
      projectToManifest({
        id: projectId,
        name: 'Pending Project',
        description: '',
        tags: [],
        assets: { main: { entryPath: mainFile } },
      }),
    );
    const defaultFiles = {
      [mainFile]: { content: encoder.encode('export default {};') },
    };
    const commit = async (
      files: Record<string, { content: Uint8Array<ArrayBuffer> }> = defaultFiles,
    ): Promise<CommitPendingProjectDirectoryResult> => {
      const result = await service.commitPendingProjectDirectory({
        providerBasePath: directory,
        scope,
        files,
        manifest,
      });
      return result;
    };

    beforeEach(async () => {
      commitProvider = await providerRegistry.getProvider(scope);
    });

    it('rejects a memory scope before storage-key resolution or provider access', async () => {
      const resolveStorageRootKey = vi.spyOn(providerRegistry, 'resolveStorageRootKey');
      const getProvider = vi.spyOn(providerRegistry, 'getProvider');

      await expect(
        service.commitPendingProjectDirectory({
          providerBasePath: directory,
          scope: { backend: 'memory', storageRootKey: 'memory:forbidden' },
          files: defaultFiles,
          manifest,
        } as unknown as Parameters<WorkspaceFileService['commitPendingProjectDirectory']>[0]),
      ).rejects.toThrow('durable storage');

      expect(resolveStorageRootKey).not.toHaveBeenCalled();
      expect(getProvider).not.toHaveBeenCalled();
    });

    it.each([new Map([[mainFile, { content: encoder.encode('lost') }]]), new Date(0)])(
      'rejects non-record file collections before provider access',
      async (files) => {
        const getProvider = vi.spyOn(providerRegistry, 'getProvider');

        await expect(
          service.commitPendingProjectDirectory({
            providerBasePath: directory,
            scope,
            files,
            manifest,
          } as unknown as Parameters<WorkspaceFileService['commitPendingProjectDirectory']>[0]),
        ).rejects.toThrow('record');

        expect(getProvider).not.toHaveBeenCalled();
        await expect(commitProvider.exists(directory)).resolves.toBe(false);
      },
    );

    it('replaces manifest-less residue and writes the manifest last', async () => {
      await commitProvider.mkdir(directory, { recursive: true });
      await commitProvider.writeFile(`${directory}/stale.bin`, encoder.encode('stale'));
      const writes: string[] = [];
      const originalWriteFile = commitProvider.writeFile.bind(commitProvider);
      vi.spyOn(commitProvider, 'writeFile').mockImplementation(async (path, data) => {
        writes.push(path);
        return originalWriteFile(path, data);
      });

      await expect(commit()).resolves.toEqual({ status: 'committed' });

      expect(await commitProvider.exists(`${directory}/stale.bin`)).toBe(false);
      expect(decoder.decode(await commitProvider.readFile(`${directory}/main.ts`))).toBe('export default {};');
      expect(writes.at(-1)).toBe(`${directory}/tau.json`);
    });

    it('is idempotent for an existing same-project manifest', async () => {
      await expect(commit()).resolves.toEqual({ status: 'committed' });
      await expect(commit({ [mainFile]: { content: encoder.encode('different') } })).resolves.toEqual({
        status: 'already-committed',
      });

      expect(decoder.decode(await commitProvider.readFile(`${directory}/main.ts`))).toBe('export default {};');
    });

    it('preserves an existing foreign or unidentifiable manifest', async () => {
      const foreignId = 'proj_qqqqqqqqqqqqqqqqqqqqq';
      await commitProvider.mkdir(directory, { recursive: true });
      await commitProvider.writeFile(
        `${directory}/tau.json`,
        serializeProjectManifest(
          projectToManifest({
            id: foreignId,
            name: 'Foreign',
            description: '',
            tags: [],
            assets: { main: { entryPath: 'main.ts' } },
          }),
        ),
      );
      await commitProvider.writeFile(`${directory}/keep.txt`, encoder.encode('keep'));

      await expect(commit()).resolves.toEqual({ status: 'identity-mismatch', actualProjectId: foreignId });
      expect(decoder.decode(await commitProvider.readFile(`${directory}/keep.txt`))).toBe('keep');

      await commitProvider.writeFile(`${directory}/tau.json`, encoder.encode('{invalid'));
      await expect(commit()).resolves.toEqual({ status: 'unidentifiable-manifest' });
      expect(decoder.decode(await commitProvider.readFile(`${directory}/keep.txt`))).toBe('keep');
    });

    it('validates every path before mutating residue', async () => {
      await commitProvider.mkdir(directory, { recursive: true });
      await commitProvider.writeFile(`${directory}/keep.txt`, encoder.encode('keep'));

      await expect(
        commit({
          [escapeFile]: { content: encoder.encode('escape') },
          [nestedManifest]: { content: manifest },
        }),
      ).rejects.toThrow('unsafe');

      expect(decoder.decode(await commitProvider.readFile(`${directory}/keep.txt`))).toBe('keep');
    });

    it.each([
      {
        name: 'an invalid manifest',
        input: { manifest: encoder.encode('{invalid') },
      },
      {
        name: 'a nested target',
        input: { providerBasePath: 'projects/pending-project' },
      },
      {
        name: 'a workspace-state target',
        input: { providerBasePath: '.tau' },
      },
      {
        name: 'a slash-prefixed target',
        input: { providerBasePath: '/pending-project' },
      },
      {
        name: 'an absolute journal path',
        input: { files: { [absoluteMainFile]: { content: encoder.encode('unsafe') } } },
      },
      {
        name: 'a non-canonical colliding journal path',
        input: {
          files: {
            [nonCanonicalMainFile]: { content: encoder.encode('first') },
            [canonicalMainFile]: { content: encoder.encode('second') },
          },
        },
      },
      {
        name: 'a nested manifest',
        input: { files: { [nestedManifest]: { content: manifest } } },
      },
      {
        name: 'a file whose descendant is also a file',
        input: {
          files: {
            src: { content: encoder.encode('file') },
            [canonicalMainFile]: { content: encoder.encode('descendant') },
          },
        },
      },
      {
        name: 'a punctuation-interposed file ancestor collision',
        input: {
          files: {
            src: { content: encoder.encode('file') },
            [punctuationSibling]: { content: encoder.encode('punctuation') },
            [canonicalMainFile]: { content: encoder.encode('descendant') },
          },
        },
      },
      {
        name: 'a file below the reserved manifest path',
        input: { files: { [manifestDescendant]: { content: encoder.encode('unsafe') } } },
      },
      {
        name: 'a punctuation-interposed file below the reserved manifest path',
        input: {
          files: {
            [punctuationManifestSibling]: { content: encoder.encode('punctuation') },
            [manifestDescendant]: { content: encoder.encode('unsafe') },
          },
        },
      },
      {
        name: 'a non-binary payload',
        input: { files: { [mainFile]: { content: 'not-bytes' } } },
      },
    ])('rejects $name before mutating residue', async ({ input }) => {
      await commitProvider.mkdir(directory, { recursive: true });
      await commitProvider.writeFile(`${directory}/keep.txt`, encoder.encode('keep'));

      await expect(
        service.commitPendingProjectDirectory({
          providerBasePath: directory,
          scope,
          files: { [mainFile]: { content: encoder.encode('export default {};') } },
          manifest,
          ...input,
        } as Parameters<WorkspaceFileService['commitPendingProjectDirectory']>[0]),
      ).rejects.toThrow();

      expect(decoder.decode(await commitProvider.readFile(`${directory}/keep.txt`))).toBe('keep');
    });

    it('leaves no commit marker after a failed manifest write and retries exactly', async () => {
      const originalWriteFile = commitProvider.writeFile.bind(commitProvider);
      vi.spyOn(commitProvider, 'writeFile')
        .mockImplementationOnce(async (path, data) => {
          await originalWriteFile(path, data);
        })
        .mockRejectedValueOnce(new Error('manifest write failed'))
        .mockImplementation(async (path, data) => {
          await originalWriteFile(path, data);
        });

      await expect(commit()).rejects.toThrow('manifest write failed');
      expect(await commitProvider.exists(`${directory}/tau.json`)).toBe(false);

      await expect(commit()).resolves.toEqual({ status: 'committed' });
      expect(decoder.decode(await commitProvider.readFile(`${directory}/main.ts`))).toBe('export default {};');
    });

    it('invalidates sibling projections after a partially mutating failure', async () => {
      const coordinator = new CrossTabCoordinator();
      const notifyDirectoryChange = vi.spyOn(coordinator, 'notifyDirectoryChange');
      const context = await createWorkspaceFileService({ crossTabCoordinator: coordinator });
      const provider = await context.providerRegistry.getProvider(scope);
      const originalWriteFile = provider.writeFile.bind(provider);
      vi.spyOn(provider, 'writeFile')
        .mockImplementationOnce(async (path, data) => {
          await originalWriteFile(path, data);
        })
        .mockRejectedValueOnce(new Error('manifest write failed'));

      try {
        await expect(
          context.service.commitPendingProjectDirectory({
            providerBasePath: directory,
            scope,
            files: { [mainFile]: { content: encoder.encode('export default {};') } },
            manifest,
          }),
        ).rejects.toThrow('manifest write failed');

        expect(await provider.exists(`${directory}/main.ts`)).toBe(true);
        expect(await provider.exists(`${directory}/tau.json`)).toBe(false);
        expect(notifyDirectoryChange).toHaveBeenCalledOnce();
        expect(notifyDirectoryChange).toHaveBeenCalledWith(`/projects/${projectId}`, {
          storageRootKey: context.providerRegistry.resolveStorageRootKey(scope),
          providerBasePath: directory,
        });
      } finally {
        context.service.dispose();
        coordinator.dispose();
      }
    });

    it('holds logical and physical locks and publishes one directory invalidation', async () => {
      const coordinator = new CrossTabCoordinator();
      const withLocks = vi.spyOn(coordinator, 'withLocks');
      const notifyDirectoryChange = vi.spyOn(coordinator, 'notifyDirectoryChange');
      const context = await createWorkspaceFileService({ crossTabCoordinator: coordinator });
      const queueForMany = vi.spyOn(context.resourceQueue, 'queueForMany');

      try {
        await context.service.commitPendingProjectDirectory({
          providerBasePath: directory,
          scope,
          files: { [mainFile]: { content: encoder.encode('export default {};') } },
          manifest,
        });

        expect(withLocks).toHaveBeenCalledWith(
          [`project:${projectId}`, `${context.providerRegistry.resolveStorageRootKey(scope)}:${directory}`],
          expect.any(Function),
        );
        expect(queueForMany).toHaveBeenCalledWith(
          [`project:${projectId}`, `${context.providerRegistry.resolveStorageRootKey(scope)}:${directory}`],
          expect.any(Function),
        );
        expect(notifyDirectoryChange).toHaveBeenCalledOnce();
        expect(notifyDirectoryChange).toHaveBeenCalledWith(`/projects/${projectId}`, {
          storageRootKey: context.providerRegistry.resolveStorageRootKey(scope),
          providerBasePath: directory,
        });
      } finally {
        context.service.dispose();
        coordinator.dispose();
      }
    });

    it('serializes concurrent commits into one write and one idempotent replay', async () => {
      const results = await Promise.all([commit(), commit()]);

      expect(results.map((result) => result.status).sort()).toEqual(['already-committed', 'committed']);
      expect(decoder.decode(await commitProvider.readFile(`${directory}/main.ts`))).toBe('export default {};');
      expect(parseProjectManifestBytes(await commitProvider.readFile(`${directory}/tau.json`))).toMatchObject({
        success: true,
        data: { id: projectId },
      });
    });

    it('owns manifest and file bytes before awaiting provider acquisition', async () => {
      const releaseProvider = Promise.withResolvers<void>();
      const providerRequested = Promise.withResolvers<void>();
      const originalGetProvider = providerRegistry.getProvider.bind(providerRegistry);
      vi.spyOn(providerRegistry, 'getProvider').mockImplementation(async (requestedScope) => {
        providerRequested.resolve();
        await releaseProvider.promise;
        return originalGetProvider(requestedScope);
      });
      const mutableManifest = new Uint8Array(manifest);
      const mutableContent = encoder.encode('owned content');
      const pending = service.commitPendingProjectDirectory({
        providerBasePath: directory,
        scope,
        files: { [mainFile]: { content: mutableContent } },
        manifest: mutableManifest,
      });
      await providerRequested.promise;
      mutableManifest.fill(0);
      mutableContent.fill(0);
      releaseProvider.resolve();

      await expect(pending).resolves.toEqual({ status: 'committed' });
      await expect(commitProvider.readFile(`${directory}/main.ts`, 'utf8')).resolves.toBe('owned content');
      expect(parseProjectManifestBytes(await commitProvider.readFile(`${directory}/tau.json`))).toMatchObject({
        success: true,
        data: { id: projectId },
      });
    });

    it('refreshes stale IndexedDB authority state before replaying a committed project', async () => {
      const databasePrefix = `tau-two-authority-${databaseSequence++}`;
      const createAuthority = async () => {
        const registry = new ProviderRegistry({ databasePrefix });
        const provider = await registry.getProvider({ backend: 'memory', storageRootKey: 'memory:test-root' });
        const mountTable = new MountTable();
        mountTable.mount('/', provider, { backend: 'memory', storageRootKey: 'memory:test-root' });
        return {
          registry,
          service: new WorkspaceFileService({
            providerRegistry: registry,
            resourceQueue: new ResourceQueue(),
            eventBus: new ChangeEventBus(),
            mountTable,
          }),
        };
      };
      const first = await createAuthority();
      const second = await createAuthority();
      const indexedDbScope = { backend: 'indexeddb' } as const;
      const firstProvider = await first.registry.getProvider(indexedDbScope);

      try {
        await expect(
          second.service.commitPendingProjectDirectory({
            providerBasePath: directory,
            scope: indexedDbScope,
            files: { [mainFile]: { content: encoder.encode('authoritative') } },
            manifest,
          }),
        ).resolves.toEqual({ status: 'committed' });

        await expect(
          first.service.commitPendingProjectDirectory({
            providerBasePath: directory,
            scope: indexedDbScope,
            files: { [mainFile]: { content: encoder.encode('stale overwrite') } },
            manifest,
          }),
        ).resolves.toEqual({ status: 'already-committed' });
        await expect(firstProvider.readFile(`${directory}/main.ts`, 'utf8')).resolves.toBe('authoritative');
      } finally {
        first.service.dispose();
        second.service.dispose();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // writeFile / readFile round-trip
  // ---------------------------------------------------------------------------

  describe('writeFile + readFile', () => {
    it('should round-trip a string via utf8 encoding', async () => {
      await service.writeFile('/hello.txt', 'world');
      const result = await service.readFile('/hello.txt', 'utf8');
      expect(result).toBe('world');
    });

    it('should round-trip a string via encoding object', async () => {
      await service.writeFile('/hello.txt', 'world');
      const result = await service.readFile('/hello.txt', { encoding: 'utf8' });
      expect(result).toBe('world');
    });

    it('should round-trip Uint8Array data', async () => {
      const data = encoder.encode('binary content');
      await service.writeFile('/bin.dat', data);
      const result = await service.readFile('/bin.dat');
      expect(result).toBeInstanceOf(Uint8Array);
      expect(decoder.decode(result as Uint8Array<ArrayBuffer>)).toBe('binary content');
    });

    it('should return raw Uint8Array when no encoding is specified', async () => {
      await service.writeFile('/raw.txt', 'hello');
      const result = await service.readFile('/raw.txt');
      expect(result).toBeInstanceOf(Uint8Array);
    });

    it('should overwrite an existing file', async () => {
      await service.writeFile('/file.txt', 'first');
      await service.writeFile('/file.txt', 'second');
      const result = await service.readFile('/file.txt', 'utf8');
      expect(result).toBe('second');
    });

    it('should auto-create parent directories for nested paths', async () => {
      await service.writeFile('/a/b/c/file.txt', 'nested');
      const result = await service.readFile('/a/b/c/file.txt', 'utf8');
      expect(result).toBe('nested');
    });

    it('should write an empty file', async () => {
      await service.writeFile('/empty.txt', '');
      const result = await service.readFile('/empty.txt', 'utf8');
      expect(result).toBe('');
    });

    it('refreshes provider admission state only after entering the existing lock', async () => {
      const coordinator = new CrossTabCoordinator();
      const context = await createWorkspaceFileService({ crossTabCoordinator: coordinator });
      const originalWithLocks = coordinator.withLocks.bind(coordinator);
      let insideLock = false;
      vi.spyOn(coordinator, 'withLocks').mockImplementation(async (paths, operation) =>
        originalWithLocks(paths, async () => {
          insideLock = true;
          try {
            return await operation();
          } finally {
            insideLock = false;
          }
        }),
      );
      const refresh = vi.fn(async () => {
        expect(insideLock).toBe(true);
      });
      context.provider.refresh = refresh;

      try {
        await context.service.writeFile('/locked.txt', 'data');
        expect(refresh).toHaveBeenCalledOnce();
      } finally {
        context.service.dispose();
        coordinator.dispose();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // readFile errors
  // ---------------------------------------------------------------------------

  describe('readFile errors', () => {
    it('should throw for a non-existent file', async () => {
      await expect(service.readFile('/nope.txt')).rejects.toThrow();
    });

    it('should throw for a non-existent nested file', async () => {
      await expect(service.readFile('/a/b/c.txt')).rejects.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // AbortSignal cancellation
  // ---------------------------------------------------------------------------

  describe('AbortSignal cancellation', () => {
    it('should throw AbortError for readFile with pre-aborted signal', async () => {
      await service.writeFile('/cancel.txt', 'data');
      const controller = new AbortController();
      controller.abort();
      await expect(service.readFile('/cancel.txt', { signal: controller.signal })).rejects.toThrow('aborted');
    });

    it('should throw AbortError for readDirectory with pre-aborted signal', async () => {
      await service.mkdir('/canceldir', { recursive: true });
      await service.writeFile('/canceldir/a.txt', 'x');
      const controller = new AbortController();
      controller.abort();
      await expect(service.readDirectory('/canceldir', { signal: controller.signal })).rejects.toThrow('aborted');
    });
  });

  // ---------------------------------------------------------------------------
  // readFileStream
  // ---------------------------------------------------------------------------

  describe('readFileStream', () => {
    it('should return a ReadableStream producing correct content', async () => {
      await service.writeFile('/stream.txt', 'hello streaming world');
      const stream = await service.readFileStream('/stream.txt');
      const reader = stream.getReader();
      const chunks: Array<Uint8Array<ArrayBuffer>> = [];

      // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- reader loop
      while (true) {
        // oxlint-disable-next-line no-await-in-loop -- inherent stream reading pattern
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        chunks.push(value);
      }

      const combined = new Uint8Array(chunks.reduce((sum, c) => sum + c.byteLength, 0));
      let offset = 0;
      for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.byteLength;
      }

      expect(decoder.decode(combined)).toBe('hello streaming world');
    });

    it('should throw AbortError for readFileStream with pre-aborted signal', async () => {
      await service.writeFile('/abort-stream.txt', 'data');
      const controller = new AbortController();
      controller.abort();
      await expect(service.readFileStream('/abort-stream.txt', { signal: controller.signal })).rejects.toThrow(
        'aborted',
      );
    });

    it('should wrap readFile output into single-chunk stream when provider lacks readFileStream', async () => {
      await service.writeFile('/fallback.txt', 'fallback content');
      const stream = await service.readFileStream('/fallback.txt');
      const reader = stream.getReader();
      const { done, value } = await reader.read();

      expect(done).toBe(false);
      expect(decoder.decode(value)).toBe('fallback content');

      const end = await reader.read();
      expect(end.done).toBe(true);
    });

    it('rejects invalid ranges before any provider I/O', async () => {
      const nativeRead = vi.fn(() => new ReadableStream<Uint8Array<ArrayBuffer>>());
      rootProvider.readFileStream = nativeRead;
      const bufferedRead = vi.spyOn(rootProvider, 'readFile');

      await expect(service.readFileStream('/stream.txt', { position: Number.NaN })).rejects.toThrow(RangeError);
      expect(nativeRead).not.toHaveBeenCalled();
      expect(bufferedRead).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // readdir
  // ---------------------------------------------------------------------------

  describe('readdir', () => {
    it('should list entries in a directory', async () => {
      await service.writeFile('/dir/a.txt', 'a');
      await service.writeFile('/dir/b.txt', 'b');
      const entries = await service.readdir('/dir');
      expect(entries.sort()).toEqual(['a.txt', 'b.txt']);
    });

    it('should return an empty array for an empty directory', async () => {
      await service.mkdir('/empty');
      const entries = await service.readdir('/empty');
      expect(entries).toEqual([]);
    });

    it('should include subdirectories in the listing', async () => {
      await service.mkdir('/parent/child', { recursive: true });
      await service.writeFile('/parent/file.txt', 'x');
      const entries = await service.readdir('/parent');
      expect(entries.sort()).toEqual(['child', 'file.txt']);
    });
  });

  // ---------------------------------------------------------------------------
  // stat / lstat
  // ---------------------------------------------------------------------------

  describe('stat', () => {
    it('should return file stat with type "file"', async () => {
      await service.writeFile('/f.txt', 'content');
      const stat = await service.stat('/f.txt');
      expect(stat.type).toBe('file');
      expect(stat.size).toBeGreaterThan(0);
      expect(stat.mtimeMs).toBeGreaterThan(0);
    });

    it('should return directory stat with type "dir"', async () => {
      await service.mkdir('/mydir');
      const stat = await service.stat('/mydir');
      expect(stat.type).toBe('dir');
    });

    it('should throw for a non-existent path', async () => {
      await expect(service.stat('/missing')).rejects.toThrow();
    });
  });

  describe('lstat', () => {
    it('should return stat for a file', async () => {
      await service.writeFile('/f.txt', 'data');
      const stat = await service.lstat('/f.txt');
      expect(stat.type).toBe('file');
    });

    it('should return stat for a directory', async () => {
      await service.mkdir('/d');
      const stat = await service.lstat('/d');
      expect(stat.type).toBe('dir');
    });
  });

  // ---------------------------------------------------------------------------
  // exists
  // ---------------------------------------------------------------------------

  describe('exists', () => {
    it('should return true for an existing file', async () => {
      await service.writeFile('/e.txt', 'exists');
      expect(await service.exists('/e.txt')).toBe(true);
    });

    it('should return false for a missing file', async () => {
      expect(await service.exists('/missing.txt')).toBe(false);
    });

    it('should return true for an existing directory', async () => {
      await service.mkdir('/dir');
      expect(await service.exists('/dir')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // mkdir
  // ---------------------------------------------------------------------------

  describe('mkdir', () => {
    it('should create a single directory', async () => {
      await service.mkdir('/newdir');
      expect(await service.exists('/newdir')).toBe(true);
      const stat = await service.stat('/newdir');
      expect(stat.type).toBe('dir');
    });

    it('should create nested directories with recursive option', async () => {
      await service.mkdir('/a/b/c', { recursive: true });
      expect(await service.exists('/a')).toBe(true);
      expect(await service.exists('/a/b')).toBe(true);
      expect(await service.exists('/a/b/c')).toBe(true);
    });

    it('keeps recursive mkdir of an existing directory silent', async () => {
      const coordinator = new CrossTabCoordinator();
      const notifyMutation = vi.spyOn(coordinator, 'notifyMutation');
      const context = await createWorkspaceFileService({ crossTabCoordinator: coordinator });
      const events: ChangeEvent[] = [];
      context.eventBus.subscribe((event) => events.push(event));

      try {
        await context.service.mkdir('/existing', { recursive: true });
        notifyMutation.mockClear();
        events.length = 0;

        await expect(context.service.mkdir('/existing', { recursive: true })).resolves.toBeUndefined();
        expect(events).toEqual([]);
        expect(notifyMutation).not.toHaveBeenCalled();
      } finally {
        context.service.dispose();
        coordinator.dispose();
      }
    });

    it('should throw when creating nested directory without recursive', async () => {
      await expect(service.mkdir('/x/y/z')).rejects.toThrow();
    });

    it('broadly invalidates local and peer projections after a partial recursive mkdir failure', async () => {
      const coordinator = new CrossTabCoordinator();
      const notifyDirectoryChange = vi.spyOn(coordinator, 'notifyDirectoryChange');
      const context = await createWorkspaceFileService({ crossTabCoordinator: coordinator });
      const events: ChangeEvent[] = [];
      context.eventBus.subscribe((event) => events.push(event));
      const originalMkdir = context.provider.mkdir.bind(context.provider);
      vi.spyOn(context.provider, 'mkdir').mockImplementationOnce(async () => {
        await originalMkdir('partial');
        throw new Error('injected recursive mkdir failure');
      });

      try {
        await expect(context.service.mkdir('/partial/nested', { recursive: true })).rejects.toThrow(
          'injected recursive mkdir failure',
        );
        await expect(context.provider.exists('partial')).resolves.toBe(true);
        expect(events).toContainEqual({ type: 'backendChanged', backend: 'memory' });
        expect(notifyDirectoryChange).toHaveBeenCalledWith('/', {
          storageRootKey: 'memory:0',
          providerBasePath: '',
        });
      } finally {
        context.service.dispose();
        coordinator.dispose();
      }
    });

    it('should list new subdirectories in readDirectory after recursive mkdir', async () => {
      await service.writeFile('/root/existing.txt', 'x');
      const beforeMkdir = await service.readDirectory('/root');
      expect(beforeMkdir.map((n) => n.name)).toEqual(['existing.txt']);

      await service.mkdir('/root/deep/nested', { recursive: true });

      const afterMkdir = await service.readDirectory('/root');
      const names = afterMkdir.map((n) => n.name);
      expect(names).toContain('existing.txt');
      expect(names).toContain('deep');
    });

    it('should not require unrelated directory reads to refresh siblings after mkdir', async () => {
      await service.mkdir('/other', { recursive: true });
      await service.writeFile('/other/file.txt', 'y');
      await service.readDirectory('/other');

      await service.writeFile('/root/file.txt', 'x');
      await service.readDirectory('/root');

      await service.mkdir('/root/child');

      const rootEntries = await service.readDirectory('/root');
      expect(rootEntries.map((n) => n.name)).toContain('child');

      const otherEntries = await service.readDirectory('/other');
      expect(otherEntries.map((n) => n.name)).toContain('file.txt');
    });
  });

  // ---------------------------------------------------------------------------
  // move
  // ---------------------------------------------------------------------------

  describe('move', () => {
    it('should return a stat for the resulting file', async () => {
      await service.writeFile('/source.txt', 'data');
      const stat = await service.move('/source.txt', '/target.txt');
      expect(stat.type).toBe('file');
      expect(stat.size).toBe(4);
    });

    it('should move an entire directory subtree', async () => {
      await service.writeFile('/src/index.ts', 'export {}');
      await service.writeFile('/src/utils/helpers.ts', 'export {}');
      const stat = await service.move('/src', '/lib');
      expect(stat.type).toBe('dir');
      expect(await service.exists('/src')).toBe(false);
      expect(await service.exists('/lib/index.ts')).toBe(true);
      expect(await service.exists('/lib/utils/helpers.ts')).toBe(true);
    });

    it('should refuse to overwrite an existing target', async () => {
      await service.writeFile('/keep.txt', 'untouched');
      await service.writeFile('/source.txt', 'replace');
      await expect(service.move('/source.txt', '/keep.txt')).rejects.toThrow('EEXIST');
      const content = await service.readFile('/keep.txt', 'utf8');
      expect(content).toBe('untouched');
    });

    it('should emit directoryRenamed for directory sources', async () => {
      await service.writeFile('/src/a.txt', 'a');
      const events: ChangeEvent[] = [];
      eventBus.subscribe((event) => events.push(event));
      await service.move('/src', '/lib');
      expect(events).toContainEqual(
        expect.objectContaining({ type: 'directoryRenamed', oldPath: '/src', newPath: '/lib' }),
      );
    });

    it('should emit fileRenamed for file sources', async () => {
      await service.writeFile('/a.txt', 'a');
      const events: ChangeEvent[] = [];
      eventBus.subscribe((event) => events.push(event));
      await service.move('/a.txt', '/b.txt');
      expect(events).toContainEqual(
        expect.objectContaining({ type: 'fileRenamed', oldPath: '/a.txt', newPath: '/b.txt' }),
      );
    });
  });

  it('rejects every generic mutation path into the authority-global bundled types mount', async () => {
    await service.writeFile('/source.txt', 'source');
    await service.writeFile('/source-dir/file.txt', 'source');
    const cases: ReadonlyArray<{ name: string; run: () => Promise<unknown> }> = [
      { name: 'writeFile', run: async () => service.writeFile('/node_modules/file.ts', 'x') },
      {
        name: 'writeFiles',
        run: async () => service.writeFiles(Object.fromEntries([['/node_modules/file.ts', { content: 'x' }]])),
      },
      { name: 'mkdir', run: async () => service.mkdir('/node_modules/package') },
      { name: 'move source', run: async () => service.move('/node_modules/file.ts', '/target.ts') },
      { name: 'move target', run: async () => service.move('/source.txt', '/node_modules/file.ts') },
      { name: 'duplicateFile', run: async () => service.duplicateFile('/source.txt', '/node_modules/file.ts') },
      {
        name: 'copyDirectory',
        run: async () => service.copyDirectory('/source-dir', '/node_modules/package'),
      },
      { name: 'unlink', run: async () => service.unlink('/node_modules/file.ts') },
      { name: 'rmdir', run: async () => service.rmdir('/node_modules/package', { recursive: true }) },
      {
        name: 'canonical alias',
        run: async () => service.writeFile('/safe/../node_modules/alias.ts', 'x'),
      },
    ];

    for (const { name, run } of cases) {
      // oxlint-disable-next-line no-await-in-loop -- Each public endpoint is an independent trust-boundary assertion.
      await expect(run(), name).rejects.toMatchObject({ code: 'BUNDLED_TYPES_WORKSPACE' });
    }
    await expect(service.bulkMove([{ source: '/source.txt', target: '/node_modules/bulk.ts' }])).resolves.toMatchObject(
      {
        moved: [],
        failed: [{ error: { code: 'BUNDLED_TYPES_WORKSPACE' } }],
      },
    );
    await expect(service.readFile('/source.txt', 'utf8')).resolves.toBe('source');
    await expect(service.readFile('/source-dir/file.txt', 'utf8')).resolves.toBe('source');
  });

  // ---------------------------------------------------------------------------
  // R6: canMove / canRename / canCreate / canDelete preflights
  // ---------------------------------------------------------------------------

  describe('canMove preflight', () => {
    it('returns true when source exists and target is free', async () => {
      await service.writeFile('/source.txt', 'data');
      const result = await service.canMove('/source.txt', '/target.txt');
      expect(result).toBe(true);
    });

    it('returns NOT_FOUND when the source does not exist', async () => {
      const result = await service.canMove('/missing.txt', '/target.txt');
      expect(result).not.toBe(true);
      if (result === true) {
        return;
      }
      expect(result.code).toBe('NOT_FOUND');
      expect(result.path).toBe('/missing.txt');
    });

    it('returns NAME_EXISTS when the target already exists', async () => {
      await service.writeFile('/source.txt', 'src');
      await service.writeFile('/keep.txt', 'keep');
      const result = await service.canMove('/source.txt', '/keep.txt');
      expect(result).not.toBe(true);
      if (result === true) {
        return;
      }
      expect(result.code).toBe('NAME_EXISTS');
      expect(result.target).toBe('/keep.txt');
    });

    it('returns INVALID_NAME for paths that traverse above virtual root', async () => {
      await service.writeFile('/source.txt', 'src');
      const result = await service.canMove('/source.txt', '/../bar.txt');
      expect(result).not.toBe(true);
      if (result === true) {
        return;
      }
      expect(result.code).toBe('INVALID_NAME');
    });

    it('returns BUNDLED_TYPES_WORKSPACE for /node_modules paths', async () => {
      await service.writeFile('/source.txt', 'src');
      const result = await service.canMove('/source.txt', '/node_modules/foo.ts');
      expect(result).not.toBe(true);
      if (result === true) {
        return;
      }
      expect(result.code).toBe('BUNDLED_TYPES_WORKSPACE');
    });
  });

  describe('canRename preflight', () => {
    it('rejects newName containing a slash with INVALID_NAME', async () => {
      await service.writeFile('/a.txt', 'a');
      const result = await service.canRename('/a.txt', 'b/c.txt');
      expect(result).not.toBe(true);
      if (result === true) {
        return;
      }
      expect(result.code).toBe('INVALID_NAME');
    });

    it('rejects rename onto a sibling that already exists with NAME_EXISTS', async () => {
      await service.writeFile('/a.txt', 'a');
      await service.writeFile('/b.txt', 'b');
      const result = await service.canRename('/a.txt', 'b.txt');
      expect(result).not.toBe(true);
      if (result === true) {
        return;
      }
      expect(result.code).toBe('NAME_EXISTS');
    });

    it('accepts a sibling rename to a free name', async () => {
      await service.writeFile('/a.txt', 'a');
      const result = await service.canRename('/a.txt', 'b.txt');
      expect(result).toBe(true);
    });
  });

  describe('canCreate preflight', () => {
    it('returns true for a new file path', async () => {
      const result = await service.canCreate('/new.txt', 'file');
      expect(result).toBe(true);
    });

    it('returns NAME_EXISTS for an occupied path', async () => {
      await service.writeFile('/existing.txt', 'x');
      const result = await service.canCreate('/existing.txt', 'file');
      expect(result).not.toBe(true);
      if (result === true) {
        return;
      }
      expect(result.code).toBe('NAME_EXISTS');
    });

    it('rejects /node_modules with BUNDLED_TYPES_WORKSPACE', async () => {
      const result = await service.canCreate('/node_modules/new.ts', 'file');
      expect(result).not.toBe(true);
      if (result === true) {
        return;
      }
      expect(result.code).toBe('BUNDLED_TYPES_WORKSPACE');
    });

    it('rejects non-canonical aliases before interpreting their target', async () => {
      const result = await service.canCreate('/safe/../node_modules/new.ts', 'file');
      expect(result).not.toBe(true);
      if (result === true) {
        return;
      }
      expect(result.code).toBe('INVALID_NAME');
    });

    it('rejects relative paths with INVALID_NAME', async () => {
      const result = await service.canCreate('relative.txt', 'file');
      expect(result).not.toBe(true);
      if (result === true) {
        return;
      }
      expect(result.code).toBe('INVALID_NAME');
    });
  });

  describe('canDelete preflight', () => {
    it('returns true for an existing path', async () => {
      await service.writeFile('/gone.txt', 'g');
      const result = await service.canDelete('/gone.txt');
      expect(result).toBe(true);
    });

    it('returns NOT_FOUND for a missing path', async () => {
      const result = await service.canDelete('/never.txt');
      expect(result).not.toBe(true);
      if (result === true) {
        return;
      }
      expect(result.code).toBe('NOT_FOUND');
    });

    it('rejects /node_modules with BUNDLED_TYPES_WORKSPACE', async () => {
      const result = await service.canDelete('/node_modules/foo/index.d.ts');
      expect(result).not.toBe(true);
      if (result === true) {
        return;
      }
      expect(result.code).toBe('BUNDLED_TYPES_WORKSPACE');
    });
  });

  // ---------------------------------------------------------------------------
  // Sequential bulkMove with truthful partial results
  // ---------------------------------------------------------------------------

  describe('bulkMove', () => {
    it('moves every edit when all succeed', async () => {
      await service.writeFile('/a.txt', 'a');
      await service.writeFile('/b.txt', 'b');
      await service.writeFile('/c.txt', 'c');
      const result = await service.bulkMove([
        { source: '/a.txt', target: '/dst/a.txt' },
        { source: '/b.txt', target: '/dst/b.txt' },
        { source: '/c.txt', target: '/dst/c.txt' },
      ]);
      expect(result.moved.length).toBe(3);
      expect(result.failed.length).toBe(0);
      expect(await service.exists('/dst/a.txt')).toBe(true);
      expect(await service.exists('/dst/b.txt')).toBe(true);
      expect(await service.exists('/dst/c.txt')).toBe(true);
    });

    it('reports a failed middle edit without rolling back completed moves', async () => {
      await service.writeFile('/a.txt', 'a');
      await service.writeFile('/b.txt', 'b');
      await service.writeFile('/c.txt', 'c');
      await service.writeFile('/dst/b.txt', 'collision');

      const result = await service.bulkMove([
        { source: '/a.txt', target: '/dst/a.txt' },
        { source: '/b.txt', target: '/dst/b.txt' },
        { source: '/c.txt', target: '/dst/c.txt' },
      ]);

      expect(result.moved.map(({ edit }) => edit.source)).toEqual(['/a.txt', '/c.txt']);
      expect(result.failed.length).toBe(1);
      expect(result.failed[0]?.edit.source).toBe('/b.txt');
      expect(result.failed[0]?.error.code).toBe('NAME_EXISTS');

      expect(await service.exists('/a.txt')).toBe(false);
      expect(await service.exists('/b.txt')).toBe(true);
      expect(await service.exists('/c.txt')).toBe(false);
      expect(await service.exists('/dst/a.txt')).toBe(true);
      expect(await service.exists('/dst/c.txt')).toBe(true);
      expect(await service.readFile('/dst/b.txt', 'utf8')).toBe('collision');
    });

    it('does not misreport an unknown provider failure as a missing source', async () => {
      await service.writeFile('/source.txt', 'data');
      const denied = Object.assign(new Error('permission denied'), { code: 'EACCES' });
      vi.spyOn(rootProvider, 'rename').mockRejectedValueOnce(denied);

      const result = await service.bulkMove([{ source: '/source.txt', target: '/target.txt' }]);

      expect(result.moved).toEqual([]);
      expect(result.failed[0]?.error).toMatchObject({
        code: 'OPERATION_FAILED',
        path: '/source.txt',
        target: '/target.txt',
      });
      expect(await service.readFile('/source.txt', 'utf8')).toBe('data');
    });

    it('never rolls a completed move back over a peer write after a later edit fails', async () => {
      await service.writeFile('/a.txt', 'original');
      await service.writeFile('/b.txt', 'blocked');
      await service.writeFile('/dst/b.txt', 'collision');
      const originalMove = service.move.bind(service);
      let moveCount = 0;
      vi.spyOn(service, 'move').mockImplementation(async (source, target, context) => {
        const stat = await originalMove(source, target, context);
        moveCount += 1;
        if (moveCount === 1) {
          await service.writeFile(target, 'peer update');
        }
        return stat;
      });

      const result = await service.bulkMove([
        { source: '/a.txt', target: '/dst/a.txt' },
        { source: '/b.txt', target: '/dst/b.txt' },
      ]);

      expect(result.moved.map(({ edit }) => edit.source)).toEqual(['/a.txt']);
      expect(result.failed.map(({ edit }) => edit.source)).toEqual(['/b.txt']);
      expect(await service.readFile('/dst/a.txt', 'utf8')).toBe('peer update');
      expect(await service.readFile('/dst/b.txt', 'utf8')).toBe('collision');
    });

    it('returns an empty result for an empty edit list', async () => {
      const result = await service.bulkMove([]);
      expect(result.moved).toEqual([]);
      expect(result.failed).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // unlink
  // ---------------------------------------------------------------------------

  describe('unlink', () => {
    it('should delete a file', async () => {
      await service.writeFile('/del.txt', 'gone');
      await service.unlink('/del.txt');
      expect(await service.exists('/del.txt')).toBe(false);
    });

    it('should throw when deleting a non-existent file', async () => {
      await expect(service.unlink('/nonexistent.txt')).rejects.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // rmdir
  // ---------------------------------------------------------------------------

  describe('rmdir', () => {
    it('should remove an empty directory', async () => {
      await service.mkdir('/todel');
      await service.rmdir('/todel');
      expect(await service.exists('/todel')).toBe(false);
    });

    it('should throw when removing a non-existent directory', async () => {
      await expect(service.rmdir('/nope')).rejects.toThrow();
    });

    it('broadly invalidates local and peer projections after a partial recursive removal failure', async () => {
      const coordinator = new CrossTabCoordinator();
      const notifyDirectoryChange = vi.spyOn(coordinator, 'notifyDirectoryChange');
      const context = await createWorkspaceFileService({ crossTabCoordinator: coordinator });
      await context.service.writeFile('/partial/a.txt', 'a');
      await context.service.writeFile('/partial/b.txt', 'b');
      const events: ChangeEvent[] = [];
      context.eventBus.subscribe((event) => events.push(event));
      const originalUnlink = context.provider.unlink.bind(context.provider);
      let unlinkCount = 0;
      vi.spyOn(context.provider, 'unlink').mockImplementation(async (path) => {
        unlinkCount++;
        if (unlinkCount === 2) {
          throw new Error('injected recursive removal failure');
        }
        await originalUnlink(path);
      });

      try {
        await expect(context.service.rmdir('/partial', { recursive: true })).rejects.toThrow(
          'injected recursive removal failure',
        );
        expect(await context.provider.exists('partial/a.txt')).not.toBe(await context.provider.exists('partial/b.txt'));
        expect(events).toContainEqual({ type: 'backendChanged', backend: 'memory' });
        expect(notifyDirectoryChange).toHaveBeenCalledWith('/', {
          storageRootKey: 'memory:0',
          providerBasePath: '',
        });
      } finally {
        context.service.dispose();
        coordinator.dispose();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // duplicateFile
  // ---------------------------------------------------------------------------

  describe('duplicateFile', () => {
    it('should copy a file to a new location', async () => {
      await service.writeFile('/src.txt', 'copy me');
      await service.duplicateFile('/src.txt', '/dst.txt');
      const content = await service.readFile('/dst.txt', 'utf8');
      expect(content).toBe('copy me');
      expect(await service.exists('/src.txt')).toBe(true);
    });

    it('should create parent directories for the destination', async () => {
      await service.writeFile('/orig.txt', 'data');
      await service.duplicateFile('/orig.txt', '/deep/nested/copy.txt');
      const content = await service.readFile('/deep/nested/copy.txt', 'utf8');
      expect(content).toBe('data');
    });
  });

  // ---------------------------------------------------------------------------
  // copyDirectory
  // ---------------------------------------------------------------------------

  describe('copyDirectory', () => {
    it('should recursively copy a directory', async () => {
      await service.writeFile('/source/a.txt', 'aaa');
      await service.writeFile('/source/sub/b.txt', 'bbb');
      await service.copyDirectory('/source', '/dest');
      expect(await service.readFile('/dest/a.txt', 'utf8')).toBe('aaa');
      expect(await service.readFile('/dest/sub/b.txt', 'utf8')).toBe('bbb');
    });

    it('should preserve empty directories, including an entirely empty source', async () => {
      await service.mkdir('/source/empty/nested', { recursive: true });
      await service.copyDirectory('/source', '/dest');
      await service.mkdir('/entirely-empty');
      await service.copyDirectory('/entirely-empty', '/empty-copy');

      await expect(service.stat('/dest/empty')).resolves.toMatchObject({ type: 'dir' });
      await expect(service.stat('/dest/empty/nested')).resolves.toMatchObject({ type: 'dir' });
      await expect(service.stat('/empty-copy')).resolves.toMatchObject({ type: 'dir' });
    });
  });

  // ---------------------------------------------------------------------------
  // getDirectoryContents
  // ---------------------------------------------------------------------------

  describe('getDirectoryContents', () => {
    it('should return all files with relative paths', async () => {
      await service.writeFile('/proj/readme.md', '# Hi');
      await service.writeFile('/proj/src/main.ts', 'code');
      const contents = await service.getDirectoryContents('/proj');
      expect(decoder.decode(contents['readme.md'])).toBe('# Hi');
      expect(decoder.decode(contents['src/main.ts'])).toBe('code');
    });

    it('should propagate a missing-directory error', async () => {
      await expect(service.getDirectoryContents('/nonexistent')).rejects.toMatchObject({ code: 'ENOENT' });
    });

    it('distinguishes an empty directory from a file path', async () => {
      await service.mkdir('/empty');
      await service.writeFile('/file.txt', 'file');

      await expect(service.getDirectoryContents('/empty')).resolves.toEqual({});
      await expect(service.getDirectoryContents('/file.txt')).rejects.toMatchObject({ code: 'ENOTDIR' });
    });
  });

  // ---------------------------------------------------------------------------
  // writeFiles
  // ---------------------------------------------------------------------------

  describe('writeFiles', () => {
    it('should write multiple files through one batch call', async () => {
      const pathA = '/batch/a.txt';
      const pathB = '/batch/b.txt';
      await service.writeFiles({
        [pathA]: { content: 'alpha' },
        [pathB]: { content: 'bravo' },
      });
      expect(await service.readFile(pathA, 'utf8')).toBe('alpha');
      expect(await service.readFile(pathB, 'utf8')).toBe('bravo');
    });

    it('should create parent directories for each file', async () => {
      const pathA = '/deep/a/file.txt';
      const pathB = '/deep/b/file.txt';
      await service.writeFiles({
        [pathA]: { content: 'deep-a' },
        [pathB]: { content: 'deep-b' },
      });
      expect(await service.readFile(pathA, 'utf8')).toBe('deep-a');
      expect(await service.readFile(pathB, 'utf8')).toBe('deep-b');
    });

    it('should notify an exact-path watcher when restoring a file', async () => {
      vi.useFakeTimers();
      const path = '/main.scad';
      const received: WatchEvent[] = [];
      const unsubscribe = service.watch({ paths: [path] }, (event) => {
        received.push(event);
      });

      try {
        await service.writeFiles({ [path]: { content: 'plain-cube' } });
        await vi.advanceTimersByTimeAsync(75);

        expect(received).toEqual([{ type: 'change', path }]);
      } finally {
        unsubscribe();
        vi.useRealTimers();
      }
    });

    it('should use the cross-tab mutation lock for every batch path', async () => {
      const coordinator = new CrossTabCoordinator();
      const withMutationLocks = vi.spyOn(coordinator, 'withMutationLocks');
      const { service: svc } = await createWorkspaceFileService({ crossTabCoordinator: coordinator });
      const pathA = '/batch/a.txt';
      const pathB = '/batch/b.txt';

      try {
        await svc.writeFiles({
          [pathA]: { content: 'a' },
          [pathB]: { content: 'b' },
        });

        expect(withMutationLocks).toHaveBeenCalledTimes(2);
        expect(withMutationLocks).toHaveBeenCalledWith(
          [pathA, '/batch', 'memory:0:batch/a.txt', 'memory:0:batch', 'memory:0:'],
          { type: 'write', path: pathA, authority: { storageRootKey: 'memory:0', providerBasePath: '' } },
          expect.any(Function),
        );
        expect(withMutationLocks).toHaveBeenCalledWith(
          [pathB, '/batch', 'memory:0:batch/b.txt', 'memory:0:batch', 'memory:0:'],
          { type: 'write', path: pathB, authority: { storageRootKey: 'memory:0', providerBasePath: '' } },
          expect.any(Function),
        );
      } finally {
        svc.dispose();
        coordinator.dispose();
      }
    });

    it('waits for every admitted write and invalidates local and peer projections after a partial failure', async () => {
      const coordinator = new CrossTabCoordinator();
      const notifyDirectoryChange = vi.spyOn(coordinator, 'notifyDirectoryChange');
      const context = await createWorkspaceFileService({ crossTabCoordinator: coordinator });
      const originalWriteFile = context.provider.writeFile.bind(context.provider);
      const failedPath = '/batch/failed.txt';
      const delayedPath = '/batch/delayed.txt';
      const failedProviderPath = 'batch/failed.txt';
      const delayedProviderPath = 'batch/delayed.txt';
      let releaseDelayedWrite: (() => void) | undefined;
      const delayedWrite = new Promise<void>((resolve) => {
        releaseDelayedWrite = resolve;
      });
      let delayedWriteStarted = false;
      vi.spyOn(context.provider, 'writeFile').mockImplementation(async (path, data) => {
        if (path === failedProviderPath) {
          throw new Error('injected write failure');
        }
        if (path === delayedProviderPath) {
          delayedWriteStarted = true;
          await delayedWrite;
        }
        return originalWriteFile(path, data);
      });
      const events: ChangeEvent[] = [];
      const unsubscribe = context.eventBus.subscribe((event) => events.push(event));

      try {
        const result = context.service.writeFiles({
          [failedPath]: { content: 'failed' },
          [delayedPath]: { content: 'completed' },
        });
        let settled = false;
        const observeSettlement = async (): Promise<void> => {
          try {
            await result;
          } catch {
            settled = true;
            return;
          }
          settled = true;
        };
        const settlementObservation = observeSettlement();

        await waitFor(() => delayedWriteStarted);
        await Promise.resolve();
        expect(settled).toBe(false);

        releaseDelayedWrite?.();
        await expect(result).rejects.toThrow('injected write failure');
        await settlementObservation;

        expect(await context.provider.readFile(delayedProviderPath)).toEqual(encoder.encode('completed'));
        expect(events).toContainEqual({ type: 'backendChanged', backend: 'memory' });
        expect(notifyDirectoryChange).toHaveBeenCalledWith('/batch', {
          storageRootKey: 'memory:0',
          providerBasePath: '',
        });
      } finally {
        unsubscribe();
        context.service.dispose();
        coordinator.dispose();
      }
    });

    it('should perform no provider, lock, or event work for an empty batch', async () => {
      const coordinator = new CrossTabCoordinator();
      const withMutationLocks = vi.spyOn(coordinator, 'withMutationLocks');
      const context = await createWorkspaceFileService({ crossTabCoordinator: coordinator });
      const providerWrite = vi.spyOn(context.provider, 'writeFile');
      const events: ChangeEvent[] = [];
      const unsubscribe = context.eventBus.subscribe((event) => {
        events.push(event);
      });

      try {
        await context.service.writeFiles({});

        expect(providerWrite).not.toHaveBeenCalled();
        expect(withMutationLocks).not.toHaveBeenCalled();
        expect(events).toEqual([]);
      } finally {
        unsubscribe();
        context.service.dispose();
        coordinator.dispose();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // readDirectory
  // ---------------------------------------------------------------------------

  describe('readDirectory', () => {
    it('should return sorted tree nodes (folders first)', async () => {
      await service.mkdir('/tree/sub', { recursive: true });
      await service.writeFile('/tree/file.txt', 'x');
      const nodes = await service.readDirectory('/tree');
      expect(nodes).toHaveLength(2);
      expect(nodes[0]!.name).toBe('sub');
      expect(nodes[0]!.children).toEqual([]);
      expect(nodes[1]!.name).toBe('file.txt');
      expect(nodes[1]!.children).toBeUndefined();
    });

    it('should propagate ENOENT from the provider when the directory does not exist', async () => {
      try {
        await service.readDirectory('/nowhere');
        expect.fail('should have thrown');
      } catch (error) {
        expect((error as NodeJS.ErrnoException).code).toBe('ENOENT');
        expect((error as Error).message.toLowerCase()).toContain('enoent');
      }
    });

    it('should still skip individual children whose stat fails when using readdir without readdirWithStats', async () => {
      await service.mkdir('/stat-skip', { recursive: true });
      await service.writeFile('/stat-skip/good.txt', 'a');

      const savedReaddirWithStats = rootProvider.readdirWithStats;
      const originalReaddir = rootProvider.readdir.bind(rootProvider);
      const originalStat = rootProvider.stat.bind(rootProvider);

      Object.defineProperty(rootProvider, 'readdirWithStats', {
        value: undefined,
        configurable: true,
        enumerable: true,
      });
      try {
        vi.spyOn(rootProvider, 'readdir').mockImplementation(async (directoryPath: string) => {
          if (directoryPath === '/stat-skip') {
            return ['good.txt', 'ghost.txt'];
          }

          return originalReaddir(directoryPath);
        });
        vi.spyOn(rootProvider, 'stat').mockImplementation(async (filePath: string) => {
          if (filePath === '/stat-skip/ghost.txt') {
            throw new Error('stat failed for deleted child');
          }

          return originalStat(filePath);
        });

        const nodes = await service.readDirectory('/stat-skip');
        const names = nodes.map((n) => n.name).sort();
        expect(names).toEqual(['good.txt']);
      } finally {
        Object.defineProperty(rootProvider, 'readdirWithStats', {
          value: savedReaddirWithStats,
          configurable: true,
          enumerable: true,
        });
      }
    });

    it('should return equivalent listings on subsequent calls', async () => {
      await service.writeFile('/cached/a.txt', 'a');
      const first = await service.readDirectory('/cached');
      const second = await service.readDirectory('/cached');
      expect(first).toEqual(second);
    });

    it('should use readdirWithStats when available', async () => {
      await service.writeFile('/rws/file.txt', 'content');
      await service.mkdir('/rws/dir');

      expect(rootProvider.readdirWithStats).toBeDefined();

      const nodes = await service.readDirectory('/rws');
      expect(nodes).toHaveLength(2);
      const directory = nodes.find((n) => n.name === 'dir');
      const file = nodes.find((n) => n.name === 'file.txt');
      expect(directory!.children).toEqual([]);
      expect(file!.children).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // recursive mkdir + readDirectory
  // ---------------------------------------------------------------------------

  describe('recursive mkdir + readDirectory', () => {
    it('should show new subdirectories in readDirectory after recursive mkdir', async () => {
      await service.writeFile('/project/.tau/parameters/main.ts.json', '{}');
      const before = await service.readDirectory('/project/.tau');
      expect(before.map((n) => n.name)).toEqual(['parameters']);

      await service.mkdir('/project/.tau/cache/params', { recursive: true });
      await service.writeFile('/project/.tau/cache/params/hash.json', '{"key":"value"}');

      const after = await service.readDirectory('/project/.tau');
      const names = after.map((n) => n.name);
      expect(names).toContain('parameters');
      expect(names).toContain('cache');
    });
  });

  // ---------------------------------------------------------------------------
  // getDirectoryStat
  // ---------------------------------------------------------------------------

  describe('getDirectoryStat', () => {
    it('should return stat entries for all files recursively', async () => {
      await service.writeFile('/stats/a.txt', 'aaa');
      await service.writeFile('/stats/sub/b.txt', 'bb');
      const stats = await service.getDirectoryStat('/stats');
      expect(stats).toHaveLength(2);

      const paths = stats.map((s) => s.path).sort();
      expect(paths).toEqual(['a.txt', 'sub/b.txt']);

      const aEntry = stats.find((s) => s.name === 'a.txt')!;
      expect(aEntry.type).toBe('file');
      expect(aEntry.size).toBeGreaterThan(0);
      expect(aEntry.mtimeMs).toBeGreaterThan(0);
    });

    it('should return empty array for an empty directory', async () => {
      await service.mkdir('/emptystats');
      const stats = await service.getDirectoryStat('/emptystats');
      expect(stats).toEqual([]);
    });

    it('should return subdirectory stats from in-memory tree after initial scan', async () => {
      await service.writeFile('/stats/a.txt', 'aaa');
      await service.writeFile('/stats/sub/b.txt', 'bb');
      await service.getDirectoryStat('/stats');

      const subStats = await service.getDirectoryStat('/stats/sub');
      expect(subStats).toHaveLength(1);
      expect(subStats[0]!.path).toBe('b.txt');
      expect(subStats[0]!.name).toBe('b.txt');
    });

    it('should list a new file under a subpath after write following initial scan', async () => {
      await service.writeFile('/stats/a.txt', 'aaa');
      await service.getDirectoryStat('/stats');
      await service.writeFile('/stats/sub/c.txt', 'ccc');

      const subStats = await service.getDirectoryStat('/stats/sub');
      expect(subStats.some((s) => s.path === 'c.txt' && s.name === 'c.txt')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // readShallowDirectory
  // ---------------------------------------------------------------------------

  describe('readShallowDirectory', () => {
    it('should return empty array for memory scope', async () => {
      const nodes = await service.readShallowDirectory('/', {
        scope: { backend: 'memory', storageRootKey: 'memory:shallow-directory' },
      });
      expect(nodes).toEqual([]);
    });

    it('should return files and folders sorted (folders first, alpha) when backend has entries', async () => {
      const mockProvider = mock<FileSystemProvider>({
        readdir: vi.fn().mockResolvedValue(['zebra.txt', 'alpha', 'beta.txt', 'alpha-dir']),
        stat: vi.fn().mockImplementation(async (path: string) => {
          const directories = new Set(['/alpha', '/alpha-dir']);
          if (directories.has(path)) {
            return { type: 'dir', size: 10, mtimeMs: 1 };
          }
          return { type: 'file', size: 10, mtimeMs: 1, contentKind: 'text', lineCount: 1 };
        }),
        readdirWithStats: undefined,
      });
      vi.spyOn(providerRegistry, 'getProvider').mockResolvedValue(mockProvider);

      const nodes = await service.readShallowDirectory('/', { scope: { backend: 'indexeddb' } });

      expect(nodes).toEqual([
        { id: '/alpha', name: 'alpha', size: 10, mtimeMs: 1, children: [] },
        { id: '/alpha-dir', name: 'alpha-dir', size: 10, mtimeMs: 1, children: [] },
        { id: '/beta.txt', name: 'beta.txt', size: 10, mtimeMs: 1, contentKind: 'text', lineCount: 1 },
        { id: '/zebra.txt', name: 'zebra.txt', size: 10, mtimeMs: 1, contentKind: 'text', lineCount: 1 },
      ]);
    });

    it('should propagate errors when getProvider throws', async () => {
      // Audit R7: structured error propagation replaces the previous
      // swallow-to-`[]` fallback so the /files route can surface
      // recovery UI for revoked permissions / missing handles.
      vi.spyOn(providerRegistry, 'getProvider').mockRejectedValue(new Error('no provider'));

      await expect(service.readShallowDirectory('/', { scope: { backend: 'indexeddb' } })).rejects.toThrow(
        'no provider',
      );
    });

    it('should propagate errors when readdir throws', async () => {
      const mockProvider = mock<FileSystemProvider>({
        readdir: vi.fn().mockRejectedValue(new Error('ENOENT')),
        readdirWithStats: undefined,
      });
      vi.spyOn(providerRegistry, 'getProvider').mockResolvedValue(mockProvider);

      await expect(service.readShallowDirectory('/', { scope: { backend: 'indexeddb' } })).rejects.toThrow('ENOENT');
    });

    it('should skip entries where stat throws', async () => {
      const mockProvider = mock<FileSystemProvider>({
        readdir: vi.fn().mockResolvedValue(['good.txt', 'bad.txt']),
        stat: vi.fn().mockImplementation(async (path: string) => {
          if (path === '/good.txt') {
            return { type: 'file', size: 5, mtimeMs: 1, contentKind: 'text', lineCount: 1 };
          }
          throw new Error('stat failed');
        }),
        readdirWithStats: undefined,
      });
      vi.spyOn(providerRegistry, 'getProvider').mockResolvedValue(mockProvider);

      const nodes = await service.readShallowDirectory('/', { scope: { backend: 'indexeddb' } });
      expect(nodes).toEqual([
        { id: '/good.txt', name: 'good.txt', size: 5, mtimeMs: 1, contentKind: 'text', lineCount: 1 },
      ]);
    });

    it('should build correct paths when root is /', async () => {
      const mockProvider = mock<FileSystemProvider>({
        readdir: vi.fn().mockResolvedValue(['file.txt']),
        stat: vi.fn().mockResolvedValue({ type: 'file', size: 1, mtimeMs: 1, contentKind: 'text', lineCount: 1 }),
        readdirWithStats: undefined,
      });
      vi.spyOn(providerRegistry, 'getProvider').mockResolvedValue(mockProvider);

      const nodes = await service.readShallowDirectory('/', { scope: { backend: 'indexeddb' } });
      expect(nodes[0]!.id).toBe('/file.txt');
      expect(mockProvider.stat).toHaveBeenCalledWith('/file.txt');
    });

    it('should build correct paths for nested directories', async () => {
      const mockProvider = mock<FileSystemProvider>({
        readdir: vi.fn().mockResolvedValue(['child.txt']),
        stat: vi.fn().mockResolvedValue({ type: 'file', size: 1, mtimeMs: 1, contentKind: 'text', lineCount: 1 }),
        readdirWithStats: undefined,
      });
      vi.spyOn(providerRegistry, 'getProvider').mockResolvedValue(mockProvider);

      const nodes = await service.readShallowDirectory('/parent/sub', { scope: { backend: 'indexeddb' } });
      expect(nodes[0]!.id).toBe('/parent/sub/child.txt');
      expect(mockProvider.stat).toHaveBeenCalledWith('/parent/sub/child.txt');
    });
  });

  // ---------------------------------------------------------------------------
  // Event emission
  // ---------------------------------------------------------------------------

  describe('event emission', () => {
    it('should emit fileWritten on writeFile', async () => {
      const events: ChangeEvent[] = [];
      eventBus.subscribe((event) => events.push(event));

      await service.writeFile('/ev.txt', 'data');

      const writeEvents = events.filter((event) => event.type === 'fileWritten');
      expect(writeEvents).toHaveLength(1);
      expect(writeEvents[0]!.path).toBe('/ev.txt');
    });

    it('should leave event untagged on direct mutations (no context)', async () => {
      const origins: Array<string | undefined> = [];
      eventBus.subscribe((event) => origins.push(getEventOrigin(event)));
      await service.writeFile('/direct-origin.txt', 'x');
      expect(origins).toEqual([undefined]);
    });

    it('should tag fileWritten via WorkspaceMutationContext on writeFile', async () => {
      const received: Array<{ type: string; origin: string | undefined }> = [];
      eventBus.subscribe((event) => {
        received.push({ type: event.type, origin: getEventOrigin(event) });
      });
      await service.writeFile('/ctx.txt', 'y12345678901234567890123456789012', { originClientId: 'port_kernel' });
      expect(received.some((r) => r.type === 'fileWritten' && r.origin === 'port_kernel')).toBe(true);
    });

    it('should leave observer-raw emits untagged when emit() is used without tagEventOrigin', async () => {
      const origins: Array<string | undefined> = [];
      eventBus.subscribe((changeEvent) => origins.push(getEventOrigin(changeEvent)));
      eventBus.emit({ type: 'fileWritten', path: '/observer.txt', backend: 'memory' });
      expect(origins).toEqual([undefined]);
    });

    it('should tag events for every mutating method when context.originClientId is set', async () => {
      const context = { originClientId: 'all_methods' };
      const originsByType: Array<{ type: ChangeEvent['type']; origin?: string }> = [];
      eventBus.subscribe((event) => {
        originsByType.push({ type: event.type, origin: getEventOrigin(event) });
      });

      await service.writeFile('/mut-w.txt', 'a', context);
      await service.writeFiles({ '/mut-batch/x.txt': { content: 'b' } }, context);
      await service.mkdir('/mut-mkdir', { recursive: true }, context);
      await service.writeFile('/mut-r1.txt', 'c');
      await service.move('/mut-r1.txt', '/mut-r2.txt', context);
      await service.writeFile('/mut-u.txt', 'd');
      await service.unlink('/mut-u.txt', context);
      await service.mkdir('/mut-rmdir', { recursive: true });
      await service.rmdir('/mut-rmdir', undefined, context);
      await service.writeFile('/mut-dup-s.txt', 'e');
      await service.duplicateFile('/mut-dup-s.txt', '/mut-dup-d.txt', context);
      await service.mkdir('/mut-cd-src', { recursive: true });
      await service.writeFile('/mut-cd-src/nested.txt', 'f');
      await service.copyDirectory('/mut-cd-src', '/mut-cd-dst', context);

      const tagged = originsByType.filter((row) => row.origin === 'all_methods');
      expect(tagged.length).toBeGreaterThanOrEqual(8);
      const types = new Set(tagged.map((row) => row.type));
      expect(types.has('fileWritten')).toBe(true);
      expect(types.has('fileRenamed')).toBe(true);
      expect(types.has('fileDeleted')).toBe(true);
    });

    it('should emit one exact fileWritten event per batch path with the caller origin', async () => {
      const events: ChangeEvent[] = [];
      const unsubscribe = eventBus.subscribe((event) => events.push(event));
      const pathA = '/batch/a.txt';
      const pathB = '/batch/b.txt';

      try {
        await service.writeFiles(
          {
            [pathA]: { content: 'a' },
            [pathB]: { content: 'b' },
          },
          { originClientId: 'batch_author' },
        );

        const writtenEvents = events
          .filter((event) => event.type === 'fileWritten')
          .map((event) => ({ event, origin: getEventOrigin(event) }))
          .sort((a, b) => a.event.path.localeCompare(b.event.path));
        expect(writtenEvents).toEqual([
          {
            event: { type: 'fileWritten', path: pathA, backend: 'memory' },
            origin: 'batch_author',
          },
          {
            event: { type: 'fileWritten', path: pathB, backend: 'memory' },
            origin: 'batch_author',
          },
        ]);
        expect(events).not.toContainEqual(expect.objectContaining({ type: 'directoryChanged', path: '/' }));
      } finally {
        unsubscribe();
      }
    });

    it('should emit directoryCreated on mkdir', async () => {
      const events: ChangeEvent[] = [];
      eventBus.subscribe((event) => events.push(event));

      await service.mkdir('/evdir');

      const directoryEvents = events.filter((event) => event.type === 'directoryCreated');
      expect(directoryEvents).toHaveLength(1);
      expect(directoryEvents[0]).toMatchObject({ type: 'directoryCreated', path: '/evdir' });
    });

    it('should emit fileRenamed on a file move', async () => {
      await service.writeFile('/ren.txt', 'data');
      const events: ChangeEvent[] = [];
      eventBus.subscribe((event) => events.push(event));

      await service.move('/ren.txt', '/renamed.txt');

      const renameEvents = events.filter((event) => event.type === 'fileRenamed');
      expect(renameEvents).toHaveLength(1);
      const renameEvent = renameEvents[0]!;
      expect(renameEvent.oldPath).toBe('/ren.txt');
      expect(renameEvent.newPath).toBe('/renamed.txt');
    });

    it('should emit fileDeleted on unlink', async () => {
      await service.writeFile('/gone.txt', 'bye');
      const events: ChangeEvent[] = [];
      eventBus.subscribe((event) => events.push(event));

      await service.unlink('/gone.txt');

      const deleteEvents = events.filter((event) => event.type === 'fileDeleted');
      expect(deleteEvents).toHaveLength(1);
      expect(deleteEvents[0]!.path).toBe('/gone.txt');
    });

    it('should emit directoryDeleted on rmdir', async () => {
      await service.mkdir('/rmd');
      const events: ChangeEvent[] = [];
      eventBus.subscribe((event) => events.push(event));

      await service.rmdir('/rmd');

      const directoryEvents = events.filter((event) => event.type === 'directoryDeleted');
      expect(directoryEvents).toHaveLength(1);
      expect(directoryEvents[0]).toMatchObject({ type: 'directoryDeleted', path: '/rmd' });
    });

    it('should emit fileWritten for the duplicated destination', async () => {
      await service.writeFile('/dup-src.txt', 'copy');
      const events: ChangeEvent[] = [];
      eventBus.subscribe((event) => events.push(event));

      await service.duplicateFile('/dup-src.txt', '/dup-dst.txt');

      expect(events).toContainEqual(
        expect.objectContaining({ type: 'fileWritten', path: '/dup-dst.txt', backend: 'memory' }),
      );
    });

    it('should include backend in emitted events', async () => {
      const events: ChangeEvent[] = [];
      eventBus.subscribe((event) => events.push(event));

      await service.writeFile('/backend.txt', 'x');

      const writeEvent = events.find((event) => event.type === 'fileWritten')!;
      expect('backend' in writeEvent && writeEvent.backend).toBe('memory');
    });
  });

  // ---------------------------------------------------------------------------
  // readDirectory after mutations
  // ---------------------------------------------------------------------------

  describe('readDirectory after mutations', () => {
    it('should return fresh listing after write', async () => {
      await service.writeFile('/cacheinv/a.txt', 'a');
      const first = await service.readDirectory('/cacheinv');
      expect(first).toHaveLength(1);

      await service.writeFile('/cacheinv/b.txt', 'b');
      const second = await service.readDirectory('/cacheinv');
      expect(second).toHaveLength(2);
    });

    it('should return fresh listing after unlink', async () => {
      await service.writeFile('/cacheinv2/a.txt', 'a');
      await service.readDirectory('/cacheinv2');

      await service.unlink('/cacheinv2/a.txt');
      const after = await service.readDirectory('/cacheinv2');
      expect(after).toHaveLength(0);
    });

    it('should return a fresh listing after a move', async () => {
      await service.writeFile('/ren-cache/old.txt', 'data');
      await service.readDirectory('/ren-cache');

      await service.move('/ren-cache/old.txt', '/ren-cache/new.txt');
      const nodes = await service.readDirectory('/ren-cache');
      const names = nodes.map((n) => n.name);
      expect(names).toContain('new.txt');
      expect(names).not.toContain('old.txt');
    });
  });

  // ---------------------------------------------------------------------------
  // dispose
  // ---------------------------------------------------------------------------

  describe('dispose', () => {
    it('should clear the event bus (no subscribers fire after dispose)', async () => {
      const handler = vi.fn();
      eventBus.subscribe(handler);
      service.dispose();
      eventBus.emit({ type: 'fileWritten', path: '/x', backend: 'memory' });
      expect(handler).not.toHaveBeenCalled();
    });

    it('clears search, pool, route, and discovery derivatives without reviving providers', async () => {
      const pool = new SharedPool(new SharedArrayBuffer(128 * 1024), { maxEntries: 8 });
      service.setFilePool(pool);
      await service.writeFile('/cached.txt', 'cached');
      await service.readFile('/cached.txt');
      await service.searchFiles('/', 'cached');
      await service.configureProjectRoots({ projects: [], roots: [{ backend: 'indexeddb' }] });
      const getProvider = vi.spyOn(providerRegistry, 'getProvider');

      service.dispose();

      expect(pool.has('/cached.txt')).toBe(false);
      await expect(service.listProjectManifests()).resolves.toEqual({ entries: [], roots: [] });
      await expect(service.searchFiles('/', 'cached')).rejects.toThrow();
      expect(getProvider).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // watch API
  // ---------------------------------------------------------------------------

  describe('watch', () => {
    it('should return an unsubscribe function', async () => {
      const unsub = service.watch({ paths: ['/'] }, () => {
        /* Intentionally empty */
      });
      expect(typeof unsub).toBe('function');
      unsub();
    });

    it('should coalesce watch events within 75ms kernel window', async () => {
      const received: WatchEvent[] = [];
      service.watch({ paths: ['/src'], recursive: true }, (event) => {
        received.push(event);
      });

      eventBus.emit({ type: 'fileWritten', path: '/src/a.txt', backend: 'memory' });
      eventBus.emit({ type: 'fileWritten', path: '/src/b.txt', backend: 'memory' });

      expect(received).toHaveLength(0);
      await waitFor(() => received.length >= 2);
      expect(received).toHaveLength(2);
      expect(received.every((event) => event.type === 'change')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Concurrent writes are serialized
  // ---------------------------------------------------------------------------

  describe('write serialization', () => {
    it('should serialize concurrent writes to the same file', async () => {
      const order: string[] = [];
      eventBus.subscribe((event) => {
        if (event.type === 'fileWritten' && 'path' in event) {
          order.push(event.path);
        }
      });

      const w1 = service.writeFile('/same.txt', 'a');
      const w2 = service.writeFile('/same.txt', 'b');
      const w3 = service.writeFile('/same.txt', 'c');

      await Promise.all([w1, w2, w3]);

      expect(order).toEqual(['/same.txt', '/same.txt', '/same.txt']);
      const finalContent = await service.readFile('/same.txt', 'utf8');
      expect(finalContent).toBe('c');
    });

    it('should allow parallel writes to different files', async () => {
      const w1 = service.writeFile('/p1.txt', 'a');
      const w2 = service.writeFile('/p2.txt', 'b');
      const w3 = service.writeFile('/p3.txt', 'c');

      await Promise.all([w1, w2, w3]);

      expect(await service.readFile('/p1.txt', 'utf8')).toBe('a');
      expect(await service.readFile('/p2.txt', 'utf8')).toBe('b');
      expect(await service.readFile('/p3.txt', 'utf8')).toBe('c');
    });
  });

  describe('provider write error propagation', () => {
    it('should propagate provider errors during nested writes', async () => {
      rootProvider.writeFile = async () => {
        const error = new Error('disk full') as NodeJS.ErrnoException;
        error.code = 'EIO';
        throw error;
      };

      await expect(service.writeFile('/a/b/c.txt', 'data')).rejects.toThrow('disk full');
    });
  });

  // ---------------------------------------------------------------------------
  // In-memory tree integration
  // ---------------------------------------------------------------------------

  describe('in-memory tree integration', () => {
    it('should reflect writeFile in subsequent getDirectoryStat', async () => {
      await service.writeFile('/root/a.txt', 'aaa');
      await service.getDirectoryStat('/root');

      await service.writeFile('/root/b.txt', 'bb');

      const stats = await service.getDirectoryStat('/root');
      const paths = stats.map((s) => s.path).sort();
      expect(paths).toEqual(['a.txt', 'b.txt']);
    });

    it('should reflect mkdir in subsequent getDirectoryStat', async () => {
      await service.writeFile('/root/a.txt', 'a');
      await service.getDirectoryStat('/root');

      await service.mkdir('/root/sub');
      await service.writeFile('/root/sub/x.txt', 'x');

      const stats = await service.getDirectoryStat('/root/sub');
      expect(stats).toHaveLength(1);
      expect(stats[0]!.path).toBe('x.txt');
    });

    it('should reflect unlink in subsequent getDirectoryStat', async () => {
      await service.writeFile('/root/a.txt', 'a');
      await service.writeFile('/root/b.txt', 'b');
      await service.getDirectoryStat('/root');

      await service.unlink('/root/a.txt');

      const stats = await service.getDirectoryStat('/root');
      expect(stats).toHaveLength(1);
      expect(stats[0]!.path).toBe('b.txt');
    });

    it('should reflect a move in subsequent getDirectoryStat', async () => {
      await service.writeFile('/root/old.txt', 'data');
      await service.getDirectoryStat('/root');

      await service.move('/root/old.txt', '/root/new.txt');

      const stats = await service.getDirectoryStat('/root');
      const paths = stats.map((s) => s.path);
      expect(paths).toContain('new.txt');
      expect(paths).not.toContain('old.txt');
    });

    it('should reflect rmdir in subsequent getDirectoryStat', async () => {
      await service.mkdir('/root/sub', { recursive: true });
      await service.writeFile('/root/a.txt', 'a');
      await service.getDirectoryStat('/root');

      await service.rmdir('/root/sub');

      const stats = await service.getDirectoryStat('/root');
      expect(stats).toHaveLength(1);
      expect(stats[0]!.path).toBe('a.txt');
    });

    it('should reflect duplicateFile in subsequent getDirectoryStat', async () => {
      await service.writeFile('/root/src.txt', 'copy');
      await service.getDirectoryStat('/root');

      await service.duplicateFile('/root/src.txt', '/root/dst.txt');

      const stats = await service.getDirectoryStat('/root');
      const paths = stats.map((s) => s.path).sort();
      expect(paths).toEqual(['dst.txt', 'src.txt']);
    });

    it('should reflect copyDirectory in subsequent getDirectoryStat', async () => {
      await service.writeFile('/root/src/a.txt', 'aaa');
      await service.writeFile('/root/src/sub/b.txt', 'bb');
      await service.getDirectoryStat('/root');

      await service.copyDirectory('/root/src', '/root/dest');

      const stats = await service.getDirectoryStat('/root/dest');
      const paths = stats.map((s) => s.path).sort();
      expect(paths).toEqual(['a.txt', 'sub/b.txt']);
    });
  });

  // ---------------------------------------------------------------------------
  // getDirectoryStat abort signal
  // ---------------------------------------------------------------------------

  describe('getDirectoryStat abort signal', () => {
    it('should throw AbortError when signal is already aborted', async () => {
      await service.writeFile('/abort/a.txt', 'a');
      const controller = new AbortController();
      controller.abort();

      await expect(service.getDirectoryStat('/abort', { signal: controller.signal })).rejects.toThrow('aborted');
    });
  });
});

// =============================================================================
// Integration: WorkspaceFileService + DirectIdbProvider
// =============================================================================

describe('WorkspaceFileService integration [DirectIDB]', () => {
  let service: WorkspaceFileService;
  let rootProvider: FileSystemProvider;

  beforeEach(async () => {
    const providerRegistry = new ProviderRegistry({
      databasePrefix: `test-integration-${crypto.randomUUID()}`,
    });
    const provider = await providerRegistry.getProvider({ backend: 'indexeddb' });
    rootProvider = provider;

    const mountTable = new MountTable();
    mountTable.mount('/', provider, {
      backend: 'indexeddb',
      storageRootKey: providerRegistry.resolveStorageRootKey({ backend: 'indexeddb' }),
    });

    const resourceQueue = new ResourceQueue();
    const eventBus = new ChangeEventBus();

    service = new WorkspaceFileService({
      providerRegistry,
      resourceQueue,
      eventBus,
      mountTable,
    });
  });

  it('should round-trip a string through write and read', async () => {
    await service.writeFile('/test.txt', 'hello');
    const result = await service.readFile('/test.txt', 'utf8');
    expect(result).toBe('hello');
  });

  it('should support writing and reading binary data', async () => {
    const data = new Uint8Array([1, 2, 3, 4]);
    await service.writeFile('/bin.dat', data);
    const result = await service.readFile('/bin.dat');
    expect(result).toEqual(data);
  });

  it('should support batch writeFiles', async () => {
    /* eslint-disable @typescript-eslint/naming-convention -- Path-keyed object */
    await service.writeFiles({
      '/batch/a.txt': { content: encoder.encode('a') },
      '/batch/b.txt': { content: encoder.encode('b') },
    });
    /* eslint-enable @typescript-eslint/naming-convention -- Re-enable after path-keyed object */
    expect(await service.readFile('/batch/a.txt', 'utf8')).toBe('a');
    expect(await service.readFile('/batch/b.txt', 'utf8')).toBe('b');
  });

  it('should emit fileWritten change event on write', async () => {
    const events: ChangeEvent[] = [];
    const eventBus = new ChangeEventBus();

    const providerRegistry = new ProviderRegistry({
      databasePrefix: `test-events-${crypto.randomUUID()}`,
    });
    const provider = await providerRegistry.getProvider({ backend: 'indexeddb' });
    const mountTable = new MountTable();
    mountTable.mount('/', provider, {
      backend: 'indexeddb',
      storageRootKey: providerRegistry.resolveStorageRootKey({ backend: 'indexeddb' }),
    });

    const eventService = new WorkspaceFileService({
      providerRegistry,
      resourceQueue: new ResourceQueue(),
      eventBus,
      mountTable,
    });

    eventBus.subscribe((event) => events.push(event));
    await eventService.writeFile('/evented.txt', 'hello');

    expect(events).toContainEqual(expect.objectContaining({ type: 'fileWritten', path: '/evented.txt' }));
  });

  it('should build in-memory tree via getDirectoryStat', async () => {
    await service.writeFile('/tree/a.txt', 'a');
    await service.writeFile('/tree/b/c.txt', 'c');
    const stats = await service.getDirectoryStat('/');
    expect(stats.length).toBeGreaterThan(0);
  });

  describe('searchFiles', () => {
    it('should return matching files from InMemoryFileTree', async () => {
      await service.writeFile('/src/main.ts', 'console.log("hi")');
      await service.writeFile('/src/utils/helper.ts', 'export {}');
      await service.writeFile('/README.md', '# Hello');
      await service.getDirectoryStat('/');

      const results = await service.searchFiles('/', 'helper');
      expect(results).toHaveLength(1);
      expect(results[0]!.path).toBe('src/utils/helper.ts');
    });

    it('should build the requested root when the tree is cold', async () => {
      const results = await service.searchFiles('/', 'anything');
      expect(results).toEqual([]);
    });

    it('should forward maxResults option', async () => {
      await service.writeFile('/a.ts', 'a');
      await service.writeFile('/b.ts', 'b');
      await service.writeFile('/c.ts', 'c');
      await service.getDirectoryStat('/');

      const results = await service.searchFiles('/', '.ts', { maxResults: 2 });
      expect(results).toHaveLength(2);
    });

    it('should forward includeDirectories option', async () => {
      await service.writeFile('/src/main.ts', 'a');
      await service.getDirectoryStat('/');

      const results = await service.searchFiles('/', 'src', { includeDirectories: true });
      const types = results.map((r) => r.type);
      expect(types).toContain('dir');
    });

    it('rebuilds the sole cache for sequential A to B to A searches', async () => {
      await service.writeFile('/a/a-only.ts', 'a');
      await service.writeFile('/b/b-only.ts', 'b');

      await expect(service.searchFiles('/a', 'only')).resolves.toMatchObject([{ path: 'a-only.ts' }]);
      await expect(service.searchFiles('/b', 'only')).resolves.toMatchObject([{ path: 'b-only.ts' }]);
      await expect(service.searchFiles('/a', 'only')).resolves.toMatchObject([{ path: 'a-only.ts' }]);
    });

    it('returns concurrent root scans from their local trees independent of completion order', async () => {
      await service.writeFile('/a/a-only.ts', 'a');
      await service.writeFile('/b/b-only.ts', 'b');
      const originalReaddir = rootProvider.readdir.bind(rootProvider);
      const aGate = Promise.withResolvers<void>();
      const bGate = Promise.withResolvers<void>();
      vi.spyOn(rootProvider, 'readdir').mockImplementation(async (path) => {
        if (path === '/a') {
          await aGate.promise;
        }
        if (path === '/b') {
          await bGate.promise;
        }
        return originalReaddir(path);
      });

      const a = service.searchFiles('/a', 'only');
      const b = service.searchFiles('/b', 'only');
      bGate.resolve();
      await expect(b).resolves.toMatchObject([{ path: 'b-only.ts' }]);
      aGate.resolve();
      await expect(a).resolves.toMatchObject([{ path: 'a-only.ts' }]);
    });
  });

  // ---------------------------------------------------------------------------
  // SharedPool integration
  // ---------------------------------------------------------------------------

  describe('SharedPool integration', () => {
    async function createWorkspaceFileServiceWithPool() {
      const buffer = new SharedArrayBuffer(128 * 1024);
      const pool = new SharedPool(buffer, { maxEntries: 128 });

      const providerRegistry = new ProviderRegistry();
      const provider = await providerRegistry.getProvider({ backend: 'memory', storageRootKey: 'memory:test-root' });
      const mountTable = new MountTable();
      mountTable.mount('/', provider, { backend: 'memory', storageRootKey: 'memory:test-root' });

      const resourceQueue = new ResourceQueue();
      const eventBus = new ChangeEventBus();

      const svc = new WorkspaceFileService({
        providerRegistry,
        resourceQueue,
        eventBus,
        filePool: pool,
        mountTable,
      });

      return { service: svc, pool, eventBus, provider };
    }

    it('stores utf8 reads in the pool under the same conditions as byte reads', async () => {
      const { service: svc, pool } = await createWorkspaceFileServiceWithPool();
      await svc.writeFile('/decoded.txt', 'decoded content');

      await expect(svc.readFile('/decoded.txt', 'utf8')).resolves.toBe('decoded content');

      expect(decoder.decode(pool.resolveCopy('/decoded.txt'))).toBe('decoded content');
    });

    it('keeps a scoped utf8 read out of the pool', async () => {
      const { service: svc, pool } = await createWorkspaceFileServiceWithPool();
      await svc.writeFile('/scoped.txt', 'scoped content');
      const scope = { backend: 'memory', storageRootKey: 'memory:test-root' } as const;

      await expect(svc.readFile('/scoped.txt', { encoding: 'utf8', scope })).resolves.toBe('scoped content');

      expect(pool.has('/scoped.txt')).toBe(false);
    });

    it('keeps cached state for the writes that survived a partial batch failure', async () => {
      const { service: svc, pool, provider } = await createWorkspaceFileServiceWithPool();
      await svc.writeFile('/keep.txt', 'keep');
      await svc.writeFile('/doomed.txt', 'before');
      await svc.readFile('/keep.txt');
      await svc.readFile('/doomed.txt');
      await svc.getDirectoryStat('/');
      const readdirWithStats = vi.spyOn(provider, 'readdirWithStats');
      const writeFile = provider.writeFile.bind(provider);
      const successfulPath = '/ok.txt';
      const failedPath = '/doomed.txt';
      const failedProviderPath = 'doomed.txt';
      vi.spyOn(provider, 'writeFile').mockImplementation(async (path, data) => {
        if (path === failedProviderPath) {
          throw new Error('write failed');
        }
        return writeFile(path, data);
      });

      await expect(
        svc.writeFiles({ [successfulPath]: { content: 'ok' }, [failedPath]: { content: 'after' } }),
      ).rejects.toThrow('write failed');

      expect(pool.has('/keep.txt')).toBe(true);
      expect(pool.has('/doomed.txt')).toBe(false);
      await expect(svc.getDirectoryStat('/')).resolves.toContainEqual(expect.objectContaining({ path: 'ok.txt' }));
      expect(readdirWithStats).not.toHaveBeenCalled();
    });

    it('should store binary content in pool after readFile', async () => {
      const { service: svc, pool } = await createWorkspaceFileServiceWithPool();
      await svc.writeFile('/cached.txt', 'pooled content');

      await svc.readFile('/cached.txt');

      const cached = pool.resolveCopy('/cached.txt');
      expect(cached).toBeDefined();
      expect(decoder.decode(cached)).toBe('pooled content');
    });

    it('stores aliased reads under only their canonical shared-pool key', async () => {
      const { service: svc, pool } = await createWorkspaceFileServiceWithPool();
      await svc.writeFile('/directory/cached.txt', 'pooled content');

      await svc.readFile('/directory/./cached.txt');

      expect(pool.has('/directory/cached.txt')).toBe(true);
      expect(pool.has('/directory/./cached.txt')).toBe(false);
    });

    it('should invalidate pool entry on writeFile', async () => {
      const { service: svc, pool } = await createWorkspaceFileServiceWithPool();
      await svc.writeFile('/update.txt', 'original');
      await svc.readFile('/update.txt');
      expect(pool.has('/update.txt')).toBe(true);

      await svc.writeFile('/update.txt', 'updated');
      expect(pool.has('/update.txt')).toBe(false);
    });

    it('should invalidate pooled content when writeFiles restores a file', async () => {
      const { service: svc, pool } = await createWorkspaceFileServiceWithPool();
      const path = '/main.scad';
      await svc.writeFile(path, 'cube-with-cutout');
      await svc.readFile(path);
      expect(decoder.decode(pool.resolveCopy(path))).toBe('cube-with-cutout');

      await svc.writeFiles({ [path]: { content: 'plain-cube' } });

      expect(pool.has(path)).toBe(false);
      expect(await svc.readFile(path, 'utf8')).toBe('plain-cube');
    });

    it('should invalidate pool entries on rename', async () => {
      const { service: svc, pool } = await createWorkspaceFileServiceWithPool();
      await svc.writeFile('/old.txt', 'data');
      await svc.readFile('/old.txt');
      expect(pool.has('/old.txt')).toBe(true);

      await svc.move('/old.txt', '/new.txt');
      expect(pool.has('/old.txt')).toBe(false);
      expect(pool.has('/new.txt')).toBe(false);
    });

    it('should invalidate pool entry on unlink', async () => {
      const { service: svc, pool } = await createWorkspaceFileServiceWithPool();
      await svc.writeFile('/delete.txt', 'data');
      await svc.readFile('/delete.txt');
      expect(pool.has('/delete.txt')).toBe(true);

      await svc.unlink('/delete.txt');
      expect(pool.has('/delete.txt')).toBe(false);
    });

    it('should work identically without pool', async () => {
      const { service: svc } = await createWorkspaceFileService();
      await svc.writeFile('/no-pool.txt', 'data');

      const content = await svc.readFile('/no-pool.txt', 'utf8');
      expect(content).toBe('data');
    });

    it('should accept filePool via setFilePool after construction', async () => {
      const { service: svc } = await createWorkspaceFileService();
      const buffer = new SharedArrayBuffer(128 * 1024);
      const pool = new SharedPool(buffer, { maxEntries: 128 });

      svc.setFilePool(pool);

      await svc.writeFile('/late-pool.txt', 'late binding');
      await svc.readFile('/late-pool.txt');

      const cached = pool.resolveCopy('/late-pool.txt');
      expect(cached).toBeDefined();
      expect(decoder.decode(cached)).toBe('late binding');
    });

    it('should invalidate late-bound pool on writeFile', async () => {
      const { service: svc } = await createWorkspaceFileService();
      const buffer = new SharedArrayBuffer(128 * 1024);
      const pool = new SharedPool(buffer, { maxEntries: 128 });

      svc.setFilePool(pool);

      await svc.writeFile('/invalidate.txt', 'original');
      await svc.readFile('/invalidate.txt');
      expect(pool.has('/invalidate.txt')).toBe(true);

      await svc.writeFile('/invalidate.txt', 'updated');
      expect(pool.has('/invalidate.txt')).toBe(false);
    });

    it('keeps pooled bytes readable after the returned buffer is transferred away', async () => {
      const { service: svc, pool } = await createWorkspaceFileServiceWithPool();
      await svc.writeFile('/transferred.bin', 'pooled payload');

      const first = (await svc.readFile('/transferred.bin')) as Uint8Array<ArrayBuffer>;
      // The bridge transfers read results to the main thread, which detaches
      // this buffer on the worker side. The pool must already hold its own copy.
      structuredClone(first, { transfer: [first.buffer] });
      expect(first.buffer.detached).toBe(true);

      expect(decoder.decode(pool.resolveCopy('/transferred.bin'))).toBe('pooled payload');
      await expect(svc.readFile('/transferred.bin', 'utf8')).resolves.toBe('pooled payload');
    });
  });

  // ---------------------------------------------------------------------------
  // getZippedDirectory
  // ---------------------------------------------------------------------------

  describe('getZippedDirectory', () => {
    it('should return a Blob containing the directory files as a zip', async () => {
      await service.writeFile('/ziptest/a.txt', 'hello');
      await service.writeFile('/ziptest/b.txt', 'world');

      const blob = await service.getZippedDirectory('/ziptest');

      expect(blob).toBeInstanceOf(Blob);
      expect(blob.size).toBeGreaterThan(0);
    });

    it('should include files with correct relative paths in the zip', async () => {
      await service.writeFile('/ziptest/sub/nested.txt', 'nested content');
      await service.writeFile('/ziptest/root.txt', 'root content');

      const blob = await service.getZippedDirectory('/ziptest');
      const jszipModule = await import('jszip');
      const jszip = jszipModule.default;
      const zip = await jszip.loadAsync(await blob.arrayBuffer());

      const paths = Object.keys(zip.files).sort();
      expect(paths).toContain('root.txt');
      expect(paths).toContain('sub/nested.txt');

      const rootContent = await zip.files['root.txt']!.async('string');
      expect(rootContent).toBe('root content');

      const nestedContent = await zip.files['sub/nested.txt']!.async('string');
      expect(nestedContent).toBe('nested content');
    });

    it('should handle empty directories', async () => {
      await service.mkdir('/emptydir', { recursive: true });

      const blob = await service.getZippedDirectory('/emptydir');

      expect(blob).toBeInstanceOf(Blob);
      expect(blob.size).toBeGreaterThan(0);
    });

    it('rejects missing and file paths instead of returning plausible empty archives', async () => {
      await service.writeFile('/file.txt', 'file');

      await expect(service.getZippedDirectory('/missing')).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(service.getZippedDirectory('/file.txt')).rejects.toMatchObject({ code: 'ENOTDIR' });
    });
  });

  describe('protected dynamic mounts', () => {
    let mountedService: WorkspaceFileService;
    let mountedRegistry: ProviderRegistry;

    beforeEach(async () => {
      mountedRegistry = new ProviderRegistry();
      const rootProvider = await mountedRegistry.getProvider({
        backend: 'memory',
        storageRootKey: 'memory:dynamic-test-root',
      });

      const mountTable = new MountTable();
      mountTable.mount('/', rootProvider, { backend: 'memory', storageRootKey: 'memory:dynamic-test-root' });

      mountedService = new WorkspaceFileService({
        providerRegistry: mountedRegistry,
        resourceQueue: new ResourceQueue(),
        eventBus: new ChangeEventBus(),
        mountTable,
      });
    });

    it('mounts and unmounts one isolated preview root', async () => {
      await mountedService.mount('/previews/card-a', {
        backend: 'memory',
        storageRootKey: 'memory:preview:card-a',
      });
      await mountedService.writeFile('/previews/card-a/main.ts', 'preview');
      await expect(mountedService.readFile('/previews/card-a/main.ts', 'utf8')).resolves.toBe('preview');

      mountedService.unmount('/previews/card-a');
      await expect(mountedService.exists('/previews/card-a/main.ts')).resolves.toBe(false);
    });

    it.each(['/data', '/projects/proj_a', '/previews/a/nested', '/previews/../projects/proj_a'])(
      'rejects dynamic prefix %s before provider lookup',
      async (prefix) => {
        const getProvider = vi.spyOn(mountedRegistry, 'getProvider');
        await expect(
          mountedService.mount(prefix, {
            backend: 'memory',
            storageRootKey: 'memory:preview:a',
          }),
        ).rejects.toThrow(/not admitted|canonical/);
        expect(getProvider).not.toHaveBeenCalled();
      },
    );

    it('rejects a preview identity that does not match its prefix before provider lookup', async () => {
      const getProvider = vi.spyOn(mountedRegistry, 'getProvider');
      await expect(
        mountedService.mount('/previews/card-a', {
          backend: 'memory',
          storageRootKey: 'memory:preview:card-b',
        }),
      ).rejects.toThrow('protected prefix');
      expect(getProvider).not.toHaveBeenCalled();
    });
  });
});

describe('flat workspace layout locks', () => {
  const projectId = 'proj_lllllllllllllllllllll';

  const configureFlatProject = async (
    context: Awaited<ReturnType<typeof createWorkspaceFileService>>,
  ): Promise<void> => {
    await context.service.configureProjectRoots({
      projects: [{ projectId, backend: 'memory', storageRootKey: 'memory:0', providerBasePath: 'cube-design' }],
      roots: [],
    });
  };

  it('locks the owning project for a root-mount write into its physical directory', async () => {
    const context = await createWorkspaceFileService();
    await configureFlatProject(context);
    const queueForMany = vi.spyOn(context.resourceQueue, 'queueForMany');

    try {
      await context.service.writeFile('/cube-design/main.ts', 'physical route');

      expect(queueForMany.mock.calls.at(-1)?.[0]).toContain(`project:${projectId}`);
    } finally {
      context.service.dispose();
    }
  });

  it('leaves an unmounted root child free of project locks', async () => {
    const context = await createWorkspaceFileService();
    await configureFlatProject(context);
    const queueForMany = vi.spyOn(context.resourceQueue, 'queueForMany');

    try {
      await context.service.writeFile('/loose-directory/main.ts', 'no project');

      expect(queueForMany.mock.calls.at(-1)?.[0].filter((lock) => lock.startsWith('project:'))).toEqual([]);
    } finally {
      context.service.dispose();
    }
  });
});
