/**
 * Generates the viewer parity fixture GLBs (Tau Brain `research/nanoraster-viewer-parity-charter.md`, W6, D3) from
 * tau-examples with the same evaluation and GLB export as the checked-in thumbnails (scripts/render-thumbnail.ts:
 * `document.export('glb', { content: { includeEdges: true } })`, PicoVoxel on its exact lane), one fresh runtime client
 * per example, each in its own process. The GLBs are not committed: each parity run generates them once and feeds the
 * same files to the viewer capture and to nanoraster, which is what makes the comparison fair. Some exports are not
 * byte-deterministic (replicad/bottle differs in bytes, not pixels, between runs), so nothing pins their bytes.
 *
 * Usage (from the repository root):
 *   pnpm exec tsx libs/tau-examples/scripts/export-parity-fixtures.mts [--out=<dir>] [--only=<kernel>/<example>,...]
 *     [--force]
 *
 * Writes <out>/<kernel>.<example>.glb (default out: out/test-results/viewer-parity/fixtures, the paths
 * fixtures/viewer-parity/fixtures.json names) for every tau-examples fixture the manifest lists, or the `--only` ones,
 * and <out>/exported.json ({ name, glb, kernel, example, bytes, sha256, sourceSha256 }) as a record. A fixture whose
 * GLB exists and whose example source hash (every file in its example directory but the thumbnail) is unchanged is
 * kept unless `--force` is given.
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

delete process.env['NO_COLOR'];

const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), '..');
const kernelsDirectory = join(rootDirectory, 'src', 'kernels');
const manifestPath = join(rootDirectory, 'fixtures', 'viewer-parity', 'fixtures.json');
const defaultOut = join(rootDirectory, '..', '..', 'out', 'test-results', 'viewer-parity', 'fixtures');
const argument = (name: string): string | undefined =>
  process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);

type ParityManifest = { fixtures: Array<{ name: string; source: string }> };
const readManifest = (): ParityManifest => JSON.parse(readFileSync(manifestPath, 'utf8')) as ParityManifest;
const isExampleSource = (source: string): boolean => /^[\da-z-]+\/[\da-z-]+$/.test(source);

// Absolute: each example exports in a child process whose working directory is libs/tau-examples.
const out = resolve(argument('out') ?? defaultOut);
const force = process.argv.includes('--force');
const only = (argument('only') ?? '').split(',').filter(Boolean);
const keys =
  only.length > 0
    ? only
    : readManifest()
        .fixtures.map((fixture) => fixture.source)
        .filter((source) => isExampleSource(source));
const isolated = process.argv.includes('--isolated');
mkdirSync(out, { recursive: true });

type ManifestEntry = { kernel: string; name: string; mainFile?: string };
const entries = JSON.parse(readFileSync(join(rootDirectory, 'src', 'manifest.json'), 'utf8')) as ManifestEntry[];
const fileFor = (key: string): string => join(out, `${key.replace('/', '.')}.glb`);
const digest = (bytes: Uint8Array<ArrayBuffer>): string => createHash('sha256').update(bytes).digest('hex');
const sourceHashFor = (key: string): string => join(out, `${key.replace('/', '.')}.source.sha256`);

/** SHA-256 over the example directory's files (path and bytes, sorted), without its generated thumbnail. */
const exampleSourceHash = (key: string): string => {
  const directory = join(kernelsDirectory, key);
  const files = readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name !== 'thumbnail.webp')
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(relative(directory, file)).update('\0').update(readFileSync(file)).update('\0');
  }
  return hash.digest('hex');
};

const exportOne = async (key: string): Promise<void> => {
  const { asKnownArtifact } = await import('@taucad/runtime');
  const { createExampleRuntimeClient } = await import('#scripts/runtime.js');
  const entry = entries.find((candidate) => `${candidate.kernel}/${candidate.name}` === key);
  if (!entry?.mainFile) {
    throw new Error(`Unknown example or no main file: ${key}`);
  }
  const client = await createExampleRuntimeClient(kernelsDirectory);
  client.on('log', (logEntry) => {
    if (logEntry.level === 'error') {
      console.warn(`[runtime:${logEntry.level}] ${logEntry.message}`);
    }
  });
  const started = performance.now();
  const document = client.open({
    source: { path: `${key}/${entry.mainFile}` },
    watch: false,
    ...(entry.kernel === 'picovoxel' ? { evaluateOptions: { lane: 'exact' } } : {}),
  });
  try {
    const evaluated = await document.evaluation();
    if (evaluated.superseded || !evaluated.evaluation.success) {
      throw new Error(`Evaluation failed for ${key}`);
    }
    const view = evaluated.evaluation.views.some(({ id }) => id === 'model')
      ? document.view('model', { content: { includeEdges: true } })
      : document.view();
    let artifact: ReturnType<typeof asKnownArtifact>;
    try {
      const outcome = await view.rendering();
      artifact =
        !outcome.superseded && outcome.rendering.success ? asKnownArtifact(outcome.rendering.artifact) : undefined;
    } finally {
      view.close();
    }
    if (artifact?.mimeType === 'image/svg+xml') {
      throw new Error(`${key} is a 2D drawing, not a GLB fixture`);
    }
    const exported = await document.export('glb', { content: { includeEdges: true } });
    if (!exported.success) {
      throw new Error(`${key}: ${exported.issues.map((issue) => issue.message).join('; ')}`);
    }
    const glb = exported.files.find((file) => file.name.endsWith('.glb')) ?? exported.files.at(0);
    if (glb === undefined) {
      throw new Error(`${key}: export returned no file`);
    }
    writeFileSync(fileFor(key), glb.bytes);
    console.log(`${key}: ${glb.bytes.byteLength} bytes in ${((performance.now() - started) / 1000).toFixed(1)} s`);
  } finally {
    document.close();
    await client.shutdown();
  }
};

const exportAll = (): void => {
  const failures: string[] = [];
  for (const key of keys) {
    const sourceHash = exampleSourceHash(key);
    if (
      !force &&
      existsSync(fileFor(key)) &&
      existsSync(sourceHashFor(key)) &&
      readFileSync(sourceHashFor(key), 'utf8').trim() === sourceHash
    ) {
      console.log(`${key}: source unchanged, keeping ${fileFor(key)}`);
      continue;
    }
    const child = spawnSync(
      process.execPath,
      ['--import', 'tsx', fileURLToPath(import.meta.url), '--isolated', `--out=${out}`, `--only=${key}`],
      { cwd: rootDirectory, stdio: 'inherit' },
    );
    if (child.status === 0) {
      writeFileSync(sourceHashFor(key), `${sourceHash}\n`);
    } else {
      failures.push(`${key}: ${child.signal ?? child.status}`);
    }
  }
  const exported = keys.filter((key) => existsSync(fileFor(key)));
  const listing = exported.map((key) => {
    const bytes = readFileSync(fileFor(key));
    const [kernel, example] = key.split('/');
    return {
      name: key.replace('/', '.'),
      glb: fileFor(key),
      kernel,
      example,
      bytes: bytes.byteLength,
      sha256: digest(bytes),
      sourceSha256: existsSync(sourceHashFor(key)) ? readFileSync(sourceHashFor(key), 'utf8').trim() : undefined,
    };
  });
  writeFileSync(join(out, 'exported.json'), `${JSON.stringify(listing, undefined, 2)}\n`);
  console.log(`Exported ${exported.length}/${keys.length} fixtures to ${out}`);
  if (failures.length > 0) {
    console.error(`Failed:\n${failures.join('\n')}`);
    process.exitCode = 1;
  }
};

if (isolated) {
  await exportOne(keys[0]!);
} else {
  exportAll();
}
