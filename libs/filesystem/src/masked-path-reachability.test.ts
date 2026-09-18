// oxlint-disable-next-line import/no-unassigned-import -- Side-effect import to polyfill IndexedDB for tests
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { WorkspaceFileService } from '#workspace-file-service.js';
import { ProviderRegistry } from '#provider-registry.js';
import { ResourceQueue } from '#resource-queue.js';
import { ChangeEventBus } from '#change-event-bus.js';
import { MountTable } from '#mount-table.js';
import { composeView } from '#composed-view.js';
import type { ComposedView } from '#composed-view.js';
import { contents } from '#content-ops/contents.js';
import { withReadContentOps } from '#content-ops/read-ops.js';
import { classify, tauPathPolicy } from '#path-registry.js';
import { serveNodeFsProvider } from '#backend/node/host.js';

/**
 * Reachability pins for the filesystem north star (W0).
 *
 * Authority policy Rule 16 says control-plane bytes are absent from every
 * composed view and refused before provider I/O. The authority-global content
 * methods that `apps/libs/fs-client` proxies for UI consumers — `searchFiles`,
 * `getDirectoryStat`, `copyDirectory` — walk the raw
 * provider instead, so each one hands a consumer the paths the registry marks
 * `agentAccess: 'hidden'`.
 *
 * A case still marked `it.fails` is a bypass a consumer can still reach, kept
 * that way so the suite stays green for the other lanes until the work package
 * named above it flips it to a plain `it` — which it does by asserting through
 * the surface that consumer now reaches, not by filtering the old one.
 */

const projectId = 'proj_mmmmmmmmmmmmmmmmmmmmm';
const projectRoute = `/projects/${projectId}`;
const duplicateId = 'proj_nnnnnnnnnnnnnnnnnnnnn';
const duplicateRoute = `/projects/${duplicateId}`;

/**
 * One seed per registry answer that matters: two hidden rows, one records row,
 * two authored rows. The revision store lives under `.git` on every host (git
 * storage substrate D29), so `.git/**` alone stands for the control plane.
 */
const seeded = {
  '.git/HEAD': 'ref: refs/heads/main',
  '.git/objects/x': 'object-bytes',
  '.tau/chats/c1.json': '{"messages":[]}',
  'tau.json': '{}',
  'src/main.ts': 'export const part = 1;',
} as const;

/** The seeded paths the path registry hides from consumers; the pins assert none of these escape. */
const hiddenPaths = Object.keys(seeded).filter((path) => classify(path).agentAccess === 'hidden');

/** Whichever of `paths` the registry hides — the assertion subject of every pin. */
const hiddenAmong = (paths: readonly string[]): string[] =>
  paths.filter((path) => classify(path).agentAccess === 'hidden').sort();

const activeServices: WorkspaceFileService[] = [];

async function createService(): Promise<WorkspaceFileService> {
  const providerRegistry = new ProviderRegistry();
  const provider = await providerRegistry.getProvider({ backend: 'memory', storageRootKey: 'memory:masked-pins' });

  const mountTable = new MountTable();
  mountTable.mount('/', provider, { class: 'authored', backend: 'memory', storageRootKey: 'memory:masked-pins' });

  const service = new WorkspaceFileService({
    providerRegistry,
    resourceQueue: new ResourceQueue(),
    eventBus: new ChangeEventBus(),
    mountTable,
  });
  activeServices.push(service);
  return service;
}

afterEach(() => {
  for (const service of activeServices.splice(0)) {
    service.dispose();
  }
});

describe('masked path reachability through the authority-global surface', () => {
  let service: WorkspaceFileService;

  /** The project as a consumer reaches it: one rooted view, composed as every host composes it. */
  const projectView = (consumer: 'user' | 'agent' = 'user'): ComposedView =>
    composeView({ filesystem: service.createRootedFileSystem(projectRoute) }, { consumer, policy: tauPathPolicy });

  /**
   * Every byte that is really on the provider under `authorityRoot`, read through
   * the *unmasked* rooted surface trusted composition holds. The pins below use
   * it as their observation deliberately: a masked read could hide a control-plane
   * byte a copy had truly written.
   */
  const physically = async (
    authorityRoot: string,
    subdirectory = '',
  ): Promise<Record<string, Uint8Array<ArrayBuffer>>> =>
    contents(service.createRootedFileSystem(authorityRoot), subdirectory);

  beforeEach(async () => {
    service = await createService();
    await service.configureProjectRoots({
      projects: [
        { projectId, backend: 'memory', storageRootKey: 'memory:masked-pins', providerBasePath: 'gear-system' },
        { projectId: duplicateId, backend: 'memory', storageRootKey: 'memory:masked-pins', providerBasePath: 'copy' },
      ],
      roots: [],
    });
    for (const [path, content] of Object.entries(seeded)) {
      // oxlint-disable-next-line no-await-in-loop -- Deterministic seed order keeps the fixture readable.
      await service.writeFile(`${projectRoute}/${path}`, content);
    }
  });

  it('should seed both control-plane rows the pins below look for', () => {
    expect(hiddenPaths).toEqual(['.git/HEAD', '.git/objects/x']);
  });

  /* Flipped by W4: the search a consumer reaches is `search` on the rooted
   * surface, over that root's own index, and the view's policy refuses a hidden
   * subtree before the descent rather than filtering rows afterwards. */
  it('should not return control-plane entries from a project search', async () => {
    const view = projectView();

    const matches = await Promise.all(['HEAD', 'objects', 'main'].map(async (query) => view.search!(query)));

    const found = matches.flat().map((entry) => entry.path);
    expect(hiddenAmong(found)).toEqual([]);
    /* And the project's own file is still found, so an empty search cannot pass. */
    expect(found).toContain('src/main.ts');
  });

  /* Flipped by W4: the recursive stat a consumer reaches is `statTree` over the
   * same index, masked by the same policy. */
  it('should not return control-plane entries from a recursive project stat', async () => {
    const entries = await projectView().statTree!('');

    expect(hiddenAmong(entries.map((entry) => entry.path))).toEqual([]);
    expect(entries.map((entry) => entry.path)).toContain('src/main.ts');
  });

  /* Flipped by W3: a consumer asks the rooted surface, which reads the subtree
   * through its composed view, so the control plane is never enumerated. */
  it('should not return control-plane bytes from project directory contents', async () => {
    const read = Object.keys(await contents(projectView(), ''));

    expect(hiddenAmong(read)).toEqual([]);
    /* And the project's own bytes are still there, so an empty walk cannot pass. */
    expect(read).toContain('src/main.ts');
  });

  /*
   * W5 gave the rooted surface a mask-checked `copyTree` (the two pins below);
   * this row is the *authority* method the Files pane still reaches through
   * `client.copyDirectory`, and W12 closes that last bypass by routing the
   * gesture to the view.
   */
  it.fails('should not copy control-plane bytes into a duplicated project', async () => {
    await service.copyDirectory(projectRoute, duplicateRoute);

    // Reading the copy through the same unmasked surface is deliberate: it
    // proves the bytes were physically written, not merely rendered.
    const copied = await physically(duplicateRoute);

    expect(hiddenAmong(Object.keys(copied))).toEqual([]);
  });

  it('should not copy control-plane bytes through the rooted surface a consumer reaches', async () => {
    await projectView().copyTree!('', 'backup');

    const copied = Object.keys(await physically(projectRoute, 'backup'));

    expect(hiddenAmong(copied)).toEqual([]);
    /* And the project's own bytes did arrive, so an empty copy cannot pass. */
    expect(copied).toContain('src/main.ts');
  });

  it('should not let a copy land control-plane bytes where they become the control plane', async () => {
    /* `src/.git/HEAD` is authored where it sits, but copied to the project
     * root it would be `.git/HEAD` — a destination the mask refuses. */
    await service.writeFile(`${projectRoute}/src/.git/HEAD`, 'authored where it sits');
    await service.writeFile(`${projectRoute}/src/.tau/chats/c2.json`, '{}');

    await projectView().copyTree!('src', '');

    /* The project's own control plane is untouched, and the copy did land. */
    await expect(service.readFile(`${projectRoute}/.git/HEAD`, 'utf8')).resolves.toBe(seeded['.git/HEAD']);
    await expect(service.exists(`${projectRoute}/main.ts`)).resolves.toBe(true);
  });

  it('should not let an agent copy records into a records path', async () => {
    await service.writeFile(`${projectRoute}/src/.tau/chats/c2.json`, '{}');

    await projectView('agent').copyTree!('src', '');

    const copied = Object.keys(await physically(projectRoute));

    expect(copied).not.toContain('.tau/chats/c2.json');
    expect(copied).toContain('main.ts');
  });

  it('should classify a mid-tree copy against the project root, not the copy root', async () => {
    /* `src/.git/HEAD` is an ordinary authored file: only `.git` directly under
     * the project is the control plane. A filter that forgot to join the copy
     * root would drop this row. */
    await service.writeFile(`${projectRoute}/src/.git/HEAD`, 'not the control plane');

    await projectView().copyTree!('src', 'src-copy');

    const copied = Object.keys(await physically(projectRoute, 'src-copy'));

    expect(copied).toContain('.git/HEAD');
    expect(copied).toContain('main.ts');
  });
});

/**
 * What a duplicated project is allowed to carry (charter D11, ZIP follow-up F-2).
 *
 * Duplication journals the source project's *authored file snapshot* (authority
 * Rule 12) and reads it the way the file manager does: through that project's
 * own rooted `user` view, wrapped by `withReadContentOps`, asking for
 * `versionedOnly`. Two different rules do the work and the pin needs both — the
 * view refuses `.git/**` before any provider I/O because it is the control
 * plane, and `versionedOnly` drops `.tau/chats/**` and `thumbnail.webp` because
 * the registry says they are records, which the mask would happily hand a
 * `user`. Disk-backed so the seed is a real directory, as every duplicable
 * project is.
 */
describe('what project duplication reads from a disk-backed project', () => {
  const diskProjectId = 'proj_ddddddddddddddddddddd';
  const physicalDirectory = 'gear-system';
  const diskCleanups: Array<() => void> = [];

  afterEach(() => {
    for (const cleanup of diskCleanups.splice(0).reverse()) {
      cleanup();
    }
  });

  const seedDiskProject = async (): Promise<WorkspaceFileService> => {
    const root = mkdtempSync(join(tmpdir(), 'tau-duplicate-source-'));
    const write = (relativePath: string, body: string): void => {
      const absolute = join(root, physicalDirectory, relativePath);
      mkdirSync(dirname(absolute), { recursive: true });
      writeFileSync(absolute, body);
    };
    write(
      'tau.json',
      JSON.stringify({ $schema: 'https://tau.new/schemas/project.json', id: diskProjectId, name: 'Gear' }),
    );
    write('src/main.ts', 'export const part = 1;');
    write('.git/HEAD', 'ref: refs/heads/main');
    write('.git/objects/x', 'object-bytes');
    write('.tau/chats/c1.json', '{"messages":[]}');
    write('thumbnail.webp', 'webp-bytes');

    const { port1, port2 } = new MessageChannel();
    const stopHost = serveNodeFsProvider(port2, { allowRoot: (candidate) => candidate === root });
    const providerRegistry = new ProviderRegistry({ createNodeFsPort: async () => port1 });
    const service = new WorkspaceFileService({
      providerRegistry,
      resourceQueue: new ResourceQueue(),
      eventBus: new ChangeEventBus(),
      mountTable: new MountTable(),
    });
    diskCleanups.push(() => {
      service.dispose();
      void stopHost();
      port2.close();
      rmSync(root, { recursive: true, force: true });
    });
    await service.configureProjectRoots({
      projects: [{ backend: 'node', path: root, projectId: diskProjectId, providerBasePath: physicalDirectory }],
      roots: [{ backend: 'node', path: root }],
    });
    return service;
  };

  it('hands the journal the project and nothing else that lives beside it', async () => {
    const service = await seedDiskProject();
    const filesystem = service.createRootedFileSystem(`/projects/${diskProjectId}`);
    const view = withReadContentOps(
      composeView({ filesystem }, { consumer: 'user', policy: tauPathPolicy }),
      tauPathPolicy,
    );

    const read = Object.keys(await view.contents('', { versionedOnly: true })).sort();

    expect(read).toEqual(['src/main.ts', 'tau.json']);
  });

  it('would carry every one of them without the view and the filter', async () => {
    /* The raw walk this replaced: the same directory, no mask and no filter.
     * Without this row the pin above could pass on an empty read. */
    const service = await seedDiskProject();

    const raw = Object.keys(await contents(service.createRootedFileSystem(`/projects/${diskProjectId}`), '')).sort();

    expect(raw).toEqual([
      '.git/HEAD',
      '.git/objects/x',
      '.tau/chats/c1.json',
      'src/main.ts',
      'tau.json',
      'thumbnail.webp',
    ]);
  });
});
