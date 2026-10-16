/**
 * Purpose: Stage the GeoSpec engine and its source/relink archive into a packaged app.
 * Why: The engine packages have no dependencies, so they are copied whole; the ACP adapters'
 * closures are staged by `@taucad/nx/runtime-closure`, which the CLI shares.
 * Environment: Node with filesystem access to the workspace store and the staging directory.
 * Usage: import { copyGeoSpecEngine, copyGeoSpecSourceRelink } from './runtime-closure.mts'
 * Exit codes: n/a (library module).
 */

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { cp, mkdir, readFile, readdir, realpath, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { basename, dirname, resolve } from 'node:path';

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
