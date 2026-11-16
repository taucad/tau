// oxlint-disable-next-line import/no-unassigned-import -- Side-effect import to polyfill IndexedDB for tests
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChangeEventBus } from '#change-event-bus.js';
import { composeView } from '#composed-view.js';
import { withReadContentOps } from '#content-ops/read-ops.js';
import { MountTable } from '#mount-table.js';
import { tauPathPolicy } from '#path-registry.js';
import { PendingContentError, pendingObjectOf } from '#pending-content.js';
import { ProjectIndex } from '#project-index/project-index.js';
import { ProjectIndexes } from '#project-index/project-indexes.js';
import type { PendingObjectSource } from '#pending-content.js';
import { ProviderRegistry } from '#provider-registry.js';
import { ResourceQueue } from '#resource-queue.js';
import { WorkspaceFileService } from '#workspace-file-service.js';
import type { DirectoryStatRow, FileSystemProvider } from '#types.js';
import type { ChangeSet } from '#change-event-bus.js';
import type { FileStatEntry } from '@taucad/types';

/*
 * Pending entries (D9, W4 slice a): a checkout path whose bytes are a large
 * object not yet on the device holds its git-lfs pointer. Every view but the
 * revision layer's raw one reads it through to the object, fetched on demand
 * and bounded (I10), or refuses with PENDING: no consumer below the revision
 * layer ever sees pointer text.
 */

const projectId = 'proj_ppppppppppppppppppppp';
const route = `/projects/${projectId}`;
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const part = encoder.encode('solid part\n');
const oid = 'c'.repeat(64);
const pointer = encoder.encode(
  `version https://git-lfs.github.com/spec/v1\noid sha256:${oid}\nsize ${String(part.byteLength)}\n`,
);

let service: WorkspaceFileService;
/* The memory provider under the project, for a test that makes one of its calls fail. */
let memory: FileSystemProvider;

/* A project whose `models/part.step` is a placeholder the revision layer declared, unless `declared` is false. */
const createService = async (
  pendingStallMilliseconds?: number,
  options?: Readonly<{ declared?: boolean; providerRegistry?: ProviderRegistry; durable?: boolean; reload?: boolean }>,
): Promise<WorkspaceFileService> => {
  const providerRegistry = options?.providerRegistry ?? new ProviderRegistry();
  const scope = { backend: 'memory', storageRootKey: 'memory:pending-content' } as const;
  const provider = await providerRegistry.getProvider(scope);
  if (options?.durable === true && !provider.capabilities.persistent) {
    /* A durable provider whose mtime keys facts: the root keeps a snapshot of its index, marks and all. */
    Object.defineProperty(provider, 'capabilities', {
      value: { ...provider.capabilities, persistent: true, trustworthyMtime: true },
    });
  }
  memory = provider;
  const mountTable = new MountTable();
  mountTable.mount('/', provider, { class: 'authored', ...scope });
  const created = new WorkspaceFileService({
    providerRegistry,
    resourceQueue: new ResourceQueue(),
    eventBus: new ChangeEventBus(),
    mountTable,
    ...(pendingStallMilliseconds === undefined ? {} : { pendingStallMilliseconds }),
  });
  await created.configureProjectRoots({ projects: [{ projectId, ...scope, providerBasePath: 'gear' }], roots: [] });
  if (options?.reload === true) {
    /* A reload: the project is on the provider already. */
    return created;
  }
  await created.writeFile(`${route}/main.scad`, 'import("models/part.step");');
  await created.writeFile(`${route}/models/part.step`, pointer);
  if (options?.declared !== false) {
    await declarePart(created);
  }
  return created;
};

/* What the revision layer, the placeholders' only writer, declares of the checkout. */
async function declarePart(on: WorkspaceFileService): Promise<void> {
  const placeholder = { object: { oid, size: part.byteLength }, pointerSize: pointer.byteLength };
  await on.createRootedFileSystem(route, undefined, { placeholders: 'raw' }).declarePending!(
    new Map([['models/part.step', placeholder]]),
  );
}

beforeEach(async () => {
  service = await createService();
});

afterEach(() => {
  service.dispose();
});

describe('pending entries (D9)', () => {
  it('should parse a git-lfs pointer, and nothing else', () => {
    expect(pendingObjectOf(pointer)).toStrictEqual({ oid, size: part.byteLength });
    expect(pendingObjectOf(part)).toBeUndefined();
    expect(pendingObjectOf(encoder.encode('version https://git-lfs.github.com/spec/v1 is a spec'))).toBeUndefined();
  });

  it('should read a pending entry through to its object on every view but the raw one', async () => {
    const source = vi.fn<PendingObjectSource>(async () => part);
    service.setPendingObjectSource(source);
    const view = service.createRootedFileSystem(route);
    expect(await view.readFile('models/part.step')).toStrictEqual(part);
    expect(await view.readFile('models/part.step', 'utf8')).toBe('solid part\n');
    expect(await view.readFile('main.scad', 'utf8')).toBe('import("models/part.step");');
    expect(source).toHaveBeenCalledWith(
      {
        authorityPath: `${route}/models/part.step`,
        root: route,
        path: 'models/part.step',
        object: { oid, size: part.byteLength },
      },
      expect.any(AbortSignal),
      expect.any(Function),
    );
    const streamed = await new Response(view.readFileStream!('models/part.step')).arrayBuffer();
    expect(new Uint8Array(streamed)).toStrictEqual(part);
    source.mockClear();
    expect(await service.readFile(`${route}/models/part.step`)).toStrictEqual(part);
    /* The service's own read asks by mount too, so a host routes it as it routes a view's. */
    expect(source).toHaveBeenCalledWith(
      expect.objectContaining({ root: route, path: 'models/part.step' }),
      expect.any(AbortSignal),
      expect.any(Function),
    );
    /* So does the service's stream. */
    const serviceStreamed = await new Response(await service.readFileStream(`${route}/models/part.step`)).arrayBuffer();
    expect(new Uint8Array(serviceStreamed)).toStrictEqual(part);
    /* The revision layer owns the pointers and reads them as they are. */
    const raw = service.createRootedFileSystem(route, undefined, { placeholders: 'raw' });
    expect(await raw.readFile('models/part.step')).toStrictEqual(pointer);
  });

  it('should serve contents and archive the object, never the pointer', async () => {
    service.setPendingObjectSource(async () => part);
    const view = withReadContentOps(
      composeView({ filesystem: service.createRootedFileSystem(route) }, { consumer: 'user', policy: tauPathPolicy }),
      tauPathPolicy,
    );
    const files = await view.contents('', { versionedOnly: true });
    expect(files['models/part.step']).toStrictEqual(part);
    const { default: jszip } = await import('jszip');
    const archived = await view.archive('');
    const zip = await jszip.loadAsync(await archived.arrayBuffer());
    expect(await zip.file('models/part.step')?.async('uint8array')).toStrictEqual(part);
  });

  it('should refuse with PENDING when no object can be had within the stall bound, and never answer the pointer', async () => {
    await declarePart(service);
    const view = service.createRootedFileSystem(route);
    /* No source: nothing can fetch it. */
    await expect(view.readFile('models/part.step')).rejects.toMatchObject({
      code: 'PENDING',
      path: 'models/part.step',
    });
    /* A source that fails. */
    service.setPendingObjectSource(async () => {
      throw new Error('offline');
    });
    await expect(view.readFile('models/part.step')).rejects.toBeInstanceOf(PendingContentError);
    /* A source that stalls, even one that ignores its signal: the bound answers (I10). */
    const stalling = await createService(30);
    stalling.setPendingObjectSource(
      async () =>
        new Promise<never>(() => {
          /* Never settles. */
        }),
    );
    await declarePart(stalling);
    const stalled = stalling.createRootedFileSystem(route);
    await expect(stalled.readFile('models/part.step')).rejects.toMatchObject({ code: 'PENDING' });
    await expect(new Response(stalled.readFileStream!('models/part.step')).arrayBuffer()).rejects.toMatchObject({
      code: 'PENDING',
    });
    stalling.dispose();
  });

  it('should bound a read by stalls, not by a deadline, and leave a shared transfer running when it refuses (I10)', async () => {
    const bounded = await createService(40);
    const view = bounded.createRootedFileSystem(route);
    /* A slow transfer that keeps making progress outlives the bound many times over. */
    bounded.setPendingObjectSource(async (_request, _signal, progress) => {
      for (let step = 0; step < 8; step += 1) {
        // oxlint-disable-next-line no-await-in-loop -- one chunk at a time, as a transfer arrives.
        await new Promise((resolve) => {
          setTimeout(resolve, 20);
        });
        progress();
      }
      return part;
    });
    expect(await view.readFile('models/part.step')).toStrictEqual(part);
    /* A transfer with no progress refuses the read; the transfer itself, shared with the fill, is not aborted. */
    let finish: (bytes: Uint8Array<ArrayBuffer>) => void = () => undefined;
    const transfer = new Promise<Uint8Array<ArrayBuffer>>((resolve) => {
      finish = resolve;
    });
    let readerSignal: AbortSignal | undefined;
    bounded.setPendingObjectSource(async (_request, signal) => {
      readerSignal = signal;
      return transfer;
    });
    await expect(view.readFile('models/part.step')).rejects.toMatchObject({ code: 'PENDING' });
    expect(readerSignal?.aborted).toBe(true);
    finish(part);
    expect(await transfer).toStrictEqual(part);
    /* The caller's own cancellation reaches the source as well. */
    const controller = new AbortController();
    const streamed = view.readFileStream!('models/part.step', { signal: controller.signal });
    controller.abort(new Error('closed'));
    await expect(new Response(streamed).arrayBuffer()).rejects.toThrow();
    bounded.dispose();
  });

  it('should read a pointer the host says is no placeholder as the text it is', async () => {
    service.setPendingObjectSource(async () => undefined);
    expect(await service.createRootedFileSystem(route).readFile('models/part.step')).toStrictEqual(pointer);
  });

  it('should copy a pending entry as its pointer, fetching nothing until the copy is read (copy-on-write)', async () => {
    const source = vi.fn<PendingObjectSource>(async () => part);
    service.setPendingObjectSource(source);
    const view = service.createRootedFileSystem(route);
    await view.duplicate!('models/part.step', 'models/copy.step');
    /* The copy only asks the device whether the target is a tracked name. */
    expect(source).toHaveBeenCalledTimes(1);
    expect(source).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'models/copy.step', pointer, localOnly: true }),
      expect.any(AbortSignal),
      expect.any(Function),
    );
    const raw = service.createRootedFileSystem(route, undefined, { placeholders: 'raw' });
    expect(await raw.readFile('models/copy.step')).toStrictEqual(pointer);
    expect(decoder.decode(await view.readFile('models/copy.step'))).toBe('solid part\n');
    /* A write over a pending entry replaces it. */
    await view.writeFile('models/copy.step', 'mine');
    expect(await view.readFile('models/copy.step', 'utf8')).toBe('mine');
  });

  it('should never write pointer text under a name the project does not track', async () => {
    const raw = service.createRootedFileSystem(route, undefined, { placeholders: 'raw' });
    const view = service.createRootedFileSystem(route);
    /* Untracked there, the object on the device: the copy is the object. */
    let local = true;
    service.setPendingObjectSource(async (request) => {
      if (request.path.startsWith('notes/')) {
        return undefined;
      }
      if (request.localOnly === true && !local) {
        throw new Error('not on this device');
      }
      return part;
    });
    await view.duplicate!('models/part.step', 'notes/copy.txt');
    expect(await raw.readFile('notes/copy.txt')).toStrictEqual(part);
    /* Untracked there, the object not here: refused, nothing written. */
    local = false;
    await expect(view.duplicate!('models/part.step', 'notes/other.txt')).rejects.toMatchObject({ code: 'PENDING' });
    await expect(raw.readFile('notes/other.txt')).rejects.toMatchObject({ code: 'ENOENT' });
    /* Tracked there, the object not here: the pointer is the copy. */
    await view.duplicate!('models/part.step', 'models/again.step');
    expect(await raw.readFile('models/again.step')).toStrictEqual(pointer);
  });
});

describe('marked placeholders (D9)', () => {
  const placeholder = { object: { oid, size: part.byteLength }, pointerSize: pointer.byteLength };

  /* The revision layer, the placeholders' only writer, says which they are: the index keeps it, and reads nothing. */
  it('should stat a declared placeholder as its object wherever a view lists it, reading no bytes', async () => {
    const raw = service.createRootedFileSystem(route, undefined, { placeholders: 'raw' });
    const view = service.createRootedFileSystem(route);
    await raw.declarePending!(new Map([['models/part.step', placeholder]]));
    const read = vi.spyOn(memory, 'readFile');
    const asObject = { size: part.byteLength, pending: true };
    expect(await view.stat('models/part.step')).toMatchObject(asObject);
    expect(await view.lstat('models/part.step')).toMatchObject(asObject);
    const listed = await view.readdirWithStats!('models');
    expect(listed.find((row) => row.name === 'part.step')).toMatchObject(asObject);
    const tree = await view.statTree!('models');
    expect(tree.find((row) => row.path === 'part.step')).toMatchObject(asObject);
    const found = await view.search!('part');
    expect(found.find((row) => row.path === 'models/part.step')).toMatchObject(asObject);
    const changed = await view.changedSince!(0);
    expect(changed.entries.find((entry) => entry.path === 'models/part.step')).toMatchObject({
      size: part.byteLength,
      pending: { oid, size: part.byteLength },
    });
    /* A pointer's facts describe the pointer, not the object: none are answered. */
    expect(await view.facts!(['models/part.step'])).toStrictEqual(new Map());
    /* A git-lfs oid is its object's SHA-256: the digest is answered without the bytes. */
    expect(await view.hashFiles!(['models/part.step'])).toStrictEqual({ 'models/part.step': oid });
    expect(await view.pendingPaths!(['models/part.step', 'main.scad'])).toStrictEqual(['models/part.step']);
    expect(read).not.toHaveBeenCalled();
    /* The revision layer sees the pointer it wrote. */
    const pointerStat = await raw.stat('models/part.step');
    expect(pointerStat).toMatchObject({ size: pointer.byteLength });
    expect(pointerStat).not.toHaveProperty('pending');
    /* And a read agrees with the stat: the object. */
    service.setPendingObjectSource(async () => part);
    expect(await view.readFile('models/part.step')).toStrictEqual(part);
  });

  /* Once declared, the marks are the whole answer: an outside edit is the next capture's to declare, not a read's. */
  it('should answer a pointer a declared root never marked as the text it is, in a stat and a read alike, asking no source', async () => {
    const source = vi.fn<PendingObjectSource>(async () => part);
    service.setPendingObjectSource(source);
    /* Written through the authority after the declaration: a person's text, known as it is written. */
    await service.writeFile(`${route}/notes/pointer.txt`, pointer);
    const view = service.createRootedFileSystem(route);
    const stat = await view.stat('notes/pointer.txt');
    expect(stat).toMatchObject({ size: pointer.byteLength });
    expect(stat).not.toHaveProperty('pending');
    expect(await view.readFile('notes/pointer.txt')).toStrictEqual(pointer);
    expect(await service.readFile(`${route}/notes/pointer.txt`)).toStrictEqual(pointer);
    expect(await view.pendingPaths!(['notes/pointer.txt'])).toStrictEqual([]);
    /* A copy of it is the text it is, too. */
    await view.duplicate!('notes/pointer.txt', 'notes/copy.txt');
    expect(await view.readFile('notes/copy.txt')).toStrictEqual(pointer);
    expect(source).not.toHaveBeenCalled();
  });

  it('should refuse a declared placeholder whose object cannot be had, never answering the pointer (I7)', async () => {
    const raw = service.createRootedFileSystem(route, undefined, { placeholders: 'raw' });
    await raw.declarePending!(new Map([['models/part.step', placeholder]]));
    await expect(service.createRootedFileSystem(route).readFile('models/part.step')).rejects.toMatchObject({
      code: 'PENDING',
    });
  });

  /* The service's own stat answers by the same mark a rooted view's does. */
  it('should stat a declared placeholder as its object through the service too', async () => {
    expect(await service.stat(`${route}/models/part.step`)).toMatchObject({ size: part.byteLength, pending: true });
    expect(await service.lstat(`${route}/models/part.step`)).toMatchObject({ size: part.byteLength, pending: true });
    const plain = await service.stat(`${route}/main.scad`);
    expect(plain).not.toHaveProperty('pending');
  });

  /* A file rewritten from outside since it was marked is not the pointer the mark names: its digest is its own. */
  it('should digest a marked file the oid only while it is still the size of its pointer', async () => {
    const view = service.createRootedFileSystem(route);
    expect(await view.hashFiles!(['models/part.step'])).toStrictEqual({ 'models/part.step': oid });
    await memory.writeFile('gear/models/part.step', 'rewritten from outside\n');
    const rewritten = await view.hashFiles!(['models/part.step']);
    expect(rewritten['models/part.step']).not.toBe(oid);
  });

  /* An outside rewrite at the pointer's size keeps the stat until a read or the next capture sees it (documented). */
  /* The stat before the read said pending: the read refuses as pending too, and only then is the file its text. */
  it('should end a mark whose file a read finds rewritten to another pointer, refusing that read, asking the source nothing', async () => {
    const source = vi.fn<PendingObjectSource>(async () => part);
    service.setPendingObjectSource(source);
    const view = service.createRootedFileSystem(route);
    const other = encoder.encode(new TextDecoder().decode(pointer).replace(oid, 'e'.repeat(64)));
    expect(other.byteLength).toBe(pointer.byteLength);
    await memory.writeFile('gear/models/part.step', other);
    expect(await view.stat('models/part.step')).toMatchObject({ size: part.byteLength, pending: true });
    await expect(view.readFile('models/part.step')).rejects.toBeInstanceOf(PendingContentError);
    expect(source).not.toHaveBeenCalled();
    expect(await view.stat('models/part.step')).toMatchObject({ size: pointer.byteLength });
    expect(await view.readFile('models/part.step')).toStrictEqual(other);
  });

  /* While a tree write's entries are live the revision layer is about to say what the file is: nothing is ended. */
  it('should refuse a marked file rewritten to another pointer while a tree write is live, keeping its mark', async () => {
    service.setPendingObjectSource(async () => part);
    const raw = service.createRootedFileSystem(route, undefined, { placeholders: 'raw' });
    const view = service.createRootedFileSystem(route);
    await raw.expectEntries!([
      { path: 'main.scad', size: 27, arriving: false },
      { path: 'models/part.step', size: pointer.byteLength, pending: { oid, size: part.byteLength }, arriving: false },
    ]);
    const other = encoder.encode(new TextDecoder().decode(pointer).replace(oid, 'e'.repeat(64)));
    await memory.writeFile('gear/models/part.step', other);
    await expect(view.readFile('models/part.step')).rejects.toBeInstanceOf(PendingContentError);
    await expect(view.readFile('models/part.step')).rejects.toBeInstanceOf(PendingContentError);
    expect(await view.stat('models/part.step')).toMatchObject({ size: part.byteLength, pending: true });
    raw.endExpectation!();
  });

  it('should end a mark the source says is no placeholder, so the next stat is the pointer', async () => {
    const raw = service.createRootedFileSystem(route, undefined, { placeholders: 'raw' });
    const view = service.createRootedFileSystem(route);
    await raw.declarePending!(new Map([['models/part.step', placeholder]]));
    service.setPendingObjectSource(async () => undefined);
    expect(await view.readFile('models/part.step')).toStrictEqual(pointer);
    const stat = await view.stat('models/part.step');
    expect(stat).toMatchObject({ size: pointer.byteLength });
    expect(stat).not.toHaveProperty('pending');
  });

  it('should keep a scoped declaration to the paths it speaks for', async () => {
    const raw = service.createRootedFileSystem(route, undefined, { placeholders: 'raw' });
    const view = service.createRootedFileSystem(route);
    await raw.declarePending!(new Map([['models/part.step', placeholder]]));
    await raw.declarePending!(new Map(), ['main.scad']);
    expect(await view.pendingPaths!(['models/part.step'])).toStrictEqual(['models/part.step']);
    await raw.declarePending!(new Map(), ['models/part.step']);
    expect(await view.pendingPaths!(['models/part.step'])).toStrictEqual([]);
  });

  /* A topology change elsewhere (the authority root's) leaves a declared root reading the same bytes: its marks stand. */
  it('should keep a declared root declared, its marks answering, across a topology change that left it in place', async () => {
    const view = service.createRootedFileSystem(route);
    expect(await view.stat('models/part.step')).toMatchObject({ size: part.byteLength, pending: true });
    const indexes = (service as unknown as { _projectIndexes: ProjectIndexes })._projectIndexes;
    /* The files are older than the racy window by the time the topology changes. */
    const now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now + 5000);
    indexes.evict('/');
    clock.mockRestore();
    const answer = await Promise.race([
      view.stat('models/part.step'),
      new Promise<'waiting'>((resolve) => {
        setTimeout(() => {
          resolve('waiting');
        }, 20);
      }),
    ]);
    expect(answer).toMatchObject({ size: part.byteLength, pending: true });
    expect(await view.readdirWithStats!('models')).toStrictEqual([
      expect.objectContaining({ name: 'part.step', size: part.byteLength, pending: true }),
    ]);
    expect(await view.pendingPaths!(['models/part.step'])).toStrictEqual(['models/part.step']);
  });

  /* A file written within the racy window may change again at the same mtime: its mark is not carried, nor trusted. */
  it('should carry no mark of a file written within the racy window, answering it as unknown, never as text', async () => {
    service.setPendingObjectSource(async () => part);
    const view = service.createRootedFileSystem(route);
    expect(await view.stat('models/part.step')).toMatchObject({ size: part.byteLength, pending: true });
    const indexes = (service as unknown as { _projectIndexes: ProjectIndexes })._projectIndexes;
    indexes.evict('/');
    expect(await view.stat('models/part.step')).toMatchObject({ size: pointer.byteLength, pending: true });
    await expect(view.readFile('models/part.step')).rejects.toBeInstanceOf(PendingContentError);
    expect(await view.readFile('main.scad')).toStrictEqual(encoder.encode('import("models/part.step");'));
  });
});

/*
 * A root the revision layer owns, before its first word (a reload whose index forgot its marks, or a stat before the
 * index opened): a file the size of a pointer may be a placeholder, so it is neither a small file nor a pointer yet.
 */
describe('a root awaiting its first declaration (D9, I7)', () => {
  const placeholder = { object: { oid, size: part.byteLength }, pointerSize: pointer.byteLength };
  const waiting = async (milliseconds = 20): Promise<'waiting'> =>
    new Promise((resolve) => {
      setTimeout(() => {
        resolve('waiting');
      }, milliseconds);
    });

  /* Only the revision registry opening a project makes it the revision layer's: a project nobody opened is as it is. */
  it('should neither hold nor refuse a pointer in a project the revision registry has not opened', async () => {
    const unopened = await createService(undefined, { declared: false });
    const view = unopened.createRootedFileSystem(route);
    expect(await Promise.race([view.stat('models/part.step'), waiting()])).toMatchObject({ size: pointer.byteLength });
    expect(await view.readFile('models/part.step')).toStrictEqual(pointer);
    unopened.dispose();
  });

  /*
   * Only a pointer can be a placeholder: a stat of a file the size of one that nothing answers reads its few bytes,
   * and an ordinary small file answers as itself at once, in the view and in the service alike (I3's bounded trade).
   */
  it('should answer an ordinary file the size of a pointer at once while the root waits, reading only its bytes', async () => {
    const cold = await createService(undefined, { declared: false });
    const raw = cold.createRootedFileSystem(route, undefined, { placeholders: 'raw' });
    const view = cold.createRootedFileSystem(route);
    const small = encoder.encode('x'.repeat(130));
    await raw.writeFile('notes/small.txt', small);
    const viewStat = await Promise.race([view.stat('notes/small.txt'), waiting()]);
    const serviceStat = await Promise.race([cold.stat(`${route}/notes/small.txt`), waiting()]);
    expect(viewStat).toMatchObject({ size: 130 });
    expect(viewStat).not.toHaveProperty('pending');
    expect(serviceStat).toMatchObject({ size: 130 });
    expect(serviceStat).not.toHaveProperty('pending');
    /* A pointer still waits for the declaration. */
    expect(await Promise.race([view.stat('models/part.step'), waiting()])).toBe('waiting');
    cold.dispose();
  });

  /* Opening the root is the revision layer's word that it will declare it: no capture has to start first. */
  it('should hold a stat of a file the size of a pointer from the moment the revision layer opens the root, and no listing', async () => {
    const cold = await createService(undefined, { declared: false });
    const raw = cold.createRootedFileSystem(route, undefined, { placeholders: 'raw' });
    const view = cold.createRootedFileSystem(route);
    expect(await view.stat('main.scad')).toMatchObject({ size: 27 });
    const statting = view.stat('models/part.step');
    const serviceStat = cold.stat(`${route}/models/part.step`);
    cold.setPendingObjectSource(async () => part);
    const reading = view.readFile('models/part.step');
    for (const held of [statting, serviceStat, reading]) {
      // oxlint-disable-next-line no-await-in-loop -- each is raced in turn against the same short wait.
      expect(await Promise.race([held, waiting()])).toBe('waiting');
    }
    /* A listing waits for no row: the one nothing answers yet is pending at its own size, and the others are as they are. */
    const asHeld = { size: pointer.byteLength, pending: true };
    const tree = await Promise.race([view.statTree!('models'), waiting()]);
    expect(tree).not.toBe('waiting');
    const rows = await Promise.race([view.readdirWithStats!(''), waiting()]);
    expect(rows).not.toBe('waiting');
    expect((tree as FileStatEntry[]).find((row) => row.path === 'part.step')).toMatchObject(asHeld);
    expect((rows as DirectoryStatRow[]).find((row) => row.name === 'main.scad')).toMatchObject({ size: 27 });
    expect((rows as DirectoryStatRow[]).find((row) => row.name === 'main.scad')).not.toHaveProperty('pending');
    /* The raw view, the revision layer's own, is never held. */
    expect(await raw.stat('models/part.step')).toMatchObject({ size: pointer.byteLength });
    await raw.declarePending!(new Map([['models/part.step', placeholder]]));
    expect(await statting).toMatchObject({ size: part.byteLength, pending: true });
    expect(await serviceStat).toMatchObject({ size: part.byteLength, pending: true });
    expect(await reading).toStrictEqual(part);
    const declaredTree = await view.statTree!('models');
    expect(declaredTree.find((row) => row.path === 'part.step')).toMatchObject({ size: part.byteLength });
    /* Declared once, the marks alone answer, and a later view of the revision layer's holds nothing again. */
    cold.createRootedFileSystem(route, undefined, { placeholders: 'raw' });
    await raw.writeFile('notes/pointer.txt', pointer);
    expect(await view.stat('notes/pointer.txt')).toMatchObject({ size: pointer.byteLength });
    cold.dispose();
  });

  /*
   * STO-25: a cold open's first view must not wait for the capture that follows the tree write. The tree write's
   * expectation already says what every path it names is, so those paths answer at once, a small text file the size
   * of a pointer among them.
   */
  it('should answer a cold open’s first listing from the tree write’s expectation, never waiting for its capture', async () => {
    const cold = await createService(undefined, { declared: false });
    const raw = cold.createRootedFileSystem(route, undefined, { placeholders: 'raw' });
    const view = cold.createRootedFileSystem(route);
    const declare = vi.spyOn(ProjectIndexes.prototype, 'declarePending');
    const ignore = encoder.encode(`${'# build output\n'.repeat(8)}dist/\nbin\n`);
    expect(ignore.byteLength).toBe(130);
    const entries = [
      { path: '.gitignore', size: ignore.byteLength, arriving: true },
      { path: 'main.scad', size: 27, arriving: false },
      { path: 'models/part.step', size: pointer.byteLength, pending: { oid, size: part.byteLength }, arriving: false },
      ...Array.from({ length: 2000 }, (_, at) => ({ path: `parts/p${String(at)}.scad`, size: 140, arriving: true })),
    ];
    await raw.expectEntries!(entries);
    await raw.writeFile('.gitignore', ignore);
    for (let at = 0; at < 20; at += 1) {
      // oxlint-disable-next-line no-await-in-loop -- a few of the tree's files, landed in order.
      await raw.writeFile(`parts/p${String(at)}.scad`, encoder.encode('c'.repeat(140)));
    }
    const started = performance.now();
    const listing = await Promise.race([view.readdirWithStats!(''), waiting()]);
    const parts = await Promise.race([view.readdirWithStats!('parts'), waiting()]);
    const ignoreStat = await Promise.race([view.stat('.gitignore'), waiting()]);
    const partStat = await Promise.race([view.stat('models/part.step'), waiting()]);
    const elapsed = performance.now() - started;
    expect(listing).not.toBe('waiting');
    expect(parts).not.toBe('waiting');
    expect(ignoreStat).toMatchObject({ size: 130 });
    expect(ignoreStat).not.toHaveProperty('pending');
    expect(partStat).toMatchObject({ size: part.byteLength, pending: true });
    /* The landed files are themselves; the rest of the tree is listed as arriving (I7), not missing. */
    const landed = new Set(Array.from({ length: 20 }, (_, at) => `p${String(at)}.scad`));
    expect(
      (parts as DirectoryStatRow[]).filter((row) => landed.has(row.name)).every((row) => !('pending' in row)),
    ).toBe(true);
    const arriving = (parts as DirectoryStatRow[]).filter((row) => 'pending' in row);
    expect(arriving).toHaveLength(1980);
    /* Each at the size the tree gives it, with no content facts. */
    expect(arriving.every((row) => row.type === 'file' && row.size === 140 && !('contentKind' in row))).toBe(true);
    expect(await view.readFile('.gitignore')).toStrictEqual(ignore);
    /* No first-view answer waited for the capture's declaration. */
    expect(declare).not.toHaveBeenCalled();
    expect(elapsed).toBeLessThan(500);
    cold.dispose();
  });

  /* A warm open: each file still as stored answers by its stored mark, before the root's index compares. */
  it('should answer a warm open’s first listing and stats from the stored marks, without waiting for the compare', async () => {
    const providerRegistry = new ProviderRegistry();
    const before = await createService(undefined, { providerRegistry, durable: true });
    const provider = memory;
    await expect
      .poll(
        async () =>
          provider.readFile('gear/.tau/index/snapshot.json').then(
            (bytes) => bytes.byteLength,
            () => 0,
          ),
        {
          timeout: 10_000,
        },
      )
      .toBeGreaterThan(0);
    const reloaded = await createService(undefined, { providerRegistry, durable: true, reload: true });
    reloaded.createRootedFileSystem(route, undefined, { placeholders: 'raw' });
    const ready = vi.spyOn(ProjectIndexes.prototype, 'ready');
    const view = reloaded.createRootedFileSystem(route);
    const rows = await Promise.race([view.readdirWithStats!('models'), waiting()]);
    expect(rows).not.toBe('waiting');
    expect((rows as DirectoryStatRow[]).find((row) => row.name === 'part.step')).toMatchObject({
      size: part.byteLength,
      pending: true,
    });
    expect(await Promise.race([view.stat('models/part.step'), waiting()])).toMatchObject({
      size: part.byteLength,
      pending: true,
    });
    expect(await Promise.race([view.stat('main.scad'), waiting()])).toMatchObject({ size: 27 });
    expect(ready).not.toHaveBeenCalled();
    reloaded.dispose();
    before.dispose();
  }, 20_000);

  /* A stamped root is the revision layer's even before it opens it again: a pointer written since refuses a read (I7). */
  it('should refuse a pointer written since a declared snapshot, before the revision layer opens the reloaded root', async () => {
    const providerRegistry = new ProviderRegistry();
    const before = await createService(undefined, { providerRegistry, durable: true });
    const provider = memory;
    await expect
      .poll(
        async () =>
          provider.readFile('gear/.tau/index/snapshot.json').then(
            (bytes) => bytes.byteLength,
            () => 0,
          ),
        {
          timeout: 10_000,
        },
      )
      .toBeGreaterThan(0);
    await provider.writeFile('gear/notes/added.step', pointer);
    const reloaded = await createService(undefined, { providerRegistry, durable: true, reload: true });
    reloaded.setPendingObjectSource(async () => part);
    const view = reloaded.createRootedFileSystem(route);
    await expect(view.readFile('notes/added.step')).rejects.toBeInstanceOf(PendingContentError);
    expect(await view.readFile('main.scad')).toStrictEqual(encoder.encode('import("models/part.step");'));
    reloaded.dispose();
    before.dispose();
  }, 20_000);

  it('should end the hold once, at the bound, and answer every row from the marks, never refusing a listing', async () => {
    const bound = 150;
    const bounded = await createService(bound, { declared: false });
    bounded.createRootedFileSystem(route, undefined, { placeholders: 'raw' });
    const view = bounded.createRootedFileSystem(route);
    const started = Date.now();
    const answers = await Promise.all([
      view.stat('models/part.step'),
      view.readdirWithStats!('models'),
      view.statTree!('models'),
      view.search!('part'),
      view.changedSince!(0),
      view.readFile('models/part.step').catch((error: unknown) => error),
    ]);
    expect(Date.now() - started).toBeGreaterThanOrEqual(bound - 10);
    const [stat, rows, tree, found, changed, bytes] = answers;
    const asPointer = { size: pointer.byteLength };
    expect(stat).toMatchObject(asPointer);
    expect(rows.find((row) => row.name === 'part.step')).toMatchObject(asPointer);
    expect(tree.find((row) => row.path === 'part.step')).toMatchObject(asPointer);
    expect(found.find((row) => row.path === 'models/part.step')).toMatchObject(asPointer);
    expect(changed.entries.find((entry) => entry.path === 'models/part.step')).toMatchObject(asPointer);
    /* The bound ends the wait, never the doubt: a pointer nobody declared is not read as text (I7). */
    expect(bytes).toMatchObject({ code: 'PENDING' });
    /* Once per root: neither a later call nor a later view of the revision layer's waits again. */
    bounded.createRootedFileSystem(route, undefined, { placeholders: 'raw' });
    expect(await Promise.race([view.stat('models/part.step'), waiting(bound / 2)])).toMatchObject(asPointer);
    bounded.dispose();
  });

  it('should end the hold when the declaration fails, so nothing waits on a word that will not come', async () => {
    const failing = await createService(undefined, { declared: false });
    const raw = failing.createRootedFileSystem(route, undefined, { placeholders: 'raw' });
    const view = failing.createRootedFileSystem(route);
    const statting = view.stat('models/part.step');
    expect(await Promise.race([statting, waiting()])).toBe('waiting');
    vi.spyOn(ProjectIndex.prototype, 'declarePending').mockImplementationOnce(() => {
      throw new Error('declaration failed');
    });
    await expect(raw.declarePending!(new Map([['models/part.step', placeholder]]))).rejects.toThrow(
      'declaration failed',
    );
    expect(await statting).toMatchObject({ size: pointer.byteLength });
    /* A failed declaration declares nothing: the pointer still refuses a read until one succeeds. */
    await expect(view.readFile('models/part.step')).rejects.toMatchObject({ code: 'PENDING' });
    await raw.declarePending!(new Map());
    expect(await view.readFile('models/part.step')).toStrictEqual(pointer);
    failing.dispose();
  });

  it('should end the hold when the revision layer lets go of the root, or the service is disposed', async () => {
    const released = await createService(undefined, { declared: false });
    const raw = released.createRootedFileSystem(route, undefined, { placeholders: 'raw' });
    const view = released.createRootedFileSystem(route);
    const statting = view.stat('models/part.step');
    expect(await Promise.race([statting, waiting()])).toBe('waiting');
    raw.releaseDeclaration!();
    expect(await statting).toMatchObject({ size: pointer.byteLength });
    /* Letting go is not a declaration: a first capture that failed or stopped leaves the pointer refused. */
    await expect(view.readFile('models/part.step')).rejects.toMatchObject({ code: 'PENDING' });
    released.dispose();

    const disposed = await createService(undefined, { declared: false });
    disposed.createRootedFileSystem(route, undefined, { placeholders: 'raw' });
    const held = disposed.createRootedFileSystem(route).stat('models/part.step');
    expect(await Promise.race([held, waiting()])).toBe('waiting');
    disposed.dispose();
    await expect(held).resolves.toBeDefined();
  });

  it('should stop waiting when the caller aborts, as the caller says', async () => {
    const aborting = await createService(undefined, { declared: false });
    aborting.createRootedFileSystem(route, undefined, { placeholders: 'raw' });
    const view = aborting.createRootedFileSystem(route);
    const controller = new AbortController();
    aborting.setPendingObjectSource(async () => part);
    const reading = aborting.readFile(`${route}/models/part.step`, { signal: controller.signal });
    expect(await Promise.race([reading, waiting()])).toBe('waiting');
    controller.abort(new Error('stopped'));
    await expect(reading).rejects.toThrow('stopped');
    expect(view).toBeDefined();
    aborting.dispose();
  });
});

describe('expected entries (D10)', () => {
  /*
   * Only a row a listing showed that is not on disk has nothing to replace it. A placeholder whose pointer landed is
   * on disk, though it waits for its object: ending the write tells no one to re-list for it, and a failed write's
   * reset reaches no further than the folders of the rows it never landed.
   */
  it('should scope the end of a write to the folders of rows it never put on disk', async () => {
    const raw = service.createRootedFileSystem(route, undefined, { placeholders: 'raw' });
    const view = service.createRootedFileSystem(route);
    const next = encoder.encode(
      `version https://git-lfs.github.com/spec/v1\noid sha256:${'d'.repeat(64)}\nsize ${String(part.byteLength)}\n`,
    );
    const entries = [
      { path: 'main.scad', size: 27, arriving: false },
      {
        path: 'assets/new.step',
        size: next.byteLength,
        pending: { oid: 'd'.repeat(64), size: part.byteLength },
        arriving: true,
      },
      { path: 'lib/deep/axle.scad', size: 40, arriving: true },
    ];
    const watching = (): Readonly<{ sets: ChangeSet[]; stop: () => void }> => {
      const sets: ChangeSet[] = [];
      const stop = view.watchChangeSets!({ paths: [''], recursive: true }, (set) => {
        sets.push(set);
      });
      return { sets, stop };
    };
    const settle = async (): Promise<void> =>
      new Promise((resolve) => {
        setTimeout(resolve, 20);
      });

    /* Every arriving row landed, the placeholder as its pointer: nothing to re-list. */
    await raw.expectEntries!(entries);
    await raw.writeFile('assets/new.step', next);
    await raw.writeFile('lib/deep/axle.scad', encoder.encode('a'.repeat(40)));
    await settle();
    const landed = watching();
    raw.endExpectation!();
    await settle();
    landed.stop();
    expect(landed.sets).toStrictEqual([]);

    /* A failed write: only the folder of the row it never put on disk re-lists, never the root. */
    await raw.expectEntries!([...entries, { path: 'lib/more/bolt.scad', size: 10, arriving: true }]);
    await settle();
    const failed = watching();
    raw.endExpectation!({ failed: true });
    await settle();
    failed.stop();
    expect(failed.sets.map((set) => set.reset?.prefix)).toStrictEqual(['lib']);
  });

  /*
   * An ended write leaves its arriving rows nothing to replace them: a folder only they made never raises an event of
   * its own. So the end tells every watch under them to re-list, failed or not, and the rows vanish (I7).
   */
  it.each([
    ['failed', { failed: true }],
    ['landed', undefined],
  ] as const)(
    'should tell every watch under a %s write’s arriving rows to re-list when it ends',
    async (_case, options) => {
      const raw = service.createRootedFileSystem(route, undefined, { placeholders: 'raw' });
      const view = service.createRootedFileSystem(route);
      await raw.expectEntries!([
        { path: 'main.scad', size: 27, arriving: false },
        { path: 'lib/deep/axle.scad', size: 40, arriving: true },
      ]);
      const seen: string[] = [];
      const stop = view.watch({ paths: ['lib/deep'], recursive: false }, (event) => {
        seen.push(event.type);
      });
      raw.endExpectation!(options);
      await new Promise((resolve) => {
        setTimeout(resolve, 20);
      });
      stop();
      expect(seen.length).toBeGreaterThan(0);
      await expect(view.readdirWithStats!('lib')).rejects.toMatchObject({ code: 'ENOENT' });
    },
  );

  it('should know a tree write’s entries in a cold root’s index and answer when they have landed', async () => {
    const source = vi.fn<PendingObjectSource>(async () => part);
    service.setPendingObjectSource(source);
    const raw = service.createRootedFileSystem(route, undefined, { placeholders: 'raw' });
    expect(raw.entriesLanded!(['tau.json'])).toBeUndefined();
    /* No warm-up: the expectation opens the cold index. */
    await raw.expectEntries!([
      { path: 'tau.json', size: 2, arriving: true },
      { path: 'models/part.step', size: pointer.byteLength, pending: { oid, size: part.byteLength }, arriving: false },
    ]);
    expect(raw.entriesLanded!(['tau.json'])).toBe(false);
    /* A placeholder is not readable as its pointer: it lands with its object. */
    expect(raw.entriesLanded!(['models/part.step'])).toBe(false);
    /* A consumer that only searches learns it is pending from the index, starting no download. */
    const view = service.createRootedFileSystem(route);
    expect(await view.pendingPaths!(['main.scad', 'models/part.step'])).toStrictEqual(['models/part.step']);
    expect(source).not.toHaveBeenCalled();
    await raw.writeFile('tau.json', '{}');
    await raw.writeFile('models/part.step', part);
    expect(raw.entriesLanded!(['tau.json', 'models/part.step'])).toBe(true);
    expect(await view.pendingPaths!(['models/part.step'])).toStrictEqual([]);
    raw.endExpectation!();
    expect(raw.entriesLanded!(['tau.json'])).toBeUndefined();
  });

  /*
   * STO-25: a first view opens once the entry closure lands, before the rest of the tree has. A listing then shows
   * every entry the write announced: one it has yet to land is a pending row at the size the tree gives it, never
   * missing and never an empty folder (I7), and a folder only arriving entries make lists them before it exists.
   */
  it('should list a tree write’s entries it has yet to land as pending rows, never as missing (I7)', async () => {
    const raw = service.createRootedFileSystem(route, undefined, { placeholders: 'raw' });
    const view = service.createRootedFileSystem(route);
    await raw.expectEntries!([
      { path: 'tau.json', size: 2, arriving: true },
      { path: 'main.scad', size: 27, arriving: false },
      { path: 'lib/gear.scad', size: 300, arriving: true },
      { path: 'lib/deep/axle.scad', size: 40, arriving: true },
      { path: 'models/part.step', size: pointer.byteLength, pending: { oid, size: part.byteLength }, arriving: false },
      { path: 'models/new.step', size: pointer.byteLength, pending: { oid, size: part.byteLength }, arriving: true },
    ]);
    await raw.writeFile('tau.json', '{}');
    const byName = (rows: readonly DirectoryStatRow[]): Record<string, DirectoryStatRow> =>
      Object.fromEntries(rows.map((row) => [row.name, row]));
    const top = byName(await view.readdirWithStats!(''));
    expect(Object.keys(top).toSorted()).toStrictEqual(['lib', 'main.scad', 'models', 'tau.json']);
    expect(top['tau.json']).not.toHaveProperty('pending');
    /* A folder only arriving entries make is pending too: nothing may be renamed, moved or made inside it yet. */
    expect(top['lib']).toMatchObject({ type: 'dir', pending: true });
    expect(top['models']).not.toHaveProperty('pending');
    /* A folder nothing has landed in yet lists what will arrive in it. */
    const lib = byName(await view.readdirWithStats!('lib'));
    /* Marked arriving too: a consumer that reads what it lists (an agent) leaves such a row out. */
    expect(lib['gear.scad']).toMatchObject({ type: 'file', size: 300, pending: true, arriving: true });
    expect(top['tau.json']).not.toHaveProperty('arriving');
    expect(lib['gear.scad']).not.toHaveProperty('contentKind');
    expect(lib['deep']).toMatchObject({ type: 'dir' });
    const models = byName(await view.readdirWithStats!('models'));
    /* A placeholder still to land is its object's size, as a landed one is. */
    expect(models['new.step']).toMatchObject({ size: part.byteLength, pending: true });
    expect(models['part.step']).toMatchObject({ size: part.byteLength, pending: true });
    const tree = await view.statTree!('');
    expect(tree.find((row) => row.path === 'lib/deep/axle.scad')).toMatchObject({ size: 40, pending: true });
    /* The raw view, the revision layer's own, sees only what is on disk. */
    const onDisk = await raw.readdirWithStats!('');
    expect(onDisk.map((row) => row.name).toSorted()).toStrictEqual(['main.scad', 'models', 'tau.json']);
    /* Landed, a row is the file on disk; once the write ends, nothing is listed that it did not land. */
    await raw.writeFile('lib/gear.scad', encoder.encode('g'.repeat(300)));
    expect(byName(await view.readdirWithStats!('lib'))['gear.scad']).not.toHaveProperty('pending');
    raw.endExpectation!({ failed: true });
    expect(Object.keys(byName(await view.readdirWithStats!('lib')))).toStrictEqual(['gear.scad']);
    await expect(view.readdirWithStats!('lib/deep')).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

/*
 * A tree write over a pending path (a pull): until the new tree lands a path, the path is what is on disk, so its stat
 * and its read answer the old placeholder alike, never the old pointer's text (I7).
 */
describe('a tree write over pending entries (D9, D10, I7)', () => {
  const placeholder = { object: { oid, size: part.byteLength }, pointerSize: pointer.byteLength };
  const newPart = encoder.encode('the new solid part\n');
  const pointerOf = (to: string, size: number): Uint8Array<ArrayBuffer> =>
    encoder.encode(`version https://git-lfs.github.com/spec/v1\noid sha256:${to}\nsize ${String(size)}\n`);
  const objects = async (request: Readonly<{ object: Readonly<{ oid: string }> }>): Promise<Uint8Array<ArrayBuffer>> =>
    request.object.oid === oid ? part : newPart;

  it.each([
    ['another size', 'd'.repeat(64), newPart.byteLength],
    ['the same size', 'e'.repeat(64), part.byteLength],
  ])(
    'should answer a pending path the write has not landed as its old placeholder, its new pointer at %s',
    async (_case, to, size) => {
      service.setPendingObjectSource(objects);
      const raw = service.createRootedFileSystem(route, undefined, { placeholders: 'raw' });
      const view = service.createRootedFileSystem(route);
      const next = pointerOf(to, size);
      await raw.expectEntries!([
        { path: 'main.scad', size: 27, arriving: false },
        { path: 'models/part.step', size: next.byteLength, pending: { oid: to, size }, arriving: true },
      ]);
      expect(await view.stat('models/part.step')).toMatchObject({ size: part.byteLength, pending: true });
      expect(await view.readFile('models/part.step')).toStrictEqual(part);
      /* Landed, the path is the new tree's. */
      await raw.writeFile('models/part.step', next);
      expect(await view.stat('models/part.step')).toMatchObject({ size, pending: true });
      expect(await view.readFile('models/part.step')).toStrictEqual(newPart);
      raw.endExpectation!();
    },
  );

  /*
   * A declaration found before a tree write's entries were known speaks for the older tree: it never ends the newer
   * tree's marks nor stamps the root declared over them (D9, D10, I7).
   */
  it('should leave a tree write’s marks to it when a declaration found before it arrives after it', async () => {
    const raw = service.createRootedFileSystem(route, undefined, { placeholders: 'raw' });
    const view = service.createRootedFileSystem(route);
    service.setPendingObjectSource(objects);
    const basis = raw.declarationBasis!();
    const next = pointerOf('d'.repeat(64), newPart.byteLength);
    await raw.writeFile('models/new.step', next);
    await raw.expectEntries!([
      { path: 'models/part.step', size: pointer.byteLength, pending: { oid, size: part.byteLength }, arriving: false },
      {
        path: 'models/new.step',
        size: next.byteLength,
        pending: { oid: 'd'.repeat(64), size: newPart.byteLength },
        arriving: false,
      },
    ]);
    /* What the older look found: only the old placeholder. */
    await raw.declarePending!(new Map([['models/part.step', placeholder]]), undefined, { basis });
    expect(await view.stat('models/new.step')).toMatchObject({ size: newPart.byteLength, pending: true });
    expect(await view.readFile('models/new.step')).toStrictEqual(newPart);
    raw.endExpectation!();
    /* A declaration on the current basis speaks. */
    await raw.declarePending!(new Map([['models/part.step', placeholder]]), undefined, {
      basis: raw.declarationBasis!(),
    });
    expect(await view.stat('models/new.step')).toMatchObject({ size: next.byteLength });
    expect(await view.stat('models/new.step')).not.toHaveProperty('pending');
  });

  it('should forget a failed tree write’s entries, so its paths answer as they are on disk', async () => {
    service.setPendingObjectSource(objects);
    const raw = service.createRootedFileSystem(route, undefined, { placeholders: 'raw' });
    const view = service.createRootedFileSystem(route);
    /* The new tree says the path is a small text file; the write fails before it lands. */
    await raw.expectEntries!([{ path: 'models/part.step', size: pointer.byteLength, arriving: true }]);
    raw.endExpectation!({ failed: true });
    expect(await view.stat('models/part.step')).toMatchObject({ size: part.byteLength, pending: true });
    expect(await view.readFile('models/part.step')).toStrictEqual(part);
  });
});
