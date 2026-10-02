/** Exact document/view source revisions and separate pinned-export/export dependencies (R4/I5). */
import { randomUUID } from 'node:crypto';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { digestContent } from '@taucad/cache-core';
import { KernelRuntimeWorker } from '#framework/kernel-runtime-worker.js';
import { defineRuntime } from '#worker/runtime-definition.js';
import { defineKernelV2 } from '#types/runtime-kernel-v2.types.js';
import { defineMiddlewareV2 as defineMiddleware } from '#middleware/runtime-middleware-v2.js';
import type { MiddlewarePlugin } from '#plugins/plugin-types.js';
/* oxlint-disable no-restricted-imports, import/extensions -- Runtime-private white-box fixture. */
import { createMockFileSystem, createGeometryFile } from '../../test/support/kernel-worker.fixture.js';
/* oxlint-enable no-restricted-imports, import/extensions */
const workers: KernelRuntimeWorker[] = [];
afterEach(async () => {
  await Promise.all(workers.splice(0).map(async (worker) => worker.cleanup()));
});
const notFound = (path: string): NodeJS.ErrnoException =>
  Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' });
const writtenDigest = async (source: string): Promise<string> =>
  digestContent({ bytes: new TextEncoder().encode(source) });
const declaration = {
  schema: {
    $schema: 'https://json-structure.org/meta/extended/v0/#',
    $id: 'urn:provenance',
    $uses: ['JSONSchemaUnits'],
    name: 'Provenance',
    type: 'object',
  },
  defaults: {},
} as const;
const createHarness = async (
  initial: Record<string, string>,
  middleware: readonly MiddlewarePlugin[] = [],
  measured = false,
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
  const counts = { evaluations: 0, writes: 0 };
  const kernel = defineKernelV2({
    id: 'provenance',
    extensions: ['ts'],
    name: 'Provenance',
    version: '1.0.0',
    evaluateOptionsSchema: z.object({ size: z.number().default(1) }),
    views: { model: { title: 'Model', mimeType: 'image/svg+xml' } },
    exports: {
      text: {
        title: 'Text',
        mimeType: 'text/plain',
        extension: 'txt',
        optionsSchema: z.object({ size: z.number().optional() }),
      },
    },
    async initialize() {
      return {};
    },
    async resolve({ entryPath }) {
      return { resolved: [entryPath], unresolved: [] };
    },
    async describe() {
      return { success: true, data: { parameters: declaration }, issues: [] };
    },
    async evaluate({ entryPath }) {
      counts.evaluations++;
      return { handle: { value: files.get('geometry.flag') ?? files.get(entryPath) ?? '' } };
    },
    serializeHandle({ handle }) {
      return { value: handle.value };
    },
    deserializeHandle({ serialized }) {
      return { value: serialized.value };
    },
    async render({ handle }) {
      return { content: `<svg xmlns="http://www.w3.org/2000/svg"><text>${handle.value}</text></svg>` };
    },
    async export({ handle }) {
      counts.writes++;
      return {
        files: [
          {
            name: 'export.txt',
            mimeType: 'text/plain',
            bytes: new TextEncoder().encode(
              measured ? `${handle.value}:${files.get('export.flag') ?? 'missing'}` : handle.value,
            ),
          },
        ],
      };
    },
  })();
  const worker = new KernelRuntimeWorker({ runtime: defineRuntime({ kernels: [kernel], middleware }) });
  workers.push(worker);
  await worker.initialize({ callbacks: { onLog: () => undefined }, transferables: { inlineFileSystem: filesystem } });
  let intent = 0;
  const evaluate = async () => {
    const events: Array<Parameters<NonNullable<KernelRuntimeWorker['onEvaluated']>>[0]> = [];
    worker.onEvaluated = (event) => {
      if (event.documentId === 'live') {
        events.push(event);
      }
    };
    if (intent === 0) {
      worker.handleOpenDocument({
        documentId: 'live',
        intent: intent++,
        file: createGeometryFile('main.ts'),
        parameters: {},
        watch: false,
      });
    } else {
      worker.handleUpdateDocument({ documentId: 'live', intent: intent++ });
    }
    await vi.waitFor(() => {
      expect(events).toHaveLength(1);
    });
    return events[0]!;
  };
  const render = async () => {
    const events: Array<Parameters<NonNullable<KernelRuntimeWorker['onRendered']>>[0]> = [];
    const subscriptionId = `view-${intent}`;
    worker.onRendered = (event) => {
      if (event.subscriptionId === subscriptionId) {
        events.push(event);
      }
    };
    worker.handleOpenView({
      documentId: 'live',
      subscriptionId,
      requestId: `request-${intent}`,
      view: 'model',
    });
    await vi.waitFor(() => {
      expect(events).toHaveLength(1);
    });
    return events[0]!;
  };
  const freshExport = async () => {
    const documentId = randomUUID();
    worker.handleOpenDocument({
      documentId,
      intent: 0,
      file: createGeometryFile('main.ts'),
      parameters: {},
      watch: false,
    });
    try {
      return await worker.exportDocument({ documentId, operationId: randomUUID(), target: 'text' });
    } finally {
      worker.handleCloseDocument({ documentId });
    }
  };
  return { worker, files, filesystem, counts, evaluate, render, freshExport };
};

describe('document results name the source revision they evaluated (R4)', () => {
  it('keeps a live document export pinned after its source file changes', async () => {
    const { worker, files, counts, evaluate, freshExport } = await createHarness({ 'main.ts': 'first' });
    const committed = await evaluate();
    const first = await worker.exportDocument({ documentId: 'live', operationId: 'first', target: 'text' });
    files.set('main.ts', 'second');
    const second = await worker.exportDocument({ documentId: 'live', operationId: 'second', target: 'text' });
    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    if (!first.success || !second.success) {
      throw new Error('Expected exports from the committed document');
    }
    expect(new TextDecoder().decode(second.files[0].bytes)).toBe('first');
    expect(second.sourceRevision).toEqual(committed.sourceRevision);
    expect(counts.evaluations).toBe(1);

    const fresh = await freshExport();
    expect(fresh.success).toBe(true);
    if (!fresh.success) {
      throw new Error('Expected a new document export');
    }
    expect(new TextDecoder().decode(fresh.files[0].bytes)).toBe('second');
  });

  it('restores a pinned serialized handle after its source file changes', async () => {
    const { worker, files, counts, evaluate } = await createHarness({ 'main.ts': 'first' });
    await evaluate();
    const artifact = (
      worker as unknown as {
        documents: Map<
          string,
          { current?: { artifact?: { liveNativeHandleSlot?: unknown; serializedNativeHandleSlot?: unknown } } }
        >;
      }
    ).documents.get('live')?.current?.artifact;
    expect(artifact).toBeDefined();
    artifact!.liveNativeHandleSlot = undefined;
    files.set('main.ts', 'second');

    const result = await worker.exportDocument({ documentId: 'live', operationId: 'restored', target: 'text' });
    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error('Expected export from the committed serialized handle');
    }
    expect(new TextDecoder().decode(result.files[0].bytes)).toBe('first');
    expect(counts.evaluations).toBe(1);
  });

  it('refuses to rebuild a missing pinned handle after its source file changes', async () => {
    const { worker, files, counts, evaluate } = await createHarness({ 'main.ts': 'first' });
    await evaluate();
    const artifact = (
      worker as unknown as {
        documents: Map<
          string,
          { current?: { artifact?: { liveNativeHandleSlot?: unknown; serializedNativeHandleSlot?: unknown } } }
        >;
      }
    ).documents.get('live')?.current?.artifact;
    expect(artifact).toBeDefined();
    artifact!.liveNativeHandleSlot = undefined;
    artifact!.serializedNativeHandleSlot = undefined;
    files.set('main.ts', 'second');

    const result = await worker.exportDocument({ documentId: 'live', operationId: 'missing-handle', target: 'text' });
    expect(result).toMatchObject({ success: false, issues: [{ code: 'SOURCE_SNAPSHOT_CHANGED' }] });
    expect(counts.evaluations).toBe(1);
  });

  it('refuses a changed native construction route after its source file changes', async () => {
    const { worker, files, counts, evaluate } = await createHarness({ 'main.ts': 'first' });
    await evaluate();
    files.set('main.ts', 'second');

    const result = await worker.exportDocument({
      documentId: 'live',
      operationId: 'changed-construction',
      target: 'text',
      options: { size: 2 },
    });
    expect(result).toMatchObject({ success: false, issues: [{ code: 'SOURCE_SNAPSHOT_CHANGED' }] });
    expect(counts.evaluations).toBe(1);
  });

  it('measures scoped export admission and export freshness without treating evaluation provenance as the export key', async () => {
    const geometryPath = 'geometry.flag';
    const exportPath = 'export.flag';
    const geometryDependencies: Array<{ hash: string; files: string[] }> = [];
    const exportDependencies: Array<{ hash: string; files: string[] }> = [];
    const middleware = defineMiddleware({
      id: 'measured-authored-dependencies',
      name: 'MeasuredAuthoredDependencies',
      resolve: () => [
        { path: geometryPath, affects: ['evaluate'] },
        { path: exportPath, affects: ['export'] },
      ],
      async wrapEvaluate(input, handler, runtime) {
        geometryDependencies.push({
          hash: runtime.dependencyHash,
          files: runtime.dependencies
            .filter((dependency) => dependency.type === 'file')
            .map(({ path, contentHash }) => `${path}:${contentHash}`),
        });
        return handler(input);
      },
      async wrapExport(input, handler, runtime) {
        exportDependencies.push({
          hash: runtime.dependencyHash,
          files: runtime.dependencies
            .filter((dependency) => dependency.type === 'file')
            .map(({ path, contentHash }) => `${path}:${contentHash}`),
        });
        return handler(input);
      },
    });
    const { worker, files, filesystem, counts, freshExport } = await createHarness(
      { 'main.ts': 'same', [geometryPath]: 'g1' },
      [middleware()],
      true,
    );
    const reads: Array<{ paths: string[]; bytes: number }> = [];
    const singleReads: Array<{ path: string; bytes: number }> = [];
    filesystem.mocks.readFile.mockImplementation(async (path: string) => {
      const source = files.get(path);
      if (source === undefined) {
        throw notFound(path);
      }
      const bytes = new TextEncoder().encode(source);
      singleReads.push({ path, bytes: bytes.byteLength });
      return bytes;
    });
    filesystem.mocks.readFiles.mockImplementation(async (paths: string[]) => {
      const contents = Object.fromEntries(
        paths.map((path) => {
          const source = files.get(path);
          if (source === undefined) {
            throw notFound(path);
          }
          return [path, new TextEncoder().encode(source)];
        }),
      );
      reads.push({
        paths: [...paths],
        bytes: Object.values(contents).reduce((sum, value) => sum + value.byteLength, 0),
      });
      return contents;
    });
    const observations = [];
    try {
      for (const edit of [undefined, undefined, 'geometry', 'export'] as const) {
        if (edit === 'geometry') {
          files.set(geometryPath, 'g2');
        } else if (edit === 'export') {
          files.set(exportPath, 'e1');
        }
        const before = reads.length;
        const beforeSingle = singleReads.length;
        const beforeExists = filesystem.mocks.exists.mock.calls.length;
        const beforeExports = counts.writes;
        const started = performance.now();
        // oxlint-disable-next-line no-await-in-loop -- Each authored edit must precede the next export.
        const result = await freshExport();
        /** Milliseconds. */
        const elapsed = performance.now() - started;
        expect(result.success).toBe(true);
        if (!result.success) {
          throw new Error('Expected an authored export.');
        }
        const { bytes } = result.files[0];
        observations.push({
          sourceRevision: result.sourceRevision,
          // oxlint-disable-next-line no-await-in-loop -- Digest the bytes returned by this exact export before the next edit.
          outputDigest: await digestContent({ bytes }),
          outputText: new TextDecoder().decode(bytes),
          readCalls: reads.length - before,
          readBytes: reads.slice(before).reduce((sum, read) => sum + read.bytes, 0),
          singleReadCalls: singleReads.length - beforeSingle,
          singleReadBytes: singleReads.slice(beforeSingle).reduce((sum, read) => sum + read.bytes, 0),
          existsCalls: filesystem.mocks.exists.mock.calls.length - beforeExists,
          exportCalls: counts.writes - beforeExports,
          elapsed,
        });
      }
      expect(observations.map(({ outputText }) => outputText)).toEqual([
        'g1:missing',
        'g1:missing',
        'g2:missing',
        'g2:e1',
      ]);
      expect(new Set(observations.map(({ outputDigest }) => outputDigest)).size).toBe(3);
      expect(observations[0]?.sourceRevision).toEqual(observations[1]?.sourceRevision);
      expect(observations[1]?.sourceRevision).not.toEqual(observations[2]?.sourceRevision);
      expect(observations[2]?.sourceRevision).toEqual(observations[3]?.sourceRevision);
      expect(observations[0]?.sourceRevision?.files[geometryPath]).toBe(await writtenDigest('g1'));
      expect(observations[2]?.sourceRevision?.files[geometryPath]).toBe(await writtenDigest('g2'));
      expect(geometryDependencies).toHaveLength(4);
      expect(exportDependencies).toHaveLength(4);
      expect(geometryDependencies[0]?.hash).toBe(geometryDependencies[1]?.hash);
      expect(geometryDependencies[1]?.hash).not.toBe(geometryDependencies[2]?.hash);
      expect(exportDependencies[2]?.hash).not.toBe(exportDependencies[3]?.hash);
      expect(exportDependencies[0]?.files).toContainEqual(expect.stringContaining(`${exportPath}:missing`));
      expect(exportDependencies[3]?.files).toContainEqual(expect.stringContaining(`${exportPath}:`));
      // Inline V2 admission and exporting each revalidate source bytes; no synthetic bulk read path.
      expect(
        observations.map(({ readCalls, readBytes, existsCalls, exportCalls }) => ({
          readCalls,
          readBytes,
          existsCalls,
          exportCalls,
        })),
      ).toEqual([
        { readCalls: 0, readBytes: 0, existsCalls: 0, exportCalls: 1 },
        { readCalls: 0, readBytes: 0, existsCalls: 2, exportCalls: 1 },
        { readCalls: 0, readBytes: 0, existsCalls: 2, exportCalls: 1 },
        { readCalls: 0, readBytes: 0, existsCalls: 1, exportCalls: 1 },
      ]);
      expect(
        observations.map(({ singleReadCalls, singleReadBytes }) => ({ singleReadCalls, singleReadBytes })),
      ).toEqual([
        { singleReadCalls: 4, singleReadBytes: 12 },
        { singleReadCalls: 4, singleReadBytes: 12 },
        { singleReadCalls: 4, singleReadBytes: 12 },
        { singleReadCalls: 6, singleReadBytes: 16 },
      ]);
      const snapshots = [];
      for (let index = 0; index < 2; index++) {
        const beforeReads = reads.length;
        const beforeSingle = singleReads.length;
        const beforeExists = filesystem.mocks.exists.mock.calls.length;
        // oxlint-disable-next-line no-await-in-loop -- Repeated snapshots must observe the same settled authored state in order.
        const snapshot = await worker.snapshotSource({ file: createGeometryFile('main.ts') });
        expect(snapshot.success).toBe(true);
        if (!snapshot.success) {
          throw new Error('Expected a coherent source snapshot.');
        }
        snapshots.push({
          files: snapshot.data.files.map(({ path, sha256 }) => `${path}:${sha256}`),
          readCalls: reads.length - beforeReads,
          readBytes: reads.slice(beforeReads).reduce((sum, read) => sum + read.bytes, 0),
          singleReadCalls: singleReads.length - beforeSingle,
          singleReadBytes: singleReads.slice(beforeSingle).reduce((sum, read) => sum + read.bytes, 0),
          existsCalls: filesystem.mocks.exists.mock.calls.length - beforeExists,
        });
      }
      expect(snapshots[0]?.files).toEqual(snapshots[1]?.files);
      expect(
        snapshots.map(({ readCalls, readBytes, singleReadCalls, singleReadBytes, existsCalls }) => ({
          readCalls,
          readBytes,
          singleReadCalls,
          singleReadBytes,
          existsCalls,
        })),
      ).toEqual([
        { readCalls: 0, readBytes: 0, singleReadCalls: 9, singleReadBytes: 24, existsCalls: 6 },
        { readCalls: 0, readBytes: 0, singleReadCalls: 9, singleReadBytes: 24, existsCalls: 6 },
      ]);
    } finally {
      await worker.cleanup();
    }
  });

  it('returns the entry digest computed by the export path and changes after a rewrite', async () => {
    const { files, evaluate } = await createHarness({ 'main.ts': 'v1' });
    const first = await evaluate();
    files.set('main.ts', 'v2');
    const second = await evaluate();
    expect(first.success).toBe(true);
    expect(first.sourceRevision?.entry).toBe('main.ts');
    expect(first.sourceRevision?.files['main.ts']).toBe(await writtenDigest('v1'));
    expect(second.sourceRevision?.files['main.ts']).toBe(await writtenDigest('v2'));
  });
  it('admits description and names the same entry revision on evaluation, render, export and snapshotSource', async () => {
    const { worker, evaluate, render, freshExport } = await createHarness({ 'main.ts': 'v1' });
    const expected = await writtenDigest('v1');
    const description = await worker.describe({ file: createGeometryFile('main.ts') });
    const evaluation = await evaluate();
    const rendering = await render();
    const exported = await freshExport();
    const snapshot = await worker.snapshotSource({ file: createGeometryFile('main.ts') });
    expect(description.success).toBe(true);
    if (!description.success) {
      throw new Error('Expected description');
    }
    expect(description.parameters.defaults).toEqual({});
    for (const result of [evaluation, rendering, exported, snapshot]) {
      expect(result.success).toBe(true);
      expect(result.sourceRevision?.files['main.ts']).toBe(expected);
    }
  });
  it('includes evaluation-only dependencies in the rendering revision and identity', async () => {
    const path = 'geometry.flag';
    const middleware = defineMiddleware({
      id: 'geometry-only',
      name: 'Geometry only',
      resolve: () => [{ path, affects: ['evaluate'] }],
    });
    const { files, evaluate, render } = await createHarness({ 'main.ts': 'same', [path]: 'first' }, [middleware()]);
    const firstEvaluation = await evaluate();
    const first = await render();
    files.set(path, 'second');
    const secondEvaluation = await evaluate();
    const second = await render();
    expect(first.success && first.hash).not.toBe(second.success && second.hash);
    expect(first.sourceRevision).toEqual(firstEvaluation.sourceRevision);
    expect(second.sourceRevision).toEqual(secondEvaluation.sourceRevision);
    expect(first.sourceRevision?.files[path]).toBe(await writtenDigest('first'));
    expect(second.sourceRevision?.files[path]).toBe(await writtenDigest('second'));
  });
  it('keeps export-only source identity separate from the pinned committed evaluation', async () => {
    const path = 'export.flag';
    const writeHashes: string[] = [];
    let exportValue = 'first';
    const middleware = defineMiddleware({
      id: 'export-only',
      name: 'Export only',
      resolve: () => [{ path, affects: ['export'] }],
      async wrapExport(input, handler, runtime) {
        writeHashes.push(runtime.dependencyHash);
        const result = await handler(input);
        return result.success
          ? { ...result, data: [{ ...result.data[0], bytes: new TextEncoder().encode(exportValue) }] }
          : result;
      },
    });
    const { worker, files, evaluate } = await createHarness({ 'main.ts': 'same', [path]: exportValue }, [middleware()]);
    const pinned = await evaluate();
    const first = await worker.exportDocument({ documentId: 'live', operationId: 'first', target: 'text' });
    files.set(path, 'second');
    exportValue = 'second';
    const second = await worker.exportDocument({ documentId: 'live', operationId: 'second', target: 'text' });
    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    if (!first.success || !second.success) {
      throw new Error('Expected exports');
    }
    expect(first.files[0].bytes).not.toEqual(second.files[0].bytes);
    expect(first.sourceRevision).toEqual(pinned.sourceRevision);
    expect(second.sourceRevision).toEqual(pinned.sourceRevision);
    expect(first.sourceRevision?.files[path]).toBeUndefined();
    expect(writeHashes[0]).not.toBe(writeHashes[1]);
  });
  it('revalidates a export-only missing dependency when the file appears', async () => {
    const path = 'optional-export.flag';
    let exportValue = 'missing';
    const writeHashes: string[] = [];
    const middleware = defineMiddleware({
      id: 'appearing-export',
      name: 'Appearing export',
      resolve: () => [{ path, affects: ['export'] }],
      async wrapExport(input, handler, runtime) {
        writeHashes.push(runtime.dependencyHash);
        const result = await handler(input);
        return result.success
          ? { ...result, data: [{ ...result.data[0], bytes: new TextEncoder().encode(exportValue) }] }
          : result;
      },
    });
    const { worker, files, evaluate } = await createHarness({ 'main.ts': 'same' }, [middleware()]);
    await evaluate();
    const first = await worker.exportDocument({ documentId: 'live', operationId: 'missing', target: 'text' });
    files.set(path, 'present');
    exportValue = 'present';
    const second = await worker.exportDocument({ documentId: 'live', operationId: 'present', target: 'text' });
    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    if (!first.success || !second.success) {
      throw new Error('Expected exports');
    }
    expect(new TextDecoder().decode(first.files[0].bytes)).toBe('missing');
    expect(new TextDecoder().decode(second.files[0].bytes)).toBe('present');
    expect(first.sourceRevision).toEqual(second.sourceRevision);
    expect(writeHashes[0]).not.toBe(writeHashes[1]);
  });
  it('does not reuse a published handle after an evaluation-only dependency changes', async () => {
    const path = 'geometry.flag';
    const middleware = defineMiddleware({
      id: 'render-cache-source',
      name: 'Render cache source',
      resolve: () => [{ path, affects: ['evaluate'] }],
    });
    const { files, counts, evaluate, render, freshExport } = await createHarness(
      { 'main.ts': 'same', [path]: 'first' },
      [middleware()],
    );
    await evaluate();
    await render();
    const first = await freshExport();
    const builds = counts.evaluations;
    files.set(path, 'second');
    const second = await freshExport();
    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    if (!first.success || !second.success) {
      throw new Error('Expected exports');
    }
    expect(new TextDecoder().decode(first.files[0].bytes)).toBe('first');
    expect(new TextDecoder().decode(second.files[0].bytes)).toBe('second');
    expect(first.sourceRevision).not.toEqual(second.sourceRevision);
    expect(counts.evaluations).toBeGreaterThan(builds);
  });
});
