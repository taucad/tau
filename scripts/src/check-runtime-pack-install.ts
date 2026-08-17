/** Pack runtime, install its TGZ with npm outside Tau, and run the shipped quick start. */

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import process from 'node:process';

type Manifest = {
  version: string;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

type PackResult = { filename: string };

const repositoryRoot = resolve(import.meta.dirname, '../..');
const runtimeRoot = join(repositoryRoot, 'packages/runtime');
const privateRuntimeDependencies = new Set([
  '@taucad/converter',
  '@taucad/events',
  '@taucad/filesystem',
  '@taucad/fs-bridge',
  '@taucad/gltf-extensions',
  '@taucad/json-schema',
  '@taucad/memory',
  '@taucad/rpc',
  '@taucad/types',
  '@taucad/units',
  '@taucad/utils',
  '@taucad/vm',
]);

const invariant: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const run = (command: string, arguments_: string[], cwd: string): string => {
  const result = spawnSync(command, arguments_, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${arguments_.join(' ')} failed with status ${String(result.status)}\n${result.error?.message ?? ''}${result.stdout}${result.stderr}`,
    );
  }
  return result.stdout;
};

const quickStartSource = (readme: string): string => {
  const source = /## Quick start\s+[\s\S]*?```(?:typescript|javascript|ts|js)\n(?<source>[\s\S]*?)\n```/u.exec(readme)
    ?.groups?.['source'];
  invariant(source, 'Installed runtime README must contain a JavaScript-compatible fence under `## Quick start`.');
  return source;
};

const assertInstalledManifest = (manifest: Manifest): void => {
  for (const dependencies of [manifest.dependencies, manifest.optionalDependencies, manifest.peerDependencies]) {
    for (const [name, specifier] of Object.entries(dependencies ?? {})) {
      invariant(!/^(?:file|workspace):/u.test(specifier), `Installed runtime dependency ${name} uses ${specifier}.`);
      invariant(!privateRuntimeDependencies.has(name), `Installed runtime leaks bundled dependency ${name}.`);
    }
  }
};

const main = (): void => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'tau-runtime-npm-local-'));
  const artifactRoot = join(temporaryRoot, 'artifact');
  const appRoot = join(temporaryRoot, 'app');
  let passed = false;

  mkdirSync(artifactRoot);
  mkdirSync(appRoot);
  try {
    const packResult = JSON.parse(run('pnpm', ['pack', '--json', '--pack-destination', artifactRoot], runtimeRoot)) as
      | PackResult
      | PackResult[];
    const packed = Array.isArray(packResult) ? packResult : [packResult];
    const tarballs = readdirSync(artifactRoot).filter((filename) => filename.endsWith('.tgz'));
    invariant(packed.length === 1 && tarballs.length === 1, 'pnpm pack must create exactly one runtime TGZ.');

    const runtimeTarball = resolve(artifactRoot, packed[0]?.filename ?? tarballs[0]!);
    const tarballBytes = statSync(runtimeTarball).size;
    invariant(tarballBytes > 0, 'Runtime TGZ is empty.');

    console.log(`Runtime TGZ: ${basename(runtimeTarball)}`);
    console.log(`Runtime TGZ size: ${tarballBytes} bytes (${(tarballBytes / 1_048_576).toFixed(3)} MiB)`);
    console.log(`Node: ${process.version}`);
    console.log(`npm: ${run('npm', ['--version'], appRoot).trim()}`);
    console.log(`Platform: ${process.platform}/${process.arch}`);

    writeFileSync(join(appRoot, 'package.json'), JSON.stringify({ private: true, type: 'module' }, undefined, 2));
    run('npm', ['install', '--no-save', '--no-audit', '--no-fund', runtimeTarball], appRoot);

    const installedRoot = join(appRoot, 'node_modules/@taucad/runtime');
    const installedManifest = JSON.parse(readFileSync(join(installedRoot, 'package.json'), 'utf8')) as Manifest;
    assertInstalledManifest(installedManifest);

    const dependencyTree = JSON.parse(run('npm', ['ls', '@taucad/runtime', '--json'], appRoot)) as {
      dependencies?: Record<string, { version?: string }>;
    };
    invariant(
      dependencyTree.dependencies?.['@taucad/runtime']?.version === installedManifest.version,
      'npm ls did not resolve the installed runtime version.',
    );
    console.log('npm install: passed');

    writeFileSync(join(appRoot, 'smoke.mjs'), quickStartSource(readFileSync(join(installedRoot, 'README.md'), 'utf8')));
    const quickStartOutput = run(process.execPath, ['smoke.mjs'], appRoot).trim();
    console.log(`README quick start: ${quickStartOutput}`);
    console.log('npm-local runtime TGZ install and standalone quick start passed.');
    passed = true;
  } finally {
    if (passed) {
      rmSync(temporaryRoot, { recursive: true, force: true });
    } else {
      console.error(`Temporary app retained for diagnosis: ${appRoot}`);
    }
  }
};

try {
  main();
} catch (error) {
  console.error('Runtime npm-local smoke failed:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
