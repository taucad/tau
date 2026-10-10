/**
 * Shared contracts for the project package lock (blueprint: docs/research/project-package-lock-blueprint.md).
 * Coordinator-owned: lanes import from here; changes go back through the coordinator.
 */

/** One row of a lockfileVersion 3 `packages` map, keyed by its `node_modules/<path>` location. @public */
export type PackageLockEntry = {
  /** Absent only on the root entry when package.json has no version. */
  readonly version?: string;
  /** Registry tarball URL; absent only on the root entry. */
  readonly resolved?: string;
  /** SRI string (`sha512-…`) of the tarball named by `resolved`. */
  readonly integrity?: string;
  readonly dependencies?: Readonly<Record<string, string>>;
  /** Root entry only; recorded so `npm ci` finds every manifest dependency in the lock. */
  readonly devDependencies?: Readonly<Record<string, string>>;
  readonly optionalDependencies?: Readonly<Record<string, string>>;
  readonly peerDependencies?: Readonly<Record<string, string>>;
  readonly peerDependenciesMeta?: Readonly<Record<string, Readonly<{ optional?: boolean }>>>;
  readonly engines?: Readonly<Record<string, string>>;
  readonly bin?: Readonly<Record<string, string>>;
  readonly license?: string;
  readonly os?: readonly string[];
  readonly cpu?: readonly string[];
  readonly dev?: boolean;
  readonly optional?: boolean;
  readonly devOptional?: boolean;
  /** Present only through a peer dependency, as npm writes it. */
  readonly peer?: boolean;
  readonly hasInstallScript?: boolean;
  /** Shipped inside another package's tarball; has no `resolved`/`integrity` of its own and is never fetched. */
  readonly inBundle?: boolean;
  /** The real package name: on the root entry it mirrors package.json; on an alias row (`npm:` spec) it names the package actually installed. */
  readonly name?: string;
};

/** A `package-lock.json` as npm 9+ writes it. The root project is the `""` key. @public */
export type PackageLock = {
  readonly name?: string;
  readonly version?: string;
  readonly lockfileVersion: 3;
  readonly requires: true;
  readonly packages: Readonly<Record<string, PackageLockEntry>>;
};

/** Stable codes a caller (person, agent, CI) can act on. @public */
export type PackageIssueCode =
  | 'package-not-locked'
  | 'package-not-installed'
  | 'lock-stale'
  | 'lock-invalid'
  | 'integrity-mismatch'
  | 'registry-unavailable'
  | 'no-matching-version'
  | 'peer-conflict'
  | 'unsupported-dependency-protocol'
  | 'package-unavailable-in-host'
  | 'install-script-skipped'
  | 'package-version-mismatch'
  | 'manifest-conflict';

/** One actionable diagnostic. `message` names the recovery. @public */
export type PackageIssue = {
  readonly code: PackageIssueCode;
  readonly message: string;
  /** Package name when the issue concerns one package. */
  readonly name?: string;
  /** `node_modules/<path>` when known. */
  readonly path?: string;
};

/** Lock-level install state Tau keeps beside the tree: `node_modules/.tau-install-state.json`. @public */
export type InstallState = {
  readonly schemaVersion: 1;
  /** `node_modules/<path>` → integrity materialised at that path. */
  readonly installed: Readonly<Record<string, string>>;
};

export const installStatePath = 'node_modules/.tau-install-state.json';
export const packageLockPath = 'package-lock.json';
export const packageManifestPath = 'package.json';
