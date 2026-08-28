/* oxlint-disable eslint/no-await-in-loop -- product samples must run sequentially */

import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

type Arm = 'esbuild-native' | 'rolldown-native';
type Fixture = 'birdhouse' | 'feature-matrix';
type State = 'cold' | 'warm-cache-disabled' | 'full-hot';
type TelemetryEntry = {
  readonly name: string;
  readonly startTime: number;
  readonly duration: number;
  readonly workerTimeOrigin: number;
  readonly detail?: Readonly<Record<string, unknown>>;
};
type RuntimePlugin = unknown;
type ExportResult =
  | {
      readonly success: true;
      readonly data: ReadonlyArray<{ readonly name: string; readonly bytes: Uint8Array<ArrayBuffer> }>;
    }
  | { readonly success: false; readonly issues: ReadonlyArray<{ readonly message: string }> };
type RuntimeClient = {
  readonly export: (
    format: 'glb',
    options: {
      readonly source:
        | {
            readonly files: Readonly<Record<string, string | Uint8Array<ArrayBuffer>>>;
            readonly entry: string;
          }
        | { readonly path: string };
    },
  ) => Promise<ExportResult>;
  readonly on: (event: 'telemetry', listener: (batch: readonly TelemetryEntry[]) => void) => () => void;
  readonly shutdown: (options: { readonly drain: true }) => Promise<void>;
};
type ClientModule = { readonly createRuntimeClient: (options: { readonly transport: unknown }) => RuntimeClient };
type FilesystemModule = {
  readonly fromNodeFs: (root: string) => unknown;
};
type TransportModule = {
  readonly inProcessTransport: (options: { readonly runtime: unknown; readonly fileSystem: unknown }) => unknown;
};
type WorkerModule = {
  readonly defineRuntime: (options: {
    readonly plugins?: readonly RuntimePlugin[];
    readonly kernels: readonly RuntimePlugin[];
    readonly middleware?: readonly RuntimePlugin[];
  }) => unknown;
};
type MiddlewareModule = {
  readonly middleware: () => RuntimePlugin;
  readonly parameterFileResolver: () => RuntimePlugin;
  readonly gltfEdgeDetection: () => RuntimePlugin;
};
type ReplicadModule = { readonly replicadKernel: (options: { readonly wasm: 'multi' }) => RuntimePlugin };
type BundlerModule = {
  readonly esbuild?: () => RuntimePlugin;
  readonly rolldown?: () => RuntimePlugin;
};

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const [armValue, fixtureValue, stateValue = 'cold', iterationsValue = '1', warmupsValue = '0'] = process.argv.slice(2);
if (armValue !== 'esbuild-native' && armValue !== 'rolldown-native') {
  throw new Error(`Unknown arm '${armValue}'.`);
}
if (fixtureValue !== 'birdhouse' && fixtureValue !== 'feature-matrix') {
  throw new Error(`Unknown fixture '${fixtureValue}'.`);
}
if (stateValue !== 'cold' && stateValue !== 'warm-cache-disabled' && stateValue !== 'full-hot') {
  throw new Error(`Unknown state '${stateValue}'.`);
}
const arm: Arm = armValue;
const fixture: Fixture = fixtureValue;
const state: State = stateValue;
const iterations = Number(iterationsValue);
const warmups = Number(warmupsValue);
const fixtureDefinition =
  fixture === 'feature-matrix'
    ? { directory: 'bundler-feature-matrix', entry: 'main.ts' }
    : { directory: 'birdhouse', entry: 'main.ts' };
const fixtureRoot = join(repositoryRoot, 'libs/tau-examples/src/kernels/replicad', fixtureDefinition.directory);
const entryPath = `/${fixtureDefinition.entry}`;

type Measure = <T>(operation: () => Promise<T>) => Promise<{ readonly ms: number; readonly value: T }>;
const measure: Measure = async (operation) => {
  const started = performance.now();
  const value = await operation();
  return { ms: performance.now() - started, value };
};

const walk = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? walk(path) : [path];
    }),
  );
  return paths.flat();
};

const fixtureLoad = await measure(async () => {
  const paths = await walk(fixtureRoot);
  return Object.fromEntries(
    await Promise.all(
      paths
        .filter((path) => /\.(?:[cm]?[jt]sx?|json|md|svg|txt|bin)$/u.test(path))
        .map(async (path) => {
          const bytes = await readFile(path);
          const fixturePath = `/${relative(fixtureRoot, path)}`;
          return [
            fixturePath,
            /\.(?:[cm]?[jt]sx?|json|md|svg|txt)$/u.test(path) ? bytes.toString('utf8') : new Uint8Array(bytes),
          ] as const;
        }),
    ),
  );
});
const originalEntry = fixtureLoad.value[entryPath];
if (typeof originalEntry !== 'string') {
  throw new TypeError(`Missing text entry '${fixtureDefinition.entry}'.`);
}

const importStarted = performance.now();
const imported = await Promise.all([
  import(join(repositoryRoot, 'packages/runtime/dist/client/index.mjs')),
  import(join(repositoryRoot, 'packages/runtime/dist/filesystem/from-node-fs.mjs')),
  import(join(repositoryRoot, 'packages/runtime/dist/transport/in-process.mjs')),
  import(join(repositoryRoot, 'packages/runtime/dist/worker/index.mjs')),
  import(join(repositoryRoot, 'packages/plugins/middleware/dist/index.mjs')),
  import(join(repositoryRoot, 'packages/plugins/replicad/dist/index.mjs')),
  import(
    join(
      repositoryRoot,
      arm === 'rolldown-native'
        ? 'packages/plugins/rolldown/dist/index.mjs'
        : 'packages/plugins/esbuild/dist/index.mjs',
    )
  ),
]);
const [clientModule, filesystemModule, transportModule, workerModule, middlewareModule, replicadModule, bundlerModule] =
  imported as unknown as readonly [
    ClientModule,
    FilesystemModule,
    TransportModule,
    WorkerModule,
    MiddlewareModule,
    ReplicadModule,
    BundlerModule,
  ];
const moduleImport = performance.now() - importStarted;

const bundlerFactory = arm === 'rolldown-native' ? bundlerModule.rolldown : bundlerModule.esbuild;
if (bundlerFactory === undefined) {
  throw new Error(`Bundler factory is missing for '${arm}'.`);
}
const bundler = bundlerFactory();
const kernel = replicadModule.replicadKernel({ wasm: 'multi' });
const runtime =
  state === 'warm-cache-disabled'
    ? workerModule.defineRuntime({
        plugins: [bundler],
        kernels: [kernel],
        middleware: [middlewareModule.parameterFileResolver(), middlewareModule.gltfEdgeDetection()],
      })
    : workerModule.defineRuntime({ plugins: [middlewareModule.middleware(), bundler], kernels: [kernel] });
const temporaryRoot = await mkdtemp(join(tmpdir(), `taucad-bundler-product-${arm}-${fixture}-`));
await Promise.all(
  Object.entries(fixtureLoad.value).map(async ([path, content]) => {
    const destination = join(temporaryRoot, path.slice(1));
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, content);
  }),
);
const filesystem = filesystemModule.fromNodeFs(temporaryRoot);
const clientCreation = await measure(async () =>
  clientModule.createRuntimeClient({
    transport: transportModule.inProcessTransport({ runtime, fileSystem: filesystem }),
  }),
);
const client = clientCreation.value;

let telemetry: TelemetryEntry[] = [];
const off = client.on('telemetry', (batch: readonly TelemetryEntry[]) => telemetry.push(...batch));
const rootCoverage = (entries: readonly TelemetryEntry[]): number => {
  const ids = new Set(
    entries.map(({ detail }) => detail?.['spanId']).filter((id): id is string => typeof id === 'string'),
  );
  const roots = entries
    .filter(({ detail }) => {
      const parent = detail?.['parentSpanId'];
      return typeof parent !== 'string' || !ids.has(parent);
    })
    .map(({ startTime, duration }) => ({ start: startTime, end: startTime + duration }))
    .sort((left, right) => left.start - right.start);
  let covered = 0;
  let end = Number.NEGATIVE_INFINITY;
  for (const range of roots) {
    covered += Math.max(0, range.end - Math.max(range.start, end));
    end = Math.max(end, range.end);
  }
  return covered;
};

const run = async (index: number) => {
  telemetry = [];
  const files =
    state === 'warm-cache-disabled'
      ? {
          ...fixtureLoad.value,
          [entryPath]: `${originalEntry}\nexport const __benchmarkVariant = ${index};\n`,
        }
      : fixtureLoad.value;
  const source = state === 'warm-cache-disabled' ? { files, entry: entryPath } : { path: entryPath };
  const exported = await measure(async () => client.export('glb', { source }));
  if (!exported.value.success) {
    throw new Error(exported.value.issues.map(({ message }) => message).join('; '));
  }
  const output = exported.value.data.find(({ name }) => name.endsWith('.glb'))?.bytes;
  if (output === undefined) {
    throw new Error('Runtime returned no GLB output.');
  }
  const coverage = rootCoverage(telemetry);
  return {
    wall: exported.ms,
    runtimeRootCoverage: coverage,
    clientOverhead: exported.ms - coverage,
    telemetryEntries: telemetry.length,
    runtimePhases: Object.fromEntries(
      [...new Set(telemetry.map(({ name }) => name))].map((name) => [
        name,
        telemetry.filter((entry) => entry.name === name).reduce((total, entry) => total + entry.duration, 0),
      ]),
    ),
    bytes: output.byteLength,
    sha256: createHash('sha256').update(output).digest('hex'),
  };
};

const rows: Array<Awaited<ReturnType<typeof run>>> = [];
for (let index = 0; index < iterations + warmups; index += 1) {
  const row = await run(index);
  if (index >= warmups) {
    rows.push(row);
  }
}

off();
const shutdown = await measure(async () => client.shutdown({ drain: true }));
await rm(temporaryRoot, { recursive: true, force: true });
await new Promise<void>((resolve) => {
  setTimeout(resolve, 0);
});
const handles = (
  process as typeof process & { _getActiveHandles(): Array<{ readonly constructor: { readonly name: string } }> }
)._getActiveHandles();

console.log(
  JSON.stringify({
    arm,
    fixture,
    state,
    processTimeOrigin: performance.timeOrigin,
    processDuration: performance.now(),
    fixtureLoad: fixtureLoad.ms,
    moduleImport,
    clientCreation: clientCreation.ms,
    shutdown: shutdown.ms,
    rows,
    rss: process.memoryUsage().rss,
    maxRss: process.resourceUsage().maxRSS * 1024,
    activeHandles: handles.map((handle) => handle.constructor.name).sort(),
  }),
);

/* oxlint-enable eslint/no-await-in-loop -- end sequential benchmark */
