import { describe, expect, it, vi } from 'vitest';
import { ImmutableRevisionTree, revisionId } from '#algorithms/index.js';
import { createLargeObjectFill, largeObjectPlaceholders } from '#large-object-fill.js';
import { lfsPointerFor } from '#lfs.js';
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

/* A checkout as a map of files, a fence that runs in turn, and a port whose transfer the test drives. */
const setup = (options: Readonly<{ flushBytes?: number; flushMilliseconds?: number }> = {}) => {
  const files = new Map<string, Uint8Array<ArrayBuffer>>([['main.scad', encoder.encode('import("models/a.step");')]]);
  for (const [path, content] of Object.entries(parts)) {
    files.set(path, pointerOf(content).bytes);
  }
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
  /* Writers that move the checkout under the next materialization, as an editor's save would. */
  let conflicts = 0;
  const fullTree = (): ImmutableRevisionTree =>
    new ImmutableRevisionTree([
      ['main.scad', files.get('main.scad')!],
      ...Object.entries(parts).map(([path, content]) => [path, encoder.encode(content)] as const),
    ]);
  let captures = 0;
  const capture = async (): Promise<ImmutableRevisionTree> => {
    captures += 1;
    return new ImmutableRevisionTree([...files].map(([path, content]) => [path, content] as const));
  };
  /* A gate the test may close, so a materialization waits like a slow OPFS write; open by default. */
  let gate: Promise<void> = Promise.resolve();
  let writing = 0;
  let mostWriting = 0;
  const materializeTree = vi.fn(async (_place: Checkout, target: ImmutableRevisionTree, _materialization?: unknown) => {
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
      files.set(path, content);
    }
  });
  const fill = createLargeObjectFill({
    port: { readTree },
    capture,
    withCheckoutFence: async (_id, operation) => operation(),
    materializeTree,
    report: (report) => reports.push(report),
    flushMilliseconds: options.flushMilliseconds ?? 1,
    reportMilliseconds: 1,
    ...(options.flushBytes === undefined ? {} : { flushBytes: options.flushBytes }),
  });
  const land = (path: keyof typeof parts): void => {
    onLargeObject?.(pointerOf(parts[path]).pointer.oid, encoder.encode(parts[path]));
  };
  const text = (path: string): string => decoder.decode(files.get(path));
  return {
    files,
    reports,
    readTree,
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
    /** How many sweeps (one capture each) have run. */
    captures: () => captures,
  };
};

describe('large-object fill', () => {
  it('finds a pointer in a tree as a placeholder, and nothing else', () => {
    const tree = new ImmutableRevisionTree([
      ['main.scad', encoder.encode('cube(1);')],
      ['models/a.step', pointerOf('solid a').bytes],
    ]);
    expect([...largeObjectPlaceholders(tree).keys()]).toStrictEqual(['models/a.step']);
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
    expect(harness.reports.at(-1)?.facet).toBeUndefined();
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

  it('fills a placeholder renamed or copied after the open, and tracks it until it lands', async () => {
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
      expect(harness.text('models/copy.step')).toBe('solid bb');
    });
    expect(harness.text('models/b.step')).toBe('solid bb');
    await vi.waitFor(() => {
      expect(harness.reports.at(-1)?.facet?.paths).toStrictEqual(['models/moved.step']);
    });
    harness.land('models/a.step');
    harness.finish(harness.fullTree());
    await done;
    expect(harness.text('models/moved.step')).toBe('solid a');
    expect(harness.files.has('models/a.step')).toBe(false);
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
