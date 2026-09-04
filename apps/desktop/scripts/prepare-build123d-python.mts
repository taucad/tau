#!/usr/bin/env node

/**
 * Purpose: Assemble a reproducible, offline Build123d Python resource for Electron.
 * Why: Native kernels must never discover system Python or install packages at runtime.
 * Environment: Node 24+, uv, tar, and network access on the target architecture.
 * Usage: node --import @oxc-node/core/register apps/desktop/scripts/prepare-build123d-python.mts [--target platform-arch]
 * Exit codes: 0 for an integrity-verified resource; non-zero for unsupported targets or any hash/install failure.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

type Target = {
  readonly archive: string;
  readonly sha256: string;
  readonly pythonRelativePath: string;
};

type SourceManifest = {
  readonly schemaVersion: 1;
  readonly pythonVersion: string;
  readonly pythonBuildStandaloneRelease: string;
  readonly build123dVersion: string;
  readonly ocpVersion: string;
  readonly protocolVersion: 1;
  readonly targets: Record<string, Target>;
};

type Distribution = {
  readonly name: string;
  readonly version: string;
  readonly license: string;
};

const workspaceRoot = resolve(import.meta.dirname, '../../..');
const desktopRoot = resolve(workspaceRoot, 'apps/desktop');
const resourceRoot = resolve(desktopRoot, 'resources/python');
const cacheRoot = resolve(workspaceRoot, 'out/cache/python-build-standalone');
const pythonSourceRoot = resolve(workspaceRoot, 'packages/plugins/build123d/python');
const requirementsLock = resolve(pythonSourceRoot, 'requirements.lock');
const topologySchema = resolve(workspaceRoot, 'packages/core/geometry/schema/tau-cad-topology.schema.json');
const sourceManifest = JSON.parse(await readFile(resolve(resourceRoot, 'manifest.json'), 'utf8')) as SourceManifest;

const digest = async (path: string): Promise<string> =>
  createHash('sha256')
    .update(await readFile(path))
    .digest('hex');

const parseTargets = (): string[] => {
  const arguments_ = process.argv.slice(2);
  const targets: string[] = [];
  for (let index = 0; index < arguments_.length; index += 1) {
    if (arguments_[index] !== '--target' || !arguments_[index + 1]) {
      throw new TypeError('Usage: prepare-build123d-python.mts [--target platform-arch]');
    }
    targets.push(arguments_[index + 1]!);
    index += 1;
  }
  return targets.length > 0 ? targets : [`${process.platform}-${process.arch}`];
};

const downloadArchive = async (target: Target): Promise<string> => {
  await mkdir(cacheRoot, { recursive: true });
  const path = resolve(cacheRoot, target.archive);
  try {
    if ((await digest(path)) === target.sha256) {
      return path;
    }
  } catch {
    // Download below.
  }
  const url = `https://github.com/astral-sh/python-build-standalone/releases/download/${sourceManifest.pythonBuildStandaloneRelease}/${encodeURIComponent(target.archive)}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Python download failed with HTTP ${String(response.status)}`);
  }
  const temporary = `${path}.${String(process.pid)}.tmp`;
  await writeFile(temporary, new Uint8Array(await response.arrayBuffer()));
  if ((await digest(temporary)) !== target.sha256) {
    await rm(temporary, { force: true });
    throw new Error(`Python archive integrity mismatch: ${target.archive}`);
  }
  await rename(temporary, path);
  return path;
};

const findSitePackages = async (root: string): Promise<string> => {
  const candidates: string[] = [];
  const visit = async (directory: string, depth: number): Promise<void> => {
    if (depth > 5) {
      return;
    }
    const entries = await readdir(directory, { withFileTypes: true });
    await Promise.all(
      entries.flatMap((entry) => {
        if (!entry.isDirectory()) {
          return [];
        }
        const path = join(directory, entry.name);
        if (entry.name === 'site-packages') {
          candidates.push(path);
          return [];
        }
        return [visit(path, depth + 1)];
      }),
    );
  };
  await visit(root, 0);
  if (candidates.length !== 1) {
    throw new Error(`Expected one site-packages directory, found ${String(candidates.length)}`);
  }
  return candidates[0]!;
};

const copyLicenses = async (sitePackages: string, output: string): Promise<void> => {
  await mkdir(output, { recursive: true });
  const entries = await readdir(sitePackages, { withFileTypes: true });
  await Promise.all(
    entries.map(async (entry) => {
      if (!entry.isDirectory() || !entry.name.endsWith('.dist-info')) {
        return;
      }
      const licenses = join(sitePackages, entry.name, 'licenses');
      try {
        const metadata = await stat(licenses);
        if (metadata.isDirectory()) {
          await cp(licenses, join(output, entry.name), { recursive: true });
        }
      } catch {
        // Some wheels state their license only in METADATA; the SBOM retains that record.
      }
    }),
  );
};

const prepareTarget = async (targetName: string): Promise<void> => {
  const target = sourceManifest.targets[targetName];
  if (!target) {
    throw new Error(`Unsupported Python resource target: ${targetName}`);
  }
  const output = resolve(resourceRoot, targetName);
  const workerFiles = ['worker.py', 'analyzer.py', 'glb.py'] as const;
  const sourceFilesSha256 = createHash('sha256');
  const sourceContents = await Promise.all(
    [...workerFiles.map((name) => resolve(pythonSourceRoot, name)), topologySchema, import.meta.filename].map(
      async (path) => readFile(path),
    ),
  );
  for (const contents of sourceContents) {
    sourceFilesSha256.update(contents);
  }
  const expectedSourceFilesSha256 = sourceFilesSha256.digest('hex');
  try {
    const installed = JSON.parse(await readFile(join(output, 'tau-runtime-manifest.json'), 'utf8')) as {
      sourceArchiveSha256?: string;
      requirementsSha256?: string;
      sourceFilesSha256?: string;
      sbom?: { readonly path?: string; readonly sha256?: string };
    };
    if (
      installed.sourceArchiveSha256 === target.sha256 &&
      installed.requirementsSha256 === (await digest(requirementsLock)) &&
      installed.sourceFilesSha256 === expectedSourceFilesSha256 &&
      installed.sbom?.path &&
      installed.sbom.sha256 === (await digest(resolve(output, installed.sbom.path)))
    ) {
      console.log(`Build123d Python is current: ${targetName}`);
      return;
    }
  } catch {
    // Assemble below.
  }

  const archive = await downloadArchive(target);
  const temporary = resolve(resourceRoot, `.${targetName}.${String(process.pid)}.tmp`);
  await rm(temporary, { recursive: true, force: true });
  await mkdir(temporary, { recursive: true });
  execFileSync('tar', ['-xzf', archive, '-C', temporary, '--strip-components=1'], { stdio: 'inherit' });
  const pythonExecutable = resolve(temporary, target.pythonRelativePath);
  execFileSync(
    'uv',
    ['pip', 'install', '--python', pythonExecutable, '--require-hashes', '--no-deps', '-r', requirementsLock],
    { stdio: 'inherit' },
  );

  const workerRoot = resolve(temporary, 'tau-worker');
  await mkdir(workerRoot);
  await Promise.all(workerFiles.map(async (name) => cp(resolve(pythonSourceRoot, name), resolve(workerRoot, name))));
  await cp(topologySchema, resolve(workerRoot, basename(topologySchema)));

  const distributions = JSON.parse(
    execFileSync(
      pythonExecutable,
      [
        '-I',
        '-c',
        'import importlib.metadata,json;print(json.dumps(sorted(({"name":d.metadata["Name"],"version":d.version,"license":d.metadata.get("License-Expression") or d.metadata.get("License") or "UNKNOWN"} for d in importlib.metadata.distributions()),key=lambda x:x["name"].lower())))',
      ],
      { encoding: 'utf8' },
    ),
  ) as Distribution[];
  const sitePackages = await findSitePackages(temporary);
  await copyLicenses(sitePackages, resolve(temporary, 'tau-licenses'));
  const sbomPath = 'tau-python-sbom.cdx.json';
  await writeFile(
    resolve(temporary, sbomPath),
    `${JSON.stringify(
      {
        bomFormat: 'CycloneDX',
        specVersion: '1.6',
        version: 1,
        metadata: {
          component: {
            type: 'application',
            name: 'Tau Build123d Python runtime',
            version: `${sourceManifest.build123dVersion}+python${sourceManifest.pythonVersion}.ocp${sourceManifest.ocpVersion}`,
          },
          properties: [{ name: 'taucad:target', value: targetName }],
        },
        components: [
          { type: 'platform', name: 'CPython', version: sourceManifest.pythonVersion },
          ...distributions.map((distribution) => ({
            type: 'library',
            name: distribution.name,
            version: distribution.version,
            ...(distribution.license === 'UNKNOWN' ? {} : { licenses: [{ license: { name: distribution.license } }] }),
          })),
        ],
      },
      undefined,
      2,
    )}\n`,
  );
  const workerSha256 = await digest(resolve(workerRoot, 'worker.py'));
  const supportFiles = await Promise.all(
    ['analyzer.py', 'glb.py'].map(async (name) => ({
      path: `tau-worker/${name}`,
      sha256: await digest(resolve(workerRoot, name)),
    })),
  );
  await writeFile(
    resolve(temporary, 'tau-runtime-manifest.json'),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        target: targetName,
        pythonVersion: sourceManifest.pythonVersion,
        build123dVersion: sourceManifest.build123dVersion,
        ocpVersion: sourceManifest.ocpVersion,
        protocolVersion: sourceManifest.protocolVersion,
        sourceArchive: target.archive,
        sourceArchiveSha256: target.sha256,
        requirementsSha256: await digest(requirementsLock),
        sourceFilesSha256: expectedSourceFilesSha256,
        pythonRelativePath: target.pythonRelativePath,
        pythonSha256: await digest(pythonExecutable),
        workerPath: 'tau-worker/worker.py',
        workerSha256,
        supportFiles,
        topologySchema: {
          path: `tau-worker/${basename(topologySchema)}`,
          sha256: await digest(resolve(workerRoot, basename(topologySchema))),
        },
        sbom: { path: sbomPath, sha256: await digest(resolve(temporary, sbomPath)) },
        distributions,
      },
      undefined,
      2,
    )}\n`,
  );
  await rm(output, { recursive: true, force: true });
  await rename(temporary, output);
  console.log(`Prepared Build123d Python: ${targetName}`);
};

await Promise.all(
  parseTargets().map(async (target) => {
    await prepareTarget(target);
  }),
);
