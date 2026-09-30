import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { msgpackCodec } from '@taucad/rpc/codec/msgpack';
import { createKernelSuccess } from '#kernels/kernel-helpers.js';
import { KernelRuntimeWorker } from '#framework/kernel-runtime-worker.js';
import { sourceRevisionFileDigest } from '#framework/kernel-worker.js';
import { defineKernelV2 } from '#types/runtime-kernel-v2.types.js';
import { defineMiddlewareV2 } from '#middleware/runtime-middleware-v2.js';
import { defineRuntime } from '#worker/runtime-definition.js';
import { defineTranscoder } from '#types/runtime-transcoder.types.js';
import { abortReason } from '#types/runtime-protocol.types.js';
import { runtimeDocumentProtocolSchemas } from '#types/runtime-document-protocol.schemas.js';
import { checkAbort } from '#framework/cooperative-abort.js';
import { signalDocumentAbort } from '#transport/_internal/abort-channel.js';
/* oxlint-disable no-restricted-imports, import/extensions -- Runtime-private white-box fixture. */
import {
  createGeometryFile,
  getTestFileSystem,
  initializeWorkerForTesting,
  seedTestFileSystem,
} from '../../test/support/kernel-worker.fixture.js';
/* oxlint-enable no-restricted-imports, import/extensions */

const parameters = {
  schema: {
    $schema: 'https://json-structure.org/meta/extended/v0/#',
    $id: 'urn:taucad:test:v2-kernel',
    $uses: ['JSONSchemaUnits'],
    name: 'V2KernelParameters',
    type: 'object',
  },
  defaults: {},
} as const;

describe('v2 kernel boundary with the current client', () => {
  it('retains missing optional dependencies as wire revision tokens', () => {
    const path = '.tau/parameters/model.circuit.json';
    expect(sourceRevisionFileDigest('missing', path)).toBe('missing');
    expect(sourceRevisionFileDigest('a'.repeat(64), path)).toBe(`sha256:${'a'.repeat(64)}`);
  });

  it('preserves a model dependency named __proto__ as an own source-revision key', async () => {
    const kernel = defineKernelV2({
      id: 'prototype-path',
      extensions: ['circuit'] as const,
      name: 'Prototype path',
      version: '1.0.0',
      views: {},
      exports: {},
      async initialize() {
        return {};
      },
      async resolve({ entryPath }) {
        return { resolved: [entryPath, '__proto__'], unresolved: [] };
      },
      async describe() {
        return createKernelSuccess({ parameters });
      },
      async evaluate(_input, runtime) {
        const dependency = await runtime.filesystem.readFile('__proto__', 'utf8');
        return { handle: { dependency }, views: [] as const, exports: [] as const };
      },
    })();
    await seedTestFileSystem(
      Object.fromEntries([
        ['model.circuit', 'board'],
        ['__proto__', 'dependency'],
      ]),
    );
    const worker = new KernelRuntimeWorker({ runtime: defineRuntime({ kernels: [kernel] }) });
    await initializeWorkerForTesting(worker);
    const evaluated: Array<Parameters<NonNullable<KernelRuntimeWorker['onEvaluated']>>[0]> = [];
    worker.onEvaluated = (event) => {
      evaluated.push(event);
    };
    try {
      worker.handleOpenDocument({
        documentId: 'doc',
        intent: 1,
        file: createGeometryFile('model.circuit'),
        parameters: {},
        watch: false,
      });
      await vi.waitFor(() => {
        expect(evaluated).toHaveLength(1);
      });
      expect(evaluated[0]?.success, JSON.stringify(evaluated[0]?.issues)).toBe(true);
      const files = evaluated[0]?.sourceRevision?.files;
      expect(Object.hasOwn(files ?? {}, '__proto__')).toBe(true);
      expect(Object.getOwnPropertyDescriptor(files, '__proto__')?.value).toMatch(/^sha256:[0-9a-f]{64}$/u);
    } finally {
      await worker.cleanup();
    }
  });

  it('admits own prototype-named views and instances without admitting inherited view names', async () => {
    const kernel = defineKernelV2({
      id: 'special-view-names',
      extensions: ['circuit'] as const,
      name: 'Special views',
      version: '1.0.0',
      views: {
        ['__proto__']: { title: 'Prototype', mimeType: 'image/svg+xml', instances: true },
        constructor: { title: 'Constructor', mimeType: 'image/svg+xml' },
      },
      exports: {},
      async initialize() {
        return {};
      },
      async resolve({ entryPath }) {
        return { resolved: [entryPath], unresolved: [] };
      },
      async describe() {
        return createKernelSuccess({ parameters });
      },
      async evaluate() {
        return {
          handle: {},
          views: ['__proto__', 'constructor'] as const,
          exports: [] as const,
          instances: Object.fromEntries([['__proto__', [{ id: 'part', title: 'Part' }]]]),
        };
      },
      async render() {
        return { content: '<svg xmlns="http://www.w3.org/2000/svg"/>' };
      },
    })();
    await seedTestFileSystem({ 'model.circuit': 'board' });
    const worker = new KernelRuntimeWorker({ runtime: defineRuntime({ kernels: [kernel] }) });
    await initializeWorkerForTesting(worker);
    const evaluated: Array<Parameters<NonNullable<KernelRuntimeWorker['onEvaluated']>>[0]> = [];
    const rendered: Array<Parameters<NonNullable<KernelRuntimeWorker['onRendered']>>[0]> = [];
    worker.onEvaluated = (event) => {
      evaluated.push(event);
    };
    worker.onRendered = (event) => {
      rendered.push(event);
    };
    try {
      worker.handleOpenDocument({
        documentId: 'special',
        intent: 0,
        file: createGeometryFile('model.circuit'),
        parameters: {},
        watch: false,
      });
      await vi.waitFor(() => {
        expect(evaluated).toHaveLength(1);
      });
      expect(evaluated[0]?.success).toBe(true);
      if (evaluated[0]?.success) {
        expect(evaluated[0].views.map((view) => view.id)).toEqual(['__proto__', 'constructor']);
        expect(evaluated[0].views[0]?.instances).toEqual([{ id: 'part', title: 'Part' }]);
      }
      worker.handleOpenView({
        documentId: 'special',
        subscriptionId: 'own',
        requestId: 'r1',
        view: '__proto__',
        instance: 'part',
      });
      worker.handleOpenView({ documentId: 'special', subscriptionId: 'inherited', requestId: 'r2', view: 'toString' });
      await vi.waitFor(() => {
        expect(rendered).toHaveLength(2);
      });
      expect(rendered.find((event) => event.subscriptionId === 'own')?.success).toBe(true);
      expect(rendered.find((event) => event.subscriptionId === 'inherited')?.issues[0]?.code).toBe('VIEW_UNKNOWN');
    } finally {
      await worker.cleanup();
    }
  });

  it.each([
    ['image/svg+xml', new Uint8Array([1]), 'SVG_DOCUMENT_INVALID'],
    ['model/gltf-binary', 'not bytes', 'GLTF_BYTES_INVALID'],
    ['application/x-cad', 'opaque', undefined],
  ] as const)('admits a %s view with its media-specific content rule', async (mimeType, content, expectedCode) => {
    const kernel = defineKernelV2({
      id: 'media',
      extensions: ['circuit'] as const,
      name: 'Media',
      version: '1.0.0',
      views: { display: { title: 'Display', mimeType } },
      exports: {},
      async initialize() {
        return {};
      },
      async resolve({ entryPath }) {
        return { resolved: [entryPath], unresolved: [] };
      },
      async describe() {
        return createKernelSuccess({ parameters });
      },
      async evaluate() {
        return { handle: {}, views: ['display'] as const, exports: [] as const };
      },
      async render() {
        return { content };
      },
    })();
    await seedTestFileSystem({ 'model.circuit': 'board' });
    const worker = new KernelRuntimeWorker({ runtime: defineRuntime({ kernels: [kernel] }) });
    await initializeWorkerForTesting(worker);
    const rendered: Array<Parameters<NonNullable<KernelRuntimeWorker['onRendered']>>[0]> = [];
    worker.onRendered = (event) => {
      rendered.push(event);
    };
    try {
      worker.handleOpenDocument({
        documentId: 'doc',
        intent: 1,
        file: createGeometryFile('model.circuit'),
        parameters: {},
        watch: false,
      });
      worker.handleOpenView({ documentId: 'doc', subscriptionId: 'view', requestId: 'r1', options: {} });
      await vi.waitFor(() => {
        expect(rendered).toHaveLength(1);
      });
      expect(rendered[0]?.success).toBe(expectedCode === undefined);
      if (expectedCode) {
        expect(rendered[0]?.issues[0]?.code).toBe(expectedCode);
      }
    } finally {
      await worker.cleanup();
    }
  });

  it('acknowledges a cooperative document timeout with its exact operation ID', async () => {
    const evaluating = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const kernel = defineKernelV2({
      id: 'deadline',
      extensions: ['circuit'] as const,
      name: 'Deadline',
      version: '1.0.0',
      views: {},
      exports: {},
      async initialize() {
        return {};
      },
      async resolve({ entryPath }) {
        return { resolved: [entryPath], unresolved: [] };
      },
      async describe() {
        return createKernelSuccess({ parameters });
      },
      async evaluate() {
        evaluating.resolve();
        await release.promise;
        return { handle: {}, views: [] as const, exports: [] as const };
      },
    })();
    await seedTestFileSystem({ 'model.circuit': 'board' });
    const worker = new KernelRuntimeWorker({ runtime: defineRuntime({ kernels: [kernel] }) });
    await initializeWorkerForTesting(worker);
    const errors: Array<Parameters<NonNullable<KernelRuntimeWorker['onDocumentError']>>[0]> = [];
    const evaluations: Array<Parameters<NonNullable<KernelRuntimeWorker['onEvaluating']>>[0]> = [];
    worker.onDocumentError = (event) => {
      errors.push(event);
    };
    worker.onEvaluating = (event) => {
      evaluations.push(event);
    };
    try {
      worker.handleOpenDocument({
        documentId: 'doc',
        intent: 1,
        file: createGeometryFile('model.circuit'),
        parameters: {},
        watch: false,
      });
      await evaluating.promise;
      const evaluationId = evaluations[0]?.evaluationId;
      expect(evaluationId).toBeDefined();
      worker.handleOperationAbort({ operationId: `evaluate:doc:${evaluationId}`, reason: abortReason.timeout });
      release.resolve();
      await vi.waitFor(() => {
        expect(errors).toContainEqual(
          expect.objectContaining({
            scope: 'operation',
            operationId: `evaluate:doc:${evaluationId}`,
            evaluationId,
            code: 'OPERATION_TIMEOUT',
          }),
        );
      });
    } finally {
      release.resolve();
      await worker.cleanup();
    }
  });

  it('aborts a superseded unpinned native document evaluation', async () => {
    const entered = Promise.withResolvers<void>();
    const stopped = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    let calls = 0;
    const kernel = defineKernelV2({
      id: 'supersession',
      extensions: ['circuit'] as const,
      name: 'Supersession',
      version: '1.0.0',
      views: {},
      exports: {},
      async initialize() {
        return {};
      },
      async resolve({ entryPath }) {
        return { resolved: [entryPath], unresolved: [] };
      },
      async describe() {
        return createKernelSuccess({ parameters });
      },
      async evaluate(_input, runtime) {
        calls++;
        if (calls === 2) {
          entered.resolve();
          await Promise.race([
            release.promise,
            new Promise<void>((resolve) => {
              runtime.signal.addEventListener(
                'abort',
                () => {
                  resolve();
                },
                { once: true },
              );
            }),
          ]);
          if (runtime.signal.aborted) {
            stopped.resolve();
          }
          runtime.signal.throwIfAborted();
        }
        return { handle: {}, views: [] as const, exports: [] as const };
      },
    })();
    await seedTestFileSystem({ 'model.circuit': 'board' });
    const worker = new KernelRuntimeWorker({ runtime: defineRuntime({ kernels: [kernel] }) });
    await initializeWorkerForTesting(worker);
    const evaluated: Array<Parameters<NonNullable<KernelRuntimeWorker['onEvaluated']>>[0]> = [];
    worker.onEvaluated = (event) => {
      evaluated.push(event);
    };
    try {
      worker.handleOpenDocument({
        documentId: 'doc',
        intent: 1,
        file: createGeometryFile('model.circuit'),
        parameters: {},
        watch: false,
      });
      await vi.waitFor(() => {
        expect(evaluated).toHaveLength(1);
      });
      worker.handleUpdateDocument({
        documentId: 'doc',
        intent: 2,
        stage: { 'model.circuit': new TextEncoder().encode('heavy') },
      });
      await entered.promise;
      worker.handleUpdateDocument({
        documentId: 'doc',
        intent: 3,
        stage: { 'model.circuit': new TextEncoder().encode('light') },
      });
      await stopped.promise;
      await vi.waitFor(() => {
        expect(evaluated.at(-1)?.intent).toBe(3);
      });
      expect(evaluated.map((event) => event.intent)).toEqual([1, 3]);
    } finally {
      release.resolve();
      await worker.cleanup();
    }
  });

  it('uses an exact SAB generation to interrupt synchronous native work without aborting another document', async () => {
    const kernel = defineKernelV2({
      id: 'shared-abort',
      extensions: ['circuit'] as const,
      name: 'Shared abort',
      version: '1.0.0',
      views: {},
      exports: {},
      async initialize() {
        return {};
      },
      async resolve({ entryPath }) {
        return { resolved: [entryPath], unresolved: [] };
      },
      async describe() {
        return createKernelSuccess({ parameters });
      },
      async evaluate() {
        checkAbort();
        return { handle: {}, views: [] as const, exports: [] as const };
      },
    })();
    await seedTestFileSystem({ 'model.circuit': 'board' });
    const worker = new KernelRuntimeWorker({ runtime: defineRuntime({ kernels: [kernel] }) });
    await initializeWorkerForTesting(worker);
    const signalBuffer = new SharedArrayBuffer(16);
    worker.setSignalBuffer(signalBuffer);
    let oldGeneration: number | undefined;
    const evaluated: Array<Parameters<NonNullable<KernelRuntimeWorker['onEvaluated']>>[0]> = [];
    worker.onEvaluated = (event) => {
      evaluated.push(event);
    };
    worker.onDocumentProgressUpdate = (event) => {
      if (event.phase === 'evaluate' && event.documentId === 'first') {
        oldGeneration = event.detail?.['abortGeneration'] as number;
        // An evaluating notification already exposed the ID; the progress
        // payload carrying the generation may still be in transit.
        expect(signalDocumentAbort(signalBuffer, event.evaluationId, undefined, abortReason.superseded)).toBe(true);
      }
    };
    try {
      worker.handleOpenDocument({
        documentId: 'first',
        intent: 0,
        file: createGeometryFile('model.circuit'),
        parameters: {},
        watch: false,
      });
      await vi.waitFor(() => {
        expect(oldGeneration).toBeDefined();
      });
      worker.handleOpenDocument({
        documentId: 'second',
        intent: 0,
        file: createGeometryFile('model.circuit'),
        parameters: {},
        watch: false,
      });
      await vi.waitFor(() => {
        expect(evaluated.some((event) => event.documentId === 'second')).toBe(true);
      });
      expect(signalDocumentAbort(signalBuffer, '1', oldGeneration, abortReason.superseded)).toBe(false);
      expect(evaluated.some((event) => event.documentId === 'first')).toBe(false);
      expect(evaluated.find((event) => event.documentId === 'second')?.success).toBe(true);
    } finally {
      await worker.cleanup();
    }
  });

  it('arms distinct shared abort tokens at native render and write hooks', async () => {
    const render = vi.fn(async () => {
      checkAbort();
      return { content: '<svg xmlns="http://www.w3.org/2000/svg"/>' };
    });
    const write = vi.fn(async () => {
      checkAbort();
      return { files: [{ name: 'bom.txt', mimeType: 'text/plain', bytes: new TextEncoder().encode('ok') }] as const };
    });
    const kernel = defineKernelV2({
      id: 'native-hook-abort',
      extensions: ['circuit'] as const,
      name: 'Native hook abort',
      version: '1.0.0',
      views: { model: { title: 'Model', mimeType: 'image/svg+xml' } },
      exports: { bom: { title: 'BOM', mimeType: 'text/plain', extension: 'txt' } },
      async initialize() {
        return {};
      },
      async resolve({ entryPath }) {
        return { resolved: [entryPath], unresolved: [] };
      },
      async describe() {
        return createKernelSuccess({ parameters });
      },
      async evaluate() {
        return { handle: {}, views: ['model'] as const, exports: ['bom'] as const };
      },
      render,
      write,
    })();
    await seedTestFileSystem({ 'model.circuit': 'board' });
    const worker = new KernelRuntimeWorker({ runtime: defineRuntime({ kernels: [kernel] }) });
    await initializeWorkerForTesting(worker);
    const buffer = new SharedArrayBuffer(16);
    worker.setSignalBuffer(buffer);
    const phases: string[] = [];
    worker.onDocumentProgressUpdate = (event) => {
      if (event.phase !== 'render' && event.phase !== 'write') {
        return;
      }
      phases.push(event.phase);
      const sequence = event.detail?.['abortSequence'];
      const generation = event.detail?.['abortGeneration'];
      expect(typeof sequence).toBe('number');
      expect(typeof generation).toBe('number');
      expect(signalDocumentAbort(buffer, String(sequence), generation as number, abortReason.timeout)).toBe(true);
    };
    const errors: Array<Parameters<NonNullable<KernelRuntimeWorker['onDocumentError']>>[0]> = [];
    worker.onDocumentError = (event) => {
      errors.push(event);
    };
    try {
      worker.handleOpenDocument({
        documentId: 'doc',
        intent: 0,
        file: createGeometryFile('model.circuit'),
        parameters: {},
        watch: false,
      });
      worker.handleOpenView({ documentId: 'doc', subscriptionId: 'view', requestId: 'r1', options: {} });
      await vi.waitFor(() => {
        expect(errors.some((event) => event.scope === 'operation' && event.phase === 'render')).toBe(true);
      });
      await expect(worker.exportDocument({ documentId: 'doc', operationId: 'write', target: 'bom' })).rejects.toThrow();
      expect(errors.some((event) => event.scope === 'operation' && event.phase === 'write')).toBe(true);
      expect(phases).toEqual(['render', 'write']);
      expect(render).toHaveBeenCalledOnce();
      expect(write).toHaveBeenCalledOnce();
    } finally {
      await worker.cleanup();
    }
  });

  it('releases a closed document handle only after an active view render leaves the lane', async () => {
    const rendering = Promise.withResolvers<void>();
    const releaseRender = Promise.withResolvers<void>();
    const releaseHandle = vi.fn();
    const kernel = defineKernelV2({
      id: 'close-render',
      extensions: ['circuit'] as const,
      name: 'Close render',
      version: '1.0.0',
      views: { display: { title: 'Display', mimeType: 'image/svg+xml' } },
      exports: {},
      async initialize() {
        return {};
      },
      async resolve({ entryPath }) {
        return { resolved: [entryPath], unresolved: [] };
      },
      async describe() {
        return createKernelSuccess({ parameters });
      },
      async evaluate() {
        return { handle: { id: 1 }, views: ['display'] as const, exports: [] as const };
      },
      async render() {
        rendering.resolve();
        await releaseRender.promise;
        return { content: '<svg xmlns="http://www.w3.org/2000/svg"/>' };
      },
      releaseHandle,
    })();
    await seedTestFileSystem({ 'model.circuit': 'board' });
    const worker = new KernelRuntimeWorker({ runtime: defineRuntime({ kernels: [kernel] }) });
    await initializeWorkerForTesting(worker);
    const rendered = vi.fn();
    worker.onRendered = rendered;
    try {
      worker.handleOpenDocument({
        documentId: 'doc',
        intent: 1,
        file: createGeometryFile('model.circuit'),
        parameters: {},
        watch: false,
      });
      worker.handleOpenView({ documentId: 'doc', subscriptionId: 'view', requestId: 'r1', options: {} });
      await rendering.promise;
      worker.handleCloseDocument({ documentId: 'doc' });
      expect(releaseHandle).not.toHaveBeenCalled();
      releaseRender.resolve();
      await vi.waitFor(() => {
        expect(releaseHandle).toHaveBeenCalledOnce();
      });
      expect(rendered).not.toHaveBeenCalled();
    } finally {
      releaseRender.resolve();
      await worker.cleanup();
    }
    expect(releaseHandle).toHaveBeenCalledOnce();
  });

  it('does not publish a watched evaluation whose new dependency changes while arming observation', async () => {
    const evaluate = vi.fn(async () => ({ handle: {}, views: [] as const, exports: [] as const }));
    const kernel = defineKernelV2({
      id: 'watch-arm',
      extensions: ['circuit'] as const,
      name: 'Watch arm',
      version: '1.0.0',
      views: {},
      exports: {},
      async initialize() {
        return {};
      },
      async resolve({ entryPath }) {
        return { resolved: [entryPath, 'dep.circuit'], unresolved: [] };
      },
      async describe() {
        return createKernelSuccess({ parameters });
      },
      evaluate,
    })();
    await seedTestFileSystem({ 'model.circuit': 'board', 'dep.circuit': 'old' });
    const base = getTestFileSystem();
    let changed = false;
    const inlineFileSystem = Object.assign(base, {
      watch: () => () => undefined,
      watchReady: () => ({
        unsubscribe: () => undefined,
        ready: (async () => {
          if (!changed) {
            changed = true;
            await base.writeFile('dep.circuit', new TextEncoder().encode('new'));
          }
        })(),
      }),
    });
    const worker = new KernelRuntimeWorker({ runtime: defineRuntime({ kernels: [kernel] }) });
    await worker.initialize({
      callbacks: { onLog: () => undefined },
      transferables: { inlineFileSystem },
      options: {},
    });
    const evaluated: Array<Parameters<NonNullable<KernelRuntimeWorker['onEvaluated']>>[0]> = [];
    worker.onEvaluated = (event) => {
      evaluated.push(event);
    };
    try {
      worker.handleOpenDocument({
        documentId: 'doc',
        intent: 1,
        file: createGeometryFile('model.circuit'),
        parameters: {},
        watch: true,
      });
      await vi.waitFor(() => {
        expect(evaluated).toHaveLength(1);
      });
      expect(changed).toBe(true);
      expect(evaluate).toHaveBeenCalledTimes(2);
      expect(evaluated[0]?.success).toBe(true);
    } finally {
      await worker.cleanup();
    }
  });

  it('rejects a route with a required edge option owned by its source export', async () => {
    const kernel = defineKernelV2({
      id: 'route-collision',
      extensions: ['circuit'] as const,
      name: 'Route collision',
      version: '1.0.0',
      views: {},
      exports: {
        source: {
          title: 'Source',
          mimeType: 'text/plain',
          extension: 'txt',
          optionsSchema: z.object({ delimiter: z.string() }),
        },
      },
      async initialize() {
        return {};
      },
      async resolve({ entryPath }) {
        return { resolved: [entryPath], unresolved: [] };
      },
      async describe() {
        return createKernelSuccess({ parameters });
      },
      async evaluate() {
        return { handle: {}, views: [] as const, exports: ['source'] as const };
      },
      async write() {
        return { files: [{ name: 'source.txt', mimeType: 'text/plain', bytes: new Uint8Array([1]) }] as const };
      },
    })();
    const transcoder = defineTranscoder({
      id: 'required-collision',
      name: 'Required collision',
      version: '1.0.0',
      edges: [{ from: 'txt', to: 'csv', fidelity: 'mesh', optionsSchema: z.object({ delimiter: z.string() }) }],
      async initialize() {
        return {};
      },
      async transcode() {
        return {
          success: true,
          data: [{ name: 'out.csv', mimeType: 'text/csv', bytes: new Uint8Array([1]) }],
          issues: [],
        };
      },
    })();
    await seedTestFileSystem({ 'model.circuit': 'board' });
    const worker = new KernelRuntimeWorker({
      runtime: defineRuntime({ kernels: [kernel], transcoders: [transcoder] }),
    });
    await initializeWorkerForTesting(worker);
    const evaluated: Array<Parameters<NonNullable<KernelRuntimeWorker['onEvaluated']>>[0]> = [];
    worker.onEvaluated = (event) => {
      evaluated.push(event);
    };
    try {
      worker.handleOpenDocument({
        documentId: 'doc',
        intent: 1,
        file: createGeometryFile('model.circuit'),
        parameters: {},
        watch: false,
      });
      await vi.waitFor(() => {
        expect(evaluated).toHaveLength(1);
      });
      expect(evaluated[0]?.success).toBe(false);
      expect(evaluated[0]?.issues[0]?.message).toMatch(/requires source-owned export options delimiter/);
    } finally {
      await worker.cleanup();
    }
  });

  it('rejects a first offered view whose options are not defaultable', async () => {
    const render = vi.fn(async () => ({ content: '<svg xmlns="http://www.w3.org/2000/svg"/>' }));
    const kernel = defineKernelV2({
      id: 'bad-default',
      extensions: ['circuit'] as const,
      name: 'Bad default',
      version: '1.0.0',
      views: {
        required: { title: 'Required', mimeType: 'image/svg+xml', optionsSchema: z.object({ label: z.string() }) },
      },
      exports: {},
      async initialize() {
        return {};
      },
      async resolve({ entryPath }) {
        return { resolved: [entryPath], unresolved: [] };
      },
      async describe() {
        return createKernelSuccess({ parameters });
      },
      async evaluate() {
        return { handle: {}, views: ['required'] as const, exports: [] as const };
      },
      render,
    })();
    await seedTestFileSystem({ 'model.circuit': 'board' });
    const worker = new KernelRuntimeWorker({ runtime: defineRuntime({ kernels: [kernel] }) });
    await initializeWorkerForTesting(worker);
    const evaluated: Array<Parameters<NonNullable<KernelRuntimeWorker['onEvaluated']>>[0]> = [];
    worker.onEvaluated = (event) => {
      evaluated.push(event);
    };
    try {
      worker.handleOpenDocument({
        documentId: 'doc',
        intent: 1,
        file: createGeometryFile('model.circuit'),
        parameters: {},
        watch: false,
      });
      await vi.waitFor(() => {
        expect(evaluated).toHaveLength(1);
      });
      expect(evaluated[0]).toMatchObject({
        success: false,
        issues: [expect.objectContaining({ code: 'VIEW_OPTIONS_INVALID' })],
      });
      expect(render).not.toHaveBeenCalled();
    } finally {
      await worker.cleanup();
    }
  });

  it('projects two subscriptions from one evaluation and admits a required secondary view', async () => {
    const evaluate = vi.fn(async () => ({
      handle: { value: 1 },
      views: ['primary', 'secondary'] as const,
      exports: [] as const,
    }));
    const render = vi.fn(async ({ view }: { view: string }) => ({
      content: `<svg xmlns="http://www.w3.org/2000/svg"><text>${view}</text></svg>`,
    }));
    const kernel = defineKernelV2({
      id: 'two-views',
      extensions: ['circuit'] as const,
      name: 'Two views',
      version: '1.0.0',
      views: {
        primary: { title: 'Primary', mimeType: 'image/svg+xml' },
        secondary: {
          title: 'Secondary',
          mimeType: 'image/svg+xml',
          optionsSchema: z.object({ label: z.string() }),
          content: ['includeEdges'] as const,
        },
      },
      exports: {},
      async initialize() {
        return {};
      },
      async resolve({ entryPath }) {
        return { resolved: [entryPath], unresolved: [] };
      },
      async describe() {
        return createKernelSuccess({ parameters });
      },
      evaluate,
      render,
    })();
    await seedTestFileSystem({ 'model.circuit': 'board' });
    const worker = new KernelRuntimeWorker({ runtime: defineRuntime({ kernels: [kernel] }) });
    await initializeWorkerForTesting(worker);
    const rendered: Array<Parameters<NonNullable<KernelRuntimeWorker['onRendered']>>[0]> = [];
    worker.onRendered = (event) => {
      rendered.push(event);
    };
    try {
      worker.handleOpenDocument({
        documentId: 'doc',
        intent: 1,
        file: createGeometryFile('model.circuit'),
        parameters: {},
        watch: false,
      });
      worker.handleOpenView({ documentId: 'doc', subscriptionId: 'a', requestId: 'r1', options: {} });
      worker.handleOpenView({
        documentId: 'doc',
        subscriptionId: 'b',
        requestId: 'r2',
        view: 'secondary',
        options: { label: 'ok' },
        content: { includeEdges: true },
      });
      worker.handleOpenView({
        documentId: 'doc',
        subscriptionId: 'c',
        requestId: 'r3',
        view: 'primary',
        options: {},
        content: { includeEdges: true },
      });
      await vi.waitFor(() => {
        expect(rendered).toHaveLength(3);
      });
      expect(rendered.map((event) => event.view)).toEqual(['primary', 'secondary', 'primary']);
      expect(rendered.map((event) => event.success)).toEqual([true, true, false]);
      expect(rendered.every((event) => !Object.hasOwn(event, 'instance'))).toBe(true);
      for (const event of rendered) {
        const decoded = msgpackCodec.decode(msgpackCodec.encode(event));
        expect(runtimeDocumentProtocolSchemas.notifies.rendered.safeParse(decoded).success).toBe(true);
      }
      expect(evaluate).toHaveBeenCalledOnce();
      expect(render).toHaveBeenCalledTimes(2);
    } finally {
      await worker.cleanup();
    }
  });

  it('reevaluates another watched document after a staged shared source change', async () => {
    const evaluate = vi.fn(async () => ({ handle: {}, views: [] as const, exports: [] as const }));
    const kernel = defineKernelV2({
      id: 'watch-shared',
      extensions: ['circuit'] as const,
      name: 'Watch shared',
      version: '1.0.0',
      views: {},
      exports: {},
      async initialize() {
        return {};
      },
      async resolve({ entryPath }) {
        return { resolved: [entryPath], unresolved: [] };
      },
      async describe() {
        return createKernelSuccess({ parameters });
      },
      evaluate,
    })();
    await seedTestFileSystem({ 'model.circuit': 'board' });
    const worker = new KernelRuntimeWorker({ runtime: defineRuntime({ kernels: [kernel] }) });
    await initializeWorkerForTesting(worker);
    const evaluated: Array<Parameters<NonNullable<KernelRuntimeWorker['onEvaluated']>>[0]> = [];
    worker.onEvaluated = (event) => {
      evaluated.push(event);
    };
    try {
      for (const documentId of ['a', 'b']) {
        worker.handleOpenDocument({
          documentId,
          intent: 1,
          file: createGeometryFile('model.circuit'),
          parameters: {},
          watch: true,
        });
      }
      await vi.waitFor(() => {
        expect(evaluated).toHaveLength(2);
      });
      worker.handleUpdateDocument({
        documentId: 'a',
        intent: 2,
        stage: { 'model.circuit': new TextEncoder().encode('changed') },
      });
      await vi.waitFor(() => {
        expect(evaluated.filter((event) => event.documentId === 'b')).toHaveLength(2);
      });
      const bRevisions = evaluated.filter((event) => event.documentId === 'b').map((event) => event.sourceRevision);
      expect(bRevisions[0]).not.toEqual(bRevisions[1]);
      expect(evaluate).toHaveBeenCalledTimes(2);
    } finally {
      await worker.cleanup();
    }
  });

  it('selects same-extension document exports by ID and refuses unavailable declared IDs', async () => {
    const write = vi.fn(async ({ exportId, options }: { exportId: string; options: Record<string, unknown> }) => ({
      files: [
        { name: `${exportId}.txt`, mimeType: 'text/plain', bytes: new TextEncoder().encode(JSON.stringify(options)) },
      ] as const,
    }));
    const kernel = defineKernelV2({
      id: 'same-extension',
      extensions: ['circuit'] as const,
      name: 'Same extension',
      version: '1.0.0',
      views: {},
      exports: {
        plain: { title: 'Plain', mimeType: 'text/plain', extension: 'txt' },
        configured: {
          title: 'Configured',
          mimeType: 'text/plain',
          extension: 'txt',
          optionsSchema: z.object({ label: z.string() }),
        },
        txt: { title: 'Unavailable', mimeType: 'text/plain', extension: 'txt' },
      },
      async initialize() {
        return {};
      },
      async resolve({ entryPath }) {
        return { resolved: [entryPath], unresolved: [] };
      },
      async describe() {
        return createKernelSuccess({ parameters });
      },
      async evaluate() {
        return { handle: {}, views: [] as const, exports: ['plain', 'configured'] as const };
      },
      write,
    })();
    await seedTestFileSystem({ 'model.circuit': 'board' });
    const worker = new KernelRuntimeWorker({ runtime: defineRuntime({ kernels: [kernel] }) });
    await initializeWorkerForTesting(worker);
    const evaluated: Array<Parameters<NonNullable<KernelRuntimeWorker['onEvaluated']>>[0]> = [];
    worker.onEvaluated = (event) => {
      evaluated.push(event);
    };
    try {
      worker.handleOpenDocument({
        documentId: 'doc',
        intent: 1,
        file: createGeometryFile('model.circuit'),
        parameters: {},
        watch: false,
      });
      await vi.waitFor(() => {
        expect(evaluated).toHaveLength(1);
      });
      const plain = await worker.exportDocument({ documentId: 'doc', operationId: 'plain', target: 'plain' });
      const configured = await worker.exportDocument({
        documentId: 'doc',
        operationId: 'configured',
        target: 'configured',
        options: { label: 'ok' },
      });
      const unavailable = await worker.exportDocument({ documentId: 'doc', operationId: 'unavailable', target: 'txt' });
      expect(plain.success).toBe(true);
      expect(configured.success).toBe(true);
      expect(write.mock.calls.map(([input]) => input.exportId)).toEqual(['plain', 'configured']);
      expect(unavailable.success).toBe(false);
      expect(unavailable.issues[0]?.code).toBe('EXPORT_UNKNOWN');
    } finally {
      await worker.cleanup();
    }
  });

  it('pins an in-flight committed evaluation for export while a newer update waits', async () => {
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const writes: number[] = [];
    const kernel = defineKernelV2({
      id: 'pending-export-pin',
      extensions: ['circuit'] as const,
      name: 'Pending export pin',
      version: '1.0.0',
      views: {},
      exports: { bom: { title: 'BOM', mimeType: 'text/plain', extension: 'txt' } },
      async initialize() {
        return {};
      },
      async resolve({ entryPath }) {
        return { resolved: [entryPath], unresolved: [] };
      },
      async describe() {
        return createKernelSuccess({ parameters });
      },
      async evaluate({ parameters: input }) {
        const version = Number(input['version']);
        if (version === 1) {
          entered.resolve();
          await release.promise;
        }
        return { handle: { version }, views: [] as const, exports: ['bom'] as const };
      },
      async write({ handle }) {
        writes.push(handle.version);
        return {
          files: [
            { name: 'bom.txt', mimeType: 'text/plain', bytes: new TextEncoder().encode(String(handle.version)) },
          ] as const,
        };
      },
    })();
    await seedTestFileSystem({ 'model.circuit': 'board' });
    const worker = new KernelRuntimeWorker({ runtime: defineRuntime({ kernels: [kernel] }) });
    await initializeWorkerForTesting(worker);
    const evaluated: Array<Parameters<NonNullable<KernelRuntimeWorker['onEvaluated']>>[0]> = [];
    worker.onEvaluated = (event) => {
      evaluated.push(event);
    };
    try {
      worker.handleOpenDocument({
        documentId: 'doc',
        intent: 1,
        file: createGeometryFile('model.circuit'),
        parameters: { version: 1 },
        watch: false,
      });
      await entered.promise;
      const pinned = worker.exportDocument({ documentId: 'doc', operationId: 'pinned', target: 'bom' });
      worker.handleUpdateDocument({ documentId: 'doc', intent: 2, parameters: { version: 2 } });
      release.resolve();
      const old = await pinned;
      expect(old.success).toBe(true);
      if (old.success) {
        expect(new TextDecoder().decode(old.files[0].bytes)).toBe('1');
      }
      await vi.waitFor(() => {
        expect(evaluated.at(-1)?.intent).toBe(2);
      });
      expect(writes).toEqual([1]);
    } finally {
      release.resolve();
      await worker.cleanup();
    }
  });

  it('settles a pinned export from a failed evaluation without borrowing a newer success', async () => {
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const write = vi.fn(async ({ handle }: { handle: { version: number } }) => ({
      files: [
        { name: 'bom.txt', mimeType: 'text/plain', bytes: new TextEncoder().encode(String(handle.version)) },
      ] as const,
    }));
    const kernel = defineKernelV2({
      id: 'failed-export-pin',
      extensions: ['circuit'] as const,
      name: 'Failed export pin',
      version: '1.0.0',
      views: {},
      exports: { bom: { title: 'BOM', mimeType: 'text/plain', extension: 'txt' } },
      async initialize() {
        return {};
      },
      async resolve({ entryPath }) {
        return { resolved: [entryPath], unresolved: [] };
      },
      async describe() {
        return createKernelSuccess({ parameters });
      },
      async evaluate({ parameters: input }) {
        const version = Number(input['version']);
        if (version === 1) {
          entered.resolve();
          await release.promise;
          throw new Error('Pinned evaluation failed.');
        }
        return { handle: { version }, views: [] as const, exports: ['bom'] as const };
      },
      write,
    })();
    await seedTestFileSystem({ 'model.circuit': 'board' });
    const worker = new KernelRuntimeWorker({ runtime: defineRuntime({ kernels: [kernel] }) });
    await initializeWorkerForTesting(worker);
    const evaluated: Array<Parameters<NonNullable<KernelRuntimeWorker['onEvaluated']>>[0]> = [];
    worker.onEvaluated = (event) => {
      evaluated.push(event);
    };
    try {
      worker.handleOpenDocument({
        documentId: 'doc',
        intent: 1,
        file: createGeometryFile('model.circuit'),
        parameters: { version: 1 },
        watch: false,
      });
      await entered.promise;
      const pinned = worker.exportDocument({ documentId: 'doc', operationId: 'pinned-failure', target: 'bom' });
      worker.handleUpdateDocument({ documentId: 'doc', intent: 2, parameters: { version: 2 } });
      release.resolve();
      const failed = await pinned;
      expect(failed.success).toBe(false);
      await vi.waitFor(() => {
        expect(evaluated.at(-1)?.intent).toBe(2);
      });
      const failedEvent = evaluated[0];
      expect(failedEvent).toBeDefined();
      if (failedEvent) {
        const decoded = msgpackCodec.decode(msgpackCodec.encode(failedEvent));
        expect(runtimeDocumentProtocolSchemas.notifies.evaluated.safeParse(decoded).success).toBe(true);
      }
      expect(evaluated.at(-1)?.success).toBe(true);
      expect(write).not.toHaveBeenCalled();
    } finally {
      release.resolve();
      await worker.cleanup();
    }
  });

  it('should validate a v2 source export and transcoder edge separately', async () => {
    const write = vi.fn(async ({ options }: { options: { source: string } }) => ({
      files: [{ name: 'source.txt', mimeType: 'text/plain', bytes: new TextEncoder().encode(options.source) }] as const,
    }));
    const transcode = vi.fn(async () => ({
      success: true,
      data: [{ name: 'out.csv', mimeType: 'text/csv', bytes: new Uint8Array([1]) }],
      issues: [],
    }));
    const kernel = defineKernelV2({
      id: 'v2-routed',
      extensions: ['circuit'] as const,
      name: 'Routed',
      version: '1.0.0',
      views: {},
      exports: {
        source: {
          title: 'Source',
          mimeType: 'text/plain',
          extension: 'txt',
          optionsSchema: z.object({ source: z.string() }),
        },
      },
      async initialize() {
        return {};
      },
      async resolve({ entryPath }) {
        return { resolved: [entryPath], unresolved: [] };
      },
      async describe() {
        return createKernelSuccess({ parameters });
      },
      async evaluate() {
        return { handle: {}, views: [] as const, exports: ['source'] as const };
      },
      write,
    })();
    const transcoder = defineTranscoder({
      id: 'txt-csv',
      name: 'Text to CSV',
      version: '1.0.0',
      edges: [{ from: 'txt', to: 'csv', fidelity: 'mesh', optionsSchema: z.object({ edge: z.boolean() }) }],
      async initialize() {
        return {};
      },
      transcode,
    })();
    await seedTestFileSystem({ 'model.circuit': 'board' });
    const worker = new KernelRuntimeWorker({
      runtime: defineRuntime({ kernels: [kernel], transcoders: [transcoder] }),
    });
    await initializeWorkerForTesting(worker);
    try {
      const result = await worker.exportModel({
        file: createGeometryFile('model.circuit'),
        parameters: {},
        format: 'csv',
        exportOptions: { source: 'ok', edge: true },
      });
      expect(result.success, JSON.stringify(result.issues)).toBe(true);
      expect(write).toHaveBeenCalledWith(
        expect.objectContaining({ options: { source: 'ok' } }),
        expect.any(Object),
        expect.any(Object),
      );
      expect(transcode).toHaveBeenCalledOnce();
      const invalid = await worker.exportModel({
        file: createGeometryFile('model.circuit'),
        parameters: {},
        format: 'csv',
        exportOptions: { source: 1, edge: true },
      });
      expect(invalid.success).toBe(false);
      expect(invalid.issues[0]?.code).toBe('EXPORT_OPTIONS_INVALID');
    } finally {
      await worker.cleanup();
    }
  });

  it('should parse evaluate, view and export transforms once and advertise sendable defaults', async () => {
    const evaluate = vi.fn(async ({ options }: { options: { build: number } }) => ({
      handle: options.build,
      views: ['view'] as const,
      exports: ['data'] as const,
    }));
    const render = vi.fn(async ({ options }: { options: { scale: number } }) => ({
      content: `<svg xmlns="http://www.w3.org/2000/svg"><text>${options.scale}</text></svg>`,
    }));
    const write = vi.fn(async ({ options }: { options: { count: number } }) => ({
      files: [
        { name: 'data.csv', mimeType: 'text/csv', bytes: new TextEncoder().encode(String(options.count)) },
      ] as const,
    }));
    const kernel = defineKernelV2({
      id: 'v2-transforms',
      extensions: ['circuit'] as const,
      name: 'Transforms',
      version: '1.0.0',
      evaluateOptionsSchema: z.object({ build: z.string().default('2').transform(Number) }),
      views: {
        view: {
          title: 'View',
          mimeType: 'image/svg+xml',
          optionsSchema: z.object({ scale: z.string().default('3').transform(Number) }),
        },
      },
      exports: {
        data: {
          title: 'Data',
          mimeType: 'text/csv',
          extension: 'csv',
          optionsSchema: z.object({ count: z.string().default('4').transform(Number) }),
        },
      },
      async initialize() {
        return {};
      },
      async resolve({ entryPath }) {
        return { resolved: [entryPath], unresolved: [] };
      },
      async describe() {
        return createKernelSuccess({ parameters });
      },
      evaluate,
      render,
      write,
    })();
    await seedTestFileSystem({ 'model.circuit': 'board' });
    const worker = new KernelRuntimeWorker({ runtime: defineRuntime({ kernels: [kernel] }) });
    await initializeWorkerForTesting(worker);
    try {
      const result = await worker.createGeometry({
        file: createGeometryFile('model.circuit'),
        parameters: {},
        options: { build: '5', scale: '6' },
      });
      expect(result.success, JSON.stringify(result.issues)).toBe(true);
      expect(worker.capabilitiesManifest.renderCapabilities['v2-transforms']?.renderOptions.defaults).toEqual({
        scale: '3',
      });
      expect(
        worker.capabilitiesManifest.routes.find((route) => route.targetFormat === 'csv')?.exportOptions.defaults,
      ).toEqual({ count: '4' });
      expect(evaluate).toHaveBeenCalledWith(
        expect.objectContaining({ options: { build: 5 } }),
        expect.any(Object),
        expect.any(Object),
      );
      expect(render).toHaveBeenCalledWith(
        expect.objectContaining({ options: { scale: 6 } }),
        expect.any(Object),
        expect.any(Object),
      );
      const exported = await worker.exportGeometry('csv', { count: '7' });
      expect(exported.success, JSON.stringify(exported.issues)).toBe(true);
      expect(write).toHaveBeenCalledWith(
        expect.objectContaining({ options: { count: 7 } }),
        expect.any(Object),
        expect.any(Object),
      );
    } finally {
      await worker.cleanup();
    }
  });

  it.each([
    [{ views: 'a' }, 'invalid views'],
    [{ exports: 'bom' }, 'invalid exports'],
    [{ instances: 'a' }, 'invalid instances'],
    [{ views: ['missing'] }, 'unknown view'],
    [{ views: ['a', 'a'] }, 'duplicate view'],
    [{ exports: ['missing'] }, 'unknown export'],
    [
      {
        views: ['a'],
        instances: {
          a: [
            { id: 'x', title: 'X' },
            { id: 'x', title: 'Again' },
          ],
        },
      },
      'duplicate instance',
    ],
    [{ views: ['b'], instances: { b: [{ id: 'x', title: 'X' }] } }, 'undeclared-instance view'],
  ])('should reject invalid evaluation offers before rendering: %s', async (bad, message) => {
    const render = vi.fn(async () => ({ content: '<svg xmlns="http://www.w3.org/2000/svg"/>' }));
    const releaseHandle = vi.fn();
    const kernel = defineKernelV2({
      id: 'v2-invalid-offers',
      extensions: ['circuit'] as const,
      name: 'Invalid offers',
      version: '1.0.0',
      views: {
        a: { title: 'A', mimeType: 'image/svg+xml', instances: true },
        b: { title: 'B', mimeType: 'image/svg+xml' },
      },
      exports: { bom: { title: 'BOM', mimeType: 'text/csv', extension: 'csv' } },
      async initialize() {
        return {};
      },
      async resolve({ entryPath }) {
        return { resolved: [entryPath], unresolved: [] };
      },
      async describe() {
        return createKernelSuccess({ parameters });
      },
      async evaluate() {
        return { handle: {}, ...bad } as unknown as {
          handle: Record<string, unknown>;
          views: Array<'a' | 'b'>;
          exports: Array<'bom'>;
        };
      },
      releaseHandle,
      render,
      async write() {
        return { files: [{ name: 'bom.csv', mimeType: 'text/csv', bytes: new Uint8Array([1]) }] as const };
      },
    })();
    await seedTestFileSystem({ 'model.circuit': 'board' });
    const worker = new KernelRuntimeWorker({ runtime: defineRuntime({ kernels: [kernel] }) });
    await initializeWorkerForTesting(worker);
    try {
      const result = await worker.createGeometry({ file: createGeometryFile('model.circuit'), parameters: {} });
      expect(result.success).toBe(false);
      expect(result.issues[0]?.message).toContain(message);
      expect(render).not.toHaveBeenCalled();
      expect(releaseHandle).toHaveBeenCalledOnce();
    } finally {
      await worker.cleanup();
    }
    expect(releaseHandle).toHaveBeenCalledOnce();
  });

  it('evaluates once, renders its first offered view with options, writes nonempty files, and disposes', async () => {
    const evaluate = vi.fn(async () => ({
      handle: { source: 'board' },
      views: ['schematic'] as const,
      exports: ['bom'] as const,
    }));
    const render = vi.fn(
      async ({
        view,
        options,
        content,
      }: {
        view: 'board' | 'schematic';
        options: Record<string, unknown>;
        content?: { includeEdges?: boolean };
      }) => ({
        content: `<svg xmlns="http://www.w3.org/2000/svg"><text>${view}:${String(options['labels'])}:${String(content?.includeEdges)}</text></svg>`,
      }),
    );
    const write = vi.fn(async () => ({
      files: [{ name: 'bom.csv', mimeType: 'text/csv', bytes: new TextEncoder().encode('part,count\nR1,1') }] as const,
    }));
    const onDispose = vi.fn(async () => undefined);
    const kernel = defineKernelV2({
      id: 'v2-test',
      extensions: ['circuit'] as const,
      name: 'V2 test',
      version: '1.0.0',
      views: {
        board: { title: 'Board', mimeType: 'model/gltf-binary' },
        schematic: {
          title: 'Schematic',
          mimeType: 'image/svg+xml',
          optionsSchema: z.object({ labels: z.boolean().default(false) }),
          content: ['includeEdges'] as const,
        },
      },
      exports: { bom: { title: 'BOM', mimeType: 'text/csv', extension: 'csv' } },
      async initialize() {
        return {};
      },
      async resolve({ entryPath }) {
        return { resolved: [entryPath], unresolved: [] };
      },
      async describe() {
        return createKernelSuccess({ parameters });
      },
      evaluate,
      render,
      write,
      onDispose,
    })();
    const phases: string[] = [];
    const middleware = defineMiddlewareV2({
      id: 'v2-chain',
      name: 'V2 chain',
      content: {
        views: { 'image/svg+xml': ['includeTopology'] as const },
        exports: { csv: ['includeTopology'] as const },
      },
      async wrapEvaluate(input, next) {
        phases.push(`evaluate:${input.entryPath}`);
        return next(input);
      },
      async wrapRender(input, next) {
        phases.push(`render:${input.view}:${input.mimeType}:${String(input.content?.includeTopology)}`);
        return next(input);
      },
      async wrapWrite(input, next) {
        phases.push(
          `write:${input.exportId}:${input.mimeType}:${input.extension}:${String(input.content?.includeTopology)}`,
        );
        return next(input);
      },
    })();
    await seedTestFileSystem({ 'model.circuit': 'board' });
    const worker = new KernelRuntimeWorker({ runtime: defineRuntime({ kernels: [kernel], middleware: [middleware] }) });
    await initializeWorkerForTesting(worker);
    try {
      const result = await worker.createGeometry({
        file: createGeometryFile('model.circuit'),
        parameters: {},
        options: { labels: true },
        content: { includeEdges: true, includeTopology: true },
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.format).toBe('svg');
        if (result.data.format === 'svg') {
          expect(result.data.content).toContain('schematic:true:true');
        }
      }
      expect(evaluate).toHaveBeenCalledTimes(1);
      expect(render).toHaveBeenCalledTimes(1);
      const exported = await worker.exportGeometry('csv', undefined, { includeTopology: true });
      expect(exported.success, JSON.stringify(exported.issues)).toBe(true);
      if (exported.success) {
        expect(exported.data).toHaveLength(1);
      }
      expect(write).toHaveBeenCalledTimes(1);
      expect(phases).toContain('evaluate:model.circuit');
      expect(phases).toContain('render:schematic:image/svg+xml:true');
      expect(phases).toContain('write:bom:text/csv:csv:true');
      const evaluated: Array<Parameters<NonNullable<KernelRuntimeWorker['onEvaluated']>>[0]> = [];
      worker.onEvaluated = (event) => {
        evaluated.push(event);
      };
      worker.handleOpenDocument({
        documentId: 'content-doc',
        intent: 1,
        file: createGeometryFile('model.circuit'),
        parameters: {},
        watch: false,
      });
      await vi.waitFor(() => {
        expect(evaluated).toHaveLength(1);
      });
      const documentExport = await worker.exportDocument({
        documentId: 'content-doc',
        operationId: 'content-export',
        target: 'bom',
        content: { includeTopology: true },
      });
      expect(documentExport.success, JSON.stringify(documentExport.issues)).toBe(true);
      expect(phases.filter((phase) => phase === 'write:bom:text/csv:csv:true')).toHaveLength(2);
    } finally {
      await worker.cleanup();
    }
    expect(onDispose).toHaveBeenCalledTimes(1);
  });

  it('uses the first offered view and does not reuse it when the next evaluation offers none', async () => {
    const render = vi.fn(async ({ view }: { view: 'a' | 'b' }) => ({
      content: `<svg xmlns="http://www.w3.org/2000/svg"><text>${view}</text></svg>`,
    }));
    const kernel = defineKernelV2({
      id: 'v2-offers',
      extensions: ['circuit'] as const,
      name: 'V2 offers',
      version: '1.0.0',
      views: {
        a: { title: 'A', mimeType: 'image/svg+xml' },
        b: { title: 'B', mimeType: 'image/svg+xml' },
      },
      exports: {},
      async initialize() {
        return {};
      },
      async resolve({ entryPath }) {
        return { resolved: [entryPath], unresolved: [] };
      },
      async describe() {
        return createKernelSuccess({ parameters });
      },
      async evaluate({ entryPath }) {
        return { handle: 'same-primitive-handle', views: entryPath === 'empty.circuit' ? [] : ['b', 'a'] };
      },
      render,
    })();
    await seedTestFileSystem({ 'first.circuit': 'first', 'empty.circuit': 'empty' });
    const worker = new KernelRuntimeWorker({ runtime: defineRuntime({ kernels: [kernel] }) });
    await initializeWorkerForTesting(worker);
    try {
      const first = await worker.createGeometry({ file: createGeometryFile('first.circuit'), parameters: {} });
      expect(first.success).toBe(true);
      if (first.success && first.data.format === 'svg') {
        expect(first.data.content).toContain('b');
      }
      const unsupported = await worker.createGeometry({
        file: createGeometryFile('first.circuit'),
        parameters: {},
        content: { includeEdges: true },
      });
      expect(unsupported.success).toBe(false);
      expect(unsupported.issues[0]?.code).toBe('RUNTIME_CONTENT_UNSUPPORTED');
      const empty = await worker.createGeometry({ file: createGeometryFile('empty.circuit'), parameters: {} });
      expect(empty.success).toBe(false);
      expect(render).toHaveBeenCalledTimes(1);
    } finally {
      await worker.cleanup();
    }
  });

  it('keeps view and export offers on separate evaluations with the same undefined handle', async () => {
    const render = vi.fn(async ({ view }: { view: 'a' | 'b' }) => ({
      content: `<svg xmlns="http://www.w3.org/2000/svg"><text>${view}</text></svg>`,
    }));
    const write = vi.fn(async ({ exportId }: { exportId: 'first' | 'second' }) => ({
      files: [{ name: `${exportId}.txt`, mimeType: 'text/plain', bytes: new TextEncoder().encode(exportId) }] as const,
    }));
    const kernel = defineKernelV2({
      id: 'v2-undefined-offers',
      extensions: ['circuit'] as const,
      name: 'V2 undefined offers',
      version: '1.0.0',
      views: {
        a: { title: 'A', mimeType: 'image/svg+xml' },
        b: { title: 'B', mimeType: 'image/svg+xml' },
      },
      exports: {
        first: { title: 'First', mimeType: 'text/plain', extension: 'txt' },
        second: { title: 'Second', mimeType: 'text/csv', extension: 'csv' },
      },
      async initialize() {
        return {};
      },
      async resolve({ entryPath }) {
        return { resolved: [entryPath], unresolved: [] };
      },
      async describe() {
        return createKernelSuccess({ parameters });
      },
      async evaluate({ entryPath }) {
        return entryPath === 'first.circuit'
          ? { handle: undefined, views: ['a'] as const, exports: ['first'] as const }
          : { handle: undefined, views: ['b'] as const, exports: ['second'] as const };
      },
      render,
      write,
    })();
    await seedTestFileSystem({ 'first.circuit': 'first', 'second.circuit': 'second' });
    const worker = new KernelRuntimeWorker({ runtime: defineRuntime({ kernels: [kernel] }) });
    await initializeWorkerForTesting(worker);
    try {
      const first = await worker.createGeometry({ file: createGeometryFile('first.circuit'), parameters: {} });
      expect(first.success).toBe(true);
      if (first.success && first.data.format === 'svg') {
        expect(first.data.content).toContain('a');
      }
      const second = await worker.createGeometry({ file: createGeometryFile('second.circuit'), parameters: {} });
      expect(second.success).toBe(true);
      if (second.success && second.data.format === 'svg') {
        expect(second.data.content).toContain('b');
      }
      const unavailable = await worker.exportGeometry('txt');
      expect(unavailable.success).toBe(false);
      expect(unavailable.issues[0]?.code).toBe('EXPORT_UNKNOWN');
      const available = await worker.exportGeometry('csv');
      expect(available.success, JSON.stringify(available.issues)).toBe(true);
      expect(write).toHaveBeenCalledOnce();
      expect(write).toHaveBeenCalledWith(
        expect.objectContaining({ exportId: 'second', handle: undefined }),
        expect.any(Object),
        expect.any(Object),
      );
      expect(render).toHaveBeenCalledTimes(2);
    } finally {
      await worker.cleanup();
    }
  });

  it('exports from a zero-view evaluation without inventing a display offer', async () => {
    const write = vi.fn(async () => ({
      files: [{ name: 'bom.csv', mimeType: 'text/csv', bytes: new TextEncoder().encode('part,count\nR1,1') }] as const,
    }));
    const kernel = defineKernelV2({
      id: 'v2-export-only',
      extensions: ['circuit'] as const,
      name: 'V2 export only',
      version: '1.0.0',
      views: {},
      exports: { bom: { title: 'BOM', mimeType: 'text/csv', extension: 'csv' } },
      async initialize() {
        return {};
      },
      async resolve({ entryPath }) {
        return { resolved: [entryPath], unresolved: [] };
      },
      async describe() {
        return createKernelSuccess({ parameters });
      },
      async evaluate() {
        return { handle: undefined, views: [] as const, exports: ['bom'] as const };
      },
      write,
    })();
    await seedTestFileSystem({ 'export.circuit': 'export only' });
    const worker = new KernelRuntimeWorker({ runtime: defineRuntime({ kernels: [kernel] }) });
    await initializeWorkerForTesting(worker);
    try {
      const result = await worker.exportModel({
        file: createGeometryFile('export.circuit'),
        parameters: {},
        format: 'csv',
      });
      expect(result.success, JSON.stringify(result.issues)).toBe(true);
      expect(write).toHaveBeenCalledOnce();
    } finally {
      await worker.cleanup();
    }
  });
});
