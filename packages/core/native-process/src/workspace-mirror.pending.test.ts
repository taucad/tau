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

beforeEach(async () => {
  const providerRegistry = new ProviderRegistry();
  const scope = { backend: 'memory', storageRootKey: 'memory:pending-mirror' } as const;
  const provider = await providerRegistry.getProvider(scope);
  const mountTable = new MountTable();
  mountTable.mount('/', provider, { class: 'authored', ...scope });
  service = new WorkspaceFileService({
    providerRegistry,
    resourceQueue: new ResourceQueue(),
    eventBus: new ChangeEventBus(),
    mountTable,
  });
  await service.configureProjectRoots({ projects: [{ projectId, ...scope, providerBasePath: 'mirror' }], roots: [] });
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
