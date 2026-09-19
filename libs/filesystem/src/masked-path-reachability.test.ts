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
 * methods that `apps/libs/fs-client` proxied for UI consumers — `searchFiles`,
 * `getDirectoryStat`, `copyDirectory`, `duplicateFile` — walked the raw provider
 * instead, so each one handed a consumer the paths the registry marks
 * `agentAccess: 'hidden'`.
 *
 * All four are gone as of W12(d): every pin below asserts through the surface a
 * consumer now reaches — the rooted one, where the view supplies the mask — and
 * the first row pins the absence of the old ones. No case is `it.fails` any
 * more; a row that starts failing is a reachability regression, not a pending
 * work package.
 */

const projectId = 'proj_mmmmmmmmmmmmmmmmmmmmm';
const projectRoute = `/projects/${projectId}`;
/* A second configured project, so the fixture still has a cross-root target the
 * authority could have copied into — and no method left that would. */
const duplicateId = 'proj_nnnnnnnnnnnnnnnnnnnnn';

/**
 * One seed per registry answer that matters: three hidden rows, one records row,
 * two authored rows. The revision store lives under `.git` on every host (git
 * storage substrate D29), so `.git/**` alone stands for the control plane — and
 * a vendored repository's `src/.git/**` stands for the nested one, which the
 * registry hides at any depth (EQ1, CI1). Every pin below reads the hidden set
 * from `classify`, so the nested row is covered by all of them.
 */
const seeded = {
  '.git/HEAD': 'ref: refs/heads/main',
  '.git/objects/x': 'object-bytes',
  'src/.git/config': '[remote "origin"]',
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

  it('should seed every control-plane row the pins below look for', () => {
    expect(hiddenPaths).toEqual(['.git/HEAD', '.git/objects/x', 'src/.git/config']);
  });

  /* CI1: a repository nested in the design is the control plane too, for every
   * consumer and in both directions — the gesture is refused before provider I/O
   * whether the path is the operand, the destination or the source. */
  it.each(['user', 'agent'] as const)(
    'should refuse every gesture into a nested control plane for a %s view',
    async (consumer) => {
      const nested = 'src/.git/config';
      const view = projectView(consumer);

      await expect(view.readFile(nested)).rejects.toMatchObject({ code: 'EPERM' });
      await expect(view.writeFile(nested, 'forged')).rejects.toMatchObject({ code: 'EPERM' });
      await expect(view.mkdir('src/.git/hooks')).rejects.toMatchObject({ code: 'EPERM' });
      await expect(view.copyTree!('src/.git', 'stolen')).rejects.toMatchObject({ code: 'EPERM' });
      await expect(view.copyTree!('', 'src/.git/backup')).rejects.toMatchObject({ code: 'EPERM' });
      await expect(view.move!('src/main.ts', 'src/.git/main.ts')).rejects.toMatchObject({ code: 'EPERM' });
      await expect(view.move!(nested, 'config')).rejects.toMatchObject({ code: 'EPERM' });
      expect(await view.exists(nested)).toBe(false);
      expect(await view.readdir('src')).not.toContain('.git');
      const indexed = await view.statTree!('');
      expect(indexed.map((entry) => entry.path)).not.toContain(nested);
      const found = await view.search!('config');
      expect(found.map((entry) => entry.path)).not.toContain(nested);

      await view.copyTree!('', `backup-${consumer}`);
      expect(Object.keys(await physically(projectRoute, `backup-${consumer}`))).not.toContain(nested);
    },
  );

  /* Flipped by W4: the search a consumer reaches is `search` on the rooted
   * surface, over that root's own index, and the view's policy refuses a hidden
   * subtree before the descent rather than filtering rows afterwards. */
  it('should not return control-plane entries from a project search', async () => {
    const view = projectView();

    const matches = await Promise.all(['HEAD', 'objects', 'config', 'main'].map(async (query) => view.search!(query)));

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
   * Flipped by W12(d). The bypass this row recorded was the *authority* method,
   * and it is gone with its last consumer: `copyDirectory`, `duplicateFile`,
   * `searchFiles` and `getDirectoryStat` are no longer on the surface at all, so
   * there is no unmasked walk, copy or index of a project tree for a consumer to
   * reach. The gestures a consumer does reach are the three rows below and, for
   * a duplicated project, the versioned-only read through the project's own view
   * (the second `describe`).
   *
   * Asserted by absence rather than by outcome, which is the only honest form: a
   * method that does not exist cannot be called with a control-plane path.
   */
  it('should offer no unmasked copy, walk or index of a project tree', () => {
    const surface = service as unknown as Record<string, unknown>;

    for (const bypass of ['copyDirectory', 'duplicateFile', 'searchFiles', 'getDirectoryStat']) {
      expect(surface[bypass], bypass).toBeUndefined();
    }
    /* And the rooted surface a consumer reaches does serve them, so this cannot
     * pass by the operations having been dropped altogether. */
    const rooted = service.createRootedFileSystem(projectRoute);
    expect(typeof rooted.copyTree).toBe('function');
    expect(typeof rooted.duplicate).toBe('function');
    expect(typeof rooted.search).toBe('function');
    expect(typeof rooted.statTree).toBe('function');
  });

  it('should not copy control-plane bytes through the rooted surface a consumer reaches', async () => {
    await projectView().copyTree!('', 'backup');

    const copied = Object.keys(await physically(projectRoute, 'backup'));

    expect(hiddenAmong(copied)).toEqual([]);
    /* And the project's own bytes did arrive, so an empty copy cannot pass. */
    expect(copied).toContain('src/main.ts');
  });

  /* A copy's destination is classified too: `src/.tau/chats` is authored where it
   * sits — the records rows are Tau's at the project root only — but copied to
   * the project root it would be the records family, which is not the agent's to
   * write. The project's own control plane survives the same copy. */
  it('should not let an agent copy records into a records path', async () => {
    await service.writeFile(`${projectRoute}/src/.tau/chats/c2.json`, '{}');

    await projectView('agent').copyTree!('src', '');

    const copied = Object.keys(await physically(projectRoute));

    expect(copied).not.toContain('.tau/chats/c2.json');
    expect(copied).toContain('main.ts');
    await expect(service.readFile(`${projectRoute}/.git/HEAD`, 'utf8')).resolves.toBe(seeded['.git/HEAD']);
  });

  it('should classify a mid-tree copy against the project root, not the copy root', async () => {
    /* `src/exports/model.step` is an ordinary authored file: only `exports`
     * directly under the project is the records family. A filter that forgot to
     * join the copy root would drop this row. */
    await service.writeFile(`${projectRoute}/src/exports/model.step`, 'not a record');

    await projectView().copyTree!('src', 'src-copy');

    const copied = Object.keys(await physically(projectRoute, 'src-copy'));

    expect(copied).toContain('exports/model.step');
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
