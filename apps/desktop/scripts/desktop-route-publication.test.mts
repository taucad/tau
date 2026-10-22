#!/usr/bin/env node
/**
 * Purpose: Prove new-route promotion refuses unqualified, mismatched or unapproved candidates.
 * Environment: Node; ephemeral test signing key only, no external publication.
 * Usage: pnpm nx run desktop:test-route-publication
 * Exit: nonzero on weakened qualification or descriptor authentication.
 */
import assert from 'node:assert/strict';
import { generateKeyPairSync, verify } from 'node:crypto';
import { z } from 'zod';
import {
  desktopArtifactKinds,
  desktopArtifactName,
  desktopReleaseIdentity,
  parseDesktopArtifactManifest,
} from '#shared/desktop-release.js';
import type { DesktopArtifactKind } from '#shared/desktop-release.js';
/* oxlint-disable no-restricted-imports -- Test the publication gate itself. */
import {
  createDesktopInstallerCatalog,
  createDesktopRouteDescriptor,
  desktopManifestDigest,
  qualifyDesktopRoutes,
} from './desktop-route-publication.mjs';
/* oxlint-enable no-restricted-imports */

const tag = 'desktop-staging@0.1.0-staging.102';
const identity = desktopReleaseIdentity(tag);
const artifact = (kind: DesktopArtifactKind) => ({
  kind,
  target: kind.startsWith('windows') ? 'win32-x64' : 'linux-x64',
  name: desktopArtifactName({ ...identity, kind, arch: 'x64' }),
  ...desktopArtifactKinds[kind],
  sha256: 'a'.repeat(64),
  sha512: Buffer.alloc(64, 1).toString('base64'),
  size: 123,
});
// Platform belongs to the catalog definition, not the wire artifact.
const wireArtifact = (kind: DesktopArtifactKind) => {
  const { platform: _platform, ...entry } = artifact(kind);
  return entry;
};
const manifest = parseDesktopArtifactManifest({
  schemaVersion: 1,
  tag,
  ...identity,
  sourceCommit: 'b'.repeat(40),
  artifacts: [wireArtifact('windows-nsis'), wireArtifact('windows-zip')],
});
const receipt = (environment: 'ci' | 'vm') => ({
  schemaVersion: 1,
  status: 'passed',
  tag,
  ...identity,
  sourceCommit: manifest.sourceCommit,
  target: 'win32-x64',
  route: 'windows-nsis',
  artifacts: [{ name: manifest.artifacts[0]!.name, sha256: manifest.artifacts[0]!.sha256 }],
  baseline: { version: '1.1.1', artifactSha256: 'c'.repeat(64) },
  installed: { version: identity.version, executableSha256: 'd'.repeat(64) },
  environment: { os: 'Windows11', arch: 'x64', kind: environment, sandbox: 'enabled' },
  trust: { kind: 'release', identity: 'CN=Expected publisher' },
  checks: { cleanInstall: true, upgrade: true, dataPreserved: true },
  suite: 'installedA-to-B',
  logs: 'artifact://test-evidence',
});
const receipts = [receipt('ci'), receipt('vm')];
const trust = { 'windows-nsis': 'CN=Expected publisher' };
const approval = {
  schemaVersion: 1,
  tag,
  ...identity,
  sourceCommit: manifest.sourceCommit,
  manifestSha256: desktopManifestDigest(manifest),
  approved: true,
};
const catalog = createDesktopInstallerCatalog({ manifest, receipts, trust, approval });
assert.equal(catalog.routes[0]!.route, 'windows-nsis');
assert.equal(catalog.routes[0]!.artifacts.length, 2);
for (const proofs of [
  [],
  [receipt('ci')],
  [...receipts, receipt('vm')],
  [{ ...receipt('ci'), trust: { kind: 'test', identity: trust['windows-nsis'] } }, receipt('vm')],
  [{ ...receipt('ci'), sourceCommit: 'f'.repeat(40) }, receipt('vm')],
]) {
  assert.throws(() => qualifyDesktopRoutes(manifest, proofs, trust));
}
assert.throws(() => qualifyDesktopRoutes(manifest, receipts, { 'windows-nsis': 'CN=Other publisher' }));
assert.throws(() =>
  createDesktopInstallerCatalog({
    manifest,
    receipts,
    trust,
    approval: { ...approval, manifestSha256: '0'.repeat(64) },
  }),
);
assert.throws(() =>
  createDesktopInstallerCatalog({ manifest, receipts, trust, approval: { ...approval, approved: false } }),
);
assert.throws(() => qualifyDesktopRoutes({ ...manifest, artifacts: [manifest.artifacts[0]] }, receipts, trust));
const issuedAt = '2026-10-21T00:00:00.000Z';
const windows = createDesktopRouteDescriptor({ manifest, route: 'windows-nsis', issuedAt });
assert.equal((windows as { keyId: string }).keyId, 'authenticode');
const appimage = parseDesktopArtifactManifest({
  ...manifest,
  artifacts: [
    wireArtifact('linux-appimage'),
    wireArtifact('linux-appimage-deb-runtime'),
    wireArtifact('linux-appimage-deb-selector'),
    wireArtifact('linux-tar'),
  ],
});
const key = generateKeyPairSync('ed25519');
const privateKey = key.privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
const signed = createDesktopRouteDescriptor({
  manifest: appimage,
  route: 'linux-appimage',
  issuedAt,
  keyId: 'test-ephemeral',
  privateKey,
}) as { descriptor: string; signature: string };
assert.ok(
  verify(null, Buffer.from(signed.descriptor, 'base64'), key.publicKey, Buffer.from(signed.signature, 'base64')),
);
assert.equal(JSON.parse(Buffer.from(signed.descriptor, 'base64').toString()).expiresAt, '2026-10-28T00:00:00.000Z');
assert.throws(() =>
  createDesktopRouteDescriptor({ manifest: appimage, route: 'linux-appimage', issuedAt, keyId: 'test-ephemeral' }),
);
const renewed = createDesktopRouteDescriptor({
  manifest: appimage,
  route: 'linux-appimage',
  issuedAt: '2026-10-22T00:00:00.000Z',
  keyId: 'test-ephemeral',
  privateKey,
}) as typeof signed;
const old = z.record(z.string(), z.unknown()).parse(JSON.parse(Buffer.from(signed.descriptor, 'base64').toString()));
const next = z.record(z.string(), z.unknown()).parse(JSON.parse(Buffer.from(renewed.descriptor, 'base64').toString()));
assert.deepEqual(
  { ...old, issuedAt: next['issuedAt'], expiresAt: next['expiresAt'] },
  next,
  'Renewal must retain exact candidate identity',
);
console.log('Route qualification and descriptor signing checks passed');

// A complete production candidate must prove both Mac migration paths and both Linux routes.
const productionTag = 'desktop@0.2.0';
const productionIdentity = desktopReleaseIdentity(productionTag);
const productionArtifacts = [
  ['macos-zip', 'darwin-arm64'],
  ['macos-dmg', 'darwin-arm64'],
  ['macos-zip', 'darwin-x64'],
  ['macos-dmg', 'darwin-x64'],
  ['windows-zip', 'win32-x64'],
  ['windows-nsis', 'win32-x64'],
  ['linux-tar', 'linux-x64'],
  ['linux-deb-runtime', 'linux-x64'],
  ['linux-deb-selector', 'linux-x64'],
  ['linux-appimage', 'linux-x64'],
  ['linux-appimage-deb-runtime', 'linux-x64'],
  ['linux-appimage-deb-selector', 'linux-x64'],
].map(([kind, target]) => {
  const definition = desktopArtifactKinds[kind as DesktopArtifactKind];
  return {
    kind,
    target,
    format: definition.format,
    roles: [...definition.roles],
    name: desktopArtifactName({
      ...productionIdentity,
      kind: kind as DesktopArtifactKind,
      arch: target!.endsWith('arm64') ? 'arm64' : 'x64',
    }),
    sha256: 'a'.repeat(64),
    sha512: Buffer.alloc(64, 1).toString('base64'),
    size: 123,
  };
});
const production = parseDesktopArtifactManifest({
  schemaVersion: 1,
  tag: productionTag,
  ...productionIdentity,
  sourceCommit: manifest.sourceCommit,
  artifacts: productionArtifacts,
});
const requirements = [
  { route: 'macos-zip', target: 'darwin-arm64', kinds: ['macos-zip'] },
  { route: 'macos-dmg', target: 'darwin-arm64', kinds: ['macos-zip', 'macos-dmg'] },
  { route: 'macos-zip', target: 'darwin-x64', kinds: ['macos-zip'] },
  { route: 'macos-dmg', target: 'darwin-x64', kinds: ['macos-zip', 'macos-dmg'] },
  { route: 'windows-nsis', target: 'win32-x64', kinds: ['windows-nsis'] },
  { route: 'linux-apt', target: 'linux-x64', kinds: ['linux-deb-runtime', 'linux-deb-selector'] },
  {
    route: 'linux-appimage',
    target: 'linux-x64',
    kinds: ['linux-appimage', 'linux-appimage-deb-runtime', 'linux-appimage-deb-selector'],
  },
];
const productionTrust = {
  'macos-zip': 'TEAM',
  'macos-dmg': 'TEAM',
  'windows-nsis': 'CN=Expected publisher',
  'linux-apt': 'fingerprint',
  'linux-appimage': 'ed25519-key',
};
const productionReceipts = requirements.flatMap((requirement) =>
  ['ci', 'vm'].map((environment) => ({
    ...receipt('ci'),
    tag: productionTag,
    ...productionIdentity,
    route: requirement.route,
    target: requirement.target,
    artifacts: production.artifacts
      .filter((artifact) => artifact.target === requirement.target && requirement.kinds.includes(artifact.kind))
      .map(({ name, sha256 }) => ({ name, sha256 })),
    baseline: { version: '0.1.0', artifactSha256: 'c'.repeat(64) },
    installed: { version: '0.2.0', executableSha256: 'd'.repeat(64) },
    environment: {
      os: 'qualified fixture',
      arch: requirement.target.endsWith('arm64') ? 'arm64' : 'x64',
      kind: environment,
      sandbox: 'enabled',
    },
    trust: { kind: 'release', identity: productionTrust[requirement.route as keyof typeof productionTrust] },
  })),
);
assert.equal(qualifyDesktopRoutes(production, productionReceipts, productionTrust).routes.length, 5);
for (const remove of [
  (proof: (typeof productionReceipts)[number]) => proof.target === 'darwin-x64',
  (proof: (typeof productionReceipts)[number]) => proof.route === 'macos-dmg',
  (proof: (typeof productionReceipts)[number]) => proof.route === 'linux-appimage',
]) {
  assert.throws(() =>
    qualifyDesktopRoutes(
      production,
      productionReceipts.filter((proof) => !remove(proof)),
      productionTrust,
    ),
  );
}
assert.throws(() =>
  qualifyDesktopRoutes(
    production,
    [
      { ...productionReceipts[0], artifacts: [{ name: 'Tau-macos-arm64.zip', sha256: 'e'.repeat(64) }] },
      ...productionReceipts.slice(1),
    ],
    productionTrust,
  ),
);
assert.throws(() =>
  qualifyDesktopRoutes(
    { ...production, artifacts: production.artifacts.filter((artifact) => artifact.kind !== 'linux-appimage') },
    productionReceipts,
    productionTrust,
  ),
);
