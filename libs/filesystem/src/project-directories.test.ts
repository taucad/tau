// oxlint-disable-next-line import/no-unassigned-import -- Side-effect import to polyfill IndexedDB for tests
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChangeEventBus } from '#change-event-bus.js';
import { CrossTabCoordinator } from '#cross-tab-coordinator.js';
import { DirectIdbProvider } from '#backend/direct-idb-provider.js';
import { MountTable } from '#mount-table.js';
import type { CommitPendingProjectDirectoryResult, StorageRootConfig } from '#mount-table.js';
import { ProviderRegistry } from '#provider-registry.js';
import { ResourceQueue } from '#resource-queue.js';
import { createWorkspaceFileService, decoder, encoder, waitFor } from '#testing/workspace-service-harness.js';
import type { ChangeEvent, FileSystemProvider } from '#types.js';
import { WorkspaceFileService } from '#workspace-file-service.js';
import {
  parseProjectManifestBytes,
  projectManifestSchemaUrl,
  projectToManifest,
  serializeProjectManifest,
} from '@taucad/types';
import type { ProjectManifest } from '@taucad/types';

/** Distinct IndexedDB database prefixes for the rows that build their own authority. */
let databaseSequence = 0;

/**
 * `project-directories.ts` owns discovery, adoption, pending commit, permanent
 * delete and manifest I/O. These rows drive that behaviour through
 * `WorkspaceFileService` because the lifecycle is reached from the composition
 * root; W5 moved them here byte-for-byte because the module above owns it.
 */
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
        mountTable.mount('/', provider, { class: 'authored', backend: 'memory', storageRootKey: 'memory:test-root' });
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
});
