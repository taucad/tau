/**
 * Exports the viewer parity fixture GLBs (Tau Brain `research/nanoraster-viewer-parity-charter.md`, W6, D3) from
 * tau-examples with the same evaluation and GLB export as the checked-in thumbnails (scripts/render-thumbnail.ts:
 * `document.export('glb', { content: { includeEdges: true } })`, PicoVoxel on its exact lane), one fresh runtime client
 * per example, each in its own process.
 *
 * Usage (from the repository root):
 *   pnpm exec tsx libs/tau-examples/scripts/export-parity-fixtures.mts [--out=<dir>] [--only=<kernel>/<example>,...]
 *
 * Without `--out` it regenerates the pinned fixtures in libs/tau-examples/fixtures/viewer-parity and rewrites their
 * `sha256` in fixtures.json; without `--only` it exports every tau-examples fixture the manifest lists. With `--out`
 * it writes <out>/<kernel>.<example>.glb and <out>/fixtures.json ({ name, glb, kernel, example, bytes, sha256 }).
 * Exports are not all byte-deterministic (replicad/bottle differed in bytes, not pixels, between two runs), so the
 * gate pins bytes instead of regenerating them.
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

delete process.env['NO_COLOR'];

const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), '..');
const kernelsDirectory = join(rootDirectory, 'src', 'kernels');
const pinnedDirectory = join(rootDirectory, 'fixtures', 'viewer-parity');
const manifestPath = join(pinnedDirectory, 'fixtures.json');
const argument = (name: string): string | undefined =>
  process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);

type ParityManifest = { fixtures: Array<{ name: string; source: string; sha256: string }> };
const readManifest = (): ParityManifest => JSON.parse(readFileSync(manifestPath, 'utf8')) as ParityManifest;
const isExampleSource = (source: string): boolean => /^[\da-z-]+\/[\da-z-]+$/.test(source);

const customOut = argument('out');
const out = customOut ?? pinnedDirectory;
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
    const child = spawnSync(
      process.execPath,
      ['--import', 'tsx', fileURLToPath(import.meta.url), '--isolated', `--out=${out}`, `--only=${key}`],
      { cwd: rootDirectory, stdio: 'inherit' },
    );
    if (child.status !== 0) {
      failures.push(`${key}: ${child.signal ?? child.status}`);
    }
  }
  const exported = keys.filter((key) => existsSync(fileFor(key)));
  if (customOut === undefined) {
    const manifest = readManifest();
    for (const fixture of manifest.fixtures) {
      if (exported.includes(fixture.source)) {
        fixture.sha256 = digest(readFileSync(fileFor(fixture.source)));
      }
    }
    writeFileSync(manifestPath, `${JSON.stringify(manifest, undefined, 2)}\n`);
  } else {
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
      };
    });
    writeFileSync(join(out, 'fixtures.json'), `${JSON.stringify(listing, undefined, 2)}\n`);
  }
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
