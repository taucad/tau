/**
 * Fails the target when SSR output exceeds byte budgets, and when the chunks setup's first two steps load hold
 * three.js (onboarding S5 a; run on the client build with `--client`).
 *
 * Ratchet: lower `ssrBundleByteBudget` / `ssrIndexFileByteBudget` as the bundle
 * shrinks (see docs/research/ssr-bundle-audit.md).
 */
import { execSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/** `du -sk build/server` total; ~10.1 MiB observed (hybrid `ssr.external`: runtime and the active `.scad` kernel only). */
const ssrBundleByteBudget = 11 * 1024 * 1024;

/** Main SSR entry path — cap cold-parse surface even when code splits into `assets/`. */
const ssrIndexFileByteBudget = 3 * 1024 * 1024;
const forbiddenDreiCoreImport = '@react-three/drei/core/';
/** Every three.js build, minified or not, registers itself under this global name. */
const threeMarker = '__THREE__';

const scriptDirectory = fileURLToPath(new URL('.', import.meta.url));
const serverDirectory = join(scriptDirectory, '..', 'build', 'server');
const clientDirectory = join(scriptDirectory, '..', 'build', 'client');
const indexPath = join(serverDirectory, 'index.js');

const findJavaScriptFiles = (directory: string): string[] => {
  const entries = readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
    left.name.localeCompare(right.name),
  );
  const files: string[] = [];

  for (const entry of entries) {
    const filePath = join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...findJavaScriptFiles(filePath));
      continue;
    }

    if (entry.isFile() && filePath.endsWith('.js')) {
      files.push(filePath);
    }
  }

  return files;
};

export const findSsrFilesWithForbiddenDreiCoreImport = (directory: string): string[] => {
  return findJavaScriptFiles(directory).filter((filePath) =>
    readFileSync(filePath, 'utf8').includes(forbiddenDreiCoreImport),
  );
};

/** One entry of Vite's `.vite/manifest.json`, as far as this check reads it. */
export type ClientManifestChunk = Readonly<{ file: string; imports?: readonly string[] }>;

/** The source modules whose chunks setup's steps 1 and 2 load: the client entry, the root route and `/welcome`. */
export const welcomeEntryPatterns: readonly RegExp[] = [
  /(?:^|\/)entry\.client\.[jt]sx?(?:\?.*)?$/u,
  /(?:^|\/)app\/root\.[jt]sx?(?:\?.*)?$/u,
  /(?:^|\/)app\/routes\/welcome\/route\.[jt]sx?(?:\?.*)?$/u,
];

/**
 * The chunk files a page loads before any dynamic import: the entries' own chunks and everything they import
 * statically, transitively.
 *
 * @param manifest - The client build manifest, keyed by source path.
 * @param entries - The manifest keys to start from.
 * @returns The chunk files, sorted.
 */
export const staticChunkFiles = (
  manifest: Readonly<Record<string, ClientManifestChunk>>,
  entries: readonly string[],
): string[] => {
  const seen = new Set<string>();
  const files = new Set<string>();
  const pending = [...entries];
  while (pending.length > 0) {
    const key = pending.pop();
    if (key === undefined || seen.has(key)) {
      continue;
    }
    seen.add(key);
    const chunk = manifest[key];
    if (chunk === undefined) {
      continue;
    }
    files.add(chunk.file);
    pending.push(...(chunk.imports ?? []));
  }
  return [...files].toSorted();
};

/**
 * S5 (a): the chunks setup's steps 1 and 2 load that hold three.js. The live preview of step 3 is a dynamic import,
 * so it and the viewer stay out of this set.
 *
 * @param manifest - The client build manifest.
 * @param readChunk - Reads a chunk file's text, relative to the client build root.
 * @returns The offending chunk files; empty when the rule holds.
 * @throws When the manifest has no `/welcome` route, so a renamed route never passes by matching nothing.
 */
export const findWelcomeChunksWithThree = (
  manifest: Readonly<Record<string, ClientManifestChunk>>,
  readChunk: (file: string) => string,
): string[] => {
  const keys = Object.keys(manifest);
  const entries = keys.filter((key) => welcomeEntryPatterns.some((pattern) => pattern.test(key)));
  if (!entries.some((key) => welcomeEntryPatterns[2]?.test(key) === true)) {
    throw new Error('check-ssr-bundle-budget: the client manifest has no app/routes/welcome/route entry');
  }
  return staticChunkFiles(manifest, entries).filter((file) => readChunk(file).includes(threeMarker));
};

const checkWelcomeChunks = (): void => {
  const manifestPath = join(clientDirectory, '.vite', 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, ClientManifestChunk>;
  const offenders = findWelcomeChunksWithThree(manifest, (file) => readFileSync(join(clientDirectory, file), 'utf8'));
  if (offenders.length > 0) {
    console.error('Setup steps 1 and 2 load chunks that hold three.js (S5 a); move the import behind step 3:');
    for (const file of offenders) {
      console.error(`- ${file}`);
    }
    process.exit(1);
  }
  console.info('Welcome chunks OK: steps 1 and 2 load no three.js');
};

const checkSsrBundleBudget = (): void => {
  const forbiddenDreiCoreImportFiles = findSsrFilesWithForbiddenDreiCoreImport(serverDirectory);
  if (forbiddenDreiCoreImportFiles.length > 0) {
    console.error('SSR bundle contains forbidden Drei deep imports:');
    for (const filePath of forbiddenDreiCoreImportFiles) {
      console.error(`- ${filePath}`);
    }
    process.exit(1);
  }

  const sizeStdout = execSync(`du -sk ${serverDirectory}`, { encoding: 'utf8' }).trim();
  const sizeKib = Number(sizeStdout.split(/\s+/)[0]);
  if (Number.isNaN(sizeKib)) {
    console.error('check-ssr-bundle-budget: could not parse du output:', sizeStdout);
    process.exit(1);
  }

  const directoryBytes = sizeKib * 1024;
  if (directoryBytes > ssrBundleByteBudget) {
    console.error(
      `SSR bundle too large: ${directoryBytes} bytes (du -sk rounded) exceeds budget ${ssrBundleByteBudget} bytes`,
    );
    process.exit(1);
  }

  let indexBytes: number;
  try {
    indexBytes = statSync(indexPath).size;
  } catch (error) {
    console.error('check-ssr-bundle-budget: missing', indexPath, error);
    process.exit(1);
  }

  if (indexBytes > ssrIndexFileByteBudget) {
    console.error(`SSR index.js too large: ${indexBytes} bytes exceeds budget ${ssrIndexFileByteBudget} bytes`);
    process.exit(1);
  }

  console.info(
    `SSR bundle budget OK: ~${directoryBytes} bytes (server dir) <= ${ssrBundleByteBudget}; index.js ${indexBytes} bytes <= ${ssrIndexFileByteBudget}`,
  );
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--client')) {
    checkWelcomeChunks();
  } else {
    checkSsrBundleBudget();
  }
}
