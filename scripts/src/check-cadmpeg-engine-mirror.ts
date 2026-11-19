/**
 * Prove that both dependency hosts serve every cadmpeg engine of each `cadmpeg-ts` version the workspace resolves.
 *
 * tau.new and staging load one engine per opened format from `blobs/sha256/<gzip sha256>` on their dependency host,
 * with the digests the installed `cadmpeg-ts/digests` states (cadmpeg engine delivery charter D2, D6, D8). So `main`
 * must never resolve a version whose gzip engines either host does not serve (I4). `ci.yml` runs this in its required
 * `Validate workspace` check, on the pull request and in the merge queue. With `--base-lockfile` it proves nothing
 * unless the resolved `cadmpeg-ts` versions differ from the base's, so only a bump pays for the download. Each blob is
 * fetched without following a redirect and checked for its byte length and SHA-256.
 *
 * A failure names the dispatch that mirrors the version: `dependency-files-publish.yml` on `main` with
 * `cadmpeg-version`, which writes the 13 gzip engines to staging, then production, and reads each back.
 *
 * Usage: node scripts/src/check-cadmpeg-engine-mirror.ts [--base-lockfile <pnpm-lock.yaml>]
 * Exit codes: 0 every engine served on both hosts, or no version change; 1 an engine not served or a refusal; 2 usage.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { load } from 'js-yaml';

const repoRoot = resolve(import.meta.dirname, '../..');

/** The dependency hosts the deployed UIs load engines from, production then staging. */
export const engineHosts = ['https://dependencies.tau.new/', 'https://dependencies.taucad.dev/'] as const;

type FileDigest = { readonly sha256: string; readonly byteLength: number };

/** The shape of `cadmpeg-ts/digests`: one entry per module id. */
export type EngineDigests = Readonly<Record<string, { readonly wasm: FileDigest; readonly gzip: FileDigest }>>;

/** One resolved `cadmpeg-ts`: its version and the workspace projects that install it. */
export type ResolvedVersion = { readonly version: string; readonly importers: readonly string[] };

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Every `cadmpeg-ts` version a pnpm lockfile resolves for a workspace project, with the projects that install it.
 *
 * @param lockfile - The text of a `pnpm-lock.yaml` (lockfile v9).
 * @returns The versions, sorted, each with its importers.
 * @throws When the text is not a lockfile with `importers`.
 */
export const resolvedVersions = (lockfile: string): ResolvedVersion[] => {
  const parsed: unknown = load(lockfile);
  if (!isRecord(parsed) || !isRecord(parsed['importers'])) {
    throw new Error('Not a pnpm lockfile with importers.');
  }
  const versions = new Map<string, string[]>();
  for (const [importer, entry] of Object.entries(parsed['importers'])) {
    for (const kind of ['dependencies', 'devDependencies', 'optionalDependencies']) {
      const dependencies = isRecord(entry) ? entry[kind] : undefined;
      const resolved = isRecord(dependencies) ? dependencies['cadmpeg-ts'] : undefined;
      const version = isRecord(resolved) ? resolved['version'] : undefined;
      if (typeof version === 'string') {
        // A peer-qualified version (`1.0.0(zod@4.1.0)`) names the same package bytes.
        const bare = version.replace(/\(.*$/u, '');
        versions.set(bare, [...(versions.get(bare) ?? []), importer]);
      }
    }
  }
  return [...versions]
    .map(([version, importers]) => ({ version, importers: importers.sort() }))
    .sort((left, right) => left.version.localeCompare(right.version));
};

/**
 * Load the digest map and the version of the `cadmpeg-ts` a workspace project installs.
 *
 * @param importer - The project's directory, relative to the repository root.
 * @returns The installed version and its digest map.
 */
export const installedEngines = async (
  importer: string,
): Promise<{ readonly version: string; readonly digests: EngineDigests }> => {
  const require = createRequire(join(repoRoot, importer, 'package.json'));
  const manifest = JSON.parse(await readFile(require.resolve('cadmpeg-ts/package.json'), 'utf8')) as {
    version: string;
  };
  const { digests } = (await import(pathToFileURL(require.resolve('cadmpeg-ts/digests')).href)) as {
    digests: EngineDigests;
  };
  return { version: manifest.version, digests };
};

/** How a check retries a blob that is not served yet or was cut off. */
export type RetryPolicy = { readonly attempts: number; readonly wait: (attempt: number) => Promise<void> };

const defaultRetry: RetryPolicy = {
  attempts: 3,
  wait: async (attempt) => {
    await setTimeout(attempt * 5000);
  },
};

const describeError = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** One attempt: undefined when the blob is served whole with its digest, else why not (and whether a retry helps). */
const fetchOnce = async (
  url: string,
  expected: FileDigest,
  transport: typeof fetch,
): Promise<{ readonly failure: string; readonly final?: boolean } | undefined> => {
  let response: Response;
  try {
    response = await transport(url, { redirect: 'error' });
  } catch (error) {
    return { failure: `could not be fetched: ${describeError(error)}` };
  }
  if (response.status !== 200 || response.body === null) {
    return { failure: `answered HTTP ${String(response.status)}` };
  }
  const hash = createHash('sha256');
  let byteLength = 0;
  try {
    for await (const chunk of response.body) {
      byteLength += chunk.byteLength;
      if (byteLength > expected.byteLength) {
        // Leaving the loop cancels the body.
        break;
      }
      hash.update(chunk);
    }
  } catch (error) {
    return { failure: `was cut off after ${String(byteLength)} bytes: ${describeError(error)}` };
  }
  if (byteLength !== expected.byteLength) {
    return {
      failure: `served ${byteLength > expected.byteLength ? 'more than' : String(byteLength)} bytes, not ${String(expected.byteLength)}`,
    };
  }
  if (hash.digest('hex') !== expected.sha256) {
    return { failure: `does not hash to ${expected.sha256}`, final: true };
  }
  return undefined;
};

/**
 * Prove that every host serves every gzip engine of a digest map, with its byte length and SHA-256.
 *
 * @param options - The digest map, the hosts and the transport.
 * @param options.digests - The installed `cadmpeg-ts/digests`.
 * @param options.hosts - The dependency hosts, each ending in `/`.
 * @param options.transport - The `fetch` to use.
 * @param options.retry - How often, and after how long, a blob that is not served yet or was cut off is fetched again.
 * @param options.concurrency - How many blobs are fetched at once.
 * @returns One line per engine a host does not serve, sorted.
 */
export const checkEngineMirror = async (options: {
  readonly digests: EngineDigests;
  readonly hosts: readonly string[];
  readonly transport: typeof fetch;
  readonly retry?: RetryPolicy;
  readonly concurrency?: number;
}): Promise<string[]> => {
  const retry = options.retry ?? defaultRetry;
  const requests = options.hosts.flatMap((host) =>
    Object.entries(options.digests).map(([id, { gzip }]) => ({
      id,
      url: `${host}blobs/sha256/${gzip.sha256}`,
      expected: gzip,
    })),
  );
  const failures: string[] = [];
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < requests.length) {
      const { id, url, expected } = requests[next++]!;
      let result: Awaited<ReturnType<typeof fetchOnce>> = { failure: 'was not fetched' };
      for (let attempt = 1; attempt <= retry.attempts; attempt++) {
        if (attempt > 1) {
          // oxlint-disable-next-line no-await-in-loop -- attempts are sequential by design
          await retry.wait(attempt - 1);
        }
        // oxlint-disable-next-line no-await-in-loop -- attempts are sequential by design
        result = await fetchOnce(url, expected, options.transport);
        if (result === undefined || result.final === true) {
          break;
        }
      }
      if (result !== undefined) {
        failures.push(`${id}: ${url} ${result.failure}`);
      }
    }
  };
  await Promise.all(Array.from({ length: options.concurrency ?? 4 }, worker));
  return failures.sort();
};

/** The dispatch that mirrors a version to both hosts. */
export const mirrorDispatch = (version: string): string =>
  `gh workflow run dependency-files-publish.yml --ref main -f cadmpeg-version=${version}`;

type Io = { readonly out: (line: string) => void; readonly err: (line: string) => void };

/** What the check reads and how it fetches; tests replace any of it. */
export type RunOptions = {
  /** The `fetch` to use; the global one by default. */
  readonly transport?: typeof fetch;
  /** How a blob that is not served yet is fetched again; three attempts by default. */
  readonly retry?: RetryPolicy;
  /** The dependency hosts; production and staging by default. */
  readonly hosts?: readonly string[];
  /** Read the workspace's own `pnpm-lock.yaml`. */
  readonly lockfile?: () => Promise<string>;
  /** Read the installed version and digests of one importer. */
  readonly installed?: typeof installedEngines;
};

const usage = 'Usage: node scripts/src/check-cadmpeg-engine-mirror.ts [--base-lockfile <pnpm-lock.yaml>]';

/**
 * Run the check.
 *
 * @param argv - The arguments after the script path.
 * @param io - Where to write results and diagnostics.
 * @param options - The transport, retry policy, hosts and sources to use instead of the defaults.
 * @returns The exit code.
 */
export const run = async (argv: readonly string[], io: Io, options: RunOptions = {}): Promise<number> => {
  const transport = options.transport ?? fetch;
  const readLockfile = options.lockfile ?? (async () => readFile(join(repoRoot, 'pnpm-lock.yaml'), 'utf8'));
  const readInstalled = options.installed ?? installedEngines;
  if (!(argv.length === 0 || (argv.length === 2 && argv[0] === '--base-lockfile'))) {
    io.err(usage);
    return 2;
  }
  try {
    const head = resolvedVersions(await readLockfile());
    if (argv.length === 2) {
      const base = resolvedVersions(await readFile(argv[1]!, 'utf8'));
      const names = (versions: readonly ResolvedVersion[]) => versions.map(({ version }) => version).join(', ');
      if (names(base) === names(head)) {
        io.out(`cadmpeg-ts resolves to ${names(head) || 'nothing'}, as on the base; no engine to prove.`);
        return 0;
      }
      io.out(`cadmpeg-ts changes from ${names(base) || 'nothing'} to ${names(head) || 'nothing'}.`);
    }
    let failed = false;
    for (const { version, importers } of head) {
      // oxlint-disable-next-line no-await-in-loop -- one version at a time keeps the output in order
      const installed = await readInstalled(importers[0]!);
      if (installed.version !== version) {
        io.err(
          `${importers[0]!} installs cadmpeg-ts ${installed.version}, but the lockfile resolves ${version}; run pnpm install.`,
        );
        failed = true;
        continue;
      }
      // oxlint-disable-next-line no-await-in-loop -- one version at a time keeps the output in order
      const failures = await checkEngineMirror({
        digests: installed.digests,
        hosts: options.hosts ?? engineHosts,
        transport,
        ...(options.retry ? { retry: options.retry } : {}),
      });
      const count = Object.keys(installed.digests).length;
      if (failures.length === 0) {
        io.out(`cadmpeg-ts ${version}: both hosts serve all ${String(count)} gzip engines with their digests.`);
        continue;
      }
      failed = true;
      io.err(
        `cadmpeg-ts ${version}: ${String(failures.length)} engine blobs are not served:\n  ${failures.join('\n  ')}`,
      );
      io.err(
        `Mirror cadmpeg-ts ${version} to both dependency hosts, then re-run this check: ${mirrorDispatch(version)} ` +
          `(Actions > Dependency files publish > Run workflow on main, cadmpeg-version ${version}).`,
      );
    }
    return failed ? 1 : 0;
  } catch (error) {
    io.err(describeError(error));
    return 1;
  }
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await run(process.argv.slice(2), {
    out: (line) => {
      process.stdout.write(`${line}\n`);
    },
    err: (line) => {
      process.stderr.write(`${line}\n`);
    },
  });
}
