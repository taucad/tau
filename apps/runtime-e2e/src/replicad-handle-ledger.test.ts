/* oxlint-disable eslint/no-await-in-loop -- builds run in order: each one replaces the last. */
/**
 * Handle ledger over the Replicad editing matrix (catalogue E12, memory T6): each of the seven matrix models is
 * rebuilt through the real runtime, alternating parameter sets, with the live tier off and on. After each build and a
 * collection, the OpenCascade handles still alive are counted. Every return to the base parameters must leave exactly
 * as many as the last one: Tau keeps nothing per build, and no handle is ever deleted twice.
 */
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import { Worker as NodeWorker } from 'node:worker_threads';
import { describe, expect, it } from 'vitest';
import { esbuildBundler } from '@taucad/esbuild';
import { replicadKernel } from '@taucad/replicad';
import { createRuntimeClient } from '@taucad/runtime/client';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
import { fromNodeFs } from '@taucad/runtime/filesystem/node';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { nodeWorkerTransport } from '@taucad/runtime/transport/node';
import { defineRuntime } from '@taucad/runtime/worker';
import { installHandleLedger, summarizeLeaks } from '@taucad/runtime-testing';
import { loadFixture } from '@taucad/tau-examples/fixtures';
import * as replicad from 'replicad';
import type { LedgerWorkerMessage } from '#fixtures/replicad-ledger-worker.js';

setFlagsFromString('--expose-gc');
const gc = runInNewContext('gc') as () => void;
const collect = async (): Promise<void> => {
  for (let round = 0; round < 4; round += 1) {
    gc();
    await new Promise((resolve) => {
      setTimeout(resolve, 5);
    });
  }
};

type ParameterSet = Readonly<Record<string, unknown>>;

/** The matrix and the parameter sets its edits use (one late feature, one early feature). */
const matrix: ReadonlyArray<{
  readonly name: Parameters<typeof loadFixture<'replicad'>>[1];
  readonly a: ParameterSet;
  readonly b: ParameterSet;
}> = [
  { name: 'gridfinity-box', a: { enableMagnet: true }, b: { xSize: 3 } },
  { name: 'stress-test', a: { loftHeight: 22 }, b: { baseLength: 130 } },
  { name: 'spur-gearbox', a: { inputAngle: 10 }, b: { coverLift: 20 } },
  { name: 'turbofan', a: { reverserTravel: 200 }, b: { vaneAngle: -20 } },
  { name: 'bench-vise', a: { opening: 80 }, b: { jawWidth: 140 } },
  { name: 'six-axis-arm', a: { j2: 20 }, b: { reach: 600 } },
  { name: 'planetary-gear-system', a: { inputAngle: 15 }, b: { faceWidth: 16 } },
];

const base: ParameterSet = {};
// The document opens at the base parameters, so the first edit moves away from them.
const steps = ['a', base, 'b', base, 'a', base, 'b', base] as const;

describe('Replicad handle ledger over the editing matrix', () => {
  for (const { name, a, b } of matrix) {
    for (const computeReuse of [false, true]) {
      const arm = computeReuse ? 'on' : 'off';
      it(`${name} leaks no handle across rebuilds, live tier ${arm}`, async () => {
        const fixture = loadFixture('replicad', name);
        const client = createRuntimeClient({
          transport: inProcessTransport({
            runtime: defineRuntime({
              kernels: [replicadKernel({ wasm: 'single', ...(computeReuse ? {} : { computeReuse: false }) })],
              bundlers: [esbuildBundler()],
            }),
            fileSystem: fromMemoryFs(fixture.files),
            compute: { mode: 'memory' },
          }),
        });
        const document = client.open({ source: { path: fixture.mainFile }, parameters: base, watch: false });
        const view = document.view('model');
        try {
          const render = async (): Promise<void> => {
            const outcome = await view.rendering();
            if (outcome.superseded || !outcome.rendering.success) {
              throw new Error(`Render failed: ${JSON.stringify(outcome).slice(0, 2000)}`);
            }
          };
          await render();
          const ledger = installHandleLedger(replicad.getOC());
          await collect();
          const before = ledger.snapshot();
          const atBase: number[] = [];
          for (const step of steps) {
            const parameters = step === 'a' ? a : step === 'b' ? b : step;
            await document.update({ parameters });
            await render();
            await collect();
            if (step === base) {
              atBase.push(ledger.since(before).length);
            }
          }

          // With the tier, the first cycle fills it; from then on a return to the base parameters is a revisit.
          const settled = computeReuse ? atBase.slice(2) : atBase;
          expect(settled, JSON.stringify(summarizeLeaks(ledger.since(before)).slice(0, 10))).toStrictEqual(
            Array.from({ length: settled.length }, () => settled[0]),
          );
          expect(ledger.stats().doubleDeletes).toBe(0);
        } finally {
          view.close();
          document.close();
          await client.shutdown();
        }
      });
    }
  }
});

type LedgerCount = NonNullable<Extract<LedgerWorkerMessage, { id: number }>['counted']>;

/** Fail with what was awaited instead of hanging until the test times out. */
const within = async <T>(promise: Promise<T>, what: string): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`no ${what} within 120 s`));
        }, 120_000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
};

const turn = async (): Promise<void> =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });

type TelemetryEntry = {
  readonly name: string;
  readonly startTime: number;
  readonly duration: number;
  readonly workerTimeOrigin: number;
  readonly detail?: Readonly<Record<string, unknown>>;
};

/**
 * The render the worker was held in at a checkpoint (one render contains that instant), whether its pack had started
 * (its `replicad.render-output` span had ended), and its outcome.
 */
const checkpointOf = (telemetry: readonly TelemetryEntry[], heldAt: number) => {
  const startOf = (entry: TelemetryEntry): number => entry.workerTimeOrigin + entry.startTime;
  const endOf = (entry: TelemetryEntry): number => startOf(entry) + entry.duration;
  const renders = telemetry.filter(
    (entry) => entry.name === 'kernel.render' && startOf(entry) <= heldAt && endOf(entry) >= heldAt,
  );
  const [held] = renders;
  return {
    renders: renders.length,
    packStarted:
      held !== undefined &&
      telemetry.some(
        (entry) => entry.name === 'replicad.render-output' && startOf(entry) >= startOf(held) && endOf(entry) <= heldAt,
      ),
    outcome: held?.detail?.['operation.outcome'],
  };
};

/**
 * A runtime client whose Replicad kernel runs in `fixtures/replicad-ledger-worker.ts`, with that worker's ledger and
 * stop gate. `holdAtPackStart` makes the worker hold as the next GLB pack starts, until `release`.
 */
const openLedgerWorker = (root: string, computeReuse: boolean) => {
  const channelName = `tau-ledger-drag-${randomUUID()}`;
  const channel = new BroadcastChannel(channelName);
  const spanWaiters: Array<{ span: string; settle: () => void }> = [];
  const replies = new Map<number, (count: LedgerCount | undefined) => void>();
  const ready = Promise.withResolvers<void>();
  channel.addEventListener('message', ({ data }: MessageEvent<LedgerWorkerMessage>) => {
    if ('ready' in data) {
      ready.resolve();
    } else if ('span' in data) {
      const index = spanWaiters.findIndex((waiter) => waiter.span === data.span);
      if (index !== -1) {
        spanWaiters.splice(index, 1)[0]!.settle();
      }
    } else if ('id' in data) {
      replies.get(data.id)?.(data.counted);
    }
  });
  let requests = 0;
  const ask = async (ledger: 'install' | 'snapshot' | 'count'): Promise<LedgerCount | undefined> => {
    requests += 1;
    const id = requests;
    const reply = new Promise<LedgerCount | undefined>((resolve) => {
      replies.set(id, resolve);
    });
    channel.postMessage({ id, ledger });
    return within(reply, `ledger ${ledger} reply`);
  };
  const gate = new Int32Array(new SharedArrayBuffer(8));
  class LedgerWorker extends NodeWorker {
    public constructor(url: string | URL) {
      super(url, { execArgv: ['--import', 'tsx'], workerData: { channel: channelName, computeReuse } });
    }
  }
  const client = createRuntimeClient({
    transport: nodeWorkerTransport({
      url: new URL('fixtures/replicad-ledger-worker.ts', import.meta.url),
      fileSystem: fromNodeFs(root),
      compute: { mode: 'memory' },
      devtoolsTelemetry: true,
      workerCtor: LedgerWorker,
    }),
  });
  return {
    client,
    ask,
    /** Hand the gate to the worker; call once the worker has started. */
    async connectGate(): Promise<void> {
      channel.postMessage({ gate: gate.buffer });
      await within(ready.promise, 'gate handshake with the worker');
    },
    /** Hold the worker as the next pack starts; resolves once it holds there. */
    async holdAtPackStart(): Promise<void> {
      const ended = new Promise<void>((resolve) => {
        spanWaiters.push({ span: 'replicad.render-output', settle: resolve });
      });
      Atomics.store(gate, 1, 0);
      Atomics.store(gate, 0, 2);
      return ended;
    },
    release(): void {
      Atomics.store(gate, 0, 0);
      Atomics.store(gate, 1, 1);
      Atomics.notify(gate, 1);
    },
    close(): void {
      channel.close();
    },
  };
};

/**
 * An interrupted drag (P9c): frames sent back to back as a slider sends them, so each one supersedes the build or the
 * render (its GLB pack included) still running for the last. Each drag ends on a committed value; every return to the
 * base value must leave as many handles as the last one, delete none twice, and render the bytes reuse off renders.
 *
 * The kernel runs in a worker thread so that a supersede can land while it works: in process, every frame of the
 * burst lands between phases, before its build has made a handle. Each drag starts with a checkpoint, the stop gate of
 * the qualification harness (`qualify-worker.mts`): the worker holds as the first frame's GLB pack starts, after its
 * main() and tessellation made their handles, the next frame supersedes it there, and the pack stops. The rest of the
 * drag is the burst.
 */
describe('Replicad handle ledger over an interrupted drag', () => {
  const drags: ReadonlyArray<{
    readonly name: Parameters<typeof loadFixture<'replicad'>>[1];
    readonly key: string;
    readonly values: readonly number[];
  }> = [
    { name: 'planetary-gear-system', key: 'inputAngle', values: [3, 6, 9, 12, 15] },
    { name: 'turbofan', key: 'reverserTravel', values: [40, 80, 120, 160, 200] },
  ];
  // Three drags: with the tier, the first fills it and two compare. Each checkpointed frame runs main() in full.
  const dragCount = 3;

  /** One arm: the drags, then the handles alive at each return to the base value and the rendered bytes. */
  const dragArm = async (
    { mainFile, root }: { readonly mainFile: string; readonly root: string },
    { key, values }: { readonly key: string; readonly values: readonly number[] },
    computeReuse: boolean,
  ) => {
    const worker = openLedgerWorker(root, computeReuse);
    const telemetry: TelemetryEntry[] = [];
    worker.client.on('telemetry', ({ entries }) => {
      telemetry.push(...entries);
    });
    const document = worker.client.open({ source: { path: mainFile }, parameters: base, watch: false });
    // The client can stop only an operation whose progress notice it has read (see `qualify-arm.mts`).
    const renderNotice = async (): Promise<void> =>
      new Promise((resolve) => {
        const off = document.on('progress', (event: { phase: string; detail?: Record<string, unknown> }) => {
          if (event.phase === 'render' && typeof event.detail?.['abortSequence'] === 'number') {
            off();
            resolve();
          }
        });
      });
    const view = document.view('model');
    const render = async (): Promise<string> => {
      const outcome = await view.rendering();
      if (outcome.superseded || !outcome.rendering.success) {
        throw new Error(`Render failed: ${JSON.stringify(outcome).slice(0, 2000)}`);
      }
      const { artifact } = outcome.rendering;
      return createHash('sha256')
        .update((artifact as { content: Uint8Array<ArrayBuffer> }).content)
        .digest('hex');
    };
    try {
      await render();
      await worker.connectGate();
      await worker.ask('install');
      await worker.ask('snapshot');
      const atBase: number[] = [];
      const bytes: string[] = [];
      let counted: LedgerCount | undefined;
      const heldAt: number[] = [];
      for (let drag = 0; drag < dragCount; drag += 1) {
        // Out along the ladder and back to the base value; a frame lands while the last one is still running.
        const frames = [...values, ...values.toReversed().slice(1), 0];
        const [first, ...burst] = frames.slice(0, -1);
        const pending: Array<Promise<unknown>> = [];
        // The checkpoint: the first frame's pack starts held, the second frame supersedes it, then the worker resumes.
        const landed = Promise.all([worker.holdAtPackStart(), renderNotice()]);
        pending.push(document.update({ parameters: { [key]: first } }));
        try {
          await within(landed, `pack start of ${key}=${String(first)} in drag ${drag}`);
          await turn();
          pending.push(document.update({ parameters: { [key]: burst[0] }, transient: true }));
          // The update reaches the session, which signals the abort word, a few microtasks later.
          await turn();
        } finally {
          // Taken while the worker cannot leave the held render: once released, it may stop that render at once.
          heldAt.push(performance.timeOrigin + performance.now());
          worker.release();
        }
        for (const value of burst.slice(1)) {
          pending.push(document.update({ parameters: { [key]: value }, transient: true }));
          await new Promise((resolve) => {
            setTimeout(resolve, 1);
          });
        }
        await document.update({ parameters: { [key]: frames.at(-1) } });
        await Promise.allSettled(pending);
        bytes.push(await render());
        counted = await worker.ask('count');
        atBase.push(counted!.live);
      }
      const cancelled = telemetry.filter(({ detail }) => detail?.['operation.outcome'] === 'cancelled').length;
      return {
        atBase,
        bytes,
        counted: counted!,
        cancelled,
        checkpoints: heldAt.map((at) => checkpointOf(telemetry, at)),
      };
    } finally {
      worker.release();
      view.close();
      document.close();
      await worker.client.shutdown();
      worker.close();
    }
  };

  for (const drag of drags) {
    it(`${drag.name} keeps a flat heap and reuse-off bytes over an interrupted ${drag.key} drag`, async () => {
      const fixture = loadFixture('replicad', drag.name);
      // Worker threads take a filesystem by path, not inline.
      const root = await mkdtemp(join(tmpdir(), 'tau-ledger-drag-'));
      const bytesByArm: Record<string, string[]> = {};
      try {
        for (const [path, content] of Object.entries(fixture.files)) {
          await mkdir(dirname(join(root, path)), { recursive: true });
          await writeFile(join(root, path), content, 'utf8');
        }
        for (const computeReuse of [false, true]) {
          const { atBase, bytes, counted, cancelled, checkpoints } = await dragArm(
            { mainFile: fixture.mainFile, root },
            drag,
            computeReuse,
          );
          // With the tier, the first drag fills it; from then on every drag replays the same frames.
          const settled = computeReuse ? atBase.slice(1) : atBase;
          expect(settled, JSON.stringify(counted.leaks)).toStrictEqual(
            Array.from({ length: settled.length }, () => settled[0]),
          );
          expect(counted.doubleDeletes).toBe(0);
          expect(cancelled, 'no frame was interrupted').toBeGreaterThan(0);
          // Each drag's checkpointed render was held in its pack at the release, and was cancelled there, after that
          // frame's main() and tessellation made its handles.
          expect(checkpoints, `checkpointed renders ${JSON.stringify(checkpoints)}`).toStrictEqual(
            Array.from({ length: dragCount }, () => ({ renders: 1, packStarted: true, outcome: 'cancelled' })),
          );
          bytesByArm[computeReuse ? 'on' : 'off'] = bytes;
        }
      } finally {
        await rm(root, { recursive: true, force: true });
      }
      expect(bytesByArm['on']).toStrictEqual(bytesByArm['off']);
    }, 900_000);
  }
});
