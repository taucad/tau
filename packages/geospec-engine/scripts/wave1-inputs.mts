/**
 * Capture and verify the immutable GeoSpec v2 Wave-1 migration inputs.
 *
 * The continuity closeout requires the pre-OQ5 v8 corpus, migrated fixtures,
 * evidence snapshots, runtime/kernel inputs, native artifacts, and v1
 * reference engine to be content-addressed before implementation continues.
 * Authorized closeout differences live in a separate, exact-hash delta file.
 *
 * Usage:
 *   node packages/geospec-engine/scripts/wave1-inputs.mts --write
 *   node packages/geospec-engine/scripts/wave1-inputs.mts --write-v2
 *   node packages/geospec-engine/scripts/wave1-inputs.mts --verify
 *
 * Exit codes:
 *   0  Manifest written or all inputs verified.
 *   1  Invalid arguments, capture failure, or verification mismatch.
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import process from 'node:process';

type InputSource = 'git' | 'working-tree';

type InputEntry = {
  path: string;
  sha256: string;
  size: number;
  source: InputSource;
  sourcePath?: string;
};

type InputCategory = {
  fileCount: number;
  rootSha256: string;
  entries: InputEntry[];
};

type InputManifest = {
  schemaVersion: 1;
  capturedOn: string;
  sourceRevision: string;
  categories: Record<string, InputCategory>;
};

type AuthorizedDelta = {
  path: string;
  decision: 'OQ1' | 'OQ2' | 'OQ5' | 'OQ6' | 'C0' | 'C1' | 'C3' | 'C5' | 'OA1';
  baselineSha256: string;
  /** Null means the exact baseline file is intentionally absent. */
  // oxlint-disable-next-line no-restricted-types -- JSON distinguishes an authorized removal (`null`) from an omitted field.
  currentSha256: string | null;
  derivedFrom?: string;
  rationale: string;
};

type AuthorizedDeltas = {
  schemaVersion: 1;
  deltas: AuthorizedDelta[];
};

type InputVersionManifest = {
  schemaVersion: 1;
  inputVersion: 'wave1-2026-08-12.2';
  basis: string;
  sourceRevision: string;
  baseline: { path: string; sha256: string };
  authorizedDeltas: { path: string; sha256: string; count: number };
  removedPaths: string[];
  categories: Record<string, { fileCount: number; rootSha256: string }>;
};

const repoRoot = resolve(import.meta.dirname, '../../..');
const verificationRoot = resolve(repoRoot, 'packages/geospec-engine/verification');
const manifestPath = resolve(verificationRoot, 'wave1-input-baseline.json');
const deltasPath = resolve(verificationRoot, 'wave1-authorized-input-deltas.json');
const version2Path = resolve(verificationRoot, 'wave1-input-manifest-v2.json');
const captureDate = '2026-08-12';

const toRepoPath = (path: string): string => relative(repoRoot, path).split(sep).join('/');

const sha256 = (bytes: Uint8Array<ArrayBuffer> | string): string => createHash('sha256').update(bytes).digest('hex');

const runGit = (args: string[]): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(execFileSync('git', args, { cwd: repoRoot, encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 }));

const gitText = (args: string[]): string => new TextDecoder().decode(runGit(args)).trim();

const listWorkingTreeFiles = (root: string): string[] => {
  if (!existsSync(root)) {
    return [];
  }
  if (!statSync(root).isDirectory()) {
    return [toRepoPath(root)];
  }
  return readdirSync(root, { withFileTypes: true })
    .flatMap((entry) => listWorkingTreeFiles(join(root, entry.name)))
    .sort();
};

const listGitFiles = (revision: string, root: string): string[] => {
  const output = gitText(['ls-tree', '-r', '--name-only', revision, '--', root]);
  return output === '' ? [] : output.split('\n').sort();
};

const createEntry = (options: {
  path: string;
  bytes: Uint8Array<ArrayBuffer>;
  source: InputSource;
  sourcePath?: string;
}): InputEntry => ({
  path: options.path,
  sha256: sha256(options.bytes),
  size: options.bytes.byteLength,
  source: options.source,
  ...(options.sourcePath === undefined ? {} : { sourcePath: options.sourcePath }),
});

const gitCategory = (options: {
  revision: string;
  sourceRoot: string;
  targetRoot?: string;
  include?: (path: string) => boolean;
}): InputEntry[] => {
  const entries: InputEntry[] = [];
  for (const sourcePath of listGitFiles(options.revision, options.sourceRoot)) {
    if (options.include?.(sourcePath) === false) {
      continue;
    }
    const suffix = sourcePath.slice(options.sourceRoot.length);
    const path = `${options.targetRoot ?? options.sourceRoot}${suffix}`;
    entries.push(
      createEntry({
        path,
        bytes: runGit(['show', `${options.revision}:${sourcePath}`]),
        source: 'git',
        sourcePath,
      }),
    );
  }
  return entries;
};

const workingTreeCategory = (paths: string[]): InputEntry[] =>
  [...new Set(paths.flatMap((path) => listWorkingTreeFiles(resolve(repoRoot, path))))]
    .sort()
    .map((path) =>
      createEntry({ path, bytes: Uint8Array.from(readFileSync(resolve(repoRoot, path))), source: 'working-tree' }),
    );

const finalizeCategory = (entries: InputEntry[]): InputCategory => {
  const sorted = [...entries].sort((left, right) => left.path.localeCompare(right.path));
  const rootPayload = sorted.map((entry) => `${entry.path}\0${entry.sha256}\0${entry.size}\n`).join('');
  return { fileCount: sorted.length, rootSha256: sha256(rootPayload), entries: sorted };
};

const captureManifest = (): InputManifest => {
  const sourceRevision = gitText(['rev-parse', 'HEAD']);
  const corpus = gitCategory({
    revision: sourceRevision,
    sourceRoot: 'libs/tau-examples/src/kernels/replicad/v8-engine-rev2',
    include: (path) => path.endsWith('.ts'),
  });
  const fixtures = gitCategory({
    revision: sourceRevision,
    sourceRoot: 'packages/geospec/fixtures',
    targetRoot: 'packages/geospec-engine/fixtures',
  });
  const evidenceSnapshots = gitCategory({
    revision: sourceRevision,
    sourceRoot: 'packages/geospec/src/step/__evidence-snapshots__',
    targetRoot: 'packages/geospec-engine/src/step/__evidence-snapshots__',
  });
  const nativeArtifacts = workingTreeCategory(['packages/geospec-engine/native/opencascade']);
  const runtimeKernelInputs = workingTreeCategory([
    'packages/runtime/package.json',
    'packages/runtime/src/kernels/jscad',
    'packages/runtime/src/kernels/replicad',
    'packages/runtime/src/types/runtime-kernel.types.ts',
    'packages/runtime/src/utils/export-glb.ts',
    'packages/runtime/src/worker/runtime-definition.ts',
    'kernels/openscad/package.json',
    'kernels/openscad/src',
  ]);
  const referenceEngine = gitCategory({
    revision: sourceRevision,
    sourceRoot: 'packages/geospec',
  });

  const corpusTestCount = corpus.filter((entry) => entry.path.endsWith('.geospec.ts')).length;
  if (corpusTestCount !== 9) {
    throw new Error(`Expected exactly 9 v8 GeoSpec files, found ${corpusTestCount}.`);
  }
  if (evidenceSnapshots.length !== 44) {
    throw new Error(`Expected exactly 44 evidence snapshots, found ${evidenceSnapshots.length}.`);
  }

  return {
    schemaVersion: 1,
    capturedOn: captureDate,
    sourceRevision,
    categories: {
      corpus: finalizeCategory(corpus),
      fixtures: finalizeCategory(fixtures),
      evidenceSnapshots: finalizeCategory(evidenceSnapshots),
      nativeArtifacts: finalizeCategory(nativeArtifacts),
      runtimeKernelInputs: finalizeCategory(runtimeKernelInputs),
      referenceEngine: finalizeCategory(referenceEngine),
    },
  };
};

type Wave1JsonDocument = InputManifest | AuthorizedDeltas | InputVersionManifest;

const readJson = <T extends Wave1JsonDocument>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;

const currentBytes = (entry: InputEntry, sourceRevision: string): Uint8Array<ArrayBuffer> => {
  if (entry.source === 'git' && entry.path.startsWith('packages/geospec/')) {
    return runGit(['show', `${sourceRevision}:${entry.sourcePath ?? entry.path}`]);
  }
  return Uint8Array.from(readFileSync(resolve(repoRoot, entry.path)));
};

const readFrozenInputs = (): {
  manifest: InputManifest;
  authorized: AuthorizedDeltas;
  deltaByPath: Map<string, AuthorizedDelta>;
} => {
  const manifest = readJson<InputManifest>(manifestPath);
  const authorized = readJson<AuthorizedDeltas>(deltasPath);
  const deltaByPath = new Map(authorized.deltas.map((delta) => [delta.path, delta]));
  if (deltaByPath.size !== authorized.deltas.length) {
    throw new Error('Authorized input deltas contain duplicate paths.');
  }
  return { manifest, authorized, deltaByPath };
};

const verifyFrozenInputs = (): {
  manifest: InputManifest;
  authorized: AuthorizedDeltas;
  deltaByPath: Map<string, AuthorizedDelta>;
  inputCount: number;
} => {
  const { manifest, authorized, deltaByPath } = readFrozenInputs();

  const failures: string[] = [];
  const seen = new Set<string>();
  for (const category of Object.values(manifest.categories)) {
    for (const entry of category.entries) {
      seen.add(entry.path);
      let bytes: Uint8Array<ArrayBuffer>;
      try {
        bytes = currentBytes(entry, manifest.sourceRevision);
      } catch {
        const delta = deltaByPath.get(entry.path);
        if (delta?.baselineSha256 !== entry.sha256 || delta.currentSha256 !== null) {
          failures.push(`${entry.path}: missing`);
        }
        continue;
      }
      const currentSha256 = sha256(bytes);
      const delta = deltaByPath.get(entry.path);
      if (currentSha256 === entry.sha256) {
        if (delta !== undefined && delta.currentSha256 !== currentSha256) {
          failures.push(
            `${entry.path}: authorized delta expects ${String(delta.currentSha256)}, got baseline ${currentSha256}`,
          );
        }
        continue;
      }
      if (delta === undefined || delta.baselineSha256 !== entry.sha256 || delta.currentSha256 !== currentSha256) {
        failures.push(`${entry.path}: expected ${entry.sha256}, got ${currentSha256}`);
        continue;
      }
      if (delta.derivedFrom !== undefined) {
        const sourcePath = resolve(repoRoot, delta.derivedFrom);
        if (!existsSync(sourcePath)) {
          failures.push(`${entry.path}: declared source ${delta.derivedFrom} is missing`);
          continue;
        }
        const sourceSha256 = sha256(Uint8Array.from(readFileSync(sourcePath)));
        if (sourceSha256 !== currentSha256) {
          failures.push(
            `${entry.path}: ${currentSha256} does not match declared source ${delta.derivedFrom} (${sourceSha256})`,
          );
        }
      }
    }
  }
  for (const delta of authorized.deltas) {
    if (!seen.has(delta.path)) {
      failures.push(`${delta.path}: authorized delta does not name a baseline input`);
    }
  }
  if (failures.length > 0) {
    throw new Error(`Wave-1 frozen input verification failed:\n${failures.join('\n')}`);
  }
  return { manifest, authorized, deltaByPath, inputCount: seen.size };
};

const createVersion2Manifest = (options: {
  manifest: InputManifest;
  authorized: AuthorizedDeltas;
  deltaByPath: Map<string, AuthorizedDelta>;
}): InputVersionManifest => {
  const categories = Object.fromEntries(
    Object.entries(options.manifest.categories).map(([name, category]) => {
      const entries = category.entries.flatMap((entry) => {
        const delta = options.deltaByPath.get(entry.path);
        if (delta?.currentSha256 === null) {
          return [];
        }
        const bytes = currentBytes(entry, options.manifest.sourceRevision);
        return [
          createEntry({
            path: entry.path,
            bytes,
            source: entry.source,
            sourcePath: entry.sourcePath,
          }),
        ];
      });
      const current = finalizeCategory(entries);
      return [name, { fileCount: current.fileCount, rootSha256: current.rootSha256 }];
    }),
  );
  return {
    schemaVersion: 1,
    inputVersion: 'wave1-2026-08-12.2',
    basis:
      'Historical Wave-1 input baseline plus exact OA1/OQ1/OQ2/OQ5/OQ6/C0/C1/C3/C5 authorized deltas; the version-1 baseline remains immutable.',
    sourceRevision: options.manifest.sourceRevision,
    baseline: {
      path: toRepoPath(manifestPath),
      sha256: sha256(readFileSync(manifestPath)),
    },
    authorizedDeltas: {
      path: toRepoPath(deltasPath),
      sha256: sha256(readFileSync(deltasPath)),
      count: options.authorized.deltas.length,
    },
    removedPaths: options.authorized.deltas
      .filter((delta) => delta.currentSha256 === null)
      .map((delta) => delta.path)
      .sort(),
    categories,
  };
};

const verifyManifest = (): void => {
  const verified = verifyFrozenInputs();
  if (!existsSync(version2Path)) {
    throw new Error(`${toRepoPath(version2Path)} is missing; run --write-v2 after reviewing exact deltas`);
  }
  const expected = readJson<InputVersionManifest>(version2Path);
  const current = createVersion2Manifest(verified);
  if (JSON.stringify(current) !== JSON.stringify(expected)) {
    throw new Error('Wave-1 version-2 input manifest does not match the frozen baseline plus exact deltas.');
  }
  process.stdout.write(
    `✓ verified ${verified.inputCount} frozen Wave-1 inputs with ${verified.authorized.deltas.length} authorized deltas and exact version-2 roots\n`,
  );
};

const writeVersion2Manifest = (): void => {
  if (existsSync(version2Path)) {
    throw new Error(`${toRepoPath(version2Path)} already exists; remove it explicitly before recapturing`);
  }
  const verified = verifyFrozenInputs();
  writeFileSync(version2Path, `${JSON.stringify(createVersion2Manifest(verified), undefined, 2)}\n`);
  process.stdout.write(`✓ wrote exact Wave-1 version-2 input manifest\n`);
};

const writeManifest = (): void => {
  if (existsSync(manifestPath)) {
    throw new Error(`${toRepoPath(manifestPath)} already exists; remove it explicitly before recapturing`);
  }
  mkdirSync(dirname(manifestPath), { recursive: true });
  const manifest = captureManifest();
  writeFileSync(manifestPath, `${JSON.stringify(manifest, undefined, 2)}\n`);
  process.stdout.write(
    `✓ captured ${Object.values(manifest.categories).reduce((total, category) => total + category.fileCount, 0)} Wave-1 inputs at ${toRepoPath(manifestPath)}\n`,
  );
};

const main = (): void => {
  const [mode, ...rest] = process.argv.slice(2);
  if (rest.length > 0 || (mode !== '--write' && mode !== '--write-v2' && mode !== '--verify')) {
    throw new Error('Usage: wave1-inputs.mts --write | --write-v2 | --verify');
  }
  if (mode === '--write') {
    writeManifest();
    return;
  }
  if (mode === '--write-v2') {
    writeVersion2Manifest();
    return;
  }
  verifyManifest();
};

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Wave-1 input verification failed: ${message}\n`);
  process.exit(1);
}
