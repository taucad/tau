/**
 * Purpose: Stage one npm package and its runtime dependency closure into a packaged app.
 * Why: The ACP adapters are spawned as `node <modulePath>` from the packaged app, so their
 * own imports must resolve from disk; the engine packages beside them have no dependencies.
 * Environment: Node with filesystem access to the workspace store and the staging directory.
 * Usage: import { copyRuntimeClosure } from './runtime-closure.mts'
 * Exit codes: n/a (library module).
 */

import { execFileSync } from 'node:child_process';
import { cp, mkdir, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, relative, resolve } from 'node:path';

/**
 * Stage the published native root and Darwin arm64 platform from the explicit
 * assemble-package.sh output. Extract the tarballs, preserving their generated
 * manifests, loader layout and licenses; never substitute workspace build files.
 * The caller selects the qualified assembly; this does not qualify its source.
 * @param assemblyRoot - ASSEMBLY_ROOT printed by the native assembly driver.
 * @param modulesRoot - Fresh packaged app node_modules directory.
 * @returns Exact root/platform dependencies for the staged app manifest.
 */
export const copyGeoSpecNativeAssembly = async (
  assemblyRoot: string,
  modulesRoot: string,
): Promise<Readonly<Record<string, string>>> => {
  const name = '@taucad/geospec-engine-native';
  const platformName = `${name}-darwin-arm64`;
  const root = resolve(modulesRoot, name);
  const platform = resolve(modulesRoot, platformName);
  await mkdir(dirname(root), { recursive: true });
  await Promise.all([mkdir(root), mkdir(platform)]);
  execFileSync('tar', ['-xzf', resolve(assemblyRoot, 'tarballs/root.tgz'), '-C', root, '--strip-components=1']);
  execFileSync('tar', [
    '-xzf',
    resolve(assemblyRoot, 'tarballs/darwin-arm64.tgz'),
    '-C',
    platform,
    '--strip-components=1',
  ]);
  const manifest = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')) as {
    readonly name: string;
    readonly version: string;
    readonly optionalDependencies?: Readonly<Record<string, string>>;
    readonly exports?: { readonly './node'?: { readonly node?: string } };
    readonly imports?: { readonly '#native-binding'?: { readonly node?: string }; readonly '#wasm-binding'?: unknown };
  };
  const platformManifest = JSON.parse(await readFile(resolve(platform, 'package.json'), 'utf8')) as {
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
    manifest.exports?.['./node']?.node !== './dist/node.mjs' ||
    manifest.imports?.['#native-binding']?.node !== './dist/native/index.js' ||
    manifest.imports['#wasm-binding'] !== undefined
  ) {
    throw new Error(
      'GeoSpec native assembly must contain matching published root/Darwin arm64 manifests and current Node loader mappings.',
    );
  }
  if (basename(platformManifest.main) !== platformManifest.main || !platformManifest.main.endsWith('.node')) {
    throw new Error('GeoSpec native platform main must name its adjacent .node addon.');
  }
  const licenseEntries = await readdir(resolve(root, 'licenses'), { recursive: true, withFileTypes: true });
  const licenses = licenseEntries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(root, resolve(entry.parentPath, entry.name)));
  if (licenses.length === 0) {
    throw new Error('GeoSpec native assembly has no dependency licenses.');
  }
  await Promise.all([
    ...[
      resolve(root, 'dist/node.mjs'),
      resolve(root, 'dist/native/index.js'),
      resolve(platform, platformManifest.main),
    ].map(async (path) => {
      const info = await stat(path);
      if (!info.isFile() || info.size === 0) {
        throw new Error(`GeoSpec native assembly is missing a nonempty file: ${path}`);
      }
    }),
    ...['LICENSE', 'NOTICE', ...licenses].map(async (path) => {
      const [rootBytes, platformBytes] = await Promise.all([
        readFile(resolve(root, path)),
        readFile(resolve(platform, path)),
      ]);
      if (rootBytes.length === 0 || !rootBytes.equals(platformBytes)) {
        throw new Error(`GeoSpec native root/platform license closure differs at ${path}.`);
      }
    }),
  ]);
  return { [name]: manifest.version, [platformName]: platformManifest.version };
};

/**
 * Stage GeoSpec's runtime-loaded native subpath; the engine itself is bundled.
 * The generated factory, glue and WASM must stay adjacent, without shipping
 * the native build tree or duplicating the bundled engine's dependencies.
 * @param source - Installed GeoSpec engine package root.
 * @param modulesRoot - Packaged app's node_modules directory.
 */
export const copyGeoSpecNative = async (source: string, modulesRoot: string): Promise<void> => {
  const manifest = JSON.parse(await readFile(resolve(source, 'package.json'), 'utf8')) as {
    readonly name: string;
    readonly version: string;
  };
  const target = resolve(modulesRoot, manifest.name);
  await mkdir(target, { recursive: true });
  await cp(resolve(source, 'native/opencascade/dist'), resolve(target, 'native'), { recursive: true });
  await cp(resolve(source, 'LICENSE'), resolve(target, 'LICENSE'));
  await writeFile(
    resolve(target, 'package.json'),
    JSON.stringify({
      name: manifest.name,
      version: manifest.version,
      type: 'module',
      exports: { './native/opencascade/single': './native/init.js' },
    }),
  );
};

/** `<name>@<version>` for one package directory. */
const packageIdentity = async (directory: string): Promise<string> => {
  const manifest = JSON.parse(await readFile(resolve(directory, 'package.json'), 'utf8')) as {
    readonly name: string;
    readonly version: string;
  };
  return `${manifest.name}@${manifest.version}`;
};

/** Runtime dependencies one package declares. */
const runtimeDependencies = async (directory: string): Promise<readonly string[]> => {
  const manifest = JSON.parse(await readFile(resolve(directory, 'package.json'), 'utf8')) as {
    readonly dependencies?: Readonly<Record<string, string>>;
  };
  return Object.keys(manifest.dependencies ?? {});
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
    // oxlint-disable-next-line no-await-in-loop -- Node's own resolution is a serial walk up the tree.
    const found = await realpath(resolve(directory, 'node_modules', name, 'package.json')).catch(() => undefined);
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
 * Optional dependencies are deliberately not followed: they are the platform
 * payloads a host either already has or does not need, and following them would
 * pull Codex's 258 MB vendored binary into every Tau package.
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
}): Promise<void> => {
  const { modulesRoot, filter = (): boolean => true } = options;
  const stage = async (packageName: string, from: string, into: string): Promise<void> => {
    const target = resolve(into, packageName);
    await cp(from, target, {
      recursive: true,
      /* `node_modules` is dropped because this function rebuilds it; `src` is
       * dropped for the same reason the engine packages drop it — published
       * packages run from their build output. */
      filter: (path) => !['node_modules', 'src'].includes(basename(path)) && filter(path),
    });
    for (const dependency of await runtimeDependencies(from)) {
      /* oxlint-disable no-await-in-loop -- Siblings would race on the same nested
       * directories; staging one dependency at a time keeps the layout decidable. */
      const dependencySource = await resolveFromTree(from, dependency, '/');
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
