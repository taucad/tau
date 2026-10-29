import { describe, expect, it, vi } from 'vitest';
import { ImmutableRevisionTree, revisionId } from '#algorithms/index.js';
import { createLargeObjectFill, largeObjectPlaceholders } from '#large-object-fill.js';
import { lfsPointerFor } from '#lfs.js';
import type { LargeObjectsReport } from '#project-revisions.types.js';
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
const setup = () => {
  const files = new Map<string, Uint8Array<ArrayBuffer>>([['main.scad', encoder.encode('import("models/a.step");')]]);
  for (const [path, content] of Object.entries(parts)) {
    files.set(path, pointerOf(content).bytes);
  }
  const reports: LargeObjectsReport[] = [];
  let onLargeObject: ReadTreeOptions['onLargeObject'];
  let finish: (tree: ImmutableRevisionTree) => void = () => undefined;
  let fail: (error: Error) => void = () => undefined;
  const readTree = vi.fn(
    async (_id: unknown, options?: ReadTreeOptions) =>
      new Promise<ImmutableRevisionTree>((resolve, reject) => {
        onLargeObject = options?.onLargeObject;
        finish = resolve;
        fail = reject;
      }),
  );
  const fullTree = (): ImmutableRevisionTree =>
    new ImmutableRevisionTree([
      ['main.scad', files.get('main.scad')!],
      ...Object.entries(parts).map(([path, content]) => [path, encoder.encode(content)] as const),
    ]);
  const capture = async (): Promise<ImmutableRevisionTree> =>
    new ImmutableRevisionTree([...files].map(([path, content]) => [path, content] as const));
  const materializeTree = vi.fn(async (_place: Checkout, target: ImmutableRevisionTree) => {
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
    flushMilliseconds: 1,
    reportMilliseconds: 1,
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
});
