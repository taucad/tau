// oxlint-disable-next-line import/no-unassigned-import -- Side-effect import to polyfill IndexedDB for tests
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WorkspaceFileService } from '#workspace-file-service.js';
import { ProviderRegistry } from '#provider-registry.js';
import { ResourceQueue } from '#resource-queue.js';
import { ChangeEventBus } from '#change-event-bus.js';
import { MountTable } from '#mount-table.js';
import { composeView } from '#composed-view.js';
import { contents } from '#content-ops/contents.js';
import { classify, tauPathPolicy } from '#path-registry.js';

/**
 * Reachability pins for the filesystem north star (W0).
 *
 * Authority policy Rule 16 says control-plane bytes are absent from every
 * composed view and refused before provider I/O. The authority-global content
 * methods that `apps/libs/fs-client` proxies for UI consumers — `searchFiles`,
 * `getDirectoryStat`, `getDirectoryContents`, `copyDirectory` — walk the raw
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

/** One seed per registry answer that matters: two hidden rows, one records row, two authored rows. */
const seeded = {
  '.git/HEAD': 'ref: refs/heads/main',
  '.git/objects/x': 'object-bytes',
  '.tau/revisions/r1.json': '{"revisionId":"rev_1"}',
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
    expect(hiddenPaths).toEqual(['.git/HEAD', '.git/objects/x', '.tau/revisions/r1.json']);
  });

  // W4 (per-root TreeIndex, masked on output) flips this to `it`.
  it.fails('should not return control-plane entries from a project search', async () => {
    const matches = await Promise.all(
      ['HEAD', 'r1', 'objects', 'main'].map(async (query) => service.searchFiles(projectRoute, query)),
    );

    expect(hiddenAmong(matches.flat().map((entry) => entry.path))).toEqual([]);
  });

  // W4 (per-root TreeIndex, masked on output) flips this to `it`.
  it.fails('should not return control-plane entries from a recursive project stat', async () => {
    const entries = await service.getDirectoryStat(projectRoute);

    expect(hiddenAmong(entries.map((entry) => entry.path))).toEqual([]);
  });

  /* Flipped by W3: a consumer asks the rooted surface, which reads the subtree
   * through its composed view, so the control plane is never enumerated. */
  it('should not return control-plane bytes from project directory contents', async () => {
    const view = composeView(
      { filesystem: service.createRootedFileSystem(projectRoute) },
      { consumer: 'user', policy: tauPathPolicy },
    );

    const read = Object.keys(await contents(view, ''));

    expect(hiddenAmong(read)).toEqual([]);
    /* And the project's own bytes are still there, so an empty walk cannot pass. */
    expect(read).toContain('src/main.ts');
  });

  // W5 (mask-checked copyTree on the rooted surface) flips this to `it`.
  it.fails('should not copy control-plane bytes into a duplicated project', async () => {
    await service.copyDirectory(projectRoute, duplicateRoute);

    // Reading the copy through the same unmasked surface is deliberate: it
    // proves the bytes were physically written, not merely rendered.
    const copied = await service.getDirectoryContents(duplicateRoute);

    expect(hiddenAmong(Object.keys(copied))).toEqual([]);
  });
});
