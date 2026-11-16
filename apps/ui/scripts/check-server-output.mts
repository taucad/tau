#!/usr/bin/env node
/**
 * Server-output guard of the React Router 8 migration (Brain `research/react-router-8-migration-blueprint.md`,
 * RR0 and ruling RD8): no server output of a React Router build holds a browser-only asset.
 *
 * A server output is the `server/` directory beside a build's `client/` directory. In it the check fails on:
 * - a `.wasm` file: kernel and editor WASM is fetched by the browser, never by the server;
 * - a worker bundle: a `*.worker-<hash>.js` (or `*-worker-<hash>.js`) chunk, or the module graph a worker build
 *   emits (`tau-module-graph-<hash>.json`); either means the server graph reached a `?worker` import;
 * - a file also present in `client/assets`: the browser fetches it from the client output, so a second copy only
 *   grows the function.
 *
 * Each build is named with its kind:
 * - `--server <build>`: an `ssr: true` build (the web UI). Its `server/` must exist.
 * - `--spa <build>`: an `ssr: false` build (desktop, `tau serve`, docs). React Router 7 deletes its `server/` after
 *   prerendering, so an absent directory passes; one that is present is checked like any other.
 * Either kind fails when its `client/` directory is missing, so a build that never ran cannot pass by matching
 * nothing.
 *
 * Usage (after the builds):
 *   node apps/ui/scripts/check-server-output.mts --server apps/ui/build --spa apps/ui/desktop/build
 *
 * Exit codes:
 *   0  No server output holds a WASM file, a worker bundle or a client asset
 *   1  A violation, a missing build output, or bad arguments
 */
import { existsSync, readdirSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/** Whether a build renders on the server (`--server`) or is a prerendered or client-only SPA (`--spa`). */
export type BuildKind = 'server' | 'spa';

export type BuildOutput = Readonly<{ kind: BuildKind; directory: string }>;

/** The rule a server-output file breaks. */
export type ServerOutputRule = 'wasm' | 'worker' | 'client-asset';

export type ServerOutputViolation = Readonly<{ file: string; rule: ServerOutputRule }>;

/** A worker entry chunk: Tau names worker entries `*.worker.ts` or `*-worker.ts`, and Vite appends `-<hash>`. */
const workerBundlePattern = /[.-]worker-[\w-]{8,}\.[cm]?js$/u;
/** The module graph `createUiSourceAliasPlugin({ emitModuleGraph: true })` emits for each worker build only. */
const workerModuleGraphPattern = /^tau-module-graph-[\w-]{8,}\.json$/u;

const toPosix = (path: string): string => path.split(sep).join('/');

/**
 * Every file under a directory, as paths relative to it with `/` separators, sorted.
 *
 * @param directory - The directory to list.
 * @returns The relative file paths.
 */
export const listFiles = (directory: string): string[] =>
  readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => toPosix(relative(directory, join(entry.parentPath, entry.name))))
    .toSorted();

/**
 * Whether a file name is a worker bundle or a worker build's module graph.
 *
 * @param fileName - The file's base name.
 * @returns True for a worker build output.
 */
export const isWorkerBundle = (fileName: string): boolean =>
  workerBundlePattern.test(fileName) || workerModuleGraphPattern.test(fileName);

/**
 * The server-output files that break a rule. A file breaking more than one rule is reported once per rule.
 *
 * @param input - The server output's files and the client output's `assets/` files, both relative to their own
 *   directory with `/` separators.
 * @returns The violations, in file order.
 */
export const findServerOutputViolations = (input: {
  serverFiles: readonly string[];
  clientAssetFiles: readonly string[];
}): ServerOutputViolation[] => {
  const clientAssets = new Set(input.clientAssetFiles);
  return input.serverFiles.flatMap((file) => {
    const fileName = file.slice(file.lastIndexOf('/') + 1);
    const violations: ServerOutputViolation[] = [];
    if (fileName.endsWith('.wasm')) {
      violations.push({ file, rule: 'wasm' });
    }
    if (isWorkerBundle(fileName)) {
      violations.push({ file, rule: 'worker' });
    }
    if (file.startsWith('assets/') && clientAssets.has(file.slice('assets/'.length))) {
      violations.push({ file, rule: 'client-asset' });
    }
    return violations;
  });
};

/**
 * Parse `--server <build>` and `--spa <build>` pairs.
 *
 * @param args - The command-line arguments after the script.
 * @param cwd - The directory relative build paths resolve against.
 * @returns The builds, in argument order.
 * @throws On an unknown flag, a flag without a path, or no build at all.
 */
export const parseBuildArguments = (args: readonly string[], cwd: string): BuildOutput[] => {
  const builds: BuildOutput[] = [];
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const path = args[index + 1];
    if (flag !== '--server' && flag !== '--spa') {
      throw new Error(`check-server-output: expected --server or --spa, got ${flag}`);
    }
    if (path === undefined || path.startsWith('--')) {
      throw new Error(`check-server-output: ${flag} needs a build directory`);
    }
    builds.push({ kind: flag === '--server' ? 'server' : 'spa', directory: resolve(cwd, path) });
  }
  if (builds.length === 0) {
    throw new Error('check-server-output: name at least one build with --server or --spa');
  }
  return builds;
};

const ruleText: Record<ServerOutputRule, string> = {
  wasm: 'a WASM file',
  worker: 'a worker bundle',
  'client-asset': 'also in client/assets',
};

/**
 * Check one build's server output.
 *
 * @param build - The build and its kind.
 * @returns One message per problem; empty when the server output is clean or, for an SPA build, absent.
 */
export const checkBuildOutput = (build: BuildOutput): string[] => {
  const clientDirectory = join(build.directory, 'client');
  const serverDirectory = join(build.directory, 'server');
  if (!existsSync(clientDirectory)) {
    return [`${clientDirectory} is missing: run the build first`];
  }
  if (!existsSync(serverDirectory)) {
    return build.kind === 'server' ? [`${serverDirectory} is missing from an ssr: true build`] : [];
  }
  const clientAssetsDirectory = join(clientDirectory, 'assets');
  const violations = findServerOutputViolations({
    serverFiles: listFiles(serverDirectory),
    clientAssetFiles: existsSync(clientAssetsDirectory) ? listFiles(clientAssetsDirectory) : [],
  });
  return violations.map(({ file, rule }) => `${join(serverDirectory, file)}: ${ruleText[rule]}`);
};

const main = (): void => {
  let builds: BuildOutput[];
  try {
    builds = parseBuildArguments(process.argv.slice(2), process.cwd());
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
  const problems = builds.flatMap((build) => checkBuildOutput(build));
  if (problems.length > 0) {
    console.error(`Server output holds browser-only files (${problems.length}):`);
    for (const problem of problems) {
      console.error(`- ${problem}`);
    }
    process.exit(1);
  }
  for (const build of builds) {
    const present = existsSync(join(build.directory, 'server'));
    console.info(
      `Server output OK: ${join(build.directory, 'server')} ${present ? 'holds no WASM, worker bundle or client asset' : 'is absent (ssr: false)'}`,
    );
  }
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
