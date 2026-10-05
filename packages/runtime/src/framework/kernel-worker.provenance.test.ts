/** Exact document/view source revisions and separate pinned-export/export dependencies (R4/I5). */
import { randomUUID } from 'node:crypto';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { digestContent } from '@taucad/cache-core';
import { canonicalJson, sha256String } from '@taucad/utils/hash';
import { KernelRuntimeWorker } from '#framework/kernel-runtime-worker.js';
import { defineRuntime } from '#worker/runtime-definition.js';
import { defineKernelV2 } from '#types/runtime-kernel-v2.types.js';
import { defineMiddlewareV2 as defineMiddleware } from '#middleware/runtime-middleware-v2.js';
import type { MiddlewarePlugin } from '#plugins/plugin-types.js';
import type { MaterializedRender } from '#framework/render-artifact.js';
import type { TelemetryEntry } from '#types/runtime-wire.types.js';
import type { KernelRuntime } from '#types/runtime-kernel.types.js';
import type { ComputeReuseScope, ResidentCacheBinding } from '#types/runtime-compute.types.js';
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
  options: {
    measured?: boolean;
    construction?: boolean;
    onResolve?: () => Promise<void>;
    onDescribe?: (runtime: KernelRuntime) => Promise<void>;
    onEvaluate?: (runtime: KernelRuntime) => void;
  } = {},
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
  const counts = { evaluations: 0, writes: 0, restores: 0 };
  const handles = { valid: true, restoreFails: false };
  const kernel = defineKernelV2({
    id: 'provenance',
    extensions: ['ts'],
    name: 'Provenance',
    version: '1.0.0',
    views: { model: { title: 'Model', mimeType: 'image/svg+xml' } },
    evaluateOptionsSchema: z.object({ size: z.number().default(1), quality: z.number().default(1) }),
    exports: {
      text: {
        title: 'Text',
        mimeType: 'text/plain',
        extension: 'txt',
        optionsSchema: z.object({ size: z.number().optional(), quality: z.number().optional() }),
      },
    },
    async initialize() {
      return {};
    },
    async resolve({ entryPath }) {
      await options.onResolve?.();
      return { resolved: [entryPath], unresolved: [] };
    },
    async describe(_input, runtime) {
      await options.onDescribe?.(runtime);
      return { success: true, data: { parameters: declaration }, issues: [] };
    },
    async evaluate({ entryPath }, runtime) {
      options.onEvaluate?.(runtime);
      counts.evaluations++;
      return { handle: { value: files.get('geometry.flag') ?? files.get(entryPath) ?? '' } };
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
              options.measured ? `${handle.value}:${files.get('export.flag') ?? 'missing'}` : handle.value,
            ),
          },
        ],
      };
    },
    isHandleValid: () => handles.valid,
    serializeHandle: ({ handle }) => handle.value,
    deserializeHandle: ({ serialized }: { serialized: string }) => {
      counts.restores++;
      if (handles.restoreFails) {
        throw new Error('Corrupt pinned handle snapshot');
      }
      return { value: serialized };
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
  return { worker, files, filesystem, counts, handles, evaluate, render, freshExport };
};

describe('document results name the source revision they evaluated (R4)', () => {
  it('should attribute describe evaluate and render spans to actual document operations without inventing cached mesh work', async () => {
    const dependencyDigests: string[] = [];
    const middleware = defineMiddleware({
      id: 'document-trace',
      name: 'DocumentTrace',
      wrapDescribe: async (input, handler) => handler(input),
      wrapEvaluate: async (input, handler) => handler(input),
      wrapRender: async (input, handler, runtime) => {
        dependencyDigests.push(await sha256String(canonicalJson(runtime.dependencies)));
        return handler(input);
      },
    });
    const { worker, evaluate, render } = await createHarness({ 'main.ts': 'same' }, [middleware()]);
    const entries: TelemetryEntry[] = [];
    worker.setTelemetrySend((batch) => entries.push(...batch));
    const drain = () => {
      worker.flushTelemetry();
      return entries.splice(0);
    };
    const evaluation = await evaluate();
    expect(evaluation.success).toBe(true);
    const evaluationDetails = {
      documentId: 'live',
      evaluationId: evaluation.id,
      operationId: `evaluate:live:${evaluation.id}`,
      entryPath: 'main.ts',
      kernelId: 'provenance',
    };
    const evaluated = drain();
    for (const name of ['kernel.resolve-deps', 'kernel.extract-params', 'kernel.compute']) {
      const span = evaluated.find((entry) => entry.name === name);
      expect(span?.detail).toMatchObject(evaluationDetails);
    }
    const evaluationWrappers = evaluated.filter((entry) => entry.name === 'middleware.wrap(DocumentTrace)');
    expect(evaluationWrappers).toHaveLength(2);
    for (const span of evaluationWrappers) {
      expect(span.detail).toMatchObject({
        documentId: 'live',
        evaluationId: evaluation.id,
        operationId: evaluationDetails.operationId,
      });
    }
    const first = await render();
    expect(first.success).toBe(true);
    const expectRenderTrace = (spans: TelemetryEntry[], requestId: string) => {
      const details = {
        documentId: 'live',
        evaluationId: evaluation.id,
        subscriptionId: first.subscriptionId,
        requestId,
        operationId: `render:${first.subscriptionId}:${evaluation.id}:${requestId}`,
      };
      for (const name of ['kernel.mesh', 'kernel.mesh-compute', 'middleware.wrap(DocumentTrace)']) {
        expect(spans.find((entry) => entry.name === name)?.detail).toMatchObject(details);
      }
      expect(spans.find((entry) => entry.name === 'kernel.mesh-compute')?.detail).toMatchObject({
        entryPath: 'main.ts',
        kernelId: 'provenance',
      });
    };
    const rendered = drain();
    expectRenderTrace(rendered, first.requestId);
    const renderHash = rendered.find(
      (entry) => entry.name === 'deps.content-hash' && entry.detail?.['requestId'] === first.requestId,
    );
    expect(renderHash?.detail).toMatchObject({
      documentId: 'live',
      evaluationId: evaluation.id,
      operationId: `render:${first.subscriptionId}:${evaluation.id}:${first.requestId}`,
      subscriptionId: first.subscriptionId,
      requestId: first.requestId,
      entryPath: 'main.ts',
      kernelId: 'provenance',
      dependencyHash: dependencyDigests.at(0),
    });
    expect(renderHash?.detail?.['parentSpanId']).toBeUndefined();
    if (!first.success) {
      throw new Error('Expected a materialized view.');
    }
    expect(renderHash?.detail?.['dependencyHash']).not.toBe(first.hash);
    const update = async (options?: { quality: number }) => {
      const completed = Promise.withResolvers<Parameters<NonNullable<KernelRuntimeWorker['onRendered']>>[0]>();
      const requestId = randomUUID();
      worker.onRendered = (event) => {
        if (event.requestId === requestId) {
          completed.resolve(event);
        }
      };
      worker.handleUpdateView({ subscriptionId: first.subscriptionId, requestId, ...(options ? { options } : {}) });
      return completed.promise;
    };
    const cached = await update();
    expect(cached.success).toBe(true);
    if (!cached.success) {
      throw new Error('Expected an ordinary rendering and its cached projection.');
    }
    expect(cached.artifact).toEqual(first.artifact);
    const cachedTrace = drain();
    expect(
      cachedTrace.filter((entry) =>
        ['kernel.mesh', 'kernel.mesh-compute', 'middleware.wrap(DocumentTrace)'].includes(entry.name),
      ),
    ).toEqual([]);
    expect(cachedTrace.find((entry) => entry.name === 'deps.content-hash')?.detail).toMatchObject({
      requestId: cached.requestId,
      operationId: `render:${first.subscriptionId}:${evaluation.id}:${cached.requestId}`,
      dependencyHash: dependencyDigests.at(0),
    });
    // @ts-expect-error Runtime-private materialized artifact fixture.
    const artifact: MaterializedRender = worker.documents.get('live')?.current?.artifact;
    expect(artifact).toBeDefined();
    artifact.liveNativeHandleSlot = undefined;
    artifact.serializedNativeHandleSlot = undefined;
    const reheated = await update({ quality: 2 });
    expect(reheated.success).toBe(true);
    const reheatTrace = drain();
    expectRenderTrace(reheatTrace, reheated.requestId);
    const meshCompute = reheatTrace.find((entry) => entry.name === 'kernel.mesh-compute');
    expect(meshCompute?.detail?.['spanId']).toBeDefined();
    expect(reheatTrace.find((entry) => entry.name === 'kernel.export-reheat')?.detail?.['parentSpanId']).toBe(
      meshCompute?.detail?.['spanId'],
    );
    expect(
      reheatTrace.find(
        (entry) => entry.name === 'deps.content-hash' && entry.detail?.['requestId'] === reheated.requestId,
      )?.detail?.['dependencyHash'],
    ).toBe(dependencyDigests.at(1));
    const standalone = await worker.describe({ file: createGeometryFile('main.ts') });
    expect(standalone.success).toBe(true);
    const standaloneHashes = drain().filter((entry) => entry.name === 'deps.content-hash');
    expect(standaloneHashes.length).toBeGreaterThan(0);
    for (const hash of standaloneHashes) {
      expect(hash.detail?.['dependencyHash']).toMatch(/^[a-f\d]{64}$/u);
      for (const key of ['documentId', 'evaluationId', 'operationId', 'requestId', 'subscriptionId']) {
        expect(hash.detail?.[key]).toBeUndefined();
      }
    }
  });

  it('should retain the admitted render hash owner across a dependency await and a foreign document admission', async () => {
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    let blocked = false;
    const middleware = defineMiddleware({
      id: 'await-render-dependencies',
      name: 'AwaitRenderDependencies',
      resolve: async () => {
        if (blocked) {
          entered.resolve();
          await release.promise;
        }
        return [];
      },
      wrapRender: async (input, handler) => handler(input),
    });
    const { worker, evaluate, render } = await createHarness({ 'main.ts': 'same', 'second.ts': 'same' }, [
      middleware(),
    ]);
    const evaluation = await evaluate();
    expect(evaluation.success).toBe(true);
    const entries: TelemetryEntry[] = [];
    worker.setTelemetrySend((batch) => entries.push(...batch));
    blocked = true;
    const pendingRender = render();
    await entered.promise;
    const foreignEvaluation = Promise.withResolvers<Parameters<NonNullable<KernelRuntimeWorker['onEvaluated']>>[0]>();
    worker.onEvaluated = (event) => {
      if (event.documentId === 'second') {
        foreignEvaluation.resolve(event);
      }
    };
    worker.handleOpenDocument({
      documentId: 'second',
      intent: 0,
      file: createGeometryFile('second.ts'),
      parameters: {},
      watch: false,
    });
    blocked = false;
    release.resolve();
    const rendering = await pendingRender;
    expect(rendering.success).toBe(true);
    const foreign = await foreignEvaluation.promise;
    expect(foreign.success).toBe(true);
    worker.flushTelemetry();
    const hashes = entries.filter(
      (entry) => entry.name === 'deps.content-hash' && entry.detail?.['requestId'] === rendering.requestId,
    );
    expect(hashes).toHaveLength(1);
    expect(hashes.at(0)?.detail).toMatchObject({
      documentId: 'live',
      evaluationId: evaluation.id,
      operationId: `render:${rendering.subscriptionId}:${evaluation.id}:${rendering.requestId}`,
      requestId: rendering.requestId,
      subscriptionId: rendering.subscriptionId,
      entryPath: 'main.ts',
      kernelId: 'provenance',
    });
    expect(hashes.at(0)?.detail?.['dependencyHash']).toMatch(/^[a-f\d]{64}$/u);
    expect(hashes.at(0)?.detail?.['evaluationId']).not.toBe(foreign.id);
  });

  it('freezes real capability admission across another document await and omits document IDs after a failed evaluation', async () => {
    const resident: ResidentCacheBinding = {
      contains: () => false,
      importEntries: async () => ({ imported: [], omitted: [] }),
      exportEntries: async () => ({ entries: [], omitted: [] }),
      stats: () => ({
        entries: 0,
        logicalBytes: 0,
        encodedBytes: { status: 'unsupported' },
        evictions: 0,
        omissions: 0,
      }),
      clear: () => undefined,
    };
    const scopes: ComputeReuseScope[] = [];
    const openScope = (runtime: KernelRuntime) => {
      if (runtime.compute.status !== 'on') {
        throw new Error('Expected the actual worker compute capability.');
      }
      const scope = runtime.compute.openScope({
        namespace: 'provenance.scope',
        producer: { id: 'provenance', version: '1.0.0', implementationAssets: [] },
        environment: {},
        resident,
      });
      scopes.push(scope);
      return scope;
    };
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    let blocked = false;
    let failed = false;
    let standalone = false;
    const { worker, evaluate } = await createHarness({ 'main.ts': 'same', 'second.ts': 'same' }, [], {
      onEvaluate: (runtime) => {
        openScope(runtime);
      },
      onResolve: async () => {
        if (blocked) {
          entered.resolve();
          await release.promise;
        }
      },
      onDescribe: async (runtime) => {
        if (failed) {
          throw new Error('Actual document description failed');
        }
        if (standalone) {
          openScope(runtime);
        }
      },
    });
    worker.setComputeBinding({ mode: 'memory' });
    const entries: TelemetryEntry[] = [];
    worker.setTelemetrySend((batch) => entries.push(...batch));
    const first = await evaluate();
    expect(first.success).toBe(true);
    const firstScope = scopes.at(0);
    if (!firstScope) {
      throw new Error('The first actual evaluation did not open its scope.');
    }
    const secondCompleted = Promise.withResolvers<Parameters<NonNullable<KernelRuntimeWorker['onEvaluated']>>[0]>();
    worker.onEvaluated = (event) => {
      if (event.documentId === 'second') {
        secondCompleted.resolve(event);
      }
    };
    blocked = true;
    worker.handleOpenDocument({
      documentId: 'second',
      intent: 0,
      file: createGeometryFile('second.ts'),
      parameters: {},
      watch: false,
    });
    await entered.promise;
    const firstReceipt = firstScope.close({ outcome: 'failed' });
    worker.permitComputePublication();
    await expect(firstReceipt.settled).resolves.toMatchObject({ status: 'abandoned', reason: 'failed' });
    release.resolve();
    const second = await secondCompleted.promise;
    expect(second.success).toBe(true);
    blocked = false;
    const secondScope = scopes.at(1);
    if (!secondScope) {
      throw new Error('The second actual evaluation did not open its scope.');
    }
    const secondReceipt = secondScope.close({ outcome: 'cancelled' });
    worker.permitComputePublication();
    await expect(secondReceipt.settled).resolves.toMatchObject({ status: 'abandoned', reason: 'cancelled' });
    failed = true;
    const failedEvaluation = await evaluate();
    expect(failedEvaluation.success).toBe(false);
    failed = false;
    standalone = true;
    const standaloneDescription = await worker.describe({ file: createGeometryFile('main.ts') });
    expect(standaloneDescription.success).toBe(true);
    const standaloneScope = scopes.at(2);
    if (!standaloneScope) {
      throw new Error('The standalone description did not open its actual scope.');
    }
    const standaloneReceipt = standaloneScope.close({ outcome: 'cancelled' });
    worker.permitComputePublication();
    await standaloneReceipt.settled;
    worker.flushTelemetry();
    const settlements = entries.filter((entry) => entry.name === 'kernel.compute.reuse');
    expect(settlements).toHaveLength(3);
    const [firstSettlement, secondSettlement, standaloneSettlement] = settlements;
    expect(firstSettlement?.detail).toMatchObject({
      documentId: 'live',
      evaluationId: first.id,
      documentOperationId: `evaluate:live:${first.id}`,
      entryPath: 'main.ts',
      kernelId: 'provenance',
      status: 'abandoned',
    });
    expect(secondSettlement?.detail).toMatchObject({
      documentId: 'second',
      evaluationId: second.id,
      documentOperationId: `evaluate:second:${second.id}`,
      entryPath: 'second.ts',
      kernelId: 'provenance',
    });
    const secondDependencyRoot = entries.find(
      (entry) => entry.name === 'kernel.resolve-deps' && entry.detail?.['documentId'] === 'second',
    );
    expect(secondDependencyRoot).toBeDefined();
    const firstParentId = firstSettlement?.detail?.['parentSpanId'];
    let actualAncestor =
      typeof firstParentId === 'string'
        ? entries.find((entry) => entry.detail?.['spanId'] === firstParentId)
        : undefined;
    while (actualAncestor && actualAncestor !== secondDependencyRoot) {
      const parentId = actualAncestor.detail?.['parentSpanId'];
      actualAncestor =
        typeof parentId === 'string' ? entries.find((entry) => entry.detail?.['spanId'] === parentId) : undefined;
    }
    expect(actualAncestor).toBe(secondDependencyRoot);
    for (const settlement of settlements) {
      expect(settlement.detail?.['operationId']).toEqual(expect.any(String));
      expect(settlement.detail?.['operationId']).not.toBe(settlement.detail?.['documentOperationId']);
    }
    for (const key of ['documentId', 'evaluationId', 'documentOperationId', 'requestId', 'subscriptionId']) {
      expect(standaloneSettlement?.detail?.[key]).toBeUndefined();
    }
    const dependencies = entries.filter(
      (entry) => entry.name === 'kernel.resolve-deps' && entry.detail?.['documentId'] === 'second',
    );
    expect(dependencies).toHaveLength(2);
    for (const dependency of dependencies) {
      expect(dependency.detail).toMatchObject({
        documentId: 'second',
        evaluationId: second.id,
        operationId: `evaluate:second:${second.id}`,
        entryPath: 'second.ts',
        kernelId: 'provenance',
      });
    }
  });

  it('should keep pinned evaluation bytes and export-cache identity after external source rewrites', async () => {
    const dependencies: Array<{ hash: string; files: string[] }> = [];
    const middleware = defineMiddleware({
      id: 'pinned-export-dependencies',
      name: 'Pinned export dependencies',
      resolve: () => [
        { path: 'geometry.flag', affects: ['evaluate'] },
        { path: 'export.flag', affects: ['export'] },
      ],
      async wrapExport(input, handler, runtime) {
        dependencies.push({
          hash: runtime.dependencyHash,
          files: runtime.dependencies
            .filter((dependency) => dependency.type === 'file')
            .map(({ path, contentHash }) => `${path}:${contentHash}`),
        });
        return handler(input);
      },
    });
    const { worker, files, counts, evaluate } = await createHarness(
      { 'main.ts': 'original', 'geometry.flag': 'g1', 'export.flag': 'e1' },
      [middleware()],
      { measured: true },
    );
    const pinned = await evaluate();
    const first = await worker.exportDocument({ documentId: 'live', operationId: 'first', target: 'text' });
    files.set('main.ts', 'rewritten');
    files.set('geometry.flag', 'g2');
    const second = await worker.exportDocument({ documentId: 'live', operationId: 'second', target: 'text' });
    files.set('export.flag', 'e2');
    const third = await worker.exportDocument({ documentId: 'live', operationId: 'third', target: 'text' });
    for (const [result, expected] of [
      [first, 'g1:e1'],
      [second, 'g1:e1'],
      [third, 'g1:e2'],
    ] as const) {
      expect(result.success, JSON.stringify(result.issues)).toBe(true);
      if (!result.success) {
        throw new Error('Expected a pinned export');
      }
      expect(new TextDecoder().decode(result.files[0].bytes)).toBe(expected);
      expect(result.sourceRevision).toEqual(pinned.sourceRevision);
    }
    expect(counts.evaluations).toBe(1);
    expect(dependencies[0]?.hash).toBe(dependencies[1]?.hash);
    expect(dependencies[1]?.hash).not.toBe(dependencies[2]?.hash);
    const originalDigest = await writtenDigest('original');
    const geometryDigest = await writtenDigest('g1');
    const exportDigest = await writtenDigest('e2');
    expect(dependencies[1]?.files).toContain(`main.ts:${originalDigest.slice('sha256:'.length)}`);
    expect(dependencies[1]?.files).toContain(`geometry.flag:${geometryDigest.slice('sha256:'.length)}`);
    expect(dependencies[2]?.files).toContain(`export.flag:${exportDigest.slice('sha256:'.length)}`);
  });

  it.each(['lost', 'stale', 'restore-failed', 'restored'] as const)(
    'should preserve pinned source refusal and restoration when the original handle is %s',
    async (scenario) => {
      const { worker, files, counts, handles, evaluate } = await createHarness({ 'main.ts': 'original' });
      const pinned = await evaluate();
      // @ts-expect-error -- Owner regression injects loss into the retained private document artifact.
      const artifact: MaterializedRender = worker.documents.get('live').current.artifact;
      if (artifact.serializedNativeHandleSlot) {
        artifact.serializedNativeHandleSlot.serializedNativeHandle = structuredClone(
          artifact.serializedNativeHandleSlot.serializedNativeHandle,
        );
      }
      if (scenario === 'stale') {
        handles.valid = false;
      } else {
        artifact.liveNativeHandleSlot = undefined;
      }
      if (scenario === 'lost' || scenario === 'stale') {
        artifact.serializedNativeHandleSlot = undefined;
      }
      handles.restoreFails = scenario === 'restore-failed';
      files.set('main.ts', 'rewritten');
      const result = await worker.exportDocument({ documentId: 'live', operationId: scenario, target: 'text' });
      if (scenario === 'restored') {
        expect(result.success, JSON.stringify(result.issues)).toBe(true);
        if (!result.success) {
          throw new Error('Expected restored pinned export');
        }
        expect(new TextDecoder().decode(result.files[0].bytes)).toBe('original');
        expect(result.sourceRevision).toEqual(pinned.sourceRevision);
        expect(counts.restores).toBe(1);
      } else {
        expect(result).toMatchObject({
          success: false,
          issues: [
            {
              code: 'SOURCE_SNAPSHOT_CHANGED',
              type: 'runtime',
              severity: 'error',
              message: 'The committed source changed before its native export handle could be rebuilt.',
            },
          ],
        });
        expect(counts.writes).toBe(0);
        expect(counts.restores).toBe(scenario === 'restore-failed' ? 1 : 0);
      }
      expect(counts.evaluations).toBe(1);
    },
  );

  it('should refuse incompatible construction options after pinned source changes', async () => {
    const { worker, files, counts, evaluate } = await createHarness({ 'main.ts': 'original' }, [], {
      construction: true,
    });
    await evaluate();
    files.set('main.ts', 'rewritten');
    const result = await worker.exportDocument({
      documentId: 'live',
      operationId: 'incompatible',
      target: 'text',
      options: { quality: 2 },
    });
    expect(result).toMatchObject({ success: false, issues: [{ code: 'SOURCE_SNAPSHOT_CHANGED' }] });
    expect(counts.evaluations).toBe(1);
    expect(counts.writes).toBe(0);
  });

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
    // @ts-expect-error Runtime-private materialized artifact fixture.
    const artifact: MaterializedRender = worker.documents.get('live')?.current?.artifact;
    expect(artifact).toBeDefined();
    artifact.liveNativeHandleSlot = undefined;
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
    // @ts-expect-error Runtime-private materialized artifact fixture.
    const artifact: MaterializedRender = worker.documents.get('live')?.current?.artifact;
    expect(artifact).toBeDefined();
    artifact.liveNativeHandleSlot = undefined;
    artifact.serializedNativeHandleSlot = undefined;
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
      { measured: true },
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
