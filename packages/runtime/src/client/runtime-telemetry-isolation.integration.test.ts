// @vitest-environment node
/**
 * Telemetry failure isolation (T22) and late work against independent logs (T23), over the real in-process
 * transport: a real client, dispatcher, kernel worker, tracer and collector.
 *
 * Two records are kept apart in every test. The client's record is what `client.on('operation')` emits. The
 * worker's record is every span its {@link WorkerTelemetryCollector} is handed, read where the worker collects it
 * and before the wire, so neither record can vouch for the other.
 */
import fs from 'node:fs';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MessagePort } from 'node:worker_threads';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRuntimeClient } from '#client/runtime-document-client-core.js';
import { createKernelSuccess } from '#kernels/kernel-helpers.js';
import { fromMemoryFs } from '#filesystem/runtime-filesystem.js';
import { isOperationAbortedError } from '#framework/runtime-operation-errors.js';
import { openTelemetryFileSink } from '#framework/telemetry-file-sink.js';
import { WorkerTelemetryCollector, workerTelemetryCollectorLimit } from '#framework/worker-telemetry.js';
import { inProcessTransport } from '#transport/in-process-transport.js';
import { defineKernelV2, nonemptyExportFiles } from '#types/runtime-kernel-v2.types.js';
import type { RuntimeLateTerminal, RuntimeOperationObservation } from '#types/runtime-observation.types.js';
import type { TelemetryBatch, TelemetryEntry } from '#types/runtime-wire.types.js';
import { defineRuntime } from '#worker/runtime-definition.js';

const parameters = {
  schema: {
    $schema: 'https://json-structure.org/meta/extended/v0/#',
    $id: 'urn:taucad:test:isolation',
    $uses: ['JSONSchemaUnits'],
    name: 'IsolationParameters',
    type: 'object',
    properties: { width: { type: 'double', ucumUnit: 'mm' } },
    required: ['width'],
  },
  defaults: { width: 10 },
} as const;

/** What the kernel does on each call; a test replaces only what it needs. */
type Script = {
  /** Kernel-authored spans the next `describe` opens and ends. */
  describeSpans: number;
  /** Holds `describe`; given the operation signal. */
  describeGate?: (signal: AbortSignal) => Promise<void>;
  /** Holds `render`; given the call number and the operation signal. */
  renderGate?: (call: number, signal: AbortSignal) => Promise<void>;
  /** Holds `export`; given the operation signal. */
  exportGate?: (signal: AbortSignal) => Promise<void>;
};

const createClient = (script: Script) => {
  let renders = 0;
  const kernel = defineKernelV2({
    id: 'isolation-kernel',
    extensions: ['circuit'] as const,
    name: 'Isolation kernel',
    version: '1.0.0',
    views: { primary: { title: 'Primary', mimeType: 'image/svg+xml' } },
    exports: { bom: { title: 'BOM', mimeType: 'text/csv', extension: 'csv' } },
    async initialize() {
      return {};
    },
    async resolve({ entryPath }) {
      return { resolved: [entryPath], unresolved: [] };
    },
    async describe(_input, { signal, tracer }) {
      for (let index = 0; index < script.describeSpans; index++) {
        tracer.startSpan('fixture.span').end();
      }
      await script.describeGate?.(signal);
      return createKernelSuccess({ parameters });
    },
    async evaluate({ entryPath, parameters: resolved }) {
      return {
        handle: { entryPath, width: String(resolved['width']) },
        views: ['primary'] as const,
        exports: ['bom'] as const,
      };
    },
    async render({ handle }, { signal }) {
      const call = ++renders;
      await script.renderGate?.(call, signal);
      return {
        content: `<svg xmlns="http://www.w3.org/2000/svg" data-entry="${handle.entryPath}" data-width="${handle.width}" data-call="${String(call)}"/>`,
      };
    },
    async export(_input, { signal }) {
      await script.exportGate?.(signal);
      return {
        files: nonemptyExportFiles([{ name: 'bom.csv', mimeType: 'text/csv', bytes: new TextEncoder().encode('a,b') }]),
      };
    },
  })();
  const runtime = defineRuntime({ kernels: [kernel], middleware: [] });
  return createRuntimeClient({ transport: inProcessTransport({ runtime, fileSystem: fromMemoryFs({}) }) });
};

type Client = ReturnType<typeof createClient>;

const source = { files: { 'model.circuit': 'board' } };

/** The client's record and the worker's record of one client, kept apart. */
const recordsOf = (client: Client) => {
  const observations: RuntimeOperationObservation[] = [];
  const late: RuntimeLateTerminal[] = [];
  const delivered: TelemetryBatch[] = [];
  client.on('operation', (observation) => observations.push(observation));
  client.on('operation-late', (terminal) => late.push(terminal));
  client.on('telemetry', (batch) => delivered.push(batch));
  return { observations, late, delivered };
};

/** Every span the worker's collector is handed, whether it keeps or refuses it. */
const workerSpans = () => {
  const collected: TelemetryEntry[] = [];
  const { collect } = WorkerTelemetryCollector.prototype;
  vi.spyOn(WorkerTelemetryCollector.prototype, 'collect').mockImplementation(function record(
    this: WorkerTelemetryCollector,
    entry: TelemetryEntry,
  ) {
    collected.push(entry);
    collect.call(this, entry);
  });
  return collected;
};

/** The worker's root span for one operation id. */
const rootFor = (spans: readonly TelemetryEntry[], operationId: string): TelemetryEntry | undefined =>
  spans.find((entry) => entry.detail?.['operation.id'] === operationId && entry.detail['parentSpanId'] === undefined);

const byOperation = (seen: readonly RuntimeOperationObservation[], operation: string) =>
  seen.filter((observation) => observation.operation === operation);

/**
 * Act in the turn the worker posts its first `rendered` reply: the reply is on the wire, not yet delivered.
 *
 * @param act - What the caller does before the reply lands.
 */
const afterFirstRenderedPost = (act: () => void): void => {
  const { postMessage } = MessagePort.prototype;
  let acted = false;
  vi.spyOn(MessagePort.prototype, 'postMessage').mockImplementation(function post(this: MessagePort, ...args) {
    Reflect.apply(postMessage, this, args);
    const frame = args[0] as Readonly<{ k?: string; n?: string }> | undefined;
    if (!acted && frame?.k === 'nt' && frame.n === 'rendered') {
      acted = true;
      queueMicrotask(act);
    }
  });
};

/**
 * What a promise rejected with.
 *
 * @param promise - The promise.
 * @returns Its rejection, or `undefined` when it resolved.
 */
const rejectionOf = async (promise: Promise<unknown>): Promise<unknown> => {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return error;
  }
};

/** Any rejection or exception that escapes to the process while a test runs. */
const escapes = () => {
  const seen: unknown[] = [];
  const record = (error: unknown): void => {
    seen.push(error);
  };
  process.on('unhandledRejection', record);
  process.on('uncaughtException', record);
  return {
    seen,
    stop: () => {
      process.off('unhandledRejection', record);
      process.off('uncaughtException', record);
    },
  };
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('T22: telemetry never breaks the operation', () => {
  describe('a full trace disk under the file sink', () => {
    let directory = '';

    beforeEach(async () => {
      directory = await mkdtemp(join(tmpdir(), 'tau-t22-enospc-'));
    });

    afterEach(async () => {
      await rm(directory, { recursive: true, force: true });
    });

    it('T22: should keep every operation succeeding and count every span after ENOSPC from the real write path', async () => {
      const escaped = escapes();
      const filePath = join(directory, 'utility-enospc.jsonl');
      const sink = await openTelemetryFileSink({ directory, fileName: 'utility-enospc.jsonl' });
      expect(sink).toBeDefined();
      /* The disk fills at the fs calls the sink's `WriteStream` makes; everything above them is real. */
      let full = false;
      let refusedWrites = 0;
      const enospc = (): NodeJS.ErrnoException =>
        Object.assign(new Error('ENOSPC: no space left on device, write'), {
          code: 'ENOSPC',
          errno: -28,
          syscall: 'write',
        });
      const { write, writev } = fs;
      const fail = (args: unknown[]): void => {
        refusedWrites++;
        const callback = args.at(-1) as (error: NodeJS.ErrnoException) => void;
        process.nextTick(callback, enospc());
      };
      vi.spyOn(fs, 'write').mockImplementation(((...args: unknown[]) => {
        if (full) {
          fail(args);
          return;
        }
        Reflect.apply(write, fs, args);
      }) as typeof fs.write);
      vi.spyOn(fs, 'writev').mockImplementation(((...args: unknown[]) => {
        if (full) {
          fail(args);
          return;
        }
        Reflect.apply(writev, fs, args);
      }) as typeof fs.writev);

      const client = createClient({ describeSpans: 0 });
      let afterFailure: number | undefined;
      client.on('telemetry', (batch) => {
        sink!.write(batch);
        if (afterFailure !== undefined) {
          afterFailure += batch.entries.length;
        }
      });
      const seen: RuntimeOperationObservation[] = [];
      client.on('operation', (observation) => seen.push(observation));
      client.observe('facts');
      try {
        await expect(client.describe({ source })).resolves.toMatchObject({ success: true });
        await vi.waitFor(async () => {
          const text = await readFile(filePath, 'utf8');
          expect(text.split('\n').filter(Boolean).length).toBeGreaterThan(0);
        });
        const { size } = await stat(filePath);

        full = true;
        await expect(client.describe({ source })).resolves.toMatchObject({ success: true });
        // The stream reports the refused write as an 'error' event on a later turn; the sink turns itself off.
        await vi.waitFor(() => {
          expect(refusedWrites).toBeGreaterThan(0);
        });
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 10);
        });
        const droppedAtFailure = sink!.dropped;
        afterFailure = 0;

        const document = client.open({ source, parameters: { width: 12 }, watch: false });
        await expect(document.evaluation()).resolves.toMatchObject({ evaluation: { success: true } });
        const view = document.view('primary');
        await expect(view.rendering()).resolves.toMatchObject({ rendering: { success: true } });
        await expect(document.export('bom')).resolves.toMatchObject({ success: true });
        await expect(client.describe({ source })).resolves.toMatchObject({ success: true });
        view.close();
        document.close();
        await vi.waitFor(() => {
          expect(byOperation(seen, 'describe').filter(({ facts }) => facts === 'joined')).toHaveLength(3);
        });

        // Per the sink's contract, everything it accepts after the file failed is counted, not written.
        expect(afterFailure).toBeGreaterThan(0);
        expect(sink!.dropped - droppedAtFailure).toBe(afterFailure);
        const after = await stat(filePath);
        expect(after.size).toBe(size);
        expect(seen.every(({ outcome }) => outcome.type === 'succeeded')).toBe(true);
        expect(() => {
          sink!.close();
        }).not.toThrow();
      } finally {
        await client.shutdown();
        escaped.stop();
      }
      expect(escaped.seen).toEqual([]);
    });
  });

  describe('consumers that misbehave', () => {
    it('T22: should leave results unchanged when an observation subscriber starts another operation from its callback', async () => {
      const client = createClient({ describeSpans: 0 });
      const { observations } = recordsOf(client);
      const nested: Array<Promise<unknown>> = [];
      // Re-enters the client from inside the emit, three levels deep, from both the operation and telemetry topics.
      client.on('operation', (observation) => {
        if (observation.operation === 'describe' && nested.length < 3) {
          nested.push(client.describe({ source }));
        }
      });
      let telemetryNested: Promise<unknown> | undefined;
      client.on('telemetry', () => {
        telemetryNested ??= client.describe({ source });
      });
      client.observe('facts');
      try {
        const document = client.open({ source, watch: false });
        await expect(document.evaluation()).resolves.toMatchObject({ evaluation: { success: true } });
        await expect(client.describe({ source })).resolves.toMatchObject({
          success: true,
          kernelId: 'isolation-kernel',
        });
        document.close();
        await vi.waitFor(() => {
          expect(nested).toHaveLength(3);
          expect(telemetryNested).toBeDefined();
        });
        await expect(Promise.all(nested)).resolves.toMatchObject([
          { success: true },
          { success: true },
          { success: true },
        ]);
        await expect(telemetryNested).resolves.toMatchObject({ success: true });
        await vi.waitFor(() => {
          expect(byOperation(observations, 'describe')).toHaveLength(5);
        });
        const describes = byOperation(observations, 'describe');
        expect(new Set(describes.map(({ operationId }) => operationId)).size).toBe(5);
        expect(describes.every(({ outcome }) => outcome.type === 'succeeded')).toBe(true);
      } finally {
        await client.shutdown();
      }
    });

    it('T22: should keep operations completing when an observation and a telemetry subscriber never settle', async () => {
      const client = createClient({ describeSpans: 0 });
      const { observations } = recordsOf(client);
      let stalledOperations = 0;
      let stalledBatches = 0;
      const never = async (): Promise<void> =>
        new Promise<void>(() => {
          /* Never settles. */
        });
      client.on('operation', () => {
        stalledOperations++;
        void never();
      });
      client.on('telemetry', () => {
        stalledBatches++;
        void never();
      });
      client.observe('facts');
      const rounds = 20;
      try {
        for (let round = 0; round < rounds; round++) {
          // oxlint-disable-next-line no-await-in-loop -- each round must finish while every earlier callback is stalled.
          await expect(client.describe({ source })).resolves.toMatchObject({ success: true });
        }
        await vi.waitFor(() => {
          expect(byOperation(observations, 'describe').filter(({ facts }) => facts === 'joined')).toHaveLength(rounds);
        });
        // Each stalled callback ran once per event: nothing queued behind it and nothing was replayed.
        expect(stalledOperations).toBe(observations.length);
        expect(stalledBatches).toBeGreaterThanOrEqual(rounds);
      } finally {
        await client.shutdown();
      }
    });
  });

  describe('the collector bound on the real span path', () => {
    it(`T22: should count the spans past ${workerTelemetryCollectorLimit} and still succeed, naming the dropped root`, async () => {
      const spans = workerSpans();
      const script: Script = { describeSpans: workerTelemetryCollectorLimit + 1 };
      const client = createClient(script);
      const { observations, delivered } = recordsOf(client);
      client.observe('facts');
      try {
        await client.connect();
        await vi.waitFor(() => {
          expect(byOperation(observations, 'initialize')).toHaveLength(1);
        });
        const collectedBefore = spans.length;
        const deliveredBefore = delivered.length;

        await expect(client.describe({ source })).resolves.toMatchObject({ success: true });
        await vi.waitFor(() => {
          expect(byOperation(observations, 'describe')).toHaveLength(1);
        });
        const [observed] = byOperation(observations, 'describe');
        expect(observed?.outcome).toEqual({ type: 'succeeded' });

        // The worker's record: every span the operation ended, the bound's refusals included.
        const handed = spans.slice(collectedBefore);
        expect(handed.filter(({ name }) => name === 'fixture.span')).toHaveLength(workerTelemetryCollectorLimit + 1);
        const root = rootFor(handed, observed!.operationId);
        expect(root?.name).toBe('kernel.describe');
        // The client's record: at most the bound arrived, and every refusal is counted on the wire.
        await vi.waitFor(() => {
          expect(delivered.slice(deliveredBefore).reduce((sum, { dropped }) => sum + (dropped ?? 0), 0)).toBe(
            handed.length - workerTelemetryCollectorLimit,
          );
        });
        const batches = delivered.slice(deliveredBefore);
        const arrived = batches.flatMap(({ entries }) => entries);
        expect(arrived).toHaveLength(workerTelemetryCollectorLimit);
        // The root ends last, after the bound was reached: it is refused, and named so its children still join it.
        expect(arrived.some((entry) => entry.detail?.['operation.id'] === observed!.operationId)).toBe(false);
        const droppedRoots: Record<string, string> = {};
        for (const batch of batches) {
          Object.assign(droppedRoots, batch.droppedRoots);
        }
        expect(droppedRoots).toEqual({
          [String(root!.detail!['spanId'])]: observed!.operationId,
        });

        // The bound resets with the flush: the next operation's root arrives whole.
        script.describeSpans = 0;
        const next = delivered.length;
        await expect(client.describe({ source })).resolves.toMatchObject({ success: true });
        await vi.waitFor(() => {
          expect(byOperation(observations, 'describe')).toHaveLength(2);
        });
        const [, second] = byOperation(observations, 'describe');
        await vi.waitFor(() => {
          expect(
            rootFor(
              delivered.slice(next).flatMap(({ entries }) => entries),
              second!.operationId,
            ),
          ).toBeDefined();
        });
        expect(delivered.slice(next).every(({ dropped }) => (dropped ?? 0) === 0)).toBe(true);
      } finally {
        await client.shutdown();
      }
    });
  });

  describe('cancel parity between the result and the telemetry outcome', () => {
    it('T22: should record a cancelled describe as cancelled on both sides when the kernel honours the signal', async () => {
      const spans = workerSpans();
      const entered = Promise.withResolvers<void>();
      const client = createClient({
        describeSpans: 0,
        describeGate: async (signal) => {
          entered.resolve();
          await new Promise<void>((_resolve, reject) => {
            signal.addEventListener('abort', () => {
              reject(new Error('describe aborted'));
            });
          });
        },
      });
      const { observations } = recordsOf(client);
      client.observe('facts');
      try {
        const controller = new AbortController();
        const described = client.describe({ source, signal: controller.signal });
        await entered.promise;
        controller.abort();
        const error = await rejectionOf(described);
        expect(isOperationAbortedError(error)).toBe(true);
        await vi.waitFor(() => {
          expect(byOperation(observations, 'describe')).toHaveLength(1);
        });
        const [observed] = byOperation(observations, 'describe');
        expect(observed).toMatchObject({ outcome: { type: 'cancelled' }, facts: 'none' });
        await vi.waitFor(() => {
          expect(rootFor(spans, observed!.operationId)?.detail?.['operation.outcome']).toBe('cancelled');
        });
      } finally {
        await client.shutdown();
      }
    });

    it('T22: should record a cancelled export as cancelled to its caller and its observation when the kernel ignores the signal', async () => {
      const spans = workerSpans();
      const entered = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      let abortSeen = false;
      const client = createClient({
        describeSpans: 0,
        exportGate: async (signal) => {
          signal.addEventListener('abort', () => {
            abortSeen = true;
          });
          entered.resolve();
          await release.promise;
        },
      });
      const { observations, late } = recordsOf(client);
      client.observe('facts');
      const document = client.open({ source, watch: false });
      try {
        await document.evaluation();
        const controller = new AbortController();
        const exported = document.export('bom', { signal: controller.signal });
        await entered.promise;
        controller.abort();
        const error = await rejectionOf(exported);
        expect(isOperationAbortedError(error)).toBe(true);
        await vi.waitFor(() => {
          expect(byOperation(observations, 'export')).toHaveLength(1);
        });
        const [observed] = byOperation(observations, 'export');
        expect(observed?.outcome).toEqual({ type: 'cancelled' });
        expect(rootFor(spans, observed!.operationId)).toBeUndefined();

        release.resolve();
        // The worker's record agrees: the kernel ran on past the cancel, and the runtime discarded what it made and
        // ended the root cancelled. The cancelled call carries no reply, so the client has no late reply to report.
        await vi.waitFor(() => {
          expect(rootFor(spans, observed!.operationId)?.detail?.['operation.outcome']).toBe('cancelled');
        });
        expect(abortSeen).toBe(true);
        expect(late).toEqual([]);
        // No second observation: the late reply changes nothing the caller saw.
        expect(byOperation(observations, 'export')).toHaveLength(1);
      } finally {
        release.resolve();
        document.close();
        await client.shutdown();
      }
    });
  });
});

describe('T23: late work against independent logs', () => {
  it('T23: should not attribute a superseded render reply to the render that replaced it', async () => {
    const spans = workerSpans();
    const release = Promise.withResolvers<void>();
    const entered = Promise.withResolvers<void>();
    const client = createClient({
      describeSpans: 0,
      renderGate: async (call) => {
        if (call === 1) {
          entered.resolve();
          await release.promise;
        }
      },
    });
    const { observations, late } = recordsOf(client);
    client.observe('facts');
    const document = client.open({ source, parameters: { width: 12 }, watch: false });
    try {
      await document.evaluation();
      const view = document.view('primary');
      const superseded = view.rendering();
      await entered.promise;
      // The first render's reply is on the wire before the caller moves on; it lands after the new intent.
      let updated: Promise<unknown> | undefined;
      afterFirstRenderedPost(() => {
        updated = document.update({ parameters: { width: 14 } });
      });
      release.resolve();
      // The caller moved on before the reply landed: the reply is not admitted to the read that asked for it.
      await expect(superseded).resolves.toEqual({ superseded: true });
      await vi.waitFor(() => {
        expect(updated).toBeDefined();
      });
      await expect(updated).resolves.toMatchObject({ superseded: false });
      const outcome = await view.rendering();
      const content =
        outcome.superseded || !outcome.rendering.success ? '' : String(outcome.rendering.artifact.content);
      expect(content).toContain('data-width="14"');
      expect(content).toContain('data-call="2"');
      view.close();

      await vi.waitFor(() => {
        expect(byOperation(observations, 'render').filter(({ facts }) => facts !== 'not-observed')).toHaveLength(2);
      });
      const [first, second] = byOperation(observations, 'render');
      expect(first!.operationId).not.toBe(second!.operationId);
      expect(second!.outcome).toEqual({ type: 'succeeded' });
      // The worker's record: two renders, each ended under its own operation id, each as it actually ran.
      await vi.waitFor(() => {
        expect(rootFor(spans, first!.operationId)?.detail?.['operation.outcome']).toBe('succeeded');
        expect(rootFor(spans, second!.operationId)?.detail?.['operation.outcome']).toBe('succeeded');
      });
      expect(late).toEqual([]);
    } finally {
      release.resolve();
      document.close();
      await client.shutdown();
    }
  });

  it("T23: should report another document's late render reply under its own id, never the current render's", async () => {
    const spans = workerSpans();
    const release = Promise.withResolvers<void>();
    const entered = Promise.withResolvers<void>();
    const client = createClient({
      describeSpans: 0,
      renderGate: async (call) => {
        if (call === 1) {
          entered.resolve();
          await release.promise;
        }
      },
    });
    const { observations, late } = recordsOf(client);
    client.observe('facts');
    const a = client.open({ source: { files: { 'a.circuit': 'a' } }, watch: false });
    const b = client.open({ source: { files: { 'b.circuit': 'b' } }, watch: false });
    try {
      await a.evaluation();
      await b.evaluation();
      const viewA = a.view('primary');
      const renderingA = rejectionOf(viewA.rendering());
      await entered.promise;
      // B's render is queued behind A's in the serialized worker.
      const viewB = b.view('primary');
      const renderingB = viewB.rendering();
      // A's caller leaves once A's reply is on the wire, so the reply lands on an abandoned attempt.
      afterFirstRenderedPost(() => {
        viewA.close();
      });
      release.resolve();
      const outcome = await renderingB;
      const content =
        outcome.superseded || !outcome.rendering.success ? '' : String(outcome.rendering.artifact.content);
      expect(content).toContain('data-entry="b.circuit"');
      viewB.close();
      // A's own read ends when its caller leaves; nothing A's reply carries reaches it.
      expect(await renderingA).toBeDefined();

      await vi.waitFor(() => {
        expect(byOperation(observations, 'render')).toHaveLength(2);
        expect(late).toHaveLength(1);
      });
      const renders = byOperation(observations, 'render');
      const abandoned = renders.find(({ outcome: { type } }) => type === 'abandoned')!;
      const current = renders.find(({ outcome: { type } }) => type === 'succeeded')!;
      expect(abandoned).toMatchObject({ outcome: { type: 'abandoned', reason: 'closed' }, facts: 'none' });
      expect(current).toBeDefined();
      // The client's record: A's late reply is reported once, under A's id, and B's attempt is untouched by it.
      expect(late).toEqual([expect.objectContaining({ operationId: abandoned.operationId, settledAs: 'abandoned' })]);
      expect(late[0]!.operationId).not.toBe(current.operationId);
      // The worker's record: both renders ran to their replies, each under its own id.
      await vi.waitFor(() => {
        expect(rootFor(spans, abandoned.operationId)?.detail?.['operation.outcome']).toBe('succeeded');
        expect(rootFor(spans, current.operationId)?.detail?.['operation.outcome']).toBe('succeeded');
      });
    } finally {
      release.resolve();
      a.close();
      b.close();
      await client.shutdown();
    }
  });
});
