import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

type Binding = {
  Engine: new () => {
    ingestMesh: (request: Uint8Array<ArrayBuffer>, mesh: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer>;
    processRequest: (request: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer>;
    canonicalPlan: (request: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer>;
    evaluatePlan: (request: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer>;
  };
  canonicalize: (input: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer>;
};

type CorpusResult = {
  id: string;
  passed: boolean;
  admissions: unknown[];
  actualUtf8?: string;
  expectedUtf8?: string;
};

type CorpusReport = {
  passed: number;
  failed: number;
  results: CorpusResult[];
};

type RunEarlyCorpus = (options: {
  binding: Binding;
  host: string;
  artifacts: string[];
  output: string;
}) => Promise<CorpusReport>;

type Corpus = {
  equivalentCanonicalGroups: string[][];
};

type RouteSummary = {
  passed: number;
  failed: number;
  admissions: number;
  equivalentCanonicalGroups: Array<{ ids: string[]; passed: boolean }>;
};

type Node26Summary = {
  schemaVersion: number;
  consumerDirectory: string;
  runtime: {
    version: string;
    execPath: string;
    sha256: string;
    versions: typeof process.versions;
  };
  package: {
    manifestPath: string;
    manifestSha256: string;
    nodeModulePath: string;
    wasmModulePath: string;
    nativeBinaryPath: string;
    wasmBindingPath: string;
    wasmBinaryPath: string;
  };
  routes: { node: RouteSummary; wasm: RouteSummary };
};

const conformanceDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(conformanceDirectory, '../../../..');
const corpusPath = resolve(repositoryRoot, 'packages/geospec-engine-native/conformance/early-corpus.json');

const argument = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
};

const fileSha256 = async (path: string): Promise<string> =>
  createHash('sha256')
    .update(await readFile(path))
    .digest('hex');

const validateReport = (
  report: CorpusReport,
  corpus: Corpus,
): {
  admissions: number;
  equivalentCanonicalGroups: Array<{ ids: string[]; passed: boolean }>;
} => {
  const resultsById = new Map(report.results.map((result) => [result.id, result]));
  const equivalentCanonicalGroups = corpus.equivalentCanonicalGroups.map((ids) => {
    const group = ids.map((id) => resultsById.get(id));
    const expected = group.map((result) => result?.expectedUtf8);
    const actual = group.map((result) => result?.actualUtf8);
    return {
      ids,
      passed:
        group.every((result) => result?.passed === true) &&
        expected.every((value) => value === expected[0]) &&
        actual.every((value) => value === actual[0]),
    };
  });
  return {
    admissions: report.results.reduce((count, result) => count + result.admissions.length, 0),
    equivalentCanonicalGroups,
  };
};

export const runNode26Packed = async ({
  consumer = argument('--consumer') ??
    process.env['GEOSPEC_PACKED_CONSUMER'] ??
    resolve(repositoryRoot, 'node_modules/.cache/geospec-engine-native/packed-entry/consumer'),
  evidencePrefix = argument('--label') ?? process.env['GEOSPEC_CONFORMANCE_LABEL'] ?? 'node26-standalone',
  output = argument('--output') ??
    process.env['GEOSPEC_CONFORMANCE_OUTPUT'] ??
    resolve(repositoryRoot, 'out/reports/geospec-native'),
}: {
  consumer?: string;
  evidencePrefix?: string;
  output?: string;
} = {}): Promise<Node26Summary> => {
  if (process.versions.node.split('.')[0] !== '26') {
    throw new Error(`Node 26 is required; received ${process.version} at ${process.execPath}.`);
  }
  const packedConsumerDirectory = resolve(consumer);
  const outputDirectory = resolve(output);
  const packedRequire = createRequire(resolve(packedConsumerDirectory, 'package.json'));
  await mkdir(outputDirectory, { recursive: true });
  const nodeModulePath = packedRequire.resolve('@taucad/geospec-engine-native/node');
  const wasmModulePath = packedRequire.resolve('@taucad/geospec-engine-native/wasm');
  const packageManifestPath = packedRequire.resolve('@taucad/geospec-engine-native/package.json');
  const packageDirectory = dirname(packageManifestPath);
  const packageManifest = JSON.parse(await readFile(packageManifestPath, 'utf8')) as {
    imports?: { '#mixed-wasm-binding'?: unknown };
  };
  const wasmBindingExport = packageManifest.imports?.['#mixed-wasm-binding'];
  if (typeof wasmBindingExport !== 'string') {
    throw new TypeError('Packed package manifest has no string WASM binding import.');
  }
  const wasmBindingPath = resolve(packageDirectory, wasmBindingExport);
  const wasmBinaryPath = resolve(dirname(wasmBindingPath), 'geospec_engine_native.wasm');
  const nativeBinaryPath = packedRequire.resolve('@taucad/geospec-engine-native-darwin-arm64');
  const corpus = JSON.parse(await readFile(corpusPath, 'utf8')) as Corpus;
  const runner = (await import(new URL('../node/run-conformance.mjs', import.meta.url).href)) as {
    runEarlyCorpus: RunEarlyCorpus;
  };

  const nodeBinding = (await import(pathToFileURL(nodeModulePath).href)) as Binding;
  const nodeReport = await runner.runEarlyCorpus({
    binding: nodeBinding,
    host: `${evidencePrefix}-packed-node`,
    artifacts: [nodeModulePath, nativeBinaryPath],
    output: resolve(outputDirectory, `${evidencePrefix}-node-full.json`),
  });

  const wasmBinding = (await import(pathToFileURL(wasmModulePath).href)) as Binding & {
    initialize: (input: URL) => Promise<void>;
  };
  await wasmBinding.initialize(pathToFileURL(wasmBinaryPath));
  const wasmReport = await runner.runEarlyCorpus({
    binding: wasmBinding,
    host: `${evidencePrefix}-packed-wasm`,
    artifacts: [wasmModulePath, wasmBindingPath, wasmBinaryPath],
    output: resolve(outputDirectory, `${evidencePrefix}-wasm-full.json`),
  });

  const nodeValidation = validateReport(nodeReport, corpus);
  const wasmValidation = validateReport(wasmReport, corpus);
  const summary = {
    schemaVersion: 1,
    consumerDirectory: packedConsumerDirectory,
    runtime: {
      version: process.version,
      execPath: process.execPath,
      sha256: await fileSha256(process.execPath),
      versions: process.versions,
    },
    package: {
      manifestPath: packageManifestPath,
      manifestSha256: await fileSha256(packageManifestPath),
      nodeModulePath,
      wasmModulePath,
      nativeBinaryPath,
      wasmBindingPath,
      wasmBinaryPath,
    },
    routes: {
      node: {
        passed: nodeReport.passed,
        failed: nodeReport.failed,
        ...nodeValidation,
      },
      wasm: {
        passed: wasmReport.passed,
        failed: wasmReport.failed,
        ...wasmValidation,
      },
    },
  };
  await writeFile(
    resolve(outputDirectory, `${evidencePrefix}-summary.json`),
    `${JSON.stringify(summary, undefined, 2)}\n`,
  );
  const routes = Object.values(summary.routes);
  if (
    routes.some(
      (route) =>
        route.passed !== 320 ||
        route.failed !== 0 ||
        route.admissions !== 124 ||
        route.equivalentCanonicalGroups.some((group) => !group.passed),
    )
  ) {
    throw new Error('Packed Node or WASM conformance failed.');
  }
  return summary;
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const summary = await runNode26Packed();
  process.stdout.write(`${JSON.stringify(summary.routes)}\n`);
}
