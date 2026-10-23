/**
 * A committed parameter edit is persisted by the host before it reaches the runtime, so the
 * runtime's watch can observe the host's own sidecar write before the update that stages it.
 * Whichever arrives first, one edit builds and meshes once and delivers to the edit's intent.
 */

import { describe, it, expect, vi } from 'vitest';
import { createMemoryComputeEngine } from '#cache/memory-compute-engine.js';
import { _registerComputeStore } from '#cache/kernel-compute-runtime.js';
import { KernelRuntimeWorker } from '#framework/kernel-runtime-worker.js';
import { defineRuntime } from '#worker/runtime-definition.js';
import { defineMiddlewareV2 as defineMiddleware } from '#middleware/runtime-middleware-v2.js';
import { defineKernelV2 as defineKernel } from '#types/runtime-kernel-v2.types.js';
import type { ComputeBinding, ComputeStore } from '#types/runtime-compute.types.js';
/* oxlint-disable no-restricted-imports, import/extensions -- Runtime-private white-box fixture stays outside the package build graph. */
import {
  createGeometryFile,
  getTestFileSystem,
  initializeWorkerForTesting,
  seedTestFileSystem,
} from '../../test/support/kernel-worker.fixture.js';
/* oxlint-enable no-restricted-imports, import/extensions */

const entry = 'main.ts';
const record = 'main.ts.record.json';
const encoder = new TextEncoder();

const declaration = {
  schema: {
    $schema: 'https://json-structure.org/meta/extended/v0/#',
    $id: 'urn:taucad:test:parameter-echo',
    $uses: ['JSONSchemaUnits'],
    name: 'ParameterEcho',
    type: 'object',
    properties: { width: { type: 'double' } },
  },
  defaults: { width: 1 },
} as const;

type Rendered = Parameters<NonNullable<KernelRuntimeWorker['onRendered']>>[0];

const computeBindings: ReadonlyArray<readonly [string, () => ComputeBinding]> = [
  ['off', () => ({ mode: 'off' })],
  ['memory', () => ({ mode: 'memory' })],
  [
    'durable',
    () => {
      const durable = createMemoryComputeEngine();
      const workspace = `parameter-echo-${crypto.randomUUID()}`;
      return {
        mode: 'durable',
        store: _registerComputeStore({
          spec: Object.freeze({}) as ComputeStore,
          engine: durable.engine,
          workspace,
          control: durable.control({ workspace }),
        }),
      };
    },
  ],
];

const createEchoWorker = async (binding: ComputeBinding) => {
  const builds: number[] = [];
  const meshes: number[] = [];
  let buildGate: PromiseWithResolvers<void> | undefined;
  const kernel = defineKernel({
    id: 'echo-kernel',
    extensions: ['ts'],
    detectImport: /from 'echo-kernel'/,
    name: 'Echo kernel',
    version: '1.0.0',
    views: { display: { title: 'Display', mimeType: 'image/svg+xml' } },
    exports: {},
    async initialize() {
      return {};
    },
    async resolve(input) {
      return { resolved: [input.entryPath], unresolved: [] };
    },
    async describe() {
      return { success: true, data: { parameters: declaration }, issues: [] };
    },
    async evaluate(input) {
      const width = Number(input.parameters['width']);
      builds.push(width);
      await buildGate?.promise;
      return { handle: { width } };
    },
    async render({ handle }) {
      meshes.push(handle.width);
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
    [entry]: "import { box } from 'echo-kernel';",
    [record]: JSON.stringify({ width: 2 }),
  });
  const worker = new KernelRuntimeWorker({
    runtime: defineRuntime({ kernels: [kernel], middleware: [recordResolver] }),
  });
  await initializeWorkerForTesting(worker);
  worker.setComputeBinding(binding);

  const rendered: Rendered[] = [];
  worker.onRendered = (event) => {
    rendered.push(event);
  };
  // The client keeps only renderings of the intent it last sent, as the document session does.
  let clientIntent = 0;
  const accepted = (): Rendered[] => rendered.filter((event) => event.intent === clientIntent);
  const delivered = (): unknown[] => accepted().map((event) => (event.success ? event.artifact : event.issues));

  worker.handleOpenDocument({
    documentId: 'doc',
    intent: clientIntent,
    file: createGeometryFile(entry),
    parameters: {},
    watch: true,
  });
  worker.handleOpenView({ documentId: 'doc', subscriptionId: 'view', requestId: 'initial', view: 'display' });
  await vi.waitFor(() => {
    expect(accepted()).toHaveLength(1);
  });
  builds.length = 0;
  meshes.length = 0;
  rendered.length = 0;

  /* What the host's parameter authority does for a committed edit: a checked write of the sidecar,
   * which the runtime's watch observes, then the update that stages exactly those bytes. */
  const persistRecord = async (width: number): Promise<Uint8Array<ArrayBuffer>> => {
    const bytes = encoder.encode(JSON.stringify({ width }));
    await getTestFileSystem().writeFile(record, bytes);
    return bytes;
  };
  const commit = (bytes: Uint8Array<ArrayBuffer>): void => {
    clientIntent++;
    worker.handleUpdateDocument({ documentId: 'doc', intent: clientIntent, stage: { [record]: bytes } });
  };
  const gateBuilds = (): (() => void) => {
    buildGate = Promise.withResolvers<void>();
    const gate = buildGate;
    return () => {
      gate.resolve();
      buildGate = undefined;
    };
  };

  return { worker, builds, meshes, rendered, accepted, delivered, persistRecord, commit, gateBuilds };
};

describe.each(computeBindings)('KernelWorker parameter sidecar echo (compute reuse %s)', (_mode, binding) => {
  it('should build and mesh once when the update arrives after the watch rendered the persisted sidecar', async () => {
    const { worker, builds, meshes, rendered, accepted, delivered, persistRecord, commit } =
      await createEchoWorker(binding());
    try {
      const bytes = await persistRecord(3);
      // The measured order: the watch's evaluation of the host's own write finishes before the update lands.
      await vi.waitFor(() => {
        expect(rendered).toHaveLength(1);
      });
      commit(bytes);
      await vi.waitFor(() => {
        expect(accepted()).toHaveLength(1);
      });

      expect({ builds, meshes, delivered: delivered() }).toEqual({
        builds: [3],
        meshes: [3],
        delivered: [
          { mimeType: 'image/svg+xml', content: '<svg xmlns="http://www.w3.org/2000/svg"><text>3</text></svg>' },
        ],
      });
    } finally {
      await worker.cleanup();
    }
  });

  it('should build and mesh once when the update arrives while the watch is building the persisted sidecar', async () => {
    const { worker, builds, meshes, accepted, delivered, persistRecord, commit, gateBuilds } =
      await createEchoWorker(binding());
    try {
      const release = gateBuilds();
      const bytes = await persistRecord(3);
      await vi.waitFor(() => {
        expect(builds).toEqual([3]);
      });
      commit(bytes);
      release();
      await vi.waitFor(() => {
        expect(accepted()).toHaveLength(1);
      });

      expect({ builds, meshes, delivered: delivered() }).toEqual({
        builds: [3],
        meshes: [3],
        delivered: [
          { mimeType: 'image/svg+xml', content: '<svg xmlns="http://www.w3.org/2000/svg"><text>3</text></svg>' },
        ],
      });
    } finally {
      await worker.cleanup();
    }
  });

  it('should re-evaluate a sidecar another writer changed without an update', async () => {
    const { worker, builds, meshes, accepted, delivered, persistRecord } = await createEchoWorker(binding());
    try {
      await persistRecord(7);
      await vi.waitFor(() => {
        expect(accepted()).toHaveLength(1);
      });

      expect({ builds, meshes, delivered: delivered() }).toEqual({
        builds: [7],
        meshes: [7],
        delivered: [
          { mimeType: 'image/svg+xml', content: '<svg xmlns="http://www.w3.org/2000/svg"><text>7</text></svg>' },
        ],
      });
    } finally {
      await worker.cleanup();
    }
  });
});
