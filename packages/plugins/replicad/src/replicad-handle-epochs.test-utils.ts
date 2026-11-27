// @vitest-environment node
/* oxlint-disable eslint/no-await-in-loop -- builds run in order: each one replaces the last. */
/**
 * Shared by the build-epochs test files (catalogue E12, memory R5 and T6): one in-process runtime session over a
 * source, collection, the handle ledger, the model sources and the long-drag check. The slow tests live in their own
 * files so Vitest runs them side by side.
 */
import { createHash } from 'node:crypto';
import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import { afterEach, expect } from 'vitest';
import { esbuildBundler } from '@taucad/esbuild';
import { asKnownArtifact, createRuntimeClient } from '@taucad/runtime/client';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { defineRuntime } from '@taucad/runtime/worker';
import { installHandleLedger, summarizeLeaks } from '@taucad/runtime-testing';
import type { HandleLedger } from '@taucad/runtime-testing';
import * as replicad from 'replicad';
import { replicadKernel } from '#replicad.kernel.js';

export const renderTimeout = 300_000;

setFlagsFromString('--expose-gc');
const gc = runInNewContext('gc') as () => void;
const collectRounds = 4;
/**
 * Collect and let the finalization registry run, as an idle worker would between edits. Given the ledger, stop early
 * once a round deletes no handle: nothing was finalized, so a further round has nothing new to collect.
 * @param ledger - The ledger whose deletions show when collection has settled.
 */
export const collect = async (ledger?: HandleLedger): Promise<void> => {
  let deleted = ledger?.stats().deleted;
  for (let round = 0; round < collectRounds; round += 1) {
    gc();
    await new Promise((resolve) => {
      setTimeout(resolve, 5);
    });
    if (ledger) {
      const now = ledger.stats().deleted;
      if (round > 0 && now === deleted) {
        return;
      }
      deleted = now;
    }
  }
};

/** The kernel options a session varies: reuse off, or a live-tier byte budget. */
/** One test's live document: `build` renders a parameter set and returns the GLB's digest. */
export type Session = {
  /** The live tier's bytes after each run of `main`. */
  readonly tierBytes: number[];
  /** Attributes of each `replicad.run-main` span, one per run of `main`'s phase. */
  readonly mainSpans: Array<Readonly<Record<string, unknown>>>;
  /** How many entries the live tier evicted. */
  readonly evicted: () => number;
  readonly build: (parameters: Readonly<Record<string, unknown>>) => Promise<string>;
  readonly close: () => Promise<void>;
};

/** The kernel options a session varies: reuse off, or a live-tier byte budget. */
export type Options = { readonly computeReuse?: false; readonly computeReuseBytes?: number };

/**
 * Closes for every client a test opened. A test that times out keeps running in the background, and every client in
 * a test file shares one OpenCascade instance and one ledger: its builds would add handles to the next test's count. So
 * each test's clients are closed after it, whether it passed, failed or timed out, before the next test starts.
 */
const openClients = new Set<() => Promise<void>>();
/** Registers, in the calling test file, the hook that closes each test's clients after it. */
export const closeClientsAfterEachTest = (): void => {
  afterEach(async () => {
    const closes = [...openClients];
    openClients.clear();
    await Promise.all(closes.map(async (close) => close()));
  }, renderTimeout);
};
/**
 * Close `client` after the current test, or with the test that opened it.
 * @param client - A runtime client the test opened.
 * @returns The client, now closed after its test.
 */
export const tracked = <Client extends { shutdown(): Promise<void> }>(client: Client): Client => {
  openClients.add(async () => client.shutdown());
  return client;
};

/**
 * One live document over `source`; `build` renders a parameter set and digests the GLB.
 * @param source - The model's `main.ts`.
 * @param options - The kernel options.
 * @returns The document's session: `build`, `close` and the tier counters.
 */
export const session = (source: string, options: Options = {}): Session => {
  const client = createRuntimeClient({
    transport: inProcessTransport({
      runtime: defineRuntime({
        kernels: [replicadKernel({ wasm: 'single', ...options })],
        bundlers: [esbuildBundler()],
      }),
      fileSystem: fromMemoryFs({ 'main.ts': source }),
      compute: { mode: 'memory' },
    }),
  });
  const tierBytes: number[] = [];
  /** Attributes of each `replicad.run-main` span, one per run of `main`'s phase. */
  const mainSpans: Array<Readonly<Record<string, unknown>>> = [];
  let tierEvicted = 0;
  client.on('telemetry', (batch) => {
    for (const entry of batch.entries) {
      if (entry.name === 'replicad.run-main') {
        mainSpans.push(entry.detail ?? {});
      }
      const bytes = entry.name === 'replicad.run-main' ? entry.detail?.['tierBytes'] : undefined;
      if (typeof bytes === 'number') {
        tierBytes.push(bytes);
        tierEvicted += Number(entry.detail?.['tierEvicted'] ?? 0);
      }
    }
  });
  type Document = ReturnType<typeof client.open>;
  let live: { document: Document; view: ReturnType<Document['view']> } | undefined;
  let closed: Promise<void> | undefined;
  /** The build in flight, settled: closing waits for it so it adds no handle after its test. */
  let inFlight: Promise<void> = Promise.resolve();
  const render = async (parameters: Readonly<Record<string, unknown>>): Promise<string> => {
    if (live) {
      await live.document.update({ parameters });
    } else {
      const document = client.open({ source: { path: 'main.ts' }, parameters, watch: false });
      live = { document, view: document.view('model') };
    }
    const outcome = await live.view.rendering();
    if (outcome.superseded || !outcome.rendering.success) {
      throw new Error(`Render failed: ${JSON.stringify(outcome).slice(0, 2000)}`);
    }
    const artifact = asKnownArtifact(outcome.rendering.artifact);
    if (artifact?.mimeType !== 'model/gltf-binary' || typeof artifact.content === 'string') {
      throw new Error('Expected a GLB');
    }
    return createHash('sha256').update(artifact.content).digest('hex');
  };
  const close = async (): Promise<void> => {
    closed ??= (async () => {
      await inFlight;
      live?.view.close();
      live?.document.close();
      await client.shutdown();
    })();
    return closed;
  };
  openClients.add(close);
  return {
    tierBytes,
    mainSpans,
    evicted: () => tierEvicted,
    async build(parameters: Readonly<Record<string, unknown>>): Promise<string> {
      if (closed) {
        throw new Error('The session is closed: its test has ended');
      }
      const built = render(parameters);
      inFlight = (async () => {
        await Promise.allSettled([built]);
      })();
      return built;
    },
    close,
  };
};

/**
 * The instance the kernel bound for Replicad, ledgered once per test file.
 * @returns The ledger over Replicad's OpenCascade instance.
 */
export const ledgerOf = (): HandleLedger => installHandleLedger(replicad.getOC());
/**
 * The WebAssembly heap's size now.
 * @returns The byte length of the instance's `wasmMemory` buffer.
 */
export const heapBytes = (): number =>
  (replicad.getOC() as unknown as { wasmMemory: WebAssembly.Memory }).wasmMemory.buffer.byteLength;

/** One primitive and no intermediate: every handle a build leaves is what it delivers. */
export const pin = `
  import { makeCylinder } from 'replicad';
  export const defaultParams = { radius: 2 };
  export default function main(p = defaultParams) {
    return makeCylinder(p.radius, 8);
  }
`;

/** A sketched plate with a boss, a hole and a fillet, plus a pin: intermediates, a finder and two entries. */
export const bracket = `
  import { drawRoundedRectangle, makeCylinder } from 'replicad';
  export const defaultParams = { size: 10 };
  export default function main(p = defaultParams) {
    const plate = drawRoundedRectangle(p.size * 4, p.size * 2, 2).sketchOnPlane().extrude(p.size / 2);
    const boss = makeCylinder(p.size / 2, p.size, [0, 0, 0], [0, 0, 1]);
    const hole = makeCylinder(p.size / 5, p.size * 3, [p.size, 0, -p.size], [0, 0, 1]);
    const body = plate.fuse(boss).cut(hole).fillet(0.5, (edges) => edges.inPlane('XY', 0));
    return [{ shape: body, name: 'Body' }, { shape: makeCylinder(2, 8).translate([p.size * 3, 0, 0]), name: 'Pin' }];
  }
`;

/** A shape built at module scope and returned by some builds only. */
export const moduleScope = `
  import { makeBaseBox, makeCylinder } from 'replicad';
  const base = makeBaseBox(10, 10, 10);
  export const defaultParams = { useBase: true, radius: 2 };
  export default function main(p = defaultParams) {
    return p.useBase ? base : makeCylinder(p.radius, 8);
  }
`;

/** A shape memoized in module state during `main` and returned as it is whenever its key comes back. */
export const memoized = `
  import { makeCylinder } from 'replicad';
  const cache = new Map();
  export const defaultParams = { key: 1 };
  export default function main(p = defaultParams) {
    let shape = cache.get(p.key);
    if (!shape) {
      shape = makeCylinder(p.key, 8);
      cache.set(p.key, shape);
    }
    return shape;
  }
`;

/**
 * Module sources for the release fallback. Each counts its own executions on `globalThis` under `counter`, so a test
 * sees whether the kernel ran the module fresh.
 * @param counter - Global the module increments when it executes.
 * @param body - The module's `main`.
 * @returns The module source.
 */
export const counted = (counter: string, body: string): string => `
  import { makeCylinder } from 'replicad';
  globalThis.${counter} = (globalThis.${counter} ?? 0) + 1;
  export const defaultParams = { key: 1, tag: 0 };
  ${body}
`;
export const executions = (counter: string): number => Number((globalThis as Record<string, unknown>)[counter] ?? 0);

/** The memo of {@link memoized}, keyed by `key`; `tag` changes nothing but misses the scene table. */
export const memoBody = `
  const cache = new Map();
  export default function main(p = defaultParams) {
    let shape = cache.get(p.key);
    if (!shape) {
      shape = makeCylinder(p.key, 8);
      cache.set(p.key, shape);
    }
    return shape;
  }
`;

/**
 * One build per key of a cold reuse-off session each: the bytes every revisit must reproduce (I1).
 * @param source - The model's `main.ts`.
 * @param keys - The `key` parameter values.
 * @returns Each key's GLB digest.
 */
export const coldGlbs = async (source: string, keys: readonly number[]): Promise<Map<number, string>> => {
  const glbs = new Map<number, string>();
  for (const key of keys) {
    const opened = session(source, { computeReuse: false });
    try {
      glbs.set(key, await opened.build({ key, tag: 0 }));
    } finally {
      await opened.close();
    }
  }
  return glbs;
};

/**
 * The build's error message, or undefined when it rendered.
 * @param build - A pending `Session.build`.
 * @returns The build's error message, or undefined.
 */
export const failureOf = async (build: Promise<string>): Promise<string | undefined> => {
  try {
    await build;
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
};

/**
 * T6 for E12: a 40-step drag through distinct values. After the first twenty steps, collection leaves exactly as many
 * live handles and the same WebAssembly heap as at the end: nothing accumulates per edit.
 * @param options - The kernel options.
 * @returns The live tier's bytes per build and how many entries it evicted.
 */
export const expectFlatDrag = async (options: Options): Promise<{ tierBytes: number[]; evicted: number }> => {
  const opened = session(bracket, options);
  try {
    await opened.build({ size: 10 });
    const ledger = ledgerOf();
    await collect(ledger);
    const before = ledger.snapshot();
    const handles: number[] = [];
    const heaps: number[] = [];
    for (let step = 1; step <= 40; step += 1) {
      await opened.build({ size: 10 + step / 4 });
      await collect(ledger);
      handles.push(ledger.since(before).length);
      heaps.push(heapBytes());
    }

    // The mesh memo keeps a partner for 16 renders after its last use (decayRenders), so the live tier's arms
    // settle once that window has passed; reuse off builds no memo and settles sooner.
    const settled = handles.slice(19);
    expect(settled, JSON.stringify(summarizeLeaks(ledger.since(before)).slice(0, 10))).toStrictEqual(
      Array.from({ length: settled.length }, () => settled[0]),
    );
    expect(heaps.at(-1)).toBe(heaps[19]);
    expect(ledger.stats().doubleDeletes).toBe(0);
    return { tierBytes: opened.tierBytes, evicted: opened.evicted() };
  } finally {
    await opened.close();
  }
};
