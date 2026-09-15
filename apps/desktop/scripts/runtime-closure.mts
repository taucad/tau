/**
 * Purpose: Stage one npm package and its runtime dependency closure into a packaged app.
 * Why: The ACP adapters are spawned as `node <modulePath>` from the packaged app, so their
 * own imports must resolve from disk; the engine packages beside them have no dependencies.
 * Environment: Node with filesystem access to the workspace store and the staging directory.
 * Usage: import { copyRuntimeClosure } from './runtime-closure.mts'
 * Exit codes: n/a (library module).
 */

import { cp, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';

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
