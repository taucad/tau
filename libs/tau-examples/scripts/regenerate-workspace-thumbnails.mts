/**
 * Regenerates `thumbnail.webp` for every project in a Tau workspace through the
 * same runtime, camera and encoder as the checked-in example thumbnails.
 *
 * Usage:
 *   TAU_PICOGK_RESOURCE_ROOT="$PWD/apps/desktop/resources/picogk" \
 *   TAU_BUILD123D_RESOURCE_ROOT="$PWD/apps/desktop/resources/python" \
 *   pnpm exec tsx libs/tau-examples/scripts/regenerate-workspace-thumbnails.mts \
 *     --workspace=<dir> --backup=<dir> --record=<file.json> [--only=<slug>,<slug>] [--timeout=<seconds>]
 *
 * Every existing thumbnail is copied into --backup before anything is written,
 * and a backup is never overwritten. A project that fails to evaluate or render,
 * has no main entry, or yields an image of the wrong size keeps its current file.
 * Each project renders in its own process, so native kernel memory is reclaimed.
 */

import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { createWorkspaceRuntimeClient } from '#scripts/runtime.js';
import { renderThumbnails, thumbnailOptions, thumbnailQuality } from '#scripts/render-thumbnail.js';

delete process.env['NO_COLOR'];

type Result = {
  readonly slug: string;
  readonly entryPath?: string;
  readonly status: 'written' | 'failed' | 'no-entry' | 'timeout';
  readonly bytesBefore?: number;
  readonly bytesAfter?: number;
  readonly seconds?: number;
  readonly error?: string;
};

const argument = (name: string): string | undefined =>
  process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const resultPrefix = 'THUMBNAIL_RESULT ';
const thumbnailFile = 'thumbnail.webp';
const scriptPath = fileURLToPath(import.meta.url);

/** Child: render one project and atomically replace its thumbnail. */
async function renderProject(projectDirectory: string, entryPath: string): Promise<Result> {
  const slug = basename(projectDirectory);
  const target = join(projectDirectory, thumbnailFile);
  const bytesBefore = existsSync(target) ? statSync(target).size : undefined;
  const client = await createWorkspaceRuntimeClient(projectDirectory);
  try {
    const [bytes] = await renderThumbnails(client, { label: slug, sourcePath: entryPath, lineWidths: [6] });
    const { width, height } = await sharp(Buffer.from(bytes!)).metadata();
    if (width !== thumbnailOptions.width || height !== thumbnailOptions.height) {
      throw new Error(`Rendered ${width}×${height}, expected ${thumbnailOptions.width}×${thumbnailOptions.height}`);
    }
    const temporary = `${target}.${process.pid}.tmp`;
    writeFileSync(temporary, bytes!);
    renameSync(temporary, target);
    return { slug, entryPath, status: 'written', bytesBefore, bytesAfter: bytes!.byteLength };
  } finally {
    await client.shutdown();
  }
}

const project = argument('project');
if (project) {
  const entryPath = argument('entry')!;
  let result: Result;
  try {
    result = await renderProject(project, entryPath);
  } catch (error) {
    result = {
      slug: basename(project),
      entryPath,
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    };
  }
  process.stdout.write(`${resultPrefix}${JSON.stringify(result)}\n`);
  process.exit(0);
}

const workspace = resolve(argument('workspace') ?? '');
const backup = resolve(argument('backup') ?? '');
const record = resolve(argument('record') ?? '');
if (!argument('workspace') || !argument('backup') || !argument('record')) {
  throw new Error('Usage: --workspace=<dir> --backup=<dir> --record=<file.json> [--only=<slugs>] [--timeout=<s>]');
}
const only = new Set(argument('only')?.split(',').filter(Boolean) ?? []);
const timeoutSeconds = Number(argument('timeout') ?? 600);

const projects = readdirSync(workspace)
  .filter((slug) => existsSync(join(workspace, slug, 'tau.json')) && (only.size === 0 || only.has(slug)))
  .sort();

// Back up every original before the first write.
let backedUp = 0;
for (const slug of projects) {
  const source = join(workspace, slug, thumbnailFile);
  const destination = join(backup, slug, thumbnailFile);
  if (existsSync(source) && !existsSync(destination)) {
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(source, destination);
    backedUp++;
  }
}
console.log(`Backed up ${backedUp} thumbnails to ${backup}; regenerating ${projects.length} projects`);

const results: Result[] = [];
for (const [index, slug] of projects.entries()) {
  const directory = join(workspace, slug);
  const manifest = JSON.parse(readFileSync(join(directory, 'tau.json'), 'utf8')) as {
    readonly assets?: { readonly main?: { readonly entryPath?: string } };
  };
  const entryPath = manifest.assets?.main?.entryPath;
  if (!entryPath) {
    results.push({ slug, status: 'no-entry' });
    continue;
  }
  const startedAt = performance.now();
  const child = spawnSync(
    process.execPath,
    ['--import', 'tsx', scriptPath, `--project=${directory}`, `--entry=${entryPath}`],
    {
      cwd: join(dirname(scriptPath), '..'),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: timeoutSeconds * 1000,
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  const seconds = Math.round((performance.now() - startedAt) / 100) / 10;
  const line = child.stdout
    .split('\n')
    .find((value) => value.startsWith(resultPrefix))
    ?.slice(resultPrefix.length);
  const result: Result = line
    ? { ...(JSON.parse(line) as Result), seconds }
    : {
        slug,
        entryPath,
        status: child.error && 'code' in child.error && child.error.code === 'ETIMEDOUT' ? 'timeout' : 'failed',
        seconds,
        error: child.error?.message ?? `exited ${child.signal ?? child.status} without a result`,
      };
  results.push(result);
  console.log(
    `[${index + 1}/${projects.length}] ${slug}: ${result.status}${result.error ? ` (${result.error.slice(0, 160)})` : ''}`,
  );
  // Keep a partial record so an interrupted run still says what changed.
  writeFileSync(record, `${JSON.stringify({ workspace, backup, results }, null, 2)}\n`);
}

const counts = Object.groupBy(results, (result) => result.status);
writeFileSync(
  record,
  `${JSON.stringify(
    {
      workspace,
      backup,
      settings: { ...thumbnailOptions, quality: thumbnailQuality, lineWidth: 6 },
      counts: Object.fromEntries(Object.entries(counts).map(([status, items]) => [status, items.length])),
      results,
    },
    null,
    2,
  )}\n`,
);
console.log(
  `Done: ${Object.entries(counts)
    .map(([status, items]) => `${items.length} ${status}`)
    .join(', ')}`,
);
