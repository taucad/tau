/**
 * Desktop node backend: the directory-picker capability and the node-backed
 * Home root the file-manager worker mounts.
 *
 * The bridge is stubbed on `globalThis` the way the preload installs it, and
 * `TAU_TARGET` is stubbed the way the desktop build defines it.
 */

// oxlint-disable-next-line import/no-unassigned-import -- side-effect import polyfills IndexedDB for tests
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as HandleStore from '#filesystem/handle-store.js';
import type * as BrowserConstants from '#constants/browser.constants.js';
import { fileManagerWorkerName, homeBackendFromWorkerName } from '#machines/file-manager-worker-name.js';

const homeRoot = '/Users/tester/Library/Application Support/Tau/home';

const selectDirectory = vi.fn(async () => '/Users/tester/Projects');

const installDesktopBridge = (): void => {
  vi.stubEnv('TAU_TARGET', 'desktop');
  vi.stubGlobal('tau', {
    nodeFs: { homeRoot, connect: async () => new MessageChannel().port1 },
    dialog: { selectDirectory },
  });
};

/** Fresh module graph per case: the target flag is read once at module scope. */
const loadModules = async (): Promise<{
  handleStore: typeof HandleStore;
  browserConstants: typeof BrowserConstants;
}> => {
  vi.resetModules();
  globalThis.indexedDB = new IDBFactory();
  return {
    handleStore: await import('#filesystem/handle-store.js'),
    browserConstants: await import('#constants/browser.constants.js'),
  };
};

beforeEach(() => {
  selectDirectory.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('desktop node Home', () => {
  it('pins Home to the node engine on the desktop build', async () => {
    installDesktopBridge();
    const { handleStore } = await loadModules();

    await expect(handleStore.getHomeStorageBackend()).resolves.toBe('node');
  });

  it('leaves Home on a browser engine off the desktop build', async () => {
    vi.resetModules();
    // The OPFS probe needs a Storage Manager jsdom does not have; the branch
    // under test is the one before it.
    vi.doMock('#filesystem/home-opfs-probe.js', () => ({ probeHomeOpfs: async () => false }));
    const { handleStore } = await loadModules();

    await expect(handleStore.getHomeStorageBackend()).resolves.toBe('indexeddb');
    vi.doUnmock('#filesystem/home-opfs-probe.js');
  });

  it('publishes the node Home root with its absolute host path', async () => {
    installDesktopBridge();
    const { handleStore } = await loadModules();

    const { roots } = await handleStore.getProjectRootConfigs();

    expect(roots).toContainEqual({ backend: 'node', path: homeRoot });
  });

  it('resolves a persisted node project row against the ambient Home root', async () => {
    installDesktopBridge();
    const { handleStore } = await loadModules();
    const projectId = 'proj_aaaaaaaaaaaaaaaaaaaaa';
    await handleStore.setProjectFileSystemConfig({ projectId, backend: 'node', providerBasePath: 'alpha' });

    const { projects } = await handleStore.getProjectRootConfigs();

    expect(projects).toContainEqual({ projectId, backend: 'node', providerBasePath: 'alpha', path: homeRoot });
  });

  it('pins Home to node even when the preload bridge has not been installed yet', async () => {
    // Preload installs `window.tau` through `contextBridge`, but nothing about
    // Home's backend may depend on the bridge being there: ruling C1 says the
    // desktop data path is node-backed — the build target decides, not a probe.
    vi.stubEnv('TAU_TARGET', 'desktop');
    const { handleStore } = await loadModules();

    await expect(handleStore.getHomeStorageBackend()).resolves.toBe('node');
  });

  it('refuses to durably pin Home to a browser engine on the desktop build', async () => {
    vi.stubEnv('TAU_TARGET', 'desktop');
    const { handleStore } = await loadModules();

    await expect(handleStore.pinHomeStorageBackend('opfs')).rejects.toThrow(/desktop/i);
    await expect(handleStore.getHomeStorageBackend()).resolves.toBe('node');
  });

  it('carries the node engine to the worker through its name', () => {
    expect(homeBackendFromWorkerName(fileManagerWorkerName('node'))).toBe('node');
  });
});

describe('picked node workspaces', () => {
  const picked = '/Users/tester/Projects/Workshop';

  it('records a picked folder by its absolute path and re-adopts it on a second pick', async () => {
    installDesktopBridge();
    const { handleStore } = await loadModules();

    const first = await handleStore.createNodeWorkspace(picked);
    expect(first).toMatchObject({ name: 'Workshop', slug: 'workshop', path: picked, minted: true });

    // A trailing separator is cosmetic; the path it names is the same folder.
    const second = await handleStore.createNodeWorkspace(`${picked}/`);
    expect(second).toMatchObject({ workspaceId: first.workspaceId, minted: false });

    const rows = await handleStore.listWorkspaces();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ workspaceId: first.workspaceId, path: picked });
    expect(handleStore.isNodeWorkspace(rows[0]!)).toBe(true);
  });

  it('publishes the picked root and routes its projects there, not at Home', async () => {
    installDesktopBridge();
    const { handleStore } = await loadModules();
    await handleStore.createNodeWorkspace(picked);
    const projectId = 'proj_bbbbbbbbbbbbbbbbbbbbb';
    await handleStore.setProjectFileSystemConfig({
      projectId,
      backend: 'node',
      path: picked,
      providerBasePath: 'widget',
    });

    const { projects, roots } = await handleStore.getProjectRootConfigs();

    expect(roots).toEqual([
      { backend: 'node', path: homeRoot },
      { backend: 'node', path: picked },
    ]);
    expect(projects).toContainEqual({
      projectId,
      backend: 'node',
      path: picked,
      providerBasePath: 'widget',
    });
  });

  it('drops a node row naming a root that is no longer registered', async () => {
    installDesktopBridge();
    const { handleStore } = await loadModules();
    await handleStore.setProjectFileSystemConfig({
      projectId: 'proj_ccccccccccccccccccccc',
      backend: 'node',
      path: '/Volumes/Detached/Workshop',
      providerBasePath: 'widget',
    });

    const { projects } = await handleStore.getProjectRootConfigs();

    expect(projects).toEqual([]);
  });

  it('never probes a permission for a node workspace', async () => {
    installDesktopBridge();
    const { handleStore } = await loadModules();
    const created = await handleStore.createNodeWorkspace(picked);

    // No handle is retained, so the webaccess resolution path finds nothing —
    // node roots are admitted by their row, and reported by `getProjectRootConfigs`.
    await expect(handleStore.getWorkspace(created.workspaceId)).resolves.toBeUndefined();
    const { roots } = await handleStore.getProjectRootConfigs();
    expect(roots).toContainEqual({ backend: 'node', path: picked });
  });
});

describe('directory picker capability', () => {
  it('picks an absolute host path through the shell dialog on desktop', async () => {
    installDesktopBridge();
    const { browserConstants } = await loadModules();

    const picker = browserConstants.directoryPicker();

    expect(picker).toMatchObject({ available: true, backend: 'node' });
    await expect(picker.pick({ id: 'tau-workspace' })).resolves.toEqual({
      backend: 'node',
      path: '/Users/tester/Projects',
    });
    expect(selectDirectory).toHaveBeenCalledWith({ id: 'tau-workspace' });
  });

  it('reports no handle-producing picker on desktop, so handle-typed flows stay disabled', async () => {
    installDesktopBridge();
    const { browserConstants } = await loadModules();

    expect(browserConstants.webAccessDirectoryPicker()).toBeUndefined();
  });

  it('treats a cancelled dialog as no pick', async () => {
    installDesktopBridge();
    selectDirectory.mockResolvedValueOnce(undefined as unknown as string);
    const { browserConstants } = await loadModules();

    await expect(browserConstants.directoryPicker().pick()).resolves.toBeUndefined();
  });

  it('falls back to showDirectoryPicker on the web build', async () => {
    const handleLike = { name: 'Projects' };
    const handle = handleLike as unknown as FileSystemDirectoryHandle;
    const showDirectoryPicker = vi.fn(async () => handle);
    Object.defineProperty(globalThis.window, 'showDirectoryPicker', { configurable: true, value: showDirectoryPicker });
    const { browserConstants } = await loadModules();

    const picker = browserConstants.directoryPicker();

    expect(picker.backend).toBe('webaccess');
    await expect(picker.pick({ id: 'tau-workspace' })).resolves.toEqual({ backend: 'webaccess', handle });
    await expect(browserConstants.webAccessDirectoryPicker()?.pick()).resolves.toBe(handle);
  });
});
