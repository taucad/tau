#!/usr/bin/env node
/**
 * Engine-absence gate of the cadmpeg engine delivery charter (D16, I1): no web, `tau serve` or desktop renderer build
 * holds a cadmpeg engine. The browser fetches one engine per opened format, by digest, from its environment's
 * dependency host or the same origin; a build that carries one ships 13 to 37 MB per engine to every visitor.
 *
 * An engine is recognized by content, not by name: a file fails when its SHA-256 is the `wasm` or the `gzip` digest of
 * any module in the installed `cadmpeg-ts/digests` (resolved as `@taucad/cadmpeg` resolves it), so a renamed, hashed or
 * pre-gzipped copy is caught too. Only files whose byte length is one of those digests' lengths are hashed. Every
 * build directory must exist, so a build that never ran cannot pass by matching nothing.
 *
 * Usage (after the builds):
 *   node apps/ui/scripts/check-cadmpeg-engine-absence.mts apps/ui/build apps/ui/desktop/build apps/ui/serve/build
 *
 * Exit codes:
 *   0  No build holds a file with an installed engine digest
 *   1  A build holds one, a build directory is missing, or bad arguments
 */
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

type FileDigest = Readonly<{ sha256: string; byteLength: number }>;

/** The shape of `cadmpeg-ts/digests`: one entry per module id. */
export type EngineDigests = Readonly<Record<string, Readonly<{ wasm: FileDigest; gzip: FileDigest }>>>;

/** One engine file a build must not hold, keyed by byte length then SHA-256. */
export type EngineIndex = ReadonlyMap<number, ReadonlyMap<string, string>>;

export type EngineFinding = Readonly<{ file: string; engine: string }>;

/**
 * Index every engine file of a digest map by byte length, then by SHA-256.
 *
 * @param digests - The installed `cadmpeg-ts/digests`.
 * @returns For each byte length, the digests of that length and the engine each names (`sldprt_bg.wasm`, `sldprt_bg.wasm.gz`).
 */
export const indexEngineDigests = (digests: EngineDigests): EngineIndex => {
  const index = new Map<number, Map<string, string>>();
  for (const [id, { wasm, gzip }] of Object.entries(digests)) {
    for (const [file, digest] of [
      [`${id}_bg.wasm`, wasm],
      [`${id}_bg.wasm.gz`, gzip],
    ] as const) {
      const bySha = index.get(digest.byteLength) ?? new Map<string, string>();
      bySha.set(digest.sha256, file);
      index.set(digest.byteLength, bySha);
    }
  }
  return index;
};

/**
 * Load the digest map of the `cadmpeg-ts` that `@taucad/cadmpeg` installs.
 *
 * @param fromDirectory - A directory that resolves `@taucad/cadmpeg` (the UI app).
 * @returns The installed digest map.
 */
export const loadInstalledDigests = async (fromDirectory: string): Promise<EngineDigests> => {
  const plugin = createRequire(join(fromDirectory, 'package.json')).resolve('@taucad/cadmpeg/package.json');
  const file = createRequire(plugin).resolve('cadmpeg-ts/digests');
  const { digests } = (await import(pathToFileURL(file).href)) as { digests: EngineDigests };
  return digests;
};

const listFiles = (directory: string): string[] =>
  readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));

const sha256File = async (file: string): Promise<string> => {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) {
    hash.update(chunk as Uint8Array<ArrayBuffer>);
  }
  return hash.digest('hex');
};

/**
 * Find every file of a build directory whose content is an installed engine.
 *
 * @param directory - A build output directory.
 * @param index - The engine index.
 * @returns The files that are engines, relative to the directory, with the engine each one is.
 */
export const findEngineFiles = async (directory: string, index: EngineIndex): Promise<EngineFinding[]> => {
  const findings: EngineFinding[] = [];
  for (const file of listFiles(directory)) {
    const candidates = index.get(statSync(file).size);
    if (candidates === undefined) {
      continue;
    }
    // oxlint-disable-next-line no-await-in-loop -- one file at a time keeps memory flat; size-matched files are rare
    const engine = candidates.get(await sha256File(file));
    if (engine !== undefined) {
      findings.push({ file: relative(directory, file), engine });
    }
  }
  return findings.sort((left, right) => left.file.localeCompare(right.file));
};

/**
 * Check every build directory.
 *
 * @param directories - The build output directories.
 * @param index - The engine index.
 * @returns One line per problem: a missing directory or a file that is an engine.
 */
export const checkEngineAbsence = async (directories: readonly string[], index: EngineIndex): Promise<string[]> => {
  const problems: string[] = [];
  for (const directory of directories) {
    if (!existsSync(directory) || !statSync(directory).isDirectory()) {
      problems.push(`${directory}: build output is missing; run its build first`);
      continue;
    }
    // oxlint-disable-next-line no-await-in-loop -- builds are checked in order
    for (const { file, engine } of await findEngineFiles(directory, index)) {
      problems.push(`${join(directory, file)}: is the cadmpeg engine ${engine}`);
    }
  }
  return problems;
};

const main = async (): Promise<void> => {
  const directories = process.argv.slice(2).map((argument) => resolve(argument));
  if (directories.length === 0) {
    console.error('Usage: node apps/ui/scripts/check-cadmpeg-engine-absence.mts <build directory>…');
    process.exit(1);
  }
  const digests = await loadInstalledDigests(fileURLToPath(new URL('..', import.meta.url)));
  const index = indexEngineDigests(digests);
  const problems = await checkEngineAbsence(directories, index);
  if (problems.length > 0) {
    console.error(`cadmpeg engine-absence check failed (${String(problems.length)}):`);
    for (const problem of problems) {
      console.error(`- ${problem}`);
    }
    console.error(
      'Engines load by digest at run time (cadmpeg engine delivery charter I1); import only cadmpeg-ts/core, ' +
        'cadmpeg-ts/digests and cadmpeg-ts/formats.',
    );
    process.exit(1);
  }
  console.info(
    `cadmpeg engine-absence OK: ${directories.join(', ')} hold none of the ${String(Object.keys(digests).length)} installed engines (raw or gzip).`,
  );
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
