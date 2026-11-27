// oxlint-disable-next-line import/no-unassigned-import -- Side-effect import to polyfill IndexedDB for tests
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { projectIdentityPath, serializeProjectIdentity } from '@taucad/project-core/identity';
import { projectToManifest, serializeProjectManifest } from '@taucad/types';
import type { ChangeSet, ChangeSetReset } from '#change-event-bus.js';
import type { CheckoutRootConfig, ProjectRootConfig, StorageRootConfig } from '#mount-table.js';
import type { ProjectIndexes } from '#project-index/project-indexes.js';
import type { FileSystemProvider, WatchEvent } from '#types.js';
import { WatchRegistry } from '#watch-registry.js';
import type { WorkspaceFileService } from '#workspace-file-service.js';
import { createIdbWorkspaceFileService, createWorkspaceFileService } from '#testing/workspace-service-harness.js';

/**
 * Scoped invalidation in the authority (project-library fast-path FW5): a topology change resets the watches that can
 * see the changed routes, and a permanent delete forgets the Project Indexes that read the removed bytes. A missed
 * reset is a stale view, so every case below is also run with the reset every watch heard before (`emitResetAll`), and
 * a consumer that re-reads what its resets name must end with the same view either way: the view a fresh read gives.
 */

const x = 'proj_xxxxxxxxxxxxxxxxxxxxx';
const y = 'proj_yyyyyyyyyyyyyyyyyyyyy';
const z = 'proj_zzzzzzzzzzzzzzzzzzzzz';
const projectsRoot = 'memory:scoped-projects';
const previewRoot = 'memory:preview:p1';

const services: WorkspaceFileService[] = [];

afterEach(() => {
  for (const service of services.splice(0)) {
    service.dispose();
  }
  vi.restoreAllMocks();
});

/** The authority's own watch plane, where the bridge registers unrooted watches. */
const registryOf = (service: WorkspaceFileService): WatchRegistry =>
  (service as unknown as { _watchRegistry: WatchRegistry })._watchRegistry;

const indexesOf = (service: WorkspaceFileService): ProjectIndexes =>
  (service as unknown as { _projectIndexes: ProjectIndexes })._projectIndexes;

type Mode = 'scoped' | 'global';

/** Before FW5, every topology change reset every watch: the comparison every case is held to. */
const useMode = (mode: Mode): void => {
  if (mode === 'global') {
    vi.spyOn(WatchRegistry.prototype, 'emitReset').mockImplementation(function (this: WatchRegistry) {
      this.emitResetAll();
    });
  }
};

const route = (projectId: string, directory: string): ProjectRootConfig => ({
  projectId,
  backend: 'memory',
  storageRootKey: projectsRoot,
  providerBasePath: directory,
});

/** A memory root at `/`, a `/projects` directory in it, and project directories on another memory storage root. */
const memoryAuthority = async (): Promise<{
  service: WorkspaceFileService;
  projects: FileSystemProvider;
  preview: FileSystemProvider;
}> => {
  const { service, providerRegistry, provider } = await createWorkspaceFileService();
  services.push(service);
  await provider.mkdir('projects', { recursive: true });
  await provider.mkdir('checkouts', { recursive: true });
  await provider.mkdir('previews', { recursive: true });
  await provider.writeFile('readme.txt', 'root');
  const projects = await providerRegistry.getProvider({ backend: 'memory', storageRootKey: projectsRoot });
  const fixture: Readonly<Record<string, Readonly<Record<string, string>>>> = {
    'dir-x': { 'a.txt': 'x-a', 'src/b.txt': 'x-b' },
    '.tau/checkouts': { 'c1/main.ts': 'c1' },
    'dir-y': { 'c.txt': 'y-c', 'src/d.txt': 'y-d' },
    'dir-z': { 'e.txt': 'z-e' },
    'dir-w': { 'f.txt': 'w-f' },
  };
  for (const [directory, files] of Object.entries(fixture)) {
    for (const [path, content] of Object.entries(files)) {
      const parent = path.includes('/') ? `${directory}/${path.slice(0, path.lastIndexOf('/'))}` : directory;
      // oxlint-disable-next-line no-await-in-loop -- Fixture setup, in order.
      await projects.mkdir(parent, { recursive: true });
      // oxlint-disable-next-line no-await-in-loop -- Fixture setup, in order.
      await projects.writeFile(`${directory}/${path}`, content);
    }
  }
  const preview = await providerRegistry.getProvider({ backend: 'memory', storageRootKey: previewRoot });
  await preview.mkdir('first', { recursive: true });
  await preview.writeFile('first/g.txt', 'first');
  await preview.mkdir('second', { recursive: true });
  await preview.writeFile('second/g.txt', 'second');
  return { service, projects, preview };
};

/** Everything at and below `path` as the authority answers it: each directory's sorted listing and each file's text. */
const read = async (service: WorkspaceFileService, path: string, depth: number): Promise<Map<string, string>> => {
  const view = new Map<string, string>();
  const visit = async (at: string, left: number): Promise<void> => {
    let type: string;
    try {
      ({ type } = await service.stat(at));
    } catch {
      return;
    }
    if (type !== 'dir') {
      const bytes = await service.readFile(at);
      view.set(at, `file:${typeof bytes === 'string' ? bytes : new TextDecoder().decode(bytes)}`);
      return;
    }
    /* A directory at the edge of a direct watch is seen to exist; its own listing is not watched. */
    if (left < 0) {
      view.set(at, 'dir');
      return;
    }
    const listed = await service.readdir(at);
    const names = listed.toSorted();
    view.set(at, `dir:${names.join(',')}`);
    for (const name of names) {
      // oxlint-disable-next-line no-await-in-loop -- A walk in listing order.
      await visit(at === '/' ? `/${name}` : `${at}/${name}`, left - 1);
    }
  };
  await visit(path, depth);
  return view;
};

const within = (prefix: string, path: string): boolean =>
  prefix === '/' || path === prefix || path.startsWith(`${prefix}/`);

/**
 * A consumer that keeps a view of one watch and re-reads what each change set names: a reset's prefix, as far as the
 * watch reaches, or the parent of each entry. Its view must always equal a fresh read of the watch.
 */
const mirror = async (service: WorkspaceFileService, path: string, recursive: boolean) => {
  const depth = recursive ? Number.POSITIVE_INFINITY : 0;
  let view = await read(service, path, depth);
  const resets: ChangeSetReset[] = [];
  let pending: Promise<void> = Promise.resolve();
  const reread = (prefix: string): void => {
    const previous = pending;
    pending = (async () => {
      await previous;
      /* A prefix above the watch re-reads the whole watch; one inside it re-reads that subtree (a direct watch's whole
       * view is the listing of its path, so a prefix below it re-reads that listing). */
      const from = within(prefix, path) ? path : recursive ? prefix : path;
      const fresh = await read(service, from, from === path ? depth : Number.POSITIVE_INFINITY);
      view = new Map([...[...view].filter(([key]) => !within(from, key)), ...fresh]);
    })();
  };
  const stop = registryOf(service).watchChangeSets({ paths: [path], recursive }, (set: ChangeSet) => {
    if (set.reset !== undefined) {
      resets.push(set.reset);
      reread(set.reset.prefix);
      return;
    }
    for (const entry of set.entries) {
      for (const edge of entry.oldPath === undefined ? [entry.path] : [entry.oldPath, entry.path]) {
        reread(edge.slice(0, edge.lastIndexOf('/')) || '/');
      }
    }
  });
  return {
    resets,
    stop,
    /** The consumer's view once every re-read it began has settled. */
    view: async (): Promise<Map<string, string>> => {
      await pending;
      return view;
    },
    fresh: async (): Promise<Map<string, string>> => read(service, path, depth),
  };
};

type Mirror = Awaited<ReturnType<typeof mirror>>;

/** Every consumer's view equals a fresh read of its watch. */
const expectCurrent = async (mirrors: Record<string, Mirror>): Promise<void> => {
  for (const consumer of Object.values(mirrors)) {
    // oxlint-disable-next-line no-await-in-loop -- Each consumer settles in turn.
    expect(await consumer.view()).toEqual(await consumer.fresh());
  }
};

/** The watches of a library page: the workspace, `/projects`' listing, each project, and a path deep in one. */
const libraryMirrors = async (service: WorkspaceFileService) => ({
  root: await mirror(service, '/', true),
  rootListing: await mirror(service, '/', false),
  projects: await mirror(service, '/projects', false),
  x: await mirror(service, `/projects/${x}`, true),
  y: await mirror(service, `/projects/${y}`, true),
  ySource: await mirror(service, `/projects/${y}/src`, false),
  checkouts: await mirror(service, '/checkouts', true),
});

/** One path of a consumer's settled view. */
const entryOf = async (consumer: Mirror, path: string): Promise<string | undefined> => {
  const view = await consumer.view();
  return view.get(path);
};

const resetPrefixes = (consumer: Mirror): string[] => consumer.resets.map(({ prefix }) => prefix);

describe.each<Mode>(['scoped', 'global'])('a topology change with %s resets', (mode) => {
  const scoped = mode === 'scoped';

  it('should reset no watch under another project when a route is added for one (a create)', async () => {
    useMode(mode);
    const { service } = await memoryAuthority();
    await service.configureProjectRoots({ projects: [route(x, 'dir-x'), route(y, 'dir-y')], roots: [] });
    const mirrors = await libraryMirrors(service);

    await service.configureProjectRoots({
      projects: [route(x, 'dir-x'), route(y, 'dir-y'), route(z, 'dir-z')],
      roots: [],
    });

    await expectCurrent(mirrors);
    expect(await entryOf(mirrors.projects, '/projects')).toBe(`dir:${[x, y, z].toSorted().join(',')}`);
    if (scoped) {
      expect(resetPrefixes(mirrors.root)).toEqual(['/projects']);
      expect(resetPrefixes(mirrors.projects)).toEqual(['/projects']);
      for (const unreached of [mirrors.rootListing, mirrors.x, mirrors.y, mirrors.ySource, mirrors.checkouts]) {
        expect(unreached.resets).toEqual([]);
      }
    }
  });

  it('should reset the removed route and its ancestors, and no other project, when a route goes (a delete)', async () => {
    useMode(mode);
    const { service } = await memoryAuthority();
    await service.configureProjectRoots({ projects: [route(x, 'dir-x'), route(y, 'dir-y')], roots: [] });
    const mirrors = await libraryMirrors(service);

    await service.configureProjectRoots({ projects: [route(y, 'dir-y')], roots: [] });

    await expectCurrent(mirrors);
    expect(await mirrors.x.view()).toEqual(new Map());
    if (scoped) {
      expect(resetPrefixes(mirrors.x)).toEqual([`/projects/${x}`]);
      expect(resetPrefixes(mirrors.projects)).toEqual(['/projects']);
      expect(mirrors.y.resets).toEqual([]);
      expect(mirrors.ySource.resets).toEqual([]);
    }
  });

  it('should reset both projects when a directory moves from one project route to another', async () => {
    useMode(mode);
    const { service } = await memoryAuthority();
    await service.configureProjectRoots({
      projects: [route(x, 'dir-x'), route(y, 'dir-y'), route(z, 'dir-z')],
      roots: [],
    });
    const mirrors = { ...(await libraryMirrors(service)), z: await mirror(service, `/projects/${z}`, true) };

    /* `dir-x` leaves x for y; y's own directory is left unrouted. */
    await service.configureProjectRoots({ projects: [route(y, 'dir-x'), route(z, 'dir-z')], roots: [] });

    await expectCurrent(mirrors);
    expect(await entryOf(mirrors.y, `/projects/${y}/a.txt`)).toBe('file:x-a');
    if (scoped) {
      expect(resetPrefixes(mirrors.x)).toEqual([`/projects/${x}`]);
      expect(resetPrefixes(mirrors.y)).toEqual([`/projects/${y}`]);
      expect(resetPrefixes(mirrors.ySource)).toEqual([`/projects/${y}`]);
      expect(mirrors.z.resets).toEqual([]);
    }
  });

  it('should reset only the re-pointed project when its route moves to another directory', async () => {
    useMode(mode);
    const { service } = await memoryAuthority();
    await service.configureProjectRoots({ projects: [route(x, 'dir-x'), route(y, 'dir-y')], roots: [] });
    const mirrors = await libraryMirrors(service);

    await service.configureProjectRoots({ projects: [route(x, 'dir-w'), route(y, 'dir-y')], roots: [] });

    await expectCurrent(mirrors);
    expect(await entryOf(mirrors.x, `/projects/${x}/f.txt`)).toBe('file:w-f');
    if (scoped) {
      expect(resetPrefixes(mirrors.x)).toEqual([`/projects/${x}`]);
      expect(resetPrefixes(mirrors.projects)).toEqual(['/projects']);
      expect(mirrors.y.resets).toEqual([]);
    }
  });

  it('should reset a checkout route and its ancestors, and no project route', async () => {
    useMode(mode);
    const { service } = await memoryAuthority();
    await service.configureProjectRoots({ projects: [route(x, 'dir-x'), route(y, 'dir-y')], roots: [] });
    const mirrors = await libraryMirrors(service);
    const checkout: CheckoutRootConfig = { ...route(x, '.tau/checkouts/c1'), checkoutId: 'chk_c1' };

    const result = await service.configureProjectRoots({
      projects: [route(x, 'dir-x'), route(y, 'dir-y')],
      checkouts: [checkout],
      roots: [],
    });

    expect(result.skipped).toEqual([]);
    await expectCurrent(mirrors);
    expect(await entryOf(mirrors.checkouts, '/checkouts/chk_c1/main.ts')).toBe('file:c1');
    if (scoped) {
      expect(resetPrefixes(mirrors.checkouts)).toEqual(['/checkouts']);
      expect(resetPrefixes(mirrors.root)).toEqual(['/checkouts']);
      for (const unreached of [mirrors.rootListing, mirrors.projects, mirrors.x, mirrors.y, mirrors.ySource]) {
        expect(unreached.resets).toEqual([]);
      }
    }
  });

  it('should reset the watches of a mount nested in the root mount and its ancestors, and no sibling', async () => {
    useMode(mode);
    const { service } = await memoryAuthority();
    await service.configureProjectRoots({ projects: [route(x, 'dir-x'), route(y, 'dir-y')], roots: [] });
    const mirrors = await libraryMirrors(service);
    const previewListing = await mirror(service, '/previews', false);

    /* A preview mount inside the root mount, then the same prefix over other bytes: each a nested topology change. */
    await service.mount('/previews/p1', {
      backend: 'memory',
      storageRootKey: previewRoot,
      providerBasePath: 'first',
      class: 'derived',
    });
    const preview = await mirror(service, '/previews/p1', true);
    await service.mount('/previews/p1', {
      backend: 'memory',
      storageRootKey: previewRoot,
      providerBasePath: 'second',
      class: 'derived',
    });

    await expectCurrent({ ...mirrors, previewListing, preview });
    expect(await entryOf(preview, '/previews/p1/g.txt')).toBe('file:second');
    if (scoped) {
      expect(resetPrefixes(preview)).toEqual(['/previews/p1']);
      expect(resetPrefixes(previewListing)).toEqual(['/previews', '/previews']);
      expect(resetPrefixes(mirrors.root)).toEqual(['/previews', '/previews']);
      for (const unreached of [mirrors.rootListing, mirrors.projects, mirrors.x, mirrors.y, mirrors.checkouts]) {
        expect(unreached.resets).toEqual([]);
      }
    }
  });

  it('should reset only the revoked project when a sibling tab reports it unavailable', async () => {
    useMode(mode);
    const { service } = await memoryAuthority();
    await service.configureProjectRoots({ projects: [route(x, 'dir-x'), route(y, 'dir-y')], roots: [] });
    const mirrors = await libraryMirrors(service);
    const perPath: WatchEvent[] = [];
    service.watch({ paths: [`/projects/${y}`], recursive: true }, (event) => perPath.push(event));
    const sender = new BroadcastChannel('tau-fs-changes');

    try {
      sender.postMessage({
        tabId: crypto.randomUUID(),
        seq: 1,
        changes: [
          {
            type: 'project-unavailable',
            path: `/projects/${x}`,
            authority: { storageRootKey: projectsRoot, providerBasePath: 'dir-x' },
          },
        ],
      });
      await vi.waitFor(() => {
        expect(mirrors.x.resets.length).toBeGreaterThan(0);
      });
    } finally {
      sender.close();
    }

    await expectCurrent(mirrors);
    expect(await mirrors.x.view()).toEqual(new Map());
    if (scoped) {
      expect(resetPrefixes(mirrors.x)).toEqual([`/projects/${x}`]);
      expect(mirrors.y.resets).toEqual([]);
      expect(perPath).toEqual([]);
    }
  });

  it('should reset every watch when the discovery-root set changes', async () => {
    useMode(mode);
    const { service } = await memoryAuthority();
    await service.configureProjectRoots({ projects: [route(x, 'dir-x'), route(y, 'dir-y')], roots: [] });
    const mirrors = await libraryMirrors(service);
    const roots: StorageRootConfig[] = [{ backend: 'indexeddb' }];

    await service.configureProjectRoots({ projects: [route(x, 'dir-x'), route(y, 'dir-y')], roots });

    await expectCurrent(mirrors);
    for (const consumer of Object.values(mirrors)) {
      expect(resetPrefixes(consumer)).toEqual(['/']);
    }
  });
});

/** A durable project directory, and a checkout of it at the storage root's checkout area. */
const writeProject = async (provider: FileSystemProvider, directory: string, projectId: string): Promise<void> => {
  await provider.mkdir(`${directory}/src`, { recursive: true });
  const manifest = projectToManifest({
    name: directory,
    description: '',
    tags: [],
    assets: { main: { entryPath: 'main.ts' } },
  });
  await provider.writeFile(`${directory}/tau.json`, serializeProjectManifest(manifest));
  await provider.writeFile(`${directory}/${projectIdentityPath}`, serializeProjectIdentity({ version: 1, projectId }));
  await provider.writeFile(`${directory}/main.ts`, 'export default {};');
  await provider.writeFile(`${directory}/src/part.ts`, 'export default {};');
  await provider.mkdir(`.tau/checkouts/${directory}`, { recursive: true });
  await provider.writeFile(`.tau/checkouts/${directory}/main.ts`, 'export default {};');
};

describe('a permanent delete', () => {
  it("should leave every other project's Project Index warm and forget each that read the removed bytes", async () => {
    const { service, rootProvider } = await createIdbWorkspaceFileService();
    services.push(service);
    await writeProject(rootProvider, 'x', x);
    await writeProject(rootProvider, 'y', y);
    const durable = (projectId: string, directory: string): ProjectRootConfig => ({
      projectId,
      backend: 'indexeddb',
      providerBasePath: directory,
    });
    await service.configureProjectRoots({
      projects: [durable(x, 'x'), durable(y, 'y')],
      checkouts: [
        { ...durable(x, '.tau/checkouts/x'), checkoutId: 'chk_x' },
        { ...durable(y, '.tau/checkouts/y'), checkoutId: 'chk_y' },
      ],
      roots: [{ backend: 'indexeddb' }],
    });
    const indexes = indexesOf(service);
    /* Each project, its checkout, the removed directory and a directory inside it read again through the root mount,
     * and one root over the whole storage root that holds the removed directory. */
    const roots = [
      `/projects/${x}`,
      `/projects/${y}`,
      '/checkouts/chk_x',
      '/checkouts/chk_y',
      '/x',
      '/x/src',
      '/y',
      '/y/src',
      '/.tau',
    ];
    for (const root of roots) {
      // oxlint-disable-next-line no-await-in-loop -- Each root warms in turn.
      await indexes.ready(root);
    }
    /* The page's watch of a project is a rooted view's (the bridge's connection), as in production. */
    const yResets: ChangeSetReset[] = [];
    service.createRootedFileSystem(`/projects/${y}`).watchChangeSets!({ paths: [''], recursive: true }, (set) => {
      if (set.reset !== undefined) {
        yResets.push(set.reset);
      }
    });

    await expect(
      service.permanentlyDeleteProjectDirectory({
        projectId: x,
        providerBasePath: 'x',
        scope: { backend: 'indexeddb' },
      }),
    ).resolves.toMatchObject({ status: 'deleted' });

    for (const root of [`/projects/${x}`, '/x', '/x/src']) {
      expect(indexes.get(root)).toBeUndefined();
    }
    for (const root of [`/projects/${y}`, '/checkouts/chk_x', '/checkouts/chk_y', '/y', '/.tau']) {
      expect(indexes.get(root)?.entry('main.ts') ?? indexes.get(root)?.entry('checkouts')).toBeDefined();
    }
    expect(indexes.get('/y/src')?.entry('part.ts')).toBeDefined();
    expect(yResets).toEqual([]);
  });
});

/*
 * Review M2: Home is mounted at `/` and its connection is rooted there, so a Home project directory `x` is seen at `/x`
 * through the Home connection as well as at `/projects/<id>` through its route. A bound permanent delete must reach
 * every watch of that alias once the directory is gone, scoped or not.
 */
describe.each<Mode>(['scoped', 'global'])('a bound permanent delete seen through the Home connection, %s', (mode) => {
  it('should reach every watch of the removed directory on the Home connection after it is removed', async () => {
    useMode(mode);
    const { service, rootProvider } = await createIdbWorkspaceFileService();
    services.push(service);
    await writeProject(rootProvider, 'x', x);
    await writeProject(rootProvider, 'y', y);
    const durable = (projectId: string, directory: string): ProjectRootConfig => ({
      projectId,
      backend: 'indexeddb',
      providerBasePath: directory,
    });
    await service.configureProjectRoots({
      projects: [durable(x, 'x'), durable(y, 'y')],
      roots: [{ backend: 'indexeddb' }],
    });
    const home = service.createRootedFileSystem('/');
    let removed = false;
    const forget = indexesOf(service).forgetRemovedDirectory.bind(indexesOf(service));
    vi.spyOn(indexesOf(service), 'forgetRemovedDirectory').mockImplementation((directory) => {
      removed = true;
      forget(directory);
    });
    const heard = { listing: 0, directory: 0, sets: 0, listingSets: 0, sibling: 0 };
    let listing = '';
    let relisting: Promise<void> = Promise.resolve();
    const relist = (): void => {
      const previous = relisting;
      relisting = (async () => {
        await previous;
        try {
          const names = await home.readdir('');
          listing = names.toSorted().join(',');
        } catch {
          /* A late event after the service's disposal: its view is stale, and the test has ended. */
        }
      })();
    };
    relist();
    const after = (key: keyof typeof heard) => (): void => {
      if (removed) {
        heard[key] += 1;
      }
    };
    home.watch({ paths: [''] }, () => {
      after('listing')();
      relist();
    });
    home.watch({ paths: ['x'], recursive: true }, after('directory'));
    home.watch({ paths: ['y'], recursive: true }, after('sibling'));
    home.watchChangeSets!({ paths: [''], recursive: true }, after('sets'));
    home.watchChangeSets!({ paths: [''] }, after('listingSets'));

    await expect(
      service.permanentlyDeleteProjectDirectory({
        projectId: x,
        providerBasePath: 'x',
        scope: { backend: 'indexeddb' },
      }),
    ).resolves.toMatchObject({ status: 'deleted' });
    await vi.waitFor(() => {
      for (const key of ['listing', 'directory', 'sets', 'listingSets'] as const) {
        expect(heard[key], key).toBeGreaterThan(0);
      }
    });
    await relisting;

    const fresh = await home.readdir('');
    expect(listing).toBe(fresh.toSorted().join(','));
    expect(listing.split(',')).not.toContain('x');
    if (mode === 'scoped') {
      expect(heard.sibling).toBe(0);
    }
  });
});

/*
 * Review m3: a rooted view reads through the one mount it captured, with no overlay of the mounts below it, so a route
 * changed below a connection's root changes nothing that connection can see, and its watches of ancestors hear nothing.
 */
describe('a connection rooted above a changed route', () => {
  it('should see no mount below its own root, before or after a route is added there', async () => {
    const { service } = await memoryAuthority();
    await service.configureProjectRoots({ projects: [route(x, 'dir-x')], roots: [] });
    const home = service.createRootedFileSystem('/');
    const before = await home.readdir('projects');

    await service.configureProjectRoots({ projects: [route(x, 'dir-x'), route(y, 'dir-y')], roots: [] });

    expect(before).toEqual([]);
    await expect(home.readdir('projects')).resolves.toEqual([]);
    await expect(home.exists(`projects/${y}`)).resolves.toBe(false);
    await expect(service.readdir('/projects')).resolves.toEqual(expect.arrayContaining([x, y]));
  });

  it("should not reset the root connection's chat-metadata watch when a project is created elsewhere", async () => {
    const { service } = await memoryAuthority();
    await service.configureProjectRoots({ projects: [route(x, 'dir-x')], roots: [] });
    const home = service.createRootedFileSystem('/');
    const chatMetadata = {
      paths: [''],
      recursive: true,
      includes: ['*', 'projects/*', 'projects/*/.tau', 'projects/*/.tau/chats', 'projects/*/.tau/chats/*'],
    };
    const sets: ChangeSet[] = [];
    const events: WatchEvent[] = [];
    home.watchChangeSets!(chatMetadata, (set) => sets.push(set));
    home.watch(chatMetadata, (event) => events.push(event));
    home.watch({ paths: ['projects'] }, (event) => events.push(event));

    await service.configureProjectRoots({ projects: [route(x, 'dir-x'), route(y, 'dir-y')], roots: [] });
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });

    expect(sets).toEqual([]);
    expect(events).toEqual([]);
  });
});

/* Review nit: an unrooted watch spells its paths as mount prefixes are spelled, `.` and `..` resolved. */
describe('an unrooted watch of a path with dot segments', () => {
  it('should be reset by a change of the route its path resolves to', async () => {
    const { service } = await memoryAuthority();
    await service.configureProjectRoots({ projects: [route(x, 'dir-x'), route(y, 'dir-y')], roots: [] });
    const events: WatchEvent[] = [];
    service.watch({ paths: [`/projects/${x}/../${y}`], recursive: true }, (event) => events.push(event));

    await service.configureProjectRoots({ projects: [route(x, 'dir-x'), route(y, 'dir-w')], roots: [] });

    expect(events).toEqual([{ type: 'reset' }]);
  });
});

/*
 * FW5 re-verification: a permanent delete whose removal fails leaves the directory on disk, so nothing may say it went.
 * The indexes that read or hold it re-read what is there, and every view that shows it hears it changed, not deleted.
 */
describe.each(['bound', 'unbound'] as const)('a permanent delete whose removal fails, %s copy', (kind) => {
  it('should publish no removal, keep or re-read the directory in every index, and list it again', async () => {
    const { service, rootProvider } = await createIdbWorkspaceFileService();
    services.push(service);
    await writeProject(rootProvider, 'x', x);
    await writeProject(rootProvider, 'y', y);
    const durable = (projectId: string, directory: string): ProjectRootConfig => ({
      projectId,
      backend: 'indexeddb',
      providerBasePath: directory,
    });
    await service.configureProjectRoots({
      projects: kind === 'bound' ? [durable(x, 'x'), durable(y, 'y')] : [durable(y, 'y')],
      roots: [{ backend: 'indexeddb' }],
    });
    const indexes = indexesOf(service);
    await indexes.ready('/');
    await indexes.ready('/x');
    const home = service.createRootedFileSystem('/');
    const sets: ChangeSet[] = [];
    const events: WatchEvent[] = [];
    home.watchChangeSets!({ paths: [''], recursive: true }, (set) => sets.push(set));
    home.watch({ paths: [''] }, (event) => events.push(event));
    const rmdir = rootProvider.rmdir.bind(rootProvider);
    vi.spyOn(rootProvider, 'rmdir').mockImplementation(async (path: string) => {
      if (path === 'x') {
        throw new Error('EBUSY: simulated');
      }
      return rmdir(path);
    });

    const outcome = await service
      .permanentlyDeleteProjectDirectory({ projectId: x, providerBasePath: 'x', scope: { backend: 'indexeddb' } })
      .then(
        (result) => result.status,
        () => 'threw',
      );
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });

    expect(outcome).not.toBe('deleted');
    await expect(rootProvider.exists('x')).resolves.toBe(true);
    expect(sets.flatMap((set) => set.entries).filter((entry) => entry.op === 'deleted' && entry.path === 'x')).toEqual(
      [],
    );
    expect(events).not.toContainEqual({ type: 'delete', path: 'x' });
    /* The Home connection hears the directory changed, so it lists it again. */
    expect(sets.some((set) => set.reset?.prefix === 'x')).toBe(true);
    const root = indexes.get('/');
    expect(root === undefined || root.entry('x') !== undefined).toBe(true);
    expect(indexes.get('/x')).toBeUndefined();
    const listed = await home.readdir('');
    expect(listed).toContain('x');
  });
});

/* FW5 re-verification minor: a closing existence check that throws rejects the delete with that error, so the
 * library keeps its classification (a lapsed folder permission stays workspace-unavailable), not a generic one. */
describe('a permanent delete whose closing existence check throws', () => {
  it("should reject with the check's own error", async () => {
    const { service, rootProvider } = await createIdbWorkspaceFileService();
    services.push(service);
    await writeProject(rootProvider, 'x', x);
    await service.configureProjectRoots({ projects: [], roots: [{ backend: 'indexeddb' }] });
    const lapsed = new Error('NotAllowedError: simulated lapsed permission');
    const exists = rootProvider.exists.bind(rootProvider);
    let removed = false;
    const rmdir = rootProvider.rmdir.bind(rootProvider);
    vi.spyOn(rootProvider, 'rmdir').mockImplementation(async (path: string) => {
      await rmdir(path);
      if (path === 'x') {
        removed = true;
      }
    });
    vi.spyOn(rootProvider, 'exists').mockImplementation(async (path: string) => {
      if (removed && path === 'x') {
        throw lapsed;
      }
      return exists(path);
    });

    await expect(
      service.permanentlyDeleteProjectDirectory({
        projectId: x,
        providerBasePath: 'x',
        scope: { backend: 'indexeddb' },
      }),
    ).rejects.toBe(lapsed);
  });
});

/* FW5 re-verification nit: a removed directory whose Home alias a deeper mount shadows is still published, as the
 * ingest publishes it: the Home connection, which reads it through its own mount, hears it go; an unrooted watch, which
 * sees the deeper mount there, does not. */
describe('a permanently deleted directory a deeper mount shadows', () => {
  it('should reach the connection of the mount that held it and no unrooted watch of the shadowing mount', async () => {
    const { service, rootProvider, mountMemory } = await createIdbWorkspaceFileService();
    services.push(service);
    await writeProject(rootProvider, 'p1', x);
    await service.configureProjectRoots({ projects: [], roots: [{ backend: 'indexeddb' }] });
    await mountMemory('/p1', 'memory:shadow');
    const home: ChangeSet[] = [];
    service.createRootedFileSystem('/').watchChangeSets!({ paths: [''], recursive: true }, (set) => home.push(set));
    const unrooted: WatchEvent[] = [];
    service.watch({ paths: ['/p1'], recursive: true }, (event) => unrooted.push(event));

    await expect(
      service.permanentlyDeleteProjectDirectory({
        projectId: x,
        providerBasePath: 'p1',
        scope: { backend: 'indexeddb' },
      }),
    ).resolves.toMatchObject({ status: 'deleted' });
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });

    expect(home.flatMap((set) => set.entries)).toContainEqual(expect.objectContaining({ op: 'deleted', path: 'p1' }));
    expect(unrooted).not.toContainEqual({ type: 'delete', path: '/p1' });
  });
});
