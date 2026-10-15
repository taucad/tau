#!/usr/bin/env node

/**
 * Purpose: Generate Build123d's `tau-plugin.json`, its per-target `pylock.<target>.toml` files and its CycloneDX
 * SBOM from `python/requirements.lock` and `python/interpreter.json`; fill a payload seed; record a golden receipt.
 * Why: Every byte the native kernel runs is pinned by digest in a file Tau ships (I1). The pins are transcoded to SRI
 * only from bytes this script downloaded and verified against the publisher's own digest (D2, R1), so nothing is
 * re-hashed or hand-copied, and `--check` catches any drift as a reviewed diff (I13).
 * Environment: Node 24+, network access to pypi.org, files.pythonhosted.org and github.com (generate, check, seed).
 * Usage:
 *   node --import @oxc-node/core/register packages/plugins/build123d/scripts/generate-tau-plugin.mts [--check]
 *   node --import @oxc-node/core/register packages/plugins/build123d/scripts/generate-tau-plugin.mts seed [--target <key>]
 *   node --import @oxc-node/core/register packages/plugins/build123d/scripts/generate-tau-plugin.mts golden
 *   Options: --seed <dir> (default out/cache/build123d-seed; the download cache and the payload seed are one
 *   digest-addressed directory, `blobs/sha256/<hex>`), --store <dir> (golden only).
 * Exit codes: 0 on success or when `--check` finds the committed files current; 1 when `--check` finds a difference
 * or any download, digest or lock check fails.
 */

/* oxlint-disable no-await-in-loop -- downloads and file comparisons run in a bounded, deterministic order. */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import {
  fetchVerified,
  gunzip,
  integrityFromHex,
  integrityToHex,
  readTarEntries,
  readWheel,
} from '@taucad/archive-core';
import {
  computeClosureIntegrity,
  createPreparationHost,
  detectHostIndicators,
  parsePluginDeployment,
  selectVariant,
  targetKey,
} from '@taucad/runtime/preparation/node';
import type { DependencyPayload, DependencyVariant, PluginDeployment } from '@taucad/runtime/preparation/node';

import { build123dLaunchSet, sealBuild123dClosure } from '#build123d-closure.js';

// oxlint-disable-next-line no-restricted-imports -- The generator's own sibling module; scripts have no `#` alias.
import * as generator from './tau-plugin-generator.mjs';

const { compactLock, normalizeName, parseRequirementsLock, renderPylock, variantFloor } = generator;
type IndexFile = generator.IndexFile;
type LockPin = generator.LockPin;
type SelectedWheel = generator.SelectedWheel;
type TargetConfig = generator.TargetConfig;

const packageName = '@taucad/build123d';
const dependencyName = 'engine';
const repoRoot = resolve(import.meta.dirname, '../../../..');
const packageRoot = resolve(import.meta.dirname, '..');
const pythonRoot = resolve(packageRoot, 'python');
const manifestPath = resolve(packageRoot, 'tau-plugin.json');
const sbomPath = resolve(packageRoot, 'tau-plugin.cdx.json');
const goldenPath = resolve(packageRoot, 'tau-plugin.golden.json');
const sitePackages = 'python/lib/python3.13/site-packages';
const workerFiles = ['worker.py', 'analyzer.py', 'glb.py', 'native_materials.py', 'mechanisms.py'] as const;
const downloadConcurrency = 6;
const metadataConcurrency = 8;
const unboundedLimits = { maximumUnpackedBytes: 4 * 1024 ** 3, maximumEntries: 1_000_000 };

type InterpreterFile = {
  readonly python: string;
  readonly release: string;
  readonly targets: readonly TargetConfig[];
};

type Golden = Readonly<
  Record<
    string,
    {
      readonly closureIntegrity: string;
      readonly treeIntegrity: string;
      readonly fileCount: number;
      readonly byteLength: number;
    }
  >
>;

/** A third-party blob the manifest pins: where it is served and the digest its publisher states. */
type Blob = { readonly url: string; readonly sha256: string; readonly byteLength: number; readonly label: string };

const parseArguments = (): {
  readonly mode: 'generate' | 'seed' | 'golden';
  readonly check: boolean;
  readonly seed: string;
  readonly store?: string;
  readonly target?: string;
} => {
  const argv = process.argv.slice(2);
  const mode = argv[0] === 'seed' || argv[0] === 'golden' ? argv.shift()! : 'generate';
  let check = false;
  let seed = resolve(repoRoot, 'out/cache/build123d-seed');
  let store: string | undefined;
  let target: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const next = (): string => {
      const value = argv[index + 1];
      if (value === undefined) {
        throw new TypeError(`${String(flag)} needs a value`);
      }
      index += 1;
      return value;
    };
    if (flag === '--check' && mode === 'generate') {
      check = true;
    } else if (flag === '--seed') {
      seed = resolve(next());
    } else if (flag === '--store' && mode === 'golden') {
      store = resolve(next());
    } else if (flag === '--target' && mode === 'seed') {
      target = next();
    } else {
      throw new TypeError(
        'Usage: generate-tau-plugin.mts [--check] | seed [--target <key>] | golden [--store <dir>]; each with [--seed <dir>]',
      );
    }
  }
  return {
    mode: mode as 'generate' | 'seed' | 'golden',
    check,
    seed,
    ...(store === undefined ? {} : { store }),
    ...(target === undefined ? {} : { target }),
  };
};

const mapConcurrent = async <T, R>(items: readonly T[], limit: number, map: (item: T) => Promise<R>): Promise<R[]> => {
  const results: R[] = Array.from({ length: items.length });
  let next = 0;
  const lane = async (): Promise<void> => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await map(items[index]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  return results;
};

const sha256Hex = (bytes: Uint8Array<ArrayBuffer>): string => createHash('sha256').update(bytes).digest('hex');

const blobPath = (seed: string, sha256: string): string => join(seed, 'blobs', 'sha256', sha256);

/**
 * The verified bytes of a blob: from the seed when its bytes hash to their name, else downloaded and verified against
 * the publisher's digest before they are written to the seed.
 */
const verifiedBlob = async (seed: string, blob: Blob): Promise<Uint8Array<ArrayBuffer>> => {
  const path = blobPath(seed, blob.sha256);
  if (existsSync(path)) {
    const bytes = new Uint8Array(await readFile(path));
    if (sha256Hex(bytes) === blob.sha256 && bytes.byteLength === blob.byteLength) {
      return bytes;
    }
  }
  const bytes = await fetchVerified({
    url: blob.url,
    integrity: integrityFromHex('sha256', blob.sha256),
    byteLength: blob.byteLength,
    signal: AbortSignal.timeout(30 * 60 * 1000),
  });
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${String(process.pid)}.tmp`;
  await writeFile(temporary, bytes);
  await rename(temporary, path);
  console.log(`verified ${blob.label} (${(blob.byteLength / 1e6).toFixed(1)} MB)`);
  return bytes;
};

const fetchJson = async (url: string): Promise<unknown> => {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      if (!response.ok) {
        throw new Error(`HTTP ${String(response.status)}`);
      }
      return await response.json();
    } catch (error) {
      if (attempt === 3) {
        throw new Error(`GET ${url} failed: ${error instanceof Error ? error.message : String(error)}`, {
          cause: error,
        });
      }
    }
  }
};

type PypiRelease = {
  readonly urls: ReadonlyArray<{
    readonly filename: string;
    readonly url: string;
    readonly size: number;
    readonly yanked?: boolean;
    readonly digests: { readonly sha256: string };
  }>;
  readonly info: {
    readonly name: string;
    // PyPI sends JSON null for an absent license; `??` below treats it as missing.
    readonly license?: string;
    readonly license_expression?: string;
  };
};

/** PyPI's JSON API for every pinned release: the files it serves (digest, size, URL, yanked) and its license. */
const readIndex = async (
  pins: readonly LockPin[],
): Promise<{ readonly files: Map<string, IndexFile[]>; readonly licenses: Map<string, string | undefined> }> => {
  const releases = await mapConcurrent(pins, metadataConcurrency, async (pin) => {
    const release = (await fetchJson(`https://pypi.org/pypi/${pin.name}/${pin.version}/json`)) as PypiRelease;
    return [pin, release] as const;
  });
  const files = new Map<string, IndexFile[]>();
  const licenses = new Map<string, string | undefined>();
  for (const [pin, release] of releases) {
    files.set(
      `${pin.name}==${pin.version}`,
      release.urls.map((file) => ({
        filename: file.filename,
        url: file.url,
        sha256: file.digests.sha256.toLowerCase(),
        size: file.size,
        yanked: file.yanked === true,
      })),
    );
    const expression = release.info.license_expression ?? undefined;
    const name = release.info.license ?? undefined;
    licenses.set(
      pin.name,
      expression ??
        (name !== undefined && name.length > 0 && name.length <= 64 && !name.includes('\n') ? name : undefined),
    );
  }
  return { files, licenses };
};

/** The publisher's SHA256SUMS for the interpreter release: asset name to hex digest. */
const readInterpreterSums = async (release: string): Promise<Map<string, string>> => {
  const url = `https://github.com/astral-sh/python-build-standalone/releases/download/${release}/SHA256SUMS`;
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) {
    throw new Error(`GET ${url} failed: HTTP ${String(response.status)}`);
  }
  const sums = new Map<string, string>();
  const text = await response.text();
  for (const line of text.split('\n')) {
    const match = /^(?<hex>[\da-f]{64})\s+\*?(?<asset>\S+)$/u.exec(line.trim());
    if (match !== null) {
      sums.set(match.groups!['asset']!, match.groups!['hex']!);
    }
  }
  return sums;
};

const interpreterUrl = (release: string, asset: string): string =>
  `https://github.com/astral-sh/python-build-standalone/releases/download/${release}/${encodeURIComponent(asset)}`;

/** Bytes a payload unpacks to, read with the same readers the installer uses, so admission matches the install. */
const unpackedBytes = async (format: 'tar.gz' | 'wheel', bytes: Uint8Array<ArrayBuffer>): Promise<number> => {
  if (format === 'wheel') {
    const wheel = await readWheel(bytes, unboundedLimits);
    return [...wheel.entries, ...wheel.data].reduce((sum, entry) => sum + entry.bytes.byteLength, 0);
  }
  const tar = await gunzip(bytes, unboundedLimits);
  return readTarEntries(tar, { ...unboundedLimits, stripComponents: 1, links: 'contained' }).entries.reduce(
    (sum, entry) => sum + entry.bytes.byteLength,
    0,
  );
};

const nativeTarget = (target: TargetConfig, floor: string): DependencyVariant['target'] =>
  target.os === 'linux'
    ? { runtime: 'native', os: 'linux', arch: target.arch, libc: 'glibc', minimumLibcVersion: floor }
    : { runtime: 'native', os: 'darwin', arch: target.arch, minimumOsVersion: floor };

const workerPayloads = async (): Promise<DependencyPayload[]> =>
  Promise.all(
    workerFiles.map(async (name) => {
      const bytes = new Uint8Array(await readFile(resolve(pythonRoot, name)));
      return {
        name,
        integrity: integrityFromHex('sha256', sha256Hex(bytes)) as DependencyPayload['integrity'],
        byteLength: bytes.byteLength,
        format: 'raw',
        origin: { kind: 'packagePath', path: `python/${name}` },
        destination: 'tau-worker',
      } satisfies DependencyPayload;
    }),
  );

type Generated = { readonly files: Map<string, string>; readonly deployment: PluginDeployment };

const generate = async (seed: string): Promise<Generated> => {
  const interpreter = JSON.parse(await readFile(resolve(pythonRoot, 'interpreter.json'), 'utf8')) as InterpreterFile;
  const pins = parseRequirementsLock(await readFile(resolve(pythonRoot, 'requirements.lock'), 'utf8'));
  const [{ files: index, licenses }, sums] = await Promise.all([
    readIndex(pins),
    readInterpreterSums(interpreter.release),
  ]);
  const selections = interpreter.targets.map((target) => ({ target, wheels: compactLock(pins, index, target) }));

  // Every blob once: the interpreters, then the wheels, each verified against its publisher's digest.
  const blobs = new Map<string, Blob & { readonly format: 'tar.gz' | 'wheel' }>();
  for (const { target, wheels } of selections) {
    const { asset, sha256, byteLength } = target.interpreter;
    if (sums.get(asset) !== sha256) {
      throw new Error(
        `${asset}: interpreter.json pins ${sha256}, the release's SHA256SUMS states ${String(sums.get(asset))}`,
      );
    }
    blobs.set(sha256, {
      url: interpreterUrl(interpreter.release, asset),
      sha256,
      byteLength,
      label: asset,
      format: 'tar.gz',
    });
    for (const { file } of wheels) {
      blobs.set(file.sha256, {
        url: file.url,
        sha256: file.sha256,
        byteLength: file.size,
        label: file.filename,
        format: 'wheel',
      });
    }
  }
  const unpacked = new Map(
    await mapConcurrent([...blobs.values()], downloadConcurrency, async (blob) => {
      const bytes = await verifiedBlob(seed, blob);
      return [blob.sha256, await unpackedBytes(blob.format, bytes)] as const;
    }),
  );
  const unpackedOf = (sha256: string): number => unpacked.get(sha256)!;

  const workers = await workerPayloads();
  const variants = selections.map(({ target, wheels }): DependencyVariant => {
    const python: DependencyPayload = {
      name: 'python',
      integrity: integrityFromHex('sha256', target.interpreter.sha256) as DependencyPayload['integrity'],
      byteLength: target.interpreter.byteLength,
      format: 'tar.gz',
      origin: { kind: 'url', urls: [interpreterUrl(interpreter.release, target.interpreter.asset)] },
      destination: 'python',
      stripComponents: 1,
      unpackedByteLength: unpackedOf(target.interpreter.sha256),
    };
    const wheelPayloads = wheels.map(
      ({ pin, file }): DependencyPayload => ({
        name: pin.name,
        integrity: integrityFromHex('sha256', file.sha256) as DependencyPayload['integrity'],
        byteLength: file.size,
        format: 'wheel',
        origin: { kind: 'url', urls: [file.url] },
        destination: sitePackages,
        unpackedByteLength: unpackedOf(file.sha256),
      }),
    );
    return {
      target: nativeTarget(target, variantFloor(target, wheels)),
      payloads: [python, ...wheelPayloads, ...workers],
    };
  });

  const deployment: PluginDeployment = {
    schemaVersion: 1,
    dependencies: { [dependencyName]: variants as [DependencyVariant, ...DependencyVariant[]] },
    kernels: { build123d: { requires: [dependencyName], extensions: ['py'] } },
  };
  // Schema v1 admits no comment field: the pylock headers and the SBOM say where every pin comes from.
  const manifestText = `${JSON.stringify(deployment, undefined, 2)}\n`;
  // The host reads the manifest through the same validator, so a generator bug fails here and not on a user's machine.
  parsePluginDeployment(JSON.parse(manifestText), 'generated tau-plugin.json');

  const files = new Map<string, string>([[manifestPath, manifestText]]);
  for (const { target, wheels } of selections) {
    files.set(resolve(pythonRoot, `pylock.${target.key}.toml`), renderPylock(target, wheels));
  }
  files.set(sbomPath, renderSbom({ interpreter, selections, workers, licenses }));
  return { files, deployment };
};

const renderSbom = (input: {
  readonly interpreter: InterpreterFile;
  readonly selections: ReadonlyArray<{ readonly target: TargetConfig; readonly wheels: readonly SelectedWheel[] }>;
  readonly workers: readonly DependencyPayload[];
  readonly licenses: ReadonlyMap<string, string | undefined>;
}): string => {
  type Component = {
    readonly ref: string;
    readonly value: Record<string, unknown>;
    readonly targets: Set<string>;
  };
  const components = new Map<string, Component>();
  const add = (ref: string, value: Record<string, unknown>, target: string): void => {
    const existing = components.get(ref) ?? { ref, value, targets: new Set<string>() };
    existing.targets.add(target);
    components.set(ref, existing);
  };
  for (const { target, wheels } of input.selections) {
    const { asset, sha256 } = target.interpreter;
    add(
      sha256,
      {
        type: 'platform',
        name: 'cpython',
        version: input.interpreter.python,
        purl: `pkg:github/astral-sh/python-build-standalone@${input.interpreter.release}?file_name=${encodeURIComponent(asset)}`,
        hashes: [{ alg: 'SHA-256', content: sha256 }],
        licenses: [{ expression: 'PSF-2.0' }],
        externalReferences: [{ type: 'distribution', url: interpreterUrl(input.interpreter.release, asset) }],
      },
      target.key,
    );
    for (const { pin, file } of wheels) {
      const license = input.licenses.get(pin.name);
      add(
        file.sha256,
        {
          type: 'library',
          name: pin.name,
          version: pin.version,
          purl: `pkg:pypi/${normalizeName(pin.name)}@${pin.version}?file_name=${encodeURIComponent(file.filename)}`,
          hashes: [{ alg: 'SHA-256', content: file.sha256 }],
          ...(license === undefined ? {} : { licenses: [{ license: { name: license } }] }),
          externalReferences: [{ type: 'distribution', url: file.url }],
        },
        target.key,
      );
    }
    for (const worker of input.workers) {
      const { hex } = integrityToHex(worker.integrity);
      add(
        hex,
        {
          type: 'file',
          name: `tau-worker/${worker.name}`,
          hashes: [{ alg: 'SHA-256', content: hex }],
          licenses: [{ expression: 'Apache-2.0' }],
        },
        target.key,
      );
    }
  }
  const bom = {
    bomFormat: 'CycloneDX',
    specVersion: '1.6',
    version: 1,
    metadata: {
      component: {
        type: 'application',
        'bom-ref': packageName,
        name: packageName,
        description: 'The native Build123d runtime closure: CPython, the pinned wheels and the Tau worker scripts.',
      },
    },
    components: [...components.values()]
      .toSorted((left, right) => (left.ref < right.ref ? -1 : 1))
      .map(({ ref, value, targets }) => ({
        'bom-ref': ref,
        ...value,
        properties: [...targets].toSorted().map((target) => ({ name: 'taucad:target', value: target })),
      })),
  };
  return `${JSON.stringify(bom, undefined, 2)}\n`;
};

const readGolden = async (): Promise<Golden> => {
  try {
    return JSON.parse(await readFile(goldenPath, 'utf8')) as Golden;
  } catch {
    return {};
  }
};

const renderGolden = (golden: Golden): string =>
  `${JSON.stringify(
    Object.fromEntries(Object.entries(golden).toSorted(([left], [right]) => (left < right ? -1 : 1))),
    undefined,
    2,
  )}\n`;

// Goldens whose closure the manifest still declares; one for a closure no longer declared describes nothing.
const currentGolden = async (
  deployment: PluginDeployment,
  golden: Golden,
): Promise<{ kept: Golden; stale: string[] }> => {
  const declared = new Map<string, string>();
  for (const variant of deployment.dependencies[dependencyName] ?? []) {
    declared.set(targetKey(variant.target), await computeClosureIntegrity(variant.payloads));
  }
  const kept: Record<string, Golden[string]> = {};
  const stale: string[] = [];
  for (const [key, entry] of Object.entries(golden)) {
    if (declared.get(key) === entry.closureIntegrity) {
      kept[key] = entry;
    } else {
      stale.push(key);
    }
  }
  return { kept, stale };
};

const runGenerate = async (check: boolean, seed: string): Promise<void> => {
  const { files, deployment } = await generate(seed);
  const golden = await readGolden();
  const { kept, stale } = await currentGolden(deployment, golden);
  if (stale.length > 0) {
    files.set(goldenPath, renderGolden(kept));
  }
  const differing: string[] = [];
  for (const [path, text] of files) {
    const current = existsSync(path) ? await readFile(path, 'utf8') : undefined;
    if (current === text) {
      continue;
    }
    if (check) {
      differing.push(path.slice(repoRoot.length + 1));
    } else {
      await writeFile(path, text);
      console.log(`wrote ${path.slice(repoRoot.length + 1)}`);
    }
  }
  if (stale.length > 0) {
    console.log(
      `The golden receipts for ${stale.join(', ')} describe a closure the manifest no longer declares; run \`pnpm nx run build123d:golden-tau-plugin\` on each of those hosts.`,
    );
  }
  if (differing.length > 0) {
    throw new Error(
      `These generated files differ from what the generator produces now:\n  ${differing.join('\n  ')}\nRun pnpm nx run build123d:generate-tau-plugin and commit the result.`,
    );
  }
  if (check) {
    console.log('tau-plugin.json, the pylock files, the SBOM and the golden receipts are current.');
  }
};

const readManifest = async (): Promise<PluginDeployment> =>
  parsePluginDeployment(JSON.parse(await readFile(manifestPath, 'utf8')) as unknown, `${packageName} tau-plugin.json`);

const hostVariant = (deployment: PluginDeployment, key?: string): DependencyVariant => {
  const variants = deployment.dependencies[dependencyName] ?? [];
  if (key !== undefined) {
    const variant = variants.find(({ target }) => targetKey(target) === key);
    if (variant === undefined) {
      throw new Error(
        `${packageName} declares no ${key} variant; declared: ${variants.map(({ target }) => targetKey(target)).join(', ')}`,
      );
    }
    return variant;
  }
  const indicators = detectHostIndicators();
  if (indicators === undefined) {
    throw new Error(`No native variant can run on ${process.platform}-${process.arch}.`);
  }
  const selection = selectVariant(variants, indicators);
  if (selection.status !== 'selected') {
    throw new Error(`${packageName} declares no variant for this host (failing axis: ${selection.axis}).`);
  }
  return selection.variant;
};

/** Fill the seed with one variant's third-party payloads; the worker scripts come from the package itself. */
const runSeed = async (seed: string, key?: string): Promise<void> => {
  const variant = hostVariant(await readManifest(), key);
  const remote = variant.payloads.filter((payload) => payload.origin.kind === 'url');
  await mapConcurrent(remote, downloadConcurrency, async (payload) => {
    const { hex } = integrityToHex(payload.integrity);
    if (payload.origin.kind !== 'url') {
      return;
    }
    await verifiedBlob(seed, {
      url: payload.origin.urls[0],
      sha256: hex,
      byteLength: payload.byteLength,
      label: payload.name,
    });
  });
  console.log(`seed ${seed} holds every ${targetKey(variant.target)} payload (${String(remote.length)} blobs).`);
};

/** Prepare this host's variant from the seed, sandbox and seal included, and record its golden receipt. */
const runGolden = async (seed: string, storeOption?: string): Promise<void> => {
  const deployment = await readManifest();
  const variant = hostVariant(deployment);
  const store = storeOption ?? (await mkdtemp(join(tmpdir(), 'tau-build123d-golden-')));
  try {
    const host = createPreparationHost({
      plugins: [
        {
          package: packageName,
          deployment,
          directory: packageRoot,
          seal: sealBuild123dClosure,
          launchSet: build123dLaunchSet,
        },
      ],
      store,
      seed,
    });
    const outcome = await host.prepare({
      package: packageName,
      offline: true,
      signal: AbortSignal.timeout(30 * 60 * 1000),
    });
    host.dispose();
    if (outcome.status !== 'ready') {
      throw new Error(
        `Preparing ${targetKey(variant.target)} from ${seed} ended ${outcome.status}: ${JSON.stringify(outcome)}`,
      );
    }
    const receipt = outcome.receipts[dependencyName]!;
    const entry = {
      closureIntegrity: receipt.closureIntegrity,
      treeIntegrity: receipt.treeIntegrity,
      fileCount: receipt.files.length,
      byteLength: receipt.files.reduce((sum, file) => sum + file.byteLength, 0),
    };
    const golden = await readGolden();
    await writeFile(goldenPath, renderGolden({ ...golden, [targetKey(variant.target)]: entry }));
    console.log(`golden ${targetKey(variant.target)} ${JSON.stringify(entry)}`);
  } finally {
    if (storeOption === undefined) {
      await rm(store, { recursive: true, force: true });
    }
  }
};

const run = async (): Promise<void> => {
  const options = parseArguments();
  switch (options.mode) {
    case 'seed': {
      await runSeed(options.seed, options.target);
      return;
    }
    case 'golden': {
      await runGolden(options.seed, options.store);
      return;
    }
    default: {
      await runGenerate(options.check, options.seed);
    }
  }
};

await run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
