/**
 * Reuse across committed parameter edits: a render whose only change is its parameter record
 * keeps dependency discovery, parameter extraction, admission and kernel selection.
 */

import { randomUUID } from 'node:crypto';
import { describe, it, expect, vi } from 'vitest';
import type * as ParametersModule from '@taucad/parameters';
import { KernelRuntimeWorker } from '#framework/kernel-runtime-worker.js';
import { defineRuntime } from '#worker/runtime-definition.js';
import { defineMiddleware } from '#middleware/runtime-middleware.js';
import { defineKernel } from '#types/runtime-kernel.types.js';
import type { RuntimeStateChangedArgs } from '#types/runtime-protocol.types.js';
/* oxlint-disable no-restricted-imports, import/extensions -- Runtime-private white-box fixture stays outside the package build graph. */
import {
  createGeometryFile,
  initializeWorkerForTesting,
  seedTestFileSystem,
} from '../../test/support/kernel-worker.fixture.js';
/* oxlint-enable no-restricted-imports, import/extensions */

const admissionSpy = vi.hoisted(() => vi.fn());

vi.mock('@taucad/parameters', async (importOriginal) => {
  const actual = await importOriginal<typeof ParametersModule>();
  return {
    ...actual,
    admitParameterManifest: async (...args: Parameters<typeof actual.admitParameterManifest>) => {
      admissionSpy();
      return actual.admitParameterManifest(...args);
    },
  };
});

const entry = 'main.ts';
const record = 'main.ts.record.json';
const encoder = new TextEncoder();

const declaration = {
  schema: {
    $schema: 'https://json-structure.org/meta/extended/v0/#',
    $id: 'urn:taucad:test:parameter-commit',
    $uses: ['JSONSchemaUnits'],
    name: 'ParameterCommit',
    type: 'object',
    properties: { width: { type: 'double' } },
  },
  defaults: { width: 1 },
} as const;

const createCommitWorker = async () => {
  const counts = { dependencies: 0, parameters: 0 };
  const geometryParameters: Array<Record<string, unknown>> = [];
  const kernel = defineKernel({
    id: 'commit-kernel',
    extensions: ['ts'],
    detectImport: /from 'commit-kernel'/,
    name: 'Commit kernel',
    version: '1.0.0',
    exportFormats: {},
    async initialize() {
      return {};
    },
    async getDependencies(input) {
      counts.dependencies++;
      return { resolved: [input.entryPath], unresolved: [] };
    },
    async getParameters() {
      counts.parameters++;
      return { success: true, data: declaration, issues: [] };
    },
    async createGeometry(input) {
      geometryParameters.push(input.parameters);
      return { geometry: { format: 'gltf', content: new Uint8Array([1]) }, nativeHandle: {} };
    },
    async exportGeometry() {
      return { success: true, data: [], issues: [] };
    },
  })();
  // Stands in for the parameter-file resolver: the record feeds geometry, never parameters.
  const recordResolver = defineMiddleware({
    id: 'record-resolver',
    name: 'RecordResolver',
    getDependencies() {
      return [{ path: record, affects: ['createGeometry'] }];
    },
    async wrapCreateGeometry(input, handler, runtime) {
      const stored = JSON.parse(await runtime.filesystem.readFile(record, 'utf8')) as Record<string, unknown>;
      return handler({ ...input, parameters: { ...stored, ...input.parameters } });
    },
  })();
  await seedTestFileSystem({
    [entry]: "import { box } from 'commit-kernel';",
    [record]: JSON.stringify({ width: 2 }),
  });
  const worker = new KernelRuntimeWorker({
    runtime: defineRuntime({
      kernels: [kernel],
      middleware: [recordResolver],
    }),
  });
  await initializeWorkerForTesting(worker);
  // @ts-expect-error - white-box access to the worker's filesystem to count reads and writes.
  const filesystem = worker._filesystem as { readFile: (...args: unknown[]) => unknown };
  const readFile = vi.spyOn(filesystem, 'readFile');
  const selectionReads = (): number =>
    readFile.mock.calls.filter(([path, encoding]) => path === entry && encoding === 'utf8').length;

  const stageAndRender = async (stage: Record<string, string>): Promise<void> => {
    await worker.handleStageAndOpenFile({
      renderId: randomUUID(),
      stage: Object.fromEntries(Object.entries(stage).map(([path, text]) => [path, encoder.encode(text)])),
      file: createGeometryFile(entry),
      parameters: {},
    });
  };

  return { worker, counts, geometryParameters, selectionReads, stageAndRender };
};

describe('KernelWorker committed parameter edits', () => {
  it('should reuse discovery, extraction, admission and selection across record-only commits', async () => {
    const { worker, counts, geometryParameters, selectionReads, stageAndRender } = await createCommitWorker();
    try {
      await stageAndRender({});
      const baseline = {
        dependencies: counts.dependencies,
        parameters: counts.parameters,
        admissions: admissionSpy.mock.calls.length,
        selections: selectionReads(),
        geometries: geometryParameters.length,
      };

      await stageAndRender({ [record]: JSON.stringify({ width: 3 }) });
      await stageAndRender({ [record]: JSON.stringify({ width: 4 }) });
      await stageAndRender({ [record]: JSON.stringify({ width: 5 }) });

      expect({
        dependencies: counts.dependencies - baseline.dependencies,
        parameters: counts.parameters - baseline.parameters,
        admissions: admissionSpy.mock.calls.length - baseline.admissions,
        selections: selectionReads() - baseline.selections,
        widths: geometryParameters.slice(baseline.geometries).map(({ width }) => width),
      }).toEqual({ dependencies: 0, parameters: 0, admissions: 0, selections: 0, widths: [3, 4, 5] });

      await stageAndRender({ [entry]: "import { box } from 'commit-kernel'; // edited" });

      expect(counts.dependencies - baseline.dependencies).toBe(1);
      expect(counts.parameters - baseline.parameters).toBe(1);
      expect(selectionReads() - baseline.selections).toBe(1);
    } finally {
      await worker.cleanup();
    }
  });

  it('should publish the committed values when a watched change follows a transient render', async () => {
    const { worker, geometryParameters, stageAndRender } = await createCommitWorker();
    try {
      await stageAndRender({});
      const settled = async (): Promise<RuntimeStateChangedArgs> =>
        new Promise((resolve) => {
          worker.onStateChanged = (event) => {
            if (event.state === 'idle' || event.state === 'error') {
              resolve(event);
            }
          };
        });

      const transientSettled = settled();
      worker.handleOpenFile({
        renderId: randomUUID(),
        file: createGeometryFile(entry),
        parameters: { width: 9 },
        transient: true,
      });
      await transientSettled;
      expect(geometryParameters.at(-1)).toMatchObject({ width: 9 });

      const watchedSettled = settled();
      await worker.notifyFileChanged([entry]);
      await watchedSettled;

      expect(geometryParameters.at(-1)).toMatchObject({ width: 2 });
      // @ts-expect-error - white-box: only a non-transient render publishes the artifact.
      expect(worker.currentPublishedRender).toBeDefined();
    } finally {
      await worker.cleanup();
    }
  });
});
