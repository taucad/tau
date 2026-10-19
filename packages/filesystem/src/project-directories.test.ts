// oxlint-disable-next-line import/no-unassigned-import -- Side-effect import to polyfill IndexedDB for tests
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
import type { Project } from '@taucad/types';
import {
  parseProjectIdentityBytes,
  projectIdentityPath,
  serializeProjectIdentity,
} from '@taucad/project-core/identity';

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

  afterEach(() => {
    service.dispose();
  });

  describe('project discovery', () => {
    const manifestProject = (id: string, name = id): Project => ({
      id,
      ...projectToManifest({
        name,
        description: '',
        tags: [],
        assets: { main: { entryPath: 'main.ts' } },
      }),
    });

    const writeManifest = async (provider: FileSystemProvider, directory: string, project: Project): Promise<void> => {
      await provider.mkdir(directory);
      await provider.writeFile(`${directory}/tau.json`, serializeProjectManifest(projectToManifest(project)));
      await provider.writeFile(
        `${directory}/${projectIdentityPath}`,
        serializeProjectIdentity({ version: 1, projectId: project.id }),
      );
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

    it('should initialize hand-authored manifests without rewriting their bytes', async () => {
      const provider = await providerRegistry.getProvider({ backend: 'indexeddb' });
      const bytes = serializeProjectManifest(
        projectToManifest(manifestProject('proj_bbbbbbbbbbbbbbbbbbbbb', 'Hand authored')),
      );
      await provider.writeFile('authored/tau.json', bytes);
      await service.configureProjectRoots({ projects: [], roots: [{ backend: 'indexeddb' }] });
      const first = await service.listProjectManifests();
      const identity = parseProjectIdentityBytes(await provider.readFile(`authored/${projectIdentityPath}`));
      expect(identity.projectId).toMatch(/^proj_[\dA-Za-z]{21}$/);
      expect(first.entries).toMatchObject([
        { status: 'valid', projectId: identity.projectId, manifest: { name: 'Hand authored' } },
      ]);
      expect(await provider.readFile('authored/tau.json')).toEqual(bytes);
      const discovery1 = await service.listProjectManifests();
      expect(discovery1.entries).toEqual(first.entries);
    });

    it('should converge concurrent discovery on one durable identity with one write', async () => {
      const provider = await providerRegistry.getProvider({ backend: 'indexeddb' });
      await provider.writeFile(
        'concurrent/tau.json',
        serializeProjectManifest(projectToManifest(manifestProject('proj_bbbbbbbbbbbbbbbbbbbbb'))),
      );
      await service.configureProjectRoots({ projects: [], roots: [{ backend: 'indexeddb' }] });
      const writes = vi.spyOn(provider, 'writeFile');
      const results = await Promise.all(Array.from({ length: 8 }, async () => service.listProjectManifests()));
      const durable = parseProjectIdentityBytes(await provider.readFile(`concurrent/${projectIdentityPath}`));
      for (const result of results) {
        expect(result.entries).toMatchObject([{ status: 'valid', projectId: durable.projectId }]);
      }
      expect(writes.mock.calls.filter(([path]) => path === `concurrent/${projectIdentityPath}`)).toHaveLength(1);
    });

    it('should observe identity replacement on repeated discovery without a stale cache', async () => {
      const provider = await providerRegistry.getProvider({ backend: 'indexeddb' });
      const project = manifestProject('proj_bbbbbbbbbbbbbbbbbbbbb');
      await writeManifest(provider, 'changed', project);
      await service.configureProjectRoots({ projects: [], roots: [{ backend: 'indexeddb' }] });
      const discovery2 = await service.listProjectManifests();
      expect(discovery2.entries).toMatchObject([{ status: 'valid', projectId: project.id }]);
      const replacement = 'proj_ccccccccccccccccccccc';
      await provider.writeFile(
        `changed/${projectIdentityPath}`,
        serializeProjectIdentity({ version: 1, projectId: replacement }),
      );
      const discovery3 = await service.listProjectManifests();
      expect(discovery3.entries).toMatchObject([{ status: 'valid', projectId: replacement }]);
    });

    it('should keep established read-only projects usable and report missing persistence explicitly', async () => {
      const provider = await providerRegistry.getProvider({ backend: 'indexeddb' });
      const project = manifestProject('proj_bbbbbbbbbbbbbbbbbbbbb');
      await writeManifest(provider, 'established', project);
      await provider.writeFile('new/tau.json', serializeProjectManifest(projectToManifest(project)));
      Object.defineProperty(provider, 'capabilities', {
        value: { ...provider.capabilities, writable: false },
        configurable: true,
      });
      await service.configureProjectRoots({ projects: [], roots: [{ backend: 'indexeddb' }] });
      const writes = vi.spyOn(provider, 'writeFile');
      const discovery4 = await service.listProjectManifests();
      expect(discovery4.entries).toMatchObject([
        { status: 'valid', projectId: project.id },
        { status: 'invalid', issue: { code: 'identity-unavailable' } },
      ]);
      expect(writes).not.toHaveBeenCalled();
    });

    it('should preserve the legacy ID before converting exact prerelease bytes', async () => {
      const provider = await providerRegistry.getProvider({ backend: 'indexeddb' });
      const legacy = {
        ...manifestProject('proj_bbbbbbbbbbbbbbbbbbbbb', 'Backed up'),
        $schema: 'https://tau.new/schemas/tau-schema-v1.json',
      };
      await provider.writeFile('legacy/tau.json', encoder.encode(JSON.stringify(legacy)));
      await service.configureProjectRoots({ projects: [], roots: [{ backend: 'indexeddb' }] });
      const discovery5 = await service.listProjectManifests();
      expect(discovery5.entries).toMatchObject([{ status: 'valid', projectId: legacy.id }]);
      expect(parseProjectIdentityBytes(await provider.readFile(`legacy/${projectIdentityPath}`)).projectId).toBe(
        legacy.id,
      );
      const manifest = parseProjectManifestBytes(await provider.readFile('legacy/tau.json'));
      expect(manifest).toMatchObject({ success: true, data: { $schema: projectManifestSchemaUrl, name: legacy.name } });
      expect(decoder.decode(await provider.readFile('legacy/tau.json'))).not.toContain('"id"');
    });

    it('should refuse contradictory legacy and durable identity without rewriting either', async () => {
      const provider = await providerRegistry.getProvider({ backend: 'indexeddb' });
      const legacy = {
        ...manifestProject('proj_bbbbbbbbbbbbbbbbbbbbb'),
        $schema: 'https://tau.new/schemas/tau-schema-v1.json',
      };
      const bytes = encoder.encode(JSON.stringify(legacy));
      const actualProjectId = 'proj_ccccccccccccccccccccc';
      await provider.writeFile('conflict/tau.json', bytes);
      const identity = serializeProjectIdentity({ version: 1, projectId: actualProjectId });
      await provider.writeFile(`conflict/${projectIdentityPath}`, identity);
      await service.configureProjectRoots({ projects: [], roots: [{ backend: 'indexeddb' }] });
      const discovery6 = await service.listProjectManifests();
      expect(discovery6.entries).toMatchObject([
        { status: 'invalid', issue: { code: 'identity-conflict', expectedProjectId: legacy.id, actualProjectId } },
      ]);
      expect(await provider.readFile('conflict/tau.json')).toEqual(bytes);
      expect(await provider.readFile(`conflict/${projectIdentityPath}`)).toEqual(identity);
    });

    it('should retain the identity and preserve an external edit racing legacy conversion', async () => {
      const provider = await providerRegistry.getProvider({ backend: 'indexeddb' });
      const legacy = {
        ...manifestProject('proj_bbbbbbbbbbbbbbbbbbbbb'),
        $schema: 'https://tau.new/schemas/tau-schema-v1.json',
      };
      await provider.writeFile('raced/tau.json', encoder.encode(JSON.stringify(legacy)));
      const edited = serializeProjectManifest(
        projectToManifest({ ...legacy, $schema: projectManifestSchemaUrl, name: 'External edit' }),
      );
      const original = provider.writeFile.bind(provider);
      vi.spyOn(provider, 'writeFile').mockImplementation(async (path, bytes) => {
        await original(path, bytes);
        if (path === `raced/${projectIdentityPath}`) {
          await original('raced/tau.json', edited);
        }
      });
      await service.configureProjectRoots({ projects: [], roots: [{ backend: 'indexeddb' }] });
      const discovery7 = await service.listProjectManifests();
      expect(discovery7.entries).toMatchObject([{ status: 'invalid', issue: { code: 'identity-unavailable' } }]);
      expect(await provider.readFile('raced/tau.json')).toEqual(edited);
      expect(parseProjectIdentityBytes(await provider.readFile(`raced/${projectIdentityPath}`)).projectId).toBe(
        legacy.id,
      );
      const discovery8 = await service.listProjectManifests();
      expect(discovery8.entries).toMatchObject([
        { status: 'valid', projectId: legacy.id, manifest: { name: 'External edit' } },
      ]);
    });

    it('should refuse matching converted bytes when identity changes during the checked replacement', async () => {
      const provider = await providerRegistry.getProvider({ backend: 'indexeddb' });
      const legacy = {
        ...manifestProject('proj_bbbbbbbbbbbbbbbbbbbbb'),
        $schema: 'https://tau.new/schemas/tau-schema-v1.json',
      };
      const replacementId = 'proj_ccccccccccccccccccccc';
      await provider.writeFile('raced/tau.json', encoder.encode(JSON.stringify(legacy)));
      const converted = serializeProjectManifest(projectToManifest(legacy));
      const originalRead = provider.readFile.bind(provider);
      let identityReads = 0;
      async function readDuringRace(path: string): Promise<Uint8Array<ArrayBuffer>>;
      async function readDuringRace(path: string, encoding: 'utf8'): Promise<string>;
      async function readDuringRace(path: string, encoding?: 'utf8'): Promise<Uint8Array<ArrayBuffer> | string> {
        const bytes = await originalRead(path);
        if (path === `raced/${projectIdentityPath}` && ++identityReads === 1) {
          await provider.writeFile('raced/tau.json', converted);
          await provider.writeFile(
            `raced/${projectIdentityPath}`,
            serializeProjectIdentity({ version: 1, projectId: replacementId }),
          );
        }
        return encoding === 'utf8' ? decoder.decode(bytes) : bytes;
      }
      vi.spyOn(provider, 'readFile').mockImplementation(readDuringRace);
      await service.configureProjectRoots({ projects: [], roots: [{ backend: 'indexeddb' }] });
      const raced = await service.listProjectManifests();
      expect(raced.entries).toMatchObject([{ status: 'invalid', issue: { code: 'identity-unavailable' } }]);
      const current = await service.listProjectManifests();
      expect(current.entries).toMatchObject([{ status: 'valid', projectId: replacementId }]);
    });

    it('should quarantine a malformed identity without changing either file', async () => {
      const provider = await providerRegistry.getProvider({ backend: 'indexeddb' });
      const bytes = serializeProjectManifest(projectToManifest(manifestProject('proj_bbbbbbbbbbbbbbbbbbbbb')));
      await provider.writeFile('broken/tau.json', bytes);
      await provider.writeFile(`broken/${projectIdentityPath}`, '{');
      await service.configureProjectRoots({ projects: [], roots: [{ backend: 'indexeddb' }] });
      const discovery9 = await service.listProjectManifests();
      expect(discovery9.entries).toMatchObject([{ status: 'invalid', issue: { code: 'identity-invalid' } }]);
      expect(await provider.readFile('broken/tau.json')).toEqual(bytes);
      expect(await provider.readFile(`broken/${projectIdentityPath}`, 'utf8')).toBe('{');
    });

    it('should refuse unknown or malformed declarations before initializing identity', async () => {
      const provider = await providerRegistry.getProvider({ backend: 'indexeddb' });
      await provider.writeFile('broken/tau.json', '{');
      await provider.writeFile('future/tau.json', JSON.stringify({ $schema: 'https://tau.new/schemas/tau-v99.json' }));
      await service.configureProjectRoots({ projects: [], roots: [{ backend: 'indexeddb' }] });
      const discovery = await service.listProjectManifests();
      expect(discovery.entries.map(({ status }) => status)).toEqual(['invalid', 'invalid']);
      expect(await provider.exists(`broken/${projectIdentityPath}`)).toBe(false);
      expect(await provider.exists(`future/${projectIdentityPath}`)).toBe(false);
    });

    describe('adoptProjectDirectory', () => {
      it('should recover a missing manifest while preserving its established identity', async () => {
        const provider = await providerRegistry.getProvider({ backend: 'indexeddb' });
        const projectId = 'proj_mmmmmmmmmmmmmmmmmmmmm';
        await provider.writeFile(`lost/${projectIdentityPath}`, serializeProjectIdentity({ version: 1, projectId }));
        await provider.writeFile('lost/main.scad', 'cube(10);');
        await provider.mkdir('plain-folder');
        await service.configureProjectRoots({ projects: [], roots: [{ backend: 'indexeddb' }] });
        const discovery = await service.listProjectManifests();
        expect(discovery.entries).toMatchObject([{ status: 'adoption-required', issue: { code: 'manifest-missing' } }]);
        const adopted = await service.adoptProjectDirectory(discovery.entries[0]!.locator);
        expect(adopted).toMatchObject({
          projectId,
          manifest: { name: 'lost', assets: { main: { entryPath: 'main.scad' } } },
        });
        expect(await provider.readFile('lost/tau.json')).toEqual(serializeProjectManifest(adopted.manifest));
      });

      it('should refuse adoption of a manifest-bearing project and malformed restored IDs', async () => {
        const provider = await providerRegistry.getProvider({ backend: 'indexeddb' });
        await writeManifest(provider, 'existing', manifestProject('proj_eeeeeeeeeeeeeeeeeeeee'));
        await service.configureProjectRoots({ projects: [], roots: [{ backend: 'indexeddb' }] });
        const discovery = await service.listProjectManifests();
        const { locator } = discovery.entries[0]!;
        await expect(service.adoptProjectDirectory(locator)).rejects.toThrow(TypeError);
        await expect(service.adoptProjectDirectory(locator, { id: 'bad' })).rejects.toThrow(TypeError);
      });
    });

    /* Identity routes; the declaration only degrades (blueprint F1, F3). The
     * unsafe path is never used — the view falls back — and no byte changes. */
    it('degrades a defective declaration instead of quarantining an identified project', async () => {
      const provider = await providerRegistry.getProvider({ backend: 'indexeddb' });
      const write = async (directory: string, value: unknown): Promise<string> => {
        if (typeof value !== 'object' || value === null || !('id' in value) || typeof value.id !== 'string') {
          throw new Error('Fixture requires runtime identity');
        }
        const manifest: Record<string, unknown> = { ...value };
        delete manifest['id'];
        const text = JSON.stringify(manifest);
        await provider.mkdir(directory);
        await provider.writeFile(
          `${directory}/${projectIdentityPath}`,
          serializeProjectIdentity({ version: 1, projectId: value.id }),
        );
        await provider.writeFile(`${directory}/tau.json`, encoder.encode(text));
        return text;
      };
      const unsafe = await write('unsafe', {
        ...manifestProject('proj_ccccccccccccccccccccc'),
        assets: { main: { entryPath: '../escape.ts' } },
      });
      await write('salvaged', { ...manifestProject('proj_ddddddddddddddddddddd'), name: 42 });
      await write('second-asset', {
        ...manifestProject('proj_fffffffffffffffffffff'),
        assets: { main: { entryPath: 'main.ts' }, second: { entryPath: 'second.cs' } },
      });
      await write('foreign', {
        ...manifestProject('proj_ggggggggggggggggggggg'),
        $schema: 'https://tau.new/schemas/tau-schema-v2.json',
      });
      await service.configureProjectRoots({ projects: [], roots: [{ backend: 'indexeddb' }] });

      const { entries } = await service.listProjectManifests();
      const byDirectory = (directory: string) => entries.find((entry) => entry.locator.relativeDirectory === directory);
      expect(byDirectory('unsafe')).toMatchObject({
        status: 'valid',
        projectId: 'proj_ccccccccccccccccccccc',
        manifest: { assets: { main: { entryPath: 'main.ts' } } },
        issue: { code: 'manifest-invalid' },
      });
      expect(byDirectory('salvaged')).toMatchObject({
        status: 'valid',
        projectId: 'proj_ddddddddddddddddddddd',
        manifest: { name: '' },
        issue: { code: 'manifest-invalid' },
      });
      expect(byDirectory('second-asset')).toMatchObject({
        status: 'valid',
        projectId: 'proj_fffffffffffffffffffff',
        manifest: { assets: { main: { entryPath: 'main.ts' } } },
        issue: { code: 'manifest-invalid', issues: [{ code: 'unrecognized_keys', keys: ['second'] }] },
      });
      // An older reader never reinterprets a newer contract.
      expect(byDirectory('foreign')).toMatchObject({
        status: 'invalid',
        issue: { code: 'manifest-unknown-schema' },
      });
      expect(decoder.decode(await provider.readFile('unsafe/tau.json'))).toBe(unsafe);
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
          { status: 'valid', projectId: readable.id, locator: { relativeDirectory: 'b-readable' } },
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
        `alpha/${projectIdentityPath}`,
        'beta/tau.json',
        `beta/${projectIdentityPath}`,
        'no-manifest/tau.json',
        `no-manifest/${projectIdentityPath}`,
      ]);
      expect(stat).not.toHaveBeenCalled();
    });

    it('probes manifests with bounded concurrency in deterministic order', async () => {
      const provider = await providerRegistry.getProvider({ backend: 'indexeddb' });
      const names = Array.from({ length: 150 }, (_, index) => `p${String(index).padStart(3, '0')}`);
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
      // Sixty-four directories each read declaration and identity concurrently.
      expect(maxInFlight).toBe(128);
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
              projectId: project.id,
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
            name: 'Readable Project',
            description: '',
            tags: [],
            assets: { main: { entryPath: 'main.ts' } },
          }),
        ),
      );
      await rootProvider.writeFile(
        `${directory}/${projectIdentityPath}`,
        serializeProjectIdentity({ version: 1, projectId: id }),
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

    it('deletes only the exact directory after re-establishing generated identity', async () => {
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

    it('deletes a degraded project whose generated identity still matches', async () => {
      await writePhysicalProject();
      const manifest = await rootProvider.readFile(`${directory}/tau.json`);
      const degraded = JSON.parse(decoder.decode(manifest)) as Record<string, unknown>;
      await rootProvider.writeFile(`${directory}/tau.json`, encoder.encode(JSON.stringify({ ...degraded, extra: 1 })));

      await expect(
        service.permanentlyDeleteProjectDirectory({ projectId, providerBasePath: directory, scope }),
      ).resolves.toEqual({ status: 'deleted' });
      expect(await rootProvider.exists(directory)).toBe(false);
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
          `${directory}/${projectIdentityPath}`,
          serializeProjectIdentity({ version: 1, projectId: 'proj_fffffffffffffffffffff' }),
        );
        await deleteProvider.writeFile(
          `${directory}/tau.json`,
          serializeProjectManifest(
            projectToManifest({
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
      expect(
        parseProjectIdentityBytes(await rootProvider.readFile(`${directory}/${projectIdentityPath}`)).projectId,
      ).toBe(projectId);

      await expect(
        service.permanentlyDeleteProjectDirectory({ projectId, providerBasePath: directory, scope }),
      ).resolves.toEqual({ status: 'deleted' });
      expect(await rootProvider.exists(directory)).toBe(false);
    });

    it('should preserve ambiguous marker casing until final removal and restore canonical identity on refusal', async () => {
      await writePhysicalProject();
      const identityPath = `${directory}/${projectIdentityPath}`;
      const identityBytes = await rootProvider.readFile(identityPath);
      const ambiguousPath = `${directory}/.tau/PROJECT.JSON`;
      await rootProvider.writeFile(ambiguousPath, encoder.encode('foreign marker casing'));
      await expect(
        service.permanentlyDeleteProjectDirectory({ projectId, providerBasePath: directory, scope }),
      ).rejects.toThrow();
      expect(await rootProvider.readFile(identityPath)).toEqual(identityBytes);
      expect(await rootProvider.readFile(ambiguousPath, 'utf8')).toBe('foreign marker casing');
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
      expect(
        parseProjectIdentityBytes(await rootProvider.readFile(`${directory}/${projectIdentityPath}`)).projectId,
      ).toBe(projectId);

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
        projectId,
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

    it.each(
      ['main.ts', '.tau/workbench/layout.json', '.tau/workbench/views/v-abcd1234.json'].flatMap((heldPath) =>
        [false, true].map((rejectWrite) => ({ heldPath, rejectWrite })),
      ),
    )(
      'should keep the manifest unpublished while $heldPath is held (failure=$rejectWrite)',
      async ({ heldPath, rejectWrite }) => {
        const files = {
          ...defaultFiles,
          '.tau/workbench/layout.json': {
            content: encoder.encode(
              '{"version":1,"lanes":{"chat":true,"workbench":true},"viewer":{"kind":"group","tabs":[{"kind":"view","view":"v-abcd1234"}]},"workbench":{"kind":"group","tabs":[]}}\n',
            ),
          },
          '.tau/workbench/views/v-abcd1234.json': { content: encoder.encode('{"version":1,"entryPath":"main.ts"}\n') },
        };
        const entered = Promise.withResolvers<void>();
        const release = Promise.withResolvers<void>();
        const originalWrite = commitProvider.writeFile.bind(commitProvider);
        const writes: string[] = [];
        let hold = true;
        vi.spyOn(commitProvider, 'writeFile').mockImplementation(async (path, data) => {
          writes.push(path);
          if (path === `${directory}/${heldPath}` && hold) {
            hold = false;
            entered.resolve();
            await release.promise;
            if (rejectWrite) {
              throw new Error('Initial input write failed.');
            }
          }
          await originalWrite(path, data);
        });
        let settled = false;
        const committing = (async () => {
          try {
            return await commit(files);
          } finally {
            settled = true;
          }
        })();
        const result = rejectWrite
          ? expect(committing).rejects.toThrow('Initial input write failed.')
          : expect(committing).resolves.toEqual({ status: 'committed' });
        try {
          await entered.promise;
          expect(settled).toBe(false);
          expect(await commitProvider.exists(`${directory}/tau.json`)).toBe(false);
          release.resolve();
          await result;
          if (rejectWrite) {
            expect(await commitProvider.exists(`${directory}/tau.json`)).toBe(false);
            await expect(commit(files)).resolves.toEqual({ status: 'committed' });
          }
          expect(writes.at(-1)).toBe(`${directory}/tau.json`);
          await expect(commitProvider.readFile(`${directory}/tau.json`)).resolves.toEqual(manifest);
          for (const [path, file] of Object.entries(files)) {
            // oxlint-disable-next-line eslint/no-await-in-loop -- Every journaled file's exact bytes are checked after the same settled commit.
            await expect(commitProvider.readFile(`${directory}/${path}`)).resolves.toEqual(file.content);
          }
          await expect(commit(files)).resolves.toEqual({ status: 'already-committed' });
        } finally {
          release.resolve();
        }
      },
    );

    it('rejects a memory scope before storage-key resolution or provider access', async () => {
      const resolveStorageRootKey = vi.spyOn(providerRegistry, 'resolveStorageRootKey');
      const getProvider = vi.spyOn(providerRegistry, 'getProvider');

      await expect(
        service.commitPendingProjectDirectory({
          projectId,
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
            projectId,
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

    it('should replace owned manifest-less residue and write the manifest last', async () => {
      await commitProvider.mkdir(directory, { recursive: true });
      await commitProvider.writeFile(`${directory}/stale.bin`, encoder.encode('stale'));
      await commitProvider.writeFile(
        `${directory}/${projectIdentityPath}`,
        serializeProjectIdentity({ version: 1, projectId }),
      );
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

    it('should preserve identity across interrupted cleanup of owned pending residue', async () => {
      const identityBytes = serializeProjectIdentity({ version: 1, projectId });
      await commitProvider.writeFile(`${directory}/${projectIdentityPath}`, identityBytes);
      await commitProvider.writeFile(`${directory}/old/value.txt`, 'old');
      const remove = vi.spyOn(commitProvider, 'rmdir').mockRejectedValueOnce(new Error('cleanup interrupted'));
      await expect(commit()).rejects.toThrow('cleanup interrupted');
      expect(await commitProvider.readFile(`${directory}/${projectIdentityPath}`)).toEqual(identityBytes);
      remove.mockRestore();
      await expect(commit()).resolves.toEqual({ status: 'committed' });
      expect(
        parseProjectIdentityBytes(await commitProvider.readFile(`${directory}/${projectIdentityPath}`)).projectId,
      ).toBe(projectId);
    });

    it('should preserve an unowned manifest-less directory', async () => {
      await commitProvider.writeFile(`${directory}/keep.txt`, 'unrelated');
      await expect(commit()).resolves.toEqual({ status: 'unidentifiable-manifest' });
      expect(await commitProvider.readFile(`${directory}/keep.txt`, 'utf8')).toBe('unrelated');
      expect(await commitProvider.exists(`${directory}/${projectIdentityPath}`)).toBe(false);
    });

    it('should refuse unmarked residue after a failure between directory allocation and identity commit', async () => {
      const original = commitProvider.writeFile.bind(commitProvider);
      const writes = vi.spyOn(commitProvider, 'writeFile').mockImplementation(async (path, bytes) => {
        if (path === `${directory}/${projectIdentityPath}`) {
          throw new Error('identity disk failure');
        }
        return original(path, bytes);
      });
      await expect(commit()).rejects.toThrow('identity disk failure');
      expect(await commitProvider.exists(directory)).toBe(true);
      writes.mockRestore();
      await commitProvider.writeFile(`${directory}/keep.txt`, 'outside data');
      await expect(commit()).resolves.toEqual({ status: 'unidentifiable-manifest' });
      expect(await commitProvider.readFile(`${directory}/keep.txt`, 'utf8')).toBe('outside data');
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
            name: 'Foreign',
            description: '',
            tags: [],
            assets: { main: { entryPath: 'main.ts' } },
          }),
        ),
      );
      await commitProvider.writeFile(`${directory}/keep.txt`, encoder.encode('keep'));
      await commitProvider.writeFile(
        `${directory}/${projectIdentityPath}`,
        serializeProjectIdentity({ version: 1, projectId: foreignId }),
      );

      await expect(commit()).resolves.toEqual({ status: 'identity-mismatch', actualProjectId: foreignId });
      expect(decoder.decode(await commitProvider.readFile(`${directory}/keep.txt`))).toBe('keep');

      await commitProvider.writeFile(`${directory}/tau.json`, encoder.encode('{invalid'));
      await commitProvider.unlink(`${directory}/${projectIdentityPath}`);
      await expect(commit()).resolves.toEqual({ status: 'unidentifiable-manifest' });
      expect(decoder.decode(await commitProvider.readFile(`${directory}/keep.txt`))).toBe('keep');
    });

    it('treats a degraded same-project manifest as committed without rewriting it', async () => {
      await expect(commit()).resolves.toEqual({ status: 'committed' });
      const degraded = `${decoder.decode(manifest).trimEnd().slice(0, -1)}, "extra": true }`;
      await commitProvider.writeFile(`${directory}/tau.json`, encoder.encode(degraded));

      await expect(commit()).resolves.toEqual({ status: 'already-committed' });
      expect(decoder.decode(await commitProvider.readFile(`${directory}/tau.json`))).toBe(degraded);
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
        name: 'a generated identity replacement',
        input: { files: { '.tau/project.json': { content: encoder.encode('{}') } } },
      },
      {
        name: 'an identity ancestor replacement',
        input: { files: { '.tau': { content: encoder.encode('blocked') } } },
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
          projectId,
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
      let rejectManifest = true;
      vi.spyOn(commitProvider, 'writeFile').mockImplementation(async (path, data) => {
        if (path === `${directory}/tau.json` && rejectManifest) {
          rejectManifest = false;
          throw new Error('manifest write failed');
        }
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
      vi.spyOn(provider, 'writeFile').mockImplementation(async (path, data) => {
        if (path === `${directory}/tau.json`) {
          throw new Error('manifest write failed');
        }
        await originalWriteFile(path, data);
      });

      try {
        await expect(
          context.service.commitPendingProjectDirectory({
            projectId,
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
          projectId,
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
        data: { $schema: projectManifestSchemaUrl },
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
        projectId,
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
        data: { $schema: projectManifestSchemaUrl },
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
            projectId,
            providerBasePath: directory,
            scope: indexedDbScope,
            files: { [mainFile]: { content: encoder.encode('authoritative') } },
            manifest,
          }),
        ).resolves.toEqual({ status: 'committed' });

        await expect(
          first.service.commitPendingProjectDirectory({
            projectId,
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
