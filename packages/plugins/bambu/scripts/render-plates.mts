#!/usr/bin/env -S node --import @oxc-node/core/register
/**
 * Renders the X1C build-plate and hotend GLBs from their Replicad sources.
 *
 * Exports each model under `models/x1c` to binary glTF with the built Tau CLI
 * (`tau export --ext=glb`), writes them to `src/assets/x1c-<id>.glb`, and
 * records a SHA-256 of the sources in `models/x1c/render.sha256`; the unit
 * tests fail when the sources change without a re-render.
 *
 * Prerequisite: `pnpm nx build cli` (the Nx target depends on it).
 *
 * Usage:
 *   pnpm nx run bambu:render-plates
 *
 * Exit codes:
 *   0 — every GLB and the source hash were written.
 *   1 — the CLI is missing or an export failed.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(import.meta.dirname, '..');
const repoRoot = resolve(packageRoot, '../../..');
const modelDirectory = join(packageRoot, 'models/x1c');
const assetDirectory = join(packageRoot, 'src/assets');
const cliPath = join(repoRoot, 'packages/cli/dist/bin/tau.mjs');

/** Where the recorded source hash lives. */
export const renderHashPath = join(modelDirectory, 'render.sha256');

/**
 * Coarser than the 0.02 mm default: keeps each GLB well under 300 KB while
 * text curves stay smooth at viewer scale.
 */
const exportOptions = { tessellation: { linearTolerance: 0.05, angularTolerance: 20 } };

const renders: ReadonlyArray<{ asset: string; source: string; params?: Record<string, string> }> = [
  ...['cool', 'engineering', 'high-temperature', 'textured-pei'].map((plate) => ({
    asset: `x1c-${plate}.glb`,
    source: 'plate.ts',
    params: { plate },
  })),
  { asset: 'x1c-hotend.glb', source: 'hotend.ts' },
];

/**
 * Hashes every model source and this script, which holds the export options.
 *
 * @returns Hex SHA-256 over each file's name and bytes, in name order.
 */
export const hashRenderInputs = async (): Promise<string> => {
  const names = await readdir(modelDirectory);
  const sources = names.filter((name) => name.endsWith('.ts')).toSorted();
  const inputs: Array<[name: string, path: string]> = [
    ...sources.map((source): [string, string] => [source, join(modelDirectory, source)]),
    ['render-plates.mts', join(import.meta.dirname, 'render-plates.mts')],
  ];
  const hash = createHash('sha256');
  for (const [name, path] of inputs) {
    // oxlint-disable-next-line no-await-in-loop -- Ordered reads keep the hash stable.
    hash.update(`${name}\0`).update(await readFile(path));
  }

  return hash.digest('hex');
};

const main = async (): Promise<void> => {
  if (!existsSync(cliPath)) {
    throw new Error(`Missing ${cliPath}; run pnpm nx build cli first.`);
  }

  for (const { asset, source, params } of renders) {
    execFileSync(
      process.execPath,
      [
        '--import',
        '@oxc-node/core/register',
        cliPath,
        'export',
        join(modelDirectory, source),
        '--ext=glb',
        `--export-options=${JSON.stringify(exportOptions)}`,
        ...(params ? [`--params=${JSON.stringify(params)}`] : []),
        `--output=${join(assetDirectory, asset)}`,
      ],
      // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variables are not camelCase
      { cwd: repoRoot, stdio: 'inherit', env: { ...process.env, NX_PREFER_NODE_STRIP_TYPES: 'true' } },
    );
  }

  await writeFile(renderHashPath, `${await hashRenderInputs()}\n`);
};

// Run only as the entry point; the unit tests import `hashRenderInputs`.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
