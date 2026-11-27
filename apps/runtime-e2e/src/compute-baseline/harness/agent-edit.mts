/**
 * Agent-lifecycle one-part edit against the editor's latency for the same edit (Replicad editing performance
 * program, P8 acceptance: the agent's edit at or below the live editor's latency plus 0.1 s).
 *
 * One process per model. Three arms, each on its own runtime client (so its own kernel and live tier, as the browser
 * agent host runs a second runtime beside the editor's) and its own scratch copy of the model:
 *
 *   editor  the live document: the edited source is written and staged with `document.update({ stage })`, and the
 *           open view renders it (the program's live lifecycle, the qualification matrix's `literal` step).
 *   agent   the agent's tool path: `edit_file` through the host's RPC handler over the composed agent view of the
 *           checkout, then `evaluate_model` through `createRuntimeAgentClients` (open, evaluate, render the default
 *           view, summarize, close: the program's fresh lifecycle). No model provider is involved.
 *   watch   the same `edit_file`, with the editor's document open watched on the checkout: the clock stops when the
 *           editor's open view renders the agent's edit (what a person sees while an agent edits).
 *
 * Each arm opens on the model's original source and renders it once (warm-up, untimed). Each pair then makes the
 * model's one-literal edit with a value no earlier pair used, so every timed edit is a real rebuild and never a
 * revisit, and reverts it untimed. Arm order rotates per pair. Wall clocks start before the file write and stop when
 * the GLB arrives (editor, watch) or when the tool call returns (agent; the GLB's arrival inside it is recorded too).
 *
 * Usage (repository root):
 *   node --import @oxc-node/core/register apps/runtime-e2e/src/compute-baseline/harness/agent-edit.mts \
 *     --model turbofan --pairs 5 --out out/reports/agent-edit/turbofan.json
 */
import { createHash } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { cpus, loadavg, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { ResourceQueue } from '@taucad/filesystem';
import { NodeFsProvider } from '@taucad/filesystem/backend/node';
import { composeView } from '@taucad/filesystem/composed-view';
import { tauPathPolicy } from '@taucad/filesystem/path-registry';
import { createProviderRpcFileSystem } from '@taucad/agent-tools/registry';
import { createRuntimeAgentClients } from '@taucad/agent-tools/runtime';
import { handleEditFile } from '@taucad/chat/rpc';
import { asKnownArtifact, createRuntimeClient } from '@taucad/runtime/client';
import { fromNodeFs } from '@taucad/runtime/filesystem/node';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { qualifyRuntime } from './qualify-runtime.mts';
import { qualifyModelOf, readModelFiles } from './qualify-corpus.mts';

const { values } = parseArgs({
  options: {
    model: { type: 'string' },
    pairs: { type: 'string', default: '5' },
    arms: { type: 'string', default: 'editor,agent,watch' },
    out: { type: 'string' },
  },
});

/**
 * The one-literal edit of each model, as a template over one number: pair `i` writes `value(i)`, so no two timed
 * edits build the same geometry. The text matched is the qualification corpus's literal edit.
 */
const editsByModel: Record<string, { from: string; to: (value: string) => string; value: (pair: number) => string }> = {
  // One part: the outlet guide vane row moves aft.
  turbofan: { from: '  const x = 470;', to: (v) => `  const x = ${v};`, value: (i) => String(471 + i) },
  // One part: the keyseat slot on the input shaft.
  'planetary-gear-system': {
    from: '  const keyseat = capsule(16, 5)',
    to: (v) => `  const keyseat = capsule(${v}, 5)`,
    value: (i) => String(16.5 + i * 0.5),
  },
  'bench-vise': {
    from: '  guideClearance: 0.1,',
    to: (v) => `  guideClearance: ${v},`,
    // The model accepts 0.05 to 0.25 mm.
    value: (i) => (0.11 + i * 0.01).toFixed(2),
  },
  'stress-test': {
    from: '  holeRadius: 3,',
    to: (v) => `  holeRadius: ${v},`,
    value: (i) => (3.1 + i * 0.1).toFixed(1),
  },
  'gridfinity-box': {
    from: '  wallThickness: 1.2,',
    to: (v) => `  wallThickness: ${v},`,
    value: (i) => (1.3 + i * 0.1).toFixed(1),
  },
};

const model = qualifyModelOf(values.model ?? '');
const edit = editsByModel[values.model ?? ''];
if (!model || !edit) throw new Error(`unknown model ${values.model}; known: ${Object.keys(editsByModel).join(', ')}`);
const pairs = Number(values.pairs);
const arms = values.arms!.split(',') as Array<'editor' | 'agent' | 'watch'>;
const mainPath = model.mainFile;
const original = readModelFiles(model);
if (original[model.mainFile]!.split(edit.from).length !== 2) throw new Error(`edit text does not match once`);

const scratch = join(tmpdir(), `agent-edit-${model.name}-${process.pid}`);
rmSync(scratch, { recursive: true, force: true });

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const now = () => performance.now();
const round = (value: number) => +value.toFixed(1);

/** The phases a step's telemetry attributes time to (span totals, ms). */
const phaseSpans = {
  bundle: ['kernel.bundle', 'kernel.resolve-deps'],
  detect: ['kernel.detect-import'],
  params: ['kernel.extract-params'],
  build: ['replicad.run-main'],
  evaluate: ['kernel.evaluate'],
  tessellate: ['replicad.render-output'],
  pack: ['mesh.packGltf'],
  render: ['kernel.render'],
} as const;

type Arm = {
  readonly name: 'editor' | 'agent' | 'watch';
  readonly root: string;
  readonly telemetry: any[];
  readonly client: any;
  /** Make the edit to `text` and wait for its result; returns the arm's own phase marks. */
  edit(text: string, timed: boolean): Promise<Record<string, unknown>>;
  close(): Promise<void>;
};

const runtime = await qualifyRuntime({ arm: 'memory', wasm: 'single' });

const createClient = (root: string, watch: boolean) => {
  const base: any = fromNodeFs(root);
  let fileSystem = base;
  if (!watch) {
    // As in qualify-arm: hide fs.watch so a write cannot supersede a timed render on an unwatched arm.
    const [handleKey] = Object.getOwnPropertySymbols(base);
    const handle = base[handleKey!];
    const strip = (source: any): any =>
      Object.fromEntries(
        Reflect.ownKeys(source)
          .filter((key) => key !== 'watch' && key !== 'watchReady')
          .map((key) => [key, typeof source[key] === 'function' ? source[key].bind(source) : source[key]]) as any,
      );
    fileSystem = { [handleKey!]: { kind: 'inline', create: () => strip(handle.create()) } };
  }
  const client = createRuntimeClient({
    transport: inProcessTransport({ runtime, fileSystem, compute: { mode: 'memory' } as any }),
  });
  const telemetry: any[] = [];
  client.on('telemetry', (batch: { entries: any[] }) => telemetry.push(...batch.entries));
  return { client, telemetry };
};

const writeTree = (root: string, tree: Record<string, string>) => {
  for (const [path, text] of Object.entries(tree)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
};

const glbOf = (rendering: any) => {
  if (!rendering.success) throw new Error(`render failed: ${JSON.stringify(rendering.issues).slice(0, 800)}`);
  const artifact = asKnownArtifact(rendering.artifact);
  if (artifact?.mimeType !== 'model/gltf-binary') throw new Error(`expected a GLB, got ${artifact?.mimeType}`);
  const bytes = artifact.content as Uint8Array;
  return { glbBytes: bytes.byteLength, glb: sha256(bytes).slice(0, 16) };
};

/** The host's `edit_file` over a composed agent view of the checkout (`packages/host/src/agent-tools.ts`). */
const agentFileTools = (root: string) => {
  const view = composeView(
    { filesystem: new NodeFsProvider(root, { policy: tauPathPolicy }) },
    { consumer: 'agent', policy: tauPathPolicy },
  );
  const fileSystem = createProviderRpcFileSystem({ provider: view, mutations: new ResourceQueue() });
  let current = original[model.mainFile]!;
  return async (text: string) => {
    const result: any = await handleEditFile(
      { targetFile: mainPath, oldString: current, newString: text } as any,
      fileSystem,
    );
    if (!result.success) throw new Error(`edit_file failed: ${JSON.stringify(result).slice(0, 500)}`);
    current = text;
  };
};

const editorArm = async (): Promise<Arm> => {
  const root = join(scratch, 'editor');
  writeTree(root, original);
  const { client, telemetry } = createClient(root, false);
  await client.connect();
  const document = client.open({ source: { path: model.mainFile }, parameters: {}, watch: false });
  const view = document.view('model', { content: { includeEdges: true, includeTopology: true } });
  const first = await view.rendering();
  glbOf(first.rendering);
  return {
    name: 'editor',
    root,
    telemetry,
    client,
    async edit(text) {
      const t0 = now();
      writeFileSync(join(root, model.mainFile), text);
      const t1 = now();
      const outcome = await document.update({ stage: { [model.mainFile]: text }, parameters: {} });
      if (outcome?.superseded) throw new Error('update superseded');
      const t2 = now();
      const projected = await view.rendering();
      if (projected.superseded) throw new Error('render superseded');
      const t3 = now();
      return {
        writeMs: round(t1 - t0),
        updateMs: round(t2 - t1),
        renderingMs: round(t3 - t2),
        ...glbOf(projected.rendering),
      };
    },
    async close() {
      view.close();
      document.close();
      await client.shutdown({ drain: true });
    },
  };
};

const agentArm = async (): Promise<Arm> => {
  const root = join(scratch, 'agent');
  writeTree(root, original);
  const { client, telemetry } = createClient(root, false);
  await client.connect();
  let marks: Record<string, number> = {};
  let glb: Record<string, unknown> = {};
  // The agent clients take the runtime as is; the wrapper only timestamps the calls they make.
  const timed = {
    describe: client.describe.bind(client),
    get capabilities() {
      return client.capabilities;
    },
    open(input: any) {
      marks['open'] = now();
      const document = client.open(input);
      return {
        evaluation: async (options: any) => {
          const outcome = await document.evaluation(options);
          marks['evaluated'] = now();
          return outcome;
        },
        export: document.export.bind(document),
        close: () => {
          marks['close'] = now();
          document.close();
        },
        view: (...args: any[]) => {
          const view = (document.view as any)(...args);
          return {
            rendering: async (options: any) => {
              const projected = await view.rendering(options);
              marks['rendered'] = now();
              if (!projected.superseded) glb = glbOf(projected.rendering);
              return projected;
            },
            close: () => view.close(),
          };
        },
      };
    },
  };
  const { kernelClient } = createRuntimeAgentClients({
    runtime: timed as any,
    exportImage: async () => {
      throw new Error('not used');
    },
    mapRuntimeError: (error: unknown) => {
      throw error;
    },
  });
  const editFile = agentFileTools(root);
  const evaluate = async () => {
    const result: any = await kernelClient.evaluateModel({ targetFile: mainPath } as any, {} as any);
    if (!result.success || result.status !== 'ready')
      throw new Error(`evaluate_model failed: ${JSON.stringify(result).slice(0, 800)}`);
    return result;
  };
  await evaluate();
  return {
    name: 'agent',
    root,
    telemetry,
    client,
    async edit(text) {
      marks = {};
      glb = {};
      const t0 = now();
      await editFile(text);
      const t1 = now();
      const result = await evaluate();
      const t2 = now();
      return {
        editFileMs: round(t1 - t0),
        openToEvaluatedMs: round(marks['evaluated']! - marks['open']!),
        evaluatedToRenderedMs: round(marks['rendered']! - marks['evaluated']!),
        renderedToReturnMs: round(t2 - marks['rendered']!),
        glbArrivalMs: round(marks['rendered']! - t0),
        toolCallMs: round(t2 - t1),
        build: result.build,
        ...glb,
      };
    },
    async close() {
      await client.shutdown({ drain: true });
    },
  };
};

const watchArm = async (): Promise<Arm> => {
  const root = join(scratch, 'watch');
  writeTree(root, original);
  const { client, telemetry } = createClient(root, true);
  await client.connect();
  const document = client.open({ source: { path: model.mainFile }, parameters: {} });
  const view = document.view('model', { content: { includeEdges: true, includeTopology: true } });
  const first = await view.rendering();
  let last = glbOf(first.rendering).glb;
  const editFile = agentFileTools(root);
  return {
    name: 'watch',
    root,
    telemetry,
    client,
    async edit(text) {
      // The next rendering whose bytes differ from the one on screen is the edit's.
      const arrived = Promise.withResolvers<{ at: number; glb: Record<string, unknown> }>();
      const off = view.on('rendered', (rendering: any) => {
        if (!rendering.success) return arrived.reject(new Error(JSON.stringify(rendering.issues).slice(0, 800)));
        const stats = glbOf(rendering);
        if (stats.glb !== last) arrived.resolve({ at: now(), glb: stats });
      });
      const timeout = setTimeout(() => arrived.reject(new Error('watch: no rendering within 120 s')), 120_000);
      const t0 = now();
      await editFile(text);
      const t1 = now();
      const { at, glb } = await arrived.promise.finally(() => {
        clearTimeout(timeout);
        off();
      });
      last = glb['glb'] as string;
      // Watch and notify: from the write's return to the first span the edit's rebuild starts (same clock).
      const starts = telemetry.map((entry) => entry.startTime).filter((time) => typeof time === 'number');
      return {
        editFileMs: round(t1 - t0),
        writeToRenderedMs: round(at - t1),
        ...(starts.length === 0 ? {} : { notifyMs: round(Math.min(...starts) - t1) }),
        ...glb,
      };
    },
    async close() {
      view.close();
      document.close();
      await client.shutdown({ drain: true });
    },
  };
};

const factories = { editor: editorArm, agent: agentArm, watch: watchArm };
const built: Arm[] = [];
for (const name of arms) built.push(await factories[name]());

const phasesOf = (telemetry: any[]) => {
  const total = (names: readonly string[]) =>
    round(
      telemetry.filter((entry) => names.includes(entry.name)).reduce((sum, entry) => sum + (entry.duration ?? 0), 0),
    );
  return {
    ...Object.fromEntries(Object.entries(phaseSpans).map(([phase, names]) => [phase, total(names)])),
    modelRuns: telemetry.filter((entry) => entry.name === 'replicad.run-main').length,
    tessellations: telemetry.filter((entry) => entry.name === 'replicad.render-output').length,
    sceneHits: telemetry.filter((entry) => entry.name === 'replicad.scene-table-hit').length,
  };
};

const quiet = async (arm: Arm) => {
  for (let still = 0, seen = -1, waited = 0; still < 300 && waited < 10_000; waited += 25) {
    await new Promise((settle) => setTimeout(settle, 25));
    still = arm.telemetry.length === seen ? still + 25 : 0;
    seen = arm.telemetry.length;
  }
};

const report = {
  model: model.name,
  edit: edit.from,
  node: process.version,
  cpu: cpus()[0]?.model,
  cpus: cpus().length,
  arms,
  steps: [] as any[],
};
const writeReport = () => {
  if (!values.out) return;
  mkdirSync(dirname(resolve(values.out)), { recursive: true });
  writeFileSync(resolve(values.out), JSON.stringify(report, null, 1));
};

const originalMain = original[model.mainFile]!;
try {
  for (let pair = 0; pair < pairs; pair += 1) {
    const value = edit.value(pair);
    const edited = originalMain.replace(edit.from, edit.to(value));
    const order = built.map((_, index) => built[(index + pair) % built.length]!);
    for (const arm of order) {
      await quiet(arm);
      arm.telemetry.length = 0;
      const load = loadavg()[0];
      const start = now();
      const marks = await arm.edit(edited, true);
      const wallMs = round(now() - start);
      await quiet(arm);
      const step = { pair, arm: arm.name, value, wallMs, load, ...marks, phases: phasesOf(arm.telemetry) };
      report.steps.push(step);
      writeReport();
      console.error(
        `[agent-edit] ${model.name} pair ${pair} ${arm.name}: ${wallMs.toFixed(0)} ms ${JSON.stringify(step.phases)}`,
      );
      // Revert, untimed: the next pair's edit starts from the original source, as this one did.
      await arm.edit(originalMain, false);
      await quiet(arm);
    }
  }
} finally {
  for (const arm of built) await arm.close();
  rmSync(scratch, { recursive: true, force: true });
}
