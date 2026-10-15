// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { composeManifest, layerPayload, manifestText, picogkLayerRecordSchema } from '#picogk-layer.js';
import type { PicogkLayerRecord } from '#picogk-layer.js';

const record: PicogkLayerRecord = {
  schemaVersion: 2,
  target: 'darwin-arm64',
  asset: 'tau-picogk-layer-darwin-arm64.tar.gz',
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
const manifest = JSON.parse(readFileSync(resolve(import.meta.dirname, '../tau-plugin.json'), 'utf8')) as Record<
  string,
  unknown
>;

describe('picogk layer record', () => {
  it('pins the layer by its digest at the CDN key and the release named after it', () => {
    expect(layerPayload(record)).toEqual({
      name: 'worker',
      integrity: `sha256-${Buffer.from(record.sha256, 'hex').toString('base64')}`,
      byteLength: 40_000_000,
      format: 'tar.gz',
      origin: {
        kind: 'url',
        urls: [
          `https://cdn.tau.new/blobs/sha256/${record.sha256}`,
          'https://github.com/taucad/tau/releases/download/picogk-layer-0123456789abcdef/tau-picogk-layer-darwin-arm64.tar.gz',
        ],
      },
      destination: 'tau-worker',
      unpackedByteLength: 120_000_000,
    });
  });

  it('rewrites only the worker pin and keeps the rest of the manifest', () => {
    const composed = composeManifest(manifest, record);
    const text = manifestText(composed);

    expect(text).toContain(`"https://cdn.tau.new/blobs/sha256/${record.sha256}"`);
    expect(text).toContain('builds.dotnet.microsoft.com/dotnet/Runtime/10.0.11/');
    expect(manifestText(composeManifest(composed, record))).toBe(text);
    expect(manifestText(manifest)).not.toBe(text);
  });

  it('refuses a manifest without a darwin-arm64 worker payload', () => {
    expect(() => composeManifest({ dependencies: {} }, record)).toThrow(/no darwin-arm64 runtime variant/u);
    expect(() =>
      composeManifest(
        { dependencies: { runtime: [{ target: { runtime: 'native', os: 'darwin', arch: 'arm64' }, payloads: {} }] } },
        record,
      ),
    ).toThrow(/worker payload/u);
  });

  it('accepts only a complete darwin-arm64 record', () => {
    expect(picogkLayerRecordSchema.parse(record)).toEqual(record);
    expect(() => picogkLayerRecordSchema.parse({ ...record, extra: true })).toThrow();
    expect(() => picogkLayerRecordSchema.parse({ ...record, sha256: 'ABC' })).toThrow();
  });
});
