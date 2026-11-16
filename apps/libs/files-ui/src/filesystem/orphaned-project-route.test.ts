import { describe, expect, it, vi } from 'vitest';
import type { FileTreeNode } from '@taucad/filesystem';
import type { ProjectFileSystemConfig } from '#filesystem/handle-store.js';
import { isOrphanedProjectRoute } from '#filesystem/orphaned-project-route.js';

const directory = (id: string): FileTreeNode => ({ id, name: id.split('/').pop()!, size: 0, mtimeMs: 0, children: [] });
const file = (id: string): FileTreeNode => ({
  id,
  name: id.split('/').pop()!,
  size: 23,
  mtimeMs: 0,
  contentKind: 'binary',
});

/** A physical tree as the authority lists it, one level per call. */
const storageOf = (tree: Record<string, readonly FileTreeNode[]>) => ({
  readShallowDirectory: vi.fn(async (path: string) => {
    const nodes = tree[path];
    if (nodes === undefined) {
      throw Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' });
    }
    return [...nodes];
  }),
});

const homeRoute: ProjectFileSystemConfig = {
  projectId: 'proj_ccccccccccccccccccccc',
  backend: 'opfs',
  providerBasePath: 'audit-sandbox',
};

describe('isOrphanedProjectRoute', () => {
  it('should call a Home folder whose files are all gone an orphan, even with its folders left (R14)', async () => {
    /* The audit pane's wipe: 213 directories survived, not one file. */
    const storage = storageOf({
      '/': [directory('/audit-sandbox'), directory('/.tau')],
      '/audit-sandbox': [directory('/audit-sandbox/.git'), directory('/audit-sandbox/.tau')],
      '/audit-sandbox/.git': [directory('/audit-sandbox/.git/refs')],
      '/audit-sandbox/.git/refs': [],
      '/audit-sandbox/.tau': [],
    });

    await expect(isOrphanedProjectRoute(homeRoute, storage)).resolves.toBe(true);
    expect(storage.readShallowDirectory).toHaveBeenCalledWith('/', { scope: { backend: 'opfs' } });
  });

  it('should call a Home route whose folder is gone from a readable root an orphan', async () => {
    const storage = storageOf({ '/': [directory('/another-project')] });

    await expect(isOrphanedProjectRoute(homeRoute, storage)).resolves.toBe(true);
  });

  it('should keep a project with any file left, however deep', async () => {
    const storage = storageOf({
      '/': [directory('/audit-sandbox')],
      '/audit-sandbox': [directory('/audit-sandbox/.git')],
      '/audit-sandbox/.git': [directory('/audit-sandbox/.git/refs'), directory('/audit-sandbox/.git/objects')],
      '/audit-sandbox/.git/refs': [],
      '/audit-sandbox/.git/objects': [file('/audit-sandbox/.git/objects/pack-1.pack')],
    });

    await expect(isOrphanedProjectRoute(homeRoute, storage)).resolves.toBe(false);
  });

  it('should keep a project when any level cannot be read', async () => {
    const storage = storageOf({
      '/': [directory('/audit-sandbox')],
      '/audit-sandbox': [directory('/audit-sandbox/.git')],
    });

    await expect(isOrphanedProjectRoute(homeRoute, storage)).resolves.toBe(false);
  });

  it('should keep a project when the root itself cannot be read', async () => {
    await expect(isOrphanedProjectRoute(homeRoute, storageOf({}))).resolves.toBe(false);
  });

  it.each<ProjectFileSystemConfig>([
    { projectId: 'proj_ccccccccccccccccccccc', backend: 'webaccess', workspaceId: 'wsp_1', providerBasePath: 'a' },
    { projectId: 'proj_ccccccccccccccccccccc', backend: 'node', providerBasePath: 'a' },
    { projectId: 'proj_ccccccccccccccccccccc', backend: 'memory', storageRootKey: 'memory:1', providerBasePath: 'a' },
  ])('should never judge a $backend route, which the browser does not clear', async (config) => {
    const storage = storageOf({ '/': [] });

    await expect(isOrphanedProjectRoute(config, storage)).resolves.toBe(false);
    expect(storage.readShallowDirectory).not.toHaveBeenCalled();
  });
});
