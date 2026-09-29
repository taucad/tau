import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createKernelSuccess } from '#kernels/kernel-helpers.js';
import { KernelRuntimeWorker } from '#framework/kernel-runtime-worker.js';
import { defineKernelV2 } from '#types/runtime-kernel-v2.types.js';
import { defineMiddlewareV2 } from '#middleware/runtime-middleware-v2.js';
import { defineRuntime } from '#worker/runtime-definition.js';
/* oxlint-disable no-restricted-imports, import/extensions -- Runtime-private white-box fixture. */
import {
  createGeometryFile,
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
          optionsSchema: z.object({ labels: z.boolean() }),
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
      expect(unavailable.issues[0]?.code).toBe('KERNEL_CAPABILITY_MISSING');
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
