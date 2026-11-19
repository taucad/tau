/**
 * Qualification arm (audit R5): one process = one arm of one model, driven through Tau's public runtime
 * client (in-process transport, real Replicad kernel, production middleware preset). No source patching:
 * everything measured comes from runtime telemetry, the rendered GLB and a counting wrapper around the
 * durable store, so a change to the kernel or the runtime cannot silently break the harness.
 *
 * Usage (repository root):
 *   node --import @oxc-node/core/register apps/runtime-e2e/src/compute-baseline/harness/qualify-arm.mts \
 *     --model turbofan --arm off --scenario matrix --out out/reports/compute-qualify/x.json
 *
 * --arm       off      compute binding `off` and the Replicad adapter off: the byte-parity reference (I1)
 *             memory   the library default: compute `memory`, kernel defaults
 *             durable  compute `durable` over a node:sqlite store (`--store <dir>`, fresh unless --keepStore)
 * --scenario  matrix   live document, one step per token (`--steps`, default base,A,base,B,base,comment,literal,original)
 *             scrub    live document; the scrub ladder sent back to back as transient frames, the last value
 *                      committed, then a revisit of base
 *             agent    fresh lifecycle: nine tool calls (open, act, close) on one unchanged build
 *             history  `--histories N` cache histories in sequence, each a new client: a random prefix of
 *                      steps (seeded by `--seed`), then every target of `--targets` in random order
 * --content   ui (edges + topology, the editor's default) | bare | edges, for matrix, scrub and history
 * --wasm      single (default; deterministic) | multi | auto
 *
 * Counts (model runs, tessellations, store writes) are deterministic and are what CI asserts; wall times
 * are recorded as data only.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { cpus, loadavg } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { parseArgs } from 'node:util';
import { asKnownArtifact, createRuntimeClient } from '@taucad/runtime/client';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { fromNodeFs } from '@taucad/runtime/filesystem/node';
import { createSqliteComputeEngine, fromSqlite } from '@taucad/runtime/node';
import { nodeWorkerTransport } from '@taucad/runtime/transport/node';
import { qualifyPhaseChannel, qualifyRuntime } from './qualify-runtime.mts';
import {
  fullMatrixSteps,
  geometryKey,
  qualifyModelOf,
  readModelFiles,
  resolveStep,
  sourceState,
  stepTokens,
  type StepToken,
} from './qualify-corpus.mts';

const { values } = parseArgs({
  options: {
    model: { type: 'string' },
    arm: { type: 'string', default: 'off' },
    scenario: { type: 'string', default: 'matrix' },
    steps: { type: 'string', default: fullMatrixSteps.join(',') },
    targets: { type: 'string', default: 'base,A,B' },
    histories: { type: 'string', default: '10' },
    seed: { type: 'string', default: '1' },
    content: { type: 'string', default: 'ui' },
    wasm: { type: 'string', default: 'single' },
    store: { type: 'string' },
    keepStore: { type: 'boolean', default: false },
    out: { type: 'string' },
    label: { type: 'string', default: '' },
    /** in-process (default) | worker: a real worker thread; the abort scenario always uses it. */
    transport: { type: 'string', default: 'in-process' },
    /** abort: supersede this many ms after the superseded build's main() starts (default: at once). */
    abortAfter: { type: 'string' },
    /** abort: how many supersede trials to measure. */
    trials: { type: 'string', default: '2' },
  },
});

const model = qualifyModelOf(values.model ?? '');
if (!model)
  throw new Error(`unknown model ${values.model}; known: ${Object.keys(qualifyModels).join(', ')}, or a fixture`);
const arm = values.arm as 'off' | 'memory' | 'durable';
if (!['off', 'memory', 'durable'].includes(arm)) throw new Error(`unknown arm ${arm}`);
const scenario = values.scenario as 'matrix' | 'scrub' | 'agent' | 'history' | 'abort';
if (!['matrix', 'scrub', 'agent', 'history', 'abort'].includes(scenario))
  throw new Error(`unknown scenario ${scenario}`);
const transport = scenario === 'abort' ? 'worker' : (values.transport as 'in-process' | 'worker');
if (transport === 'worker' && arm === 'durable')
  throw new Error('the worker transport runs the off and memory arms only');
const parseTokens = (text: string): StepToken[] =>
  text.split(',').map((token) => {
    if (!(stepTokens as readonly string[]).includes(token))
      throw new Error(`unknown step ${token}; known: ${stepTokens.join(', ')}`);
    return token as StepToken;
  });

type ContentToken = 'ui' | 'bare' | 'edges';
const contentFor = (token: ContentToken) =>
  token === 'ui'
    ? { includeEdges: true, includeTopology: true }
    : token === 'edges'
      ? { includeEdges: true }
      : undefined;

const sha256 = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');

/** GLB summary: whole-file hash (the I1 byte-parity identity) plus mesh and triangle counts for diagnosis. */
const glbStats = (bytes: Uint8Array) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)));
  const triangles = (json.meshes ?? [])
    .flatMap((mesh: any) => mesh.primitives ?? [])
    .filter((primitive: any) => (primitive.mode ?? 4) === 4)
    .reduce(
      (total: number, primitive: any) =>
        total + (primitive.indices === undefined ? 0 : json.accessors[primitive.indices].count / 3),
      0,
    );
  return {
    bytes: bytes.byteLength,
    sha256: sha256(bytes),
    meshes: json.meshes?.length ?? 0,
    nodes: json.nodes?.length ?? 0,
    triangles,
  };
};

// ---- durable store, counted (store writes are a deterministic count CI asserts) ----
type Counter = { calls: number; entries: number; bytes: number };
let storeCounts: Record<string, Counter> = {};
const countStore = (key: string, entries = 0, bytes = 0) => {
  const counter = (storeCounts[key] ??= { calls: 0, entries: 0, bytes: 0 });
  counter.calls += 1;
  counter.entries += entries;
  counter.bytes += bytes;
};
const entryBytes = (entries: ReadonlyArray<{ bytes?: Uint8Array }>) =>
  entries.reduce((total, entry) => total + (entry.bytes?.byteLength ?? 0), 0);
const scratch = resolve(
  values.store ?? join(tmpdir(), `compute-qualify-${model.name}-${arm}-${scenario}-${process.pid}`),
);
if (!values.keepStore) rmSync(scratch, { recursive: true, force: true });
const projectRoot = join(scratch, 'project');
mkdirSync(projectRoot, { recursive: true });
const sqlite = arm === 'durable' ? createSqliteComputeEngine({ directory: join(scratch, 'compute') }) : undefined;
const countedSqlite = sqlite && {
  ...sqlite,
  engine: {
    open: async (input: any) => {
      const session = await sqlite.engine.open(input);
      return new Proxy(session, {
        get(target, property) {
          const value = Reflect.get(target, property);
          if (property === 'put')
            return async (request: any) => {
              const result = await target.put(request);
              countStore(`put.${result.status}`, request.entries.length, entryBytes(request.entries));
              return result;
            };
          if (property === 'get')
            return async (request: any) => {
              const result = await target.get(request);
              countStore(
                request.discovery ? 'get.discovery' : 'get.exact',
                result.status === 'ok' ? result.entries.length : 0,
                result.status === 'ok' ? entryBytes(result.entries) : 0,
              );
              return result;
            };
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    },
  },
};

const original = readModelFiles(model);
const writeTree = (tree: Record<string, string>) => {
  for (const [path, text] of Object.entries(tree)) {
    mkdirSync(dirname(join(projectRoot, path)), { recursive: true });
    writeFileSync(join(projectRoot, path), text);
  }
};
writeTree(original);

/**
 * Telemetry spans that define the deterministic counts:
 * - modelRuns: `replicad.run-main`, one per execution of the model's `main`
 * - tessellations: `replicad.render-output`, one per mesh build of a scene (a render or GLB export that
 *   did not come from the stored mesh)
 */
const countSpans = (telemetry: any[]) => {
  const spans: Record<string, { count: number; ms: number }> = {};
  for (const entry of telemetry) {
    const span = (spans[entry.name] ??= { count: 0, ms: 0 });
    span.count += 1;
    span.ms += entry.duration ?? 0;
  }
  for (const span of Object.values(spans)) span.ms = +span.ms.toFixed(1);
  return spans;
};
const publications = (telemetry: any[]) => {
  const byStatus: Record<string, number> = {};
  for (const entry of telemetry) {
    if (entry.name !== 'kernel.compute.publication') continue;
    const detail = entry.detail ?? entry.attributes ?? {};
    const key = detail.reason === undefined ? String(detail.status) : `${detail.status}:${detail.reason}`;
    byStatus[key] = (byStatus[key] ?? 0) + 1;
  }
  return byStatus;
};
/** storeWrites: compute publications that settled `stored` (a write of the build or mesh to the compute store). */
const countsOf = (spans: Record<string, { count: number }>, published: Record<string, number>) => ({
  modelRuns: spans['replicad.run-main']?.count ?? 0,
  tessellations: spans['replicad.render-output']?.count ?? 0,
  storeWrites: published['stored'] ?? 0,
});

process.env['TAU_QUALIFY_ARM'] = arm;
process.env['TAU_QUALIFY_WASM'] = values.wasm;
const runtime =
  transport === 'in-process'
    ? await qualifyRuntime({ arm, wasm: values.wasm as 'single' | 'multi' | 'auto' })
    : undefined;

/** A fresh client over the scratch project. Hides `fs.watch` so a source rewrite cannot supersede a timed render. */
const openClient = () => {
  const base: any = fromNodeFs(projectRoot);
  const [handleKey] = Object.getOwnPropertySymbols(base);
  const handle = base[handleKey!];
  if (handle?.kind !== 'inline') throw new Error(`expected an inline filesystem handle, got ${handle?.kind}`);
  const stripWatch = (source: any): any =>
    Object.fromEntries(
      Reflect.ownKeys(source)
        .filter((key) => key !== 'watch' && key !== 'watchReady')
        .map((key) => [key, typeof source[key] === 'function' ? source[key].bind(source) : source[key]]) as any,
    );
  const fileSystem: any = { [handleKey!]: { kind: 'inline', create: () => stripWatch(handle.create()) } };
  const compute: any =
    arm === 'durable'
      ? { mode: 'durable', store: fromSqlite({ store: countedSqlite as any, workspace: projectRoot }) }
      : arm === 'memory'
        ? { mode: 'memory' }
        : { mode: 'off' };
  const client = createRuntimeClient({
    transport:
      transport === 'worker'
        ? // Worker threads cannot take an inline filesystem; documents open with `watch: false` instead.
          nodeWorkerTransport({
            url: new URL('./qualify-worker.mts', import.meta.url),
            fileSystem: base,
            compute,
            // The abort scenario places its supersedes on the phase ends the worker reports from the span mirror.
            ...(scenario === 'abort' ? { devtoolsTelemetry: true } : {}),
          })
        : inProcessTransport({ runtime: runtime!, fileSystem, compute }),
  });
  const state = { telemetry: [] as any[], logs: [] as string[] };
  client.on('telemetry', (batch: { entries: any[] }) => state.telemetry.push(...batch.entries));
  client.on('log', (entry: any) => {
    if (entry.level === 'warn' || entry.level === 'error')
      state.logs.push(`${entry.level}: ${String(entry.message).slice(0, 300)}`);
  });
  return { client, state };
};

const renderView = async (view: any) => {
  const outcome = await view.rendering();
  if (outcome.superseded) throw new Error('render superseded');
  if (!outcome.rendering.success)
    throw new Error(`render failed: ${JSON.stringify(outcome.rendering.issues).slice(0, 1500)}`);
  const artifact = asKnownArtifact(outcome.rendering.artifact);
  if (artifact?.mimeType !== 'model/gltf-binary') throw new Error(`expected a GLB, got ${artifact?.mimeType}`);
  return glbStats(artifact.content as Uint8Array);
};

const report: any = {
  model: model.name,
  arm,
  scenario,
  label: values.label,
  content: values.content,
  wasm: values.wasm,
  transport,
  node: process.version,
  cpu: cpus()[0]?.model,
  cpus: cpus().length,
  steps: [] as any[],
};
const writeReport = () => {
  if (!values.out) return;
  mkdirSync(dirname(resolve(values.out)), { recursive: true });
  writeFileSync(resolve(values.out), JSON.stringify(report, null, 1));
};

/** Measure one step: reset counters, run `act`, record wall, spans, counts and output. */
const measure = async (
  state: { telemetry: any[]; logs: string[] },
  fields: Record<string, unknown>,
  act: () => Promise<unknown>,
) => {
  state.telemetry.length = 0;
  state.logs.length = 0;
  storeCounts = {};
  const load = loadavg()[0];
  const start = performance.now();
  const output = await act();
  const wallMs = +(performance.now() - start).toFixed(1);
  // Publications settle after the result: wait until telemetry is quiet for 300 ms (at most 10 s) so a store write
  // is attributed to the step that caused it, however slow the machine. Not part of the step's wall time.
  for (let quiet = 0, seen = -1, waited = 0; quiet < 300 && waited < 10_000; waited += 25) {
    await new Promise((settle) => setTimeout(settle, 25));
    quiet = state.telemetry.length === seen ? quiet + 25 : 0;
    seen = state.telemetry.length;
  }
  const spans = countSpans(state.telemetry);
  const published = publications(state.telemetry);
  const step = {
    index: report.steps.length,
    ...fields,
    wallMs,
    load,
    counts: countsOf(spans, published),
    output,
    publications: published,
    spans,
    store: storeCounts,
    logs: [...state.logs],
  };
  report.steps.push(step);
  writeReport();
  console.error(
    `[qualify] ${model.name} ${arm}/${scenario} ${JSON.stringify(fields)}: ${wallMs.toFixed(0)} ms ${JSON.stringify(step.counts)} ${(output as any)?.sha256?.slice(0, 12) ?? ''}`,
  );
  return step;
};

/** Live document driver shared by the matrix, scrub and history scenarios. */
const liveSession = (client: any, content: ContentToken) => {
  let document: any;
  let view: any;
  let source: 'original' | 'comment' | 'literal' = 'original';
  return {
    async step(token: StepToken) {
      const next = resolveStep(model, token);
      if (!document) {
        if (next.source !== source) throw new Error('the first step must render the original sources');
        document = client.open({ source: { path: model.mainFile }, parameters: next.parameters, watch: false });
      } else if (next.source !== source) {
        const files = sourceState(model, original, next.source);
        const current = sourceState(model, original, source);
        const stage = Object.fromEntries(Object.entries(files).filter(([path, text]) => current[path] !== text));
        writeTree(files);
        source = next.source;
        const outcome = await document.update({ stage, parameters: next.parameters });
        if (outcome?.superseded) throw new Error('update superseded');
      } else {
        const outcome = await document.update({ parameters: next.parameters });
        if (outcome?.superseded) throw new Error('update superseded');
      }
      view ??= document.view('model', contentFor(content) ? { content: contentFor(content) } : {});
      return renderView(view);
    },
    document: () => document,
    view: () => view,
    close() {
      view?.close();
      document?.close();
      if (source !== 'original') writeTree(original);
    },
  };
};

/** Small deterministic PRNG (mulberry32) so a history is reproducible from its seed. */
const prng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const run = async () => {
  const content = values.content as ContentToken;
  if (scenario === 'matrix') {
    const { client, state } = openClient();
    await client.connect();
    const session = liveSession(client, content);
    try {
      for (const token of parseTokens(values.steps!))
        await measure(state, { token, geometry: geometryKey(token) }, () => session.step(token));
    } finally {
      session.close();
      await client.shutdown({ drain: true });
    }
    return;
  }
  if (scenario === 'scrub') {
    const { client, state } = openClient();
    await client.connect();
    const session = liveSession(client, content);
    try {
      await measure(state, { token: 'base', phase: 'open' }, () => session.step('base'));
      const last = model.scrub.values.at(-1);
      // Back to back: every frame but the last is a transient update that nobody awaits, as a slider drag sends them.
      await measure(
        state,
        { token: `scrub:${model.scrub.key}`, phase: 'scrub', frames: model.scrub.values.length, final: last },
        async () => {
          const document = session.document();
          const pending = model.scrub.values
            .slice(0, -1)
            .map((value) =>
              document.update({ parameters: { ...model.params.base, [model.scrub.key]: value }, transient: true }),
            );
          const committed = document.update({ parameters: { ...model.params.base, [model.scrub.key]: last } });
          const outcomes = await Promise.allSettled([...pending, committed]);
          const final = outcomes.at(-1)!;
          if (final.status === 'rejected' || (final.value as any)?.superseded)
            throw new Error('committed scrub frame superseded');
          return {
            ...(await renderView(session.view())),
            superseded: outcomes.filter(
              (outcome) => outcome.status === 'fulfilled' && (outcome.value as any)?.superseded,
            ).length,
          };
        },
      );
      await measure(state, { token: 'base', phase: 'revisit' }, () => session.step('base'));
      // One rested transient frame (awaited and rendered, as a paused drag leaves it): R4 says it publishes nothing.
      const rested = model.scrub.values[0];
      await measure(
        state,
        { token: `transient:${model.scrub.key}`, phase: 'rested-transient', final: rested },
        async () => {
          const outcome = await session
            .document()
            .update({ parameters: { ...model.params.base, [model.scrub.key]: rested }, transient: true });
          if (outcome?.superseded) throw new Error('rested transient frame superseded');
          return renderView(session.view());
        },
      );
    } finally {
      session.close();
      await client.shutdown({ drain: true });
    }
    return;
  }
  if (scenario === 'agent') {
    const { client, state } = openClient();
    await client.connect();
    // Nine tool calls on one unchanged build, each opening and closing its own document (the agent's fresh
    // lifecycle): three view contents, and two evaluate-only calls (a parameter or interface inspection).
    const calls: Array<{ action: 'render' | 'eval'; content?: ContentToken }> = [
      { action: 'render', content: 'ui' },
      { action: 'render', content: 'bare' },
      { action: 'eval' },
      { action: 'render', content: 'ui' },
      { action: 'render', content: 'edges' },
      { action: 'render', content: 'bare' },
      { action: 'eval' },
      { action: 'render', content: 'edges' },
      { action: 'render', content: 'ui' },
    ];
    try {
      for (const [index, call] of calls.entries())
        await measure(
          state,
          { token: 'base', call: index + 1, action: call.action, content: call.content },
          async () => {
            const document = client.open({
              source: { path: model.mainFile },
              parameters: model.params.base,
              watch: false,
            });
            try {
              if (call.action === 'eval') {
                const outcome = await document.evaluation();
                if (outcome.superseded) throw new Error('evaluation superseded');
                return { evaluated: true };
              }
              const view = document.view(
                'model',
                contentFor(call.content!) ? { content: contentFor(call.content!) } : {},
              );
              try {
                return await renderView(view);
              } finally {
                view.close();
              }
            } finally {
              document.close();
            }
          },
        );
    } finally {
      await client.shutdown({ drain: true });
    }
    return;
  }
  if (scenario === 'abort') {
    // Stop latency (audit R9/F17, S1, P9c): supersede the edit in flight with the next one and measure how long the
    // superseded work keeps running and when the committed edit's build starts. Odd trials supersede the build's
    // main(), which polls the shared abort word at every OCCT call; even trials supersede the render while it packs
    // the GLB, which makes no OCCT call and polls between parts. The worker reports the end of the phase before each
    // one (`qualify-worker.mts`), so where a supersede lands does not depend on this machine's speed.
    const phaseEnds = new BroadcastChannel(qualifyPhaseChannel);
    const waiters: Array<{ span: string; settle: () => void }> = [];
    const ready = Promise.withResolvers<void>();
    let released: unknown;
    phaseEnds.onmessage = ({ data }: MessageEvent<{ span?: string; ready?: boolean; released?: unknown }>) => {
      if (data.ready) ready.resolve();
      if (data.released) released = data.released;
      const index = waiters.findIndex((waiter) => waiter.span === data.span);
      if (index >= 0) waiters.splice(index, 1)[0]!.settle();
    };
    // The worker holds at the targeted span's end until the supersede is issued (`qualify-worker.mts`), so the
    // supersede lands as that phase starts: before main()'s first OCCT call, and before the GLB pack's first poll even
    // for a one-part model.
    const gate = new Int32Array(new SharedArrayBuffer(8));
    const gateCodes = { main: 1, pack: 2 } as const;
    const release = () => {
      Atomics.store(gate, 0, 0);
      Atomics.store(gate, 1, 1);
      Atomics.notify(gate, 1);
    };
    const phaseEnd = (span: string) => new Promise<void>((settle) => waiters.push({ span, settle }));
    // The client can stop only an operation whose progress notice (its abort sequence and generation) it has already
    // read. That notice and the phase end travel on different channels, so the supersede waits for both: the progress
    // event of the targeted operation, then a turn of the event loop so every listener of that notice has run.
    const progressPhase = (document: any, phase: 'evaluate' | 'render') =>
      new Promise<void>((settle) => {
        const off = document.on('progress', (event: { phase: string; detail?: Record<string, unknown> }) => {
          const key = phase === 'evaluate' ? 'abortGeneration' : 'abortSequence';
          if (event.phase === phase && typeof event.detail?.[key] === 'number') {
            off();
            settle();
          }
        });
      });
    /** Fail with what was awaited instead of hanging until the test's `beforeAll` gives up. */
    const within = async (promise: Promise<unknown>, what: string) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          promise,
          new Promise((_, reject) => {
            timer = setTimeout(
              () => reject(new Error(`abort scenario on ${model.name}: no ${what} within 120 s`)),
              120_000,
            );
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    };
    const { client, state } = openClient();
    await client.connect();
    const session = liveSession(client, content);
    try {
      await measure(state, { token: 'base', phase: 'open' }, () => session.step('base'));
      phaseEnds.postMessage({ gate: gate.buffer });
      await within(ready.promise, 'gate handshake with the worker');
      // Every build below uses a parameter value not seen before (the scrub ladder), so each is a real rebuild in
      // every arm. The first is a warm edit.
      const key = model.scrub.key;
      const ladder = model.scrub.values;
      const frame = (value: unknown) => ({ ...model.params.base, [key]: value });
      const warm = await measure(state, { token: `${key}=${String(ladder[0])}`, phase: 'warm-edit' }, async () => {
        const outcome = await session.document().update({ parameters: frame(ladder[0]) });
        if (outcome?.superseded) throw new Error('warm edit superseded');
        return renderView(session.view());
      });
      const warmMain = warm.spans['replicad.run-main']?.ms ?? 0;
      const delay = values.abortAfter === undefined ? 0 : Number(values.abortAfter);
      const trials = Math.min(Number(values.trials), Math.floor((ladder.length - 1) / 2));
      for (let trial = 1; trial <= trials; trial += 1) {
        const first = ladder[2 * trial - 1];
        const second = ladder[2 * trial];
        const target = trial % 2 === 1 ? 'main' : 'pack';
        let issued = 0;
        let firstOutcome: unknown;
        const step = await measure(
          state,
          { token: `${key}=${String(second)}`, phase: 'supersede', trial, superseded: first, target, delayMs: delay },
          async () => {
            const document = session.document();
            // `kernel.execute` ends as main() starts; `replicad.render-output` ends as the GLB pack starts.
            const span = target === 'main' ? 'kernel.execute' : 'replicad.render-output';
            const operation = target === 'main' ? 'evaluate' : 'render';
            const landed = Promise.all([phaseEnd(span), progressPhase(document, operation)]);
            Atomics.store(gate, 1, 0);
            Atomics.store(gate, 0, gateCodes[target]);
            released = undefined;
            let committed: Promise<unknown> = Promise.resolve();
            const pending = document.update({ parameters: frame(first) });
            try {
              await within(
                landed,
                `${operation} progress and ${span} end for trial ${trial} (${target}) at ${key}=${String(first)}`,
              );
              await new Promise((settle) => setImmediate(settle));
              if (delay > 0) await new Promise((settle) => setTimeout(settle, delay));
              issued = performance.timeOrigin + performance.now();
              committed = document.update({ parameters: frame(second) });
              // The document handle reaches the session's update, which signals the abort word, a few microtasks
              // later: release the worker only after they ran, so it resumes into a stopped operation.
              await new Promise((settle) => setImmediate(settle));
            } finally {
              release();
            }
            const [one, two] = await Promise.allSettled([pending, committed]);
            firstOutcome =
              one.status === 'fulfilled'
                ? { superseded: Boolean((one.value as any)?.superseded) }
                : { rejected: String(one.reason).slice(0, 200) };
            if (two.status === 'rejected' || (two.value as any)?.superseded)
              throw new Error('committed edit superseded');
            return renderView(session.view());
          },
        );
        const startOf = (entry: any) => entry.workerTimeOrigin + entry.startTime;
        const endOf = (entry: any) => startOf(entry) + entry.duration;
        const byStart = (name: string) =>
          state.telemetry.filter((entry) => entry.name === name).sort((a, b) => startOf(a) - startOf(b));
        // The superseded evaluation is the first of the step; the committed edit's is the second. Their runs of
        // main() and the superseded render are the spans inside each.
        const [superseded, committed] = byStart('kernel.evaluate');
        const mains = byStart('replicad.run-main');
        const stopped = mains.find(
          (entry) => superseded && startOf(entry) >= startOf(superseded) && endOf(entry) <= endOf(superseded),
        );
        const next = mains.find((entry) => committed && startOf(entry) >= startOf(committed));
        const render = byStart('kernel.render').find((entry) => startOf(entry) < issued && endOf(entry) > issued);
        const renderAtIssue = Boolean(render);
        (step as any).abort = {
          target,
          // A main() trial is valid when the superseded main() was still running at the supersede; a pack trial when
          // the superseded render was.
          valid:
            target === 'main'
              ? Boolean(
                  superseded?.detail?.['operation.outcome'] === 'cancelled' &&
                  endOf(superseded) > issued &&
                  (firstOutcome as any)?.superseded,
                )
              : renderAtIssue,
          firstOutcome,
          supersededMainMs: stopped ? +stopped.duration.toFixed(1) : undefined,
          // How long the superseded main() kept running after the supersede (0 when it stopped before starting).
          stopAfterIssueMs:
            target === 'main' ? (stopped ? +Math.max(0, endOf(stopped) - issued).toFixed(1) : 0) : undefined,
          // The superseded render's outcome: `cancelled` when packing stopped at the supersede.
          supersededRender: render?.detail?.['operation.outcome'],
          renderAfterIssueMs: render ? +(endOf(render) - issued).toFixed(1) : undefined,
          // How the worker left the gate: `ok` once the arm released it, `timed-out` if it never did.
          released,
          packParts: render
            ? byStart('replicad.mesh-to-gltf').find(
                (entry) => startOf(entry) >= startOf(render) && startOf(entry) <= endOf(render),
              )?.detail?.shapeCount
            : undefined,
          // From the supersede to the committed edit's `main()`: the stop, its unwinding and the next build's setup.
          nextBuildAfterIssue: next ? +(startOf(next) - issued).toFixed(1) : undefined,
          supersededMainStatus: stopped?.detail?.status ?? stopped?.detail?.error,
          warmMainMs: warmMain,
          mainSpans: mains.length,
        };
        writeReport();
        console.error(`[qualify] abort trial ${trial}: ${JSON.stringify((step as any).abort)}`);
      }
    } finally {
      release();
      session.close();
      phaseEnds.close();
      await client.shutdown({ drain: true });
    }
    return;
  }
  // history
  const random = prng(Number(values.seed));
  const targets = parseTokens(values.targets!);
  const prefixTokens: StepToken[] = ['base', 'A', 'B', 'comment', 'literal'];
  for (let history = 1; history <= Number(values.histories); history += 1) {
    const prefixLength = 1 + Math.floor(random() * 5);
    const prefix = Array.from(
      { length: prefixLength },
      () => prefixTokens[Math.floor(random() * prefixTokens.length)]!,
    );
    const order = [...targets].sort(() => random() - 0.5);
    const { client, state } = openClient();
    await client.connect();
    const session = liveSession(client, content);
    try {
      // Every history opens on the original sources at base parameters, then wanders.
      for (const token of ['base' as StepToken, ...prefix])
        await measure(state, { history, phase: 'prefix', token, geometry: geometryKey(token) }, () =>
          session.step(token),
        );
      for (const token of order)
        await measure(state, { history, phase: 'target', token, geometry: geometryKey(token) }, () =>
          session.step(token),
        );
    } finally {
      session.close();
      await client.shutdown({ drain: true });
    }
  }
};

try {
  await run();
  report.complete = true;
} catch (error) {
  report.error = String((error as Error)?.stack ?? error);
  process.exitCode = 1;
  console.error(error);
} finally {
  writeReport();
  await sqlite?.dispose();
  if (!values.keepStore && !values.store) rmSync(scratch, { recursive: true, force: true });
}
