/* oxlint-disable eslint/no-await-in-loop -- benchmark samples are intentionally sequential */

import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

type Arm = 'esbuild-native' | 'rolldown-native';
type BenchmarkFileSystem = {
  exists(path: string): Promise<boolean>;
  readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
  readFile(path: string, encoding: 'utf8'): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  ensureDir(path: string): Promise<void>;
};
type BenchmarkVm = {
  detectImports(entryPath: string, signal?: AbortSignal): Promise<unknown>;
  bundle(
    entryPath: string,
    signal?: AbortSignal,
  ): Promise<{
    readonly code: string;
    readonly sourceMap?: string;
    readonly success: boolean;
    readonly issues: ReadonlyArray<{ readonly message: string }>;
  }>;
  execute(
    code: string,
    signal?: AbortSignal,
  ): Promise<
    { readonly success: true; readonly value: unknown } | { readonly success: false; readonly issues: unknown[] }
  >;
  registerModule(
    name: string,
    module: { readonly code: string; readonly version: string; readonly globalName?: string },
  ): void;
  dispose(): void;
};
type Adapter = {
  readonly createRolldownModuleVm?: (options: VmOptions) => BenchmarkVm | Promise<BenchmarkVm>;
  readonly createEsbuildModuleVm?: (options: VmOptions & { readonly sourceMaps: boolean }) => Promise<BenchmarkVm>;
};
type VmOptions = {
  readonly filesystem: BenchmarkFileSystem;
  readonly autoExportNames: readonly string[];
};

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const [armValue, fixtureName, mode = 'cold', iterationsValue = '1', warmupsValue = '0'] = process.argv.slice(2);
if (armValue !== 'esbuild-native' && armValue !== 'rolldown-native') {
  throw new Error(`Unknown benchmark arm '${armValue}'.`);
}
const arm: Arm = armValue;
const fixture =
  fixtureName === 'feature-matrix'
    ? { directory: 'bundler-feature-matrix', entry: 'main.ts' }
    : { directory: 'birdhouse', entry: 'main.ts' };
const fixtureRoot = join(repositoryRoot, 'libs/tau-examples/src/kernels/replicad', fixture.directory);

class MemoryFileSystem implements BenchmarkFileSystem {
  public readonly files = new Map<string, string | Uint8Array<ArrayBuffer>>();

  public async exists(path: string): Promise<boolean> {
    return this.files.has(path);
  }

  public async readFile(path: string, encoding: 'utf8'): Promise<string>;
  public async readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
  public async readFile(path: string, encoding?: 'utf8'): Promise<string | Uint8Array<ArrayBuffer>> {
    const value = this.files.get(path);
    if (value === undefined) {
      throw new Error(`ENOENT: ${path}`);
    }
    if (encoding === 'utf8') {
      return typeof value === 'string' ? value : new TextDecoder().decode(value);
    }
    return typeof value === 'string' ? new TextEncoder().encode(value) : value;
  }

  public async writeFile(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }

  public async ensureDir(): Promise<void> {
    await Promise.resolve();
  }
}

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

const filesystem = new MemoryFileSystem();
const fixturePaths = await walk(fixtureRoot);
await Promise.all(
  fixturePaths.map(async (path) => {
    const bytes = await readFile(path);
    const virtualPath = `/${relative(fixtureRoot, path)}`;
    filesystem.files.set(
      virtualPath,
      /\.(?:[cm]?[jt]sx?|json|md|svg|txt)$/u.test(path) ? bytes.toString('utf8') : new Uint8Array(bytes),
    );
  }),
);
const entryPath = `/${fixture.entry}`;
const entrySource = await filesystem.readFile(entryPath, 'utf8');

async function measure<T>(operation: () => Promise<T>): Promise<{ ms: number; value: T }> {
  const started = performance.now();
  const value = await operation();
  return { ms: performance.now() - started, value };
}

const adapterPath =
  arm === 'rolldown-native'
    ? join(repositoryRoot, 'packages/plugins/rolldown/dist/rolldown-module-vm.mjs')
    : join(repositoryRoot, 'packages/plugins/esbuild/dist/vm/index.mjs');
const externalStarted = performance.now();
const adapter = await measure(async () => (await import(adapterPath)) as Adapter);
const replicadImport = await measure(async () => import('replicad'));
const replicad = replicadImport.value;
const reserved = new Set(['await', 'delete', 'import', 'in', 'instanceof', 'new', 'typeof', 'void', 'yield']);
const namedExports = Object.keys(replicad)
  .filter((name) => name !== 'default')
  .map((name, index) => {
    const safe = /^[$_a-z][\w$]*$/iu.test(name) && !reserved.has(name);
    const local = safe ? name : `__kernel_export_${index}`;
    return `const ${local} = __mod[${JSON.stringify(name)}]; export { ${local}${local === name ? '' : ` as ${name}`} };`;
  })
  .join('\n');
const shim = `const __mod = globalThis.__KERNEL_MODULES__.get("replicad");\n${namedExports}\nexport default __mod;`;
(globalThis as typeof globalThis & { __KERNEL_MODULES__: Map<string, unknown> }).__KERNEL_MODULES__ = new Map([
  ['replicad', replicad],
]);

const initialized = await measure(async () => {
  const options = {
    filesystem,
    autoExportNames: ['main', 'defaultParams', 'getParameterDefinitions'],
  };
  if (arm === 'rolldown-native') {
    const create = adapter.value.createRolldownModuleVm;
    if (create === undefined) {
      throw new Error('Native Rolldown adapter factory is missing.');
    }
    return create(options);
  }
  const create = adapter.value.createEsbuildModuleVm;
  if (create === undefined) {
    throw new Error('Native esbuild adapter factory is missing.');
  }
  return create({ ...options, sourceMaps: true });
});
const vm = initialized.value;
vm.registerModule('replicad', { code: shim, version: 'benchmark', globalName: 'replicad' });
vm.registerModule('@taucad/replicad/annotations', {
  code: [
    "export const face = (select) => ({ kind: 'face', select });",
    "export const axis = (select) => ({ kind: 'axis', select });",
    "export const frame = (value) => ({ kind: 'frame', ...value });",
    'export const datum = frame;',
    "export const group = (members) => ({ kind: 'group', members });",
  ].join('\n'),
  version: 'benchmark',
});

const run = async (index: number) => {
  if (mode === 'warm') {
    filesystem.files.set(entryPath, `${entrySource}\nexport const __benchmarkVariant = ${index};\n`);
  }
  const detected = await measure(async () => vm.detectImports(entryPath, AbortSignal.timeout(60_000)));
  const bundled = await measure(async () => vm.bundle(entryPath, AbortSignal.timeout(60_000)));
  if (!bundled.value.success) {
    throw new Error(bundled.value.issues.map(({ message }) => message).join('; '));
  }
  const executed = await measure(async () => vm.execute(bundled.value.code, AbortSignal.timeout(60_000)));
  if (!executed.value.success) {
    throw new Error('Bundled module execution failed.');
  }
  return {
    detect: detected.ms,
    bundle: bundled.ms,
    execute: executed.ms,
    codeBytes: Buffer.byteLength(bundled.value.code),
    sourceMapBytes: Buffer.byteLength(bundled.value.sourceMap ?? ''),
  };
};

const iterations = Number(iterationsValue);
const warmups = Number(warmupsValue);
const rows: Array<Awaited<ReturnType<typeof run>>> = [];
for (let index = 0; index < iterations + warmups; index++) {
  const row = await run(index);
  if (index >= warmups) {
    rows.push(row);
  }
}
const cleanup = await measure(async () => {
  vm.dispose();
});
const externalWall = performance.now() - externalStarted;

console.log(
  JSON.stringify({
    arm,
    fixture: fixtureName,
    mode,
    import: adapter.ms,
    builtinImport: replicadImport.ms,
    initialize: initialized.ms,
    cleanup: cleanup.ms,
    externalWall,
    rows,
    rss: process.memoryUsage().rss,
    maxRss: process.resourceUsage().maxRSS * 1024,
  }),
);

/* oxlint-enable eslint/no-await-in-loop -- end sequential benchmark */
