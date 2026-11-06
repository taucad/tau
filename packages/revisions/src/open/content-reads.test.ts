import { describe, expect, it, vi } from 'vitest';
import { lfsPointerFor } from '#lfs.js';
import type { LargeObjectLook } from '#large-object-fill.js';
import type { ContentReadsDependencies } from '#open/content-reads.js';
import { createContentReads, PendingError } from '#open/content-reads.js';
import type { Checkout } from '#revision-port.js';
import type { RevisionFileSystem } from '#revision-effects.types.js';

const encoder = new TextEncoder();
const place: Checkout = {
  id: 'live',
  projectId: 'p',
  root: '/projects/p',
  kind: 'live',
  branch: 'main',
  baseRevisionId: undefined,
};
const part = encoder.encode('solid part');
const { pointer, bytes: pointerBytes } = lfsPointerFor(part);

/* A checkout as a map of files, a store, and a fill the test drives. */
const setup = (changes: Partial<ContentReadsDependencies> = {}) => {
  const files = new Map<string, Uint8Array<ArrayBuffer>>([
    ['main.scad', encoder.encode('cube(1);')],
    ['models/part.step', pointerBytes],
  ]);
  const stored = new Map<string, Uint8Array<ArrayBuffer>>();
  let look: LargeObjectLook | undefined;
  const arrived = Promise.withResolvers<Uint8Array<ArrayBuffer> | undefined>();
  const filesystem = {
    readFile: vi.fn(async (path: string) => {
      if (path === 'models') {
        throw Object.assign(new Error('directory'), { code: 'EISDIR' });
      }
      const content = files.get(path);
      if (content === undefined) {
        throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      }
      return content;
    }),
  } as unknown as RevisionFileSystem;
  const written = vi.fn<ContentReadsDependencies['fill']['written']>(async () => 'idle');
  const startFill = vi.fn(async () => undefined);
  const prioritize = vi.fn();
  const reads = createContentReads({
    useFileSystem: async (_place, operation) => operation(filesystem),
    readStoredObject: async ({ oid }) => stored.get(oid),
    fill: {
      look: () => look,
      arrival: async (_id, _oid, signal) =>
        Promise.race([
          arrived.promise,
          new Promise<never>((_resolve, reject) => {
            signal?.addEventListener('abort', () => {
              reject(signal.reason as Error);
            });
          }),
        ]),
      written,
      prioritize,
    },
    startFill,
    ...changes,
  });
  return {
    reads,
    prioritize,
    files,
    stored,
    written,
    startFill,
    setLook: (next: LargeObjectLook | undefined) => {
      look = next;
    },
    arrive: (content: Uint8Array<ArrayBuffer>) => {
      arrived.resolve(content);
    },
  };
};

describe('readContent (D9)', () => {
  it('reads an ordinary file as it is, and says missing or directory rather than empty', async () => {
    const { reads } = setup();
    expect(await reads.readContent(place, 'main.scad')).toStrictEqual({
      outcome: 'bytes',
      data: encoder.encode('cube(1);'),
    });
    expect(await reads.readContent(place, 'gone.scad')).toStrictEqual({ outcome: 'missing' });
    expect(await reads.readContent(place, 'models')).toStrictEqual({ outcome: 'directory' });
  });

  it('resolves a placeholder to its object from the store, never its pointer text', async () => {
    const { reads, stored } = setup();
    stored.set(pointer.oid, part);
    expect(await reads.readContent(place, 'models/part.step')).toStrictEqual({ outcome: 'bytes', data: part });
  });

  it('reads a pointer the attributes do not track as the text it is, as adoption decides (W4 review 8)', async () => {
    const { reads, files, stored } = setup();
    stored.set(pointer.oid, part);
    files.set('notes/pointer.txt', pointerBytes);
    expect(await reads.readContent(place, 'notes/pointer.txt')).toStrictEqual({ outcome: 'bytes', data: pointerBytes });
    await expect(reads.materialize(place, ['notes/pointer.txt'])).resolves.toBeUndefined();
    /* Tracked by the project's attributes, the same pointer is a placeholder. */
    files.set(
      '.gitattributes',
      encoder.encode(
        '# BEGIN Tau generated — large objects are git LFS objects\n/notes/pointer.txt filter=lfs diff=lfs merge=lfs -text\n# END Tau generated\n',
      ),
    );
    expect(await reads.readContent(place, 'notes/pointer.txt')).toStrictEqual({ outcome: 'bytes', data: part });
  });

  it('serves an object that has landed and is not written yet', async () => {
    const { reads, setLook } = setup();
    setLook({ state: 'filling', bytes: part });
    expect(await reads.readContent(place, 'models/part.step')).toStrictEqual({ outcome: 'bytes', data: part });
  });

  it('answers a typed pending outcome for an object that is not here', async () => {
    const { reads, setLook } = setup();
    expect(await reads.readContent(place, 'models/part.step')).toStrictEqual({
      outcome: 'pending',
      oid: pointer.oid,
      size: pointer.size,
      reason: 'not-fetched',
    });
    setLook({ state: 'filling' });
    expect(await reads.readContent(place, 'models/part.step')).toMatchObject({ reason: 'filling' });
    setLook({ state: 'failed' });
    expect(await reads.readContent(place, 'models/part.step')).toMatchObject({ reason: 'not-fetched' });
  });

  it('says offline when the host cannot reach its remote', async () => {
    const { reads } = setup({ online: () => false });
    expect(await reads.readContent(place, 'models/part.step')).toMatchObject({ reason: 'offline' });
  });

  it('waits a bounded time for an object a running fill is fetching', async () => {
    const { reads, setLook, arrive } = setup();
    setLook({ state: 'filling' });
    expect(await reads.readContent(place, 'models/part.step', { wait: 5 })).toMatchObject({ outcome: 'pending' });
    const reading = reads.readContent(place, 'models/part.step', { wait: 10_000 });
    arrive(part);
    expect(await reading).toStrictEqual({ outcome: 'bytes', data: part });
  });
});

describe('materialize (D9)', () => {
  it('does nothing for paths that hold no placeholder', async () => {
    const { reads, written } = setup();
    await reads.materialize(place, ['main.scad', 'gone.scad']);
    expect(written).not.toHaveBeenCalled();
  });

  it('waits for the fill to write the placeholders, promoting them', async () => {
    const { reads, files, written } = setup();
    written.mockImplementation(async () => {
      files.set('models/part.step', part);
      return 'written';
    });
    await reads.materialize(place, ['main.scad', 'models/part.step']);
    expect(written).toHaveBeenCalledExactlyOnceWith('live', ['models/part.step'], { stall: 60_000 });
  });

  it('starts a fill on a checkout with none running', async () => {
    const { reads, files, written, startFill } = setup();
    written.mockResolvedValueOnce('idle').mockImplementationOnce(async () => {
      files.set('models/part.step', part);
      return 'written';
    });
    await reads.materialize(place, ['models/part.step']);
    expect(startFill).toHaveBeenCalledOnce();
  });

  it('throws PendingError when the transfer fails, or no fill ever writes it', async () => {
    const failed = setup();
    failed.written.mockResolvedValue('failed');
    await expect(failed.reads.materialize(place, ['models/part.step'])).rejects.toBeInstanceOf(PendingError);
    const idle = setup();
    await expect(idle.reads.materialize(place, ['models/part.step'])).rejects.toMatchObject({
      path: 'models/part.step',
      reason: 'not-fetched',
    });
    /* Bounded: an idle checkout is not started forever. */
    expect(idle.startFill.mock.calls.length).toBeLessThanOrEqual(3);
  });

  it('gives up with PendingError on a fill that stalls, passing its stall bound (W4 review 5)', async () => {
    const { reads, written } = setup();
    written.mockResolvedValue('stalled');
    await expect(reads.materialize(place, ['models/part.step'], { stallMilliseconds: 5 })).rejects.toBeInstanceOf(
      PendingError,
    );
    expect(written).toHaveBeenCalledWith('live', ['models/part.step'], { stall: 5 });
  });

  it('stops on its signal', async () => {
    const { reads, written } = setup();
    const controller = new AbortController();
    written.mockImplementation(async (_id, _paths, wait) => {
      wait?.signal?.throwIfAborted();
      return 'idle';
    });
    controller.abort(new Error('closed'));
    await expect(reads.materialize(place, ['models/part.step'], { signal: controller.signal })).rejects.toThrow(
      'closed',
    );
  });
});

describe('resolvePlaceholder (slice a)', () => {
  it('answers a placeholder’s object from the store, else fetched by its oid, writing nothing', async () => {
    const fetchObject = vi.fn(async () => part);
    const { reads, files, stored } = setup({ fetchObject });
    expect(await reads.resolvePlaceholder(place, 'models/part.step')).toStrictEqual(part);
    expect(fetchObject).toHaveBeenCalledWith(pointer, undefined);
    expect(files.get('models/part.step')).toStrictEqual(pointerBytes);
    stored.set(pointer.oid, part);
    fetchObject.mockClear();
    expect(await reads.resolvePlaceholder(place, 'models/part.step')).toStrictEqual(part);
    expect(fetchObject).not.toHaveBeenCalled();
  });

  it('answers undefined for a path that holds no placeholder, and PendingError when nothing has the object', async () => {
    const { reads, files } = setup({ fetchObject: async () => undefined });
    expect(await reads.resolvePlaceholder(place, 'main.scad')).toBeUndefined();
    files.set('notes/pointer.txt', pointerBytes);
    expect(await reads.resolvePlaceholder(place, 'notes/pointer.txt')).toBeUndefined();
    await expect(reads.resolvePlaceholder(place, 'models/part.step')).rejects.toBeInstanceOf(PendingError);
  });

  it('moves the path to the front of the fill and hears the transfer progress, without a signal of its own', async () => {
    const fetchObject = vi.fn<NonNullable<ContentReadsDependencies['fetchObject']>>(async (_pointer, onProgress) => {
      onProgress?.();
      return part;
    });
    const { reads, prioritize } = setup({ fetchObject });
    const onProgress = vi.fn();
    const controller = new AbortController();
    expect(
      await reads.resolvePlaceholder(place, 'models/part.step', { signal: controller.signal, onProgress }),
    ).toStrictEqual(part);
    expect(prioritize).toHaveBeenCalledWith(place.id, ['models/part.step']);
    expect(fetchObject).toHaveBeenCalledWith(pointer, onProgress);
    expect(onProgress).toHaveBeenCalledTimes(1);
  });

  it('answers a copy’s target from the pointer it is given, and from this device alone when asked', async () => {
    const fetchObject = vi.fn(async () => part);
    const { reads, stored } = setup({ fetchObject });
    /* Not on disk yet: the pointer the copy carries decides. */
    await expect(
      reads.resolvePlaceholder(place, 'models/copy.step', { pointer: pointerBytes, localOnly: true }),
    ).rejects.toBeInstanceOf(PendingError);
    expect(await reads.resolvePlaceholder(place, 'notes/copy.txt', { pointer: pointerBytes })).toBeUndefined();
    expect(fetchObject).not.toHaveBeenCalled();
    stored.set(pointer.oid, part);
    expect(
      await reads.resolvePlaceholder(place, 'models/copy.step', { pointer: pointerBytes, localOnly: true }),
    ).toStrictEqual(part);
  });
});
