// oxlint-disable-next-line import/no-unassigned-import -- Side-effect import to polyfill IndexedDB for tests
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import type { FileSystemProvider } from '#types.js';
import { ChangeEventBus } from '#change-event-bus.js';
import { MemoryProvider } from '#backend/memory-provider.js';
import { MountTable } from '#mount-table.js';
import { ProviderRegistry } from '#provider-registry.js';
import { ResourceQueue } from '#resource-queue.js';
import { WorkspaceFileService } from '#workspace-file-service.js';
import { composeView } from '#composed-view.js';
import { tauPathPolicy } from '#path-registry.js';

/**
 * One conformance suite for the `FileSystemProvider` port (charter D1, D16).
 *
 * The three surfaces a Tau host composes — a storage provider, a rooted view
 * over a mounted project, and a composed view over that rooted view — are the
 * *same type*, so an operation written against the port must behave the same on
 * all three. Testing each layer only as itself is what let porcelain work on
 * one and not the others (review's Liskov row); this suite is the substitution
 * proof G4 asks for.
 *
 * Exactly one expectation is declared per layer rather than shared: the mask.
 * The raw provider and the rooted view are *below* it and see `.git/**`; the
 * composed view refuses it before any provider I/O (authority Rule 16). Every
 * other row — reads, writes, renames, directory removal and errno — is asserted
 * identically for all three.
 */

const projectId = 'proj_ccccccccccccccccccccc';
const projectRoute = `/projects/${projectId}`;

/** The same tree under every layer, seeded below the surface under test. */
const seeded = {
  'tau.json': '{}',
  'src/main.ts': 'export const part = 1;',
  'src/lib/helper.ts': 'export const helper = 2;',
  '.git/HEAD': 'ref: refs/heads/main',
} as const;

type Surface = {
  readonly port: FileSystemProvider;
  readonly dispose: () => void;
};

type Layer = {
  readonly name: string;
  /** Whether the control plane is refused at this layer. */
  readonly masksControlPlane: boolean;
  readonly open: () => Promise<Surface>;
};

const openServices: WorkspaceFileService[] = [];

/** A workspace authority with one mounted project, seeded through the authority. */
const seededProject = async (storageRootKey: string): Promise<WorkspaceFileService> => {
  const providerRegistry = new ProviderRegistry();
  const scope = { backend: 'memory', storageRootKey } as const;
  const provider = await providerRegistry.getProvider(scope);
  const mountTable = new MountTable();
  mountTable.mount('/', provider, { class: 'authored', ...scope });
  const service = new WorkspaceFileService({
    providerRegistry,
    resourceQueue: new ResourceQueue(),
    eventBus: new ChangeEventBus(),
    mountTable,
  });
  openServices.push(service);
  await service.configureProjectRoots({
    projects: [{ projectId, ...scope, providerBasePath: 'gear-system' }],
    roots: [],
  });
  for (const [path, content] of Object.entries(seeded)) {
    // oxlint-disable-next-line no-await-in-loop -- Deterministic seed order keeps the fixture readable.
    await service.writeFile(`${projectRoute}/${path}`, content);
  }
  return service;
};

const layers: readonly Layer[] = [
  {
    name: 'storage provider',
    masksControlPlane: false,
    open: async () => {
      const provider = new MemoryProvider();
      for (const [path, content] of Object.entries(seeded)) {
        // oxlint-disable-next-line no-await-in-loop -- Deterministic seed order keeps the fixture readable.
        await provider.writeFile(path, content);
      }
      return {
        port: provider,
        dispose: () => {
          provider.dispose();
        },
      };
    },
  },
  {
    name: 'rooted view',
    masksControlPlane: false,
    open: async () => {
      const service = await seededProject('memory:conformance-rooted');
      return { port: service.createRootedFileSystem(projectRoute), dispose: () => undefined };
    },
  },
  {
    name: 'composed user view',
    masksControlPlane: true,
    open: async () => {
      const service = await seededProject('memory:conformance-composed');
      return {
        port: composeView(
          { filesystem: service.createRootedFileSystem(projectRoute) },
          { consumer: 'user', policy: tauPathPolicy },
        ),
        dispose: () => undefined,
      };
    },
  },
];

afterEach(() => {
  for (const service of openServices.splice(0)) {
    service.dispose();
  }
});

describe.each(layers)('FileSystemProvider conformance: $name', ({ masksControlPlane, open }) => {
  it('should read a file as bytes and as UTF-8', async () => {
    const { port, dispose } = await open();

    await expect(port.readFile('src/main.ts', 'utf8')).resolves.toBe(seeded['src/main.ts']);
    await expect(port.readFile('src/main.ts')).resolves.toStrictEqual(new TextEncoder().encode(seeded['src/main.ts']));
    dispose();
  });

  it('should list a directory and stat its entries', async () => {
    const { port, dispose } = await open();

    const children = await port.readdir('src');
    expect(children.sort()).toStrictEqual(['lib', 'main.ts']);
    await expect(port.stat('src')).resolves.toMatchObject({ type: 'dir' });
    await expect(port.stat('src/main.ts')).resolves.toMatchObject({
      type: 'file',
      size: seeded['src/main.ts'].length,
    });
    await expect(port.lstat('src/main.ts')).resolves.toMatchObject({ type: 'file' });
    await expect(port.exists('src/main.ts')).resolves.toBe(true);
    await expect(port.exists('src/absent.ts')).resolves.toBe(false);
    dispose();
  });

  it('should answer ENOENT for a path that is not there', async () => {
    const { port, dispose } = await open();

    await expect(port.readFile('src/absent.ts')).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(port.stat('src/absent.ts')).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(port.readdir('absent')).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(port.unlink('src/absent.ts')).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(port.rmdir('absent')).rejects.toMatchObject({ code: 'ENOENT' });
    dispose();
  });

  it('should write a file, creating the directories above it', async () => {
    const { port, dispose } = await open();

    await port.writeFile('fresh/nested/file.ts', 'export const fresh = 1;');

    await expect(port.readFile('fresh/nested/file.ts', 'utf8')).resolves.toBe('export const fresh = 1;');
    await expect(port.stat('fresh/nested')).resolves.toMatchObject({ type: 'dir' });
    dispose();
  });

  it('should create a directory and refuse to create it twice', async () => {
    const { port, dispose } = await open();

    await port.mkdir('created');

    await expect(port.stat('created')).resolves.toMatchObject({ type: 'dir' });
    await expect(port.mkdir('created')).rejects.toMatchObject({ code: 'EEXIST' });
    await port.mkdir('created', { recursive: true });
    dispose();
  });

  it('should rename a file and refuse an occupied or absent operand', async () => {
    const { port, dispose } = await open();

    await port.rename('src/main.ts', 'src/renamed.ts');

    await expect(port.readFile('src/renamed.ts', 'utf8')).resolves.toBe(seeded['src/main.ts']);
    await expect(port.exists('src/main.ts')).resolves.toBe(false);
    await expect(port.rename('src/renamed.ts', 'tau.json')).rejects.toMatchObject({ code: 'EEXIST' });
    await expect(port.rename('src/absent.ts', 'src/other.ts')).rejects.toMatchObject({ code: 'ENOENT' });
    dispose();
  });

  it('should remove an empty directory and refuse a populated one', async () => {
    const { port, dispose } = await open();

    await expect(port.rmdir('src')).rejects.toMatchObject({ code: 'ENOTEMPTY' });

    await port.unlink('src/lib/helper.ts');
    await port.rmdir('src/lib');

    await expect(port.exists('src/lib')).resolves.toBe(false);
    dispose();
  });

  it('should refuse a path that is not canonical and root-relative', async () => {
    const { port, dispose } = await open();

    await expect(port.readFile('/src/main.ts')).rejects.toThrow();
    await expect(port.readFile('src/../src/main.ts')).rejects.toThrow();
    dispose();
  });

  it(
    masksControlPlane
      ? 'should refuse the control plane, because the mask is this layer'
      : 'should serve the control plane, because the mask is above this layer',
    async () => {
      const { port, dispose } = await open();

      if (masksControlPlane) {
        await expect(port.readFile('.git/HEAD')).rejects.toMatchObject({ code: 'EPERM' });
        await expect(port.exists('.git/HEAD')).resolves.toBe(false);
        expect(await port.readdir('')).not.toContain('.git');
      } else {
        await expect(port.readFile('.git/HEAD', 'utf8')).resolves.toBe(seeded['.git/HEAD']);
        await expect(port.exists('.git/HEAD')).resolves.toBe(true);
        expect(await port.readdir('')).toContain('.git');
      }
      dispose();
    },
  );
});
