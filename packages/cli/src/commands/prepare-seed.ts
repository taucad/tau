// The managed half of `tau prepare` (charter D25, D26): the audit unit of a sealed closure (its receipt, its CycloneDX
// SBOM and its NOTICES), the seed bundle a machine with no network prepares from (`--bundle`), and the checks an
// operator runs before importing a bundle (`--verify-seed`) and on a schedule after (`--audit`). Nothing here makes a
// request: a bundle is exported from the store after an ordinary prepare, and every byte it writes is hashed on the way.
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, posix } from 'node:path';
import { pipeline } from 'node:stream/promises';

import { computeClosureIntegrity } from '@taucad/runtime/preparation/node';
import type {
  ClosureReceipt,
  DependencyFile,
  DependencyTarget,
  Integrity,
  DependencyFileFormat,
  PreparationPlugin,
  InstalledFile,
} from '@taucad/runtime/preparation/node';

/** The bundle index at the root of a seed directory, a `file://` mirror or an `https://` mirror. */
export const seedIndexName = 'tau-seed.json';

/** The CycloneDX document a native plugin package ships beside `tau-plugin.json`. */
export const pluginSbomName = 'tau-plugin.cdx.json';

/** Licence texts a plugin package ships for dependency files that carry none of their own: `notices/<dependency file>/<file>`. */
export const pluginNoticesDirectory = 'notices';

/** One dependency file of a closure in {@link SeedIndex}. */
export type SeedDependencyFile = {
  readonly name: string;
  readonly integrity: Integrity;
  readonly byteLength: number;
  readonly format: DependencyFileFormat;
  /** Always the sha256 store key, whatever the pin's algorithm. */
  readonly blob: `blobs/sha256/${string}`;
};

/** One sealed closure in {@link SeedIndex}. */
export type SeedClosure = {
  readonly package: string;
  /** The plugin package version whose `tau-plugin.json` pinned the closure. */
  readonly version: string;
  readonly dependency: string;
  readonly target: DependencyTarget;
  readonly closureIntegrity: Integrity;
  /** The receipt's tree identity: a seed preparation must reproduce it (G5). */
  readonly treeIntegrity: Integrity;
  readonly dependencyFiles: readonly SeedDependencyFile[];
  /** The closure's audit unit in the bundle: `notices/<closure hex>/`. */
  readonly audit: string;
};

/** `tau-seed.json` schema 1. */
export type SeedIndex = {
  readonly schemaVersion: 1;
  /** The Tau version the closures were prepared with. */
  readonly tauVersion: string;
  readonly closures: readonly SeedClosure[];
};

/** What the audit found for one sealed closure. */
export type ClosureAudit = {
  readonly package: string;
  readonly dependency: string;
  readonly closureIntegrity: Integrity;
  /** Every file still matches its receipt row and no other file exists. */
  readonly files: 'intact' | 'stale';
  /** Dependency files the SBOM has no component for, or whose component lacks a purl, a hash or its distribution URL. */
  readonly sbom: readonly string[];
  /** Third-party dependency files with no licence or notice text in the closure or the plugin package. */
  readonly notices: readonly string[];
  /** Notice files of the audit unit, closure-relative or `supplemental/<dependency file>/<file>`. */
  readonly noticeFiles: readonly string[];
  readonly ok: boolean;
};

type SbomHash = { readonly alg?: unknown; readonly content?: unknown };
type SbomComponent = {
  readonly name?: unknown;
  readonly purl?: unknown;
  readonly hashes?: readonly SbomHash[];
  readonly externalReferences?: ReadonlyArray<{ readonly type?: unknown; readonly url?: unknown }>;
};
type Sbom = {
  readonly bomFormat?: unknown;
  readonly specVersion?: unknown;
  readonly metadata?: unknown;
  readonly components?: readonly SbomComponent[];
};

const hexPattern = /^[\da-f]{64}$/u;
const blobPathPattern = /^blobs\/sha256\/(?<hex>[\da-f]{64})$/u;
/** Licence and notice texts by file name: `LICENSE.txt`, `NOTICE`, `COPYING.rst`, `DotNet-THIRD-PARTY-NOTICES.txt`. */
const noticeNamePattern = /licen[cs]e|notice|copying/iu;
const noticeExtensions = new Set(['', '.txt', '.md', '.rst', '.rtf', '.html']);

/**
 * Whether a closure-relative path is a licence or notice text.
 * @param path - POSIX path.
 * @returns True for `LICENSE`, `NOTICE`, `COPYING` texts and their prefixed or suffixed forms.
 */
export const isNoticeFile = (path: string): boolean => {
  const name = posix.basename(path);
  return noticeNamePattern.test(name) && noticeExtensions.has(posix.extname(name).toLowerCase());
};

/**
 * Lowercase hex of an SRI value's digest.
 * @param integrity - `sha256-…`, `sha384-…` or `sha512-…`.
 * @returns The algorithm and the hex digest.
 */
export const integrityHex = (integrity: Integrity): { readonly algorithm: string; readonly hex: string } => {
  const dash = integrity.indexOf('-');
  return {
    algorithm: integrity.slice(0, dash),
    hex: Buffer.from(integrity.slice(dash + 1), 'base64').toString('hex'),
  };
};

/**
 * The directory name of a closure's audit unit: the hex of its sha256 `closureIntegrity`.
 * @param closureIntegrity - The closure identity.
 * @returns `notices/<hex>`.
 */
export const auditDirectory = (closureIntegrity: Integrity): string => `notices/${integrityHex(closureIntegrity).hex}`;

/**
 * Hash a file once with several algorithms.
 * @param path - File path.
 * @param algorithms - Node hash names.
 * @returns Lowercase hex per algorithm, and the byte length.
 */
const digestFile = async (
  path: string,
  algorithms: readonly string[],
): Promise<{ readonly hex: Readonly<Record<string, string>>; readonly byteLength: number }> => {
  const hashes = algorithms.map((algorithm) => [algorithm, createHash(algorithm)] as const);
  let byteLength = 0;
  for await (const chunk of createReadStream(path)) {
    const bytes = chunk as Uint8Array<ArrayBuffer>;
    byteLength += bytes.byteLength;
    for (const [, hash] of hashes) {
      hash.update(bytes);
    }
  }
  return { hex: Object.fromEntries(hashes.map(([algorithm, hash]) => [algorithm, hash.digest('hex')])), byteLength };
};

/**
 * Copy a file, hashing it on the way, and publish it only when its sha256 is `expected`.
 * @param from - Source path.
 * @param to - Destination path; written through a sibling temporary file and renamed.
 * @param expected - Lowercase hex sha256 the bytes must have.
 * @returns Whether the bytes matched; on a mismatch nothing is left at `to`.
 */
const copyVerified = async (from: string, to: string, expected: string): Promise<boolean> => {
  await mkdir(dirname(to), { recursive: true });
  const temporary = `${to}.${String(process.pid)}.partial`;
  const hash = createHash('sha256');
  try {
    await pipeline(
      createReadStream(from),
      async function* (source: AsyncIterable<Uint8Array<ArrayBuffer>>) {
        for await (const chunk of source) {
          hash.update(chunk);
          yield chunk;
        }
      },
      createWriteStream(temporary, { mode: 0o644 }),
    );
    if (hash.digest('hex') !== expected) {
      return false;
    }
    await rename(temporary, to);
    return true;
  } finally {
    await rm(temporary, { force: true });
  }
};

const readJson = async (path: string): Promise<unknown> => JSON.parse(await readFile(path, 'utf8')) as unknown;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Read a plugin package's SBOM.
 * @param plugin - The plugin; its `directory` holds `tau-plugin.cdx.json`.
 * @returns The document, or undefined when the package ships none.
 */
export const readPluginSbom = async (plugin: PreparationPlugin): Promise<Sbom | undefined> => {
  if (plugin.directory === undefined) {
    return undefined;
  }
  try {
    const document = await readJson(join(plugin.directory, pluginSbomName));
    return isRecord(document) ? (document as Sbom) : undefined;
  } catch {
    return undefined;
  }
};

/**
 * The supplemental notice files a plugin package ships, by dependency file name.
 * @param plugin - The plugin; its `directory` may hold `notices/<dependency file>/<file>`.
 * @returns Dependency file name to its notice file paths, relative to the package's `notices/`.
 */
export const readSupplementalNotices = async (
  plugin: PreparationPlugin,
): Promise<ReadonlyMap<string, readonly string[]>> => {
  const notices = new Map<string, string[]>();
  if (plugin.directory === undefined) {
    return notices;
  }
  const root = join(plugin.directory, pluginNoticesDirectory);
  let dependencyFiles: string[];
  try {
    dependencyFiles = await readdir(root);
  } catch {
    return notices;
  }
  for (const dependencyFile of dependencyFiles.toSorted((left, right) => left.localeCompare(right))) {
    // oxlint-disable-next-line no-await-in-loop -- a handful of directories
    const files = await readdir(join(root, dependencyFile)).catch(() => []);
    if (files.length > 0) {
      notices.set(
        dependencyFile,
        files.toSorted((left, right) => left.localeCompare(right)).map((file) => `${dependencyFile}/${file}`),
      );
    }
  }
  return notices;
};

/**
 * The manifest dependency file a receipt's dependency file row pins: the same name and integrity in any variant of the dependency.
 * @param plugin - The declaring plugin.
 * @param dependency - Dependency name.
 * @param row - The receipt's dependency file row.
 * @returns The pinned dependency file, or undefined when the installed manifest no longer pins it.
 */
const pinnedDependencyFile = (
  plugin: PreparationPlugin,
  dependency: string,
  row: { readonly name: string; readonly integrity: Integrity },
): DependencyFile | undefined =>
  (plugin.deployment.dependencies[dependency] ?? [])
    .flatMap((variant) => variant.files)
    .find((dependencyFile) => dependencyFile.name === row.name && dependencyFile.integrity === row.integrity);

/**
 * Whether an SBOM component describes a dependency file: a purl, a hash equal to the pin or to the blob's sha256, and, for a
 * dependency file fetched from a URL, a `distribution` reference to one of its URLs.
 * @param component - One SBOM component.
 * @param row - The receipt's dependency file row: the pin and the blob's sha256.
 * @param dependencyFile - The manifest dependency file, when the installed manifest still pins it.
 * @returns `match`, `incomplete` when the hash matches but the purl or the URL is missing, or `other`.
 */
const describes = (
  component: SbomComponent,
  row: { readonly integrity: Integrity; readonly sha256: string },
  dependencyFile: DependencyFile | undefined,
): 'match' | 'incomplete' | 'other' => {
  const pin = integrityHex(row.integrity);
  const pinAlgorithm = pin.algorithm.replace(/^sha/u, 'SHA-');
  const hashed = (component.hashes ?? []).some(
    ({ alg, content }) =>
      (alg === 'SHA-256' && content === row.sha256) || (alg === pinAlgorithm && content === pin.hex),
  );
  if (!hashed) {
    return 'other';
  }
  if (dependencyFile?.origin.kind !== 'url') {
    // The plugin's own files: a hash is the whole claim.
    return 'match';
  }
  const urls = new Set<string>(dependencyFile.origin.urls);
  const distributed = (component.externalReferences ?? []).some(
    ({ type, url }) => type === 'distribution' && typeof url === 'string' && urls.has(url),
  );
  return typeof component.purl === 'string' && component.purl.startsWith('pkg:') && distributed
    ? 'match'
    : 'incomplete';
};

/**
 * Check a sealed closure's SBOM and notices (D26). Its files are checked by the host's re-verification.
 * @param input - The plugin, its SBOM and supplemental notices, the receipt and the file verdict.
 * @returns The audit row.
 */
export const auditClosure = (input: {
  readonly plugin: PreparationPlugin;
  readonly sbom: Sbom | undefined;
  readonly supplemental: ReadonlyMap<string, readonly string[]>;
  readonly receipt: Pick<ClosureReceipt, 'package' | 'dependency' | 'closureIntegrity' | 'files' | 'dependencyFiles'>;
  readonly files: 'intact' | 'stale';
}): ClosureAudit => {
  const { plugin, sbom, supplemental, receipt } = input;
  const validSbom = sbom?.bomFormat === 'CycloneDX' && sbom.specVersion === '1.6';
  const components = validSbom ? (sbom.components ?? []) : [];
  const sbomGaps: string[] = [];
  const noticeGaps: string[] = [];
  const noticeFiles = new Set<string>();
  for (const row of receipt.dependencyFiles) {
    const dependencyFile = pinnedDependencyFile(plugin, receipt.dependency, row);
    const verdicts = components.map((component) => describes(component, row, dependencyFile));
    if (!verdicts.includes('match')) {
      sbomGaps.push(row.name);
    }
    const own = receipt.files.filter((file) => file.dependencyFile === row.name && isNoticeFile(file.path));
    for (const file of own) {
      noticeFiles.add(file.path);
    }
    const extra = supplemental.get(row.name) ?? [];
    for (const file of extra) {
      noticeFiles.add(`supplemental/${file}`);
    }
    // The plugin's own files are covered by its package licence.
    if (dependencyFile?.origin.kind === 'url' && own.length === 0 && extra.length === 0) {
      noticeGaps.push(row.name);
    }
  }
  return {
    package: receipt.package,
    dependency: receipt.dependency,
    closureIntegrity: receipt.closureIntegrity,
    files: input.files,
    sbom: validSbom ? sbomGaps : receipt.dependencyFiles.map(({ name }) => name),
    notices: noticeGaps,
    noticeFiles: [...noticeFiles].toSorted(),
    ok: input.files === 'intact' && validSbom && sbomGaps.length === 0 && noticeGaps.length === 0,
  };
};

/**
 * The SBOM restricted to one closure: the plugin's metadata and the components that describe its dependency files.
 * @param sbom - The plugin's SBOM, metadata and components.
 * @param receipt - The closure's receipt, whose dependency file hashes select the components.
 * @returns A CycloneDX 1.6 document.
 */
const closureSbom = (sbom: Sbom, receipt: ClosureReceipt): Readonly<Record<string, unknown>> => {
  const keys = new Set(
    receipt.dependencyFiles.flatMap((row) => {
      const pin = integrityHex(row.integrity);
      return [`SHA-256:${row.sha256}`, `${pin.algorithm.replace(/^sha/u, 'SHA-')}:${pin.hex}`];
    }),
  );
  return {
    bomFormat: 'CycloneDX',
    specVersion: '1.6',
    version: 1,
    ...(sbom.metadata === undefined ? {} : { metadata: sbom.metadata }),
    properties: [
      { name: 'taucad:closureIntegrity', value: receipt.closureIntegrity },
      { name: 'taucad:treeIntegrity', value: receipt.treeIntegrity },
    ],
    components: (sbom.components ?? []).filter((component) =>
      (component.hashes ?? []).some(({ alg, content }) => keys.has(`${String(alg)}:${String(content)}`)),
    ),
  };
};

/**
 * Write a closure's audit unit: its receipt without the host-private root, its SBOM and its NOTICES, each notice
 * copied only when it hashes to its receipt row.
 * @param input - Bundle root, plugin, receipt, SBOM and the audit row that named the notice files.
 * @returns The audit unit's bundle-relative directory.
 * @throws When a notice file no longer matches its receipt row.
 */
export const writeAuditUnit = async (input: {
  readonly directory: string;
  readonly plugin: PreparationPlugin;
  readonly receipt: ClosureReceipt;
  readonly sbom: Sbom;
  readonly audit: ClosureAudit;
}): Promise<string> => {
  const { directory, plugin, receipt, sbom, audit } = input;
  const relative = auditDirectory(receipt.closureIntegrity);
  const root = join(directory, relative);
  await rm(root, { recursive: true, force: true });
  await mkdir(join(root, 'NOTICES'), { recursive: true });
  const { root: _hostPrivate, ...portable } = receipt;
  await writeFile(join(root, 'receipt.json'), `${JSON.stringify(portable, undefined, 2)}\n`);
  await writeFile(join(root, 'sbom.cdx.json'), `${JSON.stringify(closureSbom(sbom, receipt), undefined, 2)}\n`);
  const rows = new Map(receipt.files.map((file) => [file.path, file]));
  const supplementalPrefix = 'supplemental/';
  const copyNotice = async (path: string): Promise<void> => {
    const target = join(root, 'NOTICES', ...path.split('/'));
    if (path.startsWith(supplementalPrefix)) {
      const source = join(
        plugin.directory ?? '',
        pluginNoticesDirectory,
        ...path.slice(supplementalPrefix.length).split('/'),
      );
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, await readFile(source));
      return;
    }
    const row = rows.get(path);
    const copied =
      row !== undefined && (await copyVerified(join(receipt.root, ...path.split('/')), target, row.sha256));
    if (!copied) {
      throw new Error(`${path} in ${receipt.root} does not match its receipt; run tau prepare --verify.`);
    }
  };
  await Promise.all(audit.noticeFiles.map(async (path) => copyNotice(path)));
  return relative;
};

/**
 * Export one sealed closure's dependency file blobs from the store into a bundle, each hashed to its name on the way.
 * @param input - Store, bundle root, plugin and receipt.
 * @returns The index rows of the closure's dependency files.
 * @throws When the store no longer holds a blob, or a blob no longer hashes to its name.
 */
export const exportBlobs = async (input: {
  readonly store: string;
  readonly directory: string;
  readonly plugin: PreparationPlugin;
  readonly receipt: ClosureReceipt;
}): Promise<SeedDependencyFile[]> => {
  const { store, directory, plugin, receipt } = input;
  const rows: SeedDependencyFile[] = [];
  for (const row of receipt.dependencyFiles) {
    const dependencyFile = pinnedDependencyFile(plugin, receipt.dependency, row);
    if (dependencyFile === undefined || !hexPattern.test(row.sha256)) {
      throw new Error(`${receipt.package} no longer pins ${row.name} ${row.integrity}; prepare it again.`);
    }
    const blob = `blobs/sha256/${row.sha256}` as const;
    const target = join(directory, blob);
    // oxlint-disable-next-line no-await-in-loop -- one blob at a time keeps the copy sequential on one disk
    const existing = await stat(target).catch(() => undefined);
    // oxlint-disable-next-line no-await-in-loop -- see above
    const digest = existing?.isFile() === true ? await digestFile(target, ['sha256']) : undefined;
    const present = digest?.hex['sha256'] === row.sha256;
    // oxlint-disable-next-line no-await-in-loop -- see above
    if (!present && !(await copyVerified(join(store, blob), target, row.sha256))) {
      throw new Error(`The store blob ${blob} does not hash to its name; run tau prepare --verify.`);
    }
    rows.push({
      name: row.name,
      integrity: row.integrity,
      byteLength: dependencyFile.byteLength,
      format: dependencyFile.format,
      blob,
    });
  }
  return rows;
};

/**
 * Copy the plugin's `tau-plugin.json` into `manifests/<package>@<version>/`.
 * @param directory - Bundle root.
 * @param plugin - The plugin, whose `directory` holds `package.json` and `tau-plugin.json`.
 * @returns The plugin package version.
 */
export const exportManifest = async (directory: string, plugin: PreparationPlugin): Promise<string> => {
  if (plugin.directory === undefined) {
    throw new Error(`${plugin.package} has no package directory to export its manifest from.`);
  }
  const packageJson = (await readJson(join(plugin.directory, 'package.json'))) as { readonly version?: unknown };
  const version = typeof packageJson.version === 'string' ? packageJson.version : '0.0.0';
  const target = join(directory, 'manifests', `${plugin.package}@${version}`, 'tau-plugin.json');
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, await readFile(join(plugin.directory, 'tau-plugin.json')));
  return version;
};

/**
 * Write `tau-seed.json`, merging closures already indexed in the bundle (a later export of the same closure wins).
 * @param directory - Bundle root.
 * @param tauVersion - The preparing Tau version.
 * @param closures - Closures exported now.
 * @returns The index written.
 */
export const writeSeedIndex = async (
  directory: string,
  tauVersion: string,
  closures: readonly SeedClosure[],
): Promise<SeedIndex> => {
  const previous = await readSeedIndex(directory).catch(() => undefined);
  const exported = new Set(closures.map((closure) => closure.closureIntegrity));
  const index: SeedIndex = {
    schemaVersion: 1,
    tauVersion,
    closures: [...(previous?.closures ?? []).filter((closure) => !exported.has(closure.closureIntegrity)), ...closures],
  };
  await writeFile(join(directory, seedIndexName), `${JSON.stringify(index, undefined, 2)}\n`);
  return index;
};

/**
 * Read and shape-check `tau-seed.json`.
 * @param directory - Bundle root.
 * @returns The index.
 * @throws When the file is absent, not JSON or not schema 1.
 */
export const readSeedIndex = async (directory: string): Promise<SeedIndex> => {
  const parsed = await readJson(join(directory, seedIndexName));
  if (!isRecord(parsed) || parsed['schemaVersion'] !== 1 || !Array.isArray(parsed['closures'])) {
    throw new TypeError(`${join(directory, seedIndexName)} is not a schema 1 seed index.`);
  }
  return parsed as unknown as SeedIndex;
};

/** One problem `--verify-seed` found. */
export type SeedProblem = {
  readonly path: string;
  readonly problem: string;
};

/** What `--verify-seed` found. */
export type SeedVerification = {
  readonly directory: string;
  readonly tauVersion: string;
  readonly blobs: number;
  readonly byteLength: number;
  readonly closures: ReadonlyArray<Pick<SeedClosure, 'package' | 'dependency' | 'closureIntegrity'>>;
  readonly problems: readonly SeedProblem[];
};

const algorithmsOf = (integrity: Integrity): string => integrityHex(integrity).algorithm;

/**
 * Verify a bundle before importing it: every blob hashes to its name, every indexed dependency file is present with its pinned
 * size and integrity, every closure identity recomputes from its pins, and every audit unit names the same closure,
 * describes every dependency file in its SBOM and carries notice files that hash to their receipt rows.
 * @param directory - Bundle root.
 * @returns The verification; `problems` is empty when the bundle is complete.
 */
export const verifySeed = async (directory: string): Promise<SeedVerification> => {
  const problems: SeedProblem[] = [];
  let index: SeedIndex;
  try {
    index = await readSeedIndex(directory);
  } catch (error) {
    return {
      directory,
      tauVersion: '',
      blobs: 0,
      byteLength: 0,
      closures: [],
      problems: [{ path: seedIndexName, problem: error instanceof Error ? error.message : String(error) }],
    };
  }
  const blobRoot = join(directory, 'blobs', 'sha256');
  const names = await readdir(blobRoot).catch(() => []);
  const blobs = new Map<string, { readonly hex: Readonly<Record<string, string>>; readonly byteLength: number }>();
  let byteLength = 0;
  const wanted = new Set(
    index.closures.flatMap((closure) => closure.dependencyFiles.map(({ integrity }) => algorithmsOf(integrity))),
  );
  wanted.add('sha256');
  for (const name of names.toSorted((left, right) => left.localeCompare(right))) {
    const path = `blobs/sha256/${name}`;
    if (!hexPattern.test(name)) {
      problems.push({ path, problem: 'is not named by a sha256 digest' });
      continue;
    }
    // oxlint-disable-next-line no-await-in-loop -- one blob at a time on one disk
    const digest = await digestFile(join(blobRoot, name), [...wanted]);
    byteLength += digest.byteLength;
    if (digest.hex['sha256'] !== name) {
      problems.push({ path, problem: `hashes to ${digest.hex['sha256'] ?? ''}, not to its name` });
      continue;
    }
    blobs.set(name, digest);
  }
  for (const closure of index.closures) {
    const label = `${closure.package} ${closure.dependency}`;
    for (const dependencyFile of closure.dependencyFiles) {
      const hex = blobPathPattern.exec(dependencyFile.blob)?.groups?.['hex'];
      const digest = hex === undefined ? undefined : blobs.get(hex);
      if (digest === undefined) {
        problems.push({ path: dependencyFile.blob, problem: `${label} ${dependencyFile.name} is missing or corrupt` });
        continue;
      }
      const pin = integrityHex(dependencyFile.integrity);
      if (digest.byteLength !== dependencyFile.byteLength || digest.hex[pin.algorithm] !== pin.hex) {
        problems.push({
          path: dependencyFile.blob,
          problem: `${label} ${dependencyFile.name} does not match ${dependencyFile.integrity}`,
        });
      }
    }
    // oxlint-disable-next-line no-await-in-loop -- a few closures
    const recomputed = await computeClosureIntegrity(closure.dependencyFiles);
    if (recomputed !== closure.closureIntegrity) {
      problems.push({ path: seedIndexName, problem: `${label} closureIntegrity does not recompute from its pins` });
    }
    // oxlint-disable-next-line no-await-in-loop -- a few closures
    problems.push(...(await verifyAuditUnit(directory, closure)));
  }
  return {
    directory,
    tauVersion: index.tauVersion,
    blobs: blobs.size,
    byteLength,
    closures: index.closures.map(({ package: name, dependency, closureIntegrity }) => ({
      package: name,
      dependency,
      closureIntegrity,
    })),
    problems,
  };
};

const verifyAuditUnit = async (directory: string, closure: SeedClosure): Promise<SeedProblem[]> => {
  const problems: SeedProblem[] = [];
  const root = join(directory, closure.audit);
  const label = `${closure.package} ${closure.dependency}`;
  let receipt: ClosureReceipt;
  let sbom: Sbom;
  try {
    receipt = (await readJson(join(root, 'receipt.json'))) as ClosureReceipt;
    sbom = (await readJson(join(root, 'sbom.cdx.json'))) as Sbom;
  } catch {
    return [{ path: closure.audit, problem: `${label} has no receipt.json and sbom.cdx.json` }];
  }
  if (receipt.closureIntegrity !== closure.closureIntegrity || receipt.treeIntegrity !== closure.treeIntegrity) {
    problems.push({ path: `${closure.audit}/receipt.json`, problem: `${label} receipt names another closure` });
  }
  const components = sbom.bomFormat === 'CycloneDX' && sbom.specVersion === '1.6' ? (sbom.components ?? []) : [];
  for (const dependencyFile of closure.dependencyFiles) {
    const sha256 = blobPathPattern.exec(dependencyFile.blob)?.groups?.['hex'] ?? '';
    const pin = integrityHex(dependencyFile.integrity);
    const pinAlgorithm = pin.algorithm.replace(/^sha/u, 'SHA-');
    const described = components.some((component) =>
      (component.hashes ?? []).some(
        ({ alg, content }) =>
          (alg === 'SHA-256' && content === sha256) || (alg === pinAlgorithm && content === pin.hex),
      ),
    );
    if (!described) {
      problems.push({
        path: `${closure.audit}/sbom.cdx.json`,
        problem: `${label} ${dependencyFile.name} has no component`,
      });
    }
  }
  const receiptFiles: readonly InstalledFile[] = Array.isArray(receipt.files) ? receipt.files : [];
  const rows = new Map(receiptFiles.map((file) => [file.path, file]));
  const noticeRoot = join(root, 'NOTICES');
  const notices = await listFiles(noticeRoot);
  if (notices.length === 0) {
    problems.push({ path: `${closure.audit}/NOTICES`, problem: `${label} carries no notices` });
  }
  for (const path of notices) {
    if (path.startsWith('supplemental/')) {
      continue;
    }
    const row = rows.get(path);
    // oxlint-disable-next-line no-await-in-loop -- a few dozen small texts
    const digest = await digestFile(join(noticeRoot, ...path.split('/')), ['sha256']);
    if (row?.sha256 !== digest.hex['sha256']) {
      problems.push({ path: `${closure.audit}/NOTICES/${path}`, problem: `${label} notice differs from its receipt` });
    }
  }
  return problems;
};

const listFiles = async (root: string, prefix = ''): Promise<string[]> => {
  const entries = await readdir(join(root, prefix), { withFileTypes: true }).catch(() => []);
  const files: string[] = [];
  for (const entry of entries) {
    const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      // oxlint-disable-next-line no-await-in-loop -- shallow trees
      files.push(...(await listFiles(root, path)));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files.toSorted((left, right) => left.localeCompare(right));
};

/**
 * Package names a bundle indexes.
 * @param index - The bundle index.
 * @returns Distinct package names in index order.
 */
export const indexedPackages = (index: SeedIndex): readonly string[] => [
  ...new Set(index.closures.map((closure) => closure.package)),
];
