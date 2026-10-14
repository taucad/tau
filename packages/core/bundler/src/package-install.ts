import type { BundlerFileSystem } from '#package-artifact-cache.js';
import { parsePackageLock, serializePackageLock } from '#package-lock.js';
import { packageLockPath, packageManifestPath } from '#package-lock.types.js';
import type { PackageIssue, PackageLock } from '#package-lock.types.js';
import type { PackageManifestCommit } from '#package-manifest-commit.js';
import { isPackageName, isRecord } from '#package-registry.js';
import type { PackageRegistry } from '#package-registry.js';
import { resolveDependencyTree } from '#package-resolver.js';

/** One explicit Install or Upgrade of a project's packages. @public */
export type InstallPackagesInput = {
  readonly filesystem: BundlerFileSystem;
  /** Checked write through the owning filesystem authority, normally from createPackageManifestCommit. */
  readonly commit: PackageManifestCommit;
  /** `install` keeps locked versions that still satisfy package.json; `upgrade` resolves afresh. */
  readonly mode: 'install' | 'upgrade';
  /** `dependencies[name] = range`, as `npm install name@range`. Added names are always resolved afresh. */
  readonly add?: Readonly<Record<string, string>>;
  /** Names removed from `dependencies`, as `npm uninstall name`. */
  readonly remove?: readonly string[];
  /** In `upgrade` mode, the only names resolved afresh; omitted means every package. */
  readonly upgrade?: readonly string[];
  /** Packument source; defaults to the public npm registry. */
  readonly registry?: PackageRegistry;
  readonly signal: AbortSignal;
};

/** Outcome of installPackages. `lock` is absent when a refusal prevented any write. @public */
export type InstallPackagesResult = {
  readonly lock?: PackageLock;
  readonly manifestChanged: boolean;
  readonly lockChanged: boolean;
  /** Refusals, plus `install-script-skipped` warnings when a lock was written. */
  readonly issues: readonly PackageIssue[];
};

const refuse = (issue: PackageIssue): InstallPackagesResult => ({
  manifestChanged: false,
  lockChanged: false,
  issues: [issue],
});

const conflict = (message: string): PackageIssue => ({ code: 'manifest-conflict', message });

const readText = async (filesystem: BundlerFileSystem, path: string): Promise<string | undefined> =>
  (await filesystem.exists(path)) ? filesystem.readFile(path, 'utf8') : undefined;

// Re-serialize with the author's indentation and line endings, as npm does.
const formatManifest = (manifest: Record<string, unknown>, original: string): string => {
  const indent = /^\{\r?\n([\t ]+)/u.exec(original)?.[1] ?? 2;
  const newline = original.includes('\r\n') ? '\r\n' : '\n';
  return `${JSON.stringify(manifest, null, indent)}\n`.replaceAll('\n', newline);
};

const editDependencies = (
  manifest: Record<string, unknown>,
  add: Readonly<Record<string, string>>,
  remove: readonly string[],
): PackageIssue | undefined => {
  const current = manifest['dependencies'] ?? {};
  if (!isRecord(current)) {
    return conflict('package.json dependencies must be an object. Fix it by hand, then run Install.');
  }
  const invalid = [...Object.keys(add), ...remove].find((name) => !isPackageName(name));
  if (invalid !== undefined) {
    return conflict(`'${invalid}' is not an npm package name.`);
  }
  // Like npm, save the dependency map sorted by name.
  manifest['dependencies'] = Object.fromEntries(
    Object.entries({ ...current, ...add })
      .filter(([name]) => !remove.includes(name))
      .sort(([left], [right]) => left.localeCompare(right, 'en')),
  );
  return undefined;
};

/**
 * Install or upgrade a project's packages with npm semantics and write `package-lock.json` (lockfileVersion 3).
 * package.json is rewritten only when `add`/`remove` change it, preserving every other key. Writes are two ordered
 * checked writes: package.json against the bytes read, then the lock against its own bytes and the package.json just
 * written. A concurrent edit yields a `manifest-conflict` issue and leaves npm's recoverable state; running Install
 * again repairs it. Packages are not downloaded and scripts never run.
 * @param input - Filesystem, checked commit, mode, dependency edits and cancellation.
 * @returns The written lock, what changed, and issues.
 * @public
 */
export const installPackages = async (input: InstallPackagesInput): Promise<InstallPackagesResult> => {
  const { filesystem, commit, mode, signal } = input;
  const add = input.add ?? {};
  const remove = input.remove ?? [];
  signal.throwIfAborted();
  const manifestText = await readText(filesystem, packageManifestPath);
  if (manifestText === undefined) {
    return refuse(conflict('package.json is missing. Create the project package.json first, then run Install.'));
  }
  let manifest: unknown;
  try {
    manifest = JSON.parse(manifestText) as unknown;
  } catch {
    return refuse(conflict('package.json contains invalid JSON. Fix it, then run Install.'));
  }
  if (!isRecord(manifest)) {
    return refuse(conflict('package.json must contain an object. Fix it, then run Install.'));
  }
  let nextManifestText = manifestText;
  if (Object.keys(add).length > 0 || remove.length > 0) {
    const issue = editDependencies(manifest, add, remove);
    if (issue !== undefined) {
      return refuse(issue);
    }
    nextManifestText = formatManifest(manifest, manifestText);
  }

  const lockText = await readText(filesystem, packageLockPath);
  let previousLock: PackageLock | undefined;
  try {
    previousLock = lockText === undefined ? undefined : parsePackageLock(lockText);
  } catch {
    // An unreadable lock is replaced by a fresh resolution.
    previousLock = undefined;
  }
  const upgradeAll = mode === 'upgrade' && input.upgrade === undefined;
  const result = await resolveDependencyTree({
    manifest,
    ...(previousLock === undefined || upgradeAll ? {} : { previousLock }),
    upgrade: [...Object.keys(add), ...(mode === 'upgrade' ? (input.upgrade ?? []) : [])],
    ...(input.registry === undefined ? {} : { registry: input.registry }),
    signal,
  });
  if (result.lock === undefined) {
    return { manifestChanged: false, lockChanged: false, issues: result.issues };
  }
  const nextLockText = serializePackageLock(result.lock);
  const manifestChanged = nextManifestText !== manifestText;
  const lockChanged = nextLockText !== lockText;
  signal.throwIfAborted();
  if (
    manifestChanged &&
    !(await commit({ path: packageManifestPath, expected: manifestText, content: nextManifestText }))
  ) {
    return refuse(conflict('package.json changed during Install. Nothing was written; run Install again.'));
  }
  if (
    lockChanged &&
    !(await commit({
      path: packageLockPath,
      expected: lockText,
      content: nextLockText,
      preconditions: [{ path: packageManifestPath, expected: nextManifestText }],
    }))
  ) {
    return {
      manifestChanged,
      lockChanged: false,
      issues: [
        conflict(
          `${manifestChanged ? 'package.json was updated, but ' : ''}package.json or package-lock.json changed during Install, so the lock was not written. Run Install again.`,
        ),
      ],
    };
  }
  return { lock: result.lock, manifestChanged, lockChanged, issues: result.issues };
};
