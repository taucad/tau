import type { BundlerFileSystem } from '#package-artifact-cache.js';
import { installStatePath } from '#package-lock.types.js';
import type {
  InstallState,
  PackageIssue,
  PackageIssueCode,
  PackageLock,
  PackageLockEntry,
} from '#package-lock.types.js';
import { isRecord, stringRecord } from '#package-registry.js';
import { gunzip, readBoundedStream, readTarEntries } from '#tarball.js';
import type { TarEntry } from '#tarball.js';

import { assertRootedPath } from '@taucad/runtime/kernel';

/** Input to {@link materializePackages}. @public */
export type MaterializePackagesInput = {
  /** Project filesystem; `remove` enables clean reinstalls and pruning. */
  readonly filesystem: BundlerFileSystem;
  readonly lock: PackageLock;
  /** Tarball transport; defaults to the global `fetch`. */
  readonly fetch?: typeof fetch;
  readonly signal: AbortSignal;
  /** Called for each issue as it is found, in addition to the returned list. */
  readonly onIssue?: (issue: PackageIssue) => void;
};

/** Outcome of {@link materializePackages}; every list holds `node_modules/<path>` lock keys. @public */
export type MaterializePackagesResult = {
  /** Packages fetched, verified and extracted by this call. */
  readonly installed: readonly string[];
  /** Packages already present with the locked integrity; no network was used for them. */
  readonly skipped: readonly string[];
  readonly issues: readonly PackageIssue[];
};

type DownloadFailureCode = Extract<
  PackageIssueCode,
  'registry-unavailable' | 'integrity-mismatch' | 'package-not-installed'
>;
type Download =
  | { readonly files: readonly TarEntry[] }
  | { readonly code: DownloadFailureCode; readonly reason: string };

const maximumTarballBytes = 256 * 1024 * 1024;
const fetchTimeoutMilliseconds = 60_000;
const fetchAttempts = 3;
const digestAlgorithms = { sha512: 'SHA-512', sha384: 'SHA-384', sha256: 'SHA-256', sha1: 'SHA-1' } as const;
const recovery: Readonly<Record<DownloadFailureCode, string>> = {
  'registry-unavailable': 'Retry Install when online.',
  'integrity-mismatch': 'Nothing was written; check the registry or reinstall.',
  'package-not-installed': 'Nothing was written; the published tarball is not usable in Tau.',
};

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const byKey = ([left]: readonly [string, unknown], [right]: readonly [string, unknown]): number =>
  left < right ? -1 : 1;

// A state key may only name a package directory inside `node_modules`; anything else is a tampered file.
const isInstallPath = (path: string): boolean =>
  path.startsWith('node_modules/') &&
  path.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..' && !segment.includes('\\'));

const readState = async (filesystem: BundlerFileSystem): Promise<Map<string, string>> => {
  try {
    const state = JSON.parse(await filesystem.readFile(installStatePath, 'utf8')) as unknown;
    return isRecord(state) && state['schemaVersion'] === 1 && stringRecord(state['installed'])
      ? new Map(Object.entries(state['installed']).filter(([path]) => isInstallPath(path)))
      : new Map();
  } catch {
    // Missing or unreadable state only costs a reinstall.
    return new Map();
  }
};

const writeState = async (filesystem: BundlerFileSystem, installed: ReadonlyMap<string, string>): Promise<void> => {
  const state: InstallState = { schemaVersion: 1, installed: Object.fromEntries([...installed].toSorted(byKey)) };
  await filesystem.ensureDir('node_modules');
  await filesystem.writeFile(installStatePath, `${JSON.stringify(state, undefined, 2)}\n`);
};

// Verify bytes against an SRI string with its strongest supported algorithm.
const integrityMatches = async (bytes: Uint8Array<ArrayBuffer>, integrity: string): Promise<boolean> => {
  const hashes = integrity
    .split(/\s+/u)
    .map((token) => /^(sha512|sha384|sha256|sha1)-([A-Za-z\d+/]+={0,2})$/u.exec(token))
    .filter((match) => match !== null);
  const strongest = Object.entries(digestAlgorithms).find(([name]) => hashes.some(([, hash]) => hash === name));
  if (strongest === undefined) {
    return false;
  }
  const [algorithm, webCryptoName] = strongest;
  const digest = new Uint8Array(await crypto.subtle.digest(webCryptoName, bytes));
  // oxlint-disable-next-line no-restricted-globals -- bundler-core has no base64 dependency; btoa exists in every host it targets
  const actual = btoa(String.fromCodePoint(...digest));
  return hashes.some(([, hash, value]) => hash === algorithm && value === actual);
};

const delay = async (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

// Same bounded retry rules as the registry client: transport errors, 429 and 5xx retry; other statuses do not.
const fetchTarball = async (input: {
  readonly url: string;
  readonly fetch: typeof fetch;
  readonly signal: AbortSignal;
}): Promise<Uint8Array<ArrayBuffer>> => {
  let failure = 'no response';
  for (let attempt = 0; attempt < fetchAttempts; attempt += 1) {
    if (attempt > 0) {
      // ponytail: backoff ignores abort for at most 200 ms; the signal is checked right after.
      // oxlint-disable-next-line no-await-in-loop -- bounded retry backoff avoids hammering the registry
      await delay(100 * 2 ** (attempt - 1));
      input.signal.throwIfAborted();
    }
    try {
      // oxlint-disable-next-line no-await-in-loop -- bounded sequential tarball retries
      const response = await input.fetch(input.url, {
        signal: AbortSignal.any([input.signal, AbortSignal.timeout(fetchTimeoutMilliseconds)]),
        credentials: 'omit',
      });
      if (response.ok && response.body !== null) {
        // oxlint-disable-next-line no-await-in-loop -- consume the successful response
        return await readBoundedStream(response.body, maximumTarballBytes);
      }
      failure = `HTTP ${response.status}`;
      if (response.status !== 429 && response.status < 500) {
        break;
      }
    } catch (error) {
      input.signal.throwIfAborted();
      failure = errorMessage(error);
    }
  }
  throw new Error(failure);
};

// Fetch, verify and unpack one tarball in memory; nothing touches the filesystem until this succeeds.
const download = async (input: {
  readonly url: string;
  readonly integrity: string;
  readonly fetch: typeof fetch;
  readonly signal: AbortSignal;
}): Promise<Download> => {
  let tarball: Uint8Array<ArrayBuffer>;
  try {
    tarball = await fetchTarball(input);
  } catch (error) {
    input.signal.throwIfAborted();
    return { code: 'registry-unavailable', reason: `tarball download failed (${errorMessage(error)})` };
  }
  if (!(await integrityMatches(tarball, input.integrity))) {
    return { code: 'integrity-mismatch', reason: 'tarball does not match the integrity in package-lock.json' };
  }
  try {
    const { entries } = readTarEntries(await gunzip(tarball));
    if (!entries.some((file) => file.path === 'package.json')) {
      throw new Error('it has no package.json');
    }
    return { files: entries };
  } catch (error) {
    return { code: 'package-not-installed', reason: `tarball could not be extracted (${errorMessage(error)})` };
  }
};

const writePackage = async (input: {
  readonly filesystem: BundlerFileSystem;
  readonly path: string;
  readonly files: readonly TarEntry[];
}): Promise<void> => {
  const { filesystem, path, files } = input;
  if (filesystem.remove !== undefined && (await filesystem.exists(path))) {
    await filesystem.remove(path);
  }
  // ponytail: package.json is written last, so its presence (the warm check) implies a complete extraction.
  const ordered = files.toSorted(
    (left, right) => Number(left.path === 'package.json') - Number(right.path === 'package.json'),
  );
  const directories = new Set([path, ...ordered.map((file) => `${path}/${file.path}`.replace(/\/[^/]+$/u, ''))]);
  for (const directory of directories) {
    // oxlint-disable-next-line no-await-in-loop -- sequential filesystem writes
    await filesystem.ensureDir(directory);
  }
  for (const file of ordered) {
    // oxlint-disable-next-line no-await-in-loop -- sequential writes keep package.json last
    await filesystem.writeFile(`${path}/${file.path}`, file.bytes);
  }
};

// Packages constrained to an OS or CPU are native builds, which the browser host cannot run.
const isNative = (entry: PackageLockEntry): boolean => (entry.os?.length ?? 0) > 0 || (entry.cpu?.length ?? 0) > 0;

const packageName = (path: string): string => path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length);

/**
 * Materialise a `package-lock.json` into `node_modules/` from registry tarballs verified against the lock's
 * `integrity` before anything is written. Packages whose integrity is already recorded in
 * `node_modules/.tau-install-state.json` and whose `package.json` exists are not fetched again. Lifecycle
 * scripts are never run. Per-package failures are reported as issues so the rest of the tree still installs.
 *
 * Without `filesystem.remove`, a changed package is overwritten in place, so files the new version no longer
 * ships remain, and paths dropped from the lock are reported instead of pruned.
 * @param input - Filesystem, lock, cancellation and optional transport.
 * @returns Installed and skipped lock paths, plus every issue found.
 * @throws {Error} Only when `input.signal` aborts or the filesystem itself fails.
 * @public
 */
export const materializePackages = async (input: MaterializePackagesInput): Promise<MaterializePackagesResult> => {
  const { filesystem, lock, signal } = input;
  const transport = input.fetch ?? globalThis.fetch;
  const installed: string[] = [];
  const skipped: string[] = [];
  const issues: PackageIssue[] = [];
  const report = (issue: PackageIssue): void => {
    issues.push(issue);
    input.onIssue?.(issue);
  };
  const state = await readState(filesystem);

  for (const path of [...state.keys()].filter((key) => !Object.hasOwn(lock.packages, key))) {
    if (filesystem.remove === undefined) {
      report({
        code: 'lock-stale',
        path,
        name: packageName(path),
        message: `'${path}' is no longer in package-lock.json but this filesystem cannot remove it. Delete it manually.`,
      });
      continue;
    }
    // oxlint-disable-next-line no-await-in-loop -- prune sequentially so the recorded state matches the tree
    if (await filesystem.exists(path)) {
      // oxlint-disable-next-line no-await-in-loop -- see above
      await filesystem.remove(path);
    }
    state.delete(path);
    // oxlint-disable-next-line no-await-in-loop -- persist after each change so an interrupted run resumes cleanly
    await writeState(filesystem, state);
  }

  // Sorted keys put every parent before its nested `node_modules`, so a parent reinstall that removes its
  // directory is followed by its children noticing their missing `package.json`.
  for (const [path, entry] of Object.entries(lock.packages).toSorted(byKey)) {
    signal.throwIfAborted();
    const name = packageName(path);
    if (path === '') {
      continue;
    }
    try {
      assertRootedPath(path);
    } catch {
      report({ code: 'lock-invalid', path, name, message: `Lock key '${path}' is not a confined node_modules path.` });
      continue;
    }
    // Bundled dependencies arrive inside their parent's tarball; workspace links are not installed.
    if (!path.startsWith('node_modules/') || entry.inBundle === true) {
      continue;
    }
    if (entry.hasInstallScript === true) {
      report({
        code: 'install-script-skipped',
        path,
        name,
        message: `'${name}' declares install scripts; Tau never runs them. Run them yourself if the package needs them.`,
      });
    }
    const unavailable = (reason: string): PackageIssue => ({
      code: 'package-unavailable-in-host',
      path,
      name,
      message: `'${name}' was not installed: ${reason}. Imports of it fail in Tau.`,
    });
    if (isNative(entry)) {
      report(unavailable('it is a native build for a specific OS or CPU'));
      continue;
    }
    const { resolved, integrity } = entry;
    if (resolved === undefined || integrity === undefined) {
      report({
        code: 'lock-invalid',
        path,
        name,
        message: `Lock entry '${path}' has no tarball or integrity. Run Install again.`,
      });
      continue;
    }
    // oxlint-disable-next-line no-await-in-loop -- warm check before any network use
    if (state.get(path) === integrity && (await filesystem.exists(`${path}/package.json`))) {
      skipped.push(path);
      continue;
    }
    // oxlint-disable-next-line no-await-in-loop -- install one verified package at a time
    const fetched = await download({ url: resolved, integrity, fetch: transport, signal });
    if (!('files' in fetched)) {
      report(
        entry.optional === true
          ? unavailable(fetched.reason)
          : { code: fetched.code, path, name, message: `'${name}' ${fetched.reason}. ${recovery[fetched.code]}` },
      );
      continue;
    }
    // oxlint-disable-next-line no-await-in-loop -- see above
    await writePackage({ filesystem, path, files: fetched.files });
    state.set(path, integrity);
    // oxlint-disable-next-line no-await-in-loop -- persist after each package so an interrupted install resumes
    await writeState(filesystem, state);
    installed.push(path);
  }
  return { installed, skipped, issues };
};
