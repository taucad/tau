// oxlint-disable-next-line import/no-unassigned-import -- Side-effect import to polyfill IndexedDB for tests
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChangeEventBus } from '#change-event-bus.js';
import { composeView } from '#composed-view.js';
import { withReadContentOps } from '#content-ops/read-ops.js';
import { MountTable } from '#mount-table.js';
import { tauPathPolicy } from '#path-registry.js';
import { PendingContentError, pendingObjectOf } from '#pending-content.js';
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

const createService = async (pendingStallMilliseconds?: number): Promise<WorkspaceFileService> => {
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
  return created;
};

/* What the revision layer, the placeholders' only writer, declares of the checkout. */
const declarePart = async (on: WorkspaceFileService): Promise<void> => {
  const placeholder = { object: { oid, size: part.byteLength }, pointerSize: pointer.byteLength };
  await on.createRootedFileSystem(route, undefined, { placeholders: 'raw' }).declarePending!(
    new Map([['models/part.step', placeholder]]),
  );
};

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

  it('should answer a pointer nobody declared as the text it is, in a stat and a read alike', async () => {
    const view = service.createRootedFileSystem(route);
    const stat = await view.stat('models/part.step');
    expect(stat).toMatchObject({ size: pointer.byteLength });
    expect(stat).not.toHaveProperty('pending');
    expect(await view.readFile('models/part.step')).toStrictEqual(pointer);
    expect(await view.pendingPaths!(['models/part.step'])).toStrictEqual([]);
  });

  it('should refuse a declared placeholder whose object cannot be had, never answering the pointer (I7)', async () => {
    const raw = service.createRootedFileSystem(route, undefined, { placeholders: 'raw' });
    await raw.declarePending!(new Map([['models/part.step', placeholder]]));
    await expect(service.createRootedFileSystem(route).readFile('models/part.step')).rejects.toMatchObject({
      code: 'PENDING',
    });
  });

  /* A checkout edited from outside between the revision layer's looks: the read asks once, and the mark follows. */
  it('should mark an undeclared pointer a read finds to be a placeholder, so the next stat agrees', async () => {
    const source = vi.fn<PendingObjectSource>(async () => part);
    service.setPendingObjectSource(source);
    const view = service.createRootedFileSystem(route);
    await view.statTree!('');
    expect(await view.stat('models/part.step')).toMatchObject({ size: pointer.byteLength });
    expect(await view.readFile('models/part.step')).toStrictEqual(part);
    expect(await view.stat('models/part.step')).toMatchObject({ size: part.byteLength, pending: true });
    /* A write replaces the pointer and ends the mark. */
    await view.writeFile('models/part.step', 'mine');
    const written = await view.stat('models/part.step');
    expect(written).toMatchObject({ size: 4 });
    expect(written).not.toHaveProperty('pending');
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
  const waiting = async (): Promise<'waiting'> =>
    new Promise((resolve) => {
      setTimeout(() => {
        resolve('waiting');
      }, 20);
    });

  it('should hold a file the size of a pointer until the revision layer declares the root, and no other', async () => {
    const raw = service.createRootedFileSystem(route, undefined, { placeholders: 'raw' });
    const view = service.createRootedFileSystem(route);
    raw.awaitDeclaration!();
    expect(await view.stat('main.scad')).toMatchObject({ size: 27 });
    const statting = view.stat('models/part.step');
    const listing = view.statTree!('models');
    expect(await Promise.race([statting, waiting()])).toBe('waiting');
    expect(await Promise.race([listing, waiting()])).toBe('waiting');
    /* The raw view, the revision layer's own, is never held. */
    expect(await raw.stat('models/part.step')).toMatchObject({ size: pointer.byteLength });
    await raw.declarePending!(new Map([['models/part.step', placeholder]]));
    expect(await statting).toMatchObject({ size: part.byteLength, pending: true });
    const listed = await listing;
    expect(listed.find((row) => row.path === 'part.step')).toMatchObject({ size: part.byteLength });
    /* Declared once, the marks alone answer. */
    await raw.writeFile('notes/pointer.txt', pointer);
    expect(await view.stat('notes/pointer.txt')).toMatchObject({ size: pointer.byteLength });
  });

  it('should refuse with PENDING, never answering a small file, when the word does not come within the bound', async () => {
    const bounded = await createService(30);
    const raw = bounded.createRootedFileSystem(route, undefined, { placeholders: 'raw' });
    const view = bounded.createRootedFileSystem(route);
    raw.awaitDeclaration!();
    await expect(view.stat('models/part.step')).rejects.toMatchObject({ code: 'PENDING' });
    await expect(view.readFile('models/part.step')).rejects.toMatchObject({ code: 'PENDING' });
    bounded.dispose();
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
