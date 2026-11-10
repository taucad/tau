import { PreparationError } from '#preparation/preparation-error.js';
import type {
  DependencyFile,
  DependencyTarget,
  DependencyVariant,
  KernelDeployment,
  DependencyFileFormat,
  DependencyFileOrigin,
  PluginDeployment,
} from '#preparation/preparation.types.js';

type Json = Readonly<Record<string, unknown>>;

const dependencyFileFormats: readonly DependencyFileFormat[] = ['raw', 'tar.gz', 'zip', 'wheel'];
// Padded base64 of exactly 32, 48 or 64 bytes.
const sriPatterns = {
  sha256: /^sha256-[A-Za-z\d+/]{43}=$/u,
  sha384: /^sha384-[A-Za-z\d+/]{64}$/u,
  sha512: /^sha512-[A-Za-z\d+/]{86}==$/u,
} as const;
const namePattern = /^[A-Za-z\d][\w.+-]*$/u;
const versionPattern = /^\d+(?:\.\d+)*$/u;
const extensionPattern = /^[A-Za-z\d][\w+-]*$/u;
const sitePackagesPattern = /^(?:(?<prefix>.+)\/)?(?:lib\/python\d+\.\d+t?|Lib)\/site-packages$/u;

/** A manifest problem; `parsePluginDeployment` turns it into a `MANIFEST_INVALID` error naming the file. */
class ManifestProblem extends Error {
  public readonly field: string;

  public constructor(field: string, problem: string) {
    super(`${field} ${problem}`);
    this.field = field;
  }
}

const isRecord = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const record = (value: unknown, field: string, allowed: readonly string[]): Json => {
  if (!isRecord(value)) {
    throw new ManifestProblem(field, 'must be an object');
  }
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      throw new ManifestProblem(field === '' ? key : `${field}.${key}`, 'is not a tau-plugin.json schema v1 field');
    }
  }
  return value;
};

const nonEmptyArray = (value: unknown, field: string): readonly unknown[] => {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ManifestProblem(field, 'must be a non-empty array');
  }
  return value;
};

const oneOf = <T extends string>(value: unknown, field: string, allowed: readonly T[]): T => {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new ManifestProblem(field, `must be one of ${allowed.map((item) => `"${item}"`).join(', ')}`);
  }
  return value as T;
};

type Rule = { readonly pattern: RegExp; readonly description: string };

const matching = (value: unknown, field: string, { pattern, description }: Rule): string => {
  if (typeof value !== 'string' || !pattern.test(value)) {
    throw new ManifestProblem(field, `${JSON.stringify(value)} is not ${description}`);
  }
  return value;
};

const positiveInteger = (value: unknown, field: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new ManifestProblem(field, 'must be a positive integer');
  }
  return value as number;
};

const optional = <T>(value: unknown, read: (present: unknown) => T): { readonly value?: T } =>
  value === undefined ? {} : { value: read(value) };

// A closure-relative POSIX path that no host resolves outside the closure root.
const relativePath = (value: unknown, field: string): string => {
  const valid =
    typeof value === 'string' &&
    value
      .split('/')
      .every(
        (segment) =>
          segment.length > 0 &&
          segment !== '.' &&
          segment !== '..' &&
          !segment.includes('\\') &&
          !segment.includes(':') &&
          !segment.includes('\0'),
      );
  if (!valid) {
    throw new ManifestProblem(
      field,
      `${JSON.stringify(value)} escapes the closure root or is not a relative POSIX path`,
    );
  }
  return value;
};

const readTarget = (value: unknown, field: string): DependencyTarget => {
  const runtime = oneOf(isRecord(value) ? value['runtime'] : undefined, `${field}.runtime`, ['native', 'browser']);
  if (runtime === 'browser') {
    const { threads } = record(value, field, ['runtime', 'threads']);
    if (threads !== undefined && typeof threads !== 'boolean') {
      throw new ManifestProblem(`${field}.threads`, 'must be a boolean');
    }
    return { runtime, ...(threads === undefined ? {} : { threads }) };
  }
  const os = oneOf(isRecord(value) ? value['os'] : undefined, `${field}.os`, ['darwin', 'linux', 'win32']);
  if (os === 'linux') {
    const target = record(value, field, ['runtime', 'os', 'arch', 'libc', 'minimumLibcVersion']);
    const arch = oneOf(target['arch'], `${field}.arch`, ['arm64', 'x64']);
    if (target['libc'] === undefined) {
      throw new ManifestProblem(`${field}.libc`, 'is required for a Linux target ("glibc" or "musl")');
    }
    const libc = oneOf(target['libc'], `${field}.libc`, ['glibc', 'musl']);
    const floor = optional(target['minimumLibcVersion'], (present) =>
      matching(present, `${field}.minimumLibcVersion`, { pattern: versionPattern, description: 'a dotted version' }),
    );
    return { runtime, os, arch, libc, ...(floor.value === undefined ? {} : { minimumLibcVersion: floor.value }) };
  }
  const target = record(value, field, ['runtime', 'os', 'arch', 'minimumOsVersion']);
  const arch = oneOf(target['arch'], `${field}.arch`, ['arm64', 'x64']);
  const floor = optional(target['minimumOsVersion'], (present) =>
    matching(present, `${field}.minimumOsVersion`, { pattern: versionPattern, description: 'a dotted version' }),
  );
  return { runtime, os, arch, ...(floor.value === undefined ? {} : { minimumOsVersion: floor.value }) };
};

const readOrigin = (value: unknown, field: string): DependencyFileOrigin => {
  const kind = oneOf(isRecord(value) ? value['kind'] : undefined, `${field}.kind`, [
    'url',
    'packagePath',
    'packageAsset',
  ]);
  if (kind === 'url') {
    const urls = nonEmptyArray(record(value, field, ['kind', 'urls'])['urls'], `${field}.urls`).map((url, index) => {
      const parsed = typeof url === 'string' && URL.canParse(url) ? new URL(url) : undefined;
      if (parsed?.protocol !== 'https:' || parsed.username !== '' || parsed.password !== '') {
        throw new ManifestProblem(
          `${field}.urls[${index}]`,
          `${JSON.stringify(url)} is not an https URL without credentials`,
        );
      }
      return url as string;
    });
    return { kind, urls: urls as [string, ...string[]] };
  }
  if (kind === 'packagePath') {
    return { kind, path: relativePath(record(value, field, ['kind', 'path'])['path'], `${field}.path`) };
  }
  const { specifier } = record(value, field, ['kind', 'specifier']);
  if (typeof specifier !== 'string' || specifier.length === 0) {
    throw new ManifestProblem(`${field}.specifier`, 'must be a non-empty module specifier');
  }
  return { kind, specifier };
};

const readIntegrity = (value: unknown, field: string): DependencyFile['integrity'] => {
  if (typeof value !== 'string' || !Object.values(sriPatterns).some((pattern) => pattern.test(value))) {
    throw new ManifestProblem(
      field,
      `${JSON.stringify(value)} is not an SRI string (sha256-, sha384- or sha512- with padded base64 of the digest)`,
    );
  }
  return value as DependencyFile['integrity'];
};

const readDependencyFile = (value: unknown, field: string): DependencyFile => {
  const dependencyFile = record(value, field, [
    'name',
    'integrity',
    'byteLength',
    'format',
    'origin',
    'destination',
    'stripComponents',
    'unpackedByteLength',
  ]);
  const name = matching(dependencyFile['name'], `${field}.name`, {
    pattern: namePattern,
    description: 'a dependency file name',
  });
  const integrity = readIntegrity(dependencyFile['integrity'], `${field}.integrity`);
  const byteLength = positiveInteger(dependencyFile['byteLength'], `${field}.byteLength`);
  const format = oneOf(dependencyFile['format'], `${field}.format`, dependencyFileFormats);
  const origin = readOrigin(dependencyFile['origin'], `${field}.origin`);
  const destination =
    dependencyFile['destination'] === '.' && format === 'raw'
      ? '.'
      : relativePath(dependencyFile['destination'], `${field}.destination`);
  if (format === 'wheel' && !sitePackagesPattern.test(destination)) {
    throw new ManifestProblem(
      `${field}.destination`,
      `"${destination}" is not a site-packages directory (<prefix>/lib/pythonX.Y/site-packages or <prefix>/Lib/site-packages)`,
    );
  }
  const strip = optional(dependencyFile['stripComponents'], (present) => {
    if (format !== 'tar.gz' && format !== 'zip') {
      throw new ManifestProblem(`${field}.stripComponents`, 'applies only to tar.gz and zip dependency files');
    }
    if (!Number.isSafeInteger(present) || (present as number) < 0) {
      throw new ManifestProblem(`${field}.stripComponents`, 'must be a non-negative integer');
    }
    return present as number;
  });
  const unpacked = optional(dependencyFile['unpackedByteLength'], (present) =>
    positiveInteger(present, `${field}.unpackedByteLength`),
  );
  return {
    name,
    integrity,
    byteLength,
    format,
    origin,
    destination,
    ...(strip.value === undefined ? {} : { stripComponents: strip.value }),
    ...(unpacked.value === undefined ? {} : { unpackedByteLength: unpacked.value }),
  };
};

/**
 * The canonical `<os>-<arch>[-<libc>]` key of a native target, or `browser[-threads]`. Floors are not part of the
 * key: two variants of one dependency differ in key or in floor.
 * @param target - A manifest target.
 * @returns The key, such as `darwin-arm64` or `linux-x64-glibc`.
 * @public
 */
export const targetKey = (target: DependencyTarget): string => {
  if (target.runtime === 'browser') {
    return target.threads === true ? 'browser-threads' : 'browser';
  }
  return target.os === 'linux' ? `linux-${target.arch}-${target.libc}` : `${target.os}-${target.arch}`;
};

const targetFloor = (target: DependencyTarget): string =>
  target.runtime === 'browser'
    ? ''
    : target.os === 'linux'
      ? (target.minimumLibcVersion ?? '')
      : (target.minimumOsVersion ?? '');

const readVariant = (value: unknown, field: string): DependencyVariant => {
  if (isRecord(value) && 'payloads' in value) {
    throw new ManifestProblem(`${field}.payloads`, 'was renamed to "files"; rename the field and keep its entries');
  }
  const variant = record(value, field, ['target', 'files']);
  const target = readTarget(variant['target'], `${field}.target`);
  const files = nonEmptyArray(variant['files'], `${field}.files`).map((file, index) =>
    readDependencyFile(file, `${field}.files[${index}]`),
  );
  const names = new Map<string, number>();
  for (const [index, file] of files.entries()) {
    const earlier = names.get(file.name);
    if (earlier !== undefined) {
      throw new ManifestProblem(
        `${field}.files[${index}].name`,
        `"${file.name}" repeats ${field}.files[${earlier}].name`,
      );
    }
    names.set(file.name, index);
  }
  return { target, files: files as [DependencyFile, ...DependencyFile[]] };
};

const readDependencies = (value: unknown): PluginDeployment['dependencies'] => {
  if (!isRecord(value) || Object.keys(value).length === 0) {
    throw new ManifestProblem('dependencies', 'must be an object with at least one dependency');
  }
  const dependencies: Record<string, readonly [DependencyVariant, ...DependencyVariant[]]> = {};
  for (const [name, variants] of Object.entries(value)) {
    const field = `dependencies.${name}`;
    matching(name, field, { pattern: namePattern, description: 'a dependency name' });
    const read = nonEmptyArray(variants, field).map((variant, index) => readVariant(variant, `${field}[${index}]`));
    const seen = new Map<string, number>();
    for (const [index, variant] of read.entries()) {
      const key = `${targetKey(variant.target)}@${targetFloor(variant.target)}`;
      const earlier = seen.get(key);
      if (earlier !== undefined) {
        throw new ManifestProblem(
          `${field}[${index}].target`,
          `repeats ${field}[${earlier}].target (same key and floor)`,
        );
      }
      seen.set(key, index);
    }
    dependencies[name] = read as [DependencyVariant, ...DependencyVariant[]];
  }
  return dependencies;
};

const readKernels = (value: unknown, dependencies: PluginDeployment['dependencies']): PluginDeployment['kernels'] => {
  if (!isRecord(value) || Object.keys(value).length === 0) {
    throw new ManifestProblem('kernels', 'must be an object with at least one kernel');
  }
  const kernels: Record<string, KernelDeployment> = {};
  for (const [id, row] of Object.entries(value)) {
    const field = `kernels.${id}`;
    matching(id, field, { pattern: namePattern, description: 'a kernel id' });
    const kernel = record(row, field, ['requires', 'extensions']);
    const requires = nonEmptyArray(kernel['requires'], `${field}.requires`).map((name, index) => {
      if (typeof name !== 'string' || !Object.hasOwn(dependencies, name)) {
        throw new ManifestProblem(
          `${field}.requires[${index}]`,
          `names ${JSON.stringify(name)}, which dependencies does not declare`,
        );
      }
      return name;
    });
    const extensions = nonEmptyArray(kernel['extensions'], `${field}.extensions`).map((extension, index) =>
      matching(extension, `${field}.extensions[${index}]`, {
        pattern: extensionPattern,
        description: 'a file extension without its dot',
      }),
    );
    kernels[id] = {
      requires: requires as [string, ...string[]],
      extensions: extensions as [string, ...string[]],
    };
  }
  return kernels;
};

/**
 * Validate a parsed `tau-plugin.json` against schema v1 and return it typed. Unknown fields are refused (a top-level
 * `"//"` comment string is the one exception), as are integrities that are not SRI, paths that escape the closure
 * root, `"."` on a non-raw dependency file, a wheel outside a `site-packages` directory, a kernel that requires an
 * undeclared dependency, a Linux target without `libc` and two variants of one dependency with the same target key
 * and floor.
 * @param value - The parsed JSON.
 * @param source - What to call the manifest in messages, such as `@taucad/build123d tau-plugin.json`.
 * @returns The validated deployment.
 * @throws {PreparationError} `MANIFEST_INVALID` whose `field` and message name the offending field.
 * @public
 */
export const parsePluginDeployment = (value: unknown, source = 'tau-plugin.json'): PluginDeployment => {
  try {
    const manifest = record(value, '', ['//', 'schemaVersion', 'dependencies', 'kernels']);
    if (manifest['//'] !== undefined && typeof manifest['//'] !== 'string') {
      throw new ManifestProblem('//', 'must be a comment string');
    }
    if (manifest['schemaVersion'] !== 1) {
      throw new ManifestProblem(
        'schemaVersion',
        `is ${JSON.stringify(manifest['schemaVersion'])}; this host reads schema 1`,
      );
    }
    const dependencies = readDependencies(manifest['dependencies']);
    return { schemaVersion: 1, dependencies, kernels: readKernels(manifest['kernels'], dependencies) };
  } catch (error) {
    if (error instanceof ManifestProblem) {
      throw new PreparationError(
        'MANIFEST_INVALID',
        `${source}: ${error.message}. The package is broken; report it or pin another version.`,
        { field: error.field },
      );
    }
    throw error;
  }
};

/**
 * Where a wheel's `.data/data/` files install: the interpreter prefix its `site-packages` destination sits under.
 * @param destination - A validated wheel destination.
 * @returns The closure-relative prefix, or `.` when `site-packages` hangs off the closure root.
 * @public
 */
export const wheelDataDestination = (destination: string): string =>
  sitePackagesPattern.exec(destination)?.groups?.['prefix'] ?? '.';
