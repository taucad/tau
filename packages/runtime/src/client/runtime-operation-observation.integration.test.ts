// @vitest-environment node
import { MessagePort } from 'node:worker_threads';
import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRuntimeClient } from '#client/runtime-document-client-core.js';
import { createKernelSuccess } from '#kernels/kernel-helpers.js';
import { fromMemoryFs } from '#filesystem/runtime-filesystem.js';
import * as operationFacts from '#framework/operation-facts.js';
import { WorkerTelemetryCollector } from '#framework/worker-telemetry.js';
import { defineMiddlewareV2 } from '#middleware/runtime-middleware-v2.js';
import { inProcessTransport } from '#transport/in-process-transport.js';
import { defineKernelV2, nonemptyExportFiles } from '#types/runtime-kernel-v2.types.js';
import type { RuntimeOperationObservation } from '#types/runtime-observation.types.js';
import type { TelemetryEntry } from '#types/runtime-wire.types.js';
import { defineRuntime } from '#worker/runtime-definition.js';

vi.mock('#framework/operation-facts.js', async (importOriginal) => {
  const actual = await importOriginal<typeof operationFacts>();
  return {
    ...actual,
    heapFacts: vi.fn(actual.heapFacts),
    parameterFacts: vi.fn(actual.parameterFacts),
    workerFactsFromEntries: vi.fn(actual.workerFactsFromEntries),
  };
});

const parameters = {
  schema: {
    $schema: 'https://json-structure.org/meta/extended/v0/#',
    $id: 'urn:taucad:test:observation',
    $uses: ['JSONSchemaUnits'],
    name: 'ObservationParameters',
    type: 'object',
    properties: { width: { type: 'double', ucumUnit: 'mm' } },
    required: ['width'],
  },
  defaults: { width: 10 },
} as const;

type Faults = Readonly<{
  heap?: number;
  /** A native kernel's child-tree sample. */
  childResident?: () => Promise<number | undefined>;
  evaluate?: Error;
  render?: Error;
  export?: Error;
  /** Holds `describe` until it settles, so a test can act while the operation is in flight. */
  describeGate?: () => Promise<void>;
  /** Sees the resolved parameter values the kernel evaluates with. */
  onEvaluate?: (parameters: Readonly<Record<string, unknown>>) => void;
  /** Compose a middleware that wraps all four operations and passes each through. */
  passThrough?: true;
}>;

/** A middleware that wraps every operation and changes nothing, so each route starts a `middleware.wrap` span. */
const passThrough = defineMiddlewareV2({
  id: 'PassThrough',
  name: 'PassThrough',
  wrapDescribe: async (input, handler) => handler(input),
  wrapEvaluate: async (input, handler) => handler(input),
  wrapRender: async (input, handler) => handler(input),
  wrapExport: async (input, handler) => handler(input),
});

/** A thrown error that carries kernel issues, as kernels report typed failures. */
class IssueError extends Error {
  public readonly issues: unknown[];
  public constructor(issues: unknown[]) {
    super('fixture failed');
    this.issues = issues;
  }
}

const createClient = (faults: Faults = {}) => {
  const kernel = defineKernelV2({
    id: 'observed-kernel',
    extensions: ['circuit'] as const,
    name: 'Observed kernel',
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
      await faults.describeGate?.();
      return createKernelSuccess({ parameters });
    },
    ...(faults.heap === undefined ? {} : { observedHeapBytes: () => faults.heap }),
    ...(faults.childResident === undefined ? {} : { observedChildResidentBytes: faults.childResident }),
    async evaluate({ parameters: resolved }) {
      faults.onEvaluate?.(resolved);
      if (faults.evaluate !== undefined) {
        throw faults.evaluate;
      }
      return { handle: {}, views: ['primary'] as const, exports: ['bom'] as const };
    },
    async render() {
      if (faults.render !== undefined) {
        throw faults.render;
      }
      return { content: '<svg xmlns="http://www.w3.org/2000/svg"/>' };
    },
    async export() {
      if (faults.export !== undefined) {
        throw faults.export;
      }
      return {
        files: nonemptyExportFiles([{ name: 'bom.csv', mimeType: 'text/csv', bytes: new TextEncoder().encode('a,b') }]),
      };
    },
  })();
  const runtime = defineRuntime({ kernels: [kernel], middleware: faults.passThrough ? [passThrough()] : [] });
  return createRuntimeClient({ transport: inProcessTransport({ runtime, fileSystem: fromMemoryFs({}) }) });
};

const source = { files: { 'model.circuit': 'board' } };

/**
 * Drive one of each document operation through a client.
 *
 * @param client - The client.
 */
const runOperations = async (client: ReturnType<typeof createClient>): Promise<void> => {
  const document = client.open({ source, parameters: { width: 12 }, watch: false });
  try {
    await document.evaluation();
    const view = document.view('primary');
    await view.rendering();
    await document.export('bom');
    await client.describe({ source });
    view.close();
  } finally {
    document.close();
  }
};

const byOperation = (seen: readonly RuntimeOperationObservation[], operation: string) =>
  seen.filter((observation) => observation.operation === operation);

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(operationFacts.heapFacts).mockClear();
  vi.mocked(operationFacts.parameterFacts).mockClear();
  vi.mocked(operationFacts.workerFactsFromEntries).mockClear();
});

describe('operation observation over the in-process transport', () => {
  it('should compute nothing in the worker and mark every attempt not-observed when nobody asks', async () => {
    const beginOperation = vi.spyOn(WorkerTelemetryCollector.prototype, 'beginOperation');
    const operationEntries = vi.spyOn(WorkerTelemetryCollector.prototype, 'operationEntries');
    const client = createClient();
    const seen: RuntimeOperationObservation[] = [];
    client.on('operation', (observation) => seen.push(observation));
    try {
      await runOperations(client);
      expect(client.workerObservation).toEqual(['facts']);
      await vi.waitFor(() => {
        expect(seen.map(({ operation }) => operation)).toEqual(
          expect.arrayContaining(['initialize', 'evaluate', 'render', 'export', 'describe']),
        );
      });
      expect(seen.every(({ facts }) => facts === 'not-observed')).toBe(true);
      expect(seen.every(({ worker }) => worker === undefined)).toBe(true);
      expect(beginOperation).not.toHaveBeenCalled();
      expect(operationEntries).not.toHaveBeenCalled();
      expect(operationFacts.heapFacts).not.toHaveBeenCalled();
      expect(operationFacts.parameterFacts).not.toHaveBeenCalled();
      expect(operationFacts.workerFactsFromEntries).not.toHaveBeenCalled();
    } finally {
      await client.shutdown();
    }
  });

  it.each(['off', 'facts'] as const)(
    'should give every route one root carrying its observation id and no accidental root, with observation %s',
    async (mode) => {
      const client = createClient({ passThrough: true });
      const seen: RuntimeOperationObservation[] = [];
      const entries: TelemetryEntry[] = [];
      client.on('operation', (observation) => seen.push(observation));
      client.on('telemetry', (batch) => entries.push(...batch.entries));
      client.observe(mode);
      try {
        await runOperations(client);
        const operations = ['initialize', 'evaluate', 'render', 'export', 'describe'];
        // Each route's spans leave after its own terminal reply, the last one's included.
        await vi.waitFor(() => {
          expect(seen.map(({ operation }) => operation).sort()).toEqual([...operations].sort());
          const roots = entries.filter((entry) => entry.detail?.['parentSpanId'] === undefined);
          expect(roots).toHaveLength(seen.length);
        });
        expect(new Set(seen.map(({ operationId }) => operationId)).size).toBe(seen.length);
        const roots = entries.filter((entry) => entry.detail?.['parentSpanId'] === undefined);
        for (const observation of seen) {
          const name = observation.operation === 'initialize' ? 'kernel.bootstrap' : `kernel.${observation.operation}`;
          expect(
            roots.filter((root) => root.detail?.['operation.id'] === observation.operationId).map((root) => root.name),
            observation.operation,
          ).toEqual([name]);
        }
        // Every other span reaches its operation's root through spans that were sent.
        const byId = new Map(entries.map((entry) => [entry.detail?.['spanId'], entry]));
        const rootOf = (entry: TelemetryEntry): TelemetryEntry | undefined => {
          let current: TelemetryEntry | undefined = entry;
          while (current?.detail?.['parentSpanId'] !== undefined) {
            current = byId.get(current.detail['parentSpanId']);
          }
          return current;
        };
        expect(entries.filter((entry) => rootOf(entry) === undefined)).toEqual([]);
        // Each wrap names the phase it runs in, under its own route's root; an evaluate describes its parameters first.
        const wraps = entries.filter(({ name }) => name === 'middleware.wrap(PassThrough)');
        expect(
          wraps
            .map((wrap) => [String(wrap.detail?.['phase']), String(rootOf(wrap)?.name)])
            .sort((left, right) => left.join(' ').localeCompare(right.join(' '))),
        ).toEqual([
          ['describe', 'kernel.describe'],
          ['describe', 'kernel.evaluate'],
          ['evaluate', 'kernel.evaluate'],
          ['export', 'kernel.export'],
          ['render', 'kernel.render'],
        ]);
      } finally {
        await client.shutdown();
      }
    },
  );

  it('should join the trailing facts to every attempt once the client observes from initialize', async () => {
    const client = createClient();
    const seen: RuntimeOperationObservation[] = [];
    client.on('operation', (observation) => seen.push(observation));
    client.observe('facts');
    try {
      await runOperations(client);
      await vi.waitFor(() => {
        expect(seen.filter(({ facts }) => facts === 'joined').length).toBeGreaterThanOrEqual(5);
      });
      const [initialize] = byOperation(seen, 'initialize');
      expect(initialize).toMatchObject({
        outcome: { type: 'succeeded' },
        transport: 'in-process',
        facts: 'joined',
        worker: { cold: true, reuse: 'none', realm: 'in-process', heapSource: 'none' },
      });
      const [evaluate] = byOperation(seen, 'evaluate');
      expect(evaluate).toMatchObject({
        outcome: { type: 'succeeded' },
        entryFormat: 'circuit',
        facts: 'joined',
        worker: { cold: true, parameters: { declared: 1, modified: 1, features: ['units'] } },
      });
      expect(evaluate?.worker?.phases).toBeDefined();
      for (const value of Object.values(evaluate?.worker?.phases ?? {})) {
        expect(value).toBeGreaterThanOrEqual(0);
      }
      expect(byOperation(seen, 'render')[0]).toMatchObject({ facts: 'joined', worker: { cold: false } });
      expect(byOperation(seen, 'export')[0]).toMatchObject({ format: 'bom', facts: 'joined' });
      expect(byOperation(seen, 'describe')[0]).toMatchObject({ kernel: 'observed-kernel', facts: 'joined' });
      expect(new Set(seen.map(({ operationId }) => operationId)).size).toBe(seen.length);
    } finally {
      await client.shutdown();
    }
  });

  it.each([
    { label: 'no parameters', supplied: undefined, modified: 0 },
    { label: 'its default', supplied: { width: 10 }, modified: 0 },
    { label: 'a changed value', supplied: { width: 12 }, modified: 1 },
  ])('should count $modified modified leaves when the document opens with $label', async ({ supplied, modified }) => {
    const client = createClient();
    const seen: RuntimeOperationObservation[] = [];
    client.on('operation', (observation) => seen.push(observation));
    client.observe('facts');
    const document = client.open({ source, ...(supplied === undefined ? {} : { parameters: supplied }), watch: false });
    try {
      await document.evaluation();
      await vi.waitFor(() => {
        expect(byOperation(seen, 'evaluate')[0]?.facts).toBe('joined');
      });
      expect(byOperation(seen, 'evaluate')[0]?.worker?.parameters).toMatchObject({ declared: 1, modified });
    } finally {
      document.close();
      await client.shutdown();
    }
  });

  it('should settle a view the caller closes once the evaluation lands as abandoned, and its replacement as succeeded', async () => {
    const client = createClient();
    const seen: RuntimeOperationObservation[] = [];
    client.on('operation', (observation) => seen.push(observation));
    client.observe('facts');
    const document = client.open({ source, watch: false });
    try {
      // A view opened before the offer is known, closed and reopened under its id once the evaluation lands.
      const placeholder = document.view();
      await document.evaluation();
      placeholder.close();
      const view = document.view('primary');
      await view.rendering();
      await vi.waitFor(() => {
        expect(byOperation(seen, 'render').map(({ outcome }) => outcome)).toEqual([
          { type: 'abandoned', reason: 'closed' },
          { type: 'succeeded' },
        ]);
      });
      expect(byOperation(seen, 'render')[0]?.worker).toBeUndefined();
      view.close();
    } finally {
      document.close();
      await client.shutdown();
    }
  });

  it('should start and stop the facts from the next operation when the mode changes', async () => {
    const client = createClient();
    const seen: RuntimeOperationObservation[] = [];
    client.on('operation', (observation) => seen.push(observation));
    try {
      await client.describe({ source });
      client.observe('facts');
      await client.describe({ source });
      await vi.waitFor(() => {
        expect(byOperation(seen, 'describe')).toHaveLength(2);
      });
      client.observe('off');
      await client.describe({ source });
      await vi.waitFor(() => {
        expect(byOperation(seen, 'describe').map(({ facts }) => facts)).toEqual([
          'not-observed',
          'joined',
          'not-observed',
        ]);
      });
    } finally {
      await client.shutdown();
    }
  });

  it('should keep the facts of an operation admitted under facts when observation stops mid-flight', async () => {
    const gate = Promise.withResolvers<void>();
    const entered = Promise.withResolvers<void>();
    const client = createClient({
      describeGate: async () => {
        entered.resolve();
        await gate.promise;
      },
    });
    const seen: RuntimeOperationObservation[] = [];
    client.on('operation', (observation) => seen.push(observation));
    client.observe('facts');
    try {
      const described = client.describe({ source });
      // The worker admitted the describe under `facts` and is running it.
      await entered.promise;
      client.observe('off');
      gate.resolve();
      await described;
      await vi.waitFor(() => {
        expect(byOperation(seen, 'describe')).toHaveLength(1);
      });
      expect(byOperation(seen, 'describe')[0]).toMatchObject({ facts: 'joined', worker: { reuse: 'none' } });
      await client.describe({ source });
      await vi.waitFor(() => {
        expect(byOperation(seen, 'describe').map(({ facts }) => facts)).toEqual(['joined', 'not-observed']);
      });
    } finally {
      gate.resolve();
      await client.shutdown();
    }
  });

  it('should leave every result unchanged when a subscriber throws', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const client = createClient();
    client.on('operation', () => {
      throw new Error('subscriber failed');
    });
    client.observe('facts');
    try {
      await expect(client.describe({ source })).resolves.toMatchObject({ success: true, kernelId: 'observed-kernel' });
      const document = client.open({ source, watch: false });
      await expect(document.evaluation()).resolves.toMatchObject({ superseded: false, evaluation: { success: true } });
      document.close();
    } finally {
      await client.shutdown();
      quiet.mockRestore();
    }
  });

  it('should carry the kernel heap on a failed evaluate, a throwing render and a RESOURCE_LIMIT refusal', async () => {
    const heap = { heapBytes: 4096, heapSource: 'kernel' };
    const refusal = {
      code: 'RESOURCE_LIMIT',
      type: 'kernel',
      severity: 'error',
      message: 'Export is over its triangle budget.',
      details: {
        limit: 'fixture.export.triangles',
        unit: '{triangle}',
        maximum: 10,
        demand: { kind: 'measured', value: 11 },
        origin: 'default',
      },
    };
    const failing = createClient({
      heap: 4096,
      evaluate: new IssueError([{ code: 'KERNEL_ERROR', type: 'kernel', severity: 'error', message: 'bad model' }]),
    });
    const throwing = createClient({
      heap: 4096,
      render: new Error('render failed'),
      export: new IssueError([refusal]),
    });
    const seen: RuntimeOperationObservation[] = [];
    for (const client of [failing, throwing]) {
      client.on('operation', (observation) => seen.push(observation));
      client.observe('facts');
    }
    try {
      const failed = failing.open({ source, watch: false });
      await expect(failed.evaluation()).resolves.toMatchObject({ evaluation: { success: false } });
      failed.close();
      const document = throwing.open({ source, watch: false });
      await document.evaluation();
      const view = document.view('primary');
      await view.rendering().catch(() => undefined);
      await expect(document.export('bom')).resolves.toMatchObject({ success: false });
      view.close();
      document.close();
      await vi.waitFor(() => {
        expect(byOperation(seen, 'export')).toHaveLength(1);
        expect(byOperation(seen, 'render')).toHaveLength(1);
      });
      const failedEvaluate = byOperation(seen, 'evaluate').find(({ outcome }) => outcome.type !== 'succeeded');
      expect(failedEvaluate).toMatchObject({ outcome: { type: 'issue' }, facts: 'joined', worker: heap });
      expect(byOperation(seen, 'render')[0]).toMatchObject({ facts: 'joined', worker: heap });
      expect(byOperation(seen, 'export')[0]).toMatchObject({
        outcome: { type: 'issue', code: 'RESOURCE_LIMIT' },
        limit: refusal.details,
        facts: 'joined',
        worker: heap,
      });
    } finally {
      await failing.shutdown();
      await throwing.shutdown();
    }
  });

  it('should post every terminal reply before any of its facts work', async () => {
    const posts = vi.spyOn(MessagePort.prototype, 'postMessage');
    const operationEntries = vi.spyOn(WorkerTelemetryCollector.prototype, 'operationEntries');
    const client = createClient();
    const seen: RuntimeOperationObservation[] = [];
    client.on('operation', (observation) => seen.push(observation));
    client.observe('facts');
    try {
      await runOperations(client);
      await vi.waitFor(() => {
        expect(seen.filter(({ facts }) => facts === 'joined').length).toBeGreaterThanOrEqual(5);
      });
    } finally {
      await client.shutdown();
    }

    type Frame = Readonly<{ k?: string; i?: number; n?: string; a?: Record<string, unknown> }>;
    type Step = Readonly<{ order: number; kind: 'reply' | 'facts' | 'work'; operationId?: string }>;
    const frames = posts.mock.contexts.map((port, index) => ({
      port,
      frame: (posts.mock.calls[index]?.[0] ?? {}) as Frame,
      order: posts.mock.invocationCallOrder[index]!,
    }));
    // The worker's side of the document channel is the port that posts the facts notifies.
    const server = frames.find(({ frame }) => frame.n === 'operationFacts')?.port;
    expect(server).toBeDefined();
    const requested = new Map(
      frames
        .filter(
          ({ port, frame }) => port !== server && frame.k === 'rq' && typeof frame.a?.['operationId'] === 'string',
        )
        .map(({ frame }) => [frame.i, frame.a!['operationId'] as string]),
    );
    const steps: Step[] = frames.flatMap(({ port, frame, order }): Step[] => {
      if (port !== server) {
        return [];
      }
      const args = frame.a ?? {};
      if (frame.k === 'rs' && requested.has(frame.i)) {
        return [{ order, kind: 'reply', operationId: requested.get(frame.i) }];
      }
      if (frame.k === 'nt' && frame.n === 'evaluated') {
        return [{ order, kind: 'reply', operationId: `evaluate:${String(args['documentId'])}:${String(args['id'])}` }];
      }
      if (frame.k === 'nt' && frame.n === 'rendered') {
        const id = `render:${String(args['subscriptionId'])}:${String(args['evaluationId'])}:${String(args['requestId'])}`;
        return [{ order, kind: 'reply', operationId: id }];
      }
      if (frame.k === 'nt' && frame.n === 'operationFacts') {
        return [{ order, kind: 'facts', operationId: String(args['operationId']) }];
      }
      return [];
    });
    const work = [
      operationEntries,
      vi.mocked(operationFacts.heapFacts),
      vi.mocked(operationFacts.parameterFacts),
      vi.mocked(operationFacts.workerFactsFromEntries),
    ].flatMap((spy) => spy.mock.invocationCallOrder.map((order): Step => ({ order, kind: 'work' })));
    const timeline = [...steps, ...work].toSorted((left, right) => left.order - right.order);

    // Each facts notify closes the facts work begun since the previous one; all of it follows that operation's reply.
    const notifies = timeline.filter(({ kind }) => kind === 'facts');
    expect(new Set(notifies.map(({ operationId }) => operationId))).toEqual(
      new Set(seen.filter(({ facts }) => facts === 'joined').map(({ operationId }) => operationId)),
    );
    expect(new Set(seen.map(({ operation }) => operation))).toEqual(
      new Set(['initialize', 'evaluate', 'render', 'export', 'describe']),
    );
    const closing = timeline.flatMap(({ kind }, index) => (kind === 'facts' ? [index] : []));
    for (const [position, index] of closing.entries()) {
      const notify = timeline[index]!;
      const opened = position === 0 ? 0 : closing[position - 1]! + 1;
      const firstWork = timeline.slice(opened, index).find(({ kind }) => kind === 'work');
      const reply = timeline.find(({ kind, operationId }) => kind === 'reply' && operationId === notify.operationId);
      expect(firstWork, notify.operationId).toBeDefined();
      expect(reply, notify.operationId).toBeDefined();
      expect(reply!.order, notify.operationId).toBeLessThan(firstWork!.order);
    }
  });

  it('should keep no reference to the resolved parameter values past the reply with observation off', async () => {
    setFlagsFromString('--expose-gc');
    const collect = runInNewContext('gc') as () => void;
    let first: WeakRef<Readonly<Record<string, unknown>>> | undefined;
    const client = createClient({
      onEvaluate: (resolved) => {
        first ??= new WeakRef(resolved);
      },
    });
    const seen: RuntimeOperationObservation[] = [];
    client.on('operation', (observation) => seen.push(observation));
    const document = client.open({ source, parameters: { width: 12 }, watch: false });
    try {
      await document.evaluation();
      // A new evaluation replaces the document's retained build input, so only an observation path could still hold
      // the first one.
      await document.update({ parameters: { width: 14 } });
      await document.evaluation();
      await vi.waitFor(() => {
        expect(byOperation(seen, 'evaluate')).toHaveLength(2);
      });
      expect(first).toBeDefined();
      for (let round = 0; round < 5 && first?.deref() !== undefined; round++) {
        // oxlint-disable-next-line no-await-in-loop -- each round lets pending releases run before collecting.
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 10);
        });
        collect();
      }
      expect(first?.deref()).toBeUndefined();
      expect(seen.every(({ facts }) => facts === 'not-observed')).toBe(true);
    } finally {
      document.close();
      await client.shutdown();
    }
  });

  it("should report a native kernel's child tree at settle on every operation, and sample nothing unobserved", async () => {
    const bytes = 96 * 1024 * 1024;
    const childResident = vi.fn(async () => bytes);
    const unobserved = createClient({ childResident });
    try {
      await runOperations(unobserved);
    } finally {
      await unobserved.shutdown();
    }
    expect(childResident).not.toHaveBeenCalled();

    const client = createClient({ childResident });
    const seen: RuntimeOperationObservation[] = [];
    client.on('operation', (observation) => seen.push(observation));
    client.observe('facts');
    try {
      const document = client.open({ source, parameters: { width: 12 }, watch: false });
      await document.evaluation();
      const view = document.view('primary');
      const outcome = await view.rendering();
      // Observation only: the rendering the recycle policy reads carries no heap from this hook.
      expect(outcome).toMatchObject({ superseded: false, rendering: { success: true } });
      expect(outcome.superseded ? undefined : outcome.rendering).not.toHaveProperty('heapBytes');
      await document.export('bom');
      view.close();
      document.close();
      await vi.waitFor(() => {
        expect(
          ['evaluate', 'render', 'export'].every((operation) => byOperation(seen, operation)[0]?.facts === 'joined'),
        ).toBe(true);
      });
      for (const operation of ['evaluate', 'render', 'export']) {
        expect(byOperation(seen, operation)[0], operation).toMatchObject({
          worker: { heapBytes: bytes, heapSource: 'child' },
        });
      }
    } finally {
      await client.shutdown();
    }
  });
});
