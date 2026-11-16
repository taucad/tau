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
import type { PendingObjectSource } from '#pending-content.js';
import { ProviderRegistry } from '#provider-registry.js';
import { ResourceQueue } from '#resource-queue.js';
import { WorkspaceFileService } from '#workspace-file-service.js';
import type { FileSystemProvider } from '#types.js';

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
  options?: Readonly<{ declared?: boolean }>,
): Promise<WorkspaceFileService> => {
  const providerRegistry = new ProviderRegistry();
  const scope = { backend: 'memory', storageRootKey: 'memory:pending-content' } as const;
  const provider = await providerRegistry.getProvider(scope);
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
  it('should answer a pointer nobody declared as the text it is, in a stat and a read alike, asking no source', async () => {
    const plain = await createService(undefined, { declared: false });
    const source = vi.fn<PendingObjectSource>(async () => part);
    plain.setPendingObjectSource(source);
    const view = plain.createRootedFileSystem(route);
    const stat = await view.stat('models/part.step');
    expect(stat).toMatchObject({ size: pointer.byteLength });
    expect(stat).not.toHaveProperty('pending');
    expect(await view.readFile('models/part.step')).toStrictEqual(pointer);
    expect(await plain.readFile(`${route}/models/part.step`)).toStrictEqual(pointer);
    expect(await view.pendingPaths!(['models/part.step'])).toStrictEqual([]);
    expect(await view.stat('models/part.step')).toMatchObject({ size: pointer.byteLength });
    /* A copy of it is the text it is, too. */
    await view.duplicate!('models/part.step', 'notes/copy.txt');
    expect(await view.readFile('notes/copy.txt')).toStrictEqual(pointer);
    expect(source).not.toHaveBeenCalled();
    plain.dispose();
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

  /* Mounting the root is the revision layer's word that it will declare it: no capture has to start first. */
  it('should hold a file the size of a pointer from the moment the revision layer mounts the root, until it declares it', async () => {
    const cold = await createService(undefined, { declared: false });
    const raw = cold.createRootedFileSystem(route, undefined, { placeholders: 'raw' });
    const view = cold.createRootedFileSystem(route);
    expect(await view.stat('main.scad')).toMatchObject({ size: 27 });
    const statting = view.stat('models/part.step');
    const listing = view.statTree!('models');
    const listingRows = view.readdirWithStats!('models');
    const serviceStat = cold.stat(`${route}/models/part.step`);
    cold.setPendingObjectSource(async () => part);
    const reading = view.readFile('models/part.step');
    for (const held of [statting, listing, listingRows, serviceStat, reading]) {
      // oxlint-disable-next-line no-await-in-loop -- each is raced in turn against the same short wait.
      expect(await Promise.race([held, waiting()])).toBe('waiting');
    }
    /* The raw view, the revision layer's own, is never held. */
    expect(await raw.stat('models/part.step')).toMatchObject({ size: pointer.byteLength });
    await raw.declarePending!(new Map([['models/part.step', placeholder]]));
    expect(await statting).toMatchObject({ size: part.byteLength, pending: true });
    const [tree, rows] = await Promise.all([listing, listingRows]);
    expect(tree.find((row) => row.path === 'part.step')).toMatchObject({ size: part.byteLength });
    expect(rows.find((row) => row.name === 'part.step')).toMatchObject({ size: part.byteLength });
    expect(await serviceStat).toMatchObject({ size: part.byteLength, pending: true });
    expect(await reading).toStrictEqual(part);
    /* Declared once, the marks alone answer, and a later view of the revision layer's holds nothing again. */
    cold.createRootedFileSystem(route, undefined, { placeholders: 'raw' });
    await raw.writeFile('notes/pointer.txt', pointer);
    expect(await view.stat('notes/pointer.txt')).toMatchObject({ size: pointer.byteLength });
    cold.dispose();
  });

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
      view.readFile('models/part.step'),
    ]);
    expect(Date.now() - started).toBeGreaterThanOrEqual(bound - 10);
    const [stat, rows, tree, found, changed, bytes] = answers;
    const asPointer = { size: pointer.byteLength };
    expect(stat).toMatchObject(asPointer);
    expect(rows.find((row) => row.name === 'part.step')).toMatchObject(asPointer);
    expect(tree.find((row) => row.path === 'part.step')).toMatchObject(asPointer);
    expect(found.find((row) => row.path === 'models/part.step')).toMatchObject(asPointer);
    expect(changed.entries.find((entry) => entry.path === 'models/part.step')).toMatchObject(asPointer);
    expect(bytes).toStrictEqual(pointer);
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
    released.dispose();

    const disposed = await createService(undefined, { declared: false });
    disposed.createRootedFileSystem(route, undefined, { placeholders: 'raw' });
    const held = disposed.createRootedFileSystem(route).statTree!('models');
    expect(await Promise.race([held, waiting()])).toBe('waiting');
    disposed.dispose();
    await expect(held).resolves.toBeDefined();
  });

  it('should stop waiting when the caller aborts, as the caller says', async () => {
    const aborting = await createService(undefined, { declared: false });
    aborting.createRootedFileSystem(route, undefined, { placeholders: 'raw' });
    const view = aborting.createRootedFileSystem(route);
    const controller = new AbortController();
    const listing = view.statTree!('models', { signal: controller.signal });
    expect(await Promise.race([listing, waiting()])).toBe('waiting');
    controller.abort(new Error('stopped'));
    await expect(listing).rejects.toThrow('stopped');
    aborting.dispose();
  });
});

describe('expected entries (D10)', () => {
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
});
