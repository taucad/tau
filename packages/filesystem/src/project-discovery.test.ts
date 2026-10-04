// oxlint-disable-next-line import/no-unassigned-import -- IndexedDB is the durable in-process discovery fixture.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseProjectManifestBytes, projectToManifest, serializeProjectManifest } from '@taucad/types';
import { joinRelativePath } from '@taucad/utils/path';
import { createIdbWorkspaceFileService } from '#testing/workspace-service-harness.js';
import { resolveProjectForPath } from '#project-directories.js';
import type { WatchEvent } from '#types.js';
import type { IdbWorkspaceHarness } from '#testing/workspace-service-harness.js';

describe('nested project discovery', () => {
  let harness: IdbWorkspaceHarness;
  beforeEach(async () => {
    harness = await createIdbWorkspaceFileService();
    await harness.service.configureProjectRoots({ projects: [], roots: [{ backend: 'indexeddb' }] });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    harness.service.dispose();
  });

  const writeProject = async (directory: string, id = 'proj_aaaaaaaaaaaaaaaaaaaaa'): Promise<void> => {
    if (directory) {
      await harness.rootProvider.mkdir(directory, { recursive: true });
    }
    await harness.rootProvider.writeFile(
      joinRelativePath(directory, 'tau.json'),
      serializeProjectManifest(
        projectToManifest({
          id,
          name: directory || 'Selected project',
          description: '',
          tags: [],
          assets: { main: { entryPath: 'main.ts' } },
        }),
      ),
    );
  };

  it.each([0, 1, 2, 5, 20])('should discover a project at depth %i without changing its manifest', async (depth) => {
    const directory = Array.from({ length: depth }, (_, index) => `level-${index}`).join('/');
    await writeProject(directory);
    const manifestPath = joinRelativePath(directory, 'tau.json');
    const before = await harness.rootProvider.readFile(manifestPath);
    const result = await harness.service.listProjectManifests();
    expect(result.entries.map(({ status, locator }) => ({ status, path: locator.relativeDirectory }))).toEqual([
      { status: 'valid', path: directory },
    ]);
    expect(result.roots).toEqual([{ status: 'complete', root: { backend: 'indexeddb' } }]);
    expect(await harness.rootProvider.readFile(manifestPath)).toEqual(before);
  });

  it('should discover descendants even when their ancestor is a project', async () => {
    await writeProject('');
    await writeProject('assemblies/gearbox', 'proj_bbbbbbbbbbbbbbbbbbbbb');
    await writeProject('assemblies/gearbox/parts/gear', 'proj_ccccccccccccccccccccc');
    const discovery = await harness.service.listProjectManifests();
    expect(discovery.entries.map(({ locator }) => locator.relativeDirectory)).toEqual([
      '',
      'assemblies/gearbox',
      'assemblies/gearbox/parts/gear',
    ]);
  });

  it('should quarantine duplicate identities across depths rather than choosing the first', async () => {
    await writeProject('');
    await writeProject('nested/copy');
    const discovery = await harness.service.listProjectManifests();
    expect(discovery.entries.map(({ status, locator }) => [status, locator.relativeDirectory])).toEqual([
      ['duplicate-id', ''],
      ['duplicate-id', 'nested/copy'],
    ]);
  });

  it('should skip dependency and hidden trees at every depth', async () => {
    await writeProject('visible/deep');
    await writeProject('visible/node_modules/package');
    await writeProject('visible/.git/worktrees/project');
    await writeProject('.hidden/project');
    const discovery = await harness.service.listProjectManifests();
    expect(discovery.entries.map(({ locator }) => locator.relativeDirectory)).toEqual(['visible/deep']);
  });

  it('should retain readable projects and report incomplete discovery for an unreadable subtree', async () => {
    await writeProject('readable/deep');
    await harness.rootProvider.mkdir('unavailable', { recursive: true });
    const read = harness.rootProvider.readdirEntries!.bind(harness.rootProvider);
    vi.spyOn(harness.rootProvider, 'readdirEntries').mockImplementation(async (path) => {
      if (path === 'unavailable') {
        throw new Error('Access denied');
      }
      return read(path);
    });
    const result = await harness.service.listProjectManifests();
    expect(result.entries.map(({ locator }) => locator.relativeDirectory)).toEqual(['readable/deep']);
    expect(result.roots[0]?.status).toBe('inaccessible');
    if (result.roots[0]?.status === 'inaccessible') {
      expect(result.roots[0].reason).toContain('unavailable');
    }
  });

  it('should preserve invalid and adoptable manifest states at nested locations', async () => {
    await harness.rootProvider.mkdir('group/invalid', { recursive: true });
    await harness.rootProvider.writeFile('group/invalid/tau.json', new TextEncoder().encode('{"$schema":"foreign"}'));
    await harness.rootProvider.mkdir('group/adopt', { recursive: true });
    await harness.rootProvider.writeFile('group/adopt/tau.json', new TextEncoder().encode('{}'));
    const result = await harness.service.listProjectManifests();
    expect(result.entries.map(({ status, locator }) => [locator.relativeDirectory, status])).toEqual([
      ['group/adopt', 'adoption-required'],
      ['group/invalid', 'invalid'],
    ]);
  });

  it('should not treat the workspace root metadata directory as a missing project manifest', async () => {
    await harness.rootProvider.mkdir('.tau', { recursive: true });
    expect(await harness.service.listProjectManifests()).toEqual({
      entries: [],
      roots: [{ status: 'complete', root: { backend: 'indexeddb' } }],
    });
  });
  it.each(['', 'group/nested'])('should adopt and mount a project at %j', async (directory) => {
    if (directory) {
      await harness.rootProvider.mkdir(directory, { recursive: true });
    }
    await harness.rootProvider.writeFile(joinRelativePath(directory, 'tau.json'), new TextEncoder().encode('{}'));
    const discovery = await harness.service.listProjectManifests();
    const entry = discovery.entries[0]!;
    const manifest = await harness.service.adoptProjectDirectory(entry.locator);
    await harness.service.configureProjectRoots({
      roots: [{ backend: 'indexeddb' }],
      projects: [{ backend: 'indexeddb', projectId: manifest.id, providerBasePath: directory }],
    });
    expect(await harness.service.readFile(`/projects/${manifest.id}/tau.json`)).toEqual(
      await harness.rootProvider.readFile(joinRelativePath(directory, 'tau.json')),
    );
  });

  it('should delete a nested leaf project without affecting siblings', async () => {
    await writeProject('group/leaf');
    await writeProject('group/sibling', 'proj_bbbbbbbbbbbbbbbbbbbbb');
    expect(
      await harness.service.permanentlyDeleteProjectDirectory({
        projectId: 'proj_aaaaaaaaaaaaaaaaaaaaa',
        providerBasePath: 'group/leaf',
        scope: { backend: 'indexeddb' },
      }),
    ).toEqual({ status: 'deleted' });
    expect(await harness.rootProvider.exists('group/sibling/tau.json')).toBe(true);
  });

  it('should refuse deletion of an ancestor containing another project', async () => {
    await writeProject('parent');
    await writeProject('parent/child', 'proj_bbbbbbbbbbbbbbbbbbbbb');
    await expect(
      harness.service.permanentlyDeleteProjectDirectory({
        projectId: 'proj_aaaaaaaaaaaaaaaaaaaaa',
        providerBasePath: 'parent',
        scope: { backend: 'indexeddb' },
      }),
    ).rejects.toThrow('nested project');
    expect(await harness.rootProvider.exists('parent/child/tau.json')).toBe(true);
  });

  it('should collect only declared own and ancestor parts, preserving their library paths', async () => {
    await writeProject('');
    await writeProject('design/assembly', 'proj_bbbbbbbbbbbbbbbbbbbbb');
    await writeProject('sibling', 'proj_ccccccccccccccccccccc');
    /* oxlint-disable no-await-in-loop -- Ordered fixture setup precedes the read under test. */
    for (const [directory, parts] of [
      ['', { include: ['shared/**/*.ts', 'sibling/*.ts'], exclude: ['**/*.test.ts'] }],
      ['design/assembly', { include: ['parts/*.ts'] }],
      ['sibling', { include: ['private/*.ts'] }],
    ] as const) {
      const manifestPath = joinRelativePath(directory, 'tau.json');
      const parsed = parseProjectManifestBytes(await harness.rootProvider.readFile(manifestPath));
      if (!parsed.success) {
        throw new Error('Invalid fixture manifest');
      }
      await harness.rootProvider.writeFile(
        manifestPath,
        new TextEncoder().encode(JSON.stringify({ ...parsed.data, parts })),
      );
    }
    for (const path of [
      'shared/bolt.ts',
      'shared/bolt.test.ts',
      'sibling/explicit.ts',
      'sibling/private/hidden.ts',
      'design/assembly/parts/gear.ts',
      'design/assembly/private.ts',
    ]) {
      await harness.rootProvider.writeFile(path, new TextEncoder().encode('// part'));
    }
    /* oxlint-enable no-await-in-loop */
    const discovery = await harness.service.listProjectManifests();
    const project = discovery.entries.find((entry) => entry.locator.relativeDirectory === 'design/assembly')!.locator;
    const result = await harness.service.listProjectParts({ project });
    expect(result.issues).toEqual([]);
    expect(result.parts.map((part) => [part.library.relativeDirectory, part.entryPath, part.declaredBy])).toEqual([
      ['design/assembly', 'parts/gear.ts', 'design/assembly/tau.json'],
      ['', 'shared/bolt.ts', 'tau.json'],
      ['', 'sibling/explicit.ts', 'tau.json'],
    ]);
  });

  it('should retain a known selected-root project when its manifest disappears', async () => {
    await writeProject('');
    await harness.service.configureProjectRoots({
      roots: [{ backend: 'indexeddb' }],
      projects: [{ backend: 'indexeddb', projectId: 'proj_aaaaaaaaaaaaaaaaaaaaa', providerBasePath: '' }],
    });
    await harness.rootProvider.unlink('tau.json');
    const discovery = await harness.service.listProjectManifests();
    expect(discovery.entries).toMatchObject([
      { status: 'adoption-required', locator: { relativeDirectory: '' }, issue: { code: 'manifest-missing' } },
    ]);
  });

  it('should find the nearest project without crossing the connected root', async () => {
    await writeProject('');
    await writeProject('group/child', 'proj_bbbbbbbbbbbbbbbbbbbbb');
    const discovery = await harness.service.listProjectManifests();
    const rootKey = discovery.entries[0]!.locator.storageRootKey;
    expect(resolveProjectForPath(discovery, rootKey, 'group/child/deep/file.ts')?.locator.relativeDirectory).toBe(
      'group/child',
    );
    expect(resolveProjectForPath(discovery, rootKey, 'group/other/file.ts')?.locator.relativeDirectory).toBe('');
    expect(resolveProjectForPath(discovery, 'unconnected', 'group/child')).toBeUndefined();
    expect(() => resolveProjectForPath(discovery, rootKey, '../outside')).toThrow();
  });

  it('should deliver local changes to both parent and nested project views', async () => {
    await writeProject('parent');
    await writeProject('parent/child', 'proj_bbbbbbbbbbbbbbbbbbbbb');
    await harness.service.configureProjectRoots({
      roots: [{ backend: 'indexeddb' }],
      projects: [
        { backend: 'indexeddb', projectId: 'proj_aaaaaaaaaaaaaaaaaaaaa', providerBasePath: 'parent' },
        { backend: 'indexeddb', projectId: 'proj_bbbbbbbbbbbbbbbbbbbbb', providerBasePath: 'parent/child' },
      ],
    });
    const parent = harness.service.createRootedFileSystem('/projects/proj_aaaaaaaaaaaaaaaaaaaaa');
    const child = harness.service.createRootedFileSystem('/projects/proj_bbbbbbbbbbbbbbbbbbbbb');
    const parentEvents: WatchEvent[] = [];
    const childEvents: WatchEvent[] = [];
    const stopParent = parent.watch({ paths: [''], recursive: true }, (event) => parentEvents.push(event));
    const stopChild = child.watch({ paths: [''], recursive: true }, (event) => childEvents.push(event));
    await child.statTree?.('');
    await parent.writeFile('child/part.ts', 'part');
    await vi.waitFor(() => {
      expect(childEvents).toContainEqual({ type: 'change', path: 'part.ts' });
    });
    const rows = await child.statTree?.('');
    expect(rows?.some((row) => row.path === 'part.ts')).toBe(true);
    await child.writeFile('part.ts', 'changed');
    await vi.waitFor(() => {
      expect(parentEvents).toContainEqual({ type: 'change', path: 'child/part.ts' });
    });
    await child.unlink('part.ts');
    await vi.waitFor(() => {
      expect(parentEvents).toContainEqual({ type: 'delete', path: 'child/part.ts' });
    });
    stopParent();
    stopChild();
  });

  it('should refresh both overlapping views after a cross-route move', async () => {
    await writeProject('parent');
    await writeProject('parent/child', 'proj_bbbbbbbbbbbbbbbbbbbbb');
    await harness.service.configureProjectRoots({
      roots: [{ backend: 'indexeddb' }],
      projects: [
        { backend: 'indexeddb', projectId: 'proj_aaaaaaaaaaaaaaaaaaaaa', providerBasePath: 'parent' },
        { backend: 'indexeddb', projectId: 'proj_bbbbbbbbbbbbbbbbbbbbb', providerBasePath: 'parent/child' },
      ],
    });
    const parent = harness.service.createRootedFileSystem('/projects/proj_aaaaaaaaaaaaaaaaaaaaa');
    const child = harness.service.createRootedFileSystem('/projects/proj_bbbbbbbbbbbbbbbbbbbbb');
    await child.writeFile('a.ts', 'part');
    await Promise.all([parent.statTree?.(''), child.statTree?.('')]);
    const parentEvents: WatchEvent[] = [];
    const childEvents: WatchEvent[] = [];
    const stopParent = parent.watch({ paths: [''], recursive: true }, (event) => parentEvents.push(event));
    const stopChild = child.watch({ paths: [''], recursive: true }, (event) => childEvents.push(event));
    await harness.service.move(
      '/projects/proj_aaaaaaaaaaaaaaaaaaaaa/child/a.ts',
      '/projects/proj_bbbbbbbbbbbbbbbbbbbbb/b.ts',
    );
    const parentRows = await parent.statTree?.('');
    const childRows = await child.statTree?.('');
    expect(parentRows?.map((row) => row.path)).toContain('child/b.ts');
    expect(childRows?.map((row) => row.path)).not.toContain('a.ts');
    await vi.waitFor(() => {
      expect(parentEvents).toContainEqual({ type: 'rename', oldPath: 'child/a.ts', newPath: 'child/b.ts' });
      expect(childEvents).toContainEqual({ type: 'rename', oldPath: 'a.ts', newPath: 'b.ts' });
    });
    stopParent();
    stopChild();
  });

  it('should refresh an indexed parent when a nested project is committed and deleted', async () => {
    await writeProject('parent');
    await harness.service.configureProjectRoots({
      roots: [{ backend: 'indexeddb' }],
      projects: [{ backend: 'indexeddb', projectId: 'proj_aaaaaaaaaaaaaaaaaaaaa', providerBasePath: 'parent' }],
    });
    const parent = harness.service.createRootedFileSystem('/projects/proj_aaaaaaaaaaaaaaaaaaaaa');
    await parent.statTree?.('');
    const events: WatchEvent[] = [];
    const stop = parent.watch({ paths: [''], recursive: true }, (event) => events.push(event));
    const manifest = projectToManifest({
      id: 'proj_bbbbbbbbbbbbbbbbbbbbb',
      name: 'Child',
      description: '',
      tags: [],
      assets: { main: { entryPath: 'main.ts' } },
    });
    await harness.service.commitPendingProjectDirectory({
      providerBasePath: 'parent/child',
      scope: { backend: 'indexeddb' },
      manifest: serializeProjectManifest(manifest),
      files: { 'main.ts': { content: new TextEncoder().encode('part') } },
    });
    const committedRows = await parent.statTree?.('');
    expect(committedRows?.map((row) => row.path)).toContain('child/main.ts');
    await vi.waitFor(() => {
      expect(events.length).toBeGreaterThan(0);
    });
    events.length = 0;
    await harness.service.permanentlyDeleteProjectDirectory({
      projectId: manifest.id,
      providerBasePath: 'parent/child',
      scope: { backend: 'indexeddb' },
    });
    const deletedRows = await parent.statTree?.('');
    expect(deletedRows?.map((row) => row.path)).not.toContain('child/main.ts');
    await vi.waitFor(() => {
      expect(events.length).toBeGreaterThan(0);
    });
    stop();
  });

  it('should serialize nested publication with parent deletion', async () => {
    await writeProject('parent');
    const started = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const write = harness.rootProvider.writeFile.bind(harness.rootProvider);
    vi.spyOn(harness.rootProvider, 'writeFile').mockImplementation(async (path, data) => {
      if (path === 'parent/child/main.ts') {
        started.resolve();
        await release.promise;
      }
      return write(path, data);
    });
    const child = projectToManifest({
      id: 'proj_bbbbbbbbbbbbbbbbbbbbb',
      name: 'Child',
      description: '',
      tags: [],
      assets: { main: { entryPath: 'main.ts' } },
    });
    const commit = harness.service.commitPendingProjectDirectory({
      providerBasePath: 'parent/child',
      scope: { backend: 'indexeddb' },
      manifest: serializeProjectManifest(child),
      files: { 'main.ts': { content: new TextEncoder().encode('part') } },
    });
    await started.promise;
    const deletion = harness.service.permanentlyDeleteProjectDirectory({
      projectId: 'proj_aaaaaaaaaaaaaaaaaaaaa',
      providerBasePath: 'parent',
      scope: { backend: 'indexeddb' },
    });
    const refused = expect(deletion).rejects.toThrow('nested project');
    release.resolve();
    await commit;
    await refused;
    expect(await harness.rootProvider.exists('parent/child/tau.json')).toBe(true);
  });
});
