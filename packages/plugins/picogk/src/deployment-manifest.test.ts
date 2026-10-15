// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { parsePluginDeployment, targetKey } from '@taucad/runtime/preparation/node';
import type { DependencyPayload } from '@taucad/runtime/preparation/node';
import { describe, expect, it } from 'vitest';

import { picogkKernel } from '#picogk.kernel.js';
import { layerUrls } from '#picogk-layer.js';

const text = readFileSync(resolve(import.meta.dirname, '../tau-plugin.json'), 'utf8');
const deployment = parsePluginDeployment(JSON.parse(text), '@taucad/picogk tau-plugin.json');
const variants = deployment.dependencies['runtime'] ?? [];
const payload = (name: string, key: string): DependencyPayload => {
  const variant = variants.find(({ target }) => targetKey(target) === key);
  const found = variant?.payloads.find((candidate) => candidate.name === name);
  if (found === undefined) {
    throw new Error(`No ${name} payload for ${key}`);
  }
  return found;
};
const hex = (integrity: string): string =>
  Buffer.from(integrity.slice(integrity.indexOf('-') + 1), 'base64').toString('hex');

describe('tau-plugin.json', () => {
  it('parses as schema v1', () => {
    expect(deployment.schemaVersion).toBe(1);
  });

  it('declares the kernel the plugin registers', () => {
    const { id, extensions } = picogkKernel({
      workerExecutable: '/closure/dotnet/dotnet',
      workerSha256: '0'.repeat(64),
      resourceFiles: [{ path: '/closure/tau-worker/PicoGK.dll', sha256: '0'.repeat(64), label: 'PicoGK' }],
    });

    expect(deployment.kernels).toEqual({ [id]: { requires: ['runtime'], extensions } });
  });

  it('pins darwin-arm64 only until a Linux engine builder exists, at the engine floor', () => {
    expect(variants.map(({ target }) => target)).toEqual([
      { runtime: 'native', os: 'darwin', arch: 'arm64', minimumOsVersion: '14.0' },
    ]);
  });

  it("pins Microsoft's runtime archive verbatim from its publisher", () => {
    const dotnet = payload('dotnet', 'darwin-arm64');

    expect(dotnet).toMatchObject({ format: 'tar.gz', destination: 'dotnet' });
    expect(dotnet.stripComponents).toBeUndefined();
    expect(dotnet.integrity.startsWith('sha512-')).toBe(true);
    expect(hex(dotnet.integrity)).toHaveLength(128);
    expect(dotnet.origin).toEqual({
      kind: 'url',
      urls: [
        expect.stringMatching(
          /^https:\/\/builds\.dotnet\.microsoft\.com\/dotnet\/Runtime\/(?<version>[\d.]+)\/dotnet-runtime-\k<version>-osx-arm64\.tar\.gz$/u,
        ),
      ],
    });
  });

  it('addresses the Tau layer by its digest on the CDN and on its immutable release', () => {
    const worker = payload('worker', 'darwin-arm64');
    const sha256 = hex(worker.integrity);

    expect(worker).toMatchObject({ format: 'tar.gz', destination: 'tau-worker' });
    expect(worker.integrity.startsWith('sha256-')).toBe(true);
    expect(worker.origin).toEqual({
      kind: 'url',
      urls: layerUrls({ sha256, asset: 'tau-picogk-layer-darwin-arm64.tar.gz' }),
    });
  });
});
