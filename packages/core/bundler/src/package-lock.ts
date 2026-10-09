import type { BundlerFileSystem } from '#package-artifact-cache.js';
import { packageLockPath } from '#package-lock.types.js';
import type { PackageIssue, PackageLock, PackageLockEntry } from '#package-lock.types.js';
import { isRecord, stringRecord } from '#package-registry.js';

/** Root manifest maps npm compares against the lock's root entry. */
const rootDependencyFields = ['dependencies', 'devDependencies', 'optionalDependencies'] as const;

const recordFields = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
  'engines',
  'bin',
] as const;
const stringFields = ['name', 'version', 'resolved', 'integrity', 'license'] as const;
const booleanFields = ['dev', 'optional', 'devOptional', 'peer', 'hasInstallScript', 'inBundle'] as const;
const listFields = ['os', 'cpu'] as const;

const segment = String.raw`(?:@[^/\s]+/)?[^/\s@.][^/\s]*`;
const lockPathPattern = new RegExp(`^node_modules/${segment}(?:/node_modules/${segment})*$`, 'u');

/**
 * `json-stringify-nice` with npm's `swKeyOrder`: preferred keys first, then scalars, then objects,
 * each group sorted with `localeCompare(…, 'en')` at every depth. Arrays count as scalars and keep their order.
 */
const npmKeyOrder = [
  'name',
  'version',
  'lockfileVersion',
  'resolved',
  'integrity',
  'requires',
  'packages',
  'dependencies',
];

const isObject = (value: unknown): value is Record<string, unknown> => isRecord(value);

const compareKeys = (left: string, right: string): number => {
  const leftIndex = npmKeyOrder.indexOf(left);
  const rightIndex = npmKeyOrder.indexOf(right);
  if (leftIndex !== -1 || rightIndex !== -1) {
    return leftIndex === -1 ? 1 : rightIndex === -1 ? -1 : leftIndex - rightIndex;
  }
  return left.localeCompare(right, 'en');
};

const npmOrder = (_key: string, value: unknown): unknown => {
  if (!isObject(value)) {
    return value;
  }
  const entries = Object.entries(value).sort(([leftKey, leftValue], [rightKey, rightValue]) =>
    isObject(leftValue) === isObject(rightValue) ? compareKeys(leftKey, rightKey) : isObject(leftValue) ? 1 : -1,
  );
  return Object.fromEntries(entries);
};

const readEntry = (path: string, value: unknown): PackageLockEntry => {
  if (!isRecord(value)) {
    throw new TypeError(`Lock entry '${path}' must be an object.`);
  }
  if (value['link'] === true) {
    throw new TypeError(`Lock entry '${path}' is a linked workspace package, which Tau does not install.`);
  }
  const entry: Record<string, unknown> = {};
  for (const field of stringFields) {
    if (value[field] !== undefined) {
      if (typeof value[field] !== 'string') {
        throw new TypeError(`Lock entry '${path}' has a non-string '${field}'.`);
      }
      entry[field] = value[field];
    }
  }
  for (const field of recordFields) {
    if (value[field] !== undefined) {
      if (!stringRecord(value[field])) {
        throw new TypeError(`Lock entry '${path}' has an invalid '${field}' map.`);
      }
      entry[field] = value[field];
    }
  }
  for (const field of booleanFields) {
    if (value[field] === true) {
      entry[field] = true;
    }
  }
  for (const field of listFields) {
    const list = value[field];
    if (list !== undefined) {
      if (!Array.isArray(list) || !list.every((item) => typeof item === 'string')) {
        throw new TypeError(`Lock entry '${path}' has an invalid '${field}' list.`);
      }
      entry[field] = list;
    }
  }
  const meta = value['peerDependenciesMeta'];
  if (meta !== undefined) {
    if (!isRecord(meta) || !Object.values(meta).every((flags) => isRecord(flags))) {
      throw new TypeError(`Lock entry '${path}' has an invalid 'peerDependenciesMeta' map.`);
    }
    entry['peerDependenciesMeta'] = Object.fromEntries(
      Object.entries(meta).map(([name, flags]) => [
        name,
        isRecord(flags) && flags['optional'] === true ? { optional: true } : {},
      ]),
    );
  }
  if (path !== '' && typeof entry['version'] !== 'string') {
    throw new TypeError(`Lock entry '${path}' has no version.`);
  }
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- every field above was type-checked against PackageLockEntry
  return entry as PackageLockEntry;
};

/**
 * Parse a lockfileVersion 3 `package-lock.json`, including one written by npm itself.
 * Fields Tau does not model (`funding`, `deprecated`, …) are dropped.
 * @param text - Lock file contents.
 * @returns The validated lock.
 * @throws When the JSON is malformed, the version is not 3, or an entry is unusable; the message names the fix.
 * @public
 */
export const parsePackageLock = (text: string): PackageLock => {
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw new Error('package-lock.json contains invalid JSON. Delete it and run Install to write a new lock.');
  }
  if (!isRecord(value)) {
    throw new Error('package-lock.json must contain an object. Delete it and run Install.');
  }
  if (value['lockfileVersion'] !== 3) {
    throw new Error(
      `package-lock.json has lockfileVersion ${String(value['lockfileVersion'])}; Tau reads version 3 (npm 9+). Run Install to rewrite it.`,
    );
  }
  const { packages } = value;
  if (!isRecord(packages) || !Object.hasOwn(packages, '')) {
    throw new Error('package-lock.json has no root package entry. Delete it and run Install.');
  }
  const entries: Record<string, PackageLockEntry> = {};
  for (const [path, entry] of Object.entries(packages)) {
    if (path !== '' && !lockPathPattern.test(path)) {
      throw new Error(`package-lock.json entry '${path}' is not a node_modules path. Tau does not install workspaces.`);
    }
    entries[path] = readEntry(path, entry);
  }
  return {
    ...(typeof value['name'] === 'string' ? { name: value['name'] } : {}),
    ...(typeof value['version'] === 'string' ? { version: value['version'] } : {}),
    lockfileVersion: 3,
    requires: true,
    packages: entries,
  };
};

/**
 * Serialize a lock exactly as npm writes it: npm's key order at every depth, 2-space JSON, trailing newline.
 * Output is byte-identical for equal locks regardless of insertion order.
 * @param lock - Lock to serialize.
 * @returns `package-lock.json` contents.
 * @public
 */
export const serializePackageLock = (lock: PackageLock): string => `${JSON.stringify(lock, npmOrder, 2)}\n`;

/** Result of reading a project's lock: absent (`{}`), present, or unusable with a `lock-invalid` issue. @public */
export type PackageLockRead =
  | { readonly lock?: PackageLock; readonly issue?: undefined }
  | { readonly issue: PackageIssue };

/**
 * Read `package-lock.json` beside `package.json`.
 * @param filesystem - Project-rooted filesystem.
 * @returns `{}` when no lock exists, `{ lock }` when valid, `{ issue }` with `lock-invalid` otherwise.
 * @public
 */
export const readPackageLock = async (filesystem: BundlerFileSystem): Promise<PackageLockRead> => {
  if (!(await filesystem.exists(packageLockPath))) {
    return {};
  }
  try {
    return { lock: parsePackageLock(await filesystem.readFile(packageLockPath, 'utf8')) };
  } catch (error) {
    return { issue: { code: 'lock-invalid', message: error instanceof Error ? error.message : String(error) } };
  }
};

const sameMap = (left: unknown, right: unknown): boolean => {
  const leftEntries = Object.entries(isRecord(left) ? left : {});
  const rightMap = isRecord(right) ? right : {};
  return (
    leftEntries.length === Object.keys(rightMap).length &&
    leftEntries.every(([name, range]) => Object.hasOwn(rightMap, name) && rightMap[name] === range)
  );
};

/**
 * Compare the lock's root entry with package.json the way `npm ci` does.
 * @param lock - Parsed lock.
 * @param manifest - Parsed package.json object.
 * @returns A `lock-stale` issue naming the differing field, or undefined when they agree.
 * @public
 */
export const lockMatchesManifest = (
  lock: PackageLock,
  manifest: Readonly<Record<string, unknown>>,
): PackageIssue | undefined => {
  const root = lock.packages[''];
  for (const field of rootDependencyFields) {
    if (!sameMap(manifest[field], root?.[field])) {
      return {
        code: 'lock-stale',
        message: `package.json ${field} differ from package-lock.json. Run Install to update the lock.`,
      };
    }
  }
  return undefined;
};
