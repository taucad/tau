/**
 * Build the files Worker into one ES module, reproducibly, and print its SHA-256.
 *
 * tau-cloud deploys this exact file with `cloudflare_workers_script`
 * (`content_file` + `content_sha256`), so the same Tau commit and lockfile must
 * give the same bytes on any machine: esbuild runs from the workspace root
 * (so its path comments are repository-relative), unminified, with no banner,
 * timestamp or inline source map. The map is written beside it and is not
 * deployed. The build refuses a bundle that calls a bucket write.
 *
 * Usage: node apps/files/scripts/bundle.mts
 */

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspaceRoot = path.resolve(projectRoot, '../..');

/** The deployed module's file name. */
export const bundleName = 'files-worker.mjs';

/**
 * Calls that would write, delete or enumerate through the bucket binding: none may appear in the bundle.
 *
 * tau-cloud refuses a bundle holding any of the literal substrings `.put(`, `.delete(`, `.list(` or
 * `createMultipartUpload`, whatever object the call is on, so these match each of those and more
 * (whitespace before the parenthesis, `resumeMultipartUpload`). A `Map#delete` or `Headers#delete`
 * is refused too: use another idiom.
 */
export const forbiddenBucketCalls: readonly RegExp[] = [
  /\.put\s*\(/u,
  /\.delete\s*\(/u,
  /\.list\s*\(/u,
  /createMultipartUpload/u,
  /resumeMultipartUpload/u,
];

/** The literal substrings tau-cloud's bundle check refuses. */
export const tauCloudForbiddenSubstrings: readonly string[] = ['.put(', '.delete(', '.list(', 'createMultipartUpload'];

/** One build's output, in memory. */
export type FilesBundle = Readonly<{ code: string; map: string; sha256: string }>;

/**
 * Build the Worker module without writing it.
 *
 * @returns The module text, its source map and the module's SHA-256 (hex).
 */
export const bundleFilesWorker = async (): Promise<FilesBundle> => {
  const result = await build({
    absWorkingDir: workspaceRoot,
    entryPoints: [path.join(projectRoot, 'src/files-worker.ts')],
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
  return { code, map, sha256: createHash('sha256').update(code, 'utf8').digest('hex') };
};

/**
 * The forbidden calls a module contains.
 *
 * @param code - The module text.
 * @returns The patterns found, as source text.
 */
export const bucketWrites = (code: string): readonly string[] =>
  forbiddenBucketCalls.filter((pattern) => pattern.test(code)).map((pattern) => pattern.source);

const main = async (): Promise<void> => {
  const bundle = await bundleFilesWorker();
  const writes = bucketWrites(bundle.code);
  if (writes.length > 0) {
    throw new Error(`The files Worker bundle contains a bucket write: ${writes.join(', ')}`);
  }
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
