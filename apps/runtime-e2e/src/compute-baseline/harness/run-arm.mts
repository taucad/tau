/**
 * Lane B arm runner (one process = one arm; several render steps).
 * Usage (from repo root):
 *   node --import @oxc-node/core/register --import ./spikes/compute-reuse/lane-b/hooks.mjs \
 *     spikes/compute-reuse/lane-b/run-arm.mts --model drone --arm durable --store /tmp/x --steps cold,warm,late --out out.json
 * Arms: bypass (semantic adapter + session stubbed; durable store idle), memory (full adapter over fromMemoryFs),
 * durable (full adapter over fromNodeFs store), poison (memory wiring with every lookup answered by a deliberately
 * WRONG cached BRep -- the W0 fault-injection arm; see `--poisonBrep`).
 * Steps: cold|warm (base params), late, early, unrelated (source edit, base params), plus `late2` (late params again).
 */
import { probe } from './probe.mts';
import { mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { loadavg, cpus } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { createHash } from 'node:crypto';
import { models } from './models.mts';
import { repoRoot } from './repo-root.mts';
import { rejectSupersededTimingResult } from './retry-policy.mjs';
import { createRuntimeClient } from '../../../../../packages/runtime/src/client/index.ts';
import { inProcessTransport } from '../../../../../packages/runtime/src/transport/in-process.ts';
import { fromNodeFs } from '../../../../../packages/runtime/src/filesystem/from-node-fs.ts';
import { fromMemoryFs } from '../../../../../packages/runtime/src/filesystem/index.ts';
import { defineRuntime } from '../../../../../packages/runtime/src/worker/index.ts';

const { values } = parseArgs({
  options: {
    model: { type: 'string' },
    arm: { type: 'string', default: 'durable' },
    store: { type: 'string' },
    steps: { type: 'string', default: 'cold' },
    out: { type: 'string' },
    content: { type: 'string', default: 'bare' },
    // Production defaults (packages/plugins/replicad/src/replicad.schemas.ts): libraryTracing 'off', wasm 'auto'.
    libraryTracing: { type: 'string', default: 'off' },
    wasm: { type: 'string', default: 'auto' },
    label: { type: 'string', default: '' },
    trace: { type: 'string', default: 'off' },
    dumpGlb: { type: 'string' },
    brepDigest: { type: 'boolean', default: false },
    failOnRetry: { type: 'boolean', default: false },
    profileDistanceQuery: { type: 'boolean', default: false },
    // 'off' (default): hide `fs.watch` from the transport so the client's autonomous watched-filesystem rerender
    // (runtime-client-core.ts:265) cannot supersede a benchmark render after the `unrelated` source edit; the runtime
    // then uses its watcherless freshness path (in-process.ts:299), which every arm pays equally.
    watch: { type: 'string', default: 'off' },
    /** Write the first BRep the session records to this file (feeds `--poisonBrep`). */
    captureBrep: { type: 'string' },
    /** Answer every session lookup with these BRep bytes: a deliberately wrong cache (arm `poison`). */
    poisonBrep: { type: 'string' },
  },
});
/** `--trace shapes`: identity trace + per-result codec measurements (faces/edges, text BRep serialize/restore, clone) on every shape result. */
const shapeKinds = new Set(['Solid', 'Compound', 'Shell', 'Face', 'Edge', 'Wire', 'CompSolid', 'Vertex']);
const measureShape = (value: any, entry: any, library: Record<string, any>): void => {
  if (
    !value ||
    typeof value !== 'object' ||
    !shapeKinds.has(value.constructor?.name) ||
    typeof value.serialize !== 'function'
  )
    return;
  try {
    const t0 = performance.now();
    const faces = value.faces.length;
    const edges = value.edges.length;
    const listMs = performance.now() - t0;
    const t1 = performance.now();
    const text: string = value.serialize();
    const serializeMs = performance.now() - t1;
    const t2 = performance.now();
    const restored = library.deserializeShape(text);
    const restoreMs = performance.now() - t2;
    restored.delete?.();
    const t3 = performance.now();
    const copy = value.clone();
    const cloneMs = performance.now() - t3;
    copy.delete?.();
    const t4 = performance.now();
    const hash = value.hashCode;
    const hashCodeMs = performance.now() - t4;
    entry.shape = {
      kind: value.constructor.name,
      faces,
      edges,
      listMs,
      bytes: text.length,
      serializeMs,
      restoreMs,
      cloneMs,
      hashCodeMs,
      hashCode: hash,
    };
  } catch (error) {
    entry.shape = { kind: value.constructor?.name ?? 'unknown', error: String(error).slice(0, 120) };
  }
};
const identityTracer =
  values.trace === 'identity' || values.trace === 'shapes'
    ? (await import('./identity-tracer.mts')).createIdentityTracer(
        values.trace === 'shapes' ? { onResult: measureShape } : {},
      )
    : undefined;
if (identityTracer) {
  probe.setLibraryWrapper(identityTracer.wrapLibrary, identityTracer.unwrapDeep);
  if (values.libraryTracing === 'summary') values.libraryTracing = 'off';
}
let brepDigests: {
  name: string;
  sha256: string;
  bytes: number;
  ms: number;
  volume?: number;
  area?: number;
  faces?: number;
  edges?: number;
}[] = [];
let capturedLibrary: Record<string, any> | undefined;
const distanceQueryProfile = { calls: 0, ms: 0, instances: [] as Array<{ calls: number; ms: number }> };
if (values.profileDistanceQuery) {
  probe.setLibraryWrapper((library) => {
    const prototype = (library as Record<string, any>).DistanceQuery?.prototype;
    if (!prototype || typeof prototype.distanceTo !== 'function')
      throw new Error('DistanceQuery.distanceTo unavailable');
    const original = prototype.distanceTo;
    const instances = new WeakMap<object, { calls: number; ms: number }>();
    prototype.distanceTo = function (...arguments_: any[]) {
      const start = performance.now();
      let instance = instances.get(this);
      if (!instance) {
        instance = { calls: 0, ms: 0 };
        instances.set(this, instance);
        distanceQueryProfile.instances.push(instance);
      }
      try {
        return original.apply(this, arguments_);
      } finally {
        const elapsed = performance.now() - start;
        instance.calls += 1;
        instance.ms += elapsed;
        distanceQueryProfile.calls += 1;
        distanceQueryProfile.ms += elapsed;
      }
    };
    return library;
  });
}
if (values.brepDigest) {
  // Capture the library the kernel hands to user code (same replicad module instance) for triangulation-independent parity measures.
  if (values.trace === 'off')
    probe.setLibraryWrapper((library) => {
      capturedLibrary = library as Record<string, any>;
      return library;
    });
  probe.setResultObserver((value) => {
    const entries: { name?: string; shape?: any }[] = Array.isArray(value) ? value : [{ shape: value }];
    brepDigests = entries
      .filter((entry) => entry && typeof entry.shape?.serialize === 'function')
      .map((entry, index) => {
        const start = performance.now();
        const text: string = entry.shape.serialize();
        const ms = performance.now() - start;
        let parity: { volume?: number; area?: number; faces?: number; edges?: number } = {};
        try {
          const library = capturedLibrary;
          parity = {
            faces: entry.shape.faces.length,
            edges: entry.shape.edges.length,
            volume: library?.measureVolume ? library.measureVolume(entry.shape) : undefined,
            area: library?.measureShapeSurfaceProperties
              ? library.measureShapeSurfaceProperties(entry.shape).area
              : undefined,
          };
        } catch {
          /* parity measures are best-effort */
        }
        return {
          name: entry.name ?? `#${index}`,
          sha256: createHash('sha256').update(text).digest('hex'),
          bytes: text.length,
          ms,
          ...parity,
        };
      });
  });
}
const model = models[values.model ?? ''];
if (!model) throw new Error(`Unknown model ${values.model}; known: ${Object.keys(models).join(', ')}`);
const arm = values.arm as 'bypass' | 'memory' | 'durable' | 'poison';
if (!['bypass', 'memory', 'durable', 'poison'].includes(arm)) throw new Error(`Unknown arm ${arm}`);
if (arm !== 'memory' && arm !== 'poison' && !values.store)
  throw new Error('--store is required for bypass/durable arms');
probe.semanticDisabled = arm === 'bypass';
if (values.captureBrep) probe.captureRecordedBrep = true;
if (arm === 'poison') {
  if (!values.poisonBrep) throw new Error('arm `poison` requires --poisonBrep <file> (capture one with --captureBrep)');
  const poison = readFileSync(resolve(values.poisonBrep));
  probe.poisonBytes = new Uint8Array(
    poison.buffer.slice(poison.byteOffset, poison.byteOffset + poison.byteLength),
  ) as Uint8Array<ArrayBuffer>;
} else if (values.poisonBrep) {
  throw new Error('--poisonBrep is only valid with --arm poison');
}

const repo = repoRoot;
const files = model.files();
const writeTree = (root: string, tree: Record<string, string>) => {
  for (const [path, text] of Object.entries(tree)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
};

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const fingerprintTree = (root: string): { digest: string; files: Record<string, string> } => {
  const files: Record<string, string> = {};
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
      left.name.localeCompare(right.name),
    )) {
      const path = join(directory, entry.name);
      if (entry.isDirectory() && entry.name !== '__tests__') visit(path);
      else if (
        entry.isFile() &&
        /\.(?:ts|mts|js|mjs|json)$/.test(entry.name) &&
        !/\.(?:test|spec|test-d|d)\.[^.]+$/.test(entry.name)
      ) {
        const relative = path.slice(root.length + 1);
        files[relative] = sha256(readFileSync(path));
      }
    }
  };
  visit(root);
  return { digest: sha256(new TextEncoder().encode(JSON.stringify(files))), files };
};
/**
 * Hash a file that only exists in a prerequisite lane's checkout (the W11
 * original-replicad / legacy-converter comparison artifacts). Absent in an
 * ordinary Tau checkout, where the arms compare cache state rather than two
 * library builds.
 */
const optionalSha256 = (path: string): string | undefined =>
  existsSync(path) ? sha256(readFileSync(path)) : undefined;
const executionHashes = () => ({
  harness: fingerprintTree(import.meta.dirname),
  originalReplicadEsm: optionalSha256(resolve(import.meta.dirname, '../original-replicad/dist/replicad.js')),
  originalReplicadHook: optionalSha256(resolve(import.meta.dirname, '../original-replicad-hook-impl.mjs')),
  legacyConverter: optionalSha256(resolve(import.meta.dirname, '../legacy-converter/replicad-to-gltf.ts')),
  legacyConverterHook: optionalSha256(resolve(import.meta.dirname, '../legacy-converter-hook-impl.mjs')),
  replicadPlugin: fingerprintTree(join(repo, 'packages/plugins/replicad/src')),
  esbuildPlugin: fingerprintTree(join(repo, 'packages/plugins/esbuild/src')),
  installedReplicadEsm: sha256(readFileSync(join(repo, 'node_modules/replicad/dist/replicad.js'))),
  installedReplicadPackage: sha256(readFileSync(join(repo, 'node_modules/replicad/package.json'))),
  installedOcSingle: sha256(readFileSync(join(repo, 'node_modules/replicad-opencascadejs/dist/replicad_single.js'))),
});
const loadedTauSources = () => {
  const log = process.env.TAU_COMPUTE_BASELINE_LOAD_LOG;
  if (!log || !existsSync(log))
    throw new Error('TAU_COMPUTE_BASELINE_LOAD_LOG is required for executed-source provenance (Q5)');
  const loaded = new Map<string, string>();
  for (const line of readFileSync(log, 'utf8').trim().split('\n')) {
    if (!line) continue;
    const entry = JSON.parse(line) as { path: string; sha256: string };
    loaded.set(entry.path, entry.sha256);
  }
  return Object.fromEntries([...loaded].sort(([left], [right]) => left.localeCompare(right)));
};
const resolvedModuleProvenance = () => {
  const hashes = executionHashes();
  const correctedConverterUrl = pathToFileURL(
    join(repo, 'packages/plugins/replicad/src/utils/replicad-to-gltf.ts'),
  ).href;
  const replicadUrl = import.meta.resolve('replicad');
  const converterUrl = import.meta.resolve(correctedConverterUrl);
  const replicadSha256 = sha256(readFileSync(fileURLToPath(replicadUrl)));
  const replicadRole =
    replicadUrl.endsWith('/replicad/original-replicad/dist/replicad.js') &&
    replicadSha256 === hashes.originalReplicadEsm
      ? 'original'
      : replicadUrl.endsWith('/node_modules/@taulabs/replicad/dist/replicad.js') &&
          replicadSha256 === hashes.installedReplicadEsm
        ? 'ordinary'
        : 'unknown';
  const converterRole =
    converterUrl === `${correctedConverterUrl}?cr-pre-1-legacy-converter`
      ? 'legacy'
      : converterUrl === correctedConverterUrl
        ? 'corrected'
        : 'unknown';
  return {
    replicad: { role: replicadRole, url: replicadUrl, sha256: replicadSha256 },
    converter: {
      role: converterRole,
      url: converterUrl,
      sha256: sha256(
        readFileSync(
          converterRole === 'legacy'
            ? resolve(import.meta.dirname, '../legacy-converter/replicad-to-gltf.ts')
            : fileURLToPath(converterUrl),
        ),
      ),
    },
  };
};
const changedExecutionPaths = (
  before: ReturnType<typeof executionHashes>,
  after: ReturnType<typeof executionHashes>,
): string[] => {
  const changed: string[] = [];
  for (const key of Object.keys(before) as Array<keyof typeof before>) {
    const left = before[key];
    const right = after[key];
    if (typeof left === 'string' && left !== right) changed.push(key);
    else if (typeof left !== 'string' && typeof right !== 'string') {
      for (const path of new Set([...Object.keys(left.files), ...Object.keys(right.files)])) {
        if (left.files[path] !== right.files[path]) changed.push(`${key}/${path}`);
      }
    }
  }
  return changed;
};
/** Strip volatile metadata so the structure digest covers nodes/meshes/accessors/materials only. */
const stripVolatile = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stripVolatile);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => key !== 'extras' && key !== 'asset' && key !== 'generator')
        .map(([key, entry]) => [key, stripVolatile(entry)]),
    );
  return value;
};
const glbStats = (bytes: Uint8Array) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLength = view.getUint32(12, true);
  const jsonText = new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength));
  const json = JSON.parse(jsonText);
  const binOffset = 20 + jsonLength;
  const binLength = binOffset + 8 <= bytes.byteLength ? view.getUint32(binOffset, true) : 0;
  const bin = bytes.subarray(binOffset + 8, binOffset + 8 + binLength);
  const triangles = (json.meshes ?? [])
    .flatMap((mesh: any) => mesh.primitives ?? [])
    .filter((primitive: any) => (primitive.mode ?? 4) === 4)
    .reduce(
      (total: number, primitive: any) =>
        total + (primitive.indices === undefined ? 0 : json.accessors[primitive.indices].count / 3),
      0,
    );
  // geometrySha256 = BIN chunk (all accessor payloads); structureSha256 = JSON chunk minus asset/extras/generator.
  return {
    nodes: json.nodes?.length ?? 0,
    meshes: json.meshes?.length ?? 0,
    triangles,
    geometrySha256: sha256(bin),
    structureSha256: sha256(new TextEncoder().encode(JSON.stringify(stripVolatile(json)))),
    jsonBytes: jsonLength,
    binBytes: binLength,
  };
};

const kernelFor = async () => {
  if (model.kernel === 'replicad') {
    const { replicadKernel } = await import('../../../../../packages/plugins/replicad/src/index.ts');
    const { esbuild } = await import('../../../../../packages/plugins/esbuild/src/index.ts');
    return {
      plugins: [esbuild()],
      kernels: [
        replicadKernel({
          wasm: values.wasm as 'multi' | 'single' | 'auto',
          libraryTracing: values.libraryTracing as 'off' | 'summary',
        }),
      ],
    };
  }
  if (model.kernel === 'openrscad') {
    const { openrscadKernel } = await import('../../../../../packages/plugins/openrscad/src/index.ts');
    return { plugins: [], kernels: [openrscadKernel()] };
  }
  const { build123d } = await import('../../../../../packages/plugins/build123d/src/index.ts');
  const { readFileSync } = await import('node:fs');
  const targetRoot = resolve(repo, `apps/desktop/resources/python/${process.platform}-${process.arch}`);
  const manifest = JSON.parse(readFileSync(resolve(targetRoot, 'tau-runtime-manifest.json'), 'utf8'));
  const trustFile = join(values.store ?? repo, '.lane-b-trust.json');
  mkdirSync(dirname(trustFile), { recursive: true });
  writeFileSync(trustFile, '{"version":1,"trusted":true}\n');
  return {
    plugins: [
      build123d({
        kernels: {
          default: {
            pythonExecutable: resolve(targetRoot, manifest.pythonRelativePath),
            workerPath: resolve(targetRoot, manifest.workerPath),
            trustFile,
            pythonSha256: manifest.pythonSha256,
            workerSha256: manifest.workerSha256,
            supportFiles: manifest.supportFiles.map(({ path, sha256: digest }: { path: string; sha256: string }) => ({
              path: resolve(targetRoot, path),
              sha256: digest,
            })),
            requestTimeout: 600_000,
          },
        },
      }),
    ],
    kernels: [],
  };
};

const main = async () => {
  const started = performance.now();
  const executionHashesBefore = executionHashes();
  let loadedTauSourcesAtLoad: Record<string, string> | undefined;
  let loadedTauSourcesAfter: Record<string, string> | undefined;
  const moduleProvenance = resolvedModuleProvenance();
  if (moduleProvenance.replicad.role === 'unknown' || moduleProvenance.converter.role === 'unknown')
    throw new Error(`Unknown resolved module provenance: ${JSON.stringify(moduleProvenance)}`);
  let executionHashesAfter: ReturnType<typeof executionHashes> | undefined;
  const store = values.store ? resolve(values.store) : undefined;
  if (store) {
    mkdirSync(store, { recursive: true });
    writeTree(store, files);
  }
  const storeExisted = store ? existsSync(join(store, '.tau/cache/compute/v1')) : false;
  const baseFileSystem: any = arm === 'memory' || arm === 'poison' ? fromMemoryFs(files) : fromNodeFs(store!);
  /* `--watch off`: hide `watch`/`watchReady` from the inline base the transport mints, so the client's autonomous
   * watched-filesystem rerender (`runtime-client-core.ts` RenderOutcome doc :264) cannot supersede a benchmark render
   * after the `unrelated` source edit, and `kernel-worker.ts:318` takes the watcherless freshness path instead. This
   * also equalises the arms: `fromMemoryFs`'s base has no `watch` at all (`from-memory-fs-handle.ts`), so leaving
   * watch on would give the memory arm a structurally different freshness path from bypass/durable.
   * The opaque `RuntimeFileSystem` is a spec object carrying ONE module-private symbol whose value is the handle
   * (`transport/_internal/runtime-filesystem-handle.ts:59`) — it must be re-wrapped through that symbol, never
   * spread by string keys (doing so yields `{}` and `inProcessTransport` rejects it). */
  const stripWatch = (source: any): any =>
    Object.fromEntries(
      Reflect.ownKeys(source)
        .filter((key) => key !== 'watch' && key !== 'watchReady')
        .map((key) => [key, typeof source[key] === 'function' ? source[key].bind(source) : source[key]]) as any,
    );
  /* The inline handle's `create()` mints a FRESH `RuntimeFileSystemBase` per client materialisation, so the opaque
   * value handed to `inProcessTransport` is a spec, not a live filesystem: writing to `fromMemoryFs(...)` itself is a
   * no-op the runtime never sees. Wrap `create` to capture the base the transport actually binds — that is the object
   * the `unrelated` source edit must be written through on the memory arm. */
  let liveFileSystem: any;
  const [handleKey] = Object.getOwnPropertySymbols(baseFileSystem);
  const handle = (baseFileSystem as any)[handleKey!];
  if (handle?.kind !== 'inline') throw new Error(`expected an inline filesystem handle, got ${handle?.kind}`);
  const fileSystem: any = {
    [handleKey!]: {
      kind: 'inline',
      create: () => (liveFileSystem = values.watch === 'off' ? stripWatch(handle.create()) : handle.create()),
    },
  };
  const definition = await kernelFor();
  const runtime = defineRuntime(definition as any);
  const client = createRuntimeClient({ transport: inProcessTransport({ runtime, fileSystem }) });
  let telemetry: any[] = [];
  const logs: string[] = [];
  client.on('telemetry', (entries: any[]) => telemetry.push(...entries));
  client.on('log', (entry: any) => {
    if (entry.level === 'warn' || entry.level === 'error') logs.push(`${entry.level}: ${entry.message}`);
  });
  const content = values.content === 'ui' ? { includeEdges: true, includeTopology: true } : undefined;
  const steps: any[] = [];
  let currentFiles = files;
  let connectMs = 0;
  try {
    const connectStart = performance.now();
    await client.connect();
    connectMs = performance.now() - connectStart;
    for (const step of (values.steps ?? 'cold').split(',')) {
      const parameters =
        step === 'late' || step === 'late2'
          ? model.params.late
          : step === 'early'
            ? model.params.early
            : model.params.base;
      if (step === 'unrelated') {
        currentFiles = model.unrelated(files);
        if (arm === 'memory' || arm === 'poison') {
          for (const [path, text] of Object.entries(currentFiles))
            if (files[path] !== text) await liveFileSystem.writeFile(path, text);
        } else {
          writeTree(store!, currentFiles);
          if (values.watch !== 'off') await new Promise((resolve) => setTimeout(resolve, 750));
        }
        /* Assert the edit is visible through the filesystem the runtime actually binds — a silently-dropped edit turns
         * this step into a second `warm` measurement (it did, on the memory arm, until the live base was captured). */
        const applied = await liveFileSystem.readFile(model.mainFile);
        const appliedText = typeof applied === 'string' ? applied : new TextDecoder().decode(applied);
        if (appliedText !== currentFiles[model.mainFile])
          throw new Error(
            `unrelated edit not visible through the bound filesystem (${appliedText.length} vs ${currentFiles[model.mainFile]!.length} chars)`,
          );
      }
      probe.reset();
      telemetry = [];
      logs.length = 0;
      brepDigests = [];
      const load = loadavg();
      const start = performance.now();
      const request: any = { source: { path: model.mainFile }, parameters, ...(content ? { content } : {}) };
      let result = await client.render(request);
      let wallMs = performance.now() - start;
      let retried = false;
      if (values.failOnRetry) rejectSupersededTimingResult(result);
      if (result.superseded) {
        // a watcher event for our own source rewrite can supersede the in-flight render; re-issue once
        retried = true;
        probe.reset();
        telemetry = [];
        logs.length = 0;
        brepDigests = [];
        const retryStart = performance.now();
        result = await client.render(request);
        wallMs = performance.now() - retryStart;
      }
      if (result.superseded) throw new Error('render superseded twice');
      if (!result.geometry.success)
        throw new Error(`render failed: ${JSON.stringify(result.geometry.issues).slice(0, 2000)}`);
      if (result.geometry.data.format !== 'gltf') throw new Error('expected glb');
      const bytes: Uint8Array = result.geometry.data.content;
      const spans: Record<string, { count: number; ms: number }> = {};
      let librarySummary: Record<string, { calls: number; ms: number; errors: number }> | undefined;
      for (const entry of telemetry) {
        const span = (spans[entry.name] ??= { count: 0, ms: 0 });
        span.count += 1;
        span.ms += entry.duration;
        if (entry.name === 'replicad.library.summary' && entry.detail) {
          librarySummary = {};
          for (const [key, value] of Object.entries(entry.detail)) {
            const match = /^(.+)\.(calls|ms|errors)$/.exec(key);
            if (!match || match[1] === 'total') continue;
            const record = (librarySummary[match[1]] ??= { calls: 0, ms: 0, errors: 0 });
            (record as any)[match[2]] = value as number;
          }
        }
      }
      const snapshot = probe.snapshot();
      const mainSpan = telemetry.find((entry) => entry.name === 'replicad.run-main');
      const trace = identityTracer
        ?.take()
        .filter(
          (entry) =>
            !mainSpan || (entry.start >= mainSpan.startTime && entry.start <= mainSpan.startTime + mainSpan.duration),
        );
      if (trace && !librarySummary) {
        librarySummary = {};
        for (const entry of trace) {
          const record = (librarySummary[entry.op] ??= { calls: 0, ms: 0, errors: 0 });
          record.calls += 1;
          record.ms += entry.ms;
        }
      }
      if (values.dumpGlb) {
        mkdirSync(resolve(values.dumpGlb), { recursive: true });
        writeFileSync(join(resolve(values.dumpGlb), `${model.name}-${arm}-${step}-${steps.length}.glb`), bytes);
      }
      steps.push({
        step,
        parameters,
        wallMs,
        retried,
        loadavg: load,
        spans,
        librarySummary,
        trace,
        ...snapshot,
        output: { bytes: bytes.byteLength, sha256: sha256(bytes), ...glbStats(bytes) },
        brep: values.brepDigest
          ? {
              sha256: sha256(new TextEncoder().encode(brepDigests.map((entry) => entry.sha256).join('|'))),
              entries: brepDigests,
            }
          : undefined,
        logs: [...logs],
      });
      if (values.out) writeReport({ partial: true }); // persist after every step so an interrupted child still leaves its completed steps
      console.error(
        `[lane-b] ${model.name} ${arm} ${step}: ${wallMs.toFixed(0)} ms (main ${spans['create.runOcMain']?.ms.toFixed(0) ?? '-'} ms, flush ${snapshot.counters['session.flush']?.ms.toFixed(0) ?? '-'} ms, hits ${snapshot.lookups.hit}/${snapshot.lookups.hit + snapshot.lookups.miss}, readdirStat ${snapshot.counters['fs.readdirStat']?.calls ?? 0}, writes ${snapshot.counters['fs.writeFile']?.calls ?? 0})`,
      );
    }
    if (values.captureBrep && probe.capturedBrep) {
      mkdirSync(dirname(resolve(values.captureBrep)), { recursive: true });
      writeFileSync(resolve(values.captureBrep), probe.capturedBrep);
    }
    executionHashesAfter = executionHashes();
    loadedTauSourcesAtLoad = loadedTauSources();
    loadedTauSourcesAfter = Object.fromEntries(
      Object.keys(loadedTauSourcesAtLoad).map((path) => [path, sha256(readFileSync(path))]),
    );
    if (JSON.stringify(loadedTauSourcesAtLoad) !== JSON.stringify(loadedTauSourcesAfter))
      throw new Error('loaded execution source drift');
    if (JSON.stringify(executionHashesAfter) !== JSON.stringify(executionHashesBefore)) {
      throw new Error(
        `execution source drift: ${JSON.stringify(changedExecutionPaths(executionHashesBefore, executionHashesAfter))}`,
      );
    }
    writeReport({ partial: false, executionHashesAfter });
  } catch (error) {
    executionHashesAfter ??= executionHashes();
    loadedTauSourcesAtLoad ??= loadedTauSources();
    loadedTauSourcesAfter ??= Object.fromEntries(
      Object.keys(loadedTauSourcesAtLoad).map((path) => [path, sha256(readFileSync(path))]),
    );
    if (values.out) writeReport({ partial: true, error: String(error), executionHashesAfter });
    throw error;
  } finally {
    await client.shutdown({ drain: true });
  }
  function writeReport(extra: {
    partial: boolean;
    error?: string;
    executionHashesAfter?: ReturnType<typeof executionHashes>;
  }) {
    const report = {
      model: model.name,
      kernel: model.kernel,
      arm,
      label: values.label,
      content: values.content,
      wasm: values.wasm,
      libraryTracing: values.libraryTracing,
      watch: values.watch,
      store,
      storeExisted,
      pid: process.pid,
      node: process.version,
      cpu: cpus()[0]?.model,
      connectMs,
      totalMs: performance.now() - started,
      patched: (globalThis as any).__laneBPatched ?? [],
      executionHashesBefore,
      moduleProvenance,
      loadedTauSourcesAtLoad,
      loadedTauSourcesAfter,
      distanceQueryProfile: values.profileDistanceQuery ? distanceQueryProfile : undefined,
      ...extra,
      steps,
      sourceHashes: Object.fromEntries(
        Object.entries(files).map(([path, text]) => [path, sha256(new TextEncoder().encode(text))]),
      ),
    };
    if (values.out) {
      mkdirSync(dirname(resolve(values.out)), { recursive: true });
      writeFileSync(resolve(values.out), JSON.stringify(report, null, 2));
    } else if (!extra.partial) console.log(JSON.stringify(report));
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
