// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { parsePluginDeployment, selectVariant, targetKey } from '@taucad/runtime/preparation/node';
import type {
  DependencyPayload,
  DependencyTarget,
  HostIndicators,
  SelectVariantOptions,
} from '@taucad/runtime/preparation/node';
import { describe, expect, it } from 'vitest';

import { picogkKernel } from '#picogk.kernel.js';
import { composeSbom, layerUrls } from '#picogk-layer.js';

const text = readFileSync(resolve(import.meta.dirname, '../tau-plugin.json'), 'utf8');
const sbomText = readFileSync(resolve(import.meta.dirname, '../tau-plugin.cdx.json'), 'utf8');
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
    const { id, extensions } = picogkKernel();

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

const nearestOf = (target: DependencyTarget | undefined): string => (target === undefined ? 'none' : targetKey(target));

const answer = (host: Omit<HostIndicators, 'translated' | 'wasm'>, options?: SelectVariantOptions): string => {
  const selection = selectVariant(variants, { translated: false, wasm: { threads: false }, ...host }, options);
  return selection.status === 'selected'
    ? `${targetKey(selection.variant.target)}${selection.emulated ? ' (emulated)' : ''}`
    : `unsupported ${selection.axis}, nearest ${nearestOf(selection.nearest)}`;
};

// Total over the declared targets (charter W14): darwin-arm64 alone until a Tau engine builder exists for another
// target (D13); every other host refuses before any download, naming the axis.
describe('tau-plugin.json targets', () => {
  it('should declare darwin-arm64 on macOS 14 alone', () => {
    expect(variants.map(({ target }) => target)).toEqual([
      { runtime: 'native', os: 'darwin', arch: 'arm64', minimumOsVersion: '14.0' },
    ]);
  });

  it.each<{
    readonly name: string;
    readonly host: Omit<HostIndicators, 'translated' | 'wasm'>;
    readonly options?: SelectVariantOptions;
    readonly expected: string;
  }>([
    {
      name: 'macOS 14 on Apple silicon',
      host: { os: 'darwin', arch: 'arm64', osVersion: '14.0' },
      expected: 'darwin-arm64',
    },
    {
      name: 'macOS 13 on Apple silicon',
      host: { os: 'darwin', arch: 'arm64', osVersion: '13.7' },
      expected: 'unsupported minimumOsVersion, nearest darwin-arm64',
    },
    {
      name: 'an Intel Mac',
      host: { os: 'darwin', arch: 'x64', osVersion: '26.0' },
      expected: 'unsupported arch, nearest darwin-arm64',
    },
    {
      name: 'glibc Linux',
      host: { os: 'linux', arch: 'x64', libc: 'glibc', libcVersion: '2.39' },
      expected: 'unsupported os, nearest darwin-arm64',
    },
    {
      name: 'musl Linux',
      host: { os: 'linux', arch: 'arm64', libc: 'musl' },
      expected: 'unsupported os, nearest darwin-arm64',
    },
    {
      name: 'win32-arm64',
      host: { os: 'win32', arch: 'arm64', osVersion: '10.0.26100' },
      expected: 'unsupported os, nearest darwin-arm64',
    },
    {
      name: 'macOS forced to linux-x64-glibc, which PicoGK does not declare',
      host: { os: 'darwin', arch: 'arm64', osVersion: '26.0' },
      options: { target: 'linux-x64-glibc' },
      expected: 'unsupported os, nearest darwin-arm64',
    },
  ])('should answer $name as declared', ({ host, options, expected }) => {
    expect(answer(host, options)).toBe(expected);
  });
});

describe('tau-plugin.cdx.json', () => {
  it('ships the SBOM the manifest derives: a purl, the pinned hash and every URL per payload (D26)', () => {
    const sbom = JSON.parse(sbomText) as {
      readonly specVersion: string;
      readonly components: ReadonlyArray<{
        readonly name: string;
        readonly purl: string;
        readonly hashes: ReadonlyArray<{ readonly alg: string; readonly content: string }>;
        readonly externalReferences: ReadonlyArray<{ readonly type: string; readonly url: string }>;
      }>;
    };
    const pinned = variants.flatMap((variant) => variant.payloads);

    expect(sbom).toEqual(composeSbom(JSON.parse(text) as Record<string, unknown>));
    expect(sbom.specVersion).toBe('1.6');
    expect(
      sbom.components.map(({ name, purl, hashes, externalReferences }) => ({
        name,
        purl: purl.split('@')[0],
        hash: hashes[0]?.content,
        urls: externalReferences.map(({ url }) => url),
      })),
    ).toEqual(
      expect.arrayContaining(
        pinned.map((payload) => ({
          name: payload.name === 'dotnet' ? 'dotnet-runtime' : 'tau-picogk-layer',
          purl: payload.name === 'dotnet' ? 'pkg:generic/microsoft/dotnet-runtime' : 'pkg:github/taucad/tau',
          hash: hex(payload.integrity),
          urls: payload.origin.kind === 'url' ? payload.origin.urls : [],
        })),
      ),
    );
  });
});
