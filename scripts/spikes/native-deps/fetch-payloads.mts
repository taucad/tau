#!/usr/bin/env node

/**
 * Purpose: Download, digest-check and list the registry-native payloads of the two closures as data,
 *   and write the unpack plan for unpack.mts.
 * Why: Spike S13 unpacks exactly the bytes a registry-native closure would carry: the stripped
 *   python-build-standalone archive and the wheels the producer installed (by lock digest), and the
 *   Microsoft .NET runtime archive plus the Tau layer. Nothing downloaded is executed.
 * Environment: Node 24+ with network; trees produced by desktop:prepare-build123d-python and
 *   desktop:prepare-picogk-dotnet.
 * Usage: node --import @oxc-node/core/register scripts/spikes/native-deps/fetch-payloads.mts
 *   --python-tree <dir> --picogk-tree <dir> --cache <dir> --plan <plan.json> --layer-list <file> --layer-archive <file>
 *   [--out <summary.json>]
 * Exit codes: 0 when every payload matches its published digest; 1 otherwise.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, relative, resolve } from 'node:path';
import process from 'node:process';
import { gunzipSync } from 'node:zlib';

/* oxlint-disable no-restricted-imports -- spike-only scripts outside a package import their siblings and the kernel sessions, which are not public exports, by relative path; deleted with their W package. */
import { readTarEntries } from './archive.mts';
import { emit, parseFlags, requiredFlag } from './spike-common.mts';
/* oxlint-enable no-restricted-imports */

const repoRoot = resolve(import.meta.dirname, '../../..');
const dotnetRuntimeVersion = '10.0.11';

const download = async (
  url: string,
  path: string,
  check: (bytes: Uint8Array<ArrayBuffer>) => boolean,
): Promise<number> => {
  if (existsSync(path)) {
    const cached = new Uint8Array(readFileSync(path));
    if (check(cached)) {
      return cached.byteLength;
    }
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`download failed with HTTP ${String(response.status)}: ${url}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!check(bytes)) {
    throw new Error(`digest mismatch: ${url}`);
  }
  await writeFile(path, bytes);
  return bytes.byteLength;
};
const sha = (algorithm: string, bytes: Uint8Array<ArrayBuffer>): string =>
  createHash(algorithm).update(bytes).digest('hex');
const normalizeName = (name: string): string => name.toLowerCase().replaceAll(/[-_.]+/gu, '-');

/** Expand a wheel filename's compressed tag sets into `py-abi-platform` triples. */
const wheelTags = (filename: string): Set<string> => {
  const parts = filename.replace(/\.whl$/u, '').split('-');
  const [python, abi, platform] = parts.slice(-3) as [string, string, string];
  const tags = new Set<string>();
  for (const p of python.split('.')) {
    for (const a of abi.split('.')) {
      for (const pl of platform.split('.')) {
        tags.add(`${p}-${a}-${pl}`);
      }
    }
  }
  return tags;
};

const parseLock = (body: string): Map<string, { version: string; hashes: Set<string> }> => {
  const pins = new Map<string, { version: string; hashes: Set<string> }>();
  let current: { version: string; hashes: Set<string> } | undefined;
  for (const line of body.split('\n')) {
    const pin = /^([A-Za-z0-9_.-]+)==([^\s;\\]+)/u.exec(line);
    if (pin) {
      current = { version: pin[2]!, hashes: new Set() };
      pins.set(`${normalizeName(pin[1]!)}==${pin[2]!}`, current);
      continue;
    }
    const hash = /--hash=sha256:([0-9a-f]{64})/u.exec(line);
    if (hash && current) {
      current.hashes.add(hash[1]!);
    }
  }
  return pins;
};

const main = async (): Promise<void> => {
  const flags = parseFlags(['python-tree', 'picogk-tree', 'cache', 'plan', 'layer-list', 'layer-archive', 'out']);
  const pythonTree = resolve(requiredFlag(flags, 'python-tree'));
  const picogkTree = resolve(requiredFlag(flags, 'picogk-tree'));
  const cache = resolve(requiredFlag(flags, 'cache'));
  await mkdir(join(cache, 'wheels'), { recursive: true });

  // 1. python-build-standalone, the stripped variant the charter pins (D17).
  const sourceManifest = JSON.parse(
    readFileSync(resolve(repoRoot, 'apps/desktop/resources/python/manifest.json'), 'utf8'),
  ) as {
    pythonBuildStandaloneRelease: string;
    targets: Record<string, { archive: string }>;
  };
  const release = sourceManifest.pythonBuildStandaloneRelease;
  const archiveName = sourceManifest.targets['darwin-arm64']!.archive.replace('install_only', 'install_only_stripped');
  const releaseBase = `https://github.com/astral-sh/python-build-standalone/releases/download/${release}`;
  const sumsResponse = await fetch(`${releaseBase}/SHA256SUMS`);
  const sums = await sumsResponse.text();
  const expectedPbs = sums
    .split('\n')
    .find((line) => line.trim().endsWith(archiveName))
    ?.split(/\s+/u)[0];
  if (!expectedPbs) {
    throw new Error(`SHA256SUMS of ${release} has no ${archiveName}`);
  }
  const pbsPath = join(cache, archiveName);
  const pbsBytes = await download(
    `${releaseBase}/${encodeURIComponent(archiveName)}`,
    pbsPath,
    (bytes) => sha('sha256', bytes) === expectedPbs,
  );

  // 2. The wheels the producer installed, chosen by lock digest and installed WHEEL tag.
  const pins = parseLock(
    readFileSync(resolve(repoRoot, 'packages/plugins/build123d/python/requirements.lock'), 'utf8'),
  );
  const sitePackagesRelative = 'lib/python3.13/site-packages';
  const sitePackages = join(pythonTree, sitePackagesRelative);
  const baseDistributions = new Set(['pip']);
  const skipped: string[] = [];
  const wheels: Array<{
    name: string;
    version: string;
    filename: string;
    sha256: string;
    byteLength: number;
    tags: string[];
  }> = [];
  for (const directory of readdirSync(sitePackages)
    .filter((name) => name.endsWith('.dist-info'))
    .sort()) {
    const [distribution, version] = directory.replace(/\.dist-info$/u, '').split('-') as [string, string];
    const pin = pins.get(`${normalizeName(distribution)}==${version}`);
    if (!pin && baseDistributions.has(normalizeName(distribution))) {
      // Shipped inside the python-build-standalone archive itself, not a wheel payload.
      skipped.push(directory);
      continue;
    }
    if (!pin) {
      throw new Error(`installed ${directory} is not pinned in requirements.lock`);
    }
    const installedTags = new Set(
      readFileSync(join(sitePackages, directory, 'WHEEL'), 'utf8')
        .split('\n')
        .filter((line) => line.startsWith('Tag: '))
        .map((line) => line.slice(5).trim()),
    );
    // oxlint-disable-next-line no-await-in-loop -- registry metadata is read once per distribution.
    const metadataResponse = await fetch(`https://pypi.org/pypi/${normalizeName(distribution)}/${version}/json`);
    // oxlint-disable-next-line no-await-in-loop -- registry metadata is read once per distribution.
    const metadata = (await metadataResponse.json()) as {
      urls: Array<{ filename: string; url: string; size: number; digests: { sha256: string }; packagetype: string }>;
    };
    const file = metadata.urls.find(
      (candidate) =>
        candidate.packagetype === 'bdist_wheel' &&
        pin.hashes.has(candidate.digests.sha256) &&
        [...wheelTags(candidate.filename)].some((tag) => installedTags.has(tag)),
    );
    if (!file) {
      throw new Error(`no locked wheel of ${directory} carries the installed tags ${[...installedTags].join(', ')}`);
    }
    const path = join(cache, 'wheels', file.filename);
    // oxlint-disable-next-line no-await-in-loop -- serial download keeps the registry load polite.
    const byteLength = await download(file.url, path, (bytes) => sha('sha256', bytes) === file.digests.sha256);
    wheels.push({
      name: distribution,
      version,
      filename: file.filename,
      sha256: file.digests.sha256,
      byteLength,
      tags: [...installedTags],
    });
  }

  // 3. The Microsoft .NET runtime archive, pinned by Microsoft's published SHA-512.
  const releasesResponse = await fetch(
    'https://builds.dotnet.microsoft.com/dotnet/release-metadata/10.0/releases.json',
  );
  const releases = (await releasesResponse.json()) as {
    releases: Array<{
      runtime?: { version: string; files: Array<{ name: string; rid: string; url: string; hash: string }> };
    }>;
  };
  const runtimeFile = releases.releases
    .find((entry) => entry.runtime?.version === dotnetRuntimeVersion)
    ?.runtime?.files.find((file) => file.rid === 'osx-arm64' && file.name.endsWith('.tar.gz'));
  if (!runtimeFile) {
    throw new Error(`no osx-arm64 runtime archive for ${dotnetRuntimeVersion}`);
  }
  const runtimePath = join(cache, basename(new URL(runtimeFile.url).pathname));
  const runtimeBytes = await download(
    runtimeFile.url,
    runtimePath,
    (bytes) => sha('sha512', bytes) === runtimeFile.hash,
  );
  const runtimeNames = new Set(
    readTarEntries(new Uint8Array(gunzipSync(readFileSync(runtimePath))))
      .filter(
        (entry) =>
          entry.type === 'file' &&
          entry.path.replace(/^\.\//u, '').startsWith(`shared/Microsoft.NETCore.App/${dotnetRuntimeVersion}/`),
      )
      .map((entry) => basename(entry.path)),
  );

  // 4. The Tau layer: every file of the self-contained tree that the runtime archive does not provide.
  const treeFiles: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(path);
      } else {
        treeFiles.push(relative(picogkTree, path));
      }
    }
  };
  visit(picogkTree);
  const layerFiles = treeFiles.filter((path) => path.includes('/') || !runtimeNames.has(path)).sort();
  writeFileSync(requiredFlag(flags, 'layer-list'), `${layerFiles.join('\n')}\n`);

  const plan = {
    closures: {
      python: [
        { kind: 'tar.gz', path: pbsPath, stripComponents: 1, destination: 'python' },
        ...wheels.map((wheel) => ({
          kind: 'wheel',
          path: join(cache, 'wheels', wheel.filename),
          destination: `python/${sitePackagesRelative}`,
        })),
      ],
      picogk: [
        { kind: 'tar.gz', path: runtimePath, stripComponents: 0, destination: 'dotnet' },
        {
          kind: 'tar.gz',
          path: resolve(requiredFlag(flags, 'layer-archive')),
          stripComponents: 0,
          destination: 'dotnet/tau-worker',
        },
      ],
    },
  };
  await writeFile(requiredFlag(flags, 'plan'), JSON.stringify(plan, undefined, 2));
  emit(flags.get('out'), {
    spike: 'fetch-payloads',
    pythonBuildStandalone: { archive: archiveName, sha256: expectedPbs, byteLength: pbsBytes },
    wheelCount: wheels.length,
    skippedBaseDistributions: skipped,
    wheelBytes: wheels.reduce((sum, wheel) => sum + wheel.byteLength, 0),
    wheels,
    dotnetRuntime: {
      url: runtimeFile.url,
      sha512: runtimeFile.hash,
      byteLength: runtimeBytes,
      frameworkFiles: runtimeNames.size,
    },
    picogkTreeFiles: treeFiles.length,
    layerFiles: layerFiles.length,
  });
};

try {
  await main();
} catch (error) {
  console.error('fetch-payloads failed:', error);
  process.exit(1);
}
