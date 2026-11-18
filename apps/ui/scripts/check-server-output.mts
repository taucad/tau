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
 *   grows the function;
 * - an unresolved asset URL: a server chunk's `new URL('./<file>', import.meta.url)` that names no file in the server
 *   output and no file in `client/assets`. `@taucad/runtime/vite`'s asset plugin rewrites each such reference to an
 *   emitted, hashed asset; a source-tree path left behind (`./cad-smlibpy/api-align.md`) means it did not run for the
 *   server environment, as under React Router's Environment API build before RR5. Script sources the server never
 *   loads (`new URL('../runtime/runtime.worker.ts', …)` in a browser-only branch) are not assets and are skipped.
 *
 * `--external <specifier>` (with a `--server` build) also requires a server chunk to import that package by name: the
 * server environment's `resolve.external` (`uiSsrOptions` in `vite.config.ts`) was honoured. `@taucad/runtime` is
 * listed there but cannot be named here: its package exports point at TypeScript source, which Vite never
 * externalizes, so it is bundled on `main` too (RR5 finding).
 *
 * Each build is named with its kind:
 * - `--server <build>`: an `ssr: true` build (the web UI). Its `server/` must exist.
 * - `--spa <build>`: an `ssr: false` build (desktop, `tau serve`, docs). React Router 8 leaves its `server/` behind and
 *   the build's own `buildEnd` removes it (blueprint RR8), so nothing ships one: a `server/` that is present fails.
 * Either kind fails when its `client/` directory is missing, so a build that never ran cannot pass by matching
 * nothing.
 *
 * Usage (after the builds):
 *   node apps/ui/scripts/check-server-output.mts --server apps/ui/build --spa apps/ui/desktop/build \
 *     --external @taucad/openrscad
 *
 * Exit codes:
 *   0  No server output holds a WASM file, a worker bundle or a client asset
 *   1  A violation, a missing build output, or bad arguments
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, posix, relative, resolve, sep } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/** Whether a build renders on the server (`--server`) or is a prerendered or client-only SPA (`--spa`). */
export type BuildKind = 'server' | 'spa';

export type BuildOutput = Readonly<{ kind: BuildKind; directory: string }>;

/** The rule a server-output file breaks. */
export type ServerOutputRule = 'wasm' | 'worker' | 'client-asset' | 'unresolved-asset-url';

export type ServerOutputViolation = Readonly<{ file: string; rule: ServerOutputRule }>;

/** A worker entry chunk: Tau names worker entries `*.worker.ts` or `*-worker.ts`, and Vite appends `-<hash>`. */
const workerBundlePattern = /[.-]worker-[\w-]{8,}\.[cm]?js$/u;
/** The module graph `createUiSourceAliasPlugin({ emitModuleGraph: true })` emits for each worker build only. */
const workerModuleGraphPattern = /^tau-module-graph-[\w-]{8,}\.json$/u;

const toPosix = (path: string): string => path.split(sep).join('/');

/** A relative, file-URL-shaped asset reference in a built chunk, as Vite and `@taucad/runtime/vite` render it. */
const relativeAssetUrlPattern = /new URL\(["'](\.\.?\/[^"']+)["'],\s*import\.meta\.url\)/gu;
/** Script sources: a worker or module the code constructs by URL, never a server-read asset. */
const scriptSourcePattern = /\.[cm]?[jt]sx?$/u;
/** A built JavaScript chunk. */
const chunkPattern = /\.[cm]?js$/u;

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
    if (flag === '--external') {
      if (path === undefined || path.startsWith('--')) {
        throw new Error('check-server-output: --external needs a package specifier');
      }
      continue;
    }
    if (flag !== '--server' && flag !== '--spa') {
      throw new Error(`check-server-output: expected --server, --spa or --external, got ${flag}`);
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
  'unresolved-asset-url': 'names an asset in neither the server output nor client/assets',
};

/**
 * The asset URLs server chunks name that resolve to no file of the server output and no file of `client/assets`.
 *
 * @param input - The server output's files, the client output's `assets/` files (both relative, `/` separators) and
 *   a reader for a server file's text.
 * @returns One violation per unresolved reference, as `<chunk> -> <url>`.
 */
export const findUnresolvedAssetUrls = (input: {
  serverFiles: readonly string[];
  clientAssetFiles: readonly string[];
  readServerFile: (file: string) => string;
}): ServerOutputViolation[] => {
  const serverFiles = new Set(input.serverFiles);
  const clientAssetNames = new Set(input.clientAssetFiles.map((file) => file.slice(file.lastIndexOf('/') + 1)));
  return input.serverFiles
    .filter((file) => chunkPattern.test(file))
    .flatMap((chunk) => {
      const chunkDirectory = posix.dirname(chunk);
      return [...input.readServerFile(chunk).matchAll(relativeAssetUrlPattern)].flatMap(
        ([, url]): ServerOutputViolation[] => {
          const target = decodeURIComponent(url!);
          if (scriptSourcePattern.test(target)) {
            return [];
          }
          const resolved = posix.normalize(posix.join(chunkDirectory, target));
          if (serverFiles.has(resolved) || clientAssetNames.has(posix.basename(resolved))) {
            return [];
          }
          return [{ file: `${chunk} -> ${url!}`, rule: 'unresolved-asset-url' }];
        },
      );
    });
};

/**
 * The required external specifiers no server chunk imports by name.
 *
 * @param input - The specifiers, the server output's files and a reader for a server file's text.
 * @returns The specifiers no chunk imports, in input order.
 */
export const findMissingExternalImports = (input: {
  externals: readonly string[];
  serverFiles: readonly string[];
  readServerFile: (file: string) => string;
}): string[] => {
  const chunks = input.serverFiles.filter((file) => chunkPattern.test(file)).map((file) => input.readServerFile(file));
  return input.externals.filter((specifier) => {
    const escaped = specifier.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
    // A static import or re-export statement, or a dynamic import; not a specifier quoted in embedded text.
    const importPattern = new RegExp(
      String.raw`^(?:(?:import|export)\b[^\n]*?|\})\s*\bfrom\s*"${escaped}(?:/[^"]*)?";|^import\s*"${escaped}(?:/[^"]*)?";|\bimport\(\s*"${escaped}(?:/[^"]*)?"\s*\)`,
      'mu',
    );
    return !chunks.some((code) => importPattern.test(code));
  });
};

/**
 * Parse every `--external <specifier>` pair.
 *
 * @param args - The command-line arguments after the script.
 * @returns The specifiers, in argument order.
 */
export const parseExternalArguments = (args: readonly string[]): string[] =>
  args.flatMap((flag, index) => (flag === '--external' && index % 2 === 0 ? [args[index + 1] ?? ''] : []));

/**
 * Check one build's server output.
 *
 * @param build - The build and its kind.
 * @param externals - Specifiers a `--server` build's chunks must import by name.
 * @returns One message per problem; empty when the server output is clean or, for an SPA build, absent.
 */
export const checkBuildOutput = (build: BuildOutput, externals: readonly string[] = []): string[] => {
  const clientDirectory = join(build.directory, 'client');
  const serverDirectory = join(build.directory, 'server');
  if (!existsSync(clientDirectory)) {
    return [`${clientDirectory} is missing: run the build first`];
  }
  if (!existsSync(serverDirectory)) {
    return build.kind === 'server' ? [`${serverDirectory} is missing from an ssr: true build`] : [];
  }
  if (build.kind === 'spa') {
    return [`${serverDirectory} is left by an ssr: false build: its React Router config's buildEnd removes it (RR8)`];
  }
  const clientAssetsDirectory = join(clientDirectory, 'assets');
  const serverFiles = listFiles(serverDirectory);
  const clientAssetFiles = existsSync(clientAssetsDirectory) ? listFiles(clientAssetsDirectory) : [];
  const readServerFile = (file: string): string => readFileSync(join(serverDirectory, file), 'utf8');
  const violations = [
    ...findServerOutputViolations({ serverFiles, clientAssetFiles }),
    ...findUnresolvedAssetUrls({ serverFiles, clientAssetFiles, readServerFile }),
  ];
  const missingExternals = findMissingExternalImports({ externals, serverFiles, readServerFile });
  return [
    ...violations.map(({ file, rule }) => `${join(serverDirectory, file)}: ${ruleText[rule]}`),
    ...missingExternals.map(
      (specifier) => `${serverDirectory}: no chunk imports ${specifier} by name (bundled despite resolve.external)`,
    ),
  ];
};

const main = (): void => {
  let builds: BuildOutput[];
  try {
    builds = parseBuildArguments(process.argv.slice(2), process.cwd());
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
  const externals = parseExternalArguments(process.argv.slice(2));
  const problems = builds.flatMap((build) => checkBuildOutput(build, externals));
  if (problems.length > 0) {
    console.error(`Server output check failed (${problems.length}):`);
    for (const problem of problems) {
      console.error(`- ${problem}`);
    }
    process.exit(1);
  }
  for (const build of builds) {
    const present = existsSync(join(build.directory, 'server'));
    console.info(
      `Server output OK: ${join(build.directory, 'server')} ${present ? `holds no WASM, worker bundle or client asset, every asset URL resolves${build.kind === 'server' && externals.length > 0 ? `, and it imports ${externals.join(', ')} by name` : ''}` : 'is absent (ssr: false)'}`,
    );
  }
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
