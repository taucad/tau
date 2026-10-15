/**
 * Purpose: Stage one npm package and its runtime dependency closure into a packaged app, and copy
 * the package's other trees, as APFS clones on macOS.
 * Why: The ACP adapters are spawned as `node <modulePath>` from the packaged app, so their
 * own imports must resolve from disk; the engine packages beside them have no dependencies.
 * Environment: Node with filesystem access to the workspace store and the staging directory.
 * Usage: import { copyRuntimeClosure, copyTree } from './runtime-closure.mts'
 * Exit codes: n/a (library module).
 */

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { cp, mkdir, readFile, readdir, realpath, rm, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { basename, dirname, parse, resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Stage the installed published `geospec-engine` root and its Darwin arm64 platform package.
 * Both are copied byte for byte from the workspace install of the catalog pin, preserving their
 * published manifests, loader layout and licences; nothing is built or substituted here.
 * @param desktopRoot - The desktop app, whose `node_modules` holds the engine dependency.
 * @param modulesRoot - Fresh packaged app node_modules directory.
 * @returns Exact root/platform dependencies for the staged app manifest.
 */
export const copyGeoSpecEngine = async (
  desktopRoot: string,
  modulesRoot: string,
): Promise<Readonly<Record<string, string>>> => {
  const name = 'geospec-engine';
  const platformName = `${name}-darwin-arm64`;
  const source = await realpath(resolve(desktopRoot, 'node_modules', name));
  let platformSource: string;
  try {
    platformSource = dirname(createRequire(resolve(source, 'package.json')).resolve(`${platformName}/package.json`));
  } catch (error) {
    throw new Error(`${platformName} is not installed beside ${name}; install on a darwin-arm64 host.`, {
      cause: error,
    });
  }
  const manifest = JSON.parse(await readFile(resolve(source, 'package.json'), 'utf8')) as {
    readonly name: string;
    readonly version: string;
    readonly optionalDependencies?: Readonly<Record<string, string>>;
    readonly exports?: { readonly './node'?: { readonly node?: string } };
  };
  const platformManifest = JSON.parse(await readFile(resolve(platformSource, 'package.json'), 'utf8')) as {
    readonly name: string;
    readonly version: string;
    readonly main: string;
    readonly os?: readonly string[];
    readonly cpu?: readonly string[];
  };
  if (
    manifest.name !== name ||
    !manifest.version ||
    platformManifest.name !== platformName ||
    platformManifest.version !== manifest.version ||
    manifest.optionalDependencies?.[platformName] !== manifest.version ||
    platformManifest.os?.join(',') !== 'darwin' ||
    platformManifest.cpu?.join(',') !== 'arm64' ||
    manifest.exports?.['./node']?.node !== './dist/node.mjs'
  ) {
    throw new Error('The installed GeoSpec engine must have matching root/Darwin arm64 manifests and a Node entry.');
  }
  if (basename(platformManifest.main) !== platformManifest.main || !platformManifest.main.endsWith('.node')) {
    throw new Error('GeoSpec engine platform main must name its adjacent .node addon.');
  }
  const licenseEntries = await readdir(resolve(source, 'licenses'), { recursive: true, withFileTypes: true });
  if (!licenseEntries.some((entry) => entry.isFile())) {
    throw new Error('The installed GeoSpec engine has no dependency licenses.');
  }
  await Promise.all(
    [
      resolve(source, 'LICENSE'),
      resolve(source, 'NOTICE'),
      resolve(source, 'licenses/SOURCE-RELINK.json'),
      resolve(source, 'dist/node.mjs'),
      resolve(source, 'dist/native/index.js'),
      resolve(platformSource, 'LICENSE'),
      resolve(platformSource, platformManifest.main),
    ].map(async (path) => {
      const info = await stat(path);
      if (!info.isFile() || info.size === 0) {
        throw new Error(`The installed GeoSpec engine is missing a nonempty file: ${path}`);
      }
    }),
  );
  await Promise.all([
    cp(source, resolve(modulesRoot, name), { recursive: true, dereference: true }),
    cp(platformSource, resolve(modulesRoot, platformName), { recursive: true, dereference: true }),
  ]);
  return { [name]: manifest.version, [platformName]: platformManifest.version };
};

/**
 * Co-deliver the source/relink archive described by the staged engine's receipt.
 * The archive is published by taucad/geospec beside each engine release, not inside the
 * npm package; the caller supplies its path and this refuses any other bytes.
 * The receipt is captured before Electron Packager removes the staging directory.
 * @param archive - The downloaded source/relink archive.
 * @param stagedReceipt - `licenses/SOURCE-RELINK.json` text from the staged engine package.
 * @param resourcesRoot - Packaged app's `Contents/Resources` directory.
 */
export const copyGeoSpecSourceRelink = async (
  archive: string,
  stagedReceipt: string,
  resourcesRoot: string,
): Promise<void> => {
  const receipt = JSON.parse(stagedReceipt) as {
    readonly schema?: string;
    readonly artifact?: { readonly fileName?: string; readonly bytes?: number; readonly sha256?: string };
  };
  const name = receipt.artifact?.fileName ?? '';
  if (
    receipt.schema !== 'geospec-native-source-relink-asset-v2' ||
    !/^[\w.-]+\.tar\.gz$/u.test(name) ||
    typeof receipt.artifact?.bytes !== 'number' ||
    !Number.isSafeInteger(receipt.artifact.bytes) ||
    receipt.artifact.bytes <= 0 ||
    !/^[0-9a-f]{64}$/u.test(receipt.artifact.sha256 ?? '')
  ) {
    throw new Error('GeoSpec SOURCE-RELINK receipt has no valid source archive identity.');
  }
  const expected = receipt.artifact;
  const digest = async (path: string): Promise<string> => {
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(path) as AsyncIterable<Uint8Array<ArrayBuffer>>) {
      hash.update(chunk);
    }
    return hash.digest('hex');
  };
  const sourceInfo = await stat(archive);
  if (!sourceInfo.isFile() || sourceInfo.size !== expected.bytes || (await digest(archive)) !== expected.sha256) {
    throw new Error('GeoSpec source/relink archive differs from the staged engine receipt.');
  }
  const destination = resolve(resourcesRoot, 'SOURCES', name);
  await mkdir(dirname(destination), { recursive: true });
  await cp(archive, destination, { dereference: true });
  const destinationInfo = await stat(destination);
  if (
    !destinationInfo.isFile() ||
    destinationInfo.size !== expected.bytes ||
    (await digest(destination)) !== expected.sha256
  ) {
    throw new Error('Copied GeoSpec source/relink archive differs from the staged engine receipt.');
  }
};

/** Remove each path under `target` whose counterpart under `source` fails `keep`. */
const prune = async (target: string, source: string, keep: (path: string) => boolean): Promise<void> => {
  const entries = await readdir(target, { withFileTypes: true });
  await Promise.all(
    entries.map(async (entry) => {
      if (!keep(resolve(source, entry.name))) {
        await rm(resolve(target, entry.name), { recursive: true, force: true });
      } else if (entry.isDirectory()) {
        await prune(resolve(target, entry.name), resolve(source, entry.name), keep);
      }
    }),
  );
};

/**
 * Copy a directory tree, keeping symlinks verbatim and only the source paths `keep` accepts.
 *
 * On macOS the copy is an APFS clone: `cp -c` uses clonefile(2) (a byte copy on
 * a filesystem without clones), then the rejected paths are removed from the
 * clone. Node's `COPYFILE_FICLONE` cannot do this: libuv 1.51 copies the bytes
 * on macOS and `COPYFILE_FICLONE_FORCE` fails with ENOSYS. A clone also carries
 * the source's extended attributes, which `fs.cp` drops.
 * @param source - Directory to copy.
 * @param target - Directory to create or merge into; its parent need not exist.
 * @param keep - Predicate over source paths; a rejected directory is dropped whole.
 */
export const copyTree = async (source: string, target: string, keep?: (path: string) => boolean): Promise<void> => {
  if (process.platform !== 'darwin') {
    await cp(source, target, { recursive: true, verbatimSymlinks: true, ...(keep ? { filter: keep } : {}) });
    return;
  }
  await mkdir(dirname(target), { recursive: true });
  /* BSD `cp` by path: GNU coreutils earlier on PATH has no `-c`. The trailing
   * slash copies the directory's contents, merging into an existing target as `fs.cp` does. */
  await execFileAsync('/bin/cp', ['-c', '-R', `${source}/`, target]);
  if (keep) {
    await prune(target, source, keep);
  }
};

/** `<name>@<version>` for one package directory. */
const packageIdentity = async (directory: string): Promise<string> => {
  const manifest = JSON.parse(await readFile(resolve(directory, 'package.json'), 'utf8')) as {
    readonly name: string;
    readonly version: string;
  };
  return `${manifest.name}@${manifest.version}`;
};

/** Ordinary dependencies plus only the optional payloads this caller selected. */
const runtimeDependencies = async (
  directory: string,
  optionalDependencies: readonly string[],
): Promise<readonly string[]> => {
  const manifest = JSON.parse(await readFile(resolve(directory, 'package.json'), 'utf8')) as {
    readonly dependencies?: Readonly<Record<string, string>>;
    readonly optionalDependencies?: Readonly<Record<string, string>>;
  };
  return [
    ...Object.keys(manifest.dependencies ?? {}),
    ...optionalDependencies.filter((name) => Object.hasOwn(manifest.optionalDependencies ?? {}, name)),
  ];
};

/**
 * Where Node resolves `name` from `from`, inspecting no directory above `stopAt`.
 *
 * @param from - Directory the import is made from.
 * @param name - Package specifier to resolve.
 * @param stopAt - Highest directory the walk may inspect.
 * @returns The real package directory, or `undefined` when nothing resolves.
 */
const resolveFromTree = async (from: string, name: string, stopAt: string): Promise<string | undefined> => {
  for (let directory = from; directory.startsWith(stopAt); directory = dirname(directory)) {
    const candidate =
      basename(directory) === 'node_modules'
        ? resolve(directory, name, 'package.json')
        : resolve(directory, 'node_modules', name, 'package.json');
    // oxlint-disable-next-line no-await-in-loop -- Node's own resolution is a serial walk up the tree.
    const found = await realpath(candidate).catch(() => undefined);
    if (found) {
      return dirname(found);
    }
    if (dirname(directory) === directory) {
      break;
    }
  }
  return undefined;
};

/**
 * Stage one package and every runtime dependency it needs, nested npm-style.
 *
 * Each dependency is nested under the package that declares it rather than
 * hoisted, because one closure can hold incompatible versions of the same name
 * (the two ACP adapters disagree on `@agentclientprotocol/sdk` and
 * `powershell-utils`) and a flat layout would give one package the other's copy.
 * A dependency already visible up the staged tree at the same version is
 * skipped, which is Node's own resolution rule and also the cycle guard.
 *
 * Optional dependencies are not followed unless the caller selects their exact
 * names. Desktop native payloads retain each consuming package's installed
 * version; unrelated optional payloads, such as Codex's vendored binary, stay out.
 * Select shared native libraries before addons so both are siblings when an
 * addon's relative library lookup requires that layout.
 *
 * @param options - The package to stage, where it lives, the staged
 *   `node_modules` it is copied into (also the highest directory a staged
 *   resolution may inspect), and an extra per-path copy predicate.
 * @throws When a declared dependency does not resolve from its package.
 */
export const copyRuntimeClosure = async (options: {
  readonly name: string;
  readonly source: string;
  readonly modulesRoot: string;
  readonly filter?: ((path: string) => boolean) | undefined;
  readonly optionalDependencies?: readonly string[];
}): Promise<void> => {
  const { modulesRoot, filter = (): boolean => true, optionalDependencies = [] } = options;
  const stage = async (packageName: string, from: string, into: string): Promise<void> => {
    const target = resolve(into, packageName);
    /* `node_modules` is dropped because this function rebuilds it; `src` is
     * dropped for the same reason the engine packages drop it — published
     * packages run from their build output. */
    await copyTree(from, target, (path) => !['node_modules', 'src'].includes(basename(path)) && filter(path));
    for (const dependency of await runtimeDependencies(from, optionalDependencies)) {
      /* oxlint-disable no-await-in-loop -- Siblings would race on the same nested
       * directories; staging one dependency at a time keeps the layout decidable. */
      const dependencySource = await resolveFromTree(from, dependency, parse(from).root);
      if (!dependencySource) {
        throw new Error(`${packageName} depends on ${dependency}, which does not resolve from ${from}`);
      }
      const staged = await resolveFromTree(target, dependency, modulesRoot);
      if (staged && (await packageIdentity(staged)) === (await packageIdentity(dependencySource))) {
        continue;
      }
      await stage(dependency, dependencySource, resolve(target, 'node_modules'));
      /* oxlint-enable no-await-in-loop */
    }
  };
  await stage(options.name, options.source, modulesRoot);
};
