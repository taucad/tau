/* eslint-disable @typescript-eslint/naming-convention -- file-system path keys are not camelCase identifiers. */
/**
 * Freshness of request-scoped kernel operations (I1–I4).
 *
 * Every test here drives a filesystem that *can* watch and then edits a file
 * without delivering the watch event, which is the shape of the reported
 * desktop failure: the agent's kernel holds a watchable filesystem, never arms
 * a subscription for `evaluateModel`/`getParameters`/`snapshotSource`, and so
 * answers every later tool call from the first read.
 *
 * See `docs/research/agent-stale-kernel-result-elimination-blueprint.md`.
 */

import { describe, it, expect, vi } from 'vitest';
import type { OnWorkerLog } from '@taucad/types';
import type { WatchEvent } from '@taucad/filesystem';
import type { GetParameterDeclarationsResult } from '#types/runtime.types.js';
import type { GetDependenciesInput, GetParametersInput, KernelRuntime } from '#types/runtime-kernel.types.js';
import type { GetDependenciesResult } from '#types/runtime-dependency.types.js';
/* oxlint-disable no-restricted-imports, import/extensions -- Runtime-private white-box fixture stays outside the package build graph. */
import {
  MockKernelWorker,
  createMockFileSystem,
  createGeometryFile,
  createParameterDeclaration,
} from '../../test/support/kernel-worker.fixture.js';
/* oxlint-enable no-restricted-imports, import/extensions */

const noopLog: OnWorkerLog = () => {
  /* No-op */
};

const notFound = (path: string): NodeJS.ErrnoException => {
  const error = new Error(`ENOENT: no such file or directory, open '${path}'`) as NodeJS.ErrnoException;
  error.code = 'ENOENT';
  return error;
};

/** A kernel whose parameter defaults are the entry's current bytes, so a stale parameter cache is visible. */
class SourceLabelWorker extends MockKernelWorker {
  public getDependencyCalls = 0;

  protected override async onGetParameters(
    { entryPath }: GetParametersInput,
    runtime: KernelRuntime,
  ): Promise<GetParameterDeclarationsResult> {
    const source = await runtime.filesystem.readFile(entryPath, 'utf8');
    return createParameterDeclaration({ label: source });
  }

  protected override async onGetDependencies(
    input: GetDependenciesInput,
    runtime: KernelRuntime,
  ): Promise<GetDependenciesResult> {
    this.getDependencyCalls++;
    return super.onGetDependencies(input, runtime);
  }
}

type FreshnessHarness = {
  readonly worker: SourceLabelWorker;
  /** The bytes on the filesystem. Mutating this map is an edit nothing announced. */
  readonly files: Map<string, string>;
  /** Deliver a watch event to every armed subscription, as a real filesystem would. */
  readonly deliver: (event: WatchEvent) => void;
  readonly watch: ReturnType<typeof vi.fn>;
  readonly unsubscribe: ReturnType<typeof vi.fn>;
};

const createHarness = (
  initial: Record<string, string>,
  options?: { readonly watchable?: boolean },
): FreshnessHarness => {
  const files = new Map(Object.entries(initial));
  const filesystem = createMockFileSystem({
    existsResult: (path) => files.has(path),
    readFileResult: (path) => {
      const value = files.get(path);
      if (value === undefined) {
        throw notFound(path);
      }
      return value;
    },
  });
  filesystem.mocks.readFiles.mockImplementation(async (paths: string[]) =>
    Object.fromEntries(
      paths.map((path) => {
        const value = files.get(path);
        if (value === undefined) {
          throw notFound(path);
        }
        return [path, new TextEncoder().encode(value)];
      }),
    ),
  );

  const handlers: Array<(event: WatchEvent) => void> = [];
  const unsubscribe = vi.fn();
  const watch = vi.fn((_request: { paths: readonly string[] }, handler: (event: WatchEvent) => void) => {
    handlers.push(handler);
    return unsubscribe;
  });

  const worker = new SourceLabelWorker({ middleware: [], onLog: noopLog, filesystem });
  // @ts-expect-error - the private bridge filesystem is the watch capability under test.
  worker.fileSystem = options?.watchable === false ? { ...filesystem } : { ...filesystem, watch };

  return {
    worker,
    files,
    watch,
    unsubscribe,
    deliver: (event) => {
      for (const handler of handlers) {
        handler(event);
      }
    },
  };
};

const evaluationHash = async (worker: SourceLabelWorker, filename: string): Promise<string> => {
  const result = await worker.evaluateModel({ file: createGeometryFile(filename), parameters: {} });
  if (!result.success) {
    throw new Error(`Evaluation failed: ${result.issues.map((issue) => issue.message).join('; ')}`);
  }
  return result.data.hash;
};

describe('request-scoped freshness on a watchable filesystem', () => {
  it('(a) evaluateModel answers for the bytes written after the previous evaluation', async () => {
    const { worker, files } = createHarness({ 'main.ts': 'v1' });

    const first = await evaluationHash(worker, 'main.ts');
    files.set('main.ts', 'v2');
    const second = await evaluationHash(worker, 'main.ts');

    expect(second).not.toBe(first);
    await worker.cleanup();
  });

  it('(b) exportModel answers for bytes written after an evaluation, and drops the stale hash', async () => {
    const { worker, files } = createHarness({ 'main.ts': 'v1' });

    await evaluationHash(worker, 'main.ts');
    files.set('main.ts', 'v2');
    const exported = await worker.exportModel({
      file: createGeometryFile('main.ts'),
      parameters: {},
      format: 'gltf',
    });

    expect(exported.success).toBe(true);
    // @ts-expect-error - the retained hash is the private evidence the export lane reused.
    const retained = worker.fileHashCache.get('main.ts');
    // @ts-expect-error - hashing through the worker keeps the digest definition in one place.
    const expected = await worker.hashContent(new TextEncoder().encode('v2'));
    expect(retained).toBe(expected);
    await worker.cleanup();
  });

  it('(c1) getParameters re-extracts after an unannounced edit', async () => {
    const { worker, files } = createHarness({ 'main.ts': 'v1' });

    const first = await worker.getParameters(createGeometryFile('main.ts'));
    files.set('main.ts', 'v2');
    const second = await worker.getParameters(createGeometryFile('main.ts'));

    expect(first.success && first.data.defaults['label']).toBe('v1');
    expect(second.success && second.data.defaults['label']).toBe('v2');
    await worker.cleanup();
  });

  it('(c2) snapshotSource reports the bytes written after an evaluation', async () => {
    const { worker, files } = createHarness({ 'main.ts': 'v1' });

    await evaluationHash(worker, 'main.ts');
    files.set('main.ts', 'v2');
    const snapshot = await worker.snapshotSource({ file: createGeometryFile('main.ts') });

    expect(snapshot.success).toBe(true);
    if (!snapshot.success) {
      return;
    }
    const entry = snapshot.data.files.find(({ path }) => path === 'main.ts');
    expect(new TextDecoder().decode(entry?.content)).toBe('v2');
    // @ts-expect-error - hashing through the worker keeps the digest definition in one place.
    const stale = await worker.hashContent(new TextEncoder().encode('v1'));
    /* Either the fresh digest or nothing: what must not survive is the digest of bytes the
     * snapshot just contradicted. */
    // @ts-expect-error - the retained hash is private evidence about what the lane kept.
    expect(worker.fileHashCache.get('main.ts')).not.toBe(stale);
    await worker.cleanup();
  });

  it('(d) an edit to one entry does not leave the other entry stale, and vice versa', async () => {
    const { worker, files } = createHarness({ 'main.ts': 'main-v1', 'parts/a.ts': 'a-v1' });

    const mainFirst = await evaluationHash(worker, 'main.ts');
    const partFirst = await evaluationHash(worker, 'parts/a.ts');
    files.set('parts/a.ts', 'a-v2');
    const partSecond = await evaluationHash(worker, 'parts/a.ts');
    const mainSecond = await evaluationHash(worker, 'main.ts');

    expect(partSecond).not.toBe(partFirst);
    expect(mainSecond).toBe(mainFirst);
    await worker.cleanup();
  });

  it('(e) arming after an unannounced edit commits with fresh hashes and still routes later events', async () => {
    const { worker, files, deliver, watch } = createHarness({ 'main.ts': 'v1' });

    await evaluationHash(worker, 'main.ts');
    files.set('main.ts', 'v2');
    const second = await evaluationHash(worker, 'main.ts');

    expect(worker.getWatchedPaths()).toContain('main.ts');
    expect(watch).toHaveBeenCalled();

    files.set('main.ts', 'v3');
    deliver({ type: 'change', path: 'main.ts' });
    const third = await evaluationHash(worker, 'main.ts');
    expect(third).not.toBe(second);
    await worker.cleanup();
  });

  it('(f) a watcherless filesystem keeps answering for the current bytes', async () => {
    const { worker, files } = createHarness({ 'main.ts': 'v1' }, { watchable: false });

    const first = await evaluationHash(worker, 'main.ts');
    files.set('main.ts', 'v2');
    const second = await evaluationHash(worker, 'main.ts');

    expect(second).not.toBe(first);
    await worker.cleanup();
  });

  it('(g) an unchanged watched closure is not resolved again on the second evaluation', async () => {
    const { worker } = createHarness({ 'main.ts': 'v1' });

    const first = await evaluationHash(worker, 'main.ts');
    const callsAfterFirst = worker.getDependencyCalls;
    const second = await evaluationHash(worker, 'main.ts');

    expect(second).toBe(first);
    expect(worker.getDependencyCalls).toBe(callsAfterFirst);
    await worker.cleanup();
  });
});

describe('request-scoped freshness on a watcherless filesystem', () => {
  it('(h) resolves an unchanged closure once and resolves again after an edit', async () => {
    const { worker, files } = createHarness({ 'main.ts': 'v1' }, { watchable: false });

    const first = await evaluationHash(worker, 'main.ts');
    expect(worker.getDependencyCalls).toBe(1);

    /* Q5/EQ7: revalidation is the freshness evidence on every adapter, so a watcherless
     * adapter no longer pays a re-bundle per call for bytes that did not move. */
    const second = await evaluationHash(worker, 'main.ts');
    expect(second).toBe(first);
    expect(worker.getDependencyCalls).toBe(1);

    files.set('main.ts', 'v2');
    const third = await evaluationHash(worker, 'main.ts');
    expect(third).not.toBe(first);
    expect(worker.getDependencyCalls).toBe(2);
    await worker.cleanup();
  });
});

describe('a refused arm leaves nothing reusable (I2, R2)', () => {
  it('(i) does not reuse volatile caches when the arm was refused', async () => {
    /* The watcher resyncs while the subscription is being installed, so events may have been
     * missed and the arm is refused — with nothing to invalidate, because no path moved.
     * `createGeometry` is the observer here: it publishes an artifact without revalidating,
     * so its reuse has to be justified by a committed subscription, and "the filesystem can
     * watch" is not evidence that it is watching. */
    const harness = createHarness({ 'main.ts': 'v1' });
    harness.watch.mockImplementation((_request, handler: (event: WatchEvent) => void) => {
      handler({ type: 'reset' });
      return harness.unsubscribe;
    });

    await evaluationHash(harness.worker, 'main.ts');
    expect(harness.watch).toHaveBeenCalled();
    expect(harness.worker.getWatchedPaths().has('main.ts')).toBe(false);
    const callsAfterFirst = harness.worker.getDependencyCalls;

    harness.files.set('main.ts', 'v2');
    const published = await harness.worker.createGeometry({ file: createGeometryFile('main.ts'), parameters: {} });

    expect(published.success).toBe(true);
    expect(harness.worker.getDependencyCalls).toBe(callsAfterFirst + 1);
    // @ts-expect-error - hashing through the worker keeps the digest definition in one place.
    const rewritten = await harness.worker.hashContent(new TextEncoder().encode('v2'));
    // @ts-expect-error - the retained hash is the private evidence the published render resolved from.
    expect(harness.worker.fileHashCache.get('main.ts')).toBe(rewritten);
    await harness.worker.cleanup();
  });

  it('(j) drops what a path that moved under a refused arm was resolved into (R2)', async () => {
    /* The entry is rewritten while the subscription is being installed. The arm is refused
     * because the render it would cover is already stale; what must not survive the refusal
     * is anything resolved from the bytes it disagreed with. The retained *hash* does
     * survive, on purpose: it is the last revision this worker observed, and the queued
     * change event is reported as a change only by comparison against it. */
    const harness = createHarness({ 'main.ts': 'v1' });
    harness.watch.mockImplementation(() => {
      harness.files.set('main.ts', 'v2');
      return harness.unsubscribe;
    });

    await evaluationHash(harness.worker, 'main.ts');

    expect(harness.worker.getWatchedPaths().has('main.ts')).toBe(false);
    // @ts-expect-error - the bundle is what a later operation could otherwise have been answered from.
    expect(harness.worker.bundleResultCache.has('main.ts')).toBe(false);
    // @ts-expect-error - the parameter cache is the other reusable product of those bytes.
    expect(harness.worker.parameterResultCache).toBeUndefined();
    // @ts-expect-error - hashing through the worker keeps the digest definition in one place.
    const observed = await harness.worker.hashContent(new TextEncoder().encode('v1'));
    // @ts-expect-error - the ledger keeps the last observed revision so the queued event still reads as a change.
    expect(harness.worker.fileHashCache.get('main.ts')).toBe(observed);
    await harness.worker.cleanup();
  });
});

describe('revalidation keeps the observation ledger coherent', () => {
  it("(k) does not swallow the preview's next watch event for a path it revalidated", async () => {
    /* A request-scoped operation revalidates the whole retained closure, including paths its
     * own lane never re-reads — here the preview's entry while the agent evaluates a
     * different one. `readChangedObservedRevisions` reads a path with no retained hash as one
     * no render has looked at yet and records its event as a baseline, so a revalidation that
     * *deleted* the entry made the preview spend its next change event re-establishing a
     * baseline, and that edit never reached the screen. The ledger has to keep saying which
     * revision this worker last observed. */
    const harness = createHarness({ 'main.ts': 'v1', 'other.ts': 'o1' });
    const published: string[] = [];
    harness.worker.onGeometryComputed = ({ renderId }) => {
      published.push(renderId);
    };
    const settled = Promise.withResolvers<void>();
    harness.worker.onStateChanged = ({ state }) => {
      if (state === 'idle' || state === 'error') {
        settled.resolve();
      }
    };

    harness.worker.handleOpenFile({
      renderId: '550e8400-e29b-41d4-a716-000000000401',
      file: createGeometryFile('main.ts'),
      parameters: {},
    });
    await settled.promise;
    expect(published).toHaveLength(1);
    expect(harness.worker.getWatchedPaths().has('main.ts')).toBe(true);

    /* The preview's entry moves without an event — a staged agent write, or one the watcher
     * coalesced — and the agent's next tool call is about a different entry. */
    harness.files.set('main.ts', 'v2');
    await evaluationHash(harness.worker, 'other.ts');

    /* A later edit, announced normally. The preview owes the screen a render for it. */
    harness.files.set('main.ts', 'v3');
    harness.deliver({ type: 'change', path: 'main.ts' });

    await vi.waitFor(() => {
      expect(published.length).toBeGreaterThan(1);
    });
    await harness.worker.cleanup();
  });
});
