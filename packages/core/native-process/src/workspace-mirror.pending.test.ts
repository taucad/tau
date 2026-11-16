// oxlint-disable-next-line import/no-unassigned-import -- Side-effect import to polyfill IndexedDB for the authority's index store.
import 'fake-indexeddb/auto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ChangeEventBus, MountTable, ProviderRegistry, ResourceQueue, WorkspaceFileService } from '@taucad/filesystem';
import type { PendingObjectSource } from '@taucad/filesystem';
import { joinRelativePath } from '@taucad/runtime/kernel';
import type { KernelFileSystem } from '@taucad/runtime/kernel';
import { createMockFileSystem } from '@taucad/runtime-testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createWorkspaceMirror } from '#workspace-mirror.js';

/*
 * A kernel that mirrors the whole workspace lists each file's size and then reads it. While a large object has not
 * reached the device its path holds the object's git-lfs pointer, and the revision layer, which wrote it, declares it
 * a placeholder. The authority's rooted view answers a declared file as the file it stands for (D9): the listing says
 * the object's size and the read waits for the object's bytes, by one mark, so the two agree. The mirror needs no gate
 * of its own: it completes with pending files present, holding their objects, never their pointers.
 */

const projectId = 'proj_mmmmmmmmmmmmmmmmmmmmm';
const route = `/projects/${projectId}`;
const encoder = new TextEncoder();
const part = encoder.encode('solid part\n'.repeat(64));
const oid = 'd'.repeat(64);
const pointer = encoder.encode(
  `version https://git-lfs.github.com/spec/v1\noid sha256:${oid}\nsize ${String(part.byteLength)}\n`,
);

let service: WorkspaceFileService;
const scope = { backend: 'memory', storageRootKey: 'memory:pending-mirror' } as const;

/* One authority over a registry's provider, as a page or a host process opens it: a reload is another over the same. */
const serviceOver = async (
  providerRegistry: ProviderRegistry,
  pendingStallMilliseconds?: number,
): Promise<WorkspaceFileService> => {
  const provider = await providerRegistry.getProvider(scope);
  const mountTable = new MountTable();
  mountTable.mount('/', provider, { class: 'authored', ...scope });
  const opened = new WorkspaceFileService({
    providerRegistry,
    resourceQueue: new ResourceQueue(),
    eventBus: new ChangeEventBus(),
    mountTable,
    ...(pendingStallMilliseconds === undefined ? {} : { pendingStallMilliseconds }),
  });
  await opened.configureProjectRoots({ projects: [{ projectId, ...scope, providerBasePath: 'mirror' }], roots: [] });
  return opened;
};

beforeEach(async () => {
  service = await serviceOver(new ProviderRegistry());
  await service.writeFile(`${route}/main.py`, 'import build123d\n');
  await service.writeFile(`${route}/models/part.step`, pointer);
});

afterEach(() => {
  service.dispose();
});

/* The kernel's filesystem over a rooted view, its listing a stat per entry as `createRuntimeFileSystem` lists. */
const kernelFileSystemOver = (view: ReturnType<WorkspaceFileService['createRootedFileSystem']>) => {
  const filesystem = createMockFileSystem();
  filesystem.mocks.readdirStat.mockImplementation(
    async (directory: string): ReturnType<KernelFileSystem['readdirStat']> => {
      const names = await view.readdir(directory);
      return Promise.all(
        names.map(async (name) => {
          const path = joinRelativePath(directory, name);
          return { ...(await view.stat(path)), name, path };
        }),
      );
    },
  );
  filesystem.mocks.readFile.mockImplementation(async (path: string) => view.readFile(path));
  return filesystem;
};

describe('a workspace mirror over pending large objects', () => {
  it('should mirror a pending file as its object, its read waiting for the bytes to arrive', async () => {
    let arrive: (bytes: Uint8Array<ArrayBuffer>) => void = () => undefined;
    const arrived = new Promise<Uint8Array<ArrayBuffer>>((resolve) => {
      arrive = resolve;
    });
    const asked: string[] = [];
    const source: PendingObjectSource = async (request) => {
      asked.push(request.path);
      return arrived;
    };
    service.setPendingObjectSource(source);
    const raw = service.createRootedFileSystem(route, undefined, { placeholders: 'raw' });
    await raw.declarePending!(
      new Map([['models/part.step', { object: { oid, size: part.byteLength }, pointerSize: pointer.byteLength }]]),
    );
    const filesystem = kernelFileSystemOver(service.createRootedFileSystem(route));
    const mirror = await createWorkspaceMirror({ temporaryPrefix: 'tau-pending-mirror-', displayName: 'Test' });
    try {
      const syncing = mirror.sync(filesystem);
      await expect.poll(() => asked).toStrictEqual(['models/part.step']);
      arrive(part);
      await expect(syncing).resolves.toStrictEqual(['main.py', 'models/part.step']);
      expect(new Uint8Array(await readFile(join(mirror.workspacePath, 'models/part.step')))).toStrictEqual(part);

      /* The object lands in the checkout: the next sync reads the file itself and keeps the same projection. */
      await raw.writeFile('models/part.step', part);
      await expect(mirror.sync(filesystem)).resolves.toStrictEqual(['main.py', 'models/part.step']);
      expect(new Uint8Array(await readFile(join(mirror.workspacePath, 'models/part.step')))).toStrictEqual(part);
      expect(asked).toStrictEqual(['models/part.step']);
    } finally {
      await mirror.cleanup();
    }
  });

  /* A pointer the revision layer never declared is a person's text: listed and read as the pointer it is. */
  it('should mirror an untracked pointer as the text it is', async () => {
    await service.writeFile(`${route}/fixtures/pointer.txt`, pointer);
    service.setPendingObjectSource(async (request) => (request.path.startsWith('fixtures/') ? undefined : part));
    const raw = service.createRootedFileSystem(route, undefined, { placeholders: 'raw' });
    await raw.declarePending!(
      new Map([['models/part.step', { object: { oid, size: part.byteLength }, pointerSize: pointer.byteLength }]]),
    );
    const filesystem = kernelFileSystemOver(service.createRootedFileSystem(route));
    const mirror = await createWorkspaceMirror({ temporaryPrefix: 'tau-untracked-mirror-', displayName: 'Test' });
    try {
      await expect(mirror.sync(filesystem)).resolves.toStrictEqual([
        'fixtures/pointer.txt',
        'main.py',
        'models/part.step',
      ]);
      expect(new Uint8Array(await readFile(join(mirror.workspacePath, 'fixtures/pointer.txt')))).toStrictEqual(pointer);
      expect(new Uint8Array(await readFile(join(mirror.workspacePath, 'models/part.step')))).toStrictEqual(part);
    } finally {
      await mirror.cleanup();
    }
  });
});

/*
 * A reload: the page or host opens the project again, and the kernel mirrors it before the revision layer has said a
 * word, and before the root's index is open. A file the size of a pointer is answered only once its marks are known:
 * from a snapshot the revision layer declared, at once, or from the revision layer's first word on the root it mounts.
 */
describe('a workspace mirror on a cold reload', () => {
  const placeholder = { object: { oid, size: part.byteLength }, pointerSize: pointer.byteLength };

  /* Reload the project and mirror it at once, the revision layer's view made first when `mounted`. */
  const mirrorReloaded = async (
    providerRegistry: ProviderRegistry,
    mounted: boolean,
  ): Promise<WorkspaceFileService> => {
    const reloaded = await serviceOver(providerRegistry);
    const asked: string[] = [];
    reloaded.setPendingObjectSource(async (request) => {
      asked.push(request.path);
      return part;
    });
    if (mounted) {
      reloaded.createRootedFileSystem(route, undefined, { placeholders: 'raw' });
    }
    const filesystem = kernelFileSystemOver(reloaded.createRootedFileSystem(route));
    const mirror = await createWorkspaceMirror({ temporaryPrefix: 'tau-reload-mirror-', displayName: 'Test' });
    try {
      await expect(mirror.sync(filesystem)).resolves.toStrictEqual([
        'main.py',
        'models/part.step',
        'notes/pointer.txt',
      ]);
      expect(new Uint8Array(await readFile(join(mirror.workspacePath, 'models/part.step')))).toStrictEqual(part);
      /* A pointer the revision layer never declared is the text it is, held for nothing. */
      expect(new Uint8Array(await readFile(join(mirror.workspacePath, 'notes/pointer.txt')))).toStrictEqual(pointer);
      expect(asked).toStrictEqual(['models/part.step']);
    } finally {
      await mirror.cleanup();
    }
    return reloaded;
  };

  /* A durable project the revision layer declared, its snapshot written with the marks and the declared stamp. */
  const declaredDurable = async () => {
    const providerRegistry = new ProviderRegistry();
    const provider = await providerRegistry.getProvider(scope);
    /* A durable provider whose mtime keys facts: the root keeps a snapshot of its index, marks and all. */
    Object.defineProperty(provider, 'capabilities', {
      value: { ...provider.capabilities, persistent: true, trustworthyMtime: true },
    });
    const before = await serviceOver(providerRegistry);
    await before.writeFile(`${route}/main.py`, 'import build123d\n');
    await before.writeFile(`${route}/models/part.step`, pointer);
    await before.writeFile(`${route}/notes/pointer.txt`, pointer);
    await before.createRootedFileSystem(route, undefined, { placeholders: 'raw' }).declarePending!(
      new Map([['models/part.step', placeholder]]),
    );
    await expect
      .poll(
        async () =>
          provider.readFile('mirror/.tau/index/snapshot.json').then(
            (bytes) => bytes.byteLength,
            () => 0,
          ),
        {
          timeout: 10_000,
        },
      )
      .toBeGreaterThan(0);
    return { providerRegistry, provider, before };
  };

  it('should mirror a placeholder as its object from the declared snapshot, holding nothing for the revision layer', async () => {
    const { providerRegistry, before } = await declaredDurable();
    const reloads: WorkspaceFileService[] = [];
    try {
      /* Before the revision layer mounts the root, and as it does: the snapshot it declared answers at once. */
      for (const mounted of [false, true]) {
        // oxlint-disable-next-line no-await-in-loop -- one reload after another, over the same provider.
        reloads.push(await mirrorReloaded(providerRegistry, mounted));
      }
    } finally {
      /* The registry's provider, which every reload shares, goes with the first to be disposed. */
      for (const reloaded of reloads) {
        reloaded.dispose();
      }
      before.dispose();
    }
  }, 20_000);

  /*
   * The stamp is trusted only while the reload's compare finds no pointer-sized file changed: a pointer written while
   * the project was closed, or after the marks were last stored, is not answered as text until the revision layer
   * declares the root again (I7).
   */
  it('should refuse to mirror a pointer written since the declared snapshot, never consuming its text', async () => {
    const { providerRegistry, provider, before } = await declaredDurable();
    const other = encoder.encode(new TextDecoder().decode(pointer).replace(oid, 'e'.repeat(64)));
    await provider.writeFile('mirror/models/added.step', other);
    const reloaded = await serviceOver(providerRegistry, 50);
    reloaded.setPendingObjectSource(async () => part);
    const filesystem = kernelFileSystemOver(reloaded.createRootedFileSystem(route));
    const mirror = await createWorkspaceMirror({ temporaryPrefix: 'tau-added-mirror-', displayName: 'Test' });
    try {
      await expect(mirror.sync(filesystem)).rejects.toMatchObject({ code: 'PENDING' });
      await expect(readFile(join(mirror.workspacePath, 'models/added.step'))).rejects.toMatchObject({ code: 'ENOENT' });
      /* The revision layer's next capture declares the root: the new pointer is a placeholder, and mirrors as one. */
      await reloaded.createRootedFileSystem(route, undefined, { placeholders: 'raw' }).declarePending!(
        new Map([
          ['models/part.step', placeholder],
          [
            'models/added.step',
            { object: { oid: 'e'.repeat(64), size: part.byteLength }, pointerSize: other.byteLength },
          ],
        ]),
      );
      await expect(mirror.sync(filesystem)).resolves.toStrictEqual([
        'main.py',
        'models/added.step',
        'models/part.step',
        'notes/pointer.txt',
      ]);
      expect(new Uint8Array(await readFile(join(mirror.workspacePath, 'models/added.step')))).toStrictEqual(part);
    } finally {
      await mirror.cleanup();
      reloaded.dispose();
      before.dispose();
    }
  }, 20_000);

  it('should mirror a placeholder as its object when the revision layer mounts the root before it declares it', async () => {
    service.setPendingObjectSource(async () => part);
    const raw = service.createRootedFileSystem(route, undefined, { placeholders: 'raw' });
    const filesystem = kernelFileSystemOver(service.createRootedFileSystem(route));
    const mirror = await createWorkspaceMirror({ temporaryPrefix: 'tau-mounted-mirror-', displayName: 'Test' });
    try {
      const syncing = mirror.sync(filesystem);
      /* The revision layer's first capture: it declares the root a moment later. */
      await new Promise((resolve) => {
        setTimeout(resolve, 20);
      });
      await raw.declarePending!(new Map([['models/part.step', placeholder]]));
      await expect(syncing).resolves.toStrictEqual(['main.py', 'models/part.step']);
      expect(new Uint8Array(await readFile(join(mirror.workspacePath, 'models/part.step')))).toStrictEqual(part);
    } finally {
      await mirror.cleanup();
    }
  });
});
