/** Silent-edit freshness through document operations (I1–I4). */
import { randomUUID } from 'node:crypto';
import { afterEach, describe, it, expect, vi } from 'vitest';
import type { WatchEvent } from '@taucad/filesystem';
import { KernelRuntimeWorker } from '#framework/kernel-runtime-worker.js';
import { defineRuntime } from '#worker/runtime-definition.js';
import { defineKernelV2 } from '#types/runtime-kernel-v2.types.js';
import { createKernelSuccess } from '#kernels/kernel-helpers.js';
/* oxlint-disable no-restricted-imports, import/extensions -- Runtime-private white-box fixture. */
import {
  createMockFileSystem,
  createGeometryFile,
  createParameterDeclaration,
} from '../../test/support/kernel-worker.fixture.js';
/* oxlint-enable no-restricted-imports, import/extensions */

const workers: KernelRuntimeWorker[] = [];
afterEach(async () => {
  await Promise.all(workers.splice(0).map(async (worker) => worker.cleanup()));
});

const notFound = (path: string): NodeJS.ErrnoException =>
  Object.assign(new Error(`ENOENT: no such file or directory, open '${path}'`), { code: 'ENOENT' });

const createHarness = async (
  initial: Record<string, string>,
  options?: { readonly watchable?: boolean; readonly dependency?: string },
) => {
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
  const counts = { dependencies: 0, evaluations: 0 };
  const svg = (label: string): string => `<svg xmlns="http://www.w3.org/2000/svg"><text>${label}</text></svg>`;
  const kernel = defineKernelV2({
    id: 'source-label',
    name: 'Source label',
    version: '1.0.0',
    extensions: ['ts'],
    views: { model: { title: 'Model', mimeType: 'image/svg+xml' } },
    exports: { svg: { title: 'SVG', mimeType: 'image/svg+xml', extension: 'svg' } },
    async initialize() {
      return {};
    },
    async resolve({ entryPath }) {
      counts.dependencies++;
      return { resolved: [entryPath, ...(options?.dependency ? [options.dependency] : [])], unresolved: [] };
    },
    async describe({ entryPath }, runtime) {
      const source = await runtime.filesystem.readFile(entryPath, 'utf8');
      const declaration = createParameterDeclaration({ label: source }, { properties: { label: { type: 'string' } } });
      if (!declaration.success) {
        throw new Error('Invalid parameter fixture');
      }
      return createKernelSuccess({ parameters: declaration.data });
    },
    async evaluate({ parameters }) {
      counts.evaluations++;
      return { handle: { label: String(parameters['label']) } };
    },
    async render({ handle }) {
      return { content: svg(handle.label) };
    },
    async export({ handle }) {
      return {
        files: [{ name: 'model.svg', mimeType: 'image/svg+xml', bytes: new TextEncoder().encode(svg(handle.label)) }],
      };
    },
  })();
  const handlers: Array<(event: WatchEvent) => void> = [];
  const unsubscribe = vi.fn();
  const watch = vi.fn((_request: { paths: readonly string[] }, handler: (event: WatchEvent) => void) => {
    handlers.push(handler);
    return unsubscribe;
  });
  const worker = new KernelRuntimeWorker({ runtime: defineRuntime({ kernels: [kernel] }) });
  workers.push(worker);
  await worker.initialize({
    callbacks: { onLog: () => undefined },
    transferables: { inlineFileSystem: options?.watchable === false ? filesystem : { ...filesystem, watch } },
  });
  return {
    worker,
    files,
    counts,
    watch,
    unsubscribe,
    deliver: (event: WatchEvent) => {
      for (const handler of handlers) {
        handler(event);
      }
    },
  };
};

const evaluationHash = async (
  worker: KernelRuntimeWorker,
  filename: string,
  options?: { request?: { documentId: string; intent: number }; watch?: boolean },
): Promise<string> => {
  const request = options?.request;
  const documentId = request?.documentId ?? randomUUID();
  let result: Parameters<NonNullable<KernelRuntimeWorker['onEvaluated']>>[0] | undefined;
  worker.onEvaluated = (event) => {
    if (event.documentId === documentId) {
      result = event;
    }
  };
  if (request && request.intent > 0) {
    worker.handleUpdateDocument({ documentId, intent: request.intent });
  } else {
    worker.handleOpenDocument({
      documentId,
      intent: 0,
      file: createGeometryFile(filename),
      parameters: {},
      watch: options?.watch ?? false,
    });
  }
  try {
    await vi.waitFor(() => {
      expect(result).toBeDefined();
    });
    if (!result?.success || !result.sourceRevision?.files[filename]) {
      throw new Error(`Missing fresh source revision: ${JSON.stringify(result)}`);
    }
    return result.sourceRevision.files[filename];
  } finally {
    if (!request) {
      worker.handleCloseDocument({ documentId });
    }
  }
};

describe('request-scoped freshness on a watchable filesystem', () => {
  it('reuses an unchanged watcherless evaluation and rebuilds after bytes change', async () => {
    const { worker, files, counts } = await createHarness({ 'main.ts': 'v1' }, { watchable: false });

    const request = { documentId: 'retained', intent: 0 };
    const first = await evaluationHash(worker, 'main.ts', { request });
    request.intent++;
    const second = await evaluationHash(worker, 'main.ts', { request });
    expect(second).toBe(first);
    expect(counts.evaluations).toBe(1);

    files.set('main.ts', 'v2');
    request.intent++;
    const changed = await evaluationHash(worker, 'main.ts', { request });
    expect(changed).not.toBe(first);
    expect(counts.evaluations).toBe(2);
  });

  it('(a) a fresh document evaluation answers for the bytes written after the previous evaluation', async () => {
    const { worker, files } = await createHarness({ 'main.ts': 'v1' });

    const first = await evaluationHash(worker, 'main.ts');
    files.set('main.ts', 'v2');
    const second = await evaluationHash(worker, 'main.ts');

    expect(second).not.toBe(first);
  });

  it('(b) a fresh document export answers for bytes written after an evaluation, and drops the stale hash', async () => {
    const { worker, files } = await createHarness({ 'main.ts': 'v1' });

    const first = await evaluationHash(worker, 'main.ts');
    files.set('main.ts', 'v2');
    const documentId = randomUUID();
    worker.handleOpenDocument({
      documentId,
      intent: 0,
      file: createGeometryFile('main.ts'),
      parameters: {},
      watch: false,
    });
    try {
      const exported = await worker.exportDocument({ documentId, operationId: 'export', target: 'svg' });
      expect(exported).toMatchObject({ success: true, files: [{ name: 'model.svg', mimeType: 'image/svg+xml' }] });
      if (!exported.success) {
        throw new Error('Expected fresh document export');
      }
      expect(new TextDecoder().decode(exported.files[0].bytes)).toBe(
        '<svg xmlns="http://www.w3.org/2000/svg"><text>v2</text></svg>',
      );
      expect(exported.sourceRevision?.files['main.ts']).not.toBe(first);
    } finally {
      worker.handleCloseDocument({ documentId });
    }
  });

  it('(c1) describe re-extracts after an unannounced edit', async () => {
    const { worker, files } = await createHarness({ 'main.ts': 'v1' });

    const first = await worker.describe({ file: createGeometryFile('main.ts') });
    files.set('main.ts', 'v2');
    const second = await worker.describe({ file: createGeometryFile('main.ts') });

    expect(first.success && first.parameters.defaults['label']).toBe('v1');
    expect(second.success && second.parameters.defaults['label']).toBe('v2');
  });

  it('(c2) snapshotSource reports the bytes written after an evaluation', async () => {
    const { worker, files } = await createHarness({ 'main.ts': 'v1' });

    await evaluationHash(worker, 'main.ts');
    files.set('main.ts', 'v2');
    const snapshot = await worker.snapshotSource({ file: createGeometryFile('main.ts') });

    expect(snapshot.success).toBe(true);
    if (!snapshot.success) {
      throw new Error('Expected a source snapshot');
    }
    const entry = snapshot.data.files.find(({ path }) => path === 'main.ts');
    expect(new TextDecoder().decode(entry?.content)).toBe('v2');
    // @ts-expect-error - hashing through the worker keeps the digest definition in one place.
    const stale = await worker.hashContent(new TextEncoder().encode('v1'));
    /* Either the fresh digest or nothing: what must not survive is the digest of bytes the
     * snapshot just contradicted. */
    // @ts-expect-error - the retained hash is private evidence about what the lane kept.
    expect(worker.fileHashCache.get('main.ts')).not.toBe(stale);
  });

  it('(d) an edit to one entry does not leave the other entry stale, and vice versa', async () => {
    const { worker, files } = await createHarness({ 'main.ts': 'main-v1', 'parts/a.ts': 'a-v1' });

    const mainFirst = await evaluationHash(worker, 'main.ts');
    const partFirst = await evaluationHash(worker, 'parts/a.ts');
    files.set('parts/a.ts', 'a-v2');
    const partSecond = await evaluationHash(worker, 'parts/a.ts');
    const mainSecond = await evaluationHash(worker, 'main.ts');

    expect(partSecond).not.toBe(partFirst);
    expect(mainSecond).toBe(mainFirst);
  });

  it('(e) arming after an unannounced edit commits with fresh hashes and still routes later events', async () => {
    const { worker, files, deliver, watch } = await createHarness({ 'main.ts': 'v1' });

    await evaluationHash(worker, 'main.ts', { watch: true });
    files.set('main.ts', 'v2');
    const second = await evaluationHash(worker, 'main.ts', { watch: true });

    expect(worker.getWatchedPaths()).toContain('main.ts');
    expect(watch).toHaveBeenCalled();

    files.set('main.ts', 'v3');
    deliver({ type: 'change', path: 'main.ts' });
    const third = await evaluationHash(worker, 'main.ts', { watch: true });
    expect(third).not.toBe(second);
  });

  it('(f) a watcherless filesystem keeps answering for the current bytes', async () => {
    const { worker, files } = await createHarness({ 'main.ts': 'v1' }, { watchable: false });

    const first = await evaluationHash(worker, 'main.ts');
    files.set('main.ts', 'v2');
    const second = await evaluationHash(worker, 'main.ts');

    expect(second).not.toBe(first);
  });

  it('(g) an unchanged watched closure is not resolved again on the second evaluation', async () => {
    const { worker, counts } = await createHarness({ 'main.ts': 'v1' });

    const first = await evaluationHash(worker, 'main.ts', { watch: true });
    const callsAfterFirst = counts.dependencies;
    const second = await evaluationHash(worker, 'main.ts', { watch: true });

    expect(second).toBe(first);
    expect(counts.dependencies).toBe(callsAfterFirst);
  });
});

describe('request-scoped freshness on a watcherless filesystem', () => {
  it('(h) resolves an unchanged closure once and resolves again after an edit', async () => {
    const { worker, files, counts } = await createHarness({ 'main.ts': 'v1' }, { watchable: false });

    const first = await evaluationHash(worker, 'main.ts');
    expect(counts.dependencies).toBe(1);

    /* Q5/EQ7: revalidation is the freshness evidence on every adapter, so a watcherless
     * adapter no longer pays a re-bundle per call for bytes that did not move. */
    const second = await evaluationHash(worker, 'main.ts');
    expect(second).toBe(first);
    expect(counts.dependencies).toBe(1);

    files.set('main.ts', 'v2');
    const third = await evaluationHash(worker, 'main.ts');
    expect(third).not.toBe(first);
    expect(counts.dependencies).toBe(2);
  });
});

describe('a refused arm leaves nothing stale reusable (I2, R2)', () => {
  it('(i) retries a reset during watch installation before publishing', async () => {
    const harness = await createHarness({ 'main.ts': 'v1' });
    harness.watch.mockImplementationOnce((_request, handler: (event: WatchEvent) => void) => {
      handler({ type: 'reset' });
      return harness.unsubscribe;
    });
    const first = await evaluationHash(harness.worker, 'main.ts', { watch: true });
    expect(harness.watch).toHaveBeenCalledTimes(2);
    expect(harness.unsubscribe).toHaveBeenCalled();
    harness.files.set('main.ts', 'v2');
    const fresh = await evaluationHash(harness.worker, 'main.ts', { watch: true });
    expect(fresh).not.toBe(first);
    expect(harness.counts.dependencies).toBeGreaterThan(1);
  });

  it('(j) rejects products resolved from bytes changed during watch installation', async () => {
    const harness = await createHarness({ 'main.ts': 'v1', 'dep.ts': 'old' }, { dependency: 'dep.ts' });
    harness.watch.mockImplementation((request) => {
      if (request.paths.includes('dep.ts')) {
        harness.files.set('main.ts', 'v2');
        harness.files.set('dep.ts', 'new');
      }
      return harness.unsubscribe;
    });
    const observed = await evaluationHash(harness.worker, 'main.ts', { watch: true });
    const description = await harness.worker.describe({ file: createGeometryFile('main.ts') });
    expect(description.success && description.parameters.defaults['label']).toBe('v2');
    expect(harness.counts.dependencies).toBeGreaterThan(1);
    // The entry is armed before discovery; the discovered closure still refuses then retries once.
    expect(harness.watch.mock.calls.filter(([request]) => request.paths.includes('dep.ts'))).toHaveLength(2);
    expect(harness.watch).toHaveBeenCalledTimes(3);
    expect(await evaluationHash(harness.worker, 'main.ts', { watch: true })).toBe(observed);
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
    const harness = await createHarness({ 'main.ts': 'v1', 'other.ts': 'o1' });
    const published: Array<Parameters<NonNullable<KernelRuntimeWorker['onRendered']>>[0]> = [];
    harness.worker.onRendered = (event) => {
      published.push(event);
    };
    harness.worker.handleOpenDocument({
      documentId: 'live',
      intent: 0,
      file: createGeometryFile('main.ts'),
      parameters: {},
      watch: true,
    });
    harness.worker.handleOpenView({
      documentId: 'live',
      subscriptionId: 'live-view',
      requestId: 'initial',
      view: 'model',
    });
    await vi.waitFor(() => {
      expect(published).toHaveLength(1);
    });
    expect(harness.worker.getWatchedPaths().has('main.ts')).toBe(true);

    /* The preview's entry moves without an event — a staged agent export, or one the watcher
     * coalesced — and the agent's next tool call is about a different entry. */
    harness.files.set('main.ts', 'v2');
    await evaluationHash(harness.worker, 'other.ts');

    /* A later edit, announced normally. The preview owes the screen a render for it. */
    harness.files.set('main.ts', 'v3');
    harness.deliver({ type: 'change', path: 'main.ts' });

    await vi.waitFor(() => {
      expect(published.at(-1)).toMatchObject({
        success: true,
        artifact: {
          mimeType: 'image/svg+xml',
          content: '<svg xmlns="http://www.w3.org/2000/svg"><text>v3</text></svg>',
        },
      });
    });
  });
});
