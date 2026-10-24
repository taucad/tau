// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDotnetLayer, manifestText, payloadKey, runComposeTauPlugin } from '#layer.js';
import type { DotnetLayer, DotnetLayerRecord } from '#layer.js';

const layer: DotnetLayer = {
  name: 'sample',
  package: '@taucad/sample',
  displayName: 'Sample',
  description:
    "The native Sample runtime closure: Microsoft's .NET runtime archive and the Tau framework-dependent layer.",
  targets: ['darwin-arm64', 'linux-x64'],
};
const rule = createDotnetLayer(layer);

const record: DotnetLayerRecord = {
  schemaVersion: 2,
  target: 'darwin-arm64',
  asset: 'tau-sample-layer-darwin-arm64.tar.gz',
  sha256: '0123456789abcdef'.repeat(4),
  byteLength: 40_000_000,
  unpackedByteLength: 120_000_000,
  fileCount: 48,
  protocolVersion: 8,
  dotnetRuntimeVersion: '10.0.11',
  readyToRun: true,
  sourceFilesSha256: 'f'.repeat(64),
  nativeSourceSha256: 'e'.repeat(64),
  toolchain: {
    dotnetSdk: '10.0.400',
    compiler: 'Apple clang version 17.0.0 (clang-1700.6.3.2)',
    sdk: '26.2',
    cmake: 'cmake version 4.4.4',
    ninja: '1.13.2',
  },
};

const dotnetUrl = 'https://builds.dotnet.microsoft.com/dotnet/Runtime/10.0.11/dotnet-runtime-10.0.11-osx-arm64.tar.gz';
const variant = (os: string, arch: string, worker = true): Record<string, unknown> => ({
  target: { runtime: 'native', os, arch },
  payloads: [
    {
      name: 'dotnet',
      integrity: `sha512-${Buffer.alloc(64, 1).toString('base64')}`,
      origin: { kind: 'url', urls: [dotnetUrl] },
    },
    ...(worker
      ? [
          {
            name: 'worker',
            integrity: `sha256-${Buffer.alloc(32, 2).toString('base64')}`,
            origin: { kind: 'url', urls: [] },
          },
        ]
      : []),
  ],
});
// The Linux variant pins only the runtime here, so the darwin-arm64 record is the one layer the SBOM describes.
const manifest = {
  schemaVersion: 1,
  dependencies: { runtime: [variant('darwin', 'arm64'), variant('linux', 'x64', false)] },
};

describe('createDotnetLayer', () => {
  it('should pin a layer by its digest at the CDN key and at the release named after it', () => {
    expect(rule.releaseTag(record.sha256)).toBe('sample-layer-0123456789abcdef');
    expect(rule.payload(record)).toEqual({
      name: 'worker',
      integrity: `sha256-${Buffer.from(record.sha256, 'hex').toString('base64')}`,
      byteLength: 40_000_000,
      format: 'tar.gz',
      origin: {
        kind: 'url',
        urls: [
          `https://cdn.tau.new/${payloadKey(record.sha256)}`,
          'https://github.com/taucad/tau/releases/download/sample-layer-0123456789abcdef/tau-sample-layer-darwin-arm64.tar.gz',
        ],
      },
      destination: 'tau-worker',
      unpackedByteLength: 120_000_000,
    });
  });

  it("should rewrite only the record target's worker pin and keep the rest of the manifest", () => {
    const composed = rule.composeManifest(manifest, record);
    const { runtime } = composed['dependencies'] as { runtime: Array<{ payloads: unknown[] }> };

    expect(runtime[0]?.payloads[1]).toEqual(rule.payload(record));
    expect(runtime[1]).toEqual(variant('linux', 'x64', false));
    expect(manifestText(rule.composeManifest(composed, record))).toBe(manifestText(composed));
    expect(manifest.dependencies.runtime[0]).toEqual(variant('darwin', 'arm64'));
  });

  it('should refuse a manifest without a worker payload for the record target', () => {
    expect(() => rule.composeManifest({ dependencies: {} }, record)).toThrow(/no darwin-arm64 runtime variant/u);
    expect(() =>
      rule.composeManifest(
        { dependencies: { runtime: [{ target: { runtime: 'native', os: 'darwin', arch: 'arm64' }, payloads: {} }] } },
        record,
      ),
    ).toThrow(/worker payload/u);
  });

  it('should add a staged variant with the worker pin when the manifest has none for the record target', () => {
    const linux = { ...record, target: 'linux-x64', asset: 'tau-sample-layer-linux-x64.tar.gz' };
    const darwinOnly = { schemaVersion: 1, dependencies: { runtime: [variant('darwin', 'arm64')] } };
    const staged = { 'linux-x64': variant('linux', 'x64', false) };

    const composed = rule.composeManifest(darwinOnly, linux, staged);
    const { runtime } = composed['dependencies'] as { runtime: Array<{ payloads: unknown[] }> };

    expect(runtime).toEqual([
      variant('darwin', 'arm64'),
      {
        ...variant('linux', 'x64', false),
        payloads: [...(variant('linux', 'x64', false)['payloads'] as unknown[]), rule.payload(linux)],
      },
    ]);
    expect(manifestText(rule.composeManifest(composed, linux, staged))).toBe(manifestText(composed));
    expect(darwinOnly.dependencies.runtime).toHaveLength(1);
  });

  it('should prefer the manifest variant to a staged one and refuse a staged variant of another target', () => {
    const linux = { ...record, target: 'linux-x64', asset: 'tau-sample-layer-linux-x64.tar.gz' };
    const staged = { 'linux-x64': variant('linux', 'x64', false) };
    const pinned = {
      schemaVersion: 1,
      dependencies: { runtime: [variant('darwin', 'arm64'), variant('linux', 'x64')] },
    };
    const { runtime } = rule.composeManifest(pinned, linux, staged)['dependencies'] as { runtime: unknown[] };

    expect(runtime).toHaveLength(2);
    expect(() =>
      rule.composeManifest({ dependencies: { runtime: [] } }, linux, {
        'linux-x64': variant('darwin', 'arm64', false),
      }),
    ).toThrow(/staged linux-x64 variant names another target/u);
    expect(() => rule.composeManifest({ dependencies: { runtime: [] } }, record, staged)).toThrow(
      /no darwin-arm64 runtime variant/u,
    );
  });

  it("should accept only a complete record whose asset is its target's archive", () => {
    const linux = { ...record, target: 'linux-x64', asset: 'tau-sample-layer-linux-x64.tar.gz' };

    expect(rule.recordSchema.parse(record)).toEqual(record);
    expect(rule.recordSchema.parse(linux)).toEqual(linux);
    expect(() => rule.recordSchema.parse({ ...record, extra: true })).toThrow();
    expect(() => rule.recordSchema.parse({ ...record, sha256: 'ABC' })).toThrow();
    expect(() => rule.recordSchema.parse({ ...record, target: 'win32-x64' })).toThrow();
    expect(() => rule.recordSchema.parse({ ...record, asset: 'tau-sample-layer-linux-x64.tar.gz' })).toThrow();
  });

  it('should describe the runtime archive and the layer in the SBOM, naming the SBOM inside the layer', () => {
    const sbom = rule.composeSbom(rule.composeManifest(manifest, record));
    const components = sbom['components'] as Array<Record<string, unknown>>;

    expect(sbom['metadata']).toEqual({
      component: {
        type: 'application',
        'bom-ref': '@taucad/sample',
        name: '@taucad/sample',
        description: layer.description,
      },
    });
    expect(components.map(({ name, version }) => `${String(name)}@${String(version)}`).toSorted()).toEqual([
      'dotnet-runtime@10.0.11',
      'dotnet-runtime@10.0.11',
      'tau-sample-layer@sample-layer-0123456789abcdef',
    ]);
    expect(components.find(({ type }) => type === 'library')?.['properties']).toEqual([
      { name: 'taucad:target', value: 'darwin-arm64' },
      { name: 'taucad:sbom', value: 'tau-worker/tau-sample-sbom.cdx.json' },
    ]);
  });

  it('should refuse to describe a worker payload this rule did not publish', () => {
    expect(() => rule.composeSbom(manifest)).toThrow('does not describe the worker payload');
  });
});

describe('runComposeTauPlugin', () => {
  let directory: string | undefined;

  afterEach(async () => {
    vi.restoreAllMocks();
    if (directory !== undefined) {
      await rm(directory, { recursive: true, force: true });
    }
  });

  const setUp = async (): Promise<{ manifestPath: string; recordPath: string }> => {
    directory = await mkdtemp(join(tmpdir(), 'tau-dotnet-layer-'));
    const manifestPath = join(directory, 'tau-plugin.json');
    const recordPath = join(directory, 'tau-layer.json');
    await writeFile(manifestPath, manifestText(manifest));
    await writeFile(recordPath, JSON.stringify(record));
    return { manifestPath, recordPath };
  };

  it('should rewrite the manifest and its SBOM, then pass its own check', async () => {
    const { manifestPath, recordPath } = await setUp();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(runComposeTauPlugin({ layer, manifestPath, args: ['--layer', recordPath, '--check'] })).resolves.toBe(
      1,
    );
    await expect(runComposeTauPlugin({ layer, manifestPath, args: ['--layer', recordPath] })).resolves.toBe(0);
    await expect(runComposeTauPlugin({ layer, manifestPath, args: ['--layer', recordPath, '--check'] })).resolves.toBe(
      0,
    );

    const written = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, unknown>;
    expect(written).toEqual(rule.composeManifest(manifest, record));
    expect(JSON.parse(await readFile(join(directory ?? '', 'tau-plugin.cdx.json'), 'utf8'))).toEqual(
      rule.composeSbom(written),
    );
  });

  it('should print the release outputs and refuse an archive the record does not pin', async () => {
    const { manifestPath, recordPath } = await setUp();
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const archive = join(directory ?? '', 'layer.tar.gz');
    await writeFile(archive, 'not the layer');

    await expect(
      runComposeTauPlugin({
        layer,
        manifestPath,
        args: ['--layer', recordPath, '--write', join(directory ?? '', 'out.json'), '--outputs'],
      }),
    ).resolves.toBe(0);
    expect(log.mock.calls[0]?.[0]).toContain('tag=sample-layer-0123456789abcdef');
    await expect(
      runComposeTauPlugin({ layer, manifestPath, args: ['--layer', recordPath, '--archive', archive] }),
    ).resolves.toBe(1);
    await expect(runComposeTauPlugin({ layer, manifestPath, args: ['--check'] })).resolves.toBe(2);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('Usage: compose-tau-plugin.mts'));
  });

  it('should compose a target the manifest does not pin from the staged variants file', async () => {
    const { manifestPath } = await setUp();
    const linux = { ...record, target: 'linux-x64', asset: 'tau-sample-layer-linux-x64.tar.gz' };
    // The darwin-arm64 worker is a published layer, so the SBOM describes every payload.
    const darwinOnly = rule.composeManifest(
      { schemaVersion: 1, dependencies: { runtime: [variant('darwin', 'arm64')] } },
      record,
    );
    const staged = { 'linux-x64': variant('linux', 'x64', false) };
    const recordPath = join(directory ?? '', 'linux-layer.json');
    const stagedVariantsPath = join(directory ?? '', 'tau-plugin.variants.json');
    await writeFile(manifestPath, manifestText(darwinOnly));
    await writeFile(recordPath, JSON.stringify(linux));
    await writeFile(stagedVariantsPath, manifestText(staged));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(runComposeTauPlugin({ layer, manifestPath, args: ['--layer', recordPath] })).resolves.toBe(1);
    await expect(
      runComposeTauPlugin({ layer, manifestPath, stagedVariantsPath, args: ['--layer', recordPath] }),
    ).resolves.toBe(0);

    expect(JSON.parse(await readFile(manifestPath, 'utf8'))).toEqual(rule.composeManifest(darwinOnly, linux, staged));
  });
});
