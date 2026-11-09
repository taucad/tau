/**
 * Build the R2 audit Worker into one ES module, reproducibly, and print its SHA-256.
 *
 * tau-cloud deploys this exact file with `cloudflare_workers_script` (`content_file` +
 * `content_sha256`, `modules/cloudflare-r2-audit`), so the same Tau commit and lockfile must give the
 * same bytes on any machine: esbuild runs from the workspace root (so its path comments are
 * repository-relative), unminified, with no banner, timestamp or inline source map. The map is
 * written beside it and is not deployed.
 *
 * Usage: node apps/r2-audit/scripts/bundle.mts
 */

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspaceRoot = path.resolve(projectRoot, '../..');

/** The built module's file name; tau-cloud commits it as `bundles/r2-audit-worker-<tau-sha12>.mjs`. */
export const bundleName = 'r2-audit-worker.mjs';

/** One build's output, in memory. */
export type AuditBundle = Readonly<{
  code: string;
  map: string;
  sha256: string;
}>;

/**
 * Build the Worker module without writing it.
 *
 * @returns The module text, its source map and the module's SHA-256 (hex).
 */
export const bundleAuditWorker = async (): Promise<AuditBundle> => {
  const result = await build({
    absWorkingDir: workspaceRoot,
    entryPoints: [path.join(projectRoot, 'src/r2-audit-worker.ts')],
    outfile: path.join(projectRoot, 'dist', bundleName),
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'neutral',
    target: 'es2024',
    conditions: ['workerd', 'worker', 'browser', 'import', 'default'],
    mainFields: ['module', 'main'],
    minify: false,
    sourcemap: 'external',
    legalComments: 'none',
    charset: 'utf8',
    logLevel: 'silent',
  });
  const code = result.outputFiles.find((file) => file.path.endsWith('.mjs'))?.text;
  const map = result.outputFiles.find((file) => file.path.endsWith('.map'))?.text;
  if (code === undefined || map === undefined) {
    throw new Error('esbuild produced no module');
  }
  return {
    code,
    map,
    sha256: createHash('sha256').update(code, 'utf8').digest('hex'),
  };
};

const main = async (): Promise<void> => {
  const bundle = await bundleAuditWorker();
  const outputDirectory = path.join(projectRoot, 'dist');
  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(path.join(outputDirectory, bundleName), bundle.code);
  writeFileSync(path.join(outputDirectory, `${bundleName}.map`), bundle.map);
  writeFileSync(path.join(outputDirectory, `${bundleName}.sha256`), `${bundle.sha256}  ${bundleName}\n`);
  console.log(
    `${path.relative(workspaceRoot, path.join(outputDirectory, bundleName))} sha256=${bundle.sha256} bytes=${String(Buffer.byteLength(bundle.code))}`,
  );
};

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(path.resolve(entry)).href) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
