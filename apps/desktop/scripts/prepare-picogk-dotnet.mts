#!/usr/bin/env node

/**
 * Purpose: Assemble the pinned self-contained PicoGK C# worker for Electron.
 * Why: Runtime model execution must not discover system .NET or restore packages.
 * Environment: Node 24+, tar, and network access on macOS arm64.
 * Usage: node --import @oxc-node/core/register apps/desktop/scripts/prepare-picogk-dotnet.mts [--target darwin-arm64]
 * Exit codes: 0 for an integrity-verified resource; non-zero for unsupported targets or build/integrity failure.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, cp, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { basename, relative, resolve } from 'node:path';
import { picogkRuntimeManifestSchema } from '@taucad/picogk';

type Target = {
  readonly dotnetArchive: string;
  readonly dotnetSha512: string;
  readonly dotnetUrl: string;
  readonly rid: string;
};

const dotnetVersion = '10.0.400';
const dotnetRuntimeVersion = '10.0.11';
const roslynVersion = '5.9.0';
const picoGkCommit = '0e6cf6b6f4993ec16dbcd72d8f27f26b999980f3';
const picoGkArchiveSha256 = '6e188832832241ce5fad3639e2cab63982e4b392eaea367c49a32aac361f4ca5';
const targets: Readonly<Record<string, Target>> = {
  'darwin-arm64': {
    dotnetArchive: `dotnet-sdk-${dotnetVersion}-osx-arm64.tar.gz`,
    dotnetSha512:
      'e440e9a58d4ff7741c8342ac3e086fa9ee2dadc25e01c0449a88317a74cfbd63625b8092c3b2a131ae14b16ab3401e9cc470e578e4c65a72a0b5786bd2308cde',
    dotnetUrl: `https://builds.dotnet.microsoft.com/dotnet/Sdk/${dotnetVersion}/dotnet-sdk-${dotnetVersion}-osx-arm64.tar.gz`,
    rid: 'osx-arm64',
  },
};

const workspaceRoot = resolve(import.meta.dirname, '../../..');
const desktopRoot = resolve(workspaceRoot, 'apps/desktop');
const resourceRoot = resolve(desktopRoot, 'resources/picogk');
const cacheRoot = resolve(workspaceRoot, 'out/cache/picogk');
const dotnetRoot = resolve(cacheRoot, `dotnet-${dotnetVersion}-darwin-arm64`);
const picoGkSourceRoot = resolve(cacheRoot, `PicoGK-${picoGkCommit}`);
const dotnetProjectRoot = resolve(workspaceRoot, 'packages/plugins/picogk/dotnet');
const workerProject = resolve(dotnetProjectRoot, 'Tau.PicoGK.Worker/Tau.PicoGK.Worker.csproj');
const picoGkLock = resolve(dotnetProjectRoot, 'PicoGK.packages.lock.json');
const picoGkHostedPatch = resolve(dotnetProjectRoot, 'PicoGK.hosted.patch');
const topologySchema = resolve(workspaceRoot, 'packages/core/geometry/schema/tau-cad-topology.schema.json');

const digest = async (path: string, algorithm: 'sha256' | 'sha512' = 'sha256'): Promise<string> =>
  createHash(algorithm)
    .update(await readFile(path))
    .digest('hex');

const parseTargets = (): string[] => {
  const arguments_ = process.argv.slice(2);
  const selected: string[] = [];
  for (let index = 0; index < arguments_.length; index += 1) {
    if (arguments_[index] !== '--target' || !arguments_[index + 1]) {
      throw new TypeError('Usage: prepare-picogk-dotnet.mts [--target darwin-arm64]');
    }
    selected.push(arguments_[index + 1]!);
    index += 1;
  }
  return selected.length > 0 ? selected : [`${process.platform}-${process.arch}`];
};

const download = async (options: {
  readonly algorithm: 'sha256' | 'sha512';
  readonly expected: string;
  readonly name: string;
  readonly url: string;
}): Promise<string> => {
  await mkdir(cacheRoot, { recursive: true });
  const path = resolve(cacheRoot, options.name);
  try {
    if ((await digest(path, options.algorithm)) === options.expected) {
      return path;
    }
  } catch {
    // Download below.
  }
  const response = await fetch(options.url);
  if (!response.ok) {
    throw new Error(`${options.name} download failed with HTTP ${String(response.status)}`);
  }
  const temporary = `${path}.${String(process.pid)}.tmp`;
  await writeFile(temporary, new Uint8Array(await response.arrayBuffer()));
  if ((await digest(temporary, options.algorithm)) !== options.expected) {
    await rm(temporary, { force: true });
    throw new Error(`${options.name} integrity mismatch`);
  }
  await rename(temporary, path);
  return path;
};

const ensureExtracted = async (options: {
  readonly archive: string;
  readonly expectedMarker: string;
  readonly markerName: string;
  readonly root: string;
}): Promise<void> => {
  try {
    const marker = await readFile(resolve(options.root, options.markerName), 'utf8');
    if (marker.trim() === options.expectedMarker) {
      return;
    }
  } catch {
    // Extract below.
  }
  const temporary = `${options.root}.${String(process.pid)}.tmp`;
  await rm(temporary, { recursive: true, force: true });
  await mkdir(temporary, { recursive: true });
  execFileSync('tar', ['-xzf', options.archive, '-C', temporary, '--strip-components=1'], { stdio: 'inherit' });
  await writeFile(resolve(temporary, options.markerName), `${options.expectedMarker}\n`);
  await rm(options.root, { recursive: true, force: true });
  await rename(temporary, options.root);
};

const ensurePatchedPicoGk = async (options: {
  readonly archive: string;
  readonly patchSha256: string;
}): Promise<void> => {
  const markerName = '.tau-picogk-hosted-source';
  const expectedMarker = `${picoGkArchiveSha256}:${options.patchSha256}`;
  try {
    const marker = await readFile(resolve(picoGkSourceRoot, markerName), 'utf8');
    if (marker.trim() === expectedMarker) {
      return;
    }
  } catch {
    // Extract and patch below.
  }
  const temporary = `${picoGkSourceRoot}.${String(process.pid)}.tmp`;
  await rm(temporary, { recursive: true, force: true });
  await mkdir(temporary, { recursive: true });
  execFileSync('tar', ['-xzf', options.archive, '-C', temporary, '--strip-components=1'], { stdio: 'inherit' });
  execFileSync('git', ['apply', '--whitespace=error-all', picoGkHostedPatch], {
    cwd: temporary,
    env: { ...process.env, GIT_CEILING_DIRECTORIES: cacheRoot },
    stdio: 'inherit',
  });
  await writeFile(resolve(temporary, markerName), `${expectedMarker}\n`);
  await rm(picoGkSourceRoot, { recursive: true, force: true });
  await rename(temporary, picoGkSourceRoot);
};

const filesUnder = async (root: string): Promise<string[]> => {
  const files: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        // oxlint-disable-next-line no-await-in-loop -- bounded deterministic filesystem traversal.
        await visit(path);
      } else if (entry.isFile()) {
        files.push(path);
      }
    }
  };
  await visit(root);
  return files.sort();
};

const sourceDigest = async (): Promise<string> => {
  const hash = createHash('sha256');
  const sourceFiles = await filesUnder(dotnetProjectRoot);
  const sources = sourceFiles.filter((path) => !path.includes('/bin/') && !path.includes('/obj/'));
  for (const path of [...sources, topologySchema, import.meta.filename]) {
    hash.update(relative(workspaceRoot, path));
    // oxlint-disable-next-line no-await-in-loop -- file order is part of the deterministic digest.
    hash.update(await readFile(path));
  }
  return hash.digest('hex');
};

const manifestIsCurrent = async (
  output: string,
  expectedSourceDigest: string,
  picoGkHostedPatchSha256: string,
): Promise<boolean> => {
  try {
    const manifest = picogkRuntimeManifestSchema.parse(
      JSON.parse(await readFile(resolve(output, 'tau-runtime-manifest.json'), 'utf8')),
    );
    if (
      manifest.schemaVersion !== 2 ||
      manifest.target !== 'darwin-arm64' ||
      manifest.sourceFilesSha256 !== expectedSourceDigest ||
      manifest.picoGkCommit !== picoGkCommit ||
      manifest.picoGkArchiveSha256 !== picoGkArchiveSha256 ||
      manifest.picoGkHostedPatchSha256 !== picoGkHostedPatchSha256 ||
      manifest.workerSha256 !== (await digest(resolve(output, manifest.workerPath)))
    ) {
      return false;
    }
    for (const resource of manifest.resourceFiles) {
      // oxlint-disable-next-line no-await-in-loop -- fail-fast integrity validation avoids needless rebuilds.
      if (resource.sha256 !== (await digest(resolve(output, resource.path)))) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
};

const prepareTarget = async (targetName: string): Promise<void> => {
  const target = targets[targetName];
  if (!target) {
    throw new Error(`Unsupported PicoGK resource target: ${targetName}`);
  }
  const expectedSourceDigest = await sourceDigest();
  const picoGkHostedPatchSha256 = await digest(picoGkHostedPatch);
  const output = resolve(resourceRoot, targetName);
  if (await manifestIsCurrent(output, expectedSourceDigest, picoGkHostedPatchSha256)) {
    console.log(`PicoGK .NET is current: ${targetName}`);
    return;
  }

  const [dotnetArchive, picoGkArchive] = await Promise.all([
    download({
      algorithm: 'sha512',
      expected: target.dotnetSha512,
      name: target.dotnetArchive,
      url: target.dotnetUrl,
    }),
    download({
      algorithm: 'sha256',
      expected: picoGkArchiveSha256,
      name: `PicoGK-${picoGkCommit}.tar.gz`,
      url: `https://github.com/leap71/PicoGK/archive/${picoGkCommit}.tar.gz`,
    }),
  ]);
  await Promise.all([
    ensureExtracted({
      archive: dotnetArchive,
      expectedMarker: target.dotnetSha512,
      markerName: '.tau-dotnet-archive-sha512',
      root: dotnetRoot,
    }),
    ensurePatchedPicoGk({ archive: picoGkArchive, patchSha256: picoGkHostedPatchSha256 }),
  ]);
  await cp(picoGkLock, resolve(picoGkSourceRoot, 'packages.lock.json'));

  const dotnet = resolve(dotnetRoot, 'dotnet');
  await chmod(dotnet, 0o755);
  const temporary = resolve(resourceRoot, `.${targetName}.${String(process.pid)}.tmp`);
  await rm(temporary, { recursive: true, force: true });
  await mkdir(temporary, { recursive: true });
  const buildEnvironment: NodeJS.ProcessEnv = { ...process.env };
  buildEnvironment['DOTNET_CLI_TELEMETRY_OPTOUT'] = '1';
  buildEnvironment['DOTNET_MULTILEVEL_LOOKUP'] = '0';
  buildEnvironment['DOTNET_NOLOGO'] = '1';
  buildEnvironment['DOTNET_ROOT'] = dotnetRoot;
  buildEnvironment['NUGET_PACKAGES'] = resolve(cacheRoot, 'nuget-packages');
  const projectProperties = [`-p:PicoGKProject=${resolve(picoGkSourceRoot, 'PicoGK.csproj')}`];
  execFileSync(dotnet, ['restore', workerProject, '--runtime', target.rid, '--locked-mode', ...projectProperties], {
    env: buildEnvironment,
    stdio: 'inherit',
  });
  execFileSync(
    dotnet,
    [
      'publish',
      workerProject,
      '--configuration',
      'Release',
      '--runtime',
      target.rid,
      '--self-contained',
      'true',
      '--no-restore',
      '--output',
      temporary,
      ...projectProperties,
    ],
    { env: buildEnvironment, stdio: 'inherit' },
  );
  for (const path of await filesUnder(temporary)) {
    if (path.endsWith('.pdb') || path.endsWith('.xml')) {
      // oxlint-disable-next-line no-await-in-loop -- deterministic bounded publish cleanup.
      await rm(path, { force: true });
    }
  }
  const nativeLibraries = await readdir(resolve(picoGkSourceRoot, 'native/osx-arm64'));
  await Promise.all(
    nativeLibraries.map(async (name) =>
      cp(resolve(picoGkSourceRoot, 'native/osx-arm64', name), resolve(temporary, name)),
    ),
  );
  await Promise.all([
    cp(resolve(picoGkSourceRoot, 'LICENSE'), resolve(temporary, 'PicoGK-LICENSE')),
    cp(resolve(workspaceRoot, 'packages/plugins/picogk/LICENSE'), resolve(temporary, 'Tau-PicoGK-LICENSE')),
    cp(topologySchema, resolve(temporary, basename(topologySchema))),
  ]);

  const workerPath = 'Tau.PicoGK.Worker';
  await chmod(resolve(temporary, workerPath), 0o755);
  await writeFile(
    resolve(temporary, 'tau-picogk-sbom.cdx.json'),
    `${JSON.stringify(
      {
        bomFormat: 'CycloneDX',
        specVersion: '1.6',
        version: 1,
        metadata: {
          component: { type: 'application', name: 'Tau PicoGK C# runtime', version: picoGkCommit },
          properties: [{ name: 'taucad:target', value: targetName }],
        },
        components: [
          { type: 'platform', name: '.NET Runtime', version: dotnetRuntimeVersion },
          { type: 'library', name: 'Microsoft.CodeAnalysis.CSharp', version: roslynVersion },
          {
            type: 'library',
            name: 'PicoGK',
            version: picoGkCommit,
            hashes: [{ alg: 'SHA-256', content: picoGkHostedPatchSha256 }],
          },
        ],
      },
      undefined,
      2,
    )}\n`,
  );
  const publishedFiles = await filesUnder(temporary);
  const resourceFiles = await Promise.all(
    publishedFiles
      .filter((path) => relative(temporary, path) !== workerPath)
      .map(async (path) => ({
        path: relative(temporary, path),
        sha256: await digest(path),
        label: `PicoGK runtime ${relative(temporary, path)}`,
      })),
  );
  const manifest = picogkRuntimeManifestSchema.parse({
    schemaVersion: 2,
    target: targetName,
    rid: target.rid,
    dotnetSdkVersion: dotnetVersion,
    dotnetRuntimeVersion,
    roslynVersion,
    picoGkCommit,
    picoGkArchiveSha256,
    picoGkHostedPatchSha256,
    hostApiVersion: 1,
    protocolVersion: 3,
    sceneArtifactVersion: 3,
    topologySchemaVersion: 1,
    sourceFilesSha256: expectedSourceDigest,
    workerPath,
    workerSha256: await digest(resolve(temporary, workerPath)),
    resourceFiles,
  });
  await writeFile(resolve(temporary, 'tau-runtime-manifest.json'), `${JSON.stringify(manifest, undefined, 2)}\n`);
  await rm(output, { recursive: true, force: true });
  await rename(temporary, output);
  console.log(`Prepared PicoGK .NET: ${targetName}`);
};

await Promise.all(parseTargets().map(async (target) => prepareTarget(target)));
