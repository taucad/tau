/**
 * Reuse across committed parameter edits: a render whose only change is its parameter record
 * keeps dependency discovery, parameter extraction, admission and kernel selection.
 */

import { describe, it, expect, vi } from 'vitest';
import type * as ParametersModule from '@taucad/parameters';
import { KernelRuntimeWorker } from '#framework/kernel-runtime-worker.js';
import { defineRuntime } from '#worker/runtime-definition.js';
import { defineMiddlewareV2 as defineMiddleware } from '#middleware/runtime-middleware-v2.js';
import { defineKernelV2 as defineKernel } from '#types/runtime-kernel-v2.types.js';
/* oxlint-disable no-restricted-imports, import/extensions -- Runtime-private white-box fixture stays outside the package build graph. */
import {
  createGeometryFile,
  getTestFileSystem,
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
  const operationIds: Array<[string, number | undefined]> = [];
  const geometryParameters: Array<Record<string, unknown>> = [];
  const kernel = defineKernel({
    id: 'commit-kernel',
    extensions: ['ts'],
    detectImport: /from 'commit-kernel'/,
    name: 'Commit kernel',
    version: '1.0.0',
    views: { display: { title: 'Display', mimeType: 'image/svg+xml' } },
    exports: {},
    async initialize() {
      return {};
    },
    async resolve(input, runtime) {
      operationIds.push(['dependencies', runtime.operationId]);
      counts.dependencies++;
      return { resolved: [input.entryPath], unresolved: [] };
    },
    async describe(_input, runtime) {
      operationIds.push(['parameters', runtime.operationId]);
      counts.parameters++;
      return { success: true, data: { parameters: declaration }, issues: [] };
    },
    async evaluate(input, runtime) {
      operationIds.push(['geometry', runtime.operationId]);
      geometryParameters.push(input.parameters);
      return { handle: { width: input.parameters['width'] } };
    },
    async render({ handle }) {
      return { content: `<svg xmlns="http://www.w3.org/2000/svg"><text>${String(handle.width)}</text></svg>` };
    },
  })();
  // Stands in for the parameter-file resolver: the record feeds geometry, never parameters.
  const recordResolver = defineMiddleware({
    id: 'record-resolver',
    name: 'RecordResolver',
    resolve() {
      return [{ path: record, affects: ['evaluate'] }];
    },
    async wrapEvaluate(input, handler, runtime) {
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
  const readFile = vi.spyOn(getTestFileSystem(), 'readFile');
  const selectionReads = (): number =>
    readFile.mock.calls.filter((args) => args[0] === entry && args.includes('utf8')).length;

  const evaluated: Array<Parameters<NonNullable<KernelRuntimeWorker['onEvaluated']>>[0]> = [];
  worker.onEvaluated = (event) => {
    evaluated.push(event);
  };
  let intent = 0;
  const stageAndEvaluate = async (stage: Record<string, string>): Promise<void> => {
    const mark = evaluated.length;
    const encoded = Object.fromEntries(Object.entries(stage).map(([path, text]) => [path, encoder.encode(text)]));
    if (intent === 0) {
      worker.handleOpenDocument({
        documentId: 'doc',
        intent: intent++,
        stage: encoded,
        file: createGeometryFile(entry),
        parameters: {},
        watch: true,
      });
    } else {
      worker.handleUpdateDocument({ documentId: 'doc', intent: intent++, stage: encoded });
    }
    await vi.waitFor(() => {
      expect(evaluated).toHaveLength(mark + 1);
    });
    expect(evaluated.at(-1)).toMatchObject({ success: true, transient: false });
  };

  return { worker, counts, operationIds, geometryParameters, selectionReads, stageAndEvaluate };
};

describe('KernelWorker committed parameter edits', () => {
  it('should reuse discovery, extraction, admission and selection across record-only commits', async () => {
    const { worker, counts, geometryParameters, selectionReads, stageAndEvaluate } = await createCommitWorker();
    try {
      await stageAndEvaluate({});
      const baseline = {
        dependencies: counts.dependencies,
        parameters: counts.parameters,
        admissions: admissionSpy.mock.calls.length,
        selections: selectionReads(),
        geometries: geometryParameters.length,
      };

      await stageAndEvaluate({ [record]: JSON.stringify({ width: 3 }) });
      await stageAndEvaluate({ [record]: JSON.stringify({ width: 4 }) });
      await stageAndEvaluate({ [record]: JSON.stringify({ width: 5 }) });

      expect({
        dependencies: counts.dependencies - baseline.dependencies,
        parameters: counts.parameters - baseline.parameters,
        admissions: admissionSpy.mock.calls.length - baseline.admissions,
        selections: selectionReads() - baseline.selections,
        widths: geometryParameters.slice(baseline.geometries).map(({ width }) => width),
      }).toEqual({ dependencies: 0, parameters: 0, admissions: 0, selections: 0, widths: [3, 4, 5] });

      await stageAndEvaluate({ [entry]: "import { box } from 'commit-kernel'; // edited" });

      expect(counts.dependencies - baseline.dependencies).toBe(1);
      expect(counts.parameters - baseline.parameters).toBe(1);
      expect(selectionReads() - baseline.selections).toBe(1);
    } finally {
      await worker.cleanup();
    }
  });

  it('should give every kernel call in one evaluation the same operation identity and the next evaluation another', async () => {
    const { worker, operationIds, stageAndEvaluate } = await createCommitWorker();
    try {
      await stageAndEvaluate({});
      const first = operationIds.splice(0);
      await stageAndEvaluate({ [record]: JSON.stringify({ width: 3 }) });
      const second = operationIds.splice(0);

      expect(first.map(([call]) => call)).toEqual(['dependencies', 'parameters', 'geometry']);
      expect(new Set(first.map(([, id]) => id)).size).toBe(1);
      expect(first[0]?.[1]).toEqual(expect.any(Number));
      expect(second).toEqual([['geometry', expect.any(Number)]]);
      expect(second[0]?.[1]).not.toBe(first[0]?.[1]);
    } finally {
      await worker.cleanup();
    }
  });

  it('should publish the committed values when a watched change follows a transient render', async () => {
    const { worker, geometryParameters, stageAndEvaluate } = await createCommitWorker();
    try {
      await stageAndEvaluate({});
      const rendered: Array<Parameters<NonNullable<KernelRuntimeWorker['onRendered']>>[0]> = [];
      worker.onRendered = (event) => {
        rendered.push(event);
      };
      worker.handleOpenView({ documentId: 'doc', subscriptionId: 'view', requestId: 'initial', view: 'display' });
      await vi.waitFor(() => {
        expect(rendered).toHaveLength(1);
      });

      worker.handleUpdateDocument({ documentId: 'doc', intent: 1, parameters: { width: 9 }, transient: true });
      await vi.waitFor(() => {
        expect(rendered).toHaveLength(2);
      });
      expect(geometryParameters.at(-1)).toMatchObject({ width: 9 });
      expect(rendered[1]).toMatchObject({ success: true, transient: true });

      await worker.notifyFileChanged([entry]);
      await vi.waitFor(() => {
        expect(rendered).toHaveLength(3);
      });
      expect(geometryParameters.at(-1)).toMatchObject({ width: 2 });
      expect(rendered[2]).toMatchObject({
        success: true,
        transient: false,
        artifact: {
          mimeType: 'image/svg+xml',
          content: '<svg xmlns="http://www.w3.org/2000/svg"><text>2</text></svg>',
        },
      });
    } finally {
      await worker.cleanup();
    }
  });
});
