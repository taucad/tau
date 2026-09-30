// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { createRuntimeClient } from '#client/runtime-document-client-core.js';
import { createKernelSuccess } from '#kernels/kernel-helpers.js';
import { fromMemoryFs } from '#filesystem/runtime-filesystem.js';
import { inProcessTransport } from '#transport/in-process-transport.js';
import { defineKernelV2, nonemptyExportFiles } from '#types/runtime-kernel-v2.types.js';
import { defineRuntime } from '#worker/runtime-definition.js';

const parameters = {
  schema: {
    $schema: 'https://json-structure.org/meta/extended/v0/#',
    $id: 'urn:taucad:test:document-client',
    $uses: ['JSONSchemaUnits'],
    name: 'DocumentClientParameters',
    type: 'object',
  },
  defaults: {},
} as const;

it('opens, renders, and exports a document over the in-process protocol', async () => {
  const kernel = defineKernelV2({
    id: 'document-client',
    extensions: ['circuit'] as const,
    name: 'Document client',
    version: '1.0.0',
    views: { primary: { title: 'Primary', mimeType: 'image/svg+xml' } },
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
      return { handle: {}, views: ['primary'] as const, exports: ['bom'] as const };
    },
    async render() {
      return { content: '<svg xmlns="http://www.w3.org/2000/svg"/>' };
    },
    async write() {
      return {
        files: nonemptyExportFiles([
          { name: 'bom.csv', mimeType: 'text/csv', bytes: new TextEncoder().encode('part,count\nresistor,1') },
        ]),
      };
    },
  })();
  const runtime = defineRuntime({ kernels: [kernel] });
  const client = createRuntimeClient({ transport: inProcessTransport({ runtime, fileSystem: fromMemoryFs({}) }) });
  const document = client.open({ source: { files: { 'model.circuit': 'board' } }, watch: false });
  try {
    await expect(document.evaluation()).resolves.toMatchObject({ superseded: false, evaluation: { success: true } });
    expect(client.capabilities?.routes.length).toBeGreaterThan(0);
    const view = document.view('primary');
    await expect(view.rendering()).resolves.toMatchObject({ superseded: false, rendering: { success: true } });
    const exported = await document.export('bom');
    expect(exported).toMatchObject({ success: true, exportId: 'bom', files: [{ name: 'bom.csv' }] });
    if (exported.success) {
      expect(new TextDecoder().decode(exported.files[0].bytes)).toBe('part,count\nresistor,1');
    }
    view.close();
  } finally {
    document.close();
    await client.shutdown();
  }
});

it('reports transport.closed as termination for pending document, view, and export work', async () => {
  let evaluationCount = 0;
  const kernel = defineKernelV2({
    id: 'terminated-client',
    extensions: ['circuit'] as const,
    name: 'Terminated client',
    version: '1.0.0',
    views: { primary: { title: 'Primary', mimeType: 'image/svg+xml' } },
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
      evaluationCount += 1;
      if (evaluationCount > 1) {
        return new Promise<never>(() => {
          /* Pending host work. */
        });
      }
      return { handle: {}, views: ['primary'] as const, exports: ['bom'] as const };
    },
    async render() {
      return new Promise<never>(() => {
        /* Pending host work. */
      });
    },
    async write() {
      return new Promise<never>(() => {
        /* Pending host work. */
      });
    },
  })();
  const runtime = defineRuntime({ kernels: [kernel] });
  const base = inProcessTransport({ runtime, fileSystem: fromMemoryFs({}) });
  const owned = base.materialize();
  const lost = Promise.withResolvers<{
    cause: 'host-exit';
    phase: 'session';
    exitCode: number;
    released: boolean;
    stderrTail: string;
  }>();
  const transport = { ...base, materialize: () => ({ ...owned, closed: lost.promise }) };
  const client = createRuntimeClient({ transport });
  const document = client.open({ source: { files: { 'model.circuit': 'board' } }, watch: false });
  await document.evaluation();
  const view = document.view('primary');
  const viewUpdate = view.update({});
  const viewRead = view.rendering();
  const exported = document.export('bom');
  const update = document.update({ parameters: { count: 2 } });
  const read = document.evaluation();
  const documentStatuses: string[] = [];
  const viewStatuses: string[] = [];
  document.on('status', (status) => {
    documentStatuses.push(status);
  });
  view.on('status', (status) => {
    viewStatuses.push(status);
  });
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
  const outcomes = [update, read, viewUpdate, viewRead, exported].map(async (promise) => {
    try {
      await promise;
      return undefined;
    } catch (error) {
      return error;
    }
  });
  lost.resolve({ cause: 'host-exit', phase: 'session', exitCode: 7, released: false, stderrTail: 'kernel crash\n' });
  for (const error of await Promise.all(outcomes)) {
    expect(error).toMatchObject({
      name: 'RuntimeTerminatedError',
      code: 'RUNTIME_TERMINATED',
      causeKind: 'transport-closed',
      detail: { phase: 'session', exitCode: 7, released: false, stderrTail: 'kernel crash\n' },
    });
  }
  expect(documentStatuses.at(-1)).toBe('error');
  expect(viewStatuses.at(-1)).toBe('error');
  expect(client.lifecycleState).toBe('terminated');
  await expect(document.evaluation()).rejects.toMatchObject({
    name: 'RuntimeTerminatedError',
    causeKind: 'transport-closed',
    detail: { exitCode: 7, stderrTail: 'kernel crash\n' },
  });
  await expect(view.rendering()).rejects.toMatchObject({
    name: 'RuntimeTerminatedError',
    causeKind: 'transport-closed',
    detail: { exitCode: 7, stderrTail: 'kernel crash\n' },
  });
  await expect(client.describe({ source: { files: { 'model.circuit': 'board' } } })).rejects.toMatchObject({
    code: 'RUNTIME_TERMINATED',
    causeKind: 'transport-closed',
    detail: { exitCode: 7, stderrTail: 'kernel crash\n' },
  });
  await owned.close();
});

it('retains a transport operation-timeout cause on later client calls', async () => {
  const base = inProcessTransport({ runtime: defineRuntime({ kernels: [] }), fileSystem: fromMemoryFs({}) });
  const owned = base.materialize();
  const lost = Promise.withResolvers<{ cause: 'operation-timeout' }>();
  const client = createRuntimeClient({
    transport: { ...base, materialize: () => ({ ...owned, closed: lost.promise }) },
  });

  lost.resolve({ cause: 'operation-timeout' });
  await vi.waitFor(() => {
    expect(client.lifecycleState).toBe('terminated');
  });
  await expect(client.describe({ source: { files: { 'model.circuit': 'board' } } })).rejects.toMatchObject({
    code: 'RUNTIME_TERMINATED',
    causeKind: 'operation-timeout',
  });
  await owned.close();
});
