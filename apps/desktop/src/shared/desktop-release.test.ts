import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import type {
  DesktopArtifact,
  DesktopArtifactKind,
  DesktopArtifactManifest,
  DesktopAcceptanceReceipt,
} from '#shared/desktop-release.js';
import {
  desktopArchiveName,
  desktopArtifactKinds,
  desktopArtifactName,
  desktopReleaseBaseUrl,
  desktopReleaseIdentity,
  parseDesktopAcceptanceReceipt,
  parseDesktopArtifactManifest,
  stagingPackageVersion,
} from '#shared/desktop-release.js';

describe('desktop release identity', () => {
  it('should preserve numeric order across bundle version rollovers', () => {
    expect([15, 99, 100, 9999, 10_000].map((sequence) => stagingPackageVersion(sequence))).toEqual([
      '1.0.15',
      '1.0.99',
      '1.1.0',
      '1.99.99',
      '2.0.0',
    ]);
    for (const sequence of [0, -1, 1.5, Number.NaN, 99_990_000]) {
      expect(() => stagingPackageVersion(sequence)).toThrow(TypeError);
    }
  });

  it('should distinguish source version from staging distribution version', () => {
    expect(desktopReleaseIdentity('desktop-staging@0.0.1-staging.15')).toEqual({
      channel: 'staging',
      version: '1.0.15',
    });
    expect(desktopReleaseIdentity('desktop@0.1.0')).toEqual({ channel: 'production', version: '0.1.0' });
    for (const tag of ['desktop@1.100.0', 'desktop@1.2.3/other', 'desktop-staging@0.1.0-staging.0']) {
      expect(() => desktopReleaseIdentity(tag)).toThrow(TypeError);
    }
  });
});

const sourceCommit = 'a'.repeat(40);
const sha256 = 'b'.repeat(64);
const sha512 = 'A'.repeat(86) + '==';
const stagingTag = 'desktop-staging@0.1.0-staging.102';
const artifact = (kind: DesktopArtifactKind, target: DesktopArtifact['target'], tag = stagingTag): DesktopArtifact => {
  const identity = desktopReleaseIdentity(tag);
  const arch = target === 'darwin-arm64' ? 'arm64' : 'x64';
  const spec = desktopArtifactKinds[kind];
  return {
    target,
    kind,
    name: desktopArtifactName({ kind, ...identity, arch }),
    format: spec.format,
    roles: [...spec.roles],
    sha256,
    sha512,
    size: 1024,
  };
};
const manifest = (artifacts = [artifact('macos-zip', 'darwin-arm64')], tag = stagingTag): DesktopArtifactManifest => ({
  schemaVersion: 1,
  tag,
  ...desktopReleaseIdentity(tag),
  sourceCommit,
  artifacts,
});
const receipt = (): DesktopAcceptanceReceipt => ({
  schemaVersion: 1,
  status: 'passed',
  tag: stagingTag,
  ...desktopReleaseIdentity(stagingTag),
  sourceCommit,
  target: 'darwin-arm64',
  route: 'macos-zip',
  artifacts: [{ name: 'Tau-macos-arm64.zip', sha256 }],
  baseline: { version: '1.1.1', artifactSha256: 'c'.repeat(64) },
  installed: { version: '1.1.2', executableSha256: 'd'.repeat(64) },
  environment: { os: 'macOS 26', arch: 'arm64', kind: 'ci', sandbox: 'enabled' },
  trust: { kind: 'test', identity: 'ephemeral fixture key' },
  checks: { cleanInstall: true, upgrade: true, dataPreserved: true },
  suite: 'installed-upgrade-v1',
  logs: 'acceptance/log.txt',
});

describe('desktop artifact contract', () => {
  it('should preserve deployed archive names and immutable Mac origin paths', () => {
    expect(desktopArchiveName('darwin', 'arm64')).toBe('Tau-macos-arm64.zip');
    expect(desktopArchiveName('darwin', 'x64')).toBe('Tau-macos-x64.zip');
    expect(desktopArchiveName('win32', 'x64')).toBe('Tau-win32-x64.zip');
    expect(desktopArchiveName('linux', 'x64')).toBe('Tau-linux-x64.tar.gz');
    expect(desktopReleaseBaseUrl('desktop@0.1.0')).toBe('https://downloads.tau.new/releases/desktop%400.1.0');
    expect(desktopReleaseBaseUrl(stagingTag)).toBe(
      'https://downloads.taucad.dev/releases/desktop-staging%400.1.0-staging.102',
    );
  });

  it('should admit staging subsets without mutating their input', () => {
    const input = manifest();
    const before = structuredClone(input);
    expect(parseDesktopArtifactManifest(input)).toEqual(input);
    expect(input).toEqual(before);
    expect(parseDesktopArtifactManifest(input)).not.toBe(input);
  });

  it('should require every production target while keeping legacy archives valid', () => {
    const tag = 'desktop@0.2.0';
    const full = manifest(
      [
        artifact('macos-zip', 'darwin-arm64', tag),
        artifact('macos-zip', 'darwin-x64', tag),
        artifact('windows-zip', 'win32-x64', tag),
        artifact('linux-tar', 'linux-x64', tag),
      ],
      tag,
    );
    expect(parseDesktopArtifactManifest(full)).toEqual(full);
    expect(() => parseDesktopArtifactManifest({ ...full, artifacts: full.artifacts.slice(0, 3) })).toThrow(
      new TypeError('Production artifact manifests require every supported target'),
    );
  });

  it('should bind installer roles and require complete Mac and APT route artifacts', () => {
    const complete = manifest([
      artifact('macos-zip', 'darwin-arm64'),
      artifact('macos-dmg', 'darwin-arm64'),
      artifact('windows-nsis', 'win32-x64'),
      artifact('linux-appimage', 'linux-x64'),
      artifact('linux-deb-runtime', 'linux-x64'),
      artifact('linux-deb-selector', 'linux-x64'),
    ]);
    expect(parseDesktopArtifactManifest(complete)).toEqual(complete);
    expect(() => parseDesktopArtifactManifest(manifest([artifact('macos-dmg', 'darwin-arm64')]))).toThrow(
      new TypeError('Mac DMG requires the existing ZIP update artifact'),
    );
    expect(() => parseDesktopArtifactManifest(manifest([artifact('linux-deb-selector', 'linux-x64')]))).toThrow(
      new TypeError('APT requires both the runtime and selector artifacts'),
    );
    expect(complete.artifacts.at(-2)?.name).toBe('tau-staging-runtime-1.1.2_1.1.2_amd64.deb');
    expect(complete.artifacts.at(-1)?.name).toBe('tau-staging_1.1.2_amd64.deb');
  });

  it.each([
    { schemaVersion: 2 },
    { channel: 'production' },
    { version: '1.1.3' },
    { sourceCommit: 'untrusted' },
    { extraAuthority: 'allow' },
    { artifacts: [] },
  ])('should reject malformed or contradictory manifest data: %j', (change) => {
    expect(() => parseDesktopArtifactManifest({ ...manifest(), ...change })).toThrow();
  });

  it.each([
    { target: 'linux-arm64' },
    { target: 'win32-x64' },
    { format: 'dmg' },
    { roles: ['installer'] },
    { roles: ['archive', 'archive'] },
    { name: '../Tau-macos-arm64.zip' },
    { sha256: 'b'.repeat(63) },
    { sha512: 'A'.repeat(88) },
    { size: 0 },
    { extraAuthority: true },
  ])('should reject invalid artifact identity or bytes: %j', (change) => {
    const original = artifact('macos-zip', 'darwin-arm64');
    expect(() => parseDesktopArtifactManifest({ ...manifest(), artifacts: [{ ...original, ...change }] })).toThrow();
  });

  it('should reject untrusted filename inputs before constructing a path', () => {
    expect(() =>
      desktopArtifactName({ kind: 'linux-deb-runtime', channel: 'staging', version: '../escape', arch: 'x64' }),
    ).toThrow(z.ZodError);
    expect(() =>
      desktopArtifactName({ kind: 'windows-nsis', channel: 'staging', version: '1.1.2', arch: 'arm64' }),
    ).toThrow(new TypeError('Windows and Linux artifacts require x64'));
  });

  it('should reject duplicate artifacts instead of double counting completeness', () => {
    const original = artifact('macos-zip', 'darwin-arm64');
    expect(() => parseDesktopArtifactManifest(manifest([original, original]))).toThrow(
      new TypeError('Duplicate desktop artifact'),
    );
  });
});

describe('desktop installed acceptance receipt', () => {
  it('should retain test trust and CI identity without implying VM or release qualification', () => {
    const result = parseDesktopAcceptanceReceipt(receipt(), manifest());
    expect(result.trust).toEqual({ kind: 'test', identity: 'ephemeral fixture key' });
    expect(result.environment).toEqual({ os: 'macOS 26', arch: 'arm64', kind: 'ci', sandbox: 'enabled' });
  });

  it.each([
    { schemaVersion: 2 },
    { tag: 'desktop@1.1.2' },
    { channel: 'production' },
    { version: '1.1.3' },
    { sourceCommit: 'c'.repeat(40) },
    { target: 'darwin-x64' },
    { route: 'windows-nsis' },
    { artifacts: [{ name: 'Tau-macos-arm64.zip', sha256: 'a'.repeat(64) }] },
    { artifacts: [{ name: 'Tau-macos-x64.zip', sha256 }] },
    {
      artifacts: [
        { name: 'Tau-macos-arm64.zip', sha256 },
        { name: 'Tau-macos-arm64.zip', sha256 },
      ],
    },
    { installed: { version: '1.1.1', executableSha256: sha256 } },
    { baseline: { version: '1.1.1', artifactSha256: sha256 } },
    { baseline: { version: '1.1.2', artifactSha256: sha256 } },
    { baseline: { version: '1.1.3', artifactSha256: sha256 } },
    { checks: { cleanInstall: true, upgrade: false, dataPreserved: true } },
    { environment: { os: 'macOS', arch: 'arm64', kind: 'ci', sandbox: 'disabled' } },
  ])('should reject mismatched or incomplete installed evidence: %j', (change) => {
    expect(() => parseDesktopAcceptanceReceipt({ ...receipt(), ...change }, manifest())).toThrow();
  });

  it('should reject unknown receipt fields at the runtime boundary', () => {
    expect(() => parseDesktopAcceptanceReceipt({ ...receipt(), publicPromotion: true }, manifest())).toThrow(
      z.ZodError,
    );
  });

  it('should bind both APT packages and reject a selector-only proof', () => {
    const artifacts = [artifact('linux-deb-runtime', 'linux-x64'), artifact('linux-deb-selector', 'linux-x64')];
    const proof = {
      ...receipt(),
      target: 'linux-x64',
      route: 'linux-apt',
      environment: { os: 'Ubuntu 24.04', arch: 'x64', kind: 'ci', sandbox: 'enabled' },
      artifacts: artifacts.map(({ name, sha256: hash }) => ({ name, sha256: hash })),
    };
    expect(parseDesktopAcceptanceReceipt(proof, manifest(artifacts)).artifacts).toEqual(proof.artifacts);
    expect(() =>
      parseDesktopAcceptanceReceipt({ ...proof, artifacts: proof.artifacts.slice(1) }, manifest(artifacts)),
    ).toThrow(new TypeError('Acceptance receipt artifacts disagree with candidate route'));
  });
});
