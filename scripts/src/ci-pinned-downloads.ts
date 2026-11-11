/**
 * Name the pinned third-party downloads a CI task graph makes, as Actions cache entries keyed by what they pin.
 *
 * The affected lanes of `ci.yml` fetched two pinned GitHub Releases assets on every run: the CPython and wheels a
 * Python kernel's `seed` target puts in `out/cache/<kernel id>-seed`, and the wasi-sdk `openscad-language:prepare`
 * compiles the OpenSCAD parser with. During a GitHub Releases outage those downloads failed 34 jobs in two days
 * (Brain research/ci-flake-classes.md, class 1, R3). Each lane restores these entries from the Actions cache before
 * it runs its tasks, and `ci-pinned-downloads.yml` saves them from `main`, so only a pin change reaches an origin.
 * The consuming scripts re-verify every byte against its pin on use, so the cache is an availability measure only.
 *
 * Every key is derived from the pin sources, never from a hand list:
 * - `kernel-seeds`: each project whose `seed` target runs `tau-python-kernel seed` into its default seed. The key
 *   digests every dependency-file integrity its `tau-plugin.json` pins for this host; the entry holds every such
 *   seed, so the lanes and the seeding workflow agree on one key whichever kernels a lane reaches.
 * - `wasi-sdk`: the archive `prepare-openscad-language-server.mts` pins for this host in `wasi-sdk.json`, keyed by
 *   its SHA-256. Only the archive is cached; the script re-hashes it before extracting.
 *
 * Given a task graph (`nx … --graph=<file>`), an entry is named only when a task in it fills that entry, so a lane
 * that runs neither task restores nothing. Given a project graph alone (`nx graph --file=<file>`), every entry is
 * named (the seeding workflow).
 *
 * Usage: node scripts/src/ci-pinned-downloads.ts --graph <file> [--host <platform-arch>]
 * Prints `GITHUB_OUTPUT` lines: `<entry>-key` (empty when the graph does not reach the entry) and `<entry>-path`
 * (newline-separated, relative to the workspace root) for each entry.
 * Exit codes: 0 success; 1 an unreadable graph or pin source; 2 usage.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

/** The parts of an Nx graph file this script reads. */
export type GraphFile = {
  readonly graph: {
    readonly nodes: Readonly<
      Record<
        string,
        {
          readonly data: {
            readonly root: string;
            readonly targets?: Readonly<Record<string, { readonly options?: { readonly command?: string } }>>;
          };
        }
      >
    >;
  };
  readonly tasks?: {
    readonly tasks: Readonly<
      Record<string, { readonly target: { readonly project: string; readonly target: string } }>
    >;
  };
};

/** One Actions cache entry: its key, and the paths it holds relative to the workspace root. */
export type CacheEntry = { readonly name: string; readonly key: string; readonly paths: readonly string[] };

/** The pinned dependency files of a `tau-plugin.json`, as far as the key needs them. */
type Manifest = {
  readonly dependencies: Readonly<
    Record<
      string,
      ReadonlyArray<{
        readonly target: { readonly os?: string; readonly arch?: string };
        readonly files: ReadonlyArray<{ readonly integrity: string }>;
      }>
    >
  >;
  readonly kernels: Readonly<Record<string, unknown>>;
};

type WasiSdkPins = {
  readonly archives: Readonly<Partial<Record<string, { readonly archive: string; readonly sha256: string }>>>;
};

const kernelSeedCommand = /\btau-python-kernel\.mts seed --package (\S+)$/u;
const wasiSdkScript = 'apps/libs/openscad-language/scripts/prepare-openscad-language-server.mts';
const wasiSdkPinsFile = 'apps/libs/openscad-language/scripts/wasi-sdk.json';

const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');

/** Every Python kernel seed the graph's projects fill, as `{ project, target, root }`. */
const kernelSeeders = (graph: GraphFile) =>
  Object.entries(graph.graph.nodes).flatMap(([project, { data }]) =>
    Object.entries(data.targets ?? {}).flatMap(([target, { options }]) => {
      const match = kernelSeedCommand.exec(options?.command ?? '');
      return match?.[1] === data.root ? [{ project, target, root: data.root }] : [];
    }),
  );

/** Every target that runs the wasi-sdk owner to build (not `--test`, which compiles nothing for wasm32). */
const wasiSdkUsers = (graph: GraphFile) =>
  Object.entries(graph.graph.nodes).flatMap(([project, { data }]) =>
    Object.entries(data.targets ?? {}).flatMap(([target, { options }]) => {
      const command = options?.command ?? '';
      return command.includes(wasiSdkScript) && !/\s--/u.test(command.slice(command.indexOf(wasiSdkScript)))
        ? [{ project, target }]
        : [];
    }),
  );

/** Whether the graph runs any of these tasks: always for a project graph, which has no task data. */
const reaches = (graph: GraphFile, tasks: ReadonlyArray<{ readonly project: string; readonly target: string }>) =>
  graph.tasks === undefined ||
  Object.values(graph.tasks.tasks).some(({ target }) =>
    tasks.some(({ project, target: name }) => target.project === project && target.target === name),
  );

/**
 * The pinned-download cache entries of a graph, each with an empty key when the graph runs no task that fills it.
 * @param graph - an Nx project graph, or a task graph with its project graph.
 * @param options - the workspace root the pin sources are read from, and the host (`<platform>-<arch>`).
 */
export const pinnedDownloads = (
  graph: GraphFile,
  options: { readonly root: string; readonly host: string },
): CacheEntry[] => {
  const { root, host } = options;
  const [os, arch] = host.split('-');
  const read = (path: string): string => readFileSync(resolve(root, path), 'utf8');

  const seeders = kernelSeeders(graph).toSorted((left, right) => left.root.localeCompare(right.root));
  const seeds = seeders.map(({ root: directory }) => {
    const manifest = JSON.parse(read(`${directory}/tau-plugin.json`)) as Manifest;
    const kernels = Object.keys(manifest.kernels);
    if (kernels.length !== 1) {
      throw new Error(`${directory}/tau-plugin.json declares ${String(kernels.length)} kernels; its seed needs one.`);
    }
    const pins = Object.values(manifest.dependencies)
      .flat()
      .filter(({ target }) => target.os === os && target.arch === arch)
      .flatMap(({ files }) => files.map(({ integrity }) => integrity))
      .toSorted();
    if (pins.length === 0) {
      throw new Error(`${directory}/tau-plugin.json pins no ${host} dependency file.`);
    }
    return { path: `out/cache/${kernels[0]}-seed`, pins };
  });
  const seedDigest = sha256(seeds.map(({ path, pins }) => `${path}\n${pins.join('\n')}\n`).join(''));

  const users = wasiSdkUsers(graph);
  const wasiSdk = users.length === 0 ? undefined : (JSON.parse(read(wasiSdkPinsFile)) as WasiSdkPins).archives[host];

  return [
    {
      name: 'kernel-seeds',
      key: seeds.length > 0 && reaches(graph, seeders) ? `ci-kernel-seeds-v1-${host}-${seedDigest}` : '',
      paths: seeds.map(({ path }) => path),
    },
    {
      name: 'wasi-sdk',
      key: wasiSdk !== undefined && reaches(graph, users) ? `ci-wasi-sdk-v1-${host}-${wasiSdk.sha256}` : '',
      paths: wasiSdk === undefined ? [] : [`out/cache/wasi-sdk/${wasiSdk.archive}`],
    },
  ];
};

/** The entries as `GITHUB_OUTPUT` lines. */
export const formatOutputs = (entries: readonly CacheEntry[]): string =>
  entries
    .flatMap(({ name, key, paths }) => [`${name}-key=${key}`, `${name}-path<<EOF`, ...paths, 'EOF'])
    .map((line) => `${line}\n`)
    .join('');

/** Run the CLI: returns the exit code and the text for stdout (code 0) or stderr. */
export const run = (
  argv: readonly string[],
  options: { readonly root: string; readonly host: string },
): { readonly code: number; readonly output: string } => {
  const usage = 'Usage: node scripts/src/ci-pinned-downloads.ts --graph <file> [--host <platform-arch>]';
  let graphPath: string | undefined;
  let { host } = options;
  for (let index = 0; index < argv.length; index += 2) {
    const [flag, value] = [argv[index], argv[index + 1]];
    if (value === undefined || (flag !== '--graph' && flag !== '--host')) {
      return { code: 2, output: usage };
    }
    if (flag === '--graph') {
      graphPath = value;
    } else {
      host = value;
    }
  }
  if (graphPath === undefined) {
    return { code: 2, output: usage };
  }
  try {
    const graph = JSON.parse(readFileSync(graphPath, 'utf8')) as GraphFile;
    return { code: 0, output: formatOutputs(pinnedDownloads(graph, { root: options.root, host })) };
  } catch (error) {
    return { code: 1, output: `ci-pinned-downloads: ${error instanceof Error ? error.message : String(error)}` };
  }
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { code, output } = run(process.argv.slice(2), {
    root: resolve(import.meta.dirname, '../..'),
    host: `${process.platform}-${process.arch}`,
  });
  (code === 0 ? process.stdout : process.stderr).write(code === 0 ? output : `${output}\n`);
  process.exitCode = code;
}
