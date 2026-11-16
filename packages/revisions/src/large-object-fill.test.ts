import { describe, expect, it, vi } from 'vitest';
import { ImmutableRevisionTree, revisionId } from '#algorithms/index.js';
import {
  createLargeObjectFill,
  declaredPlaceholders,
  largeObjectPlaceholders,
  UnstoredLargeObjectsError,
} from '#large-object-fill.js';
import { lfsPointerFor } from '#lfs.js';
import type { FillPathContent } from '#large-object-fill.js';
import type { LargeObjectsReport } from '#project-revisions.types.js';
import { RevisionPortError } from '#revision-port.js';
import type { Checkout, ReadTreeOptions } from '#revision-port.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const place: Checkout = {
  id: 'live',
  projectId: 'p1',
  root: '/projects/p1',
  kind: 'live',
  branch: 'main',
  baseRevisionId: undefined,
};
const head = revisionId('a'.repeat(40));

const parts = { 'models/a.step': 'solid a', 'models/b.step': 'solid bb' } as const;
const pointerOf = (content: string): ReturnType<typeof lfsPointerFor> => lfsPointerFor(encoder.encode(content));
const tracksStep = '*.step filter=lfs diff=lfs merge=lfs -text\n';

/* A checkout as a map of files, a fence that runs in turn, and a port whose transfer the test drives. */
const setup = (
  options: Readonly<{
    flushBytes?: number;
    flushMilliseconds?: number;
    byOid?: boolean;
    retryMilliseconds?: number[];
    /* The checkout's attributes, and whether its repository folds case (`core.ignoreCase`). */
    attributes?: string;
    ignoreCase?: boolean;
    /* Ordinary files beside the placeholders, which a flush never has to touch (#2010). */
    plainFiles?: number;
    /* Files the checkout-wide look leaves out (as it leaves out an ignored file) while a path read still sees them. */
    unlooked?: readonly string[];
    /* The checkout lands objects from the host's store (W11.3): a flush names each by its oid. */
    fromStore?: boolean;
  }> = {},
) => {
  const files = new Map<string, Uint8Array<ArrayBuffer>>([
    ['.gitattributes', encoder.encode(options.attributes ?? tracksStep)],
    ['main.scad', encoder.encode('import("models/a.step");')],
  ]);
  /* A pointer the attributes do not track: a person's text, committed as it is. */
  files.set('notes/pointer.txt', pointerOf('solid a').bytes);
  for (const [path, content] of Object.entries(parts)) {
    files.set(path, pointerOf(content).bytes);
  }
  for (let index = 0; index < (options.plainFiles ?? 0); index++) {
    files.set(`src/part-${String(index)}.scad`, encoder.encode(`cube(${String(index)});`));
  }
  /* Every path a flush read or wrote: what its cost grows with. */
  let pathsRead = 0;
  let pathsWritten = 0;
  const reports: LargeObjectsReport[] = [];
  let onLargeObject: ReadTreeOptions['onLargeObject'];
  let signal: AbortSignal | undefined;
  let finish: (tree: ImmutableRevisionTree) => void = () => undefined;
  let fail: (error: Error) => void = () => undefined;
  const readTree = vi.fn(
    async (_id: unknown, options?: ReadTreeOptions) =>
      new Promise<ImmutableRevisionTree>((resolve, reject) => {
        onLargeObject = options?.onLargeObject;
        signal = options?.signal;
        signal?.addEventListener('abort', () => {
          reject(signal?.reason as Error);
        });
        finish = resolve;
        fail = reject;
      }),
  );
  /* Fetches by pointer alone, answered by the test as the remote would: the network may be down. */
  let fetched: PromiseWithResolvers<ReadonlyMap<string, Uint8Array<ArrayBuffer>>> | undefined;
  const fetchLargeObjects = vi.fn(
    async (
      _pointers: ReadonlyArray<Readonly<{ oid: string; size: number }>>,
      fetchOptions?: Pick<ReadTreeOptions, 'onLargeObject' | 'signal'>,
    ) => {
      onLargeObject = fetchOptions?.onLargeObject;
      fetched = Promise.withResolvers();
      return fetched.promise;
    },
  );
  /* Writers that move the checkout under the next materialization, as an editor's save would. */
  let conflicts = 0;
  const fullTree = (): ImmutableRevisionTree =>
    new ImmutableRevisionTree([
      ['.gitattributes', files.get('.gitattributes')!],
      ['main.scad', files.get('main.scad')!],
      ['notes/pointer.txt', files.get('notes/pointer.txt')!],
      ...Object.entries(parts).map(([path, content]) => [path, encoder.encode(content)] as const),
    ]);
  /* Flushes that read the checkout, and looks for every placeholder it holds. */
  let sweeps = 0;
  let looks = 0;
  /* What ran when, so a test can tell a look from a write that overlapped it. */
  const events: string[] = [];
  /* Whole-checkout looks still to throw, as a look over an index that cannot open does. */
  let failingLooks = 0;
  const placeholders = async (): Promise<ReturnType<typeof largeObjectPlaceholders>> => {
    looks += 1;
    if (failingLooks > 0) {
      failingLooks -= 1;
      throw new Error('The checkout could not be listed.');
    }
    events.push('look');
    /* A look takes a while, as one over a real checkout does. */
    await new Promise((resolve) => {
      setTimeout(resolve, 5);
    });
    events.push('looked');
    return largeObjectPlaceholders(
      new ImmutableRevisionTree(
        [...files]
          .filter(([path]) => !(options.unlooked ?? []).includes(path))
          .map(([path, content]) => [path, content] as const),
      ),
      options.ignoreCase === undefined ? {} : { ignoreCase: options.ignoreCase },
    );
  };
  const readPaths = async (_place: Checkout, paths: readonly string[]): Promise<Map<string, FillPathContent>> => {
    sweeps += 1;
    pathsRead += paths.length;
    return new Map(
      paths.flatMap((path) => {
        const content = files.get(path);
        return content === undefined ? [] : [[path, { content, mode: '100644' }] as const];
      }),
    );
  };
  /* The checkout's fence, which another writer may hold; free by default. */
  let fence: Promise<void> = Promise.resolve();
  /* A gate the test may close, so a materialization waits like a slow OPFS write; open by default. */
  let gate: Promise<void> = Promise.resolve();
  let writing = 0;
  let mostWriting = 0;
  const materializeTree = vi.fn(
    async (
      _place: Checkout,
      target: ImmutableRevisionTree,
      materialization?: Readonly<{ largeObjects?: ReadonlyMap<string, Readonly<{ oid: string }>> }>,
    ) => {
      events.push('write');
      writing += 1;
      mostWriting = Math.max(mostWriting, writing);
      try {
        await gate;
      } finally {
        writing -= 1;
      }
      if (conflicts > 0) {
        conflicts -= 1;
        throw new RevisionPortError('CHECKOUT_CONFLICT', 'These files changed while they were written.');
      }
      for (const { path, content } of target.entries()) {
        pathsWritten += 1;
        const object = materialization?.largeObjects?.get(path)?.oid;
        const stored = Object.values(parts).find((part) => pointerOf(part).pointer.oid === object);
        files.set(path, stored === undefined ? content : encoder.encode(stored));
      }
      events.push('wrote');
    },
  );
  const declareFilled = vi.fn(async (_place: Checkout, _paths: readonly string[]) => undefined);
  const fill = createLargeObjectFill({
    port: options.byOid === true ? { readTree, fetchLargeObjects } : { readTree },
    placeholders,
    readPaths,
    declareFilled,
    withCheckoutFence: async (_id, operation) => {
      await fence;
      return operation();
    },
    materializeTree,
    ...(options.fromStore === true ? { landsFromStore: async () => true } : {}),
    report: (report) => reports.push(report),
    flushMilliseconds: options.flushMilliseconds ?? 1,
    reportMilliseconds: 1,
    /* A failed fill retries on its own; a test that does not drive it waits longer than it runs. */
    retryMilliseconds: options.retryMilliseconds ?? [60_000],
    ...(options.flushBytes === undefined ? {} : { flushBytes: options.flushBytes }),
    ...(options.ignoreCase === undefined
      ? {}
      : { attributesReading: async () => ({ ignoreCase: options.ignoreCase }) }),
  });
  const land = (path: keyof typeof parts): void => {
    onLargeObject?.(pointerOf(parts[path]).pointer.oid, encoder.encode(parts[path]));
  };
  const text = (path: string): string => decoder.decode(files.get(path));
  return {
    onLargeObject: (oid: string, content: Uint8Array<ArrayBuffer>): void => {
      onLargeObject?.(oid, content);
    },
    files,
    reports,
    readTree,
    fetchLargeObjects,
    fetched: () => fetched,
    materializeTree,
    fill,
    land,
    finish: (tree: ImmutableRevisionTree) => {
      finish(tree);
    },
    fail: (error: Error) => {
      fail(error);
    },
    fullTree,
    text,
    signal: () => signal,
    conflictNext: (count: number) => {
      conflicts = count;
    },
    holdWrites: (): (() => void) => {
      const held = Promise.withResolvers<void>();
      gate = held.promise;
      return () => {
        gate = Promise.resolve();
        held.resolve();
      };
    },
    mostWriting: () => mostWriting,
    events,
    failLooks: (count: number) => {
      failingLooks = count;
    },
    holdFence: (): (() => void) => {
      const held = Promise.withResolvers<void>();
      fence = held.promise;
      return () => {
        fence = Promise.resolve();
        held.resolve();
      };
    },
    /** How many flushes have read the checkout (only the paths each one fills). */
    captures: () => sweeps,
    /** How many times the fill looked for every placeholder the checkout holds. */
    looks: () => looks,
    pathsRead: () => pathsRead,
    declareFilled,
    pathsWritten: () => pathsWritten,
  };
};

describe('large-object fill', () => {
  /* One rule on every leg: a pointer is a placeholder exactly where the tree's attributes files track it, as git decides. */
  it('finds a pointer the attributes track as a placeholder, nested files among them, and nothing else', () => {
    const tree = new ImmutableRevisionTree([
      ['.gitattributes', encoder.encode(tracksStep)],
      ['main.scad', encoder.encode('cube(1);')],
      ['models/a.step', pointerOf('solid a').bytes],
      ['notes/pointer.txt', pointerOf('solid a').bytes],
      ['vendor/.gitattributes', encoder.encode('*.bin filter=lfs diff=lfs merge=lfs -text\n*.step -filter\n')],
      ['vendor/blob.bin', pointerOf('blob').bytes],
      ['vendor/plain.step', pointerOf('solid p').bytes],
      ['other/blob.bin', pointerOf('blob').bytes],
    ]);
    expect([...largeObjectPlaceholders(tree).keys()].toSorted()).toStrictEqual(['models/a.step', 'vendor/blob.bin']);
  });

  /* A repository that folds case reads `*.STEP` as git does there: the fill and the declaration name the same files. */
  it('folds case in the attributes where the repository does, on the fill and the declaration alike', async () => {
    const tracksUpper = '*.STEP filter=lfs diff=lfs merge=lfs -text\n';
    const tree = new ImmutableRevisionTree([
      ['.gitattributes', encoder.encode(tracksUpper)],
      ['models/a.step', pointerOf('solid a').bytes],
    ]);
    expect([...largeObjectPlaceholders(tree).keys()]).toStrictEqual([]);
    expect([...largeObjectPlaceholders(tree, { ignoreCase: true }).keys()]).toStrictEqual(['models/a.step']);
    expect([...declaredPlaceholders(tree, { reading: { ignoreCase: true } }).keys()]).toStrictEqual(['models/a.step']);
    const harness = setup({ attributes: tracksUpper, ignoreCase: true });
    const done = harness.fill.fill(place, head);
    await vi.waitFor(() => {
      expect(harness.readTree).toHaveBeenCalled();
    });
    expect(harness.reports[0]?.facet?.paths).toStrictEqual(['models/a.step', 'models/b.step']);
    harness.finish(harness.fullTree());
    await done;
    expect(harness.text('models/a.step')).toBe('solid a');
  });

  it('leaves a pointer the attributes do not track to the person, never fetching or writing it', async () => {
    const harness = setup();
    const done = harness.fill.fill(place, head);
    await vi.waitFor(() => {
      expect(harness.readTree).toHaveBeenCalled();
    });
    expect(harness.reports[0]?.facet?.paths).toStrictEqual(['models/a.step', 'models/b.step']);
    harness.finish(harness.fullTree());
    await done;
    for (const call of harness.materializeTree.mock.calls) {
      expect(
        call[1].has('notes/pointer.txt') ? call[1].get('notes/pointer.txt') : pointerOf('solid a').bytes,
      ).toStrictEqual(pointerOf('solid a').bytes);
    }
    expect(harness.files.get('notes/pointer.txt')).toStrictEqual(pointerOf('solid a').bytes);
  });

  /* D10: a host reads `filled` only from the fill's word, never from its silence. */
  it('tells its pointers before it asks for the first object', async () => {
    const harness = setup();
    const done = harness.fill.fill(place, head);
    await vi.waitFor(() => {
      expect(harness.readTree).toHaveBeenCalled();
    });
    expect(harness.reports[0]?.facet).toMatchObject({
      phase: 'fetching',
      paths: ['models/a.step', 'models/b.step'],
      objects: 0,
    });
    harness.finish(harness.fullTree());
    await done;
    expect(harness.reports.at(-1)?.facet).toBeUndefined();
  });

  /* D10: an opened path jumps the fill queue, and is written the moment its object lands. */
  it('asks for an opened path’s object first and writes it without waiting for the timer', async () => {
    const harness = setup({ flushMilliseconds: 60_000 });
    const done = harness.fill.fill(place, head);
    await vi.waitFor(() => {
      expect(harness.readTree).toHaveBeenCalled();
    });
    const first = harness.readTree.mock.calls[0]?.[1]?.firstLargeObjects;
    expect([...(first?.() ?? [])]).toStrictEqual([]);
    harness.reports.at(-1)?.prioritize(['models/b.step', 'main.scad', 'missing.step']);
    expect([...(first?.() ?? [])]).toStrictEqual([pointerOf(parts['models/b.step']).pointer.oid]);
    harness.land('models/a.step');
    harness.land('models/b.step');
    /* Long before the minute-long timer: the flush also writes whatever else has landed. */
    await vi.waitFor(() => {
      expect(harness.text('models/b.step')).toBe('solid bb');
    });
    harness.finish(harness.fullTree());
    await done;
    expect(harness.text('models/a.step')).toBe('solid a');
  });

  it('writes an opened path at once when its object has already landed', async () => {
    const harness = setup({ flushMilliseconds: 60_000 });
    const done = harness.fill.fill(place, head);
    await vi.waitFor(() => {
      expect(harness.readTree).toHaveBeenCalled();
    });
    harness.land('models/a.step');
    await new Promise((resolve) => {
      setTimeout(resolve, 5);
    });
    expect(harness.files.get('models/a.step')).toStrictEqual(pointerOf('solid a').bytes);
    harness.reports.at(-1)?.prioritize(['models/a.step']);
    await vi.waitFor(() => {
      expect(harness.text('models/a.step')).toBe('solid a');
    });
    harness.finish(harness.fullTree());
    await done;
  });

  it('writes a promoted object past the byte bound of a flush', async () => {
    const harness = setup({ flushBytes: 1, flushMilliseconds: 60_000 });
    const done = harness.fill.fill(place, head);
    await vi.waitFor(() => {
      expect(harness.readTree).toHaveBeenCalled();
    });
    harness.reports.at(-1)?.prioritize(['models/a.step', 'models/b.step']);
    harness.land('models/a.step');
    harness.land('models/b.step');
    await vi.waitFor(() => {
      expect(harness.text('models/a.step')).toBe('solid a');
      expect(harness.text('models/b.step')).toBe('solid bb');
    });
    expect(harness.materializeTree.mock.calls.length).toBeLessThanOrEqual(2);
    harness.finish(harness.fullTree());
    await done;
  });

  /* D9: what a read and `materialize` ask of a running fill. */
  it('says what it knows of an object: coming, landed, or not its to fetch', async () => {
    const harness = setup({ flushMilliseconds: 60_000 });
    const done = harness.fill.fill(place, head);
    await vi.waitFor(() => {
      expect(harness.readTree).toHaveBeenCalled();
    });
    const { oid } = pointerOf('solid a').pointer;
    expect(harness.fill.look(place.id, oid)).toStrictEqual({ state: 'filling' });
    expect(harness.fill.look(place.id, 'f'.repeat(64))).toBeUndefined();
    expect(harness.fill.look('other', oid)).toBeUndefined();
    const arriving = harness.fill.arrival(place.id, oid);
    harness.land('models/a.step');
    expect(decoder.decode(await arriving)).toBe('solid a');
    expect(harness.fill.look(place.id, oid)).toStrictEqual({ state: 'filling', bytes: encoder.encode('solid a') });
    harness.finish(harness.fullTree());
    await done;
    expect(harness.fill.look(place.id, oid)).toBeUndefined();
    expect(await harness.fill.arrival(place.id, oid)).toBeUndefined();
  });

  it('answers `written` once the paths hold their bytes, promoting them first', async () => {
    const harness = setup({ flushMilliseconds: 60_000 });
    const done = harness.fill.fill(place, head);
    await vi.waitFor(() => {
      expect(harness.readTree).toHaveBeenCalled();
    });
    const writing = harness.fill.written(place.id, ['models/b.step']);
    expect([...(harness.readTree.mock.calls[0]?.[1]?.firstLargeObjects?.() ?? [])]).toStrictEqual([
      pointerOf('solid bb').pointer.oid,
    ]);
    harness.land('models/b.step');
    expect(await writing).toBe('written');
    expect(harness.text('models/b.step')).toBe('solid bb');
    harness.finish(harness.fullTree());
    await done;
    expect(await harness.fill.written(place.id, ['models/a.step'])).toBe('idle');
  });

  it('answers `failed` when the transfer fails first, and stops waiting on its signal', async () => {
    const harness = setup();
    const done = harness.fill.fill(place, head);
    await vi.waitFor(() => {
      expect(harness.readTree).toHaveBeenCalled();
    });
    const controller = new AbortController();
    const aborted = harness.fill.written(place.id, ['models/a.step'], { signal: controller.signal });
    controller.abort(new Error('closed'));
    await expect(aborted).rejects.toThrow('closed');
    const writing = harness.fill.written(place.id, ['models/a.step']);
    harness.fail(new Error('offline'));
    expect(await writing).toBe('failed');
    await done;
  });

  it('answers `stalled` when the transfer makes no progress for the stall bound, and waits while it does (W4 review 5)', async () => {
    const harness = setup({ flushMilliseconds: 60_000 });
    const done = harness.fill.fill(place, head);
    await vi.waitFor(() => {
      expect(harness.readTree).toHaveBeenCalled();
    });
    const waiting = harness.fill.written(place.id, ['models/a.step', 'models/b.step'], { stall: 200 });
    const delay = async (milliseconds: number): Promise<'waiting'> => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, milliseconds);
      });
      return 'waiting';
    };
    /* An arrival is progress: the bound starts again. */
    await delay(120);
    harness.land('models/a.step');
    /* 240 ms in: past the bound from the start, within it from the arrival. */
    expect(await Promise.race([waiting, delay(120)])).toBe('waiting');
    expect(await waiting).toBe('stalled');
    harness.finish(harness.fullTree());
    await done;
  });

  it('gives its word once on a checkout with nothing to fill', async () => {
    const harness = setup();
    harness.files.set('models/a.step', encoder.encode(parts['models/a.step']));
    harness.files.set('models/b.step', encoder.encode(parts['models/b.step']));
    await harness.fill.fill(place, head);
    expect(harness.reports.map((report) => report.facet)).toStrictEqual([undefined]);
    await harness.fill.resume(place, head);
    expect(harness.reports).toHaveLength(1);
    expect(harness.readTree).not.toHaveBeenCalled();
  });

  it('writes each object as it lands, tells its progress, and reports done', async () => {
    const harness = setup();
    const done = harness.fill.fill(place, head);
    await vi.waitFor(() => {
      expect(harness.readTree).toHaveBeenCalled();
    });
    expect(harness.reports.at(-1)?.facet).toStrictEqual({
      phase: 'fetching',
      paths: ['models/a.step', 'models/b.step'],
      objects: 0,
      totalObjects: 2,
      bytes: 0,
      totalBytes: 'solid a'.length + 'solid bb'.length,
    });
    harness.land('models/a.step');
    await vi.waitFor(() => {
      expect(harness.text('models/a.step')).toBe('solid a');
    });
    await vi.waitFor(() => {
      expect(harness.reports.at(-1)?.facet).toMatchObject({ paths: ['models/b.step'], objects: 1 });
    });
    /* Not landed yet: still its pointer, never anything else. */
    expect(harness.files.get('models/b.step')).toStrictEqual(pointerOf('solid bb').bytes);
    harness.land('models/b.step');
    harness.finish(harness.fullTree());
    await done;
    expect(harness.text('models/b.step')).toBe('solid bb');
    expect(harness.text('main.scad')).toBe('import("models/a.step");');
    expect(harness.reports.at(-1)?.facet).toBeUndefined();
  });

  it('writes at most one batch of bytes per flush, and the rest in the flush right after', async () => {
    /* Each object is 7 or 8 bytes: a 10-byte batch holds one of them. */
    const harness = setup({ flushBytes: 10, flushMilliseconds: 60_000 });
    const done = harness.fill.fill(place, head);
    await vi.waitFor(() => {
      expect(harness.readTree).toHaveBeenCalled();
    });
    harness.land('models/a.step');
    harness.land('models/b.step');
    /* Two objects reach the batch: the flush starts without waiting out the minute-long timer. */
    await vi.waitFor(() => {
      expect(harness.text('models/a.step')).toBe('solid a');
      expect(harness.text('models/b.step')).toBe('solid bb');
    });
    /* What each flush filled: the model paths that hold real bytes now and held a pointer before it. */
    const filledSoFar = harness.materializeTree.mock.calls.map(([, target]) =>
      target
        .entries()
        .filter(({ path, content }) => path.startsWith('models/') && !decoder.decode(content).startsWith('version '))
        .map(({ path }) => path),
    );
    const written = filledSoFar.map((paths, index) =>
      paths.filter((path) => !(filledSoFar[index - 1] ?? []).includes(path)),
    );
    expect(written).toStrictEqual([['models/a.step'], ['models/b.step']]);
    harness.finish(harness.fullTree());
    await done;
    expect(harness.reports.at(-1)?.facet).toBeUndefined();
  });

  /* #2010: a flush reads and writes the placeholders it fills, never the checkout around them. */
  it('reads and writes only the paths each flush fills, however many other files the checkout holds', async () => {
    const harness = setup({ flushBytes: 1, flushMilliseconds: 60_000, plainFiles: 500 });
    const done = harness.fill.fill(place, head);
    await vi.waitFor(() => {
      expect(harness.readTree).toHaveBeenCalled();
    });
    const readBefore = harness.pathsRead();
    const looksBefore = harness.looks();
    harness.land('models/a.step');
    await vi.waitFor(() => {
      expect(harness.text('models/a.step')).toBe('solid a');
    });
    harness.land('models/b.step');
    await vi.waitFor(() => {
      expect(harness.text('models/b.step')).toBe('solid bb');
    });
    /* Two flushes, one object each: what they wrote is those two paths, and what they read is bounded by them. */
    expect(
      harness.materializeTree.mock.calls.map(([, target]) => target.entries().map(({ path }) => path)),
    ).toStrictEqual([['models/a.step'], ['models/b.step']]);
    expect(harness.pathsWritten()).toBe(2);
    /* Each flush says what it filled is no placeholder now, for those paths alone (D9). */
    expect(harness.declareFilled.mock.calls.map(([, paths]) => paths)).toStrictEqual([
      ['models/a.step'],
      ['models/b.step'],
    ]);
    expect(harness.pathsRead() - readBefore).toBeLessThan(20);
    /* The checkout as a whole is looked at once, when the fill's placeholders run out, never per flush. */
    expect(harness.looks() - looksBefore).toBeLessThanOrEqual(1);
    harness.finish(harness.fullTree());
    await done;
    expect(harness.reports.at(-1)?.facet).toBeUndefined();
  });

  /* A flush reads the attributes on its paths' way, so one the person stopped tracking meanwhile stays their text (D9). */
  it('leaves a placeholder whose attributes stopped tracking it meanwhile, reading only the attributes on its way', async () => {
    const harness = setup({ flushMilliseconds: 60_000, flushBytes: 1 });
    const done = harness.fill.fill(place, head);
    await vi.waitFor(() => {
      expect(harness.readTree).toHaveBeenCalled();
    });
    harness.files.set('models/.gitattributes', encoder.encode('*.step -filter\n'));
    harness.land('models/a.step');
    await vi.waitFor(() => {
      expect(harness.captures()).toBe(1);
    });
    harness.land('models/b.step');
    harness.finish(harness.fullTree());
    await done;
    expect(harness.text('models/a.step')).toContain('version https://git-lfs.github.com/spec/v1');
    expect(harness.text('models/b.step')).toContain('version https://git-lfs.github.com/spec/v1');
    expect(harness.materializeTree).not.toHaveBeenCalled();
    expect(harness.reports.at(-1)?.facet).toBeUndefined();
  });

  /* Review of #2010: the flush and the look must not disagree forever over a placeholder; one look per run-out. */
  it('ends when a flush and the look disagree on a placeholder, rather than finding it again and again', async () => {
    const harness = setup({ unlooked: ['models/.gitattributes'] });
    harness.files.set('models/.gitattributes', encoder.encode('*.step -filter\n'));
    const done = harness.fill.fill(place, head);
    await vi.waitFor(() => {
      expect(harness.readTree).toHaveBeenCalled();
    });
    harness.land('models/a.step');
    harness.land('models/b.step');
    harness.finish(harness.fullTree());
    await done;
    await vi.waitFor(() => {
      expect(harness.reports.at(-1)?.facet).toBeUndefined();
    });
    expect(harness.looks()).toBeLessThanOrEqual(3);
    expect(harness.materializeTree).not.toHaveBeenCalled();
  });

  /* Review of #2010: a fill a tree write replaced while its flush waited on the fence writes nothing. */
  it('writes nothing for a fill forgotten while its flush waited on the fence', async () => {
    const harness = setup();
    const done = harness.fill.fill(place, head);
    await vi.waitFor(() => {
      expect(harness.readTree).toHaveBeenCalled();
    });
    const release = harness.holdFence();
    harness.land('models/a.step');
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
    harness.fill.forget(place.id);
    release();
    await done;
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
    expect(harness.captures()).toBe(0);
    expect(harness.materializeTree).not.toHaveBeenCalled();
  });

  /* Review of #2010: a reader that names a copied placeholder's object has it written now, not at the closing look. */
  it('writes a copied placeholder a reader waits on as soon as its object is here', async () => {
    const harness = setup({ flushMilliseconds: 60_000 });
    const done = harness.fill.fill(place, head);
    await vi.waitFor(() => {
      expect(harness.readTree).toHaveBeenCalled();
    });
    harness.files.set('models/copy.step', harness.files.get('models/b.step')!);
    const { oid, size } = pointerOf(parts['models/b.step']).pointer;
    harness.land('models/b.step');
    await expect(harness.fill.written(place.id, [{ path: 'models/copy.step', oid, size }])).resolves.toBe('written');
    expect(harness.text('models/copy.step')).toBe('solid bb');
    /* Its own placeholder `a` is still owed: no closing look has run. */
    expect(harness.text('models/a.step')).not.toBe('solid a');
    harness.land('models/a.step');
    harness.finish(harness.fullTree());
    await done;
    expect(harness.reports.at(-1)?.facet).toBeUndefined();
  });

  /* W11.3: an object the host's store holds is here as much as one in hand: a reader's path is written at once. */
  it('writes a path a reader waits on at once when its object is in the host store, not at the next timer', async () => {
    const harness = setup({ fromStore: true, flushMilliseconds: 60_000 });
    /* Every write conflicts, so the run's own flushes leave both objects for a timer a minute away. */
    harness.conflictNext(3);
    const done = harness.fill.fill(place, head);
    await vi.waitFor(() => {
      expect(harness.readTree).toHaveBeenCalled();
    });
    harness.finish(
      new ImmutableRevisionTree(
        Object.values(parts).map((part, index) => [`p${String(index)}`, pointerOf(part).bytes]),
      ),
    );
    await done;
    expect(harness.text('models/a.step')).not.toBe('solid a');
    await expect(harness.fill.written(place.id, ['models/a.step'], { stall: 1000 })).resolves.toBe('written');
    expect(harness.text('models/a.step')).toBe('solid a');
  });

  /* The failure path's look rewrites what the fill tracks: it waits its turn behind a flush that is writing. */
  it('looks after a failed transfer only once no flush is writing', async () => {
    const harness = setup({ flushMilliseconds: 60_000 });
    const done = harness.fill.fill(place, head);
    await vi.waitFor(() => {
      expect(harness.readTree).toHaveBeenCalled();
    });
    harness.land('models/a.step');
    const release = harness.holdWrites();
    harness.fail(new Error('offline'));
    /* The run's last flush is writing `a`; `b` lands now and an open file asks for it, which queues a flush. */
    await vi.waitFor(() => {
      expect(harness.materializeTree).toHaveBeenCalledTimes(1);
    });
    harness.land('models/b.step');
    harness.fill.prioritize(place.id, ['models/b.step']);
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
    release();
    await done;
    await vi.waitFor(() => {
      expect(harness.text('models/b.step')).toBe('solid bb');
    });
    /* No look began while a write was under way, nor a write while a look ran. */
    const overlapped = harness.events.some(
      (event, index) =>
        (event === 'look' &&
          harness.events.slice(0, index).filter((each) => each === 'write').length >
            harness.events.slice(0, index).filter((each) => each === 'wrote').length) ||
        (event === 'write' &&
          harness.events.slice(0, index).filter((each) => each === 'look').length >
            harness.events.slice(0, index).filter((each) => each === 'looked').length),
    );
    expect(harness.events).toContain('look');
    expect(overlapped).toBe(false);
  });

  /* CodeRabbit on #2357: a path tracked from a reader's word is written only while it still holds a pointer. */
  it('leaves a path a reader named alone once an editor emptied it, before its object landed', async () => {
    const harness = setup({ flushMilliseconds: 60_000 });
    const done = harness.fill.fill(place, head);
    await vi.waitFor(() => {
      expect(harness.readTree).toHaveBeenCalled();
    });
    harness.files.set('models/copy.step', harness.files.get('models/b.step')!);
    const { oid, size } = pointerOf(parts['models/b.step']).pointer;
    const writing = harness.fill.written(place.id, [{ path: 'models/copy.step', oid, size }]);
    /* The person saves the file empty before the object arrives. */
    harness.files.set('models/copy.step', new Uint8Array());
    harness.land('models/b.step');
    await expect(writing).resolves.toBe('written');
    expect(harness.files.get('models/copy.step')?.byteLength).toBe(0);
    expect(harness.text('models/b.step')).toBe('solid bb');
    harness.land('models/a.step');
    harness.finish(harness.fullTree());
    await done;
  });

  /* CodeRabbit on #2357: a closing look that throws is owed, never skipped; the fill is not done without it. */
  it('looks again when its closing look throws, and is never done with a moved placeholder unfilled', async () => {
    const harness = setup({ retryMilliseconds: [1] });
    const done = harness.fill.fill(place, head);
    await vi.waitFor(() => {
      expect(harness.readTree).toHaveBeenCalled();
    });
    harness.files.set('models/moved.step', harness.files.get('models/a.step')!);
    harness.files.delete('models/a.step');
    harness.failLooks(2);
    harness.land('models/a.step');
    harness.land('models/b.step');
    harness.finish(harness.fullTree());
    await done;
    await vi.waitFor(() => {
      expect(harness.text('models/moved.step')).toBe('solid a');
    });
    await vi.waitFor(() => {
      expect(harness.reports.at(-1)?.facet).toBeUndefined();
    });
    /* No report said done while the moved placeholder was still a pointer. */
    const doneAt = harness.reports.findIndex((report) => report.facet === undefined);
    expect(doneAt).toBe(harness.reports.length - 1);
  });

  /* A look that keeps throwing fails the fill, which backs off: never done, and never a tight loop of looks. */
  it('reports a fill whose closing look keeps throwing as failed, and looks a bounded number of times', async () => {
    const harness = setup();
    const done = harness.fill.fill(place, head);
    await vi.waitFor(() => {
      expect(harness.readTree).toHaveBeenCalled();
    });
    harness.failLooks(Number.POSITIVE_INFINITY);
    harness.land('models/a.step');
    harness.land('models/b.step');
    harness.finish(harness.fullTree());
    await done;
    await vi.waitFor(() => {
      expect(harness.reports.at(-1)?.facet).toMatchObject({ phase: 'failed' });
    });
    const looks = harness.looks();
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
    expect(harness.looks()).toBe(looks);
    expect(looks).toBeLessThanOrEqual(5);
    expect(harness.reports.some((report) => report.facet === undefined)).toBe(false);
  });

  /* CodeRabbit on #2357: a path dropped under other attributes is filled once they track it again. */
  it('fills a path a flush dropped as untracked once its attributes track it again before the closing look', async () => {
    const harness = setup({ flushMilliseconds: 60_000, flushBytes: 1 });
    const done = harness.fill.fill(place, head);
    await vi.waitFor(() => {
      expect(harness.readTree).toHaveBeenCalled();
    });
    harness.files.set('models/.gitattributes', encoder.encode('*.step -filter\n'));
    harness.land('models/a.step');
    await vi.waitFor(() => {
      expect(harness.captures()).toBe(1);
    });
    expect(harness.text('models/a.step')).not.toBe('solid a');
    /* The person undoes the attributes change. */
    harness.files.delete('models/.gitattributes');
    harness.land('models/b.step');
    harness.finish(harness.fullTree());
    await done;
    await vi.waitFor(() => {
      expect(harness.reports.at(-1)?.facet).toBeUndefined();
    });
    expect(harness.text('models/a.step')).toBe('solid a');
    expect(harness.text('models/b.step')).toBe('solid bb');
  });

  it('runs one timed flush at a time, flushing again after a slow one instead of queueing behind it', async () => {
    const harness = setup();
    const done = harness.fill.fill(place, head);
    await vi.waitFor(() => {
      expect(harness.readTree).toHaveBeenCalled();
    });
    const release = harness.holdWrites();
    harness.land('models/a.step');
    await vi.waitFor(() => {
      expect(harness.materializeTree).toHaveBeenCalledTimes(1);
    });
    /* A fill's flush tells the host's bracket what it is, so the host need not hold a file tree for it. */
    expect(harness.materializeTree.mock.calls[0]?.[2]).toMatchObject({ purpose: 'fill' });
    /* Arrivals and timers while the first flush is still writing: each would have queued a flush of its own. */
    const sweepsBefore = harness.captures();
    for (let landing = 0; landing < 3; landing++) {
      harness.land('models/b.step');
      // oxlint-disable-next-line no-await-in-loop -- each landing outlasts the flush timer.
      await new Promise((resolve) => {
        setTimeout(resolve, 10);
      });
    }
    expect(harness.materializeTree).toHaveBeenCalledTimes(1);
    release();
    await vi.waitFor(() => {
      expect(harness.text('models/b.step')).toBe('solid bb');
    });
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
    /* One flush again after the slow one, not one per timer that fired behind it. */
    expect(harness.captures() - sweepsBefore).toBe(1);
    expect(harness.mostWriting()).toBe(1);
    harness.finish(harness.fullTree());
    await done;
    expect(harness.reports.at(-1)?.facet).toBeUndefined();
  });

  /* An object whose placeholder is gone is owed to nobody: counted as unwritten, it made every flush start the next at once. */
  it('stops counting an object whose placeholder is gone, rather than flushing again and again', async () => {
    const harness = setup({ flushBytes: 7, flushMilliseconds: 60_000 });
    const done = harness.fill.fill(place, head);
    await vi.waitFor(() => {
      expect(harness.readTree).toHaveBeenCalled();
    });
    harness.files.set('models/a.step', encoder.encode('solid mine'));
    const sweepsBefore = harness.captures();
    /* Seven bytes reach the batch, so one flush starts at once and finds nothing to fill. */
    harness.land('models/a.step');
    await vi.waitFor(() => {
      expect(harness.captures()).toBeGreaterThan(sweepsBefore);
    });
    await new Promise((resolve) => {
      setTimeout(resolve, 30);
    });
    expect(harness.captures() - sweepsBefore).toBe(1);
    expect(harness.materializeTree).not.toHaveBeenCalled();
    /* The transfer tells of it again: owed to nobody, it waits for the timer instead of flushing at once. */
    harness.land('models/a.step');
    await new Promise((resolve) => {
      setTimeout(resolve, 30);
    });
    expect(harness.captures() - sweepsBefore).toBe(1);

    harness.land('models/b.step');
    await vi.waitFor(() => {
      expect(harness.text('models/b.step')).toBe('solid bb');
    });
    harness.finish(harness.fullTree());
    await done;
    expect(harness.text('models/a.step')).toBe('solid mine');
    expect(harness.reports.at(-1)?.facet).toBeUndefined();
  });

  it('leaves a placeholder somebody replaced meanwhile alone', async () => {
    const harness = setup();
    const done = harness.fill.fill(place, head);
    await vi.waitFor(() => {
      expect(harness.readTree).toHaveBeenCalled();
    });
    harness.files.set('models/a.step', encoder.encode('solid mine'));
    harness.finish(harness.fullTree());
    await done;
    expect(harness.text('models/a.step')).toBe('solid mine');
    expect(harness.text('models/b.step')).toBe('solid bb');
    expect(harness.reports.at(-1)?.facet).toBeUndefined();
  });

  it('reports a failed transfer with what arrived written, and finishes on retry', async () => {
    const harness = setup();
    const done = harness.fill.fill(place, head);
    await vi.waitFor(() => {
      expect(harness.readTree).toHaveBeenCalled();
    });
    harness.land('models/a.step');
    harness.fail(new Error('The remote did not answer in time.'));
    await done;
    expect(harness.text('models/a.step')).toBe('solid a');
    const failed = harness.reports.at(-1)!;
    expect(failed.facet).toMatchObject({
      phase: 'failed',
      paths: ['models/b.step'],
      error: 'The remote did not answer in time.',
    });
    failed.retry();
    await vi.waitFor(() => {
      expect(harness.readTree).toHaveBeenCalledTimes(2);
    });
    expect(harness.reports.at(-1)?.facet).toMatchObject({ phase: 'fetching' });
    harness.finish(harness.fullTree());
    await vi.waitFor(() => {
      expect(harness.reports.at(-1)?.facet).toBeUndefined();
    });
    expect(harness.text('models/b.step')).toBe('solid bb');
  });

  it('tries a failed fill again on its own, keeping what arrived, until it lands', async () => {
    const harness = setup({ retryMilliseconds: [1] });
    const done = harness.fill.fill(place, head);
    await vi.waitFor(() => {
      expect(harness.readTree).toHaveBeenCalled();
    });
    harness.land('models/a.step');
    harness.fail(new Error('The remote did not answer in time.'));
    await done;
    expect(harness.reports.at(-1)?.facet).toMatchObject({ phase: 'failed' });
    /* Nobody presses Try again: the fill starts over by itself, and what it wrote stays written. */
    await vi.waitFor(() => {
      expect(harness.readTree).toHaveBeenCalledTimes(2);
    });
    expect(harness.text('models/a.step')).toBe('solid a');
    harness.fail(new Error('Still no answer.'));
    await vi.waitFor(() => {
      expect(harness.readTree).toHaveBeenCalledTimes(3);
    });
    harness.finish(harness.fullTree());
    await vi.waitFor(() => {
      expect(harness.reports.at(-1)?.facet).toBeUndefined();
    });
    expect(harness.text('models/b.step')).toBe('solid bb');
  });

  it('hands readers a copy, so a reply that transfers it never empties the bytes the fill still has to write', async () => {
    const harness = setup({ flushMilliseconds: 60_000 });
    const done = harness.fill.fill(place, head);
    await vi.waitFor(() => {
      expect(harness.readTree).toHaveBeenCalled();
    });
    harness.land('models/a.step');
    const { oid } = pointerOf(parts['models/a.step']).pointer;
    const looked = harness.fill.look(place.id, oid)?.bytes;
    const waited = await harness.fill.arrival(place.id, oid);
    expect(decoder.decode(looked)).toBe('solid a');
    /* A worker reply transfers what it returns, detaching it; the other reader's copy is untouched. */
    structuredClone(looked, { transfer: [looked!.buffer] });
    expect(looked!.byteLength).toBe(0);
    expect(decoder.decode(waited)).toBe('solid a');
    harness.land('models/b.step');
    harness.finish(harness.fullTree());
    await done;
    expect(harness.text('models/a.step')).toBe('solid a');
    expect(harness.text('models/b.step')).toBe('solid bb');
    expect(harness.reports.at(-1)?.facet).toBeUndefined();
  });

  it('fetches again an object whose landed bytes were emptied, instead of failing on them for good', async () => {
    const harness = setup({ flushMilliseconds: 60_000, retryMilliseconds: [20] });
    const done = harness.fill.fill(place, head);
    await vi.waitFor(() => {
      expect(harness.readTree).toHaveBeenCalled();
    });
    /* A reader that shared the very bytes the fill keeps, and transferred them away. */
    const { oid } = pointerOf(parts['models/a.step']).pointer;
    const shared = encoder.encode(parts['models/a.step']);
    harness.onLargeObject(oid, shared);
    structuredClone(shared, { transfer: [shared.buffer] });
    harness.land('models/b.step');
    harness.finish(harness.fullTree());
    await done;
    await vi.waitFor(() => {
      expect(harness.readTree.mock.calls.length).toBeGreaterThan(1);
    });
    harness.land('models/a.step');
    harness.land('models/b.step');
    harness.finish(harness.fullTree());
    await vi.waitFor(() => {
      expect(harness.text('models/a.step')).toBe('solid a');
    });
    expect(harness.text('models/b.step')).toBe('solid bb');
    await vi.waitFor(() => {
      expect(harness.reports.at(-1)?.facet).toBeUndefined();
    });
  });

  it('stops retrying a failed fill once the checkout is forgotten', async () => {
    const harness = setup({ retryMilliseconds: [20] });
    const done = harness.fill.fill(place, head);
    await vi.waitFor(() => {
      expect(harness.readTree).toHaveBeenCalled();
    });
    harness.fail(new Error('The remote did not answer in time.'));
    await done;
    harness.fill.forget(place.id);
    await new Promise((resolve) => {
      setTimeout(resolve, 60);
    });
    expect(harness.readTree).toHaveBeenCalledTimes(1);
  });

  it('resumes from the checkout itself, and does nothing when it holds no placeholder', async () => {
    const harness = setup();
    const resumed = harness.fill.resume(place, head);
    await vi.waitFor(() => {
      expect(harness.readTree).toHaveBeenCalledTimes(1);
    });
    /* A second resume while one runs starts nothing. */
    await harness.fill.resume(place, head).catch(() => undefined);
    expect(harness.readTree).toHaveBeenCalledTimes(1);
    harness.finish(harness.fullTree());
    await resumed;
    expect(harness.text('models/a.step')).toBe('solid a');
    const count = harness.reports.length;
    await harness.fill.resume(place, head);
    expect(harness.readTree).toHaveBeenCalledTimes(1);
    expect(harness.reports).toHaveLength(count);
  });

  it('never fills a placeholder with a head file that is not its object', async () => {
    const harness = setup();
    /* Two placeholders for an object the head no longer holds: a.step's content changed upstream. */
    const old = pointerOf('solid old');
    harness.files.set('models/a.step', old.bytes);
    harness.files.set('models/c.step', old.bytes);
    harness.files.delete('models/b.step');
    const done = harness.fill.fill(place, head);
    await vi.waitFor(() => {
      expect(harness.readTree).toHaveBeenCalled();
    });
    harness.finish(harness.fullTree());
    await done;
    expect(harness.files.get('models/a.step')).toStrictEqual(old.bytes);
    expect(harness.files.get('models/c.step')).toStrictEqual(old.bytes);
    expect(harness.materializeTree).not.toHaveBeenCalled();
    /* With no store to fetch it by its oid, the placeholder is still owed: never done (D10). */
    expect(harness.reports.at(-1)?.facet).toMatchObject({
      phase: 'failed',
      paths: ['models/a.step', 'models/c.step'],
    });
  });

  it('fills an object the head holds at another path, found by its hash', async () => {
    const harness = setup();
    harness.files.set('models/renamed.step', harness.files.get('models/a.step')!);
    harness.files.delete('models/a.step');
    const done = harness.fill.fill(
      place,
      head,
      new Map([
        [
          'models/renamed.step',
          {
            ...pointerOf('solid a').pointer,
            pointer: pointerOf('solid a').bytes,
          },
        ],
      ]),
    );
    await vi.waitFor(() => {
      expect(harness.readTree).toHaveBeenCalled();
    });
    /* Not delivered by the transfer (already local): only the head tree has it, at its own path. */
    harness.finish(harness.fullTree());
    await done;
    expect(harness.text('models/renamed.step')).toBe('solid a');
  });

  /* #2010: no flush reads past its own paths, so the look that finds them is the one when the fill's own run out. */
  it('fills a placeholder renamed or copied after the open, found once its own placeholders run out', async () => {
    const harness = setup();
    const done = harness.fill.fill(place, head);
    await vi.waitFor(() => {
      expect(harness.readTree).toHaveBeenCalled();
    });
    harness.files.set('models/moved.step', harness.files.get('models/a.step')!);
    harness.files.delete('models/a.step');
    harness.files.set('models/copy.step', harness.files.get('models/b.step')!);
    harness.land('models/b.step');
    await vi.waitFor(() => {
      expect(harness.text('models/b.step')).toBe('solid bb');
    });
    /* The moved path is still owed under its old name until its object lands and the flush finds it gone. */
    expect(harness.text('models/copy.step')).not.toBe('solid bb');
    const looksBefore = harness.looks();
    harness.land('models/a.step');
    harness.finish(harness.fullTree());
    await done;
    expect(harness.text('models/moved.step')).toBe('solid a');
    expect(harness.text('models/copy.step')).toBe('solid bb');
    expect(harness.files.has('models/a.step')).toBe(false);
    expect(harness.looks() - looksBefore).toBeGreaterThanOrEqual(1);
    expect(harness.reports.at(-1)?.facet).toBeUndefined();
  });

  it('sweeps what changed meanwhile when the transfer fails with nothing landed', async () => {
    const harness = setup();
    const done = harness.fill.fill(place, head);
    await vi.waitFor(() => {
      expect(harness.readTree).toHaveBeenCalled();
    });
    harness.files.set('models/a.step', encoder.encode('solid mine'));
    harness.fail(new Error('offline'));
    await done;
    expect(harness.reports.at(-1)?.facet).toMatchObject({ phase: 'failed', paths: ['models/b.step'] });
  });

  it('sweeps again when a writer moves the checkout under a flush, rather than failing', async () => {
    const harness = setup();
    harness.conflictNext(1);
    const done = harness.fill.fill(place, head);
    await vi.waitFor(() => {
      expect(harness.readTree).toHaveBeenCalled();
    });
    harness.finish(harness.fullTree());
    await done;
    expect(harness.materializeTree).toHaveBeenCalledTimes(2);
    expect(harness.text('models/a.step')).toBe('solid a');
    expect(harness.text('models/b.step')).toBe('solid bb');
    expect(harness.reports.at(-1)?.facet).toBeUndefined();
  });

  it('leaves a flush a writer keeps conflicting to a later one, still fetching', async () => {
    const harness = setup();
    harness.conflictNext(3);
    const done = harness.fill.fill(place, head);
    await vi.waitFor(() => {
      expect(harness.readTree).toHaveBeenCalled();
    });
    harness.finish(harness.fullTree());
    await done;
    expect(harness.reports.at(-1)?.facet).toMatchObject({ phase: 'fetching', objects: 2 });
    await vi.waitFor(() => {
      expect(harness.reports.at(-1)?.facet).toBeUndefined();
    });
    expect(harness.text('models/a.step')).toBe('solid a');
  });

  it('fetches a placeholder by its own oid: failed while offline, filled once the network answers', async () => {
    const harness = setup({ byOid: true });
    const done = harness.fill.fill(place, head);
    await vi.waitFor(() => {
      expect(harness.fetchLargeObjects).toHaveBeenCalled();
    });
    expect(harness.fetchLargeObjects.mock.calls[0]?.[0]).toStrictEqual(
      Object.values(parts).map((content) => pointerOf(content).pointer),
    );
    harness.fetched()?.reject(new Error('The remote did not answer in time.'));
    await done;
    const failed = harness.reports.at(-1)!;
    expect(failed.facet).toMatchObject({ phase: 'failed', paths: ['models/a.step', 'models/b.step'] });
    expect(harness.files.get('models/a.step')).toStrictEqual(pointerOf('solid a').bytes);
    failed.retry();
    await vi.waitFor(() => {
      expect(harness.fetchLargeObjects).toHaveBeenCalledTimes(2);
    });
    expect(harness.readTree).not.toHaveBeenCalled();
    harness.land('models/a.step');
    harness.fetched()?.resolve(new Map([[pointerOf('solid bb').pointer.oid, encoder.encode('solid bb')]]));
    await vi.waitFor(() => {
      expect(harness.reports.at(-1)?.facet).toBeUndefined();
    });
    expect(harness.text('models/a.step')).toBe('solid a');
    expect(harness.text('models/b.step')).toBe('solid bb');
  });

  it('fetches the objects its placeholders name at once, never reading the head’s tree for them (Tau #2013)', async () => {
    const harness = setup({ byOid: true });
    const placeholders = largeObjectPlaceholders(
      new ImmutableRevisionTree([...harness.files].map(([path, content]) => [path, content] as const)),
    );
    const done = harness.fill.fill(place, head, placeholders);
    await vi.waitFor(() => {
      expect(harness.fetchLargeObjects).toHaveBeenCalled();
    });
    expect(harness.readTree).not.toHaveBeenCalled();
    expect(harness.fetchLargeObjects.mock.calls[0]?.[0]).toStrictEqual(
      Object.values(parts).map((content) => pointerOf(content).pointer),
    );
    harness.land('models/a.step');
    harness.fetched()?.resolve(new Map([[pointerOf('solid bb').pointer.oid, encoder.encode('solid bb')]]));
    await done;
    await vi.waitFor(() => {
      expect(harness.reports.at(-1)?.facet).toBeUndefined();
    });
    expect(harness.text('models/a.step')).toBe('solid a');
    expect(harness.text('models/b.step')).toBe('solid bb');
  });

  it('reads the head’s tree for what a fetch by oid found missing, and fills from it', async () => {
    const harness = setup({ byOid: true });
    const done = harness.fill.fill(place, head);
    await vi.waitFor(() => {
      expect(harness.fetchLargeObjects).toHaveBeenCalled();
    });
    harness.land('models/a.step');
    harness.fetched()?.reject(new RevisionPortError('MISSING_LARGE_OBJECT', 'The remote holds no such object.'));
    await vi.waitFor(() => {
      expect(harness.readTree).toHaveBeenCalled();
    });
    expect(harness.readTree.mock.calls[0]?.[0]).toBe(head);
    harness.finish(harness.fullTree());
    await done;
    await vi.waitFor(() => {
      expect(harness.reports.at(-1)?.facet).toBeUndefined();
    });
    expect(harness.text('models/a.step')).toBe('solid a');
    expect(harness.text('models/b.step')).toBe('solid bb');
  });

  it('answers a caller that names what it wrote every time, even when that is nothing (D10)', async () => {
    const harness = setup();
    await harness.fill.fill(place, head, new Map());
    await harness.fill.fill(place, head, new Map());
    expect(harness.reports.map((report) => report.facet)).toStrictEqual([undefined, undefined]);
    expect(harness.readTree).not.toHaveBeenCalled();
  });

  it('forgets a checkout’s fill without a word when its tree is replaced (D10, I7)', async () => {
    const harness = setup();
    const done = harness.fill.fill(place, head);
    await vi.waitFor(() => {
      expect(harness.readTree).toHaveBeenCalled();
    });
    harness.land('models/a.step');
    const told = harness.reports.length;
    harness.fill.forget(place.id);
    await done;
    expect(harness.signal()?.aborted).toBe(true);
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
    expect(harness.reports).toHaveLength(told);
    expect(harness.fill.look(place.id, pointerOf('solid a').pointer.oid)).toBeUndefined();
  });

  it('stops on close: the transfer is aborted, timers clear, and nothing more is written or told', async () => {
    const harness = setup();
    const done = harness.fill.fill(place, head);
    await vi.waitFor(() => {
      expect(harness.readTree).toHaveBeenCalled();
    });
    harness.land('models/a.step');
    const told = harness.reports.length;
    await harness.fill.stop();
    await done;
    expect(harness.signal()?.aborted).toBe(true);
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
    expect(harness.materializeTree).not.toHaveBeenCalled();
    expect(harness.files.get('models/a.step')).toStrictEqual(pointerOf('solid a').bytes);
    expect(harness.reports).toHaveLength(told);
  });
});

/*
 * W11.3 re-review: a store-landing fill whose final flush finds another object
 * gone from the store fetches that one too, each object at most once.
 */
describe('a fill over the host store', () => {
  it('fetches as bytes an object the store loses during the final flush, once', async () => {
    const a = encoder.encode('solid a\n'.repeat(64));
    const b = encoder.encode('solid b\n'.repeat(64));
    const pa = lfsPointerFor(a);
    const pb = lfsPointerFor(b);
    const files = new Map<string, Uint8Array<ArrayBuffer>>([
      ['.gitattributes', encoder.encode(tracksStep)],
      ['a.step', pa.bytes],
      ['b.step', pb.bytes],
    ]);
    /* The store lacks `a` from the start; `b` is lost once `a` has been fetched. */
    const stored = new Map<string, Uint8Array<ArrayBuffer>>([[pb.pointer.oid, b]]);
    const remote = new Map([
      [pa.pointer.oid, a],
      [pb.pointer.oid, b],
    ]);
    const asked: string[][] = [];
    const reports: LargeObjectsReport[] = [];
    const fill = createLargeObjectFill({
      port: {
        readTree: async () =>
          new ImmutableRevisionTree([
            ['a.step', pa.bytes],
            ['b.step', pb.bytes],
          ]),
        fetchLargeObjects: async (pointers) => {
          asked.push(pointers.map(({ oid }) => oid));
          if (asked.length === 1) {
            /* Meanwhile `b`'s placeholder is copied, and a prune takes `b` from the store. */
            files.set('c.step', pb.bytes);
            stored.delete(pb.pointer.oid);
          }
          return new Map(pointers.map(({ oid }) => [oid, remote.get(oid)!] as const));
        },
      },
      placeholders: async () =>
        largeObjectPlaceholders(
          new ImmutableRevisionTree([...files].map(([path, content]) => [path, content] as const)),
        ),
      readPaths: async (_place, paths) =>
        new Map(
          paths.flatMap((path) => {
            const content = files.get(path);
            return content === undefined ? [] : [[path, { content, mode: '100644' }] as const];
          }),
        ),
      withCheckoutFence: async (_id, operation) => operation(),
      landsFromStore: async () => true,
      materializeTree: async (_place, target, { largeObjects }) => {
        const lacking = [...(largeObjects?.values() ?? [])].flatMap(({ oid }) => (stored.has(oid) ? [] : [oid]));
        if (lacking.length > 0) {
          throw new UnstoredLargeObjectsError(lacking);
        }
        for (const { path, content } of target.entries()) {
          const object = largeObjects?.get(path);
          files.set(path, object === undefined ? content : stored.get(object.oid)!);
        }
      },
      report: (report) => reports.push(report),
      flushMilliseconds: 0,
    });

    await fill.fill(place, head);

    expect(asked).toStrictEqual([[pa.pointer.oid], [pb.pointer.oid]]);
    expect(decoder.decode(files.get('a.step'))).toBe(decoder.decode(a));
    expect(decoder.decode(files.get('b.step'))).toBe(decoder.decode(b));
    expect(decoder.decode(files.get('c.step'))).toBe(decoder.decode(b));
    expect(reports.at(-1)?.facet).toBeUndefined();
    await fill.stop();
  });
});
